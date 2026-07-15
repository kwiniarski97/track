import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	episodes,
	jellyfinLibraryItems,
	shows,
	userTracking,
	userWatches
} from '$lib/server/db/schema';
import {
	UPSERT_CHUNK_SIZE,
	chunk,
	getShowCachedOrRefresh,
	syncShowCompletion
} from '$lib/server/media';
import { getSeasonDetails } from '$lib/server/tmdb';
import type { Actions, PageServerLoad } from './$types';

async function ensureSeasonEpisodesCached(tmdbId: number, seasonNumber: number) {
	const data = await getSeasonDetails(tmdbId, seasonNumber);
	const values = data.episodes.map((ep) => ({
		showTmdbId: tmdbId,
		seasonNumber,
		episodeNumber: ep.episode_number,
		title: ep.name,
		// Coalesce so a TMDB response missing the field can't store null, which the
		// needsRefetch probe below reads as "cached before overviews existed".
		overview: ep.overview ?? '',
		airDate: ep.air_date,
		runtime: ep.runtime,
		stillPath: ep.still_path,
		voteAverage: ep.vote_average,
		voteCount: ep.vote_count
	}));
	// Drizzle throws on a multi-row insert with an empty values array (a season can
	// legitimately have no episodes announced yet).
	if (values.length === 0) return;

	// One multi-row statement per chunk instead of one round trip per episode --
	// `excluded.*` refers to each conflicting row's own incoming values.
	for (const batch of chunk(values, UPSERT_CHUNK_SIZE)) {
		await db
			.insert(episodes)
			.values(batch)
			.onConflictDoUpdate({
				target: [episodes.showTmdbId, episodes.seasonNumber, episodes.episodeNumber],
				set: {
					title: sql`excluded.title`,
					overview: sql`excluded.overview`,
					airDate: sql`excluded.air_date`,
					runtime: sql`excluded.runtime`,
					stillPath: sql`excluded.still_path`,
					voteAverage: sql`excluded.vote_average`,
					voteCount: sql`excluded.vote_count`
				}
			});
	}
}

// TMDB allows ~50 requests/second; 6 in flight keeps a long back-catalog first visit
// fast without hammering the API from a single page view.
const SEASON_FETCH_CONCURRENCY = 6;

/** Only hits TMDB for seasons we haven't cached yet -- rendering every season on one
 * page means we'd otherwise refetch all of them from TMDB on every visit. */
async function ensureAllSeasonsEpisodesCached(
	tmdbId: number,
	seasonsList: Array<{ season_number: number }>
) {
	// One grouped query instead of a probe per season. A season needs a refetch when
	// every cached row lacks runtime/voteAverage -- i.e. it was cached before those
	// columns existed and should be refetched to backfill them (partial nulls, e.g.
	// unaired episodes with no runtime yet, don't trigger a refetch) -- or when any row
	// still holds the "Odcinek N" placeholder (or an empty title) that TMDB returned
	// before getSeasonDetails learned to fall back to the original-language name, or a
	// null overview from before that column existed (absent overviews are stored as '').
	const cachedRows = await db
		.select({
			seasonNumber: episodes.seasonNumber,
			needsRefetch: sql<number>`max(
				min(case when ${episodes.runtime} is null or ${episodes.voteAverage} is null then 1 else 0 end),
				max(case when ${episodes.title} = '' or ${episodes.title} = 'Odcinek ' || ${episodes.episodeNumber} then 1 else 0 end),
				max(case when ${episodes.overview} is null then 1 else 0 end)
			)`
		})
		.from(episodes)
		.where(eq(episodes.showTmdbId, tmdbId))
		.groupBy(episodes.seasonNumber);
	const refetchBySeason = new Map(cachedRows.map((r) => [r.seasonNumber, r.needsRefetch]));

	const missing = seasonsList.filter((season) => refetchBySeason.get(season.season_number) !== 0);

	// better-sqlite3 is synchronous, so the inserts serialize regardless -- the win here
	// is overlapping the TMDB network fetches instead of paying per-season latency.
	for (const batch of chunk(missing, SEASON_FETCH_CONCURRENCY)) {
		await Promise.all(
			batch.map((season) => ensureSeasonEpisodesCached(tmdbId, season.season_number))
		);
	}
}

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const tmdbId = Number(params.tmdbId);
	const details = await getShowCachedOrRefresh(tmdbId);

	// Reconcile completion against the cached TMDB status (at most a TTL old) --
	// catches a show that was marked completed and later got renewed (status flips back
	// off Ended/Canceled), which nothing else re-checks until the show is opened again.
	await syncShowCompletion(locals.user!.id, tmdbId);

	// Show newest season first, oldest last -- but "Specials" (season 0) always last.
	const seasonsWithEpisodes = details.seasons
		.filter((s) => s.episode_count > 0)
		.sort((a, b) => {
			if (a.season_number === 0) return 1;
			if (b.season_number === 0) return -1;
			return b.season_number - a.season_number;
		});
	const defaultSeason =
		seasonsWithEpisodes.find((s) => s.season_number > 0) ?? seasonsWithEpisodes[0];
	const seasonParam = url.searchParams.get('season');
	const requestedSeason = Number(seasonParam ?? defaultSeason?.season_number ?? 1);

	await ensureAllSeasonsEpisodesCached(tmdbId, seasonsWithEpisodes);

	const allEpisodes = await db.select().from(episodes).where(eq(episodes.showTmdbId, tmdbId));

	const episodesBySeason: Record<number, (typeof allEpisodes)[number][]> = {};
	for (const episode of allEpisodes) {
		(episodesBySeason[episode.seasonNumber] ??= []).push(episode);
	}
	for (const list of Object.values(episodesBySeason)) {
		list.sort((a, b) => a.episodeNumber - b.episodeNumber);
	}

	const [tracking] = await db
		.select()
		.from(userTracking)
		.where(
			and(
				eq(userTracking.userId, locals.user!.id),
				eq(userTracking.mediaType, 'tv'),
				eq(userTracking.tmdbId, tmdbId)
			)
		);

	const watches = await db
		.select()
		.from(userWatches)
		.where(
			and(
				eq(userWatches.userId, locals.user!.id),
				eq(userWatches.mediaType, 'tv'),
				eq(userWatches.tmdbId, tmdbId)
			)
		);

	const watchedEpisodeNumbersBySeason: Record<number, number[]> = {};
	for (const watch of watches) {
		(watchedEpisodeNumbersBySeason[watch.seasonNumber] ??= []).push(watch.episodeNumber);
	}

	const [libraryEntry] = await db
		.select()
		.from(jellyfinLibraryItems)
		.where(and(eq(jellyfinLibraryItems.mediaType, 'tv'), eq(jellyfinLibraryItems.tmdbId, tmdbId)));

	const [showRow] = await db
		.select({ posterColor: shows.posterColor })
		.from(shows)
		.where(eq(shows.tmdbId, tmdbId));

	return {
		show: details,
		seasons: seasonsWithEpisodes,
		selectedSeason: requestedSeason,
		// Only set when the URL explicitly asked for a season (e.g. a deep link); lets
		// the client tell "user asked for this season" apart from "nothing requested,
		// pick whichever season should be expanded by default".
		explicitSeason: seasonParam !== null ? requestedSeason : null,
		episodesBySeason,
		watchedEpisodeNumbersBySeason,
		trackingStatus: tracking?.status ?? null,
		inJellyfinLibrary: !!libraryEntry,
		posterColor: showRow?.posterColor ?? null
	};
};

export const actions: Actions = {
	track: async ({ locals, params }) => {
		const tmdbId = Number(params.tmdbId);
		await db
			.insert(userTracking)
			.values({ userId: locals.user!.id, mediaType: 'tv', tmdbId, status: 'watching' })
			.onConflictDoNothing();
	},
	untrack: async ({ locals, params }) => {
		const tmdbId = Number(params.tmdbId);
		await db
			.delete(userTracking)
			.where(
				and(
					eq(userTracking.userId, locals.user!.id),
					eq(userTracking.mediaType, 'tv'),
					eq(userTracking.tmdbId, tmdbId)
				)
			);
	},
	// Soft stop: keeps the tracking row (and watch history) around as 'dropped' instead
	// of deleting it, so the show still shows up in the profile's "My shows" list --
	// it just drops out of the home page sections, which only look for watching/plan_to_watch.
	drop: async ({ locals, params }) => {
		const tmdbId = Number(params.tmdbId);
		await db
			.update(userTracking)
			.set({ status: 'dropped' })
			.where(
				and(
					eq(userTracking.userId, locals.user!.id),
					eq(userTracking.mediaType, 'tv'),
					eq(userTracking.tmdbId, tmdbId)
				)
			);
	}
};
