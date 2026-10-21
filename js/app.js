// Screens and taps. Saved data and counting live in store.js and stats.js;
// this file renders views into #app and reacts to taps.

import {
  MED_KINDS,
  QUALITIES,
  LOCATIONS,
  WARNING_SIGNS,
  AURA_TYPES,
  AURA_LENGTHS,
  LEVELS,
  RESULTS,
  HABITS,
  MIDAS_QUESTIONS,
  MIDAS_EXTRA,
  midasGrade,
} from './defaults.js';
import {
  dayKey,
  todayKey,
  addDays,
  diffDays,
  dayRange,
  monthKey,
  addMonths,
  monthBounds,
  parseDay,
  toLocalInput,
  fromLocalInput,
  hoursBetween,
  fmtTime,
  fmtDay,
  fmtDateTime,
  fmtMonth,
  fmtHours,
} from './dates.js';
import { loadState, saveState, freshState, newId, backupText, parseBackup, STORAGE_KEY, DRAFT_KEY } from './store.js';
import {
  makeIndex,
  summarize,
  missingDays,
  dosesToRate,
  recentlyEnded,
  ongoingEpisode,
  episodeDayNumber,
  episodeStartKey,
  episodeEndKey,
  episodePeak,
  episodeSymptoms,
  medFor,
  medLabel,
  isDaily,
  lastPain,
  trackingStart,
} from './stats.js';
import { daysCsv, dosesCsv, migrainesCsv } from './csv.js';
import { summaryBlocks, blocksToText } from './report.js';
import { makePdf } from './pdf.js';

const VERSION = '1.0';
const HOUR = 3600000;
const KIND_ORDER = ['triptan', 'simple', 'combo', 'gepant', 'allergy', 'other'];

const appEl = document.getElementById('app');
const tabsEl = document.getElementById('tabs');
const toastEl = document.getElementById('toast');
const restoreInput = document.getElementById('restore-file');

// ---------- saved data ----------

let state;
let loadProblem = false;
try {
  state = loadState();
} catch {
  // Keep a copy of data that could not be read instead of overwriting it.
  loadProblem = true;
  try {
    localStorage.setItem(`${STORAGE_KEY}-unreadable-${Date.now()}`, localStorage.getItem(STORAGE_KEY));
  } catch {}
  state = freshState();
}

function commit() {
  try {
    saveState(state);
    return true;
  } catch {
    toast('Could not save. Your phone may be out of storage space.');
    return false;
  }
}

// Save once at launch, so the starting lists (and any list upgrade) keep the
// same ids and a half-filled form that names a medicine still finds it.
if (!loadProblem) commit();

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- small helpers ----------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const today = () => todayKey();
const med = (id) => state.settings.meds.find((m) => m.id === id);
const activeMeds = () => state.settings.meds.filter((m) => m.active && !isDaily(m.kind));
const preventiveMeds = () => state.settings.meds.filter((m) => m.active && m.kind === 'preventive');
const symptomLabel = (id) => (state.settings.symptoms.find((s) => s.id === id) || {}).label || id;
const labelOf = (list, id) => (list.find((x) => x.id === id) || {}).label || id;
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const round1 = (x) => Math.round(x * 10) / 10;
const muted = (s) => `<span class="muted">${s}</span>`;

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

// Drops empty values so day entries stay small.
function clean(e) {
  for (const k of Object.keys(e)) {
    const v = e[k];
    const emptyObj = v && typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some((x) => x != null && x !== false);
    if (v == null || v === false || (Array.isArray(v) && !v.length) || emptyObj) delete e[k];
  }
  return e;
}

// Stores a day entry, or removes it once nothing is left in it.
function putDay(key, e) {
  const c = clean(e);
  if (Object.keys(c).length) state.days[key] = c;
  else delete state.days[key];
}

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 2800);
}

function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

function addDose(medId, time, pain, episodeId) {
  const m = med(medId);
  state.doses.push({
    id: newId(),
    medId,
    name: m ? m.name : '',
    dose: m ? m.dose : '',
    kind: m ? m.kind : 'other',
    time,
    pain: pain ?? null,
    episodeId: episodeId || null,
    result: null,
    ratedAt: null,
  });
}

// ---------- drafts: half-filled forms survive the app closing for 12 hours ----------

let draft = null;

function storeDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {}
}

function dropDraft() {
  draft = null;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

function useDraft(route, init) {
  if (draft && draft.route === route) return draft;
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
  } catch {}
  if (saved && saved.route === route && Date.now() - new Date(saved.createdAt) < 12 * HOUR) draft = saved;
  else draft = { route, createdAt: new Date().toISOString(), ...init() };
  storeDraft();
  return draft;
}

// Forget a saved half-filled form when the same data is changed elsewhere.
function discardDraft(route) {
  if (draft && draft.route === route) draft = null;
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (saved && saved.route === route) localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

function startDraft(route, values) {
  draft = { route, createdAt: new Date().toISOString(), ...values };
  storeDraft();
}

// ---------- routing ----------

const MAIN = ['today', 'calendar', 'summary', 'settings'];
let lastMain = '#today';
let returnTo = '#today';
let lastHash = '';
let lastSummary = null;

function route() {
  const h = decodeURIComponent(location.hash.replace(/^#/, '')) || 'today';
  const [name, ...rest] = h.split('/');
  return { name, arg: rest.join('/') || null, hash: '#' + h };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

const VIEWS = {
  today: viewToday,
  calendar: viewCalendar,
  summary: viewSummary,
  settings: viewSettings,
  new: viewNew,
  edit: viewEdit,
  day: viewDay,
  dose: viewDose,
  end: viewEnd,
  episode: viewEpisode,
  med: viewMed,
  midas: viewMidas,
  help: viewHelp,
};

function render() {
  const r = route();
  const view = VIEWS[r.name] ? r.name : 'today';
  if (MAIN.includes(view)) lastMain = returnTo = r.hash;
  if (view === 'episode') returnTo = r.hash;
  const same = r.hash === lastHash;
  const y = window.scrollY;
  let html;
  try {
    html = VIEWS[view](r.arg);
  } catch (err) {
    console.error(err);
    html = bar('Something went wrong', { back: '#today' }) + `<div class="card"><p>${esc(err.message)}</p></div>`;
  }
  appEl.innerHTML = html;
  document.body.classList.toggle('form-mode', !MAIN.includes(view));
  for (const a of tabsEl.querySelectorAll('a')) a.classList.toggle('on', a.dataset.tab === view);
  window.scrollTo(0, same ? y : 0);
  lastHash = r.hash;
}

// ---------- building blocks ----------

function bar(title, { back = null, cancel = false } = {}) {
  const left = back
    ? `<a class="link" href="${back}"${cancel ? ` data-act="cancel" data-href="${back}"` : ''}>${cancel ? 'Cancel' : 'Back'}</a>`
    : '';
  return `<header class="bar"><span class="left">${left}</span><h1>${esc(title)}</h1><span class="right"></span></header>`;
}

function mainBar(title, right = '') {
  return `<header class="bar main"><h1>${esc(title)}</h1><span class="right">${right}</span></header>`;
}

function card(title, body, cls = '') {
  return `<section class="card ${cls}">${title ? `<h2>${title}</h2>` : ''}${body}</section>`;
}

function section(title, body, hint = '') {
  return `<section class="field"><h2>${title}</h2>${hint ? `<p class="hint">${hint}</p>` : ''}${body}</section>`;
}

const YES_NO = [
  { id: true, label: 'Yes' },
  { id: false, label: 'No' },
];

function chips(field, options, value, { multi = false, num = false, bool = false, keep = false } = {}) {
  const items = options.map((o) => {
    const on = multi ? (value || []).includes(o.id) : value === o.id;
    const attrs = `${num ? ' data-num="1"' : ''}${bool ? ' data-bool="1"' : ''}${keep ? ' data-keep="1"' : ''}`;
    return `<button type="button" class="chip${on ? ' on' : ''}" data-act="${multi ? 'toggle' : 'pick'}" data-field="${field}" data-val="${esc(String(o.id))}"${attrs} aria-pressed="${on}">${esc(o.label)}</button>`;
  });
  return `<div class="chips">${items.join('')}</div>`;
}

function painPicker(field, value) {
  let h = '<div class="pain">';
  for (let n = 0; n <= 10; n++) {
    const on = value === n;
    h += `<button type="button" class="pain-btn p${n}${on ? ' on' : ''}" data-act="pick" data-field="${field}" data-val="${n}" data-num="1" aria-pressed="${on}" aria-label="Pain ${n}">${n}</button>`;
  }
  return h + '</div><div class="pain-key"><span>0 none</span><span>1-3 mild</span><span>4-6 moderate</span><span>7-10 severe</span></div>';
}

function painSelect(field, value) {
  let h = `<select data-bind="${field}" data-num="1"><option value="">-</option>`;
  for (let n = 0; n <= 10; n++) h += `<option value="${n}"${value === n ? ' selected' : ''}>${n}</option>`;
  return h + '</select>';
}

function levelPicker(field, value, { none = true, noneLabel = 'No migraine' } = {}) {
  const opts = LEVELS.filter((l) => none || l.id > 0);
  return `<div class="levels">${opts
    .map((l) => {
      const on = value === l.id;
      return `<button type="button" class="level lv${l.id}${on ? ' on' : ''}" data-act="pick" data-field="${field}" data-val="${l.id}" data-num="1" aria-pressed="${on}"><span class="swatch"></span><span>${esc(l.id === 0 ? noneLabel : l.label)}</span></button>`;
    })
    .join('')}</div>`;
}

function switchRow(field, value, label, act = 'flip', extra = '') {
  return `<button type="button" class="switch" role="switch" aria-checked="${!!value}" data-act="${act}" data-field="${field}"${extra}><span>${esc(label)}</span><span class="knob"></span></button>`;
}

function timeInput(field, value, label = '') {
  return `<label class="input">${label ? `<span>${esc(label)}</span>` : ''}<input type="datetime-local" data-bind="${field}" value="${esc(value || '')}"></label>`;
}

function textInput(field, value, placeholder, cap = 'words') {
  return `<input type="text" data-bind="${field}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" autocapitalize="${cap}">`;
}

function numInput(field, value, max = 92) {
  return `<input type="number" inputmode="numeric" min="0" max="${max}" data-bind="${field}" data-num="1" value="${value ?? ''}">`;
}

function saveBar(act, label, extra = '') {
  return `<div class="savebar"><button type="button" class="btn primary" data-act="${act}"${extra}>${esc(label)}</button></div>`;
}

function stat(n, label) {
  return `<div class="stat"><b>${n}</b><span>${esc(label)}</span></div>`;
}

function barRow(label, count, total, shown = count) {
  return `<div class="bar-row"><span>${esc(label)}</span><span class="track"><i style="width:${pct(count, total)}%"></i></span><span class="n">${shown}</span></div>`;
}

function visibleSymptoms(selected) {
  return state.settings.symptoms.filter((s) => !s.hidden || (selected || []).includes(s.id));
}

function rateButtons(d) {
  return `<div class="chips">${RESULTS.map(
    (r) =>
      `<button type="button" class="chip${d.result === r.id ? ' on' : ''}" data-act="rate" data-dose="${d.id}" data-val="${r.id}" aria-pressed="${d.result === r.id}">${r.label}</button>`,
  ).join('')}</div>`;
}

function medButtons(act, selectedId) {
  const meds = activeMeds();
  if (!meds.length) return `<p class="muted">No medicines yet. Add them in <a href="#settings">Settings</a>.</p>`;
  const t = today();
  let h = '<div class="med-list cols">';
  for (const kind of KIND_ORDER) {
    const group = meds.filter((m) => m.kind === kind);
    if (!group.length) continue;
    h += `<p class="med-group">${esc(MED_KINDS[kind].label)}</p>`;
    for (const m of group) {
      const n = state.doses.filter((x) => x.medId === m.id && dayKey(x.time) === t).length;
      h += `<button type="button" class="med-btn${selectedId === m.id ? ' on' : ''}" data-act="${act}" data-med="${m.id}" aria-pressed="${selectedId === m.id}"><span>${esc(medLabel(m))}</span>${m.brand ? `<small>${esc(m.brand)}</small>` : ''}${n ? `<span class="count">${n} today</span>` : ''}</button>`;
    }
  }
  return h + '</div>';
}

function doseEditor(d) {
  let h = '';
  d.doses.forEach((x, i) => {
    const m = med(x.medId) || { name: 'Medicine', dose: '' };
    h += `<div class="dose"><div class="dose-head"><b>${esc(medLabel(m))}</b><button type="button" class="link danger" data-act="remove-dose" data-i="${i}">Remove</button></div><div class="two"><label class="input"><span>Time</span><input type="datetime-local" data-bind="doses.${i}.time" value="${esc(x.time)}"></label><label class="input"><span>Pain then</span>${painSelect(`doses.${i}.pain`, x.pain)}</label></div></div>`;
  });
  return h + medButtons('add-dose', null);
}

function existingDoses(doses) {
  return doses
    .filter((d) => !isDaily(medFor(state, d).kind))
    .map(
      (d) =>
        `<div class="dose"><div class="dose-head"><b>${esc(medLabel(medFor(state, d)))}</b><span class="muted small">${esc(fmtDateTime(d.time))}${d.pain != null ? `, pain ${d.pain}` : ''}</span></div>${rateButtons(d)}<button type="button" class="link danger small" data-act="delete-dose" data-dose="${d.id}">Delete this dose</button></div>`,
    )
    .join('');
}

function extras(d) {
  let h = '';
  if (state.settings.trackHabits) {
    const body = HABITS.map(
      (hb) => `<div class="sub"><h3>${esc(hb.label)}</h3>${chips('habits.' + hb.id, hb.options, (d.habits || {})[hb.id])}</div>`,
    ).join('');
    h += section('Habits', body, 'Optional. Things you can change, so patterns can show up over time.');
  }
  const prevs = preventiveMeds();
  if (prevs.length) {
    h += section('Daily supplements', prevs.map((m) => switchRow(`preventive.${m.id}`, (d.preventive || {})[m.id], `Took ${medLabel(m)}`)).join(''));
  }
  return h;
}

// The front of the face, drawn like a mirror so the person's left is on the
// left of the screen.
function faceSvg(selected) {
  const region = (id, tag, attrs) => {
    const on = selected.includes(id);
    const label = esc(labelOf(LOCATIONS, id));
    return `<${tag} class="region${on ? ' on' : ''}" ${attrs} data-act="toggle" data-field="locations" data-val="${id}" role="button" aria-pressed="${on}" aria-label="${label}"><title>${label}</title></${tag}>`;
  };
  return `<svg class="face" viewBox="0 0 240 290" role="group" aria-label="Face. Tap where it hurts.">
    <defs><clipPath id="head-clip"><ellipse cx="120" cy="152" rx="94" ry="124"/></clipPath></defs>
    <text x="22" y="14">Your left</text><text x="218" y="14" text-anchor="end">Your right</text>
    <ellipse cx="120" cy="152" rx="94" ry="124" fill="#181d22"/>
    <g clip-path="url(#head-clip)">
      ${region('fh-l', 'rect', 'x="20" y="20" width="73" height="78"')}
      ${region('fh-c', 'rect', 'x="93" y="20" width="54" height="78"')}
      ${region('fh-r', 'rect', 'x="147" y="20" width="73" height="78"')}
      ${region('tm-l', 'rect', 'x="20" y="98" width="45" height="64"')}
      ${region('tm-r', 'rect', 'x="175" y="98" width="45" height="64"')}
    </g>
    ${region('ey-l', 'circle', 'cx="88" cy="128" r="21"')}
    ${region('ey-r', 'circle', 'cx="152" cy="128" r="21"')}
    ${region('br', 'rect', 'x="110" y="104" width="20" height="56" rx="7"')}
    ${region('ck-l', 'ellipse', 'cx="84" cy="186" rx="27" ry="21"')}
    ${region('ck-r', 'ellipse', 'cx="156" cy="186" rx="27" ry="21"')}
    <ellipse class="outline" cx="120" cy="152" rx="94" ry="124"/>
    <path class="deco" d="M74 128 Q88 119 102 128 Q88 137 74 128 Z M138 128 Q152 119 166 128 Q152 137 138 128 Z"/>
    <path class="deco" d="M120 162 L112 199 Q120 205 128 199"/>
    <path class="deco" d="M98 233 Q120 245 142 233"/>
    <text x="120" y="64" text-anchor="middle">forehead</text>
    <text x="42" y="134" text-anchor="middle">temple</text>
    <text x="198" y="134" text-anchor="middle">temple</text>
  </svg>`;
}

function installSteps() {
  return `<ol class="steps">
    <li>Tap the three dots next to the address bar, then tap Share. On older iPhones, tap the Share button at the bottom of the screen.</li>
    <li>Scroll down and tap Add to Home Screen.</li>
    <li>Leave Open as Web App turned on, then tap Add.</li>
  </ol>`;
}

function reminderSteps() {
  return `<ol class="steps">
    <li>Open the Reminders app and add a reminder called Migraine Diary.</li>
    <li>Tap the info button next to it, turn on Date and Time, and pick a time, such as 8 PM.</li>
    <li>Tap Repeat and choose Daily.</li>
    <li>When it goes off, open Migraine Diary from your home screen and tap how the day went.</li>
  </ol>
  <p class="hint">A Shortcuts automation can't open the home screen app. It opens the link in Safari, which keeps separate data, so a plain reminder works better.</p>`;
}

function notFound() {
  return bar('Not found', { back: lastMain }) + card('', '<p>This entry no longer exists.</p>');
}

// ---------- Today ----------

function viewToday() {
  const t = today();
  const now = new Date();
  const info = makeIndex(state, t);
  const ep = ongoingEpisode(state);
  let h = mainBar('Today', esc(fmtDay(t)));
  if (loadProblem) {
    h += card(
      'Your saved diary could not be read',
      '<p>A copy was kept on this phone. If you have a backup file, load it from Settings.</p>',
      'note danger',
    );
  }
  if (isIos() && !isStandalone()) {
    h += card(
      'Add this to your home screen',
      `${installSteps()}<p class="hint">Then always open Migraine Diary from its icon. Safari keeps a separate copy, so entries made here in Safari won't show up in the app.</p>`,
      'note warn',
    );
  }
  h += ep ? ongoingCard(ep, info, t, now) : '<button type="button" class="btn primary huge" data-act="go" data-href="#new">New migraine</button>';
  h += rateCard(now);
  if (!ep) h += checkInCard(info, t);
  h += dailyMedsCard(t);
  h += catchUpCard(t);
  h += monthCard(t);
  h += backupCard(t);
  return h;
}

function ongoingCard(ep, info, t, now) {
  const hours = hoursBetween(ep.start, now.toISOString());
  const entry = state.days[t];
  const done = entry && entry.level != null;
  const todays = info(t).doses.filter((d) => !isDaily(medFor(state, d).kind));
  return `<section class="card ongoing">
    <p class="eyebrow">Migraine going on</p>
    <h2>Since ${esc(fmtDateTime(ep.start))}</h2>
    <p class="muted">Day ${episodeDayNumber(ep, t)}, ${esc(fmtHours(hours))} so far</p>
    ${hours > 72 ? `<div class="note warn"><b>This migraine has lasted more than 3 days.</b> That is long enough to call your doctor about. <a href="#help">When to get help</a></div>` : ''}
    ${todays.length ? `<p class="small muted">Today: ${esc(todays.map((d) => `${medLabel(medFor(state, d))} at ${fmtTime(d.time)}`).join(', '))}</p>` : ''}
    <div class="stack">
      <button type="button" class="btn${done ? '' : ' primary'}" data-act="go" data-href="#day/${t}">${done ? "Edit today's update" : "Today's update"}</button>
      <div class="row2">
        <button type="button" class="btn" data-act="go" data-href="#dose">Took a medicine</button>
        <button type="button" class="btn" data-act="go" data-href="#end">It's gone</button>
      </div>
      <a class="link" href="#episode/${ep.id}">See this migraine</a>
    </div>
  </section>`;
}

function rateCard(now) {
  const list = dosesToRate(state, now)
    .filter((d) => now - new Date(d.time) < 72 * HOUR)
    .slice(-6);
  if (!list.length) return '';
  const items = list
    .map(
      (d) =>
        `<div class="dose"><div class="dose-head"><b>${esc(medLabel(medFor(state, d)))}</b><span class="muted small">${esc(fmtDateTime(d.time))}</span></div>${d.pain != null ? `<p class="small muted">Pain when taken: ${d.pain}</p>` : ''}${rateButtons(d)}</div>`,
    )
    .join('');
  return `<section class="card"><p class="eyebrow">Did it help?</p><h2>How was it 2 hours after taking it?</h2>${items}</section>`;
}

function quickLevels(key, compact) {
  return `<div class="levels${compact ? ' compact' : ''}">${LEVELS.map(
    (l) =>
      `<button type="button" class="level lv${l.id}" data-act="quick-level" data-day="${key}" data-level="${l.id}"><span class="swatch"></span><span>${esc(compact ? l.short : l.label)}</span></button>`,
  ).join('')}</div>`;
}

function checkInCard(info, t) {
  const e = state.days[t];
  if (e && e.level != null) {
    const needsHabits = state.settings.trackHabits && !(e.habits && Object.keys(e.habits).length);
    return `<section class="card"><div class="dose-head"><span>Today: <span class="pill lv${e.level}">${esc(LEVELS[e.level].label)}</span></span><a class="link" href="#day/${t}">Edit</a></div>${needsHabits ? `<a class="link" href="#day/${t}">Add sleep, meals and caffeine</a>` : ''}</section>`;
  }
  const hint = info(t).inEpisode
    ? 'A migraine was going on earlier today, so this counts as a migraine day unless you tap No migraine.'
    : 'Tap once a day, good days too. Blank days make the counts less accurate.';
  return card('How was today?', `<p class="hint">${hint}</p>${quickLevels(t, false)}`);
}

// One tap for daily supplements and preventives, so good days count too.
function dailyMedsCard(t) {
  const meds = preventiveMeds();
  if (!meds.length) return '';
  const taken = (state.days[t] && state.days[t].preventive) || {};
  const rows = meds.map((m) => switchRow('', taken[m.id], `Took ${medLabel(m)} today`, 'daily-med', ` data-med="${m.id}" data-day="${t}"`)).join('');
  return card('Daily supplements', rows);
}

function catchUpCard(t) {
  const list = missingDays(state, t, 7);
  if (!list.length) return '';
  const rows = list
    .map(
      (m) =>
        `<div class="catch-row"><p>${esc(fmtDay(m.key))}${m.inEpisode ? ' <span class="pill">during a migraine</span>' : ''}</p>${quickLevels(m.key, true)}</div>`,
    )
    .join('');
  return card('Days not filled in', `<p class="hint">Tap how each day went.</p>${rows}`);
}

function monthCard(t) {
  const m = monthKey(t);
  const s = summarize(state, monthBounds(m).from, t, t);
  return `<section class="card"><div class="dose-head"><h2>${esc(fmtMonth(m).split(' ')[0])} so far</h2><a class="link" href="#summary">Summary</a></div>
    <div class="stats">${stat(s.migraineDays, s.migraineDays === 1 ? 'migraine day' : 'migraine days')}${stat(s.medDays, s.medDays === 1 ? 'medicine day' : 'medicine days')}${stat(s.levels[3], 'had to stop')}</div></section>`;
}

function backupCard(t) {
  if (!state.episodes.length && !Object.keys(state.days).length) return '';
  const last = state.settings.lastBackup;
  const since = last ? diffDays(dayKey(last), t) : diffDays(trackingStart(state), t);
  if (since < 30) return '';
  const msg = last ? `Your last backup was ${plural(since, 'day')} ago.` : "You haven't saved a backup yet.";
  return card(
    'Time for a backup',
    `<p class="muted">${msg} If this phone is lost or replaced, a backup file is the only way to get your diary back.</p><button type="button" class="btn" data-act="backup-save">Save backup file</button>`,
  );
}

// ---------- New and edit migraine ----------

function newDefaults(extra = {}) {
  const now = toLocalInput(new Date());
  return {
    startMode: 'now',
    start: now,
    stillGoing: true,
    end: now,
    pain: null,
    locations: [],
    quality: [],
    symptoms: [],
    aura: null,
    auraTypes: [],
    auraLength: null,
    warning: [],
    level: null,
    missed: false,
    doses: [],
    habits: {},
    preventive: {},
    returnAnswer: null,
    hangover: null,
    ...extra,
  };
}

// The migraine form opened from a day rating: ask when it started rather than
// assuming it began just now.
function formForDay(key, t, extra) {
  return key === t
    ? { startMode: 'pick', stillGoing: true, ...extra }
    : { startMode: 'pick', start: `${key}T12:00`, stillGoing: false, end: `${key}T20:00`, ...extra };
}

// The migraine a dose at this time belongs to, from those covering its day.
function episodeAt(episodes, iso) {
  return episodes.filter((e) => e.start <= iso).sort((a, b) => b.start.localeCompare(a.start))[0] || episodes[0];
}

function draftStartIso(d) {
  return d.startMode === 'now' ? new Date().toISOString() : fromLocalInput(d.start);
}

function viewNew() {
  const ongoing = ongoingEpisode(state);
  const d = useDraft('#new', () => newDefaults(ongoing ? { startMode: 'pick', stillGoing: false } : {}));
  return bar('New migraine', { back: returnTo, cancel: true }) + migraineForm(d, null, ongoing) + saveBar('save-new', 'Save migraine');
}

function viewEdit(id) {
  const ep = state.episodes.find((e) => e.id === id);
  if (!ep) return notFound();
  const d = useDraft('#edit/' + id, () =>
    newDefaults({
      startMode: 'pick',
      start: toLocalInput(ep.start),
      stillGoing: !ep.end,
      end: toLocalInput(ep.end || new Date()),
      pain: ep.pain,
      locations: [...ep.locations],
      quality: [...ep.quality],
      symptoms: [...ep.symptoms],
      aura: !!ep.aura,
      auraTypes: ep.aura ? [...(ep.aura.types || [])] : [],
      auraLength: ep.aura ? ep.aura.length : null,
      warning: [...ep.warning],
      hangover: ep.hangover,
      returnAnswer: ep.returnOf ? true : null,
    }),
  );
  const other = state.episodes.find((e) => !e.end && e.id !== id);
  return bar('Edit migraine', { back: '#episode/' + id, cancel: true }) + migraineForm(d, ep, other) + saveBar('save-edit', 'Save changes', ` data-id="${id}"`);
}

function migraineForm(d, ep, otherOngoing) {
  const editing = !!ep;
  const past = editing || d.startMode === 'pick';
  const ended = past && d.stillGoing === false;
  let h = '';

  let when = '';
  if (!editing) {
    when += chips(
      'startMode',
      [
        { id: 'now', label: 'Just now' },
        { id: 'woke', label: 'Woke up with it' },
        { id: 'pick', label: 'Earlier' },
      ],
      d.startMode,
      { keep: true },
    );
  }
  if (d.startMode !== 'now') when += timeInput('start', d.start, editing ? '' : d.startMode === 'woke' ? 'About when you woke up' : 'Started');
  if (past) {
    when += `<div class="sub"><h3>Is it still going?</h3>${chips('stillGoing', YES_NO, d.stillGoing, { bool: true, keep: true })}</div>`;
    if (d.stillGoing && otherOngoing) when += '<p class="hint">Another migraine is still going. Only one can be going at a time, so end that one first.</p>';
    if (ended) when += timeInput('end', d.end, 'Ended');
  }
  h += section('When did it start?', when);

  const startIso = draftStartIso(d);
  const prev = startIso ? recentlyEnded(state, startIso, ep ? ep.id : null) : null;
  if (prev) {
    h += section(
      'Is this the same migraine coming back?',
      chips('returnAnswer', YES_NO, d.returnAnswer, { bool: true }),
      `The last one ended ${esc(fmtDateTime(prev.end))}.`,
    );
  }

  h += section(editing ? 'How bad was it at the start?' : 'How bad is it?', painPicker('pain', d.pain));

  const picked = d.locations.length
    ? esc(d.locations.map((id) => labelOf(LOCATIONS, id)).join(', '))
    : 'Tap the areas that hurt. Shown like a mirror: your left is on the left.';
  h += section(
    'Where does it hurt?',
    `${faceSvg(d.locations)}<p class="face-picked">${picked}</p><div class="sub"><h3>Somewhere else</h3>${chips(
      'locations',
      LOCATIONS.filter((l) => l.id === 'top' || l.id === 'back'),
      d.locations,
      { multi: true },
    )}</div>`,
  );
  h += section('What does it feel like?', chips('quality', QUALITIES, d.quality, { multi: true }));
  h += section('Symptoms', chips('symptoms', visibleSymptoms(d.symptoms), d.symptoms, { multi: true }), 'Tap all that apply.');

  let aura = chips('aura', YES_NO, d.aura, { bool: true });
  if (d.aura) {
    aura += `<div class="sub"><h3>What kind?</h3>${chips('auraTypes', AURA_TYPES, d.auraTypes, { multi: true })}</div>`;
    aura += `<div class="sub"><h3>How long did it last?</h3>${chips('auraLength', AURA_LENGTHS, d.auraLength)}</div>`;
    aura += '<p class="hint">If an aura is new for you, comes with weakness, or lasts more than an hour, get medical advice.</p>';
  }
  h += section('Aura?', aura, 'Zigzag lines, blind spots, tingling, or trouble finding words, before or during the headache.');
  h += section(
    'Warning signs beforehand',
    chips('warning', WARNING_SIGNS, d.warning, { multi: true }),
    'Optional. Anything you noticed in the hours or the day before the pain started.',
  );

  if (editing && d.stillGoing === false) {
    h += section('Migraine hangover afterwards?', chips('hangover', YES_NO, d.hangover, { bool: true }), 'Tired, foggy or washed out once the pain went.');
  }
  if (!editing) {
    h += section(
      ended ? 'How did it affect that day?' : 'How is it affecting today?',
      levelPicker('level', d.level, { none: false }) + switchRow('missed', d.missed, 'Missed work, school or plans'),
    );
    h += section('Medicines taken', doseEditor(d), 'Tap a medicine each time you take a dose.');
    h += extras(d);
  }
  return h;
}

function mergeExtras(e, d) {
  const habits = Object.fromEntries(Object.entries(d.habits || {}).filter(([, v]) => v != null));
  if (Object.keys(habits).length) e.habits = { ...(e.habits || {}), ...habits };
  const prev = Object.fromEntries(Object.entries(d.preventive || {}).filter(([, v]) => v));
  if (Object.keys(prev).length) e.preventive = { ...(e.preventive || {}), ...prev };
}

function saveNew() {
  const d = draft;
  const now = new Date();
  const start = draftStartIso(d);
  if (!start) return toast('Pick when it started.');
  if (new Date(start) - now > 5 * 60000) return toast('The start time is in the future.');
  const ended = d.startMode === 'pick' && d.stillGoing === false;
  const end = ended ? fromLocalInput(d.end) : null;
  if (ended && !end) return toast('Pick when it ended.');
  if (end && end <= start) return toast('The end time needs to be after the start.');
  if (end && new Date(end) - now > 5 * 60000) return toast('The end time is in the future.');
  if (!ended && ongoingEpisode(state)) return toast('Another migraine is still going. End that one first, or mark this one as over.');

  const prev = recentlyEnded(state, start);
  const ep = {
    id: newId(),
    start,
    end,
    wokeUp: d.startMode === 'woke',
    pain: d.pain,
    locations: d.locations,
    quality: d.quality,
    symptoms: d.symptoms,
    aura: d.aura ? { types: d.auraTypes, length: d.auraLength } : null,
    warning: d.warning,
    hangover: null,
    returnOf: prev && d.returnAnswer === true ? prev.id : null,
    createdAt: now.toISOString(),
  };
  state.episodes.push(ep);
  for (const x of d.doses.filter((y) => med(y.medId))) addDose(x.medId, fromLocalInput(x.time) || now.toISOString(), x.pain, ep.id);

  const key = ended ? dayKey(start) : today();
  const e = { ...(state.days[key] || {}) };
  if (d.level != null) e.level = d.level;
  else if (e.level === 0) delete e.level;
  if (d.pain != null) e.peakPain = Math.max(e.peakPain ?? 0, d.pain);
  if (d.symptoms.length) e.symptoms = [...new Set([...(e.symptoms || []), ...d.symptoms])];
  if (d.missed) e.missed = true;
  mergeExtras(e, d);
  putDay(key, e);

  if (commit()) {
    dropDraft();
    toast('Saved');
    go(ended ? returnTo : '#today');
  }
}

function saveEdit(el) {
  const id = el.dataset.id;
  const ep = state.episodes.find((e) => e.id === id);
  if (!ep) return go('#calendar');
  const d = draft;
  const now = new Date();
  const start = fromLocalInput(d.start);
  if (!start) return toast('Pick when it started.');
  if (new Date(start) - now > 5 * 60000) return toast('The start time is in the future.');
  const end = d.stillGoing ? null : fromLocalInput(d.end);
  if (!d.stillGoing && !end) return toast('Pick when it ended.');
  if (end && end <= start) return toast('The end time needs to be after the start.');
  if (end && new Date(end) - now > 5 * 60000) return toast('The end time is in the future.');
  if (!end && state.episodes.some((e) => !e.end && e.id !== id)) return toast('Another migraine is still going. Only one can be going at a time.');
  const prev = recentlyEnded(state, start, id);
  Object.assign(ep, {
    start,
    end,
    pain: d.pain,
    locations: d.locations,
    quality: d.quality,
    symptoms: d.symptoms,
    aura: d.aura ? { types: d.auraTypes, length: d.auraLength } : null,
    warning: d.warning,
    hangover: end ? d.hangover : null,
    returnOf: d.returnAnswer === true ? (prev ? prev.id : ep.returnOf) : null,
  });
  if (commit()) {
    dropDraft();
    toast('Saved');
    go('#episode/' + id);
  }
}

// ---------- One day ----------

function dayDefaults(key, info) {
  const e = info.entry || {};
  const ep = info.episodes[0];
  let symptoms = e.symptoms;
  if (!symptoms && ep) {
    for (let k = addDays(key, -1); k >= episodeStartKey(ep); k = addDays(k, -1)) {
      const s = state.days[k] && state.days[k].symptoms;
      if (s) {
        symptoms = s;
        break;
      }
    }
    if (!symptoms) symptoms = ep.symptoms;
  }
  return {
    key,
    level: e.level ?? null,
    peakPain: e.peakPain ?? null,
    symptoms: [...(symptoms || [])],
    prefilled: !e.symptoms && !!(symptoms && symptoms.length),
    missed: !!e.missed,
    habits: { ...(e.habits || {}) },
    preventive: { ...(e.preventive || {}) },
    doses: [],
  };
}

function viewDay(arg) {
  const t = today();
  const key = arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) && arg <= t ? arg : t;
  const info = makeIndex(state, t)(key);
  const ep = info.episodes[0] || null;
  const d = useDraft('#day/' + key, () => dayDefaults(key, info));
  const migraineish = d.level >= 1 || (d.level == null && info.inEpisode);

  let h = bar(key === t ? 'Today' : fmtDay(key), { back: returnTo, cancel: true });
  if (ep) {
    h += `<p class="hint" style="margin-top:14px">Day ${episodeDayNumber(ep, key)} of the migraine that started ${esc(fmtDateTime(ep.start))}. <a href="#episode/${ep.id}">See it</a></p>`;
  }
  h += section('How was this day?', levelPicker('level', d.level, { noneLabel: info.inEpisode ? 'No pain this day' : 'No migraine' }));
  if (migraineish && info.inEpisode) {
    h += section('Worst pain this day', painPicker('peakPain', d.peakPain));
    h += section(
      'Symptoms',
      chips('symptoms', visibleSymptoms(d.symptoms), d.symptoms, { multi: true }),
      d.prefilled ? 'Filled in from last time. Tap to change.' : 'Tap all that apply.',
    );
    h += section('Work, school and plans', switchRow('missed', d.missed, 'Missed work, school or plans'));
    h += section('Medicines this day', existingDoses(info.doses) + doseEditor(d), 'Tap a medicine each time you take a dose.');
  } else if (migraineish) {
    h += '<div class="note" style="margin-top:14px">This day is not part of a migraine entry yet. The next step adds the details.</div>';
  }
  h += extras(d);
  return h + saveBar('save-day', migraineish && !info.inEpisode ? 'Next' : 'Save');
}

function saveDay() {
  const d = draft;
  const t = today();
  const key = d.key;
  const info = makeIndex(state, t)(key);
  const migraineish = d.level >= 1 || (d.level == null && info.inEpisode);
  const e = { ...(state.days[key] || {}) };
  e.level = d.level;
  if (migraineish && info.inEpisode) {
    e.peakPain = d.peakPain;
    e.symptoms = d.symptoms;
    e.missed = d.missed;
  } else if (!migraineish) {
    delete e.peakPain;
    delete e.symptoms;
    delete e.missed;
  }
  e.habits = Object.fromEntries(Object.entries(d.habits || {}).filter(([, v]) => v != null));
  e.preventive = Object.fromEntries(Object.entries(d.preventive || {}).filter(([, v]) => v));
  putDay(key, e);
  if (info.inEpisode) {
    for (const x of d.doses.filter((y) => med(y.medId))) {
      const time = fromLocalInput(x.time) || new Date().toISOString();
      addDose(x.medId, time, x.pain, episodeAt(info.episodes, time).id);
    }
  }
  if (!commit()) return;

  if (migraineish && !info.inEpisode) {
    startDraft('#new', newDefaults(formForDay(key, t, { level: d.level, pain: d.peakPain, missed: d.missed })));
    return go('#new');
  }
  dropDraft();
  toast('Saved');
  go(returnTo);
}

// ---------- Took a medicine ----------

function viewDose() {
  const ep = ongoingEpisode(state);
  const d = useDraft('#dose', () => ({ medId: null, time: toLocalInput(new Date()), pain: ep ? lastPain(state, ep, today()) : null }));
  let h = bar('Took a medicine', { back: returnTo, cancel: true });
  if (!ep) h += '<div class="note" style="margin-top:14px">No migraine is going on, so this dose is saved on its own.</div>';
  h += section('Which one?', medButtons('pick-med', d.medId));
  h += section('When?', timeInput('time', d.time));
  h += section('Pain right now', painPicker('pain', d.pain), 'This shows over time whether your medicines work better when taken early.');
  return h + saveBar('save-dose', 'Save');
}

function saveDose() {
  const d = draft;
  if (!d.medId) return toast('Pick a medicine.');
  const time = fromLocalInput(d.time);
  if (!time) return toast('Pick a time.');
  const ep = ongoingEpisode(state);
  const inEp = ep && time >= ep.start;
  addDose(d.medId, time, d.pain, inEp ? ep.id : null);
  if (inEp && d.pain != null) {
    const k = dayKey(time);
    const e = { ...(state.days[k] || {}) };
    e.peakPain = Math.max(e.peakPain ?? 0, d.pain);
    state.days[k] = e;
  }
  if (commit()) {
    dropDraft();
    toast('Saved. Check back in 2 hours to say if it helped.');
    go('#today');
  }
}

// ---------- It's gone ----------

const HANGOVER = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'unsure', label: 'Not sure yet' },
];

function viewEnd() {
  const ep = ongoingEpisode(state);
  if (!ep) return bar("It's gone", { back: '#today' }) + card('', '<p>No migraine is going on.</p>');
  const d = useDraft('#end', () => ({ when: 'now', end: toLocalInput(new Date()), hangover: null, ratings: {} }));
  const unrated = state.doses.filter((x) => x.episodeId === ep.id && !x.result && !isDaily(medFor(state, x).kind));
  let h = bar("It's gone", { back: returnTo, cancel: true });
  h += section(
    'When did it stop?',
    chips(
      'when',
      [
        { id: 'now', label: 'Just now' },
        { id: 'pick', label: 'Earlier' },
      ],
      d.when,
      { keep: true },
    ) + (d.when === 'pick' ? timeInput('end', d.end) : ''),
  );
  h += section('Migraine hangover afterwards?', chips('hangover', HANGOVER, d.hangover), 'Tired, foggy or washed out once the pain went. You can change this later.');
  if (unrated.length) {
    const items = unrated
      .map(
        (x) =>
          `<div class="dose"><div class="dose-head"><b>${esc(medLabel(medFor(state, x)))}</b><span class="muted small">${esc(fmtDateTime(x.time))}</span></div>${chips('ratings.' + x.id, RESULTS, (d.ratings || {})[x.id])}</div>`,
      )
      .join('');
    h += section('How did your medicines work?', items, 'Two hours after each dose.');
  }
  return h + saveBar('save-end', 'Save');
}

function saveEnd() {
  const ep = ongoingEpisode(state);
  if (!ep) return go('#today');
  const d = draft;
  const end = d.when === 'now' ? new Date().toISOString() : fromLocalInput(d.end);
  if (!end) return toast('Pick when it stopped.');
  if (end <= ep.start) return toast('The end needs to be after it started.');
  if (new Date(end) - new Date() > 5 * 60000) return toast('The end time is in the future.');
  ep.end = end;
  ep.hangover = d.hangover === 'yes' ? true : d.hangover === 'no' ? false : null;
  for (const [id, r] of Object.entries(d.ratings || {})) {
    const x = state.doses.find((y) => y.id === id);
    if (x && r) {
      x.result = r;
      x.ratedAt = new Date().toISOString();
    }
  }
  if (commit()) {
    dropDraft();
    toast('Saved');
    go('#today');
  }
}

// ---------- One migraine ----------

function viewEpisode(id) {
  const ep = state.episodes.find((e) => e.id === id);
  if (!ep) return notFound();
  const t = today();
  const info = makeIndex(state, t);
  const hours = hoursBetween(ep.start, ep.end || new Date().toISOString());
  const peak = episodePeak(state, ep, info, t);
  const prev = ep.returnOf ? state.episodes.find((e) => e.id === ep.returnOf) : null;
  const doses = state.doses.filter((d) => d.episodeId === id).sort((a, b) => a.time.localeCompare(b.time));
  const syms = episodeSymptoms(state, ep, t);
  const none = muted('Not recorded');
  const list = (ids, src) => (ids.length ? esc(ids.map((x) => labelOf(src, x)).join(', ')) : none);
  const aura = ep.aura
    ? esc([ep.aura.types && ep.aura.types.length ? ep.aura.types.map((x) => labelOf(AURA_TYPES, x)).join(', ') : 'Yes', ep.aura.length ? labelOf(AURA_LENGTHS, ep.aura.length) : ''].filter(Boolean).join(', '))
    : 'No';
  const rows = [
    ['Started', esc(fmtDateTime(ep.start)) + (ep.wokeUp ? ', woke up with it' : '')],
    ['Ended', ep.end ? esc(fmtDateTime(ep.end)) : 'Still going'],
    ['Length', esc(fmtHours(hours)) + (ep.end ? '' : ' so far')],
    ['Worst pain', peak != null ? `${peak} of 10` : none],
    ['Where', list(ep.locations, LOCATIONS)],
    ['Feels like', list(ep.quality, QUALITIES)],
    ['Symptoms', syms.length ? esc(syms.map(symptomLabel).join(', ')) : none],
    ['Aura', aura],
    ['Warning signs', list(ep.warning, WARNING_SIGNS)],
    ['Hangover after', ep.hangover == null ? none : ep.hangover ? 'Yes' : 'No'],
  ];
  if (prev) rows.push(['Came back', `Started again after the one from <a href="#episode/${prev.id}">${esc(fmtDay(episodeStartKey(prev)))}</a> ended`]);

  let h = bar('Migraine', { back: lastMain });
  h += card('', `<table class="facts">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`);
  const days = dayRange(episodeStartKey(ep), episodeEndKey(ep, t))
    .map((k) => {
      const i = info(k);
      const pill = i.level != null ? `<span class="pill lv${i.level}">${esc(LEVELS[i.level].short)}</span>` : '<span class="pill">not rated</span>';
      return `<a class="list-item" href="#day/${k}"><b>${esc(fmtDay(k))}</b> ${pill}${i.peakPain != null ? ` <span class="muted">pain ${i.peakPain}</span>` : ''}</a>`;
    })
    .join('');
  h += card('Day by day', days);
  h += card('Medicines', doses.length ? existingDoses(doses) : '<p class="muted">None recorded.</p>');
  h += `<div class="stack" style="margin:16px 0"><a class="btn" href="#edit/${id}">Edit details</a><button type="button" class="btn danger" data-act="delete-episode" data-id="${id}">Delete this migraine</button></div>`;
  return h;
}

// ---------- Calendar ----------

function episodeItem(e, info, t) {
  const startK = episodeStartKey(e);
  const endK = episodeEndKey(e, t);
  const hours = hoursBetween(e.start, e.end || new Date().toISOString());
  const peak = episodePeak(state, e, info, t);
  const n = state.doses.filter((d) => d.episodeId === e.id).length;
  const bits = [fmtHours(hours), peak != null ? `worst pain ${peak}` : '', e.returnOf ? 'came back' : '', n ? plural(n, 'dose') : ''].filter(Boolean);
  return `<a class="list-item" href="#episode/${e.id}"><b>${esc(fmtDay(startK))}${endK !== startK ? ` to ${esc(fmtDay(endK))}` : ''}</b>${e.end ? '' : ' <span class="pill lv3">going on</span>'}<br><span class="muted">${esc(bits.join(', '))}</span></a>`;
}

function viewCalendar(arg) {
  const t = today();
  const m = arg && /^\d{4}-\d{2}$/.test(arg) ? arg : monthKey(t);
  const info = makeIndex(state, t);
  const { from, to } = monthBounds(m);
  const prevM = addMonths(m, -1);
  const nextM = addMonths(m, 1);

  let cells = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => `<div class="dow">${x}</div>`).join('');
  for (let i = 0; i < parseDay(from).getDay(); i++) cells += '<div class="cell blank"></div>';
  for (const k of dayRange(from, to)) {
    const n = Number(k.slice(8));
    if (k > t) {
      cells += `<div class="cell future">${n}</div>`;
      continue;
    }
    const i = info(k);
    let cls = 'cell';
    if (i.level != null) cls += ` lv${i.level}`;
    else if (i.inEpisode) cls += ' ep';
    if (k === t) cls += ' today';
    const label = [
      fmtDay(k),
      i.level != null ? LEVELS[i.level].label : i.inEpisode ? 'during a migraine, not rated' : 'not filled in',
      i.medDay ? 'medicine taken' : '',
    ]
      .filter(Boolean)
      .join(', ');
    cells += `<button type="button" class="${cls}" data-act="go" data-href="#day/${k}" aria-label="${esc(label)}">${n}${i.medDay ? '<span class="dot"></span>' : ''}</button>`;
  }

  let h = mainBar('Calendar');
  h += `<div class="cal-head"><a class="btn small" href="#calendar/${prevM}">Previous</a><h2>${esc(fmtMonth(m))}</h2>${
    nextM <= monthKey(t) ? `<a class="btn small" href="#calendar/${nextM}">Next</a>` : '<span class="btn small" style="visibility:hidden">Next</span>'
  }</div>`;
  h += `<div class="cal">${cells}</div>`;
  h += `<div class="legend">
    <span><i class="lv0"></i>No migraine</span><span><i class="lv1"></i>Could function</span>
    <span><i class="lv2"></i>Slowed down</span><span><i class="lv3"></i>Had to stop</span>
    <span><i class="ep"></i>Migraine, not rated</span><span><i class="none"></i>Not filled in</span>
    <span><i class="dotkey"></i>Medicine</span>
  </div>`;
  const eps = state.episodes
    .filter((e) => episodeStartKey(e) <= to && episodeEndKey(e, t) >= from)
    .sort((a, b) => b.start.localeCompare(a.start));
  h += card('Migraines this month', eps.length ? eps.map((e) => episodeItem(e, info, t)).join('') : '<p class="muted">None this month.</p>');
  return h;
}

// ---------- Summary ----------

function viewSummary(arg) {
  const t = today();
  let from;
  let to;
  let title;
  let rangeId;
  if (arg && /^\d{4}-\d{2}$/.test(arg)) {
    ({ from, to } = monthBounds(arg));
    title = fmtMonth(arg);
    rangeId = arg;
  } else {
    const n = arg === '30' ? 30 : 90;
    from = addDays(t, -(n - 1));
    to = t;
    title = `Last ${n} days`;
    rangeId = String(n);
  }
  const s = summarize(state, from, to, t);
  lastSummary = { s, title };
  const thisM = monthKey(t);
  const ranges = [
    { id: '30', label: 'Last 30 days' },
    { id: '90', label: 'Last 90 days' },
    { id: thisM, label: 'This month' },
    { id: addMonths(thisM, -1), label: 'Last month' },
  ];

  let h = mainBar('Summary');
  h += `<div class="chips no-print" style="margin-top:14px">${ranges
    .map((r) => `<a class="chip${r.id === rangeId ? ' on' : ''}" href="#summary/${r.id}">${r.label}</a>`)
    .join('')}</div>`;

  const young = trackingStart(state) > addDays(t, -27);
  h += card(
    esc(title),
    `<p class="print-only small muted">Migraine Diary, printed ${esc(fmtDay(t, { year: true }))}</p>
    <p class="muted">${esc(fmtDay(s.from, { year: true }))} to ${esc(fmtDay(s.to, { year: true }))}. ${s.recorded} of ${plural(s.tracked, 'day')} recorded.</p>
    ${young ? '<div class="note">The diary is less than 4 weeks old. Doctors usually want at least a month of entries, and three is better.</div>' : ''}
    ${!young && s.coverage < 0.9 ? '<div class="note warn">Some days are not filled in, so these counts may be low.</div>' : ''}`,
  );

  const long = s.tracked > 31;
  h += card(
    'Key numbers',
    `<div class="stats">${stat(s.migraineDays, 'migraine days')}${stat(s.medDays, 'medicine days')}${stat(s.levels[3], 'had to stop or in bed')}</div>
    ${long ? `<p class="muted small">About ${round1(s.migrainePer30)} migraine days and ${round1(s.medPer30)} medicine days a month.</p>` : ''}
    ${s.missed ? `<p class="muted small">Missed work, school or plans on ${plural(s.missed, 'day')}.</p>` : ''}
    ${
      s.migrainePer30 >= 4 && s.tracked >= 28
        ? '<div class="note warn">That is 4 or more migraine days a month. A 2026 guideline from the American Academy of Neurology and the American Headache Society says doctors should offer preventive treatment at this level. Worth discussing at your next visit.</div>'
        : ''
    }`,
  );

  const months = s.months.filter((m) => m.tracked > 0);
  if (months.length) {
    const rows = months
      .map(
        (m) =>
          `<tr><td><a href="#summary/${m.month}">${esc(fmtMonth(m.month, { short: true }))}</a></td><td class="n">${m.migraine}</td><td class="n">${m.medDays}</td><td class="n">${m.recorded} of ${m.tracked}</td></tr>`,
      )
      .join('');
    h += card(
      'Month by month',
      `<div class="scroll-x"><table class="facts"><thead><tr><th>Month</th><th class="n">Migraine days</th><th class="n">Medicine days</th><th class="n">Recorded</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    );
  }

  const fact = (k, v) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`;
  const dash = muted('-');
  h += card(
    'Migraines',
    `<table class="facts">
      ${fact('Migraines started', `${s.episodes.length}${s.ongoing ? ` (${s.ongoing} still going)` : ''}`)}
      ${fact('Came back after a medicine had made it go', s.cameBackDoses ? plural(s.cameBackDoses, 'time') : 'None')}
      ${fact('Started again within 48 hours of ending', s.returns || 'None')}
      ${fact('Average length', s.avgHours != null ? esc(fmtHours(s.avgHours)) : dash)}
      ${fact('Longest', s.longestHours != null ? esc(fmtHours(s.longestHours)) : dash)}
      ${fact('Average worst pain', s.avgPeak != null ? `${round1(s.avgPeak)} of 10` : dash)}
      ${fact('Worst pain', s.worstPain ?? dash)}
      ${fact('Days you could function', s.levels[1])}
      ${fact('Days you slowed down', s.levels[2])}
      ${fact('Days you had to stop or stay in bed', s.levels[3])}
      ${s.levels.unrated ? fact('Migraine days not rated', s.levels.unrated) : ''}
    </table>`,
  );

  if (s.meds.length) {
    const rated = (a, b) => (b ? `${a} of ${b}` : dash);
    const t1 = s.meds
      .map(
        (m) =>
          `<tr><td>${esc(medLabel(m.med))}<br><span class="muted small">${plural(m.days, 'day')}${m.redosed ? `, re-dosed ${plural(m.redosed, 'time')}` : ''}</span></td><td class="n">${m.doses}</td><td class="n">${rated(m.gone, m.rated)}</td><td class="n">${m.cameBack}</td></tr>`,
      )
      .join('');
    const t2 = s.meds
      .filter((m) => m.early.n || m.later.n)
      .map((m) => `<tr><td>${esc(medLabel(m.med))}</td><td class="n">${rated(m.early.gone, m.early.n)}</td><td class="n">${rated(m.later.gone, m.later.n)}</td></tr>`)
      .join('');
    h += card(
      'Medicines',
      `<div class="scroll-x"><table class="facts"><thead><tr><th>Medicine</th><th class="n">Doses</th><th class="n">Gone at 2 h</th><th class="n">Came back</th></tr></thead><tbody>${t1}</tbody></table></div>
      ${t2 ? `<div class="sub"><h3>Gone at 2 hours, by pain when taken</h3><div class="scroll-x"><table class="facts"><thead><tr><th>Medicine</th><th class="n">Pain 0-3</th><th class="n">Pain 4+</th></tr></thead><tbody>${t2}</tbody></table></div></div>` : ''}
      <p class="hint">Gone means pain-free 2 hours after the dose. Came back means it returned within 24 hours after going. Some trials found triptans work better when taken while pain is still mild.</p>`,
    );
  }

  const n = s.episodes.length;
  if (n) {
    const ranked = (counts, label) =>
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([id, c]) => barRow(label(id), c, n))
        .join('');
    let body = `<div class="sub"><h3>Side</h3>${barRow('Left side only', s.sides.left, n)}${barRow('Right side only', s.sides.right, n)}${barRow('Both sides', s.sides.both, n)}${barRow('Middle only', s.sides.middle, n)}</div>`;
    if (Object.keys(s.locations).length) body += `<div class="sub"><h3>Where</h3>${ranked(s.locations, (id) => labelOf(LOCATIONS, id))}</div>`;
    if (Object.keys(s.qualities).length) body += `<div class="sub"><h3>Feels like</h3>${ranked(s.qualities, (id) => labelOf(QUALITIES, id))}</div>`;
    if (Object.keys(s.symptoms).length) body += `<div class="sub"><h3>Symptoms</h3>${ranked(s.symptoms, symptomLabel)}</div>`;
    if (Object.keys(s.warning).length) body += `<div class="sub"><h3>Warning signs</h3>${ranked(s.warning, (id) => labelOf(WARNING_SIGNS, id))}</div>`;
    body += `<div class="sub"><h3>Aura</h3><p>${s.aura.count} of ${plural(n, 'migraine')}${
      Object.keys(s.aura.types).length ? `: ${esc(Object.keys(s.aura.types).map((id) => labelOf(AURA_TYPES, id)).join(', '))}` : ''
    }</p></div>`;
    if (s.hangover.asked) body += `<div class="sub"><h3>Hangover afterwards</h3><p>${s.hangover.yes} of ${s.hangover.asked} answered</p></div>`;
    h += card(`What your migraines are like <span class="muted small">(${plural(n, 'migraine')})</span>`, body);
  }

  if (state.settings.trackHabits) {
    const any = s.habits.some((hb) => hb.total > 0);
    const body = any
      ? s.habits
          .map((hb) => {
            const inner =
              hb.total < 7
                ? `<p class="muted small">${plural(hb.total, 'day')} so far. Patterns need at least a week or two.</p>`
                : hb.rows
                    .filter((r) => r.days)
                    .map((r) => barRow(`${r.label} (${plural(r.days, 'day')})`, r.migraine, r.days, `${pct(r.migraine, r.days)}%`))
                    .join('');
            return `<div class="sub"><h3>${esc(hb.label)}</h3>${inner}</div>`;
          })
          .join('') + '<p class="hint">Share of those days that were migraine days. These are patterns, not proof, so talk them over with your doctor rather than cutting things out on your own.</p>'
      : '<p class="muted">No habit taps yet.</p>';
    h += card('Habits and migraine days', body);
  }

  for (const p of s.preventives) {
    const rate = (r) => (r.perMonth != null ? round1(r.perMonth) : '-');
    const body = p.med.startedOn
      ? `<p>Started ${esc(fmtDay(p.start, { year: true }))}. Taken on ${p.taken} of ${plural(p.withEntry, 'day')} recorded.</p>
      <p>Migraine days a month: ${rate(p.before)} before, ${rate(p.after)} recently${p.change != null ? ` (${p.change <= 0 ? 'down' : 'up'} ${Math.abs(Math.round(p.change * 100))}%)` : ''}.</p>
      <p class="hint">A drop of 50% or more is the usual goal for a preventive.${p.change == null ? ' The comparison needs at least 2 weeks of diary before and after starting.' : ''}</p>`
      : `<p>Taken on ${p.taken} of ${plural(p.withEntry, 'day')} recorded since ${esc(fmtDay(p.start, { year: true }))}.</p>
      <p class="hint">No start date, so there is no before-and-after comparison. If you start taking it every day, add the start date in Settings.</p>`;
    h += card(esc(medLabel(p.med)), body);
  }

  if (s.midas) {
    const g = midasGrade(s.midas.score);
    h += card('MIDAS score', `<p><b>${s.midas.score}</b>, grade ${g.grade}: ${esc(g.label)}. Filled in ${esc(fmtDay(s.midas.date, { year: true }))}.</p>`);
  }

  if (s.stopped.length) {
    h += card('Medicines stopped', `<ul class="plain">${s.stopped.map((m) => `<li>${esc(medLabel(m))}${m.brand ? ` (${esc(m.brand)})` : ''}</li>`).join('')}</ul>`);
  }

  h += `<div class="stack no-print" style="margin:16px 0">
    <button type="button" class="btn" data-act="save-pdf">Save or print as PDF</button>
    <button type="button" class="btn" data-act="share-summary">Share as text</button>
    <p class="hint">The PDF and text also say, for your doctor, whether medicine days are at a level where rebound headache is possible.</p>
    <a class="btn" href="#midas">Fill in the MIDAS questionnaire</a>
  </div>`;
  return h;
}

// ---------- Settings ----------

function viewSettings() {
  const meds = state.settings.meds;
  const medRow = (m) =>
    `<a class="list-item" href="#med/${m.id}"><b>${esc(medLabel(m))}</b><br><span class="muted">${esc((MED_KINDS[m.kind] || {}).label || m.kind)}${m.brand ? `, ${esc(m.brand)}` : ''}</span></a>`;
  const active = meds.filter((m) => m.active);
  const stopped = meds.filter((m) => !m.active);
  let h = mainBar('Settings');
  h += card(
    'Medicines',
    `${active.map(medRow).join('')}<a class="btn" href="#med/new" style="margin-top:12px">Add a medicine</a>${
      stopped.length ? `<p class="med-group">No longer taking</p>${stopped.map(medRow).join('')}` : ''
    }`,
  );
  h += card(
    'Symptom buttons',
    `<p class="hint">Turn off any you never get. Past entries keep them.</p>${state.settings.symptoms
      .map((s) => switchRow('', !s.hidden, s.label, 'symptom-flip', ` data-id="${s.id}"`))
      .join('')}<div class="row2" style="margin-top:12px;grid-template-columns:1fr auto"><input id="new-symptom" type="text" placeholder="Add a symptom" maxlength="40" autocomplete="off"><button type="button" class="btn small" data-act="symptom-add">Add</button></div>`,
  );
  h += card(
    'Optional parts',
    switchRow('trackHabits', state.settings.trackHabits, 'Habit taps: sleep, meals, caffeine', 'setting-flip'),
  );
  h += card('Daily reminder', reminderSteps());
  const last = state.settings.lastBackup;
  h += card(
    'Backup and export',
    `<p class="muted">${last ? `Last backup: ${esc(fmtDateTime(last))}.` : 'No backup saved yet.'} Save the file to iCloud Drive or Files. To move to a new phone, load it there.</p>
    <div class="stack">
      <button type="button" class="btn" data-act="backup-save">Save backup file</button>
      <button type="button" class="btn" data-act="backup-load">Load a backup file</button>
      <button type="button" class="btn" data-act="export-csv">Export spreadsheet files</button>
    </div>
    <p class="hint">The spreadsheet export makes three CSV files (days, doses, migraines) that open in Numbers or Excel.</p>`,
  );
  h += card('Help', `<a class="list-item" href="#help">When to get medical help</a><a class="list-item" href="#help">Adding the app to your home screen</a>`);
  h += card(
    'About',
    `<p class="muted">Your diary is stored only on this phone, inside this app. Nothing is sent anywhere. Version ${VERSION}.</p><button type="button" class="btn danger" data-act="erase-all" style="margin-top:12px">Erase everything</button>`,
  );
  return h;
}

function viewMed(id) {
  const existing = id && id !== 'new' ? med(id) : null;
  if (id !== 'new' && !existing) return notFound();
  const d = useDraft('#med/' + id, () =>
    existing
      ? { name: existing.name, dose: existing.dose || '', brand: existing.brand || '', kind: existing.kind, startedOn: existing.startedOn || '', active: existing.active }
      : { name: '', dose: '', brand: '', kind: null, startedOn: '', active: true },
  );
  const used = existing && (state.doses.some((x) => x.medId === id) || Object.values(state.days).some((e) => e.preventive && e.preventive[id]));
  const kinds = Object.entries(MED_KINDS)
    .map(
      ([k, v]) =>
        `<button type="button" class="med-btn${d.kind === k ? ' on' : ''}" data-act="pick" data-field="kind" data-val="${k}" data-keep="1" aria-pressed="${d.kind === k}"><span>${esc(v.label)}<br><small>${esc(v.hint)}</small></span></button>`,
    )
    .join('');
  let h = bar(existing ? 'Edit medicine' : 'Add a medicine', { back: '#settings', cancel: true });
  h += section('Name', textInput('name', d.name, 'For example, Sumatriptan'));
  h += section('Dose', textInput('dose', d.dose, 'For example, 50 mg', 'none'), 'Optional. If you take different strengths, add each one separately.');
  h += section('Brand or note', textInput('brand', d.brand, 'For example, Imitrex'), 'Optional.');
  h += section('Type', `<div class="med-list">${kinds}</div>`, 'The type groups your medicines here and in the summary you export for your doctor.');
  if (d.kind === 'preventive') {
    h += section('Started on', `<input type="date" data-bind="startedOn" value="${esc(d.startedOn)}">`, 'Used to compare migraine days before and after you started it.');
  }
  if (existing) h += section('Still taking it?', switchRow('active', d.active, 'Still taking it'), 'Medicines you stop stay in your history and the summary.');
  if (existing && !used) h += `<button type="button" class="btn danger" data-act="med-delete" data-id="${id}" style="margin-top:18px">Delete this medicine</button>`;
  return h + saveBar('save-med', 'Save', ` data-id="${id}"`);
}

function saveMed(el) {
  const id = el.dataset.id;
  const d = draft;
  const name = (d.name || '').trim();
  if (!name) return toast('Add a name.');
  if (!d.kind) return toast('Pick a type.');
  const values = {
    name,
    dose: (d.dose || '').trim(),
    brand: (d.brand || '').trim(),
    kind: d.kind,
    startedOn: d.kind === 'preventive' ? d.startedOn || null : null,
    active: d.active !== false,
  };
  if (id === 'new') state.settings.meds.push({ id: newId(), ...values });
  else Object.assign(med(id), values);
  if (commit()) {
    dropDraft();
    toast('Saved');
    go('#settings');
  }
}

// ---------- MIDAS ----------

function viewMidas() {
  const t = today();
  const s = summarize(state, addDays(t, -89), t, t);
  const d = useDraft('#midas', () => ({
    q: [null, null, null, null, null],
    a: s.migraineDays || null,
    b: s.avgDayPain != null ? Math.round(s.avgDayPain) : null,
  }));
  let h = bar('MIDAS', { back: '#summary', cancel: true });
  h += '<p class="hint" style="margin-top:14px">Five questions about the last 3 months. Write 0 if one does not apply. Doctors use the score to see how much migraine affects your life, and the change between visits matters most.</p>';
  MIDAS_QUESTIONS.forEach((q, i) => {
    h += section(`${i + 1}. ${esc(q)}`, numInput(`q.${i}`, d.q[i]));
  });
  h += section(
    `A. ${esc(MIDAS_EXTRA[0])}`,
    numInput('a', d.a),
    `Your diary shows ${plural(s.migraineDays, 'migraine day')} in the last 90 days${s.coverage < 0.9 ? ', though some days are not filled in' : ''}.`,
  );
  h += section(`B. ${esc(MIDAS_EXTRA[1])}`, numInput('b', d.b, 10), s.avgDayPain != null ? `Your diary's average worst pain on migraine days is ${round1(s.avgDayPain)}.` : '');
  const past = state.midas.slice().sort((a, b) => b.date.localeCompare(a.date));
  if (past.length) {
    h += section(
      'Past scores',
      `<table class="facts">${past.map((m) => `<tr><td>${esc(fmtDay(m.date, { year: true }))}</td><td class="n">${m.score}, grade ${midasGrade(m.score).grade}</td></tr>`).join('')}</table>`,
    );
  }
  h += '<p class="hint small" style="margin:14px 0">MIDAS questionnaire copyright Innovative Medical Research, 1997.</p>';
  return h + saveBar('save-midas', 'Save score');
}

function saveMidas() {
  const d = draft;
  if (d.q.some((v) => v == null || isNaN(v) || v < 0)) return toast('Answer all five questions. Write 0 if one does not apply.');
  const score = d.q.reduce((a, b) => a + b, 0);
  state.midas.push({ date: today(), answers: d.q, headacheDays: d.a, avgPain: d.b, score });
  if (commit()) {
    dropDraft();
    const g = midasGrade(score);
    toast(`Score ${score}: ${g.label}`);
    go('#summary');
  }
}

// ---------- Help ----------

function viewHelp() {
  let h = bar('Help', { back: lastMain });
  h += card(
    'Get emergency care now for',
    `<ul class="plain">
      <li>A sudden, severe headache that peaks within a minute, or the worst headache of your life</li>
      <li>A headache with fever and a stiff neck</li>
      <li>Confusion, fainting or a seizure</li>
      <li>Weakness or numbness on one side, a drooping face, or trouble speaking, if it is new or different from your usual aura</li>
      <li>Loss of vision</li>
      <li>A headache after a blow to the head</li>
    </ul><p class="hint">Call 911 or go to the emergency room.</p>`,
    'note danger',
  );
  h += card(
    'Call your doctor soon if',
    `<ul class="plain">
      <li>A migraine lasts more than 3 days (72 hours)</li>
      <li>Your migraines change pattern or become much more frequent</li>
      <li>Your usual medicine stops working</li>
      <li>You have 4 or more migraine days a month and no preventive</li>
    </ul><p class="hint">General information, not medical advice.</p>`,
  );
  h += card(
    'Adding to your home screen',
    `${installSteps()}<p class="hint">Open the diary from the home screen icon, not from Safari. Safari keeps a separate copy, so entries made there won't show up in the app.</p>`,
  );
  h += card('A daily reminder', reminderSteps());
  return h;
}

// ---------- files ----------

async function shareFiles(files, title) {
  try {
    if (navigator.canShare && navigator.canShare({ files })) {
      await navigator.share({ files, title });
      return true;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return false;
  }
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return true;
}

restoreInput.addEventListener('change', async () => {
  const file = restoreInput.files && restoreInput.files[0];
  if (!file) return;
  try {
    const next = parseBackup(await file.text());
    const msg = `Replace this diary with the backup? The backup has ${plural(next.episodes.length, 'migraine')} and ${plural(Object.keys(next.days).length, 'rated day')}. What is on this phone now will be replaced.`;
    if (!window.confirm(msg)) return;
    state = next;
    loadProblem = false;
    if (commit()) {
      dropDraft();
      toast('Backup loaded');
      go('#today');
    }
  } catch (err) {
    toast(err.message);
  } finally {
    restoreInput.value = '';
  }
});

// ---------- taps ----------

function parseVal(el) {
  const v = el.dataset.val;
  if (el.dataset.num) return Number(v);
  if (el.dataset.bool) return v === 'true';
  return v;
}

const ACTIONS = {
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
  'pick-med': (el) => {
    draft.medId = el.dataset.med;
    storeDraft();
    render();
  },
  'add-dose': (el) => {
    const d = draft;
    if (!d) return;
    let time;
    let pain;
    if (d.route === '#new') {
      time = d.startMode === 'pick' && d.stillGoing === false ? d.start : toLocalInput(new Date());
      pain = d.pain;
    } else {
      time = d.key === today() ? toLocalInput(new Date()) : `${d.key}T12:00`;
      pain = d.peakPain;
    }
    d.doses.push({ medId: el.dataset.med, time, pain: pain ?? null });
    storeDraft();
    render();
  },
  'remove-dose': (el) => {
    draft.doses.splice(Number(el.dataset.i), 1);
    storeDraft();
    render();
  },
  'delete-dose': (el) => {
    if (!window.confirm('Delete this dose?')) return;
    state.doses = state.doses.filter((d) => d.id !== el.dataset.dose);
    commit();
    render();
  },
  rate: (el) => {
    const d = state.doses.find((x) => x.id === el.dataset.dose);
    if (!d) return;
    d.result = d.result === el.dataset.val ? null : el.dataset.val;
    d.ratedAt = d.result ? new Date().toISOString() : null;
    commit();
    render();
  },
  'quick-level': (el) => {
    const key = el.dataset.day;
    const level = Number(el.dataset.level);
    const t = today();
    const i = makeIndex(state, t)(key);
    if (level >= 1 && !i.inEpisode) {
      startDraft('#new', newDefaults(formForDay(key, t, { level })));
      return go('#new');
    }
    discardDraft('#day/' + key);
    state.days[key] = { ...(state.days[key] || {}), level };
    if (commit()) toast(`Saved ${fmtDay(key)}`);
    render();
  },
  'save-new': saveNew,
  'save-edit': saveEdit,
  'save-day': saveDay,
  'save-dose': saveDose,
  'save-end': saveEnd,
  'save-med': saveMed,
  'save-midas': saveMidas,
  'delete-episode': (el) => {
    const id = el.dataset.id;
    if (!window.confirm('Delete this migraine and its medicine doses? Your day ratings stay.')) return;
    state.episodes = state.episodes.filter((e) => e.id !== id);
    state.doses = state.doses.filter((d) => d.episodeId !== id);
    for (const e of state.episodes) if (e.returnOf === id) e.returnOf = null;
    if (commit()) {
      toast('Deleted');
      go(lastMain);
    }
  },
  'med-delete': (el) => {
    if (!window.confirm('Delete this medicine?')) return;
    state.settings.meds = state.settings.meds.filter((m) => m.id !== el.dataset.id);
    if (commit()) {
      dropDraft();
      go('#settings');
    }
  },
  'daily-med': (el) => {
    const key = el.dataset.day;
    const id = el.dataset.med;
    const e = { ...(state.days[key] || {}) };
    const taken = { ...(e.preventive || {}) };
    if (taken[id]) delete taken[id];
    else taken[id] = true;
    e.preventive = taken;
    putDay(key, e);
    discardDraft('#day/' + key);
    commit();
    render();
  },
  'symptom-flip': (el) => {
    const s = state.settings.symptoms.find((x) => x.id === el.dataset.id);
    if (!s) return;
    s.hidden = !s.hidden;
    commit();
    render();
  },
  'symptom-add': () => {
    const input = document.getElementById('new-symptom');
    const label = input.value.trim();
    if (!label) return;
    if (state.settings.symptoms.some((s) => s.label.toLowerCase() === label.toLowerCase())) return toast('That one is already on the list.');
    state.settings.symptoms.push({ id: 'c-' + newId(), label, hidden: false });
    if (commit()) toast('Added');
    render();
  },
  'setting-flip': (el) => {
    const k = el.dataset.field;
    state.settings[k] = !state.settings[k];
    commit();
    render();
  },
  'backup-save': async () => {
    const name = `migraine-diary-backup-${today()}`;
    const text = backupText(state);
    let file = new File([text], `${name}.json`, { type: 'application/json' });
    // Some phones only share common file types, so fall back to plain text.
    if (navigator.canShare && !navigator.canShare({ files: [file] })) file = new File([text], `${name}.txt`, { type: 'text/plain' });
    if (await shareFiles([file], 'Migraine Diary backup')) {
      state.settings.lastBackup = new Date().toISOString();
      commit();
      render();
    }
  },
  'backup-load': () => restoreInput.click(),
  'export-csv': async () => {
    const t = today();
    const files = [
      new File([daysCsv(state, t)], `migraine-days-${t}.csv`, { type: 'text/csv' }),
      new File([dosesCsv(state)], `migraine-doses-${t}.csv`, { type: 'text/csv' }),
      new File([migrainesCsv(state, t)], `migraines-${t}.csv`, { type: 'text/csv' }),
    ];
    await shareFiles(files, 'Migraine Diary spreadsheets');
  },
  'save-pdf': async () => {
    if (!lastSummary) return;
    const t = today();
    const blocks = summaryBlocks(state, lastSummary.s, lastSummary.title, t);
    const bytes = makePdf(blocks, { title: `Migraine Diary summary: ${lastSummary.title}`, footer: `Migraine Diary, made ${fmtDay(t, { year: true })}` });
    await shareFiles([new File([bytes], `migraine-summary-${t}.pdf`, { type: 'application/pdf' })], 'Migraine summary');
  },
  'share-summary': async () => {
    if (!lastSummary) return;
    const text = blocksToText(summaryBlocks(state, lastSummary.s, lastSummary.title, today()));
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Migraine summary', text });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Summary copied. Paste it into a message or email.');
    } catch {
      toast('Sharing is not available here.');
    }
  },
  'erase-all': () => {
    if (!window.confirm('Erase everything in this diary? This cannot be undone.')) return;
    if (!window.confirm('Are you sure? Save a backup first if you might want it later.')) return;
    state = freshState();
    loadProblem = false;
    dropDraft();
    if (commit()) toast('Diary erased');
    go('#today');
  },
};

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  ev.preventDefault();
  fn(el, ev);
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

window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) render();
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
