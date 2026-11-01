import type Stripe from 'stripe';
import { apiJson } from './http';
import { billingEnabled, checkoutParams, liveCatalogue, stripeFor, verifyStripeEvent } from './stripe';
import type { Language } from '../shared/waitlist';
import { reconcileSubscription, recordRiskEvent, reviewBilling } from './billing-lifecycle';
import { paidAccessUntil } from './billing-access';
import { hasComplimentaryPlus } from './complimentary-plus';
import { addVerifiedReviewPack, anonymiseReviewCreditReservations, applyReviewPackRisk, reviewCreditStatus } from './review-credits';
import { REVIEW_CREDITS_PER_PACK, REVIEW_PACK_PRICE_EUR_CENTS } from '../shared/review-credits';

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
    const now = deps.now?.() ?? Date.now();
    return apiJson({ enabled: billingEnabled(env) && !!env.STRIPE_REVIEW_PACK_PRICE_ID, complimentaryPlus: await hasComplimentaryPlus(env.DB, owner), currency: 'eur', amount: REVIEW_PACK_PRICE_EUR_CENTS, creditsPerPack: REVIEW_CREDITS_PER_PACK, reviewCredits: await reviewCreditStatus(env.DB, owner, now), subscription: stored, canManage: !!row?.customer, paidAccessUntil: await paidAccessUntil(env.DB, owner, now) });
  }
  if (request.method !== 'POST' || !['/api/billing/checkout', '/api/billing/portal', '/api/billing/review-pack/checkout'].includes(path)) return apiJson({ error: 'not_found' }, 404);
  if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return apiJson({ error: 'forbidden' }, 403);
  if (path === '/api/billing/checkout') return apiJson({ error: 'subscription_purchase_unavailable' }, 410);
  if (path === '/api/billing/review-pack/checkout') return reviewPackCheckout(env, owner, profile.language, deps);
  if (path.endsWith('/checkout') && await hasComplimentaryPlus(env.DB, owner)) return apiJson({ error: 'complimentary_plus_active' }, 409);
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

async function reviewPackCheckout(env: Env, owner: string, language: Language, deps: BillingDependencies) {
  if (!billingEnabled(env) || !env.STRIPE_REVIEW_PACK_PRICE_ID) return apiJson({ error: 'billing_unavailable' }, 503);
  const now = deps.now?.() ?? Date.now(), stripe = deps.stripe ?? stripeFor(env);
  await env.DB.prepare('INSERT OR IGNORE INTO billing_accounts(owner,generation) VALUES (?,?)').bind(owner, crypto.randomUUID()).run();
  try {
    return await locked(env.DB, owner, now, async (fence) => {
      if (await env.DB.prepare('SELECT user_id FROM account_deletions WHERE user_id=?').bind(owner).first()) return apiJson({ error: 'account_deleted' }, 403);
      const billing = (await account(env.DB, owner))!;
      const latest = await env.DB.prepare("SELECT * FROM review_pack_checkouts WHERE owner=? AND state='pending' ORDER BY created_at DESC,id DESC LIMIT 1").bind(owner).first<{ id: string; generation: string; checkout: string | null; created_at: number }>();
      if (latest?.checkout) {
        const existing = await stripe.checkout.sessions.retrieve(latest.checkout);
        if (existing.status === 'open' && existing.url) return apiJson({ url: existing.url });
        if (existing.status === 'complete' && !await env.DB.prepare('SELECT id FROM review_credit_packs WHERE checkout=?').bind(existing.id).first()) return apiJson({ error: 'billing_reconciling' }, 409);
        if (existing.status === 'expired') await env.DB.prepare("UPDATE review_pack_checkouts SET state='failed' WHERE id=? AND state='pending'").bind(latest.id).run();
      }
      let attempt = latest;
      if (attempt?.checkout) {
        attempt = null;
      } else if (attempt && now - attempt.created_at >= 23 * 3_600_000) {
        if (!billing.customer) return apiJson({ error: 'billing_reconciling' }, 409);
        const sessions = await stripe.checkout.sessions.list({ customer: billing.customer, limit: 100 });
        if (sessions.has_more) return apiJson({ error: 'billing_reconciling' }, 409);
        const recovered = sessions.data.find((session) => session.client_reference_id === attempt!.id);
        await fence();
        if (recovered) {
          await env.DB.prepare('UPDATE review_pack_checkouts SET checkout=? WHERE id=?').bind(recovered.id, attempt.id).run();
          if (recovered.status === 'open' && recovered.url) return apiJson({ url: recovered.url });
          if (recovered.status !== 'expired' && !await env.DB.prepare('SELECT id FROM review_credit_packs WHERE checkout=?').bind(recovered.id).first()) return apiJson({ error: 'billing_reconciling' }, 409);
          if (recovered.status === 'expired') await env.DB.prepare("UPDATE review_pack_checkouts SET state='failed' WHERE id=? AND state='pending'").bind(attempt.id).run();
        }
        attempt = null;
      }
      if (!attempt) {
        const id = crypto.randomUUID();
        attempt = { id, generation: crypto.randomUUID(), checkout: null, created_at: now };
        await env.DB.prepare('INSERT INTO review_pack_checkouts(id,owner,generation,created_at) VALUES (?,?,?,?)').bind(id, owner, attempt.generation, now).run();
      }
      if (!billing.customer) {
        if (now - attempt.created_at >= 23 * 3_600_000) return apiJson({ error: 'billing_reconciling' }, 409);
        const customer = await stripe.customers.create({}, { idempotencyKey: `ludus-customer-${billing.generation}` });
        await fence();
        await env.DB.prepare('UPDATE billing_accounts SET customer=? WHERE owner=?').bind(customer.id, owner).run();
        billing.customer = customer.id;
      }
      const integrationId = attempt.generation.replace(/[^a-f]/g, '').padEnd(8, 'a').slice(0, 8);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment', customer: billing.customer,
        line_items: [{ price: env.STRIPE_REVIEW_PACK_PRICE_ID, quantity: 1 }],
        locale: { 'en-GB': 'en-GB', 'es-ES': 'es', 'fr-FR': 'fr' }[language] as Stripe.Checkout.SessionCreateParams.Locale,
        integration_identifier: `ludus_review_pack_${integrationId}`,
        consent_collection: { terms_of_service: 'required' },
        client_reference_id: attempt.id,
        metadata: { ludus_product: 'review_credit_pack', owner },
        payment_intent_data: { metadata: { ludus_product: 'review_credit_pack', owner, checkout_attempt: attempt.id } },
        success_url: 'https://ludus.mrlemoos.dev/account?credits=purchased',
        cancel_url: 'https://ludus.mrlemoos.dev/account?credits=cancelled',
      }, { idempotencyKey: `ludus-review-pack-${attempt.generation}` });
      await fence();
      if (!session.livemode || !session.url) throw new Error('wrong_environment');
      await env.DB.prepare('UPDATE review_pack_checkouts SET checkout=? WHERE id=?').bind(session.id, attempt.id).run();
      if (await env.DB.prepare('SELECT user_id FROM account_deletions WHERE user_id=?').bind(owner).first()) {
        if (session.status === 'open') await stripe.checkout.sessions.expire(session.id);
        return apiJson({ error: 'account_deleted' }, 403);
      }
      return apiJson({ url: session.url });
    });
  } catch { return apiJson({ error: 'billing_unavailable' }, 503); }
}

const handled = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed', 'radar.early_fraud_warning.created']);

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

async function reconcileReviewPackCheckout(db: D1Database, stripe: Stripe, eventSession: Stripe.Checkout.Session, env: Env, now: number, fence: () => Promise<void>): Promise<boolean> {
  if (eventSession.mode !== 'payment' || !eventSession.client_reference_id) return false;
  const attempt = await db.prepare('SELECT id,owner FROM review_pack_checkouts WHERE id=?').bind(eventSession.client_reference_id).first<{ id: string; owner: string }>();
  if (!attempt) return false;
  if (!env.STRIPE_REVIEW_PACK_PRICE_ID) throw new Error('review_pack_catalogue_missing');
  const session = await stripe.checkout.sessions.retrieve(eventSession.id, { expand: ['line_items.data.price', 'payment_intent.latest_charge'] });
  await fence();
  if (!session.livemode || session.status !== 'complete' || session.mode !== 'payment' || session.client_reference_id !== attempt.id) throw new Error('review_pack_payment_unverified');
  if (session.payment_status !== 'paid') return false;
  if (session.consent?.terms_of_service !== 'accepted') throw new Error('review_pack_terms_consent_missing');
  if (session.currency !== 'eur' || session.amount_total !== REVIEW_PACK_PRICE_EUR_CENTS) throw new Error('review_pack_payment_unverified');
  const accountRow = await account(db, attempt.owner);
  if (!accountRow?.customer || idOf(session.customer) !== accountRow.customer) throw new Error('review_pack_customer_mismatch');
  const lines = session.line_items?.data ?? [];
  if (lines.length !== 1 || lines[0].quantity !== 1 || idOf(lines[0].price as string | { id: string }) !== env.STRIPE_REVIEW_PACK_PRICE_ID) throw new Error('review_pack_price_mismatch');
  const paymentIntent = idOf(session.payment_intent as string | { id: string } | null);
  if (!paymentIntent) throw new Error('review_pack_payment_missing');
  const expandedIntent = session.payment_intent && typeof session.payment_intent !== 'string' ? session.payment_intent : await stripe.paymentIntents.retrieve(paymentIntent, { expand: ['latest_charge'] });
  await fence();
  const linked = await db.prepare('UPDATE review_pack_checkouts SET checkout=? WHERE id=? AND owner=? AND (checkout IS NULL OR checkout=?)').bind(session.id, attempt.id, attempt.owner, session.id).run();
  if (!linked.meta.changes) throw new Error('review_pack_checkout_link_conflict');
  const charge = idOf(expandedIntent.latest_charge as string | { id: string } | null);
  await fence();
  await addVerifiedReviewPack(db, { owner: attempt.owner, checkout: session.id, paymentIntent, charge: charge ?? null, now });
  const granted = await db.prepare('SELECT id FROM review_credit_packs WHERE checkout=? AND owner=?').bind(session.id, attempt.owner).first();
  if (!granted && await db.prepare('SELECT user_id FROM account_deletions WHERE user_id=?').bind(attempt.owner).first()) {
    await reviewBilling(db, attempt.owner, paymentIntent, 'review_pack_paid_after_deletion', now);
  }
  return true;
}

async function reconcileReviewPackCheckouts(db: D1Database, stripe: Stripe, env: Env, row: BillingAccount, now: number, fence: () => Promise<void>) {
  const attempts = await db.prepare("SELECT id,checkout,created_at FROM review_pack_checkouts WHERE owner=? AND state='pending' ORDER BY created_at,id LIMIT 10").bind(row.owner).all<{ id: string; checkout: string | null; created_at: number }>();
  if (!attempts.results.length) return;
  if (!row.customer) {
    const latestCreated = Math.min(...attempts.results.map((attempt) => attempt.created_at));
    if (now - latestCreated >= 23 * 3_600_000) {
      await reviewBilling(db, row.owner, row.generation, 'uncertain_review_pack_customer', now);
      throw new Error('uncertain_customer_requires_review');
    }
    const customer = await stripe.customers.create({}, { idempotencyKey: `ludus-customer-${row.generation}` });
    await fence();
    await db.prepare('UPDATE billing_accounts SET customer=? WHERE owner=? AND customer IS NULL').bind(customer.id, row.owner).run();
    row.customer = customer.id;
  }
  const withoutSession = attempts.results.filter((attempt) => !attempt.checkout);
  if (withoutSession.length) {
    const sessions = await stripe.checkout.sessions.list({ customer: row.customer, limit: 100 });
    if (sessions.has_more) throw new Error('review_pack_checkout_history_requires_review');
    for (const attempt of withoutSession) {
      const found = sessions.data.find((session) => session.client_reference_id === attempt.id);
      if (found) {
        await fence();
        await db.prepare("UPDATE review_pack_checkouts SET checkout=? WHERE id=? AND state='pending' AND checkout IS NULL").bind(found.id, attempt.id).run();
      } else if (now - attempt.created_at >= 24 * 3_600_000) {
        // A complete bounded provider lookup proved this uncertain create never produced a session.
        await db.prepare("UPDATE review_pack_checkouts SET state='failed' WHERE id=? AND state='pending'").bind(attempt.id).run();
      }
    }
  }
  const linked = await db.prepare("SELECT id,checkout FROM review_pack_checkouts WHERE owner=? AND state='pending' AND checkout IS NOT NULL ORDER BY created_at,id LIMIT 10").bind(row.owner).all<{ id: string; checkout: string }>();
  for (const attempt of linked.results) {
    const session = await stripe.checkout.sessions.retrieve(attempt.checkout, { expand: ['payment_intent'] });
    await fence();
    if (session.status === 'expired') {
      await db.prepare("UPDATE review_pack_checkouts SET state='failed' WHERE id=? AND state='pending'").bind(attempt.id).run();
    } else if (session.mode === 'payment' && session.status === 'complete' && session.payment_status === 'paid') {
      await reconcileReviewPackCheckout(db, stripe, session, env, now, fence);
    } else if (session.mode === 'payment' && session.status === 'complete' && session.payment_status !== 'paid' && session.payment_intent) {
      const intentId = idOf(session.payment_intent as string | { id: string });
      const intent = intentId ? await stripe.paymentIntents.retrieve(intentId) : null;
      await fence();
      if (intent && ['canceled', 'requires_payment_method'].includes(intent.status)) {
        await db.prepare("UPDATE review_pack_checkouts SET state='failed' WHERE id=? AND state='pending'").bind(attempt.id).run();
      }
    }
  }
}

async function applyReviewPackWebhookRisk(db: D1Database, stripe: Stripe, event: Stripe.Event, now: number) {
  const object = event.data.object as unknown as {
    id?: string; charge?: string | { id: string } | null; payment_intent?: string | { id: string } | null;
    amount?: number; amount_refunded?: number; status?: string;
  };
  let charge = event.type === 'charge.refunded' ? object.id : idOf(object.charge);
  let paymentIntent = idOf(object.payment_intent);
  if (!charge && paymentIntent) {
    const intent = await stripe.paymentIntents.retrieve(paymentIntent, { expand: ['latest_charge'] });
    charge = idOf(intent.latest_charge as string | { id: string } | null);
  }
  if (!charge) return;
  const initialCharge = await stripe.charges.retrieve(charge);
  paymentIntent = idOf(initialCharge.payment_intent) ?? paymentIntent;
  const knownPack = await db.prepare('SELECT owner FROM review_credit_packs WHERE charge=? OR payment_intent=?').bind(charge, paymentIntent ?? '').first<{ owner: string }>();
  let riskOwner = knownPack?.owner;
  if (!riskOwner) {
    if (!paymentIntent) return;
    const intent = await stripe.paymentIntents.retrieve(paymentIntent);
    const attemptId = intent.metadata?.checkout_attempt;
    if (!attemptId) return;
    const knownAttempt = await db.prepare(`SELECT r.owner FROM review_pack_checkouts r JOIN billing_accounts b ON b.owner=r.owner
      WHERE r.id=? AND b.customer=?`).bind(attemptId, idOf(initialCharge.customer) ?? '').first<{ owner: string }>();
    if (!knownAttempt) return;
    riskOwner = knownAttempt.owner;
  }
  await locked(db, riskOwner, now, async (fence) => {
    // Resolve current provider state only after taking the account lease. Event order is not authority.
    await fence();
    const currentCharge = await stripe.charges.retrieve(charge!);
    paymentIntent = idOf(currentCharge.payment_intent) ?? paymentIntent;
    const refundedAmount = currentCharge.amount_refunded ?? object.amount_refunded ?? 0;
    const amount = currentCharge.amount ?? object.amount ?? 0;
    const fullyRefunded = amount > 0 && refundedAmount >= amount;
    const partiallyRefunded = refundedAmount > 0 && !fullyRefunded;
    let frozen = fullyRefunded || partiallyRefunded;
    let lostDispute = false;
    if (event.type.startsWith('charge.dispute.')) {
      const disputes = await stripe.disputes.list({ charge: charge!, limit: 100 });
      if (disputes.has_more) throw new Error('review_pack_dispute_history_requires_review');
      lostDispute = disputes.data.some((dispute) => dispute.status === 'lost');
      const pending = disputes.data.some((dispute) => !['won', 'lost', 'warning_closed'].includes(dispute.status));
      frozen = frozen || pending || lostDispute;
    }
    if (event.type === 'radar.early_fraud_warning.created') frozen = true;
    await fence();
    await applyReviewPackRisk(db, { charge, paymentIntent, frozen, refunded: fullyRefunded || lostDispute, now });
    if (event.type === 'charge.refunded' || lostDispute || event.type === 'radar.early_fraud_warning.created') {
      const reason = event.type === 'charge.refunded' ? 'review_pack_refund' : lostDispute ? 'review_pack_dispute_lost' : 'review_pack_early_fraud_warning';
      await reviewBilling(db, riskOwner!, charge!, reason, now);
    }
  });
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
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded' || event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === 'payment') {
        const attempt = session.client_reference_id ? await env.DB.prepare('SELECT owner FROM review_pack_checkouts WHERE id=?').bind(session.client_reference_id).first<{ owner: string }>() : null;
        if (attempt) await locked(env.DB, attempt.owner, now, async (fence) => {
          await reconcileReviewPackCheckout(env.DB, stripe, session, env, now, fence);
          if (event.type === 'checkout.session.async_payment_failed' && session.client_reference_id) {
            await env.DB.prepare("UPDATE review_pack_checkouts SET state='failed' WHERE id=? AND checkout=? AND state='pending'").bind(session.client_reference_id, session.id).run();
          }
          await fence();
        });
        await env.DB.prepare('UPDATE billing_events SET processed_at=? WHERE id=?').bind(now, event.id).run();
        return apiJson({ ok: true });
      }
    }
    if (risk) await applyReviewPackWebhookRisk(env.DB, stripe, event, now);
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
    const packAttempt = await db.prepare('SELECT created_at FROM review_pack_checkouts WHERE owner=? ORDER BY created_at DESC LIMIT 1').bind(row.owner).first<{ created_at: number }>();
    const startedAt = row.checkout_created_at ?? packAttempt?.created_at ?? null;
    if (startedAt === null) return;
    if (now - startedAt >= 23 * 3_600_000) throw new Error('uncertain_customer_requires_review');
    const customer = await stripe.customers.create({}, { idempotencyKey: `ludus-customer-${row.generation}` });
    await fence();
    await db.prepare('UPDATE billing_accounts SET customer=? WHERE owner=?').bind(customer.id, row.owner).run();
    row.customer = customer.id;
  }
  const packSessions = await db.prepare('SELECT checkout FROM review_pack_checkouts WHERE owner=? AND checkout IS NOT NULL').bind(row.owner).all<{ checkout: string }>();
  for (const attempt of packSessions.results) {
    const session = await stripe.checkout.sessions.retrieve(attempt.checkout);
    if (session.status === 'open') { await fence(); await stripe.checkout.sessions.expire(session.id); }
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
  const hasBilling = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='billing_accounts'").first();
  if (hasBilling) {
    const row = await account(env.DB, owner);
    if (row) {
      const now = deps.now?.() ?? Date.now();
      await locked(env.DB, owner, now, (fence) => cancelCustomer(env.DB, deps.stripe ?? stripeFor(env), row, now, fence));
    }
  }
  if (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='review_credit_reservations'").first()) {
    await anonymiseReviewCreditReservations(env.DB, owner);
  }
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
        else {
          if (row.customer) await reconcileCustomer(env.DB, stripe, row, now, fence);
          await reconcileReviewPackCheckouts(env.DB, stripe, env, row, now, fence);
        }
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
