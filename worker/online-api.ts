import type { Control } from '../shared/game';
import {
  type PhraseId,
  RATED_ENABLED,
  RATED_GATE,
  phraseIds,
  reportCategories,
} from '../shared/human-game';
import { initialRating } from '../shared/rating';
function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } }); }
async function body(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') {return null;}
  const reader = request.body?.getReader();
  if (!reader) {return null;}
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) {break;}
    size += value.length;
    if (size > 4096) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
export async function onlineApi(
  request: Request,
  env: Env,
  user: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/online/')) {return null;}
  const coordinator = env.MATCHMAKING.getByName('beta');
  if (
    request.method !== 'GET' &&
    (request.headers.get('Origin') !== url.origin ||
      request.headers.get('Sec-Fetch-Site') === 'cross-site')
  )
    {return json({ error: 'forbidden' }, 403);}
  try {
    if (url.pathname === '/api/online/status' && request.method === 'GET')
      {return json({
        ...(await coordinator.status(user)),
        ratedEnabled: RATED_ENABLED,
        ratedGate: RATED_GATE,
      });}
    if (url.pathname === '/api/online/history' && request.method === 'GET')
      {return json(
        (
          await env.DB.prepare(
            'SELECT id,control,rated,result,finished_at FROM online_matches WHERE white_id=? OR black_id=? ORDER BY finished_at DESC,id DESC LIMIT 30',
          )
            .bind(user, user)
            .all()
        ).results,
      );}
    if (url.pathname === '/api/online/socket' && request.method === 'GET') {
      if (request.headers.get('Origin') !== url.origin) {return json({ error: 'forbidden' }, 403);}
      return coordinator.fetch(
        new Request(request.url, { headers: { Upgrade: 'websocket', 'X-Player': user } }),
      );
    }
    const match = /^\/api\/online\/games\/([0-9a-f-]{36})(?:\/(socket|phrase|report))?$/.exec(
      url.pathname,
    );
    if (match) {
      const stub = env.HUMAN_MATCHES.getByName(match[1]);
      if (match[2] === 'socket' && request.method === 'GET') {
        if (request.headers.get('Origin') !== url.origin) {return json({ error: 'forbidden' }, 403);}
        return stub.fetch(
          new Request(request.url, { headers: { Upgrade: 'websocket', 'X-Player': user } }),
        );
      }
      if (!match[2] && request.method === 'GET') {
        const snapshot = await stub.read(user);
        return snapshot ? json(snapshot) : json({ error: 'not_found' }, 404);
      }
      if (request.method !== 'POST') {return json({ error: 'method' }, 405);}
      const input = await body(request);
      if (!input) {return json({ error: 'invalid' }, 400);}
      if (match[2] === 'phrase') {
        if (!phraseIds.includes(input.phrase as PhraseId)) {return json({ error: 'invalid' }, 400);}
        return json(await stub.phrase(user, input.phrase as PhraseId));
      }
      if (match[2] === 'report') {
        if (!reportCategories.includes(input.category as (typeof reportCategories)[number]))
          {return json({ error: 'invalid' }, 400);}
        return json(await stub.report(user, input.category as (typeof reportCategories)[number]));
      }
      const result = await stub.act(user, input);
      return json(result, 'error' in result ? 409 : 200);
    }
    if (request.method !== 'POST') {return json({ error: 'not_found' }, 404);}
    const input = await body(request);
    if (!input) {return json({ error: 'invalid' }, 400);}
    if (url.pathname === '/api/online/queue') {
      if (!['5+3', '10+5'].includes(String(input.control)) || typeof input.rated !== 'boolean')
        {return json({ error: 'invalid' }, 400);}
      const rating = await env.DB.prepare(
        'SELECT rating FROM ratings WHERE user_id=? AND control=?',
      )
        .bind(user, input.control)
        .first<{ rating: number }>();
      return json(
        await coordinator.join(
          user,
          input.control as Control,
          input.rated,
          rating?.rating ?? initialRating().rating,
        ),
      );
    }
    if (url.pathname === '/api/online/queue/cancel' || url.pathname === '/api/online/queue/ai') {
      if (typeof input.token !== 'string') {return json({ error: 'invalid' }, 400);}
      return json(await coordinator.cancel(user, input.token, url.pathname.endsWith('/ai')));
    }
    if (url.pathname === '/api/online/invitations') {
      if (!['5+3', '10+5'].includes(String(input.control)) || 'colour' in input)
        {return json({ error: 'invalid' }, 400);}
      return json(await coordinator.createInvite(user, input.control as Control));
    }
    if (
      url.pathname === '/api/online/invitations/redeem' ||
      url.pathname === '/api/online/invitations/cancel'
    ) {
      if (
        typeof input.token !== 'string' ||
        !/^[0-9a-f-]{36}$/.test(input.token) ||
        (url.pathname.endsWith('/redeem') &&
          input.colour !== 'w' &&
          input.colour !== 'b' &&
          input.colour !== 'random')
      )
        {return json({ error: 'invalid' }, 400);}
      return json(
        url.pathname.endsWith('/redeem')
          ? await coordinator.redeem(user, input.token, input.colour as 'w' | 'b' | 'random')
          : await coordinator.revokeInvite(user, input.token),
      );
    }
    return json({ error: 'not_found' }, 404);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unavailable';
    if (reason === 'not_found') {return json({ error: reason }, 404);}
    if (
      [
        'rated_unavailable',
        'busy',
        'invalid_invite',
        'stale_queue',
        'stale_invite',
        'invalid_queue',
      ].includes(reason)
    )
      {return json({ error: reason }, 409);}
    return json({ error: 'unavailable' }, 503);
  }
}
