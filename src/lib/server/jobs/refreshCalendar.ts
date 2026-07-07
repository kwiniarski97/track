import { and, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarEntries, movies, shows, userTracking, users } from '$lib/server/db/schema';

const ACTIVE_STATUSES = ['watching', 'plan_to_watch'] as const;

async function activeTmdbIds(userId: string, mediaType: 'tv' | 'movie'): Promise<number[]> {
	const rows = await db
		.select({ tmdbId: userTracking.tmdbId })
		.from(userTracking)
		.where(
			and(
				eq(userTracking.userId, userId),
				eq(userTracking.mediaType, mediaType),
				inArray(userTracking.status, ACTIVE_STATUSES)
			)
		);
	return rows.map((r) => r.tmdbId);
}

async function refreshCalendarCacheForUser(userId: string): Promise<void> {
	const today = new Date().toISOString().slice(0, 10);

	const [showIds, movieIds] = await Promise.all([
		activeTmdbIds(userId, 'tv'),
		activeTmdbIds(userId, 'movie')
	]);

	const showRows = showIds.length
		? await db
				.select()
				.from(shows)
				.where(
					and(
						inArray(shows.tmdbId, showIds),
						isNotNull(shows.nextEpisodeAirDate),
						gte(shows.nextEpisodeAirDate, today)
					)
				)
		: [];

	const movieRows = movieIds.length
		? await db
				.select()
				.from(movies)
				.where(
					and(inArray(movies.tmdbId, movieIds), isNotNull(movies.releaseDate), gte(movies.releaseDate, today))
				)
		: [];

	await db.delete(calendarEntries).where(eq(calendarEntries.userId, userId));

	const rows = [
		...showRows.map((s) => ({
			userId,
			mediaType: 'tv' as const,
			tmdbId: s.tmdbId,
			title: s.title,
			posterPath: s.posterPath,
			date: s.nextEpisodeAirDate!,
			seasonNumber: s.nextEpisodeSeasonNumber,
			episodeNumber: s.nextEpisodeNumber,
			episodeName: s.nextEpisodeName
		})),
		...movieRows.map((movie) => ({
			userId,
			mediaType: 'movie' as const,
			tmdbId: movie.tmdbId,
			title: movie.title,
			posterPath: movie.posterPath,
			date: movie.releaseDate!,
			seasonNumber: null,
			episodeNumber: null,
			episodeName: null
		}))
	];

	if (rows.length > 0) await db.insert(calendarEntries).values(rows);
}

/** Rebuilds the `calendar_entries` cache -- everyone's if `userId` is omitted (the
 * scheduled job), or just one user's. Pure local computation off the already-cached
 * shows/movies tables, no TMDB calls; pair with refreshTrackedMetadata (which is what
 * actually keeps those tables fresh) to get an up-to-date calendar. Failures for one
 * user don't stop the rest. */
export async function refreshCalendarCache(userId?: string): Promise<void> {
	const userIds = userId
		? [userId]
		: (await db.select({ id: users.id }).from(users)).map((u) => u.id);

	for (const uid of userIds) {
		try {
			await refreshCalendarCacheForUser(uid);
		} catch (error) {
			console.error(`[refreshCalendar] failed to refresh calendar for user ${uid}`, error);
		}
	}
}
