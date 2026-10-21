// Parts of screens that read the diary: medicine buttons, dose lists, and the
// optional habit and supplement sections, with the taps that go with them.

import { MED_KINDS, HABITS } from './defaults.js';
import { dayKey, todayKey, toLocalInput, fmtDateTime } from './dates.js';
import { state, draft, activeMeds, preventiveMeds, med, storeDraft, commit } from './model.js';
import { medFor, medLabel, isDaily } from './stats.js';
import { chips, section, switchRow, painSelect, rateButtons } from './ui.js';
import { render } from './router.js';
import { esc } from './util.js';

export const KIND_ORDER = ['triptan', 'simple', 'combo', 'gepant', 'allergy', 'other'];

// Active medicines (not daily supplements), grouped by type, with how many
// doses of each were taken today. Pass `selectedId` (even null) when the
// buttons pick one medicine rather than act straight away. `compact` drops
// the type headings and brand notes where space matters most.
export function medButtons(act, selectedId, { compact = false } = {}) {
  const meds = activeMeds();
  if (!meds.length) return `<p class="muted">No medicines yet. Add them in <a href="#settings">Settings</a>.</p>`;
  const t = todayKey();
  const pick = selectedId !== undefined;
  let h = `<div class="med-list cols">`;
  for (const kind of KIND_ORDER) {
    const group = meds.filter((m) => m.kind === kind);
    if (!group.length) continue;
    if (!compact) h += `<p class="med-group">${esc(MED_KINDS[kind].label)}</p>`;
    for (const m of group) {
      const n = state.doses.filter((x) => x.medId === m.id && dayKey(x.time) === t).length;
      const on = pick && selectedId === m.id;
      const inner = compact
        ? `<span>${esc(m.name)}</span><small>${esc([m.dose, n ? `${n} today` : ''].filter(Boolean).join(', '))}</small>`
        : `<span>${esc(medLabel(m))}</span>${m.brand ? `<small>${esc(m.brand)}</small>` : ''}${n ? `<span class="count">${n} today</span>` : ''}`;
      h += `<button type="button" class="med-btn${on ? ' on' : ''}" data-act="${act}" data-med="${m.id}"${pick ? ` aria-pressed="${on}"` : ''}${compact ? ` aria-label="${esc(medLabel(m))}${n ? `, ${n} today` : ''}"` : ''}>${inner}</button>`;
    }
  }
  return h + '</div>';
}

// Doses being added in a form, before it is saved.
export function doseEditor(d) {
  let h = '';
  d.doses.forEach((x, i) => {
    const m = med(x.medId) || { name: 'Medicine', dose: '' };
    h += `<div class="dose"><div class="dose-head"><b>${esc(medLabel(m))}</b><button type="button" class="link danger" data-act="remove-dose" data-i="${i}">Remove</button></div><div class="two"><label class="input"><span>Time</span><input type="datetime-local" data-bind="doses.${i}.time" value="${esc(x.time)}"></label><label class="input"><span>Pain then</span>${painSelect(`doses.${i}.pain`, x.pain)}</label></div></div>`;
  });
  return h + medButtons('add-dose', undefined, { compact: true });
}

// Saved doses with their "did it help?" answer. With `edit`, each links to
// its own page; otherwise it can be deleted in place.
export function existingDoses(doses, { edit = false } = {}) {
  return doses
    .filter((d) => !isDaily(medFor(state, d).kind))
    .map((d) => {
      const action = edit
        ? `<a class="link" href="#dose/${d.id}">Edit</a>`
        : `<button type="button" class="link danger" data-act="delete-dose" data-dose="${d.id}">Delete</button>`;
      return `<div class="dose"><div class="dose-head"><b>${esc(medLabel(medFor(state, d)))}</b>${action}</div><p class="small muted">${esc(fmtDateTime(d.time))}${d.pain != null ? `, pain ${d.pain}` : ''}</p>${rateButtons(d)}</div>`;
    })
    .join('');
}

// Habit taps and daily supplements, at the end of the day and migraine forms.
export function extras(d) {
  let h = '';
  if (state.settings.trackHabits) {
    const body = HABITS.map(
      (hb) => `<div class="sub"><h3>${esc(hb.label)}</h3>${chips('habits.' + hb.id, hb.options, (d.habits || {})[hb.id])}</div>`,
    ).join('');
    h += section('Habits', body, 'Optional. Things you can change, so patterns can show up over time.');
  }
  const prevs = preventiveMeds();
  if (prevs.length) {
    h += section('Daily supplements', prevs.map((m) => switchRow(`preventive.${m.id}`, (d.preventive || {})[m.id], `Took ${medLabel(m)}`)).join(''));
  }
  return h;
}

export const actions = {
  'add-dose': (el) => {
    const d = draft;
    if (!d) return;
    let time;
    let pain;
    if (d.route === '#new') {
      time = d.startMode === 'pick' && d.stillGoing === false ? d.start : toLocalInput(new Date());
      pain = d.pain;
    } else {
      time = d.key === todayKey() ? toLocalInput(new Date()) : `${d.key}T12:00`;
      pain = d.peakPain;
    }
    d.doses.push({ medId: el.dataset.med, time, pain: pain ?? null });
    storeDraft();
    render();
  },
  'remove-dose': (el) => {
    if (!draft) return;
    draft.doses.splice(Number(el.dataset.i), 1);
    storeDraft();
    render();
  },
  'delete-dose': (el) => {
    if (!window.confirm('Delete this dose?')) return;
    state.doses = state.doses.filter((d) => d.id !== el.dataset.dose);
    commit();
    render();
  },
  rate: (el) => {
    const d = state.doses.find((x) => x.id === el.dataset.dose);
    if (!d) return;
    d.result = d.result === el.dataset.val ? null : el.dataset.val;
    d.ratedAt = d.result ? new Date().toISOString() : null;
    commit();
    render();
  },
  // Stop asking "did it help?" about this dose.
  'no-rate': (el) => {
    const d = state.doses.find((x) => x.id === el.dataset.dose);
    if (!d) return;
    d.noRate = true;
    commit();
    render();
  },
};
