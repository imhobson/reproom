// Run routines (F11, board 16): reached from the Run routines row on Home.
// A main screen: back to Home, the title, Progress and Settings. Then one
// group per routine (WARM-UP, DRILLS, COOL-DOWN), each with one card.
// The routines, their order and their card text are in config.js (RUN_ROUTINES).
import * as data from '../data.js';
import { sym } from '../symbols.js';
import { go } from '../ui.js';
import { head } from './settings.js';

const dot = '<span class="dot">·</span>';

function card(r) {
  const s = data.stats(r);
  return `
    <section class="rgroup">
      <h2 class="label rg-head">${sym(r.sym)}${r.groupLabel}</h2>
      <button class="rcard" data-routine="${r.id}">
        <span class="rc-tile ${r.tile}">${sym(r.sym)}</span>
        <span class="rc-txt">
          <span class="rc-name">${r.name}</span>
          <span class="label rc-meta"><span class="num">${s.mins}</span> min${dot}<span class="num">${s.moves}</span> moves${dot}<span class="num">${s.kcal}</span> kcal</span>
          <span class="rc-desc">${r.desc}</span>
        </span>
        <span class="rc-go">${sym('arrowRight')}</span>
      </button>
    </section>`;
}

export function render(app) {
  app.innerHTML = `
    <section class="screen run">
      ${head('Run', `<div class="icons">
        <button class="icon-btn" data-progress aria-label="Progress">${sym('progress')}</button>
        <button class="icon-btn" data-settings aria-label="Settings">${sym('gear')}</button>
      </div>`)}
      ${data.routines().map(card).join('')}
    </section>`;
  app.querySelector('[data-back]').addEventListener('click', () => go('#/'));
  app.querySelector('[data-settings]').addEventListener('click', () => go('#/settings'));
  // Progress isn't built yet: the icon does nothing (as on Home).
  app.querySelectorAll('[data-routine]').forEach(b => b.addEventListener('click', () => go(`#/run/${b.dataset.routine}`)));
}
