import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userTracking } from '$lib/server/db/schema';
import { refreshMovie, refreshShow } from '$lib/server/media';

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

/** Refreshes cached TMDB metadata (including next-episode-air-date) for every actively
 * tracked show/movie -- everyone's if `userId` is omitted (the scheduled job), or just
 * one user's (an on-demand refresh, e.g. before rendering their calendar). Failures for
 * one title don't stop the rest -- TMDB being briefly unreachable for one id shouldn't
 * blank out the whole calendar. */
export async function refreshTrackedMetadata(userId?: string): Promise<void> {
	const [showIds, movieIds] = await Promise.all([
		getActivelyTrackedTmdbIds('tv', userId),
		getActivelyTrackedTmdbIds('movie', userId)
	]);

	for (const tmdbId of showIds) {
		try {
			await refreshShow(tmdbId);
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
}
