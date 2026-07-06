import { eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { jellyfinLinks } from '$lib/server/db/schema';
import { m } from '$lib/paraglide/messages';
import { listJellyfinUsers } from '$lib/server/jellyfin';
import { syncJellyfin } from '$lib/server/jobs/syncJellyfin';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const [link] = await db
		.select()
		.from(jellyfinLinks)
		.where(eq(jellyfinLinks.userId, locals.user!.id));

	let jellyfinUsers: Array<{ id: string; name: string }> = [];
	let listError: string | null = null;
	try {
		jellyfinUsers = await listJellyfinUsers();
	} catch (error) {
		console.error('[jellyfin] failed to list users', error);
		listError = m.jellyfin_list_error();
	}

	return { linkedJellyfinUserId: link?.jellyfinUserId ?? null, jellyfinUsers, listError };
};

export const actions: Actions = {
	link: async ({ request, locals }) => {
		const formData = await request.formData();
		const jellyfinUserId = formData.get('jellyfinUserId');
		if (typeof jellyfinUserId !== 'string' || !jellyfinUserId) {
			return fail(400, { error: m.jellyfin_select_error() });
		}

		await db
			.insert(jellyfinLinks)
			.values({ userId: locals.user!.id, jellyfinUserId })
			.onConflictDoUpdate({ target: jellyfinLinks.userId, set: { jellyfinUserId } });

		return { linked: true as const };
	},

	unlink: async ({ locals }) => {
		await db.delete(jellyfinLinks).where(eq(jellyfinLinks.userId, locals.user!.id));
		return { unlinked: true as const };
	},

	sync: async ({ locals }) => {
		try {
			await syncJellyfin(locals.user!.id);
			return { synced: true as const };
		} catch (error) {
			console.error('[jellyfin] manual sync failed', error);
			return fail(500, { error: m.jellyfin_sync_failed() });
		}
	}
};
