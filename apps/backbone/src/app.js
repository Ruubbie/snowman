import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import { createDeviceRepo, authPreHandler, pair, PairingError } from './core/auth.js';
import { createEventBus } from './core/events.js';
import { registerRealtime } from './core/realtime.js';
import { createJobRunner } from './core/jobs.js';
import { loadModules } from './core/modules.js';
import { createBrainClient } from './brain/claude.js';
import { createBudget } from './brain/budget.js';
import { createToolRegistry } from './brain/tools.js';
import { registerOlafRoutes, createConversationRepo, sendOlafError } from './brain/routes.js';
import { runAgent, structured, buildSystemBlocks } from './brain/agent.js';
import runningModule from '@snowman/module-running';

/**
 * Build a (not-yet-listening) Fastify instance wired up with the full
 * Snowman backbone: auth, events, jobs, Olaf, and every module. Every piece
 * can be overridden, which is how tests inject fakes without a database.
 *
 * @param {{
 *   config: object,
 *   db?: import('mysql2/promise').Pool|null,
 *   brain?: object,
 *   budget?: object,
 *   events?: object,
 *   jobs?: object,
 *   tools?: object,
 *   deviceRepo?: object,
 *   conversationRepo?: object,
 *   runningRepo?: object,
 *   persona?: string,
 *   clock?: () => Date,
 *   logger?: boolean|object,
 *   modules?: object[],
 * }} opts
 * @returns {import('fastify').FastifyInstance}
 */
export function buildApp(opts) {
  const { config } = opts;
  const db = opts.db ?? null;
  const clock = opts.clock || (() => new Date());
  const app = Fastify({ logger: opts.logger ?? false });

  const events = opts.events || createEventBus(db, { logger: app.log });
  const jobs = opts.jobs || createJobRunner(db, { tzName: config.tzName, logger: app.log });
  const tools = opts.tools || createToolRegistry();
  const brain = opts.brain || createBrainClient(config);
  const budget = opts.budget || createBudget(db, config);
  const deviceRepo = opts.deviceRepo || createDeviceRepo(db);
  const conversationRepo = opts.conversationRepo || createConversationRepo(db);
  const persona = opts.persona ?? '';

  app.register(websocketPlugin);

  // Tiny CORS layer for local web testing (Expo web dev server calling the
  // backbone from a different origin). No new dependency: just an onRequest
  // hook that sets headers and short-circuits OPTIONS preflight.
  const corsOrigins = (config.corsOrigins || 'http://localhost:8081')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && corsOrigins.includes(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    }
    if (request.method === 'OPTIONS') {
      reply.code(204).send();
      return reply;
    }
  });

  // onRequest (not preHandler) so auth is checked before body parsing/schema
  // validation - an unauthenticated request never even reaches a 400.
  app.addHook('onRequest', authPreHandler(deviceRepo));

  app.get('/v1/health', async () => ({ ok: true, olafAvailable: brain.available }));

  app.post(
    '/v1/pair',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['code', 'deviceName'],
          properties: {
            code: { type: 'string', minLength: 6, maxLength: 6 },
            deviceName: { type: 'string', minLength: 1, maxLength: 255 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return await pair(deviceRepo, request.body);
      } catch (err) {
        if (err instanceof PairingError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    },
  );

  registerRealtime(app, { events });

  const ctx = {
    config,
    db,
    events,
    jobs,
    tools,
    brain,
    budget,
    persona,
    conversationRepo,
    runningRepo: opts.runningRepo,
    clock,
    // Shared with modules so they never need to import from apps/backbone directly.
    brainAgent: { runAgent, structured, buildSystemBlocks },
    sendOlafError,
  };

  registerOlafRoutes(app, ctx);

  const modules = opts.modules || [runningModule];
  loadModules(app, ctx, modules);

  app.decorate('snowman', { events, jobs, tools, brain, budget, deviceRepo, conversationRepo, config });

  return app;
}
