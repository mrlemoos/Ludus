import { monthKey } from '../shared/coaching';
import type {
  AnalysisLine,
  CoachDocument,
  SavedCoachHistory,
  SavedReply,
  SavedReview,
  SavedReviewWithAnalysis,
  TeachingProfile,
} from '../shared/coaching';
import type { Language } from '../shared/waitlist';

export interface Reservation {
  id: string;
  owner: string;
  key: string;
  fingerprint: string;
  kind: 'review' | 'reply';
  reviewId: string | null;
  now: number;
  reserveMicros: number;
}
interface Row {
  id: string;
  owner: string;
  match_id: string;
  language: Language;
  profile: TeachingProfile;
  document: string;
  analysis: string;
  history?: string;
  history_gaps?: number;
  created_at: number;
}
interface ReplyRow {
  id: string;
  review_id: string;
  language: Language;
  question: string;
  document: string;
  created_at: number;
}
export interface RequestState {
  id: string;
  fingerprint: string;
  state: 'pending' | 'complete' | 'failed';
}
export class CoachStore {
  constructor(private readonly db: D1Database) {}
  async expire(now: number) {
    // A timed-out provider may still have billed. Preserve the reserved maximum in the cost ledger.
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE coach_requests SET state='failed', spent_micros=reserved_micros WHERE state='pending' AND expires_at<=?",
        )
        .bind(now),
      this.db
        .prepare(
          "UPDATE review_credit_reservations SET state='restored' WHERE state='reserved' AND id IN (SELECT id FROM coach_requests WHERE state='failed' AND expires_at<=? AND kind='review')",
        )
        .bind(now),
      this.db
        .prepare(
          "UPDATE review_credit_reservations SET state='restored' WHERE state='reserved' AND created_at<=? AND id NOT IN (SELECT id FROM coach_requests WHERE state='pending' AND expires_at>?)",
        )
        .bind(now - 90_000, now),
    ]);
  }
  async existing(owner: string, key: string): Promise<RequestState | null> {
    return this.db
      .prepare(
        'SELECT id, fingerprint, state FROM coach_requests WHERE owner=? AND request_key=? ORDER BY created_at DESC, rowid DESC LIMIT 1',
      )
      .bind(owner, key)
      .first<RequestState>();
  }
  async reserve(input: Reservation): Promise<boolean> {
    const { id, owner, key, fingerprint, kind, reviewId, now, reserveMicros } = input;
    const month = monthKey(now);
    const result = await this.db
      .prepare(`INSERT OR IGNORE INTO coach_requests
      (id,owner,request_key,fingerprint,kind,review_id,month,state,reserved_micros,spent_micros,created_at,expires_at)
      SELECT ?,?,?,?,?,?,?,'pending',?,0,?,?
      WHERE EXISTS (SELECT 1 FROM player_profiles WHERE user_id=?)
      AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?)
      AND NOT EXISTS (SELECT 1 FROM coach_requests WHERE owner=? AND request_key=? AND (state IN ('pending','complete') OR fingerprint<>?))
      AND (?='review' OR (SELECT COUNT(*) FROM coach_requests WHERE owner=? AND review_id=? AND kind='reply' AND state IN ('pending','complete')) < 5)
      AND (SELECT COALESCE(SUM(CASE WHEN state='pending' THEN reserved_micros ELSE spent_micros END),0) FROM coach_requests WHERE month=?) + ? <= 20000000`)
      .bind(
        id,
        owner,
        key,
        fingerprint,
        kind,
        reviewId,
        month,
        reserveMicros,
        now,
        now + 90_000,
        owner,
        owner,
        owner,
        key,
        fingerprint,
        kind,
        owner,
        reviewId,
        month,
        reserveMicros,
      )
      .run();
    return result.meta.changes === 1;
  }
  async fail(id: string, spentMicros: number) {
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE coach_requests SET state='failed', spent_micros=? WHERE id=? AND state='pending'",
        )
        .bind(spentMicros, id),
      this.db
        .prepare(
          "UPDATE review_credit_reservations SET state='restored' WHERE id=? AND state='reserved'",
        )
        .bind(id),
    ]);
  }
  async finishReview(
    id: string,
    owner: string,
    matchId: string,
    language: Language,
    profile: TeachingProfile,
    document: CoachDocument,
    analysis: AnalysisLine[],
    history: SavedCoachHistory[],
    historyGaps: number,
    now: number,
    spent: number,
  ) {
    const results = await this.db.batch([
      this.db
        .prepare(`UPDATE review_credit_reservations SET state='committed'
        WHERE id=? AND owner=? AND match_id=? AND state='reserved'
          AND (source='intro'
            OR (source='beta' AND EXISTS (SELECT 1 FROM player_profiles p WHERE p.user_id=review_credit_reservations.owner AND p.trial_expires_at>?))
            OR (source='complimentary' AND EXISTS (SELECT 1 FROM complimentary_plus g JOIN user u ON lower(u.email)=g.email WHERE u.id=review_credit_reservations.owner AND u.email_verified=1 AND g.revoked_at IS NULL))
            OR (source='paid' AND EXISTS (SELECT 1 FROM review_credit_packs p WHERE p.id=review_credit_reservations.pack_id AND p.owner=review_credit_reservations.owner AND p.frozen=0 AND p.refunded=0 AND p.credits>(SELECT COUNT(*) FROM review_credit_reservations r WHERE r.pack_id=p.id AND r.state='committed')))
          ) AND EXISTS (SELECT 1 FROM coach_requests WHERE id=? AND owner=? AND state='pending' AND expires_at>?)
          AND EXISTS (SELECT 1 FROM player_profiles WHERE user_id=?) AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?)`)
        .bind(id, owner, matchId, now, id, owner, now, owner, owner),
      this.db
        .prepare(`INSERT INTO coach_reviews (id,owner,match_id,language,profile,document,analysis,history,history_gaps,created_at)
        SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM review_credit_reservations WHERE id=? AND owner=? AND match_id=? AND state='committed')
        AND EXISTS (SELECT 1 FROM coach_requests WHERE id=? AND owner=? AND state='pending' AND expires_at>?)
        AND EXISTS (SELECT 1 FROM player_profiles WHERE user_id=?) AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?)`)
        .bind(
          id,
          owner,
          matchId,
          language,
          profile,
          JSON.stringify(document),
          JSON.stringify(analysis),
          JSON.stringify(history),
          historyGaps,
          now,
          id,
          owner,
          matchId,
          id,
          owner,
          now,
          owner,
          owner,
        ),
      this.db
        .prepare(
          "UPDATE coach_requests SET state='complete',spent_micros=? WHERE id=? AND owner=? AND state='pending' AND expires_at>? AND EXISTS (SELECT 1 FROM coach_reviews WHERE id=? AND owner=?) AND EXISTS (SELECT 1 FROM player_profiles WHERE user_id=?) AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?)",
        )
        .bind(spent, id, owner, now, id, owner, owner, owner),
    ]);
    return results.every((result) => result.meta.changes === 1);
  }
  async finishReply(
    id: string,
    owner: string,
    reviewId: string,
    language: Language,
    question: string,
    document: CoachDocument,
    now: number,
    spent: number,
  ) {
    const results = await this.db.batch([
      this.db
        .prepare(`INSERT INTO coach_replies (id,owner,review_id,language,question,document,created_at)
        SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM coach_requests WHERE id=? AND owner=? AND state='pending' AND expires_at>?)
        AND EXISTS (SELECT 1 FROM player_profiles WHERE user_id=?) AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?)`)
        .bind(
          id,
          owner,
          reviewId,
          language,
          question,
          JSON.stringify(document),
          now,
          id,
          owner,
          now,
          owner,
          owner,
        ),
      this.db
        .prepare(
          "UPDATE coach_requests SET state='complete',spent_micros=? WHERE id=? AND owner=? AND state='pending' AND expires_at>? AND EXISTS (SELECT 1 FROM player_profiles WHERE user_id=?) AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?)",
        )
        .bind(spent, id, owner, now, owner, owner),
    ]);
    return results.every((result) => result.meta.changes === 1);
  }
  async review(owner: string, id: string): Promise<SavedReviewWithAnalysis | null> {
    const row = await this.db
      .prepare(
        'SELECT * FROM coach_reviews WHERE id=? AND owner=? AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?)',
      )
      .bind(id, owner, owner)
      .first<Row>();
    return row
      ? {
          id: row.id,
          matchId: row.match_id,
          language: row.language,
          profile: row.profile,
          document: JSON.parse(row.document),
          analysis: JSON.parse(row.analysis),
          history: row.history ? JSON.parse(row.history) : [],
          historyGaps: row.history_gaps ?? 0,
          createdAt: row.created_at,
        }
      : null;
  }
  async reviewByMatch(owner: string, matchId: string): Promise<SavedReviewWithAnalysis | null> {
    const row = await this.db
      .prepare(
        'SELECT * FROM coach_reviews WHERE match_id=? AND owner=? AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?) ORDER BY created_at DESC,id DESC LIMIT 1',
      )
      .bind(matchId, owner, owner)
      .first<Row>();
    return row
      ? {
          id: row.id,
          matchId: row.match_id,
          language: row.language,
          profile: row.profile,
          document: JSON.parse(row.document),
          analysis: JSON.parse(row.analysis),
          history: row.history ? JSON.parse(row.history) : [],
          historyGaps: row.history_gaps ?? 0,
          createdAt: row.created_at,
        }
      : null;
  }
  async replyCount(owner: string, reviewId: string) {
    const row = await this.db
      .prepare(
        "SELECT COUNT(*) AS used FROM coach_requests WHERE owner=? AND review_id=? AND kind='reply' AND state IN ('pending','complete')",
      )
      .bind(owner, reviewId)
      .first<{ used: number }>();
    return row?.used ?? 0;
  }
  async reviews(owner: string): Promise<SavedReview[]> {
    const rows = await this.db
      .prepare(
        'SELECT * FROM coach_reviews WHERE owner=? AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?) ORDER BY created_at DESC LIMIT 300',
      )
      .bind(owner, owner)
      .all<Row>();
    return rows.results.map((row) => ({
      id: row.id,
      matchId: row.match_id,
      language: row.language,
      profile: row.profile,
      document: JSON.parse(row.document),
      createdAt: row.created_at,
    }));
  }
  async replies(owner: string, reviewId: string): Promise<SavedReply[]> {
    const rows = await this.db
      .prepare(
        'SELECT * FROM coach_replies WHERE owner=? AND review_id=? AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?) ORDER BY created_at',
      )
      .bind(owner, reviewId, owner)
      .all<ReplyRow>();
    return rows.results.map((row) => ({
      id: row.id,
      reviewId: row.review_id,
      language: row.language,
      question: row.question,
      document: JSON.parse(row.document),
      createdAt: row.created_at,
    }));
  }
  async usage(owner: string, now: number) {
    const rows = await this.db
      .prepare(
        "SELECT kind, COUNT(*) AS used FROM coach_requests WHERE owner=? AND month=? AND state='complete' GROUP BY kind",
      )
      .bind(owner, monthKey(now))
      .all<{ kind: string; used: number }>();
    return {
      reviews: rows.results.find((row) => row.kind === 'review')?.used ?? 0,
      replies: rows.results.find((row) => row.kind === 'reply')?.used ?? 0,
    };
  }
  async deleteReview(owner: string, id: string) {
    // Successful-generation accounting remains even if the owner deletes saved text.
    await this.db.batch([
      this.db.prepare('DELETE FROM coach_replies WHERE owner=? AND review_id=?').bind(owner, id),
      this.db.prepare('DELETE FROM coach_reviews WHERE owner=? AND id=?').bind(owner, id),
    ]);
  }
}
export async function deleteCoachAccount(db: D1Database, owner: string) {
  await db.batch([
    db.prepare('DELETE FROM coach_replies WHERE owner=?').bind(owner),
    db.prepare('DELETE FROM coach_reviews WHERE owner=?').bind(owner),
    db
      .prepare(
        "UPDATE coach_requests SET owner=?,request_key=id,fingerprint='',review_id=NULL,state=CASE WHEN state='pending' THEN 'failed' ELSE state END,spent_micros=CASE WHEN state='pending' THEN reserved_micros ELSE spent_micros END WHERE owner=?",
      )
      .bind(`deleted:${crypto.randomUUID()}`, owner),
  ]);
}
