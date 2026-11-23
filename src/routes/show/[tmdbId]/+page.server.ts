import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	episodes,
	jellyfinLibraryItems,
	shows,
	userTracking,
	userWatches
} from '$lib/server/db/schema';
import { getShowForPage, syncShowCompletion } from '$lib/server/media';
import { syncShows } from '$lib/server/jobs/syncShows';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const tmdbId = Number(params.tmdbId);
	const details = await getShowForPage(tmdbId);

	// Reconcile completion against the cached TMDB status (kept fresh by the background sync) --
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
		// Fire and forget: the button responds immediately, the show fills in behind it.
		void syncShows([tmdbId]).catch((e) =>
			console.error(`[track] background sync failed for show ${tmdbId}`, e)
		);
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
