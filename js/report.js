// The doctor summary as a list of text blocks, shared by "Share as text" and
// the PDF so both always say the same thing.

import { LOCATIONS, QUALITIES, WARNING_SIGNS, AURA_TYPES, midasGrade } from './defaults.js';
import { fmtDay, fmtMonth, fmtHours } from './dates.js';
import { medLabel } from './stats.js';
import { round1, plural, labelOf, pct } from './util.js';

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

  // Rebound headache appears only here, in what is exported for the doctor,
  // stated plainly as a possibility.
  add('h', 'Medicine days and rebound headache');
  add('p', `In the 30 days to ${fmtDay(s.to)}:`);
  if (!s.overuse.rows.length) add('li', 'No triptans, pain relievers or combination medicines.');
  for (const r of s.overuse.rows) add('li', `${r.label}: ${plural(r.days, 'day')} (rebound headache is possible at ${r.limit} or more)`);
  if (s.overuse.combined) add('li', `All of these together: ${plural(s.overuse.combined.days, 'day')} (possible at ${s.overuse.combined.limit} or more when mixed)`);
  if (s.overuse.rows.length) {
    if (s.overuse.status === 'over') add('p', 'At this level, rebound headache is possible.');
    else if (s.overuse.status === 'near') add('p', 'This is close to the level where rebound headache is possible.');
    else add('p', 'This is below the level where rebound headache is possible.');
  }
  add(
    'note',
    'Rebound headache is the ICHD-3 diagnosis medication-overuse headache. It is possible with triptans or combination medicines on 10 or more days a month, plain pain relievers on 15 or more, or any mix on 10 or more. Allergy medicines and supplements are not counted.',
  );

  const months = s.months.filter((m) => m.tracked > 0);
  if (months.length) {
    add('h', 'Month by month');
    for (const m of months) {
      add(
        'li',
        `${fmtMonth(m.month, { short: true })}: ${plural(m.migraine, 'migraine day')}, ${plural(m.medDays, 'medicine day')}, ${m.recorded} of ${m.tracked} days recorded${m.overuse.status === 'over' ? ', at a level where rebound headache is possible' : ''}`,
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
