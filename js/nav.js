// The phone's back button outside a workout (B04).
//
// Back always goes up one level, to where the screen's own back arrow goes.
// It never walks back through a journey (into a finished workout, or forward
// again into a screen left behind), and on Home it asks first.
//
// How: the browser history is kept one entry deep. Every move between
// screens replaces that entry instead of adding one (ui.go uses
// location.replace, and hash links are caught below), so there's nothing
// behind any screen for back to walk into. Back is caught by a CloseWatcher
// instead, which is what Android Chrome's back goes to first while one is
// open (the same thing the player uses for B02). Its close event does, in
// order:
//   1. a sheet is open (Restore's confirm, Import history, ...): close it,
//      as its Keep / Cancel button does;
//   2. the screen has its own back rule (summary, Stage complete): run it;
//   3. the screen has a back arrow: press it;
//   4. Home: open Leave RepRoom?, and don't watch again. The next back finds
//      no watcher and the bottom of the history, so the app closes.
// After 1–3 a new watcher is made straight away, ready for the next back.
// A page may always make one watcher without a tap, so this works when the
// app has just opened and when back is pressed several times in a row.
//
// The player keeps its own watcher (B02); this one is dropped while a
// player screen shows. Browsers without CloseWatcher (iPhone Safari, which
// has no back button) just get the shallow history.

const HAS_CW = typeof window.CloseWatcher === 'function';
const isHome = () => /^#?\/?$/.test(location.hash);
let watcher = null;
let ownBack = null; // the screen's own back rule, if it has one
let leaving = false; // Leave RepRoom? is showing

// Set by a screen when it draws (the router clears it before each screen).
export function setBack(fn) { ownBack = fn || null; }

// A pop-up over the screen, outside #app (Cornelius, F18): back closes it
// first. The router closes it when the screen changes.
let overlay = null;
export function setOverlay(fn) { overlay = fn || null; }
export function closeOverlay() { if (overlay) { const f = overlay; overlay = null; f(); } }

export function arm() {
  if (!HAS_CW || watcher || leaving) return;
  const w = watcher = new CloseWatcher();
  w.addEventListener('close', () => {
    if (watcher === w) watcher = null;
    onBack();
  });
}
export function disarm() { if (watcher) { const w = watcher; watcher = null; w.destroy(); } }

// The router (main.js). It does nothing when the screen is already drawn.
let route = () => {};
export function setRouter(fn) { route = fn; }

function onBack() {
  // A tap that changed screen just before this back: its hashchange may not
  // have run yet, so draw that screen first and go up from there.
  route();
  if (location.hash.startsWith('#/play/')) return; // the player's own (B02)
  if (overlay) { closeOverlay(); arm(); return; }
  const app = document.getElementById('app');
  const sheetClose = app.querySelector('.sheet [data-keep]');
  const arrow = app.querySelector('[data-back]');
  if (sheetClose) sheetClose.click();
  else if (ownBack) ownBack();
  else if (arrow) arrow.click();
  else if (!isHome()) location.replace('#/');
  else { disarm(); showLeave(); return; } // (route() may have made a watcher)
  arm();
}

// ---- Leave RepRoom? ----
// A web app can't reliably close itself on Android, so there's no LEAVE
// button: the second back leaves. STAY, or a tap outside, closes the sheet.
let box = null;
function showLeave() {
  if (box) return;
  leaving = true;
  box = document.createElement('div');
  box.className = 'leave';
  box.innerHTML = `
    <div class="scrim" data-stay></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="leave-title">
      <h2 class="sheet-title" id="leave-title">Leave RepRoom?</h2>
      <p class="sheet-text">Press back again to leave.</p>
      <button class="cta centre" data-stay>Stay</button>
    </div>`;
  box.querySelectorAll('[data-stay]').forEach(b => b.addEventListener('click', stay));
  document.body.append(box);
}
function stay() {
  leaving = false;
  box?.remove();
  box = null;
  if (!isHome()) location.replace('#/'); // see popstate below
  arm();
}
export const isLeaving = () => leaving;

// The second back on Leave RepRoom? normally closes the app, as there's no
// entry behind Home. A history made before this version (the app updated
// while open) can still have older entries: step over them all, without
// showing them, until the app closes. (The router draws nothing meanwhile.)
addEventListener('popstate', () => { if (leaving) history.back(); });

// Links within the app (<a href="#/run">) replace the entry too.
document.addEventListener('click', e => {
  const a = e.target.closest?.('a[href^="#"]');
  if (!a || e.defaultPrevented) return;
  e.preventDefault();
  location.replace(a.getAttribute('href'));
});
