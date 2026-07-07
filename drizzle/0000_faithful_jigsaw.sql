CREATE TABLE `episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_tmdb_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`episode_number` integer NOT NULL,
	`title` text NOT NULL,
	`air_date` text,
	FOREIGN KEY (`show_tmdb_id`) REFERENCES `shows`(`tmdb_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_show_season_episode_unique` ON `episodes` (`show_tmdb_id`,`season_number`,`episode_number`);--> statement-breakpoint
CREATE TABLE `jellyfin_library_items` (
	`media_type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	PRIMARY KEY(`media_type`, `tmdb_id`)
);
--> statement-breakpoint
CREATE TABLE `jellyfin_links` (
	`user_id` text PRIMARY KEY NOT NULL,
	`jellyfin_user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `movies` (
	`tmdb_id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`poster_path` text,
	`overview` text,
	`release_date` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_tmdb_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`name` text NOT NULL,
	`episode_count` integer DEFAULT 0 NOT NULL,
	`air_date` text,
	FOREIGN KEY (`show_tmdb_id`) REFERENCES `shows`(`tmdb_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_show_season_unique` ON `seasons` (`show_tmdb_id`,`season_number`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `shows` (
	`tmdb_id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`poster_path` text,
	`overview` text,
	`first_air_date` text,
	`status` text,
	`next_episode_air_date` text,
	`next_episode_season_number` integer,
	`next_episode_number` integer,
	`next_episode_name` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_tracking` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`media_type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`status` text DEFAULT 'watching' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_tracking_unique` ON `user_tracking` (`user_id`,`media_type`,`tmdb_id`);--> statement-breakpoint
CREATE TABLE `user_watches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`media_type` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`season_number` integer DEFAULT -1 NOT NULL,
	`episode_number` integer DEFAULT -1 NOT NULL,
	`watched_at` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`client_mutation_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_watches_client_mutation_id_unique` ON `user_watches` (`client_mutation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_watches_identity_unique` ON `user_watches` (`user_id`,`media_type`,`tmdb_id`,`season_number`,`episode_number`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`pocket_id_sub` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`locale` text DEFAULT 'pl' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_pocket_id_sub_unique` ON `users` (`pocket_id_sub`);