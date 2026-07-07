import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { shows, userTracking, users } from '$lib/server/db/schema';
import { actions } from './+page.server';

const TMDB_ID = 999003;

describe('show page actions', () => {
	let userId: string;

	beforeEach(async () => {
		const [user] = await db
			.insert(users)
			.values({ pocketIdSub: crypto.randomUUID(), email: 'test@example.com', name: 'Test User' })
			.returning();
		userId = user.id;

		await db.insert(shows).values({ tmdbId: TMDB_ID, title: 'Test Show' }).onConflictDoNothing();
		await db
			.insert(userTracking)
			.values({ userId, mediaType: 'tv', tmdbId: TMDB_ID, status: 'watching' });
	});

	afterEach(async () => {
		await db.delete(userTracking).where(eq(userTracking.userId, userId));
		await db.delete(users).where(eq(users.id, userId));
	});

	async function statusOf() {
		const [tracking] = await db.select().from(userTracking).where(eq(userTracking.userId, userId));
		return tracking?.status;
	}

	it('drop sets the status to dropped without deleting the tracking row', async () => {
		await actions.drop({
			locals: { user: { id: userId } },
			params: { tmdbId: String(TMDB_ID) }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		expect(await statusOf()).toBe('dropped');
	});

	it('untrack deletes the tracking row entirely', async () => {
		await actions.untrack({
			locals: { user: { id: userId } },
			params: { tmdbId: String(TMDB_ID) }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		expect(await statusOf()).toBeUndefined();
	});
});
