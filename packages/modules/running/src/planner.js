import crypto from 'node:crypto';
import { addDays, localDateString, EVENTS } from '@snowman/shared';
import { workoutFor } from './program.js';
import { validateChange } from './rules.js';

/** Thrown when a proposed plan change fails rules.validateChange. */
export class PlanRuleViolation extends Error {
  constructor(violations) {
    super('Plan change violates guardrails');
    this.name = 'PlanRuleViolation';
    this.statusCode = 422;
    this.violations = violations;
  }
}

function localToday(clock, tzName) {
  return localDateString(clock ? clock() : new Date(), tzName || 'UTC');
}

function runMinutesOf(session) {
  if (!session?.segments) return 0;
  return session.segments.filter((s) => s.kind === 'run').reduce((sum, s) => sum + s.seconds, 0) / 60;
}

async function previousWeekRunMinutes(repo, referenceDate) {
  const sessions = await repo.getSessionsBetween(addDays(referenceDate, -7), addDays(referenceDate, -1));
  return sessions.reduce((sum, s) => sum + runMinutesOf(s), 0);
}

/**
 * Fill the next `days` days from the program, skipping any date that
 * already has a session (program-sourced planned sessions can optionally be
 * overwritten, e.g. after repeatWeek shifts the schedule - anything the user
 * or Olaf touched, or that's already done, is never overwritten).
 *
 * @param {{repo: object, clock?: () => Date, tzName?: string}} deps
 * @param {{fromDate?: string, days?: number, overwriteProgramSessions?: boolean}} [opts]
 */
export async function materialize(deps, opts = {}) {
  const { repo, clock, tzName } = deps;
  const { days = 14, overwriteProgramSessions = false } = opts;
  const settings = await repo.getSettings();
  if (!settings) throw new Error('running settings not configured');
  const start = opts.fromDate || localToday(clock, tzName);

  const created = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const existing = await repo.getSessionByDate(date);
    if (existing) {
      const canOverwrite = overwriteProgramSessions && existing.source === 'program' && existing.status === 'planned';
      if (!canOverwrite) continue;
    }
    const workout = workoutFor(date, settings);
    const session = {
      id: existing?.id || crypto.randomUUID(),
      date,
      kind: workout.kind,
      title: workout.title,
      summary: workout.summary,
      segments: workout.segments,
      status: 'planned',
      source: 'program',
      programWeek: workout.programWeek,
    };
    await repo.upsertSession(session);
    created.push(session);
  }
  return created;
}

/**
 * @param {{repo: object, events: object, clock?: () => Date, tzName?: string}} deps
 * @param {{sessionId: string, toDate: string, reason?: string, actor?: string}} args
 */
export async function moveSession(deps, args) {
  const { repo, events, clock, tzName } = deps;
  const { sessionId, toDate, reason, actor = 'user' } = args;
  const session = await repo.getSessionById(sessionId);
  if (!session) throw new Error('session not found');

  const today = localToday(clock, tzName);
  const window = await repo.getSessionsBetween(addDays(today, -7), addDays(today, 21));
  const proposed = [{ date: toDate, kind: session.kind, segments: session.segments }];
  const context = {
    today,
    existingSessions: window.filter((s) => s.id !== sessionId),
    previousWeekRunMinutes: await previousWeekRunMinutes(repo, toDate),
  };
  const check = validateChange(proposed, context);
  if (!check.ok) throw new PlanRuleViolation(check.violations);

  const before = { ...session };
  const after = { ...session, date: toDate, status: 'planned' };
  await repo.upsertSession(after);
  await repo.insertPlanDecision({ at: (clock || (() => new Date()))(), actor, action: 'move', reason: reason ?? null, before, after });
  await events.publish(EVENTS.RUNNING_PLAN_CHANGED, { sessionId, action: 'move', toDate });
  return after;
}

const REPLACE_KINDS = {
  rest: (minutes) => ({ kind: 'rest', title: 'Rest day', summary: 'Rest day (replaced).', segments: [] }),
  walk: (minutes = 25) => ({
    kind: 'walk',
    title: 'Recovery walk',
    summary: `${minutes} min walk (replaced).`,
    segments: [{ kind: 'walk', seconds: minutes * 60 }],
  }),
  easy_run: (minutes = 20) => ({
    kind: 'run',
    title: 'Easy run',
    summary: `${minutes} min easy run (replaced).`,
    segments: [
      { kind: 'warmup', seconds: 300 },
      { kind: 'run', seconds: minutes * 60 },
      { kind: 'cooldown', seconds: 300 },
    ],
  }),
};

/**
 * @param {{repo: object, events: object, clock?: () => Date, tzName?: string}} deps
 * @param {{sessionId: string, kind: 'walk'|'easy_run'|'rest', minutes?: number, reason?: string, actor?: string}} args
 */
export async function replaceSession(deps, args) {
  const { repo, events, clock, tzName } = deps;
  const { sessionId, kind, minutes, reason, actor = 'user' } = args;
  const build = REPLACE_KINDS[kind];
  if (!build) throw new Error(`unknown replace kind: ${kind}`);

  const session = await repo.getSessionById(sessionId);
  if (!session) throw new Error('session not found');
  const replacement = build(minutes);

  const today = localToday(clock, tzName);
  const window = await repo.getSessionsBetween(addDays(today, -7), addDays(today, 7));
  const proposed = [{ date: session.date, kind: replacement.kind, segments: replacement.segments }];
  const context = {
    today,
    existingSessions: window.filter((s) => s.id !== sessionId),
    previousWeekRunMinutes: await previousWeekRunMinutes(repo, session.date),
  };
  const check = validateChange(proposed, context);
  if (!check.ok) throw new PlanRuleViolation(check.violations);

  const before = { ...session };
  const after = { ...session, ...replacement, status: 'replaced', source: 'user' };
  await repo.upsertSession(after);
  await repo.insertPlanDecision({ at: (clock || (() => new Date()))(), actor, action: 'replace', reason: reason ?? null, before, after });
  await events.publish(EVENTS.RUNNING_PLAN_CHANGED, { sessionId, action: 'replace', kind });
  return after;
}

/**
 * @param {{repo: object, events: object, clock?: () => Date}} deps
 * @param {{sessionId: string, reason?: string, actor?: string}} args
 */
export async function skipSession(deps, args) {
  const { repo, events, clock } = deps;
  const { sessionId, reason, actor = 'user' } = args;
  const session = await repo.getSessionById(sessionId);
  if (!session) throw new Error('session not found');

  const before = { ...session };
  const after = { ...session, status: 'skipped' };
  await repo.upsertSession(after);
  await repo.insertPlanDecision({ at: (clock || (() => new Date()))(), actor, action: 'skip', reason: reason ?? null, before, after });
  await events.publish(EVENTS.RUNNING_PLAN_CHANGED, { sessionId, action: 'skip' });
  return after;
}

/**
 * Shift program_start +7 days and re-materialize future program sessions.
 * @param {{repo: object, events: object, clock?: () => Date, tzName?: string}} deps
 * @param {{reason?: string, actor?: string}} [args]
 */
export async function repeatWeek(deps, args = {}) {
  const { repo, events, clock, tzName } = deps;
  const { reason, actor = 'user' } = args;
  const settings = await repo.getSettings();
  if (!settings) throw new Error('running settings not configured');

  const before = { ...settings };
  const after = { ...settings, programStart: addDays(settings.programStart, 7) };
  await repo.setSettings(after);

  const today = localToday(clock, tzName);
  const created = await materialize(
    { repo, clock, tzName },
    { fromDate: today, days: 14, overwriteProgramSessions: true },
  );

  await repo.insertPlanDecision({ at: (clock || (() => new Date()))(), actor, action: 'repeat_week', reason: reason ?? null, before, after });
  await events.publish(EVENTS.RUNNING_PLAN_CHANGED, { action: 'repeat_week' });
  return { settings: after, created };
}
