// Progress (F14, boards 14 and 14b first run) and the Wall (14c).
// Every number comes from stats.js.
import * as store from '../store.js';
import * as data from '../data.js';
import * as stats from '../stats.js';
import { sym } from '../symbols.js';
import { grid } from '../wall.js';
import { thumb } from '../moveimg.js';
import { pad2, go } from '../ui.js';
import { DAYS_PER_STAGE, MAX_STAGE } from '../config.js';

// Where the back arrow on Progress goes: wherever Progress was opened from.
let backTo = '#/';
export function setBack(hash) { backTo = hash || '#/'; }

const fmt = n => Math.round(n).toLocaleString('en-GB');
const b = v => `<b class="num">${v}</b>`;
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);
const mmss = s => `${pad2(Math.floor(s / 60))}:${pad2(Math.round(s) % 60)}`;
const MONTH_LONG = d => d.toLocaleDateString('en-GB', { month: 'long' });
const shortDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };

// Back arrow, title, and Progress (active) and Settings on the right.
const head = title => `
  <div class="s-head">
    <button class="icon-btn" data-back aria-label="Back">${sym('arrowLeft')}</button>
    <h1 class="s-title">${title}</h1>
    <div class="icons">
      <button class="icon-btn on" aria-label="Progress" aria-current="page">${sym('progress')}</button>
      <button class="icon-btn" data-settings aria-label="Settings">${sym('gear')}</button>
    </div>
  </div>`;

// ---- Progress (14, 14b) ----

export function render(app) {
  const st = store.get();
  const s = stats.compute();
  const first = s.sessions === 0;

  app.innerHTML = `
    <section class="screen progp">
      ${head('Progress')}
      <div class="ph-row"><h2 class="label red">The Wall</h2><p>${b(fmt(s.sessions))} ${plural(s.sessions, 'session')}</p></div>
      ${wallCard(s)}
      ${streakLine(s)}
      ${calendar(s)}
      <h2 class="ph"><span>All time</span></h2>
      <div class="tot">
        ${tile('Sessions', fmt(s.sessions))}
        ${tile('Moves done', fmt(s.sets))}
        ${tile('Time', `${fmt(s.hrs)}<span class="u">hrs</span>`)}
        ${tile('kcal', fmt(s.kcal))}
      </div>
      ${s.estimated ? `<p class="p-note">Includes ${b(fmt(s.estimated))} sessions from before RepRoom, carried over as estimates.</p>` : ''}
      ${stages(st, s)}
      <h2 class="ph"><span>Milestones</span><span class="r">${b(s.earned)} earned</span></h2>
      ${s.milestones.map(m => milestoneRow(m, s, st)).join('')}
      ${topMoves(s)}
      <h2 class="ph"><span>Recent workouts</span></h2>
      ${first || !s.dated.length ? '<p class="p-empty">No workouts yet. Your finished workouts show up here.</p>' : recent(s)}
    </section>`;

  const on = (sel, fn) => app.querySelectorAll(sel).forEach(el => el.addEventListener('click', fn));
  on('[data-back]', () => go(backTo));
  on('[data-settings]', () => go('#/settings'));
  on('[data-wall]', () => go('#/progress/wall'));
  on('[data-move]', e => go(`#/move/${e.currentTarget.dataset.move}`));
}

const tile = (label, v) => `<div class="tt"><p class="label">${label}</p><p class="num big">${v}</p></div>`;

// The Wall card: the symbol being filled, how far, and the finished ones.
function wallCard(s) {
  const { symbol, tiles, finished } = s.wall;
  const left = 100 - tiles;
  const line = s.sessions === 0 ? 'Every session adds a tile. 100 tiles finish a symbol.'
    : left ? `${b(left)} ${plural(left, 'session')} to finish it.`
    : `Symbol ${b(pad2(symbol))} finished. The next session starts symbol ${b(pad2(symbol + 1))}.`;
  const shown = [];
  for (let k = Math.max(1, finished - 3); k <= finished; k++) if (k !== symbol || tiles < 100) shown.push(k);
  const onWall = finished ? `
        <div class="w-done">
          <p class="label">On the wall · ${b(pad2(finished))}</p>
          <div class="w-minis">${shown.map(k => `<span class="w-mini">${grid(k, 100, 3, 0, { label: false })}</span>`).join('')}</div>
        </div>` : '';
  return `
    <button class="wall-card" data-wall aria-label="Open the Wall">
      ${grid(symbol, tiles, 18, 2, { label: `The Wall: symbol ${pad2(symbol)}, ${tiles} of 100 tiles.` })}
      <span class="w-txt">
        <span class="label">Symbol ${b(pad2(symbol))}</span>
        <span class="w-count"><span class="num">${tiles}</span><span class="num of"> / 100</span></span>
        <span class="w-line">${line}</span>
        ${onWall}
      </span>
    </button>`;
}

// The streak: one line, ink outline.
function streakLine(s) {
  return `
    <div class="streak">
      <span class="st-ico">${sym('streak')}</span>
      <span class="st-txt">Streak ${b(s.streak)} ${plural(s.streak, 'day')}</span>
      ${s.best ? `<span class="label muted">Best · ${b(pad2(s.best))} ${plural(s.best, 'day')}</span>` : ''}
    </div>`;
}

// This month, Monday first: session days ink, today amber with an ink inset
// (ink with an amber inset if today has a session), past days grey, future plain.
function calendar(s) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1);
  const daysIn = new Date(y, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const key = d => `${y}-${pad2(m + 1)}-${pad2(d)}`;
  const done = new Set(s.days);
  const today = now.getDate();
  const count = s.dated.filter(d => d.day.startsWith(`${y}-${pad2(m + 1)}-`)).length;
  let cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<span class="label cdow">${d}</span>`).join('');
  cells += '<span></span>'.repeat(lead);
  const doneList = [];
  for (let d = 1; d <= daysIn; d++) {
    const has = done.has(key(d));
    if (has) doneList.push(d);
    const cls = [has ? 'c-done' : d < today ? 'c-miss' : d > today ? 'c-future' : '', d === today ? 'c-today' : ''].join(' ');
    cells += `<span class="cd num ${cls}">${d}</span>`;
  }
  const month = MONTH_LONG(now);
  const aria = `${month} calendar: ${doneList.length ? `workouts on ${doneList.join(', ')}` : 'no workouts yet'}. Today is the ${today}.`;
  return `
    <h2 class="ph"><span>${month}</span><span class="r">${b(count)} ${plural(count, 'workout')}</span></h2>
    <div class="cal" role="img" aria-label="${aria}">${cells}</div>`;
}

// Stages: every stage up to the current one and at least 3 after it, in rows
// of 5 (at least 10 tiles). Complete: ink with a tick. Current: amber with n/28. Locked: grey
// with the lock. (An earlier stage that isn't complete shows n/28 on grey.)
function stages(st, s) {
  let last = st.stage + 3;
  for (let k = st.stage + 1; k <= MAX_STAGE; k++) if (store.stageComplete(k)) last = Math.max(last, k + 1);
  last = Math.min(MAX_STAGE, Math.max(10, Math.ceil(last / 5) * 5)); // at least two rows, as board 14b
  let tiles = '';
  for (let k = 1; k <= last; k++) {
    const n = `<span class="num">${pad2(k)}</span>`;
    if (store.stageComplete(k)) tiles += `<span class="sg s-done">${n}<span class="sg-i">${sym('check')}</span></span>`;
    else if (k === st.stage) tiles += `<span class="sg s-cur">${n}<span class="label">${store.doneCount(k)}/${DAYS_PER_STAGE}</span></span>`;
    else if (store.stageUnlocked(k)) tiles += `<span class="sg s-open">${n}<span class="label">${store.doneCount(k)}/${DAYS_PER_STAGE}</span></span>`;
    else tiles += `<span class="sg s-lock">${n}<span class="sg-i">${sym('lock')}</span></span>`;
  }
  return `
    <h2 class="ph"><span>Stages</span><span class="r">${b(s.stagesComplete)} complete</span></h2>
    <div class="sgs">${tiles}</div>`;
}

// One milestone track: the last one earned (or a lock), the next, its bar,
// and what's left.
function milestoneRow(m, s, st) {
  const unit = m.unit ? `<span class="label">${m.unit}</span>` : '';
  const box = m.last != null
    ? `<span class="mb got"><span class="num">${fmt(m.last)}</span>${unit}</span>`
    : `<span class="mb">${sym('lock')}</span>`;
  const left = Math.max(1, Math.round(m.left));
  let line;
  if (m.key === 'sessions') line = s.sessions === 0 ? 'Your first session.' : `${b(fmt(left))} to go.${left === 1 ? ' Your next session.' : ''}`;
  else if (m.key === 'symbols') { const t = m.next * 100 - s.sessions; line = `${b(fmt(t))} ${plural(t, 'tile')} to go.`; }
  else if (m.key === 'stages') {
    const w = DAYS_PER_STAGE - store.doneCount(st.stage);
    line = left === 1 && !store.stageComplete(st.stage) ? `${b(w)} ${plural(w, 'workout')} to go.` : `${b(left)} ${plural(left, 'stage')} to go.`;
  } else if (m.key === 'streak') line = s.best ? `Best so far: ${s.best} ${plural(s.best, 'day')}.` : `${m.next} days in a row to go.`;
  else line = `${b(fmt(left))} hrs to go.`;
  return `
    <div class="ms">
      ${box}
      <span class="ms-txt">
        <span class="ms-top"><span class="label">${m.name}</span><span>Next ${b(`${fmt(m.next)}${m.key === 'time' ? ' hrs' : ''}`)}</span></span>
        <span class="bar"><span style="width:${Math.round(m.frac * 100)}%"></span></span>
        <span class="ms-line">${line}</span>
      </span>
    </div>`;
}

// Top 5 moves by sets.
function topMoves(s) {
  const top = Object.entries(s.moves).filter(([id, m]) => m.sets > 0 && data.move(id))
    .sort((a, c) => c[1].sets - a[1].sets || c[1].secs - a[1].secs).slice(0, 5);
  if (!top.length) return '';
  return `
    <h2 class="ph"><span>Top moves</span><span class="r">by sets</span></h2>
    ${top.map(([id, m]) => `
      <button class="pr-row" data-move="${id}">
        <span class="pr-ico amber">${thumb(id)}</span>
        <span class="pr-nm">${data.move(id).name}</span>
        <span class="pr-v">${b(fmt(m.sets))} sets · ${fmt(m.secs / 60)} min</span>
      </button>`).join('')}`;
}

// The last 5 dated sessions, newest first.
function recent(s) {
  return s.dated.slice(-5).reverse().map(({ e }) => {
    const name = e.name || data.workoutFor(e.intensity, e.day)?.name || 'Workout';
    const date = new Date(e.at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
    const where = e.stage ? `Stage <span class="num">${pad2(e.stage)}</span> · Day <span class="num">${pad2(e.day)}</span> · ${date}` : date;
    return `
      <div class="pr-row">
        <span class="pr-ico ink">${sym('check')}</span>
        <span class="pr-nm"><span>${name}</span><span class="label muted">${where}</span></span>
        <span class="num pr-t">${mmss(e.secs || 0)}</span>
      </div>`;
  }).join('');
}

// ---- The Wall (14c) ----

export function renderWall(app) {
  const s = stats.compute();
  const { symbol, tiles, finished } = s.wall;
  const left = 100 - tiles;
  const lo = (symbol - 1) * 100 + 1;
  // Each finished symbol's dates: its dated sessions' first and last, or
  // "Before RepRoom" when none of its sessions has a date.
  const when = k => {
    const ds = s.dated.filter(d => d.n > (k - 1) * 100 && d.n <= k * 100).map(d => d.day);
    if (!ds.length) return 'Before RepRoom';
    const a = shortDate(ds[0]), z = shortDate(ds.at(-1));
    return a === z ? a : `${a} – ${z}`;
  };
  const done = [];
  for (let k = 1; k <= finished; k++) done.push(k);
  const doneCur = tiles === 100; // the current symbol is the last finished one

  app.innerHTML = `
    <section class="screen progp wallp">
      ${head('The Wall')}
      <p class="w-intro">Every session adds a tile. ${b(100)} tiles finish a symbol, and the next one starts.</p>
      <div class="w-now">
        <p class="label w-now-top"><span class="red">Symbol ${b(pad2(symbol))} · ${doneCur ? 'finished' : 'now'}</span><span>Sessions ${b(lo)}–${b(lo + 99)}</span></p>
        ${grid(symbol, tiles, 26, 2, { label: `Symbol ${pad2(symbol)}, ${tiles} of 100 tiles.` })}
        <p class="w-count"><span class="num">${tiles}</span><span class="num of"> / 100</span></p>
        <p class="w-line">${s.sessions === 0 ? 'Every session adds a tile. 100 tiles finish a symbol.'
          : left ? `The shape fills in as you go. ${b(left)} ${plural(left, 'session')} to finish it.`
          : `Finished. The next session starts symbol ${b(pad2(symbol + 1))}.`}</p>
      </div>
      ${done.length ? `
      <h2 class="ph"><span>On the wall</span><span class="r">${b(done.length)} ${plural(done.length, 'symbol')}</span></h2>
      <div class="w-grid">
        ${done.map(k => `
          <div class="w-fin">
            ${grid(k, 100, 12, 2, { label: `Symbol ${pad2(k)}, finished.` })}
            <p class="label red">Symbol ${b(pad2(k))}</p>
            <p class="w-rng">Sessions ${b((k - 1) * 100 + 1)}–${b(k * 100)}<br><span class="muted">${when(k)}</span></p>
          </div>`).join('')}
      </div>` : ''}
      <h2 class="ph"><span>Still to come</span></h2>
      <div class="w-come">${`<span>${sym('lock')}</span>`.repeat(5)}</div>
      <p class="p-note">Each new symbol stays hidden until its first tiles go in.${s.estimated ? ' Sessions from before RepRoom fill the first symbols; their tiles have no dates.' : ''}</p>
    </section>`;

  app.querySelector('[data-back]').addEventListener('click', () => go('#/progress'));
  app.querySelector('[data-settings]').addEventListener('click', () => go('#/settings'));
}
