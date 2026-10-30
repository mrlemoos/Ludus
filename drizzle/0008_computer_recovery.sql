ALTER TABLE `matches` ADD `control` text DEFAULT '5+3' NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `difficulty` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `colour` text DEFAULT 'w' NOT NULL;