// All of RepRoom's sound lives here: the sound effects (made in code with
// Web Audio, no files) and the voice (recorded clips, or the phone's voice).
// Kept in one module so it can be swapped for a native version later
// (e.g. one that lowers Spotify instead of pausing it).
import * as store from './store.js';
import * as data from './data.js';
import * as sounds from './sounds.js';
import * as cuelog from './cuelog.js';
import { FX_GAIN } from './config.js';

let ctx = null;          // Web Audio context, made on the first tap
let muted = false;       // the player's quick mute
let voices = [];         // from audio/voices.json
const clipLists = {};    // voice id -> its voice.json clips
let clip = null;         // the voice clip playing now

let fxBus = null;        // master gain for every sound effect (Effects volume x FX_GAIN),
                         // into a limiter so the loudest effects don't clip

const settings = () => store.get().settings;
const soundOn = () => settings().allSounds && !muted;
const effectsOn = () => soundOn() && settings().sfx !== 'off';

// Volume sliders (0–100) to loudness (0–1). Squared, so the slider feels even
// to the ear: at 50 it sounds about half as loud, not barely quieter.
const level = pct => Math.pow(Math.max(0, Math.min(100, pct)) / 100, 2);
const voiceLevel = () => level(settings().voiceVol ?? 100);
const fxLevel = () => level(settings().fxVol ?? 100);

const fxGain = () => fxLevel() * FX_GAIN; // effects boost (Q11): see config.js

// Called when the Effects volume slider moves.
export function setFxVolume() { if (fxBus) fxBus.gain.setValueAtTime(fxGain(), ctx.currentTime); }

// ---- Setup ----

export async function init() {
  try { voices = await fetch('audio/voices.json').then(r => r.json()); } catch (e) { voices = []; }
}
export const voiceList = () => voices;
export const context = () => ctx; // for the pocket keep-alive tone (keepalive.js)

// Call from a tap (e.g. LET'S GO) so the phone allows sound.
export function unlock() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    fxBus = ctx.createGain();
    fxBus.gain.value = fxGain();
    // A limiter on the effects only (Q11): with FX_GAIN the loudest ones (GO,
    // the chimes) would go over full scale and crackle. The voice and the
    // keep-alive tone go straight to the speaker, not through it.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    fxBus.connect(limiter).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (m) stopVoice();
}

// Pause freezes everything (scheduled sounds wait); resume carries on.
// A voice clip that was cut off by pause is not replayed.
export function pause() {
  if (ctx && ctx.state === 'running') ctx.suspend();
  stopVoice();
}
export function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
export function stopAll() { stopVoice(); }

// ---- Sound effects (see docs/RepRoom-audio-spec.txt and js/sounds.js) ----
// The tick and the chime are chosen in Settings > Sound effects; GO is fixed.

const myTick = () => sounds.tickById(settings().tick);
const myChime = () => sounds.chimeById(settings().chime);

// Returns why a sound didn't play (for the cue log): 'off', 'no audio', or
// the audio context's state when it isn't running; null when it played.
function fx(play, at = 0) {
  if (!ctx) return 'no audio';
  if (!effectsOn()) return 'off';
  play(ctx, at, fxBus);
  return ctx.state === 'running' ? null : ctx.state;
}
export const tick = () => fx(myTick().play);
export const go = () => fx(sounds.go);
export const chime = (after = 0) => fx(myChime().play, after);

// ---- Samples for the pickers (play even when sounds are off: you asked) ----
// Each returns { stop }, and calls onProgress(0..1) then onEnd().

let sample = null;
export function stopSample() { if (sample) { sample.stop(); sample = null; } }

function progressLoop(secs, onProgress, onEnd) {
  const t0 = performance.now();
  const id = setInterval(() => {
    const f = (performance.now() - t0) / 1000 / secs;
    if (f >= 1) { clearInterval(id); onProgress(1); onEnd(); } else onProgress(f);
  }, 50);
  return () => clearInterval(id);
}

// The end-of-move cue with one choice swapped in: three ticks 1s apart, then
// the chime 1.1s after the last tick (as in a workout). kind is 'tick' or
// 'chime'; the other half stays as the current pick.
export function sampleCue(kind, id, onProgress, onEnd) {
  stopSample();
  unlock();
  const t = kind === 'tick' ? sounds.tickById(id) : myTick();
  const c = kind === 'chime' ? sounds.chimeById(id) : myChime();
  const bus = ctx.createGain();
  bus.connect(fxBus);
  [0, 1, 2].forEach(at => t.play(ctx, at, bus));
  c.play(ctx, 3.1, bus);
  const stopLoop = progressLoop(3.1 + c.secs + 0.1, onProgress, () => { sample = null; onEnd(); });
  sample = { stop: () => { stopLoop(); bus.disconnect(); } };
}

// Played when you let go of a volume slider, at the new level.
// Effects: one tick then the chime. Voice: "Push-ups" in the chosen voice.
export function sampleFxVolume() {
  stopSample();
  unlock();
  setFxVolume();
  const bus = ctx.createGain();
  bus.connect(fxBus);
  myTick().play(ctx, 0, bus);
  myChime().play(ctx, 0.5, bus);
  sample = { stop: () => bus.disconnect() };
}

export async function sampleVoiceVolume() {
  stopSample();
  unlock();
  const v = settings().voice;
  if (v === 'off') return;
  const clips = v === 'phone' ? {} : await clipsFor(v);
  if (!clips['push-ups']) { speak(data.move('push-ups').voice.nameOnly); sample = { stop: () => speechSynthesis.cancel() }; return; }
  const a = new Audio(`audio/${v}/push-ups.mp3`);
  a.volume = voiceLevel();
  a.play().catch(() => {});
  sample = { stop: () => a.pause() };
}

const SAMPLE_MOVE = 'kneeling-push-ups';

export async function sampleVoice(voiceId, onProgress, onEnd) {
  stopSample();
  unlock();
  const done = () => { sample = null; onEnd(); };
  if (voiceId === 'phone') {
    speak(data.move(SAMPLE_MOVE).voice.nameOnly);
    const stopLoop = progressLoop(1.8, onProgress, done);
    sample = { stop: () => { stopLoop(); speechSynthesis.cancel(); } };
    return;
  }
  const clips = await clipsFor(voiceId);
  const name = clips[SAMPLE_MOVE] ? SAMPLE_MOVE : Object.keys(clips)[0];
  if (!name) { done(); return; }
  const a = new Audio(`audio/${voiceId}/${name}.mp3`);
  a.volume = voiceLevel();
  a.ontimeupdate = () => a.duration && onProgress(a.currentTime / a.duration);
  a.onended = () => { onProgress(1); done(); };
  a.play().catch(done);
  sample = { stop: () => { a.pause(); } };
}

// ---- Voice ----

function stopVoice() {
  voiceSeq++; // a sayMove or sayPhrase still loading its clip won't start it
  if (clip) { clip.pause(); clip = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

// File name of a move's clip: <move id>.mp3, or <move id>--left/--right.mp3.
// When "Name + how-to" audio exists it will be <move id>--howto.mp3.
function clipName(step) {
  if (settings().reads === 'nameHowTo') return `${step.move}--howto`;
  return step.side ? `${step.move}--${step.side}` : step.move;
}

async function clipsFor(voiceId) {
  if (!(voiceId in clipLists)) {
    try { clipLists[voiceId] = (await fetch(`audio/${voiceId}/voice.json`).then(r => r.json())).clips; }
    catch (e) { clipLists[voiceId] = {}; }
  }
  return clipLists[voiceId];
}

function speak(text, logEntry = null) {
  if (!('speechSynthesis' in window)) { cuelog.skipped(logEntry, 'no phone voice'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const all = speechSynthesis.getVoices();
  const v = all.find(x => x.lang === 'en-GB') || all.find(x => x.lang.startsWith('en'));
  if (v) u.voice = v;
  u.lang = v ? v.lang : 'en-GB';
  u.volume = voiceLevel();
  if (logEntry) u.onstart = () => cuelog.started(logEntry, 'phone voice');
  speechSynthesis.speak(u);
}

function phoneText(step) {
  const m = data.move(step.move);
  const base = m ? m.voice.nameOnly : step.move;
  return step.side ? `${base} ${step.side === 'left' ? 'Left' : 'Right'} side.` : base;
}

// Voice clips decoded for Web Audio, for when the screen is off (see sayMove).
// "<voice>/<clip>" -> Promise<AudioBuffer>
const buffers = new Map();
function bufferFor(v, name) {
  const k = `${v}/${name}`;
  if (!buffers.has(k)) {
    const p = fetch(`audio/${k}.mp3`).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b));
    p.catch(() => buffers.delete(k)); // try again next time
    buffers.set(k, p);
  }
  return buffers.get(k);
}

// Play a decoded clip through Web Audio, straight to the speaker (not the
// effects bus), at the voice volume. Returns a handle stopVoice can pause.
function playBuffer(buf, logEntry) {
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  src.buffer = buf;
  g.gain.value = voiceLevel();
  src.connect(g).connect(ctx.destination);
  const h = { pause: () => { try { src.stop(); } catch (e) { /* not started */ } } };
  src.onended = () => { if (clip === h) clip = null; };
  src.start();
  cuelog.started(logEntry, ctx.state === 'running' ? 'clip via Web Audio' : `clip via Web Audio (audio ${ctx.state})`);
  return h;
}

let voiceSeq = 0; // each sayMove / sayPhrase gets a number, so a slow one can't talk over a newer one

// Read out a move, once, as its preview starts. logEntry (cue log, when it's
// on) gets the moment the voice really starts.
//
// With the screen off (phone locked in a pocket), Chrome lets an <audio>
// element "play" without a sound reaching the speaker, while Web Audio keeps
// sounding (pocket test, 9 Nov). So then the clip goes through Web Audio.
// With the screen on it stays an <audio> element, which makes Spotify dip
// under the voice.
export async function sayMove(step, logEntry = null) {
  stopVoice();
  const seq = ++voiceSeq;
  const v = settings().voice;
  if (!soundOn() || v === 'off') { cuelog.skipped(logEntry, 'voice off'); return; }
  if (v === 'phone') { speak(phoneText(step), logEntry); return; }
  const clips = await clipsFor(v);
  const name = clipName(step);
  if (!clips[name]) { speak(phoneText(step), logEntry); return; } // missing clip: phone voice
  playClip(v, name, phoneText(step), logEntry, seq);
}

// A short phrase in the chosen voice (Q11): audio/<voice>/phrase--<id>.mp3,
// e.g. sayPhrase('rest', 'Rest.'). Played like sayMove (screen on: <audio>;
// screen off: Web Audio; a newer cue wins). The phone voice reads text with
// Phone voice picked or no such clip in the voice. Off when the voice is off
// or muted.
export async function sayPhrase(id, text, logEntry = null) {
  stopVoice();
  const seq = ++voiceSeq;
  const v = settings().voice;
  if (!soundOn() || v === 'off') { cuelog.skipped(logEntry, 'voice off'); return; }
  if (v === 'phone') { speak(text, logEntry); return; }
  const clips = await clipsFor(v);
  if (seq !== voiceSeq) return;
  const name = `phrase--${id}`;
  if (!clips[name]) { speak(text, logEntry); return; } // missing clip: phone voice
  playClip(v, name, text, logEntry, seq);
}

// Play one recorded clip of voice v, unless a newer cue (seq) came first.
// fallback is what the phone voice says if the clip won't play.
async function playClip(v, name, fallback, logEntry, seq) {
  if (document.visibilityState === 'hidden' && ctx) {
    try {
      const buf = await bufferFor(v, name);
      if (seq !== voiceSeq) return; // a newer cue (or a stop) came first
      clip = playBuffer(buf, logEntry);
      return;
    } catch (e) { /* fall back to the element */ }
  }
  if (seq !== voiceSeq) return;
  const a = new Audio(`audio/${v}/${name}.mp3`);
  a.volume = voiceLevel();
  clip = a;
  a.onended = () => { if (clip === a) clip = null; };
  if (logEntry) a.addEventListener('playing', () => cuelog.started(logEntry, 'clip'), { once: true });
  a.play().catch(() => { if (clip === a) { clip = null; speak(fallback, logEntry); } });
}

// Just a few words in the phone voice, for anything with no recorded clip
// (e.g. "Left side."; Rest, Walk back and Right side use sayPhrase). Off when
// the voice is off.
export function sayText(text, logEntry = null) {
  stopVoice();
  if (!soundOn() || settings().voice === 'off') { cuelog.skipped(logEntry, 'voice off'); return; }
  speak(text, logEntry);
}

// ---- Launch sound (I08) ----
// The braam sting (sounds.js LAUNCH) through the effects, then "Let's do
// this, Michael." in the chosen voice on the ring (phrase--launch). Played
// with no tap: Chrome allows sound straight away for an app added to the home
// screen. If the phone still holds sound back, it stays quiet (null) rather
// than going off later at an odd moment.
// Resolves to { voiceAt, lineSecs, voice } (voice: whether the line plays), or null.
export const LAUNCH_TEXT = "Let's do this, Michael.";
export async function launch() {
  if (!soundOn()) return null;
  unlock();
  for (let i = 0; i < 8 && ctx.state !== 'running'; i++) await new Promise(r => setTimeout(r, 50));
  if (ctx.state !== 'running') return null;
  const v = settings().voice;
  const withVoice = v !== 'off';
  const withFx = effectsOn();
  if (!withVoice && !withFx) return null;
  if (withFx) sounds.LAUNCH.play(ctx, 0, fxBus);
  const voiceAt = withFx ? sounds.LAUNCH.voiceAt : 0.3;
  let lineSecs = 1.5;
  if (withVoice && v !== 'phone') {
    const clips = await clipsFor(v);
    lineSecs = clips['phrase--launch']?.secs ?? lineSecs;
    // load it ahead so it starts on the ring, not late
    const a = new Audio(); a.preload = 'auto'; a.src = `audio/${v}/phrase--launch.mp3`;
  }
  if (withVoice) setTimeout(() => sayPhrase('launch', LAUNCH_TEXT), voiceAt * 1000);
  return { voiceAt, lineSecs, voice: withVoice };
}

// Load a workout's clips ahead so they start on time, and the phrase clips
// (Q11), so the first "Rest." isn't late.
const PHRASES = ['rest', 'walk-back', 'right-side'];
export async function preload(steps) {
  const v = settings().voice;
  if (v === 'off' || v === 'phone') return;
  const clips = await clipsFor(v);
  const names = steps.filter(s => s.type === 'move' || s.preview).map(clipName) // moves, and the first weight set
    .concat(PHRASES.map(id => `phrase--${id}`));
  for (const n of names) {
    if (!clips[n]) continue;
    const a = new Audio(); a.preload = 'auto'; a.src = `audio/${v}/${n}.mp3`;
    if (ctx) bufferFor(v, n).catch(() => {}); // decoded too, for the screen-off voice
  }
}
