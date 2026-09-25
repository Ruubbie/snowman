import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerOlafRoutes } from '../src/brain/routes.js';

function appWith(conversations) {
  const app = Fastify();
  const conversationRepo = {
    async latestId() {
      return conversations.at(-1)?.id ?? null;
    },
    async loadTranscript(id) {
      return conversations.find((c) => c.id === id)?.messages ?? [];
    },
  };
  registerOlafRoutes(app, { brain: {}, budget: {}, tools: {}, events: {}, persona: '', config: {}, conversationRepo });
  return app;
}

test('latest conversation is the one every device picks up', async () => {
  const app = appWith([
    { id: 'old', messages: [{ role: 'user', text: 'hi', at: null }] },
    { id: 'new', messages: [{ role: 'user', text: 'from the phone', at: null }, { role: 'olaf', text: 'hey', at: null }] },
  ]);
  const res = await app.inject({ method: 'GET', url: '/v1/olaf/conversations/latest' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().conversationId, 'new');
  assert.equal(res.json().messages.length, 2);
});

test('no conversations yet', async () => {
  const res = await appWith([]).inject({ method: 'GET', url: '/v1/olaf/conversations/latest' });
  assert.deepEqual(res.json(), { conversationId: null, messages: [] });
});
