// Every RepRoom sound effect, made in code with Web Audio (no files).
// Each sound is one small function: (ctx, at, dest) plays it `at` seconds from
// now into `dest` (the effects bus, so Effects volume applies).
// To add a sound: write a function below and add it to TICKS or CHIMES.
// Peaks are kept well under 1 so nothing clips at 100% volume.

// ---- Building blocks ----

// One oscillator with a fast attack and an exponential fade.
function tone(ctx, dest, { freq, freqEnd = freq, glide, type = 'sine', dur, vol = 0.5, at = 0, attack = 0.004 }) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd !== freq) o.frequency.exponentialRampToValueAtTime(freqEnd, t + (glide ?? dur));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
  return o;
}

// A burst of white noise through a filter.
let noiseBuf = null;
function noise(ctx, dest, { dur, vol, at = 0, filter = 'lowpass', freq = 2000, q = 0.7, attack = 0.001 }) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); // 1s, reused
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = filter; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t);
  src.stop(t + dur + 0.02);
}

// ---- Ticks ----

// Classic (V1, unchanged): short square click, about 1 kHz, 0.04s.
function classicTick(ctx, at, dest) {
  tone(ctx, dest, { freq: 1000, type: 'square', dur: 0.04, vol: 0.18, at });
}

// Wood block: triangle dropping 1000 -> 750 Hz over 40ms, fast decay, with a
// tiny band-passed noise click on top for the attack.
function woodBlock(ctx, at, dest) {
  tone(ctx, dest, { freq: 1000, freqEnd: 750, glide: 0.04, type: 'triangle', dur: 0.07, vol: 0.4, at, attack: 0.002 });
  noise(ctx, dest, { dur: 0.005, vol: 0.25, at, filter: 'bandpass', freq: 3000, q: 1.2 });
}

// Soft click: 25ms of noise through a low-pass around 2 kHz. Quieter than Classic.
function softClick(ctx, at, dest) {
  noise(ctx, dest, { dur: 0.025, vol: 0.22, at, filter: 'lowpass', freq: 2000, q: 0.7 });
}

// Digital: a sports-watch beep. Square 1500 Hz, 50ms, 3ms fade in and out.
function digital(ctx, at, dest) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = 1500;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.1, t + 0.003);
  g.gain.setValueAtTime(0.1, t + 0.047);
  g.gain.linearRampToValueAtTime(0, t + 0.05);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.06);
}

// ---- Chimes ----

// Classic (V1, unchanged): bright, about 2 kHz, 0.2s.
function classicChime(ctx, at, dest) {
  tone(ctx, dest, { freq: 2000, dur: 0.2, vol: 0.35, at });
  tone(ctx, dest, { freq: 3000, dur: 0.15, vol: 0.12, at });
}

// Bell: 880 Hz with partials at 2.76x and 5.4x, ringing out over about 1.2s.
function bell(ctx, at, dest) {
  tone(ctx, dest, { freq: 880, dur: 1.2, vol: 0.3, at, attack: 0.003 });
  tone(ctx, dest, { freq: 880 * 2.76, dur: 0.8, vol: 0.12, at, attack: 0.003 });
  tone(ctx, dest, { freq: 880 * 5.4, dur: 0.45, vol: 0.05, at, attack: 0.003 });
}

// Level up: two quick rising notes (C6 then G6); the second rings out.
function levelUp(ctx, at, dest) {
  tone(ctx, dest, { freq: 1047, dur: 0.12, vol: 0.25, at, attack: 0.005 });
  tone(ctx, dest, { freq: 2094, dur: 0.1, vol: 0.04, at, attack: 0.005 });
  tone(ctx, dest, { freq: 1568, dur: 0.52, vol: 0.27, at: at + 0.12, attack: 0.005 });
  tone(ctx, dest, { freq: 3136, dur: 0.3, vol: 0.04, at: at + 0.12, attack: 0.005 });
}

// Whistle: a coach's whistle. Sine around 2100 Hz with a fast 30 Hz warble,
// 0.4s, plus a little band-passed breath noise.
function whistle(ctx, at, dest) {
  const t = ctx.currentTime + at;
  const dur = 0.4;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = 2100;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 30;
  const depth = ctx.createGain();
  depth.gain.value = 45; // +/- 45 Hz
  lfo.connect(depth).connect(o.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.015);
  g.gain.setValueAtTime(0.2, t + dur - 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t); lfo.start(t);
  o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
  noise(ctx, dest, { dur, vol: 0.05, at, filter: 'bandpass', freq: 2100, q: 2, attack: 0.015 });
}

// ---- GO (unchanged from V1; not choosable) ----

export function go(ctx, at, dest) {
  tone(ctx, dest, { freq: 180, freqEnd: 120, type: 'triangle', dur: 0.7, vol: 0.7, at, attack: 0.01 });
  tone(ctx, dest, { freq: 360, freqEnd: 240, dur: 0.35, vol: 0.15, at });
}

// ---- The lists in Settings > Sound effects ----
// `secs` is roughly how long the sound lasts (for the sample's progress bar).

export const TICKS = [
  { id: 'classic', label: 'Classic', desc: 'Crisp, about 1 kHz', play: classicTick },
  { id: 'wood', label: 'Wood block', desc: 'Hollow knock', play: woodBlock },
  { id: 'soft', label: 'Soft click', desc: 'Quiet and muffled', play: softClick },
  { id: 'digital', label: 'Digital', desc: 'Sports-watch beep', play: digital },
];

export const CHIMES = [
  { id: 'classic', label: 'Classic', desc: 'Short and bright', play: classicChime, secs: 0.2 },
  { id: 'bell', label: 'Bell', desc: 'Rings out', play: bell, secs: 1.2 },
  { id: 'levelup', label: 'Level up', desc: 'Two rising notes', play: levelUp, secs: 0.64 },
  { id: 'whistle', label: 'Whistle', desc: "Coach's whistle", play: whistle, secs: 0.4 },
];

export const tickById = id => TICKS.find(s => s.id === id) || TICKS[0];
export const chimeById = id => CHIMES.find(s => s.id === id) || CHIMES[0];
