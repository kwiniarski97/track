import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { shows, userTracking, users } from '$lib/server/db/schema';
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
	});

	afterEach(async () => {
		await db.delete(userTracking).where(eq(userTracking.userId, userId));
		await db.delete(users).where(eq(users.id, userId));
	});

	it('splits shows into watching/completed/dropped sections and excludes plan_to_watch', async () => {
		const result = (await load({
			locals: { user: { id: userId } }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as {
			watchingShows: CompletedItem[];
			completedShows: CompletedItem[];
			droppedShows: CompletedItem[];
			stats: { showsCompleted: number };
		};

		expect(result.watchingShows.map((s) => s.tmdbId)).toEqual([WATCHING_ID]);
		expect(result.completedShows.map((s) => s.tmdbId)).toEqual([COMPLETED_ID]);
		expect(result.droppedShows.map((s) => s.tmdbId)).toEqual([DROPPED_ID]);
		expect(result.stats.showsCompleted).toBe(1);
	});
});
