import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { episodes, seasons, shows, userTracking, users } from '$lib/server/db/schema';
import { getSeasonDetails, getShowDetails } from '$lib/server/tmdb';
import type { TmdbSeasonDetails, TmdbShowDetails } from '$lib/server/tmdb';
import { MEDIA_CACHE_TTL_MS } from '$lib/server/media';
import { actions, load } from './+page.server';

/** A timestamp just past the TTL, so the row counts as stale. */
function staleDate(): Date {
	return new Date(Date.now() - MEDIA_CACHE_TTL_MS - 60 * 1000);
}

// The load tests need to prove whether TMDB was hit, so the network layer is mocked
// out; the action tests below never reach these mocks.
vi.mock('$lib/server/tmdb', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/tmdb')>()),
	getShowDetails: vi.fn(),
	getSeasonDetails: vi.fn()
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
	async function seedFreshCache(updatedAt: Date) {
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
			updatedAt
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
		vi.mocked(getShowDetails).mockReset();
		vi.mocked(getShowDetails).mockResolvedValue(SHOW_DETAILS);
		vi.mocked(getSeasonDetails).mockReset();
		vi.mocked(getSeasonDetails).mockImplementation(
			async (_tmdbId, seasonNumber) => SEASON_FIXTURES[seasonNumber]
		);

		const [user] = await db
			.insert(users)
			.values({ pocketIdSub: crypto.randomUUID(), email: 'test@example.com', name: 'Test User' })
			.returning();
		userId = user.id;
	});

	afterEach(async () => {
		await db.delete(episodes).where(eq(episodes.showTmdbId, LOAD_ID));
		await db.delete(seasons).where(eq(seasons.showTmdbId, LOAD_ID));
		await db.delete(shows).where(eq(shows.tmdbId, LOAD_ID));
		await db.delete(users).where(eq(users.id, userId));
	});

	it('serves a TTL-fresh show entirely from the db, without any TMDB call', async () => {
		await seedFreshCache(new Date());

		const data = await runLoad();

		expect(getShowDetails).not.toHaveBeenCalled();
		expect(getSeasonDetails).not.toHaveBeenCalled();

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

		expect(getShowDetails).not.toHaveBeenCalled();
		expect(data.selectedSeason).toBe(1);
	});

	it('refetches show details once the cached row is older than the TTL', async () => {
		await seedFreshCache(staleDate());

		const data = await runLoad();

		expect(getShowDetails).toHaveBeenCalledTimes(1);
		// Episode cache is still complete, so no per-season fetches are needed.
		expect(getSeasonDetails).not.toHaveBeenCalled();
		expect(data.show.name).toBe('Fresh Show');
	});

	it('fetches show details and every season for a never-cached show', async () => {
		const data = await runLoad();

		expect(getShowDetails).toHaveBeenCalledTimes(1);
		expect(getSeasonDetails).toHaveBeenCalledTimes(2);

		// The batched multi-row insert must have cached every episode of both seasons.
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
});
