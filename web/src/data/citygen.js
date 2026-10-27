// PROCEDURAL CITIES AND BUILDINGS (docs/design/WEB_CITYGEN.md; schema docs/design/WEB_LOCATION_BIBLE.md §3.2-§3.4).
// Every town in the streamed country is a row here x a biome x a seed: the generator (world/citygen/) is the only code.
// Two towns of one archetype differ (their own seed: street wobble, lot fill, storeys, damage, which lots stand empty);
// two archetypes differ in kind (a pueblo on a mesa is not a rust-belt mill town). No purple anywhere (hue 270-320).
//
// Layers: BIOMES (ground, roads, palettes) -> ROADS (surface rows with grip) -> KINDS (building programmes: footprint,
// storeys, drive-in doors, roof access) -> ARCHETYPES (cities: block plan, zoning, storeys per zone, density, age, damage,
// walls) -> RURAL (homesteads you can live in outside a city) -> MILITARY (the base and its vault) -> OVERRUN (the dead
// against the living) -> PLACE (how far apart the world puts them). validateCitygen() is the check the World Forge and the
// selftest run.

// ---- biomes (WEB_LOCATION_BIBLE §3.3) ------------------------------------------------------------------------------------
//   roads     the road rows a town in this biome lays (main street first, then its side streets, then its tracks)
//   ground    the town's lot/yard colour; walls: the palette its buildings are painted from; roof: roof colours
//   flora     what grows in the lots (box-level: 'cactus' | 'palm' | 'pine' | 'oak' | 'cypress' | 'scrub' | 'none')
export const BIOMES = {
  desert_sonoran: { roads: ['blacktop2', 'gravel', 'dirt'], ground: '#b89a72', walls: ['#c9a27a', '#b88a62', '#d4b48c', '#a8784e'], roof: ['#8a6a4a', '#b9b2a2', '#9a5a3a'], flora: 'cactus' },
  desert_mojave: { roads: ['blacktop2', 'gravel', 'dirt'], ground: '#bfa77e', walls: ['#cdb48e', '#b89c74', '#a88a68'], roof: ['#9a8a72', '#c2b8a2'], flora: 'scrub' },
  high_plateau: { roads: ['gravel', 'dirt', 'blacktop2'], ground: '#a87a58', walls: ['#b8764e', '#a0603e', '#c48a5e'], roof: ['#7a5a3e', '#8e6a4a'], flora: 'scrub' },
  great_plains: { roads: ['blacktop2', 'gravel', 'dirt'], ground: '#a89a6a', walls: ['#d8d2c2', '#b9a27a', '#9e8a6a', '#c8b48e'], roof: ['#5a4a3a', '#7a6a5a', '#8a3a2a'], flora: 'scrub' },
  prairie_farm: { roads: ['gravel', 'blacktop2', 'dirt'], ground: '#9a9a62', walls: ['#e0dacc', '#c23a2a', '#b9a27a'], roof: ['#4a4038', '#7a2a22'], flora: 'oak' },
  temperate_forest: { roads: ['blacktop2', 'brick', 'gravel'], ground: '#6a7448', walls: ['#d8d0c0', '#9a5a42', '#7a6a58', '#c8bea8'], roof: ['#3e3a36', '#5a4a3e'], flora: 'oak' },
  appalachian: { roads: ['switchback', 'gravel', 'dirt'], ground: '#5e6a42', walls: ['#a89a82', '#7a5a42', '#c8c0aa'], roof: ['#4a4440', '#6a3a2a'], flora: 'oak' },
  deep_south_swamp: { roads: ['causeway', 'dirt', 'blacktop2'], ground: '#5a6440', walls: ['#c8c2b0', '#9a8a6a', '#7a8a6a'], roof: ['#5a5a50', '#8a6a4a'], flora: 'cypress' },
  gulf_coast: { roads: ['blacktop2', 'boardwalk', 'gravel'], ground: '#c8b892', walls: ['#e8dcc4', '#d8b894', '#a8c0b0', '#e0c8a0'], roof: ['#a8a296', '#8a6a52'], flora: 'palm' },
  atlantic_coast: { roads: ['brick', 'blacktop2', 'boardwalk'], ground: '#b8ae90', walls: ['#d8d0c0', '#8a5a44', '#c8bca4'], roof: ['#4a4a4c', '#6a5a4a'], flora: 'oak' },
  great_lakes_rust: { roads: ['blacktop4', 'brick', 'blacktop2'], ground: '#6e6a5e', walls: ['#8a4a34', '#6a5a4e', '#9a8a7a', '#7a3a2a'], roof: ['#3a3634', '#4e4a44'], flora: 'oak' },
  northern_pine: { roads: ['gravel', 'blacktop2', 'dirt'], ground: '#5a6448', walls: ['#7a5a3e', '#a89a82', '#c8bea8'], roof: ['#3a3a38', '#5a3a2a'], flora: 'pine' },
  alpine: { roads: ['switchback', 'gravel', 'dirt'], ground: '#7a7a6a', walls: ['#7a5a3e', '#9a8a72', '#b8a88e'], roof: ['#3a3634', '#5a5048'], flora: 'pine' },
  pacific_rain: { roads: ['blacktop2', 'gravel', 'brick'], ground: '#4e5e40', walls: ['#7a6a58', '#a89a82', '#5a6a5e'], roof: ['#3a3a38', '#4a4038'], flora: 'pine' },
  tundra_north: { roads: ['gravel', 'dirt', 'blacktop2'], ground: '#9a9a8e', walls: ['#a8a294', '#7a6a58', '#c8c2b4'], roof: ['#4a4844', '#6a5a4a'], flora: 'none' },
  badlands: { roads: ['dirt', 'gravel', 'blacktop2'], ground: '#a88a68', walls: ['#b89a7a', '#9a7a5a'], roof: ['#6a5a4a', '#8a7a6a'], flora: 'scrub' },
  salt_flat: { roads: ['blacktop2', 'dirt', 'gravel'], ground: '#d8d2c4', walls: ['#c8c0b0', '#a89a8a'], roof: ['#9a9284', '#b8b0a2'], flora: 'none' },
  river_delta: { roads: ['causeway', 'gravel', 'blacktop2'], ground: '#6a6a48', walls: ['#c8c0aa', '#8a7a5a', '#a89a82'], roof: ['#5a5248', '#7a6a5a'], flora: 'cypress' },
  hot_ground: { roads: ['blacktop2', 'dirt', 'gravel'], ground: '#8a8a6a', walls: ['#7a7a6a', '#6a5e4e', '#8a7a62'], roof: ['#4a4a44', '#5a524a'], flora: 'none' },
};

// ---- roads (Robert: "different biomes, different roads") -------------------------------------------------------------
// w: carriageway width (m); walk: sidewalk each side (0: none); grip: the share of a car's grip it gives (vehicles.js
// roadGrip); speed: the advisory top speed (m/s) the traffic lane would hold; color: the surface; edge: shoulder colour;
// lanes: marked lanes; curb: a raised curb (a car mounting it bumps). switchback/causeway/boardwalk are LAID differently:
// switchback zig-zags up a slope (a town on it steps its lots), causeway rides a raised fill over water (no lots on it),
// boardwalk is planks on piles (foot traffic and light cars).
export const ROADS = {
  dirt: { name: 'dirt track', w: 5, walk: 0, grip: 0.72, speed: 14, color: '#8a7458', edge: '#9a8466', lanes: 1, curb: false },
  gravel: { name: 'gravel county road', w: 6, walk: 0, grip: 0.8, speed: 20, color: '#8e867a', edge: '#9a9080', lanes: 2, curb: false },
  blacktop2: { name: 'two-lane blacktop', w: 8, walk: 1.6, grip: 1.0, speed: 28, color: '#3a3a3c', edge: '#5a5650', lanes: 2, curb: true },
  blacktop4: { name: 'divided highway', w: 16, walk: 2, grip: 1.0, speed: 34, color: '#343436', edge: '#5a5650', lanes: 4, curb: true, median: 1.2 },
  brick: { name: 'brick main street', w: 9, walk: 2.4, grip: 0.9, speed: 18, color: '#7a4a38', edge: '#8a8278', lanes: 2, curb: true },
  boardwalk: { name: 'boardwalk', w: 4, walk: 0, grip: 0.86, speed: 10, color: '#7a5e40', edge: '#5a4430', lanes: 1, curb: false, piles: true },
  causeway: { name: 'causeway', w: 7, walk: 0, grip: 0.92, speed: 24, color: '#4a4844', edge: '#7a7466', lanes: 2, curb: false, raised: 0.6 },
  switchback: { name: 'mountain switchback', w: 6, walk: 0, grip: 0.84, speed: 16, color: '#4a4844', edge: '#7a7060', lanes: 2, curb: false, zigzag: true },
};

// ---- building kinds (the programmes the generator lays on a lot) -------------------------------------------------------
//   w, d       footprint ranges (m: wall centre lines); storeys: [min, max] floors INCLUDING the street storey (cap 6)
//   h0         the street storey's wall height (m); upper storeys are STOREY.up (3.2) each
//   bays       drive-in roll-up doors on the street storey: [count, width m, height m]; through: a second set on the
//              back wall (drive in one end, out the other) - a car fits a bay 4 m wide or more
//   roof       roof access: 'stair' (the stair goes on up to a bulkhead), 'ladder' (a fixed ladder flight), 'none'
//   parapet    the roof's parapet height (m; cover to shoot from); escape: chance of a fire escape (outside stairs)
//   zone       the zones it is laid in; loot: the per-floor loot row (LOOT_BY_KIND); cover: extra cover props per floor
//   claimable  a home you can take (the deed hook; base building is a later lane)
const K = (o) => ({ storeys: [1, 1], h0: 3.6, bays: null, through: false, roof: 'stair', parapet: 1.1, escape: 0, loot: 'house', cover: 1, claimable: false, ...o });
export const KINDS = {
  house: K({ name: 'house', w: [8, 11], d: [8, 11], storeys: [1, 2], zone: ['res', 'edge'], roof: 'none', parapet: 0, claimable: true }),
  bungalow: K({ name: 'bungalow', w: [9, 12], d: [8, 10], zone: ['res', 'edge'], roof: 'none', parapet: 0, claimable: true }),
  rowhouse: K({ name: 'rowhouse', w: [6, 8], d: [11, 14], storeys: [2, 3], zone: ['res', 'core'], parapet: 0.9, escape: 0.3, claimable: true }),
  adobe: K({ name: 'adobe block', w: [8, 14], d: [8, 12], storeys: [1, 3], zone: ['res', 'core'], roof: 'ladder', parapet: 0.9, claimable: true }),
  stilt_house: K({ name: 'stilt house', w: [8, 10], d: [8, 10], storeys: [1, 2], zone: ['res', 'edge'], roof: 'none', parapet: 0, claimable: true, stilts: 1.8 }),
  cabin: K({ name: 'cabin', w: [7, 9], d: [6, 8], zone: ['res', 'edge'], roof: 'none', parapet: 0, claimable: true }),
  trailer: K({ name: 'trailer', w: [4, 4.5], d: [12, 15], zone: ['res', 'edge'], roof: 'none', parapet: 0, h0: 2.8, claimable: true, loot: 'house' }),
  shop: K({ name: 'shop', w: [10, 16], d: [12, 18], storeys: [1, 2], h0: 4.2, zone: ['commercial', 'core'], loot: 'shop', escape: 0.2 }),
  saloon: K({ name: 'saloon', w: [12, 16], d: [14, 18], storeys: [2, 2], h0: 4.2, zone: ['commercial', 'core'], loot: 'shop' }),
  diner: K({ name: 'diner', w: [10, 14], d: [9, 12], h0: 4, zone: ['commercial', 'edge'], loot: 'shop' }),
  gas_station: K({ name: 'gas station', w: [12, 16], d: [10, 12], h0: 4.2, zone: ['commercial', 'edge', 'road'], bays: [2, 4.2, 4.0], loot: 'garage', canopy: true }),
  auto_shop: K({ name: 'auto shop', w: [14, 20], d: [12, 16], h0: 5, zone: ['commercial', 'industrial', 'edge'], bays: [2, 4.4, 4.2], through: true, loot: 'garage', roof: 'ladder' }),
  garage: K({ name: 'garage', w: [6, 8], d: [7, 9], h0: 3.4, zone: ['res', 'edge'], bays: [1, 4.0, 3.0], roof: 'none', parapet: 0, loot: 'garage' }),
  parking: K({ name: 'parking structure', w: [28, 34], d: [30, 38], storeys: [2, 4], h0: 3.6, zone: ['core', 'commercial'], bays: [2, 6.0, 3.2], through: true, loot: 'garage', open: true, parapet: 1.1 }),
  warehouse: K({ name: 'warehouse', w: [24, 36], d: [20, 30], h0: 6, zone: ['industrial', 'rail'], bays: [2, 5.0, 4.6], through: true, loot: 'warehouse', roof: 'stair', parapet: 1.1, cover: 4 }),
  quonset: K({ name: 'quonset hangar', w: [16, 24], d: [26, 36], h0: 6, zone: ['military', 'industrial', 'farm'], bays: [1, 8.0, 5.0], through: true, loot: 'military', roof: 'none', parapet: 0, cover: 3 }),
  barn: K({ name: 'barn', w: [12, 16], d: [16, 22], h0: 6, zone: ['farm'], bays: [1, 5.0, 4.6], through: true, loot: 'farm', roof: 'ladder', parapet: 0.6, cover: 2 }),
  grain_elevator: K({ name: 'grain elevator', w: [10, 12], d: [10, 14], storeys: [4, 6], h0: 4, zone: ['rail', 'farm', 'industrial'], loot: 'farm', escape: 0.6 }),
  mill: K({ name: 'mill', w: [24, 34], d: [16, 22], storeys: [3, 5], h0: 5, zone: ['industrial', 'rail'], bays: [1, 5.0, 4.4], loot: 'warehouse', escape: 0.7, cover: 3 }),
  motel: K({ name: 'motel', w: [26, 36], d: [9, 11], storeys: [1, 2], zone: ['road', 'edge', 'commercial'], loot: 'house', escape: 0.5, claimable: true }),
  church: K({ name: 'church', w: [12, 16], d: [20, 26], h0: 7, zone: ['civic', 'res', 'core'], loot: 'civic', roof: 'ladder', parapet: 0.6, steeple: true }),
  school: K({ name: 'school', w: [30, 42], d: [18, 26], storeys: [1, 2], h0: 4, zone: ['civic', 'res'], loot: 'civic', escape: 0.6 }),
  fire_station: K({ name: 'fire station', w: [16, 22], d: [18, 24], storeys: [2, 2], h0: 5, zone: ['civic', 'core'], bays: [2, 4.6, 4.4], through: true, loot: 'garage' }),
  clinic: K({ name: 'clinic', w: [14, 18], d: [12, 16], storeys: [1, 2], h0: 4, zone: ['civic', 'core'], loot: 'medical' }),
  hospital: K({ name: 'hospital', w: [28, 36], d: [22, 30], storeys: [3, 5], h0: 4.4, zone: ['civic', 'core'], loot: 'medical', escape: 0.8, bays: [1, 4.6, 3.6] }),
  courthouse: K({ name: 'courthouse', w: [20, 26], d: [18, 24], storeys: [2, 3], h0: 5, zone: ['civic', 'core'], loot: 'civic' }),
  apartment: K({ name: 'apartment block', w: [16, 24], d: [14, 20], storeys: [3, 6], h0: 3.8, zone: ['core', 'res'], loot: 'house', escape: 0.85, claimable: true }),
  office: K({ name: 'office block', w: [18, 26], d: [18, 24], storeys: [3, 6], h0: 4.4, zone: ['core', 'commercial'], loot: 'office', escape: 0.5 }),
  hotel: K({ name: 'hotel', w: [20, 28], d: [16, 22], storeys: [4, 6], h0: 4.6, zone: ['core'], loot: 'house', escape: 0.9 }),
  // military (the base's own)
  barracks: K({ name: 'barracks', w: [24, 32], d: [10, 12], storeys: [2, 3], h0: 3.6, zone: ['military'], loot: 'military', escape: 0.7 }),
  hq: K({ name: 'headquarters', w: [24, 30], d: [18, 22], storeys: [2, 3], h0: 4.2, zone: ['military'], loot: 'military' }),
  guardhouse: K({ name: 'guardhouse', w: [5, 6], d: [5, 6], h0: 3.6, zone: ['military'], loot: 'military', roof: 'ladder', parapet: 1.1 }),
  // the country's other homes and stops
  farmhouse: K({ name: 'farmhouse', w: [10, 13], d: [9, 12], storeys: [2, 2], zone: ['farm', 'res'], loot: 'farm', roof: 'none', parapet: 0, claimable: true }),
  ranch_house: K({ name: 'ranch house', w: [14, 18], d: [9, 11], zone: ['farm', 'res'], loot: 'farm', roof: 'none', parapet: 0, claimable: true }),
  truck_stop: K({ name: 'truck stop', w: [20, 26], d: [14, 18], h0: 4.6, zone: ['road'], bays: [2, 5.0, 4.6], through: true, loot: 'garage', claimable: true }),
};

// Per-floor loot (the container's table, data/items.js LOOT names the street storey uses already; upper floors richer and
// more dangerous: tier +1 a floor, the roof's crate a sniper's). per: m² of floor per container.
export const LOOT_BY_KIND = {
  house: { table: ['bedroom', 'kitchen', 'bathroom'], per: 45 }, shop: { table: ['storefront'], per: 50 }, garage: { table: ['garage'], per: 40 },
  warehouse: { table: ['garage', 'storefront'], per: 90 }, military: { table: ['military', 'gunsmith'], per: 50 }, farm: { table: ['kitchen', 'garage'], per: 60 },
  civic: { table: ['office', 'bathroom'], per: 70 }, medical: { table: ['bathroom'], per: 50 }, office: { table: ['office'], per: 60 },
};
export const FLOOR_LOOT = { richPerFloor: 0.18, roofCrate: 0.5, roofTable: 'gunsmith' };

// ---- the vertical rules (the storeys law, docs/design/WEB_STOREYS.md; caps for the generated world) -------------------
//   maxStoreys   the cap (Robert: "up to 6 stories. You just cut off the top of it")
//   up           floor to floor above the street storey (m); slab: floor thickness; wall: wall thickness
//   flight       the stair: pitch (rise/run), width, landing depth; the band beside it for the switchback
//   window       window bays: one every `every` m of an upper wall, `w` wide, sill/height (rays pass, people do not)
//   escape       a fire escape: depth off the wall (m), width of its flights, the door gap per landing
//   bridge       plank/rope bridges between roofs: the most gap they span (m), their width, the share of eligible pairs built
export const VERT = {
  maxStoreys: 6, up: 3.2, slab: 0.22, wall: 0.4,
  flight: { pitch: 3.2 / 4.4, w: 1.4, landing: 1.4 },
  window: { every: 3.6, w: 1.3, sill: 0.95, h: 1.3 },
  escape: { d: 1.6, w: 1.2, door: 1.1 },
  bridge: { maxGap: 7, w: 1.4, share: 0.5 },
};

// ---- city archetypes (WEB_LOCATION_BIBLE §3.2) ------------------------------------------------------------------------
// biome[]   where it grows; sizeM: [min, max] side (m); blocks: the street plan ('grid' | 'organic' | 'radial' | 'linear' |
//           'canyon' | 'island' | 'square' - courthouse square); blockM: [min, max] block side; layout: the §3.4 plan id
// zoning    fractions of the blocks by zone (core, commercial, res, industrial, rail, farm, civic, military)
// storeys   [min, max] floors per zone (cap 6); kinds: the building kinds each zone draws from (weighted)
// density   { core, edge } 0..1 lot fill; age; damage 0..1 (ruined share and how broken); wealth 0..1 (loot and repair)
// walls     'none' (most), or a wall type with gates/towers: only when the archetype IS a stronghold (or a faction holds it)
// roads     the street rows by role [main, side, track]; pop: [min, max] living people before the fall of the town
// defense   0..1: how well it holds against the dead (walls add WALLS[type].defense)
const A = (o) => ({ walls: 'none', wealth: 0.4, damage: 0.4, age: 'postwar', defense: 0.25, pop: [20, 60], ...o });
export const ARCHETYPES = {
  sonoran_sprawl: A({ name: 'Sonoran sprawl', biome: ['desert_sonoran', 'desert_mojave'], sizeM: [420, 600], blocks: 'grid', blockM: [70, 96], layout: 'grid_downtown',
    zoning: { core: 0.12, commercial: 0.2, res: 0.48, industrial: 0.12, civic: 0.08 }, storeys: { core: [3, 6], commercial: [1, 2], res: [1, 1], industrial: [1, 1], civic: [1, 3] },
    kinds: { core: { office: 3, hotel: 2, apartment: 3, parking: 1 }, commercial: { shop: 4, gas_station: 2, auto_shop: 2, diner: 1, motel: 1 }, res: { house: 6, bungalow: 3, garage: 1 }, industrial: { warehouse: 3, auto_shop: 1 }, civic: { school: 1, clinic: 1, fire_station: 1, church: 1 } },
    density: { core: 0.85, edge: 0.4 }, age: 'sprawl', damage: 0.5, roads: ['blacktop4', 'blacktop2', 'dirt'], pop: [60, 140], defense: 0.2 }),
  adobe_pueblo: A({ name: 'adobe pueblo on a mesa', biome: ['high_plateau', 'desert_sonoran', 'badlands'], sizeM: [180, 260], blocks: 'organic', blockM: [28, 40], layout: 'mesa_pueblo',
    zoning: { core: 0.5, res: 0.4, civic: 0.1 }, storeys: { core: [2, 4], res: [1, 3], civic: [1, 1] },
    kinds: { core: { adobe: 6 }, res: { adobe: 5, cabin: 1 }, civic: { church: 1 } }, density: { core: 0.95, edge: 0.6 }, age: 'colonial', damage: 0.2, wealth: 0.3,
    walls: 'earth_berm', roads: ['dirt', 'dirt', 'dirt'], pop: [40, 90], defense: 0.6 }),
  plains_grain_town: A({ name: 'plains grain town', biome: ['great_plains', 'prairie_farm'], sizeM: [260, 360], blocks: 'linear', blockM: [60, 80], layout: 'main_street_strip',
    zoning: { commercial: 0.25, res: 0.45, rail: 0.15, farm: 0.15 }, storeys: { commercial: [1, 2], res: [1, 2], rail: [4, 6], farm: [1, 1] },
    kinds: { commercial: { shop: 4, saloon: 1, gas_station: 1, diner: 1 }, res: { house: 6, garage: 1 }, rail: { grain_elevator: 3, warehouse: 2 }, farm: { barn: 2, farmhouse: 1 } },
    density: { core: 0.7, edge: 0.35 }, age: '1920s', damage: 0.35, roads: ['blacktop2', 'gravel', 'dirt'], pop: [25, 60] }),
  rustbelt_mill: A({ name: 'rust-belt mill town', biome: ['great_lakes_rust', 'temperate_forest', 'appalachian'], sizeM: [380, 520], blocks: 'grid', blockM: [60, 84], layout: 'mill_town_river',
    zoning: { core: 0.12, commercial: 0.15, res: 0.4, industrial: 0.25, civic: 0.08 }, storeys: { core: [3, 5], commercial: [2, 3], res: [2, 3], industrial: [2, 5], civic: [2, 3] },
    kinds: { core: { office: 2, apartment: 3, hotel: 1 }, commercial: { shop: 4, saloon: 1, auto_shop: 1 }, res: { rowhouse: 6, house: 2 }, industrial: { mill: 3, warehouse: 3, auto_shop: 1 }, civic: { church: 2, school: 1, fire_station: 1 } },
    density: { core: 0.9, edge: 0.5 }, age: 'victorian', damage: 0.6, wealth: 0.3, roads: ['brick', 'blacktop2', 'gravel'], pop: [50, 120] }),
  appalachian_hollow: A({ name: 'Appalachian hollow', biome: ['appalachian', 'temperate_forest'], sizeM: [200, 320], blocks: 'canyon', blockM: [40, 60], layout: 'mine_head',
    zoning: { commercial: 0.2, res: 0.6, industrial: 0.2 }, storeys: { commercial: [1, 2], res: [1, 2], industrial: [1, 3] },
    kinds: { commercial: { shop: 3, diner: 1, gas_station: 1 }, res: { house: 4, cabin: 3, trailer: 2 }, industrial: { mill: 1, warehouse: 2 } },
    density: { core: 0.6, edge: 0.3 }, age: '1920s', damage: 0.45, wealth: 0.2, roads: ['switchback', 'gravel', 'dirt'], pop: [20, 50] }),
  gulf_stilt_town: A({ name: 'gulf stilt town', biome: ['gulf_coast', 'river_delta'], sizeM: [240, 340], blocks: 'linear', blockM: [50, 70], layout: 'stilt_village',
    zoning: { commercial: 0.2, res: 0.6, industrial: 0.2 }, storeys: { commercial: [1, 2], res: [1, 2], industrial: [1, 1] },
    kinds: { commercial: { shop: 3, diner: 2, motel: 1 }, res: { stilt_house: 6, house: 1 }, industrial: { warehouse: 2, auto_shop: 1 } },
    density: { core: 0.6, edge: 0.35 }, damage: 0.5, roads: ['blacktop2', 'boardwalk', 'gravel'], pop: [30, 70] }),
  swamp_ferry: A({ name: 'swamp ferry town', biome: ['deep_south_swamp', 'river_delta'], sizeM: [180, 260], blocks: 'linear', blockM: [40, 56], layout: 'stilt_village',
    zoning: { commercial: 0.25, res: 0.6, industrial: 0.15 }, storeys: { commercial: [1, 2], res: [1, 1], industrial: [1, 1] },
    kinds: { commercial: { shop: 2, saloon: 1, diner: 1 }, res: { stilt_house: 5, cabin: 2, trailer: 1 }, industrial: { warehouse: 1, barn: 1 } },
    density: { core: 0.55, edge: 0.3 }, age: '1920s', damage: 0.5, wealth: 0.2, walls: 'palisade', roads: ['causeway', 'boardwalk', 'dirt'], pop: [20, 45], defense: 0.45 }),
  new_england_green: A({ name: 'New England colonial green', biome: ['atlantic_coast', 'temperate_forest', 'northern_pine'], sizeM: [260, 360], blocks: 'square', blockM: [60, 84], layout: 'courthouse_square',
    zoning: { core: 0.15, commercial: 0.2, res: 0.5, civic: 0.15 }, storeys: { core: [2, 3], commercial: [2, 3], res: [2, 2], civic: [1, 3] },
    kinds: { core: { courthouse: 1, shop: 3, rowhouse: 2 }, commercial: { shop: 4, saloon: 1, diner: 1 }, res: { house: 5, rowhouse: 2 }, civic: { church: 2, school: 1, fire_station: 1 } },
    density: { core: 0.8, edge: 0.45 }, age: 'colonial', damage: 0.3, wealth: 0.5, roads: ['brick', 'blacktop2', 'gravel'], pop: [35, 80] }),
  pacific_timber_port: A({ name: 'Pacific timber port', biome: ['pacific_rain', 'northern_pine'], sizeM: [300, 420], blocks: 'grid', blockM: [60, 80], layout: 'port_wharf',
    zoning: { core: 0.12, commercial: 0.2, res: 0.38, industrial: 0.3 }, storeys: { core: [2, 4], commercial: [1, 2], res: [1, 2], industrial: [1, 3] },
    kinds: { core: { hotel: 1, office: 1, apartment: 1, shop: 2 }, commercial: { shop: 4, saloon: 2, diner: 1 }, res: { house: 5, cabin: 2 }, industrial: { mill: 3, warehouse: 4, auto_shop: 1 } },
    density: { core: 0.8, edge: 0.4 }, age: '1920s', damage: 0.4, roads: ['blacktop2', 'gravel', 'brick'], pop: [40, 90] }),
  alpine_mining_stack: A({ name: 'alpine mining stack', biome: ['alpine', 'high_plateau'], sizeM: [180, 260], blocks: 'canyon', blockM: [30, 44], layout: 'canyon_stack',
    zoning: { core: 0.3, res: 0.45, industrial: 0.25 }, storeys: { core: [2, 4], res: [2, 3], industrial: [2, 4] },
    kinds: { core: { saloon: 2, hotel: 1, shop: 2 }, res: { cabin: 3, rowhouse: 3 }, industrial: { mill: 2, warehouse: 1 } },
    density: { core: 0.85, edge: 0.5 }, age: 'victorian', damage: 0.4, wealth: 0.3, roads: ['switchback', 'gravel', 'dirt'], pop: [25, 55], defense: 0.4 }),
  interstate_exit: A({ name: 'interstate exit cluster', biome: Object.keys(BIOMES), sizeM: [160, 240], blocks: 'linear', blockM: [60, 90], layout: 'interchange_ring',
    zoning: { commercial: 0.7, res: 0.15, industrial: 0.15 }, storeys: { commercial: [1, 2], res: [1, 1], industrial: [1, 1] },
    kinds: { commercial: { gas_station: 3, motel: 2, diner: 2, truck_stop: 2, shop: 1 }, res: { trailer: 3, house: 1 }, industrial: { auto_shop: 2, warehouse: 1 } },
    density: { core: 0.6, edge: 0.3 }, age: 'postwar', damage: 0.5, roads: ['blacktop4', 'blacktop2', 'gravel'], pop: [8, 25], defense: 0.15 }),
  county_seat: A({ name: 'courthouse-square county seat', biome: ['great_plains', 'prairie_farm', 'temperate_forest', 'appalachian', 'gulf_coast', 'deep_south_swamp', 'desert_sonoran'], sizeM: [300, 420], blocks: 'square', blockM: [60, 80], layout: 'courthouse_square',
    zoning: { core: 0.16, commercial: 0.22, res: 0.44, civic: 0.1, industrial: 0.08 }, storeys: { core: [2, 4], commercial: [1, 3], res: [1, 2], civic: [1, 3], industrial: [1, 1] },
    kinds: { core: { courthouse: 1, office: 2, hotel: 1, shop: 3 }, commercial: { shop: 5, saloon: 1, diner: 1, gas_station: 1 }, res: { house: 6, bungalow: 2, garage: 1 }, civic: { church: 2, school: 1, fire_station: 1, clinic: 1 }, industrial: { warehouse: 2, auto_shop: 1 } },
    density: { core: 0.85, edge: 0.4 }, age: '1920s', damage: 0.35, wealth: 0.5, roads: ['brick', 'blacktop2', 'gravel'], pop: [50, 110], defense: 0.3 }),
  company_town: A({ name: 'company town', biome: ['appalachian', 'great_lakes_rust', 'high_plateau', 'desert_mojave'], sizeM: [260, 360], blocks: 'grid', blockM: [50, 70], layout: 'company_town',
    zoning: { core: 0.1, res: 0.55, industrial: 0.3, civic: 0.05 }, storeys: { core: [2, 3], res: [1, 2], industrial: [2, 4], civic: [1, 2] },
    kinds: { core: { office: 1, shop: 2, saloon: 1 }, res: { rowhouse: 3, house: 4 }, industrial: { mill: 3, warehouse: 3 }, civic: { church: 1, clinic: 1 } },
    density: { core: 0.9, edge: 0.6 }, age: '1920s', damage: 0.45, wealth: 0.25, roads: ['gravel', 'blacktop2', 'dirt'], pop: [40, 90] }),
  college_town: A({ name: 'college town', biome: ['temperate_forest', 'great_plains', 'atlantic_coast', 'pacific_rain'], sizeM: [340, 460], blocks: 'grid', blockM: [64, 84], layout: 'campus_quad',
    zoning: { core: 0.14, commercial: 0.2, res: 0.42, civic: 0.24 }, storeys: { core: [3, 5], commercial: [1, 3], res: [1, 3], civic: [2, 4] },
    kinds: { core: { apartment: 3, office: 1, parking: 1 }, commercial: { shop: 4, diner: 2, saloon: 1 }, res: { house: 4, rowhouse: 2, apartment: 1 }, civic: { school: 4, clinic: 1, church: 1 } },
    density: { core: 0.85, edge: 0.45 }, age: 'postwar', damage: 0.4, wealth: 0.55, roads: ['blacktop2', 'brick', 'gravel'], pop: [40, 100] }),
  military_town: A({ name: 'military base town', biome: Object.keys(BIOMES), sizeM: [300, 400], blocks: 'grid', blockM: [60, 80], layout: 'main_street_strip',
    zoning: { commercial: 0.35, res: 0.5, industrial: 0.15 }, storeys: { commercial: [1, 2], res: [1, 1], industrial: [1, 1] },
    kinds: { commercial: { shop: 3, saloon: 2, gas_station: 1, auto_shop: 2, motel: 1 }, res: { house: 3, trailer: 4, bungalow: 2 }, industrial: { warehouse: 2, auto_shop: 1 } },
    density: { core: 0.7, edge: 0.35 }, damage: 0.45, roads: ['blacktop2', 'gravel', 'dirt'], pop: [30, 70] }),
  dead_suburb: A({ name: 'dead suburb cul-de-sacs', biome: ['desert_sonoran', 'desert_mojave', 'great_plains', 'temperate_forest', 'gulf_coast', 'atlantic_coast'], sizeM: [320, 440], blocks: 'organic', blockM: [70, 100], layout: 'grid_downtown',
    zoning: { res: 0.82, commercial: 0.12, civic: 0.06 }, storeys: { res: [1, 2], commercial: [1, 1], civic: [1, 2] },
    kinds: { res: { house: 7, bungalow: 3, garage: 2 }, commercial: { shop: 2, gas_station: 1 }, civic: { school: 1, church: 1 } },
    density: { core: 0.7, edge: 0.55 }, age: 'sprawl', damage: 0.65, wealth: 0.45, roads: ['blacktop2', 'blacktop2', 'gravel'], pop: [10, 40], defense: 0.1 }),
  port_wharf: A({ name: 'port wharf', biome: ['gulf_coast', 'atlantic_coast', 'pacific_rain', 'great_lakes_rust'], sizeM: [300, 420], blocks: 'grid', blockM: [56, 80], layout: 'port_wharf',
    zoning: { core: 0.12, commercial: 0.18, res: 0.25, industrial: 0.4, rail: 0.05 }, storeys: { core: [3, 5], commercial: [1, 2], res: [2, 3], industrial: [1, 2], rail: [1, 1] },
    kinds: { core: { office: 2, hotel: 1, apartment: 2 }, commercial: { saloon: 2, shop: 3, diner: 1 }, res: { rowhouse: 4, apartment: 1 }, industrial: { warehouse: 6, auto_shop: 1 }, rail: { warehouse: 1 } },
    density: { core: 0.85, edge: 0.5 }, age: '1920s', damage: 0.5, walls: 'container', roads: ['blacktop4', 'brick', 'gravel'], pop: [50, 120], defense: 0.45 }),
  refinery_town: A({ name: 'refinery town', biome: ['gulf_coast', 'great_plains', 'desert_mojave', 'badlands'], sizeM: [280, 380], blocks: 'grid', blockM: [60, 80], layout: 'refinery_maze',
    zoning: { commercial: 0.15, res: 0.35, industrial: 0.5 }, storeys: { commercial: [1, 2], res: [1, 1], industrial: [1, 3] },
    kinds: { commercial: { shop: 3, gas_station: 2, diner: 1 }, res: { house: 4, trailer: 3 }, industrial: { warehouse: 4, mill: 2, auto_shop: 1 } },
    density: { core: 0.75, edge: 0.4 }, damage: 0.55, wealth: 0.35, walls: 'car_husk', roads: ['blacktop2', 'gravel', 'dirt'], pop: [30, 80], defense: 0.4 }),
  oasis_ring: A({ name: 'oasis ring', biome: ['desert_mojave', 'desert_sonoran', 'salt_flat'], sizeM: [200, 280], blocks: 'radial', blockM: [44, 60], layout: 'oasis_ring',
    zoning: { core: 0.2, commercial: 0.3, res: 0.5 }, storeys: { core: [1, 2], commercial: [1, 2], res: [1, 1] },
    kinds: { core: { saloon: 1, shop: 2, clinic: 1 }, commercial: { shop: 3, gas_station: 1, motel: 1 }, res: { adobe: 3, trailer: 3, house: 1 } },
    density: { core: 0.8, edge: 0.45 }, damage: 0.3, wealth: 0.35, walls: 'car_husk', roads: ['dirt', 'gravel', 'dirt'], pop: [30, 70], defense: 0.5 }),
  tundra_station: A({ name: 'frozen outpost', biome: ['tundra_north', 'northern_pine', 'alpine'], sizeM: [160, 240], blocks: 'linear', blockM: [40, 60], layout: 'main_street_strip',
    zoning: { commercial: 0.3, res: 0.5, industrial: 0.2 }, storeys: { commercial: [1, 2], res: [1, 2], industrial: [1, 1] },
    kinds: { commercial: { saloon: 1, shop: 2, truck_stop: 1 }, res: { cabin: 4, trailer: 2 }, industrial: { quonset: 2, warehouse: 1 } },
    density: { core: 0.65, edge: 0.35 }, damage: 0.35, wealth: 0.25, roads: ['gravel', 'dirt', 'dirt'], pop: [12, 30], defense: 0.3 }),
  badlands_crossroads: A({ name: 'badlands crossroads', biome: ['badlands', 'great_plains', 'high_plateau'], sizeM: [160, 220], blocks: 'linear', blockM: [50, 70], layout: 'main_street_strip',
    zoning: { commercial: 0.5, res: 0.5 }, storeys: { commercial: [1, 2], res: [1, 1] },
    kinds: { commercial: { saloon: 2, gas_station: 1, shop: 2, auto_shop: 1 }, res: { trailer: 3, house: 2, cabin: 1 } },
    density: { core: 0.65, edge: 0.3 }, age: '1920s', damage: 0.55, wealth: 0.2, walls: 'car_husk', roads: ['dirt', 'gravel', 'dirt'], pop: [15, 35], defense: 0.4 }),
  salt_works: A({ name: 'salt works', biome: ['salt_flat', 'desert_mojave'], sizeM: [180, 260], blocks: 'grid', blockM: [50, 70], layout: 'tank_farm',
    zoning: { res: 0.4, industrial: 0.6 }, storeys: { res: [1, 1], industrial: [1, 2] },
    kinds: { res: { trailer: 3, house: 1 }, industrial: { warehouse: 3, quonset: 2, auto_shop: 1 } },
    density: { core: 0.6, edge: 0.3 }, damage: 0.4, wealth: 0.3, roads: ['blacktop2', 'dirt', 'dirt'], pop: [10, 30] }),
  delta_river_town: A({ name: 'delta river town', biome: ['river_delta', 'deep_south_swamp', 'gulf_coast'], sizeM: [260, 360], blocks: 'grid', blockM: [56, 76], layout: 'river_fork_terraced',
    zoning: { core: 0.12, commercial: 0.2, res: 0.48, industrial: 0.12, civic: 0.08 }, storeys: { core: [2, 4], commercial: [1, 2], res: [1, 2], industrial: [1, 2], civic: [1, 2] },
    kinds: { core: { hotel: 1, office: 1, shop: 2, courthouse: 1 }, commercial: { shop: 4, saloon: 1, diner: 1 }, res: { house: 3, stilt_house: 3, bungalow: 1 }, industrial: { warehouse: 3, mill: 1 }, civic: { church: 2, clinic: 1 } },
    density: { core: 0.8, edge: 0.4 }, age: 'victorian', damage: 0.5, roads: ['brick', 'causeway', 'gravel'], pop: [40, 90] }),
  hot_zone_ruin: A({ name: 'hot-zone ruin', biome: ['hot_ground', 'great_lakes_rust', 'desert_mojave'], sizeM: [300, 420], blocks: 'grid', blockM: [64, 90], layout: 'cooling_tower_field',
    zoning: { core: 0.2, commercial: 0.2, res: 0.35, industrial: 0.25 }, storeys: { core: [3, 6], commercial: [1, 3], res: [1, 3], industrial: [1, 2] },
    kinds: { core: { office: 3, apartment: 2, hotel: 1, parking: 1 }, commercial: { shop: 3, gas_station: 1 }, res: { apartment: 2, house: 3, rowhouse: 2 }, industrial: { warehouse: 3, mill: 1 } },
    density: { core: 0.7, edge: 0.3 }, damage: 0.85, wealth: 0.6, roads: ['blacktop4', 'blacktop2', 'dirt'], pop: [0, 8], defense: 0.05 }),
  walled_stronghold: A({ name: 'walled stronghold', biome: Object.keys(BIOMES), sizeM: [220, 300], blocks: 'square', blockM: [44, 60], layout: 'star_fort',
    zoning: { core: 0.25, commercial: 0.25, res: 0.4, civic: 0.1 }, storeys: { core: [2, 4], commercial: [1, 2], res: [1, 2], civic: [1, 2] },
    kinds: { core: { courthouse: 1, hotel: 1, saloon: 1, apartment: 1 }, commercial: { shop: 4, auto_shop: 1, saloon: 1 }, res: { house: 4, rowhouse: 2 }, civic: { clinic: 1, church: 1 } },
    density: { core: 0.9, edge: 0.6 }, age: 'postwar', damage: 0.2, wealth: 0.6, walls: 'container', roads: ['blacktop2', 'gravel', 'dirt'], pop: [60, 140], defense: 0.7 }),
  boom_strip: A({ name: 'casino strip', biome: ['desert_mojave', 'desert_sonoran', 'salt_flat'], sizeM: [300, 420], blocks: 'linear', blockM: [80, 110], layout: 'main_street_strip',
    zoning: { core: 0.4, commercial: 0.35, res: 0.15, industrial: 0.1 }, storeys: { core: [4, 6], commercial: [1, 2], res: [1, 2], industrial: [1, 1] },
    kinds: { core: { hotel: 4, parking: 2, office: 1 }, commercial: { shop: 3, motel: 2, diner: 1, gas_station: 1 }, res: { apartment: 1, trailer: 2 }, industrial: { warehouse: 2, auto_shop: 1 } },
    density: { core: 0.8, edge: 0.35 }, age: 'sprawl', damage: 0.4, wealth: 0.7, walls: 'car_husk', roads: ['blacktop4', 'blacktop2', 'gravel'], pop: [60, 150], defense: 0.5 }),
};

// Walls (most towns have NONE: Robert, "I don't think all cities should have walls"). h: height; t: thickness; gates: per
// side the street crosses; towers: at corners; defense: added to the archetype's; look: palette.
export const WALLS = {
  none: { h: 0, t: 0, defense: 0 },
  earth_berm: { h: 2.4, t: 3, defense: 0.25, look: '#8a6a4a', gateW: 6 },
  palisade: { h: 3.2, t: 0.5, defense: 0.25, look: '#5e4a34', gateW: 6, towers: true },
  car_husk: { h: 2.6, t: 2.2, defense: 0.3, look: '#6a4a3a', gateW: 7, towers: true },
  container: { h: 2.9, t: 2.4, defense: 0.4, look: '#6a5a44', gateW: 7, towers: true },
  stone_terrace: { h: 3.6, t: 1.4, defense: 0.45, look: '#8a8274', gateW: 6, towers: true },
  chainlink: { h: 3.0, t: 0.15, defense: 0.15, look: '#6a6a62', gateW: 8, towers: true },
};

// ---- living outside a city (Robert: "live in a city or outside of a city") --------------------------------------------
// Rural homesteads scattered by biome along roads. Each is a cluster of KINDS on a parcel, every main building claimable.
//   parcel [w, d] m; buildings: [kind, count] (count may be [min, max]); fence: a fence type round the parcel (or none)
//   every: one per this many metres of road (on either side), off the road by `off` [min, max] m; biome: where it appears
export const RURAL = {
  farmstead: { name: 'farmstead', parcel: [70, 60], buildings: [['farmhouse', 1], ['barn', 1], ['garage', [0, 1]], ['grain_elevator', [0, 1]]], fence: 'chainlink', biome: ['great_plains', 'prairie_farm', 'temperate_forest', 'appalachian', 'deep_south_swamp', 'gulf_coast'], every: 2200, off: [70, 160] },
  ranch: { name: 'ranch', parcel: [80, 64], buildings: [['ranch_house', 1], ['barn', 1], ['quonset', [0, 1]], ['trailer', [0, 2]]], fence: 'chainlink', biome: ['desert_sonoran', 'desert_mojave', 'high_plateau', 'badlands', 'great_plains'], every: 2600, off: [80, 180] },
  roadside_motel: { name: 'roadside motel', parcel: [60, 40], buildings: [['motel', 1], ['diner', [0, 1]], ['gas_station', [0, 1]]], fence: 'none', biome: Object.keys(BIOMES), every: 4200, off: [26, 50] },
  cabin_camp: { name: 'cabins', parcel: [56, 48], buildings: [['cabin', [2, 4]], ['garage', [0, 1]]], fence: 'none', biome: ['northern_pine', 'alpine', 'appalachian', 'pacific_rain', 'temperate_forest', 'tundra_north'], every: 2400, off: [60, 160] },
  trailer_park: { name: 'trailer park', parcel: [64, 56], buildings: [['trailer', [4, 7]], ['garage', [0, 1]]], fence: 'chainlink', biome: ['desert_sonoran', 'desert_mojave', 'gulf_coast', 'great_plains', 'deep_south_swamp', 'salt_flat'], every: 3400, off: [40, 120] },
  truck_stop: { name: 'truck stop', parcel: [72, 52], buildings: [['truck_stop', 1], ['diner', [0, 1]], ['motel', [0, 1]]], fence: 'none', biome: Object.keys(BIOMES), every: 6000, off: [30, 60] },
  stilt_camp: { name: 'stilt camp', parcel: [50, 44], buildings: [['stilt_house', [2, 3]], ['barn', [0, 1]]], fence: 'palisade', biome: ['deep_south_swamp', 'river_delta', 'gulf_coast'], every: 2600, off: [50, 120] },
};

// ---- military bases with vast sealed bunkers (Robert: "far in between") ------------------------------------------------
// size: the base (m); runway: [length, width] or null; hangars, housing (rows x cols of barracks/houses), hq; gates: on the
// road side and the far side; fence: the fence row. bunker: the vault under the HQ (data/underground.js KINDS.vault, 5-8
// levels: entry vault, security, barracks, labs, storage, power and the sealed ring-platform room). spacing: no two bases
// closer than this along the streamed road (m), and only at a real base anchor (data/atlas.js ATLAS_BASES).
export const MILITARY = {
  size: [520, 400], runway: [380, 30], hangars: 3, housing: [2, 4], fence: 'chainlink', towers: 4,
  bunker: { kind: 'vault', levels: [6, 6], entrance: 'lift' },
  spacing: 40000, maxSpacing: 60000,
};

// ---- the dead against the living (Robert: "cities ... be able to get overrun") ----------------------------------------
//   infestation   each settlement's 0..1 value: start rolls in [start], rises with hordes that reach it, falls when cleared
//   overrun       past this the town FALLS: residents flee or turn, gates open, loot shifts, the map marks it; retake: below
//                 `retake` after the player clears it (kills inside the footprint drain it by perKill)
//   horde         a migrating horde is a RECORD (strength = bodies) walking roads at `speed` m/s toward the loudest/nearest
//                 settlement within `seek` m; within `bodyR` of the player it puts up to `bodies` characters in the street
//                 (the rest stay strength: the 160-character cap is never broken); at a town it fights the defense:
//                 every s it loses defense*kill bodies, and the bodies past what it holds back (defense*hold) press in:
//                 infestation += (strength - defense*hold) * press. Example: 200 vs defense 0.3 -> held 90, falls in ~15 s;
//                 vs defense 1.5 (a walled stronghold) -> held 450, never presses, the horde is spent in ~15 s
//   noise         a gunshot/blast in a settlement draws hordes within `draw` m toward it
//   dusk          the hour hordes wake and start to walk (game hours); dawn: they stop and dig in
export const OVERRUN = {
  start: [0.0, 0.25], overrun: 0.75, retake: 0.2, perKill: 0.004, decay: 0.002,
  horde: { speed: 1.4, seek: 6000, bodyR: 160, bodies: 40, tick: 2, kill: 9, press: 0.0006, arrive: 60, hold: 300 },
  noise: { draw: 900 },
  dusk: 19, dawn: 6,
  fleeShare: 0.6, // of the residents when it falls: the rest turn
  loot: { overrun: 'military', clearedBonus: 0.25 },
};

// ---- where the world puts them --------------------------------------------------------------------------------------
//   cityEvery   one city per this many metres of streamed corridor (alternating sides), off the road by cityOff
//   clear       a settlement keeps this far from the Phoenix island + ring (m from 0,0), holdouts and exit communities
//   attachR / releaseR   a settlement is built (geometry + colliders) inside attachR of the player, torn down past releaseR
//   maxLive     at most this many settlements built at once (the nearest)
export const PLACE = { cityEvery: 9000, cityOff: [380, 640], clear: { island: 2200, holdout: 900, exit: 700 }, attachR: 760, releaseR: 1050, maxLive: 3 };

// ---- the check ---------------------------------------------------------------------------------------------------------
const hueOf = (hex) => {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.06) return -1; // grey: no hue
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
export const purpleHex = (hex) => { const h = hueOf(hex); return h >= 270 && h <= 320; };

export function validateCitygen() {
  const errs = [];
  const zonesAll = new Set(['core', 'commercial', 'res', 'industrial', 'rail', 'farm', 'civic', 'military', 'edge', 'road']);
  for (const [id, B] of Object.entries(BIOMES)) {
    for (const r of B.roads) if (!ROADS[r]) errs.push(`biome ${id}: road ${r}?`);
    for (const c of [B.ground, ...B.walls, ...B.roof]) if (purpleHex(c)) errs.push(`biome ${id}: purple ${c}`);
  }
  for (const [id, R] of Object.entries(ROADS)) { if (!(R.grip > 0.3 && R.grip <= 1.05)) errs.push(`road ${id}: grip`); if (purpleHex(R.color)) errs.push(`road ${id}: purple`); }
  for (const [id, k] of Object.entries(KINDS)) {
    if (k.storeys[1] > VERT.maxStoreys || k.storeys[0] < 1 || k.storeys[0] > k.storeys[1]) errs.push(`kind ${id}: storeys ${k.storeys}`);
    if (!LOOT_BY_KIND[k.loot]) errs.push(`kind ${id}: loot ${k.loot}`);
    if (k.bays && k.bays[1] > Math.min(k.w[0], k.d[0]) - 1) errs.push(`kind ${id}: bays wider than the building`);
    for (const z of k.zone) if (!zonesAll.has(z)) errs.push(`kind ${id}: zone ${z}`);
  }
  const biomesSeen = new Set();
  for (const [id, a] of Object.entries(ARCHETYPES)) {
    let s = 0; for (const v of Object.values(a.zoning)) s += v;
    if (Math.abs(s - 1) > 0.02) errs.push(`archetype ${id}: zoning sums to ${s.toFixed(2)}`);
    for (const z of Object.keys(a.zoning)) {
      if (!a.kinds[z]) errs.push(`archetype ${id}: zone ${z} has no kinds`);
      if (!a.storeys[z]) errs.push(`archetype ${id}: zone ${z} has no storeys`);
      else if (a.storeys[z][1] > VERT.maxStoreys) errs.push(`archetype ${id}: zone ${z} above the cap`);
      for (const k of Object.keys(a.kinds[z] ?? {})) if (!KINDS[k]) errs.push(`archetype ${id}: kind ${k}?`);
    }
    for (const b of a.biome) { if (!BIOMES[b]) errs.push(`archetype ${id}: biome ${b}?`); biomesSeen.add(b); }
    if (!WALLS[a.walls]) errs.push(`archetype ${id}: walls ${a.walls}?`);
    for (const r of a.roads) if (!ROADS[r]) errs.push(`archetype ${id}: road ${r}?`);
    if (a.sizeM[0] > a.sizeM[1] || a.sizeM[1] > 700) errs.push(`archetype ${id}: size`);
  }
  for (const b of Object.keys(BIOMES)) if (!biomesSeen.has(b)) errs.push(`biome ${b}: no archetype grows there`);
  const walled = Object.values(ARCHETYPES).filter((a) => a.walls !== 'none').length;
  if (walled > Object.keys(ARCHETYPES).length / 2) errs.push('most archetypes are walled (most towns have none)');
  for (const [id, r] of Object.entries(RURAL)) for (const [k] of r.buildings) if (!KINDS[k]) errs.push(`rural ${id}: kind ${k}?`);
  return { ok: !errs.length, errs, archetypes: Object.keys(ARCHETYPES).length, biomes: biomesSeen.size, kinds: Object.keys(KINDS).length, roads: Object.keys(ROADS).length, rural: Object.keys(RURAL).length, walled };
}
