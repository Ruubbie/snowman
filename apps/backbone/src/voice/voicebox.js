import { decodeWav } from './wav.js';
import { clarity } from './clarity.js';

/** Voicebox engine used for Olaf: zero-shot clone of the profile's reference clip. */
const ENGINE = 'chatterbox_turbo';
/** Chatterbox on 2 Arm cores is ~10x slower than realtime; long briefs take minutes. */
const GENERATE_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Backend that asks a Voicebox server (github.com/jamiepine/voicebox) to speak
 * with a cloned voice profile. Same shape as loadKokoro: {sampleRate, synthesize}.
 * @param {{url: string, profileId: string, fetch?: typeof fetch}} opts
 */
export async function loadVoicebox({ url, profileId, fetch: f = fetch }) {
  const base = url.replace(/\/+$/, '');
  const health = await f(`${base}/health`);
  if (!health.ok) throw new Error(`Voicebox not reachable at ${base} (${health.status})`);
  const profile = await f(`${base}/profiles/${profileId}`);
  if (!profile.ok) throw new Error(`Voicebox profile ${profileId} not found (${profile.status})`);

  const backend = {
    sampleRate: 24000,
    async synthesize(text) {
      const res = await f(`${base}/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, text, engine: ENGINE, language: 'en' }),
      });
      if (!res.ok) throw new Error(`Voicebox generate failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
      const { id } = await res.json();
      try {
        // Server-sent events that end once the generation is completed or failed.
        const status = await f(`${base}/generate/${id}/status`, { signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS) });
        const events = (await status.text()).match(/^data: .*$/gm) || [];
        const last = events.length ? JSON.parse(events.at(-1).slice(6)) : {};
        if (last.status !== 'completed') throw new Error(`Voicebox generation ${last.status || 'unknown'}: ${last.error || ''}`);
        const audio = await f(`${base}/audio/${id}`);
        if (!audio.ok) throw new Error(`Voicebox audio fetch failed (${audio.status})`);
        const { samples, sampleRate } = decodeWav(Buffer.from(await audio.arrayBuffer()));
        backend.sampleRate = sampleRate;
        return clarity(samples, sampleRate);
      } finally {
        // We keep our own cache; don't let Voicebox's history grow forever.
        await f(`${base}/history/${id}`, { method: 'DELETE' }).catch(() => {});
      }
    },
  };
  return backend;
}
