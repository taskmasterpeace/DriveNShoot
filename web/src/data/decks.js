// Walkable vehicles (docs/design/WEB_WALK_VEHICLES.md): a vehicle row's optional `deck` is a floor that rides with
// it, laid out as data. A new walkable vehicle is a row: give it a `deck` (one of these, or an object of the same
// shape) and build its body to match. systems/decks.js reads these; nothing here is code.
//
// Every deck is in the BODY frame (vehiclebodies.js): +x the driver's left, +z forward, metres, tyres on y = 0.
//   floor     [x0, x1, z0, z1]   the walkable rectangle (the inside face of its walls), at height `y`
//   open      true: an open bed (no roof, you stand above the sides: shot at, thrown out); false: a cabin (a roof that
//             cuts away while you are inside it, walls that stop you, windows you shoot out of)
//   edges     front | rear | left | right: { h } the wall's height above the floor. h < RULES.railMax is a RAIL: you
//             can't walk over it, but a dive (Space) goes over the side
//   doors     [{ id, edge, span: [a, b] }]: a gap in that edge (span along it: x for front/rear, z for left/right) you
//             walk in and out of
//   windows   { edge: [[a, b], ...] }: spans of an edge you can shoot out of (a cabin; an open deck shoots anywhere)
//   fixtures  [{ id, kind, box: [x0, x1, z0, z1], h }]: furniture. h >= RULES.stepH is solid (you walk round it).
//             kind 'stove' | 'tank' are used at the counter (E); 'seat' is a place to sit, nothing more
//   containers[{ id, label, box, h, cap, loot }]: a real container (the PACK screen), loot = a data/items.js LOOT table
//             rolled the first time it's opened (null: it starts empty - your own storage)
//   beds      [{ id, box, h, at: [x, z], face }]: somewhere to sleep (N, or E at it): a bed is a bed (survival quality 1)
//   wheel     [x, z]: stand here and F takes the wheel (the cab you can reach from the deck)
//   seatsInside  true: leaving the driver's seat (F) puts you back on the deck at the wheel, not out on the road
//   cover     0..1: a crouched rider's chance that the bed's side takes a round meant for them
//   camp      true: parked, it makes camp (the awning, the stove works) - systems/decks.js CAMP
//   tank      litres the water tank holds (drink at the sink; rain tops it up while camped)
//   ceil      clear height over the floor (a cabin): lower than a stance's body.h (data/stance.js) and the rider stoops
//   ladders   [{ id, at: [x, z], top: [x, z] }]: a ladder up to THIS deck (a roof). `at` is the foot of it on the ground
//             outside, `top` where you step off at the top. E at either end climbs (systems/decks.js); a roof deck is
//             named by its vehicle row's `roofDeck`
//   throwMul  every throw-out line times this (a bare roof is worse to ride than a bed with sides: < 1)
//   chop      boats: m/s^2 of felt rocking per m/s of speed on the water (the hull slaps the chop); spray: spray at the bow
export const DECKS = {
  // A pickup's bed: open, low rails all round, the cab's back wall in front, a crossover toolbox at the cab end.
  pickupBed: {
    open: true, y: 0.93, floor: [-1.02, 1.02, -2.44, -0.42],
    edges: { front: { h: 1.0 }, rear: { h: 0.42 }, left: { h: 0.43 }, right: { h: 0.43 } },
    doors: [],
    fixtures: [],
    containers: [{ id: 'toolbox', label: 'TOOLBOX', box: [-0.94, 0.94, -0.84, -0.46], h: 0.36, cap: 70, loot: 'garage' }],
    beds: [],
    wheel: null, cover: 0.7,
  },
  // A van's cargo box: walls, a roof, split rear doors and a sliding door on the kerb side, a bench, a locker, a
  // mattress on the floor. Small: you walk it in three steps, and that's the point.
  vanCargo: {
    open: false, y: 0.62, floor: [-1.0, 1.0, -2.56, 0.92],
    edges: { front: { h: 1.4 }, rear: { h: 1.4 }, left: { h: 1.4 }, right: { h: 1.4 } },
    doors: [{ id: 'rear', edge: 'rear', span: [-0.82, 0.82] }, { id: 'side', edge: 'right', span: [-0.55, 0.5] }],
    windows: { rear: [[-0.82, 0.82]], right: [[-0.55, 0.5]], front: [[-0.9, 0.9]] }, // the open doors, and over the seats
    fixtures: [{ id: 'bench', kind: 'seat', box: [0.56, 1.0, -0.95, 0.35], h: 0.45 }],
    containers: [{ id: 'locker', label: 'LOCKER', box: [0.5, 1.0, -2.56, -1.72], h: 1.25, cap: 160, loot: null }],
    beds: [{ id: 'mattress', box: [-1.0, -0.12, -2.56, -0.95], h: 0.16, at: [-0.56, -1.75], face: 0 }],
    wheel: [0.45, 0.62], seatsInside: true, ceil: 1.4,
  },
  // An RV: a cab up front, then a coach you live in. The bed across the back, a wardrobe, a kitchenette down the
  // driver's side (stove, sink over the water tank, cupboards), a dinette across from it, a locker by the door. The
  // door is on the kerb side by the cab; windows down both sides and across the back.
  rvCoach: {
    open: false, y: 0.95, floor: [-1.15, 1.15, -3.88, 1.82],
    edges: { front: { h: 1.4 }, rear: { h: 2.1 }, left: { h: 2.1 }, right: { h: 2.1 } },
    doors: [{ id: 'door', edge: 'right', span: [0.62, 1.48] }],
    windows: { left: [[-3.5, -2.6], [-1.55, -0.35], [0.6, 1.5]], right: [[-3.5, -2.6], [-2.2, -1.05], [0.62, 1.48]], rear: [[-0.8, 0.8]], front: [[-1.0, 1.0]] },
    fixtures: [
      { id: 'stove', kind: 'stove', box: [0.62, 1.15, -0.72, -0.2], h: 0.92 },
      { id: 'sink', kind: 'tank', box: [0.62, 1.15, -1.12, -0.72], h: 0.92 },
      { id: 'table', kind: 'table', box: [-1.15, -0.5, -2.05, -1.3], h: 0.74 },
      { id: 'benchA', kind: 'seat', box: [-1.15, -0.5, -2.36, -2.08], h: 0.45 },
      { id: 'benchB', kind: 'seat', box: [-1.15, -0.5, -1.27, -0.98], h: 0.45 },
    ],
    containers: [
      { id: 'pantry', label: 'PANTRY', box: [0.62, 1.15, -1.62, -1.12], h: 0.92, cap: 90, loot: 'kitchen' },
      { id: 'wardrobe', label: 'WARDROBE', box: [0.66, 1.15, -2.38, -1.86], h: 1.9, cap: 120, loot: 'bedroom' },
      { id: 'locker', label: 'LOCKER', box: [0.66, 1.15, 0.05, 0.62], h: 1.8, cap: 140, loot: 'garage' },
    ],
    beds: [{ id: 'bed', box: [-1.15, 1.15, -3.88, -2.42], h: 0.55, at: [0, -3.15], face: Math.PI / 2 }],
    wheel: [0.55, 1.5], seatsInside: true, camp: true, tank: 60, ceil: 2.1,
  },

  // ---- boats (WEB_DECKS_STANCE.md §3.1): open decks that rock and throw spray ------------------------------------------
  // An airboat's flat deck in front of the raised driver's seat; the fan cage fills the stern. A gunwale you could step
  // over (a dive goes over it, into the water). The driver stands up out of the seat onto the deck (seatsInside).
  airboatDeck: {
    open: true, y: 0.67, floor: [-1.1, 1.1, -1.05, 1.55],
    edges: { front: { h: 0.12 }, rear: { h: 0.9 }, left: { h: 0.12 }, right: { h: 0.12 } },
    doors: [],
    fixtures: [{ id: 'chair', kind: 'seat', box: [-0.45, 0.45, -0.85, 0.05], h: 0.9 }],
    containers: [{ id: 'cooler', label: 'COOLER', box: [0.62, 1.1, -1.05, -0.62], h: 0.4, cap: 40, loot: 'kitchen' }],
    beds: [],
    wheel: [0, 0.32], seatsInside: true, cover: 0.2, chop: 0.55, spray: true,
  },
  // A raft: logs over drums, nothing to hold on to (data/sealife.js; docs/design/WEB_WATER_LIFE.md). A ferry: a plank
  // deck between rails, room for a car's worth of people.
  raftDeck: {
    open: true, y: 0.42, floor: [-1.3, 1.3, -2.1, 2.1],
    edges: { front: { h: 0 }, rear: { h: 0 }, left: { h: 0 }, right: { h: 0 } },
    doors: [], fixtures: [], containers: [], beds: [],
    wheel: [0.4, -1.4], seatsInside: true, cover: 0, chop: 0.7, spray: false, throwMul: 0.85,
  },
  ferryDeck: {
    open: true, y: 0.55, floor: [-2.2, 2.2, -4.1, 4.1],
    edges: { front: { h: 0.2 }, rear: { h: 0.2 }, left: { h: 0.95 }, right: { h: 0.95 } },
    doors: [], fixtures: [{ id: 'post', kind: 'post', box: [1.9, 2.2, -4.1, -3.7], h: 1.8 }],
    containers: [{ id: 'fares', label: 'FARE BOX', box: [-2.2, -1.7, -4.1, -3.6], h: 0.8, cap: 20, loot: 'kitchen' }], beds: [],
    wheel: [1.6, -3.2], seatsInside: true, cover: 0.15, chop: 0.3, spray: false,
  },
  // A raider gunboat's aft deck behind the steel wheelhouse (a solid block: you take the wheel at its back door), fuel
  // drums lashed at the stern. Waist-high bulwarks: a crouched rider is behind steel most of the time.
  gunboatDeck: {
    open: true, y: 0.7, floor: [-1.3, 1.3, -3.4, -0.62],
    edges: { front: { h: 1.6 }, rear: { h: 0.45 }, left: { h: 0.45 }, right: { h: 0.45 } },
    doors: [],
    fixtures: [{ id: 'drums', kind: 'drums', box: [-0.4, 0.4, -3.3, -2.5], h: 0.6 }],
    containers: [{ id: 'lockbox', label: 'LOCKBOX', box: [0.75, 1.3, -1.4, -0.75], h: 0.5, cap: 90, loot: 'garage' }],
    beds: [],
    wheel: [0, -0.8], seatsInside: true, cover: 0.8, chop: 0.4, spray: true,
  },

  // ---- the trundle (systems/travel.js bus row): the aisle between four rows of benches, the kerb door up front ---------
  busAisle: {
    open: false, y: 0.65, floor: [-1.22, 1.22, -5.2, 4.95],
    edges: { front: { h: 1.6 }, rear: { h: 2.2 }, left: { h: 2.2 }, right: { h: 2.2 } },
    doors: [{ id: 'door', edge: 'right', span: [3.4, 4.45] }],
    windows: { left: [[-5.0, 4.6]], right: [[-5.0, 3.3]], rear: [[-0.8, 0.8]], front: [[-1.0, 1.0]] },
    fixtures: [
      { id: 'driver', kind: 'seat', box: [0.3, 1.22, 4.0, 4.95], h: 1.0 },
      ...[2.6, 1.1, -0.4, -1.9].flatMap((z, k) => [
        { id: `bench${k + 1}L`, kind: 'seat', box: [0.36, 1.22, z - 0.32, z + 0.32], h: 0.5 },
        { id: `bench${k + 1}R`, kind: 'seat', box: [-1.22, -0.36, z - 0.32, z + 0.32], h: 0.5 },
      ]),
    ],
    containers: [{ id: 'racks', label: 'LUGGAGE', box: [-1.22, 1.22, -5.2, -4.3], h: 0.9, cap: 260, loot: null }],
    beds: [],
    wheel: [0.0, 3.75], seatsInside: true, ceil: 2.25,
  },

  // ---- roofs (climb by the ladder) ------------------------------------------------------------------------------------
  // Nothing to hold onto but the rack: open, no sides, the throw lines lower (throwMul) than a pickup bed's.
  vanRoof: {
    open: true, y: 2.04, floor: [-1.05, 1.05, -2.62, 1.6],
    edges: { front: { h: 0.06 }, rear: { h: 0.06 }, left: { h: 0.15 }, right: { h: 0.15 } },
    doors: [],
    fixtures: [{ id: 'bags', kind: 'cargo', box: [-0.6, 0.15, -1.6, -0.9], h: 0.43 }],
    containers: [], beds: [],
    ladders: [{ id: 'ladder', at: [1.75, -2.2], top: [0.72, -2.2] }],
    wheel: null, cover: 0.15, throwMul: 0.75,
  },
  rvRoof: {
    open: true, y: 3.16, floor: [-1.2, 1.2, -3.92, 1.9],
    edges: { front: { h: 0.06 }, rear: { h: 0.06 }, left: { h: 0.06 }, right: { h: 0.06 } },
    doors: [], fixtures: [], containers: [], beds: [],
    ladders: [{ id: 'ladder', at: [0.75, -4.6], top: [0.75, -3.55] }],
    wheel: null, cover: 0.1, throwMul: 0.75,
  },
  busRoof: {
    open: true, y: 3.04, floor: [-1.25, 1.25, -5.45, 5.2],
    edges: { front: { h: 0.06 }, rear: { h: 0.06 }, left: { h: 0.18 }, right: { h: 0.18 } },
    doors: [],
    fixtures: [
      { id: 'bagA', kind: 'cargo', box: [-1.15, -0.25, -3.85, -3.35], h: 0.45 }, { id: 'bagB', kind: 'cargo', box: [0.1, 0.8, -3.6, -3.0], h: 0.4 },
      { id: 'bagC', kind: 'cargo', box: [-0.8, 0.0, -2.35, -1.85], h: 0.35 }, { id: 'bagD', kind: 'cargo', box: [0.3, 0.9, -1.75, -1.05], h: 0.4 },
      { id: 'bagE', kind: 'cargo', box: [-0.95, -0.25, -0.03, 0.43], h: 0.5 }, { id: 'bagF', kind: 'cargo', box: [0.1, 0.9, 0.62, 1.18], h: 0.42 },
      { id: 'bagG', kind: 'cargo', box: [-0.8, -0.2, 1.6, 2.2], h: 0.38 },
    ],
    containers: [], beds: [],
    ladders: [{ id: 'ladder', at: [0.8, -6.25], top: [0.8, -5.0] }],
    wheel: null, cover: 0.3, throwMul: 0.8,
  },
};
for (const k in DECKS) DECKS[k].key = k; // a deck knows its own name (systems/decks.js: which of a vehicle's decks a rider is on)

// A row's deck: the name of one above, or a layout object of the same shape (a content pack's own).
export const deckOf = (d) => (typeof d === 'string' ? DECKS[d] ?? null : d ?? null);

// The rules every deck shares. Distances in metres, speeds m/s, accelerations m/s^2.
export const DECK_RULES = {
  radius: 0.27,      // a rider's body on a deck (the street's 0.45 would not fit a van)
  stepH: 0.35,       // fixtures under this you walk over (a mattress on the floor)
  railMax: 0.6,      // an edge under this is a rail: a dive goes over it, a walk doesn't
  doorZone: 1.25,    // outside a door, how far out walking toward it steps you in
  doorWalkIn: 2.0,   // the vehicle must be slower than this to walk in through a door
  climbReach: 1.6,   // E climbs into an open bed from this far outside its rails
  wheelReach: 0.75,  // how near the wheel spot F takes the wheel
  useReach: 0.95,    // how near a stove or a tank E works it
  hopSafe: 5,        // stepping or diving off faster than this hurts
  hopHurt: 2.2,      // hp per m/s over hopSafe
  // What a moving floor does to the people on it. a = the floor's own horizontal acceleration (filtered), impact = speed
  // lost to a collision in one frame, landing = closing speed into the ground after a jump.
  open: { staggerA: 24, throwA: 40, throwMinSpeed: 12, staggerImpact: 4, throwImpact: 9, staggerLand: 5, throwLand: 8.5 },
  cabin: { staggerA: 30, staggerImpact: 6, staggerLand: 7, knockImpact: 12 },
  braced: 1.6,       // crouched riders hold on: every threshold above times this
  staggerT: 0.45,    // seconds on your back after a stagger
  throwT: 1.4,       // seconds on your back after being thrown out
  throwHurt: [5, 1.6], // hp = a + b * speed (the player takes 0.7 of it)
  filter: 12,        // 1/s: how fast the felt acceleration follows the real one (one-frame spikes don't throw anyone)
  ladderReach: 1.0,  // E climbs a ladder from this near its foot (or its top)
  ladderSafe: 2.0,   // the vehicle must be slower than this to climb on or off by the ladder
  footingShow: 0.35, // the HUD shows your footing on an open deck once the floor pulls this share of your throw line
};

// TURRET SEAT (WEB_DECKS_STANCE.md §3.4): a passenger mans a vehicle's roof turret (the workshop's `top` mount, trigger
// group 3) and aims and fires it on their own while the driver drives. ONE owner at a time (v.turretBy, a character id:
// shard-shaped - the owner's client aims and fires it; everyone else sees its yaw and its rounds), released when they
// leave the seat, die, or the vehicle is wrecked. The driver fires it only while nobody else mans it.
export const TURRET_SEAT = {
  crewRange: 40,          // m: a crew member on the turret engages hostiles this near
  crewCool: [0.12, 0.25], // s between a crew gunner's pulls (the mount's own rate still caps it)
  crewSpread: 0.05,       // rad either way: a crew gunner's aim error
};

// The deck rows' shape, for the World Forge (and the selftest). [] = valid.
export function validateDecks(rows = DECKS) {
  const bad = [];
  const inF = (D, x, z) => x >= D.floor[0] - 1e-6 && x <= D.floor[1] + 1e-6 && z >= D.floor[2] - 1e-6 && z <= D.floor[3] + 1e-6;
  for (const [k, D] of Object.entries(rows)) {
    const f = D.floor;
    if (!Array.isArray(f) || f.length !== 4 || !(f[1] - f[0] > 2 * DECK_RULES.radius) || !(f[3] - f[2] > 2 * DECK_RULES.radius)) { bad.push(`${k}: floor`); continue; }
    if (!(D.y > 0 && D.y < 4)) bad.push(`${k}: y out of 0..4`);
    for (const e of ['front', 'rear', 'left', 'right']) if (!(D.edges?.[e]?.h >= 0)) bad.push(`${k}: edge ${e}`);
    for (const b of [...(D.fixtures ?? []), ...(D.containers ?? []), ...(D.beds ?? [])]) if (!(b.box?.[1] > b.box?.[0] && b.box[3] > b.box[2])) bad.push(`${k}: box ${b.id}`);
    for (const d of D.doors ?? []) if (!(d.span?.[1] > d.span?.[0])) bad.push(`${k}: door ${d.id}`);
    if (D.wheel && !inF(D, D.wheel[0], D.wheel[1])) bad.push(`${k}: wheel off the floor`);
    for (const L of D.ladders ?? []) { if (!inF(D, L.top[0], L.top[1])) bad.push(`${k}: ladder ${L.id} top off the floor`); if (inF(D, L.at[0], L.at[1])) bad.push(`${k}: ladder ${L.id} foot on the floor`); }
    if (D.ceil !== undefined && !(D.ceil > 1 && D.ceil < 3.5)) bad.push(`${k}: ceil out of 1..3.5`);
    if (D.throwMul !== undefined && !(D.throwMul > 0.3 && D.throwMul <= 1.5)) bad.push(`${k}: throwMul out of 0.3..1.5`);
    if (D.chop !== undefined && !(D.chop >= 0 && D.chop < 2)) bad.push(`${k}: chop out of 0..2`);
    if (!D.open && D.ladders?.length) bad.push(`${k}: a ladder goes up to an open roof, not a cabin`);
  }
  return bad;
}

// Walkable vehicles the world starts with (systems/decks.js placeWorld, on the first frame: after everything else, so no
// other vehicle's id moves). An RV left in the middle of nowhere with its cupboards still full: whoever lived in it is
// gone. Its boxes roll their loot tables the first time they're opened, like any house's.
export const PLACED = [
  { type: 'rv', x: 120, z: 290, h: 2.4, paint: '#8a6a44' }, // the south flats, clear of the mesas and every camp
];

// Parked, a deck with `camp` makes camp: no driver and slower than `still` for `after` seconds. The awning comes out,
// the stove lights. Drive off and it all stows.
export const CAMP = {
  still: 0.3, after: 3,
  meal: { food: 0.12, hp: 6 },            // a hot meal on top of what the tin itself gives
  drink: { litres: 0.5, kind: 'water' },  // one drink from the tank (data/survival.js CONSUMABLES.water)
  rainPerHour: 6,                          // litres a game hour of rain puts in the tank while camped
  pour: { water_bottle: 0.5, canteen: 1 }, // litres a carried bottle pours into the tank
};
