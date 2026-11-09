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
  settings: { allSounds: true, voice: 'kokoro-michael', reads: 'nameOnly', sfx: 'on', tick: 'classic', chime: 'classic', voiceVol: 100, fxVol: 100, weightsOn: false },
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
export function finish({ stage, day, intensity, secs, moves, kcal, weights }) {
  const s = (state.ticks[stage] ||= {});
  const d = (s[day] ||= []);
  if (!d.includes(intensity)) d.push(intensity);
  const entry = { stage, day, intensity, secs, moves, kcal, at: new Date().toISOString() };
  if (weights) entry.weights = weights;
  state.log.push(entry);
  save();
}

// A workout ended early (End workout?) that has weight sets done: logged
// with early: true so the sets count for "last time", but the day isn't
// ticked and it isn't a finished workout (F14 rule for workouts ended early).
export function logEarly({ stage, day, intensity, secs, moves, kcal, weights }) {
  state.log.push({ stage, day, intensity, secs, moves, kcal, at: new Date().toISOString(), early: true, weights });
  save();
}

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
}
