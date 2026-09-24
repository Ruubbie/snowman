import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCueEngine } from './cueRules.js';

const SEGMENTS = [
  { kind: 'warmup', seconds: 300 },
  { kind: 'run', seconds: 120 },
  { kind: 'walk', seconds: 60 },
  { kind: 'run', seconds: 120 },
];

function triggersOf(fired) {
  return fired.map((f) => f.trigger);
}

test('fires "start" exactly once, on the first tick', () => {
  const engine = createCueEngine({ segments: SEGMENTS });
  const first = engine.tick({ t_s: 0 });
  assert.ok(triggersOf(first).includes('start'));
  const second = engine.tick({ t_s: 1 });
  assert.ok(!triggersOf(second).includes('start'));
});

test('too_fast fires after >=20s continuously out of range, then throttles for 60s', () => {
  const engine = createCueEngine({ segments: SEGMENTS });
  engine.tick({ t_s: 0 });
  const target = { min: 300, max: 360 }; // s/km
  let fired = [];
  for (let t = 300; t <= 340; t++) {
    fired = fired.concat(engine.tick({ t_s: t, pace_30s: 250, target })); // faster than min -> too_fast
  }
  const tooFast = fired.filter((f) => f.trigger === 'too_fast');
  assert.equal(tooFast.length, 1, 'fires exactly once after the 20s sustain window');

  // still out of range but within the 60s cooldown - must not fire again
  const soon = engine.tick({ t_s: 341, pace_30s: 250, target });
  assert.ok(!triggersOf(soon).includes('too_fast'));
});

test('pace back in range resets the out-of-range timer', () => {
  const engine = createCueEngine({ segments: SEGMENTS });
  engine.tick({ t_s: 0 });
  const target = { min: 300, max: 360 };
  for (let t = 300; t < 315; t++) engine.tick({ t_s: t, pace_30s: 250, target });
  // back in range briefly
  engine.tick({ t_s: 315, pace_30s: 330, target });
  let fired = [];
  for (let t = 316; t <= 335; t++) {
    fired = fired.concat(engine.tick({ t_s: t, pace_30s: 250, target }));
  }
  assert.ok(!triggersOf(fired).includes('too_fast'), 'timer restarted, 20s not yet elapsed again');
});

test('segment_upcoming requests 15s before a switch and always speaks at the switch (critical)', () => {
  const engine = createCueEngine({ segments: SEGMENTS });
  engine.tick({ t_s: 0 });
  // segment 1 (run) starts at t=300
  const requestTick = engine.tick({ t_s: 285 });
  const req = requestTick.find((f) => f.trigger === 'segment_upcoming' && f.phase === 'request');
  assert.ok(req, 'requests ahead of the switch');
  assert.equal(req.segmentIndex, 1);

  for (let t = 286; t < 300; t++) engine.tick({ t_s: t });
  const switchTick = engine.tick({ t_s: 300 });
  const sw = switchTick.find((f) => f.trigger === 'segment_upcoming' && f.phase === 'switch');
  assert.ok(sw, 'always announces the switch');
  assert.equal(sw.critical, true);
});

test('km_split fires once per completed kilometer', () => {
  const engine = createCueEngine({ segments: SEGMENTS });
  engine.tick({ t_s: 0, distance_m: 0 });
  let fired = engine.tick({ t_s: 1, distance_m: 999 });
  assert.ok(!triggersOf(fired).includes('km_split'));
  fired = engine.tick({ t_s: 2, distance_m: 1000 });
  assert.ok(triggersOf(fired).includes('km_split'));
  fired = engine.tick({ t_s: 3, distance_m: 1500 });
  assert.ok(!triggersOf(fired).includes('km_split'));
  fired = engine.tick({ t_s: 4, distance_m: 2000 });
  assert.ok(triggersOf(fired).includes('km_split'));
});

test('halfway fires once at half the planned total', () => {
  const total = SEGMENTS.reduce((s, seg) => s + seg.seconds, 0); // 600
  const engine = createCueEngine({ segments: SEGMENTS, totalPlannedS: total });
  let fired = [];
  for (let t = 0; t <= 300; t++) fired = fired.concat(engine.tick({ t_s: t }));
  const halfways = fired.filter((f) => f.trigger === 'halfway');
  assert.equal(halfways.length, 1);
});

test('finish fires once elapsed reaches the planned total', () => {
  const total = SEGMENTS.reduce((s, seg) => s + seg.seconds, 0);
  const engine = createCueEngine({ segments: SEGMENTS, totalPlannedS: total });
  for (let t = 0; t < total; t++) engine.tick({ t_s: t });
  const fired = engine.tick({ t_s: total });
  assert.ok(triggersOf(fired).includes('finish'));
});

test('slowing fires when the latest km split is >30s/km slower than the previous', () => {
  const engine = createCueEngine({ segments: SEGMENTS });
  engine.tick({ t_s: 0 });
  engine.recordKmSplitPace(300);
  let fired = engine.tick({ t_s: 305 });
  assert.ok(!triggersOf(fired).includes('slowing'));
  engine.recordKmSplitPace(335); // +35s/km
  fired = engine.tick({ t_s: 306 });
  assert.ok(triggersOf(fired).includes('slowing'));
  // must not repeat for the same split
  fired = engine.tick({ t_s: 307 });
  assert.ok(!triggersOf(fired).includes('slowing'));
});

test('checkin fires after 4 minutes with no other cue', () => {
  const engine = createCueEngine({ segments: [{ kind: 'run', seconds: 100000 }] });
  engine.tick({ t_s: 0 });
  let fired = [];
  for (let t = 1; t < 240; t++) fired = fired.concat(engine.tick({ t_s: t }));
  assert.ok(!triggersOf(fired).includes('checkin'));
  fired = engine.tick({ t_s: 240 });
  assert.ok(triggersOf(fired).includes('checkin'));
});

test('gps_lost fires after 15s without an accepted fix, and resets on recovery', () => {
  const engine = createCueEngine({ segments: SEGMENTS });
  engine.tick({ t_s: 0, gpsAccepted: false }); // loss starts here
  let fired = [];
  for (let t = 1; t <= 14; t++) fired = fired.concat(engine.tick({ t_s: t, gpsAccepted: false }));
  assert.ok(!triggersOf(fired).includes('gps_lost'));
  fired = engine.tick({ t_s: 15, gpsAccepted: false });
  assert.ok(triggersOf(fired).includes('gps_lost'));

  const recovered = engine.tick({ t_s: 16, gpsAccepted: true });
  assert.ok(!triggersOf(recovered).includes('gps_lost'));
});

test('paused suppresses every other cue on that tick, resumed fires once', () => {
  const engine = createCueEngine({ segments: SEGMENTS });
  engine.tick({ t_s: 0 });
  const paused = engine.tick({ t_s: 1, paused: true, distance_m: 1000 });
  assert.deepEqual(triggersOf(paused), ['paused']);
  const resumed = engine.tick({ t_s: 2, justResumed: true });
  assert.ok(triggersOf(resumed).includes('resumed'));
});

test('fallback cooldown: a trigger\'s fallback line may be reused only after 3 minutes', () => {
  const engine = createCueEngine({ segments: SEGMENTS });
  assert.equal(engine.canUseFallback('too_fast', 0), true);
  engine.recordFallbackUsed('too_fast', 0);
  assert.equal(engine.canUseFallback('too_fast', 100), false);
  assert.equal(engine.canUseFallback('too_fast', 180), true);
  // a different trigger is unaffected
  assert.equal(engine.canUseFallback('too_slow', 100), true);
});

test('recentCues keeps only the last 3, most recent first', () => {
  const engine = createCueEngine({ segments: SEGMENTS });
  engine.recordSpoken('start', 'Line 1');
  engine.recordSpoken('km_split', 'Line 2');
  engine.recordSpoken('halfway', 'Line 3');
  engine.recordSpoken('finish', 'Line 4');
  const recent = engine.getRecentCues();
  assert.equal(recent.length, 3);
  assert.equal(recent[0].text, 'Line 4');
  assert.equal(recent[2].text, 'Line 2');
});
