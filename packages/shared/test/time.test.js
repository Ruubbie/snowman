import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDateString, zonedTimeToUtc, addDays, diffDays, dayOfWeek } from '../src/time.js';

test('localDateString formats a UTC instant into the target timezone local date', () => {
  // 2026-01-01T23:30:00Z is already 2026-01-02 in Europe/Amsterdam (CET, UTC+1).
  const date = new Date('2026-01-01T23:30:00Z');
  assert.equal(localDateString(date, 'Europe/Amsterdam'), '2026-01-02');
  assert.equal(localDateString(date, 'UTC'), '2026-01-01');
});

test('zonedTimeToUtc converts local wall-clock time to the correct UTC instant (CET, winter)', () => {
  const utc = zonedTimeToUtc({ year: 2026, month: 1, day: 15, hour: 10, minute: 0 }, 'Europe/Amsterdam');
  assert.equal(utc.toISOString(), '2026-01-15T09:00:00.000Z');
});

test('zonedTimeToUtc converts local wall-clock time to the correct UTC instant (CEST, summer)', () => {
  const utc = zonedTimeToUtc({ year: 2026, month: 7, day: 15, hour: 10, minute: 0 }, 'Europe/Amsterdam');
  assert.equal(utc.toISOString(), '2026-07-15T08:00:00.000Z');
});

test('addDays/diffDays are calendar-pure and inverse of each other', () => {
  assert.equal(addDays('2026-01-30', 3), '2026-02-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(diffDays('2026-02-02', '2026-01-30'), 3);
});

test('dayOfWeek matches JS Date.getUTCDay convention', () => {
  assert.equal(dayOfWeek('2026-01-11'), 0); // Sunday
  assert.equal(dayOfWeek('2026-01-12'), 1); // Monday
});
