import { createSyncQueue } from './queue.js';
import { createDefaultStorage } from './storage.js';
import { getClient } from '../lib/client.js';

let queue = null;

/** Shared offline upload queue, wired to the app's real storage + SDK client. */
export async function getSyncQueue() {
  if (queue) return queue;
  queue = createSyncQueue({
    storage: createDefaultStorage(),
    uploadRun: async (item) => {
      const client = await getClient();
      return client.running.uploadRun({ run: item.run, samples: item.samples, events: item.events });
    },
    now: () => Date.now() / 1000,
  });
  return queue;
}

/** Call on app foreground/launch to retry anything still queued. */
export async function processPendingUploads() {
  const q = await getSyncQueue();
  return q.processQueue();
}

export { createSyncQueue };
export default { getSyncQueue, processPendingUploads };
