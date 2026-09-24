/**
 * Pure analysis over a run's samples/events: splits, elevation, speed,
 * cadence, pace-over-time, segment performance vs brief targets. No DB, no
 * I/O - routes.js feeds this DB rows and stores the result.
 */

const MAX_SANE_SPEED_MPS = 12; // ~43 km/h - above this, treat as GPS noise
const MAX_SPEED_ACCURACY_M = 25;

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** @param {object[]} samples */
function filterAccepted(samples) {
  return (samples || []).filter((s) => s.accepted !== false);
}

/**
 * Moving time (elapsed minus paused stretches) vs raw elapsed time, derived
 * from sample timestamps and pause/resume events.
 * @param {object[]} samples
 * @param {object[]} events
 * @returns {{movingTimeS: number, elapsedTimeS: number}}
 */
export function movingVsElapsed(samples, events) {
  const accepted = filterAccepted(samples).slice().sort((a, b) => a.t_s - b.t_s);
  if (accepted.length === 0) return { movingTimeS: 0, elapsedTimeS: 0 };

  const elapsedTimeS = accepted[accepted.length - 1].t_s - accepted[0].t_s;
  let pausedS = 0;
  let pauseStart = null;
  for (const e of [...(events || [])].sort((a, b) => a.t_s - b.t_s)) {
    if (e.type === 'pause') pauseStart = e.t_s;
    else if (e.type === 'resume' && pauseStart !== null) {
      pausedS += Math.max(0, e.t_s - pauseStart);
      pauseStart = null;
    }
  }
  return { movingTimeS: Math.max(0, round2(elapsedTimeS - pausedS)), elapsedTimeS: round2(elapsedTimeS) };
}

/**
 * Elevation gain/loss with a light 3-point moving-average smoothing pass,
 * preferring the barometer (rel_alt_m) over GPS altitude (alt_m).
 * @param {object[]} samples
 * @returns {{gainM: number, lossM: number}}
 */
export function elevation(samples) {
  const withAlt = filterAccepted(samples)
    .filter((s) => s.rel_alt_m != null || s.alt_m != null)
    .sort((a, b) => a.t_s - b.t_s);
  if (withAlt.length < 2) return { gainM: 0, lossM: 0 };

  const raw = withAlt.map((s) => (s.rel_alt_m != null ? s.rel_alt_m : s.alt_m));
  const smoothed = raw.map((_, i, arr) => {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(arr.length - 1, i + 1);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += arr[j];
    return sum / (hi - lo + 1);
  });

  let gain = 0;
  let loss = 0;
  for (let i = 1; i < smoothed.length; i++) {
    const delta = smoothed[i] - smoothed[i - 1];
    if (delta > 0) gain += delta;
    else loss += -delta;
  }
  return { gainM: round2(gain), lossM: round2(loss) };
}

/**
 * Max speed after dropping GPS noise (speed > 12 m/s, or horizontal
 * accuracy worse than 25 m).
 * @param {object[]} samples
 * @returns {number|null}
 */
export function maxSpeed(samples) {
  const candidates = filterAccepted(samples).filter(
    (s) => s.speed_mps != null && s.speed_mps <= MAX_SANE_SPEED_MPS && (s.h_acc_m == null || s.h_acc_m <= MAX_SPEED_ACCURACY_M),
  );
  if (candidates.length === 0) return null;
  return round2(Math.max(...candidates.map((s) => s.speed_mps)));
}

/**
 * @param {object[]} samples
 * @returns {number|null}
 */
export function avgCadence(samples) {
  const vals = filterAccepted(samples)
    .map((s) => s.cadence_spm)
    .filter((v) => v != null);
  if (!vals.length) return null;
  return round2(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/**
 * Per-km splits from cumulative distance: pace, elevation change, cadence
 * for each completed kilometer.
 * @param {object[]} samples
 * @returns {Array<{km:number, paceSPerKm:number, elevGainM:number, elevLossM:number, avgCadenceSpm:number|null}>}
 */
export function computeSplits(samples) {
  const accepted = filterAccepted(samples)
    .filter((s) => s.dist_m != null)
    .sort((a, b) => a.t_s - b.t_s);
  if (!accepted.length) return [];

  const splits = [];
  let kmIndex = 1;
  let segStart = 0;
  for (let i = 0; i < accepted.length; i++) {
    if (accepted[i].dist_m >= kmIndex * 1000) {
      const segSamples = accepted.slice(segStart, i + 1);
      const paceSPerKm = round2(segSamples[segSamples.length - 1].t_s - segSamples[0].t_s);
      const elev = elevation(segSamples);
      splits.push({
        km: kmIndex,
        paceSPerKm,
        elevGainM: elev.gainM,
        elevLossM: elev.lossM,
        avgCadenceSpm: avgCadence(segSamples),
      });
      kmIndex++;
      segStart = i;
    }
  }
  return splits;
}

/**
 * The fastest continuous 1km stretch anywhere in the run (sliding window
 * over cumulative distance), not just at km-split boundaries.
 * @param {object[]} samples
 * @returns {{startDistM:number, paceSPerKm:number}|null}
 */
export function fastestKm(samples) {
  const accepted = filterAccepted(samples)
    .filter((s) => s.dist_m != null)
    .sort((a, b) => a.t_s - b.t_s);
  if (accepted.length < 2) return null;

  let best = null;
  let left = 0;
  for (let right = 0; right < accepted.length; right++) {
    while (accepted[right].dist_m - accepted[left].dist_m > 1000) left++;
    const distM = accepted[right].dist_m - accepted[left].dist_m;
    if (distM >= 1000) {
      const timeS = accepted[right].t_s - accepted[left].t_s;
      const paceSPerKm = (timeS / distM) * 1000;
      if (best === null || paceSPerKm < best.paceSPerKm) {
        best = { startDistM: round2(accepted[left].dist_m), paceSPerKm: round2(paceSPerKm) };
      }
    }
  }
  return best;
}

/**
 * @param {object[]} samples
 * @returns {Array<{tS:number, paceSPerKm:number|null}>}
 */
export function paceSeries(samples) {
  return filterAccepted(samples)
    .slice()
    .sort((a, b) => a.t_s - b.t_s)
    .map((s) => ({
      tS: s.t_s,
      paceSPerKm: s.pace_s_per_km ?? (s.speed_mps ? round2(1000 / s.speed_mps) : null),
    }));
}

/**
 * Per-segment performance (matched via sample.segment_index) against the
 * brief's target pace range, if any.
 * @param {object[]} samples
 * @param {{kind:string}[]} segments planned workout segments (session.segments)
 * @param {{segment_index:number, pace_min_s_per_km:number|null, pace_max_s_per_km:number|null}[]} targets from a run_brief
 * @returns {Array<{segmentIndex:number, kind:string|null, avgPaceSPerKm:number|null, timeInTargetPct:number|null}>}
 */
export function segmentStats(samples, segments = [], targets = []) {
  const byIndex = new Map();
  for (const s of filterAccepted(samples)) {
    if (s.segment_index == null) continue;
    if (!byIndex.has(s.segment_index)) byIndex.set(s.segment_index, []);
    byIndex.get(s.segment_index).push(s);
  }
  const targetByIndex = new Map(targets.map((t) => [t.segment_index, t]));

  const stats = [];
  for (const [index, segSamples] of byIndex) {
    const paces = segSamples
      .map((s) => s.pace_s_per_km ?? (s.speed_mps ? 1000 / s.speed_mps : null))
      .filter((p) => p != null);
    const avgPaceSPerKm = paces.length ? round2(paces.reduce((a, b) => a + b, 0) / paces.length) : null;

    const target = targetByIndex.get(index);
    let timeInTargetPct = null;
    if (target && paces.length && (target.pace_min_s_per_km != null || target.pace_max_s_per_km != null)) {
      const inRange = paces.filter(
        (p) =>
          (target.pace_min_s_per_km == null || p >= target.pace_min_s_per_km) &&
          (target.pace_max_s_per_km == null || p <= target.pace_max_s_per_km),
      );
      timeInTargetPct = round2((inRange.length / paces.length) * 100);
    }

    stats.push({ segmentIndex: index, kind: segments[index]?.kind ?? null, avgPaceSPerKm, timeInTargetPct });
  }
  return stats.sort((a, b) => a.segmentIndex - b.segmentIndex);
}

/**
 * Full analysis bundle for a run.
 * @param {{samples?: object[], events?: object[], segments?: object[], targets?: object[]}} input
 */
export function analyzeRun({ samples = [], events = [], segments = [], targets = [] }) {
  const { movingTimeS, elapsedTimeS } = movingVsElapsed(samples, events);
  const elev = elevation(samples);
  return {
    movingTimeS,
    elapsedTimeS,
    elevGainM: elev.gainM,
    elevLossM: elev.lossM,
    maxSpeedMps: maxSpeed(samples),
    avgCadenceSpm: avgCadence(samples),
    splits: computeSplits(samples),
    fastestKm: fastestKm(samples),
    paceSeries: paceSeries(samples),
    segmentStats: segmentStats(samples, segments, targets),
  };
}
