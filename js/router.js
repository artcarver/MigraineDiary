// Screens are addressed by the part of the address after #, such as
// #day/2026-10-21. app.js draws the screen; this module only knows where to go.

export const MAIN = ['today', 'calendar', 'meds', 'summary', 'settings'];

// Where Back and Cancel lead: the last main tab, and the page a form was
// opened from.
export const nav = { lastMain: '#today', returnTo: '#today' };

let renderer = () => {};
export function setRenderer(fn) {
  renderer = fn;
}

export function render() {
  renderer();
}

export function route() {
  const h = decodeURIComponent(location.hash.replace(/^#/, '')) || 'today';
  const [name, ...rest] = h.split('/');
  return { name, arg: rest.join('/') || null, hash: '#' + h };
}

export function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}
