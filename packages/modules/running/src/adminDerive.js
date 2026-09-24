/**
 * Pure helpers for the running admin API: where a run came from and whether
 * it looks like test/false data. No I/O.
 */

/** A run shorter than this is almost certainly a test tap, not a workout. */
export const MIN_REAL_DISTANCE_M = 100;
/** Two runs starting within this many seconds of each other are duplicates. */
export const DUPLICATE_WINDOW_S = 60;

/**
 * imported (RunCoach text import) | simulated (browser simulator / marked fake)
 * | native (iPhone RunTracker: samples carry vertical accuracy) | unknown.
 * @param {{imported?: boolean, device?: object|null, sampleCount?: number, nativeSampleCount?: number}} run
 * @returns {'imported'|'simulated'|'native'|'unknown'}
 */
export function runSource(run) {
  if (run.imported) return 'imported';
  if (run.device && (run.device.simulated === true || run.device.source === 'simulator')) return 'simulated';
  if (Number(run.sampleCount || 0) > 0) {
    // CoreLocation always reports verticalAccuracy; the web simulator never sets it.
    return Number(run.nativeSampleCount || 0) > 0 ? 'native' : 'simulated';
  }
  return 'unknown';
}

/**
 * Reasons a run looks like test/false data. Empty array = looks real.
 * @param {{source: string, sampleCount?: number, distanceM?: number|null, duplicateCount?: number}} run
 * @returns {Array<'no_samples'|'simulated'|'too_short'|'duplicate_time'>}
 */
export function suspectFlags(run) {
  const flags = [];
  if (!Number(run.sampleCount || 0)) flags.push('no_samples');
  if (run.source === 'simulated') flags.push('simulated');
  if (run.distanceM == null || Number(run.distanceM) < MIN_REAL_DISTANCE_M) flags.push('too_short');
  if (Number(run.duplicateCount || 0) > 0) flags.push('duplicate_time');
  return flags;
}

/** Add `source` + `suspect` to a run list row. */
export function decorateRun(run) {
  const source = runSource(run);
  return { ...run, source, suspect: suspectFlags({ ...run, source }) };
}
