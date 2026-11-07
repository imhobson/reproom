// Starts the app and shows the right screen for the address (#/...).
import { loadData } from './data.js';
import { keepData } from './store.js';
import { hideToast } from './ui.js';
import * as audio from './audio.js';
import * as home from './screens/home.js';
import * as details from './screens/details.js';
import * as info from './screens/info.js';
import * as player from './screens/player.js';
import * as summary from './screens/summary.js';
import * as settings from './screens/settings.js';

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
];

let prevHash = '#/';
function route() {
  hideToast();
  // Settings' back arrow returns to wherever Settings was opened from.
  const inSettings = h => h.startsWith('#/settings');
  if (inSettings(location.hash) && !inSettings(prevHash)) settings.setBack(prevHash || '#/');
  prevHash = location.hash;
  if (!location.hash.startsWith('#/play/')) player.leave();
  showUpdateBar();
  let m = null;
  const r = routes.find(x => (m = location.hash.match(x.re))) || routes[0];
  window.scrollTo(0, 0);
  r.show(m);
}

keepData(); // ask the browser to keep progress and settings (see store.js)
await Promise.all([loadData(), audio.init()]);
addEventListener('hashchange', route);
route();

// ---- Updates ----
// A new release installs in the background and waits (see sw.js). When one is
// waiting, the bar at the top offers it. It stays hidden in the player so a
// workout is never cut short; it comes back once you leave the player.
function showUpdateBar() {
  updateBar.hidden = !waitingSW || location.hash.startsWith('#/play/');
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
  navigator.serviceWorker.register('sw.js').then(async reg => {
    watchForUpdates(reg);
    const ready = await navigator.serviceWorker.ready;
    ready.active?.postMessage('save-voices'); // picks up any newly added voice
  }).catch(() => { /* not available, e.g. not on https */ });
}
