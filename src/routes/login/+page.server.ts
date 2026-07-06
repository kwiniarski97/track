import { generateState, generateCodeVerifier } from 'arctic';
import { redirect } from '@sveltejs/kit';
import {
	createPocketIdAuthorizationURL,
	OAUTH_STATE_COOKIE_NAME,
	OAUTH_CODE_VERIFIER_COOKIE_NAME
} from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(302, '/');
};

export const actions: Actions = {
	default: async ({ cookies }) => {
		const state = generateState();
		const codeVerifier = generateCodeVerifier();
		const url = await createPocketIdAuthorizationURL(state, codeVerifier);

		const cookieOptions = {
			path: '/',
			httpOnly: true,
			secure: import.meta.env.PROD,
			sameSite: 'lax' as const,
			maxAge: 60 * 10
		};
		cookies.set(OAUTH_STATE_COOKIE_NAME, state, cookieOptions);
		cookies.set(OAUTH_CODE_VERIFIER_COOKIE_NAME, codeVerifier, cookieOptions);

		redirect(302, url.toString());
	}
};
