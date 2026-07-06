import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { seasons, shows, userTracking, userWatches, users } from '$lib/server/db/schema';
import { POST } from './+server';

const TMDB_ID = 999002;

function watchRequest(body: unknown) {
	return new Request('http://localhost/api/watch', {
		method: 'POST',
		body: JSON.stringify(body)
	});
}

describe('POST /api/watch', () => {
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
			.values({ showTmdbId: TMDB_ID, seasonNumber: 1, name: 'Season 1', episodeCount: 2 })
			.onConflictDoNothing();

		await db
			.insert(userTracking)
			.values({ userId, mediaType: 'tv', tmdbId: TMDB_ID, status: 'watching' });
		// One of the two episodes is already watched going into each test.
		await db.insert(userWatches).values({
			userId,
			mediaType: 'tv',
			tmdbId: TMDB_ID,
			seasonNumber: 1,
			episodeNumber: 1
		});
	});

	afterEach(async () => {
		await db.delete(userWatches).where(eq(userWatches.userId, userId));
		await db.delete(userTracking).where(eq(userTracking.userId, userId));
		await db.delete(users).where(eq(users.id, userId));
	});

	async function statusOf() {
		const [tracking] = await db.select().from(userTracking).where(eq(userTracking.userId, userId));
		return tracking.status;
	}

	it('flips the show to completed when the last episode is marked watched', async () => {
		const response = await POST({
			request: watchRequest({
				mediaType: 'tv',
				tmdbId: TMDB_ID,
				seasonNumber: 1,
				episodeNumber: 2,
				watched: true
			}),
			locals: { user: { id: userId } }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		expect(response.status).toBe(200);
		expect(await statusOf()).toBe('completed');
	});

	it('reverts a completed show to watching when an episode is unmarked', async () => {
		await db
			.update(userTracking)
			.set({ status: 'completed' })
			.where(eq(userTracking.userId, userId));
		await db.insert(userWatches).values({
			userId,
			mediaType: 'tv',
			tmdbId: TMDB_ID,
			seasonNumber: 1,
			episodeNumber: 2
		});

		const response = await POST({
			request: watchRequest({
				mediaType: 'tv',
				tmdbId: TMDB_ID,
				seasonNumber: 1,
				episodeNumber: 2,
				watched: false
			}),
			locals: { user: { id: userId } }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		expect(response.status).toBe(200);
		expect(await statusOf()).toBe('watching');
	});

	it('rejects unauthenticated requests', async () => {
		const response = await POST({
			request: watchRequest({ mediaType: 'tv', tmdbId: TMDB_ID, watched: true }),
			locals: { user: null }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		expect(response.status).toBe(401);
	});
});
