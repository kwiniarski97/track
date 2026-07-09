import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { shows, userTracking, userWatches, users } from '$lib/server/db/schema';
import { load, type CompletedItem } from './+page.server';

const WATCHING_ID = 999004;
const COMPLETED_ID = 999005;
const DROPPED_ID = 999006;
const PLAN_ID = 999007;

describe('profile page load', () => {
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
				{ tmdbId: WATCHING_ID, title: 'Watching Show' },
				{ tmdbId: COMPLETED_ID, title: 'Completed Show' },
				{ tmdbId: DROPPED_ID, title: 'Dropped Show' },
				{ tmdbId: PLAN_ID, title: 'Plan Show' }
			])
			.onConflictDoNothing();

		await db.insert(userTracking).values([
			{ userId, mediaType: 'tv', tmdbId: WATCHING_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: COMPLETED_ID, status: 'completed' },
			{ userId, mediaType: 'tv', tmdbId: DROPPED_ID, status: 'dropped' },
			{ userId, mediaType: 'tv', tmdbId: PLAN_ID, status: 'plan_to_watch' }
		]);

		// A 'watching' show with no logged watch lands in notStartedShows, not
		// watchingShows -- log one episode so the show counts as started.
		await db
			.insert(userWatches)
			.values({ userId, mediaType: 'tv', tmdbId: WATCHING_ID, seasonNumber: 1, episodeNumber: 1 });
	});

	afterEach(async () => {
		await db.delete(userWatches).where(eq(userWatches.userId, userId));
		await db.delete(userTracking).where(eq(userTracking.userId, userId));
		await db.delete(users).where(eq(users.id, userId));
	});

	it('splits shows into watching/completed/dropped sections and excludes plan_to_watch', async () => {
		const result = (await load({
			locals: { user: { id: userId } },
			url: new URL('http://localhost/profile')
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as {
			watchingShows: CompletedItem[];
			completedShows: CompletedItem[];
			droppedShows: CompletedItem[];
			notStartedShows: CompletedItem[];
			stats: { showsCompleted: number };
		};

		expect(result.watchingShows.map((s) => s.tmdbId)).toEqual([WATCHING_ID]);
		expect(result.completedShows.map((s) => s.tmdbId)).toEqual([COMPLETED_ID]);
		expect(result.droppedShows.map((s) => s.tmdbId)).toEqual([DROPPED_ID]);
		expect(result.notStartedShows).toEqual([]);
		expect(result.stats.showsCompleted).toBe(1);
	});
});

describe('profile page load sorting', () => {
	let userId: string;
	const ZEBRA_ID = 999104;
	const ALPHA_ID = 999105;

	beforeEach(async () => {
		const [user] = await db
			.insert(users)
			.values({
				pocketIdSub: crypto.randomUUID(),
				email: 'sort-test@example.com',
				name: 'Sort Test'
			})
			.returning();
		userId = user.id;

		// Inserted in reverse-alphabetical, reverse-added order so title/added sorts disagree.
		await db
			.insert(shows)
			.values([
				{ tmdbId: ZEBRA_ID, title: 'Zebra Show', firstAirDate: '2020-01-01' },
				{ tmdbId: ALPHA_ID, title: 'Alpha Show', firstAirDate: '2023-01-01' }
			])
			.onConflictDoNothing();

		await db.insert(userTracking).values([
			{
				userId,
				mediaType: 'tv',
				tmdbId: ZEBRA_ID,
				status: 'watching',
				createdAt: new Date('2024-01-01T00:00:00Z')
			},
			{
				userId,
				mediaType: 'tv',
				tmdbId: ALPHA_ID,
				status: 'watching',
				createdAt: new Date('2024-06-01T00:00:00Z')
			}
		]);

		// Both shows need a logged watch to count as started, otherwise they land in
		// notStartedShows and the watchingShows sort assertions see an empty list.
		await db.insert(userWatches).values([
			{ userId, mediaType: 'tv', tmdbId: ZEBRA_ID, seasonNumber: 1, episodeNumber: 1 },
			{ userId, mediaType: 'tv', tmdbId: ALPHA_ID, seasonNumber: 1, episodeNumber: 1 }
		]);
	});

	afterEach(async () => {
		await db.delete(userWatches).where(eq(userWatches.userId, userId));
		await db.delete(userTracking).where(eq(userTracking.userId, userId));
		await db.delete(users).where(eq(users.id, userId));
	});

	it('sorts alphabetically by title', async () => {
		const result = (await load({
			locals: { user: { id: userId } },
			url: new URL('http://localhost/profile?sort=title')
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as { watchingShows: CompletedItem[] };

		expect(result.watchingShows.map((s) => s.title)).toEqual(['Alpha Show', 'Zebra Show']);
	});

	it('sorts by last released (newest first)', async () => {
		const result = (await load({
			locals: { user: { id: userId } },
			url: new URL('http://localhost/profile?sort=released')
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as { watchingShows: CompletedItem[] };

		expect(result.watchingShows.map((s) => s.title)).toEqual(['Alpha Show', 'Zebra Show']);
	});

	it('defaults to newest added first', async () => {
		const result = (await load({
			locals: { user: { id: userId } },
			url: new URL('http://localhost/profile')
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as { watchingShows: CompletedItem[] };

		expect(result.watchingShows.map((s) => s.title)).toEqual(['Alpha Show', 'Zebra Show']);
	});

	it('sorts by oldest added first when sort=added_asc', async () => {
		const result = (await load({
			locals: { user: { id: userId } },
			url: new URL('http://localhost/profile?sort=added_asc')
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as { watchingShows: CompletedItem[] };

		expect(result.watchingShows.map((s) => s.title)).toEqual(['Zebra Show', 'Alpha Show']);
	});
});
