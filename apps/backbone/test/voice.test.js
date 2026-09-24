import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { sha256Hex } from '../src/core/auth.js';
import { loadConfig } from '../src/config.js';
import { normalizeForSpeech, splitSentences, numberToWords } from '../src/voice/text.js';
import { encodeWav, wavDurationMs, decodeWav } from '../src/voice/wav.js';
import { clarity } from '../src/voice/clarity.js';
import { loadVoicebox } from '../src/voice/voicebox.js';
import { createVoiceEngine, VoiceUnavailable } from '../src/voice/engine.js';
import { createAudioCache } from '../src/voice/cache.js';
import { parseVoiceRecipe, resamplePitch } from '../src/voice/resample.js';

const TOKEN = 'voice-test-token-123';
const AUTH = { authorization: `Bearer ${TOKEN}` };

const tmpDirs = [];
function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snowman-voice-'));
  tmpDirs.push(dir);
  return dir;
}
after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Fake Kokoro: 10 ms of audio per character, records calls and max concurrency. */
function fakeBackend({ delayMs = 5, fail = false } = {}) {
  const stats = { loads: 0, calls: [], active: 0, maxActive: 0 };
  const loadBackend = async () => {
    stats.loads++;
    if (fail) throw new Error('model download failed');
    return {
      sampleRate: 24000,
      async synthesize(text) {
        stats.calls.push(text);
        stats.active++;
        stats.maxActive = Math.max(stats.maxActive, stats.active);
        await new Promise((r) => setTimeout(r, delayMs));
        stats.active--;
        return new Float32Array(text.length * 240).fill(0.25);
      },
    };
  };
  return { stats, loadBackend };
}

function makeEngine(opts = {}) {
  const { stats, loadBackend } = fakeBackend(opts);
  const engine = createVoiceEngine(
    {
      enabled: opts.enabled ?? true,
      voice: 'am_michael',
      speed: 1,
      pitch: 1,
      model: 'fake/kokoro',
      dtype: 'fp32',
      cacheDir: opts.cacheDir || tmpDir(),
      cacheMaxBytes: 50 * 1024 * 1024,
    },
    { loadBackend },
  );
  return { engine, stats };
}

// ---------- text ----------

test('normalizeForSpeech reads paces, distances and numbers like a coach', () => {
  assert.equal(normalizeForSpeech('Aim for 5:30/km.'), 'Aim for five thirty per kilometre.');
  assert.equal(normalizeForSpeech('You ran 3.2 km!'), 'You ran three point two kilometres!');
  assert.equal(normalizeForSpeech('1 km done, 5:05 per km'), 'one kilometre done, five oh five per kilometre');
  assert.equal(normalizeForSpeech('Hold 6:00-6:30 min/km'), 'Hold six to six thirty per kilometre');
  assert.equal(normalizeForSpeech('2:00 left, walk 90s'), 'two minutes left, walk ninety seconds');
  assert.equal(normalizeForSpeech('Your 3rd run, 400m, 95%'), 'Your third run, four hundred metres, ninety-five percent');
  assert.equal(numberToWords(1250), 'one thousand two hundred and fifty');
});

test('normalizeForSpeech strips emoji and markdown', () => {
  assert.equal(normalizeForSpeech('**Nice** work 🏃‍♂️🔥 _really_'), 'Nice work really');
  assert.equal(normalizeForSpeech('## Plan\n- Run 1 min\n- Walk'), 'Plan. Run one minute. Walk');
  assert.equal(normalizeForSpeech('See [the plan](https://example.com/x) `now`'), 'See the plan now');
});

// ---------- voice blending ----------

test('parseVoiceRecipe handles single voice names', () => {
  const result = parseVoiceRecipe('am_puck');
  assert.deepEqual(result.voices, [{ name: 'am_puck', weight: 1 }]);
});

test('parseVoiceRecipe parses blended recipes with normalized weights', () => {
  const result = parseVoiceRecipe('am_puck*0.6+af_heart*0.4');
  assert.equal(result.voices.length, 2);
  assert.equal(result.voices[0].name, 'am_puck');
  assert.equal(result.voices[1].name, 'af_heart');
  // Weights should sum to 1
  const sum = result.voices.reduce((s, v) => s + v.weight, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, `weights should sum to 1, got ${sum}`);
});

test('parseVoiceRecipe auto-weights when not specified', () => {
  const result = parseVoiceRecipe('am_puck+af_heart');
  assert.equal(result.voices.length, 2);
  assert.equal(result.voices[0].weight, 0.5);
  assert.equal(result.voices[1].weight, 0.5);
});

test('parseVoiceRecipe rejects invalid recipes', () => {
  assert.throws(() => parseVoiceRecipe(''), /non-empty/);
  assert.throws(() => parseVoiceRecipe('voice+'), /empty part/);
  assert.throws(() => parseVoiceRecipe('voice*'), /missing weight/);
  assert.throws(() => parseVoiceRecipe('voice*abc'), /weight must be positive/);
  assert.throws(() => parseVoiceRecipe('voice*-0.5'), /weight must be positive/);
  assert.throws(() => parseVoiceRecipe('voice@invalid'), /allowed: a-z/);
});

// ---------- pitch/resampling ----------

test('resamplePitch returns original samples when factor is 1', () => {
  const samples = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
  const resampled = resamplePitch(samples, 1.0);
  assert.deepEqual(resampled, samples);
});

test('resamplePitch shortens audio when pitch factor > 1', () => {
  const samples = new Float32Array(1000).fill(0.5);
  const resampled = resamplePitch(samples, 1.1);
  // Output should be shorter: ceil(1000 / 1.1) ≈ 910
  assert.ok(resampled.length < samples.length);
  assert.equal(Math.ceil(1000 / 1.1), resampled.length);
});

test('resamplePitch lengthens audio when pitch factor < 1', () => {
  const samples = new Float32Array(1000).fill(0.5);
  const resampled = resamplePitch(samples, 0.9);
  // Output should be longer: ceil(1000 / 0.9) ≈ 1112
  assert.ok(resampled.length > samples.length);
  assert.equal(Math.ceil(1000 / 0.9), resampled.length);
});

test('resamplePitch uses cubic interpolation and clamps to [-1, 1]', () => {
  // Synthesize a sine wave: freq = sampleRate / period
  const sampleRate = 24000;
  const samples = new Float32Array(sampleRate / 100); // 100 Hz
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((2 * Math.PI * 100 * i) / sampleRate);
  }
  const resampled = resamplePitch(samples, 1.1);
  // Check all samples are in [-1, 1]
  for (const s of resampled) {
    assert.ok(s >= -1 && s <= 1, `sample ${s} out of range`);
  }
});

test('splitSentences splits on sentence ends and keeps long clauses under the limit', () => {
  assert.deepEqual(splitSentences('One. Two! Three? Four'), ['One.', 'Two!', 'Three?', 'Four']);
  const long = Array.from({ length: 30 }, (_, i) => `clause ${i}`).join(', ') + '.';
  for (const chunk of splitSentences(long, 60)) assert.ok(chunk.length <= 60, chunk);
});

// ---------- wav ----------

test('encodeWav writes a valid 24 kHz mono 16-bit header and joins chunks with silence', () => {
  const wav = encodeWav([new Float32Array(2400).fill(1), new Float32Array(2400).fill(-1)], { sampleRate: 24000, gapMs: 100 });
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(22), 1); // mono
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), (2400 + 2400 + 2400) * 2);
  assert.equal(wav.readInt16LE(44), Math.round(0.95 * 0x7fff)); // full scale is limited to 0.95
  assert.equal(wav.readInt16LE(44 + 2400 * 2), 0); // gap
  assert.equal(wav.readInt16LE(wav.length - 2), Math.round(-0.95 * 0x8000));
  assert.equal(wavDurationMs(wav.length), 300);
});

// ---------- engine ----------

test('engine serialises synthesis, dedupes identical text and serves repeats from disk', async () => {
  const { engine, stats } = makeEngine();
  const results = await Promise.all([
    engine.speak('First line.'),
    engine.speak('Second line.'),
    engine.speak('First line.'),
    engine.speak('Third line.'),
  ]);
  assert.equal(stats.loads, 1);
  assert.equal(stats.maxActive, 1);
  assert.equal(stats.calls.length, 3);
  assert.equal(results[0].id, results[2].id);
  assert.match(results[0].url, /^\/v1\/voice\/audio\/[a-f0-9]{64}\.wav$/);
  assert.ok(results[0].durationMs > 0);

  const again = await engine.speak('First line.');
  assert.equal(again.cached, true);
  assert.equal(stats.calls.length, 3);
  assert.equal(engine.status().ready, true);
  assert.ok(engine.status().avgRealtimeFactor > 0);
});

test('engine splits multi-sentence text and ids are deterministic', async () => {
  const { engine, stats } = makeEngine();
  const id = engine.idFor('Run now. Walk later!');
  const res = await engine.speak('Run now. Walk later!');
  assert.equal(res.id, id);
  assert.deepEqual(stats.calls, ['Run now.', 'Walk later!']);
  assert.notEqual(engine.idFor('Run now.'), id);
});

test('high-priority work jumps ahead of queued low-priority work', async () => {
  const { engine, stats } = makeEngine({ delayMs: 10 });
  engine.enqueue('low one');
  engine.enqueue('low two');
  engine.enqueue('low three');
  await engine.speak('urgent cue');
  // "low one" was already running; the cue went next.
  assert.deepEqual(stats.calls.slice(0, 2), ['low one', 'urgent cue']);
});

test('engine that cannot load reports unavailable and enqueue returns null', async () => {
  const { engine } = makeEngine({ fail: true });
  await assert.rejects(engine.speak('hello'), VoiceUnavailable);
  assert.equal(engine.status().state, 'failed');
  assert.equal(engine.enqueue('hello again'), null);
  await assert.rejects(engine.warmUp().then(() => engine.speak('x')), VoiceUnavailable);
});

test('disabled engine never loads the backend', async () => {
  const { engine, stats } = makeEngine({ enabled: false });
  assert.equal(engine.enqueue('hi'), null);
  await assert.rejects(engine.speak('hi'), VoiceUnavailable);
  assert.equal(await engine.warmUp(), false);
  assert.equal(stats.loads, 0);
});

test('audio cache trims the oldest files when over the size limit', async () => {
  const dir = tmpDir();
  const cache = createAudioCache({ dir, maxBytes: 3000 });
  const ids = ['a', 'b', 'c', 'd'].map((c) => c.repeat(64));
  for (const [i, id] of ids.entries()) {
    await cache.write(id, Buffer.alloc(1000));
    const t = new Date(Date.now() - (10 - i) * 60_000);
    fs.utimesSync(cache.pathFor(id), t, t);
  }
  await cache.cleanup();
  assert.ok((await cache.totalBytes()) <= 2400);
  assert.equal(cache.stat(ids[0]), null);
  assert.ok(cache.stat(ids[3]));
});

test('loadConfig voice defaults', () => {
  const config = loadConfig({ DATABASE_URL: 'mysql://u:p@localhost:3306/snowman' });
  assert.equal(config.voiceEnabled, true);
  assert.equal(config.olafVoice, 'am_michael');
  assert.equal(config.olafVoiceSpeed, 1);
  assert.equal(config.olafVoicePitch, 1);
  assert.equal(config.voiceDtype, 'fp32');
  assert.equal(config.voiceCacheMaxMb, 500);
  assert.match(config.voiceCacheDir, /data[\\/]voice-cache$/);
  assert.match(config.hfCacheDir, /data[\\/]hf-cache$/);
  assert.equal(loadConfig({ DATABASE_URL: 'x', VOICE_ENABLED: 'false' }).voiceEnabled, false);
  assert.throws(() => loadConfig({ DATABASE_URL: 'x', OLAF_VOICE_SPEED: '9' }), /OLAF_VOICE_SPEED/);
  assert.throws(() => loadConfig({ DATABASE_URL: 'x', OLAF_VOICE_PITCH: '2' }), /OLAF_VOICE_PITCH/);
});

// ---------- routes ----------

const BASE_CONFIG = { tzName: 'Europe/Amsterdam', olafModelSmart: 'claude-sonnet-5', olafModelFast: 'claude-haiku-4-5', aiMonthlyBudgetUsd: 15 };

function testApp({ voice, brain = { available: false }, runningRepo = {} }) {
  return buildApp({
    config: BASE_CONFIG,
    db: null,
    brain,
    budget: { async assertWithinBudget() {}, async logUsage() { return 0; }, async monthTotalUsd() { return 0; } },
    persona: 'Olaf test persona',
    deviceRepo: {
      async findActiveDeviceByTokenHash(hash) {
        return hash === sha256Hex(TOKEN) ? { id: 'device-1', name: 'Test' } : null;
      },
    },
    events: { async publish() {} },
    jobs: { async enqueue() {}, registerHandler() {}, registerRecurring() {} },
    runningRepo,
    voice,
  });
}

test('POST /v1/voice/speak synthesises and GET /v1/voice/audio/:id.wav streams it', async () => {
  const { engine } = makeEngine();
  const app = testApp({ voice: engine });

  const speak = await app.inject({ method: 'POST', url: '/v1/voice/speak', headers: AUTH, payload: { text: 'Right on pace at 5:30/km.' } });
  assert.equal(speak.statusCode, 200);
  const { id, url, durationMs } = speak.json();
  assert.equal(url, `/v1/voice/audio/${id}.wav`);
  assert.ok(durationMs > 0);

  const audio = await app.inject({ method: 'GET', url, headers: AUTH });
  assert.equal(audio.statusCode, 200);
  assert.equal(audio.headers['content-type'], 'audio/wav');
  assert.match(audio.headers['cache-control'], /immutable/);
  assert.equal(audio.rawPayload.toString('ascii', 0, 4), 'RIFF');

  const ranged = await app.inject({ method: 'GET', url, headers: { ...AUTH, range: 'bytes=0-1' } });
  assert.equal(ranged.statusCode, 206);
  assert.equal(ranged.rawPayload.length, 2);
  assert.match(ranged.headers['content-range'], /^bytes 0-1\/\d+$/);

  const viaQuery = await app.inject({ method: 'GET', url: `${url}?token=${TOKEN}` });
  assert.equal(viaQuery.statusCode, 200);

  const missing = await app.inject({ method: 'GET', url: `/v1/voice/audio/${'0'.repeat(64)}.wav`, headers: AUTH });
  assert.equal(missing.statusCode, 404);
  const bad = await app.inject({ method: 'GET', url: '/v1/voice/audio/nope.wav', headers: AUTH });
  assert.equal(bad.statusCode, 404);

  const status = await app.inject({ method: 'GET', url: '/v1/voice/status', headers: AUTH });
  assert.equal(status.json().ready, true);
  assert.equal(status.json().voice, 'am_michael');
});

test('voice routes need auth and answer 503 voice_unavailable without an engine', async () => {
  const { engine } = makeEngine({ fail: true });
  const app = testApp({ voice: engine });
  const noAuth = await app.inject({ method: 'POST', url: '/v1/voice/speak', payload: { text: 'hi' } });
  assert.equal(noAuth.statusCode, 401);
  const res = await app.inject({ method: 'POST', url: '/v1/voice/speak', headers: AUTH, payload: { text: 'hi' } });
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, 'voice_unavailable');
  const empty = await app.inject({ method: 'POST', url: '/v1/voice/speak', headers: AUTH, payload: { text: '🔥' } });
  assert.ok([400, 503].includes(empty.statusCode));

  // Default test config (no voiceEnabled) -> disabled engine, never loads Kokoro.
  const plain = testApp({ voice: undefined });
  const off = await plain.inject({ method: 'POST', url: '/v1/voice/speak', headers: AUTH, payload: { text: 'hi' } });
  assert.equal(off.statusCode, 503);
  const st = await plain.inject({ method: 'GET', url: '/v1/voice/status', headers: AUTH });
  assert.equal(st.json().enabled, false);
});

// ---------- running integration ----------

function fakeBrain(json) {
  return {
    available: true,
    async createMessage() {
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(json) }], usage: {} };
    },
  };
}

test('POST /v1/running/cue returns audio immediately and the audio url waits for synthesis', async () => {
  const { engine, stats } = makeEngine({ delayMs: 30 });
  const runningRepo = { async getRecentCues() { return []; }, async insertCue() {} };
  const app = testApp({ voice: engine, brain: fakeBrain({ say: 'Ease off a little, 6:10/km is plenty.' }), runningRepo });

  const res = await app.inject({
    method: 'POST',
    url: '/v1/running/cue',
    headers: AUTH,
    payload: { runClientId: 'run-1', trigger: 'too_fast', snapshot: { elapsed_s: 60 } },
  });
  assert.equal(res.statusCode, 200);
  const { say, audio } = res.json();
  assert.equal(say, 'Ease off a little, 6:10/km is plenty.');
  assert.equal(audio.id, engine.idFor(say));

  const clip = await app.inject({ method: 'GET', url: audio.url, headers: AUTH });
  assert.equal(clip.statusCode, 200);
  assert.equal(stats.calls.length, 1);
  assert.match(stats.calls[0], /six ten per kilometre/);
});

test('POST /v1/running/brief returns deterministic audio ids for the spoken lines', async () => {
  const { engine, stats } = makeEngine();
  const brief = {
    focus: ['easy'],
    opening_line: "Let's go, easy start.",
    targets: [],
    fallback_lines: {
      too_fast: 'Slow down.',
      too_slow: 'Pick it up.',
      to_run: 'Run!',
      to_walk: 'Walk.',
      km_split: 'Another km.',
      halfway: 'Halfway.',
      finish: 'Done!',
      encourage: 'Go you.',
    },
  };
  const session = { id: 's1', date: '2026-02-02', kind: 'run', title: 'Run', summary: 's', segments: [], status: 'planned' };
  const runningRepo = {
    async getSessionById() { return session; },
    async getSettings() { return {}; },
    async getRecentRuns() { return []; },
    async getRecentPlanDecisions() { return []; },
    async getBrief() { return null; },
    async insertBrief() {},
  };
  const app = testApp({ voice: engine, brain: fakeBrain(brief), runningRepo });
  const res = await app.inject({ method: 'POST', url: '/v1/running/brief', headers: AUTH, payload: { sessionId: 's1' } });
  assert.equal(res.statusCode, 200);
  const { audio } = res.json();
  assert.equal(audio.opening_line.id, engine.idFor(brief.opening_line));
  assert.deepEqual(Object.keys(audio.fallback_lines).sort(), Object.keys(brief.fallback_lines).sort());
  assert.equal(audio.fallback_lines.too_fast.url, `/v1/voice/audio/${engine.idFor('Slow down.')}.wav`);

  // Background jobs finish; each line synthesised exactly once.
  const clip = await app.inject({ method: 'GET', url: audio.fallback_lines.encourage.url, headers: AUTH });
  assert.equal(clip.statusCode, 200);
  assert.equal(stats.calls[0], "Let's go, easy start.");
  assert.equal(new Set(stats.calls).size, stats.calls.length);
});

test('encodeWav scales loud clips down instead of hard-clipping', async () => {
  const { encodeWav } = await import('../src/voice/wav.js');
  const wav = encodeWav(Float32Array.from([0.5, -1.4, 1.2]));
  const s = [0, 1, 2].map((i) => wav.readInt16LE(44 + i * 2) / 0x8000);
  assert.ok(Math.abs(Math.min(...s)) < 0.96 && Math.max(...s) < 0.96);
  assert.ok(s[0] > 0 && s[0] < 0.5, 'quiet samples shrink by the same gain');
});

test('decodeWav reads back what encodeWav wrote', () => {
  const tone = Float32Array.from({ length: 2400 }, (_, i) => 0.5 * Math.sin(i / 10));
  const { samples, sampleRate } = decodeWav(encodeWav(tone, { sampleRate: 24000 }));
  assert.equal(sampleRate, 24000);
  assert.equal(samples.length, tone.length);
  assert.ok(Math.abs(samples[100] - tone[100]) < 1e-3);
});

test('clarity removes DC/rumble and keeps length', () => {
  const dc = new Float32Array(24000).fill(0.5);
  const out = clarity(dc, 24000);
  assert.equal(out.length, dc.length);
  assert.ok(Math.abs(out.at(-1)) < 1e-3, 'constant offset is filtered out');
});

test('loadVoicebox generates, waits for the status stream, decodes and cleans up', async () => {
  const calls = [];
  const wav = encodeWav(new Float32Array(2400).fill(0.1), { sampleRate: 24000 });
  const fakeFetch = async (url, opts = {}) => {
    calls.push(`${opts.method || 'GET'} ${url.replace('http://vb', '')}`);
    if (url.endsWith('/generate')) {
      assert.deepEqual(JSON.parse(opts.body), { profile_id: 'p1', text: 'Hi there.', engine: 'chatterbox_turbo', language: 'en' });
      return Response.json({ id: 'g1', status: 'generating' });
    }
    if (url.endsWith('/status')) return new Response('data: {"status": "generating"}\n\ndata: {"status": "completed"}\n\n');
    if (url.endsWith('/audio/g1')) return new Response(wav);
    return Response.json({});
  };
  const vb = await loadVoicebox({ url: 'http://vb/', profileId: 'p1', fetch: fakeFetch });
  const audio = await vb.synthesize('Hi there.');
  assert.equal(audio.length, 2400);
  assert.equal(vb.sampleRate, 24000);
  assert.deepEqual(calls, ['GET /health', 'GET /profiles/p1', 'POST /generate', 'GET /generate/g1/status', 'GET /audio/g1', 'DELETE /history/g1']);
});

test('loadVoicebox surfaces a failed generation', async () => {
  const fakeFetch = async (url) =>
    url.endsWith('/generate')
      ? Response.json({ id: 'g2' })
      : url.endsWith('/status')
        ? new Response('data: {"status": "failed", "error": "boom"}\n\n')
        : Response.json({});
  const vb = await loadVoicebox({ url: 'http://vb', profileId: 'p1', fetch: fakeFetch });
  await assert.rejects(vb.synthesize('Hi.'), /failed: boom/);
});
