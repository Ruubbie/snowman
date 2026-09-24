/**
 * Starter run/walk program: 8 weeks to 30 minutes nonstop, ported from the
 * old Swift app. Pure functions only - no DB, no clock reads other than the
 * `date` argument, easy to unit test.
 */

/** [runMinutes, walkMinutes, reps] per program week (1-indexed). Week 8+ repeats. */
const WEEK_INTERVALS = [
  [4, 1, 4], // week 1
  [5, 1, 4], // week 2
  [7, 1, 3], // week 3
  [8, 1, 3], // week 4
  [10, 1, 3], // week 5
  [13, 1, 2], // week 6
  [15, 1, 2], // week 7
  [30, 0, 1], // week 8+ (maintenance)
];

const WARMUP_S = 5 * 60;
const COOLDOWN_S = 5 * 60;
const EASY_RUN_CONTINUOUS_S = 20 * 60;
const RECOVERY_WALK_S = 25 * 60;

/**
 * @typedef {Object} RunningSettings
 * @property {string} programStart YYYY-MM-DD
 * @property {number} restWeekday 1=Sunday..7=Saturday
 * @property {number} [reminderHour]
 */

/**
 * @typedef {Object} Segment
 * @property {'warmup'|'run'|'walk'|'cooldown'} kind
 * @property {number} seconds
 */

/**
 * @typedef {Object} Workout
 * @property {'run'|'walk'|'rest'} kind
 * @property {string} title
 * @property {string} summary
 * @property {Segment[]} segments
 * @property {number} programWeek
 */

/**
 * @param {number} week 1-indexed program week
 * @returns {[number, number, number]} [runMin, walkMin, reps]
 */
function intervalsForWeek(week) {
  const idx = Math.min(Math.max(week, 1), WEEK_INTERVALS.length) - 1;
  return WEEK_INTERVALS[idx];
}

/**
 * @param {number} runMin
 * @param {number} walkMin
 * @param {number} reps
 * @returns {Segment[]}
 */
function buildRunSegments(runMin, walkMin, reps) {
  const segments = [{ kind: 'warmup', seconds: WARMUP_S }];
  for (let i = 1; i <= reps; i++) {
    segments.push({ kind: 'run', seconds: runMin * 60 });
    if (i < reps && walkMin > 0) segments.push({ kind: 'walk', seconds: walkMin * 60 });
  }
  segments.push({ kind: 'cooldown', seconds: COOLDOWN_S });
  return segments;
}

/**
 * @param {number} restWeekday 1=Sunday..7=Saturday
 * @returns {number} 0=Sunday..6=Saturday (JS Date.getDay convention)
 */
function restWeekdayToJsDay(restWeekday) {
  return restWeekday - 1;
}

/**
 * Day-of-week (0=Sun..6=Sat) for a YYYY-MM-DD string, pure calendar math.
 * @param {string} dateStr
 * @returns {number}
 */
function jsDayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Whole-day difference (a - b) between two YYYY-MM-DD strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function diffDays(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

/**
 * Compute the program-prescribed workout for a given local date.
 * @param {string} date YYYY-MM-DD
 * @param {RunningSettings} settings
 * @returns {Workout}
 */
export function workoutFor(date, settings) {
  const restWeekday = settings.restWeekday ?? 1;
  const daysSinceStart = diffDays(date, settings.programStart);
  const programWeek = Math.max(1, Math.floor(daysSinceStart / 7) + 1);
  const [runMin, walkMin, reps] = intervalsForWeek(programWeek);
  const isContinuous = walkMin === 0;

  const restJsDay = restWeekdayToJsDay(restWeekday);
  const dow = jsDayOfWeek(date);
  const position = (dow - restJsDay + 7) % 7;

  const runPositions = programWeek <= 4 ? [1, 3, 5] : [1, 3, 5, 6];

  if (position === 0) {
    return {
      kind: 'rest',
      title: 'Rest day',
      summary: 'Rest day - no scheduled activity.',
      segments: [],
      programWeek,
    };
  }

  if (runPositions.includes(position)) {
    if (position === 6) {
      // Short "easy run": one fewer rep (min 1), or 20 min continuous when
      // the week's pattern is already continuous (no walk breaks).
      if (isContinuous) {
        const segments = [
          { kind: 'warmup', seconds: WARMUP_S },
          { kind: 'run', seconds: EASY_RUN_CONTINUOUS_S },
          { kind: 'cooldown', seconds: COOLDOWN_S },
        ];
        return {
          kind: 'run',
          title: `Week ${programWeek} · Easy run`,
          summary: '20 min continuous easy run.',
          segments,
          programWeek,
        };
      }
      const shortReps = Math.max(reps - 1, 1);
      return {
        kind: 'run',
        title: `Week ${programWeek} · Easy run`,
        summary: `${shortReps}x ${runMin} min run / ${walkMin} min walk.`,
        segments: buildRunSegments(runMin, walkMin, shortReps),
        programWeek,
      };
    }
    return {
      kind: 'run',
      title: `Week ${programWeek} · Run`,
      summary: isContinuous
        ? `${runMin} min continuous run.`
        : `${reps}x ${runMin} min run / ${walkMin} min walk.`,
      segments: buildRunSegments(runMin, walkMin, reps),
      programWeek,
    };
  }

  return {
    kind: 'walk',
    title: 'Recovery walk',
    summary: '25 min brisk recovery walk.',
    segments: [{ kind: 'walk', seconds: RECOVERY_WALK_S }],
    programWeek,
  };
}

export { WEEK_INTERVALS };
