// Military bases (docs/design/WEB_MILITARY.md). A base is ONE row: where it stands, its fence and gate, towers,
// buildings (walls, doors, windows, furniture, roofs), props, searchable boxes, guard posts, patrol routes and the
// vehicles parked in its motor pool. systems/bases.js builds it (merged geometry per material, static collision added
// before the nav grids) and runs it (sentries, the trespass rule, searchlights). A new base is a new row.
//
// Every position inside a row is LOCAL: metres from the row's origin (x, z), +x east, +z south (screen down), the same
// axes as the world (bases are not rotated). Headings: 0 faces +z (south), PI faces -z (north), PI/2 faces +x (east).
// Doors snap to the 1 m walk grid: a single door's `at` lands its world coordinate on .5, a double door's on .0 (the
// origin is a whole number, so local .5 stays .5), so a walker's path always has a cell in the opening.
const N = Math.PI, E = Math.PI / 2, W = -Math.PI / 2;

export const BASES = {
  // The Federal Remnant's forward post in the north-west Glass Flats: north of DEAD MAN RD (z=-320), east of the Iron
  // Line (x=-360), on open sand nobody else had claimed (surveyed clear of every static, mesa, camp and road).
  outpost9: {
    name: 'OUTPOST NINE', spoken: 'Outpost Nine', faction: 'remnant', place: 'outpost_nine',
    x: -292, z: -397,
    // Chain-link on steel posts, razor wire coiled along the top. The fence stops walkers and cars but not sight or
    // rounds (you can see through chain-link, and shoot through it). The gate is a gap in the south run.
    fence: { x0: -32, x1: 32, z0: -30, z1: 30, height: 2.5, wire: 0.75, post: 3.2 },
    gate: { side: 'S', at: -12, width: 9 },
    // A gravel spur from the road (local z=70 is DEAD MAN RD's north kerb) to the gate, and the worn track inside it
    // from the gate to the motor pool's apron.
    tracks: [{ x0: -16, x1: -8, z0: 30, z1: 70 }, { x0: -15.5, x1: -8.5, z0: 19.5, z1: 30 }, { x0: -8.5, x1: 6, z0: 20, z1: 27 }],
    sign: { x: -24.5, z: 30.35, w: 3.0, h: 0.75, y: 1.35 }, // on the fence's outer face, west of the open gate leaf
    // face: where the sentry looks when nothing is happening (out over the wire). sweep: the headings its searchlight
    // swings between, from along one fence run to along the other (the quarter of the yard the tower watches).
    towers: [
      { id: 'tower_nw', x: -28.5, z: -26.5, face: -3 * N / 4, sweep: [E, 0] },
      { id: 'tower_ne', x: 28.5, z: -26.5, face: 3 * N / 4, sweep: [W, 0] },
      { id: 'tower_sw', x: -28.5, z: 26.5, face: -N / 4, sweep: [E, N] },
      { id: 'tower_se', x: 28.5, z: 26.5, face: N / 4, sweep: [W, -N] },
    ],
    // Enterable buildings. doors[].at / windows[side][] are offsets along that wall from the building's centre.
    // `bay`: an opening with no leaf (the motor pool's vehicle door). roof: gable | flat.
    buildings: [
      {
        id: 'barracks', name: 'BARRACKS', x: -16, z: -18, w: 20, d: 10, h: 3.4, color: '#7b745c', floor: '#5a5548', roof: 'gable', roofColor: '#5d6450',
        doors: [{ side: 'S', at: 0, leaves: 2, material: 'wood' }],
        windows: { S: [-6, 6], N: [-5, 0, 5] },
        furniture: [
          ...[-24.4, -22.0, -19.6, -17.2, -14.8, -12.4, -10.0, -7.6].map((x) => ({ kind: 'bunk', x, z: -21.3 })),
          { kind: 'table', x: -9, z: -15.6, w: 1.8, d: 0.9 },
          { kind: 'lockers', x: -25.4, z: -16.5, w: 0.5, d: 3.2, h: 1.8 },
        ],
      },
      {
        id: 'hq', name: 'COMMAND POST', x: 6, z: -19, w: 12, d: 8, h: 3.4, color: '#6f6b57', floor: '#56524a', roof: 'flat', roofColor: '#4f5446',
        doors: [{ side: 'S', at: -0.5, leaves: 1, material: 'metal' }],
        windows: { S: [3.5], E: [0], W: [0], N: [-3, 3] },
        furniture: [
          { kind: 'maptable', x: 6, z: -19.6, w: 2.2, d: 1.3 },
          { kind: 'radio', x: 2.5, z: -22.15, w: 2.4, d: 0.7 },
        ],
      },
      {
        // The armory: no windows, one steel door, locked. Nobody keeps the key where you can find it.
        id: 'armory', name: 'ARMORY', x: -21, z: 4, w: 9, d: 7, h: 3.2, color: '#646657', floor: '#4f4e46', roof: 'flat', roofColor: '#4b5044',
        doors: [{ side: 'E', at: -0.5, leaves: 1, material: 'metal', locked: true }],
        windows: {},
        furniture: [{ kind: 'racks', x: -24.85, z: 4, w: 0.5, d: 4.6, h: 1.7 }, { kind: 'racks', x: -21, z: 7.0, w: 3.6, d: 0.45, h: 1.6 }],
      },
      {
        id: 'motorpool', name: 'MOTOR POOL', x: 19, z: 12, w: 14, d: 10, h: 4.2, color: '#6c695b', floor: '#4a4741', roof: 'gable', roofColor: '#5a5f4c',
        doors: [{ side: 'W', at: 0.5, leaves: 1, material: 'wood' }],
        bays: [{ side: 'S', at: -1, width: 6 }],
        windows: { N: [-4, 4], E: [0] },
        furniture: [
          { kind: 'bench', x: 20, z: 7.9, w: 3.2, d: 0.8 },
          { kind: 'engine', x: 14.6, z: 9.2, w: 1.2, d: 0.8 },
          { kind: 'chassis', x: 19.5, z: 12.4 },
          { kind: 'drum', x: 25, z: 15.9 }, { kind: 'drum', x: 24, z: 16.0 },
        ],
      },
    ],
    // Searchable containers (inventory.place): loot rolls from data/items.js LOOT[table] the first time they're opened.
    boxes: [
      { id: 'armory_a', table: 'military', x: -22.6, z: 1.6, w: 1.2, d: 0.7, h: 0.62, cap: 60, label: 'AMMO CRATE · ARMORY', look: 'crate' },
      { id: 'armory_b', table: 'military', x: -20.2, z: 1.6, w: 1.2, d: 0.7, h: 0.62, cap: 60, label: 'AMMO CRATE · ARMORY', look: 'crate' },
      { id: 'armory_c', table: 'military', x: -22.6, z: 5.9, w: 1.2, d: 0.7, h: 0.62, cap: 60, label: 'AMMO CRATE · ARMORY', look: 'crate' },
      { id: 'locker_1', table: 'military', x: -22.0, z: -19.6, w: 0.85, d: 0.5, h: 0.5, cap: 40, label: 'FOOTLOCKER · BARRACKS', look: 'locker' },
      { id: 'locker_2', table: 'military', x: -12.4, z: -19.6, w: 0.85, d: 0.5, h: 0.5, cap: 40, label: 'FOOTLOCKER · BARRACKS', look: 'locker' },
      { id: 'hq_files', table: 'office', x: 10.9, z: -22.1, w: 0.6, d: 0.6, h: 1.3, cap: 30, label: 'FILING CABINET · COMMAND POST', look: 'cabinet' },
      { id: 'tool_chest', table: 'garage', x: 24.9, z: 8.0, w: 1.0, d: 0.6, h: 1.0, cap: 50, label: 'TOOL CHEST · MOTOR POOL', look: 'chest' },
    ],
    // Set dressing. Solid ones are collision boxes (sandbags and barriers are cover: they stop sight and rounds).
    props: [
      { kind: 'booth', x: -5.2, z: 27, w: 2.4, d: 2.2, h: 2.7 },
      { kind: 'helipad', x: 22.5, z: -15.5, size: 13 },
      { kind: 'heliwreck', x: 24.6, z: -12.8, h: 0.35 },
      { kind: 'antenna', x: 13.6, z: -24.6, height: 12 },
      { kind: 'generator', x: 2.5, z: -24.6, w: 1.8, d: 0.9 },
      { kind: 'flagpole', x: -3, z: -9, height: 9, flag: 'US' },
      { kind: 'tent', x: -25, z: 14, w: 4, d: 5.5 },
      { kind: 'tent', x: -25, z: 20.75, w: 4, d: 5.5 },
      { kind: 'fueltank', x: 19, z: 4.5, len: 3.6, along: 'x' },
      { kind: 'apron', x0: 6, x1: 26.5, z0: 18.5, z1: 28 },
      { kind: 'sandbags', x: -19.5, z: 24.5, len: 4, along: 'x' },
      { kind: 'sandbags', x: -21.65, z: 26.6, len: 3.2, along: 'z' },
      { kind: 'sandbags', x: 2, z: -13.3, len: 3, along: 'x' },
      { kind: 'sandbags', x: 9.5, z: -13.3, len: 3, along: 'x' },
      { kind: 'sandbags', x: -14.4, z: 0.6, len: 3, along: 'x' },
      { kind: 'barrier', x: -14.4, z: 35, len: 3.6, along: 'x' },
      { kind: 'barrier', x: -9.6, z: 40.5, len: 3.6, along: 'x' },
      { kind: 'flood', x: -2, z: 6, height: 7.5, r: 11 },
      { kind: 'flood', x: 6, z: 19.5, height: 7.5, r: 11 },
      { kind: 'flood', x: -19.5, z: 17, height: 7.5, r: 10 },
    ],
    // Sentries. role: gate (speaks the warning first), door, tower (perched on the deck: never leaves it), yard.
    posts: [
      { id: 'gate_booth', role: 'gate', x: -8.6, z: 26.2, face: 0 },
      { id: 'gate_out', role: 'gate', x: -18.2, z: 32.6, face: 0 },
      { id: 'armory_door', role: 'door', x: -14.6, z: 3.5, face: E },
      { id: 'hq_door', role: 'door', x: 9.5, z: -12.1, face: 0 },
      { id: 'motor', role: 'yard', x: 6.5, z: 22.5, face: W },
      { id: 'tower_nw', role: 'tower', tower: 'tower_nw' },
      { id: 'tower_ne', role: 'tower', tower: 'tower_ne' },
      { id: 'tower_sw', role: 'tower', tower: 'tower_sw' },
      { id: 'tower_se', role: 'tower', tower: 'tower_se' },
    ],
    // Patrols walk their loop leg by leg along the walk grid; `size` soldiers spread evenly round it.
    patrols: [
      { id: 'perimeter', size: 2, pace: 1.35, route: [[-24, -27.8], [24, -27.8], [30.2, -22], [30.2, 22], [24.5, 28.9], [-3, 28.9], [-24, 28.9], [-30.2, 22], [-30.2, -22]] },
      { id: 'yard', size: 1, pace: 1.25, route: [[-6, -9.5], [12, -9.5], [11, 2], [-11, 7], [-12, -6]] },
    ],
    // The motor pool's vehicles (VEHICLES rows): parked, keys in them, nobody at the wheel.
    vehicles: [
      { type: 'patrol', x: 11, z: 23.4, h: W, paint: '#5c6142' },
      { type: 'apc', x: 20.6, z: 23.4, h: W, paint: '#6a6448' },
    ],
  },
};

// Watchtowers: four legs, an open deck behind a parapet (so the sentry reads from above), a searchlight on its rail.
export const TOWER = { size: 3.4, deck: 4.6, parapet: 1.05, lamp: 5.5, color: '#5a5442', legColor: '#3f3c33' };

// The trespass rule and the lights. Ranges in metres, times in seconds of sim time.
export const BASE_RULES = {
  grace: 6,            // seconds inside the fence after the warning before the post opens fire
  warnMemory: 120,     // come back within this long of a warning and there is no second one
  warnLeave: 4,        // seconds back outside the fence before a warning is considered heeded
  calmAfter: 45,       // hostile: seconds out of the fence and out of sight before the post stands down
  shotMargin: 18,      // a shot fired this close to the fence (or inside it) brings the post down on you
  nearMargin: 30,      // a faction that already hates you opens fire this close to the fence
  spotDay: 48,         // how far a sentry picks you out at noon...
  spotNight: 15,       // ...and at midnight (lerped by the night factor)
  spotLit: 40,         // standing in a searchlight or floodlight pool: seen as if by day
  crouchMul: 0.6,      // crouched
  vehicleMul: 1.6,     // an engine and a body the size of a car
  engage: 75,          // on the alarm every sentry who can see you this close takes you on at once
  leash: 90,           // how far a base soldier chases from their post
  hunt: 1.6,           // seconds between re-plans while sentries close on your last known position
  sweepPeriod: 16,     // seconds for a searchlight's slow sweep across its arc and back
  beamReach: [11, 24], // the searchlight's pool slides between these distances from its tower
  beamRadius: 3.4,     // the pool's radius on the ground
  hp: 140,             // a soldier's hit points
  weapons: { rifle: 0.8, smg: 0.2 }, // what the post carries
};

// What sentries say. {name} is the speaker.
export const BASE_LINES = {
  warn: 'Federal installation. Turn around.',
  cleared: 'You\'re on the list. Go ahead.',
  returned: 'You were told once.',
  ceasefire: 'Cease fire inside the wire!',
  alarm: 'Contact! Open fire!',
};
