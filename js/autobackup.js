// Auto backup to Drive (F16): after anything is saved, the phone sends the
// same file BACK UP makes to RepRoom/Backups in Drive, through the feedback
// Apps Script and its key (05 Build/RepRoom-feedback-setup.md, v2). The
// script names, replaces and tidies the files; the app only sends.
//
// reproom.autoBackup = { on, pending, failed } is this phone's setting, not
// progress, so it isn't in BACKUP_KEYS (backup.js), like the feedback key.
//   on      – the Settings switch (default true)
//   pending – something was saved since the last backup that went through.
//             A flag, not a queue: the file is made when it's sent, so it
//             always holds the newest data.
//   failed  – why the last try didn't go through: 'signal' (offline, or no
//             reply) or 'error' (the script replied with an error); null
//             after a backup goes through.
import { FEEDBACK_URL } from './config.js';
import { makeBackup, LAST_BACKUP_KEY } from './backup.js';
import * as fb from './feedback.js';

const STORE = 'reproom.autoBackup';
const TIMEOUT_MS = 30000; // a backup is bigger than a note

const defaults = () => ({ on: true, pending: false, failed: null });
export function state() {
  try { return { ...defaults(), ...JSON.parse(localStorage.getItem(STORE)) }; } catch (e) { return defaults(); }
}
function write(fields) {
  const s = { ...state(), ...fields };
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* storage unavailable */ }
  return s;
}

// A usable Feedback key (saved, and not refused by the script).
export const connected = () => !!(FEEDBACK_URL && fb.usableKey());

// main.js says when sending must wait: while the player is open (a paused
// workout with Settings or Progress on top counts too).
let blocked = () => false;
export function setBlocked(fn) { blocked = fn; }

// Settings listens, to redraw Last backup and the switch's line.
let listener = null;
export function onChange(fn) { listener = fn; }
const changed = () => { try { listener?.(); } catch (e) { /* page gone */ } };

// Bumped by every save, so a save made while a send is on its way isn't
// lost: that send then leaves pending set, and another one follows.
let saves = 0;

// Something was saved: mark it pending (while the switch is on).
export function markPending() {
  saves++;
  if (state().on) write({ pending: true });
}

// After a save that counts (store.onSaved): mark it, then try to send.
export function saved() {
  markPending();
  changed();
  retry();
}

// The switch. Turning it on sends straight away.
export function setOn(on) {
  write({ on, ...(on ? {} : { pending: false, failed: null }) });
  if (on) markPending();
  changed();
  if (on) retry();
}

// Sends the pending backup if it can. One at a time, never while the player
// is open, never without a key. Resolves when the try is over.
let sending = null;
export function retry() {
  if (sending) return sending;
  const s = state();
  if (!s.on || !s.pending || !connected() || blocked()) return Promise.resolve();
  if (navigator.onLine === false) {
    if (s.failed !== 'signal') { write({ failed: 'signal' }); changed(); }
    return Promise.resolve();
  }
  sending = send().catch(() => {}).finally(() => { sending = null; });
  return sending;
}

async function send() {
  const mine = saves;
  const now = new Date();
  const file = makeBackup(now); // made now, so it holds the newest data
  let res = null;
  try {
    res = await fb.call(FEEDBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // no CORS preflight
      body: JSON.stringify({ key: fb.usableKey(), action: 'backup', name: file.name, file: await file.text() }),
    }, TIMEOUT_MS);
  } catch (e) { /* no reply: offline, timed out */ }
  let again = false;
  if (res?.ok) {
    // Done (a reply with skipped: "newer in Drive" counts as done too).
    try {
      localStorage.setItem(LAST_BACKUP_KEY, JSON.stringify({ at: now.toISOString(), file: file.name, auto: true }));
    } catch (e) { /* storage unavailable */ }
    again = saves !== mine && state().pending;
    write(again ? { failed: null } : { pending: false, failed: null });
  } else if (res?.error === 'bad key') {
    fb.markKeyBad(); // Feedback shows "Key not recognised"; this waits for a new key
    write({ failed: null });
  } else {
    write({ failed: res ? 'error' : 'signal' });
  }
  changed();
  if (again) setTimeout(retry, 0); // a newer save came in while this one was sending
}

// The line under the switch.
export function line() {
  return 'After every workout';
}
