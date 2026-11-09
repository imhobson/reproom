// RepRoom settings that aren't in the data. Change them here.

// Placeholder energy estimate while workouts.json has kcal: null.
export const KCAL_PER_MIN = 5.3;

// Days in a stage.
export const DAYS_PER_STAGE = 28;

// Highest stage the Stage setting can reach.
export const MAX_STAGE = 99;

// First run: start on Stage 01 at Medium.
export const START_STAGE = 1;
export const START_INTENSITY = 'medium';

// Feedback (F15): the Apps Script web app behind the "RepRoom feedback inbox"
// sheet (setup: 05 Build/RepRoom-feedback-setup.md). The URL is public; the
// key that unlocks it is NOT in the code or the repo: it's pasted once on the
// phone (Feedback > Connect).
export const FEEDBACK_URL = 'https://script.google.com/macros/s/AKfycbwbBKwNrjsv-R26Pw82FTIEKPn1DeG-BfCAMKFuv1fNAS1jKKeBZzU0RVHabI_IDbnPww/exec';

// Weights (F12): the optional dumbbell set after the main workout.
export const WEIGHT_SETS = 3;               // sets per workout (each side is its own screen for Kneeling row)
export const WEIGHT_REST_SECS = 90;         // rest between sets
export const WEIGHT_DEFAULT_REPS = 10;      // reps on set 1 the first time on a move
export const WEIGHT_KG_STEP = 0.5;          // − / + on KG EACH, and what a typed kg rounds to
export const WEIGHT_SET_SECS_ESTIMATE = 45; // only for the time estimate on Workout details
