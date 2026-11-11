// Settings (04, and 04d with voice off), Developer (04u: stage jump, data,
// cue log, Reset progress 04c), the Voice picker (04a) and the Sound effects
// picker (04b).
import * as data from '../data.js';
import * as store from '../store.js';
import * as audio from '../audio.js';
import * as sounds from '../sounds.js';
import { sym } from '../symbols.js';
import * as backup from '../backup.js';
import * as autobackup from '../autobackup.js';
import { pad2, go, showToast } from '../ui.js';
import { DAYS_PER_STAGE, MAX_STAGE } from '../config.js';
import { resetView } from './home.js';
import * as cuelog from '../cuelog.js';
import * as history from '../history.js';
import * as rest from '../restscenes.js';
import * as cornelius from '../cornelius.js';

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
  return `<span class="label s-ver">V${self.APP_VERSION || '?'}${date}</span>`;
}

function voiceLabel(id) {
  if (id === 'off') return 'Off';
  if (id === 'phone') return 'Phone voice';
  return audio.voiceList().find(v => v.id === id)?.label || id;
}

// ---- Settings (04) ----
// Intensity, Sound and Feedback. The Stage jump, DATA, the cue log and Reset
// my progress live on the Developer page (Q12, 04u), one row down.

export function render(app) {
  audio.stopSample();
  const st = store.get();
  const s = st.settings;
  const voiceOff = s.voice === 'off';
  const sfxLabel = s.sfx === 'off' ? 'Off'
    : s.tick === 'classic' && s.chime === 'classic' ? 'Classic'
    : `${sounds.tickById(s.tick).label} · ${sounds.chimeById(s.chime).label}`;

  app.innerHTML = `
    <section class="screen settings">
      ${head('Settings', versionTag())}
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

      <h2 class="label red s-sec">Rest screen</h2>
      <div class="s-rows">
        <button class="s-row" data-go="#/settings/rest-screen"><span class="s-name">Rest screen</span><span class="s-val">${restLabel(s.restScenes)} ${sym('arrowRight')}</span></button>
      </div>

      <div class="s-rows fb-row">
        <button class="s-row" data-go="#/settings/feedback"><span class="s-name">Feedback</span><span class="s-val">${sym('arrowRight')}</span></button>
        <button class="s-row" data-go="#/settings/developer"><span class="s-name">Developer</span><span class="s-val">${sym('arrowRight')}</span></button>
      </div>
      <p class="s-help">Developer: stage jump, backups, history import, cue log and reset.</p>
    </section>`;

  const on = (sel, fn) => app.querySelectorAll(sel).forEach(b => b.addEventListener('click', fn));
  const again = () => { const y = scrollY; render(app); scrollTo(0, y); };
  on('[data-back]', () => go(backTo));
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
}

// ---- Developer (04u, Q12) ----
// STAGE (the jump), DATA (backups, Restore, Undo restore, Import history),
// DEBUG (the cue log) and Reset my progress, with their confirm sheets
// (04c, 04g, 04m, 04h). Back goes to Settings.

export function renderDev(app, { confirm = false, restoring = null, undoing = false, importing = null } = {}) {
  const st = store.get();
  const done = store.doneCount(st.stage);
  const logOn = cuelog.enabled();

  app.innerHTML = `
    <section class="screen settings developer">
      ${head('Developer')}
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

      ${dataSection()}

      <h2 class="label red s-sec">Debug</h2>
      <div class="s-rows">
        <div class="s-row"><span class="s-name">Cue log</span>
          <button class="switch ${logOn ? 'on' : ''}" data-cuelog role="switch" aria-checked="${logOn}" aria-label="Cue log"><span></span></button></div>
        ${logOn ? `<button class="s-row" data-go="#/settings/cue-log"><span class="s-name">Open cue log</span><span class="s-val">${sym('arrowRight')}</span></button>` : ''}
      </div>
      <p class="s-help">Records when each sound plays in a workout, to check timing.</p>

      <button class="reset" data-reset>Reset my progress</button>
    </section>
    ${confirm ? resetSheet(st.stage, done) : ''}
    ${restoring ? restoreSheet(restoring) : ''}
    ${undoing ? undoSheet() : ''}
    ${importing ? historySheet(importing) : ''}`;

  store.keepData().then(kept => {
    const el = app.querySelector('[data-kept]');
    if (el) el.textContent = kept ? 'Data kept on this phone' : 'Data may be cleared by the browser';
  });

  const on = (sel, fn) => app.querySelectorAll(sel).forEach(b => b.addEventListener('click', fn));
  const redraw = (o = {}) => { const y = scrollY; renderDev(app, o); scrollTo(0, y); };
  const again = () => redraw();
  // Auto backup (F16): redraw Last backup and the switch when a send ends.
  bindAuto(app);
  autobackup.onChange(() => {
    const box = app.querySelector('.developer [data-auto]');
    if (!box) return; // Developer isn't on show
    box.innerHTML = autoRows();
    bindAuto(app);
  });
  on('[data-back]', () => go('#/settings'));
  on('[data-go]', e => go(e.currentTarget.dataset.go));
  on('[data-cuelog]', () => { cuelog.setEnabled(!cuelog.enabled()); again(); });
  on('[data-stage]', e => {
    const n = st.stage + +e.currentTarget.dataset.stage;
    store.jumpToStage(Math.min(MAX_STAGE, Math.max(1, n)));
    resetView(); again();
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
      redraw({ restoring: body });
    });
    input.click();
  });
  // Restore and Undo restore reload the app: the auto backup (F16) is marked
  // first and sent on start.
  on('[data-do-restore]', e => { e.currentTarget.disabled = true; autobackup.markPending(); backup.restore(pendingRestore); });
  on('[data-undo]', () => redraw({ undoing: true }));
  on('[data-do-undo]', e => { e.currentTarget.disabled = true; autobackup.markPending(); backup.undoRestore(); });
  // Import history (F14, 04h): pick the file, check it, then the sheet.
  on('[data-import]', () => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json,.json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const { doc, error } = await history.read(file);
      if (error) { showToast(`<p>${error}</p>`); return; }
      redraw({ importing: doc });
    });
    input.click();
  });
  on('[data-do-import]', e => {
    e.currentTarget.disabled = true;
    const n = history.describe(pendingImport).sessions;
    if (!store.addHistory(pendingImport)) { again(); showToast('<p>This history is already added.</p>'); return; }
    resetView(); again();
    showToast(`<p>History added: ${n.toLocaleString('en-GB')} sessions</p>`);
  });
  on('[data-reset]', () => redraw({ confirm: true }));
  on('[data-keep]', again);
  on('[data-clear]', () => { store.resetStage(st.stage); resetView(); go('#/'); });
}

// DATA (Q02, board 04f; on Developer since Q12): last backup, BACK UP /
// RESTORE, Undo restore, Import history, the "Data kept on this phone" line
// and what a backup holds.
function dataSection() {
  const undo = backup.undoOffer();
  return `
      <h2 class="label red s-sec">Data</h2>
      <div class="s-rows" data-auto>${autoRows()}</div>
      <div class="bk-btns">
        <button class="bk-btn solid" data-backup>Back up</button>
        <button class="bk-btn" data-restore>Restore</button>
      </div>
      ${undo ? `
      <button class="s-row undo-row" data-undo>
        <span><span class="s-name">Undo restore</span><span class="bk-file">Puts back what was here before ${undo.before}</span></span>
        <span class="label muted">${undo.daysLeft} day${undo.daysLeft === 1 ? '' : 's'} left</span>
      </button>` : ''}
      <button class="s-row undo-row" data-import>
        <span><span class="s-name">Import history</span><span class="bk-file">${importedText()}</span></span>
        <span class="s-val">${sym('arrowRight')}</span>
      </button>
      <p class="label muted s-kept" data-kept>&nbsp;</p>
      <p class="s-help">A backup is one small file with your progress and settings. Your feedback key isn't included. Auto backups go to RepRoom/Backups in your Drive: one a day for 30 days, and the 1st of each month kept for good.</p>`;
}

// Last backup and Auto backup to Drive (F16, board 04). Redrawn on their
// own when an auto backup's state changes, so an open sheet stays open.
// Last backup is the newest, manual or auto: an auto one reads "Auto, saved
// to Drive", a manual one its file name.
function autoRows() {
  const last = backup.lastBackup();
  const sub = last?.auto ? 'Auto, saved to Drive' : last?.file ? esc(last.file) : '';
  // Not connected (no usable Feedback key): off and greyed, and the row
  // opens Feedback (04e).
  if (!autobackup.connected()) return `${lastCard(last, sub)}
        <button class="s-row auto-row dis" data-connect>
          <span><span class="s-name">Auto backup to Drive</span><span class="bk-file">${autobackup.line()}</span></span>
          <span class="switch" aria-hidden="true"><span></span></span>
        </button>`;
  const on = autobackup.state().on;
  return `${lastCard(last, sub)}
        <div class="s-row auto-row">
          <span><span class="s-name">Auto backup to Drive</span><span class="bk-file">${autobackup.line()}</span></span>
          <button class="switch ${on ? 'on' : ''}" data-autobk role="switch" aria-checked="${on}" aria-label="Auto backup to Drive"><span></span></button>
        </div>`;
}
const lastCard = (last, sub) => `
        <div class="s-card backup-card">
          <div><p class="s-name">Last backup</p>${sub ? `<p class="bk-file">${sub}</p>` : ''}</div>
          <span class="bk-when">${backup.sinceText(last?.at)}</span>
        </div>`;
function bindAuto(app) {
  app.querySelector('[data-connect]')?.addEventListener('click', () => go('#/settings/feedback'));
  app.querySelector('[data-autobk]')?.addEventListener('click', () => {
    autobackup.setOn(!autobackup.state().on);
  });
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

// The Import history row's sub line: "Added 10 Nov" once a file is added.
function importedText() {
  const added = store.get().history?.added;
  if (!added) return 'Sessions from before RepRoom';
  return `Added ${new Date(added).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

// Add your history? (04h): what the file holds, next to what's on the phone.
let pendingImport = null;
function historySheet(doc) {
  pendingImport = doc;
  const d = history.describe(doc, v => `<b class="num">${v}</b>`);
  const n = store.get().log.filter(store.isSession).length;
  return `
    <div class="scrim"></div>
    <div class="sheet restore-sheet hist-sheet">
      <p class="label red">Import history</p>
      <h2 class="sheet-title big">Add your history?</h2>
      <div class="rs-card">
        <p class="label muted">From the file</p>
        <p>${d.total}</p>
        ${d.dated ? `<p>${d.dated}</p>` : ''}
        ${d.estimated ? `<p>${d.estimated}</p>` : ''}
        <p>${d.ticks}</p>
      </div>
      <div class="rs-card now">
        <p class="label muted">On this phone now</p>
        <p><b class="num">${n}</b> workout${n === 1 ? '' : 's'} in RepRoom. Any on the same day as a Strava session are counted once.</p>
      </div>
      <p class="sheet-text">This adds to what's here and replaces nothing. A history file can only be added once.</p>
      <button class="cta centre" data-do-import>Add history</button>
      <button class="cta outline" data-keep>Cancel</button>
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

// ---- Rest screen (04v, I07) ----
// Tick one or more of the six scenes and the still Moon. With more than one
// ticked, each rest picks one at random (restscenes.js). One always stays
// ticked. Each row has a still thumbnail of its scene.

function restLabel(ids = rest.DEFAULT) {
  // All six scenes and Cornelius (F18) = "All scenes"; Moon is a choice of its own.
  const all = rest.DEFAULT;
  if (ids.length === all.length && all.every(id => ids.includes(id))) return 'All scenes';
  if (ids.length <= 2) return ids.map(rest.label).join(', ');
  return `${ids.length} picked`;
}

export function renderRest(app) {
  const opts = [...rest.SCENES, rest.CORNELIUS, rest.MOON];
  const order = opts.map(o => o.id);
  const ticked = () => store.get().settings.restScenes || rest.DEFAULT;
  const draw = () => {
    const on = ticked();
    // Cornelius (F18) only plays with his own voice; say so on his row.
    const desc = o => (o.id === 'cornelius' && store.get().settings.voice !== cornelius.VOICE_ID ? 'Only with the Cornelius voice' : o.desc);
    app.innerHTML = `
      <section class="screen picker">
        ${head('Rest screen')}
        <p class="s-help intro">What plays in the picture at the top while you rest. Tick more than one and each rest picks one at random.</p>
        <h2 class="label red s-sec">Plays on rest</h2>
        <div class="p-list" role="group" aria-label="Rest screen">${opts.map(o => `
          <div class="p-opt ${on.includes(o.id) ? 'sel' : ''}" data-tick="${o.id}" role="checkbox" aria-checked="${on.includes(o.id)}" tabindex="0">
            <span class="box"></span>
            <span class="p-txt"><span class="o-name">${o.label}</span><span class="p-desc">${desc(o)}</span></span>
            <span class="p-thumb" data-thumb="${o.id}">${o.id === 'moon' ? sym('moon') : ''}</span>
          </div>`).join('')}</div>
        <p class="s-help">One always stays ticked. Walk back rests in run routines keep their arrow.</p>
      </section>`;
    app.querySelector('[data-back]').addEventListener('click', () => go('#/settings'));
    app.querySelectorAll('[data-thumb]').forEach(el => {
      const id = el.dataset.thumb;
      if (id === 'cornelius') el.append(cornelius.thumb());
      else if (id !== 'moon') el.append(rest.thumb(id, 44));
    });
    app.querySelectorAll('[data-tick]').forEach(el => {
      const toggle = () => {
        const id = el.dataset.tick;
        const now = ticked();
        const next = now.includes(id) ? now.filter(x => x !== id) : [...now, id];
        if (!next.length) return; // the last one stays ticked
        store.setSetting('restScenes', order.filter(x => next.includes(x)));
        const y = scrollY; draw(); scrollTo(0, y);
      };
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
    });
  };
  draw();
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
