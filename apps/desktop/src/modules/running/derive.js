// Turn raw run samples into chart/route series. Pure functions.
import { fmtDistance, fmtShortDate, plural } from '../../lib/format.js';

function rollingMean(values, half) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      if (values[j] != null) {
        sum += values[j];
        n++;
      }
    }
    out[i] = n ? sum / n : null;
  }
  return out;
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

/**
 * @param {object[]} samples raw samples from the admin API
 * @param {{segments?: {kind:string}[]}|null} session
 */
export function prepareRun(samples, session) {
  const acc = (samples || []).filter((s) => s.accepted !== false).sort((a, b) => a.t_s - b.t_s);
  const rawSpeed = acc.map((s, i) => {
    if (s.speed_mps != null && s.speed_mps >= 0) return s.speed_mps;
    const prev = acc[i - 1];
    if (prev && s.dist_m != null && prev.dist_m != null && s.t_s > prev.t_s) return (s.dist_m - prev.dist_m) / (s.t_s - prev.t_s);
    return null;
  });
  const speed = rollingMean(rawSpeed, 5); // ~10 s window at 1 Hz
  const alt = rollingMean(
    acc.map((s) => (s.rel_alt_m != null ? s.rel_alt_m : s.alt_m ?? null)),
    3,
  );
  const cadence = rollingMean(
    acc.map((s) => s.cadence_spm ?? null),
    5,
  );

  const sortedSpeeds = speed.filter((v) => v != null && v > 0.2).sort((a, b) => a - b);
  const cuts = [0.2, 0.4, 0.6, 0.8].map((q) => quantile(sortedSpeeds, q));
  const bucketOf = (v) => (v == null ? 0 : cuts.filter((c) => v > c).length);

  const rows = acc.map((s, i) => ({
    t: s.t_s,
    ts: s.ts,
    lat: s.lat,
    lon: s.lon,
    distM: s.dist_m,
    speed: speed[i],
    pace: speed[i] && speed[i] > 0.3 ? 1000 / speed[i] : null,
    alt: alt[i],
    cadence: cadence[i],
    hAcc: s.h_acc_m,
    segment: s.segment_index,
    bucket: bucketOf(speed[i]),
  }));

  const route = rows.filter((r) => r.lat != null && r.lon != null);
  const routeIndexOf = new Map(route.map((r, i) => [r, i]));

  // Contiguous segment_index stretches -> chart bands.
  const bands = [];
  for (const r of rows) {
    const kind = r.segment == null ? null : session?.segments?.[r.segment]?.kind;
    if (!kind) continue; // no planned session -> nothing to shade
    const last = bands[bands.length - 1];
    if (last && last.index === r.segment) last.to = r.t;
    else bands.push({ index: r.segment, from: r.t, to: r.t, tone: kind });
  }

  return {
    rows,
    route,
    routeIndexOf,
    bands,
    duration: rows.length ? rows[rows.length - 1].t : 0,
    speedRange: sortedSpeeds.length ? [sortedSpeeds[0], sortedSpeeds[sortedSpeeds.length - 1]] : null,
    hasAlt: rows.some((r) => r.alt != null),
    hasCadence: rows.some((r) => r.cadence != null),
  };
}

/** Nearest row index for a time offset (rows sorted by t). */
export function indexAtTime(rows, t) {
  let lo = 0;
  let hi = rows.length - 1;
  if (hi < 0) return 0;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].t <= t) lo = mid;
    else hi = mid;
  }
  return Math.abs(rows[hi].t - t) < Math.abs(rows[lo].t - t) ? hi : lo;
}

export const SOURCE_LABEL = { imported: 'Imported', native: 'iPhone', simulated: 'Simulated', unknown: 'Unknown source' };
export const SOURCE_TONE = { imported: 'neutral', native: 'info', simulated: 'warning', unknown: 'neutral' };
export const SUSPECT_LABEL = {
  no_samples: 'No samples',
  simulated: 'Simulator',
  too_short: 'Under 100 m',
  duplicate_time: 'Duplicate time',
};

/** "Run of 24 Sep, 3.2 km — 1,912 samples, 14 events, 6 cues" */
export function describeRun(run) {
  return `Run of ${fmtShortDate(run.startedAt)}, ${fmtDistance(run.distanceM)} — ${plural(run.sampleCount ?? run.samples ?? 0, 'sample')}, ${plural(
    run.eventCount ?? run.events ?? 0,
    'event',
  )}, ${plural(run.cueCount ?? run.cues ?? 0, 'cue')}`;
}
