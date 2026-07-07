import { and, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { movies, seasons, shows, userTracking, userWatches } from './db/schema';
import {
	getMovieDetails,
	getShowDetails,
	type TmdbMovieDetails,
	type TmdbShowDetails
} from './tmdb';

async function upsertShow(details: TmdbShowDetails): Promise<void> {
	const values = {
		tmdbId: details.id,
		title: details.name,
		posterPath: details.poster_path,
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

/** Flips a tracked show between 'watching' and 'completed' to match whether every
 * cached episode (including specials, same set the show page lets you check off) has
 * been watched. Relies on the `seasons` cache, which is only populated once someone
 * has opened the show page -- if it's empty this is a no-op rather than a false
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

	const [{ total }] = await db
		.select({ total: sql<number>`coalesce(sum(${seasons.episodeCount}), 0)` })
		.from(seasons)
		.where(eq(seasons.showTmdbId, tmdbId));

	const [{ watched }] = await db
		.select({ watched: sql<number>`count(*)` })
		.from(userWatches)
		.where(
			and(
				eq(userWatches.userId, userId),
				eq(userWatches.mediaType, 'tv'),
				eq(userWatches.tmdbId, tmdbId)
			)
		);

	const newStatus = total > 0 && watched >= total ? 'completed' : 'watching';
	if (newStatus !== tracking.status) {
		await db
			.update(userTracking)
			.set({ status: newStatus })
			.where(eq(userTracking.id, tracking.id));
	}
}
