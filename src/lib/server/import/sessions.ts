import type { TmdbCandidate } from './matching';

export interface PendingImportShow {
	showName: string;
	confidence: 'auto' | 'ambiguous' | 'none';
	tmdbId: number | null;
	candidates: TmdbCandidate[];
	episodes: Array<{ seasonNumber: number; episodeNumber: number; watchedAt: Date }>;
}

interface ImportSession {
	id: string;
	userId: string;
	createdAt: number;
	shows: PendingImportShow[];
}

// Single-process, in-memory by design (matches this app's single-container deployment,
// see docker-compose.yml) -- a self-hosted personal app doesn't need a durable job queue
// for a one-off review-then-confirm flow that completes in one sitting.
const SESSION_TTL_MS = 30 * 60 * 1000;
const sessions = new Map<string, ImportSession>();

export function createImportSession(userId: string, shows: PendingImportShow[]): string {
	const id = crypto.randomUUID();
	sessions.set(id, { id, userId, createdAt: Date.now(), shows });
	return id;
}

export function getImportSession(id: string, userId: string): ImportSession | null {
	const session = sessions.get(id);
	if (!session || session.userId !== userId) return null;
	if (Date.now() - session.createdAt > SESSION_TTL_MS) {
		sessions.delete(id);
		return null;
	}
	return session;
}

export function deleteImportSession(id: string): void {
	sessions.delete(id);
}
