import {
  billingApi,
  billingWebhook,
  cancelAccountBilling,
  reconcileBilling,
} from './billing';
import { paidAccessUntil } from './billing-access';
import { graceMilliseconds, reconcileSubscription } from './billing-lifecycle';
import {
  betaBilling,
  billingEnabled,
  checkoutParams,
  liveCatalogue,
  verifyStripeEvent,
} from './stripe';
import { createHmac } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

const now = Date.parse('2026-10-31T12:00:00Z');
const profile = { trialExpiresAt: now + 3600_000, language: 'en-GB' as const };
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle')
    .filter((file) => file.endsWith('.sql'))
    .sort())
    {sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));}
  sqlite
    .prepare(
      "INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES('owner','Owner','owner@example.test',1,0,0)",
    )
    .run();
  function statement(query: string, values: (string | number | null)[] = []) {
    return {
      bind: (...parameters: (string | number | null)[]) => statement(query, parameters),
      first: async () => sqlite.prepare(query).get(...values) ?? null,
      all: async () => ({ results: sqlite.prepare(query).all(...values) }),
      run: async () => ({
        meta: { changes: Number(sqlite.prepare(query).run(...values).changes) },
      }),
    };
  }
  const env = {
    DB: { prepare: (query: string) => statement(query) },
    STRIPE_WEBHOOK_SECRET: 'fixture-signing-secret',
    STRIPE_BILLING_ENABLED: 'true',
    STRIPE_TAX_READY: 'true',
    STRIPE_LIFECYCLE_READY: 'true',
    STRIPE_REVIEW_PACK_PRICE_ID: 'price_review_fixture',
  } as unknown as Env;
  const subscriptions = vi.fn().mockResolvedValue({ data: [], has_more: false });
  const create = vi
    .fn()
    .mockResolvedValue({
      id: 'cs_live_fixture',
      livemode: true,
      url: 'https://checkout.stripe.com/c/pay/fixture',
    });
  const customer = vi.fn().mockResolvedValue({ id: 'cus_fixture' });
  const stripe = {
    customers: { create: customer },
    subscriptions: {
      list: subscriptions,
      cancel: vi.fn().mockResolvedValue({ status: 'canceled' }),
    },
    checkout: {
      sessions: {
        create,
        retrieve: vi
          .fn()
          .mockResolvedValue({ status: 'open', url: 'https://checkout.stripe.com/c/pay/fixture' }),
        list: vi.fn().mockResolvedValue({ data: [], has_more: false }),
        expire: vi.fn().mockResolvedValue({}),
      },
    },
    invoices: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
    invoicePayments: {
      list: vi
        .fn()
        .mockResolvedValue({
          data: [
            { amount_paid: 800, payment: { type: 'payment_intent', payment_intent: 'pi_fixture' } },
          ],
          has_more: false,
        }),
    },
    paymentIntents: { retrieve: vi.fn().mockResolvedValue({ latest_charge: 'ch_fixture' }) },
    charges: {
      retrieve: vi
        .fn()
        .mockResolvedValue({
          id: 'ch_fixture',
          livemode: true,
          customer: 'cus_fixture',
          amount: 800,
          amount_refunded: 0,
          payment_intent: 'pi_fixture',
        }),
    },
    disputes: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
  } as unknown as Stripe;
  return { sqlite, env, stripe, subscriptions, create, customer, deps: { stripe, now: () => now } };
}
function request(path = '/api/billing/review-pack/checkout') {
  return new Request(`https://ludus.test${path}`, {
    method: 'POST',
    headers: { Origin: 'https://ludus.test', 'Content-Type': 'application/json' },
    body: '{}',
  });
}
function signed(value: unknown, timestamp = Math.floor(now / 1000)) {
  const body = JSON.stringify(value),
    signature = createHmac('sha256', 'fixture-signing-secret')
      .update(`${timestamp}.${body}`)
      .digest('hex');
  return new Request('https://ludus.test/api/billing/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` },
    body,
  });
}

describe('live Stripe purchase contracts', () => {
  it('supports purchase throughout beta without charging before exact expiry', () => {
    expect(betaBilling(profile.trialExpiresAt, now)).toMatchObject({
      billing_cycle_anchor: Math.ceil(profile.trialExpiresAt / 1000),
      proration_behavior: 'none',
    });
    expect(betaBilling(now + 30 * 86400_000, now)).toMatchObject({
      trial_end: Math.ceil((now + 30 * 86400_000) / 1000),
    });
    expect(betaBilling(now + 1, now)).toMatchObject({
      billing_cycle_anchor: Math.ceil((now + 1) / 1000),
      proration_behavior: 'none',
    });
    expect(betaBilling(now, now)).not.toHaveProperty('trial_end');
    expect(betaBilling(now, now)).not.toHaveProperty('billing_cycle_anchor');
  });
  it('uses server-owned catalogue and return URLs with dynamic payment methods', () => {
    const params = checkoutParams('cus_fixture', profile.trialExpiresAt, now, 'fr-FR', 'abcdefgh');
    expect(params).toMatchObject({
      customer: 'cus_fixture',
      locale: 'fr',
      line_items: [{ price: liveCatalogue.price, quantity: 1 }],
      payment_method_collection: 'always',
    });
    expect(params).not.toHaveProperty('payment_method_types');
    expect(params).not.toHaveProperty('automatic_tax');
  });
  it('requires all charging gates and never calls Stripe while disabled', async () => {
    const f = fixture();
    f.env.STRIPE_TAX_READY = 'false';
    expect(billingEnabled(f.env)).toBe(false);
    expect((await billingApi(request(), f.env, 'owner', profile, f.deps)).status).toBe(503);
    expect(f.customer).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
  });
  it('creates a hosted one-time pack Checkout and reuses the open session without granting credits', async () => {
    const f = fixture();
    expect((await billingApi(request(), f.env, 'owner', profile, f.deps)).status).toBe(200);
    expect((await billingApi(request(), f.env, 'owner', profile, f.deps)).status).toBe(200);
    expect(f.customer).toHaveBeenCalledOnce();
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.create.mock.calls[0][0]).toMatchObject({
      mode: 'payment',
      line_items: [{ price: 'price_review_fixture', quantity: 1 }],
      consent_collection: { terms_of_service: 'required' },
    });
    expect(f.create.mock.calls[0][0].integration_identifier).toMatch(
      /^ludus_review_pack_[a-f]{8}$/,
    );
    expect(f.sqlite.prepare('SELECT * FROM billing_subscriptions').all()).toEqual([]);
    expect(f.sqlite.prepare('SELECT * FROM review_credit_packs').all()).toEqual([]);
  });
  it('serialises concurrent pack Checkouts and leaves legacy subscription purchases blocked', async () => {
    const f = fixture();
    const results = await Promise.all([
      billingApi(request(), f.env, 'owner', profile, f.deps),
      billingApi(request(), f.env, 'owner', profile, f.deps),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 503]);
    expect(f.create).toHaveBeenCalledOnce();
    f.subscriptions.mockResolvedValue({ data: [{ status: 'active' }], has_more: false });
    expect(
      (await billingApi(request('/api/billing/checkout'), f.env, 'owner', profile, f.deps)).status,
    ).toBe(410);
  });
  it('blocks checkout after deletion starts', async () => {
    const f = fixture();
    f.sqlite.prepare("INSERT INTO account_deletions(user_id,requested_at) VALUES('owner',0)").run();
    expect((await billingApi(request(), f.env, 'owner', profile, f.deps)).status).toBe(403);
    expect(f.customer).not.toHaveBeenCalled();
  });
});

describe('Stripe webhook authentication and durable processing', () => {
  const event = {
    id: 'evt_fixture',
    object: 'event',
    livemode: true,
    type: 'invoice.paid',
    data: { object: { customer: 'cus_fixture' } },
  };
  it('rejects invalid signatures, stale signatures and test-mode delivery', async () => {
    const f = fixture();
    expect(
      (
        await billingWebhook(
          new Request('https://ludus.test/api/billing/webhook', { method: 'POST', body: '{}' }),
          f.env,
          f.deps,
        )
      ).status,
    ).toBe(400);
    expect(
      (await billingWebhook(signed(event, Math.floor(now / 1000) - 301), f.env, f.deps)).status,
    ).toBe(400);
    expect(
      (await billingWebhook(signed({ ...event, livemode: false }), f.env, f.deps)).status,
    ).toBe(400);
    expect(f.subscriptions).not.toHaveBeenCalled();
  });
  it('verifies original bytes and never creates an account from unrelated billing events', async () => {
    const f = fixture();
    expect((await billingWebhook(signed(event), f.env, f.deps)).status).toBe(200);
    expect(f.subscriptions).not.toHaveBeenCalled();
    expect(f.sqlite.prepare('SELECT * FROM billing_accounts').all()).toEqual([]);
    expect(f.sqlite.prepare('SELECT processed_at FROM billing_events').get()).toEqual({
      processed_at: now,
    });
  });
  it('retries failed processing and acknowledges completed duplicates without reapplying', async () => {
    const f = fixture();
    f.sqlite
      .prepare(
        "INSERT INTO billing_accounts(owner,customer,generation) VALUES('owner','cus_fixture','generation')",
      )
      .run();
    f.subscriptions.mockRejectedValueOnce(new Error('offline'));
    expect((await billingWebhook(signed(event), f.env, f.deps)).status).toBe(503);
    expect(f.sqlite.prepare('SELECT processed_at FROM billing_events').get()).toEqual({
      processed_at: null,
    });
    expect((await billingWebhook(signed(event), f.env, f.deps)).status).toBe(200);
    expect((await billingWebhook(signed(event), f.env, f.deps)).status).toBe(200);
    expect(f.subscriptions).toHaveBeenCalledTimes(2);
  });
  it('records only paid invoice periods for the approved price, never the free beta period', async () => {
    const f = fixture();
    f.sqlite
      .prepare(
        "INSERT INTO billing_accounts(owner,customer,generation) VALUES('owner','cus_fixture','generation')",
      )
      .run();
    f.subscriptions.mockResolvedValue({ data: [subscription()], has_more: false });
    vi.mocked(f.stripe.invoices.list).mockResolvedValue({
      data: [
        {
          livemode: true,
          amount_paid: 0,
          lines: {
            data: [
              {
                pricing: { price_details: { price: liveCatalogue.price } },
                period: { end: 9999999999 },
              },
            ],
            has_more: false,
          },
        },
        invoice('in_fixture', now - 86400_000, now + 86400_000),
      ],
      has_more: false,
    } as never);
    expect((await billingWebhook(signed(event), f.env, f.deps)).status).toBe(200);
    expect(f.sqlite.prepare('SELECT paid_until FROM billing_subscriptions').get()).toEqual({
      paid_until: now + 86400_000,
    });
  });
  it('grants ten non-expiring credits only after provider-confirmed paid Checkout and only once', async () => {
    const f = fixture();
    storedAccount(f);
    f.sqlite
      .prepare(
        'INSERT INTO review_pack_checkouts(id,owner,generation,checkout,created_at) VALUES (?,?,?,?,?)',
      )
      .run('attempt', 'owner', 'generation', 'cs_paid', now);
    const session = {
      id: 'cs_paid',
      mode: 'payment',
      livemode: true,
      status: 'complete',
      payment_status: 'paid',
      client_reference_id: 'attempt',
      customer: 'cus_fixture',
      currency: 'eur',
      amount_total: 499,
      consent: { terms_of_service: 'accepted' },
      payment_intent: { id: 'pi_paid', latest_charge: { id: 'ch_paid' } },
    };
    vi.mocked(f.stripe.checkout.sessions.retrieve).mockResolvedValue({
      ...session,
      line_items: { data: [{ quantity: 1, price: { id: 'price_review_fixture' } }] },
    } as never);
    const event = {
      id: 'evt_pack_paid',
      object: 'event',
      livemode: true,
      type: 'checkout.session.completed',
      data: { object: session },
    };
    expect((await billingWebhook(signed(event), f.env, f.deps)).status).toBe(200);
    expect(
      (
        await billingWebhook(
          signed({
            ...event,
            id: 'evt_pack_async',
            type: 'checkout.session.async_payment_succeeded',
          }),
          f.env,
          f.deps,
        )
      ).status,
    ).toBe(200);
    expect(f.sqlite.prepare('SELECT owner,credits,charge FROM review_credit_packs').get()).toEqual({
      owner: 'owner',
      credits: 10,
      charge: 'ch_paid',
    });
  });
  it('recovers a paid session whose Checkout ID was not persisted before webhook delivery', async () => {
    const f = fixture();
    storedAccount(f);
    f.sqlite
      .prepare('INSERT INTO review_pack_checkouts(id,owner,generation,created_at) VALUES (?,?,?,?)')
      .run('attempt', 'owner', 'generation', now);
    const session = {
      id: 'cs_recovered',
      mode: 'payment',
      livemode: true,
      status: 'complete',
      payment_status: 'paid',
      client_reference_id: 'attempt',
      customer: 'cus_fixture',
      currency: 'eur',
      amount_total: 499,
      consent: { terms_of_service: 'accepted' },
      payment_intent: { id: 'pi_recovered', latest_charge: { id: 'ch_recovered' } },
    };
    vi.mocked(f.stripe.checkout.sessions.retrieve).mockResolvedValue({
      ...session,
      line_items: { data: [{ quantity: 1, price: { id: 'price_review_fixture' } }] },
    } as never);
    expect(
      (
        await billingWebhook(
          signed({
            id: 'evt_pack_recovered',
            object: 'event',
            livemode: true,
            type: 'checkout.session.completed',
            data: { object: session },
          }),
          f.env,
          f.deps,
        )
      ).status,
    ).toBe(200);
    expect(f.sqlite.prepare('SELECT checkout,state FROM review_pack_checkouts').get()).toEqual({
      checkout: 'cs_recovered',
      state: 'paid',
    });
    expect(f.sqlite.prepare('SELECT credits FROM review_credit_packs').get()).toEqual({
      credits: 10,
    });
  });
  it('recovers a missed paid webhook from scheduled provider reconciliation', async () => {
    const f = fixture();
    storedAccount(f);
    f.sqlite
      .prepare(
        'INSERT INTO review_pack_checkouts(id,owner,generation,checkout,created_at) VALUES (?,?,?,?,?)',
      )
      .run('attempt', 'owner', 'generation', 'cs_missed', now);
    const session = {
      id: 'cs_missed',
      mode: 'payment',
      livemode: true,
      status: 'complete',
      payment_status: 'paid',
      client_reference_id: 'attempt',
      customer: 'cus_fixture',
      currency: 'eur',
      amount_total: 499,
      consent: { terms_of_service: 'accepted' },
      payment_intent: { id: 'pi_missed', latest_charge: { id: 'ch_missed' } },
    };
    vi.mocked(f.stripe.checkout.sessions.retrieve).mockResolvedValue({
      ...session,
      line_items: { data: [{ quantity: 1, price: { id: 'price_review_fixture' } }] },
    } as never);
    await reconcileBilling(f.env, f.deps);
    expect(f.sqlite.prepare('SELECT credits FROM review_credit_packs').get()).toEqual({
      credits: 10,
    });
  });
  it('retires a terminally failed async attempt so another purchase can proceed', async () => {
    const f = fixture();
    storedAccount(f);
    f.sqlite
      .prepare(
        'INSERT INTO review_pack_checkouts(id,owner,generation,checkout,created_at) VALUES (?,?,?,?,?)',
      )
      .run('failed-attempt', 'owner', 'failed-generation', 'cs_failed', now);
    vi.mocked(f.stripe.checkout.sessions.retrieve).mockResolvedValue({
      id: 'cs_failed',
      mode: 'payment',
      status: 'complete',
      payment_status: 'unpaid',
      payment_intent: 'pi_failed',
    } as never);
    vi.mocked(f.stripe.paymentIntents.retrieve).mockResolvedValue({
      status: 'requires_payment_method',
    } as never);
    await reconcileBilling(f.env, f.deps);
    expect(
      f.sqlite.prepare('SELECT state FROM review_pack_checkouts WHERE id=?').get('failed-attempt'),
    ).toEqual({ state: 'failed' });
    expect((await billingApi(request(), f.env, 'owner', profile, f.deps)).status).toBe(200);
  });
  it('acknowledges completed asynchronous payment while unpaid without granting credits', async () => {
    const f = fixture();
    storedAccount(f);
    f.sqlite
      .prepare(
        'INSERT INTO review_pack_checkouts(id,owner,generation,checkout,created_at) VALUES (?,?,?,?,?)',
      )
      .run('attempt', 'owner', 'generation', 'cs_pending', now);
    const session = {
      id: 'cs_pending',
      mode: 'payment',
      livemode: true,
      status: 'complete',
      payment_status: 'unpaid',
      client_reference_id: 'attempt',
      customer: 'cus_fixture',
      currency: 'eur',
      amount_total: 499,
    };
    vi.mocked(f.stripe.checkout.sessions.retrieve).mockResolvedValue(session as never);
    expect(
      (
        await billingWebhook(
          signed({
            id: 'evt_pack_pending',
            object: 'event',
            livemode: true,
            type: 'checkout.session.completed',
            data: { object: session },
          }),
          f.env,
          f.deps,
        )
      ).status,
    ).toBe(200);
    expect(f.sqlite.prepare('SELECT * FROM review_credit_packs').all()).toEqual([]);
  });
  it('does not fulfil a payment when hosted terms consent is absent', async () => {
    const f = fixture();
    storedAccount(f);
    f.sqlite
      .prepare(
        'INSERT INTO review_pack_checkouts(id,owner,generation,checkout,created_at) VALUES (?,?,?,?,?)',
      )
      .run('attempt', 'owner', 'generation', 'cs_no_consent', now);
    const session = {
      id: 'cs_no_consent',
      mode: 'payment',
      livemode: true,
      status: 'complete',
      payment_status: 'paid',
      client_reference_id: 'attempt',
      customer: 'cus_fixture',
      currency: 'eur',
      amount_total: 499,
      payment_intent: { id: 'pi_no_consent', latest_charge: { id: 'ch_no_consent' } },
    };
    vi.mocked(f.stripe.checkout.sessions.retrieve).mockResolvedValue({
      ...session,
      line_items: { data: [{ quantity: 1, price: { id: 'price_review_fixture' } }] },
    } as never);
    expect(
      (
        await billingWebhook(
          signed({
            id: 'evt_pack_no_consent',
            object: 'event',
            livemode: true,
            type: 'checkout.session.completed',
            data: { object: session },
          }),
          f.env,
          f.deps,
        )
      ).status,
    ).toBe(503);
    expect(f.sqlite.prepare('SELECT * FROM review_credit_packs').all()).toEqual([]);
  });
  it('applies disputes to only the affected pack and resolves from current provider dispute state', async () => {
    const f = fixture();
    storedAccount(f);
    f.sqlite
      .prepare(
        'INSERT INTO review_pack_checkouts(id,owner,generation,checkout,created_at) VALUES (?,?,?,?,?)',
      )
      .run('attempt', 'owner', 'generation', 'cs_paid', now);
    const session = {
      id: 'cs_paid',
      mode: 'payment',
      livemode: true,
      status: 'complete',
      payment_status: 'paid',
      client_reference_id: 'attempt',
      customer: 'cus_fixture',
      currency: 'eur',
      amount_total: 499,
      consent: { terms_of_service: 'accepted' },
      payment_intent: { id: 'pi_paid', latest_charge: { id: 'ch_fixture' } },
    };
    vi.mocked(f.stripe.checkout.sessions.retrieve).mockResolvedValue({
      ...session,
      line_items: { data: [{ quantity: 1, price: { id: 'price_review_fixture' } }] },
    } as never);
    expect(
      (
        await billingWebhook(
          signed({
            id: 'evt_pack_paid',
            object: 'event',
            livemode: true,
            type: 'checkout.session.completed',
            data: { object: session },
          }),
          f.env,
          f.deps,
        )
      ).status,
    ).toBe(200);
    vi.mocked(f.stripe.disputes.list).mockResolvedValue({
      data: [{ status: 'needs_response' }],
      has_more: false,
    } as never);
    expect(
      (
        await billingWebhook(
          signed({
            id: 'evt_pack_dispute',
            object: 'event',
            livemode: true,
            type: 'charge.dispute.created',
            data: { object: { id: 'dp_fixture', charge: 'ch_fixture', payment_intent: 'pi_paid' } },
          }),
          f.env,
          f.deps,
        )
      ).status,
    ).toBe(200);
    expect(f.sqlite.prepare('SELECT frozen FROM review_credit_packs').get()).toEqual({ frozen: 1 });
    vi.mocked(f.stripe.disputes.list).mockResolvedValue({
      data: [{ status: 'won' }],
      has_more: false,
    } as never);
    expect(
      (
        await billingWebhook(
          signed({
            id: 'evt_pack_dispute_won',
            object: 'event',
            livemode: true,
            type: 'charge.dispute.closed',
            data: {
              object: {
                id: 'dp_fixture',
                charge: 'ch_fixture',
                payment_intent: 'pi_paid',
                status: 'lost',
              },
            },
          }),
          f.env,
          f.deps,
        )
      ).status,
    ).toBe(200);
    expect(f.sqlite.prepare('SELECT frozen,refunded FROM review_credit_packs').get()).toEqual({
      frozen: 0,
      refunded: 0,
    });
    vi.mocked(f.stripe.disputes.list).mockResolvedValue({
      data: [{ status: 'warning_closed' }],
      has_more: false,
    } as never);
    expect(
      (
        await billingWebhook(
          signed({
            id: 'evt_pack_warning_closed',
            object: 'event',
            livemode: true,
            type: 'charge.dispute.closed',
            data: { object: { id: 'dp_fixture', charge: 'ch_fixture', payment_intent: 'pi_paid' } },
          }),
          f.env,
          f.deps,
        )
      ).status,
    ).toBe(200);
    expect(f.sqlite.prepare('SELECT frozen,refunded FROM review_credit_packs').get()).toEqual({
      frozen: 0,
      refunded: 0,
    });
  });
  it('serialises dispute state with paid Checkout fulfilment', async () => {
    const f = fixture();
    storedAccount(f);
    f.sqlite
      .prepare('INSERT INTO review_pack_checkouts(id,owner,generation,created_at) VALUES (?,?,?,?)')
      .run('attempt', 'owner', 'generation', now);
    const session = {
      id: 'cs_race',
      mode: 'payment',
      livemode: true,
      status: 'complete',
      payment_status: 'paid',
      client_reference_id: 'attempt',
      customer: 'cus_fixture',
      currency: 'eur',
      amount_total: 499,
      consent: { terms_of_service: 'accepted' },
      payment_intent: { id: 'pi_paid', latest_charge: { id: 'ch_fixture' } },
    };
    vi.mocked(f.stripe.checkout.sessions.retrieve).mockResolvedValue({
      ...session,
      line_items: { data: [{ quantity: 1, price: { id: 'price_review_fixture' } }] },
    } as never);
    vi.mocked(f.stripe.paymentIntents.retrieve).mockResolvedValue({
      latest_charge: 'ch_fixture',
      metadata: { checkout_attempt: 'attempt' },
    } as never);
    vi.mocked(f.stripe.disputes.list).mockResolvedValue({
      data: [{ status: 'needs_response' }],
      has_more: false,
    } as never);
    const purchase = {
      id: 'evt_pack_race',
      object: 'event',
      livemode: true,
      type: 'checkout.session.completed',
      data: { object: session },
    };
    const dispute = {
      id: 'evt_dispute_race',
      object: 'event',
      livemode: true,
      type: 'charge.dispute.created',
      data: { object: { id: 'dp_race', charge: 'ch_fixture', payment_intent: 'pi_paid' } },
    };
    const results = await Promise.all([
      billingWebhook(signed(purchase), f.env, f.deps),
      billingWebhook(signed(dispute), f.env, f.deps),
    ]);
    for (const [index, result] of results.entries())
      {if (result.status === 503)
        expect(
          (await billingWebhook(signed(index === 0 ? purchase : dispute), f.env, f.deps)).status,
        ).toBe(200);}
    expect(f.sqlite.prepare('SELECT frozen FROM review_credit_packs').get()).toEqual({ frozen: 1 });
  });
  it('does not accept mutated body bytes', async () => {
    const original = signed(event),
      header = original.headers.get('Stripe-Signature')!;
    await expect(
      verifyStripeEvent(
        JSON.stringify({ ...event, id: 'evt_other' }),
        header,
        'fixture-signing-secret',
        now,
      ),
    ).rejects.toThrow();
  });
});

function subscription(status = 'active'): Stripe.Subscription {
  return {
    id: 'sub_fixture',
    customer: 'cus_fixture',
    livemode: true,
    status,
    cancel_at: null,
    ended_at: null,
    trial_end: null,
    currency: 'eur',
    cancel_at_period_end: false,
    items: {
      data: [
        {
          current_period_end: Math.floor(now / 1000) + 86400,
          price: { id: liveCatalogue.price, unit_amount: 800 },
        },
      ],
    },
  } as Stripe.Subscription;
}
function invoice(
  id: string,
  start: number,
  end: number,
  status = 'paid',
  paidAt = start,
): Stripe.Invoice {
  return {
    id,
    customer: 'cus_fixture',
    livemode: true,
    status,
    amount_paid: status === 'paid' ? 800 : 0,
    amount_due: 800,
    attempted: true,
    created: Math.floor(start / 1000),
    status_transitions: { paid_at: status === 'paid' ? Math.floor(paidAt / 1000) : null },
    lines: {
      has_more: false,
      data: [
        {
          amount: 800,
          pricing: { price_details: { price: liveCatalogue.price } },
          period: { start: Math.floor(start / 1000), end: Math.floor(end / 1000) },
        },
      ],
    },
  } as Stripe.Invoice;
}
function setInvoices(f: ReturnType<typeof fixture>, data: Stripe.Invoice[]) {
  vi.mocked(f.stripe.invoices.list).mockResolvedValue({ data, has_more: false } as never);
}
function storedAccount(f: ReturnType<typeof fixture>) {
  f.sqlite
    .prepare(
      "INSERT INTO billing_accounts(owner,customer,generation) VALUES('owner','cus_fixture','generation')",
    )
    .run();
}

describe('paid periods, renewal grace and payment risk', () => {
  it('grants grace only after a paid period and never extends it on delayed reconciliation', async () => {
    const f = fixture(),
      end = now + 30 * 86400_000;
    setInvoices(f, [invoice('in_due', now, end, 'open')]);
    await reconcileSubscription(f.env.DB, f.stripe, 'owner', subscription('past_due'), now);
    expect(await paidAccessUntil(f.env.DB, 'owner', now)).toBeNull();
    setInvoices(f, [
      invoice('in_previous', now - 30 * 86400_000, now),
      invoice('in_due', now, end, 'open'),
    ]);
    await reconcileSubscription(f.env.DB, f.stripe, 'owner', subscription('past_due'), now);
    expect(await paidAccessUntil(f.env.DB, 'owner', now)).toBe(now + graceMilliseconds);
    await reconcileSubscription(
      f.env.DB,
      f.stripe,
      'owner',
      subscription('past_due'),
      now + 6 * 86400_000,
    );
    expect(await paidAccessUntil(f.env.DB, 'owner', now + 6 * 86400_000)).toBe(
      now + graceMilliseconds,
    );
  });
  it('expires access exactly at the deadline even if provider cancellation fails, then retries', async () => {
    const f = fixture();
    setInvoices(f, [
      invoice('in_previous', now - 30 * 86400_000, now),
      invoice('in_due', now, now + 30 * 86400_000, 'open'),
    ]);
    vi.mocked(f.stripe.subscriptions.cancel).mockRejectedValueOnce(new Error('offline'));
    await expect(
      reconcileSubscription(
        f.env.DB,
        f.stripe,
        'owner',
        subscription('past_due'),
        now + graceMilliseconds,
      ),
    ).rejects.toThrow('offline');
    expect(await paidAccessUntil(f.env.DB, 'owner', now + graceMilliseconds)).toBeNull();
    await reconcileSubscription(
      f.env.DB,
      f.stripe,
      'owner',
      subscription('past_due'),
      now + graceMilliseconds + 1,
    );
    expect(f.stripe.subscriptions.cancel).toHaveBeenCalledTimes(2);
    expect(f.sqlite.prepare('SELECT status FROM billing_subscriptions').get()).toEqual({
      status: 'canceled',
    });
  });
  it('recovers within grace and starts a later renewal grace from its own invoice period', async () => {
    const f = fixture(),
      end = now + 30 * 86400_000;
    const old = invoice('in_previous', now - 30 * 86400_000, now);
    setInvoices(f, [old, invoice('in_due', now, end, 'open')]);
    await reconcileSubscription(f.env.DB, f.stripe, 'owner', subscription('past_due'), now);
    setInvoices(f, [old, invoice('in_due', now, end, 'paid', now + 86400_000)]);
    await reconcileSubscription(f.env.DB, f.stripe, 'owner', subscription(), now + 86400_000);
    expect(await paidAccessUntil(f.env.DB, 'owner', now + 86400_000)).toBe(end);
    setInvoices(f, [
      old,
      invoice('in_due', now, end, 'paid', now + 86400_000),
      invoice('in_later', end, end + 30 * 86400_000, 'open'),
    ]);
    await reconcileSubscription(f.env.DB, f.stripe, 'owner', subscription('past_due'), end);
    expect(await paidAccessUntil(f.env.DB, 'owner', end)).toBe(end + graceMilliseconds);
  });
  it('sends late renewal settlements to manual review rather than restoring access', async () => {
    const f = fixture();
    setInvoices(f, [
      invoice('in_previous', now - 30 * 86400_000, now),
      invoice('in_late', now, now + 30 * 86400_000, 'paid', now + graceMilliseconds),
    ]);
    await reconcileSubscription(
      f.env.DB,
      f.stripe,
      'owner',
      subscription(),
      now + graceMilliseconds,
    );
    expect(await paidAccessUntil(f.env.DB, 'owner', now + graceMilliseconds)).toBeNull();
    expect(f.sqlite.prepare('SELECT reason FROM billing_review_cases').all()).toEqual([
      { reason: 'late_payment' },
    ]);
  });
  it('cancels an overdue renewal even if Stripe marks its invoice uncollectible', async () => {
    const f = fixture();
    setInvoices(f, [
      invoice('in_previous', now - 30 * 86400_000, now),
      invoice('in_due', now, now + 30 * 86400_000, 'uncollectible'),
    ]);
    await reconcileSubscription(
      f.env.DB,
      f.stripe,
      'owner',
      subscription('unpaid'),
      now + graceMilliseconds,
    );
    expect(f.stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_fixture', {
      prorate: false,
      invoice_now: false,
    });
    expect(await paidAccessUntil(f.env.DB, 'owner', now + graceMilliseconds)).toBeNull();
  });
  it('revokes full refunds, preserves partial refunds and restores valid access after a dispute win', async () => {
    const f = fixture(),
      end = now + 86400_000;
    setInvoices(f, [invoice('in_current', now - 86400_000, end)]);
    await reconcileSubscription(f.env.DB, f.stripe, 'owner', subscription(), now);
    expect(await paidAccessUntil(f.env.DB, 'owner', now)).toBe(end);
    vi.mocked(f.stripe.charges.retrieve).mockResolvedValue({
      id: 'ch_fixture',
      livemode: true,
      customer: 'cus_fixture',
      amount: 800,
      amount_refunded: 100,
    } as never);
    await reconcileSubscription(f.env.DB, f.stripe, 'owner', subscription(), now);
    expect(await paidAccessUntil(f.env.DB, 'owner', now)).toBe(end);
    vi.mocked(f.stripe.disputes.list).mockResolvedValue({
      data: [{ status: 'needs_response' }],
      has_more: false,
    } as never);
    await reconcileSubscription(f.env.DB, f.stripe, 'owner', subscription(), now);
    expect(await paidAccessUntil(f.env.DB, 'owner', now)).toBeNull();
    vi.mocked(f.stripe.disputes.list).mockResolvedValue({
      data: [{ status: 'won' }],
      has_more: false,
    } as never);
    await reconcileSubscription(f.env.DB, f.stripe, 'owner', subscription(), now);
    expect(await paidAccessUntil(f.env.DB, 'owner', now)).toBe(end);
    expect(await paidAccessUntil(f.env.DB, 'owner', end)).toBe(end);
    vi.mocked(f.stripe.charges.retrieve).mockResolvedValue({
      id: 'ch_fixture',
      livemode: true,
      customer: 'cus_fixture',
      amount: 800,
      amount_refunded: 800,
    } as never);
    await reconcileSubscription(f.env.DB, f.stripe, 'owner', subscription(), now);
    expect(await paidAccessUntil(f.env.DB, 'owner', now)).toBeNull();
  });
  it('caps a cancelled paid period and never grants paid access during account deletion', async () => {
    const f = fixture();
    setInvoices(f, [invoice('in_current', now - 86400_000, now + 86400_000)]);
    const cancelled = { ...subscription('canceled'), ended_at: Math.floor(now / 1000) };
    await reconcileSubscription(f.env.DB, f.stripe, 'owner', cancelled, now);
    expect(await paidAccessUntil(f.env.DB, 'owner', now)).toBe(now);
    f.sqlite.prepare("INSERT INTO account_deletions(user_id,requested_at) VALUES('owner',0)").run();
    expect(await paidAccessUntil(f.env.DB, 'owner', now - 1)).toBeNull();
  });
  it('preserves a newer purchase when an older invoice is refunded', async () => {
    const f = fixture(),
      end = now + 86400_000;
    setInvoices(f, [
      invoice('in_old', now - 60 * 86400_000, now - 30 * 86400_000),
      invoice('in_new', now - 86400_000, end),
    ]);
    vi.mocked(f.stripe.invoicePayments.list).mockImplementation(
      (params) =>
        Promise.resolve({
          data: [
            {
              amount_paid: 800,
              payment: { charge: params?.invoice === 'in_old' ? 'ch_old' : 'ch_new' },
            },
          ],
          has_more: false,
        }) as never,
    );
    vi.mocked(f.stripe.charges.retrieve).mockImplementation(
      async (id) =>
        ({
          id,
          livemode: true,
          customer: 'cus_fixture',
          amount: 800,
          amount_refunded: id === 'ch_old' ? 800 : 0,
        }) as never,
    );
    await reconcileSubscription(f.env.DB, f.stripe, 'owner', subscription(), now);
    expect(await paidAccessUntil(f.env.DB, 'owner', now)).toBe(end);
    expect(f.sqlite.prepare('SELECT reason FROM billing_review_cases').get()).toEqual({
      reason: 'historical_refund',
    });
  });
});

describe('billing cancellation and scheduled reconciliation', () => {
  it('rejects writes from a Checkout worker that has lost its lease', async () => {
    const f = fixture();
    f.create.mockImplementationOnce(async () => {
      f.sqlite
        .prepare("UPDATE billing_accounts SET lease='new-owner',lease_until=? WHERE owner='owner'")
        .run(now + 3600_000);
      return {
        id: 'cs_uncertain',
        livemode: true,
        url: 'https://checkout.stripe.com/c/pay/uncertain',
      };
    });
    expect((await billingApi(request(), f.env, 'owner', profile, f.deps)).status).toBe(503);
    expect(f.sqlite.prepare('SELECT checkout,lease FROM billing_accounts').get()).toEqual({
      checkout: null,
      lease: 'new-owner',
    });
  });
  it('detects deletion racing Checkout creation and never returns the payment URL', async () => {
    const f = fixture();
    f.create.mockImplementationOnce(async () => {
      f.sqlite
        .prepare("INSERT INTO account_deletions(user_id,requested_at) VALUES('owner',0)")
        .run();
      return {
        id: 'cs_live_fixture',
        livemode: true,
        status: 'open',
        url: 'https://checkout.stripe.com/c/pay/fixture',
      };
    });
    const result = await billingApi(request(), f.env, 'owner', profile, f.deps);
    expect(result.status).toBe(403);
    expect(await result.json()).not.toHaveProperty('url');
    expect(f.stripe.checkout.sessions.expire).toHaveBeenCalledWith('cs_live_fixture');
  });
  it('expires open sessions and retries failed cancellation without erasing ownership', async () => {
    const f = fixture();
    storedAccount(f);
    f.subscriptions.mockResolvedValue({ data: [subscription()], has_more: false });
    f.sqlite
      .prepare(
        'INSERT INTO review_pack_checkouts(id,owner,generation,checkout,created_at) VALUES (?,?,?,?,?)',
      )
      .run('pack-attempt', 'owner', 'pack-generation', 'cs_pack_open', now);
    vi.mocked(f.stripe.checkout.sessions.list).mockResolvedValue({
      data: [{ id: 'cs_open', status: 'open' }],
      has_more: false,
    } as never);
    vi.mocked(f.stripe.checkout.sessions.retrieve).mockImplementation(
      async (id) => ({ id, status: 'open' }) as never,
    );
    vi.mocked(f.stripe.subscriptions.cancel).mockRejectedValueOnce(new Error('offline'));
    await expect(cancelAccountBilling(f.env, 'owner', f.deps)).rejects.toThrow();
    expect(f.sqlite.prepare('SELECT customer FROM billing_accounts').get()).toEqual({
      customer: 'cus_fixture',
    });
    await cancelAccountBilling(f.env, 'owner', f.deps);
    expect(f.stripe.checkout.sessions.expire).toHaveBeenCalledWith('cs_open');
    expect(f.stripe.checkout.sessions.expire).toHaveBeenCalledWith('cs_pack_open');
    expect(f.stripe.subscriptions.cancel).toHaveBeenCalledTimes(2);
  });
  it('reconciles without browser visits and isolates failed accounts for retry', async () => {
    const f = fixture();
    storedAccount(f);
    await reconcileBilling(f.env, f.deps);
    expect(f.sqlite.prepare('SELECT reconciled_at FROM billing_accounts').get()).toEqual({
      reconciled_at: now,
    });
    f.subscriptions.mockRejectedValue(new Error('offline'));
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await reconcileBilling(f.env, f.deps);
    } finally {
      logger.mockRestore();
    }
    expect(f.sqlite.prepare('SELECT reason FROM billing_review_cases').get()).toEqual({
      reason: 'reconciliation_failed',
    });
  });
  it('recovers an uncertain Checkout create from its durable attempt reference', async () => {
    const f = fixture();
    storedAccount(f);
    f.sqlite
      .prepare(
        "UPDATE billing_accounts SET checkout_created_at=?,checkout_trial_expires_at=?,checkout_language='en-GB'",
      )
      .run(now, profile.trialExpiresAt);
    vi.mocked(f.stripe.checkout.sessions.list).mockResolvedValue({
      data: [{ id: 'cs_recovered', client_reference_id: 'generation' }],
      has_more: false,
    } as never);
    await reconcileBilling(f.env, f.deps);
    expect(f.sqlite.prepare('SELECT checkout FROM billing_accounts').get()).toEqual({
      checkout: 'cs_recovered',
    });
    expect(f.create).not.toHaveBeenCalled();
  });
  it('puts early fraud warnings into review without suspending unrelated paid access', async () => {
    const f = fixture();
    storedAccount(f);
    f.subscriptions.mockResolvedValue({ data: [subscription()], has_more: false });
    setInvoices(f, [invoice('in_current', now - 86400_000, now + 86400_000)]);
    const result = await billingWebhook(
      signed({
        id: 'evt_warning',
        object: 'event',
        type: 'radar.early_fraud_warning.created',
        livemode: true,
        data: { object: { id: 'issfr_fixture', charge: 'ch_fixture' } },
      }),
      f.env,
      f.deps,
    );
    expect(result.status).toBe(200);
    expect(f.sqlite.prepare('SELECT reason FROM billing_review_cases').all()).toEqual([
      { reason: 'early_fraud_warning' },
    ]);
    expect(await paidAccessUntil(f.env.DB, 'owner', now)).toBe(now + 86400_000);
  });
});
