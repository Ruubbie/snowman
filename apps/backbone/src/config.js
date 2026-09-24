import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    ...loadVoiceConfig(env),
  };
}

const REPO_DATA_DIR = fileURLToPath(new URL('../../../data/', import.meta.url));

/**
 * Olaf's server-side voice: a Voicebox voice clone when VOICEBOX_URL and
 * VOICEBOX_PROFILE are set, else Kokoro-82M. fp32 is the default dtype: on Arm
 * it measured ~1.4x faster than q8 with 2 threads (q8's dynamic-quant ops
 * are slow on ARM64) and it is the reference quality.
 * @param {NodeJS.ProcessEnv} env
 */
export function loadVoiceConfig(env = process.env) {
  const speed = Number(env.OLAF_VOICE_SPEED ?? 1);
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) {
    throw new Error(`Invalid OLAF_VOICE_SPEED: ${env.OLAF_VOICE_SPEED} (0.5 - 2)`);
  }
  const pitch = Number(env.OLAF_VOICE_PITCH ?? 1);
  if (!Number.isFinite(pitch) || pitch < 0.85 || pitch > 1.25) {
    throw new Error(`Invalid OLAF_VOICE_PITCH: ${env.OLAF_VOICE_PITCH} (0.85 - 1.25)`);
  }
  const maxMb = Number(env.VOICE_CACHE_MAX_MB ?? 500);
  if (!Number.isFinite(maxMb) || maxMb <= 0) throw new Error(`Invalid VOICE_CACHE_MAX_MB: ${env.VOICE_CACHE_MAX_MB}`);
  const dtype = env.VOICE_DTYPE || 'fp32';
  if (!['fp32', 'fp16', 'q8', 'q4', 'q4f16'].includes(dtype)) throw new Error(`Invalid VOICE_DTYPE: ${dtype}`);

  return {
    voiceEnabled: !/^(0|false|no|off)$/i.test(env.VOICE_ENABLED ?? 'true'),
    olafVoice: env.OLAF_VOICE || 'am_michael',
    olafVoiceSpeed: speed,
    olafVoicePitch: pitch,
    voiceModel: env.VOICE_MODEL || 'onnx-community/Kokoro-82M-v1.0-ONNX',
    voiceDtype: dtype,
    voiceThreads: Number(env.VOICE_THREADS ?? 0) || 0,
    voiceCacheDir: env.VOICE_CACHE_DIR || path.join(REPO_DATA_DIR, 'voice-cache'),
    voiceCacheMaxMb: maxMb,
    hfCacheDir: env.HF_CACHE_DIR || path.join(REPO_DATA_DIR, 'hf-cache'),
    voiceboxUrl: env.VOICEBOX_URL || '',
    voiceboxProfile: env.VOICEBOX_PROFILE || '',
  };
}
