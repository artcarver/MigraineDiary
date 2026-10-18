// Spreadsheet export: one file per kind of record, readable in Numbers or
// Excel.

import { LEVELS, QUALITIES, LOCATIONS, WARNING_SIGNS, AURA_TYPES, AURA_LENGTHS, RESULTS, HABITS, MED_KINDS } from './defaults.js';
import { dayKey, dayRange, fmtTime, hoursBetween } from './dates.js';
import { makeIndex, trackingStart, medFor, medLabel, isDaily, episodePeak, episodeSymptoms, cameBack } from './stats.js';

function cell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const labelFrom = (list, id) => (list.find((x) => x.id === id) || {}).label || id;
const labels = (list, ids) => (ids || []).map((id) => labelFrom(list, id)).join('; ');
const yesNo = (v) => (v == null ? '' : v ? 'yes' : 'no');

export function daysCsv(state, today) {
  const info = makeIndex(state, today);
  const preventives = state.settings.meds.filter((m) => m.kind === 'preventive');
  const header = [
    'date',
    'how the day went',
    'migraine day',
    'worst pain',
    'symptoms',
    'missed work, school or plans',
    'medicines',
    'migraine medicine day',
    ...HABITS.map((h) => h.label.toLowerCase()),
    'period started',
    ...preventives.map((m) => `took ${medLabel(m)}`),
  ];
  const rows = [header];
  for (const k of dayRange(trackingStart(state), today)) {
    const i = info(k);
    const e = i.entry || {};
    rows.push([
      k,
      i.level == null ? '' : LEVELS[i.level].label,
      i.recorded ? yesNo(i.migraine) : '',
      i.peakPain ?? '',
      labels(state.settings.symptoms, e.symptoms),
      e.missed ? 'yes' : '',
      i.doses
        .filter((d) => !isDaily(medFor(state, d).kind))
        .map((d) => `${medLabel(medFor(state, d))} at ${fmtTime(d.time)}`)
        .join('; '),
      i.medDay ? 'yes' : '',
      ...HABITS.map((h) => (e.habits && e.habits[h.id] ? labelFrom(h.options, e.habits[h.id]) : '')),
      e.period ? 'yes' : '',
      ...preventives.map((m) => (e.preventive && e.preventive[m.id] ? 'yes' : '')),
    ]);
  }
  return toCsv(rows);
}

export function dosesCsv(state) {
  const rows = [['date', 'time', 'medicine', 'type', 'pain when taken', 'two hours later', 'came back within 24 hours']];
  for (const d of state.doses.slice().sort((a, b) => a.time.localeCompare(b.time))) {
    const med = medFor(state, d);
    if (isDaily(med.kind)) continue;
    rows.push([
      dayKey(d.time),
      fmtTime(d.time),
      medLabel(med),
      (MED_KINDS[med.kind] || {}).label || med.kind,
      d.pain ?? '',
      d.result ? labelFrom(RESULTS, d.result) : '',
      d.result === 'gone' ? yesNo(cameBack(state, d)) : '',
    ]);
  }
  return toCsv(rows);
}

export function migrainesCsv(state, today) {
  const info = makeIndex(state, today);
  const rows = [
    [
      'started',
      'ended',
      'hours',
      'woke up with it',
      'came back after ending',
      'worst pain',
      'where',
      'feels like',
      'symptoms',
      'aura',
      'warning signs',
      'hangover after',
    ],
  ];
  for (const e of state.episodes.slice().sort((a, b) => a.start.localeCompare(b.start))) {
    rows.push([
      `${dayKey(e.start)} ${fmtTime(e.start)}`,
      e.end ? `${dayKey(e.end)} ${fmtTime(e.end)}` : 'still going',
      e.end ? Math.round(hoursBetween(e.start, e.end)) : '',
      e.wokeUp ? 'yes' : '',
      e.returnOf ? 'yes' : '',
      episodePeak(state, e, info, today) ?? '',
      labels(LOCATIONS, e.locations),
      labels(QUALITIES, e.quality),
      labels(state.settings.symptoms, episodeSymptoms(state, e, today)),
      e.aura ? [labels(AURA_TYPES, e.aura.types), e.aura.length ? labelFrom(AURA_LENGTHS, e.aura.length) : ''].filter(Boolean).join(', ') || 'yes' : '',
      labels(WARNING_SIGNS, e.warning),
      yesNo(e.hangover),
    ]);
  }
  return toCsv(rows);
}
