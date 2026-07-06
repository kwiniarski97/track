import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { CodeChallengeMethod, OAuth2Client, decodeIdToken } from 'arctic';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { sessions, users, type User } from './db/schema';

export const SESSION_COOKIE_NAME = 'session';
export const OAUTH_STATE_COOKIE_NAME = 'pocket_id_oauth_state';
export const OAUTH_CODE_VERIFIER_COOKIE_NAME = 'pocket_id_oauth_code_verifier';

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const SESSION_RENEWAL_THRESHOLD_MS = SESSION_DURATION_MS / 2;

function hashToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken(): string {
	return crypto.randomBytes(20).toString('base64url');
}

export async function createSession(token: string, userId: string) {
	const session = {
		id: hashToken(token),
		userId,
		expiresAt: new Date(Date.now() + SESSION_DURATION_MS)
	};
	await db.insert(sessions).values(session);
	return session;
}

export async function validateSessionToken(token: string) {
	const sessionId = hashToken(token);
	const [row] = await db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, sessionId));

	if (!row) return { session: null, user: null };

	if (Date.now() >= row.session.expiresAt.getTime()) {
		await db.delete(sessions).where(eq(sessions.id, sessionId));
		return { session: null, user: null };
	}

	if (Date.now() >= row.session.expiresAt.getTime() - SESSION_RENEWAL_THRESHOLD_MS) {
		row.session.expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
		await db
			.update(sessions)
			.set({ expiresAt: row.session.expiresAt })
			.where(eq(sessions.id, sessionId));
	}

	return row;
}

export async function invalidateSession(token: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function upsertUserFromPocketId(claims: {
	sub: string;
	email: string;
	name?: string;
	preferred_username?: string;
}): Promise<User> {
	const [existing] = await db.select().from(users).where(eq(users.pocketIdSub, claims.sub));
	if (existing) return existing;

	const [created] = await db
		.insert(users)
		.values({
			pocketIdSub: claims.sub,
			email: claims.email,
			name: claims.name ?? claims.preferred_username ?? claims.email
		})
		.returning();
	return created;
}

function requireEnv(name: keyof typeof env): string {
	const value = env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
}

type PocketIdEndpoints = { authorizationEndpoint: string; tokenEndpoint: string };
let discoveryCache: PocketIdEndpoints | null = null;

async function getPocketIdEndpoints(): Promise<PocketIdEndpoints> {
	if (discoveryCache) return discoveryCache;

	const response = await fetch(
		`${requireEnv('POCKET_ID_ISSUER')}/.well-known/openid-configuration`
	);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch Pocket ID OIDC discovery document (${response.status} ${response.statusText})`
		);
	}
	const config = (await response.json()) as {
		authorization_endpoint: string;
		token_endpoint: string;
	};
	discoveryCache = {
		authorizationEndpoint: config.authorization_endpoint,
		tokenEndpoint: config.token_endpoint
	};
	return discoveryCache;
}

function getPocketIdClient(): OAuth2Client {
	return new OAuth2Client(
		requireEnv('POCKET_ID_CLIENT_ID'),
		requireEnv('POCKET_ID_CLIENT_SECRET'),
		`${requireEnv('ORIGIN')}/auth/callback`
	);
}

export async function createPocketIdAuthorizationURL(
	state: string,
	codeVerifier: string
): Promise<URL> {
	const { authorizationEndpoint } = await getPocketIdEndpoints();
	return getPocketIdClient().createAuthorizationURLWithPKCE(
		authorizationEndpoint,
		state,
		CodeChallengeMethod.S256,
		codeVerifier,
		['openid', 'profile', 'email']
	);
}

export async function validatePocketIdCallback(code: string, codeVerifier: string) {
	const { tokenEndpoint } = await getPocketIdEndpoints();
	const tokens = await getPocketIdClient().validateAuthorizationCode(
		tokenEndpoint,
		code,
		codeVerifier
	);
	return decodeIdToken(tokens.idToken()) as {
		sub: string;
		email: string;
		name?: string;
		preferred_username?: string;
	};
}
