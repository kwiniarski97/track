import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getShowDetails, getShowWithSeasons } from './tmdb';

// TMDB is queried in pl-PL; when an episode has no Polish translation the API returns
// a locale placeholder ("Odcinek 5") instead of the episode's real name. These tests
// cover the fallback that swaps placeholders for the show's original-language names.

const fetchMock = vi.fn();

function jsonResponse(data: unknown) {
	return {
		ok: true,
		json: async () => data
	} as Response;
}

/** Routes mocked fetches by path + language param. */
function mockTmdb(
	routes: Array<{ path: string; language?: string; append?: string; data: unknown }>
) {
	fetchMock.mockImplementation(async (input: URL | string) => {
		const url = new URL(String(input));
		const language = url.searchParams.get('language');
		const append = url.searchParams.get('append_to_response');
		const match = routes.find(
			(r) =>
				url.pathname === `/3${r.path}` &&
				(r.language === undefined || r.language === language) &&
				(r.append === undefined || r.append === append)
		);
		if (!match) {
			throw new Error(
				`unexpected TMDB request: ${url.pathname}?language=${language}&append=${append}`
			);
		}
		return jsonResponse(match.data);
	});
}

beforeEach(() => {
	vi.stubEnv('TMDB_API_KEY', 'test-key');
	vi.stubGlobal('fetch', fetchMock);
	fetchMock.mockReset();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe('getShowWithSeasons episode name/overview fallback', () => {
	const episode = (episode_number: number, name: string, overview = `Opis ${episode_number}`) => ({
		episode_number,
		name,
		overview,
		air_date: '2024-01-01',
		runtime: 30,
		still_path: null,
		vote_average: 7,
		vote_count: 10
	});

	/** A /tv/100 payload with one season (1) holding `episodes`. */
	const showWithSeason = (episodes: ReturnType<typeof episode>[]) => ({
		id: 100,
		name: 'Show',
		original_language: 'ja',
		overview: '',
		poster_path: null,
		backdrop_path: null,
		first_air_date: '2024-01-01',
		status: 'Returning Series',
		next_episode_to_air: null,
		seasons: [{ season_number: 1, name: 'Season 1', episode_count: 1, air_date: null }],
		vote_average: 7,
		vote_count: 10,
		'season/1': { episodes }
	});
	const polish = (episodes: ReturnType<typeof episode>[]) => ({
		path: '/tv/100',
		language: 'pl-PL',
		data: showWithSeason(episodes)
	});
	const original = (episodes: ReturnType<typeof episode>[]) => ({
		path: '/tv/100',
		language: 'ja',
		data: showWithSeason(episodes)
	});
	const season1 = async () => (await getShowWithSeasons(100, [1])).seasons.get(1)!;

	it('returns Polish names as-is without extra requests when fully translated', async () => {
		mockTmdb([polish([episode(1, 'Rok 3000'), episode(2, 'Lądowanie')])]);

		const result = await season1();

		expect(result.episodes.map((e) => e.name)).toEqual(['Rok 3000', 'Lądowanie']);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('replaces "Odcinek N" placeholders and empty names with original-language names', async () => {
		mockTmdb([
			polish([episode(1, 'Odcinek 1'), episode(2, 'Prawdziwa nazwa'), episode(3, '')]),
			original([episode(1, '第1話'), episode(2, 'ignored'), episode(3, '第3話')])
		]);

		const result = await season1();

		expect(result.episodes.map((e) => e.name)).toEqual(['第1話', 'Prawdziwa nazwa', '第3話']);
	});

	it('does not treat a real name that only mentions its own number as a placeholder', async () => {
		mockTmdb([polish([episode(5, 'Odcinek 5: Finał')])]);

		const result = await season1();

		expect(result.episodes[0].name).toBe('Odcinek 5: Finał');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('exposes episode overviews', async () => {
		mockTmdb([polish([episode(1, 'Rok 3000', 'Załoga budzi się w roku 3000.')])]);

		const result = await season1();

		expect(result.episodes[0].overview).toBe('Załoga budzi się w roku 3000.');
	});

	it('fills a missing Polish overview from the original language', async () => {
		mockTmdb([
			polish([episode(1, 'Prawdziwa nazwa', ''), episode(2, 'Inna nazwa')]),
			original([episode(1, '第1話', 'Original overview'), episode(2, '第2話', 'ignored')])
		]);

		const result = await season1();

		expect(result.episodes.map((e) => e.overview)).toEqual(['Original overview', 'Opis 2']);
		// Translated names stay even though the original season was fetched for overviews.
		expect(result.episodes.map((e) => e.name)).toEqual(['Prawdziwa nazwa', 'Inna nazwa']);
	});

	it('fills both the name and overview of an untranslated episode', async () => {
		mockTmdb([
			polish([episode(1, 'Odcinek 1', '')]),
			original([episode(1, '第1話', 'Original overview')])
		]);

		const result = await season1();

		expect(result.episodes[0].name).toBe('第1話');
		expect(result.episodes[0].overview).toBe('Original overview');
	});

	it('keeps the placeholder when the original language has no name either', async () => {
		mockTmdb([polish([episode(1, 'Odcinek 1')]), original([episode(1, '')])]);

		const result = await season1();

		expect(result.episodes[0].name).toBe('Odcinek 1');
	});
});

describe('getShowDetails', () => {
	const show = (nextEpisodeName: string | null) => ({
		id: 100,
		name: 'Show',
		original_language: 'ja',
		overview: '',
		poster_path: null,
		backdrop_path: null,
		first_air_date: '2024-01-01',
		status: 'Returning Series',
		next_episode_to_air:
			nextEpisodeName === null
				? null
				: { air_date: '2024-06-01', episode_number: 4, season_number: 2, name: nextEpisodeName },
		seasons: [],
		vote_average: 8,
		vote_count: 100
	});

	it('replaces a placeholder next-episode name with the original-language name', async () => {
		mockTmdb([
			{ path: '/tv/100', language: 'pl-PL', data: show('Odcinek 4') },
			{ path: '/tv/100', language: 'ja', data: show('第4話') }
		]);

		const result = await getShowDetails(100);

		expect(result.next_episode_to_air?.name).toBe('第4話');
	});

	it('keeps a translated next-episode name without extra requests', async () => {
		mockTmdb([{ path: '/tv/100', language: 'pl-PL', data: show('Prawdziwa nazwa') }]);

		const result = await getShowDetails(100);

		expect(result.next_episode_to_air?.name).toBe('Prawdziwa nazwa');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe('getShowWithSeasons', () => {
	const episode = (episode_number: number, name: string, overview = `Opis ${episode_number}`) => ({
		episode_number,
		name,
		overview,
		air_date: '2024-01-01',
		runtime: 30,
		still_path: null,
		vote_average: 7,
		vote_count: 10
	});
	const translatedSeason = () => ({ episodes: [episode(1, 'Rok 3000')] });
	const range = (from: number, to: number) =>
		Array.from({ length: to - from + 1 }, (_, i) => from + i);

	/** A /tv/{id} payload listing `seasonNumbers`, with `extra` merged in (e.g. "season/N" keys). */
	function showResponse(seasonNumbers: number[], extra: Record<string, unknown> = {}) {
		return {
			id: 100,
			name: 'Show',
			original_language: 'ja',
			overview: '',
			poster_path: null,
			backdrop_path: null,
			first_air_date: '2024-01-01',
			status: 'Returning Series',
			next_episode_to_air: null,
			seasons: seasonNumbers.map((n) => ({
				season_number: n,
				name: `Season ${n}`,
				episode_count: 1,
				air_date: null
			})),
			vote_average: 7,
			vote_count: 10,
			...extra
		};
	}
	const seasonKeys = (numbers: number[]) =>
		Object.fromEntries(numbers.map((n) => [`season/${n}`, translatedSeason()]));
	const appendOf = (callIndex: number) =>
		new URL(String(fetchMock.mock.calls[callIndex][0])).searchParams.get('append_to_response');

	it('fetches details and up to 20 known seasons in one call', async () => {
		mockTmdb([{ path: '/tv/100', data: showResponse([1, 2, 3], seasonKeys([1, 2, 3])) }]);

		const result = await getShowWithSeasons(100, [1, 2, 3]);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(appendOf(0)).toBe('season/1,season/2,season/3');
		expect([...result.seasons.keys()]).toEqual([1, 2, 3]);
	});

	it('splits 34 seasons into groups of 20', async () => {
		const all = range(1, 34);
		mockTmdb([
			{
				path: '/tv/100',
				append: range(1, 20)
					.map((n) => `season/${n}`)
					.join(','),
				data: showResponse(all, seasonKeys(range(1, 20)))
			},
			{
				path: '/tv/100',
				append: range(21, 34)
					.map((n) => `season/${n}`)
					.join(','),
				data: showResponse(all, seasonKeys(range(21, 34)))
			}
		]);

		const result = await getShowWithSeasons(100, all);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.seasons.size).toBe(34);
	});

	it('makes a follow-up call for a never-synced show (no known seasons)', async () => {
		mockTmdb([
			{
				path: '/tv/100',
				append: 'season/1,season/2',
				data: showResponse([1, 2], seasonKeys([1, 2]))
			},
			{ path: '/tv/100', data: showResponse([1, 2]) }
		]);

		const result = await getShowWithSeasons(100);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(appendOf(0)).toBeNull();
		expect(appendOf(1)).toBe('season/1,season/2');
		expect(result.seasons.size).toBe(2);
	});

	it('fetches a season TMDB added since the last sync', async () => {
		mockTmdb([
			{
				path: '/tv/100',
				append: 'season/1,season/2',
				data: showResponse([1, 2, 3], seasonKeys([1, 2]))
			},
			{ path: '/tv/100', append: 'season/3', data: showResponse([1, 2, 3], seasonKeys([3])) }
		]);

		const result = await getShowWithSeasons(100, [1, 2]);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(appendOf(1)).toBe('season/3');
		expect(result.seasons.has(3)).toBe(true);
	});

	it('falls back to the original language in one grouped call, without a separate /tv lookup', async () => {
		mockTmdb([
			{
				path: '/tv/100',
				language: 'pl-PL',
				data: showResponse([1, 2], {
					'season/1': { episodes: [episode(1, 'Rok 3000')] },
					'season/2': { episodes: [episode(1, 'Odcinek 1', '')] }
				})
			},
			{
				path: '/tv/100',
				language: 'ja',
				append: 'season/2',
				data: showResponse([1, 2], {
					'season/2': { episodes: [episode(1, '元の名前', '元の説明')] }
				})
			}
		]);

		const result = await getShowWithSeasons(100, [1, 2]);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(result.seasons.get(2)!.episodes[0].name).toBe('元の名前');
		expect(result.seasons.get(2)!.episodes[0].overview).toBe('元の説明');
		expect(result.seasons.get(1)!.episodes[0].name).toBe('Rok 3000');
	});

	it('takes the next-episode name from the original-language response', async () => {
		const next = { air_date: null, episode_number: 4, season_number: 1, name: 'Odcinek 4' };
		mockTmdb([
			{
				path: '/tv/100',
				language: 'pl-PL',
				data: showResponse([1], { ...seasonKeys([1]), next_episode_to_air: next })
			},
			{
				path: '/tv/100',
				language: 'ja',
				data: showResponse([1], { next_episode_to_air: { ...next, name: 'Original title' } })
			}
		]);

		const result = await getShowWithSeasons(100, [1]);

		expect(result.details.next_episode_to_air!.name).toBe('Original title');
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(appendOf(1)).toBeNull();
	});

	it('omits seasons whose payload TMDB did not return', async () => {
		mockTmdb([{ path: '/tv/100', data: showResponse([1, 2], seasonKeys([1])) }]);

		const result = await getShowWithSeasons(100, [1, 2]);

		expect(result.seasons.has(1)).toBe(true);
		expect(result.seasons.has(2)).toBe(false);
	});

	it('passes a timeout signal to every fetch', async () => {
		mockTmdb([{ path: '/tv/100', data: showResponse([1], seasonKeys([1])) }]);

		await getShowWithSeasons(100, [1]);

		expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
	});
});
