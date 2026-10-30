// THE LONG ROAD (docs/design/WEB_LONG_ROAD.md): what makes a drive between towns worth taking. Robert's playtest,
// 2026-10-29: "That bitch was empty, bro ... we should pride ourselves on long distance." Rows only: the gap audit's
// numbers, the WAYSIDE beats that fill a dead stretch (a stall, a wreck to strip, a family broken down, a burned-out
// checkpoint, an ambush set up behind a wreck), and the TRAVELLERS who stand at them (every one has an origin and a
// destination: real towns on the road, behind and ahead of them). systems/longroad.js places the beats as a pure function
// of these rows, the seed and the built road, and only into stretches the gap audit found dead: nothing doubles a
// roadside site, a sign or a town. Nothing teleports (people are made real out of sight), nothing regenerates (what is
// taken stays taken, who dies stays dead: the save), and every beat carries its source (the audit mile that called for it).

export const LONG_ROAD = {
  cruise: 30,        // m/s: the speed the audit turns metres into seconds of driving (about 67 mph on the dial)
  maxGapS: 150,      // a stretch with nothing to see or meet for longer than this is DEAD (the brief: 1-3 minutes)
  everyS: 70,        // a dead stretch gets a beat every ~this many seconds of driving (jittered by the seed)
  jitter: 0.3,       // +- fraction of everyS
  sight: 140,        // m from the centreline: what counts as seen from the road (a sign, a site, a town edge)
  step: 200,         // m: the audit's sample step along the road
  edge: 1500,        // m: no beat this close to either end of the road (the dust wall, the coast)
  townClear: 1800,   // m: no beat inside a town's reach (the town is the thing to see there)
  offset: [24, 34],  // m off the centreline, to the outer shoulder (beyond the carriageway; the median is not a stop)
  wake: 460,         // m: a beat ahead is made real inside this ...
  view: 120,         // m: ... but never inside this (nothing spawns in view: the top-down camera shows ~90 m)
  far: 760,          // m: past this a beat goes back to its record (dead stays dead, taken stays taken)
  metPass: 90,       // m: passing a beat this close counts it as MET on the trip log
  tripMinM: 4000,    // m: a drive shorter than this is not a journey (no log)
  tripStopS: 12,     // s stopped near a town ends the journey
};

// Biome weights per beat kind (usmap legend: d desert, f scrub, p plains, a farmland, m mountains, F forest, s swamp, u urban).
// A kind missing from a biome's row never stands there.
export const BIOME_MIX = { // wrecks weigh light: chunkgen already strews dead cars on every shoulder; the wayside is for PEOPLE
  d: { wreck: 1, stall: 3, checkpoint: 2, family: 2, ambush: 2, body: 1, hitch: 2 },
  f: { wreck: 1, stall: 3, checkpoint: 1, family: 3, ambush: 2, body: 1, hitch: 2 },
  p: { wreck: 1, stall: 3, checkpoint: 1, family: 3, ambush: 1, body: 1, hitch: 2 },
  a: { wreck: 1, stall: 4, family: 3, ambush: 1, body: 1, hitch: 2 },
  m: { wreck: 2, checkpoint: 2, ambush: 3, body: 1, hitch: 1, stall: 1 },
  F: { wreck: 1, stall: 1, family: 2, ambush: 3, body: 1, hitch: 1 },
  s: { wreck: 1, stall: 2, family: 1, ambush: 2, body: 1 },
  u: { wreck: 2, checkpoint: 2, ambush: 2, body: 1, stall: 1 },
};

// What each beat IS when it is made real: wrecks (records for systems/wrecks.js: type, state, dx dz rot off the beat's
// spot, along the road), people (TRAVELLERS rows by role; hostile ones fight), and a one-time cache (taken once: E beside it).
export const WAYSIDE = {
  wreck: { name: 'A WRECK ON THE SHOULDER', note: 'two cars that met at speed; one still has a trunk', wrecks: [['sedan', 'rusted', 0, 0, 0.4], ['pickup', 'rusted', 5, 2, -1.2]], cache: { scrap: 2, ammo_smg: 18 } },
  stall: { name: 'A ROADSIDE STALL', note: 'a trader working the shoulder off a pickup bed', wrecks: [['pickup', 'stripped', 0, 0, 1.57]], people: ['trader'], cache: null },
  family: { name: 'A FAMILY BROKEN DOWN', note: 'a van with its hood up and three people beside it, going somewhere', wrecks: [['van', 'rusted', 0, 0, 0.1]], people: ['parent', 'parent', 'kid'], cache: null },
  checkpoint: { name: 'A BURNED-OUT CHECKPOINT', note: 'somebody held this stretch once; the cars across the shoulder burned', wrecks: [['sedan', 'burned', -4, 0, 1.57], ['pickup', 'burned', 4, 1, 1.4]], people: [], cache: { scrap: 3, rag: 2 } },
  body: { name: 'A BODY BY THE ROAD', note: 'whoever they were walked a long way to die here; their pack is still on', wrecks: [], people: [], cache: { beans_tin: 1, water_bottle: 1, bandage: 1 } },
  ambush: { name: 'AN AMBUSH SET UP', note: 'a wreck pulled half across the shoulder, and men lying in the brush behind it', wrecks: [['sedan', 'rusted', 0, 0, 1.2]], people: ['raider', 'raider'], cache: null },
  hitch: { name: 'A HITCHHIKER', note: 'a thumb out on the shoulder, a sign with a town on it', wrecks: [], people: ['hitch'], cache: null },
};

// The people who stand at the beats, by role. Every one is a traveller: systems/longroad.js gives each an ORIGIN (the
// nearest real town behind them on the road) and a DESTINATION (the nearest ahead) the moment their beat is placed.
// portrait: the same fields the roadside keepers wear (skin, hair, shirt, hat, gear); flag: a real country, always.
export const TRAVELLERS = {
  trader: { faction: 'drifter', hp: 110, weapon: 'pistol', names: [['MARISOL VEGA', 'mx'], ['ABE KOWALCZYK', 'pl'], ['NNAMDI OKAFOR', 'ng'], ['LUCIA FERRANTE', 'it']], title: 'Shoulder trader', line: 'Water, wire, a little fuel. Coming from {from}, going to {to}. What are you buying?', portrait: { skin: '#a47250', hair: '#2a1d14', shirt: '#6a5a3c', hat: 'cowboy', gear: 'bandolier' } },
  parent: { faction: 'drifter', hp: 90, weapon: null, names: [['DANIEL ORTIZ', 'us'], ['HANNA LINDQVIST', 'se'], ['PRIYA RAMAN', 'in'], ['TOMAS NOVAK', 'cz'], ['GRACE MENSAH', 'gh']], title: 'On the move', line: 'Belt went outside {from}. We were making for {to}. You got a belt, or a ride?', portrait: { skin: '#c99a76', hair: '#3a2a1a', shirt: '#4a5a6a', hat: 'short', gear: 'none' } },
  kid: { faction: 'drifter', hp: 60, weapon: null, names: [['MATEO ORTIZ', 'us'], ['ELSA LINDQVIST', 'se'], ['KOFI MENSAH', 'gh']], title: 'Kid', line: 'Are we there yet? Dad says {to} has a well.', portrait: { skin: '#c99a76', hair: '#5a3a1a', shirt: '#8a5a3a', hat: 'short', gear: 'none' } },
  raider: { faction: 'raider', hp: 100, weapon: 'smg', hostile: true, names: [['CUTTER', 'us'], ['DRY HOLLIS', 'us'], ['KNUCKLES REYES', 'mx'], ['VOLKOV', 'ru'], ['SAINT BRANDT', 'de'], ['TALLY OYELARAN', 'ng'], ['MUSKRAT DUBOIS', 'ca'], ['RED DONOVAN', 'ie'], ['PILAR ACOSTA', 'ar'], ['BONE KEANE', 'au']], title: 'Road pirate', line: 'Out of {from}, working the road to {to}.', portrait: { skin: '#9a6a4a', hair: '#1a1410', shirt: '#3a2a20', hat: 'wrap', gear: 'goggles' } },
  hitch: { faction: 'drifter', hp: 90, weapon: null, names: [['JUNE PARRISH', 'us'], ['YUSUF DEMIR', 'tr'], ['AIKO TANAKA', 'jp'], ['RHYS MORGAN', 'gb']], title: 'Hitchhiker', line: 'Walked from {from}. Trying for {to}. Sign says it.', portrait: { skin: '#b88a66', hair: '#6a4a2a', shirt: '#5a6a4a', hat: 'cap', gear: 'bandana' } },
};

// Checks the rows (the World Forge's validate, and `longRoad action=validate`). Returns { ok, errors }.
export function validateLongRoad(items = null) {
  const errors = [], R = LONG_ROAD;
  if (!(R.view < R.wake && R.wake < R.far)) errors.push('LONG_ROAD: view < wake < far must hold (nothing spawns in view)');
  if (!(R.everyS < R.maxGapS)) errors.push('LONG_ROAD: everyS must be under maxGapS, or a filled stretch is still dead');
  for (const [b, mix] of Object.entries(BIOME_MIX)) for (const k of Object.keys(mix)) if (!WAYSIDE[k]) errors.push(`BIOME_MIX.${b}: no WAYSIDE row "${k}"`);
  for (const [k, w] of Object.entries(WAYSIDE)) {
    if (!w.name) errors.push(`WAYSIDE.${k}: no name`);
    for (const p of w.people ?? []) if (!TRAVELLERS[p]) errors.push(`WAYSIDE.${k}: no TRAVELLERS row "${p}"`);
    for (const r of w.wrecks ?? []) if (!['sedan', 'pickup', 'van'].includes(r[0]) || !['rusted', 'burned', 'stripped'].includes(r[1])) errors.push(`WAYSIDE.${k}: bad wreck ${r}`);
    if (items) for (const id of Object.keys(w.cache ?? {})) if (!items[id]) errors.push(`WAYSIDE.${k}: cache item "${id}" is not in ITEMS`);
    if (!(w.wrecks?.length || w.people?.length || w.cache)) errors.push(`WAYSIDE.${k}: nothing to see or meet`);
  }
  for (const [k, t] of Object.entries(TRAVELLERS)) {
    if (!t.names?.length) errors.push(`TRAVELLERS.${k}: no names`);
    for (const [n, f] of t.names ?? []) if (!/^[a-z]{2}$/.test(f)) errors.push(`TRAVELLERS.${k}: ${n} has no real flag`);
    if (!/\{from\}|\{to\}/.test(t.line ?? '')) errors.push(`TRAVELLERS.${k}: the line never says where they are from or going`);
  }
  return { ok: !errors.length, errors };
}
