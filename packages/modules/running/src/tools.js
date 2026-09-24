/**
 * Olaf tools for the running module. `ctx.running` (injected by
 * apps/backbone/src/brain/agent.js as `toolCtx`) carries {repo, events,
 * clock, tzName}.
 */
import { moveSession, replaceSession, skipSession, repeatWeek, PlanRuleViolation } from './planner.js';

function plannerDeps(ctx) {
  const { repo, events, clock, tzName } = ctx.running;
  return { repo, events, clock, tzName };
}

function explainViolation(err) {
  if (err instanceof PlanRuleViolation) {
    return new Error(`Guardrail violation: ${err.violations.map((v) => v.message).join('; ')}`);
  }
  return err;
}

export const runningTools = [
  {
    name: 'running_get_plan',
    description: "Get the runner's planned sessions between two dates (inclusive), formatted YYYY-MM-DD.",
    risk: 'read',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['from', 'to'],
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
      },
    },
    async handler(input, ctx) {
      return ctx.running.repo.getSessionsBetween(input.from, input.to);
    },
  },
  {
    name: 'running_get_recent_runs',
    description: "Get the runner's most recently uploaded runs, newest first.",
    risk: 'read',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: [],
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
    },
    async handler(input, ctx) {
      return ctx.running.repo.getRecentRuns(input.limit ?? 10);
    },
  },
  {
    name: 'running_move_session',
    description: 'Move a planned session to a different date. Subject to plan guardrails (rest days, consecutive-run limits, etc).',
    risk: 'write',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['session_id', 'to_date', 'reason'],
      properties: {
        session_id: { type: 'string' },
        to_date: { type: 'string', description: 'YYYY-MM-DD' },
        reason: { type: 'string' },
      },
    },
    async handler(input, ctx) {
      try {
        return await moveSession(plannerDeps(ctx), {
          sessionId: input.session_id,
          toDate: input.to_date,
          reason: input.reason,
          actor: 'olaf',
        });
      } catch (err) {
        throw explainViolation(err);
      }
    },
  },
  {
    name: 'running_replace_session',
    description: 'Replace a planned session with a walk, easy run, or rest day. Subject to plan guardrails.',
    risk: 'write',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['session_id', 'kind', 'reason'],
      properties: {
        session_id: { type: 'string' },
        kind: { type: 'string', enum: ['walk', 'easy_run', 'rest'] },
        minutes: { type: 'integer', minimum: 1, maximum: 180 },
        reason: { type: 'string' },
      },
    },
    async handler(input, ctx) {
      try {
        return await replaceSession(plannerDeps(ctx), {
          sessionId: input.session_id,
          kind: input.kind,
          minutes: input.minutes,
          reason: input.reason,
          actor: 'olaf',
        });
      } catch (err) {
        throw explainViolation(err);
      }
    },
  },
  {
    name: 'running_skip_session',
    description: 'Mark a planned session as skipped.',
    risk: 'write',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['session_id', 'reason'],
      properties: { session_id: { type: 'string' }, reason: { type: 'string' } },
    },
    async handler(input, ctx) {
      return skipSession(plannerDeps(ctx), { sessionId: input.session_id, reason: input.reason, actor: 'olaf' });
    },
  },
  {
    name: 'running_repeat_week',
    description: "Shift the program back a week (repeat the current week) when the runner isn't ready to progress.",
    risk: 'write',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['reason'],
      properties: { reason: { type: 'string' } },
    },
    async handler(input, ctx) {
      return repeatWeek(plannerDeps(ctx), { reason: input.reason, actor: 'olaf' });
    },
  },
];

export default runningTools;
