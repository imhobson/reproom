// Rest screen scenes (I07, 11 Nov 2026). Six moving pictures for the rest
// state, drawn live on a canvas (no video files, so they work offline and
// stay sharp): Breathing, Camp, Beach, Clouds, Snowy cabin, Mountain lake.
// Settings → Rest screen picks which ones play (store: settings.restScenes);
// with more than one ticked, every rest picks one at random. The still Moon
// is a choice too: it's the moon symbol the player already draws.
//
// The pixel scenes are drawn 1:1 into a small buffer (one art pixel about
// 4 CSS px, rounded to whole device pixels) and scaled up without smoothing.
// They run at about 12 frames a second, freeze while paused, and show a
// still frame with the phone's "reduce motion" setting. Only the Semiotic
// palette is used. Designs: 03 Design pass/Rest screen (source/scenes.py
// and scenes2.py draw the same scenes in Python).

const C = {
  ink: [20, 21, 23], paper: [244, 242, 236], red: [179, 22, 30], amber: [240, 167, 10],
  field: [232, 229, 220], line: [201, 197, 186], muted: [74, 74, 74], warm: [242, 205, 123],
};
const { ink: INK, paper: PAPER, red: RED, amber: AMBER, field: FIELD, line: LINE, muted: MUTED, warm: WARM } = C;

export const SCENES = [
  { id: 'breathing', label: 'Breathing', desc: 'In for 4, out for 4' },
  { id: 'camp', label: 'Camp', desc: 'Moonlit forest, campfire', night: true },
  { id: 'beach', label: 'Beach', desc: 'Sunset, waves washing in' },
  { id: 'clouds', label: 'Clouds', desc: 'Above the clouds, drifting' },
  { id: 'cabin', label: 'Snowy cabin', desc: 'Snow falling, warm window', night: true },
  { id: 'lake', label: 'Mountain lake', desc: 'Dawn, a canoe drifting' },
];
export const MOON = { id: 'moon', label: 'Moon', desc: 'The still moon' };
export const DEFAULT = SCENES.map(s => s.id);
export const isNight = id => !!SCENES.find(s => s.id === id)?.night;
export const label = id => (id === 'moon' ? MOON.label : SCENES.find(s => s.id === id)?.label || id);

// One pick per rest: any ticked choice except the one just shown (when
// there's another to choose). 'moon' means the still moon symbol.
export function pick(ticked, last) {
  const ids = (ticked || []).filter(id => id === 'moon' || SCENES.some(s => s.id === id));
  if (!ids.length) return 'moon';
  const pool = ids.length > 1 ? ids.filter(id => id !== last) : ids;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---- Drawing helpers ----

// Seeded random numbers, so a scene's stars and trees stay in place.
function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    random: next,
    range: n => Math.floor(next() * n),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    uniform: (lo, hi) => lo + next() * (hi - lo),
    choice: arr => arr[Math.floor(next() * arr.length)],
  };
}

function buffer(W, H, fill) {
  const img = new ImageData(W, H);
  const d = img.data;
  const put = (x, y, c) => {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  };
  const get = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, fill);
  return { img, put, get, W, H };
}

const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

function disk(put, cx, cy, r, col, clip) {
  for (let y = Math.floor(cy - r - 1); y < cy + r + 2; y++) {
    for (let x = Math.floor(cx - r - 1); x < cx + r + 2; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r && (!clip || clip(x, y))) put(x, y, col);
    }
  }
}

// A dithered step from colour c0 (top) to c1 (bottom), 4x4 Bayer.
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
function bands(put, W, y0, y1, c0, c1) {
  for (let y = y0; y < y1; y++) {
    const f = (y - y0) / Math.max(1, y1 - y0);
    for (let x = 0; x < W; x++) put(x, y, f > (BAYER[((y % 4) + 4) % 4][x % 4] + 0.5) / 16 ? c1 : c0);
  }
}

// Top row of a stepped pine tree line whose foot is at `base`.
function pineProfile(W, base, seed, step = 5, hmin = 6, hmax = 12) {
  const r = rng(seed);
  const tops = new Array(W).fill(base);
  let cx = -2;
  while (cx < W + 3) {
    const h = r.int(hmin, hmax);
    for (let x = 0; x < W; x++) tops[x] = Math.min(tops[x], base - h + 2 * Math.abs(x - cx));
    cx += r.int(step - 1, step + 1);
  }
  return tops;
}

// ---- The pixel scenes: (buffer, t seconds, tm = rows behind the top buttons) ----

function camp(b, t, tm) {
  const { W, H, put } = b;
  const g = H - 14;
  const r = rng(Math.floor(t * 8) + 1);
  const sr = rng(7);
  for (let i = 0; i < Math.floor(W * H / 220); i++) {
    const x = sr.range(W), y = tm + sr.range(Math.max(1, g - 14 - tm));
    const v = Math.sin(t * (0.6 + sr.random()) + sr.random() * 6.28);
    put(x, y, v > 0.55 ? PAPER : v > -0.2 ? LINE : MUTED);
  }
  const mx = W * 0.6 - t * 0.12, my = tm + 9, mr = 5.2;
  disk(put, mx, my, mr, PAPER, (x, y) => (x + 0.5 - (mx + 2.4)) ** 2 + (y + 0.5 - (my - 1.6)) ** 2 > (mr * 0.82) ** 2);
  const tops = pineProfile(W, g + 1, 3);
  for (let x = 0; x < W; x++) for (let y = Math.max(tops[x], 0); y <= g; y++) put(x, y, MUTED);
  for (let y = g + 1; y < H; y++) for (let x = 0; x < W; x++) put(x, y, INK);
  const tr = rng(11);
  for (let i = 0; i < W / 4; i++) put(tr.range(W), g + 3 + tr.range(H - g - 3), MUTED);
  const fx = Math.round(W * 0.62), fy = g + 5;
  const rx = 12 + r.choice([0, 0, 1, -1]), ry = 4.2;
  for (let y = g + 1; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = ((x - fx) / rx) ** 2 + ((y - fy) / ry) ** 2;
      if (d < 1 && (x + y) % 2 === 0 && (d < 0.55 || (x * 3 + y) % 4 === 0)) put(x, y, RED);
    }
  }
  // tent: canvas grey, the fire-facing half lit warm, ink door
  const tx = Math.round(W * 0.3), ty = g - 9, tw = 10;
  for (let y = ty; y < fy; y++) {
    const half = (y - ty) * tw / (fy - ty);
    for (let x = Math.floor(tx - half); x <= Math.floor(tx + half); x++) {
      let c = x > tx ? WARM : LINE;
      if (y > ty + 6 && Math.abs(x - tx) <= (y - (ty + 6)) * 0.3) c = INK;
      put(x, y, c);
    }
  }
  put(tx, ty - 1, MUTED);
  for (let x = fx + 6; x < fx + 11; x++) { put(x, fy - 1, x === fx + 6 ? WARM : MUTED); put(x, fy, MUTED); }
  for (let i = -4; i <= 4; i++) put(fx + i, fy + (Math.abs(i) > 2 ? 1 : 0), MUTED);
  [2, 4, 7, 10, 7, 5, 2].forEach((h0, i) => {
    const h = Math.max(0, h0 + r.choice([-1, 0, 0, 1]));
    for (let k = 0; k < h; k++) {
      const f = k / Math.max(h0, 1);
      put(fx - 3 + i, fy - 1 - k, f < 0.4 ? RED : f < 0.85 ? AMBER : WARM);
    }
  });
  for (let s = 0; s < 2; s++) {
    const life = (t * 5 + s * 3.7) % 9;
    put(fx + Math.round(Math.sin(t * 2 + s * 2) * 1.5), Math.floor(fy - 8 - life), life < 6 ? AMBER : RED);
  }
  const top0 = Math.min(...tops);
  const nearPine = (cx, top, maxHalf) => {
    for (let y = top; y < g + 3; y++) {
      const tier = Math.floor((y - top) / 6), rr = (y - top) % 6;
      const half = Math.min(maxHalf, tier + Math.floor(rr / 2));
      for (let x = cx - half; x <= cx + half; x++) put(x, y, MUTED);
      if (y >= top0 - 2) { put(cx - half - 1, y, INK); put(cx + half + 1, y, INK); }
    }
    for (let y = g + 3; y < g + 6; y++) put(cx, y, MUTED);
  };
  nearPine(2, tm + 3, 7);
  nearPine(W - 1, tm + 12, 6);
}

function beach(b, t, tm) {
  const { W, H, put } = b;
  const hz = Math.floor(tm + (H - tm) * 0.48);
  bands(put, W, tm - 6, tm + 8, FIELD, WARM);
  for (let y = tm + 8; y < hz; y++) for (let x = 0; x < W; x++) put(x, y, WARM);
  bands(put, W, hz - 9, hz, WARM, AMBER);
  const sx = W * 0.5, sr = 10;
  disk(put, sx, hz, sr, RED, (x, y) => y < hz && y !== hz - 3 && y !== hz - 6);
  const shore = H - 15;
  for (let y = hz; y < shore + 3; y++) for (let x = 0; x < W; x++) put(x, y, MUTED);
  const r = rng(Math.floor(t * 6) + 1);
  for (let y = hz + 1; y < shore - 1; y += 2) {
    const w = Math.max(1, Math.floor(sr - (y - hz) * 0.4));
    for (let x = Math.floor(sx - w); x < sx + w; x++) if (r.random() < 0.7) put(x, y, y < hz + 6 ? RED : AMBER);
  }
  const wr = rng(5);
  for (let i = 0; i < Math.floor(W / 6); i++) {
    const y = hz + 2 + wr.range(Math.max(1, shore - hz - 3));
    const x0 = ((wr.range(W) + t * (1 + y / H * 3)) % (W + 6)) - 3;
    const n = wr.int(2, 4);
    for (let k = 0; k < n; k++) put(x0 + k, y, LINE);
  }
  const wash = 2.5 + 2.5 * Math.sin(t * 2 * Math.PI / 6);
  for (let y = shore; y < H; y++) for (let x = 0; x < W; x++) put(x, y, WARM);
  for (let x = 0; x < W; x++) {
    const edge = shore + wash + Math.sin(x * 0.35 + t * 0.8) * 1.2;
    for (let y = shore; y < Math.floor(edge); y++) put(x, y, MUTED);
    put(x, edge, PAPER);
  }
  for (let i = 0; i < 14; i++) { const r2 = rng(100 + i); put(r2.range(W), shore + 6 + r2.range(Math.max(1, H - shore - 6)), AMBER); }
  // the palm, leaning in, fronds swaying
  const pts = [];
  for (let k = 0; k < 34; k++) pts.push([8 + k * 0.45 + (k / 34) ** 2 * 6, H - 2 - k]);
  pts.forEach(([x, y]) => { put(x, y, INK); put(x + 1, y, INK); });
  const [tx, ty] = pts[pts.length - 1];
  const sway = Math.sin(t * 1.3) * 1.2;
  [[-160, 13], [-130, 11], [-60, 12], [-20, 14], [10, 10], [160, 9], [40, 9]].forEach(([ang, ln]) => {
    const a = (ang + sway * 4) * Math.PI / 180;
    for (let k = 0; k < ln; k++) {
      const x = tx + Math.cos(a) * k, y = ty + Math.sin(a) * k * 0.6 + (k / ln) ** 2 * 5;
      put(x, y, INK); if (k < ln - 3) put(x, y + 1, INK);
    }
  });
  put(tx - 1, ty + 2, INK); put(tx + 1, ty + 2, INK);
  for (let i = 0; i < 2; i++) {
    const x = ((W * 0.62 + i * 7 - t * 1.5) % (W + 20) + W + 20) % (W + 20) - 10;
    const y = tm + 10 + i * 3 + Math.sin(t + i);
    put(x - 1, y - 1, INK); put(x, y, INK); put(x + 1, y - 1, INK);
  }
}

function cloud(put, cx, cy, s) {
  [[-1.2, 0.35, 0.75], [-0.4, -0.25, 1], [0.55, -0.05, 0.85], [1.25, 0.4, 0.6]]
    .forEach(([dx, dy, r]) => disk(put, cx + dx * s, cy + dy * s, r * s, PAPER));
  for (let x = Math.floor(cx - 1.9 * s); x < cx + 1.9 * s; x++) {
    for (let y = Math.floor(cy + 0.5 * s); y < cy + 0.75 * s; y++) put(x, y, LINE);
  }
}

function clouds(b, t, tm) {
  const { W, H, put } = b;
  bands(put, W, tm + 4, tm + 30, FIELD, LINE);
  for (let y = tm + 30; y < H; y++) for (let x = 0; x < W; x++) put(x, y, LINE);
  disk(put, W * 0.76, tm + 9, 6, AMBER);
  disk(put, W * 0.76, tm + 9, 4, WARM);
  const r = rng(2);
  [[tm + 16, 3.2, 0.6, 5], [tm + 30, 4.5, 1.2, 4], [H - 22, 6, 2.2, 3]].forEach(([yb, s, speed, n]) => {
    for (let i = 0; i < n; i++) {
      const span = W + 30;
      const x = (((r.range(span) - t * speed) % span) + span) % span - 15;
      const y = yb + r.int(-3, 3);
      cloud(put, x, y, s * r.uniform(0.8, 1.2));
    }
  });
  for (let x = 0; x < W; x++) {
    const top = H - 11 + Math.sin(x * 0.22 + t * 0.4) * 1.6 + Math.sin(x * 0.07 - t * 0.25) * 2;
    for (let y = Math.floor(top); y < H; y++) put(x, y, PAPER);
    if ((x + Math.floor(t * 2)) % 9 < 3) put(x, Math.floor(top) + 3, LINE);
  }
  for (let i = 0; i < 3; i++) {
    const x = ((W * 0.2 + i * 5 + t * 1.2) % (W + 20)) - 10;
    const y = tm + 22 + i * 2 + Math.sin(t * 1.5 + i) * 0.6;
    put(x - 1, y - 1, MUTED); put(x, y, MUTED); put(x + 1, y - 1, MUTED);
  }
}

function cabin(b, t, tm) {
  const { W, H, put } = b;
  const sr = rng(9);
  for (let i = 0; i < Math.floor(W * H / 300); i++) put(sr.range(W), tm + sr.range(Math.max(1, Math.floor(H / 2) - tm)), MUTED);
  const gy = H - 20;
  for (let x = 0; x < W; x++) {
    const h1 = gy - 6 + Math.sin(x * 0.06 + 1) * 4;
    for (let y = Math.floor(h1); y < H; y++) put(x, y, LINE);
    const h2 = gy + 2 + Math.sin(x * 0.09 + 3) * 2;
    for (let y = Math.floor(h2); y < H; y++) put(x, y, PAPER);
  }
  const pine = (cx, foot, h) => {
    const top = foot - h;
    for (let y = top; y < foot; y++) {
      const tier = Math.floor((y - top) / 5), rr = (y - top) % 5;
      const half = Math.min(6, tier + Math.floor(rr / 2));
      for (let x = cx - half; x <= cx + half; x++) put(x, y, rr === 0 ? PAPER : MUTED);
    }
    put(cx, foot, MUTED); put(cx, foot + 1, MUTED);
  };
  [[6, 30], [15, 22], [W - 18, 26], [W - 8, 34], [W - 27, 16]].forEach(([cx, h]) =>
    pine(cx, Math.floor(gy - 4 + Math.sin(cx * 0.06 + 1) * 4) + 3, h));
  // the cabin: red walls, snowy roof, a warm window that flickers
  const cx0 = Math.round(W * 0.35), cw = 26, wy = gy - 2;
  for (let y = wy - 11; y <= wy; y++) for (let x = cx0; x < cx0 + cw; x++) put(x, y, RED);
  for (let k = 0; k < 10; k++) {
    for (let x = cx0 - 3 + k; x < cx0 + cw + 3 - k; x++) {
      put(x, wy - 12 - k, k < 3 || x === cx0 - 3 + k || x === cx0 + cw + 2 - k ? PAPER : LINE);
    }
  }
  for (let x = cx0 - 3; x < cx0 + cw + 3; x++) put(x, wy - 12, MUTED);
  const fl = rng(Math.floor(t * 3) + 1).choice([AMBER, AMBER, WARM]);
  for (let y = wy - 8; y < wy - 3; y++) for (let x = cx0 + 4; x < cx0 + 11; x++) put(x, y, fl);
  for (let x = cx0 + 4; x < cx0 + 11; x++) put(x, wy - 6, INK);
  for (let y = wy - 8; y < wy - 3; y++) put(cx0 + 7, y, INK);
  for (let y = wy - 9; y <= wy; y++) for (let x = cx0 + 16; x < cx0 + 21; x++) put(x, y, INK);
  for (let x = cx0 + 2; x < cx0 + 14; x += 2) put(x, wy + 2, WARM);
  const chx = cx0 + cw - 7;
  for (let y = wy - 24; y < wy - 15; y++) for (let x = chx; x < chx + 3; x++) put(x, y, MUTED);
  for (let k = 0; k < 6; k++) {
    const age = (t * 0.8 + k * 0.9) % 5.4;
    disk(put, chx + 1 + age * 1.6 + Math.sin(age * 2) * 0.8, wy - 26 - age * 3.2, 0.6 + age * 0.35, age < 3.5 ? LINE : MUTED);
  }
  const fr = rng(4);
  for (let i = 0; i < Math.floor(W * H / 45); i++) {
    const x0 = fr.range(W), y0 = fr.range(H), sp = fr.uniform(2, 5);
    const y = (y0 + t * sp) % H;
    if (y > tm - 4) put(x0 + Math.sin(t * 0.8 + i) * 1.5, y, PAPER);
  }
}

function lake(b, t, tm) {
  const { W, H, put, get } = b;
  const wl = Math.floor(tm + (H - tm) * 0.52);
  bands(put, W, tm, tm + 14, FIELD, WARM);
  for (let y = tm + 14; y < wl; y++) for (let x = 0; x < W; x++) put(x, y, WARM);
  bands(put, W, wl - 10, wl, WARM, AMBER);
  disk(put, W * 0.52, wl - 29 - Math.min(1, t / 30) * 6, 5, PAPER);
  // far mountains with snow caps
  const rr = rng(3), pk = [];
  for (let x = -5; x < W + 10; x += rr.int(10, 18)) pk.push([x, wl - rr.uniform(0.4, 1) * 30]);
  for (let x = 0; x < W; x++) {
    const h = Math.min(wl, ...pk.map(([px, py]) => py + Math.abs(x - px) * 1.15));
    for (let y = Math.floor(h); y < wl; y++) put(x, y, MUTED);
    if (h < wl - 30 * 0.55) { put(x, h, PAPER); put(x, h + 1, PAPER); }
  }
  const tops = pineProfile(W, wl, 12, 4, 3, 8);
  for (let x = 0; x < W; x++) for (let y = Math.max(tops[x], 0); y < wl; y++) put(x, y, INK);
  // the reflection: squashed, in deeper water colours, broken by ripples
  const deep = c => (same(c, WARM) ? LINE : same(c, AMBER) ? WARM : same(c, FIELD) ? LINE : c);
  for (let y = wl; y < H; y++) {
    const d = y - wl;
    const my = Math.max(tm, wl - 1 - Math.floor(d * 1.6));
    const sh = Math.round(Math.sin(y * 1.3 + t * 1.2) * Math.min(2, d / 8));
    for (let x = 0; x < W; x++) put(x, y, deep(get(Math.min(W - 1, Math.max(0, x + sh)), my)));
  }
  for (let i = 0; i < 16; i++) {
    const r2 = rng(200 + i);
    const y = wl + 2 + r2.range(Math.max(1, H - wl - 2));
    const x0 = ((r2.range(W) + t * r2.uniform(0.4, 1.2)) % (W + 8)) - 4;
    const n = r2.int(3, 6);
    for (let k = 0; k < n; k++) put(x0 + k, y, y < wl + 12 ? PAPER : FIELD);
  }
  // a red canoe with a paddler, drifting across
  const cx = ((W * 0.3 + t * 0.35) % (W + 20)) - 10, cy = wl + 12;
  for (let x = Math.floor(cx - 5); x < cx + 6; x++) put(x, cy, RED);
  for (let x = Math.floor(cx - 4); x < cx + 5; x++) put(x, cy + 1, RED);
  put(cx - 6, cy - 1, RED); put(cx + 6, cy - 1, RED);
  for (let y = cy - 4; y < cy; y++) put(cx, y, PAPER);
  const pa = Math.sin(t * 1.6) * 2;
  put(cx + 2 + pa * 0.3, cy - 2, PAPER); put(cx + 3 + pa * 0.5, cy, PAPER); put(cx + 3 + pa * 0.5, cy + 1, PAPER);
  for (let x = Math.floor(cx - 4); x < cx + 5; x += 2) put(x, cy + 3, PAPER);
}

const PIXEL = { camp: [camp, INK], beach: [beach, FIELD], clouds: [clouds, FIELD], cabin: [cabin, INK], lake: [lake, FIELD] };

// Breathing: tiles across the whole area; only the 10x10 square in the move
// square's place breathes (a growing circle, red leading edge), 4s in, 4s out.
// The tiles around it stay line grey.
const rgb = c => `rgb(${c.join(',')})`;
function breathing(ctx, w, h, t, s, top) {
  ctx.fillStyle = rgb(FIELD);
  ctx.fillRect(0, 0, w, h);
  const pitch = s / 11.8 * 1.2, cell = s / 11.8;
  const cx = w / 2, cy = top + s / 2;
  const ph = t % 8;
  const lin = ph < 4 ? ph / 4 : 1 - (ph - 4) / 4;
  const R = (0.5 - 0.5 * Math.cos(lin * Math.PI)) * 7.15;
  const n = Math.ceil(Math.max(w, h * 2) / pitch / 2) + 1;
  for (let j = -n; j < n; j++) {
    for (let i = -n; i < n; i++) {
      const x0 = Math.round(cx + i * pitch + (pitch - cell) / 2), y0 = Math.round(cy + j * pitch + (pitch - cell) / 2);
      if (x0 > w || y0 > h || x0 + cell < 0 || y0 + cell < 0) continue;
      let c = LINE;
      if (i >= -5 && i < 5 && j >= -5 && j < 5) {
        const d = Math.hypot(i + 0.5, j + 0.5);
        c = d < R - 1 ? INK : d < R ? RED : LINE;
      }
      ctx.fillStyle = rgb(c);
      ctx.fillRect(x0, y0, Math.round(x0 + cell) - x0, Math.round(y0 + cell) - y0);
    }
  }
}

// ---- Running a scene on a canvas ----

const FPS = 12;
const ART_CSS = 4;   // one art pixel, in CSS px
const TOP_CSS = 96;  // the top buttons (44px down, 44px tall) and a gap

const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Draw one frame of `id` at time t onto ctx, w x h device px.
// opts: dpr, breath { s, top } in CSS px, tm (CSS px hidden at the top).
export function drawFrame(ctx, id, w, h, t, { dpr = 1, breath = null, top = TOP_CSS } = {}) {
  if (id === 'breathing') {
    const b = breath || { s: Math.max(120, h / dpr - 108), top: 92 };
    breathing(ctx, w, h, t, b.s * dpr, b.top * dpr);
    return;
  }
  const [fn, bg] = PIXEL[id] || PIXEL.camp;
  const px = Math.max(1, Math.round(ART_CSS * dpr));
  const W = Math.ceil(w / px), H = Math.ceil(h / px);
  const tm = Math.ceil(top * dpr / px);
  const b = buffer(W, H, bg);
  fn(b, t, tm);
  const off = drawFrame.off || (drawFrame.off = document.createElement('canvas'));
  off.width = W; off.height = H;
  off.getContext('2d').putImageData(b.img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, W, H, Math.floor((w - W * px) / 2), 0, W * px, H * px);
}

// A scene playing in a box. Kept across the player's redraws (like the move
// image): place(box, running) moves its canvas into the new page, and it
// carries on from where it was. Paused = frozen.
export function scene(id, { breath } = {}) {
  const cv = document.createElement('canvas');
  cv.className = 'rest-scene';
  cv.setAttribute('aria-hidden', 'true');
  const ctx = cv.getContext('2d');
  let t = 4, last = null, running = false, raf = 0, lastDraw = -1;
  const frame = now => {
    raf = 0;
    if (!cv.isConnected) { running = false; return; }
    if (running && !still()) {
      if (last != null) t += Math.min(0.25, (now - last) / 1000);
      last = now;
    }
    if (lastDraw < 0 || now - lastDraw >= 1000 / FPS - 4) { paint(); lastDraw = now; }
    if (running && !still()) raf = requestAnimationFrame(frame);
  };
  const paint = () => {
    const dpr = window.devicePixelRatio || 1;
    const r = cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    drawFrame(ctx, id, w, h, t, { dpr, breath: breath?.() });
  };
  return {
    id,
    place(box, run) {
      if (cv.parentNode !== box) box.prepend(cv);
      running = run;
      last = null;
      lastDraw = -1;
      if (!raf) raf = requestAnimationFrame(frame);
    },
    stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; cv.remove(); },
  };
}

// A still thumbnail for Settings (a square canvas, size in CSS px).
export function thumb(id, size = 44) {
  const cv = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  const n = Math.round(size * dpr);
  cv.width = cv.height = n;
  cv.className = 'scene-thumb';
  cv.setAttribute('aria-hidden', 'true');
  // Drawn as the rest screen would show it (390 x 348 CSS px), then cropped to its middle.
  const big = document.createElement('canvas');
  big.width = 390; big.height = 348;
  drawFrame(big.getContext('2d'), id, 390, 348, 2.6, { dpr: 1, breath: { s: 240, top: 92 } });
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = true;
  const side = id === 'breathing' ? 240 : 300;
  const sy = id === 'breathing' ? 92 : 348 - side;
  c.drawImage(big, (390 - side) / 2, sy, side, side, 0, 0, n, n);
  return cv;
}
