// Workout details (designs 05, and 05b with warm-up off).
import * as data from '../data.js';
import * as store from '../store.js';
import * as session from '../session.js';
import { sym } from '../symbols.js';
import { thumb } from '../moveimg.js';
import * as audio from '../audio.js';
import { pad2, go, clock, stepName, sectionLabel } from '../ui.js';
import * as weights from '../weights.js';
import { WEIGHT_SETS, WEIGHT_REST_SECS } from '../config.js';

const SEC_SYM = { warmup: 'warmup', main: 'barbell', cooldown: 'cooldown' };
// I09: where to crop a day scene in the header band (default: the centre).
// Day 07 has Cornelius's face at the picture's left edge.
const SCENE_FOCUS = { 7: 'left' };

// Workout details for a run routine (F11, board 16b): the same screen with
// the routine's colour and symbol in the header, RUN ROUTINE · <GROUP>, one
// section headed with the group and no switch, and no WEIGHTS. Walk backs are
// rows like Rest (not tappable), with the back arrow.
export function renderRoutine(app, id) {
  const r = data.routine(id);
  if (!r) { go('#/run'); return; }
  const k = r.group; // the one section the routine fills: warmup / main / cooldown
  const s = data.stats(r);
  const rows = (r.sections[k] || []).map((step, i) => {
    if (step.type === 'rest') {
      return `<li class="row rest"><span class="ico">${sym(step.walkBack ? 'arrowLeft' : 'moon')}</span><span class="nm">${stepName(step)}</span><span class="t num">${clock(step.secs)}</span></li>`;
    }
    return `<li><button class="row ${k === 'main' ? 'main' : ''}" data-step="${k}.${i}">`
      + `<span class="ico">${thumb(step.move, { right: step.side === 'right' })}</span><span class="nm">${stepName(step)}</span><span class="t num">${clock(step.secs)}</span></button></li>`;
  }).join('');
  const go_ = `<button class="cta" data-go>Let's go<span class="go">${sym('arrowRight')}</span></button>`;

  app.innerHTML = `
    <section class="details">
      <div class="hero-top ${r.tile}">
        <div class="top">
          <button class="icon-btn light" data-back aria-label="Back">${sym('arrowLeft')}</button>
          <div class="icons">
            <button class="icon-btn light" data-progress aria-label="Progress">${sym('progress')}</button>
            <button class="icon-btn light" data-settings aria-label="Settings">${sym('gear')}</button>
          </div>
        </div>
        <div class="hero-sym">${sym(r.sym)}</div>
      </div>
      <div class="pad">
        <p class="label red">Run routine · ${r.groupLabel}</p>
        <h1 class="w-name">${r.name}</h1>
        <p class="meta label"><span class="num">${s.mins}</span> min<span class="dot">·</span><span class="num">${s.moves}</span> moves<span class="dot">·</span><span class="num">${s.kcal}</span> kcal</p>
        ${go_}
        <section class="dsec">
          <div class="dsec-head">
            <span class="hs">${sym(r.sym)}</span>
            <p class="label">${r.groupLabel} · <span class="num">${s.mins}</span> min</p>
          </div>
          <ul class="rows">${rows}</ul>
        </section>
      </div>
      <div class="pinned">${go_}</div>
    </section>`;

  app.querySelector('[data-back]').addEventListener('click', () => go('#/run'));
  app.querySelector('[data-settings]').addEventListener('click', () => go('#/settings'));
  app.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { audio.unlock(); go(`#/play/${id}`); }));
  app.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => go(`#/run/${id}/move/${b.dataset.step}`)));
}

export function render(app, day) {
  const st = store.get();
  const workout = data.workoutFor(st.intensity, day);
  if (!workout || !workout.complete) { go('#/'); return; }
  const sess = session.forDay(day);
  // Weights (F12): the switch is remembered for every workout; the pick isn't.
  const wOn = !!st.settings.weightsOn;
  if (!data.move(sess.weight)) sess.weight = weights.pickDefault();
  const wSecs = data.weightSecs(sess.weight);
  const s = data.stats(workout, { ...sess.on, weights: wOn ? sess.weight : null });

  const sectionHtml = k => {
    const off = k !== 'main' && sess.on[k] === false;
    const mins = Math.round(data.sectionSecs(workout, k) / 60);
    const rows = (workout.sections[k] || []).map((step, i) => {
      if (step.type === 'rest') {
        return `<li class="row rest"><span class="ico">${sym('moon')}</span><span class="nm">Rest</span><span class="t num">${clock(step.secs)}</span></li>`;
      }
      return `<li><button class="row ${k === 'main' ? 'main' : ''}" data-step="${k}.${i}" ${off ? 'disabled' : ''}>`
        + `<span class="ico">${thumb(step.move, { right: step.side === 'right' })}</span><span class="nm">${stepName(step)}</span><span class="t num">${clock(step.secs)}</span></button></li>`;
    }).join('');
    return `
      <section class="dsec ${off ? 'off' : ''}">
        <div class="dsec-head">
          <span class="hs">${sym(SEC_SYM[k])}</span>
          <p class="label">${sectionLabel(k)} · ${off ? 'Off' : `<span class="num">${mins}</span> min`}</p>
        </div>
        <ul class="rows">${rows}</ul>
      </section>`;
  };

  // Numbers in a mono line get the number font, as in every other label.
  const nums = t => t.replace(/\d+(\.\d+)?/g, '<span class="num">$&</span>');

  const weightsHtml = () => {
    const rows = data.weightMoves().map(m => {
      const on = m.id === sess.weight;
      return `<li><label class="wrow ${on ? 'on' : ''}">`
        + `<input type="radio" name="wmove" value="${m.id}" ${on ? 'checked' : ''}>`
        + `<span class="ico amber">${thumb(m.id, { fallback: 'dumbbell' })}</span>`
        + `<span class="wtxt"><span class="nm">${weights.listName(m)}</span>`
        + `<span class="label wlast">${nums(weights.lastLine(m.id))}</span></span></label></li>`;
    }).join('');
    return `
      <section class="dsec wsec ${wOn ? '' : 'off'}">
        <div class="dsec-head">
          <span class="hs">${sym('dumbbell')}</span>
          <p class="label">Weights · ${wOn ? `<span class="num">${Math.round(wSecs / 60)}</span> min` : 'Off'}</p>
        </div>
        ${wOn ? `<p class="label wcap">Today's move · <span class="num">${WEIGHT_SETS}</span> sets · <span class="num">${WEIGHT_REST_SECS}</span>s rest</p>
        <ul class="rows wrows" role="radiogroup" aria-label="Today's weights move">${rows}</ul>` : ''}
      </section>`;
  };


  // Q13: the three switches sit together at the top, under the totals and
  // above LET'S GO, in workout order. The section heads below keep their
  // "· Off" label but lose their switches.
  const secMins = k => Math.round(data.sectionSecs(workout, k) / 60);
  const opts = [
    { k: 'warmup', sym: 'warmup', label: 'Warm-up', on: sess.on.warmup !== false, mins: secMins('warmup'), attr: 'data-toggle="warmup"' },
    { k: 'weights', sym: 'dumbbell', label: 'Weights', on: wOn, mins: Math.round(wSecs / 60), attr: 'data-weights' },
    { k: 'cooldown', sym: 'cooldown', label: 'Cool-down', on: sess.on.cooldown !== false, mins: secMins('cooldown'), attr: 'data-toggle="cooldown"' },
  ];
  const setupHtml = `<div class="setup">${opts.map(o => `<button class="setup-row" ${o.attr} role="switch" aria-checked="${o.on}" aria-label="${o.label}">`
        + `<span class="hs">${sym(o.sym)}</span>`
        + `<span class="label">${o.label} · ${o.on ? `<span class="num">${o.mins}</span> min` : 'Off'}</span>`
        + `<span class="switch ${o.on ? 'on' : ''}"><span></span></span></button>`).join('')}</div>`;

  // I09: the day's Cornelius scene fills the header band (the same picture as
  // on Home). The band is narrower than the picture, so the sides are cropped;
  // SCENE_FOCUS moves the crop for a day whose hero sits at the edge. If the
  // picture can't load, the old amber band with the barbell shows.
  const focus = SCENE_FOCUS[day] ? ` style="object-position: ${SCENE_FOCUS[day]} center"` : '';
  app.innerHTML = `
    <section class="details">
      <div class="hero-top amber scene">
        <img src="img/days/day-${pad2(day)}.webp" alt="" draggable="false" decoding="async"${focus} onerror="this.closest('.hero-top').classList.add('no-scene');this.remove()">
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
        ${setupHtml}
        <button class="cta" data-go>Let's go<span class="go">${sym('arrowRight')}</span></button>
        ${sectionHtml('warmup')}${sectionHtml('main')}${weightsHtml()}${sectionHtml('cooldown')}
      </div>
      <div class="pinned"><button class="cta" data-go>Let's go<span class="go">${sym('arrowRight')}</span></button></div>
    </section>`;

  app.querySelector('[data-back]').addEventListener('click', () => go('#/'));
  app.querySelector('[data-settings]').addEventListener('click', () => go('#/settings'));
  // The tap on LET'S GO is what lets the phone play sound.
  app.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { audio.unlock(); go(`#/play/${day}`); }));
  const redraw = () => { const y = scrollY; render(app, day); scrollTo(0, y); };
  app.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.toggle;
    sess.on[k] = !sess.on[k];
    redraw();
  }));
  app.querySelector('[data-weights]').addEventListener('click', () => {
    store.setSetting('weightsOn', !wOn);
    redraw();
  });
  app.querySelectorAll('input[name="wmove"]').forEach(r => r.addEventListener('change', () => {
    sess.weight = r.value;
    redraw();
    app.querySelector(`input[name="wmove"][value="${r.value}"]`)?.focus({ preventScroll: true });
  }));
  app.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
    go(`#/workout/${day}/move/${b.dataset.step}`);
  }));
}
