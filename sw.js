// RepRoom service worker: keeps the whole app on the phone so it works offline.
//
// - Each release is one version, set in js/version.js (APP_VERSION). Its files
//   (pages, code, fonts, data) are saved together in one cache named after it
//   when that version installs, and served from the phone, so the app never
//   mixes files from two releases. A new APP_VERSION = a fresh cache.
// - The phone re-checks this file and js/version.js for changes. When the
//   version changes, it downloads the new one in the background, and it waits.
//   The app then shows "New version · tap to update"; tapping it switches over
//   and reloads.
// - Every voice listed in audio/voices.json is saved too, clip by clip, in its
//   own cache that's kept across releases. New voices are picked up the next
//   time the app opens.
// - The move images (img/moves: still, start pose and loop for every move in
//   data/moves.json, about 2.3 MB) are saved at install too, in their own
//   cache named after the version (reproom-images-<version>), so they work
//   with no signal. A new APP_VERSION saves a fresh set and drops the old one.
//
// Running locally (localhost or a LAN address), files come from the network
// first, so edits show up on a plain reload without bumping the version.
importScripts('js/version.js');
const VERSION = 'reproom-' + self.APP_VERSION;
const DEV = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/.test(location.hostname);
const AUDIO = 'reproom-audio-v1';
const IMAGES = 'reproom-images-' + self.APP_VERSION;

const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/version.js', 'js/backup.js', 'js/config.js', 'js/data.js', 'js/store.js', 'js/session.js', 'js/symbols.js', 'js/ui.js', 'js/audio.js', 'js/sounds.js', 'js/feedback.js',
  'js/weights.js', 'js/cuelog.js', 'js/keepalive.js', 'js/moveimg.js',
  'js/screens/home.js', 'js/screens/details.js', 'js/screens/info.js', 'js/screens/player.js',
  'js/screens/summary.js', 'js/screens/settings.js', 'js/screens/feedback.js', 'js/screens/cuelog.js', 'js/screens/run.js',
  'data/workouts.json', 'data/moves.json', 'audio/voices.json',
  'fonts/bricolage-grotesque-latin-700-normal.woff2', 'fonts/bricolage-grotesque-latin-800-normal.woff2',
  'fonts/instrument-sans-latin-400-normal.woff2', 'fonts/instrument-sans-latin-500-normal.woff2',
  'fonts/instrument-sans-latin-600-normal.woff2',
  'fonts/ibm-plex-mono-latin-400-normal.woff2', 'fonts/ibm-plex-mono-latin-500-normal.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // 'reload' skips the browser's HTTP cache, so this version gets fresh files.
    await c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
    await saveImages();
    await saveVoices();
    // A new version waits until the app says "update" (see below).
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== AUDIO && k !== IMAGES) await caches.delete(k);
    await self.clients.claim();
  })());
});

// The app asks for this each time it opens, to pick up new voices.
// It also sends 'skip-waiting' when you tap the update bar.
self.addEventListener('message', e => {
  if (e.data === 'save-voices') e.waitUntil(saveVoices());
  if (e.data === 'skip-waiting') self.skipWaiting();
});

// Save every clip of every voice that isn't saved yet.
async function saveVoices() {
  try {
    const voices = await (await fetch('audio/voices.json', { cache: 'no-cache' })).json();
    const shell = await caches.open(VERSION);
    const audio = await caches.open(AUDIO);
    for (const v of voices) {
      const listUrl = `audio/${v.id}/voice.json`;
      const res = await fetch(listUrl, { cache: 'no-cache' });
      if (!res.ok) continue;
      await shell.put(listUrl, res.clone());
      const { clips } = await res.json();
      const urls = Object.keys(clips).map(n => `audio/${v.id}/${n}.mp3`);
      // 8 downloads at a time
      let next = 0;
      const worker = async () => {
        while (next < urls.length) {
          const u = urls[next++];
          if (!(await audio.match(u))) await audio.add(u).catch(() => {});
        }
      };
      await Promise.all(Array.from({ length: 8 }, worker));
    }
  } catch (err) { /* offline: try again next time */ }
}

// Save every move's three images (F09): <id>.svg, <id>--start.svg and
// <id>--loop.svg. A file that isn't there (a move added before its image) is
// skipped and the app shows the old symbol; a failed download stops the
// install, so the phone tries again later instead of keeping a gap.
async function saveImages() {
  const moves = await (await fetch('data/moves.json', { cache: 'reload' })).json();
  const list = Array.isArray(moves) ? moves : moves.moves;
  const urls = list.flatMap(m => ['', '--start', '--loop'].map(s => `img/moves/${m.id}${s}.svg`));
  const c = await caches.open(IMAGES);
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const u = urls[next++];
      if (await c.match(u)) continue;
      const res = await fetch(u, { cache: 'reload' });
      if (res.ok) await c.put(u, res);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('.mp3')) e.respondWith(audioResponse(req));
  else {
    const cache = url.pathname.includes('/img/moves/') ? IMAGES : VERSION;
    e.respondWith(DEV ? networkFirst(req, cache) : cacheFirst(req, cache));
  }
});

// Release: serve this version's saved copy. Anything not saved yet comes from
// the web and is saved into this version.
async function cacheFirst(req, cache = VERSION) {
  const c = await caches.open(cache);
  const hit = await c.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    return (req.mode === 'navigate' && await c.match('index.html')) || Response.error();
  }
}

// Local development: always the latest file, the saved copy only when offline.
async function networkFirst(req, cache = VERSION) {
  const c = await caches.open(cache);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    return (await c.match(req, { ignoreSearch: true })) || Response.error();
  }
}

// Voice clips: from the phone if saved. Audio players often ask for part of a
// file ("Range"), so answer those from the saved copy too.
async function audioResponse(req) {
  const c = await caches.open(AUDIO);
  let res = await c.match(req.url);
  if (!res) {
    try {
      res = await fetch(req.url);
      if (res.ok) await c.put(req.url, res.clone());
    } catch (err) { return Response.error(); }
  }
  const range = req.headers.get('range');
  if (!range || !res.ok) return res;
  const buf = await res.arrayBuffer();
  const [, a, b] = /bytes=(\d*)-(\d*)/.exec(range) || [];
  const start = a ? +a : 0;
  const end = b ? Math.min(+b, buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
