#!/usr/bin/env node
// THE SHEET BAKE (docs/design/WEB_SITES_TERRAIN.md §3.3): real land PAST the I-10 strip, laid onto the world through the
// rubber sheet (tools/usmap-proj.mjs: the atlas projection, inverted), in packs the engine loads beside i10.bin.
//   node tools/terrain-sheet.mjs                  bake every pack (fetching what is missing into .terrain-cache/)
//   node tools/terrain-sheet.mjs fl az            bake only these packs
//   node tools/terrain-sheet.mjs --offline        use only the cache
// Packs (rows: data/terrain.js TERRAIN_PACKS): fl (Florida, where the game starts), az-n / az-s (the rest of the dust-wall
// circle round Phoenix north and south of the I-10 strip: the Grand Canyon, the Kaibab, Sonora), us (the whole usmap,
// coarse: every region holding a SITE row, the Gulf, the Rockies). Each is the same asset format as i10.bin.
//
// The land (per pack): the DEM at every sample's real place, the datum taken off (Phoenix's 330.8 m near Phoenix, easing
// to sea level by datumR1: data/terrain.js), then THE GRADE (the highest surface under the real land never steeper than
// the pack's g). The az packs keep the i10 strip's own land fixed inside its rectangle and are graded against it from both
// sides, so the two meet on the same samples with no step. Florida is graded at sea level with the region's procedural
// water (world/regions.js, the engine's own code) cut in: the land is 0 under every sea, lagoon, canal and slough and
// rises from it over shoreFade metres, so the water the region draws still lies in its basins.
// Landcover: NLCD's WMS (mrlc.gov) timed out from this machine on 2026-10-28, so the packs carry the life-zone rule
// (biomeFor below) and 255 elsewhere (the usmap grid answers); `--nlcd` is reserved for when it answers again.
import { register } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { inflateSync, gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

register('data:text/javascript,' + encodeURIComponent(`export async function load(url, ctx, next) {
  if (url.endsWith('.json')) return next(url, { ...ctx, importAttributes: { type: 'json' } });
  return next(url, ctx);
}`));

const WEB = fileURLToPath(new URL('..', import.meta.url));
const CACHE = join(WEB, '.terrain-cache');
const OUT_DIR = join(WEB, 'src/data/terrain');
const OFFLINE = process.argv.includes('--offline');
const WANT = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const { TERRAIN, TERRAIN_PACKS, BIOME_CODES, datumShift } = await import(pathToFileURL(join(WEB, 'src/data/terrain.js')).href);
const { decodeTerrain, TERRAIN_MAGIC } = await import(pathToFileURL(join(WEB, 'src/world/realterrain.js')).href);
const { unproject } = await import(pathToFileURL(join(WEB, 'tools/usmap-proj.mjs')).href);
const log = (...a) => console.log('[sheet]', ...a);
mkdirSync(CACHE, { recursive: true });

const SOURCES = {
  terrarium: {
    name: 'AWS Terrain Tiles (Terrarium)', url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    licence: 'Open data on the AWS Registry of Open Data; per-source terms: USGS 3DEP, SRTM and GMTED2010 public domain (credit requested), ETOPO1 public domain (NOAA), INEGI (Mexico) free-use licence',
    attribution: 'United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey. Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration. Mexico terrain data source: INEGI, Continental relief, 2016. Tiles: AWS Terrain Tiles (Mapzen / Tilezen joerd).',
  },
};
const MANIFEST = join(CACHE, 'manifest.json');
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { files: {} };
const saveManifest = () => writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
async function cached(src, rel, url) {
  const p = join(CACHE, rel);
  if (!existsSync(p)) {
    if (OFFLINE) throw new Error(`--offline and ${rel} is not cached`);
    mkdirSync(dirname(p), { recursive: true });
    let err;
    for (let a = 0; a < 4; a++) {
      try {
        const r = await fetch(url, { headers: { 'user-agent': 'dsoa-terrain-bake/1 (game terrain from public data)' }, signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const b = Buffer.from(await r.arrayBuffer());
        writeFileSync(p, b);
        manifest.files[rel] = { src, url, bytes: b.length, fetched: new Date().toISOString() };
        break;
      } catch (e) { err = e; await new Promise((r) => setTimeout(r, 800 * (a + 1))); }
    }
    if (!existsSync(p)) throw new Error(`fetch ${url}: ${err?.message}`);
  }
  return readFileSync(p);
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }

// A small PNG decoder for the Terrarium tiles (8-bit RGB / RGBA, not interlaced).
function decodePNG(buf) {
  let p = 8, w = 0, h = 0, type = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), t = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    p += 12 + len;
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); type = d[9]; } else if (t === 'IDAT') idat.push(d); else if (t === 'IEND') break;
  }
  const bpp = type === 6 ? 4 : 3, stride = w * bpp, raw = inflateSync(Buffer.concat(idat)), out = new Uint8Array(w * h * 3);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], cur = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 3; out[o] = cur[x * bpp]; out[o + 1] = cur[x * bpp + 1]; out[o + 2] = cur[x * bpp + 2]; }
    prev = cur;
  }
  return out;
}

// THE GRADE (WEB_TERRAIN T3) with fixed samples: U = the highest g-Lipschitz surface under the land (fixed samples count
// as land and are restored), L = the lowest one over the fixed samples; the land is max(U, L) outside them. Both are
// g-Lipschitz, so is their max, and both equal the fixed land on its edge: the packs meet the strip with no step.
function envelope(src, NX, NZ, cell, g, sign) {
  const NB = [];
  for (let dz = -2; dz <= 0; dz++) for (let dx = -2; dx <= 2; dx++) {
    if (dz === 0 && dx >= 0) continue; if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue; if ((Math.abs(dx) === 2 && dz === 0) || (dx === 0 && dz === -2)) continue;
    NB.push([dx, dz, Math.hypot(dx, dz) * cell * g]);
  }
  const u = Float64Array.from(src);
  for (const dir of [1, -1]) for (let jj = 0; jj < NZ; jj++) {
    const j = dir > 0 ? jj : NZ - 1 - jj;
    for (let ii = 0; ii < NX; ii++) {
      const i = dir > 0 ? ii : NX - 1 - ii, k = j * NX + i;
      let v = u[k];
      for (let q = 0; q < NB.length; q++) {
        const x = i + NB[q][0] * dir, z = j + NB[q][1] * dir;
        if (x < 0 || z < 0 || x >= NX || z >= NZ) continue;
        const c = u[z * NX + x] + sign * NB[q][2];
        if (sign > 0 ? c < v : c > v) v = c;
      }
      u[k] = v;
    }
  }
  return u;
}

// Life zones (the landcover stand-in): steep real country reads as mountains; in the dry West the conifer belt (real
// 1,950-3,100 m: the Kaibab, the Mogollon Rim, the Rockies' montane forest) as forest, the pinyon-juniper belt below it as
// scrub, bare summits as mountains. Elsewhere 255: the usmap grid's own letter answers.
const BIO = Object.fromEntries(BIOME_CODES.map((c, i) => [c, i]));
function biomeFor(e, rough, lon, roughCut) {
  if (rough > roughCut) return BIO.m;
  if (lon < -100) {
    if (e > 3100) return BIO.m;
    if (e > 1950) return BIO.F;
    if (e > 1350) return BIO.f;
  }
  return 255;
}

async function bakePack(P) {
  const t0 = Date.now();
  const cell = P.cell, X0 = P.x0, Z0 = P.z0, NX = Math.round((P.x1 - P.x0) / cell) + 1, NZ = Math.round((P.z1 - P.z0) / cell) + 1, N = NX * NZ;
  log(`${P.id}: ${P.name} - x ${X0}..${P.x1}, z ${Z0}..${P.z1} at ${cell} m = ${NX} x ${NZ} = ${(N / 1e6).toFixed(2)} M samples, z${P.zoom}, g ${P.g}`);
  // 0. fixed samples: the i10 strip's land inside its rectangle (the packs that touch it); no DEM is read for them
  let fixed = null, fixedV = null;
  if (P.fixI10) {
    const I = await decodeTerrain(readFileSync(join(OUT_DIR, 'i10.bin')), async (b) => new Uint8Array(gunzipSync(b)));
    const h = I.header, ix1 = h.x0 + (h.nx - 1) * h.cell, iz1 = h.z0 + (h.nz - 1) * h.cell;
    if (h.cell !== cell || (X0 - h.x0) % cell || (Z0 - h.z0) % cell) throw new Error(`${P.id}: must sit on the i10 lattice (cell ${h.cell}, origin ${h.x0}, ${h.z0})`);
    fixed = new Uint8Array(N); fixedV = new Float64Array(N);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const x = X0 + i * cell, z = Z0 + j * cell; if (x < h.x0 || x > ix1 || z < h.z0 || z > iz1) continue;
      const ii = Math.round((x - h.x0) / h.cell), jj = Math.round((z - h.z0) / h.cell), k = j * NX + i;
      fixed[k] = 1; fixedV[k] = I.heights[jj * h.nx + ii] * h.hUnit;
    }
  }
  // 1. every sample's real place (Newton, walking each row from the last answer)
  const LL = new Float64Array(N * 2);
  let guess = null;
  for (let j = 0; j < NZ; j++) {
    guess = null;
    for (let i = 0; i < NX; i++) { const k = j * NX + i, ll = unproject(X0 + i * cell, Z0 + j * cell, guess ?? (j ? [LL[((j - 1) * NX + i) * 2], LL[((j - 1) * NX + i) * 2 + 1]] : null)); LL[k * 2] = ll[0]; LL[k * 2 + 1] = ll[1]; guess = ll; }
  }
  // 2. elevation: Terrarium tiles at the pack's zoom, bilinear in pixel space, 4 sub-samples a cell
  const Z = P.zoom, TS = 256, WP = TS * 2 ** Z;
  const pxOf = (lat, lon) => { const s = Math.sin((lat * Math.PI) / 180); return [((lon + 180) / 360) * WP, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WP]; };
  const need = new Set();
  for (let k = 0; k < N; k++) { if (fixed?.[k]) continue; const [px, py] = pxOf(LL[k * 2], LL[k * 2 + 1]); for (const [ox, oy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) need.add(`${Math.floor((px + ox) / TS)}/${Math.floor((py + oy) / TS)}`); }
  const tiles = new Map(); let bytes = 0, done = 0;
  await pool([...need], 8, async (key) => {
    const [tx, ty] = key.split('/').map(Number);
    const b = await cached('terrarium', `terrarium/${Z}/${tx}/${ty}.png`, SOURCES.terrarium.url.replace('{z}', Z).replace('{x}', tx).replace('{y}', ty));
    bytes += b.length;
    const rgb = decodePNG(b), e = new Float32Array(TS * TS);
    for (let q = 0; q < TS * TS; q++) e[q] = rgb[q * 3] * 256 + rgb[q * 3 + 1] + rgb[q * 3 + 2] / 256 - 32768;
    tiles.set(key, e);
    if (++done % 50 === 0) process.stdout.write(`\r[sheet] ${P.id} tiles ${done}/${need.size}   `);
  });
  process.stdout.write('\n');
  log(`${P.id}: ${need.size} Terrarium tiles at z${Z}, ${(bytes / 1048576).toFixed(1)} MB`);
  const demPx = (X, Y) => { const t = tiles.get(`${Math.floor(X / TS)}/${Math.floor(Y / TS)}`); return t ? t[(((Y % TS) + TS) % TS) * TS + (((X % TS) + TS) % TS)] : 0; };
  const dem = (lat, lon) => { const [px, py] = pxOf(lat, lon), fx = px - 0.5, fy = py - 0.5, X = Math.floor(fx), Y = Math.floor(fy), tx = fx - X, ty = fy - Y;
    return (demPx(X, Y) * (1 - tx) + demPx(X + 1, Y) * tx) * (1 - ty) + (demPx(X, Y + 1) * (1 - tx) + demPx(X + 1, Y + 1) * tx) * ty; };
  const llAt = (fi, fj, o) => { fi = Math.max(0, Math.min(NX - 1.0001, fi)); fj = Math.max(0, Math.min(NZ - 1.0001, fj)); const i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, tz = fj - j, k = j * NX + i;
    for (let c = 0; c < 2; c++) o[c] = (LL[k * 2 + c] * (1 - tx) + LL[(k + 1) * 2 + c] * tx) * (1 - tz) + (LL[(k + NX) * 2 + c] * (1 - tx) + LL[(k + NX + 1) * 2 + c] * tx) * tz; return o; };
  const E = new Float64Array(N), raw = new Float32Array(N), o = [0, 0];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    if (fixed?.[j * NX + i]) { raw[j * NX + i] = fixedV[j * NX + i] + 330.8; E[j * NX + i] = fixedV[j * NX + i]; continue; }
    let s = 0; for (const [a, b] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) { llAt(i + a, j + b, o); s += dem(o[0], o[1]); }
    const k = j * NX + i, e = Math.max(P.seaFloor, s / 4);
    raw[k] = e; E[k] = e - datumShift(X0 + i * cell, Z0 + j * cell);
  }
  // 3. Florida: the region's water cut in (the engine's own procedural sea, lagoon, canals and sloughs)
  if (P.water) {
    const { WorldIndex } = await import(pathToFileURL(join(WEB, 'src/world/worldindex.js')).href);
    const { regionWater } = await import(pathToFileURL(join(WEB, 'src/world/regions.js')).href);
    const W = new WorldIndex(), R = W.regions[P.water], wo = { d: 0, k: 0, s: 0 };
    const dist = new Float64Array(N).fill(1e9);
    let wet = 0;
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const x = X0 + i * cell, z = Z0 + j * cell, k = j * NX + i;
      if (!R.inBox(x, z)) { dist[k] = 0; wet++; continue; } // past the squall line: sea level
      regionWater(R, x, z, wo);
      if (wo.d > 0 || wo.s > 0) { dist[k] = 0; wet++; }
    }
    // distance from the water (chamfer 3-4, two passes), then the land eases up from 0 over shoreFade
    for (const dir of [1, -1]) for (let jj = 0; jj < NZ; jj++) {
      const j = dir > 0 ? jj : NZ - 1 - jj;
      for (let ii = 0; ii < NX; ii++) {
        const i = dir > 0 ? ii : NX - 1 - ii, k = j * NX + i;
        let v = dist[k];
        for (const [dx, dz, w] of [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.4142], [1, -1, 1.4142]]) {
          const x = i + dx * dir, z = j + dz * dir; if (x < 0 || z < 0 || x >= NX || z >= NZ) continue;
          const c = dist[z * NX + x] + w * cell; if (c < v) v = c;
        }
        dist[k] = v;
      }
    }
    const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    for (let k = 0; k < N; k++) E[k] = Math.max(0, E[k]) * sm(dist[k] / P.shoreFade);
    log(`${P.id}: the region's water cut in (${((wet / N) * 100).toFixed(1)}% of samples wet; the land eases up over ${P.shoreFade} m)`);
  }
  // 5. THE GRADE
  let land = envelope(E, NX, NZ, cell, P.g, 1);
  if (fixed) {
    const lowSeed = new Float64Array(N).fill(-1e9);
    for (let k = 0; k < N; k++) if (fixed[k]) { land[k] = fixedV[k]; lowSeed[k] = fixedV[k]; }
    const L = envelope(lowSeed, NX, NZ, cell, P.g, -1);
    for (let k = 0; k < N; k++) if (!fixed[k] && L[k] > land[k]) land[k] = L[k];
  }
  for (let pass = 0; pass < TERRAIN.blurPasses; pass++) {
    const b = new Float64Array(N);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i; if (fixed?.[k]) { b[k] = land[k]; continue; }
      let s = 0, w = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const x = Math.min(NX - 1, Math.max(0, i + dx)), z = Math.min(NZ - 1, Math.max(0, j + dz)), ww = (2 - Math.abs(dx)) * (2 - Math.abs(dz)); s += land[z * NX + x] * ww; w += ww; }
      b[k] = s / w;
    }
    land = b;
  }
  let gmax = 0, lo = Infinity, hi = -Infinity;
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) { const k = j * NX + i; if (fixed?.[k]) continue; gmax = Math.max(gmax, Math.hypot(land[k + 1] - land[k], land[k + NX] - land[k]) / cell); lo = Math.min(lo, land[k]); hi = Math.max(hi, land[k]); }
  // 6. biome: the life zones (rough = the real ground's spread over 3 x 3 samples, scaled to ~1.4 km of real country)
  const biome = new Uint8Array(N).fill(255), counts = {};
  const roughCut = 220 * Math.max(1, cell / 32) ** 0.5;
  if (!P.noBiome) for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = j * NX + i; let a = Infinity, b = -Infinity;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const x = Math.min(NX - 1, Math.max(0, i + dx)), z = Math.min(NZ - 1, Math.max(0, j + dz)), e = raw[z * NX + x]; if (e < a) a = e; if (e > b) b = e; }
    const c = raw[k] <= 0.5 ? 255 : biomeFor(raw[k], b - a, LL[k * 2 + 1], roughCut);
    biome[k] = c; const key = c === 255 ? 'grid' : BIOME_CODES[c]; counts[key] = (counts[key] ?? 0) + 1;
  }
  // 7. the asset, optionally cropped to bands (the az packs keep only what lies outside the strip's rectangle)
  const hU = P.hUnit;
  for (const band of P.bands ?? [{ id: P.id, z0: Z0, z1: P.z1 }]) {
    const j0 = Math.round((band.z0 - Z0) / cell), j1 = Math.round((band.z1 - Z0) / cell), nz = j1 - j0 + 1, n = NX * nz;
    const payload = Buffer.alloc(n * 3);
    for (let j = 0; j < nz; j++) { let prev = 0; for (let i = 0; i < NX; i++) { const k = (j0 + j) * NX + i, v = Math.max(-32767, Math.min(32767, Math.round(land[k] / hU))); payload.writeInt16LE(v - prev, (j * NX + i) * 2); prev = v; } }
    for (let j = 0; j < nz; j++) payload.set(biome.subarray((j0 + j) * NX, (j0 + j + 1) * NX), n * 2 + j * NX);
    const gz = gzipSync(payload, { level: 9 });
    const header = {
      name: band.name ?? P.name, id: band.id, version: 1, created: new Date().toISOString().slice(0, 10), x0: X0, z0: Z0 + j0 * cell, cell, nx: NX, nz, hUnit: hU, g: P.g,
      mapping: { kind: 'sheet', tool: 'tools/usmap-proj.mjs', zoom: Z, datum: P.water ? 'sea level' : 'Phoenix 330.8 m within datumR0, easing to sea level at datumR1 (data/terrain.js datumShift)', seaFloor: P.seaFloor, fixedI10: !!P.fixI10, water: P.water ?? null, shoreFade: P.shoreFade ?? null },
      landcover: 'life zones (tools/terrain-sheet.mjs biomeFor); 255 = the usmap grid answers', biomeCodes: BIOME_CODES,
      sources: [{ id: 'terrarium', name: SOURCES.terrarium.name, url: SOURCES.terrarium.url, licence: SOURCES.terrarium.licence, attribution: SOURCES.terrarium.attribution, files: need.size, bytes }],
    };
    const hb = Buffer.from(JSON.stringify(header)), head = Buffer.alloc(12); head.write(TERRAIN_MAGIC, 0, 'latin1'); head.writeUInt32LE(hb.length, 8);
    const asset = Buffer.concat([head, hb, gz]);
    writeFileSync(join(OUT_DIR, `${band.id}.bin`), asset);
    log(`${band.id}: wrote src/data/terrain/${band.id}.bin ${(asset.length / 1048576).toFixed(2)} MB (${NX} x ${nz}, raw ${(payload.length / 1048576).toFixed(1)} MB)`);
  }
  log(`${P.id}: land ${lo.toFixed(0)}..${hi.toFixed(0)} m, steepest cell ${(gmax * 100).toFixed(1)}%, biomes ${JSON.stringify(Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, `${((v / N) * 100).toFixed(1)}%`])))}; ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

for (const P of TERRAIN_PACKS) if (!WANT.length || WANT.includes(P.id)) await bakePack(P);
saveManifest();
