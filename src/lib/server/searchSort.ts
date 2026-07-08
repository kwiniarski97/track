import { getLocale } from '$lib/paraglide/runtime';
import type { TmdbSearchResult } from '$lib/server/tmdb';

export const SEARCH_SORTS = ['relevance', 'popularity', 'rating', 'newest', 'title'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

const MIN_VOTES_FOR_RATING = 10;

export function sortSearchResults(
	results: TmdbSearchResult[],
	sort: SearchSort
): TmdbSearchResult[] {
	if (sort === 'relevance') return results;

	const sorted = [...results];
	switch (sort) {
		case 'popularity':
			sorted.sort((a, b) => b.popularity - a.popularity);
			break;
		case 'rating':
			sorted.sort((a, b) => {
				const scoreA = a.voteCount >= MIN_VOTES_FOR_RATING ? a.voteAverage : -1;
				const scoreB = b.voteCount >= MIN_VOTES_FOR_RATING ? b.voteAverage : -1;
				return scoreB - scoreA;
			});
			break;
		case 'newest':
			sorted.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
			break;
		case 'title':
			sorted.sort((a, b) => a.title.localeCompare(b.title, getLocale()));
			break;
	}
	return sorted;
}
