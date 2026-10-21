// A single dose: logging one at a chosen time, or changing or deleting one
// already saved.

import { RESULTS } from '../defaults.js';
import { todayKey, toLocalInput, fromLocalInput } from '../dates.js';
import { state, draft, med, activeMeds, addDose, episodeFor, commit, useDraft, dropDraft, storeDraft } from '../model.js';
import { ongoingEpisode, lastPain, medFor, medLabel, isDaily } from '../stats.js';
import { bar, section, chips, painPicker, timeInput, saveBar, toast } from '../ui.js';
import { medButtons } from '../widgets.js';
import { go, nav, render } from '../router.js';
import { esc } from '../util.js';
import { notFound } from './migraine.js';

const WHEN = [
  { id: 'now', label: 'Just now' },
  { id: '15', label: '15 min ago' },
  { id: '30', label: '30 min ago' },
  { id: '60', label: '1 hour ago' },
  { id: 'pick', label: 'Earlier' },
];

function viewDose(id) {
  if (id) return viewSavedDose(id);
  const ep = ongoingEpisode(state);
  const d = useDraft('#dose', () => ({ medId: null, when: 'now', time: toLocalInput(new Date()), pain: ep ? lastPain(state, ep, todayKey()) : null }));
  // A form half-filled before the quick time choices existed has only a time.
  if (!d.when) d.when = 'pick';
  let h = bar('Took a medicine', { back: nav.returnTo, cancel: true });
  h += section('Which one?', medButtons('pick-med', d.medId));
  h += section('When?', chips('when', WHEN, d.when, { keep: true }) + (d.when === 'pick' ? timeInput('time', d.time) : ''));
  h += section(
    d.when === 'now' ? 'Pain right now' : 'Pain when you took it',
    painPicker('pain', d.pain),
    'Optional. Over time it shows whether your medicines work better when taken early.',
  );
  return h + saveBar('save-dose', 'Save');
}

function viewSavedDose(id) {
  const x = state.doses.find((d) => d.id === id);
  if (!x) return notFound();
  const d = useDraft('#dose/' + id, () => ({ medId: x.medId, time: toLocalInput(x.time), pain: x.pain, result: x.result }));
  const current = medFor(state, { ...x, medId: d.medId });
  const listed = activeMeds().some((m) => m.id === d.medId);
  let h = bar('Dose', { back: nav.returnTo, cancel: true });
  h += section('Which one?', (listed ? '' : `<p class="current-med">${esc(medLabel(current))}</p>`) + medButtons('pick-med', d.medId));
  h += section('When?', timeInput('time', d.time));
  h += section('Pain when you took it', painPicker('pain', d.pain));
  if (!isDaily(current.kind)) h += section('Did it help?', chips('result', RESULTS, d.result), 'How it was 2 hours after taking it.');
  h += `<button type="button" class="btn danger top-gap" data-act="delete-dose-page" data-id="${id}">Delete this dose</button>`;
  return h + saveBar('save-dose', 'Save changes', ` data-id="${id}"`);
}

function saveDose(el) {
  const d = draft;
  const id = el.dataset.id;
  if (!d.medId) return toast('Pick a medicine.');
  // Minutes ago for the quick choices; anything else uses the time picker.
  const ago = id ? undefined : { now: 0, 15: 15, 30: 30, 60: 60 }[d.when];
  const time = ago === undefined ? fromLocalInput(d.time) : new Date(Date.now() - ago * 60000).toISOString();
  if (!time) return toast('Pick a time.');
  if (new Date(time) - Date.now() > 5 * 60000) return toast('That time is in the future.');

  if (id) {
    const x = state.doses.find((y) => y.id === id);
    if (!x) return go(nav.returnTo);
    const m = med(d.medId);
    if (m && m.id !== x.medId) Object.assign(x, { medId: m.id, name: m.name, dose: m.dose, kind: m.kind });
    // The form shows whole minutes, so only a changed minute moves the dose
    // (and may move it in or out of a migraine).
    if (toLocalInput(x.time) !== d.time) {
      const ep = episodeFor(time);
      x.time = time;
      x.episodeId = ep ? ep.id : null;
    }
    x.pain = d.pain ?? null;
    if ((d.result || null) !== x.result) {
      x.result = d.result || null;
      x.ratedAt = x.result ? new Date().toISOString() : null;
    }
  } else {
    const ep = episodeFor(time);
    addDose(d.medId, time, d.pain, ep ? ep.id : null);
  }
  if (commit()) {
    dropDraft();
    toast('Saved');
    go(nav.returnTo);
  }
}

export const views = { dose: viewDose };

export const actions = {
  'save-dose': saveDose,
  'pick-med': (el) => {
    if (!draft) return;
    draft.medId = el.dataset.med;
    storeDraft();
    render();
  },
  'delete-dose-page': (el) => {
    if (!window.confirm('Delete this dose?')) return;
    state.doses = state.doses.filter((x) => x.id !== el.dataset.id);
    if (commit()) {
      dropDraft();
      toast('Dose deleted');
      go(nav.returnTo);
    }
  },
};
