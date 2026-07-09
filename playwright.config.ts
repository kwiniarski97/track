import { defineConfig, devices } from '@playwright/test';

// Loaded here (not just in globalSetup) so it's set before webServer spawns `vite dev`
// as a child process, regardless of whether Playwright runs globalSetup or starts
// webServer first -- child processes only inherit the env present at spawn time.
process.loadEnvFile('.env.e2e');

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: './tests/e2e',
	globalSetup: './tests/e2e/global-setup.ts',
	fullyParallel: true,
	reporter: 'list',
	use: {
		baseURL: BASE_URL,
		trace: 'retain-on-failure'
	},
	webServer: {
		command: `npx vite dev --port ${PORT}`,
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
