/**
 * Manual tool-use loop for Olaf. No SDK tool-runner dependency (kept out of
 * the minimal dependency budget) - this is the whole loop, start to finish.
 */

const MAX_STEPS = 8;

export class OlafRefusal extends Error {
  constructor(details) {
    super('Olaf declined to respond');
    this.name = 'OlafRefusal';
    this.statusCode = 422;
    this.code = 'olaf_refusal';
    this.details = details;
  }
}

export class OlafTruncated extends Error {
  constructor() {
    super('Olaf response was truncated at max_tokens');
    this.name = 'OlafTruncated';
    this.statusCode = 502;
    this.code = 'olaf_truncated';
  }
}

export class OlafInvalidOutput extends Error {
  constructor(message) {
    super(message);
    this.name = 'OlafInvalidOutput';
    this.statusCode = 502;
    this.code = 'olaf_invalid_output';
  }
}

/**
 * Build the two-block system prompt: a cached block (persona + stable
 * instructions) followed by a separate, never-cached block carrying volatile
 * context (the current local date/time). Keeping timestamps out of the
 * cached block is what makes the cache actually hit across calls.
 * @param {string} personaText
 * @param {string} stableInstructions
 * @param {() => Date} clock
 * @param {string} tzName
 * @returns {Array<object>}
 */
export function buildSystemBlocks(personaText, stableInstructions, clock, tzName) {
  const stableText = [personaText, stableInstructions].filter(Boolean).join('\n\n');
  const now = clock();
  const localNow = new Intl.DateTimeFormat('en-US', {
    timeZone: tzName,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(now);
  return [
    { type: 'text', text: stableText, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `Current date/time (${tzName}): ${localNow}` },
  ];
}

/**
 * Per-model request extras. The API rejects violations of these rules:
 * claude-sonnet-5 gets adaptive thinking; claude-haiku-4-5 gets neither
 * `thinking` nor `output_config.effort`. Never temperature/top_p, never a
 * prefilled assistant turn.
 * @param {string} model
 * @returns {object}
 */
function modelRequestExtras(model) {
  if (model === 'claude-sonnet-5') return { thinking: { type: 'adaptive' } };
  return {};
}

/**
 * Run the Olaf agent loop: call Claude, execute any requested tools, feed
 * results back, repeat until a final text turn or MAX_STEPS is reached.
 *
 * @param {{brain: object, toolRegistry: import('./tools.js').ToolDef[]|ReturnType<typeof import('./tools.js').createToolRegistry>, budget?: object, events?: object, purpose: string, toolCtx?: object}} deps
 * @param {{model: string, systemBlocks: Array<object>, messages: Array<object>, maxTokens?: number}} opts
 * @returns {Promise<{text: string, response: object, messages: Array<object>}>}
 */
export async function runAgent(deps, opts) {
  const { brain, toolRegistry, budget, events, purpose, toolCtx = {} } = deps;
  const { model, systemBlocks, maxTokens = 4000 } = opts;
  const messages = [...opts.messages];
  const extras = modelRequestExtras(model);
  const apiTools = toolRegistry.toApiTools();

  for (let step = 0; step < MAX_STEPS; step++) {
    if (budget) await budget.assertWithinBudget();

    const response = await brain.createMessage({
      model,
      max_tokens: maxTokens,
      system: systemBlocks,
      messages,
      ...(apiTools.length ? { tools: apiTools } : {}),
      ...extras,
    });

    if (budget) await budget.logUsage({ model, purpose, usage: response.usage || {} });

    if (response.stop_reason === 'refusal') throw new OlafRefusal(response.stop_details);
    if (response.stop_reason === 'max_tokens') throw new OlafTruncated();

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      return { text, response, messages };
    }

    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
    const toolResults = [];
    for (const block of toolUseBlocks) {
      const tool = toolRegistry.get(block.name);
      if (!tool) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `unknown tool: ${block.name}`,
          is_error: true,
        });
        continue;
      }
      if (tool.risk === 'confirm') {
        if (events) await events.publish('olaf.confirmation.requested', { tool: tool.name, input: block.input });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: 'This action requires user confirmation and was not executed.',
        });
        continue;
      }
      try {
        const result = await tool.handler(block.input, toolCtx);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: typeof result === 'string' ? result : JSON.stringify(result ?? null),
        });
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: String(err.message || err),
          is_error: true,
        });
      }
    }
    messages.push({ role: 'user', content: toolResults });
  }

  throw new Error(`Olaf agent loop exceeded ${MAX_STEPS} steps without finishing`);
}

/**
 * One-shot structured-output call (no tool loop). Uses output_config.format
 * json_schema and parses/validates the first text block.
 *
 * @param {{brain: object, budget?: object, purpose: string}} deps
 * @param {{model: string, systemBlocks: Array<object>, messages: Array<object>, maxTokens?: number}} opts
 * @param {object} schema JSON Schema with additionalProperties:false and a required list
 * @returns {Promise<{data: object, response: object}>}
 */
export async function structured(deps, opts, schema) {
  const { brain, budget, purpose } = deps;
  const { model, systemBlocks, messages, maxTokens = 1024 } = opts;

  if (budget) await budget.assertWithinBudget();
  const extras = modelRequestExtras(model);
  const response = await brain.createMessage({
    model,
    max_tokens: maxTokens,
    system: systemBlocks,
    messages,
    output_config: { format: { type: 'json_schema', schema } },
    ...extras,
  });
  if (budget) await budget.logUsage({ model, purpose, usage: response.usage || {} });

  if (response.stop_reason === 'refusal') throw new OlafRefusal(response.stop_details);
  if (response.stop_reason === 'max_tokens') throw new OlafTruncated();

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new OlafInvalidOutput('structured response had no text block');

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch (err) {
    throw new OlafInvalidOutput(`structured response was not valid JSON: ${err.message}`);
  }
  for (const key of schema.required || []) {
    if (!(key in parsed)) throw new OlafInvalidOutput(`structured response missing required key "${key}"`);
  }
  return { data: parsed, response };
}
