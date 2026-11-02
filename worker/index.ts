import { gameApi } from './game-api';
import { publicProfileSeo } from './profile-seo';
export { Match } from './match';
export { HumanMatch } from './human-match';
export { Matchmaking } from './matchmaking';
import { parseWaitlist } from '../shared/waitlist';
import { purgeExpiredPersonalData, resumeAccountDeletions } from './accounts';
import { billingWebhook, reconcileBilling } from './billing';
import { featuresApi } from './features';
import { waitlist } from './schema';
import { drizzle } from 'drizzle-orm/d1';

const reply = (status: number, error?: string) =>
  Response.json(error ? { error } : { ok: true }, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(status === 429 ? { 'Retry-After': '60' } : {}),
    },
  });

export default {
  async scheduled(event: ScheduledController, env: Env) {
    const results = await Promise.allSettled([
      reconcileBilling(env),
      resumeAccountDeletions(env),
      ...(event.cron === '0 3 * * *' ? [purgeExpiredPersonalData(env.DB)] : []),
    ]);
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('scheduled_cleanup_incomplete');
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const seo = await publicProfileSeo(request, env);
    if (seo) return seo;
    // Stripe authenticates by raw-body signature, not browser Origin/session headers.
    if (url.pathname === '/api/billing/webhook') return billingWebhook(request, env);
    if (url.pathname !== '/api/waitlist')
      return (await featuresApi(request, env)) ?? gameApi(request, env);
    if (request.method !== 'POST')
      return new Response(null, {
        status: 405,
        headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
      });
    const origin = request.headers.get('Origin');
    if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site')
      return reply(403, 'forbidden');
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json')
      return reply(415, 'invalid_content_type');
    if (Number(request.headers.get('Content-Length')) > 1024) return reply(413, 'body_too_large');

    try {
      // shortcut: approximate per-location IP limits suit a small waitlist; add Turnstile if abuse grows.
      const { success } = await env.WAITLIST_LIMITER.limit({
        key: `waitlist:${request.headers.get('CF-Connecting-IP') ?? 'local'}`,
      });
      if (!success) return reply(429, 'rate_limited');

      const reader = request.body?.getReader();
      if (!reader) return reply(400, 'invalid_submission');
      const body = new Uint8Array(1024);
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1024) {
          await reader.cancel();
          return reply(413, 'body_too_large');
        }
        body.set(value, size - value.byteLength);
      }
      let input: unknown;
      try {
        input = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(body.subarray(0, size)),
        );
      } catch {
        return reply(400, 'invalid_submission');
      }
      const entry = parseWaitlist(input);
      if (!entry) return reply(400, 'invalid_submission');

      await drizzle(env.DB)
        .insert(waitlist)
        .values(entry)
        .onConflictDoNothing({ target: waitlist.email });
      // Same response preserves email privacy and the original preference on duplicate submissions.
      return reply(200);
    } catch {
      console.error({ event: 'waitlist_unavailable' });
      return reply(503, 'unavailable');
    }
  },
} satisfies ExportedHandler<Env>;
