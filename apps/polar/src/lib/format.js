/** Format seconds/km as "5:30/km"; null/undefined -> "--". */
export function formatPace(sPerKm) {
  if (sPerKm == null || !Number.isFinite(sPerKm)) return '--';
  const total = Math.round(sPerKm);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, '0')}/km`;
}

/** Format seconds as "H:MM:SS" or "M:SS". */
export function formatDuration(totalS) {
  if (totalS == null || !Number.isFinite(totalS)) return '--';
  const s = Math.max(0, Math.round(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Format meters as km with 2 decimals, e.g. "5.03 km". */
export function formatDistance(meters) {
  if (meters == null || !Number.isFinite(meters)) return '--';
  return `${(meters / 1000).toFixed(2)} km`;
}

export default { formatPace, formatDuration, formatDistance };
