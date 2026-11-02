import { computerSettings } from '../shared/computer';
import type { Difficulty } from '../shared/game';
import { Computer } from './engine';
import { Chess } from 'chess.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeWorker {
  static instance: FakeWorker;
  onmessage?: (event: { data: string }) => void;
  onerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor(public url: string) {
    FakeWorker.instance = this;
  }
  send(data: string) {
    this.onmessage?.({ data });
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function ready() {
  const computer = new Computer();
  const worker = FakeWorker.instance;
  worker.send('uciok');
  worker.send('readyok');
  return { computer, worker };
}
describe('browser computer worker', () => {
  it.each([1, 2, 3, 4] as Difficulty[])(
    'uses explicit strength %i and returns the engine move',
    async (difficulty) => {
      const { computer, worker } = ready();
      expect(worker.url).toBe('/engine/stockfish-19-lite-single.js');
      const pending = computer.move(new Chess().fen(), difficulty);
      await Promise.resolve();
      const settings = computerSettings[difficulty];
      expect(worker.postMessage.mock.calls.map(([command]) => command)).toEqual([
        'uci',
        'isready',
        `setoption name Skill Level value ${settings.skill}`,
        `position fen ${new Chess().fen()}`,
        `go depth ${settings.depth} movetime ${settings.moveTimeMs}`,
      ]);
      worker.send('info depth 1');
      worker.send('bestmove e2e4 ponder e7e5');
      await expect(pending).resolves.toBe('e2e4');
      computer.dispose();
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects overlapping requests without replacing the first callback', async () => {
    const { computer, worker } = ready();
    const first = computer.move(new Chess().fen(), 1);
    await Promise.resolve();
    await expect(computer.move(new Chess().fen(), 2)).rejects.toThrow('Engine busy');
    worker.send('bestmove e2e4');
    await expect(first).resolves.toBe('e2e4');
    computer.dispose();
  });

  it('retires a stalled worker so late replies cannot answer a new request', async () => {
    const { computer, worker } = ready();
    const first = computer.move(new Chess().fen(), 1);
    const rejected = expect(first).rejects.toThrow('Engine unavailable');
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    worker.send('bestmove d2d4');
    await expect(computer.move(new Chess().fen(), 2)).rejects.toThrow('Engine unavailable');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    const fresh = ready();
    const retry = fresh.computer.move(new Chess().fen(), 2);
    await Promise.resolve();
    fresh.worker.send('bestmove d2d4');
    await expect(retry).resolves.toBe('d2d4');
    fresh.computer.dispose();
  });

  it('rejects pending work when disposed', async () => {
    const { computer } = ready();
    const pending = computer.move(new Chess().fen(), 1);
    await Promise.resolve();
    computer.dispose();
    await expect(pending).rejects.toThrow('Engine unavailable');
  });
});
