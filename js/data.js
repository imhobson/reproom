// Loads data/workouts.json and data/moves.json (read-only) and works out
// lengths, move counts and kcal from the steps.
import { KCAL_PER_MIN, WEIGHT_SETS, WEIGHT_REST_SECS, WEIGHT_SET_SECS_ESTIMATE, RUN_ROUTINES } from './config.js';

let W = null; // workouts.json
let M = null; // moves by id

export async function loadData() {
  const [w, m] = await Promise.all([
    fetch('data/workouts.json').then(r => r.json()),
    fetch('data/moves.json').then(r => r.json()),
  ]);
  W = w;
  M = Object.fromEntries(m.moves.map(x => [x.id, x]));
}

export const defaults = () => W.defaults;
export const intensities = () => W.intensities;
export const intensity = id => W.intensities.find(i => i.id === id);
export const move = id => M[id];

// The dumbbell moves (F12), in moves.json order: the order of the pick list.
export const weightMoves = () => Object.values(M).filter(m => m.category === 'weights');

export function workoutFor(intensityId, day) {
  return W.workouts.find(w => w.intensity === intensityId && w.day === day) || null;
}

// Run routines (F11): from workouts.json's routines list, with the Run screen
// details from config (RUN_ROUTINES). A routine has the same shape as a
// workout (sections with one group filled), so stats() and playSteps() work on it.
export function routine(id) {
  const r = (W.routines || []).find(x => x.id === id);
  const c = RUN_ROUTINES.find(x => x.id === id);
  return r && c ? { ...r, ...c, kind: 'run' } : null;
}
export const routines = () => RUN_ROUTINES.map(c => routine(c.id)).filter(Boolean);

export const SECTIONS = ['warmup', 'main', 'cooldown'];

// The weight set (F12) as steps: set 1, rest, set 2, rest, set 3. A move
// with sides (Kneeling row) has two set steps per set, left then right.
// A set step is { type: 'weight', move, set, sets, side, secs, preview }:
// secs is only an estimate (sets are counted in reps, not timed), and only
// the very first set step has the 10s Next up before it.
export function weightSteps(moveId) {
  const m = M[moveId];
  if (!m) return [];
  const sides = m.sides === 'lr' ? ['left', 'right'] : [null];
  const out = [];
  for (let set = 1; set <= WEIGHT_SETS; set++) {
    for (const side of sides) {
      const st = { type: 'weight', move: moveId, set, sets: WEIGHT_SETS, secs: WEIGHT_SET_SECS_ESTIMATE };
      if (side) st.side = side;
      if (!out.length) st.preview = true;
      out.push(st);
    }
    if (set < WEIGHT_SETS) out.push({ type: 'rest', secs: WEIGHT_REST_SECS });
  }
  return out;
}

// The steps that will play, in order, given which sections are switched on.
// on.weights = the dumbbell move's id when weights are on (null when off):
// its steps go after the main workout, before the cool-down.
export function playSteps(workout, on = { warmup: true, cooldown: true }) {
  const out = [];
  for (const s of SECTIONS) {
    if (s !== 'main' && on[s] === false) continue;
    for (const step of workout.sections[s] || []) out.push({ ...step, section: s });
    if (s === 'main' && on.weights) for (const step of weightSteps(on.weights)) out.push({ ...step, section: 'weights' });
  }
  return out;
}

// Seconds a step takes, including the preview before a move (or the first set).
export const stepSecs = step => step.secs + (step.type === 'move' || step.preview ? W.defaults.previewSecs : 0);

export function sectionSecs(workout, s) {
  return (workout.sections[s] || []).reduce((t, st) => t + stepSecs(st), 0);
}

// Estimated seconds for the weight set: the Next up, every set (each side
// counts as a set) and the rests between sets.
export const weightSecs = moveId => weightSteps(moveId).reduce((t, st) => t + stepSecs(st), 0);

// Weights count towards minutes and kcal, but not moves.
export function stats(workout, on) {
  const steps = playSteps(workout, on);
  const secs = steps.reduce((t, st) => t + stepSecs(st), 0);
  const moves = steps.filter(st => st.type === 'move').length;
  const kcal = workout.kcal != null ? workout.kcal : Math.round((secs / 60) * KCAL_PER_MIN);
  return { secs, mins: Math.round(secs / 60), moves, steps: steps.length, kcal };
}
