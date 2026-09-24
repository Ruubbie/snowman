import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { migrationSourcesFor } from '../src/core/modules.js';
import runningModule from '@snowman/module-running';

const config = loadConfig();
const db = createPool(config.databaseUrl);

try {
  await db.query('SELECT 1');
} catch (err) {
  console.error(`Could not reach the database at DATABASE_URL: ${err.message}`);
  process.exit(1);
}

const backboneMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));
const applied = await runMigrations(
  db,
  migrationSourcesFor([{ name: 'backbone', migrationsDir: backboneMigrationsDir }, runningModule]),
);

if (applied.length === 0) {
  console.log('No pending migrations.');
} else {
  console.log(`Applied ${applied.length} migration(s):`);
  for (const id of applied) console.log(`  - ${id}`);
}

await db.end();
