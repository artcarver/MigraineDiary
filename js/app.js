// Starts the app: draws the screen for the current address into #app, sends
// taps to the screens' actions, and keeps the offline copy up to date. The
// screens live in js/views/, the saved diary in model.js.

import { draft, storeDraft, dropDraft } from './model.js';
import { MAIN, nav, route, go, render, setRenderer } from './router.js';
import { bar, card } from './ui.js';
import { actions as widgetActions } from './widgets.js';
import * as today from './views/today.js';
import * as migraine from './views/migraine.js';
import * as day from './views/day.js';
import * as dose from './views/dose.js';
import * as calendar from './views/calendar.js';
import * as meds from './views/meds.js';
import * as summary from './views/summary.js';
import * as settings from './views/settings.js';
import { esc, HOUR } from './util.js';

const SCREENS = [today, migraine, day, dose, calendar, meds, summary, settings];
const VIEWS = Object.assign({}, ...SCREENS.map((s) => s.views));

const appEl = document.getElementById('app');
const tabsEl = document.getElementById('tabs');

// ---------- drawing ----------

let lastHash = '';
let updateReady = false;

function draw() {
  const r = route();
  const view = VIEWS[r.name] ? r.name : 'today';
  const main = MAIN.includes(view);
  // A new version is waiting: switch to it between screens, never mid-form.
  if (updateReady && main) return location.reload();
  if (main) nav.lastMain = nav.returnTo = r.hash;
  if (view === 'episode') nav.returnTo = r.hash;
  const same = r.hash === lastHash;
  const y = window.scrollY;
  let html;
  try {
    html = VIEWS[view](r.arg);
  } catch (err) {
    console.error(err);
    html = bar('Something went wrong', { back: '#today' }) + card('', `<p>${esc(err.message)}</p>`);
  }
  appEl.innerHTML = html;
  document.body.classList.toggle('form-mode', !main);
  for (const a of tabsEl.querySelectorAll('a')) {
    const on = a.dataset.tab === view;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  window.scrollTo(0, same ? y : 0);
  lastHash = r.hash;
}

setRenderer(draw);

// ---------- taps and typing ----------

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

function parseVal(el) {
  const v = el.dataset.val;
  if (el.dataset.num) return Number(v);
  if (el.dataset.bool) return v === 'true';
  return v;
}

// Taps that change the form being filled in: data-field names the value.
const formActions = {
  go: (el) => go(el.dataset.href),
  cancel: (el) => {
    dropDraft();
    go(el.dataset.href);
  },
  pick: (el) => {
    if (!draft) return;
    const v = parseVal(el);
    const cur = getPath(draft, el.dataset.field);
    setPath(draft, el.dataset.field, cur === v && !el.dataset.keep ? null : v);
    storeDraft();
    render();
  },
  toggle: (el) => {
    if (!draft) return;
    const v = el.dataset.val;
    const list = getPath(draft, el.dataset.field) || [];
    setPath(draft, el.dataset.field, list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
    storeDraft();
    render();
  },
  flip: (el) => {
    if (!draft) return;
    setPath(draft, el.dataset.field, !getPath(draft, el.dataset.field));
    storeDraft();
    render();
  },
};

const ACTIONS = Object.assign({}, formActions, widgetActions, ...SCREENS.map((s) => s.actions));

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  ev.preventDefault();
  fn(el, ev);
});

// The keyboard's Done key runs the action named in data-enter.
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' || !ev.target.dataset || !ev.target.dataset.enter) return;
  const fn = ACTIONS[ev.target.dataset.enter];
  if (!fn) return;
  ev.preventDefault();
  fn(ev.target, ev);
});

function onField(ev) {
  const el = ev.target;
  if (!draft || !el.dataset || !el.dataset.bind) return;
  let v = el.value;
  if (el.dataset.num) v = v === '' ? null : Number(v);
  setPath(draft, el.dataset.bind, v);
  storeDraft();
}
document.addEventListener('input', onField);
document.addEventListener('change', onField);

settings.setUpRestore(document.getElementById('restore-file'));

window.addEventListener('hashchange', render);

// Coming back to the app: redraw, so "today" and "3 h ago" are current.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (updateReady) location.reload();
    return;
  }
  render();
});

// ---------- offline copy and updates ----------

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      // A home screen app can stay open for days, so look for a new version
      // when it comes back to the front, at most once an hour.
      let checked = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden || Date.now() - checked < HOUR) return;
        checked = Date.now();
        reg.update().catch(() => {});
      });
    })
    .catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) updateReady = true;
  });
}

render();
