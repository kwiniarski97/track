import { defineConfig, devices } from '@playwright/test';

// Loaded here (not just in globalSetup) so it's set before webServer spawns `vite dev`
// as a child process, regardless of whether Playwright runs globalSetup or starts
// webServer first -- child processes only inherit the env present at spawn time.
process.loadEnvFile('.env.e2e');

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: true,
	reporter: 'list',
	use: {
		baseURL: BASE_URL,
		trace: 'retain-on-failure'
	},
	webServer: {
		// Recreates and reseeds the db, then only starts `vite dev` once that's fully
		// done. Deliberately not Playwright's `globalSetup` hook: that isn't guaranteed to
		// finish before this command's own process starts, and this command's first
		// request (Playwright's own readiness probe against `url` below) is enough to
		// lazily open the app's one persistent db connection -- if that races ahead of a
		// separate globalSetup's rm+recreate, the server is left permanently attached to
		// the deleted file and every session lookup fails for its whole lifetime.
		command: `node --experimental-strip-types tests/e2e/global-setup.ts && npx vite dev --port ${PORT}`,
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		stdout: 'pipe',
		stderr: 'pipe'
	},
	projects: [
		{ name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
		{ name: 'Mobile Chrome (Android)', use: { ...devices['Pixel 7'] } }
	]
});
