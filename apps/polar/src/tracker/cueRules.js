/**
 * Pure (no network/audio I/O) cue-trigger engine shared by the web run
 * simulator. Feed it 1Hz snapshots; it decides WHEN each cue trigger
 * should fire and applies the telemetry contract's dedupe/throttle rules.
 * It does not call Olaf or speak anything - the caller does that and
 * reports back via recordSpoken()/recordFallbackUsed() so throttling stays
 * accurate whether a live Olaf line or a fallback line was actually used.
 *
 * The Swift side ports these same rules for the native tracker.
 */

export const PACE_OUT_OF_RANGE_S = 20;
export const MIN_PACE_CUE_GAP_S = 60;
export const SEGMENT_LOOKAHEAD_S = 15;
export const CHECKIN_GAP_S = 4 * 60;
export const GPS_LOST_S = 15;
export const FALLBACK_COOLDOWN_S = 3 * 60;
export const SLOWING_THRESHOLD_S_PER_KM = 30;

/** @param {{segments: {kind: string, seconds: number}[], totalPlannedS?: number}} opts */
export function createCueEngine({ segments = [], totalPlannedS } = {}) {
  const segmentStarts = [];
  let acc = 0;
  for (const seg of segments) {
    segmentStarts.push(acc);
    acc += seg.seconds || 0;
  }
  const planned = totalPlannedS ?? acc;

  const state = {
    started: false,
    lastAnyCueAt: 0,
    lastPaceCueAt: -Infinity,
    outOfRangeSince: null,
    outOfRangeDirection: null,
    announcedKm: 0,
    halfwayAnnounced: false,
    finishAnnounced: false,
    gpsLostSince: null,
    gpsLostAnnounced: false,
    requestedUpcoming: new Set(),
    spokenUpcoming: new Set(),
    slowingAnnouncedForSplit: new Set(),
    fallbackUsedAt: Object.create(null), // trigger -> t_s
    recentCues: [], // most-recent-first, max 3: {trigger, text}
    kmSplitPaces: [],
  };

  function currentSegmentIndex(elapsedS) {
    for (let i = segmentStarts.length - 1; i >= 0; i--) {
      if (elapsedS >= segmentStarts[i]) return i;
    }
    return 0;
  }

  /**
   * @param {{t_s: number, distance_m?: number, pace_30s?: number, target?: {min?: number, max?: number}, paused?: boolean, justResumed?: boolean, gpsAccepted?: boolean}} snap
   * @returns {{trigger: string, critical?: boolean, data?: object}[]} triggers firing this tick, priority order
   */
  function tick(snap) {
    const out = [];
    const t = snap.t_s;
    const push = (trigger, extra = {}) => out.push({ trigger, critical: false, ...extra });

    if (!state.started) {
      state.started = true;
      push('start', { critical: true });
    }

    if (snap.paused) {
      push('paused', { critical: true });
      if (out.length) state.lastAnyCueAt = t;
      return out; // no other cues while paused
    }
    if (snap.justResumed) push('resumed', { critical: true });

    // gps_lost / gps_recovered edge
    if (snap.gpsAccepted === false) {
      if (state.gpsLostSince == null) state.gpsLostSince = t;
      if (!state.gpsLostAnnounced && t - state.gpsLostSince >= GPS_LOST_S) {
        state.gpsLostAnnounced = true;
        push('gps_lost', {});
      }
    } else {
      state.gpsLostSince = null;
      state.gpsLostAnnounced = false;
    }

    const segIndex = currentSegmentIndex(t);
    const seg = segments[segIndex];
    const isRunSegment = seg?.kind === 'run';

    // too_fast / too_slow - sustained >=20s out of the brief's target band
    if (isRunSegment && snap.target && snap.pace_30s != null) {
      const { min, max } = snap.target;
      let direction = null;
      if (min != null && snap.pace_30s < min) direction = 'too_fast';
      else if (max != null && snap.pace_30s > max) direction = 'too_slow';

      if (direction) {
        if (state.outOfRangeDirection !== direction) {
          state.outOfRangeSince = t;
          state.outOfRangeDirection = direction;
        } else if (
          t - state.outOfRangeSince >= PACE_OUT_OF_RANGE_S &&
          t - state.lastPaceCueAt >= MIN_PACE_CUE_GAP_S
        ) {
          state.lastPaceCueAt = t;
          push(direction, {});
        }
      } else {
        state.outOfRangeSince = null;
        state.outOfRangeDirection = null;
      }
    }

    // segment_upcoming: request Olaf 15s before a switch, ALWAYS speak at the switch
    for (let i = segIndex; i < segments.length; i++) {
      if (i === 0) continue;
      const switchAt = segmentStarts[i];
      const untilSwitch = switchAt - t;
      if (untilSwitch <= SEGMENT_LOOKAHEAD_S && untilSwitch > 0 && !state.requestedUpcoming.has(i)) {
        state.requestedUpcoming.add(i);
        push('segment_upcoming', { segmentIndex: i, phase: 'request' });
      }
      if (t >= switchAt && !state.spokenUpcoming.has(i)) {
        state.spokenUpcoming.add(i);
        push('segment_upcoming', { segmentIndex: i, phase: 'switch', critical: true });
      }
      if (untilSwitch > SEGMENT_LOOKAHEAD_S) break;
    }

    // km_split
    if (snap.distance_m != null) {
      const km = Math.floor(snap.distance_m / 1000);
      if (km > state.announcedKm) {
        state.announcedKm = km;
        push('km_split', { km });
      }
    }

    // halfway
    if (!state.halfwayAnnounced && planned > 0 && t >= planned / 2) {
      state.halfwayAnnounced = true;
      push('halfway', {});
    }

    // slowing: last recorded km split >30s/km slower than the previous one
    if (isRunSegment) {
      const n = state.kmSplitPaces.length;
      if (n >= 2 && !state.slowingAnnouncedForSplit.has(n - 1)) {
        const last = state.kmSplitPaces[n - 1];
        const prev = state.kmSplitPaces[n - 2];
        if (last - prev > SLOWING_THRESHOLD_S_PER_KM) {
          state.slowingAnnouncedForSplit.add(n - 1);
          push('slowing', {});
        }
      }
    }

    // checkin: nothing else fired and it's been >=4min since any cue
    if (out.length === 0 && t - state.lastAnyCueAt >= CHECKIN_GAP_S) {
      push('checkin', {});
    }

    // finish
    if (!state.finishAnnounced && planned > 0 && t >= planned) {
      state.finishAnnounced = true;
      push('finish', { critical: true });
    }

    if (out.length) state.lastAnyCueAt = t;
    return out;
  }

  /** Record a completed km split's pace (s/km) so `slowing` can compare it to the previous one. */
  function recordKmSplitPace(paceSPerKm) {
    state.kmSplitPaces.push(paceSPerKm);
  }

  /** @returns {boolean} whether trigger's fallback line may be used now (>=3min since last use of THIS trigger's fallback). */
  function canUseFallback(trigger, t) {
    const last = state.fallbackUsedAt[trigger];
    return last == null || t - last >= FALLBACK_COOLDOWN_S;
  }

  function recordFallbackUsed(trigger, t) {
    state.fallbackUsedAt[trigger] = t;
  }

  function recordSpoken(trigger, text) {
    if (!text) return;
    state.recentCues.unshift({ trigger, text });
    state.recentCues.length = Math.min(state.recentCues.length, 3);
  }

  function getRecentCues() {
    return state.recentCues.slice();
  }

  return { tick, recordKmSplitPace, canUseFallback, recordFallbackUsed, recordSpoken, getRecentCues, state };
}

export default { createCueEngine };
