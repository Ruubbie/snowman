/**
 * Timezone helpers. No dependency - built on Intl, which ships with Node.
 * Snowman stores timestamps as UTC and computes plan/local dates with these.
 */

/**
 * Format a Date as a local YYYY-MM-DD string in the given IANA timezone.
 * @param {Date} date
 * @param {string} tzName
 * @returns {string}
 */
export function localDateString(date, tzName) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tzName,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date); // en-CA gives YYYY-MM-DD
}

/**
 * Get the UTC offset (in ms, UTC - local) of a timezone at a given instant.
 * @param {Date} date
 * @param {string} tzName
 * @returns {number}
 */
function tzOffsetMs(date, tzName) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tzName,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = fmt.formatToParts(date).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/**
 * Convert a local wall-clock date/time in a given IANA timezone to a UTC Date.
 * @param {{year:number, month:number, day:number, hour?:number, minute?:number, second?:number}} parts month is 1-indexed
 * @param {string} tzName
 * @returns {Date}
 */
export function zonedTimeToUtc(parts, tzName) {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = parts;
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 2; i++) {
    const offset = tzOffsetMs(new Date(guess), tzName);
    guess = Date.UTC(year, month - 1, day, hour, minute, second) - offset;
  }
  return new Date(guess);
}

/**
 * Add N days to a YYYY-MM-DD date string, returning a new YYYY-MM-DD string
 * (pure calendar arithmetic, no timezone involved).
 * @param {string} dateStr
 * @param {number} days
 * @returns {string}
 */
export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Whole-day difference (a - b) between two YYYY-MM-DD date strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function diffDays(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ua = Date.UTC(ay, am - 1, ad);
  const ub = Date.UTC(by, bm - 1, bd);
  return Math.round((ua - ub) / 86400000);
}

/**
 * Day of week (0=Sunday..6=Saturday) for a YYYY-MM-DD date string, computed
 * as a pure calendar value (no timezone involved).
 * @param {string} dateStr
 * @returns {number}
 */
export function dayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
