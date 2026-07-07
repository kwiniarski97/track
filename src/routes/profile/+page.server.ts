import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { episodes, movies, shows, userTracking, userWatches } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export interface CompletedItem {
	mediaType: 'tv' | 'movie';
	tmdbId: number;
	title: string;
	posterPath: string | null;
}

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;

	const [episodeStats] = await db
		.select({
			count: sql<number>`count(*)`,
			minutes: sql<number>`coalesce(sum(${episodes.runtime}), 0)`
		})
		.from(userWatches)
		.innerJoin(
			episodes,
			and(
				eq(userWatches.tmdbId, episodes.showTmdbId),
				eq(userWatches.seasonNumber, episodes.seasonNumber),
				eq(userWatches.episodeNumber, episodes.episodeNumber)
			)
		)
		.where(and(eq(userWatches.userId, userId), eq(userWatches.mediaType, 'tv')));

	const [movieStats] = await db
		.select({
			count: sql<number>`count(*)`,
			minutes: sql<number>`coalesce(sum(${movies.runtime}), 0)`
		})
		.from(userWatches)
		.innerJoin(movies, eq(userWatches.tmdbId, movies.tmdbId))
		.where(and(eq(userWatches.userId, userId), eq(userWatches.mediaType, 'movie')));

	const completedShowTracking = await db
		.select()
		.from(userTracking)
		.where(
			and(
				eq(userTracking.userId, userId),
				eq(userTracking.mediaType, 'tv'),
				eq(userTracking.status, 'completed')
			)
		);

	const watchedMovieRows = await db
		.select({ tmdbId: userWatches.tmdbId })
		.from(userWatches)
		.where(and(eq(userWatches.userId, userId), eq(userWatches.mediaType, 'movie')));

	const completedShowIds = completedShowTracking.map((t) => t.tmdbId);
	const watchedMovieIds = watchedMovieRows.map((r) => r.tmdbId);

	const showRows = completedShowIds.length
		? await db.select().from(shows).where(inArray(shows.tmdbId, completedShowIds))
		: [];
	const movieRows = watchedMovieIds.length
		? await db.select().from(movies).where(inArray(movies.tmdbId, watchedMovieIds))
		: [];

	const completedShows: CompletedItem[] = showRows.map((s) => ({
		mediaType: 'tv',
		tmdbId: s.tmdbId,
		title: s.title,
		posterPath: s.posterPath
	}));
	const completedMovies: CompletedItem[] = movieRows.map((mv) => ({
		mediaType: 'movie',
		tmdbId: mv.tmdbId,
		title: mv.title,
		posterPath: mv.posterPath
	}));

	return {
		stats: {
			totalMinutes: Number(episodeStats.minutes) + Number(movieStats.minutes),
			episodesWatched: Number(episodeStats.count),
			showsCompleted: completedShows.length,
			moviesWatched: Number(movieStats.count)
		},
		completedShows,
		completedMovies
	};
};
