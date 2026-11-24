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
  it('loads the single-threaded Stockfish worker', () => {
    // Arrange

    // Act
    const { worker } = ready();

    // Assert
    expect(worker.url).toBe('/engine/stockfish-19-lite-single.js');
  });

  it.each([1, 2, 3, 4] as Difficulty[])(
    'posts explicit strength %i to the worker',
    async (difficulty) => {
      // Arrange
      const { computer, worker } = ready();
      const settings = computerSettings[difficulty];
      const fen = new Chess().fen();

      // Act
      const pending = computer.move(fen, difficulty);
      await Promise.resolve();

      // Assert
      expect(worker.postMessage.mock.calls.map(([command]) => command)).toEqual([
        'uci',
        'isready',
        `setoption name Skill Level value ${settings.skill}`,
        `position fen ${fen}`,
        `go depth ${settings.depth} movetime ${settings.moveTimeMs}`,
      ]);
      worker.send('bestmove e2e4');
      await pending;
      computer.dispose();
    },
  );

  it.each([1, 2, 3, 4] as Difficulty[])(
    'returns the engine move at strength %i',
    async (difficulty) => {
      // Arrange
      const { computer, worker } = ready();
      const pending = computer.move(new Chess().fen(), difficulty);
      await Promise.resolve();
      worker.send('info depth 1');

      // Act
      worker.send('bestmove e2e4 ponder e7e5');
      const move = await pending;

      // Assert
      expect(move).toBe('e2e4');
      computer.dispose();
    },
  );

  it('terminates the worker after a completed move', async () => {
    // Arrange
    const { computer, worker } = ready();
    const pending = computer.move(new Chess().fen(), 1);
    await Promise.resolve();
    worker.send('bestmove e2e4 ponder e7e5');
    await pending;

    // Act
    computer.dispose();

    // Assert
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects an overlapping request', async () => {
    // Arrange
    const { computer, worker } = ready();
    const first = computer.move(new Chess().fen(), 1);
    await Promise.resolve();

    // Act
    const overlapping = computer.move(new Chess().fen(), 2);

    // Assert
    await expect(overlapping).rejects.toThrow('Engine busy');
    worker.send('bestmove e2e4');
    await first;
    computer.dispose();
  });

  it('keeps the first callback after an overlapping request is rejected', async () => {
    // Arrange
    const { computer, worker } = ready();
    const first = computer.move(new Chess().fen(), 1);
    await Promise.resolve();
    await computer.move(new Chess().fen(), 2).catch((error: unknown) => error);

    // Act
    worker.send('bestmove e2e4');
    const move = await first;

    // Assert
    expect(move).toBe('e2e4');
    computer.dispose();
  });

  it('rejects a stalled move and terminates the worker', async () => {
    // Arrange
    const { computer, worker } = ready();
    const first = computer.move(new Chess().fen(), 1);
    await Promise.resolve();
    const stalled = first.catch((error: unknown) => error);

    // Act
    await vi.advanceTimersByTimeAsync(15_000);
    const error = await stalled;

    // Assert
    expect(error).toEqual(new Error('Engine unavailable'));
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('ignores a late reply after the stalled worker is retired', async () => {
    // Arrange
    const { computer, worker } = ready();
    const first = computer.move(new Chess().fen(), 1);
    await Promise.resolve();
    const stalled = first.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    await stalled;
    worker.send('bestmove d2d4');

    // Act
    const retry = computer.move(new Chess().fen(), 2);

    // Assert
    await expect(retry).rejects.toThrow('Engine unavailable');
  });

  it('answers from a fresh worker after the stalled one is retired', async () => {
    // Arrange
    const { computer, worker } = ready();
    const first = computer.move(new Chess().fen(), 1);
    await Promise.resolve();
    const stalled = first.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    await stalled;
    worker.send('bestmove d2d4');
    await computer.move(new Chess().fen(), 2).catch((error: unknown) => error);
    const fresh = ready();
    const retry = fresh.computer.move(new Chess().fen(), 2);
    await Promise.resolve();

    // Act
    fresh.worker.send('bestmove d2d4');
    const move = await retry;

    // Assert
    expect(move).toBe('d2d4');
    fresh.computer.dispose();
  });

  it('rejects pending work when disposed', async () => {
    // Arrange
    const { computer } = ready();
    const pending = computer.move(new Chess().fen(), 1);
    await Promise.resolve();

    // Act
    computer.dispose();

    // Assert
    await expect(pending).rejects.toThrow('Engine unavailable');
  });
});
