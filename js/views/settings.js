// The Settings tab: medicines, symptom buttons, backups and exports, help.

import { MED_KINDS } from '../defaults.js';
import { todayKey, fmtDateTime } from '../dates.js';
import { freshState, newId, backupText, parseBackup } from '../store.js';
import { state, draft, med, commit, useDraft, dropDraft, replaceState } from '../model.js';
import { medLabel } from '../stats.js';
import { daysCsv, dosesCsv, migrainesCsv } from '../csv.js';
import { mainBar, bar, card, section, switchRow, textInput, saveBar, installSteps, reminderSteps, toast } from '../ui.js';
import { shareFiles } from '../share.js';
import { go, nav, render } from '../router.js';
import { esc, plural } from '../util.js';
import { notFound } from './migraine.js';

const VERSION = '1.1';

function viewSettings() {
  const meds = state.settings.meds;
  const medRow = (m) =>
    `<a class="list-item" href="#med/${m.id}"><b>${esc(medLabel(m))}</b><br><span class="muted">${esc((MED_KINDS[m.kind] || {}).label || m.kind)}${m.brand ? `, ${esc(m.brand)}` : ''}</span></a>`;
  const active = meds.filter((m) => m.active);
  const stopped = meds.filter((m) => !m.active);
  let h = mainBar('Settings');
  h += card(
    'Medicines',
    `${active.map(medRow).join('')}<a class="btn top-gap" href="#med/new">Add a medicine</a>${
      stopped.length ? `<p class="med-group">No longer taking</p>${stopped.map(medRow).join('')}` : ''
    }`,
  );
  h += card(
    'Symptom buttons',
    `<p class="hint">Turn off any you never get. Past entries keep them.</p>${state.settings.symptoms
      .map((s) => switchRow('', !s.hidden, s.label, 'symptom-flip', ` data-id="${s.id}"`))
      .join('')}<div class="add-row"><input id="new-symptom" type="text" placeholder="Add a symptom" maxlength="40" autocomplete="off" enterkeyhint="done" data-enter="symptom-add"><button type="button" class="btn small" data-act="symptom-add">Add</button></div>`,
  );
  h += card('Optional parts', switchRow('trackHabits', state.settings.trackHabits, 'Habit taps: sleep, meals, caffeine', 'setting-flip'));
  h += card('Daily reminder', reminderSteps());
  const last = state.settings.lastBackup;
  h += card(
    'Backup and export',
    `<p class="muted">${last ? `Last backup: ${esc(fmtDateTime(last))}.` : 'No backup saved yet.'} Save the file to iCloud Drive or Files. To move to a new phone, load it there.</p>
    <div class="stack">
      <button type="button" class="btn" data-act="backup-save">Save backup file</button>
      <button type="button" class="btn" data-act="backup-load">Load a backup file</button>
      <button type="button" class="btn" data-act="export-csv">Export spreadsheet files</button>
    </div>
    <p class="hint">The spreadsheet export makes three CSV files (days, doses, migraines) that open in Numbers or Excel.</p>`,
  );
  h += card('Help', '<a class="list-item" href="#help">When to get medical help, and adding the app to your home screen</a>');
  h += card(
    'About',
    `<p class="muted">Your diary is stored only on this phone, inside this app. Nothing is sent anywhere. Version ${VERSION}.</p><button type="button" class="btn danger top-gap" data-act="erase-all">Erase everything</button>`,
  );
  return h;
}

function viewMed(id) {
  const existing = id && id !== 'new' ? med(id) : null;
  if (id !== 'new' && !existing) return notFound();
  const d = useDraft('#med/' + id, () =>
    existing
      ? { name: existing.name, dose: existing.dose || '', brand: existing.brand || '', kind: existing.kind, startedOn: existing.startedOn || '', active: existing.active }
      : { name: '', dose: '', brand: '', kind: null, startedOn: '', active: true },
  );
  const used = existing && (state.doses.some((x) => x.medId === id) || Object.values(state.days).some((e) => e.preventive && e.preventive[id]));
  const kinds = Object.entries(MED_KINDS)
    .map(
      ([k, v]) =>
        `<button type="button" class="med-btn${d.kind === k ? ' on' : ''}" data-act="pick" data-field="kind" data-val="${k}" data-keep="1" aria-pressed="${d.kind === k}"><span>${esc(v.label)}<br><small>${esc(v.hint)}</small></span></button>`,
    )
    .join('');
  let h = bar(existing ? 'Edit medicine' : 'Add a medicine', { back: '#settings', cancel: true });
  h += section('Name', textInput('name', d.name, 'For example, Sumatriptan'));
  h += section('Dose', textInput('dose', d.dose, 'For example, 50 mg', 'none'), 'Optional. If you take different strengths, add each one separately.');
  h += section('Brand or note', textInput('brand', d.brand, 'For example, Imitrex'), 'Optional.');
  h += section('Type', `<div class="med-list">${kinds}</div>`, 'The type groups your medicines here and in the summary you export for your doctor.');
  if (d.kind === 'preventive') {
    h += section('Started on', `<input type="date" data-bind="startedOn" value="${esc(d.startedOn)}">`, 'Used to compare migraine days before and after you started it.');
  }
  if (existing) h += section('Still taking it?', switchRow('active', d.active, 'Still taking it'), 'Medicines you stop stay in your history and the summary.');
  if (existing && !used) h += `<button type="button" class="btn danger top-gap" data-act="med-delete" data-id="${id}">Delete this medicine</button>`;
  return h + saveBar('save-med', 'Save', ` data-id="${id}"`);
}

function saveMed(el) {
  const id = el.dataset.id;
  const d = draft;
  const name = (d.name || '').trim();
  if (!name) return toast('Add a name.');
  if (!d.kind) return toast('Pick a type.');
  const values = {
    name,
    dose: (d.dose || '').trim(),
    brand: (d.brand || '').trim(),
    kind: d.kind,
    startedOn: d.kind === 'preventive' ? d.startedOn || null : null,
    active: d.active !== false,
  };
  if (id === 'new') state.settings.meds.push({ id: newId(), ...values });
  else Object.assign(med(id), values);
  if (commit()) {
    dropDraft();
    toast('Saved');
    go('#settings');
  }
}

function viewHelp() {
  let h = bar('Help', { back: nav.lastMain });
  h += card(
    'Get emergency care now for',
    `<ul class="plain">
      <li>A sudden, severe headache that peaks within a minute, or the worst headache of your life</li>
      <li>A headache with fever and a stiff neck</li>
      <li>Confusion, fainting or a seizure</li>
      <li>Weakness or numbness on one side, a drooping face, or trouble speaking, if it is new or different from your usual aura</li>
      <li>Loss of vision</li>
      <li>A headache after a blow to the head</li>
    </ul><p class="hint">Call 911 or go to the emergency room.</p>`,
    'note danger',
  );
  h += card(
    'Call your doctor soon if',
    `<ul class="plain">
      <li>A migraine lasts more than 3 days (72 hours)</li>
      <li>Your migraines change pattern or become much more frequent</li>
      <li>Your usual medicine stops working</li>
      <li>You have 4 or more migraine days a month and no preventive</li>
    </ul><p class="hint">General information, not medical advice.</p>`,
  );
  h += card(
    'Adding to your home screen',
    `${installSteps()}<p class="hint">Open the diary from the home screen icon, not from Safari. Safari keeps a separate copy, so entries made there won't show up in the app.</p>`,
  );
  h += card('A daily reminder', reminderSteps());
  return h;
}

// Loading a backup goes through the hidden file input in index.html.
export function setUpRestore(input) {
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const next = parseBackup(await file.text());
      const msg = `Replace this diary with the backup? The backup has ${plural(next.episodes.length, 'migraine')}, ${plural(next.doses.length, 'dose')} and ${plural(Object.keys(next.days).length, 'rated day')}. What is on this phone now will be replaced.`;
      if (!window.confirm(msg)) return;
      replaceState(next);
      if (commit()) {
        dropDraft();
        toast('Backup loaded');
        go('#today');
      }
    } catch (err) {
      toast(err.message);
    } finally {
      input.value = '';
    }
  });
}

export const views = { settings: viewSettings, med: viewMed, help: viewHelp };

export const actions = {
  'save-med': saveMed,
  'med-delete': (el) => {
    if (!window.confirm('Delete this medicine?')) return;
    state.settings.meds = state.settings.meds.filter((m) => m.id !== el.dataset.id);
    if (commit()) {
      dropDraft();
      go('#settings');
    }
  },
  'symptom-flip': (el) => {
    const s = state.settings.symptoms.find((x) => x.id === el.dataset.id);
    if (!s) return;
    s.hidden = !s.hidden;
    commit();
    render();
  },
  'symptom-add': () => {
    const input = document.getElementById('new-symptom');
    const label = input.value.trim();
    if (!label) return;
    if (state.settings.symptoms.some((s) => s.label.toLowerCase() === label.toLowerCase())) return toast('That one is already on the list.');
    state.settings.symptoms.push({ id: 'c-' + newId(), label, hidden: false });
    if (commit()) toast('Added');
    render();
  },
  'setting-flip': (el) => {
    const k = el.dataset.field;
    state.settings[k] = !state.settings[k];
    commit();
    render();
  },
  'backup-save': async () => {
    const name = `migraine-diary-backup-${todayKey()}`;
    const text = backupText(state);
    let file = new File([text], `${name}.json`, { type: 'application/json' });
    // Some phones only share common file types, so fall back to plain text.
    if (navigator.canShare && !navigator.canShare({ files: [file] })) file = new File([text], `${name}.txt`, { type: 'text/plain' });
    if (await shareFiles([file], 'Migraine Diary backup')) {
      state.settings.lastBackup = new Date().toISOString();
      commit();
      render();
    }
  },
  'backup-load': () => document.getElementById('restore-file').click(),
  'export-csv': async () => {
    const t = todayKey();
    const files = [
      new File([daysCsv(state, t)], `migraine-days-${t}.csv`, { type: 'text/csv' }),
      new File([dosesCsv(state)], `migraine-doses-${t}.csv`, { type: 'text/csv' }),
      new File([migrainesCsv(state, t)], `migraines-${t}.csv`, { type: 'text/csv' }),
    ];
    await shareFiles(files, 'Migraine Diary spreadsheets');
  },
  'erase-all': () => {
    if (!window.confirm('Erase everything in this diary? This cannot be undone.')) return;
    if (!window.confirm('Are you sure? Save a backup first if you might want it later.')) return;
    replaceState(freshState());
    dropDraft();
    if (commit()) toast('Diary erased');
    go('#today');
  },
};
