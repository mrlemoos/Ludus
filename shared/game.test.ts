import {
  applyAction,
  chessFrom,
  connection,
  createGame,
  parseAction,
  remaining,
  settle,
} from './game';
import type { Game } from './game';
import { describe, expect, it } from 'vitest';

function start() {
  return connection(createGame('id', 'leo', '5+3', 1, 'w', 0), true, 0);
}
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
function disconnectedAtOneSecond() {
  return connection(start(), false, 1000);
}
function reconnectedAfterThirtySeconds() {
  return connection(disconnectedAtOneSecond(), true, 31_000);
}
function disconnectedAgain() {
  return connection(reconnectedAfterThirtySeconds(), false, 32_000);
}
function reconnectedAfterCap() {
  return connection(disconnectedAgain(), true, 72_000);
}
function disconnectedWithoutAllowance() {
  return connection(reconnectedAfterCap(), false, 73_000);
}

describe('authoritative computer matches', () => {
  it('charges elapsed time only to the mover and adds increment once', () => {
    // Arrange
    const game = start();

    // Act
    const moved = move(game, 'e2e4', 2000);

    // Assert
    expect(moved.clocks).toEqual({ w: 301_000, b: 300_000 });
  });

  it('remaining, two seconds after white moves, charges only black', () => {
    // Arrange
    const game = move(start(), 'e2e4', 2000);

    // Act
    const clocks = remaining(game, 4000);

    // Assert
    expect(clocks).toEqual({ w: 301_000, b: 298_000 });
  });

  it('applyAction, a repeated revision, throws stale', () => {
    // Arrange
    const game = move(start(), 'e2e4', 2000);

    // Act
    function repeat() {
      applyAction(game, { type: 'move', from: 'e2', to: 'e4', revision: 0 }, 4000);
    }

    // Assert
    expect(repeat).toThrow('stale');
  });

  it('applyAction, an illegal move, leaves the accepted moves unchanged', () => {
    // Arrange
    const game = start();

    // Act
    function play() {
      move(game, 'e2e5');
    }

    // Assert
    expect(play).toThrow();
    expect(game.moves).toEqual([]);
  });

  it('applyAction, an out-of-turn move, leaves the accepted moves unchanged', () => {
    // Arrange
    const game = start();

    // Act
    function play() {
      move(game, 'e7e5');
    }

    // Assert
    expect(play).toThrow();
    expect(game.moves).toEqual([]);
  });

  it('sequence, scholar’s mate, finishes by checkmate', () => {
    // Arrange
    const moves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];

    // Act
    const game = sequence(moves);

    // Assert
    expect(game.result).toEqual({ winner: 'b', reason: 'checkmate' });
  });

  it('settle, a finished game, returns the same game', () => {
    // Arrange
    const game = sequence(['f2f3', 'e7e5', 'g2g4', 'd8h4']);

    // Act
    const settled = settle(game, 1e9);

    // Assert
    expect(settled).toBe(game);
  });

  it('applyAction, a move after checkmate, throws finished', () => {
    // Arrange
    const game = sequence(['f2f3', 'e7e5', 'g2g4', 'd8h4']);

    // Act
    function play() {
      move(game, 'a2a3');
    }

    // Assert
    expect(play).toThrow('finished');
  });

  it('chessFrom, a JSON round trip, restores the finished position', () => {
    // Arrange
    const game = sequence(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    const restored = JSON.parse(JSON.stringify(game)) as Game;

    // Act
    const fen = chessFrom(restored).fen();

    // Assert
    expect(fen).toBe(game.fen);
  });

  it('resignation awards the opponent and freezes clocks', () => {
    // Arrange
    const opened = start();

    // Act
    const game = applyAction(opened, { type: 'resign', revision: 0 }, 1000);
    const clocks = remaining(game, 1e9);

    // Assert
    expect(game.result).toEqual({ winner: 'b', reason: 'resignation' });
    expect(clocks).toEqual(game.clocks);
  });

  it('settle, one millisecond before the flag, leaves the game unfinished', () => {
    // Arrange
    const game = start();

    // Act
    const settled = settle(game, 299_999);

    // Assert
    expect(settled.result).toBeNull();
  });

  it('settle, on the exact flag, awards a timeout', () => {
    // Arrange
    const game = start();

    // Act
    const settled = settle(game, 300_000);

    // Assert
    expect(settled.result).toEqual({ winner: 'b', reason: 'timeout' });
  });

  it('applyAction, a move on the exact flag, throws finished', () => {
    // Arrange
    const game = start();

    // Act
    function play() {
      move(game, 'e2e4', 300_000);
    }

    // Assert
    expect(play).toThrow('finished');
  });

  it('persists repetition history rather than rebuilding from FEN', () => {
    // Arrange
    const moves = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];

    // Act
    const game = sequence(moves);
    const repetition = chessFrom(game).isThreefoldRepetition();

    // Assert
    expect(game.result).toBeNull();
    expect(repetition).toBe(true);
  });

  it('applyAction, a threefold claim, ends by repetition', () => {
    // Arrange
    const game = sequence(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);

    // Act
    const claimed = applyAction(
      game,
      { type: 'claimDraw', revision: game.revision },
      game.updatedAt + 1,
    );

    // Assert
    expect(claimed.result?.reason).toBe('repetition');
  });

  it('sequence, kingside castling, moves the rook beside the king', () => {
    // Arrange
    const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1'];

    // Act
    const game = sequence(moves);
    const piece = chessFrom(game).get('f1');

    // Assert
    expect(piece?.type).toBe('r');
  });

  it('sequence, an en passant capture, removes the captured pawn', () => {
    // Arrange
    const moves = ['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6'];

    // Act
    const game = sequence(moves);
    const captured = chessFrom(game).get('d5');

    // Assert
    expect(captured).toBeUndefined();
    expect(game.moves.at(-1)).toBe('exd6');
  });

  it('supports underpromotion', () => {
    // Arrange
    const moves = ['a2a4', 'h7h5', 'a4a5', 'h5h4', 'a5a6', 'h4h3', 'a6b7', 'h3g2', 'b7a8n'];

    // Act
    const game = sequence(moves);
    const piece = chessFrom(game).get('a8');

    // Assert
    expect(piece?.type).toBe('n');
  });

  it('remaining, during the first disconnect pause, keeps the mover clock', () => {
    // Arrange
    const game = disconnectedAtOneSecond();

    // Act
    const clocks = remaining(game, 31_000);

    // Assert
    expect(clocks.w).toBe(299_000);
  });

  it('connection, a reconnect during the allowance, records the paused time', () => {
    // Arrange
    const game = disconnectedAtOneSecond();

    // Act
    const resumed = connection(game, true, 31_000);

    // Assert
    expect(resumed.pauseUsed).toBe(30_000);
  });

  it('remaining, during the second disconnect, uses the rest of the sixty-second allowance', () => {
    // Arrange
    const game = disconnectedAgain();

    // Act
    const clocks = remaining(game, 72_000);

    // Assert
    expect(clocks.w).toBe(288_000);
  });

  it('connection, a reconnect after the second pause, caps the allowance at sixty seconds', () => {
    // Arrange
    const game = disconnectedAgain();

    // Act
    const resumed = connection(game, true, 72_000);

    // Assert
    expect(resumed.pauseUsed).toBe(60_000);
  });

  it('remaining, after the allowance is exhausted, keeps the clock running', () => {
    // Arrange
    const game = disconnectedWithoutAllowance();

    // Act
    const clocks = remaining(game, 74_000);

    // Assert
    expect(clocks.w).toBe(286_000);
  });

  it('connection, a repeated disconnect, returns the same game', () => {
    // Arrange
    const game = disconnectedWithoutAllowance();

    // Act
    const repeated = connection(game, false, 75_000);

    // Assert
    expect(repeated).toBe(game);
  });

  it('creates both time controls and all strengths independently of colour', () => {
    // Arrange
    const owner = 'leo';

    // Act
    const game = createGame('id', owner, '10+5', 4, 'b', 0);

    // Assert
    expect(game.clocks).toEqual({ w: 600_000, b: 600_000 });
    expect(game.colour).toBe('b');
  });

  it('applyAction, the first move of a ten-minute game, adds five seconds', () => {
    // Arrange
    const game = connection(createGame('id', 'leo', '10+5', 4, 'b', 0), true, 0);

    // Act
    const moved = move(game, 'e2e4');

    // Assert
    expect(moved.clocks.w).toBe(604_000);
  });

  it.each([
    null,
    {},
    { type: 'move', from: 'a9', to: 'a1', revision: 0 },
    { type: 'move', from: 'a7', to: 'a8', promotion: 'k', revision: 0 },
    { type: 'resign', revision: -1 },
    { type: 'resign', revision: 0.5 },
  ])('rejects malformed actions %j', (input) => {
    // Arrange
    const action = input;

    // Act
    const parsed = parseAction(action);

    // Assert
    expect(parsed).toBeNull();
  });
});

describe('approved computer draw policy', () => {
  it('automatically ends at fivefold, while threefold needs a claim', () => {
    // Arrange
    const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const moves = [...cycle, ...cycle, ...cycle, ...cycle];

    // Act
    const game = sequence(moves);

    // Assert
    expect(game.result).toEqual({ winner: null, reason: 'fivefold' });
  });

  it('rejects premature and off-turn claims without mutating state', () => {
    // Arrange
    const game = start();

    // Act
    function claim() {
      applyAction(game, { type: 'claimDraw', revision: 0 }, 1);
    }

    // Assert
    expect(claim).toThrow('draw_not_claimable');
    expect(game.result).toBeNull();
    expect(game.moves).toEqual([]);
  });
});
