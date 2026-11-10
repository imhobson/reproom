// Feedback (F15): the key, the note queue, and sending to the feedback inbox.
//
// Neither of these is in BACKUP_KEYS (backup.js), on purpose: the key is a
// secret that must never end up in a backup file on Drive, and the notes
// live in the inbox sheet once sent. Restore only touches BACKUP_KEYS, so a
// restore leaves both alone.
import { FEEDBACK_URL } from './config.js';

export const KEY_STORE = 'reproom.feedbackKey';   // the key, pasted once on the phone
export const KEY_BAD_STORE = 'reproom.feedbackKeyBad'; // '1' when the server said "bad key"
export const NOTES_STORE = 'reproom.feedback';    // recent notes, queued or sent

export const TYPES = ['Not sure', 'Bug', 'Idea', 'QoL'];
export const MAX_NOTE = 2000; // characters (the server refuses more)
const KEEP = 50;              // notes kept on the phone

// ---- The key ----

export function getKey() {
  try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; }
}
export function setKey(key) {
  try {
    localStorage.setItem(KEY_STORE, key);
    localStorage.removeItem(KEY_BAD_STORE); // a new key gets a fresh chance
  } catch (e) { /* storage unavailable */ }
}
// The server refused the key ("bad key"): Feedback opens the Connect box
// with "Key not recognised", and nothing is sent until a key is saved.
export function keyBad() {
  try { return localStorage.getItem(KEY_BAD_STORE) === '1'; } catch (e) { return false; }
}
// Auto backup (F16, autobackup.js) uses the same key, and marks it bad the same way.
export function markKeyBad() {
  try { localStorage.setItem(KEY_BAD_STORE, '1'); } catch (e) { /* storage unavailable */ }
}
export const usableKey = () => (keyBad() ? '' : getKey());

// ---- Notes ----
// Each note: { clientId, written, type, note, context, status, backlogId }
// status: 'queued' (saved here, not sent yet), 'sent' (in the sheet),
// 'filed' (Claude filed it; backlogId is set). Oldest first.

export function notes() {
  try { return JSON.parse(localStorage.getItem(NOTES_STORE)) || []; } catch (e) { return []; }
}
function saveNotes(list) {
  // Keep the last 50; past that, drop the oldest that are already filed.
  // Queued and sent notes are never dropped, so nothing is lost.
  while (list.length > KEEP) {
    const i = list.findIndex(n => n.status === 'filed');
    if (i < 0) break;
    list.splice(i, 1);
  }
  try { localStorage.setItem(NOTES_STORE, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
}

const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  }));

// Saves a new note to the queue (first, before any sending) and returns it.
export function addNote({ type, note, context }) {
  const n = {
    clientId: uuid(),
    written: new Date().toISOString(),
    type: TYPES.includes(type) ? type : 'Not sure',
    note: String(note).slice(0, MAX_NOTE),
    context,
    status: 'queued',
    backlogId: '',
  };
  const list = notes();
  list.push(n);
  saveNotes(list);
  return n;
}

// The newest notes first, for Recent.
export const recent = (count = 10) => notes().slice(-count).reverse();

// What Recent shows on the right of a note: [text, style].
export function statusOf(n) {
  if (n.status === 'filed') return [`Filed · ${n.backlogId || '?'}`, 'filed'];
  if (n.status === 'sent') return ['Sent', 'sent'];
  return usableKey() ? ['Waiting for signal', 'waiting'] : ['Waiting to connect', 'waiting'];
}

// ---- Sending ----
// Notes are saved first (addNote), then sent. Retrying is safe: the server
// ignores a clientId it already has. Sent as text/plain on purpose, so the
// browser makes a "simple" request with no CORS preflight.

const TIMEOUT_MS = 20000;
const STATUS_DAYS = 30;  // status checks cover sent notes from the last 30 days
const MAX_IDS = 50;      // the server's limit per status check

// The Feedback page listens, to redraw Recent when a status changes.
let listener = null;
export function onChange(fn) { listener = fn; }
const changed = () => { try { listener?.(); } catch (e) { /* page gone */ } };

// fetch with a timeout, reading the JSON reply. Auto backup (F16) passes a
// longer timeout: a backup is bigger than a note.
export async function call(url, opts = {}, timeout = TIMEOUT_MS) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal, cache: 'no-store' });
    return await r.json();
  } finally { clearTimeout(t); }
}

function update(clientId, fields) {
  const list = notes();
  const n = list.find(x => x.clientId === clientId);
  if (!n) return;
  Object.assign(n, fields);
  saveNotes(list);
}

// Sends one note. Returns 'sent', 'bad key' or 'failed' (no signal, or the
// server had a problem: the note stays queued for the next retry).
const inFlight = new Set();
export async function send(n) {
  const key = usableKey();
  if (!key || !FEEDBACK_URL || inFlight.has(n.clientId)) return 'failed';
  inFlight.add(n.clientId);
  try {
    const { clientId, written, type, note, context } = n;
    const res = await call(FEEDBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ clientId, written, type, note, context, key }),
    });
    if (res?.ok) { update(clientId, { status: 'sent' }); changed(); return 'sent'; }
    if (res?.error === 'bad key') { markKeyBad(); changed(); return 'bad key'; }
    return 'failed';
  } catch (e) {
    return 'failed';
  } finally {
    inFlight.delete(n.clientId);
  }
}

// Sends every queued note, oldest first. Stops at the first failure (no
// signal) or a bad key. Callers keep this out of workouts.
let flushing = null;
export function retryQueued() {
  if (flushing) return flushing;
  flushing = (async () => {
    if (navigator.onLine === false) return;
    for (const n of notes().filter(x => x.status === 'queued')) {
      if ((await send(n)) !== 'sent') break;
    }
  })().catch(() => {}).finally(() => { flushing = null; });
  return flushing;
}

// Asks the sheet about sent notes from the last 30 days and marks any that
// Claude has filed, with their backlog ID.
export async function checkStatuses() {
  const key = usableKey();
  if (!key || !FEEDBACK_URL || navigator.onLine === false) return;
  const since = Date.now() - STATUS_DAYS * 86400000;
  const ids = notes()
    .filter(n => n.status === 'sent' && !(Date.parse(n.written) < since))
    .slice(-MAX_IDS)
    .map(n => n.clientId);
  if (!ids.length) return;
  try {
    const url = `${FEEDBACK_URL}?key=${encodeURIComponent(key)}&ids=${ids.map(encodeURIComponent).join(',')}`;
    const res = await call(url);
    if (res?.error === 'bad key') { markKeyBad(); changed(); return; }
    if (!res?.ok || !res.notes) return;
    let any = false;
    const list = notes();
    for (const n of list) {
      const s = res.notes[n.clientId];
      if (n.status === 'sent' && s && String(s.status).toLowerCase() === 'filed') {
        n.status = 'filed';
        n.backlogId = String(s.backlogId || '');
        any = true;
      }
    }
    if (any) { saveNotes(list); changed(); }
  } catch (e) { /* no signal: try again next time the page opens */ }
}

// ---- The context line sent with a note ----
// "Stage 07 · Day 06 · High · Main · Push-ups (push-ups) · step 12/50 · v1.4.0"
const p2 = n => String(n).padStart(2, '0');
export function contextLine(workout, attached) {
  const v = `v${self.APP_VERSION || '?'}`;
  if (!workout) return `Not in a workout · ${v}`;
  if (!attached) return `Workout not attached · ${v}`;
  const w = workout;
  let move = w.moveId ? `${w.name} (${w.moveId})` : w.name;
  if (w.side) move += ` · ${w.side} side`;
  const phase = w.phase === 'preview' ? (w.stepNo === 1 ? ' · Get ready' : ' · Next up') : '';
  // A run routine (F11) has no stage, day or intensity: "Run drills · Drills · A-skips ..."
  const where = w.routine ? w.routine : `Stage ${p2(w.stage)} · Day ${p2(w.day)} · ${w.intensity}`;
  return `${where} · ${w.section} · ${move}${phase} · step ${w.stepNo}/${w.steps} · ${v}`;
}
