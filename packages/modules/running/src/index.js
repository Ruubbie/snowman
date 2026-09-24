import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerRoutes, registerJobs } from './routes.js';
import { runningTools } from './tools.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** @type {import('../../../../apps/backbone/src/core/modules.js').SnowmanModule} */
const runningModule = {
  name: 'running',
  migrationsDir: MIGRATIONS_DIR,
  tools: runningTools,
  register(app, ctx) {
    registerRoutes(app, ctx);
    registerJobs(ctx);
  },
};

export default runningModule;
export * from './program.js';
export * from './rules.js';
export * from './planner.js';
export * from './import.js';
export * from './importRunner.js';
export * from './analysis.js';
export { createRunningRepo } from './repo.js';
export { runningTools } from './tools.js';
