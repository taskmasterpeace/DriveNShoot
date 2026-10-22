import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '../engine/rng.js';

// Mountains & mesas: real heightfields (relief you see from the top-down camera through
// shading, rock banding and long shadows), merged into ONE draw call. Their footprint
// becomes static collision, so roads and the nav grid route around them.

const CELL = 4;
const MAX_TERRAIN_H = 48;

export function buildTerrain(scene, statics, opts) {
  const rng = makeRng(opts.seed ?? 4242);
  const avoid = opts.avoid ?? []; // [{x,z,r}] camps, lake, river corridor...
  const peaks = [];
  const tryPlace = (x, z, r, kind) => {
    if (Math.max(Math.abs(x), Math.abs(z)) - r < 326 && kind !== 'mesa-in') return false; // keep off the road grid
    if (Math.abs(z) < r + 18) return false;                                             // Route 66 corridor
    if (Math.abs(x) + r > 452 || Math.abs(z) + r > 452) return false;
    for (const a of avoid) if (Math.hypot(a.x - x, a.z - z) < a.r + r) return false;
    for (const p of peaks) if (Math.hypot(p.x - x, p.z - z) < p.r + r - 6) return false;
    return true;
  };
  // Outer ranges: a ring of buttes, ridges and big mesas.
  for (let i = 0; i < 420 && peaks.length < 34; i++) {
    const a = rng() * Math.PI * 2, d = rng.range(350, 440);
    const x = Math.cos(a) * d * (Math.abs(Math.cos(a)) > 0.7 ? 1 : 1.05), z = Math.sin(a) * d;
    const kind = rng() < 0.4 ? 'mesa' : rng() < 0.6 ? 'ridge' : 'butte';
    const r = kind === 'mesa' ? rng.range(26, 46) : kind === 'ridge' ? rng.range(30, 55) : rng.range(14, 24);
    if (!tryPlace(x, z, r, kind)) continue;
    peaks.push({ x, z, r, kind, h: kind === 'mesa' ? rng.range(16, 26) : kind === 'butte' ? rng.range(18, 30) : rng.range(22, MAX_TERRAIN_H), rot: rng() * Math.PI, seed: rng() * 1000 });
  }

  // Height of one feature at a world point.
  const heightOf = (p, x, z) => {
    const dx = x - p.x, dz = z - p.z;
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    let lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (p.kind === 'ridge') lz *= 2.2; // elongated
    const d = Math.hypot(lx, lz) / p.r;
    if (d >= 1) return 0;
    const n = Math.sin(lx * 0.21 + p.seed) * Math.cos(lz * 0.17 + p.seed * 1.3) * 0.5 + Math.sin(lx * 0.47 - lz * 0.39 + p.seed) * 0.25;
    if (p.kind === 'mesa' || p.kind === 'butte') {
      // Flat cap, steep cliff band, talus apron.
      const cliff = p.kind === 'butte' ? 0.72 : 0.8;
      const top = d < cliff ? 1 : d < cliff + 0.1 ? 1 - (d - cliff) / 0.1 * 0.75 : 0.25 * Math.pow(1 - (d - cliff - 0.1) / (1 - cliff - 0.1), 2); // talus eases into the plain
      return Math.max(0, p.h * top + n * 1.6 * (d < cliff ? 0.3 : 1));
    }
    const ridged = 1 - Math.abs(Math.sin(lx * 0.09 + p.seed));
    return Math.max(0, p.h * Math.pow(1 - d, 1.6) * (0.75 + 0.35 * ridged) + n * 2.2 * (1 - d));
  };
  const heightAt = (x, z) => { let h = 0; for (const p of peaks) if (Math.abs(x - p.x) < p.r && Math.abs(z - p.z) < p.r) h = Math.max(h, heightOf(p, x, z)); return h; };

  // Geometry: one grid patch per feature, vertex-coloured by height + slope (rock strata).
  const geos = [];
  const cRock = new THREE.Color('#8a4a2e'), cBand = new THREE.Color('#a8603a'), cTop = new THREE.Color('#a8684a'), cBase = new THREE.Color('#9c7450'), cDark = new THREE.Color('#4a2c1c'), tmp = new THREE.Color();
  for (const p of peaks) {
    const seg = Math.max(32, Math.round(p.r / 0.9)); // ~1m cells: cliff rims without sawtooth
    const g = new THREE.PlaneGeometry(p.r * 2.1, p.r * 2.1, seg, seg);
    g.rotateX(-Math.PI / 2);
    g.translate(p.x, 0, p.z);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = heightOf(p, x, z);
      pos.setY(i, h > 0.02 ? h : -0.05); // skirt just under the ground (no step at the rim)
      const k = h / p.h;
      const slope = Math.min(1, (Math.abs(heightOf(p, x + 1.2, z) - h) + Math.abs(heightOf(p, x, z + 1.2) - h)) / 2.4);
      tmp.copy(cBase).lerp(cRock, Math.min(1, k * 1.4));
      if (Math.sin(h * 1.7 + p.seed) > 0.55) tmp.lerp(cBand, 0.5);            // strata bands
      if (k > 0.92) tmp.lerp(cTop, 0.6);                                      // sun-bleached cap
      tmp.lerp(cDark, slope * 0.55);                                          // cliffs & gullies
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    geos.push(g);
  }
  if (geos.length) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0, flatShading: true })); // faceted: reads as rock
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Collision: rasterise the footprint where it rises above a step (1.2m), row-merged.
  for (const p of peaks) {
    const x0 = Math.floor((p.x - p.r) / CELL), x1 = Math.ceil((p.x + p.r) / CELL);
    const z0 = Math.floor((p.z - p.r) / CELL), z1 = Math.ceil((p.z + p.r) / CELL);
    for (let zc = z0; zc <= z1; zc++) {
      let run = null;
      for (let xc = x0; xc <= x1 + 1; xc++) {
        const solid = xc <= x1 && heightOf(p, (xc + 0.5) * CELL, (zc + 0.5) * CELL) > 1.2;
        if (solid && run === null) run = xc;
        if (!solid && run !== null) { statics.add(run * CELL, zc * CELL, xc * CELL, (zc + 1) * CELL, 'rock', 20); run = null; }
      }
    }
  }
  return { peaks, heightAt };
}

export function drawTerrainOnMinimap(canvas, terrain, half) {
  const g = canvas.getContext('2d'), k = canvas.width / (half * 2);
  for (const p of terrain.peaks) {
    const gr = g.createRadialGradient((p.x + half) * k, (p.z + half) * k, 0, (p.x + half) * k, (p.z + half) * k, p.r * k);
    gr.addColorStop(0, p.kind === 'mesa' ? '#8a5a38' : '#7a4a2e'); gr.addColorStop(0.75, '#5e3a24'); gr.addColorStop(1, 'rgba(58,44,31,0)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse((p.x + half) * k, (p.z + half) * k, p.r * k, (p.kind === 'ridge' ? p.r / 2.2 : p.r) * k, -p.rot, 0, Math.PI * 2); g.fill();
  }
}
