// What everything is made of (docs/design/WEB_MATERIALS.md). Rows only: systems/materials.js reads them, nothing here
// runs. A new material, or a new rule for what a thing is made of, is a row here, not a code path.
//
// MATERIALS: one row per material.
//   name      what the `material` command calls it
//   stop      a round's ENERGY one square pass through a typical piece of it soaks up (a round's energy is its damage x
//             its PUNCH, below). A round with more energy than that goes on through with what is left, and its damage
//             scales down by the same share; an oblique pass soaks more (x the path length over the thickness, at most
//             PEN.maxSlant). Infinity: nothing gets through, however hard it hits.
//   ricochet  chance a round glances off when it meets the face at a grazing angle under `ricAngle` degrees (always,
//             under half of it); 0: never. A glancing round keeps PEN.ricKeep of its energy and flies on.
//   spray     what a hit throws: splinters | dust | sparks | shards | chips | fibres | puff | none
//   hole      the mark it leaves on the face: wood | masonry | metal | none (systems/blood.js decal tiles)
//   tint      the hole decal's colour (a hole in plaster is pale, in timber is raw wood)
//   hpM2      hit points per square metre of face: a wall's 1 m strip has hpM2 x its height, a door hpM2 x its area, a
//             piece of furniture hpM2 x its long side x its height (at most 2 m)
//   bulletMul share of a round's damage the material itself takes (masonry 0: it chips, it does not wear through)
//   breaks    true: it breaks when its hp runs out (a breach in a wall, a door off its hinges, a crate in pieces);
//             false: it chips and holds
//   breach    metres of wall a break opens (centred on the broken strip); a car or a blast can open more
//   blastRes  0..1 share of a blast it shrugs off (1: a blast only scorches it)
//   fire      null: does not burn. { ignite: seconds in flame before it catches, burn: seconds it burns before it
//             collapses, char: the colour it burns to }
//   sound     the impact sound family (systems/audio.js: thud | ricochet | clink | dull)
//   look      the pattern a placed piece is drawn with (systems/materials.js piece shader): plaster | planks | sheet |
//             block | brick | sandbag | plate | mesh | concrete | cloth | rubber
//   color     a placed piece's colour
export const MATERIALS = {
  wood:        { name: 'wood', stop: 12, ricochet: 0, ricAngle: 0, spray: 'splinters', hole: 'wood', tint: '#c9a47a', hpM2: 60, bulletMul: 0.5, breaks: true, breach: 1.2, blastRes: 0.35, fire: { ignite: 1.5, burn: 32, char: '#1d1713' }, sound: 'thud', look: 'planks', color: '#8f6b45' },
  drywall:     { name: 'drywall and plaster', stop: 8, ricochet: 0, ricAngle: 0, spray: 'dust', hole: 'masonry', tint: '#e2dccf', hpM2: 30, bulletMul: 1.0, breaks: true, breach: 1.3, blastRes: 0.5, fire: null, sound: 'dull', look: 'plaster', color: '#d9d2c2' },
  adobe:       { name: 'adobe', stop: 140, ricochet: 0, ricAngle: 0, spray: 'dust', hole: 'masonry', tint: '#c79a6e', hpM2: 400, bulletMul: 0, breaks: false, breach: 0, blastRes: 0.85, fire: null, sound: 'dull', look: 'plaster', color: '#b98a5c' },
  stucco:      { name: 'stucco on a timber frame', stop: 30, ricochet: 0, ricAngle: 0, spray: 'dust', hole: 'masonry', tint: '#d8cdb8', hpM2: 160, bulletMul: 0, breaks: false, breach: 0, blastRes: 0.7, fire: null, sound: 'dull', look: 'plaster', color: '#c8b896' },
  brick:       { name: 'brick', stop: 220, ricochet: 0.05, ricAngle: 12, spray: 'chips', hole: 'masonry', tint: '#b07a62', hpM2: 600, bulletMul: 0, breaks: false, breach: 0, blastRes: 0.92, fire: null, sound: 'dull', look: 'brick', color: '#9a5a42' },
  block:       { name: 'concrete block', stop: 170, ricochet: 0.05, ricAngle: 12, spray: 'chips', hole: 'masonry', tint: '#c4c0b6', hpM2: 520, bulletMul: 0, breaks: false, breach: 0, blastRes: 0.9, fire: null, sound: 'dull', look: 'block', color: '#a8a49a' },
  concrete:    { name: 'poured concrete', stop: Infinity, ricochet: 0.12, ricAngle: 15, spray: 'chips', hole: 'masonry', tint: '#cfcbc2', hpM2: 900, bulletMul: 0, breaks: false, breach: 0, blastRes: 1, fire: null, sound: 'dull', look: 'concrete', color: '#9d9a92' },
  sheet_metal: { name: 'sheet metal', stop: 10, ricochet: 0.3, ricAngle: 20, spray: 'sparks', hole: 'metal', tint: '#b8b4aa', hpM2: 80, bulletMul: 0.3, breaks: true, breach: 1.1, blastRes: 0.45, fire: null, sound: 'clink', look: 'sheet', color: '#8b8a82' },
  steel:       { name: 'steel plate', stop: Infinity, ricochet: 0.9, ricAngle: 35, spray: 'sparks', hole: 'metal', tint: '#d6d2c8', hpM2: 2000, bulletMul: 0, breaks: false, breach: 0, blastRes: 0.95, fire: null, sound: 'ricochet', look: 'plate', color: '#8b8e88' },
  glass:       { name: 'glass', stop: 2, ricochet: 0, ricAngle: 0, spray: 'shards', hole: 'none', tint: '#cfe6ee', hpM2: 18, bulletMul: 1, breaks: true, breach: 0, blastRes: 0, fire: null, sound: 'clink', look: 'plate', color: '#9fc2d0' },
  chainlink:   { name: 'chain-link', stop: 0, ricochet: 0, ricAngle: 0, spray: 'sparks', hole: 'none', tint: '#9a9a92', hpM2: 120, bulletMul: 0, breaks: false, breach: 0, blastRes: 0.8, fire: null, sound: 'clink', look: 'mesh', color: '#8e9088' },
  sandbags:    { name: 'sandbags', stop: 260, ricochet: 0, ricAngle: 0, spray: 'puff', hole: 'none', tint: '#b7a27c', hpM2: 700, bulletMul: 0, breaks: false, breach: 0, blastRes: 0.85, fire: null, sound: 'dull', look: 'sandbag', color: '#a8936c' },
  cloth:       { name: 'cloth and tarp', stop: 1, ricochet: 0, ricAngle: 0, spray: 'fibres', hole: 'none', tint: '#5a6a58', hpM2: 15, bulletMul: 0.2, breaks: true, breach: 1.5, blastRes: 0, fire: { ignite: 0.4, burn: 9, char: '#16120f' }, sound: 'dull', look: 'cloth', color: '#4f6a5a' },
  rubber:      { name: 'rubber', stop: 26, ricochet: 0.1, ricAngle: 15, spray: 'puff', hole: 'none', tint: '#2a2826', hpM2: 200, bulletMul: 0.4, breaks: false, breach: 0, blastRes: 0.5, fire: { ignite: 6, burn: 70, char: '#0e0d0c' }, sound: 'thud', look: 'rubber', color: '#262422' },
  // Not on the brief's list, but the world is full of them.
  scrap_wall:  { name: 'corrugated sheet on a packed-earth core', stop: 120, ricochet: 0.25, ricAngle: 20, spray: 'sparks', hole: 'metal', tint: '#a4826a', hpM2: 500, bulletMul: 0, breaks: false, breach: 0, blastRes: 0.85, fire: null, sound: 'clink', look: 'sheet', color: '#7a4524' },
  carbody:     { name: 'a car body (panels, frame, engine)', stop: 70, ricochet: 0.2, ricAngle: 18, spray: 'sparks', hole: 'metal', tint: '#9a948a', hpM2: 900, bulletMul: 0, breaks: false, breach: 0, blastRes: 0.7, fire: null, sound: 'clink', look: 'sheet', color: '#5a3a24' },
  timber:      { name: 'a living trunk', stop: 200, ricochet: 0, ricAngle: 0, spray: 'splinters', hole: 'wood', tint: '#b08a62', hpM2: 900, bulletMul: 0, breaks: false, breach: 0, blastRes: 0.9, fire: null, sound: 'thud', look: 'planks', color: '#5d4a34' },
  rock:        { name: 'rock', stop: Infinity, ricochet: 0.15, ricAngle: 15, spray: 'chips', hole: 'masonry', tint: '#b9a88e', hpM2: 5000, bulletMul: 0, breaks: false, breach: 0, blastRes: 1, fire: null, sound: 'dull', look: 'concrete', color: '#8a7a62' },
};

// How hard a round hits through things, by the ammo it is (data/items.js AMMO): energy = damage x punch. A rifle round
// carries through what stops a pistol's; buckshot pellets spend themselves on the first board. Unknown ammo: 1.
export const PUNCH = { pistol: 1.0, smg: 1.0, shells: 0.5, rifle: 1.9 };

// Penetration and ricochet tuning.
//   maxSlant   an oblique pass soaks at most this many times a square one
//   maxDepth   a box thicker than this (m, its smaller side) is solid mass: a tower block, a boulder; never passed
//   ricKeep    share of its energy a glancing round keeps
//   ricJitter  radians of scatter on a glancing round
//   segments   at most this many walls one round goes through (and glances off)
//   exitGap    m past the far face a round carries on from
export const PEN = { maxSlant: 2.5, maxDepth: 1.25, ricKeep: 0.55, ricJitter: 0.12, segments: 4, exitGap: 0.04 };

// Blasts on structures: a blast of radius r hits a thing d metres off for powerPerM x r x (1 - d / r) x (1 - blastRes).
// A frag (r 7) is 490 at its heart; a car going up (r 9) is 630.
export const BLAST = { powerPerM: 70, cars: 2.2 };

// Rams: a car into something that breaks deals speed (m/s) squared x perSpeed2 to it (once every `every` s), above
// minSpeed; the breach it opens is at least `breach` m wide.
export const RAM = { minSpeed: 6, perSpeed2: 2.2, every: 0.25, breach: 2.4 };

// Fire on things that burn: how often the fires are checked for what they touch (s), the margin round a burning thing
// its fire patch reaches (m: how it spreads to what is near), flame particles a second per metre of it burning.
// merge: a burning thing within this many metres of one of these fires feeds it instead of starting its own (up to
// maxR m across); a blaze is one fire, not a stack of them.
export const FIRE = { every: 0.25, margin: 0.9, flamesPerM: 2, smokePerS: 2.5, merge: 3, maxR: 4.5 };

// What a thing is made of, by rule (systems/materials.js classify). Nothing is hand-tagged: a collision box's tag, and for
// a building's walls the building (Rust Haven or the ruins, the island or the ring, outer wall or partition) and the
// finish the wall shader paints on it (world/surfaces.js wallFinish: 0-5 stucco, 6-8 concrete block, 9 brick).
//   tags       a box tag straight to a material (first: these win over everything below)
//   finish     a wall's painted finish to a material, outside walls. town: Rust Haven's rebuilt walls
//   partition  inside walls (between rooms): every building's
//   unknown    anything no rule names
export const MATERIAL_RULES = {
  tags: {
    crate: 'wood', shelf: 'wood', furniture: 'wood', table: 'wood', desk: 'wood', bench: 'wood', booth: 'wood', stall: 'wood',
    barricade: 'wood', bleachers: 'wood',
    tent: 'cloth',
    hut: 'cloth',  // a Greyborn shelter: hides and tarp over poles (systems/greyborn.js)
    husk: 'cloth', // the body you left where you fell: soft, rounds pass (systems/clone.js)
    barrel: 'sheet_metal', drum: 'sheet_metal', /* the hot ground's leaking drums (systems/hotground.js) */ junk: 'sheet_metal', shed: 'sheet_metal', pump: 'sheet_metal', lockers: 'sheet_metal', racks: 'sheet_metal',
    wreck: 'carbody', car: 'carbody', chassis: 'carbody', engine: 'carbody',
    tank: 'steel', tower: 'steel', boxcar: 'steel', rail: 'steel', ramp: 'steel', mast: 'steel', flagpole: 'steel', post: 'steel',
    pole: 'steel', boom: 'steel', bunk: 'steel', milbox: 'steel', generator: 'steel',
    fence: { island: 'chainlink', ring: 'block' }, // the base's wire on the island; the ring's yard walls are block
    townwall: 'scrap_wall',
    sandbags: 'sandbags',
    barrier: 'concrete', pool: 'concrete', storey: 'concrete', building: { finish: true }, // a solid block: by its finish
    tree: 'timber', cactus: 'timber',
    husk: 'timber', drum: 'sheet_metal', hut: 'wood', // the hot ground's dead trunks and rusted drums, a Greyborn settlement's huts (they stand up at runtime)
    rock: 'rock', boulder: 'rock',
  },
  finish: { town: ['adobe', 'adobe', 'adobe', 'adobe', 'adobe', 'adobe', 'block', 'block', 'block', 'brick'],
            other: ['stucco', 'stucco', 'stucco', 'stucco', 'stucco', 'stucco', 'block', 'block', 'block', 'brick'] },
  partition: 'drywall',
  unknown: 'concrete',
  // A door leaf by its row's material (data/interiors.js DOOR_MATERIALS), a boarded window's boards, a car's parts.
  // What can break, on the island (the ring's buildings are a pure function of the data and stay whole for now; their
  // doors break like the island's): walls of these tags break in strips (only a material that breaks: in practice the
  // drywall partitions), boxes of these tags break whole. Placed pieces always can.
  breakable: { walls: ['wall'], props: ['crate', 'shelf', 'furniture', 'table', 'desk', 'bench', 'booth', 'stall', 'tent', 'barricade'] },
  doors: { wood: 'wood', metal: 'steel' },
  boards: 'wood',
  car: { body: 'sheet_metal', plated: 'steel', glass: 'glass', tyres: 'rubber' },
};

// Placed pieces (`build` command): walls and shacks of a material, stood on the island. A wall is `len` long, `h` high
// and `t` thick (t is its collision thickness: a sheet is thin to the eye, never thinner than 0.12 m to a mover).
export const PIECES = {
  plank_wall:    { mat: 'wood', h: 2.2, t: 0.14, len: 3 },
  sheet_wall:    { mat: 'sheet_metal', h: 2.3, t: 0.12, len: 3 },
  drywall:       { mat: 'drywall', h: 2.6, t: 0.14, len: 3 },
  block_wall:    { mat: 'block', h: 2.0, t: 0.25, len: 3 },
  brick_wall:    { mat: 'brick', h: 2.0, t: 0.25, len: 3 },
  concrete_wall: { mat: 'concrete', h: 2.4, t: 0.3, len: 3 },
  sandbags:      { mat: 'sandbags', h: 1.05, t: 0.7, len: 3 },
  steel_plate:   { mat: 'steel', h: 2.0, t: 0.12, len: 2.4 },
  chainlink:     { mat: 'chainlink', h: 2.2, t: 0.12, len: 3 },
  tarp:          { mat: 'cloth', h: 2.0, t: 0.12, len: 3 },
  crate:         { mat: 'wood', h: 1.0, t: 1.0, len: 1.0, prop: true },
  // A shack: four walls of `mat` (wood | sheet_metal) round a w x d floor, a door gap in its front (the -z side) and a
  // tarp across the top that hides nothing (it is see-through from the game camera: a frame of cloth strips).
  shack:         { mat: 'wood', h: 2.2, t: 0.14, w: 3.4, d: 3.0, door: 1.1, shack: true },
};

// Blood (systems/blood.js). Colours are linear-lit Lambert decals: dark arterial red drying to brown, never cartoon red,
// never purple.
//   fresh, dry   the colour a splash starts at and dries to; `dryHours` to get most of the way (1 - e^-age/dryHours)
//   reach        m behind a hit person a wall, a car or the floor takes their blood (along the round's line)
//   wallMax      the wall and smear decal ring (oldest goes first)
//   washPerHour  share of an outdoor splash a full rain washes away in an hour of game time
//   smearEvery   m a dragged body leaves a smear every
export const BLOOD = {
  fresh: '#5a0707', dry: '#3c2417', dryHours: 3.5, reach: 2.5, wallMax: 640, washPerHour: 0.45, smearEvery: 0.45,
  // Tints of the impact marks by what was hit (the hole tiles are grey; these colour them).
  scorch: '#1a1512',
};
