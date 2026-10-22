// Jumps (docs/design/WEB_JUMPS.md): drivable relief, and the named jumps built on it. Rows, not code - a new ramp is a
// line here. Metres, +x east, +z south. `h` is the heading a ramp FACES: the way you drive to launch off it
// (0 = +z, PI/2 = +x). `len` runs along h, `wid` across it, `rise` is the height at the top.
//   kicker - a steel deck on a frame, concave (the slope steepens toward the lip), then nothing: you fly or you drop.
//            Kickers stand square to the map (h a multiple of PI/2) because their sides and lip are solid, built
//            as collision boxes: you can land on one, but not drive into the back of it.
//   berm   - a mound of dirt, cosine both ways. Crawl over it and it's a bump; hit it fast and the ground falls away
//            faster than gravity can pull you down, and you fly. Any heading.
//   table  - a dirt table-top: up, a flat top, down. Clear the top and touch down on the far slope. Any heading.
// Rows of one `site` are built into one mesh (one draw call for the steel, one for the dirt): keep a site together.
const E = Math.PI / 2, W = -Math.PI / 2;

export const SITES = {
  // An auto thrill show from before, in the open strip east of the x=320 road and south of Route 66. Somebody still
  // keeps the letters whitewashed.
  thrillshow: { name: 'THE THRILL SHOW', x: 362, z: 44, worn: true }, // worn: dirt packed by tyres (darker, rutted)
  // Wind-built mounds in the south-west Glass Flats: no ramps, only ground that throws you.
  dunes: { name: 'THE DUNES', x: -280, z: 280 },
};

export const RAMPS = [
  // Wreck Row: up the steel, over five dead cars side by side, down the landing deck. 25 m lip to lip. The deck is a
  // little taller than the kicker and long and only gently bowled (picked by flying the arc at every speed, see
  // WEB_JUMPS.md): 39-40 mph at the lip lands clean, up to ~47 lands on the deck, faster flies past it onto the flat,
  // and under ~39 meets the deck's face.
  { id: 'wreckrow_up', site: 'thrillshow', kind: 'kicker', x: 335, z: 28, h: E, len: 8, wid: 6, rise: 2.0 },
  { id: 'wreckrow_down', site: 'thrillshow', kind: 'kicker', x: 372, z: 28, h: W, len: 16, wid: 7, rise: 2.4, curve: 0.35 },
  // The Table: a long dirt table-top. Too slow and you land on the flat; right and you kiss the down slope.
  { id: 'table', site: 'thrillshow', kind: 'table', x: 349, z: 58, h: E, len: 26, wid: 9, rise: 1.8 },
  // The Whoops: seven short humps in a row. A bike at speed skims the tops; a car bucks.
  ...[339, 345.5, 352, 358.5, 365, 371.5, 378].map((x, i) => ({ id: `whoop${i + 1}`, site: 'thrillshow', kind: 'berm', x, z: 70, h: E, len: 5.2, wid: 7, rise: 0.42 })),
  // The Dunes: the wind comes off the west, so every dune has a long back to climb from the west and a short slip face
  // to the east (skew puts the crest 70-75% of the way along). Drive them eastward and the slip face throws you.
  { id: 'dune1', site: 'dunes', kind: 'berm', x: -298, z: 262, h: E + 0.2, len: 20, wid: 14, rise: 1.6, skew: 0.22 },
  { id: 'dune2', site: 'dunes', kind: 'berm', x: -268, z: 282, h: E - 0.15, len: 18, wid: 13, rise: 1.5, skew: 0.2 },
  { id: 'dune3', site: 'dunes', kind: 'berm', x: -292, z: 300, h: E + 0.1, len: 16, wid: 12, rise: 1.3, skew: 0.25 },
  { id: 'dune4', site: 'dunes', kind: 'berm', x: -262, z: 258, h: E - 0.05, len: 18, wid: 14, rise: 1.4, skew: 0.2 },
];

// Set dressing that belongs to a site (solid: each one is a collision box). wreck: a dead car, long axis along h.
// bleachers: tiers rising away from the way they face (h); letters: whitewashed stones laid out on the ground.
export const PROPS = [
  ...[343.5, 347.5, 351.5, 355.5, 359.5].map((x, i) => ({ site: 'thrillshow', kind: 'wreck', x, z: 28, h: 0, paint: ['#6b2a20', '#3d4a3a', '#7a5a2a', '#4a3a30', '#5a5550'][i] })),
  { site: 'thrillshow', kind: 'bleachers', x: 365, z: 15, h: 0, len: 40, depth: 4, tiers: 4 },
  { site: 'thrillshow', kind: 'letters', x: 361, z: 42, h: 0, w: 44, lines: ['THRILL SHOW'] },
  { site: 'thrillshow', kind: 'letters', x: 352, z: 35.6, h: 0, w: 15, lines: ['WRECK ROW'] },
];

// Named jumps: leave `from` in the air and come down at least `clear` metres along it (measured from its centre, in
// the direction it faces) without crashing. `land` is the deck meant to catch you. The first clear pays `first`
// scrip, later ones `again` (once per game day). A clear is a deed: whoever saw it talks (verb 'stunt'), and the
// Dustwolves think more of a driver who can fly.
export const JUMPS = [
  { id: 'wreckrow', name: 'WRECK ROW', from: 'wreckrow_up', land: 'wreckrow_down', clear: 29, first: 60, again: 15 }, // the landing deck's lip, x=364
  { id: 'table', name: 'THE TABLE', from: 'table', land: 'table', clear: 4.2, first: 25, again: 5 }, // the far slope
];

// Tuning (each value's reason is in WEB_JUMPS.md §Tuning).
export const STUNT = {
  gravity: 9.8,      // m/s². Honest: a jump is as long as the speed you bring to it.
  step: 0.45,        // tallest ledge a tyre climbs; anything taller is a wall
  takeoffTol: 0.02,  // the ground must fall this far below your ballistic path before you count as flying
  airDrag: 0.012,    // per second, horizontal, while airborne (a car's real drag at 40 mph is about this)
  cleanVn: 4,        // m/s into the ground: under this the suspension soaks the landing (a ~0.8 m drop)
  hardVn: 7,         // over this the landing hurts the car (a ~2.5 m drop onto the flat)
  crashVn: 11,       // over this it is a crash outright (a ~6 m drop)
  bikeVn: 8.5,       // a rider comes off above this...
  bikeMiss: 0.6,     // ...or landing more than this many radians off the slope
  airPitch: 3.2,     // rad/s² a rider throws a bike or quad with gas (nose up) and brake (nose down)
  showAir: 0.55,     // seconds of air before the HUD calls the jump
};
