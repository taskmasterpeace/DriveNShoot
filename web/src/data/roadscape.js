// THE ROADSCAPE (docs/design/WEB_ROADSCAPE.md, WEB_DEPTH_PLAN.md §7): what stands beside the open road between the towns, by
// road class and by where in the country you are. Ported from Robert's road research (docs/reference/lsw/:
// ROAD-BIOMES-2026-09-21.md, between-cities.js ROAD_CLASSES/BIOME_ROAD, road-kit.js SHOULDER, road-kit-roadside.js SCENES /
// NOTHING_CHANCE / SERVICE_CHANCE, relief.js ROLL/DITCH/BED). LSW counts in 0.19 m units: every number below is METRES,
// converted once, here (the LSW value rides in a comment where it was converted).
//
// The law the research gives (and Robert's words): "sometimes there's trees close to the road, sometimes there's...
// depending on where you are in the country". The main road itself is not wild: a clear zone beside every class stays
// empty (the chunk scatter keeps to it too: world/chunkgen.js), and the ambush ground lives off the road, behind it.
//
// Everything is data: change a row, not world/roadscape.js. (The authored roadside SITES - the downed tower, the
// stations, junkyards, farms and the dam - are data/roadside.js, docs/design/WEB_ROADSIDE.md: they stand on the same roads,
// and this layer keeps off them through the chunk's keep-out.) validateRoadside() is what the World Forge and the selftest
// run. No purple (hue 270-320 is banned), no brand names on anything.

export const LSW_UNIT = 0.19;                  // metres per LSW unit (the conversion every row below has had)
// The slot cadence (road-kit-roadside.js): a slot is 336 u of road on one side (63.8 m -> 64 m), scenes are chosen
// greedily inside a block of 8 slots, and the "nothing for a while" decision (and the service stop) belongs to a
// super-block of 3 blocks (1.5 km). Every roll is a hash of (seed, road, side, slot, what), never a stream.
export const CADENCE = { slot: 64, blockSlots: 8, superBlocks: 3, emptyWeight: 6 };

// ---- the road class ladder (between-cities.js ROAD_CLASSES, road-kit.js SHOULDER) ---------------------------------------
//   clearZone  tree-free, prop-free verge beyond the paved edge (m). The chunk scatter keeps out of it too.
//   ditch      the drainage ditch cut into the real-terrain grading (world/realterrain.js): `at` metres past the graded
//              road bed's edge, `width` wide, `depth` deep. Only a surveyed road (an interstate corridor) has a bed to
//              cut it beside; null: none.
//   nothing    the class factor on a road biome's NOTHING chance (NOTHING_CLASS)
//   service    the chance a super-block holds a service stop (SERVICE_CHANCE)
//   lsw        the research's own numbers for this class, in metres (the built cross-section is data/streaming.js's)
// DSOA GRID LAW: the ground is an 8 m grid and the road bed is flat to TERRAIN.formation (24 m) so the paved edge never
// tilts; a ditch can only start past the bed, so the interstate's clear zone is wider than the research's 9.1 m (48 u):
// it covers the ditch, as the research's does.
export const ROAD_CLASSES = {
  interstate: { label: 'Interstate', clearZone: 18, nothing: 1.15, service: 0, ditch: { at: 0.5, width: 7, depth: 0.75 },
    lsw: { clearZone: 9.1, shoulder: 4.6, median: 12.2, lanes: 6 }, // 48 u, 24 u, 64 u
    note: 'the corridors (I-10, I-95, I-75). Its service stops are the exit communities (world/worldindex.js), so SERVICE here is 0' },
  divided: { label: 'Divided highway', clearZone: 5.7, nothing: 1.1, service: 0.6, ditch: { at: 0.5, width: 6, depth: 0.6 },
    lsw: { clearZone: 5.7, shoulder: 2.7, median: 7.6, lanes: 4 } }, // 30 u, 14 u, 40 u
  'two-lane': { label: 'Two-lane highway', clearZone: 1.7, nothing: 1, service: 0.45, ditch: null,
    lsw: { clearZone: 1.7, shoulder: 1.5, lanes: 2 }, // 9 u, 8 u
    note: 'a county road (the exit cross roads and the community access roads): trees close to the car' },
  rural: { label: 'Rural route', clearZone: 2.7, nothing: 0.85, service: 0.25, ditch: null, lsw: { clearZone: 2.7, shoulder: 0, lanes: 2 } }, // 14 u
  dirt: { label: 'Dirt / forest road', clearZone: 0.8, nothing: 0.7, service: 0, ditch: null, lsw: { clearZone: 0.8, width: 4.2, lanes: 1 } }, // 4 u, 22 u
};
// Which DSOA road is which class (world/worldindex.js ribbons and corridors). Streets and ramps have no roadside: a
// town's frontage and an interchange's furniture are their own systems.
export const CLASS_OF = { corridor: 'interstate', county: 'two-lane', street: null, ramp: null, aux: null };

// ---- road biomes: the research's six families, mapped onto the country DSOA streams ------------------------------------
//   research   which LSW family it is (forest, farmland, grassland, desert, tundra, wetland)
//   nothing    NOTHING_CHANCE: a super-block (1.5 km) with nothing beside the road at all (x the class factor)
//   trees      the tree wall's species mix: [species (world/flora.js), weight, height min, height max]
//   bed        a raised road bed (relief.js BED dy: 4-6 u): metres the surveyed road rides above the land, 0: none
//   scrub      the colour of this country's low brush; ground: the verge tint scenes paint with (field rows, drives)
export const ROAD_BIOMES = {
  'pine-flat': { label: 'Florida flatwoods', research: 'forest', nothing: 0.12, bed: 0,
    trees: [['slashpine', 6, 13, 19], ['sabal', 2.5, 6, 10], ['liveoak', 1.2, 7, 10], ['deadtree', 0.4, 4, 7]], scrub: '#5d6a3a', ground: '#8a8458',
    note: 'slash pine close to the two-lane, palmetto under it, a cabbage palm here and there' },
  swamp: { label: 'Swamp and wet prairie', research: 'wetland', nothing: 0.22, bed: 0,
    trees: [['cypress', 6, 9, 15], ['sabal', 1.5, 6, 9], ['deadtree', 1, 4, 7]], scrub: '#59613a', ground: '#6e6a4a',
    note: 'cattails and sawgrass in the ditch, cypress domes back from the road, a stilt shack' },
  'forest-hills': { label: 'Forest hills (Appalachia, the Mogollon Rim)', research: 'forest', nothing: 0.12, bed: 0,
    trees: [['pine', 5, 11, 18], ['oak', 4, 7, 11], ['deadtree', 0.5, 4, 7]], scrub: '#4e5a34', ground: '#6a6448',
    note: 'a wall of trees close to the road, houses back in the woods, a power line' },
  farmland: { label: 'Farm belt', research: 'farmland', nothing: 0.2, bed: 0.8,
    trees: [['oak', 4, 7, 11], ['deadtree', 1, 4, 7]], scrub: '#6e6a3e', ground: '#9a8a5a',
    note: 'field fences, dead crop rows, farmhouse and barn up a lane, a windbreak, a power line' },
  grassland: { label: 'Plains and prairie', research: 'grassland', nothing: 0.38, bed: 0.8,
    trees: [['oak', 3, 6, 10], ['deadtree', 2, 4, 7]], scrub: '#76703f', ground: '#a69a66',
    note: 'long sight lines, a windmill and a stock tank behind a cattle fence, billboards' },
  scrub: { label: 'Semi-arid scrub', research: 'grassland', nothing: 0.42, bed: 0.6,
    trees: [['mesquite', 4, 3, 5], ['deadtree', 2, 3, 6], ['paloverde', 1, 3, 5]], scrub: '#686238', ground: '#a8946a',
    note: 'mesquite and creosote, a windmill, the odd billboard' },
  desert: { label: 'Desert West', research: 'desert', nothing: 0.5, bed: 1.0,
    trees: [['mesquite', 2, 3, 5], ['deadtree', 1, 3, 6]], scrub: '#6f6a40', ground: '#b49a6e',
    note: 'nothing for kilometres, scrub, a billboard for a town that is gone (bed 6 u: the interstate on its embankment)' },
  mountain: { label: 'Mountains', research: 'forest', nothing: 0.3, bed: 0,
    trees: [['pine', 6, 9, 16], ['deadtree', 1, 4, 7]], scrub: '#555a3a', ground: '#8a7a64',
    note: 'talus and rock beside the cut, conifers above it' },
  snow: { label: 'Snowy north', research: 'tundra', nothing: 0.5, bed: 0.95,
    trees: [['pine', 6, 8, 14], ['deadtree', 1, 4, 6]], scrub: '#4a5238', ground: '#c8ccc8',
    note: 'snow poles, a slatted snow fence back from the road, fir clumps' },
  sprawl: { label: 'Dead sprawl', research: 'farmland', nothing: 0.05, bed: 0,
    trees: [['oak', 3, 6, 10], ['deadtree', 2, 4, 7]], scrub: '#6a6640', ground: '#8e8a78',
    note: 'sound walls, houses backed to the road, billboards' },
};
// DSOA's biome letters (data/streaming.js BIOMES, the usmap legend and the real landcover) to a road biome, per region
// (a region past P1 reads its own letters: data/regions.js), then the state lists that override by latitude and range.
export const BIOME_MAP = {
  default: { d: 'desert', f: 'scrub', u: 'sprawl', m: 'mountain', p: 'grassland', a: 'farmland', w: 'desert', F: 'forest-hills', s: 'swamp', '.': 'desert' },
  florida: { F: 'pine-flat', s: 'swamp', w: 'swamp', p: 'swamp', a: 'farmland', u: 'sprawl', f: 'scrub', '.': 'scrub', d: 'scrub', m: 'pine-flat' },
  // The snowy north: its forests, plains and farms read as snow country (the research's tundra family).
  snowStates: ['ALASKA', 'MONTANA', 'NORTH DAKOTA', 'MINNESOTA', 'WISCONSIN', 'MICHIGAN', 'MAINE', 'VERMONT', 'NEW HAMPSHIRE', 'WYOMING'],
  snowLetters: ['F', 'm', 'p', 'a', 'f'],
  // Appalachia (Virginia's Blue Ridge and its neighbours): its farms and scrub are wooded hills.
  hillStates: ['VIRGINIA', 'WEST VIRGINIA', 'KENTUCKY', 'TENNESSEE', 'NORTH CAROLINA', 'PENNSYLVANIA'],
  hillLetters: ['a', 'f', 'm'],
};

// ---- scenes (road-kit-roadside.js SCENES), setbacks in METRES beyond the clear zone's edge ----------------------------
//   group      houses | wall | signage | nature | farm | service (a knob per group)
//   span       slots (1-2); side: 'one' (a hashed side) | 'both'
//   weights    per road biome; byClass per road class; nearCity: metres from a town's edge where it ramps up (x up to
//              1 + nearBoost at the edge, default 2; and, for cityOnly, the only place it stands); chance: a prop's own odds
//   props      kind (world/roadscape.js draws each), n [min,max] or a strip, set [min,max] setback, depth [min,max]
const W = (o, d = 0) => Object.fromEntries(Object.keys(ROAD_BIOMES).map((b) => [b, o[b] ?? d]));
export const SCENES = {
  'tree-wall': { label: 'Woods close to the road', group: 'nature', span: 2, side: 'both',
    weights: W({ 'forest-hills': 6, 'pine-flat': 6, mountain: 3, swamp: 5, snow: 2.2, farmland: 0.7, grassland: 0.2, scrub: 0.3, sprawl: 0.6 }),
    byClass: { interstate: 0.5, divided: 0.9, 'two-lane': 1.6, rural: 1.8, dirt: 2.4 },
    props: [{ kind: 'treewall', set: [0.2, 1.1], depth: [23, 61], spacing: 4.6, understory: 0.5 }] }, // set 1-6 u, depth 120-320 u
  'houses-off-road': { label: 'A few houses off the road', group: 'houses', span: 2, side: 'one',
    weights: W({ 'forest-hills': 3, 'pine-flat': 2, farmland: 2.2, swamp: 1.2, grassland: 0.7, snow: 0.5, sprawl: 3, scrub: 0.4 }),
    byClass: { 'two-lane': 1, rural: 1.2, divided: 0.4, dirt: 0.3 },
    props: [{ kind: 'house', n: [1, 4], set: [11, 29], drive: true, mailbox: true }, { kind: 'treescreen', n: [2, 5], set: [6, 11] }] }, // 60-150 u, 30-60 u
  'homestead-back': { label: 'A farmhouse back from the interstate (its lane off a road you can\'t see)', group: 'houses', span: 2, side: 'one',
    weights: W({ farmland: 2.2, grassland: 1, 'forest-hills': 1, 'pine-flat': 0.8, snow: 0.6, scrub: 0.4 }),
    byClass: { interstate: 1, divided: 0.6 },
    props: [{ kind: 'house', n: [1, 1], set: [40, 70] }, { kind: 'barn', n: [0, 1], set: [50, 80] }, { kind: 'treescreen', n: [3, 6], set: [30, 60] }],
    note: 'DSOA: the research puts houses only on the lower classes; from an interstate they are seen across the fields' },
  'soundwall-houses': { label: 'Houses behind the sound wall', group: 'wall', span: 2, side: 'one', weights: W({ sprawl: 3 }, 1),
    byClass: { interstate: 1, divided: 0.7 }, nearCity: 1200, cityOnly: true,
    props: [{ kind: 'soundwall', set: [0.8, 0.8], h: 4.8, gaps: 0.12 }, { kind: 'house', n: [3, 6], set: [15, 23], backs: true }] }, // set 4 u; 40 u tall -> a real wall's 4.8 m
  billboard: { label: 'Billboard', group: 'signage', span: 1, side: 'one',
    weights: W({ 'forest-hills': 0.6, 'pine-flat': 0.8, farmland: 1, grassland: 1.3, desert: 1.5, scrub: 1.3, snow: 0.25, swamp: 0.5, sprawl: 1, mountain: 0.4 }),
    byClass: { interstate: 3, divided: 2, 'two-lane': 0.5 }, nearCity: 4000, nearBoost: 0.6,
    props: [{ kind: 'billboard', n: [1, 1], set: [2, 3.4], h: 8.6 }] }, // set 10-18 u, 45 u up
  'billboard-pair': { label: 'Billboard pair', group: 'signage', span: 2, side: 'both', weights: W({ grassland: 0.7, desert: 0.9, farmland: 0.6, scrub: 0.7 }),
    byClass: { interstate: 1.6, divided: 0.8 }, nearCity: 4000, nearBoost: 0.6, props: [{ kind: 'billboard', n: [1, 1], set: [2, 3.4], h: 8.6 }] },
  'open-view': { label: 'Open view, nothing in it', group: 'nature', span: 1, side: 'both', weights: W({ desert: 1.5, grassland: 1.5, scrub: 1.4, snow: 1.2, farmland: 0.8, swamp: 0.5, mountain: 0.8 }),
    byClass: { interstate: 1, divided: 1, 'two-lane': 1, rural: 1, dirt: 1 }, props: [{ kind: 'rock', n: [0, 2], set: [11, 76] }] }, // 60-400 u
  'farm-lane': { label: 'Farm lane to a farmhouse', group: 'farm', span: 2, side: 'one', weights: W({ farmland: 4, grassland: 1.6, 'forest-hills': 0.5, 'pine-flat': 0.5 }),
    byClass: { 'two-lane': 1, rural: 1.5, divided: 0.3, dirt: 0.6 },
    props: [{ kind: 'lane', len: [27, 63] }, { kind: 'mailbox', set: [0.8, 1.5] }, { kind: 'house', n: [1, 1], end: true, set: [0, 4] }, { kind: 'barn', n: [1, 1], end: true, set: [6, 13] }, { kind: 'silo', n: [0, 2], end: true, set: [8, 17] }] }, // len 140-330 u
  'field-fence': { label: 'Crop field behind a fence', group: 'farm', span: 2, side: 'both', weights: W({ farmland: 3.5, grassland: 1.5, scrub: 0.4 }),
    byClass: { 'two-lane': 1, rural: 1.3, divided: 0.8, interstate: 0.6, dirt: 0.8 },
    props: [{ kind: 'fence', set: [0.4, 0.8], post: 3.2, rails: 2 }, { kind: 'cropfield', set: [1.2, 1.6], depth: [42, 91], row: 1.8 }] }, // set 2-4 u, 6-8 u; depth 220-480 u
  'windmill-stock': { label: 'Windmill and stock tank', group: 'farm', span: 1, side: 'one', weights: W({ grassland: 2.4, scrub: 1.8, farmland: 0.8, desert: 0.5 }),
    byClass: { 'two-lane': 1, rural: 1.2, divided: 0.7, interstate: 0.5, dirt: 0.8 },
    props: [{ kind: 'windmill', set: [8, 23] }, { kind: 'stocktank', set: [8, 23] }, { kind: 'fence', set: [0.6, 1], post: 3.6, rails: 3, wire: true }] }, // 40-120 u
  'power-line': { label: 'Power line along the road', group: 'nature', span: 2, side: 'one', weights: W({ farmland: 1.4, grassland: 1.4, scrub: 1.2, desert: 1.2, 'forest-hills': 0.5, 'pine-flat': 0.6, snow: 0.3, sprawl: 1 }),
    byClass: { 'two-lane': 1, rural: 1.2, divided: 0.8, dirt: 0.4 }, // (an interstate has its own line: world/chunkgen.js power poles)
    props: [{ kind: 'powerline', set: [1.9, 4.2], spacing: 42, h: 9.5 }] }, // set 10-22 u, 55 u up
  'scrub-rocks': { label: 'Scrub and a rock', group: 'nature', span: 2, side: 'both', weights: W({ desert: 5, scrub: 3.5, grassland: 0.8, mountain: 1 }),
    byClass: { interstate: 1, divided: 1, 'two-lane': 1, rural: 1, dirt: 1 },
    props: [{ kind: 'scrub', n: [3, 8], set: [1.5, 23] }, { kind: 'rock', n: [0, 1], set: [30, 70], big: true }] }, // 8-120 u
  'talus-cut': { label: 'Talus and boulders below a cut', group: 'nature', span: 1, side: 'both', weights: W({ mountain: 5, 'forest-hills': 0.6 }),
    byClass: { interstate: 1, divided: 1, 'two-lane': 1, rural: 1, dirt: 1 }, props: [{ kind: 'rock', n: [3, 7], set: [0.5, 14] }] },
  'snow-line': { label: 'Snow fence and marker poles', group: 'nature', span: 2, side: 'both', weights: W({ snow: 5 }),
    byClass: { interstate: 1, divided: 1, 'two-lane': 1.2, rural: 1, dirt: 0.6 },
    props: [{ kind: 'snowpole', n: [3, 5], set: [0.6, 1.1] }, { kind: 'snowfence', set: [5.7, 8.6], h: 1.9 }, { kind: 'firclump', n: [1, 3], set: [11, 38] }] }, // 3-6 u, 30-45 u, 60-200 u
  'causeway-reeds': { label: 'Cattails, sawgrass and a stilt shack', group: 'nature', span: 2, side: 'both', weights: W({ swamp: 6, 'pine-flat': 0.8 }),
    byClass: { 'two-lane': 1.3, rural: 1.2, divided: 0.9, interstate: 0.8, dirt: 1 },
    props: [{ kind: 'cattails', n: [4, 9], set: [0.6, 7.6] }, { kind: 'stiltshack', n: [0, 1], set: [15, 34], chance: 0.25 }] }, // 3-40 u, 80-180 u
  'gas-stop': { label: 'A dead gas stop', group: 'service', span: 2, side: 'one', weights: W({ desert: 1, scrub: 1.2, grassland: 1.4, farmland: 1.2, 'forest-hills': 1, 'pine-flat': 1, snow: 1, swamp: 0.9, mountain: 0.8, sprawl: 1 }),
    byClass: { 'two-lane': 2, rural: 1, divided: 1.6 }, props: [{ kind: 'gasstop', set: [4, 8] }] }, // 20-40 u
};
// Group knobs (the World Forge's sliders): a multiplier per scene group, plus density (all non-service scenes) and nothing.
export const DEFAULT_KNOBS = { density: 1, nothing: 1, houses: 1, wall: 1, signage: 1, nature: 1, farm: 1, service: 1 };

// ---- what the props look like (colours: no purple) ---------------------------------------------------------------------
export const LOOK = {
  soundwall: '#8a857a', soundwallCap: '#6c675e', soundwallPost: '#55524c', billboardPost: '#4a4038', billboardFace: ['#c9b48a', '#a8b2a4', '#c69a6a', '#b8a888', '#8a9a8a'], billboardBack: '#5a544a',
  fencePost: '#5e4b36', fenceRail: '#6e5a42', wire: '#3a3631', pole: '#4a3a2a', arm: '#3d3026',
  house: ['#d9c7a6', '#c9b08a', '#b9c2b0', '#d8b48c', '#a8b8b0', '#cfc2a8', '#9c9484', '#b0a08a'], roof: ['#5a4a3e', '#4e4640', '#6a5444', '#5c5a54'], char: '#2a2420',
  barn: ['#7a3a28', '#6e3424', '#7c5a3a', '#6a5a48'], silo: '#a8a49a', drive: '#8a7a5c', mailbox: '#6a6a66',
  windmill: '#6a6660', vane: '#8a857c', tank: '#6e7a7a', water: '#4a5a52',
  crop: ['#8a7a3e', '#7e7038', '#76723c', '#8e7c44'], stubble: '#6a5a38', soil: '#4e3e2c',
  cattail: '#7a7a44', cattailHead: '#4a3424', sawgrass: '#7c7a48', snowpole: '#c8642a', snowfence: '#6e5a42',
  rock: ['#7e6248', '#8a6a4e', '#6e5440', '#94735a', '#7a7470'], canopy: '#8a8478', pump: '#a04a2a', shell: ['#c8bfae', '#b8ae9a', '#a89c86'],
};

// ---- the validator (the World Forge and the selftest) ------------------------------------------------------------------
const PROP_KINDS = ['treewall', 'treescreen', 'house', 'barn', 'silo', 'lane', 'mailbox', 'soundwall', 'billboard', 'fence', 'cropfield', 'windmill', 'stocktank', 'powerline', 'scrub', 'rock', 'snowpole', 'snowfence', 'firclump', 'cattails', 'stiltshack', 'gasstop'];
const GROUPS = ['houses', 'wall', 'signage', 'nature', 'farm', 'service'];
const hueOf = (hex) => {
  const v = parseInt(String(hex).slice(1), 16), r = ((v >> 16) & 255) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.08) return -1; // a grey has no hue worth banning
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
export const MAX_REACH = 140; // metres from the road's centreline a roadside may reach (the placer scans this far)
export function validateRoadside(rows = { ROAD_CLASSES, ROAD_BIOMES, BIOME_MAP, SCENES, LOOK, CADENCE }, species = null) {
  const errors = [], warnings = [];
  const cls = Object.keys(rows.ROAD_CLASSES), bio = Object.keys(rows.ROAD_BIOMES);
  const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const range = (r, lo, hi) => Array.isArray(r) && r.length === 2 && num(r[0], lo, hi) && num(r[1], lo, hi) && r[0] <= r[1];
  const C = rows.CADENCE;
  if (!num(C.slot, 16, 256) || !num(C.blockSlots, 2, 32) || !num(C.superBlocks, 1, 12) || !num(C.emptyWeight, 0, 100)) errors.push('CADENCE: slot 16-256 m, blockSlots 2-32, superBlocks 1-12, emptyWeight 0-100');
  for (const [id, c] of Object.entries(rows.ROAD_CLASSES)) {
    if (!num(c.clearZone, 0, 40)) errors.push(`class ${id}: clearZone must be 0-40 m`);
    if (!num(c.nothing, 0, 3)) errors.push(`class ${id}: nothing factor 0-3`);
    if (!num(c.service, 0, 1)) errors.push(`class ${id}: service chance 0-1`);
    if (c.ditch && (!num(c.ditch.at, 0, 10) || !num(c.ditch.width, 2, 16) || !num(c.ditch.depth, 0, 2))) errors.push(`class ${id}: ditch at 0-10, width 2-16, depth 0-2 m`);
  }
  for (const [id, b] of Object.entries(rows.ROAD_BIOMES)) {
    if (!['forest', 'farmland', 'grassland', 'desert', 'tundra', 'wetland'].includes(b.research)) errors.push(`biome ${id}: research family "${b.research}" is not one of the six`);
    if (!num(b.nothing, 0, 0.95)) errors.push(`biome ${id}: nothing chance 0-0.95`);
    if (!num(b.bed, 0, 2)) errors.push(`biome ${id}: bed 0-2 m`);
    if (!Array.isArray(b.trees) || !b.trees.length) errors.push(`biome ${id}: needs a tree mix`);
    for (const t of b.trees ?? []) {
      if (!Array.isArray(t) || t.length !== 4 || !num(t[1], 0, 100) || !num(t[2], 1, 30) || !num(t[3], t[2], 30)) errors.push(`biome ${id}: tree ${JSON.stringify(t)} must be [species, weight, hMin, hMax]`);
      else if (species && !species.includes(t[0])) errors.push(`biome ${id}: no flora species "${t[0]}"`);
    }
    for (const k of ['scrub', 'ground']) if (!/^#[0-9a-f]{6}$/i.test(b[k] ?? '')) errors.push(`biome ${id}: ${k} must be #rrggbb`);
  }
  for (const [reg, map] of Object.entries(rows.BIOME_MAP)) {
    if (Array.isArray(map)) continue;
    for (const [L, rb] of Object.entries(map)) if (!bio.includes(rb)) errors.push(`BIOME_MAP.${reg}.${L}: no road biome "${rb}"`);
  }
  const reach = (p, edge) => (p.set ? p.set[1] : 0) + (p.depth ? p.depth[1] : 0) + (p.len ? p.len[1] + 20 : 0) + edge;
  for (const [id, s] of Object.entries(rows.SCENES)) {
    if (!GROUPS.includes(s.group)) errors.push(`scene ${id}: group "${s.group}" is not one of ${GROUPS.join(', ')}`);
    if (s.span !== 1 && s.span !== 2) errors.push(`scene ${id}: span 1 or 2`);
    if (s.side !== 'one' && s.side !== 'both') errors.push(`scene ${id}: side one|both`);
    for (const k of Object.keys(s.weights ?? {})) if (!bio.includes(k)) errors.push(`scene ${id}: weight for unknown biome "${k}"`);
    for (const [k, v] of Object.entries(s.byClass ?? {})) { if (!cls.includes(k)) errors.push(`scene ${id}: byClass unknown class "${k}"`); if (!num(v, 0, 10)) errors.push(`scene ${id}: byClass.${k} 0-10`); }
    if (s.nearCity !== undefined && !num(s.nearCity, 100, 20000)) errors.push(`scene ${id}: nearCity 100-20000 m`);
    if (!Object.values(s.weights ?? {}).some((v) => v > 0)) warnings.push(`scene ${id}: weighs nothing anywhere`);
    let lane = false;
    for (const p of s.props ?? []) {
      if (!PROP_KINDS.includes(p.kind)) { errors.push(`scene ${id}: prop kind "${p.kind}" (have ${PROP_KINDS.join(', ')})`); continue; }
      if (p.set && !range(p.set, 0, 120)) errors.push(`scene ${id}/${p.kind}: set [min,max] 0-120 m`);
      if (p.depth && !range(p.depth, 1, 120)) errors.push(`scene ${id}/${p.kind}: depth [min,max] 1-120 m`);
      if (p.n && !(range(p.n, 0, 40) && Number.isInteger(p.n[0]) && Number.isInteger(p.n[1]))) errors.push(`scene ${id}/${p.kind}: n [min,max] integers 0-40`);
      if (p.kind === 'lane') lane = true;
      if (p.end && !lane) errors.push(`scene ${id}/${p.kind}: end:true needs a lane before it`);
      const maxEdge = Math.max(...Object.keys(s.byClass ?? {}).map((k) => (rows.ROAD_CLASSES[k]?.clearZone ?? 0) + 14));
      if (reach(p, maxEdge) > MAX_REACH) errors.push(`scene ${id}/${p.kind}: reaches ${Math.round(reach(p, maxEdge))} m from the centreline (MAX_REACH ${MAX_REACH})`);
    }
  }
  const walk = (o, path) => {
    if (typeof o === 'string' && o[0] === '#') { const h = hueOf(o); if (h >= 270 && h <= 320) errors.push(`${path}: ${o} is purple (hue ${Math.round(h)})`); return; }
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
  };
  walk(rows.LOOK, 'LOOK'); walk(rows.ROAD_BIOMES, 'ROAD_BIOMES');
  return { ok: !errors.length, errors, warnings, counts: { classes: cls.length, biomes: bio.length, scenes: Object.keys(rows.SCENES).length } };
}
