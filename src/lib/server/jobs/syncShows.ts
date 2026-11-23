import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { shows, userTracking } from '$lib/server/db/schema';
import { forEachConcurrent } from '$lib/server/concurrency';
import { syncShow, syncShowCompletion } from '$lib/server/media';
import { refreshCalendarCache } from './refreshCalendar';

export const SYNC_CONCURRENCY = 4;
export const CONTINUING_DUE_MS = 60 * 60 * 1000;
export const ENDED_DUE_MS = 24 * 60 * 60 * 1000;
// An hourly run starts a few seconds before the previous sync's age reaches a full hour
// (a show synced at 10:00:03 is 59m57s old at 11:00:00), so due thresholds are loosened.
export const DUE_SLACK_MS = 5 * 60 * 1000;

// Both directions need periodic re-checking: a 'watching' show can flip to Ended on TMDB
// long after the user caught up, and a 'completed' show can get renewed.
const COMPLETION_CHECK_STATUSES = ['watching', 'completed'] as const;

/** TMDB ids of every followed show (at least one non-dropped tv tracking row) that is
 * never synced or whose last sync is older than its due threshold. */
export async function getDueShowIds(now: Date = new Date()): Promise<number[]> {
	const rows = await db
		.selectDistinct({
			tmdbId: userTracking.tmdbId,
			status: shows.status,
			syncedAt: shows.syncedAt
		})
		.from(userTracking)
		.leftJoin(shows, eq(shows.tmdbId, userTracking.tmdbId))
		.where(and(eq(userTracking.mediaType, 'tv'), ne(userTracking.status, 'dropped')));

	const due = new Set<number>();
	for (const { tmdbId, status, syncedAt } of rows) {
		if (!syncedAt) {
			due.add(tmdbId);
			continue;
		}
		const threshold =
			status === 'Ended' || status === 'Canceled' ? ENDED_DUE_MS : CONTINUING_DUE_MS;
		if (syncedAt.getTime() < now.getTime() - (threshold - DUE_SLACK_MS)) due.add(tmdbId);
	}
	return [...due];
}

export async function syncShows(
	tmdbIds: number[]
): Promise<{ synced: number[]; failed: number[] }> {
	const synced: number[] = [];
	const failed: number[] = [];

	await forEachConcurrent(tmdbIds, SYNC_CONCURRENCY, async (id) => {
		try {
			await syncShow(id);
			synced.push(id);
		} catch (error) {
			failed.push(id);
			console.error(`[syncShows] failed to sync show ${id}`, error);
		}
	});

	if (synced.length > 0) {
		const tracking = await db
			.select({ userId: userTracking.userId, tmdbId: userTracking.tmdbId })
			.from(userTracking)
			.where(
				and(
					eq(userTracking.mediaType, 'tv'),
					inArray(userTracking.tmdbId, synced),
					inArray(userTracking.status, COMPLETION_CHECK_STATUSES)
				)
			);
		for (const { userId, tmdbId } of tracking) {
			try {
				await syncShowCompletion(userId, tmdbId);
			} catch (error) {
				console.error(
					`[syncShows] failed to sync completion for show ${tmdbId} (user ${userId})`,
					error
				);
			}
		}
	}

	await refreshCalendarCache();
	return { synced, failed };
}

let inFlight: Promise<{ synced: number[]; failed: number[] }> | null = null;

/** Syncs every due show. Returns null without doing anything while a previous run is
 * still in flight, so the startup run, the hourly cron and slow runs never overlap. */
export async function syncDueShows(
	now?: Date
): Promise<{ synced: number[]; failed: number[] } | null> {
	if (inFlight) return null;
	inFlight = (async () => syncShows(await getDueShowIds(now)))();
	try {
		return await inFlight;
	} finally {
		inFlight = null;
	}
}
