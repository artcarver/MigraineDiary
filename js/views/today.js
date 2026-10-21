// The Today tab: the migraine going on (or a button to start one), one-tap
// medicine logging, the daily check-in, and nudges for blank days and backups.

import { LEVELS } from '../defaults.js';
import { dayKey, diffDays, monthKey, monthBounds, toLocalInput, hoursBetween, fmtTime, fmtDay, fmtDateTime, fmtMonth, fmtHours, fmtAgo } from '../dates.js';
import { state, loadProblem, preventiveMeds, addDose, episodeFor, putDay, commit, discardDraft, startDraft } from '../model.js';
import {
  makeIndex,
  summarize,
  missingDays,
  dosesToRate,
  ongoingEpisode,
  episodeDayNumber,
  medFor,
  medLabel,
  trackingStart,
  medUse,
} from '../stats.js';
import { card, mainBar, stat, switchRow, painPicker, rateButtons, installSteps, toast } from '../ui.js';
import { medButtons } from '../widgets.js';
import { go, render } from '../router.js';
import { esc, plural, HOUR } from '../util.js';
import { newDefaults, formForDay } from './migraine.js';

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const isStandalone = () => navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

// The dose just logged with one tap, so its panel can ask for the pain level
// and offer Undo. Forgotten after 15 minutes or when dismissed.
let recent = null;

function recentDose(now) {
  if (recent && now - recent.at < 15 * 60000) {
    const d = state.doses.find((x) => x.id === recent.id);
    if (d) return d;
  }
  recent = null;
  return null;
}

function viewToday() {
  const now = new Date();
  const t = dayKey(now);
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
  h += medsCard(now, ep);
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
  return `<section class="card ongoing">
    <p class="eyebrow">Migraine going on</p>
    <h2>Since ${esc(fmtDateTime(ep.start))}</h2>
    <p class="muted">Day ${episodeDayNumber(ep, t)}, ${esc(fmtHours(hours))} so far</p>
    ${hours > 72 ? `<div class="note warn"><b>This migraine has lasted more than 3 days.</b> That is long enough to call your doctor about. <a href="#help">When to get help</a></div>` : ''}
    <div class="stack">
      <div class="row2">
        <button type="button" class="btn${done ? '' : ' primary'}" data-act="go" data-href="#day/${t}">${done ? 'Edit today' : 'Update today'}</button>
        <button type="button" class="btn" data-act="go" data-href="#end">It's gone</button>
      </div>
      <a class="link" href="#episode/${ep.id}">See this migraine</a>
    </div>
  </section>`;
}

// One tap logs a dose now. The last dose and today's count are shown as plain
// facts, with no limits.
function medsCard(now, ep) {
  const use = medUse(state, now);
  const d = recentDose(now);
  let h = '<section class="card"><div class="card-head"><h2>Took a medicine</h2><a class="link" href="#meds">History</a></div>';
  if (d) h += loggedPanel(d, ep);
  else if (use.last) {
    const sameDay = dayKey(use.last.time) === use.day;
    const when = sameDay ? `at ${fmtTime(use.last.time)}` : `on ${fmtDateTime(use.last.time)}`;
    h += `<p class="last-dose">Last dose: <b>${esc(medLabel(medFor(state, use.last)))}</b> ${esc(when)}, ${esc(fmtAgo(use.last.time, now))}.${use.today ? ` ${plural(use.today, 'dose')} today.` : ''}</p>`;
  }
  h += medButtons('quick-dose', undefined, { compact: true });
  h += `<p class="hint">A tap logs it now${ep ? ' as part of this migraine' : ''}. <a href="#dose">Took it earlier?</a></p>`;
  return h + '</section>';
}

function loggedPanel(d, ep) {
  const m = medFor(state, d);
  const askPain = m.kind !== 'allergy' || d.episodeId;
  const offerStart = !ep && m.kind !== 'allergy';
  return `<div class="logged">
    <div class="card-head"><b>Logged ${esc(medLabel(m))} at ${esc(fmtTime(d.time))}</b><button type="button" class="link" data-act="undo-dose" data-dose="${d.id}">Undo</button></div>
    ${askPain ? `<p class="small muted">Pain right now? Optional. Over time it shows whether taking it early works better.</p>${painPicker('', d.pain, { act: 'dose-pain', attrs: ` data-dose="${d.id}"`, key: false })}` : ''}
    ${offerStart ? `<button type="button" class="btn" data-act="start-from-dose" data-dose="${d.id}">For a migraine? Start an entry</button>` : ''}
    <div class="card-head"><a class="link" href="#dose/${d.id}">Change time or details</a><button type="button" class="link" data-act="logged-done">Done</button></div>
  </div>`;
}

function rateCard(now) {
  const list = dosesToRate(state, now)
    .filter((d) => now - new Date(d.time) < 72 * HOUR)
    .slice(-6);
  if (!list.length) return '';
  const items = list
    .map(
      (d) =>
        `<div class="dose"><div class="dose-head"><b>${esc(medLabel(medFor(state, d)))}</b><span class="muted small">${esc(fmtDateTime(d.time))}</span></div>${d.pain != null ? `<p class="small muted">Pain when taken: ${d.pain}</p>` : ''}${rateButtons(d, { skip: true })}</div>`,
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
    return `<section class="card"><div class="card-head"><span>Today: <span class="pill lv${e.level}">${esc(LEVELS[e.level].label)}</span></span><a class="link" href="#day/${t}">Edit</a></div>${needsHabits ? `<a class="link" href="#day/${t}">Add sleep, meals and caffeine</a>` : ''}</section>`;
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
  const word = (n, one, many) => (n === 1 ? one : many);
  return `<section class="card"><div class="card-head"><h2>${esc(fmtMonth(m).split(' ')[0])} so far</h2><a class="link" href="#summary">Summary</a></div>
    <div class="stats">${stat(s.migraineDays, word(s.migraineDays, 'migraine day', 'migraine days'))}${stat(s.medDays, word(s.medDays, 'medicine day', 'medicine days'))}${stat(s.doseCount, word(s.doseCount, 'dose taken', 'doses taken'))}</div></section>`;
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

const findDose = (el) => state.doses.find((x) => x.id === el.dataset.dose);

export const views = { today: viewToday };

export const actions = {
  'quick-dose': (el) => {
    const now = new Date().toISOString();
    const ep = episodeFor(now);
    const d = addDose(el.dataset.med, now, null, ep ? ep.id : null);
    if (commit()) recent = { id: d.id, at: Date.now() };
    render();
  },
  'dose-pain': (el) => {
    const d = findDose(el);
    if (!d) return;
    const v = Number(el.dataset.val);
    d.pain = d.pain === v ? null : v;
    commit();
    render();
  },
  'undo-dose': (el) => {
    state.doses = state.doses.filter((x) => x.id !== el.dataset.dose);
    recent = null;
    if (commit()) toast('Dose removed');
    render();
  },
  'logged-done': () => {
    recent = null;
    render();
  },
  // Taking a migraine medicine with no migraine entry open: start one from
  // the time of the dose, with the dose already part of it.
  'start-from-dose': (el) => {
    const d = findDose(el);
    if (!d) return;
    recent = null;
    startDraft('#new', newDefaults({ startMode: 'pick', start: toLocalInput(d.time), stillGoing: true, pain: d.pain, linkDose: d.id }));
    go('#new');
  },
  'quick-level': (el) => {
    const key = el.dataset.day;
    const level = Number(el.dataset.level);
    const t = dayKey(new Date());
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
};
