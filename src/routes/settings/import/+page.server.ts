import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { userTracking, userWatches } from '$lib/server/db/schema';
import { m } from '$lib/paraglide/messages';
import { matchShowsToTmdb } from '$lib/server/import/matching';
import {
	createImportSession,
	deleteImportSession,
	getImportSession
} from '$lib/server/import/sessions';
import { parseTvTimeExport } from '$lib/server/import/tvtime';
import { cacheShowSeasons, refreshShow, syncShowCompletion } from '$lib/server/media';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const importId = url.searchParams.get('importId');
	if (!importId) return { review: null };

	const session = getImportSession(importId, locals.user!.id);
	if (!session) return { review: null };

	return {
		review: {
			importId,
			shows: session.shows.map((s) => ({
				showName: s.showName,
				confidence: s.confidence,
				candidates: s.candidates,
				episodeCount: s.episodes.length
			}))
		}
	};
};

export const actions: Actions = {
	upload: async ({ request, locals }) => {
		const formData = await request.formData();
		const file = formData.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: m.import_error_no_file() });
		}

		const buffer = new Uint8Array(await file.arrayBuffer());
		const parsedShows = parseTvTimeExport(buffer);
		if (parsedShows.length === 0) {
			return fail(400, { error: m.import_error_no_data() });
		}

		const matches = await matchShowsToTmdb(parsedShows.map((s) => s.showName));
		const matchByName = new Map(matches.map((match) => [match.showName, match]));

		const pendingShows = parsedShows.map((parsed) => {
			const match = matchByName.get(parsed.showName)!;
			return {
				showName: parsed.showName,
				confidence: match.confidence,
				tmdbId: match.tmdbId,
				candidates: match.candidates,
				episodes: parsed.episodes
			};
		});

		const importId = createImportSession(locals.user!.id, pendingShows);
		redirect(303, `/settings/import?importId=${importId}`);
	},

	confirm: async ({ request, locals }) => {
		const formData = await request.formData();
		const importId = formData.get('importId');
		if (typeof importId !== 'string') return fail(400, { error: 'Missing import session.' });

		const session = getImportSession(importId, locals.user!.id);
		if (!session) {
			return fail(400, { error: m.import_error_expired() });
		}

		let importedShows = 0;
		let importedEpisodes = 0;

		for (const [index, show] of session.shows.entries()) {
			const pick = formData.get(`pick_${index}`);
			const tmdbId =
				show.confidence === 'auto'
					? show.tmdbId
					: typeof pick === 'string' && pick !== 'skip'
						? Number(pick)
						: null;
			if (!tmdbId) continue;

			try {
				const details = await refreshShow(tmdbId);
				await cacheShowSeasons(tmdbId, details);
			} catch (error) {
				console.error(`[tvtime-import] failed to cache show ${tmdbId}`, error);
				continue;
			}

			await db
				.insert(userTracking)
				.values({ userId: locals.user!.id, mediaType: 'tv', tmdbId, status: 'watching' })
				.onConflictDoNothing();

			if (show.episodes.length > 0) {
				await db
					.insert(userWatches)
					.values(
						show.episodes.map((ep) => ({
							userId: locals.user!.id,
							mediaType: 'tv' as const,
							tmdbId,
							seasonNumber: ep.seasonNumber,
							episodeNumber: ep.episodeNumber,
							watchedAt: ep.watchedAt,
							source: 'import' as const
						}))
					)
					.onConflictDoNothing();
			}

			await syncShowCompletion(locals.user!.id, tmdbId);
			importedShows += 1;
			importedEpisodes += show.episodes.length;
		}

		deleteImportSession(importId);
		return { success: true as const, importedShows, importedEpisodes };
	}
};
