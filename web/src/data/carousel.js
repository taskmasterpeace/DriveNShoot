// THE CAROUSEL as rows (docs/design/WEB_CAROUSEL.md; the gap plan's G6, docs/design/WEB_DEATHLANDS_GAP.md §3, §4.5).
// A Carousel station is a sealed site under the ground (systems/underground.js builds it: kind `station` in
// data/underground.js) whose deepest room is a RING PLATFORM: a raised round deck under a hanging ring, a blast door, two
// consoles. Wake the station (its generator), learn the ring's code (a card somewhere below), arm the ring at a console,
// and it throws whoever stands on the deck to another ring: a known one (PAIR, with its access key), a random one far away
// (ROULETTE), or back to the last ring you came out of (BACKSPIN, no key, and it hurts). It throws people and dogs, never
// a vehicle: your rig stays parked where you left it, with its fuel and its damage. Every throw leaves you ring-sick.
//
// Everything here is data: change a row, not systems/carousel.js. Our own words only (tools/ip-lint.mjs): Carousel,
// ring-sick, scrip, holdout. No purple anywhere (hue 270-320 is banned): the ring is amber, bone and old steel.

// ---- the knobs (WEB_CAROUSEL.md §7 gives the safe ranges) ----------------------------------------------------------------
//   platformR   the deck's radius (m): who stands inside it at the throw goes
//   crewR       a crew member or a dog of yours this near the ring's centre, on its level, goes with you
//   spin        seconds from ARM to the throw: `build` of it the ring builds (a slow pulse), the rest it is frantic
//   live        seconds the vortex holds at full before it throws
//   afterglow   seconds an arrival ring takes to die back down after it catches you
//   arrivalHold seconds of black before the blast door grinds open (the cold-open)
//   consoleR    how near a console you must stand to work it
//   badHurt     hp a bad throw takes from each traveller (the ring spits you out wrong)
export const RING = {
  platformR: 3.6, crewR: 14, spin: 4.2, build: 0.6, live: 0.7, afterglow: 3.5, arrivalHold: 2.4, consoleR: 2.4, badHurt: 14,
  // ROULETTE throws long: it never lands you in the region you left while a ring in another streamed region answers.
  rouletteLong: true,
  // The look (systems/carousel.js builds one set and moves it to the live station's ring room). Colours only, no lights:
  // the ring glows with its own emissive surfaces under the underground's dark (the light count never changes).
  look: {
    deck: '#6a655a', deckEdge: '#3c3a34', halo: '#7c7a70', pylon: '#5e6258',
    dim: '#3a2a14', glow: '#ffb347', hot: '#fff1c8', vortexA: '#ff9a2e', vortexB: '#f2e2b8', board: '#1a1712', boardText: '#ffb347', boardDead: '#5a4a32',
  },
};

// ---- ring-sickness (WEB_DEATHLANDS_GAP §4.5) -----------------------------------------------------------------------------
// n stacks (0..max). Each stack: aim spread +spread (the one consumer, g.needs.sway, systems/combat.js), screen sway
// amplitude +sway (degrees of a slow roll and a drift), blurred edges +blur (the share of the screen's half-width from the
// edge inward that swims), darkened edges +vignette (the REST look, systems/survival.js); from microAt stacks the eyes
// close on their own (the REST microsleep). One stack goes per decayMin game minutes of rest (not sprinting, no shot of
// yours in the last calmS seconds; asleep counts double: you are resting hard).
// gain: stacks a throw adds. ROULETTE adds 1, + badExtra on a bad throw; the bad-throw chance is bad0 + badDamaged x the
// ring's damage (0..1 on its row).
export const SICK = {
  max: 5, spread: 0.06, sway: 0.15, blur: 0.08, vignette: 0.08, microAt: 4,
  decayMin: 20, calmS: 10, sleepMul: 2,
  gain: { pair: 1, roulette: 1, backspin: 1 }, badExtra: 2, bad0: 0.04, badDamaged: 0.08,
};

// ---- the ways a ring throws ----------------------------------------------------------------------------------------------
//   needsKey  PAIR wants the access key of where you are going in your pack (keys are items: KEYS below)
//   needsCode the ring must be armed (its code keyed in at a console, the station powered)
//   to        'key' (the key's station) | 'random' (any other ring that answers) | 'last' (the ring you last came out of)
export const JUMP_KINDS = {
  pair: { name: 'PAIR', to: 'key', needsKey: true, needsCode: true, desc: 'to a ring you hold the key for' },
  roulette: { name: 'ROULETTE', to: 'random', needsKey: false, needsCode: true, desc: 'anywhere a ring answers - far, and sometimes badly' },
  backspin: { name: 'BACKSPIN', to: 'last', needsKey: false, needsCode: false, desc: 'back to the last ring you came out of, no key, and it hurts' },
};

// ---- the stations ----------------------------------------------------------------------------------------------------------
// One row a station. region: where it stands (arizona | florida | a state the streamer does not lay out yet: those rows
// are dark - ROULETTE skips them, PAIR refuses them - until their region streams). Where it is, one of:
//   at: [x, z]             world metres (Arizona: Phoenix at 0, 0)
//   near: holdout id, d: [dx, dz]   metres from a holdout's centre (Florida: Meridian)
//   base: an ATLAS_BASES id         the installation's projected point (data/atlas.js ATLAS_XZ)
// The site (data/underground.js kind `station`): dir the hatch stair goes down, seed, fuel in its generator's tank (0:
// you bring a can), holdout: who holds it (undefined: the dead live in it, as a station's kind rows say).
// damaged: the ring's wear (0..1, the bad-throw chance, SICK). key: the item id of its access key (KEYS makes the rows).
// note: one line for the World Forge's card.
export const STATIONS = [
  { id: 'papago', name: 'PAPAGO DEEP', region: 'arizona', at: [1640, -260], dir: 'W', seed: 7101, fuel: 0, damaged: 0.1,
    note: 'under the buttes east of Phoenix, past the edge of the dead metro: the first ring most people ever hear' },
  { id: 'gila', name: 'GILA BEND ANNEX', region: 'arizona', at: [-9200, 8400], dir: 'N', seed: 7102, fuel: 0.4, damaged: 0.55,
    note: 'a cracked ring under the creosote south-west of Phoenix; it throws, mostly' },
  { id: 'meridian', name: 'MERIDIAN DEEP', region: 'florida', near: 'meridian', d: [560, -380], dir: 'S', seed: 7103, fuel: 0, damaged: 0.05,
    note: 'under the pine flats east of Meridian; the holdout does not talk about the hatch' },
  // Dark until their regions stream (data/regions.js): rows now, rings later.
  { id: 'mountain', name: 'THE MOUNTAIN RING', region: 'colorado', base: 'cheyenne_mountain', dir: 'E', seed: 7104, fuel: 0.6, damaged: 0,
    note: 'inside the mountain; the machine keeps it lit for nobody' },
  { id: 'killeen', name: 'KILLEEN RING', region: 'texas', base: 'fort_hood', dir: 'S', seed: 7105, fuel: 0.2, damaged: 0.3,
    note: 'under the tank ranges; the ruler\'s men stand on its hatch' },
  { id: 'chattahoochee', name: 'CHATTAHOOCHEE RING', region: 'georgia', base: 'fort_benning', dir: 'W', seed: 7106, fuel: 0, damaged: 0.2,
    note: 'under the old jump towers; something down there still sings' },
];

// ---- access keys (items) ----------------------------------------------------------------------------------------------------
// A ring's key is a stamped steel bar with its station's plate cut into it. One item row a station (systems/carousel.js
// registers them into data/items.js ITEMS at boot), plus the blank and the cutter's kit. A key is a tool (traders who deal
// in tools buy and sell them). A keycutter (the kit) cuts a blank into the key of the ring whose console you stand at.
export const KEY_ITEM = { kind: 'tool', kg: 0.12, bulk: 0.05, stack: 3, value: 140, tags: ['ringkey', 'steel'] };
export const KEYS_EXTRA = {
  key_blank: { name: 'Key blank', kind: 'tool', kg: 0.1, bulk: 0.05, stack: 5, value: 25, tags: ['steel'],
    desc: 'A bar of stamped steel the length of a hand, notched at one end and blank at the other. Somebody cuts these for the rings.' },
  keycutter: { name: 'Keycutter\'s kit', kind: 'tool', kg: 1.4, bulk: 0.9, stack: 1, value: 160, tags: ['keycutter', 'steel'],
    desc: 'Files, a punch set and a jig in a canvas roll. At a ring\'s console it reads the plate and cuts a blank to match.' },
};
export const keyId = (stationId) => `ringkey_${stationId}`;

// Where keys turn up (data/items.js LOOT shape): a station's command room and the ring room's consoles; blanks in stores.
// rows name a station key as `key:<station>`; systems/carousel.js expands them to item ids at boot.
export const KEY_LOOT = {
  ring_keys: { rolls: [1, 2], none: 2, rows: [['key:papago', 3, 1, 1], ['key:meridian', 3, 1, 1], ['key:gila', 2, 1, 1], ['key:mountain', 1, 1, 1], ['key_blank', 3, 1, 2], ['ammo_rifle', 2, 6, 20]] },
};
// Which loot tables gain a key row (the table, the row): a vault's vault, a bunker's command.
export const KEY_SEED = [['ug_vault', ['key_blank', 1, 1, 1]], ['ug_comms', ['key_blank', 1, 1, 1]]];

// Trade: traders who deal in tools buy keys already; these keep a few on their shelves (data/trade.js `keeps`).
export const KEY_TRADE = { keeps: { kenji: [['key_blank', 2], ['keycutter', 1]] } };

// ---- Ring-born (the new-game option): open on black, a ring hum, ring-sick, then the blast door ------------------------------
// crew: the starter crew's rows (data/crew.js), sick: the stacks you wake with, kit: what is in your pack besides the
// usual start; hum: the ring's sound (Hz, seconds).
export const RINGBORN = {
  crew: ['thrownman', 'wall_veteran', 'field_medic'], sick: 3, kit: [['ration', 2], ['bandage', 2], ['flare', 1]],
  hum: { hz: 55, secs: 4.2 }, black: 3.2,
  fuel: 0.12, // the catching station's generator runs on its last tank share (its fans: good air; ~8 game hours at GENERATOR.burn)
  toast: 'YOU COME TO ON A RING PLATFORM · RING-SICK · THE BLAST DOOR IS OPENING',
  sub: 'Nobody knows where the ring threw you. Find a road. Find water. Then find out.',
};

// ---- the checks the World Forge runs ---------------------------------------------------------------------------------------
// ctx: { items, bases (ATLAS_XZ.bases), crew (CREW_BY_ID), holdouts (ids) }. Returns a list of problems (empty: sound).
export function validateCarousel(rows = STATIONS, ctx = {}) {
  const bad = [], ids = new Set();
  const num = (v, a, b) => Number.isFinite(v) && v >= a && v <= b;
  if (!num(RING.platformR, 2, 6)) bad.push(`RING.platformR ${RING.platformR} must be 2..6 m (a ring room is 9-13 m across)`);
  if (!(RING.build > 0 && RING.build < 1)) bad.push('RING.build is a share of the spin (0..1)');
  if (!(SICK.max >= 1 && SICK.max <= 9)) bad.push('SICK.max 1..9');
  if (!(SICK.microAt >= 1 && SICK.microAt <= SICK.max + 1)) bad.push('SICK.microAt 1..max+1');
  if (!(SICK.decayMin > 0)) bad.push('SICK.decayMin must be > 0');
  if (!num(SICK.bad0 + SICK.badDamaged, 0, 1)) bad.push('the worst bad-throw chance must stay a chance (bad0 + badDamaged <= 1)');
  for (const k of Object.keys(JUMP_KINDS)) if (!(SICK.gain[k] >= 0)) bad.push(`SICK.gain.${k} missing`);
  for (const S of rows) {
    if (!S.id || ids.has(S.id)) bad.push(`station ${S.id}: missing or duplicate id`);
    ids.add(S.id);
    if (!S.name || S.name !== S.name.toUpperCase()) bad.push(`station ${S.id}: a name, in capitals`);
    if (!S.region) bad.push(`station ${S.id}: a region`);
    const where = (S.at ? 1 : 0) + (S.near ? 1 : 0) + (S.base ? 1 : 0);
    if (where !== 1) bad.push(`station ${S.id}: exactly one of at, near, base`);
    if (S.at && !(Number.isFinite(S.at[0]) && Number.isFinite(S.at[1]))) bad.push(`station ${S.id}: at [x, z]`);
    if (S.near && !(Array.isArray(S.d) && S.d.length === 2)) bad.push(`station ${S.id}: near needs d [dx, dz]`);
    if (S.near && ctx.holdouts && !ctx.holdouts.includes(S.near)) bad.push(`station ${S.id}: no holdout ${S.near}`);
    if (S.base && ctx.bases && !ctx.bases[S.base]) bad.push(`station ${S.id}: no atlas base ${S.base}`);
    if (!'NESW'.includes(S.dir) || S.dir?.length !== 1) bad.push(`station ${S.id}: dir N, E, S or W`);
    if (!num(S.fuel ?? 0, 0, 1)) bad.push(`station ${S.id}: fuel 0..1`);
    if (!num(S.damaged ?? 0, 0, 1)) bad.push(`station ${S.id}: damaged 0..1`);
    if (!Number.isInteger(S.seed)) bad.push(`station ${S.id}: an integer seed`);
  }
  if (!rows.some((S) => S.region === 'arizona')) bad.push('no station in Arizona (one near Phoenix)');
  if (!rows.some((S) => S.region === 'florida')) bad.push('no station in Florida (the start region)');
  for (const [t, T] of Object.entries(KEY_LOOT)) for (const [id] of T.rows) {
    if (id.startsWith('key:')) { if (!ids.has(id.slice(4))) bad.push(`loot ${t}: no station ${id.slice(4)}`); }
    else if (ctx.items && !ctx.items[id] && !KEYS_EXTRA[id]) bad.push(`loot ${t}: no item ${id}`);
  }
  if (ctx.crew) for (const r of RINGBORN.crew) if (!ctx.crew[r]) bad.push(`RINGBORN.crew: no crew row ${r}`);
  if (ctx.items) for (const [id] of RINGBORN.kit) if (!ctx.items[id]) bad.push(`RINGBORN.kit: no item ${id}`);
  for (const [k, X] of Object.entries(KEYS_EXTRA)) if (!X.name || !X.desc) bad.push(`item ${k}: name and desc`);
  for (const c of Object.values(RING.look)) { const h = hueOf(c); if (h !== null && h >= 270 && h <= 320) bad.push(`RING.look ${c}: purple is banned`); }
  return bad;
}

// The hue (0..360) of a #rrggbb colour, or null for a grey.
export function hueOf(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.04) return null;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
