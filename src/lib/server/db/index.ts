import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = new Database(env.DATABASE_URL);

// WAL lets readers proceed while a cron job (Jellyfin sync, metadata refresh) is mid-write,
// instead of blocking every request handler on the rollback journal's exclusive lock.
// busy_timeout makes rare writer/writer collisions wait it out rather than throw
// SQLITE_BUSY immediately. NORMAL sync is safe with WAL (a crash can lose the last
// transaction but never corrupt the db), and skips an fsync per transaction.
client.pragma('journal_mode = WAL');
client.pragma('synchronous = NORMAL');
client.pragma('busy_timeout = 5000');

export const db = drizzle(client, { schema });

migrate(db, { migrationsFolder: './drizzle' });
