// What's set up for the workout about to be played (not saved).
// Workout details sets this; the player reads it.
// weight = the dumbbell move picked on Workout details (F12). It isn't saved:
// null means "work it out again" (the move done longest ago).
const current = { day: null, on: { warmup: true, cooldown: true }, weight: null };

export function forDay(day) {
  if (current.day !== day) {
    current.day = day;
    current.on = { warmup: true, cooldown: true };
    current.weight = null;
  }
  return current;
}

// After a workout ends, the next one starts fresh (and the weights pick is
// worked out again).
export function clear() { current.day = null; current.weight = null; }
