import { and, eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { NO_EPISODE, userWatches, type MediaType } from '$lib/server/db/schema';
import { syncShowCompletion } from '$lib/server/media';
import type { RequestHandler } from './$types';

interface WatchRequestBody {
	mediaType: MediaType;
	tmdbId: number;
	seasonNumber?: number;
	episodeNumber?: number;
	watched: boolean;
	clientMutationId?: string;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = (await request.json()) as WatchRequestBody;
	const seasonNumber = body.seasonNumber ?? NO_EPISODE;
	const episodeNumber = body.episodeNumber ?? NO_EPISODE;

	const identity = and(
		eq(userWatches.userId, locals.user.id),
		eq(userWatches.mediaType, body.mediaType),
		eq(userWatches.tmdbId, body.tmdbId),
		eq(userWatches.seasonNumber, seasonNumber),
		eq(userWatches.episodeNumber, episodeNumber)
	);

	if (!body.watched) {
		await db.delete(userWatches).where(identity);
		if (body.mediaType === 'tv') await syncShowCompletion(locals.user.id, body.tmdbId);
		return json({ ok: true });
	}

	await db
		.insert(userWatches)
		.values({
			userId: locals.user.id,
			mediaType: body.mediaType,
			tmdbId: body.tmdbId,
			seasonNumber,
			episodeNumber,
			source: 'manual',
			clientMutationId: body.clientMutationId
		})
		.onConflictDoUpdate({
			target: [
				userWatches.userId,
				userWatches.mediaType,
				userWatches.tmdbId,
				userWatches.seasonNumber,
				userWatches.episodeNumber
			],
			set: { watchedAt: new Date(), source: 'manual' }
		});

	if (body.mediaType === 'tv') await syncShowCompletion(locals.user.id, body.tmdbId);

	return json({ ok: true });
};
