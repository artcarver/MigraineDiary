// The Summary tab, the doctor summary it exports, and the MIDAS questionnaire.

import { QUALITIES, LOCATIONS, WARNING_SIGNS, AURA_TYPES, MIDAS_QUESTIONS, MIDAS_EXTRA, midasGrade } from '../defaults.js';
import { todayKey, addDays, monthKey, addMonths, monthBounds, fmtDay, fmtMonth, fmtHours } from '../dates.js';
import { state, draft, commit, useDraft, dropDraft, symptomLabel } from '../model.js';
import { summarize, medLabel, trackingStart } from '../stats.js';
import { summaryBlocks, blocksToText } from '../report.js';
import { makePdf } from '../pdf.js';
import { mainBar, bar, card, section, stat, barRow, numInput, saveBar, muted, toast } from '../ui.js';
import { shareFiles, shareText } from '../share.js';
import { go } from '../router.js';
import { esc, plural, pct, round1, labelOf } from '../util.js';

// What the Summary tab last showed, so the PDF and text match it.
let lastSummary = null;

function viewSummary(arg) {
  const t = todayKey();
  let from;
  let to;
  let title;
  let rangeId;
  if (arg && /^\d{4}-\d{2}$/.test(arg)) {
    ({ from, to } = monthBounds(arg));
    title = fmtMonth(arg);
    rangeId = arg;
  } else {
    const n = arg === '30' ? 30 : 90;
    from = addDays(t, -(n - 1));
    to = t;
    title = `Last ${n} days`;
    rangeId = String(n);
  }
  const s = summarize(state, from, to, t);
  lastSummary = { s, title };
  const thisM = monthKey(t);
  const ranges = [
    { id: '30', label: 'Last 30 days' },
    { id: '90', label: 'Last 90 days' },
    { id: thisM, label: 'This month' },
    { id: addMonths(thisM, -1), label: 'Last month' },
  ];

  let h = mainBar('Summary');
  h += `<div class="chips top-gap">${ranges
    .map((r) => `<a class="chip${r.id === rangeId ? ' on' : ''}" href="#summary/${r.id}">${r.label}</a>`)
    .join('')}</div>`;

  const young = trackingStart(state) > addDays(t, -27);
  h += card(
    esc(title),
    `<p class="muted">${esc(fmtDay(s.from, { year: true }))} to ${esc(fmtDay(s.to, { year: true }))}. ${s.recorded} of ${plural(s.tracked, 'day')} recorded.</p>
    ${young ? '<div class="note">The diary is less than 4 weeks old. Doctors usually want at least a month of entries, and three is better.</div>' : ''}
    ${!young && s.coverage < 0.9 ? '<div class="note warn">Some days are not filled in, so these counts may be low.</div>' : ''}`,
  );

  const long = s.tracked > 31;
  h += card(
    'Key numbers',
    `<div class="stats">${stat(s.migraineDays, 'migraine days')}${stat(s.medDays, 'medicine days')}${stat(s.doseCount, 'doses taken')}</div>
    ${long ? `<p class="muted small">About ${round1(s.migrainePer30)} migraine days and ${round1(s.medPer30)} medicine days a month.</p>` : ''}
    ${s.missed ? `<p class="muted small">Missed work, school or plans on ${plural(s.missed, 'day')}.</p>` : ''}
    ${
      s.migrainePer30 >= 4 && s.tracked >= 28
        ? '<div class="note warn">That is 4 or more migraine days a month. A 2026 guideline from the American Academy of Neurology and the American Headache Society says doctors should offer preventive treatment at this level. Worth discussing at your next visit.</div>'
        : ''
    }`,
  );

  const months = s.months.filter((m) => m.tracked > 0);
  if (months.length) {
    const rows = months
      .map(
        (m) =>
          `<tr><td><a href="#summary/${m.month}">${esc(fmtMonth(m.month, { short: true }))}</a></td><td class="n">${m.migraine}</td><td class="n">${m.medDays}</td><td class="n">${m.recorded} of ${m.tracked}</td></tr>`,
      )
      .join('');
    h += card(
      'Month by month',
      `<div class="scroll-x"><table class="facts"><thead><tr><th>Month</th><th class="n">Migraine days</th><th class="n">Medicine days</th><th class="n">Recorded</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    );
  }

  const fact = (k, v) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`;
  const dash = muted('-');
  h += card(
    'Migraines',
    `<table class="facts">
      ${fact('Migraines started', `${s.episodes.length}${s.ongoing ? ` (${s.ongoing} still going)` : ''}`)}
      ${fact('Came back after a medicine had made it go', s.cameBackDoses ? plural(s.cameBackDoses, 'time') : 'None')}
      ${fact('Started again within 48 hours of ending', s.returns || 'None')}
      ${fact('Average length', s.avgHours != null ? esc(fmtHours(s.avgHours)) : dash)}
      ${fact('Longest', s.longestHours != null ? esc(fmtHours(s.longestHours)) : dash)}
      ${fact('Average worst pain', s.avgPeak != null ? `${round1(s.avgPeak)} of 10` : dash)}
      ${fact('Worst pain', s.worstPain ?? dash)}
      ${fact('Days you could function', s.levels[1])}
      ${fact('Days you slowed down', s.levels[2])}
      ${fact('Days you had to stop or stay in bed', s.levels[3])}
      ${s.levels.unrated ? fact('Migraine days not rated', s.levels.unrated) : ''}
    </table>`,
  );

  if (s.meds.length) {
    const rated = (a, b) => (b ? `${a} of ${b}` : dash);
    const t1 = s.meds
      .map(
        (m) =>
          `<tr><td>${esc(medLabel(m.med))}<br><span class="muted small">${plural(m.days, 'day')}${m.redosed ? `, re-dosed ${plural(m.redosed, 'time')}` : ''}</span></td><td class="n">${m.doses}</td><td class="n">${rated(m.gone, m.rated)}</td><td class="n">${m.cameBack}</td></tr>`,
      )
      .join('');
    const t2 = s.meds
      .filter((m) => m.early.n || m.later.n)
      .map((m) => `<tr><td>${esc(medLabel(m.med))}</td><td class="n">${rated(m.early.gone, m.early.n)}</td><td class="n">${rated(m.later.gone, m.later.n)}</td></tr>`)
      .join('');
    h += card(
      'Medicines',
      `<div class="scroll-x"><table class="facts"><thead><tr><th>Medicine</th><th class="n">Doses</th><th class="n">Gone at 2 h</th><th class="n">Came back</th></tr></thead><tbody>${t1}</tbody></table></div>
      ${t2 ? `<div class="sub"><h3>Gone at 2 hours, by pain when taken</h3><div class="scroll-x"><table class="facts"><thead><tr><th>Medicine</th><th class="n">Pain 0-3</th><th class="n">Pain 4+</th></tr></thead><tbody>${t2}</tbody></table></div></div>` : ''}
      <p class="hint">Gone means pain-free 2 hours after the dose. Came back means it returned within 24 hours after going. Some trials found triptans work better when taken while pain is still mild.</p>`,
    );
  }

  const n = s.episodes.length;
  if (n) {
    const ranked = (counts, label) =>
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([id, c]) => barRow(label(id), c, n))
        .join('');
    let body = `<div class="sub"><h3>Side</h3>${barRow('Left side only', s.sides.left, n)}${barRow('Right side only', s.sides.right, n)}${barRow('Both sides', s.sides.both, n)}${barRow('Middle only', s.sides.middle, n)}</div>`;
    if (Object.keys(s.locations).length) body += `<div class="sub"><h3>Where</h3>${ranked(s.locations, (id) => labelOf(LOCATIONS, id))}</div>`;
    if (Object.keys(s.qualities).length) body += `<div class="sub"><h3>Feels like</h3>${ranked(s.qualities, (id) => labelOf(QUALITIES, id))}</div>`;
    if (Object.keys(s.symptoms).length) body += `<div class="sub"><h3>Symptoms</h3>${ranked(s.symptoms, symptomLabel)}</div>`;
    if (Object.keys(s.warning).length) body += `<div class="sub"><h3>Warning signs</h3>${ranked(s.warning, (id) => labelOf(WARNING_SIGNS, id))}</div>`;
    body += `<div class="sub"><h3>Aura</h3><p>${s.aura.count} of ${plural(n, 'migraine')}${
      Object.keys(s.aura.types).length ? `: ${esc(Object.keys(s.aura.types).map((id) => labelOf(AURA_TYPES, id)).join(', '))}` : ''
    }</p></div>`;
    if (s.hangover.asked) body += `<div class="sub"><h3>Hangover afterwards</h3><p>${s.hangover.yes} of ${s.hangover.asked} answered</p></div>`;
    h += card(`What your migraines are like <span class="muted small">(${plural(n, 'migraine')})</span>`, body);
  }

  if (state.settings.trackHabits) {
    const any = s.habits.some((hb) => hb.total > 0);
    const body = any
      ? s.habits
          .map((hb) => {
            const inner =
              hb.total < 7
                ? `<p class="muted small">${plural(hb.total, 'day')} so far. Patterns need at least a week or two.</p>`
                : hb.rows
                    .filter((r) => r.days)
                    .map((r) => barRow(`${r.label} (${plural(r.days, 'day')})`, r.migraine, r.days, `${pct(r.migraine, r.days)}%`))
                    .join('');
            return `<div class="sub"><h3>${esc(hb.label)}</h3>${inner}</div>`;
          })
          .join('') + '<p class="hint">Share of those days that were migraine days. These are patterns, not proof, so talk them over with your doctor rather than cutting things out on your own.</p>'
      : '<p class="muted">No habit taps yet.</p>';
    h += card('Habits and migraine days', body);
  }

  for (const p of s.preventives) {
    const rate = (r) => (r.perMonth != null ? round1(r.perMonth) : '-');
    const body = p.med.startedOn
      ? `<p>Started ${esc(fmtDay(p.start, { year: true }))}. Taken on ${p.taken} of ${plural(p.withEntry, 'day')} recorded.</p>
      <p>Migraine days a month: ${rate(p.before)} before, ${rate(p.after)} recently${p.change != null ? ` (${p.change <= 0 ? 'down' : 'up'} ${Math.abs(Math.round(p.change * 100))}%)` : ''}.</p>
      <p class="hint">A drop of 50% or more is the usual goal for a preventive.${p.change == null ? ' The comparison needs at least 2 weeks of diary before and after starting.' : ''}</p>`
      : `<p>Taken on ${p.taken} of ${plural(p.withEntry, 'day')} recorded since ${esc(fmtDay(p.start, { year: true }))}.</p>
      <p class="hint">No start date, so there is no before-and-after comparison. If you start taking it every day, add the start date in Settings.</p>`;
    h += card(esc(medLabel(p.med)), body);
  }

  if (s.midas) {
    const g = midasGrade(s.midas.score);
    h += card('MIDAS score', `<p><b>${s.midas.score}</b>, grade ${g.grade}: ${esc(g.label)}. Filled in ${esc(fmtDay(s.midas.date, { year: true }))}.</p>`);
  }

  if (s.stopped.length) {
    h += card('Medicines stopped', `<ul class="plain">${s.stopped.map((m) => `<li>${esc(medLabel(m))}${m.brand ? ` (${esc(m.brand)})` : ''}</li>`).join('')}</ul>`);
  }

  h += `<div class="stack page-end">
    <button type="button" class="btn" data-act="save-pdf">Save or print as PDF</button>
    <button type="button" class="btn" data-act="share-summary">Share as text</button>
    <p class="hint">The PDF and text also say, for your doctor, whether medicine days are at a level where rebound headache is possible.</p>
    <a class="btn" href="#midas">Fill in the MIDAS questionnaire</a>
  </div>`;
  return h;
}

// ---------- MIDAS ----------

function viewMidas() {
  const t = todayKey();
  const s = summarize(state, addDays(t, -89), t, t);
  const d = useDraft('#midas', () => ({
    q: [null, null, null, null, null],
    a: s.migraineDays || null,
    b: s.avgDayPain != null ? Math.round(s.avgDayPain) : null,
  }));
  let h = bar('MIDAS', { back: '#summary', cancel: true });
  h += '<p class="hint top-gap">Five questions about the last 3 months. Write 0 if one does not apply. Doctors use the score to see how much migraine affects your life, and the change between visits matters most.</p>';
  MIDAS_QUESTIONS.forEach((q, i) => {
    h += section(`${i + 1}. ${esc(q)}`, numInput(`q.${i}`, d.q[i]));
  });
  h += section(
    `A. ${esc(MIDAS_EXTRA[0])}`,
    numInput('a', d.a),
    `Your diary shows ${plural(s.migraineDays, 'migraine day')} in the last 90 days${s.coverage < 0.9 ? ', though some days are not filled in' : ''}.`,
  );
  h += section(`B. ${esc(MIDAS_EXTRA[1])}`, numInput('b', d.b, 10), s.avgDayPain != null ? `Your diary's average worst pain on migraine days is ${round1(s.avgDayPain)}.` : '');
  const past = state.midas.slice().sort((a, b) => b.date.localeCompare(a.date));
  if (past.length) {
    h += section(
      'Past scores',
      `<table class="facts">${past.map((m) => `<tr><td>${esc(fmtDay(m.date, { year: true }))}</td><td class="n">${m.score}, grade ${midasGrade(m.score).grade}</td></tr>`).join('')}</table>`,
    );
  }
  h += '<p class="hint small page-end">MIDAS questionnaire copyright Innovative Medical Research, 1997.</p>';
  return h + saveBar('save-midas', 'Save score');
}

function saveMidas() {
  const d = draft;
  if (d.q.some((v) => v == null || isNaN(v) || v < 0)) return toast('Answer all five questions. Write 0 if one does not apply.');
  const score = d.q.reduce((a, b) => a + b, 0);
  state.midas.push({ date: todayKey(), answers: d.q, headacheDays: d.a, avgPain: d.b, score });
  if (commit()) {
    dropDraft();
    const g = midasGrade(score);
    toast(`Score ${score}: ${g.label}`);
    go('#summary');
  }
}

export const views = { summary: viewSummary, midas: viewMidas };

export const actions = {
  'save-midas': saveMidas,
  'save-pdf': async () => {
    if (!lastSummary) return;
    const t = todayKey();
    const blocks = summaryBlocks(state, lastSummary.s, lastSummary.title, t);
    const bytes = makePdf(blocks, { title: `Migraine Diary summary: ${lastSummary.title}`, footer: `Migraine Diary, made ${fmtDay(t, { year: true })}` });
    await shareFiles([new File([bytes], `migraine-summary-${t}.pdf`, { type: 'application/pdf' })], 'Migraine summary');
  },
  'share-summary': async () => {
    if (!lastSummary) return;
    await shareText(blocksToText(summaryBlocks(state, lastSummary.s, lastSummary.title, todayKey())), 'Migraine summary');
  },
};
