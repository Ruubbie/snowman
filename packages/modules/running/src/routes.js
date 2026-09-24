import { createHash } from 'node:crypto';
import { addDays, localDateString, zonedTimeToUtc, EVENTS, RUNNING_CARD_KINDS, runUploadBodySchema, runSamplesChunkBodySchema } from '@snowman/shared';
import { createRunningRepo } from './repo.js';
import { materialize } from './planner.js';
import { parseImportInput } from './import.js';
import { applyImport } from './importRunner.js';
import { analyzeRun } from './analysis.js';

const BODY_LIMIT_20MB = 20 * 1024 * 1024;

const STABLE_BRIEF_INSTRUCTIONS =
  'You are writing a pre-run brief for a beginner runner using an iPhone with no heart-rate monitor - only ' +
  'GPS pace and time are available. Write lines specifically for THIS run: no generic templates. Return only ' +
  'the requested JSON.';
const STABLE_CUE_INSTRUCTIONS =
  'You are Olaf, speaking a short live cue out loud to a beginner runner mid-run, on an iPhone with no ' +
  'heart-rate data. Max ~20 words. Use concrete numbers when useful. Never repeat a recent cue verbatim. ' +
  'Return only the requested JSON; say may be null to stay silent.';
const STABLE_DEBRIEF_INSTRUCTIONS =
  'You are Olaf, giving a short honest debrief right after a run, to a beginner runner on an iPhone with no ' +
  'heart-rate data. Use the running tools if you need more plan context.';
const STABLE_REMINDER_INSTRUCTIONS =
  'You are Olaf, writing a very short local-notification reminder in character for a beginner runner. One or ' +
  'two sentences, plain and encouraging.';

function buildTodayCards(session) {
  if (!session) return [];
  if (session.status === 'done') {
    return [{ kind: RUNNING_CARD_KINDS.SESSION_DONE, fallbackText: `${session.title} - done.`, data: session }];
  }
  if (session.status === 'moved') {
    return [{ kind: RUNNING_CARD_KINDS.SESSION_MOVED, fallbackText: `${session.title} was moved.`, data: session }];
  }
  if (session.status === 'replaced') {
    return [{ kind: RUNNING_CARD_KINDS.SESSION_REPLACED, fallbackText: `${session.title} was replaced.`, data: session }];
  }
  if (session.kind === 'rest') {
    return [{ kind: RUNNING_CARD_KINDS.REST_DAY, fallbackText: 'Rest day.', data: session }];
  }
  if (session.kind === 'walk') {
    return [{ kind: RUNNING_CARD_KINDS.RECOVERY_WALK, fallbackText: session.summary, data: session }];
  }
  return [{ kind: RUNNING_CARD_KINDS.PLANNED_RUN, fallbackText: session.summary, data: session }];
}

/**
 * Compute (but do not persist) local-notification specs for the next N
 * days: up to 3 per non-rest, not-yet-done day (reminder_hour, +2h if
 * before 21, and a 21:00 last call), capped at 42 total.
 */
export function buildReminderSpecs(sessions, settings, tzName) {
  const reminderHour = settings?.reminderHour ?? 18;
  const specs = [];
  for (const session of sessions) {
    if (session.kind === 'rest' || session.status === 'done' || session.status === 'skipped') continue;
    const hours = [reminderHour];
    if (reminderHour < 21) hours.push(Math.min(reminderHour + 2, 23));
    hours.push(21);
    const uniqueHours = [...new Set(hours)].sort((a, b) => a - b);
    const [y, m, d] = session.date.split('-').map(Number);
    for (const hour of uniqueHours) {
      const fireAt = zonedTimeToUtc({ year: y, month: m, day: d, hour, minute: 0 }, tzName);
      specs.push({
        id: `${session.id}-${hour}`,
        fireAt: fireAt.toISOString(),
        title: session.title,
        body: hour === 21 ? `Last call: ${session.summary}` : session.summary,
        sessionId: session.id,
      });
    }
  }
  return specs.slice(0, 42);
}

function buildBriefPrompt(session, settings, recentRuns, recentDecisions) {
  return [
    `Today's session: ${JSON.stringify(session)}`,
    `Runner settings: ${JSON.stringify(settings)}`,
    `Last ${recentRuns.length} runs: ${JSON.stringify(recentRuns)}`,
    `Recent plan decisions: ${JSON.stringify(recentDecisions)}`,
    'Write a pre-run brief as the required JSON: focus points, an opening line, per-segment pace targets ' +
      '(segment_index/kind/pace_min_s_per_km/pace_max_s_per_km/feel), and fallback_lines for ' +
      'too_fast/too_slow/to_run/to_walk/km_split/halfway/finish/encourage. Lines must be specific to this run.',
  ].join('\n\n');
}

function buildCuePrompt(trigger, snapshot, recentCues) {
  return [
    `Trigger: ${trigger}`,
    `Snapshot: ${JSON.stringify(snapshot)}`,
    `Recent cues already said (don't repeat): ${JSON.stringify(recentCues)}`,
    'Return the required JSON with a single short spoken cue, or null to stay silent.',
  ].join('\n\n');
}

function buildDebriefPrompt(run, session, analysis) {
  return [
    `Run: ${JSON.stringify(run)}`,
    `Planned session: ${JSON.stringify(session)}`,
    `Analysis: ${JSON.stringify(analysis)}`,
    'Give a short, honest debrief of this run. Use tools if you need more plan context before answering.',
  ].join('\n\n');
}

const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['focus', 'opening_line', 'targets', 'fallback_lines'],
  properties: {
    focus: { type: 'array', items: { type: 'string' } },
    opening_line: { type: 'string' },
    targets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['segment_index', 'kind', 'feel'],
        properties: {
          segment_index: { type: 'integer' },
          kind: { type: 'string' },
          pace_min_s_per_km: { type: ['integer', 'null'] },
          pace_max_s_per_km: { type: ['integer', 'null'] },
          feel: { type: 'string' },
        },
      },
    },
    fallback_lines: {
      type: 'object',
      additionalProperties: false,
      required: ['too_fast', 'too_slow', 'to_run', 'to_walk', 'km_split', 'halfway', 'finish', 'encourage'],
      properties: {
        too_fast: { type: 'string' },
        too_slow: { type: 'string' },
        to_run: { type: 'string' },
        to_walk: { type: 'string' },
        km_split: { type: 'string' },
        halfway: { type: 'string' },
        finish: { type: 'string' },
        encourage: { type: 'string' },
      },
    },
  },
};

const CUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['say'],
  properties: { say: { type: ['string', 'null'] } },
};

const CUE_TRIGGERS = [
  'segment_upcoming',
  'too_fast',
  'too_slow',
  'km_split',
  'slowing',
  'checkin',
  'paused',
  'resumed',
  'halfway',
  'finish',
  'gps_lost',
];

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {object} ctx backbone ctx: {db, runningRepo?, config, events, jobs, tools, brain, budget, persona, brainAgent, sendOlafError, clock?}
 */
export function registerRoutes(app, ctx) {
  const repo = ctx.runningRepo || createRunningRepo(ctx.db);
  const clock = ctx.clock || (() => new Date());
  const tzName = ctx.config?.tzName || 'UTC';
  const runningDeps = { repo, events: ctx.events, clock, tzName };

  app.get('/v1/running/today', async () => {
    const date = localDateString(clock(), tzName);
    let session = await repo.getSessionByDate(date);
    if (!session) {
      const created = await materialize(runningDeps, { fromDate: date, days: 1 });
      session = created[0] || null;
    }
    return { date, session, cards: buildTodayCards(session) };
  });

  app.get(
    '/v1/running/plan',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['from', 'to'],
          properties: { from: { type: 'string' }, to: { type: 'string' } },
        },
      },
    },
    async (request) => ({ sessions: await repo.getSessionsBetween(request.query.from, request.query.to) }),
  );

  app.post(
    '/v1/running/runs',
    { bodyLimit: BODY_LIMIT_20MB, schema: { body: runUploadBodySchema } },
    async (request, reply) => {
      const { run, samples = [], events = [] } = request.body;
      const runId = await repo.upsertRunSummary(run);
      if (samples.length) await repo.insertSamplesBatch(runId, samples);
      if (events.length) await repo.insertEventsBatch(runId, events);

      if (samples.length) {
        const session = run.sessionId ? await repo.getSessionById(run.sessionId) : null;
        const analysis = analyzeRun({ samples, events, segments: session?.segments || [] });
        await repo.storeAnalysisSummary(runId, analysis);
      }
      if (run.sessionId) await repo.markSessionDone(run.sessionId);

      await ctx.events.publish(EVENTS.RUNNING_RUN_COMPLETED, { runId, clientId: run.clientId });
      if (ctx.jobs) await ctx.jobs.enqueue('running.debrief', { runId });

      return reply.code(201).send({ id: runId, clientId: run.clientId });
    },
  );

  app.post(
    '/v1/running/runs/:clientId/samples',
    { bodyLimit: BODY_LIMIT_20MB, schema: { body: runSamplesChunkBodySchema } },
    async (request, reply) => {
      const runId = await repo.ensureRunByClientId(request.params.clientId);
      await repo.insertSamplesBatch(runId, request.body.samples);
      if (request.body.events?.length) await repo.insertEventsBatch(runId, request.body.events);
      return reply.code(202).send({ id: runId, accepted: request.body.samples.length });
    },
  );

  app.get('/v1/running/runs', async (request) => {
    const limit = request.query?.limit ? Number(request.query.limit) : 20;
    return { runs: await repo.getRecentRuns(limit) };
  });

  app.get('/v1/running/runs/:id', async (request, reply) => {
    const run = await repo.getRunById(request.params.id);
    if (!run) return reply.code(404).send({ error: 'not_found' });
    return run;
  });

  app.get('/v1/running/runs/:id/analysis', async (request, reply) => {
    const run = await repo.getRunById(request.params.id);
    if (!run) return reply.code(404).send({ error: 'not_found' });
    const [samples, events] = await Promise.all([repo.getSamples(run.id, {}), repo.getEvents(run.id)]);
    const session = run.sessionId ? await repo.getSessionById(run.sessionId) : null;
    const briefData = session ? await repo.getBrief(session.id) : null;
    const targets = briefData?.brief?.targets || [];
    return analyzeRun({ samples, events, segments: session?.segments || [], targets });
  });

  app.get('/v1/running/runs/:id/samples', async (request, reply) => {
    const run = await repo.getRunById(request.params.id);
    if (!run) return reply.code(404).send({ error: 'not_found' });
    const every = request.query?.every ? Math.max(1, Number(request.query.every)) : 1;
    return { samples: await repo.getSamples(run.id, { every }) };
  });

  app.put(
    '/v1/running/settings',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['programStart'],
          properties: {
            programStart: { type: 'string' },
            restWeekday: { type: 'integer', minimum: 1, maximum: 7 },
            reminderHour: { type: 'integer', minimum: 0, maximum: 23 },
          },
        },
      },
    },
    async (request) => {
      const current = await repo.getSettings();
      const next = {
        programStart: request.body.programStart,
        restWeekday: request.body.restWeekday ?? current?.restWeekday ?? 1,
        reminderHour: request.body.reminderHour ?? current?.reminderHour ?? 18,
      };
      await repo.setSettings(next);
      return next;
    },
  );

  app.post('/v1/running/import/runcoach', async (request) => {
    const body = request.body || {};
    const input = typeof body.text === 'string' ? body.text : body;
    const parsed = parseImportInput(input, { tzName });
    return applyImport(repo, parsed);
  });

  app.post(
    '/v1/running/brief',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['sessionId'],
          properties: { sessionId: { type: 'string' }, force: { type: 'boolean' } },
        },
      },
    },
    async (request, reply) => {
      const session = await repo.getSessionById(request.body.sessionId);
      if (!session) return reply.code(404).send({ error: 'not_found' });

      const [settings, recentRuns, recentDecisions, stored] = await Promise.all([
        repo.getSettings(),
        repo.getRecentRuns(10),
        repo.getRecentPlanDecisions(10),
        repo.getBrief(session.id),
      ]);
      const prompt = buildBriefPrompt(session, settings, recentRuns, recentDecisions);
      // Same inputs (session, settings, runs, decisions, persona, model) -> reuse the stored brief, no AI call.
      const inputHash = createHash('sha256')
        .update([ctx.config.olafModelSmart, ctx.persona || '', STABLE_BRIEF_INSTRUCTIONS, prompt].join('\n'))
        .digest('hex');
      if (stored && stored.inputHash === inputHash && !request.body.force) {
        return { sessionId: session.id, brief: stored.brief, cached: true };
      }
      if (!ctx.brain.available) {
        // Olaf offline: an older brief is better than none.
        if (stored) return { sessionId: session.id, brief: stored.brief, cached: true, stale: true };
        return reply.code(503).send({ error: 'olaf_unavailable' });
      }
      const systemBlocks = ctx.brainAgent.buildSystemBlocks(ctx.persona, STABLE_BRIEF_INSTRUCTIONS, clock, tzName);

      try {
        const { data } = await ctx.brainAgent.structured(
          { brain: ctx.brain, budget: ctx.budget, purpose: 'running.brief' },
          { model: ctx.config.olafModelSmart, systemBlocks, messages: [{ role: 'user', content: prompt }], maxTokens: 2000 },
          BRIEF_SCHEMA,
        );
        await repo.insertBrief(session.id, data, ctx.config.olafModelSmart, inputHash);
        return { sessionId: session.id, brief: data };
      } catch (err) {
        if (ctx.sendOlafError(reply, err)) return reply;
        request.log.error({ err }, 'running brief failed');
        return reply.code(500).send({ error: 'internal_error' });
      }
    },
  );

  app.post(
    '/v1/running/cue',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['runClientId', 'trigger', 'snapshot'],
          properties: {
            sessionId: { type: ['string', 'null'] },
            runClientId: { type: 'string' },
            trigger: { type: 'string', enum: CUE_TRIGGERS },
            snapshot: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      const { sessionId = null, runClientId, trigger, snapshot } = request.body;
      if (!ctx.brain.available) return reply.code(503).send({ error: 'olaf_unavailable' });

      const recentCues = await repo.getRecentCues(runClientId, 3);
      const systemBlocks = ctx.brainAgent.buildSystemBlocks(ctx.persona, STABLE_CUE_INSTRUCTIONS, clock, tzName);
      const prompt = buildCuePrompt(trigger, snapshot, recentCues);

      try {
        const { data } = await ctx.brainAgent.structured(
          { brain: ctx.brain, budget: ctx.budget, purpose: 'running.cue' },
          { model: ctx.config.olafModelFast, systemBlocks, messages: [{ role: 'user', content: prompt }], maxTokens: 150 },
          CUE_SCHEMA,
        );
        await repo.insertCue({ runClientId, sessionId, elapsedS: snapshot.elapsed_s ?? 0, trigger, text: data.say, source: 'live' });
        return { say: data.say };
      } catch (err) {
        await repo.insertCue({ runClientId, sessionId, elapsedS: snapshot.elapsed_s ?? 0, trigger, text: null, source: 'fallback' });
        if (ctx.sendOlafError(reply, err)) return reply;
        return { say: null };
      }
    },
  );

  app.post('/v1/running/debrief/:runId', async (request, reply) => {
    if (!ctx.brain.available) return reply.code(503).send({ error: 'olaf_unavailable' });
    const run = await repo.getRunById(request.params.runId);
    if (!run) return reply.code(404).send({ error: 'not_found' });

    const session = run.sessionId ? await repo.getSessionById(run.sessionId) : null;
    const [samples, events] = await Promise.all([repo.getSamples(run.id, {}), repo.getEvents(run.id)]);
    const analysis = analyzeRun({ samples, events, segments: session?.segments || [] });

    const systemBlocks = ctx.brainAgent.buildSystemBlocks(ctx.persona, STABLE_DEBRIEF_INSTRUCTIONS, clock, tzName);
    const prompt = buildDebriefPrompt(run, session, analysis);

    try {
      const result = await ctx.brainAgent.runAgent(
        {
          brain: ctx.brain,
          toolRegistry: ctx.tools,
          budget: ctx.budget,
          events: ctx.events,
          purpose: 'running.debrief',
          toolCtx: { running: runningDeps },
        },
        { model: ctx.config.olafModelSmart, systemBlocks, messages: [{ role: 'user', content: prompt }], maxTokens: 1500 },
      );
      await ctx.events.publish(EVENTS.RUNNING_DEBRIEF_READY, { runId: run.id, text: result.text });
      return { text: result.text };
    } catch (err) {
      if (ctx.sendOlafError(reply, err)) return reply;
      request.log.error({ err }, 'running debrief failed');
      return reply.code(500).send({ error: 'internal_error' });
    }
  });

  app.get('/v1/running/reminders', async () => {
    const today = localDateString(clock(), tzName);
    const [settings, sessions] = await Promise.all([
      repo.getSettings(),
      repo.getSessionsBetween(today, addDays(today, 13)),
    ]);
    return { reminders: buildReminderSpecs(sessions, settings, tzName) };
  });
}

/**
 * Register the running.materialize / running.reminders / running.debrief job
 * handlers and recurring schedules against the live ctx.
 * @param {object} ctx
 */
export function registerJobs(ctx) {
  const repo = ctx.runningRepo || createRunningRepo(ctx.db);
  const clock = ctx.clock || (() => new Date());
  const tzName = ctx.config?.tzName || 'UTC';
  const runningDeps = { repo, events: ctx.events, clock, tzName };

  ctx.jobs.registerHandler('running.materialize', async () => {
    await materialize(runningDeps, { days: 14 });
  });

  ctx.jobs.registerHandler('running.reminders', async () => {
    const today = localDateString(clock(), tzName);
    const [settings, sessions] = await Promise.all([
      repo.getSettings(),
      repo.getSessionsBetween(today, addDays(today, 13)),
    ]);
    const specs = buildReminderSpecs(sessions, settings, tzName);

    const reminders = [];
    for (const spec of specs) {
      let body = spec.body;
      let generatedBy = 'fallback';
      if (ctx.brain.available) {
        try {
          await ctx.budget.assertWithinBudget();
          const systemBlocks = ctx.brainAgent.buildSystemBlocks(ctx.persona, STABLE_REMINDER_INSTRUCTIONS, clock, tzName);
          const { data } = await ctx.brainAgent.structured(
            { brain: ctx.brain, budget: ctx.budget, purpose: 'running.reminder' },
            {
              model: ctx.config.olafModelFast,
              systemBlocks,
              messages: [{ role: 'user', content: `Write a short reminder for: ${spec.title} - ${spec.body}` }],
              maxTokens: 120,
            },
            { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } },
          );
          body = data.text;
          generatedBy = 'olaf';
        } catch {
          // keep the plain factual fallback body
        }
      }
      reminders.push({ fireAt: spec.fireAt, title: spec.title, body, sessionId: spec.sessionId, generatedBy });
    }
    await repo.insertReminders(reminders);
  });

  ctx.jobs.registerHandler('running.debrief', async (payload) => {
    const run = await repo.getRunById(payload.runId);
    if (!run || !ctx.brain.available) return;
    const session = run.sessionId ? await repo.getSessionById(run.sessionId) : null;
    const [samples, events] = await Promise.all([repo.getSamples(run.id, {}), repo.getEvents(run.id)]);
    const analysis = analyzeRun({ samples, events, segments: session?.segments || [] });
    const systemBlocks = ctx.brainAgent.buildSystemBlocks(ctx.persona, STABLE_DEBRIEF_INSTRUCTIONS, clock, tzName);
    const prompt = buildDebriefPrompt(run, session, analysis);
    const result = await ctx.brainAgent.runAgent(
      {
        brain: ctx.brain,
        toolRegistry: ctx.tools,
        budget: ctx.budget,
        events: ctx.events,
        purpose: 'running.debrief',
        toolCtx: { running: runningDeps },
      },
      { model: ctx.config.olafModelSmart, systemBlocks, messages: [{ role: 'user', content: prompt }], maxTokens: 1500 },
    );
    await ctx.events.publish(EVENTS.RUNNING_DEBRIEF_READY, { runId: run.id, text: result.text });
  });

  ctx.jobs.registerRecurring({ type: 'running.materialize', everyDayAt: '03:00' });
  ctx.jobs.registerRecurring({ type: 'running.reminders', everyDayAt: '03:30' });
}
