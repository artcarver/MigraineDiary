// Small text helpers shared by the screens and the exported summary.

export const HOUR = 3600000;

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
export const round1 = (x) => Math.round(x * 10) / 10;
export const labelOf = (list, id) => (list.find((x) => x.id === id) || {}).label || id;
