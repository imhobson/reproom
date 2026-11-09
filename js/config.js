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
