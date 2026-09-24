import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateChange } from '../src/rules.js';

function violationCodes(result) {
  return result.violations.map((v) => v.code);
}

test('valid change with no existing sessions passes', () => {
  const result = validateChange([{ date: '2026-02-02', kind: 'run', segments: [] }], {
    today: '2026-02-01',
    existingSessions: [],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test('max one session per day is violated by duplicate proposed dates', () => {
  const result = validateChange(
    [
      { date: '2026-02-02', kind: 'run', segments: [] },
      { date: '2026-02-02', kind: 'walk', segments: [] },
    ],
    { today: '2026-02-01', existingSessions: [] },
  );
  assert.equal(result.ok, false);
  assert.ok(violationCodes(result).includes('max_one_per_day'));
});

test('cannot move a session into the past', () => {
  const result = validateChange([{ date: '2026-01-31', kind: 'run', segments: [] }], {
    today: '2026-02-01',
    existingSessions: [],
  });
  assert.equal(result.ok, false);
  assert.ok(violationCodes(result).includes('no_past_dates'));
});

test('requires at least one rest day in any fully-known 7-day window', () => {
  const existingSessions = [
    { date: '2026-02-02', kind: 'run', segments: [] },
    { date: '2026-02-03', kind: 'walk', segments: [] },
    { date: '2026-02-04', kind: 'run', segments: [] },
    { date: '2026-02-05', kind: 'walk', segments: [] },
    { date: '2026-02-06', kind: 'run', segments: [] },
    { date: '2026-02-07', kind: 'walk', segments: [] },
    { date: '2026-02-08', kind: 'run', segments: [] }, // no rest day anywhere in this window
  ];
  const result = validateChange([], { today: '2026-02-01', existingSessions });
  assert.equal(result.ok, false);
  assert.ok(violationCodes(result).includes('min_one_rest_day_per_week'));
});

test('a rest day somewhere in the 7-day window satisfies the guardrail', () => {
  const existingSessions = [
    { date: '2026-02-02', kind: 'run', segments: [] },
    { date: '2026-02-03', kind: 'walk', segments: [] },
    { date: '2026-02-04', kind: 'run', segments: [] },
    { date: '2026-02-05', kind: 'rest', segments: [] },
    { date: '2026-02-06', kind: 'run', segments: [] },
    { date: '2026-02-07', kind: 'walk', segments: [] },
    { date: '2026-02-08', kind: 'run', segments: [] },
  ];
  const result = validateChange([], { today: '2026-02-01', existingSessions });
  assert.equal(result.ok, true);
});

test('no more than 2 consecutive run days', () => {
  const existingSessions = [
    { date: '2026-02-02', kind: 'run', segments: [] },
    { date: '2026-02-03', kind: 'run', segments: [] },
    { date: '2026-02-04', kind: 'run', segments: [] },
  ];
  const result = validateChange([], { today: '2026-02-01', existingSessions });
  assert.equal(result.ok, false);
  assert.ok(violationCodes(result).includes('max_two_consecutive_run_days'));
});

test('2 consecutive run days is allowed', () => {
  const existingSessions = [
    { date: '2026-02-02', kind: 'run', segments: [] },
    { date: '2026-02-03', kind: 'run', segments: [] },
    { date: '2026-02-04', kind: 'rest', segments: [] },
  ];
  const result = validateChange([], { today: '2026-02-01', existingSessions });
  assert.equal(result.ok, true);
});

test('weekly run minutes may not exceed last week by more than 10%, unless the starter program', () => {
  const runSegments = (minutes) => [{ kind: 'run', seconds: minutes * 60 }];
  const proposed = [{ date: '2026-02-02', kind: 'run', segments: runSegments(200) }]; // way more than +10%
  const result = validateChange(proposed, {
    today: '2026-02-01',
    existingSessions: [],
    previousWeekRunMinutes: 100,
  });
  assert.equal(result.ok, false);
  assert.ok(violationCodes(result).includes('weekly_run_increase_cap'));
});

test('the weekly increase cap is skipped for the starter program itself', () => {
  const runSegments = (minutes) => [{ kind: 'run', seconds: minutes * 60 }];
  const proposed = [{ date: '2026-02-02', kind: 'run', segments: runSegments(200) }];
  const result = validateChange(proposed, {
    today: '2026-02-01',
    existingSessions: [],
    previousWeekRunMinutes: 100,
    isStarterProgram: true,
  });
  assert.equal(result.ok, true);
});

test('an increase within 10% is allowed', () => {
  const runSegments = (minutes) => [{ kind: 'run', seconds: minutes * 60 }];
  const proposed = [{ date: '2026-02-02', kind: 'run', segments: runSegments(105) }];
  const result = validateChange(proposed, {
    today: '2026-02-01',
    existingSessions: [],
    previousWeekRunMinutes: 100,
  });
  assert.equal(result.ok, true);
});
