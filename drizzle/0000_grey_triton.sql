CREATE TABLE `waitlist` (
	`email` text PRIMARY KEY NOT NULL,
	`language` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "waitlist_language" CHECK("waitlist"."language" in ('en-GB', 'es-ES', 'fr-FR'))
);
