import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarEntries, movies, shows, userTracking, users } from '$lib/server/db/schema';
import { refreshCalendarCache } from './refreshCalendar';

const UPCOMING_SHOW_ID = 999101;
const PAST_SHOW_ID = 999102;
const DROPPED_SHOW_ID = 999103;
const UPCOMING_MOVIE_ID = 999104;
const PAST_MOVIE_ID = 999105;

const FUTURE_DATE = '2999-01-01';
const PAST_DATE = '2000-01-01';

describe('refreshCalendarCache', () => {
	let userId: string;
	let otherUserId: string;

	beforeEach(async () => {
		const [user] = await db
			.insert(users)
			.values({ pocketIdSub: crypto.randomUUID(), email: 'test@example.com', name: 'Test User' })
			.returning();
		userId = user.id;
		const [otherUser] = await db
			.insert(users)
			.values({ pocketIdSub: crypto.randomUUID(), email: 'other@example.com', name: 'Other User' })
			.returning();
		otherUserId = otherUser.id;

		await db
			.insert(shows)
			.values([
				{
					tmdbId: UPCOMING_SHOW_ID,
					title: 'Upcoming Show',
					nextEpisodeAirDate: FUTURE_DATE,
					nextEpisodeSeasonNumber: 2,
					nextEpisodeNumber: 3,
					nextEpisodeName: 'The Return'
				},
				{ tmdbId: PAST_SHOW_ID, title: 'Past Show', nextEpisodeAirDate: PAST_DATE },
				{ tmdbId: DROPPED_SHOW_ID, title: 'Dropped Show', nextEpisodeAirDate: FUTURE_DATE }
			])
			.onConflictDoNothing();

		await db
			.insert(movies)
			.values([
				{ tmdbId: UPCOMING_MOVIE_ID, title: 'Upcoming Movie', releaseDate: FUTURE_DATE },
				{ tmdbId: PAST_MOVIE_ID, title: 'Past Movie', releaseDate: PAST_DATE }
			])
			.onConflictDoNothing();

		await db.insert(userTracking).values([
			{ userId, mediaType: 'tv', tmdbId: UPCOMING_SHOW_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: PAST_SHOW_ID, status: 'watching' },
			{ userId, mediaType: 'tv', tmdbId: DROPPED_SHOW_ID, status: 'dropped' },
			{ userId, mediaType: 'movie', tmdbId: UPCOMING_MOVIE_ID, status: 'plan_to_watch' },
			{ userId, mediaType: 'movie', tmdbId: PAST_MOVIE_ID, status: 'plan_to_watch' }
		]);
	});

	afterEach(async () => {
		await db.delete(calendarEntries).where(eq(calendarEntries.userId, userId));
		await db.delete(calendarEntries).where(eq(calendarEntries.userId, otherUserId));
		await db.delete(userTracking).where(eq(userTracking.userId, userId));
		await db.delete(users).where(eq(users.id, userId));
		await db.delete(users).where(eq(users.id, otherUserId));
	});

	it('caches only upcoming entries for actively-tracked shows/movies', async () => {
		await refreshCalendarCache(userId);

		const entries = await db
			.select()
			.from(calendarEntries)
			.where(eq(calendarEntries.userId, userId));

		expect(entries.map((e) => e.tmdbId).sort()).toEqual(
			[UPCOMING_SHOW_ID, UPCOMING_MOVIE_ID].sort()
		);
		const show = entries.find((e) => e.tmdbId === UPCOMING_SHOW_ID)!;
		expect(show.seasonNumber).toBe(2);
		expect(show.episodeNumber).toBe(3);
		expect(show.episodeName).toBe('The Return');
	});

	it('only touches the requested user, leaving others untouched', async () => {
		await db.insert(userTracking).values({
			userId: otherUserId,
			mediaType: 'tv',
			tmdbId: UPCOMING_SHOW_ID,
			status: 'watching'
		});

		await refreshCalendarCache(userId);

		const otherEntries = await db
			.select()
			.from(calendarEntries)
			.where(eq(calendarEntries.userId, otherUserId));
		expect(otherEntries).toEqual([]);

		await db.delete(userTracking).where(eq(userTracking.userId, otherUserId));
	});

	it('clears stale entries on re-run', async () => {
		await refreshCalendarCache(userId);
		await db
			.update(userTracking)
			.set({ status: 'dropped' })
			.where(eq(userTracking.tmdbId, UPCOMING_SHOW_ID));

		await refreshCalendarCache(userId);

		const entries = await db
			.select()
			.from(calendarEntries)
			.where(eq(calendarEntries.userId, userId));
		expect(entries.map((e) => e.tmdbId)).toEqual([UPCOMING_MOVIE_ID]);
	});
});
