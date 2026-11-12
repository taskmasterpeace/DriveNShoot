// THE FIRST MINUTE (docs/design/WEB_FIRST_MINUTE.md): what a brand-new Florida game asks of you before Sheriff Duarte's
// job takes over. Each beat is one line on the HUD's objective tracker with a pin, and it completes on REAL state (where
// you stand, a door you shut with your own hand): nothing is granted, nothing is skipped by a timer. A loaded game keeps
// its beat (g.quests.firstminute); the agent harness and the battery never arm it (they start in Phoenix, with no title).
//   id      the beat's name (events: firstMinute { beat })
//   text    the tracker line. {town} and {clinic} are filled from the holdout's rows
//   pin     what the tracker points at: 'clinicDoor' | 'clinicInside' | null
//   done    what completes it: 'insideClinic' (you stand in the clinic) | 'shutClinicDoor' (you stand inside, its front door is shut and
//           it was your hand: door.shutBy; a door off its hinges skips the beat) | 'leftClinic' (you are out in the street again)
//   say     a toast when the beat begins (once)
export const FIRST_MINUTE = [
  { id: 'where', text: 'You are in {town}, a walled town on the Florida coast that still stands. {clinic} patched you up. Go back inside: the door behind you.', pin: 'clinicDoor', done: 'insideClinic',
    say: '{town} · THE WALL KEEPS THE DEAD OUT. MOSTLY.' },
  { id: 'door', text: 'Pull the door shut behind you: stand by the open door and press E. The infected cannot work a latch.', pin: 'clinicDoor', done: 'shutClinicDoor',
    say: 'A SHUT DOOR HOLDS THEM. THEY HAVE TO BEAT IT DOWN.' },
  { id: 'out', text: 'That door is what stands between you and them out there. Walk into it to open it, and step back out.', pin: 'clinicDoor', done: 'leftClinic',
    say: 'HOLD E AT A SHUT DOOR TO LEAN ON IT WHEN THEY COME.' },
];

// Far from the clinic (past `dist` m of its door) the tracker says this instead of the beat's own line: the pin is the same.
export const FIRST_MINUTE_AWAY = { dist: 60, text: 'Unfinished in {town}: go back to the clinic door, where you woke.' };

export function validateFirstMinute(rows = FIRST_MINUTE) {
  const bad = [], dones = ['insideClinic', 'shutClinicDoor', 'leftClinic'], pins = ['clinicDoor', 'clinicInside', null];
  if (!rows.length || rows.length > 6) bad.push(`${rows.length} beats: 1-6 (it is a minute, not a tutorial)`);
  if (!(FIRST_MINUTE_AWAY.dist >= 20 && FIRST_MINUTE_AWAY.dist <= 400)) bad.push('FIRST_MINUTE_AWAY.dist: 20-400 m');
  if (typeof FIRST_MINUTE_AWAY.text !== 'string' || FIRST_MINUTE_AWAY.text.length < 20 || FIRST_MINUTE_AWAY.text.length > 170) bad.push('FIRST_MINUTE_AWAY.text: 20-170 characters');
  const ids = new Set();
  for (const r of rows) {
    if (!r.id || ids.has(r.id)) bad.push(`beat id "${r.id}" missing or repeated`);
    ids.add(r.id);
    if (typeof r.text !== 'string' || r.text.length < 20 || r.text.length > 170) bad.push(`${r.id}.text: 20-170 characters (one tracker line)`);
    if (!dones.includes(r.done)) bad.push(`${r.id}.done "${r.done}": one of ${dones.join(', ')}`);
    if (!pins.includes(r.pin ?? null)) bad.push(`${r.id}.pin "${r.pin}"`);
  }
  return bad;
}
