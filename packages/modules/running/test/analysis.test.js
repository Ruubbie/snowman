import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  movingVsElapsed,
  elevation,
  maxSpeed,
  avgCadence,
  computeSplits,
  fastestKm,
  paceSeries,
  segmentStats,
  analyzeRun,
} from '../src/analysis.js';

function sample(overrides) {
  return { seq: 0, t_s: 0, accepted: true, ...overrides };
}

test('movingVsElapsed subtracts paused stretches from elapsed time', () => {
  const samples = [sample({ seq: 0, t_s: 0 }), sample({ seq: 1, t_s: 100 })];
  const events = [
    { seq: 0, t_s: 20, type: 'pause' },
    { seq: 1, t_s: 50, type: 'resume' },
  ];
  const result = movingVsElapsed(samples, events);
  assert.equal(result.elapsedTimeS, 100);
  assert.equal(result.movingTimeS, 70); // 100 - (50-20)
});

test('movingVsElapsed with no events equals elapsed time', () => {
  const samples = [sample({ seq: 0, t_s: 0 }), sample({ seq: 1, t_s: 60 })];
  const result = movingVsElapsed(samples, []);
  assert.equal(result.elapsedTimeS, 60);
  assert.equal(result.movingTimeS, 60);
});

test('elevation counts gain for an ascending profile (rel_alt_m)', () => {
  const samples = [
    sample({ seq: 0, t_s: 0, rel_alt_m: 0 }),
    sample({ seq: 1, t_s: 10, rel_alt_m: 10 }),
    sample({ seq: 2, t_s: 20, rel_alt_m: 20 }),
    sample({ seq: 3, t_s: 30, rel_alt_m: 30 }),
  ];
  const { gainM, lossM } = elevation(samples);
  assert.ok(gainM > 0);
  assert.equal(lossM, 0);
});

test('elevation counts loss for a descending profile (rel_alt_m)', () => {
  const samples = [
    sample({ seq: 0, t_s: 0, rel_alt_m: 30 }),
    sample({ seq: 1, t_s: 10, rel_alt_m: 20 }),
    sample({ seq: 2, t_s: 20, rel_alt_m: 10 }),
    sample({ seq: 3, t_s: 30, rel_alt_m: 0 }),
  ];
  const { gainM, lossM } = elevation(samples);
  assert.equal(gainM, 0);
  assert.ok(lossM > 0);
});

test('elevation falls back to alt_m when rel_alt_m is missing', () => {
  const samples = [
    sample({ seq: 0, t_s: 0, alt_m: 100 }),
    sample({ seq: 1, t_s: 10, alt_m: 110 }),
    sample({ seq: 2, t_s: 20, alt_m: 120 }),
  ];
  const { gainM } = elevation(samples);
  assert.ok(gainM > 0);
});

test('maxSpeed drops GPS noise above 12 m/s or worse than 25m accuracy', () => {
  const samples = [
    sample({ seq: 0, t_s: 0, speed_mps: 3.5, h_acc_m: 5 }),
    sample({ seq: 1, t_s: 1, speed_mps: 40, h_acc_m: 5 }), // implausible speed - dropped
    sample({ seq: 2, t_s: 2, speed_mps: 4, h_acc_m: 30 }), // bad accuracy - dropped
    sample({ seq: 3, t_s: 3, speed_mps: 4.2, h_acc_m: 5 }),
  ];
  assert.equal(maxSpeed(samples), 4.2);
});

test('maxSpeed is null with no usable samples', () => {
  assert.equal(maxSpeed([]), null);
});

test('avgCadence averages present cadence readings, ignoring nulls', () => {
  const samples = [
    sample({ seq: 0, t_s: 0, cadence_spm: 160 }),
    sample({ seq: 1, t_s: 1, cadence_spm: null }),
    sample({ seq: 2, t_s: 2, cadence_spm: 170 }),
  ];
  assert.equal(avgCadence(samples), 165);
});

test('computeSplits produces one entry per completed km with pace = seconds for that km', () => {
  const samples = [
    sample({ seq: 0, t_s: 0, dist_m: 0 }),
    sample({ seq: 1, t_s: 300, dist_m: 1000 }), // km 1 in 300s
    sample({ seq: 2, t_s: 620, dist_m: 2000 }), // km 2 in 320s
  ];
  const splits = computeSplits(samples);
  assert.equal(splits.length, 2);
  assert.equal(splits[0].km, 1);
  assert.equal(splits[0].paceSPerKm, 300);
  assert.equal(splits[1].km, 2);
  assert.equal(splits[1].paceSPerKm, 320);
});

test('fastestKm finds the quickest continuous 1km window, not just split boundaries', () => {
  const samples = [
    sample({ seq: 0, t_s: 0, dist_m: 0 }),
    sample({ seq: 1, t_s: 200, dist_m: 500 }), // fast half-km start
    sample({ seq: 2, t_s: 400, dist_m: 1000 }),
    sample({ seq: 3, t_s: 700, dist_m: 1500 }), // slower back half
  ];
  const best = fastestKm(samples);
  assert.ok(best);
  assert.equal(best.startDistM, 0);
  assert.equal(best.paceSPerKm, 400);
});

test('paceSeries derives pace from speed when pace_s_per_km is absent', () => {
  const samples = [sample({ seq: 0, t_s: 0, speed_mps: 2.5 })];
  const series = paceSeries(samples);
  assert.equal(series[0].paceSPerKm, 400); // 1000/2.5
});

test('segmentStats computes avg pace and % time in target range per segment', () => {
  const samples = [
    sample({ seq: 0, t_s: 0, segment_index: 0, pace_s_per_km: 300 }),
    sample({ seq: 1, t_s: 1, segment_index: 0, pace_s_per_km: 320 }),
    sample({ seq: 2, t_s: 2, segment_index: 0, pace_s_per_km: 500 }), // outside target
  ];
  const stats = segmentStats(samples, [{ kind: 'run' }], [
    { segment_index: 0, pace_min_s_per_km: 280, pace_max_s_per_km: 330 },
  ]);
  assert.equal(stats.length, 1);
  assert.equal(stats[0].kind, 'run');
  assert.ok(Math.abs(stats[0].timeInTargetPct - (2 / 3) * 100) < 0.01);
});

test('analyzeRun bundles every metric together', () => {
  const samples = [
    sample({ seq: 0, t_s: 0, dist_m: 0, speed_mps: 3, cadence_spm: 160, rel_alt_m: 0 }),
    sample({ seq: 1, t_s: 300, dist_m: 1000, speed_mps: 3.2, cadence_spm: 165, rel_alt_m: 2 }),
  ];
  const result = analyzeRun({ samples, events: [], segments: [], targets: [] });
  assert.equal(result.elapsedTimeS, 300);
  assert.equal(result.splits.length, 1);
  assert.ok(result.maxSpeedMps >= 3);
  assert.ok(Array.isArray(result.paceSeries));
});
