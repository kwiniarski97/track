import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { episodes, jellyfinLibraryItems, userTracking, userWatches } from '$lib/server/db/schema';
import { cacheShowSeasons, refreshShow } from '$lib/server/media';
import { getSeasonDetails, type TmdbShowDetails } from '$lib/server/tmdb';
import type { Actions, PageServerLoad } from './$types';

async function ensureShowCached(tmdbId: number): Promise<TmdbShowDetails> {
	const details = await refreshShow(tmdbId);
	await cacheShowSeasons(tmdbId, details);
	return details;
}

async function ensureSeasonEpisodesCached(tmdbId: number, seasonNumber: number) {
	const data = await getSeasonDetails(tmdbId, seasonNumber);
	for (const ep of data.episodes) {
		await db
			.insert(episodes)
			.values({
				showTmdbId: tmdbId,
				seasonNumber,
				episodeNumber: ep.episode_number,
				title: ep.name,
				airDate: ep.air_date,
				runtime: ep.runtime,
				stillPath: ep.still_path,
				voteAverage: ep.vote_average,
				voteCount: ep.vote_count
			})
			.onConflictDoUpdate({
				target: [episodes.showTmdbId, episodes.seasonNumber, episodes.episodeNumber],
				set: {
					title: ep.name,
					airDate: ep.air_date,
					runtime: ep.runtime,
					stillPath: ep.still_path,
					voteAverage: ep.vote_average,
					voteCount: ep.vote_count
				}
			});
	}
}

/** Only hits TMDB for seasons we haven't cached yet -- rendering every season on one
 * page means we'd otherwise refetch all of them from TMDB on every visit. */
async function ensureAllSeasonsEpisodesCached(
	tmdbId: number,
	seasonsList: Array<{ season_number: number }>
) {
	for (const season of seasonsList) {
		const [existing] = await db
			.select({ runtime: episodes.runtime, voteAverage: episodes.voteAverage })
			.from(episodes)
			.where(and(eq(episodes.showTmdbId, tmdbId), eq(episodes.seasonNumber, season.season_number)))
			.limit(1);
		// Also recache if runtime/voteAverage are missing, so seasons cached before those
		// columns existed get backfilled the next time someone opens the show.
		if (!existing || existing.runtime === null || existing.voteAverage === null) {
			await ensureSeasonEpisodesCached(tmdbId, season.season_number);
		}
	}
}

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const tmdbId = Number(params.tmdbId);
	const details = await ensureShowCached(tmdbId);

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
	const requestedSeason = Number(
		url.searchParams.get('season') ?? defaultSeason?.season_number ?? 1
	);

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

	return {
		show: details,
		seasons: seasonsWithEpisodes,
		selectedSeason: requestedSeason,
		episodesBySeason,
		watchedEpisodeNumbersBySeason,
		trackingStatus: tracking?.status ?? null,
		inJellyfinLibrary: !!libraryEntry
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
