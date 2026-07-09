import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { NO_EPISODE, jellyfinLibraryItems, userTracking, userWatches } from '$lib/server/db/schema';
import { getMovieCachedOrRefresh } from '$lib/server/media';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const tmdbId = Number(params.tmdbId);
	const details = await getMovieCachedOrRefresh(tmdbId);

	const [tracking] = await db
		.select()
		.from(userTracking)
		.where(
			and(
				eq(userTracking.userId, locals.user!.id),
				eq(userTracking.mediaType, 'movie'),
				eq(userTracking.tmdbId, tmdbId)
			)
		);

	const [watch] = await db
		.select()
		.from(userWatches)
		.where(
			and(
				eq(userWatches.userId, locals.user!.id),
				eq(userWatches.mediaType, 'movie'),
				eq(userWatches.tmdbId, tmdbId),
				eq(userWatches.seasonNumber, NO_EPISODE),
				eq(userWatches.episodeNumber, NO_EPISODE)
			)
		);

	const [libraryEntry] = await db
		.select()
		.from(jellyfinLibraryItems)
		.where(
			and(eq(jellyfinLibraryItems.mediaType, 'movie'), eq(jellyfinLibraryItems.tmdbId, tmdbId))
		);

	return {
		movie: details,
		trackingStatus: tracking?.status ?? null,
		watched: !!watch,
		inJellyfinLibrary: !!libraryEntry
	};
};

export const actions: Actions = {
	track: async ({ locals, params }) => {
		const tmdbId = Number(params.tmdbId);
		await db
			.insert(userTracking)
			.values({ userId: locals.user!.id, mediaType: 'movie', tmdbId, status: 'plan_to_watch' })
			.onConflictDoNothing();
	},
	untrack: async ({ locals, params }) => {
		const tmdbId = Number(params.tmdbId);
		await db
			.delete(userTracking)
			.where(
				and(
					eq(userTracking.userId, locals.user!.id),
					eq(userTracking.mediaType, 'movie'),
					eq(userTracking.tmdbId, tmdbId)
				)
			);
	}
};
