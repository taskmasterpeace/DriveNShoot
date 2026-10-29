// DEAD CARS (BACK-LOTS 2, Robert 2026-10-28: "Are these placeholder cars or something? What happened to our cars?").
// Every static car in the world - a wreck on the shoulder, a hulk in a boneyard, a car on blocks in a yard or a chop
// shop, a burned-out shell in an alley - is one of OUR vehicle bodies (systems/vehiclebodies.js buildBody), dead.
// systems/wrecks.js builds one dead variant per type x state (cached) and draws them all in one batched mesh.
// A source (chunkgen, a towner, citygen, the island, a base) only says where, which way, and which mix of states.

// TYPES: the bodies a wreck can be (each a VEHICLES row that fits a car's collider, 4.2 x 1.9 m, once fitted), by weight.
export const WRECK_TYPES = { sedan: 5, pickup: 3, van: 2, interceptor: 1 };

// STATES: what happened to it.
//   fade      paint toward grey (0..1); rust: share of the painted skin rusted through; rustCol
//   glass     keep the glass (false: broken out)
//   tyres     'flat' (squashed to the rim), 'gone' (no wheels: on its belly), 'blocks' (no wheels: up on cinder blocks)
//   doors     keep the doors (false: taken)
//   hood      radians the hood stands open (0: shut)
//   char      the burn: 0..1 share toward char black; ash: the top faces' ash grey; scorch: a burned patch on the ground (m)
//   sag       m the body sits lower than whole
export const WRECK_STATES = {
  rusted:   { name: 'rusted, abandoned', fade: 0.5, rust: 0.38, rustCol: '#6e3c1e', glass: false, tyres: 'flat', doors: true, hood: 0, char: 0, sag: 0.07 },
  burned:   { name: 'burned out', fade: 1, rust: 0.12, rustCol: '#3a2014', glass: false, tyres: 'gone', doors: true, hood: 0, char: 1, ash: '#26221e', charCol: '#0a0908', scorch: 0.55, sag: 0.34 },
  crushed:  { name: 'crushed flat', fade: 0.55, rust: 0.3, rustCol: '#6e3c1e', glass: false, tyres: 'flat', doors: true, hood: 0, char: 0, sag: 0, squash: 0.46 }, // a show's flattened car (systems/stunts.js)
  stripped: { name: 'stripped, on blocks', fade: 0.35, rust: 0.22, rustCol: '#6e3c1e', glass: true, tyres: 'blocks', doors: false, hood: 1.05, char: 0, sag: 0, blockCol: '#8a847a' },
};

// The paint a wreck was, before the sun had it (an instance tint over a neutral body; no purple, validated).
export const WRECK_PAINTS = ['#b0503c', '#4e6e90', '#76804e', '#d8ccb0', '#4a4844', '#4a6e58', '#9a7448', '#e0dcd2', '#4e8480', '#8a3a30'];

// SOURCES: who leaves which kind of dead car (state weights). A source not here takes 'roadside'.
export const WRECK_SOURCES = {
  roadside:  { rusted: 6, burned: 3, stripped: 1 },  // the shoulders and medians: an old evacuation (world/chunkgen.js)
  street:    { rusted: 5, burned: 4, stripped: 1 },  // left at the kerb in a ring street or a town street
  boneyard:  { rusted: 4, stripped: 3, burned: 1 },  // a holdout's or a roadside yard's stacked hulks
  burnt:     { burned: 1 },                          // the alleys' burned-out cars (world/citygen/backdress.js)
  blocks:    { stripped: 1 },                        // a yard's car on blocks, a chop shop's car, a base's stripped truck
};

// Fit: a body scaled to stand inside its collider (a van in a car's box), never past it by more than this (m).
export const WRECK_FIT = { overLen: 0.4, overWid: 0.3, minScale: 0.78 };

const hueOf = (hex) => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 0.04) return -1; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };

// The World Forge's check (and the selftest's): every type a real VEHICLES row, every state whole, every source's
// states real, no purple.
export function validateWrecks(vehicles) {
  const bad = [];
  for (const t of Object.keys(WRECK_TYPES)) { const s = vehicles?.[t]; if (vehicles && !s) bad.push(`type ${t}: not a VEHICLES row`); if (s && (s.boat || s.bike || s.open)) bad.push(`type ${t}: not a car`); }
  for (const [k, S] of Object.entries(WRECK_STATES)) {
    if (!['flat', 'gone', 'blocks'].includes(S.tyres)) bad.push(`state ${k}: tyres ${S.tyres}`);
    if (!(S.fade >= 0 && S.fade <= 1 && S.rust >= 0 && S.rust <= 1 && S.char >= 0 && S.char <= 1)) bad.push(`state ${k}: a share out of 0..1`);
  }
  for (const [k, W] of Object.entries(WRECK_SOURCES)) for (const s of Object.keys(W)) if (!WRECK_STATES[s]) bad.push(`source ${k}: no state ${s}`);
  const cols = [...WRECK_PAINTS, ...Object.values(WRECK_STATES).flatMap((S) => [S.rustCol, S.ash, S.charCol, S.blockCol].filter(Boolean))];
  for (const c of cols) { const h = hueOf(c); if (h >= 270 && h <= 320) bad.push(`purple ${c}`); }
  return { ok: !bad.length, bad, types: Object.keys(WRECK_TYPES).length, states: Object.keys(WRECK_STATES).length };
}

// A wreck from a seed and a source: { type, state, paint } (pure: chunkgen and citygen hash what they place).
export function wreckOf(seed, source = 'roadside') {
  const pickW = (obj, u) => { let t = 0; for (const k in obj) t += obj[k]; let p = u * t; for (const k in obj) if ((p -= obj[k]) < 0) return k; return Object.keys(obj)[0]; };
  const u1 = ((seed >>> 0) % 9973) / 9973, u2 = (((seed >>> 0) / 9973 | 0) % 997) / 997, u3 = (((seed >>> 0) / 99431 | 0) % 89) / 89;
  return { type: pickW(WRECK_TYPES, u1), state: pickW(WRECK_SOURCES[source] ?? WRECK_SOURCES.roadside, u2), paint: Math.floor(u3 * WRECK_PAINTS.length) };
}
