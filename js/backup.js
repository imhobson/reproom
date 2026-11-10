// Back up and restore (Q02): one small JSON file with progress and settings.
import * as wdata from './data.js';
import * as audio from './audio.js';
import * as sounds from './sounds.js';
import { DAYS_PER_STAGE } from './config.js';
import { isSession } from './store.js';

// Every localStorage key a backup holds, and the only keys a restore may
// write. Adding a key here is a conscious choice: it must be progress or
// settings.
// NEVER add the feedback key or the feedback queue (prompt 04). The key is a
// secret pasted once on the phone and must not end up in a file on Drive.
// Also not here, on purpose: LAST_BACKUP_KEY and UNDO_KEY below, and
// reproom.autoBackup (F16, autobackup.js): like the feedback key, the auto
// backup switch is this phone's setting, not progress.
export const BACKUP_KEYS = ['reproom.v1'];

export const SCHEMA = 1;                          // newest file shape this app reads
export const LAST_BACKUP_KEY = 'reproom.lastBackup'; // { at, file, auto } (auto: sent by auto backup, F16)
export const UNDO_KEY = 'reproom.undoRestore';       // { at, data } snapshot from before a restore
const UNDO_DAYS = 7;
const DAY = 86400000;

const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };

export const lastBackup = () => read(LAST_BACKUP_KEY);

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// The file: { app, kind, schema, appVersion, exportedAt, data }.
// data holds each allowlisted key's value as JSON (not as a string), so the
// file is easy to read.
export function makeBackup(now = new Date()) {
  const data = {};
  for (const k of BACKUP_KEYS) {
    const v = read(k);
    if (v !== null) data[k] = v;
  }
  const body = {
    app: 'RepRoom', kind: 'backup', schema: SCHEMA,
    appVersion: self.APP_VERSION, exportedAt: now.toISOString(), data,
  };
  const name = `reproom-backup-${ymd(now)}.json`;
  return new File([JSON.stringify(body, null, 2)], name, { type: 'application/json' });
}

// BACK UP: the share sheet where the phone can share the file (Android:
// pick Drive), otherwise a download. Resolves to true when it went through,
// false when you cancelled the share sheet (nothing is recorded then).
export async function backUp() {
  const file = makeBackup();
  let done = false;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'RepRoom backup' });
      done = true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
      // Sharing failed for another reason: fall back to a download.
    }
  }
  if (!done) download(file);
  try {
    localStorage.setItem(LAST_BACKUP_KEY, JSON.stringify({ at: new Date().toISOString(), file: file.name, auto: false }));
  } catch (e) { /* storage unavailable */ }
  return true;
}

function download(file) {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// "Today", "1 day ago", "3 days ago" (calendar days), or "Never".
export function sinceText(iso, now = new Date()) {
  if (!iso) return 'Never';
  const day = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const n = Math.round((day(now) - day(new Date(iso))) / 86400000);
  if (n <= 0) return 'Today';
  return `${n} day${n === 1 ? '' : 's'} ago`;
}

// ---- Restore (step 4) ----

// Read a picked file. Resolves to { body } for a RepRoom backup this app can
// read, or { error } with the message to show (and nothing is changed).
export async function readBackup(file) {
  let body = null;
  try { body = JSON.parse(await file.text()); } catch (e) { /* not JSON */ }
  const ok = body && typeof body === 'object' && body.app === 'RepRoom' && body.kind === 'backup'
    && body.data && typeof body.data === 'object' && !Array.isArray(body.data);
  if (!ok) return { error: "That file isn't a RepRoom backup." };
  if (!(Number(body.schema) <= SCHEMA)) return { error: 'This backup is from a newer version of RepRoom. Update the app first.' };
  return { body };
}

// What's on the phone now, in the same shape as a backup's data.
export function currentData() {
  const data = {};
  for (const k of BACKUP_KEYS) { const v = read(k); if (v !== null) data[k] = v; }
  return data;
}

// The one helper for describing a backup's data (or the phone's), so the
// confirm sheet and any later screen agree. Missing values count as defaults.
//   progress: "Stage 07 · 5 / 28 done · 173 workouts"
//   settings: "High · Kokoro Michael · Wood block · Bell"
export function summarize(data) {
  const st = data?.['reproom.v1'] || {};
  const stage = Number(st.stage) || 1;
  const ticks = st.ticks?.[stage] || {};
  let done = 0;
  for (let d = 1; d <= DAYS_PER_STAGE; d++) if (ticks[d]?.length) done++;
  // Finished workouts only: an early end (logged for its weight sets) isn't
  // one, and neither is a run routine (kind "run", F11).
  const workouts = Array.isArray(st.log) ? st.log.filter(isSession).length : 0;
  const set = st.settings || {};
  const vid = set.voice || 'kokoro-michael';
  const voice = vid === 'off' ? 'Voice off'
    : vid === 'phone' ? 'Phone voice'
    : audio.voiceList().find(v => v.id === vid)?.label || vid;
  const sfx = set.sfx === 'off' ? ['Effects off']
    : [sounds.tickById(set.tick).label, sounds.chimeById(set.chime).label];
  const intensity = wdata.intensity(st.intensity || 'medium')?.label || st.intensity;
  return {
    stage, done, workouts,
    progress: `Stage ${String(stage).padStart(2, '0')} · ${done} / ${DAYS_PER_STAGE} done · ${workouts} workout${workouts === 1 ? '' : 's'}`,
    settings: [intensity, voice, ...sfx].join(' · '),
  };
}

// "4 Nov 2026"
export const dateText = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Restore: save what's here now (for Undo), clear the allowlisted keys, then
// write the file's data. Keys in the file that aren't on the allowlist are
// ignored; missing ones fall back to defaults. Nothing else (the feedback key
// and queue included) is touched.
export function restore(body) {
  const snap = { at: new Date().toISOString(), data: {} };
  for (const k of BACKUP_KEYS) snap.data[k] = localStorage.getItem(k);
  localStorage.setItem(UNDO_KEY, JSON.stringify(snap));
  for (const k of BACKUP_KEYS) localStorage.removeItem(k);
  for (const k of BACKUP_KEYS) {
    if (k in body.data) localStorage.setItem(k, JSON.stringify(body.data[k]));
  }
  reloadHome('Backup restored');
}

// Undo restore: put the snapshot back, delete it, reload.
export function undoRestore() {
  const snap = read(UNDO_KEY);
  if (!snap) return;
  for (const k of BACKUP_KEYS) {
    const v = snap.data?.[k];
    if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  }
  localStorage.removeItem(UNDO_KEY);
  reloadHome('Restore undone');
}

// The Undo restore offer while it lasts: { before: "7 Nov 2026", daysLeft }.
export function undoOffer(now = Date.now()) {
  const snap = read(UNDO_KEY);
  if (!snap?.at) return null;
  const left = Math.ceil((new Date(snap.at).getTime() + UNDO_DAYS * DAY - now) / DAY);
  return left > 0 ? { before: dateText(snap.at), daysLeft: left } : null;
}

// On app start: a snapshot older than 7 days is deleted.
export function pruneUndo() {
  if (localStorage.getItem(UNDO_KEY) && !undoOffer()) localStorage.removeItem(UNDO_KEY);
}

// Reload the app on Home with a message (shown by main.js after the reload).
const FLASH = 'reproom.flash';
function reloadHome(msg) {
  try { sessionStorage.setItem(FLASH, msg); } catch (e) { /* no message then */ }
  history.replaceState(null, '', location.pathname + '#/');
  location.reload();
}
export function takeFlash() {
  try { const m = sessionStorage.getItem(FLASH); sessionStorage.removeItem(FLASH); return m; } catch (e) { return null; }
}
