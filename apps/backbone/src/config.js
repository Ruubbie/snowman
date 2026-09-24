/**
 * Environment parsing, defaults, and validation. Pure function of
 * process.env so it is trivial to unit test.
 */

/**
 * @typedef {Object} SnowmanConfig
 * @property {number} port
 * @property {string} host
 * @property {string} tzName
 * @property {string} databaseUrl
 * @property {string|undefined} anthropicApiKey
 * @property {string|undefined} anthropicWorkspaceId
 * @property {string} olafModelFast
 * @property {string} olafModelSmart
 * @property {number} aiMonthlyBudgetUsd
 * @property {string|undefined} personaFile
 */

/**
 * Parse and validate config from an env-like object.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {SnowmanConfig}
 */
export function loadConfig(env = process.env) {
  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Copy .env.example to .env and set it (see README for local MariaDB setup).',
    );
  }

  const aiMonthlyBudgetUsd = Number(env.AI_MONTHLY_BUDGET_USD ?? 15);
  if (!Number.isFinite(aiMonthlyBudgetUsd) || aiMonthlyBudgetUsd < 0) {
    throw new Error(`Invalid AI_MONTHLY_BUDGET_USD: ${env.AI_MONTHLY_BUDGET_USD}`);
  }

  return {
    port,
    host: env.HOST || '127.0.0.1',
    tzName: env.TZ_NAME || 'Europe/Amsterdam',
    databaseUrl,
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    anthropicWorkspaceId: env.ANTHROPIC_WORKSPACE_ID || undefined,
    olafModelFast: env.OLAF_MODEL_FAST || 'claude-haiku-4-5',
    olafModelSmart: env.OLAF_MODEL_SMART || 'claude-sonnet-5',
    aiMonthlyBudgetUsd,
    personaFile: env.PERSONA_FILE || undefined,
    corsOrigins: env.CORS_ORIGINS || 'http://localhost:8081',
  };
}
