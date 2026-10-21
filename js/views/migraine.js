// One migraine: starting it, editing it, ending it, and its own page.

import { QUALITIES, LOCATIONS, WARNING_SIGNS, AURA_TYPES, AURA_LENGTHS, LEVELS, RESULTS } from '../defaults.js';
import { dayKey, todayKey, dayRange, toLocalInput, fromLocalInput, hoursBetween, fmtDay, fmtDateTime, fmtTime, fmtHours } from '../dates.js';
import { newId } from '../store.js';
import { state, draft, med, addDose, putDay, commit, useDraft, dropDraft, symptomLabel, visibleSymptoms } from '../model.js';
import {
  makeIndex,
  recentlyEnded,
  ongoingEpisode,
  episodeStartKey,
  episodeEndKey,
  episodePeak,
  episodeSymptoms,
  medFor,
  medLabel,
  isDaily,
} from '../stats.js';
import { YES_NO, bar, card, section, chips, painPicker, levelPicker, switchRow, timeInput, saveBar, faceSvg, muted, toast } from '../ui.js';
import { doseEditor, existingDoses, extras } from '../widgets.js';
import { go, nav } from '../router.js';
import { esc, labelOf } from '../util.js';

export function newDefaults(extra = {}) {
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
    more: false,
    linkDose: null,
    ...extra,
  };
}

// The migraine form opened from a day rating: ask when it started rather than
// assuming it began just now.
export function formForDay(key, t, extra) {
  return key === t
    ? { startMode: 'pick', stillGoing: true, ...extra }
    : { startMode: 'pick', start: `${key}T12:00`, stillGoing: false, end: `${key}T20:00`, ...extra };
}

function draftStartIso(d) {
  return d.startMode === 'now' ? new Date().toISOString() : fromLocalInput(d.start);
}

function viewNew() {
  const ongoing = ongoingEpisode(state);
  const d = useDraft('#new', () => newDefaults(ongoing ? { startMode: 'pick', stillGoing: false } : {}));
  return bar('New migraine', { back: nav.returnTo, cancel: true }) + migraineForm(d, null, ongoing) + saveBar('save-new', 'Save migraine');
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

// A new migraine asks only what matters in the moment: when, how bad, and any
// medicine. The rest sits behind "Add more details" and can be filled in later.
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

  if (!editing) {
    const linked = d.linkDose && state.doses.find((x) => x.id === d.linkDose);
    const already = linked ? `<p class="small muted">Already logged: ${esc(medLabel(medFor(state, linked)))} at ${esc(fmtTime(linked.time))}.</p>` : '';
    h += section('Medicines taken', already + doseEditor(d), 'Tap a medicine each time you take a dose.');
    h += section(
      ended ? 'How did it affect that day?' : 'How is it affecting today?',
      levelPicker('level', d.level, { none: false }) + switchRow('missed', d.missed, 'Missed work, school or plans'),
    );
  }

  if (!editing && !d.more) {
    const habits = state.settings.trackHabits ? ', sleep, meals and caffeine' : '';
    return (
      h +
      `<div class="more"><button type="button" class="btn" data-act="flip" data-field="more">Add more details</button><p class="hint">Where it hurts, what it feels like, symptoms, aura and warning signs${habits}. Optional, and you can add them later from the migraine's page.</p></div>`
    );
  }

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
  if (!editing) h += extras(d);
  return h;
}

function mergeExtras(e, d) {
  const habits = Object.fromEntries(Object.entries(d.habits || {}).filter(([, v]) => v != null));
  if (Object.keys(habits).length) e.habits = { ...(e.habits || {}), ...habits };
  const prev = Object.fromEntries(Object.entries(d.preventive || {}).filter(([, v]) => v));
  if (Object.keys(prev).length) e.preventive = { ...(e.preventive || {}), ...prev };
}

const FUTURE = 5 * 60000;

function saveNew() {
  const d = draft;
  const now = new Date();
  const start = draftStartIso(d);
  if (!start) return toast('Pick when it started.');
  if (new Date(start) - now > FUTURE) return toast('The start time is in the future.');
  const ended = d.startMode === 'pick' && d.stillGoing === false;
  const end = ended ? fromLocalInput(d.end) : null;
  if (ended && !end) return toast('Pick when it ended.');
  if (end && end <= start) return toast('The end time needs to be after the start.');
  if (end && new Date(end) - now > FUTURE) return toast('The end time is in the future.');
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
  const linked = d.linkDose && state.doses.find((x) => x.id === d.linkDose);
  if (linked && !linked.episodeId) linked.episodeId = ep.id;

  const key = ended ? dayKey(start) : todayKey();
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
    go(ended ? nav.returnTo : '#today');
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
  if (new Date(start) - now > FUTURE) return toast('The start time is in the future.');
  const end = d.stillGoing ? null : fromLocalInput(d.end);
  if (!d.stillGoing && !end) return toast('Pick when it ended.');
  if (end && end <= start) return toast('The end time needs to be after the start.');
  if (end && new Date(end) - now > FUTURE) return toast('The end time is in the future.');
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
  let h = bar("It's gone", { back: nav.returnTo, cancel: true });
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
  if (new Date(end) - new Date() > FUTURE) return toast('The end time is in the future.');
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

export function notFound() {
  return bar('Not found', { back: nav.lastMain }) + card('', '<p>This entry no longer exists.</p>');
}

function viewEpisode(id) {
  const ep = state.episodes.find((e) => e.id === id);
  if (!ep) return notFound();
  const t = todayKey();
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

  const bare = !ep.locations.length && !ep.quality.length && !syms.length;
  let h = bar('Migraine', { back: nav.lastMain });
  if (bare) h += `<a class="btn primary top-gap" href="#edit/${id}">Add where it hurts and symptoms</a>`;
  h += card('', `<table class="facts">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`);
  const days = dayRange(episodeStartKey(ep), episodeEndKey(ep, t))
    .map((k) => {
      const i = info(k);
      const pill = i.level != null ? `<span class="pill lv${i.level}">${esc(LEVELS[i.level].short)}</span>` : '<span class="pill">not rated</span>';
      return `<a class="list-item" href="#day/${k}"><b>${esc(fmtDay(k))}</b> ${pill}${i.peakPain != null ? ` <span class="muted">pain ${i.peakPain}</span>` : ''}</a>`;
    })
    .join('');
  h += card('Day by day', days);
  h += card('Medicines', doses.length ? existingDoses(doses, { edit: true }) : '<p class="muted">None recorded.</p>');
  h += `<div class="stack page-end">${bare ? '' : `<a class="btn" href="#edit/${id}">Edit details</a>`}<button type="button" class="btn danger" data-act="delete-episode" data-id="${id}">Delete this migraine</button></div>`;
  return h;
}

export const views = { new: viewNew, edit: viewEdit, end: viewEnd, episode: viewEpisode };

export const actions = {
  'save-new': saveNew,
  'save-edit': saveEdit,
  'save-end': saveEnd,
  'delete-episode': (el) => {
    const id = el.dataset.id;
    if (!window.confirm('Delete this migraine and its medicine doses? Your day ratings stay.')) return;
    state.episodes = state.episodes.filter((e) => e.id !== id);
    state.doses = state.doses.filter((d) => d.episodeId !== id);
    for (const e of state.episodes) if (e.returnOf === id) e.returnOf = null;
    if (commit()) {
      toast('Deleted');
      go(nav.lastMain);
    }
  },
};
