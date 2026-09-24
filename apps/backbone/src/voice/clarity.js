/**
 * "Clarity" EQ for cloned voices: cut rumble/mud below ~100 Hz and lift the
 * presence band around 3 kHz, where consonants live. Two RBJ biquads.
 * @param {Float32Array} input
 * @param {number} sampleRate
 * @returns {Float32Array}
 */
export function clarity(input, sampleRate) {
  const highpassed = biquad(input, highpass(100, 0.707, sampleRate));
  return biquad(highpassed, peaking(3000, 1.0, 4, sampleRate));
}

function highpass(freq, q, fs) {
  const w = (2 * Math.PI * freq) / fs;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  return normalize([(1 + cos) / 2, -(1 + cos), (1 + cos) / 2], [1 + alpha, -2 * cos, 1 - alpha]);
}

function peaking(freq, q, gainDb, fs) {
  const a = 10 ** (gainDb / 40);
  const w = (2 * Math.PI * freq) / fs;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  return normalize([1 + alpha * a, -2 * cos, 1 - alpha * a], [1 + alpha / a, -2 * cos, 1 - alpha / a]);
}

function normalize(b, a) {
  return { b0: b[0] / a[0], b1: b[1] / a[0], b2: b[2] / a[0], a1: a[1] / a[0], a2: a[2] / a[0] };
}

function biquad(x, { b0, b1, b2, a1, a2 }) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const out = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i];
    y2 = y1; y1 = out;
    y[i] = out;
  }
  return y;
}
