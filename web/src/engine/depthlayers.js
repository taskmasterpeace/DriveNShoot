// THE DEPTH LAYERS (docs/design/WEB_DEPTH_LAYERS.md): one law for every flat thing that lies on, or just over, another.
// From the top-down camera most of the screen is horizontal surfaces stacked a few centimetres apart: the land, a road
// ribbon on it, paint on the road, a floor slab on a pad, a rug on the floor, blood on the rug. Two of them closer than
// the depth buffer can tell apart flicker ("z-fighting"). Every such layer is a ROW here and reads its separation from it:
//   lift    m above the surface it rests on (opaque layers that write depth: the gap must beat DEPTH.eps)
//   factor, units   polygonOffset (decals: drawn nearer than what they lie on without moving them)
//   order   renderOrder (decals and glows draw after the opaque world, in this order among themselves)
//   write   depthWrite (decals never write depth: two decals on one spot never fight each other)
// The rule: an opaque layer is separated by LIFT (>= eps, measured from the ground or floor under it, never from y = 0);
// a decal by OFFSET + ORDER with depthWrite off, laid at the surface's own height (+ `lift` as a safety margin over a
// slope's facets). `zfight` (src/agent/zfight.js) proves it from the scene graph.
//
// The camera's near plane is the other half (systems/camrig.js nearFor): depth precision at distance d is ~ d² / (near ·
// 2^24); the near plane follows the boom (a tenth of it, 1-6 m) instead of sitting at 1 m.
export const DEPTH = {
  eps: 0.005,         // m: the smallest height gap between two opaque depth-writing layers (the detector's floor)
  near: { share: 0.1, min: 1, max: 6 },   // camera near = clamp(boom D x share, min, max)
};

// The rows. Heights are metres above the surface named in `on`. The opaque rows record where each layer stands (the
// generators lay them: chunkgen's TOWN/ribbon lifts below, ring.js floors, storeys.js slabs); the decal rows are applied
// by decalMaterial / layerMesh. The full table, with files: docs/design/WEB_DEPTH_LAYERS.md §3.
export const LAYERS = {
  // ---- opaque, depth-writing (separated by lift) ----
  ground:      { on: 'datum',   lift: 0,     order: 0, write: true },   // the land mesh (realterrain / chunk ground, the island plane)
  road:        { on: 'ground',  lift: 0.03,  order: 0, write: true },   // a ribbon: RIBBON_BASE + RIBBON_STEP x rank (below)
  town:        { on: 'ground',  lift: 0.012, order: 0, write: true },   // ring / holdout yard ... street z: TOWN (below), STEP apart
  floor:       { on: 'pad',     lift: 0.12,  order: 0, write: true },   // a ring building's slab top; finishes 0.132, rugs to 0.15
  slab:        { on: 'storey',  lift: 0.006, order: 0, write: true },   // a storey's slab over the wall tops it overlaps (STEP / 2)
  water:       { on: 'bed',     lift: 0.015, order: 1, write: true },   // water sheets: drawn after the ground they sit in
  // a cemetery's flat pieces (systems/rites.js, one InstancedMesh): TOP heights over the land or pad under each piece, every
  // one clear of the town steps (to 0.078), the back lots (0.046-0.074), citygen kerbs and streets (0.08-0.112) and the
  // ring's floors (0.12 / 0.132 / rugs 0.14-0.15), and of each other
  cemGround:   { on: 'ground',  lift: 0.086, order: 0, write: true },   // a yard's worked ground on a site's pad; an open grave's floor
  cemPath:     { on: 'ground',  lift: 0.106, order: 0, write: true },   // its gravel paths
  cemHollow:   { on: 'ground',  lift: 0.126, order: 0, write: true },   // a sunk grave's hollow
  cemMound:    { on: 'ground',  lift: 0.166, order: 0, write: true },   // the lowest (oldest) mound top; younger ones stand to 0.25, a fresh one 0.32
  cemKerb:     { on: 'ground',  lift: 0.146, order: 0, write: true },   // a rich plot's stone kerb: under every mound top (it meets their ends where a row bends)
  // UNDER THE STREET's ways on the street (systems/understreetlook.js, one InstancedMesh a town): a shaft's dark mouth and a
  // ramp's opening at usHole, a lid, a grate's bars and a manhole's frame at usLid: over every citygen street and kerb
  // (to 0.112) and the ring's floors (0.12 / 0.132 sit inside buildings, never under a lid)
  usHole:      { on: 'ground',  lift: 0.118, order: 0, write: true },
  usLid:       { on: 'ground',  lift: 0.14,  order: 0, write: true },
  // ---- decals: depthWrite off, polygonOffset, fixed order (separated by offset + order) ----
  groundDecal: { on: 'surface', lift: 0.03, factor: -2, units: -4, order: 2, write: false }, // tyre tracks, skid marks, ground patches
  blood:       { on: 'surface', lift: 0.03, factor: -4, units: -8, order: 3, write: false }, // blood pools, splats, scorch (fx + blood.js)
  wallDecal:   { on: 'wall',    lift: 0.03, factor: -4, units: -8, order: 3, write: false }, // bullet marks, blood on walls
  shadowBlob:  { on: 'surface', lift: 0.04, factor: -3, units: -6, order: 2, write: false }, // contact shadows, airborne car shadows
  ring:        { on: 'surface', lift: 0.06, factor: -6, units: -12, order: 5, write: false }, // aim / selection / trap rings
};

// The town surfaces a ring or holdout chunk lays into its road layer (world/chunkgen.js), each one STEP over the last so
// two that overlap (a walk on a yard, a crossing of two streets) never share a plane. Metres above the ground.
export const STEP = 0.012;
export const TOWN = { yard: STEP * 1, lot: STEP * 2, walkX: STEP * 3, walkZ: STEP * 4, streetX: STEP * 5, streetZ: STEP * 6 };

// Two streets of one axis that run into each other (a holdout's main street meeting its landing road) overlap where they
// join: each street's name picks a half step (FNV of the name, its low bit), so the two of a pair differ half the time
// by design and the detector lists the rest.
export function tieLift(name) { let v = 2166136261; for (let i = 0; i < name.length; i++) { v ^= name.charCodeAt(i); v = Math.imul(v, 16777619); } return (v & 1) * STEP / 2; }

// Road ribbons share one mesh too (world/chunkgen.js): a ribbon rides RIBBON_STEP x its rank over the ground under it. The
// interstate is rank 0, a ramp 1 (it merges along the mainline), every other road 2 + its heading's third of the
// compass (0-60, 60-120, 120-180 degrees): two roads crossing at 60 degrees or more are never in one third, so a town's
// street grid, a county road over a cross road, never share a plane. (Shallow Y-forks of one kind still can: the detector
// lists them.)
export const RIBBON_BASE = 0.03, RIBBON_STEP = STEP; // (base: over a region's water sheet at 0.015 and between the town steps)
export const PAINT_LIFT = RIBBON_BASE + RIBBON_STEP * 5; // stop lines: over every ribbon rank
export function ribbonRank(rb, tx, tz) {
  if (rb.mainline || rb.kind === 'hwy') return 0;
  if (rb.kind === 'ramp') return 1;
  let h = Math.atan2(tx, tz); if (h < 0) h += Math.PI; if (h >= Math.PI) h -= Math.PI; // a road's heading, either way along it
  return 2 + Math.min(2, Math.floor(h / (Math.PI / 3)));
}

// Where a decal on the ground lies: DECAL_Y over the ground under it (or over the floor a character stands on upstairs),
// above every opaque floor layer a building lays on its pad (the ring's slab 0.12, its finishes 0.132, rugs to 0.15),
// so blood on a shop floor, a rug and the sand outside all lie on top. TRACK_Y: tyre tracks and skids, over every road
// rank and town step (0.078) and the stop-line paint (0.09), under the decals.
export const DECAL_Y = 0.16, TRACK_Y = 0.095;

// Apply a decal row to a material (and its mesh's renderOrder): the one call every decal layer makes.
export function decalMaterial(mat, layer) {
  const L = LAYERS[layer];
  mat.depthWrite = L.write;
  if (L.factor !== undefined) { mat.polygonOffset = true; mat.polygonOffsetFactor = L.factor; mat.polygonOffsetUnits = L.units; }
  return mat;
}
// Tag a mesh with its layer (the detector names it; renderOrder from the row).
export function layerMesh(mesh, layer) {
  const L = LAYERS[layer];
  mesh.userData.depthLayer = layer;
  mesh.renderOrder = L.order;
  if (mesh.material && L.factor !== undefined) decalMaterial(mesh.material, layer);
  return mesh;
}
export const lift = (layer) => LAYERS[layer].lift;
export const nearFor = (D) => Math.min(DEPTH.near.max, Math.max(DEPTH.near.min, D * DEPTH.near.share));
