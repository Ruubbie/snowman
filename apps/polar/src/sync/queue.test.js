import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncQueue } from './queue.js';

function fakeStorage() {
  let saved = [];
  return {
    async load() {
      return JSON.parse(JSON.stringify(saved));
    },
    async save(items) {
      saved = JSON.parse(JSON.stringify(items));
    },
    _dump: () => saved,
  };
}

function run(clientId) {
  return { clientId, startedAt: '2026-01-01T00:00:00Z', durationS: 60, distanceM: 100 };
}

test('enqueue persists the item and processQueue uploads it once due', async () => {
  const storage = fakeStorage();
  let uploadedIds = [];
  let t = 0;
  const queue = createSyncQueue({
    storage,
    uploadRun: async (item) => {
      uploadedIds.push(item.run.clientId);
    },
    now: () => t,
  });

  await queue.enqueue({ run: run('run-1'), samples: [], events: [] });
  assert.equal((await queue.getPending()).length, 1);

  const result = await queue.processQueue();
  assert.equal(result.uploaded, 1);
  assert.equal(result.remaining, 0);
  assert.deepEqual(uploadedIds, ['run-1']);
  assert.equal(storage._dump().length, 0);
});

test('a failed upload is retried later with backoff, not immediately', async () => {
  const storage = fakeStorage();
  let attempts = 0;
  let t = 0;
  const queue = createSyncQueue({
    storage,
    uploadRun: async () => {
      attempts += 1;
      throw new Error('network down');
    },
    now: () => t,
  });

  await queue.enqueue({ run: run('run-2'), samples: [], events: [] });
  let result = await queue.processQueue();
  assert.equal(result.uploaded, 0);
  assert.equal(result.remaining, 1);
  assert.equal(attempts, 1);

  // immediately retrying again should NOT re-attempt (backoff not elapsed)
  result = await queue.processQueue();
  assert.equal(attempts, 1);

  // advance time past the first backoff window (5s)
  t = 10;
  result = await queue.processQueue();
  assert.equal(attempts, 2);
});

test('enqueue is idempotent on run.clientId - re-enqueuing replaces, not duplicates', async () => {
  const storage = fakeStorage();
  const queue = createSyncQueue({ storage, uploadRun: async () => {}, now: () => 0 });

  await queue.enqueue({ run: run('run-3'), samples: [{ seq: 0, t_s: 0 }], events: [] });
  await queue.enqueue({ run: run('run-3'), samples: [{ seq: 0, t_s: 0 }, { seq: 1, t_s: 1 }], events: [] });

  const pending = await queue.getPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].samples.length, 2);
});

test('a run that eventually succeeds is removed and stays removed', async () => {
  const storage = fakeStorage();
  let shouldFail = true;
  let t = 0;
  const queue = createSyncQueue({
    storage,
    uploadRun: async () => {
      if (shouldFail) throw new Error('offline');
    },
    now: () => t,
  });

  await queue.enqueue({ run: run('run-4'), samples: [], events: [] });
  await queue.processQueue();
  assert.equal((await queue.getPending()).length, 1);

  shouldFail = false;
  t = 10;
  const result = await queue.processQueue();
  assert.equal(result.uploaded, 1);
  assert.equal((await queue.getPending()).length, 0);
});

test('queue survives a reload by re-reading from storage', async () => {
  const storage = fakeStorage();
  const queueA = createSyncQueue({ storage, uploadRun: async () => {}, now: () => 0 });
  await queueA.enqueue({ run: run('run-5'), samples: [], events: [] });

  // simulate app restart: fresh queue instance, same storage
  const queueB = createSyncQueue({ storage, uploadRun: async () => {}, now: () => 0 });
  const pending = await queueB.getPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].run.clientId, 'run-5');
});
