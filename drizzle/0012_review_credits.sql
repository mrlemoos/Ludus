CREATE TABLE `review_credit_pack_risks` (
	`id` text PRIMARY KEY NOT NULL,
	`charge` text,
	`payment_intent` text,
	`frozen` integer NOT NULL,
	`refunded` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "review_credit_pack_risk_frozen" CHECK("review_credit_pack_risks"."frozen" in (0,1)),
	CONSTRAINT "review_credit_pack_risk_refunded" CHECK("review_credit_pack_risks"."refunded" in (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_credit_pack_risks_charge_unique` ON `review_credit_pack_risks` (`charge`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_credit_pack_risks_payment_intent_unique` ON `review_credit_pack_risks` (`payment_intent`);--> statement-breakpoint
CREATE TABLE `review_credit_packs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`checkout` text NOT NULL,
	`payment_intent` text,
	`charge` text,
	`credits` integer NOT NULL,
	`frozen` integer DEFAULT 0 NOT NULL,
	`refunded` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "review_credit_pack_credits" CHECK("review_credit_packs"."credits" > 0),
	CONSTRAINT "review_credit_pack_frozen" CHECK("review_credit_packs"."frozen" in (0,1)),
	CONSTRAINT "review_credit_pack_refunded" CHECK("review_credit_packs"."refunded" in (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_credit_packs_checkout_unique` ON `review_credit_packs` (`checkout`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_credit_packs_payment_intent_unique` ON `review_credit_packs` (`payment_intent`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_credit_packs_charge_unique` ON `review_credit_packs` (`charge`);--> statement-breakpoint
CREATE INDEX `review_credit_pack_owner` ON `review_credit_packs` (`owner`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `review_credit_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`match_id` text NOT NULL,
	`source` text NOT NULL,
	`pack_id` text,
	`month` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pack_id`) REFERENCES `review_credit_packs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "review_credit_reservation_source" CHECK("review_credit_reservations"."source" in ('intro','beta','complimentary','paid')),
	CONSTRAINT "review_credit_reservation_state" CHECK("review_credit_reservations"."state" in ('reserved','committed','restored')),
	CONSTRAINT "review_credit_reservation_pack" CHECK(("review_credit_reservations"."source"='paid' and "review_credit_reservations"."pack_id" is not null) or ("review_credit_reservations"."source"<>'paid' and "review_credit_reservations"."pack_id" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_credit_reservation_idempotency` ON `review_credit_reservations` (`owner`,`match_id`) WHERE "review_credit_reservations"."state" in ('reserved','committed');--> statement-breakpoint
CREATE INDEX `review_credit_reservation_month` ON `review_credit_reservations` (`owner`,`month`,`source`,`state`);--> statement-breakpoint
CREATE INDEX `review_credit_reservation_pack` ON `review_credit_reservations` (`pack_id`,`state`);--> statement-breakpoint
CREATE TABLE `review_pack_checkouts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`generation` text NOT NULL,
	`checkout` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "review_pack_checkout_state" CHECK("review_pack_checkouts"."state" in ('pending','paid','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_pack_checkouts_generation_unique` ON `review_pack_checkouts` (`generation`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_pack_checkouts_checkout_unique` ON `review_pack_checkouts` (`checkout`);--> statement-breakpoint
CREATE INDEX `review_pack_checkout_owner` ON `review_pack_checkouts` (`owner`,`created_at`);--> statement-breakpoint
ALTER TABLE `matches` ADD `finished_at` integer;--> statement-breakpoint
UPDATE matches SET finished_at = (
  SELECT completed_at FROM activity_events WHERE game_id = matches.id AND user_id = matches.owner
) WHERE result IS NOT NULL;--> statement-breakpoint
CREATE INDEX `matches_owner_finished` ON `matches` (`owner`,`finished_at`);--> statement-breakpoint
ALTER TABLE `coach_reviews` ADD `history` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `coach_reviews` ADD `history_gaps` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `online_matches_white_finished` ON `online_matches` (`white_id`,`finished_at`);--> statement-breakpoint
CREATE INDEX `online_matches_black_finished` ON `online_matches` (`black_id`,`finished_at`);
