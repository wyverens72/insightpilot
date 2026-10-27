CREATE INDEX `monitor_alert_owner` ON `monitor_alerts` (`owner`,`created`);--> statement-breakpoint
CREATE INDEX `monitor_business_owner` ON `monitor_businesses` (`owner`,`archived`);--> statement-breakpoint
CREATE INDEX `monitor_review_business` ON `monitor_reviews` (`business_id`,`owner`,`published`);--> statement-breakpoint
CREATE INDEX `monitor_runs_source` ON `monitor_runs` (`source_id`,`started`);--> statement-breakpoint
CREATE INDEX `monitor_source_due` ON `monitor_sources` (`enabled`,`next_check`);--> statement-breakpoint
CREATE INDEX `monitor_source_business` ON `monitor_sources` (`business_id`,`owner`);