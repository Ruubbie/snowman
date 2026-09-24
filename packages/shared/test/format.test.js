import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, formatPace, parseClock } from '../src/format.js';

test('formatDuration', () => {
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(3661), '1:01:01');
  assert.equal(formatDuration(0), '0:00');
});

test('formatPace', () => {
  assert.equal(formatPace(365), '6:05/km');
  assert.equal(formatPace(null), '–:––/km');
  assert.equal(formatPace(undefined), '–:––/km');
});

test('parseClock handles M:SS and H:MM:SS', () => {
  assert.equal(parseClock('9:55'), 595);
  assert.equal(parseClock('1:02:03'), 3723);
  assert.equal(parseClock('not a clock'), null);
});
