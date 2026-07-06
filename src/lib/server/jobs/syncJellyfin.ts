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
		await db
			.insert(userWatches)
			.values(
				playedItems.map((item) => ({
					userId,
					mediaType: item.mediaType,
					tmdbId: item.tmdbId,
					seasonNumber: item.seasonNumber ?? NO_EPISODE,
					episodeNumber: item.episodeNumber ?? NO_EPISODE,
					source: 'jellyfin' as const
				}))
			)
			// Leaves an existing row (manual or earlier import) untouched -- Jellyfin
			// reporting the same episode later should never clobber or duplicate it.
			.onConflictDoNothing();

		const showTmdbIds = new Set(
			playedItems.filter((item) => item.mediaType === 'tv').map((item) => item.tmdbId)
		);
		for (const tmdbId of showTmdbIds) {
			await syncShowCompletion(userId, tmdbId);
		}
	}

	const libraryItems = await getLibraryTmdbIds(link.jellyfinUserId);
	await db.delete(jellyfinLibraryItems);
	if (libraryItems.length > 0) {
		await db.insert(jellyfinLibraryItems).values(libraryItems).onConflictDoNothing();
	}
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
