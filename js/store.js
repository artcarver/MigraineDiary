// Saved data lives in this phone's localStorage under one key. Nothing is
// sent anywhere; the backup file is the only way data leaves the phone.

import { DEFAULT_MEDS, DEFAULT_SYMPTOMS } from './defaults.js';
import { todayKey } from './dates.js';

export const STORAGE_KEY = 'migraine-diary';
export const DRAFT_KEY = 'migraine-diary-draft';
const SCHEMA = 1;

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function freshState(now = new Date()) {
  return {
    schema: SCHEMA,
    startedOn: todayKey(now),
    settings: {
      meds: DEFAULT_MEDS.map((m) => ({ id: newId(), ...m, active: true })),
      symptoms: DEFAULT_SYMPTOMS.map((s) => ({ ...s, hidden: false })),
      trackPeriods: true,
      trackHabits: true,
      lastBackup: null,
    },
    episodes: [],
    doses: [],
    days: {},
    midas: [],
  };
}

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// Fills in anything missing so older or hand-edited data still loads.
export function normalize(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('No diary data found.');
  const base = freshState();
  const s = obj(raw.settings);
  return {
    schema: SCHEMA,
    startedOn: typeof raw.startedOn === 'string' ? raw.startedOn : base.startedOn,
    settings: {
      meds: Array.isArray(s.meds) ? s.meds : base.settings.meds,
      symptoms: Array.isArray(s.symptoms) ? s.symptoms : base.settings.symptoms,
      trackPeriods: s.trackPeriods ?? true,
      trackHabits: s.trackHabits ?? true,
      lastBackup: s.lastBackup ?? null,
    },
    episodes: arr(raw.episodes).map((e) => ({
      locations: [],
      quality: [],
      symptoms: [],
      warning: [],
      aura: null,
      hangover: null,
      returnOf: null,
      wokeUp: false,
      pain: null,
      end: null,
      ...e,
    })),
    doses: arr(raw.doses).map((d) => ({ pain: null, result: null, episodeId: null, ...d })),
    days: obj(raw.days),
    midas: arr(raw.midas),
  };
}

export function loadState(storage = globalThis.localStorage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return freshState();
  return normalize(JSON.parse(raw));
}

export function saveState(state, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function backupText(state, now = new Date()) {
  return JSON.stringify({ app: 'migraine-diary', exportedAt: now.toISOString(), data: state });
}

export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file is not a Migraine Diary backup.');
  }
  if (!parsed || parsed.app !== 'migraine-diary' || !parsed.data) {
    throw new Error('This file is not a Migraine Diary backup.');
  }
  return normalize(parsed.data);
}
