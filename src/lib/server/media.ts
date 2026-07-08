import { and, eq, inArray, lte, sql } from 'drizzle-orm';
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
	type TmdbMovieDetails,
	type TmdbShowDetails
} from './tmdb';
import { extractPosterColor } from './poster-color';

async function upsertShow(details: TmdbShowDetails): Promise<void> {
	const [existing] = await db
		.select({ posterPath: shows.posterPath, posterColor: shows.posterColor })
		.from(shows)
		.where(eq(shows.tmdbId, details.id));

	// Only re-derive the color when the poster actually changed (or we've never
	// computed one) -- it costs a network fetch + image decode, so skip it on the
	// common case of re-caching a show whose poster hasn't moved.
	const posterColor =
		existing && existing.posterPath === details.poster_path && existing.posterColor
			? existing.posterColor
			: await extractPosterColor(details.poster_path);

	const values = {
		tmdbId: details.id,
		title: details.name,
		posterPath: details.poster_path,
		posterColor,
		overview: details.overview,
		firstAirDate: details.first_air_date,
		status: details.status,
		nextEpisodeAirDate: details.next_episode_to_air?.air_date ?? null,
		nextEpisodeSeasonNumber: details.next_episode_to_air?.season_number ?? null,
		nextEpisodeNumber: details.next_episode_to_air?.episode_number ?? null,
		nextEpisodeName: details.next_episode_to_air?.name ?? null
	};
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

/** Upserts per-season episode counts, which drive both the show page's season list
 * and syncShowCompletion's "has everything been watched" total. */
export async function cacheShowSeasons(tmdbId: number, details: TmdbShowDetails): Promise<void> {
	for (const season of details.seasons) {
		await db
			.insert(seasons)
			.values({
				showTmdbId: tmdbId,
				seasonNumber: season.season_number,
				name: season.name,
				episodeCount: season.episode_count,
				airDate: season.air_date
			})
			.onConflictDoUpdate({
				target: [seasons.showTmdbId, seasons.seasonNumber],
				set: { name: season.name, episodeCount: season.episode_count, airDate: season.air_date }
			});
	}
}

async function upsertMovie(details: TmdbMovieDetails): Promise<void> {
	const values = {
		tmdbId: details.id,
		title: details.title,
		posterPath: details.poster_path,
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

// TMDB's `status` field for a show is one of these -- only the first two mean no more
// episodes are coming. Anything else (still airing, renewed, upcoming) should keep a
// fully-watched show as 'watching' rather than flipping it to 'completed'.
const ENDED_SHOW_STATUSES = new Set(['Ended', 'Canceled']);

/** Flips a tracked show between 'watching' and 'completed' to match whether every
 * cached non-special episode has been watched -- specials (season 0) don't count
 * toward completion, so a show with every regular episode watched but no specials
 * logged still completes. Also requires the show itself to have ended: a renewed or
 * still-airing show that's fully caught up stays 'watching' since more episodes are
 * coming. Relies on the `seasons` cache, which is only populated once someone has
 * opened the show page -- if it's empty this is a no-op rather than a false
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
