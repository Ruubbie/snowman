/**
 * Pace / duration formatting helpers shared across modules.
 */

/**
 * Format a duration in seconds as M:SS or H:MM:SS.
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * Format a pace given as seconds-per-km as M:SS/km.
 * @param {number|null|undefined} secPerKm
 * @returns {string}
 */
export function formatPace(secPerKm) {
  if (secPerKm === null || secPerKm === undefined || !Number.isFinite(secPerKm)) {
    return '–:––/km';
  }
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

/**
 * Parse an M:SS or H:MM:SS clock string into whole seconds.
 * @param {string} clock
 * @returns {number|null}
 */
export function parseClock(clock) {
  if (typeof clock !== 'string') return null;
  const trimmed = clock.trim();
  const parts = trimmed.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  return null;
}
