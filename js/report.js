// The doctor summary as a list of text blocks, shared by "Share as text" and
// the PDF so both always say the same thing.

import { LOCATIONS, QUALITIES, WARNING_SIGNS, AURA_TYPES, midasGrade } from './defaults.js';
import { fmtDay, fmtMonth, fmtHours } from './dates.js';
import { medLabel } from './stats.js';

const round1 = (x) => Math.round(x * 10) / 10;
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const labelOf = (list, id) => (list.find((x) => x.id === id) || {}).label || id;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function ranked(counts, label) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([id, c]) => `${label(id)} ${c}`)
    .join(', ');
}

export function summaryBlocks(state, s, title, today) {
  const out = [];
  const add = (kind, text) => out.push({ kind, text });
  const symptomLabel = (id) => (state.settings.symptoms.find((x) => x.id === id) || {}).label || id;
  const long = s.tracked > 31;

  add('title', `Migraine Diary summary: ${title}`);
  add('sub', `${fmtDay(s.from, { year: true })} to ${fmtDay(s.to, { year: true })}. ${s.recorded} of ${plural(s.tracked, 'day')} recorded. Made ${fmtDay(today, { year: true })}.`);

  add('h', 'Key numbers');
  add('li', `Migraine days: ${s.migraineDays}${long ? ` (about ${round1(s.migrainePer30)} a month)` : ''}`);
  add('li', `Medicine days: ${s.medDays}${long ? ` (about ${round1(s.medPer30)} a month)` : ''}`);
  add(
    'li',
    `Days you could function ${s.levels[1]}, slowed down ${s.levels[2]}, had to stop or in bed ${s.levels[3]}${s.levels.unrated ? `, not rated ${s.levels.unrated}` : ''}`,
  );
  if (s.missed) add('li', `Missed work, school or plans: ${plural(s.missed, 'day')}`);
  if (s.migrainePer30 >= 4 && s.tracked >= 28) {
    add('note', '4 or more migraine days a month: the 2026 AAN and AHS guideline says doctors should offer preventive treatment at this level.');
  }

  add('h', `Medicine days in the 30 days to ${fmtDay(s.to)}`);
  if (!s.overuse.rows.length) add('p', 'No triptans or pain relievers.');
  for (const r of s.overuse.rows) add('li', `${r.label}: ${r.days} of ${r.limit}`);
  if (s.overuse.combined) add('li', `All of these together: ${s.overuse.combined.days} of ${s.overuse.combined.limit}`);
  if (s.overuse.status === 'over') add('note', 'At or above the level linked to rebound (medication overuse) headache.');
  else if (s.overuse.status === 'near') add('note', 'Close to the level linked to rebound headache.');
  add('note', 'Limits per month: 10 days for triptans and combination medicines, 15 for plain pain relievers, 10 for any mix. Allergy medicines are not counted.');

  const months = s.months.filter((m) => m.tracked > 0);
  if (months.length) {
    add('h', 'Month by month');
    for (const m of months) {
      add(
        'li',
        `${fmtMonth(m.month, { short: true })}: ${plural(m.migraine, 'migraine day')}, ${plural(m.medDays, 'medicine day')}, ${m.recorded} of ${m.tracked} days recorded${m.overuse.status === 'over' ? ', over the medicine limit' : ''}`,
      );
    }
  }

  add('h', 'Migraines');
  add('li', `Started: ${s.episodes.length}${s.ongoing ? ` (${s.ongoing} still going)` : ''}`);
  add('li', `Came back after a medicine had made it go: ${s.cameBackDoses}`);
  add('li', `Started again within 48 hours of ending: ${s.returns}`);
  if (s.avgHours != null) add('li', `Average length ${fmtHours(s.avgHours)}, longest ${fmtHours(s.longestHours)}`);
  if (s.avgPeak != null) add('li', `Average worst pain ${round1(s.avgPeak)} of 10, worst ${s.worstPain}`);

  if (s.meds.length) {
    add('h', 'Medicines');
    for (const m of s.meds) {
      add(
        'li',
        `${medLabel(m.med)}: ${plural(m.doses, 'dose')} on ${plural(m.days, 'day')}. Gone at 2 hours ${m.gone} of ${m.rated} rated. Came back ${m.cameBack}. Re-dosed within 24 hours ${m.redosed}. Taken at pain 0-3: gone ${m.early.gone} of ${m.early.n}. Taken at pain 4 or more: gone ${m.later.gone} of ${m.later.n}.`,
      );
    }
    add('note', 'Gone means pain-free 2 hours after the dose. Came back means it returned within 24 hours after going.');
  }

  const n = s.episodes.length;
  if (n) {
    add('h', `What the migraines are like (${plural(n, 'migraine')})`);
    add('li', `Side: left only ${s.sides.left}, right only ${s.sides.right}, both ${s.sides.both}, middle only ${s.sides.middle}`);
    if (Object.keys(s.locations).length) add('li', `Where: ${ranked(s.locations, (id) => labelOf(LOCATIONS, id))}`);
    if (Object.keys(s.qualities).length) add('li', `Feels like: ${ranked(s.qualities, (id) => labelOf(QUALITIES, id))}`);
    if (Object.keys(s.symptoms).length) add('li', `Symptoms: ${ranked(s.symptoms, symptomLabel)}`);
    const auraTypes = Object.keys(s.aura.types).map((id) => labelOf(AURA_TYPES, id));
    add('li', `Aura: ${s.aura.count} of ${n}${auraTypes.length ? ` (${auraTypes.join(', ')})` : ''}`);
    if (Object.keys(s.warning).length) add('li', `Warning signs: ${ranked(s.warning, (id) => labelOf(WARNING_SIGNS, id))}`);
    if (s.hangover.asked) add('li', `Hangover afterwards: ${s.hangover.yes} of ${s.hangover.asked} answered`);
  }

  if (state.settings.trackHabits && s.habits.some((h) => h.total >= 7)) {
    add('h', 'Habits and migraine days');
    for (const h of s.habits.filter((x) => x.total >= 7)) {
      const parts = h.rows.filter((r) => r.days).map((r) => `${r.label} ${r.migraine} of ${r.days} days (${pct(r.migraine, r.days)}%)`);
      add('li', `${h.label}: ${parts.join('; ')}`);
    }
    add('note', 'Share of those days that were migraine days. Patterns, not proof.');
  }

  if (state.settings.trackPeriods && s.periods.starts.length) {
    add('h', 'Periods');
    add('p', `A migraine within 2 days of the first day in ${s.periods.withMigraine} of ${plural(s.periods.starts.length, 'period')}.`);
  }

  for (const p of s.preventives) {
    const rate = (r) => (r.perMonth != null ? round1(r.perMonth) : '-');
    add('h', medLabel(p.med));
    if (p.med.startedOn) {
      add(
        'p',
        `Started ${fmtDay(p.start, { year: true })}. Taken on ${p.taken} of ${plural(p.withEntry, 'day')} recorded. Migraine days a month: ${rate(p.before)} before, ${rate(p.after)} recently${p.change != null ? ` (${p.change <= 0 ? 'down' : 'up'} ${Math.abs(Math.round(p.change * 100))}%)` : ''}.`,
      );
    } else {
      add('p', `Taken on and off: ${p.taken} of ${plural(p.withEntry, 'day')} recorded since ${fmtDay(p.start, { year: true })}.`);
    }
  }

  if (s.midas) {
    const g = midasGrade(s.midas.score);
    add('h', 'MIDAS');
    add('p', `Score ${s.midas.score}, grade ${g.grade} (${g.label}), filled in ${fmtDay(s.midas.date, { year: true })}.`);
  }

  if (s.stopped.length) {
    add('h', 'Medicines stopped');
    for (const m of s.stopped) add('li', `${medLabel(m)}${m.brand ? ` (${m.brand})` : ''}`);
  }
  return out;
}

export function blocksToText(blocks) {
  const lines = [];
  for (const b of blocks) {
    if (b.kind === 'h') lines.push('', b.text);
    else if (b.kind === 'li') lines.push(`- ${b.text}`);
    else lines.push(b.text);
  }
  return lines.join('\n');
}
