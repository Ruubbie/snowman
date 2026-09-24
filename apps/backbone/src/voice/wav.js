/**
 * Minimal WAV (RIFF, PCM 16-bit, mono) encoder. No ffmpeg needed: Kokoro
 * gives Float32 samples at 24 kHz and every client (iOS AVAudioPlayer,
 * browsers, Electron) plays plain PCM WAV.
 */

export const WAV_HEADER_BYTES = 44;
const MAX_PEAK = 0.95;

/**
 * @param {Float32Array|Float32Array[]} chunks one or more sample arrays, concatenated
 * @param {{sampleRate?: number, gapMs?: number}} [opts] gapMs = silence inserted between chunks
 * @returns {Buffer}
 */
export function encodeWav(chunks, { sampleRate = 24000, gapMs = 0 } = {}) {
  const list = Array.isArray(chunks) ? chunks : [chunks];
  const gap = Math.round((sampleRate * gapMs) / 1000);
  const totalSamples = list.reduce((sum, c) => sum + c.length, 0) + gap * Math.max(0, list.length - 1);
  const dataBytes = totalSamples * 2;
  const buf = Buffer.alloc(WAV_HEADER_BYTES + dataBytes);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);

  // Kokoro (and the pitch resampler) can overshoot full scale; scale the whole
  // clip down instead of hard-clipping, which sounds like clicks.
  let peak = 0;
  for (const c of list) for (let j = 0; j < c.length; j++) peak = Math.max(peak, Math.abs(c[j] || 0));
  const gain = peak > MAX_PEAK ? MAX_PEAK / peak : 1;

  let offset = WAV_HEADER_BYTES;
  list.forEach((samples, i) => {
    if (i > 0) offset += gap * 2; // Buffer.alloc is zero-filled = silence
    for (let j = 0; j < samples.length; j++) {
      const v = Math.max(-1, Math.min(1, (samples[j] || 0) * gain));
      buf.writeInt16LE(Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), offset);
      offset += 2;
    }
  });
  return buf;
}

/**
 * Duration of a WAV written by encodeWav, from its byte size.
 * @param {number} byteLength
 * @param {number} [sampleRate]
 */
export function wavDurationMs(byteLength, sampleRate = 24000) {
  return Math.round(((Math.max(0, byteLength - WAV_HEADER_BYTES) / 2) / sampleRate) * 1000);
}

/**
 * Decode a PCM WAV (16-bit int or 32-bit float, any channel count) to mono
 * Float32 samples. Enough for what Voicebox returns; no ffmpeg needed.
 * @param {Buffer} buf
 * @returns {{samples: Float32Array, sampleRate: number}}
 */
export function decodeWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let fmt = null;
  for (let pos = 12; pos + 8 <= buf.length; ) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === 'data' && fmt) {
      const float = fmt.format === 3 || (fmt.format === 0xfffe && fmt.bits === 32);
      if (!(float && fmt.bits === 32) && fmt.bits !== 16) throw new Error(`unsupported WAV: format ${fmt.format}, ${fmt.bits}-bit`);
      const bytes = fmt.bits / 8;
      const frames = Math.floor(Math.min(size, buf.length - body) / (bytes * fmt.channels));
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < fmt.channels; c++) {
          const at = body + (i * fmt.channels + c) * bytes;
          sum += float ? buf.readFloatLE(at) : buf.readInt16LE(at) / 0x8000;
        }
        samples[i] = sum / fmt.channels;
      }
      return { samples, sampleRate: fmt.sampleRate };
    }
    pos = body + size + (size % 2);
  }
  throw new Error('WAV has no fmt/data chunk');
}
