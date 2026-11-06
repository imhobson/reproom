// Starts the app and shows the right screen for the address (#/...).
import { loadData } from './data.js';
import { hideToast } from './ui.js';
import * as audio from './audio.js';
import * as home from './screens/home.js';
import * as details from './screens/details.js';
import * as info from './screens/info.js';
import * as player from './screens/player.js';
import * as summary from './screens/summary.js';
import * as settings from './screens/settings.js';

const app = document.getElementById('app');

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
  let m = null;
  const r = routes.find(x => (m = location.hash.match(x.re))) || routes[0];
  window.scrollTo(0, 0);
  r.show(m);
}

await Promise.all([loadData(), audio.init()]);
addEventListener('hashchange', route);
route();

// Keep the app (and every voice) on the phone so it works offline.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(async () => {
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage('save-voices'); // picks up any newly added voice
  }).catch(() => { /* not available, e.g. not on https */ });
}
