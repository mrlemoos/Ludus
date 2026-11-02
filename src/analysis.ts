import { STOCKFISH_ENGINE_VERSION, positionAt, validateAnalysis } from '../shared/coaching';
import type { AnalysisLine, SavedCoachMatch } from '../shared/coaching';
import { Chess } from 'chess.js';

export const STOCKFISH_VERSION = STOCKFISH_ENGINE_VERSION;

export function parseEngineInfo(
  line: string,
  ply: number,
  fen = new Chess().fen(),
): AnalysisLine | null {
  const depth = /\bdepth (\d+)\b/.exec(line);
    const nodes = /\bnodes (\d+)\b/.exec(line);
    const score = /\bscore (cp|mate) (-?\d+)\b/.exec(line);
    const pv = /\bpv (.+)$/.exec(line);
  if (!depth || !nodes || !score || !pv || /\b(lowerbound|upperbound)\b/.test(line)) {return null;}
  const moves = pv[1].trim().split(/\s+/).slice(0, 8);
  if (!moves.every((move) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))) {return null;}
  return {
    ply,
    fen,
    engineVersion: STOCKFISH_VERSION,
    perspective: 'side-to-move',
    depth: Number(depth[1]),
    nodes: Number(nodes[1]),
    cp: score[1] === 'cp' ? Number(score[2]) : null,
    mate: score[1] === 'mate' ? Number(score[2]) : null,
    moves,
    variations: [moves],
  };
}
export function analysisPlies(moveCount: number): number[] {
  if (!Number.isInteger(moveCount) || moveCount < 1 || moveCount > 2000)
    {throw new Error('invalid_match');}
  const count = Math.min(moveCount, 40);
  return Array.from({ length: count }, (_, i) =>
    count === 1 ? 0 : Math.round((i * (moveCount - 1)) / (count - 1)),
  );
}
export async function analyseMatch(
  match: SavedCoachMatch,
  signal: AbortSignal,
  progress?: (done: number, total: number) => void,
): Promise<AnalysisLine[]> {
  if (!match.result) {throw new Error('finished_match_required');}
  if (signal.aborted) {throw new Error('analysis_cancelled');}
  const positions = analysisPlies(match.moves.length);
  const worker = new Worker('/engine/stockfish-19-lite-single.js');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectCurrent: ((error: Error) => void) | null = null;
  function cancel() {
    rejectCurrent?.(new Error('analysis_cancelled'));
    worker.terminate();
  }
  signal.addEventListener('abort', cancel, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      rejectCurrent = reject;
      timer = setTimeout(() =>{  reject(new Error('engine_unavailable')); }, 30_000);
      worker.onerror = () => {
        clearTimeout(timer);
        reject(new Error('engine_unavailable'));
      };
      worker.onmessage = ({ data }) => {
        if (String(data) === 'uciok') {worker.postMessage('isready');}
        if (String(data) === 'readyok') {
          clearTimeout(timer);
          resolve();
        }
      };
      worker.postMessage('uci');
    });
    worker.postMessage('setoption name Skill Level value 20');
    const lines: AnalysisLine[] = [];
    for (const [index, ply] of positions.entries()) {
      if (signal.aborted) {throw new Error('analysis_cancelled');}
      const chess: Chess = positionAt(match.moves, ply);
      const line = await new Promise<AnalysisLine>((resolve, reject) => {
        rejectCurrent = reject;
        let best: AnalysisLine | null = null;
        timer = setTimeout(() =>{  reject(new Error('engine_unavailable')); }, 15_000);
        worker.onerror = () => {
          clearTimeout(timer);
          reject(new Error('engine_unavailable'));
        };
        worker.onmessage = ({ data }) => {
          const text = String(data);
            const next = parseEngineInfo(text, ply, chess.fen());
          if (next) {best = next;}
          if (text.startsWith('bestmove ')) {
            clearTimeout(timer);
            if (best) {resolve(best);}
            else {reject(new Error('engine_analysis_missing'));}
          }
        };
        worker.postMessage(`position fen ${chess.fen()}`);
        worker.postMessage('go depth 12 movetime 250');
      });
      lines.push(line);
      progress?.(index + 1, positions.length);
    }
    const checked = validateAnalysis(match, lines);
    if (!checked) {throw new Error('invalid_engine_analysis');}
    return checked;
  } finally {
    clearTimeout(timer);
    rejectCurrent = null;
    signal.removeEventListener('abort', cancel);
    worker.terminate();
  }
}
