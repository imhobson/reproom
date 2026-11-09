// Feedback (F15): the key, the note queue, and sending to the feedback inbox.
//
// Neither of these is in BACKUP_KEYS (backup.js), on purpose: the key is a
// secret that must never end up in a backup file on Drive, and the notes
// live in the inbox sheet once sent. Restore only touches BACKUP_KEYS, so a
// restore leaves both alone.
export const KEY_STORE = 'reproom.feedbackKey';   // the key, pasted once on the phone
export const NOTES_STORE = 'reproom.feedback';    // recent notes, queued or sent

export const TYPES = ['Not sure', 'Bug', 'Idea', 'QoL'];
export const MAX_NOTE = 2000; // characters (the server refuses more)
const KEEP = 50;              // notes kept on the phone

// ---- The key ----

export function getKey() {
  try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; }
}
export function setKey(key) {
  try { localStorage.setItem(KEY_STORE, key); } catch (e) { /* storage unavailable */ }
}

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
  return getKey() ? ['Waiting for signal', 'waiting'] : ['Waiting to connect', 'waiting'];
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
  return `Stage ${p2(w.stage)} · Day ${p2(w.day)} · ${w.intensity} · ${w.section} · ${move}${phase} · step ${w.stepNo}/${w.steps} · ${v}`;
}
