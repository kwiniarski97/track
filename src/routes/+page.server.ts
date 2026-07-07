import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	episodes,
	movies,
	shows,
	userTracking,
	userWatches,
	type TrackingStatus
} from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export interface TrackedItem {
	mediaType: 'tv' | 'movie';
	tmdbId: number;
	title: string;
	posterPath: string | null;
	hasNewEpisode?: boolean;
}

const SECTION_STATUSES: TrackingStatus[] = ['watching', 'plan_to_watch'];
const RECENTLY_WATCHED_LIMIT = 6;
// How far back an episode's air date can be and still count as "new" for the
// Watching section's badge/sort-to-front treatment.
const NEW_EPISODE_WINDOW_DAYS = 30;

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;

	const tracking = await db
		.select()
		.from(userTracking)
		.where(and(eq(userTracking.userId, userId), inArray(userTracking.status, SECTION_STATUSES)))
		.orderBy(desc(userTracking.createdAt));

	const showIds = tracking.filter((t) => t.mediaType === 'tv').map((t) => t.tmdbId);
	const movieIds = tracking.filter((t) => t.mediaType === 'movie').map((t) => t.tmdbId);

	const showRows = showIds.length
		? await db.select().from(shows).where(inArray(shows.tmdbId, showIds))
		: [];
	const movieRows = movieIds.length
		? await db.select().from(movies).where(inArray(movies.tmdbId, movieIds))
		: [];

	const showById = new Map(showRows.map((s) => [s.tmdbId, s]));
	const movieById = new Map(movieRows.map((mv) => [mv.tmdbId, mv]));

	// Shows in the Watching section that have an episode which aired in the last
	// NEW_EPISODE_WINDOW_DAYS and hasn't been logged as watched yet -- these get the
	// "new episode" badge and float to the top of the section. Relies on the `episodes`
	// cache, which is only populated once someone has opened the show page, so a
	// recently-aired episode for a show that hasn't been visited won't be caught here.
	const watchingShowIds = tracking
		.filter((t) => t.mediaType === 'tv' && t.status === 'watching')
		.map((t) => t.tmdbId);

	const newEpisodeShowIds = new Set<number>();
	if (watchingShowIds.length) {
		const today = new Date().toISOString().slice(0, 10);
		const windowStart = new Date(Date.now() - NEW_EPISODE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
			.toISOString()
			.slice(0, 10);

		const recentAiredEpisodes = await db
			.select({
				showTmdbId: episodes.showTmdbId,
				seasonNumber: episodes.seasonNumber,
				episodeNumber: episodes.episodeNumber
			})
			.from(episodes)
			.where(
				and(
					inArray(episodes.showTmdbId, watchingShowIds),
					gte(episodes.airDate, windowStart),
					lte(episodes.airDate, today)
				)
			);

		const watchesForWatchingShows = await db
			.select({
				tmdbId: userWatches.tmdbId,
				seasonNumber: userWatches.seasonNumber,
				episodeNumber: userWatches.episodeNumber
			})
			.from(userWatches)
			.where(
				and(
					eq(userWatches.userId, userId),
					eq(userWatches.mediaType, 'tv'),
					inArray(userWatches.tmdbId, watchingShowIds)
				)
			);
		const watchedKey = (tmdbId: number, season: number, episode: number) =>
			`${tmdbId}-${season}-${episode}`;
		const watchedSet = new Set(
			watchesForWatchingShows.map((w) => watchedKey(w.tmdbId, w.seasonNumber, w.episodeNumber))
		);

		for (const ep of recentAiredEpisodes) {
			if (!watchedSet.has(watchedKey(ep.showTmdbId, ep.seasonNumber, ep.episodeNumber))) {
				newEpisodeShowIds.add(ep.showTmdbId);
			}
		}
	}

	function toItem(t: (typeof tracking)[number]): TrackedItem | null {
		if (t.mediaType === 'tv') {
			const show = showById.get(t.tmdbId);
			return show
				? {
						mediaType: 'tv',
						tmdbId: t.tmdbId,
						title: show.title,
						posterPath: show.posterPath,
						hasNewEpisode: newEpisodeShowIds.has(t.tmdbId)
					}
				: null;
		}
		const movie = movieById.get(t.tmdbId);
		return movie
			? { mediaType: 'movie', tmdbId: t.tmdbId, title: movie.title, posterPath: movie.posterPath }
			: null;
	}

	const isTrackedItem = (item: TrackedItem | null): item is TrackedItem => item !== null;

	// Most-recently-watched distinct series, regardless of tracking status -- a show
	// dropped or completed can still surface here if an episode was just (re)watched.
	const recentWatches = await db
		.select({
			tmdbId: userWatches.tmdbId,
			lastWatchedAt: sql<number>`max(${userWatches.watchedAt})`
		})
		.from(userWatches)
		.where(and(eq(userWatches.userId, userId), eq(userWatches.mediaType, 'tv')))
		.groupBy(userWatches.tmdbId)
		.orderBy(desc(sql`max(${userWatches.watchedAt})`))
		.limit(RECENTLY_WATCHED_LIMIT);

	const recentShowIds = recentWatches.map((r) => r.tmdbId);
	const recentShowRows = recentShowIds.length
		? await db.select().from(shows).where(inArray(shows.tmdbId, recentShowIds))
		: [];
	const recentShowById = new Map(recentShowRows.map((s) => [s.tmdbId, s]));

	const recentlyWatched: TrackedItem[] = recentWatches
		.map((r): TrackedItem | null => {
			const show = recentShowById.get(r.tmdbId);
			return show
				? { mediaType: 'tv', tmdbId: r.tmdbId, title: show.title, posterPath: show.posterPath }
				: null;
		})
		.filter(isTrackedItem);

	const watching = tracking
		.filter((t) => t.status === 'watching')
		.map(toItem)
		.filter(isTrackedItem);
	// Stable sort keeps shows with a new episode first while preserving the existing
	// most-recently-tracked ordering within each group.
	watching.sort((a, b) => Number(b.hasNewEpisode) - Number(a.hasNewEpisode));

	return {
		recentlyWatched,
		watching,
		planToWatch: tracking
			.filter((t) => t.status === 'plan_to_watch')
			.map(toItem)
			.filter(isTrackedItem)
	};
};
