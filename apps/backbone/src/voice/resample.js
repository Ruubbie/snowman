/**
 * Pitch shifting via resampling: changes pitch without changing speed
 * by interpolating the audio samples.
 */

/**
 * Resample audio to change pitch without changing tempo.
 * Uses cubic interpolation for quality.
 *
 * @param {Float32Array} samples Original audio samples
 * @param {number} pitchFactor Pitch shift factor (1.05 = 5% higher pitch)
 * @returns {Float32Array} Resampled audio
 */
export function resamplePitch(samples, pitchFactor) {
  if (Math.abs(pitchFactor - 1) < 1e-6) return samples;

  // Output will be shorter by pitchFactor (pitch higher = fewer samples needed)
  const newLength = Math.ceil(samples.length / pitchFactor);
  const output = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    // Map output index to input index
    const srcIdx = (i * pitchFactor);
    const srcIdxFloor = Math.floor(srcIdx);
    const frac = srcIdx - srcIdxFloor;

    // Cubic interpolation (Catmull-Rom)
    const p0 = srcIdxFloor > 0 ? samples[srcIdxFloor - 1] : samples[0];
    const p1 = samples[srcIdxFloor];
    const p2 = srcIdxFloor + 1 < samples.length ? samples[srcIdxFloor + 1] : samples[samples.length - 1];
    const p3 = srcIdxFloor + 2 < samples.length ? samples[srcIdxFloor + 2] : samples[samples.length - 1];

    const t = frac;
    const t2 = t * t;
    const t3 = t2 * t;

    // Catmull-Rom coefficients
    const a0 = -0.5 * t3 + t2 - 0.5 * t;
    const a1 = 1.5 * t3 - 2.5 * t2 + 1;
    const a2 = -1.5 * t3 + 2 * t2 + 0.5 * t;
    const a3 = 0.5 * t3 - 0.5 * t2;

    output[i] = a0 * p0 + a1 * p1 + a2 * p2 + a3 * p3;
  }

  return output;
}

/**
 * Parse a voice recipe like "am_puck" or "am_puck*0.6+af_heart*0.4"
 * Returns { voices: [{name, weight}, ...], original: string }
 *
 * @param {string} recipe Voice recipe string
 * @returns {{voices: Array<{name: string, weight: number}>, original: string}}
 * @throws {Error} If recipe is invalid
 */
export function parseVoiceRecipe(recipe) {
  if (!recipe || typeof recipe !== 'string') {
    throw new Error('Voice recipe must be a non-empty string');
  }

  const trimmed = recipe.trim();

  // Check for valid characters (allow minus for negative numbers, though we reject them later)
  if (!/^[a-z_0-9*+.\s-]+$/i.test(trimmed)) {
    throw new Error(`Invalid voice recipe: "${trimmed}" (allowed: a-z, 0-9, _, *, +, ., -, spaces)`);
  }

  // Simple single voice (no operators)
  if (!trimmed.includes('+') && !trimmed.includes('*')) {
    return { voices: [{ name: trimmed, weight: 1 }], original: recipe };
  }

  // Parse blend: split by +, each part is "name" or "name*weight"
  const parts = trimmed.split('+').map((p) => p.trim());
  const voices = [];
  let totalWeight = 0;

  for (const part of parts) {
    if (!part) throw new Error(`Invalid voice recipe: empty part in "${trimmed}"`);

    const [name, weightStr] = part.split('*').map((s) => s.trim());
    if (!name) throw new Error(`Invalid voice recipe: missing voice name in "${part}"`);

    if (weightStr !== undefined && !weightStr) {
      throw new Error(`Invalid voice recipe: missing weight after "*" in "${part}"`);
    }

    const weight = weightStr ? Number(weightStr) : 1;
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(`Invalid voice recipe: weight must be positive number in "${part}", got "${weightStr}"`);
    }

    voices.push({ name, weight });
    totalWeight += weight;
  }

  if (voices.length === 0) throw new Error(`Invalid voice recipe: no voices in "${trimmed}"`);

  // Normalize weights
  const normalized = voices.map(({ name, weight }) => ({ name, weight: weight / totalWeight }));

  return { voices: normalized, original: recipe };
}
