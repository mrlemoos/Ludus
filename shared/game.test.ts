import { applyAction, chessFrom, connection, createGame, parseAction, remaining, settle } from './game';
import type { Game } from './game';
import { describe, expect, it } from 'vitest';

function start() { return connection(createGame('id', 'leo', '5+3', 1, 'w', 0), true, 0); }
function move(game: Game, uci: string, now = game.updatedAt + 1000) {
  return applyAction(
    game,
    {
      type: 'move',
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
      revision: game.revision,
    },
    now,
  );
}
function sequence(moves: string[]) {
  return moves.reduce((game, uci) => move(game, uci), start());
}
describe('authoritative computer matches', () => {
  it('charges elapsed time only to the mover and adds increment once', () => {
    const game = move(start(), 'e2e4', 2000);
    expect(game.clocks).toEqual({ w: 301_000, b: 300_000 });
    expect(remaining(game, 4000)).toEqual({ w: 301_000, b: 298_000 });
    expect(() =>
      applyAction(game, { type: 'move', from: 'e2', to: 'e4', revision: 0 }, 4000),
    ).toThrow('stale');
  });

  it('rejects illegal and out-of-turn moves without changing accepted state', () => {
    const game = start();
    expect(() => move(game, 'e2e5')).toThrow();
    expect(() => move(game, 'e7e5')).toThrow();
    expect(game.moves).toEqual([]);
  });

  it('finishes checkmate and cannot finalise twice', () => {
    const game = sequence(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(game.result).toEqual({ winner: 'b', reason: 'checkmate' });
    expect(settle(game, 1e9)).toBe(game);
    expect(() => move(game, 'a2a3')).toThrow('finished');
    expect(chessFrom(JSON.parse(JSON.stringify(game))).fen()).toBe(game.fen);
  });

  it('resignation awards the opponent and freezes clocks', () => {
    const game = applyAction(start(), { type: 'resign', revision: 0 }, 1000);
    expect(game.result).toEqual({ winner: 'b', reason: 'resignation' });
    expect(remaining(game, 1e9)).toEqual(game.clocks);
  });

  it('timeout takes priority over a late move, including the exact boundary', () => {
    expect(settle(start(), 299_999).result).toBeNull();
    expect(settle(start(), 300_000).result).toEqual({ winner: 'b', reason: 'timeout' });
    expect(() => move(start(), 'e2e4', 300_000)).toThrow('finished');
  });

  it('persists repetition history rather than rebuilding from FEN', () => {
    const game = sequence(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);
    expect(game.result).toBeNull();
    const claimed = applyAction(
      game,
      { type: 'claimDraw', revision: game.revision },
      game.updatedAt + 1,
    );
    expect(claimed.result?.reason).toBe('repetition');
    expect(chessFrom(game).isThreefoldRepetition()).toBe(true);
  });

  it('supports castling and en passant', () => {
    const castle = sequence(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1']);
    expect(chessFrom(castle).get('f1')?.type).toBe('r');
    const passant = sequence(['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6']);
    expect(chessFrom(passant).get('d5')).toBeUndefined();
    expect(passant.moves.at(-1)).toBe('exd6');
  });

  it('supports underpromotion', () => {
    const game = sequence([
      'a2a4',
      'h7h5',
      'a4a5',
      'h5h4',
      'a5a6',
      'h4h3',
      'a6b7',
      'h3g2',
      'b7a8n',
    ]);
    expect(chessFrom(game).get('a8')?.type).toBe('n');
  });

  it('resumes immediately and caps cumulative disconnect pauses at sixty seconds', () => {
    let game = connection(start(), false, 1000);
    expect(remaining(game, 31_000).w).toBe(299_000);
    game = connection(game, true, 31_000);
    expect(game.pauseUsed).toBe(30_000);
    game = connection(game, false, 32_000);
    expect(remaining(game, 72_000).w).toBe(288_000);
    game = connection(game, true, 72_000);
    expect(game.pauseUsed).toBe(60_000);
    game = connection(game, false, 73_000);
    expect(remaining(game, 74_000).w).toBe(286_000);
    expect(connection(game, false, 75_000)).toBe(game);
  });

  it('creates both time controls and all strengths independently of colour', () => {
    const game = createGame('id', 'leo', '10+5', 4, 'b', 0);
    expect(game.clocks).toEqual({ w: 600_000, b: 600_000 });
    expect(move(connection(game, true, 0), 'e2e4').clocks.w).toBe(604_000);
    expect(game.colour).toBe('b');
  });

  it.each([
    null,
    {},
    { type: 'move', from: 'a9', to: 'a1', revision: 0 },
    { type: 'move', from: 'a7', to: 'a8', promotion: 'k', revision: 0 },
    { type: 'resign', revision: -1 },
    { type: 'resign', revision: 0.5 },
  ])('rejects malformed actions %j', (input) =>{  expect(parseAction(input)).toBeNull(); });
});

describe('approved computer draw policy', () => {
  it('automatically ends at fivefold, while threefold needs a claim', () => {
    const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const game = sequence([...cycle, ...cycle, ...cycle, ...cycle]);
    expect(game.result).toEqual({ winner: null, reason: 'fivefold' });
  });

  it('rejects premature and off-turn claims without mutating state', () => {
    const game = start();
    expect(() => applyAction(game, { type: 'claimDraw', revision: 0 }, 1)).toThrow(
      'draw_not_claimable',
    );
    expect(game.result).toBeNull();
    expect(game.moves).toEqual([]);
  });
});
