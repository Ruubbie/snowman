import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { sha256Hex } from '../src/core/auth.js';
import { messagePreview, monthStartUtc } from '../src/admin/derive.js';

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

function fakeBudget(monthUsd = 1.25) {
  return {
    async assertWithinBudget() {},
    async logUsage() {
      return 0;
    },
    async monthTotalUsd() {
      return monthUsd;
    },
  };
}

/** In-memory stand-in for createAdminRepo(). */
function fakeAdminRepo() {
  const conversations = new Map([
    ['conv-1', { id: 'conv-1', title: null, messages: [{ id: 1, role: 'user', content: 'Hello Olaf' }] }],
  ]);
  const devices = new Map([
    ['device-1', { id: 'device-1', name: 'Desktop', createdAt: new Date(), revokedAt: null }],
    ['device-2', { id: 'device-2', name: 'iPhone', createdAt: new Date(), revokedAt: null }],
  ]);
  const events = [
    { id: 2, type: 'running.run.completed', payload: { runId: 'r' }, createdAt: new Date() },
    { id: 1, type: 'admin.run_deleted', payload: {}, createdAt: new Date() },
  ];
  return {
    conversations,
    devices,
    eventQueries: [],
    async overview() {
      return { counts: { conversations: conversations.size }, lastActivity: {} };
    },
    async listConversations() {
      return {
        total: conversations.size,
        conversations: [...conversations.values()].map((c) => ({
          id: c.id,
          title: c.title,
          device: null,
          messageCount: c.messages.length,
          lastMessage: { role: 'user', content: [{ type: 'text', text: 'Hello   Olaf' }], at: new Date() },
          firstUserContent: 'Hello Olaf',
        })),
      };
    },
    async getConversation(id) {
      return conversations.get(id) || null;
    },
    async deleteConversation(id) {
      const c = conversations.get(id);
      if (!c) return null;
      conversations.delete(id);
      return { id, messages: c.messages.length };
    },
    async listAiUsage({ limit }) {
      return {
        total: 1,
        rows: [{ id: 1, purpose: 'olaf.chat', costUsd: 0.01 }].slice(0, limit),
        month: { byPurpose: [{ key: 'olaf.chat', calls: 1, costUsd: 0.01 }], byModel: [] },
        byMonth: [],
      };
    },
    async listEvents(q) {
      this.eventQueries.push(q);
      const list = q.type ? events.filter((e) => e.type.startsWith(q.type.replace('*', ''))) : events;
      return { total: list.length, events: list.slice(q.offset, q.offset + q.limit), types: [] };
    },
    async listDevices() {
      return [...devices.values()];
    },
    async getDevice(id) {
      return devices.get(id) || null;
    },
    async revokeDevice(id) {
      const d = devices.get(id);
      d.revokedAt = new Date();
      return d;
    },
  };
}

function buildTestApp({ modules = [] } = {}) {
  const adminRepo = fakeAdminRepo();
  const published = [];
  const app = buildApp({
    config: BASE_CONFIG,
    db: null,
    brain: { available: false },
    budget: fakeBudget(),
    deviceRepo: fakeDeviceRepo(),
    adminRepo,
    modules,
    events: {
      subscribe() {},
      async publish(type, payload) {
        published.push({ type, payload });
      },
    },
    clock: () => new Date('2026-09-24T10:00:00Z'),
  });
  return { app, adminRepo, published };
}

test('admin routes require a device token', async () => {
  const { app } = buildTestApp();
  const res = await app.inject({ method: 'GET', url: '/v1/admin/overview' });
  assert.equal(res.statusCode, 401);
});

test('GET /v1/admin/overview: AI spend vs budget, recent activity and one card per module', async () => {
  const demo = {
    name: 'demo',
    register(app, ctx) {
      ctx.admin.registerOverview('demo', async () => ({ things: 3 }));
    },
  };
  const broken = {
    name: 'broken',
    register(app, ctx) {
      ctx.admin.registerOverview('broken', async () => {
        throw new Error('db down');
      });
    },
  };
  const { app } = buildTestApp({ modules: [demo, broken] });
  const res = await app.inject({ method: 'GET', url: '/v1/admin/overview', headers: AUTH });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ai.monthUsd, 1.25);
  assert.equal(body.ai.budgetUsd, 15);
  assert.equal(body.ai.monthStart, '2026-09-01T00:00:00.000Z');
  assert.equal(body.olaf.available, false);
  assert.equal(body.recentAi.length, 1);
  assert.equal(body.recentEvents.length, 2);
  assert.deepEqual(body.modules.demo, { things: 3 });
  assert.deepEqual(body.modules.broken, { error: 'overview_failed' });
});

test('conversations: list with preview/title, read, delete, 404', async () => {
  const { app, adminRepo, published } = buildTestApp();
  const list = await app.inject({ method: 'GET', url: '/v1/admin/conversations', headers: AUTH });
  const c = list.json().conversations[0];
  assert.equal(c.title, 'Hello Olaf');
  assert.equal(c.lastMessage.preview, 'Hello Olaf');
  assert.equal(c.firstUserContent, undefined);

  const one = await app.inject({ method: 'GET', url: '/v1/admin/conversations/conv-1', headers: AUTH });
  assert.equal(one.json().messages.length, 1);

  const del = await app.inject({ method: 'DELETE', url: '/v1/admin/conversations/conv-1', headers: AUTH });
  assert.equal(del.statusCode, 200);
  assert.equal(del.json().deleted.messages, 1);
  assert.equal(adminRepo.conversations.size, 0);
  assert.equal(published[0].type, 'admin.conversation_deleted');

  const gone = await app.inject({ method: 'GET', url: '/v1/admin/conversations/conv-1', headers: AUTH });
  assert.equal(gone.statusCode, 404);
  const goneDel = await app.inject({ method: 'DELETE', url: '/v1/admin/conversations/conv-1', headers: AUTH });
  assert.equal(goneDel.statusCode, 404);
});

test('ai-usage returns rows + month totals + budget; bad paging is a 400', async () => {
  const { app } = buildTestApp();
  const usage = await app.inject({ method: 'GET', url: '/v1/admin/ai-usage?limit=5', headers: AUTH });
  assert.equal(usage.statusCode, 200);
  assert.equal(usage.json().budgetUsd, 15);
  assert.equal(usage.json().monthUsd, 1.25);
  assert.equal(usage.json().month.byPurpose[0].key, 'olaf.chat');

  const bad = await app.inject({ method: 'GET', url: '/v1/admin/ai-usage?limit=0', headers: AUTH });
  assert.equal(bad.statusCode, 400);
});

test('events feed supports a type prefix filter', async () => {
  const { app, adminRepo } = buildTestApp();
  const res = await app.inject({ method: 'GET', url: '/v1/admin/events?type=running.*&limit=20', headers: AUTH });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().events.length, 1);
  assert.deepEqual(adminRepo.eventQueries[0], { limit: 20, offset: 0, type: 'running.*' });
});

test('devices: list marks the caller; revoking self is refused; others are revoked', async () => {
  const { app, adminRepo } = buildTestApp();
  const list = await app.inject({ method: 'GET', url: '/v1/admin/devices', headers: AUTH });
  assert.deepEqual(
    list.json().devices.map((d) => [d.id, d.current]),
    [
      ['device-1', true],
      ['device-2', false],
    ],
  );

  const self = await app.inject({ method: 'DELETE', url: '/v1/admin/devices/device-1', headers: AUTH });
  assert.equal(self.statusCode, 409);
  assert.equal(adminRepo.devices.get('device-1').revokedAt, null);

  const other = await app.inject({ method: 'DELETE', url: '/v1/admin/devices/device-2', headers: AUTH });
  assert.equal(other.statusCode, 200);
  assert.ok(adminRepo.devices.get('device-2').revokedAt);

  const missing = await app.inject({ method: 'DELETE', url: '/v1/admin/devices/nope', headers: AUTH });
  assert.equal(missing.statusCode, 404);
});

test('messagePreview / monthStartUtc', () => {
  assert.equal(messagePreview([{ type: 'text', text: 'Hi' }, { type: 'tool_use', name: 'get_plan' }]), 'Hi [tool: get_plan]');
  assert.equal(messagePreview('x'.repeat(200), 10).length, 10);
  assert.equal(messagePreview(null), '');
  assert.equal(monthStartUtc(new Date('2026-12-31T23:59:00Z')).toISOString(), '2026-12-01T00:00:00.000Z');
});
