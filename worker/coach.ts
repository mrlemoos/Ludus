import { isTeachingProfile, parseCoachInput, recurringMistakes, suggestedProfile, validateAnalysis, validateDocument, validateSavedAnalysis } from '../shared/coaching';
import type { AnalysisLine, SavedCoachMatch, TeachingProfile } from '../shared/coaching';
import { isLanguage } from '../shared/waitlist';
import { authFor } from './auth';
import { loadCoachHistory } from './coach-history';
import type { CoachHistory } from './coach-history';
import { callProvider, providerAvailable, providerPayload, reserveCostMicros } from './coach-provider';
import type { CoachEnvironment, ProviderPayload } from './coach-provider';
import { CoachStore } from './coach-store';
import {
  reserveCoachReviewCredit,
  restoreCoachReviewCredit,
  reviewCreditStatus,
} from './review-credits';

export interface CoachAccount { teachingProfile: TeachingProfile }
export interface CoachDependencies {
  loadMatch?: (owner: string, id: string) => Promise<SavedCoachMatch | null>;
  loadHistory?: (
    owner: string,
    currentId: string,
    current: SavedCoachMatch,
  ) => Promise<CoachHistory>;
  account: (owner: string) => Promise<CoachAccount | null>;
  session?: (request: Request) => Promise<{ id: string } | null>;
  available?: () => Promise<boolean>;
  generate?: (payload: ProviderPayload) => Promise<{ document: unknown; costMicros: number }>;
  now?: () => number;
}
function json(value: unknown, status = 200) { return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  }); }
async function boundedBody(request: Request) {
  if (
    request.headers.get('Content-Type')?.split(';')[0] !== 'application/json' ||
    Number(request.headers.get('Content-Length')) > 200_000
  )
    {return null;}
  const reader = request.body?.getReader();
  if (!reader) {return null;}
  let size = 0;
    let text = '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {break;}
      size += chunk.value.length;
      if (size > 200_000) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    return null;
  }
}
async function fingerprint(value: unknown) { return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))),
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(''); }
export async function coachApi(
  request: Request,
  env: CoachEnvironment,
  dependencies: CoachDependencies,
): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/coach/')) {return json({ error: 'not_found' }, 404);}
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) {return json({ error: 'method' }, 405);}
  if (
    request.method !== 'GET' &&
    (request.headers.get('Origin') !== url.origin ||
      request.headers.get('Sec-Fetch-Site') === 'cross-site')
  )
    {return json({ error: 'forbidden' }, 403);}
  try {
    const identity = dependencies.session
      ? await dependencies.session(request)
      : (await authFor(request, env as Env).api.getSession({ headers: request.headers }))?.user;
    if (!identity) {return json({ error: 'unauthorised' }, 401);}
    const owner = identity.id;
      const account = await dependencies.account(owner);
    if (!account) {return json({ error: 'onboarding_required' }, 403);}
    function now() { return dependencies.now?.() ?? Date.now(); }
    const store = new CoachStore(env.DB);
    await store.expire(now());
    const loadMatch: NonNullable<CoachDependencies['loadMatch']> =
      dependencies.loadMatch ??
      (async (owner: string, id: string) => {
        const snapshot = await env.MATCHES.getByName(id).read(owner);
        return snapshot?.game.result ? snapshot.game : null;
      });
    function available() { return dependencies.available?.() ?? providerAvailable(env); }
    if (url.pathname === '/api/coach/status' && request.method === 'GET') {
      const reviews = await store.reviews(owner);
      return json({
        available: await available(),
        reviewCredits: await reviewCreditStatus(env.DB, owner, now()),
        usage: await store.usage(owner, now()),
        replyLimit: 5,
        profile: account.teachingProfile,
        suggestedProfile: suggestedProfile(reviews, account.teachingProfile),
        recurring: recurringMistakes(reviews),
        reviews,
      });
    }
    const matchRoute = /^\/api\/coach\/matches\/([a-zA-Z0-9_-]{1,80})$/.exec(url.pathname);
    if (matchRoute && request.method === 'GET') {
      const match = await loadMatch(owner, matchRoute[1]);
      if (!match) {return json({ error: 'not_found' }, 404);}
      if (!match.result) {return json({ error: 'finished_match_required' }, 409);}
      return json({
        match: {
          id: match.id,
          moves: match.moves,
          colour: match.colour,
          result: match.result,
          kind: match.kind ?? 'computer',
        },
      });
    }
    const savedMatchRoute = /^\/api\/coach\/matches\/([a-zA-Z0-9_-]{1,80})\/review$/.exec(
      url.pathname,
    );
    if (savedMatchRoute && request.method === 'GET') {
      const match = await loadMatch(owner, savedMatchRoute[1]);
      if (!match) {return json({ error: 'not_found' }, 404);}
      if (!match.result) {return json({ error: 'finished_match_required' }, 409);}
      const review = await store.reviewByMatch(owner, match.id);
      return json({ review, replies: review ? await store.replies(owner, review.id) : [] });
    }
    const historyRoute = /^\/api\/coach\/matches\/([a-zA-Z0-9_-]{1,80})\/history$/.exec(
      url.pathname,
    );
    if (historyRoute && request.method === 'GET') {
      const match = await loadMatch(owner, historyRoute[1]);
      if (!match) {return json({ error: 'not_found' }, 404);}
      if (!match.result) {return json({ error: 'finished_match_required' }, 409);}
      const history = dependencies.loadHistory
        ? await dependencies.loadHistory(owner, match.id, match)
        : await loadCoachHistory(env.DB, owner, match, loadMatch);
      return json({
        matches: [
          {
            id: match.id,
            moves: match.moves,
            colour: match.colour,
            result: match.result,
            kind: match.kind ?? 'computer',
            completedAt: match.completedAt ?? null,
          },
          ...history.matches.map(({ match: previous, completedAt }) => ({
            id: previous.id,
            moves: previous.moves,
            colour: previous.colour,
            result: previous.result,
            kind: previous.kind ?? 'computer',
            completedAt,
          })),
        ],
        gaps: history.gaps,
      });
    }
    const route = /^\/api\/coach\/reviews\/([a-zA-Z0-9_-]{1,80})(\/replies)?$/.exec(url.pathname);
    if (route && !route[2]) {
      const review = await store.review(owner, route[1]);
      if (!review) {return json({ error: 'not_found' }, 404);}
      if (request.method === 'GET')
        {return json({ review, replies: await store.replies(owner, review.id) });}
      if (request.method === 'DELETE') {
        await store.deleteReview(owner, review.id);
        return json({ ok: true });
      }
      return json({ error: 'method' }, 405);
    }
    if (request.method !== 'POST' || !(url.pathname === '/api/coach/reviews' || route?.[2]))
      {return json({ error: 'not_found' }, 404);}
    const body = await boundedBody(request);
    const reply = Boolean(route?.[2]);
    const input = reply ? null : parseCoachInput(body);
    if (!reply && !input) {return json({ error: 'invalid' }, 400);}
    if (
      reply &&
      (!body ||
        typeof body.key !== 'string' ||
        !/^[a-zA-Z0-9_-]{16,80}$/.test(body.key) ||
        typeof body.question !== 'string' ||
        !body.question.trim() ||
        body.question.length > 2000 ||
        !isLanguage(body.language))
    )
      {return json({ error: 'invalid' }, 400);}
    const saved = reply ? await store.review(owner, route![1]) : null;
    if (reply && !saved) {return json({ error: 'not_found' }, 404);}
    const match = await loadMatch(owner, input?.matchId ?? saved!.matchId);
    if (!match) {return json({ error: 'not_found' }, 404);}
    if (!match.result) {return json({ error: 'finished_match_required' }, 409);}
    if (!reply) {
      const priorSaved = await store.reviewByMatch(owner, match.id);
      if (priorSaved)
        {return json({ review: priorSaved, replies: await store.replies(owner, priorSaved.id) });}
    }
    const analysis = reply
      ? validateSavedAnalysis(match, saved!.analysis)
      : validateAnalysis(match, input!.analysis);
    if (!analysis) {return json({ error: 'invalid_analysis' }, 400);}
    const language = input?.language ?? body.language;
    const profile = input?.profile ?? account.teachingProfile;
    let priorMatches: (CoachHistory['matches'][number] & { analysis: AnalysisLine[] | null })[] =
      [];
    let historyGaps = saved?.historyGaps ?? 0;
    let savedHistory: import('../shared/coaching').SavedCoachHistory[] = saved?.history ?? [];
    if (!reply) {
      const actual = dependencies.loadHistory
        ? await dependencies.loadHistory(owner, match.id, match)
        : await loadCoachHistory(env.DB, owner, match, loadMatch);
      const supplied = input!.history;
      if (
        supplied.length !== actual.matches.length ||
        supplied.some((entry, index) => entry.matchId !== actual.matches[index].match.id)
      )
        {return json({ error: 'history_mismatch' }, 409);}
      priorMatches = actual.matches.map((row, index) => ({
        ...row,
        analysis:
          supplied[index].analysis === null
            ? null
            : validateAnalysis(row.match, supplied[index].analysis),
      }));
      if (
        priorMatches.some(
          (row, index) => supplied[index].analysis !== null && row.analysis === null,
        )
      )
        {return json({ error: 'invalid_history_analysis' }, 400);}
      historyGaps = actual.gaps + priorMatches.filter((row) => row.analysis === null).length;
      savedHistory = priorMatches.map(({ match: prior, completedAt, analysis: priorAnalysis }) => ({
        matchId: prior.id,
        moves: prior.moves,
        colour: prior.colour,
        result: prior.result,
        kind: prior.kind ?? 'computer',
        completedAt,
        analysis: priorAnalysis,
      }));
    }
    // New output uses the current account-selected teaching profile; saved text remains unchanged.
    const key = input?.key ?? body.key;
    const hash = await fingerprint({
      kind: reply ? 'reply' : 'review',
      match: match.id,
      language,
      profile,
      analysis,
      history: savedHistory,
      historyGaps,
      question: reply ? body.question.trim() : null,
      reviewId: saved?.id ?? null,
    });
    await store.expire(now());
    const existing = await store.existing(owner, key);
    if (existing && existing.fingerprint !== hash)
      {return json({ error: 'idempotency_conflict' }, 409);}
    if (existing?.state === 'complete') {
      if (reply)
        {return json({
          reply:
            (await store.replies(owner, saved!.id)).find((item) => item.id === existing.id) ?? null,
        });}
      return json({ review: await store.review(owner, existing.id) });
    }
    if (existing?.state === 'pending') {return json({ error: 'generation_pending' }, 409);}
    if (!reply && (!isTeachingProfile(profile) || profile !== account.teachingProfile))
      {return json({ error: 'profile_changed' }, 409);}
    if (reply && (await store.replyCount(owner, saved!.id)) >= 5)
      {return json({ error: 'reply_limit' }, 429);}
    if (!reply) {
      const pendingReview = await env.DB.prepare(
        "SELECT id FROM review_credit_reservations WHERE owner=? AND match_id=? AND state='reserved'",
      )
        .bind(owner, match.id)
        .first();
      if (pendingReview) {return json({ error: 'review_pending' }, 409);}
      if ((await reviewCreditStatus(env.DB, owner, now())).available === 0)
        {return json({ error: 'review_credit_required' }, 402);}
    }
    if (!(await available())) {return json({ error: 'coach_unavailable' }, 503);}
    const previous = saved
      ? (await store.replies(owner, saved.id))
          .slice(-4)
          .map((item) => ({ question: item.question, summary: item.document.summary }))
      : undefined;
    const replyHistory = savedHistory.map((item) => ({
      match: {
        id: item.matchId,
        moves: item.moves,
        colour: item.colour,
        result: item.result,
        kind: item.kind,
        completedAt: item.completedAt,
      },
      analysis: item.analysis,
    }));
    const payload = providerPayload(env.COACH_MODEL ?? '', {
      language,
      profile,
      match,
      analysis,
      history: reply
        ? replyHistory
        : priorMatches.map(({ match: previousMatch, analysis: previousAnalysis }) => ({
            match: previousMatch,
            analysis: previousAnalysis,
          })),
      historyGaps,
      summary: saved?.document.summary,
      conversation: previous,
      question: reply ? body.question.trim() : undefined,
    });
    const reserveMicros = reserveCostMicros(env, payload);
    if (reserveMicros === null) {return json({ error: 'cost_or_context_limit' }, 413);}
    const id = crypto.randomUUID();
    let creditReserved = false;
    if (!reply) {
      let credit;
      try {
        credit = await reserveCoachReviewCredit(env.DB, owner, match.id, id, now());
      } catch (error) {
        await restoreCoachReviewCredit(env.DB, id, now());
        throw error;
      }
      if (!credit) {
        const pendingReview = await env.DB.prepare(
          "SELECT id FROM review_credit_reservations WHERE owner=? AND match_id=? AND state='reserved'",
        )
          .bind(owner, match.id)
          .first();
        return pendingReview
          ? json({ error: 'review_pending' }, 409)
          : json({ error: 'review_credit_required' }, 402);
      }
      creditReserved = true;
    }
    let requestReserved = false;
    try {
      requestReserved = await store.reserve({
        id,
        owner,
        key,
        fingerprint: hash,
        kind: reply ? 'reply' : 'review',
        reviewId: saved?.id ?? null,
        now: now(),
        reserveMicros,
      });
    } catch (error) {
      if (creditReserved) {await restoreCoachReviewCredit(env.DB, id, now());}
      throw error;
    }
    if (!requestReserved) {
      if (creditReserved) {await restoreCoachReviewCredit(env.DB, id, now());}
      return json({ error: 'quota_budget_or_pending' }, 429);
    }
    let cost = reserveMicros;
    try {
      const generated = await (dependencies.generate
        ? dependencies.generate(payload)
        : callProvider(env, payload));
      if (
        !Number.isSafeInteger(generated.costMicros) ||
        generated.costMicros < 0 ||
        generated.costMicros > reserveMicros
      )
        {throw new Error('invalid_cost');}
      cost = generated.costMicros;
      const document = validateDocument(match, generated.document, analysis);
      if (!document) {throw new Error('invalid_review');}
      const savedOk = reply
        ? await store.finishReply(
            id,
            owner,
            saved!.id,
            language,
            body.question.trim(),
            document,
            now(),
            cost,
          )
        : await store.finishReview(
            id,
            owner,
            match.id,
            language,
            profile,
            document,
            analysis,
            savedHistory,
            historyGaps,
            now(),
            cost,
          );
      if (!savedOk) {throw new Error('reservation_expired');}
      return reply
        ? json({ reply: (await store.replies(owner, saved!.id)).find((item) => item.id === id) })
        : json({ review: await store.review(owner, id) });
    } catch {
      await store.fail(id, cost);
      return json({ error: 'coach_unavailable' }, 503);
    }
  } catch {
    return json({ error: 'coach_unavailable' }, 503);
  }
}
