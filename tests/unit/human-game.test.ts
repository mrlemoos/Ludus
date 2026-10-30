import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { applyHumanAction, createHumanGame, humanChess, humanDrawClaim, humanOutcome, humanColour, humanConnection, humanTiming, parseHumanAction, possibleMate, positionCount, RATED_ENABLED, settleHuman, type HumanGame } from '../../shared/human-game';
const start = () => humanConnection(humanConnection(createHumanGame('id', { w: 'white', b: 'black' }, '5+3', false, 0), 'w', true, 0), 'b', true, 0);
function move(game: HumanGame, uci: string, now = game.updatedAt + 1000) { return applyHumanAction(game, game.players[humanChess(game).turn()], { type: 'move', from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4], revision: game.revision }, now); }
function sequence(moves: string[]) { return moves.reduce((game, uci) => move(game, uci), start()); }
describe('authoritative human chess', () => {
  it('isolates members, turns and revisions', () => {
    const game = start();
    expect(() => humanColour(game, 'stranger')).toThrow('not_found');
    expect(() => applyHumanAction(game, 'black', { type: 'move', from: 'e2', to: 'e4', revision: 0 }, 1000)).toThrow('out_of_turn');
    const next = move(game, 'e2e4', 2000);
    expect(next.clocks).toEqual({ w: 301000, b: 300000 });
    expect(() => applyHumanAction(next, 'black', { type: 'move', from: 'e7', to: 'e5', revision: 0 }, 2000)).toThrow('stale');
    expect(game.moves).toEqual([]);
  });
  it('rejects rated entry while exact timeout adjudication is uncertified', () => {
    expect(RATED_ENABLED).toBe(false);
    expect(() => createHumanGame('id', { w: 'w', b: 'b' }, '5+3', true, 0)).toThrow('rated_unavailable');
    expect(() => createHumanGame('id', { w: 'w', b: 'w' }, '5+3', false, 0)).toThrow('invalid_players');
  });
  it('charges each overlapping disconnect allowance independently', () => {
    let game = humanConnection(start(), 'w', false, 1000);
    game = humanConnection(game, 'b', false, 21000);
    expect(game.pauseUsed).toEqual({ w: 20000, b: 0 });
    expect(humanTiming(game, 71000)).toMatchObject({ clocks: { w: 299000, b: 300000 }, pauseUsed: { w: 60000, b: 50000 }, pauseRemaining: 10000 });
    game = humanConnection(game, 'w', true, 71000);
    game = humanConnection(game, 'b', true, 86000);
    expect(game.pauseUsed).toEqual({ w: 60000, b: 60000 });
    expect(game.clocks.w).toBe(294000);
    expect(humanTiming(game, 87000).clocks.w).toBe(293000);
  });
  it('resumes immediately and accounts repeated socket events once', () => {
    let game = humanConnection(start(), 'w', false, 1000);
    expect(humanConnection(game, 'w', false, 2000)).toBe(game);
    game = humanConnection(game, 'w', true, 31000);
    expect(game.pauseUsed.w).toBe(30000);
    game = humanConnection(game, 'w', false, 32000);
    expect(humanTiming(game, 72000).clocks.w).toBe(288000);
    expect(() => move(humanConnection(start(), 'b', false, 0), 'e2e4', 1)).toThrow('disconnected');
  });
  it('allows moving after allowance exhaustion and uses exact timeout completion timestamp', () => {
    const game = createHumanGame('id', { w: 'white', b: 'black' }, '5+3', false, 0);
    expect(move(game, 'e2e4', 61000).clocks.w).toBe(302000);
    expect(settleHuman(game, 359999).result).toBeNull();
    const ended = settleHuman(game, 400000);
    expect(ended.result).toEqual({ winner: 'b', reason: 'timeout', at: 360000 });
    expect(settleHuman(ended, 900000)).toBe(ended);
  });
  it('requires draw claims at threefold and ends automatically at fivefold', () => {
    const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const threefold = sequence([...cycle, ...cycle]);
    expect(threefold.result).toBeNull();
    expect(positionCount(humanChess(threefold))).toBe(3);
    expect(applyHumanAction(threefold, 'white', { type: 'claimDraw', revision: threefold.revision }, threefold.updatedAt).result?.reason).toBe('repetition');
    const fivefold = sequence([...cycle, ...cycle, ...cycle, ...cycle]);
    expect(fivefold.result?.reason).toBe('repetition');
    expect(() => applyHumanAction(start(), 'white', { type: 'claimDraw', revision: 0 }, 1)).toThrow('cannot_claim');
  });
  it('requires a fifty-move claim but automatically ends at seventy-five, with mate taking priority', () => {
    const atFifty = new Chess('7k/8/8/8/8/8/8/KR6 w - - 100 100');
    expect(humanDrawClaim(atFifty)).toBe('fiftyMoves');
    expect(humanOutcome(atFifty)).toBeNull();
    const atSeventyFive = new Chess('7k/8/8/8/8/8/8/KR6 w - - 150 100');
    expect(humanOutcome(atSeventyFive)).toEqual({ reason: 'fiftyMoves', winner: null });
    const mate = new Chess('7k/6Q1/6K1/8/8/8/8/8 b - - 150 100');
    expect(humanOutcome(mate)).toEqual({ reason: 'checkmate', winner: 'w' });
  });
  it('draw agreements require one move each, reject self-accept and stale races', () => {
    expect(() => applyHumanAction(start(), 'white', { type: 'offerDraw', revision: 0 }, 0)).toThrow('cannot_offer');
    const game = sequence(['e2e4', 'e7e5']);
    const offered = applyHumanAction(game, 'white', { type: 'offerDraw', revision: 2 }, game.updatedAt);
    expect(() => applyHumanAction(offered, 'white', { type: 'acceptDraw', revision: 3 }, game.updatedAt)).toThrow('no_offer');
    expect(applyHumanAction(offered, 'black', { type: 'acceptDraw', revision: 3 }, game.updatedAt).result?.reason).toBe('agreement');
    expect(move(offered, 'g1f3').drawOffer).toBeNull();
    expect(applyHumanAction(offered, 'black', { type: 'declineDraw', revision: 3 }, game.updatedAt).drawOffer).toBeNull();
  });
  it('limits aborts and keeps terminal results immutable under conflicting actions', () => {
    const game = sequence(['e2e4']);
    expect(applyHumanAction(game, 'black', { type: 'abort', revision: 1 }, game.updatedAt).result?.reason).toBe('abort');
    expect(() => applyHumanAction(move(game, 'e7e5'), 'white', { type: 'abort', revision: 2 }, game.updatedAt + 1000)).toThrow('cannot_abort');
    const resigned = applyHumanAction(game, 'white', { type: 'resign', revision: 1 }, game.updatedAt);
    expect(applyHumanAction(resigned, 'black', { type: 'abort', revision: 1 }, game.updatedAt)).toBe(resigned);
    expect(resigned.result?.winner).toBe('b');
  });
  it('ends checkmate before draw rules and persists special move history', () => {
    const mate = sequence(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(mate.result).toMatchObject({ winner: 'b', reason: 'checkmate' });
    const passant = sequence(['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6']);
    expect(humanChess(passant).get('d5')).toBeUndefined();
    const castle = sequence(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1']);
    expect(humanChess(castle).get('f1')?.type).toBe('r');
  });
  it.each([
    ['7k/8/8/8/8/8/8/K7 w - - 0 1', 'w', false],
    ['7k/8/8/8/8/8/8/KB6 w - - 0 1', 'w', false],
    ['7k/8/8/8/8/8/8/KN6 w - - 0 1', 'w', false],
    ['6bk/8/8/8/8/8/8/KB6 w - - 0 1', 'w', false],
    ['7k/8/8/8/8/8/8/KNN5 w - - 0 1', 'w', 'unknown'],
    ['6nk/8/8/8/8/8/8/KB6 w - - 0 1', 'w', 'unknown'],
    ['7k/8/8/8/8/8/P7/K7 w - - 0 1', 'w', 'unknown'],
  ] as const)('handles known mating-material boundary %s', (fen, colour, result) => expect(possibleMate(new Chess(fen), colour)).toBe(result));
  it.each([null, {}, { type: 'move', from: 'a9', to: 'a1', revision: 0 }, { type: 'resign', revision: -1 }, { type: 'move', from: 'a7', to: 'a8', promotion: 'k', revision: 0 }])('rejects malformed action %j', (action) => expect(parseHumanAction(action)).toBeNull());
});
