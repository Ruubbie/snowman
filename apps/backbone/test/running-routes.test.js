import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { sha256Hex } from '../src/core/auth.js';

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
  const cues = [];
  return {
    sessions,
    briefs,
    cues,
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
    async insertBrief(sessionId, brief, model) {
      briefs.set(sessionId, { brief, model });
    },
    async insertCue(cue) {
      cues.push(cue);
    },
    async getRecentCues() {
      return [];
    },
  };
}

function fakeBrainWith(response) {
  return { available: true, async createMessage() { return response; } };
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
    segments: [],
    status: 'planned',
    source: 'program',
    programWeek: 1,
  });

  const briefJson = {
    focus: ['pace'],
    opening_line: "Let's go!",
    targets: [{ segment_index: 0, kind: 'run', pace_min_s_per_km: 300, pace_max_s_per_km: 360, feel: 'easy' }],
    fallback_lines: {
      too_fast: 'slow down',
      too_slow: 'pick it up',
      to_run: 'run',
      to_walk: 'walk',
      km_split: 'split',
      halfway: 'halfway',
      finish: 'finish',
      encourage: 'go you',
    },
  };
  const brain = fakeBrainWith({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(briefJson) }],
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

test('POST /v1/running/cue returns a short structured spoken cue and logs it as "live"', async () => {
  const runningRepo = fakeRunningRepo();
  const brain = fakeBrainWith({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify({ say: 'Nice pace, keep it up!' }) }],
    usage: {},
  });

  const app = buildTestApp({ brain, runningRepo });
  const response = await app.inject({
    method: 'POST',
    url: '/v1/running/cue',
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
    payload: { runClientId: 'run-1', trigger: 'checkin', snapshot: { elapsed_s: 120 } },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().say, 'Nice pace, keep it up!');
  assert.equal(runningRepo.cues.length, 1);
  assert.equal(runningRepo.cues[0].source, 'live');
  assert.equal(runningRepo.cues[0].trigger, 'checkin');

  // Fast tier (haiku) must never receive a thinking parameter (checked at the API-call level in agent.test.js).
});

test('POST /v1/running/cue falls back and logs a "fallback" cue when Olaf refuses', async () => {
  const runningRepo = fakeRunningRepo();
  const brain = {
    available: true,
    async createMessage() {
      return { stop_reason: 'refusal', stop_details: { category: 'other' }, content: [], usage: {} };
    },
  };

  const app = buildTestApp({ brain, runningRepo });
  const response = await app.inject({
    method: 'POST',
    url: '/v1/running/cue',
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
    payload: { runClientId: 'run-2', trigger: 'too_fast', snapshot: { elapsed_s: 30 } },
  });

  assert.equal(response.statusCode, 422);
  assert.equal(runningRepo.cues.length, 1);
  assert.equal(runningRepo.cues[0].source, 'fallback');
  assert.equal(runningRepo.cues[0].text, null);
});

test('running routes require a Bearer token', async () => {
  const app = buildTestApp({ brain: fakeBrainWith({}), runningRepo: fakeRunningRepo() });
  const response = await app.inject({ method: 'POST', url: '/v1/running/cue', payload: {} });
  assert.equal(response.statusCode, 401);
});
