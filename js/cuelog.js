// Cue log (F11 pocket test). A debug tool, off by default.
//
// While it's on, every cue the player plays (voice, tick, GO, chime) is
// written down with when it was planned and when it actually played, all on
// the wall clock (Date.now), so a workout run with the phone locked in a
// pocket can be checked afterwards: Settings > Cue log.
//
// How "planned" works: each timed phase (Get ready / Next up, a move, a rest)
// has a planned end. When a phase ends by itself, the next one is planned from
// where the last one was planned to end, not from when it really ended, so any
// drift adds up and shows. Pause, NEXT, PREV, SKIP and +30 SEC start the plan
// again from the moment you tap.
//
// It also notes the screen going off and on, the page being frozen, and gaps
// between timer ticks over 1.5s (a sign the phone is slowing the page down).
//
// Only the last run is kept, in its own key (not in backups). Turn it on or
// off by tapping the version in Settings 5 times.

const FLAG = 'reproom.debugCues';
const KEY = 'reproom.cuelog';
export const LATE_MS = 1000; // pass mark: every cue within 1s of plan

let on = false;
try { on = localStorage.getItem(FLAG) === '1'; } catch (e) { /* storage unavailable */ }

let run = null; // the run being logged now

export const enabled = () => on;

export function setEnabled(v) {
  on = !!v;
  try { v ? localStorage.setItem(FLAG, '1') : localStorage.removeItem(FLAG); } catch (e) { /* ignore */ }
  if (!on) run = null;
}

function save() {
  if (!run) return;
  try { localStorage.setItem(KEY, JSON.stringify(run)); } catch (e) { /* full or unavailable */ }
}

export function last() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
}

const since = () => Date.now() - run.w0;

// A workout starts: a fresh log.
// keep: the keep-alive mode the workout ran with (keepalive.js).
export function begin(name, keep = '') {
  if (!on) { run = null; return; }
  run = { name, keep, w0: Date.now(), p0: performance.now(), version: self.APP_VERSION, entries: [] };
  save();
}

// A cue. planWall is when it should play (Date.now() terms). Returns the entry,
// so the voice can fill in when it really started.
//   kind: voice | tick | go | chime
//   played: true if it plays now; false if it starts later (voice) or never.
//   extra: e.g. { miss: 'merged' } or { ctx: 'suspended' }
// afterMs: a sound scheduled to play a moment from now (the chime, 1.1s).
export function cue(kind, label, planWall, played = true, extra = {}, afterMs = 0) {
  if (!run) return null;
  const e = { k: kind, l: label, plan: planWall == null ? null : Math.round(planWall - run.w0),
    at: played ? since() + afterMs : null, vis: document.visibilityState[0], ...extra };
  run.entries.push(e);
  save();
  return e;
}

// The voice really started (clip 'playing', or the phone voice's onstart).
export function started(e, how) {
  if (!run || !e || e.at != null) return;
  e.at = since();
  if (how) e.how = how;
  save();
}

// The voice won't play (voice off, muted, or the clip failed).
export function skipped(e, why) {
  if (!run || !e) return;
  e.off = why;
  save();
}

// Anything else worth seeing in the list: pause, play, skip, screen off ...
export function note(kind, label = '') {
  if (!run) return;
  run.entries.push({ k: kind, l: label, at: since(), vis: document.visibilityState[0] });
  save();
}

// The workout finished or was ended. elapsedMs: the player's own timer.
export function end(how, elapsedMs) {
  if (!run) return;
  run.end = { how, at: since(), perf: Math.round(performance.now() - run.p0), elapsed: Math.round(elapsedMs) };
  save();
  run = null;
}

// The page going to the background (screen off / locked) and back, and
// Chrome freezing it.
document.addEventListener('visibilitychange', () =>
  note('screen', document.visibilityState === 'hidden' ? 'Hidden (screen off or app left)' : 'Visible again'));
document.addEventListener('freeze', () => note('freeze', 'Page frozen'));
document.addEventListener('resume', () => note('freeze', 'Page unfrozen'));

// ---- Reading it back ----

export const CUE_KINDS = ['voice', 'tick', 'go', 'chime'];

// Late (ms) for a cue that played; null if it hasn't.
export const lateBy = e => (e.at == null || e.plan == null ? null : e.at - e.plan);
// Missing: never played, passed over by a late tick (miss), or sent to an
// audio context that wasn't running (ctx), so it was silent.
export const isMissing = e => CUE_KINDS.includes(e.k) && !e.off && (e.at == null || !!e.miss || !!e.ctx);
export const isLate = e => { const d = lateBy(e); return d != null && Math.abs(d) > LATE_MS; };

// Totals for the top of the list.
export function summarize(r) {
  const cues = r.entries.filter(e => CUE_KINDS.includes(e.k) && !e.off);
  const missing = cues.filter(isMissing);
  const late = cues.filter(e => !isMissing(e) && isLate(e));
  const lates = cues.map(lateBy).filter(d => d != null);
  const worst = lates.reduce((m, d) => (Math.abs(d) > Math.abs(m) ? d : m), 0);
  // Time spent paused, from the pause / play notes.
  let paused = 0, from = null;
  for (const e of r.entries) {
    if (e.k === 'pause') from = e.at;
    if (e.k === 'play' && from != null) { paused += e.at - from; from = null; }
  }
  if (from != null && r.end) paused += r.end.at - from;
  const hidden = r.entries.filter(e => e.k === 'screen' && e.l.startsWith('Hidden')).length;
  const gaps = r.entries.filter(e => e.k === 'gap');
  return {
    cues: cues.length, missing: missing.length, late: late.length, worst,
    pass: cues.length > 0 && !missing.length && !late.length,
    paused, hidden, gaps: gaps.length,
    // How much the player's timer fell behind the wall clock (ms). A slowed
    // page makes the workout last longer than planned.
    behind: r.end ? (r.end.at - paused) - r.end.elapsed : null,
  };
}
