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
