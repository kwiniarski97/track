import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './db';
import {
	episodes,
	movies,
	seasons,
	shows,
	userTracking,
	userWatches,
	users,
	type TrackingStatus
} from './db/schema';
import { getMovieDetails, getShowWithSeasons } from './tmdb';
import type { TmdbMovieDetails, TmdbSeasonDetails, TmdbShowDetails } from './tmdb';
import { extractPosterColor } from './poster-color';
import {
	MEDIA_CACHE_TTL_MS,
	getMovieCachedOrRefresh,
	getShowProgress,
	syncShow,
	syncShowCompletion
} from './media';

// The cached-or-refresh tests need to prove whether a TMDB fetch happened, so the
// network layer is mocked out; everything else in this file is purely db-driven and
// never reaches these mocks.
vi.mock('./tmdb', async (importOriginal) => ({
	...(await importOriginal<typeof import('./tmdb')>()),
	getMovieDetails: vi.fn(),
	getShowWithSeasons: vi.fn()
}));
// extractPosterColor downloads the poster image on the refresh path -- stub it out.
vi.mock('./poster-color', () => ({
	extractPosterColor: vi.fn(async () => null)
}));

function daysAgo(n: number): string {
	return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

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

	it('flips to "completed" when every regular episode is watched but specials are not', async () => {
		await db
			.insert(seasons)
			.values({ showTmdbId: TMDB_ID, seasonNumber: 0, name: 'Specials', episodeCount: 2 })
			.onConflictDoNothing();
		await insertWatches(userId, ALL_EPISODES); // no season-0 watches logged

		await syncShowCompletion(userId, TMDB_ID);

		expect(await statusOf(userId)).toBe('completed');
	});

	it('stays "watching" when every cached episode is watched but the show is still airing', async () => {
		await db.update(shows).set({ status: 'Returning Series' }).where(eq(shows.tmdbId, TMDB_ID));
		await insertWatches(userId, ALL_EPISODES);

		await syncShowCompletion(userId, TMDB_ID);

		expect(await statusOf(userId)).toBe('watching');
	});

	it('flips to "completed" once an ended show has every cached episode watched', async () => {
		await db.update(shows).set({ status: 'Ended' }).where(eq(shows.tmdbId, TMDB_ID));
		await insertWatches(userId, ALL_EPISODES);

		await syncShowCompletion(userId, TMDB_ID);

		expect(await statusOf(userId)).toBe('completed');
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

describe('getShowProgress', () => {
	let userId: string;

	const BEHIND_ID = 999011;
	const UP_TO_DATE_ID = 999012;
	const COMPLETED_ID = 999013;
	const NEVER_OPENED_ID = 999014;

	beforeEach(async () => {
		const [user] = await db
			.insert(users)
			.values({ pocketIdSub: crypto.randomUUID(), email: 'test@example.com', name: 'Test User' })
			.returning();
		userId = user.id;

		await db
			.insert(shows)
			.values([
				{ tmdbId: BEHIND_ID, title: 'Behind Show' },
				{ tmdbId: UP_TO_DATE_ID, title: 'Up To Date Show' },
				{ tmdbId: COMPLETED_ID, title: 'Completed Show' },
				{ tmdbId: NEVER_OPENED_ID, title: 'Never Opened Show' }
			])
			.onConflictDoNothing();

		// 5 regular episodes + 1 special per show; the special must never count toward
		// either watched or total.
		for (const tmdbId of [BEHIND_ID, UP_TO_DATE_ID, COMPLETED_ID]) {
			await db
				.insert(seasons)
				.values([
					{ showTmdbId: tmdbId, seasonNumber: 0, name: 'Specials', episodeCount: 1 },
					{ showTmdbId: tmdbId, seasonNumber: 1, name: 'Season 1', episodeCount: 5 }
				])
				.onConflictDoNothing();

			await db.insert(episodes).values([
				{
					showTmdbId: tmdbId,
					seasonNumber: 0,
					episodeNumber: 1,
					title: 'Special',
					airDate: daysAgo(10)
				},
				{
					showTmdbId: tmdbId,
					seasonNumber: 1,
					episodeNumber: 1,
					title: 'E1',
					airDate: daysAgo(40)
				},
				{
					showTmdbId: tmdbId,
					seasonNumber: 1,
					episodeNumber: 2,
					title: 'E2',
					airDate: daysAgo(30)
				},
				{ showTmdbId: tmdbId, seasonNumber: 1, episodeNumber: 3, title: 'E3', airDate: daysAgo(20) }
				// Episodes 4-5 are unaired -- included in `total` via seasons.episodeCount but
				// not in `episodes`, so they can't count as "watched" or "behind".
			]);
		}

		await db.insert(userTracking).values([
			{ userId, mediaType: 'tv', tmdbId: BEHIND_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: UP_TO_DATE_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: COMPLETED_ID, status: 'completed' },
			{ userId, mediaType: 'tv', tmdbId: NEVER_OPENED_ID, status: 'watching' }
		]);

		await db.insert(userWatches).values([
			// Behind: only E1 watched of 3 aired -> behind.
			{ userId, mediaType: 'tv', tmdbId: BEHIND_ID, seasonNumber: 1, episodeNumber: 1 },
			// Up to date: all 3 aired episodes watched, 2 unaired remain in `total`.
			{ userId, mediaType: 'tv', tmdbId: UP_TO_DATE_ID, seasonNumber: 1, episodeNumber: 1 },
			{ userId, mediaType: 'tv', tmdbId: UP_TO_DATE_ID, seasonNumber: 1, episodeNumber: 2 },
			{ userId, mediaType: 'tv', tmdbId: UP_TO_DATE_ID, seasonNumber: 1, episodeNumber: 3 },
			// Completed: all 3 aired episodes watched too.
			{ userId, mediaType: 'tv', tmdbId: COMPLETED_ID, seasonNumber: 1, episodeNumber: 1 },
			{ userId, mediaType: 'tv', tmdbId: COMPLETED_ID, seasonNumber: 1, episodeNumber: 2 },
			{ userId, mediaType: 'tv', tmdbId: COMPLETED_ID, seasonNumber: 1, episodeNumber: 3 }
		]);
	});

	afterEach(async () => {
		for (const tmdbId of [BEHIND_ID, UP_TO_DATE_ID, COMPLETED_ID]) {
			await db.delete(episodes).where(eq(episodes.showTmdbId, tmdbId));
			await db.delete(seasons).where(eq(seasons.showTmdbId, tmdbId));
		}
		await db.delete(userWatches).where(eq(userWatches.userId, userId));
		await db.delete(userTracking).where(eq(userTracking.userId, userId));
		await db.delete(users).where(eq(users.id, userId));
	});

	it('computes watched/total (specials excluded) and a color state per show', async () => {
		const result = await getShowProgress(userId, [
			{ tmdbId: BEHIND_ID, trackingStatus: 'watching' },
			{ tmdbId: UP_TO_DATE_ID, trackingStatus: 'watching' },
			{ tmdbId: COMPLETED_ID, trackingStatus: 'completed' },
			{ tmdbId: NEVER_OPENED_ID, trackingStatus: 'watching' }
		]);

		expect(result.get(BEHIND_ID)).toEqual({ watched: 1, total: 5, state: 'behind' });
		expect(result.get(UP_TO_DATE_ID)).toEqual({ watched: 3, total: 5, state: 'up_to_date' });
		expect(result.get(COMPLETED_ID)).toEqual({ watched: 3, total: 5, state: 'completed' });
		// No seasons cache at all -- omitted rather than a misleading 0/0.
		expect(result.has(NEVER_OPENED_ID)).toBe(false);
	});
});

/** A timestamp just past the TTL, so the row counts as stale. */
function staleDate(): Date {
	return new Date(Date.now() - MEDIA_CACHE_TTL_MS - 60 * 1000);
}

describe('getMovieCachedOrRefresh', () => {
	const MOVIE_ID = 999022;

	const MOVIE_DETAILS: TmdbMovieDetails = {
		id: MOVIE_ID,
		title: 'Fresh Movie',
		overview: 'Fresh overview',
		poster_path: '/fresh-poster.jpg',
		backdrop_path: '/fresh-backdrop.jpg',
		release_date: '2021-06-01',
		runtime: 121,
		vote_average: 6.9,
		vote_count: 500
	};

	async function seedCachedMovie(updatedAt: Date) {
		await db.insert(movies).values({
			tmdbId: MOVIE_ID,
			title: 'Cached Movie',
			posterPath: '/cached-poster.jpg',
			backdropPath: '/cached-backdrop.jpg',
			voteAverage: 7.1,
			voteCount: 300,
			overview: 'Cached overview',
			releaseDate: '2019-03-15',
			runtime: 95,
			updatedAt
		});
	}

	beforeEach(() => {
		vi.mocked(getMovieDetails).mockReset();
		vi.mocked(getMovieDetails).mockResolvedValue(MOVIE_DETAILS);
	});

	afterEach(async () => {
		await db.delete(movies).where(eq(movies.tmdbId, MOVIE_ID));
	});

	it('serves a TTL-fresh movie from the db without any TMDB call', async () => {
		await seedCachedMovie(new Date());

		const result = await getMovieCachedOrRefresh(MOVIE_ID);

		expect(getMovieDetails).not.toHaveBeenCalled();
		expect(result).toEqual({
			id: MOVIE_ID,
			title: 'Cached Movie',
			overview: 'Cached overview',
			poster_path: '/cached-poster.jpg',
			backdrop_path: '/cached-backdrop.jpg',
			release_date: '2019-03-15',
			runtime: 95,
			vote_average: 7.1,
			vote_count: 300
		});
	});

	it('refetches from TMDB once the cached row is older than the TTL', async () => {
		await seedCachedMovie(staleDate());

		const result = await getMovieCachedOrRefresh(MOVIE_ID);

		expect(getMovieDetails).toHaveBeenCalledTimes(1);
		expect(result.title).toBe('Fresh Movie');

		const [row] = await db.select().from(movies).where(eq(movies.tmdbId, MOVIE_ID));
		expect(row.voteCount).toBe(500);
		expect(row.backdropPath).toBe('/fresh-backdrop.jpg');
	});

	it('refetches a never-cached movie', async () => {
		const result = await getMovieCachedOrRefresh(MOVIE_ID);

		expect(getMovieDetails).toHaveBeenCalledTimes(1);
		expect(result.title).toBe('Fresh Movie');
	});
});

describe('syncShow', () => {
	const ID = 999041;

	function ep(n: number, name = `S?E${n}`, air = '2020-02-02') {
		return {
			episode_number: n,
			name,
			overview: 'o',
			air_date: air,
			runtime: 40,
			still_path: null,
			vote_average: 7,
			vote_count: 3
		};
	}
	function season(s: number, count = 2): TmdbSeasonDetails {
		return {
			episodes: Array.from({ length: count }, (_, i) => ep(i + 1, `S${s}E${i + 1}`))
		};
	}
	function details(seasonNumbers = [1, 2]): TmdbShowDetails {
		return {
			id: ID,
			name: 'Synced Show',
			original_language: 'en',
			overview: 'ov',
			poster_path: '/p.jpg',
			backdrop_path: '/b.jpg',
			first_air_date: '2020-01-01',
			status: 'Returning Series',
			next_episode_to_air: null,
			seasons: seasonNumbers.map((n) => ({
				season_number: n,
				name: `Season ${n}`,
				episode_count: 2,
				air_date: '2020-01-01'
			})),
			vote_average: 8,
			vote_count: 10
		};
	}
	function mockTmdb(seasonMap: Array<[number, TmdbSeasonDetails]>, seasonNumbers = [1, 2]) {
		vi.mocked(getShowWithSeasons).mockResolvedValue({
			details: details(seasonNumbers),
			seasons: new Map(seasonMap)
		});
	}
	async function seedShow(extra: Partial<typeof shows.$inferInsert> = {}) {
		await db.insert(shows).values({ tmdbId: ID, title: 'Old Title', ...extra });
	}
	async function seedEp(s: number, e: number, extra: Partial<typeof episodes.$inferInsert> = {}) {
		await db.insert(episodes).values({
			showTmdbId: ID,
			seasonNumber: s,
			episodeNumber: e,
			title: `old ${s}x${e}`,
			...extra
		});
	}
	async function seedSeason(n: number) {
		await db.insert(seasons).values({ showTmdbId: ID, seasonNumber: n, name: `Old ${n}` });
	}
	const epRows = () => db.select().from(episodes).where(eq(episodes.showTmdbId, ID));

	beforeEach(() => {
		vi.mocked(getShowWithSeasons).mockReset();
		vi.mocked(extractPosterColor).mockClear();
	});
	afterEach(async () => {
		await db.delete(episodes).where(eq(episodes.showTmdbId, ID));
		await db.delete(seasons).where(eq(seasons.showTmdbId, ID));
		await db.delete(shows).where(eq(shows.tmdbId, ID));
	});

	it('upserts show, seasons and episodes and stamps synced_at and original_language', async () => {
		mockTmdb([
			[1, season(1)],
			[2, season(2)]
		]);
		await syncShow(ID);

		const [row] = await db.select().from(shows).where(eq(shows.tmdbId, ID));
		expect(row.title).toBe('Synced Show');
		expect(Date.now() - row.syncedAt!.getTime()).toBeLessThan(5000);
		expect(row.originalLanguage).toBe('en');
		expect(await db.select().from(seasons).where(eq(seasons.showTmdbId, ID))).toHaveLength(2);
		expect(await epRows()).toHaveLength(4);
	});

	it('passes cached season numbers as known seasons', async () => {
		await seedShow();
		await seedSeason(2);
		await seedSeason(1);
		mockTmdb([]);
		await syncShow(ID);
		expect(getShowWithSeasons).toHaveBeenCalledWith(ID, [1, 2]);
	});

	it('updates titles and air dates of episodes already cached', async () => {
		await seedShow();
		await seedSeason(1);
		await seedEp(1, 1, { title: 'Old', airDate: '2020-01-01' });
		mockTmdb([[1, season(1)]], [1]);
		await syncShow(ID);
		const e = (await epRows()).find((r) => r.seasonNumber === 1 && r.episodeNumber === 1)!;
		expect(e.title).toBe('S1E1');
		expect(e.airDate).toBe('2020-02-02');
	});

	it('deletes episodes of a synced season that TMDB no longer returns', async () => {
		await seedShow();
		await seedEp(1, 3);
		await seedEp(2, 1);
		mockTmdb([[1, season(1)]], [1]);
		await syncShow(ID);
		const rows = await epRows();
		expect(rows.find((r) => r.seasonNumber === 1 && r.episodeNumber === 3)).toBeUndefined();
		expect(rows.filter((r) => r.seasonNumber === 2)).toHaveLength(1);
	});

	it('keeps cached episodes of a season whose payload TMDB omitted', async () => {
		await seedShow();
		await seedEp(2, 1);
		await seedEp(2, 2);
		mockTmdb([[1, season(1)]], [1, 2]);
		await syncShow(ID);
		expect((await epRows()).filter((r) => r.seasonNumber === 2)).toHaveLength(2);
	});

	it('handles a season with no episodes announced', async () => {
		await seedShow();
		await seedEp(3, 1);
		await seedEp(3, 2);
		mockTmdb([[3, { episodes: [] }]], [3]);
		await expect(syncShow(ID)).resolves.toBeUndefined();
		expect((await epRows()).filter((r) => r.seasonNumber === 3)).toHaveLength(0);
	});

	it('keeps the poster color when the poster is unchanged', async () => {
		await seedShow({ posterPath: '/p.jpg', posterColor: '#123456' });
		mockTmdb([[1, season(1)]], [1]);
		await syncShow(ID);
		expect(extractPosterColor).not.toHaveBeenCalled();
		const [row] = await db.select().from(shows).where(eq(shows.tmdbId, ID));
		expect(row.posterColor).toBe('#123456');
	});

	it('leaves the db untouched when TMDB fails', async () => {
		await seedShow();
		vi.mocked(getShowWithSeasons).mockRejectedValue(new Error('timeout'));
		await expect(syncShow(ID)).rejects.toThrow('timeout');
		const [row] = await db.select().from(shows).where(eq(shows.tmdbId, ID));
		expect(row.syncedAt).toBeNull();
		expect(row.title).toBe('Old Title');
	});
});
