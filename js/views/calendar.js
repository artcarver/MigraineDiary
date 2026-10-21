// The Calendar tab: a month of traffic-light days with medicine marks, and
// that month's migraines.

import { LEVELS } from '../defaults.js';
import { todayKey, dayRange, monthKey, addMonths, monthBounds, parseDay, hoursBetween, fmtDay, fmtMonth, fmtHours } from '../dates.js';
import { state } from '../model.js';
import { makeIndex, summarize, episodeStartKey, episodeEndKey, episodePeak } from '../stats.js';
import { mainBar, card, stat } from '../ui.js';
import { esc, plural } from '../util.js';

function episodeItem(e, info, t) {
  const startK = episodeStartKey(e);
  const endK = episodeEndKey(e, t);
  const hours = hoursBetween(e.start, e.end || new Date().toISOString());
  const peak = episodePeak(state, e, info, t);
  const n = state.doses.filter((d) => d.episodeId === e.id).length;
  const bits = [fmtHours(hours), peak != null ? `worst pain ${peak}` : '', e.returnOf ? 'came back' : '', n ? plural(n, 'dose') : ''].filter(Boolean);
  return `<a class="list-item" href="#episode/${e.id}"><b>${esc(fmtDay(startK))}${endK !== startK ? ` to ${esc(fmtDay(endK))}` : ''}</b>${e.end ? '' : ' <span class="pill lv3">going on</span>'}<br><span class="muted">${esc(bits.join(', '))}</span></a>`;
}

function viewCalendar(arg) {
  const t = todayKey();
  const m = arg && /^\d{4}-\d{2}$/.test(arg) ? arg : monthKey(t);
  const info = makeIndex(state, t);
  const { from, to } = monthBounds(m);
  const prevM = addMonths(m, -1);
  const nextM = addMonths(m, 1);

  let cells = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => `<div class="dow">${x}</div>`).join('');
  for (let i = 0; i < parseDay(from).getDay(); i++) cells += '<div class="cell blank"></div>';
  for (const k of dayRange(from, to)) {
    const n = Number(k.slice(8));
    if (k > t) {
      cells += `<div class="cell future">${n}</div>`;
      continue;
    }
    const i = info(k);
    let cls = 'cell';
    if (i.level != null) cls += ` lv${i.level}`;
    else if (i.inEpisode) cls += ' ep';
    if (k === t) cls += ' today';
    const label = [
      fmtDay(k),
      i.level != null ? LEVELS[i.level].label : i.inEpisode ? 'during a migraine, not rated' : 'not filled in',
      i.medDay ? 'medicine taken' : '',
    ]
      .filter(Boolean)
      .join(', ');
    cells += `<button type="button" class="${cls}" data-act="go" data-href="#day/${k}" aria-label="${esc(label)}">${n}${i.medDay ? '<span class="dot"></span>' : ''}</button>`;
  }

  let h = mainBar('Calendar');
  h += `<div class="cal-head"><a class="btn small" href="#calendar/${prevM}">Previous</a><h2>${esc(fmtMonth(m))}</h2>${
    nextM <= monthKey(t) ? `<a class="btn small" href="#calendar/${nextM}">Next</a>` : '<span class="btn small invisible" aria-hidden="true">Next</span>'
  }</div>`;
  h += `<div class="cal">${cells}</div>`;
  h += `<div class="legend">
    <span><i class="lv0"></i>No migraine</span><span><i class="lv1"></i>Could function</span>
    <span><i class="lv2"></i>Slowed down</span><span><i class="lv3"></i>Had to stop</span>
    <span><i class="ep"></i>Migraine, not rated</span><span><i class="none"></i>Not filled in</span>
    <span><i class="dotkey"></i>Medicine</span>
  </div>`;
  if (from <= t) {
    const s = summarize(state, from, to, t);
    h += `<div class="stats top-gap">${stat(s.migraineDays, s.migraineDays === 1 ? 'migraine day' : 'migraine days')}${stat(s.medDays, s.medDays === 1 ? 'medicine day' : 'medicine days')}${stat(s.doseCount, s.doseCount === 1 ? 'dose taken' : 'doses taken')}</div>`;
  }
  const eps = state.episodes
    .filter((e) => episodeStartKey(e) <= to && episodeEndKey(e, t) >= from)
    .sort((a, b) => b.start.localeCompare(a.start));
  h += card('Migraines this month', eps.length ? eps.map((e) => episodeItem(e, info, t)).join('') : '<p class="muted">None this month.</p>');
  return h;
}

export const views = { calendar: viewCalendar };
export const actions = {};
