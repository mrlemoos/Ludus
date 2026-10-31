CREATE TABLE `billing_accounts` (
	`owner` text PRIMARY KEY NOT NULL,
	`customer` text,
	`generation` text NOT NULL,
	`checkout` text,
	`checkout_created_at` integer,
	`checkout_trial_expires_at` integer,
	`checkout_language` text,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_accounts_customer_unique` ON `billing_accounts` (`customer`);--> statement-breakpoint
CREATE TABLE `billing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE TABLE `billing_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`status` text NOT NULL,
	`paid_until` integer,
	`cancel_at` integer,
	`updated_at` integer NOT NULL
);
