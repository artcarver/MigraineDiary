// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { freshState, normalize } from '../js/store.js';
import { DEFAULT_MEDS, V1_DEFAULT_MEDS } from '../js/defaults.js';

const names = (s) => s.settings.meds.map((m) => (m.dose ? `${m.name} ${m.dose}` : m.name));

// What a phone saved with the first version looks like.
function v1State() {
  const s = freshState();
  delete s.settings.medListVersion;
  s.settings.meds = V1_DEFAULT_MEDS.map(([name, dose], i) => ({ id: `v1-${i}`, name, dose, brand: '', kind: 'other', active: true }));
  return JSON.parse(JSON.stringify(s));
}

test('a new diary starts with the personal medicine list', () => {
  const s = freshState();
  assert.equal(s.settings.medListVersion, 2);
  assert.deepEqual(
    s.settings.meds.map((m) => m.name),
    DEFAULT_MEDS.map((m) => m.name),
  );
  assert.deepEqual(names(s).slice(0, 5), ['Rizatriptan 10 mg', 'Ibuprofen 400 mg', 'Naproxen 440 mg', 'Acetaminophen 1000 mg', 'Excedrin Migraine 2 caplets']);
  assert.equal(s.settings.meds.filter((m) => m.kind === 'preventive').length, 2);
});

test('an untouched first-version list becomes the personal list, keeping ids where the medicine matches', () => {
  const s = normalize(v1State());
  assert.equal(s.settings.medListVersion, 2);
  assert.deepEqual(
    s.settings.meds.map((m) => m.name),
    DEFAULT_MEDS.map((m) => m.name),
  );
  const ibu = s.settings.meds.find((m) => m.name === 'Ibuprofen');
  assert.equal(ibu.id, 'v1-0');
  assert.equal(ibu.dose, '400 mg');
  assert.equal(ibu.kind, 'simple');
  assert.ok(!names(s).some((n) => n.startsWith('Sumatriptan') || n.startsWith('Loratadine')));
});

test('used medicines and medicines added by hand survive the change', () => {
  const raw = v1State();
  raw.settings.meds.push({ id: 'mine', name: 'Ginger chews', dose: '', brand: '', kind: 'other', active: true });
  raw.doses.push({ id: 'd1', medId: 'v1-4', time: '2026-10-01T10:00:00.000Z' });
  const s = normalize(raw);
  const n = names(s);
  assert.ok(n.includes('Sumatriptan 50 mg'), 'used Sumatriptan kept');
  assert.ok(n.includes('Ginger chews'), 'hand-added medicine kept');
  assert.ok(!n.includes('Loratadine 10 mg'), 'unused generic medicine dropped');
  assert.equal(new Set(s.settings.meds.map((m) => m.name)).size, s.settings.meds.length, 'no duplicate names');
});

test('the change runs once: later edits are not undone', () => {
  const s = freshState();
  s.settings.meds = s.settings.meds.filter((m) => m.name !== 'Naproxen');
  const again = normalize(JSON.parse(JSON.stringify(s)));
  assert.ok(!again.settings.meds.some((m) => m.name === 'Naproxen'));
});

test('period marks saved before period tracking was removed are cleared', () => {
  const raw = freshState();
  raw.settings.trackPeriods = true;
  raw.days = {
    '2026-10-01': { level: 0, period: true },
    '2026-10-02': { period: true },
    '2026-10-03': { level: 2, habits: { sleep: 'poor' } },
  };
  const s = normalize(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(s.days, { '2026-10-01': { level: 0 }, '2026-10-03': { level: 2, habits: { sleep: 'poor' } } });
  assert.equal('trackPeriods' in s.settings, false);
  assert.ok(!JSON.stringify(s).includes('period'));
});
