import { env } from '$env/dynamic/private';

interface JellyfinItem {
	Id: string;
	Type: string;
	SeriesId?: string;
	IndexNumber?: number;
	ParentIndexNumber?: number;
	ProviderIds?: Record<string, string>;
}

function requireEnv(name: 'JELLYFIN_URL' | 'JELLYFIN_API_KEY'): string {
	const value = env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
}

async function jellyfinFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
	const url = new URL(`${requireEnv('JELLYFIN_URL')}${path}`);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

	const response = await fetch(url, {
		headers: { 'X-Emby-Token': requireEnv('JELLYFIN_API_KEY') }
	});
	if (!response.ok) {
		throw new Error(`Jellyfin request failed: ${response.status} ${response.statusText} (${path})`);
	}
	return response.json() as Promise<T>;
}

export interface JellyfinUser {
	id: string;
	name: string;
}

export async function listJellyfinUsers(): Promise<JellyfinUser[]> {
	const users = await jellyfinFetch<Array<{ Id: string; Name: string }>>('/Users');
	return users.map((u) => ({ id: u.Id, name: u.Name }));
}

async function fetchAllItems(
	jellyfinUserId: string,
	params: Record<string, string>
): Promise<JellyfinItem[]> {
	const items: JellyfinItem[] = [];
	const pageSize = 500;
	let startIndex = 0;

	for (;;) {
		const data = await jellyfinFetch<{ Items: JellyfinItem[]; TotalRecordCount: number }>(
			`/Users/${jellyfinUserId}/Items`,
			{ ...params, StartIndex: String(startIndex), Limit: String(pageSize) }
		);
		items.push(...data.Items);
		startIndex += data.Items.length;
		if (data.Items.length === 0 || startIndex >= data.TotalRecordCount) break;
	}

	return items;
}

export interface JellyfinWatchedItem {
	mediaType: 'tv' | 'movie';
	tmdbId: number;
	seasonNumber?: number;
	episodeNumber?: number;
}

/** Episodes don't carry the parent show's TMDB id on the item itself (their own
 * ProviderIds are empty/episode-specific) -- only the Series item has it, so it's
 * resolved via SeriesId and cached per sync run to avoid one request per episode. */
export async function getPlayedItems(jellyfinUserId: string): Promise<JellyfinWatchedItem[]> {
	const items = await fetchAllItems(jellyfinUserId, {
		Filters: 'IsPlayed',
		IncludeItemTypes: 'Episode,Movie',
		Recursive: 'true',
		Fields: 'ProviderIds'
	});

	const seriesTmdbCache = new Map<string, number | null>();
	async function getSeriesTmdbId(seriesId: string): Promise<number | null> {
		if (seriesTmdbCache.has(seriesId)) return seriesTmdbCache.get(seriesId) ?? null;
		try {
			const series = await jellyfinFetch<JellyfinItem>(
				`/Users/${jellyfinUserId}/Items/${seriesId}`
			);
			const tmdbId = series.ProviderIds?.Tmdb ? Number(series.ProviderIds.Tmdb) : null;
			seriesTmdbCache.set(seriesId, tmdbId);
			return tmdbId;
		} catch (error) {
			console.error(`[jellyfin] failed to resolve series ${seriesId}`, error);
			seriesTmdbCache.set(seriesId, null);
			return null;
		}
	}

	const results: JellyfinWatchedItem[] = [];
	for (const item of items) {
		if (item.Type === 'Movie') {
			const tmdbId = item.ProviderIds?.Tmdb ? Number(item.ProviderIds.Tmdb) : null;
			if (tmdbId) results.push({ mediaType: 'movie', tmdbId });
		} else if (item.Type === 'Episode' && item.SeriesId) {
			// Season 0 ("Specials") has no standardized cross-provider numbering -- Jellyfin
			// and TMDB routinely number the same bonus content differently (seen on real
			// data: TMDB lists 5 specials for a show while Jellyfin numbered its specials
			// 8-29 for the same show), so matching by episode number there would silently
			// mark the wrong episode watched. Regular seasons are standardized and safe.
			if (item.ParentIndexNumber === 0) continue;

			const tmdbId = await getSeriesTmdbId(item.SeriesId);
			if (tmdbId && item.ParentIndexNumber != null && item.IndexNumber != null) {
				results.push({
					mediaType: 'tv',
					tmdbId,
					seasonNumber: item.ParentIndexNumber,
					episodeNumber: item.IndexNumber
				});
			}
		}
	}
	return results;
}

export interface JellyfinLibraryEntry {
	mediaType: 'tv' | 'movie';
	tmdbId: number;
}

export async function getLibraryTmdbIds(jellyfinUserId: string): Promise<JellyfinLibraryEntry[]> {
	const items = await fetchAllItems(jellyfinUserId, {
		IncludeItemTypes: 'Series,Movie',
		Recursive: 'true',
		Fields: 'ProviderIds'
	});

	const entries: JellyfinLibraryEntry[] = [];
	for (const item of items) {
		const tmdbId = item.ProviderIds?.Tmdb ? Number(item.ProviderIds.Tmdb) : null;
		if (!tmdbId) continue;
		entries.push({ mediaType: item.Type === 'Series' ? 'tv' : 'movie', tmdbId });
	}
	return entries;
}
