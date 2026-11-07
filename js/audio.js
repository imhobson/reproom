// All of RepRoom's sound lives here: the sound effects (made in code with
// Web Audio, no files) and the voice (recorded clips, or the phone's voice).
// Kept in one module so it can be swapped for a native version later
// (e.g. one that lowers Spotify instead of pausing it).
import * as store from './store.js';
import * as data from './data.js';
import * as sounds from './sounds.js';

let ctx = null;          // Web Audio context, made on the first tap
let muted = false;       // the player's quick mute
let voices = [];         // from audio/voices.json
const clipLists = {};    // voice id -> its voice.json clips
let clip = null;         // the voice clip playing now

let fxBus = null;        // master gain for every sound effect (Effects volume)

const settings = () => store.get().settings;
const soundOn = () => settings().allSounds && !muted;
const effectsOn = () => soundOn() && settings().sfx !== 'off';

// Volume sliders (0–100) to loudness (0–1). Squared, so the slider feels even
// to the ear: at 50 it sounds about half as loud, not barely quieter.
const level = pct => Math.pow(Math.max(0, Math.min(100, pct)) / 100, 2);
const voiceLevel = () => level(settings().voiceVol ?? 100);
const fxLevel = () => level(settings().fxVol ?? 100);

// Called when the Effects volume slider moves.
export function setFxVolume() { if (fxBus) fxBus.gain.setValueAtTime(fxLevel(), ctx.currentTime); }

// ---- Setup ----

export async function init() {
  try { voices = await fetch('audio/voices.json').then(r => r.json()); } catch (e) { voices = []; }
}
export const voiceList = () => voices;

// Call from a tap (e.g. LET'S GO) so the phone allows sound.
export function unlock() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    fxBus = ctx.createGain();
    fxBus.gain.value = fxLevel();
    fxBus.connect(ctx.destination);
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

function fx(play, at = 0) {
  if (!ctx || !effectsOn()) return;
  play(ctx, at, fxBus);
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

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const all = speechSynthesis.getVoices();
  const v = all.find(x => x.lang === 'en-GB') || all.find(x => x.lang.startsWith('en'));
  if (v) u.voice = v;
  u.lang = v ? v.lang : 'en-GB';
  u.volume = voiceLevel();
  speechSynthesis.speak(u);
}

function phoneText(step) {
  const m = data.move(step.move);
  const base = m ? m.voice.nameOnly : step.move;
  return step.side ? `${base} ${step.side === 'left' ? 'Left' : 'Right'} side.` : base;
}

// Read out a move, once, as its preview starts.
export async function sayMove(step) {
  stopVoice();
  const v = settings().voice;
  if (!soundOn() || v === 'off') return;
  if (v === 'phone') { speak(phoneText(step)); return; }
  const clips = await clipsFor(v);
  const name = clipName(step);
  if (!clips[name]) { speak(phoneText(step)); return; } // missing clip: phone voice
  const a = new Audio(`audio/${v}/${name}.mp3`);
  a.volume = voiceLevel();
  clip = a;
  a.onended = () => { if (clip === a) clip = null; };
  a.play().catch(() => { if (clip === a) { clip = null; speak(phoneText(step)); } });
}

// Load a workout's clips ahead so they start on time.
export async function preload(steps) {
  const v = settings().voice;
  if (v === 'off' || v === 'phone') return;
  const clips = await clipsFor(v);
  for (const s of steps) {
    if (s.type !== 'move') continue;
    const n = clipName(s);
    if (clips[n]) { const a = new Audio(); a.preload = 'auto'; a.src = `audio/${v}/${n}.mp3`; }
  }
}
