// Move images (F09): a pictogram per move, in img/moves/.
//   <id>.svg         still (the end pose): lists and cards
//   <id>--start.svg  start pose: Get ready / Next up
//   <id>--loop.svg   animated loop: a running move, Exercise info
// moves.json gives the still's path (image); the other two come from the id.
// Ink is currentColor on a transparent background; the tile colour comes from
// the app. Moves with sides are drawn as the left side: a right-side step
// shows the image flipped.
import * as data from './data.js';
import { sym } from './symbols.js';

// The still as an <img>, for a tile in a list or card. A move with no image
// (or a file that doesn't load) shows the old symbol instead, so a move added
// later never shows a broken image.
export function thumb(id, { right = false, alt = '', fallback = 'figureSmall' } = {}) {
  const m = data.move(id);
  if (!m || !m.image) return sym(fallback);
  return `<img class="mv${right ? ' flip' : ''}" src="${m.image}" alt="${alt}" data-fallback="${fallback}" draggable="false">`;
}

// A still that fails to load is swapped for its symbol.
document.addEventListener('error', e => {
  const t = e.target;
  if (t instanceof HTMLImageElement && t.classList.contains('mv')) t.outerHTML = sym(t.dataset.fallback || 'figureSmall');
}, true);

// ---- Inline images (F09 step 3): the loop, played by the app ----
// The loop files are SVG with SMIL <animate> (linear between keyTimes,
// repeating). Chrome doesn't repaint SMIL reliably (on the phone the loop
// started seconds late; in the desktop preview it didn't move at all), so
// the app plays the file's own keyframes itself: it reads each <animate>
// (values, keyTimes, dur), takes it out, and sets the attribute every frame
// from its own clock. Same motion as the file, but it starts the moment it's
// shown, pauses and carries on exactly, and survives a redraw. The SVG files
// are not changed. Texts are fetched once (from the images cache) and kept.

export const file = (id, kind) => `img/moves/${id}${kind === 'still' ? '' : `--${kind}`}.svg`;
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const texts = new Map();   // url -> svg text
const loading = new Map(); // url -> promise of the text

export function svgText(url) {
  if (texts.has(url)) return Promise.resolve(texts.get(url));
  if (!loading.has(url)) {
    loading.set(url, fetch(url)
      .then(r => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.text(); })
      .then(t => { texts.set(url, t); return t; })
      .finally(() => loading.delete(url)));
  }
  return loading.get(url);
}
export const prefetch = url => { svgText(url).catch(() => {}); };

// Each <animate> becomes a track: the element, the attribute, the loop
// length, and its keyframes as lists of numbers.
const nums = v => v.trim().split(/[\s,]+/).map(Number);
function tracks(svg) {
  return [...svg.querySelectorAll('animate')].map(a => {
    const t = {
      el: a.parentNode,
      attr: a.getAttribute('attributeName'),
      dur: parseFloat(a.getAttribute('dur')) * 1000,
      times: a.getAttribute('keyTimes').split(';').map(Number),
      values: a.getAttribute('values').split(';').map(nums),
    };
    a.remove();
    return t;
  }).filter(t => t.dur > 0 && t.times.length === t.values.length);
}
const fmt = n => String(Math.round(n * 100) / 100);
function frame(t, ms) {
  const p = (ms % t.dur) / t.dur;
  const k = t.times;
  let i = 0;
  while (i < k.length - 2 && p >= k[i + 1]) i++;
  const a = t.values[i], b = t.values[i + 1] || a;
  const f = k[i + 1] > k[i] ? Math.min(1, Math.max(0, (p - k[i]) / (k[i + 1] - k[i]))) : 0;
  const v = a.length === b.length ? a.map((x, j) => x + (b[j] - x) * f) : a;
  if (t.attr === 'points') {
    const pairs = [];
    for (let j = 0; j + 1 < v.length; j += 2) pairs.push(`${fmt(v[j])},${fmt(v[j + 1])}`);
    t.el.setAttribute('points', pairs.join(' '));
  } else t.el.setAttribute(t.attr, fmt(v[0]));
}

// One frame loop for every image that's playing.
const playing = new Set();
let raf = 0;
function loop() {
  raf = 0;
  for (const art of playing) {
    if (!art.el.isConnected) { playing.delete(art); continue; }
    art.draw();
  }
  if (playing.size) raf = requestAnimationFrame(loop);
}

// One live image: a box holding the inline SVG. Built once (per player step,
// or per info screen) and moved into each redrawn page with place(), so a
// redraw never restarts the loop. kind: 'start', 'loop' or 'still'; a loop
// is the still when the phone asks for reduced motion. Its clock starts at 0
// the first time it's placed playing.
export function moveArt(id, kind, { right = false, fallback = 'figure' } = {}) {
  if (kind === 'loop' && reducedMotion()) kind = 'still';
  const el = document.createElement('div');
  el.className = `mvart${right ? ' flip' : ''}`;
  let tr = [];
  let base = 0;      // ms played before the current run
  let since = null;  // performance.now() when the current run began; null = frozen
  const now = () => base + (since == null ? 0 : performance.now() - since);
  const art = {
    el, running: false,
    draw() { const ms = now(); for (const t of tr) frame(t, ms); },
    // Put it in a box (a new page after a redraw): same point in the loop,
    // playing or frozen.
    place(box, running) {
      if (el.parentNode !== box) box.replaceChildren(el);
      if (running && since == null) since = performance.now();
      if (!running && since != null) { base = now(); since = null; }
      art.running = running;
      art.draw();
      if (running && tr.length) { playing.add(art); if (!raf) raf = requestAnimationFrame(loop); }
      else playing.delete(art);
    },
  };
  const m = data.move(id);
  if (!m || !m.image) { el.innerHTML = sym(fallback); return art; }
  const fill = t => {
    el.innerHTML = t;
    const svg = el.querySelector('svg');
    if (!svg) return;
    svg.removeAttribute('role'); // the name is on screen
    svg.setAttribute('aria-hidden', 'true');
    tr = tracks(svg);
    if (el.parentNode) art.place(el.parentNode, art.running);
  };
  const url = file(id, kind);
  if (texts.has(url)) fill(texts.get(url));
  else svgText(url).then(fill, () => { el.innerHTML = sym(fallback); });
  return art;
}
