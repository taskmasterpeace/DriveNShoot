// THE STRIP MAP as a module (docs/design/WEB_TERRAIN.md §3.1, T1), for tools that place real geography in our world.
// tools/terrain-bake.mjs builds the same map inline (world -> real, every bake sample); this module rebuilds it from the
// same inputs with the same maths and adds the INVERSE (real lon/lat -> world x, z), which tools/water-bake.mjs needs to
// lay real rivers onto the corridor. It must agree with the baked terrain asset's header (anchors, compression): the
// water bake checks that before it writes anything.
//
//   const M = buildStripMap({ W, TERRAIN, tigerZip })   W: the engine's own WorldIndex (so the map and the game agree)
//   M.strip(x, z)          -> [mx, my, r]      local real metres (x east, y north) and real arc length along I-10
//   M.toWorld(lon, lat)    -> { x, z, s, d, r, inBand } or null (off the ends of the real road)
//   M.toLL / M.toM         local metric frame <-> lon/lat (equirectangular about 32.6 N, 112 W, as the bake)
import { inflateRawSync } from 'node:zlib';

const RE = 6371008.8, LAT0 = 32.6, LON0 = -112, KX = (Math.PI / 180) * RE * Math.cos((LAT0 * Math.PI) / 180), KY = (Math.PI / 180) * RE;
export const toM = (lon, lat) => [(lon - LON0) * KX, (lat - LAT0) * KY];
export const toLL = (x, y) => [x / KX + LON0, y / KY + LAT0];

// ---- ZIP and shapefile readers (as the terrain bake) ------------------------------------------------------------------
export function unzip(buf) {
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
export function readDBF(b, field) {
  const n = b.readUInt32LE(4), hl = b.readUInt16LE(8), rl = b.readUInt16LE(10);
  let off = 1, fo = -1, flen = 0;
  for (let p = 32; b[p] !== 0x0d; p += 32) { const nm = b.toString('latin1', p, p + 11).replace(/\0.*$/, ''), len = b[p + 16]; if (nm === field) { fo = off; flen = len; } off += len; }
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = b.toString('latin1', hl + i * rl + fo, hl + i * rl + fo + flen).trim();
  return out;
}
export function readSHP(b, keep) {
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

// ---- polylines (as the terrain bake) ------------------------------------------------------------------------------------
export function resampleXY(pts, step) {
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
export function smoothXY(c, sigma) {
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
export function frame(c) {
  const n = c.n, tx = new Float64Array(n), ty = new Float64Array(n);
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = c.x[b] - c.x[a], dy = c.y[b] - c.y[a], l = Math.hypot(dx, dy) || 1; tx[i] = dx / l; ty[i] = dy / l; }
  return { ...c, tx, ty };
}
export function nearest(F, px, py, coarse = 20) {
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
  return { s: bs, d: Math.sqrt(best), side: (px - qx) * (-F.ty[bseg]) + (py - qy) * F.tx[bseg] >= 0 ? 1 : -1, seg: bseg, t: bt };
}
export const lerpArr = (F, arr, s) => { const step = F.s[1] - F.s[0]; let i = Math.floor(s / step); if (i < 0) i = 0; if (i > F.n - 2) i = F.n - 2; const f = (s - F.s[i]) / step; return arr[i] + (arr[i + 1] - arr[i]) * f; };
export const pointAt = (F, s) => { const L = F.s[F.n - 1]; if (s < 0) return [F.x[0] + F.tx[0] * s, F.y[0] + F.ty[0] * s]; if (s > L) return [F.x[F.n - 1] + F.tx[F.n - 1] * (s - L), F.y[F.n - 1] + F.ty[F.n - 1] * (s - L)]; return [lerpArr(F, F.x, s), lerpArr(F, F.y, s)]; };
export function pchip(xs, ys) {
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
  // The inverse of a monotone map: bisection (f is increasing).
  const inv = (y) => { let a = xs[0] - 1e6, b = xs[n - 1] + 1e6; for (let k = 0; k < 80; k++) { const c = (a + b) / 2; if (f(c) < y) a = c; else b = c; } return (a + b) / 2; };
  return { f, df, inv };
}

// The real I-10 guide (lon, lat), as the terrain bake: only to order TIGER's vertices, Santa Monica .. Van Horn.
const GUIDE = [[-118.49, 34.02], [-118.24, 34.03], [-117.9, 34.07], [-117.3, 34.06], [-116.88, 33.93], [-116.5, 33.85], [-116.2, 33.72], [-115.72, 33.66], [-115.4, 33.71], [-114.6, 33.61],
  [-114.23, 33.66], [-113.5, 33.55], [-112.93, 33.5], [-112.58, 33.43], [-112.07, 33.44], [-111.95, 33.3], [-111.75, 32.9], [-111.5, 32.7], [-111.2, 32.45], [-110.97, 32.24], [-110.75, 32.08],
  [-110.29, 31.97], [-110.0, 32.06], [-109.83, 32.25], [-109.48, 32.32], [-109.1, 32.3], [-108.71, 32.35], [-108.2, 32.28], [-107.76, 32.27], [-107.2, 32.3], [-106.78, 32.31], [-106.6, 32.0],
  [-106.49, 31.77], [-106.3, 31.66], [-106.16, 31.5], [-105.86, 31.3], [-105.36, 31.17], [-104.83, 31.04]];
const BOX = { lon0: -118.75, lon1: -104.6, lat0: 30.6, lat1: 34.4 };

export function buildStripMap({ W, TERRAIN, tigerZip, log = () => {} }) {
  const cl = W.cl;
  // 1. The game frame (as the bake): the centreline extended 20 km past both ends, smoothed by frameSigma.
  const gameXY = [];
  for (let i = 0; i < cl.n; i++) gameXY.push([cl.x[i], cl.z[i]]);
  const ext = 20000, t0v = [cl.x[1] - cl.x[0], cl.z[1] - cl.z[0]], t1v = [cl.x[cl.n - 1] - cl.x[cl.n - 2], cl.z[cl.n - 1] - cl.z[cl.n - 2]];
  const n0 = Math.hypot(...t0v), n1 = Math.hypot(...t1v);
  gameXY.unshift([cl.x[0] - (t0v[0] / n0) * ext, cl.z[0] - (t0v[1] / n0) * ext]);
  gameXY.push([cl.x[cl.n - 1] + (t1v[0] / n1) * ext, cl.z[cl.n - 1] + (t1v[1] / n1) * ext]);
  const GF = frame(resampleXY(smoothXY(resampleXY(gameXY, 25), TERRAIN.frameSigma), 25));
  const offS = new Float64Array(GF.n), offW = new Float64Array(GF.n);
  for (let i = 0; i < cl.n; i += 2) {
    const q = nearest(GF, cl.x[i], cl.z[i]), k = Math.round(q.s / (GF.s[1] - GF.s[0]));
    if (k >= 0 && k < GF.n) { offS[k] += q.side * q.d; offW[k]++; }
  }
  const off = new Float64Array(GF.n);
  { const known = []; for (let i = 0; i < GF.n; i++) if (offW[i]) known.push(i);
    for (let i = 0; i < GF.n; i++) {
      let a = known.findLast((k) => k <= i) ?? null; let b = known.find((k) => k >= i) ?? null;
      if (a === null) a = b; if (b === null) b = a;
      off[i] = a === b ? offS[a] / offW[a] : offS[a] / offW[a] + ((offS[b] / offW[b] - offS[a] / offW[a]) * (i - a)) / (b - a);
    } }
  const gameS = (name) => { const t = W.towns.find((x) => x.id === name); return nearest(GF, t.x, t.z).s; };
  const anchorsGame = { losangeles: gameS('losangeles'), phoenix: nearest(GF, 0, 0).s, elpaso: gameS('elpaso') };

  // 2. The real I-10 from TIGER (as the bake).
  const zf = unzip(tigerZip);
  const shpName = Object.keys(zf).find((k) => k.endsWith('.shp')), dbfName = Object.keys(zf).find((k) => k.endsWith('.dbf'));
  const names = readDBF(zf[dbfName], 'FULLNAME');
  const i10names = new Set(names.filter((s) => /^I- ?10$/.test(s)));
  const parts = readSHP(zf[shpName], (r) => i10names.has(names[r]));
  const tigerPts = [];
  for (const pp of parts) for (const [lon, lat] of pp) if (lon > BOX.lon0 && lon < BOX.lon1 && lat > BOX.lat0 && lat < BOX.lat1) tigerPts.push(toM(lon, lat));
  let guide = frame(resampleXY(GUIDE.map(([a, b]) => toM(a, b)), 500));
  for (let pass = 0; pass < 3; pass++) {
    const BIN = 400, nb = Math.ceil(guide.s[guide.n - 1] / BIN) + 1, sx = new Float64Array(nb), sy = new Float64Array(nb), sn = new Float64Array(nb);
    for (const [x, y] of tigerPts) { const q = nearest(guide, x, y, 10); if (q.d > (pass ? 3000 : 12000)) continue; const b = Math.round(q.s / BIN); sx[b] += x; sy[b] += y; sn[b]++; }
    const pts = [];
    for (let b = 0; b < nb; b++) if (sn[b]) pts.push([sx[b] / sn[b], sy[b] / sn[b]]);
    guide = frame(resampleXY(smoothXY(resampleXY(pts, 200), 300), 200));
  }
  const RC = guide;
  const RS = frame(resampleXY(smoothXY(RC, TERRAIN.realSigma), 200));
  const realAnchor = (lon, lat) => nearest(RC, ...toM(lon, lat), 10).s;
  const anchorsReal = { losangeles: realAnchor(-118.2437, 34.0522), phoenix: realAnchor(-112.074, 33.4484), elpaso: realAnchor(-106.4850, 31.7619) };
  const S = pchip([anchorsGame.losangeles, anchorsGame.phoenix, anchorsGame.elpaso], [anchorsReal.losangeles, anchorsReal.phoenix, anchorsReal.elpaso]);
  const RSnx = new Float64Array(RC.n), RSny = new Float64Array(RC.n);
  for (let i = 0; i < RC.n; i++) { const q = nearest(RS, RC.x[i], RC.y[i], 10); RSnx[i] = RS.ty[q.seg]; RSny[i] = -RS.tx[q.seg]; }
  const RLen = RC.s[RC.n - 1];
  const RSn = (r) => { const nx = lerpArr(RC, RSnx, Math.max(0, Math.min(RLen, r))), ny = lerpArr(RC, RSny, Math.max(0, Math.min(RLen, r))), l = Math.hypot(nx, ny) || 1; return [nx / l, ny / l]; };
  const B = TERRAIN.band, bandOut = TERRAIN.bandOut;
  log(`strip map: game anchors ${Object.values(anchorsGame).map(Math.round).join('/')}, real ${Object.values(anchorsReal).map(Math.round).join('/')}`);

  // Forward (world -> real), exactly the bake's strip().
  function strip(x, z) {
    const q = nearest(GF, x, z);
    let d = q.side * q.d - lerpArr(GF, off, q.s);
    const inBand = Math.abs(d) < B;
    if (!inBand) d = Math.sign(d) * (B + (Math.abs(d) - B) * bandOut);
    const r = S.f(q.s), sg = S.df(q.s), p = pointAt(RC, r), nrm = RSn(r);
    return [p[0] + nrm[0] * sg * d, p[1] + nrm[1] * sg * d, r, inBand];
  }
  // Inverse (real -> world). A real point P = RC(r) + RSn(r) * D. Solve for r: the residual (P - RC(r)) must be along the
  // smoothed normal there, so its component along the normal's perpendicular is zero (a 1-D root; bracket it about the
  // nearest point on RC, then bisect). Then s = S^-1(r), d' = D / sigma(s) (un-squashed past the band), d = d' + off(s),
  // and the world point is the game frame at s plus its right normal times d.
  function toWorld(lon, lat) {
    const [px, py] = toM(lon, lat);
    const q = nearest(RC, px, py, 10);
    const res = (r) => { const c = pointAt(RC, r), nrm = RSn(r); return (px - c[0]) * -nrm[1] + (py - c[1]) * nrm[0]; }; // along the normal's perpendicular
    let a = q.s - 4000, b = q.s + 4000, fa = res(a), fb = res(b), grow = 0;
    while (fa * fb > 0 && grow < 12) { a -= 4000; b += 4000; fa = res(a); fb = res(b); grow++; }
    if (fa * fb > 0) return null;
    for (let k = 0; k < 60; k++) { const c = (a + b) / 2, fc = res(c); if (fa * fc <= 0) { b = c; fb = fc; } else { a = c; fa = fc; } }
    const r = (a + b) / 2;
    if (r < -50000 || r > RLen + 50000) return null;
    const c = pointAt(RC, r), nrm = RSn(r), D = (px - c[0]) * nrm[0] + (py - c[1]) * nrm[1];
    const s = S.inv(r), sg = S.df(s);
    let dp = D / sg;
    const inBand = Math.abs(dp) < B;
    if (!inBand) dp = Math.sign(dp) * (B + (Math.abs(dp) - B) / bandOut);
    const d = dp + lerpArr(GF, off, s);
    const g = pointAt(GF, s), tx = lerpArr(GF, GF.tx, s), tz = lerpArr(GF, GF.ty, s), tl = Math.hypot(tx, tz) || 1;
    return { x: g[0] + (-tz / tl) * d, z: g[1] + (tx / tl) * d, s, d, r, inBand };
  }
  return { GF, off, RC, RS, S, anchorsGame, anchorsReal, sigmaW: (anchorsReal.phoenix - anchorsReal.losangeles) / (anchorsGame.phoenix - anchorsGame.losangeles), sigmaE: (anchorsReal.elpaso - anchorsReal.phoenix) / (anchorsGame.elpaso - anchorsGame.phoenix), strip, toWorld, toLL, toM };
}
