import { liveCatalogue } from './stripe';
import type Stripe from 'stripe';

export const graceMilliseconds = 7 * 86400_000;
const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : value?.id;

export async function reviewBilling(
  db: D1Database,
  owner: string,
  resource: string,
  reason: string,
  now: number,
) {
  await db
    .prepare(
      'INSERT OR IGNORE INTO billing_review_cases(id,owner,reason,resource,created_at) VALUES (?,?,?,?,?)',
    )
    .bind(`${resource}:${reason}`, owner, reason, resource, now)
    .run();
  if (reason === 'reconciliation_failed')
    await db
      .prepare('UPDATE billing_review_cases SET resolved_at=NULL WHERE id=?')
      .bind(`${resource}:${reason}`)
      .run();
}

export function invoicePeriod(invoice: Stripe.Invoice): { start: number; end: number } | null {
  const lines = invoice.lines.data.filter(
    (line) => line.pricing?.price_details?.price === liveCatalogue.price && line.amount > 0,
  );
  if (!lines.length) return null;
  return {
    start: Math.min(...lines.map((line) => line.period.start)) * 1000,
    end: Math.max(...lines.map((line) => line.period.end)) * 1000,
  };
}

async function invoiceRisk(
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<'clear' | 'refunded' | 'disputed'> {
  const payments = await stripe.invoicePayments.list({
    invoice: invoice.id,
    status: 'paid',
    limit: 100,
  });
  if (payments.has_more || !payments.data.length) throw new Error('payment_graph_incomplete');
  let refunded = 0,
    disputed = false;
  for (const payment of payments.data) {
    let charge: Stripe.Charge;
    const chargeId = idOf(payment.payment.charge),
      intentId = idOf(payment.payment.payment_intent);
    if (chargeId) charge = await stripe.charges.retrieve(chargeId);
    else if (intentId) {
      const intent = await stripe.paymentIntents.retrieve(intentId);
      const latest = idOf(intent.latest_charge);
      if (!latest) throw new Error('missing_charge');
      charge = await stripe.charges.retrieve(latest);
    } else throw new Error('payment_requires_review');
    if (!charge.livemode || idOf(charge.customer) !== idOf(invoice.customer))
      throw new Error('charge_owner_mismatch');
    refunded +=
      charge.amount > 0 ? (charge.amount_refunded * (payment.amount_paid ?? 0)) / charge.amount : 0;
    const disputes = await stripe.disputes.list({ charge: charge.id, limit: 100 });
    if (disputes.has_more) throw new Error('dispute_history_requires_review');
    disputed ||= disputes.data.some(
      (dispute) => dispute.status !== 'won' && dispute.status !== 'warning_closed',
    );
  }
  return refunded >= invoice.amount_paid ? 'refunded' : disputed ? 'disputed' : 'clear';
}

/** Re-fetch current provider state; webhook arrival order is never an entitlement clock. */
export async function reconcileSubscription(
  db: D1Database,
  stripe: Stripe,
  owner: string,
  subscription: Stripe.Subscription,
  now: number,
  fence: () => Promise<void> = async () => {},
) {
  const invoices = await stripe.invoices.list({
    customer: idOf(subscription.customer)!,
    subscription: subscription.id,
    limit: 100,
  });
  if (invoices.has_more) throw new Error('billing_history_requires_review');
  const previous = await db
    .prepare('SELECT grace_until,cancel_requested_at FROM billing_subscriptions WHERE id=?')
    .bind(subscription.id)
    .first<{ grace_until: number | null; cancel_requested_at: number | null }>();
  let paidUntil: number | null = null,
    graceUntil: number | null = null,
    firstPaidAt: number | null = null;
  const positivePaid = invoices.data.filter(
    (invoice) => invoice.status === 'paid' && invoice.amount_paid > 0,
  );
  for (const invoice of invoices.data) {
    if (!invoice.livemode || invoice.lines.has_more) throw new Error('invoice_requires_review');
    const period = invoicePeriod(invoice);
    if (!period) continue;
    if (invoice.status !== 'paid' || invoice.amount_paid <= 0) continue;
    const paidAt = (invoice.status_transitions.paid_at ?? invoice.created) * 1000;
    let risk: string = await invoiceRisk(stripe, invoice);
    const earlierPaid = positivePaid.some(
      (earlier) =>
        earlier.id !== invoice.id && (invoicePeriod(earlier)?.end ?? Infinity) <= period.start,
    );
    if (earlierPaid && paidAt >= period.start + graceMilliseconds) {
      risk = 'late_payment';
      graceUntil = Math.min(graceUntil ?? Infinity, period.start + graceMilliseconds);
      await reviewBilling(db, owner, invoice.id, 'late_payment', now);
    }
    if (
      previous?.cancel_requested_at !== null &&
      previous?.cancel_requested_at !== undefined &&
      paidAt >= previous.cancel_requested_at
    ) {
      risk = 'late_payment';
      await reviewBilling(db, owner, invoice.id, 'late_payment', now);
    }
    if (risk === 'refunded' && period.end < now)
      await reviewBilling(db, owner, invoice.id, 'historical_refund', now);
    await fence();
    await db
      .prepare(
        'INSERT INTO billing_invoice_access(id,subscription,owner,period_start,period_end,paid_at,risk) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET period_start=excluded.period_start,period_end=excluded.period_end,paid_at=excluded.paid_at,risk=excluded.risk',
      )
      .bind(invoice.id, subscription.id, owner, period.start, period.end, paidAt, risk)
      .run();
    firstPaidAt = Math.min(firstPaidAt ?? paidAt, paidAt);
    if (risk === 'clear') paidUntil = Math.max(paidUntil ?? 0, period.end);
  }
  for (const invoice of invoices.data) {
    const period = invoicePeriod(invoice);
    if (
      !['open', 'uncollectible'].includes(invoice.status ?? '') ||
      !invoice.attempted ||
      !period ||
      firstPaidAt === null ||
      firstPaidAt >= period.start
    )
      continue;
    // Period start is the renewal due time even when a provider attempt or event arrives later.
    graceUntil = Math.min(graceUntil ?? Infinity, period.start + graceMilliseconds);
  }
  const item = subscription.items.data.find((item) => item.price.id === liveCatalogue.price)!;
  const cancelAt = subscription.ended_at
    ? subscription.ended_at * 1000
    : subscription.cancel_at
      ? subscription.cancel_at * 1000
      : subscription.cancel_at_period_end
        ? item.current_period_end * 1000
        : null;
  await fence();
  await db
    .prepare(`INSERT INTO billing_subscriptions(id,owner,status,paid_until,cancel_at,updated_at,grace_until,next_charge_at,amount,currency)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,paid_until=excluded.paid_until,cancel_at=excluded.cancel_at,updated_at=excluded.updated_at,grace_until=excluded.grace_until,next_charge_at=excluded.next_charge_at,amount=excluded.amount,currency=excluded.currency`)
    .bind(
      subscription.id,
      owner,
      subscription.status,
      paidUntil,
      cancelAt,
      now,
      graceUntil,
      subscription.trial_end ? subscription.trial_end * 1000 : item.current_period_end * 1000,
      item.price.unit_amount,
      subscription.currency,
    )
    .run();
  const cancellation =
    previous?.cancel_requested_at ?? (graceUntil !== null && now >= graceUntil ? graceUntil : null);
  if (cancellation !== null) {
    // Persist intent before provider I/O so failure cannot extend grace or permit repurchase.
    await db
      .prepare('UPDATE billing_subscriptions SET cancel_requested_at=? WHERE id=?')
      .bind(cancellation, subscription.id)
      .run();
    if (!['canceled', 'incomplete_expired'].includes(subscription.status)) {
      await stripe.subscriptions.cancel(subscription.id, { prorate: false, invoice_now: false });
      await fence();
      await db
        .prepare("UPDATE billing_subscriptions SET status='canceled' WHERE id=?")
        .bind(subscription.id)
        .run();
    }
  }
}

export async function recordRiskEvent(
  db: D1Database,
  stripe: Stripe,
  event: Stripe.Event,
  now: number,
): Promise<string | null> {
  const resource = event.data.object as unknown as {
    id: string;
    charge?: string | { id: string } | null;
    object?: string;
  };
  const chargeId = event.type === 'charge.refunded' ? resource.id : idOf(resource.charge);
  if (!chargeId) throw new Error('risk_charge_missing');
  const charge = await stripe.charges.retrieve(chargeId);
  const customer = idOf(charge.customer);
  if (!customer || !charge.livemode) return null;
  const owner = await db
    .prepare('SELECT owner FROM billing_accounts WHERE customer=?')
    .bind(customer)
    .first<{ owner: string }>();
  if (!owner) return null;
  const intent = idOf(charge.payment_intent);
  if (!intent) {
    await reviewBilling(db, owner.owner, charge.id, 'payment_graph_requires_review', now);
    return customer;
  }
  const payments = await stripe.invoicePayments.list({
    payment: { type: 'payment_intent', payment_intent: intent },
    limit: 100,
  });
  if (payments.has_more) throw new Error('payment_graph_requires_review');
  if (event.type.startsWith('radar.') || payments.data.length > 1)
    await reviewBilling(
      db,
      owner.owner,
      charge.id,
      event.type.startsWith('radar.') ? 'early_fraud_warning' : 'overlapping_payment_risk',
      now,
    );
  return customer;
}
