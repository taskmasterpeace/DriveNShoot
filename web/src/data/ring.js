// THE PHOENIX RING as rows (docs/design/WEB_STREAMING.md §1.3, R1 "the city itself"). Robert, 2026-10-22: metros are ~3 km
// across; Phoenix keeps its authored 920 m island (Rust Haven and the flats around it) as the core and gains a generated
// ring out to ~1.5 km, streamed in chunks like everything past the island. The island reads as a walled holdout in the
// middle of a dead metro. The ring must be ALIVE, not scenery: R1 is the city you can walk into and search (this file);
// R2, the residents, are rows at the end of this file (RESIDENTS; systems/residents.js); R3 traffic comes later.
// Everything here is data: change a row, not world/ring.js. No purple anywhere (hue 270-320 is banned), no brand names.

export const RING = {
  // ---- the footprint: a lobed edge, never a square. edge(θ) = radius + Σ amp·sin(k·θ + phase), from Phoenix (0, 0).
  radius: 1440,
  wobble: [[2, 80, 0.6], [3, 46, 2.2], [7, 26, 4.1]],
  edgeBelt: 200,            // the outer belt (zone rule `edge`) where the ruins thin out to the desert
  freewayTail: { reach: 240, half: 170 },  // the strip runs on along I-10 a little past the edge, both ways
  island: 464, islandPad: 6, // nothing of the ring inside the island (its golden hash), 6 m clear of its edge

  // ---- the grid: the island's own lattice (world/city.js: a road every 80 m, 14 m wide) carried outward
  grid: 80, street: 14, arterial: 20, arterialEvery: 4, walk: 3,
  freeway: { lotClear: 32, localStop: 9, arterialStop: 0.8 }, // lots keep 32 m from I-10's centreline; a local street
                            // stops 9 m past its paved edge, an arterial only skips its pavement (it crosses at grade)
  rail: { x: -360, clear: 10 },  // the Iron Line runs on north and south through the ring: nothing built on it

  // ---- budgets (per chunk). `buildings` is pure (a chunk's lots in id order, the rest stay empty); `decor` caps the
  // props that are only for looks (rubble, roof clutter, yard junk) in the order they are made.
  budget: { buildings: 84, decor: 700 },

  // ---- shells
  wall: 0.4, door: 2.4, backDoor: 1.8, innerDoor: 1.8, sill: 0.95, window: 1.6,
  collapse: 0.32,           // a ruined building loses this share of its wall spans to a stub or knee-high rubble
};

// The zone rules, first match wins (block centre). edge: within `edgeBelt` of the city's edge; freeway: within n m of
// I-10; near: within n m of one of the segments [x0, z0, x1, z1]; arterial: the block fronts an arterial (share of them).
export const ZONE_RULES = [
  { zone: 'ruins', edge: true },
  { zone: 'strip', freeway: 160 },
  { zone: 'industrial', near: [[-360, -1700, -360, 1700]], within: 300 },       // along the Iron Line
  { zone: 'industrial', near: [[418, -470, 560, -1700]], within: 210 },          // the dry wash the river left, north
  { zone: 'strip', arterial: true, share: 0.4 },
  { zone: 'residential' },
];

// Zones: what a block holds. lots: the block's layout ('houses' | 'yards' | 'strip'); kinds: [kind, weight];
// density: the share of lots built; ruin: the share of buildings left as ruined shells; loot: [table, weight] for a
// container with no table of its own; colours for walls, roofs, floors (jittered per building); wrecks: a car left at
// the kerb per street segment (chance); yard: junk per lot (props, looks only).
// R2: residents: [[kind, weight]] (rows in RESIDENTS below) and occupancy: the share of the zone's eligible buildings
// somebody lives in. A kind with `perQuarter` ignores occupancy: one building per quarter (a 4 x 4 block square between
// arterials) at most, at that chance.
export const ZONES = {
  residential: {
    name: 'THE DEAD HOUSES', lots: 'houses', kinds: [['house', 6], ['bungalow', 3], ['duplex', 2]],
    density: 0.84, ruin: 0.24, loot: [['kitchen', 4], ['bedroom', 3], ['bathroom', 2]],
    walls: ['#d6c09a', '#c98e62', '#e4d3b0', '#a8b89a', '#d2a46a', '#b9705a', '#8fb0a8', '#e0bd8a'], // stucco the old paint still shows on
    roofs: ['#8a5a3a', '#7a5236', '#9a8060', '#6e6a62', '#9a6a46'], floors: ['#8a6a4a', '#9a8670', '#7a6a58', '#8e7a62'],
    tint: [0.94, 0.9, 0.84], wrecks: 0.18, yard: 3, fence: 0.8,
    residents: [['family', 1]], occupancy: 0.11,
  },
  industrial: {
    name: 'THE YARDS', lots: 'yards', kinds: [['warehouse', 4], ['shop', 4]],
    density: 0.8, ruin: 0.35, loot: [['garage', 5], ['office', 2]],
    walls: ['#9a948a', '#8a8478', '#a07a52', '#aaa190', '#7f8c8a', '#94806a', '#b8a27a'],
    roofs: ['#6a7472', '#7a7a74', '#8a857c', '#7a6a58'], floors: ['#8a857c', '#928d84', '#7a766e'],
    tint: [0.86, 0.85, 0.82], wrecks: 0.3, yard: 6, fence: 0,
    residents: [['chopshop', 1]], occupancy: 0, // per quarter only (RESIDENTS.chopshop.perQuarter)
  },
  strip: {
    name: 'THE STRIP', lots: 'strip', kinds: [['mall', 5], ['gas', 2], ['diner', 2]],
    density: 0.86, ruin: 0.28, loot: [['storefront', 4], ['kitchen', 2], ['office', 1]],
    walls: ['#d8cbb2', '#e2d2b0', '#b8704a', '#c9a878', '#7fa0a0', '#c98e5a', '#a6b88e'],
    roofs: ['#7a7670', '#6a6660', '#8a847a'], floors: ['#a39a8a', '#958c7c', '#aaa290'],
    tint: [0.88, 0.86, 0.82], wrecks: 0.34, yard: 2, fence: 0,
    residents: [['squatters', 1]], occupancy: 0.16,
  },
  ruins: {
    name: 'THE BURN', lots: 'houses', kinds: [['house', 6], ['bungalow', 3], ['shop', 1]],
    density: 0.62, ruin: 0.72, loot: [['wreck', 3], ['kitchen', 2], ['bedroom', 1]],
    walls: ['#8e877c', '#9a9184', '#7a736a', '#a39887', '#857c70', '#6e6860', '#5a5650'], // the Burn: smoke-dark, never black
    roofs: ['#6a645c', '#5e5a54', '#7a6a58'], floors: ['#6e665c', '#625c54'],
    tint: [0.9, 0.86, 0.8], wrecks: 0.24, yard: 4, fence: 0.15,
    residents: [['nest', 1]], occupancy: 0, // per quarter only (RESIDENTS.nest.perQuarter)
  },
};

// A Phoenix house lot from above (docs/design/WEB_LOOK.md §3.5): a gravel front yard with a desert tree, a concrete
// driveway up the side to a carport, and a back yard behind a block wall (YARD.wall), a third of them with a pool (in a
// dead city: drained, gone green, or kept by whoever still lives there). world/ring.js yardOf() lays it out on its own
// stream (the lot's seed), so nothing placed before it moves. Houses, bungalows and duplexes only; a ruin keeps its
// slabs, walls and pool and loses its carport roof. No purple (hue 270-320 is banned).
export const YARD = {
  wall: { h: 1.8, t: 0.22, colors: ['#b8ad98', '#a89e8a', '#c4b8a0', '#9c9484'] }, // the back yard's block wall
  alley: 1.8,                // m each back wall stands in from the lot's back line: back-to-back lots leave a 3.6 m alley
  gravel: ['#b89a74', '#a88c6a', '#c4a682', '#9e8a6c'],   // decomposed granite, the Phoenix front yard
  drive: { w: 3.0, min: 3.6, color: '#b9b1a1' },           // a driveway needs this much side yard
  carport: { chance: 0.55, len: 6.0, h: 2.6, roof: ['#8a8780', '#7a6a58', '#6e7472'], post: '#5a5650' },
  shed: { chance: 0.3, w: 2.6, d: 2.2, h: 2.2, colors: ['#8a7a62', '#7a8a7a', '#9a8a6a'], roof: '#6e6a62' },
  patio: { chance: 0.6, d: 2.6, color: '#c9bfae' },
  pool: { chance: 0.33, w: 7.2, d: 3.6, gap: 3.0, minYard: 10, coping: '#d6cdb8',
    water: [['#4f7a5a', 4], ['#9fb8b8', 3], ['#3f8aa8', 1]] }, // gone green, drained to its painted shell, kept
  trees: { front: 0.6, back: 0.45,
    front_kinds: [['paloverde', 3], ['mesquite', 2]], back_kinds: [['citrus', 3], ['paloverde', 1]],
    kinds: {
      paloverde: { h: [3.2, 4.2], r: [2.0, 2.8], squash: 0.5, clump: 3, trunk: '#7a8a4a', canopy: ['#9ab052', '#8aa848', '#a8b860'] },
      citrus: { h: [2.3, 2.9], r: [1.4, 1.8], squash: 0.8, trunk: '#5a4632', canopy: ['#3f6a2a', '#4a7a30', '#36602a'] },
      mesquite: { h: [3.4, 4.4], r: [2.2, 3.0], squash: 0.45, clump: 3, trunk: '#4a3a2a', canopy: ['#5a7a3a', '#6a8a42', '#506e34'] },
    },
    dead: ['#6a5a44', '#5a4c3a'] }, // a ruin's trees are dead: bare canopy colour, no leaves to speak of
};

// Building kinds. w, d: footprint ranges (metres; w runs along the street); h: wall height. plan: its rooms come from
// data/floorplans.js PLANS[kind] (world/floorplan.js: typed rooms, partitions with doorways, furniture by room); units:
// side-by-side units with their own front doors (a duplex, a strip mall), each planned on its own; bay: the front door's
// width when it is a roll-up bay; back: chance of a back door (per unit) where the plan offers one (the kitchen's, a
// stock room's, the end of the hall). Sizes (WEB_FLOORPLANS.md): a ranch house 11.8-12.9 x 8.8-10.5 m (104-135 m2) fits
// a living room, kitchen, bath and two bedrooms down a hall at real sizes, three on the deep ones; a bungalow is the
// bigger house (three bedrooms, often a dining room). The warehouse keeps the old shell: one floor and an office in a
// back corner (office), furniture from its own list; label: what its shelves say they are; loot: its own table.
export const KINDS = {
  house: { w: [11.8, 12.9], d: [8.8, 10.5], h: [3.0, 3.5], plan: true, back: 0.55 },
  bungalow: { w: [13, 15.5], d: [9.6, 12], h: [3.1, 3.6], plan: true, back: 0.65 },
  duplex: { w: [16.5, 19.5], d: [9.6, 11], h: [3.1, 3.5], plan: true, units: [2, 2], back: 0.4 },
  shop: { w: [15, 21], d: [12, 15], h: [4.2, 5.0], plan: true, bay: 4.2, back: 0.6, label: 'WORKSHOP', loot: 'garage' },
  warehouse: { w: [26, 38], d: [18, 26], h: [6.0, 7.4], bay: 5.0, back: 0.8, office: true, label: 'WAREHOUSE', loot: 'garage', furniture: [['rack', 4, 7], ['crate', 2, 5]] },
  mall: { w: [38, 52], d: [12, 14.5], h: [4.2, 4.8], plan: true, units: [3, 4], back: 0.5 },
  gas: { w: [11, 13.5], d: [8, 9.5], h: [3.8, 4.2], plan: true, canopy: true, back: 0.4, label: 'FUEL STOP', loot: 'pumps' },
  diner: { w: [14, 18], d: [10, 12], h: [3.6, 4.2], plan: true, back: 0.7, label: 'DINER', loot: 'kitchen' },
};

// A strip mall's units: what each sold, so its shelves say so and hold it.
export const UNITS = [
  { label: 'CORNER STORE', loot: 'storefront' }, { label: 'PHARMACY', loot: 'bathroom' }, { label: 'HARDWARE', loot: 'garage' },
  { label: 'PAWN SHOP', loot: 'bedroom' }, { label: 'LAUNDROMAT', loot: 'office' }, { label: 'LIQUOR STORE', loot: 'storefront' },
  { label: 'BARBER', loot: 'bathroom' }, { label: 'TAQUERIA', loot: 'kitchen' }, { label: 'TAX OFFICE', loot: 'office' },
];

// Furniture: [w along the wall, d out from it, h], its colour(s), whether it is a container (its label, litres and the
// table it rolls when it has none from its room), and whether it is solid. parts: what it looks like from above, as boxes
// [a0, a1, d0, d1, y0, y1, colour] in its own frame (a: share of its width along the wall, d: share of its depth out from
// the wall, 0 at the wall; y: metres): colour a number = its own colour times that, '#hex' as is, '@' one of alt (picked
// per piece). No parts: one box. centre: it stands in the middle of the room (a rug, a dining table), not on a wall.
// spots: sleeping places (a double bed sleeps two). near/far: placed close to / away from a piece already in the room
// ('*' = any: a kitchen's units run on from each other); farDoor: away from the room's doorway (a bed's head wall).
export const FURNITURE = {
  shelf: { size: [2.0, 0.5, 1.8], colors: ['#4d3a29', '#5a4632'], box: { label: 'SHELF', cap: 40 }, solid: true,
    parts: [[0, 1, 0, 1, 0, 1.8, 1], [0.03, 0.97, 0.08, 0.98, 1.8, 1.82, 0.62], [0.06, 0.32, 0.2, 0.85, 1.82, 1.95, '#8a7a5a']] },
  crate: { size: [1.0, 1.0, 1.0], colors: ['#7a5a34', '#6b4e2e'], box: { label: 'CRATE', cap: 60 }, solid: true,
    parts: [[0, 1, 0, 1, 0, 1.0, 1], [0.08, 0.92, 0.45, 0.55, 1.0, 1.02, 0.7]] },
  rack: { size: [2.6, 0.9, 2.4], colors: ['#5a5a56', '#6a5a48'], box: { label: 'RACK', cap: 60 }, solid: true,
    parts: [[0, 1, 0, 1, 0, 2.4, 1], [0.04, 0.3, 0.1, 0.9, 2.4, 2.6, '#7a5a34'], [0.62, 0.95, 0.1, 0.9, 2.4, 2.55, '#5e6450']] },
  counter: { size: [2.4, 0.8, 1.0], colors: ['#6a5440', '#5a5650'], box: { label: 'COUNTER', cap: 40 }, solid: true,
    parts: [[0, 1, 0, 1, 0, 0.96, 1], [0, 1, 0, 1, 0.96, 1.0, '#a89c84']] },
  dresser: { size: [1.3, 0.5, 1.0], colors: ['#5a3e28', '#6b4a32'], box: { label: 'DRESSER', cap: 30, loot: 'bedroom' }, solid: true,
    parts: [[0, 1, 0, 1, 0, 1.0, 1], [0.12, 0.3, 0.3, 0.7, 1.0, 1.1, '#8a7a5a']] },
  nightstand: { size: [0.5, 0.45, 0.6], colors: ['#5a3e28', '#6b4a32'], box: { label: 'NIGHTSTAND', cap: 10, loot: 'bedroom' }, solid: true, near: 'bed',
    parts: [[0, 1, 0, 1, 0, 0.6, 1], [0.25, 0.75, 0.3, 0.8, 0.6, 0.7, '#c8b48a']] },
  // A double bed, its head against the wall: frame, headboard, sheet, pillows at the wall end, a blanket over the foot.
  bed: { size: [1.45, 2.05, 0.5], colors: ['#5a3e28', '#4d3a29', '#6a5038'], alt: ['#8a3a2e', '#3f5a6a', '#6a7a4a', '#a0844e', '#5a6e7a', '#7a5a3a'], bed: true, solid: false, spots: 2, farDoor: true,
    parts: [[0, 1, 0, 0.07, 0, 0.9, 1.1], [0, 1, 0.07, 1, 0, 0.44, '#cfc6b2'], [0.08, 0.47, 0.1, 0.26, 0.44, 0.54, '#e6dfcd'], [0.53, 0.92, 0.1, 0.26, 0.44, 0.54, '#e6dfcd'], [0, 1, 0.36, 1, 0.44, 0.5, '@']] },
  sbed: { size: [1.0, 2.0, 0.48], colors: ['#5a3e28', '#4d3a29', '#6a5038'], alt: ['#8a3a2e', '#3f5a6a', '#6a7a4a', '#a0844e', '#5a6e7a', '#7a5a3a'], bed: true, solid: false, farDoor: true,
    parts: [[0, 1, 0, 0.07, 0, 0.8, 1.1], [0, 1, 0.07, 1, 0, 0.42, '#cfc6b2'], [0.15, 0.85, 0.1, 0.26, 0.42, 0.52, '#e6dfcd'], [0, 1, 0.38, 1, 0.42, 0.48, '@']] },
  table: { size: [1.4, 0.9, 0.78], colors: ['#5a3e28', '#4d3a29'], solid: true,
    parts: [[0, 1, 0, 0.8, 0, 0.78, 1], [0.15, 0.4, 0.82, 1, 0, 0.5, 0.8], [0.6, 0.85, 0.82, 1, 0, 0.5, 0.8]] },
  couch: { size: [2.1, 0.9, 0.8], colors: ['#5a4a3a', '#4a5048', '#6a5038', '#7a4a32'], solid: true, farDoor: true,
    parts: [[0, 1, 0.22, 1, 0, 0.45, 1], [0, 1, 0, 0.26, 0, 0.85, 0.82], [0, 0.09, 0.22, 1, 0, 0.62, 0.9], [0.91, 1, 0.22, 1, 0, 0.62, 0.9]] },
  armchair: { size: [0.9, 0.85, 0.8], colors: ['#5a4a3a', '#4a5048', '#7a4a32'], solid: true, near: 'couch',
    parts: [[0, 1, 0.22, 1, 0, 0.45, 1], [0, 1, 0, 0.26, 0, 0.85, 0.82]] },
  tv: { size: [1.3, 0.45, 0.55], colors: ['#4d3a29', '#3d3a36'], solid: true, far: 'couch',
    parts: [[0, 1, 0, 1, 0, 0.55, 1], [0.12, 0.88, 0.25, 0.6, 0.55, 1.05, '#1f2326']] },
  rug: { size: [2.6, 1.8, 0.02], colors: ['#7a3a2a', '#6a5a2a', '#3f5446', '#2f4a5a', '#7a5a3a'], solid: false, centre: true,
    parts: [[0, 1, 0, 1, 0.12, 0.14, 1], [0.1, 0.9, 0.16, 0.84, 0.14, 0.15, 1.3]] }, // (on the floor slab, whose top is 0.12)
  // The kitchen: units along the walls, running on from each other.
  kcounter: { size: [1.6, 0.62, 0.92], colors: ['#6a5440', '#5a5650', '#7a6a50'], box: { label: 'CUPBOARD', cap: 30, loot: 'kitchen' }, solid: true, near: '*',
    parts: [[0, 1, 0, 1, 0, 0.88, 1], [0, 1, 0, 1, 0.88, 0.92, '#b8ac92']] },
  stove: { size: [0.76, 0.64, 0.92], colors: ['#d2cbbb', '#c4bca8'], solid: true, near: '*',
    parts: [[0, 1, 0, 1, 0, 0.9, 1], [0.05, 0.95, 0.08, 0.95, 0.9, 0.92, '#2b2826'], [0.14, 0.86, 0.22, 0.46, 0.92, 0.93, '#6a645e'], [0.14, 0.86, 0.6, 0.84, 0.92, 0.93, '#6a645e']] },
  fridge: { size: [0.8, 0.72, 1.8], colors: ['#dcd5c6', '#cfc8b6', '#c2b9a2'], box: { label: 'FRIDGE', cap: 30, loot: 'kitchen' }, solid: true, near: '*',
    parts: [[0, 1, 0, 1, 0, 1.8, 1]] },
  sink: { size: [1.1, 0.62, 0.92], colors: ['#6a5440', '#5a5650', '#7a6a50'], box: { label: 'SINK', cap: 20, loot: 'kitchen' }, solid: true, near: '*',
    parts: [[0, 1, 0, 1, 0, 0.88, 1], [0, 1, 0, 1, 0.88, 0.92, '#b8ac92'], [0.15, 0.85, 0.2, 0.85, 0.92, 0.93, '#7e868a']] },
  dtable: { size: [1.7, 1.9, 0.78], colors: ['#5a3e28', '#4d3a29', '#6b4a32'], solid: true, centre: true,
    parts: [[0.06, 0.94, 0.24, 0.76, 0, 0.78, 1], [0.1, 0.9, 0, 0.17, 0, 0.5, 0.78], [0.1, 0.9, 0.83, 1, 0, 0.5, 0.78]] },
  // The bathroom: tub, toilet and a vanity (its cabinet holds the medicine).
  tub: { size: [1.6, 0.76, 0.55], colors: ['#d8d2c4', '#cbc4b2'], solid: true,
    parts: [[0, 1, 0, 1, 0, 0.55, 1], [0.05, 0.95, 0.12, 0.88, 0.55, 0.56, '#9ea6a4']] },
  toilet: { size: [0.46, 0.7, 0.42], colors: ['#e0dacd', '#d4cdbd'], solid: true,
    parts: [[0, 1, 0, 0.3, 0, 0.8, 1], [0.08, 0.92, 0.3, 1, 0, 0.42, 1], [0.24, 0.76, 0.45, 0.9, 0.42, 0.43, '#8e9a9a']] },
  vanity: { size: [0.8, 0.5, 0.86], colors: ['#6a5440', '#d4cdbd'], box: { label: 'MEDICINE CABINET', cap: 15, loot: 'bathroom' }, solid: true,
    parts: [[0, 1, 0, 1, 0, 0.82, 1], [0, 1, 0, 1, 0.82, 0.86, '#d8d2c4'], [0.22, 0.78, 0.25, 0.8, 0.86, 0.87, '#8e9a9a']] },
  // Shops, diners, offices.
  booth: { size: [1.3, 1.95, 0.75], colors: ['#8a3226', '#7a3a24', '#3f5a52'], solid: true,
    parts: [[0, 1, 0, 0.24, 0, 1.05, 1], [0.08, 0.92, 0.28, 0.72, 0, 0.75, '#c8bca0'], [0, 1, 0.76, 1, 0, 1.05, 1]] },
  desk: { size: [1.4, 0.7, 0.76], colors: ['#5a3e28', '#5a5650'], box: { label: 'DESK', cap: 20, loot: 'office' }, solid: true,
    parts: [[0, 1, 0, 1, 0, 0.76, 1], [0.1, 0.45, 0.15, 0.6, 0.76, 0.78, '#d8d0bc']] },
  cabinet: { size: [0.5, 0.62, 1.32], colors: ['#6a6e6a', '#5e625e', '#7a7a72'], box: { label: 'FILING CABINET', cap: 20, loot: 'office' }, solid: true,
    parts: [[0, 1, 0, 1, 0, 1.32, 1]] },
  bench: { size: [2.4, 0.8, 0.95], colors: ['#4a4440', '#5e5a54'], solid: true,
    parts: [[0, 1, 0, 1, 0, 0.95, 1], [0.1, 0.35, 0.2, 0.7, 0.95, 1.05, '#7a3a1c']] },
  // R2: a mattress on the floor, one for each resident the house's own beds do not cover (and a Dustwolf's cot).
  mattress: { size: [2.0, 0.9, 0.22], colors: ['#7a6a52', '#6a604c', '#5e6450', '#7a5a44'], bed: true, solid: false,
    parts: [[0, 1, 0, 1, 0, 0.22, 1], [0.03, 0.2, 0.12, 0.88, 0.22, 0.3, '#d8cfbc'], [0.32, 0.98, 0.04, 0.96, 0.22, 0.26, '@']], alt: ['#5a4a3a', '#6a5a42', '#4f5a52', '#7a5a3a'] },
  // ---- the Phoenix island's rooms (data/floorplans.js, the island rows): the ring never places these.
  // The clinic: a row of waiting-room chairs, a ward's cot (steel frame, white sheet, a pale blanket), an exam table, a
  // glass-fronted medicine cabinet.
  seats: { size: [2.1, 0.62, 0.85], colors: ['#4f6a64', '#6a5a48', '#7a4a32', '#5a6070'], solid: true,
    parts: [[0, 1, 0, 0.12, 0, 0.12, '#3d3a36'], [0.02, 0.32, 0, 0.3, 0.12, 0.85, 1], [0.35, 0.65, 0, 0.3, 0.12, 0.85, 1], [0.68, 0.98, 0, 0.3, 0.12, 0.85, 1], [0.02, 0.32, 0.25, 1, 0.12, 0.46, 1.15], [0.35, 0.65, 0.25, 1, 0.12, 0.46, 1.15], [0.68, 0.98, 0.25, 1, 0.12, 0.46, 1.15]] },
  cot: { size: [0.95, 2.0, 0.55], colors: ['#8a8e8a', '#7e8480'], alt: ['#a8b8a8', '#b8b0a0', '#9aaab0', '#c2b490'], bed: true, solid: false, farDoor: true,
    parts: [[0, 1, 0, 0.05, 0, 0.95, 1], [0, 1, 0.95, 1, 0, 0.7, 1], [0.04, 0.96, 0.05, 0.95, 0, 0.42, '#e8e4da'], [0.15, 0.85, 0.08, 0.22, 0.42, 0.52, '#f2efe6'], [0.02, 0.98, 0.42, 0.93, 0.42, 0.47, '@']] },
  extable: { size: [1.9, 0.8, 0.85], colors: ['#8a8e8a', '#7a807c'], solid: true,
    parts: [[0.05, 0.95, 0.1, 0.9, 0, 0.7, 1], [0, 1, 0, 1, 0.7, 0.82, '#5e7a72'], [0.02, 0.98, 0.06, 0.94, 0.82, 0.84, '#ece8dc'], [0.04, 0.2, 0.2, 0.8, 0.84, 0.92, '#f2efe6']] },
  medcab: { size: [0.9, 0.42, 1.8], colors: ['#d8d4c8', '#c8ccc4'], box: { label: 'MEDICINE CABINET', cap: 20, loot: 'bathroom' }, solid: true,
    parts: [[0, 1, 0, 1, 0, 1.8, 1], [0.06, 0.94, 0.75, 1.0, 0.9, 1.75, '#9ab4b8'], [0.1, 0.45, 0.2, 0.7, 1.8, 1.84, '#b8443a']] },
  // The gunsmith's: rifles racked on the wall, a bench with a vise. The mechanic's: tyres stacked, a tool bench.
  gunrack: { size: [2.0, 0.42, 1.9], colors: ['#4a3626', '#5a4030'], box: { label: 'GUN RACK', cap: 30, loot: 'gunsmith' }, solid: true,
    parts: [[0, 1, 0, 0.3, 0, 1.9, 1], [0, 1, 0.3, 1, 0, 0.25, 0.85], [0.08, 0.13, 0.3, 0.75, 0.25, 1.7, '#2b2826'], [0.25, 0.3, 0.3, 0.75, 0.25, 1.75, '#2b2826'], [0.42, 0.47, 0.3, 0.75, 0.25, 1.65, '#3a3430'], [0.59, 0.64, 0.3, 0.75, 0.25, 1.72, '#2b2826'], [0.76, 0.81, 0.3, 0.75, 0.25, 1.6, '#3a3430'], [0.9, 0.95, 0.3, 0.75, 0.25, 1.7, '#2b2826']] },
  workbench: { size: [2.2, 0.8, 0.95], colors: ['#6a5440', '#5a4a3a'], box: { label: 'WORKBENCH', cap: 30, loot: 'garage' }, solid: true,
    parts: [[0, 1, 0, 1, 0, 0.88, 1], [0, 1, 0, 1, 0.88, 0.95, 1.25], [0.06, 0.18, 0.55, 0.85, 0.95, 1.12, '#5a6466'], [0.3, 0.7, 0.05, 0.2, 0.95, 1.6, '#4a4440'], [0.35, 0.5, 0.3, 0.6, 0.95, 0.99, '#b8443a'], [0.6, 0.8, 0.35, 0.55, 0.95, 0.98, '#8a8e8a']] },
  tyres: { size: [0.85, 0.85, 1.05], colors: ['#2b2826', '#33302c'], solid: true,
    parts: [[0.04, 0.96, 0.04, 0.96, 0, 0.26, 1], [0, 1, 0, 1, 0.26, 0.52, 1.1], [0.04, 0.96, 0.04, 0.96, 0.52, 0.78, 1], [0, 1, 0, 1, 0.78, 1.04, 1.1], [0.32, 0.68, 0.32, 0.68, 1.04, 1.05, '#6a645e']] },
  // The water trader's: tanks (a container: the water's in them), and the radio station's console and records.
  tank: { size: [1.2, 1.2, 1.6], colors: ['#3f6a7a', '#4a7068', '#5a6e7a'], box: { label: 'WATER TANK', cap: 40, loot: 'kitchen' }, solid: true,
    parts: [[0.04, 0.96, 0.04, 0.96, 0, 1.5, 1], [0.1, 0.9, 0.1, 0.9, 1.5, 1.6, 1.25], [0.38, 0.62, 0.38, 0.62, 1.6, 1.68, '#c9c2b0'], [0.45, 0.55, 0.9, 1.0, 0.25, 0.4, '#8a8e8a']] },
  console: { size: [2.4, 0.85, 0.9], colors: ['#3a3430', '#4a4440'], box: { label: 'BROADCAST DESK', cap: 20, loot: 'office' }, solid: true,
    parts: [[0, 1, 0, 1, 0, 0.78, 1], [0, 1, 0, 0.5, 0.78, 1.15, 0.85], [0.05, 0.95, 0.5, 0.95, 0.78, 0.8, '#2b2826'], [0.1, 0.3, 0.1, 0.4, 1.15, 1.17, '#d8902e'], [0.4, 0.6, 0.1, 0.4, 1.15, 1.17, '#6fb36a'], [0.7, 0.9, 0.1, 0.4, 1.15, 1.17, '#d8902e'], [0.46, 0.54, 0.6, 0.75, 0.8, 1.2, '#8a8e8a']] },
  records: { size: [2.0, 0.45, 1.8], colors: ['#4d3a29', '#5a4632'], box: { label: 'RECORDS', cap: 30, loot: 'office' }, solid: true,
    parts: [[0, 1, 0, 1, 0, 1.8, 1], [0.03, 0.2, 0.55, 1, 0.05, 1.75, '#b8443a'], [0.22, 0.4, 0.55, 1, 0.05, 1.75, '#d8b24a'], [0.42, 0.58, 0.55, 1, 0.05, 1.75, '#3f6a7a'], [0.6, 0.78, 0.55, 1, 0.05, 1.75, '#c9772e'], [0.8, 0.97, 0.55, 1, 0.05, 1.75, '#5e7a52']] },
  // The cantina: the bar (bottles on the back shelf) and a table set with four chairs.
  bar: { size: [3.6, 0.95, 1.1], colors: ['#5a3e28', '#4d3a29'], box: { label: 'BAR', cap: 40, loot: 'kitchen' }, solid: true,
    parts: [[0, 1, 0, 0.3, 0, 1.9, 0.8], [0, 1, 0.45, 1, 0, 1.05, 1], [0, 1, 0.45, 1, 1.05, 1.1, '#a8865a'], [0.05, 0.12, 0.05, 0.25, 1.9, 2.15, '#5e7a52'], [0.2, 0.26, 0.05, 0.25, 1.9, 2.1, '#c9a24a'], [0.34, 0.4, 0.05, 0.25, 1.9, 2.2, '#8a3226'], [0.52, 0.58, 0.05, 0.25, 1.9, 2.12, '#5e7a52'], [0.7, 0.76, 0.05, 0.25, 1.9, 2.18, '#c9a24a'], [0.86, 0.92, 0.05, 0.25, 1.9, 2.1, '#8a3226']] },
  // A store's gondola: shelving down the middle of the sales floor, stocked both sides.
  gondola: { size: [2.4, 0.9, 1.5], colors: ['#6a6e6a', '#5e625e', '#7a6a50'], box: { label: 'SHELVES', cap: 40 }, solid: true,
    parts: [[0, 1, 0.42, 0.58, 0, 1.5, 0.85], [0, 1, 0, 1, 0, 0.12, 1], [0.03, 0.97, 0, 0.42, 0.45, 0.5, 1], [0.03, 0.97, 0.58, 1, 0.45, 0.5, 1], [0.03, 0.97, 0, 0.42, 0.95, 1.0, 1], [0.03, 0.97, 0.58, 1, 0.95, 1.0, 1],
      [0.06, 0.3, 0.05, 0.4, 1.0, 1.22, '#c9a24a'], [0.36, 0.62, 0.05, 0.4, 1.0, 1.18, '#b8443a'], [0.7, 0.94, 0.6, 0.95, 1.0, 1.2, '#5e7a52'], [0.1, 0.4, 0.6, 0.95, 0.5, 0.7, '#d8d0bc']] },
  ctable: { size: [1.9, 1.9, 0.78], colors: ['#5a3e28', '#6b4a32'], solid: true, centre: true,
    parts: [[0.25, 0.75, 0.25, 0.75, 0, 0.74, 1], [0.22, 0.78, 0.22, 0.78, 0.74, 0.78, 1.2], [0.36, 0.64, 0, 0.18, 0, 0.48, 0.8], [0.36, 0.64, 0.82, 1, 0, 0.48, 0.8], [0, 0.18, 0.36, 0.64, 0, 0.48, 0.8], [0.82, 1, 0.36, 0.64, 0, 0.48, 0.8]] },
};

// ---- R2, the residents (docs/design/WEB_STREAMING.md §1.3 "R2 as built") ---------------------------------------------
// Who lives in the ring, as rows. A household is a record keyed by its building's id (R<k>.<j>.<n>): which buildings are
// lived in, who lives there (names, flags, faces, guns) and where they sleep are a pure function of these rows and the
// seed; what happens to them (hp, grudges, what they carry, deaths) is kept on the record, across a chunk going and
// coming back and across a save. They are promoted to real characters when their chunk is hot and they are within
// RES_RULES.promoteR of you, and demoted (written back to the record) past demoteR, when the chunk goes cold, or first of
// all when the character budget is full (residents yield before anyone else).
//   faction/fid  the character archetype (ai.js) and the society faction that hears what they saw (deeds.js)
//   kinds        building kinds it can live in (data KINDS); intact: never a ruined shell
//   perQuarter   one per quarter at this chance (else the zone's occupancy share)
//   size         how many; hp; armed: who carries a gun (share of members, at most max, weapons by weight)
//   loot         what a body carries (data/items.js LOOT), rolled from the person's own seed
//   sleep        [from, to] game hours asleep in their own beds (a mattress each where the beds run out); watch: how
//                many stay up all night (a guard at the bay door)
//   out          by day some go out scavenging and come home: share of members, leave and back hours, stops (doors of
//                buildings within reach metres), lingering seconds at each, and the loot table a find comes from
//   barricade    the front door is boarded up (a solid barricade; they use a back door)
//   car          a stripped car on blocks inside (the chop shop)
//   night/roam   the nest: out between these hours, roaming streets within roam metres; lairs: how many buildings of
//                its chunk it moves between (a different one most dawns); echo: an Echo works at its boards; sprinters
//   lines        what they say (floating barks): walking into their place, taking from their shelves, a greeting
export const RESIDENTS = {
  family: {
    name: 'SCAVENGER FAMILY', faction: 'drifter', fid: 'drifters', kinds: ['house', 'bungalow', 'duplex'], intact: true,
    size: [2, 4], hp: [70, 100], armed: { share: 0.35, max: 1, weapons: [['pistol', 3], ['shotgun', 1]] }, loot: 'person',
    sleep: [22.5, 6.5],
    out: { share: 0.5, leave: [7.5, 10.5], back: [14.5, 17.5], stops: [2, 3], reach: [30, 110], linger: [12, 30], finds: 'wreck' },
    lines: {
      enter: ['This is our house.', 'Easy. We live here.', 'Nothing in here for you.', 'Wipe your boots or keep walking.'],
      steal: ['That is ours!', 'Put it back.', 'Thief!', 'We saw that.'],
      greet: ['Morning.', 'Water is two streets over, if you are asking.', 'Stay off the Burn after dark.'],
    },
  },
  squatters: {
    name: 'SQUATTERS', faction: 'drifter', fid: 'drifters', kinds: ['mall', 'diner', 'gas'], intact: true, barricade: true,
    size: [2, 4], hp: [65, 95], armed: { share: 0.5, max: 2, weapons: [['pistol', 3], ['shotgun', 2], ['smg', 1]] }, loot: 'person',
    sleep: [23.5, 7.5],
    out: { share: 0.35, leave: [9, 12], back: [15, 18.5], stops: [1, 3], reach: [25, 90], linger: [15, 35], finds: 'storefront' },
    lines: {
      enter: ['Round the back is ours. You are in it.', 'Boards are up for a reason.', 'We got here first.'],
      steal: ['Hands off our stock!', 'That is ours, scav!', 'Drop it.'],
      greet: ['Keep moving.', 'The wolves work the yards. Mind yourself.'],
    },
  },
  chopshop: {
    name: 'DUSTWOLF CHOP SHOP', faction: 'raider', fid: 'dustwolves', kinds: ['warehouse', 'shop'], perQuarter: 0.85, car: true,
    size: [3, 5], hp: [85, 100], armed: { share: 1, max: 9, weapons: [['smg', 5], ['pistol', 3], ['shotgun', 2]] }, loot: 'raider',
    names: ['Dustwolf Stripper', 'Dustwolf Wrench', 'Dustwolf Cutter', 'Dustwolf Lookout'],
    sleep: [2.5, 10.5], watch: 1,
    out: { share: 0.4, leave: [11, 14], back: [17, 20], stops: [1, 2], reach: [20, 70], linger: [10, 25], finds: 'garage' },
    lines: {
      enter: ['Wrong door, meat.', 'You lost? You are about to be.', 'This yard is the pack\'s.'],
      steal: ['That is pack parts!', 'Cut him!'],
      greet: [],
    },
  },
  nest: {
    name: 'INFECTED NEST', faction: 'zombie', fid: 'infected', kinds: ['house', 'bungalow'], intact: true, perQuarter: 0.9, barricade: true,
    size: [5, 8], sprinters: 0.2, echo: 1, night: [20.5, 5.5], roam: [40, 140], lairs: 3,
  },
};

// Their names: a household is a pure function of the seed, so it draws from its own pools (never the world's running
// name list). Ordinary given names and surnames from everywhere people came from; no pairing on purpose.
export const RES_NAMES = {
  first: ['Amara', 'Bilal', 'Carmen', 'Dmitri', 'Efua', 'Farid', 'Graciela', 'Hamid', 'Ingrid', 'Jomo', 'Keiko', 'Lucia', 'Malik', 'Noor', 'Oskar',
    'Paulo', 'Quynh', 'Renata', 'Sione', 'Tamsin', 'Uche', 'Valeria', 'Wendell', 'Ximena', 'Yaw', 'Zainab', 'Arturo', 'Beatriz', 'Cormac', 'Dalia',
    'Emeka', 'Fiona', 'Goran', 'Halima', 'Ivo', 'Jasmin', 'Kalani', 'Leopold', 'Marta', 'Nikhil', 'Odette', 'Pilar', 'Rashid', 'Soraya', 'Teodor',
    'Ulla', 'Vikram', 'Wanjiru', 'Yesenia', 'Zoltan', 'Abel', 'Brigid', 'Cyrus', 'Delphine', 'Elias', 'Fatima', 'Gideon', 'Hana', 'Isidro', 'June'],
  last: ['Achterberg', 'Balogun', 'Castellanos', 'Dlamini', 'Echeverria', 'Fonseca', 'Gallagher', 'Haddad', 'Iwasaki', 'Jaramillo', 'Kariuki',
    'Lindqvist', 'Machado', 'Nakashima', 'Obuya', 'Petrakis', 'Quintero', 'Rahimi', 'Sandoval', 'Tembo', 'Uribe', 'Varga', 'Wojcik', 'Yilmaz',
    'Zamora', 'Abernathy', 'Bergstrom', 'Cardenas', 'Delacroix', 'Esposito', 'Fairweather', 'Gutierrez', 'Halvorsen', 'Ibarra', 'Jovanovic',
    'Kaczmarek', 'Lozano', 'Mwangi', 'Navarro', 'Oyelaran', 'Pacheco', 'Rinaldi', 'Szabo', 'Tavares', 'Underhill', 'Villalobos', 'Whitlock'],
};

// The knobs. promoteR / demoteR: metres from you (the streamer's hot reach is 224, its release 300); reserve: character
// slots residents never take - never fewer than systems/zombies.js AMBIENT_RESERVE (16: residents are ambient, and the
// director's events need room); max: residents promoted at most;
// perFrame: households promoted per frame while streaming (sync: all); paths: foot paths planned per frame across all
// residents; engaged: seconds after a hit, a fight or a flight that a resident is never demoted out from under you;
// grudgeHours: how long a member who saw you wrong them remembers it; barkEvery: seconds between a household's lines;
// barricade: the boards' colours and hp (an Echo chips at it), promoteStallMs: one household's promotion slower than this
// counts as a `promote` stall.
export const RES_RULES = {
  promoteR: 210, demoteR: 300, reserve: 4, max: 40, perFrame: 1, paths: 3, engaged: 20, grudgeHours: 48, barkEvery: 25,
  barricade: { colors: ['#8a6a44', '#7a5e3e', '#9a7a52', '#6e5236'], hp: 120 }, promoteStallMs: 4,
};

// Street names past the island's own (world/city.js names its nine lines each way; a line it names keeps its name out
// here). Index by how many lines out from the island's last one, per side.
export const STREET_NAMES = {
  ns: {  // north-south lines (x = 80k): east of the island, then west
    east: ['KILN AVE', 'SCRAP ST', 'GYPSUM AVE', 'PALO VERDE ST', 'HAMMER AVE', 'DRYWELL ST', 'FLINT AVE', 'CREOSOTE ST', 'SLAG AVE', 'WINDMILL ST', 'TALLOW AVE', 'RAWHIDE ST', 'BRASS AVE', 'SUNDOWN ST', 'QUARRY AVE'],
    west: ['ADOBE AVE', 'CHOLLA ST', 'RUST BELT AVE', 'BARBWIRE ST', 'DUST BOWL AVE', 'MESQUITE ST', 'BOXCAR AVE', 'SPUR ST', 'TINDER AVE', 'HOLLOW ST', 'GRAIN AVE', 'DRIFT ST', 'KEROSENE AVE', 'LAMPLIGHT ST', 'LAST WELL AVE'],
  },
  ew: {  // east-west lines (z = 80j): north of the island, then south
    north: ['CANAL RD', 'SOLAR ST', 'BUZZARD AVE', 'RATTLER RD', 'ARROYO ST', 'HEAT HAZE RD', 'SAND FLEA ST', 'JACKRABBIT RD', 'SAGEBRUSH ST', 'ORE RD', 'TUMBLEWEED ST', 'COPPER RD', 'HEATWAVE ST', 'DROUGHT RD', 'SALVAGE ST'],
    south: ['GILA RD', 'QUAIL ST', 'BASIN RD', 'CINDERBLOCK ST', 'PUMPJACK RD', 'SANDSTORM ST', 'WAGON RD', 'BITTERWATER ST', 'FENCELINE RD', 'STOCKYARD ST', 'CATTLE GUARD RD', 'HARDPAN ST', 'IRONWOOD RD', 'LONG WALK ST', 'LAST LIGHT RD'],
  },
};

// ==== BIG BUILDINGS (the Building Lab, docs/design/WEB_BUILDING_LAB.md) ================================================
// The kinds the Building Lab adds (their plans: data/floorplans.js, BIG BUILDINGS). No ZONES row names them, so the ring
// never generates one; they stand where an authored building puts them (world/authored.js, rows in data/authored.js).
// Added after the rows above, never over one (an existing key is left alone).
//   mezz    a depot's mezzanine floor height (its walls rise to h: the shed)
//   unitW   a motel's room width: units = footprint width / unitW
//   walkway a covered walkway this deep along the front (a motel's rooms open onto it)
const BIG_KINDS = {
  offices: { w: [24, 40], d: [12, 16], h: [3.4, 3.8], plan: true, back: 0.6, label: 'OFFICES', loot: 'office' },
  school: { w: [18, 22], d: [24, 38], h: [3.6, 4.0], plan: true, back: 0.6, label: 'SCHOOL', loot: 'office' },
  motel: { w: [32, 46], d: [8.2, 9.0], h: [3.0, 3.3], plan: true, units: [8, 11], unitW: 4.2, walkway: 2.4, back: 0.1, label: 'MOTEL', loot: 'bedroom' },
  depot: { w: [24, 36], d: [18, 26], h: [6.0, 7.2], plan: true, bay: 5.0, back: 0.8, mezz: 3.4, label: 'WAREHOUSE', loot: 'garage' },
  hospital: { w: [13, 17], d: [24, 36], h: [3.6, 4.0], plan: true, back: 0.6, label: 'HOSPITAL', loot: 'bathroom' },
};
// A classroom's desks in rows (4 across, 3 deep, a chair behind each): one piece in the middle of the room, walked
// between (not solid). A motel's double bed is the house's double (dbed: a double wherever it stands).
const DESK_ROWS = (() => {
  const parts = [], W = 4.4, D = 3.4;
  for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) {
    const a = (c * 1.1 + 0.2) / W, d = (r * 1.13 + 0.1) / D;
    parts.push([a, a + 0.7 / W, d, d + 0.5 / D, 0, 0.74, 1]);                              // the desk
    parts.push([a + 0.14 / W, a + 0.56 / W, d + 0.58 / D, d + 0.94 / D, 0, 0.46, '#4a4440']); // its chair
  }
  return parts;
})();
const BIG_FURNITURE = {
  deskrows: { size: [4.4, 3.4, 0.76], colors: ['#8a7656', '#7a6a50'], solid: false, centre: true, parts: DESK_ROWS },
  dbed: FURNITURE.bed,
};
for (const [k, v] of Object.entries(BIG_KINDS)) { if (KINDS[k]) console.warn(`ring: kind ${k} already exists, the Building Lab's row is skipped`); else KINDS[k] = v; }
for (const [k, v] of Object.entries(BIG_FURNITURE)) { if (FURNITURE[k]) console.warn(`ring: furniture ${k} already exists, the Building Lab's row is skipped`); else FURNITURE[k] = v; }
// ==== end BIG BUILDINGS =================================================================================================
