// The Meds tab: how much medicine was taken and how often, as plain counts
// with no limits, and every dose in a list that opens for editing.

import { RESULTS } from '../defaults.js';
import { dayKey, addDays, fmtDay, fmtTime, fmtDateTime, fmtAgo } from '../dates.js';
import { state } from '../model.js';
import { medUse, medFor, medLabel, isDaily } from '../stats.js';
import { mainBar, card, stat } from '../ui.js';
import { render } from '../router.js';
import { esc, plural, labelOf } from '../util.js';

// How many days back the dose list reaches; "Show earlier" adds more.
let logDays = 30;

const word = (n, one, many) => (n === 1 ? one : many);

// Doses per day for the last 30 days, as thin columns from one baseline. Each
// column opens its day.
function doseStrip(perDay, today) {
  const most = Math.max(...perDay.map((p) => p.doses));
  const top = Math.max(3, most);
  const cols = perDay
    .map((p) => {
      const label = `${fmtDay(p.key)}: ${plural(p.doses, 'dose')}`;
      const h = p.doses ? Math.max(8, Math.round((p.doses / top) * 100)) : 0;
      return `<a class="col${p.key === today ? ' today' : ''}" href="#day/${p.key}" aria-label="${esc(label)}" title="${esc(label)}">${h ? `<i style="height:${h}%"></i>` : ''}</a>`;
    })
    .join('');
  const peakDay = most ? perDay.filter((p) => p.doses === most).pop() : null;
  return `<div class="strip" role="group" aria-label="Doses per day, last 30 days">${cols}</div>
    <div class="strip-axis"><span>${esc(fmtDay(perDay[0].key, { weekday: false }))}</span><span>Today</span></div>
    ${peakDay ? `<p class="small muted">Most in one day: ${plural(most, 'dose')}, ${esc(fmtDay(peakDay.key))}. Tap a day to open it.</p>` : '<p class="small muted">No doses in the last 30 days.</p>'}`;
}

function medRow(r, now, on) {
  return `<a class="list-item med-row${on ? ' on' : ''}" href="${on ? '#meds' : `#meds/${r.med.id}`}">
    <span class="card-head"><b>${esc(medLabel(r.med))}</b><span class="muted small">${esc(fmtAgo(r.last.time, now))}</span></span>
    <span class="muted small">7 days: ${plural(r.d7, 'dose')}${r.d7 ? ` on ${plural(r.days7, 'day')}` : ''}. 30 days: ${plural(r.d30, 'dose')}${r.d30 ? ` on ${plural(r.days30, 'day')}` : ''}.</span>
  </a>`;
}

function doseLog(doses, now, { from = null } = {}) {
  if (!doses.length) return '<p class="muted">No doses logged yet. Tap a medicine on the Today tab to log one.</p>';
  const byDay = new Map();
  for (const d of doses) {
    const k = dayKey(d.time);
    if (from && k < from) continue;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(d);
  }
  if (!byDay.size) return `<p class="muted">No doses since ${esc(fmtDay(from))}.</p>`;
  let h = '';
  for (const [k, list] of byDay) {
    h += `<p class="log-day">${esc(fmtDay(k))}<span>${plural(list.length, 'dose')}</span></p>`;
    for (const d of list) {
      const bits = [d.pain != null ? `pain ${d.pain}` : '', d.result ? labelOf(RESULTS, d.result) : '', d.episodeId ? 'during a migraine' : ''].filter(Boolean);
      h += `<a class="log-row" href="#dose/${d.id}"><span class="t">${esc(fmtTime(d.time))}</span><span class="w"><b>${esc(medLabel(medFor(state, d)))}</b>${bits.length ? `<small>${esc(bits.join(', '))}</small>` : ''}</span></a>`;
    }
  }
  return h;
}

function viewMeds(arg) {
  const now = new Date();
  const use = medUse(state, now);
  const filter = arg ? use.rows.find((r) => r.med.id === arg) : null;
  let h = mainBar('Medicines', '<a class="link" href="#dose">Log a dose</a>');

  h += `<section class="card"><h2>How often</h2><div class="stats">${stat(use.today, word(use.today, 'dose today', 'doses today'))}${stat(
    use.d7,
    word(use.d7, 'dose in 7 days', 'doses in 7 days'),
    use.d7 ? `on ${plural(use.days7, 'day')}` : '',
  )}${stat(use.d30, word(use.d30, 'dose in 30 days', 'doses in 30 days'), use.d30 ? `on ${plural(use.days30, 'day')}` : '')}</div>
    ${use.last ? `<p class="small muted">Last dose: ${esc(medLabel(medFor(state, use.last)))}, ${esc(fmtDateTime(use.last.time))} (${esc(fmtAgo(use.last.time, now))}).</p>` : ''}</section>`;

  h += card('Doses per day', doseStrip(use.perDay, use.day));

  if (use.rows.length) {
    h += card(
      'By medicine',
      `${use.rows.map((r) => medRow(r, now, filter && filter.med.id === r.med.id)).join('')}<p class="hint">Tap one to see only its doses.</p>`,
    );
  }

  if (use.daily.length) {
    const rows = use.daily
      .map(
        (s) =>
          `<div class="card-head supp"><span><b>${esc(medLabel(s.med))}</b>${s.today ? ' <span class="pill lv1">today</span>' : ''}</span><span class="muted small">${s.d7} of 7 days, ${s.d30} of 30</span></div>`,
      )
      .join('');
    h += card('Daily supplements', `${rows}<p class="hint">Ticked on the Today tab.</p>`);
  }

  const all = state.doses
    .filter((d) => !isDaily(medFor(state, d).kind))
    .filter((d) => !filter || d.medId === filter.med.id)
    .sort((a, b) => b.time.localeCompare(a.time));
  if (filter) {
    h += card(
      `${esc(medLabel(filter.med))}: every dose`,
      `<a class="link" href="#meds">Show all medicines</a>${doseLog(all, now)}`,
    );
  } else {
    const from = addDays(use.day, -(logDays - 1));
    const older = all.some((d) => dayKey(d.time) < from);
    h += card(
      `Dose log <span class="muted small">(last ${logDays} days)</span>`,
      doseLog(all, now, { from }) + (older ? '<button type="button" class="btn top-gap" data-act="meds-more">Show earlier doses</button>' : ''),
    );
  }
  return h;
}

export const views = { meds: viewMeds };

export const actions = {
  'meds-more': () => {
    logDays += 60;
    render();
  },
};
