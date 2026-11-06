// What's set up for the workout about to be played (not saved).
// Workout details sets this; the player reads it.
const current = { day: null, on: { warmup: true, cooldown: true } };

export function forDay(day) {
  if (current.day !== day) {
    current.day = day;
    current.on = { warmup: true, cooldown: true };
  }
  return current;
}
