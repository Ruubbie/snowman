/**
 * Kokoro-82M backend (kokoro-js -> transformers.js -> onnxruntime-node).
 * Imported lazily by the engine, so tests and VOICE_ENABLED=false never
 * load the model or its native runtime.
 *
 * Note: kokoro-js pulls in `phonemizer` (espeak-ng compiled with
 * Emscripten), which registers process-level uncaughtException /
 * unhandledRejection handlers that rethrow. That matches Node 22's default
 * (crash on unhandled rejection), so behaviour is unchanged in practice.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVoiceRecipe } from './resample.js';

/**
 * A Kokoro voice is a table of 510 style vectors (one per input length, 256
 * floats each). kokoro-js keeps those tables private, so a blend is built by
 * mixing the whole table from the .bin files it ships with.
 * @param {Array<{name: string, weight: number}>} voices
 * @returns {Promise<Float32Array>}
 */
async function blendVoiceTables(voices) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.resolve('kokoro-js'))), '..', 'voices');
  const tables = await Promise.all(
    voices.map(async ({ name }) => {
      const buf = await readFile(path.join(dir, name + '.bin'));
      return new Float32Array(Uint8Array.from(buf).buffer); // copy: Buffer offsets need not be 4-byte aligned
    }),
  );
  const out = new Float32Array(tables[0].length);
  voices.forEach(({ weight }, j) => {
    const t = tables[j];
    for (let i = 0; i < out.length; i++) out[i] += t[i] * weight;
  });
  return out;
}

/**
 * @param {{model: string, dtype: string, hfCacheDir?: string, threads?: number, voice: string}} opts
 * @returns {Promise<{sampleRate: number, synthesize: (text: string, o: {voiceRecipe: string, speed: number}) => Promise<Float32Array>}>}
 */
export async function loadKokoro({ model, dtype, hfCacheDir, threads, voice }) {
  const tf = await import('@huggingface/transformers');
  // Keep the model out of node_modules (npm ci would wipe it) and somewhere the service user can write.
  if (hfCacheDir) tf.env.cacheDir = hfCacheDir;
  const { KokoroTTS } = await import('kokoro-js');

  const session_options = threads > 0 ? { intraOpNumThreads: threads, interOpNumThreads: 1 } : {};
  const load = () =>
    Promise.all([
      tf.StyleTextToSpeech2Model.from_pretrained(model, { dtype, device: 'cpu', session_options }),
      tf.AutoTokenizer.from_pretrained(model),
    ]);

  let parts;
  try {
    parts = await load();
  } catch (err) {
    // First load right after the download can hit a transient file lock
    // (seen on Windows: "system error number 13"). One retry is enough.
    await new Promise((r) => setTimeout(r, 2000));
    parts = await load().catch(() => {
      throw err;
    });
  }
  const tts = new KokoroTTS(parts[0], parts[1]);

  // Validate voice recipe (single voice or blend)
  let voiceRecipe;
  try {
    voiceRecipe = parseVoiceRecipe(voice);
  } catch (err) {
    throw new Error(`Invalid voice recipe for OLAF_VOICE: ${err.message}`);
  }

  // Validate all voices exist
  for (const { name } of voiceRecipe.voices) {
    if (!Object.hasOwn(tts.voices, name)) {
      throw new Error(`unknown Kokoro voice "${name}" (in OLAF_VOICE "${voice}"); options: ${Object.keys(tts.voices).join(', ')}`);
    }
  }

  const STYLE_DIM = 256;
  const blends = new Map(); // recipe -> Promise<Float32Array>

  return {
    sampleRate: 24000,
    async synthesize(text, { voiceRecipe: recipe, speed }) {
      const { voices } = parseVoiceRecipe(recipe);
      if (voices.length === 1) return (await tts.generate(text, { voice: voices[0].name, speed })).audio;

      if (!blends.has(recipe)) blends.set(recipe, blendVoiceTables(voices).catch((e) => (blends.delete(recipe), Promise.reject(e))));
      const table = await blends.get(recipe);
      // Run kokoro's own normalisation + phonemizer (accent of the heaviest
      // voice), swapping in the blended style row right at the model call.
      const base = voices.reduce((a, v) => (v.weight > a.weight ? v : a)).name;
      const model = tts.model;
      const view = Object.create(tts, {
        model: {
          value: (inputs) => {
            const row = Math.min(Math.max(inputs.input_ids.dims.at(-1) - 2, 0), table.length / STYLE_DIM - 1);
            const style = new tf.Tensor('float32', table.slice(row * STYLE_DIM, (row + 1) * STYLE_DIM), [1, STYLE_DIM]);
            return model({ ...inputs, style });
          },
        },
      });
      return (await tts.generate.call(view, text, { voice: base, speed })).audio;
    },
  };
}
