// Semiotic symbols, drawn on a 10×10 grid as inline SVG.
// Ink parts use currentColor; accent parts use the red token.
const RED = 'var(--red)';

const r = (x, y, w, h, fill = 'currentColor') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

// Settings gear: 8 square teeth on a solid ring with a round hole,
// centred on the 10×10 grid.
function gearPath({ teeth = 8, outer = 4.7, root = 3.5, toothW = 1.9, hole = 1.45 } = {}) {
  const f = n => n.toFixed(3);
  const pt = (r, a) => `${f(5 + r * Math.sin(a))} ${f(5 - r * Math.cos(a))}`;
  const ao = Math.asin(toothW / 2 / outer); // half-angle of a tooth at its tip
  const ar = Math.asin(toothW / 2 / root);  // and at its base
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const c = (i * 2 * Math.PI) / teeth;
    d += `${i ? 'L' : 'M'}${pt(root, c - ar)}L${pt(outer, c - ao)}L${pt(outer, c + ao)}L${pt(root, c + ar)}`;
    const next = ((i + 1) * 2 * Math.PI) / teeth;
    d += `A${root} ${root} 0 0 1 ${pt(root, next - ar)}`;
  }
  d += `Z M${f(5 - hole)} 5a${hole} ${hole} 0 1 0 ${f(2 * hole)} 0a${hole} ${hole} 0 1 0 ${f(-2 * hole)} 0Z`;
  return `<path fill="currentColor" fill-rule="evenodd" d="${d}"/>`;
}

const shapes = {
  // Two plates on a bar: the workout / main section.
  barbell: r(0, 4.2, 10, 1.6) + r(1.1, 1.5, 2, 7) + r(6.9, 1.5, 2, 7),
  // Dumbbell: two square weights on a short handle, with end caps. The WEIGHTS
  // section, and the weight moves' picture until they get F09 pictograms.
  dumbbell: r(0.6, 3.8, 0.8, 2.4) + r(1.4, 2.6, 2, 4.8) + r(3.4, 4.4, 3.2, 1.2)
    + r(6.6, 2.6, 2, 4.8) + r(8.6, 3.8, 0.8, 2.4),
  // Standing figure: a move.
  figure: r(4.05, 0.5, 1.9, 1.9) + r(4.15, 2.75, 1.7, 3.8) + r(1.9, 3.1, 2.3, 1.05)
    + r(5.8, 3.1, 2.3, 1.05) + r(3.6, 6.45, 1.2, 3.05) + r(5.2, 6.45, 1.2, 3.05),
  // Figure standing on a red floor line: exercise info.
  figureFloor: r(4.1, 0.6, 1.8, 1.8) + r(4.2, 2.6, 1.6, 3.6) + r(2.2, 3, 2, 0.9) + r(5.8, 3, 2, 0.9)
    + r(3.7, 6.2, 1.1, 3) + r(5.2, 6.2, 1.1, 3) + r(1.2, 9.2, 7.6, 0.55, RED),
  // Small figure used in list rows.
  figureSmall: r(4.3, 1, 1.4, 1.4) + r(4.4, 2.75, 1.2, 3.1) + r(2.2, 3, 2.3, 0.8)
    + r(5.5, 3, 2.3, 0.8) + r(3.9, 5.8, 0.9, 3.4) + r(5.2, 5.8, 0.9, 3.4),
  // Crosshair with a red centre: warm-up.
  warmup: r(4.5, 0.5, 1, 1.8) + r(4.5, 7.7, 1, 1.8) + r(0.5, 4.5, 1.8, 1) + r(7.7, 4.5, 1.8, 1)
    + r(3.3, 3.3, 3.4, 3.4, RED),
  // Crescent moon: rest.
  moon: `<path d="M6.1 1.1A4.3 4.3 0 1 0 8.9 7.6 3.6 3.6 0 1 1 6.1 1.1Z" fill="currentColor"/>`,
  // Moon with a red diamond: cool-down.
  cooldown: `<path d="M5.3 2.4A3.8 3.8 0 1 0 8.4 8 3.1 3.1 0 1 1 5.3 2.4Z" fill="currentColor"/>`
    + `<path d="M8 0.9 8.9 1.8 8 2.7 7.1 1.8Z" fill="${RED}"/>`,
  check: `<path d="M1.2 5.2 3.9 7.9 8.8 2.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>`,
  lock: r(2.5, 4.4, 5, 4.4) + `<path d="M3.5 4.6V3.3a1.5 1.5 0 0 1 3 0v1.3" fill="none" stroke="currentColor" stroke-width="1"/>`,
  // Bar chart with a red last bar: Progress.
  progress: r(1.2, 4.6, 1.3, 3.6) + r(3.2, 3.2, 1.3, 5) + r(5.2, 4.2, 1.3, 4) + r(7.2, 1.2, 1.3, 7, RED)
    + r(0.8, 8.7, 8.4, 0.5),
  gear: gearPath(),
  close: `<path d="M1.8 1.8 8.2 8.2M8.2 1.8 1.8 8.2" stroke="currentColor" stroke-width="1.5"/>`,
  pause: r(2.4, 1.6, 1.9, 6.8) + r(5.7, 1.6, 1.9, 6.8),
  play: `<path d="M2.6 1.2 8.6 5 2.6 8.8Z" fill="currentColor"/>`,
  // Speaker with a red sound bar: mute button (sound on).
  speaker: `<path d="M0.8 3.6h1.9L5.4 1.4v7.2L2.7 6.4H0.8Z" fill="currentColor"/>` + r(7, 3.3, 0.9, 3.4, RED),
  // Speaker with a red cross: muted.
  speakerOff: `<path d="M0.8 3.6h1.9L5.4 1.4v7.2L2.7 6.4H0.8Z" fill="currentColor"/>`
    + `<path d="M6.6 3.5 9.2 6.5M9.2 3.5 6.6 6.5" stroke="${RED}" stroke-width="0.9"/>`,
  // Medal: finish workout.
  medal: `<path d="M2.2 0.6h2.1L5 2.6 5.7 0.6h2.1L6.4 4H3.6Z" fill="currentColor"/>`
    + `<circle cx="5" cy="6.6" r="2.9" fill="currentColor"/>`
    + `<path d="M5 5.1 6.5 6.6 5 8.1 3.5 6.6Z" fill="var(--amber)"/>`,
  arrowRight:`<path d="M0.8 4.1h4.6V1.6L9.2 5 5.4 8.4V5.9H0.8Z" fill="currentColor"/>`,
  arrowLeft: `<path d="M9.2 4.1H4.6V1.6L0.8 5l3.8 3.4V5.9h4.6Z" fill="currentColor"/>`,
  // Runner mid-stride (F11): run routines, and the Run drills tile.
  runner: r(5.7, 0.6, 1.7, 1.7)
    + `<path d="M5.7 3.2 4.5 6M3.2 3.6 5.4 3.4 7.4 4.8M4.5 6 6.4 7.2 5.9 9.2M4.5 6 3.5 7.8 1.3 8"`
    + ` fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="square"/>`,
};

export function sym(name, cls = '') {
  return `<svg class="sym ${cls}" viewBox="0 0 10 10" aria-hidden="true">${shapes[name]}</svg>`;
}
