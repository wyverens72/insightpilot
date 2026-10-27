CREATE TABLE `monitor_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`evidence` text NOT NULL,
	`created` text NOT NULL,
	`read_at` text,
	`dedupe` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monitor_businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`website` text NOT NULL,
	`category` text NOT NULL,
	`location` text NOT NULL,
	`role` text NOT NULL,
	`created` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monitor_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`business_id` text NOT NULL,
	`owner` text NOT NULL,
	`external_id` text NOT NULL,
	`author` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`rating` integer,
	`sentiment` text NOT NULL,
	`topics` text NOT NULL,
	`published` text,
	`first_seen` text NOT NULL,
	`last_seen` text NOT NULL,
	`url` text NOT NULL,
	`language` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monitor_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`business_id` text NOT NULL,
	`owner` text NOT NULL,
	`started` text NOT NULL,
	`finished` text NOT NULL,
	`state` text NOT NULL,
	`added` integer NOT NULL,
	`updated` integer NOT NULL,
	`fetched` integer NOT NULL,
	`note` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monitor_settings` (
	`owner` text PRIMARY KEY NOT NULL,
	`min_complaints` integer DEFAULT 3 NOT NULL,
	`multiplier` integer DEFAULT 2 NOT NULL,
	`alerts_enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monitor_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`label` text NOT NULL,
	`state` text NOT NULL,
	`note` text NOT NULL,
	`last_checked` text,
	`last_success` text,
	`next_check` text NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monitor_state` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
