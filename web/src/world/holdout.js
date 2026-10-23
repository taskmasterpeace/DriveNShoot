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
      if (B.lots) used = this.packLots(blk, B, rng, () => `${this.id}.${k++}`);
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
  packLots(blk, B, rng, nextId) {
    const list = [];
    for (const it of B.lots) { if (Array.isArray(it)) for (let i = 0; i < it[1]; i++) list.push(it[0]); else list.push(it); }
    const F = B.front, ns = F === 'N' || F === 'S', u0 = ns ? blk.x0 : blk.z0, u1 = ns ? blk.x1 : blk.z1, depth = ns ? blk.z1 - blk.z0 : blk.x1 - blk.x0;
    const half = B.open ? depth * 0.55 : depth;
    const set = 3.5, gapMin = 3.2;
    const sizes = list.map((kind) => { const K = KINDS[kind]; const w = rng.range(K.w[0], K.w[1]), d = Math.min(rng.range(K.d[0], K.d[1]), half - set - 2); return { kind, w, d }; });
    while (sizes.length && sizes.reduce((s, q) => s + q.w, 0) + gapMin * (sizes.length + 1) > u1 - u0) sizes.pop();
    const free = u1 - u0 - sizes.reduce((s, q) => s + q.w, 0), gap = free / (sizes.length + 1);
    let u = u0 + gap;
    const frontEdge = F === 'N' ? blk.z0 : F === 'S' ? blk.z1 : F === 'W' ? blk.x0 : blk.x1, sgn = F === 'N' || F === 'W' ? 1 : -1;
    for (let i = 0; i < sizes.length; i++) {
      const q = sizes[i], a0 = u, a1 = u + q.w, v0 = frontEdge + sgn * set, v1 = v0 + sgn * q.d;
      const lotA0 = i === 0 ? u0 : u - gap / 2, lotA1 = i === sizes.length - 1 ? u1 : a1 + gap / 2, lv0 = frontEdge, lv1 = frontEdge + sgn * half;
      const r = ns ? { x0: a0, x1: a1, z0: Math.min(v0, v1), z1: Math.max(v0, v1) } : { z0: a0, z1: a1, x0: Math.min(v0, v1), x1: Math.max(v0, v1) };
      const lot = ns ? { x0: lotA0, x1: lotA1, z0: Math.min(lv0, lv1), z1: Math.max(lv0, lv1) } : { z0: lotA0, z1: lotA1, x0: Math.min(lv0, lv1), x1: Math.max(lv0, lv1) };
      // Doorways sit on whole-metre cells: round the shell to the metre grid (chunk origins are whole metres).
      for (const k of ['x0', 'x1', 'z0', 'z1']) r[k] = Math.round(r[k] * 2) / 2;
      const L = { id: nextId(), kind: q.kind, zone: 'holdout', front: F, ...r, lot, cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2, seed: rng.int(0, 2147483647), ruined: false, noYard: true,
        holdout: this.id, block: blk.id, programme: KINDS[q.kind].label ?? q.kind.toUpperCase(), blockKey: blk.id };
      blk.lots.push(L); this.lots.push(L);
      u = a1 + gap;
    }
    // What the lots leave of the block (the open half behind them, for a yard or a tower).
    if (!B.open || !sizes.length) return null;
    const back = F === 'N' ? { x0: blk.x0, x1: blk.x1, z0: blk.z0 + half + 1, z1: blk.z1 } : F === 'S' ? { x0: blk.x0, x1: blk.x1, z0: blk.z0, z1: blk.z1 - half - 1 } : null;
    return back;
  }

  // ---- open lots: data/holdout.js rows, Florida-dressed ----------------------------------------------------------------
  P(pool, x, y, z, w, h, d, col, rot = 0, shade = 1) { this.items.push({ pool, e: [x, y, z, w, h, d, col, rot, shade] }); }
  box(x0, z0, x1, z1, h, tag) { this.boxes.push({ x0, z0, x1, z1, h, tag }); }
  openLot(blk, kind, area, rng) {
    const b = area ?? blk, M = HOLDOUT.market, Y = HOLDOUT.yard, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, w = b.x1 - b.x0, d = b.z1 - b.z0;
    if (kind === 'market') {
      // A paved square: stall rows round a fire, canvas awnings, rugs and goods (data/holdout.js market), a well.
      blk.pads.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, band: 'lot' });
      const rows = [cz - M.aisle - 6, cz + M.aisle + 6];
      for (const rz of rows) for (let sx = b.x0 + 7; sx < b.x1 - 6; sx += 7.2) {
        if (rng() > M.fill) continue;
        const aw = rng.pick(M.awnings), across = rz < cz ? 1 : -1;
        this.P('roofs', sx, 2.6, rz, 4.6, 0.12, 3.6, aw, 0, 1);                           // the awning
        for (const px of [-2.1, 2.1]) for (const pz of [-1.6, 1.6]) this.P('props', sx + px, 1.3, rz + pz, 0.12, 2.6, 0.12, '#5a4632');
        this.P('props', sx, 0.5, rz + across * 1.2, 3.8, 1.0, 0.8, rng.pick(M.counter));   // the counter
        for (let g = 0; g < 4; g++) this.P('props', sx - 1.4 + g * 0.95, 1.08, rz + across * 1.2, 0.5, 0.18, 0.4, rng.pick(M.goods));
        this.P('floors', sx, 0.03, rz - across * 0.4, 3.4, 0.04, 2.0, rng.pick(M.rugs));
        this.box(sx - 1.9, rz + across * 1.2 - 0.4, sx + 1.9, rz + across * 1.2 + 0.4, 1.0, 'stall');
      }
      // The fire in the middle (a ring of stones, a barrel) and the well.
      this.P('barrels', cx, 0.55, cz, 1.1, 1, 1.1, '#5a2e1a'); this.box(cx - 0.6, cz - 0.6, cx + 0.6, cz + 0.6, 1.1, 'barrel');
      this.items.push({ pool: 'glows', e: [cx, 0.12, cz, 16, 1, 16, '#ff8a3a', 0, 1], glow: true });
      for (let a = 0; a < 6.28; a += 0.8) this.P('boulders', cx + Math.cos(a) * 1.6, 0.2, cz + Math.sin(a) * 1.6, 0.4, 0.3, 0.4, '#7e7466', a);
      const wx = b.x1 - 9, wz = cz;
      this.P('barrels', wx, 0.45, wz, 3.2, 0.82, 3.2, '#8a8478'); this.P('props', wx, 2.0, wz, 3.6, 0.15, 0.3, '#4a3a2a'); this.box(wx - 1.6, wz - 1.6, wx + 1.6, wz + 1.6, 0.9, 'well');
      for (const px of [-1.6, 1.6]) this.P('props', wx + px, 1.0, wz, 0.15, 2.0, 0.15, '#4a3a2a');
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

  // ---- the holdout fill (data/holdout.js yard rows, as Rust Haven's): a town that has lived through the fall grows food,
  // stores rain and dries its washing behind every building; picket fences round the houses; carts and cars at the kerb.
  yards(rng) {
    const Y = HOLDOUT.yard, M = HOLDOUT.market;
    const kinds = Y.kinds.concat([['junk', 2]]);
    for (const L of this.lots) {
      const F = L.front, ns = F === 'N' || F === 'S', sgn = F === 'N' || F === 'W' ? 1 : -1;
      // The back yard: from the building's back wall to the lot's back line, the lot's width.
      const bFace = F === 'N' ? L.z1 : F === 'S' ? L.z0 : F === 'W' ? L.x1 : L.x0, lBack = F === 'N' ? L.lot.z1 : F === 'S' ? L.lot.z0 : F === 'W' ? L.lot.x1 : L.lot.x0;
      const depth = Math.abs(lBack - bFace) - Y.margin * 2, u0 = (ns ? L.lot.x0 : L.lot.z0) + Y.margin, u1 = (ns ? L.lot.x1 : L.lot.z1) - Y.margin;
      const at = (u, v) => (ns ? { x: u, z: bFace + sgn * v } : { x: bFace + sgn * v, z: u }); // v metres back from the building
      if (depth > 4.5) {
        for (let u = u0 + 1; u < u1 - 4; u += rng.range(6.5, 10)) {
          if (rng() < 0.22) continue;
          const kind = pickW(rng, kinds), v = Y.margin + rng.range(1.5, Math.max(1.6, depth - 3.5)), p = at(u + 2, v);
          if (kind === 'garden') {
            const w = rng.range(3.5, 5.5), d = rng.range(2.2, 3.2);
            this.P('floors', p.x, 0.1, p.z, ns ? w : d, 0.2, ns ? d : w, Y.soil);
            for (let k = 0; k < 7; k++) this.P('shrubs', p.x + rng.range(-w / 2 + 0.4, w / 2 - 0.4) * (ns ? 1 : 0.4), 0.3, p.z + rng.range(-w / 2 + 0.4, w / 2 - 0.4) * (ns ? 0.4 : 1), 0.45, 0.4, 0.45, rng.pick(Y.crops), rng() * 6);
          } else if (kind === 'tank') {
            const r = rng.range(1.0, 1.4);
            this.P('barrels', p.x, 1.0, p.z, r * 2.2, 1.9, r * 2.2, rng.pick(Y.tank)); this.box(p.x - r, p.z - r, p.x + r, p.z + r, 2.0, 'tank');
          } else if (kind === 'washing') {
            const len = rng.range(4, 6), a = ns;
            for (const s of [-1, 1]) this.P('props', p.x + (a ? s * len / 2 : 0), 0.9, p.z + (a ? 0 : s * len / 2), 0.1, 1.8, 0.1, Y.post);
            this.P('props', p.x, 1.75, p.z, a ? len : 0.03, 0.03, a ? 0.03 : len, '#d9d2b8');
            for (let k = 0; k < 4; k++) { const o = -len / 2 + 0.7 + k * (len - 1.4) / 3; this.P('props', p.x + (a ? o : 0), 1.35, p.z + (a ? 0 : o), a ? 0.8 : 0.04, 0.75, a ? 0.04 : 0.8, rng.pick(Y.cloth)); }
          } else if (kind === 'shade') {
            const w = rng.range(3.2, 4.4);
            this.P('roofs', p.x, 2.3, p.z, w, 0.08, w * 0.8, rng.pick(Y.tarp));
            for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.P('props', p.x + sx * (w / 2 - 0.15), 1.15, p.z + sz * (w * 0.4 - 0.15), 0.1, 2.3, 0.1, Y.post);
            this.P('props', p.x, 0.4, p.z, 1.2, 0.08, 0.8, '#6a5440'); // a table under it
          } else {
            for (let k = 0; k < 3; k++) this.P('props', p.x + rng.range(-1.5, 1.5), 0.35, p.z + rng.range(-1.5, 1.5), rng.range(0.7, 1.3), rng.range(0.5, 0.9), rng.range(0.7, 1.3), rng.pick(['#7a5a34', '#6b4e2e', '#5a5650', '#8a6a44']), rng() * 3);
            this.P('barrels', p.x + 2, 0.55, p.z, 1, 1, 1, rng.pick(['#5a2e1a', '#3f5a62', '#6a6a5a']));
          }
        }
      }
      // A picket fence round a house's lot (looks only: its gate is the walk to the front door).
      if (L.kind === 'house' || L.kind === 'bungalow' || L.kind === 'duplex') {
        const c = rng.pick(['#e6e0d2', '#d8cfb8', '#c9b89a', '#9cc0b8']), lt = L.lot, y = 0.5;
        for (const [x0, z0, x1, z1] of [[lt.x0 + 0.3, lt.z0 + 0.3, lt.x1 - 0.3, lt.z0 + 0.3], [lt.x0 + 0.3, lt.z1 - 0.3, lt.x1 - 0.3, lt.z1 - 0.3], [lt.x0 + 0.3, lt.z0 + 0.3, lt.x0 + 0.3, lt.z1 - 0.3], [lt.x1 - 0.3, lt.z0 + 0.3, lt.x1 - 0.3, lt.z1 - 0.3]]) {
          const horiz = z0 === z1, isFront = horiz ? (F === 'N' && Math.abs(z0 - lt.z0) < 1) || (F === 'S' && Math.abs(z0 - lt.z1) < 1) : (F === 'W' && Math.abs(x0 - lt.x0) < 1) || (F === 'E' && Math.abs(x0 - lt.x1) < 1);
          if (isFront) continue; // the street side stays open
          this.P('props', (x0 + x1) / 2, y, (z0 + z1) / 2, horiz ? x1 - x0 : 0.08, 1.0, horiz ? 0.08 : z1 - z0, c);
        }
      }
      // Carts and old cars at the kerb in front of the shops.
      if (!['house', 'bungalow', 'duplex'].includes(L.kind) && rng() < 0.55) {
        const kx = F === 'N' ? { x: L.cx + rng.range(-3, 3), z: L.lot.z0 - this.row.walk - 2.4 } : F === 'S' ? { x: L.cx + rng.range(-3, 3), z: L.lot.z1 + this.row.walk + 2.4 } : null;
        if (kx) {
          const cart = rng() < 0.45, c = rng.pick(cart ? ['#7a5a34', '#6b4e2e'] : ['#56603f', '#6a2a1a', '#3f5a62', '#8a6a2a', '#e0d8c0', '#4a4a48']);
          if (cart) { this.P('props', kx.x, 0.6, kx.z, 2.4, 0.5, 1.4, c); for (const s of [-1, 1]) this.P('trunks', kx.x, 0.45, kx.z + s * 0.8, 0.9, 0.12, 0.9, '#2b2826'); this.box(kx.x - 1.2, kx.z - 0.8, kx.x + 1.2, kx.z + 0.8, 1, 'cart'); }
          else { this.P('props', kx.x, 0.55, kx.z, 4.2, 0.8, 1.9, c); this.P('props', kx.x, 1.15, kx.z, 2.0, 0.6, 1.6, '#2a2622'); this.box(kx.x - 2.1, kx.z - 0.95, kx.x + 2.1, kx.z + 0.95, 1.4, 'car'); }
        }
      }
    }
    void M;
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
    if (mk) for (const [fx, fz] of [[0.18, 0.2], [0.82, 0.2], [0.18, 0.8], [0.82, 0.8]]) this.flora.push([rng.pick(T.square), mk.x0 + (mk.x1 - mk.x0) * fx, mk.z0 + (mk.z1 - mk.z0) * fz, rng.range(7, 9), rng.int(0, 2)]);
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
    return {
      items: this.items.filter((it) => own(it.e[0], it.e[2])),
      flora: this.flora.filter((f) => own(f[1], f[2])),
      boxes: this.boxes.filter((b) => b.x1 > ox - 3 && b.x0 < X1 + 3 && b.z1 > oz - 3 && b.z0 < Z1 + 3),
    };
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
