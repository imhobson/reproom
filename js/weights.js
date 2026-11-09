// Weights (F12): the optional dumbbell set after the main workout.
// What was done last time, which move to offer first, and the one-line
// description of a set list ("3 × 10 · 12 kg").
import * as data from './data.js';
import * as store from './store.js';
import { sinceText } from './backup.js';

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

// Last time's set for this move, set number and side (null side for a move
// without sides): { reps, kg } or null. Set 1 starts from it.
export function lastSet(moveId, set, side = null) {
  const l = last(moveId);
  return l?.sets.find(s => s.set === set && (s.side || null) === side) || null;
}

// Last time on one side, as one line ("3 × 10 · 12 kg"), or null.
export function lastSideLine(moveId, side = null) {
  const l = last(moveId);
  const sets = l?.sets.filter(s => (s.side || null) === side);
  return sets?.length ? oneLine(sets) : null;
}

// A typed kg: comma or point, rounded to the nearest step, kept in range.
// '' -> null (empty), not a number -> undefined (keep what was there).
export function parseKg(text, step, max) {
  const t = String(text).replace(',', '.').trim();
  if (t === '') return null;
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(0, Math.round(n / step) * step));
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
  const ls = sets.filter(s => s.side === 'left'), rs = sets.filter(s => s.side === 'right');
  const l = ls.length ? oneLine(ls) : null, r = rs.length ? oneLine(rs) : null;
  if (l === r) return [l];
  return [l && `L ${l}`, r && `R ${r}`].filter(Boolean); // one side only after an early end
}

// The mono line under each move on Workout details:
// "Last · 3 × 10 · 12 kg · 4 days ago", or "Not done yet".
export function lastLine(moveId) {
  const l = last(moveId);
  if (!l) return 'Not done yet';
  return `Last · ${describe(l.sets).join(' · ')} · ${sinceText(l.at)}`;
}
