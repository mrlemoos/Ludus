import {
  addVerifiedReviewPack,
  anonymiseReviewCreditReservations,
  applyReviewPackRisk,
  commitCoachReviewCredit,
  reserveCoachReviewCredit,
  restoreCoachReviewCredit,
  reviewCreditStatus,
} from './review-credits';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const now = Date.parse('2026-11-01T12:00:00Z');
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync('drizzle')
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  }
  for (const id of ['owner', 'other']) {
    sqlite
      .prepare(
        'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      )
      .run(id, id, `${id}@example.test`, 1, now, now);
    sqlite
      .prepare(
        "INSERT INTO player_profiles(user_id,username,language,timezone,chess_level,teaching_profile,adult_attested_at,policy_version,onboarded_at,trial_expires_at) VALUES (?,?,'en-GB','UTC','casual','beginner',0,'v1',?,?)",
      )
      .run(id, id, now, now + 86_400_000);
  }
  function statement(query: string, parameters: unknown[] = []) {
    const values = parameters as (string | number | null)[];
    return {
      bind: (...bound: unknown[]) => statement(query, bound),
      first: async <T>() => (sqlite.prepare(query).get(...values) ?? null) as T | null,
      all: async <T>() => ({ results: sqlite.prepare(query).all(...values) as T[] }),
      run: async () => ({
        meta: { changes: Number(sqlite.prepare(query).run(...values).changes) },
      }),
    };
  }
  const db = { prepare: (query: string) => statement(query) } as unknown as D1Database;
  return { sqlite, db };
}

describe('review credit accounting', () => {
  it('grants one lifetime intro credit, restores failed reservations, and prefers monthly free credits before paid packs', async () => {
    // Arrange
    const f = fixture();
    const intro = await reserveCoachReviewCredit(
      f.db,
      'owner',
      'match-intro',
      'intro-reservation',
      now,
    );
    await restoreCoachReviewCredit(f.db, intro!.reservationId, now + 1);
    const retried = await reserveCoachReviewCredit(
      f.db,
      'owner',
      'match-intro',
      'intro-retry',
      now + 2,
    );
    const committed = await commitCoachReviewCredit(f.db, retried!.reservationId, now + 3);
    const beta = await reserveCoachReviewCredit(
      f.db,
      'owner',
      'match-beta',
      'beta-reservation',
      now + 4,
    );

    // Act
    const status = await reviewCreditStatus(f.db, 'owner', now + 4);

    // Assert
    expect(intro).toMatchObject({ source: 'intro' });
    expect(retried?.source).toBe('intro');
    expect(committed).toBe(true);
    expect(beta?.source).toBe('beta');
    expect(status.monthlyFreeRemaining).toBe(29);
  });

  it('keeps the monthly free pool at 30 across beta and complimentary access and counts legacy reviews', async () => {
    // Arrange
    const f = fixture();
    f.sqlite.prepare('UPDATE player_profiles SET trial_expires_at=0 WHERE user_id=?').run('owner');
    f.sqlite
      .prepare('INSERT INTO complimentary_plus(email,granted_at) VALUES (?,?)')
      .run('owner@example.test', now);
    const intro = await reserveCoachReviewCredit(
      f.db,
      'owner',
      'match-intro',
      'intro-consumed',
      now,
    );
    await commitCoachReviewCredit(f.db, intro!.reservationId, now);
    for (let i = 0; i < 29; i++) {
      const id = `legacy-${i}`;
      f.sqlite
        .prepare(
          "INSERT INTO coach_requests(id,owner,request_key,fingerprint,kind,month,state,reserved_micros,spent_micros,created_at,expires_at) VALUES (?,? ,? ,? ,'review','2026-11','complete',1,1,?,?)",
        )
        .run(id, 'owner', id, id, now, now);
    }
    const statusBefore = await reviewCreditStatus(f.db, 'owner', now);
    const free = await reserveCoachReviewCredit(
      f.db,
      'owner',
      'match-free',
      'free-reservation',
      now,
    );
    const statusAfter = await reviewCreditStatus(f.db, 'owner', now);

    // Act
    const extra = await reserveCoachReviewCredit(f.db, 'owner', 'match-extra', 'no-credit', now);

    // Assert
    expect(intro?.source).toBe('intro');
    expect(statusBefore.monthlyFreeRemaining).toBe(1);
    expect(free?.source).toBe('complimentary');
    expect(statusAfter.monthlyFreeRemaining).toBe(0);
    expect(extra).toBeNull();
  });

  it('grants each verified pack once, isolates owners, and freezes only credits tied to a disputed pack', async () => {
    // Arrange
    const f = fixture();
    const intro = await reserveCoachReviewCredit(
      f.db,
      'owner',
      'match-intro',
      'intro-consumed',
      now,
    );
    await commitCoachReviewCredit(f.db, intro!.reservationId, now);
    f.sqlite.prepare('UPDATE player_profiles SET trial_expires_at=0 WHERE user_id=?').run('owner');
    f.sqlite
      .prepare(
        'INSERT INTO review_pack_checkouts(id,owner,generation,checkout,created_at) VALUES (?,?,?,?,?)',
      )
      .run('attempt', 'owner', 'generation', 'cs_paid', now);
    await addVerifiedReviewPack(f.db, {
      owner: 'owner',
      checkout: 'cs_paid',
      paymentIntent: 'pi_paid',
      charge: 'ch_paid',
      now,
    });
    await addVerifiedReviewPack(f.db, {
      owner: 'owner',
      checkout: 'cs_paid',
      paymentIntent: 'pi_paid',
      charge: 'ch_paid',
      now,
    });
    f.sqlite
      .prepare(
        'INSERT INTO review_pack_checkouts(id,owner,generation,checkout,created_at) VALUES (?,?,?,?,?)',
      )
      .run('attempt-safe', 'owner', 'generation-safe', 'cs_safe', now + 1);
    await addVerifiedReviewPack(f.db, {
      owner: 'owner',
      checkout: 'cs_safe',
      paymentIntent: 'pi_safe',
      charge: 'ch_safe',
      now: now + 1,
    });
    const statusAfterPacks = await reviewCreditStatus(f.db, 'owner', now);
    const other = await reserveCoachReviewCredit(
      f.db,
      'other',
      'match-other',
      'other-reservation',
      now,
    );
    const reservation = await reserveCoachReviewCredit(
      f.db,
      'owner',
      'match-paid',
      'paid-reservation',
      now,
    );
    await applyReviewPackRisk(f.db, {
      charge: 'ch_paid',
      paymentIntent: 'pi_paid',
      frozen: true,
      now: now + 1,
    });
    const committedWhileFrozen = await commitCoachReviewCredit(
      f.db,
      reservation!.reservationId,
      now + 2,
    );
    const statusWhileFrozen = await reviewCreditStatus(f.db, 'owner', now + 2);
    await restoreCoachReviewCredit(f.db, reservation!.reservationId, now + 2);
    await applyReviewPackRisk(f.db, {
      charge: 'ch_paid',
      paymentIntent: 'pi_paid',
      frozen: false,
      refunded: false,
      now: now + 3,
    });

    // Act
    const statusAfterRelease = await reviewCreditStatus(f.db, 'owner', now + 3);

    // Assert
    expect(intro?.source).toBe('intro');
    expect(statusAfterPacks.paidRemaining).toBe(20);
    expect(other?.source).toBe('intro');
    expect(reservation?.source).toBe('paid');
    expect(committedWhileFrozen).toBe(false);
    expect(statusWhileFrozen.paidRemaining).toBe(10);
    expect(statusAfterRelease.paidRemaining).toBe(20);
  });

  it('serialises duplicate match reservations and does not consume allowance on failure', async () => {
    // Arrange
    const f = fixture();
    const attempts = await Promise.all([
      reserveCoachReviewCredit(f.db, 'owner', 'same-match', 'reservation-a', now),
      reserveCoachReviewCredit(f.db, 'owner', 'same-match', 'reservation-b', now),
    ]);
    const reservation = attempts.find(Boolean)!;
    await restoreCoachReviewCredit(f.db, reservation.reservationId, now + 1);

    // Act
    const status = await reviewCreditStatus(f.db, 'owner', now + 1);

    // Assert
    expect(attempts.filter(Boolean)).toHaveLength(1);
    expect(status.introAvailable).toBe(true);
  });

  it('releases abandoned reservations after the coach request timeout', async () => {
    // Arrange
    const f = fixture();
    const abandoned = await reserveCoachReviewCredit(
      f.db,
      'owner',
      'abandoned-match',
      'abandoned-reservation',
      now,
    );
    const status = await reviewCreditStatus(f.db, 'owner', now + 90_000);
    const committed = await commitCoachReviewCredit(f.db, abandoned!.reservationId, now + 90_000);

    // Act
    const retried = await reserveCoachReviewCredit(
      f.db,
      'owner',
      'abandoned-match',
      'retry-reservation',
      now + 90_001,
    );

    // Assert
    expect(abandoned?.source).toBe('intro');
    expect(status.introAvailable).toBe(true);
    expect(committed).toBe(false);
    expect(retried?.source).toBe('intro');
  });

  it('removes private match IDs on account deletion while retaining paid-credit accounting', async () => {
    // Arrange
    const f = fixture();
    const intro = await reserveCoachReviewCredit(
      f.db,
      'owner',
      'private-intro-match',
      'intro-keep',
      now,
    );
    await commitCoachReviewCredit(f.db, intro!.reservationId, now);
    f.sqlite
      .prepare(
        'INSERT INTO review_pack_checkouts(id,owner,generation,checkout,created_at) VALUES (?,?,?,?,?)',
      )
      .run('attempt', 'owner', 'generation', 'cs_paid', now);
    await addVerifiedReviewPack(f.db, {
      owner: 'owner',
      checkout: 'cs_paid',
      paymentIntent: 'pi_paid',
      charge: 'ch_paid',
      now,
    });
    f.sqlite.prepare('UPDATE player_profiles SET trial_expires_at=0 WHERE user_id=?').run('owner');
    const paid = await reserveCoachReviewCredit(
      f.db,
      'owner',
      'private-paid-match',
      'paid-keep',
      now,
    );
    await commitCoachReviewCredit(f.db, paid!.reservationId, now);

    // Act
    await anonymiseReviewCreditReservations(f.db, 'owner');

    // Assert
    expect(
      f.sqlite
        .prepare('SELECT id,match_id,source FROM review_credit_reservations WHERE owner=?')
        .all('owner'),
    ).toEqual([{ id: 'paid-keep', match_id: 'paid-keep', source: 'paid' }]);
    expect((await reviewCreditStatus(f.db, 'owner', now)).paidRemaining).toBe(9);
  });
});
