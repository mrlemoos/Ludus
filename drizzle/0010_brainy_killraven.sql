CREATE TABLE `billing_invoice_access` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription` text NOT NULL,
	`owner` text NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`paid_at` integer NOT NULL,
	`risk` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `billing_review_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`reason` text NOT NULL,
	`resource` text NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
ALTER TABLE `billing_accounts` ADD `reconciled_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `billing_subscriptions` ADD `grace_until` integer;--> statement-breakpoint
ALTER TABLE `billing_subscriptions` ADD `cancel_requested_at` integer;--> statement-breakpoint
ALTER TABLE `billing_subscriptions` ADD `next_charge_at` integer;--> statement-breakpoint
ALTER TABLE `billing_subscriptions` ADD `amount` integer;--> statement-breakpoint
ALTER TABLE `billing_subscriptions` ADD `currency` text;