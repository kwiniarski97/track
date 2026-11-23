import { and, asc, eq, inArray, lte, ne, notInArray, sql } from 'drizzle-orm';
import { db } from './db';
import {
	episodes,
	movies,
	seasons,
	shows,
	userTracking,
	userWatches,
	type TrackingStatus
} from './db/schema';
import {
	getMovieDetails,
	getShowDetails,
	getShowWithSeasons,
	type TmdbMovieDetails,
	type TmdbShowDetails
} from './tmdb';
import { extractPosterColor } from './poster-color';
import { chunk } from './concurrency';

/** Only re-derive the color when the poster actually changed (or we've never
 * computed one) -- it costs a network fetch + image decode, so skip it on the
 * common case of re-caching a show whose poster hasn't moved. */
async function resolvePosterColor(details: TmdbShowDetails): Promise<string | null> {
	const [existing] = await db
		.select({ posterPath: shows.posterPath, posterColor: shows.posterColor })
		.from(shows)
		.where(eq(shows.tmdbId, details.id));
	return existing && existing.posterPath === details.poster_path && existing.posterColor
		? existing.posterColor
		: await extractPosterColor(details.poster_path);
}

function showValues(details: TmdbShowDetails, posterColor: string | null) {
	return {
		tmdbId: details.id,
		title: details.name,
		posterPath: details.poster_path,
		posterColor,
		backdropPath: details.backdrop_path,
		voteAverage: details.vote_average,
		voteCount: details.vote_count,
		overview: details.overview,
		firstAirDate: details.first_air_date,
		status: details.status,
		originalLanguage: details.original_language,
		nextEpisodeAirDate: details.next_episode_to_air?.air_date ?? null,
		nextEpisodeSeasonNumber: details.next_episode_to_air?.season_number ?? null,
		nextEpisodeNumber: details.next_episode_to_air?.episode_number ?? null,
		nextEpisodeName: details.next_episode_to_air?.name ?? null
	};
}

async function upsertShow(details: TmdbShowDetails): Promise<void> {
	const values = showValues(details, await resolvePosterColor(details));
	await db
		.insert(shows)
		.values(values)
		.onConflictDoUpdate({ target: shows.tmdbId, set: { ...values, updatedAt: new Date() } });
}

/** Fetches fresh TMDB data for a show and upserts the local cache, including the
 * next-episode-to-air fields the calendar reads. */
export async function refreshShow(tmdbId: number): Promise<TmdbShowDetails> {
	const details = await getShowDetails(tmdbId);
	await upsertShow(details);
	return details;
}

/** Batch size for multi-row upserts: 100 rows of our widest table (10 columns) stays
 * comfortably under SQLite's bound-parameter limit while still cutting a per-row loop
 * down to a handful of statements. */
export const UPSERT_CHUNK_SIZE = 100;

/** Upserts per-season episode counts, which drive both the show page's season list
 * and syncShowCompletion's "has everything been watched" total. */
export async function cacheShowSeasons(tmdbId: number, details: TmdbShowDetails): Promise<void> {
	const values = details.seasons.map((season) => ({
		showTmdbId: tmdbId,
		seasonNumber: season.season_number,
		name: season.name,
		episodeCount: season.episode_count,
		airDate: season.air_date
	}));
	// Drizzle throws on a multi-row insert with an empty values array.
	if (values.length === 0) return;

	// One multi-row statement per chunk instead of one round trip per season --
	// `excluded.*` refers to each conflicting row's own incoming values.
	for (const batch of chunk(values, UPSERT_CHUNK_SIZE)) {
		await db
			.insert(seasons)
			.values(batch)
			.onConflictDoUpdate({
				target: [seasons.showTmdbId, seasons.seasonNumber],
				set: {
					name: sql`excluded.name`,
					episodeCount: sql`excluded.episode_count`,
					airDate: sql`excluded.air_date`
				}
			});
	}
}

/** Fetches a show's details, seasons and episodes from TMDB and writes the whole snapshot
 * in one transaction, stamping `synced_at`. Throws on a TMDB failure before touching the
 * db. All awaits happen before the transaction: better-sqlite3 transactions are
 * synchronous, so the callback must not be async. */
export async function syncShow(tmdbId: number): Promise<void> {
	const cached = await db
		.select({ seasonNumber: seasons.seasonNumber })
		.from(seasons)
		.where(eq(seasons.showTmdbId, tmdbId))
		.orderBy(asc(seasons.seasonNumber));
	const { details, seasons: seasonPayloads } = await getShowWithSeasons(
		tmdbId,
		cached.map((s) => s.seasonNumber)
	);
	const posterColor = await resolvePosterColor(details);

	const values = showValues(details, posterColor);
	const now = new Date();
	const seasonValues = details.seasons.map((season) => ({
		showTmdbId: tmdbId,
		seasonNumber: season.season_number,
		name: season.name,
		episodeCount: season.episode_count,
		airDate: season.air_date
	}));

	db.transaction((tx) => {
		tx.insert(shows)
			.values({ ...values, syncedAt: now })
			.onConflictDoUpdate({
				target: shows.tmdbId,
				set: { ...values, syncedAt: now, updatedAt: now }
			})
			.run();

		for (const batch of chunk(seasonValues, UPSERT_CHUNK_SIZE)) {
			tx.insert(seasons)
				.values(batch)
				.onConflictDoUpdate({
					target: [seasons.showTmdbId, seasons.seasonNumber],
					set: {
						name: sql`excluded.name`,
						episodeCount: sql`excluded.episode_count`,
						airDate: sql`excluded.air_date`
					}
				})
				.run();
		}

		// Only seasons TMDB actually returned are touched; an omitted season keeps its cache.
		for (const [seasonNumber, payload] of seasonPayloads) {
			const episodeValues = payload.episodes.map((ep) => ({
				showTmdbId: tmdbId,
				seasonNumber,
				episodeNumber: ep.episode_number,
				title: ep.name,
				overview: ep.overview ?? '',
				airDate: ep.air_date,
				runtime: ep.runtime,
				stillPath: ep.still_path,
				voteAverage: ep.vote_average,
				voteCount: ep.vote_count
			}));
			for (const batch of chunk(episodeValues, UPSERT_CHUNK_SIZE)) {
				tx.insert(episodes)
					.values(batch)
					.onConflictDoUpdate({
						target: [episodes.showTmdbId, episodes.seasonNumber, episodes.episodeNumber],
						set: {
							title: sql`excluded.title`,
							overview: sql`excluded.overview`,
							airDate: sql`excluded.air_date`,
							runtime: sql`excluded.runtime`,
							stillPath: sql`excluded.still_path`,
							voteAverage: sql`excluded.vote_average`,
							voteCount: sql`excluded.vote_count`
						}
					})
					.run();
			}
			const inSeason = and(
				eq(episodes.showTmdbId, tmdbId),
				eq(episodes.seasonNumber, seasonNumber)
			);
			tx.delete(episodes)
				.where(
					episodeValues.length === 0
						? inSeason
						: and(
								inSeason,
								notInArray(
									episodes.episodeNumber,
									episodeValues.map((e) => e.episodeNumber)
								)
							)
				)
				.run();
		}
	});
}

async function upsertMovie(details: TmdbMovieDetails): Promise<void> {
	const values = {
		tmdbId: details.id,
		title: details.title,
		posterPath: details.poster_path,
		backdropPath: details.backdrop_path,
		voteAverage: details.vote_average,
		voteCount: details.vote_count,
		overview: details.overview,
		releaseDate: details.release_date,
		runtime: details.runtime
	};
	await db
		.insert(movies)
		.values(values)
		.onConflictDoUpdate({ target: movies.tmdbId, set: { ...values, updatedAt: new Date() } });
}

export async function refreshMovie(tmdbId: number): Promise<TmdbMovieDetails> {
	const details = await getMovieDetails(tmdbId);
	await upsertMovie(details);
	return details;
}

/** How long a cached show/movie row may serve detail-page views before we go back to
 * TMDB. The twice-daily refreshMetadata job keeps tracked titles fresher than this
 * anyway, so in practice only untracked titles ever age out via a page view. */
export const MEDIA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** The subset of TMDB show details the show page actually renders, kept in TMDB's
 * snake_case shape so both a fresh `TmdbShowDetails` response and a row rebuilt from
 * the db satisfy it structurally -- the page component never needs to know which path
 * produced it. */
export type ShowSummary = {
	id: number;
	name: string;
	overview: string;
	poster_path: string | null;
	backdrop_path: string | null;
	first_air_date: string | null;
	status: string;
	// Mirrors TMDB's next_episode_to_air. Already cached per-column by the calendar
	// job; reconstructed here so the show page's hero can name the next episode
	// without a TMDB round trip.
	next_episode_to_air: {
		air_date: string | null;
		episode_number: number;
		season_number: number;
		name: string;
	} | null;
	vote_average: number;
	vote_count: number;
	seasons: Array<{
		season_number: number;
		name: string;
		episode_count: number;
		air_date: string | null;
	}>;
};

/** Same idea as ShowSummary, for the movie page. */
export type MovieSummary = {
	id: number;
	title: string;
	overview: string;
	poster_path: string | null;
	backdrop_path: string | null;
	release_date: string | null;
	runtime: number | null;
	vote_average: number;
	vote_count: number;
};

/** How long an unfollowed show's cache is trusted before opening its page re-syncs it
 * (followed shows are kept fresh by the background job instead). */
export const UNFOLLOWED_RESYNC_MS = 24 * 60 * 60 * 1000;

/** "Followed" = at least one user tracks it as something other than dropped -- the same
 * predicate the background sync job uses to pick shows. */
export async function isShowFollowed(tmdbId: number): Promise<boolean> {
	const [row] = await db
		.select({ id: userTracking.id })
		.from(userTracking)
		.where(
			and(
				eq(userTracking.mediaType, 'tv'),
				eq(userTracking.tmdbId, tmdbId),
				ne(userTracking.status, 'dropped')
			)
		)
		.limit(1);
	return !!row;
}

/** Rebuilds the page payload from the db alone. Null when there is no row, or when the
 * row was never synced and has no season rows (e.g. written by the calendar job or import),
 * since the page can't render without a season list. A synced snapshot with zero seasons
 * is legitimate (announced shows) and yields an empty list. */
async function readShowSummary(tmdbId: number): Promise<ShowSummary | null> {
	const [cached] = await db.select().from(shows).where(eq(shows.tmdbId, tmdbId));
	if (!cached) return null;
	const seasonRows = await db.select().from(seasons).where(eq(seasons.showTmdbId, tmdbId));
	if (seasonRows.length === 0 && !cached.syncedAt) return null;
	return {
		id: cached.tmdbId,
		name: cached.title,
		// The db column is nullable but TMDB always sends a string (possibly
		// empty), so an empty string is the faithful round trip.
		overview: cached.overview ?? '',
		poster_path: cached.posterPath,
		backdrop_path: cached.backdropPath,
		first_air_date: cached.firstAirDate,
		status: cached.status ?? '',
		// The season/episode numbers are written together with the air date, so a
		// non-null air date is enough to treat the whole group as present.
		next_episode_to_air:
			cached.nextEpisodeAirDate !== null
				? {
						air_date: cached.nextEpisodeAirDate,
						episode_number: cached.nextEpisodeNumber ?? 0,
						season_number: cached.nextEpisodeSeasonNumber ?? 0,
						name: cached.nextEpisodeName ?? ''
					}
				: null,
		vote_average: cached.voteAverage ?? 0,
		vote_count: cached.voteCount ?? 0,
		seasons: seasonRows.map((s) => ({
			season_number: s.seasonNumber,
			name: s.name,
			episode_count: s.episodeCount,
			air_date: s.airDate
		}))
	};
}

/** Serves the show page from the db. The background job keeps followed shows fresh, so
 * TMDB is only hit for a never-synced show, or an unfollowed one whose sync is over 24h
 * old. A failed sync degrades to whatever is cached; only a show with nothing cached
 * errors. */
export async function getShowForPage(tmdbId: number): Promise<ShowSummary> {
	const [row] = await db
		.select({ syncedAt: shows.syncedAt })
		.from(shows)
		.where(eq(shows.tmdbId, tmdbId));

	if (row?.syncedAt) {
		const stale = Date.now() - row.syncedAt.getTime() >= UNFOLLOWED_RESYNC_MS;
		if (stale && !(await isShowFollowed(tmdbId))) {
			try {
				await syncShow(tmdbId);
			} catch (err) {
				console.error(`Re-sync of unfollowed show ${tmdbId} failed, serving cache`, err);
			}
		}
		// A synced row always has a summary, even with zero seasons.
		return (await readShowSummary(tmdbId))!;
	}

	try {
		await syncShow(tmdbId);
	} catch (err) {
		const cached = await readShowSummary(tmdbId);
		if (cached) {
			console.error(`First sync of show ${tmdbId} failed, serving cache`, err);
			return cached;
		}
		throw err;
	}
	// syncShow stamps synced_at, so the summary exists even when TMDB lists no seasons.
	return (await readShowSummary(tmdbId))!;
}

/** Movie-page counterpart of the show page's cache-first loading (no seasons involved). */
export async function getMovieCachedOrRefresh(tmdbId: number): Promise<MovieSummary> {
	const [cached] = await db.select().from(movies).where(eq(movies.tmdbId, tmdbId));
	if (
		cached &&
		cached.voteCount !== null &&
		cached.voteAverage !== null &&
		Date.now() - cached.updatedAt.getTime() < MEDIA_CACHE_TTL_MS
	) {
		return {
			id: cached.tmdbId,
			title: cached.title,
			overview: cached.overview ?? '',
			poster_path: cached.posterPath,
			backdrop_path: cached.backdropPath,
			release_date: cached.releaseDate,
			runtime: cached.runtime,
			vote_average: cached.voteAverage,
			vote_count: cached.voteCount
		};
	}
	return refreshMovie(tmdbId);
}

// TMDB's `status` field for a show is one of these -- only the first two mean no more
// episodes are coming. Anything else (still airing, renewed, upcoming) should keep a
// fully-watched show as 'watching' rather than flipping it to 'completed'.
const ENDED_SHOW_STATUSES = new Set(['Ended', 'Canceled']);

/** Flips a tracked show between 'watching' and 'completed' to match whether every
 * cached non-special episode has been watched -- specials (season 0) don't count
 * toward completion, so a show with every regular episode watched but no specials
 * logged still completes. Also requires the show itself to have ended: a renewed or
 * still-airing show that's fully caught up stays 'watching' since more episodes are
 * coming. Relies on the `seasons` cache, which is populated by the show sync (background job,
 * import, or opening a never-synced show) -- if it's empty this is a no-op rather than a false
 * completion. Leaves plan_to_watch/dropped alone since those are deliberate choices. */
export async function syncShowCompletion(userId: string, tmdbId: number): Promise<void> {
	const [tracking] = await db
		.select()
		.from(userTracking)
		.where(
			and(
				eq(userTracking.userId, userId),
				eq(userTracking.mediaType, 'tv'),
				eq(userTracking.tmdbId, tmdbId)
			)
		);
	if (!tracking || (tracking.status !== 'watching' && tracking.status !== 'completed')) return;

	const [showRow] = await db
		.select({ status: shows.status })
		.from(shows)
		.where(eq(shows.tmdbId, tmdbId));
	// Unknown status (show not cached) falls back to the old behavior rather than
	// blocking completion forever.
	const showHasEnded = !showRow?.status || ENDED_SHOW_STATUSES.has(showRow.status);

	const [{ total }] = await db
		.select({ total: sql<number>`coalesce(sum(${seasons.episodeCount}), 0)` })
		.from(seasons)
		.where(and(eq(seasons.showTmdbId, tmdbId), sql`${seasons.seasonNumber} != 0`));

	const [{ watched }] = await db
		.select({ watched: sql<number>`count(*)` })
		.from(userWatches)
		.where(
			and(
				eq(userWatches.userId, userId),
				eq(userWatches.mediaType, 'tv'),
				eq(userWatches.tmdbId, tmdbId),
				sql`${userWatches.seasonNumber} != 0`
			)
		);

	const newStatus = total > 0 && watched >= total && showHasEnded ? 'completed' : 'watching';
	if (newStatus !== tracking.status) {
		await db
			.update(userTracking)
			.set({ status: newStatus })
			.where(eq(userTracking.id, tracking.id));
	}
}

export interface ShowProgress {
	watched: number;
	total: number;
	state: 'completed' | 'up_to_date' | 'behind';
}

/** Per-show watched/total episode counts (specials excluded) for the progress bar on
 * show cards, plus a `state` driving its color: 'completed' mirrors the tracking
 * status, 'up_to_date' means every aired episode has been watched (the show can still
 * have unaired episodes counted in `total`), and 'behind' means at least one aired
 * episode is unwatched. Shows with no cached season data (never opened) are omitted so
 * callers can hide the bar instead of showing a meaningless 0/0. */
export async function getShowProgress(
	userId: string,
	showsInput: Array<{ tmdbId: number; trackingStatus: TrackingStatus }>
): Promise<Map<number, ShowProgress>> {
	const tmdbIds = showsInput.map((s) => s.tmdbId);
	if (tmdbIds.length === 0) return new Map();

	const today = new Date().toISOString().slice(0, 10);

	const totalRows = await db
		.select({
			showTmdbId: seasons.showTmdbId,
			total: sql<number>`coalesce(sum(${seasons.episodeCount}), 0)`
		})
		.from(seasons)
		.where(and(inArray(seasons.showTmdbId, tmdbIds), sql`${seasons.seasonNumber} != 0`))
		.groupBy(seasons.showTmdbId);

	const airedRows = await db
		.select({ showTmdbId: episodes.showTmdbId, aired: sql<number>`count(*)` })
		.from(episodes)
		.where(
			and(
				inArray(episodes.showTmdbId, tmdbIds),
				sql`${episodes.seasonNumber} != 0`,
				sql`${episodes.airDate} is not null`,
				lte(episodes.airDate, today)
			)
		)
		.groupBy(episodes.showTmdbId);

	const watchedRows = await db
		.select({ tmdbId: userWatches.tmdbId, watched: sql<number>`count(*)` })
		.from(userWatches)
		.where(
			and(
				eq(userWatches.userId, userId),
				eq(userWatches.mediaType, 'tv'),
				inArray(userWatches.tmdbId, tmdbIds),
				sql`${userWatches.seasonNumber} != 0`
			)
		)
		.groupBy(userWatches.tmdbId);

	const totalByShow = new Map(totalRows.map((r) => [r.showTmdbId, r.total]));
	const airedByShow = new Map(airedRows.map((r) => [r.showTmdbId, r.aired]));
	const watchedByShow = new Map(watchedRows.map((r) => [r.tmdbId, r.watched]));

	const result = new Map<number, ShowProgress>();
	for (const { tmdbId, trackingStatus } of showsInput) {
		const total = totalByShow.get(tmdbId) ?? 0;
		if (total === 0) continue;

		const watched = watchedByShow.get(tmdbId) ?? 0;
		const aired = airedByShow.get(tmdbId) ?? 0;
		const state: ShowProgress['state'] =
			trackingStatus === 'completed' ? 'completed' : watched >= aired ? 'up_to_date' : 'behind';

		result.set(tmdbId, { watched, total, state });
	}
	return result;
}
