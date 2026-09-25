/** Sleep stages that count as asleep (in_bed and awake don't). */
const ASLEEP = new Set(['sleep_asleep', 'sleep_core', 'sleep_deep', 'sleep_rem']);
/** Types that add up over a day; every other type is averaged (daily totals arrive as one row a day). */
const SUMMED = new Set(['mindful_min']);
/** Field names the desktop and Olaf already use. */
const RENAMED = { hrv: 'hrv_ms', body_mass: 'body_mass_kg' };

const round = (v, digits = 1) => (v == null ? null : Math.round(v * 10 ** digits) / 10 ** digits);

/**
 * Per-day rows {date, type, sum, avg} -> one object per day, newest first,
 * with a field per type that has data that day (plus sleep_min).
 * @param {{date: string, type: string, sum: number, avg: number}[]} rows
 */
export function summarizeDays(rows) {
  const days = new Map();
  for (const r of rows) {
    const day = days.get(r.date) || { date: r.date, sleep_min: null };
    if (ASLEEP.has(r.type)) day.sleep_min = Math.round((day.sleep_min || 0) + Number(r.sum));
    else if (!r.type.startsWith('sleep_')) day[RENAMED[r.type] || r.type] = round(Number(SUMMED.has(r.type) ? r.sum : r.avg));
    days.set(r.date, day);
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}
