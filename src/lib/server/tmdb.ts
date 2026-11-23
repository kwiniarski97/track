import { env } from '$env/dynamic/private';

export { tmdbPosterUrl } from '$lib/tmdb-client';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const DEFAULT_LANGUAGE = 'pl-PL';
export const TMDB_TIMEOUT_MS = 5000;

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
	if (!env.TMDB_API_KEY) throw new Error('TMDB_API_KEY is not set');

	const url = new URL(`${TMDB_BASE_URL}${path}`);
	url.searchParams.set('api_key', env.TMDB_API_KEY);
	url.searchParams.set('language', DEFAULT_LANGUAGE);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

	const response = await fetch(url, { signal: AbortSignal.timeout(TMDB_TIMEOUT_MS) });
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

// TMDB has no per-field translation fallback: an episode without a Polish translation
// comes back as a locale placeholder ("Odcinek 5") rather than its real name.
function isEpisodeNamePlaceholder(name: string, episodeNumber: number): boolean {
	return name === '' || name === `Odcinek ${episodeNumber}`;
}

async function getOriginalLanguage(tmdbId: number): Promise<string> {
	const data = await tmdbFetch<{ original_language: string }>(`/tv/${tmdbId}`);
	return data.original_language;
}

export type TmdbShowDetails = {
	id: number;
	name: string;
	original_language: string;
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

export async function getShowDetails(tmdbId: number): Promise<TmdbShowDetails> {
	const details = await tmdbFetch<TmdbShowDetails>(`/tv/${tmdbId}`);
	const next = details.next_episode_to_air;
	if (next && isEpisodeNamePlaceholder(next.name, next.episode_number)) {
		const original = await tmdbFetch<TmdbShowDetails>(`/tv/${tmdbId}`, {
			language: details.original_language
		});
		const originalName = original.next_episode_to_air?.name;
		if (originalName) next.name = originalName;
	}
	return details;
}

export type TmdbSeasonDetails = {
	episodes: Array<{
		episode_number: number;
		name: string;
		overview: string;
		air_date: string | null;
		runtime: number | null;
		still_path: string | null;
		vote_average: number;
		vote_count: number;
	}>;
};

function mergeOriginalEpisodes(
	data: TmdbSeasonDetails,
	original: TmdbSeasonDetails
): TmdbSeasonDetails {
	const originalByNumber = new Map(original.episodes.map((ep) => [ep.episode_number, ep]));

	return {
		...data,
		episodes: data.episodes.map((ep) => {
			const originalEp = originalByNumber.get(ep.episode_number);
			if (!originalEp) return ep;
			return {
				...ep,
				name: isEpisodeNamePlaceholder(ep.name, ep.episode_number)
					? originalEp.name || ep.name
					: ep.name,
				overview: ep.overview || originalEp.overview
			};
		})
	};
}

function seasonNeedsOriginal(season: TmdbSeasonDetails): boolean {
	return season.episodes.some(
		(ep) => isEpisodeNamePlaceholder(ep.name, ep.episode_number) || ep.overview === ''
	);
}

// TMDB's append_to_response accepts at most 20 sub-requests per call.
export const APPEND_SEASON_LIMIT = 20;

export type TmdbShowWithSeasons = {
	details: TmdbShowDetails;
	seasons: Map<number, TmdbSeasonDetails>;
};

type TmdbShowResponse = TmdbShowDetails & Record<`season/${number}`, TmdbSeasonDetails | undefined>;

function chunk<T>(items: T[], size: number): T[][] {
	const groups: T[][] = [];
	for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
	return groups;
}

function fetchShowResponse(
	tmdbId: number,
	seasonNumbers: number[],
	language?: string
): Promise<TmdbShowResponse> {
	const params: Record<string, string> = {};
	if (seasonNumbers.length > 0) {
		params.append_to_response = seasonNumbers.map((n) => `season/${n}`).join(',');
	}
	if (language) params.language = language;
	return tmdbFetch<TmdbShowResponse>(`/tv/${tmdbId}`, params);
}

function collectSeasons(
	response: TmdbShowResponse,
	seasonNumbers: number[],
	into: Map<number, TmdbSeasonDetails>
): void {
	for (const n of seasonNumbers) {
		const season = response[`season/${n}`];
		if (season) into.set(n, season);
	}
}

/**
 * Fetches show details and every season in as few TMDB calls as possible: seasons ride along
 * on /tv/{id} via append_to_response (20 per call). `knownSeasonNumbers` lets the first call
 * already carry seasons; any season in `details.seasons` it did not cover gets follow-up calls.
 * `seasons` holds only the payloads TMDB actually returned.
 */
export async function getShowWithSeasons(
	tmdbId: number,
	knownSeasonNumbers: number[] = []
): Promise<TmdbShowWithSeasons> {
	const firstGroup = knownSeasonNumbers.slice(0, APPEND_SEASON_LIMIT);
	const first = await fetchShowResponse(tmdbId, firstGroup);
	const details: TmdbShowDetails = first;
	const seasons = new Map<number, TmdbSeasonDetails>();
	collectSeasons(first, firstGroup, seasons);

	const requested = new Set(firstGroup);
	const remaining = details.seasons.map((s) => s.season_number).filter((n) => !requested.has(n));
	for (const group of chunk(remaining, APPEND_SEASON_LIMIT)) {
		collectSeasons(await fetchShowResponse(tmdbId, group), group, seasons);
	}

	const originals: TmdbShowResponse[] = [];
	const needingOriginal = [...seasons].filter(([, s]) => seasonNeedsOriginal(s)).map(([n]) => n);
	for (const group of chunk(needingOriginal, APPEND_SEASON_LIMIT)) {
		const original = await fetchShowResponse(tmdbId, group, details.original_language);
		originals.push(original);
		for (const n of group) {
			const originalSeason = original[`season/${n}`];
			if (originalSeason) seasons.set(n, mergeOriginalEpisodes(seasons.get(n)!, originalSeason));
		}
	}

	const next = details.next_episode_to_air;
	if (next && isEpisodeNamePlaceholder(next.name, next.episode_number)) {
		const source = originals[0] ?? (await fetchShowResponse(tmdbId, [], details.original_language));
		const originalName = source.next_episode_to_air?.name;
		if (originalName) next.name = originalName;
	}

	return { details, seasons };
}

export async function getSeasonDetails(
	tmdbId: number,
	seasonNumber: number
): Promise<TmdbSeasonDetails> {
	const data = await tmdbFetch<TmdbSeasonDetails>(`/tv/${tmdbId}/season/${seasonNumber}`);
	const needsOriginal = (ep: TmdbSeasonDetails['episodes'][number]) =>
		isEpisodeNamePlaceholder(ep.name, ep.episode_number) || ep.overview === '';
	if (!data.episodes.some(needsOriginal)) {
		return data;
	}

	const original = await tmdbFetch<TmdbSeasonDetails>(`/tv/${tmdbId}/season/${seasonNumber}`, {
		language: await getOriginalLanguage(tmdbId)
	});
	return mergeOriginalEpisodes(data, original);
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
