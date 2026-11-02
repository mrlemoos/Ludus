import { analyseMatch } from './analysis';
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
    if (message === 'uci') queueMicrotask(() => this.onmessage?.({ data: 'uciok' }));
    if (message === 'isready' && !AnalysisWorker.stall)
      queueMicrotask(() => this.onmessage?.({ data: 'readyok' }));
    if (message.startsWith('position fen ')) this.fen = message.slice(13);
    if (message.startsWith('go '))
      queueMicrotask(() => {
        const move = new Chess(this.fen).moves({ verbose: true })[0];
        const uci = move.from + move.to + (move.promotion ?? '');
        this.onmessage?.({ data: `info depth 12 score cp 10 nodes 1000 pv ${uci}` });
        this.onmessage?.({ data: `bestmove ${uci}` });
      });
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
  it('analyses server-saved positions, reports progress and terminates on completion', async () => {
    vi.stubGlobal('Worker', AnalysisWorker);
    const progress = vi.fn();
    const lines = await analyseMatch(match, new AbortController().signal, progress);
    expect(lines.map((line) => line.ply)).toEqual([0, 1, 2]);
    expect(progress).toHaveBeenLastCalledWith(3, 3);
    expect(AnalysisWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(match.moves).toEqual(['e4', 'e5', 'Nf3']);
  });
  it('never launches an analysis worker for live games or an aborted request', async () => {
    vi.stubGlobal('Worker', AnalysisWorker);
    await expect(
      analyseMatch({ ...match, result: null }, new AbortController().signal),
    ).rejects.toThrow('finished_match_required');
    const abort = new AbortController();
    abort.abort();
    await expect(analyseMatch(match, abort.signal)).rejects.toThrow('analysis_cancelled');
    expect(AnalysisWorker.instances).toHaveLength(0);
  });
  it('cancels stalled loading and clears timers', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', AnalysisWorker);
    AnalysisWorker.stall = true;
    const abort = new AbortController(),
      pending = analyseMatch(match, abort.signal);
    abort.abort();
    await expect(pending).rejects.toThrow('analysis_cancelled');
    expect(AnalysisWorker.instances[0].terminate).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
