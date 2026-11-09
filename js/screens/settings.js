// Settings (04, and 04d with voice off), Reset progress (04c),
// the Voice picker (04a) and the Sound effects picker (04b).
import * as data from '../data.js';
import * as store from '../store.js';
import * as audio from '../audio.js';
import * as sounds from '../sounds.js';
import { sym } from '../symbols.js';
import * as backup from '../backup.js';
import { pad2, go, showToast } from '../ui.js';
import { DAYS_PER_STAGE, MAX_STAGE } from '../config.js';
import { resetView } from './home.js';
import * as cuelog from '../cuelog.js';

// Where the back arrow on Settings goes (Home, or a paused workout).
let backTo = '#/';
export function setBack(hash) { backTo = hash; }

// The header of Settings and its sub-pages: back button, title, and an
// optional item on the right.
export const head = (title, right = '') => `
  <div class="s-head">
    <button class="icon-btn" data-back aria-label="Back">${sym('arrowLeft')}</button>
    <h1 class="s-title">${title}</h1>
    ${right}
  </div>`;

// "V1.3.0 · 7 NOV" from js/version.js (Q06).
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function versionTag() {
  const [, m, d] = (self.APP_DATE || '').split('-').map(Number);
  const date = m ? ` · ${d} ${MONTHS[m - 1]}` : '';
  return `<span class="label s-ver" data-ver>V${self.APP_VERSION || '?'}${date}</span>`;
}

// Tapping the version 5 times (within 3s) turns the cue log on or off (F11
// pocket test). While it's on, a Cue log row shows under Feedback.
let verTaps = [];

function voiceLabel(id) {
  if (id === 'off') return 'Off';
  if (id === 'phone') return 'Phone voice';
  return audio.voiceList().find(v => v.id === id)?.label || id;
}

// ---- Settings ----

export function render(app, { confirm = false, restoring = null, undoing = false } = {}) {
  audio.stopSample();
  const st = store.get();
  const s = st.settings;
  const voiceOff = s.voice === 'off';
  const done = store.doneCount(st.stage);
  const sfxLabel = s.sfx === 'off' ? 'Off'
    : s.tick === 'classic' && s.chime === 'classic' ? 'Classic'
    : `${sounds.tickById(s.tick).label} · ${sounds.chimeById(s.chime).label}`;

  app.innerHTML = `
    <section class="screen settings">
      ${head('Settings', versionTag())}
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
        ${volRow('voiceVol', 'Voice volume', s.voiceVol, voiceOff || !s.allSounds)}
        <button class="s-row" data-go="#/settings/sound-effects"><span class="s-name">Sound effects</span><span class="s-val">${sfxLabel} ${sym('arrowRight')}</span></button>
        ${volRow('fxVol', 'Effects volume', s.fxVol, s.sfx === 'off' || !s.allSounds)}
      </div>

      ${dataSection()}

      <button class="s-row fb-row" data-go="#/settings/feedback"><span class="s-name">Feedback</span><span class="s-val">${sym('arrowRight')}</span></button>
      ${cuelog.enabled() ? `<button class="s-row" style="margin-top:2px" data-go="#/settings/cue-log"><span class="s-name">Cue log</span><span class="s-val"><span class="label muted">Debug</span> ${sym('arrowRight')}</span></button>` : ''}

      <button class="reset" data-reset>Reset my progress</button>
    </section>
    ${confirm ? resetSheet(st.stage, done) : ''}
    ${restoring ? restoreSheet(restoring) : ''}
    ${undoing ? undoSheet() : ''}`;

  store.keepData().then(kept => {
    const el = app.querySelector('[data-kept]');
    if (el) el.textContent = kept ? 'Data kept on this phone' : 'Data may be cleared by the browser';
  });

  const on = (sel, fn) => app.querySelectorAll(sel).forEach(b => b.addEventListener('click', fn));
  const again = () => { const y = scrollY; render(app); scrollTo(0, y); };
  on('[data-back]', () => go(backTo));
  on('[data-ver]', () => {
    const now = Date.now();
    verTaps = [...verTaps.filter(x => now - x < 3000), now];
    if (verTaps.length < 5) return;
    verTaps = [];
    cuelog.setEnabled(!cuelog.enabled());
    again();
    showToast(`<span class="label">Cue log ${cuelog.enabled() ? 'on' : 'off'}</span>`, 2500);
  });
  on('[data-stage]', e => {
    const n = st.stage + +e.currentTarget.dataset.stage;
    store.jumpToStage(Math.min(MAX_STAGE, Math.max(1, n)));
    resetView(); again();
  });
  on('[data-int]', e => { store.setIntensity(e.currentTarget.dataset.int); resetView(); again(); });
  on('[data-all]', () => { store.setSetting('allSounds', !s.allSounds); again(); });
  on('[data-go]', e => go(e.currentTarget.dataset.go));
  // Volume sliders: the number follows your finger; letting go saves it and
  // plays a short sample at the new level.
  app.querySelectorAll('[data-vol]').forEach(r => {
    const key = r.dataset.vol;
    r.addEventListener('input', () => {
      r.style.setProperty('--v', `${r.value}%`);
      app.querySelector(`[data-volnum="${key}"]`).textContent = r.value;
    });
    r.addEventListener('change', () => {
      store.setSetting(key, +r.value);
      if (key === 'fxVol') audio.sampleFxVolume(); else audio.sampleVoiceVolume();
    });
  });
  on('[data-backup]', async () => {
    if (await backup.backUp()) { again(); showToast('<span class="label">Backed up</span>', 2500); }
  });
  // RESTORE: pick a file, check it, then the confirm sheet (04g).
  on('[data-restore]', () => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json,.json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const { body, error } = await backup.readBackup(file);
      if (error) { showToast(`<p>${error}</p>`); return; }
      const y = scrollY; render(app, { restoring: body }); scrollTo(0, y);
    });
    input.click();
  });
  on('[data-do-restore]', e => { e.currentTarget.disabled = true; backup.restore(pendingRestore); });
  on('[data-undo]', () => { const y = scrollY; render(app, { undoing: true }); scrollTo(0, y); });
  on('[data-do-undo]', e => { e.currentTarget.disabled = true; backup.undoRestore(); });
  on('[data-reset]', () => { const y = scrollY; render(app, { confirm: true }); scrollTo(0, y); });
  on('[data-keep]', again);
  on('[data-clear]', () => { store.resetStage(st.stage); resetView(); go('#/'); });
}

// DATA (Q02, board 04f): last backup, BACK UP / RESTORE, the "Data kept on
// this phone" line and what a backup holds. The Feedback row (F15) comes
// after it, before Reset my progress.
function dataSection() {
  const last = backup.lastBackup();
  const undo = backup.undoOffer();
  return `
      <h2 class="label red s-sec">Data</h2>
      <div class="s-card backup-card">
        <div><p class="s-name">Last backup</p>${last?.file ? `<p class="bk-file">${esc(last.file)}</p>` : ''}</div>
        <span class="bk-when">${backup.sinceText(last?.at)}</span>
      </div>
      <div class="bk-btns">
        <button class="bk-btn solid" data-backup>Back up</button>
        <button class="bk-btn" data-restore>Restore</button>
      </div>
      ${undo ? `
      <button class="s-row undo-row" data-undo>
        <span><span class="s-name">Undo restore</span><span class="bk-file">Puts back what was here before ${undo.before}</span></span>
        <span class="label muted">${undo.daysLeft} day${undo.daysLeft === 1 ? '' : 's'} left</span>
      </button>` : ''}
      <p class="label muted s-kept" data-kept>&nbsp;</p>
      <p class="s-help">A backup is one small file with your progress and settings. Your feedback key isn't included.</p>`;
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// Restore this backup? (04g): the file next to what's on the phone now.
// KEEP is the solid, safe choice.
let pendingRestore = null;
function restoreSheet(body) {
  pendingRestore = body;
  const file = backup.summarize(body.data);
  const now = backup.summarize(backup.currentData());
  const saved = body.exportedAt && !isNaN(new Date(body.exportedAt)) ? `Saved ${backup.dateText(body.exportedAt)}` : 'Saved';
  const ver = body.appVersion ? ` · V${esc(body.appVersion)}` : '';
  return `
    <div class="scrim"></div>
    <div class="sheet restore-sheet">
      <p class="label red">Restore</p>
      <h2 class="sheet-title big">Restore this backup?</h2>
      <div class="rs-card">
        <p class="label muted">From the file</p>
        <p>${saved}${ver}</p>
        <p>${esc(file.progress)}</p>
        <p>${esc(file.settings)}</p>
      </div>
      <div class="rs-card now">
        <p class="label muted">On this phone now</p>
        <p>${esc(now.progress)}</p>
        ${now.workouts > file.workouts ? '<p class="red">This phone has newer progress than the file.</p>' : ''}
      </div>
      <p class="sheet-text">Restoring replaces everything on this phone. You can undo it from Settings for 7 days.</p>
      <button class="cta centre" data-keep>Keep what's on this phone</button>
      <button class="cta outline" data-do-restore>Restore backup</button>
    </div>`;
}

// Undo restore: a short confirm.
function undoSheet() {
  const undo = backup.undoOffer();
  return `
    <div class="scrim"></div>
    <div class="sheet restore-sheet">
      <p class="label red">Undo restore</p>
      <h2 class="sheet-title">Put back what was here before ${undo?.before || 'the restore'}?</h2>
      <p class="sheet-text">This replaces what's on the phone now with your data from just before the restore.</p>
      <button class="cta centre" data-keep>Keep what's on this phone</button>
      <button class="cta outline" data-do-undo>Undo restore</button>
    </div>`;
}

// A volume slider row (Q04). Greyed out, like "Voice reads out", when what it
// controls is off.
function volRow(key, label, value = 100, off = false) {
  return `
    <div class="s-row col vol ${off ? 'dis' : ''}">
      <div class="vol-top"><span class="s-name">${label}</span><span class="vol-num" data-volnum="${key}">${value}</span></div>
      <input type="range" class="slider" min="0" max="100" step="1" value="${value}" data-vol="${key}"
        style="--v:${value}%" aria-label="${label}" ${off ? 'disabled' : ''}>
    </div>`;
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
// A picker is one or more lists. Each list: { key, title, options, current(),
// onPick(id), onSample(id, onProgress, onEnd), dim() }. Rows are radio rows
// (44px min) with an optional play button.

function picker(app, { title, intro, lists, foot, after = '' }) {
  let playing = null; // "<list key>:<option id>" whose sample is playing
  const row = (l, o) => {
    const k = `${l.key}:${o.id}`;
    const on = playing === k;
    return `
      <div class="p-opt ${o.id === l.current() ? 'sel' : ''}" data-pick="${k}" role="radio" aria-checked="${o.id === l.current()}">
        <span class="box"></span>
        <span class="p-txt"><span class="o-name">${o.label}</span>${o.desc ? `<span class="p-desc">${o.desc}</span>` : ''}</span>
        ${o.sample ? `<button class="p-play ${on ? 'on' : ''}" data-sample="${k}" aria-label="${on ? 'Stop sample' : `Play ${o.label}`}">${sym(on ? 'pause' : 'play')}</button>` : ''}
        ${on ? `<div class="p-prog"><span class="bar"><span data-prog></span></span><span class="label muted">Playing</span></div>` : ''}
      </div>`;
  };
  const find = k => { const [lk, id] = k.split(':'); return [lists.find(l => l.key === lk), id]; };
  const draw = () => {
    app.innerHTML = `
      <section class="screen picker">
        ${head(title)}
        ${intro ? `<p class="s-help intro">${intro}</p>` : ''}
        ${lists.map(l => `
          ${l.title ? `<h2 class="label red s-sec">${l.title}</h2>` : '<div class="s-gap"></div>'}
          <div class="p-list ${l.dim?.() ? 'dim' : ''}" role="radiogroup">${l.options.map(o => row(l, o)).join('')}</div>`).join('')}
        ${foot ? `<p class="s-help">${foot}</p>` : ''}
        ${after}
      </section>`;
    app.querySelector('[data-back]').addEventListener('click', () => { audio.stopSample(); go('#/settings'); });
    app.querySelectorAll('[data-pick]').forEach(el => el.addEventListener('click', e => {
      if (e.target.closest('[data-sample]')) return;
      const [l, id] = find(el.dataset.pick);
      l.onPick(id); draw();
    }));
    app.querySelectorAll('[data-sample]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.sample;
      if (playing === k) { audio.stopSample(); playing = null; draw(); return; }
      playing = k; draw();
      const [l, id] = find(k);
      l.onSample(id,
        f => { const p = app.querySelector('[data-prog]'); if (p) p.style.width = `${f * 100}%`; },
        () => { if (playing === k) { playing = null; draw(); } });
    }));
  };
  draw();
}

export function renderVoice(app) {
  picker(app, {
    title: 'Voice',
    intro: 'The voice reads out each move as it comes up. Tap play to hear a sample.',
    lists: [{
      key: 'voice',
      title: 'Choose a voice',
      options: [
        { id: 'off', label: 'Off', desc: 'No voice. Sound effects still play.' },
        { id: 'phone', label: 'Phone voice', desc: 'Built into your phone', sample: true },
        ...audio.voiceList().map(v => ({ id: v.id, label: v.label, desc: v.style || '', sample: true })),
      ],
      current: () => store.get().settings.voice,
      onPick: id => store.setSetting('voice', id),
      onSample: (id, p, e) => audio.sampleVoice(id, p, e),
    }],
    foot: 'Every voice is saved on your phone, so it works offline mid-workout.',
  });
}

// Sound effects (04b, Q05): Off, then a TICK list and a CHIME list. Picking a
// tick or a chime turns sound effects back on if they were off.
export function renderSfx(app) {
  const s = () => store.get().settings;
  const off = () => s().sfx === 'off';
  const ticks = '<span class="tk"><i></i><i></i><i></i></span>';
  const when = `
    <h2 class="label red s-sec">When they play</h2>
    <div class="when">
      <div class="w-row"><span class="s-name">Move starts</span><span class="w-cue"><span class="label">3 · 2 · 1</span>${ticks}<span class="label gochip">GO</span></span></div>
      <div class="w-row"><span class="s-name">Move ends</span><span class="w-cue"><span class="label">3 · 2 · 1</span>${ticks}<span class="dia"></span><span class="label">Chime</span></span></div>
    </div>
    <p class="s-help">The tick plays before every move starts and ends. GO always sounds the same.</p>`;
  const pickSound = (key, id) => { store.setSetting(key, id); store.setSetting('sfx', 'on'); };
  picker(app, {
    title: 'Sound effects',
    lists: [
      {
        key: 'sfx',
        options: [{ id: 'off', label: 'Off', desc: 'No ticks or chimes. The voice still plays.' }],
        current: () => (off() ? 'off' : null),
        onPick: () => store.setSetting('sfx', 'off'),
      },
      {
        key: 'tick', title: 'Tick', dim: off,
        options: sounds.TICKS.map(t => ({ id: t.id, label: t.label, desc: t.desc, sample: true })),
        current: () => s().tick,
        onPick: id => pickSound('tick', id),
        onSample: (id, p, e) => audio.sampleCue('tick', id, p, e),
      },
      {
        key: 'chime', title: 'Chime', dim: off,
        options: sounds.CHIMES.map(c => ({ id: c.id, label: c.label, desc: c.desc, sample: true })),
        current: () => s().chime,
        onPick: id => pickSound('chime', id),
        onSample: (id, p, e) => audio.sampleCue('chime', id, p, e),
      },
    ],
    foot: 'Play runs the end-of-move cue: three ticks, then the chime, with your other pick.',
    after: when,
  });
}
