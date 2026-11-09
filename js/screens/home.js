// Home (designs 01 today, 02 past day, 03 future day).
import * as data from '../data.js';
import * as store from '../store.js';
import { sym } from '../symbols.js';
import { DAYS_PER_STAGE, MAX_STAGE } from '../config.js';
import { pad2, showToast, go } from '../ui.js';

let viewDay = null; // the day being looked at; null = today
let stripLeft = null; // where the day strip was scrolled to (kept across redraws)

export function render(app) {
  const st = store.get();
  const stage = st.stage;
  const inten = data.intensity(st.intensity);
  const today = store.todayDay(stage);
  if (viewDay == null) viewDay = today ?? DAYS_PER_STAGE;
  const day = viewDay;
  const done = store.isDone(stage, day);
  const isToday = day === today;
  const workout = data.workoutFor(st.intensity, day);
  const ready = workout && workout.complete;

  // Day strip: 28 days, then the next two stages.
  let tiles = '';
  for (let d = 1; d <= DAYS_PER_STAGE; d++) {
    const cls = ['tile', store.isDone(stage, d) ? 'done' : '', d === today ? 'today' : '', d === day ? 'viewing' : ''].join(' ');
    const inner = store.isDone(stage, d) ? sym('check') : `<span class="num">${pad2(d)}</span>`;
    tiles += `<button class="${cls}" data-day="${d}" aria-label="Day ${pad2(d)}">${inner}</button>`;
  }
  const nextStages = [stage + 1, stage + 2].filter(n => n <= MAX_STAGE);
  for (const n of nextStages) {
    const open = store.stageUnlocked(n);
    tiles += `<button class="tile stage" data-stage="${n}" aria-label="Stage ${pad2(n)}${open ? '' : ', locked'}">`
      + (open ? `<span class="num">${pad2(n)}</span>` : sym('lock'))
      + `<span class="tile-cap">STAGE<br>${pad2(n)}</span></button>`;
  }

  const status = done ? 'Completed' : isToday ? 'Up next' : 'Coming up';
  const hero = done
    ? `<div class="hero done"><div><div class="badge">${sym('check')}</div><div class="label done-label">Completed</div></div></div>`
    : `<div class="hero ${isToday ? 'amber' : ''}">${sym('barbell')}</div>`;

  let info;
  if (ready) {
    const s = data.stats(workout);
    const secMin = k => Math.round(data.sectionSecs(workout, k) / 60);
    info = `
      <h2 class="w-name">${workout.name}</h2>
      <p class="meta label">Day <span class="num">${pad2(day)}</span><span class="dot">·</span><span class="num">${s.mins}</span> min<span class="dot">·</span><span class="num">${s.moves}</span> moves</p>
      <div class="sections">
        <div class="sec">${sym('warmup')}<div><div class="label">Warm-up</div><div class="val"><span class="num">${secMin('warmup')}</span> MIN</div></div></div>
        <div class="sec main">${sym('barbell')}<div><div class="label">Main</div><div class="val"><span class="num">${secMin('main')}</span> MIN</div></div></div>
        <div class="sec">${sym('cooldown')}<div><div class="label">Cool-down</div><div class="val"><span class="num">${secMin('cooldown')}</span> MIN</div></div></div>
      </div>
      <button class="cta" data-go>${done ? 'Do it again' : 'Go to workout'}<span class="go">${sym('arrowRight')}</span></button>`;
  } else {
    info = `
      <h2 class="w-name">${workout ? workout.name : 'Not added yet'}</h2>
      <p class="meta label">Day <span class="num">${pad2(day)}</span></p>
      <button class="cta" disabled>Not added yet</button>`;
  }

  app.innerHTML = `
    <section class="screen home">
      <div class="top">
        <div>
          <p class="label kicker">RepRoom · ${inten.label} · ${inten.minutes} min</p>
          <h1 class="stage-title">Stage ${pad2(stage)}</h1>
        </div>
        <div class="icons">
          <button class="icon-btn" data-progress aria-label="Progress">${sym('progress')}</button>
          <button class="icon-btn" data-settings aria-label="Settings">${sym('gear')}</button>
        </div>
      </div>
      <p class="label week">Week <span class="num" data-week>${Math.ceil(day / 7)}</span> of <span class="num">${DAYS_PER_STAGE / 7}</span></p>
      <div class="strip-wrap"><div class="strip">${tiles}</div></div>
      <div class="rule"></div>
      <div class="done-row">
        <p class="label"><span class="num">${store.doneCount(stage)}</span><span class="slash">/</span><span class="num">${DAYS_PER_STAGE}</span> done</p>
        <p class="label red">${status}</p>
      </div>
      ${hero}
      ${info}
      ${today != null && day !== today ? `<button class="back-current label">${sym('arrowLeft')}Back to current</button>` : ''}
    </section>`;

  wire(app, { stage, day });
}

function wire(app, { stage, day }) {
  const strip = app.querySelector('.strip');
  const tilesEl = [...strip.children];

  // Q08: the viewed day is the middle of the 7 squares in view, 3 either
  // side (days 01-03 stop at the start; centring days 26-28 brings the
  // Stage tiles in, and day 28 stops where the strip ends). Home redraws on
  // every tap, so put the strip back where it was, then scroll smoothly from
  // there. Opening the app: straight to it, no slide.
  const step = () => tilesEl[1].offsetLeft - tilesEl[0].offsetLeft;
  const target = Math.max(0, day - 1 - 3) * step();
  strip.style.scrollBehavior = 'auto';
  strip.scrollLeft = stripLeft ?? target;
  strip.style.scrollBehavior = '';
  if (stripLeft != null) strip.scrollTo({ left: target, behavior: 'smooth' });
  stripLeft = strip.scrollLeft;

  // Week label follows the strip as you swipe. The stage captions only
  // get room when the stage tiles are in view.
  const weekEl = app.querySelector('[data-week]');
  const wrap = app.querySelector('.strip-wrap');
  const onScroll = () => {
    stripLeft = strip.scrollLeft;
    const first = Math.round(strip.scrollLeft / step());
    weekEl.textContent = Math.min(4, Math.floor((first + 3) / 7) + 1);
    wrap.classList.toggle('has-caps', first + 7 > DAYS_PER_STAGE && tilesEl.length > DAYS_PER_STAGE);
  };
  onScroll();
  strip.addEventListener('scroll', onScroll, { passive: true });

  strip.addEventListener('click', e => {
    const t = e.target.closest('.tile');
    if (!t) return;
    if (t.dataset.day) { viewDay = +t.dataset.day; render(app); return; }
    const n = +t.dataset.stage;
    if (store.stageUnlocked(n)) { store.setStage(n); viewDay = null; render(app); return; }
    showToast(`<span class="lockbox">${sym('lock')}</span><p>Do all <span class="num">${DAYS_PER_STAGE}</span> workouts in Stage <span class="num">${pad2(n - 1)}</span> to unlock Stage <span class="num">${pad2(n)}</span></p>`);
  });

  app.querySelector('.back-current')?.addEventListener('click', () => { viewDay = null; render(app); });
  app.querySelector('[data-go]')?.addEventListener('click', () => go(`#/workout/${day}`));
  app.querySelector('[data-settings]').addEventListener('click', () => go('#/settings'));
  // Progress isn't in this build: the icon does nothing yet.
}

// Called when coming back to Home from elsewhere, so it opens on today.
export function resetView() { viewDay = null; }
