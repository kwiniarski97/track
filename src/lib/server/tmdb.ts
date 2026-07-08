import { env } from '$env/dynamic/private';

export { tmdbPosterUrl } from '$lib/tmdb-client';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const DEFAULT_LANGUAGE = 'pl-PL';

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
	if (!env.TMDB_API_KEY) throw new Error('TMDB_API_KEY is not set');

	const url = new URL(`${TMDB_BASE_URL}${path}`);
	url.searchParams.set('api_key', env.TMDB_API_KEY);
	url.searchParams.set('language', DEFAULT_LANGUAGE);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`TMDB request failed: ${response.status} ${response.statusText} (${path})`);
	}
	return response.json() as Promise<T>;
}

export type TmdbSearchResult = {
	mediaType: 'tv' | 'movie';
	tmdbId: number;
	title: string;
	posterPath: string | null;
	date: string | null;
	popularity: number;
	voteAverage: number;
	voteCount: number;
};

type TmdbRawSearchResult = {
	id: number;
	media_type: string;
	name?: string;
	title?: string;
	poster_path: string | null;
	first_air_date?: string;
	release_date?: string;
	popularity?: number;
	vote_average?: number;
	vote_count?: number;
};

const TMDB_MAX_PAGE = 500;

function mapSearchResult(
	r: TmdbRawSearchResult & { media_type: 'tv' | 'movie' }
): TmdbSearchResult {
	return r.media_type === 'tv'
		? {
				mediaType: 'tv' as const,
				tmdbId: r.id,
				title: r.name ?? '',
				posterPath: r.poster_path,
				date: r.first_air_date ?? null,
				popularity: r.popularity ?? 0,
				voteAverage: r.vote_average ?? 0,
				voteCount: r.vote_count ?? 0
			}
		: {
				mediaType: 'movie' as const,
				tmdbId: r.id,
				title: r.title ?? '',
				posterPath: r.poster_path,
				date: r.release_date ?? null,
				popularity: r.popularity ?? 0,
				voteAverage: r.vote_average ?? 0,
				voteCount: r.vote_count ?? 0
			};
}

// TMDB's text relevance ranks the *last word* of the query almost as an exact-match
// token: singular "monster" buries the plural-titled "Monsters: ..." dozens of pages
// deep even though it's a popular show, while "monsters" surfaces it on page one. Query
// the naive singular/plural toggle of the last word too and merge, so a plural/singular
// slip doesn't make an otherwise findable show disappear entirely.
function pluralVariant(query: string): string | null {
	const words = query.trim().split(/\s+/);
	const last = words[words.length - 1];
	if (last.length < 3) return null;
	words[words.length - 1] = last.endsWith('s') ? last.slice(0, -1) : `${last}s`;
	return words.join(' ');
}

export type TmdbSearchPage = {
	results: TmdbSearchResult[];
	totalPages: number;
};

export type SearchMediaType = 'tv' | 'movie';

function mergeSearchResponses(
	responses: Array<{
		results: Array<TmdbRawSearchResult & { media_type: 'tv' | 'movie' }>;
		total_pages: number;
	}>
): TmdbSearchPage {
	const bestRank = new Map<string, number>();
	const items = new Map<string, TmdbRawSearchResult & { media_type: 'tv' | 'movie' }>();

	for (const data of responses) {
		data.results.forEach((r, index) => {
			const key = `${r.media_type}-${r.id}`;
			if (!bestRank.has(key) || index < bestRank.get(key)!) bestRank.set(key, index);
			if (!items.has(key)) items.set(key, r);
		});
	}

	const results = [...items.entries()]
		.sort(([a], [b]) => bestRank.get(a)! - bestRank.get(b)!)
		.map(([, r]) => mapSearchResult(r));

	const totalPages = Math.min(TMDB_MAX_PAGE, Math.max(...responses.map((r) => r.total_pages), 1));

	return { results, totalPages };
}

export async function searchByType(
	mediaType: SearchMediaType,
	query: string,
	page: number = 1,
	year?: number
): Promise<TmdbSearchPage> {
	const clampedPage = Math.min(Math.max(1, Math.trunc(page)), TMDB_MAX_PAGE);
	const variants = [query, pluralVariant(query)].filter((v): v is string => v !== null);
	const path = mediaType === 'tv' ? '/search/tv' : '/search/movie';
	const yearParamName = mediaType === 'tv' ? 'first_air_date_year' : 'primary_release_year';

	const responses = await Promise.all(
		variants.map((v) =>
			tmdbFetch<{ results: TmdbRawSearchResult[]; total_pages: number }>(path, {
				query: v,
				page: String(clampedPage),
				...(year ? { [yearParamName]: String(year) } : {})
			})
		)
	);

	return mergeSearchResponses(
		responses.map((r) => ({
			total_pages: r.total_pages,
			results: r.results.map((x) => ({ ...x, media_type: mediaType }))
		}))
	);
}

export type TmdbTvSearchResult = {
	id: number;
	name: string;
	original_name: string;
	first_air_date: string | null;
	poster_path: string | null;
	origin_country: string[];
};

export async function searchTv(query: string): Promise<TmdbTvSearchResult[]> {
	const data = await tmdbFetch<{ results: TmdbTvSearchResult[] }>('/search/tv', { query });
	return data.results;
}

export type TmdbShowDetails = {
	id: number;
	name: string;
	overview: string;
	poster_path: string | null;
	backdrop_path: string | null;
	first_air_date: string | null;
	status: string;
	next_episode_to_air: {
		air_date: string | null;
		episode_number: number;
		season_number: number;
		name: string;
	} | null;
	seasons: Array<{
		season_number: number;
		name: string;
		episode_count: number;
		air_date: string | null;
	}>;
	vote_average: number;
	vote_count: number;
};

export function getShowDetails(tmdbId: number): Promise<TmdbShowDetails> {
	return tmdbFetch<TmdbShowDetails>(`/tv/${tmdbId}`);
}

export type TmdbSeasonDetails = {
	episodes: Array<{
		episode_number: number;
		name: string;
		air_date: string | null;
		runtime: number | null;
	}>;
};

export function getSeasonDetails(tmdbId: number, seasonNumber: number): Promise<TmdbSeasonDetails> {
	return tmdbFetch<TmdbSeasonDetails>(`/tv/${tmdbId}/season/${seasonNumber}`);
}

export type TmdbMovieDetails = {
	id: number;
	title: string;
	overview: string;
	poster_path: string | null;
	backdrop_path: string | null;
	release_date: string | null;
	runtime: number | null;
	vote_average: number;
	vote_count: number;
};

export function getMovieDetails(tmdbId: number): Promise<TmdbMovieDetails> {
	return tmdbFetch<TmdbMovieDetails>(`/movie/${tmdbId}`);
}
