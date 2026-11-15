// Migration: tools/fixtures/tables/vehicles.legacy.json (the JS literals as they were) -> src/data/tables/vehicles/*.csv + schemas.
// Run: node tools/tables/extract-vehicles.mjs     (the CSVs are the source of truth afterwards; edit them, not this.)
import { readFileSync } from 'node:fs';
import { extract, writeTables } from './extract.mjs';

const snap = JSON.parse(readFileSync(new URL('../fixtures/tables/vehicles.legacy.json', import.meta.url), 'utf8'), (k, v) => (v === '__Infinity__' ? Infinity : v));
const OUT = new URL('../../src/data/tables/vehicles/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const family = 'vehicles';
const outs = [];
const add = (spec) => outs.push(...extract({ family, ...spec }));

// ---- bodies ------------------------------------------------------------------------------------------------------------
const bodies = {};
const group = {};
for (const [k, v] of Object.entries(snap.VEHICLES)) { bodies[k] = v; group[k] = 'core'; }
for (const [k, v] of Object.entries(snap.SEMI_VEHICLES)) { bodies[k] = v; group[k] = 'semi'; }
for (const [k, v] of Object.entries(snap.TOW_VEHICLES)) { bodies[k] = v; group[k] = 'tow'; }
add({
  table: 'Vehicles', rows: bodies, parentCol: 'Vehicle', legacy: 'src/systems/vehicles.js (+ semis.js, data/towing.js)',
  description: 'Every vehicle body: size, speed, handling, hit points, fuel, flags. One row per body; seats are the VehiclesSeats child table. Group: core = vehicles.js, semi = systems/semis.js, tow = data/towing.js.',
  prep: (o) => ({ ...o, deck: o.deck && typeof o.deck === 'object' ? o.deck.key : o.deck }),
  meta: { Group: (k) => group[k] }, metaEnum: { Group: ['core', 'semi', 'tow'] }, metaDesc: { Group: 'Which game module registers the row (load order).' },
  units: { len: 'm', wid: 'm', tall: 'm', maxSpeed: 'mps', reverse: 'mps', accel: 'mps2', turn: 'radps', mass: 't', grip: 'per_s', hp: 'hit_points', fuelCap: 'L', 'tractor.fifth': 'm', at: 'm' },
  descs: {
    len: 'Body length (m).', wid: 'Body width (m).', tall: 'Body height (m).', maxSpeed: 'Top speed (m/s).', reverse: 'Top speed backing up (m/s); empty = a share of maxSpeed (Driving table).',
    accel: 'Engine pull (m/s^2).', turn: 'Steering rate at the wheel (rad/s).', grip: 'Tyre grip; pulls sideways slip back in (dimensionless).', mass: 'Mass in tonnes.',
    hp: 'Hit points of the hull.', armor: 'Damage taken multiplier (lower = tougher).', fuelCap: 'Tank size in litres (0 = no engine).', deck: 'Key of the walkable deck row (data/decks.js; trailer holds: data/trailers.js).',
  },
  tuples: { at: ['X', 'Y', 'Z'] }, ints: ['row'],
  source: 'design',
});

add({
  table: 'Driving', rows: { default: snap.DRIVING }, parentCol: 'Driving', legacy: 'src/systems/vehicles.js DRIVING',
  description: 'How driving answers the wheel (docs/design/WEB_WALK_VEHICLES.md, WEB_FEEL.md): steering, reverse, shooting from a moving car, slide. One row.',
  tuples: { reverseCap: ['Min', 'Max'] },
  units: { reverseCap: 'mps', parkBrake: 'mps2', steerRate: 'per_s', steerReturn: 'per_s', aimHold: 's', 'shootSpread.perMs': 'rad', 'shootSpread.max': 'rad' },
  source: 'design: docs/design/WEB_FEEL.md',
});

// ---- towing -----------------------------------------------------------------------------------------------------------
add({
  table: 'TowLines', rows: snap.LINES, parentCol: 'Line', legacy: 'src/data/towing.js LINES',
  description: 'Lines between vehicles (rope, chain, winch cable, the wrecker boom, a trailer hitch). A spring that only pulls, or a rigid bar. docs/design/WEB_MOVE_TOW.md.',
  units: { len: 'm', range: 'm', maxStretch: 'm', w: 'm', sag: 'm', k: '', damp: '', breakLoad: '' },
  descs: { item: 'Item key the player carries to make it (empty = part of a vehicle).', k: 'Spring constant.', breakLoad: 'Smoothed tension (vehicle mass x m/s^2) that parts it.', color: 'Hex colour drawn.' },
  source: 'design: docs/design/WEB_MOVE_TOW.md',
});
add({
  table: 'TowSettings', rows: { default: snap.TOW }, parentCol: 'Setting', legacy: 'src/data/towing.js TOW',
  description: 'The towing system\'s own numbers: hook reach, load smoothing, towed drag, winch speed, gate and wreck loads. One row. docs/design/WEB_MOVE_TOW.md.',
  units: { reach: 'm', filter: 'per_s', reelSpeed: 'mps', tieSlack: 'm', snapFling: '', towedDrag: 'per_s', liftedDrag: 'per_s' }, ints: ['segs', 'maxLinks'],
  source: 'design: docs/design/WEB_MOVE_TOW.md',
});
add({
  table: 'MudSettings', rows: { default: snap.MUD }, parentCol: 'Setting', legacy: 'src/data/towing.js MUD',
  description: 'Mud: how soft ground holds a car that sits or spins its wheels in it (bog 0..1). One row.',
  units: { drag: 'per_s', soft: 'per_s', spinSpeed: 'mps', sink: 'per_s', sinkIdle: 'per_s', firm: 'per_s' },
  source: 'design: docs/design/WEB_MOVE_TOW.md',
});
add({
  table: 'BoatTrailerSettings', rows: { default: snap.TRAILER }, parentCol: 'Setting', legacy: 'src/data/towing.js TRAILER',
  description: 'The boat trailer and the ramp: water depths for launching and the winch. One row.',
  units: { tailDepth: 'm', wheelMax: 'm', bunkY: 'm', bunkZ: 'm', loadReach: 'm', loadSpeed: 'mps', loadAngle: 'rad', haulSpeed: 'mps', launchPush: 'mps' },
  source: 'design: docs/design/WEB_MOVE_TOW.md',
});
add({
  table: 'TowItems', rows: snap.TOW_ITEMS, parentCol: 'Item', legacy: 'src/data/towing.js TOW_ITEMS',
  description: 'The pack items towing registers (tow rope, tow chain). Item rows proper move to the items family later.',
  units: { kg: 'kg', bulk: '', stack: '', value: 'scrip' }, ints: ['stack'],
  source: 'design: docs/design/WEB_MOVE_TOW.md',
});

// ---- trailers (semis) -------------------------------------------------------------------------------------------------
add({
  table: 'Trailers', rows: snap.TRAILERS, parentCol: 'Trailer', legacy: 'src/data/trailers.js TRAILERS',
  description: 'Semi trailers: kingpin, axle, floor, the hold a car drives into, the drop ramp, cargo limits. Body frame: +x the driver\'s left, +z forward. docs/design/WEB_SEMIS.md.',
  units: { kingpin: 'm', axle: 'm', floorY: 'm', 'hold.x0': 'm', 'hold.x1': 'm', 'hold.z0': 'm', 'hold.z1': 'm', 'hold.h': 'm', 'hold.rail': 'm',
    'ramp.hinge': 'm', 'ramp.len': 'm', 'ramp.width': 'm', 'ramp.secs': 's', 'maxCargo.mass': 't' }, ints: ['maxCargo.cars', 'escort'],
  descs: { vehicle: 'Key of the Vehicles row that is this trailer.', 'hold.h': 'Clear height of the opening (m); Infinity for an open deck.' },
  source: 'design: docs/design/WEB_SEMIS.md',
});
add({
  table: 'HitchSettings', rows: { default: snap.HITCH }, parentCol: 'Setting', legacy: 'src/data/trailers.js HITCH',
  description: 'How a tractor and trailer move as one: coupling reach, articulation stop, jackknife, trailer swing. One row.',
  units: { reach: 'm', reachAngle: 'rad', yawLimit: 'rad', 'jackknife.brakeA': 'mps2', 'jackknife.minSpeed': 'mps', 'jackknife.clearAt': 'rad', 'jackknife.seedAngle': 'rad', 'jackknife.scrub': 'per_s', 'swing.grip': 'mps2', 'pull.pullMass': 't', sparks: '' },
  source: 'design: docs/design/WEB_SEMIS.md',
});
add({
  table: 'CarrySettings', rows: { default: snap.CARRY }, parentCol: 'Setting', legacy: 'src/data/trailers.js CARRY',
  description: 'A car in a trailer hold: boarding tolerances, wall bounce, brake hold, ramp safety. One row.',
  units: { 'board.angle': 'rad', 'board.speed': 'mps', 'board.cool': 's', wallHurt: 'mps', brakeHold: 'mps2', tyreHold: 'mps2', rampSafe: 'mps', matchSpeed: 'mps' },
  source: 'design: docs/design/WEB_SEMIS.md',
});
add({
  table: 'RoadFit', rows: snap.ROAD_FIT, parentCol: 'Road', legacy: 'src/data/trailers.js ROAD_FIT',
  description: 'Per road class: the paved width a rig may use, the longest rig its bends take, whether a wide load may use it.',
  units: { width: 'm', maxLen: 'm' }, source: 'design: docs/design/WEB_SEMIS.md',
});
add({
  table: 'Clearance', rows: snap.CLEARANCE_ROWS ?? Object.fromEntries(Object.entries(snap.CLEARANCE).filter(([k]) => k !== 'margin').map(([k, v]) => [k, { clearance: v }])), parentCol: 'Structure', legacy: 'src/data/trailers.js CLEARANCE',
  description: 'Clearance under things you drive beneath (overpass, rail bridge, low bridge), in metres.',
  units: { clearance: 'm' }, source: 'design: docs/design/WEB_SEMIS.md',
});
add({
  table: 'TrailerConstants', rows: { default: { laneW: snap.LANE_W, fitMargin: snap.FIT_MARGIN, clearanceMargin: snap.CLEARANCE.margin } }, parentCol: 'Setting', legacy: 'src/data/trailers.js LANE_W, FIT_MARGIN, CLEARANCE.margin',
  description: 'Lane width, the margin each side a rig needs, the margin under a structure. One row.',
  units: { laneW: 'm', fitMargin: 'm', clearanceMargin: 'm' }, source: 'design: docs/design/WEB_SEMIS.md',
});

// ---- parts (the older garage rows, data/parts.js) ---------------------------------------------------------------------
add({
  table: 'PlateSettings', rows: { default: snap.PLATE }, parentCol: 'Setting', legacy: 'src/data/parts.js PLATE',
  description: 'The old garage plate: hit points a point stops, weight, price. One row.', units: { absorb: 'hit_points', kg: 'kg', price: 'scrip' }, source: 'design',
});
add({
  table: 'PlateMax', rows: snap.PLATE_MAX, parentCol: 'Body', legacy: 'src/data/parts.js PLATE_MAX',
  description: 'How many plate points each body can carry per face (the old garage; workshop CHASSIS is the new one).', units: { front: '', rear: '', left: '', right: '' }, ints: ['front', 'rear', 'left', 'right'], source: 'design',
});
add({
  table: 'LoadSettings', rows: { default: snap.LOAD }, parentCol: 'Setting', legacy: 'src/data/parts.js LOAD',
  description: 'Weight costs performance (old garage): top-speed loss per mass ratio and the turn exponent. One row.', units: { topLossPerMassRatio: '', turnExp: '' }, source: 'design',
});
add({
  table: 'PartMounts', rows: snap.MOUNTS, parentCol: 'Mount', legacy: 'src/data/parts.js MOUNTS',
  description: 'The old garage mounts (front gun, rear droppers).',
  units: { price: 'scrip', kg: 'kg', rate: 's', range: 'm', arc: 'rad', 'slick.r': 'm', 'slick.life': 's', 'field.r': 'm', 'field.life': 's', dmg: 'hit_points' }, ints: ['ammo', 'charges'], source: 'design',
});
add({
  table: 'PartMountOk', rows: Object.fromEntries(Object.entries(snap.MOUNT_OK).map(([k, v]) => [k, { ok: v }])), parentCol: 'Body', legacy: 'src/data/parts.js MOUNT_OK',
  description: 'Which old-garage mounts each body takes (child table Mounts: the list; the object is { ok: [...] }).', source: 'design',
});

// ---- the workshop ------------------------------------------------------------------------------------------------------
add({
  table: 'ArmorTypes', rows: snap.ARMOR, parentCol: 'Armor', legacy: 'src/data/workshop.js ARMOR',
  description: 'What a face can be plated with: weight, price, hit points absorbed, welding hours, damage-type multipliers. docs/design/WEB_WORKSHOP.md.',
  units: { kg: 'kg', price: 'scrip', absorb: 'hit_points', labour: 'gh', crash: '', ram: '', 'grabbers.grip': 'per_s', 'grabbers.dps': 'hit_points' },
  descs: { 'vs.bullet': 'Multiplier on bullet hits.', 'vs.fire': 'Multiplier on fire.', 'vs.blast': 'Multiplier on blasts.', 'vs.pierce': 'Multiplier on rail/pierce hits.' },
  source: 'design: docs/design/WEB_WORKSHOP.md',
});
add({
  table: 'Chassis', rows: snap.CHASSIS, parentCol: 'Body', legacy: 'src/data/workshop.js CHASSIS',
  description: 'What each body can carry: total bolt-on kilograms, spaces, plate points per face, mount points per face (size 1..3, arc). A body not listed cannot be worked on.',
  units: { maxKg: 'kg', spaces: '', 'mounts.front.arc': 'rad', 'mounts.rear.arc': 'rad', 'mounts.left.arc': 'rad', 'mounts.right.arc': 'rad', 'mounts.top.arc': 'rad' },
  ints: ['spaces', 'faces.front', 'faces.rear', 'faces.left', 'faces.right', 'faces.top', 'faces.under', 'mounts.front.size', 'mounts.rear.size', 'mounts.left.size', 'mounts.right.size', 'mounts.top.size'],
  source: 'design: docs/design/WEB_WORKSHOP.md',
});
add({
  table: 'PerfSettings', rows: { default: snap.PERF }, parentCol: 'Setting', legacy: 'src/data/workshop.js PERF',
  description: 'What load does to performance: accel x ratio, top speed loss, turn exponent, brake exponent. One row.', units: { topLoss: '', turnExp: '', brakeExp: '' }, source: 'design: docs/design/WEB_WORKSHOP.md',
});
add({
  table: 'PowerSettings', rows: { default: snap.POWER }, parentCol: 'Setting', legacy: 'src/data/workshop.js POWER',
  description: 'Every engine\'s alternator: energy capacity and regen per second. One row.', units: { 'alternator.cap': '', 'alternator.regen': 'per_s' }, source: 'design: docs/design/WEB_WORKSHOP.md',
});
add({
  table: 'MountWeapons', rows: snap.MOUNT_WEAPONS, parentCol: 'Weapon', legacy: 'src/data/workshop.js MOUNT_WEAPONS',
  description: 'Car-mounted guns, launchers, droppers: kind, size, weight, price, damage, rate, range, magazine, ammo item. Sparse: a column applies to the kinds that use it.',
  units: { kg: 'kg', price: 'scrip', labour: 'gh', dmg: 'hit_points', rate: 's', spread: 'rad', range: 'm', blast: 'm', speed: 'mps', arc: 'rad', cone: 'rad', charge: 's', 'lock.time': 's', 'lock.cone': 'rad', 'lock.turn': 'radps',
    'mine.arm': 's', 'mine.r': 'm', 'mine.dmg': 'hit_points', 'mine.blast': 'm', 'mine.life': 's', 'slick.r': 'm', 'slick.life': 's', 'slick.spin': 'radps', 'field.r': 'm', 'field.life': 's', 'flare.r': 'm', 'flare.life': 's',
    'cloud.r': 'm', 'cloud.life': 's', 'cloud.blind': 's', stall: 's', 'grapple.lengths': '', 'grapple.hook': '', power: '', carry: '', pierce: '', mag: '', perItem: '', size: '', group: '' },
  ints: ['size', 'mag', 'perItem', 'group', 'pierce'],
  descs: { kind: 'hitscan|rocket|flame|beam|rail|harpoon|emp|drop', rare: 'prewar|uncommon: found, not bought.', ammo: 'Item key that reloads it (AmmoItems).', cal: 'Caliber key (data/arms.js calibers).' },
  source: 'design: docs/design/WEB_WORKSHOP.md',
});
add({
  table: 'Utility', rows: snap.UTILITY, parentCol: 'Part', legacy: 'src/data/workshop.js UTILITY',
  description: 'What is not a gun: batteries, tyres, nitrous, turbo, tanks, racks, spotlights, winch, drone bay. Sparse: a column applies to the parts that use it.',
  units: { kg: 'kg', price: 'scrip', labour: 'gh', space: '', fuel: 'L', trunk: 'kg', warn: 'm', 'burst.time': 's', 'tread.wade': 'm', 'monster.scale': '', 'monster.lift': 'm', 'monster.climb.speed': 'mps', 'monster.climb.under': 'm', 'monster.climb.dps': 'hit_points', 'monster.climb.part': 'hit_points',
    'slash.r': 'm', 'slash.every': 's', 'slash.dmg': 'hit_points', 'hub.reach': 'm', 'hub.car': 'hit_points', 'hub.person': 'hit_points', 'hub.grip': 'per_s', 'pull.slack': 'm', 'pull.range': 'm', 'power.regen': 'per_s' },
  ints: ['space', 'charges', 'perItem', 'slash.tyres'], source: 'design: docs/design/WEB_WORKSHOP.md',
});
add({
  table: 'AmmoItems', rows: snap.AMMO_ITEMS, parentCol: 'Item', legacy: 'src/data/workshop.js AMMO_ITEMS',
  description: 'Vehicle ammunition as pack items (registered into ITEMS by systems/workshop.js). Item rows proper move to the items family later.',
  units: { kg: 'kg', bulk: '', stack: '', value: 'scrip' }, ints: ['stack'], source: 'design: docs/design/WEB_WORKSHOP.md',
});
add({
  table: 'Paints', rows: snap.PAINTS, parentCol: 'Paint', legacy: 'src/data/workshop.js PAINTS',
  description: 'Body paints at the spray booth: colour (hex) and price.', units: { price: 'scrip' }, source: 'design: docs/design/WEB_WORKSHOP.md',
});
add({
  table: 'RepairPrices', rows: { default: snap.REPAIR }, parentCol: 'Setting', legacy: 'src/data/workshop.js REPAIR',
  description: 'Counter prices: per plate point, per part, labour hours. One row.',
  units: { platePt: 'scrip', plateLabour: 'gh', partLabour: 'gh', 'part.engine': 'scrip', 'part.radiator': 'scrip', 'part.tank': 'scrip', 'part.lights': 'scrip', 'part.tyre': 'scrip', 'part.body': 'scrip' }, source: 'design: docs/design/WEB_WORKSHOP.md',
});
add({
  table: 'Workshops', rows: snap.WORKSHOPS, parentCol: 'Shop', legacy: 'src/data/workshop.js WORKSHOPS',
  description: 'Where the workshop opens: keeper NPC or fixed site, radius, labour rate, which rare rows it deals in, standing needed.',
  units: { r: 'm', x: 'm', z: 'm', rate: 'scrip', selfWork: '', needStanding: '' }, source: 'design: docs/design/WEB_WORKSHOP.md',
});
add({
  table: 'Arenas', rows: snap.ARENAS, parentCol: 'Arena', legacy: 'src/data/workshop.js ARENAS',
  description: 'Destruction sets and tracks the cities lane stamps: size, wall, props, checkpoints, event.',
  units: { 'at.dx': 'm', 'at.dz': 'm', w: 'm', d: 'm', x: 'm', z: 'm', h: 'm', hp: 'hit_points', blast: 'm', hp2: 'hit_points' }, ints: ['laps', 'n'],
  childTuples: { ArenasCheckpoints: ['X', 'Z'] },
  source: 'design: docs/design/WEB_WORKSHOP.md',
});
add({
  table: 'Loaner', rows: { default: snap.LOANER }, parentCol: 'Setting', legacy: 'src/data/workshop.js LOANER',
  description: 'The loaner night: the promoter\'s junker, its build and the race. One row.', tuples: { 'build.armor.front': ['Kind', 'Points'], 'build.armor.rear': ['Kind', 'Points'] }, units: { purse: 'scrip', entry: 'scrip' }, ints: ['field', 'build.armor.front.1', 'build.armor.rear.1'], source: 'design: docs/design/WEB_WORKSHOP.md',
});

writeTables(OUT, outs);
console.log(outs.map((o) => `${o.name}:${o.rows}`).join(' '));
console.log('rows', outs.reduce((a, o) => a + o.rows, 0), 'tables', outs.length);
