import { monthKey, type AnalysisLine, type CoachDocument, type SavedReply, type SavedReview } from '../shared/coaching';
import type { Language } from '../shared/waitlist';
import type { TeachingProfile } from '../shared/coaching';
export type Reservation = { id: string; owner: string; key: string; fingerprint: string; kind: 'review' | 'reply'; reviewId: string | null; now: number; limit: number; reserveMicros: number };
type Row = { id: string; owner: string; match_id: string; language: Language; profile: TeachingProfile; document: string; analysis: string; created_at: number };
type ReplyRow = { id: string; review_id: string; language: Language; question: string; document: string; created_at: number };
export type RequestState = { id: string; fingerprint: string; state: 'pending' | 'complete' | 'failed' };
export class CoachStore {
  constructor(private db: D1Database) {}
  async expire(now: number) {
    // A timed-out provider may still have billed. Preserve the reserved maximum in the cost ledger.
    await this.db.prepare("UPDATE coach_requests SET state='failed', spent_micros=reserved_micros WHERE state='pending' AND expires_at<=?").bind(now).run();
  }
  async existing(owner: string, key: string): Promise<RequestState | null> {
    return this.db.prepare('SELECT id, fingerprint, state FROM coach_requests WHERE owner=? AND request_key=? ORDER BY created_at DESC, rowid DESC LIMIT 1').bind(owner, key).first<RequestState>();
  }
  async reserve(input: Reservation): Promise<boolean> {
    const { id, owner, key, fingerprint, kind, reviewId, now, limit, reserveMicros } = input;
    const month = monthKey(now);
    const result = await this.db.prepare(`INSERT OR IGNORE INTO coach_requests
      (id,owner,request_key,fingerprint,kind,review_id,month,state,reserved_micros,spent_micros,created_at,expires_at)
      SELECT ?,?,?,?,?,?,?,'pending',?,0,?,?
      WHERE EXISTS (SELECT 1 FROM player_profiles WHERE user_id=?)
      AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?)
      AND NOT EXISTS (SELECT 1 FROM coach_requests WHERE owner=? AND request_key=? AND (state IN ('pending','complete') OR fingerprint<>?))
      AND (SELECT COUNT(*) FROM coach_requests WHERE owner=? AND month=? AND kind=? AND state IN ('pending','complete')) < ?
      AND (?='review' OR (SELECT COUNT(*) FROM coach_requests WHERE owner=? AND review_id=? AND kind='reply' AND state IN ('pending','complete')) < 20)
      AND (SELECT COALESCE(SUM(CASE WHEN state='pending' THEN reserved_micros ELSE spent_micros END),0) FROM coach_requests WHERE month=?) + ? <= 20000000`)
      .bind(id, owner, key, fingerprint, kind, reviewId, month, reserveMicros, now, now + 90_000,
        owner, owner, owner, key, fingerprint, owner, month, kind, limit, kind, owner, reviewId, month, reserveMicros).run();
    return result.meta.changes === 1;
  }
  async fail(id: string, spentMicros: number) {
    await this.db.prepare("UPDATE coach_requests SET state='failed', spent_micros=? WHERE id=? AND state='pending'").bind(spentMicros, id).run();
  }
  async finishReview(id: string, owner: string, matchId: string, language: Language, profile: TeachingProfile, document: CoachDocument, analysis: AnalysisLine[], now: number, spent: number) {
    const results = await this.db.batch([
      this.db.prepare(`INSERT INTO coach_reviews (id,owner,match_id,language,profile,document,analysis,created_at)
        SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM coach_requests WHERE id=? AND owner=? AND state='pending' AND expires_at>?)
        AND EXISTS (SELECT 1 FROM player_profiles WHERE user_id=?) AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?)`)
        .bind(id, owner, matchId, language, profile, JSON.stringify(document), JSON.stringify(analysis), now, id, owner, now, owner, owner),
      this.db.prepare("UPDATE coach_requests SET state='complete',spent_micros=? WHERE id=? AND owner=? AND state='pending' AND expires_at>? AND EXISTS (SELECT 1 FROM player_profiles WHERE user_id=?) AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?)").bind(spent, id, owner, now, owner, owner),
    ]);
    return results.every((result) => result.meta.changes === 1);
  }
  async finishReply(id: string, owner: string, reviewId: string, language: Language, question: string, document: CoachDocument, now: number, spent: number) {
    const results = await this.db.batch([
      this.db.prepare(`INSERT INTO coach_replies (id,owner,review_id,language,question,document,created_at)
        SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM coach_requests WHERE id=? AND owner=? AND state='pending' AND expires_at>?)
        AND EXISTS (SELECT 1 FROM player_profiles WHERE user_id=?) AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?)`)
        .bind(id, owner, reviewId, language, question, JSON.stringify(document), now, id, owner, now, owner, owner),
      this.db.prepare("UPDATE coach_requests SET state='complete',spent_micros=? WHERE id=? AND owner=? AND state='pending' AND expires_at>? AND EXISTS (SELECT 1 FROM player_profiles WHERE user_id=?) AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?)").bind(spent, id, owner, now, owner, owner),
    ]);
    return results.every((result) => result.meta.changes === 1);
  }
  async review(owner: string, id: string): Promise<(SavedReview & { analysis: AnalysisLine[] }) | null> {
    const row = await this.db.prepare('SELECT * FROM coach_reviews WHERE id=? AND owner=? AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?)').bind(id, owner, owner).first<Row>();
    return row ? { id: row.id, matchId: row.match_id, language: row.language, profile: row.profile, document: JSON.parse(row.document), analysis: JSON.parse(row.analysis), createdAt: row.created_at } : null;
  }
  async reviews(owner: string): Promise<SavedReview[]> {
    const rows = await this.db.prepare('SELECT * FROM coach_reviews WHERE owner=? AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?) ORDER BY created_at DESC LIMIT 300').bind(owner, owner).all<Row>();
    return rows.results.map((row) => ({ id: row.id, matchId: row.match_id, language: row.language, profile: row.profile, document: JSON.parse(row.document), createdAt: row.created_at }));
  }
  async replies(owner: string, reviewId: string): Promise<SavedReply[]> {
    const rows = await this.db.prepare('SELECT * FROM coach_replies WHERE owner=? AND review_id=? AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?) ORDER BY created_at').bind(owner, reviewId, owner).all<ReplyRow>();
    return rows.results.map((row) => ({ id: row.id, reviewId: row.review_id, language: row.language, question: row.question, document: JSON.parse(row.document), createdAt: row.created_at }));
  }
  async usage(owner: string, now: number) {
    const rows = await this.db.prepare("SELECT kind, COUNT(*) AS used FROM coach_requests WHERE owner=? AND month=? AND state IN ('complete','pending') GROUP BY kind").bind(owner, monthKey(now)).all<{ kind: string; used: number }>();
    return { reviews: rows.results.find((row) => row.kind === 'review')?.used ?? 0, replies: rows.results.find((row) => row.kind === 'reply')?.used ?? 0 };
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
    db.prepare("UPDATE coach_requests SET owner=?,request_key=id,fingerprint='',review_id=NULL,state=CASE WHEN state='pending' THEN 'failed' ELSE state END,spent_micros=CASE WHEN state='pending' THEN reserved_micros ELSE spent_micros END WHERE owner=?").bind(`deleted:${crypto.randomUUID()}`, owner),
  ]);
}
