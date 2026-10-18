// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { freshState, newId } from '../js/store.js';
import { summarize } from '../js/stats.js';
import { summaryBlocks, blocksToText } from '../js/report.js';
import { makePdf, wrap, textWidth, toAscii } from '../js/pdf.js';

const at = (key, hh = 12) => new Date(`${key}T${String(hh).padStart(2, '0')}:00:00`).toISOString();

function sample() {
  const s = freshState(new Date('2026-09-01T09:00:00'));
  s.startedOn = '2026-09-01';
  const suma = { id: 'suma', name: 'Sumatriptan', dose: '50 mg', kind: 'triptan', active: true };
  s.settings.meds = [suma];
  const e = { id: newId(), start: at('2026-09-10', 8), end: at('2026-09-11', 20), pain: 7, locations: ['fh-l'], quality: ['throbbing'], symptoms: ['light'], warning: ['neck'], aura: null, hangover: true, returnOf: null, wokeUp: true };
  s.episodes.push(e);
  s.doses.push({ id: newId(), medId: suma.id, name: suma.name, dose: suma.dose, kind: 'triptan', time: at('2026-09-10', 9), pain: 3, result: 'gone', episodeId: e.id });
  s.days['2026-09-11'] = { level: 3, peakPain: 9, missed: true };
  return s;
}

test('summary blocks cover the key numbers, medicines and features', () => {
  const s = sample();
  const sum = summarize(s, '2026-09-01', '2026-09-30', '2026-10-18');
  const blocks = summaryBlocks(s, sum, 'September 2026', '2026-10-18');
  const text = blocksToText(blocks);
  assert.match(text, /^Migraine Diary summary: September 2026/);
  assert.match(text, /- Migraine days: 2\n/);
  assert.match(text, /Missed work, school or plans: 1 day/);
  assert.match(text, /Sumatriptan 50 mg: 1 dose on 1 day\. Gone at 2 hours 1 of 1 rated/);
  assert.match(text, /Where: Forehead, left 1/);
  assert.match(text, /Warning signs: Stiff neck 1/);
  assert.ok(blocks.filter((b) => b.kind === 'h').length >= 4);
});

test('rebound headache is stated plainly in the export, at every level', () => {
  const s = sample();
  const blocksFor = (state) => blocksToText(summaryBlocks(state, summarize(state, '2026-09-01', '2026-09-30', '2026-10-18'), 'September 2026', '2026-10-18'));
  // One triptan day: below the level.
  let text = blocksFor(s);
  assert.match(text, /\nMedicine days and rebound headache\n/);
  assert.match(text, /- Triptan: 1 day \(rebound headache is possible at 10 or more\)/);
  assert.match(text, /This is below the level where rebound headache is possible\./);
  // Ten triptan days: at the level.
  for (let d = 12; d <= 20; d++) {
    s.doses.push({ id: newId(), medId: 'suma', name: 'Sumatriptan', dose: '50 mg', kind: 'triptan', time: at(`2026-09-${d}`, 9), pain: 5, result: null, episodeId: null });
  }
  text = blocksFor(s);
  assert.match(text, /- Triptan: 10 days/);
  assert.match(text, /At this level, rebound headache is possible\./);
  assert.match(text, /Sep 2026: .*at a level where rebound headache is possible/);
  // No counted medicines at all.
  s.doses = [];
  text = blocksFor(s);
  assert.match(text, /- No triptans, pain relievers or combination medicines\./);
  assert.doesNotMatch(text, /below the level|At this level|close to the level/);
  // No judging words anywhere.
  assert.doesNotMatch(blocksFor(sample()), /too much|too many|should not|excessive|abuse/i);
});

test('pdf text helpers: ASCII folding, widths and wrapping', () => {
  assert.equal(toAscii('Café “quoted” – it’s fine…'), 'Cafe "quoted" - it\'s fine...');
  assert.equal(toAscii('日本'), '??');
  assert.equal(textWidth('ii', 'F1', 10), 4.44);
  const lines = wrap('one two three four five six seven eight nine ten', 'F1', 10, 60);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(textWidth(l, 'F1', 10) <= 60 || !l.includes(' '));
});

test('pdf: valid structure, cross-reference offsets, and page breaks', () => {
  const blocks = [{ kind: 'title', text: 'Migraine Diary summary (test)' }];
  for (let i = 0; i < 120; i++) blocks.push({ kind: i % 10 ? 'li' : 'h', text: `Line ${i} with a back\\slash and (parentheses) that should be escaped` });
  const bytes = makePdf(blocks, { title: 'Test', footer: 'Footer' });
  const pdf = Buffer.from(bytes).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-1.4\n'));
  assert.ok(pdf.trimEnd().endsWith('%%EOF'));
  const count = Number(pdf.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/)[1]);
  assert.ok(count >= 3, `expected several pages, got ${count}`);
  const xrefAt = Number(pdf.match(/startxref\n(\d+)\n/)[1]);
  assert.ok(pdf.slice(xrefAt).startsWith('xref\n'));
  const entries = pdf.slice(xrefAt).split('\n').slice(3).filter((l) => / 00000 n $/.test(l));
  entries.forEach((line, i) => {
    const off = Number(line.slice(0, 10));
    assert.ok(pdf.slice(off).startsWith(`${i + 1} 0 obj\n`), `object ${i + 1} offset`);
  });
  for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const startAt = m.index + m[0].length;
    assert.equal(pdf.slice(startAt + Number(m[1]), startAt + Number(m[1]) + 10), '\nendstream');
  }
  assert.match(pdf, /\(Line 1 with a back\\\\slash and \\\(parentheses\\\) that/);
});
