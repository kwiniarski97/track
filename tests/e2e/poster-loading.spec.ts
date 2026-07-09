import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import { signIn } from './auth';
import { TEST_USER } from './global-setup';

const MOVIE_TMDB_ID = 999001;
const MOVIE_HREF = `/movie/${MOVIE_TMDB_ID}`;

// Seeded with posterPath: null so the card renders its plain-text fallback rather than
// a remote TMDB image -- keeps the visual snapshot deterministic without needing real
// TMDB data (the e2e env's TMDB_API_KEY is a placeholder, see .env.e2e).
test.beforeEach(async ({ context, baseURL }) => {
	process.loadEnvFile('.env.e2e');
	const dbPath = path.resolve(process.env.DATABASE_URL!);
	const db = new Database(dbPath);
	db.prepare(
		`INSERT OR IGNORE INTO movies (tmdb_id, title, poster_path, overview, release_date, runtime, updated_at)
		 VALUES (?, 'Shimmer Test Movie', NULL, '', NULL, NULL, ?)`
	).run(MOVIE_TMDB_ID, Date.now());
	db.prepare(
		`INSERT OR IGNORE INTO user_tracking (user_id, media_type, tmdb_id, status, created_at)
		 VALUES (?, 'movie', ?, 'plan_to_watch', ?)`
	).run(TEST_USER.id, MOVIE_TMDB_ID, Date.now());
	db.close();

	await signIn(context, baseURL!);
});

test('poster plays a looping shimmer while its destination page is loading', async ({ page }) => {
	await page.goto('/');
	const link = page.locator(`a[href="${MOVIE_HREF}"]`);
	const card = link.locator('.sheen');
	await expect(card).toBeVisible();
	await expect(card).not.toHaveClass(/shimmer-loading/);

	// Holds the navigation open long enough to reliably capture the loading state --
	// without this the local dev/e2e server can respond before the assertions below run.
	await page.route(
		(url) => url.pathname.startsWith(MOVIE_HREF),
		async (route) => {
			await new Promise((r) => setTimeout(r, 1000));
			await route.continue();
		}
	);

	await link.click();
	await expect(card).toHaveClass(/shimmer-loading/);

	// toHaveScreenshot defaults to animations: 'disabled', which forces the shimmer's
	// infinite CSS animation to its finished frame instead of an arbitrary mid-sweep
	// position, so the snapshot is stable across runs. maxDiffPixelRatio absorbs
	// unrelated font anti-aliasing jitter in the fallback title text.
	await expect(card).toHaveScreenshot('poster-shimmer-loading.png', { maxDiffPixelRatio: 0.01 });

	await page.waitForURL(`**${MOVIE_HREF}`);
});
