// The workout player (designs 07 get ready, 08 exercise, 08b paused,
// 09 next up, 10 rest, 11 last move), plus the End workout? sheet (13)
// and the exercise info sheet over the paused player (06b).
//
// Every move step plays as: preview (Get ready / Next up, 10s) then the move.
// A rest step plays as one Rest phase.
// Weights (F12, boards 08c and 10c): a weight step plays as one Set phase,
// counted in reps (no timer), ended by DONE. Only the first set has the
// Next up before it; rests lead straight into the next set.
import * as data from '../data.js';
import * as store from '../store.js';
import * as session from '../session.js';
import { sym } from '../symbols.js';
import { pad2, go, clock, stepName, sectionLabel } from '../ui.js';
import { howToHtml } from './info.js';
import * as audio from '../audio.js';
import * as weights from '../weights.js';
import { WEIGHT_DEFAULT_REPS, WEIGHT_KG_STEP } from '../config.js';
import * as cuelog from '../cuelog.js';
import * as keepalive from '../keepalive.js';

const SHORT = { warmup: 'Warm-up', main: 'Main', weights: 'Weights', cooldown: 'Cool-down' };
const REPS_MIN = 1, REPS_MAX = 50, KG_MAX = 60;
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
  const sess = session.forDay(day);
  // Weights: on or off as saved; the move picked on Workout details, or the
  // one done longest ago if the player was opened some other way.
  const wOn = !!st.settings.weightsOn;
  if (wOn && !data.move(sess.weight)) sess.weight = weights.pickDefault();
  const on = { ...sess.on, weights: wOn ? sess.weight : null };
  const steps = data.playSteps(workout, on);
  const moveIdx = steps.map((s, i) => (s.type === 'move' ? i : -1)).filter(i => i >= 0);
  // The last step with something to do: a move, or a weight set when the
  // cool-down is off. FINISH only shows on a move.
  const lastDo = steps.map((s, i) => (s.type !== 'rest' ? i : -1)).filter(i => i >= 0).pop();
  const st2 = data.stats(workout, on);
  P = {
    id: ++playId, day, stage: st.stage, intensity: st.intensity, workout, steps, stats: st2,
    firstMove: moveIdx[0], lastMove: lastDo,
    weightsOn: !!on.weights,
    wvals: {}, // weight step index -> { reps, kg } on screen
    wdone: {}, // weight step index -> { set, side, reps, kg } saved by DONE
    idx: 0, phase: null, left: 0, total: 0, sinceStart: 0,
    elapsed: 0, running: true, muted: false, sheet: null, sheetStep: null,
  };
  audio.setMuted(false);
  audio.resume();
  audio.preload(steps);
  cuelog.begin(`Day ${pad2(day)} · ${workout.name}`, keepalive.mode());
  keepalive.start();
  mediaSession();
  enterStep(0);
}

function enterStep(i) {
  P.idx = i;
  const step = P.steps[i];
  if (step.type === 'weight' && !step.preview) { enterSet(i); return; }
  if (step.type === 'move' || step.type === 'weight') {
    setPhase('preview', data.defaults().previewSecs);
    // Once, as Get ready / Next up starts. Straight after a move ends by
    // itself, wait for the finish chime first so they don't talk over each other.
    clearTimeout(P.voiceTimer);
    const name = stepName(step);
    if (P.afterChime) {
      const plan = P.planStart + VOICE_AFTER_CHIME_MS;
      P.voiceTimer = setTimeout(() => { if (P && P.running) audio.sayMove(step, cuelog.cue('voice', name, plan, false)); }, VOICE_AFTER_CHIME_MS);
    } else audio.sayMove(step, cuelog.cue('voice', name, P.planStart, false));
  } else setPhase('rest', step.secs);
  P.afterChime = false;
}

// A weight set: no timer, the numbers start from last time (set 1) or the
// set just done (sets 2 and 3).
function enterSet(i) {
  P.idx = i;
  P.wvals[i] = startVals(i);
  setPhase('set', 0);
}

// The numbers a weight step starts with (or has, once it's been on screen).
function startVals(i) {
  if (P.wvals[i]) return P.wvals[i];
  const s = P.steps[i];
  const side = s.side || null;
  if (s.set > 1) {
    for (let j = i - 1; j >= 0; j--) {
      const t = P.steps[j];
      if (t.type === 'weight' && (t.side || null) === side && P.wvals[j]) return { ...P.wvals[j] };
    }
  }
  const l = weights.lastSet(s.move, 1, side);
  if (l) return { reps: l.reps, kg: l.kg };
  // No last time for the right side: start from the left side just done.
  const left = side === 'right' && P.wvals[i - 1];
  return left ? { ...left } : { reps: WEIGHT_DEFAULT_REPS, kg: null };
}

// DONE on a set: save it, then on to the right side, the rest, or what's next.
function doneSet() {
  const i = P.idx, s = P.steps[i], v = P.wvals[i];
  readKgField();
  if (v.kg == null) return;
  P.wdone[i] = { set: s.set, side: s.side || null, reps: v.reps, kg: v.kg };
  const next = P.steps[i + 1];
  if (!next) { finish(); return; }
  if (next.type === 'weight' && next.set === s.set && next.side) audio.sayText(`${next.side === 'left' ? 'Left' : 'Right'} side.`);
  enterStep(i + 1);
}

function setPhase(phase, secs) {
  P.phase = phase;
  P.left = P.total = secs * 1000;
  P.sinceStart = 0;
  // Cue log plan (wall clock): a phase that follows one that ran out by
  // itself is planned from where that one was planned to end, so drift adds
  // up; anything else (a tap, the start) plans from now.
  P.planStart = P.natural && P.planEnd != null ? P.planEnd : Date.now();
  P.planEnd = P.planStart + P.total;
  P.natural = false;
  draw();
}

// End of the current phase: preview -> move, move/rest -> next step.
function advance() {
  if (P.phase === 'preview') {
    if (P.steps[P.idx].type === 'weight') enterSet(P.idx);
    else setPhase('move', P.steps[P.idx].secs);
    return;
  }
  if (P.idx + 1 >= P.steps.length) { finish(); return; }
  enterStep(P.idx + 1);
}

// NEXT (B03): one tap = one whole move. During Get ready / Next up it skips
// that move too, straight to whatever comes after it (the next move's Next up,
// or a rest); on the last move's Next up it goes to the summary. On the Next
// up before weight set 1 it still opens the set. While a move runs it's the
// same as the timer running out. No ticks or GO either way.
function next() {
  const step = P.steps[P.idx];
  if (P.phase !== 'preview' || step.type === 'weight') { advance(); return; }
  clearTimeout(P.voiceTimer);
  audio.stopAll(); // don't let the skipped move's name talk over what's next
  if (P.idx === P.lastMove || P.idx + 1 >= P.steps.length) { finish(); return; }
  enterStep(P.idx + 1);
}

// PREV mirrors NEXT (B03): back one whole move, to its Next up, passing over
// rests. A weight set counts as a move (set 2 back to set 1, right side back
// to left). With no move before this one, back to its own Get ready.
const isDo = s => s.type === 'move' || s.type === 'weight';
function prev() {
  for (let j = P.idx - 1; j >= 0; j--) if (isDo(P.steps[j])) { enterStep(j); return; }
  enterStep(isDo(P.steps[P.idx]) ? P.idx : 0);
}

// The timer counts real time (performance.now), however late a tick comes:
// a slowed or frozen page never makes the workout longer. (Until V1.7.2 each
// tick counted at most 1s, so a page frozen in a pocket stood still.)
function tick() {
  if (!P || !P.running) return;
  const now = performance.now();
  const dt = now - (P.last || now);
  if (dt > 1500) cuelog.note('gap', `Timer tick ${(dt / 1000).toFixed(1)}s after the last`);
  P.last = now;
  if (P.phase === 'set') { P.elapsed += dt; update(); return; } // no timer on a set
  const before = P.left;
  P.left -= dt;
  P.elapsed += dt;
  P.sinceStart += dt;
  cues(before, P.left);
  // The tick that ends a phase is past zero (by up to TICK_MS, or much more
  // after a long gap). Carry that into the next phase, so the workout doesn't
  // slip at every step. After a long gap this passes over whole phases at
  // once, silently, and lands where the workout should be by now.
  let n = 0;
  while (P && P.running && P.phase !== 'set' && P.left <= 0 && n++ < 500) {
    const over = -P.left;
    P.natural = true;
    if (n > 1) cuelog.note('gap', `Passed over a phase to catch up (${(over / 1000).toFixed(1)}s behind)`);
    advance();
    if (P && P.phase !== 'set') { P.left -= over; P.sinceStart += over; }
  }
  if (P && n === 0) update();
}

// Sound effects at the moments in docs/RepRoom-audio-spec.txt. They only
// play when a timer runs down by itself, not when you press NEXT or SKIP.
// With the cue log on, each moment is logged on its own; when one late timer
// tick passes two of them, only one sound plays and the other shows as missing.
function cues(before, after) {
  const crossed = t => before > t && after <= t;
  const name = P.phase === 'rest' ? 'Rest' : stepName(P.steps[P.idx]);
  const log = (kind, ts, why, at = 0) => ts.forEach((t, i) =>
    cuelog.cue(kind, `${name} · ${t / 1000}s left`, P.planEnd - t + at * 1000, true,
      i ? { miss: 'merged' } : why ? { [why === 'off' ? 'off' : 'ctx']: why } : {}, at * 1000));
  const ticks = list => {
    const hit = list.filter(crossed);
    if (hit.length) log('tick', hit, audio.tick());
  };
  if (P.phase === 'preview') {
    // ticks at 3, 2 and 1s left, then GO as the move timer starts
    ticks([3000, 2000, 1000]);
    if (crossed(0)) log('go', [0], audio.go());
  } else if (P.phase === 'move') {
    // ticks as the timer shows 00:02, 00:01 and 00:00, then the chime ~1.1s later
    ticks([2000, 1000]);
    if (crossed(0)) {
      log('tick', [0], audio.tick());
      log('chime', [0], audio.chime(1.1), 1.1);
      P.afterChime = true;
    }
  } else if (P.phase === 'rest' && P.steps[P.idx].section === 'weights') {
    // a weights rest leads straight into the next set: 3 ticks, then GO
    ticks([3000, 2000, 1000]);
    if (crossed(0)) log('go', [0], audio.go());
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
  if (run !== P.running) cuelog.note(run ? 'play' : 'pause', run ? 'Play' : 'Pause');
  P.running = run;
  if (run) { P.planEnd = Date.now() + P.left; audio.unlock(); audio.resume(); keepalive.start(); startTimer(); }
  else { audio.pause(); keepalive.pause(); stopTimer(); }
  draw();
}

// ---- Lock screen and headphones (Media Session) ----
// With the keep-alive audio element playing, Android shows a media
// notification on the lock screen: the move as the title, the workout under
// it. Play / pause there (and the headphone button) is PAUSE; next is NEXT
// (SKIP on a rest); previous is PREV. With a sheet open (End workout?, Exercise
// info), play closes it and carries on, like No, keep going.
const MS = 'mediaSession' in navigator ? navigator.mediaSession : null;
const msAction = (name, fn) => { try { MS.setActionHandler(name, fn); } catch (e) { /* not supported */ } };

function mediaSession() {
  if (!MS) return;
  const remote = (label, fn) => () => { if (!P) return; cuelog.note('tap', `Lock screen: ${label}`); fn(); };
  msAction('play', remote('Play', () => {
    if (P.sheet === 'end') keepGoing();
    else if (P.sheet === 'info') { closeInfo(); setRunning(true); }
    else if (!P.running) setRunning(true);
  }));
  msAction('pause', remote('Pause', () => { if (P.running) setRunning(false); }));
  msAction('nexttrack', remote('Next', () => {
    if (P.sheet || P.phase === 'set') return; // a weight set ends with DONE on screen
    if (P.phase === 'rest') advance(); else next();
  }));
  msAction('previoustrack', remote('Prev', () => { if (!P.sheet) prev(); }));
}

function clearMediaSession() {
  if (!MS) return;
  ['play', 'pause', 'nexttrack', 'previoustrack'].forEach(a => msAction(a, null));
  MS.metadata = null;
  MS.playbackState = 'none';
}

// Called on every redraw: what the lock screen shows.
let msTitle = '';
function mediaInfo() {
  if (!MS || !P) return;
  const step = P.steps[P.idx];
  const title = P.phase === 'rest' ? 'Rest' : stepName(step);
  const artist = `Day ${pad2(P.day)} · ${P.workout.name}`;
  if (title + artist !== msTitle && 'MediaMetadata' in window) {
    msTitle = title + artist;
    MS.metadata = new MediaMetadata({ title, artist, album: 'RepRoom',
      artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }] });
  }
  MS.playbackState = P.running ? 'playing' : 'paused';
}

// The weight sets saved with DONE, in the order they were done:
// { move, sets: [{ set, side, reps, kg }] }, or null if none.
function weightsDone() {
  const idx = Object.keys(P.wdone).map(Number).sort((a, b) => a - b);
  if (!idx.length) return null;
  return { move: P.steps[idx[0]].move, sets: idx.map(i => ({ ...P.wdone[i] })) };
}

function finish() {
  clearTimeout(P.voiceTimer);
  stopTimer();
  audio.stopAll();
  letSleep();
  keepalive.stop();
  clearMediaSession();
  cuelog.end('Finished', P.elapsed);
  const secs = Math.round(P.elapsed / 1000);
  const moves = P.steps.filter(s => s.type === 'move').length;
  const kcal = kcalSoFar();
  const wasComplete = store.stageComplete(P.stage);
  const weights = weightsDone();
  store.finish({ stage: P.stage, day: P.day, intensity: P.intensity, secs, moves, kcal, weights });
  lastResult = {
    stage: P.stage, day: P.day, name: P.workout.name, secs, moves, kcal, weights,
    focus: focusOf(P.workout),
    stageJustCompleted: !wasComplete && store.stageComplete(P.stage),
  };
  ended.add(P.id);
  P = null;
  session.clear();
  go('#/summary');
}

function endWorkout() {
  clearTimeout(P.voiceTimer);
  stopTimer();
  // Weight sets already done are kept (logged as an early end; day unticked).
  const weights = weightsDone();
  if (weights) {
    const moves = P.steps.slice(0, P.idx).filter(s => s.type === 'move').length;
    store.logEarly({ stage: P.stage, day: P.day, intensity: P.intensity,
      secs: Math.round(P.elapsed / 1000), moves, kcal: kcalSoFar(), weights });
  }
  audio.stopAll();
  letSleep();
  keepalive.stop();
  clearMediaSession();
  cuelog.end('Ended early', P.elapsed);
  ended.add(P.id);
  P = null;
  session.clear();
  go('#/');
}

// ---- Numbers shown on screen ----

// kcal for the time actually spent (skipping shortens it), up to the workout's
// total. With weights on there's no cap: sets aren't timed, so the real time counts.
function kcalSoFar() {
  const frac = P.elapsed / 1000 / P.stats.secs;
  return Math.floor(P.stats.kcal * (P.weightsOn ? frac : Math.min(1, frac)));
}

// Seconds left in the whole workout, including the current phase.
function workoutLeft() {
  let s = P.phase === 'set' ? P.steps[P.idx].secs : P.left / 1000; // a set: its estimate
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
  const isSet = P.phase === 'set';
  const isWeight = step.type === 'weight';
  const paused = !P.running;
  // "Set 2 of 3", or "Set 2 of 3 · Left" for Kneeling row
  const setText = s => `Set ${s.set} of ${s.sets}${s.side ? ` · ${s.side === 'left' ? 'Left' : 'Right'}` : ''}`;

  let chip = '', chipCls = '';
  if (paused) { chip = 'Paused'; chipCls = 'light'; }
  else if (P.phase === 'preview') chip = isFirst ? 'Get ready' : 'Next up';
  else if (P.phase === 'rest') chip = 'Rest';
  else if (isSet) chip = setText(step);
  else if (isLast) chip = 'Last move';
  else if (P.sinceStart < GO_CHIP_MS) { chip = 'GO!'; chipCls = 'go'; }

  const kick = paused ? 'Paused'
    : P.phase === 'preview' ? (isFirst ? 'First move' : 'Starting soon')
    : P.phase === 'rest' ? 'Rest'
    : isLast ? 'Last move' : '';
  const kicker = isSet ? `Weights · Set ${step.set} of ${step.sets}`
    : `${sectionLabel(sec)}${kick ? ` · ${kick}` : ''}`;

  const cdLabel = paused ? 'Paused'
    : P.phase === 'preview' ? (isFirst ? 'Get ready' : 'Starts in')
    : P.phase === 'rest' ? 'Rest left' : 'Time left';

  // What the card at the bottom points to.
  const nextIdx = P.idx + 1;
  const nextStep = P.steps[nextIdx];
  let card;
  if (isLast || !nextStep) {
    card = { label: 'Then', name: 'Finish workout', sub: 'Summary', ico: sym('medal'), icoCls: 'amber' };
  } else if (nextStep.type === 'weight') {
    // A weight set: which set, and the numbers it will start with.
    const v = startVals(nextIdx);
    card = {
      label: `${P.phase === 'preview' && !isFirst ? 'After this' : 'Up next'} · ${setText(nextStep)}`,
      name: data.move(nextStep.move).name, idx: null, ico: sym('dumbbell'), icoCls: 'amber',
      sub: v.kg == null ? `${v.reps} reps` : `${v.reps} reps · ${weights.kg(v.kg)} kg`,
    };
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
  // A weight set runs on amber, like a main move.
  const bgState = isSet ? 'main' : P.phase !== 'move' ? 'ready' : sec === 'main' ? 'main' : 'warm';
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
        <div class="art">${sym(isRest ? 'moon' : isWeight ? 'dumbbell' : 'figure')}</div>
      </div>
      <div class="pad p-head">
        <p class="label red p-kicker">${kicker}</p>
        <h1 class="p-name">${isRest ? 'Rest' : isSet ? data.move(step.move).name : stepName(step)}</h1>
      </div>
      <div class="pad p-low">
        ${isSet ? setControls(step, paused) : `<div class="stepbar"><span data-bar style="width:${(P.left / P.total) * 100}%"></span></div>
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
        </div>`}
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

// The weight set (08c): REPS and KG EACH steppers, last time and the
// elapsed line, then PREV | Pause | DONE.
const numHtml = t => t.replace(/\d+(\.\d+)?/g, '<span class="num">$&</span>');
const kgLen = v => (v.kg == null ? 1 : weights.kg(v.kg).length);
function clockLine() {
  return numHtml(`${mmss(P.elapsed / 1000)} elapsed · ${kcalSoFar()} kcal`);
}
function setControls(step, paused) {
  const v = P.wvals[P.idx];
  const last = weights.lastSideLine(step.move, step.side || null);
  return `
        <div class="wsteps">
          <div class="wbox">
            <p class="label">Reps</p>
            <div class="wctl">
              <button class="wpm" data-reps="-1" aria-label="One rep less" ${v.reps <= REPS_MIN ? 'disabled' : ''}>−</button>
              <p class="num wv" data-reps-v>${v.reps}</p>
              <button class="wpm" data-reps="1" aria-label="One rep more" ${v.reps >= REPS_MAX ? 'disabled' : ''}>+</button>
            </div>
          </div>
          <div class="wbox">
            <p class="label">kg each</p>
            <div class="wctl">
              <button class="wpm" data-kg="-1" aria-label="Less weight" ${v.kg == null || v.kg <= 0 ? 'disabled' : ''}>−</button>
              <input class="num wv wkg" data-kg-v type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off"
                aria-label="kg each" placeholder="—" data-idx="${P.idx}" value="${v.kg == null ? '' : weights.kg(v.kg)}" data-len="${kgLen(v)}">
              <button class="wpm" data-kg="1" aria-label="More weight" ${v.kg != null && v.kg >= KG_MAX ? 'disabled' : ''}>+</button>
            </div>
          </div>
        </div>
        <div class="wline label">
          <span>${last ? numHtml(`Last time · ${last}`) : 'First time'}</span>
          <span data-wclock>${clockLine()}</span>
        </div>
        <div class="controls">
          <button class="ctl" data-prev>Prev</button>
          <button class="ctl pp ${paused ? 'play' : ''}" data-pp aria-label="${paused ? 'Play' : 'Pause'}">${sym(paused ? 'play' : 'pause')}</button>
          <button class="ctl finish" data-done ${v.kg == null ? 'disabled' : ''}>Done</button>
        </div>`;
}

// Change the numbers in place (no redraw, so the kg field keeps the keyboard).
function patchSet() {
  const v = P.wvals[P.idx];
  const q = s => app.querySelector(s);
  q('[data-reps-v]').textContent = v.reps;
  q('[data-reps="-1"]').disabled = v.reps <= REPS_MIN;
  q('[data-reps="1"]').disabled = v.reps >= REPS_MAX;
  const f = q('[data-kg-v]');
  if (document.activeElement !== f) f.value = v.kg == null ? '' : weights.kg(v.kg);
  f.dataset.len = kgLen(v);
  q('[data-kg="-1"]').disabled = v.kg == null || v.kg <= 0;
  q('[data-kg="1"]').disabled = v.kg != null && v.kg >= KG_MAX;
  q('[data-done]').disabled = v.kg == null;
}

// Take whatever is typed in the kg field (rounded to the nearest 0.5).
function readKgField() {
  const f = app?.querySelector('[data-kg-v]');
  // Only into the set it belongs to (the screen may already be moving on).
  if (!f || P.phase !== 'set' || Number(f.dataset.idx) !== P.idx) return;
  const n = weights.parseKg(f.value, WEIGHT_KG_STEP, KG_MAX);
  if (n !== undefined) P.wvals[P.idx].kg = n;
}

function endSheet() {
  return `
    <div class="scrim"></div>
    <div class="sheet end">
      <p class="label red"><span class="pz">${sym('pause')}</span>Paused at <span class="num">${mmss(P.elapsed / 1000)}</span></p>
      <h2 class="sheet-title">End workout?</h2>
      <p class="sheet-text">${weightsDone()
        ? "If you end now, the day stays unticked. The weight sets you've done are kept."
        : "If you end now, this workout's progress is lost and the day stays unticked."}</p>
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
  readKgField(); // keep a kg that's typed but not yet confirmed (e.g. on Pause)
  app.innerHTML = view();
  wire();
  mediaInfo();
}

// ---- The phone's back button (B02) ----
// Back in the player does what X does (pause, End workout?), or closes the
// sheet that's open. So back never leaves a workout, and in the installed app
// it never reaches the bottom of the history (which would close the app).
//
// On Android Chrome this uses a CloseWatcher, which is what the phone's back
// goes to first while one is open. (V1.6.1 used an extra history entry, but
// Chrome skips history entries a page adds without a tap, so the second back
// in a row left the app.) Browsers without CloseWatcher (e.g. iPhone) fall
// back to the history entry: an extra "guard" entry on top of the player's
// own, same address, put back each time back takes it off.
const HAS_CW = typeof window.CloseWatcher === 'function';
let watcher = null;
let playId = 0;          // one per workout started, kept in the history entries
const ended = new Set(); // workouts finished or ended in this page load

function guard() {
  const s = history.state;
  if (HAS_CW) {
    // Mark the player's entry (so it's stepped over once the workout is
    // over, see below), and listen for back.
    if (!s || s.play !== P.id) history.replaceState({ play: P.id }, '', location.href);
    arm();
    return;
  }
  if (s && s.play === P.id && s.guard) return; // already on our guard
  history.replaceState({ play: P.id }, '', location.href);
  history.pushState({ play: P.id, guard: true }, '', location.href);
}

function arm() {
  if (watcher) return;
  const w = watcher = new CloseWatcher();
  w.addEventListener('close', () => {
    if (watcher === w) watcher = null;
    if (!P || !location.hash.startsWith('#/play/')) return;
    onBack();
    arm(); // ready for the next back
  });
}
function disarm() { if (watcher) { const w = watcher; watcher = null; w.destroy(); } }

function onBack() {
  if (P.sheet === 'end') keepGoing();
  else if (P.sheet === 'info') closeInfo();
  else askEnd();
}

// A finished or ended workout's entries (back from the summary, or from Home
// after Yes, end it): step over them, so back goes to where the workout was
// started from instead of starting it again. popstate fires for each entry,
// even the ones that share an address (where hashchange doesn't).
const isEnded = () => !P && ended.has(history.state?.play);

addEventListener('popstate', () => {
  if (isEnded()) { history.back(); return; }
  if (HAS_CW) return;
  // Fallback only: when we've landed on this workout's own entry under the
  // guard. (Setting location.hash fires popstate too, with no state: not a back.)
  const s = history.state;
  if (!P || !s || s.play !== P.id || s.guard) return;
  history.pushState({ play: P.id, guard: true }, '', location.href);
  onBack();
});

function askEnd() { P.wasRunning = P.running; P.sheet = 'end'; setRunning(false); }
function keepGoing() { P.sheet = null; if (P.wasRunning) setRunning(true); else draw(); }
function closeInfo() { P.sheet = null; draw(); }

// Every tick: only the numbers and bar change, unless the chip needs to go.
function update() {
  const q = s => app.querySelector(s);
  if (P.phase === 'set') { const c = q('[data-wclock]'); if (c) c.innerHTML = clockLine(); return; }
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
  const tap = (label, fn) => () => { cuelog.note('tap', label); fn(); };
  on('[data-next]', tap('NEXT', next));
  on('[data-skip]', tap('SKIP', advance));
  on('[data-prev]', tap('PREV', prev));
  on('[data-finish]', tap('FINISH', finish));
  on('[data-add30]', tap('+30 SEC', () => { P.left += 30000; P.total += 30000; P.planEnd += 30000; update(); }));
  on('[data-mute]', () => { P.muted = !P.muted; audio.setMuted(P.muted); draw(); });
  on('[data-progress]', () => { if (P.running) setRunning(false); });
  on('[data-settings]', () => { if (P.running) setRunning(false); go('#/settings'); });
  on('[data-x]', askEnd);
  on('[data-keep]', keepGoing);
  on('[data-end]', endWorkout);
  on('[data-card]', e => {
    const i = e.currentTarget.dataset && P.steps[P.idx + 1] && P.steps[P.idx + 1].type === 'move' ? P.idx + 1 : null;
    if (i == null) return;
    P.sheet = 'info'; P.sheetStep = i;
    setRunning(false);
  });
  on('[data-close]', closeInfo);
  // Weight set (F12)
  on('[data-done]', doneSet);
  on('[data-reps]', e => {
    const v = P.wvals[P.idx];
    v.reps = Math.min(REPS_MAX, Math.max(REPS_MIN, v.reps + Number(e.currentTarget.dataset.reps)));
    patchSet();
  });
  on('[data-kg]', e => {
    readKgField();
    const v = P.wvals[P.idx];
    const d = Number(e.currentTarget.dataset.kg) * WEIGHT_KG_STEP;
    if (v.kg == null && d < 0) return;
    v.kg = Math.min(KG_MAX, Math.max(0, (v.kg ?? 0) + d));
    const f = app.querySelector('[data-kg-v]');
    if (f) f.value = weights.kg(v.kg);
    patchSet();
  });
  const f = app.querySelector('[data-kg-v]');
  if (f) {
    // While typing: DONE follows whether there's a number; the value settles
    // (rounded to 0.5, 12 not 12.0) when the keyboard closes.
    f.addEventListener('input', () => {
      const n = weights.parseKg(f.value, WEIGHT_KG_STEP, KG_MAX);
      app.querySelector('[data-done]').disabled = n == null || (n === undefined && P.wvals[P.idx].kg == null);
    });
    f.addEventListener('change', () => { readKgField(); f.value = P.wvals[P.idx].kg == null ? '' : weights.kg(P.wvals[P.idx].kg); patchSet(); });
    f.addEventListener('keydown', e => { if (e.key === 'Enter') f.blur(); });
    f.addEventListener('focus', () => f.select());
  }
}

// ---- Called by the router ----

export function render(el, day) {
  app = el;
  if (isEnded()) return; // being stepped over (see popstate above)
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
  guard();
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
    moveId: step.type === 'move' || step.type === 'weight' ? step.move : null,
    side: step.side || null,
    phase: P.phase, // preview (Get ready / Next up), move or rest
    stepNo: P.idx + 1, steps: P.steps.length,
  };
}

// Leaving the player any other way (e.g. the phone's back button) pauses it.
export function leave() {
  disarm(); // back on other screens works as normal
  if (P && P.running) { P.running = false; stopTimer(); cuelog.note('pause', 'Pause (left the player)'); }
  audio.pause();
  keepalive.pause();
  if (MS && P) MS.playbackState = 'paused';
  letSleep();
}
