import { computerSettings } from '../shared/computer';
import type { Difficulty } from '../shared/game';

export class Computer {
  private worker: Worker;
  private ready: Promise<void>;
  private unavailable = false;
  private pending: {
    resolve: (move: string) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  constructor() {
    this.worker = new Worker('/engine/stockfish-19-lite-single.js');
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Engine load timed out')), 30_000);
      this.worker.onmessage = ({ data }) => {
        const line = String(data);
        if (line === 'uciok') this.worker.postMessage('isready');
        if (line === 'readyok') {
          clearTimeout(timer);
          resolve();
        }
        if (line.startsWith('bestmove ') && this.pending) {
          clearTimeout(this.pending.timer);
          this.pending.resolve(line.split(' ')[1]);
          this.pending = null;
        }
      };
      this.worker.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Engine failed'));
        this.fail();
      };
      this.worker.postMessage('uci');
    });
  }
  async move(fen: string, difficulty: Difficulty): Promise<string> {
    await this.ready;
    if (this.unavailable) throw new Error('Engine unavailable');
    if (this.pending) throw new Error('Engine busy');
    const settings = computerSettings[difficulty];
    this.worker.postMessage(`setoption name Skill Level value ${settings.skill}`);
    this.worker.postMessage(`position fen ${fen}`);
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, timer: setTimeout(() => this.fail(), 15_000) };
      this.worker.postMessage(`go depth ${settings.depth} movetime ${settings.moveTimeMs}`);
    });
  }
  private fail() {
    this.unavailable = true;
    this.worker.terminate();
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error('Engine unavailable'));
      this.pending = null;
    }
  }
  dispose() {
    this.fail();
  }
}
