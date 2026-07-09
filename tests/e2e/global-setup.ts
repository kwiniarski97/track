import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// Mirrors src/lib/server/auth.ts's SESSION_COOKIE_NAME/hashToken -- duplicated rather
// than imported because that module pulls in `$env/dynamic/private` and `./db`
// (SvelteKit virtual modules only resolvable inside the Vite/SvelteKit runtime), which
// this plain Node script run by Playwright's globalSetup is not.
export const SESSION_COOKIE_NAME = 'session';
export const TEST_SESSION_TOKEN = 'e2e-test-session-token';
export const TEST_USER = {
	id: 'e2e-test-user',
	pocketIdSub: 'e2e-test-sub',
	email: 'e2e@example.test',
	name: 'E2E Test User'
};

function hashToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

/** Recreates a throwaway sqlite db (same approach as tests/global-setup.ts for Vitest)
 * and seeds one user with an already-valid session, so specs can sign in by just
 * attaching a cookie instead of driving the real Pocket ID OAuth redirect. */
export default function globalSetup() {
	process.loadEnvFile('.env.e2e');
	const dbPath = path.resolve(process.env.DATABASE_URL!);

	mkdirSync(path.dirname(dbPath), { recursive: true });
	if (existsSync(dbPath)) rmSync(dbPath);

	try {
		execSync('npx drizzle-kit migrate', { env: process.env, stdio: 'pipe' });
	} catch (error) {
		console.error((error as { stdout?: Buffer }).stdout?.toString());
		throw error;
	}

	const db = new Database(dbPath);
	db.prepare(
		`INSERT INTO users (id, pocket_id_sub, email, name, locale, created_at) VALUES (?, ?, ?, ?, 'en', ?)`
	).run(TEST_USER.id, TEST_USER.pocketIdSub, TEST_USER.email, TEST_USER.name, Date.now());
	db.prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`).run(
		hashToken(TEST_SESSION_TOKEN),
		TEST_USER.id,
		Date.now() + 1000 * 60 * 60 * 24 * 30
	);
	db.close();
}

// Also runnable directly as `node tests/e2e/global-setup.ts` (see playwright.config.ts's
// webServer.command) -- Playwright does not guarantee this globalSetup hook finishes
// before the webServer command's own process starts (its first request lazily opens
// the app's one persistent db connection, e.g. via a readiness probe). If that request
// lands before this rm+recreate below finishes, the server is left permanently attached
// to the now-deleted file for its whole lifetime, and every session lookup fails. Running
// this synchronously before `vite dev` even starts, instead of relying on globalSetup's
// timing relative to webServer, closes that race.
if (path.resolve(process.argv[1] ?? '') === path.resolve(new URL(import.meta.url).pathname)) {
	globalSetup();
}
