import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	calendarEntries,
	episodes,
	seasons,
	shows,
	userTracking,
	userWatches,
	users,
	type TrackingStatus
} from '$lib/server/db/schema';
import { getShowWithSeasons } from '$lib/server/tmdb';
import type { TmdbShowDetails } from '$lib/server/tmdb';
import { getDueShowIds, syncDueShows, syncShows } from './syncShows';

vi.mock('$lib/server/tmdb', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/tmdb')>()),
	getShowWithSeasons: vi.fn()
}));
vi.mock('$lib/server/poster-color', () => ({
	extractPosterColor: vi.fn(async () => null)
}));

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const IDS = Array.from({ length: 12 }, (_, i) => 999051 + i);

function details(id: number, extra: Partial<TmdbShowDetails> = {}): TmdbShowDetails {
	return {
		id,
		name: `Show ${id}`,
		original_language: 'en',
		overview: 'ov',
		poster_path: null,
		backdrop_path: null,
		first_air_date: '2020-01-01',
		status: 'Returning Series',
		next_episode_to_air: null,
		seasons: [{ season_number: 1, name: 'S1', episode_count: 1, air_date: '2020-01-01' }],
		vote_average: 8,
		vote_count: 10,
		...extra
	};
}
const ep = {
	episode_number: 1,
	name: 'E1',
	overview: 'o',
	air_date: '2020-02-02',
	runtime: 40,
	still_path: null,
	vote_average: 7,
	vote_count: 3
};
function mockOk(id: number, extra: Partial<TmdbShowDetails> = {}) {
	return { details: details(id, extra), seasons: new Map([[1, { episodes: [ep] }]]) };
}

describe('syncShows job', () => {
	let userId: string;
	let otherUserId: string;

	async function track(user: string, tmdbId: number, status: TrackingStatus = 'watching') {
		await db.insert(userTracking).values({ userId: user, mediaType: 'tv', tmdbId, status });
	}
	async function seedShow(tmdbId: number, status: string | null, syncedAgoMs: number | null) {
		await db.insert(shows).values({
			tmdbId,
			title: `Show ${tmdbId}`,
			status,
			syncedAt: syncedAgoMs === null ? null : new Date(Date.now() - syncedAgoMs)
		});
	}

	beforeEach(async () => {
		vi.mocked(getShowWithSeasons).mockReset();
		const [u] = await db
			.insert(users)
			.values({ pocketIdSub: crypto.randomUUID(), email: 'a@example.com', name: 'A' })
			.returning();
		const [o] = await db
			.insert(users)
			.values({ pocketIdSub: crypto.randomUUID(), email: 'b@example.com', name: 'B' })
			.returning();
		userId = u.id;
		otherUserId = o.id;
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		await db.delete(calendarEntries).where(inArray(calendarEntries.tmdbId, IDS));
		await db.delete(userWatches).where(inArray(userWatches.tmdbId, IDS));
		await db.delete(userTracking).where(inArray(userTracking.tmdbId, IDS));
		await db.delete(episodes).where(inArray(episodes.showTmdbId, IDS));
		await db.delete(seasons).where(inArray(seasons.showTmdbId, IDS));
		await db.delete(shows).where(inArray(shows.tmdbId, IDS));
		await db.delete(users).where(inArray(users.id, [userId, otherUserId]));
	});

	describe('getDueShowIds', () => {
		it('includes followed shows never synced, and shows tracked with no shows row', async () => {
			await seedShow(999051, null, null);
			await track(userId, 999051);
			await track(userId, 999052);
			const due = await getDueShowIds();
			expect(due).toContain(999051);
			expect(due).toContain(999052);
		});

		it('includes a continuing show synced 61 min ago and excludes one synced 30 min ago', async () => {
			await seedShow(999051, 'Returning Series', 61 * MIN);
			await seedShow(999052, 'Returning Series', 30 * MIN);
			await track(userId, 999051);
			await track(userId, 999052);
			const due = await getDueShowIds();
			expect(due).toContain(999051);
			expect(due).not.toContain(999052);
		});

		it('includes a continuing show synced 58 min ago (hour-boundary slack)', async () => {
			await seedShow(999051, 'Returning Series', 58 * MIN);
			await track(userId, 999051);
			expect(await getDueShowIds()).toContain(999051);
		});

		it('excludes an Ended show synced 3h ago and includes it at 25h; same for Canceled', async () => {
			await seedShow(999051, 'Ended', 3 * HOUR);
			await seedShow(999052, 'Ended', 25 * HOUR);
			await seedShow(999053, 'Canceled', 3 * HOUR);
			await seedShow(999054, 'Canceled', 25 * HOUR);
			for (const id of [999051, 999052, 999053, 999054]) await track(userId, id);
			const due = await getDueShowIds();
			expect(due).not.toContain(999051);
			expect(due).toContain(999052);
			expect(due).not.toContain(999053);
			expect(due).toContain(999054);
		});

		it('excludes shows whose only tracking rows are dropped', async () => {
			await seedShow(999051, null, null);
			await track(userId, 999051, 'dropped');
			expect(await getDueShowIds()).not.toContain(999051);
		});

		it('includes a show dropped by one user but watched by another', async () => {
			await seedShow(999051, null, null);
			await track(userId, 999051, 'dropped');
			await track(otherUserId, 999051, 'watching');
			expect(await getDueShowIds()).toContain(999051);
		});

		it('lists a show followed by two users once', async () => {
			await seedShow(999051, null, null);
			await track(userId, 999051);
			await track(otherUserId, 999051, 'plan_to_watch');
			expect((await getDueShowIds()).filter((id) => id === 999051)).toHaveLength(1);
		});
	});

	describe('syncShows', () => {
		it('keeps going after one show fails and reports both lists', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {});
			vi.mocked(getShowWithSeasons).mockImplementation(async (id: number) => {
				if (id === 999051) throw new Error('boom');
				return mockOk(id);
			});
			const result = await syncShows([999051, 999052]);
			expect(result).toEqual({ synced: [999052], failed: [999051] });
			const [row] = await db.select().from(shows).where(eq(shows.tmdbId, 999052));
			expect(row.syncedAt).not.toBeNull();
			expect(console.error).toHaveBeenCalledWith(
				'[syncShows] failed to sync show 999051',
				expect.any(Error)
			);
		});

		it('flips a fully watched show to completed once the sync learns it Ended', async () => {
			await track(userId, 999051, 'watching');
			await db.insert(userWatches).values({
				userId,
				mediaType: 'tv',
				tmdbId: 999051,
				seasonNumber: 1,
				episodeNumber: 1
			});
			vi.mocked(getShowWithSeasons).mockResolvedValue(mockOk(999051, { status: 'Ended' }));
			await syncShows([999051]);
			const [t] = await db
				.select()
				.from(userTracking)
				.where(and(eq(userTracking.userId, userId), eq(userTracking.tmdbId, 999051)));
			expect(t.status).toBe('completed');
		});

		it('writes the next episode into the calendar', async () => {
			await track(userId, 999051, 'watching');
			vi.mocked(getShowWithSeasons).mockResolvedValue(
				mockOk(999051, {
					next_episode_to_air: {
						air_date: '2999-01-01',
						season_number: 1,
						episode_number: 2,
						name: 'Next'
					}
				} as Partial<TmdbShowDetails>)
			);
			await syncShows([999051]);
			const rows = await db
				.select()
				.from(calendarEntries)
				.where(and(eq(calendarEntries.userId, userId), eq(calendarEntries.tmdbId, 999051)));
			expect(rows).toHaveLength(1);
			expect(rows[0].date).toBe('2999-01-01');
		});
	});

	describe('syncDueShows', () => {
		it('returns null for a second call while the first is running', async () => {
			await track(userId, 999051);
			let release!: () => void;
			const gate = new Promise<void>((r) => (release = r));
			vi.mocked(getShowWithSeasons).mockImplementation(async (id: number) => {
				await gate;
				return mockOk(id);
			});
			const first = syncDueShows();
			await vi.waitFor(() => expect(getShowWithSeasons).toHaveBeenCalled());
			expect(await syncDueShows()).toBeNull();
			release();
			const result = await first;
			expect(result!.synced).toContain(999051);
			const calls = vi.mocked(getShowWithSeasons).mock.calls.filter(([id]) => id === 999051);
			expect(calls).toHaveLength(1);
			// the guard is released afterwards
			expect(await syncDueShows()).not.toBeNull();
		});
	});
});
