/**
 * The `runs` table has no link back to its planned session's `kind` (easy /
 * tempo / long / intervals) — only pace/distance/duration. Until the
 * backend joins that in, we infer a display label from the numbers
 * themselves so History's filter tags and Today's "Last run" badge have
 * something meaningful to show. Purely cosmetic — never sent anywhere.
 * @param {{distanceM?: number, avgPaceSPerKm?: number}} run
 * @returns {{label: string, tone: 'accent'|'info'|'neutral'}}
 */
export function inferRunKind(run) {
  if (!run) return { label: 'Run', tone: 'neutral' };
  const km = (run.distanceM || 0) / 1000;
  const pace = run.avgPaceSPerKm;
  if (km >= 12) return { label: 'Long', tone: 'neutral' };
  if (pace != null && pace <= 300) return { label: 'Tempo', tone: 'accent' };
  return { label: 'Easy', tone: 'info' };
}

export default { inferRunKind };
