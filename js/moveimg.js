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

// ---- Inline images (F09 step 3): the start pose and the loop ----
// A SMIL loop can only be paused, resumed and restarted as inline SVG, so the
// file's text is fetched (from the images cache) and put in the page. Texts
// are kept in memory, so a step's image is there at once on later redraws.

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

// One live image: a box holding the inline SVG. Built once (per player step
// and phase, or per info screen) and moved into each redrawn page with
// place(), so a redraw never restarts the loop. kind: 'start', 'loop' or
// 'still'; a loop is the still when the phone asks for reduced motion.
export function moveArt(id, kind, { right = false, fallback = 'figure' } = {}) {
  if (kind === 'loop' && reducedMotion()) kind = 'still';
  const el = document.createElement('div');
  el.className = `mvart${right ? ' flip' : ''}`;
  const art = {
    el, svg: null, t: 0, running: true,
    // Remember where the loop is, before the page it's in is redrawn.
    save() { if (art.svg && art.svg.isConnected) art.t = art.svg.getCurrentTime(); },
    // Put it in a new box: same point in the loop, playing or frozen.
    place(box, running) {
      art.running = running;
      if (el.parentNode !== box) box.replaceChildren(el);
      apply();
    },
  };
  function apply() {
    const s = art.svg;
    if (!s || !s.isConnected || !s.setCurrentTime) return;
    s.setCurrentTime(art.t);
    if (art.running) s.unpauseAnimations(); else s.pauseAnimations();
  }
  const m = data.move(id);
  if (!m || !m.image) { el.innerHTML = sym(fallback); return art; }
  const fill = t => {
    el.innerHTML = t;
    art.svg = el.querySelector('svg');
    if (art.svg) art.svg.removeAttribute('role'); // the name is on screen
    if (art.svg) art.svg.setAttribute('aria-hidden', 'true');
    apply();
  };
  const url = file(id, kind);
  if (texts.has(url)) fill(texts.get(url));
  else svgText(url).then(fill, () => { el.innerHTML = sym(fallback); });
  return art;
}
