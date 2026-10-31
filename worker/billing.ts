import type Stripe from 'stripe';
import { apiJson } from './http';
import { billingEnabled, checkoutParams, liveCatalogue, stripeFor, verifyStripeEvent } from './stripe';
import type { Language } from '../shared/waitlist';
import { reconcileSubscription, recordRiskEvent, reviewBilling } from './billing-lifecycle';
import { paidAccessUntil } from './billing-access';

type BillingAccount = {
  owner: string; customer: string | null; generation: string; checkout: string | null;
  checkout_created_at: number | null; checkout_trial_expires_at: number | null; checkout_language: Language | null;
};
export type BillingDependencies = { stripe?: Stripe; now?: () => number };
const idOf = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id;
const closed = new Set(['canceled', 'incomplete_expired']);

async function account(db: D1Database, owner: string) {
  return db.prepare('SELECT * FROM billing_accounts WHERE owner=?').bind(owner).first<BillingAccount>();
}

async function locked<T>(db: D1Database, owner: string, now: number, work: (fence: () => Promise<void>) => Promise<T>): Promise<T> {
  const lease = crypto.randomUUID();
  const result = await db.prepare('UPDATE billing_accounts SET lease=?,lease_until=? WHERE owner=? AND lease_until<=?').bind(lease, now + 180_000, owner, now).run();
  if (!result.meta.changes) throw new Error('billing_busy');
  const started = performance.now();
  const fence = async () => {
    const current = now + Math.floor(performance.now() - started);
    const touched = await db.prepare('UPDATE billing_accounts SET lease_until=? WHERE owner=? AND lease=? AND lease_until>?').bind(current + 180_000, owner, lease, current).run();
    if (!touched.meta.changes) throw new Error('billing_lease_lost');
  };
  try { return await work(fence); }
  finally { await db.prepare('UPDATE billing_accounts SET lease=NULL,lease_until=0 WHERE owner=? AND lease=?').bind(owner, lease).run(); }
}

/** Checkout and subscription state are provider-owned. A redirect never writes entitlement. */
export async function billingApi(request: Request, env: Env, owner: string, profile: { trialExpiresAt: number; language: Language }, deps: BillingDependencies = {}) {
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/api/billing') {
    const stored = await env.DB.prepare("SELECT status,paid_until,cancel_at,grace_until,next_charge_at,amount,currency,cancel_requested_at FROM billing_subscriptions WHERE owner=? ORDER BY status NOT IN ('canceled','incomplete_expired') DESC,COALESCE(next_charge_at,paid_until,0) DESC,id DESC LIMIT 1").bind(owner).first();
    const row = await account(env.DB, owner);
    return apiJson({ enabled: billingEnabled(env), currency: 'eur', amount: 800, interval: 'month', subscription: stored, canManage: !!row?.customer, paidAccessUntil: await paidAccessUntil(env.DB, owner, deps.now?.() ?? Date.now()) });
  }
  if (request.method !== 'POST' || !['/api/billing/checkout', '/api/billing/portal'].includes(path)) return apiJson({ error: 'not_found' }, 404);
  if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return apiJson({ error: 'forbidden' }, 403);
  if (path.endsWith('/checkout') && !billingEnabled(env)) return apiJson({ error: 'billing_unavailable' }, 503);
  if (path.endsWith('/portal') && !(await account(env.DB, owner))?.customer) return apiJson({ error: 'no_subscription' }, 409);
  const stripe = deps.stripe ?? stripeFor(env), now = deps.now?.() ?? Date.now();
  await env.DB.prepare('INSERT OR IGNORE INTO billing_accounts(owner,generation) VALUES (?,?)').bind(owner, crypto.randomUUID()).run();
  try {
    return await locked(env.DB, owner, now, async (fence) => {
      if (await env.DB.prepare('SELECT user_id FROM account_deletions WHERE user_id=?').bind(owner).first()) return apiJson({ error: 'account_deleted' }, 403);
      let row = (await account(env.DB, owner))!;
      if (row.checkout_created_at === null) {
        await env.DB.prepare('UPDATE billing_accounts SET checkout_created_at=?,checkout_trial_expires_at=?,checkout_language=? WHERE owner=?').bind(now, profile.trialExpiresAt, profile.language, owner).run();
        row = (await account(env.DB, owner))!;
      }
      if (!row.customer) {
        if (path.endsWith('/portal')) return apiJson({ error: 'no_subscription' }, 409);
        if (now - row.checkout_created_at! >= 23 * 3_600_000) return apiJson({ error: 'billing_reconciling' }, 409);
        const customer = await stripe.customers.create({}, { idempotencyKey: `ludus-customer-${row.generation}` });
        await fence();
        await env.DB.prepare('UPDATE billing_accounts SET customer=? WHERE owner=?').bind(customer.id, owner).run();
        row.customer = customer.id;
      }
      if (path.endsWith('/portal')) {
        const portal = await stripe.billingPortal.sessions.create({ customer: row.customer, configuration: liveCatalogue.portal, return_url: 'https://ludus.mrlemoos.dev/account' });
        return apiJson({ url: portal.url });
      }
      const subscriptions = await stripe.subscriptions.list({ customer: row.customer, status: 'all', limit: 100 });
      await fence();
      if (subscriptions.has_more || subscriptions.data.some((subscription) => !closed.has(subscription.status))) return apiJson({ error: 'subscription_exists' }, 409);
      if (row.checkout) {
        const previous = await stripe.checkout.sessions.retrieve(row.checkout);
        if (previous.status === 'open') return apiJson({ url: previous.url });
        if (previous.status === 'complete' && !subscriptions.data.some((subscription) => subscription.id === idOf(previous.subscription) && closed.has(subscription.status))) return apiJson({ error: 'billing_reconciling' }, 409);
        await env.DB.prepare('UPDATE billing_accounts SET generation=?,checkout=NULL,checkout_created_at=NULL,checkout_trial_expires_at=NULL,checkout_language=NULL WHERE owner=?').bind(crypto.randomUUID(), owner).run();
        row = (await account(env.DB, owner))!;
      }
      if (row.checkout_created_at === null) {
        await env.DB.prepare('UPDATE billing_accounts SET checkout_created_at=?,checkout_trial_expires_at=?,checkout_language=? WHERE owner=?').bind(now, profile.trialExpiresAt, profile.language, owner).run();
        row = (await account(env.DB, owner))!;
      }
      // After Stripe's idempotency retention window, an uncertain create needs reconciliation, never a new charge attempt.
      if (now - row.checkout_created_at! >= 23 * 3_600_000) return apiJson({ error: 'billing_reconciling' }, 409);
      const randomLetters = row.generation.replace(/[^a-f]/g, '').padEnd(8, 'a').slice(0, 8);
      const params = checkoutParams(row.customer!, row.checkout_trial_expires_at!, row.checkout_created_at!, row.checkout_language!, randomLetters, row.generation);
      if (await env.DB.prepare('SELECT user_id FROM account_deletions WHERE user_id=?').bind(owner).first()) return apiJson({ error: 'account_deleted' }, 403);
      const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `ludus-checkout-${row.generation}` });
      await fence();
      if (!session.livemode || !session.url) throw new Error('wrong_environment');
      await env.DB.prepare('UPDATE billing_accounts SET checkout=? WHERE owner=?').bind(session.id, owner).run();
      if (await env.DB.prepare('SELECT user_id FROM account_deletions WHERE user_id=?').bind(owner).first()) {
        if (session.status === 'open') await stripe.checkout.sessions.expire(session.id);
        return apiJson({ error: 'account_deleted' }, 403);
      }
      return apiJson({ url: session.url });
    });
  } catch { return apiJson({ error: 'billing_unavailable' }, 503); }
}

const handled = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed', 'radar.early_fraud_warning.created']);

async function reconcileCustomer(db: D1Database, stripe: Stripe, row: BillingAccount, now: number, fence: () => Promise<void>) {
  if (!row.checkout && row.checkout_created_at !== null) {
    const sessions = await stripe.checkout.sessions.list({ customer: row.customer!, limit: 100 });
    if (sessions.has_more) throw new Error('checkout_history_requires_review');
    const session = sessions.data.find((session) => session.client_reference_id === row.generation);
    await fence();
    if (session) await db.prepare('UPDATE billing_accounts SET checkout=? WHERE owner=?').bind(session.id, row.owner).run();
    else if (now - row.checkout_created_at >= 24 * 3_600_000) {
      // Complete provider lookup proved no session survived the uncertain attempt.
      await db.prepare('UPDATE billing_accounts SET generation=?,checkout_created_at=NULL,checkout_trial_expires_at=NULL,checkout_language=NULL WHERE owner=?').bind(crypto.randomUUID(), row.owner).run();
    }
  }
  const subscriptions = await stripe.subscriptions.list({ customer: row.customer!, status: 'all', limit: 100 });
  if (subscriptions.has_more) throw new Error('billing_history_requires_review');
  for (const subscription of subscriptions.data) {
    if (!subscription.livemode || !subscription.items.data.some((item) => item.price.id === liveCatalogue.price)) continue;
    await fence();
    await reconcileSubscription(db, stripe, row.owner, subscription, now, fence);
  }
}

export async function billingWebhook(request: Request, env: Env, deps: BillingDependencies = {}) {
  if (request.method !== 'POST') return apiJson({ error: 'method' }, 405);
  if (!env.STRIPE_WEBHOOK_SECRET) return apiJson({ error: 'billing_unavailable' }, 503);
  const now = deps.now?.() ?? Date.now();
  let event: Stripe.Event;
  try {
    const reader = request.body?.getReader(); if (!reader) return apiJson({ error: 'invalid' }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 131_072) { await reader.cancel(); return apiJson({ error: 'too_large' }, 413); } chunks.push(value); }
    const body = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    event = await verifyStripeEvent(new TextDecoder('utf-8', { fatal: true }).decode(body), request.headers.get('Stripe-Signature') ?? '', env.STRIPE_WEBHOOK_SECRET, now);
    if (!event.livemode) return apiJson({ error: 'wrong_environment' }, 400);
  } catch { return apiJson({ error: 'invalid_signature' }, 400); }
  if (!handled.has(event.type)) return apiJson({ error: 'event_not_configured' }, 400);
  try {
    const previous = await env.DB.prepare('SELECT processed_at FROM billing_events WHERE id=?').bind(event.id).first<{ processed_at: number | null }>();
    if (previous?.processed_at !== null && previous?.processed_at !== undefined) return apiJson({ ok: true });
    await env.DB.prepare('INSERT OR IGNORE INTO billing_events(id,type,received_at) VALUES (?,?,?)').bind(event.id, event.type, now).run();
    const resource = event.data.object as unknown as { customer?: string | { id: string } | null };
    const stripe = deps.stripe ?? stripeFor(env);
    const risk = event.type.startsWith('charge.') || event.type.startsWith('radar.');
    const customer = risk ? await recordRiskEvent(env.DB, stripe, event, now) : idOf(resource.customer);
    if (!customer) {
      if (!risk) throw new Error('missing_customer');
      await env.DB.prepare('UPDATE billing_events SET processed_at=? WHERE id=?').bind(now, event.id).run();
      return apiJson({ ok: true });
    }
    const row = await env.DB.prepare('SELECT * FROM billing_accounts WHERE customer=?').bind(customer).first<BillingAccount>();
    // Unrelated business-account customers must never become Ludus accounts.
    if (!row) { await env.DB.prepare('UPDATE billing_events SET processed_at=? WHERE id=?').bind(now, event.id).run(); return apiJson({ ok: true }); }
    await locked(env.DB, row.owner, now, async (fence) => {
      if (await env.DB.prepare('SELECT user_id FROM account_deletions WHERE user_id=?').bind(row.owner).first()) await cancelCustomer(env.DB, stripe, row, now, fence);
      else await reconcileCustomer(env.DB, stripe, row, now, fence);
      await fence();
      await env.DB.prepare('UPDATE billing_events SET processed_at=? WHERE id=?').bind(now, event.id).run();
    });
    return apiJson({ ok: true });
  } catch { return apiJson({ error: 'billing_unavailable' }, 503); }
}

async function cancelCustomer(db: D1Database, stripe: Stripe, row: BillingAccount, now: number, fence: () => Promise<void>) {
  // Recover an uncertain customer creation using its original provider idempotency key.
  if (!row.customer) {
    if (row.checkout_created_at === null) return;
    if (now - row.checkout_created_at >= 23 * 3_600_000) throw new Error('uncertain_customer_requires_review');
    const customer = await stripe.customers.create({}, { idempotencyKey: `ludus-customer-${row.generation}` });
    await fence();
    await db.prepare('UPDATE billing_accounts SET customer=? WHERE owner=?').bind(customer.id, row.owner).run();
    row.customer = customer.id;
  }
  // Find uncertain Session creation as well as sessions whose return never reached the app.
  const sessions = await stripe.checkout.sessions.list({ customer: row.customer, limit: 100 });
  if (sessions.has_more) throw new Error('checkout_history_requires_review');
  for (const session of sessions.data) if (session.status === 'open') { await fence(); await stripe.checkout.sessions.expire(session.id); }
  const subscriptions = await stripe.subscriptions.list({ customer: row.customer, status: 'all', limit: 100 });
  if (subscriptions.has_more) throw new Error('subscription_history_requires_review');
  for (const subscription of subscriptions.data) {
    if (!subscription.items.data.some((item) => item.price.id === liveCatalogue.price)) continue;
    await fence();
    await db.prepare('UPDATE billing_subscriptions SET cancel_requested_at=? WHERE id=?').bind(now, subscription.id).run();
    if (!closed.has(subscription.status)) await stripe.subscriptions.cancel(subscription.id, { prorate: false, invoice_now: false });
  }
}

export async function cancelAccountBilling(env: Env, owner: string, deps: BillingDependencies = {}) {
  // Older account-test seams and upgrade databases may not yet contain billing tables.
  if (!await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='billing_accounts'").first()) return;
  const row = await account(env.DB, owner); if (!row) return;
  const now = deps.now?.() ?? Date.now();
  await locked(env.DB, owner, now, (fence) => cancelCustomer(env.DB, deps.stripe ?? stripeFor(env), row, now, fence));
}

export async function reconcileBilling(env: Env, deps: BillingDependencies = {}) {
  if (!env.STRIPE_API_KEY && !deps.stripe) return;
  const now = deps.now?.() ?? Date.now(), stripe = deps.stripe ?? stripeFor(env);
  // Bounded batches with oldest-first rotation keep scheduled work independent of browser visits.
  const rows = await env.DB.prepare('SELECT * FROM billing_accounts ORDER BY reconciled_at,owner LIMIT 10').all<BillingAccount>();
  for (const row of rows.results) {
    try {
      await locked(env.DB, row.owner, now, async (fence) => {
        if (await env.DB.prepare('SELECT user_id FROM account_deletions WHERE user_id=?').bind(row.owner).first()) await cancelCustomer(env.DB, stripe, row, now, fence);
        else if (row.customer) await reconcileCustomer(env.DB, stripe, row, now, fence);
        await fence();
        await env.DB.prepare('UPDATE billing_accounts SET reconciled_at=? WHERE owner=?').bind(now, row.owner).run();
      });
    } catch {
      await reviewBilling(env.DB, row.owner, row.customer ?? row.generation, 'reconciliation_failed', now);
      await env.DB.prepare('UPDATE billing_accounts SET reconciled_at=? WHERE owner=?').bind(now, row.owner).run();
      console.error(JSON.stringify({ event: 'billing_reconciliation_failed' }));
    }
  }
}
