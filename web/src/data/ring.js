// THE PHOENIX RING as rows (docs/design/WEB_STREAMING.md §1.3, R1 "the city itself"). Robert, 2026-10-22: metros are ~3 km
// across; Phoenix keeps its authored 920 m island (Rust Haven and the flats around it) as the core and gains a generated
// ring out to ~1.5 km, streamed in chunks like everything past the island. The island reads as a walled holdout in the
// middle of a dead metro. The ring must be ALIVE, not scenery: R1 is the city you can walk into and search (this file);
// R2 residents and R3 traffic come later.
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
export const ZONES = {
  residential: {
    name: 'THE DEAD HOUSES', lots: 'houses', kinds: [['house', 6], ['bungalow', 3], ['duplex', 2]],
    density: 0.84, ruin: 0.24, loot: [['kitchen', 4], ['bedroom', 3], ['bathroom', 2]],
    walls: ['#b39b78', '#a8876a', '#9c8462', '#c2a882', '#8f7a62', '#a0703f', '#7e8a7a', '#b08a64'],
    roofs: ['#7a4a32', '#5a3a26', '#6a5440', '#4a4440', '#80553a'], floors: ['#5c4a3a', '#6b5a48', '#4a4038', '#5e5446'],
    tint: [0.94, 0.9, 0.84], wrecks: 0.18, yard: 3, fence: 0.45,
  },
  industrial: {
    name: 'THE YARDS', lots: 'yards', kinds: [['warehouse', 4], ['shop', 4]],
    density: 0.8, ruin: 0.35, loot: [['garage', 5], ['office', 2]],
    walls: ['#6e6a62', '#5f5a53', '#7a5a3a', '#80786a', '#5a6260', '#6b5a48'],
    roofs: ['#3d4544', '#4a4a46', '#5e5a54', '#55493c'], floors: ['#5a5650', '#625e57', '#4f4c47'],
    tint: [0.86, 0.85, 0.82], wrecks: 0.3, yard: 6, fence: 0,
  },
  strip: {
    name: 'THE STRIP', lots: 'strip', kinds: [['mall', 5], ['gas', 2], ['diner', 2]],
    density: 0.86, ruin: 0.28, loot: [['storefront', 4], ['kitchen', 2], ['office', 1]],
    walls: ['#a99c88', '#b7a68a', '#8a5a3c', '#9c8462', '#6f7f78', '#a37a52'],
    roofs: ['#4c4a46', '#3f3c38', '#55504a'], floors: ['#6a645a', '#5e594f', '#726a5c'],
    tint: [0.88, 0.86, 0.82], wrecks: 0.34, yard: 2, fence: 0,
  },
  ruins: {
    name: 'THE BURN', lots: 'houses', kinds: [['house', 6], ['bungalow', 3], ['shop', 1]],
    density: 0.62, ruin: 0.72, loot: [['wreck', 3], ['kitchen', 2], ['bedroom', 1]],
    walls: ['#6e6a62', '#7c756a', '#5f5a53', '#857c6e', '#6a625a', '#4f4b46', '#3d3a36'],
    roofs: ['#4a4440', '#3d3a36', '#55493c'], floors: ['#4a4540', '#3f3b36'],
    tint: [0.9, 0.86, 0.8], wrecks: 0.24, yard: 4, fence: 0.15,
  },
};

// Building kinds. w, d: footprint ranges (metres; w runs along the street); h: wall height; partition: 'front' splits the
// house front room / back room (with a doorway), 'units' splits it into side-by-side units with their own front doors;
// units: how many; bay: the front door's width when it is a roll-up bay; office: a small room in a back corner;
// back: chance of a back door; furniture: [kind, min, max]; label: what its shelves say they are; loot: its own table.
export const KINDS = {
  house: { w: [9, 12.5], d: [8, 10.5], h: [3.0, 3.5], partition: 'front', back: 0.45, furniture: [['shelf', 1, 2], ['dresser', 0, 1], ['crate', 0, 1], ['bed', 1, 2], ['table', 0, 1], ['couch', 0, 1]] },
  bungalow: { w: [12, 15], d: [9, 12], h: [3.1, 3.6], partition: 'front', back: 0.55, furniture: [['shelf', 1, 2], ['dresser', 1, 1], ['crate', 0, 1], ['bed', 1, 2], ['table', 1, 1], ['couch', 0, 1]] },
  duplex: { w: [16, 19], d: [9, 11], h: [3.1, 3.5], partition: 'units', units: [2, 2], back: 0.3, furniture: [['shelf', 1, 1], ['dresser', 0, 1], ['bed', 1, 1], ['table', 0, 1]] },
  shop: { w: [15, 21], d: [12, 15], h: [4.2, 5.0], bay: 4.2, back: 0.6, office: true, label: 'WORKSHOP', loot: 'garage', furniture: [['rack', 2, 3], ['crate', 1, 3], ['bench', 0, 1]] },
  warehouse: { w: [26, 38], d: [18, 26], h: [6.0, 7.4], bay: 5.0, back: 0.8, office: true, label: 'WAREHOUSE', loot: 'garage', furniture: [['rack', 4, 7], ['crate', 2, 5]] },
  mall: { w: [38, 52], d: [12, 14.5], h: [4.2, 4.8], partition: 'units', units: [3, 4], back: 0.5, furniture: [['shelf', 2, 3], ['counter', 1, 1]] },
  gas: { w: [11, 13.5], d: [8, 9.5], h: [3.8, 4.2], canopy: true, back: 0.4, label: 'FUEL STOP', loot: 'pumps', furniture: [['shelf', 2, 3], ['counter', 1, 1]] },
  diner: { w: [14, 18], d: [10, 12], h: [3.6, 4.2], back: 0.7, label: 'DINER', loot: 'kitchen', furniture: [['counter', 1, 2], ['table', 2, 3], ['shelf', 1, 1]] },
};

// A strip mall's units: what each sold, so its shelves say so and hold it.
export const UNITS = [
  { label: 'CORNER STORE', loot: 'storefront' }, { label: 'PHARMACY', loot: 'bathroom' }, { label: 'HARDWARE', loot: 'garage' },
  { label: 'PAWN SHOP', loot: 'bedroom' }, { label: 'LAUNDROMAT', loot: 'office' }, { label: 'LIQUOR STORE', loot: 'storefront' },
  { label: 'BARBER', loot: 'bathroom' }, { label: 'TAQUERIA', loot: 'kitchen' }, { label: 'TAX OFFICE', loot: 'office' },
];

// Furniture: [w along the wall, d out from it, h], its colour(s), whether it is a container (its label, litres and the
// table it rolls when it has none from its room), and whether it is solid.
export const FURNITURE = {
  shelf: { size: [2.0, 0.5, 1.8], colors: ['#4d3a29', '#5a4632'], box: { label: 'SHELF', cap: 40 }, solid: true },
  crate: { size: [1.0, 1.0, 1.0], colors: ['#7a5a34', '#6b4e2e'], box: { label: 'CRATE', cap: 60 }, solid: true },
  rack: { size: [2.6, 0.9, 2.4], colors: ['#5a5a56', '#6a5a48'], box: { label: 'RACK', cap: 60 }, solid: true },
  counter: { size: [2.4, 0.8, 1.0], colors: ['#6a5440', '#5a5650'], box: { label: 'COUNTER', cap: 40 }, solid: true },
  dresser: { size: [1.4, 0.55, 1.1], colors: ['#5a3e28', '#6b4a32'], box: { label: 'DRESSER', cap: 30, loot: 'bedroom' }, solid: true },
  bed: { size: [2.0, 1.0, 0.45], colors: ['#6d6552', '#4f5a4f', '#7a6048'], bed: true, solid: false },
  table: { size: [1.8, 1.1, 0.9], colors: ['#5a3e28', '#4d3a29'], solid: true },
  couch: { size: [2.0, 0.9, 0.8], colors: ['#5a4a3a', '#4a5048', '#6a5038'], solid: true },
  bench: { size: [2.4, 0.8, 0.95], colors: ['#4a4440', '#5e5a54'], solid: true },
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
