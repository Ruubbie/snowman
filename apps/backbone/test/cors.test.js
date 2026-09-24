import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

const BASE_CONFIG = {
  tzName: 'Europe/Amsterdam',
  olafModelSmart: 'claude-sonnet-5',
  olafModelFast: 'claude-haiku-4-5',
  aiMonthlyBudgetUsd: 15,
  corsOrigins: 'http://localhost:8081',
};

function fakeDeviceRepo() {
  return { async findActiveDeviceByTokenHash() { return null; } };
}

function buildTestApp(overrides = {}) {
  return buildApp({
    config: { ...BASE_CONFIG, ...overrides },
    deviceRepo: fakeDeviceRepo(),
    events: { publish: async () => {} },
    jobs: { enqueue: async () => {}, registerHandler() {}, registerRecurring() {} },
    brain: { available: false },
    budget: { assertWithinBudget: async () => {}, logUsage: async () => 0, monthTotalUsd: async () => 0 },
    runningRepo: {},
  });
}

test('OPTIONS preflight from an allowed origin gets CORS headers and 204', async () => {
  const app = buildTestApp();
  const res = await app.inject({
    method: 'OPTIONS',
    url: '/v1/health',
    headers: { origin: 'http://localhost:8081', 'access-control-request-method': 'GET' },
  });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:8081');
  assert.match(res.headers['access-control-allow-headers'], /Authorization/);
});

test('GET from an allowed origin gets Access-Control-Allow-Origin', async () => {
  const app = buildTestApp();
  const res = await app.inject({ method: 'GET', url: '/v1/health', headers: { origin: 'http://localhost:8081' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:8081');
});

test('a disallowed origin gets no CORS header', async () => {
  const app = buildTestApp();
  const res = await app.inject({ method: 'GET', url: '/v1/health', headers: { origin: 'http://evil.example' } });
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('CORS_ORIGINS supports a comma-separated list', async () => {
  const app = buildTestApp({ corsOrigins: 'http://localhost:8081,http://localhost:19006' });
  const res = await app.inject({ method: 'GET', url: '/v1/health', headers: { origin: 'http://localhost:19006' } });
  assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:19006');
});
