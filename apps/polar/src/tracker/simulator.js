// Web/fallback run "tracker": generates a synthetic 1Hz route near
// 52.3580,4.8686 with GPS noise and pace variation, drives cueRules, and
// speaks cues with expo-speech. Implements the same API surface as the
// native RunTracker module (see apps/polar/modules/run-tracker/index.js)
// so src/tracker/index.js can swap between them transparently.
import * as Speech from 'expo-speech';
import { createCueEngine } from './cueRules.js';

const START_LAT = 52.358;
const START_LON = 4.8686;
const METERS_PER_DEG_LAT = 111_320;
const TICK_MS = 1000;

function metersPerDegLon(lat) {
  return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

function gaussianNoise(sigma) {
  // Box-Muller
  const u1 = Math.max(Number.EPSILON, Math.random());
  const u2 = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Base pace (s/km) per segment kind - the synthetic "runner". */
const BASE_PACE_S_PER_KM = { warmup: 400, run: 330, walk: 480, cooldown: 420, rest: 480 };

const listeners = new Map(); // event -> Set<fn>
function emit(event, payload) {
  for (const fn of listeners.get(event) || []) fn(payload);
}

let config = { baseUrl: null, token: null };
let speedMultiplier = 1;
let cueClient = null; // optional {postCue} injected by configure() for live Olaf cues

export function setSpeedMultiplier(mult) {
  speedMultiplier = mult;
}

export function configure(options = {}) {
  config = { ...config, ...options };
  cueClient = options.cueClient || null;
}

export async function prepare() {
  // No real permissions on web; report a simulated GPS lock after a moment.
  setTimeout(() => emit('gps', { accuracy_m: 6 }), 800);
  return { granted: true };
}

export function cancel() {}

export function prefetch() {}

let runState = null;

function fallbackLineFor(trigger, brief) {
  const lines = brief?.fallback_lines || {};
  switch (trigger) {
    case 'too_fast':
      return lines.too_fast;
    case 'too_slow':
      return lines.too_slow;
    case 'km_split':
      return lines.km_split;
    case 'halfway':
      return lines.halfway;
    case 'finish':
      return lines.finish;
    case 'checkin':
    case 'slowing':
      return lines.encourage;
    default:
      return null;
  }
}

async function requestOlafLine(trigger, snapshot) {
  if (!cueClient) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await cueClient.postCue({
      runClientId: runState.runClientId,
      sessionId: runState.sessionId,
      trigger,
      snapshot,
      signal: controller.signal,
    });
    return res?.say || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function speak(text) {
  if (!text) return;
  try {
    Speech.speak(text);
  } catch {
    // no-op if speech isn't available in this environment (e.g. tests)
  }
}

async function handleTrigger(fired, snapshot) {
  const { engine, brief } = runState;
  const { trigger, segmentIndex, phase } = fired;

  // 'start' is local bookkeeping only (not in the backend's CUE_TRIGGERS
  // enum / brief.fallback_lines) - never worth a spoken cue or a network call.
  if (trigger === 'start') return;

  if (trigger === 'segment_upcoming') {
    const kind = brief?.targets?.[segmentIndex]?.kind || runState.segments[segmentIndex]?.kind;
    const fallback = kind === 'walk' ? brief?.fallback_lines?.to_walk : brief?.fallback_lines?.to_run;
    if (phase === 'request') {
      const say = await requestOlafLine('segment_upcoming', snapshot);
      if (say) {
        engine.recordSpoken(trigger, say);
        runState.pendingUpcomingLine = say;
      }
      return;
    }
    // phase === 'switch': ALWAYS announce, live line if we already have one, else fallback
    const line = runState.pendingUpcomingLine || fallback;
    runState.pendingUpcomingLine = null;
    speak(line);
    engine.recordSpoken(trigger, line);
    emit('cue', { text: line, trigger, source: runState.pendingUpcomingLine ? 'live' : 'fallback' });
    return;
  }

  // Non-critical: try Olaf, else fall back (throttled), else stay silent.
  const say = await requestOlafLine(trigger, snapshot);
  if (say) {
    speak(say);
    engine.recordSpoken(trigger, say);
    emit('cue', { text: say, trigger, source: 'live' });
    return;
  }
  const fallback = fallbackLineFor(trigger, brief);
  if (fallback && engine.canUseFallback(trigger, snapshot.elapsed_s)) {
    engine.recordFallbackUsed(trigger, snapshot.elapsed_s);
    speak(fallback);
    engine.recordSpoken(trigger, fallback);
    emit('cue', { text: fallback, trigger, source: 'fallback' });
  }
}

function nextRoutePoint(prev, headingDeg, speedMps) {
  const rad = (headingDeg * Math.PI) / 180;
  const dLat = ((speedMps * Math.cos(rad)) / METERS_PER_DEG_LAT) + gaussianNoise(0.0000015);
  const dLon = (speedMps * Math.sin(rad)) / metersPerDegLon(prev.lat) + gaussianNoise(0.0000015);
  return { lat: prev.lat + dLat, lon: prev.lon + dLon };
}

export function start({ sessionId, runClientId, segments = [], brief } = {}) {
  const totalPlannedS = segments.reduce((s, seg) => s + (seg.seconds || 0), 0);
  const engine = createCueEngine({ segments, totalPlannedS });

  runState = {
    sessionId,
    runClientId,
    segments,
    brief,
    engine,
    state: 'running',
    elapsedS: 0,
    distanceM: 0,
    seq: 0,
    lastKmAt: 0,
    lastKmDistance: 0,
    position: { lat: START_LAT, lon: START_LON },
    heading: Math.random() * 360,
    samples: [],
    events: [],
    pendingUpcomingLine: null,
    timer: null,
  };

  emit('state', { state: 'running' });
  runState.timer = setInterval(tick, TICK_MS / speedMultiplier);
  return Promise.resolve();
}

function currentSegmentIndex(elapsedS) {
  let acc = 0;
  for (let i = 0; i < runState.segments.length; i++) {
    const next = acc + (runState.segments[i].seconds || 0);
    if (elapsedS < next) return i;
    acc = next;
  }
  return Math.max(0, runState.segments.length - 1);
}

function tick() {
  if (!runState || runState.state !== 'running') return;
  const t = runState.elapsedS;
  const segIndex = currentSegmentIndex(t);
  const seg = runState.segments[segIndex] || { kind: 'run' };
  const targetPace = BASE_PACE_S_PER_KM[seg.kind] || 330;
  const paceNoise = gaussianNoise(12);
  const pace30s = Math.max(180, targetPace + paceNoise);
  const speedMps = 1000 / pace30s;

  runState.position = nextRoutePoint(runState.position, runState.heading, speedMps);
  runState.heading = (runState.heading + gaussianNoise(8) + 360) % 360;
  runState.distanceM += speedMps;
  const accuracyM = Math.max(3, 6 + gaussianNoise(3));
  const accepted = accuracyM < 30;

  const sample = {
    seq: runState.seq++,
    t_s: t,
    ts: new Date().toISOString(),
    lat: runState.position.lat,
    lon: runState.position.lon,
    h_acc_m: accuracyM,
    speed_mps: speedMps,
    dist_m: runState.distanceM,
    pace_s_per_km: pace30s,
    cadence_spm: seg.kind === 'walk' ? 110 + gaussianNoise(5) : 165 + gaussianNoise(6),
    segment_index: segIndex,
    accepted,
  };
  runState.samples.push(sample);

  const target = runState.brief?.targets?.[segIndex];
  const snapshot = {
    state: 'running',
    elapsed_s: t,
    distance_m: Math.round(runState.distanceM),
    pace_30s: pace30s,
    avg_pace: runState.distanceM > 0 ? (t / (runState.distanceM / 1000)) : null,
    segment: { index: segIndex, kind: seg.kind, remaining_s: segStartFor(segIndex + 1) - t },
    next_segment: runState.segments[segIndex + 1] || null,
    gps_accuracy_m: accuracyM,
    cadence_spm: sample.cadence_spm,
  };
  emit('tick', snapshot);

  // track km split paces for the "slowing" rule
  const km = Math.floor(runState.distanceM / 1000);
  if (km > Math.floor(runState.lastKmDistance / 1000)) {
    const splitS = t - runState.lastKmAt;
    runState.engine.recordKmSplitPace(splitS);
    runState.lastKmAt = t;
  }
  runState.lastKmDistance = runState.distanceM;

  const fired = runState.engine.tick({
    t_s: t,
    distance_m: runState.distanceM,
    pace_30s: pace30s,
    target: target ? { min: target.pace_min_s_per_km, max: target.pace_max_s_per_km } : null,
    gpsAccepted: accepted,
  });

  for (const f of fired) {
    if (f.trigger === 'finish') {
      handleTrigger(f, snapshot).finally(() => finishInternal());
      return;
    }
    handleTrigger(f, snapshot);
  }

  runState.elapsedS += 1;
}

function segStartFor(index) {
  let acc = 0;
  for (let i = 0; i < index && i < runState.segments.length; i++) acc += runState.segments[i].seconds || 0;
  return acc;
}

export function pause() {
  if (!runState) return;
  runState.state = 'paused';
  clearInterval(runState.timer);
  emit('state', { state: 'paused' });
  runState.engine.tick({ t_s: runState.elapsedS, paused: true });
}

export function resume() {
  if (!runState) return;
  runState.state = 'running';
  emit('state', { state: 'running' });
  runState.engine.tick({ t_s: runState.elapsedS, justResumed: true });
  runState.timer = setInterval(tick, TICK_MS / speedMultiplier);
}

function finishInternal() {
  if (!runState) return;
  clearInterval(runState.timer);
  runState.state = 'finished';
  emit('state', { state: 'finished' });
}

export async function finish() {
  if (!runState) return { run: null, samples: [], events: [] };
  clearInterval(runState.timer);
  runState.state = 'finished';
  const result = {
    run: {
      clientId: runState.runClientId,
      sessionId: runState.sessionId,
      startedAt: new Date(Date.now() - runState.elapsedS * 1000).toISOString(),
      durationS: runState.elapsedS,
      distanceM: Math.round(runState.distanceM),
    },
    samples: runState.samples,
    events: runState.events,
  };
  runState = null;
  return result;
}

export async function getUnfinishedRuns() {
  return runState ? [{ runClientId: runState.runClientId }] : [];
}

export function addListener(event, cb) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(cb);
  return { remove: () => listeners.get(event)?.delete(cb) };
}

export function removeAllListeners(event) {
  if (event) listeners.delete(event);
  else listeners.clear();
}

export const isAvailable = true; // always usable as the fallback

export default {
  isAvailable,
  configure,
  prepare,
  prefetch,
  start,
  pause,
  resume,
  finish,
  getUnfinishedRuns,
  addListener,
  removeAllListeners,
  setSpeedMultiplier,
};
