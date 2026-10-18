// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { freshState, backupText, parseBackup, newId } from '../js/store.js';
import { dayRange, diffDays, addDays, fromLocalInput, toLocalInput, dayKey } from '../js/dates.js';
import {
  makeIndex,
  overuseWindow,
  cameBack,
  summarize,
  missingDays,
  dosesToRate,
  recentlyEnded,
  episodeSides,
  trackingStart,
} from '../js/stats.js';
import { toCsv, daysCsv, dosesCsv, migrainesCsv } from '../js/csv.js';

const at = (key, hh = 12, mm = 0) => new Date(`${key}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`).toISOString();

function base(startedOn = '2026-09-01') {
  const s = freshState(new Date(`${startedOn}T09:00:00`));
  s.startedOn = startedOn;
  return s;
}

const med = (s, name) => s.settings.meds.find((m) => m.name === name);

function addEpisode(s, startIso, endIso, extra = {}) {
  const e = { id: newId(), start: startIso, end: endIso, pain: 6, locations: [], quality: [], symptoms: [], warning: [], aura: null, hangover: null, returnOf: null, wokeUp: false, ...extra };
  s.episodes.push(e);
  return e;
}

function addDose(s, name, iso, extra = {}) {
  const m = med(s, name);
  const d = { id: newId(), medId: m.id, name: m.name, dose: m.dose, kind: m.kind, time: iso, pain: null, result: null, episodeId: null, ...extra };
  s.doses.push(d);
  return d;
}

test('dates: ranges and differences survive daylight saving changes', () => {
  // US clocks go back on 2026-11-01 and forward on 2027-03-14.
  assert.equal(dayRange('2026-10-30', '2026-11-03').length, 5);
  assert.equal(diffDays('2026-10-31', '2026-11-02'), 2);
  assert.equal(diffDays('2027-03-13', '2027-03-15'), 2);
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(toLocalInput(fromLocalInput('2026-10-18T21:05')), '2026-10-18T21:05');
});

test('migraine days come from entries and day ratings, and a "No migraine" rating marks a gap', () => {
  const s = base();
  addEpisode(s, at('2026-10-01', 10), at('2026-10-04', 8));
  s.days['2026-10-02'] = { level: 0 };
  s.days['2026-10-03'] = { level: 3, peakPain: 8 };
  s.days['2026-10-06'] = { level: 2, peakPain: 4 };
  const info = makeIndex(s, '2026-10-10');
  assert.equal(info('2026-10-01').migraine, true);
  assert.equal(info('2026-10-02').migraine, false);
  assert.equal(info('2026-10-03').migraine, true);
  assert.equal(info('2026-10-03').peakPain, 8);
  assert.equal(info('2026-10-04').migraine, true);
  assert.equal(info('2026-10-05').migraine, false);
  assert.equal(info('2026-10-05').recorded, false);
  assert.equal(info('2026-10-06').migraine, true);
});

test('ongoing entries run through today', () => {
  const s = base();
  addEpisode(s, at('2026-10-08', 22), null);
  const info = makeIndex(s, '2026-10-10');
  assert.deepEqual(['2026-10-08', '2026-10-09', '2026-10-10'].map((k) => info(k).migraine), [true, true, true]);
  assert.equal(info('2026-10-11').migraine, false);
});

test('overuse: triptan limit is 10 days and "near" starts at 8', () => {
  const s = base();
  for (let i = 0; i < 8; i++) addDose(s, 'Sumatriptan', at(addDays('2026-10-01', i * 2)));
  let o = overuseWindow(s, '2026-10-30', '2026-10-30');
  assert.equal(o.rows[0].days, 8);
  assert.equal(o.rows[0].status, 'near');
  addDose(s, 'Sumatriptan', at('2026-10-25'));
  addDose(s, 'Sumatriptan', at('2026-10-26'));
  // Two doses on one day still count as one day.
  addDose(s, 'Sumatriptan', at('2026-10-26', 20));
  o = overuseWindow(s, '2026-10-30', '2026-10-30');
  assert.equal(o.rows[0].days, 10);
  assert.equal(o.status, 'over');
});

test('overuse: pain relievers allow 15 days, but mixed classes count together at 10', () => {
  const s = base();
  for (let i = 0; i < 9; i++) addDose(s, 'Ibuprofen', at(addDays('2026-10-01', i)));
  let o = overuseWindow(s, '2026-10-30', '2026-10-30');
  assert.equal(o.status, 'ok');
  assert.equal(o.combined, null);
  addDose(s, 'Rizatriptan', at('2026-10-20'));
  addDose(s, 'Rizatriptan', at('2026-10-21'));
  o = overuseWindow(s, '2026-10-30', '2026-10-30');
  assert.equal(o.rows.find((r) => r.kind === 'simple').status, 'ok');
  assert.equal(o.rows.find((r) => r.kind === 'triptan').status, 'ok');
  assert.equal(o.combined.days, 11);
  assert.equal(o.status, 'over');
});

test('overuse: allergy medicines and daily preventives do not count', () => {
  const s = base();
  s.settings.meds.push({ id: 'prev', name: 'Topiramate', dose: '25 mg', kind: 'preventive', active: true });
  for (let i = 0; i < 20; i++) addDose(s, 'Cetirizine', at(addDays('2026-10-01', i)));
  const o = overuseWindow(s, '2026-10-30', '2026-10-30');
  assert.equal(o.rows.length, 0);
  assert.equal(o.status, 'ok');
  assert.equal(makeIndex(s, '2026-10-30')('2026-10-05').medDay, true);
});

test('came back: a Gone dose followed by another dose within 24 hours', () => {
  const s = base();
  const a = addDose(s, 'Sumatriptan', at('2026-10-05', 10), { result: 'gone' });
  addDose(s, 'Sumatriptan', at('2026-10-05', 22), { result: 'gone' });
  const c = addDose(s, 'Ibuprofen', at('2026-10-09', 10), { result: 'gone' });
  addDose(s, 'Cetirizine', at('2026-10-09', 10, 20));
  assert.equal(cameBack(s, a), true);
  assert.equal(cameBack(s, c), false, 'a second medicine taken right after is not a return');
});

test('came back: a new entry marked as the same migraine returning', () => {
  const s = base();
  const e1 = addEpisode(s, at('2026-10-05', 9), at('2026-10-05', 15));
  const d = addDose(s, 'Sumatriptan', at('2026-10-05', 10), { result: 'gone', episodeId: e1.id });
  addEpisode(s, at('2026-10-06', 6), null, { returnOf: e1.id });
  assert.equal(cameBack(s, d), true);
  assert.equal(recentlyEnded(s, at('2026-10-06', 6)).id, e1.id);
  assert.equal(recentlyEnded(s, at('2026-10-08', 6)), null);
});

test('summary: counts, per-month rate, sides, early versus later doses', () => {
  const s = base('2026-09-01');
  const e1 = addEpisode(s, at('2026-09-10', 8), at('2026-09-11', 20), { locations: ['fh-l', 'ey-l'], quality: ['throbbing'], symptoms: ['light'] });
  const e2 = addEpisode(s, at('2026-09-20', 8), at('2026-09-20', 18), { locations: ['fh-l', 'fh-r'], aura: { types: ['vision'], length: 'mid' }, hangover: true });
  addDose(s, 'Sumatriptan', at('2026-09-10', 9), { pain: 2, result: 'gone', episodeId: e1.id });
  addDose(s, 'Sumatriptan', at('2026-09-20', 9), { pain: 7, result: 'same', episodeId: e2.id });
  addDose(s, 'Cetirizine', at('2026-09-20', 12), { pain: 7, result: 'better', episodeId: e2.id });
  s.days['2026-09-11'] = { level: 3, peakPain: 9, missed: true, symptoms: ['nausea'] };
  const sum = summarize(s, '2026-09-01', '2026-09-30', '2026-10-18');
  assert.equal(sum.tracked, 30);
  assert.equal(sum.migraineDays, 3);
  assert.equal(Math.round(sum.migrainePer30), 3);
  assert.equal(sum.episodes.length, 2);
  assert.equal(sum.worstPain, 9);
  assert.equal(sum.missed, 1);
  assert.equal(sum.levels[3], 1);
  assert.equal(sum.levels.unrated, 2);
  assert.deepEqual(sum.sides, { left: 1, right: 0, both: 1, middle: 0 });
  assert.equal(sum.symptoms.light, 1);
  assert.equal(sum.symptoms.nausea, 1);
  assert.equal(sum.aura.count, 1);
  assert.equal(sum.hangover.yes, 1);
  const suma = sum.meds.find((m) => m.med.name === 'Sumatriptan');
  assert.equal(suma.doses, 2);
  assert.deepEqual(suma.early, { n: 1, gone: 1 });
  assert.deepEqual(suma.later, { n: 1, gone: 0 });
  assert.equal(sum.meds.find((m) => m.med.name === 'Cetirizine').better, 1);
});

test('summary: the 3-month rate uses calendar days tracked, not days with migraine', () => {
  const s = base('2026-07-20');
  for (let i = 0; i < 12; i++) s.days[addDays('2026-07-25', i * 7)] = { level: 2 };
  const sum = summarize(s, '2026-07-20', '2026-10-17', '2026-10-18');
  assert.equal(sum.tracked, 90);
  assert.equal(sum.migraineDays, 12);
  assert.equal(sum.migrainePer30, 4);
});

test('summary: period window is two days either side of day 1', () => {
  const s = base('2026-09-01');
  s.days['2026-09-10'] = { level: 0, period: true };
  s.days['2026-09-08'] = { level: 2 };
  s.days['2026-10-08'] = { level: 0, period: true };
  s.days['2026-10-11'] = { level: 2 };
  const sum = summarize(s, '2026-09-01', '2026-10-17', '2026-10-18');
  assert.equal(sum.periods.starts.length, 2);
  assert.equal(sum.periods.withMigraine, 1);
});

test('summary: preventive before and after comparison', () => {
  const s = base('2026-06-01');
  s.settings.meds.push({ id: 'prev', name: 'Topiramate', dose: '25 mg', kind: 'preventive', active: true, startedOn: '2026-08-01' });
  // 8 migraine days in the 61 days before, 2 in the 78 days after.
  for (let i = 0; i < 8; i++) s.days[addDays('2026-06-03', i * 7)] = { level: 2 };
  s.days['2026-08-20'] = { level: 1, preventive: { prev: true } };
  s.days['2026-09-20'] = { level: 1, preventive: { prev: true } };
  s.days['2026-09-21'] = { level: 0, preventive: { prev: true } };
  const sum = summarize(s, '2026-07-20', '2026-10-17', '2026-10-18');
  const p = sum.preventives[0];
  assert.equal(p.start, '2026-08-01');
  assert.equal(p.taken, 3);
  assert.ok(p.change < -0.5, `expected more than a 50% drop, got ${p.change}`);
});

test('missing days and doses waiting for a rating', () => {
  const s = base('2026-10-01');
  s.days['2026-10-01'] = { level: 0 };
  s.days['2026-10-02'] = { level: 1 };
  addEpisode(s, at('2026-10-03', 8), at('2026-10-03', 20));
  assert.deepEqual(
    missingDays(s, '2026-10-06').map((d) => [d.key, d.inEpisode]),
    [
      ['2026-10-05', false],
      ['2026-10-04', false],
      ['2026-10-03', true],
    ],
  );
  const d1 = addDose(s, 'Sumatriptan', new Date('2026-10-06T08:00:00').toISOString());
  addDose(s, 'Sumatriptan', new Date('2026-10-06T09:30:00').toISOString());
  assert.deepEqual(dosesToRate(s, new Date('2026-10-06T10:00:00')).map((d) => d.id), [d1.id]);
});

test('tracking start moves back when a past migraine is entered', () => {
  const s = base('2026-10-01');
  addEpisode(s, at('2026-09-25', 8), at('2026-09-25', 20));
  assert.equal(trackingStart(s), '2026-09-25');
});

test('episode sides use the person\'s own left and right', () => {
  assert.equal(episodeSides({ locations: ['tm-r', 'ey-r'] }), 'right');
  assert.equal(episodeSides({ locations: ['br', 'fh-c'] }), 'middle');
  assert.equal(episodeSides({ locations: [] }), null);
});

test('backup round trip, and other files are refused', () => {
  const s = base();
  addEpisode(s, at('2026-10-01', 10), null);
  const back = parseBackup(backupText(s));
  assert.equal(back.episodes.length, 1);
  assert.equal(back.settings.meds.length, s.settings.meds.length);
  assert.throws(() => parseBackup('{"hello":1}'), /not a Migraine Diary backup/);
  assert.throws(() => parseBackup('not json'), /not a Migraine Diary backup/);
});

test('CSV: quoting and the three exports', () => {
  assert.equal(toCsv([['a', 'b,c', 'say "hi"']]), 'a,"b,c","say ""hi"""\r\n');
  const s = base('2026-10-01');
  const e = addEpisode(s, at('2026-10-02', 8), at('2026-10-02', 20), { locations: ['fh-l'], symptoms: ['light', 'nausea'] });
  addDose(s, 'Sumatriptan', at('2026-10-02', 9), { pain: 5, result: 'gone', episodeId: e.id });
  s.days['2026-10-02'] = { level: 2, peakPain: 6, habits: { sleep: 'poor' } };
  const days = daysCsv(s, '2026-10-03').split('\r\n');
  assert.equal(days.length, 5);
  assert.match(days[2], /^2026-10-02,Slowed down,yes,6,/);
  assert.match(days[2], /Sumatriptan 50 mg at/);
  assert.match(days[2], /,Poor,/);
  assert.match(dosesCsv(s), /Sumatriptan 50 mg,Triptan,5,Gone,no/);
  assert.match(migrainesCsv(s, '2026-10-03'), /Forehead, left/);
  assert.equal(dayKey(s.doses[0].time), '2026-10-02');
});
