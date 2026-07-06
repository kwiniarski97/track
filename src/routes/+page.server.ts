import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { movies, shows, userTracking, type TrackingStatus } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export interface TrackedItem {
	mediaType: 'tv' | 'movie';
	tmdbId: number;
	title: string;
	posterPath: string | null;
}

const SECTION_STATUSES: TrackingStatus[] = ['watching', 'plan_to_watch'];

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;

	const tracking = await db
		.select()
		.from(userTracking)
		.where(and(eq(userTracking.userId, userId), inArray(userTracking.status, SECTION_STATUSES)))
		.orderBy(desc(userTracking.createdAt));

	const showIds = tracking.filter((t) => t.mediaType === 'tv').map((t) => t.tmdbId);
	const movieIds = tracking.filter((t) => t.mediaType === 'movie').map((t) => t.tmdbId);

	const showRows = showIds.length
		? await db.select().from(shows).where(inArray(shows.tmdbId, showIds))
		: [];
	const movieRows = movieIds.length
		? await db.select().from(movies).where(inArray(movies.tmdbId, movieIds))
		: [];

	const showById = new Map(showRows.map((s) => [s.tmdbId, s]));
	const movieById = new Map(movieRows.map((mv) => [mv.tmdbId, mv]));

	function toItem(t: (typeof tracking)[number]): TrackedItem | null {
		if (t.mediaType === 'tv') {
			const show = showById.get(t.tmdbId);
			return show
				? { mediaType: 'tv', tmdbId: t.tmdbId, title: show.title, posterPath: show.posterPath }
				: null;
		}
		const movie = movieById.get(t.tmdbId);
		return movie
			? { mediaType: 'movie', tmdbId: t.tmdbId, title: movie.title, posterPath: movie.posterPath }
			: null;
	}

	const isTrackedItem = (item: TrackedItem | null): item is TrackedItem => item !== null;

	return {
		watching: tracking
			.filter((t) => t.status === 'watching')
			.map(toItem)
			.filter(isTrackedItem),
		planToWatch: tracking
			.filter((t) => t.status === 'plan_to_watch')
			.map(toItem)
			.filter(isTrackedItem)
	};
};
