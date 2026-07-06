import { searchTv, type TmdbTvSearchResult } from '$lib/server/tmdb';

const DIACRITICS_PATTERN = new RegExp(
	'[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
	'g'
);

// TV Time uses the colloquial "UK", not the ISO 3166-1 code TMDB's origin_country uses.
const COUNTRY_CODE_ALIASES: Record<string, string> = { UK: 'GB' };

export interface TmdbCandidate {
	tmdbId: number;
	title: string;
	year: string | null;
}

export interface ShowMatch {
	showName: string;
	confidence: 'auto' | 'ambiguous' | 'none';
	tmdbId: number | null;
	candidates: TmdbCandidate[];
}

function normalizeTitle(title: string): string {
	return title
		.toLowerCase()
		.normalize('NFD')
		.replace(DIACRITICS_PATTERN, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** TV Time sometimes bakes a disambiguator into the show name itself, e.g.
 * "Battlestar Galactica (2003)" or "The Office (US)" -- TMDB's search has no match for
 * either literal string, so the suffix is split out: search on the bare title, then use
 * the year or country to narrow down which same-named result is the right one. */
function splitDisambiguator(showName: string): {
	title: string;
	year: string | null;
	countryHint: string | null;
} {
	const yearMatch = showName.match(/^(.*?)\s*\((\d{4})\)$/);
	if (yearMatch) return { title: yearMatch[1].trim(), year: yearMatch[2], countryHint: null };

	const countryMatch = showName.match(/^(.*?)\s*\(([A-Za-z]{2,3})\)$/);
	if (countryMatch) {
		const code = countryMatch[2].toUpperCase();
		return {
			title: countryMatch[1].trim(),
			year: null,
			countryHint: COUNTRY_CODE_ALIASES[code] ?? code
		};
	}

	return { title: showName, year: null, countryHint: null };
}

function isTitleMatch(result: TmdbTvSearchResult, normalizedQuery: string): boolean {
	return (
		normalizeTitle(result.name) === normalizedQuery ||
		normalizeTitle(result.original_name) === normalizedQuery
	);
}

function toCandidate(result: TmdbTvSearchResult): TmdbCandidate {
	return {
		tmdbId: result.id,
		title: result.name,
		year: result.first_air_date?.slice(0, 4) ?? null
	};
}

async function matchShowToTmdb(showName: string): Promise<ShowMatch> {
	const { title, year, countryHint } = splitDisambiguator(showName);
	const results = await searchTv(title);
	const candidates = results.slice(0, 5).map(toCandidate);

	if (results.length === 0) {
		return { showName, confidence: 'none', tmdbId: null, candidates };
	}
	// TMDB itself found only one thing for this title -- trust it even if the exact
	// string doesn't match (its `name` may be pl-PL localized, e.g. MythBusters ->
	// "Pogromcy mitów").
	if (results.length === 1) {
		return { showName, confidence: 'auto', tmdbId: results[0].id, candidates };
	}

	// Multiple results: only auto-accept if exactly one of them has the exact title
	// (by name or original_name) -- if two same-titled regional versions both match
	// (e.g. US vs UK "Shameless"), popularity-based ordering isn't a real signal for
	// which one *this user* watched, so that must go to manual review instead.
	const normalizedQuery = normalizeTitle(title);
	let exactMatches = results.filter((r) => isTitleMatch(r, normalizedQuery));

	if (year) {
		const narrowed = exactMatches.filter((r) => r.first_air_date?.startsWith(year));
		if (narrowed.length > 0) exactMatches = narrowed;
	} else if (countryHint) {
		const narrowed = exactMatches.filter((r) => r.origin_country?.includes(countryHint));
		if (narrowed.length > 0) exactMatches = narrowed;
	}

	if (exactMatches.length === 1) {
		return { showName, confidence: 'auto', tmdbId: exactMatches[0].id, candidates };
	}

	return { showName, confidence: 'ambiguous', tmdbId: null, candidates };
}

async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let nextIndex = 0;
	async function worker() {
		while (nextIndex < items.length) {
			const current = nextIndex++;
			results[current] = await fn(items[current]);
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

export async function matchShowsToTmdb(showNames: string[]): Promise<ShowMatch[]> {
	return mapWithConcurrency(showNames, 5, async (showName) => {
		try {
			return await matchShowToTmdb(showName);
		} catch (error) {
			console.error(`[tvtime-import] failed to match "${showName}" to TMDB`, error);
			return { showName, confidence: 'none' as const, tmdbId: null, candidates: [] };
		}
	});
}
