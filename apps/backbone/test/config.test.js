import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('loadConfig applies documented defaults', () => {
  const config = loadConfig({ DATABASE_URL: 'mysql://u:p@localhost:3306/snowman' });
  assert.equal(config.port, 4000);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.tzName, 'Europe/Amsterdam');
  assert.equal(config.olafModelFast, 'claude-haiku-4-5');
  assert.equal(config.olafModelSmart, 'claude-sonnet-5');
  assert.equal(config.aiMonthlyBudgetUsd, 15);
  assert.equal(config.anthropicApiKey, undefined);
});

test('loadConfig throws a clear error when DATABASE_URL is missing', () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL/);
});

test('loadConfig throws on an invalid PORT', () => {
  assert.throws(() => loadConfig({ DATABASE_URL: 'mysql://x', PORT: 'not-a-number' }), /PORT/);
});

test('loadConfig respects overrides', () => {
  const config = loadConfig({
    DATABASE_URL: 'mysql://u:p@localhost:3306/snowman',
    PORT: '5000',
    TZ_NAME: 'UTC',
    ANTHROPIC_API_KEY: 'sk-test',
    AI_MONTHLY_BUDGET_USD: '30',
  });
  assert.equal(config.port, 5000);
  assert.equal(config.tzName, 'UTC');
  assert.equal(config.anthropicApiKey, 'sk-test');
  assert.equal(config.aiMonthlyBudgetUsd, 30);
});
