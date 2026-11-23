import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { episodes, seasons, shows, userTracking, users } from '$lib/server/db/schema';
import { getShowWithSeasons } from '$lib/server/tmdb';
import type { TmdbSeasonDetails, TmdbShowDetails } from '$lib/server/tmdb';
import { actions, load } from './+page.server';

// The load tests need to prove whether TMDB was hit, so the network layer is mocked
// out; the action tests below never reach these mocks.
vi.mock('$lib/server/tmdb', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/tmdb')>()),
	getShowWithSeasons: vi.fn()
}));
// extractPosterColor downloads the poster image on the refresh path -- stub it out.
vi.mock('$lib/server/poster-color', () => ({
	extractPosterColor: vi.fn(async () => null)
}));

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

	const TRACK_DETAILS: TmdbShowDetails = {
		id: TMDB_ID,
		name: 'Test Show',
		original_language: 'en',
		overview: 'overview',
		poster_path: null,
		backdrop_path: null,
		first_air_date: '2020-01-01',
		status: 'Returning Series',
		next_episode_to_air: null,
		seasons: [],
		vote_average: 7,
		vote_count: 10
	};

	it('track starts a background sync of the show', async () => {
		vi.mocked(getShowWithSeasons).mockReset();
		vi.mocked(getShowWithSeasons).mockResolvedValue({ details: TRACK_DETAILS, seasons: new Map() });
		await db.update(shows).set({ syncedAt: null }).where(eq(shows.tmdbId, TMDB_ID));
		await db.delete(userTracking).where(eq(userTracking.userId, userId));
		await actions.track({
			locals: { user: { id: userId } },
			params: { tmdbId: String(TMDB_ID) }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);
		expect(await statusOf()).toBe('watching');
		await vi.waitFor(async () => {
			const [row] = await db.select().from(shows).where(eq(shows.tmdbId, TMDB_ID));
			expect(row.syncedAt).not.toBeNull();
		});
	});

	it('track succeeds even when the background sync fails', async () => {
		vi.mocked(getShowWithSeasons).mockReset();
		vi.mocked(getShowWithSeasons).mockRejectedValue(new Error('TMDB down'));
		await db.delete(userTracking).where(eq(userTracking.userId, userId));
		await actions.track({
			locals: { user: { id: userId } },
			params: { tmdbId: String(TMDB_ID) }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);
		expect(await statusOf()).toBe('watching');
		await vi.waitFor(() => expect(getShowWithSeasons).toHaveBeenCalled());
		// let the swallowed failure settle; an unhandled rejection would fail the run
		await new Promise((r) => setTimeout(r, 50));
	});

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

describe('show page load', () => {
	// Distinct from the actions describe's TMDB_ID so its half-seeded show row can't
	// bleed into cache-hit/miss expectations here.
	const LOAD_ID = 999031;
	let userId: string;

	const SHOW_DETAILS: TmdbShowDetails = {
		id: LOAD_ID,
		name: 'Fresh Show',
		original_language: 'en',
		overview: 'Fresh overview',
		poster_path: '/fresh-poster.jpg',
		backdrop_path: '/fresh-backdrop.jpg',
		first_air_date: '2020-01-01',
		status: 'Returning Series',
		next_episode_to_air: null,
		seasons: [
			{ season_number: 1, name: 'Season 1', episode_count: 2, air_date: '2020-01-01' },
			{ season_number: 2, name: 'Season 2', episode_count: 2, air_date: '2021-01-01' }
		],
		vote_average: 8.2,
		vote_count: 240
	};

	const SEASON_FIXTURES: Record<number, TmdbSeasonDetails> = {
		1: {
			episodes: [1, 2].map((n) => ({
				episode_number: n,
				name: `S1E${n}`,
				overview: `S1E${n} fresh overview`,
				air_date: '2020-01-01',
				runtime: 45,
				still_path: null,
				vote_average: 7.0,
				vote_count: 50
			}))
		},
		2: {
			episodes: [1, 2].map((n) => ({
				episode_number: n,
				name: `S2E${n}`,
				overview: `S2E${n} fresh overview`,
				air_date: '2021-01-01',
				runtime: 45,
				still_path: null,
				vote_average: 7.5,
				vote_count: 40
			}))
		}
	};

	/** Fully-populated show + season + episode cache, as a previous page view under the
	 * current code would have written it. */
	async function seedFreshCache(updatedAt: Date, syncedAt: Date | null = updatedAt) {
		await db.insert(shows).values({
			tmdbId: LOAD_ID,
			title: 'Cached Show',
			posterPath: '/cached-poster.jpg',
			posterColor: '#aabbcc',
			backdropPath: '/cached-backdrop.jpg',
			voteAverage: 7.5,
			voteCount: 100,
			overview: 'Cached overview',
			status: 'Ended',
			updatedAt,
			syncedAt
		});
		await db.insert(seasons).values([
			{ showTmdbId: LOAD_ID, seasonNumber: 0, name: 'Specials', episodeCount: 1 },
			{ showTmdbId: LOAD_ID, seasonNumber: 1, name: 'Season 1', episodeCount: 2 },
			{ showTmdbId: LOAD_ID, seasonNumber: 2, name: 'Season 2', episodeCount: 2 }
		]);
		const episodeRows = [
			[0, 1],
			[1, 1],
			[1, 2],
			[2, 1],
			[2, 2]
		].map(([seasonNumber, episodeNumber]) => ({
			showTmdbId: LOAD_ID,
			seasonNumber,
			episodeNumber,
			title: `S${seasonNumber}E${episodeNumber}`,
			overview: `S${seasonNumber}E${episodeNumber} cached overview`,
			airDate: '2020-01-01',
			runtime: 45,
			stillPath: null,
			voteAverage: 7.0,
			voteCount: 50
		}));
		await db.insert(episodes).values(episodeRows);
	}

	// `PageServerLoad`'s inferred return type includes `void`, which the assertions
	// below can't index into -- our load always returns data, so narrow it away.
	type LoadData = Exclude<Awaited<ReturnType<typeof load>>, void>;

	async function runLoad(search = ''): Promise<LoadData> {
		return (await load({
			params: { tmdbId: String(LOAD_ID) },
			url: new URL(`http://localhost/show/${LOAD_ID}${search}`),
			locals: { user: { id: userId } }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any)) as LoadData;
	}

	beforeEach(async () => {
		vi.mocked(getShowWithSeasons).mockReset();
		vi.mocked(getShowWithSeasons).mockResolvedValue({
			details: SHOW_DETAILS,
			seasons: new Map(Object.entries(SEASON_FIXTURES).map(([n, d]) => [Number(n), d]))
		});

		const [user] = await db
			.insert(users)
			.values({ pocketIdSub: crypto.randomUUID(), email: 'test@example.com', name: 'Test User' })
			.returning();
		userId = user.id;
	});

	afterEach(async () => {
		await db.delete(userTracking).where(eq(userTracking.userId, userId));
		await db.delete(episodes).where(eq(episodes.showTmdbId, LOAD_ID));
		await db.delete(seasons).where(eq(seasons.showTmdbId, LOAD_ID));
		await db.delete(shows).where(eq(shows.tmdbId, LOAD_ID));
		await db.delete(users).where(eq(users.id, userId));
	});

	const HOUR = 60 * 60 * 1000;
	const ago = (ms: number) => new Date(Date.now() - ms);

	async function track(status: 'watching' | 'dropped' | 'plan_to_watch' | 'completed') {
		await db.insert(userTracking).values({ userId, mediaType: 'tv', tmdbId: LOAD_ID, status });
	}

	it('serves a freshly synced show entirely from the db, without any TMDB call', async () => {
		await seedFreshCache(new Date());

		const data = await runLoad();

		expect(getShowWithSeasons).not.toHaveBeenCalled();

		expect(data.show.name).toBe('Cached Show');
		expect(data.show.backdrop_path).toBe('/cached-backdrop.jpg');
		expect(data.show.vote_count).toBe(100);
		// Newest season first, specials last -- same ordering the live-fetch path had.
		expect(data.seasons.map((s: { season_number: number }) => s.season_number)).toEqual([2, 1, 0]);
		// Defaults to the newest non-special season.
		expect(data.selectedSeason).toBe(2);
		expect(data.posterColor).toBe('#aabbcc');
		expect(data.episodesBySeason[1]).toHaveLength(2);
	});

	it('still honors the ?season= query param on the cached path', async () => {
		await seedFreshCache(new Date());

		const data = await runLoad('?season=1');

		expect(getShowWithSeasons).not.toHaveBeenCalled();
		expect(data.selectedSeason).toBe(1);
	});

	it('serves cached episode overviews without hitting TMDB', async () => {
		await seedFreshCache(new Date());

		const data = await runLoad();

		expect(getShowWithSeasons).not.toHaveBeenCalled();
		expect(data.episodesBySeason[1][0].overview).toBe('S1E1 cached overview');
	});

	it('serves a followed show synced 3 days ago from the db without any TMDB call', async () => {
		await seedFreshCache(ago(72 * HOUR));
		await track('watching');

		const data = await runLoad();

		expect(getShowWithSeasons).not.toHaveBeenCalled();
		expect(data.show.name).toBe('Cached Show');
	});

	it('serves an unfollowed show synced 2h ago from the db', async () => {
		await seedFreshCache(ago(2 * HOUR));

		const data = await runLoad();

		expect(getShowWithSeasons).not.toHaveBeenCalled();
		expect(data.show.name).toBe('Cached Show');
	});

	it('re-syncs an unfollowed show whose sync is older than 24h', async () => {
		await seedFreshCache(ago(25 * HOUR));

		const data = await runLoad();

		expect(getShowWithSeasons).toHaveBeenCalledTimes(1);
		expect(data.show.name).toBe('Fresh Show');
	});

	it('treats a show tracked only as dropped as unfollowed', async () => {
		await seedFreshCache(ago(25 * HOUR));
		await track('dropped');

		const data = await runLoad();

		expect(getShowWithSeasons).toHaveBeenCalledTimes(1);
		expect(data.show.name).toBe('Fresh Show');
	});

	it('falls back to cached data when re-syncing a stale unfollowed show fails', async () => {
		await seedFreshCache(ago(25 * HOUR));
		vi.mocked(getShowWithSeasons).mockRejectedValue(new Error('TMDB down'));

		const data = await runLoad();

		expect(getShowWithSeasons).toHaveBeenCalledTimes(1);
		expect(data.show.name).toBe('Cached Show');
	});

	it('syncs a never-synced show exactly once and renders the fresh data', async () => {
		const data = await runLoad();

		expect(getShowWithSeasons).toHaveBeenCalledTimes(1);
		expect(data.show.name).toBe('Fresh Show');
		expect(data.episodesBySeason[1].map((e: { title: string }) => e.title)).toEqual([
			'S1E1',
			'S1E2'
		]);
		expect(data.episodesBySeason[2].map((e: { title: string }) => e.title)).toEqual([
			'S2E1',
			'S2E2'
		]);
		const cached = await db.select().from(episodes).where(eq(episodes.showTmdbId, LOAD_ID));
		expect(cached).toHaveLength(4);
	});

	it('renders a never-synced show with no seasons and does not re-sync it on the next load', async () => {
		vi.mocked(getShowWithSeasons).mockResolvedValue({
			details: { ...SHOW_DETAILS, seasons: [] },
			seasons: new Map()
		});

		const first = await runLoad();
		expect(first.show.name).toBe('Fresh Show');
		expect(first.show.seasons).toEqual([]);
		expect(getShowWithSeasons).toHaveBeenCalledTimes(1);

		const second = await runLoad();
		expect(second.show.seasons).toEqual([]);
		expect(getShowWithSeasons).toHaveBeenCalledTimes(1);
	});

	it('serves the cached row when the first sync of an imported show fails', async () => {
		await seedFreshCache(new Date(), null);
		vi.mocked(getShowWithSeasons).mockRejectedValue(new Error('TMDB down'));

		const data = await runLoad();

		expect(getShowWithSeasons).toHaveBeenCalledTimes(1);
		expect(data.show.name).toBe('Cached Show');
	});

	it('errors when a never-cached show cannot be synced', async () => {
		vi.mocked(getShowWithSeasons).mockRejectedValue(new Error('TMDB down'));

		await expect(runLoad()).rejects.toThrow('TMDB down');
	});

	it('reconstructs next_episode_to_air from the cached columns', async () => {
		await seedFreshCache(new Date());
		await db
			.update(shows)
			.set({
				firstAirDate: '2008-01-20',
				nextEpisodeAirDate: '2030-03-04',
				nextEpisodeSeasonNumber: 2,
				nextEpisodeNumber: 7,
				nextEpisodeName: 'The Return'
			})
			.where(eq(shows.tmdbId, LOAD_ID));

		const data = await runLoad();

		expect(getShowWithSeasons).not.toHaveBeenCalled();
		expect(data.show.first_air_date).toBe('2008-01-20');
		expect(data.show.next_episode_to_air).toEqual({
			air_date: '2030-03-04',
			episode_number: 7,
			season_number: 2,
			name: 'The Return'
		});
	});
});
