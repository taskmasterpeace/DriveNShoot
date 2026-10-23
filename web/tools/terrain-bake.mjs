#!/usr/bin/env node
// THE TERRAIN BAKE (docs/design/WEB_TERRAIN.md): real elevation and landcover, laid onto our world.
//   node tools/terrain-bake.mjs                 (from web/) fetch what is missing, bake src/data/terrain/i10.bin
//   node tools/terrain-bake.mjs --offline       use only what is already in the cache (fails if something is missing)
//
// Sources (public, freely licensed; every download is recorded in .terrain-cache/manifest.json and the asset header):
//   elevation   AWS Terrain Tiles, Terrarium PNG (USGS 3DEP / SRTM / GMTED2010 / ETOPO1, INEGI in Mexico)
//   landcover   NLCD 2021 Land Cover (CONUS), USGS/MRLC, through MRLC's public WMS
//   the road    US Census TIGER/Line 2023 primary roads (where the real I-10 runs)
//
// The strip map. The world's I-10 is a compressed copy of the real one (Los Angeles -> Phoenix -> El Paso, 14-17 to 1).
// A world point is measured from a smooth frame along our road (arc length s, offset d); s maps to arc length along the
// real I-10 through anchors at Los Angeles, Phoenix and El Paso (a monotone cubic, so the scale sigma = dr/ds changes
// smoothly), and d becomes sigma * d metres off the real road along its smoothed normal. Our road lands on the real road.
// Heights stay real metres about Phoenix's; slopes would come out sigma times too steep, so the land is replaced by the
// highest surface that never stands above it and is never steeper than THE GRADE g (data/terrain.js):
// min over q of E(q) + g|p - q|. That changes nothing where the real land is gentle; peaks become cones of grade g.
import { register } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { inflateSync, inflateRawSync, gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

register('data:text/javascript,' + encodeURIComponent(`export async function load(url, ctx, next) {
  if (url.endsWith('.json')) return next(url, { ...ctx, importAttributes: { type: 'json' } });
  return next(url, ctx);
}`));

const WEB = fileURLToPath(new URL('..', import.meta.url));
const CACHE = join(WEB, '.terrain-cache');
const OUT_DIR = join(WEB, 'src/data/terrain');
const OUT = join(OUT_DIR, 'i10.bin');
const RENDERS = join(WEB, '../docs/renders/web/terrain');
const OFFLINE = process.argv.includes('--offline');
const { WorldIndex } = await import(pathToFileURL(join(WEB, 'src/world/worldindex.js')).href);
const { TERRAIN, BIOME_CODES } = await import(pathToFileURL(join(WEB, 'src/data/terrain.js')).href);
const { RealTerrain, decodeTerrain, TERRAIN_MAGIC } = await import(pathToFileURL(join(WEB, 'src/world/realterrain.js')).href);
const { STREAM } = await import(pathToFileURL(join(WEB, 'src/data/streaming.js')).href);

const log = (...a) => console.log('[bake]', ...a);
const t00 = Date.now();
mkdirSync(CACHE, { recursive: true }); mkdirSync(OUT_DIR, { recursive: true }); mkdirSync(RENDERS, { recursive: true });

// ---- sources, licences, and a ledger of every byte fetched ------------------------------------------------------------
const SOURCES = {
  terrarium: {
    name: 'AWS Terrain Tiles (Terrarium)', url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    licence: 'Open data on the AWS Registry of Open Data; per-source terms: USGS 3DEP, SRTM and GMTED2010 public domain (credit requested), ETOPO1 public domain (NOAA), INEGI (Mexico) free-use licence',
    attribution: 'United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey. Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration. Mexico terrain data source: INEGI, Continental relief, 2016. Tiles: AWS Terrain Tiles (Mapzen / Tilezen joerd).',
    docs: 'https://registry.opendata.aws/terrain-tiles/ ; https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
  },
  nlcd: {
    name: 'NLCD 2021 Land Cover (CONUS)', url: 'https://www.mrlc.gov/geoserver/mrlc_display/NLCD_2021_Land_Cover_L48/wms',
    licence: 'Public domain (U.S. Geological Survey / Multi-Resolution Land Characteristics Consortium); no access constraints, no fees',
    attribution: 'National Land Cover Database 2021, U.S. Geological Survey / MRLC (Dewitz, J., 2023, NLCD 2021 Products: U.S. Geological Survey data release).',
    docs: 'https://www.mrlc.gov/data ; WMS GetCapabilities: AccessConstraints NONE, Fees NONE',
  },
  tiger: {
    name: 'TIGER/Line 2023 Primary Roads', url: 'https://www2.census.gov/geo/tiger/TIGER2023/PRIMARYROADS/tl_2023_us_primaryroads.zip',
    licence: 'Public domain (U.S. Census Bureau)', attribution: 'TIGER/Line Shapefiles, U.S. Census Bureau (2023).',
    docs: 'https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html',
  },
};
const MANIFEST = join(CACHE, 'manifest.json');
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { files: {} };
const ledger = { terrarium: { files: 0, bytes: 0, fetchedNow: 0 }, nlcd: { files: 0, bytes: 0, fetchedNow: 0 }, tiger: { files: 0, bytes: 0, fetchedNow: 0 } };
const saveManifest = () => writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));

async function cached(src, rel, url, { optional = false } = {}) {
  const p = join(CACHE, rel);
  if (!existsSync(p)) {
    if (OFFLINE) { if (optional) return null; throw new Error(`--offline and ${rel} is not cached`); }
    mkdirSync(dirname(p), { recursive: true });
    let lastErr;
    for (let a = 0; a < 4; a++) {
      try {
        const r = await fetch(url, { headers: { 'user-agent': 'dsoa-terrain-bake/1 (game terrain from public data)' } });
        if (r.status === 404 && optional) return null;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const b = Buffer.from(await r.arrayBuffer());
        writeFileSync(p, b);
        manifest.files[rel] = { src, url, bytes: b.length, fetched: new Date().toISOString() };
        ledger[src].fetchedNow += b.length;
        break;
      } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 800 * (a + 1))); }
    }
    if (!existsSync(p)) throw new Error(`fetch ${url}: ${lastErr?.message}`);
  }
  const b = readFileSync(p);
  ledger[src].files++; ledger[src].bytes += b.length;
  manifest.files[rel] ??= { src, url, bytes: b.length, fetched: 'before this run' };
  return b;
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }

// ---- a small PNG decoder (8-bit grey / RGB / RGBA / palette, not interlaced) -> RGBA -------------------------------------
function decodePNG(buf) {
  let p = 8, w = 0, h = 0, depth = 0, type = 0, inter = 0, plte = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), t = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    p += 12 + len;
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; inter = d[12]; }
    else if (t === 'PLTE') plte = d; else if (t === 'tRNS') trns = d; else if (t === 'IDAT') idat.push(d); else if (t === 'IEND') break;
  }
  if (inter) throw new Error('interlaced PNG');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const bits = depth * ch, stride = Math.ceil((w * bits) / 8), bpp = Math.max(1, bits >> 3);
  const raw = inflateSync(Buffer.concat(idat)), out = new Uint8Array(w * h * 4);
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
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (type === 3) {
        const idx = depth === 8 ? cur[x] : (cur[(x * depth) >> 3] >> (8 - depth - ((x * depth) & 7))) & ((1 << depth) - 1);
        out[o] = plte[idx * 3]; out[o + 1] = plte[idx * 3 + 1]; out[o + 2] = plte[idx * 3 + 2]; out[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (depth !== 8) throw new Error(`PNG depth ${depth}`);
      else if (type === 2) { out[o] = cur[x * 3]; out[o + 1] = cur[x * 3 + 1]; out[o + 2] = cur[x * 3 + 2]; out[o + 3] = 255; }
      else if (type === 6) { out.set(cur.subarray(x * 4, x * 4 + 4), o); }
      else if (type === 0) { out[o] = out[o + 1] = out[o + 2] = cur[x]; out[o + 3] = 255; }
      else if (type === 4) { out[o] = out[o + 1] = out[o + 2] = cur[x * 2]; out[o + 3] = cur[x * 2 + 1]; }
    }
    prev = cur;
  }
  return { w, h, rgba: out };
}

// ---- ZIP (central directory) and shapefile readers ------------------------------------------------------------------
function unzip(buf) {
  let e = buf.length - 22; while (e > 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16);
  const files = {};
  for (let k = 0; k < n; k++) {
    const meth = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    const ds = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28), data = buf.subarray(ds, ds + csize);
    files[name] = meth === 8 ? inflateRawSync(data) : data;
    p += 46 + nl + xl + cl;
  }
  return files;
}
function readDBF(b, field) {
  const n = b.readUInt32LE(4), hl = b.readUInt16LE(8), rl = b.readUInt16LE(10);
  let off = 1, fo = -1, flen = 0;
  for (let p = 32; b[p] !== 0x0d; p += 32) { const nm = b.toString('latin1', p, p + 11).replace(/\0.*$/, ''), len = b[p + 16]; if (nm === field) { fo = off; flen = len; } off += len; }
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = b.toString('latin1', hl + i * rl + fo, hl + i * rl + fo + flen).trim();
  return out;
}
function readSHP(b, keep) {
  const parts = [];
  let p = 100, rec = 0;
  while (p < b.length) {
    const len = b.readInt32BE(p + 4) * 2, c = p + 8;
    if (keep(rec) && b.readInt32LE(c) === 3) {
      const np = b.readInt32LE(c + 36), npt = b.readInt32LE(c + 40), idx = [];
      for (let k = 0; k < np; k++) idx.push(b.readInt32LE(c + 44 + k * 4));
      const P0 = c + 44 + np * 4;
      for (let k = 0; k < np; k++) {
        const a = idx[k], z = k + 1 < np ? idx[k + 1] : npt, pts = [];
        for (let q = a; q < z; q++) pts.push([b.readDoubleLE(P0 + q * 16), b.readDoubleLE(P0 + q * 16 + 8)]);
        parts.push(pts);
      }
    }
    p = c + len; rec++;
  }
  return parts;
}

// ---- geography helpers: a local metric frame about the corridor (equirectangular at lat0; +-2% over 3 degrees) --------
const RE = 6371008.8, LAT0 = 32.6, LON0 = -112, KX = (Math.PI / 180) * RE * Math.cos((LAT0 * Math.PI) / 180), KY = (Math.PI / 180) * RE;
const toM = (lon, lat) => [(lon - LON0) * KX, (lat - LAT0) * KY];
const toLL = (x, y) => [x / KX + LON0, y / KY + LAT0];

// Resample a polyline [[x,y]] at a fixed step; returns {x, y, s, n, L}.
function resampleXY(pts, step) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.max(2, Math.ceil(L / step) + 1), x = new Float64Array(n), y = new Float64Array(n), s = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * L;
    while (j < cum.length - 2 && cum[j + 1] < t) j++;
    const f = (t - cum[j]) / (cum[j + 1] - cum[j] || 1);
    x[i] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f; y[i] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f; s[i] = t;
  }
  return { x, y, s, n, L };
}
// Gaussian smoothing of a resampled polyline (ends extended along their tangents so they do not shrink).
function smoothXY(c, sigma) {
  const step = c.s[1] - c.s[0], k = Math.ceil((3 * sigma) / step), n = c.n, w = [];
  for (let q = -k; q <= k; q++) w.push(Math.exp(-((q * step) ** 2) / (2 * sigma * sigma)));
  const at = (i) => {
    if (i < 0) return [c.x[0] + (c.x[0] - c.x[1]) * -i, c.y[0] + (c.y[0] - c.y[1]) * -i];
    if (i >= n) return [c.x[n - 1] + (c.x[n - 1] - c.x[n - 2]) * (i - n + 1), c.y[n - 1] + (c.y[n - 1] - c.y[n - 2]) * (i - n + 1)];
    return [c.x[i], c.y[i]];
  };
  const pts = [];
  for (let i = 0; i < n; i++) { let sx = 0, sy = 0, sw = 0; for (let q = -k; q <= k; q++) { const p = at(i + q); sx += p[0] * w[q + k]; sy += p[1] * w[q + k]; sw += w[q + k]; } pts.push([sx / sw, sy / sw]); }
  return pts;
}
// A frame over a resampled polyline: unit tangents and right normals (right of travel in +s), nearest-point queries.
function frame(c) {
  const n = c.n, tx = new Float64Array(n), ty = new Float64Array(n);
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = c.x[b] - c.x[a], dy = c.y[b] - c.y[a], l = Math.hypot(dx, dy) || 1; tx[i] = dx / l; ty[i] = dy / l; }
  return { ...c, tx, ty };
}
function nearest(F, px, py, coarse = 20) {
  // A coarse pass every `coarse` samples, then the segments round the best.
  let bi = 0, bd = Infinity;
  for (let i = 0; i < F.n; i += coarse) { const d = (F.x[i] - px) ** 2 + (F.y[i] - py) ** 2; if (d < bd) { bd = d; bi = i; } }
  let best = Infinity, bs = 0, bseg = 0, bt = 0;
  for (let i = Math.max(0, bi - coarse * 2); i < Math.min(F.n - 1, bi + coarse * 2); i++) {
    const ax = F.x[i], ay = F.y[i], dx = F.x[i + 1] - ax, dy = F.y[i + 1] - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = (px - ax - dx * t) ** 2 + (py - ay - dy * t) ** 2;
    if (d < best) { best = d; bseg = i; bt = t; bs = F.s[i] + (F.s[i + 1] - F.s[i]) * t; }
  }
  const qx = F.x[bseg] + (F.x[bseg + 1] - F.x[bseg]) * bt, qy = F.y[bseg] + (F.y[bseg + 1] - F.y[bseg]) * bt;
  const tx = F.tx[bseg] + (F.tx[bseg + 1] - F.tx[bseg]) * bt, ty = F.ty[bseg] + (F.ty[bseg + 1] - F.ty[bseg]) * bt;
  // Signed offset: + to the right of travel. For the world (x east, z south) right of (tx,tz) is (-tz, tx); for the
  // real frame (x east, y north) it is (ty, -tx). `rightSign` picks.
  return { s: bs, d: Math.sqrt(best), side: (px - qx) * (-ty) + (py - qy) * tx >= 0 ? 1 : -1, seg: bseg, t: bt };
}
const lerpArr = (F, arr, s) => { const step = F.s[1] - F.s[0]; let i = Math.floor(s / step); if (i < 0) i = 0; if (i > F.n - 2) i = F.n - 2; const f = (s - F.s[i]) / step; return arr[i] + (arr[i + 1] - arr[i]) * f; };
const pointAt = (F, s) => { const step = F.s[1] - F.s[0]; const L = F.s[F.n - 1]; if (s < 0) return [F.x[0] + F.tx[0] * s, F.y[0] + F.ty[0] * s]; if (s > L) return [F.x[F.n - 1] + F.tx[F.n - 1] * (s - L), F.y[F.n - 1] + F.ty[F.n - 1] * (s - L)]; return [lerpArr(F, F.x, s), lerpArr(F, F.y, s)]; };

// Monotone cubic (Fritsch-Carlson) through anchors, linear past the ends. Returns {f, df}.
function pchip(xs, ys) {
  const n = xs.length, h = [], dl = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) { h.push(xs[i + 1] - xs[i]); dl.push((ys[i + 1] - ys[i]) / h[i]); }
  m[0] = dl[0]; m[n - 1] = dl[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = dl[i - 1] * dl[i] <= 0 ? 0 : (3 * (h[i - 1] + h[i])) / ((2 * h[i] + h[i - 1]) / dl[i - 1] + (h[i] + 2 * h[i - 1]) / dl[i]);
  const f = (x) => {
    if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1]);
    let i = 0; while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
  const df = (x) => (f(x + 1) - f(x - 1)) / 2;
  return { f, df, m };
}

// =========================================================================================================================
// 1. Our world: the corridor as WorldIndex builds it (the engine's own code, so the bake and the game agree).
const W = new WorldIndex();
const cl = W.cl;
log(`world: I-10 centreline ${(cl.L / 1000).toFixed(1)} km, ${W.exits.length} exits, towns built: ${W.towns.filter((t) => t.built).map((t) => t.id).join(', ')}`);
// The game frame: the centreline smoothed (no meander, no kink), extended 20 km past both ends so the bake rectangle's
// corners still project onto it.
const gameXY = [];
for (let i = 0; i < cl.n; i++) gameXY.push([cl.x[i], cl.z[i]]);
const ext = 20000, t0v = [cl.x[1] - cl.x[0], cl.z[1] - cl.z[0]], t1v = [cl.x[cl.n - 1] - cl.x[cl.n - 2], cl.z[cl.n - 1] - cl.z[cl.n - 2]];
const n0 = Math.hypot(...t0v), n1 = Math.hypot(...t1v);
gameXY.unshift([cl.x[0] - (t0v[0] / n0) * ext, cl.z[0] - (t0v[1] / n0) * ext]);
gameXY.push([cl.x[cl.n - 1] + (t1v[0] / n1) * ext, cl.z[cl.n - 1] + (t1v[1] / n1) * ext]);
const gameRes = resampleXY(gameXY, 25);
const GF = frame(resampleXY(smoothXY(gameRes, TERRAIN.frameSigma), 25));
// The road's own offset from the frame (so our road maps exactly onto the real one): off(s_F).
const offS = new Float64Array(GF.n), offW = new Float64Array(GF.n);
for (let i = 0; i < cl.n; i += 2) {
  const q = nearest(GF, cl.x[i], cl.z[i]), k = Math.round(q.s / (GF.s[1] - GF.s[0]));
  if (k >= 0 && k < GF.n) { offS[k] += q.side * q.d; offW[k]++; }
}
const off = new Float64Array(GF.n);
{ let last = 0; for (let i = 0; i < GF.n; i++) if (offW[i]) last = offS[i] / offW[i]; else offW[i] = 0;
  // fill gaps by linear interpolation between known samples (ends hold)
  const known = []; for (let i = 0; i < GF.n; i++) if (offW[i]) known.push(i);
  for (let i = 0; i < GF.n; i++) {
    let a = known.findLast?.((k) => k <= i) ?? null; let b = known.find((k) => k >= i) ?? null;
    if (a === null) a = b; if (b === null) b = a;
    off[i] = a === b ? offS[a] / offW[a] : offS[a] / offW[a] + ((offS[b] / offW[b] - offS[a] / offW[a]) * (i - a)) / (b - a);
  }
  void last; }
const gameS = (name) => { const t = W.towns.find((x) => x.id === name); return nearest(GF, t.x, t.z).s; };
const anchorsGame = { losangeles: gameS('losangeles'), phoenix: nearest(GF, 0, 0).s, elpaso: gameS('elpaso') };
log('game anchors (frame metres):', Object.fromEntries(Object.entries(anchorsGame).map(([k, v]) => [k, Math.round(v)])));

// 2. The real I-10 (TIGER/Line primary roads): every vertex named I- 10 in the corridor, ordered and averaged into one
// centreline (both carriageways, in 400 m bins along a rough guide through the towns it passes).
const tigerZip = await cached('tiger', 'tiger/tl_2023_us_primaryroads.zip', SOURCES.tiger.url);
const zf = unzip(tigerZip);
const shpName = Object.keys(zf).find((k) => k.endsWith('.shp')), dbfName = Object.keys(zf).find((k) => k.endsWith('.dbf'));
const names = readDBF(zf[dbfName], 'FULLNAME');
const i10names = new Set(names.filter((s) => /^I- ?10$/.test(s)));
const parts = readSHP(zf[shpName], (r) => i10names.has(names[r]));
const BOX = { lon0: -118.75, lon1: -104.6, lat0: 30.6, lat1: 34.4 };
const tigerPts = [];
for (const pp of parts) for (const [lon, lat] of pp) if (lon > BOX.lon0 && lon < BOX.lon1 && lat > BOX.lat0 && lat < BOX.lat1) tigerPts.push(toM(lon, lat));
log(`TIGER: ${[...i10names].join(' / ')} - ${parts.length} parts, ${tigerPts.length} vertices in the corridor box`);
// A rough guide (lon, lat) through places on I-10, only to order the vertices: Santa Monica .. Van Horn.
const GUIDE = [[-118.49, 34.02], [-118.24, 34.03], [-117.9, 34.07], [-117.3, 34.06], [-116.88, 33.93], [-116.5, 33.85], [-116.2, 33.72], [-115.72, 33.66], [-115.4, 33.71], [-114.6, 33.61],
  [-114.23, 33.66], [-113.5, 33.55], [-112.93, 33.5], [-112.58, 33.43], [-112.07, 33.44], [-111.95, 33.3], [-111.75, 32.9], [-111.5, 32.7], [-111.2, 32.45], [-110.97, 32.24], [-110.75, 32.08],
  [-110.29, 31.97], [-110.0, 32.06], [-109.83, 32.25], [-109.48, 32.32], [-109.1, 32.3], [-108.71, 32.35], [-108.2, 32.28], [-107.76, 32.27], [-107.2, 32.3], [-106.78, 32.31], [-106.6, 32.0],
  [-106.49, 31.77], [-106.3, 31.66], [-106.16, 31.5], [-105.86, 31.3], [-105.36, 31.17], [-104.83, 31.04]];
let guide = frame(resampleXY(GUIDE.map(([a, b]) => toM(a, b)), 500));
for (let pass = 0; pass < 3; pass++) {
  const BIN = 400, nb = Math.ceil(guide.s[guide.n - 1] / BIN) + 1, sx = new Float64Array(nb), sy = new Float64Array(nb), sn = new Float64Array(nb);
  for (const [x, y] of tigerPts) { const q = nearest(guide, x, y, 10); if (q.d > (pass ? 3000 : 12000)) continue; const b = Math.round(q.s / BIN); sx[b] += x; sy[b] += y; sn[b]++; }
  const pts = [];
  for (let b = 0; b < nb; b++) if (sn[b]) pts.push([sx[b] / sn[b], sy[b] / sn[b]]);
  guide = frame(resampleXY(smoothXY(resampleXY(pts, 200), 300), 200));
}
const RC = guide; // the real centreline, 200 m samples, local metres
log(`real I-10 centreline: ${(RC.s[RC.n - 1] / 1000).toFixed(0)} km (Santa Monica .. Van Horn)`);
const RS = frame(resampleXY(smoothXY(RC, TERRAIN.realSigma), 200)); // smoothed, for normals only
const realAnchor = (lon, lat) => nearest(RC, ...toM(lon, lat), 10).s;
const anchorsReal = { losangeles: realAnchor(-118.2437, 34.0522), phoenix: realAnchor(-112.074, 33.4484), elpaso: realAnchor(-106.4850, 31.7619) };
log('real anchors (km along I-10 from Santa Monica):', Object.fromEntries(Object.entries(anchorsReal).map(([k, v]) => [k, +(v / 1000).toFixed(1)])));
const S = pchip([anchorsGame.losangeles, anchorsGame.phoenix, anchorsGame.elpaso], [anchorsReal.losangeles, anchorsReal.phoenix, anchorsReal.elpaso]);
const sigmaW = (anchorsReal.phoenix - anchorsReal.losangeles) / (anchorsGame.phoenix - anchorsGame.losangeles), sigmaE = (anchorsReal.elpaso - anchorsReal.phoenix) / (anchorsGame.elpaso - anchorsGame.phoenix);
log(`compression: LA-Phoenix 1:${sigmaW.toFixed(2)}, Phoenix-El Paso 1:${sigmaE.toFixed(2)}`);
// The real-side normal at real arc length r: from the smoothed real line, tabulated on the real centreline's samples.
const RSnx = new Float64Array(RC.n), RSny = new Float64Array(RC.n);
for (let i = 0; i < RC.n; i++) { const q = nearest(RS, RC.x[i], RC.y[i], 10); RSnx[i] = RS.ty[q.seg]; RSny[i] = -RS.tx[q.seg]; }
const RSn = (r) => { const nx = lerpArr(RC, RSnx, Math.max(0, Math.min(RC.s[RC.n - 1], r))), ny = lerpArr(RC, RSny, Math.max(0, Math.min(RC.s[RC.n - 1], r))), l = Math.hypot(nx, ny) || 1; return [nx / l, ny / l]; };

// Nearest point on the game frame, walking from a hint (the grid is visited row by row, so the answer moves little).
function nearestHint(F, px, py, hint) {
  let i = Math.max(0, Math.min(F.n - 2, hint));
  const dist = (k) => (F.x[k] - px) ** 2 + (F.y[k] - py) ** 2;
  let d = dist(i);
  for (;;) { if (i > 0 && dist(i - 1) < d) { i--; d = dist(i); } else if (i < F.n - 1 && dist(i + 1) < d) { i++; d = dist(i); } else break; }
  let best = Infinity, bseg = 0, bt = 0;
  for (let k = Math.max(0, i - 3); k < Math.min(F.n - 1, i + 3); k++) {
    const ax = F.x[k], ay = F.y[k], dx = F.x[k + 1] - ax, dy = F.y[k + 1] - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dd = (px - ax - dx * t) ** 2 + (py - ay - dy * t) ** 2;
    if (dd < best) { best = dd; bseg = k; bt = t; }
  }
  const qx = F.x[bseg] + (F.x[bseg + 1] - F.x[bseg]) * bt, qy = F.y[bseg] + (F.y[bseg + 1] - F.y[bseg]) * bt;
  return { s: F.s[bseg] + (F.s[bseg + 1] - F.s[bseg]) * bt, d: Math.sqrt(best), side: (px - qx) * -F.ty[bseg] + (py - qy) * F.tx[bseg] >= 0 ? 1 : -1, seg: bseg };
}

// The strip map: world (x, z) -> local real metres (x east, y north).
const B = TERRAIN.band;
let _hint = -1;
function strip(x, z) {
  const q = _hint < 0 ? nearest(GF, x, z) : nearestHint(GF, x, z, _hint);
  _hint = q.seg;
  let d = q.side * q.d - lerpArr(GF, off, q.s);
  // Past the band the real country keeps coming, squashed (bandOut): no stripes, and no fold this close to the road.
  _inBand = Math.abs(d) < B; if (!_inBand) d = Math.sign(d) * (B + (Math.abs(d) - B) * TERRAIN.bandOut);
  const r = S.f(q.s), sg = S.df(q.s), p = pointAt(RC, r), nrm = RSn(r);
  return [p[0] + nrm[0] * sg * d, p[1] + nrm[1] * sg * d, r];
}

// 3. The bake rectangle in world metres and its grid.
const CELL = TERRAIN.cell;
let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
for (let i = 0; i < cl.n; i++) { bx0 = Math.min(bx0, cl.x[i]); bx1 = Math.max(bx1, cl.x[i]); bz0 = Math.min(bz0, cl.z[i]); bz1 = Math.max(bz1, cl.z[i]); }
for (const t of W.towns) if (t.built) { bx0 = Math.min(bx0, t.x); bx1 = Math.max(bx1, t.x); bz0 = Math.min(bz0, t.z); bz1 = Math.max(bz1, t.z); }
const MARGIN = 4000;
const X0 = Math.floor((bx0 - MARGIN) / 256) * 256, X1 = Math.ceil((bx1 + MARGIN) / 256) * 256, Z0 = Math.floor((bz0 - MARGIN) / 256) * 256, Z1 = Math.ceil((bz1 + MARGIN) / 256) * 256;
const NX = (X1 - X0) / CELL + 1, NZ = (Z1 - Z0) / CELL + 1, N = NX * NZ;
log(`grid: x ${X0}..${X1}, z ${Z0}..${Z1} at ${CELL} m = ${NX} x ${NZ} = ${(N / 1e6).toFixed(2)} M samples`);

// Map every sample to lon/lat (sub-samples come from the same map, bilinear between samples: it is smooth).
const LL = new Float64Array(N * 2);
let folds = 0, bandCells = 0, _inBand = false;
const inBand = new Uint8Array(N);
{
  const tm = Date.now();
  for (let j = 0; j < NZ; j++) {
    _hint = -1;
    for (let i = 0; i < NX; i++) {
      const [mx, my] = strip(X0 + i * CELL, Z0 + j * CELL), [lon, lat] = toLL(mx, my), k = j * NX + i;
      LL[k * 2] = lon; LL[k * 2 + 1] = lat; inBand[k] = _inBand ? 1 : 0;
    }
    if (j % 100 === 0) process.stdout.write(`\r[bake] strip map ${j}/${NZ} rows (${((Date.now() - tm) / 1000).toFixed(0)} s)   `);
  }
  process.stdout.write('\n');
  // Folds: where the map turns a world cell inside out (its Jacobian's sign flips). World +x is east and +z is south, so a
  // proper map has d(lon)/dx * d(lat)/dz - d(lat)/dx * d(lon)/dz < 0.
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const k = j * NX + i, ax = LL[k * 2], ay = LL[k * 2 + 1];
    const det = (LL[(k + 1) * 2] - ax) * (LL[(k + NX) * 2 + 1] - ay) - (LL[(k + 1) * 2 + 1] - ay) * (LL[(k + NX) * 2] - ax);
    if (!inBand[k] || !inBand[k + 1] || !inBand[k + NX]) continue;
    bandCells++; if (det > 0) folds++;
  }
  log(`strip map: ${folds} folded cells of ${bandCells} inside the band (${((folds / bandCells) * 100).toFixed(3)}%)`);
}
// lon/lat at fractional grid coordinates (fi, fj), bilinear between samples.
const llAt = (fi, fj) => {
  fi = Math.max(0, Math.min(NX - 1.0001, fi)); fj = Math.max(0, Math.min(NZ - 1.0001, fj));
  const i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, tz = fj - j, k = j * NX + i, o = [0, 0];
  for (let c = 0; c < 2; c++) o[c] = (LL[k * 2 + c] * (1 - tx) + LL[(k + 1) * 2 + c] * tx) * (1 - tz) + (LL[(k + NX) * 2 + c] * (1 - tx) + LL[(k + NX + 1) * 2 + c] * tx) * tz;
  return o;
};
const SUB = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];

// 4. Elevation: Terrarium tiles at demZoom, bilinear in pixel space, averaged over the 4 sub-samples.
const Z = TERRAIN.demZoom, TS = 256, WORLDPX = TS * 2 ** Z;
const pxOf = (lon, lat) => { const s = Math.sin((lat * Math.PI) / 180); return [((lon + 180) / 360) * WORLDPX, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLDPX]; };
const need = new Set();
for (let k = 0; k < N; k++) {
  const [px, py] = pxOf(LL[k * 2], LL[k * 2 + 1]);
  for (const [ox, oy] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) need.add(`${Math.floor((px + ox) / TS)}/${Math.floor((py + oy) / TS)}`);
}
log(`elevation: ${need.size} Terrarium tiles at z${Z}`);
const tiles = new Map();
{
  let done = 0;
  await pool([...need], 8, async (key) => {
    const [tx, ty] = key.split('/').map(Number);
    const b = await cached('terrarium', `terrarium/${Z}/${tx}/${ty}.png`, SOURCES.terrarium.url.replace('{z}', Z).replace('{x}', tx).replace('{y}', ty));
    const png = decodePNG(b), e = new Float32Array(TS * TS);
    for (let p = 0; p < TS * TS; p++) e[p] = png.rgba[p * 4] * 256 + png.rgba[p * 4 + 1] + png.rgba[p * 4 + 2] / 256 - 32768;
    tiles.set(key, e);
    if (++done % 25 === 0) process.stdout.write(`\r[bake] tiles ${done}/${need.size}   `);
  });
  process.stdout.write('\n');
}
const demPx = (X, Y) => { const t = tiles.get(`${Math.floor(X / TS)}/${Math.floor(Y / TS)}`); return t[(Y % TS) * TS + (X % TS)]; };
const dem = (lon, lat) => {
  const [px, py] = pxOf(lon, lat), fx = px - 0.5, fy = py - 0.5, X = Math.floor(fx), Y = Math.floor(fy), tx = fx - X, ty = fy - Y;
  return (demPx(X, Y) * (1 - tx) + demPx(X + 1, Y) * tx) * (1 - ty) + (demPx(X, Y + 1) * (1 - tx) + demPx(X + 1, Y + 1) * tx) * ty;
};
const E = new Float64Array(N);
// The tiles carry sea-floor depths offshore: the land stops at SEA_FLOOR, the bottom of the Salton basin (the lowest dry
// ground in reach), or Santa Monica Bay would pull Los Angeles 500 m under the sea through the grade.
const SEA_FLOOR = -75;
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { let s = 0; for (const [a, b] of SUB) { const [lon, lat] = llAt(i + a, j + b); s += dem(lon, lat); } E[j * NX + i] = Math.max(SEA_FLOOR, s / 4); }

// 5. Landcover: NLCD 2021 from MRLC's WMS in 1-degree blocks (~90 m a pixel), majority of a 5 x 5 patch at each sample.
// The class colours as MRLC's WMS paints them (read from its PNG palette; f9f9f9 is its unclassified fill).
const NLCD_PAL = { 11: '476ba0', 12: 'd1ddf9', 21: 'ddc9c9', 22: 'd89382', 23: 'ed0000', 24: 'aa0000', 31: 'b2ada3', 41: '68aa63', 42: '1c6330', 43: 'b5c98e', 51: 'b0973d', 52: 'ccba7c', 71: 'e2e2c1', 72: 'd1d182', 73: '99c246', 74: '82ba9e', 81: 'dbd83d', 82: 'aa7028', 90: 'bad8ea', 95: '70a3ba' };
const palRGB = Object.entries(NLCD_PAL).map(([c, h]) => [+c, parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
const colorClass = (r, g, b, a) => { if (a < 128) return 0; let best = 0, bd = 1e9; for (const [c, R, G, Bc] of palRGB) { const d = (r - R) ** 2 + (g - G) ** 2 + (b - Bc) ** 2; if (d < bd) { bd = d; best = c; } } return bd <= 300 ? best : 0; };
const BLK = 1024, blocks = new Map();
const blockNeed = new Set();
for (let k = 0; k < N; k++) blockNeed.add(`${Math.floor(LL[k * 2])}/${Math.floor(LL[k * 2 + 1])}`);
log(`landcover: ${blockNeed.size} NLCD blocks (1 x 1 degree, ${BLK} px)`);
let nlcdExact = 0, nlcdNear = 0, nlcdNone = 0;
await pool([...blockNeed], 4, async (key) => {
  const [lo, la] = key.split('/').map(Number);
  const url = `${SOURCES.nlcd.url}?service=WMS&version=1.1.1&request=GetMap&layers=NLCD_2021_Land_Cover_L48&styles=&format=image/png&transparent=true&srs=EPSG:4326&bbox=${lo},${la},${lo + 1},${la + 1}&width=${BLK}&height=${BLK}`;
  const b = await cached('nlcd', `nlcd/2021_${lo}_${la}_${BLK}.png`, url);
  const png = decodePNG(b), cls = new Uint8Array(BLK * BLK);
  for (let p = 0; p < BLK * BLK; p++) {
    const r = png.rgba[p * 4], g = png.rgba[p * 4 + 1], bb = png.rgba[p * 4 + 2], a = png.rgba[p * 4 + 3];
    cls[p] = colorClass(r, g, bb, a);
    if (!cls[p]) nlcdNone++; else if (NLCD_PAL[cls[p]] === ((r << 16) | (g << 8) | bb).toString(16).padStart(6, '0')) nlcdExact++; else nlcdNear++;
  }
  blocks.set(key, cls);
});
log(`landcover pixels: ${nlcdExact} exact palette, ${nlcdNear} nearest-colour, ${nlcdNone} no data`);
const nlcdAt = (lon, lat) => {
  const lo = Math.floor(lon), la = Math.floor(lat), blk = blocks.get(`${lo}/${la}`);
  if (!blk) return 0;
  const px = Math.floor((lon - lo) * BLK), py = Math.floor((la + 1 - lat) * BLK), hist = new Map();
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = Math.min(BLK - 1, Math.max(0, px + dx)), y = Math.min(BLK - 1, Math.max(0, py + dy)), c = blk[y * BLK + x];
    if (c) hist.set(c, (hist.get(c) ?? 0) + 1);
  }
  let best = 0, bn = 0; for (const [c, k] of hist) if (k > bn) { bn = k; best = c; }
  return best;
};

// 6. The land: real metres, then THE GRADE. The land is U, the highest surface that never stands above the real land
// and is never steeper than g: U(p) = min over q of E(q) + g |p - q| (two chamfer passes, 16 neighbours: within 2.6% of
// true distance). Valleys and basins, where the roads run, keep their real height; mountains are cut down to cones of
// grade g; a regional climb steeper than g (out of the Coachella valley to Banning) is lowered on its high side. Then
// blurPasses 3 x 3 binomial blurs (a positive kernel keeps the bound) round the creases into curves (the chamfer leaves
// its cones' ridges along the grid axes; four passes soften them over about 100 m).
// (The midpoint of U and the lower envelope L was tried first: L lets one distant peak lift the land for tens of km,
// and Phoenix came out 680 m above its real height.)
const g = TERRAIN.g;
const NB = []; for (let dz = -2; dz <= 0; dz++) for (let dx = -2; dx <= 2; dx++) { if (dz === 0 && dx >= 0) continue; if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue; if ((Math.abs(dx) === 2 && dz === 0) || (dx === 0 && dz === -2)) continue; NB.push([dx, dz, Math.hypot(dx, dz) * CELL * g]); }
function envelope(src, sign) { // sign +1: U (min of e + g d); -1: L (max of e - g d)
  const u = Float64Array.from(src);
  for (const dir of [1, -1]) {
    for (let jj = 0; jj < NZ; jj++) {
      const j = dir > 0 ? jj : NZ - 1 - jj;
      for (let ii = 0; ii < NX; ii++) {
        const i = dir > 0 ? ii : NX - 1 - ii, k = j * NX + i;
        let v = u[k];
        for (const [dx0, dz0, w] of NB) {
          const x = i + dx0 * dir, z = j + dz0 * dir;
          if (x < 0 || z < 0 || x >= NX || z >= NZ) continue;
          const c = u[z * NX + x] + sign * w;
          if (sign > 0 ? c < v : c > v) v = c;
        }
        u[k] = v;
      }
    }
  }
  return u;
}
let land = envelope(E, 1);
let moved = 0, movedMax = 0;
for (let k = 0; k < N; k++) { const d = Math.abs(land[k] - E[k]); moved += d; if (d > movedMax) movedMax = d; }
for (let pass = 0; pass < TERRAIN.blurPasses; pass++) {
  const b = new Float64Array(N);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    let s = 0, w = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const x = Math.min(NX - 1, Math.max(0, i + dx)), z = Math.min(NZ - 1, Math.max(0, j + dz)), ww = (2 - Math.abs(dx)) * (2 - Math.abs(dz)); s += land[z * NX + x] * ww; w += ww; }
    b[j * NX + i] = s / w;
  }
  land = b;
}
// The datum: Phoenix (world 0,0) is 0, as the island always was.
const iP = Math.round(-X0 / CELL), jP = Math.round(-Z0 / CELL), datum = land[jP * NX + iP];
for (let k = 0; k < N; k++) land[k] -= datum;
let gmax = 0; for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) { const k = j * NX + i; gmax = Math.max(gmax, Math.hypot(land[k + 1] - land[k], land[k + NX] - land[k]) / CELL); }
log(`land: datum ${datum.toFixed(1)} m (Phoenix), moved by the grade mean ${(moved / N).toFixed(1)} m, max ${movedMax.toFixed(0)} m; steepest cell ${(gmax * 100).toFixed(1)}%`);

// 7. Biomes: landcover to our letters; steep real country reads as mountains, high scrub as scrubland.
const BIO = Object.fromEntries(BIOME_CODES.map((c, i) => [c, i]));
const biome = new Uint8Array(N).fill(255);
const counts = {};
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
  const k = j * NX + i, c = nlcdAt(LL[k * 2], LL[k * 2 + 1]);
  // Real local relief: the raw elevation's spread over the 3 x 3 neighbourhood (~1.4 km of real country).
  let lo = Infinity, hi = -Infinity;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const x = Math.min(NX - 1, Math.max(0, i + dx)), z = Math.min(NZ - 1, Math.max(0, j + dz)), e = E[z * NX + x]; if (e < lo) lo = e; if (e > hi) hi = e; }
  const rough = hi - lo;
  let L = null;
  if (c === 11 || c === 90 || c === 95) L = 'w';
  else if (c >= 21 && c <= 24) L = 'u';
  else if (c === 81 || c === 82) L = 'a';
  else if (c >= 41 && c <= 43) L = 'F';
  else if (c === 71 || c === 72) L = 'p';
  else if (c === 31 || c === 52 || c === 51 || c === 12) L = rough > 220 ? 'm' : c === 52 && E[k] > 1100 ? 'f' : 'd';
  if (L) { biome[k] = BIO[L]; counts[L] = (counts[L] ?? 0) + 1; } else counts.none = (counts.none ?? 0) + 1;
}
log('biomes:', Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, `${((v / N) * 100).toFixed(1)}%`])));

// 8. The asset.
const hU = TERRAIN.hUnit;
const payload = Buffer.alloc(N * 3);
for (let j = 0; j < NZ; j++) { let prev = 0; for (let i = 0; i < NX; i++) { const k = j * NX + i, v = Math.round(land[k] / hU); payload.writeInt16LE(v - prev, k * 2); prev = v; } }
Buffer.from(biome.buffer).copy(payload, N * 2);
const gz = gzipSync(payload, { level: 9 });
const fetchedNow = Object.values(ledger).reduce((s, l) => s + l.fetchedNow, 0);
const header = {
  name: 'I-10 Los Angeles - Phoenix - El Paso', version: 1, created: new Date().toISOString().slice(0, 10),
  x0: X0, z0: Z0, cell: CELL, nx: NX, nz: NZ, hUnit: hU, datum: +datum.toFixed(2), g, K: STREAM.K, dataHash: W.dataHash,
  mapping: { kind: 'strip', anchors: Object.keys(anchorsGame).map((k) => ({ town: k, sGame: Math.round(anchorsGame[k]), rReal: Math.round(anchorsReal[k]) })), sigmaW: +sigmaW.toFixed(3), sigmaE: +sigmaE.toFixed(3), band: B, frameSigma: TERRAIN.frameSigma, realSigma: TERRAIN.realSigma, folds },
  biomeCodes: BIOME_CODES,
  sources: Object.entries(SOURCES).map(([k, s]) => ({ id: k, name: s.name, url: s.url, licence: s.licence, attribution: s.attribution, files: ledger[k].files, bytes: ledger[k].bytes })),
};
const hb = Buffer.from(JSON.stringify(header));
const head = Buffer.alloc(12); head.write(TERRAIN_MAGIC, 0, 'latin1'); head.writeUInt32LE(hb.length, 8);
const asset = Buffer.concat([head, hb, gz]);
writeFileSync(OUT, asset);
saveManifest();
log(`wrote ${OUT.replace(WEB, '')}: ${(asset.length / 1048576).toFixed(2)} MB (raw ${(payload.length / 1048576).toFixed(1)} MB)`);
for (const [k, l] of Object.entries(ledger)) log(`source ${k}: ${l.files} files, ${(l.bytes / 1048576).toFixed(1)} MB used, ${(l.fetchedNow / 1048576).toFixed(1)} MB fetched this run`);

// 9. The profile: the real I-10 (the DEM along the real centreline) against ours (the land under our road and the
// surveyed road itself, in real metres), both by real miles from downtown Los Angeles. Written as JSON and an SVG chart.
{
  const dec = await decodeTerrain(asset, async (b) => new Uint8Array(gunzipSync(b)));
  const RT = new RealTerrain(dec, W);
  const MI = 1609.344, rows = [];
  for (let r = anchorsReal.losangeles; r <= anchorsReal.elpaso + 60000; r += 1000) { const [mx, my] = pointAt(RC, r), [lon, lat] = toLL(mx, my); rows.push({ mi: (r - anchorsReal.losangeles) / MI, real: dem(lon, lat) }); }
  const ours = [];
  for (let i = 0; i < cl.n; i += 25) {
    const q = nearest(GF, cl.x[i], cl.z[i]), r = S.f(q.s);
    if (r < anchorsReal.losangeles || r > anchorsReal.elpaso + 60000) continue;
    ours.push({ mi: (r - anchorsReal.losangeles) / MI, gameMi: cl.s[i] / STREAM.mile, land: RT.landAt(cl.x[i], cl.z[i]) + datum, road: RT.yr[i] + datum, x: Math.round(cl.x[i]), z: Math.round(cl.z[i]) });
  }
  writeFileSync(join(RENDERS, 'i10-profile.json'), JSON.stringify({ datum, real: rows.map((r) => [+r.mi.toFixed(2), +r.real.toFixed(1)]), ours: ours.map((o) => [+o.mi.toFixed(2), +o.gameMi.toFixed(2), +o.land.toFixed(1), +o.road.toFixed(1), o.x, o.z]), survey: RT.stats, pinned: RT.pinned }));
  // The chart.
  const Wd = 1400, Ht = 560, L = 70, R = 30, T = 50, Bt = 100, maxMi = rows[rows.length - 1].mi;
  const all = [...rows.map((r) => r.real), ...ours.map((o) => o.road), ...ours.map((o) => o.land)], ymin = Math.floor(Math.min(...all) / 200) * 200 - 0, ymax = Math.ceil(Math.max(...all) / 200) * 200;
  const X = (mi) => L + (mi / maxMi) * (Wd - L - R), Y = (h) => T + (1 - (h - ymin) / (ymax - ymin)) * (Ht - T - Bt);
  const path = (arr, fx, fy) => arr.map((p, i) => `${i ? 'L' : 'M'}${X(fx(p)).toFixed(1)},${Y(fy(p)).toFixed(1)}`).join('');
  const marks = [['Los Angeles', 0], ['Phoenix', (anchorsReal.phoenix - anchorsReal.losangeles) / MI], ['El Paso', (anchorsReal.elpaso - anchorsReal.losangeles) / MI]];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Ht}" viewBox="0 0 ${Wd} ${Ht}" font-family="Inter, system-ui, sans-serif">`;
  svg += `<rect width="100%" height="100%" fill="#1b1714"/>`;
  svg += `<text x="${L}" y="28" fill="#f2ece0" font-size="18" font-weight="600">I-10 elevation profile: the real road against the game's (Los Angeles to past El Paso)</text>`;
  for (let h = ymin; h <= ymax; h += 200) svg += `<line x1="${L}" x2="${Wd - R}" y1="${Y(h)}" y2="${Y(h)}" stroke="#3a322b"/><text x="${L - 8}" y="${Y(h) + 4}" fill="#a89a88" font-size="12" text-anchor="end">${h} m</text>`;
  for (let mi = 0; mi <= maxMi; mi += 50) svg += `<line x1="${X(mi)}" x2="${X(mi)}" y1="${T}" y2="${Ht - Bt}" stroke="#2c2621"/><text x="${X(mi)}" y="${Ht - Bt + 18}" fill="#a89a88" font-size="12" text-anchor="middle">${mi}</text>`;
  svg += `<text x="${(L + Wd - R) / 2}" y="${Ht - Bt + 40}" fill="#a89a88" font-size="13" text-anchor="middle">real miles along I-10 from downtown Los Angeles (the game drives the same road compressed 1:${sigmaW.toFixed(1)} west of Phoenix, 1:${sigmaE.toFixed(1)} east)</text>`;
  for (const [nm, mi] of marks) svg += `<line x1="${X(mi)}" x2="${X(mi)}" y1="${T}" y2="${Ht - Bt}" stroke="#6a5a48" stroke-dasharray="4 4"/><text x="${X(mi) + 4}" y="${T + 14}" fill="#d8c8b0" font-size="12">${nm}</text>`;
  svg += `<path d="${path(rows, (r) => r.mi, (r) => r.real)}" fill="none" stroke="#e8a33c" stroke-width="2"/>`;
  svg += `<path d="${path(ours, (o) => o.mi, (o) => o.land)}" fill="none" stroke="#7fa36a" stroke-width="1.5" opacity="0.8"/>`;
  svg += `<path d="${path(ours, (o) => o.mi, (o) => o.road)}" fill="none" stroke="#e8e2cc" stroke-width="2"/>`;
  const lg = [['#e8a33c', 'real I-10 (USGS DEM along the TIGER centreline)'], ['#7fa36a', 'game land under the road (grade-limited to ' + Math.round(g * 100) + '%)'], ['#e8e2cc', 'game road (surveyed, max grade ' + (RT.stats.maxGrade * 100).toFixed(1) + '%)']];
  lg.forEach(([c, t], i) => { svg += `<rect x="${L + 10 + i * 430}" y="${Ht - 26}" width="18" height="4" fill="${c}"/><text x="${L + 34 + i * 430}" y="${Ht - 20}" fill="#d8c8b0" font-size="12">${t}</text>`; });
  svg += '</svg>';
  writeFileSync(join(RENDERS, 'i10-profile.svg'), svg);
  // Agreement: the game road against the real road at the same real mile.
  const realAt = (mi) => { const fk = (mi * MI) / 1000, i = Math.min(rows.length - 2, Math.max(0, Math.floor(fk))), f = Math.min(1, Math.max(0, fk - i)); return rows[i].real + (rows[i + 1].real - rows[i].real) * f; };
  const errs = ours.map((o) => o.road - realAt(o.mi));
  const mae = errs.reduce((s, e) => s + Math.abs(e), 0) / errs.length, emax = Math.max(...errs.map(Math.abs));
  log(`profile: game road vs real I-10, mean |diff| ${mae.toFixed(0)} m, max ${emax.toFixed(0)} m; survey ${JSON.stringify(RT.stats)}`);
}
log(`done in ${((Date.now() - t00) / 1000).toFixed(0)} s`);
