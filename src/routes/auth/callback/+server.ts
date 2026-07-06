import { error, redirect } from '@sveltejs/kit';
import {
	OAUTH_CODE_VERIFIER_COOKIE_NAME,
	OAUTH_STATE_COOKIE_NAME,
	SESSION_COOKIE_NAME,
	createSession,
	generateSessionToken,
	upsertUserFromPocketId,
	validatePocketIdCallback
} from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get(OAUTH_STATE_COOKIE_NAME);
	const codeVerifier = cookies.get(OAUTH_CODE_VERIFIER_COOKIE_NAME);

	cookies.delete(OAUTH_STATE_COOKIE_NAME, { path: '/' });
	cookies.delete(OAUTH_CODE_VERIFIER_COOKIE_NAME, { path: '/' });

	if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
		error(400, 'Invalid login callback');
	}

	const claims = await validatePocketIdCallback(code, codeVerifier);
	const user = await upsertUserFromPocketId(claims);

	const token = generateSessionToken();
	const session = await createSession(token, user.id);

	cookies.set(SESSION_COOKIE_NAME, token, {
		path: '/',
		httpOnly: true,
		secure: import.meta.env.PROD,
		sameSite: 'lax',
		expires: session.expiresAt
	});

	redirect(302, '/');
};
