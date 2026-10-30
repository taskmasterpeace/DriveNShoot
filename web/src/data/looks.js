// LOOK-FEEL rows (docs/design/WEB_LOOK_FEEL.md). Every region of the country carries three layers of identity: a colour
// GRADE (one full-screen pass reads a 16^3 lookup table built from these numbers), a HORIZON band (a row the camera law
// keeps off screen today: §3.2 of the doc says why, honestly) and the roadside kit (data/roadside.js, data/roadscape.js).
// Beside them: WIND (one uniform the flora, cloth and laundry sway on), HISTORY decals (what happened here, as pooled flat
// quads), IMPACT feel per calibre (hit-stop, camera kick, crash dirt) and VEHICLE WEAR (dust, mud, scrapes on the paint).
// No purple anywhere, LUTs included: validateLooks() runs every grade over a colour probe and refuses hue 270-320.

// ---- the grades ------------------------------------------------------------------------------------------------------
// A grade works in display space (after ACES and sRGB). Applied in this order:
//   temp   warm (+) / cool (-): +R -B (x 0.08 per unit)      tint   green (+) only; a magenta tint is how violet sneaks in
//   sat    saturation multiplier round the luma              con    contrast round 0.32 (low: the darks are the Night setting's)
//   lift   [r,g,b] added in the shadows (x (1-l)^2)           gain   [r,g,b] multiplier in the highlights (x l)
//   gamma  output power (<1 lifts the mids)                  bleach how far the highlights wash to a hot white (0..1)
// A row's values are the grade at FULL strength; `strength` (0..1) blends it from the identity.
export const IDENTITY = { temp: 0, tint: 0, sat: 1, con: 1, lift: [0, 0, 0], gain: [1, 1, 1], gamma: 1, bleach: 0 };

export const LOOK_REGIONS = {
  // The start region (Robert: "bleached and hot in Florida"): washed highlights, warm yellow, the greens kept.
  florida: { name: 'FLORIDA', states: ['FLORIDA'], horizon: 'swamp_treeline', wind: 1.1,
    grade: { temp: 0.55, tint: 0.05, sat: 0.88, con: 0.98, lift: [0.035, 0.03, 0.01], gain: [1.06, 1.04, 0.93], gamma: 0.94, bleach: 0.5 },
    decals: { skid: 1, scorch: 0.7, oil: 0.8, blood: 1, bonfire: 0.8 } },
  // "Dusty orange in Texas."
  texas: { name: 'TEXAS', states: ['TEXAS', 'OKLAHOMA'], horizon: 'flat_plains', wind: 1.25,
    grade: { temp: 0.6, tint: 0, sat: 0.86, con: 1.06, lift: [0.035, 0.018, 0.0], gain: [1.07, 0.98, 0.84], gamma: 0.98, bleach: 0.12 },
    decals: { skid: 1.2, scorch: 1, oil: 1.1, blood: 1, bonfire: 1 } },
  // The southwest's hard sun: amber, deep shadows (the Phoenix island and the P1 corridor).
  desert: { name: 'THE DESERT SOUTHWEST', states: ['ARIZONA', 'NEW MEXICO', 'NEVADA', 'UTAH'], horizon: 'mesas', wind: 1.2,
    grade: { temp: 0.42, tint: 0, sat: 0.95, con: 1.1, lift: [0.012, 0.004, 0.0], gain: [1.05, 1.0, 0.9], gamma: 1.0, bleach: 0.14 },
    decals: { skid: 1, scorch: 1.2, oil: 1, blood: 1, bonfire: 1.1 } },
  california: { name: 'CALIFORNIA', states: ['CALIFORNIA'], horizon: 'dead_skyline', wind: 1.0,
    grade: { temp: 0.3, tint: 0.02, sat: 0.9, con: 1.05, lift: [0.025, 0.018, 0.008], gain: [1.04, 1.0, 0.92], gamma: 0.97, bleach: 0.2 },
    decals: { skid: 1.3, scorch: 1.1, oil: 1.2, blood: 1, bonfire: 0.8 } },
  // The swamp-and-pine Gulf: humid, green, soft.
  gulf: { name: 'THE GULF', states: ['LOUISIANA', 'MISSISSIPPI', 'ALABAMA', 'GEORGIA', 'SOUTH CAROLINA'], horizon: 'swamp_treeline', wind: 0.9,
    grade: { temp: 0.12, tint: 0.12, sat: 0.94, con: 1.0, lift: [0.008, 0.02, 0.01], gain: [1.0, 1.03, 0.95], gamma: 0.97, bleach: 0.1 },
    decals: { skid: 0.9, scorch: 0.6, oil: 0.9, blood: 1.1, bonfire: 0.9 } },
  // Flat Kansas with grain elevators: straw and sky, a low-contrast wide country.
  plains: { name: 'THE PLAINS', states: ['KANSAS', 'NEBRASKA', 'NORTH DAKOTA', 'SOUTH DAKOTA', 'IOWA'], horizon: 'flat_plains', wind: 1.4,
    grade: { temp: 0.22, tint: 0.02, sat: 0.84, con: 0.96, lift: [0.03, 0.026, 0.012], gain: [1.03, 1.01, 0.93], gamma: 0.97, bleach: 0.16 },
    decals: { skid: 0.8, scorch: 0.8, oil: 0.7, blood: 0.8, bonfire: 1 } },
  // The Appalachian ridges: cool green haze.
  appalachia: { name: 'THE RIDGES', states: ['WEST VIRGINIA', 'KENTUCKY', 'TENNESSEE', 'VIRGINIA', 'NORTH CAROLINA', 'PENNSYLVANIA'], horizon: 'ridges', wind: 0.85,
    grade: { temp: -0.12, tint: 0.1, sat: 0.88, con: 1.02, lift: [0.0, 0.016, 0.022], gain: [0.97, 1.01, 1.02], gamma: 0.98, bleach: 0.04 },
    decals: { skid: 0.8, scorch: 0.7, oil: 0.8, blood: 1, bonfire: 1.2 } },
  // The dead metros of the northeast: steel and soot.
  metro_ne: { name: 'THE DEAD METROS', states: ['NEW YORK', 'NEW JERSEY', 'MASSACHUSETTS', 'CONNECTICUT', 'RHODE ISLAND', 'DELAWARE', 'MARYLAND'], horizon: 'dead_skyline', wind: 0.8,
    grade: { temp: -0.2, tint: 0.03, sat: 0.72, con: 1.12, lift: [0.0, 0.01, 0.02], gain: [0.96, 0.99, 1.02], gamma: 1.02, bleach: 0.0 },
    decals: { skid: 1.4, scorch: 1.4, oil: 1.3, blood: 1.2, bonfire: 1.1 } },
  // The rust belt: brown-grey, tired.
  midwest: { name: 'THE RUST BELT', states: ['OHIO', 'INDIANA', 'ILLINOIS', 'MICHIGAN', 'WISCONSIN', 'MINNESOTA', 'MISSOURI', 'ARKANSAS'], horizon: 'flat_plains', wind: 1.05,
    grade: { temp: 0.08, tint: 0.02, sat: 0.8, con: 1.05, lift: [0.018, 0.014, 0.01], gain: [1.0, 0.99, 0.95], gamma: 1.0, bleach: 0.04 },
    decals: { skid: 1.1, scorch: 1.1, oil: 1.2, blood: 1, bonfire: 1 } },
  // The high country: thin air, crisp, cool.
  mountain: { name: 'THE HIGH COUNTRY', states: ['COLORADO', 'WYOMING', 'MONTANA', 'IDAHO'], horizon: 'ridges', wind: 1.3,
    grade: { temp: -0.18, tint: 0.0, sat: 0.96, con: 1.08, lift: [0.0, 0.006, 0.02], gain: [0.98, 1.0, 1.03], gamma: 1.0, bleach: 0.06 },
    decals: { skid: 0.8, scorch: 0.8, oil: 0.7, blood: 0.9, bonfire: 1.2 } },
  // The wet northwest: teal-grey.
  northwest: { name: 'THE WET NORTHWEST', states: ['WASHINGTON', 'OREGON'], horizon: 'ridges', wind: 1.0,
    grade: { temp: -0.3, tint: 0.08, sat: 0.82, con: 1.0, lift: [0.0, 0.018, 0.022], gain: [0.95, 1.0, 1.0], gamma: 0.99, bleach: 0.0 },
    decals: { skid: 0.8, scorch: 0.5, oil: 0.9, blood: 1, bonfire: 0.9 } },
  // New England and whatever the map leaves unnamed.
  default: { name: 'THE OPEN COUNTRY', states: ['MAINE', 'NEW HAMPSHIRE', 'VERMONT'], horizon: 'ridges', wind: 1.0,
    grade: { temp: 0.1, tint: 0.02, sat: 0.92, con: 1.03, lift: [0.01, 0.01, 0.01], gain: [1.0, 1.0, 0.97], gamma: 1.0, bleach: 0.05 },
    decals: { skid: 1, scorch: 1, oil: 1, blood: 1, bonfire: 1 } },
};

// ---- time of day: a grade layered over the region's ---------------------------------------------------------------------
// weight(hour) is a smooth bump per phase; the region's day grade shows at noon. Night is cold BLUE (hue ~205-215: never
// violet), dusk and dawn warm. Each phase row composes over the region grade (temp/tint add, sat/con/gain multiply, lift
// adds, bleach takes the max), at its strength.
export const TIME_GRADES = {
  dawn: { centre: 6.2, half: 1.4, grade: { temp: 0.25, tint: 0, sat: 0.9, con: 0.98, lift: [0.02, 0.012, 0.0], gain: [1.03, 0.98, 0.92], gamma: 0.98, bleach: 0 } },
  day: { centre: 12.5, half: 5.5, grade: { ...IDENTITY } },
  dusk: { centre: 18.6, half: 1.6, grade: { temp: 0.55, tint: 0, sat: 1.03, con: 0.97, lift: [0.018, 0.006, 0.0], gain: [1.08, 0.96, 0.84], gamma: 0.95, bleach: 0 } },
  night: { centre: 0.5, half: 4.6, grade: { temp: -0.8, tint: 0, sat: 0.6, con: 1.0, lift: [0.0, 0.002, 0.014], gain: [0.86, 0.93, 1.12], gamma: 1.0, bleach: 0 } },
};

// The pass itself: LUT size, how often the CPU rebuilds the blended table, the border blend and the strength in force.
export const GRADE = {
  lut: 16,            // 16^3 texels (4096): a rebuild costs ~0.2 ms on the CPU
  rebuildS: 0.25,     // seconds between blend checks (the table is rebuilt only if a weight moved by more than eps)
  eps: 0.004,
  ring: 1200,         // m: the border blend samples the state map on two rings (this far and half of it) round the view: a
  ringN: 12,          // ~2.4 km crossing in 25 small steps (12 a ring, + the centre)
  strength: 1,        // the whole grade at full (the pause menu's Colour grade setting multiplies it)
};

// ---- horizon bands ---------------------------------------------------------------------------------------------------
// One 360 strip of distant land per row, tinted by the sky. The camera law (data/camera.js thetaSum 80: "the frame's top
// edge stays on the ground") keeps the horizon off every view of the game today, so no band is drawn and no image was
// generated (docs/design/WEB_LOOK_FEEL.md §3.2). The rows stand so a region resolves to its band the day a view lifts
// the law; `src` is where the cut strip would live (web/public/horizon/).
export const HORIZONS = {
  mesas: { name: 'mesas and buttes', src: 'horizon/mesas.png', h: 0.09 },
  swamp_treeline: { name: 'a swamp treeline', src: 'horizon/swamp_treeline.png', h: 0.06 },
  ridges: { name: 'the Appalachian ridges', src: 'horizon/ridges.png', h: 0.08 },
  flat_plains: { name: 'flat plains and grain elevators', src: 'horizon/flat_plains.png', h: 0.04 },
  dead_skyline: { name: 'a dead city skyline', src: 'horizon/dead_skyline.png', h: 0.12 },
};

// ---- wind ------------------------------------------------------------------------------------------------------------
// One uniform: direction (the sky's windX/Z), strength = base x the region's row x the weather's row, a gust wave on top.
// The flora shader bends a plant by height^2 (trunks stay planted); cloth flutters (tarps, laundry, flags).
export const WIND = {
  base: 0.55,          // m of sway at the top of a 10 m tree in a calm breeze
  gust: 0.45,          // share of the strength the gust wave adds and takes away
  gustHz: 0.13,        // gust waves a second
  swayHz: 0.9,         // a tree's own sway, radians a second x this
  cloth: 2.6,          // cloth flutters this much harder than a tree
  weather: { CLEAR: 1, OVERCAST: 1.3, RAIN: 1.7, STORM: 3.2, DUST: 2.6, FOG: 0.35, ASHFALL: 0.6 },
  // Cloth in the shared prop pools is told apart by its shape: a thin flat panel (tarps, awnings) or a thin hanging one
  // (laundry, flags) standing at least minY over its pad, never bigger than maxArea m^2 (a roof slab is not cloth).
  clothThin: 0.09, clothMinY: 1.3, clothMaxArea: 26,
};

// ---- history decals --------------------------------------------------------------------------------------------------
// Pooled flat quads on the depth law (engine/depthlayers.js groundDecal: never at y = 0, a lift over the ground).
// cell: the atlas cell (0 skid streak, 1 scorch, 2 oil sheen, 3 bonfire ring, 4 blood trail); life: game hours they last
// (0 = until the pool wraps); fade: the last share of life they fade over.
export const DECALS = {
  pool: 640,
  skid: { cell: 0, w: 0.34, l: 1.1, color: '#121110', opacity: 0.62, life: 0 },
  scorch: { cell: 1, w: 5, l: 5, color: '#16120e', opacity: 0.8, life: 0 },
  oil: { cell: 2, w: 1.6, l: 1.6, color: '#0c0d0e', opacity: 0.7, life: 72, fade: 0.3 },
  bonfire: { cell: 3, w: 2.6, l: 2.6, color: '#1c1813', opacity: 0.85, life: 0 },
  blood: { cell: 4, w: 0.5, l: 0.8, color: '#4a0606', opacity: 0.8, life: 48, fade: 0.4 },
  // Events that lay them (systems/lookfeel.js): a hard stop over brakeMin m/s lays skids every step m; a car leaking
  // (tank < 0.6 or radiator < 0.5) drips oil every dripS s; the wounded bleed a trail every trailM m.
  brakeMin: 9, brakeDecel: 7, step: 0.9, dripS: 1.6, trailM: 1.4,
  // Seeded history (deterministic per 160 m cell, no RNG stream touched): a crash story beside a road (skids leading off
  // the shoulder into the ditch, an oil stain, sometimes a scorch where it burned); a bonfire ring at a camp near a site.
  cell: 160, radius: 420, roadStory: 0.16, campStory: 0.12, maxStories: 40,
  // SITE STORIES (systems/sitestories.js): a place raided within this many game hours (or fallen) shows it on the ground.
  raidHours: 72,
};

// ---- impact feel -----------------------------------------------------------------------------------------------------
// By the round a weapon fires (data/items.js ammo keys): kick = camera recoil (m the look point is shoved back along the
// shot, recovering at 14/s), stop = hit-stop in ms on a big hit (0 = none); a melee blow and a car crash have rows too.
// The pause menu's Hit-stop / Camera kick / Crash dirt settings (0, 0.5, 1) multiply each.
export const IMPACT = {
  calibre: {
    pistol: { kick: 0.22, stop: 40 },
    smg: { kick: 0.1, stop: 0 },
    rifle: { kick: 0.2, stop: 0 },
    shells: { kick: 0.55, stop: 60 },
    rifle_heavy: { kick: 0.6, stop: 70 },
    bolts: { kick: 0.15, stop: 40 },
    harpoon: { kick: 0.4, stop: 60 },
    default: { kick: 0.15, stop: 0 },
  },
  bigHit: 30,        // damage at or over this from one hit is a "big hit" (its calibre's stop, at least minStop)
  minStop: 40, maxStop: 80,
  crash: { stopAt: 14, stop: 70, dirtAt: 9, dirt: 1 }, // m/s into a wall or another car
  explosion: { stop: 80, kick: 0.9 },
  kickRecover: 14,   // 1/s
  timeScale: 0.03,   // what the sim runs at during a hit-stop (a freeze, without a zero dt anywhere)
  dirtFade: 1.4,     // s: the screen-edge dirt flash fades over this
};

// ---- vehicle wear ----------------------------------------------------------------------------------------------------
// Per vehicle, 0..1 each, written into its body material's uniforms (a shader layer over the paint, never the paint).
// Robert loves the cars: wear makes them look travelled (a dust coat that settles low, mud flung up the sills, bright
// scratched metal at a scrape), never cheap - it is capped below the paint (`max`), and the paint's sheen stays.
export const WEAR = {
  // per second of driving at speed (scaled by speed / 20 m/s) by what is under the wheels
  dustBy: { road: 0.0015, dirt: 0.012, sand: 0.016, grass: 0.005, mud: 0.004, wet: -0.01 },
  mudBy: { road: 0.0, dirt: 0.002, sand: 0.0, grass: 0.003, mud: 0.03, wet: 0.012 },
  rainWash: 0.004,   // per second in rain, off both (rain cleans dust, settles mud)
  scrapeAt: 4,       // m/s along a wall: sparks and scraped metal
  scrapeBy: 0.08,    // per second scraping
  max: { dust: 0.85, mud: 0.8, scrape: 0.9 },
  dustColor: '#b49a74', mudColor: '#4a3a28', metal: '#c9c4ba',
  garageClean: true, // a garage repair washes it (systems/garage.js)
};

// ---- lamp light on bodies ----------------------------------------------------------------------------------------------
// Headlights and the hand torch are additive cones painted on the ground (systems/vehiclelights.js, main.js buildFlashlight):
// no light of their own, so the fixed light count holds. A person, a zombie or an animal standing in one was still lit only
// by the night sky - a black shape in a bright pool (Robert, the 845 playtest). These rows light the BODIES inside the
// cones in their own shader (systems/lamplight.js): the nearest `max` lamps to the camera, a cone, a distance falloff and the
// lamp's warm white, no scene lights added. I is peak irradiance at the lens (the sun is 2.5); falloff (1 - d / range)^2.
export const LAMPS = {
  max: 8,            // lamps in the uniform array (the nearest to the camera win)
  reach: 90,         // m from the camera a lamp is considered at all
  wrap: 0.3,         // light wraps round a body this far past its silhouette (a face half turned still reads)
  color: '#fff1cc',  // the headlamp's warm white (vehiclelights.js HEAD)
  night: 0.08,       // below this much night the lamps are not worth a body (the beams aren't drawn either)
  head: { I: 7.0, range: 30, cos: 0.76, y: 0.75 },   // a car's pair, one lamp at the middle of the nose; one eye left = 0.55
  bike: { I: 4.8, range: 24, cos: 0.84, y: 1.0 },
  torch: { I: 5.6, range: 19, cos: 0.84, y: 1.25 },  // range follows the torch cone's own reach (kit.beamReach, the dark)
};

// ---- validation ------------------------------------------------------------------------------------------------------
const hueOf = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6) return { h: 0, s: 0 };
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return { h, s: mx > 0 ? d / mx : 0 };
};
export { hueOf };

const CP = 0.32;
// The grade as a function (display-space rgb in, out): the same maths the LUT is baked from (systems/lookfeel.js).
export function applyGrade(G, r, g, b, out) {
  const t = G.temp * 0.12, ti = G.tint * 0.06, ir = r, ig = g, ib = b;
  r *= 1 + t; b *= 1 - t; g += ti; r -= ti * 0.5; b -= ti * 0.5; // white balance: a multiplier, so a deep blue never takes on red
  let l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  r = l + (r - l) * G.sat; g = l + (g - l) * G.sat; b = l + (b - l) * G.sat;
  r = CP + (r - CP) * G.con; g = CP + (g - CP) * G.con; b = CP + (b - CP) * G.con; // pivot CP: contrast bites the highlights, not the night
  l = Math.max(0, Math.min(1, 0.2126 * r + 0.7152 * g + 0.0722 * b));
  const sh = (1 - l) * (1 - l);
  r = r * (1 + (G.gain[0] - 1) * l) + G.lift[0] * sh; g = g * (1 + (G.gain[1] - 1) * l) + G.lift[1] * sh; b = b * (1 + (G.gain[2] - 1) * l) + G.lift[2] * sh;
  const bl = G.bleach * Math.max(0, l - 0.55) / 0.45;
  r += (1 - r) * bl * 0.5; g += (1 - g) * bl * 0.5; b += (1 - b) * bl * 0.45;
  const cl = (v) => Math.pow(Math.max(0, Math.min(1, v)), G.gamma);
  out[0] = cl(r); out[1] = cl(g); out[2] = cl(b);
  // THE PURPLE GUARD (house law): a colour the grade pushed into hue 262-328 (that was not already there) is greyed to
  // under 4% saturation. The LUT is baked from this function, so nothing on screen can come out violet.
  const h = hueOf(out[0], out[1], out[2]);
  if (h.s > 0.03 && h.h >= 258 && h.h <= 332) {
    const hi = hueOf(ir, ig, ib);
    if (!(hi.s > 0.06 && hi.h >= 255 && hi.h <= 335)) {
      const L = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2], o0 = out[0], o1 = out[1], o2 = out[2];
      for (let k = 0.5; k > 0.001; k *= 0.5) { out[0] = L + (o0 - L) * k; out[1] = L + (o1 - L) * k; out[2] = L + (o2 - L) * k; if (hueOf(out[0], out[1], out[2]).s <= 0.03) break; }
    }
  }
  return out;
}

// Compose a time-of-day grade over a region grade at weight w (0 = the region alone).
export function composeGrade(R, T, w, out) {
  // The night takes the region's own lift, contrast and gamma mostly away: the dark is the Night setting's (sky.js NIGHT_I), the
  // grade only colours it.
  const n = T === TIME_GRADES.night?.grade ? w : 0, keep = 1 - 0.85 * n;
  out.temp = R.temp * (1 - 0.5 * n) + T.temp * w; out.tint = R.tint + T.tint * w;
  out.sat = R.sat * (1 + (T.sat - 1) * w); out.con = (1 + (R.con - 1) * keep) * (1 + (T.con - 1) * w); out.gamma = (1 + (R.gamma - 1) * keep) * (1 + (T.gamma - 1) * w);
  for (let i = 0; i < 3; i++) { out.lift[i] = R.lift[i] * keep + T.lift[i] * w; out.gain[i] = R.gain[i] * (1 + (T.gain[i] - 1) * w); }
  out.bleach = Math.max(R.bleach * (1 - (T === TIME_GRADES.night.grade ? w : 0)), T.bleach * w);
  return out;
}

const KEYS = ['temp', 'tint', 'sat', 'con', 'gamma', 'bleach'];
export function validateLooks(regions = LOOK_REGIONS, times = TIME_GRADES, horizons = HORIZONS) {
  const errors = [], seen = new Map(), o = [0, 0, 0];
  const gradeOk = (where, G) => {
    for (const k of KEYS) if (!Number.isFinite(G[k])) errors.push(`${where}: ${k} is not a number`);
    if (!(G.sat >= 0.3 && G.sat <= 1.6)) errors.push(`${where}: sat ${G.sat} outside 0.3..1.6`);
    if (!(G.con >= 0.7 && G.con <= 1.4)) errors.push(`${where}: con ${G.con} outside 0.7..1.4`);
    if (!(G.gamma >= 0.7 && G.gamma <= 1.3)) errors.push(`${where}: gamma ${G.gamma} outside 0.7..1.3`);
    if (G.tint < 0) errors.push(`${where}: a magenta tint (${G.tint}) is how violet sneaks in: green (>= 0) only`);
    if (!Array.isArray(G.lift) || G.lift.length !== 3 || !Array.isArray(G.gain) || G.gain.length !== 3) errors.push(`${where}: lift/gain must be [r,g,b]`);
    // No purple: neutrals, skin, sand, foliage and the sky probed through the grade never land in hue 270-320.
    for (const p of PROBE) {
      applyGrade(G, p[0], p[1], p[2], o);
      const h = hueOf(o[0], o[1], o[2]);
      if (h.s > 0.06 && h.h >= 270 && h.h <= 320) { errors.push(`${where}: probe ${p.map((v) => v.toFixed(2))} grades to hue ${h.h.toFixed(0)} (purple)`); break; }
    }
  };
  for (const [id, R] of Object.entries(regions)) {
    if (!R.name) errors.push(`${id}: no name`);
    if (!R.grade) { errors.push(`${id}: no grade`); continue; }
    gradeOk(`region ${id}`, R.grade);
    if (!horizons[R.horizon]) errors.push(`${id}: horizon "${R.horizon}" is not a HORIZONS row`);
    if (!(R.wind > 0 && R.wind <= 3)) errors.push(`${id}: wind ${R.wind} outside 0..3`);
    for (const k of Object.keys(R.decals ?? {})) if (!DECALS[k]) errors.push(`${id}: decal "${k}" is not a DECALS row`);
    for (const s of R.states ?? []) { if (seen.has(s)) errors.push(`${s} is in both ${seen.get(s)} and ${id}`); seen.set(s, id); }
    // Every time of day over this region stays clear of purple too.
    for (const [tk, T] of Object.entries(times)) gradeOk(`${id} at ${tk}`, composeGrade(R.grade, T.grade, 1, { lift: [0, 0, 0], gain: [0, 0, 0] }));
  }
  for (const [tk, T] of Object.entries(times)) { if (!(T.half > 0 && T.centre >= 0 && T.centre < 24)) errors.push(`time ${tk}: centre/half`); gradeOk(`time ${tk}`, T.grade); }
  for (const [k, c] of Object.entries(IMPACT.calibre)) if (!(c.kick >= 0 && c.kick <= 2 && c.stop >= 0 && c.stop <= 120)) errors.push(`calibre ${k}: kick 0..2, stop 0..120 ms`);
  for (const k of ['head', 'bike', 'torch']) { const L = LAMPS[k]; if (!(L?.I > 0 && L.I <= 12 && L.range > 4 && L.range <= 60 && L.cos > 0.5 && L.cos < 0.99)) errors.push(`lamp ${k}: I 0..12, range 4..60, cos 0.5..0.99`); }
  { const c = parseInt(LAMPS.color.slice(1), 16), h = hueOf((c >> 16) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255); if (h.s > 0.06 && h.h >= 270 && h.h <= 320) errors.push('lamp colour is purple'); }
  for (const k of ['skid', 'scorch', 'oil', 'bonfire', 'blood']) if (!(DECALS[k]?.cell >= 0 && DECALS[k].cell < 8)) errors.push(`decal ${k}: cell`);
  return { ok: errors.length === 0, errors, regions: Object.keys(regions).length, states: seen.size };
}
// The colour probe: greys, skin, sand, foliage, sky, rust, a dark road, the night's blue, a lamp's orange.
const PROBE = [];
for (const v of [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]) PROBE.push([v, v, v]);
PROBE.push([0.78, 0.6, 0.48], [0.45, 0.3, 0.22], [0.82, 0.72, 0.52], [0.3, 0.42, 0.2], [0.55, 0.7, 0.85], [0.6, 0.3, 0.15], [0.16, 0.16, 0.17], [0.1, 0.14, 0.24], [0.95, 0.6, 0.2], [0.2, 0.3, 0.6], [0.7, 0.2, 0.2]);
export { PROBE };
