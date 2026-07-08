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
import {
	PROFILE_SORTS,
	sortProfileItems,
	type ProfileSort,
	type SortableItem
} from '$lib/server/profileSort';
import type { PageServerLoad } from './$types';

export interface CompletedItem {
	mediaType: 'tv' | 'movie';
	tmdbId: number;
	title: string;
	posterPath: string | null;
	progress?: ShowProgress | null;
}

const MY_SHOWS_STATUSES: TrackingStatus[] = ['watching', 'completed', 'dropped'];

export const load: PageServerLoad = async ({ locals, url }) => {
	const userId = locals.user!.id;

	const sortParam = url.searchParams.get('sort');
	const sort: ProfileSort = PROFILE_SORTS.includes(sortParam as ProfileSort)
		? (sortParam as ProfileSort)
		: 'added_desc';

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
		.select({ tmdbId: userWatches.tmdbId, watchedAt: userWatches.watchedAt })
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
	const watchedAtByMovieId = new Map(watchedMovieRows.map((r) => [r.tmdbId, r.watchedAt]));

	const progressByShowId = await getShowProgress(
		userId,
		myShowTracking.map((t) => ({ tmdbId: t.tmdbId, trackingStatus: t.status }))
	);

	function showsWithStatus(status: TrackingStatus): CompletedItem[] {
		const sortable = myShowTracking
			.filter((t) => t.status === status)
			.map((t): SortableItem<CompletedItem> | null => {
				const show = showById.get(t.tmdbId);
				return show
					? {
							item: {
								mediaType: 'tv',
								tmdbId: t.tmdbId,
								title: show.title,
								posterPath: show.posterPath,
								progress: progressByShowId.get(t.tmdbId) ?? null
							},
							title: show.title,
							addedAt: t.createdAt.getTime(),
							releaseDate: show.firstAirDate
						}
					: null;
			})
			.filter((s): s is SortableItem<CompletedItem> => s !== null);
		return sortProfileItems(sortable, sort);
	}

	const watchingShows = showsWithStatus('watching');
	const completedShows = showsWithStatus('completed');
	const droppedShows = showsWithStatus('dropped');

	const completedMovies: CompletedItem[] = sortProfileItems(
		movieRows.map((mv): SortableItem<CompletedItem> => ({
			item: {
				mediaType: 'movie',
				tmdbId: mv.tmdbId,
				title: mv.title,
				posterPath: mv.posterPath
			},
			title: mv.title,
			addedAt: (watchedAtByMovieId.get(mv.tmdbId) ?? new Date(0)).getTime(),
			releaseDate: mv.releaseDate
		})),
		sort
	);

	return {
		stats: {
			totalMinutes: Number(episodeStats.minutes) + Number(movieStats.minutes),
			episodesWatched: Number(episodeStats.count),
			showsCompleted: completedShows.length,
			moviesWatched: Number(movieStats.count)
		},
		sort,
		watchingShows,
		completedShows,
		droppedShows,
		completedMovies
	};
};
