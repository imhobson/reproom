// The Wall (F14): every session adds one tile; 100 tiles fill a 10x10
// symbol, then the next symbol starts, forever.
//
// The three masks are copied from the boards' generator (wall.py): barbell,
// flame, medal. Symbol k uses mask (k - 1) % 3 until more are drawn (D08).
// Done tiles: shape cells ink, the rest amber. Tiles to come: line grey.
// Each symbol fills in a fixed order: a shuffle of its 100 cells seeded by
// the symbol number, so it's the same every time (it needn't match the boards).

const MASKS = [
  // barbell
  ['..........', '..........', '.##....##.', '.##....##.', '##########',
   '##########', '.##....##.', '.##....##.', '..........', '..........'],
  // flame
  ['....#.....', '....##....', '...###....', '...####...', '..######..',
   '..##.###..', '.###..##..', '.##....##.', '.###..###.', '..######..'],
  // medal
  ['.##....##.', '..##..##..', '...####...', '..######..', '.###..###.',
   '.##....##.', '.##....##.', '.###..###.', '..######..', '...####...'],
];

const INK = '#141517', AMBER = '#F0A70A', LINE = '#C9C5BA', RED = '#B3161E';

// A small seeded random (mulberry32), so a symbol's order never changes.
function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const orders = new Map();
// The cells of symbol k (1-based) in the order they fill.
export function order(k) {
  if (!orders.has(k)) {
    const o = Array.from({ length: 100 }, (_, i) => i);
    const r = rand(1000 + k);
    for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    orders.set(k, o);
  }
  return orders.get(k);
}

const p2 = n => String(n).padStart(2, '0');

// Symbol k (1-based) with `filled` tiles done, as one inline SVG of rects.
// cell / gap in px. newTile: the tile number (1–100) to outline in red.
// label: the aria-label (default "Symbol 03, 49 of 100 tiles").
export function grid(k, filled, cell, gap = 2, { newTile = null, label = null } = {}) {
  const mask = MASKS[(k - 1) % MASKS.length];
  const o = order(k);
  const done = new Set(o.slice(0, filled));
  const newCell = newTile ? o[newTile - 1] : null;
  const size = cell * 10 + gap * 9;
  const pad = newTile ? 2 : 0; // room for the red outline
  let r = '';
  let mark = '';
  for (let i = 0; i < 100; i++) {
    const x = (i % 10) * (cell + gap), y = Math.floor(i / 10) * (cell + gap);
    const f = done.has(i) ? (mask[Math.floor(i / 10)][i % 10] === '#' ? INK : AMBER) : LINE;
    r += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${f}"/>`;
    if (i === newCell) mark = `<rect x="${x - 1}" y="${y - 1}" width="${cell + 2}" height="${cell + 2}" fill="none" stroke="${RED}" stroke-width="2"/>`;
  }
  const w = size + pad * 2;
  const aria = label === false ? 'aria-hidden="true"' : `role="img" aria-label="${label || `Symbol ${p2(k)}, ${filled} of 100 tiles`}"`;
  return `<svg class="wgrid" width="${w}" height="${w}" viewBox="${-pad} ${-pad} ${w} ${w}" ${aria}>${r}${mark}</svg>`;
}
