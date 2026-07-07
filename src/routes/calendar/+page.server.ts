import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarEntries } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export interface CalendarEntry {
	mediaType: 'tv' | 'movie';
	tmdbId: number;
	title: string;
	posterPath: string | null;
	date: string;
	seasonNumber: number | null;
	episodeNumber: number | null;
	episodeName: string | null;
}

export const load: PageServerLoad = async ({ locals }) => {
	// Reads the calendar_entries cache directly -- refreshCalendarCache (run twice daily
	// by the scheduled job in hooks.server.ts) is what keeps it up to date, so there's no
	// per-request TMDB call or live join here.
	const entries: CalendarEntry[] = await db
		.select()
		.from(calendarEntries)
		.where(eq(calendarEntries.userId, locals.user!.id))
		.orderBy(asc(calendarEntries.date));

	return { entries };
};
