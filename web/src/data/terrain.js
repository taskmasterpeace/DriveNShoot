// Real terrain as rows (docs/design/WEB_TERRAIN.md §7 knobs). The land comes from public elevation data baked by
// tools/terrain-bake.mjs into src/data/terrain/*.bin; these are the numbers the bake and the engine share.
// Change a row, re-run the bake (the bake knobs) or reload (the engine knobs). The comment after each is its safe range.

export const TERRAIN = {
  // ---- the bake (tools/terrain-bake.mjs): change these, re-run it
  cell: 32,                 // world metres between baked samples (16-64): 32 m of game is ~480 m of real country
  band: 6000,               // world metres each side of the road the strip map follows at the road's scale (3000-8000)
  bandOut: 0.3,             // past the band, lateral offsets are squashed this much (0.2-0.5): the country carries on
  blurPasses: 4,            // 3 x 3 binomial passes after the grade (2-6): rounds the creases where cones meet
  frameSigma: 3000,         // game-side frame: the corridor centreline smoothed this much (m), so the strip map has no
                            // creases (the meander and the Phoenix kink are ironed out of the frame, not the road)
  realSigma: 60000,         // real-side frame: the real I-10 smoothed this much (real metres) for its normals; otherwise
                            // the band folds over itself on the inside of the real road's bends: 2.1% of it at 30 km, 0.25% at 60 km
  demZoom: 10,              // AWS Terrain Tiles zoom (~130 m a pixel at 32 N); 4 sub-samples per baked cell
  g: 0.10,                  // THE GRADE: the steepest any land is (rise over run, 0.06-0.15). Real slopes x the compression
                            // run 14-17 times steeper than real; the land is the highest surface under the real heights
                            // that never stands above them and is never steeper than this (peaks cut to cones of g)
  hUnit: 0.1,               // metres per stored height unit (Int16: -3,276 .. +3,276 m about Phoenix)

  // ---- the engine (world/realterrain.js): the road and the pads laid on the land
  batter: 0.20,             // cut and fill side slopes and pad edges (1:5; must be steeper than g, 0.15-0.33)
  formation: 24,            // half-width of the graded road bed either side of the centreline (m; >= paved + one ground cell)
  formationX: 80,           // ... widened through an interchange, so the ramps and the cross road sit on the bed
  formationXs: 650,         // ... over this many metres either side of the exit
  vcurve: 400,              // vertical curves: the road profile is smoothed over this length (m) twice, so a crest
                            // never throws a car at 45 m/s (curvature well under g / v^2)
  padMargin: 80,            // a town or community pad reaches this far past its last building (m)
  gridLRU: 384,             // per-chunk height grids kept (4.3 KB each)
};

// Biome letters as stored bytes (255 = no data: the usmap grid answers there).
export const BIOME_CODES = ['d', 'f', 'u', 'm', 'p', 'a', 'w', 'F', 's', '.'];

// ---- past the I-10 strip (docs/design/WEB_SITES_TERRAIN.md): the sheet packs, baked by tools/terrain-sheet.mjs through
// the rubber sheet (tools/usmap-proj.mjs) and loaded beside i10.bin. Order = priority: the engine asks the first asset
// whose rectangle holds a point (i10 first, then these in this order). Change a row, re-run the bake.
//   cell, zoom   world metres a sample and the Terrarium zoom read (one zoom step = 4x the tiles)
//   g            THE GRADE for this pack (0.06-0.15: every car climbs 15%; steeper keeps more of a canyon or a range)
//   seaFloor     real metres the land never goes below (the Gulf and Florida: 0; the I-10 country: -75, the Salton basin)
//   hUnit        metres per stored unit (Int16: +-3,276 m at 0.1; the coarse country needs 0.2 for the Rockies)
//   fixI10       keep the i10 strip's land fixed inside its rectangle and grade against it from both sides (no seam)
//   water        a region id whose procedural water (world/regions.js) is cut in; shoreFade: metres the land rises over
//   bands        write only these z ranges (the az pack lives outside the strip's rectangle, north and south of it)
export const TERRAIN_PACKS = [
  { id: 'fl', name: 'Florida (the start region)', x0: 185344, x1: 234496, z0: 19456, z1: 80384, cell: 32, zoom: 9, g: 0.10, seaFloor: 0, hUnit: 0.1,
    water: 'florida', shoreFade: 600, noBiome: true },
  { id: 'az', name: 'The dust-wall circle past the I-10 strip', x0: -48128, x1: 48128, z0: -48128, z1: 48128, cell: 32, zoom: 10, g: 0.15, seaFloor: -75, hUnit: 0.1,
    fixI10: true, bands: [{ id: 'az-n', name: 'North of the I-10 strip (the Grand Canyon, the Kaibab, the Utah plateaus)', z0: -48128, z1: -20992 },
      { id: 'az-s', name: 'South of the I-10 strip (Sonora, the sky islands)', z0: 20224, z1: 48128 }] },
  { id: 'us', name: 'The lower 48 (coarse: every region holding a SITE row, the Gulf, the Rockies)', x0: -87168, x1: 302976, z0: -144384, z1: 76800, cell: 128, zoom: 7, g: 0.15, seaFloor: 0, hUnit: 0.2 },
];
// The datum (WEB_SITES_TERRAIN F2): heights are real metres minus Phoenix's 330.8 m near Phoenix (so the island stays at
// 0 and the sheet packs meet the strip), easing to sea level far from it (so Florida's sea is at 0 and its water rows
// hold). Smooth over 120 km: a 0.28% tilt nobody can see.
export const DATUM = { phx: 330.8, r0: 60000, r1: 180000 };
export const datumShift = (x, z) => { const t = (Math.hypot(x, z) - DATUM.r0) / (DATUM.r1 - DATUM.r0); return DATUM.phx * (t <= 0 ? 1 : t >= 1 ? 0 : 1 - t * t * (3 - 2 * t)); };
// The World Forge's check of the pack rows (and the bake's): ids unique, rectangles real, cells and grades in range.
export function validateTerrainPacks(rows = TERRAIN_PACKS) {
  const errs = [], ids = new Set();
  for (const r of rows) {
    if (!/^[a-z0-9-]+$/.test(r.id ?? '') || ids.has(r.id)) errs.push(`${r.id}: id`); ids.add(r.id);
    if (!(r.x1 > r.x0 && r.z1 > r.z0)) errs.push(`${r.id}: rectangle`);
    if (!(r.cell >= 16 && r.cell <= 256) || (r.x1 - r.x0) % r.cell || (r.z1 - r.z0) % r.cell) errs.push(`${r.id}: cell ${r.cell} must divide the rectangle (16-256)`);
    if (!(r.g >= 0.06 && r.g <= 0.15)) errs.push(`${r.id}: g ${r.g} (0.06-0.15: every car climbs 15%)`);
    if (!(r.g < TERRAIN.batter)) errs.push(`${r.id}: g must stay under the batter ${TERRAIN.batter}`);
    if (!(r.zoom >= 6 && r.zoom <= 12)) errs.push(`${r.id}: zoom ${r.zoom}`);
    if (!(r.hUnit > 0 && r.hUnit <= 0.25)) errs.push(`${r.id}: hUnit ${r.hUnit}`);
    if (r.water && !(r.shoreFade >= 100)) errs.push(`${r.id}: shoreFade`);
    for (const b of r.bands ?? []) if (!(b.z0 >= r.z0 && b.z1 <= r.z1 && b.z1 > b.z0) || (b.z0 - r.z0) % r.cell) errs.push(`${r.id}: band ${b.id}`);
  }
  return { ok: !errs.length, errs, rows: rows.length };
}
