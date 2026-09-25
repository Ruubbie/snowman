import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDays } from '../src/summary.js';

test('summarizeDays adds asleep stages, skips in-bed/awake, averages vitals, newest first', () => {
  const days = summarizeDays([
    { date: '2026-09-24', type: 'sleep_core', sum: 250, avg: 50 },
    { date: '2026-09-24', type: 'sleep_deep', sum: 80.4, avg: 40 },
    { date: '2026-09-24', type: 'sleep_in_bed', sum: 500, avg: 500 },
    { date: '2026-09-24', type: 'sleep_awake', sum: 20, avg: 10 },
    { date: '2026-09-24', type: 'resting_hr', sum: 104, avg: 52.04 },
    { date: '2026-09-25', type: 'hrv', sum: 90, avg: 45.26 },
  ]);
  assert.equal(days[0].date, '2026-09-25');
  assert.equal(days[0].hrv_ms, 45.3);
  assert.equal(days[1].sleep_min, 330);
  assert.equal(days[1].resting_hr, 52);
  assert.equal(days[1].hrv_ms, null);
});
