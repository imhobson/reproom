// Settings > Cue log (F11 pocket test, debug only). A plain list of the last
// workout's cues: when each was planned and when it really played.
// See js/cuelog.js for how the plan is worked out.
import * as cuelog from '../cuelog.js';
import * as keepalive from '../keepalive.js';
import { go } from '../ui.js';
import { head } from './settings.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const t = ms => {
  if (ms == null) return '—';
  const s = ms / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};
const secs = ms => `${ms < 0 ? '−' : '+'}${(Math.abs(ms) / 1000).toFixed(2)}s`;
const KIND = { voice: 'VOICE', tick: 'TICK', go: 'GO', chime: 'CHIME', screen: 'SCREEN', freeze: 'PAGE',
  gap: 'TIMER', pause: 'PAUSE', play: 'PLAY', tap: 'TAP', keep: 'AWAKE' };

function row(e) {
  const cue = cuelog.CUE_KINDS.includes(e.k);
  const d = cuelog.lateBy(e);
  let flag = '';
  if (cue && e.off) flag = esc(e.off);
  else if (cue && cuelog.isMissing(e)) flag = e.miss ? 'MISSING (one tick for two)' : e.ctx ? `MISSING (audio ${esc(e.ctx)})` : 'MISSING';
  else if (cue && d != null) flag = secs(d);
  const bad = cue && !e.off && (cuelog.isMissing(e) || cuelog.isLate(e));
  return `
    <li class="cl-row ${cue ? '' : 'ev'} ${bad ? 'bad' : ''}">
      <span class="num cl-t">${t(e.at ?? e.plan)}</span>
      <span class="label cl-k">${KIND[e.k] || esc(e.k)}</span>
      <span class="cl-l">${esc(e.l)}${e.vis === 'h' ? ' <span class="label muted">· off</span>' : ''}${e.how ? ` <span class="label muted">· ${esc(e.how)}</span>` : ''}</span>
      <span class="num cl-d">${flag}</span>
    </li>`;
}

export function render(app) {
  const r = cuelog.last();
  let body;
  if (!r) body = '<p class="s-help">No workout logged yet. Start one with the cue log on.</p>';
  else {
    const s = cuelog.summarize(r);
    const verdict = !r.end ? 'Still running, or the app was closed mid-workout.'
      : s.pass ? `PASS: all ${s.cues} cues within 1s, none missing.`
      : `FAIL: ${s.late} late, ${s.missing} missing, of ${s.cues} cues.`;
    body = `
      <div class="s-card cl-sum">
        <p class="s-name">${esc(r.name)}</p>
        <p class="label muted">${new Date(r.w0).toLocaleString()} · V${esc(r.version)}${r.keep ? ` · Awake: ${esc(modeLabel(r.keep))}` : ''}</p>
        <p class="cl-verdict ${r.end && s.pass ? '' : 'bad'}">${verdict}</p>
        <p>Worst: ${secs(s.worst)} · screen off ${s.hidden}× · slow timer ticks ${s.gaps}</p>
        ${r.end ? `<p>${esc(r.end.how)} after ${t(r.end.at)} on the clock (paused ${t(s.paused)}). The workout's timer counted ${t(r.end.elapsed)}${
          s.behind > 1000 ? `, ${(s.behind / 1000).toFixed(1)}s behind: the workout ran long.` : ', on time.'}</p>` : ''}
      </div>
      <ul class="cl-list">${r.entries.map(row).join('')}</ul>`;
  }
  const cur = keepalive.mode();
  app.innerHTML = `
    <section class="screen settings cuelog">
      ${head('Cue log')}
      <h2 class="label red s-sec">Keep awake in a pocket</h2>
      <div class="p-list" role="radiogroup">${keepalive.MODES.map(m => `
        <div class="p-opt ${m.id === cur ? 'sel' : ''}" data-keep-mode="${m.id}" role="radio" aria-checked="${m.id === cur}">
          <span class="box"></span>
          <span class="p-txt"><span class="o-name">${m.label}</span><span class="p-desc">${m.desc}</span></span>
        </div>`).join('')}</div>
      <p class="s-help">Used from the next workout you start.</p>
      <h2 class="label red s-sec">Last workout</h2>
      <p class="s-help">Each cue: when it played, and how far off plan (+ late, − early). Late by more than 1s or missing is in red.</p>
      ${body}
    </section>`;
  app.querySelector('[data-back]').addEventListener('click', () => go('#/settings'));
  app.querySelectorAll('[data-keep-mode]').forEach(el => el.addEventListener('click', () => {
    keepalive.setMode(el.dataset.keepMode);
    const y = scrollY; render(app); scrollTo(0, y);
  }));
}

const modeLabel = id => keepalive.MODES.find(m => m.id === id)?.label || id;
