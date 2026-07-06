import { and, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { movies, shows, userTracking } from '$lib/server/db/schema';
import { refreshTrackedMetadata } from '$lib/server/jobs/refreshMetadata';
import { m } from '$lib/paraglide/messages';
import type { PageServerLoad } from './$types';

const ACTIVE_STATUSES = ['watching', 'plan_to_watch'] as const;

export interface CalendarEntry {
	mediaType: 'tv' | 'movie';
	tmdbId: number;
	title: string;
	posterPath: string | null;
	date: string;
	detail: string;
}

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;

	// Opportunistic refresh so a first-time visit doesn't wait for the nightly job.
	await refreshTrackedMetadata(userId);

	const today = new Date().toISOString().slice(0, 10);

	const trackedShowIds = (
		await db
			.select({ tmdbId: userTracking.tmdbId })
			.from(userTracking)
			.where(
				and(
					eq(userTracking.userId, userId),
					eq(userTracking.mediaType, 'tv'),
					inArray(userTracking.status, ACTIVE_STATUSES)
				)
			)
	).map((r) => r.tmdbId);

	const trackedMovieIds = (
		await db
			.select({ tmdbId: userTracking.tmdbId })
			.from(userTracking)
			.where(
				and(
					eq(userTracking.userId, userId),
					eq(userTracking.mediaType, 'movie'),
					inArray(userTracking.status, ACTIVE_STATUSES)
				)
			)
	).map((r) => r.tmdbId);

	const showRows = trackedShowIds.length
		? await db
				.select()
				.from(shows)
				.where(
					and(
						inArray(shows.tmdbId, trackedShowIds),
						isNotNull(shows.nextEpisodeAirDate),
						gte(shows.nextEpisodeAirDate, today)
					)
				)
		: [];

	const movieRows = trackedMovieIds.length
		? await db
				.select()
				.from(movies)
				.where(
					and(
						inArray(movies.tmdbId, trackedMovieIds),
						isNotNull(movies.releaseDate),
						gte(movies.releaseDate, today)
					)
				)
		: [];

	const entries: CalendarEntry[] = [
		...showRows.map((s) => ({
			mediaType: 'tv' as const,
			tmdbId: s.tmdbId,
			title: s.title,
			posterPath: s.posterPath,
			date: s.nextEpisodeAirDate!,
			detail: `S${s.nextEpisodeSeasonNumber}E${s.nextEpisodeNumber} — ${s.nextEpisodeName}`
		})),
		...movieRows.map((movie) => ({
			mediaType: 'movie' as const,
			tmdbId: movie.tmdbId,
			title: movie.title,
			posterPath: movie.posterPath,
			date: movie.releaseDate!,
			detail: m.calendar_release_label()
		}))
	].sort((a, b) => a.date.localeCompare(b.date));

	return { entries };
};
