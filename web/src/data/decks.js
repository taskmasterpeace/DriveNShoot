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
    wheel: [0.45, 0.62], seatsInside: true,
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
    wheel: [0.55, 1.5], seatsInside: true, camp: true, tank: 60,
  },
};

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
};

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
