import { searchMulti } from '$lib/server/tmdb';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const query = url.searchParams.get('q')?.trim() ?? '';
	const results = query.length > 0 ? await searchMulti(query) : [];
	return { query, results };
};
