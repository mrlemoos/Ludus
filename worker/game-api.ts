import { playReturnPath } from '../shared/navigation';
import { authFor, localDevelopment } from './auth';
import {
  clearGuestCookie,
  createGuestSession,
  guestWithinGameLimit,
  issueGuestCookie,
  parseGuestSessionBody,
  readGuest,
} from './guest';
import { forwardUpgrade } from './http';
import { invitations, matches } from './schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

async function resolvePlayer(request: Request, env: Env) {
  const session = await authFor(request, env).api.getSession({ headers: request.headers });
  if (session) {
    return { id: session.user.id, name: session.user.name, guest: false as const };
  }
  const guest = await readGuest(request, env);
  if (guest) {
    return { ...guest, guest: true as const };
  }
  return null;
}

function secureCookies(request: Request) {
  return new URL(request.url).protocol === 'https:';
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}
export async function gameApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (
    ![
      '/api/me',
      '/api/dev/sign-in',
      '/api/games',
      '/api/guest/session',
      '/api/guest/sign-out',
    ].includes(url.pathname) &&
    !url.pathname.startsWith('/api/auth/') &&
    !/^\/api\/games\/[0-9a-f-]{36}(\/socket)?$/.test(url.pathname)
  ) {
    return json({ error: 'not_found' }, 404);
  }
  if (request.method !== 'GET') {
    if (
      request.headers.get('Origin') !== url.origin ||
      request.headers.get('Sec-Fetch-Site') === 'cross-site'
    ) {
      return json({ error: 'forbidden' }, 403);
    }
    if (Number(request.headers.get('Content-Length')) > 4096) {
      return json({ error: 'too_large' }, 413);
    }
  }
  try {
    if (url.pathname === '/api/me' && request.method === 'GET') {
      const player = await resolvePlayer(request, env);
      return json({
        user: player ? { id: player.id, name: player.name } : null,
        guest: player?.guest ?? false,
        local: localDevelopment(request, env),
      });
    }
    if (url.pathname === '/api/guest/session' && request.method === 'POST') {
      const body = parseGuestSessionBody(await boundedJson(request));
      if (!body) {
        return json({ error: 'adult_confirmation_required' }, 400);
      }
      const created = await createGuestSession(request, env, body);
      if (created.error) {
        return json(
          { error: created.error },
          created.status,
          created.status === 429 ? { 'Retry-After': '60' } : {},
        );
      }
      return await issueGuestCookie(
        json({ user: created.identity, guest: true }, created.status),
        env,
        created.identity.id,
        secureCookies(request),
      );
    }
    if (url.pathname === '/api/guest/sign-out' && request.method === 'POST') {
      return clearGuestCookie(json({ ok: true }), secureCookies(request));
    }
    if (url.pathname === '/api/dev/sign-in' && request.method === 'POST') {
      if (!localDevelopment(request, env)) {
        return json({ error: 'not_found' }, 404);
      }
      let link: string | undefined;
      const auth = authFor(request, env, (url) => {
        link = url;
      });
      // Two fixed seeded identities allow real multiplayer checks; arbitrary email input is forbidden.
      const body = await boundedJson(request);
      const identity = body && typeof body === 'object' && 'account' in body ? body.account : 'leo';
      if (identity !== 'leo' && identity !== 'friend') {
        return json({ error: 'invalid' }, 400);
      }
      const email = identity === 'friend' ? 'ludus-friend@example.test' : 'leo.lemos.ds@icloud.com';
      const invited = await drizzle(env.DB)
        .select()
        .from(invitations)
        .where(eq(invitations.email, email))
        .get();
      if (!invited) {
        return json({ error: 'seed_required' }, 409);
      }
      await auth.api.signInMagicLink({
        body: {
          email,
          name: identity === 'friend' ? 'Friend' : 'Leo',
          callbackURL: `${url.origin}${playReturnPath(body && typeof body === 'object' && 'returnTo' in body ? body.returnTo : null)}`,
        },
        headers: request.headers,
      });
      return link ? json({ url: link }) : json({ error: 'unavailable' }, 503);
    }
    if (url.pathname.startsWith('/api/auth/')) {
      if (request.method === 'POST') {
        const body = await boundedJson(request);
        if (!body || typeof body !== 'object') {
          return json({ error: 'invalid' }, 400);
        }
        if (
          url.pathname === '/api/auth/sign-in/magic-link' &&
          (!('adult' in body) || body.adult !== true)
        ) {
          return json({ error: 'adult_confirmation_required' }, 400);
        }
        const headers = new Headers(request.headers);
        headers.delete('Content-Length');
        return authFor(request, env).handler(
          new Request(request, { headers, body: JSON.stringify(body) }),
        );
      }
      return authFor(request, env).handler(request);
    }
    const player = await resolvePlayer(request, env);
    if (!player) {
      return json({ error: 'unauthorised' }, 401);
    }
    const owner = player.id;
    if (
      await env.DB.prepare('SELECT user_id FROM account_deletions WHERE user_id=?')
        .bind(owner)
        .first()
    ) {
      return json({ error: 'account_deleted' }, 403);
    }
    const db = drizzle(env.DB);
    if (url.pathname === '/api/games') {
      if (request.method === 'GET') {
        return json(
          await db
            .select()
            .from(matches)
            .where(eq(matches.owner, owner))
            .orderBy(desc(matches.createdAt))
            .limit(30),
        );
      }
      if (request.method !== 'POST') {
        return json({ error: 'method' }, 405);
      }
      if (player.guest) {
        if (env.GUEST_LIMITER) {
          const { success } = await env.GUEST_LIMITER.limit({
            key: `guest-game:${request.headers.get('CF-Connecting-IP') ?? 'local'}`,
          });
          if (!success) {
            return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
          }
        }
        if (!(await guestWithinGameLimit(env.DB, owner))) {
          return json({ error: 'guest_limit_reached' }, 403);
        }
      }
      const profile = await env.DB.prepare('SELECT user_id FROM player_profiles WHERE user_id=?')
        .bind(owner)
        .first();
      if (!profile) {
        return json({ error: 'onboarding_required' }, 403);
      }
      const input = await boundedJson(request);
      if (
        !input ||
        typeof input !== 'object' ||
        !('control' in input) ||
        !['5+3', '10+5'].includes(String(input.control)) ||
        !('difficulty' in input) ||
        typeof input.difficulty !== 'number' ||
        ![1, 2, 3, 4].includes(input.difficulty) ||
        !('colour' in input) ||
        !['w', 'b'].includes(String(input.colour))
      ) {
        return json({ error: 'invalid' }, 400);
      }
      // Resume an unfinished game instead of silently abandoning it.
      const active = await db
        .select()
        .from(matches)
        .where(and(eq(matches.owner, owner), isNull(matches.result)))
        .orderBy(desc(matches.createdAt))
        .limit(1)
        .get();
      if (active) {
        const current = await env.MATCHES.getByName(active.id).read(owner);
        if (!current || !current.game.result) {
          await env.MATCHMAKING.getByName('beta').reserveComputer(owner, active.id);
          if (current) {
            return json(current);
          }
          const recovered = await env.MATCHES.getByName(active.id).initialise(
            active.id,
            owner,
            active.control,
            active.difficulty as 1 | 2 | 3 | 4,
            active.colour,
          );
          return json({ game: recovered, serverNow: Date.now() });
        }
      }
      const id = crypto.randomUUID();
      const coordinator = env.MATCHMAKING.getByName('beta');
      await coordinator.reserveComputer(owner, id);
      try {
        const inserted = await env.DB.prepare(
          'INSERT INTO matches(id,owner,created_at,control,difficulty,colour) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM player_profiles WHERE user_id=?) AND NOT EXISTS(SELECT 1 FROM account_deletions WHERE user_id=?)',
        )
          .bind(id, owner, Date.now(), input.control, input.difficulty, input.colour, owner, owner)
          .run();
        if (!inserted.meta.changes) {
          await coordinator.releaseComputer(owner, id);
          return json({ error: 'account_deleted' }, 403);
        }
      } catch (error) {
        await coordinator.releaseComputer(owner, id);
        throw error;
      }
      const game = await env.MATCHES.getByName(id).initialise(
        id,
        owner,
        input.control as '5+3' | '10+5',
        Number(input.difficulty) as 1 | 2 | 3 | 4,
        input.colour as 'w' | 'b',
      );
      return json({ game, serverNow: Date.now() });
    }
    const match = /^\/api\/games\/([0-9a-f-]{36})(\/socket)?$/.exec(url.pathname);
    if (!match) {
      return json({ error: 'not_found' }, 404);
    }
    const stub = env.MATCHES.getByName(match[1]);
    if (match[2]) {
      if (request.headers.get('Origin') !== url.origin) {
        return json({ error: 'forbidden' }, 403);
      }
      return stub.fetch(request, forwardUpgrade(request, owner));
    }
    if (request.method === 'GET') {
      const current = await stub.read(owner);
      return current ? json(current) : json({ error: 'not_found' }, 404);
    }
    if (request.method !== 'POST') {
      return json({ error: 'method' }, 405);
    }
    const result = await stub.act(owner, await boundedJson(request));
    return json(result, 'error' in result ? 409 : 200);
  } catch (error) {
    console.error({
      event: 'game_request_failed',
      message: error instanceof Error ? error.message : 'unknown',
    });
    return json({ error: 'unavailable' }, 503);
  }
}
async function boundedJson(request: Request): Promise<unknown> {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') {
    return null;
  }
  const reader = request.body?.getReader();
  if (!reader) {
    return null;
  }
  const bytes = new Uint8Array(4096);
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (size + value.length > bytes.length) {
      await reader.cancel();
      return null;
    }
    bytes.set(value, size);
    size += value.length;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)));
  } catch {
    return null;
  }
}
