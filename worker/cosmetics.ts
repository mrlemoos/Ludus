import { defaultAppearance, parseAppearance, permittedAppearance } from '../shared/cosmetics';

export async function cosmeticsApi(
  request: Request,
  env: Env,
  owner: string,
  _paidUntil: number | null = null,
  _complimentaryPlus = false,
) {
  function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } }); }
  const profile = await env.DB.prepare(
    'SELECT trial_expires_at FROM player_profiles WHERE user_id = ?',
  )
    .bind(owner)
    .first<{ trial_expires_at: number }>();
  if (!profile) {return json({ error: 'onboarding_required' }, 403);}
  if (request.method === 'GET') {
    const saved = await env.DB.prepare('SELECT board,pieces FROM player_cosmetics WHERE owner=?')
      .bind(owner)
      .first();
    return json({ appearance: permittedAppearance(parseAppearance(saved) ?? defaultAppearance) });
  }
  if (request.method !== 'POST') {return json({ error: 'method' }, 405);}
  // Root router bounds mutation bodies and checks Origin before dispatch.
  const input = parseAppearance(await request.json().catch(() => null));
  if (!input) {return json({ error: 'invalid' }, 400);}
  await env.DB.prepare(
    'INSERT INTO player_cosmetics(owner,board,pieces) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET board=excluded.board,pieces=excluded.pieces',
  )
    .bind(owner, input.board, input.pieces)
    .run();
  return json({ appearance: input });
}
