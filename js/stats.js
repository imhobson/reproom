// Every progress number (F14), worked out from the store: the log, the ticks
// and the imported history. Every screen that shows a total, the Wall, the
// streak, stages or milestones reads it from here; nothing else adds up.
//
// What counts (decisions file, 10 Nov):
// - A session (store.isSession: finished, not a run routine) is a Wall tile,
//   a calendar day, a streak day and +1 session.
// - A workout ended early adds its time and moves, nothing else.
// - Run routines add nothing at all.
// - Estimated (undated) sessions from the history count on the Wall and in
//   sessions, time and move totals, but not on the calendar, streak or Recent.
// - kcal is always worked out from time (minutes × KCAL_PER_MIN).
import * as store from './store.js';
import * as data from './data.js';
import * as track from './track.js';
import { KCAL_PER_MIN, DAYS_PER_STAGE, WEIGHT_SET_SECS_ESTIMATE } from './config.js';

// ---- Dates (local) ----

const p2 = n => String(n).padStart(2, '0');
// "2026-11-07" for the local date of a timestamp. Imported sessions are
// "<date>T12:00:00" (no zone), which the browser reads as local time.
export const dayKey = at => { const d = new Date(at); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const todayKey = () => dayKey(Date.now());
// Whole days from a to b (both "YYYY-MM-DD").
const dayNo = k => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
export const daysBetween = (a, b) => dayNo(b) - dayNo(a);

// ---- One entry's moves ----

// An entry's track. Finished workouts from before V1.9 (no track): the plan
// workout for its stage day and intensity, warm-up and cool-down on, every
// move done in full at plan times. Weight sets from the weights field (each
// set at the Workout details estimate per side).
const planCache = new WeakMap();
export function trackOf(e) {
  if (e.track) return e.track;
  if (planCache.has(e)) return planCache.get(e);
  let t = { done: {}, skipped: [], warmup: true, cooldown: true };
  const w = !e.early && e.day ? data.workoutFor(e.intensity, e.day) : null;
  if (w) {
    const steps = data.playSteps(w, { warmup: true, cooldown: true });
    const res = {};
    steps.forEach((s, i) => { if (s.type === 'move') res[i] = s.secs; });
    t = track.build(steps, res);
  }
  if (e.weights?.sets?.length) {
    const sets = new Set(e.weights.sets.map(s => s.set));
    const d = (t.done[e.weights.move] ||= [0, 0]);
    d[0] += sets.size;
    d[1] += e.weights.sets.length * WEIGHT_SET_SECS_ESTIMATE;
  }
  planCache.set(e, t);
  return t;
}

// ---- Milestones (decisions file, 10 Nov) ----

// Each track's thresholds: the listed ones, then every `then` after the last.
export const TRACKS = [
  { key: 'sessions', name: 'Sessions', list: [1, 10, 25, 50, 100, 250, 500, 1000], then: 500, label: n => `${n} session${n === 1 ? '' : 's'}` },
  { key: 'symbols', name: 'Wall symbols', list: [1], then: 1, label: n => `${n} symbol${n === 1 ? '' : 's'}` },
  { key: 'stages', name: 'Stages', list: [1, 3, 5, 10, 25, 50], then: 25, label: n => `${n} stage${n === 1 ? '' : 's'}` },
  { key: 'streak', name: 'Day streak', list: [7, 30, 100, 365], then: 365, unit: 'days', label: n => `${n}-day streak` },
  { key: 'time', name: 'Time', list: [10, 50, 100, 250, 500, 1000], then: 500, unit: 'hrs', label: n => `${n} hrs` },
];

// The thresholds of a track up to and including the first one above value.
function thresholds(t, value) {
  const out = [];
  for (const x of t.list) { out.push(x); if (x > value) return out; }
  let x = t.list.at(-1);
  while (x <= value) { x += t.then; out.push(x); }
  return out;
}

function milestone(t, value) {
  const th = thresholds(t, value);
  const reached = th.filter(x => x <= value);
  const next = th.find(x => x > value);
  return { ...t, value, last: reached.at(-1) ?? null, earned: reached.length, next, frac: Math.min(1, value / next), left: next - value };
}

// The milestone values from a set of numbers.
export const milestoneValues = s => ({
  sessions: s.sessions, symbols: s.wall.finished, stages: s.stagesComplete, streak: s.best, time: s.secs / 3600,
});

// Which thresholds were crossed going from one set of values to another, in
// track order: [{ key, at, label }].
export function crossed(before, after) {
  const out = [];
  for (const t of TRACKS) {
    for (const x of thresholds(t, after[t.key])) if (x > before[t.key] && x <= after[t.key]) out.push({ key: t.key, at: x, label: t.label(x) });
  }
  return out;
}

// ---- Everything ----

// All the numbers, from the store's log (or the first logEnd entries of it).
export function compute(st = store.get(), logEnd = st.log.length) {
  const log = st.log.slice(0, logEnd).filter(e => e.kind !== 'run');
  const est = st.history?.estimated || { sessions: 0, secs: 0, moves: {} };

  // Sessions in order: the estimated ones first, then every dated session by date.
  const dated = log.filter(store.isSession).map(e => ({ e, t: Date.parse(e.at), day: dayKey(e.at) })).sort((a, b) => a.t - b.t);
  dated.forEach((d, i) => { d.n = est.sessions + i + 1; });
  const sessions = est.sessions + dated.length;

  // Time and moves: estimated + every session and early end.
  let secs = est.secs || 0;
  const moves = {};
  const mv = id => (moves[id] ||= { sets: 0, secs: 0, last: null, est: false });
  for (const [id, [sets, s]] of Object.entries(est.moves || {})) { const m = mv(id); m.sets += sets; m.secs += s; if (sets) m.est = true; }
  for (const e of log) {
    secs += e.secs || 0;
    const day = dayKey(e.at);
    for (const [id, [sets, s]] of Object.entries(trackOf(e).done)) {
      const m = mv(id);
      m.sets += sets; m.secs += s;
      if (sets && (!m.last || day > m.last)) m.last = day;
    }
  }
  const sets = Object.values(moves).reduce((t, m) => t + m.sets, 0);

  // Streak: days in a row with a session, by local date.
  const days = [...new Set(dated.map(d => d.day))].sort();
  let best = 0, run = 0;
  days.forEach((k, i) => { run = i && daysBetween(days[i - 1], k) === 1 ? run + 1 : 1; best = Math.max(best, run); });
  const lastDay = days.at(-1);
  const today = todayKey();
  const streak = lastDay && daysBetween(lastDay, today) <= 1 ? run : 0;

  // Stages complete (all 28 days ticked).
  const top = Math.max(st.stage, ...Object.keys(st.ticks).map(Number).filter(Boolean));
  let stagesComplete = 0;
  for (let s = 1; s <= top; s++) if (store.stageComplete(s)) stagesComplete++;

  const wall = wallAt(sessions);
  const out = {
    sessions, estimated: est.sessions, secs, hrs: secs / 3600, kcal: Math.round((secs / 60) * KCAL_PER_MIN), sets,
    moves, dated, days, streak, best, stagesComplete, wall,
  };
  out.milestones = TRACKS.map(t => milestone(t, milestoneValues(out)[t.key]));
  out.earned = out.milestones.reduce((t, m) => t + m.earned, 0);
  return out;
}

// The Wall at n sessions: the symbol being filled and how full it is.
// Session n is tile ((n - 1) % 100) + 1 of symbol ceil(n / 100).
export function wallAt(n) {
  const symbol = n ? Math.ceil(n / 100) : 1;
  const tiles = n ? ((n - 1) % 100) + 1 : 0;
  return { symbol, tiles, finished: Math.floor(n / 100) };
}

// One stage's numbers: its session entries (by stage), time, sets, skipped
// moves, and days taken (first to last date, both counted), or null days
// when it has no dated sessions.
export function stageStats(stage, st = store.get()) {
  const list = st.log.filter(e => store.isSession(e) && e.stage === stage);
  let secs = 0, sets = 0, skipped = 0;
  const ds = [];
  for (const e of list) {
    secs += e.secs || 0;
    const t = trackOf(e);
    sets += Object.values(t.done).reduce((a, [n]) => a + n, 0);
    skipped += t.skipped.length;
    ds.push(dayKey(e.at));
  }
  ds.sort();
  const days = ds.length ? daysBetween(ds[0], ds.at(-1)) + 1 : null;
  return { sessions: list.length, secs, sets, skipped, days };
}

// One move's numbers (Exercise info): { sets, secs, last, est }.
export const moveStats = (id, s = compute()) => s.moves[id] || { sets: 0, secs: 0, last: null, est: false };

// A one-line summary for the console (desktop preview check, step 2).
export function line(s = compute()) {
  return `RepRoom stats: ${s.sessions} sessions (${s.estimated} estimated) · ${s.hrs.toFixed(1)} hrs · ${s.kcal} kcal · ${s.sets} sets · `
    + `streak ${s.streak} (best ${s.best}) · ${s.stagesComplete} stages complete · Wall symbol ${s.wall.symbol} ${s.wall.tiles}/100 · ${s.earned} milestones`;
}
