import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerRoutes, registerJobs, createRunningShared } from './routes.js';
import { runningTools } from './tools.js';
import { registerAdminRoutes } from './adminRoutes.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** @type {import('../../../../apps/backbone/src/core/modules.js').SnowmanModule} */
const runningModule = {
  name: 'running',
  migrationsDir: MIGRATIONS_DIR,
  tools: runningTools,
  register(app, ctx) {
    // One brief/voice service for routes and jobs, so a prepare pass never runs twice at once.
    const shared = createRunningShared(ctx, app.log);
    registerRoutes(app, ctx, shared);
    registerAdminRoutes(app, ctx);
    registerJobs(ctx, shared);
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
export { createRunningAdminRepo } from './adminRepo.js';
export { runSource, suspectFlags, decorateRun } from './adminDerive.js';
export { runningTools } from './tools.js';
