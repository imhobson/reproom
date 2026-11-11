// Progress and settings, kept in localStorage on the phone only.
import { DAYS_PER_STAGE, START_STAGE, START_INTENSITY } from './config.js';

const KEY = 'reproom.v1';

const fresh = () => ({
  stage: START_STAGE,
  intensity: START_INTENSITY,
  // ticks[stage][day] = intensities it was finished at, e.g. { "7": { "6": ["high"] } }
  ticks: {},
  // every finished workout, repeats included (for streaks and totals later)
  log: [],
  settings: { allSounds: true, voice: 'kokoro-michael', reads: 'nameOnly', sfx: 'on', tick: 'classic', chime: 'classic', voiceVol: 100, fxVol: 100, weightsOn: false,
    // Rest screen (I07): the scenes ticked in Settings → Rest screen ('moon' = the still moon).
    restScenes: ['breathing', 'camp', 'beach', 'clouds', 'cabin', 'lake'] },
});

let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) return { ...fresh(), ...s, settings: { ...fresh().settings, ...s.settings } };
  } catch (e) { /* fall through */ }
  return fresh();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
}

export const get = () => state;

// Auto backup (F16): main.js listens, and a backup to Drive follows each
// save that counts: a finished workout, an early end, a run routine, Import
// history, Reset my progress and the Stage − / + jump (Restore and Undo
// restore: settings.js). Other settings changes (intensity, sound) don't.
let onSavedFn = null;
export function onSaved(fn) { onSavedFn = fn; }
const saved = () => { try { onSavedFn?.(); } catch (e) { /* never block a save */ } };

// "Keep my data" (Q01): ask the browser not to clear RepRoom's storage when
// space runs low. Asked once per app start, and not at all once it's granted.
// Resolves to true when the data is kept, false otherwise.
let keptCheck = null;
export function keepData() {
  return keptCheck ||= (async () => {
    if (!navigator.storage) return false;
    try {
      if (navigator.storage.persisted && await navigator.storage.persisted()) return true;
      return navigator.storage.persist ? await navigator.storage.persist() : false;
    } catch (e) { return false; }
  })();
}

// A day counts as done in a stage if it was finished at any intensity,
// so switching intensity keeps every tick.
export function isDone(stage, day) {
  const d = state.ticks[stage]?.[day];
  return !!(d && d.length);
}

export function doneCount(stage) {
  let n = 0;
  for (let d = 1; d <= DAYS_PER_STAGE; d++) if (isDone(stage, d)) n++;
  return n;
}

export const stageComplete = stage => doneCount(stage) === DAYS_PER_STAGE;

// "Today": the next undone day in the suggested order, or null if all done.
export function todayDay(stage) {
  for (let d = 1; d <= DAYS_PER_STAGE; d++) if (!isDone(stage, d)) return d;
  return null;
}

// A stage is open if it's the current one, an earlier one, or the one
// before it is complete.
export function stageUnlocked(stage) {
  return stage <= state.stage || stageComplete(stage - 1);
}

// Finishing a workout: tick its day for that stage and intensity, and log it
// (repeats are logged too; they count towards streaks and totals later).
// weights (F12), when the weight set was on: { move, sets: [{ set, side, reps, kg }] },
// side null, or "left" / "right" for Kneeling row.
// track (F14): the moves done and skipped (see track.js).
export function finish({ stage, day, intensity, secs, moves, kcal, weights, track }) {
  const s = (state.ticks[stage] ||= {});
  const d = (s[day] ||= []);
  if (!d.includes(intensity)) d.push(intensity);
  const entry = { stage, day, intensity, secs, moves, kcal, at: new Date().toISOString() };
  if (weights) entry.weights = weights;
  if (track) entry.track = track;
  state.log.push(entry);
  save();
  saved();
}

// A workout ended early (End workout?): every one is logged (F14), with
// early: true, its time so far, its track and any weight sets ("last time"
// reads them). The day isn't ticked and it isn't a session.
export function logEarly({ stage, day, intensity, secs, moves, kcal, weights, track }) {
  const entry = { stage, day, intensity, secs, moves, kcal, at: new Date().toISOString(), early: true };
  if (weights) entry.weights = weights;
  if (track) entry.track = track;
  state.log.push(entry);
  save();
  saved();
}

// A finished run routine (F11): logged with kind "run". It never ticks a
// stage day, so Home's "today" and stage progress don't move.
export function finishRun({ routine, secs, moves, kcal }) {
  state.log.push({ kind: 'run', routine, secs, moves, kcal, at: new Date().toISOString() });
  save();
  saved();
}

// Does a log entry count as a session (a finished calisthenics workout)?
// Not an early end, and not a run routine (F14, 8 Nov: routines count towards
// streak, time, kcal and moves, but add no session and no Wall tile).
// Every count of sessions goes through this.
export const isSession = e => !!e && !e.early && e.kind !== 'run';

export function setStage(stage) {
  state.stage = stage;
  save();
}

// Settings > Stage − / +: a manual override that can go to any stage.
// Going forward ticks off every workout in all the stages before it;
// going back un-ticks nothing.
export function jumpToStage(stage) {
  if (stage > state.stage) {
    for (let s = 1; s < stage; s++) {
      for (let d = 1; d <= DAYS_PER_STAGE; d++) {
        const day = ((state.ticks[s] ||= {})[d] ||= []);
        if (!day.length) day.push(state.intensity);
      }
    }
  }
  state.stage = stage;
  save();
  saved(); // the jump changes progress (ticks, stage), so it's backed up (F16, Mike 11 Nov)
}

// Intensity changes straight away and never touches progress.
export function setIntensity(id) {
  state.intensity = id;
  save();
}

export function setSetting(key, value) {
  state.settings[key] = value;
  save();
}

// Reset my progress: clears the current stage only.
export function resetStage(stage) {
  delete state.ticks[stage];
  save();
  saved();
}

// Import history (F14, board 04h): adds a reproom-history file, never
// replaces. state.history = { ids: [file ids], added: ISO time, estimated:
// { sessions, secs, moves: { id: [sets, secs] } } } (summed over files).
// - each dated session goes into the log as a session entry ({ src: "strava",
//   n, stage, day, intensity, name, secs, at: "<date>T12:00:00", track }),
//   unless a session already in the log is on the same local date (that
//   one stays); the log is kept in date order
// - ticks are merged (a tick is never removed); stage only goes up
// Returns false if this file was already added.
export function addHistory(doc) {
  const h = (state.history ||= { ids: [], added: null, estimated: { sessions: 0, secs: 0, moves: {} } });
  if (h.ids.includes(doc.id)) return false;
  h.ids.push(doc.id);
  h.added = new Date().toISOString();
  const est = doc.estimated || {};
  h.estimated.sessions += est.sessions || 0;
  h.estimated.secs += est.secs || 0;
  for (const [id, [sets, secs]] of Object.entries(est.moves || {})) {
    const m = (h.estimated.moves[id] ||= [0, 0]);
    m[0] += sets; m[1] += secs;
  }
  const localDay = at => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const have = new Set(state.log.filter(isSession).map(e => localDay(e.at)));
  for (const s of doc.sessions || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) || have.has(s.date)) continue;
    const e = { src: 'strava', n: s.n, stage: s.stage, day: s.day, intensity: s.intensity, name: s.name, secs: s.secs || 0,
      at: `${s.date}T12:00:00`, track: { done: s.done || {}, skipped: [] } };
    state.log.push(e);
  }
  state.log.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const [st, days] of Object.entries(doc.ticks || {})) {
    for (const [d, ints] of Object.entries(days || {})) {
      const day = ((state.ticks[st] ||= {})[d] ||= []);
      for (const i of ints || []) if (!day.includes(i)) day.push(i);
    }
  }
  if (Number(doc.stage) > state.stage) state.stage = Number(doc.stage);
  save();
  saved();
  return true;
}
