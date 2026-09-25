import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { sha256Hex } from '../src/core/auth.js';

const TEST_TOKEN = 'test-token-1234567890';
const AUTH = { authorization: `Bearer ${TEST_TOKEN}` };
const BASE_CONFIG = {
  tzName: 'Europe/Amsterdam',
  olafModelSmart: 'claude-sonnet-5',
  olafModelFast: 'claude-haiku-4-5',
  aiMonthlyBudgetUsd: 15,
};

function fakeDeviceRepo() {
  return {
    async findActiveDeviceByTokenHash(hash) {
      return hash === sha256Hex(TEST_TOKEN) ? { id: 'device-1', name: 'Desktop' } : null;
    },
  };
}

function fakeBudget() {
  return {
    async assertWithinBudget() {},
    async logUsage() {
      return 0;
    },
    async monthTotalUsd() {
      return 0;
    },
  };
}

/** Core admin repo stub: the overview only needs these. */
function fakeCoreAdminRepo() {
  return {
    async overview() {
      return { counts: {}, lastActivity: {} };
    },
    async listAiUsage() {
      return { total: 0, rows: [], month: { byPurpose: [], byModel: [] }, byMonth: [] };
    },
    async listEvents() {
      return { total: 0, events: [], types: [] };
    },
  };
}

function baseRun(over = {}) {
  return {
    id: 'run-1',
    clientId: 'client-1',
    sessionId: 'sess-1',
    startedAt: new Date('2026-09-20T07:00:00Z'),
    durationS: 1800,
    distanceM: 3200,
    imported: false,
    device: null,
    sampleCount: 3,
    nativeSampleCount: 3,
    eventCount: 2,
    cueCount: 1,
    duplicateCount: 0,
    session: { id: 'sess-1', title: 'Week 1', date: '2026-09-20', status: 'done' },
    ...over,
  };
}

/** In-memory stand-in for createRunningAdminRepo(). */
function fakeRunningAdminRepo() {
  const runs = new Map([
    ['run-1', baseRun()],
    [
      'run-2',
      baseRun({ id: 'run-2', clientId: 'client-2', sessionId: null, session: null, imported: true, sampleCount: 0, nativeSampleCount: 0, distanceM: 50 }),
    ],
  ]);
  const briefs = new Map([['sess-1', { sessionId: 'sess-1', brief: { focus: [] }, model: 'm' }]]);
  return {
    runs,
    briefs,
    async overviewStats({ today }) {
      return { counts: { runs: runs.size }, totals: { distanceM: 3250, timeS: 3600 }, lastActivity: {}, nextSession: null, today };
    },
    async listRuns({ limit, offset }) {
      const all = [...runs.values()];
      return { total: all.length, runs: all.slice(offset, offset + limit) };
    },
    async getRun(id) {
      return runs.get(id) || null;
    },
    async getRunParts() {
      return {
        samples: [
          { seq: 0, t_s: 0, dist_m: 0, speed_mps: 3, accepted: true },
          { seq: 1, t_s: 1, dist_m: 3, speed_mps: 3, accepted: true },
          { seq: 2, t_s: 2, dist_m: 999, speed_mps: 9, accepted: false },
        ],
        events: [{ seq: 0, t_s: 0, type: 'start', data: null }],
        cues: [{ id: 1, elapsedS: 60, trigger: 'km_split', text: 'Nice', source: 'live' }],
        session: { id: 'sess-1', segments: [{ kind: 'run', seconds: 60 }] },
        brief: null,
        debrief: { text: 'Good run', at: new Date() },
      };
    },
    async deleteRuns(ids) {
      const deleted = [];
      const notFound = [];
      for (const id of ids) {
        const run = runs.get(id);
        if (!run) {
          notFound.push(id);
          continue;
        }
        runs.delete(id);
        deleted.push({ id, clientId: run.clientId, samples: run.sampleCount, events: run.eventCount, cues: run.cueCount, sessionReset: Boolean(run.sessionId) });
      }
      return { deleted, notFound };
    },
    async listPlanDecisions() {
      return { total: 1, decisions: [{ id: 1, action: 'move', before: { date: 'a' }, after: { date: 'b' } }] };
    },
    async listBriefs() {
      return { total: briefs.size, briefs: [...briefs.values()] };
    },
    async deleteBrief(sessionId) {
      return briefs.delete(sessionId);
    },
  };
}

function buildTestApp() {
  const runningAdminRepo = fakeRunningAdminRepo();
  const published = [];
  const app = buildApp({
    config: BASE_CONFIG,
    db: null,
    brain: { available: false },
    budget: fakeBudget(),
    deviceRepo: fakeDeviceRepo(),
    adminRepo: fakeCoreAdminRepo(),
    runningAdminRepo,
    events: {
      subscribe() {},
      async publish(type, payload) {
        published.push({ type, payload });
      },
    },
    clock: () => new Date('2026-09-24T10:00:00Z'),
  });
  return { app, runningAdminRepo, published };
}

test('the running module adds its card to /v1/admin/overview', async () => {
  const { app } = buildTestApp();
  const res = await app.inject({ method: 'GET', url: '/v1/admin/overview', headers: AUTH });
  assert.equal(res.statusCode, 200);
  const running = res.json().modules.running;
  assert.equal(running.counts.runs, 2);
  assert.equal(running.today, '2026-09-24');
  assert.equal(running.recentRuns.length, 2);
  assert.equal(running.recentRuns[1].source, 'imported');
});

test('GET /v1/admin/running/runs decorates source + suspect flags and validates paging', async () => {
  const { app } = buildTestApp();
  const res = await app.inject({ method: 'GET', url: '/v1/admin/running/runs?limit=10&offset=0', headers: AUTH });
  assert.equal(res.statusCode, 200);
  const { runs, total } = res.json();
  assert.equal(total, 2);
  assert.equal(runs[0].source, 'native');
  assert.deepEqual(runs[0].suspect, []);
  assert.equal(runs[1].source, 'imported');
  assert.deepEqual(runs[1].suspect, ['no_samples', 'too_short']);

  const bad = await app.inject({ method: 'GET', url: '/v1/admin/running/runs?limit=0', headers: AUTH });
  assert.equal(bad.statusCode, 400);
  const unauth = await app.inject({ method: 'GET', url: '/v1/admin/running/runs' });
  assert.equal(unauth.statusCode, 401);
});

test('GET /v1/admin/running/runs/:id returns samples, cues, debrief and analysis over accepted samples', async () => {
  const { app } = buildTestApp();
  const res = await app.inject({ method: 'GET', url: '/v1/admin/running/runs/run-1', headers: AUTH });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.samples.length, 3);
  assert.equal(body.cues[0].trigger, 'km_split');
  assert.equal(body.debrief.text, 'Good run');
  assert.equal(body.analysis.paceSeries, undefined);
  assert.equal(body.analysis.maxSpeedMps, 3); // the rejected sample is excluded

  const missing = await app.inject({ method: 'GET', url: '/v1/admin/running/runs/nope', headers: AUTH });
  assert.equal(missing.statusCode, 404);
});

test('DELETE /v1/admin/running/runs/:id deletes and records admin.run_deleted', async () => {
  const { app, runningAdminRepo, published } = buildTestApp();
  const res = await app.inject({ method: 'DELETE', url: '/v1/admin/running/runs/run-1', headers: AUTH });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().deleted.samples, 3);
  assert.equal(runningAdminRepo.runs.has('run-1'), false);
  assert.equal(published[0].type, 'admin.run_deleted');
  assert.equal(published[0].payload.byDeviceId, 'device-1');

  const again = await app.inject({ method: 'DELETE', url: '/v1/admin/running/runs/run-1', headers: AUTH });
  assert.equal(again.statusCode, 404);
});

test('POST /v1/admin/running/runs/delete bulk-deletes and reports unknown ids', async () => {
  const { app, runningAdminRepo, published } = buildTestApp();
  const res = await app.inject({
    method: 'POST',
    url: '/v1/admin/running/runs/delete',
    headers: AUTH,
    payload: { ids: ['run-1', 'run-2', 'ghost'] },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(body.deleted.map((d) => d.id), ['run-1', 'run-2']);
  assert.deepEqual(body.notFound, ['ghost']);
  assert.equal(runningAdminRepo.runs.size, 0);
  assert.equal(published.length, 2);

  const empty = await app.inject({ method: 'POST', url: '/v1/admin/running/runs/delete', headers: AUTH, payload: { ids: [] } });
  assert.equal(empty.statusCode, 400);
});

test('plan decisions and briefs list; deleting a brief forces regeneration next time', async () => {
  const { app, runningAdminRepo } = buildTestApp();
  const decisions = await app.inject({ method: 'GET', url: '/v1/admin/running/plan-decisions', headers: AUTH });
  assert.equal(decisions.json().decisions[0].after.date, 'b');

  const briefs = await app.inject({ method: 'GET', url: '/v1/admin/running/briefs', headers: AUTH });
  assert.equal(briefs.json().total, 1);

  const del = await app.inject({ method: 'DELETE', url: '/v1/admin/running/briefs/sess-1', headers: AUTH });
  assert.equal(del.statusCode, 200);
  assert.equal(runningAdminRepo.briefs.size, 0);
  const missing = await app.inject({ method: 'DELETE', url: '/v1/admin/running/briefs/sess-1', headers: AUTH });
  assert.equal(missing.statusCode, 404);
});
