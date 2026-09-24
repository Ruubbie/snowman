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
import { registerAdminRoutes } from './admin/routes.js';
import { createAdminRegistry } from './admin/registry.js';
import { createVoiceEngineFromConfig } from './voice/engine.js';
import { registerVoiceRoutes } from './voice/routes.js';
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
 *   adminRepo?: object,
 *   runningAdminRepo?: object,
 *   persona?: string,
 *   clock?: () => Date,
 *   logger?: boolean|object,
 *   modules?: object[],
 *   voice?: object,
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
  // Olaf's server-side voice; off unless config.voiceEnabled === true, lazy-loads the model.
  const voice = opts.voice || createVoiceEngineFromConfig(config, { logger: app.log });

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
    adminRepo: opts.adminRepo,
    runningAdminRepo: opts.runningAdminRepo,
    // Modules plug their dashboard card into GET /v1/admin/overview here.
    admin: createAdminRegistry(),
    clock,
    // Shared with modules so they never need to import from apps/backbone directly.
    brainAgent: { runAgent, structured, buildSystemBlocks },
    sendOlafError,
    // voice.enqueue(text) -> {id,url}|null, never blocks (see src/voice/engine.js).
    voice,
  };

  registerOlafRoutes(app, ctx);
  registerVoiceRoutes(app, { voice });
  registerAdminRoutes(app, ctx);

  const modules = opts.modules || [runningModule];
  loadModules(app, ctx, modules);

  app.decorate('snowman', { events, jobs, tools, brain, budget, deviceRepo, conversationRepo, config, voice });

  return app;
}
