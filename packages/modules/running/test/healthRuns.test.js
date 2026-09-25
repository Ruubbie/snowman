import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importHealthRuns } from '../src/healthRuns.js';

function fakeRepo({ runs = [], sessions = [] } = {}) {
  const done = [];
  const upserted = [];
  return {
    done,
    upserted,
    async getRecentRuns() {
      return runs;
    },
    async getSessionByDate(date) {
      return sessions.find((s) => s.date === date) || null;
    },
    async upsertRunSummary(run) {
      upserted.push(run);
      return `run-${upserted.length}`;
    },
    async markSessionDone(id) {
      done.push(id);
    },
  };
}

const now = new Date('2026-09-25T18:00:00Z');
const opts = { now, tzName: 'Europe/Amsterdam' };
const workout = (over = {}) => ({
  uuid: 'A1',
  activity: 'running',
  start: '2026-09-25T16:00:00Z',
  end: '2026-09-25T16:32:00Z',
  duration_s: 1800,
  distance_m: 4000,
  source: 'Fitness',
  ...over,
});

test('a Fitness run on a planned day becomes a run and completes the session', async () => {
  const repo = fakeRepo({ sessions: [{ id: 's1', date: '2026-09-25', kind: 'intervals', status: 'planned' }] });
  const ids = await importHealthRuns(repo, [workout()], opts);
  assert.deepEqual(ids, ['run-1']);
  assert.equal(repo.upserted[0].clientId, 'hk-A1');
  assert.equal(repo.upserted[0].sessionId, 's1');
  assert.equal(repo.upserted[0].avgPaceSPerKm, 450);
  assert.equal(repo.upserted[0].elapsedTimeS, 1920);
  assert.deepEqual(repo.done, ['s1']);
});

test('a run on a rest day is stored without a session', async () => {
  const repo = fakeRepo({ sessions: [{ id: 's1', date: '2026-09-25', kind: 'rest', status: 'planned' }] });
  await importHealthRuns(repo, [workout()], opts);
  assert.equal(repo.upserted[0].sessionId, null);
  assert.deepEqual(repo.done, []);
});

test('skips old workouts, other activities and runs it already has', async () => {
  const repo = fakeRepo({ runs: [{ clientId: 'x', startedAt: '2026-09-25T16:04:00Z' }] });
  const ids = await importHealthRuns(
    repo,
    [workout(), workout({ uuid: 'B', start: '2026-08-01T08:00:00Z' }), workout({ uuid: 'C', activity: 'cycling' })],
    opts,
  );
  assert.deepEqual(ids, []);
});
