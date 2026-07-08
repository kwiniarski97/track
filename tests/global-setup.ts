import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

/** Runs once before the whole Vitest run: recreates a throwaway sqlite db and applies
 * the migrations folder via drizzle-kit, so tests never touch the real local.db and
 * always run against up-to-date tables. Uses `migrate` rather than `push` so the
 * resulting db has the same `__drizzle_migrations` bookkeeping that db/index.ts's own
 * startup `migrate()` call expects -- otherwise that call re-applies every migration
 * against tables that already exist and blows up with "table already exists". */
export default function setup() {
	process.loadEnvFile('.env.test');
	const dbPath = process.env.DATABASE_URL;
	if (!dbPath) throw new Error('DATABASE_URL is not set (expected from .env.test)');

	if (existsSync(dbPath)) rmSync(dbPath);
	try {
		execSync('npx drizzle-kit migrate', { env: process.env });
	} catch (error) {
		// drizzle.config.ts sets verbose:true, which is noisy but useful when this fails.
		console.error((error as { stdout?: Buffer }).stdout?.toString());
		throw error;
	}

	return () => {
		if (existsSync(dbPath)) rmSync(dbPath);
	};
}
