// WAVES as rows (docs/design/WEB_WATER_LIFE.md §3-§7). One sum of Gerstner waves moves every water sheet in the game; the
// SAME sum answers waveAt(x, z, t) for the hulls that ride it (world/waves.js), so what you see is what lifts the boat.
// Change a row, not the code. The comment after each knob is its safe range.
//
// A water body's KIND scales the whole sum (amp) and its chop (the short waves). Depth fades it toward the shore (shoal),
// so a sheet never lifts through the sand it meets. The sea state (weather) multiplies it again.

// The swell's components: direction (radians, 0 = toward +z, pi/2 = toward +x), wavelength (m), amplitude share (of the
// kind's amp), steepness Q (0 round .. 1 sharp crest; the shares x Q are budgeted by `qBudget` so a crest never folds).
// Long swell from the open Atlantic rolling west onto the coast (toward -x), and a spread of shorter wind waves.
export const SWELL = [
  { dir: -1.62, L: 62, a: 0.42, q: 0.55 },
  { dir: -1.30, L: 38, a: 0.26, q: 0.6 },
  { dir: -1.95, L: 23, a: 0.15, q: 0.7 },
  { dir: -0.95, L: 13.5, a: 0.09, q: 0.8 },
  { dir: -2.40, L: 8.2, a: 0.05, q: 0.8 },
  { dir: -1.10, L: 4.9, a: 0.03, q: 0.85 },
];

export const WAVES = {
  qBudget: 0.85,            // the sum of q x share never exceeds this (0.6-0.95): a Gerstner crest pinches, never loops
  // Per kind: amp (m, the crest-to-mean height of the whole sum at full depth), chop (how much of the sum is short waves:
  // 0 = only the long swell, 1 = all of them), shoal (m of depth over which it fades in from the shore), flow (does it run
  // with a current: rivers only), foam (whitecaps on crests 0..1).
  kind: {
    ocean:  { amp: 0.62, chop: 1.0, shoal: 3.2, foam: 1.0 },  // the Atlantic and the Gulf (0.3-1.2)
    lagoon: { amp: 0.16, chop: 0.55, shoal: 1.4, foam: 0.35 }, // behind the barrier island: wind chop, no swell (0.05-0.3)
    lake:   { amp: 0.12, chop: 0.5, shoal: 1.6, foam: 0.25 },  // a lake or a reservoir (0.05-0.3)
    river:  { amp: 0.05, chop: 0.25, shoal: 0.8, foam: 0.1, flow: true }, // a river: it runs, it barely heaves (0-0.12)
    canal:  { amp: 0.035, chop: 0.2, shoal: 0.8, foam: 0 },   // a canal (0-0.08)
    swamp:  { amp: 0.012, chop: 0.1, shoal: 0.6, foam: 0 },   // a slough: glass with weed on it (0-0.03)
  },
  // The sea state: amp x (1 + storm x storm + rain x rain + clouds x clouds), from the sky's blended weather (systems/sky.js).
  sea: { storm: 1.5, rain: 0.35, clouds: 0.15 },
  speedK: 1.0,              // x the deep-water dispersion speed (0.6-1.4): how fast the crests march

  // ---- what the surface shows (world/waves.js shader) ----
  whitecap: 0.55,           // Jacobian under this foams (0.2-0.7): lower = only the sharpest crests break white
  crestLift: 0.22,          // crests brighter / troughs darker by this share of the colour (0-0.4): how swell reads from above
  shoreFoam: 0.9,           // depth (m) inside which surf bands run up the sand (0.4-1.5)
  shoreBands: 7,            // bands per metre of depth (4-12)
  absorb: { ocean: 2.6, lagoon: 1.1, lake: 1.6, river: 1.2 }, // Beer-Lambert: depth (m) that takes 63% of the light (0.5-5)

  // ---- current (rivers only; systems read currentAt) ----
  current: { river: 1.0, edgeK: 0.35 }, // x data/water.js WATER.flow m/s at the centreline; at the bank, x edgeK (0-1)

  // ---- hulls riding it (world/waves.js ride) ----
  ride: {
    sample: 0.42,           // the hull samples bow, stern, port and starboard this far in from its ends (share of len/wid)
    follow: 9,              // 1/s: how fast a hull settles onto the wave under it (4-16)
    airSpeed: 11,           // m/s: a waterbike faster than this, cresting a swell, leaves the water (8-18)
    airVy: 1.4,             // m/s: the face must lift the hull this fast for it to fly off the crest (0.8-2.5)
    airLift: 1.5,           // x the wave's own vertical speed at the crest it launches off (1-2.5)
    feltK: 1.6,             // m/s^2 felt by a deck rider per m/s^2 of heave + roll (data/decks.js chop adds on top) (0.5-3)
  },

  // ---- wakes and splashes (world/waves.js: one pooled InstancedMesh) ----
  wake: {
    pool: 480,              // puffs alive at once (128-512); the oldest is reused
    every: 0.045,           // s between puffs from a boat under way (0.04-0.15)
    swimEvery: 0.22,        // s between puffs from a swimmer kicking (0.1-0.4)
    life: 4.2,              // s a boat's puff lives (2-7)
    grow: 1.9,              // m/s a puff spreads (0.8-3)
    vee: 1.6,               // m/s the two arms of a boat's V run outward per 10 m/s of speed (0.3-1.6)
    minSpeed: 1.5,          // m/s: slower than this leaves no wake (0.8-3)
    splash: 14,             // puffs in an entry splash ring (6-24)
  },
};

// The water kind names a region's WK index maps to (world/regions.js WK: 1 swamp, 2 canal, 3 lagoon, 4 ocean) and the
// L1 rows' kinds (data/water.js: river, creek, canal, wash, lake, reservoir, playa).
export const KIND_OF_WK = [null, 'swamp', 'canal', 'lagoon', 'ocean'];
export const KIND_OF_L1 = { river: 'river', creek: 'river', canal: 'canal', wash: null, lake: 'lake', reservoir: 'lake', playa: null };

// ---- the validator (the selftest calls it; the World Forge's water tab can) ----------------------------------------
export function validateWaves(rows = { SWELL, WAVES }) {
  const bad = [];
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  let share = 0, qs = 0;
  rows.SWELL.forEach((w, i) => {
    if (!num(w.dir) || !num(w.L) || w.L < 1 || w.L > 400) bad.push(`swell ${i}: L ${w.L} must be 1-400 m`);
    if (!num(w.a) || w.a <= 0 || w.a > 1) bad.push(`swell ${i}: a ${w.a} must be 0-1`);
    if (!num(w.q) || w.q < 0 || w.q > 1) bad.push(`swell ${i}: q ${w.q} must be 0-1`);
    share += w.a; qs += w.a * w.q;
  });
  if (rows.SWELL.length > 8) bad.push(`swell: ${rows.SWELL.length} components (the shader takes 8)`);
  if (Math.abs(share - 1) > 0.02) bad.push(`swell: the shares sum to ${share.toFixed(2)}, not 1`);
  if (qs > 1) bad.push(`swell: q x share sums to ${qs.toFixed(2)} (> 1 folds a crest)`);
  for (const [k, r] of Object.entries(rows.WAVES.kind)) {
    if (!num(r.amp) || r.amp < 0 || r.amp > 3) bad.push(`kind ${k}: amp ${r.amp} must be 0-3 m`);
    if (!num(r.chop) || r.chop < 0 || r.chop > 1) bad.push(`kind ${k}: chop ${r.chop} must be 0-1`);
    if (!num(r.shoal) || r.shoal <= 0) bad.push(`kind ${k}: shoal must be > 0`);
  }
  for (const k of ['pool', 'every', 'life', 'grow']) if (!(rows.WAVES.wake[k] > 0)) bad.push(`wake.${k} must be > 0`);
  return bad;
}

// ---- diving (systems/diving.js): how deep a held breath goes, and what it does to you -----------------------------
export const DIVE = {
  descend: 1.1,             // m/s down while you hold the dive (0.6-2)
  ascend: 1.8,              // m/s back up when you let go (1-3)
  maxDive: 8,               // m: the deepest a held breath takes you (4-15); never past the bottom
  floor: 0.35,              // m kept off the bottom
  drainPerM: 0.09,          // breath drains this much faster per metre down (0-0.2): deep costs more
  dark: [0.26, 0.075, 0.72],// the view's darkness under water: [at the surface, per metre, most] (0-1)
  narrow: [0.78, 0.05, 0.3],// the clear circle's radius (share of the screen): [at the surface, lost per metre, least]
  tint: '#06302d',          // the water's colour over your eyes (dark teal: never purple)
  muffle: [2400, 380],      // Hz: the world's sound through the water [just under, at maxDive]
  gaspBelow: 0.7,           // breath under this when you surface: you gasp (0.3-0.9)
};
