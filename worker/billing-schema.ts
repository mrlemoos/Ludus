import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './schema';

export const billingAccounts = sqliteTable('billing_accounts', {
  owner: text('owner').primaryKey().references(() => user.id),
  customer: text('customer').unique(),
  generation: text('generation').notNull(),
  checkout: text('checkout'),
  checkoutCreatedAt: integer('checkout_created_at'),
  checkoutTrialExpiresAt: integer('checkout_trial_expires_at'),
  checkoutLanguage: text('checkout_language'),
  lease: text('lease'), leaseUntil: integer('lease_until').notNull().default(0),
  reconciledAt: integer('reconciled_at').notNull().default(0),
});

export const billingEvents = sqliteTable('billing_events', {
  id: text('id').primaryKey(), type: text('type').notNull(),
  receivedAt: integer('received_at').notNull(), processedAt: integer('processed_at'),
});

export const billingSubscriptions = sqliteTable('billing_subscriptions', {
  id: text('id').primaryKey(), owner: text('owner').notNull(),
  status: text('status').notNull(), paidUntil: integer('paid_until'),
  cancelAt: integer('cancel_at'), updatedAt: integer('updated_at').notNull(),
  graceUntil: integer('grace_until'), cancelRequestedAt: integer('cancel_requested_at'),
  nextChargeAt: integer('next_charge_at'), amount: integer('amount'), currency: text('currency'),
});

export const billingInvoiceAccess = sqliteTable('billing_invoice_access', {
  id: text('id').primaryKey(), subscription: text('subscription').notNull(), owner: text('owner').notNull(),
  periodStart: integer('period_start').notNull(), periodEnd: integer('period_end').notNull(),
  paidAt: integer('paid_at').notNull(), risk: text('risk').notNull(),
});

export const billingReviewCases = sqliteTable('billing_review_cases', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), reason: text('reason').notNull(),
  resource: text('resource').notNull(), createdAt: integer('created_at').notNull(), resolvedAt: integer('resolved_at'),
});

export const reviewPackCheckouts = sqliteTable('review_pack_checkouts', {
  id: text('id').primaryKey(), owner: text('owner').notNull().references(() => user.id), generation: text('generation').notNull().unique(),
  checkout: text('checkout').unique(), state: text('state').notNull().default('pending'), createdAt: integer('created_at').notNull(),
}, (table) => [check('review_pack_checkout_state', sql`${table.state} in ('pending','paid','failed')`), index('review_pack_checkout_owner').on(table.owner, table.createdAt)]);

export const reviewCreditPacks = sqliteTable('review_credit_packs', {
  id: text('id').primaryKey(), owner: text('owner').notNull().references(() => user.id), checkout: text('checkout').notNull().unique(),
  paymentIntent: text('payment_intent').unique(), charge: text('charge').unique(), credits: integer('credits').notNull(),
  frozen: integer('frozen').notNull().default(0), refunded: integer('refunded').notNull().default(0),
  createdAt: integer('created_at').notNull(),
}, (table) => [check('review_credit_pack_credits', sql`${table.credits} > 0`), check('review_credit_pack_frozen', sql`${table.frozen} in (0,1)`), check('review_credit_pack_refunded', sql`${table.refunded} in (0,1)`), index('review_credit_pack_owner').on(table.owner, table.createdAt, table.id)]);

export const reviewCreditPackRisks = sqliteTable('review_credit_pack_risks', {
  id: text('id').primaryKey(), charge: text('charge').unique(), paymentIntent: text('payment_intent').unique(),
  frozen: integer('frozen').notNull(), refunded: integer('refunded').notNull(), updatedAt: integer('updated_at').notNull(),
}, (table) => [check('review_credit_pack_risk_frozen', sql`${table.frozen} in (0,1)`), check('review_credit_pack_risk_refunded', sql`${table.refunded} in (0,1)`)]);

export const reviewCreditReservations = sqliteTable('review_credit_reservations', {
  id: text('id').primaryKey(), owner: text('owner').notNull().references(() => user.id), matchId: text('match_id').notNull(),
  source: text('source').notNull(), packId: text('pack_id').references(() => reviewCreditPacks.id), month: text('month').notNull(),
  state: text('state').notNull(), createdAt: integer('created_at').notNull(),
}, (table) => [
  check('review_credit_reservation_source', sql`${table.source} in ('intro','beta','complimentary','paid')`),
  check('review_credit_reservation_state', sql`${table.state} in ('reserved','committed','restored')`),
  check('review_credit_reservation_pack', sql`(${table.source}='paid' and ${table.packId} is not null) or (${table.source}<>'paid' and ${table.packId} is null)`),
  uniqueIndex('review_credit_reservation_idempotency').on(table.owner, table.matchId).where(sql`${table.state} in ('reserved','committed')`),
  index('review_credit_reservation_month').on(table.owner, table.month, table.source, table.state),
  index('review_credit_reservation_pack').on(table.packId, table.state),
]);
