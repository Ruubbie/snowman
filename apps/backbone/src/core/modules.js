/**
 * @typedef {Object} SnowmanModule
 * @property {string} name
 * @property {string} [migrationsDir]
 * @property {import('../brain/tools.js').ToolDef[]} [tools] static Olaf tool defs (handlers receive ctx per-call, so no runtime ctx needed here)
 * @property {(app: import('fastify').FastifyInstance, ctx: object) => void} [register] does everything that needs runtime ctx: routes, event subscribers, job handlers, recurring jobs
 */

/**
 * Register every module's Olaf tools (static) and let each module wire up
 * its own routes/subscribers/job handlers against the live ctx.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} ctx
 * @param {SnowmanModule[]} modules
 */
export function loadModules(app, ctx, modules) {
  for (const mod of modules) {
    if (mod.tools) for (const tool of mod.tools) ctx.tools.register(tool);
    if (mod.register) mod.register(app, ctx);
  }
}

/**
 * @param {SnowmanModule[]} modules
 * @returns {{label: string, dir: string}[]}
 */
export function migrationSourcesFor(modules) {
  return modules.filter((m) => m.migrationsDir).map((m) => ({ label: m.name, dir: m.migrationsDir }));
}
