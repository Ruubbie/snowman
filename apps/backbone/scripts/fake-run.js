// Dev only: insert ONE clearly-marked fake run (a ~300 s loop with samples,
// events and Olaf cues) so the desktop dashboard's route/scrubber/delete flow
// can be checked without a real workout. Writes straight through the running
// repo: no jobs are queued and no AI is called.
//   npm run fake-run -w @snowman/backbone
// Delete it again from the dashboard (it is flagged "Simulator").
import crypto from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { createRunningRepo } from '@snowman/module-running';

const N = 300;
const START = new Date(Date.now() - 2 * 3600 * 1000);
// A neutral spot (open water off the Dutch coast), not anyone's home.
const CENTER = { lat: 52.6, lon: 4.3 };
const R = 260; // metres

const samples = [];
let dist = 0;
let prev = null;
for (let i = 0; i < N; i++) {
  const a = (i / N) * Math.PI * 2;
  const wobble = 1 + 0.18 * Math.sin(a * 3);
  const lat = CENTER.lat + ((R * wobble * Math.sin(a)) / 6371000) * (180 / Math.PI);
  const lon = CENTER.lon + ((R * wobble * Math.cos(a)) / (6371000 * Math.cos((CENTER.lat * Math.PI) / 180))) * (180 / Math.PI);
  if (prev) {
    const dy = (lat - prev.lat) * 111320;
    const dx = (lon - prev.lon) * 111320 * Math.cos((CENTER.lat * Math.PI) / 180);
    dist += Math.hypot(dx, dy);
  }
  const walking = i >= 120 && i < 180;
  const speed = (walking ? 1.6 : 2.9 + 0.5 * Math.sin(i / 17)) + (Math.random() - 0.5) * 0.3;
  samples.push({
    seq: i,
    t_s: i,
    ts: new Date(START.getTime() + i * 1000).toISOString(),
    lat,
    lon,
    alt_m: 4 + 3 * Math.sin(a * 2),
    h_acc_m: 4 + Math.random() * 3,
    speed_mps: speed,
    dist_m: dist,
    cadence_spm: walking ? 112 + Math.random() * 6 : 160 + Math.random() * 8,
    pace_s_per_km: 1000 / speed,
    segment_index: i < 120 ? 0 : walking ? 1 : 2,
    accepted: true,
  });
  prev = { lat, lon };
}

const events = [
  { seq: 0, t_s: 0, type: 'start', data: null },
  { seq: 1, t_s: 0, type: 'segment_start', data: { index: 0, kind: 'run' } },
  { seq: 2, t_s: 120, type: 'segment_start', data: { index: 1, kind: 'walk' } },
  { seq: 3, t_s: 180, type: 'segment_start', data: { index: 2, kind: 'run' } },
  { seq: 4, t_s: 299, type: 'finish', data: null },
];

const clientId = `fake-dashboard-check-${crypto.randomUUID().slice(0, 8)}`;
const cues = [
  { elapsedS: 5, trigger: 'segment_upcoming', text: 'FAKE: easy start, relax your shoulders.', source: 'live' },
  { elapsedS: 118, trigger: 'segment_upcoming', text: 'FAKE: walk coming up.', source: 'live' },
  { elapsedS: 178, trigger: 'segment_upcoming', text: null, source: 'fallback' },
  { elapsedS: 150, trigger: 'halfway', text: 'FAKE: halfway there.', source: 'live' },
];

const config = loadConfig();
const db = createPool(config.databaseUrl);
const repo = createRunningRepo(db);
try {
  const runId = await repo.upsertRunSummary({
    clientId,
    sessionId: null,
    startedAt: START.toISOString(),
    durationS: N,
    distanceM: Math.round(dist),
    movingTimeS: N,
    avgPaceSPerKm: Math.round((N / dist) * 1000),
    device: { simulated: true, note: 'FAKE test data from apps/backbone/scripts/fake-run.js' },
    note: 'FAKE test run for the desktop dashboard - safe to delete',
    completedPlan: false,
    imported: false,
  });
  await repo.insertSamplesBatch(runId, samples);
  await repo.insertEventsBatch(runId, events);
  for (const c of cues) await repo.insertCue({ runClientId: clientId, sessionId: null, ...c });
  console.log(`Fake run ${runId} (${clientId}): ${samples.length} samples, ${events.length} events, ${cues.length} cues, ${Math.round(dist)} m.`);
} finally {
  await db.end();
}
