// Weights (F12): the optional dumbbell set after the main workout.
// What was done last time, which move to offer first, the time estimate,
// and the one-line description of a set list ("3 × 10 · 12 kg").
import * as data from './data.js';
import * as store from './store.js';
import { sinceText } from './backup.js';
import { WEIGHT_SETS, WEIGHT_REST_SECS, WEIGHT_SET_SECS_ESTIMATE } from './config.js';

const sideList = m => (m.sides === 'lr' ? ['left', 'right'] : [null]);

// The move's name in lists: Kneeling row reads "Kneeling row (each arm)".
export const listName = m => (m.sides === 'lr' ? `${m.name} (each arm)` : m.name);

// The most recent log entry with sets for this move: { at, sets } or null.
export function last(moveId) {
  const log = store.get().log;
  for (let i = log.length - 1; i >= 0; i--) {
    const w = log[i].weights;
    if (w && w.move === moveId && w.sets?.length) return { at: log[i].at, sets: w.sets };
  }
  return null;
}

// The move to offer first: the one done longest ago. Never done counts as
// longest ago, and ties go in list order.
export function pickDefault() {
  let best = null, bestAt = Infinity;
  for (const m of data.weightMoves()) {
    const l = last(m.id);
    const at = l ? Date.parse(l.at) : -Infinity;
    if (at < bestAt) { best = m.id; bestAt = at; }
  }
  return best;
}

// Estimated seconds for Workout details: the Next up before set 1, every set
// (each side counts as a set for Kneeling row) and the rests between sets.
export function estimateSecs(moveId) {
  const m = data.move(moveId);
  if (!m) return 0;
  const sets = WEIGHT_SETS * sideList(m).length;
  return data.defaults().previewSecs + sets * WEIGHT_SET_SECS_ESTIMATE + (WEIGHT_SETS - 1) * WEIGHT_REST_SECS;
}

// 12 -> "12", 12.5 -> "12.5"
export const kg = n => (n == null || n === '' ? '—' : String(Math.round(n * 10) / 10));

// One side's sets as one line:
//   every set the same:  "3 × 10 · 12 kg"
//   reps differ:         "10 · 10 · 8 reps · 12 kg"
//   kg changed:          "10 × 12 · 10 × 12.5 · 8 × 12.5 kg"
function oneLine(sets) {
  const sameReps = sets.every(s => s.reps === sets[0].reps);
  const sameKg = sets.every(s => s.kg === sets[0].kg);
  if (sameKg && sameReps) return `${sets.length} × ${sets[0].reps} · ${kg(sets[0].kg)} kg`;
  if (sameKg) return `${sets.map(s => s.reps).join(' · ')} reps · ${kg(sets[0].kg)} kg`;
  return `${sets.map(s => `${s.reps} × ${kg(s.kg)}`).join(' · ')} kg`;
}

// A list of sets as lines of text. Kneeling row gives one line when both
// sides match, otherwise "L …" and "R …".
export function describe(sets) {
  if (!sets?.length) return [];
  if (!sets.some(s => s.side)) return [oneLine(sets)];
  const l = oneLine(sets.filter(s => s.side === 'left'));
  const r = oneLine(sets.filter(s => s.side === 'right'));
  return l === r ? [l] : [`L ${l}`, `R ${r}`];
}

// The mono line under each move on Workout details:
// "Last · 3 × 10 · 12 kg · 4 days ago", or "Not done yet".
export function lastLine(moveId) {
  const l = last(moveId);
  if (!l) return 'Not done yet';
  return `Last · ${describe(l.sets).join(' · ')} · ${sinceText(l.at)}`;
}

export { sideList };
