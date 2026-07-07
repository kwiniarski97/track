CREATE TABLE `calendar_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`media_type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`title` text NOT NULL,
	`poster_path` text,
	`date` text NOT NULL,
	`season_number` integer,
	`episode_number` integer,
	`episode_name` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_entries_unique` ON `calendar_entries` (`user_id`,`media_type`,`tmdb_id`);