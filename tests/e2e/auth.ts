import type { BrowserContext } from '@playwright/test';
import { SESSION_COOKIE_NAME, TEST_SESSION_TOKEN } from './global-setup';

// Mirrors src/lib/server/locale.ts's PARAGLIDE_LOCALE_COOKIE name.
const PARAGLIDE_LOCALE_COOKIE = 'PARAGLIDE_LOCALE';

/** Attaches the session cookie seeded by global-setup.ts, signing the browser context
 * in without driving the real Pocket ID OAuth redirect. Call before the first
 * page.goto() -- SvelteKit's handleAuth hook reads the cookie on every request and
 * redirects to /login when it's missing or invalid.
 *
 * Also sets the Paraglide locale cookie to match the seeded user's `en` DB locale.
 * hooks.server.ts only forces that locale into the *server-rendered* response by
 * rewriting the request it reads -- it never Set-Cookie's it back, so the browser's
 * real cookie jar (what client-side hydration reads) stays empty unless the user has
 * saved a language once on the Settings page. Without this, hydration falls through to
 * Paraglide's `pl` base locale and every client-rendered string (including this
 * component's, since it only appears after a client-side event) flips to Polish. */
export async function signIn(context: BrowserContext, baseURL: string): Promise<void> {
	const url = new URL(baseURL);
	const secure = url.protocol === 'https:';
	const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
	await context.addCookies([
		{
			name: SESSION_COOKIE_NAME,
			value: TEST_SESSION_TOKEN,
			domain: url.hostname,
			path: '/',
			httpOnly: true,
			secure,
			expires
		},
		{
			name: PARAGLIDE_LOCALE_COOKIE,
			value: 'en',
			domain: url.hostname,
			path: '/',
			httpOnly: false,
			secure,
			expires
		}
	]);
}
