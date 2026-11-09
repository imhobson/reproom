// Feedback (04e, F15): a Settings sub-page with only the back button.
// Opened from a paused workout, it carries where the workout is.
//
// Top to bottom: header (with CONNECTED · CHANGE once a key is saved), the
// caption, CONNECT (only with no key, or after CHANGE), ATTACHED, TYPE,
// NOTE, SEND TO BACKLOG, RECENT.
import { head } from './settings.js';
import { pad2, go, showToast } from '../ui.js';
import * as fb from '../feedback.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// Page state. The draft and its type survive leaving the page (until the
// app closes); the switch and the Connect box reset each time it opens.
let app = null;
let workout = null;  // where the paused workout is, or null
let attach = true;   // the ATTACHED switch
let changing = false; // the Connect box is open over a saved key
let keyError = '';   // e.g. "Key not recognised"
let type = 'Not sure';
let draft = '';

// ---- Parts ----

// The Connect box shows with no key, after CHANGE, or when the key was refused.
const connectOpen = () => !fb.getKey() || changing || fb.keyBad();

function connectedTag() {
  if (connectOpen()) return '';
  return `<span class="label fb-conn">Connected · <button class="fb-change" data-change>Change</button></span>`;
}

function connectBox() {
  if (!connectOpen()) return '';
  const err = keyError || (fb.keyBad() ? 'Key not recognised' : '');
  return `
    <h2 class="label red s-sec">Connect</h2>
    <div class="s-card fb-connect">
      <div class="fb-key-row">
        <input class="fb-key" data-key type="text" placeholder="Paste your feedback key"
          autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Feedback key">
        <button class="fb-save" data-save-key>Save</button>
      </div>
      ${err ? `<p class="fb-err">${esc(err)}</p>` : ''}
      ${changing && !fb.keyBad() ? '<button class="fb-cancel label" data-cancel-key>Cancel</button>' : ''}
    </div>
    <p class="s-help">The key is made once in the sheet's Apps Script (makeKey). It stays on this phone and isn't in backups.</p>`;
}

// "Day 06 · High" / "Main · Push-ups · step 12 / 50"
function attachedCard() {
  if (!workout) return `<div class="s-card fb-attach"><p class="fb-none">Not in a workout</p></div>`;
  const w = workout;
  const name = w.side ? `${w.name} (${w.side})` : w.name;
  return `
    <div class="s-card fb-attach">
      <div>
        <p class="fb-day">Day ${pad2(w.day)} · ${esc(w.intensity)}</p>
        <p class="fb-where">${esc(w.section)} · ${esc(name)} · step ${w.stepNo} / ${w.steps}</p>
      </div>
      <button class="switch ${attach ? 'on' : ''}" data-attach role="switch" aria-checked="${attach}" aria-label="Attach the workout to this note"><span></span></button>
    </div>`;
}

function recentList() {
  const list = fb.recent(10);
  if (!list.length) return '<p class="s-help">No notes yet.</p>';
  return `<ul class="fb-recent">${list.map(n => {
    const [text, cls] = fb.statusOf(n);
    const first = n.note.split('\n').find(l => l.trim()) || n.note;
    return `<li><span class="fb-line">${esc(first)}</span><span class="label fb-st ${cls}">${esc(text)}</span></li>`;
  }).join('')}</ul>`;
}

// ---- Drawing ----

function draw() {
  app.innerHTML = `
    <section class="screen settings feedback">
      ${head('Feedback', connectedTag())}
      <p class="s-help intro">Anything you notice. Claude files it into the backlog every night.</p>

      ${connectBox()}

      <h2 class="label red s-sec">Attached</h2>
      ${attachedCard()}

      <h2 class="label red s-sec">Type</h2>
      <div class="fb-chips" role="radiogroup" aria-label="Type">
        ${fb.TYPES.map(t => `<button class="fb-chip ${t === type ? 'sel' : ''}" data-type="${t}" role="radio" aria-checked="${t === type}">${t}</button>`).join('')}
      </div>

      <h2 class="label red s-sec">Note</h2>
      <textarea class="fb-note" data-note maxlength="${fb.MAX_NOTE}" placeholder="What's on your mind?" aria-label="Note">${esc(draft)}</textarea>
      <div class="fb-under"><span class="label muted">Tip: use the mic on your keyboard</span><span class="label muted" data-left></span></div>

      <button class="cta centre fb-send" data-send ${draft.trim() ? '' : 'disabled'}>Send to backlog</button>

      <h2 class="label red s-sec">Recent</h2>
      <div data-recent>${recentList()}</div>
    </section>`;

  const q = s => app.querySelector(s);
  const on = (sel, fn) => app.querySelectorAll(sel).forEach(b => b.addEventListener('click', fn));
  const again = () => { const y = scrollY; draw(); scrollTo(0, y); };

  on('[data-back]', () => go('#/settings'));

  // Connect
  on('[data-change]', () => { changing = true; keyError = ''; again(); q('[data-key]')?.focus(); });
  on('[data-cancel-key]', () => { changing = false; keyError = ''; again(); });
  const saveKey = () => {
    const k = q('[data-key]').value.trim();
    if (!k) { keyError = 'Paste the key first'; again(); return; }
    fb.setKey(k);
    changing = false; keyError = ''; drawnBad = false;
    again();
    showToast('<span class="label">Key saved</span>', 2500);
    if (!workout) fb.retryQueued().then(fb.checkStatuses); // anything waiting to connect goes now
  };
  on('[data-save-key]', saveKey);
  q('[data-key]')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveKey(); });

  // Attached
  on('[data-attach]', e => {
    attach = !attach;
    const b = e.currentTarget;
    b.classList.toggle('on', attach);
    b.setAttribute('aria-checked', attach);
  });

  // Type chips
  on('[data-type]', e => {
    type = e.currentTarget.dataset.type;
    app.querySelectorAll('[data-type]').forEach(b => {
      const sel = b.dataset.type === type;
      b.classList.toggle('sel', sel);
      b.setAttribute('aria-checked', sel);
    });
  });

  // Note: grows as you type; SEND is off while it's empty. Near the limit,
  // a count of what's left shows on the right.
  const note = q('[data-note]');
  const send = q('[data-send]');
  const left = q('[data-left]');
  const fit = () => {
    note.style.height = 'auto';
    note.style.height = `${Math.max(120, note.scrollHeight + 4)}px`; // +4: the 2px border, top and bottom
    const n = fb.MAX_NOTE - note.value.length;
    left.textContent = n <= 200 ? `${n} left` : '';
  };
  note.addEventListener('input', () => {
    draft = note.value;
    send.disabled = !draft.trim();
    fit();
  });
  fit();

  // Send: save to the queue on the phone first, then try to send it. This
  // one note is sent even from a paused workout, because you asked for it;
  // older queued notes wait until you're out of the workout.
  on('[data-send]', () => {
    if (!draft.trim()) return;
    const n = fb.addNote({ type, note: draft.trim(), context: fb.contextLine(workout, attach) });
    draft = ''; type = 'Not sure';
    again();
    showToast('<span class="label">Saved</span>', 2000);
    fb.send(n);
  });
}

// A status changed (sent, filed, or the key was refused) while the page is
// open: redraw Recent only, so typing isn't interrupted. A refused key needs
// the Connect box, so that redraws the page (the draft is kept).
let drawnBad = false;
function statusChanged() {
  if (!app || location.hash !== '#/settings/feedback') return;
  if (fb.keyBad() !== drawnBad) { drawnBad = fb.keyBad(); const y = scrollY; draw(); scrollTo(0, y); return; }
  const el = app.querySelector('[data-recent]');
  if (el) el.innerHTML = recentList();
}
fb.onChange(statusChanged);

export function render(el, w) {
  app = el;
  workout = w;
  attach = true;
  changing = false;
  keyError = '';
  drawnBad = fb.keyBad();
  draw();
  // Opening the page retries queued notes, then checks what's been filed.
  // Not from a paused workout: no retries during a workout.
  if (!workout) fb.retryQueued().then(fb.checkStatuses);
}
