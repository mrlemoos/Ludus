import { monthKey } from '../shared/coaching';
import {
  MONTHLY_FREE_REVIEW_CREDITS,
  REVIEW_CREDIT_RESERVATION_TIMEOUT_MS,
  type ReviewCreditReservation,
  type ReviewCreditStatus,
} from '../shared/review-credits';

export async function reserveCoachReviewCredit(
  db: D1Database,
  owner: string,
  matchId: string,
  reservationId: string,
  now: number,
): Promise<ReviewCreditReservation | null> {
  const month = monthKey(now);
  await db
    .prepare(
      "UPDATE review_credit_reservations SET state='restored' WHERE owner=? AND state='reserved' AND created_at<=?",
    )
    .bind(owner, now - REVIEW_CREDIT_RESERVATION_TIMEOUT_MS)
    .run();
  const inserted = await db
    .prepare(`WITH choice AS (
    SELECT
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM review_credit_reservations WHERE owner=? AND source='intro' AND state IN ('reserved','committed')) THEN 'intro'
        WHEN EXISTS (SELECT 1 FROM player_profiles WHERE user_id=? AND trial_expires_at>?)
          AND ((SELECT COUNT(*) FROM review_credit_reservations WHERE owner=? AND month=? AND source IN ('beta','complimentary') AND state IN ('reserved','committed'))
            + (SELECT COUNT(*) FROM coach_requests c WHERE c.owner=? AND c.month=? AND c.kind='review' AND c.state IN ('pending','complete') AND NOT EXISTS (SELECT 1 FROM review_credit_reservations r WHERE r.id=c.id))) < ? THEN 'beta'
        WHEN EXISTS (SELECT 1 FROM complimentary_plus g JOIN user u ON lower(u.email)=g.email WHERE u.id=? AND u.email_verified=1 AND g.revoked_at IS NULL AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?))
          AND ((SELECT COUNT(*) FROM review_credit_reservations WHERE owner=? AND month=? AND source IN ('beta','complimentary') AND state IN ('reserved','committed'))
            + (SELECT COUNT(*) FROM coach_requests c WHERE c.owner=? AND c.month=? AND c.kind='review' AND c.state IN ('pending','complete') AND NOT EXISTS (SELECT 1 FROM review_credit_reservations r WHERE r.id=c.id))) < ? THEN 'complimentary'
        WHEN EXISTS (SELECT 1 FROM review_credit_packs p WHERE p.owner=? AND p.frozen=0 AND p.refunded=0 AND p.credits>(SELECT COUNT(*) FROM review_credit_reservations r WHERE r.pack_id=p.id AND r.state IN ('reserved','committed'))) THEN 'paid'
      END AS source,
      (SELECT p.id FROM review_credit_packs p WHERE p.owner=? AND p.frozen=0 AND p.refunded=0 AND p.credits>(SELECT COUNT(*) FROM review_credit_reservations r WHERE r.pack_id=p.id AND r.state IN ('reserved','committed')) ORDER BY p.created_at,p.id LIMIT 1) AS pack_id
  )
  INSERT INTO review_credit_reservations(id,owner,match_id,source,pack_id,month,state,created_at)
  SELECT ?,?,?,choice.source,CASE WHEN choice.source='paid' THEN choice.pack_id END,?,'reserved',?
  FROM choice
  WHERE choice.source IS NOT NULL
    AND EXISTS (SELECT 1 FROM player_profiles WHERE user_id=?)
    AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?)
    AND NOT EXISTS (SELECT 1 FROM review_credit_reservations WHERE owner=? AND match_id=? AND state IN ('reserved','committed'))`)
    .bind(
      owner,
      owner,
      now,
      owner,
      month,
      owner,
      month,
      MONTHLY_FREE_REVIEW_CREDITS,
      owner,
      owner,
      owner,
      month,
      owner,
      month,
      MONTHLY_FREE_REVIEW_CREDITS,
      owner,
      owner,
      reservationId,
      owner,
      matchId,
      month,
      now,
      owner,
      owner,
      owner,
      matchId,
    )
    .run();
  if (!inserted.meta.changes) return null;
  const row = await db
    .prepare('SELECT source,pack_id FROM review_credit_reservations WHERE id=? AND owner=?')
    .bind(reservationId, owner)
    .first<{ source: ReviewCreditReservation['source']; pack_id: string | null }>();
  return row ? { reservationId, source: row.source, packId: row.pack_id } : null;
}

/** Commits only an existing reservation; a dispute or expiry racing generation can still deny paid use. */
export function commitCoachReviewCreditStatement(
  db: D1Database,
  reservationId: string,
  now: number,
): D1PreparedStatement {
  return db
    .prepare(`UPDATE review_credit_reservations
    SET state='committed'
    WHERE id=? AND state='reserved'
      AND (source='intro'
        OR (source='beta' AND EXISTS (SELECT 1 FROM player_profiles p WHERE p.user_id=review_credit_reservations.owner AND p.trial_expires_at>?))
        OR (source='complimentary' AND EXISTS (SELECT 1 FROM complimentary_plus g JOIN user u ON lower(u.email)=g.email WHERE u.id=review_credit_reservations.owner AND u.email_verified=1 AND g.revoked_at IS NULL))
        OR (source='paid' AND EXISTS (SELECT 1 FROM review_credit_packs p WHERE p.id=review_credit_reservations.pack_id AND p.owner=review_credit_reservations.owner AND p.frozen=0 AND p.refunded=0 AND p.credits>(SELECT COUNT(*) FROM review_credit_reservations r WHERE r.pack_id=p.id AND r.state='committed'))))
      AND created_at>?
      AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=review_credit_reservations.owner)`)
    .bind(reservationId, now, now - REVIEW_CREDIT_RESERVATION_TIMEOUT_MS);
}

export async function commitCoachReviewCredit(
  db: D1Database,
  reservationId: string,
  now: number,
): Promise<boolean> {
  const result = await commitCoachReviewCreditStatement(db, reservationId, now).run();
  return result.meta.changes === 1;
}

export async function restoreCoachReviewCredit(
  db: D1Database,
  reservationId: string,
  now: number,
): Promise<void> {
  await db
    .prepare(
      "UPDATE review_credit_reservations SET state='restored',created_at=? WHERE id=? AND state='reserved'",
    )
    .bind(now, reservationId)
    .run();
}

export async function reviewCreditStatus(
  db: D1Database,
  owner: string,
  now: number,
): Promise<ReviewCreditStatus> {
  await db
    .prepare(
      "UPDATE review_credit_reservations SET state='restored' WHERE owner=? AND state='reserved' AND created_at<=?",
    )
    .bind(owner, now - REVIEW_CREDIT_RESERVATION_TIMEOUT_MS)
    .run();
  const month = monthKey(now);
  const result = await db
    .prepare(`SELECT
    EXISTS(SELECT 1 FROM player_profiles p WHERE p.user_id=? AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE user_id=p.user_id)) AS onboarded,
    EXISTS(SELECT 1 FROM review_credit_reservations WHERE owner=? AND source='intro' AND state IN ('reserved','committed')) AS intro_used,
    CASE WHEN EXISTS(SELECT 1 FROM player_profiles WHERE user_id=? AND trial_expires_at>?) THEN 1
      WHEN EXISTS(SELECT 1 FROM complimentary_plus g JOIN user u ON lower(u.email)=g.email WHERE u.id=? AND u.email_verified=1 AND g.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE user_id=?)) THEN 1 ELSE 0 END AS free_active,
    ((SELECT COUNT(*) FROM review_credit_reservations WHERE owner=? AND month=? AND source IN ('beta','complimentary') AND state IN ('reserved','committed'))
      + (SELECT COUNT(*) FROM coach_requests c WHERE c.owner=? AND c.month=? AND c.kind='review' AND c.state IN ('pending','complete') AND NOT EXISTS (SELECT 1 FROM review_credit_reservations r WHERE r.id=c.id))) AS free_used,
    (SELECT COALESCE(SUM(MAX(0,p.credits-(SELECT COUNT(*) FROM review_credit_reservations r WHERE r.pack_id=p.id AND r.state IN ('reserved','committed')))),0) FROM review_credit_packs p WHERE p.owner=? AND p.frozen=0 AND p.refunded=0) AS paid_remaining`)
    .bind(owner, owner, owner, now, owner, owner, owner, month, owner, month, owner)
    .first<{
      onboarded: number;
      intro_used: number;
      free_active: number;
      free_used: number;
      paid_remaining: number;
    }>();
  const onboarded = result?.onboarded === 1;
  const introAvailable = onboarded && result?.intro_used !== 1;
  const monthlyFreeRemaining =
    onboarded && result?.free_active === 1
      ? Math.max(0, MONTHLY_FREE_REVIEW_CREDITS - (result.free_used ?? 0))
      : 0;
  const paidRemaining = Math.max(0, result?.paid_remaining ?? 0);
  return {
    available: Number(introAvailable) + monthlyFreeRemaining + paidRemaining,
    monthlyFreeRemaining,
    introAvailable,
    paidRemaining,
  };
}

export async function addVerifiedReviewPack(
  db: D1Database,
  input: {
    owner: string;
    checkout: string;
    paymentIntent: string;
    charge: string | null;
    now: number;
  },
): Promise<boolean> {
  const result = await db
    .prepare(`INSERT OR IGNORE INTO review_credit_packs(id,owner,checkout,payment_intent,charge,credits,frozen,refunded,created_at)
    SELECT ?,?,?,?,?,10,
      COALESCE((SELECT frozen FROM review_credit_pack_risks WHERE (charge IS NOT NULL AND charge=?) OR payment_intent=? ORDER BY updated_at DESC LIMIT 1),0),
      COALESCE((SELECT refunded FROM review_credit_pack_risks WHERE (charge IS NOT NULL AND charge=?) OR payment_intent=? ORDER BY updated_at DESC LIMIT 1),0),?
    WHERE EXISTS (SELECT 1 FROM review_pack_checkouts WHERE checkout=? AND owner=?)
      AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?)`)
    .bind(
      crypto.randomUUID(),
      input.owner,
      input.checkout,
      input.paymentIntent,
      input.charge,
      input.charge,
      input.paymentIntent,
      input.charge,
      input.paymentIntent,
      input.now,
      input.checkout,
      input.owner,
      input.owner,
    )
    .run();
  await db
    .prepare(
      "UPDATE review_pack_checkouts SET state='paid' WHERE checkout=? AND owner=? AND EXISTS (SELECT 1 FROM review_credit_packs WHERE checkout=? AND owner=?)",
    )
    .bind(input.checkout, input.owner, input.checkout, input.owner)
    .run();
  return result.meta.changes === 1;
}

/** Keep only paid-credit accounting after account deletion; free reservations need no retention. */
export async function anonymiseReviewCreditReservations(
  db: D1Database,
  owner: string,
): Promise<void> {
  await db
    .prepare("UPDATE review_credit_reservations SET match_id=id WHERE owner=? AND source='paid'")
    .bind(owner)
    .run();
  await db
    .prepare("DELETE FROM review_credit_reservations WHERE owner=? AND source<>'paid'")
    .bind(owner)
    .run();
}

export async function reviewCreditOwnerForCheckout(
  db: D1Database,
  checkout: string,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT owner FROM review_pack_checkouts WHERE checkout=?')
    .bind(checkout)
    .first<{ owner: string }>();
  return row?.owner ?? null;
}

export async function applyReviewPackRisk(
  db: D1Database,
  input: {
    charge?: string;
    paymentIntent?: string;
    frozen?: boolean;
    refunded?: boolean;
    now: number;
  },
): Promise<void> {
  const frozen = Number(input.frozen ?? false),
    refunded = Number(input.refunded ?? false),
    id = input.charge ?? `pi:${input.paymentIntent ?? 'unknown'}`;
  const existing = await db
    .prepare(
      'SELECT id FROM review_credit_pack_risks WHERE (? IS NOT NULL AND charge=?) OR (? IS NOT NULL AND payment_intent=?) ORDER BY updated_at DESC LIMIT 1',
    )
    .bind(
      input.charge ?? null,
      input.charge ?? null,
      input.paymentIntent ?? null,
      input.paymentIntent ?? null,
    )
    .first<{ id: string }>();
  if (existing) {
    await db
      .prepare(
        `UPDATE review_credit_pack_risks SET charge=COALESCE(charge,?),payment_intent=COALESCE(payment_intent,?),frozen=CASE WHEN ? IS NULL THEN frozen ELSE ? END,refunded=CASE WHEN ? IS NULL THEN refunded ELSE ? END,updated_at=? WHERE id=?`,
      )
      .bind(
        input.charge ?? null,
        input.paymentIntent ?? null,
        input.frozen === undefined ? null : frozen,
        frozen,
        input.refunded === undefined ? null : refunded,
        refunded,
        input.now,
        existing.id,
      )
      .run();
  } else {
    await db
      .prepare(
        'INSERT OR IGNORE INTO review_credit_pack_risks(id,charge,payment_intent,frozen,refunded,updated_at) VALUES (?,?,?,?,?,?)',
      )
      .bind(id, input.charge ?? null, input.paymentIntent ?? null, frozen, refunded, input.now)
      .run();
  }
  await db
    .prepare(
      `UPDATE review_credit_packs SET frozen=CASE WHEN ? IS NULL THEN frozen ELSE ? END,refunded=CASE WHEN ? IS NULL THEN refunded ELSE ? END WHERE (? IS NOT NULL AND charge=?) OR (? IS NOT NULL AND payment_intent=?)`,
    )
    .bind(
      input.frozen === undefined ? null : frozen,
      frozen,
      input.refunded === undefined ? null : refunded,
      refunded,
      input.charge ?? null,
      input.charge ?? null,
      input.paymentIntent ?? null,
      input.paymentIntent ?? null,
    )
    .run();
}
