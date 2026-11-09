// RepRoom's version: the one place it's set (Q06).
//
// - Middle number = the build prompt number (prompt 03 -> 1.3.x).
// - Last number = small fixes in between.
// - Change APP_DATE with it (YYYY-MM-DD).
//
// This one file feeds both the Settings header (V1.3.0 - 7 NOV) and the
// service worker's cache name (sw.js loads it with importScripts), so a new
// version always means a fresh cache. publish.ps1 refuses to publish changed
// app files under an unchanged version, so it can't be forgotten.
//
// It's a plain script (not a module) so the service worker can load it too.
self.APP_VERSION = '1.5.3';
self.APP_DATE = '2026-11-09';
