import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userTracking } from '$lib/server/db/schema';
import { cacheShowSeasons, refreshMovie, refreshShow, syncShowCompletion } from '$lib/server/media';

const ACTIVE_STATUSES = ['watching', 'plan_to_watch'] as const;

async function getActivelyTrackedTmdbIds(
	mediaType: 'tv' | 'movie',
	userId?: string
): Promise<number[]> {
	const conditions = [
		eq(userTracking.mediaType, mediaType),
		inArray(userTracking.status, ACTIVE_STATUSES)
	];
	if (userId) conditions.push(eq(userTracking.userId, userId));

	const rows = await db
		.selectDistinct({ tmdbId: userTracking.tmdbId })
		.from(userTracking)
		.where(and(...conditions));
	return rows.map((r) => r.tmdbId);
}

/** Every (user, show) pair currently marked 'watching' -- the set syncShowCompletion
 * needs to check, since a show can flip to Ended on TMDB long after the user already
 * caught up, with no watch event left to trigger the check. */
async function getWatchingShowTracking(
	userId?: string
): Promise<{ userId: string; tmdbId: number }[]> {
	const conditions = [eq(userTracking.mediaType, 'tv'), eq(userTracking.status, 'watching')];
	if (userId) conditions.push(eq(userTracking.userId, userId));

	return db
		.select({ userId: userTracking.userId, tmdbId: userTracking.tmdbId })
		.from(userTracking)
		.where(and(...conditions));
}

/** Refreshes cached TMDB metadata (including next-episode-air-date) for every actively
 * tracked show/movie -- everyone's if `userId` is omitted (the scheduled job), or just
 * one user's (an on-demand refresh, e.g. before rendering their calendar). Failures for
 * one title don't stop the rest -- TMDB being briefly unreachable for one id shouldn't
 * blank out the whole calendar. Also re-syncs completion for every 'watching' show after
 * refreshing: a show can end on TMDB well after a user already watched every episode, and
 * without this pass that show would stay 'watching' forever since nothing else would ever
 * re-check it. */
export async function refreshTrackedMetadata(userId?: string): Promise<void> {
	const [showIds, movieIds, watchingShows] = await Promise.all([
		getActivelyTrackedTmdbIds('tv', userId),
		getActivelyTrackedTmdbIds('movie', userId),
		getWatchingShowTracking(userId)
	]);

	for (const tmdbId of showIds) {
		try {
			const details = await refreshShow(tmdbId);
			await cacheShowSeasons(tmdbId, details);
		} catch (error) {
			console.error(`[refreshMetadata] failed to refresh show ${tmdbId}`, error);
		}
	}

	for (const tmdbId of movieIds) {
		try {
			await refreshMovie(tmdbId);
		} catch (error) {
			console.error(`[refreshMetadata] failed to refresh movie ${tmdbId}`, error);
		}
	}

	for (const { userId: trackingUserId, tmdbId } of watchingShows) {
		try {
			await syncShowCompletion(trackingUserId, tmdbId);
		} catch (error) {
			console.error(
				`[refreshMetadata] failed to sync completion for show ${tmdbId} (user ${trackingUserId})`,
				error
			);
		}
	}
}
