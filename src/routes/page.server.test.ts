import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { episodes, shows, userTracking, userWatches, users } from '$lib/server/db/schema';
import { load, type TrackedItem } from './+page.server';

const WATCH_NEXT_ID = 999201;
const UP_TO_DATE_NO_EPISODES_ID = 999202;
const RECENT_EPISODE_WATCHED_ID = 999203;
const STALE_UNWATCHED_ID = 999204;
const RECENTLY_WATCHED_ID = 999205;
const MID_RANGE_UNWATCHED_ID = 999206;
const NOT_STARTED_ID = 999207;

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
				{ tmdbId: MID_RANGE_UNWATCHED_ID, title: 'Mid Range Unwatched Episode' },
				{ tmdbId: NOT_STARTED_ID, title: 'Not Started Yet' }
			])
			.onConflictDoNothing();

		await db.insert(userTracking).values([
			{ userId, mediaType: 'tv', tmdbId: WATCH_NEXT_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: UP_TO_DATE_NO_EPISODES_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: RECENT_EPISODE_WATCHED_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: STALE_UNWATCHED_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: MID_RANGE_UNWATCHED_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: NOT_STARTED_ID, status: 'watching' }
		]);

		// Each of these (besides RECENT_EPISODE_WATCHED_ID) gets an old, already-watched
		// episode 1 so the show counts as "started" -- the unwatched episode 2 is what
		// actually decides its category.
		await db.insert(episodes).values([
			{
				showTmdbId: WATCH_NEXT_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				title: 'E1',
				airDate: daysAgo(400)
			},
			{
				showTmdbId: WATCH_NEXT_ID,
				seasonNumber: 1,
				episodeNumber: 2,
				title: 'E2',
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
				airDate: daysAgo(400)
			},
			{
				showTmdbId: STALE_UNWATCHED_ID,
				seasonNumber: 1,
				episodeNumber: 2,
				title: 'E2',
				airDate: daysAgo(200)
			},
			{
				showTmdbId: MID_RANGE_UNWATCHED_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				title: 'E1',
				airDate: daysAgo(400)
			},
			{
				showTmdbId: MID_RANGE_UNWATCHED_ID,
				seasonNumber: 1,
				episodeNumber: 2,
				title: 'E2',
				airDate: daysAgo(90)
			},
			{
				showTmdbId: NOT_STARTED_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				title: 'E1',
				airDate: daysAgo(10)
			}
		]);

		await db.insert(userWatches).values([
			{
				userId,
				mediaType: 'tv',
				tmdbId: WATCH_NEXT_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				watchedAt: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000)
			},
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
				tmdbId: STALE_UNWATCHED_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				watchedAt: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000)
			},
			{
				userId,
				mediaType: 'tv',
				tmdbId: MID_RANGE_UNWATCHED_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				watchedAt: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000)
			},
			// No cached episode data for this show, but it's still "started" (e.g. a
			// Jellyfin-synced watch logged before the show page was ever opened).
			{
				userId,
				mediaType: 'tv',
				tmdbId: UP_TO_DATE_NO_EPISODES_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				watchedAt: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000)
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
		await db.delete(episodes).where(eq(episodes.showTmdbId, NOT_STARTED_ID));
		await db.delete(userWatches).where(eq(userWatches.userId, userId));
		await db.delete(userTracking).where(eq(userTracking.userId, userId));
		await db.delete(users).where(eq(users.id, userId));
	});

	it('categorises started shows and orders them by urgency, then recency', async () => {
		const result = (await load({
			locals: { user: { id: userId } }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as {
			continueWatching: TrackedItem[];
			toWatch: TrackedItem[];
			newEpisodeCount: number;
		};

		expect(result.continueWatching.map((i) => [i.tmdbId, i.category])).toEqual([
			[WATCH_NEXT_ID, 'watch_next'],
			[MID_RANGE_UNWATCHED_ID, 'watching'],
			[STALE_UNWATCHED_ID, 'not_watched_for_a_while'],
			// The three up-to-date shows tie on category, so most-recently-watched wins:
			// now, an hour ago, then 300 days ago.
			[RECENTLY_WATCHED_ID, 'up_to_date'],
			[RECENT_EPISODE_WATCHED_ID, 'up_to_date'],
			[UP_TO_DATE_NO_EPISODES_ID, 'up_to_date']
		]);

		// Tracked as watching but never started, so it belongs with the queue, not the
		// continue-watching list.
		expect(result.toWatch.map((i) => i.tmdbId)).toEqual([NOT_STARTED_ID]);
		expect(result.newEpisodeCount).toBe(1);
	});

	it('keeps a show with no tracking row out of the list once its last watch ages out', async () => {
		// RECENTLY_WATCHED_ID is only ever surfaced because it was watched just now; it
		// has no tracking row to keep it around on its own.
		await db
			.update(userWatches)
			.set({ watchedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000) })
			.where(and(eq(userWatches.userId, userId), eq(userWatches.tmdbId, RECENTLY_WATCHED_ID)));

		const result = (await load({
			locals: { user: { id: userId } }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as { continueWatching: TrackedItem[] };

		expect(result.continueWatching.map((i) => i.tmdbId)).not.toContain(RECENTLY_WATCHED_ID);
	});
});

describe('home page load recently watched cutoff', () => {
	let userId: string;
	const WITHIN_CUTOFF_ID = 999301;
	const PAST_CUTOFF_ID = 999302;

	beforeEach(async () => {
		const [user] = await db
			.insert(users)
			.values({
				pocketIdSub: crypto.randomUUID(),
				email: 'cutoff-test@example.com',
				name: 'Cutoff Test'
			})
			.returning();
		userId = user.id;

		await db
			.insert(shows)
			.values([
				{ tmdbId: WITHIN_CUTOFF_ID, title: 'Watched 89 Days Ago' },
				{ tmdbId: PAST_CUTOFF_ID, title: 'Watched 91 Days Ago' }
			])
			.onConflictDoNothing();

		await db.insert(userWatches).values([
			{
				userId,
				mediaType: 'tv',
				tmdbId: WITHIN_CUTOFF_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				watchedAt: new Date(Date.now() - 89 * 24 * 60 * 60 * 1000)
			},
			{
				userId,
				mediaType: 'tv',
				tmdbId: PAST_CUTOFF_ID,
				seasonNumber: 1,
				episodeNumber: 1,
				watchedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000)
			}
		]);
	});

	afterEach(async () => {
		await db.delete(userWatches).where(eq(userWatches.userId, userId));
		await db.delete(users).where(eq(users.id, userId));
	});

	it('drops untracked shows last watched more than 90 days ago', async () => {
		const result = (await load({
			locals: { user: { id: userId } }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as { continueWatching: TrackedItem[] };

		expect(result.continueWatching.map((r) => r.tmdbId)).toEqual([WITHIN_CUTOFF_ID]);
	});
});
