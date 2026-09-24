// Offline upload queue for finished runs: {run, samples, events} retried
// with backoff until POST /v1/running/runs succeeds. Idempotent on
// run.clientId - re-enqueuing the same clientId replaces the pending item
// rather than duplicating it, and a run already uploaded is a no-op.
const BACKOFF_S = [5, 15, 30, 60, 120, 300]; // caps at 5 min between retries

function backoffFor(attempts) {
  // attempts is the count AFTER the failure that just happened (1-based) -
  // the first failure waits BACKOFF_S[0], the second BACKOFF_S[1], etc.
  return BACKOFF_S[Math.min(Math.max(attempts - 1, 0), BACKOFF_S.length - 1)];
}

/**
 * @param {{storage: {load: () => Promise<any[]>, save: (items: any[]) => Promise<void>}, uploadRun: (item: {run, samples, events}) => Promise<any>, now?: () => number}} deps
 */
export function createSyncQueue({ storage, uploadRun, now = () => Date.now() / 1000 }) {
  let items = []; // [{run, samples, events, attempts, nextAttemptAt}]
  let loaded = false;
  let processing = false;

  async function ensureLoaded() {
    if (loaded) return;
    items = (await storage.load()) || [];
    loaded = true;
  }

  async function persist() {
    await storage.save(items);
  }

  /** Add a finished run to the queue (or replace a still-pending one with the same clientId). */
  async function enqueue({ run, samples = [], events = [] }) {
    await ensureLoaded();
    const clientId = run.clientId;
    const existingIndex = items.findIndex((i) => i.run.clientId === clientId);
    const entry = { run, samples, events, attempts: 0, nextAttemptAt: now() };
    if (existingIndex >= 0) items[existingIndex] = entry;
    else items.push(entry);
    await persist();
    return entry;
  }

  /** Attempt to upload every item whose backoff has elapsed. Safe to call repeatedly (e.g. on app foreground, on a timer, or after connectivity returns). */
  async function processQueue() {
    await ensureLoaded();
    if (processing) return { uploaded: 0, remaining: items.length };
    processing = true;
    let uploaded = 0;
    try {
      const t = now();
      const due = items.filter((i) => i.nextAttemptAt <= t);
      for (const item of due) {
        try {
          await uploadRun(item);
          items = items.filter((i) => i !== item);
          uploaded += 1;
        } catch {
          item.attempts += 1;
          item.nextAttemptAt = t + backoffFor(item.attempts);
        }
      }
      await persist();
    } finally {
      processing = false;
    }
    return { uploaded, remaining: items.length };
  }

  async function getPending() {
    await ensureLoaded();
    return items.slice();
  }

  return { enqueue, processQueue, getPending };
}

export default { createSyncQueue };
