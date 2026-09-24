import { localDateString } from '@snowman/shared';
import { createRunningAdminRepo } from './adminRepo.js';
import { decorateRun } from './adminDerive.js';
import { analyzeRun } from './analysis.js';

/**
 * Running's part of the admin API (desktop dashboard), under
 * /v1/admin/running/*, plus the module's card on the dashboard home
 * (ctx.admin.registerOverview). Auth: the backbone's global device-token hook.
 * Other modules add their admin routes and overview card the same way.
 */

const idParam = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1, maxLength: 191 } },
};

function pageQuery(defaultLimit, maxLimit) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: maxLimit, default: defaultLimit },
      offset: { type: 'integer', minimum: 0, default: 0 },
    },
  };
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {object} ctx backbone ctx (db, events, config, clock?, runningAdminRepo?, admin?)
 */
export function registerAdminRoutes(app, ctx) {
  const repo = ctx.runningAdminRepo || createRunningAdminRepo(ctx.db);
  const clock = ctx.clock || (() => new Date());
  const tzName = ctx.config?.tzName || 'UTC';

  ctx.admin?.registerOverview('running', async () => {
    const [stats, recent] = await Promise.all([
      repo.overviewStats({ today: localDateString(clock(), tzName) }),
      repo.listRuns({ limit: 5, offset: 0 }),
    ]);
    return { ...stats, recentRuns: recent.runs.map(decorateRun) };
  });

  async function publishDeletions(request, deleted) {
    for (const d of deleted) {
      await ctx.events.publish('admin.run_deleted', { ...d, byDeviceId: request.device?.id ?? null });
    }
  }

  app.get('/v1/admin/running/runs', { schema: { querystring: pageQuery(50, 500) } }, async (request) => {
    const { limit, offset } = request.query;
    const { total, runs } = await repo.listRuns({ limit, offset });
    return { total, limit, offset, runs: runs.map(decorateRun) };
  });

  app.get('/v1/admin/running/runs/:id', { schema: { params: idParam } }, async (request, reply) => {
    const run = await repo.getRun(request.params.id);
    if (!run) return reply.code(404).send({ error: 'not_found' });
    const parts = await repo.getRunParts(run);
    const analysis = analyzeRun({
      samples: parts.samples.filter((s) => s.accepted),
      events: parts.events,
      segments: parts.session?.segments || [],
      targets: parts.brief?.brief?.targets || [],
    });
    delete analysis.paceSeries; // the dashboard derives series from the raw samples it already has
    return { run: decorateRun(run), ...parts, analysis };
  });

  app.delete('/v1/admin/running/runs/:id', { schema: { params: idParam } }, async (request, reply) => {
    const result = await repo.deleteRuns([request.params.id]);
    if (!result.deleted.length) return reply.code(404).send({ error: 'not_found' });
    await publishDeletions(request, result.deleted);
    return { deleted: result.deleted[0] };
  });

  app.post(
    '/v1/admin/running/runs/delete',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['ids'],
          properties: {
            ids: {
              type: 'array',
              minItems: 1,
              maxItems: 500,
              uniqueItems: true,
              items: { type: 'string', minLength: 1, maxLength: 191 },
            },
          },
        },
      },
    },
    async (request) => {
      const result = await repo.deleteRuns(request.body.ids);
      await publishDeletions(request, result.deleted);
      return result;
    },
  );

  app.get('/v1/admin/running/plan-decisions', { schema: { querystring: pageQuery(100, 1000) } }, async (request) => {
    const { limit, offset } = request.query;
    return { limit, offset, ...(await repo.listPlanDecisions({ limit, offset })) };
  });

  app.get('/v1/admin/running/briefs', { schema: { querystring: pageQuery(50, 500) } }, async (request) => {
    const { limit, offset } = request.query;
    return { limit, offset, ...(await repo.listBriefs({ limit, offset })) };
  });

  app.delete(
    '/v1/admin/running/briefs/:sessionId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: { sessionId: { type: 'string', minLength: 1, maxLength: 64 } },
        },
      },
    },
    async (request, reply) => {
      const { sessionId } = request.params;
      if (!(await repo.deleteBrief(sessionId))) return reply.code(404).send({ error: 'not_found' });
      await ctx.events.publish('admin.brief_deleted', { sessionId, byDeviceId: request.device?.id ?? null });
      return { deleted: { sessionId } };
    },
  );
}
