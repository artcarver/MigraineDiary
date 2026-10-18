// Date helpers. Times are stored as ISO strings; days are 'YYYY-MM-DD' keys
// in the phone's local time, so a migraine at 11 PM lands on the right day.

const pad = (n) => String(n).padStart(2, '0');

export function dayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(now = new Date()) {
  return dayKey(now);
}

export function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

// Whole days from a to b (b later gives a positive number). Uses UTC so a
// daylight-saving change never produces 23- or 25-hour days.
export function diffDays(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// Every day key from a to b, inclusive.
export function dayRange(a, b) {
  const out = [];
  if (a > b) return out;
  let k = a;
  while (k <= b) {
    out.push(k);
    k = addDays(k, 1);
  }
  return out;
}

export function monthKey(key) {
  return key.slice(0, 7);
}

export function addMonths(mKey, n) {
  const [y, m] = mKey.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthBounds(mKey) {
  const [y, m] = mKey.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${mKey}-01`, to: `${mKey}-${pad(last)}` };
}

// Value for <input type="datetime-local">.
export function toLocalInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(str) {
  if (!str) return null;
  const [day, time = '00:00'] = str.split('T');
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const date = new Date(y, m - 1, d, hh, mm);
  return isNaN(date) ? null : date.toISOString();
}

export function hoursBetween(isoA, isoB) {
  return (new Date(isoB) - new Date(isoA)) / 3600000;
}

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function fmtDay(key, { year = false, weekday = true } = {}) {
  const opts = { month: 'short', day: 'numeric' };
  if (weekday) opts.weekday = 'short';
  if (year) opts.year = 'numeric';
  return parseDay(key).toLocaleDateString('en-US', opts);
}

export function fmtDateTime(iso) {
  return `${fmtDay(dayKey(iso))}, ${fmtTime(iso)}`;
}

export function fmtMonth(mKey, { short = false } = {}) {
  const [y, m] = mKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: short ? 'short' : 'long', year: 'numeric' });
}

export function fmtHours(h) {
  if (h == null || isNaN(h)) return '';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  const days = Math.floor(h / 24);
  const rest = Math.round(h - days * 24);
  return rest ? `${days} d ${rest} h` : `${days} d`;
}
