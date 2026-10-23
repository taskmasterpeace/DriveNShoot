// A walled HOLDOUT in a streamed region (docs/design/WEB_FLORIDA.md §3.4; rows in data/holdouts.js): Meridian. Built
// from the generators the Phoenix ring already has, so a holdout is ring-like to the chunk generator (world/chunkgen.js
// asks every "towner" the same questions: touches, streets, blocksOver/pads, around, geo, wrecks, railIn):
//   streets  - its own grid inside the wall: Main Street gate to gate, the rows and avenues, a dirt lane along the wall
//   lots     - the programmes of its blocks in order along their front street, each a walk-in planned building through
//              the ring's own geo() (world/ring.js: shells, doors, windows, floor plans, furniture, containers, beds)
//   extras   - the wall (panels, junk, posts, towers, gates and their name boards), the market square, the gardens and
//              fields, the pit, the boneyard, the water tower, the lagoon road and its pier, lamps, palms and oaks
// Pure: a function of the rows, the seed and where the exit put it. Positions are world metres; collision axis-aligned.
import { KINDS, RING } from '../data/ring.js';
import { HOLDOUT } from '../data/holdout.js';
import { C, hash32, rngOf, chunkOf } from './geo.js';

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const pickW = (rng, rows) => { let t = 0; for (const r of rows) t += r[1]; let p = rng() * t; for (const r of rows) if ((p -= r[1]) < 0) return r[0]; return rows[rows.length - 1][0]; };

export class Holdout {
  // f: the exit's frame on its corridor (x, z, tx, tz, nx, nz). The holdout stands between the road and the lagoon.
  constructor(W, R, row, f) {
    this.W = W; this.R = R; this.row = row; this.id = row.id; this.name = row.name;
    this.hw = row.size[0] / 2; this.hd = row.size[1] / 2;
    const shore = R.mainlandShore ? R.mainlandShore(f.z) : Infinity;
    let cx = Number.isFinite(shore) ? shore - row.shoreGap - this.hw : f.x + 1200 + this.hw;
    cx = Math.max(cx, f.x + 800 + this.hw); // never crowding the interchange
    this.cx = Math.round(cx); this.cz = Math.round(f.z);
    this.x0 = this.cx - this.hw; this.x1 = this.cx + this.hw; this.z0 = this.cz - this.hd; this.z1 = this.cz + this.hd;
    this.approach = { x: this.x0 - row.approach, z: this.cz };
    this.seed = hash32(W.seed, row.seed);
    this.shore = shore;
    this.lots = []; this.blocks = []; this.streetList = []; this.items = []; this.boxes = []; this.flora = []; this.spots = {}; this.gates = [];
    this.layout();
  }
  // local -> world
  X(lx) { return this.cx + lx; }
  Z(lz) { return this.cz + lz; }
  overlaps(x0, z0, x1, z1) { return x1 > this.x0 && x0 < this.x1 && z1 > this.z0 && z0 < this.z1; }
  // The whole footprint the chunks must ask about: the wall, the approach, the lagoon road and pier.
  get reach() { return { x0: this.x0 - this.row.approach - 30, z0: this.z0 - 30, x1: (this.dockEnd ?? this.x1) + 30, z1: this.z1 + 30 }; }
  touches(cx, cz) { const r = this.reach, x0 = cx * C, z0 = cz * C; return x0 < r.x1 && x0 + C > r.x0 && z0 < r.z1 && z0 + C > r.z0; }
  inCity(x, z, m = 0) { return x > this.x0 - m && x < this.x1 + m && z > this.z0 - m && z < this.z1 + m; }
  // 0 outside, 1 inside the wall (the ground tint and the wild scatter follow it).
  cityK(x, z) {
    const d = Math.max(this.x0 - x, x - this.x1, this.z0 - z, z - this.z1);
    return 1 - smooth((d + 6) / 30);
  }
  depth(x, z) { return -Math.max(this.x0 - x, x - this.x1, this.z0 - z, z - this.z1); }
  // Paved or built on (wild scatter keeps off): inside the wall, the approach and the lagoon road.
  solid(x, z, r = 0) {
    if (this.inCity(x, z, 6 + r)) return true;
    for (const p of this.outPads) if (x > p.x0 - 3 - r && x < p.x1 + 3 + r && z > p.z0 - 3 - r && z < p.z1 + 3 + r) return true;
    return false;
  }
  // Is (x, z) on the pier (dry over the lagoon: the water authority asks).
  onPier(x, z) { const p = this.pier; return !!p && x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1; }

  // ---- the layout ----------------------------------------------------------------------------------------------------
  layout() {
    const H = this.row, rng = rngOf(this.seed), hw = this.hw, hd = this.hd, t = H.wall.t, lane = H.lane, walk = H.walk;
    // Street lines in local metres.
    const ew = H.streets.ew, ns = H.streets.ns;
    const inner = { x0: -hw + t + lane, x1: hw - t - lane, z0: -hd + t + lane, z1: hd - t - lane };
    for (const s of ew) {
      const a0 = s.gates ? -hw : inner.x0, a1 = s.gates ? hw : inner.x1;
      this.streetList.push({ x0: this.X(a0), x1: this.X(a1), z0: this.Z(s.at - s.w / 2), z1: this.Z(s.at + s.w / 2), axis: 'x', line: `${this.id}:${s.name}`, name: s.name, art: !!s.gates });
    }
    for (const s of ns) {
      const a0 = s.north ? -hd : inner.z0, a1 = inner.z1;
      this.streetList.push({ x0: this.X(s.at - s.w / 2), x1: this.X(s.at + s.w / 2), z0: this.Z(a0), z1: this.Z(a1), axis: 'z', line: `${this.id}:${s.name}`, name: s.name, art: false });
    }
    // Block edges (local): between the inner lane and each street, less the walks.
    const xs = [inner.x0, ...ns.map((s) => s.at), inner.x1], zs = [inner.z0, ...ew.map((s) => s.at), inner.z1];
    const halfX = (i) => (i === 0 || i === xs.length - 1 ? 0 : ns[i - 1].w / 2 + walk), halfZ = (j) => (j === 0 || j === zs.length - 1 ? 0 : ew[j - 1].w / 2 + walk);
    const blockRect = (c, r) => ({ x0: xs[c] + halfX(c), x1: xs[c + 1] - halfX(c + 1), z0: zs[r] + halfZ(r), z1: zs[r + 1] - halfZ(r + 1) });
    // The walks along every street (sidewalk band) and the dirt lane inside the wall, as pads.
    const pads = [];
    for (const s of this.streetList) {
      if (s.axis === 'x') { pads.push({ x0: s.x0, x1: s.x1, z0: s.z0 - walk, z1: s.z0, band: 'walk' }, { x0: s.x0, x1: s.x1, z0: s.z1, z1: s.z1 + walk, band: 'walk' }); }
      else { pads.push({ x0: s.x0 - walk, x1: s.x0, z0: s.z0, z1: s.z1, band: 'walk' }, { x0: s.x1, x1: s.x1 + walk, z0: s.z0, z1: s.z1, band: 'walk' }); }
    }
    const L0 = -hw + t, L1 = hw - t, M0 = -hd + t, M1 = hd - t;
    pads.push({ x0: this.X(L0), x1: this.X(L1), z0: this.Z(M0), z1: this.Z(M0 + lane), band: 'yard' }, { x0: this.X(L0), x1: this.X(L1), z0: this.Z(M1 - lane), z1: this.Z(M1), band: 'yard' },
      { x0: this.X(L0), x1: this.X(L0 + lane), z0: this.Z(M0 + lane), z1: this.Z(M1 - lane), band: 'yard' }, { x0: this.X(L1 - lane), x1: this.X(L1), z0: this.Z(M0 + lane), z1: this.Z(M1 - lane), band: 'yard' });
    this.blocks.push({ id: 'streets', city: true, pads, x0: this.x0, z0: this.z0, x1: this.x1, z1: this.z1, lots: [] });
    // Blocks and their lots.
    let k = 0;
    for (const B of H.blocks) {
      const [c, r] = B.at, br = blockRect(c, r), wr = { x0: this.X(br.x0), x1: this.X(br.x1), z0: this.Z(br.z0), z1: this.Z(br.z1) };
      const blk = { id: `${this.id}.${c}.${r}`, name: B.name ?? null, city: true, zone: 'holdout', ...wr, lots: [], pads: [], open: B.open ?? null, front: B.front ?? null };
      this.blocks.push(blk);
      let used = null;
      if (B.lots) used = this.packLots(blk, B, rng, () => `${this.id}.${k++}`, c * 16 + r);
      // The back of the block faces the next street: a second row of lots, facing it (half the depth each).
      if (B.back) this.packLots(blk, { lots: B.back, front: { N: 'S', S: 'N', W: 'E', E: 'W' }[B.front], open: 'half' }, rng, () => `${this.id}.${k++}`, c * 16 + r + 256);
      if (B.open) this.openLot(blk, B.open, used, rng);
    }
    this.gatesAndWall(rng);
    this.yards(rngOf(hash32(this.seed, 0x59415244))); // its own stream: the lots above never move for it
    this.outside(rng);
    this.trees(rng);
    this.lamps(rng);
    this.signs();
    // Spots people stand at (systems/regions.js).
    const mk = this.blocks.find((b) => b.open === 'market'), gd = this.blocks.filter((b) => b.open === 'garden'), ar = this.blocks.find((b) => b.open === 'arena'), jk = this.blocks.find((b) => b.open === 'junk'), yd = this.blocks.find((b) => b.open === 'yard');
    const mid = (b) => ({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, r: Math.min(b.x1 - b.x0, b.z1 - b.z0) / 2 - 6 });
    this.spots = { market: mk ? [mid(mk)] : [], garden: gd.map(mid), pit: ar ? [mid(ar)] : [], junk: jk ? [mid(jk)] : [], yard: yd ? [yd.yardSpot ?? mid(yd)] : [], dock: this.pier ? [{ x: this.pier.x0 - 6, z: (this.pier.z0 + this.pier.z1) / 2 + 4, r: 4 }] : [] };
    for (const g of this.gates) this.spots[`gate:${g.side}`] = [{ x: g.inX, z: g.inZ, r: 3 }];
    // Main Street's walks (people out and about), and the bench outside the clinic (the waiting line).
    const main = this.streetList.find((s) => s.name === 'MAIN STREET' && !s.line.endsWith('approach'));
    if (main) { this.spots.main = []; for (let k = 0; k < 8; k++) { const x = main.x0 + 30 + (k / 7) * (main.x1 - main.x0 - 60), z = k % 2 ? main.z1 + this.row.walk / 2 : main.z0 - this.row.walk / 2; this.spots.main.push({ x, z, r: 2 }); } }
    const cl = this.lotOf('clinic');
    if (cl) this.spots.clinic = [{ x: cl.cx + (cl.x1 - cl.cx) * 0.6, z: cl.front === 'S' ? cl.z1 + 2.2 : cl.z0 - 2.2, r: 1.5 }];
    // Everything's ids in order (ownership is by centre; a chunk owns at most the lots whose centre it holds).
    this.lots.sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  // Lay a block's programmes along its front street: real widths from KINDS, evenly spaced, centred; each lot runs from
  // the walk to the block's back (or half of it, when the block's other half is open ground).
  packLots(blk, B, rng, nextId, salt = 0) {
    const list = [];
    for (const it of B.lots) { if (Array.isArray(it)) for (let i = 0; i < it[1]; i++) list.push(it[0]); else list.push(it); }
    const F = B.front, ns = F === 'N' || F === 'S', u0 = ns ? blk.x0 : blk.z0, u1 = ns ? blk.x1 : blk.z1, depth = ns ? blk.z1 - blk.z0 : blk.x1 - blk.x0;
    const half = B.open === 'half' || B.back ? depth * 0.5 : B.open ? depth * 0.55 : depth;
    const set = 3.5, gapMin = 3.2;
    const sizes = list.map((kind) => { const K = KINDS[kind]; const w = rng.range(K.w[0], K.w[1]), d = Math.min(rng.range(K.d[0], K.d[1]), half - set - 2); return { kind, w, d }; });
    while (sizes.length && sizes.reduce((s, q) => s + q.w, 0) + gapMin * (sizes.length + 1) > u1 - u0) sizes.pop();
    const free = u1 - u0 - sizes.reduce((s, q) => s + q.w, 0), gap = free / (sizes.length + 1);
    let u = u0 + gap;
    const frontEdge = F === 'N' ? blk.z0 : F === 'S' ? blk.z1 : F === 'W' ? blk.x0 : blk.x1, sgn = F === 'N' || F === 'W' ? 1 : -1;
    const G = this.row.grit;
    for (let i = 0; i < sizes.length; i++) {
      // No ruled frontage (grit.setback, grit.shift): each building sits a little deeper or shallower and slides along its
      // street, on a stream of its own per lot, so no lot's size, seed or programme moves for it.
      const q = sizes[i], res = q.kind === 'house' || q.kind === 'bungalow' || q.kind === 'duplex' || q.kind === 'boarding';
      let dv = 0, du = 0;
      if (G) {
        const jr = rngOf(hash32(this.seed, salt, i, 0x4a495454)), kk = res ? 1 : 0.33;
        dv = (G.setback[0] + jr() * (G.setback[1] - G.setback[0])) * kk; du = (jr() * 2 - 1) * G.shift * gap * kk;
        dv = Math.max(1.8 - set, Math.min(dv, half - set - q.d - 1.2));
      }
      const a0 = u + du, a1 = u + du + q.w, v0 = frontEdge + sgn * (set + dv), v1 = v0 + sgn * q.d;
      const lotA0 = i === 0 ? u0 : u - gap / 2, lotA1 = i === sizes.length - 1 ? u1 : u + q.w + gap / 2, lv0 = frontEdge, lv1 = frontEdge + sgn * half;
      const r = ns ? { x0: a0, x1: a1, z0: Math.min(v0, v1), z1: Math.max(v0, v1) } : { z0: a0, z1: a1, x0: Math.min(v0, v1), x1: Math.max(v0, v1) };
      const lot = ns ? { x0: lotA0, x1: lotA1, z0: Math.min(lv0, lv1), z1: Math.max(lv0, lv1) } : { z0: lotA0, z1: lotA1, x0: Math.min(lv0, lv1), x1: Math.max(lv0, lv1) };
      // Doorways sit on whole-metre cells: round the shell to the metre grid (chunk origins are whole metres).
      for (const k of ['x0', 'x1', 'z0', 'z1']) r[k] = Math.round(r[k] * 2) / 2;
      const L = { id: nextId(), kind: q.kind, zone: 'holdout', front: F, ...r, lot, cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2, seed: rng.int(0, 2147483647), ruined: false, noYard: true,
        holdout: this.id, block: blk.id, programme: KINDS[q.kind].label ?? q.kind.toUpperCase(), blockKey: blk.id };
      L.backRow = B.open === 'half'; L.salt = hash32(this.seed, salt, i, 0x4c4f54);
      // Burnt shells (grit.burn): a back-row house that went up in the fall, left standing roofless (its own zone row).
      if (G && L.backRow && (q.kind === 'house' || q.kind === 'bungalow') && rngOf(hash32(this.seed, salt, i, 0x4255524e))() < G.burn) {
        L.ruined = true; L.burnt = true; L.zone = 'holdout_burnt'; L.programme = `BURNT ${L.programme}`;
      }
      blk.lots.push(L); this.lots.push(L);
      u = a1 - du + gap;
    }
    // What the lots leave of the block (the open half behind them, for a yard or a tower).
    if (!B.open || B.open === 'half' || !sizes.length) return null;
    const back = F === 'N' ? { x0: blk.x0, x1: blk.x1, z0: blk.z0 + half + 1, z1: blk.z1 } : F === 'S' ? { x0: blk.x0, x1: blk.x1, z0: blk.z0, z1: blk.z1 - half - 1 } : null;
    return back;
  }

  // ---- open lots: data/holdout.js rows, Florida-dressed ----------------------------------------------------------------
  P(pool, x, y, z, w, h, d, col, rot = 0, shade = 1) { this.items.push({ pool, e: [x, y, z, w, h, d, col, rot, shade] }); }
  box(x0, z0, x1, z1, h, tag) { this.boxes.push({ x0, z0, x1, z1, h, tag }); }
  openLot(blk, kind, area, rng) {
    const b = area ?? blk, M = HOLDOUT.market, Y = HOLDOUT.yard, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
    if (kind === 'market') {
      // The square: stall rows round a fire (data/holdout.js market), a well. No paving: it is the town's packed earth (the
      // ground's town floor, world/surfaces.js), worn by feet. The awnings are striped canvas, not roofs, and the square is
      // in use (docs/design/WEB_LOOK.md §3.8): stock stacked behind the counters, sacks, a handcart, fire barrels, washing
      // strung between the rows, a cook tarp with benches, a trough at the well, tyres and scrap in the corners. The clutter
      // runs on a stream of its own, so the stalls (the layout's own draws) stand where they did.
      const r2 = rngOf(hash32(this.seed, 0x4d4b5432)), pk = (a) => a[Math.floor(r2() * a.length)];
      const CR = ['#7a5a34', '#6b4e2e', '#8a6a44', '#5e4a32'], SACK = ['#a08a5a', '#b09a6a', '#8a7a52'];
      const rows = [cz - M.aisle - 6, cz + M.aisle + 6, cz - M.aisle - 17, cz + M.aisle + 17].filter((z) => z > b.z0 + 4 && z < b.z1 - 4); // four rows of stalls
      for (const rz of rows) for (let sx = b.x0 + 7; sx < b.x1 - 6; sx += 7.2) {
        if (rng() > M.fill) continue;
        const aw = rng.pick(M.awnings), across = Math.abs(rz - cz) < M.aisle + 10 ? (rz < cz ? 1 : -1) : (rz < cz ? -1 : 1);
        // The awning: canvas with two stripes of the stall's colour, a little off true (pegged by hand).
        const tw = (r2() - 0.5) * 0.08;
        this.P('props', sx, 2.6, rz, 4.6, 0.08, 3.6, M.canvas, tw, 0.95 + r2() * 0.1);
        for (const o of [-1.15, 1.15]) this.P('props', sx + o * Math.cos(tw), 2.65, rz - o * Math.sin(tw), 0.95, 0.06, 3.62, aw, tw, 0.9 + r2() * 0.15);
        for (const px of [-2.1, 2.1]) for (const pz of [-1.6, 1.6]) this.P('props', sx + px, 1.3, rz + pz, 0.12, 2.6, 0.12, '#5a4632');
        this.P('props', sx, 0.5, rz + across * 1.2, 3.8, 1.0, 0.8, rng.pick(M.counter));   // the counter
        for (let g = 0; g < 4; g++) this.P('props', sx - 1.4 + g * 0.95, 1.08, rz + across * 1.2, 0.5, 0.18, 0.4, rng.pick(M.goods));
        this.P('floors', sx, 0.03, rz - across * 0.4, 3.4, 0.04, 2.0, rng.pick(M.rugs));
        this.box(sx - 1.9, rz + across * 1.2 - 0.4, sx + 1.9, rz + across * 1.2 + 0.4, 1.0, 'stall');
        // Stock behind the keeper (out of the aisle): crates stacked, sacks, a basket.
        const bz = rz - across * 1.55;
        for (let k = 0, n = 1 + Math.floor(r2() * 3); k < n; k++) { const x = sx - 1.6 + r2() * 0.9 + (k % 2) * 2.2; this.P('props', x, 0.3 + (k > 1 ? 0.6 : 0), bz, 0.75, 0.6, 0.6, pk(CR), r2() * 0.3); }
        for (let k = 0, n = Math.floor(r2() * 3); k < n; k++) this.P('shrubs', sx + 0.4 + r2() * 1.2, 0.3, bz + (r2() - 0.5) * 0.4, 0.42, 0.34, 0.36, pk(SACK), r2() * 6);
        if (r2() < 0.5) this.P('barrels', sx + 1.5, 0.35, rz - across * 0.2, 0.7, 0.55, 0.7, pk(M.goods));
      }
      // The fire in the middle (a ring of stones, a barrel), benches round it, and the well.
      this.P('barrels', cx, 0.55, cz, 1.1, 1, 1.1, '#5a2e1a'); this.box(cx - 0.6, cz - 0.6, cx + 0.6, cz + 0.6, 1.1, 'barrel');
      this.items.push({ pool: 'glows', e: [cx, 0.12, cz, 16, 1, 16, '#ff8a3a', 0, 1], glow: true });
      for (let a = 0; a < 6.28; a += 0.8) this.P('boulders', cx + Math.cos(a) * 1.6, 0.2, cz + Math.sin(a) * 1.6, 0.4, 0.3, 0.4, '#7e7466', a);
      for (const a of [0.5, 2.6, 4.4]) { const bxp = cx + Math.cos(a) * 3.4, bzp = cz + Math.sin(a) * 3.4; this.P('props', bxp, 0.4, bzp, 2.2, 0.12, 0.5, '#6a5440', -a + Math.PI / 2); for (const o of [-0.8, 0.8]) this.P('props', bxp - Math.sin(a) * o, 0.2, bzp + Math.cos(a) * o, 0.14, 0.4, 0.4, '#4a3a2a', -a + Math.PI / 2); }
      const wx = b.x1 - 9, wz = cz;
      this.P('barrels', wx, 0.45, wz, 3.2, 0.82, 3.2, '#8a8478'); this.P('props', wx, 2.0, wz, 3.6, 0.15, 0.3, '#4a3a2a'); this.box(wx - 1.6, wz - 1.6, wx + 1.6, wz + 1.6, 0.9, 'well');
      for (const px of [-1.6, 1.6]) this.P('props', wx + px, 1.0, wz, 0.15, 2.0, 0.15, '#4a3a2a');
      // A trough by the well, buckets.
      this.P('props', wx, 0.35, wz + 3.0, 3.0, 0.7, 0.8, '#6a5a44'); this.P('props', wx, 0.66, wz + 3.0, 2.7, 0.04, 0.55, '#4a6a72'); this.box(wx - 1.5, wz + 2.6, wx + 1.5, wz + 3.4, 0.7, 'trough');
      for (const o of [-2.2, 2.4]) this.P('barrels', wx + o, 0.22, wz - 2.4, 0.5, 0.42, 0.5, '#7d827c');
      // Fire barrels in the aisles (lit at night) and a handcart.
      for (const [fx, fz] of [[b.x0 + 4, cz], [cx - 16, cz + (M.aisle + 11.5)], [cx + 14, cz - (M.aisle + 11.5)]]) {
        if (fz < b.z0 + 3 || fz > b.z1 - 3) continue;
        this.P('barrels', fx, 0.5, fz, 0.9, 1.0, 0.9, '#4a2e1e'); this.box(fx - 0.45, fz - 0.45, fx + 0.45, fz + 0.45, 1.0, 'barrel');
        this.items.push({ pool: 'glows', e: [fx, 0.12, fz, 9, 1, 9, '#ff8a3a', 0, 1], glow: true });
      }
      { const hx = cx + 9, hz = cz + 4.5; this.P('props', hx, 0.7, hz, 2.6, 0.12, 1.4, '#7a5a34', 0.3); this.P('props', hx, 0.95, hz, 2.4, 0.4, 1.2, '#8a6a44', 0.3); for (const s of [-1, 1]) this.P('trunks', hx + s * 0.75 * Math.sin(0.3), 0.45, hz + s * 0.75 * Math.cos(0.3), 0.9, 0.12, 0.9, '#2b2826', 0.3); for (let k = 0; k < 3; k++) this.P('shrubs', hx - 0.6 + k * 0.6, 1.25, hz, 0.4, 0.3, 0.35, pk(SACK), r2() * 6); this.box(hx - 1.4, hz - 0.9, hx + 1.4, hz + 0.9, 1.1, 'cart'); }
      // Washing strung across the row ends (high: people walk under it).
      for (const rz of rows) for (const ex of [b.x0 + 2.2, b.x1 - 2.2]) {
        if (r2() < 0.45) continue;
        const z0 = rz - 1.6, z1 = rz + 1.6;
        for (const z of [z0, z1]) this.P('props', ex, 1.3, z, 0.1, 2.6, 0.1, '#4a3a2a');
        this.P('props', ex, 2.45, rz, 0.03, 0.03, 3.2, '#d9d2b8');
        for (let k = 0; k < 3; k++) this.P('props', ex, 2.05, z0 + 0.6 + k * 1.0, 0.04, 0.75, 0.7, pk(HOLDOUT.yard.cloth));
      }
      // The cook tarp in a corner: a sagging tarp on four poles, a table and benches under it, a pot on a stove drum.
      { const tx = b.x0 + 8, tz = b.z1 - 7, tw2 = 6.4, td = 5;
        if (!this.boxes.some((q) => q.x1 > tx - 4 && q.x0 < tx + 4 && q.z1 > tz - 3 && q.z0 < tz + 3)) {
          this.P('props', tx, 2.5, tz, tw2, 0.06, td, pk(HOLDOUT.yard.tarp), 0.04);
          for (const [sx2, sz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.P('props', tx + sx2 * (tw2 / 2 - 0.2), 1.25, tz + sz2 * (td / 2 - 0.2), 0.12, 2.5, 0.12, '#4a3a2a');
          this.P('props', tx, 0.75, tz, 3.0, 0.08, 1.0, '#6a5440'); this.box(tx - 1.5, tz - 0.5, tx + 1.5, tz + 0.5, 0.8, 'table');
          for (const o of [-1, 1]) this.P('props', tx, 0.42, tz + o * 1.0, 3.0, 0.08, 0.35, '#5a4632');
          this.P('barrels', tx + 2.4, 0.45, tz + 1.4, 0.8, 0.9, 0.8, '#3a3632'); this.P('barrels', tx + 2.4, 1.0, tz + 1.4, 0.5, 0.25, 0.5, '#5a5650');
        } }
      // Tyres and scrap in the far corner, chicken crates by the fire's aisle.
      { const qx = b.x1 - 6, qz = b.z1 - 5;
        for (let k = 0; k < 7; k++) this.P('barrels', qx + (k % 3) * 0.9 - 0.9, 0.12 + Math.floor(k / 3) * 0.24, qz + (r2() - 0.5) * 0.6, 0.85, 0.22, 0.85, '#232120');
        for (let k = 0; k < 4; k++) this.P('props', qx - 3 + r2() * 2, 0.3, qz - 2 + r2() * 1.5, 0.6 + r2() * 1.0, 0.3 + r2() * 0.5, 0.5 + r2(), pk(['#5a5650', '#8a5a3a', '#6e6a62', '#7a4a2e']), r2() * 3);
        this.box(qx - 4, qz - 2.6, qx + 1.4, qz + 0.6, 0.8, 'scrap'); }
      // Ground traders in the open middle (blankets of goods, a basket or two), clear of the fire's ring and the aisles' ends.
      for (let k = 0; k < 9; k++) {
        const a = r2() * 6.283, rr = 6.5 + r2() * 4.5, gx = cx + Math.cos(a) * rr * 1.5, gz = cz + Math.sin(a) * rr * 0.62;
        if (Math.abs(gx - wx) < 5 || this.boxes.some((q) => gx > q.x0 - 1.6 && gx < q.x1 + 1.6 && gz > q.z0 - 1.6 && gz < q.z1 + 1.6)) continue;
        const rot = (r2() - 0.5) * 0.6;
        this.P('floors', gx, 0.03, gz, 2.2, 0.04, 1.6, pk(M.rugs), rot);
        for (let g = 0; g < 5; g++) this.P('props', gx + (r2() - 0.5) * 1.6, 0.12, gz + (r2() - 0.5) * 1.1, 0.35, 0.18, 0.3, pk(M.goods), r2() * 3);
        if (r2() < 0.6) this.P('barrels', gx + 1.3, 0.25, gz + 0.6, 0.6, 0.45, 0.6, pk(['#9a7a4a', '#8a6a3a']));
      }
      for (let k = 0; k < 3; k++) { const x = cx - 7 + k * 0.8, z = cz - 4.2; this.P('props', x, 0.3 + (k === 1 ? 0.6 : 0), z, 0.75, 0.6, 0.6, '#9a8a62'); this.P('props', x, 0.3 + (k === 1 ? 0.6 : 0), z, 0.78, 0.04, 0.62, '#5a4a32'); }
      blk.spot = { x: cx, z: cz };
    } else if (kind === 'garden') {
      // Raised beds in rows (soil and crops), a rain tank, a scarecrow post, a shade tarp; a chicken run.
      blk.pads.push({ x0: b.x0 + 2, x1: b.x1 - 2, z0: b.z0 + 2, z1: b.z1 - 2, band: 'yard' });
      for (let z = b.z0 + 6; z < b.z1 - 6; z += 4.2) {
        this.P('floors', cx, 0.1, z, w - 14, 0.2, 2.4, Y.soil);
        for (let x = b.x0 + 9; x < b.x1 - 9; x += 1.6) this.P('shrubs', x + rng.range(-0.2, 0.2), 0.35, z + rng.range(-0.3, 0.3), rng.range(0.45, 0.7), rng.range(0.35, 0.55), rng.range(0.45, 0.7), rng.pick(Y.crops), rng() * 6);
      }
      const tx = b.x1 - 5, tz = b.z0 + 5;
      this.P('barrels', tx, 1.2, tz, 3.0, 2.2, 3.0, rng.pick(Y.tank)); this.box(tx - 1.4, tz - 1.4, tx + 1.4, tz + 1.4, 2.4, 'tank');
      this.P('roofs', b.x0 + 6, 2.4, b.z1 - 6, 5, 0.1, 4, rng.pick(Y.tarp));
      for (const [px, pz] of [[-2.3, -1.8], [2.3, -1.8], [-2.3, 1.8], [2.3, 1.8]]) this.P('props', b.x0 + 6 + px, 1.2, b.z1 - 6 + pz, 0.12, 2.4, 0.12, Y.post);
    } else if (kind === 'arena') {
      // The pit: a ring of tyres and fence panels round packed sand, bleachers on two sides.
      blk.pads.push({ x0: b.x0 + 3, x1: b.x1 - 3, z0: b.z0 + 3, z1: b.z1 - 3, band: 'yard' });
      const r = Math.min(w, d) / 2 - 9;
      for (let a = 0; a < 6.283; a += 0.21) {
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (Math.abs(Math.sin(a)) > 0.97 && Math.cos(a) < 0) continue; // the way in
        this.P('props', x, 0.55, z, 2.4, 1.1, 0.25, rng.pick(['#5a4a3a', '#6e6a62', '#7a5a3a']), -a + Math.PI / 2);
        this.box(x - 0.7, z - 0.7, x + 0.7, z + 0.7, 1.1, 'fence');
      }
      for (const s of [-1, 1]) for (let row = 0; row < 3; row++) { const z = cz + s * (r + 3 + row * 1.2); this.P('props', cx, 0.3 + row * 0.45, z, r * 1.4, 0.3, 0.9, '#6a5440'); this.box(cx - r * 0.7, z - 0.45, cx + r * 0.7, z + 0.45, 0.4 + row * 0.45, 'bleacher'); }
    } else if (kind === 'junk') {
      // The boneyard: wrecks stacked two high, a crane boom, parts in heaps.
      blk.pads.push({ x0: b.x0 + 2, x1: b.x1 - 2, z0: b.z0 + 2, z1: b.z1 - 2, band: 'yard' });
      const W = ['#5a3a24', '#4a3020', '#6b4a2e', '#3d3a36', '#704020', '#4f5a52', '#6a5a3a'];
      for (let z = b.z0 + 7; z < b.z1 - 6; z += 7) for (let x = b.x0 + 6; x < b.x1 - 6; x += 5.2) {
        if (rng() < 0.3) continue;
        const c = rng.pick(W), stack = rng() < 0.4 ? 2 : 1;
        for (let s = 0; s < stack; s++) { this.P('props', x, 0.55 + s * 1.2, z, 1.9, 0.9, 4.2, c, rng.range(-0.15, 0.15)); this.P('props', x, 1.15 + s * 1.2, z, 1.6, 0.5, 2.0, '#2a2622'); }
        this.box(x - 1.1, z - 2.2, x + 1.1, z + 2.2, 1.4 + (stack - 1) * 1.2, 'wreck');
      }
    } else if (kind === 'tower') {
      // The water tower: four legs, a cross-braced frame, the tank (whitewashed, rust at the seams), a ladder.
      const x = cx, z = cz, H2 = 13;
      for (const [px, pz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) { this.P('props', x + px, H2 / 2, z + pz, 0.35, H2, 0.35, '#5a5650'); this.box(x + px - 0.25, z + pz - 0.25, x + px + 0.25, z + pz + 0.25, H2, 'tower'); }
      for (const y of [4, 8.5]) { this.P('props', x, y, z - 2.6, 5.4, 0.2, 0.15, '#5a5650'); this.P('props', x, y, z + 2.6, 5.4, 0.2, 0.15, '#5a5650'); }
      this.P('barrels', x, H2 + 2.6, z, 15, 4.6, 15, '#d8d2c2'); this.P('barrels', x, H2 + 5.2, z, 12, 0.7, 12, '#9a4a2e');
      this.P('props', x + 3.4, H2 / 2 + 2, z, 0.5, H2 + 4, 0.12, '#3a3632');
    } else if (kind === 'yard') {
      // The garage's yard behind it: packed dirt, cars waiting on parts, tyres, an engine on a hoist.
      const r = area ?? b;
      blk.pads.push({ x0: r.x0 + 1, x1: r.x1 - 1, z0: r.z0 + 1, z1: r.z1 - 1, band: 'lot' });
      const W = ['#56603f', '#6a2a1a', '#3f5a62', '#8a6a2a', '#4a4a48'];
      for (let x = r.x0 + 6; x < r.x1 - 6; x += 6.4) { if (rng() < 0.35) continue; const c = rng.pick(W); const z = r.z0 + 5; this.P('props', x, 0.55, z, 1.9, 0.9, 4.2, c); this.P('props', x, 1.15, z, 1.6, 0.5, 2.0, '#2a2622'); this.box(x - 1.1, z - 2.2, x + 1.1, z + 2.2, 1.4, 'wreck'); }
      for (let k = 0; k < 4; k++) { const x = r.x1 - 4 - k * 1.1, z = r.z1 - 4; this.P('barrels', x, 0.5, z, 1.4, 0.9, 1.4, '#2b2826'); }
      blk.yardSpot = { x: (r.x0 + r.x1) / 2, z: r.z1 - 8, r: 4 };
      this.parking = { x: (r.x0 + r.x1) / 2 + 4, z: (r.z0 + r.z1) / 2 + 2, h: 0 };
    }
  }

  // ---- the kerb: carts and old cars in front of the shops (each lot's own yard is fillOf's, below) --------------------
  yards(rng) {
    for (const L of this.lots) {
      const F = L.front;
      if (['house', 'bungalow', 'duplex'].includes(L.kind) || rng() >= 0.55) continue;
      const kx = F === 'N' ? { x: L.cx + rng.range(-3, 3), z: L.lot.z0 - this.row.walk - 2.4 } : F === 'S' ? { x: L.cx + rng.range(-3, 3), z: L.lot.z1 + this.row.walk + 2.4 } : null;
      if (!kx) continue;
      const cart = rng() < 0.45, c = rng.pick(cart ? ['#7a5a34', '#6b4e2e'] : ['#56603f', '#6a2a1a', '#3f5a62', '#8a6a2a', '#e0d8c0', '#4a4a48']);
      if (cart) { this.P('props', kx.x, 0.6, kx.z, 2.4, 0.5, 1.4, c); for (const s of [-1, 1]) this.P('trunks', kx.x, 0.45, kx.z + s * 0.8, 0.9, 0.12, 0.9, '#2b2826'); this.box(kx.x - 1.2, kx.z - 0.8, kx.x + 1.2, kx.z + 0.8, 1, 'cart'); }
      else { this.P('props', kx.x, 0.55, kx.z, 4.2, 0.8, 1.9, c); this.P('props', kx.x, 1.15, kx.z, 2.0, 0.6, 1.6, '#2a2622'); this.box(kx.x - 2.1, kx.z - 0.95, kx.x + 2.1, kx.z + 0.95, 1.4, 'car'); }
    }
  }

  // ---- REBUILT FROM WRECKAGE (the row's grit, docs/design/WEB_LOOK.md §3.8) ------------------------------------------
  // One lot's dressing: junk fences (back and one side), a lean-to off the back wall, a shed and an outhouse in the back
  // corners, raised beds, a chicken run, a hulk on blocks, a rain tank, a washing line, firewood, compost and scrap; a
  // side gap with room parks a hulk or stacks crates; a burnt shell gets its charred floor, beams and rubble. On a stream
  // of its own per lot, laid out the first time a chunk asks (its doors are known then, and nothing goes within doorClear
  // of one, or within 0.6 m of its walls). A pure function of the rows, the seed and the lot.
  fillOf(L) {
    if (L.fill) return L.fill;
    const G = this.row.grit, out = (L.fill = { items: [], boxes: [] });
    if (!G) return out;
    const Y = HOLDOUT.yard, rng = rngOf(hash32(this.seed, L.salt ?? 0, 0x46494c4c));
    const P = (pool, x, y, z, w, h, d, col, rot = 0, shade = 1) => out.items.push({ pool, e: [x, y, z, w, h, d, col, rot, shade] });
    const BX = (x0, z0, x1, z1, h, tag) => out.boxes.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h, tag });
    const F = L.front, ns = F === 'N' || F === 'S', sgn = F === 'N' || F === 'W' ? 1 : -1, lt = L.lot;
    // The lot's own frame: u along the street, v back from the street line (0 .. depth).
    const U0 = ns ? lt.x0 : lt.z0, U1 = ns ? lt.x1 : lt.z1, street = F === 'N' ? lt.z0 : F === 'S' ? lt.z1 : F === 'W' ? lt.x0 : lt.x1, depth = ns ? lt.z1 - lt.z0 : lt.x1 - lt.x0;
    const X = (u, v) => (ns ? u : street + sgn * v), Z = (u, v) => (ns ? street + sgn * v : u);
    const bu0 = ns ? L.x0 : L.z0, bu1 = ns ? L.x1 : L.z1, bvA = Math.abs((ns ? L.z0 : L.x0) - street), bvB = Math.abs((ns ? L.z1 : L.x1) - street);
    const bv0 = Math.min(bvA, bvB), bv1 = Math.max(bvA, bvB);
    const doors = this.geo(L).doors ?? [];
    const taken = [];
    // A footprint (u0..u1, v0..v1) is free: inside the lot, clear of the building and a walk round it, of what is placed,
    // and of every door by doorClear (dc).
    const free = (u0, v0, u1, v1, dc = Y.doorClear) => {
      if (u0 < U0 + 0.4 || u1 > U1 - 0.4 || v0 < 0.4 || v1 > depth - 0.4) return false;
      if (u1 > bu0 - 0.6 && u0 < bu1 + 0.6 && v1 > bv0 - 0.6 && v0 < bv1 + 0.6) return false;
      for (const t of taken) if (u1 > t[0] && u0 < t[2] && v1 > t[1] && v0 < t[3]) return false;
      const x0 = Math.min(X(u0, v0), X(u1, v1)), x1 = Math.max(X(u0, v0), X(u1, v1)), z0 = Math.min(Z(u0, v0), Z(u1, v1)), z1 = Math.max(Z(u0, v0), Z(u1, v1));
      for (const d of doors) if (Math.hypot(Math.max(0, x0 - d.x, d.x - x1), Math.max(0, z0 - d.z, d.z - z1)) < dc) return false;
      return true;
    };
    const take = (u0, v0, u1, v1) => taken.push([u0 - 0.5, v0 - 0.5, u1 + 0.5, v1 + 0.5]);
    // Somewhere in the back yard for a w (along u) by d (along v) footprint: a few tries, nearest the back first.
    const backV0 = bv1 + 1.4, backV1 = depth - 0.6;
    const spot = (w, d, tries = 7, dc) => {
      for (let t = 0; t < tries; t++) {
        const u = U0 + 0.8 + rng() * Math.max(0, U1 - U0 - 1.6 - w), v = backV1 - d - rng() * Math.max(0, backV1 - backV0 - d);
        if (v < backV0) return null;
        if (free(u, v, u + w, v + d, dc)) { take(u, v, u + w, v + d); return [u, v]; }
      }
      return null;
    };
    // An axis-aligned box in the lot frame: a w (u) by d (v) footprint at (u, v), h tall from y0.
    const bx = (pool, u, v, w, d, y0, h, col, shade = 1) => P(pool, X(u + w / 2, v + d / 2), y0 + h / 2, Z(u + w / 2, v + d / 2), ns ? w : d, h, ns ? d : w, col, 0, shade);
    const solid = (u, v, w, d, h, tag) => BX(X(u, v), Z(u, v), X(u + w, v + d), Z(u + w, v + d), h, tag);
    const pickC = (a) => a[Math.floor(rng() * a.length)];
    const burnt = !!L.burnt;

    // Junk fences: the back line (a back-row lot leaves it to the lot behind) and the side toward lower u; the high side too
    // when no lot of the same row meets it. Panels of whatever was found, posts at the joints; solid in runs.
    const FN = G.fence, FK = FN.kinds.map((k) => [k, k[1]]);
    const lastInRow = !this.lots.some((o) => o !== L && o.block === L.block && o.front === L.front && Math.abs((ns ? o.lot.x0 : o.lot.z0) - U1) < 0.1);
    const runs = [];
    if (!L.backRow) runs.push({ fixed: depth - 0.3, alongU: true, a0: U0 + 0.3, a1: U1 - 0.3 });
    runs.push({ fixed: U0 + 0.3, alongU: false, a0: Math.max(0.8, bv0 - 1), a1: depth - 0.3 });
    if (lastInRow) runs.push({ fixed: U1 - 0.3, alongU: false, a0: Math.max(0.8, bv0 - 1), a1: depth - 0.3 });
    for (const R of runs) {
      let a = R.a0, runA = null;
      const flush = (end) => { if (runA !== null && end - runA > 0.3) { if (R.alongU) solid(runA, R.fixed - 0.1, end - runA, 0.2, 1.5, 'fence'); else solid(R.fixed - 0.1, runA, 0.2, end - runA, 1.5, 'fence'); } runA = null; };
      while (a < R.a1 - 0.2) {
        const len = Math.min(R.a1 - a, FN.panel[0] + rng() * (FN.panel[1] - FN.panel[0])), kind = pickW(rng, FK);
        const mid = a + len / 2, u = R.alongU ? mid : R.fixed, v = R.alongU ? R.fixed : mid;
        const nearDoor = doors.some((d) => Math.hypot(X(u, v) - d.x, Z(u, v) - d.z) < 1.8 + len / 2);
        if (rng() < FN.gap * (burnt ? 4 : 1) || nearDoor) { flush(a); a += len; continue; }
        const wire = kind[0] === 'wire', h = wire ? 1.6 : kind[0] === 'door' ? 1.15 : FN.h[0] + rng() * (FN.h[1] - FN.h[0]), t = wire ? 0.05 : 0.14 + rng() * 0.08;
        const col = pickC(kind[2]), sh = 0.86 + rng() * 0.26;
        if (R.alongU) bx('props', a, R.fixed - t / 2, len, t, 0, h, col, sh); else bx('props', R.fixed - t / 2, a, t, len, 0, h, col, sh);
        if (rng() < 0.7) { const pu = R.alongU ? a : R.fixed - 0.08, pv = R.alongU ? R.fixed - 0.08 : a; bx('props', pu, pv, 0.16, 0.16, 0, Math.min(2.1, h + 0.25), '#4a3a2a'); }
        if (runA === null) runA = a;
        a += len;
      }
      flush(a);
    }

    // A burnt shell: its floor charred black, fallen beams across it, rubble heaped in the corners.
    if (burnt) {
      const B = G.burnt, w = L.x1 - L.x0, d = L.z1 - L.z0;
      P('floors', L.cx, 0.13, L.cz, w - 0.9, 0.03, d - 0.9, B.floor);
      for (let k = 0, n = 2 + Math.floor(rng() * 3); k < n; k++) P('props', L.cx + (rng() - 0.5) * w * 0.5, 0.25 + k * 0.12, L.cz + (rng() - 0.5) * d * 0.5, 0.26, 0.24, Math.min(w, d) * (0.6 + rng() * 0.4), pickC(B.char), rng() * 3.1416);
      for (let k = 0; k < 4; k++) P('boulders', L.cx + (rng() - 0.5) * (w - 2.4), 0.25, L.cz + (rng() - 0.5) * (d - 2.4), 0.9 + rng() * 0.9, 0.35 + rng() * 0.3, 0.9 + rng() * 0.9, pickC(B.rubble), rng() * 6);
    }

    // The back yard: what a family that rebuilt from wreckage keeps behind the house.
    const BK = G.back, tin = G.tin;
    if (backV1 - backV0 > 2.6) {
      // A lean-to off the back wall: two posts out from the wall, a sheet over them (the door under it stays clear: posts only).
      if (!burnt && rng() < BK.leanto) {
        const w = Math.min(bu1 - bu0 - 1, 3.4 + rng() * 2.2), dd = 2.2 + rng() * 0.8, u = bu0 + 0.5 + rng() * Math.max(0, bu1 - bu0 - 1 - w), v = bv1;
        if (w > 2.4 && free(u, v + dd - 0.3, u + w, v + dd, 1.2)) {
          taken.push([u, v - 0.5, u + w + 0.5, v + dd + 0.5]);
          bx('props', u, v, w, dd, 2.25, 0.07, pickC(tin), 0.9 + rng() * 0.2);
          for (const pu of [u + 0.1, u + w - 0.25]) bx('props', pu, v + dd - 0.25, 0.14, 0.14, 0, 2.25, '#4a3a2a');
          if (rng() < 0.6) bx('props', u + 0.4, v + dd - 1.0, Math.min(w - 0.8, 2.2), 0.7, 0, 0.75, '#7a5a34'); // firewood or a bench under it
        }
      }
      // A back house: a shack knocked up from salvage at the back of a deep lot (kin taken in, a workshop, a rented room).
      // Solid, not walk-in; a real roof from above, so the block reads built-up, not lawns.
      for (let q = 0; q < 2; q++) {
        if (burnt || backV1 - backV0 <= 9 || rng() >= BK.shack * (q ? 0.5 : 1)) break;
        const w = 3.6 + rng() * 2.2, d = 3.2 + rng() * 1.6, h = 2.4 + rng() * 0.5, at = spot(w, d, 6, 3.0);
        if (at) { const [u, v] = at; bx('walls', u, v, w, d, 0, h, pickC(G.shack)); bx('roofs', u - 0.25, v - 0.25, w + 0.5, d + 0.5, h, 0.18, pickC(['#8e938c', '#7d827c', '#8a5a3a', '#6f7a74'])); solid(u, v, w, d, h, 'shack'); }
      }
      // A shed in a back corner (block walls, a tin roof): solid.
      if (rng() < BK.shed * (burnt ? 0.5 : 1)) {
        const w = 2.2 + rng() * 1.2, d = 1.8 + rng() * 0.8, at = spot(w, d);
        if (at) { const [u, v] = at; bx('walls', u, v, w, d, 0, 2.1, pickC(['#8a8478', '#a09a8c', '#7a6a52', '#9c8462'])); bx('props', u - 0.15, v - 0.15, w + 0.3, d + 0.3, 2.1, 0.08, pickC(tin)); solid(u, v, w, d, 2.1, 'shed'); }
      }
      if (!burnt && rng() < BK.outhouse) {
        const at = spot(1.3, 1.3);
        if (at) { const [u, v] = at; bx('walls', u, v, 1.3, 1.3, 0, 2.2, pickC(['#7a5e3e', '#8a6a44', '#6b5236'])); bx('props', u - 0.1, v - 0.1, 1.5, 1.5, 2.2, 0.06, pickC(tin)); solid(u, v, 1.3, 1.3, 2.2, 'shed'); }
      }
      // Raised beds in rows: soil and crops.
      if (!burnt && rng() < BK.garden) for (let k = 0, n = 3 + Math.floor(rng() * 3); k < n; k++) {
        const w = 3.6 + rng() * 2.4, d = 1.1, at = spot(w, d, 5, 2.5);
        if (!at) break;
        const [u, v] = at; bx('floors', u, v, w, d, 0, 0.22, Y.soil);
        for (let q = 0.5; q < w - 0.3; q += 0.75) { const cu = u + q, cv = v + 0.55; P('shrubs', X(cu, cv), 0.32, Z(cu, cv), 0.42, 0.36, 0.42, pickC(Y.crops), rng() * 6); }
      }
      // A chicken run: a coop and a wire run, birds in it.
      if (!burnt && rng() < BK.coop) {
        const at = spot(3.2, 2.2);
        if (at) {
          const [u, v] = at; bx('walls', u, v, 1.4, 1.2, 0, 1.2, '#7a5e3e'); bx('props', u - 0.1, v - 0.1, 1.6, 1.4, 1.2, 0.06, pickC(tin));
          bx('props', u + 1.4, v, 1.8, 0.04, 0, 1.0, '#9a9a92'); bx('props', u + 1.4, v + 2.16, 1.8, 0.04, 0, 1.0, '#9a9a92'); bx('props', u + 3.16, v, 0.04, 2.2, 0, 1.0, '#9a9a92');
          for (let q = 0; q < 4; q++) bx('props', u + 1.7 + rng() * 1.2, v + 0.3 + rng() * 1.5, 0.3, 0.3, 0, 0.3, rng() < 0.7 ? '#e8e2d2' : '#9a5a2a');
          solid(u, v, 3.2, 2.2, 1.2, 'coop');
        }
      }
      // A hulk on blocks: the car that brought them, or the one they strip for parts.
      if (rng() < BK.hulk * (burnt ? 1.6 : 1)) {
        const along = rng() < 0.5, w = along ? 4.2 : 1.9, d = along ? 1.9 : 4.2, at = spot(w, d);
        if (at) {
          const [u, v] = at, c = pickC(G.hulk), cw = along ? 2.0 : 1.6, cd = along ? 1.6 : 2.0;
          bx('props', u, v, w, d, 0.3, 0.75, c, 0.85 + rng() * 0.2); bx('props', u + (w - cw) / 2, v + (d - cd) / 2, cw, cd, 1.05, 0.5, burnt ? '#2a2622' : '#3a3632');
          if (rng() < 0.5) bx('props', u + (along ? 0.3 : 0.2), v + (along ? 0.2 : 0.3), along ? 1.0 : 1.5, along ? 1.5 : 1.0, 1.06, 0.04, pickC(tin)); // a tarp over the engine bay
          solid(u, v, w, d, 1.5, 'wreck');
        }
      }
      if (!burnt && rng() < BK.tank) { const r = 1.0 + rng() * 0.3, at = spot(r * 2.2, r * 2.2); if (at) { const [u, v] = at; P('barrels', X(u + r * 1.1, v + r * 1.1), 1.0, Z(u + r * 1.1, v + r * 1.1), r * 2.2, 1.9, r * 2.2, pickC(Y.tank)); solid(u, v, r * 2.2, r * 2.2, 2.0, 'tank'); } }
      if (!burnt && rng() < BK.washing) {
        const len = 4 + rng() * 2, at = spot(len, 0.6, 5, 2.0);
        if (at) {
          const [u, v] = at, cv = v + 0.3;
          for (const pu of [u, u + len]) P('props', X(pu, cv), 0.9, Z(pu, cv), 0.1, 1.8, 0.1, Y.post);
          bx('props', u, cv - 0.015, len, 0.03, 1.74, 0.03, '#d9d2b8');
          for (let k = 0; k < 5; k++) bx('props', u + 0.4 + k * (len - 1.2) / 4, cv - 0.02, 0.7 + rng() * 0.3, 0.04, 1.0, 0.75, pickC(Y.cloth));
        }
      }
      if (rng() < BK.firewood) { const at = spot(1.8, 0.9, 5, 2.0); if (at) { const [u, v] = at; bx('props', u, v, 1.8, 0.9, 0, 0.7, '#6b4e2e'); bx('props', u + 0.05, v + 0.05, 1.7, 0.8, 0.7, 0.04, '#a08058'); } }
      if (rng() < BK.compost) { const at = spot(1.6, 1.6, 5, 2.0); if (at) { const [u, v] = at; P('boulders', X(u + 0.8, v + 0.8), 0.2, Z(u + 0.8, v + 0.8), 1.5, 0.6, 1.5, burnt ? '#3a3632' : '#4a3a28', rng() * 6); } }
      if (rng() < BK.scrap * (burnt ? 1.5 : 1)) {
        const at = spot(2.6, 2.0, 5, 2.0);
        if (at) {
          const [u, v] = at;
          for (let k = 0; k < 4; k++) bx('props', u + rng() * 1.6, v + rng() * 1.2, 0.5 + rng() * 0.9, 0.4 + rng() * 0.8, 0, 0.3 + rng() * 0.6, pickC(['#7a5a34', '#5a5650', '#8a5a3a', '#6e6a62', '#3f5a62']), 0.9 + rng() * 0.2);
          P('barrels', X(u + 2.2, v + 1.5), 0.55, Z(u + 2.2, v + 1.5), 1, 1, 1, pickC(['#5a2e1a', '#3f5a62', '#6a6a5a', '#7a4a2e']));
          solid(u, v, 2.6, 2.0, 1.0, 'scrap');
        }
      }
    }
    // A side gap with room: a hulk parked along the house, or crates and drums against the fence.
    for (const side of [-1, 1]) {
      const g0 = side < 0 ? U0 + 0.5 : bu1 + 2.2, g1 = side < 0 ? bu0 - 2.2 : U1 - 0.5, room = g1 - g0;
      if (room < 1.4 || rng() >= G.side) continue;
      if (room >= 2.1 && bv1 - bv0 > 4.5 && rng() < 0.5) {
        const u = side < 0 ? g1 - 1.9 : g0, v = bv0 + 0.4 + rng() * Math.max(0, bv1 - bv0 - 4.6);
        if (free(u, v, u + 1.9, v + 4.2, 2.2)) { take(u, v, u + 1.9, v + 4.2); const c = pickC(G.hulk); bx('props', u, v, 1.9, 4.2, 0.3, 0.75, c); bx('props', u + 0.15, v + 1.1, 1.6, 2.0, 1.05, 0.5, '#3a3632'); solid(u, v, 1.9, 4.2, 1.5, 'wreck'); }
      } else {
        const u = side < 0 ? g0 : g1 - 1.4, v = bv0 + rng() * Math.max(0, bv1 - bv0 - 2);
        if (free(u, v, u + 1.4, v + 2, 2.2)) {
          take(u, v, u + 1.4, v + 2);
          for (let k = 0; k < 3; k++) bx('props', u + rng() * 0.6, v + k * 0.65, 0.8, 0.6, 0, 0.5 + rng() * 0.4, pickC(['#7a5a34', '#6b4e2e', '#8a6a44']), 0.9 + rng() * 0.2);
          solid(u, v, 1.4, 2, 1.0, 'crates');
        }
      }
    }
    return out;
  }

  // ---- the wall, the towers, the gates ------------------------------------------------------------------------------
  gatesAndWall(rng) {
    const H = this.row, Wl = H.wall, hw = this.hw, hd = this.hd, t = Wl.t, G = Wl.gate;
    const gates = H.gates.map((g) => ({ ...g }));
    // Sides as runs along u; gaps where gates are.
    const sides = [
      { side: 'N', fixed: -hd + t / 2, horiz: true }, { side: 'S', fixed: hd - t / 2, horiz: true },
      { side: 'W', fixed: -hw + t / 2, horiz: false }, { side: 'E', fixed: hw - t / 2, horiz: false },
    ];
    for (const S of sides) {
      const len = S.horiz ? 2 * hw : 2 * hd, a0 = -len / 2, a1 = len / 2;
      const gaps = gates.filter((g) => g.side === S.side).map((g) => [g.at - G / 2, g.at + G / 2]);
      let a = a0;
      const runs = [];
      for (const [g0, g1] of gaps.sort((p, q) => p[0] - q[0])) { if (g0 > a) runs.push([a, g0]); a = g1; }
      if (a < a1) runs.push([a, a1]);
      for (const [r0, r1] of runs) {
        // Panels of corrugated tin and timber, a little uneven; a rail along the top; posts at every panel joint.
        for (let p = r0; p < r1 - 0.01; p += Wl.panel) {
          const q = Math.min(r1, p + Wl.panel), mid = (p + q) / 2, h = Wl.h * rng.range(0.92, 1.06), col = rng.pick(Wl.colors);
          const [x, z] = S.horiz ? [this.X(mid), this.Z(S.fixed)] : [this.X(S.fixed), this.Z(mid)];
          const sx = S.horiz ? q - p : t, sz = S.horiz ? t : q - p;
          this.P('walls', x, h / 2, z, sx, h, sz, col);
          const [px, pz] = S.horiz ? [this.X(p), this.Z(S.fixed)] : [this.X(S.fixed), this.Z(p)];
          this.P('props', px, (Wl.h + 0.5) / 2, pz, 0.32, Wl.h + 0.5, 0.32, Wl.post);
          // Junk banked against the outside: a car body, drums, pallets (looks only).
          if (rng() < Wl.junk) {
            const o = (S.side === 'N' || S.side === 'W' ? -1 : 1) * (t / 2 + 1.1), jx = S.horiz ? x + rng.range(-1.5, 1.5) : x + o, jz = S.horiz ? z + o : z + rng.range(-1.5, 1.5);
            this.P('props', jx, 0.5, jz, S.horiz ? 3.6 : 1.7, 1.0, S.horiz ? 1.7 : 3.6, rng.pick(['#5a3a24', '#4a3020', '#6b4a2e', '#3d3a36']), 0);
          }
        }
        const am = (r0 + r1) / 2, al = r1 - r0;
        const [x, z] = S.horiz ? [this.X(am), this.Z(S.fixed)] : [this.X(S.fixed), this.Z(am)];
        this.P('props', x, Wl.h + 0.12, z, S.horiz ? al : t + 0.2, 0.24, S.horiz ? t + 0.2 : al, Wl.cap);
        // Collision: the run, as one box (a wall a person cannot climb; rounds do not pass).
        const bx0 = S.horiz ? this.X(r0) : this.X(S.fixed - t / 2), bx1 = S.horiz ? this.X(r1) : this.X(S.fixed + t / 2);
        const bz0 = S.horiz ? this.Z(S.fixed - t / 2) : this.Z(r0), bz1 = S.horiz ? this.Z(S.fixed + t / 2) : this.Z(r1);
        this.box(bx0, bz0, bx1, bz1, Wl.h, 'wall');
      }
    }
    // Towers at the corners and beside every gate: a deck on posts with a rail and a tin roof (a deputy stands up there).
    const T = Wl.tower;
    const tower = (lx, lz) => {
      const x = this.X(lx), z = this.Z(lz), s = T.size;
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.P('props', x + px * (s / 2 - 0.2), T.h / 2, z + pz * (s / 2 - 0.2), 0.3, T.h, 0.3, Wl.post);
      this.P('props', x, T.h - 2.4, z, s, 0.25, s, '#6a5440');
      for (const sgn of [-1, 1]) { this.P('props', x, T.h - 1.6, z + sgn * (s / 2 - 0.1), s, 0.7, 0.12, '#7a6a52'); this.P('props', x + sgn * (s / 2 - 0.1), T.h - 1.6, z, 0.12, 0.7, s, '#7a6a52'); }
      this.P('roofs', x, T.h + 0.2, z, s + 1, 0.2, s + 1, T.roof);
      this.box(x - s / 2, z - s / 2, x + s / 2, z + s / 2, 2.6, 'tower');
    };
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tower(sx * (hw - T.size / 2), sz * (hd - T.size / 2));
    for (const g of gates) {
      const o = G / 2 + T.size / 2 + 0.4;
      const horiz = g.side === 'N' || g.side === 'S', fixed = g.side === 'N' ? -hd + t / 2 : g.side === 'S' ? hd - t / 2 : g.side === 'W' ? -hw + t / 2 : hw - t / 2;
      for (const s of [-1, 1]) tower(horiz ? g.at + s * o : fixed + (g.side === 'W' ? T.size / 2 : -T.size / 2), horiz ? fixed + (g.side === 'N' ? T.size / 2 : -T.size / 2) : g.at + s * o);
      // The header beam over the gap and the name board on it; a swing gate pulled open against the wall.
      const [hx, hz] = horiz ? [this.X(g.at), this.Z(fixed)] : [this.X(fixed), this.Z(g.at)];
      this.P('props', hx, 5.2, hz, horiz ? G + 2 : 0.5, 0.5, horiz ? 0.5 : G + 2, '#4a3a2a');
      const inward = g.side === 'W' ? [1, 0] : g.side === 'E' ? [-1, 0] : g.side === 'N' ? [0, 1] : [0, -1];
      g.inX = hx + inward[0] * 7; g.inZ = hz + inward[1] * 7; g.outX = hx - inward[0] * 9; g.outZ = hz - inward[1] * 9; g.x = hx; g.z = hz;
      g.boardX = hx - inward[0] * 0.6; g.boardZ = hz - inward[1] * 0.6; g.face = Math.atan2(-inward[0], -inward[1]);
      this.gates.push(g);
    }
  }

  // ---- outside the wall: the approach from the interstate, the road to the lagoon and its pier --------------------------
  outside(rng) {
    const H = this.row;
    this.outPads = [];
    const ap = { x0: this.approach.x - 2, x1: this.x0 + 1, z0: this.cz - 8, z1: this.cz + 8, band: 'street', axis: 'x' };
    this.streetList.push({ x0: ap.x0, x1: ap.x1, z0: ap.z0, z1: ap.z1, axis: 'x', line: `${this.id}:approach`, name: 'MAIN STREET', art: true });
    this.outPads.push(ap);
    const D = H.dock;
    if (D && Number.isFinite(this.shore)) {
      // The lagoon road: out of the east gate to the shore, then the pier.
      const road = { x0: this.x1 - 1, x1: this.shore + 2, z0: this.cz - 4.5, z1: this.cz + 4.5, band: 'street', axis: 'x' };
      this.outPads.push(road);
      this.streetList.push({ x0: road.x0, x1: road.x1, z0: road.z0, z1: road.z1, axis: 'x', line: `${this.id}:landing`, name: 'LANDING ROAD', art: false });
      const x0 = this.shore - 4, x1 = this.shore + D.len, z0 = this.cz - D.w / 2, z1 = this.cz + D.w / 2;
      this.pier = { x0, x1, z0, z1 };
      this.dockEnd = x1;
      this.P('props', (x0 + x1) / 2, 0.42, this.cz, x1 - x0, 0.18, D.w, '#6a4a30');
      for (let x = x0 + 2; x < x1; x += 4) for (const s of [-1, 1]) this.P('trunks', x, 0.2, this.cz + s * (D.w / 2 - 0.1), 0.6, 1.4, 0.6, '#4a3626');
      // A boathouse shack and nets drying at the shore.
      const sx = this.shore - 22, sz = this.cz + 14;
      this.P('walls', sx, 1.5, sz, 7, 3, 5, '#7a6a52'); this.P('roofs', sx, 3.15, sz, 7.8, 0.25, 5.8, '#7d827c'); this.box(sx - 3.5, sz - 2.5, sx + 3.5, sz + 2.5, 3, 'shack');
      for (let k = 0; k < 3; k++) this.P('props', sx - 3 + k * 3, 1.0, sz - 6, 2.4, 1.6, 0.06, '#8a8a6a');
      this.boats = D.boats.map(([type, paint], i) => ({ type, paint, x: x1 - 6 - i * 11, z: this.cz + (i % 2 ? -1 : 1) * (D.w / 2 + 3.2), h: Math.PI / 2 }));
    }
  }

  // Sabal palms down Main Street and live oaks in the market (a holdout keeps its shade alive).
  trees(rng) {
    const T = this.row.trees, main = this.streetList.find((s) => s.name === 'MAIN STREET' && s.axis === 'x' && s.line !== `${this.id}:approach`);
    if (main) for (let x = main.x0 + 14; x < main.x1 - 14; x += T.every) for (const side of [-1, 1]) {
      const z = side < 0 ? main.z0 - this.row.walk + 0.8 : main.z1 + this.row.walk - 0.8;
      if (this.lots.some((L) => x > L.x0 - 2 && x < L.x1 + 2 && Math.abs(z - (side < 0 ? L.z1 : L.z0)) < 2.5)) continue;
      if (Math.abs(x - this.X(46)) < 10 || Math.abs(x - this.X(124)) < 10 || Math.abs(x - this.X(-104)) < 10) continue; // corners stay clear
      this.flora.push([rng.pick(T.street), x, z, rng.range(7.5, 10), rng.int(0, 2)]);
    }
    const mk = this.blocks.find((b) => b.open === 'market');
    // The square's shade trees, right-sized (a 9 m oak filled the frame at street level): the draws are kept (nothing after
    // them moves), two of the four corners are planted.
    if (mk) for (const [fx, fz] of [[0.18, 0.2], [0.82, 0.2], [0.18, 0.8], [0.82, 0.8]]) { const kind = rng.pick(T.square), h0 = rng.range(7, 9), v = rng.int(0, 2), H = T.squareH ?? [7, 9]; if (fx * fz < 0.1 || fx * fz > 0.3) continue; /* the two off-diagonal corners */ this.flora.push([kind, mk.x0 + (mk.x1 - mk.x0) * fx, mk.z0 + (mk.z1 - mk.z0) * fz, H[0] + (H[1] - H[0]) * ((h0 - 7) / 2), v]); }
  }

  // Street lamps (salvaged poles with a lamp: pools of light at night) along Main Street and the avenues.
  lamps(rng) {
    let n = 0;
    for (const s of this.streetList) {
      if (s.line.endsWith('approach')) continue;
      const along = s.axis === 'x', a0 = along ? s.x0 : s.z0, a1 = along ? s.x1 : s.z1, step = 34;
      for (let a = a0 + 12; a < a1 - 8 && n < this.row.lamps; a += step) {
        const side = (Math.round(a / step) % 2) ? 1 : -1, x = along ? a : (side > 0 ? s.x1 + 1.2 : s.x0 - 1.2), z = along ? (side > 0 ? s.z1 + 1.2 : s.z0 - 1.2) : a;
        if (this.lots.some((L) => x > L.x0 - 1 && x < L.x1 + 1 && z > L.z0 - 1 && z < L.z1 + 1)) continue;
        this.P('props', x, 2.6, z, 0.18, 5.2, 0.18, '#3a3632'); this.P('props', x, 5.2, z, 0.6, 0.25, 0.4, '#d8c890');
        this.box(x - 0.15, z - 0.15, x + 0.15, z + 0.15, 5.2, 'lamp');
        this.items.push({ pool: 'glows', e: [x, 0.11, z, 13, 1, 13, '#ffd08a', 0, 1], glow: true });
        n++;
      }
    }
  }

  // The name boards over the gates go in the region's sign atlas (world/signs.js) with every road sign's face.
  signs() {
    this.signList = this.gates.map((g) => ({ id: `${this.id}:gate:${g.side}`, x: g.boardX, z: g.boardZ, y: 0, h: g.face, w: 9, hgt: 2.6, style: 'town', lines: [this.name, g.name], region: this.R.id, lift: 4.2, holdout: this.id }));
  }

  // ---- what chunks ask ------------------------------------------------------------------------------------------------
  // Street rects reaching into the rectangle, open0/open1 where they run on past its edges (the seam signature).
  streets(x0, z0, x1, z1) {
    const out = [];
    for (const s of this.streetList) {
      if (s.x1 < x0 - 12 || s.x0 > x1 + 12 || s.z1 < z0 - 12 || s.z0 > z1 + 12) continue;
      const a0 = s.axis === 'x' ? s.x0 : s.z0, a1 = s.axis === 'x' ? s.x1 : s.z1, q0 = s.axis === 'x' ? x0 : z0, q1 = s.axis === 'x' ? x1 : z1;
      out.push({ ...s, open0: a0 < q0, open1: a1 > q1 });
    }
    return out;
  }
  blocksOver(x0, z0, x1, z1, fn) { for (const b of this.blocks) if (b.x1 > x0 && b.x0 < x1 && b.z1 > z0 && b.z0 < z1) fn(b); }
  pads(b) { return b.pads ?? []; }
  owned(cx, cz) {
    const ox = cx * C, oz = cz * C, key = `${cx},${cz}`;
    const o = this.lots.filter((L) => L.cx >= ox && L.cx < ox + C && L.cz >= oz && L.cz < oz + C);
    for (const L of o) L.owner = key;
    return o;
  }
  around(cx, cz, m = 4) {
    const ox = cx * C, oz = cz * C, X1 = ox + C, Z1 = oz + C, mine = this.owned(cx, cz), near = [];
    for (const L of this.lots) {
      if (mine.includes(L)) continue;
      if (L.lot.x1 > ox - m && L.lot.x0 < X1 + m && L.lot.z1 > oz - m && L.lot.z0 < Z1 + m) { L.owner ??= `${chunkOf(L.cx)},${chunkOf(L.cz)}`; near.push(L); }
    }
    return { mine, near };
  }
  geo(L) { return this.W.ring.geo(L); }
  wrecks() { return []; }
  railIn() { return null; }
  lotById(id) { return this.lots.find((L) => L.id === id) ?? null; }
  lotOf(kind) { return this.lots.find((L) => L.kind === kind) ?? null; }
  // Extras owned by chunk (cx, cz) (their centre in it), and every collision box that reaches into it.
  extras(cx, cz) {
    const ox = cx * C, oz = cz * C, X1 = ox + C, Z1 = oz + C, own = (x, z) => x >= ox && x < X1 && z >= oz && z < Z1;
    const items = this.items.filter((it) => own(it.e[0], it.e[2])), boxes = this.boxes.filter((b) => b.x1 > ox - 3 && b.x0 < X1 + 3 && b.z1 > oz - 3 && b.z0 < Z1 + 3);
    // Each lot's own dressing (fillOf), for the lots that reach in.
    for (const L of this.lots) {
      if (L.lot.x1 < ox - 3 || L.lot.x0 > X1 + 3 || L.lot.z1 < oz - 3 || L.lot.z0 > Z1 + 3) continue;
      const f = this.fillOf(L);
      for (const it of f.items) if (own(it.e[0], it.e[2])) items.push(it);
      for (const q of f.boxes) if (q.x1 > ox - 3 && q.x0 < X1 + 3 && q.z1 > oz - 3 && q.z0 < Z1 + 3) boxes.push(q);
    }
    return { items, flora: this.flora.filter((f) => own(f[1], f[2])), boxes };
  }
  // The HUD street sign inside the wall.
  nameAt(x, z) {
    if (!this.inCity(x, z, 40) && !this.solid(x, z)) return null;
    const on = this.streetList.find((s) => x > s.x0 - 1 && x < s.x1 + 1 && z > s.z0 - 1 && z < s.z1 + 1);
    if (on) return `${this.name} · ${on.name}`;
    const g = this.gates.find((q) => Math.hypot(x - q.x, z - q.z) < 14);
    if (g) return `${this.name} · ${g.name}`;
    if (this.pier && x > this.x1) return `${this.name} · THE LANDING`;
    const L = this.lots.find((q) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1);
    if (L) return `${this.name} · ${L.programme}`;
    const b = this.blocks.find((q) => q.name && x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1);
    return b ? `${this.name} · ${b.name}` : this.inCity(x, z) ? this.name : `OUTSIDE ${this.name}`;
  }
  // What `meridian` reports (systems/regions.js adds the people).
  view() {
    return { id: this.id, name: this.name, centre: [this.cx, this.cz], wall: { x0: this.x0, z0: this.z0, x1: this.x1, z1: this.z1 }, gates: this.gates.map((g) => ({ side: g.side, name: g.name, x: +g.x.toFixed(1), z: +g.z.toFixed(1) })),
      exit: this.exit ? { id: this.exit.id, number: this.exit.number, x: +this.exit.x.toFixed(1), z: +this.exit.z.toFixed(1) } : null,
      buildings: this.lots.map((L) => ({ id: L.id, kind: L.kind, programme: L.programme, x: +L.cx.toFixed(1), z: +L.cz.toFixed(1), front: L.front })),
      open: this.blocks.filter((b) => b.open).map((b) => ({ id: b.id, open: b.open, name: b.name })), pier: this.pier ?? null, shore: Number.isFinite(this.shore) ? +this.shore.toFixed(1) : null };
  }
}

export { RING, pickW };
