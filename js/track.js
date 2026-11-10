// Move tracking (F14): which moves a workout did and which it skipped.
//
// A log entry's track (finished or ended early; run routines have none):
//   { done: { "<move id>": [sets, secs] }, skipped: ["<move id>", …],
//     warmup: true, cooldown: true }
// - done: sets and seconds per move. A left/right pair is one set, counted if
//   either side was done; a move with no side is one set per step done. Weight
//   sets (F12) go in under their move the same way (Kneeling row's left and
//   right in one set = one set). secs are the seconds actually run (a weight
//   set: the time on the set screen).
// - skipped: one id per move step skipped (a left/right move skipped on both
//   sides is in twice). Weight sets are never "skipped".
// - warmup / cooldown: whether they were on. Moves in a switched-off section
//   aren't in the workout, so they're in neither list.

export const SKIP = -1;

// Is step a the left half of the same set as step b (a right side)?
const pairOf = (a, b) => !!a && a.type === b.type && a.move === b.move && a.side === 'left' && b.side === 'right'
  && (b.type !== 'weight' || a.set === b.set);

// steps: the steps as played (data.playSteps). res[i]: seconds step i counts
// for when it was done, SKIP when it was skipped, undefined when neither
// (not reached before an early end). on: which sections were on.
export function build(steps, res, on = {}) {
  const done = {}, skipped = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.type !== 'move' && s.type !== 'weight') continue;
    const r = res[i];
    if (r === SKIP) { if (s.type === 'move') skipped.push(s.move); continue; }
    if (r == null) continue;
    const sameSet = s.side === 'right' && pairOf(steps[i - 1], s) && res[i - 1] >= 0;
    const d = (done[s.move] ||= [0, 0]);
    if (!sameSet) d[0] += 1;
    d[1] += Math.round(r);
  }
  return { done, skipped, warmup: on.warmup !== false, cooldown: on.cooldown !== false };
}
