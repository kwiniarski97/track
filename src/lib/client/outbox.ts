import {
	NO_EPISODE,
	addOutboxMutation,
	getOutboxMutations,
	removeOutboxMutation,
	type MediaType,
	type OutboxMutation
} from './db';

export interface QueueWatchInput {
	mediaType: MediaType;
	tmdbId: number;
	seasonNumber?: number;
	episodeNumber?: number;
	watched: boolean;
}

export async function queueWatch(input: QueueWatchInput): Promise<void> {
	const mutation: OutboxMutation = {
		clientMutationId: crypto.randomUUID(),
		mediaType: input.mediaType,
		tmdbId: input.tmdbId,
		seasonNumber: input.seasonNumber ?? NO_EPISODE,
		episodeNumber: input.episodeNumber ?? NO_EPISODE,
		watched: input.watched,
		createdAt: Date.now()
	};
	await addOutboxMutation(mutation);
	void drainOutbox();
}

let draining = false;

/** Sends queued mutations to the server in order, oldest first. Stops at the first
 * failure (offline or server error) so it can retry the same mutation next time
 * rather than skip ahead and apply things out of order. */
export async function drainOutbox(): Promise<void> {
	if (draining || !navigator.onLine) return;
	draining = true;
	try {
		const mutations = (await getOutboxMutations()).sort((a, b) => a.createdAt - b.createdAt);
		for (const mutation of mutations) {
			try {
				const response = await fetch('/api/watch', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(mutation)
				});
				if (!response.ok) break;
				await removeOutboxMutation(mutation.clientMutationId);
			} catch {
				break;
			}
		}
	} finally {
		draining = false;
	}
}
