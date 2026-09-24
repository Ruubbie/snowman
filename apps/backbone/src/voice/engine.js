import { createHash } from 'node:crypto';
import { createAudioCache, isAudioId } from './cache.js';
import { normalizeForSpeech, splitSentences, NORMALIZER_VERSION } from './text.js';
import { encodeWav, wavDurationMs } from './wav.js';
import { resamplePitch } from './resample.js';

/** Silence between sentences when a text is synthesised in chunks. */
const SENTENCE_GAP_MS = 90;
/** Beyond this many waiting jobs, new work is refused (503) instead of piling up. */
const MAX_QUEUE = 200;
/** After a failed model load, wait this long before trying again. */
const RETRY_LOAD_AFTER_MS = 5 * 60 * 1000;

export class VoiceUnavailable extends Error {
  constructor(message = 'voice_unavailable') {
    super(message);
    this.name = 'VoiceUnavailable';
    this.statusCode = 503;
  }
}

export class EmptySpeech extends Error {
  constructor() {
    super('nothing to say after normalisation');
    this.name = 'EmptySpeech';
    this.statusCode = 400;
  }
}

/**
 * Engine from the backbone config. Only `voiceEnabled === true` turns it on,
 * so hand-built test configs never load the model.
 * @param {object} config see loadVoiceConfig in config.js
 * @param {Parameters<typeof createVoiceEngine>[1]} [deps]
 */
export function createVoiceEngineFromConfig(config, deps) {
  if (config.voiceboxUrl && config.voiceboxProfile) {
    return createVoiceEngine(
      {
        enabled: config.voiceEnabled === true,
        voicebox: { url: config.voiceboxUrl, profileId: config.voiceboxProfile },
        voice: `voicebox:${config.voiceboxProfile}`,
        speed: 1,
        pitch: 1,
        model: 'voicebox-chatterbox_turbo',
        dtype: 'clarity1',
        cacheDir: config.voiceCacheDir,
        cacheMaxBytes: (config.voiceCacheMaxMb ?? 500) * 1024 * 1024,
      },
      deps,
    );
  }
  return createVoiceEngine(
    {
      enabled: config.voiceEnabled === true,
      voice: config.olafVoice || 'am_michael',
      speed: config.olafVoiceSpeed ?? 1,
      pitch: config.olafVoicePitch ?? 1,
      model: config.voiceModel || 'onnx-community/Kokoro-82M-v1.0-ONNX',
      dtype: config.voiceDtype || 'fp32',
      threads: config.voiceThreads || 0,
      hfCacheDir: config.hfCacheDir,
      cacheDir: config.voiceCacheDir,
      cacheMaxBytes: (config.voiceCacheMaxMb ?? 500) * 1024 * 1024,
    },
    deps,
  );
}

/** Public URL path of a cached clip. */
export function audioPath(id) {
  return `/v1/voice/audio/${id}.wav`;
}

/**
 * Server-side voice for Olaf. One model instance, loaded lazily; one
 * synthesis at a time (2 Arm cores in production); identical texts share a
 * job; results are content-addressed WAV files on disk.
 *
 * @param {{
 *   enabled: boolean,
 *   voice: string,
 *   speed: number,
 *   pitch: number,
 *   model: string,
 *   dtype: string,
 *   threads?: number,
 *   hfCacheDir?: string,
 *   cacheDir: string,
 *   cacheMaxBytes: number,
 * }} settings
 * @param {{
 *   logger?: object,
 *   loadBackend?: (settings: object) => Promise<{sampleRate: number, synthesize: (text: string, o: object) => Promise<Float32Array>}>,
 *   cache?: ReturnType<typeof createAudioCache>,
 *   now?: () => number,
 * }} [deps] loadBackend defaults to Voicebox when settings.voicebox is set, else Kokoro (dynamically imported)
 */
export function createVoiceEngine(settings, deps = {}) {
  const log = deps.logger || { info() {}, warn() {}, error() {} };
  const now = deps.now || (() => performance.now());
  const loadBackend =
    deps.loadBackend ||
    (async (s) =>
      s.voicebox ? (await import('./voicebox.js')).loadVoicebox(s.voicebox) : (await import('./kokoro.js')).loadKokoro(s));
  const cache =
    deps.cache || createAudioCache({ dir: settings.cacheDir, maxBytes: settings.cacheMaxBytes, logger: log });
  const engineVersion = `${settings.model}|${settings.dtype}|n${NORMALIZER_VERSION}|v2`;

  let state = settings.enabled ? 'idle' : 'disabled'; // idle | loading | ready | failed | disabled
  let backend = null;
  let loading = null;
  let lastError = null;
  let failedAt = 0;
  let loadMs = null;
  const rtfWindow = [];

  /** @type {Map<string, {id: string, text: string, priority: 'high'|'low', promise: Promise<string>, resolve: Function, reject: Function}>} */
  const jobs = new Map();
  const high = [];
  const low = [];
  let running = false;

  function usable() {
    if (state === 'disabled') return false;
    if (state === 'failed' && Date.now() - failedAt < RETRY_LOAD_AFTER_MS) return false;
    return true;
  }

  function ensureLoaded() {
    if (backend) return Promise.resolve(backend);
    if (!usable()) return Promise.reject(new VoiceUnavailable());
    loading ??= (async () => {
      state = 'loading';
      const t0 = now();
      try {
        backend = await loadBackend(settings);
        loadMs = Math.round(now() - t0);
        state = 'ready';
        lastError = null;
        log.info({ loadMs, model: settings.model, dtype: settings.dtype, voice: settings.voice }, 'voice engine loaded');
        return backend;
      } catch (err) {
        state = 'failed';
        failedAt = Date.now();
        lastError = err.message;
        log.error({ err }, 'voice engine failed to load; voice endpoints return 503');
        throw new VoiceUnavailable();
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  /** Normalised text + content id for a string (no synthesis). */
  function prepare(text) {
    const normalized = normalizeForSpeech(text);
    if (!normalized || !/[\p{L}\p{N}]/u.test(normalized)) throw new EmptySpeech();
    const id = createHash('sha256')
      .update([settings.voice, String(settings.speed), String(settings.pitch), normalized, engineVersion].join('|'))
      .digest('hex');
    return { id, normalized };
  }

  async function synthesize(normalized, { measure = true } = {}) {
    const b = await ensureLoaded();
    const chunks = splitSentences(normalized);
    const pieces = [];
    const t0 = now();
    for (const chunk of chunks) {
      // Pitch = resample, which also speeds speech up by the same factor, so
      // synthesize that much slower first to keep the configured tempo.
      const shift = Math.abs(settings.pitch - 1) > 1e-6;
      const speed = shift ? settings.speed / settings.pitch : settings.speed;
      let audio = await b.synthesize(chunk, { voiceRecipe: settings.voice, speed });
      if (shift) audio = resamplePitch(audio, settings.pitch);
      pieces.push(audio);
    }
    const genMs = now() - t0;
    const wav = encodeWav(pieces, { sampleRate: b.sampleRate, gapMs: SENTENCE_GAP_MS });
    const audioMs = wavDurationMs(wav.length, b.sampleRate);
    if (measure && audioMs > 0) {
      rtfWindow.push(genMs / audioMs);
      if (rtfWindow.length > 50) rtfWindow.shift();
    }
    return { wav, genMs, audioMs };
  }

  async function runJob(job) {
    try {
      const { wav, genMs, audioMs } = await synthesize(job.text, { measure: !job.warm });
      if (job.warm) {
        job.resolve(null);
        return;
      }
      const file = await cache.write(job.id, wav);
      log.info({ id: job.id.slice(0, 12), genMs: Math.round(genMs), audioMs, priority: job.priority }, 'voice synthesised');
      job.resolve(file);
    } catch (err) {
      if (!(err instanceof VoiceUnavailable)) log.error({ err }, 'voice synthesis failed');
      job.reject(err);
    } finally {
      if (!job.warm) jobs.delete(job.id);
    }
  }

  async function pump() {
    if (running) return;
    running = true;
    try {
      let job;
      while ((job = high.shift() || low.shift())) await runJob(job);
    } finally {
      running = false;
    }
  }

  /**
   * Queue synthesis of text unless it is cached or already in flight.
   * @returns {{id: string, normalized: string, cached: boolean, promise: Promise<string>}} promise resolves to the file path
   */
  function submit(text, priority) {
    const { id, normalized } = prepare(text);
    const hit = cache.stat(id);
    if (hit) return { id, normalized, cached: true, promise: Promise.resolve(hit.path) };

    const existing = jobs.get(id);
    if (existing) {
      if (priority === 'high' && existing.priority === 'low') promote(existing);
      return { id, normalized, cached: false, promise: existing.promise };
    }

    if (!usable()) throw new VoiceUnavailable();
    if (high.length + low.length >= MAX_QUEUE) throw new VoiceUnavailable('voice_busy');

    const job = { id, text: normalized, priority };
    job.promise = new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });
    job.promise.catch(() => {}); // callers that fire-and-forget must not cause unhandled rejections
    jobs.set(id, job);
    (priority === 'high' ? high : low).push(job);
    pump();
    return { id, normalized, cached: false, promise: job.promise };
  }

  return {
    get enabled() {
      return state !== 'disabled';
    },
    get state() {
      return state;
    },
    settings,

    /** Deterministic id for a text (what /audio/<id>.wav will be). */
    idFor(text) {
      return prepare(text).id;
    },

    /** True when the clip for this text is already on disk (nothing to wait for). */
    has(text) {
      try {
        return !!cache.stat(prepare(text).id);
      } catch {
        return false;
      }
    },

    /**
     * Synthesise (or reuse) and wait for the result.
     * @param {string} text
     * @returns {Promise<{id: string, url: string, durationMs: number, cached: boolean}>}
     */
    async speak(text) {
      const { id, cached, promise } = submit(text, 'high');
      await promise;
      const st = cache.stat(id);
      if (!st) throw new VoiceUnavailable();
      if (cached) cache.touch(id);
      return { id, url: audioPath(id), durationMs: wavDurationMs(st.size), cached };
    },

    /**
     * Fire-and-forget: queue synthesis and return the (deterministic) id and
     * url right away. Returns null when the voice is off/unavailable or the
     * text has nothing speakable, so callers can put the result straight
     * into a response.
     * @param {string} text
     * @param {{priority?: 'high'|'low'}} [opts]
     * @returns {{id: string, url: string}|null}
     */
    enqueue(text, { priority = 'low' } = {}) {
      if (!text || !usable()) return null;
      try {
        const { id } = submit(text, priority);
        return { id, url: audioPath(id) };
      } catch (err) {
        if (!(err instanceof VoiceUnavailable) && !(err instanceof EmptySpeech)) log.warn({ err }, 'voice enqueue failed');
        return null;
      }
    },

    /**
     * Resolve an id to a file on disk, waiting for an in-flight job.
     * @returns {Promise<{path: string, size: number}|null>} null = unknown id
     */
    async fileFor(id) {
      if (!isAudioId(id)) return null;
      const job = jobs.get(id);
      if (job) {
        if (job.priority === 'low') promote(job); // someone is waiting for it now
        await job.promise; // rejects -> caller maps to 503
      }
      const st = cache.stat(id);
      if (st) cache.touch(id);
      return st;
    },

    /**
     * Load the model and synthesise one short line (not cached), through
     * the queue so it never overlaps real work. Rejects if loading fails.
     */
    async warmUp() {
      if (!usable()) return false;
      const job = { warm: true, text: 'Hi there.', priority: 'high' };
      job.promise = new Promise((resolve, reject) => {
        job.resolve = resolve;
        job.reject = reject;
      });
      high.unshift(job);
      pump();
      await job.promise;
      return true;
    },

    status() {
      const avg = rtfWindow.length ? rtfWindow.reduce((a, b) => a + b, 0) / rtfWindow.length : null;
      return {
        enabled: state !== 'disabled',
        ready: state === 'ready',
        state,
        voice: settings.voice,
        speed: settings.speed,
        model: settings.model,
        dtype: settings.dtype,
        loadMs,
        avgRealtimeFactor: avg === null ? null : Math.round(avg * 1000) / 1000,
        queued: high.length + low.length,
        error: state === 'failed' ? lastError : null,
      };
    },
  };

  function promote(job) {
    const i = low.indexOf(job);
    if (i >= 0) {
      low.splice(i, 1);
      high.push(job);
    }
    job.priority = 'high';
  }
}
