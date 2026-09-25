import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../src/client.js';
import { OlafUnavailable, Unauthorized, NetworkError } from '../src/errors.js';

function fakeFetch(handler) {
  return async (url, opts) => handler(url, opts);
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

test('health() calls GET /v1/health without auth header', async () => {
  let seen;
  const client = createClient({
    baseUrl: 'http://127.0.0.1:4000',
    getToken: () => 'should-not-be-used',
    fetchImpl: fakeFetch((url, opts) => {
      seen = { url, opts };
      return jsonResponse(200, { ok: true, olafAvailable: false });
    }),
  });
  const res = await client.health();
  assert.equal(res.ok, true);
  assert.equal(seen.url, 'http://127.0.0.1:4000/v1/health');
  assert.equal(seen.opts.headers.Authorization, undefined);
});

test('pair() posts code and deviceName, no auth', async () => {
  let seen;
  const client = createClient({
    baseUrl: 'http://127.0.0.1:4000',
    fetchImpl: fakeFetch((url, opts) => {
      seen = { url, opts };
      return jsonResponse(200, { token: 'abc', deviceId: 'dev-1' });
    }),
  });
  const res = await client.pair({ code: 'ABC123', deviceName: 'Browser' });
  assert.equal(res.token, 'abc');
  assert.equal(seen.opts.method, 'POST');
  assert.deepEqual(JSON.parse(seen.opts.body), { code: 'ABC123', deviceName: 'Browser' });
});

test('authenticated calls attach Bearer token from getToken', async () => {
  let seen;
  const client = createClient({
    baseUrl: 'http://127.0.0.1:4000',
    getToken: async () => 'tok-123',
    fetchImpl: fakeFetch((url, opts) => {
      seen = { url, opts };
      return jsonResponse(200, { date: '2026-01-01', session: null, cards: [] });
    }),
  });
  await client.running.today();
  assert.equal(seen.url, 'http://127.0.0.1:4000/v1/running/today');
  assert.equal(seen.opts.headers.Authorization, 'Bearer tok-123');
});

test('running.plan sends from/to as query params', async () => {
  let seen;
  const client = createClient({
    baseUrl: 'http://127.0.0.1:4000',
    getToken: () => 'tok',
    fetchImpl: fakeFetch((url) => {
      seen = url;
      return jsonResponse(200, { sessions: [] });
    }),
  });
  await client.running.plan({ from: '2026-01-01', to: '2026-01-07' });
  assert.equal(seen, 'http://127.0.0.1:4000/v1/running/plan?from=2026-01-01&to=2026-01-07');
});

test('running.uploadRun posts run/samples/events', async () => {
  let seen;
  const client = createClient({
    baseUrl: 'http://127.0.0.1:4000',
    getToken: () => 'tok',
    fetchImpl: fakeFetch((url, opts) => {
      seen = { url, opts };
      return jsonResponse(201, { id: 1, clientId: 'run-1' });
    }),
  });
  const res = await client.running.uploadRun({
    run: { clientId: 'run-1', startedAt: '2026-01-01T00:00:00Z', durationS: 60, distanceM: 100 },
    samples: [{ seq: 0, t_s: 0 }],
  });
  assert.equal(res.id, 1);
  const body = JSON.parse(seen.opts.body);
  assert.equal(body.run.clientId, 'run-1');
  assert.deepEqual(body.events, []);
});

test('503 olaf_unavailable throws OlafUnavailable', async () => {
  const client = createClient({
    baseUrl: 'http://127.0.0.1:4000',
    getToken: () => 'tok',
    fetchImpl: fakeFetch(() => jsonResponse(503, { error: 'olaf_unavailable' })),
  });
  await assert.rejects(() => client.running.brief('sess-1'), OlafUnavailable);
});

test('401 throws Unauthorized', async () => {
  const client = createClient({
    baseUrl: 'http://127.0.0.1:4000',
    getToken: () => null,
    fetchImpl: fakeFetch(() => jsonResponse(401, { error: 'unauthorized' })),
  });
  await assert.rejects(() => client.running.today(), Unauthorized);
});

test('fetch throwing wraps into NetworkError', async () => {
  const client = createClient({
    baseUrl: 'http://127.0.0.1:4000',
    getToken: () => 'tok',
    fetchImpl: fakeFetch(() => {
      throw new TypeError('Failed to fetch');
    }),
  });
  await assert.rejects(() => client.running.today(), NetworkError);
});

test('running.settings PUTs to /v1/running/settings', async () => {
  let seen;
  const client = createClient({
    baseUrl: 'http://127.0.0.1:4000',
    getToken: () => 'tok',
    fetchImpl: fakeFetch((url, opts) => {
      seen = { url, opts };
      return jsonResponse(200, { programStart: '2026-01-06', restWeekday: 1, reminderHour: 18 });
    }),
  });
  await client.running.settings({ programStart: '2026-01-06' });
  assert.equal(seen.opts.method, 'PUT');
});

test('admin calls hit /v1/admin with auth; deletes send no JSON content-type', async () => {
  const seen = [];
  const client = createClient({
    baseUrl: 'http://127.0.0.1:4000/',
    getToken: () => 'tok',
    fetchImpl: fakeFetch((url, opts) => {
      seen.push({ url, opts });
      return jsonResponse(200, { ok: true });
    }),
  });
  await client.admin.running.runs({ limit: 10, offset: 20 });
  await client.admin.running.deleteRun('a/b');
  await client.admin.running.deleteRuns(['x', 'y']);
  await client.admin.revokeDevice('dev-2');
  assert.equal(seen[0].url, 'http://127.0.0.1:4000/v1/admin/running/runs?limit=10&offset=20');
  assert.equal(seen[0].opts.headers.Authorization, 'Bearer tok');
  assert.equal(seen[1].url, 'http://127.0.0.1:4000/v1/admin/running/runs/a%2Fb');
  assert.equal(seen[1].opts.method, 'DELETE');
  assert.equal(seen[1].opts.headers['Content-Type'], undefined);
  assert.equal(seen[2].opts.method, 'POST');
  assert.deepEqual(JSON.parse(seen[2].opts.body), { ids: ['x', 'y'] });
  assert.equal(seen[3].url, 'http://127.0.0.1:4000/v1/admin/devices/dev-2');
});
