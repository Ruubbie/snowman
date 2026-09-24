/**
 * Parser for the old iPhone app's "training summary" text export, plus a
 * structured JSON alternative. Pure function of its input text/object.
 */
import { parseClock, zonedTimeToUtc } from '@snowman/shared';

const EN_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const NL_MONTHS = { jan: 1, feb: 2, mrt: 3, apr: 4, mei: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12 };
const EN_DAYS = { sunday: 1, monday: 2, tuesday: 3, wednesday: 4, thursday: 5, friday: 6, saturday: 7 };
const NL_DAYS = { zondag: 1, maandag: 2, dinsdag: 3, woensdag: 4, donderdag: 5, vrijdag: 6, zaterdag: 7 };

// en-US month-first with AM/PM, e.g. "Sep 23, 2026 at 6:40 PM"
const US_DATETIME_RE = /^([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i;
// day-first 24h, en-GB ("at") or Dutch ("om"), e.g. "23 Sep 2026 at 23:35" / "23 sep 2026 om 18:40"
const DAY_FIRST_DATETIME_RE = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\s+(?:at|om)\s+(\d{1,2}):(\d{2})$/i;
const US_DATE_RE = /^([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})$/;
const DAY_FIRST_DATE_RE = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/;
const PROGRAM_RE =
  /^Program:\s*week\s+(\d+)\s+of\s+(\d+)\s*\(started\s+(.+?)\)\.\s*Rest day:\s*([A-Za-z]+)\.\s*Reminders at\s*(\d{1,2}):(\d{2})\.?$/i;
// Boilerplate section lines from the RunCoach export that never carry run
// data - dropped instead of landing in `unparsed`.
const NOISE_LINE_RE = /^(Streak:|This week:|Next \d+ days:?$|Recent sessions)/i;
const FORECAST_BULLET_RE =
  /^-?\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag):/i;

function monthNumber(name) {
  const key = name.slice(0, 3).toLowerCase();
  return EN_MONTHS[key] ?? NL_MONTHS[key] ?? null;
}

function dayNumber(name) {
  const key = name.toLowerCase();
  return EN_DAYS[key] ?? NL_DAYS[key] ?? null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** @returns {{year:number,month:number,day:number,hour:number,minute:number}|null} */
function parseDateTimeParts(str) {
  const trimmed = str.trim();
  let m = US_DATETIME_RE.exec(trimmed);
  if (m) {
    const [, monthName, day, year, hh, mm, ampm] = m;
    const month = monthNumber(monthName);
    if (!month) return null;
    let hour = Number(hh) % 12;
    if (/pm/i.test(ampm)) hour += 12;
    return { year: Number(year), month, day: Number(day), hour, minute: Number(mm) };
  }
  m = DAY_FIRST_DATETIME_RE.exec(trimmed);
  if (m) {
    const [, day, monthName, year, hh, mm] = m;
    const month = monthNumber(monthName);
    if (!month) return null;
    return { year: Number(year), month, day: Number(day), hour: Number(hh), minute: Number(mm) };
  }
  return null;
}

/** @returns {{year:number,month:number,day:number}|null} */
function parseDateOnlyParts(str) {
  const trimmed = str.trim();
  let m = US_DATE_RE.exec(trimmed);
  if (m) {
    const month = monthNumber(m[1]);
    if (!month) return null;
    return { year: Number(m[3]), month, day: Number(m[2]) };
  }
  m = DAY_FIRST_DATE_RE.exec(trimmed);
  if (m) {
    const month = monthNumber(m[2]);
    if (!month) return null;
    return { year: Number(m[3]), month, day: Number(m[1]) };
  }
  return null;
}

/**
 * @param {string} line a single run line, "-" prefix already stripped
 * @param {string} tzName
 * @returns {object|null}
 */
function parseRunLine(line, tzName) {
  const parts = line.split('|').map((p) => p.trim());
  const dtParts = parseDateTimeParts(parts[0]);
  if (!dtParts) return null;

  const result = {
    startedAt: zonedTimeToUtc(dtParts, tzName).toISOString(),
    title: null,
    distance_m: null,
    duration_s: null,
    avg_pace_s_per_km: null,
    splits_s: null,
    effort: null,
    note: null,
    completed_plan: null,
  };

  for (const part of parts.slice(1)) {
    let m;
    if ((m = /^([\d.]+)\s*km\s+in\s+([\d:]+)$/i.exec(part))) {
      result.distance_m = Math.round(Number(m[1]) * 1000);
      result.duration_s = parseClock(m[2]);
      continue;
    }
    if ((m = /^avg\s+(.+)\/km$/i.exec(part))) {
      const paceStr = m[1].trim();
      result.avg_pace_s_per_km = /^\d{1,2}:\d{2}$/.test(paceStr) ? parseClock(paceStr) : null;
      continue;
    }
    if ((m = /^plan completed:\s*(yes|no)$/i.exec(part))) {
      result.completed_plan = /yes/i.test(m[1]);
      continue;
    }
    if ((m = /^splits:\s*(.+)$/i.exec(part))) {
      result.splits_s = m[1]
        .split(',')
        .map((s) => parseClock(s.trim()))
        .filter((n) => n !== null);
      continue;
    }
    if ((m = /^effort\s+(\d+)\s*\/\s*10$/i.exec(part))) {
      result.effort = Number(m[1]);
      continue;
    }
    if ((m = /^note:\s*(.*)$/i.exec(part))) {
      result.note = m[1].trim() || null;
      continue;
    }
    if (result.title === null) result.title = part;
  }

  if (result.distance_m === null || result.duration_s === null) return null;
  return result;
}

/**
 * Parse the old app's plain-text training summary export.
 * @param {string} text
 * @param {{tzName?: string}} [opts]
 * @returns {{settings: object, runs: object[], unparsed: string[]}}
 */
export function parseImportText(text, opts = {}) {
  const tzName = opts.tzName || 'UTC';
  const lines = (text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const settings = {};
  const runs = [];
  const unparsed = [];
  let sawTitleLine = false;

  for (const line of lines) {
    const programMatch = PROGRAM_RE.exec(line);
    if (programMatch) {
      const [, week, ofWeeks, startedStr, restDayName, hh, mm] = programMatch;
      const startParts = parseDateOnlyParts(startedStr.trim());
      const restWeekday = dayNumber(restDayName);
      if (startParts && restWeekday) {
        settings.programStart = `${startParts.year}-${pad2(startParts.month)}-${pad2(startParts.day)}`;
        settings.restWeekday = restWeekday;
        settings.reminderHour = Number(hh);
        settings.programWeek = Number(week);
        settings.programWeeks = Number(ofWeeks);
        void mm;
        continue;
      }
    }

    if (!sawTitleLine && !line.includes('|') && !line.startsWith('-')) {
      sawTitleLine = true; // e.g. "run. summary, Sep 24, 2026 at 6:10 PM"
      continue;
    }

    if (NOISE_LINE_RE.test(line) || FORECAST_BULLET_RE.test(line)) continue;

    const runLine = line.startsWith('-') ? line.slice(1).trim() : line;
    if (runLine.includes('|')) {
      const parsed = parseRunLine(runLine, tzName);
      if (parsed) {
        runs.push(parsed);
        continue;
      }
    }
    unparsed.push(line);
  }

  return { settings, runs, unparsed };
}

/**
 * Accept either the plain-text export or the structured JSON alternative
 * `{settings?, runs: [{startedAt, title, distance_m, duration_s, splits_s, effort, note}]}`.
 * @param {string|object} input
 * @param {{tzName?: string}} [opts]
 * @returns {{settings: object, runs: object[], unparsed: string[]}}
 */
export function parseImportInput(input, opts = {}) {
  if (typeof input === 'string') return parseImportText(input, opts);
  if (input && Array.isArray(input.runs)) {
    const runs = input.runs.map((r) => ({
      startedAt: r.startedAt,
      title: r.title ?? null,
      distance_m: r.distance_m ?? null,
      duration_s: r.duration_s ?? null,
      avg_pace_s_per_km: r.avg_pace_s_per_km ?? null,
      splits_s: r.splits_s ?? null,
      effort: r.effort ?? null,
      note: r.note ?? null,
      completed_plan: r.completed_plan ?? null,
    }));
    return { settings: input.settings ?? {}, runs, unparsed: [] };
  }
  return { settings: {}, runs: [], unparsed: [] };
}
