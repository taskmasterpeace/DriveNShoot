// THE PHOENIX RING, R1 (docs/design/WEB_STREAMING.md §1.3): the dead metro around the island, as a pure function of the
// rows in data/ring.js, the world seed and the I-10 corridor. Chunks (world/chunkgen.js) ask it for what they hold:
//   streets  - the island's own lattice carried outward (a line every 80 m; every 4th an arterial), from the first ring
//              street that hugs the island out to a lobed edge near 1.5 km; local streets stop at I-10, arterials cross it
//   blocks   - zoned by rules (ruins at the edge, the strip on the freeway and arterials, the yards along the rail and the
//              old river's wash, houses everywhere else), each laid out as lots
//   lots     - buildings: walk-in shells (walls with door gaps to the street, window holes sight and rounds pass, a floor, a
//              roof that hides when you are inside, partitions with doorways), furniture, containers, beds, yard fences
//   wrecks   - cars left at the kerb; the Iron Line's dead track running on through the yards, boxcars on its sidings
// Ownership: a building belongs to the chunk holding its centre (that chunk draws it and holds its containers); its
// collision is clipped into every chunk it overlaps. A chunk builds at most RING.budget.buildings of its own lots, in id
// order, so any chunk can tell which of a neighbour's lots stand. Everything is cached, and every cache may be dropped:
// the answer is the same when it is computed again.
import { RING, ZONE_RULES, ZONES, KINDS, UNITS, FURNITURE, STREET_NAMES, RESIDENTS, RES_RULES, YARD } from '../data/ring.js';
import { C, hash32, rngOf } from './geo.js';
import { H_NAMES, V_NAMES } from './city.js';
import { floorplan, NavProbe } from './floorplan.js';
import { ROOMS, PLAN_RULES } from '../data/floorplans.js';
import { AUTHORED } from '../data/authored.js';
import { placeAuthored } from './authored.js';

const G = RING.grid, T = RING.wall, TAU = Math.PI * 2;
const AE = RING.arterialEvery;
const mod = (a, n) => ((a % n) + n) % n;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const snap = (v) => Math.floor(v) + 0.5; // a doorway centred on a 1 m nav cell's centre (chunk origins are whole metres)
const hw = (i) => (mod(i, AE) === 0 ? RING.arterial : RING.street) / 2;
const isArt = (i) => mod(i, AE) === 0;
// Furniture candidates (ring.js placeOne): a shared buffer, never allocated per piece.
const CMAX = 768, CB = new Float64Array(CMAX * 4), CW = new Uint8Array(CMAX), CS = new Float32Array(CMAX), CU = new Uint8Array(CMAX);
const WALLS = ['N', 'S', 'W', 'E', 'C', 'Cz', 'floor'], CENTRE_OFF = [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]];
const pickW = (rng, rows) => { let t = 0; for (const r of rows) t += r[1]; let p = rng() * t; for (const r of rows) if ((p -= r[1]) < 0) return r[0]; return rows[rows.length - 1][0]; };
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

export class Ring {
  // H_NAMES / V_NAMES: the island's own street names (world/city.js), index 0 = the line at -320.
  constructor(W, names = { h: H_NAMES, v: V_NAMES }) {
    this.W = W;
    this.seed = hash32(W.seed, 0x52494e47);
    this.names = names;
    this.blockCache = new Map();
    this.ownCache = new Map();
    this.I = RING.island + RING.islandPad;
    // How far the ring can reach (the lobed edge plus the freeway tail), for quick rejects.
    let mx = RING.radius; for (const [, a] of RING.wobble) mx += Math.abs(a);
    this.reach = mx + RING.freewayTail.reach + 40;
    this.kMax = Math.ceil(this.reach / G) + 1;
    this.built = 0; this.geoBuilt = 0;
    // Authored buildings (world/authored.js; rows in data/authored.js, more added live by the `author` command): each
    // stands in its block in place of the generator's lot(s). None: the ring is exactly what it was.
    this.authored = AUTHORED.slice();
    // I-10 inside the ring's reach, bucketed in 64 m cells: W.project walks a kilometre bucket per call, too slow for a
    // street sampled every 2 m.
    const c = W.cl, R = this.reach + 400;
    this.fwCells = new Map();
    for (let i = 0; i < c.n - 1; i++) {
      const ax = c.x[i], az = c.z[i], bx = c.x[i + 1], bz = c.z[i + 1];
      if (Math.min(Math.abs(ax), Math.abs(bx)) > R || Math.min(Math.abs(az), Math.abs(bz)) > R) continue;
      for (let gx = Math.floor(Math.min(ax, bx) / 64); gx <= Math.floor(Math.max(ax, bx) / 64); gx++) for (let gz = Math.floor(Math.min(az, bz) / 64); gz <= Math.floor(Math.max(az, bz) / 64); gz++) {
        const k = gx * 8192 + gz; let l = this.fwCells.get(k); if (!l) this.fwCells.set(k, (l = [])); l.push(i);
      }
    }
    this._fw = { d: Infinity, s: 0, x: 0, z: 0 };
  }

  // Nearest point of I-10 within maxD of (x, z): { d, s, x, z } (a shared record: read it before the next call). d is
  // Infinity when the freeway is farther than maxD.
  fwy(x, z, maxD = 64) {
    const o = this._fw, c = this.W.cl, r = Math.ceil(maxD / 64), gx = Math.floor(x / 64), gz = Math.floor(z / 64);
    o.d = Infinity;
    let stamp = (this._fwStamp = (this._fwStamp ?? 0) + 1);
    for (let ix = -r; ix <= r; ix++) for (let iz = -r; iz <= r; iz++) {
      const l = this.fwCells.get((gx + ix) * 8192 + gz + iz);
      if (!l) continue;
      for (let q = 0; q < l.length; q++) {
        const i = l[q], ax = c.x[i], az = c.z[i], dx = c.x[i + 1] - ax, dz = c.z[i + 1] - az, l2 = dx * dx + dz * dz;
        let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
        if (d < o.d) { o.d = d; o.s = c.s[i] + (c.s[i + 1] - c.s[i]) * t; o.x = px; o.z = pz; }
      }
    }
    if (o.d > maxD) o.d = Infinity;
    return o;
  }

  // ---- the footprint ------------------------------------------------------------------------------------------------
  edgeAt(x, z) {
    const th = Math.atan2(z, x);
    let r = RING.radius;
    for (const [k, a, p] of RING.wobble) r += a * Math.sin(k * th + p);
    return r;
  }
  // How far inside the city (x, z) is (metres; negative outside). The strip runs on along I-10 past the edge.
  depth(x, z) {
    const r = Math.hypot(x, z);
    if (r > this.reach) return -(r - this.reach) - 1;
    const d = this.edgeAt(x, z) - r, F = RING.freewayTail;
    if (d >= 0 || d <= -F.reach) return d;
    // Past the edge but within the tail's reach: inside it as far as the nearer of its end and its side.
    const fw = this.fwy(x, z, F.half);
    return fw.d < F.half ? Math.min(F.reach + d, F.half - fw.d) : d;
  }
  inCity(x, z, m = 0) { return !(Math.abs(x) <= this.I && Math.abs(z) <= this.I) && this.depth(x, z) > -m; }
  // 0 outside, 1 well inside (the ground tint and the desert scatter follow it).
  cityK(x, z) {
    if (Math.abs(x) < this.I - 60 && Math.abs(z) < this.I - 60) return 0;
    const r = Math.hypot(x, z);
    if (r > this.reach + 200) return 0;
    const isl = Math.max(Math.abs(x), Math.abs(z)) - this.I;
    return smooth((this.depth(x, z) + 60) / 160) * smooth((isl + 30) / 60);
  }
  // Does chunk (cx, cz) hold any of the ring?
  touches(cx, cz) {
    const x0 = cx * C, z0 = cz * C, x1 = x0 + C, z1 = z0 + C;
    if (x0 > -this.I + 1 && x1 < this.I - 1 && z0 > -this.I + 1 && z1 < this.I - 1) return false;
    const nx = Math.max(x0, Math.min(0, x1)), nz = Math.max(z0, Math.min(0, z1));
    return Math.hypot(nx, nz) < this.reach + G;
  }

  // ---- blocks -------------------------------------------------------------------------------------------------------
  // Block (k, j): between lines x = 80k and 80(k+1), z = 80j and 80(j+1). Its lot area is inside the streets and walks.
  block(k, j) {
    const key = k * 4096 + j;
    let b = this.blockCache.get(key);
    if (b) return b;
    if (this.blockCache.size > 2400) { this.blockCache.clear(); this.ownCache.clear(); }
    b = this.makeBlock(k, j);
    this.blockCache.set(key, b);
    return b;
  }
  makeBlock(k, j) {
    const W = RING.walk;
    const x0 = k * G + hw(k) + W, x1 = (k + 1) * G - hw(k + 1) - W, z0 = j * G + hw(j) + W, z1 = (j + 1) * G - hw(j + 1) - W;
    const cx = (k + 0.5) * G, cz = (j + 0.5) * G, I = this.I;
    const b = { k, j, x0, z0, x1, z1, cx, cz, city: false, zone: null, lots: [] };
    if (Math.abs(k) > this.kMax || Math.abs(j) > this.kMax) return b;
    if (x0 - W < I && x1 + W > -I && z0 - W < I && z1 + W > -I) return b; // touches the island (with its walks)
    const depth = this.depth(cx, cz);
    if (depth <= 0) return b;
    b.city = true; b.depth = depth;
    const rng = rngOf(hash32(this.seed, k + 5000, j + 5000, 11));
    b.zone = this.zoneOf(b, rng);
    b.Z = ZONES[b.zone];
    this.layLots(b, rng);
    if (this.authored.length) placeAuthored(this, b);
    this.built++;
    return b;
  }
  zoneOf(b, rng) {
    const W = this.W;
    for (const R of ZONE_RULES) {
      if (R.edge && b.depth >= RING.edgeBelt) continue;
      if (R.freeway && !(this.fwy(b.cx, b.cz, R.freeway).d < R.freeway)) continue;
      if (R.near && !R.near.some((s) => segDist(b.cx, b.cz, s[0], s[1], s[2], s[3]) < R.within)) continue;
      if (R.arterial) { const on = isArt(b.k) || isArt(b.k + 1) || isArt(b.j) || isArt(b.j + 1); if (!on || rng() >= R.share) continue; }
      return R.zone;
    }
    return 'residential';
  }
  // Which side of the block faces what: the freeway's side for a strip block on I-10, an arterial's side, else by hash.
  frontOf(b, rng) {
    if (b.zone === 'strip') {
      const pr = this.fwy(b.cx, b.cz, 260);
      if (pr.d < 260) { const dx = pr.x - b.cx, dz = pr.z - b.cz; return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : (dz > 0 ? 'S' : 'N'); }
      if (isArt(b.j)) return 'N'; if (isArt(b.j + 1)) return 'S'; if (isArt(b.k)) return 'W'; if (isArt(b.k + 1)) return 'E';
    }
    return rng() < 0.5 ? 'N' : 'W';
  }

  // Lots: [{ id, kind, x0, z0, x1, z1 (the building), front, lot: {x0, z0, x1, z1} (its ground), ... }].
  layLots(b, rng) {
    const Z = b.Z, fr = this.frontOf(b, rng), W = b.x1 - b.x0, D = b.z1 - b.z0;
    // The block in its own frame: u along the front street, v away from it (0 = the front walk). Lots are laid in that
    // frame and turned into world rectangles; a building's `front` is the side its main door faces.
    const ns = fr === 'N' || fr === 'S';
    const U = ns ? W : D, V = ns ? D : W;
    const toWorld = (u0, v0, u1, v1, front) => {
      // front side of the block: N -> v from z0 down; S -> v from z1 up; W -> v from x0; E -> v from x1.
      let x0, x1, z0, z1;
      if (front === 'N') { x0 = b.x0 + u0; x1 = b.x0 + u1; z0 = b.z0 + v0; z1 = b.z0 + v1; }
      else if (front === 'S') { x0 = b.x0 + u0; x1 = b.x0 + u1; z0 = b.z1 - v1; z1 = b.z1 - v0; }
      else if (front === 'W') { z0 = b.z0 + u0; z1 = b.z0 + u1; x0 = b.x0 + v0; x1 = b.x0 + v1; }
      else { z0 = b.z0 + u0; z1 = b.z0 + u1; x0 = b.x1 - v1; x1 = b.x1 - v0; }
      return { x0, z0, x1, z1 };
    };
    const opp = { N: 'S', S: 'N', W: 'E', E: 'W' };
    const dens = b.zone === 'ruins' ? Z.density * (0.3 + 0.7 * smooth(b.depth / RING.edgeBelt)) : Z.density;
    const add = (kind, front, u0, u1, vSet, vDepthMax, lotV0, lotV1) => {
      const K = KINDS[kind], n = b.lots.length;
      const room = u1 - u0;
      let w = rng.range(K.w[0], K.w[1]), d = rng.range(K.d[0], K.d[1]);
      w = Math.min(w, room - 2.5); d = Math.min(d, vDepthMax);
      if (w < K.w[0] * 0.8 || d < K.d[0] * 0.8) return null;
      const off = (room - w) / 2, uc = u0 + room / 2 + rng.range(-1, 1) * Math.max(0, off - 1.5) * 0.6; // the centre (it was the left edge: a building sat half a width into the next lot, its neighbour's yard fence through it)
      const r = toWorld(uc - w / 2 + 0, vSet, uc + w / 2, vSet + d, front);
      const lot = toWorld(u0, lotV0, u1, lotV1, front);
      const L = { id: `R${b.k}.${b.j}.${n}`, kind, zone: b.zone, front, ...r, lot, cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2, seed: rng.int(0, 2147483647) };
      b.lots.push(L);
      return L;
    };
    const keep = (L) => {
      if (!L) return;
      // Off the freeway, off the Iron Line, out of the island.
      const half = Math.hypot(L.x1 - L.x0, L.z1 - L.z0) / 2;
      const pr = this.fwy(L.cx, L.cz, RING.freeway.lotClear + half + 8);
      const lotTouch = L.lot.x0 < RING.rail.x + RING.rail.clear && L.lot.x1 > RING.rail.x - RING.rail.clear;
      if (pr.d < RING.freeway.lotClear + half || lotTouch || (Math.abs(L.cx) < this.I + 10 && Math.abs(L.cz) < this.I + 10)) b.lots.splice(b.lots.indexOf(L), 1);
      else L.ok = true;
    };
    if (Z.lots === 'houses') {
      // Three lots along the front street and three along the back one, each house facing its own street.
      const n = U > 52 ? 3 : 2, lw = U / n;
      for (const side of [fr, opp[fr]]) for (let i = 0; i < n; i++) {
        if (rng() >= dens) { b.lots.push({ empty: true, id: `R${b.k}.${b.j}.${b.lots.length}`, lot: toWorld(i * lw, 0, (i + 1) * lw, V / 2, side) }); continue; }
        const kind = pickW(rng, Z.kinds);
        keep(add(kind, side, i * lw, (i + 1) * lw, rng.range(2.5, 5.5), V / 2 - 7, 0, V / 2));
      }
    } else if (Z.lots === 'yards') {
      if (rng() < 0.5 && V > 50) {
        if (rng() < dens) keep(add('warehouse', fr, 0, U, rng.range(7, 12), V - 22, 0, V));
      } else for (const side of [fr, opp[fr]]) if (rng() < dens) keep(add(rng() < 0.65 ? 'shop' : 'warehouse', side, 0, U, rng.range(5, 9), V / 2 - 8, 0, V / 2));
    } else {
      // The strip: a long front building over a parking lot on the busy side, smaller ones on the back street.
      const mainKind = pickW(rng, Z.kinds);
      if (rng() < dens) keep(add(mainKind, fr, 0, U, mainKind === 'gas' ? 13 : rng.range(11, 15), V / 2 - 4, 0, V / 2 + 4));
      const nb = U > 52 ? 2 : 1;
      for (let i = 0; i < nb; i++) if (rng() < dens * 0.85) keep(add(rng() < 0.5 ? 'diner' : rng() < 0.6 ? 'gas' : 'house', opp[fr], (i * U) / nb, ((i + 1) * U) / nb, rng.range(4, 7), V / 2 - 12, 0, V / 2 - 4));
    }
    b.lots = b.lots.filter((L) => L.ok || L.empty);
    for (const L of b.lots) if (!L.empty) { L.ruined = rngOf(L.seed)() < Z.ruin * (b.zone === 'ruins' ? 1 : 1); L.blockKey = `${b.k},${b.j}`; }
  }

  // A lot by its id (R<k>.<j>.<n>): its block's lots (cached).
  lotById(id) {
    const m = /^R(-?\d+)\.(-?\d+)\./.exec(id);
    if (!m) return null;
    return this.block(+m[1], +m[2]).lots.find((L) => L.id === id) ?? null;
  }

  // ---- ownership and the per-chunk budget ---------------------------------------------------------------------------
  blocksOver(x0, z0, x1, z1, fn) {
    for (let k = Math.floor(x0 / G); k <= Math.floor(x1 / G); k++) for (let j = Math.floor(z0 / G); j <= Math.floor(z1 / G); j++) fn(this.block(k, j));
  }
  // The lots a chunk owns (their centre is in it) and builds, in id order, at most budget.buildings of them.
  owned(cx, cz) {
    const key = cx * 65536 + cz;
    let o = this.ownCache.get(key);
    if (o) return o;
    o = [];
    if (this.touches(cx, cz)) {
      const ox = cx * C, oz = cz * C;
      this.blocksOver(ox - 40, oz - 40, ox + C + 40, oz + C + 40, (b) => { for (const L of b.lots) if (!L.empty && L.cx >= ox && L.cx < ox + C && L.cz >= oz && L.cz < oz + C) o.push(L); });
      o.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (o.length > RING.budget.buildings) { for (const L of o.slice(RING.budget.buildings)) L.cut = true; o.length = RING.budget.buildings; }
      for (const L of o) L.owner = `${cx},${cz}`;
    }
    if (this.ownCache.size > 400) this.ownCache.clear();
    this.ownCache.set(key, o);
    return o;
  }
  // Every standing building whose footprint or lot reaches within m of chunk (cx, cz): { mine: [...], near: [...] }.
  around(cx, cz, m = 4) {
    const ox = cx * C, oz = cz * C, X1 = ox + C, Z1 = oz + C, mine = this.owned(cx, cz), near = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      for (const L of this.owned(cx + dx, cz + dz)) if (L.lot.x1 > ox - m && L.lot.x0 < X1 + m && L.lot.z1 > oz - m && L.lot.z0 < Z1 + m) near.push(L);
    }
    return { mine, near };
  }

  // ---- streets ------------------------------------------------------------------------------------------------------
  // Does the street segment exist? Vertical line i (x = 80i) between z = 80j and 80(j+1); horizontal: line j between x
  // = 80i and 80(i+1). A segment runs where either block beside it is city.
  vSeg(i, j) { return this.block(i - 1, j).city || this.block(i, j).city; }
  hSeg(i, j) { return this.block(i, j - 1).city || this.block(i, j).city; }
  // The paved rectangles of the street grid that reach into [x0, x1] x [z0, z1], cut where they meet I-10 (a local
  // street stops short of it; an arterial crosses, skipping only the freeway's own pavement) and where they would enter
  // the island. Each: { x0, z0, x1, z1, axis: 'x' | 'z', line, art }.
  streets(x0, z0, x1, z1) {
    const out = [], W = this.W;
    const cut = (axis, line, a0, a1, art) => {
      // Split [a0, a1] where the street meets the freeway (sampled every 2 m, only near it).
      const c = line * G, stop = (art ? RING.freeway.arterialStop : RING.freeway.localStop) + hw(line);
      const mid = (a0 + a1) / 2, half = (a1 - a0) / 2;
      const near = this.fwy(axis === 'z' ? c : mid, axis === 'z' ? mid : c, half + 40);
      if (near.d === Infinity) return [[a0, a1]];
      const out2 = [];
      let run = null;
      for (let a = a0; ; a += 2) {
        const aa = Math.min(a, a1), x = axis === 'z' ? c : aa, z = axis === 'z' ? aa : c;
        const fw = this.fwy(x, z, 40), blocked = fw.d < W.section(fw.s).out + stop;
        if (!blocked && run === null) run = aa;
        if ((blocked || aa >= a1) && run !== null) { const e = blocked ? aa - 1 : aa; if (e - run > 1) out2.push([run, e]); run = null; }
        if (aa >= a1) break;
      }
      return out2;
    };
    // Through a crossing to the far side of the cross street when the cross street is there (no notch at a T), never past
    // a dead end.
    const hAt = (i, j) => this.hSeg(i - 1, j) || this.hSeg(i, j), vAt = (i, j) => this.vSeg(i, j - 1) || this.vSeg(i, j);
    for (let i = Math.floor((x0 - 12) / G); i <= Math.ceil((x1 + 12) / G); i++) {
      const c = i * G, h = hw(i);
      if (c + h < x0 || c - h > x1) continue;
      for (let j = Math.floor((z0 - 12) / G); j <= Math.floor((z1 + 12) / G); j++) {
        if (!this.vSeg(i, j)) continue;
        let a0 = j * G, a1 = (j + 1) * G;
        if (!this.vSeg(i, j - 1) && hAt(i, j)) a0 -= hw(j);
        if (!this.vSeg(i, j + 1) && hAt(i, j + 1)) a1 += hw(j + 1);
        const o0 = a0 < z0, o1 = a1 > z1;
        a0 = Math.max(a0, z0); a1 = Math.min(a1, z1);
        if (a1 - a0 < 0.5) continue;
        for (const [s, e] of this.clipIsland('z', c, h, a0, a1)) for (const [p, q] of cut('z', i, s, e, isArt(i))) out.push({ x0: c - h, x1: c + h, z0: p, z1: q, axis: 'z', line: i, art: isArt(i), open0: o0 && p <= z0 + 1e-6, open1: o1 && q >= z1 - 1e-6 });
      }
    }
    for (let j = Math.floor((z0 - 12) / G); j <= Math.ceil((z1 + 12) / G); j++) {
      const c = j * G, h = hw(j);
      if (c + h < z0 || c - h > z1) continue;
      for (let i = Math.floor((x0 - 12) / G); i <= Math.floor((x1 + 12) / G); i++) {
        if (!this.hSeg(i, j)) continue;
        let a0 = i * G, a1 = (i + 1) * G;
        if (!this.hSeg(i - 1, j) && vAt(i, j)) a0 -= hw(i);
        if (!this.hSeg(i + 1, j) && vAt(i + 1, j)) a1 += hw(i + 1);
        const o0 = a0 < x0, o1 = a1 > x1;
        a0 = Math.max(a0, x0); a1 = Math.min(a1, x1);
        if (a1 - a0 < 0.5) continue;
        for (const [s, e] of this.clipIsland('x', c, h, a0, a1)) for (const [p, q] of cut('x', j, s, e, isArt(j))) out.push({ x0: p, x1: q, z0: c - h, z1: c + h, axis: 'x', line: j, art: isArt(j), open0: o0 && p <= x0 + 1e-6, open1: o1 && q >= x1 - 1e-6 });
      }
    }
    return out;
  }
  // The part of a street run [a0, a1] (centre line c, half-width h, along `axis`) outside the island.
  clipIsland(axis, c, h, a0, a1) {
    const I = RING.island + 0.5;
    if (Math.abs(c) - h >= I) return [[a0, a1]];
    const out = [];
    if (a0 < -I) out.push([a0, Math.min(a1, -I)]);
    if (a1 > I) out.push([Math.max(a0, I), a1]);
    return out;
  }
  // The walks around a city block and its ground pad (industrial yards are paved, a strip's front lot is asphalt).
  pads(b) {
    if (b.pads) return b.pads;
    const w = RING.walk, out = (b.pads = []);
    if (!b.city) return out;
    // Nothing paved over the freeway: a strip that comes within its pavement (+3 m) is dropped.
    const nearFw = this.fwy(b.cx, b.cz, 120).d < 120;
    const clear = (r) => {
      if (!nearFw) return true;
      for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1], [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2], [(r.x0 + r.x1) / 2, r.z0], [(r.x0 + r.x1) / 2, r.z1], [r.x0, (r.z0 + r.z1) / 2], [r.x1, (r.z0 + r.z1) / 2]]) {
        const fw = this.fwy(x, z, 40);
        if (fw.d < this.W.section(fw.s).out + 3) return false;
      }
      return true;
    };
    const keep = (r) => { if (clear(r)) out.push(r); };
    keep({ x0: b.x0 - w, x1: b.x1 + w, z0: b.z0 - w, z1: b.z0, band: 'walk' }); keep({ x0: b.x0 - w, x1: b.x1 + w, z0: b.z1, z1: b.z1 + w, band: 'walk' });
    keep({ x0: b.x0 - w, x1: b.x0, z0: b.z0, z1: b.z1, band: 'walk' }); keep({ x0: b.x1, x1: b.x1 + w, z0: b.z0, z1: b.z1, band: 'walk' });
    if (b.zone === 'industrial') keep({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, band: 'yard' });
    if (b.zone === 'strip') for (const L of b.lots) if (!L.empty && (L.kind === 'mall' || L.kind === 'gas' || L.kind === 'diner')) {
      // The lot in front of it, between the walk and the building.
      const f = L.front, l = L.lot;
      const r = f === 'N' ? { x0: l.x0 + 1, x1: l.x1 - 1, z0: l.z0, z1: L.z0 - 0.5 } : f === 'S' ? { x0: l.x0 + 1, x1: l.x1 - 1, z0: L.z1 + 0.5, z1: l.z1 } : f === 'W' ? { x0: l.x0, x1: L.x0 - 0.5, z0: l.z0 + 1, z1: l.z1 - 1 } : { x0: L.x1 + 0.5, x1: l.x1, z0: l.z0 + 1, z1: l.z1 - 1 };
      if (r.x1 - r.x0 > 2 && r.z1 - r.z0 > 2) keep({ ...r, band: 'lot' });
    }
    return out;
  }
  // Is (x, z) paved or built on (desert scatter keeps off): a street or its walks, a paved lot, a building and its
  // margin. The yards of houses keep their weeds.
  solid(x, z, r = 0) {
    if (!this.inCity(x, z, 8)) return false;
    const i = Math.round(x / G), j = Math.round(z / G);
    if (Math.abs(x - i * G) < hw(i) + RING.walk + r || Math.abs(z - j * G) < hw(j) + RING.walk + r) return true;
    const b = this.block(Math.floor(x / G), Math.floor(z / G));
    if (!b.city) return false;
    if (b.zone !== 'residential' && b.zone !== 'ruins') return true;
    for (const L of b.lots) if (!L.empty && x > L.x0 - 2 - r && x < L.x1 + 2 + r && z > L.z0 - 2 - r && z < L.z1 + 2 + r) return true;
    return false;
  }

  // What the HUD street sign says in the ring (null when not in it).
  streetName(axis, line) {
    const N = this.names;
    if (Math.abs(line) <= 4 && N) return axis === 'z' ? N.v[line + 4] : N.h[line + 4];
    const n = Math.abs(line) - 5;
    const list = axis === 'z' ? (line > 0 ? STREET_NAMES.ns.east : STREET_NAMES.ns.west) : (line > 0 ? STREET_NAMES.ew.south : STREET_NAMES.ew.north);
    return list[Math.min(list.length - 1, Math.max(0, n))];
  }
  nameAt(x, z) {
    if (!this.inCity(x, z, 20)) return null;
    const i = Math.round(x / G), j = Math.round(z / G);
    const onV = Math.abs(x - i * G) < hw(i) && this.vSeg(i, Math.floor(z / G)), onH = Math.abs(z - j * G) < hw(j) && this.hSeg(Math.floor(x / G), j);
    if (onV && onH) return `${this.streetName('z', i)} & ${this.streetName('x', j)}`;
    if (onV) return this.streetName('z', i);
    if (onH) return this.streetName('x', j);
    const b = this.block(Math.floor(x / G), Math.floor(z / G));
    return b.city ? `PHOENIX · ${b.Z.name}` : 'PHOENIX · THE EDGE';
  }

  // ---- a building's shell, inside and out (cached on the lot: computed once, the same every time) --------------------
  geo(L) {
    if (L.geo) return L.geo;
    this.geoBuilt++;
    const K = KINDS[L.kind], Z = ZONES[L.zone], rng = rngOf(L.seed ^ 0x5bd1e995);
    const g = (L.geo = { walls: [], boxes: [], floor: null, roof: [], props: [], decor: [], boxesIn: [], beds: [], doors: [], rooms: [], canopy: [], trunks: [], crowns: [], flora: [], windows: [], innerDoors: [] });
    const { x0, z0, x1, z1 } = L, w = x1 - x0, d = z1 - z0;
    // An authored building (world/authored.js): its own plan, doors and heights in place of the generator's.
    const A = L.authored;
    const h = A ? A.h : rng.range(K.h[0], K.h[1]);
    const wall = rng.pick(Z.walls), roof = rng.pick(Z.roofs), floor = rng.pick(Z.floors);
    L.h = h; L.color = wall;
    const ruined = !!L.ruined;
    const ns = L.front === 'N' || L.front === 'S';
    // The front wall runs along u (x for N/S fronts, z for W/E); doors are positions along it.
    const uA = ns ? x0 : z0, uB = ns ? x1 : z1;
    const units = A ? A.units : K.units ? rng.int(K.units[0], K.units[1]) : 1;
    const doors = { N: [], S: [], W: [], E: [] }; // positions along the side, with their clear width
    const inner = [];  // partition walls: { horizontal, fixed, a0, a1, gaps }
    const keep = [];   // points to keep furniture away from (doorways, inside and out)
    const uw = (uB - uA) / units, dw = K.bay ?? RING.door;
    const opp = { N: 'S', S: 'N', W: 'E', E: 'W' }[L.front];
    // The floor plan (world/floorplan.js, rows in data/floorplans.js): typed rooms, partitions with their doorways, the
    // front door in each unit's entry room, where a back door may go. Its own seed: the shell's stream is untouched by it.
    const FP = A ? A.fp : K.plan ? floorplan({ x0, z0, x1, z1, front: L.front, kind: L.kind, units, seed: hash32(L.seed, 0x504c414e), T, door: dw, innerDoor: RING.innerDoor, backDoor: RING.backDoor }) : null;
    if (A) {
      inner.push(...FP.inner.map((P) => ({ ...P, gaps: P.gaps.map((q) => ({ ...q })) })));
      for (const q of A.doors) doors[q.side].push({ at: q.at, w: q.w, kind: q.kind, unit: q.unit });
    } else if (FP) {
      for (let u = 0; u < units; u++) doors[L.front].push({ at: FP.front[u], w: dw, kind: K.bay ? 'bay' : 'front', unit: u });
      inner.push(...FP.inner);
      // A back door (per unit, sometimes) where the plan offers one: the kitchen's, a stock room's, the hall's end.
      for (let u = 0; u < units; u++) {
        if (rng() >= (K.back ?? 0)) continue;
        const c = FP.back.find((q) => q.unit === u && !doors[q.side].some((o) => Math.abs(o.at - q.at) < (o.w + RING.backDoor) / 2 + 0.6));
        if (c) doors[c.side].push({ at: c.at, w: RING.backDoor, kind: 'back', unit: u });
      }
    }
    // The old shell (a warehouse): front doors near each unit's middle (a roll-up bay), no rooms but an office. Its rng
    // draws in the same order as before the plans, so a warehouse comes out exactly as it did.
    if (!FP) for (let u = 0; u < units; u++) {
      const mid = uA + uw * (u + 0.5);
      doors[L.front].push({ at: snap(mid + rng.range(-1, 1) * Math.max(0, uw / 2 - dw / 2 - 1.2) * 0.5), w: dw, kind: K.bay ? 'bay' : 'front', unit: u });
    }
    const backRoll = FP ? 1 : rng(), backAt = FP ? 0 : snap(uA + (uB - uA) * rng.range(0.25, 0.75));
    if (!FP) for (let u = 1; u < units; u++) inner.push({ horizontal: !ns, fixed: uA + uw * u, a0: ns ? z0 : x0, a1: ns ? z1 : x1, gaps: [] });
    if (!FP && K.office) {
      // A small office in a back corner: a wall across the corner with a doorway, one along the back.
      const back = L.front === 'N' ? z1 : L.front === 'S' ? z0 : L.front === 'W' ? x1 : x0, sgn = L.front === 'N' || L.front === 'W' ? -1 : 1;
      const ow = Math.min(6, (uB - uA) * 0.3), od = Math.min(5, (ns ? d : w) * 0.35);
      const corner = rng() < 0.5 ? uA : uB, cs = corner === uA ? 1 : -1;
      const fixedV = back + sgn * od; // the office's front wall, parallel to the back
      const ua = Math.min(corner, corner + cs * ow), ub = Math.max(corner, corner + cs * ow);
      inner.push({ horizontal: ns, fixed: fixedV, a0: ua, a1: ub, gaps: [{ at: snap((ua + ub) / 2), w: RING.innerDoor }] });
      inner.push({ horizontal: !ns, fixed: corner + cs * ow, a0: Math.min(back, fixedV), a1: Math.max(back, fixedV), gaps: [] });
      L.office = { u0: ua, u1: ub, v0: Math.min(back, fixedV), v1: Math.max(back, fixedV) };
    }
    // A back door (single) on the opposite side, sometimes: never where a wall inside meets the back wall.
    if (!FP && backRoll < (K.back ?? 0) && !inner.some((P) => P.horizontal !== ns && Math.abs(P.fixed - backAt) < RING.backDoor / 2 + T + 0.6)) doors[opp].push({ at: backAt, w: RING.backDoor, kind: 'back' });
    // R2: who lives here (data/ring.js RESIDENTS). A barricaded household boards up its unit's front door and goes in and
    // out by a back door of its own. No geo rng is spent on it: every other building comes out exactly as before.
    const hh = this.household(L), HR = hh ? RESIDENTS[hh.kind] : null, resUnit = hh ? (units > 1 ? hh.unit % units : 0) : -1;
    if (HR?.barricade) {
      doors[L.front][resUnit].barricade = true;
      const lo = uA + uw * resUnit, hi = lo + uw, mid = snap(lo + uw / 2), bw = RING.backDoor;
      const clash = (at) => at - bw / 2 < lo + 0.7 || at + bw / 2 > hi - 0.7 || doors[opp].some((q) => Math.abs(q.at - at) < bw + 0.6) || inner.some((P) => P.horizontal !== ns && Math.abs(P.fixed - at) < bw / 2 + T + 0.6);
      const has = FP ? Object.values(doors).some((l) => l.some((q) => q.kind === 'back' && q.unit === resUnit)) : doors[opp].some((q) => q.at > lo && q.at < hi);
      // A planned building takes the plan's own back door for that unit (in a room's outside wall, clear of its corners).
      const c = !has && FP ? FP.back.find((q) => q.unit === resUnit && !doors[q.side].some((o) => Math.abs(o.at - q.at) < (o.w + bw) / 2 + 0.6)) : null;
      if (c) doors[c.side].push({ at: c.at, w: bw, kind: 'back', unit: resUnit });
      else if (!has) for (const o of [0, 2, -2, 3.5, -3.5]) if (!clash(mid + o)) { doors[opp].push({ at: mid + o, w: bw, kind: 'back', unit: resUnit }); break; }
    }
    // ---- the walls, side by side: spans between doors; an intact span gets window holes, a ruined one may be down.
    const side = (S, horizontal, fixed, a0, a1) => {
      const gaps = doors[S].slice().sort((p, q) => p.at - q.at);
      // The partitions that meet this wall (a planned building's rooms end at them).
      const jn = FP ? inner.filter((P) => P.horizontal !== horizontal && (Math.abs(P.a0 - fixed) < 1e-3 || Math.abs(P.a1 - fixed) < 1e-3)).map((P) => P.fixed).sort((p, q) => p - q) : null;
      let cur = a0;
      const spans = [];
      for (const gp of gaps) { spans.push([cur, gp.at - gp.w / 2]); cur = gp.at + gp.w / 2; }
      spans.push([cur, a1]);
      for (const gp of gaps) {
        const nx = S === 'W' ? -1 : S === 'E' ? 1 : 0, nz = S === 'N' ? -1 : S === 'S' ? 1 : 0;
        const x = horizontal ? gp.at : fixed, z = horizontal ? fixed : gp.at;
        g.doors.push({ x, z, nx, nz, w: gp.w, kind: gp.kind, barricade: !!gp.barricade });
        keep.push([x - nx * 1.2, z - nz * 1.2]);
        if (gp.barricade) this.barricade(g, L, horizontal, fixed, gp.at, gp.w, nx, nz);
      }
      for (const [s, e] of spans) {
        if (e - s < 0.2) continue;
        if (ruined && rng() < RING.collapse) {
          const hh = rng.range(0.5, 1.6);
          this.piece(g.walls, horizontal, fixed, s, e, 0, hh, wall, 0.86);
          if (hh > 1.1) g.boxes.push(this.wallBox(horizontal, fixed, s, e, hh, 'wall', null));
          for (let r = 0; r < 2; r++) {
            const m = s + (e - s) * rng(), off = rng.range(-1.2, 1.2);
            g.decor.push([horizontal ? m : fixed + off, 0.22, horizontal ? fixed + off : m, rng.range(0.6, 1.3), rng.range(0.25, 0.5), rng.range(0.6, 1.3), wall, rng() * 3, 0.8]);
          }
          continue;
        }
        const len = e - s, holes = [];
        let c0 = s;
        // Where the windows go: the old shell spaces them along the span; a planned building gives each room's stretch of
        // outside wall its own (between the partitions that meet this wall), so no partition ends at a window.
        const at = [];
        if (FP) {
          const cuts = jn.filter((j) => j > s + 0.05 && j < e - 0.05);
          let a = s;
          for (const j of [...cuts, null]) {
            const b = j === null ? e : j - T / 2, sl = b - a;
            if (sl >= 1.9) { const k = sl >= 6.4 ? 2 : 1; for (let q = 0; q < k; q++) at.push([a + (q + 0.5) * (sl / k), Math.min(RING.window, sl / k - 1.0)]); }
            if (j !== null) a = j + T / 2;
          }
        } else { const n = len >= 4.5 ? Math.min(3, Math.floor(len / 4.6)) : 0; for (let q = 0; q < n; q++) at.push([s + (q + 0.5) * (len / n), RING.window]); }
        for (const [c, ww] of at) {
          if (rng() > (L.kind === 'warehouse' ? 0.45 : 0.78) || ww < 0.8) continue;
          const W2 = ww / 2;
          this.piece(g.walls, horizontal, fixed, c0, c - W2, 0, h, wall, 1);
          this.piece(g.walls, horizontal, fixed, c - W2, c + W2, 0, RING.sill, wall, 1.18);
          holes.push(c - W2, c + W2);
          // The window as a row (systems/interiors.js attaches glass, frame, boards near the player).
          g.windows.push({ x: horizontal ? c : fixed, z: horizontal ? fixed : c, axis: horizontal ? 'x' : 'z', width: RING.window,
            nx: S === 'W' ? -1 : S === 'E' ? 1 : 0, nz: S === 'N' ? -1 : S === 'S' ? 1 : 0, wallH: h, t: T, color: wall, ruined });
          c0 = c + W2;
        }
        this.piece(g.walls, horizontal, fixed, c0, e, 0, h, wall, 1);
        g.boxes.push(this.wallBox(horizontal, fixed, s, e, h, 'wall', holes.length ? holes : null));
      }
    };
    side('N', true, z0, x0 - T / 2, x1 + T / 2);
    side('S', true, z1, x0 - T / 2, x1 + T / 2);
    side('W', false, x0, z0 + T / 2, z1 - T / 2);
    side('E', false, x1, z0 + T / 2, z1 - T / 2);
    // Partitions (no windows; a ruin's may be gone, but then its doorway goes with it and nothing is sealed).
    for (const P of inner) {
      if (ruined && rng() < 0.35) continue;
      const gaps = P.gaps.slice().sort((p, q) => p.at - q.at);
      let cur = P.a0 + T / 2;
      const hh = h * 0.96;
      for (const gp of gaps) {
        const e = gp.at - gp.w / 2;
        if (e - cur > 0.2) { this.piece(g.walls, P.horizontal, P.fixed, cur, e, 0, hh, wall, 0.94); g.boxes.push(this.wallBox(P.horizontal, P.fixed, cur, e, hh, 'wall', null)); }
        cur = gp.at + gp.w / 2;
        const x = P.horizontal ? gp.at : P.fixed, z = P.horizontal ? P.fixed : gp.at;
        g.innerDoors.push({ x, z, axis: P.horizontal ? 'x' : 'z', w: gp.w }); // a leaf hangs here near the player (interiors.js)
        keep.push([x + (P.horizontal ? 0 : 1.1), z + (P.horizontal ? 1.1 : 0)], [x - (P.horizontal ? 0 : 1.1), z - (P.horizontal ? 1.1 : 0)]);
      }
      const end = P.a1 - T / 2;
      if (end - cur > 0.2) { this.piece(g.walls, P.horizontal, P.fixed, cur, end, 0, hh, wall, 0.94); g.boxes.push(this.wallBox(P.horizontal, P.fixed, cur, end, hh, 'wall', null)); }
    }
    // Floor and roof (a ruin's roof is gone: open to the sky).
    g.floor = [(x0 + x1) / 2, 0.07, (z0 + z1) / 2, w, 0.1, d, floor];
    if (!ruined) {
      g.roof.push([(x0 + x1) / 2, h + 0.2, (z0 + z1) / 2, w + 0.6, 0.4, d + 0.6, roof, 0, 1]);
      for (let i = 0, n = rng.int(0, L.kind === 'warehouse' ? 3 : 2); i < n; i++) g.roof.push([(x0 + x1) / 2 + rng.range(-w / 3, w / 3), h + 0.75, (z0 + z1) / 2 + rng.range(-d / 3, d / 3), rng.range(1.2, 2.6), rng.range(0.7, 1.3), rng.range(1.2, 2.6), rng.pick(['#5e5a54', '#6e665a', '#3d4544']), 0, 1]);
    } else {
      for (let i = 0; i < 3; i++) g.decor.push([(x0 + x1) / 2 + rng.range(-w / 3, w / 3), 0.25, (z0 + z1) / 2 + rng.range(-d / 3, d / 3), rng.range(0.8, 2), rng.range(0.3, 0.6), rng.range(0.8, 2), wall, rng() * 3, 0.78]);
    }
    if (A) A.before(this, g, L); // its stairs (the run solid, the foot's landing kept clear), the shell above, a walkway
    // ---- rooms and furniture: along the walls, never in a doorway's way, the middle of every room left open.
    const placed = [];
    let fctx = null;
    g.inner = inner; g.plan = FP?.plans ?? null;
    const rooms = FP ? this.planRooms(L, FP) : this.rooms(L, inner, units, uA, uB, ns);
    g.rooms = rooms;
    g.stay = rooms.filter((r) => !r.type || ROOMS[r.type]?.stay);
    if (FP) fctx = this.furnish(L, g, rooms, K, Z, rng, placed);
    const items = [];
    if (!FP) for (const [type, lo, hi] of K.furniture) for (let n = rng.int(lo, hi), q = 0; q < n; q++) items.push(type);
    // Units each get the kind's list; a house puts beds and dressers in the back room.
    const unitRooms = rooms.filter((r) => !r.office);
    const per = !FP && units > 1 ? unitRooms.map(() => items.slice()) : null;
    const tryPlace = (type, room) => {
      const F = FURNITURE[type], [fw, fd, fh] = F.size;
      const cands = this.slots(room, fw, fd, rng);
      for (const c of cands) {
        const r = c.r;
        if (keep.some(([kx, kz]) => kx > r.x0 - 1.5 && kx < r.x1 + 1.5 && kz > r.z0 - 1.5 && kz < r.z1 + 1.5)) continue;
        let bad = false;
        for (const p of placed) {
          const gx = Math.max(p.r.x0 - r.x1, r.x0 - p.r.x1), gz = Math.max(p.r.z0 - r.z1, r.z0 - p.r.z1), gap = Math.max(gx, gz);
          if (gap < (p.wall === c.wall ? 0.3 : 1.7)) { bad = true; break; }
        }
        if (bad) continue;
        placed.push({ r, wall: c.wall });
        const x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2, sx = r.x1 - r.x0, sz = r.z1 - r.z0, col = rng.pick(F.colors);
        g.props.push([x, fh / 2, z, sx, fh, sz, col, 0, 1]);
        if (type === 'shelf' || type === 'rack') g.props.push([x, fh * 0.55, z, sx * 0.96, 0.06, sz * 1.04, '#2e2620', 0, 1]); // a shelf board that reads from above
        if (F.solid) g.boxes.push({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, h: fh, tag: F.box ? (type === 'crate' ? 'crate' : 'shelf') : 'furniture', holes: null });
        if (F.bed) g.beds.push({ x, z, face: sx > sz ? Math.PI / 2 : 0, bedY: 0.2 });
        if (F.box) {
          const id = `ring:${Math.round(x * 10)}:${Math.round(z * 10)}`;
          const unit = room.unit;
          const table = F.box.loot ?? unit?.loot ?? K.loot ?? pickW(rngOf(hash32(this.seed, Math.round(x * 10), Math.round(z * 10), 3)), Z.loot);
          const label = `${F.box.label}${unit ? ` · ${unit.label}` : K.label ? ` · ${K.label}` : ''}`;
          g.boxesIn.push({ id, x, z, table, cap: F.box.cap, label });
        }
        return true;
      }
      return false;
    };
    if (per) per.forEach((list, ui) => { for (const t of list) tryPlace(t, unitRooms[ui]); });
    else for (const t of items) {
      const pref = (t === 'bed' || t === 'dresser') ? rooms.find((r) => r.back) : (t === 'couch' || t === 'counter' || t === 'table') ? rooms.find((r) => r.frontRoom) : null;
      if (!(pref && tryPlace(t, pref))) for (const r of rng.chance(0.5) ? rooms : rooms.slice().reverse()) if (tryPlace(t, r)) break;
    }
    // A fuel stop's canopy and pumps out front, over the lot.
    if (K.canopy) {
      const f = L.front, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const px = f === 'W' ? x0 - 7 : f === 'E' ? x1 + 7 : cx, pz = f === 'N' ? z0 - 7 : f === 'S' ? z1 + 7 : cz;
      const along = ns; // the canopy runs along the front
      g.canopy.push([px, 4.6, pz, along ? 10 : 7, 0.35, along ? 7 : 10, '#8a7a5a', 0, 1]);
      for (const [a, b] of [[-4.4, -3], [4.4, -3], [-4.4, 3], [4.4, 3]]) {
        const qx = px + (along ? a : b), qz = pz + (along ? b : a);
        g.props.push([qx, 2.3, qz, 0.3, 4.6, 0.3, '#4a4642', 0, 1]); g.boxes.push({ x0: qx - 0.2, z0: qz - 0.2, x1: qx + 0.2, z1: qz + 0.2, h: 4.6, tag: 'post', holes: null });
      }
      for (const a of [-2, 2]) {
        const qx = px + (along ? a : 0), qz = pz + (along ? 0 : a), sx = along ? 0.7 : 1.6, sz = along ? 1.6 : 0.7;
        g.props.push([qx, 0.7, qz, sx, 1.4, sz, '#9a3a22', 0, 1]); g.boxes.push({ x0: qx - sx / 2, z0: qz - sz / 2, x1: qx + sx / 2, z1: qz + sz / 2, h: 1.4, tag: 'pump', holes: null });
      }
    }
    // The yard: a fence round a house's back yard (solid: the front stays open), junk for looks.
    const lot = L.lot;
    if (Z.fence && !HR?.barricade && rng() < Z.fence && (L.kind === 'house' || L.kind === 'bungalow' || L.kind === 'duplex')) { // a boarded-up house keeps its back yard open: its back door is the way in
      // A block wall (YARD.wall, in the walls pool so world/surfaces.js gives it coursing): Phoenix walls its back yards in 1.8 m of concrete block, the strongest read of the city
      // from above. It stops sight at eye height, as a real one does.
      const fc = rng.pick(YARD.wall.colors), WH = YARD.wall.h, WT = YARD.wall.t;
      const fence = (ax, az, bx, bz) => { const x = (ax + bx) / 2, z = (az + bz) / 2, sx = Math.max(WT, Math.abs(bx - ax)), sz = Math.max(WT, Math.abs(bz - az)); g.walls.push([x, WH / 2, z, sx, WH, sz, fc, 0, 1]); g.props.push([x, WH + 0.04, z, sx + 0.06, 0.08, sz + 0.06, '#d8cfbc', 0, 1]); g.boxes.push({ x0: x - sx / 2, z0: z - sz / 2, x1: x + sx / 2, z1: z + sz / 2, h: WH, tag: 'fence', holes: null }); };
      // m: the side walls' inset; b: the back wall's, so back-to-back lots leave an alley between their walls (YARD.alley).
      const m = 0.4, b = YARD.alley;
      if (L.front === 'N') { fence(lot.x0 + m, lot.z1 - b, lot.x1 - m, lot.z1 - b); fence(lot.x0 + m, z1 - 1, lot.x0 + m, lot.z1 - b); fence(lot.x1 - m, z1 - 1, lot.x1 - m, lot.z1 - b); }
      else if (L.front === 'S') { fence(lot.x0 + m, lot.z0 + b, lot.x1 - m, lot.z0 + b); fence(lot.x0 + m, lot.z0 + b, lot.x0 + m, z0 + 1); fence(lot.x1 - m, lot.z0 + b, lot.x1 - m, z0 + 1); }
      else if (L.front === 'W') { fence(lot.x1 - b, lot.z0 + m, lot.x1 - b, lot.z1 - m); fence(x1 - 1, lot.z0 + m, lot.x1 - b, lot.z0 + m); fence(x1 - 1, lot.z1 - m, lot.x1 - b, lot.z1 - m); }
      else { fence(lot.x0 + b, lot.z0 + m, lot.x0 + b, lot.z1 - m); fence(lot.x0 + b, lot.z0 + m, x0 + 1, lot.z0 + m); fence(lot.x0 + b, lot.z1 - m, x0 + 1, lot.z1 - m); }
    }
    if (L.kind === 'house' || L.kind === 'bungalow' || L.kind === 'duplex') this.yardOf(L, g);
    for (let i = 0, n = rng.int(0, Z.yard); i < n; i++) {
      // Behind the building, in its own lot.
      const bx0 = lot.x0 + 1.5, bx1 = lot.x1 - 1.5, bz0 = lot.z0 + 1.5, bz1 = lot.z1 - 1.5;
      const x = rng.range(bx0, bx1), z = rng.range(bz0, bz1);
      if (x > x0 - 2 && x < x1 + 2 && z > z0 - 2 && z < z1 + 2) continue;
      const doorNear = g.doors.some((dd) => Math.hypot(dd.x - x, dd.z - z) < 5);
      if (doorNear) continue;
      const kind = rng();
      if (kind < 0.4) g.decor.push([x, 0.35, z, rng.range(0.8, 1.8), rng.range(0.4, 0.8), rng.range(0.8, 1.8), rng.pick(['#5a4632', '#6b5a48', '#4a4440', '#7a5a34']), rng() * 3, 1]);
      else if (kind < 0.7) g.decor.push([x, 0.5, z, 0.9, 1.0, 0.9, rng.pick(['#7a3a1c', '#3f5446', '#6d5a2a']), 0, 1]);
      else g.decor.push([x, 0.15, z, rng.range(1.4, 3), 0.3, rng.range(1.4, 3), '#4f4b46', rng() * 3, 0.9]);
    }
    if (hh) this.homeOf(L, g, hh, HR, rooms, resUnit, units, keep, placed, fctx);
    if (A) A.after(this, g, L); // the roof on the wall top
    L.containers = g.boxesIn.length;
    return g;
  }

  // ---- R2: who lives here (data/ring.js RESIDENTS) -------------------------------------------------------------------
  // The household in building L, or null: { kind, size, unit, seed }. A pure function of the rows and the seed (its own
  // stream, so nothing else moves), cached on the lot.
  household(L) {
    if (L.hh !== undefined) return L.hh;
    L.hh = null;
    const Z = ZONES[L.zone];
    if (L.empty || !Z?.residents?.length) return null;
    const rng = rngOf(hash32(this.seed, L.seed, 0x52455331));
    const kind = pickW(rng, Z.residents), R = RESIDENTS[kind];
    if (!R || !R.kinds.includes(L.kind) || (R.intact && L.ruined)) return null;
    if (R.perQuarter) { if (this.quarterPick(L.zone, kind, Math.floor(L.cx / G), Math.floor(L.cz / G)) !== L.id) return null; }
    else if (rng() >= (Z.occupancy ?? 0)) return null;
    return (L.hh = { kind, size: rng.int(R.size[0], R.size[1]), unit: rng.int(0, 11), seed: hash32(this.seed, L.seed, 0x484f4d45) });
  }
  // One building per quarter (the 4 x 4 blocks between arterials) for a perQuarter kind: the eligible standing lot of
  // that zone with the lowest hash, at the row's chance. Returns its id or null.
  quarterPick(zone, kind, k, j) {
    const qk = Math.floor(k / 4), qj = Math.floor(j / 4), key = `${zone}|${kind}|${qk},${qj}`;
    const Q = (this.qCache ??= new Map());
    if (Q.has(key)) return Q.get(key);
    const R = RESIDENTS[kind];
    let best = null, bs = Infinity;
    const cand = [];
    for (let a = qk * 4; a < qk * 4 + 4; a++) for (let b = qj * 4; b < qj * 4 + 4; b++) {
      const B = this.block(a, b);
      if (B.city && B.zone === zone) for (const L of B.lots) if (!L.empty && R.kinds.includes(L.kind) && !(R.intact && L.ruined)) cand.push(L);
    }
    for (const L of cand) {
      this.owned(Math.floor(L.cx / C), Math.floor(L.cz / C)); // over its chunk's budget: it does not stand
      if (L.cut) continue;
      const s = hash32(this.seed, L.seed, 0x51554152);
      if (s < bs) { bs = s; best = L.id; }
    }
    const pick = best && rngOf(hash32(this.seed, qk + 9000, qj + 9000, 0x5150))() < R.perQuarter ? best : null;
    if (Q.size > 2000) Q.clear();
    Q.set(key, pick);
    return pick;
  }
  // Boards nailed across a door gap (a solid barricade, sight and rounds stopped too) and a few crates piled behind it.
  barricade(g, L, horizontal, fixed, at, w, nx, nz) {
    const rng = rngOf(hash32(L.seed, Math.round(at * 10), 0x42415231)), cols = RES_RULES.barricade.colors;
    g.boxes.push(this.wallBox(horizontal, fixed, at - w / 2, at + w / 2, 2.1, 'barricade', null));
    const out = 0.24, x0 = horizontal ? at : fixed + nx * out, z0 = horizontal ? fixed + nz * out : at;
    for (const y of [0.4, 0.85, 1.3, 1.75, 2.05]) {
      const len = w + rng.range(0.3, 0.7), dy = rng.range(-0.06, 0.06), shift = rng.range(-0.15, 0.15);
      g.props.push([x0 + (horizontal ? shift : 0), y + dy, z0 + (horizontal ? 0 : shift), horizontal ? len : 0.1, 0.22, horizontal ? 0.1 : len, rng.pick(cols), 0, 1]);
    }
    for (let i = 0; i < 2; i++) {
      const s = (i ? 1 : -1) * w * 0.25, x = horizontal ? at + s : fixed - nx * 0.75, z = horizontal ? fixed - nz * 0.75 : at + s;
      g.props.push([x, 0.45 + i * 0.12, z, 0.85, 0.9 + i * 0.24, 0.85, '#6b4e2e', rng() * 0.5, 0.95]);
    }
    g.barricade = { x: horizontal ? at : fixed, z: horizontal ? fixed : at, nx, nz, w };
  }
  // ---- a planned building's rooms and what stands in them (data/floorplans.js ROOMS; FURNITURE in data/ring.js) -----
  // The plan's rooms as geo rooms: { type, name, x0, z0, x1, z1 (inner faces), ui (unit), unit (a strip mall unit's row:
  // what it sold), frontRoom (the entry), back (a bedroom), office }.
  planRooms(L, FP) {
    const pick = rngOf(L.seed ^ 0x2545f491), sold = L.kind === 'mall' ? FP.plans.map(() => UNITS[pick.int(0, UNITS.length - 1)]) : null;
    return FP.rooms.map((r) => ({ type: r.type, name: r.name, x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, ui: r.unit, unit: sold?.[r.unit] ?? null, frontRoom: r.entry, back: r.type === 'bedroom', office: r.type === 'office' }));
  }
  // Furniture room by room: each room's list (ROOMS[type].furniture) against its walls (a rug or a dining table in the
  // middle), floor finishes laid, doorways kept clear (a clear zone inside every door and both sides of every inside
  // doorway), and every solid piece proved on the nav probe before it stays: no piece may seal a pocket of floor or a room
  // off from the doors, and a bed keeps an open cell within a step of it (the walk's last step to it is straight).
  // Returns the context homeOf() places a household's mattresses and a chop shop's car with.
  furnish(L, g, rooms, K, Z, rng, placed) {
    const PR = PLAN_RULES, T2 = T / 2;
    for (const r of rooms) { const f = ROOMS[r.type]?.floor; if (f) g.props.push([(r.x0 + r.x1) / 2, 0.126, (r.z0 + r.z1) / 2, r.x1 - r.x0, 0.012, r.z1 - r.z0, f, 0, 1]); }
    // Clear zones: in front of every outside door, both sides of every inside doorway.
    const zones = [];
    for (const dd of g.doors) {
      const hw = dd.w / 2 + 0.15, dep = PR.frontClear;
      zones.push(dd.nz ? { x0: dd.x - hw, x1: dd.x + hw, z0: dd.z - dep, z1: dd.z + dep } : { x0: dd.x - dep, x1: dd.x + dep, z0: dd.z - hw, z1: dd.z + hw });
    }
    for (const P of g.inner) for (const gp of P.gaps) {
      const hw = gp.w / 2 + 0.15, dep = T2 + PR.doorClear;
      zones.push(P.horizontal ? { x0: gp.at - hw, x1: gp.at + hw, z0: P.fixed - dep, z1: P.fixed + dep } : { x0: P.fixed - dep, x1: P.fixed + dep, z0: gp.at - hw, z1: gp.at + hw });
    }
    for (const z of g.clear ?? []) zones.push(z); // an authored building's stair landings (world/authored.js)
    // The probe: this building's walls, partitions and boards as the foot nav grid sees them, flooded from its doors.
    const probe = (this.probe ??= new NavProbe());
    probe.reset(L.x0, L.z0, L.x1, L.z1, 0.6);
    for (const b of g.boxes) probe.add(b);
    const starts = [];
    for (const dd of g.doors) if (!dd.barricade) starts.push([dd.x, dd.z]); // the doorway's own cell (open: the gap)
    const ctx = { zones, zr: new Map(), probe, starts, rooms, placed, spots: [], on: probe.ok(starts, rooms, T2) };
    // The proof: every open cell inside reached from the doors, every room holding one, every bed with one beside it.
    ctx.verify = () => probe.ok(starts, rooms, T2) && ctx.spots.every((q) => probe.near(q.x, q.z));
    if (!ctx.on) this.probeOff = (this.probeOff ?? 0) + 1; // (a shell that is open somewhere already: placed by geometry only)
    // The biggest bedroom of each unit has the double bed.
    const master = new Map();
    for (const r of rooms) if (r.type === 'bedroom') { const a = (r.x1 - r.x0) * (r.z1 - r.z0), m = master.get(r.ui); if (!m || a > (m.x1 - m.x0) * (m.z1 - m.z0)) master.set(r.ui, r); }
    const lists = rooms.map((room) => {
      const list = [];
      for (const [t0, lo, hi] of ROOMS[room.type]?.furniture ?? []) for (let n = rng.int(lo, hi), q = 0; q < n; q++) list.push(t0 === 'bed' && master.get(room.ui) !== room ? 'sbed' : t0);
      return list;
    });
    // Proofs cost a flood each, so: the whole building at once, one proof; if it fails, it all comes out and goes in a room
    // at a time (a proof a room); a room that fails comes out and goes in a piece at a time, each piece proved.
    const mark = () => ({ props: g.props.length, boxes: g.boxes.length, beds: g.beds.length, boxesIn: g.boxesIn.length, placed: placed.length, spots: ctx.spots.length });
    const undo = (mk) => {
      for (const p of placed.slice(mk.placed)) if (p.solid) probe.add(p.box, -1);
      g.props.length = mk.props; g.boxes.length = mk.boxes; g.beds.length = mk.beds; g.boxesIn.length = mk.boxesIn; placed.length = mk.placed; ctx.spots.length = mk.spots;
      probe.flood(starts);
    };
    const m0 = mark();
    rooms.forEach((room, i) => { for (const t of lists[i]) this.placeOne(t, room, g, K, Z, rng, ctx, { defer: true }); });
    if (!ctx.on || ctx.verify()) return ctx;
    undo(m0);
    rooms.forEach((room, i) => {
      const mk = mark();
      for (const t of lists[i]) this.placeOne(t, room, g, K, Z, rng, ctx, { defer: true });
      if (ctx.verify()) return;
      undo(mk);
      for (const t of lists[i]) this.placeOne(t, room, g, K, Z, rng, ctx);
    });
    return ctx;
  }
  // Candidate spots for a piece w x d against the walls of a room (the wall it backs onto: 0 N, 1 S, 2 W, 3 E), leaving
  // `aisle` of floor in front of it, appended to the shared candidate buffer (CB: x0, z0, x1, z1; CW: wall) from n.
  // A house lot's yard (data/ring.js YARD): gravel front yard and a tree, a driveway up the side to a carport, a pool and a
  // tree behind. Its own stream (the lot's seed), after everything else geo() places, so nothing placed before moves.
  // Laid out in the lot's own frame: u along the street, v from the street into the lot.
  yardOf(L, g) {
    const Y = YARD, rng = rngOf(L.seed ^ 0x59415244), lot = L.lot, f = L.front, ruined = !!L.ruined;
    const ns = f === 'N' || f === 'S';
    const toW = (u, v) => (f === 'N' ? [u, lot.z0 + v] : f === 'S' ? [u, lot.z1 - v] : f === 'W' ? [lot.x0 + v, u] : [lot.x1 - v, u]);
    const lu0 = ns ? lot.x0 : lot.z0, lu1 = ns ? lot.x1 : lot.z1, LV = ns ? lot.z1 - lot.z0 : lot.x1 - lot.x0;
    const bu0 = ns ? L.x0 : L.z0, bu1 = ns ? L.x1 : L.z1;
    const bv = (a, b) => [Math.min(a, b), Math.max(a, b)];
    const [bv0, bv1] = f === 'N' ? bv(L.z0 - lot.z0, L.z1 - lot.z0) : f === 'S' ? bv(lot.z1 - L.z1, lot.z1 - L.z0) : f === 'W' ? bv(L.x0 - lot.x0, L.x1 - lot.x0) : bv(lot.x1 - L.x1, lot.x1 - L.x0);
    // A box in lot coordinates: [u0, u1] x [v0, v1], y centre, height.
    const box = (list, u0, u1, v0, v1, y, h, color, shade = 1) => {
      const [ax, az] = toW(u0, v0), [bx, bz] = toW(u1, v1);
      list.push([(ax + bx) / 2, y, (az + bz) / 2, Math.abs(bx - ax), h, Math.abs(bz - az), color, 0, shade]);
    };
    const solid = (u0, u1, v0, v1, h, tag) => { const [ax, az] = toW(u0, v0), [bx, bz] = toW(u1, v1); g.boxes.push({ x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz), h, tag, holes: null }); };
    const near = (u, v, r) => { const [x, z] = toW(u, v); return g.doors.some((d) => Math.hypot(d.x - x, d.z - z) < r); };
    const pickW2 = (rows) => { let t = 0; for (const r of rows) t += r[1]; let p = rng() * t; for (const r of rows) if ((p -= r[1]) < 0) return r[0]; return rows[rows.length - 1][0]; };
    const tree = (u, v, kinds) => {
      if (near(u, v, 3)) return;
      const kind = pickW2(kinds), K = Y.trees.kinds[kind], h = rng.range(K.h[0], K.h[1]), r = rng.range(K.r[0], K.r[1]);
      const [x, z] = toW(u, v), canopy = ruined ? rng.pick(Y.trees.dead) : rng.pick(K.canopy);
      g.trunks.push([x, h / 2, z, 0.8, h, 0.8, K.trunk, 0, 1]);
      // A palo verde or a mesquite is a clump of crowns, not a ball; a citrus is round.
      const n = K.clump ?? 1, k = ruined ? 0.65 : 1;
      for (let i = 0; i < n; i++) {
        const a = rng() * 6.28, d = n > 1 ? r * 0.42 : 0, rr = (n > 1 ? r * 0.68 : r) * k;
        g.crowns.push([x + Math.cos(a) * d, h + rng.range(-0.3, 0.25), z + Math.sin(a) * d, rr, rr * K.squash * (ruined ? 0.8 : 1), rr * 0.92, i ? (ruined ? canopy : rng.pick(K.canopy)) : canopy, rng() * 6.28, 1]);
      }
      g.flora.push([ruined ? 'deadtree' : kind, x, z, h, r, K.squash]); // what chunkgen draws (world/flora.js); trunks/crowns above stay as rows
      g.boxes.push({ x0: x - 0.25, z0: z - 0.25, x1: x + 0.25, z1: z + 0.25, h, tag: 'tree', holes: null });
    };
    // Front yard: decomposed granite to the building's face.
    if (bv0 > 1.2) box(g.decor, lu0 + 0.3, lu1 - 0.3, 0.2, bv0 - 0.15, 0.02, 0.03, rng.pick(Y.gravel));
    // The driveway up the wider side, a carport over it beside the house.
    const left = bu0 - lu0, right = lu1 - bu1, side = right >= left ? 1 : -1, gap = Math.max(left, right);
    let driveU = null;
    if (gap >= Y.drive.min) {
      const du0 = side > 0 ? bu1 + 0.3 : bu0 - 0.3 - Y.drive.w, du1 = du0 + Y.drive.w;
      driveU = [du0, du1];
      box(g.decor, du0, du1, 0, Math.max(bv0 + 1, bv1 - 0.6), 0.035, 0.04, Y.drive.color);
      if (rng() < Y.carport.chance && !ruined) {
        const cv0 = bv0 + 0.4, cv1 = Math.min(bv1 - 0.4, cv0 + Y.carport.len), H = Y.carport.h;
        box(g.props, du0 - 0.1, du1 + 0.1, cv0, cv1, H, 0.1, rng.pick(Y.carport.roof));
        const pu = side > 0 ? du1 - 0.1 : du0 + 0.1;
        for (const pv of [cv0 + 0.15, cv1 - 0.15]) box(g.props, pu - 0.08, pu + 0.08, pv - 0.08, pv + 0.08, H / 2, H, Y.carport.post);
      }
    }
    if (rng() < Y.trees.front && bv0 >= 2.4) {
      const tu = driveU ? (side > 0 ? Math.max(lu0 + 2, bu0 + 1.5) : Math.min(lu1 - 2, bu1 - 1.5)) : rng.range(bu0 + 1.5, bu1 - 1.5);
      tree(tu, bv0 * 0.5, Y.trees.front_kinds);
    }
    // The back yard: a patio by the house, a pool, a shed and a tree in the corners. Its usable depth stops at the back
    // wall (the alley is beyond it).
    const back = LV - YARD.alley - bv1;
    if (rng() < Y.patio.chance && back > Y.patio.d + 1) box(g.decor, bu0 + 0.5, bu1 - 0.5, bv1 + 0.05, bv1 + Y.patio.d, 0.03, 0.04, Y.patio.color);
    const P = Y.pool;
    if (back >= P.minYard && rng() < P.chance) {
      const uc = (bu0 + bu1) / 2 + rng.range(-1, 1), v0 = bv1 + P.gap, pw = Math.min(P.w, bu1 - bu0 - 1);
      if (v0 + P.d < LV - YARD.alley - 1.2 && !near(uc, v0, 2.6)) {
        box(g.props, uc - pw / 2 - 0.4, uc + pw / 2 + 0.4, v0 - 0.4, v0 + P.d + 0.4, 0.06, 0.12, P.coping);
        box(g.props, uc - pw / 2, uc + pw / 2, v0, v0 + P.d, 0.13, 0.04, ruined ? '#5a6a5a' : pickW2(P.water));
        solid(uc - pw / 2, uc + pw / 2, v0, v0 + P.d, 0.4, 'pool');
      }
    }
    const corner = rng() < 0.5, cu = corner ? lu0 + 2.2 : lu1 - 2.2, cv = LV - YARD.alley - 2.0;
    if (rng() < Y.trees.back && back >= 6) tree(cu, cv, Y.trees.back_kinds);
    const S = Y.shed;
    if (rng() < S.chance && back >= 7) {
      const su = corner ? lu1 - 1.0 - S.w : lu0 + 1.0, sv = LV - YARD.alley - 0.6 - S.d; // the other back corner
      if (!near(su + S.w / 2, sv + S.d / 2, 3)) {
        box(g.props, su, su + S.w, sv, sv + S.d, S.h / 2, S.h, rng.pick(S.colors));
        box(g.props, su - 0.15, su + S.w + 0.15, sv - 0.15, sv + S.d + 0.15, S.h + 0.06, 0.12, S.roof);
        solid(su, su + S.w, sv, sv + S.d, S.h, 'shed');
      }
    }
  }

  wallSlots(room, w, d, aisle, step, n) {
    const gap = 0.04, RW = room.x1 - room.x0, RD = room.z1 - room.z0;
    const put = (x0, z0, x1, z1, wl) => { if (n >= CMAX) return; const o = n * 4; CB[o] = x0; CB[o + 1] = z0; CB[o + 2] = x1; CB[o + 3] = z1; CW[n++] = wl; };
    if (RD >= d + aisle && RW >= w + 2 * gap) {
      const last = room.x1 - gap - w;
      for (let x = room.x0 + gap, done = false; !done; x += step) {
        if (x >= last - 1e-6) { x = last; done = true; }
        put(x, room.z0 + gap, x + w, room.z0 + gap + d, 0); put(x, room.z1 - gap - d, x + w, room.z1 - gap, 1);
      }
    }
    if (RW >= d + aisle && RD >= w + 2 * gap) {
      const last = room.z1 - gap - w;
      for (let z = room.z0 + gap, done = false; !done; z += step) {
        if (z >= last - 1e-6) { z = last; done = true; }
        put(room.x0 + gap, z, room.x0 + gap + d, z + w, 2); put(room.x1 - gap - d, z, room.x1 - gap, z + w, 3);
      }
    }
    return n;
  }
  // One piece into a room, or false: the first candidate clear of the doorways and the other pieces that the probe passes
  // (opt.defer: not proved here - furnish() proves the whole building, or the room, at once). Returns its sleeping spots
  // for a bed, else true.
  placeOne(t, room, g, K, Z, rng, ctx, opt = {}) {
    const F = FURNITURE[t], [fw, fd, fh] = F.size, PR = PLAN_RULES, snug = PR.snug.includes(room.type);
    let m = 0;
    if (opt.cands) for (const c of opt.cands) { if (m >= CMAX) break; const o = m * 4; CB[o] = c.r.x0; CB[o + 1] = c.r.z0; CB[o + 2] = c.r.x1; CB[o + 3] = c.r.z1; CW[m++] = 6; }
    else if (F.centre) {
      const cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2, longX = room.x1 - room.x0 >= room.z1 - room.z0;
      for (const turn of longX === fw >= fd ? [0, 1] : [1, 0]) { // the long way along the room first
        const sx = turn ? fd : fw, sz = turn ? fw : fd;
        for (const [ox, oz] of CENTRE_OFF) {
          const x0 = cx + ox - sx / 2, z0 = cz + oz - sz / 2;
          if (x0 > room.x0 + 0.7 && x0 + sx < room.x1 - 0.7 && z0 > room.z0 + 0.7 && z0 + sz < room.z1 - 0.7) { const o = m * 4; CB[o] = x0; CB[o + 1] = z0; CB[o + 2] = x0 + sx; CB[o + 3] = z0 + sz; CW[m++] = turn ? 5 : 4; }
        }
      }
    } else {
      // A kitchen's units run on: first the spots butting up against the pieces already on a wall.
      if (F.near === '*') for (const p of ctx.placed) {
        if (p.room !== room || !p.solid || p.wall > 3) continue;
        const q = p.r, gp = PR.sameWall, put = (x0, z0, x1, z1) => { if (x0 >= room.x0 - 1e-6 && x1 <= room.x1 + 1e-6 && z0 >= room.z0 - 1e-6 && z1 <= room.z1 + 1e-6 && m < CMAX) { const o = m * 4; CB[o] = x0; CB[o + 1] = z0; CB[o + 2] = x1; CB[o + 3] = z1; CW[m++] = p.wall; } };
        if (p.wall < 2) { const z0 = p.wall === 0 ? q.z0 : q.z1 - fd; put(q.x1 + gp, z0, q.x1 + gp + fw, z0 + fd); put(q.x0 - gp - fw, z0, q.x0 - gp, z0 + fd); }
        else { const x0 = p.wall === 2 ? q.x0 : q.x1 - fd; put(x0, q.z1 + gp, x0 + fd, q.z1 + gp + fw); put(x0, q.z0 - gp - fw, x0 + fd, q.z0 - gp); }
      }
      const m0 = m;
      m = this.wallSlots(room, fw, fd, opt.aisle ?? (snug ? PR.aisle.snug : PR.aisle.open), 0.5, m);
      for (let i = m - 1; i > m0; i--) { const j = m0 + Math.floor(rng() * (i - m0 + 1)); for (let q = 0; q < 4; q++) { const a = CB[i * 4 + q]; CB[i * 4 + q] = CB[j * 4 + q]; CB[j * 4 + q] = a; } const w = CW[i]; CW[i] = CW[j]; CW[j] = w; }
    }
    // Scores (lower first): near a piece it belongs by, far from one it faces, away from the room's doorways.
    let zones = ctx.zr.get(room);
    if (!zones) ctx.zr.set(room, (zones = ctx.zones.filter((z) => z.x1 > room.x0 - 0.1 && z.x0 < room.x1 + 0.1 && z.z1 > room.z0 - 0.1 && z.z0 < room.z1 + 0.1)));
    const mine = ctx.placed.filter((p) => p.room === room);
    const near = F.near ? mine.filter((p) => (p.solid || p.bed) && (F.near === '*' || p.type === F.near || (F.near === 'bed' && p.bed))) : null;
    const far = F.far ? mine.filter((p) => p.type === F.far) : null;
    const doorsIn = F.farDoor ? zones : null;
    const scored = !!(near?.length || far?.length || doorsIn?.length);
    if (scored) for (let i = 0; i < m; i++) {
      const x0 = CB[i * 4], z0 = CB[i * 4 + 1], x1 = CB[i * 4 + 2], z1 = CB[i * 4 + 3], cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      let s = 0;
      if (near?.length) { let a = Infinity; for (const p of near) a = Math.min(a, Math.max(0, p.r.x0 - x1, x0 - p.r.x1) + Math.max(0, p.r.z0 - z1, z0 - p.r.z1)); s += a; }
      if (far?.length) { let b = Infinity; for (const p of far) b = Math.min(b, Math.max(0, p.r.x0 - x1, x0 - p.r.x1) + Math.max(0, p.r.z0 - z1, z0 - p.r.z1)); s -= b; }
      if (doorsIn?.length) { let c = Infinity; for (const z of doorsIn) c = Math.min(c, Math.hypot(cx - (z.x0 + z.x1) / 2, cz - (z.z0 + z.z1) / 2)); s -= c * 0.5; }
      CS[i] = s; CU[i] = 0;
    }
    const P = ctx.probe;
    for (let it = 0, lim = Math.min(m, opt.cands ? CMAX : 48); it < lim; it++) { // (a piece with no spot in 48 tries is not going to find one)
      let k = it;
      if (scored) { let bv = Infinity; k = -1; for (let i = 0; i < m; i++) if (!CU[i] && CS[i] < bv) { bv = CS[i]; k = i; } if (k < 0) break; CU[k] = 1; }
      const x0 = CB[k * 4], z0 = CB[k * 4 + 1], x1 = CB[k * 4 + 2], z1 = CB[k * 4 + 3], wl = CW[k];
      let bad = false;
      for (const z of zones) if (x0 < z.x1 && x1 > z.x0 && z0 < z.z1 && z1 > z.z0) { bad = true; break; }
      if (bad) continue;
      for (const p of mine) {
        const gap = Math.max(p.r.x0 - x1, x0 - p.r.x1, p.r.z0 - z1, z0 - p.r.z1);
        const need = opt.gap ?? (p.centre || F.centre ? 0.5 : p.wall === wl ? (snug || F.near === '*' ? PR.sameWall - 1e-6 : 0.3) : PR.cornerGap);
        if (gap < need) { bad = true; break; }
      }
      if (bad) continue;
      const box = { x0, z0, x1, z1, h: fh, tag: F.box ? (t === 'crate' ? 'crate' : 'shelf') : 'furniture', holes: null };
      if (F.solid && ctx.on) { P.add(box); if (!opt.defer && !ctx.verify()) { P.add(box, -1); P.flood(ctx.starts); continue; } }
      const sx = x1 - x0, sz = z1 - z0, x = (x0 + x1) / 2, z = (z0 + z1) / 2, wall = wl === 6 ? (sx >= sz ? 'C' : 'Cz') : WALLS[wl];
      const along = wall === 'N' || wall === 'S' || wall === 'C';
      let spots = null;
      if (F.bed) {
        // Sleeping places: a double bed's two halves (head to the wall), a mattress's length (it lies along the wall).
        const n = F.spots ?? 1, aw = along ? sx : sz;
        spots = [];
        for (let q = 0; q < n; q++) { const o = n > 1 ? (q - (n - 1) / 2) * (aw / n) : 0; spots.push({ x: x + (along ? o : 0), z: z + (along ? 0 : o) }); }
        if (ctx.on && !opt.defer && !spots.every((s) => P.near(s.x, s.z))) continue;
      }
      // It stays.
      const r = { x0, z0, x1, z1 };
      const col = rng.pick(F.colors), alt = F.alt ? rng.pick(F.alt) : col;
      this.parts(g, F, r, wall, col, alt);
      if (F.solid) g.boxes.push(box);
      if (spots) {
        // A bed's body lies along its length: head to the wall for a bed, along the wall for a mattress.
        const lengthX = t === 'mattress' ? along : !along;
        for (const s of spots) g.beds.push(t === 'mattress' ? { x: s.x, z: s.z, face: lengthX ? Math.PI / 2 : 0, bedY: fh * 0.55, mattress: true } : { x: s.x, z: s.z, face: lengthX ? Math.PI / 2 : 0, bedY: 0.3 });
        for (const s of spots) ctx.spots.push(s);
      }
      if (F.box) {
        const id = `ring:${Math.round(x * 10)}:${Math.round(z * 10)}`, unit = room.unit;
        const table = F.box.loot ?? ROOMS[room.type]?.loot ?? unit?.loot ?? K.loot ?? pickW(rngOf(hash32(this.seed, Math.round(x * 10), Math.round(z * 10), 3)), Z.loot);
        const label = `${F.box.label}${unit ? ` · ${unit.label}` : K.label ? ` · ${K.label}` : ''}`;
        g.boxesIn.push({ id, x, z, table, cap: F.box.cap, label });
      }
      ctx.placed.push({ r, wall: wl, type: t, room, centre: !!F.centre, solid: !!F.solid, bed: !!F.bed, box });
      return spots ?? true;
    }
    return false;
  }
  // A piece's look: its parts (FURNITURE row) as boxes in the world, turned to the wall it stands against.
  parts(g, F, r, wall, col, alt) {
    const sx = r.x1 - r.x0, sz = r.z1 - r.z0;
    for (const [a0, a1, d0, d1, y0, y1, c] of F.parts ?? [[0, 1, 0, 1, 0, F.size[2], 1]]) {
      if (y1 - y0 < 0.001 || a1 - a0 < 0.001 || d1 - d0 < 0.001) continue;
      let bx0, bx1, bz0, bz1;
      if (wall === 'N' || wall === 'C') { bx0 = r.x0 + a0 * sx; bx1 = r.x0 + a1 * sx; bz0 = r.z0 + d0 * sz; bz1 = r.z0 + d1 * sz; }
      else if (wall === 'S') { bx0 = r.x0 + a0 * sx; bx1 = r.x0 + a1 * sx; bz0 = r.z1 - d1 * sz; bz1 = r.z1 - d0 * sz; }
      else if (wall === 'W' || wall === 'Cz') { bz0 = r.z0 + a0 * sz; bz1 = r.z0 + a1 * sz; bx0 = r.x0 + d0 * sx; bx1 = r.x0 + d1 * sx; }
      else { bz0 = r.z0 + a0 * sz; bz1 = r.z0 + a1 * sz; bx0 = r.x1 - d1 * sx; bx1 = r.x1 - d0 * sx; }
      const hex = typeof c === 'number' ? col : c === '@' ? alt : c, shade = typeof c === 'number' ? c : 1;
      g.props.push([(bx0 + bx1) / 2, (y0 + y1) / 2, (bz0 + bz1) / 2, bx1 - bx0, y1 - y0, bz1 - bz0, hex, 0, shade]);
    }
  }
  // homeOf for a planned building: the same record, its pieces through placeOne (doorways clear, the probe's proof, a bed
  // with an open cell beside it). Their rooms: their unit's, or the whole house; mattresses go in the bedrooms first, the
  // biggest first, then the day rooms (never the bathroom, the hall or the kitchen), out on the floor when the walls are
  // full.
  homePlanned(L, g, hh, HR, rooms, resUnit, units, ctx) {
    const rng = rngOf(hash32(L.seed, 0x6d617474));
    const mine = units > 1 ? rooms.filter((r) => r.ui === resUnit) : rooms.slice();
    const inMine = (b) => mine.some((r) => b.x > r.x0 && b.x < r.x1 && b.z > r.z0 && b.z < r.z1);
    // A chop shop's car on blocks, in the shop floor, clear of every doorway (and proved on the probe).
    if (HR.car) {
      const room = mine.find((r) => r.frontRoom) ?? mine[0], along = L.front === 'N' || L.front === 'S', P = ctx.probe;
      const cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2, lx = along ? 4.4 : 1.9, lz = along ? 1.9 : 4.4;
      for (const [ox, oz] of [[0, 0], [3, 0], [-3, 0], [0, 2.5], [0, -2.5], [4, 2], [-4, -2], [5, 0], [-5, 0]]) {
        const x = cx + ox, z = cz + oz, r = { x0: x - lx / 2, x1: x + lx / 2, z0: z - lz / 2, z1: z + lz / 2 };
        if (r.x0 < room.x0 + 1.2 || r.x1 > room.x1 - 1.2 || r.z0 < room.z0 + 1.2 || r.z1 > room.z1 - 1.2) continue;
        if (ctx.zones.some((q) => r.x0 < q.x1 + 0.8 && r.x1 > q.x0 - 0.8 && r.z0 < q.z1 + 0.8 && r.z1 > q.z0 - 0.8)) continue;
        if (ctx.placed.some((p) => Math.max(p.r.x0 - r.x1, r.x0 - p.r.x1, p.r.z0 - r.z1, r.z0 - p.r.z1) < 1.2)) continue;
        const box = { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, h: 1.8, tag: 'wreck', holes: null };
        if (ctx.on) { P.add(box); if (!ctx.verify()) { P.add(box, -1); P.flood(ctx.starts); continue; } }
        const col = rng.pick(['#6a3a22', '#4f5a52', '#704a2a', '#5a4a36']);
        g.props.push([x, 0.85, z, lx, 0.8, lz, col, 0, 1]); // the body, up on stands (no wheels: they went first)
        g.props.push([x + (along ? -0.3 : 0), 1.5, z + (along ? 0 : -0.3), along ? 2.1 : 1.7, 0.5, along ? 1.7 : 2.1, col, 0, 0.8]); // the cab
        for (const [a, b] of [[-1.5, -0.7], [1.5, -0.7], [-1.5, 0.7], [1.5, 0.7]]) g.props.push([x + (along ? a : b), 0.22, z + (along ? b : a), 0.3, 0.44, 0.3, '#3d3a36', 0, 1]); // axle stands
        g.boxes.push(box);
        ctx.placed.push({ r, wall: 7, type: 'car', room, solid: true, box });
        break;
      }
    }
    // Beds: theirs, and a mattress for each of them the beds do not cover.
    const own = [];
    g.beds.forEach((b, i) => { if (inMine(b)) own.push(i); });
    const F = FURNITURE.mattress, [fw, fd] = F.size;
    let need = HR.faction === 'zombie' ? 0 : hh.size - own.length;
    const rank = { bedroom: 0, living: 1, dining: 2, office: 3, stock: 4, floor: 5, sales: 6, diningroom: 7 };
    const order = mine.filter((r) => rank[r.type] !== undefined).sort((a, b) => rank[a.type] - rank[b.type] || (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0));
    for (let pass = 0; pass < 2 && need > 0; pass++) for (const room of order) {
      while (need > 0) {
        let cands;
        if (pass === 1) {
          // Out on the floor: either way round, a hand's width off the walls (walkers step over a mattress).
          cands = [];
          for (const [sx, sz] of [[fw, fd], [fd, fw]]) for (let x = room.x0 + 0.15 + sx / 2; x <= room.x1 - 0.15 - sx / 2; x += 0.6) for (let z = room.z0 + 0.15 + sz / 2; z <= room.z1 - 0.15 - sz / 2; z += 0.6) cands.push({ r: { x0: x - sx / 2, z0: z - sz / 2, x1: x + sx / 2, z1: z + sz / 2 }, wall: 'floor' });
        }
        const spots = this.placeOne('mattress', room, g, null, null, rng, ctx, { aisle: 0.6, gap: pass ? 0.35 : 0.45, cands });
        if (!spots) break;
        own.push(g.beds.length - 1); need--;
      }
    }
    g.home = { rooms: mine, stay: mine.filter((r) => ROOMS[r.type]?.stay), beds: own, unit: resUnit };
  }
  // Where a household lives inside its shell: the rooms that are theirs (their unit, or the whole house), a bed for each
  // of them (a mattress on the floor where the house's own beds run out), a stripped car in a chop shop. Recorded on the
  // geo as g.home: { rooms, beds: [bed index], unit }. Its own rng: nothing else in the building moves.
  homeOf(L, g, hh, HR, rooms, resUnit, units, keep, placed, ctx) {
    if (ctx) return this.homePlanned(L, g, hh, HR, rooms, resUnit, units, ctx);
    const rng = rngOf(hash32(L.seed, 0x6d617474));
    const unitRooms = rooms.filter((r) => !r.office);
    const mine = units > 1 ? [unitRooms[resUnit] ?? unitRooms[0]] : rooms.slice();
    const inMine = (b) => mine.some((r) => b.x > r.x0 && b.x < r.x1 && b.z > r.z0 && b.z < r.z1);
    const clear = (r, wall, far, kd = 1.5) => {
      if (keep.some(([kx, kz]) => kx > r.x0 - kd && kx < r.x1 + kd && kz > r.z0 - kd && kz < r.z1 + kd)) return false;
      for (const p of placed) {
        const gap = Math.max(p.r.x0 - r.x1, r.x0 - p.r.x1, p.r.z0 - r.z1, r.z0 - p.r.z1);
        if (gap < (p.wall === wall ? 0.3 : far)) return false;
      }
      return true;
    };
    // A chop shop's car on blocks, in the big room, clear of every doorway.
    if (HR.car) {
      const room = mine.find((r) => r.frontRoom) ?? mine[0], along = L.front === 'N' || L.front === 'S';
      const cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2, lx = along ? 4.4 : 1.9, lz = along ? 1.9 : 4.4;
      for (const [ox, oz] of [[0, 0], [3, 0], [-3, 0], [0, 2.5], [0, -2.5], [4, 2], [-4, -2]]) {
        const x = cx + ox, z = cz + oz, r = { x0: x - lx / 2, x1: x + lx / 2, z0: z - lz / 2, z1: z + lz / 2 };
        if (r.x0 < room.x0 + 1.4 || r.x1 > room.x1 - 1.4 || r.z0 < room.z0 + 1.4 || r.z1 > room.z1 - 1.4 || !clear(r, 'car', 1.4)) continue;
        if (keep.some(([kx, kz]) => Math.hypot(kx - x, kz - z) < 3.2)) continue;
        const col = rng.pick(['#6a3a22', '#4f5a52', '#704a2a', '#5a4a36']);
        g.props.push([x, 0.85, z, lx, 0.8, lz, col, 0, 1]); // the body, up on stands (no wheels: they went first)
        g.props.push([x + (along ? -0.3 : 0), 1.5, z + (along ? 0 : -0.3), along ? 2.1 : 1.7, 0.5, along ? 1.7 : 2.1, col, 0, 0.8]); // the cab
        for (const [a, b] of [[-1.5, -0.7], [1.5, -0.7], [-1.5, 0.7], [1.5, 0.7]]) g.props.push([x + (along ? a : b), 0.22, z + (along ? b : a), 0.3, 0.44, 0.3, '#3d3a36', 0, 1]); // axle stands
        g.boxes.push({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, h: 1.8, tag: 'wreck', holes: null });
        placed.push({ r, wall: 'car' });
        break;
      }
    }
    // Beds: theirs, and a mattress for each of them the beds do not cover.
    const own = [];
    g.beds.forEach((b, i) => { if (inMine(b)) own.push(i); });
    const F = FURNITURE.mattress, [fw, fd, fh] = F.size;
    let need = HR.faction === 'zombie' ? 0 : hh.size - own.length;
    const order = mine.slice().sort((a, b) => (b.back ? 1 : 0) - (a.back ? 1 : 0) || (b.office ? 1 : 0) - (a.office ? 1 : 0));
    const lay = (r, wall) => {
      const x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2, sx = r.x1 - r.x0, sz = r.z1 - r.z0;
      placed.push({ r, wall });
      g.props.push([x, fh / 2, z, sx, fh, sz, rng.pick(F.colors), 0, 1]);
      own.push(g.beds.length);
      g.beds.push({ x, z, face: sx > sz ? Math.PI / 2 : 0, bedY: fh * 0.55, mattress: true });
    };
    for (let pass = 0; pass < 2 && need > 0; pass++) for (const room of order) {
      if (need <= 0) break;
      // Along the walls first; then out on the floor (a mattress is not in anyone's way: walkers step over it).
      const cands = pass === 0 ? this.slots(room, fw, fd, rng) : [];
      // Out on the floor: either way round, a hand's width off the walls.
      if (pass === 1) for (const [sx, sz] of [[fw, fd], [fd, fw]]) for (let x = room.x0 + 0.15 + sx / 2; x <= room.x1 - 0.15 - sx / 2; x += 0.8) for (let z = room.z0 + 0.15 + sz / 2; z <= room.z1 - 0.15 - sz / 2; z += 0.8) cands.push({ r: { x0: x - sx / 2, x1: x + sx / 2, z0: z - sz / 2, z1: z + sz / 2 }, wall: 'floor' });
      for (const c of cands) {
        if (need <= 0) break;
        if (!(pass ? clear(c.r, c.wall, 0.35, 0.9) : clear(c.r, c.wall, 1.0))) continue;
        lay(c.r, c.wall); need--;
      }
    }
    g.home = { rooms: mine, beds: own, unit: resUnit };
  }
  // A wall's visual piece (exact extents along its axis), into list as [cx, cy, cz, sx, sy, sz, hex, rot, shade].
  piece(list, horizontal, fixed, a0, a1, y0, y1, hex, shade) {
    if (a1 - a0 < 0.05) return;
    const t = T / 2, minX = horizontal ? a0 : fixed - t, maxX = horizontal ? a1 : fixed + t, minZ = horizontal ? fixed - t : a0, maxZ = horizontal ? fixed + t : a1;
    list.push([(minX + maxX) / 2, (y0 + y1) / 2, (minZ + maxZ) / 2, maxX - minX, y1 - y0, maxZ - minZ, hex, 0, shade]);
  }
  wallBox(horizontal, fixed, a0, a1, h, tag, holes) {
    const t = T / 2;
    return horizontal ? { x0: a0, z0: fixed - t, x1: a1, z1: fixed + t, h, tag, holes, holeX: true } : { x0: fixed - t, z0: a0, x1: fixed + t, z1: a1, h, tag, holes, holeX: false };
  }
  // The rooms inside a shell: [{ x0, z0, x1, z1 (inner faces), back, frontRoom, unit, office }].
  rooms(L, inner, units, uA, uB, ns) {
    const t = T / 2, { x0, z0, x1, z1 } = L;
    const box = { x0: x0 + t, z0: z0 + t, x1: x1 - t, z1: z1 - t };
    const out = [];
    if (units > 1) {
      const cuts = [uA, ...inner.filter((p) => p.horizontal !== ns).map((p) => p.fixed), uB].sort((a, b) => a - b);
      const pick = rngOf(L.seed ^ 0x2545f491);
      for (let u = 0; u < cuts.length - 1; u++) {
        const a = cuts[u] + (u ? t : 0), b = cuts[u + 1] - (u < cuts.length - 2 ? t : 0);
        const r = ns ? { x0: Math.max(box.x0, a), x1: Math.min(box.x1, b), z0: box.z0, z1: box.z1 } : { z0: Math.max(box.z0, a), z1: Math.min(box.z1, b), x0: box.x0, x1: box.x1 };
        out.push({ ...r, unit: L.kind === 'mall' ? UNITS[pick.int(0, UNITS.length - 1)] : null });
      }
      return out;
    }
    const fp = inner.find((p) => p.horizontal === ns && p.gaps.length && !L.office);
    if (fp && L.kind !== 'shop' && L.kind !== 'warehouse') {
      const frontLow = L.front === 'N' || L.front === 'W';
      const a = ns ? { ...box, z1: fp.fixed - t } : { ...box, x1: fp.fixed - t }, b = ns ? { ...box, z0: fp.fixed + t } : { ...box, x0: fp.fixed + t };
      out.push({ ...(frontLow ? a : b), frontRoom: true }, { ...(frontLow ? b : a), back: true });
      return out;
    }
    if (L.office) {
      const o = L.office, r = ns ? { x0: o.u0 + t, x1: o.u1 - t, z0: o.v0 + t, z1: o.v1 - t } : { z0: o.u0 + t, z1: o.u1 - t, x0: o.v0 + t, x1: o.v1 - t };
      out.push({ ...box, frontRoom: true, avoid: r }, { ...r, office: true, back: true });
      return out;
    }
    out.push({ ...box, frontRoom: true });
    return out;
  }
  // Candidate spots for a piece of furniture w x d against the walls of a room, in a seeded order.
  slots(room, w, d, rng) {
    const out = [], gap = 0.06, step = 0.9;
    const RW = room.x1 - room.x0, RD = room.z1 - room.z0;
    const push = (r, wall) => {
      if (r.x0 < room.x0 - 0.001 || r.x1 > room.x1 + 0.001 || r.z0 < room.z0 - 0.001 || r.z1 > room.z1 + 0.001) return;
      const A = room.avoid;
      if (A && r.x0 < A.x1 + 1.2 && r.x1 > A.x0 - 1.2 && r.z0 < A.z1 + 1.2 && r.z1 > A.z0 - 1.2) return;
      out.push({ r, wall });
    };
    // Along x walls (north and south faces): the piece runs along x.
    if (RD >= d * 2 + 2.2 || RD >= d + 2.4) for (let x = room.x0 + 0.5 + w / 2; x <= room.x1 - 0.5 - w / 2; x += step) {
      push({ x0: x - w / 2, x1: x + w / 2, z0: room.z0 + gap, z1: room.z0 + gap + d }, 'N');
      push({ x0: x - w / 2, x1: x + w / 2, z0: room.z1 - gap - d, z1: room.z1 - gap }, 'S');
    }
    if (RW >= d * 2 + 2.2 || RW >= d + 2.4) for (let z = room.z0 + 0.5 + w / 2; z <= room.z1 - 0.5 - w / 2; z += step) {
      push({ z0: z - w / 2, z1: z + w / 2, x0: room.x0 + gap, x1: room.x0 + gap + d }, 'W');
      push({ z0: z - w / 2, z1: z + w / 2, x0: room.x1 - gap - d, x1: room.x1 - gap }, 'E');
    }
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = out[i]; out[i] = out[j]; out[j] = t; }
    return out;
  }

  // ---- cars left at the kerb, the Iron Line running on ------------------------------------------------------------
  // Wrecks owned by chunk (cx, cz): whole, never across its edge. [{ x, z, rot, color, along }].
  wrecks(cx, cz) {
    const ox = cx * C, oz = cz * C, out = [], WRK = ['#5a3a24', '#4a3020', '#6b4a2e', '#3d3a36', '#704020', '#4f5a52', '#6a5a3a'];
    for (const s of this.streets(ox, oz, ox + C, oz + C)) {
      const len = s.axis === 'z' ? s.z1 - s.z0 : s.x1 - s.x0;
      if (len < 30) continue;
      const blk = this.block(s.axis === 'z' ? s.line : Math.floor((s.x0 + s.x1) / 2 / G), s.axis === 'z' ? Math.floor((s.z0 + s.z1) / 2 / G) : s.line);
      const Z = blk.Z ?? this.block(s.axis === 'z' ? s.line - 1 : Math.floor((s.x0 + s.x1) / 2 / G), s.axis === 'z' ? Math.floor((s.z0 + s.z1) / 2 / G) : s.line - 1).Z;
      if (!Z) continue;
      const h = hash32(this.seed, Math.round(s.x0), Math.round(s.z0), 77), r = rngOf(h);
      if (r() >= Z.wrecks * (len / 80)) continue;
      const a = (s.axis === 'z' ? s.z0 : s.x0) + 14 + r() * (len - 28), side = r() < 0.5 ? -1 : 1;
      const c = s.line * G, off = (hw(s.line) - 1.6) * side;
      const x = s.axis === 'z' ? c + off : a, z = s.axis === 'z' ? a : c + off;
      const along = s.axis === 'z', hx = along ? 0.95 : 2.1, hz = along ? 2.1 : 0.95;
      if (x - hx < ox || x + hx > ox + C || z - hz < oz || z + hz > oz + C) continue;
      out.push({ x, z, rot: (along ? 0 : Math.PI / 2) + (r() - 0.5) * 0.12, color: WRK[h % WRK.length], along });
    }
    return out;
  }
  // The rail through the ring (beyond the island's own track): the stretch [z0, z1] of x = RING.rail.x in this chunk.
  railIn(cx, cz) {
    const ox = cx * C, oz = cz * C, x = RING.rail.x;
    if (x < ox || x >= ox + C) return null;
    const a = Math.max(oz, -this.reach), b = Math.min(oz + C, this.reach), out = [];
    for (const [s, e] of [[a, Math.min(b, -472)], [Math.max(a, 472), b]]) if (e - s > 1) {
      // Only where the city is (the yards); the line fades out past the edge.
      let s2 = s, e2 = e;
      while (s2 < e2 && !this.inCity(x, s2, 40)) s2 += 4;
      while (e2 > s2 && !this.inCity(x, e2, 40)) e2 -= 4;
      if (e2 - s2 > 1) out.push([s2, e2]);
    }
    return out.length ? out : null;
  }

  // ---- reports ------------------------------------------------------------------------------------------------------
  // The building around (x, z) (owned by any chunk), or null.
  at(x, z) {
    const b = this.block(Math.floor(x / G), Math.floor(z / G));
    if (!b.city) return null;
    for (const L of b.lots) if (!L.empty && !L.cut && x > L.x0 && x < L.x1 && z > L.z0 && z < L.z1) { this.owned(Math.floor(L.cx / C), Math.floor(L.cz / C)); return L.cut ? null : L; }
    return null;
  }
  // The whole ring, counted (lots only: cheap). Used by the `ring` command and the metro map.
  survey() {
    if (this.surveyCache) return this.surveyCache;
    const t0 = performance.now(), byZone = {}, byKind = {}, n = this.kMax;
    let blocks = 0, buildings = 0, ruined = 0, cut = 0, empty = 0;
    for (let cx = -Math.ceil(this.reach / C) - 1; cx <= Math.ceil(this.reach / C); cx++) for (let cz = -Math.ceil(this.reach / C) - 1; cz <= Math.ceil(this.reach / C); cz++) this.owned(cx, cz);
    for (let k = -n; k <= n; k++) for (let j = -n; j <= n; j++) {
      const b = this.block(k, j);
      if (!b.city) continue;
      blocks++; byZone[b.zone] = (byZone[b.zone] ?? 0) + 1;
      for (const L of b.lots) { if (L.empty) { empty++; continue; } if (L.cut) { cut++; continue; } buildings++; byKind[L.kind] = (byKind[L.kind] ?? 0) + 1; if (L.ruined) ruined++; }
    }
    return (this.surveyCache = { blocks, buildings, ruined, emptyLots: empty, overBudget: cut, byZone, byKind, ms: +(performance.now() - t0).toFixed(1) });
  }
}
