// The streamed world as rows (docs/design/WEB_STREAMING.md §7 knobs, P1 "Streamed Arizona").
// Numbers here are the spec's defaults; the comment after each is its safe range. Change a row, not the code.

export const STREAM = {
  // ---- the scale law (§4 F1-F3). K is one global number: game metres per usmap metre. Robert's rule is "flat out,
  // the fastest ground vehicle drives Miami to Orlando in ten real minutes"; which vehicle is the reference is still
  // open, so K stays a knob (the LAWMAN default, 5.2, 4.9-5.5; recalibrate in P2 with tools/usmap-calibrate.mjs).
  K: 5.2,
  PHX: [-43250, 7250],      // usmap metres that land on the world origin (Phoenix)
  seed: 1977,               // the world seed: a chunk layout is a pure function of (seed, cx, cz, dataHash)

  // ---- chunks and tiers (§3.2, F4-F6)
  C: 256,                   // chunk size (128-512)
  rL: 2,                    // layout ring radius in chunks (2-3): 5 x 5 layouts around the centre chunk
  rH: 1,                    // hot ring radius (1): 3 x 3 chunks on the GPU
  hys: 32,                  // the centre chunk changes only 32 m past an edge (16-64)
  lru: 64,                  // cached layouts (36-128)
  hotMax: 12,               // hot chunks at most while a row swaps
  prefetchMin: 600,         // layouts ahead along the travel direction: max(600 m, 12 s * speed)
  prefetchS: 12,
  pumpMs: 2.5,              // pump budget per frame (1.0-4.0)
  sliceMs: 0.5,             // one generator slice (0.25-1.0)
  surfUploads: 1,           // surface uploads per frame (1-2)
  poolWrites: 2,            // pool-range writes per frame (1-4)

  // ---- the Phoenix island (§3.4): built exactly as before, chunks skip all content inside this rectangle
  island: 464,

  // ---- the P1 edge of the world (§5): a fog-and-dust fade for sight and a hard stop for vehicles
  dustWall: 45000,          // metres from Phoenix (corridor end + 3 km)
  dustFade: 2500,           // the fog thickens over this many metres before the wall

  // ---- roads (§3.8, F12)
  lane: 3.6, median: 6, shoulderIn: 0.5, shoulderOut: 1.5,   // lane / median / shoulders (the two shoulders sum to 2 * 1.0)
  cornerR: 800,             // interstate corner radius (720-1200)
  meanderA: 60,             // meander amplitude (0-100 m); wavelength >= 2*pi*sqrt(A*r) = 1,377 m at 800 m corners
  meanderL: [1800, 2600],   // meander wavelengths, metres
  spliceLead: 150,          // Route 66 meets I-10: a straight lead-out from the island edge while the median opens
  step: 8,                  // centreline resample step (metres)

  // ---- interchanges (Robert 2026-10-22: the ramp itself is near real size and shape; the road BETWEEN exits compresses)
  ramp: {
    taper: 70,              // the deceleration lane opens over this many metres
    aux: 220,               // then runs parallel to the mainline this far before the gore
    gore: 230,              // the gore (where the ramp leaves the mainline) is this far before the cross road
    terminal: 62,           // the ramp meets the cross road this far from the interstate centreline
    laneW: 4.2, shoulder: 1.4,
    deckH: 7.0,             // cross-road deck over the interstate (5 m clearance + 2 m of structure)
    grade: 0.045,           // the cross road's approach fills fall at 4.5%
    rail: 1.1,              // guardrails where the fill stands taller than this
  },
  crossRoad: { halfW: 4.6, reach: 300 },   // a two-lane county road over the bridge, 300 m each side of the centreline
  access: { halfW: 4.6, cornerR: 150, maxM: null },  // EXIT_ACCESS_MAX_M (decision 4: open; null keeps the rows as they are)
  townScale: 1,             // town layouts (streets, placement slots) keep their authored scale around the town, not K:
                            // the Godot game's own layout, a few hundred metres across (decision 5, city size, is Robert's)

  // ---- signs (Robert: signs read MILES, game miles along the built road)
  mile: 1609.344,
};

// Pool capacities (§3.5, F8): 12 hot chunks x the measured per-chunk maximum, with headroom. A full pool skips that
// chunk's instances for that pool and emits poolFull (collision is unaffected).
// The Phoenix ring (world/ring.js) measured per chunk at most (all of its chunks, laid out cold): with the floor plans
// (WEB_FLOORPLANS.md, 2026-10-23) 1,693 walls and 3,645 props (means 618 and 1,285; before them 866 walls, 610 props),
// 90 roofs, 54 floors. Props and walls: 11-12 of the worst chunk at once (the worst never sit together: the hot set
// over the densest chunk at the widest zoom holds about 10,500 props and 5,400 walls); a pool draws only up to its
// high-water mark, so the headroom costs memory (about 3 MB), not frames.
export const POOLS = {
  props: 40000, walls: 20000, roofs: 4000, floors: 1000, cacti: 6000, trunks: 3000, boulders: 3600, shrubs: 9000,
  signs: 256, rails: 9000, barrels: 600, glows: 800,
};

// Biomes (usmap legend letters) as rows: ground tint, scatter per hectare (10,000 m2), how much rock.
// Flora kinds per state (real desert flora: saguaro in Arizona, Joshua trees in the Mojave, yucca in New Mexico).
export const BIOMES = {
  d: { name: 'desert', tint: [1.0, 0.97, 0.92], shrubs: 34, cacti: 6, boulders: 4, trees: 0.8, rock: 1 },
  f: { name: 'scrub', tint: [0.93, 0.94, 0.86], shrubs: 52, cacti: 3, boulders: 3, trees: 2.2, rock: 0.7 },
  u: { name: 'urban', tint: [0.86, 0.84, 0.82], shrubs: 10, cacti: 0.5, boulders: 1, trees: 0.8, rock: 0.2 },
  m: { name: 'mountains', tint: [0.9, 0.78, 0.68], shrubs: 18, cacti: 2, boulders: 10, trees: 1, rock: 1.8 },
  p: { name: 'plains', tint: [0.98, 0.95, 0.84], shrubs: 40, cacti: 1, boulders: 1.5, trees: 1.2, rock: 0.4 },
  a: { name: 'farmland', tint: [0.94, 0.92, 0.8], shrubs: 26, cacti: 0.2, boulders: 0.5, trees: 1.5, rock: 0.1 },
  w: { name: 'dry riverbed', tint: [0.84, 0.82, 0.8], shrubs: 14, cacti: 0, boulders: 6, trees: 2, rock: 0.2 },
  F: { name: 'forest', tint: [0.86, 0.9, 0.78], shrubs: 60, cacti: 0, boulders: 2, trees: 6, rock: 0.5 },
  s: { name: 'swamp', tint: [0.82, 0.86, 0.76], shrubs: 50, cacti: 0, boulders: 0.5, trees: 4, rock: 0 },
  '.': { name: 'coast', tint: [0.95, 0.93, 0.88], shrubs: 8, cacti: 0, boulders: 2, trees: 0.2, rock: 0.2 },
};
export const FLORA = {
  CALIFORNIA: { cactus: 'barrel', tree: 'joshua', shrub: '#5c5a40' },
  ARIZONA: { cactus: 'saguaro', tree: 'paloverde', shrub: '#555a3c' },
  'NEW MEXICO': { cactus: 'cholla', tree: 'yucca', shrub: '#605c42' },
  NEVADA: { cactus: 'barrel', tree: 'joshua', shrub: '#5c5a40' },
  TEXAS: { cactus: 'cholla', tree: 'mesquite', shrub: '#545a3a' },
  _: { cactus: 'cholla', tree: 'mesquite', shrub: '#5a5a40' },
};

// What a building row looks like from above, by structure category (data/usmap.json structures): wall and roof
// colours, storey height, and the share left as a ruined shell. Footprints come from the structure rows.
export const KITS = {
  service: { walls: ['#9c8462', '#a0703f', '#8a5a3c'], roof: '#55493c', storey: 4.2, ruin: 0.35, canopy: true },
  commercial: { walls: ['#8a5a3c', '#7b4a32', '#9c8462', '#6f7f78'], roof: '#4c3424', storey: 4.4, ruin: 0.45 },
  residential: { walls: ['#9c8462', '#857c6e', '#a0703f', '#6b5e4d'], roof: '#5a3a26', storey: 3.4, ruin: 0.55 },
  civic: { walls: ['#857c6e', '#7c756a', '#a99c88'], roof: '#3f4a48', storey: 5, ruin: 0.5 },
  industrial: { walls: ['#6e6a62', '#5f5a53', '#7a5a3a'], roof: '#3d4544', storey: 6, ruin: 0.4 },
  _: { walls: ['#7c756a', '#6e6a62', '#857c6e'], roof: '#4a4440', storey: 4, ruin: 0.5 },
};
export const KIT_OF = (category = '') => KITS[category.split('_')[0]] ?? (category.startsWith('civic') ? KITS.civic : KITS._);

// Sign faces (painted into one atlas at boot): the faded green of a guide sign, a dead exit's rust, a state line.
export const SIGN_STYLE = {
  guide: { bg: '#2c5a3c', fg: '#e8e2cc', border: '#d8d2bc', fade: 0.18 },
  faded: { bg: '#5a5a48', fg: '#c9c0a4', border: '#9a9078', fade: 0.55, rust: 0.6 },
  state: { bg: '#3a4a5a', fg: '#ece6d2', border: '#d8d2bc', fade: 0.22 },  // a slate blue-grey: never purple
  warn: { bg: '#c99a2a', fg: '#1d1a16', border: '#1d1a16', fade: 0.25 },
  stop: { bg: '#b0301e', fg: '#f2ece0', border: '#f2ece0', fade: 0.2 },
};
