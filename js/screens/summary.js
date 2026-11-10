// Workout summary (design 12), and a run routine's summary (board 16d).
import * as store from '../store.js';
import { sym } from '../symbols.js';
import { pad2, go } from '../ui.js';
import { DAYS_PER_STAGE, MAX_STAGE } from '../config.js';
import { result } from './player.js';
import * as data from '../data.js';
import * as weights from '../weights.js';
import { resetView } from './home.js';

export function render(app) {
  const r = result();
  if (!r) { go('#/'); return; }
  const mmss = s => `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
  if (r.run) { renderRun(app, r, mmss); return; }
  let blocks = '';
  for (let d = 1; d <= DAYS_PER_STAGE; d++) {
    blocks += `<i class="${d === r.day ? 'now' : store.isDone(r.stage, d) ? 'd' : ''}"></i>`;
  }
  const cont = r.stageJustCompleted;
  // Weights (F12, board 12c): one card for the move, under the stats.
  const wm = r.weights && data.move(r.weights.move);
  const wCard = wm ? `
      <div class="wcard">
        <span class="ico">${sym('dumbbell')}</span>
        <div>
          <p class="label red">Weights</p>
          <p class="nm">${wm.name}</p>
          ${weights.describe(r.weights.sets).map(l => `<p class="wsum">${l}</p>`).join('')}
        </div>
      </div>` : '';

  app.innerHTML = `
    <section class="screen summary">
      <div class="top">
        <p class="label red kicker">Stage <span class="num">${pad2(r.stage)}</span> · Day <span class="num">${pad2(r.day)}</span> · Completed</p>
        <div class="icons">
          <button class="icon-btn" data-progress aria-label="Progress">${sym('progress')}</button>
          <button class="icon-btn" data-settings aria-label="Settings">${sym('gear')}</button>
        </div>
      </div>
      <div class="done-box">
        <div class="badge">${sym('check')}</div>
        <h1>Workout done</h1>
      </div>
      <h2 class="w-name">${r.name}</h2>
      <div class="stats">
        <div><p class="label">Duration</p><p class="num big">${mmss(r.secs)}</p></div>
        <div><p class="label">kcal</p><p class="num big">${r.kcal}</p></div>
        <div><p class="label">Moves</p><p class="num big">${r.moves}</p></div>
        <div><p class="label">Focus</p><p class="focus">${r.focus}</p></div>
      </div>${wCard}
      <div class="stage-row">
        <p class="label">Stage <span class="num">${pad2(r.stage)}</span></p>
        <p class="label"><span class="num">${store.doneCount(r.stage)}</span><span class="slash">/</span><span class="num">${DAYS_PER_STAGE}</span> done</p>
      </div>
      <div class="sblocks">${blocks}</div>
      <button class="cta bottom" data-home>${cont ? 'Continue' : 'Back to home'}<span class="go">${sym('arrowRight')}</span></button>
    </section>`;

  app.querySelector('[data-home]').addEventListener('click', () => {
    // After a stage's 28th workout the next stage unlocks, and Home moves to it.
    if (cont && r.stage < MAX_STAGE && store.get().stage === r.stage) store.setStage(r.stage + 1);
    resetView();
    go('#/');
  });
  app.querySelector('[data-settings]').addEventListener('click', () => go('#/settings'));
}

// A run routine (F11, board 16d): the same layout, with RUN ROUTINE ·
// COMPLETED, "Drills done", no stage strip, and BACK TO RUN.
function renderRun(app, r, mmss) {
  app.innerHTML = `
    <section class="screen summary">
      <div class="top">
        <p class="label red kicker">Run routine · Completed</p>
        <div class="icons">
          <button class="icon-btn" data-progress aria-label="Progress">${sym('progress')}</button>
          <button class="icon-btn" data-settings aria-label="Settings">${sym('gear')}</button>
        </div>
      </div>
      <div class="done-box">
        <div class="badge">${sym('check')}</div>
        <h1>${r.done}</h1>
      </div>
      <h2 class="w-name">${r.name}</h2>
      <div class="stats">
        <div><p class="label">Duration</p><p class="num big">${mmss(r.secs)}</p></div>
        <div><p class="label">kcal</p><p class="num big">${r.kcal}</p></div>
        <div><p class="label">Moves</p><p class="num big">${r.moves}</p></div>
        <div><p class="label">Focus</p><p class="focus">${r.focus}</p></div>
      </div>
      <button class="cta bottom" data-run>Back to run<span class="go">${sym('arrowRight')}</span></button>
    </section>`;
  app.querySelector('[data-run]').addEventListener('click', () => go('#/run'));
  app.querySelector('[data-settings]').addEventListener('click', () => go('#/settings'));
}
