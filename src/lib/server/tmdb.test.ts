import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSeasonDetails, getShowDetails } from './tmdb';

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
function mockTmdb(routes: Array<{ path: string; language?: string; data: unknown }>) {
	fetchMock.mockImplementation(async (input: URL | string) => {
		const url = new URL(String(input));
		const language = url.searchParams.get('language');
		const match = routes.find(
			(r) => url.pathname === `/3${r.path}` && (r.language === undefined || r.language === language)
		);
		if (!match) throw new Error(`unexpected TMDB request: ${url.pathname}?language=${language}`);
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

describe('getSeasonDetails', () => {
	const episode = (episode_number: number, name: string) => ({
		episode_number,
		name,
		air_date: '2024-01-01',
		runtime: 30,
		still_path: null,
		vote_average: 7,
		vote_count: 10
	});

	it('returns Polish names as-is without extra requests when fully translated', async () => {
		mockTmdb([
			{
				path: '/tv/100/season/1',
				language: 'pl-PL',
				data: { episodes: [episode(1, 'Rok 3000'), episode(2, 'Lądowanie')] }
			}
		]);

		const result = await getSeasonDetails(100, 1);

		expect(result.episodes.map((e) => e.name)).toEqual(['Rok 3000', 'Lądowanie']);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('replaces "Odcinek N" placeholders and empty names with original-language names', async () => {
		mockTmdb([
			{
				path: '/tv/100/season/1',
				language: 'pl-PL',
				data: {
					episodes: [episode(1, 'Odcinek 1'), episode(2, 'Prawdziwa nazwa'), episode(3, '')]
				}
			},
			{ path: '/tv/100', language: 'pl-PL', data: { original_language: 'ja' } },
			{
				path: '/tv/100/season/1',
				language: 'ja',
				data: { episodes: [episode(1, '第1話'), episode(2, 'ignored'), episode(3, '第3話')] }
			}
		]);

		const result = await getSeasonDetails(100, 1);

		expect(result.episodes.map((e) => e.name)).toEqual(['第1話', 'Prawdziwa nazwa', '第3話']);
	});

	it('does not treat a real name that only mentions its own number as a placeholder', async () => {
		mockTmdb([
			{
				path: '/tv/100/season/1',
				language: 'pl-PL',
				data: { episodes: [episode(5, 'Odcinek 5: Finał')] }
			}
		]);

		const result = await getSeasonDetails(100, 1);

		expect(result.episodes[0].name).toBe('Odcinek 5: Finał');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('keeps the placeholder when the original language has no name either', async () => {
		mockTmdb([
			{
				path: '/tv/100/season/1',
				language: 'pl-PL',
				data: { episodes: [episode(1, 'Odcinek 1')] }
			},
			{ path: '/tv/100', language: 'pl-PL', data: { original_language: 'ja' } },
			{
				path: '/tv/100/season/1',
				language: 'ja',
				data: { episodes: [episode(1, '')] }
			}
		]);

		const result = await getSeasonDetails(100, 1);

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
