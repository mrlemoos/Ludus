import {
  RATED_ENABLED,
  RATED_GATE,
  applyHumanAction,
  createHumanGame,
  humanChess,
  humanColour,
  humanConnection,
  humanDrawClaim,
  humanOutcome,
  humanTiming,
  parseHumanAction,
  phraseIds,
  positionCount,
  possibleMate,
  reportCategories,
  settleHuman,
} from './human-game';
import type { HumanGame } from './human-game';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

function start() {
  return humanConnection(
    humanConnection(
      createHumanGame('id', { w: 'white', b: 'black' }, '5+3', false, 0),
      'w',
      true,
      0,
    ),
    'b',
    true,
    0,
  );
}
function move(game: HumanGame, uci: string, now = game.updatedAt + 1000) {
  return applyHumanAction(
    game,
    game.players[humanChess(game).turn()],
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
function bothPaused() {
  return humanConnection(humanConnection(start(), 'w', false, 1000), 'b', false, 21_000);
}
function bothResumed() {
  return humanConnection(humanConnection(bothPaused(), 'w', true, 71_000), 'b', true, 86_000);
}
function whitePaused() {
  return humanConnection(start(), 'w', false, 1000);
}
function whiteResumed() {
  return humanConnection(whitePaused(), 'w', true, 31_000);
}
function whitePausedAgain() {
  return humanConnection(whiteResumed(), 'w', false, 32_000);
}
function offeredDraw() {
  const game = sequence(['e2e4', 'e7e5']);
  return {
    game,
    offered: applyHumanAction(game, 'white', { type: 'offerDraw', revision: 2 }, game.updatedAt),
  };
}

describe('human game constants', () => {
  it('RATED_ENABLED, rated gate, matches the recorded snapshot', () => {
    // Arrange
    const enabled = RATED_ENABLED;

    // Act
    const recorded = enabled;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`false`);
  });

  it('RATED_GATE, rated explanation, matches the recorded snapshot', () => {
    // Arrange
    const gate = RATED_GATE;

    // Act
    const recorded = gate;

    // Assert
    expect(recorded).toMatchInlineSnapshot(
      `"Exact possible-mate timeout adjudication has not been certified."`,
    );
  });

  it('phraseIds, preset phrases, match the recorded snapshot', () => {
    // Arrange
    const phrases = phraseIds;

    // Act
    const recorded = phrases;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`
      [
        "hello",
        "goodLuck",
        "wellPlayed",
        "thanks",
        "goodGame",
      ]
    `);
  });

  it('reportCategories, report labels, match the recorded snapshot', () => {
    // Arrange
    const categories = reportCategories;

    // Act
    const recorded = categories;

    // Assert
    expect(recorded).toMatchInlineSnapshot(`
      [
        "assistance",
        "presetSpam",
        "other",
      ]
    `);
  });
});

describe('authoritative human chess', () => {
  it('humanColour, a player outside the match, throws not found', () => {
    // Arrange
    const game = start();

    // Act
    function identify() {
      humanColour(game, 'stranger');
    }

    // Assert
    expect(identify).toThrow('not_found');
    expect(game.moves).toEqual([]);
  });

  it('applyHumanAction, black on white’s turn, throws out of turn', () => {
    // Arrange
    const game = start();

    // Act
    function play() {
      applyHumanAction(game, 'black', { type: 'move', from: 'e2', to: 'e4', revision: 0 }, 1000);
    }

    // Assert
    expect(play).toThrow('out_of_turn');
    expect(game.moves).toEqual([]);
  });

  it('applyHumanAction, white e2e4 after two seconds, charges white and leaves the original moves empty', () => {
    // Arrange
    const game = start();

    // Act
    const next = move(game, 'e2e4', 2000);

    // Assert
    expect(next.clocks).toEqual({ w: 301_000, b: 300_000 });
    expect(game.moves).toEqual([]);
  });

  it('applyHumanAction, a repeated revision, throws stale', () => {
    // Arrange
    const game = start();
    const next = move(game, 'e2e4', 2000);

    // Act
    function play() {
      applyHumanAction(next, 'black', { type: 'move', from: 'e7', to: 'e5', revision: 0 }, 2000);
    }

    // Assert
    expect(play).toThrow('stale');
  });

  it('createHumanGame, a rated request while the gate is closed, throws rated unavailable', () => {
    // Arrange
    const rated = true;

    // Act
    function create() {
      createHumanGame('id', { w: 'w', b: 'b' }, '5+3', rated, 0);
    }

    // Assert
    expect(create).toThrow('rated_unavailable');
  });

  it('createHumanGame, the same account on both colours, throws invalid players', () => {
    // Arrange
    const players = { w: 'w', b: 'w' };

    // Act
    function create() {
      createHumanGame('id', players, '5+3', false, 0);
    }

    // Assert
    expect(create).toThrow('invalid_players');
  });

  it('humanConnection, overlapping disconnects at twenty-one seconds, charges only white’s allowance', () => {
    // Arrange
    const opened = start();

    // Act
    const game = humanConnection(humanConnection(opened, 'w', false, 1000), 'b', false, 21_000);

    // Assert
    expect(game.pauseUsed).toEqual({ w: 20_000, b: 0 });
  });

  it('humanTiming, overlapping disconnects at seventy-one seconds, charges each allowance independently', () => {
    // Arrange
    const game = bothPaused();

    // Act
    const timing = humanTiming(game, 71_000);

    // Assert
    expect(timing).toMatchObject({
      clocks: { w: 299_000, b: 300_000 },
      pauseUsed: { w: 60_000, b: 50_000 },
      pauseRemaining: 10_000,
    });
  });

  it('humanConnection, both players reconnecting by eighty-six seconds, caps each allowance', () => {
    // Arrange
    const paused = bothPaused();

    // Act
    const game = humanConnection(humanConnection(paused, 'w', true, 71_000), 'b', true, 86_000);

    // Assert
    expect(game.pauseUsed).toEqual({ w: 60_000, b: 60_000 });
    expect(game.clocks.w).toBe(294_000);
  });

  it('humanTiming, one second after both reconnect, charges white’s clock', () => {
    // Arrange
    const game = bothResumed();

    // Act
    const timing = humanTiming(game, 87_000);

    // Assert
    expect(timing.clocks.w).toBe(293_000);
  });

  it('humanConnection, a repeated disconnect, returns the same game', () => {
    // Arrange
    const game = whitePaused();

    // Act
    const repeated = humanConnection(game, 'w', false, 2000);

    // Assert
    expect(repeated).toBe(game);
  });

  it('humanConnection, a reconnect during the allowance, records the paused time', () => {
    // Arrange
    const game = whitePaused();

    // Act
    const resumed = humanConnection(game, 'w', true, 31_000);

    // Assert
    expect(resumed.pauseUsed.w).toBe(30_000);
  });

  it('humanTiming, during the second disconnect, uses the rest of the sixty-second allowance', () => {
    // Arrange
    const game = whitePausedAgain();

    // Act
    const timing = humanTiming(game, 72_000);

    // Assert
    expect(timing.clocks.w).toBe(288_000);
  });

  it('applyHumanAction, a move while the opponent is disconnected, throws disconnected', () => {
    // Arrange
    const game = humanConnection(start(), 'b', false, 0);

    // Act
    function play() {
      move(game, 'e2e4', 1);
    }

    // Assert
    expect(play).toThrow('disconnected');
  });

  it('applyHumanAction, a move after the allowance is exhausted, still adds the increment', () => {
    // Arrange
    const game = createHumanGame('id', { w: 'white', b: 'black' }, '5+3', false, 0);

    // Act
    const played = move(game, 'e2e4', 61_000);

    // Assert
    expect(played.clocks.w).toBe(302_000);
  });

  it('settleHuman, one millisecond before timeout, leaves the game unfinished', () => {
    // Arrange
    const game = createHumanGame('id', { w: 'white', b: 'black' }, '5+3', false, 0);

    // Act
    const settled = settleHuman(game, 359_999);

    // Assert
    expect(settled.result).toBeNull();
  });

  it('settleHuman, after the flag, records the exact timeout timestamp', () => {
    // Arrange
    const game = createHumanGame('id', { w: 'white', b: 'black' }, '5+3', false, 0);

    // Act
    const ended = settleHuman(game, 400_000);

    // Assert
    expect(ended.result).toEqual({ winner: 'b', reason: 'timeout', at: 360_000 });
  });

  it('settleHuman, a finished game, returns the same game', () => {
    // Arrange
    const game = createHumanGame('id', { w: 'white', b: 'black' }, '5+3', false, 0);
    const ended = settleHuman(game, 400_000);

    // Act
    const settled = settleHuman(ended, 900_000);

    // Assert
    expect(settled).toBe(ended);
  });

  it('sequence, a threefold repetition, stays unfinished with three occurrences', () => {
    // Arrange
    const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];

    // Act
    const game = sequence([...cycle, ...cycle]);
    const occurrences = positionCount(humanChess(game));

    // Assert
    expect(game.result).toBeNull();
    expect(occurrences).toBe(3);
  });

  it('applyHumanAction, a threefold claim, ends by repetition', () => {
    // Arrange
    const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const game = sequence([...cycle, ...cycle]);

    // Act
    const claimed = applyHumanAction(
      game,
      'white',
      { type: 'claimDraw', revision: game.revision },
      game.updatedAt,
    );

    // Assert
    expect(claimed.result?.reason).toBe('repetition');
  });

  it('sequence, a fivefold repetition, ends by repetition', () => {
    // Arrange
    const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];

    // Act
    const game = sequence([...cycle, ...cycle, ...cycle, ...cycle]);

    // Assert
    expect(game.result?.reason).toBe('repetition');
  });

  it('applyHumanAction, a premature draw claim, throws cannot claim', () => {
    // Arrange
    const game = start();

    // Act
    function claim() {
      applyHumanAction(game, 'white', { type: 'claimDraw', revision: 0 }, 1);
    }

    // Assert
    expect(claim).toThrow('cannot_claim');
  });

  it('humanDrawClaim, the fifty-move position, returns fifty moves', () => {
    // Arrange
    const position = new Chess('7k/8/8/8/8/8/8/KR6 w - - 100 100');

    // Act
    const claim = humanDrawClaim(position);

    // Assert
    expect(claim).toBe('fiftyMoves');
  });

  it('humanOutcome, the fifty-move position, does not end the game', () => {
    // Arrange
    const position = new Chess('7k/8/8/8/8/8/8/KR6 w - - 100 100');

    // Act
    const outcome = humanOutcome(position);

    // Assert
    expect(outcome).toBeNull();
  });

  it('humanOutcome, the seventy-five-move position, ends by fifty moves', () => {
    // Arrange
    const position = new Chess('7k/8/8/8/8/8/8/KR6 w - - 150 100');

    // Act
    const outcome = humanOutcome(position);

    // Assert
    expect(outcome).toEqual({ reason: 'fiftyMoves', winner: null });
  });

  it('humanOutcome, checkmate on the seventy-five-move count, ends by checkmate', () => {
    // Arrange
    const position = new Chess('7k/6Q1/6K1/8/8/8/8/8 b - - 150 100');

    // Act
    const outcome = humanOutcome(position);

    // Assert
    expect(outcome).toEqual({ reason: 'checkmate', winner: 'w' });
  });

  it('applyHumanAction, a draw offer before each side has moved, throws cannot offer', () => {
    // Arrange
    const game = start();

    // Act
    function offer() {
      applyHumanAction(game, 'white', { type: 'offerDraw', revision: 0 }, 0);
    }

    // Assert
    expect(offer).toThrow('cannot_offer');
  });

  it('applyHumanAction, accepting one’s own draw offer, throws no offer', () => {
    // Arrange
    const { game, offered } = offeredDraw();

    // Act
    function accept() {
      applyHumanAction(offered, 'white', { type: 'acceptDraw', revision: 3 }, game.updatedAt);
    }

    // Assert
    expect(accept).toThrow('no_offer');
  });

  it('applyHumanAction, the opponent accepts a draw, ends by agreement', () => {
    // Arrange
    const { game, offered } = offeredDraw();

    // Act
    const accepted = applyHumanAction(
      offered,
      'black',
      { type: 'acceptDraw', revision: 3 },
      game.updatedAt,
    );

    // Assert
    expect(accepted.result?.reason).toBe('agreement');
  });

  it('applyHumanAction, a move after a draw offer, clears the offer', () => {
    // Arrange
    const { offered } = offeredDraw();

    // Act
    const played = move(offered, 'g1f3');

    // Assert
    expect(played.drawOffer).toBeNull();
  });

  it('applyHumanAction, declining a draw offer, clears the offer', () => {
    // Arrange
    const { game, offered } = offeredDraw();

    // Act
    const declined = applyHumanAction(
      offered,
      'black',
      { type: 'declineDraw', revision: 3 },
      game.updatedAt,
    );

    // Assert
    expect(declined.drawOffer).toBeNull();
  });

  it('applyHumanAction, an abort after one move, ends by abort', () => {
    // Arrange
    const game = sequence(['e2e4']);

    // Act
    const aborted = applyHumanAction(game, 'black', { type: 'abort', revision: 1 }, game.updatedAt);

    // Assert
    expect(aborted.result?.reason).toBe('abort');
  });

  it('applyHumanAction, an abort after two moves, throws cannot abort', () => {
    // Arrange
    const opened = sequence(['e2e4']);
    const continued = move(opened, 'e7e5');

    // Act
    function abort() {
      applyHumanAction(continued, 'white', { type: 'abort', revision: 2 }, opened.updatedAt + 1000);
    }

    // Assert
    expect(abort).toThrow('cannot_abort');
  });

  it('applyHumanAction, an abort after resignation, keeps the resignation', () => {
    // Arrange
    const game = sequence(['e2e4']);
    const resigned = applyHumanAction(
      game,
      'white',
      { type: 'resign', revision: 1 },
      game.updatedAt,
    );

    // Act
    const afterAbort = applyHumanAction(
      resigned,
      'black',
      { type: 'abort', revision: 1 },
      game.updatedAt,
    );

    // Assert
    expect(afterAbort).toBe(resigned);
    expect(resigned.result?.winner).toBe('b');
  });

  it('sequence, scholar’s mate, ends by checkmate', () => {
    // Arrange
    const moves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];

    // Act
    const game = sequence(moves);

    // Assert
    expect(game.result).toMatchObject({ winner: 'b', reason: 'checkmate' });
  });

  it('sequence, an en passant capture, removes the captured pawn', () => {
    // Arrange
    const moves = ['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6'];

    // Act
    const game = sequence(moves);
    const captured = humanChess(game).get('d5');

    // Assert
    expect(captured).toBeUndefined();
  });

  it('sequence, kingside castling, moves the rook beside the king', () => {
    // Arrange
    const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1'];

    // Act
    const game = sequence(moves);
    const piece = humanChess(game).get('f1');

    // Assert
    expect(piece?.type).toBe('r');
  });

  it.each([
    ['7k/8/8/8/8/8/8/K7 w - - 0 1', 'w', false],
    ['7k/8/8/8/8/8/8/KB6 w - - 0 1', 'w', false],
    ['7k/8/8/8/8/8/8/KN6 w - - 0 1', 'w', false],
    ['6bk/8/8/8/8/8/8/KB6 w - - 0 1', 'w', false],
    ['7k/8/8/8/8/8/8/KNN5 w - - 0 1', 'w', 'unknown'],
    ['6nk/8/8/8/8/8/8/KB6 w - - 0 1', 'w', 'unknown'],
    ['7k/8/8/8/8/8/P7/K7 w - - 0 1', 'w', 'unknown'],
  ] as const)('handles known mating-material boundary %s', (fen, colour, result) => {
    // Arrange
    const position = new Chess(fen);

    // Act
    const mate = possibleMate(position, colour);

    // Assert
    expect(mate).toBe(result);
  });

  it.each([
    null,
    {},
    { type: 'move', from: 'a9', to: 'a1', revision: 0 },
    { type: 'resign', revision: -1 },
    { type: 'move', from: 'a7', to: 'a8', promotion: 'k', revision: 0 },
  ])('rejects malformed action %j', (action) => {
    // Arrange
    const input = action;

    // Act
    const parsed = parseHumanAction(input);

    // Assert
    expect(parsed).toBeNull();
  });
});
