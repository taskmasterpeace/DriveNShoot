// The baked land (src/data/terrain/i10.bin, docs/design/WEB_TERRAIN.md), decoded once per forge page and painted as one
// image: biome colour, lifted by height, hillshaded from the north-west. TERRAIN shows it whole; MAP and BRUSH lay it under
// the corridor when they are zoomed in, so you paint woods onto the real hills, not onto a 500 m wash.
import { BIOME_COL } from './mapview.js';
import { BIOME_CODES } from '../data/terrain.js';

let pending = null;
export function getLand() {
  pending ??= (async () => {
    const { loadTerrain } = await import('../world/realterrain.js');
    const t0 = performance.now();
    const asset = await loadTerrain(new URL('../data/terrain/i10.bin', import.meta.url).href);
    const { header: h, heights, biome } = asset, step = 2, nx = Math.floor(h.nx / step), nz = Math.floor(h.nz / step);
    const cv = document.createElement('canvas'); cv.width = nx; cv.height = nz;
    const c2 = cv.getContext('2d'), img = c2.createImageData(nx, nz), d = img.data, hu = h.hUnit;
    const at = (i, j) => heights[Math.min(h.nz - 1, Math.max(0, j)) * h.nx + Math.min(h.nx - 1, Math.max(0, i))] * hu;
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < heights.length; k += 97) { const v = heights[k] * hu; if (v < lo) lo = v; if (v > hi) hi = v; }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const I = i * step, J = j * step, b = biome[J * h.nx + I], letter = b === 255 ? null : BIOME_CODES[b];
      const base = letter ? BIOME_COL[letter] ?? [120, 110, 90] : [70, 66, 60];
      const e = at(I, J), sx = (at(I + 1, J) - at(I - 1, J)) / (2 * h.cell), sz = (at(I, J + 1) - at(I, J - 1)) / (2 * h.cell);
      const shade = 1 + Math.max(-0.5, Math.min(0.5, (-(sx + sz) * 0.7071) / (h.g ?? 0.1) * 0.45));
      const lift = 0.82 + 0.36 * ((e - lo) / (hi - lo || 1));
      const o = (j * nx + i) * 4;
      d[o] = Math.min(255, base[0] * shade * lift); d[o + 1] = Math.min(255, base[1] * shade * lift); d[o + 2] = Math.min(255, base[2] * shade * lift); d[o + 3] = 255;
    }
    c2.putImageData(img, 0, 0);
    return { asset, canvas: cv, x0: h.x0, z0: h.z0, w: h.nx * h.cell, h: h.nz * h.cell, range: [lo, hi], ms: Math.round(performance.now() - t0) };
  })();
  return pending;
}
