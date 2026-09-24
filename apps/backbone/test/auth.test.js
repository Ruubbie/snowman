import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceRepo, createPairingCode, pair, authPreHandler, sha256Hex, PairingError } from '../src/core/auth.js';

/** In-memory fake standing in for the mysql2 pool in createDeviceRepo. */
function fakePool() {
  const pairingCodes = new Map();
  const devices = new Map();
  return {
    pairingCodes,
    devices,
    async query(sql, params = []) {
      if (sql.startsWith('INSERT INTO pairing_codes')) {
        const [id, codeHash, deviceName, expiresAt] = params;
        pairingCodes.set(id, { id, codeHash, deviceName, expiresAt, usedAt: null });
        return [{}];
      }
      if (sql.startsWith('SELECT id, device_name')) {
        const [codeHash] = params;
        const now = new Date();
        const found = [...pairingCodes.values()].find((c) => c.codeHash === codeHash && !c.usedAt && c.expiresAt > now);
        return [found ? [{ id: found.id, deviceName: found.deviceName, expiresAt: found.expiresAt }] : []];
      }
      if (sql.startsWith('UPDATE pairing_codes')) {
        const [id] = params;
        const row = pairingCodes.get(id);
        if (row) row.usedAt = new Date();
        return [{}];
      }
      if (sql.startsWith('INSERT INTO devices')) {
        const [id, name, tokenHash] = params;
        devices.set(id, { id, name, tokenHash, revokedAt: null });
        return [{}];
      }
      if (sql.startsWith('SELECT id, name FROM devices')) {
        const [tokenHash] = params;
        const found = [...devices.values()].find((d) => d.tokenHash === tokenHash && !d.revokedAt);
        return [found ? [{ id: found.id, name: found.name }] : []];
      }
      throw new Error(`fakePool: unhandled query: ${sql}`);
    },
  };
}

test('a fresh pairing code can be redeemed exactly once for a working device token', async () => {
  const repo = createDeviceRepo(fakePool());
  const { code, expiresAt } = await createPairingCode(repo, 'iPhone');
  assert.equal(code.length, 6);
  assert.ok(expiresAt > new Date());

  const { token, deviceId } = await pair(repo, { code, deviceName: 'iPhone' });
  assert.ok(token.length > 20);
  assert.ok(deviceId);

  // Auth preHandler accepts the new token.
  const preHandler = authPreHandler(repo);
  const request = { raw: { url: '/v1/running/today' }, headers: { authorization: `Bearer ${token}` }, query: {} };
  const reply = { code() { return this; }, send() {} };
  await preHandler(request, reply);
  assert.equal(request.device.id, deviceId);
});

test('redeeming the same code twice fails the second time', async () => {
  const repo = createDeviceRepo(fakePool());
  const { code } = await createPairingCode(repo, 'iPhone');
  await pair(repo, { code, deviceName: 'iPhone' });
  await assert.rejects(() => pair(repo, { code, deviceName: 'iPhone' }), PairingError);
});

test('an unknown code is rejected', async () => {
  const repo = createDeviceRepo(fakePool());
  await assert.rejects(() => pair(repo, { code: 'ZZZZZZ', deviceName: 'iPhone' }), PairingError);
});

test('authPreHandler rejects missing or bad tokens on /v1 routes, but allows /v1/pair and /v1/health', async () => {
  const repo = createDeviceRepo(fakePool());
  const preHandler = authPreHandler(repo);

  let status = null;
  const reply = {
    code(c) { status = c; return this; },
    send() {},
  };
  await preHandler({ raw: { url: '/v1/running/today' }, headers: {}, query: {} }, reply);
  assert.equal(status, 401);

  status = null;
  await preHandler({ raw: { url: '/v1/pair' }, headers: {}, query: {} }, reply);
  assert.equal(status, null); // untouched - public route

  status = null;
  await preHandler({ raw: { url: '/v1/health' }, headers: {}, query: {} }, reply);
  assert.equal(status, null);
});

test('a websocket-style ?token= query param is also accepted', async () => {
  const repo = createDeviceRepo(fakePool());
  const { code } = await createPairingCode(repo, 'iPhone');
  const { token } = await pair(repo, { code, deviceName: 'iPhone' });

  const preHandler = authPreHandler(repo);
  const request = { raw: { url: '/v1/ws' }, headers: {}, query: { token } };
  let deviceSet = false;
  await preHandler(request, { code() { return this; }, send() {} });
  deviceSet = Boolean(request.device);
  assert.equal(deviceSet, true);
});

test('sha256Hex is deterministic', () => {
  assert.equal(sha256Hex('abc'), sha256Hex('abc'));
  assert.notEqual(sha256Hex('abc'), sha256Hex('abd'));
});
