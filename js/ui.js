// HTML building blocks shared by every screen. Each returns a string; taps
// reach app.js through data-act attributes.

import { LOCATIONS, LEVELS, RESULTS } from './defaults.js';
import { esc, labelOf, pct } from './util.js';

export const YES_NO = [
  { id: true, label: 'Yes' },
  { id: false, label: 'No' },
];

export const muted = (s) => `<span class="muted">${s}</span>`;

export function bar(title, { back = null, cancel = false } = {}) {
  const left = back
    ? `<a class="link" href="${back}"${cancel ? ` data-act="cancel" data-href="${back}"` : ''}>${cancel ? 'Cancel' : 'Back'}</a>`
    : '';
  return `<header class="bar"><span class="left">${left}</span><h1>${esc(title)}</h1><span class="right"></span></header>`;
}

export function mainBar(title, right = '') {
  return `<header class="bar main"><h1>${esc(title)}</h1><span class="right">${right}</span></header>`;
}

export function card(title, body, cls = '') {
  return `<section class="card ${cls}">${title ? `<h2>${title}</h2>` : ''}${body}</section>`;
}

export function section(title, body, hint = '') {
  return `<section class="field"><h2>${title}</h2>${hint ? `<p class="hint">${hint}</p>` : ''}${body}</section>`;
}

export function chips(field, options, value, { multi = false, num = false, bool = false, keep = false } = {}) {
  const items = options.map((o) => {
    const on = multi ? (value || []).includes(o.id) : value === o.id;
    const attrs = `${num ? ' data-num="1"' : ''}${bool ? ' data-bool="1"' : ''}${keep ? ' data-keep="1"' : ''}`;
    return `<button type="button" class="chip${on ? ' on' : ''}" data-act="${multi ? 'toggle' : 'pick'}" data-field="${field}" data-val="${esc(String(o.id))}"${attrs} aria-pressed="${on}">${esc(o.label)}</button>`;
  });
  return `<div class="chips">${items.join('')}</div>`;
}

// 0 to 10. By default a tap sets a form field; `act` and `attrs` let a tap
// change saved data directly instead.
export function painPicker(field, value, { act = 'pick', attrs = '', key = true } = {}) {
  let h = '<div class="pain">';
  for (let n = 0; n <= 10; n++) {
    const on = value === n;
    h += `<button type="button" class="pain-btn p${n}${on ? ' on' : ''}" data-act="${act}" data-field="${field}" data-val="${n}" data-num="1"${attrs} aria-pressed="${on}" aria-label="Pain ${n}">${n}</button>`;
  }
  h += '</div>';
  return key ? h + '<div class="pain-key"><span>0 none</span><span>1-3 mild</span><span>4-6 moderate</span><span>7-10 severe</span></div>' : h;
}

export function painSelect(field, value) {
  let h = `<select data-bind="${field}" data-num="1"><option value="">-</option>`;
  for (let n = 0; n <= 10; n++) h += `<option value="${n}"${value === n ? ' selected' : ''}>${n}</option>`;
  return h + '</select>';
}

export function levelPicker(field, value, { none = true, noneLabel = 'No migraine' } = {}) {
  const opts = LEVELS.filter((l) => none || l.id > 0);
  return `<div class="levels">${opts
    .map((l) => {
      const on = value === l.id;
      return `<button type="button" class="level lv${l.id}${on ? ' on' : ''}" data-act="pick" data-field="${field}" data-val="${l.id}" data-num="1" aria-pressed="${on}"><span class="swatch"></span><span>${esc(l.id === 0 ? noneLabel : l.label)}</span></button>`;
    })
    .join('')}</div>`;
}

export function switchRow(field, value, label, act = 'flip', extra = '') {
  return `<button type="button" class="switch" role="switch" aria-checked="${!!value}" data-act="${act}" data-field="${field}"${extra}><span>${esc(label)}</span><span class="knob"></span></button>`;
}

export function timeInput(field, value, label = '') {
  return `<label class="input">${label ? `<span>${esc(label)}</span>` : ''}<input type="datetime-local" data-bind="${field}" value="${esc(value || '')}"></label>`;
}

export function textInput(field, value, placeholder, cap = 'words') {
  return `<input type="text" data-bind="${field}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" autocapitalize="${cap}">`;
}

export function numInput(field, value, max = 92) {
  return `<input type="number" inputmode="numeric" min="0" max="${max}" data-bind="${field}" data-num="1" value="${value ?? ''}">`;
}

export function saveBar(act, label, extra = '') {
  return `<div class="savebar"><button type="button" class="btn primary" data-act="${act}"${extra}>${esc(label)}</button></div>`;
}

export function stat(n, label, sub = '') {
  return `<div class="stat"><b>${n}</b><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
}

export function barRow(label, count, total, shown = count) {
  return `<div class="bar-row"><span>${esc(label)}</span><span class="track"><i style="width:${pct(count, total)}%"></i></span><span class="n">${shown}</span></div>`;
}

// Gone, Better, Same or worse. With `skip`, also a way to stop being asked.
export function rateButtons(d, { skip = false } = {}) {
  const items = RESULTS.map(
    (r) =>
      `<button type="button" class="chip${d.result === r.id ? ' on' : ''}" data-act="rate" data-dose="${d.id}" data-val="${r.id}" aria-pressed="${d.result === r.id}">${r.label}</button>`,
  );
  if (skip) items.push(`<button type="button" class="chip quiet" data-act="no-rate" data-dose="${d.id}">Skip</button>`);
  return `<div class="chips">${items.join('')}</div>`;
}

// The front of the face, drawn like a mirror so the person's left is on the
// left of the screen.
export function faceSvg(selected) {
  const region = (id, tag, attrs) => {
    const on = selected.includes(id);
    const label = esc(labelOf(LOCATIONS, id));
    return `<${tag} class="region${on ? ' on' : ''}" ${attrs} data-act="toggle" data-field="locations" data-val="${id}" role="button" aria-pressed="${on}" aria-label="${label}"><title>${label}</title></${tag}>`;
  };
  return `<svg class="face" viewBox="0 0 240 290" role="group" aria-label="Face. Tap where it hurts.">
    <defs><clipPath id="head-clip"><ellipse cx="120" cy="152" rx="94" ry="124"/></clipPath></defs>
    <text x="22" y="14">Your left</text><text x="218" y="14" text-anchor="end">Your right</text>
    <ellipse class="head" cx="120" cy="152" rx="94" ry="124"/>
    <g clip-path="url(#head-clip)">
      ${region('fh-l', 'rect', 'x="20" y="20" width="73" height="78"')}
      ${region('fh-c', 'rect', 'x="93" y="20" width="54" height="78"')}
      ${region('fh-r', 'rect', 'x="147" y="20" width="73" height="78"')}
      ${region('tm-l', 'rect', 'x="20" y="98" width="45" height="64"')}
      ${region('tm-r', 'rect', 'x="175" y="98" width="45" height="64"')}
    </g>
    ${region('ey-l', 'circle', 'cx="88" cy="128" r="21"')}
    ${region('ey-r', 'circle', 'cx="152" cy="128" r="21"')}
    ${region('br', 'rect', 'x="110" y="104" width="20" height="56" rx="7"')}
    ${region('ck-l', 'ellipse', 'cx="84" cy="186" rx="27" ry="21"')}
    ${region('ck-r', 'ellipse', 'cx="156" cy="186" rx="27" ry="21"')}
    <ellipse class="outline" cx="120" cy="152" rx="94" ry="124"/>
    <path class="deco" d="M74 128 Q88 119 102 128 Q88 137 74 128 Z M138 128 Q152 119 166 128 Q152 137 138 128 Z"/>
    <path class="deco" d="M120 162 L112 199 Q120 205 128 199"/>
    <path class="deco" d="M98 233 Q120 245 142 233"/>
    <text x="120" y="64" text-anchor="middle">forehead</text>
    <text x="42" y="134" text-anchor="middle">temple</text>
    <text x="198" y="134" text-anchor="middle">temple</text>
  </svg>`;
}

export function installSteps() {
  return `<ol class="steps">
    <li>Tap the three dots next to the address bar, then tap Share. On older iPhones, tap the Share button at the bottom of the screen.</li>
    <li>Scroll down and tap Add to Home Screen.</li>
    <li>Leave Open as Web App turned on, then tap Add.</li>
  </ol>`;
}

export function reminderSteps() {
  return `<ol class="steps">
    <li>Open the Reminders app and add a reminder called Migraine Diary.</li>
    <li>Tap the info button next to it, turn on Date and Time, and pick a time, such as 8 PM.</li>
    <li>Tap Repeat and choose Daily.</li>
    <li>When it goes off, open Migraine Diary from your home screen and tap how the day went.</li>
  </ol>
  <p class="hint">A Shortcuts automation can't open the home screen app. It opens the link in Safari, which keeps separate data, so a plain reminder works better.</p>`;
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2800);
}
