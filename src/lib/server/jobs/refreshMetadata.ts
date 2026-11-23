import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { userTracking } from '$lib/server/db/schema';
import { forEachConcurrent } from '$lib/server/concurrency';
import { refreshMovie } from '$lib/server/media';

// Each refresh is dominated by its TMDB round-trip; see forEachConcurrent.
const TMDB_REFRESH_CONCURRENCY = 4;

const ACTIVE_STATUSES = ['watching', 'plan_to_watch'] as const;

async function getActivelyTrackedMovieIds(userId?: string): Promise<number[]> {
	const conditions = [
		eq(userTracking.mediaType, 'movie'),
		inArray(userTracking.status, ACTIVE_STATUSES)
	];
	if (userId) conditions.push(eq(userTracking.userId, userId));

	const rows = await db
		.selectDistinct({ tmdbId: userTracking.tmdbId })
		.from(userTracking)
		.where(and(...conditions));
	return rows.map((r) => r.tmdbId);
}

/** Refreshes cached TMDB metadata for every actively tracked movie -- everyone's if
 * `userId` is omitted (the scheduled job), or just one user's. Shows are synced by
 * syncDueShows instead. Failures for one title don't stop the rest. */
export async function refreshTrackedMetadata(userId?: string): Promise<void> {
	const movieIds = await getActivelyTrackedMovieIds(userId);

	await forEachConcurrent(movieIds, TMDB_REFRESH_CONCURRENCY, async (tmdbId) => {
		try {
			await refreshMovie(tmdbId);
		} catch (error) {
			console.error(`[refreshMetadata] failed to refresh movie ${tmdbId}`, error);
		}
	});
}
