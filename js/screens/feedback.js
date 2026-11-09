// Feedback (04e, F15): a Settings sub-page with only the back button.
// Opened from a paused workout, it carries where the workout is.
import { head } from './settings.js';
import { pad2, go } from '../ui.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

let attach = true; // the ATTACHED switch; on each time the page opens

// "Day 06 · High" / "Main · Push-ups · step 12 / 50"
function attachedCard(w) {
  if (!w) return `<div class="s-card fb-attach"><p class="fb-none">Not in a workout</p></div>`;
  const name = w.side ? `${w.name} (${w.side})` : w.name;
  return `
    <div class="s-card fb-attach">
      <div>
        <p class="fb-day">Day ${pad2(w.day)} · ${esc(w.intensity)}</p>
        <p class="fb-where">${esc(w.section)} · ${esc(name)} · step ${w.stepNo} / ${w.steps}</p>
      </div>
      <button class="switch ${attach ? 'on' : ''}" data-attach role="switch" aria-checked="${attach}" aria-label="Attach the workout to this note"><span></span></button>
    </div>`;
}

export function render(app, workout) {
  attach = true;
  app.innerHTML = `
    <section class="screen settings feedback">
      ${head('Feedback')}
      <p class="s-help intro">Anything you notice. Claude files it into the backlog every night.</p>

      <h2 class="label red s-sec">Attached</h2>
      ${attachedCard(workout)}
    </section>`;

  app.querySelector('[data-back]').addEventListener('click', () => go('#/settings'));
  app.querySelector('[data-attach]')?.addEventListener('click', e => {
    attach = !attach;
    const b = e.currentTarget;
    b.classList.toggle('on', attach);
    b.setAttribute('aria-checked', attach);
  });
}

// Whether the workout goes with the note (used when sending).
export const attached = () => attach;
