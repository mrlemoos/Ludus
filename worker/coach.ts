import { authFor } from './auth';
import { CoachStore } from './coach-store';
import { callProvider, providerAvailable, providerPayload, reserveCostMicros, type CoachEnvironment, type ProviderPayload } from './coach-provider';
import { isTeachingProfile, parseCoachInput, recurringMistakes, reviewLimit, suggestedProfile, validateAnalysis, validateDocument, type SavedCoachMatch, type TeachingProfile } from '../shared/coaching';
import { hasPlusAccess, type PlusAccess } from '../shared/plus';
import { isLanguage } from '../shared/waitlist';
export type CoachAccount = PlusAccess & { teachingProfile: TeachingProfile };
export type CoachDependencies = {
  loadMatch?: (owner: string, id: string) => Promise<SavedCoachMatch | null>;
  account: (owner: string) => Promise<CoachAccount | null>;
  session?: (request: Request) => Promise<{ id: string } | null>;
  available?: () => Promise<boolean>;
  generate?: (payload: ProviderPayload) => Promise<{ document: unknown; costMicros: number }>;
  now?: () => number;
};
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
async function boundedBody(request: Request) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json' || Number(request.headers.get('Content-Length')) > 50_000) return null;
  const reader = request.body?.getReader(); if (!reader) return null;
  let size = 0, text = ''; const decoder = new TextDecoder('utf-8', { fatal: true });
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 50_000) { await reader.cancel(); return null; } text += decoder.decode(chunk.value, { stream: true }); } return JSON.parse(text + decoder.decode()); } catch { return null; }
}
const fingerprint = async (value: unknown) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
export async function coachApi(request: Request, env: CoachEnvironment, dependencies: CoachDependencies): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/coach/')) return json({ error: 'not_found' }, 404);
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json({ error: 'method' }, 405);
  if (request.method !== 'GET' && (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site')) return json({ error: 'forbidden' }, 403);
  try {
    const identity = dependencies.session ? await dependencies.session(request) : (await authFor(request, env as Env).api.getSession({ headers: request.headers }))?.user;
    if (!identity) return json({ error: 'unauthorised' }, 401);
    const owner = identity.id, account = await dependencies.account(owner);
    if (!account) return json({ error: 'onboarding_required' }, 403);
    const now = () => dependencies.now?.() ?? Date.now();
    const store = new CoachStore(env.DB);
    await store.expire(now());
    const loadMatch: NonNullable<CoachDependencies['loadMatch']> = dependencies.loadMatch ?? (async (owner: string, id: string) => {
      const snapshot = await env.MATCHES.getByName(id).read(owner);
      return snapshot?.game.result ? snapshot.game : null;
    });
    const available = () => dependencies.available?.() ?? providerAvailable(env);
    if (url.pathname === '/api/coach/status' && request.method === 'GET') {
      const reviews = await store.reviews(owner), plus = hasPlusAccess(account, now());
      return json({ available: await available(), plus, limit: reviewLimit(plus), usage: await store.usage(owner, now()), profile: account.teachingProfile, suggestedProfile: suggestedProfile(reviews, account.teachingProfile), recurring: plus ? recurringMistakes(reviews) : [], reviews });
    }
    const matchRoute = /^\/api\/coach\/matches\/([a-zA-Z0-9_-]{1,80})$/.exec(url.pathname);
    if (matchRoute && request.method === 'GET') {
      const match = await loadMatch(owner, matchRoute[1]);
      if (!match) return json({ error: 'not_found' }, 404);
      if (!match.result) return json({ error: 'finished_match_required' }, 409);
      return json({ match: { id: match.id, moves: match.moves, colour: match.colour, result: match.result, kind: match.kind ?? 'computer' } });
    }
    const route = /^\/api\/coach\/reviews\/([a-zA-Z0-9_-]{1,80})(\/replies)?$/.exec(url.pathname);
    if (route && !route[2]) {
      const review = await store.review(owner, route[1]);
      if (!review) return json({ error: 'not_found' }, 404);
      if (request.method === 'GET') return json({ review, replies: await store.replies(owner, review.id) });
      if (request.method === 'DELETE') { await store.deleteReview(owner, review.id); return json({ ok: true }); }
      return json({ error: 'method' }, 405);
    }
    if (request.method !== 'POST' || !(url.pathname === '/api/coach/reviews' || route?.[2])) return json({ error: 'not_found' }, 404);
    const body = await boundedBody(request);
    const reply = Boolean(route?.[2]);
    const input = reply ? null : parseCoachInput(body);
    if (!reply && !input) return json({ error: 'invalid' }, 400);
    if (reply && (!body || typeof body.key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.key) || typeof body.question !== 'string' || !body.question.trim() || body.question.length > 2000 || !isLanguage(body.language))) return json({ error: 'invalid' }, 400);
    const saved = reply ? await store.review(owner, route![1]) : null;
    if (reply && !saved) return json({ error: 'not_found' }, 404);
    const match = await loadMatch(owner, input?.matchId ?? saved!.matchId);
    if (!match) return json({ error: 'not_found' }, 404);
    if (!match.result) return json({ error: 'finished_match_required' }, 409);
    const analysis = reply ? validateAnalysis(match, saved!.analysis) : validateAnalysis(match, input!.analysis);
    if (!analysis) return json({ error: 'invalid_analysis' }, 400);
    const language = input?.language ?? body.language;
    const profile = input?.profile ?? account.teachingProfile;
    // New output uses the current account-selected teaching profile; saved text remains unchanged.
    const key = input?.key ?? body.key;
    const hash = await fingerprint({ kind: reply ? 'reply' : 'review', match: match.id, language, profile, analysis, question: reply ? body.question.trim() : null, reviewId: saved?.id ?? null });
    await store.expire(now());
    const existing = await store.existing(owner, key);
    if (existing && existing.fingerprint !== hash) return json({ error: 'idempotency_conflict' }, 409);
    if (existing?.state === 'complete') {
      if (reply) return json({ reply: (await store.replies(owner, saved!.id)).find((item) => item.id === existing.id) ?? null });
      return json({ review: await store.review(owner, existing.id) });
    }
    if (existing?.state === 'pending') return json({ error: 'generation_pending' }, 409);
    if (!reply && (!isTeachingProfile(profile) || profile !== account.teachingProfile)) return json({ error: 'profile_changed' }, 409);
    const plus = hasPlusAccess(account, now());
    if (reply && !plus) return json({ error: 'plus_required' }, 403);
    if (!await available()) return json({ error: 'coach_unavailable' }, 503);
    const previous = saved ? (await store.replies(owner, saved.id)).slice(-4).map((item) => ({ question: item.question, summary: item.document.summary })) : undefined;
    const payload = providerPayload(env.COACH_MODEL ?? '', { language, profile, match, analysis, summary: saved?.document.summary, conversation: previous, question: reply ? body.question.trim() : undefined });
    const reserveMicros = reserveCostMicros(env, payload);
    if (reserveMicros === null) return json({ error: 'cost_or_context_limit' }, 413);
    const id = crypto.randomUUID();
    if (!await store.reserve({ id, owner, key, fingerprint: hash, kind: reply ? 'reply' : 'review', reviewId: saved?.id ?? null, now: now(), limit: reply ? 200 : reviewLimit(plus), reserveMicros })) return json({ error: 'quota_budget_or_pending' }, 429);
    let cost = reserveMicros;
    try {
      const generated = await (dependencies.generate ? dependencies.generate(payload) : callProvider(env, payload));
      if (!Number.isSafeInteger(generated.costMicros) || generated.costMicros < 0 || generated.costMicros > reserveMicros) throw new Error('invalid_cost');
      cost = generated.costMicros;
      const document = validateDocument(match, generated.document, analysis);
      if (!document) throw new Error('invalid_review');
      const savedOk = reply
        ? await store.finishReply(id, owner, saved!.id, language, body.question.trim(), document, now(), cost)
        : await store.finishReview(id, owner, match.id, language, profile, document, analysis, now(), cost);
      if (!savedOk) throw new Error('reservation_expired');
      return reply ? json({ reply: (await store.replies(owner, saved!.id)).find((item) => item.id === id) }) : json({ review: await store.review(owner, id) });
    } catch {
      await store.fail(id, cost);
      return json({ error: 'coach_unavailable' }, 503);
    }
  } catch { return json({ error: 'coach_unavailable' }, 503); }
}
