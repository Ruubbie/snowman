import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { sha256Hex } from '../src/core/auth.js';
import { normalizeBrief } from '../../../packages/modules/running/src/routes.js';

const TEST_TOKEN = 'test-token-1234567890';
const BASE_CONFIG = {
  tzName: 'Europe/Amsterdam',
  olafModelSmart: 'claude-sonnet-5',
  olafModelFast: 'claude-haiku-4-5',
  aiMonthlyBudgetUsd: 15,
};

function fakeDeviceRepo() {
  return {
    async findActiveDeviceByTokenHash(hash) {
      return hash === sha256Hex(TEST_TOKEN) ? { id: 'device-1', name: 'Test Device' } : null;
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

function fakeRunningRepo() {
  const sessions = new Map();
  const briefs = new Map();
  return {
    sessions,
    briefs,
    async getSessionById(id) {
      return sessions.get(id) || null;
    },
    async getSettings() {
      return { programStart: '2026-01-06', restWeekday: 1, reminderHour: 18 };
    },
    async getRecentRuns() {
      return [];
    },
    async getRecentPlanDecisions() {
      return [];
    },
    async getBrief(sessionId) {
      return briefs.get(sessionId) || null;
    },
    async insertBrief(sessionId, brief, model, inputHash = null) {
      briefs.set(sessionId, { brief, model, inputHash });
    },
    async getBriefByInputHash(inputHash) {
      return [...briefs.values()].find((b) => b.inputHash === inputHash) || null;
    },
    async getSessionsBetween(from, to) {
      return [...sessions.values()].filter((x) => x.date >= from && x.date <= to).sort((a, b) => a.date.localeCompare(b.date));
    },
  };
}

function fakeBrainWith(response) {
  const calls = [];
  return { available: true, calls, async createMessage(req) { calls.push(req); return response; } };
}

function buildTestApp({ brain, runningRepo }) {
  return buildApp({
    config: BASE_CONFIG,
    db: null,
    brain,
    budget: fakeBudget(),
    persona: 'Olaf test persona',
    deviceRepo: fakeDeviceRepo(),
    runningRepo,
    events: { async publish() {} },
  });
}

test('POST /v1/running/brief returns Olaf structured output and stores it', async () => {
  const sessionId = 'sess-1';
  const runningRepo = fakeRunningRepo();
  runningRepo.sessions.set(sessionId, {
    id: sessionId,
    date: '2026-02-02',
    kind: 'run',
    title: 'Week 1 Run',
    summary: 's',
    segments: [
      { kind: 'walk', seconds: 300 },
      { kind: 'run', seconds: 240 },
      { kind: 'walk', seconds: 60 },
      { kind: 'run', seconds: 240 },
      { kind: 'walk', seconds: 300 },
    ],
    status: 'planned',
    source: 'program',
    programWeek: 1,
  });

  const answer = {
    focus: ['pace'],
    opening_line: "Let's go!",
    targets: [{ segment_index: 1, kind: 'run', pace_min_s_per_km: 300, pace_max_s_per_km: 360, feel: 'easy' }],
    switches: ['Run one!', 'Walk a minute.', 'Last run!', 'All done running.'],
    lines: {
      too_fast: ['slow down', 'easy there', 'whoa'],
      too_slow: ['pick it up'],
      km_split: ['a kilometre', 'another'],
      encourage: ['go you'],
      halfway: 'halfway',
      finish: 'finish',
      paused: 'paused',
      resumed: 'back on',
      gps_lost: 'no gps',
    },
  };
  const briefJson = {
    focus: answer.focus,
    opening_line: answer.opening_line,
    targets: answer.targets,
    lines: {
      too_fast: ['slow down', 'easy there', 'whoa'],
      too_slow: ['pick it up'],
      km_split: ['a kilometre', 'another'],
      encourage: ['go you'],
      halfway: ['halfway'],
      finish: ['finish'],
      paused: ['paused'],
      resumed: ['back on'],
      gps_lost: ['no gps'],
    },
    switch_lines: { 1: 'Run one!', 2: 'Walk a minute.', 3: 'Last run!', 4: 'All done running.' },
    fallback_lines: {
      too_fast: 'slow down',
      too_slow: 'pick it up',
      to_run: 'Run one!',
      to_walk: 'Walk a minute.',
      km_split: 'a kilometre',
      halfway: 'halfway',
      finish: 'finish',
      encourage: 'go you',
    },
  };
  const brain = fakeBrainWith({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(answer) }],
    usage: { input_tokens: 10, output_tokens: 10 },
  });

  const app = buildTestApp({ brain, runningRepo });
  const response = await app.inject({
    method: 'POST',
    url: '/v1/running/brief',
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
    payload: { sessionId },
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.sessionId, sessionId);
  assert.deepEqual(body.brief, briefJson);
  assert.deepEqual(runningRepo.briefs.get(sessionId).brief, briefJson);
  // The prompt lays out every switch so each line fits its place.
  const prompt = brain.calls[0].messages[0].content;
  assert.match(prompt, /exactly 4 lines/);
  assert.match(prompt, /run 2 of 2, the last one/);

  // Same inputs again (e.g. the Today screen refreshing): stored brief, no second Olaf call.
  const again = await app.inject({
    method: 'POST',
    url: '/v1/running/brief',
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
    payload: { sessionId },
  });
  assert.equal(again.statusCode, 200);
  assert.equal(again.json().cached, true);
  assert.deepEqual(again.json().brief, briefJson);
  assert.equal(brain.calls.length, 1);
});

test('POST /v1/running/brief returns 404 for an unknown session', async () => {
  const app = buildTestApp({ brain: fakeBrainWith({}), runningRepo: fakeRunningRepo() });
  const response = await app.inject({
    method: 'POST',
    url: '/v1/running/brief',
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
    payload: { sessionId: 'nope' },
  });
  assert.equal(response.statusCode, 404);
});

test('POST /v1/running/brief returns 503 olaf_unavailable when Olaf has no API key', async () => {
  const sessionId = 'sess-1';
  const runningRepo = fakeRunningRepo();
  runningRepo.sessions.set(sessionId, {
    id: sessionId,
    date: '2026-02-02',
    kind: 'run',
    title: 't',
    summary: 's',
    segments: [],
    status: 'planned',
    source: 'program',
    programWeek: 1,
  });

  const brain = { available: false, async createMessage() { throw new Error('should not be called'); } };
  const app = buildTestApp({ brain, runningRepo });
  const response = await app.inject({
    method: 'POST',
    url: '/v1/running/brief',
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
    payload: { sessionId },
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error, 'olaf_unavailable');
});

test('running routes require a Bearer token', async () => {
  const app = buildTestApp({ brain: fakeBrainWith({}), runningRepo: fakeRunningRepo() });
  const response = await app.inject({ method: 'GET', url: '/v1/running/today' });
  assert.equal(response.statusCode, 401);
});

const BRIEF = {
  focus: ['easy'],
  opening_line: 'Off we go.',
  targets: [],
  switches: [],
  lines: {
    too_fast: ['a'], too_slow: ['b'], km_split: ['e'], encourage: ['h'], halfway: 'f', finish: 'g', paused: 'p', resumed: 'r', gps_lost: 'x',
  },
};

function session(id, date, extra = {}) {
  return {
    id, date, kind: 'walk', title: 'Recovery walk', summary: '25 min walk', segments: [{ kind: 'walk', seconds: 1500 }],
    status: 'planned', source: 'program', programWeek: 1, ...extra,
  };
}

test('a brief is written once per workout: the same workout on another day reuses it without an AI call', async () => {
  const runningRepo = fakeRunningRepo();
  runningRepo.sessions.set('a', session('a', '2026-02-02'));
  runningRepo.sessions.set('b', session('b', '2026-02-05'));
  runningRepo.sessions.set('c', session('c', '2026-02-06', { segments: [{ kind: 'walk', seconds: 1800 }] }));
  const brain = fakeBrainWith({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(BRIEF) }], usage: {} });
  const app = buildTestApp({ brain, runningRepo });
  const post = (sessionId) =>
    app.inject({ method: 'POST', url: '/v1/running/brief', headers: { authorization: `Bearer ${TEST_TOKEN}` }, payload: { sessionId } });

  assert.equal((await post('a')).statusCode, 200);
  const b = await post('b');
  assert.equal(b.json().cached, true);
  assert.deepEqual(b.json().brief, normalizeBrief(BRIEF, session('b', '2026-02-05')));
  assert.equal(brain.calls.length, 1);
  await post('c'); // different segments: a new brief
  assert.equal(brain.calls.length, 2);
});

test('GET /v1/running/upcoming lists the next days with any stored brief', async () => {
  const runningRepo = fakeRunningRepo();
  runningRepo.sessions.set('a', session('a', '2026-02-02'));
  runningRepo.sessions.set('r', session('r', '2026-02-03', { kind: 'rest', title: 'Rest', segments: [] }));
  runningRepo.sessions.set('z', session('z', '2026-03-01'));
  runningRepo.briefs.set('a', { brief: BRIEF, model: 'm', inputHash: 'x' });
  const brain = { available: false, async createMessage() { throw new Error('no AI calls here'); } };
  const app = buildApp({
    config: BASE_CONFIG, db: null, brain, budget: fakeBudget(), deviceRepo: fakeDeviceRepo(), runningRepo,
    events: { async publish() {} }, clock: () => new Date('2026-02-02T08:00:00Z'),
  });
  const res = await app.inject({ method: 'GET', url: '/v1/running/upcoming?days=4', headers: { authorization: `Bearer ${TEST_TOKEN}` } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.today, '2026-02-02');
  assert.deepEqual(body.sessions.map((x) => x.id), ['a', 'r']);
  assert.deepEqual(body.sessions[0].brief, BRIEF);
  assert.equal(body.sessions[1].brief, null);
});
