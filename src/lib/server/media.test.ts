import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { seasons, shows, userTracking, userWatches, users, type TrackingStatus } from './db/schema';
import { syncShowCompletion } from './media';

const TMDB_ID = 999001;

async function insertWatches(userId: string, episodes: Array<[number, number]>) {
	if (episodes.length === 0) return;
	await db.insert(userWatches).values(
		episodes.map(([seasonNumber, episodeNumber]) => ({
			userId,
			mediaType: 'tv' as const,
			tmdbId: TMDB_ID,
			seasonNumber,
			episodeNumber
		}))
	);
}

async function setStatus(userId: string, status: TrackingStatus) {
	await db.update(userTracking).set({ status }).where(eq(userTracking.userId, userId));
}

async function statusOf(userId: string): Promise<TrackingStatus> {
	const [tracking] = await db.select().from(userTracking).where(eq(userTracking.userId, userId));
	return tracking.status;
}

// Show has 5 episodes total across two seasons: 3 in season 1, 2 in season 2.
const ALL_EPISODES: Array<[number, number]> = [
	[1, 1],
	[1, 2],
	[1, 3],
	[2, 1],
	[2, 2]
];

describe('syncShowCompletion', () => {
	let userId: string;

	beforeEach(async () => {
		const [user] = await db
			.insert(users)
			.values({ pocketIdSub: crypto.randomUUID(), email: 'test@example.com', name: 'Test User' })
			.returning();
		userId = user.id;

		await db.insert(shows).values({ tmdbId: TMDB_ID, title: 'Test Show' }).onConflictDoNothing();
		await db
			.insert(seasons)
			.values([
				{ showTmdbId: TMDB_ID, seasonNumber: 1, name: 'Season 1', episodeCount: 3 },
				{ showTmdbId: TMDB_ID, seasonNumber: 2, name: 'Season 2', episodeCount: 2 }
			])
			.onConflictDoNothing();

		await db
			.insert(userTracking)
			.values({ userId, mediaType: 'tv', tmdbId: TMDB_ID, status: 'watching' });
	});

	afterEach(async () => {
		await db.delete(userWatches).where(eq(userWatches.userId, userId));
		await db.delete(userTracking).where(eq(userTracking.userId, userId));
		await db.delete(users).where(eq(users.id, userId));
	});

	it('stays "watching" when some episodes are unwatched', async () => {
		await insertWatches(userId, [
			[1, 1],
			[1, 2]
		]);

		await syncShowCompletion(userId, TMDB_ID);

		expect(await statusOf(userId)).toBe('watching');
	});

	it('flips to "completed" once every cached episode is watched', async () => {
		await insertWatches(userId, ALL_EPISODES);

		await syncShowCompletion(userId, TMDB_ID);

		expect(await statusOf(userId)).toBe('completed');
	});

	it('reverts a completed show to "watching" when an episode is unwatched', async () => {
		await setStatus(userId, 'completed');
		await insertWatches(userId, [[1, 1]]); // only 1 of 5 watched

		await syncShowCompletion(userId, TMDB_ID);

		expect(await statusOf(userId)).toBe('watching');
	});

	it('leaves plan_to_watch untouched even if every episode is already logged', async () => {
		await setStatus(userId, 'plan_to_watch');
		await insertWatches(userId, ALL_EPISODES);

		await syncShowCompletion(userId, TMDB_ID);

		expect(await statusOf(userId)).toBe('plan_to_watch');
	});

	it('leaves dropped untouched even if every episode is already logged', async () => {
		await setStatus(userId, 'dropped');
		await insertWatches(userId, ALL_EPISODES);

		await syncShowCompletion(userId, TMDB_ID);

		expect(await statusOf(userId)).toBe('dropped');
	});

	it('is a no-op when the show is not tracked at all', async () => {
		await db.delete(userTracking).where(eq(userTracking.userId, userId));

		await expect(syncShowCompletion(userId, TMDB_ID)).resolves.not.toThrow();
	});
});
