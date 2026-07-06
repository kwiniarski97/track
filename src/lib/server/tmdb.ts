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
};

export async function searchMulti(query: string): Promise<TmdbSearchResult[]> {
	const data = await tmdbFetch<{
		results: Array<{
			id: number;
			media_type: string;
			name?: string;
			title?: string;
			poster_path: string | null;
			first_air_date?: string;
			release_date?: string;
		}>;
	}>('/search/multi', { query });

	return data.results
		.filter(
			(r): r is typeof r & { media_type: 'tv' | 'movie' } =>
				r.media_type === 'tv' || r.media_type === 'movie'
		)
		.map((r) =>
			r.media_type === 'tv'
				? {
						mediaType: 'tv' as const,
						tmdbId: r.id,
						title: r.name ?? '',
						posterPath: r.poster_path,
						date: r.first_air_date ?? null
					}
				: {
						mediaType: 'movie' as const,
						tmdbId: r.id,
						title: r.title ?? '',
						posterPath: r.poster_path,
						date: r.release_date ?? null
					}
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
};

export function getShowDetails(tmdbId: number): Promise<TmdbShowDetails> {
	return tmdbFetch<TmdbShowDetails>(`/tv/${tmdbId}`);
}

export type TmdbSeasonDetails = {
	episodes: Array<{
		episode_number: number;
		name: string;
		air_date: string | null;
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
};

export function getMovieDetails(tmdbId: number): Promise<TmdbMovieDetails> {
	return tmdbFetch<TmdbMovieDetails>(`/movie/${tmdbId}`);
}
