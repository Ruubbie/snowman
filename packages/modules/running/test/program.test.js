import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workoutFor } from '../src/program.js';

// program_start 2026-01-06 (Tuesday), rest_weekday=1 (Sunday).
// Position = days after the rest weekday: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6.
const settings = { programStart: '2026-01-06', restWeekday: 1 };

test('week 1 day 1 (position 1, Monday) is 4x4min run with 1min walks + warmup/cooldown', () => {
  const workout = workoutFor('2026-01-12', settings); // week 1, Monday, position 1
  assert.equal(workout.kind, 'run');
  assert.equal(workout.programWeek, 1);
  assert.deepEqual(workout.segments, [
    { kind: 'warmup', seconds: 300 },
    { kind: 'run', seconds: 240 },
    { kind: 'walk', seconds: 60 },
    { kind: 'run', seconds: 240 },
    { kind: 'walk', seconds: 60 },
    { kind: 'run', seconds: 240 },
    { kind: 'walk', seconds: 60 },
    { kind: 'run', seconds: 240 },
    { kind: 'cooldown', seconds: 300 },
  ]);
});

test('week 8 is a continuous 30 minute run on a run day', () => {
  const workout = workoutFor('2026-03-02', settings); // week 8, Monday, position 1
  assert.equal(workout.kind, 'run');
  assert.equal(workout.programWeek, 8);
  assert.deepEqual(workout.segments, [
    { kind: 'warmup', seconds: 300 },
    { kind: 'run', seconds: 1800 },
    { kind: 'cooldown', seconds: 300 },
  ]);
});

test('maintenance weeks after week 8 keep repeating the continuous 30 minute run', () => {
  const workout = workoutFor('2026-03-16', settings); // week 10, Monday, position 1
  assert.equal(workout.kind, 'run');
  assert.ok(workout.programWeek >= 8);
  assert.deepEqual(workout.segments, [
    { kind: 'warmup', seconds: 300 },
    { kind: 'run', seconds: 1800 },
    { kind: 'cooldown', seconds: 300 },
  ]);
});

test('position 6 short easy run is 20 min continuous once the week pattern is continuous (week 8)', () => {
  const workout = workoutFor('2026-02-28', settings); // week 8, Saturday, position 6
  assert.equal(workout.programWeek, 8);
  assert.equal(workout.kind, 'run');
  assert.deepEqual(workout.segments, [
    { kind: 'warmup', seconds: 300 },
    { kind: 'run', seconds: 1200 },
    { kind: 'cooldown', seconds: 300 },
  ]);
});

test('position 6 short easy run is reps-1 during weeks 5-8 interval patterns (week 5)', () => {
  const workout = workoutFor('2026-02-07', settings); // week 5, Saturday, position 6; intervals [10,1,3]
  assert.equal(workout.programWeek, 5);
  assert.deepEqual(workout.segments, [
    { kind: 'warmup', seconds: 300 },
    { kind: 'run', seconds: 600 },
    { kind: 'walk', seconds: 60 },
    { kind: 'run', seconds: 600 },
    { kind: 'cooldown', seconds: 300 },
  ]);
});

test('weeks 1-4 have no run day at position 6 (it is a recovery walk instead)', () => {
  const workout = workoutFor('2026-01-17', settings); // week 2, Saturday, position 6
  assert.ok(workout.programWeek <= 4);
  assert.equal(workout.kind, 'walk');
  assert.deepEqual(workout.segments, [{ kind: 'walk', seconds: 1500 }]);
});

test('the rest weekday itself is a rest day with no segments', () => {
  const workout = workoutFor('2026-01-11', settings); // Sunday, position 0
  assert.equal(workout.kind, 'rest');
  assert.deepEqual(workout.segments, []);
});

test('non-run, non-rest days are a 25 minute recovery walk', () => {
  const workout = workoutFor('2026-01-13', settings); // week 2, Tuesday, position 2
  assert.equal(workout.kind, 'walk');
  assert.deepEqual(workout.segments, [{ kind: 'walk', seconds: 1500 }]);
});
