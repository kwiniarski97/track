import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE_NAME, invalidateSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE_NAME);
	if (token) await invalidateSession(token);
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
	redirect(302, '/login');
};
