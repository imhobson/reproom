// Keep a workout running with the phone locked in a pocket (F11 pocket test).
//
// The 9 Nov pocket test (V1.7.2) failed: with the screen off, Chrome let the
// page run for about 4½ minutes, then froze it until the phone was unlocked,
// so cues stopped and the workout ran 7 minutes long. A page that's playing
// sound isn't frozen, so while a workout runs we play a sound you can't hear.
//
// Two ways, picked on the Cue log screen while the cue log is on (default:
// webaudio, since the V1.7.3 phone test):
//   media    – a looping <audio> element. Also gives the lock screen and
//              headphone controls (Media Session, see player.js). Phone test:
//              Spotify stayed dipped for the whole workout, so not the default.
//   webaudio – a Web Audio tone. No lock-screen controls, but Web Audio
//              doesn't take Android's audio focus, so Spotify is left alone.
//   off      – nothing (as V1.7.2).
//
// The sound is a 25 Hz sine at −60 dB: below what ears hear at that level and
// below what phone speakers play, but not digital silence (Chrome only counts
// a page as playing audio when the signal is above about −72 dB).
import * as audio from './audio.js';
import * as cuelog from './cuelog.js';

const KEY = 'reproom.keepAlive';
export const MODES = [
  { id: 'webaudio', label: 'Web Audio', desc: 'Spotify only dips for the voice. No lock-screen controls.' },
  { id: 'media', label: 'Audio element', desc: 'Lock-screen controls, but Spotify stays dipped all workout.' },
  { id: 'off', label: 'Off', desc: 'Nothing keeps the page awake (as V1.7.2).' },
];

export function mode() {
  try { const m = localStorage.getItem(KEY); if (MODES.some(x => x.id === m)) return m; } catch (e) { /* ignore */ }
  return 'webaudio';
}
export function setMode(m) {
  stop();
  try { localStorage.setItem(KEY, m); } catch (e) { /* ignore */ }
}

const HZ = 25, RATE = 8000, SECS = 2, AMP = 0.001; // −60 dBFS

// A 2s mono 16-bit WAV of the tone (50 whole cycles, so it loops cleanly).
let url = null;
function toneUrl() {
  if (url) return url;
  const n = RATE * SECS;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * HZ * i / RATE) * AMP * 32767), true);
  return (url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
}

let el = null;    // media: the looping element
let hum = null;   // webaudio: { osc, gain }
let active = null; // the mode running now

export const element = () => el;

// Start, or carry on after a pause.
export function start() {
  const m = mode();
  if (active && active !== m) stop();
  active = m;
  if (m === 'media') {
    if (!el) {
      el = new Audio(toneUrl());
      el.loop = true;
      el.onerror = () => cuelog.note('keep', 'Audio element error');
    }
    if (el.paused) el.play().then(() => cuelog.note('keep', 'Audio element playing'))
      .catch(err => cuelog.note('keep', `Audio element blocked: ${err.name}`));
  } else if (m === 'webaudio') {
    const ctx = audio.context();
    if (!ctx) { cuelog.note('keep', 'Web Audio: no audio yet'); return; }
    if (!hum) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = HZ;
      gain.gain.value = AMP;
      osc.connect(gain).connect(ctx.destination); // not the effects bus: volume and mute don't touch it
      osc.start();
      hum = { osc, gain };
      cuelog.note('keep', 'Web Audio tone on');
    }
  }
}

// Paused: the element pauses too, so the lock screen shows Play. (The Web
// Audio tone stops with the rest of the sound: audio.pause suspends it.)
export function pause() {
  if (el && !el.paused) el.pause();
}

// The workout is over.
export function stop() {
  if (el) { el.onerror = null; el.pause(); el.removeAttribute('src'); el.load(); el = null; }
  if (hum) { try { hum.osc.stop(); hum.gain.disconnect(); } catch (e) { /* already stopped */ } hum = null; }
  active = null;
}
