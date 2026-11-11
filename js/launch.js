// The launch sound (I08): the braam sting and "Let's do this, Michael." when
// RepRoom starts, with Cornelius popping up to say it while his voice is on.
//
// Plays on a fresh start only: not when the app comes back from the recents
// list (nothing reloads then) and not on a reload in the same session (an
// update or a Restore). Developer → Launch sound: Every start (default),
// Once a day (the first start each day) or Off.
import * as store from './store.js';
import * as audio from './audio.js';
import * as cornelius from './cornelius.js';
import * as nav from './nav.js';

const LAST = 'reproom.launchLast';     // the day it last played, YYYY-MM-DD (not backed up)
const SESSION = 'reproom.launched';    // set for this run of the app (sessionStorage)

export const MODES = [
  { id: 'every', label: 'Every start' },
  { id: 'daily', label: 'Once a day' },
  { id: 'off', label: 'Off' },
];
export const mode = () => store.get().settings.launch || 'every';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const read = (s, k) => { try { return s.getItem(k); } catch (e) { return null; } };
const write = (s, k, v) => { try { s.setItem(k, v); } catch (e) { /* storage unavailable */ } };

// Called once by main.js after the first screen is drawn.
export function onStart() {
  if (read(sessionStorage, SESSION)) return; // a reload, not a fresh start
  write(sessionStorage, SESSION, '1');
  if (mode() === 'off') return;
  if (!/^#?\/?$/.test(location.hash)) return; // only when it opens on Home
  if (mode() === 'daily' && read(localStorage, LAST) === today()) return;
  play();
}

// Play it now (also Developer's "Play it now").
export async function play() {
  const r = await audio.launch();
  if (!r) return;
  write(localStorage, LAST, today());
  // Cornelius pops up only while his voice says the line (F18 rule).
  if (!r.voice || store.get().settings.voice !== cornelius.VOICE_ID) return;
  const line = cornelius.launchLine();
  nav.setOverlay(cornelius.showDialogue({
    expr: line.expr, text: line.text, magic: true,
    startAt: r.voiceAt, talkSecs: r.lineSecs, autoClose: 2,
    onClose: () => nav.setOverlay(null),
  }));
}
