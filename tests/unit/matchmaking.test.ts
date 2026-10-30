import { describe, expect, it } from 'vitest';
import { canAcceptAI, matchingOpponent, ratingTolerance, type QueueEntry } from '../../shared/matchmaking';
const entry = (changes: Partial<QueueEntry> = {}): QueueEntry => ({ user: 'one', control: '5+3', rated: true, rating: 1500, joinedAt: 0, token: 'token', ...changes });
describe('public matchmaking policy', () => {
  it('widens tolerance at exact fifteen-second boundaries up to six hundred', () => {
    expect(ratingTolerance(14999)).toBe(200); expect(ratingTolerance(15000)).toBe(300); expect(ratingTolerance(90000)).toBe(600);
  });
  it('keeps controls, mode and account identity isolated', () => {
    const one = entry();
    expect(matchingOpponent(one, [entry(), entry({ user: 'two', control: '10+5' }), entry({ user: 'three', rated: false })], 30000)).toBeNull();
  });
  it('uses both players’ tolerance and oldest eligible opponent', () => {
    const one = entry({ joinedAt: 15000 });
    expect(matchingOpponent(one, [entry({ user: 'two', rating: 1800 })], 15000)).toBeNull();
    expect(matchingOpponent(one, [entry({ user: 'two', rating: 1800 })], 30000)?.user).toBe('two');
    expect(matchingOpponent(entry({ rated: false }), [entry({ user: 'new', rated: false, joinedAt: 5 }), entry({ user: 'old', rated: false, rating: 9000 })], 100)?.user).toBe('old');
  });
  it('never accepts AI before thirty seconds or with a stale queue token', () => {
    expect(canAcceptAI(entry(), 'token', 29999)).toBe(false);
    expect(canAcceptAI(entry(), 'token', 30000)).toBe(true);
    expect(canAcceptAI(entry(), 'old-token', 60000)).toBe(false);
  });
});
