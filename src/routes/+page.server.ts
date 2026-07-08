import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm';
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

export interface TrackedItem {
	mediaType: 'tv' | 'movie';
	tmdbId: number;
	title: string;
	posterPath: string | null;
	progress?: ShowProgress | null;
}

const SECTION_STATUSES: TrackingStatus[] = ['watching', 'plan_to_watch'];
const RECENTLY_WATCHED_LIMIT = 6;
// How recently an unwatched episode must have aired for a show to land in Watch Next
// rather than Watching -- the show is otherwise fully caught up, just waiting on the
// latest episode(s).
const NEW_EPISODE_WINDOW_DAYS = 30;
// How old the oldest unwatched episode must be before a show is considered stale
// (Not watched for a while) instead of just currently behind (Watching).
const STALE_UNWATCHED_DAYS = 180;

type WatchingCategory = 'watch_next' | 'watching' | 'not_watched_for_a_while' | 'up_to_date';

function daysAgoIso(n: number): string {
	return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

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

	// Bucket each 'watching' show by progress against what's aired so far. Relies on the
	// `episodes` cache, which is only populated once someone has opened the show page --
	// a show that's never been visited has no cached episodes, so it falls back to
	// "up to date" rather than blocking on data we don't have.
	const watchingShowIds = tracking
		.filter((t) => t.mediaType === 'tv' && t.status === 'watching')
		.map((t) => t.tmdbId);

	const categoryByShowId = new Map<number, WatchingCategory>();
	// Shows with at least one logged watch (any season/episode, including specials) --
	// everything else tracked as 'watching' hasn't actually been started yet.
	const startedShowIds = new Set<number>();
	if (watchingShowIds.length) {
		const today = daysAgoIso(0);
		const newEpisodeWindowStart = daysAgoIso(NEW_EPISODE_WINDOW_DAYS);
		const staleThreshold = daysAgoIso(STALE_UNWATCHED_DAYS);

		const airedEpisodeRows = await db
			.select({
				showTmdbId: episodes.showTmdbId,
				seasonNumber: episodes.seasonNumber,
				episodeNumber: episodes.episodeNumber,
				airDate: episodes.airDate
			})
			.from(episodes)
			.where(
				and(
					inArray(episodes.showTmdbId, watchingShowIds),
					sql`${episodes.seasonNumber} != 0`,
					sql`${episodes.airDate} is not null`,
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
		for (const w of watchesForWatchingShows) startedShowIds.add(w.tmdbId);

		const airedByShowId = new Map<number, typeof airedEpisodeRows>();
		for (const ep of airedEpisodeRows) {
			const list = airedByShowId.get(ep.showTmdbId);
			if (list) list.push(ep);
			else airedByShowId.set(ep.showTmdbId, [ep]);
		}

		for (const tmdbId of watchingShowIds) {
			const airedEpisodes = airedByShowId.get(tmdbId) ?? [];
			const unwatched = airedEpisodes.filter(
				(ep) => !watchedSet.has(watchedKey(tmdbId, ep.seasonNumber, ep.episodeNumber))
			);

			if (unwatched.length === 0) {
				categoryByShowId.set(tmdbId, 'up_to_date');
				continue;
			}

			const oldestUnwatchedAirDate = unwatched.reduce(
				(min, ep) => (ep.airDate! < min ? ep.airDate! : min),
				unwatched[0].airDate!
			);

			if (oldestUnwatchedAirDate >= newEpisodeWindowStart) {
				categoryByShowId.set(tmdbId, 'watch_next');
			} else if (oldestUnwatchedAirDate < staleThreshold) {
				categoryByShowId.set(tmdbId, 'not_watched_for_a_while');
			} else {
				categoryByShowId.set(tmdbId, 'watching');
			}
		}
	}

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

	// The progress bar's "completed" state needs each show's real tracking status, which
	// for recently-watched shows may fall outside SECTION_STATUSES (e.g. dropped) or be
	// missing entirely (watches logged with no tracking row, e.g. via Jellyfin).
	const progressShowIds = [...new Set([...showIds, ...recentShowIds])];
	const progressTrackingRows = progressShowIds.length
		? await db
				.select({ tmdbId: userTracking.tmdbId, status: userTracking.status })
				.from(userTracking)
				.where(
					and(
						eq(userTracking.userId, userId),
						eq(userTracking.mediaType, 'tv'),
						inArray(userTracking.tmdbId, progressShowIds)
					)
				)
		: [];
	const progressTrackingStatusById = new Map(progressTrackingRows.map((r) => [r.tmdbId, r.status]));
	const progressByShowId = await getShowProgress(
		userId,
		progressShowIds.map((tmdbId) => ({
			tmdbId,
			trackingStatus: progressTrackingStatusById.get(tmdbId) ?? 'watching'
		}))
	);

	function toItem(t: (typeof tracking)[number]): TrackedItem | null {
		if (t.mediaType === 'tv') {
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
		}
		const movie = movieById.get(t.tmdbId);
		return movie
			? { mediaType: 'movie', tmdbId: t.tmdbId, title: movie.title, posterPath: movie.posterPath }
			: null;
	}

	const isTrackedItem = (item: TrackedItem | null): item is TrackedItem => item !== null;

	const recentlyWatched: TrackedItem[] = recentWatches
		.map((r): TrackedItem | null => {
			const show = recentShowById.get(r.tmdbId);
			return show
				? {
						mediaType: 'tv',
						tmdbId: r.tmdbId,
						title: show.title,
						posterPath: show.posterPath,
						progress: progressByShowId.get(r.tmdbId) ?? null
					}
				: null;
		})
		.filter(isTrackedItem);

	// Movies don't have episodes to reason about, so they always land in the general
	// Watching bucket alongside shows whose progress doesn't fit a more specific one.
	const notStarted: TrackedItem[] = [];
	const watchNext: TrackedItem[] = [];
	const watching: TrackedItem[] = [];
	const notWatchedForAWhile: TrackedItem[] = [];
	const upToDate: TrackedItem[] = [];

	for (const t of tracking.filter((t) => t.status === 'watching')) {
		const item = toItem(t);
		if (!item) continue;
		if (t.mediaType === 'tv' && !startedShowIds.has(t.tmdbId)) {
			notStarted.push(item);
			continue;
		}
		const category: WatchingCategory =
			t.mediaType === 'tv' ? (categoryByShowId.get(t.tmdbId) ?? 'watching') : 'watching';
		switch (category) {
			case 'watch_next':
				watchNext.push(item);
				break;
			case 'not_watched_for_a_while':
				notWatchedForAWhile.push(item);
				break;
			case 'up_to_date':
				upToDate.push(item);
				break;
			default:
				watching.push(item);
		}
	}

	return {
		recentlyWatched,
		watchNext,
		watching,
		notWatchedForAWhile,
		upToDate,
		notStarted,
		planToWatch: tracking
			.filter((t) => t.status === 'plan_to_watch')
			.map(toItem)
			.filter(isTrackedItem)
	};
};
