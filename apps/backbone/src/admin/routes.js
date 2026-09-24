import { createAdminRepo } from './repo.js';
import { messagePreview, monthStartUtc } from './derive.js';

/**
 * Core admin API for the desktop dashboard (Olaf's home): what Olaf knows
 * and did across all modules. Module-specific admin routes live with each
 * module under /v1/admin/<module>/* and plug a card into the overview via
 * ctx.admin.registerOverview(). Auth: the global device-token hook in app.js.
 */

const idParam = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1, maxLength: 191 } },
};

function pageQuery(defaultLimit, maxLimit, extra = {}) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: maxLimit, default: defaultLimit },
      offset: { type: 'integer', minimum: 0, default: 0 },
      ...extra,
    },
  };
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{db: object, adminRepo?: object, admin: ReturnType<typeof import('./registry.js').createAdminRegistry>, events: object, budget: object, brain: object, config: object, clock?: () => Date}} ctx
 */
export function registerAdminRoutes(app, ctx) {
  const repo = ctx.adminRepo || createAdminRepo(ctx.db);
  const clock = ctx.clock || (() => new Date());
  const budgetUsd = () => Number(ctx.config.aiMonthlyBudgetUsd ?? 0);

  app.get('/v1/admin/overview', async (request) => {
    const monthStart = monthStartUtc(clock());
    const [core, monthUsd, ai, events, modules] = await Promise.all([
      repo.overview({ monthStart }),
      ctx.budget.monthTotalUsd(),
      repo.listAiUsage({ limit: 8, offset: 0, monthStart }),
      repo.listEvents({ limit: 10, offset: 0 }),
      ctx.admin.collectOverviews(request.log),
    ]);
    return {
      ...core,
      olaf: { available: Boolean(ctx.brain?.available) },
      ai: { monthUsd, budgetUsd: budgetUsd(), monthStart, byPurpose: ai.month.byPurpose },
      recentAi: ai.rows,
      recentEvents: events.events,
      modules,
    };
  });

  // --- conversations ----------------------------------------------------
  app.get('/v1/admin/conversations', { schema: { querystring: pageQuery(50, 500) } }, async (request) => {
    const { limit, offset } = request.query;
    const { total, conversations } = await repo.listConversations({ limit, offset });
    return {
      total,
      limit,
      offset,
      conversations: conversations.map(({ firstUserContent, lastMessage, ...c }) => ({
        ...c,
        title: c.title || messagePreview(firstUserContent, 80) || null,
        lastMessage: lastMessage ? { role: lastMessage.role, preview: messagePreview(lastMessage.content), at: lastMessage.at } : null,
      })),
    };
  });

  app.get('/v1/admin/conversations/:id', { schema: { params: idParam } }, async (request, reply) => {
    const conversation = await repo.getConversation(request.params.id);
    if (!conversation) return reply.code(404).send({ error: 'not_found' });
    return conversation;
  });

  app.delete('/v1/admin/conversations/:id', { schema: { params: idParam } }, async (request, reply) => {
    const deleted = await repo.deleteConversation(request.params.id);
    if (!deleted) return reply.code(404).send({ error: 'not_found' });
    await ctx.events.publish('admin.conversation_deleted', { ...deleted, byDeviceId: request.device?.id ?? null });
    return { deleted };
  });

  // --- AI usage -----------------------------------------------------------
  app.get('/v1/admin/ai-usage', { schema: { querystring: pageQuery(100, 1000) } }, async (request) => {
    const { limit, offset } = request.query;
    const monthStart = monthStartUtc(clock());
    const [usage, monthUsd] = await Promise.all([repo.listAiUsage({ limit, offset, monthStart }), ctx.budget.monthTotalUsd()]);
    return { limit, offset, ...usage, monthStart, monthUsd, budgetUsd: budgetUsd() };
  });

  // --- event log (Olaf's memory of what happened) ---------------------------
  app.get(
    '/v1/admin/events',
    { schema: { querystring: pageQuery(100, 500, { type: { type: 'string', minLength: 1, maxLength: 191 } }) } },
    async (request) => {
      const { limit, offset, type } = request.query;
      return { limit, offset, ...(await repo.listEvents({ limit, offset, type })) };
    },
  );

  // --- devices ------------------------------------------------------------
  app.get('/v1/admin/devices', async (request) => {
    const devices = await repo.listDevices();
    return { devices: devices.map((d) => ({ ...d, current: d.id === request.device?.id })) };
  });

  app.delete('/v1/admin/devices/:id', { schema: { params: idParam } }, async (request, reply) => {
    if (request.params.id === request.device?.id) {
      return reply.code(409).send({ error: 'cannot_revoke_self', message: 'Unpair this device from its own settings instead.' });
    }
    const device = await repo.getDevice(request.params.id);
    if (!device) return reply.code(404).send({ error: 'not_found' });
    if (device.revokedAt) return { device };
    const revoked = await repo.revokeDevice(device.id);
    await ctx.events.publish('admin.device_revoked', { deviceId: device.id, name: device.name, byDeviceId: request.device?.id ?? null });
    return { device: revoked };
  });
}
