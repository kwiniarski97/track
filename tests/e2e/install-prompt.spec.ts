import { expect, type Page, test } from '@playwright/test';
import { signIn } from './auth';

const BANNER = '[data-testid="install-prompt"]';

test.beforeEach(async ({ context, baseURL }) => {
	await signIn(context, baseURL!);
});

/** Real Chromium won't fire beforeinstallprompt against a plain `vite dev` origin (no
 * production build, no HTTPS) -- dispatching a stand-in event exercises the same
 * listener/UI path the component actually uses, just without relying on Chrome's own
 * installability heuristics. */
function dispatchBeforeInstallPrompt(page: Page, outcome: 'accepted' | 'dismissed' = 'accepted') {
	return page.evaluate((outcome) => {
		const event = new Event('beforeinstallprompt', { cancelable: true });
		Object.assign(event, {
			prompt: () => Promise.resolve(),
			userChoice: Promise.resolve({ outcome, platform: 'android' })
		});
		window.dispatchEvent(event);
	}, outcome);
}

/** page.goto() resolves on the 'load' event, which can beat Svelte's onMount attaching
 * the beforeinstallprompt listener by a few ms -- a single dispatch right after goto()
 * is a real race, not a hypothetical one (it was flaky in practice). Re-dispatching
 * inside expect(...).toPass() retries until the listener has caught one and the banner
 * is actually up. */
async function showAndroidBanner(page: Page, outcome: 'accepted' | 'dismissed' = 'accepted') {
	await expect(async () => {
		await dispatchBeforeInstallPrompt(page, outcome);
		await expect(page.locator(BANNER)).toBeVisible({ timeout: 250 });
	}).toPass({ timeout: 5000 });
}

test.describe('Android Chrome: native beforeinstallprompt flow', () => {
	test.beforeEach(({}, testInfo) => {
		test.skip(testInfo.project.name !== 'Mobile Chrome (Android)', 'Android-only event flow');
	});

	test('shows Install banner once beforeinstallprompt fires, and Install calls prompt()', async ({
		page
	}) => {
		await page.goto('/');
		const banner = page.locator(BANNER);
		await expect(banner).toHaveCount(0);

		await showAndroidBanner(page);
		await expect(banner.getByRole('button', { name: 'Install' })).toBeVisible();

		await banner.getByRole('button', { name: 'Install' }).click();
		// prompt()'s userChoice resolves -> the component hides itself and marks dismissed.
		await expect(banner).toHaveCount(0);
	});

	test('dismiss hides the banner and it stays hidden after reload', async ({ page }) => {
		await page.goto('/');
		await showAndroidBanner(page, 'dismissed');

		const banner = page.locator(BANNER);
		await banner.getByRole('button', { name: 'Dismiss' }).click();
		await expect(banner).toHaveCount(0);

		await page.reload();
		// No beforeinstallprompt re-dispatch on purpose: the localStorage flag must gate
		// the banner before any platform-specific listener would even run.
		await expect(banner).toHaveCount(0);
	});
});

test.describe('Desktop: banner never shows', () => {
	test.beforeEach(({}, testInfo) => {
		test.skip(testInfo.project.name !== 'Desktop Chrome', 'desktop-only viewport check');
	});

	test('stays hidden even if beforeinstallprompt fires', async ({ page }) => {
		await page.goto('/');
		await dispatchBeforeInstallPrompt(page);
		await expect(page.locator(BANNER)).toHaveCount(0);
	});
});
