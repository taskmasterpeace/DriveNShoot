// THE WORLD'S VOICE as rows (docs/design/WEB_WORLD_VOICE.md). Four things the world says without new art:
//   AMBIENCE    layered sound by region and biome: insects, frogs, wind, surf. Synthesized in Web Audio from these rows
//               (systems/farsound.js), checked once a second, crossfaded at a biome border. No sample library is used to
//               train anything; nothing here is a recording.
//   FAR         a far-off gunshot, an engine, a horde, a town's dogs: heard ONLY when something really happened there,
//               from its real bearing, after its real delay (distance / the speed of sound). Law 6: it is real news.
//   FEED        the radio as a world feed: stations that read out what their town actually holds (a witness saw it, the
//               grapevine carried it), with its age, and wrong when the copy is shaky (systems/feed.js).
//   MARKS       readable leftovers: raiders' tags, tally marks, warnings, "don't go north", the words on a grave
//               (systems/marks.js), each placed from a real chronicle row, a real grave or a fact the painter held.
//   CAMPFIRE    stop at night with the crew: a fire, lines picked from your stats, the area and real recent events, the
//               clock passes, rest and morale (systems/campfire.js).
// Every word is our own (tools/ip-lint.mjs scans this file). No purple: colours are checked by the validator.
import { FACT_KINDS } from './pulls.js';
import { MORALE } from './stats.js';

// ---- ambience ------------------------------------------------------------------------------------------------------
// A layer is one synth voice: src noise|sine|saw, a filter (type, f, q), an amplitude pulse (am: [rate Hz, depth 0..1,
// shape sine|square]) and a slow swell (swell: [rate Hz, depth]). gain is its loudest level at a row's level 1.
export const AMBIENT_LAYERS = {
  wind:     { name: 'wind', src: 'noise', filter: ['bandpass', 380, 0.8], swell: [0.11, 0.55], gain: 0.16 },
  gusts:    { name: 'gusts in the brush', src: 'noise', filter: ['highpass', 1800, 0.5], swell: [0.05, 0.85], gain: 0.05 },
  cicadas:  { name: 'cicadas', src: 'noise', filter: ['bandpass', 4300, 9], am: [38, 0.85, 'square'], swell: [0.07, 0.7], gain: 0.05 },
  crickets: { name: 'crickets', src: 'sine', freq: 4650, am: [2.8, 1, 'square'], swell: [0.21, 0.35], gain: 0.018 },
  katydids: { name: 'katydids', src: 'noise', filter: ['bandpass', 6400, 11], am: [3.6, 0.95, 'square'], swell: [0.13, 0.5], gain: 0.04 },
  frogs:    { name: 'frogs', src: 'saw', freq: 190, filter: ['bandpass', 420, 3], am: [8.5, 0.95, 'square'], swell: [0.37, 0.9], gain: 0.05 },
  peepers:  { name: 'tree frogs', src: 'sine', freq: 2900, am: [1.4, 1, 'square'], swell: [0.29, 0.6], gain: 0.012 },
  surf:     { name: 'surf', src: 'noise', filter: ['lowpass', 720, 0.6], swell: [0.085, 0.8], gain: 0.2 },
  hum:      { name: 'dead wires humming', src: 'saw', freq: 60, filter: ['lowpass', 180, 1.2], swell: [0.03, 0.4], gain: 0.02 },
};

// A biome's mix: day and night levels per layer (0..1). Keyed by the biome's own name (data/streaming.js BIOMES, a
// region's data/regions.js biomes); `florida` rows override for that region (wetter, louder at night).
export const BIOME_AMBIENCE = {
  desert:          { day: { wind: 0.8, gusts: 0.6, cicadas: 0.25 }, night: { wind: 0.55, crickets: 0.5 } },
  scrub:           { day: { wind: 0.6, gusts: 0.4, cicadas: 0.45 }, night: { wind: 0.4, crickets: 0.8 } },
  mountains:       { day: { wind: 1, gusts: 0.8 }, night: { wind: 0.9, crickets: 0.2 } },
  plains:          { day: { wind: 0.85, gusts: 0.5, cicadas: 0.3 }, night: { wind: 0.6, crickets: 0.9 } },
  farmland:        { day: { wind: 0.5, cicadas: 0.6 }, night: { wind: 0.3, crickets: 1, katydids: 0.4 } },
  'dry riverbed':  { day: { wind: 0.7, gusts: 0.5 }, night: { wind: 0.5, crickets: 0.6 } },
  forest:          { day: { wind: 0.4, cicadas: 0.7 }, night: { wind: 0.25, crickets: 0.7, katydids: 0.7 } },
  swamp:           { day: { wind: 0.2, cicadas: 0.8, frogs: 0.3 }, night: { wind: 0.15, frogs: 1, peepers: 0.8, katydids: 0.6 } },
  coast:           { day: { wind: 0.7, surf: 1 }, night: { wind: 0.5, surf: 1, crickets: 0.3 } },
  urban:           { day: { wind: 0.5, hum: 0.6, cicadas: 0.2 }, night: { wind: 0.35, hum: 0.5, crickets: 0.4 } },
  // Florida's own names
  'pine flatwoods': { day: { wind: 0.35, cicadas: 0.9 }, night: { wind: 0.2, crickets: 0.8, katydids: 0.9, peepers: 0.3 } },
  groves:          { day: { wind: 0.3, cicadas: 0.8 }, night: { wind: 0.2, crickets: 0.9, katydids: 0.5 } },
  prairie:         { day: { wind: 0.7, gusts: 0.4, cicadas: 0.5 }, night: { wind: 0.45, crickets: 1, frogs: 0.3 } },
  wetland:         { day: { wind: 0.3, cicadas: 0.5, frogs: 0.5 }, night: { wind: 0.2, frogs: 1, peepers: 1 } },
  'the coast':     { day: { wind: 0.8, surf: 1 }, night: { wind: 0.6, surf: 1, peepers: 0.2 } },
  'the dead suburbs': { day: { wind: 0.4, hum: 0.5, cicadas: 0.6 }, night: { wind: 0.3, hum: 0.4, crickets: 0.6, peepers: 0.3 } },
  florida: { swamp: { night: { wind: 0.1, frogs: 1, peepers: 1, katydids: 0.8 } }, scrub: { day: { wind: 0.4, gusts: 0.3, cicadas: 0.8 } } },
};
export const AMBIENCE = {
  every: 1,          // s between mix checks
  fade: 2.2,         // s: the time constant of a crossfade (a biome border, dusk, rain coming)
  rain: { insects: 0.25, frogs: 1.4, wind: 1.2 }, // rain quiets the insects and wakes the frogs
  dust: { wind: 1.8, gusts: 1.6, insects: 0.4 },
  indoor: 0.35,      // under a roof
  master: 1,         // the whole ambience bus
  insects: ['cicadas', 'crickets', 'katydids', 'peepers'],
};

// ---- far sounds: real events heard at a distance ---------------------------------------------------------------------
// range: past it nothing carries; near: closer than this the ordinary sound already covers it (systems/audio.js plays
// shots to 520 m), so the far layer never doubles a sound. gap: one source sounds at most this often (s).
export const FAR = {
  c: 343,                       // m/s: sound in air (the delay is distance / c, in real seconds of game time)
  weather: { rain: 0.6, dust: 0.75 }, // the range shrinks under rain and in dust
  indoor: 0.55,
  scanEvery: 0.5,               // s: how often live sources are looked at
  queueCap: 32,                 // sounds in the air at once (a fixed pool)
  ledger: 48,                   // what you heard, kept for the commands and the checks
  kinds: {
    shot:      { name: 'a shot', range: 2600, near: 520, gain: 0.85, set: ['common', 'shot.far'], caption: 'a shot, far off' },
    volley:    { name: 'gunfire', range: 3400, near: 300, gain: 0.9, set: ['common', 'shot.far'], shots: [5, 13], spread: 2.6, caption: 'gunfire, a lot of it' },
    explosion: { name: 'a blast', range: 5200, near: 600, gain: 1, set: ['common', 'explosion.far'], caption: 'a blast, far off' },
    engine:    { name: 'an engine', range: 1100, near: 90, gain: 0.5, gap: 9, caption: 'an engine, far off' },
    horde:     { name: 'the dead', range: 700, near: 70, gain: 0.6, set: ['shambler', 'idle'], pitch: 0.78, gap: 7, caption: 'moaning, a lot of them' },
    dogs:      { name: 'dogs', range: 1500, near: 110, gain: 0.55, set: ['fauna.dog', 'bark'], gap: 26, stirred: 5, caption: 'dogs barking' },
  },
  // Chronicle verbs that are a fight somewhere (src sim/story/director: they happened off screen, on the clock).
  verbs: { skirmish: 'volley', took: 'volley', raided: 'volley', repelled: 'volley', fell: 'volley', ambush_won: 'volley', ambush_lost: 'volley', raid_won: 'volley', raid_lost: 'volley', blast: 'explosion' },
  offscreen: ['sim', 'story', 'director'],
  dogsAt: { people: 1, stirR: 220 },   // a place barks when it has people; stirred when something real moves within stirR
};

// ---- the radio as a world feed -----------------------------------------------------------------------------------------
// News facts: a chronicle row becomes a fact only if somebody was there to see it (a town inside witnessR, or a named
// witness). A station's mast is a town with a set; it reads out what THAT town holds, never more.
export const NEWS = {
  witnessR: 900,       // m: a town this close saw it (the shots, the smoke, the survivors walking in)
  life: 72,            // h a news fact stays news
  verbs: {             // chronicle verb -> the line (vars: {place} {who} {by} {of} {n} {road})
    skirmish: 'shooting at {place} between {by} and {of}',
    took: '{by} hold {place} now. {of} pulled out',
    raided: 'raiders out of {by} hit {place}',
    fell: '{place} has fallen to {by}',
    fled: 'people walking out of {place}, headed for {other}',
    camped: 'refugees from {place} have made camp',
    repelled: '{place} drove off a raid',
    sickened: 'sickness at {place}',
    kill: 'somebody shot {who} near {place}',
    burned: 'a body burned near {place}',
  },
  market: { arch: ['county_seat', 'neighborhood', 'trading_post', 'market'], hour: 6, life: 12, rustHaven: true },
};
export const FEED = {
  every: [26, 44],     // s between lines on a feed station while you listen
  airAgainAfter: 18,   // game hours before a mast reads the same fact again
  shaky: 0.62,         // a copy below this confidence is read with a hedge, and may carry an error
  errorAt: 0.5,        // below this the count or the road is wrong (deterministic per fact)
  keyLines: ['posting', 'bounty', 'fell', 'took', 'raided'], // these go to the voice (a locked station voice, if rendered)
  log: 12,
  hud: { lines: 3, holdSecs: 50 },
  ages: [[1, 'just now'], [6, 'a few hours back'], [18, 'earlier today'], [42, 'yesterday'], [96, 'a couple of days back'], [9999, 'a while back']], // hours old -> the words
  hedges: ['Word is', 'Nobody has confirmed it, but', 'I heard, and I would not swear to it,', 'Somebody came in saying'],
  sure: ['Confirmed:', 'From the road:', 'Folks saw it:', ''],
  lines: { // fact kind -> the read (vars: {text} {age} {place} {conf})
    news: '{lead} {text}. That was {age}.',
    story: '{lead} {text}. That was {age}.',
    market: 'Market is open at {place}. {age}, so get there early.',
    posting: 'Tally notice: {text}. Posted {age}.',
    bounty: 'Bounty: {text}. Posted {age}.',
    death: '{lead} {text}. Somebody\'s family is grieving.',
    funeral: 'A burying: {text}.',
    caravan: '{lead} {text}. Last heard {age}.',
    work: 'Work going: {text}.',
  },
};
// Feed fact kinds this lane adds (the knowledge model's own table; the pulls rows are untouched).
FACT_KINDS.news ??= { name: 'News', pull: false, life: NEWS.life, icon: 'news' };
FACT_KINDS.market ??= { name: 'Market day', pull: false, life: NEWS.market.life, icon: 'cart' };

// ---- readable leftovers ---------------------------------------------------------------------------------------------
// kind: where it goes and how it reads. on: wall (a building face), ground (paint on the dirt or the road), board (a
// plank on two posts, leaned back so it reads from above). Text sizes in metres.
export const MARK_KINDS = {
  tag:      { name: "raiders' tag", on: ['wall', 'wall', 'ground'], w: 2.6, h: 1.3, life: null },
  tally:    { name: 'tally marks', on: ['wall'], w: 1.8, h: 0.9 },
  warning:  { name: 'a warning', on: ['board', 'ground'], w: 2.4, h: 1.2 },
  dontgo:   { name: "don't go", on: ['board', 'ground'], w: 2.8, h: 1.4 },
  grave:    { name: 'words on a grave', on: ['board'], w: 1.1, h: 0.55 },
  ash:      { name: 'a cold fire ring', on: ['ground'], w: 1.6, h: 1.6 },
};
// What paints what (the cause is a real thing: a chronicle row, a grave, a fact the painter held).
export const MARK_RULES = {
  tagVerbs: { took: 'af', fell: 'af', raided: 'of', raid_won: 'af' }, // whose tag: the row's field holding the raiders
  tagsPerRaid: [2, 4],
  tallyVerbs: ['kill', 'silence', 'raided', 'skirmish'],
  tallyMax: 40,
  warnFor: { overrun: 'dead', sickness: 'sick', toll: 'toll', dry_well: 'dry', nest: 'dead' }, // site stories' problem kinds (data/sitestories.js PROBLEMS)
  dontgoR: 14000,       // m: a town paints a warning about a fallen place this close that it HOLDS news of
  near: 240,            // m: marks this close to you are drawn
  redraw: 18,           // m you move before the near set is looked at again
  cap: 96,              // instanced at once
  graveWords: 8,        // graves near you that get a board
};
// A faction's tag: its letters, its colour (spray), a scrawl. Fallback: the name's initials in the faction's colour.
export const TAGS = {
  dustwolves: { text: 'DW', word: 'WOLF ROAD', color: '#c0361f', scrawl: 'teeth' },
  raider: { text: 'DW', word: 'WOLF ROAD', color: '#c0361f', scrawl: 'teeth' },
  remnant: { text: 'FR', word: 'REMNANT POST', color: '#e9e3d2', scrawl: 'star' },
  rusthaven: { text: 'RH', word: 'HAVEN LAW', color: '#d9a441', scrawl: 'bar' },
  drifters: { text: 'D', word: 'DRIFT', color: '#5fa86b', scrawl: 'arrow' },
  meridian: { text: 'M', word: 'MERIDIAN WALL', color: '#4f9fb8', scrawl: 'bar' },
  _: { text: '?', word: 'TAKEN', color: '#d4c9a8', scrawl: 'cross' },
};
export const MARK_TEXT = {
  warning: { dead: ['DEAD INSIDE', 'DO NOT OPEN'], sick: ['SICK HERE', 'KEEP OUT'], toll: ['TOLL ROAD', 'PAY OR TURN'], dry: ['NO WATER', 'WELL IS DRY'] },
  dontgo: ["DON'T GO {DIR}", '{PLACE} FELL'],
  dontgoDead: ["DON'T GO {DIR}", '{PLACE} IS DEAD'],
  grave: ['{NAME}', '{HOW}'],
  how: { bullet: 'SHOT', blade: 'CUT DOWN', bite: 'BITTEN', fire: 'BURNED', fall: 'FELL', blast: 'BLOWN UP', crash: 'ROAD TOOK HIM', _: 'GONE' },
  by: 'BY {BY}',
};
export const PAINT = { board: '#6b4f33', boardEdge: '#3e2c1c', ground: 'rgba(0,0,0,0)', chalk: '#e8e1cf', red: '#b9371f', white: '#e9e3d2' };

// ---- campfire ----------------------------------------------------------------------------------------------------------
export const CAMPFIRE = {
  needNight: 0.5,       // the sky's night share
  stillSecs: 5,         // s stopped (out of a moving car) before the fire is made
  crewR: 30,            // m: crew this close sit with you
  leaveR: 14,           // m: walk this far and the fire is left to burn down
  exchanges: 5,         // lines before the fire burns low
  gapSecs: 6,           // s between lines (the clock runs fast meanwhile)
  hoursPerLine: 0.4,    // game hours each exchange takes
  rest: 0.06,           // rest each exchange gives you and every member at the fire
  recentH: 30,          // h: what counts as recent for the lines
  recentR: 6000,        // m: and how near
  sitR: 2.4,            // m from the fire the crew sit
  morale: 'campfire',
  glow: { r: 5.5, flicker: 0.18, color: '#c2611f', power: 70 }, // r: the warm pool (m); power: the fx pool light kept lit
};
MORALE.mods.campfire ??= { v: 4, hours: 14, label: 'A night by the fire' };
// Lines. when: what must be true (systems/campfire.js pick()); weight; text vars: {you} {name} {place} {area} {region}
// {target} {by} {dir} {hp} {kills} {cash} {heard} {other}. A line with a `ref` names the real thing it came from.
export const CAMP_LINES = [
  // real recent events (chronicle rows near you)
  { id: 'raid_near', when: 'event:raided|fell|took', w: 6, text: ['They say {place} went down. {by}. That close to us.', '{place}... I knew people there.', 'If {by} took {place}, they will be on this road by the weekend.'] },
  { id: 'skirmish_near', when: 'event:skirmish', w: 4, text: ['{by} and {other} at it again near {place}. Let them bleed each other.', 'More shooting around {place}. Nobody wins those.'] },
  { id: 'your_kill', when: 'event:kill:you', w: 5, text: ['{target}. At {place}. I keep thinking about it.', 'You dropped {target} back at {place}. Did they have to go?', '{target} had it coming, at {place}. I will sleep fine.'] },
  { id: 'kill_near', when: 'event:kill', w: 3, text: ['Somebody put {target} down near {place}. Out here that is just a Tuesday.'] },
  { id: 'heard_far', when: 'heard:shot', w: 4, text: ['That shooting earlier, off to the {dir}. Somebody is having a worse night than us.', 'You heard it too. Off to the {dir}. A lot of rounds.'] },
  { id: 'heard_engine', when: 'heard:engine', w: 3, text: ['Engines to the {dir} before dark. Could be traders. Could be not.', 'Somebody is driving out there, {dir} of us. At night. Think about why.'] },
  { id: 'radio_news', when: 'news', w: 4, text: ['The radio said {heard}. You believe it?', '{heard}. That is what the man on the radio said.'] },
  // your stats
  { id: 'hurt', when: 'stat:hp<0.5', w: 5, text: ['Sit still and let me look at that. You are leaking.', 'You are walking like a dropped radio. Rest.'] },
  { id: 'hungry', when: 'stat:food<0.35', w: 3, text: ['When did we last eat a real meal?', 'My stomach is louder than the fire.'] },
  { id: 'rich', when: 'stat:cash>400', w: 2, text: ['That much cash on us and no walls around us. I will take first watch.'] },
  { id: 'killer', when: 'stat:kills>10', w: 2, text: ['{kills} people. I count. Somebody should.'] },
  { id: 'wanted', when: 'stat:wanted>0', w: 3, text: ['They will have our faces on a board by now.', 'Keep the fire low. People are looking for us.'] },
  { id: 'low_morale', when: 'stat:morale<0', w: 3, text: ['Bad day. Tomorrow cannot be worse.', 'I have had better weeks. I have had worse. Not many.'] },
  // the area
  { id: 'swamp', when: 'area:swamp|wetland', w: 2, text: ['The frogs out here never shut up.', 'Every log in this water has eyes.'] },
  { id: 'desert', when: 'area:desert|scrub|dry riverbed', w: 2, text: ['Cold as anything once the sun is gone. Feel that.', 'Nothing out here but us and the coyotes.'] },
  { id: 'coast', when: 'area:coast|the coast', w: 2, text: ['Listen to that water. Like the world is still breathing.'] },
  { id: 'ruins', when: 'area:urban|the dead suburbs', w: 2, text: ['All these houses. Somebody grew up in every one of them.'] },
  { id: 'any', when: 'any', w: 1, text: ['Long day.', 'Pass the water.', 'Fire is good. Fire is the best thing we have got.'] },
];

// ---- the validator -----------------------------------------------------------------------------------------------------
const hueOf = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? ''); if (!m) return null;
  const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.08) return null; // grey: no hue
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
export const purple = (hex) => { const h = hueOf(hex); return h !== null && h >= 270 && h <= 320; };

export function validateWorldVoice(rows = { AMBIENT_LAYERS, BIOME_AMBIENCE, FAR, FEED, NEWS, MARK_KINDS, MARK_RULES, TAGS, CAMP_LINES, CAMPFIRE }) {
  const errors = [];
  const L = rows.AMBIENT_LAYERS ?? {};
  for (const [id, l] of Object.entries(L)) {
    if (!['noise', 'sine', 'saw'].includes(l.src)) errors.push(`layer ${id}: src must be noise|sine|saw`);
    if (!(l.gain > 0 && l.gain <= 0.5)) errors.push(`layer ${id}: gain in (0, 0.5]`);
    if (l.am && !(l.am[0] > 0 && l.am[1] >= 0 && l.am[1] <= 1)) errors.push(`layer ${id}: am [rate>0, depth 0..1]`);
  }
  const mix = (where, m) => { for (const [k, v] of Object.entries(m ?? {})) { if (!L[k]) errors.push(`${where}: unknown layer ${k}`); else if (!(v >= 0 && v <= 1.5)) errors.push(`${where}.${k}: level 0..1.5`); } };
  for (const [b, r] of Object.entries(rows.BIOME_AMBIENCE ?? {})) {
    if (b === 'florida') { for (const [bb, rr] of Object.entries(r)) { mix(`florida.${bb}.day`, rr.day); mix(`florida.${bb}.night`, rr.night); } continue; }
    if (!r.day || !r.night) errors.push(`biome ${b}: needs day and night`);
    mix(`${b}.day`, r.day); mix(`${b}.night`, r.night);
  }
  for (const [k, K] of Object.entries(rows.FAR?.kinds ?? {})) {
    if (!(K.range > K.near && K.near >= 0)) errors.push(`far ${k}: range > near >= 0`);
    if (!K.caption) errors.push(`far ${k}: a caption`);
  }
  if (!(rows.FAR?.c > 300 && rows.FAR.c < 360)) errors.push('far: c is the speed of sound (300..360 m/s)');
  for (const [v, k] of Object.entries(rows.FAR?.verbs ?? {})) if (!rows.FAR.kinds[k]) errors.push(`far verb ${v}: unknown kind ${k}`);
  for (const [k, t] of Object.entries(rows.FEED?.lines ?? {})) if (typeof t !== 'string' || !t.length) errors.push(`feed line ${k}: text`);
  if (!(rows.FEED?.shaky > rows.FEED?.errorAt)) errors.push('feed: shaky > errorAt');
  for (const [v, t] of Object.entries(rows.NEWS?.verbs ?? {})) if (!/\{place\}|\{who\}/.test(t)) errors.push(`news verb ${v}: must name {place} or {who}`);
  for (const [k, K] of Object.entries(rows.MARK_KINDS ?? {})) { if (!K.on?.length || K.on.some((o) => !['wall', 'ground', 'board'].includes(o))) errors.push(`mark ${k}: on wall|ground|board`); if (!(K.w > 0 && K.h > 0)) errors.push(`mark ${k}: size`); }
  for (const [f, T] of Object.entries(rows.TAGS ?? {})) { if (!T.text || !T.word) errors.push(`tag ${f}: text and word`); if (purple(T.color)) errors.push(`tag ${f}: purple`); }
  for (const r of rows.CAMP_LINES ?? []) {
    if (!r.id || !r.when || !(r.w > 0) || !r.text?.length) errors.push(`camp line ${r.id ?? '?'}: id, when, w, text`);
    if (r.when && !/^(event:|stat:|area:|heard(:shot|:engine)?$|news$|any$)/.test(r.when)) errors.push(`camp line ${r.id}: when must be event:|stat:|area:|heard[:shot|:engine]|news|any`);
    for (const t of r.text ?? []) for (const m of t.matchAll(/\{(\w+)\}/g)) if (!['you', 'name', 'place', 'area', 'region', 'target', 'by', 'dir', 'hp', 'kills', 'cash', 'heard', 'other'].includes(m[1])) errors.push(`camp line ${r.id}: unknown {${m[1]}}`);
  }
  if (!(rows.CAMPFIRE?.leaveR > rows.CAMPFIRE?.sitR)) errors.push('campfire: leaveR > sitR');
  if (purple(rows.CAMPFIRE?.glow?.color)) errors.push('campfire: purple glow');
  return { ok: errors.length === 0, errors };
}
