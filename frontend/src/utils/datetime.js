// Date/time helpers standardized to Asia/Kolkata for UI

const TZ = 'Asia/Kolkata';

export function now() {
  return new Date();
}

export function parseISO(iso) {
  try { return new Date(iso); } catch { return null; }
}

export function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }).format(new Date(iso));
  } catch { return String(iso); }
}

export function diffMs(a, b) { return b.getTime() - a.getTime(); }

export function humanizeDuration(ms) {
  const sec = Math.abs(ms) / 1000;
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Added for post-production UI chips
export function toLocalIST(iso) {
  if (!iso) return '';
  const dt = new Date(iso);
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }).format(dt) + ' IST';
}

export function distanceToNow(iso) {
  if (!iso) return { sign: 'now', days: 0, hours: 0 };
  const nowDt = new Date();
  const due = new Date(iso);
  const ms = due - nowDt;
  const sign = ms >= 0 ? 'in' : 'overdue';
  const abs = Math.abs(ms);
  const days = Math.floor(abs / (24*60*60*1000));
  const hours = Math.floor((abs % (24*60*60*1000)) / (60*60*1000));
  return { sign, days, hours };
}
