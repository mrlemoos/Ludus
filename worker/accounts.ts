import { authFor } from './auth';
import { dailyActivity, earnsActivity, localDate, timezoneChange } from '../shared/activity';
import { isOperator, parseProfile, policyVersion, publicProfile, type PlayerProfile } from '../shared/profile';
import type { Language } from '../shared/waitlist';
import { deleteCoachAccount } from './coach-store';
import { cancelAccountBilling } from './billing';

const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
type ProfileRow = { user_id: string; username: string; language: Language; timezone: string; pending_timezone: string | null; timezone_effective_at: number | null; chess_level: PlayerProfile['chessLevel']; teaching_profile: PlayerProfile['teachingProfile']; activity_public: number; adult_attested_at: number; policy_version: string; onboarded_at: number; trial_expires_at: number; mutation_id: string };
export async function loadPlayerProfile(db: D1Database, owner: string, now = Date.now()): Promise<PlayerProfile | null> {
  const p = await db.prepare('SELECT * FROM player_profiles WHERE user_id = ? AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE user_id=?)').bind(owner, owner).first<ProfileRow>();
  if (!p) return null;
  return profileFromRow(p, now);
}
function profileFromRow(p: ProfileRow, now: number): PlayerProfile {
  const active = p.timezone_effective_at !== null && p.timezone_effective_at <= now;
  return { userId: p.user_id, username: p.username, language: p.language, timezone: active ? p.pending_timezone ?? p.timezone : p.timezone,
    pendingTimezone: active ? null : p.pending_timezone, timezoneEffectiveAt: active ? null : p.timezone_effective_at,
    chessLevel: p.chess_level, teachingProfile: p.teaching_profile, activityPublic: !!p.activity_public,
    adultAttestedAt: p.adult_attested_at, policyVersion: p.policy_version, onboardedAt: p.onboarded_at, trialExpiresAt: p.trial_expires_at };
}
export async function recordActivity(db: D1Database, input: { gameId: string; players: readonly string[]; reason: string; moves: number; completedAt: number }) {
  if (!earnsActivity(input.reason, input.moves)) return;
  for (const player of new Set(input.players)) {
    const zone = await db.prepare('SELECT timezone FROM timezone_history WHERE user_id = ? AND effective_at <= ? ORDER BY effective_at DESC LIMIT 1').bind(player, input.completedAt).first<{ timezone: string }>();
    if (!zone) continue;
    await db.prepare('INSERT OR IGNORE INTO activity_events(user_id,game_id,completed_at,date,timezone) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM player_profiles WHERE user_id = ?) AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE user_id=?)')
      .bind(player, input.gameId, input.completedAt, localDate(input.completedAt, zone.timezone), zone.timezone, player, player).run();
  }
}
export async function readActivity(db: D1Database, owner: string, timezone: string, now = Date.now()) {
  const rows = await db.prepare('SELECT date FROM activity_events WHERE user_id = ? ORDER BY date').bind(owner).all<{ date: string }>();
  const today = localDate(now, timezone);
  return { ...dailyActivity(rows.results, today), today };
}
export async function boundedBody(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 8192) { await reader.cancel(); return null; } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; } catch { return null; }
}
async function saveProfile(db: D1Database, owner: string, body: unknown, now: number) {
  const input = parseProfile(body);
  if (!input) return response({ error: 'invalid_profile' }, 400);
  const row = await db.prepare('SELECT * FROM player_profiles WHERE user_id = ? AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE user_id=?)').bind(owner, owner).first<ProfileRow>();
  const previous = row ? profileFromRow(row, now) : null;
  const mutation = crypto.randomUUID();
  const zone = previous ? timezoneChange(previous, input.timezone, now) : { timezone: input.timezone, pendingTimezone: null, timezoneEffectiveAt: null };
  try {
    const statements = [db.prepare(`INSERT INTO player_profiles(user_id,username,language,timezone,pending_timezone,timezone_effective_at,chess_level,teaching_profile,activity_public,adult_attested_at,policy_version,onboarded_at,trial_expires_at,mutation_id)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=?)
      ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,language=excluded.language,timezone=excluded.timezone,pending_timezone=excluded.pending_timezone,timezone_effective_at=excluded.timezone_effective_at,chess_level=excluded.chess_level,teaching_profile=excluded.teaching_profile,activity_public=excluded.activity_public,mutation_id=excluded.mutation_id WHERE player_profiles.mutation_id = ?`)
      .bind(owner, input.username, input.language, zone.timezone, zone.pendingTimezone, zone.timezoneEffectiveAt, input.chessLevel, input.teachingProfile, input.activityPublic ? 1 : 0, now, policyVersion, now, now + 30 * 86400000, mutation, owner, row?.mutation_id ?? '')];
    if (!previous) statements.push(db.prepare('INSERT OR IGNORE INTO timezone_history(user_id,effective_at,timezone) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM player_profiles WHERE user_id=? AND mutation_id=?)').bind(owner, now, input.timezone, owner, mutation));
    statements.push(db.prepare('DELETE FROM timezone_history WHERE user_id = ? AND effective_at > ? AND EXISTS (SELECT 1 FROM player_profiles WHERE user_id=? AND mutation_id=?)').bind(owner, now, owner, mutation));
    if (zone.pendingTimezone && zone.timezoneEffectiveAt !== null) statements.push(db.prepare('INSERT INTO timezone_history(user_id,effective_at,timezone) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM player_profiles WHERE user_id=? AND mutation_id=?) ON CONFLICT(user_id,effective_at) DO UPDATE SET timezone=excluded.timezone').bind(owner, zone.timezoneEffectiveAt, zone.pendingTimezone, owner, mutation));
    const results = await db.batch(statements);
    if (!results[0].meta.changes) return response({ error: 'profile_changed_retry' }, 409);
  } catch (error) {
    if (String(error).includes('UNIQUE constraint failed: player_profiles.username')) return response({ error: 'username_taken' }, 409);
    throw error;
  }
  return response({ profile: await loadPlayerProfile(db, owner, now) });
}
export async function purgeExpiredPersonalData(db: D1Database, now = Date.now()) {
  await db.batch([
    db.prepare('DELETE FROM waitlist WHERE created_at < ? AND email NOT IN (SELECT email FROM invitations WHERE redeemed_by IS NOT NULL OR expires_at>?)').bind(Math.floor((now - 180 * 86400000) / 1000), now),
    db.prepare('DELETE FROM invitations WHERE redeemed_by IS NULL AND expires_at < ?').bind(now - 30 * 86400000),
    db.prepare('DELETE FROM invitation_deliveries WHERE created_at < ?').bind(now - 30 * 86400000),
    db.prepare('DELETE FROM invitation_batches WHERE created_at < ?').bind(now - 30 * 86400000),
  ]);
  const hasReports = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='match_reports'").first();
  if (hasReports) await db.prepare('DELETE FROM match_reports WHERE created_at < ?').bind(now - 90 * 86400000).run();
}
async function deleteAccount(env: Env, owner: string, email: string, now: number) {
  // The tombstone blocks play/purchases. Retain only deletion-status/retry access until billing is cancelled.
  await env.DB.prepare('INSERT OR IGNORE INTO account_deletions(user_id,requested_at) VALUES (?,?)').bind(owner, now).run();
  // Retain the retryable tombstone and reconciliation linkage if provider cancellation fails.
  await cancelAccountBilling(env, owner);
  await env.DB.prepare('DELETE FROM session WHERE user_id = ?').bind(owner).run();
  const games = await env.DB.prepare('SELECT id FROM matches WHERE owner = ?').bind(owner).all<{ id: string }>();
  for (const game of games.results) {
    const stub = env.MATCHES.getByName(game.id) as unknown as { anonymise: (owner: string) => Promise<unknown> };
    await stub.anonymise(owner);
  }
  const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>();
  const names = new Set(tables.results.map((row) => row.name));
  if (names.has('online_matches')) {
    const online = await env.DB.prepare('SELECT id FROM online_matches WHERE white_id=? OR black_id=?').bind(owner, owner).all<{ id: string }>();
    for (const game of online.results) await env.HUMAN_MATCHES.getByName(game.id).anonymise(owner);
  }
  if (names.has('coach_requests')) await deleteCoachAccount(env.DB, owner);
  const matchmaking = env as unknown as { MATCHMAKING?: { getByName(name: string): { removeUser(id: string): Promise<void> } } };
  if (matchmaking.MATCHMAKING) await matchmaking.MATCHMAKING.getByName('beta').removeUser(owner);
  const cleanup = ['player_profiles', 'activity_events', 'timezone_history', 'account', 'session'].map((table) => env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(owner));
  if (names.has('ratings')) cleanup.push(env.DB.prepare('DELETE FROM ratings WHERE user_id = ?').bind(owner));
  if (names.has('match_reports')) cleanup.push(
    env.DB.prepare('UPDATE match_reports SET reporter_id=CASE WHEN reporter_id=? THEN ? ELSE reporter_id END,opponent_id=CASE WHEN opponent_id=? THEN ? ELSE opponent_id END,reviewed_by=CASE WHEN reviewed_by=? THEN ? ELSE reviewed_by END WHERE reporter_id=? OR opponent_id=? OR reviewed_by=?')
      .bind(owner, `deleted:${owner}`, owner, `deleted:${owner}`, owner, `deleted:${owner}`, owner, owner, owner),
  );
  // Coach table names are fixed application contracts, never supplied by a request.
  for (const table of ['player_cosmetics']) {
    if (!names.has(table)) continue;
    const columns = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    const column = columns.results.find((entry) => ['user_id', 'owner'].includes(entry.name))?.name;
    if (column) cleanup.push(env.DB.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).bind(owner));
  }
  cleanup.push(
    env.DB.prepare('DELETE FROM invitations WHERE email = ?').bind(email.toLowerCase()),
    env.DB.prepare('DELETE FROM waitlist WHERE email = ?').bind(email.toLowerCase()),
    env.DB.prepare('UPDATE invitation_deliveries SET email = CASE WHEN email=? THEN ? ELSE email END, operator_id = CASE WHEN operator_id = ? THEN ? ELSE operator_id END WHERE email = ? OR operator_id = ?').bind(email.toLowerCase(), `${owner}@deleted.invalid`, owner, 'deleted', email.toLowerCase(), owner),
    env.DB.prepare("UPDATE invitation_batches SET operator_id=CASE WHEN operator_id=? THEN 'deleted' ELSE operator_id END,fingerprint='' WHERE operator_id=? OR id IN (SELECT batch_id FROM invitation_deliveries WHERE email=?)").bind(owner, owner, `${owner}@deleted.invalid`),
    env.DB.prepare('UPDATE user SET name = ?,email = ?,email_verified = 0,image = NULL,updated_at = ? WHERE id = ?').bind('Deleted player', `${owner}@deleted.invalid`, now, owner),
    env.DB.prepare('UPDATE account_deletions SET completed_at = ? WHERE user_id = ?').bind(now, owner),
  );
  await env.DB.batch(cleanup);
}
export async function resumeAccountDeletions(env: Env) {
  const rows = await env.DB.prepare('SELECT d.user_id,u.email FROM account_deletions d JOIN user u ON u.id=d.user_id WHERE d.completed_at IS NULL').all<{ user_id: string; email: string }>();
  let failed = false;
  for (const row of rows.results) {
    try { await deleteAccount(env, row.user_id, row.email, Date.now()); }
    catch { failed = true; }
  }
  if (failed) throw new Error('account_deletions_pending');
}
type Delivery = { id: string; batch_id: string; email: string; language: Language; created_at: number; expires_at: number; sent_at: number | null; status: string };
const invitationCopy = {
  'en-GB': { subject: 'Your Ludus beta invitation', text: 'Your table is ready. Sign in with this invited email within seven days. Your 30 days of Plus start after onboarding. No card required.' },
  'es-ES': { subject: 'Tu invitación a la beta de Ludus', text: 'Tu mesa está lista. Inicia sesión con este correo invitado en siete días. Tus 30 días de Plus empiezan al completar tu perfil. Sin tarjeta.' },
  'fr-FR': { subject: 'Votre invitation à la bêta Ludus', text: 'Votre table est prête. Connectez-vous avec cet e-mail sous sept jours. Vos 30 jours de Plus commencent après votre inscription. Sans carte bancaire.' },
};
async function invitationBatch(request: Request, env: Env, operatorId: string, body: Record<string, unknown>, now: number) {
  const action = new URL(request.url).pathname.endsWith('/preview') ? 'preview' : 'send';
  if (typeof body.batchId !== 'string' || !/^[0-9a-f-]{36}$/.test(body.batchId)) return response({ error: 'invalid_batch' }, 400);
  const batchId = body.batchId;
  if (action === 'preview') {
    if (!Array.isArray(body.emails) || body.emails.length < 1 || body.emails.length > 10 || body.emails.some((email) => typeof email !== 'string')) return response({ error: 'invalid_batch' }, 400);
    const emails = [...new Set((body.emails as string[]).map((email) => email.trim().toLowerCase()))];
    const existing = await env.DB.prepare('SELECT * FROM invitation_deliveries WHERE batch_id = ? ORDER BY email').bind(batchId).all<Delivery>();
    if (existing.results.length) {
      const batch = await env.DB.prepare('SELECT reissue FROM invitation_batches WHERE id=?').bind(batchId).first<{ reissue: number }>();
      if (existing.results.map((d) => d.email).sort().join(',') !== emails.sort().join(',') || !!batch?.reissue !== (body.reissue === true)) return response({ error: 'batch_conflict' }, 409);
      return response({ batchId, invitations: existing.results });
    }
    const members = await env.DB.prepare(`SELECT email,language FROM waitlist WHERE email IN (${emails.map(() => '?').join(',')})`).bind(...emails).all<{ email: string; language: Language }>();
    if (members.results.length !== emails.length) return response({ error: 'waitlist_member_missing' }, 400);
    const fingerprint = JSON.stringify([...emails].sort());
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO invitation_batches(id,fingerprint,operator_id,reissue,created_at) VALUES (?,?,?,?,?)').bind(batchId, fingerprint, operatorId, body.reissue === true ? 1 : 0, now),
      ...members.results.map((member) => env.DB.prepare('INSERT OR IGNORE INTO invitation_deliveries(id,batch_id,email,operator_id,language,created_at,expires_at,status) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM invitation_batches WHERE id=? AND fingerprint=? AND reissue=?)')
        .bind(crypto.randomUUID(), batchId, member.email, operatorId, member.language, now, now + 7 * 86400000, 'pending', batchId, fingerprint, body.reissue === true ? 1 : 0)),
    ]);
    const batch = await env.DB.prepare('SELECT fingerprint,reissue FROM invitation_batches WHERE id=?').bind(batchId).first<{ fingerprint: string; reissue: number }>();
    if (batch?.fingerprint !== fingerprint || !!batch.reissue !== (body.reissue === true)) return response({ error: 'batch_conflict' }, 409);
    return response({ batchId, invitations: (await env.DB.prepare('SELECT * FROM invitation_deliveries WHERE batch_id = ? ORDER BY email').bind(batchId).all<Delivery>()).results });
  }
  if (body.capacityConfirmed !== true) return response({ error: 'capacity_confirmation_required' }, 400);
  if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) return response({ error: 'email_unconfigured' }, 503);
  const rows = await env.DB.prepare('SELECT * FROM invitation_deliveries WHERE batch_id = ? ORDER BY email').bind(batchId).all<Delivery>();
  const batch = await env.DB.prepare('SELECT reissue FROM invitation_batches WHERE id=?').bind(batchId).first<{ reissue: number }>();
  if (!rows.results.length || rows.results.length > 10) return response({ error: 'invalid_batch' }, 400);
  let sent = 0;
  for (const delivery of rows.results) {
    if (delivery.sent_at !== null) { sent++; continue; }
    // Provider idempotency keys expire after 24 hours. Never retry an uncertain delivery beyond that window.
    if (delivery.expires_at <= now || (delivery.status === 'sending' && delivery.created_at + 23 * 3600000 <= now)) return response({ error: 'batch_requires_reissue', sent }, 409);
    const admitted = await env.DB.prepare('SELECT redeemed_by FROM invitations WHERE email = ?').bind(delivery.email).first<{ redeemed_by: string | null }>();
    if (admitted?.redeemed_by) return response({ error: 'already_admitted', sent }, 409);
    const changes = await env.DB.batch([
      env.DB.prepare('INSERT INTO invitations(email,expires_at,delivery_id) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET expires_at=excluded.expires_at,delivery_id=excluded.delivery_id WHERE invitations.redeemed_by IS NULL AND (invitations.delivery_id=excluded.delivery_id OR invitations.expires_at<=? OR ?=1)').bind(delivery.email, delivery.expires_at, delivery.id, now, batch?.reissue ?? 0),
      env.DB.prepare("UPDATE invitation_deliveries SET status='sending' WHERE id=? AND sent_at IS NULL").bind(delivery.id),
    ]);
    if (!changes[0].meta.changes) return response({ error: 'explicit_reissue_required', sent }, 409);
    const copy = invitationCopy[delivery.language];
    const sentResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `ludus-invite/${delivery.id}` },
      body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to: delivery.email, subject: copy.subject, text: `${copy.text}\n${new URL('/play', request.url).href}` }), signal: AbortSignal.timeout(10000),
    });
    if (!sentResponse.ok) return response({ error: 'delivery_unavailable', sent }, 503);
    await env.DB.prepare("UPDATE invitation_deliveries SET sent_at=?,status='sent' WHERE id=?").bind(now, delivery.id).run();
    sent++;
  }
  return response({ batchId, sent });
}
export async function accountsApi(request: Request, env: Env): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== '/api/account' && !path.startsWith('/api/profiles/') && !path.startsWith('/api/operator/')) return null;
  if (request.method !== 'GET' && (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site')) return response({ error: 'forbidden' }, 403);
  try {
    if (path.startsWith('/api/profiles/') && request.method === 'GET') {
      const username = decodeURIComponent(path.slice('/api/profiles/'.length));
      if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return response({ error: 'not_found' }, 404);
      const user = await env.DB.prepare('SELECT user_id FROM player_profiles WHERE username = ? COLLATE NOCASE').bind(username).first<{ user_id: string }>();
      const profile = user ? await loadPlayerProfile(env.DB, user.user_id) : null;
      if (!profile) return response({ error: 'not_found' }, 404);
      const ratings = await env.DB.prepare('SELECT control,rating,deviation,games FROM ratings WHERE user_id = ?').bind(profile.userId).all<{ control: string; rating: number; deviation: number; games: number }>();
      const ranks = ['5+3', '10+5'].map((control) => ratings.results.find((rating) => rating.control === control) ?? { control, rating: 1500, deviation: 350, games: 0 });
      return response({ ...publicProfile(profile), ratings: ranks, ...(profile.activityPublic ? { activity: await readActivity(env.DB, profile.userId, profile.timezone) } : {}) });
    }
    const session = await authFor(request, env).api.getSession({ headers: request.headers });
    if (!session) return response({ error: 'unauthorised' }, 401);
    const deleting = await env.DB.prepare('SELECT user_id,completed_at FROM account_deletions WHERE user_id = ?').bind(session.user.id).first<{ user_id: string; completed_at: number | null }>();
    if (deleting && path === '/api/account' && deleting.completed_at === null && request.method === 'GET') return response({ deletionPending: true }, 202);
    if (deleting && !(path === '/api/account' && deleting.completed_at === null && request.method === 'DELETE')) return response({ error: 'account_deleted' }, 403);
    if (path === '/api/account') {
      if (request.method === 'GET') {
        const profile = await loadPlayerProfile(env.DB, session.user.id);
        return response({ profile, operator: isOperator(session.user, env.OPERATOR_IDS), ...(profile ? { activity: await readActivity(env.DB, profile.userId, profile.timezone) } : {}) });
      }
      if (request.method === 'POST') return await saveProfile(env.DB, session.user.id, await boundedBody(request), Date.now());
      if (request.method === 'DELETE') {
        const body = await boundedBody(request);
        if (body?.confirmation !== 'DELETE') return response({ error: 'confirmation_required' }, 400);
        try { await deleteAccount(env, session.user.id, session.user.email, Date.now()); }
        catch { return response({ deletionPending: true }, 202); }
        return response({ deleted: true });
      }
      return response({ error: 'method' }, 405);
    }
    if (!isOperator(session.user, env.OPERATOR_IDS)) return response({ error: 'forbidden' }, 403);
    if (path === '/api/operator/billing' && request.method === 'GET') {
      return response({ cases: (await env.DB.prepare('SELECT id,reason,resource,created_at,resolved_at FROM billing_review_cases ORDER BY resolved_at IS NOT NULL,created_at DESC LIMIT 200').all()).results });
    }
    if (path === '/api/operator/billing' && request.method === 'POST') {
      const body = await boundedBody(request);
      if (!body || typeof body.caseId !== 'string' || body.caseId.length > 250) return response({ error: 'invalid' }, 400);
      const updated = await env.DB.prepare('UPDATE billing_review_cases SET resolved_at=? WHERE id=? AND resolved_at IS NULL').bind(Date.now(), body.caseId).run();
      return updated.meta.changes ? response({ resolved: true }) : response({ error: 'not_found' }, 404);
    }
    if (path === '/api/operator/waitlist' && request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT w.email,w.language,w.created_at,i.expires_at,i.redeemed_at FROM waitlist w LEFT JOIN invitations i ON i.email=w.email ORDER BY w.created_at LIMIT 200').all();
      return response({ members: rows.results });
    }
    if (['/api/operator/invitations/preview', '/api/operator/invitations/send'].includes(path) && request.method === 'POST') {
      const body = await boundedBody(request);
      return body ? await invitationBatch(request, env, session.user.id, body, Date.now()) : response({ error: 'invalid' }, 400);
    }
    if (path === '/api/operator/reports' && request.method === 'GET') {
      return response({ reports: (await env.DB.prepare('SELECT * FROM match_reports ORDER BY created_at DESC LIMIT 200').all()).results });
    }
    if (path === '/api/operator/reports' && request.method === 'POST') {
      const body = await boundedBody(request);
      if (!body || typeof body.reportId !== 'string' || !['reviewed', 'dismissed'].includes(String(body.status))) return response({ error: 'invalid' }, 400);
      const result = await env.DB.prepare('UPDATE match_reports SET status=?,reviewed_by=?,reviewed_at=? WHERE id=?').bind(body.status, session.user.id, Date.now(), body.reportId).run();
      return result.meta.changes ? response({ updated: true }) : response({ error: 'not_found' }, 404);
    }
    return response({ error: 'not_found' }, 404);
  } catch {
    return response({ error: 'unavailable' }, 503);
  }
}
