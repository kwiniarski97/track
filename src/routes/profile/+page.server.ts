import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	episodes,
	movies,
	shows,
	userTracking,
	userWatches,
	type TrackingStatus
} from '$lib/server/db/schema';
import { getShowProgress, type ShowProgress } from '$lib/server/media';
import type { PageServerLoad } from './$types';

export interface CompletedItem {
	mediaType: 'tv' | 'movie';
	tmdbId: number;
	title: string;
	posterPath: string | null;
	progress?: ShowProgress | null;
}

const MY_SHOWS_STATUSES: TrackingStatus[] = ['watching', 'completed', 'dropped'];

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

	const myShowTracking = await db
		.select()
		.from(userTracking)
		.where(
			and(
				eq(userTracking.userId, userId),
				eq(userTracking.mediaType, 'tv'),
				inArray(userTracking.status, MY_SHOWS_STATUSES)
			)
		);

	const watchedMovieRows = await db
		.select({ tmdbId: userWatches.tmdbId })
		.from(userWatches)
		.where(and(eq(userWatches.userId, userId), eq(userWatches.mediaType, 'movie')));

	const myShowIds = myShowTracking.map((t) => t.tmdbId);
	const watchedMovieIds = watchedMovieRows.map((r) => r.tmdbId);

	const showRows = myShowIds.length
		? await db.select().from(shows).where(inArray(shows.tmdbId, myShowIds))
		: [];
	const movieRows = watchedMovieIds.length
		? await db.select().from(movies).where(inArray(movies.tmdbId, watchedMovieIds))
		: [];

	const showById = new Map(showRows.map((s) => [s.tmdbId, s]));

	const progressByShowId = await getShowProgress(
		userId,
		myShowTracking.map((t) => ({ tmdbId: t.tmdbId, trackingStatus: t.status }))
	);

	function showsWithStatus(status: TrackingStatus): CompletedItem[] {
		return myShowTracking
			.filter((t) => t.status === status)
			.map((t): CompletedItem | null => {
				const show = showById.get(t.tmdbId);
				return show
					? {
							mediaType: 'tv',
							tmdbId: t.tmdbId,
							title: show.title,
							posterPath: show.posterPath,
							progress: progressByShowId.get(t.tmdbId) ?? null
						}
					: null;
			})
			.filter((item): item is CompletedItem => item !== null);
	}

	const watchingShows = showsWithStatus('watching');
	const completedShows = showsWithStatus('completed');
	const droppedShows = showsWithStatus('dropped');

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
		watchingShows,
		completedShows,
		droppedShows,
		completedMovies
	};
};
