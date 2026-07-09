import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	NO_EPISODE,
	jellyfinLibraryItems,
	jellyfinLinks,
	userWatches
} from '$lib/server/db/schema';
import { getLibraryTmdbIds, getPlayedItems } from '$lib/server/jellyfin';
import { syncShowCompletion } from '$lib/server/media';

export async function syncJellyfin(userId: string): Promise<void> {
	const [link] = await db.select().from(jellyfinLinks).where(eq(jellyfinLinks.userId, userId));
	if (!link) return;

	const playedItems = await getPlayedItems(link.jellyfinUserId);
	if (playedItems.length > 0) {
		const rows = playedItems.map((item) => ({
			userId,
			mediaType: item.mediaType,
			tmdbId: item.tmdbId,
			seasonNumber: item.seasonNumber ?? NO_EPISODE,
			episodeNumber: item.episodeNumber ?? NO_EPISODE,
			source: 'jellyfin' as const
		}));
		// Chunked so a large watch history stays under SQLite's bound-parameter limit
		// (each row binds several parameters; one giant multi-row insert would throw).
		for (let i = 0; i < rows.length; i += 500) {
			await db
				.insert(userWatches)
				.values(rows.slice(i, i + 500))
				// Leaves an existing row (manual or earlier import) untouched -- Jellyfin
				// reporting the same episode later should never clobber or duplicate it.
				.onConflictDoNothing();
		}

		const showTmdbIds = new Set(
			playedItems.filter((item) => item.mediaType === 'tv').map((item) => item.tmdbId)
		);
		for (const tmdbId of showTmdbIds) {
			await syncShowCompletion(userId, tmdbId);
		}
	}

	const libraryItems = await getLibraryTmdbIds(link.jellyfinUserId);
	// Rebuilt atomically: without the transaction, a page view (or another user's sync)
	// landing between the delete and the re-insert sees an empty library table, and a
	// failed re-insert would leave it wiped until the next sync.
	db.transaction((tx) => {
		tx.delete(jellyfinLibraryItems).run();
		for (let i = 0; i < libraryItems.length; i += 2000) {
			tx.insert(jellyfinLibraryItems)
				.values(libraryItems.slice(i, i + 2000))
				.onConflictDoNothing()
				.run();
		}
	});
}

export async function syncAllLinkedJellyfinAccounts(): Promise<void> {
	const links = await db.select().from(jellyfinLinks);
	for (const link of links) {
		try {
			await syncJellyfin(link.userId);
		} catch (error) {
			console.error(`[jellyfin] scheduled sync failed for user ${link.userId}`, error);
		}
	}
}
