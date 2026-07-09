import { integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Mirrors the `locales` tuple in src/lib/paraglide/runtime.js -- kept as a plain literal
// here rather than importing generated code into the schema module.
export const appLocales = ['pl', 'en'] as const;
export type AppLocale = (typeof appLocales)[number];

export const users = sqliteTable('users', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	pocketIdSub: text('pocket_id_sub').notNull().unique(),
	email: text('email').notNull(),
	name: text('name').notNull(),
	locale: text('locale', { enum: appLocales }).notNull().default('pl'),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;

export const mediaTypes = ['tv', 'movie'] as const;
export type MediaType = (typeof mediaTypes)[number];

export const trackingStatuses = ['plan_to_watch', 'watching', 'completed', 'dropped'] as const;
export type TrackingStatus = (typeof trackingStatuses)[number];

export const watchSources = ['manual', 'jellyfin', 'import'] as const;
export type WatchSource = (typeof watchSources)[number];

/** Sentinel used in place of NULL for season/episode number on movie rows, so the
 * (user, media, tmdbId, season, episode) unique index also dedupes movie watches
 * -- SQLite treats every NULL as distinct, which would defeat that constraint. */
export const NO_EPISODE = -1;

export const shows = sqliteTable('shows', {
	tmdbId: integer('tmdb_id').primaryKey(),
	title: text('title').notNull(),
	posterPath: text('poster_path'),
	// Hex accent color extracted from the poster, used to retint the app's brand accent
	// while its show page is open -- see extractPosterColor in poster-color.ts.
	posterColor: text('poster_color'),
	// Backdrop image and audience score are shown on the show page's hero; cached here so
	// a TTL-fresh page view can be served entirely from the db without a TMDB fetch.
	backdropPath: text('backdrop_path'),
	voteAverage: real('vote_average'),
	voteCount: integer('vote_count'),
	overview: text('overview'),
	firstAirDate: text('first_air_date'),
	status: text('status'),
	// From TMDB's next_episode_to_air, refreshed by the calendar job -- null once a show
	// has no more scheduled episodes (ended, or between-seasons with nothing announced).
	nextEpisodeAirDate: text('next_episode_air_date'),
	nextEpisodeSeasonNumber: integer('next_episode_season_number'),
	nextEpisodeNumber: integer('next_episode_number'),
	nextEpisodeName: text('next_episode_name'),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const seasons = sqliteTable(
	'seasons',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		showTmdbId: integer('show_tmdb_id')
			.notNull()
			.references(() => shows.tmdbId, { onDelete: 'cascade' }),
		seasonNumber: integer('season_number').notNull(),
		name: text('name').notNull(),
		episodeCount: integer('episode_count').notNull().default(0),
		airDate: text('air_date')
	},
	(t) => [uniqueIndex('seasons_show_season_unique').on(t.showTmdbId, t.seasonNumber)]
);

export const episodes = sqliteTable(
	'episodes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		showTmdbId: integer('show_tmdb_id')
			.notNull()
			.references(() => shows.tmdbId, { onDelete: 'cascade' }),
		seasonNumber: integer('season_number').notNull(),
		episodeNumber: integer('episode_number').notNull(),
		title: text('title').notNull(),
		airDate: text('air_date'),
		runtime: integer('runtime'),
		stillPath: text('still_path'),
		voteAverage: real('vote_average'),
		voteCount: integer('vote_count')
	},
	(t) => [
		uniqueIndex('episodes_show_season_episode_unique').on(
			t.showTmdbId,
			t.seasonNumber,
			t.episodeNumber
		)
	]
);

export const movies = sqliteTable('movies', {
	tmdbId: integer('tmdb_id').primaryKey(),
	title: text('title').notNull(),
	posterPath: text('poster_path'),
	// Same reason as on `shows`: the movie page's hero backdrop and score badge must be
	// servable from the db when the cached row is still within its TTL.
	backdropPath: text('backdrop_path'),
	voteAverage: real('vote_average'),
	voteCount: integer('vote_count'),
	overview: text('overview'),
	releaseDate: text('release_date'),
	runtime: integer('runtime'),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const userTracking = sqliteTable(
	'user_tracking',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		mediaType: text('media_type', { enum: mediaTypes }).notNull(),
		tmdbId: integer('tmdb_id').notNull(),
		status: text('status', { enum: trackingStatuses }).notNull().default('watching'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [uniqueIndex('user_tracking_unique').on(t.userId, t.mediaType, t.tmdbId)]
);

export const userWatches = sqliteTable(
	'user_watches',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		mediaType: text('media_type', { enum: mediaTypes }).notNull(),
		tmdbId: integer('tmdb_id').notNull(),
		seasonNumber: integer('season_number').notNull().default(NO_EPISODE),
		episodeNumber: integer('episode_number').notNull().default(NO_EPISODE),
		watchedAt: integer('watched_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		source: text('source', { enum: watchSources }).notNull().default('manual'),
		// Idempotency key for the Phase 3 offline mutation queue; unset for jellyfin/import rows.
		clientMutationId: text('client_mutation_id').unique()
	},
	(t) => [
		uniqueIndex('user_watches_identity_unique').on(
			t.userId,
			t.mediaType,
			t.tmdbId,
			t.seasonNumber,
			t.episodeNumber
		)
	]
);

export const jellyfinLinks = sqliteTable('jellyfin_links', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	jellyfinUserId: text('jellyfin_user_id').notNull()
});

// Server-wide cache of which shows/movies exist in Jellyfin's library, refreshed on each
// sync -- powers the "in your library" badge without querying Jellyfin on every page view.
export const jellyfinLibraryItems = sqliteTable(
	'jellyfin_library_items',
	{
		mediaType: text('media_type', { enum: mediaTypes }).notNull(),
		tmdbId: integer('tmdb_id').notNull()
	},
	(t) => [primaryKey({ columns: [t.mediaType, t.tmdbId] })]
);

// Per-user cache of upcoming episode/release dates, rebuilt from the shows/movies tables
// by the twice-daily refreshCalendarCache job -- the calendar page only ever reads this,
// it never recomputes or hits TMDB on a page view. seasonNumber/episodeNumber/episodeName
// are only set for mediaType 'tv'.
export const calendarEntries = sqliteTable(
	'calendar_entries',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		mediaType: text('media_type', { enum: mediaTypes }).notNull(),
		tmdbId: integer('tmdb_id').notNull(),
		title: text('title').notNull(),
		posterPath: text('poster_path'),
		date: text('date').notNull(),
		seasonNumber: integer('season_number'),
		episodeNumber: integer('episode_number'),
		episodeName: text('episode_name')
	},
	(t) => [uniqueIndex('calendar_entries_unique').on(t.userId, t.mediaType, t.tmdbId)]
);
