/**
 * Guardrails applied to every plan change before it is written. Pure
 * function: callers (planner.js) gather the context from the DB, this file
 * only reasons about dates/kinds/minutes.
 */

/**
 * @typedef {Object} PlanSession
 * @property {string} date YYYY-MM-DD
 * @property {'run'|'walk'|'rest'} kind
 * @property {{kind:string, seconds:number}[]} [segments]
 */

/**
 * @typedef {Object} RulesContext
 * @property {string} today YYYY-MM-DD - proposed dates before this are rejected
 * @property {PlanSession[]} existingSessions sessions already on the calendar (overridden by proposedSessions on the same date)
 * @property {number} [previousWeekRunMinutes] total run minutes in the 7 days before the earliest proposed date
 * @property {boolean} [isStarterProgram] true when the change is the starter program's own materialization (exempt from the weekly-increase cap)
 */

/**
 * @typedef {Object} Violation
 * @property {string} code
 * @property {string} message
 */

function addDaysUtc(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function diffDaysUtc(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

function runMinutesOf(session) {
  if (!session?.segments) return 0;
  return session.segments.filter((s) => s.kind === 'run').reduce((sum, s) => sum + s.seconds, 0) / 60;
}

/**
 * @param {PlanSession[]} proposedSessions
 * @param {RulesContext} context
 * @returns {{ok: boolean, violations: Violation[]}}
 */
export function validateChange(proposedSessions, context) {
  const violations = [];
  const today = context.today;

  // 1. Max one session per day within the proposed batch itself.
  const seenDates = new Map();
  for (const s of proposedSessions) {
    seenDates.set(s.date, (seenDates.get(s.date) || 0) + 1);
  }
  for (const [date, count] of seenDates) {
    if (count > 1) {
      violations.push({ code: 'max_one_per_day', message: `More than one session proposed for ${date}` });
    }
  }

  // 2. No moving into the past.
  for (const s of proposedSessions) {
    if (s.date < today) {
      violations.push({ code: 'no_past_dates', message: `Cannot schedule a session in the past: ${s.date}` });
    }
  }

  // Merge existing + proposed (proposed wins on same date) for the
  // structural checks below.
  const combined = new Map();
  for (const s of context.existingSessions || []) combined.set(s.date, s);
  for (const s of proposedSessions) combined.set(s.date, s);
  const sortedDates = [...combined.keys()].sort();

  // 3. At least one rest day in any fully-known 7-consecutive-day window.
  for (const startDate of sortedDates) {
    const windowDates = Array.from({ length: 7 }, (_, i) => addDaysUtc(startDate, i));
    if (!windowDates.every((d) => combined.has(d))) continue;
    const hasRest = windowDates.some((d) => combined.get(d).kind === 'rest');
    if (!hasRest) {
      violations.push({
        code: 'min_one_rest_day_per_week',
        message: `No rest day in the 7-day window starting ${startDate}`,
      });
    }
  }

  // 4. No more than 2 consecutive run days.
  let streak = 0;
  let prevDate = null;
  for (const date of sortedDates) {
    const isRun = combined.get(date).kind === 'run';
    const consecutive = prevDate !== null && diffDaysUtc(date, prevDate) === 1;
    streak = isRun ? (consecutive ? streak + 1 : 1) : 0;
    if (streak > 2) {
      violations.push({ code: 'max_two_consecutive_run_days', message: `More than 2 consecutive run days ending ${date}` });
    }
    prevDate = date;
  }

  // 5. Weekly run-minute increase cap (skipped for the starter program itself).
  if (!context.isStarterProgram && proposedSessions.length > 0 && typeof context.previousWeekRunMinutes === 'number') {
    const earliest = proposedSessions.map((s) => s.date).sort()[0];
    const windowDates = new Set(Array.from({ length: 7 }, (_, i) => addDaysUtc(earliest, i)));
    let thisWeekMinutes = 0;
    for (const [date, session] of combined) {
      if (windowDates.has(date)) thisWeekMinutes += runMinutesOf(session);
    }
    const cap = context.previousWeekRunMinutes * 1.1;
    if (thisWeekMinutes > cap) {
      violations.push({
        code: 'weekly_run_increase_cap',
        message: `Weekly run minutes (${thisWeekMinutes}) exceed the 10% increase cap over last week (${context.previousWeekRunMinutes})`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}
