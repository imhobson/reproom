// Settings (04, and 04d with voice off), Reset progress (04c),
// the Voice picker (04a) and the Sound effects picker (04b).
import * as data from '../data.js';
import * as store from '../store.js';
import * as audio from '../audio.js';
import { sym } from '../symbols.js';
import { pad2, go } from '../ui.js';
import { DAYS_PER_STAGE, MAX_STAGE } from '../config.js';
import { resetView } from './home.js';

// Where the back arrow on Settings goes (Home, or a paused workout).
let backTo = '#/';
export function setBack(hash) { backTo = hash; }

const head = title => `
  <div class="s-head">
    <button class="icon-btn" data-back aria-label="Back">${sym('arrowLeft')}</button>
    <h1 class="s-title">${title}</h1>
  </div>`;

function voiceLabel(id) {
  if (id === 'off') return 'Off';
  if (id === 'phone') return 'Phone voice';
  return audio.voiceList().find(v => v.id === id)?.label || id;
}

// ---- Settings ----

export function render(app, { confirm = false } = {}) {
  audio.stopSample();
  const st = store.get();
  const s = st.settings;
  const voiceOff = s.voice === 'off';
  const done = store.doneCount(st.stage);
  const sfxLabel = s.sfx === 'off' ? 'Off' : (audio.PACK_LIST.find(p => p.id === s.sfx)?.label || 'Classic');

  app.innerHTML = `
    <section class="screen settings">
      ${head('Settings')}
      <h2 class="label red s-sec">Stage</h2>
      <div class="s-card stage-card">
        <div><p class="s-name">Stage</p><p class="label muted"><span class="num">${done}</span><span class="slash">/</span><span class="num">${DAYS_PER_STAGE}</span> done</p></div>
        <div class="stepper">
          <button class="sq" data-stage="-1" aria-label="Previous stage" ${st.stage <= 1 ? 'disabled' : ''}>−</button>
          <span class="num">${pad2(st.stage)}</span>
          <button class="sq" data-stage="1" aria-label="Next stage" ${st.stage >= MAX_STAGE ? 'disabled' : ''}>+</button>
        </div>
      </div>
      <p class="s-help">Jump to any stage, even a locked one. Jumping forward ticks off every workout in the stages before it.</p>

      <h2 class="label red s-sec">Intensity</h2>
      <div class="pair">
        ${data.intensities().map(i => `
          <button class="opt ${st.intensity === i.id ? 'sel' : ''}" data-int="${i.id}">
            <span class="o-name">${i.label}</span><span class="label"><span class="num">${i.minutes}</span> min</span>
          </button>`).join('')}
      </div>
      <p class="s-help">Changes straight away. Switching never resets your progress.</p>

      <h2 class="label red s-sec">Sound</h2>
      <div class="s-rows">
        <div class="s-row"><span class="s-name">All sounds</span>
          <button class="switch ${s.allSounds ? 'on' : ''}" data-all role="switch" aria-checked="${s.allSounds}" aria-label="All sounds"><span></span></button></div>
        <button class="s-row" data-go="#/settings/voice"><span class="s-name">Voice</span><span class="s-val">${voiceLabel(s.voice)} ${sym('arrowRight')}</span></button>
        <div class="s-row col ${voiceOff ? 'dis' : ''}">
          <span class="s-name">Voice reads out</span>
          <div class="pair small">
            <button class="opt" disabled>Name + how-to</button>
            <button class="opt ${voiceOff ? '' : 'sel'}" ${voiceOff ? 'disabled' : ''}>Name only</button>
          </div>
          ${voiceOff ? '<p class="s-note">Choose a voice to use this.</p>' : ''}
        </div>
        <button class="s-row" data-go="#/settings/sound-effects"><span class="s-name">Sound effects</span><span class="s-val">${sfxLabel} ${sym('arrowRight')}</span></button>
      </div>

      <button class="reset" data-reset>Reset my progress</button>
      <p class="label muted s-kept" data-kept>&nbsp;</p>
    </section>
    ${confirm ? resetSheet(st.stage, done) : ''}`;

  store.keepData().then(kept => {
    const el = app.querySelector('[data-kept]');
    if (el) el.textContent = kept ? 'Data kept on this phone' : 'Data may be cleared by the browser';
  });

  const on = (sel, fn) => app.querySelectorAll(sel).forEach(b => b.addEventListener('click', fn));
  const again = () => { const y = scrollY; render(app); scrollTo(0, y); };
  on('[data-back]', () => go(backTo));
  on('[data-stage]', e => {
    const n = st.stage + +e.currentTarget.dataset.stage;
    store.jumpToStage(Math.min(MAX_STAGE, Math.max(1, n)));
    resetView(); again();
  });
  on('[data-int]', e => { store.setIntensity(e.currentTarget.dataset.int); resetView(); again(); });
  on('[data-all]', () => { store.setSetting('allSounds', !s.allSounds); again(); });
  on('[data-go]', e => go(e.currentTarget.dataset.go));
  on('[data-reset]', () => { const y = scrollY; render(app, { confirm: true }); scrollTo(0, y); });
  on('[data-keep]', again);
  on('[data-clear]', () => { store.resetStage(st.stage); resetView(); go('#/'); });
}

function resetSheet(stage, done) {
  const n = `<span class="num">${done}</span> workout${done === 1 ? '' : 's'}`;
  return `
    <div class="scrim"></div>
    <div class="sheet reset-sheet">
      <p class="label red">Reset my progress</p>
      <h2 class="sheet-title">Start Stage ${pad2(stage)} over?</h2>
      <p class="sheet-text">This clears the ${n} you've ticked in Stage <span class="num">${pad2(stage)}</span>. You'll start again from Day <span class="num">01</span>. This can't be undone.</p>
      <div class="stays">
        <p class="label muted">Stays the same</p>
        <p>${sym('check')}Earlier stages stay complete</p>
        <p>${sym('check')}Your intensity and sound settings</p>
      </div>
      <button class="cta centre" data-keep>No, keep my progress</button>
      <button class="cta outline-red" data-clear>Yes, start Stage ${pad2(stage)} over</button>
    </div>`;
}

// ---- Pickers (04a voice, 04b sound effects) ----

function picker(app, { title, intro, section, options, current, foot, top = '', onPick, onSample }) {
  let playing = null; // id of the option whose sample is playing
  const draw = () => {
    app.innerHTML = `
      <section class="screen picker">
        ${head(title)}
        ${intro ? `<p class="s-help intro">${intro}</p>` : ''}
        ${top}
        <h2 class="label red s-sec">${section}</h2>
        <div class="p-list">
          ${options.map(o => `
            <div class="p-opt ${o.id === current() ? 'sel' : ''}" data-pick="${o.id}">
              <span class="box"></span>
              <span class="p-txt"><span class="o-name">${o.label}</span>${o.desc ? `<span class="p-desc">${o.desc}</span>` : ''}</span>
              ${o.sample ? `<button class="p-play ${playing === o.id ? 'on' : ''}" data-sample="${o.id}" aria-label="${playing === o.id ? 'Stop sample' : 'Play sample'}">${sym(playing === o.id ? 'pause' : 'play')}</button>` : ''}
              ${playing === o.id ? `<div class="p-prog"><span class="bar"><span data-prog></span></span><span class="label muted">Playing</span></div>` : ''}
            </div>`).join('')}
        </div>
        ${foot ? `<p class="s-help">${foot}</p>` : ''}
      </section>`;
    app.querySelector('[data-back]').addEventListener('click', () => { audio.stopSample(); go('#/settings'); });
    app.querySelectorAll('[data-pick]').forEach(el => el.addEventListener('click', e => {
      if (e.target.closest('[data-sample]')) return;
      onPick(el.dataset.pick); draw();
    }));
    app.querySelectorAll('[data-sample]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.sample;
      if (playing === id) { audio.stopSample(); playing = null; draw(); return; }
      playing = id; draw();
      onSample(id,
        f => { const p = app.querySelector('[data-prog]'); if (p) p.style.width = `${f * 100}%`; },
        () => { if (playing === id) { playing = null; draw(); } });
    }));
  };
  draw();
}

export function renderVoice(app) {
  const options = [
    { id: 'off', label: 'Off', desc: 'No voice. Sound effects still play.' },
    { id: 'phone', label: 'Phone voice', desc: 'Built into your phone', sample: true },
    ...audio.voiceList().map(v => ({ id: v.id, label: v.label, desc: v.style || '', sample: true })),
  ];
  picker(app, {
    title: 'Voice',
    intro: 'The voice reads out each move as it comes up. Tap play to hear a sample.',
    section: 'Choose a voice',
    options,
    current: () => store.get().settings.voice,
    foot: 'Every voice is saved on your phone, so it works offline mid-workout.',
    onPick: id => store.setSetting('voice', id),
    onSample: (id, p, e) => audio.sampleVoice(id, p, e),
  });
}

export function renderSfx(app) {
  const options = [
    ...audio.PACK_LIST.map(p => ({ ...p, sample: true })),
    { id: 'off', label: 'Off', desc: 'No ticks or chimes. The voice still plays.' },
  ];
  const ticks = '<span class="tk"><i></i><i></i><i></i></span>';
  const top = `
    <h2 class="label red s-sec">When they play</h2>
    <div class="when">
      <div class="w-row"><span class="s-name">Move starts</span><span class="w-cue"><span class="label">3 · 2 · 1</span>${ticks}<span class="label gochip">GO</span></span></div>
      <div class="w-row"><span class="s-name">Move ends</span><span class="w-cue"><span class="label">3 · 2 · 1</span>${ticks}<span class="dia"></span><span class="label">Chime</span></span></div>
    </div>
    <p class="s-help">Every pack plays at the same moments. Only the sounds change.</p>`;
  picker(app, {
    title: 'Sound effects',
    top,
    section: 'Choose a pack',
    options,
    current: () => store.get().settings.sfx,
    foot: 'Play runs the full cue: three ticks and GO, then three ticks and the chime.',
    onPick: id => store.setSetting('sfx', id),
    onSample: (id, p, e) => audio.sampleCue(id, p, e),
  });
}
