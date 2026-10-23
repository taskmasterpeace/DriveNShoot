// THE ROADSIDE (docs/design/WEB_ROADSIDE.md; rows in data/roadside.js): power lines, billboards, gas stations, junkyards,
// farm belts and the dam, laid out once at boot as a pure function of the rows, the seed and the roads they stand by.
// To the chunk generator it is a "towner" like the Phoenix ring and Meridian (world/chunkgen.js asks every towner the
// same questions: touches, streets, blocksOver/pads, around, geo, wrecks, railIn, extras), so:
//   lots     - a station's kiosk, a junkyard's office and a farmhouse are walk-in planned buildings through the ring's own
//              geo() (world/ring.js: shells, doors, windows, floor plans, furniture, containers with loot, beds)
//   extras   - everything else as instance records owned by the chunk holding their centre (pylons, conductors, billboard
//              faces in their own atlas, canopies, hulks, crop rows, silos, the dam's works) and collision boxes clipped
//              into every chunk they reach
//   roads    - the dam road is a ribbon with a fill under it (an earth dam is a fill with a road on top): it joins
//              WorldIndex's ribbons, pieces and rails before they are bucketed, so the chunk generator draws it, the
//              relief carries cars up onto the crest and the guardrails stop them going off it
//   spots    - what systems/roadside.js lets you work: a tank's fill caps, a hulk, the dam's gate wheel, a stock tank
// Nothing is placed in a pinned P1 chunk or on the island (validateRoadside says so by name). Everything axis-aligned that
// collides; drawn things may turn. Never purple.
import { ROADSIDE_RULES as RR, CROPS, POWER_LINES, BILLBOARDS, SITES, ADVERTS } from '../data/roadside.js';
import { KINDS } from '../data/ring.js';
import { STREAM } from '../data/streaming.js';
import { C, hash32, rngOf, chunkOf, inIsland } from './geo.js';
import { regionWater } from './regions.js';

const TAU = Math.PI * 2;
const idHash = (s) => hash32(...[...s].map((c) => c.charCodeAt(0)));
const WRECK = ['#5a3a24', '#4a3020', '#6b4a2e', '#3d3a36', '#704020', '#4f5a52', '#6a5a3a', '#7a6a4a', '#5a5a50'];
const RUST = ['#7a4a2a', '#6a3e22', '#8a5a34', '#5e4a3a', '#7e6a52', '#6a6258'];
const STEEL = '#5e5a54', CONCRETE = '#a49d90', CONCRETE_D = '#857e72';
// The billboard atlas's grid (world/roadside-art.js paints it; the rects are pure arithmetic so a layout never needs the canvas).
export const BILL_COLS = 4, BILL_SW = 384, BILL_SH = 128;
export const faceRect = (i, n) => { const rows = Math.max(1, Math.ceil(n / BILL_COLS)), col = i % BILL_COLS, row = Math.floor(i / BILL_COLS); return [col / BILL_COLS, 1 - (row + 1) / rows, 1 / BILL_COLS, 1 / rows]; };

// A road ribbon in WorldIndex's shape (world/worldindex.js ribbon()): centreline, heights, half-widths, bounds.
function makeRibbon(id, kind, band, pts, opts = {}) {
  const n = pts.length, x = new Float64Array(n), z = new Float64Array(n), y = new Float64Array(n), s = new Float64Array(n), wl = new Float64Array(n), wr = new Float64Array(n);
  for (let i = 0; i < n; i++) { const p = pts[i]; x[i] = p.x; z[i] = p.z; y[i] = p.y ?? 0; wl[i] = p.wl ?? opts.halfW ?? 3; wr[i] = p.wr ?? opts.halfW ?? 3; if (i) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]); }
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, ymax = 0;
  for (let i = 0; i < n; i++) { const w = Math.max(wl[i], wr[i]) + 2 * y[i] + 2; x0 = Math.min(x0, x[i] - w); x1 = Math.max(x1, x[i] + w); z0 = Math.min(z0, z[i] - w); z1 = Math.max(z1, z[i] + w); ymax = Math.max(ymax, y[i]); }
  return { id, kind, band, x, z, y, s, wl, wr, n, L: s[n - 1], x0, z0, x1, z1, ymax, ...opts };
}
// Point and unit tangent `along` metres down a ribbon (clamped to its ends).
function ribAt(rb, along) {
  const a = Math.max(0, Math.min(rb.L, along));
  let i = 1; while (i < rb.n - 1 && rb.s[i] < a) i++;
  const f = (a - rb.s[i - 1]) / (rb.s[i] - rb.s[i - 1] || 1), tx = rb.x[i] - rb.x[i - 1], tz = rb.z[i] - rb.z[i - 1], l = Math.hypot(tx, tz) || 1;
  return { x: rb.x[i - 1] + tx * f, z: rb.z[i - 1] + tz * f, tx: tx / l, tz: tz / l };
}
const segD = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
// The cardinal a direction mostly points along: the side of an axis-aligned building that faces it.
const cardinal = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : dz > 0 ? 'S' : 'N');
const snapH = (v) => Math.round(v * 2) / 2;

export class Roadside {
  constructor(W, rows = { lines: POWER_LINES, billboards: BILLBOARDS, sites: SITES }) {
    const t0 = performance.now();
    this.W = W; this.rows = rows; this.seed = hash32(W.seed, 0x524f4144);
    this.items = []; this.boxes = []; this.flora = []; this.lots = []; this.blocks = []; this.faces = []; this.pendingBills = [];
    this.footprints = []; this.warnings = []; this.keep = new Map(); // keep-out shapes by 64 m cell (scatter keeps off)
    this.sites = []; this.spots = []; this.hulks = []; this.tanks = []; this.lines = []; this.pylons = []; this.hazards = []; this.billboards = [];
    this.addedRibbons = []; this.addedPieces = []; this.addedRails = [];
    this.ribById = new Map(W.ribbons.map((r) => [r.id, r]));
    this.prof = {};
    const tm = (k, f) => { const t = performance.now(); try { f(); } catch (e) { this.warnings.push(`${k}: ${e.message}`); } this.prof[k] = +(performance.now() - t).toFixed(1); };
    for (const S of rows.sites ?? []) if (S.kind === 'dam') tm(`road ${S.id}`, () => this.damRoad(S)); // the dam road first: farms may stand along it
    tm('segs', () => this.segs());
    for (const S of rows.sites ?? []) tm(S.id, () => this.site(S));
    for (const L of rows.lines ?? []) tm(L.id, () => this.line(L));
    tm('billboards', () => { for (const B of rows.billboards ?? []) { try { this.billboard(B); } catch (e) { this.warnings.push(`billboard ${B.id}: ${e.message}`); } } this.finishBills(); });
    tm('index', () => this.index());
    this.buildMs = +(performance.now() - t0).toFixed(1);
  }

  // ---- small builders ---------------------------------------------------------------------------------------------------
  P(pool, x, y, z, w, h, d, col, rot = 0, shade = 1) { this.items.push({ pool, e: [x, y, z, w, h, d, col, rot, shade] }); }
  // A box with a full transform (pitched, rolled): a matrix item (chunkgen pushes it with pushMatrix).
  // R = Ry(yaw) Rx(pitch) Rz(roll) (three.js's Euler order YXZ), scaled, column-major: written out, no THREE objects.
  M(pool, x, y, z, yaw, pitch, roll, sx, sy, sz, col, rect = null) {
    const cy = Math.cos(yaw), sny = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const m = new Float32Array(16);
    m[0] = (cy * cr + sny * sp * sr) * sx; m[1] = cp * sr * sx; m[2] = (-sny * cr + cy * sp * sr) * sx;
    m[4] = (-cy * sr + sny * sp * cr) * sy; m[5] = cp * cr * sy; m[6] = (sny * sr + cy * sp * cr) * sy;
    m[8] = sny * cp * sz; m[9] = -sp * sz; m[10] = cy * cp * sz;
    m[12] = x; m[13] = y; m[14] = z; m[15] = 1;
    this.items.push({ pool, m, mo: { elements: m }, c: col, rect, x, z });
  }
  // A beam from a to b (any direction in 3D), t thick.
  beam(pool, ax, ay, az, bx, by, bz, t, col, tw = t) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, h = Math.hypot(dx, dz), len = Math.hypot(h, dy);
    if (len < 0.01) return;
    this.M(pool, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, Math.atan2(dx, dz), -Math.atan2(dy, h), 0, tw, t, len, col);
  }
  B(x0, z0, x1, z1, h, tag, base = 0) { this.boxes.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h, tag, base }); }
  // An oriented solid (centre, length along (tx,tz), width across, height) as AABB slices no fatter than a lane's edge.
  OB(cx, cz, len, wid, tx, tz, h, tag, base = 0) {
    const nx = -tz, nz = tx, n = Math.max(1, Math.ceil(len / Math.max(1.2, wid * 1.5)));
    for (let k = 0; k < n; k++) {
      const a0 = -len / 2 + (len / n) * k, a1 = a0 + len / n;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const a of [a0, a1]) for (const w of [-wid / 2, wid / 2]) { const px = cx + tx * a + nx * w, pz = cz + tz * a + nz * w; x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); }
      this.B(x0, z0, x1, z1, h, tag, base);
    }
  }
  flor(kind, x, z, h) { this.flora.push([kind, x, z, h, ((hash32(Math.round(x * 10), Math.round(z * 10)) & 0xffff) / 0xffff)]); }
  // Keep-out (scatter stays off): an axis-aligned rect, or an oriented one {cx, cz, ha, hu, tx, tz}.
  keepRect(x0, z0, x1, z1) { this.keepShape({ x0, z0, x1, z1 }); }
  keepOriented(cx, cz, len, wid, tx, tz) { const r = Math.hypot(len, wid) / 2; this.keepShape({ cx, cz, ha: len / 2, hu: wid / 2, tx, tz, x0: cx - r, z0: cz - r, x1: cx + r, z1: cz + r }); }
  keepShape(k) { for (let i = Math.floor((k.x0 - 10) / 64); i <= Math.floor((k.x1 + 10) / 64); i++) for (let j = Math.floor((k.z0 - 10) / 64); j <= Math.floor((k.z1 + 10) / 64); j++) { const key = i * 100003 + j; let l = this.keep.get(key); if (!l) this.keep.set(key, (l = [])); l.push(k); } }
  // Every road segment by 32 m cell (built once, after the dam road joins): the road queries below never walk a whole
  // interstate's 20,000 points.
  segs() {
    if (this._sg) return this._sg;
    const G = (this._sg = new Map()), CS = 32;
    for (const rb of this.W.ribbons) {
      if (rb.mainline) continue; // an interstate's carriageways: its corridor's own projection answers (roadsNear)
      const hw = Math.max(rb.wl[0], rb.wr[0]);
      for (let i = 1; i < rb.n; i++) {
        const ax = rb.x[i - 1], az = rb.z[i - 1], bx = rb.x[i], bz = rb.z[i];
        for (let cx = Math.floor((Math.min(ax, bx) - hw) / CS); cx <= Math.floor((Math.max(ax, bx) + hw) / CS); cx++) for (let cz = Math.floor((Math.min(az, bz) - hw) / CS); cz <= Math.floor((Math.max(az, bz) + hw) / CS); cz++) {
          const k = cx * 100003 + cz; let l = G.get(k); if (!l) G.set(k, (l = [])); l.push(rb, i);
        }
      }
    }
    return G;
  }
  // Each road with a segment within d (+ its half-width) of (x, z), skipping `own`: fn(rb, distance) returns true to stop.
  roadsNear(x, z, d, own, fn, noCor = false) {
    // The interstates by their corridors (bucketed projections): their paved edge is `out` off the centreline.
    if (!noCor) for (const cor of this.W.corridorsNear?.(x - d - 60, z - d - 60, x + d + 60, z + d + 60) ?? [this.W.i10]) {
      const pr = cor.project(x, z, d + 40);
      if (pr.d === Infinity) continue;
      const dd = pr.d - cor.section(pr.s).out;
      if (dd < d && fn(this.mainOf(cor), dd)) return;
    }
    const G = this.segs(), CS = 32, r = Math.ceil(d / CS);
    const ix = Math.floor(x / CS), iz = Math.floor(z / CS);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const l = G.get((ix + a) * 100003 + iz + b);
      if (!l) continue;
      for (let k = 0; k < l.length; k += 2) {
        const rb = l[k], i = l[k + 1];
        if (rb === own || (own && rb.id === own)) continue;
        const dd = segD(x, z, rb.x[i - 1], rb.z[i - 1], rb.x[i], rb.z[i]) - Math.max(rb.wl[0], rb.wr[0]);
        if (dd < d && fn(rb, dd)) return;
      }
    }
  }
  mainOf(cor) { const M = (this._main ??= new Map()); let r = M.get(cor.id); if (!r) M.set(cor.id, (r = { id: `${cor.id} mainline`, mainline: true, cor })); return r; }
  foot(id, x0, z0, x1, z1, own = null) {
    const f = { id, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), roads: [] };
    // Any road it is not built for that runs through it (within 70% of its half-diagonal of its centre).
    const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2, r = Math.hypot(f.x1 - f.x0, f.z1 - f.z0) / 2;
    const seen = new Set();
    this.roadsNear(cx, cz, r * 0.7, own, (rb) => { if (!seen.has(rb.id)) { seen.add(rb.id); f.roads.push(rb.id); } return false; });
    this.footprints.push(f);
    return f;
  }
  // A road within d metres of (x, z) (of its paved edge), skipping `own`.
  nearRoad(x, z, d, own = null, noCor = false) { let hit = null; this.roadsNear(x, z, d, own, (rb) => { hit = rb; return true; }, noCor); return hit; }
  // How far (x, z) is from any interstate's paved edge (Infinity past maxD).
  corGap(x, z, maxD = 600) { let best = Infinity; for (const cor of this.W.corridorsNear?.(x - maxD, z - maxD, x + maxD, z + maxD) ?? [this.W.i10]) { const pr = cor.project(x, z, maxD); if (pr.d !== Infinity) best = Math.min(best, pr.d - cor.section(pr.s).out); } return best; }
  // Water depth (a region's authority, world/regions.js), sampled on a 4 m grid and remembered (rows and trees ask often).
  wet(x, z, cell = 4) {
    const R = this.W.regionOf?.(x, z); if (!R?.water) return 0;
    const k = (Math.floor(x / cell) * 1000003 + Math.floor(z / cell)) * 4 + cell / 4, W2 = (this._wc ??= new Map());
    let d = W2.get(k); if (d === undefined) W2.set(k, (d = regionWater(R, (Math.floor(x / cell) + 0.5) * cell, (Math.floor(z / cell) + 0.5) * cell, this._wo ??= { d: 0, k: 0, s: 0 }).d));
    return d;
  }
  cor(id) { return (this.W.corridors ?? [this.W.i10]).find((c) => c.id === id) ?? null; }
  exit(id) { return this.W.exits.find((X) => X.id === id) ?? (this.W.corridors ?? []).flatMap((c) => c.exits).find((X) => X.id === id) ?? null; }
  // Put the roads this layer added back into WorldIndex's lists when a rebuild dropped them (forge/live.js reindex
  // rebuilds exits, ribbons, pieces and rails from the rows; WorldIndex.bucketFeatures calls this first).
  attach(W) {
    for (const rb of this.addedRibbons) if (!W.ribbons.includes(rb)) W.ribbons.push(rb);
    for (const p of this.addedPieces) if (!W.pieces.includes(p)) W.pieces.push(p);
    for (const r of this.addedRails) if (!W.rails.includes(r)) W.rails.push(r);
  }
  rib(id) { return this.ribById.get(id) ?? this.addedRibbons.find((r) => r.id === id) ?? null; }

  // An anchor -> a frame on a road: {x, z, tx, tz, rx, rz (the traveller's right), rib (the road it is on), cor}.
  frame(a, along = a.along ?? 0) {
    if (a.exit || a.rib) {
      const X = a.exit ? this.exit(a.exit) : null;
      const rb = a.rib ? this.rib(a.rib) : X?.access ?? null;
      if (!rb) throw new Error(`no road for anchor ${JSON.stringify(a)}`);
      const p = ribAt(rb, along);
      return { ...p, rx: -p.tz, rz: p.tx, rib: rb, cor: null, halfW: Math.max(rb.wl[0], rb.wr[0]) };
    }
    const cor = this.cor(a.road); if (!cor) throw new Error(`no road ${a.road}`);
    const s = (a.s ?? a.mile * STREAM.mile) + (along ?? 0), f = cor.at(s), u = a.u ?? 0;
    return { x: f.x + f.nx * u, z: f.z + f.nz * u, tx: f.tx, tz: f.tz, rx: f.nx, rz: f.nz, rib: null, cor, s, halfW: cor.section(s).out };
  }
  // An axis-aligned building of w (along its front) x d (deep) whose front faces the road: its front edge `set` metres
  // off the road's centre on `side`. Returns the rect (on the half-metre grid), its front and the outward direction.
  placeFacing(F, side, set, w, d) {
    const ox = F.rx * side, oz = F.rz * side, front = cardinal(-ox, -oz), ns = front === 'N' || front === 'S';
    const bw = ns ? w : d, bd = ns ? d : w;
    // The front edge's distance along the outward direction: the rect's near side is `set` off the centreline.
    const near = ns ? bd / 2 : bw / 2;
    const cx = F.x + ox * (set + near), cz = F.z + oz * (set + near);
    const r = { x0: snapH(cx - bw / 2), x1: snapH(cx - bw / 2) + Math.round(bw * 2) / 2, z0: snapH(cz - bd / 2), z1: snapH(cz - bd / 2) + Math.round(bd * 2) / 2 };
    // in: the cardinal from the front into the building (and on behind it); al: along the front.
    const inX = front === 'W' ? 1 : front === 'E' ? -1 : 0, inZ = front === 'N' ? 1 : front === 'S' ? -1 : 0;
    return { ...r, cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2, front, ox, oz, inX, inZ, alX: inZ ? 1 : 0, alZ: inX ? 1 : 0 };
  }
  // A walk-in lot through the ring's geo (world/ring.js): kind, zone (its palette and loot), the rect, the wider lot.
  lot(S, k, kind, zone, r, lot, extra = {}) {
    const L = { id: `RS:${S.id}:${k}`, kind, zone, front: r.front, x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, lot, cx: r.cx, cz: r.cz, seed: idHash(`${S.id}:${k}`) & 0x7fffffff,
      ruined: false, noYard: true, hh: null, programme: extra.programme ?? KINDS[kind]?.label ?? kind.toUpperCase(), roadside: S.id, blockKey: `RS:${S.id}`, ...extra };
    this.lots.push(L);
    return L;
  }
  block(S, rect, pads, lots = []) { const b = { id: `RS:${S.id}:${this.blocks.length}`, x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: rect.z1, pads, lots, roadside: S.id }; this.blocks.push(b); return b; }
  spot(S, kind, x, z, extra = {}) { const sp = { id: extra.id ?? `${S.id}:${kind}${this.spots.filter((q) => q.site === S.id && q.kind === kind).length || ''}`, site: S.id, kind, x: +x.toFixed(2), z: +z.toFixed(2), y: extra.y ?? 0, r: extra.r ?? 2.6, ...extra }; this.spots.push(sp); return sp; }

  // ---- sites ------------------------------------------------------------------------------------------------------------
  site(S) {
    const rng = rngOf(hash32(this.seed, idHash(S.id)));
    const rec = { id: S.id, kind: S.kind, name: S.name, state: S.state ?? null, row: S, x: 0, z: 0, r: 0, keepers: S.keepers ?? S.guard?.squatters ?? null, dog: S.guard?.dog ? { breed: S.guard.dog, name: S.guard.name } : null };
    if (S.kind === 'station') this.station(S, rec, rng);
    else if (S.kind === 'junkyard') this.junkyard(S, rec, rng);
    else if (S.kind === 'farm') this.farm(S, rec, rng);
    else if (S.kind === 'substation') this.substation(S, rec, rng);
    else if (S.kind === 'dam') this.dam(S, rec, rng);
    this.sites.push(rec);
  }

  // A canopy fuel stop: the walk-in kiosk (ring.js KINDS.gas builds its canopy and pumps out front), the underground
  // tank's fill caps and vent, a price pole, an apron of old concrete. Looted: a car left at the pumps, the doors gone. A
  // holdout's: sandbags and drums across the apron, a water tank, a hand-painted board.
  station(S, rec, rng) {
    const a = S.anchor, F = this.frame(a), K = KINDS.gas, side = a.side ?? 1;
    const w = rng.range(K.w[0], K.w[1]), d = rng.range(K.d[0], K.d[1]);
    const r = this.placeFacing(F, side, a.set ?? 26, w, d);
    const lot = { x0: Math.min(r.x0, r.x1) - 8, z0: Math.min(r.z0, r.z1) - 8, x1: Math.max(r.x0, r.x1) + 8, z1: Math.max(r.z0, r.z1) + 8 };
    // The apron: from the kiosk's front out toward the road (axis-aligned under the canopy and the islands).
    const fr = r.front, apron = { ...lot };
    const reach = (a.set ?? 26) - F.halfW - 1.2; // to the road's edge (a driveway off it, not a pad in the sand)
    if (fr === 'N') { apron.z1 = r.z0; apron.z0 = r.z0 - reach; }
    else if (fr === 'S') { apron.z0 = r.z1; apron.z1 = r.z1 + reach; }
    else if (fr === 'W') { apron.x1 = r.x0; apron.x0 = r.x0 - reach; }
    else { apron.x0 = r.x1; apron.x1 = r.x1 + reach; }
    lot.x0 = Math.min(lot.x0, apron.x0); lot.z0 = Math.min(lot.z0, apron.z0); lot.x1 = Math.max(lot.x1, apron.x1); lot.z1 = Math.max(lot.z1, apron.z1);
    const L =this.lot(S, 'kiosk', 'gas', 'strip', r, lot, { programme: S.name, ruined: false });
    this.block(S, lot, [{ x0: apron.x0, z0: apron.z0, x1: apron.x1, z1: apron.z1, band: 'lot' }], [L]);
    this.keepRect(lot.x0 - 2, lot.z0 - 2, lot.x1 + 2, lot.z1 + 2);
    this.foot(S.id, lot.x0, lot.z0, lot.x1, lot.z1, F.rib);
    // The canopy's centre (as ring.js puts it: 7 m out from the front's middle).
    const cpx = fr === 'W' ? r.x0 - 7 : fr === 'E' ? r.x1 + 7 : r.cx, cpz = fr === 'N' ? r.z0 - 7 : fr === 'S' ? r.z1 + 7 : r.cz;
    const along = fr === 'N' || fr === 'S', ux = r.alX, uz = r.alZ, vx = r.inX, vz = r.inZ; // u: along the front; v: from the road toward the kiosk
    // The underground tank: its fill caps in a row beside the canopy, a vent pipe at the lot's edge, the tank's outline
    // in the concrete (a patched slab).
    const tx = cpx + ux * 9.5, tz = cpz + uz * 9.5;
    this.P('floors', tx, 0.045, tz, along ? 4.2 : 9.5, 0.02, along ? 9.5 : 4.2, '#8e877a');
    for (let k = -1; k <= 1; k++) this.P('barrels', tx + uz * k * 2.2, 0.06, tz + ux * k * 2.2, 0.7, 0.1, 0.7, k === 0 ? '#9a8a2a' : '#5a5650');
    const vpx = tx + ux * 4 + vx * -1, vpz = tz + uz * 4 + vz * -1;
    this.P('trunks', vpx, 2.2, vpz, 0.5, 4.4, 0.5, '#6a6a62'); this.B(vpx - 0.2, vpz - 0.2, vpx + 0.2, vpz + 0.2, 4.4, 'post');
    const looted = S.state !== 'holdout', lit = rng.range(RR.station.tank[0], RR.station.tank[1]);
    const tank = this.spot(S, 'tank', tx, tz, { id: `${S.id}:tank`, r: 3.4, litres: Math.round(looted ? lit : rng.range(RR.station.holdoutTank[0], RR.station.holdoutTank[1])), guarded: !looted });
    this.tanks.push(tank);
    // The price pole: a tall post with the brand's board (the bills atlas) at the road end of the apron.
    const ppx = cpx - ux * 10 - vx * ((a.set ?? 26) - F.halfW - 9), ppz = cpz - uz * 10 - vz * ((a.set ?? 26) - F.halfW - 9);
    this.P('props', ppx, 4, ppz, 0.4, 8, 0.4, '#4a4642'); this.B(ppx - 0.25, ppz - 0.25, ppx + 0.25, ppz + 0.25, 8, 'post');
    this.pendingBills.push({ id: `${S.id}:price`, x: ppx, z: ppz, w: 4.6, h: 2.2, lift: 6.2, legs: false, face: { kind: 'price', lines: looted ? [S.brand ?? 'FUEL', 'NO GAS', ''] : [S.brand ?? 'FUEL', 'GAS · WATER · TRADE', 'NO GUNS DRAWN'], cond: looted ? 'shot' : 'repainted', brand: S.brand ?? 'FUEL' } });
    if (looted) {
      // A car left at the pumps, a door open; an oil drum on its side; glass and junk on the apron.
      const c = rng.pick(WRECK), wx = cpx - ux * 8.5 - vx * 2.5, wz = cpz - uz * 8.5 - vz * 2.5, rot = along ? Math.PI / 2 : 0;
      this.P('props', wx, 0.55, wz, 1.9, 0.8, 4.2, c, rot + rng.range(-0.1, 0.1)); this.P('props', wx, 1.15, wz, 1.6, 0.6, 2.0, '#2a2622', rot);
      if (along) this.B(wx - 2.1, wz - 0.95, wx + 2.1, wz + 0.95, 1.4, 'wreck'); else this.B(wx - 0.95, wz - 2.1, wx + 0.95, wz + 2.1, 1.4, 'wreck');
      this.P('barrels', cpx - ux * 7, 0.45, cpz - uz * 7, 1, 0.82, 1, '#6a3a22', 0);
      for (let k = 0; k < 9; k++) this.P('props', apron.x0 + rng() * (apron.x1 - apron.x0), 0.08, apron.z0 + rng() * (apron.z1 - apron.z0), rng.range(0.3, 1.2), 0.12, rng.range(0.3, 1.0), rng.pick(['#5a5650', '#6a5a48', '#3a3632', '#7a6a52']), rng() * 3);
    } else {
      // A holdout's: sandbag walls at the apron's corners, drums across the way in with a gap, a water tank on a stand,
      // a fire barrel (lit at night), a shade tarp over a bench.
      const sb = (x, z, len, alongX) => { this.P('props', x, 0.55, z, alongX ? len : 0.9, 1.1, alongX ? 0.9 : len, '#9a8a62', 0); if (alongX) this.B(x - len / 2, z - 0.45, x + len / 2, z + 0.45, 1.1, 'sandbags'); else this.B(x - 0.45, z - len / 2, x + 0.45, z + len / 2, 1.1, 'sandbags'); };
      const ex = vx * -((a.set ?? 26) - F.halfW - 7), ez = vz * -((a.set ?? 26) - F.halfW - 7);
      for (const sgn of [-1, 1]) sb(cpx + ux * sgn * 13 + ex * 0.6, cpz + uz * sgn * 13 + ez * 0.6, 5, !along);
      for (const sgn of [-1, 1]) for (let k = 0; k < 3; k++) { const q = sgn * (6 + k * 1.3); const bx = cpx + ux * q + ex, bz = cpz + uz * q + ez; this.P('barrels', bx, 0.55, bz, 1, 1, 1, rng.pick(['#5a2e1a', '#3f4a3a', '#6a5a2a'])); this.B(bx - 0.45, bz - 0.45, bx + 0.45, bz + 0.45, 1.1, 'barrel'); }
      const wtx = r.cx - ux * (w / 2 + 4), wtz = r.cz - uz * (w / 2 + 4);
      for (const [px, pz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) this.P('props', wtx + px, 1.6, wtz + pz, 0.2, 3.2, 0.2, '#4a3a2a');
      this.P('barrels', wtx, 4.2, wtz, 3.6, 2.2, 3.6, '#3f6a7a'); this.B(wtx - 1.6, wtz - 1.6, wtx + 1.6, wtz + 1.6, 5.3, 'tank');
      const fbx = cpx + ux * 13 + ex * 0.2, fbz = cpz + uz * 13 + ez * 0.2;
      this.P('barrels', fbx, 0.55, fbz, 1, 1, 1, '#4a2a1a'); this.B(fbx - 0.45, fbz - 0.45, fbx + 0.45, fbz + 0.45, 1.1, 'barrel');
      this.items.push({ pool: 'glows', e: [fbx, 0.12, fbz, 14, 1, 14, '#ff8a3a', 0, 1] });
      rec.counter = { x: r.cx, z: r.cz }; // the keeper's post: in from the kiosk's front door (systems/roadside.js asks geo for it)
      rec.forecourt = { x: cpx + ex * 0.5, z: cpz + ez * 0.5 };
    }
    rec.x = r.cx; rec.z = r.cz; rec.r = Math.hypot(lot.x1 - lot.x0, lot.z1 - lot.z0) / 2; rec.lot = L.id; rec.front = { x: cpx, z: cpz };
  }

  // A fenced boneyard: corrugated panels round it with a gate toward the road, hulks in rows (some stacked, some on their
  // roofs), a crawler crane with a car hung off its hook, a walk-in workshop by the gate, tyre stacks, the crusher.
  junkyard(S, rec, rng) {
    const a = S.anchor, F = this.frame(a), side = a.side ?? 1, W0 = S.w ?? 60, D0 = S.d ?? 50;
    const r = this.placeFacing(F, side, a.set ?? 20, W0, D0), fr = r.front, along = fr === 'N' || fr === 'S';
    const lot = { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 };
    this.keepRect(r.x0 - 3, r.z0 - 3, r.x1 + 3, r.z1 + 3);
    this.foot(S.id, r.x0, r.z0, r.x1, r.z1, F.rib);
    const pads = [{ x0: r.x0 + 0.5, z0: r.z0 + 0.5, x1: r.x1 - 0.5, z1: r.z1 - 0.5, band: 'yard' }];
    // The fence: panels along each side, the gate (8 m) in the middle of the front.
    const gateC = along ? r.cx : r.cz, gateHalf = 4.5;
    const run = (x0, z0, x1, z1, isFront) => {
      const len = Math.hypot(x1 - x0, z1 - z0), tx = (x1 - x0) / len, tz = (z1 - z0) / len, n = Math.round(len / 2.4);
      let open = null;
      for (let k = 0; k < n; k++) {
        const t0 = (k / n) * len, t1 = ((k + 1) / n) * len, mx = x0 + tx * (t0 + t1) / 2, mz = z0 + tz * (t0 + t1) / 2;
        const g = isFront && Math.abs((along ? mx : mz) - gateC) < gateHalf;
        if (g) { if (open) { this.B(open[0], open[1], x0 + tx * t0, z0 + tz * t0, 2.3, 'junk'); open = null; } continue; }
        this.P('props', mx, 1.1, mz, tx ? len / n + 0.05 : 0.1, 2.2 + rng.range(-0.15, 0.2), tz ? len / n + 0.05 : 0.1, rng.pick(RUST), rng.range(-0.04, 0.04));
        if (!open) open = [x0 + tx * t0, z0 + tz * t0];
      }
      if (open) this.B(open[0] - (tz ? 0.08 : 0), open[1] - (tx ? 0.08 : 0), x1 + (tz ? 0.08 : 0), z1 + (tx ? 0.08 : 0), 2.3, 'junk');
    };
    run(r.x0, r.z0, r.x1, r.z0, fr === 'N'); run(r.x0, r.z1, r.x1, r.z1, fr === 'S'); run(r.x0, r.z0, r.x0, r.z1, fr === 'W'); run(r.x1, r.z0, r.x1, r.z1, fr === 'E');
    // Posts at the corners and the gate.
    for (const [px, pz] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) this.P('props', px, 1.3, pz, 0.2, 2.6, 0.2, '#3a3632');
    // The office by the gate (a walk-in workshop: its benches roll garage loot - wrenches, a pry bar, scrap).
    const inX = r.inX, inZ = r.inZ; // from the front into the yard
    const fx =fr === 'N' ? r.z0 : fr === 'S' ? r.z1 : fr === 'W' ? r.x0 : r.x1;
    const ow = 15, od = 12, oc = gateC + (gateHalf + 2 + ow / 2) * (rng() < 0.5 ? 1 : -1);
    const ofront = fr, oNear = fx + (fr === 'N' || fr === 'W' ? 4 : -4);
    const or = along ? { x0: snapH(oc - ow / 2), x1: snapH(oc - ow / 2) + ow, z0: fr === 'N' ? oNear : oNear - od, z1: fr === 'N' ? oNear + od : oNear } : { z0: snapH(oc - ow / 2), z1: snapH(oc - ow / 2) + ow, x0: fr === 'W' ? oNear : oNear - od, x1: fr === 'W' ? oNear + od : oNear };
    for (const k of ['x0', 'x1', 'z0', 'z1']) or[k] = snapH(or[k]);
    const OL = this.lot(S, 'office', 'shop', 'industrial', { ...or, front: ofront, cx: (or.x0 + or.x1) / 2, cz: (or.z0 + or.z1) / 2 }, { x0: or.x0 - 2, z0: or.z0 - 2, x1: or.x1 + 2, z1: or.z1 + 2 }, { programme: `${S.name} OFFICE` });
    const yard = { x0: r.x0 + 2, z0: r.z0 + 2, x1: r.x1 - 2, z1: r.z1 - 2 };
    const clearOf = (x, z, m) => !(x > or.x0 - m && x < or.x1 + m && z > or.z0 - m && z < or.z1 + m) && !(Math.abs((along ? x : z) - gateC) < gateHalf + 3 + m && Math.abs((along ? z : x) - fx) < 16 + m);
    // The crane: a crawler base and cab in the yard's far corner, its boom up at 55 degrees, a car hung off the hook.
    let crane = null;
    if (S.crane) {
      const cx = along ? (oc > gateC ? r.x0 + 10 : r.x1 - 10) : fx + inX * (r.x1 - r.x0) * 0.72, cz = along ? fx + inZ * (r.z1 - r.z0) * 0.72 : (oc > gateC ? r.z0 + 10 : r.z1 - 10);
      crane = { x: cx, z: cz };
      this.P('props', cx, 0.7, cz, 4.4, 1.4, 6.0, '#3a3632'); this.P('props', cx, 2.0, cz, 3.4, 1.6, 3.6, '#c8902a'); this.P('props', cx + 0.9, 3.2, cz - 0.8, 1.4, 1.6, 1.6, '#c8902a');
      this.B(cx - 2.2, cz - 3.0, cx + 2.2, cz + 3.0, 3.6, 'boom');
      const yaw = Math.atan2(r.cx - cx, r.cz - cz), L2 = 24, pitch = 0.95, hx = Math.sin(yaw) * Math.cos(pitch) * L2, hz = Math.cos(yaw) * Math.cos(pitch) * L2, hy = 2.6 + Math.sin(pitch) * L2;
      this.beam('rails', cx, 2.6, cz, cx + hx, hy, cz + hz, 0.7, '#b8862a', 0.9);
      this.beam('rails', cx, 2.6, cz, cx + hx * 0.45, 2.6 + (hy - 2.6) * 0.45 + 1.4, cz + hz * 0.45, 0.12, '#3a3632');
      const kx = cx + hx, kz = cz + hz;
      this.beam('rails', kx, hy, kz, kx, 8.6, kz, 0.06, '#2a2622');
      this.P('props', kx, 7.4, kz, 1.9, 0.8, 4.2, rng.pick(WRECK), yaw + 0.4); this.P('props', kx, 8.0, kz, 1.6, 0.5, 2.0, '#2a2622', yaw + 0.4);
    }
    // Hulks in rows, aisles between, stacked two high here and there, a few on their roofs. Each is a record you strip.
    const rows = S.rows ?? 5, pitch = 6.4, step = 4.9;
    const span = along ? yard.x1 - yard.x0 : yard.z1 - yard.z0, deep = along ? yard.z1 - yard.z0 : yard.x1 - yard.x0;
    let n = 0;
    for (let row = 0; row < rows; row++) {
      const v = 18 + row * pitch; // metres in from the front fence
      if (v > deep - 4) break;
      for (let u = 4; u < span - 3; u += step) {
        const x = along ? yard.x0 + u : fx + inX * v, z = along ? fx + inZ * v : yard.z0 + u;
        if (!clearOf(x, z, 2.5)) continue;
        if (crane && Math.hypot(x - crane.x, z - crane.z) < 7) continue;
        if (rng() < 0.18) continue;
        const stack = rng() < 0.32 ? 2 : 1, c = rng.pick(WRECK), rot = (along ? 0 : Math.PI / 2) + rng.range(-0.12, 0.12), flip = rng() < 0.12;
        for (let s = 0; s < stack; s++) {
          const y0 = s * 1.25, cc = s ? rng.pick(WRECK) : c;
          if (flip && !s) { this.P('props', x, 0.3, z, 1.6, 0.6, 2.0, '#2a2622', rot); this.P('props', x, 0.95, z, 1.9, 0.8, 4.2, cc, rot); }
          else { this.P('props', x, 0.55 + y0, z, 1.9, 0.8, 4.2, cc, rot + (s ? rng.range(-0.25, 0.25) : 0)); this.P('props', x, 1.15 + y0, z, 1.6, 0.5, 2.0, '#2a2622', rot); }
        }
        // Wheels gone, a door off, a bonnet up: a dark slab or two beside it.
        if (rng() < 0.4) this.P('props', x + (along ? 1.4 : 0), 0.08, z + (along ? 0 : 1.4), 0.9, 0.06, 1.3, c, rng() * 3);
        const id = `${S.id}:h${++n}`, hx0 = along ? x - 0.95 : x - 2.1, hz0 = along ? z - 2.1 : z - 0.95;
        this.B(hx0, hz0, hx0 + (along ? 1.9 : 4.2), hz0 + (along ? 4.2 : 1.9), 1.4 + (stack - 1) * 1.25, 'hulk');
        const hk = this.spot(S, 'hulk', x, z, { id, r: RR.hulk.reach, scrap: rng.int(RR.hulk.scrap[0], RR.hulk.scrap[1]) * stack, stack, color: c });
        this.hulks.push(hk);
      }
    }
    // Tyre stacks along the back fence and the crusher (a steel box with a car flattened in it).
    for (let k = 0; k < 7; k++) {
      const u = rng.range(6, span - 6), v = deep - rng.range(2.5, 5);
      const x = along ? yard.x0 + u : fx + inX * v, z = along ? fx + inZ * v : yard.z0 + u;
      for (let h = 0; h < rng.int(2, 5); h++) this.P('barrels', x, 0.2 + h * 0.36, z, 1.3, 0.32, 1.3, '#23201e');
      this.B(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 1.6, 'junk');
    }
    // The guard: a dog's kennel (a crate and a chain post) by the office, or the squatters' camp (tents round a barrel).
    const ox = (or.x0 + or.x1) / 2 + inX * (od / 2 + 4), oz = (or.z0 + or.z1) / 2 + inZ * (od / 2 + 4);
    if (S.guard?.dog) { this.P('props', ox, 0.5, oz, 1.2, 1.0, 1.0, '#6a4e2e'); this.B(ox - 0.6, oz - 0.5, ox + 0.6, oz + 0.5, 1, 'crate'); rec.kennel = { x: ox, z: oz }; }
    if (S.guard?.squatters) {
      const camp = { x: (r.x0 + r.x1) / 2 + inX * deep * 0.2, z: (r.z0 + r.z1) / 2 + inZ * deep * 0.2 };
      this.P('barrels', camp.x, 0.55, camp.z, 1, 1, 1, '#4a2a1a'); this.B(camp.x - 0.45, camp.z - 0.45, camp.x + 0.45, camp.z + 0.45, 1.1, 'barrel');
      this.items.push({ pool: 'glows', e: [camp.x, 0.12, camp.z, 16, 1, 16, '#ff8a3a', 0, 1] });
      for (let t = 0; t < 3; t++) { const ang = rng() * TAU, dd = rng.range(4, 6.5), tx2 = camp.x + Math.cos(ang) * dd, tz2 = camp.z + Math.sin(ang) * dd; this.P('props', tx2, 0.9, tz2, 3.0, 1.8, 3.0, rng.pick(['#7c5a3a', '#5d4a34', '#8a6a44', '#4a5a4a']), ang); this.B(tx2 - 1.3, tz2 - 1.3, tx2 + 1.3, tz2 + 1.3, 1.8, 'tent'); }
      rec.camp = camp;
    }
    this.block(S, lot, pads, [OL]);
    rec.x = r.cx; rec.z = r.cz; rec.r = Math.hypot(W0, D0) / 2; rec.office = OL.id; rec.gate = { x: along ? gateC : fx, z: along ? fx : gateC }; rec.yard = { x: (r.x0 + r.x1) / 2 + inX * deep * 0.1, z: (r.z0 + r.z1) / 2 + inZ * deep * 0.1 };
  }

  // A farm belt: fields both sides of a road (or one), rows by crop (worked green, or fallow stubble gone to weeds), a lined
  // canal along their back edge, a farmstead (walk-in farmhouse, pole barn, silo, windmill over a stock tank) in its slot.
  farm(S, rec, rng) {
    const a = S.anchor, sides = S.sides ?? [1, -1], len = S.len ?? 800, along0 = a.along ?? 0;
    const onCor = !!a.road;
    const F0 = this.frame(a, 0);
    const own = F0.rib;
    const fields = [];
    const steadSlot = S.stead ? { a: S.stead.along, side: S.stead.side ?? 1 } : null;
    for (const side of sides) {
      let t = 0, k = 0;
      while (t < len - 40) {
        const fl = Math.min(len - t, rng.range(120, 190));
        const amid = t + fl / 2;
        if (steadSlot && side === steadSlot.side && Math.abs(amid - steadSlot.a) < fl / 2 + 45) { t = steadSlot.a + 45 + RR.farm.gap; continue; }
        const F = this.frame(a, onCor ? amid : along0 + amid);
        if (!onCor && F.rib && along0 + amid > F.rib.L - 30) break;
        const crop = CROPS[S.crops[(k++) % S.crops.length]], depth = rng.range(RR.farm.depth[0], RR.farm.depth[1]);
        const set0 = (onCor ? F.halfW + (F.cor?.canal && F.cor.canal.side === side ? F.cor.canal.off + F.cor.canal.half + 6 - F.halfW : 34) : F.halfW + 8);
        const ox = F.rx * side, oz = F.rz * side, cx = F.x + ox * (set0 + depth / 2), cz = F.z + oz * (set0 + depth / 2);
        fields.push({ crop, cropId: S.crops[(k - 1) % S.crops.length], depth, fl, cx, cz, tx: F.tx, tz: F.tz, ox, oz, worked: (steadSlot && Math.abs(amid - steadSlot.a) < (S.keptR ?? 320)) || rng() < (S.worked ?? 0.5), side, set0, F }); // the fields round the farmstead are the ones still worked
        t += fl + RR.farm.gap;
      }
    }
    let rows = 0, trees = 0;
    for (const f of fields) {
      const yaw = Math.atan2(f.tx, f.tz), cr = f.crop, fr = rngOf(hash32(this.seed, idHash(S.id), Math.round(f.cx), Math.round(f.cz)));
      // Is the whole field dry? (Most are: then no row asks the water.)
      const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].map(([p, q]) => [f.cx + f.ox * p * f.depth / 2 + f.tx * q * f.fl / 2, f.cz + f.oz * p * f.depth / 2 + f.tz * q * f.fl / 2]);
      const wetField = corners.some(([x, z]) => this.wet(x, z) > 0);
      const corFar = corners.every(([x, z]) => this.corGap(x, z, 60) > 8); // the interstate, asked at the corners (a straight road: the field between them is as clear)
      const roadNear = corners.some(([x, z]) => this.nearRoad(x, z, 20, own, corFar)) || !!this.nearRoad(f.cx, f.cz, f.depth / 2, own, corFar);
      const bad = (x, z) => (wetField && this.wet(x, z) > 0) || (roadNear && this.nearRoad(x, z, 5, own, corFar)) || inIsland(x, z, 20);
      if (bad(f.cx, f.cz)) { this.warnings.push(`${S.id}: a field at ${Math.round(f.cx)},${Math.round(f.cz)} is on water or a road: skipped`); continue; }
      this.keepOriented(f.cx, f.cz, f.fl + 4, f.depth + 4, f.tx, f.tz);
      this.foot(`${S.id}:field${fields.indexOf(f)}`, f.cx - 4, f.cz - 4, f.cx + 4, f.cz + 4, own);
      // The soil (or the stubble) under the rows: one flat slab turned with the field.
      this.P('floors', f.cx, 0.028, f.cz, f.depth, 0.04, f.fl, f.worked ? cr.soil : cr.fallow, yaw);
      const P = (across, al) => [f.cx + f.ox * across + f.tx * al, f.cz + f.oz * across + f.tz * al];
      if (cr.tree) {
        // An orchard: trees in a grid (a dead one here and there; gaps where they were cut for firewood).
        const pitch = Math.max(cr.pitch, Math.sqrt((f.depth * f.fl) / 220));
        for (let u = -f.depth / 2 + pitch / 2; u < f.depth / 2; u += pitch) for (let v = -f.fl / 2 + pitch / 2; v < f.fl / 2; v += pitch) {
          if (fr() < (f.worked ? 0.06 : 0.3)) continue;
          const [x, z] = P(u + fr.range(-0.4, 0.4), v + fr.range(-0.4, 0.4));
          if ((wetField && this.wet(x, z, 8) > 0) || (roadNear && this.nearRoad(x, z, 5, own, corFar)) || inIsland(x, z, 20)) continue; // (water on an 8 m grid: a tree, not a row)
          const dead = !f.worked && fr() < 0.25;
          this.flor(dead ? 'deadtree' : cr.tree, x, z, dead ? fr.range(3, 5) : fr.range(cr.treeH[0], cr.treeH[1]) * (f.worked ? 1 : 0.85));
          trees++;
        }
      } else {
        // Rows along the field, cut into segments (a chunk owns a segment by its centre). Fallow: lower, paler, broken.
        const seg = RR.farm.seg, nSeg = Math.max(1, Math.round(f.fl / seg)), sl = f.fl / nSeg;
        const rowC = f.worked ? cr.row : cr.stub ?? cr.fallow, hh = f.worked ? cr.h : cr.h * 0.45;
        for (let u = -f.depth / 2 + cr.pitch / 2; u < f.depth / 2 - 0.2; u += cr.pitch) {
          for (let q = 0; q < nSeg; q++) {
            if (!f.worked && fr() < 0.35) continue;
            const v = -f.fl / 2 + sl * (q + 0.5), [x, z] = P(u, v);
            if (bad(x, z)) continue;
            const shade = fr.range(0.86, 1.08);
            this.P('props', x, hh / 2, z, cr.w * (f.worked ? 1 : 0.7), hh, sl - 0.4, rowC, yaw, shade);
            if (cr.top && f.worked) this.P('props', x, hh * 0.92, z, cr.w * 0.7, hh * 0.22, sl - 1.2, cr.top, yaw, shade);
            rows++;
          }
        }
        // Weeds in a fallow field.
        if (!f.worked) for (let k = 0; k < 40; k++) { const [x, z] = P(fr.range(-f.depth / 2, f.depth / 2), fr.range(-f.fl / 2, f.fl / 2)); if (!bad(x, z)) this.P('shrubs', x, 0.25, z, fr.range(0.5, 1.1), fr.range(0.35, 0.6), fr.range(0.5, 1.1), '#6a6a3a', fr() * 6); }
      }
      // A lined canal along the field's back edge (dry: a dam's or a well's water ran in it once; 'region': Florida's
      // own canals carry the water, nothing to draw).
      if (S.canal === 'dry' || S.canal === 'dam') {
        const back = f.depth / 2 + 4, nS = Math.max(1, Math.round(f.fl / 20)), sl = f.fl / nS;
        for (let q = 0; q < nS; q++) {
          const v = -f.fl / 2 + sl * (q + 0.5), [x, z] = P(back, v);
          if (bad(x, z)) continue;
          this.P('floors', x, 0.03, z, 3.0, 0.04, sl, '#8a8478', yaw);
          for (const w of [-1.7, 1.7]) { const wx = x + f.ox * w, wz = z + f.oz * w; this.P('props', wx, 0.3, wz, 0.35, 0.6, sl + 0.05, CONCRETE, yaw); }
          this.OB(x + f.ox * -1.7, z + f.oz * -1.7, sl, 0.35, f.tx, f.tz, 0.6, 'canal'); this.OB(x + f.ox * 1.7, z + f.oz * 1.7, sl, 0.35, f.tx, f.tz, 0.6, 'canal');
        }
        f.canal = P(back, -f.fl / 2);
      }
    }
    // The farmstead.
    if (S.stead) {
      const F = this.frame(a, onCor ? S.stead.along : along0 + S.stead.along), side = S.stead.side ?? 1;
      const K = KINDS.house, r = this.placeFacing(F, side, (onCor ? F.halfW + 40 : F.halfW + 16), (K.w[0] + K.w[1]) / 2, (K.d[0] + K.d[1]) / 2);
      const lot = { x0: r.x0 - 10, z0: r.z0 - 10, x1: r.x1 + 10, z1: r.z1 + 10 };
      const HL = this.lot(S, 'house', 'house', 'residential', r, lot, { programme: `${S.name} FARMHOUSE` });
      const out = { x: r.inX, z: r.inZ }; // from the road toward the house and on behind it
      const lat = { x: r.alX, z: r.alZ }; // along its front
      const BX = r.cx + out.x * 26 + lat.x * 14, BZ = r.cz + out.z * 26 + lat.z * 14; // the barn behind and to one side
      const bw = lat.x ? 18 : 12, bd = lat.x ? 12 : 18;
      this.P('walls', BX, 2.8, BZ, bw, 5.6, bd, rng.pick(['#8a3a24', '#7a4a32', '#8e8a7e', '#9a5a3a']));
      // A gable roof: two slabs falling away from the ridge (local z runs across the ridge, pitched down away from it).
      const ridgeAlongX = bw > bd, half = (ridgeAlongX ? bd : bw) / 2 + 0.4, pitchA = 0.42;
      for (const sgn of [-1, 1]) {
        const ox = ridgeAlongX ? 0 : sgn * half / 2, oz = ridgeAlongX ? sgn * half / 2 : 0;
        this.M('roofs', BX + ox, 5.6 + Math.tan(pitchA) * half / 2, BZ + oz, ridgeAlongX ? 0 : Math.PI / 2, sgn * pitchA, 0, ridgeAlongX ? bw + 0.6 : bd + 0.6, 0.18, half / Math.cos(pitchA) + 0.2, '#7a7670');
      }
      this.B(BX - bw / 2, BZ - bd / 2, BX + bw / 2, BZ + bd / 2, 5.6, 'shed');
      // The silo beside it, the windmill and stock tank in the yard.
      const SX = BX + lat.x * (bw / 2 + 5), SZ = BZ + lat.z * (bd / 2 + 5);
      this.P('barrels', SX, 7, SZ, 7.2, 12.7, 7.2, '#a8a69c'); this.P('shrubs', SX, 14.2, SZ, 3.3, 1.5, 3.3, '#8a8a82'); this.B(SX - 3.1, SZ - 3.1, SX + 3.1, SZ + 3.1, 14, 'silo');
      const WX = r.cx - lat.x * 18 + out.x * 6, WZ = r.cz - lat.z * 18 + out.z * 6;
      this.windmill(WX, WZ, rng);
      const TX = WX + out.x * 6, TZ = WZ + out.z * 6;
      this.P('barrels', TX, 0.5, TZ, 5.8, 0.9, 5.8, '#7e8480'); this.P('barrels', TX, 0.93, TZ, 5.2, 0.04, 5.2, S.water === 'windmill' ? '#3f5a52' : '#5a5040');
      this.B(TX - 2.4, TZ - 2.4, TX + 2.4, TZ + 2.4, 1, 'tank');
      this.tanks.push(this.spot(S, 'water', TX, TZ, { id: `${S.id}:stock`, r: 3.6, source: S.water ?? 'windmill', cap: RR.tank.windmill.cap, perDay: RR.tank.windmill.perDay }));
      // An old tractor rusting by the barn.
      const TrX = BX - lat.x * (bw / 2 + 4) + out.x * 3, TrZ = BZ - lat.z * (bd / 2 + 4) + out.z * 3;
      this.P('props', TrX, 0.9, TrZ, 1.6, 1.0, 3.0, '#8a4a22'); this.P('trunks', TrX, 0.8, TrZ - 1.1, 1.6, 0.4, 1.6, '#23201e'); this.P('props', TrX, 1.8, TrZ + 0.3, 1.0, 1.0, 1.0, '#3a3632');
      this.B(TrX - 0.9, TrZ - 1.6, TrX + 0.9, TrZ + 1.6, 1.8, 'wreck');
      const yardR = { x0: Math.min(r.x0, BX - bw / 2, SX - 4, WX - 4, TX - 4) - 4, z0: Math.min(r.z0, BZ - bd / 2, SZ - 4, WZ - 4, TZ - 4) - 4, x1: Math.max(r.x1, BX + bw / 2, SX + 4, WX + 4, TX + 4) + 4, z1: Math.max(r.z1, BZ + bd / 2, SZ + 4, WZ + 4, TZ + 4) + 4 };
      this.block(S, yardR, [{ ...yardR, band: 'yard' }], [HL]);
      this.keepRect(yardR.x0, yardR.z0, yardR.x1, yardR.z1);
      this.foot(`${S.id}:stead`, yardR.x0, yardR.z0, yardR.x1, yardR.z1, own);
      rec.stead = { x: r.cx, z: r.cz, house: HL.id };
    }
    rec.fields = fields.length; rec.rows = rows; rec.trees = trees;
    rec.fieldList = fields.map((f) => ({ x: Math.round(f.cx), z: Math.round(f.cz), crop: f.cropId, worked: f.worked }));
    const mid = this.frame(a, onCor ? len / 2 : along0 + len / 2); rec.x = mid.x; rec.z = mid.z; rec.r = len / 2 + 120;
    rec.crops = [...new Set(S.crops)];
    rec.canalAt = fields.find((f) => f.canal)?.canal ?? null;
  }
  windmill(x, z, rng) {
    const H = 10, b = 1.6, top = 0.5;
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.beam('rails', x + px * b, 0, z + pz * b, x + px * top, H, z + pz * top, 0.14, '#6a6862');
    for (const y of [3.5, 7]) { const k = b - (b - top) * (y / H); for (const [ax, az, bx2, bz2] of [[-k, -k, k, -k], [k, -k, k, k], [k, k, -k, k], [-k, k, -k, -k]]) this.beam('rails', x + ax, y, z + az, x + bx2, y, z + bz2, 0.08, '#6a6862'); }
    this.P('props', x, H + 0.3, z, 1.2, 0.6, 1.2, '#5a5650');
    // The wheel faces the prevailing wind (south-west); 14 vanes on a hub, a tail vane behind.
    const yaw = 0.8 + rng.range(-0.3, 0.3), fx = Math.sin(yaw), fz = Math.cos(yaw), hx = x + fx * 0.8, hz = z + fz * 0.8, hy = H + 0.6;
    for (let k = 0; k < 14; k++) { const ang = (k / 14) * TAU; this.M('props', hx + Math.cos(yaw) * Math.cos(ang) * 1.3, hy + Math.sin(ang) * 1.3, hz - Math.sin(yaw) * Math.cos(ang) * 1.3, yaw + Math.PI / 2, 0, ang, 2.0, 0.42, 0.04, '#b8b4a8'); }
    this.M('props', x - fx * 1.6, hy, z - fz * 1.6, yaw, 0, 0, 0.05, 1.0, 2.4, '#9a3a22');
    this.B(x - b - 0.1, z - b - 0.1, x + b + 0.1, z + b + 0.1, H, 'tower');
  }

  // A substation: chain-link round a gravel pad, transformers with their fins and bushings, two gantries the line
  // comes down to, a control house.
  substation(S, rec, rng) {
    const F = this.frame(S.anchor), w = S.w ?? 44, d = S.d ?? 32, x0 = snapH(F.x - w / 2), z0 = snapH(F.z - d / 2), x1 = x0 + w, z1 = z0 + d;
    this.keepRect(x0 - 3, z0 - 3, x1 + 3, z1 + 3);
    this.foot(S.id, x0, z0, x1, z1);
    const L = this.block(S, { x0, z0, x1, z1 }, [{ x0: x0 + 0.5, z0: z0 + 0.5, x1: x1 - 0.5, z1: z1 - 0.5, band: 'lot' }], []);
    // The fence: posts every 3 m, a top rail and a mid rail (thin: you see through it), the gate on the road side.
    const toRoad = cardinal(-F.rx * Math.sign(S.anchor.u ?? 1), -F.rz * Math.sign(S.anchor.u ?? 1));
    const side = (ax, az, bx, bz, gate) => {
      const len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len, n = Math.round(len / 3);
      for (let k = 0; k <= n; k++) { const px = ax + tx * len * (k / n), pz = az + tz * len * (k / n); this.P('props', px, 1.2, pz, 0.1, 2.4, 0.1, '#7a7a74'); }
      for (const y of [2.35, 1.2]) this.beam('rails', ax, y, az, bx, y, bz, 0.05, '#8a8a84');
      // chain-link mesh: a faint see-through band (thin, pale) - and collision, with the gate open in the middle
      this.M('props', (ax + bx) / 2, 1.2, (az + bz) / 2, Math.atan2(tx, tz), 0, 0, 0.02, 2.3, len, '#9a9a92');
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (gate) { this.B(ax, az, mx - tx * 3, mz - tz * 3, 2.4, 'wirefence'); this.B(mx + tx * 3, mz + tz * 3, bx, bz, 2.4, 'wirefence'); }
      else this.B(ax, az, bx, bz, 2.4, 'wirefence');
    };
    side(x0, z0, x1, z0, toRoad === 'N'); side(x0, z1, x1, z1, toRoad === 'S'); side(x0, z0, x0, z1, toRoad === 'W'); side(x1, z0, x1, z1, toRoad === 'E');
    // Transformers in a row, fins and bushings; gantries over them.
    for (let k = 0; k < 3; k++) {
      const tx = x0 + 9 + k * ((w - 18) / 2), tz = z0 + d * 0.55;
      this.P('props', tx, 1.4, tz, 3.2, 2.8, 2.6, '#5a5e58'); for (const f of [-1, 1]) this.P('props', tx + f * 1.9, 1.3, tz, 0.4, 2.2, 2.2, '#4a4e48');
      for (const b2 of [-0.9, 0, 0.9]) this.P('trunks', tx + b2, 3.4, tz, 0.5, 1.4, 0.5, '#8a5a3a');
      this.B(tx - 2.1, tz - 1.4, tx + 2.1, tz + 1.4, 3, 'generator');
    }
    for (const gz of [z0 + 7, z1 - 6]) {
      for (const gx of [x0 + 5, x1 - 5]) { this.P('props', gx, 6, gz, 0.4, 12, 0.4, STEEL); this.B(gx - 0.25, gz - 0.25, gx + 0.25, gz + 0.25, 12, 'tower'); }
      this.P('props', (x0 + x1) / 2, 11.8, gz, w - 10, 0.5, 0.5, STEEL);
    }
    const hx = x0 + 5, hz = z1 - 5;
    this.P('walls', hx + 2, 1.6, hz - 1.5, 6, 3.2, 4, '#a8a092'); this.P('roofs', hx + 2, 3.35, hz - 1.5, 6.6, 0.3, 4.6, '#6a6a64');
    this.B(hx - 1, hz - 3.5, hx + 5, hz + 0.5, 3.2, 'shed');
    rec.x = F.x; rec.z = F.z; rec.r = Math.hypot(w, d) / 2; rec.gantry = { x: (x0 + x1) / 2, z: z0 + 7, y: 11.8 };
    void L; void rng;
  }

  // ---- the dam ------------------------------------------------------------------------------------------------------------
  // Its road (a ribbon on a fill, joined to WorldIndex before the chunk buckets are built): off I-10's north shoulder, up
  // the east abutment, along the crest, down the west abutment to the old valve house. Frame: centre D on the river, a
  // along the crest (the road's tangent there: east), v from the reservoir (-) toward the road (+).
  damFrame(S) {
    if (S._df) return S._df;
    const F = this.frame(S.anchor);
    return (S._df = { x: F.x, z: F.z, ax: F.tx, az: F.tz, vx: F.rx, vz: F.rz, L: (a, v) => ({ x: F.x + F.tx * a + F.rx * v, z: F.z + F.tz * a + F.rz * v }) });
  }
  damRoad(S) {
    const D = this.damFrame(S), R = RR.dam, half = (S.len ?? 220) / 2, ramp = R.crest / R.grade, hw = R.halfW;
    const cor = this.cor(S.anchor.road), sf = S.from?.s ?? S.anchor.s + 200, f = cor.at(sf), out = cor.section(sf).out;
    const P0 = { x: f.x - f.nx * (out + 1.5), z: f.z - f.nz * (out + 1.5) }; // the north shoulder's edge
    const key = [[P0.x, P0.z, 0]];
    const L = (a, v) => D.L(a, v);
    const A = L(half + ramp + 70, 60), B = L(half + ramp, 0), Cc = L(half, 0), Dd = L(-half, 0), E = L(-half - ramp, 0), Fp = L(-half - ramp - 110, -36);
    key.push([A.x, A.z, 0], [B.x, B.z, 0], [Cc.x, Cc.z, R.crest], [Dd.x, Dd.z, R.crest], [E.x, E.z, 0], [Fp.x, Fp.z, 0]);
    // Resample every 4 m, heights by straight runs between the key points (the corner at A softened by a short arc).
    const pts = [];
    for (let k = 1; k < key.length; k++) {
      const [ax, az, ay] = key[k - 1], [bx, bz, by] = key[k], l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / 4));
      for (let i = k === 1 ? 0 : 1; i <= n; i++) { const t = i / n; pts.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, y: 0.034 + (ay + (by - ay) * t), wl: hw, wr: hw }); }
    }
    // Round the corners a little (a 3-point average where the heading turns) so the ribbon's edges do not cross.
    for (let pass = 0; pass < 6; pass++) for (let i = 1; i < pts.length - 1; i++) { const p = pts[i], a0 = pts[i - 1], b0 = pts[i + 1]; const turn = Math.abs(Math.atan2(b0.x - p.x, b0.z - p.z) - Math.atan2(p.x - a0.x, p.z - a0.z)); if (turn > 0.02 && turn < 6.26 && p.y < 0.2) { p.x = (a0.x + p.x * 2 + b0.x) / 4; p.z = (a0.z + p.z * 2 + b0.z) / 4; } }
    const rib = makeRibbon(`${S.id} road`, 'county', 'county', pts, { site: S.id, halfW: hw });
    this.W.ribbons.push(rib); this.addedRibbons.push(rib); this.ribById.set(rib.id, rib);
    const piece = { kind: 'ramp', rib, halfW: hw + 0.6, x0: rib.x0, z0: rib.z0, x1: rib.x1, z1: rib.z1, site: S.id };
    this.W.pieces.push(piece); this.addedPieces.push(piece);
    // Guardrails where the fill stands taller than the rail rule, both edges.
    for (const sd of [-1, 1]) {
      const rp = [];
      for (let i = 0; i < rib.n; i++) {
        if (rib.y[i] < STREAM.ramp.rail) { if (rp.length > 1) { const rr = { pts: rp.slice(), site: S.id }; this.W.rails.push(rr); this.addedRails.push(rr); } rp.length = 0; continue; }
        const i0 = Math.max(0, i - 1), i1 = Math.min(rib.n - 1, i + 1), tx = rib.x[i1] - rib.x[i0], tz = rib.z[i1] - rib.z[i0], l = Math.hypot(tx, tz) || 1;
        if (i % 2 === 0 || i === rib.n - 1) rp.push({ x: rib.x[i] - (tz / l) * sd * (hw + 0.4), z: rib.z[i] + (tx / l) * sd * (hw + 0.4), y: rib.y[i] - 0.034 });
      }
      if (rp.length > 1) { const rr = { pts: rp.slice(), site: S.id }; this.W.rails.push(rr); this.addedRails.push(rr); }
    }
    S._road = rib;
  }
  // The dam's works over its fill: the upstream face in concrete, the spillway (gate piers with radial gates over the
  // chute, a stilling basin at its foot), the gatehouse and the gate wheel on the crest, the intake tower standing in
  // the drained bed with its catwalk, the cistern at the east toe, the old bed upstream.
  dam(S, rec, rng) {
    const D = this.damFrame(S), R = RR.dam, half = (S.len ?? 220) / 2, top = R.halfW + 0.7, slope = 2 * R.crest, hc = R.crest;
    const L = (a, v) => D.L(a, v);
    const yawA = Math.atan2(D.ax, D.az), yawV = Math.atan2(D.vx, D.vz); // a box's local z along the crest / across it (toward the road)
    const faceAng = Math.atan2(hc, slope), faceLen = Math.hypot(slope, hc) + 0.4;
    // The upstream face: concrete panels laid on the fill's slope (it rises 1 in 2 from the bed to the crest's edge).
    for (let a = -half; a < half - 0.1; a += 20) { const m = L(a + 10, -(top + slope / 2)); this.M('walls', m.x, hc / 2, m.z, yawV, -faceAng, 0, 20.05, 0.4, faceLen, CONCRETE); }
    // A parapet wall on the upstream edge of the crest (the guardrails ride the road's edges).
    for (let a = -half; a < half - 0.1; a += 22) { const m = L(a + 11, -top + 0.2); this.M('walls', m.x, hc + 0.5, m.z, yawA, 0, 0, 0.5, 1.0, 22.05, CONCRETE_D); this.OB(m.x, m.z, 22, 0.5, D.ax, D.az, hc + 1.0, 'dam', hc - 0.6); }
    // The spillway at the west end: five piers, four radial gates between them, the hoist deck and its house on top;
    // the chute down the downstream face; the stilling basin at its foot.
    const s0 = -half + 22, s1 = s0 + 40, gw = (s1 - s0) / 4;
    for (let k = 0; k <= 4; k++) {
      const a = s0 + k * gw, m = L(a, -top - 1.2);
      this.M('walls', m.x, hc + 1.5, m.z, yawA, 0, 0, 4.4, 5.0, 1.6, CONCRETE);
      this.B(m.x - 1.2, m.z - 1.2, m.x + 1.2, m.z + 1.2, hc + 4, 'dam', hc - 0.6);
      if (k < 4) { const g = L(a + gw / 2, -top - 2.4); this.M('props', g.x, hc - 0.6, g.z, yawA, 0, -0.25, 0.45, 4.2, gw - 1.7, rng.pick(['#7a4a2a', '#6a3e22', '#8a5a34'])); }
    }
    const hd = L((s0 + s1) / 2, -top - 1.2);
    this.M('walls', hd.x, hc + 4.3, hd.z, yawA, 0, 0, 4.4, 0.6, s1 - s0 + 2, CONCRETE_D);
    this.M('walls', hd.x, hc + 5.7, hd.z, yawA, 0, 0, 3.4, 2.2, 9, '#9a948a'); this.M('roofs', hd.x, hc + 6.95, hd.z, yawA, 0, 0, 4.0, 0.3, 9.6, '#6a5e52');
    const cm = L((s0 + s1) / 2, top + slope / 2);
    this.M('walls', cm.x, hc / 2 - 0.15, cm.z, yawV, faceAng, 0, s1 - s0, 0.4, faceLen, CONCRETE_D);
    for (const a of [s0 - 0.6, s1 + 0.6]) {
      const w = L(a, top + slope / 2);
      this.M('walls', w.x, hc / 2 + 0.6, w.z, yawV, faceAng, 0, 0.6, 1.8, faceLen, CONCRETE);
      this.OB(w.x, w.z, slope, 0.6, D.vx, D.vz, hc, 'dam');
    }
    const bm = L((s0 + s1) / 2, top + slope + 14);
    this.M('floors', bm.x, 0.05, bm.z, yawA, 0, 0, 26, 0.06, s1 - s0 + 6, '#8a8478');
    for (const a of [s0 - 3, s1 + 3]) { const w = L(a, top + slope + 14); this.M('walls', w.x, 0.6, w.z, yawV, 0, 0, 0.6, 1.2, 26, CONCRETE); this.OB(w.x, w.z, 26, 0.6, D.vx, D.vz, 1.2, 'dam'); }
    for (let k = 0; k < 12; k++) { const b = L(s0 + rng.range(-4, s1 - s0 + 4), top + slope + rng.range(28, 44)); this.P('boulders', b.x, 0.3, b.z, rng.range(0.6, 1.5), rng.range(0.4, 0.7), rng.range(0.6, 1.5), '#7a7466', rng() * 6); }
    // The gatehouse on the crest's east end, over the upstream edge; the gate wheel on the hoist deck's road side.
    const gh = L(half - 12, -top - 2.2);
    this.M('walls', gh.x, hc + 1.6, gh.z, yawA, 0, 0, 4.2, 3.2, 6, '#b0a690'); this.M('roofs', gh.x, hc + 3.35, gh.z, yawA, 0, 0, 5.0, 0.3, 6.8, '#5a4a3a');
    this.OB(gh.x, gh.z, 6, 4.2, D.ax, D.az, hc + 3.2, 'dam', hc - 0.6);
    const wh = L((s0 + s1) / 2, -R.halfW + 0.4);
    this.M('props', wh.x, hc + 1.1, wh.z, yawA, 0, 0, 1.4, 1.4, 0.12, '#9a3a22'); this.P('props', wh.x, hc + 0.5, wh.z, 0.25, 1.0, 0.25, '#3a3632');
    rec.wheel = this.spot(S, 'wheel', wh.x, wh.z, { id: `${S.id}:wheel`, y: hc, r: 3.2 });
    rec.crest = { ...L(0, 0), y: hc }; rec.wheelAt = { x: wh.x, z: wh.z };
    // The intake tower in the drained bed upstream, its catwalk to the crest.
    const it = L(-half * 0.25, -top - slope - 34);
    this.P('barrels', it.x, 8, it.z, 7.6, 14.5, 7.6, CONCRETE); this.P('walls', it.x, 16.6, it.z, 5.4, 1.6, 5.4, '#8e877a', yawA);
    this.B(it.x - 3.4, it.z - 3.4, it.x + 3.4, it.z + 3.4, 17, 'dam');
    const cw0 = L(-half * 0.25, -top), cw1 = L(-half * 0.25, -top - slope - 30.5);
    this.beam('props', cw0.x, hc + 0.2, cw0.z, cw1.x, hc + 0.2, cw1.z, 0.25, '#5a5650', 1.4);
    // The drained bed: silt flats where the lake stood, mud-cracked; dead snags and an old boat on its side.
    for (let k = 0; k < 9; k++) { const b = L(rng.range(-half - 120, half + 120), -top - slope - rng.range(40, 250)); this.M('floors', b.x, 0.03 + k * 0.002, b.z, rng() * 3, 0, 0, rng.range(60, 140), 0.04, rng.range(40, 90), rng.pick(['#b4a68a', '#a89a7e', '#bfb296'])); }
    for (let k = 0; k < 14; k++) { const b = L(rng.range(-half - 100, half + 100), -top - slope - rng.range(40, 240)); this.flor('deadtree', b.x, b.z, rng.range(3, 6)); }
    const bt = L(half * 0.4, -top - slope - 90); this.P('props', bt.x, 0.5, bt.z, 2.2, 1.0, 6.4, '#d8d2c2', 0.6); this.P('props', bt.x, 1.1, bt.z, 1.8, 0.6, 2.2, '#4a5a62', 0.6); this.B(bt.x - 2, bt.z - 2, bt.x + 2, bt.z + 2, 1.2, 'wreck');
    // The cistern at the east toe (the dam's water, sold or drawn).
    const cs = L(half - 30, top + slope + 12);
    this.P('barrels', cs.x, 1.2, cs.z, 9, 2.2, 9, CONCRETE_D); this.P('barrels', cs.x, 2.3, cs.z, 8.2, 0.05, 8.2, '#3f5a52');
    this.B(cs.x - 3.9, cs.z - 3.9, cs.x + 3.9, cs.z + 3.9, 2.4, 'dam');
    this.tanks.push(rec.cistern = this.spot(S, 'water', cs.x, cs.z, { id: `${S.id}:cistern`, r: 5.2, source: 'cistern', cap: RR.tank.cistern.cap, perDay: RR.tank.cistern.perDay }));
    // The keepers' posts: the wheel and the crest by the gatehouse.
    rec.posts = { wheel: { x: wh.x + D.vx * 1.6, z: wh.z + D.vz * 1.6, y: hc }, crest: { x: gh.x + D.vx * 4.4, z: gh.z + D.vz * 4.4, y: hc } };
    const rib = S._road;
    // Keep-out (the bed upstream; the fill keeps scatter off by the road rule) and the footprint (its own road excused).
    { const c = L(0, -top - slope - 140); this.keepOriented(c.x, c.z, (half + 140) * 2, 250, D.ax, D.az); }
    for (const [a, v] of [[(s0 + s1) / 2, top + slope + 20], [half - 30, top + slope + 12]]) { const c = L(a, v); this.keepRect(c.x - 26, c.z - 26, c.x + 26, c.z + 26); }
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [a, v] of [[-half - 160, -top - slope - 270], [half + 160, -top - slope - 270], [-half - 160, top + slope + 30], [half + 160, top + slope + 30]]) { const p = L(a, v); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const fp = this.foot(S.id, x0, z0, x1, z1, rib);
    fp.roads = fp.roads.filter((id) => !id.startsWith('I-10')); // its own road runs off I-10's shoulder
    rec.x = D.x; rec.z = D.z; rec.r = half + 260; rec.road = rib.id;
    rec.river = S.river ?? null;
  }

  // ---- power lines --------------------------------------------------------------------------------------------------------
  line(Lr) {
    const cor = this.cor(Lr.road), P = RR.pylon, Wr = RR.wire;
    const rng = rngOf(hash32(this.seed, idHash(Lr.id)));
    // The route in (s, u) -> world points, resampled every 4 m with the arc length along it.
    const pts = [];
    for (let k = 1; k < Lr.route.length; k++) {
      const [s0, u0] = Lr.route[k - 1], [s1, u1] = Lr.route[k], n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / 8));
      for (let i = k === 1 ? 0 : 1; i <= n; i++) { const t = i / n, s = s0 + (s1 - s0) * t, u = u0 + (u1 - u0) * t, f = cor.at(s); pts.push({ x: f.x + f.nx * u, z: f.z + f.nz * u, s, u }); }
    }
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const at = (d) => { let i = 1; while (i < pts.length - 1 && cum[i] < d) i++; const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), a = pts[i - 1], b = pts[i], tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1; return { x: a.x + tx * f, z: a.z + tz * f, tx: tx / l, tz: tz / l, s: a.s + (b.s - a.s) * f, u: a.u + (b.u - a.u) * f }; };
    const total = cum[cum.length - 1];
    const blockedAt = (q) => {
      if (inIsland(q.x, q.z, 40)) return 'island';
      if (Math.abs(q.u) < cor.section(q.s).out + 6 && !Lr.down?.some((d) => Math.abs(d.s - q.s) < 30)) return 'interstate';
      const rb = this.nearRoad(q.x, q.z, P.clear, null, true); if (rb) return rb.id;
      if (this.solid(q.x, q.z, P.base / 2 + 1)) return 'site';
      return null;
    };
    const towers = []; const tT0 = performance.now();
    for (let d = 0; d <= total + 0.1; d += P.span) {
      let q = at(Math.min(d, total)), slid = 0;
      while (blockedAt(q) && slid < P.slide && d + slid < total) { slid += 8; q = at(Math.min(total, d + slid)); }
      const why = blockedAt(q);
      if (why) { this.warnings.push(`${Lr.id}: no tower near ${Math.round(q.s)} (${why})`); continue; }
      const fall = Lr.down?.find((dn) => Math.abs(dn.s - q.s) < P.span / 2);
      // A fallen tower stands (stood) exactly where its row says: its (s, u) on the road, so its length lands where meant.
      if (fall && fall.u !== undefined) { const fd = cor.at(fall.s); Object.assign(q, { x: fd.x + fd.nx * fall.u, z: fd.z + fd.nz * fall.u, s: fall.s, u: fall.u }); }
      towers.push({ ...q, down: !!fall, fall: fall?.fall ?? null, k: towers.length });
    }
    this.prof[Lr.id + ':towers'] = +(performance.now() - tT0).toFixed(1);
    const line = { id: Lr.id, name: Lr.name, towers: towers.length, down: towers.filter((t) => t.down).length, from: Lr.from, to: Lr.to };
    this.lines.push(line);
    // Each tower: four legs up to a waist, the mast to the peak, two cross-arms, insulator strings, two belts of girts.
    const armTips = (T) => { const ax = -T.tz, az = T.tx; return [[ax * -P.arm, P.armY[0], az * -P.arm], [ax * P.arm, P.armY[0], az * P.arm], [0, P.armY[1], 0]]; };
    for (const T of towers) {
      const ax = -T.tz, az = T.tx, b = P.base / 2, waist = 0.9, wy = 14;
      if (!T.down) {
        for (const [p, q] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.beam('rails', T.x + (T.tx * p + ax * q) * b, 0, T.z + (T.tz * p + az * q) * b, T.x + (T.tx * p + ax * q) * waist, wy, T.z + (T.tz * p + az * q) * waist, 0.22, STEEL);
        this.M('rails', T.x, (wy + P.h) / 2, T.z, Math.atan2(T.tx, T.tz), 0, 0, 1.4, P.h - wy, 1.4, '#6a665e');
        for (const y of [5, 10]) { const k = b - (b - waist) * (y / wy); this.M('rails', T.x, y, T.z, Math.atan2(T.tx, T.tz), 0, 0, k * 2, 0.12, k * 2, '#55524c'); }
        this.M('rails', T.x, P.armY[0], T.z, Math.atan2(ax, az), 0, 0, 0.5, 0.5, P.arm * 2 + 0.4, STEEL);
        this.M('rails', T.x, P.armY[1], T.z, Math.atan2(ax, az), 0, 0, 0.4, 0.4, P.arm * 1.1, STEEL);
        for (const [ox, oy, oz] of armTips(T)) this.P('props', T.x + ox, oy - 0.9, T.z + oz, 0.2, 1.8, 0.2, '#8a8478');
        this.P('props', T.x, 0.15, T.z, P.base + 0.6, 0.3, P.base + 0.6, CONCRETE_D, Math.atan2(T.tx, T.tz)); // footings
        for (const [p, q] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const lx = T.x + (T.tx * p + ax * q) * b, lz = T.z + (T.tz * p + az * q) * b; this.B(lx - 0.3, lz - 0.3, lx + 0.3, lz + 0.3, 6, 'pylon'); }
        this.keepRect(T.x - b - 1, T.z - b - 1, T.x + b + 1, T.z + b + 1);
        this.pylons.push({ id: `${Lr.id}:${T.k}`, x: T.x, z: T.z, s: T.s, u: T.u, down: false });
      } else {
        // Fallen across the road: lying from its crumpled footings toward the carriageway it stood beside.
        // fall 'road': toward the carriageway it stood beside (u toward 0); otherwise away from it.
        const fn = cor.at(T.s), k2 = (T.u < 0 ? 1 : -1) * (T.fall === 'road' ? 1 : -1), dx = fn.nx * k2, dz = fn.nz * k2;
        const H = P.h, tipX = T.x + dx * H, tipZ = T.z + dz * H, midX = (T.x + tipX) / 2, midZ = (T.z + tipZ) / 2, yaw = Math.atan2(dx, dz);
        const sx = -dz, sz = dx; // across the fallen tower
        for (const q of [-1, 1]) this.beam('rails', T.x + sx * q * 1.6, 1.6, T.z + sz * q * 1.6, tipX + sx * q * 0.5, 0.45, tipZ + sz * q * 0.5, 0.26, STEEL);
        for (const q of [-1, 1]) this.beam('rails', T.x + sx * q * 1.4, 0.3, T.z + sz * q * 1.4, tipX + sx * q * 0.4, 0.25, tipZ + sz * q * 0.4, 0.22, '#55524c');
        for (let k = 1; k < 7; k++) { const t = k / 7, x = T.x + dx * H * t, z = T.z + dz * H * t; this.M('rails', x, 1.2 - t * 0.8, z, yaw, 0, 0.3 * (k % 2 ? 1 : -1), 3.2 - t * 2.2, 0.12, 0.14, '#55524c'); }
        // The cross-arm, bent, lying across the lanes near the tip; the crumpled footings; torn-up asphalt.
        const armX = T.x + dx * P.armY[0], armZ = T.z + dz * P.armY[0];
        this.M('rails', armX, 0.35, armZ, Math.atan2(sx, sz) + 0.12, 0, 0.08, 0.5, 0.5, P.arm * 2 + 0.4, STEEL);
        for (const [p, q] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.P('props', T.x + (T.tx * p + ax * q) * b, 0.3, T.z + (T.tz * p + az * q) * b, 0.9, 0.6, 0.9, CONCRETE_D, rng() * 2);
        for (let k = 0; k < 8; k++) this.P('props', T.x + dx * rng.range(2, H) + sx * rng.range(-3, 3), 0.06, T.z + dz * rng.range(2, H) + sz * rng.range(-3, 3), rng.range(0.4, 1.4), 0.1, rng.range(0.3, 1.0), rng.pick(['#3a3632', '#2a2826', '#5a5650']), rng() * 3);
        // Solid: the lattice along its length, a lane-blocking hazard you drive round (or into).
        this.OB(midX, midZ, H, RR.fallen.w, dx, dz, RR.fallen.h, 'pylon');
        this.keepOriented(midX, midZ, H + 4, RR.fallen.w + 4, dx, dz);
        const hz = { id: `${Lr.id}:down${T.k}`, line: Lr.id, kind: 'downed line', x: midX, z: midZ, tip: { x: tipX, z: tipZ }, foot: { x: T.x, z: T.z }, s: T.s, u: T.u, len: H, dir: { x: dx, z: dz }, road: Lr.road };
        this.hazards.push(hz);
        this.pylons.push({ id: `${Lr.id}:${T.k}`, x: T.x, z: T.z, s: T.s, u: T.u, down: true });
        T.tipX = tipX; T.tipZ = tipZ;
      }
    }
    // The conductors: three per span between standing towers; where a tower is down, its wires lie across the road
    // and droop from the next standing tower's arms to the ground.
    const conductor = (ax, ay, az, bx, by, bz, sag) => {
      const n = Wr.segs; let px = ax, py = ay, pz = az;
      for (let i = 1; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t - 4 * sag * t * (1 - t); this.beam('rails', px, py, pz, x, y, z, Wr.thick, '#2a2826'); px = x; py = y; pz = z; }
    };
    for (let i = 1; i < towers.length; i++) {
      const A = towers[i - 1], Bt = towers[i], span = Math.hypot(Bt.x - A.x, Bt.z - A.z), sag = span * Wr.sag;
      if (span > P.span * 2.6) continue; // a gap where towers were skipped: the line is broken there
      const tA = armTips(A), tB = armTips(Bt);
      if (!A.down && !Bt.down) { for (let c = 0; c < 3; c++) conductor(A.x + tA[c][0], tA[c][1] - 1.8, A.z + tA[c][2], Bt.x + tB[c][0], tB[c][1] - 1.8, Bt.z + tB[c][2], sag); continue; }
      const up = A.down ? Bt : A, dn = A.down ? A : Bt, tU = armTips(up);
      for (let c = 0; c < 3; c++) {
        // From the standing tower's arm down to the ground part way, then along the ground to the fallen tower's tip and
        // on across the lanes (drawn just above the asphalt: a tangle to drive over, not a wall).
        const gx = up.x + (dn.x - up.x) * 0.55 + (c - 1) * 2, gz = up.z + (dn.z - up.z) * 0.55 + (c - 1) * 2;
        conductor(up.x + tU[c][0], tU[c][1] - 1.8, up.z + tU[c][2], gx, 0.08, gz, 1.5);
        conductor(gx, 0.08, gz, dn.tipX + (c - 1) * 1.6, 0.06, dn.tipZ + (c - 1) * 2.4, 0);
        const dx = dn.tipX - dn.x, dz = dn.tipZ - dn.z, dl = Math.hypot(dx, dz);
        conductor(dn.tipX + (c - 1) * 1.6, 0.06, dn.tipZ + (c - 1) * 2.4, dn.tipX + (dx / dl) * (22 + c * 4) + (c - 1) * 3, 0.05, dn.tipZ + (dz / dl) * (22 + c * 4) + (c - 1) * 3, 0);
      }
    }
    void rng;
  }

  // ---- billboards -------------------------------------------------------------------------------------------------------
  billboard(Bd) {
    const cor = this.cor(Bd.road), s = Bd.s ?? Bd.mile * STREAM.mile;
    const dir = Bd.dir === cor.dirs[0][0] ? 1 : Bd.dir === cor.dirs[1][0] ? -1 : 0;
    if (!dir) throw new Error(`dir ${Bd.dir} is not ${cor.dirs[0][0]} or ${cor.dirs[1][0]} on ${cor.id}`);
    const f = cor.at(s), u = dir * (cor.section(s).out + RR.billboard.off), x = f.x + f.nx * u, z = f.z + f.nz * u;
    const rng = rngOf(hash32(this.seed, idHash(Bd.id)));
    let face, next = null;
    if (Bd.kind === 'exit') {
      // The next exit ahead in the direction of travel, and how far: the map's own numbers (game miles along the road).
      const X = cor.exits.filter((o) => (o.s - s) * dir > 0).sort((a, b) => Math.abs(a.s - s) - Math.abs(b.s - s))[0];
      if (!X) throw new Error('no exit ahead');
      const miles = Math.max(1, Math.round(Math.abs(X.s - s) / STREAM.mile));
      next = { id: X.id, number: X.number, name: X.name, miles, metres: Math.round(Math.abs(X.s - s)), dead: !!X.dead };
      const what = X.dead ? 'NO SERVICES' : Bd.art === 'trade' ? 'FUEL · WATER · TRADE' : Bd.art === 'fuel' ? 'FUEL · FOOD' : Bd.art === 'town' ? 'HOLDOUT · SAFE BEDS' : '';
      face = { kind: 'exit', lines: [`EXIT ${X.number}`, X.name, `${miles} ${miles === 1 ? 'MILE' : 'MILES'}`, what], cond: Bd.cond, art: Bd.art ?? 'none' };
    } else if (Bd.kind === 'advert') face = { kind: 'advert', ad: Bd.ad, lines: ADVERTS[Bd.ad].lines, cond: Bd.cond };
    else face = { kind: Bd.kind, lines: Bd.lines, under: rng.pick(Object.keys(ADVERTS)), cond: Bd.cond };
    const rec = { id: Bd.id, road: cor.id, kind: Bd.kind, s, mile: +(s / STREAM.mile).toFixed(2), dir: Bd.dir, x, z, next, lines: face.lines.filter(Boolean) };
    this.billboards.push(rec);
    this.pendingBills.push({ id: Bd.id, x, z, w: RR.billboard.w, h: RR.billboard.h, lift: RR.billboard.lift, legs: true, face, rot: Math.atan2(f.tx, f.tz), rec });
    this.keepRect(x - 8, z - 4, x + 8, z + 4);
    this.foot(`billboard ${Bd.id}`, x - 7, z - 2, x + 7, z + 2);
  }
  // Every face goes into the atlas in order; then each board's legs, catwalk and its face (a matrix in the bills pool).
  finishBills() {
    const n = this.pendingBills.length;
    this.pendingBills.forEach((b, i) => { b.face.id = b.id; this.faces.push(b.face); b.rect = faceRect(i, n); });
    for (const b of this.pendingBills) {
      if (b.legs) {
        const tx = Math.sin(b.rot ?? 0), tz = Math.cos(b.rot ?? 0);
        // Legs across the board's width (east-west on screen: the face is drawn upright toward the camera).
        for (const q of [-0.36, 0, 0.36]) { const px = b.x + q * b.w, pz = b.z; this.P('trunks', px, (b.lift - 0.3) / 2, pz, 1.6, b.lift - 0.3, 1.6, '#4a3a2a'); this.B(px - 0.25, pz - 0.25, px + 0.25, pz + 0.25, b.lift, 'billboard'); } // (under the face: it tilts back over them)
        this.P('props', b.x, b.lift - 0.5, b.z + 1.2, b.w + 0.4, 0.12, 0.9, '#3a3632'); // the catwalk
        void tx; void tz;
      }
      this.M('bills', b.x, b.lift + b.h * 0.32, b.z, 0, -1.22, 0, b.w, b.h, 1, '#ffffff', b.rect);
    }
  }

  // ---- what chunks ask (the towner interface: world/chunkgen.js) ---------------------------------------------------------
  // Items, flora and boxes by chunk (an integer key: (cx + 32768) * 65536 + cz + 32768), and every chunk touched.
  index() {
    const own = (this.ownItems = new Map()), touch = (this.touchSet = new Set());
    const K = (cx, cz) => (cx + 32768) * 65536 + cz + 32768, key = (x, z) => K(Math.floor(x / C), Math.floor(z / C));
    const add = (map, k, v) => { let l = map.get(k); if (!l) map.set(k, (l = [])); l.push(v); };
    for (const it of this.items) { const k = key(it.x ?? it.e[0], it.z ?? it.e[2]); add(own, k, it); touch.add(k); }
    this.ownFlora = new Map(); for (const f of this.flora) { const k = key(f[1], f[2]); add(this.ownFlora, k, f); touch.add(k); }
    this.boxBuckets = new Map();
    for (const b of this.boxes) for (let cx = chunkOf(b.x0 - 3); cx <= chunkOf(b.x1 + 3); cx++) for (let cz = chunkOf(b.z0 - 3); cz <= chunkOf(b.z1 + 3); cz++) { const k = K(cx, cz); add(this.boxBuckets, k, b); touch.add(k); }
    for (const b of this.blocks) for (let cx = chunkOf(b.x0 - 4); cx <= chunkOf(b.x1 + 4); cx++) for (let cz = chunkOf(b.z0 - 4); cz <= chunkOf(b.z1 + 4); cz++) touch.add(K(cx, cz));
    for (const L of this.lots) { const l = L.lot; for (let cx = chunkOf(l.x0 - 4); cx <= chunkOf(l.x1 + 4); cx++) for (let cz = chunkOf(l.z0 - 4); cz <= chunkOf(l.z1 + 4); cz++) touch.add(K(cx, cz)); }
    this.K = K;
    this.chunks = touch.size;
  }
  touches(cx, cz) { return this.touchSet.has(this.K(cx, cz)); }
  streets() { return []; }
  blocksOver(x0, z0, x1, z1, fn) { for (const b of this.blocks) if (b.x1 > x0 && b.x0 < x1 && b.z1 > z0 && b.z0 < z1) fn(b); }
  pads(b) { return b.pads ?? []; }
  around(cx, cz, m = 4) {
    const ox = cx * C, oz = cz * C, X1 = ox + C, Z1 = oz + C, mine = [], near = [], key = `${cx},${cz}`;
    for (const L of this.lots) {
      if (L.cx >= ox && L.cx < X1 && L.cz >= oz && L.cz < Z1) { L.owner = key; mine.push(L); continue; }
      if (L.lot.x1 > ox - m && L.lot.x0 < X1 + m && L.lot.z1 > oz - m && L.lot.z0 < Z1 + m) { L.owner ??= `${chunkOf(L.cx)},${chunkOf(L.cz)}`; near.push(L); }
    }
    return { mine, near };
  }
  geo(L) { return this.W.ring.geo(L); }
  wrecks() { return []; }
  railIn() { return null; }
  extras(cx, cz) {
    const k = this.K(cx, cz);
    return { items: this.ownItems.get(k) ?? [], flora: this.ownFlora.get(k) ?? [], boxes: this.boxBuckets.get(k) ?? [] };
  }
  // Scatter keeps off a site, a field, a tower's footings, a billboard.
  solid(x, z, r = 0) {
    const l = this.keep.get(Math.floor(x / 64) * 100003 + Math.floor(z / 64));
    if (!l) return false;
    for (const k of l) {
      if (k.ha !== undefined) { const dx = x - k.cx, dz = z - k.cz, a = dx * k.tx + dz * k.tz, u = -dx * k.tz + dz * k.tx; if (Math.abs(a) < k.ha + r && Math.abs(u) < k.hu + r) return true; }
      else if (x > k.x0 - r && x < k.x1 + r && z > k.z0 - r && z < k.z1 + r) return true;
    }
    return false;
  }
  // No mesa on or beside a site.
  nearSite(x, z, R) { for (const s of this.sites) if (Math.hypot(s.x - x, s.z - z) < s.r + R) return true; return false; }
  cityK() { return 0; }
  inCity() { return false; }
  depth() { return -1e9; }

  // ---- reads ------------------------------------------------------------------------------------------------------------
  siteById(id) { return this.sites.find((s) => s.id === id) ?? null; }
  spotById(id) { return this.spots.find((s) => s.id === id) ?? null; }
  near(x, z, r = 300) { return this.sites.map((s) => ({ s, d: Math.hypot(s.x - x, s.z - z) - s.r })).filter((q) => q.d < r).sort((a, b) => a.d - b.d).map((q) => q.s); }
  nameAt(x, z) {
    for (const s of this.sites) if (Math.hypot(s.x - x, s.z - z) < Math.min(s.r, 120)) return s.name;
    return null;
  }
  // Every footprint's chunk keys (the validator's pinned-chunk rule reads them).
  chunkKeys() { return [...this.touchSet].map((k) => `${Math.floor(k / 65536) - 32768},${(k % 65536) - 32768}`); }
}
