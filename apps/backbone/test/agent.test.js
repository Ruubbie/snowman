import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent, OlafRefusal } from '../src/brain/agent.js';
import { createToolRegistry } from '../src/brain/tools.js';

function fakeBrain(responses) {
  let call = 0;
  const calls = [];
  return {
    available: true,
    async createMessage(params) {
      // Snapshot the messages array - agent.js mutates the same array by
      // reference across loop iterations, so without this copy every
      // recorded call would end up pointing at the FINAL state.
      calls.push({ ...params, messages: [...params.messages] });
      const response = responses[call];
      call++;
      if (!response) throw new Error('fakeBrain: no more scripted responses');
      return response;
    },
    calls,
  };
}

test('tool_use -> tool_result feeds back in ONE user message, then returns final text', async () => {
  const tools = createToolRegistry();
  let handlerCalled = false;
  tools.register({
    name: 'get_weather',
    description: 'get weather',
    risk: 'read',
    input_schema: { type: 'object', additionalProperties: false, properties: {} },
    async handler() {
      handlerCalled = true;
      return 'sunny';
    },
  });

  const brain = fakeBrain([
    {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tool_1', name: 'get_weather', input: {} }],
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'It is sunny' }],
      usage: { input_tokens: 5, output_tokens: 5 },
    },
  ]);

  const result = await runAgent(
    { brain, toolRegistry: tools, purpose: 'test' },
    { model: 'claude-sonnet-5', systemBlocks: [{ type: 'text', text: 'sys' }], messages: [{ role: 'user', content: 'weather?' }] },
  );

  assert.equal(handlerCalled, true);
  assert.equal(result.text, 'It is sunny');

  // Second API call's last message must be a single user message carrying
  // ALL tool_result blocks together.
  const secondCallMessages = brain.calls[1].messages;
  const toolResultMessage = secondCallMessages[secondCallMessages.length - 1];
  assert.equal(toolResultMessage.role, 'user');
  assert.equal(toolResultMessage.content.length, 1);
  assert.equal(toolResultMessage.content[0].type, 'tool_result');
  assert.equal(toolResultMessage.content[0].tool_use_id, 'tool_1');
  assert.equal(toolResultMessage.content[0].content, 'sunny');

  // claude-sonnet-5 must get adaptive thinking, per the model rules.
  assert.deepEqual(brain.calls[0].thinking, { type: 'adaptive' });
});

test('stop_reason "refusal" throws OlafRefusal and never runs a tool', async () => {
  const tools = createToolRegistry();
  let handlerCalled = false;
  tools.register({
    name: 'noop',
    description: 'noop',
    risk: 'read',
    input_schema: { type: 'object', additionalProperties: false, properties: {} },
    async handler() {
      handlerCalled = true;
    },
  });

  const brain = fakeBrain([
    {
      stop_reason: 'refusal',
      stop_details: { category: 'cyber' },
      content: [],
      usage: {},
    },
  ]);

  await assert.rejects(
    () =>
      runAgent(
        { brain, toolRegistry: tools, purpose: 'test' },
        { model: 'claude-sonnet-5', systemBlocks: [], messages: [{ role: 'user', content: 'hi' }] },
      ),
    OlafRefusal,
  );
  assert.equal(handlerCalled, false);
});

test('a "confirm" risk tool is never executed - it returns a confirmation-required tool_result and emits an event', async () => {
  const tools = createToolRegistry();
  let handlerCalled = false;
  tools.register({
    name: 'delete_everything',
    description: 'dangerous',
    risk: 'confirm',
    input_schema: { type: 'object', additionalProperties: false, properties: {} },
    async handler() {
      handlerCalled = true;
    },
  });

  const publishedEvents = [];
  const events = { async publish(type, payload) { publishedEvents.push({ type, payload }); } };

  const brain = fakeBrain([
    {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tool_1', name: 'delete_everything', input: {} }],
      usage: {},
    },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok, I did not do that' }], usage: {} },
  ]);

  const result = await runAgent(
    { brain, toolRegistry: tools, events, purpose: 'test' },
    { model: 'claude-sonnet-5', systemBlocks: [], messages: [{ role: 'user', content: 'delete everything' }] },
  );

  assert.equal(handlerCalled, false);
  assert.equal(result.text, 'ok, I did not do that');
  assert.equal(publishedEvents.length, 1);
  assert.equal(publishedEvents[0].type, 'olaf.confirmation.requested');

  const toolResultMessage = brain.calls[1].messages[brain.calls[1].messages.length - 1];
  assert.equal(toolResultMessage.content[0].is_error, undefined);
  assert.match(toolResultMessage.content[0].content, /confirmation/i);
});

test('claude-haiku-4-5 gets no thinking parameter at all', async () => {
  const tools = createToolRegistry();
  const brain = fakeBrain([{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hi' }], usage: {} }]);
  await runAgent(
    { brain, toolRegistry: tools, purpose: 'test' },
    { model: 'claude-haiku-4-5', systemBlocks: [], messages: [{ role: 'user', content: 'hi' }] },
  );
  assert.equal('thinking' in brain.calls[0], false);
  assert.equal('temperature' in brain.calls[0], false);
  assert.equal('top_p' in brain.calls[0], false);
});
