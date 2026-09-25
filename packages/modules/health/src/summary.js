/** Sleep stages that count as asleep (in_bed and awake don't). */
const ASLEEP = new Set(['sleep_asleep', 'sleep_core', 'sleep_deep', 'sleep_rem']);

const round = (v, digits = 1) => (v == null ? null : Math.round(v * 10 ** digits) / 10 ** digits);

/**
 * Per-day rows {date, type, sum, avg} -> one object per day, newest first.
 * @param {{date: string, type: string, sum: number, avg: number}[]} rows
 */
export function summarizeDays(rows) {
  const days = new Map();
  for (const r of rows) {
    const day = days.get(r.date) || { date: r.date, sleep_min: null, resting_hr: null, hrv_ms: null, vo2max: null, body_mass_kg: null };
    if (ASLEEP.has(r.type)) day.sleep_min = Math.round((day.sleep_min || 0) + Number(r.sum));
    else if (r.type === 'resting_hr') day.resting_hr = round(Number(r.avg));
    else if (r.type === 'hrv') day.hrv_ms = round(Number(r.avg));
    else if (r.type === 'vo2max') day.vo2max = round(Number(r.avg));
    else if (r.type === 'body_mass') day.body_mass_kg = round(Number(r.avg));
    days.set(r.date, day);
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}
