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

// Both directions need periodic re-checking: a 'watching' show can flip to Ended on
// TMDB long after the user already caught up, and a 'completed' show can get renewed
// (status flips back off Ended/Canceled) long after it was marked done -- either way,
// with no watch event left to trigger syncShowCompletion, it would otherwise stay wrong
// forever.
const COMPLETION_CHECK_STATUSES = ['watching', 'completed'] as const;

/** Every (user, show) pair currently marked 'watching' or 'completed' -- the set
 * syncShowCompletion needs to re-check on each run. */
async function getCompletionCheckTracking(
	userId?: string
): Promise<{ userId: string; tmdbId: number }[]> {
	const conditions = [
		eq(userTracking.mediaType, 'tv'),
		inArray(userTracking.status, COMPLETION_CHECK_STATUSES)
	];
	if (userId) conditions.push(eq(userTracking.userId, userId));

	return db
		.select({ userId: userTracking.userId, tmdbId: userTracking.tmdbId })
		.from(userTracking)
		.where(and(...conditions));
}

/** Refreshes cached TMDB metadata (including next-episode-air-date) for every actively
 * tracked show/movie, plus every completed show (so a renewal shows up), then re-syncs
 * completion for the watching/completed set -- everyone's if `userId` is omitted (the
 * scheduled job), or just one user's (an on-demand refresh, e.g. before rendering their
 * calendar). Failures for one title don't stop the rest -- TMDB being briefly
 * unreachable for one id shouldn't blank out the whole calendar. */
export async function refreshTrackedMetadata(userId?: string): Promise<void> {
	const [activeShowIds, movieIds, completionCheckTracking] = await Promise.all([
		getActivelyTrackedTmdbIds('tv', userId),
		getActivelyTrackedTmdbIds('movie', userId),
		getCompletionCheckTracking(userId)
	]);

	const showIds = new Set(activeShowIds);
	for (const { tmdbId } of completionCheckTracking) showIds.add(tmdbId);

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

	for (const { userId: trackingUserId, tmdbId } of completionCheckTracking) {
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
