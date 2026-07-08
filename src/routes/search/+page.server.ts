import { SEARCH_SORTS, sortSearchResults, type SearchSort } from '$lib/server/searchSort';
import { searchByType, type SearchMediaType } from '$lib/server/tmdb';
import type { PageServerLoad } from './$types';

const MIN_YEAR = 1900;

function parseYear(value: string | null): number | undefined {
	if (!value) return undefined;
	const year = Number(value);
	const maxYear = new Date().getFullYear() + 5;
	if (!Number.isInteger(year) || year < MIN_YEAR || year > maxYear) return undefined;
	return year;
}

export const load: PageServerLoad = async ({ url }) => {
	const query = url.searchParams.get('q')?.trim() ?? '';
	const sortParam = url.searchParams.get('sort');
	const sort: SearchSort = SEARCH_SORTS.includes(sortParam as SearchSort)
		? (sortParam as SearchSort)
		: 'relevance';
	const typeParam = url.searchParams.get('type');
	const type: SearchMediaType = typeParam === 'movie' ? 'movie' : 'tv';
	const pageParam = Number(url.searchParams.get('page'));
	const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
	const year = parseYear(url.searchParams.get('year'));

	if (query.length === 0) return { query, sort, type, year, page: 1, totalPages: 0, results: [] };

	const { results, totalPages } = await searchByType(type, query, page, year);
	return { query, sort, type, year, page, totalPages, results: sortSearchResults(results, sort) };
};
