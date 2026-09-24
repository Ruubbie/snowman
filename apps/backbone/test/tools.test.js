import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolRegistry } from '../src/brain/tools.js';

test('tools list sorted by name for stable prompt caching', () => {
  const registry = createToolRegistry();
  registry.register({ name: 'zebra', description: 'z', risk: 'read', input_schema: {}, handler: () => {} });
  registry.register({ name: 'apple', description: 'a', risk: 'read', input_schema: {}, handler: () => {} });
  const names = registry.list().map((t) => t.name);
  assert.deepEqual(names, ['apple', 'zebra']);
});

test('toApiTools strips risk/handler, keeping only name/description/input_schema', () => {
  const registry = createToolRegistry();
  registry.register({
    name: 'get_thing',
    description: 'gets a thing',
    risk: 'write',
    input_schema: { type: 'object', additionalProperties: false, properties: {} },
    handler: () => {},
  });
  const [tool] = registry.toApiTools();
  assert.deepEqual(Object.keys(tool).sort(), ['description', 'input_schema', 'name']);
});

test('register rejects an invalid risk level', () => {
  const registry = createToolRegistry();
  assert.throws(() => registry.register({ name: 'x', description: 'x', risk: 'dangerous', input_schema: {}, handler: () => {} }));
});
