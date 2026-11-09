// Starts the app and shows the right screen for the address (#/...).
import { loadData } from './data.js';
import { keepData } from './store.js';
import { hideToast, showToast } from './ui.js';
import * as backup from './backup.js';
import * as audio from './audio.js';
import * as home from './screens/home.js';
import * as details from './screens/details.js';
import * as info from './screens/info.js';
import * as player from './screens/player.js';
import * as summary from './screens/summary.js';
import * as settings from './screens/settings.js';
import * as feedback from './screens/feedback.js';
import * as cueLog from './screens/cuelog.js';
import * as fb from './feedback.js';

const app = document.getElementById('app');
const updateBar = document.getElementById('update');
let waitingSW = null; // a new version that's installed and waiting (see Updates below)

// Screens get added here as each build step lands.
const routes = [
  { re: /^#?\/?$/, show: () => home.render(app) },
  { re: /^#\/workout\/(\d+)$/, show: m => details.render(app, +m[1]) },
  { re: /^#\/workout\/(\d+)\/move\/(\w+\.\d+)$/, show: m => info.render(app, +m[1], m[2]) },
  { re: /^#\/play\/(\d+)$/, show: m => player.render(app, +m[1]) },
  { re: /^#\/summary$/, show: () => summary.render(app) },
  { re: /^#\/settings$/, show: () => settings.render(app) },
  { re: /^#\/settings\/voice$/, show: () => settings.renderVoice(app) },
  { re: /^#\/settings\/sound-effects$/, show: () => settings.renderSfx(app) },
  { re: /^#\/settings\/feedback$/, show: () => feedback.render(app, workoutNow) },
  { re: /^#\/settings\/cue-log$/, show: () => cueLog.render(app) },
];

let prevHash = '#/';
let settingsFrom = '#/'; // where Settings was opened from
let workoutNow = null;   // the paused workout, when Settings was opened from the player
const inSettings = h => h.startsWith('#/settings');
function route() {
  hideToast();
  // Settings' back arrow returns to wherever Settings was opened from.
  if (inSettings(location.hash) && !inSettings(prevHash)) {
    // From the player, Feedback carries the workout (Settings paused it first).
    workoutNow = prevHash.startsWith('#/play/') ? player.snapshot() : null;
    // A player address with no workout in it (one already finished or ended,
    // reached with the phone's back button) goes back to Home instead.
    settingsFrom = prevHash.startsWith('#/play/') && !workoutNow ? '#/' : prevHash || '#/';
    settings.setBack(settingsFrom);
  }
  prevHash = location.hash;
  if (!location.hash.startsWith('#/play/')) player.leave();
  showUpdateBar();
  let m = null;
  const r = routes.find(x => (m = location.hash.match(x.re))) || routes[0];
  window.scrollTo(0, 0);
  r.show(m);
}

backup.pruneUndo(); // an Undo restore snapshot lasts 7 days
keepData(); // ask the browser to keep progress and settings (see store.js)
await Promise.all([loadData(), audio.init()]);
addEventListener('hashchange', route);
route();
const flash = backup.takeFlash(); // e.g. "Backup restored" after a restore
if (flash) showToast(`<p>${flash}</p>`);

// Feedback (F15): send any notes still queued when the app opens and when
// the phone gets signal back. Never during a workout (the Feedback page
// retries too when it opens).
const retryFeedback = () => { if (!midWorkout()) fb.retryQueued(); };
retryFeedback();
addEventListener('online', retryFeedback);

// ---- Updates ----
// A new release installs in the background and waits (see sw.js). When one is
// waiting, the bar at the bottom offers it (Q07). It stays hidden on player
// screens, and in Settings opened from a paused workout, because updating
// reloads the app and would end the workout. It shows on the next other screen.
function midWorkout() {
  const h = location.hash;
  return h.startsWith('#/play/') || (inSettings(h) && settingsFrom.startsWith('#/play/'));
}
function showUpdateBar() {
  updateBar.hidden = !waitingSW || midWorkout();
  document.body.classList.toggle('has-update', !updateBar.hidden); // push the page below the bar
}

updateBar.addEventListener('click', () => {
  if (!waitingSW) return;
  updateBar.hidden = true;
  document.body.classList.remove('has-update');
  waitingSW.postMessage('skip-waiting'); // the reload follows on controllerchange
});

function watchForUpdates(reg) {
  const found = sw => { waitingSW = sw; showUpdateBar(); };
  // Only offer an update when this page is already run by an older version
  // (on the very first install there's nothing to update from).
  if (reg.waiting && navigator.serviceWorker.controller) found(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const sw = reg.installing;
    sw?.addEventListener('statechange', () => {
      if (sw.state === 'installed' && navigator.serviceWorker.controller) found(sw);
    });
  });
  // The phone checks on each start; also check when you come back to the app.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });
}

// Keep the app (and every voice) on the phone so it works offline.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A new version took over: reload once so every file comes from it.
    // (Not on the very first install, when there was nothing to replace.)
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  // updateViaCache 'none': each check fetches sw.js and js/version.js fresh,
  // so a bumped version is seen straight away.
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(async reg => {
    watchForUpdates(reg);
    const ready = await navigator.serviceWorker.ready;
    ready.active?.postMessage('save-voices'); // picks up any newly added voice
  }).catch(() => { /* not available, e.g. not on https */ });
}
