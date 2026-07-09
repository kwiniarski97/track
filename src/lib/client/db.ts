import { openDB, type IDBPDatabase } from 'idb';

// Mirrors src/lib/server/db/schema.ts -- duplicated here since server modules can't be
// imported into the client bundle.
export type MediaType = 'tv' | 'movie';
export const NO_EPISODE = -1;

export interface OutboxMutation {
	clientMutationId: string;
	mediaType: MediaType;
	tmdbId: number;
	seasonNumber: number;
	episodeNumber: number;
	watched: boolean;
	createdAt: number;
}

interface WatchedDBSchema {
	outbox: OutboxMutation;
}

let dbPromise: Promise<IDBPDatabase<WatchedDBSchema>> | null = null;

function getDb() {
	if (!dbPromise) {
		dbPromise = openDB<WatchedDBSchema>('watched-app', 1, {
			upgrade(db) {
				db.createObjectStore('outbox', { keyPath: 'clientMutationId' });
			}
		});
	}
	return dbPromise;
}

export async function addOutboxMutation(mutation: OutboxMutation): Promise<void> {
	const db = await getDb();
	await db.put('outbox', mutation);
}

export async function removeOutboxMutation(clientMutationId: string): Promise<void> {
	const db = await getDb();
	await db.delete('outbox', clientMutationId);
}

export async function getOutboxMutations(): Promise<OutboxMutation[]> {
	const db = await getDb();
	return db.getAll('outbox');
}

export function watchIdentity(
	m: Pick<OutboxMutation, 'mediaType' | 'tmdbId' | 'seasonNumber' | 'episodeNumber'>
): string {
	return `${m.mediaType}:${m.tmdbId}:${m.seasonNumber}:${m.episodeNumber}`;
}

/** Last-write-wins queued mutation for this identity, or null if nothing is pending. */
export async function getPendingWatchOverride(
	mediaType: MediaType,
	tmdbId: number,
	seasonNumber: number,
	episodeNumber: number
): Promise<boolean | null> {
	const identity = watchIdentity({ mediaType, tmdbId, seasonNumber, episodeNumber });
	const mutations = (await getOutboxMutations())
		.filter((m) => watchIdentity(m) === identity)
		.sort((a, b) => a.createdAt - b.createdAt);
	return mutations.length > 0 ? mutations[mutations.length - 1].watched : null;
}

/**
 * Last-write-wins queued mutations for every identity under one show/movie, keyed by
 * watchIdentity. One getAll('outbox') instead of one per episode -- a 200-episode show
 * would otherwise re-read the entire outbox 200 times on mount.
 */
export async function getPendingWatchOverrides(
	mediaType: MediaType,
	tmdbId: number
): Promise<Map<string, boolean>> {
	const overrides = new Map<string, boolean>();
	const mutations = (await getOutboxMutations())
		.filter((m) => m.mediaType === mediaType && m.tmdbId === tmdbId)
		.sort((a, b) => a.createdAt - b.createdAt);
	// Ascending order means later writes overwrite earlier map entries -- same
	// last-write-wins rule as getPendingWatchOverride.
	for (const m of mutations) overrides.set(watchIdentity(m), m.watched);
	return overrides;
}
