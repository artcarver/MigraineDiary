// Everything the app counts. Pure functions of the saved data plus "today",
// so the same numbers come out on the phone and in the tests.

import { MED_KINDS, COMBINED_LIMIT, LOCATIONS, HABITS } from './defaults.js';
import { dayKey, addDays, dayRange, diffDays, hoursBetween, monthKey, monthBounds, addMonths } from './dates.js';

const HOUR = 3600000;
const OVERUSE_KINDS = Object.keys(MED_KINDS).filter((k) => MED_KINDS[k].overuseLimit);

export function medFor(state, dose) {
  return (
    state.settings.meds.find((m) => m.id === dose.medId) || {
      id: dose.medId,
      name: dose.name || 'Medicine',
      dose: dose.dose || '',
      kind: dose.kind || 'other',
      active: false,
    }
  );
}

export const kindOf = (state, dose) => medFor(state, dose).kind;
export const isDaily = (kind) => !!MED_KINDS[kind]?.daily;

export function medLabel(med) {
  return med.dose ? `${med.name} ${med.dose}` : med.name;
}

export const episodeStartKey = (ep) => dayKey(ep.start);
export const episodeEndKey = (ep, today) => (ep.end ? dayKey(ep.end) : today);

export function ongoingEpisode(state) {
  return state.episodes.filter((e) => !e.end).sort((a, b) => b.start.localeCompare(a.start))[0] || null;
}

export function episodeDayNumber(ep, key) {
  return diffDays(episodeStartKey(ep), key) + 1;
}

// The first day the diary knows about: when the app was first opened, or
// earlier if past migraines were entered.
export function trackingStart(state) {
  let start = state.startedOn;
  for (const k of Object.keys(state.days)) if (k < start) start = k;
  for (const e of state.episodes) if (episodeStartKey(e) < start) start = episodeStartKey(e);
  for (const d of state.doses) if (dayKey(d.time) < start) start = dayKey(d.time);
  return start;
}

// Returns a function giving the facts for one day. A day counts as a
// migraine day when it was rated 1-3, or when it falls inside a migraine
// entry and was never rated. Rating a day inside an entry "No migraine"
// marks a pain-free gap.
export function makeIndex(state, today) {
  const dosesByDay = new Map();
  for (const d of state.doses) {
    const k = dayKey(d.time);
    if (!dosesByDay.has(k)) dosesByDay.set(k, []);
    dosesByDay.get(k).push(d);
  }
  const spans = state.episodes.map((e) => ({ e, from: episodeStartKey(e), to: episodeEndKey(e, today) }));
  const cache = new Map();
  return function info(key) {
    if (cache.has(key)) return cache.get(key);
    const entry = state.days[key] || null;
    const episodes = spans.filter((s) => s.from <= key && key <= s.to).map((s) => s.e);
    const doses = (dosesByDay.get(key) || []).slice().sort((a, b) => a.time.localeCompare(b.time));
    const level = entry && entry.level != null ? entry.level : null;
    const inEpisode = episodes.length > 0;
    const migraine = level != null ? level >= 1 : inEpisode;
    const acute = doses.filter((d) => !isDaily(kindOf(state, d)));
    const pains = [];
    if (entry && entry.peakPain != null) pains.push(entry.peakPain);
    for (const e of episodes) if (episodeStartKey(e) === key && e.pain != null) pains.push(e.pain);
    for (const d of acute) if (d.pain != null) pains.push(d.pain);
    const res = {
      key,
      entry,
      level,
      episodes,
      inEpisode,
      migraine,
      recorded: level != null || inEpisode,
      doses,
      medDay: acute.length > 0,
      kinds: new Set(acute.map((d) => kindOf(state, d))),
      peakPain: migraine && pains.length ? Math.max(...pains) : null,
      period: !!(entry && entry.period),
    };
    cache.set(key, res);
    return res;
  };
}

function limitStatus(days, limit) {
  if (days >= limit) return 'over';
  if (days >= Math.ceil(limit * 0.8)) return 'near';
  return 'ok';
}

const STATUS_RANK = { ok: 0, near: 1, over: 2 };

function overuseFromCounts(counts, any) {
  const used = OVERUSE_KINDS.filter((k) => counts[k] > 0);
  const rows = used.map((kind) => ({
    kind,
    label: MED_KINDS[kind].label,
    days: counts[kind],
    limit: MED_KINDS[kind].overuseLimit,
    status: limitStatus(counts[kind], MED_KINDS[kind].overuseLimit),
  }));
  // ICHD-3 also counts mixed use: 10 or more days in total across classes,
  // even when no single class reaches its own limit.
  const combined = used.length >= 2 ? { days: any, limit: COMBINED_LIMIT, status: limitStatus(any, COMBINED_LIMIT) } : null;
  let status = 'ok';
  for (const r of [...rows, combined].filter(Boolean)) if (STATUS_RANK[r.status] > STATUS_RANK[status]) status = r.status;
  return { rows, combined, status, any };
}

function countOveruse(info, keys) {
  const counts = Object.fromEntries(OVERUSE_KINDS.map((k) => [k, 0]));
  let any = 0;
  for (const k of keys) {
    const i = info(k);
    let hit = false;
    for (const kind of OVERUSE_KINDS) {
      if (i.kinds.has(kind)) {
        counts[kind]++;
        hit = true;
      }
    }
    if (hit) any++;
  }
  return { counts, any };
}

// Medicine days in the 30 days ending on endKey, against the overuse limits.
export function overuseWindow(state, endKey, today, days = 30, info = makeIndex(state, today)) {
  const from = addDays(endKey, -(days - 1));
  const { counts, any } = countOveruse(info, dayRange(from, endKey));
  return { from, to: endKey, ...overuseFromCounts(counts, any) };
}

const t = (iso) => new Date(iso).getTime();

// A dose "came back" when it was rated Gone and the migraine returned within
// 24 hours: another dose at least an hour later, or a new entry marked as the
// same migraine coming back.
export function cameBack(state, dose) {
  if (dose.result !== 'gone') return false;
  const at = t(dose.time);
  const laterDose = state.doses.some((o) => {
    if (o.id === dose.id || isDaily(kindOf(state, o))) return false;
    const gap = t(o.time) - at;
    return gap >= HOUR && gap <= 24 * HOUR;
  });
  if (laterDose) return true;
  return state.episodes.some((e) => {
    if (!e.returnOf || e.returnOf !== dose.episodeId) return false;
    const gap = t(e.start) - at;
    return gap > 0 && gap <= 24 * HOUR;
  });
}

function redosed(state, dose) {
  const at = t(dose.time);
  return state.doses.some((o) => o.id !== dose.id && o.medId === dose.medId && t(o.time) < at && at - t(o.time) <= 24 * HOUR);
}

export function episodePeak(state, ep, info, today) {
  const pains = ep.pain != null ? [ep.pain] : [];
  for (const k of dayRange(episodeStartKey(ep), episodeEndKey(ep, today))) {
    const i = info(k);
    if (i.entry && i.entry.peakPain != null && i.migraine) pains.push(i.entry.peakPain);
  }
  for (const d of state.doses) if (d.episodeId === ep.id && d.pain != null) pains.push(d.pain);
  return pains.length ? Math.max(...pains) : null;
}

export function episodeSymptoms(state, ep, today) {
  const set = new Set(ep.symptoms);
  for (const k of dayRange(episodeStartKey(ep), episodeEndKey(ep, today))) {
    const s = state.days[k] && state.days[k].symptoms;
    if (s) s.forEach((x) => set.add(x));
  }
  return [...set];
}

export function episodeSides(ep) {
  const sides = new Set();
  for (const id of ep.locations) {
    const loc = LOCATIONS.find((l) => l.id === id);
    if (loc) sides.add(loc.side);
  }
  const l = sides.has('L');
  const r = sides.has('R');
  if (l && r) return 'both';
  if (l) return 'left';
  if (r) return 'right';
  if (sides.has('M')) return 'middle';
  return null;
}

function perMedicine(state, doses) {
  const byMed = new Map();
  for (const d of doses) {
    const med = medFor(state, d);
    if (isDaily(med.kind)) continue;
    if (!byMed.has(med.id)) {
      byMed.set(med.id, {
        med,
        doses: 0,
        days: new Set(),
        rated: 0,
        gone: 0,
        better: 0,
        same: 0,
        cameBack: 0,
        redosed: 0,
        early: { n: 0, gone: 0 },
        later: { n: 0, gone: 0 },
      });
    }
    const s = byMed.get(med.id);
    s.doses++;
    s.days.add(dayKey(d.time));
    if (d.result) {
      s.rated++;
      s[d.result]++;
      if (d.pain != null) {
        const bucket = d.pain <= 3 ? s.early : s.later;
        bucket.n++;
        if (d.result === 'gone') bucket.gone++;
      }
    }
    if (cameBack(state, d)) s.cameBack++;
    if (redosed(state, d)) s.redosed++;
  }
  return [...byMed.values()].map((s) => ({ ...s, days: s.days.size })).sort((a, b) => b.doses - a.doses);
}

function migraineRate(info, keys) {
  let tracked = 0;
  let migraine = 0;
  for (const k of keys) {
    tracked++;
    if (info(k).migraine) migraine++;
  }
  return { tracked, migraine, perMonth: tracked ? (migraine / tracked) * 30 : null };
}

export function monthRows(state, today, count = 6, info = makeIndex(state, today)) {
  const start = trackingStart(state);
  const rows = [];
  let m = monthKey(today);
  for (let n = 0; n < count; n++) {
    const b = monthBounds(m);
    const from = b.from < start ? start : b.from;
    const to = b.to > today ? today : b.to;
    if (from > to) break;
    const keys = dayRange(from, to);
    let recorded = 0;
    let migraine = 0;
    let medDays = 0;
    for (const k of keys) {
      const i = info(k);
      if (i.recorded) recorded++;
      if (i.migraine) migraine++;
      if (i.medDay) medDays++;
    }
    const { counts, any } = countOveruse(info, keys);
    rows.push({ month: m, from, to, tracked: keys.length, recorded, migraine, medDays, counts, overuse: overuseFromCounts(counts, any) });
    m = addMonths(m, -1);
  }
  return rows;
}

function preventiveStart(state, med) {
  if (med.startedOn) return med.startedOn;
  const keys = Object.keys(state.days)
    .filter((k) => state.days[k].preventive && state.days[k].preventive[med.id])
    .sort();
  return keys[0] || null;
}

function preventives(state, info, tStart, to) {
  const out = [];
  for (const med of state.settings.meds.filter((m) => m.kind === 'preventive')) {
    const start = preventiveStart(state, med);
    if (!start || start > to) continue;
    let taken = 0;
    let withEntry = 0;
    for (const k of dayRange(start, to)) {
      const e = state.days[k];
      if (!e) continue;
      withEntry++;
      if (e.preventive && e.preventive[med.id]) taken++;
    }
    const beforeFrom = addDays(start, -90) < tStart ? tStart : addDays(start, -90);
    const before = migraineRate(info, dayRange(beforeFrom, addDays(start, -1)));
    const afterFrom = addDays(to, -89) < start ? start : addDays(to, -89);
    const after = migraineRate(info, dayRange(afterFrom, to));
    // Before-and-after only means something with a real start date, not for
    // something taken on and off.
    const comparable = !!med.startedOn && before.tracked >= 14 && after.tracked >= 14 && before.perMonth > 0;
    out.push({
      med,
      start,
      taken,
      withEntry,
      before,
      after,
      change: comparable ? (after.perMonth - before.perMonth) / before.perMonth : null,
    });
  }
  return out;
}

function habitRows(info, keys) {
  return HABITS.map((h) => {
    const rows = h.options.map((o) => ({ ...o, days: 0, migraine: 0 }));
    let total = 0;
    for (const k of keys) {
      const i = info(k);
      const v = i.entry && i.entry.habits && i.entry.habits[h.id];
      const row = rows.find((r) => r.id === v);
      if (!row || !i.recorded) continue;
      total++;
      row.days++;
      if (i.migraine) row.migraine++;
    }
    return { ...h, rows, total };
  });
}

function periodPattern(info, keys) {
  const starts = keys.filter((k) => info(k).period);
  let withMigraine = 0;
  for (const s of starts) {
    // ICHD-3 window: day 1 of the period plus or minus 2 days (days -2 to +3,
    // with no day 0), which is two calendar days either side of day 1.
    if (dayRange(addDays(s, -2), addDays(s, 2)).some((k) => info(k).migraine)) withMigraine++;
  }
  return { starts, withMigraine };
}

function countIds(lists) {
  const counts = {};
  for (const list of lists) for (const id of list) counts[id] = (counts[id] || 0) + 1;
  return counts;
}

export function summarize(state, from, to, today) {
  const info = makeIndex(state, today);
  const tStart = trackingStart(state);
  const effFrom = from < tStart ? tStart : from;
  const effTo = to > today ? today : to;
  const keys = dayRange(effFrom, effTo);

  let recorded = 0;
  let migraineDays = 0;
  let medDays = 0;
  let missed = 0;
  const levels = { 1: 0, 2: 0, 3: 0, unrated: 0 };
  const dayPains = [];
  for (const k of keys) {
    const i = info(k);
    if (i.recorded) recorded++;
    if (i.medDay) medDays++;
    if (!i.migraine) continue;
    migraineDays++;
    if (i.level >= 1) levels[i.level]++;
    else levels.unrated++;
    if (i.peakPain != null) dayPains.push(i.peakPain);
    if (i.entry && i.entry.missed) missed++;
  }
  const tracked = keys.length;
  const per30 = (n) => (tracked ? (n / tracked) * 30 : 0);

  const started = state.episodes
    .filter((e) => episodeStartKey(e) >= effFrom && episodeStartKey(e) <= effTo)
    .sort((a, b) => a.start.localeCompare(b.start));
  const lengths = started.filter((e) => e.end).map((e) => hoursBetween(e.start, e.end));
  const peaks = started.map((e) => episodePeak(state, e, info, today)).filter((p) => p != null);
  const sides = { left: 0, right: 0, both: 0, middle: 0 };
  for (const e of started) {
    const s = episodeSides(e);
    if (s) sides[s]++;
  }
  const doses = state.doses
    .filter((d) => dayKey(d.time) >= effFrom && dayKey(d.time) <= effTo)
    .sort((a, b) => a.time.localeCompare(b.time));
  const meds = perMedicine(state, doses);
  const auraEps = started.filter((e) => e.aura);
  const hangoverAsked = started.filter((e) => e.hangover != null);

  return {
    from: effFrom,
    to: effTo,
    tracked,
    recorded,
    coverage: tracked ? recorded / tracked : 0,
    migraineDays,
    migrainePer30: per30(migraineDays),
    medDays,
    medPer30: per30(medDays),
    levels,
    missed,
    avgDayPain: dayPains.length ? dayPains.reduce((a, b) => a + b, 0) / dayPains.length : null,
    worstPain: peaks.length ? Math.max(...peaks) : dayPains.length ? Math.max(...dayPains) : null,
    episodes: started,
    ongoing: started.filter((e) => !e.end).length,
    returns: started.filter((e) => e.returnOf).length,
    cameBackDoses: doses.filter((d) => cameBack(state, d)).length,
    avgHours: lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : null,
    longestHours: lengths.length ? Math.max(...lengths) : null,
    avgPeak: peaks.length ? peaks.reduce((a, b) => a + b, 0) / peaks.length : null,
    sides,
    locations: countIds(started.map((e) => e.locations)),
    qualities: countIds(started.map((e) => e.quality)),
    symptoms: countIds(started.map((e) => episodeSymptoms(state, e, today))),
    warning: countIds(started.map((e) => e.warning)),
    aura: { count: auraEps.length, types: countIds(auraEps.map((e) => e.aura.types || [])) },
    hangover: { yes: hangoverAsked.filter((e) => e.hangover).length, asked: hangoverAsked.length },
    meds,
    habits: habitRows(info, keys),
    periods: periodPattern(info, keys),
    preventives: preventives(state, info, tStart, effTo),
    overuse: overuseWindow(state, effTo, today, 30, info),
    months: monthRows(state, today, 6, info),
    midas: state.midas.slice().sort((a, b) => b.date.localeCompare(a.date))[0] || null,
    stopped: state.settings.meds.filter((m) => !m.active),
  };
}

// Past days, newest first, with nothing recorded, back to the tracking start.
export function missingDays(state, today, limit = 14) {
  const info = makeIndex(state, today);
  const start = trackingStart(state);
  const out = [];
  let k = addDays(today, -1);
  while (k >= start && out.length < limit && diffDays(k, today) <= 60) {
    const i = info(k);
    if (i.level == null) out.push({ key: k, inEpisode: i.inEpisode });
    k = addDays(k, -1);
  }
  return out;
}

// Doses taken at least two hours ago that still need a "did it help?" answer.
export function dosesToRate(state, now = new Date()) {
  return state.doses
    .filter((d) => !d.result && !isDaily(kindOf(state, d)) && now - new Date(d.time) >= 2 * HOUR)
    .sort((a, b) => a.time.localeCompare(b.time));
}

// The episode that ended within 48 hours before a new start, if any.
export function recentlyEnded(state, startIso, excludeId = null) {
  const at = t(startIso);
  return (
    state.episodes
      .filter((e) => e.end && e.id !== excludeId)
      .filter((e) => {
        const gap = at - t(e.end);
        return gap >= 0 && gap <= 48 * HOUR;
      })
      .sort((a, b) => b.end.localeCompare(a.end))[0] || null
  );
}

// Best guess at the pain right now, for prefilling forms.
export function lastPain(state, ep, today) {
  const entry = state.days[today];
  if (entry && entry.peakPain != null) return entry.peakPain;
  const doses = state.doses.filter((d) => d.episodeId === ep.id && d.pain != null).sort((a, b) => b.time.localeCompare(a.time));
  if (doses.length) return doses[0].pain;
  return ep.pain;
}
