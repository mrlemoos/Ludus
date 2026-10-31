import { accountsApi, loadPlayerProfile } from './accounts';
import { authFor } from './auth';
import { onlineApi } from './online-api';
import { coachApi } from './coach';
import { cosmeticsApi } from './cosmetics';
import { apiJson, boundedRequest } from './http';
import { billingApi } from './billing';
import { paidAccessUntil } from './billing-access';
import { hasComplimentaryPlus } from './complimentary-plus';
export async function featuresApi(original: Request, env: Env): Promise<Response | null> {
  const path = new URL(original.url).pathname;
  const accountRoute = path === '/api/account' || path.startsWith('/api/profiles/') || path.startsWith('/api/operator/');
  const billingRoute = path === '/api/billing' || path.startsWith('/api/billing/');
  if (!accountRoute && !billingRoute && path !== '/api/appearance' && !path.startsWith('/api/online/') && !path.startsWith('/api/coach/')) return null;
  const request = await boundedRequest(original);
  if (request instanceof Response) return request;
  try {
    if (accountRoute) return await accountsApi(request, env);
    const session = await authFor(request, env).api.getSession({ headers: request.headers });
    if (!session) return apiJson({ error: 'unauthorised' }, 401);
    const owner = session.user.id;
    if (await env.DB.prepare('SELECT user_id FROM account_deletions WHERE user_id=?').bind(owner).first()) return apiJson({ error: 'account_deleted' }, 403);
    const profile = await loadPlayerProfile(env.DB, owner);
    if (!profile) return apiJson({ error: 'onboarding_required' }, 403);
    if (billingRoute) return await billingApi(request, env, owner, profile);
    if (path.startsWith('/api/online/')) return await onlineApi(request, env, owner);
    const [paidUntil, complimentary] = await Promise.all([paidAccessUntil(env.DB, owner), hasComplimentaryPlus(env.DB, owner)]);
    if (path === '/api/appearance') return await cosmeticsApi(request, env, owner, paidUntil, complimentary);
    return await coachApi(request, env, {
      session: async () => ({ id: owner }),
      account: async () => ({ trialExpiresAt: profile.trialExpiresAt, paidAccessUntil: paidUntil, complimentaryPlus: complimentary, teachingProfile: profile.teachingProfile }),
      loadMatch: async (player, id) => {
        const computer = await env.MATCHES.getByName(id).read(player);
        if (computer) return computer.game;
        const human = await env.HUMAN_MATCHES.getByName(id).read(player);
        if (!human) return null;
        return { kind: 'human', id: human.game.id, moves: human.game.moves, result: human.game.result, colour: human.game.players.w === player ? 'w' : 'b' };
      },
    });
  } catch {
    return apiJson({ error: 'unavailable' }, 503);
  }
}
