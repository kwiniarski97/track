---
name: verify
description: Launch and drive this app (SvelteKit + SQLite + Pocket ID SSO) with a seeded session to verify changes at the real UI, bypassing OAuth.
---

# Verifying changes in the running app

Auth is Pocket ID SSO, but the e2e harness seeds a ready session — no OAuth needed.

## Launch

1. Seed the e2e db + session:
   `node --experimental-strip-types tests/e2e/global-setup.ts`
2. Start the dev server against the e2e db but with the real TMDB key
   (`.env.e2e` contains a **dummy** `TMDB_API_KEY`; `process.loadEnvFile` does
   NOT override already-set vars, so order + delete matters):

   ```js
   // run with `node server.cjs` (background)
   process.chdir('/home/karol/Projects/track');
   process.loadEnvFile('.env.e2e'); // e2e DATABASE_URL, SESSION_SECRET
   delete process.env.TMDB_API_KEY; // dummy key -> TMDB 401s otherwise
   process.loadEnvFile('.env'); // real TMDB_API_KEY
   const { spawn } = require('child_process');
   spawn('npx', ['vite', 'dev', '--port', '4173'], { stdio: 'inherit', env: process.env });
   ```

   Ready when `curl -s -o /dev/null -w "%{http_code}" http://localhost:4173/` → 302.

## Drive

Playwright MCP browser fails here (wants Chrome at /opt/google/chrome). Use a
script importing the project's own Playwright:

```js
import { chromium } from 'file:///home/karol/Projects/track/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addCookies([
	{ name: 'session', value: 'e2e-test-session-token', domain: 'localhost', path: '/' }
]);
const page = await context.newPage();
await page.goto('http://localhost:4173/show/1396', { waitUntil: 'networkidle' });
```

The cookie is the seeded `TEST_SESSION_TOKEN` from `tests/e2e/auth.ts` — attach it
and every page is logged in as "E2E Test User".

## Gotchas

- UI is Polish (`pl-PL` TMDB locale). Useful fixture shows: 1396 Breaking Bad
  (fully translated), 94664 Mushoku Tensei (S3 untranslated in Polish — exercises
  the original-language fallback for episode names/overviews).
- Episode rows live in `#season-<n>-episodes`; season headers are buttons
  ("Sezon 3") that expand on click.
- `tests/e2e/test.db` is throwaway; reseed via step 1 whenever state gets weird.
- Kill with `pkill -f "vite dev --port 4173"` (exit 144 from fish is normal).
