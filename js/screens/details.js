// Workout details (designs 05, and 05b with warm-up off).
import * as data from '../data.js';
import * as store from '../store.js';
import * as session from '../session.js';
import { sym } from '../symbols.js';
import * as audio from '../audio.js';
import { pad2, go, clock, stepName, sectionLabel } from '../ui.js';

const SEC_SYM = { warmup: 'warmup', main: 'barbell', cooldown: 'cooldown' };

export function render(app, day) {
  const st = store.get();
  const workout = data.workoutFor(st.intensity, day);
  if (!workout || !workout.complete) { go('#/'); return; }
  const sess = session.forDay(day);
  const s = data.stats(workout, sess.on);

  const sectionHtml = k => {
    const off = k !== 'main' && sess.on[k] === false;
    const mins = Math.round(data.sectionSecs(workout, k) / 60);
    const sw = k === 'main' ? '' :
      `<button class="switch ${off ? '' : 'on'}" data-toggle="${k}" role="switch" aria-checked="${!off}" aria-label="${sectionLabel(k)}"><span></span></button>`;
    const rows = (workout.sections[k] || []).map((step, i) => {
      if (step.type === 'rest') {
        return `<li class="row rest"><span class="ico">${sym('moon')}</span><span class="nm">Rest</span><span class="t num">${clock(step.secs)}</span></li>`;
      }
      return `<li><button class="row ${k === 'main' ? 'main' : ''}" data-step="${k}.${i}" ${off ? 'disabled' : ''}>`
        + `<span class="ico">${sym('figureSmall')}</span><span class="nm">${stepName(step)}</span><span class="t num">${clock(step.secs)}</span></button></li>`;
    }).join('');
    return `
      <section class="dsec ${off ? 'off' : ''}">
        <div class="dsec-head">
          <span class="hs">${sym(SEC_SYM[k])}</span>
          <p class="label">${sectionLabel(k)} · ${off ? 'Off' : `<span class="num">${mins}</span> min`}</p>
          ${sw}
        </div>
        <ul class="rows">${rows}</ul>
      </section>`;
  };

  app.innerHTML = `
    <section class="details">
      <div class="hero-top amber">
        <div class="top">
          <button class="icon-btn light" data-back aria-label="Back">${sym('arrowLeft')}</button>
          <div class="icons">
            <button class="icon-btn light" data-progress aria-label="Progress">${sym('progress')}</button>
            <button class="icon-btn light" data-settings aria-label="Settings">${sym('gear')}</button>
          </div>
        </div>
        <div class="hero-sym">${sym('barbell')}</div>
      </div>
      <div class="pad">
        <p class="label red">Stage <span class="num">${pad2(st.stage)}</span> · Day <span class="num">${pad2(day)}</span></p>
        <h1 class="w-name">${workout.name}</h1>
        <p class="meta label"><span class="num">${s.mins}</span> min<span class="dot">·</span><span class="num">${s.moves}</span> moves<span class="dot">·</span><span class="num">${s.kcal}</span> kcal</p>
        <button class="cta" data-go>Let's go<span class="go">${sym('arrowRight')}</span></button>
        ${data.SECTIONS.map(sectionHtml).join('')}
      </div>
      <div class="pinned"><button class="cta" data-go>Let's go<span class="go">${sym('arrowRight')}</span></button></div>
    </section>`;

  app.querySelector('[data-back]').addEventListener('click', () => go('#/'));
  app.querySelector('[data-settings]').addEventListener('click', () => go('#/settings'));
  // The tap on LET'S GO is what lets the phone play sound.
  app.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { audio.unlock(); go(`#/play/${day}`); }));
  app.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.toggle;
    sess.on[k] = !sess.on[k];
    const y = scrollY;
    render(app, day);
    scrollTo(0, y);
  }));
  app.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
    go(`#/workout/${day}/move/${b.dataset.step}`);
  }));
}
