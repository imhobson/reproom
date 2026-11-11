// Starts the app and shows the right screen for the address (#/...).
import { loadData } from './data.js';
import { keepData, onSaved } from './store.js';
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
import * as run from './screens/run.js';
import * as fb from './feedback.js';
import * as autobackup from './autobackup.js';
import * as progress from './screens/progress.js';
import { go } from './ui.js';
import * as nav from './nav.js';

const app = document.getElementById('app');
const updateBar = document.getElementById('update');
let waitingSW = null; // a new version that's installed and waiting (see Updates below)

// Screens get added here as each build step lands.
const routes = [
  { re: /^#?\/?$/, show: () => home.render(app) },
  { re: /^#\/workout\/(\d+)$/, show: m => details.render(app, +m[1]) },
  { re: /^#\/workout\/(\d+)\/move\/(\w+\.\d+)$/, show: m => info.render(app, +m[1], m[2]) },
  // A workout plays at #/play/<day>, a run routine at #/play/<routine id> (F11).
  { re: /^#\/play\/(\d+|run-[\w-]+)$/, show: m => player.render(app, /^\d+$/.test(m[1]) ? +m[1] : m[1]) },
  { re: /^#\/summary$/, show: () => summary.render(app) },
  { re: /^#\/stage-complete$/, show: () => summary.renderStage(app) },
  { re: /^#\/run$/, show: () => run.render(app) },
  { re: /^#\/run\/(run-[\w-]+)$/, show: m => details.renderRoutine(app, m[1]) },
  { re: /^#\/run\/(run-[\w-]+)\/move\/(\w+\.\d+)$/, show: m => info.render(app, m[1], m[2]) },
  { re: /^#\/progress$/, show: () => progress.render(app) },
  { re: /^#\/progress\/wall$/, show: () => progress.renderWall(app) },
  { re: /^#\/move\/([\w-]+)$/, show: m => info.renderMove(app, m[1]) },
  { re: /^#\/settings$/, show: () => settings.render(app) },
  { re: /^#\/settings\/voice$/, show: () => settings.renderVoice(app) },
  { re: /^#\/settings\/sound-effects$/, show: () => settings.renderSfx(app) },
  { re: /^#\/settings\/feedback$/, show: () => feedback.render(app, workoutNow) },
  { re: /^#\/settings\/cue-log$/, show: () => cueLog.render(app) },
];

let prevHash = '#/';
let settingsFrom = '#/'; // where Settings was opened from
let progressFrom = '#/'; // where Progress was opened from (F14)
let workoutNow = null;   // the paused workout, when Settings was opened from the player
const inSettings = h => h.startsWith('#/settings');
// Progress, the Wall and a move opened from Top moves (F14).
const inProgress = h => h.startsWith('#/progress') || h.startsWith('#/move/');
let shown = null; // the address the screen on show was drawn for
function route() {
  if (nav.isLeaving()) return; // stepping over old entries to close the app (nav.js)
  // Already drawn: nav.js draws a screen early when back comes before its
  // hashchange (a tap then back straight away), so the event then has nothing to do.
  if (location.hash === shown) return;
  shown = location.hash;
  const leftPlayer = prevHash.startsWith('#/play/') && !location.hash.startsWith('#/play/');
  hideToast();
  // Progress's back arrow returns to wherever Progress was opened from (a
  // paused workout too). Coming back from Settings keeps it.
  if (inProgress(location.hash) && !inProgress(prevHash) && !inSettings(prevHash)) {
    progressFrom = prevHash.startsWith('#/play/') && !player.snapshot() ? '#/' : prevHash || '#/';
    progress.setBack(progressFrom);
  }
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
  // The phone's back button (B04): the player has its own watcher (B02),
  // every other screen uses nav's. Never both at once.
  if (location.hash.startsWith('#/play/')) nav.disarm();
  else { player.leave(); nav.arm(); }
  nav.setBack(null); // a screen with its own back rule sets it as it draws
  showUpdateBar();
  let m = null;
  const r = routes.find(x => (m = location.hash.match(x.re))) || routes[0];
  window.scrollTo(0, 0);
  r.show(m);
  // Auto backup (F16): a save made in the player is sent once the player
  // closes (the summary, Home, Run); a pending one is retried when Settings
  // opens (back from Feedback too, once the key is connected).
  if (leftPlayer || location.hash === '#/settings') autobackup.retry();
}

// Auto backup (F16): every save that counts marks a backup pending and tries
// to send it. Never while the player is open.
autobackup.setBlocked(() => midWorkout());
onSaved(autobackup.saved);

backup.pruneUndo(); // an Undo restore snapshot lasts 7 days
keepData(); // ask the browser to keep progress and settings (see store.js)
await Promise.all([loadData(), audio.init()]);
addEventListener('hashchange', route);
nav.setRouter(route);
route();
const flash = backup.takeFlash(); // e.g. "Backup restored" after a restore
if (flash) showToast(`<p>${flash}</p>`);

// Feedback (F15): send any notes still queued when the app opens and when
// the phone gets signal back. Never during a workout (the Feedback page
// retries too when it opens).
const retryFeedback = () => { if (!midWorkout()) fb.retryQueued(); };
retryFeedback();
addEventListener('online', retryFeedback);

// Auto backup (F16): retry a pending backup on start (after Restore or Undo
// restore too), when the phone gets signal back, and when the app comes back
// to the front. autobackup.retry() itself waits while the player is open.
autobackup.retry();
addEventListener('online', () => autobackup.retry());
addEventListener('offline', autobackup.refresh); // Settings: "Waiting for signal"
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') autobackup.retry();
});

// ---- Updates ----
// A new release installs in the background and waits (see sw.js). When one is
// waiting, the bar at the bottom offers it (Q07). It stays hidden on player
// screens, and in Settings opened from a paused workout, because updating
// reloads the app and would end the workout. It shows on the next other screen.
function midWorkout() {
  const h = location.hash;
  const fromPlay = from => from.startsWith('#/play/') || (inProgress(from) && progressFrom.startsWith('#/play/'));
  return h.startsWith('#/play/') || (inSettings(h) && fromPlay(settingsFrom)) || (inProgress(h) && progressFrom.startsWith('#/play/'));
}

// Every Progress icon opens Progress (F14). The player's own handler pauses
// the workout first (it runs before this one).
document.addEventListener('click', e => {
  if (e.target.closest?.('[data-progress]')) go('#/progress');
});
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
