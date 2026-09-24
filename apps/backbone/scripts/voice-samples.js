/**
 * Olaf voice samples + speed check for the server voice engine (Kokoro).
 *
 *   node scripts/voice-samples.js                 # write data/voice-samples/<voice>.wav
 *   node scripts/voice-samples.js --voices am_michael,bf_emma --text "Hello"
 *   node scripts/voice-samples.js --recipes "bright=am_puck@1.1:1.15;mix=am_puck*0.6+af_heart*0.4@1.08"
 *                                   # label=voice recipe[@pitch][:speed] -> data/voice-samples/olaf/<label>.wav
 *   node scripts/voice-samples.js --bench         # load time + realtime factor (uses VOICE_DTYPE / VOICE_THREADS)
 *
 * No database or API key needed. First run downloads the model to HF_CACHE_DIR.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadVoiceConfig } from '../src/config.js';
import { loadKokoro } from '../src/voice/kokoro.js';
import { normalizeForSpeech, splitSentences } from '../src/voice/text.js';
import { encodeWav, wavDurationMs } from '../src/voice/wav.js';
import { resamplePitch, parseVoiceRecipe } from '../src/voice/resample.js';

const OLAF_LINES =
  "Ooh! Halfway there, look at you go! Your legs are doing the thing! " +
  "Wait, wait, rain? Oh, I love rain. Well, I'm mostly made of it eventually. Shoes on!";

const DEFAULT_LINE = "Nice and easy — you're right on pace. Two more minutes of running, then a walk break.";
const DEFAULT_VOICES = ['am_michael', 'am_fenrir', 'am_puck', 'bm_george', 'bm_fable', 'af_heart', 'bf_emma'];
const SHORT = "Nice and easy, you're right on pace. Keep it up.";
const LONG =
  'Great work today. You held a steady rhythm through every run segment, and your walk breaks were right where ' +
  'they should be. Next time we will add one more minute of running, so rest well tonight, drink some water, ' +
  'and I will see you on Thursday.';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const cfg = loadVoiceConfig();
const t0 = performance.now();
const backend = await loadKokoro({
  model: cfg.voiceModel,
  dtype: cfg.voiceDtype,
  hfCacheDir: cfg.hfCacheDir,
  threads: cfg.voiceThreads,
  voice: cfg.olafVoice,
});
const loadMs = Math.round(performance.now() - t0);

async function render(text, voiceRecipe, pitch = 1, speed = cfg.olafVoiceSpeed) {
  const pieces = [];
  const start = performance.now();
  const shift = Math.abs(pitch - 1) > 1e-6;
  for (const chunk of splitSentences(normalizeForSpeech(text))) {
    // Same as the engine: slow down by the pitch factor, resampling speeds it back up.
    let audio = await backend.synthesize(chunk, { voiceRecipe, speed: shift ? speed / pitch : speed });
    if (shift) audio = resamplePitch(audio, pitch);
    pieces.push(audio);
  }
  const genMs = performance.now() - start;
  const wav = encodeWav(pieces, { sampleRate: backend.sampleRate, gapMs: 90 });
  return { wav, genMs, audioMs: wavDurationMs(wav.length) };
}

if (process.argv.includes('--bench')) {
  console.log(`model ${cfg.voiceModel} dtype=${cfg.voiceDtype} threads=${cfg.voiceThreads || 'default'} load=${loadMs}ms`);
  await render('Hi there.', cfg.olafVoice); // warm-up
  for (const [label, text] of [['~10 words', SHORT], ['~45 words', LONG]]) {
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(await render(text, cfg.olafVoice));
    const gen = runs.reduce((s, r) => s + r.genMs, 0) / runs.length;
    const audio = runs[0].audioMs;
    console.log(`${label}: gen ${Math.round(gen)} ms for ${audio} ms audio -> RTF ${(gen / audio).toFixed(2)}`);
  }
} else {
  const recipesArg = arg('recipes');
  const voicesArg = arg('voices');
  const text = arg('text') || DEFAULT_LINE;
  const outDir = path.resolve(path.dirname(cfg.voiceCacheDir), 'voice-samples');
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`"${normalizeForSpeech(text)}"`);

  if (recipesArg) {
    const lines = arg('text') || OLAF_LINES;
    for (const entry of recipesArg.split(';').map((r) => r.trim()).filter(Boolean)) {
      const m = entry.match(/^([\w-]+)=([^@:]+)(?:@([\d.]+))?(?::([\d.]+))?$/);
      if (!m) {
        console.error(`Bad recipe "${entry}" (expected label=voice[@pitch][:speed])`);
        continue;
      }
      const [, label, voiceRecipe, pitch = '1', speed = String(cfg.olafVoiceSpeed)] = m;
      parseVoiceRecipe(voiceRecipe); // fail loudly on typos
      const { wav, genMs, audioMs } = await render(lines, voiceRecipe, Number(pitch), Number(speed));
      const file = path.join(outDir, 'olaf', `${label}.wav`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, wav);
      console.log(`${label.padEnd(14)} ${voiceRecipe} pitch ${pitch} speed ${speed}: ${audioMs} ms audio in ${Math.round(genMs)} ms`);
    }
  } else {
    const voices = (voicesArg || DEFAULT_VOICES.join(',')).split(',');
    for (const voice of voices) {
      const { wav, genMs, audioMs } = await render(text, voice);
      const file = path.join(outDir, `${voice}.wav`);
      fs.writeFileSync(file, wav);
      console.log(`${file}  ${audioMs} ms audio in ${Math.round(genMs)} ms`);
    }
  }
}
