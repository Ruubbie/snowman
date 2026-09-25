import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { migrationSourcesFor } from './core/modules.js';
import { loadPersona } from './brain/persona.js';
import { buildApp } from './app.js';
import runningModule from '@snowman/module-running';
import healthModule from '@snowman/module-health';

async function main() {
  const config = loadConfig();
  const db = createPool(config.databaseUrl);

  try {
    await db.query('SELECT 1');
  } catch (err) {
    console.error(
      `\nCould not reach the database at DATABASE_URL.\n` +
        `Make sure MariaDB is running and the "snowman" database/user exist (see README.md).\n` +
        `Underlying error: ${err.message}\n`,
    );
    process.exit(1);
  }

  const modules = [runningModule, healthModule];
  const backboneMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));
  await runMigrations(db, migrationSourcesFor([{ name: 'backbone', migrationsDir: backboneMigrationsDir }, ...modules]));

  const persona = await loadPersona(config);
  const app = buildApp({ config, db, persona, modules, logger: { level: process.env.LOG_LEVEL || 'info' } });

  app.snowman.jobs.start();

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Snowman backbone listening on http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Load Olaf's voice in the background (first start downloads the model); never blocks boot.
  const { voice } = app.snowman;
  if (voice.enabled) {
    voice.warmUp().then(
      () => app.log.info(voice.status(), 'voice engine warm'),
      () => {}, // already logged by the engine; voice routes answer 503 voice_unavailable
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
