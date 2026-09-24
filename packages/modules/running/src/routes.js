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

/** Olaf nudging, a bit harder each time: first call, second call, last call. */
function reminderBody(summary, nth) {
  return [
    `${summary}. Shoes on? I'm ready when you are!`,
    `Still waiting by the door! ${summary}. Let's go!`,
    `Last call! ${summary} before the day is over. Up you get!`,
  ][nth];
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
        body: reminderBody(session.summary, hour === uniqueHours[0] ? 0 : hour === 21 ? 2 : 1),
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
    'The fallback lines are recorded in advance and played word for word at those moments during the run, ' +
      'so they are all the runner hears: use the planned paces and durations from the targets (e.g. "aim for 6:30 per ' +
      'kilometre", "one minute of walking"), never numbers you cannot know in advance like the actual split.',
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

/**
 * Pre-synthesise the brief's spoken lines in the background (low priority)
 * and return their deterministic audio ids/urls right away. null when the
 * server voice is off/unavailable - the phone then uses on-device speech.
 * @param {{enqueue: (text: string, o?: object) => ({id: string, url: string}|null)}|undefined} voice
 * @param {{opening_line?: string, fallback_lines?: Record<string, string>}} brief
 */
export function briefAudio(voice, brief) {
  if (!voice?.enabled || !brief) return null;
  // Opening line first: it is the first thing the runner hears.
  const opening_line = typeof brief.opening_line === 'string' ? voice.enqueue(brief.opening_line) : null;
  const fallback_lines = {};
  for (const [key, text] of Object.entries(brief.fallback_lines || {})) {
    fallback_lines[key] = typeof text === 'string' ? voice.enqueue(text) : null;
  }
  if (!opening_line && Object.values(fallback_lines).every((v) => !v)) return null;
  return { opening_line, fallback_lines };
}

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

/** How far ahead Olaf writes briefs and records their lines. */
const PREPARE_DAYS = 3;
/** Opening the app re-checks the next days at most this often. */
const PREPARE_MIN_INTERVAL_MS = 5 * 60 * 1000;

function preparable(session) {
  return (session.kind === 'run' || session.kind === 'walk') && session.status === 'planned';
}

/**
 * What a brief's lines depend on: the workout itself, not the latest runs.
 * So a brief is written once per workout, and a skipped workout's lines (and
 * their recorded voice) are reused the next time the same workout comes up.
 */
function briefInputHash(ctx, session) {
  const workout = { kind: session.kind, title: session.title, summary: session.summary, segments: session.segments };
  return createHash('sha256')
    .update([ctx.config.olafModelSmart, ctx.persona || '', STABLE_BRIEF_INSTRUCTIONS, JSON.stringify(workout)].join('\n'))
    .digest('hex');
}

/**
 * Briefs and their pre-recorded voice, shared by the routes and the jobs.
 * @param {object} ctx backbone ctx
 * @param {{warn: Function}} [log]
 */
export function createRunningShared(ctx, log = console) {
  const repo = ctx.runningRepo || createRunningRepo(ctx.db);
  const clock = ctx.clock || (() => new Date());
  const tzName = ctx.config?.tzName || 'UTC';
  const deps = { repo, events: ctx.events, clock, tzName };

  /**
   * The session's brief: stored, copied from the same workout, or written now
   * (one AI call). null when Olaf is offline and there is nothing stored.
   * Throws Olaf errors (budget, refusal...) from the AI call.
   * @returns {Promise<{brief: object, cached: boolean, stale?: boolean}|null>}
   */
  async function ensureBrief(session, { force = false } = {}) {
    const inputHash = briefInputHash(ctx, session);
    const stored = await repo.getBrief(session.id);
    if (!force) {
      if (stored && stored.inputHash === inputHash) return { brief: stored.brief, cached: true };
      const same = await repo.getBriefByInputHash?.(inputHash);
      if (same) {
        await repo.insertBrief(session.id, same.brief, same.model, inputHash);
        return { brief: same.brief, cached: true };
      }
    }
    // Olaf offline: an older brief is better than none.
    if (!ctx.brain.available) return stored ? { brief: stored.brief, cached: true, stale: true } : null;

    const [settings, recentRuns, recentDecisions] = await Promise.all([
      repo.getSettings(),
      repo.getRecentRuns(10),
      repo.getRecentPlanDecisions(10),
    ]);
    const prompt = buildBriefPrompt(session, settings, recentRuns, recentDecisions);
    const systemBlocks = ctx.brainAgent.buildSystemBlocks(ctx.persona, STABLE_BRIEF_INSTRUCTIONS, clock, tzName);
    const { data } = await ctx.brainAgent.structured(
      { brain: ctx.brain, budget: ctx.budget, purpose: 'running.brief' },
      { model: ctx.config.olafModelSmart, systemBlocks, messages: [{ role: 'user', content: prompt }], maxTokens: 2000 },
      BRIEF_SCHEMA,
    );
    await repo.insertBrief(session.id, data, ctx.config.olafModelSmart, inputHash);
    return { brief: data, cached: false };
  }

  let preparing = null;
  let lastPrepareAt = 0;

  /**
   * Write briefs for the next few days' planned sessions and queue Olaf's
   * voice for their lines (low priority), long before the runner heads out.
   * One pass at a time; `minIntervalMs` skips a pass that ran recently.
   */
  function prepareUpcoming({ minIntervalMs = 0 } = {}) {
    if (preparing) return preparing;
    if (Date.now() - lastPrepareAt < minIntervalMs) return Promise.resolve();
    lastPrepareAt = Date.now();
    preparing = (async () => {
      const today = localDateString(clock(), tzName);
      const sessions = await repo.getSessionsBetween(today, addDays(today, PREPARE_DAYS - 1));
      for (const session of sessions.filter(preparable)) {
        try {
          const res = await ensureBrief(session);
          if (res) briefAudio(ctx.voice, res.brief);
        } catch (err) {
          log.warn({ err, sessionId: session.id }, 'preparing a brief failed');
        }
      }
    })().finally(() => {
      preparing = null;
    });
    return preparing;
  }

  /** Fire-and-forget prepare when an app shows up (throttled). */
  function nudgePrepare() {
    if (!repo.getSessionsBetween) return;
    prepareUpcoming({ minIntervalMs: PREPARE_MIN_INTERVAL_MS }).catch((err) => log.warn({ err }, 'prepare failed'));
  }

  return { repo, deps, clock, tzName, ensureBrief, prepareUpcoming, nudgePrepare };
}

/** How many of a brief's lines are already recorded in Olaf's voice: {ready, total}. */
function voiceProgress(voice, brief) {
  if (!voice?.enabled || !brief || typeof voice.has !== 'function') return null;
  const lines = [brief.opening_line, ...Object.values(brief.fallback_lines || {})].filter((t) => typeof t === 'string' && t);
  return { ready: lines.filter((t) => voice.has(t)).length, total: lines.length };
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {object} ctx backbone ctx: {db, runningRepo?, config, events, jobs, tools, brain, budget, persona, brainAgent, sendOlafError, clock?, toolCtx?}
 * @param {ReturnType<typeof createRunningShared>} [shared]
 */
export function registerRoutes(app, ctx, shared = createRunningShared(ctx, app.log)) {
  const { repo, clock, tzName, deps: runningDeps } = shared;
  // Olaf's running tools (move/skip a session...) also work when chatting with him.
  if (ctx.toolCtx) ctx.toolCtx.running = runningDeps;

  app.get('/v1/running/today', async () => {
    const date = localDateString(clock(), tzName);
    let session = await repo.getSessionByDate(date);
    if (!session) {
      const created = await materialize(runningDeps, { fromDate: date, days: 1 });
      session = created[0] || null;
    }
    shared.nudgePrepare();
    return { date, session, cards: buildTodayCards(session) };
  });

  // The next few days as planned right now (it can still change), each with
  // its brief and how much of Olaf's voice for it is recorded. No AI calls.
  app.get(
    '/v1/running/upcoming',
    { schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 14 } } } } },
    async (request) => {
      const today = localDateString(clock(), tzName);
      const days = request.query?.days ?? 5;
      const sessions = await repo.getSessionsBetween(today, addDays(today, days - 1));
      shared.nudgePrepare();
      return {
        today,
        sessions: await Promise.all(
          sessions.map(async (session) => {
            const brief = preparable(session) ? ((await repo.getBrief(session.id))?.brief ?? null) : null;
            return { ...session, brief, audio: briefAudio(ctx.voice, brief), voice: voiceProgress(ctx.voice, brief) };
          }),
        ),
      };
    },
  );

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
      shared.nudgePrepare(); // the plan may shift after a run

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
      try {
        const res = await shared.ensureBrief(session, { force: request.body.force });
        if (!res) return reply.code(503).send({ error: 'olaf_unavailable' });
        return {
          sessionId: session.id,
          brief: res.brief,
          ...(res.cached ? { cached: true } : {}),
          ...(res.stale ? { stale: true } : {}),
          audio: briefAudio(ctx.voice, res.brief),
        };
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
        // Queued ahead of any brief pre-synthesis; the client's GET on audio.url waits for it.
        return { say: data.say, audio: data.say ? (ctx.voice?.enqueue(data.say, { priority: 'high' }) ?? null) : null };
      } catch (err) {
        await repo.insertCue({ runClientId, sessionId, elapsedS: snapshot.elapsed_s ?? 0, trigger, text: null, source: 'fallback' });
        if (ctx.sendOlafError(reply, err)) return reply;
        return { say: null, audio: null };
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
 * Register the running.materialize / running.prepare / running.reminders /
 * running.debrief job handlers and recurring schedules against the live ctx.
 * @param {object} ctx
 * @param {ReturnType<typeof createRunningShared>} [shared]
 */
export function registerJobs(ctx, shared = createRunningShared(ctx)) {
  const { repo, clock, tzName, deps: runningDeps } = shared;

  ctx.jobs.registerHandler('running.materialize', async () => {
    await materialize(runningDeps, { days: 14 });
  });

  ctx.jobs.registerHandler('running.prepare', async () => {
    await shared.prepareUpcoming();
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
  ctx.jobs.registerRecurring({ type: 'running.prepare', everyDayAt: '03:15' });
  ctx.jobs.registerRecurring({ type: 'running.reminders', everyDayAt: '03:30' });
}
