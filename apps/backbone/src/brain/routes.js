import crypto from 'node:crypto';
import { buildSystemBlocks, runAgent, OlafRefusal, OlafTruncated, OlafInvalidOutput } from './agent.js';
import { OlafUnavailable } from './claude.js';
import { OlafOverBudget } from './budget.js';

const STABLE_INSTRUCTIONS =
  'You are Olaf, the AI character running on Snowman, talking directly with the person you help. ' +
  'Use the available tools when they let you answer more accurately. Be concise and honest.';

/**
 * conversations / conversation_messages repo.
 * @param {import('mysql2/promise').Pool} pool
 */
export function createConversationRepo(pool) {
  return {
    async create(id) {
      await pool.query(
        'INSERT INTO conversations (id, created_at, updated_at) VALUES (?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))',
        [id],
      );
    },
    async loadMessages(id) {
      const [rows] = await pool.query(
        'SELECT role, content FROM conversation_messages WHERE conversation_id = ? ORDER BY id',
        [id],
      );
      return rows.map((r) => ({ role: r.role, content: JSON.parse(r.content) }));
    },
    async appendMessages(id, messages) {
      for (const m of messages) {
        await pool.query(
          'INSERT INTO conversation_messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3))',
          [id, m.role, JSON.stringify(m.content)],
        );
      }
      await pool.query('UPDATE conversations SET updated_at = UTC_TIMESTAMP(3) WHERE id = ?', [id]);
    },
  };
}

/**
 * Map an Olaf error to an HTTP response. Returns true if it handled `err`.
 */
function sendOlafError(reply, err) {
  if (err instanceof OlafUnavailable) {
    reply.code(503).send({ error: 'olaf_unavailable' });
    return true;
  }
  if (err instanceof OlafOverBudget) {
    reply.code(503).send({ error: 'olaf_over_budget' });
    return true;
  }
  if (err instanceof OlafRefusal) {
    reply.code(422).send({ error: 'olaf_refusal', details: err.details ?? null });
    return true;
  }
  if (err instanceof OlafTruncated) {
    reply.code(502).send({ error: 'olaf_truncated' });
    return true;
  }
  if (err instanceof OlafInvalidOutput) {
    reply.code(502).send({ error: 'olaf_invalid_output', message: err.message });
    return true;
  }
  return false;
}

/**
 * Register core Olaf routes: POST /v1/olaf/chat, GET /v1/olaf/usage.
 * @param {import('fastify').FastifyInstance} app
 * @param {{brain: object, budget: object, tools: object, events: object, persona: string, config: object, conversationRepo: ReturnType<typeof createConversationRepo>, clock?: () => Date}} ctx
 */
export function registerOlafRoutes(app, ctx) {
  const { brain, budget, tools, events, persona, config, conversationRepo } = ctx;
  const clock = ctx.clock || (() => new Date());

  app.post(
    '/v1/olaf/chat',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['message'],
          properties: {
            message: { type: 'string', minLength: 1 },
            conversationId: { type: ['string', 'null'] },
          },
        },
      },
    },
    async (request, reply) => {
      if (!brain.available) return reply.code(503).send({ error: 'olaf_unavailable' });

      let conversationId = request.body.conversationId;
      let history = [];
      if (conversationId) {
        history = await conversationRepo.loadMessages(conversationId);
      } else {
        conversationId = crypto.randomUUID();
        await conversationRepo.create(conversationId);
      }

      const startLen = history.length;
      const messages = [...history, { role: 'user', content: request.body.message }];
      const systemBlocks = buildSystemBlocks(persona, STABLE_INSTRUCTIONS, clock, config.tzName);

      try {
        const result = await runAgent(
          { brain, toolRegistry: tools, budget, events, purpose: 'olaf.chat' },
          { model: config.olafModelSmart, systemBlocks, messages, maxTokens: 4000 },
        );
        await conversationRepo.appendMessages(conversationId, result.messages.slice(startLen));
        return { conversationId, reply: result.text };
      } catch (err) {
        if (sendOlafError(reply, err)) return reply;
        request.log.error({ err }, 'olaf chat failed');
        return reply.code(500).send({ error: 'internal_error' });
      }
    },
  );

  app.get('/v1/olaf/usage', async () => {
    const monthUsd = await budget.monthTotalUsd();
    return { monthUsd, budgetUsd: config.aiMonthlyBudgetUsd };
  });
}

export { sendOlafError };
