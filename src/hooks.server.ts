import { Cron } from 'croner';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { SESSION_COOKIE_NAME, validateSessionToken } from '$lib/server/auth';
import { refreshTrackedMetadata } from '$lib/server/jobs/refreshMetadata';
import { syncAllLinkedJellyfinAccounts } from '$lib/server/jobs/syncJellyfin';
import { PARAGLIDE_LOCALE_COOKIE } from '$lib/server/locale';

const PUBLIC_ROUTES = ['/login', '/auth/callback'];

// Module scope: runs once per server process start, not per-request.
new Cron('0 3 * * *', () => {
	refreshTrackedMetadata().catch((error) => {
		console.error('[refreshMetadata] scheduled run failed', error);
	});
});

new Cron('0 * * * *', () => {
	syncAllLinkedJellyfinAccounts().catch((error) => {
		console.error('[syncJellyfin] scheduled run failed', error);
	});
});

const handleAuth: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE_NAME);
	const { session, user } = token
		? await validateSessionToken(token)
		: { session: null, user: null };

	event.locals.session = session;
	event.locals.user = user;

	if (!user && !PUBLIC_ROUTES.includes(event.url.pathname)) {
		redirect(302, '/login');
	}

	return resolve(event);
};

/** Forces Paraglide's "cookie" strategy to see the logged-in user's DB locale preference
 * for this request, regardless of what cookie the browser actually sent. This is
 * necessary (not just a nicety): `event.cookies.set()` only affects the *outgoing*
 * response, never the `event.request` this middleware reads from, so relying on a
 * mirrored cookie means every request where the locale just changed (first login right
 * after the DB row is created, or right after the settings page updates it) would
 * render with the previous/default locale -- a confusing one-request lag. Rewriting the
 * request's Cookie header here makes the DB the single source of truth with no lag. */
function withUserLocaleCookie(request: Request, locale: string): Request {
	const headers = new Headers(request.headers);
	const remaining = (headers.get('cookie') ?? '')
		.split(';')
		.map((c) => c.trim())
		.filter((c) => c && !c.startsWith(`${PARAGLIDE_LOCALE_COOKIE}=`));
	headers.set('cookie', [`${PARAGLIDE_LOCALE_COOKIE}=${locale}`, ...remaining].join('; '));
	return new Request(request, { headers });
}

const handleParaglide: Handle = ({ event, resolve }) => {
	const request = event.locals.user
		? withUserLocaleCookie(event.request, event.locals.user.locale)
		: event.request;

	return paraglideMiddleware(request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html
					.replace('%paraglide.lang%', locale)
					.replace('%paraglide.dir%', getTextDirection(locale))
		});
	});
};

export const handle: Handle = sequence(handleAuth, handleParaglide);
