// One day: how it went, and during a migraine its worst pain, symptoms and
// medicines.

import { todayKey, addDays, fmtDateTime, fmtDay, fromLocalInput } from '../dates.js';
import { state, draft, med, addDose, putDay, commit, useDraft, dropDraft, startDraft, visibleSymptoms } from '../model.js';
import { makeIndex, episodeDayNumber, episodeStartKey } from '../stats.js';
import { bar, section, chips, painPicker, levelPicker, switchRow, saveBar, toast } from '../ui.js';
import { doseEditor, existingDoses, extras } from '../widgets.js';
import { go, nav } from '../router.js';
import { esc } from '../util.js';
import { newDefaults, formForDay } from './migraine.js';

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
    // Starts from the worst pain already known for the day, such as the pain
    // noted with a dose.
    peakPain: e.peakPain ?? info.peakPain ?? null,
    symptoms: [...(symptoms || [])],
    prefilled: !e.symptoms && !!(symptoms && symptoms.length),
    missed: !!e.missed,
    habits: { ...(e.habits || {}) },
    preventive: { ...(e.preventive || {}) },
    doses: [],
  };
}

// The migraine a dose at this time belongs to, from those covering its day.
function episodeAt(episodes, iso) {
  return episodes.filter((e) => e.start <= iso).sort((a, b) => b.start.localeCompare(a.start))[0] || episodes[0];
}

function viewDay(arg) {
  const t = todayKey();
  const key = arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) && arg <= t ? arg : t;
  const info = makeIndex(state, t)(key);
  const ep = info.episodes[0] || null;
  const d = useDraft('#day/' + key, () => dayDefaults(key, info));
  const migraineish = d.level >= 1 || (d.level == null && info.inEpisode);

  let h = bar(key === t ? 'Today' : fmtDay(key), { back: nav.returnTo, cancel: true });
  if (ep) {
    h += `<p class="hint top-gap">Day ${episodeDayNumber(ep, key)} of the migraine that started ${esc(fmtDateTime(ep.start))}. <a href="#episode/${ep.id}">See it</a></p>`;
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
    h += '<div class="note top-gap">This day is not part of a migraine entry yet. The next step adds the details.</div>';
  }
  h += extras(d);
  return h + saveBar('save-day', migraineish && !info.inEpisode ? 'Next' : 'Save');
}

function saveDay() {
  const d = draft;
  const t = todayKey();
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
  go(nav.returnTo);
}

export const views = { day: viewDay };
export const actions = { 'save-day': saveDay };
