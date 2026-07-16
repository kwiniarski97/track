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

export type WatchingCategory = 'watch_next' | 'watching' | 'not_watched_for_a_while' | 'up_to_date';

export interface TrackedItem {
	mediaType: 'tv' | 'movie';
	tmdbId: number;
	title: string;
	posterPath: string | null;
	progress?: ShowProgress | null;
	// Why this item sits where it does in Continue watching. Rendered as a badge//subtitle
	// rather than its own section: as sections these four split one row of posters across
	// four headings and repeated whatever Recently watched already showed.
	category?: WatchingCategory;
}

// Most urgent first. Ties broken by most-recently-watched, so the list reads as "what to
// put on tonight" from the top down.
const CATEGORY_ORDER: Record<WatchingCategory, number> = {
	watch_next: 0,
	watching: 1,
	not_watched_for_a_while: 2,
	up_to_date: 3
};

const SECTION_STATUSES: TrackingStatus[] = ['watching', 'plan_to_watch'];
// A show the user watched but isn't tracking as 'watching' (dropped, completed, or only
// ever synced from Jellyfin) still surfaces in Continue watching if it was watched this
// recently -- past that it drops off rather than lingering indefinitely.
const RECENTLY_WATCHED_MAX_AGE_DAYS = 90;
// How recently an unwatched episode must have aired for a show to land in Watch Next
// rather than Watching -- the show is otherwise fully caught up, just waiting on the
// latest episode(s).
const NEW_EPISODE_WINDOW_DAYS = 30;
// How old the oldest unwatched episode must be before a show is considered stale
// (Not watched for a while) instead of just currently behind (Watching).
const STALE_UNWATCHED_DAYS = 180;

function daysAgoIso(n: number): string {
	return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Seconds-since-epoch to match how the `timestamp` column mode stores `watchedAt`, since
// the aggregate below is a raw `sql` expression and isn't run back through Drizzle's
// Date mapping.
function daysAgoEpochSeconds(n: number): number {
	return Math.floor((Date.now() - n * 24 * 60 * 60 * 1000) / 1000);
}

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;

	const tracking = await db
		.select()
		.from(userTracking)
		.where(and(eq(userTracking.userId, userId), inArray(userTracking.status, SECTION_STATUSES)))
		.orderBy(desc(userTracking.createdAt));

	const trackedShowIds = tracking.filter((t) => t.mediaType === 'tv').map((t) => t.tmdbId);
	const movieIds = tracking.filter((t) => t.mediaType === 'movie').map((t) => t.tmdbId);

	// Last watch per series, with no age cutoff -- doubles as the Continue watching sort
	// key and as the recency test for shows that aren't tracked as 'watching'.
	const lastWatchedRows = await db
		.select({
			tmdbId: userWatches.tmdbId,
			lastWatchedAt: sql<number>`max(${userWatches.watchedAt})`
		})
		.from(userWatches)
		.where(and(eq(userWatches.userId, userId), eq(userWatches.mediaType, 'tv')))
		.groupBy(userWatches.tmdbId);
	const lastWatchedByShowId = new Map(lastWatchedRows.map((r) => [r.tmdbId, r.lastWatchedAt]));

	// Series the user has watched recently but isn't tracking as 'watching'.
	const recentCutoff = daysAgoEpochSeconds(RECENTLY_WATCHED_MAX_AGE_DAYS);
	const recentUntrackedShowIds = lastWatchedRows
		.filter((r) => r.lastWatchedAt >= recentCutoff && !trackedShowIds.includes(r.tmdbId))
		.map((r) => r.tmdbId);

	const showIds = [...new Set([...trackedShowIds, ...recentUntrackedShowIds])];

	const showRows = showIds.length
		? await db.select().from(shows).where(inArray(shows.tmdbId, showIds))
		: [];
	const movieRows = movieIds.length
		? await db.select().from(movies).where(inArray(movies.tmdbId, movieIds))
		: [];

	const showById = new Map(showRows.map((s) => [s.tmdbId, s]));
	const movieById = new Map(movieRows.map((mv) => [mv.tmdbId, mv]));

	// Bucket each show by progress against what's aired so far. Relies on the `episodes`
	// cache, which is only populated once someone has opened the show page -- a show
	// that's never been visited has no cached episodes, so it falls back to "up to date"
	// rather than blocking on data we don't have.
	const watchingShowIds = [
		...new Set([
			...tracking
				.filter((t) => t.mediaType === 'tv' && t.status === 'watching')
				.map((t) => t.tmdbId),
			...recentUntrackedShowIds
		])
	];

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

	// The progress bar's "completed" state needs each show's real tracking status, which
	// for recently-watched shows may fall outside SECTION_STATUSES (e.g. dropped) or be
	// missing entirely (watches logged with no tracking row, e.g. via Jellyfin).
	const progressShowIds = showIds;
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

	function showItem(tmdbId: number, category: WatchingCategory): TrackedItem | null {
		const show = showById.get(tmdbId);
		return show
			? {
					mediaType: 'tv',
					tmdbId,
					title: show.title,
					posterPath: show.posterPath,
					progress: progressByShowId.get(tmdbId) ?? null,
					category
				}
			: null;
	}

	// Everything the user has actually started, in one list: series tracked as 'watching'
	// plus any series they watched recently without tracking. Movies have no episodes to
	// reason about, so they carry the general 'watching' category.
	const continueWatching: TrackedItem[] = [
		...watchingShowIds
			.filter((tmdbId) => startedShowIds.has(tmdbId))
			.map((tmdbId) => showItem(tmdbId, categoryByShowId.get(tmdbId) ?? 'watching'))
			.filter(isTrackedItem),
		...tracking
			.filter((t) => t.mediaType === 'movie' && t.status === 'watching')
			.map(toItem)
			.filter(isTrackedItem)
			.map((item) => ({ ...item, category: 'watching' as const }))
	].sort((a, b) => {
		const byCategory = CATEGORY_ORDER[a.category!] - CATEGORY_ORDER[b.category!];
		if (byCategory !== 0) return byCategory;
		return (lastWatchedByShowId.get(b.tmdbId) ?? 0) - (lastWatchedByShowId.get(a.tmdbId) ?? 0);
	});

	// Tracked but never started, alongside the explicit plan-to-watch list -- to the user
	// these are the same thing: something queued up that they haven't begun.
	const toWatch: TrackedItem[] = [
		...tracking
			.filter(
				(t) => t.status === 'watching' && t.mediaType === 'tv' && !startedShowIds.has(t.tmdbId)
			)
			.map(toItem)
			.filter(isTrackedItem),
		...tracking
			.filter((t) => t.status === 'plan_to_watch')
			.map(toItem)
			.filter(isTrackedItem)
	];

	return {
		continueWatching,
		toWatch,
		// Drives the header line: the one thing worth saying above the fold.
		newEpisodeCount: continueWatching.filter((i) => i.category === 'watch_next').length
	};
};
