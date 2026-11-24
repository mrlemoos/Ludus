import { STOCKFISH_VERSION, analyseMatch } from './analysis';
import { Chess } from 'chess.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

class AnalysisWorker {
  static instances: AnalysisWorker[] = [];
  static stall = false;
  onmessage?: (event: { data: string }) => void;
  onerror?: () => void;
  fen = new Chess().fen();
  terminate = vi.fn();
  postMessage = vi.fn((message: string) => {
    if (message === 'uci') {
      queueMicrotask(() => this.onmessage?.({ data: 'uciok' }));
    }
    if (message === 'isready' && !AnalysisWorker.stall) {
      queueMicrotask(() => this.onmessage?.({ data: 'readyok' }));
    }
    if (message.startsWith('position fen ')) {
      this.fen = message.slice(13);
    }
    if (message.startsWith('go ')) {
      queueMicrotask(() => {
        const move = new Chess(this.fen).moves({ verbose: true })[0];
        const uci = move.from + move.to + (move.promotion ?? '');
        this.onmessage?.({ data: `info depth 12 score cp 10 nodes 1000 pv ${uci}` });
        this.onmessage?.({ data: `bestmove ${uci}` });
      });
    }
  });
  constructor() {
    AnalysisWorker.instances.push(this);
  }
}
afterEach(() => {
  AnalysisWorker.instances = [];
  AnalysisWorker.stall = false;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const match = {
  id: 'game',
  moves: ['e4', 'e5', 'Nf3'],
  result: { reason: 'resignation' },
  colour: 'w' as const,
};
describe('post-game analysis worker lifecycle', () => {
  it('analyses server-saved positions', async () => {
    // Arrange
    vi.stubGlobal('Worker', AnalysisWorker);

    // Act
    const lines = await analyseMatch(match, new AbortController().signal);

    // Assert
    expect(lines.map((line) => line.ply)).toEqual([0, 1, 2]);
  });

  it('reports analysis progress', async () => {
    // Arrange
    vi.stubGlobal('Worker', AnalysisWorker);
    const progress = vi.fn();

    // Act
    await analyseMatch(match, new AbortController().signal, progress);

    // Assert
    expect(progress).toHaveBeenLastCalledWith(3, 3);
  });

  it('terminates the worker when analysis completes', async () => {
    // Arrange
    vi.stubGlobal('Worker', AnalysisWorker);

    // Act
    await analyseMatch(match, new AbortController().signal);

    // Assert
    expect(AnalysisWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it('leaves the saved moves unchanged', async () => {
    // Arrange
    vi.stubGlobal('Worker', AnalysisWorker);

    // Act
    await analyseMatch(match, new AbortController().signal);

    // Assert
    expect(match.moves).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('never launches an analysis worker for a live game', async () => {
    // Arrange
    vi.stubGlobal('Worker', AnalysisWorker);

    // Act
    const pending = analyseMatch({ ...match, result: null }, new AbortController().signal);

    // Assert
    await expect(pending).rejects.toThrow('finished_match_required');
    expect(AnalysisWorker.instances).toHaveLength(0);
  });

  it('never launches an analysis worker for an aborted request', async () => {
    // Arrange
    vi.stubGlobal('Worker', AnalysisWorker);
    const abort = new AbortController();
    abort.abort();

    // Act
    const pending = analyseMatch(match, abort.signal);

    // Assert
    await expect(pending).rejects.toThrow('analysis_cancelled');
    expect(AnalysisWorker.instances).toHaveLength(0);
  });

  it('cancels stalled loading and clears timers', async () => {
    // Arrange
    vi.useFakeTimers();
    vi.stubGlobal('Worker', AnalysisWorker);
    AnalysisWorker.stall = true;
    const abort = new AbortController();
    const pending = analyseMatch(match, abort.signal);

    // Act
    abort.abort();

    // Assert
    await expect(pending).rejects.toThrow('analysis_cancelled');
    expect(AnalysisWorker.instances[0].terminate).toHaveBeenCalledWith();
    expect(vi.getTimerCount()).toBe(0);
  });
});

it('records the Stockfish version', () => {
  // Arrange

  // Act
  const version = STOCKFISH_VERSION;

  // Assert
  expect(version).toMatchInlineSnapshot(`"Stockfish 19 lite"`);
});
