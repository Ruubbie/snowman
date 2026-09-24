/**
 * Text normalisation for speech. Olaf's lines are written for reading
 * ("5:30/km", "3.2 km", "**nice**", emoji); Kokoro should hear what a coach
 * would say out loud ("five thirty per kilometre"). Pure functions, no deps.
 *
 * Bump NORMALIZER_VERSION whenever the output of normalizeForSpeech changes,
 * so the content-addressed audio cache does not serve old pronunciations.
 */
export const NORMALIZER_VERSION = 1;

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/**
 * Cardinal number in English words (integers up to 999,999,999).
 * @param {number} n
 * @returns {string}
 */
export function numberToWords(n) {
  if (!Number.isFinite(n)) return String(n);
  if (n < 0) return `minus ${numberToWords(-n)}`;
  n = Math.floor(n);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) {
    const rest = n % 100;
    return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` and ${numberToWords(rest)}` : ''}`;
  }
  for (const [size, word] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) {
    if (n >= size) {
      const rest = n % size;
      const head = `${numberToWords(Math.floor(n / size))} ${word}`;
      if (!rest) return head;
      return `${head}${rest < 100 ? ' and ' : ' '}${numberToWords(rest)}`;
    }
  }
  return String(n);
}

/** "3.25" -> "three point two five"; "10" -> "ten". */
export function decimalToWords(str) {
  const [int, frac] = String(str).split('.');
  const head = numberToWords(Number(int || 0));
  if (!frac) return head;
  return `${head} point ${frac.split('').map((d) => ONES[Number(d)]).join(' ')}`;
}

const ORDINAL_EXCEPTIONS = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };

/** 1 -> "first", 21 -> "twenty-first", 40 -> "fortieth". */
export function ordinalToWords(n) {
  const words = numberToWords(n);
  return words.replace(/([a-z]+)$/, (last) => {
    if (ORDINAL_EXCEPTIONS[last]) return ORDINAL_EXCEPTIONS[last];
    if (last.endsWith('y')) return `${last.slice(0, -1)}ieth`;
    return `${last}th`;
  });
}

/**
 * "5", "30" -> "five thirty"; "6", "00" -> "six minutes" (or "six" when bare,
 * e.g. inside a range); "5", "05" -> "five oh five".
 */
function minutesSeconds(min, sec, bare = false) {
  const m = Number(min);
  const s = Number(sec);
  if (s === 0) return bare ? numberToWords(m) : `${numberToWords(m)} ${m === 1 ? 'minute' : 'minutes'}`;
  if (s < 10) return `${numberToWords(m)} oh ${numberToWords(s)}`;
  return `${numberToWords(m)} ${numberToWords(s)}`;
}

function plural(numStr, singular, pluralWord) {
  return Number(numStr) === 1 && !numStr.includes('.') ? singular : pluralWord;
}

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}‍︎️⃣]/gu;

/**
 * Remove markdown and emoji, keeping the words.
 * @param {string} text
 */
export function stripMarkup(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^\w])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/[*_#~]+/g, ' ')
    .replace(EMOJI, ' ');
}

const UNIT_PER = String.raw`\s*(?:\/|per\s+)\s*`;
const KM = String.raw`(?:km|kilomet(?:er|re)s?)\b`;
const MILE = String.raw`(?:mi|miles?)\b`;

/**
 * Turn written Olaf text into something that reads naturally out loud.
 * @param {string} text
 * @returns {string}
 */
export function normalizeForSpeech(text) {
  let s = stripMarkup(text);

  s = s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/(\d),(?=\d{3}\b)/g, '$1');

  // Line breaks (lists, headings) become sentence breaks.
  s = s.replace(/([^\s.!?,;:])[ \t]*(?:\r?\n)+/g, '$1. ');
  // Ranges first (5:30-6:00/km, 2-3 km) so each side is read on its own.
  s = s.replace(/(\d)\s*[-–]\s*(?=\d)/g, '$1 to ');
  s = s.replace(
    new RegExp(String.raw`\b(\d{1,2}):([0-5]\d) to (\d{1,2}):([0-5]\d)(?:\s*(?:min(?:utes)?)?${UNIT_PER}(${KM}|${MILE}))?`, 'gi'),
    (_, m1, s1, m2, s2, unit) =>
      `${minutesSeconds(m1, s1, true)} to ${minutesSeconds(m2, s2, true)}` +
      (unit ? ` per ${/^mi/i.test(unit) ? 'mile' : 'kilometre'}` : ''),
  );
  // Paces: 5:30/km, 5:30 min/km, 5:30 per km, 9:05/mi.
  s = s.replace(new RegExp(String.raw`\b(\d{1,2}):([0-5]\d)\s*(?:min(?:utes)?)?${UNIT_PER}(${KM}|${MILE})`, 'gi'), (_, m, sec, unit) =>
    `${minutesSeconds(m, sec)} per ${/^mi/i.test(unit) ? 'mile' : 'kilometre'}`,
  );
  // Speeds.
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*(?:km\/h|kph|kmh)\b/gi, (_, n) => `${decimalToWords(n)} kilometres per hour`);
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*mph\b/gi, (_, n) => `${decimalToWords(n)} miles per hour`);
  // Durations / clock-like m:ss that are not paces: "2:30 left" -> "two thirty".
  s = s.replace(/\b(\d{1,2}):([0-5]\d)\b/g, (_, m, sec) => minutesSeconds(m, sec));
  // Distances and other units after a number.
  s = s
    .replace(new RegExp(String.raw`\b(\d+(?:\.\d+)?)\s*${KM}`, 'gi'), (_, n) => `${decimalToWords(n)} ${plural(n, 'kilometre', 'kilometres')}`)
    .replace(new RegExp(String.raw`\b(\d+(?:\.\d+)?)\s*${MILE}`, 'gi'), (_, n) => `${decimalToWords(n)} ${plural(n, 'mile', 'miles')}`)
    .replace(/\b(\d+(?:\.\d+)?)\s*m\b(?!\.\w)/g, (_, n) => `${decimalToWords(n)} ${plural(n, 'metre', 'metres')}`)
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:min|mins|minutes?)\b/gi, (_, n) => `${decimalToWords(n)} ${plural(n, 'minute', 'minutes')}`)
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)\b/gi, (_, n) => `${decimalToWords(n)} ${plural(n, 'second', 'seconds')}`)
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b/gi, (_, n) => `${decimalToWords(n)} ${plural(n, 'hour', 'hours')}`)
    .replace(/\b(\d+)\s*bpm\b/gi, (_, n) => `${numberToWords(Number(n))} beats per minute`)
    .replace(/\b(\d+(?:\.\d+)?)\s*%/g, (_, n) => `${decimalToWords(n)} percent`)
    .replace(/\b(\d+)\s*x\b/gi, (_, n) => `${numberToWords(Number(n))} times`)
    .replace(/\/\s*(?:km|kilomet(?:er|re))\b/gi, ' per kilometre');
  // Ordinals, then any remaining numbers.
  s = s.replace(/\b(\d+)(?:st|nd|rd|th)\b/gi, (_, n) => ordinalToWords(Number(n)));
  s = s.replace(/\b\d+(?:\.\d+)?\b/g, (n) => decimalToWords(n));
  s = s.replace(/\bkms\b/gi, 'kilometres').replace(/\bkm\b/gi, 'kilometre');

  return s
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * Split into sentence-sized chunks (Kokoro takes at most ~510 phoneme tokens
 * per call, and short chunks keep quality high). Long sentences are split
 * again at commas/semicolons.
 * @param {string} text normalised text
 * @param {number} [maxLen]
 * @returns {string[]}
 */
export function splitSentences(text, maxLen = 220) {
  const sentences = String(text).match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)/g) || [];
  const out = [];
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length <= maxLen) {
      out.push(sentence);
      continue;
    }
    let current = '';
    for (const part of sentence.split(/(?<=[,;:—])\s+/)) {
      if (current && (current + ' ' + part).length > maxLen) {
        out.push(current);
        current = part;
      } else {
        current = current ? `${current} ${part}` : part;
      }
    }
    // A single clause longer than maxLen: hard-split on spaces.
    while (current.length > maxLen) {
      const cut = current.lastIndexOf(' ', maxLen);
      const at = cut > 0 ? cut : maxLen;
      out.push(current.slice(0, at));
      current = current.slice(at).trim();
    }
    if (current) out.push(current);
  }
  return out.filter((s) => /[\p{L}\p{N}]/u.test(s));
}
