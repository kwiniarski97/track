import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { expect, test, type BrowserContext } from '@playwright/test';
import { signIn } from './auth';
import { SESSION_COOKIE_NAME } from './global-setup';

// TEST_USER (seeded by global-setup.ts) plays the "not tracking" user in this spec.
// TRACKER_USER is the second account: it tracks the show and marks an episode watched.
const SHOW_TMDB_ID = 999301;
const SHOW_TITLE = 'Isolation Test Show';
const TRACKER_USER = {
	id: 'e2e-test-user-tracker',
	pocketIdSub: 'e2e-test-sub-tracker',
	email: 'e2e-tracker@example.test',
	name: 'E2E Tracker User'
};
const TRACKER_SESSION_TOKEN = 'e2e-test-session-token-tracker';

function hashToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

test.beforeEach(async () => {
	process.loadEnvFile('.env.e2e');
	const dbPath = path.resolve(process.env.DATABASE_URL!);
	const db = new Database(dbPath);

	db.prepare(
		`INSERT OR IGNORE INTO shows (tmdb_id, title, poster_path, overview, first_air_date, status, updated_at)
		 VALUES (?, ?, NULL, '', NULL, NULL, ?)`
	).run(SHOW_TMDB_ID, SHOW_TITLE, Date.now());

	db.prepare(
		`INSERT OR IGNORE INTO users (id, pocket_id_sub, email, name, locale, created_at) VALUES (?, ?, ?, ?, 'en', ?)`
	).run(
		TRACKER_USER.id,
		TRACKER_USER.pocketIdSub,
		TRACKER_USER.email,
		TRACKER_USER.name,
		Date.now()
	);
	db.prepare(`INSERT OR IGNORE INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`).run(
		hashToken(TRACKER_SESSION_TOKEN),
		TRACKER_USER.id,
		Date.now() + 1000 * 60 * 60 * 24 * 30
	);

	// TRACKER_USER tracks the show; TEST_USER has no user_tracking/user_watches row for it at all.
	db.prepare(
		`INSERT OR IGNORE INTO user_tracking (user_id, media_type, tmdb_id, status, created_at)
		 VALUES (?, 'tv', ?, 'watching', ?)`
	).run(TRACKER_USER.id, SHOW_TMDB_ID, Date.now());

	db.close();
});

/** Mirrors signIn() in ./auth but for the second seeded user, since that helper only
 * knows about the single TEST_USER session global-setup.ts seeds. */
async function signInAsTracker(context: BrowserContext, baseURL: string): Promise<void> {
	const url = new URL(baseURL);
	const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
	await context.addCookies([
		{
			name: SESSION_COOKIE_NAME,
			value: TRACKER_SESSION_TOKEN,
			domain: url.hostname,
			path: '/',
			httpOnly: true,
			secure: url.protocol === 'https:',
			expires
		},
		{
			name: 'PARAGLIDE_LOCALE',
			value: 'en',
			domain: url.hostname,
			path: '/',
			httpOnly: false,
			secure: url.protocol === 'https:',
			expires
		}
	]);
}

test("a show only tracked and watched by one user does not appear in another user's recently watched", async ({
	browser,
	context,
	baseURL
}) => {
	// TRACKER_USER marks season 1 episode 1 watched via the real API, same as the UI would.
	const trackerContext = await browser.newContext();
	await signInAsTracker(trackerContext, baseURL!);
	const trackerPage = await trackerContext.newPage();

	const watchResponse = await trackerPage.request.post('/api/watch', {
		data: {
			mediaType: 'tv',
			tmdbId: SHOW_TMDB_ID,
			seasonNumber: 1,
			episodeNumber: 1,
			watched: true
		}
	});
	expect(watchResponse.ok()).toBe(true);

	// Sanity check: it does show up in the tracker's own recently watched.
	await trackerPage.goto('/');
	await expect(trackerPage.getByRole('heading', { name: 'Recently watched' })).toBeVisible();
	await expect(trackerPage.getByText(SHOW_TITLE).first()).toBeVisible();
	await trackerContext.close();

	// TEST_USER never tracked or watched this show -- it must not appear anywhere on
	// their home page, recently watched or otherwise.
	await signIn(context, baseURL!);
	const page = await context.newPage();
	await page.goto('/');
	await expect(page.getByText(SHOW_TITLE)).toHaveCount(0);
});
