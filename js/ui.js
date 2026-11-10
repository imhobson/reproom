// Small shared helpers.
import { move } from './data.js';

export const pad2 = n => String(n).padStart(2, '0');

// Moving between screens replaces the history entry instead of adding one, so
// the phone's back button never walks back through a journey (B04, nav.js).
export function go(hash) { location.replace(hash); }

// 30 -> "0:30", 75 -> "1:15"
export const clock = secs => `${Math.floor(secs / 60)}:${pad2(secs % 60)}`;

// Move name as shown in lists, with the side if it has one.
export function stepName(step) {
  if (step.type === 'rest') return step.walkBack ? 'Walk back' : 'Rest'; // walk back: F11 run drills
  const m = move(step.move);
  const name = m ? m.name : step.move;
  return step.side ? `${name} (${step.side})` : name;
}

const SECTION_LABELS = { warmup: 'Warm-up', main: 'Main workout', weights: 'Weights', cooldown: 'Cool-down' };
export const sectionLabel = k => SECTION_LABELS[k];

let toastTimer = null;
export function showToast(html, ms = 4000) {
  const t = document.getElementById('toast');
  t.innerHTML = html;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
  t.onclick = hideToast;
}
export function hideToast() { document.getElementById('toast').hidden = true; }
