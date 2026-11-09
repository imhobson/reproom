// The workout player (designs 07 get ready, 08 exercise, 08b paused,
// 09 next up, 10 rest, 11 last move), plus the End workout? sheet (13)
// and the exercise info sheet over the paused player (06b).
//
// Every move step plays as: preview (Get ready / Next up, 10s) then the move.
// A rest step plays as one Rest phase.
import * as data from '../data.js';
import * as store from '../store.js';
import * as session from '../session.js';
import { sym } from '../symbols.js';
import { pad2, go, clock, stepName, sectionLabel } from '../ui.js';
import { howToHtml } from './info.js';
import * as audio from '../audio.js';

const SHORT = { warmup: 'Warm-up', main: 'Main', cooldown: 'Cool-down' };
const GO_CHIP_MS = 2500; // how long GO! stays on screen after a move starts
const TICK_MS = 100;
const VOICE_AFTER_CHIME_MS = 1400; // chime ends ~1.3s after a move ends

let P = null;       // the workout being played
let app = null;
let timer = null;
let lastResult = null; // handed to the summary

export const result = () => lastResult;

// ---- Starting, timing and moving between steps ----

function start(day) {
  const st = store.get();
  const workout = data.workoutFor(st.intensity, day);
  const on = { ...session.forDay(day).on };
  const steps = data.playSteps(workout, on);
  const moveIdx = steps.map((s, i) => (s.type === 'move' ? i : -1)).filter(i => i >= 0);
  const st2 = data.stats(workout, on);
  P = {
    day, stage: st.stage, intensity: st.intensity, workout, steps, stats: st2,
    firstMove: moveIdx[0], lastMove: moveIdx[moveIdx.length - 1],
    idx: 0, phase: null, left: 0, total: 0, sinceStart: 0,
    elapsed: 0, running: true, muted: false, sheet: null, sheetStep: null,
  };
  audio.setMuted(false);
  audio.resume();
  audio.preload(steps);
  enterStep(0);
}

function enterStep(i) {
  P.idx = i;
  const step = P.steps[i];
  if (step.type === 'move') {
    setPhase('preview', data.defaults().previewSecs);
    // Once, as Get ready / Next up starts. Straight after a move ends by
    // itself, wait for the finish chime first so they don't talk over each other.
    clearTimeout(P.voiceTimer);
    if (P.afterChime) P.voiceTimer = setTimeout(() => { if (P && P.running) audio.sayMove(step); }, VOICE_AFTER_CHIME_MS);
    else audio.sayMove(step);
  } else setPhase('rest', step.secs);
  P.afterChime = false;
}

function setPhase(phase, secs) {
  P.phase = phase;
  P.left = P.total = secs * 1000;
  P.sinceStart = 0;
  draw();
}

// End of the current phase: preview -> move, move/rest -> next step.
function advance() {
  if (P.phase === 'preview') { setPhase('move', P.steps[P.idx].secs); return; }
  if (P.idx + 1 >= P.steps.length) { finish(); return; }
  enterStep(P.idx + 1);
}

function prev() {
  if (P.idx > 0) enterStep(P.idx - 1);
  else enterStep(0);
}

function tick() {
  if (!P || !P.running) return;
  const now = performance.now();
  const dt = Math.min(now - (P.last || now), 1000);
  P.last = now;
  const before = P.left;
  P.left -= dt;
  P.elapsed += dt;
  P.sinceStart += dt;
  cues(before, P.left);
  if (P.left <= 0) advance();
  else update();
}

// Sound effects at the moments in docs/RepRoom-audio-spec.txt. They only
// play when a timer runs down by itself, not when you press NEXT or SKIP.
function cues(before, after) {
  const crossed = t => before > t && after <= t;
  if (P.phase === 'preview') {
    // ticks at 3, 2 and 1s left, then GO as the move timer starts
    if ([3000, 2000, 1000].some(crossed)) audio.tick();
    if (crossed(0)) audio.go();
  } else if (P.phase === 'move') {
    // ticks as the timer shows 00:02, 00:01 and 00:00, then the chime ~1.1s later
    if ([2000, 1000].some(crossed)) audio.tick();
    if (crossed(0)) { audio.tick(); audio.chime(1.1); P.afterChime = true; }
  }
}

// ---- Keep the screen on while the player is open ----

let wake = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } }
  catch (e) { wake = null; } // not allowed (e.g. not https, or low battery)
}
function letSleep() { if (wake) { wake.release(); wake = null; } }
// The phone drops the lock when the app goes to the background; take it back on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && P && location.hash.startsWith('#/play/')) keepAwake();
});

function startTimer() {
  stopTimer();
  P.last = performance.now();
  timer = setInterval(tick, TICK_MS);
}
function stopTimer() { clearInterval(timer); timer = null; }

function setRunning(run) {
  P.running = run;
  if (run) { audio.unlock(); audio.resume(); startTimer(); }
  else { audio.pause(); stopTimer(); }
  draw();
}

function finish() {
  clearTimeout(P.voiceTimer);
  stopTimer();
  audio.stopAll();
  letSleep();
  const secs = Math.round(P.elapsed / 1000);
  const moves = P.steps.filter(s => s.type === 'move').length;
  const kcal = kcalSoFar();
  const wasComplete = store.stageComplete(P.stage);
  store.finish({ stage: P.stage, day: P.day, intensity: P.intensity, secs, moves, kcal });
  lastResult = {
    stage: P.stage, day: P.day, name: P.workout.name, secs, moves, kcal,
    focus: focusOf(P.workout),
    stageJustCompleted: !wasComplete && store.stageComplete(P.stage),
  };
  P = null;
  go('#/summary');
}

function endWorkout() {
  clearTimeout(P.voiceTimer);
  stopTimer();
  audio.stopAll();
  letSleep();
  P = null;
  go('#/');
}

// ---- Numbers shown on screen ----

// kcal for the time actually spent (skipping shortens it), up to the workout's total.
function kcalSoFar() {
  const frac = Math.min(1, P.elapsed / 1000 / P.stats.secs);
  return Math.floor(P.stats.kcal * frac);
}

// Seconds left in the whole workout, including the current phase.
function workoutLeft() {
  let s = P.left / 1000;
  if (P.phase === 'preview') s += P.steps[P.idx].secs;
  for (let i = P.idx + 1; i < P.steps.length; i++) s += data.stepSecs(P.steps[i]);
  return s;
}

const mmss = secs => `${pad2(Math.floor(secs / 60))}:${pad2(Math.floor(secs % 60))}`;
const secsLeft = () => Math.ceil(P.left / 1000);

// The body area most of the main moves work, e.g. "Lower body".
function focusOf(workout) {
  const counts = {};
  const main = workout.sections.main.filter(s => s.type === 'move');
  for (const s of main) {
    const a = data.move(s.move)?.area;
    if (a) counts[a] = (counts[a] || 0) + 1;
  }
  const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || ['Full Body', 0];
  const area = n / main.length >= 0.5 ? top : 'Full Body';
  return area.charAt(0) + area.slice(1).toLowerCase();
}

// ---- Drawing ----

function view() {
  const step = P.steps[P.idx];
  const sec = step.section;
  const isLast = P.phase === 'move' && P.idx === P.lastMove;
  const isFirst = P.phase === 'preview' && P.idx === P.firstMove;
  const paused = !P.running;

  let chip = '', chipCls = '';
  if (paused) { chip = 'Paused'; chipCls = 'light'; }
  else if (P.phase === 'preview') chip = isFirst ? 'Get ready' : 'Next up';
  else if (P.phase === 'rest') chip = 'Rest';
  else if (isLast) chip = 'Last move';
  else if (P.sinceStart < GO_CHIP_MS) { chip = 'GO!'; chipCls = 'go'; }

  const kick = paused ? 'Paused'
    : P.phase === 'preview' ? (isFirst ? 'First move' : 'Starting soon')
    : P.phase === 'rest' ? 'Rest'
    : isLast ? 'Last move' : '';
  const kicker = `${sectionLabel(sec)}${kick ? ` · ${kick}` : ''}`;

  const cdLabel = paused ? 'Paused'
    : P.phase === 'preview' ? (isFirst ? 'Get ready' : 'Starts in')
    : P.phase === 'rest' ? 'Rest left' : 'Time left';

  // What the card at the bottom points to.
  const nextIdx = P.idx + 1;
  const nextStep = P.steps[nextIdx];
  let card;
  if (isLast || !nextStep) {
    card = { label: 'Then', name: 'Finish workout', sub: 'Summary', ico: sym('medal'), icoCls: 'amber' };
  } else {
    const label = P.phase === 'preview' && !isFirst ? 'After this' : 'Up next';
    const rest = nextStep.type === 'rest';
    card = {
      label, name: stepName(nextStep), sub: clock(nextStep.secs), idx: rest ? null : nextIdx,
      ico: sym(rest ? 'moon' : 'figureSmall'), icoCls: !rest && nextStep.section === 'main' ? 'amber' : '',
    };
  }

  // Player background state, in one place: grey while getting ready or resting,
  // a colour while a move runs. Paused keeps the state it paused in.
  const bgState = P.phase !== 'move' ? 'ready' : sec === 'main' ? 'main' : 'warm';
  const isRest = P.phase === 'rest';
  const left = workoutLeft();
  const minsLeft = left < 60 ? 'Under <span class="num">1</span> min left' : `<span class="num">${Math.ceil(left / 60)}</span> min left`;

  const blocks = P.steps.map((s, i) =>
    `<i class="${s.type === 'rest' ? 'r' : ''} ${i < P.idx ? 'd' : i === P.idx ? 'c' : ''}"></i>`).join('');

  return `
    <section class="player ${paused ? 'paused' : ''}" data-state="${bgState}">
      <div class="stage-art">
        <div class="top">
          <button class="icon-btn light" data-x aria-label="End workout">${sym('close')}</button>
          <div class="icons">
            <button class="icon-btn light" data-mute aria-label="${P.muted ? 'Unmute' : 'Mute'}">${sym(P.muted ? 'speakerOff' : 'speaker')}</button>
            <button class="icon-btn light" data-progress aria-label="Progress">${sym('progress')}</button>
            <button class="icon-btn light" data-settings aria-label="Settings">${sym('gear')}</button>
          </div>
        </div>
        ${chip ? `<p class="chip ${chipCls}">${chip}</p>` : ''}
        <div class="art">${sym(isRest ? 'moon' : 'figure')}</div>
      </div>
      <div class="pad">
        <p class="label red p-kicker">${kicker}</p>
        <h1 class="p-name">${isRest ? 'Rest' : stepName(step)}</h1>
        <div class="stepbar"><span data-bar style="width:${(P.left / P.total) * 100}%"></span></div>
        <div class="clock-row">
          <div class="side"><p class="num v" data-elapsed>${mmss(P.elapsed / 1000)}</p><p class="label">Elapsed</p></div>
          <div class="mid"><p class="num big" data-left>${mmss(secsLeft())}</p><p class="label">${cdLabel}</p></div>
          <div class="side r"><p class="num v" data-kcal>${kcalSoFar()}</p><p class="label">kcal</p></div>
        </div>
        <div class="controls">
          ${isRest
            ? `<button class="ctl" data-add30>+30 sec</button>`
            : `<button class="ctl" data-prev ${P.idx === 0 && P.phase === 'preview' ? 'disabled' : ''}>Prev</button>`}
          <button class="ctl pp ${paused ? 'play' : ''}" data-pp aria-label="${paused ? 'Play' : 'Pause'}">${sym(paused ? 'play' : 'pause')}</button>
          ${isRest ? `<button class="ctl" data-skip>Skip</button>`
            : isLast ? `<button class="ctl finish" data-finish>Finish</button>`
            : `<button class="ctl" data-next>Next</button>`}
        </div>
        <button class="upnext" data-card ${card.idx == null ? 'disabled' : ''}>
          <span class="ico ${card.icoCls}">${card.ico}</span>
          <span><span class="label red">${card.label}</span><span class="nm">${card.name}</span><span class="num sub">${card.sub}</span></span>
        </button>
        <div class="prog">
          <p class="label">${SHORT[sec]} · Step <span class="num">${P.idx + 1}</span> / <span class="num">${P.steps.length}</span></p>
          <p class="label muted" data-minsleft>${minsLeft}</p>
        </div>
        <div class="blocks">${blocks}</div>
      </div>
      ${P.sheet === 'end' ? endSheet() : ''}
      ${P.sheet === 'info' ? infoSheet() : ''}
    </section>`;
}

function endSheet() {
  return `
    <div class="scrim"></div>
    <div class="sheet end">
      <p class="label red"><span class="pz">${sym('pause')}</span>Paused at <span class="num">${mmss(P.elapsed / 1000)}</span></p>
      <h2 class="sheet-title">End workout?</h2>
      <p class="sheet-text">If you end now, this workout's progress is lost and the day stays unticked.</p>
      <button class="cta centre" data-keep>No, keep going</button>
      <button class="cta outline-red" data-end>Yes, end it</button>
    </div>`;
}

function infoSheet() {
  const step = P.steps[P.sheetStep];
  const m = data.move(step.move);
  return `
    <div class="scrim"></div>
    <div class="sheet info-sheet">
      <div class="sheet-scroll">
        <div class="sheet-head">
          <div>
            <p class="label red"><span class="pz">${sym('pause')}</span>Workout paused · Up next</p>
            <h2 class="sheet-title">${stepName(step)}</h2>
          </div>
          <button class="icon-btn" data-close aria-label="Close">${sym('close')}</button>
        </div>
        <div class="sheet-art ${step.section === 'main' ? 'amber' : ''}">${sym('figureFloor')}</div>
        ${howToHtml(m)}
      </div>
      <div class="sheet-foot"><button class="cta" data-close>Back to workout<span class="go">${sym('play')}</span></button></div>
    </div>`;
}

function draw() {
  if (!P || !app) return;
  app.innerHTML = view();
  wire();
}

// Every tick: only the numbers and bar change, unless the chip needs to go.
function update() {
  const q = s => app.querySelector(s);
  if (!q('[data-left]')) return;
  if (P.phase === 'move' && P.sinceStart >= GO_CHIP_MS && q('.chip.go')) { draw(); return; }
  q('[data-left]').textContent = mmss(secsLeft());
  q('[data-elapsed]').textContent = mmss(P.elapsed / 1000);
  q('[data-kcal]').textContent = kcalSoFar();
  q('[data-bar]').style.width = `${(P.left / P.total) * 100}%`;
  const left = workoutLeft();
  q('[data-minsleft]').innerHTML = left < 60 ? 'Under <span class="num">1</span> min left' : `<span class="num">${Math.ceil(left / 60)}</span> min left`;
}

function wire() {
  const on = (sel, fn) => app.querySelectorAll(sel).forEach(b => b.addEventListener('click', fn));
  on('[data-pp]', () => setRunning(!P.running));
  on('[data-next]', advance);
  on('[data-skip]', advance);
  on('[data-prev]', prev);
  on('[data-finish]', finish);
  on('[data-add30]', () => { P.left += 30000; P.total += 30000; update(); });
  on('[data-mute]', () => { P.muted = !P.muted; audio.setMuted(P.muted); draw(); });
  on('[data-progress]', () => { if (P.running) setRunning(false); });
  on('[data-settings]', () => { if (P.running) setRunning(false); go('#/settings'); });
  on('[data-x]', () => { P.wasRunning = P.running; P.sheet = 'end'; setRunning(false); });
  on('[data-keep]', () => { P.sheet = null; if (P.wasRunning) setRunning(true); else draw(); });
  on('[data-end]', endWorkout);
  on('[data-card]', e => {
    const i = e.currentTarget.dataset && P.steps[P.idx + 1] && P.steps[P.idx + 1].type === 'move' ? P.idx + 1 : null;
    if (i == null) return;
    P.sheet = 'info'; P.sheetStep = i;
    setRunning(false);
  });
  on('[data-close]', () => { P.sheet = null; draw(); });
}

// ---- Called by the router ----

export function render(el, day) {
  app = el;
  keepAwake();
  if (!P || P.day !== day) {
    const w = data.workoutFor(store.get().intensity, day);
    if (!w || !w.complete) { go('#/'); return; }
    start(day);
    startTimer();
  } else {
    draw();
    if (P.running) startTimer(); else audio.pause();
  }
}

// Where the workout is right now, for Feedback (F15). Settings pauses the
// workout first, so this doesn't change while Feedback is open.
// null when no workout is loaded.
export function snapshot() {
  if (!P) return null;
  const step = P.steps[P.idx];
  return {
    stage: P.stage, day: P.day,
    intensity: data.intensity(P.intensity)?.label || P.intensity,
    section: SHORT[step.section] || step.section,
    name: step.type === 'rest' ? 'Rest' : (data.move(step.move)?.name || step.move),
    moveId: step.type === 'move' ? step.move : null,
    side: step.side || null,
    phase: P.phase, // preview (Get ready / Next up), move or rest
    stepNo: P.idx + 1, steps: P.steps.length,
  };
}

// Leaving the player any other way (e.g. the phone's back button) pauses it.
export function leave() {
  if (P && P.running) { P.running = false; stopTimer(); }
  audio.pause();
  letSleep();
}
