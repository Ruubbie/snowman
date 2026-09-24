import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcCostUsd, modelTiers } from '../src/brain/models.js';

test('calcCostUsd prices input/output/cache per the documented table', () => {
  const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 };
  const haikuCost = calcCostUsd('claude-haiku-4-5', usage);
  // 1 (input) + 5 (output) + 1*0.1 (cache read) + 1*1.25 (cache write) = 7.35
  assert.ok(Math.abs(haikuCost - 7.35) < 1e-9);

  const sonnetCost = calcCostUsd('claude-sonnet-5', usage);
  // 2 + 10 + 2*0.1 + 2*1.25 = 14.7
  assert.ok(Math.abs(sonnetCost - 14.7) < 1e-9);
});

test('calcCostUsd returns 0 for an unpriced/custom model instead of throwing', () => {
  assert.equal(calcCostUsd('some-custom-model', { input_tokens: 100 }), 0);
});

test('modelTiers reads fast/smart from config', () => {
  const tiers = modelTiers({ olafModelFast: 'claude-haiku-4-5', olafModelSmart: 'claude-sonnet-5' });
  assert.deepEqual(tiers, { fast: 'claude-haiku-4-5', smart: 'claude-sonnet-5' });
});
