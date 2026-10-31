import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
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
