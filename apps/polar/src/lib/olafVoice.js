import tracker from '../tracker/index.js';
import { tokenStore } from './tokenStore.js';

/**
 * Download Olaf's pre-recorded lines onto the phone well before a run, so
 * they're there even with bad signal at the door. Today's lines are fetched
 * even if the server is still recording them (the download waits); later
 * days only once they're fully recorded, so this never jumps the server's
 * queue. Clips stay cached on the phone and are reused whenever the same
 * line comes up again.
 * @param {{brief?: object|null, audio?: object|null}|null} today brief with its audio urls
 * @param {{brief?: object|null, audio?: object|null, voice?: {ready: number, total: number}|null}[]} later sessions from /running/upcoming
 */
export async function prefetchOlafLines(today, later = []) {
  if (!tracker.isNative) return;
  const [baseUrl, token] = await Promise.all([tokenStore.getServerUrl(), tokenStore.getToken()]);
  if (!baseUrl || !token) return;
  tracker.configure({ baseUrl, token });
  for (const s of later) {
    if (s.brief && s.audio && s.voice && s.voice.ready >= s.voice.total) tracker.prefetch({ ...s.brief, audio: s.audio });
  }
  // Last, so the run screen's progress starts from today's lines.
  if (today?.brief && today.audio) tracker.prefetch({ ...today.brief, audio: today.audio });
}
