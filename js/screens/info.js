// Exercise info (design 06). The how-to / mistakes / tips part is shared
// with the info sheet over the paused player (06b, built in step 3).
import * as data from '../data.js';
import * as store from '../store.js';
import { sym } from '../symbols.js';
import { go, clock, stepName, sectionLabel } from '../ui.js';
import { moveArt } from '../moveimg.js';

const soon = '<p class="soon">Coming soon</p>';

// The intro (D07) goes first: right under the name on the info screen,
// just above HOW TO DO IT in the sheet. No intro, nothing shown.
export function howToHtml(m) {
  const intro = m.intro ? `<p class="intro">${m.intro}</p>` : '';
  const how = m.howTo.length
    ? `<ol class="steps">${m.howTo.map((t, i) => `<li><span class="n num">${i + 1}</span><span>${t}</span></li>`).join('')}</ol>` : soon;
  const mis = m.mistakes.length
    ? `<ul class="marks">${m.mistakes.map(t => `<li><span class="mk x">×</span><span>${t}</span></li>`).join('')}</ul>` : soon;
  const tips = m.tips.length
    ? `<ul class="marks">${m.tips.map(t => `<li><span class="mk dia"></span><span>${t}</span></li>`).join('')}</ul>` : soon;
  return `${intro}
    <section class="isec"><h3 class="label red">How to do it</h3>${how}</section>
    <section class="isec"><h3 class="label red">Common mistakes</h3>${mis}</section>
    <section class="isec"><h3 class="label red">Tips</h3>${tips}</section>`;
}

// day: a workout's day, or a run routine's id (F11).
export function render(app, day, ref) {
  const st = store.get();
  const isRun = typeof day === 'string';
  const workout = isRun ? data.routine(day) : data.workoutFor(st.intensity, day);
  const back = isRun ? `#/run/${day}` : `#/workout/${day}`;
  const [sec, i] = ref.split('.');
  const step = workout?.sections[sec]?.[+i];
  if (!step || step.type !== 'move') { go(back); return; }
  const m = data.move(step.move);
  const need = m.equipment.length ? `
    <section class="isec"><h3 class="label red">You'll need</h3>
      <ul class="need">${m.equipment.map(e => `<li><span class="eq">${sym('barbell')}</span><span>${e}</span></li>`).join('')}</ul>
    </section>` : '';

  app.innerHTML = `
    <section class="info">
      <div class="hero-top tall ${sec === 'main' ? 'amber' : 'warm'}">
        <div class="top">
          <button class="icon-btn light" data-back aria-label="Back">${sym('arrowLeft')}</button>
          <div class="icons">
            <button class="icon-btn light" data-progress aria-label="Progress">${sym('progress')}</button>
            <button class="icon-btn light" data-settings aria-label="Settings">${sym('gear')}</button>
          </div>
        </div>
        <div class="hero-fig"></div>
      </div>
      <div class="pad">
        <p class="label red">${isRun ? workout.groupLabel : sectionLabel(sec)} · <span class="num">${clock(step.secs)}</span></p>
        <h1 class="w-name">${stepName(step)}</h1>
        ${howToHtml(m)}
        ${need}
      </div>
    </section>`;

  // The move's loop on its colour (F09), with its own faint floor line.
  moveArt(step.move, 'loop', { fallback: 'figureFloor' }).place(app.querySelector('.hero-fig'), true);

  app.querySelector('[data-back]').addEventListener('click', () => go(back));
  app.querySelector('[data-settings]').addEventListener('click', () => go('#/settings'));
}
