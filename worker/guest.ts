import {
  guestCookieName,
  guestDisplayName,
  guestEmailDomain,
  guestMaxFinishedGames,
  guestRetentionDays,
  guestSessionDays,
  isGuestEmail,
  isGuestUserId,
} from '../shared/guest';
import { policyVersion } from '../shared/profile';
import { isLanguage } from '../shared/waitlist';
import type { Language } from '../shared/waitlist';

export interface GuestIdentity {
  id: string;
  name: string;
}

function guestEmail(id: string) {
  return `guest+${id}${guestEmailDomain}`;
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signPayload(secret: string, payload: string) {
  const key = await signingKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return encodeBase64Url(new Uint8Array(signature));
}

async function verifyPayload(secret: string, payload: string, signature: string) {
  try {
    const key = await signingKey(secret);
    return crypto.subtle.verify(
      'HMAC',
      key,
      decodeBase64Url(signature),
      new TextEncoder().encode(payload),
    );
  } catch {
    return false;
  }
}

function parseCookie(request: Request) {
  const raw = request.headers
    .get('Cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${guestCookieName}=`))
    ?.slice(guestCookieName.length + 1);
  return raw ? decodeURIComponent(raw) : null;
}

export function guestCookieAttributes(secure: boolean) {
  const attributes = [
    `Path=/`,
    `HttpOnly`,
    `SameSite=Strict`,
    `Max-Age=${guestSessionDays * 86_400}`,
  ];
  if (secure) {
    attributes.push('Secure');
  }
  return attributes.join('; ');
}

export async function readGuest(request: Request, env: Env): Promise<GuestIdentity | null> {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) {
    return null;
  }
  const value = parseCookie(request);
  if (!value) {
    return null;
  }
  const [payload, signature] = value.split('.');
  if (!payload || !signature) {
    return null;
  }
  let decoded: string;
  try {
    decoded = new TextDecoder().decode(decodeBase64Url(payload));
  } catch {
    return null;
  }
  const [id, exp] = decoded.split(':');
  if (!id || !exp || !isGuestUserId(id)) {
    return null;
  }
  const expires = Number(exp);
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    return null;
  }
  if (!(await verifyPayload(secret, decoded, signature))) {
    return null;
  }
  const row = await env.DB.prepare('SELECT id,name,email FROM user WHERE id=?')
    .bind(id)
    .first<{ id: string; name: string; email: string }>();
  if (!row || !isGuestEmail(row.email)) {
    return null;
  }
  return { id: row.id, name: row.name };
}

export async function issueGuestCookie(response: Response, env: Env, id: string, secure: boolean) {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) {
    return response;
  }
  const expires = Date.now() + guestSessionDays * 86_400_000;
  const payload = `${id}:${expires}`;
  const token = `${encodeBase64Url(new TextEncoder().encode(payload))}.${await signPayload(secret, payload)}`;
  response.headers.append(
    'Set-Cookie',
    `${guestCookieName}=${encodeURIComponent(token)}; ${guestCookieAttributes(secure)}`,
  );
  return response;
}

export function clearGuestCookie(response: Response, secure: boolean) {
  const attributes = ['Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (secure) {
    attributes.push('Secure');
  }
  response.headers.append('Set-Cookie', `${guestCookieName}=; ${attributes.join('; ')}`);
  return response;
}

async function guestLimiter(env: Env, request: Request) {
  if (!env.GUEST_LIMITER) {
    return true;
  }
  const { success } = await env.GUEST_LIMITER.limit({
    key: `guest:${request.headers.get('CF-Connecting-IP') ?? 'local'}`,
  });
  return success;
}

export async function createGuestSession(
  request: Request,
  env: Env,
  input: { adult: boolean; language: Language },
): Promise<{ identity: GuestIdentity; status: number; error?: string }> {
  if (!(await guestLimiter(env, request))) {
    return { identity: { id: '', name: '' }, status: 429, error: 'rate_limited' };
  }
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) {
    return { identity: { id: '', name: '' }, status: 503, error: 'unavailable' };
  }
  const existing = await readGuest(request, env);
  if (existing) {
    return { identity: existing, status: 200 };
  }
  const language = input.language;
  const id = `guest_${crypto.randomUUID()}`;
  const now = Date.now();
  const email = guestEmail(id);
  const name = guestDisplayName[language];
  const username = `g_${id.slice('guest_'.length).replaceAll('-', '')}`;
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,0,?,?)',
    ).bind(id, name, email, now, now),
    env.DB.prepare(
      `INSERT INTO player_profiles(user_id,username,language,timezone,chess_level,teaching_profile,activity_public,adult_attested_at,policy_version,onboarded_at,trial_expires_at)
       VALUES (?,?,?,'UTC','intermediate','developing',0,?,?,?,0)`,
    ).bind(id, username, language, now, policyVersion, now),
    env.DB.prepare(
      'INSERT INTO timezone_history(user_id,effective_at,timezone) VALUES (?,0,?)',
    ).bind(id, 'UTC'),
  ]);
  return { identity: { id, name }, status: 201 };
}

export async function guestFinishedGames(db: D1Database, owner: string) {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM matches WHERE owner=? AND finished_at IS NOT NULL')
    .bind(owner)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function guestWithinGameLimit(db: D1Database, owner: string) {
  return (await guestFinishedGames(db, owner)) < guestMaxFinishedGames;
}

export function parseGuestSessionBody(
  input: unknown,
): { adult: boolean; language: Language } | null {
  if (!input || typeof input !== 'object' || !('adult' in input) || input.adult !== true) {
    return null;
  }
  const language = 'language' in input && isLanguage(input.language) ? input.language : 'en-GB';
  return { adult: true, language };
}

export async function purgeGuestUsers(db: D1Database, now = Date.now()) {
  const cutoff = now - guestRetentionDays * 86_400_000;
  const guests = await db
    .prepare("SELECT id FROM user WHERE email LIKE 'guest+%@guest.ludus' AND created_at < ?")
    .bind(cutoff)
    .all<{ id: string }>();
  if (!guests.results.length) {
    return;
  }
  const statements = guests.results.flatMap(({ id }) => [
    db.prepare('DELETE FROM matches WHERE owner=?').bind(id),
    db.prepare('DELETE FROM player_profiles WHERE user_id=?').bind(id),
    db.prepare('DELETE FROM timezone_history WHERE user_id=?').bind(id),
    db.prepare('DELETE FROM user WHERE id=?').bind(id),
  ]);
  await db.batch(statements);
}
