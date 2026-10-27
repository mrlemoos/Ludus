import type { Difficulty } from '../shared/game';

export class Computer {
  private worker: Worker;
  private ready: Promise<void>;
  private pending: { resolve: (move: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  constructor() {
    this.worker = new Worker('/engine/stockfish-19-lite-single.js');
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Engine load timed out')), 30_000);
      this.worker.onmessage = ({ data }) => {
        const line = String(data);
        if (line === 'uciok') this.worker.postMessage('isready');
        if (line === 'readyok') { clearTimeout(timer); resolve(); }
        if (line.startsWith('bestmove ') && this.pending) {
          clearTimeout(this.pending.timer);
          this.pending.resolve(line.split(' ')[1]); this.pending = null;
        }
      };
      this.worker.onerror = () => { clearTimeout(timer); reject(new Error('Engine failed')); this.fail(); };
      this.worker.postMessage('uci');
    });
  }
  async move(fen: string, difficulty: Difficulty): Promise<string> {
    await this.ready;
    if (this.pending) throw new Error('Engine busy');
    const settings = { 1: [0, 3, 100], 2: [4, 6, 250], 3: [10, 10, 500], 4: [20, 16, 1200] }[difficulty];
    this.worker.postMessage(`setoption name Skill Level value ${settings[0]}`);
    this.worker.postMessage(`position fen ${fen}`);
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, timer: setTimeout(() => this.fail(), 15_000) };
      this.worker.postMessage(`go depth ${settings[1]} movetime ${settings[2]}`);
    });
  }
  private fail() { if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new Error('Engine unavailable')); this.pending = null; } }
  dispose() { this.fail(); this.worker.terminate(); }
}
