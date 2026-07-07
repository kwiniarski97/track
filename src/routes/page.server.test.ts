import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { episodes, shows, userTracking, userWatches, users } from '$lib/server/db/schema';
import { load, type TrackedItem } from './+page.server';

const NEW_EPISODE_ID = 999201;
const NO_NEW_EPISODE_ID = 999202;
const WATCHED_RECENT_ID = 999203;
const STALE_UNWATCHED_ID = 999204;
const RECENTLY_WATCHED_ID = 999205;

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
				{ tmdbId: NEW_EPISODE_ID, title: 'Has New Episode' },
				{ tmdbId: NO_NEW_EPISODE_ID, title: 'No New Episode' },
				{ tmdbId: WATCHED_RECENT_ID, title: 'Recent Episode Already Watched' },
				{ tmdbId: STALE_UNWATCHED_ID, title: 'Old Unwatched Episode' },
				{ tmdbId: RECENTLY_WATCHED_ID, title: 'Recently Watched Only' }
			])
			.onConflictDoNothing();

		await db.insert(userTracking).values([
			{ userId, mediaType: 'tv', tmdbId: NEW_EPISODE_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: NO_NEW_EPISODE_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: WATCHED_RECENT_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: STALE_UNWATCHED_ID, status: 'watching' }
		]);

		await db.insert(episodes).values([
			{
				showTmdbId: NEW_EPISODE_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				title: 'E1',
				airDate: daysAgo(2)
			},
			{
				showTmdbId: WATCHED_RECENT_ID,
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
				airDate: daysAgo(45)
			}
		]);

		await db.insert(userWatches).values([
			{
				userId,
				mediaType: 'tv',
				tmdbId: WATCHED_RECENT_ID,
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
		await db.delete(episodes).where(eq(episodes.showTmdbId, NEW_EPISODE_ID));
		await db.delete(episodes).where(eq(episodes.showTmdbId, WATCHED_RECENT_ID));
		await db.delete(episodes).where(eq(episodes.showTmdbId, STALE_UNWATCHED_ID));
		await db.delete(userWatches).where(eq(userWatches.userId, userId));
		await db.delete(userTracking).where(eq(userTracking.userId, userId));
		await db.delete(users).where(eq(users.id, userId));
	});

	it('badges and sorts-to-front shows with a recent unwatched episode, and lists recently watched', async () => {
		const result = (await load({
			locals: { user: { id: userId } }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as { watching: TrackedItem[]; recentlyWatched: TrackedItem[] };

		expect(result.watching[0].tmdbId).toBe(NEW_EPISODE_ID);
		expect(result.watching[0].hasNewEpisode).toBe(true);

		const byId = new Map(result.watching.map((w) => [w.tmdbId, w]));
		expect(byId.get(NO_NEW_EPISODE_ID)?.hasNewEpisode).toBe(false);
		expect(byId.get(WATCHED_RECENT_ID)?.hasNewEpisode).toBe(false);
		expect(byId.get(STALE_UNWATCHED_ID)?.hasNewEpisode).toBe(false);

		expect(result.recentlyWatched.map((r) => r.tmdbId)).toEqual([
			RECENTLY_WATCHED_ID,
			WATCHED_RECENT_ID
		]);
	});
});
