// Metric, 24h clock, true minus. en-GB day-month order.
const LOCALE = 'en-GB';
export const MINUS = '−';

export function toDate(v) {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtInt(n) {
  if (n == null || !Number.isFinite(Number(n))) return '–';
  return Math.round(Number(n)).toLocaleString(LOCALE);
}

export function fmtNum(n, digits = 1) {
  if (n == null || !Number.isFinite(Number(n))) return '–';
  const s = Number(n).toFixed(digits);
  return s.startsWith('-') ? MINUS + s.slice(1) : s;
}

export function fmtKm(m, digits = 2) {
  if (m == null) return '–';
  return (Number(m) / 1000).toFixed(digits);
}

/** "3.2 km" or "850 m" */
export function fmtDistance(m) {
  if (m == null) return '–';
  return Number(m) >= 1000 ? `${fmtKm(m, 1)} km` : `${Math.round(Number(m))} m`;
}

export function fmtDuration(totalSeconds) {
  if (totalSeconds == null || !Number.isFinite(Number(totalSeconds))) return '–';
  const s = Math.max(0, Math.round(Number(totalSeconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Hours with one decimal, for totals ("12.4 h"). */
export function fmtHours(totalSeconds) {
  if (!totalSeconds) return '0';
  return (Number(totalSeconds) / 3600).toFixed(1);
}

export function fmtPace(secPerKm) {
  if (secPerKm == null || !Number.isFinite(Number(secPerKm)) || Number(secPerKm) <= 0 || Number(secPerKm) > 3600) return '–:––';
  const v = Math.round(Number(secPerKm));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

export function paceFromSpeed(mps) {
  return mps && mps > 0.3 ? 1000 / mps : null;
}

export function fmtSpeedKmh(mps) {
  if (mps == null) return '–';
  return (Number(mps) * 3.6).toFixed(1);
}

export function fmtUsd(n) {
  if (n == null) return '–';
  const v = Number(n);
  if (v === 0) return '$0.00';
  if (Math.abs(v) < 0.1) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

export function fmtDay(v) {
  const d = toDate(v);
  if (!d) return '–';
  return d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function fmtDate(v) {
  const d = toDate(v);
  if (!d) return '–';
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtShortDate(v) {
  const d = toDate(v);
  if (!d) return '–';
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}

export function fmtTime(v) {
  const d = toDate(v);
  if (!d) return '–';
  return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function fmtDateTime(v) {
  const d = toDate(v);
  if (!d) return '–';
  return `${fmtShortDate(d)}, ${fmtTime(d)}`;
}

/** "just now", "5 min ago", "3 h ago", "yesterday", else the date. */
export function fmtAgo(v, now = new Date()) {
  const d = toDate(v);
  if (!d) return 'never';
  const s = Math.round((now - d) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  if (s < 7 * 86400) return `${Math.round(s / 86400)} days ago`;
  return fmtDate(d);
}

export function plural(n, one, many = `${one}s`) {
  return `${fmtInt(n)} ${Number(n) === 1 ? one : many}`;
}

/** "running.run.completed" -> "Run completed" */
export function humanEventType(type) {
  const last = String(type || '').split('.').slice(1).join(' ') || String(type || '');
  const text = last.replace(/[._]/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url || '';
  }
}
