// Workout summary (design 12), and a run routine's summary (board 16d).
import * as store from '../store.js';
import { sym } from '../symbols.js';
import { pad2, go } from '../ui.js';
import { DAYS_PER_STAGE, MAX_STAGE } from '../config.js';
import { result } from './player.js';
import * as data from '../data.js';
import * as weights from '../weights.js';
import { resetView } from './home.js';
import * as stats from '../stats.js';
import { grid } from '../wall.js';

const p2 = pad2;
// The Wall strip (F14, boards 12, 12b, 12c): the symbol small with the new
// tile outlined in red, the session number, and the line under it.
// plusTile: "+1 tile · " in front (not on Stage complete).
export function wallStrip(r, plusTile = true) {
  if (!r.wall) return '';
  const { symbol, tiles } = r.wall;
  const line = tiles === 100 ? `Symbol ${p2(symbol)} finished` : `<b class="num">${tiles}</b> / 100 on symbol ${p2(symbol)}`;
  return `
      <div class="wstrip">
        ${grid(symbol, tiles, 7, 2, { newTile: tiles, label: `Symbol ${p2(symbol)} with the new tile marked.` })}
        <span class="ws-txt">
          <span class="label red">The Wall</span>
          <span class="ws-n">Session ${r.session.toLocaleString('en-GB')}</span>
          <span class="ws-line">${plusTile ? '+1 tile · ' : ''}${line}</span>
        </span>
      </div>`;
}

// One amber strip per milestone this workout crossed, in track order.
const milestoneStrips = r => (r.crossed || []).map(m => `
      <div class="mstrip">
        <span class="ico">${sym('medal')}</span>
        <span><span class="label">Milestone</span><span class="ms-nm">${m.label}</span></span>
      </div>`).join('');

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
        <div><p class="label">Moves${r.skipped ? ` · ${r.skipped} skipped` : ''}</p><p class="num big">${r.movesDone ?? r.moves}<span class="of"> / ${r.moves}</span></p></div>
        <div><p class="label">Focus</p><p class="focus">${r.focus}</p></div>
      </div>${wCard}${wallStrip(r)}${milestoneStrips(r)}
      <div class="stage-row">
        <p class="label">Stage <span class="num">${pad2(r.stage)}</span></p>
        <p class="label"><span class="num">${store.doneCount(r.stage)}</span><span class="slash">/</span><span class="num">${DAYS_PER_STAGE}</span> done</p>
      </div>
      <div class="sblocks">${blocks}</div>
      <button class="cta bottom" data-home>${cont ? 'Continue' : 'Back to home'}<span class="go">${sym('arrowRight')}</span></button>
    </section>`;

  app.querySelector('[data-home]').addEventListener('click', () => {
    // After a stage's 28th workout, CONTINUE opens Stage complete (12b).
    if (cont) { go('#/stage-complete'); return; }
    resetView();
    go('#/');
  });
  app.querySelector('[data-settings]').addEventListener('click', () => go('#/settings'));
}

// Stage complete (F14, board 12b), after the stage's 28th workout.
export function renderStage(app) {
  const r = result();
  if (!r || r.run || !r.stageJustCompleted) { go('#/'); return; }
  const s = stats.stageStats(r.stage);
  const next = r.stage < MAX_STAGE ? r.stage + 1 : null;
  // Compare days taken with the stages before it.
  let compare = '';
  if (s.days) {
    const earlier = [];
    for (let k = 1; k < r.stage; k++) { const d = stats.stageStats(k).days; if (d) earlier.push({ k, d }); }
    if (earlier.length) {
      const last = earlier.at(-1);
      const fastest = s.days < Math.min(...earlier.map(e => e.d));
      compare = `<p class="sc-cmp">${fastest ? 'Your fastest stage yet. ' : ''}Stage <b class="num">${p2(last.k)}</b> took <b class="num">${last.d}</b> ${last.d === 1 ? 'day' : 'days'}.</p>`;
    }
  }
  app.innerHTML = `
    <section class="screen summary stagec">
      <div class="top">
        <p class="label red kicker">Stage <span class="num">${p2(r.stage)}</span> · Complete</p>
        <div class="icons">
          <button class="icon-btn" data-progress aria-label="Progress">${sym('progress')}</button>
          <button class="icon-btn" data-settings aria-label="Settings">${sym('gear')}</button>
        </div>
      </div>
      <div class="sc-box">
        <div class="badge">${sym('medal')}</div>
        <h1>Stage <span class="num">${p2(r.stage)}</span> done</h1>
        <p class="label">All <span class="num">${DAYS_PER_STAGE}</span> workouts</p>
      </div>
      <div class="stats">
        <div><p class="label">Days taken</p><p class="num big">${s.days ?? '—'}</p></div>
        <div><p class="label">Time</p><p class="num big">${Math.round(s.secs / 3600)}<span class="u">hrs</span></p></div>
        <div><p class="label">Moves done</p><p class="num big">${s.sets.toLocaleString('en-GB')}</p></div>
        <div><p class="label">Skipped</p><p class="num big">${s.skipped}</p></div>
      </div>
      ${compare}
      ${wallStrip(r, false)}
      ${next ? `
      <div class="unl">
        <span class="ico">${sym('unlock')}</span>
        <span>Stage <b class="num">${p2(next)}</b> is unlocked</span>
      </div>` : ''}
      <div class="sc-btns">
        ${next ? `<button class="cta" data-start>Start stage ${p2(next)}<span class="go">${sym('arrowRight')}</span></button>
        <button class="cta outline" data-home>Not now</button>`
        : `<button class="cta" data-home>Back to home<span class="go">${sym('arrowRight')}</span></button>`}
      </div>
    </section>`;

  const on = (sel, fn) => app.querySelectorAll(sel).forEach(b => b.addEventListener('click', fn));
  // START STAGE 08: Home moves to Stage 08, Day 01 (what CONTINUE did before).
  on('[data-start]', () => {
    if (store.get().stage === r.stage) store.setStage(next);
    resetView();
    go('#/');
  });
  // NOT NOW: Home, stage unchanged (the next stage is unlocked anyway).
  on('[data-home]', () => { resetView(); go('#/'); });
  on('[data-settings]', () => go('#/settings'));
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
