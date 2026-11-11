// Cornelius (F18): the sage. One SVG drawing (cornelius-art.js), parts swapped
// for expressions, blinking and talking; CSS (Cornelius section of app.css)
// does the breathing, swaying and floating tiles.
//
//   create(expr, opts)       -> a figure: { el, set(expr), talking(on), pause(on), destroy() }
//   restScene()              -> a runner for the Rest screen: { place(box, running), stop() }
//   thumb()                  -> a 44px head-and-shoulders picture for Settings
//   pickLine(moment, vars, lastId) -> { id, expr, text } or null
//   showDialogue({ expr, text, magic, onAmber, onClose, startAt, talkSecs, autoClose }) -> close()
//   launchLine()             -> the launch line (I08)
import { SVG } from './cornelius-art.js';
import { LINES } from './cornelius-lines.js';

export const VOICE_ID = 'eleven-cornelius';

// name: [brows, eyes, mouth]   (the head tilt is in the CSS, by data-expr)
export const EXPRESSIONS = {
  neutral: ['level', 'open', 'closed'],
  proud: ['up', 'happy', 'smile'],
  stern: ['down', 'narrow', 'flat'],
  laughing: ['up', 'happy', 'laugh'],
  surprised: ['high', 'wide', 'o'],
  zen: ['soft', 'closed', 'closed'],
  wink: ['up', 'wink', 'smile'],
  worried: ['worried', 'open', 'flat'],
};
const MAGIC = new Set(['proud', 'laughing', 'surprised']);
const TALK = ['talk1', 'talk2', 'talk3', 'talk2', 'closed', 'talk1', 'talk3'];
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function svgEl() {
  const t = document.createElement('template');
  t.innerHTML = SVG;
  return t.content.firstElementChild;
}

export function create(expr = 'neutral', { magic, slow = false, onAmber = false } = {}) {
  const el = svgEl();
  let cur = expr, paused = false, talkT = 0, blinkT = 0;
  el.classList.toggle('slow', slow);
  el.classList.toggle('on-amber', onAmber);

  function apply(eyesOverride, mouthOverride) {
    const [b, e, m] = EXPRESSIONS[cur] || EXPRESSIONS.neutral;
    el.dataset.expr = cur;
    el.dataset.brows = b;
    el.dataset.eyes = eyesOverride || e;
    el.dataset.mouth = mouthOverride || m;
  }
  function set(name, opts = {}) {
    cur = EXPRESSIONS[name] ? name : 'neutral';
    el.classList.toggle('magic', opts.magic ?? magic ?? MAGIC.has(cur));
    apply();
  }
  // Blink every 3 to 5 seconds, only when his eyes are open.
  function scheduleBlink() {
    clearTimeout(blinkT);
    blinkT = setTimeout(() => {
      const e = (EXPRESSIONS[cur] || [])[1];
      if (!paused && (e === 'open' || e === 'wide') && !reduceMotion()) {
        el.dataset.eyes = 'closed';
        setTimeout(() => { if (el.dataset.eyes === 'closed') apply(null, talkT ? el.dataset.mouth : null); }, 130);
      }
      scheduleBlink();
    }, 3000 + Math.random() * 2000);
  }
  function talking(on) {
    clearInterval(talkT); talkT = 0;
    if (on && !reduceMotion()) {
      let i = 0;
      talkT = setInterval(() => { el.dataset.mouth = TALK[i++ % TALK.length]; }, 95);
    } else apply();
  }
  function pause(on) { paused = on; el.classList.toggle('paused', on); if (on) talking(false); }
  function destroy() { clearTimeout(blinkT); clearInterval(talkT); el.remove(); }

  set(expr, { magic });
  scheduleBlink();
  return { el, set, talking, pause, destroy };
}

// ---- Rest screen (I07 scene list) ----
// Same shape as restscenes.js runners: place(box, running) puts him in the
// image area (kept across redraws), stop() takes him out.
export function restScene() {
  let fig = null, wrap = null;
  return {
    place(box, running) {
      if (!wrap) {
        fig = create('zen', { slow: true, magic: false });
        wrap = document.createElement('div');
        wrap.className = 'rest-scene c-scene';
        wrap.appendChild(fig.el);
      }
      if (wrap.parentNode !== box) box.appendChild(wrap);
      fig.pause(!running);
    },
    stop() { if (fig) fig.destroy(); if (wrap) wrap.remove(); fig = wrap = null; },
  };
}

// Settings → Rest screen thumbnail: head and shoulders on the grey, still.
export function thumb() {
  const el = svgEl();
  el.setAttribute('viewBox', '60 70 280 280');
  const [b, e, m] = EXPRESSIONS.zen;
  Object.assign(el.dataset, { expr: 'zen', brows: b, eyes: e, mouth: m });
  el.classList.add('paused');
  el.style.background = 'var(--field, #E8E5DC)';
  el.style.overflow = 'hidden';
  el.classList.add('c-thumb');
  return el;
}

// ---- Lines ----
export function pickLine(moment, vars = {}, lastId = null) {
  const fill = t => t.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? vars[k] === 0 ? String(vars[k]) : '\u0000'));
  const ok = LINES.filter(l => l.moment === moment).map(l => ({ ...l, text: fill(l.text) })).filter(l => !l.text.includes('\u0000'));
  if (!ok.length) return null;
  const fresh = ok.length > 1 ? ok.filter(l => l.id !== lastId) : ok;
  return fresh[Math.floor(Math.random() * fresh.length)];
}

export const launchLine = () => LINES.find(l => l.moment === 'launch') || { expr: 'proud', text: "Let's do this, Michael." };

// ---- Dialogue pop-up (board 12 / 12b · Proposed) ----
// First tap finishes the typing; the next closes it. Returns close().
// For the launch sound (I08): startAt (seconds) holds him quiet, eyes closed,
// until his recorded line starts; talkSecs keeps his mouth moving for the
// clip's length; autoClose (seconds) closes it that long after he finishes.
export function showDialogue({ expr = 'proud', text, magic, onAmber = false, onClose, startAt = 0, talkSecs = 0, autoClose = 0 } = {}) {
  const fig = create(startAt ? 'zen' : expr, { magic: startAt ? false : magic, onAmber });
  const root = document.createElement('div');
  root.className = 'c-dlg';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', `Cornelius: ${text}`);
  root.innerHTML = `<div class="c-por"></div>
    <div class="c-box"><span class="c-name">Cornelius</span><p class="c-line"></p><span class="c-tap">Tap ▸</span></div>`;
  root.querySelector('.c-por').appendChild(fig.el);
  const line = root.querySelector('.c-line');
  document.body.appendChild(root);

  let n = 0, typeT = 0, waitT = 0, talkT = 0, autoT = 0, closed = false, t0 = 0;
  const stopTalking = () => { clearTimeout(talkT); talkT = 0; fig.talking(false); };
  const done = () => {
    clearInterval(typeT); typeT = 0; line.textContent = text; root.classList.add('typed');
    // with a recorded line, the mouth runs for the clip's length
    const left = talkSecs ? talkSecs * 1000 - (performance.now() - t0) : 0;
    if (left > 0 && !reduceMotion()) { clearTimeout(talkT); talkT = setTimeout(stopTalking, left); } else stopTalking();
    if (autoClose) autoT = setTimeout(close, Math.max(left, 0) + autoClose * 1000);
  };
  const start = () => {
    waitT = 0; t0 = performance.now();
    if (startAt) fig.set(expr, { magic });
    if (reduceMotion()) { done(); return; }
    fig.talking(true);
    typeT = setInterval(() => {               // about 45 characters a second
      n = Math.min(text.length, n + 1);
      line.textContent = text.slice(0, n);
      if (n >= text.length) done();
    }, 22);
  };
  if (startAt) waitT = setTimeout(start, startAt * 1000); else start();
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(waitT); clearTimeout(talkT); clearTimeout(autoT);
    clearInterval(typeT);
    root.classList.add('closing');
    setTimeout(() => { fig.destroy(); root.remove(); }, 160);
    if (onClose) onClose();
  }
  root.addEventListener('click', () => { if (waitT) close(); else if (typeT) done(); else close(); });
  return close;
}
