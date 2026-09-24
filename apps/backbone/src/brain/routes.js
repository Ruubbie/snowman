import crypto from 'node:crypto';
import { buildSystemBlocks, runAgent, OlafRefusal, OlafTruncated, OlafInvalidOutput } from './agent.js';
import { OlafUnavailable } from './claude.js';
import { OlafOverBudget } from './budget.js';

const STABLE_INSTRUCTIONS =
  'You are Olaf, the AI character running on Snowman, talking directly with the person you help. ' +
  'Use the available tools when they let you answer more accurately - for training questions, look at the ' +
  'running plan and recent runs instead of guessing. Be concise and honest; this is a chat, so keep replies short ' +
  'unless asked for detail.';

/**
 * conversations / conversation_messages repo.
 * @param {import('mysql2/promise').Pool} pool
 */
export function createConversationRepo(pool) {
  return {
    async create(id, deviceId = null) {
      await pool.query(
        'INSERT INTO conversations (id, device_id, created_at, updated_at) VALUES (?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))',
        [id, deviceId],
      );
    },
    async loadMessages(id) {
      const [rows] = await pool.query(
        'SELECT role, content FROM conversation_messages WHERE conversation_id = ? ORDER BY id',
        [id],
      );
      return rows.map((r) => ({ role: r.role, content: JSON.parse(r.content) }));
    },
    /** Just the readable turns: user text and Olaf's text replies (tool calls/results left out). */
    async loadTranscript(id) {
      const [rows] = await pool.query(
        'SELECT role, content, created_at FROM conversation_messages WHERE conversation_id = ? ORDER BY id',
        [id],
      );
      return transcriptOf(rows.map((r) => ({ role: r.role, content: JSON.parse(r.content), at: r.created_at })));
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
 * @param {{role: string, content: string|object[], at?: Date}[]} messages
 * @returns {{role: 'user'|'olaf', text: string, at: Date|null}[]}
 */
export function transcriptOf(messages) {
  const out = [];
  for (const m of messages) {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content || [];
    const text = blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (text) out.push({ role: m.role === 'user' ? 'user' : 'olaf', text, at: m.at ?? null });
  }
  return out;
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
 * Register core Olaf routes: POST /v1/olaf/chat, GET /v1/olaf/conversations/:id, GET /v1/olaf/usage.
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
        await conversationRepo.create(conversationId, request.device?.id ?? null);
      }

      const startLen = history.length;
      const messages = [...history, { role: 'user', content: request.body.message }];
      const systemBlocks = buildSystemBlocks(persona, STABLE_INSTRUCTIONS, clock, config.tzName);

      try {
        const result = await runAgent(
          // toolCtx is filled in by modules (e.g. ctx.toolCtx.running) so their tools work in chat.
          { brain, toolRegistry: tools, budget, events, purpose: 'olaf.chat', toolCtx: ctx.toolCtx || {} },
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

  app.get('/v1/olaf/conversations/:id', async (request, reply) => {
    const messages = await conversationRepo.loadTranscript(request.params.id);
    if (!messages.length) return reply.code(404).send({ error: 'not_found' });
    return { conversationId: request.params.id, messages };
  });

  app.get('/v1/olaf/usage', async () => {
    const monthUsd = await budget.monthTotalUsd();
    return { monthUsd, budgetUsd: config.aiMonthlyBudgetUsd };
  });
}

export { sendOlafError };
