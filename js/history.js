// Import history (F14, board 04h): reading a reproom-history file and the
// lines on the "Add your history?" sheet. The file itself is personal and
// never part of the app; adding it is store.addHistory.
import * as store from './store.js';
import { DAYS_PER_STAGE } from './config.js';

const p2 = n => String(n).padStart(2, '0');

// { doc } or { error } (the toast to show).
export async function read(file) {
  let doc;
  try { doc = JSON.parse(await file.text()); } catch (e) { doc = null; }
  if (!doc || doc.kind !== 'reproom-history' || !doc.id || !Array.isArray(doc.sessions) || typeof doc.estimated !== 'object') {
    return { error: "That isn't a RepRoom history file." };
  }
  if (store.get().history?.ids?.includes(doc.id)) return { error: 'This history is already added.' };
  return { doc };
}

const shortDate = k => {
  const [y, m, d] = String(k).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const range = (word, a, b) => (a === b ? `${word} ${p2(a)}` : `${word}s ${p2(a)}–${p2(b)}`);

// The file's lines for the sheet (numbers wrapped by num()).
export function describe(doc, num = x => x) {
  const s = doc.summary || {};
  const est = doc.estimated || {};
  const dated = doc.sessions.length;
  const sessions = s.sessions ?? (est.sessions || 0) + dated;
  const secs = s.secs ?? (est.secs || 0) + doc.sessions.reduce((t, x) => t + (x.secs || 0), 0);
  const sets = s.sets ?? Object.values(est.moves || {}).reduce((t, [n]) => t + n, 0)
    + doc.sessions.reduce((t, x) => t + Object.values(x.done || {}).reduce((a, [n]) => a + n, 0), 0);
  const dates = doc.sessions.map(x => x.date).filter(Boolean).sort();

  // Where the ticks leave you: the first stage not complete, its next day.
  const ticks = doc.ticks || {};
  const ticked = (st, d) => !!ticks[st]?.[d]?.length;
  let stage = 1;
  while (stage < 999 && Array.from({ length: DAYS_PER_STAGE }, (_, i) => ticked(stage, i + 1)).every(Boolean)) stage++;
  let next = 1;
  while (next <= DAYS_PER_STAGE && ticked(stage, next)) next++;
  const parts = [];
  if (stage > 1) parts.push(range('Stage', 1, stage - 1));
  if (next > 1) parts.push(range('Day', 1, next - 1));
  const p = v => num(p2(v));
  const tickLine = parts.length
    ? `Stage ${p(stage)} · Day ${p(next)} next: ${parts.join(' and ').replace(/\d+/g, m => num(m))} ticked`
    : 'No days ticked';

  return {
    sessions,
    total: `${num(sessions.toLocaleString('en-GB'))} sessions · about ${num(Math.round(secs / 3600).toLocaleString('en-GB'))} hrs · ${num(sets.toLocaleString('en-GB'))} sets`,
    dated: dated ? `${num(dated)} from Strava, with dates (${shortDate(dates[0])} – ${shortDate(dates.at(-1))})` : null,
    estimated: est.sessions ? `${num(est.sessions)} estimated, no dates` : null,
    ticks: tickLine,
  };
}
