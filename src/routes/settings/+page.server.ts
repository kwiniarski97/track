import { eq } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { appLocales, users, type AppLocale } from '$lib/server/db/schema';
import { PARAGLIDE_LOCALE_COOKIE } from '$lib/server/locale';
import { cookieMaxAge } from '$lib/paraglide/runtime';
import type { Actions, PageServerLoad } from './$types';

function isAppLocale(value: string): value is AppLocale {
	return (appLocales as readonly string[]).includes(value);
}

export const load: PageServerLoad = async ({ locals }) => {
	return { locale: locals.user!.locale };
};

export const actions: Actions = {
	updateLocale: async ({ request, locals, cookies }) => {
		const formData = await request.formData();
		const locale = formData.get('locale');
		if (typeof locale !== 'string' || !isAppLocale(locale)) {
			return fail(400, { error: 'Invalid locale.' });
		}

		await db.update(users).set({ locale }).where(eq(users.id, locals.user!.id));

		// hooks.server.ts derives the active locale fresh from the DB on every request for
		// logged-in users, so this cookie isn't needed for SSR rendering -- but Paraglide's
		// own `setLocale()` is client-only and this action never runs in the browser, so
		// without setting it here the browser's actual PARAGLIDE_LOCALE cookie would stay
		// stale forever (only ever matching the DB by coincidence).
		//
		// httpOnly must be false: Paraglide's client runtime reads this cookie straight off
		// `document.cookie` (see runtime.js's cookie strategy) to resolve the locale during
		// hydration and client-side navigation. SvelteKit's `cookies.set()` defaults to
		// httpOnly, which the server can still read fine -- masking the problem in SSR output
		// -- but leaves client-side JS blind to it, so it falls through to the base locale
		// the instant the client takes over (visible as a flash back to Polish right as the
		// page hydrates / Vite's HMR client reports "connected").
		cookies.set(PARAGLIDE_LOCALE_COOKIE, locale, {
			path: '/',
			maxAge: cookieMaxAge,
			httpOnly: false
		});

		redirect(303, '/settings');
	}
};
