import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseImportText, parseImportInput } from '../src/import.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TZ = 'Europe/Amsterdam';

test('parses the header, settings, and a full run line (en-US sample)', () => {
  const text = [
    'run. summary, Sep 24, 2026 at 6:10 PM',
    'Program: week 1 of 8 (started Sep 22, 2026). Rest day: Sunday. Reminders at 18:00.',
    '- Sep 23, 2026 at 6:40 PM | Week 1 · Run | 2.84 km in 28:12 | avg 9:55/km | plan completed: yes | splits: 9:40, 10:05 | effort 6/10 | note: felt ok',
  ].join('\n');

  const { settings, runs, unparsed } = parseImportText(text, { tzName: TZ });

  assert.deepEqual(unparsed, []);
  assert.equal(settings.programStart, '2026-09-22');
  assert.equal(settings.restWeekday, 1); // Sunday
  assert.equal(settings.reminderHour, 18);

  assert.equal(runs.length, 1);
  const run = runs[0];
  assert.equal(run.title, 'Week 1 · Run');
  assert.equal(run.distance_m, 2840);
  assert.equal(run.duration_s, 28 * 60 + 12);
  assert.equal(run.avg_pace_s_per_km, 9 * 60 + 55);
  assert.deepEqual(run.splits_s, [9 * 60 + 40, 10 * 60 + 5]);
  assert.equal(run.effort, 6);
  assert.equal(run.completed_plan, true);
  assert.equal(run.note, 'felt ok');
  // 2026-09-23 18:40 Europe/Amsterdam (CEST, UTC+2) -> 16:40 UTC
  assert.equal(run.startedAt, '2026-09-23T16:40:00.000Z');
});

test('a dash pace ("–:––/km") means no average pace', () => {
  const text = [
    'run. summary, Sep 24, 2026 at 6:10 PM',
    'Program: week 1 of 8 (started Sep 22, 2026). Rest day: Sunday. Reminders at 18:00.',
    '- Sep 23, 2026 at 6:40 PM | Week 1 · Run | 2.84 km in 28:12 | avg –:––/km | plan completed: no',
  ].join('\n');
  const { runs } = parseImportText(text, { tzName: TZ });
  assert.equal(runs[0].avg_pace_s_per_km, null);
  assert.equal(runs[0].completed_plan, false);
});

test('parses a Dutch-formatted date/time line', () => {
  const text = [
    'run. summary, 24 sep 2026 om 11:54',
    'Program: week 1 of 8 (started 22 sep 2026). Rest day: Sunday. Reminders at 18:00.',
    '- 23 sep 2026 om 18:40 | Week 1 · Run | 2.84 km in 28:12 | avg 9:55/km | plan completed: yes',
  ].join('\n');
  const { settings, runs } = parseImportText(text, { tzName: TZ });
  assert.equal(settings.programStart, '2026-09-22');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].startedAt, '2026-09-23T16:40:00.000Z');
});

test('unrecognized lines are collected in unparsed, not dropped silently', () => {
  const text = ['run. summary, Sep 24, 2026 at 6:10 PM', 'this is not a run line and has no pipe or dash prefix??'].join(
    '\n',
  );
  const { unparsed, runs } = parseImportText(text, { tzName: TZ });
  assert.equal(runs.length, 0);
  assert.equal(unparsed.length, 1);
});

test('accepts the structured JSON alternative', () => {
  const input = {
    runs: [
      {
        startedAt: '2026-09-23T16:40:00.000Z',
        title: 'Week 1 · Run',
        distance_m: 2840,
        duration_s: 1692,
        splits_s: [580, 605],
        effort: 6,
        note: 'felt ok',
      },
    ],
  };
  const { runs, settings, unparsed } = parseImportInput(input);
  assert.deepEqual(settings, {});
  assert.deepEqual(unparsed, []);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].distance_m, 2840);
  assert.equal(runs[0].note, 'felt ok');
});

test('real-world en-GB 24h export fixture parses settings and the one completed run', async () => {
  const text = await readFile(path.join(HERE, 'fixtures', 'runcoach-summary.txt'), 'utf8');
  const { settings, runs } = parseImportText(text, { tzName: TZ });

  assert.equal(settings.programStart, '2026-09-23');
  assert.equal(settings.restWeekday, 1); // Sunday
  assert.equal(settings.reminderHour, 11);

  assert.equal(runs.length, 1);
  const run = runs[0];
  assert.equal(run.title, 'Week 1 · Run');
  assert.equal(run.distance_m, 3910);
  assert.equal(run.duration_s, 1810);
  assert.equal(run.avg_pace_s_per_km, 463);
  assert.deepEqual(run.splits_s, [483, 414, 401]);
  assert.equal(run.effort, 5);
  assert.equal(run.completed_plan, true);
  assert.ok(run.note.includes('<<'));
  assert.equal(
    run.note,
    'Legs felt heavy near the end << sample note. Otherwise fine',
  );
  // 2026-09-23 23:35 Europe/Amsterdam (CEST, UTC+2) -> 21:35 UTC
  assert.equal(run.startedAt, '2026-09-23T21:35:00.000Z');
});
