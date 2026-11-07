// Back up and restore (Q02): one small JSON file with progress and settings.

// Every localStorage key a backup holds, and the only keys a restore may
// write. Adding a key here is a conscious choice: it must be progress or
// settings.
// NEVER add the feedback key or the feedback queue (prompt 04). The key is a
// secret pasted once on the phone and must not end up in a file on Drive.
// Also not here, on purpose: LAST_BACKUP_KEY and UNDO_KEY below.
export const BACKUP_KEYS = ['reproom.v1'];

export const SCHEMA = 1;                          // newest file shape this app reads
export const LAST_BACKUP_KEY = 'reproom.lastBackup'; // { at, file }
export const UNDO_KEY = 'reproom.undoRestore';       // step 4

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
    localStorage.setItem(LAST_BACKUP_KEY, JSON.stringify({ at: new Date().toISOString(), file: file.name }));
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
