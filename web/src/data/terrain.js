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
