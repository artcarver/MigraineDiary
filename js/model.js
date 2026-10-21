// The diary in memory, saving it, and the half-filled form being worked on.
// Screens read `state` and `draft` from here and change the diary through
// these functions, then call commit() to save.

import { loadState, saveState, freshState, newId, STORAGE_KEY, DRAFT_KEY } from './store.js';
import { isDaily } from './stats.js';
import { toast } from './ui.js';
import { HOUR } from './util.js';

export let state;
export let loadProblem = false;
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

export function replaceState(next) {
  state = next;
  loadProblem = false;
}

export function commit() {
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

// ---------- lookups ----------

export const med = (id) => state.settings.meds.find((m) => m.id === id);
export const activeMeds = () => state.settings.meds.filter((m) => m.active && !isDaily(m.kind));
export const preventiveMeds = () => state.settings.meds.filter((m) => m.active && m.kind === 'preventive');
export const symptomLabel = (id) => (state.settings.symptoms.find((s) => s.id === id) || {}).label || id;

export function visibleSymptoms(selected) {
  return state.settings.symptoms.filter((s) => !s.hidden || (selected || []).includes(s.id));
}

// The migraine going on at this time, if any.
export function episodeFor(iso) {
  return (
    state.episodes
      .filter((e) => e.start <= iso && (!e.end || iso <= e.end))
      .sort((a, b) => b.start.localeCompare(a.start))[0] || null
  );
}

// ---------- changes ----------

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
export function putDay(key, e) {
  const c = clean(e);
  if (Object.keys(c).length) state.days[key] = c;
  else delete state.days[key];
}

export function addDose(medId, time, pain, episodeId) {
  const m = med(medId);
  const dose = {
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
  };
  state.doses.push(dose);
  return dose;
}

// ---------- drafts: half-filled forms survive the app closing for 12 hours ----------

export let draft = null;

export function storeDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {}
}

export function dropDraft() {
  draft = null;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

export function useDraft(route, init) {
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
export function discardDraft(route) {
  if (draft && draft.route === route) draft = null;
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (saved && saved.route === route) localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

export function startDraft(route, values) {
  draft = { route, createdAt: new Date().toISOString(), ...values };
  storeDraft();
}
