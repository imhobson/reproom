// Loads data/workouts.json and data/moves.json (read-only) and works out
// lengths, move counts and kcal from the steps.
import { KCAL_PER_MIN } from './config.js';

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

export const SECTIONS = ['warmup', 'main', 'cooldown'];

// The steps that will play, in order, given which sections are switched on.
export function playSteps(workout, on = { warmup: true, cooldown: true }) {
  const out = [];
  for (const s of SECTIONS) {
    if (s !== 'main' && on[s] === false) continue;
    for (const step of workout.sections[s] || []) out.push({ ...step, section: s });
  }
  return out;
}

// Seconds a step takes, including the preview before a move.
export const stepSecs = step => step.secs + (step.type === 'move' ? W.defaults.previewSecs : 0);

export function sectionSecs(workout, s) {
  return (workout.sections[s] || []).reduce((t, st) => t + stepSecs(st), 0);
}

// extraSecs: time added on top of the workout's steps, e.g. the weights
// estimate (F12). It counts towards minutes and kcal, not moves.
export function stats(workout, on, extraSecs = 0) {
  const steps = playSteps(workout, on);
  const secs = steps.reduce((t, st) => t + stepSecs(st), 0) + extraSecs;
  const moves = steps.filter(st => st.type === 'move').length;
  const kcal = workout.kcal != null ? workout.kcal : Math.round((secs / 60) * KCAL_PER_MIN);
  return { secs, mins: Math.round(secs / 60), moves, steps: steps.length, kcal };
}
