import type { Language } from '../shared/waitlist';
import Stripe from 'stripe';

export const liveCatalogue = {
  product: 'ludus_plus',
  price: 'price_1UWeBDBVWchHmktzPeGqPM30',
  portal: 'bpc_1UWeBnBVWchHmktzjD7skdf0',
} as const;

export function stripeFor(env: Env) {
  if (!env.STRIPE_API_KEY?.match(/^[sr]k_live_/)) throw new Error('stripe_live_key_required');
  return new Stripe(env.STRIPE_API_KEY, {
    apiVersion: '2026-10-28.endive',
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 15_000,
    maxNetworkRetries: 1,
  });
}

export function billingEnabled(env: Env): boolean {
  return (
    env.STRIPE_BILLING_ENABLED === 'true' &&
    env.STRIPE_TAX_READY === 'true' &&
    env.STRIPE_LIFECYCLE_READY === 'true'
  );
}

/** Stripe Checkout needs 48 hours for trial_end; short beta remainders use a free initial billing period. */
export function betaBilling(
  trialExpiresAt: number,
  now: number,
): Stripe.Checkout.SessionCreateParams.SubscriptionData {
  const end = Math.ceil(trialExpiresAt / 1000);
  if (trialExpiresAt <= now) return { billing_mode: { type: 'flexible' } };
  return {
    billing_mode: { type: 'flexible' },
    ...(trialExpiresAt - now >= 49 * 3_600_000
      ? { trial_end: end }
      : { billing_cycle_anchor: end, proration_behavior: 'none' as const }),
  };
}

export function checkoutParams(
  customer: string,
  trialExpiresAt: number,
  now: number,
  language: Language,
  identifier: string,
  attempt = identifier,
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: 'subscription',
    customer,
    adaptive_pricing: { enabled: true },
    line_items: [{ price: liveCatalogue.price, quantity: 1 }],
    locale: { 'en-GB': 'en-GB', 'es-ES': 'es', 'fr-FR': 'fr' }[
      language
    ] as Stripe.Checkout.SessionCreateParams.Locale,
    subscription_data: betaBilling(trialExpiresAt, now),
    integration_identifier: `ludus_${identifier}`,
    client_reference_id: attempt,
    payment_method_collection: 'always',
    success_url: 'https://ludus.mrlemoos.dev/account?billing=returned',
    cancel_url: 'https://ludus.mrlemoos.dev/account?billing=cancelled',
  };
}

export async function verifyStripeEvent(
  body: string,
  signature: string,
  secret: string,
  now = Date.now(),
): Promise<Stripe.Event> {
  return Stripe.webhooks.constructEventAsync(
    body,
    signature,
    secret,
    300,
    Stripe.createSubtleCryptoProvider(),
    now,
  );
}
