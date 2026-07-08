import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { episodes, shows, userTracking, userWatches, users } from '$lib/server/db/schema';
import { load, type TrackedItem } from './+page.server';

const WATCH_NEXT_ID = 999201;
const UP_TO_DATE_NO_EPISODES_ID = 999202;
const RECENT_EPISODE_WATCHED_ID = 999203;
const STALE_UNWATCHED_ID = 999204;
const RECENTLY_WATCHED_ID = 999205;
const MID_RANGE_UNWATCHED_ID = 999206;

function daysAgo(n: number): string {
	return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe('home page load', () => {
	let userId: string;

	beforeEach(async () => {
		const [user] = await db
			.insert(users)
			.values({ pocketIdSub: crypto.randomUUID(), email: 'test@example.com', name: 'Test User' })
			.returning();
		userId = user.id;

		await db
			.insert(shows)
			.values([
				{ tmdbId: WATCH_NEXT_ID, title: 'Has New Episode' },
				{ tmdbId: UP_TO_DATE_NO_EPISODES_ID, title: 'No New Episode' },
				{ tmdbId: RECENT_EPISODE_WATCHED_ID, title: 'Recent Episode Already Watched' },
				{ tmdbId: STALE_UNWATCHED_ID, title: 'Old Unwatched Episode' },
				{ tmdbId: RECENTLY_WATCHED_ID, title: 'Recently Watched Only' },
				{ tmdbId: MID_RANGE_UNWATCHED_ID, title: 'Mid Range Unwatched Episode' }
			])
			.onConflictDoNothing();

		await db.insert(userTracking).values([
			{ userId, mediaType: 'tv', tmdbId: WATCH_NEXT_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: UP_TO_DATE_NO_EPISODES_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: RECENT_EPISODE_WATCHED_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: STALE_UNWATCHED_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: MID_RANGE_UNWATCHED_ID, status: 'watching' }
		]);

		await db.insert(episodes).values([
			{
				showTmdbId: WATCH_NEXT_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				title: 'E1',
				airDate: daysAgo(2)
			},
			{
				showTmdbId: RECENT_EPISODE_WATCHED_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				title: 'E1',
				airDate: daysAgo(2)
			},
			{
				showTmdbId: STALE_UNWATCHED_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				title: 'E1',
				airDate: daysAgo(200)
			},
			{
				showTmdbId: MID_RANGE_UNWATCHED_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				title: 'E1',
				airDate: daysAgo(90)
			}
		]);

		await db.insert(userWatches).values([
			{
				userId,
				mediaType: 'tv',
				tmdbId: RECENT_EPISODE_WATCHED_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				watchedAt: new Date(Date.now() - 60 * 60 * 1000)
			},
			{
				userId,
				mediaType: 'tv',
				tmdbId: RECENTLY_WATCHED_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				watchedAt: new Date()
			}
		]);
	});

	afterEach(async () => {
		await db.delete(episodes).where(eq(episodes.showTmdbId, WATCH_NEXT_ID));
		await db.delete(episodes).where(eq(episodes.showTmdbId, RECENT_EPISODE_WATCHED_ID));
		await db.delete(episodes).where(eq(episodes.showTmdbId, STALE_UNWATCHED_ID));
		await db.delete(episodes).where(eq(episodes.showTmdbId, MID_RANGE_UNWATCHED_ID));
		await db.delete(userWatches).where(eq(userWatches.userId, userId));
		await db.delete(userTracking).where(eq(userTracking.userId, userId));
		await db.delete(users).where(eq(users.id, userId));
	});

	it('buckets watching shows into categories and lists recently watched', async () => {
		const result = (await load({
			locals: { user: { id: userId } }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as {
			watchNext: TrackedItem[];
			watching: TrackedItem[];
			notWatchedForAWhile: TrackedItem[];
			upToDate: TrackedItem[];
			recentlyWatched: TrackedItem[];
		};

		expect(result.watchNext.map((w) => w.tmdbId)).toEqual([WATCH_NEXT_ID]);
		expect(result.upToDate.map((w) => w.tmdbId).sort()).toEqual(
			[UP_TO_DATE_NO_EPISODES_ID, RECENT_EPISODE_WATCHED_ID].sort()
		);
		expect(result.watching.map((w) => w.tmdbId)).toEqual([MID_RANGE_UNWATCHED_ID]);
		expect(result.notWatchedForAWhile.map((w) => w.tmdbId)).toEqual([STALE_UNWATCHED_ID]);

		expect(result.recentlyWatched.map((r) => r.tmdbId)).toEqual([
			RECENTLY_WATCHED_ID,
			RECENT_EPISODE_WATCHED_ID
		]);
	});
});
