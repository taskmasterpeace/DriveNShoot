// SEMIS (docs/design/WEB_SEMIS.md): tractor-trailers you drive a car INTO. A tractor (the vehicle row `semi`) pulls a
// trailer (its own vehicle row: `boxtrailer`, `widetrailer`) joined at a kingpin; a trailer's hold carries cars on its
// floor the way a deck carries people (systems/decks.js law, extended to vehicles: systems/semis.js). Everything here is
// data: a new trailer is a TRAILERS row plus a vehicle row that names it (`trailer: '<key>'`) and a body to match.
//
// All lengths in metres in the BODY frame (vehiclebodies.js): +x the driver's left, +z forward, tyres on y = 0.
//   kingpin     local z of the trailer's kingpin (it locks into the tractor's fifth wheel)
//   axle        local z of the middle of the trailer's axle group: the point that tracks (no-slip) behind the kingpin
//   floorY      height of the hold's floor (cars ride on it; the deck row's `y` is the same floor for people)
//   hold        the space a car may stand in: x [x0, x1], z [z0, z1] (front wall to the rear sill), clear height h
//               (the door opening; Infinity for an open deck), and the walls: `walls` true = the sides stop a car, an open
//               deck's low rails stop one too (rail: their height)
//   ramp        the drop ramp at the back: hinge z (the rear sill), len, width, kind 'slide' (slides out from under the
//               floor, then tips to the road: a box trailer) | 'flip' (hinged upright at the rear, folds down: a lowboy),
//               secs to drop or raise, door: a roll-up door over the opening that goes up first (the box)
//   maxCargo    how many cars, and their total mass (vehicle `mass` units), the hold takes
//   wide        a wide load: WIDE LOAD banners, flags, amber markers; escorted; takes two lanes (lane rules below)
//   escort      the pilot cars a wide load wants in front of and behind it when it travels (systems/semis.js freight)
export const TRAILERS = {
  // A long dry box with a hydraulic slide-out ramp under the floor and a roll-up door: a car, a LAWMAN or a motorcycle
  // drives up into it, rides on the floor in the dark, and drives back out. 3.2 m across: this country's lanes are 4.2 m,
  // and there is room to get out of a car inside it and walk round it.
  box: {
    name: 'BOX TRAILER', vehicle: 'boxtrailer',
    kingpin: 5.35, axle: -4.33, floorY: 1.3,
    hold: { x0: -1.52, x1: 1.52, z0: -6.06, z1: 6.0, h: 2.25, walls: true, rail: 2.5 },
    ramp: { hinge: -6.2, len: 4.6, width: 2.6, kind: 'slide', secs: 3.2, door: true },
    maxCargo: { cars: 2, mass: 4 },
    wide: false, escort: 0,
  },
  // An extra-wide drop-deck lowboy: an RV rides on it with room to walk round it. WIDE LOAD banners front and back, red
  // flags at the corners, amber markers down both sides, a beacon on the gooseneck. It straddles the lane line: two lanes.
  wide: {
    name: 'WIDE-LOAD LOWBOY', vehicle: 'widetrailer',
    kingpin: 6.3, axle: -4.5, floorY: 0.9,
    hold: { x0: -2.6, x1: 2.6, z0: -7.0, z1: 3.7, h: Infinity, walls: false, rail: 0.3 },
    ramp: { hinge: -7.1, len: 3.4, width: 4.2, kind: 'flip', secs: 2.6, door: false },
    maxCargo: { cars: 1, mass: 4.5 },
    wide: true, escort: 2,
  },
};

// The hitch: how the tractor and its trailer move as one (systems/semis.js). Angles in radians, speeds m/s.
//   reach        how near the fifth wheel must be to the kingpin to couple (m), and the most the two headings may differ
//   yawLimit     the articulation stop: past it the cab's corner meets the trailer's nose (a jackknife)
//   jackknife    braking hard at speed: when the tractor slows faster than `brakeA` above `minSpeed`, the trailer's axles
//                lock and it shoves the kingpin: the articulation grows at `gain` x the excess (rad/s per m/s^2), the cab
//                folds the other way at `cabShare` of it. A loaded trailer's axles bite: brakeA x (1 + load x `loadBite`).
//                At the stop the rig scrubs (`scrub` 1/s drag) and smokes; it is jackknifed until the angle is back under
//                `clearAt`. Once folding it keeps folding: `sustain` x speed x sin(angle), plus a `kick` rad/s while it moves.
//   pull         a loaded rig is heavier: the tractor's accel (and its brakes) x 1 / (1 + trailer mass / `pullMass`)
//   swing        trailer swing: through a fast bend the trailer's axles hold `grip` m/s^2 sideways (x (1 + load x loadBite));
//                past it the tail slides out of the bend at `k` rad/s per m/s^2 over
//   sparks       a ramp left down on the move drags its tip on the road: sparks per second per m/s
export const HITCH = {
  reach: 1.4, reachAngle: 0.45,
  yawLimit: 1.38,
  jackknife: { brakeA: 9, minSpeed: 11, gain: 0.18, sustain: 0.12, kick: 0.25, cabShare: 0.35, loadBite: 3, scrub: 2.6, clearAt: 0.6, seedAngle: 0.02 },
  pull: { pullMass: 9 },
  swing: { grip: 5.5, k: 0.05 },
  sparks: 1.2,
};

// A car in a hold (systems/semis.js carry): it keeps its pose in the trailer's frame, as a deck rider does. The floor's own
// acceleration pushes it (a parked car's brake holds up to vehicles.js DRIVING.parkBrake; a rolling one shifts); the walls
// stop it; chocks hold it fast. Getting on: its nose over the ramp's tip, square to it, at a matched speed.
//   board        the most the car's heading may differ from the trailer's (rad), and the most its speed may differ from the
//                trailer's (m/s) to roll onto a moving ramp; `cool` s before a car that just rolled off can board again
//   wallBounce   share of the speed into a wall it bounces back with; `wallHurt` m/s into a wall before it dents
//   brakeHold    a car nobody is driving forward or back holds the floor with its brakes up to this (m/s^2) along its
//                length; its tyres hold `tyreHold` across it. Past either it shifts by the excess. Chocked: it never shifts
//   rampSafe     the trailer must be slower than this (m/s) for the ramp to come down (and to go up with nobody on it)
//   matchSpeed   a car may board, or leave, a ramp that moves no faster than this
export const CARRY = {
  board: { angle: 0.45, speed: 4.5, cool: 1.5 },
  wallBounce: 0.25, wallHurt: 5,
  brakeHold: 8, tyreHold: 9,
  rampSafe: 9, matchSpeed: 9,
};

// Road fit (the AI's routing and the `semi action=fit` probe). Per road class (data/roadscape.js ROAD_CLASSES, plus the
// town street and the island grid): the paved width a rig may use, the longest rig its curves take, and whether a wide
// load may use it at all. A rig fits when its widest body is narrower than `width` less a margin each side, it is no
// longer than `maxLen`, and (a wide load) the class allows it with its escort. Lane width matches data/streaming.js laneW.
export const LANE_W = 4.2;
export const ROAD_FIT = {
  interstate: { width: 3 * LANE_W, maxLen: 40, wide: true },
  divided: { width: 2 * LANE_W, maxLen: 30, wide: true },
  'two-lane': { width: 2 * LANE_W, maxLen: 24, wide: true },  // a wide load takes the whole road: escorted, oncoming wait
  rural: { width: 2 * 3.4, maxLen: 20, wide: false },
  dirt: { width: 4.2, maxLen: 12, wide: false },               // a dirt track: its bends and its soft shoulders take no semi
  street: { width: 14, maxLen: 22, wide: true },               // the island's 14 m streets (world/city.js)
};
export const FIT_MARGIN = 0.4;
// Clearance under things you drive beneath (m). The rig's height (tallest of the tractor, the trailer and what rides on it)
// must be under it. The AI probes ahead for anything overhead lower than its height and stops short (systems/semis.js).
export const CLEARANCE = {
  overpass: 5.0,   // data/streaming.js deckH 7.0 less its 2 m of structure
  railBridge: 4.6,
  lowBridge: 3.8,  // an old county bridge or a rail trestle over a back road
  margin: 0.15,
};

// The freight (systems/semis.js): hauler crews moving goods between holdouts on the interstate. One rolls by every
// `every` seconds (range); a wide load travels between its escorts. Rows: the formation, front to back, with the gap
// (m behind the lead) and what each member is.
export const FREIGHT = {
  every: [240, 420], cruise: 13, wideCruise: 10, goneR: 3200,
  rigs: {
    boxes: [
      { role: 'rig', tractor: 'semi', trailer: 'box', gap: 0, paint: '#7a4a24', cargo: ['sedan'] },
      { role: 'rig', tractor: 'semi', trailer: 'box', gap: 26, paint: '#4a5a3a', cargo: [] },
    ],
    wideload: [
      { role: 'pilot', type: 'pickup', gap: 0, paint: '#c8a032' },
      { role: 'rig', tractor: 'semi', trailer: 'wide', gap: 24, paint: '#6a3a22', cargo: ['rv'] },
      { role: 'pilot', type: 'pickup', gap: 48, paint: '#c8a032' },
    ],
  },
};

// The holds' floors as decks you walk on (systems/decks.js; the same row shape as data/decks.js DECKS). A door with
// `needs` is open only while that flag is set on the vehicle (the ramp down: `rampDown`).
export const TRAILER_DECKS = {
  boxHold: {
    open: false, y: 1.3, floor: [-1.52, 1.52, -6.06, 6.0],
    edges: { front: { h: 2.5 }, rear: { h: 2.5 }, left: { h: 2.5 }, right: { h: 2.5 } },
    doors: [{ id: 'ramp', edge: 'rear', span: [-1.25, 1.25], needs: 'rampDown' }],
    windows: { rear: [[-1.25, 1.25]] },
    fixtures: [],
    containers: [{ id: 'chains', label: 'CHAIN BOX', box: [0.96, 1.52, 5.45, 6.0], h: 0.8, cap: 80, loot: 'garage' }],
    beds: [], wheel: null, ceil: 2.5, crew: 10,
  },
  wideDeck: {
    open: true, y: 0.9, floor: [-2.6, 2.6, -7.0, 3.7],
    edges: { front: { h: 0.85 }, rear: { h: 0.3 }, left: { h: 0.3 }, right: { h: 0.3 } },
    doors: [{ id: 'ramp', edge: 'rear', span: [-2.1, 2.1], needs: 'rampDown' }],
    fixtures: [],
    containers: [{ id: 'binders', label: 'LOAD BINDERS', box: [-2.6, -1.9, 3.1, 3.7], h: 0.55, cap: 60, loot: 'garage' }],
    beds: [], wheel: null, cover: 0.2, crew: 14,
  },
};
for (const k in TRAILER_DECKS) TRAILER_DECKS[k].key = k;

// Does vehicle row `s` fit trailer row `T`'s hold? -> null if it does, else why not.
export function fitsHold(T, s) {
  const H = T.hold, w = H.x1 - H.x0, l = H.z1 - H.z0;
  if (!s || s.boat || s.trailer || s.tractor) return 'not something a hold carries';
  if (s.wid > w - 0.12) return `${s.wid.toFixed(2)} m wide; the ${T.name.toLowerCase()} takes ${(w - 0.12).toFixed(2)}`;
  if (s.len > l - 0.3) return `${s.len.toFixed(1)} m long; the hold is ${l.toFixed(1)}`;
  if (s.tall > H.h) return `${s.tall.toFixed(2)} m tall; the door is ${H.h.toFixed(2)}`;
  if (s.mass > T.maxCargo.mass) return `too heavy (${s.mass} of ${T.maxCargo.mass})`;
  return null;
}

// Does a rig (its widest body, its whole length, a wide load or not) fit a road class? -> null, or why not.
export function fitsRoad(rig, cls) {
  const R = ROAD_FIT[cls];
  if (!R) return `no such road class: ${cls}`;
  if (rig.wid > R.width - 2 * FIT_MARGIN) return `${rig.wid.toFixed(1)} m wide; a ${cls} road gives ${(R.width - 2 * FIT_MARGIN).toFixed(1)}`;
  if (rig.len > R.maxLen) return `${rig.len.toFixed(1)} m long; a ${cls} road's bends take ${R.maxLen}`;
  if (rig.wide && !R.wide) return `a wide load may not use a ${cls} road`;
  return null;
}
// Does a rig of height `tall` pass under a structure kind (CLEARANCE)? -> null, or why not.
export function fitsUnder(tall, kind) {
  const c = CLEARANCE[kind];
  if (!(c > 0)) return `no such structure: ${kind}`;
  return tall + CLEARANCE.margin > c ? `${tall.toFixed(2)} m tall; the ${kind} clears ${c.toFixed(2)}` : null;
}

// The World Forge's and the selftest's check of every row above. vehicles: VEHICLES (passed in, no import cycle);
// validateDecks: data/decks.js's, for the hold decks.
export function validateTrailers(vehicles, validateDecks) {
  const bad = [];
  for (const [k, T] of Object.entries(TRAILERS)) {
    const s = vehicles?.[T.vehicle];
    if (!s) { bad.push(`${k}: no vehicle row ${T.vehicle}`); continue; }
    if (s.trailer !== k) bad.push(`${k}: vehicle ${T.vehicle} names trailer ${s.trailer}`);
    if (!(T.kingpin > 0 && T.kingpin < s.len / 2)) bad.push(`${k}: kingpin off the trailer's front half`);
    if (!(T.axle < 0 && T.axle > -s.len / 2)) bad.push(`${k}: axle off the trailer's rear half`);
    const H = T.hold;
    if (!(H.x1 > H.x0 && H.z1 > H.z0 && H.h > 1)) bad.push(`${k}: hold`);
    if (H.x1 > s.wid / 2 || H.x0 < -s.wid / 2) bad.push(`${k}: hold wider than the trailer`);
    const R = T.ramp;
    if (!(R.len > 1 && R.width > 0.8 && R.secs > 0.3) || !['slide', 'flip'].includes(R.kind)) bad.push(`${k}: ramp`);
    if (Math.abs(R.hinge - -s.len / 2) > 0.3) bad.push(`${k}: ramp hinge not at the rear`);
    if (!(T.floorY / R.len < 0.45)) bad.push(`${k}: ramp steeper than 27 degrees`);
    if (!(T.maxCargo.cars >= 1 && T.maxCargo.mass > 0)) bad.push(`${k}: maxCargo`);
    const D = s.deck && TRAILER_DECKS[s.deck.key ?? s.deck];
    if (!D) bad.push(`${k}: vehicle ${T.vehicle} has no hold deck`);
    else if (Math.abs(D.y - T.floorY) > 0.01) bad.push(`${k}: deck floor ${D.y} != floorY ${T.floorY}`);
  }
  if (!Object.values(vehicles ?? {}).some((s) => s.tractor)) bad.push('no tractor row');
  for (const [k, s] of Object.entries(vehicles ?? {})) if (s.tractor && !(s.tractor.fifth < 0 && s.tractor.fifth > -s.len / 2)) bad.push(`${k}: fifth wheel off the tractor's rear half`);
  for (const [k, R] of Object.entries(ROAD_FIT)) if (!(R.width > 2 && R.maxLen > 4)) bad.push(`road ${k}`);
  const J = HITCH.jackknife;
  if (!(HITCH.yawLimit > 0.8 && HITCH.yawLimit < 1.6)) bad.push('yawLimit out of 0.8..1.6');
  if (!(J.brakeA > 2 && J.gain > 0 && J.cabShare >= 0 && J.cabShare < 1 && J.clearAt < HITCH.yawLimit)) bad.push('jackknife');
  for (const [k, rows] of Object.entries(FREIGHT.rigs)) for (const r of rows) {
    if (r.role === 'rig' && (!vehicles[r.tractor]?.tractor || !TRAILERS[r.trailer])) bad.push(`freight ${k}: rig`);
    if (r.role === 'rig') for (const c of r.cargo ?? []) { const why = fitsHold(TRAILERS[r.trailer], vehicles[c]); if (why) bad.push(`freight ${k}: ${c} does not fit (${why})`); }
    if (r.role === 'pilot' && !vehicles[r.type]) bad.push(`freight ${k}: pilot ${r.type}`);
  }
  if (validateDecks) bad.push(...validateDecks(TRAILER_DECKS));
  return bad;
}
