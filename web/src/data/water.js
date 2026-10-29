// L1 WATER as rows (docs/design/WEB_RIVERS.md; the layer stack: docs/design/WEB_WORLD_EDITOR_PLAN.md §3.1).
// Rivers, washes and canals are polylines with a width and a depth; lakes, reservoirs and playas are polygons; the sea is
// a level and a coastline (a hook: Florida's coast drops in here as rows). The engine (world/rivers.js) carves every
// row into the ground, fills it with water, and builds a bridge, a culvert or a ford wherever a road crosses it (L2).
// Change a row, not the code. The comment after each knob is its safe range.
//
// Coordinates are world metres (+x east, +z south; Phoenix at the origin). Widths and depths are GAME metres: the world
// compresses distance 14-17 times (WEB_TERRAIN T2) but not heights, and not water - a boat must fit, a car must drown.
//
// REGIONS. Each region's baked rows are one JSON file (tools/water-bake.mjs writes the I-10 corridor's); authored rows
// (a creek a designer wants, a canal in a town) go in AUTHORED below. Florida: add `import FL from './water/florida.json'`
// and put it in REGIONS. Nothing in the engine knows which region a row came from.
import I10 from './water/i10.json';

export const WATER = {
  // ---- L2: when a road crossing water gets a deck (WEB_WORLD_EDITOR_PLAN §4)
  ford: 0.6,                // m: water a car may drive through (0.4-0.8); deeper and a road crossing gets a deck
  gorge: 4,                 // m: ground lower than the road by more than this under it gets a deck, not a fill (3-8)
  span: 24,                 // m: one pier bent every span along a deck (16-40)
  approach: 30,             // m: a deck runs this far past the water's edge (or the gorge's lip) at each end (12-60)
  railH: 1.0,               // m: guardrails wherever a deck or its approach fill stands taller than this (0.6-1.5)
  clearance: { river: 5.2, canal: 3.4, creek: 2.6, wash: 0, lake: 5.2 }, // m: deck underside above the water (a boat is 2.6 tall)
  deckThick: 1.1,           // m: the slab under the road surface (0.8-1.6)
  rampGrade: 0.04,          // the steepest an approach fill climbs (0.03-0.06); a smoothstep profile, so L = 1.5 * lift / grade
  deckHp: 2400,             // a bridge's hit points (the materials agent's destruction reads and writes `hp`/`state`; a hook)
  culvertMargin: 6,         // m: a culvert's fill runs this far past the road's paved edge before the wash opens again (4-12)
  fordOff: 1200,            // m: the bake puts a river's gravel-bar ford this far downstream of its nearest approach to the road
  fordDepth: 0.38,          // m: water over a ford's bar (under `ford`: a car crosses, slowly, throwing spray)

  // ---- L1: how a channel sits in the ground
  drop: { river: 1.2, canal: 1.6, creek: 0.7, wash: 0, lake: 0.6 }, // m: the water's surface below the land around it
  bankRun: { river: 5.0, canal: 1.2, creek: 4.0, wash: 3.5, lake: 18.0 }, // horizontal metres per metre of bank (1:5 for a river; a lake's beach 1:18; a canal's is concrete)
  wadeSink: 0.45,           // m: how far a wader's feet sit below the surface (half the depth up to this) (0.3-0.6)
  swimDepth: 1.3,           // m: deeper than this you swim (world/water.js stateAt uses the same 1.3)
  washTint: [1.12, 1.12, 1.16], // the ground in a dry wash (its bed is drawn as a strip: colour.washBed); warm, no purple
  washBank: [0.62, 0.55, 0.45], // ... and its cut banks, darker
  bankTint: [0.42, 0.38, 0.3],  // wet mud on a river's banks (12 m out from the water, fading)
  playaTint: [1.16, 1.12, 1.04], // a dry lakebed's white crust
  colour: { deep: '#323627', mid: '#4f4d33', shallow: '#76694a', foam: '#cbbf9f', // muddy green-brown, darker with depth
    washBed: '#b39d79', washLip: '#76593e',                                         // a wash's pale bed, its dark cut lip
    // A region's water by kind (world/regions.js WK: 1 swamp, 2 canal, 3 lagoon, 4 ocean), shallow -> deep (over 2.2 m;
    // the ocean over 6 m): tea-dark swamp water, a canal, the lagoon, the sea (Florida's, docs/design/WEB_FLORIDA.md).
    region: { 1: ['#4a4a2c', '#1d2518'], 2: ['#465236', '#1c2e26'], 3: ['#3d6f68', '#1c4648'], 4: ['#3b8580', '#0d3a40'] } },
  flow: 0.9,                // m/s: how fast the ripples run downstream (0.3-2)

  // ---- where water may stand (the bake clips, the validator warns, the engine never carves inside these)
  phoenixClear: 2600,       // m from the origin: Phoenix's pad (the island and the ring keep their own water)
  wallClear: 1500,          // m inside the dust wall
  bakeBand: 6000,           // m off the road: the strip map's band (past it the land is squashed)
  minRun: 300,              // m: a baked run shorter than this is dropped
  townClear: 950,           // m from a built town's centre: its streets and buildings stand on dry ground
  exitClear: 420,           // m from an interchange's centre: the ramps, the cross road and the overpass stay dry
};

// Authored rows (any region), merged with the baked ones. Same schema (validateWater documents it).
export const AUTHORED = {
  rivers: [],
  lakes: [],
};

// The sea as rows: a level in world metres and coastline polygons whose inside is open water. Off for I-10. Florida's
// sea, lagoon, canals and sloughs are a REGION's water (data/regions.js `water`, world/regions.js regionWater), the second
// source of the same authority (world/rivers.js depthAt: the deeper of the rows and the region wins); its sheet is a mode
// of the same water material. A coast drawn as rows instead would come in here.
export const SEA = { on: false, level: -0.6, d: 8, shelf: 0.02, coast: [] };

const REGIONS = [I10];
export const WATER_ROWS = {
  rivers: [...REGIONS.flatMap((r) => r.rivers ?? []), ...AUTHORED.rivers],
  lakes: [...REGIONS.flatMap((r) => r.lakes ?? []), ...AUTHORED.lakes],
  sea: SEA,
  sources: REGIONS.flatMap((r) => r.meta?.sources ?? []),
};

// ---- the validator (the WORLD FORGE's TERRAIN/water tab calls this on every edit; the selftest calls it at boot) -------
// Row schema:
//   river  { id, name, kind: river|creek|canal|wash, flow?: perennial|intermittent|ephemeral, w, d? (water depth at the
//            centre; 0 or absent = dry), bed? (a dry channel's depth below its banks), pts: [[x, z, w?, d?], ...] in
//            flow order, fords?: [{ i, d, len }] (a shallow gravel bar at point i), src, note? }
//   lake   { id, name, kind: lake|reservoir|playa, d (deepest), shelf? (depth gained per metre from the shore),
//            pts: [[x, z], ...] (a ring), src }
// Returns a list of problems (strings); an empty list is a clean set. `ctx` (optional): { phoenix: true } also checks the
// clear zones, { towns: [{x,z}], exits: [{x,z}] } the town and interchange zones.
export function validateWater(rows = WATER_ROWS, ctx = {}) {
  const bad = [], ids = new Set();
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const KINDS = ['river', 'creek', 'canal', 'wash'], LKINDS = ['lake', 'reservoir', 'playa'];
  for (const r of rows.rivers ?? []) {
    const at = `river ${r.id ?? '?'}`;
    if (!r.id || typeof r.id !== 'string') bad.push(`${at}: needs a string id`);
    else if (ids.has(r.id)) bad.push(`${at}: duplicate id`); else ids.add(r.id);
    if (!KINDS.includes(r.kind)) bad.push(`${at}: kind "${r.kind}" is not one of ${KINDS.join('|')}`);
    if (!num(r.w) || r.w < 4 || r.w > 400) bad.push(`${at}: w ${r.w} must be 4-400 m`);
    const wet = (r.d ?? 0) > 0;
    if (r.d !== undefined && (!num(r.d) || r.d < 0 || r.d > 30)) bad.push(`${at}: d ${r.d} must be 0-30 m`);
    if (r.kind === 'wash' && wet) bad.push(`${at}: a wash is dry (d must be 0; make it a creek or a river)`);
    if (r.kind === 'wash' && !(num(r.bed) && r.bed > 0 && r.bed <= 8)) bad.push(`${at}: a wash needs bed 0-8 m`);
    if (r.kind !== 'wash' && !wet) bad.push(`${at}: a ${r.kind} needs water (d > 0)`);
    if (!Array.isArray(r.pts) || r.pts.length < 2) { bad.push(`${at}: needs at least 2 points`); continue; }
    let L = 0;
    for (let i = 0; i < r.pts.length; i++) {
      const p = r.pts[i];
      if (!Array.isArray(p) || !num(p[0]) || !num(p[1])) { bad.push(`${at}: point ${i} is not [x, z]`); break; }
      if (p[2] !== undefined && (!num(p[2]) || p[2] < 4)) bad.push(`${at}: point ${i} width ${p[2]}`);
      if (p[3] !== undefined && (!num(p[3]) || p[3] < 0)) bad.push(`${at}: point ${i} depth ${p[3]}`);
      if (i) { const d = Math.hypot(p[0] - r.pts[i - 1][0], p[1] - r.pts[i - 1][1]); if (d < 0.5) bad.push(`${at}: points ${i - 1} and ${i} coincide`); L += d; }
      if (ctx.phoenix && Math.hypot(p[0], p[1]) < WATER.phoenixClear) { bad.push(`${at}: point ${i} is inside Phoenix's pad (${WATER.phoenixClear} m): the island and the ring keep their own water`); break; }
    }
    if (L < 20) bad.push(`${at}: only ${L.toFixed(0)} m long`);
    for (const f of r.fords ?? []) if (!num(f.i) || f.i < 0 || f.i >= r.pts.length || !num(f.d) || f.d >= WATER.ford || !num(f.len) || f.len <= 0) bad.push(`${at}: ford ${JSON.stringify(f)} needs i (a point), d < ford (${WATER.ford}) and len > 0`);
    for (const [k, list] of [['town', ctx.towns], ['interchange', ctx.exits]]) for (const t of list ?? []) {
      const lim = k === 'town' ? WATER.townClear : WATER.exitClear;
      if (r.pts.some((p) => Math.hypot(p[0] - t.x, p[1] - t.z) < lim)) { bad.push(`${at}: runs within ${lim} m of the ${k} ${t.id ?? `${Math.round(t.x)},${Math.round(t.z)}`} (the engine keeps it dry there)`); }
    }
  }
  for (const l of rows.lakes ?? []) {
    const at = `lake ${l.id ?? '?'}`;
    if (!l.id || typeof l.id !== 'string') bad.push(`${at}: needs a string id`);
    else if (ids.has(l.id)) bad.push(`${at}: duplicate id`); else ids.add(l.id);
    if (!LKINDS.includes(l.kind)) bad.push(`${at}: kind "${l.kind}" is not one of ${LKINDS.join('|')}`);
    if (!num(l.d) || l.d < 0 || l.d > 60) bad.push(`${at}: d ${l.d} must be 0-60 m`);
    if (l.kind === 'playa' && l.d > 0) bad.push(`${at}: a playa is dry (d 0)`);
    if (l.kind !== 'playa' && !(l.d > 0)) bad.push(`${at}: a ${l.kind} needs water (d > 0)`);
    if (!Array.isArray(l.pts) || l.pts.length < 3 || l.pts.some((p) => !Array.isArray(p) || !num(p[0]) || !num(p[1]))) { bad.push(`${at}: needs a ring of at least 3 [x, z] points`); continue; }
    let a = 0; for (let i = 0; i < l.pts.length; i++) { const p = l.pts[i], q = l.pts[(i + 1) % l.pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    if (Math.abs(a / 2) < 400) bad.push(`${at}: area ${Math.abs(a / 2).toFixed(0)} m2 is too small for a lake`);
    if (ctx.phoenix && l.pts.some((p) => Math.hypot(p[0], p[1]) < WATER.phoenixClear)) bad.push(`${at}: reaches inside Phoenix's pad`);
  }
  const S = rows.sea;
  if (S && S.on) {
    if (!num(S.level)) bad.push('sea: level must be a number');
    if (!Array.isArray(S.coast) || !S.coast.length) bad.push('sea: on, but no coast polygons');
  }
  return bad;
}
