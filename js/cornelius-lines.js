// Cornelius's lines (F18). Our own words; edit freely.
// moment: done (a finished workout) · milestone (a milestone crossed) ·
//         symbol (the 100th tile: a Wall symbol finished) · stage (Stage complete)
// expr:   which face he pulls (see cornelius.js EXPRESSIONS)
// Fill-ins: {session} session number · {tilesLeft} tiles left on the symbol ·
//           {milestone} the milestone's label, as on the summary (e.g. "250 sessions") ·
//           {stage} two-digit stage · {days} days the stage took
// A line whose fill-in has no value (e.g. {days} unknown) is skipped.
export const LINES = [
  { id: 'd01', moment: 'done', expr: 'proud', text: 'Another tile on the Wall. Hm. I am almost impressed.' },
  { id: 'd02', moment: 'done', expr: 'proud', text: 'Session {session}. The Wall does not lie, and today it says you showed up.' },
  { id: 'd03', moment: 'done', expr: 'wink', text: 'Good. Now drink some water, before you start feeling clever.' },
  { id: 'd04', moment: 'done', expr: 'proud', text: 'I have seen mountains wear away faster than your excuses. Well done.' },
  { id: 'd05', moment: 'done', expr: 'wink', text: 'You sweat like a young apprentice. That is a compliment.' },
  { id: 'd06', moment: 'done', expr: 'proud', text: 'Rest tonight. What you did today keeps working while you sleep.' },
  { id: 'd07', moment: 'done', expr: 'proud', text: 'Strong. Not finished. But strong.' },
  { id: 'd08', moment: 'done', expr: 'proud', text: '{tilesLeft} tiles until this symbol is whole. Patience is a muscle too.' },
  { id: 'd09', moment: 'done', expr: 'wink', text: 'The hardest rep of the day was getting started. You did that one first.' },
  { id: 'd10', moment: 'done', expr: 'proud', text: 'Hm. Your form is getting less terrible. Do not let it go to your head.' },
  { id: 'm01', moment: 'milestone', expr: 'laughing', text: 'Ha! {milestone}. Even I had to look twice.' },
  { id: 'm02', moment: 'milestone', expr: 'laughing', text: '{milestone}! I shall tell the other sages. They will not believe me.' },
  { id: 'm03', moment: 'milestone', expr: 'surprised', text: '{milestone}? Go on, admire it. You have earned a moment.' },
  { id: 's01', moment: 'symbol', expr: 'laughing', text: 'A whole symbol, finished! A hundred sessions, one picture. Now, the next one.' },
  { id: 's02', moment: 'symbol', expr: 'laughing', text: 'Ha! The Wall has a new symbol. I remember when it was one grey square.' },
  { id: 't01', moment: 'stage', expr: 'proud', text: 'Stage {stage}, done. Twenty-eight days, and you came back for every one.' },
  { id: 't02', moment: 'stage', expr: 'proud', text: 'Stage {stage} is behind you. The next one will not be kinder. Good.' },
  { id: 't03', moment: 'stage', expr: 'laughing', text: '{days} days for Stage {stage}. The Wall grows, and so do you.' },
];
