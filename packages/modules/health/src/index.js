import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENTS } from '@snowman/shared';
import { createHealthRepo } from './repo.js';
import { summarizeDays } from './summary.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const BODY_LIMIT_10MB = 10 * 1024 * 1024;

const sampleSchema = {
  type: 'object',
  required: ['uuid', 'type', 'start', 'end', 'value'],
  properties: {
    uuid: { type: 'string', maxLength: 36 },
    type: { type: 'string', maxLength: 40 },
    start: { type: 'string' },
    end: { type: 'string' },
    value: { type: 'number' },
    unit: { type: ['string', 'null'], maxLength: 16 },
    source: { type: ['string', 'null'], maxLength: 100 },
  },
};

const workoutSchema = {
  type: 'object',
  required: ['uuid', 'activity', 'start', 'end', 'duration_s'],
  properties: {
    uuid: { type: 'string', maxLength: 36 },
    activity: { type: 'string', maxLength: 40 },
    start: { type: 'string' },
    end: { type: 'string' },
    duration_s: { type: 'number' },
    distance_m: { type: ['number', 'null'] },
    energy_kcal: { type: ['number', 'null'] },
    avg_hr: { type: ['number', 'null'] },
    max_hr: { type: ['number', 'null'] },
    source: { type: ['string', 'null'], maxLength: 100 },
  },
};

/** Daily health numbers and workouts for the last `days` days. */
export async function healthSummary(repo, clock, days) {
  const since = new Date(clock().getTime() - days * 86400000);
  const [rows, workouts] = await Promise.all([repo.dailyRows(since), repo.workoutsSince(since)]);
  return { days: summarizeDays(rows), workouts };
}

const healthTools = [
  {
    name: 'health_get_summary',
    description:
      "Get the user's Apple Health data per day (sleep minutes, resting heart rate, HRV, VO2max, body mass) " +
      'and their workouts for the last N days, newest first. Use it for questions about recovery, sleep or training.',
    risk: 'read',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: { days: { type: 'integer', minimum: 1, maximum: 90, description: 'Default 14' } },
    },
    async handler(input, ctx) {
      return healthSummary(ctx.health.repo, ctx.health.clock, input.days || 14);
    },
  },
];

/** @type {import('../../../../apps/backbone/src/core/modules.js').SnowmanModule} */
const healthModule = {
  name: 'health',
  migrationsDir: MIGRATIONS_DIR,
  tools: healthTools,
  register(app, ctx) {
    const repo = ctx.healthRepo || createHealthRepo(ctx.db);
    const clock = ctx.clock || (() => new Date());
    if (ctx.toolCtx) ctx.toolCtx.health = { repo, clock };

    app.post(
      '/v1/health/import',
      {
        bodyLimit: BODY_LIMIT_10MB,
        schema: {
          body: {
            type: 'object',
            properties: {
              samples: { type: 'array', items: sampleSchema, default: [] },
              workouts: { type: 'array', items: workoutSchema, default: [] },
            },
          },
        },
      },
      async (request) => {
        const { samples = [], workouts = [] } = request.body || {};
        if (samples.length) await repo.upsertSamples(samples);
        if (workouts.length) await repo.upsertWorkouts(workouts);
        if (samples.length || workouts.length) {
          // The workouts themselves ride along so the running module can match runs to the plan.
          await ctx.events.publish(EVENTS.HEALTH_IMPORTED, { samples: samples.length, workouts });
        }
        return { samples: samples.length, workouts: workouts.length };
      },
    );

    app.get('/v1/health/summary', async (request) => {
      const days = Math.min(Math.max(Number(request.query.days) || 14, 1), 90);
      return healthSummary(repo, clock, days);
    });
  },
};

export default healthModule;
export { createHealthRepo, summarizeDays };
