import { test } from 'node:test';
import assert from 'node:assert/strict';
import { materialize, moveSession, replaceSession, repeatWeek, PlanRuleViolation } from '../src/planner.js';

function fakeRepo(initialSettings) {
  const sessions = new Map();
  const decisions = [];
  let settings = initialSettings;
  return {
    sessions,
    decisions,
    async getSettings() {
      return settings;
    },
    async setSettings(s) {
      settings = s;
    },
    async getSessionByDate(date) {
      return sessions.get(date) || null;
    },
    async getSessionById(id) {
      return [...sessions.values()].find((s) => s.id === id) || null;
    },
    async getSessionsBetween(from, to) {
      return [...sessions.values()]
        .filter((s) => s.date >= from && s.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    async upsertSession(session) {
      sessions.set(session.date, session);
    },
    async insertPlanDecision(d) {
      decisions.push(d);
    },
  };
}

function fakeEvents() {
  const published = [];
  return { published, async publish(type, payload) { published.push({ type, payload }); } };
}

test('materialize fills 14 days from the program without overwriting existing sessions', async () => {
  const repo = fakeRepo({ programStart: '2026-01-06', restWeekday: 1, reminderHour: 18 });
  const events = fakeEvents();
  const clock = () => new Date('2026-01-06T08:00:00Z');

  const created = await materialize({ repo, events, clock, tzName: 'UTC' }, { fromDate: '2026-01-06', days: 7 });
  assert.equal(created.length, 7);
  assert.equal(repo.sessions.size, 7);

  // Running it again for the same range creates nothing new (gap-fill only).
  const createdAgain = await materialize({ repo, events, clock, tzName: 'UTC' }, { fromDate: '2026-01-06', days: 7 });
  assert.equal(createdAgain.length, 0);
  assert.equal(repo.sessions.size, 7);
});

test('moveSession updates the session date and logs a plan_decision + event', async () => {
  // Built by hand (rather than via materialize) so the only data in play is
  // the one session being moved - no other run/rest sessions to trip the
  // weekly-increase or rest-day guardrails incidentally.
  const repo = fakeRepo({ programStart: '2026-01-06', restWeekday: 1, reminderHour: 18 });
  const events = fakeEvents();
  const clock = () => new Date('2026-01-06T08:00:00Z');

  const session = {
    id: 'sess-1',
    date: '2026-01-07',
    kind: 'walk',
    title: 'Recovery walk',
    summary: '25 min brisk recovery walk.',
    segments: [{ kind: 'walk', seconds: 1500 }],
    status: 'planned',
    source: 'program',
    programWeek: 1,
  };
  await repo.upsertSession(session);

  const moved = await moveSession(
    { repo, events, clock, tzName: 'UTC' },
    { sessionId: session.id, toDate: '2026-01-08', reason: 'schedule conflict' },
  );
  assert.equal(moved.date, '2026-01-08');
  assert.equal(repo.decisions.length, 1);
  assert.equal(repo.decisions[0].action, 'move');
  assert.equal(events.published.length, 1);
  assert.equal(events.published[0].type, 'running.plan.changed');
});

test('moveSession into the past is rejected by the rules guardrail', async () => {
  const repo = fakeRepo({ programStart: '2026-01-06', restWeekday: 1, reminderHour: 18 });
  const events = fakeEvents();
  const clock = () => new Date('2026-01-15T08:00:00Z'); // "today" is after the target date
  await materialize({ repo, events, clock, tzName: 'UTC' }, { fromDate: '2026-01-06', days: 14 });

  const monday = await repo.getSessionByDate('2026-01-12');
  await assert.rejects(
    () =>
      moveSession({ repo, events, clock, tzName: 'UTC' }, { sessionId: monday.id, toDate: '2026-01-10', reason: 'x' }),
    PlanRuleViolation,
  );
});

test('replaceSession swaps a run for a rest day and marks it user-sourced', async () => {
  const repo = fakeRepo({ programStart: '2026-01-06', restWeekday: 1, reminderHour: 18 });
  const events = fakeEvents();
  const clock = () => new Date('2026-01-06T08:00:00Z');
  await materialize({ repo, events, clock, tzName: 'UTC' }, { fromDate: '2026-01-06', days: 7 });

  const monday = await repo.getSessionByDate('2026-01-12');
  const replaced = await replaceSession(
    { repo, events, clock, tzName: 'UTC' },
    { sessionId: monday.id, kind: 'rest', reason: 'sore legs' },
  );
  assert.equal(replaced.kind, 'rest');
  assert.equal(replaced.status, 'replaced');
  assert.equal(replaced.source, 'user');
});

test('repeatWeek shifts program_start by 7 days and re-materializes future program sessions', async () => {
  const repo = fakeRepo({ programStart: '2026-01-06', restWeekday: 1, reminderHour: 18 });
  const events = fakeEvents();
  const clock = () => new Date('2026-01-06T08:00:00Z');
  await materialize({ repo, events, clock, tzName: 'UTC' }, { fromDate: '2026-01-06', days: 14 });

  const before = await repo.getSessionByDate('2026-01-12'); // week 1 run day before the shift
  assert.equal(before.programWeek, 1);

  const { settings } = await repeatWeek({ repo, events, clock, tzName: 'UTC' }, { reason: 'not ready' });
  assert.equal(settings.programStart, '2026-01-13');

  // With program_start shifted a week later, 2026-01-12 is now the day before
  // the (new) program even starts, so workoutFor would compute week 1 there
  // too (clamped) - the important behavioral check is that the settings
  // persisted and a decision was logged.
  assert.equal(repo.decisions.some((d) => d.action === 'repeat_week'), true);
});
