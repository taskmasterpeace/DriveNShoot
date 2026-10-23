// A MILITARY BASE in the streamed world (docs/design/WEB_BASES.md; rows in data/milbases.js). Every base row is placed
// here (placeMilBases: the scale law, F1-F4); a BUILT one is a "towner" to the chunk generator (world/chunkgen.js asks
// it what world/holdout.js and world/ring.js answer: touches, streets, blocksOver/pads, around, geo, wrecks, railIn,
// extras), laid out lazily the first time a chunk asks, as a pure function of its row, the seed and where it stands:
//   the wire     chain-link round the full fence at the footprint rule, razor wire on top, posts every panel; see-through
//                to sight and rounds, solid to walkers and cars; watchtowers at the corners, along the runs and at the gate
//   the gate     a gap in the wire on the side facing the base's road, a booth and a boom (or a car wall, or fallen leaves)
//   the road     the access road from the gate to the interstate (or to the point the row names), and the main street
//   the core     the cantonment: the template's programmes as walk-in buildings along the main street (world/ring.js geo:
//                shells, doors, windows, furniture, containers, beds), in the military zone (data/ring.js)
//   features     a runway, apron and hangars; a parade ground, motor yard and firing range; silos and a gantry; igloo rows;
//                a mock town; a launch pad and domes; a fuel farm; the rail spur, its locked yard and a cargo train
//   wreckage     the war's: craters, tank hulks, burned trucks, a downed aircraft, cut through the open ground by cell
// Positions are world metres; collision axis-aligned (chunks clip it). Nothing here reads Math.random.
import { KINDS } from '../data/ring.js';
import { MIL_TEMPLATES, MIL_HOLDS, MIL_RULES, MIL_SITES } from '../data/milbases.js';
import { C, hash32, rngOf, chunkOf } from './geo.js';
import { STREAM } from '../data/streaming.js';
import { regionWater } from './regions.js';

const SIDES = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
const sideOf = (dx, dz) => (Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : dz > 0 ? 'S' : 'N');

// ---- placement: every row (built or not) --------------------------------------------------------------------------------
// F1 the atlas row's world point (ATLAS_XZ) or the build block's anchor; F2 the footprint rule's side (data/milbases.js);
// F4 the scale law: a built base slides along the line to its nearest interstate until its fence is at least `clear` from
// the centreline and its gate no more than `approachMax`; it keeps `clearTown` from towns and off the Phoenix ring.
export function placeMilBases(W) {
  const out = [], R = MIL_RULES;
  for (const row of MIL_SITES) {
    const B = row.build;
    let x = null, z = null;
    if (B?.at) [x, z] = B.at;
    else if (B?.anchor) {
      const cor = W.corridors.find((c) => c.id === B.anchor.road);
      if (cor) { const f = cor.at(B.anchor.mile * STREAM.mile); x = f.x + f.nx * B.anchor.side * B.anchor.off; z = f.z + f.nz * B.anchor.side * B.anchor.off; }
    } else if (row.xz) [x, z] = row.xz;
    if (x === null) { out.push({ row, id: row.id, built: false, placed: false, why: 'off the mainland grid' }); continue; }
    const hs = row.side / 2;
    const ex = B?.extend ? SIDES[B.extend] : null;
    if (ex) { x += ex[0] * (hs - 120); z += ex[1] * (hs - 120); } // the anchor is the main post near the square's far edge
    const region = W.regionOf(x, z, 0)?.id ?? (Math.hypot(x, z) < STREAM.dustWall - hs - 600 ? 'arizona' : null);
    const built = !!B && region === B.region;
    let moved = 0;
    if (built && !B.at) {
      // The scale law. Distance from the square to the nearest interstate centreline, sampled round its edge.
      // (The centre's nearest interstate, found once over all of them; the edge samples ask only that one, near.)
      const rectD = (cx, cz) => {
        const pc = W.projectAny(cx, cz), cor = pc.cor, m = pc.d + hs * 1.5 + 200;
        let best = pc.d, p = pc;
        for (let k = 0; k < 40; k++) {
          const e = (k % 10) / 10 * 2 - 1, s = Math.floor(k / 10);
          const px = cx + (s === 0 ? e * hs : s === 1 ? hs : s === 2 ? -e * hs : -hs), pz = cz + (s === 0 ? -hs : s === 1 ? e * hs : s === 2 ? hs : -e * hs);
          const q = cor ? cor.project(px, pz, m) : W.projectAny(px, pz);
          if (q.d < best) { best = q.d; p = q; p.cor ??= cor; }
        }
        return { d: best, p };
      };
      let r0 = rectD(x, z);
      const nx0 = r0.p ? x - r0.p.x : 0, nz0 = r0.p ? z - r0.p.z : 1, nl = Math.hypot(nx0, nz0) || 1, nx = nx0 / nl, nz = nz0 / nl;
      const maxA = B.approachMax ?? 1500;
      // Straight to the band [clear, approachMax] (a few passes: the road bends), then a step at a time off towns and the ring.
      for (let i = 0; i < 12; i++) {
        const want = r0.d < R.clear ? R.clear + 20 - r0.d : r0.d > maxA ? maxA - 20 - r0.d : 0;
        if (Math.abs(want) < 1) break;
        x += nx * want; z += nz * want; moved += Math.abs(want);
        r0 = rectD(x, z);
      }
      for (let i = 0; i < 120; i++) {
        let push = 0;
        for (const t of W.towns) if (Math.hypot(t.x - x, t.z - z) < hs + R.clearTown && (t.built || t.holdout || t.kind === 'city')) push = 1;
        if (W.ring && Math.hypot(x, z) < 1700 + hs) push = 1;
        if (!push) break;
        x += nx * R.slideStep; z += nz * R.slideStep; moved += R.slideStep;
      }
    }
    out.push({ row, id: row.id, built, placed: true, region, cx: Math.round(x), cz: Math.round(z), side: row.side, moved });
  }
  // Built bases never overlap one another (the later row slides away from the earlier, along the line between them).
  const live = out.filter((p) => p.built);
  for (let i = 1; i < live.length; i++) for (let j = 0; j < i; j++) {
    const a = live[j], b = live[i], gap = (a.side + b.side) / 2 + 120;
    for (let k = 0; k < 200 && Math.abs(a.cx - b.cx) < gap && Math.abs(a.cz - b.cz) < gap; k++) {
      const dx = b.cx - a.cx, dz = b.cz - a.cz, l = Math.hypot(dx, dz) || 1;
      b.cx = Math.round(b.cx + (dx / l) * R.slideStep); b.cz = Math.round(b.cz + (dz / l) * R.slideStep); b.moved += R.slideStep;
    }
  }
  // Built ones are laid out now, at boot (a few ms each): a layout first asked for mid-drive would be a stall.
  return out.map((p) => { if (!p.built) return p; const B = new MilBase(W, p); B.ensure(); return B; });
}

export class MilBase {
  constructor(W, p) {
    this.W = W; this.row = p.row; this.id = p.row.id; this.name = p.row.name; this.built = true; this.placed = true;
    this.region = p.region; this.moved = p.moved;
    this.T = MIL_TEMPLATES[p.row.template]; this.H = MIL_HOLDS[p.row.hold]; this.B = p.row.build;
    this.cx = p.cx; this.cz = p.cz; this.side = p.side; this.hs = p.side / 2;
    this.x0 = this.cx - this.hs; this.x1 = this.cx + this.hs; this.z0 = this.cz - this.hs; this.z1 = this.cz + this.hs;
    this.seed = hash32(W.seed, ...[...this.id].map((c) => c.charCodeAt(0)), 0x4d494c);
    this.openings = true; // its doors are hung near the player (systems/interiors.js ringScan asks the towners that say so)
    // The road it serves: the nearest interstate point, or the point the row names. The gate faces it.
    const tgt = this.B.road?.to ? { x: this.B.road.to[0], z: this.B.road.to[1], cor: null } : W.projectAny(this.cx, this.cz);
    this.target = { x: tgt.x, z: tgt.z, cor: tgt.cor?.id ?? null };
    this.gate = this.B.gate ?? sideOf(tgt.x - this.cx, tgt.z - this.cz);
    const n = SIDES[this.gate];
    this.nx = n[0]; this.nz = n[1]; this.tx = Math.abs(n[1]); this.tz = Math.abs(n[0]); // the tangent: +x for N/S gates, +z for W/E
    this.ready = false;
    // The reach every chunk asks about before the layout exists: the fence, the road toward its target, a margin.
    const rx0 = Math.min(this.x0, this.target.x), rx1 = Math.max(this.x1, this.target.x), rz0 = Math.min(this.z0, this.target.z), rz1 = Math.max(this.z1, this.target.z);
    this.reach0 = { x0: rx0 - 300, z0: rz0 - 300, x1: rx1 + 300, z1: rz1 + 300 };
  }
  // local (u along the gate side from the fence's middle, v inward from the gate's fence line) -> world
  wx(u, v) { return this.cx + this.tx * u + this.nx * (this.hs - v); }
  wz(u, v) { return this.cz + this.tz * u + this.nz * (this.hs - v); }
  rect(u0, u1, v0, v1) { const a = [this.wx(u0, v0), this.wx(u1, v1)], b = [this.wz(u0, v0), this.wz(u1, v1)]; return { x0: Math.min(...a), x1: Math.max(...a), z0: Math.min(...b), z1: Math.max(...b) }; }
  inBase(x, z, m = 0) { return x > this.x0 - m && x < this.x1 + m && z > this.z0 - m && z < this.z1 + m; }
  get reach() { return this.ready ? this.reachR : this.reach0; }
  // Coarse first (cheap, no layout); only a chunk inside the coarse reach lays the base out and asks the fine one.
  touches(cx, cz) {
    const over = (r) => { const x0 = cx * C, z0 = cz * C; return x0 < r.x1 && x0 + C > r.x0 && z0 < r.z1 && z0 + C > r.z0; };
    if (!over(this.reach0)) return false;
    this.ensure();
    return over(this.reachR);
  }
  // 0 outside the wire .. 1 inside (a region's ground tint and wild scatter read it).
  cityK(x, z) { return this.inBase(x, z, 4) ? 1 : 0; }
  // Paved or built on: the scatter keeps off the core, the runway and apron, the roads, the yard and the pads.
  solid(x, z, r = 0) {
    if (!this.inBase(x, z, 40 + r) && !this.onRoad(x, z, 6 + r)) return false;
    this.ensure();
    for (const p of this.keepClear) if (x > p.x0 - r && x < p.x1 + r && z > p.z0 - r && z < p.z1 + r) return true;
    // The wire's line (posts, coil): nothing grows through it.
    const d = Math.min(Math.abs(x - this.x0), Math.abs(x - this.x1), Math.abs(z - this.z0), Math.abs(z - this.z1));
    return this.inBase(x, z, 3) && d < 3 + r;
  }
  // Standing water (a region's sea, lagoon or canal; sloughs keep out of a base: world/regions.js), the pure function.
  wet(x, z) { const R = this.W.regions?.[this.region]; return !!R && regionWater(R, x, z).d > 0.05; }
  onRoad(x, z, m = 0) { for (const s of this.roads ?? []) if (x > s.x0 - m && x < s.x1 + m && z > s.z0 - m && z < s.z1 + m) return true; return false; }

  ensure() { if (!this.ready) { this.ready = true; this.layout(); } }

  // ---- the layout ----------------------------------------------------------------------------------------------------------
  layout() {
    const R = MIL_RULES, rng = rngOf(this.seed), hs = this.hs;
    this.items = []; this.boxes = []; this.lots = []; this.blocks = []; this.streetList = []; this.flora = [];
    this.keepClear = []; this.towers = []; this.posts = []; this.patrols = []; this.floods = []; this.parking = [];
    this.roads = []; this.hook = null; this.yard = null; this.logBoxes = []; this.train = null; this.dropped = []; this.fpts = [];
    // The gate: centred on its side unless the rail yard takes that end.
    let gateU = 0;
    if (this.B.rail) gateU = Math.min(hs - 90, 90);
    this.gateU = gateU;
    const gw = R.gateWidth;
    this.gateAt = { x: this.wx(gateU, 0), z: this.wz(gateU, 0) };
    this.gateIn = { x: this.wx(gateU, 14), z: this.wz(gateU, 14) };
    this.gateOut = { x: this.wx(gateU, -14), z: this.wz(gateU, -14) };
    // The cantonment: [along, inward], clamped inside the wire.
    const cw = Math.min(this.T.canton[0], this.side - 60), cd = Math.min(this.T.canton[1], this.side - 60);
    let cu0 = Math.max(-hs + 24, gateU - cw / 2);
    const cu1 = Math.min(hs - 24, gateU + cw / 2);
    if (this.B.rail) cu0 = Math.max(cu0, -360 - this.cx + 60); // the rail yard keeps the west end (an S gate: u = x - cx)
    this.canton = { u0: cu0, u1: cu1, v0: 18, v1: 18 + cd };
    this.cantonW = this.rect(cu0, cu1, 18, 18 + cd);
    this.access(rng);
    this.wire(rngOf(hash32(this.seed, 0x57495245)));
    this.gateDress(rngOf(hash32(this.seed, 0x47415445)));
    if (this.B.rail) this.railYard(rngOf(hash32(this.seed, 0x5241494c))); // first: everything else keeps off the yard
    this.core(rngOf(hash32(this.seed, 0x434f5245)));
    this.clear(this.cantonW, 4); // the post's ground is kept: no brush between the buildings
    for (const f of this.T.features) this.feature(f, rngOf(hash32(this.seed, ...[...f].map((c) => c.charCodeAt(0)))));
    this.tracks();
    this.down();
    this.wreckage(rngOf(hash32(this.seed, 0x57524b)));
    this.lots.sort((a, b) => (a.id < b.id ? -1 : 1));
    // Items by chunk (a big base has thousands: a chunk reads only its own bucket).
    this.byChunk = new Map();
    for (const it of this.items) { const k = `${chunkOf(it.e[0])},${chunkOf(it.e[2])}`; let l = this.byChunk.get(k); if (!l) this.byChunk.set(k, (l = [])); l.push(it); }
    const r0 = this.reach0;
    this.reachR = { x0: Math.min(r0.x0, ...this.roads.map((s) => s.x0 - 30)), z0: Math.min(r0.z0, ...this.roads.map((s) => s.z0 - 30)), x1: Math.max(r0.x1, ...this.roads.map((s) => s.x1 + 30)), z1: Math.max(r0.z1, ...this.roads.map((s) => s.z1 + 30)) };
    if (this.spur) { this.reachR.z1 = Math.max(this.reachR.z1, this.spur.z1 + 20); this.reachR.z0 = Math.min(this.reachR.z0, this.spur.z0 - 20); this.reachR.x0 = Math.min(this.reachR.x0, this.spur.x - 30); this.reachR.x1 = Math.max(this.reachR.x1, this.spur.x + 30); }
    // Never past the coarse reach the chunks asked before this layout existed (touches must not change its answer).
    const q = this.reach0;
    this.reachR = { x0: Math.max(q.x0, this.reachR.x0), z0: Math.max(q.z0, this.reachR.z0), x1: Math.min(q.x1, this.reachR.x1), z1: Math.min(q.z1, this.reachR.z1) };
  }

  P(pool, x, y, z, w, h, d, col, rot = 0, shade = 1) { this.items.push({ pool, e: [x, y, z, w, h, d, col, rot, shade] }); }
  box(x0, z0, x1, z1, h, tag, extra = null) { const b = { x0, z0, x1, z1, h, tag }; if (extra) Object.assign(b, extra); this.boxes.push(b); return b; }
  boxC(x, z, w, d, h, tag) { return this.box(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h, tag); }
  clear(r, m = 0) { this.keepClear.push({ x0: r.x0 - m, z0: r.z0 - m, x1: r.x1 + m, z1: r.z1 + m }); }

  // ---- the access road and the main street --------------------------------------------------------------------------------
  // From the gate straight out along its normal until the road is beside the interstate (or level with the target), then
  // along the other axis to it: an L at most. Each leg is a street rect (chunks draw it; the HUD names it).
  access() {
    const R = MIL_RULES, W = this.W, hw = R.road / 2, g = this.gateAt, nx = this.nx, nz = this.nz;
    const cor = this.target.cor ? W.corridors.find((c) => c.id === this.target.cor) : null;
    const stopD = (x, z) => { if (!cor) return Math.hypot(x - this.target.x, z - this.target.z) < 30; const p = cor.project(x, z, 600); return p.d < (cor.section(p.s).out ?? 20) + R.roadStop; };
    // leg A
    let x = g.x, z = g.z, len = 0;
    const along = nx !== 0 ? 'x' : 'z', tgtA = along === 'x' ? this.target.x : this.target.z;
    for (; len < 9000; len += 4) {
      const qx = g.x + nx * len, qz = g.z + nz * len;
      if (stopD(qx, qz)) break;
      if ((along === 'x' ? (tgtA - qx) * nx : (tgtA - qz) * nz) <= 0) break; // level with the target
      x = qx; z = qz;
    }
    const legA = along === 'x' ? { x0: Math.min(g.x, x) - (nx < 0 ? 0 : 0), x1: Math.max(g.x, x), z0: g.z - hw, z1: g.z + hw, axis: 'x' } : { x0: g.x - hw, x1: g.x + hw, z0: Math.min(g.z, z), z1: Math.max(g.z, z), axis: 'z' };
    const name = `${this.name.split(' ').slice(0, 2).join(' ')} ROAD`;
    if (len > 2) this.addRoad(legA, `${this.id}:road`, name);
    // leg B, when leg A ended level with the target without reaching the road
    if (!stopD(x, z)) {
      const bx = along === 'x' ? 0 : Math.sign(this.target.x - x), bz = along === 'x' ? Math.sign(this.target.z - z) : 0;
      let ex = x, ez = z;
      for (let l2 = 0; l2 < 9000; l2 += 4) {
        const qx = x + bx * l2, qz = z + bz * l2;
        if (stopD(qx, qz) || (bx && (this.target.x - qx) * bx <= 0) || (bz && (this.target.z - qz) * bz <= 0)) break;
        ex = qx; ez = qz;
      }
      const legB = bx ? { x0: Math.min(x, ex) - hw, x1: Math.max(x, ex) + hw, z0: z - hw, z1: z + hw, axis: 'x' } : { x0: x - hw, x1: x + hw, z0: Math.min(z, ez) - hw, z1: Math.max(z, ez) + hw, axis: 'z' };
      if (Math.max(legB.x1 - legB.x0, legB.z1 - legB.z0) > R.road + 2) this.addRoad(legB, `${this.id}:road2`, name);
      this.roadEnd = { x: ex, z: ez };
    } else this.roadEnd = { x, z };
    // The main street: from the gate through the core.
    const S = R.street / 2, ms = this.rect(this.gateU - S, this.gateU + S, -1, this.canton.v1);
    this.mainStreet = { ...ms, axis: nx !== 0 ? 'x' : 'z' };
    this.streetList.push({ ...this.mainStreet, line: `${this.id}:main`, name: `${this.name} · MAIN GATE ROAD`, art: true });
    this.clear(ms, 1);
  }
  addRoad(r, line, name) { this.roads.push(r); this.streetList.push({ ...r, line, name, art: false }); this.clear(r, 2); }

  // ---- the wire ------------------------------------------------------------------------------------------------------------
  wire(rng) {
    const R = MIL_RULES, H = R.fenceH, hs = this.hs, gw = R.gateWidth;
    const runs = [
      { side: 'N', horiz: true, fixed: this.z0, a: this.x0, b: this.x1 }, { side: 'S', horiz: true, fixed: this.z1, a: this.x0, b: this.x1 },
      { side: 'W', horiz: false, fixed: this.x0, a: this.z0, b: this.z1 }, { side: 'E', horiz: false, fixed: this.x1, a: this.z0, b: this.z1 },
    ];
    const gc = this.gate === 'N' || this.gate === 'S' ? this.gateAt.x : this.gateAt.z;
    for (const r of runs) {
      const spans = r.side === this.gate ? [[r.a, gc - gw / 2], [gc + gw / 2, r.b]] : [[r.a, r.b]];
      for (const [a, b] of spans) {
        if (b - a < 1) continue;
        // Collision: see-through (its whole length is a hole: sight and rounds pass, walkers and cars do not).
        const t = 0.15;
        const bx = r.horiz ? this.box(a, r.fixed - t, b, r.fixed + t, H + R.wire, 'wire') : this.box(r.fixed - t, a, r.fixed + t, b, H + R.wire, 'wire');
        bx.holes = [a - 0.01, b + 0.01]; bx.holeX = r.horiz; bx.sill = H;
        const n = Math.max(1, Math.round((b - a) / R.panel));
        const out = r.side === 'N' || r.side === 'W' ? -1 : 1;
        for (let k = 0; k <= n; k++) {
          const s = a + ((b - a) * k) / n, big = k === 0 || k === n;
          const [x, z] = r.horiz ? [s, r.fixed] : [r.fixed, s];
          this.P('props', x, (H + R.wire) / 2, z, big ? 0.26 : 0.16, H + R.wire, big ? 0.26 : 0.16, '#4d4f4a');
          // the outrigger arm leaning out over the wire
          this.P('props', x + (r.horiz ? 0 : out * 0.18), H + R.wire * 0.55, z + (r.horiz ? out * 0.18 : 0), r.horiz ? 0.05 : 0.4, 0.05, r.horiz ? 0.4 : 0.05, '#55574f');
          if (k === n) continue;
          const s1 = a + ((b - a) * (k + 1)) / n, mid = (s + s1) / 2, len = s1 - s;
          const [mx, mz] = r.horiz ? [mid, r.fixed] : [r.fixed, mid];
          this.P('props', mx, H - 0.03, mz, r.horiz ? len : 0.06, 0.06, r.horiz ? 0.06 : len, '#7a7c74');           // top rail
          this.P('walls', mx, H / 2, mz, r.horiz ? len : 0.05, H - 0.1, r.horiz ? 0.05 : len, '#8c8e86', 0, 0.82); // the mesh, seen edge-on from above
          // The razor wire: loops of coil seen from above as a zigzag of short strands either side of the top rail.
          for (let q = 0; q < 6; q++) {
            const t2 = s + (len * (q + 0.5)) / 6, rot = (r.horiz ? 0 : Math.PI / 2) + (q % 2 ? 0.7 : -0.7);
            const [qx, qz] = r.horiz ? [t2, r.fixed + out * 0.1] : [r.fixed + out * 0.1, t2];
            this.P('props', qx, H + 0.28, qz, 0.05, 0.05, 1.0, '#a8a89e', rot + Math.PI / 2, 0.95);
          }
          this.P('props', mx, 0.02, mz, r.horiz ? len : 3.2, 0.03, r.horiz ? 3.2 : len, '#8a7a5e', 0, 0.8); // the strip kept bare along the wire
        }
      }
    }
    // Watchtowers: the corners, both sides of the gate, and along every run.
    const T = R.tower, ins = T.size / 2 + 1.2;
    const add = (x, z, face, sweep) => {
      if (this.towers.some((q) => Math.hypot(q.x - x, q.z - z) < 30)) return;
      this.tower(x, z, face, sweep);
    };
    const N = Math.PI, E = Math.PI / 2;
    add(this.x0 + ins, this.z0 + ins, -3 * N / 4, [E, 0]); add(this.x1 - ins, this.z0 + ins, 3 * N / 4, [-E, 0]);
    add(this.x0 + ins, this.z1 - ins, -N / 4, [E, N]); add(this.x1 - ins, this.z1 - ins, N / 4, [-E, -N]);
    // beside the gate, inside
    for (const sd of [-1, 1]) {
      const u = this.gateU + sd * (gw / 2 + 4);
      add(this.wx(u, ins), this.wz(u, ins), Math.atan2(this.nx, this.nz), [Math.atan2(this.nx, this.nz) - 0.9, Math.atan2(this.nx, this.nz) + 0.9]);
    }
    const every = this.T.towerEvery;
    for (const r of runs) {
      const L = r.b - r.a, n = Math.floor(L / every);
      for (let k = 1; k < n; k++) {
        const s = r.a + (L * k) / n, inward = r.side === 'N' || r.side === 'W' ? 1 : -1;
        const [x, z] = r.horiz ? [s, r.fixed + inward * ins] : [r.fixed + inward * ins, s];
        if (r.side === this.gate && Math.abs(s - gc) < gw + 20) continue;
        const face = Math.atan2(r.horiz ? 0 : -inward, r.horiz ? -inward : 0); // out over the wire
        add(x, z, face, [face + N / 2 + 0.3, face + 3 * N / 2 - 0.3].map((h) => h));
      }
    }
  }

  // A watchtower (OUTPOST NINE's, data/bases.js TOWER): four legs, a deck behind a parapet, a ladder, a searchlight.
  tower(x, z, face, sweep) {
    const T = MIL_RULES.tower, h = T.deck, hs = T.size / 2, leg = hs - 0.2, col = '#5a5442', legc = '#3f3c33';
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.P('props', x + a * leg, h / 2, z + b * leg, 0.22, h, 0.22, legc);
    for (const [a, b, c2, d2] of [[-1, 0, 0.08, T.size], [1, 0, 0.08, T.size], [0, -1, T.size, 0.08], [0, 1, T.size, 0.08]]) {
      this.P('props', x + a * leg, h * 0.5, z + b * leg, c2 === 0.08 ? 0.06 : T.size - 0.4, 0.07, d2 === 0.08 ? 0.06 : T.size - 0.4, legc); // a brace
      this.P('props', x + a * (hs - 0.04), h + T.parapet / 2, z + b * (hs - 0.04), c2, T.parapet, d2, col); // the parapet
    }
    this.P('props', x, h - 0.11, z, T.size, 0.22, T.size, '#4c4639');
    this.P('props', x, h + 2.5, z, T.size + 0.6, 0.14, T.size + 0.6, '#55594a'); // a tin sunshade on four poles
    for (const [a, b] of [[-1, -1], [1, 1]]) this.P('props', x + a * (hs - 0.1), h + 1.25, z + b * (hs - 0.1), 0.08, 2.5, 0.08, legc);
    const lx = x + Math.sin(face) * (hs - 0.3), lz = z + Math.cos(face) * (hs - 0.3);
    this.P('barrels', lx, T.lamp, lz, 0.64, 0.55, 0.64, '#3a3833');
    this.P('props', lx + Math.sin(face) * 0.3, T.lamp, lz + Math.cos(face) * 0.3, 0.5, 0.5, 0.06, '#f4ecd2', face);
    const b = this.box(x - hs, z - hs, x + hs, z + hs, h, 'tower');
    b.holes = [x - hs - 0.01, x + hs + 0.01]; b.holeX = true; b.sill = h; // the skirt: see-through, nobody walks under it
    this.towers.push({ id: `t${this.towers.length}`, x, z, face, sweep, lampX: lx, lampZ: lz });
    this.clear({ x0: x - hs - 2, z0: z - hs - 2, x1: x + hs + 2, z1: z + hs + 2 });
  }

  // ---- the gate, dressed by who holds the base -----------------------------------------------------------------------------
  gateDress(rng) {
    const R = MIL_RULES, gw = R.gateWidth, g = this.gateAt, nx = this.nx, nz = this.nz, tx = this.tx, tz = this.tz, H = R.fenceH;
    const at = (u, v) => [this.wx(this.gateU + u, v), this.wz(this.gateU + u, v)];
    // Heavy gate posts.
    for (const sd of [-1, 1]) { const [x, z] = at(sd * gw / 2, 0); this.P('props', x, (H + 0.6) / 2, z, 0.34, H + 0.6, 0.34, '#4a4c46'); this.boxC(x, z, 0.4, 0.4, H + 0.6, 'post'); }
    const kind = this.H.gate;
    if (kind === 'boom' || kind === 'shut') {
      // The booth inside, the boom raised, jersey barriers making a chicane on the road outside.
      const [bx, bz] = at(gw / 2 + 3.2, 3);
      this.P('props', bx, 0.5, bz, 2.4, 1.0, 2.2, '#7d775f'); this.P('props', bx, 1.75, bz, 2.3, 1.5, 2.1, '#2e3a3c'); this.P('props', bx, 2.65, bz, 3.0, 0.18, 2.8, '#55594a');
      this.boxC(bx, bz, 2.4, 2.2, 2.7, 'booth');
      const [px, pz] = at(-gw / 2 - 0.6, 1.2);
      this.P('props', px, 0.55, pz, 0.5, 1.1, 0.5, '#3c3e38'); this.boxC(px, pz, 0.5, 0.5, 1.1, 'boom');
      for (let k = 0; k < 5; k++) this.P('props', px, 1.4 + k * 0.6, pz, 0.16, 0.62, 0.14, k % 2 ? '#d8d2c2' : '#a3392a');
      for (const [u, v] of [[-gw / 2 + 1.8, -12], [gw / 2 - 1.8, -20]]) {
        const [x, z] = at(u, v), w = 3.6;
        this.P('props', x, 0.43, z, tx ? w : 0.62, 0.86, tz ? w : 0.62, '#a39d8d');
        this.box(x - (tx ? w / 2 : 0.31), z - (tz ? w / 2 : 0.31), x + (tx ? w / 2 : 0.31), z + (tz ? w / 2 : 0.31), 0.86, 'barrier');
      }
      for (const sd of [-1, 1]) { const [x, z] = at(sd * (gw / 2 + 1.2), -3); this.P('props', x, 0.5, z, 1.6, 1.0, 1.6, '#8a7c5a'); this.boxC(x, z, 1.4, 1.4, 1.0, 'sandbags'); }
    } else if (kind === 'cars') {
      // A wall of dead cars either side of the gap, painted banners on the wire.
      for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) {
        const [x, z] = at(sd * (gw / 2 + 2.5 + k * 4.6), -2.5), c = rng.pick(['#5a3a24', '#4a3020', '#6b4a2e', '#3d3a36', '#704020']);
        this.P('props', x, 0.6, z, tx ? 4.2 : 1.9, 1.0, tz ? 4.2 : 1.9, c); this.P('props', x, 1.25, z, tx ? 2 : 1.6, 0.5, tz ? 2 : 1.6, '#2a2622');
        this.box(x - (tx ? 2.1 : 0.95), z - (tz ? 2.1 : 0.95), x + (tx ? 2.1 : 0.95), z + (tz ? 2.1 : 0.95), 1.5, 'wreck');
      }
      for (const sd of [-1, 1]) { const [x, z] = at(sd * (gw / 2 + 1.0), -0.3); this.P('props', x, H - 0.4, z, tx ? 2.6 : 0.05, 1.4, tz ? 2.6 : 0.05, this.H === MIL_HOLDS.raider ? '#8a2e22' : '#c9902e'); }
    } else {
      // Down: the gate leaves torn off and lying in the road.
      for (const sd of [-1, 1]) { const [x, z] = at(sd * gw / 4, -4 - sd); this.P('walls', x, 0.06, z, tx ? gw / 2 - 0.4 : H, 0.08, tz ? gw / 2 - 0.4 : H, '#8c8e86', sd * 0.3, 0.8); }
    }
    // The sign by the gate (a plate on two posts, outside).
    const [sx, sz] = at(-gw / 2 - 6, -2.4);
    this.P('props', sx, 1.4, sz, tx ? 3 : 0.08, 0.9, tz ? 3 : 0.08, '#d9d4c4'); this.P('props', sx, 1.78, sz, tx ? 3 : 0.09, 0.2, tz ? 3 : 0.09, '#9a2a22');
    for (const sd of [-1, 1]) this.P('props', sx + tx * sd * 1.3, 0.7, sz + tz * sd * 1.3, 0.08, 1.4, 0.08, '#3a3a34');
    this.clear(this.rect(this.gateU - gw / 2 - 8, this.gateU + gw / 2 + 8, -24, 24));
  }

  // ---- the core: the template's programmes along the main street, walk-in ------------------------------------------------
  core(rng) {
    const R = MIL_RULES, c = this.canton, S = R.street / 2 + R.walk, H = this.H;
    // The walks along the main street (the core's ground is the land itself, kept clear).
    const pads = [];
    pads.push({ ...this.rect(this.gateU - S, this.gateU - R.street / 2, 0, c.v1), band: 'walk' }, { ...this.rect(this.gateU + R.street / 2, this.gateU + S, 0, c.v1), band: 'walk' });
    this.blocks.push({ id: `${this.id}:core`, pads, x0: this.cantonW.x0, z0: this.cantonW.z0, x1: this.cantonW.x1, z1: this.cantonW.z1, lots: [] });
    // Along the street: alternate sides, front to the street, gaps between.
    const sides = [{ s: -1, v: c.v0 + 4 }, { s: 1, v: c.v0 + 4 }];
    let k = 0;
    for (const kind of this.T.street) {
      const K = KINDS[kind];
      if (!K) { this.dropped.push(kind); continue; }
      const w = rng.range(K.w[0], K.w[1]), d = rng.range(K.d[0], K.d[1]);
      // choose the side with the shortest run so far
      const sd = sides[0].v <= sides[1].v ? sides[0] : sides[1];
      const v0 = sd.v, v1 = v0 + w; // frontage runs inward along v
      const uFront = this.gateU + sd.s * (S + R.setback), uBack = uFront + sd.s * d;
      if (v1 > c.v1 - 2 || Math.abs(uBack) > this.hs - 20 || (sd.s < 0 ? uBack < c.u0 - 30 : uBack > c.u1 + 30)) { this.dropped.push(kind); continue; }
      const r = this.rect(Math.min(uFront, uBack), Math.max(uFront, uBack), v0, v1);
      for (const q of ['x0', 'x1', 'z0', 'z1']) r[q] = Math.round(r[q] * 2) / 2;
      const front = sideOf(-this.tx * sd.s, -this.tz * sd.s);
      this.addLot(kind, r, front, rng, k++);
      sd.v = v1 + R.lotGap;
    }
    this.dressCore(rngOf(hash32(this.seed, 0x44524553)));
  }
  // The post lived in: floodlight masts down the street (their pools at night), jersey barriers and sandbag nests, a water
  // tower and a mast by the HQ, tents where the barracks ran out of room, a few trucks that never left.
  dressCore(rng) {
    const c = this.canton, H = this.H, S = MIL_RULES.street / 2 + MIL_RULES.walk;
    const free = (x, z, r) => !this.lots.some((L) => x > L.lot.x0 - r && x < L.lot.x1 + r && z > L.lot.z0 - r && z < L.lot.z1 + r) && this.inBase(x, z, -6);
    // Floodlight masts along the street, alternate sides.
    for (let v = c.v0 + 10, k = 0; v < c.v1; v += 42, k++) {
      const u = this.gateU + (k % 2 ? 1 : -1) * (S + 1.2), x = this.wx(u, v), z = this.wz(u, v);
      if (!free(x, z, 1)) continue;
      this.P('props', x, 3.75, z, 0.18, 7.5, 0.18, '#4a4a44'); this.P('props', x, 7.5, z, 1.6, 0.4, 0.5, '#2e2e2a'); this.boxC(x, z, 0.4, 0.4, 7.5, 'mast');
      if (H.garrison > 0 || H.gate === 'shut') this.floods.push({ x, z, r: 12 });
    }
    // Sandbag nests at the core's four corners (an open ring of bags, cover).
    for (const [u, v] of [[c.u0 + 8, c.v0 + 8], [c.u1 - 8, c.v0 + 8], [c.u0 + 8, c.v1 - 8], [c.u1 - 8, c.v1 - 8]]) {
      const x = this.wx(u, v), z = this.wz(u, v);
      if (!free(x, z, 4)) continue;
      for (const [a, b, w, d] of [[0, -1.6, 3.6, 0.7], [-1.6, 0.3, 0.7, 3.0], [1.6, 0.3, 0.7, 3.0]]) { this.P('props', x + a, 0.45, z + b, w, 0.9, d, rng.pick(['#8a7c5a', '#7e7152', '#93855f'])); this.boxC(x + a, z + b, w, d, 0.9, 'sandbags'); }
    }
    // Jersey barriers in a line down the street's edge near the gate (a checkpoint lane).
    for (let v = 6; v < 30; v += 4.4) for (const sd of [-1, 1]) {
      const u = this.gateU + sd * (MIL_RULES.street / 2 - 0.4), x = this.wx(u, v), z = this.wz(u, v);
      this.P('props', x, 0.43, z, this.tx ? 0.62 : 3.6, 0.86, this.tz ? 0.62 : 3.6, '#a39d8d'); this.box(x - (this.tx ? 0.31 : 1.8), z - (this.tz ? 0.31 : 1.8), x + (this.tx ? 0.31 : 1.8), z + (this.tz ? 0.31 : 1.8), 0.86, 'barrier');
    }
    // A water tower and a radio mast beside the HQ.
    const hq = this.lotOf('hq');
    if (hq) {
      const away = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] }[hq.front];
      const tx = hq.cx + (this.tx ? -(hq.x1 - hq.x0) / 2 - 7 : away[0] * 0), tz = hq.cz + (this.tz ? -(hq.z1 - hq.z0) / 2 - 7 : 0);
      if (free(tx, tz, 3)) {
        for (const [a, b] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) this.P('props', tx + a, 5, tz + b, 0.3, 10, 0.3, '#5a5650');
        this.P('barrels', tx, 11.5, tz, 5.6, 3.4, 5.6, H.ruin > 0.3 ? '#8a6a4a' : '#9a9a8a'); this.boxC(tx, tz, 3.6, 3.6, 13, 'tower');
      }
      const mx = hq.cx + away[0] * ((hq.x1 - hq.x0) / 2 + 3) + (this.tz ? 4 : 0), mz = hq.cz + away[1] * ((hq.z1 - hq.z0) / 2 + 3) + (this.tx ? 4 : 0);
      if (free(mx, mz, 1)) { this.P('props', mx, 9, mz, 0.4, 18, 0.4, '#4a4a44'); this.P('props', mx, 17, mz, 3, 0.12, 0.12, '#2a2a28'); this.P('props', mx, 15, mz, 0.12, 0.12, 3, '#2a2a28'); this.boxC(mx, mz, 1, 1, 18, 'mast'); }
    }
    // Tents in rows in the core's free corner, a couple of dead trucks by the motor pool.
    let tents = 0;
    for (let v = c.v0 + 20; v < c.v1 - 10 && tents < 4; v += 12) for (const u of [c.u0 + 12, c.u1 - 12]) {
      const x = this.wx(u, v), z = this.wz(u, v);
      if (tents >= 4 || !free(x, z, 5)) continue;
      const w = 4.2, d = 6, col = rng.pick(['#5a5f40', '#646a48', '#5e6344']);
      this.P('props', x, 1.4, z, this.tx ? w : d, 0.3, this.tx ? d : w, col, 0, 1); this.P('props', x, 0.6, z, this.tx ? w - 0.2 : d - 0.2, 1.2, this.tx ? d - 0.2 : w - 0.2, '#5b6042');
      this.P('props', x, 1.62, z, this.tx ? 0.12 : d, 0.14, this.tx ? d : 0.12, '#3a3a30');
      this.boxC(x, z, this.tx ? w : d, this.tx ? d : w, 2.0, 'tent');
      tents++;
    }
    const mp = this.lotOf('motorpool');
    if (mp) for (let k = 0; k < 2; k++) {
      const x = mp.cx + (this.tx ? (k - 0.5) * 8 : (mp.front === 'E' ? 1 : -1) * ((mp.x1 - mp.x0) / 2 + 6)), z = mp.cz + (this.tz ? (k - 0.5) * 8 : (mp.front === 'S' ? 1 : -1) * ((mp.z1 - mp.z0) / 2 + 6));
      if (free(x, z, 2)) this.hulk(x, z, rng, 'truck');
    }
  }
  // One walk-in building (world/ring.js geo), its lot rect a margin round its shell.
  addLot(kind, r, front, rng, k, extra = null) {
    const L = { id: `mb:${this.id}.${k}`, kind, zone: 'military', front, ...r, lot: { x0: r.x0 - 2, z0: r.z0 - 2, x1: r.x1 + 2, z1: r.z1 + 2 },
      cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2, seed: rng.int(0, 2147483647), ruined: false, noYard: true,
      base: this.id, programme: KINDS[kind].label ?? kind.toUpperCase(), ...extra };
    // A ruined share by holder (an abandoned base lost half its roofs); never the armory, the HQ or the lab (the hook).
    if (!['armory', 'hq', 'lab'].includes(kind) && rng() < (this.H.ruin ?? 0)) L.ruined = true;
    if (kind === 'armory') L.lock = true; // its front door: a locked steel door (systems/interiors.js honours geo locks)
    this.lots.push(L);
    this.clear(L.lot, 3);
    return L;
  }
  lotOf(kind) { return this.lots.find((L) => L.kind === kind) ?? null; }

  // ---- features -----------------------------------------------------------------------------------------------------------
  // The open ground beyond the core, inward: [u0, u1, v0, v1] (the core takes the near end round the gate).
  far() { const c = this.canton; return { u0: -this.hs + 30, u1: this.hs - 30, v0: c.v1 + 30, v1: this.side - 30 }; }
  // A free w x d (u along the gate side, v inward) on open ground inside the wire, as near the preferred local point as
  // there is one: nothing already laid (keepClear) within m. Returns its local centre, or null.
  spot(w, d, pu, pv, m = 8, track = true) {
    // Search near the preferred point first (a 3 km base has 35,000 candidates), then wider.
    for (const win of [320, 900, 1e9]) { const r = this.spotIn(w, d, pu, pv, m, win); if (r) { if (track) this.fpts.push({ ...r, w, d }); return r; } }
    return null;
  }
  spotIn(w, d, pu, pv, m, win) {
    const hs = this.hs, lim = (a, s) => Math.abs(a) + s / 2 < hs - 26;
    let best = null, bd = Infinity;
    const va = Math.max(26 + d / 2, pv - win), vb = Math.min(this.side - 26 - d / 2, pv + win), ua = Math.max(-hs + 26 + w / 2, pu - win), ub = Math.min(hs - 26 - w / 2, pu + win);
    for (let v = va; v < vb; v += 16) for (let u = ua; u < ub; u += 16) {
      const dd = (u - pu) ** 2 + (v - pv) ** 2;
      if (dd >= bd || !lim(u, w)) continue;
      const r = this.rect(u - w / 2, u + w / 2, v - d / 2, v + d / 2);
      if (this.keepClear.some((q) => r.x1 > q.x0 - m && r.x0 < q.x1 + m && r.z1 > q.z0 - m && r.z0 < q.z1 + m)) continue;
      best = { u, v }; bd = dd;
    }
    return best;
  }
  feature(f, rng) {
    const R = MIL_RULES, hs = this.hs, c = this.canton;
    if (f === 'runway') {
      // The runway law: along the gate side, past the core and its hangars and apron, length = clamp(share x side, min, max).
      const len = Math.max(R.runway.min, Math.min(R.runway.max, this.side * R.runway.share)), w = R.runway.w;
      const hv0 = c.v1 + 8, hd = 40, av0 = hv0 + hd + 4, v0 = Math.min(this.side - 40 - w, av0 + R.apron), v1 = v0 + w;
      const u0 = -len / 2, u1 = len / 2, along = this.tx ? 'x' : 'z';
      const rw = this.rect(u0, u1, v0, v1);
      this.runwayR = rw;
      this.blocks.push({ id: `${this.id}:runway`, pads: [{ ...rw, band: 'lot' }], ...rw, lots: [] });
      this.clear(rw, 6);
      // Markings: the centreline dashes, threshold bars, edge lights (paint, flat).
      for (let a = u0 + 30; a < u1 - 30; a += 30) { const x = this.wx(a, (v0 + v1) / 2), z = this.wz(a, (v0 + v1) / 2); this.P('floors', x, 0.045, z, along === 'x' ? 14 : 0.9, 0.01, along === 'x' ? 0.9 : 14, '#e2dccb', 0, 0.9); }
      for (const e of [u0 + 8, u1 - 8]) for (let s = -1; s <= 1.01; s += 0.25) { const x = this.wx(e, (v0 + v1) / 2 + s * (w / 2 - 5)), z = this.wz(e, (v0 + v1) / 2 + s * (w / 2 - 5)); this.P('floors', x, 0.046, z, along === 'x' ? 10 : 1.4, 0.01, along === 'x' ? 1.4 : 10, '#e2dccb'); }
      for (let a = u0; a <= u1; a += 60) for (const s of [-1, 1]) { const x = this.wx(a, (v0 + v1) / 2 + s * (w / 2 + 1.5)), z = this.wz(a, (v0 + v1) / 2 + s * (w / 2 + 1.5)); this.P('props', x, 0.25, z, 0.3, 0.5, 0.3, '#c9a640'); }
      // The hangars in a row past the core (facing the runway), the apron in front of them, the control tower at its end.
      let u = c.u0 + 4, k = 100;
      for (const kind of this.T.apron) {
        const K = KINDS[kind]; if (!K) continue;
        const w2 = rng.range(K.w[0], K.w[1]), d2 = Math.min(hd, rng.range(K.d[0], K.d[1]));
        if (u + w2 > hs - 26) { this.dropped.push(kind); continue; }
        const r = this.rect(u, u + w2, av0 - 2 - d2, av0 - 2);
        for (const q of ['x0', 'x1', 'z0', 'z1']) r[q] = Math.round(r[q] * 2) / 2;
        this.addLot(kind, r, sideOf(-this.nx, -this.nz), rng, k++);
        u += w2 + 12;
      }
      const ap = this.rect(Math.max(-hs + 30, u0 + 20), Math.min(hs - 30, Math.max(u, c.u1)), av0, v0 - 3);
      this.blocks.push({ id: `${this.id}:apron`, pads: [{ ...ap, band: 'lot' }], ...ap, lots: [] });
      this.apronR = ap; this.clear(ap, 2);
      // A taxiway from the apron to the runway's end.
      // Dead aircraft parked on the apron; the Sun Court's field is the boneyard, rows of them past the runway.
      const yardN = this.id === 'davis_monthan' ? 16 : 0;
      for (let i = 0; i < 3; i++) { const pu = c.u0 + 30 + i * 46, pv = av0 + R.apron / 2; if (pu < hs - 40) this.aircraft(this.wx(pu, pv), this.wz(pu, pv), rng, i === 1); }
      const rows = Math.max(0, Math.floor((this.side - 30 - (v1 + 30)) / 40));
      for (let i = 0; i < yardN && rows > 0; i++) {
        const row = i % rows, per = Math.ceil(yardN / rows), col = Math.floor(i / rows), uu = -hs + 50 + col * ((this.side - 100) / per), vv = v1 + 34 + row * 40;
        this.aircraft(this.wx(uu, vv), this.wz(uu, vv), rng, rng() < 0.35);
      }
    } else if (f === 'helipad') {
      const p = this.spot(16, 16, c.u1 + 20, c.v0 + 20); if (!p) return;
      const x = this.wx(p.u, p.v), z = this.wz(p.u, p.v);
      this.P('floors', x, 0.04, z, 14, 0.03, 14, '#8f8a7d'); this.P('floors', x, 0.05, z, 1.0, 0.01, 7, '#e2dccb'); this.P('floors', x - 2.4, 0.05, z, 0.8, 0.01, 6, '#e2dccb'); this.P('floors', x + 2.4, 0.05, z, 0.8, 0.01, 6, '#e2dccb');
      this.clear({ x0: x - 8, z0: z - 8, x1: x + 8, z1: z + 8 });
      const q = this.spot(10, 10, p.u + 14, p.v); if (q) this.heliWreck(this.wx(q.u, q.v), this.wz(q.u, q.v), rng);
    } else if (f === 'fuelfarm') {
      // Tanks inside an earth berm, the floodlight over them.
      const p = this.spot(34, 28, c.u0 - 30, c.v0 + 30); if (!p) return;
      const x = this.wx(p.u, p.v), z = this.wz(p.u, p.v);
      for (const [a, b] of [[-7, -5], [7, -5], [-7, 6], [7, 6]]) { this.P('barrels', x + a, 2.3, z + b, 9, 4.6, 9, rng.pick(['#8a8676', '#7c7a64', '#9a9484'])); this.boxC(x + a, z + b, 8.4, 8.4, 4.6, 'tank'); }
      for (const [a, b, w, d] of [[0, -11.5, 30, 1.4], [0, 12.5, 30, 1.4], [-15.5, 0.5, 1.4, 24], [15.5, 0.5, 1.4, 24]]) this.P('props', x + a, 0.6, z + b, w, 1.2, d, '#a08a6a');
      this.clear({ x0: x - 17, z0: z - 14, x1: x + 17, z1: z + 14 });
      this.floods.push({ x: x + 16, z: z - 12, r: 11 });
      this.P('props', x + 16, 3.75, z - 12, 0.18, 7.5, 0.18, '#4a4a44'); this.P('props', x + 16, 7.5, z - 12, 1.6, 0.4, 0.5, '#2e2e2a');
    } else if (f === 'parade') {
      const p = this.spot(54, 46, c.u1 + 40, c.v0 + 40); if (!p) return;
      const pr = this.rect(p.u - 27, p.u + 27, p.v - 23, p.v + 23);
      this.blocks.push({ id: `${this.id}:parade`, pads: [{ ...pr, band: 'lot' }], ...pr, lots: [] });
      this.clear(pr, 2);
      const fx = (pr.x0 + pr.x1) / 2, fz = (pr.z0 + pr.z1) / 2;
      this.P('props', fx, 4.5, fz, 0.14, 9, 0.14, '#c8c4b8'); this.boxC(fx, fz, 0.6, 0.6, 9, 'flagpole');
      this.P('props', fx + 1.0, 8.2, fz, 2.0, 1.05, 0.03, this.H.flag === 'US' ? '#9a2a2a' : this.H === MIL_HOLDS.raider ? '#8a2e22' : '#c9902e');
      if (this.H.flag === 'US') this.P('props', fx + 0.48, 8.47, fz + 0.01, 0.8, 0.55, 0.035, '#2f3a5e');
      this.paradeR = pr;
      this.floods.push({ x: pr.x0 + 2, z: pr.z0 + 2, r: 12 });
      this.P('props', pr.x0 + 2, 3.75, pr.z0 + 2, 0.18, 7.5, 0.18, '#4a4a44'); this.P('props', pr.x0 + 2, 7.5, pr.z0 + 2, 1.6, 0.4, 0.5, '#2e2e2a');
    } else if (f === 'motoryard') {
      const p = this.spot(56, 44, c.u0 - 40, c.v1 - 20); if (!p) return;
      const mr = this.rect(p.u - 28, p.u + 28, p.v - 22, p.v + 22);
      this.blocks.push({ id: `${this.id}:motoryard`, pads: [{ ...mr, band: 'lot' }], ...mr, lots: [] });
      this.clear(mr, 2);
      for (let i = 0; i < 3; i++) this.hulk(this.wx(p.u - 18 + i * 12, p.v + 12), this.wz(p.u - 18 + i * 12, p.v + 12), rng, i === 1 ? 'tank' : 'truck');
      this.motorYard = mr;
      this.parking.push({ x: this.wx(p.u - 12, p.v - 8), z: this.wz(p.u - 12, p.v - 8), h: Math.atan2(this.nx, this.nz) }, { x: this.wx(p.u + 6, p.v - 8), z: this.wz(p.u + 6, p.v - 8), h: Math.atan2(this.nx, this.nz) });
    } else if (f === 'range') {
      // A firing range: a firing line of sandbags, target frames, a berm behind them.
      const p = this.spot(64, 86, c.u1 + 60, c.v0 + 60); if (!p) return;
      const u = p.u - 26, v = p.v - 38;
      for (let i = 0; i < 6; i++) { const x = this.wx(u + i * 9, v), z = this.wz(u + i * 9, v); this.P('props', x, 0.5, z, 1.4, 1.0, 1.4, '#8a7c5a'); this.boxC(x, z, 1.4, 1.4, 1.0, 'sandbags'); }
      for (let i = 0; i < 6; i++) { const x = this.wx(u + i * 9, v + 60), z = this.wz(u + i * 9, v + 60); this.targetFrame(x, z); }
      const bx = this.wx(u + 22, v + 74), bz = this.wz(u + 22, v + 74);
      this.P('props', bx, 1.6, bz, this.tx ? 64 : 4, 3.2, this.tz ? 64 : 4, '#a08a6a'); this.boxC(bx, bz, this.tx ? 64 : 4, this.tz ? 64 : 4, 3.2, 'berm');
      this.clear(this.rect(p.u - 32, p.u + 32, p.v - 43, p.v + 43));
    } else if (f === 'silos') {
      // Silo pads in the open ground, each in its own little fence.
      const n = Math.min(6, Math.max(2, Math.floor(this.side / 450)));
      for (let i = 0; i < n; i++) {
        const p = this.spot(26, 26, -hs + (this.side * (i + 0.5)) / n, this.side * (0.45 + 0.25 * (i % 2)), 30); if (!p) continue;
        this.silo(this.wx(p.u, p.v), this.wz(p.u, p.v), rng, i === 0);
      }
    } else if (f === 'gantry' || f === 'launchpad') {
      // A launch pad: the concrete apron, the flame trench, the service gantry, something tall under tarps; the blockhouse.
      const p = this.spot(50, 50, 0, Math.min(this.side * 0.6, c.v1 + 120), 20); if (!p) return;
      const x = this.wx(p.u, p.v), z = this.wz(p.u, p.v);
      this.P('floors', x, 0.05, z, 46, 0.06, 46, '#9a978e'); this.P('floors', x, 0.06, z + 12, 8, 0.02, 20, '#2a2826');
      this.clear({ x0: x - 24, z0: z - 24, x1: x + 24, z1: z + 24 });
      for (let y = 0; y < 30; y += 5) for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.P('props', x + 7 + a * 2.2, y + 2.5, z + b * 2.2, 0.3, 5, 0.3, '#a3392a');
      for (let y = 5; y < 30; y += 5) this.P('props', x + 7, y, z, 4.8, 0.25, 4.8, '#8a2e22');
      this.boxC(x + 7, z, 5, 5, 30, 'gantry');
      this.P('barrels', x, 14, z, 4.2, 28, 4.2, f === 'launchpad' ? '#d8d2c2' : '#cfcabb');
      this.P('barrels', x, 29, z, 3.0, 2.4, 3.0, '#a8a296'); this.P('barrels', x, 31, z, 1.6, 1.8, 1.6, '#8a2e22');
      this.P('props', x, 10, z, 4.6, 16, 4.6, '#6a6a4a', 0, 0.9);
      this.boxC(x, z, 4.4, 4.4, 30, 'missile');
      this.padAt = { x, z };
      const q = this.spot(20, 16, p.u - 80, p.v, 10); if (q) this.blockhouse(this.wx(q.u, q.v), this.wz(q.u, q.v), rng);
    } else if (f === 'igloos') {
      // Earth-covered magazines in rows, each door to the track.
      const rows = 3, per = Math.min(8, Math.floor((this.side - 80) / 36));
      for (let r = 0; r < rows; r++) for (let i = 0; i < per; i++) { const p = this.spot(26, 26, -hs + 50 + i * 36, c.v1 + 50 + r * 60, 6, i === 0); if (p) this.igloo(this.wx(p.u, p.v), this.wz(p.u, p.v), rng); }
    } else if (f === 'mocktown') {
      // The mock town: a grid of small walk-in shells (doors, windows, nothing inside but what the drills left).
      const p = this.spot(132, 124, 0, c.v1 + 110, 10); if (!p) return;
      const u0 = p.u - 60, v0 = p.v - 56;
      let k = 200;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const kind = (i + j) % 3 === 0 ? 'mockhall' : 'mockhouse', K = KINDS[kind], w = rng.range(K.w[0], K.w[1]), d = rng.range(K.d[0], K.d[1]);
        const r = this.rect(u0 + i * 42, u0 + i * 42 + w, v0 + j * 38, v0 + j * 38 + d);
        for (const q of ['x0', 'x1', 'z0', 'z1']) r[q] = Math.round(r[q] * 2) / 2;
        this.addLot(kind, r, sideOf(this.nx, this.nz), rng, k++);
      }
      const tr = this.rect(p.u - 66, p.u + 66, p.v - 62, p.v + 62);
      this.blocks.push({ id: `${this.id}:mocktown`, pads: [{ ...tr, band: 'yard' }], ...tr, lots: [] });
      this.clear(tr, 4);
      this.mockR = tr;
    } else if (f === 'domes') {
      for (const [r, du] of [[11, 0], [8, 30]]) {
        const p = this.spot(r * 2 + 4, r * 2 + 4, c.u1 + 30 + du, c.v1 + 30, 6); if (!p) continue;
        const x = this.wx(p.u, p.v), z = this.wz(p.u, p.v);
        for (let t = 0; t < 4; t++) this.P('barrels', x, 0.9 + t * 1.9, z, r * 2 * Math.cos(t * 0.38), 1.9, r * 2 * Math.cos(t * 0.38), '#e0dbcd');
        this.boxC(x, z, r * 1.6, r * 1.6, 7.5, 'dome');
        this.clear({ x0: x - r - 2, z0: z - r - 2, x1: x + r + 2, z1: z + r + 2 });
      }
    } else if (f === 'antennas') {
      const p = this.spot(26, 26, c.u0 - 30, c.v1 + 20); if (!p) return;
      const x = this.wx(p.u, p.v) - 9, z = this.wz(p.u, p.v) - 9;
      for (let i = 0; i < 4; i++) { const ax = x + (i % 2) * 18, az = z + (i >> 1) * 18; this.P('props', ax, 9, az, 0.5, 18, 0.5, '#4a4a44'); this.P('props', ax, 18, az, 6, 0.2, 0.2, '#2a2a28'); this.boxC(ax, az, 1, 1, 18, 'mast'); }
      this.clear({ x0: x - 4, z0: z - 4, x1: x + 22, z1: z + 22 });
    } else if (f === 'piers' || f === 'cranes') {
      // A naval station's piers run out from the far side, cranes on them (no naval base streams yet: the template is
      // ready for the day its region comes).
      if (f === 'piers') for (let i = 0; i < 3; i++) { const u = -hs + 60 + i * 50, x = this.wx(u, this.side - 60), z = this.wz(u, this.side - 60); this.P('props', x, 0.6, z, this.tx ? 12 : 90, 1.2, this.tz ? 12 : 90, '#8a857c'); this.boxC(x, z, this.tx ? 12 : 90, this.tz ? 12 : 90, 1.2, 'pier'); }
      else for (let i = 0; i < 2; i++) { const u = -hs + 60 + i * 100, x = this.wx(u, this.side - 90), z = this.wz(u, this.side - 90); this.P('props', x, 12, z, 2, 24, 2, '#c9a640'); this.P('props', x + 8, 24, z, 20, 1.4, 1.4, '#c9a640'); this.boxC(x, z, 3, 3, 24, 'crane'); }
    }
  }

  // Gravel tracks from the main street's inner end out to every feature on the open ground: a trunk inward, a branch along
  // the gate side to each (packed gravel, two ruts), kept clear of brush.
  tracks() {
    const c = this.canton, g0 = this.gateU, w = 5;
    const pts = this.fpts.filter((p) => p.v > c.v1 + 4 || Math.abs(p.u - g0) > (c.u1 - c.u0) / 2 + 10);
    if (!pts.length) return;
    const seg = (u0, v0, u1, v1) => {
      const along = Math.abs(u1 - u0) > Math.abs(v1 - v0) ? 'u' : 'v', L = along === 'u' ? Math.abs(u1 - u0) : Math.abs(v1 - v0);
      for (let a = 0; a < L - 0.5; a += 48) {
        const b = Math.min(L, a + 48), m = (a + b) / 2;
        const u = along === 'u' ? Math.min(u0, u1) + m : u0, v = along === 'v' ? Math.min(v0, v1) + m : v0;
        const r = along === 'u' ? this.rect(u - (b - a) / 2, u + (b - a) / 2, v - w / 2, v + w / 2) : this.rect(u - w / 2, u + w / 2, v - (b - a) / 2, v + (b - a) / 2);
        const x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2, sx = r.x1 - r.x0, sz = r.z1 - r.z0;
        this.P('props', x, 0.02, z, sx, 0.025, sz, '#a08a68', 0, 0.92);
        const rx = sx > sz, off = 1.1;
        for (const s of [-1, 1]) this.P('props', x + (rx ? 0 : s * off), 0.035, z + (rx ? s * off : 0), rx ? sx : 0.45, 0.01, rx ? 0.45 : sz, '#86714f', 0, 0.9);
        this.keepClear.push({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 });
      }
    };
    const vMax = Math.max(...pts.map((p) => p.v));
    if (vMax > c.v1) seg(g0, c.v1, g0, vMax);
    for (const p of pts) {
      const v = Math.max(c.v1, Math.min(p.v, vMax)), du = p.u - g0, edge = Math.sign(du) * Math.max(0, Math.abs(du) - p.w / 2);
      if (Math.abs(edge) > 3) seg(g0, v, g0 + edge, v);
    }
  }
  // A dead aircraft: a fuselage, wings, a tail, engines, sitting on its belly or burned out (rot along the gate side).
  aircraft(x, z, rng, burnt) {
    const rot = (this.tx ? 0 : Math.PI / 2) + rng.range(-0.25, 0.25), body = burnt ? '#3a3834' : rng.pick(['#8a8e88', '#9a9a8e', '#6c7064', '#5e6352']);
    const big = rng() < 0.5, L = big ? 30 : 17, wsp = big ? 34 : 12;
    const fx = Math.sin(rot), fz = Math.cos(rot);
    this.P('props', x, big ? 2.4 : 1.4, z, big ? 4.2 : 2.2, big ? 4 : 2.2, L, body, rot);
    this.P('props', x, big ? 3.2 : 1.6, z, wsp, 0.35, big ? 6 : 3.4, body, rot, 0.92);
    this.P('props', x - fx * L * 0.42, big ? 6.5 : 3.2, z - fz * L * 0.42, 0.4, big ? 6 : 3, big ? 4.5 : 2.5, body, rot, 0.9);
    this.P('props', x - fx * L * 0.44, big ? 3.4 : 1.8, z - fz * L * 0.44, big ? 12 : 5, 0.25, big ? 3 : 1.8, body, rot, 0.88);
    if (big) for (const s of [-1, 1]) for (const e of [0.35, 0.7]) this.P('barrels', x + Math.cos(rot) * s * wsp * e * 0.5 + fx * 2, 2.4, z - Math.sin(rot) * s * wsp * e * 0.5 + fz * 2, 1.8, 2.6, 1.8, '#3a3a36');
    if (burnt) this.P('floors', x, 0.03, z, L * 0.8, 0.02, L * 0.8, '#2a241e', rot);
    this.box(x - Math.max(Math.abs(fx) * L, Math.abs(fz) * (big ? 4.4 : 2.4)) / 2 - 0.5, z - Math.max(Math.abs(fz) * L, Math.abs(fx) * (big ? 4.4 : 2.4)) / 2 - 0.5,
      x + Math.max(Math.abs(fx) * L, Math.abs(fz) * (big ? 4.4 : 2.4)) / 2 + 0.5, z + Math.max(Math.abs(fz) * L, Math.abs(fx) * (big ? 4.4 : 2.4)) / 2 + 0.5, big ? 4.4 : 2.4, 'aircraft');
    this.clear({ x0: x - wsp / 2 - 2, z0: z - wsp / 2 - 2, x1: x + wsp / 2 + 2, z1: z + wsp / 2 + 2 });
  }
  heliWreck(x, z, rng) {
    const r = rng.range(0, 3);
    this.P('floors', x, 0.03, z, 9, 0.02, 9, '#2a241e');
    this.P('props', x, 1.1, z, 2.0, 2.0, 7.5, '#4f5339', r); this.P('props', x - Math.sin(r) * 6, 0.6, z - Math.cos(r) * 6, 0.6, 0.8, 5, '#454935', r + 0.5);
    this.P('props', x + 1.5, 0.15, z + 1, 0.3, 0.06, 7.5, '#252522', r + 1.2);
    this.boxC(x, z, 3.2, 5.4, 2.0, 'wreck');
  }
  hulk(x, z, rng, kind = 'tank') {
    const r = rng.range(0, Math.PI * 2), c = rng.pick(['#4f5339', '#5a5a44', '#3d3a32', '#6a5a3a']);
    if (kind === 'tank') {
      this.P('props', x, 1.0, z, 3.4, 1.4, 7.0, c, r); this.P('props', x, 2.1, z, 2.4, 0.9, 3.0, c, r + rng.range(-0.6, 0.6), 0.9);
      this.P('props', x + Math.sin(r + 0.3) * 3.4, 2.15, z + Math.cos(r + 0.3) * 3.4, 0.25, 0.25, 4.5, '#2a2a26', r + 0.3);
      for (const s of [-1, 1]) this.P('props', x + Math.cos(r) * s * 1.8, 0.55, z - Math.sin(r) * s * 1.8, 0.7, 1.1, 7.2, '#2b2826', r);
      this.boxC(x, z, 4.6, 4.6, 2.4, 'hulk');
    } else {
      this.P('props', x, 1.0, z, 2.5, 1.6, 7.5, c, r); this.P('props', x + Math.sin(r) * 2.6, 1.6, z + Math.cos(r) * 2.6, 2.4, 1.4, 2.2, '#2e2c28', r);
      this.boxC(x, z, 4.0, 4.0, 2.2, 'wreck');
    }
    this.P('floors', x, 0.025, z, 9, 0.02, 9, '#3a3128', r);
  }
  targetFrame(x, z) {
    this.P('props', x, 1.0, z, 1.2, 1.4, 0.08, '#d8cfb8'); this.P('props', x, 1.05, z, 0.5, 0.6, 0.09, '#2a2826');
    for (const s of [-0.5, 0.5]) this.P('props', x + s, 0.4, z, 0.08, 0.8, 0.08, '#5a4632');
  }
  silo(x, z, rng, first) {
    this.P('floors', x, 0.06, z, 22, 0.1, 22, '#9a978e');
    this.P('barrels', x, 0.3, z, 7.5, 0.5, 7.5, '#6a6c66'); this.P('barrels', x, 0.58, z, 6.8, 0.08, 6.8, '#4a4c48');
    this.P('props', x + 7, 0.9, z + 7, 1.6, 1.8, 1.6, '#7a7a72'); this.boxC(x + 7, z + 7, 1.6, 1.6, 1.8, 'vent');
    for (const [a, b, w, d] of [[0, -12, 24, 0.06], [0, 12, 24, 0.06], [-12, 0, 0.06, 24], [12, 0, 0.06, 24]]) this.P('walls', x + a, 1.2, z + b, w, 2.3, d, '#8c8e86', 0, 0.82);
    this.clear({ x0: x - 13, z0: z - 13, x1: x + 13, z1: z + 13 });
    if (first) this.siloAt ??= { x, z };
  }
  blockhouse(x, z, rng) {
    this.P('props', x, 2.2, z, 16, 4.4, 12, '#8a877e'); this.P('props', x, 4.6, z, 18, 0.8, 14, '#77746c');
    this.P('props', x, 2.6, z + 6.05, 10, 0.5, 0.1, '#1e1e1c'); // the slit
    this.boxC(x, z, 16, 12, 4.4, 'bunker');
    this.clear({ x0: x - 10, z0: z - 8, x1: x + 10, z1: z + 8 });
  }
  igloo(x, z, rng) {
    const al = this.tx ? 'z' : 'x', L = 22, Wd = 12;
    for (let t = 0; t < 3; t++) this.P('props', x, 0.8 + t * 1.3, z, al === 'x' ? L : Wd - t * 3.5, 1.4, al === 'x' ? Wd - t * 3.5 : L, rng.pick(['#9a8a6a', '#8e7e5e', '#a39272']));
    this.P('props', x + (al === 'x' ? -L / 2 : 0), 2.0, z + (al === 'x' ? 0 : -L / 2), al === 'x' ? 0.6 : Wd, 4, al === 'x' ? Wd : 0.6, '#8a877e');
    this.P('props', x + (al === 'x' ? -L / 2 - 0.35 : 0), 1.4, z + (al === 'x' ? 0 : -L / 2 - 0.35), al === 'x' ? 0.1 : 3, 2.8, al === 'x' ? 3 : 0.1, '#4a4c46');
    this.box(x - (al === 'x' ? L / 2 : Wd / 2), z - (al === 'x' ? Wd / 2 : L / 2), x + (al === 'x' ? L / 2 : Wd / 2), z + (al === 'x' ? Wd / 2 : L / 2), 4, 'bunker');
    this.clear({ x0: x - 14, z0: z - 14, x1: x + 14, z1: z + 14 });
  }

  // ---- the rail: the Iron Line run on north to the base, a locked yard, a cargo train waiting in it ----------------------
  railYard(rng) {
    const R = MIL_RULES, RX = -360, H = R.fenceH, ring = this.W.ring;
    // Where the ring's dead track fades out (world/ring.js railIn), the spur takes over.
    let zEdge = -1300;
    if (ring) { while (zEdge > this.z1 && ring.inCity(RX, zEdge, 40)) zEdge -= 4; }
    const zIn = this.z1, yardZ0 = this.z1 - 190, yardX0 = RX - 40, yardX1 = RX + 44;
    this.spur = { x: RX, z0: yardZ0 + 6, z1: zEdge };
    const track = (z0, z1) => {
      const len = z1 - z0, zc = (z0 + z1) / 2;
      this.P('props', RX, 0.08, zc, 3.6, 0.16, len, '#5c534a');
      for (const g of [-0.8, 0.8]) this.P('props', RX + g, 0.24, zc, 0.12, 0.14, len, '#6a5e52');
      for (let z = Math.ceil(z0 / 2.6) * 2.6; z < z1; z += 2.6) this.P('props', RX, 0.15, z, 2.5, 0.1, 0.26, '#4a3c2e');
    };
    // The spur from the ring's edge to the wire (in pieces a chunk long, so a chunk draws what crosses it).
    for (let z = zIn; z < zEdge; z += 128) track(z, Math.min(zEdge, z + 128));
    for (let z = yardZ0 + 6; z < zIn; z += 64) track(z, Math.min(zIn, z + 64));
    // A siding inside the yard.
    for (let z = yardZ0 + 20; z < zIn - 20; z += 60) { const len = Math.min(60, zIn - 20 - z), zc = z + len / 2; this.P('props', RX + 9, 0.08, zc, 3.6, 0.16, len, '#5c534a'); for (const g of [-0.8, 0.8]) this.P('props', RX + 9 + g, 0.24, zc, 0.12, 0.14, len, '#6a5e52'); }
    // The rail gate in the wire: heavy posts and a closed chain-link leaf over the track (the wire's run is solid there).
    for (const s of [-1, 1]) this.P('props', RX + s * 3.4, (H + 0.8) / 2, zIn, 0.4, H + 0.8, 0.4, '#4a4c46');
    this.P('props', RX, H + 0.6, zIn, 7, 0.25, 0.25, '#4a4c46');
    // The yard: its own fence on the two sides inside the base (north, east), the yard gate (a locked double steel gate:
    // a door row systems/interiors.js hangs) facing the core.
    const gate = { x: yardX1, z: (yardZ0 + zIn) / 2 + 30, w: 5.2 };
    const run = (x0, z0, x1, z1) => {
      const horiz = z0 === z1, a = horiz ? x0 : z0, b = horiz ? x1 : z1, t = 0.15, len = b - a;
      const bx = horiz ? this.box(a, z0 - t, b, z0 + t, H + R.wire, 'wire') : this.box(x0 - t, a, x0 + t, b, H + R.wire, 'wire');
      bx.holes = [a - 0.01, b + 0.01]; bx.holeX = horiz; bx.sill = H;
      const n = Math.max(1, Math.round(len / R.panel));
      for (let k = 0; k <= n; k++) { const s = a + (len * k) / n; this.P('props', horiz ? s : x0, (H + R.wire) / 2, horiz ? z0 : s, 0.1, H + R.wire, 0.1, '#5d5f5a'); }
      this.P('walls', horiz ? (a + b) / 2 : x0, H / 2, horiz ? z0 : (a + b) / 2, horiz ? len : 0.04, H - 0.1, horiz ? 0.04 : len, '#8c8e86', 0, 0.82);
      this.P('props', horiz ? (a + b) / 2 : x0, H + 0.36, horiz ? z0 : (a + b) / 2, horiz ? len : 0.34, 0.3, horiz ? 0.34 : len, '#b4b4aa', 0, 0.9);
    };
    run(this.x0, yardZ0, yardX1, yardZ0);
    run(yardX1, yardZ0, yardX1, gate.z - gate.w / 2);
    run(yardX1, gate.z + gate.w / 2, yardX1, zIn);
    for (const s of [-1, 1]) { this.P('props', gate.x, (H + 0.6) / 2, gate.z + s * gate.w / 2, 0.34, H + 0.6, 0.34, '#4a4c46'); this.boxC(gate.x, gate.z + s * (gate.w / 2 + 0.2), 0.4, 0.4, H + 0.6, 'post'); }
    this.P('props', gate.x - 0.6, 0.02, gate.z, 1.2, 0.04, gate.w, '#3c3e38'); // the gate's sill rail
    this.yard = { x0: this.x0, x1: yardX1, z0: yardZ0, z1: zIn, gate };
    // The yard's ground: cinders between the tracks (a band down the middle), the rest bare.
    this.P('props', RX + 4.5, 0.025, (yardZ0 + zIn) / 2, 22, 0.03, zIn - yardZ0 - 4, '#5a524a', 0, 0.9);
    this.clear(this.yard, 2);
    // The yard as a "lot" with one door (the gate) and the train's boxcars as its containers (registered while hot).
    const train = [], cars = [{ k: 'loco', len: 14, c: '#5a2a1a' }, { k: 'box', len: 12, c: '#5c6142' }, { k: 'box', len: 12, c: '#6a4a2e' }, { k: 'flat', len: 12, c: '#4a4440' }, { k: 'box', len: 12, c: '#5c6142' }];
    let zc = zIn - 26;
    const L = { id: `mb:${this.id}.yard`, kind: 'yardgate', zone: 'military', front: 'E', x0: gate.x - 0.4, x1: gate.x + 0.4, z0: gate.z - gate.w / 2, z1: gate.z + gate.w / 2,
      lot: { x0: gate.x - 1, x1: gate.x + 1, z0: gate.z - gate.w / 2 - 1, z1: gate.z + gate.w / 2 + 1 }, cx: gate.x, cz: gate.z, seed: rng.int(0, 2147483647), ruined: false, noYard: true, base: this.id, programme: 'RAIL YARD', yard: true };
    const g = (L.geo = { walls: [], boxes: [], floor: [gate.x, 0.02, gate.z, 0.2, 0.02, 0.2, '#3c3e38'], roof: [], props: [], decor: [], boxesIn: [], beds: [], doors: [], rooms: [], canopy: [], trunks: [], crowns: [], flora: [], windows: [], innerDoors: [], stay: [], inner: [], plan: null });
    g.doors.push({ x: gate.x, z: gate.z, nx: 1, nz: 0, w: gate.w, kind: 'front', locked: true, material: 'metal', leaves: 2, yard: true });
    for (const car of cars) {
      const cz = zc - car.len / 2, h = car.k === 'flat' ? 1.4 : car.k === 'loco' ? 4.2 : 3.9;
      g.props.push([RX, h / 2 + 0.3, cz, 3.0, h, car.len, car.c, 0, 1]);
      if (car.k === 'box') g.props.push([RX, h + 0.35, cz, 2.8, 0.1, car.len - 0.2, '#3e3a32', 0, 1]);
      if (car.k === 'loco') { g.props.push([RX, h + 0.5, cz + 3, 2.4, 0.9, 5, '#3a2a1a', 0, 1]); g.props.push([RX, 2.4, cz + car.len / 2 - 0.4, 2.6, 1.4, 0.2, '#1e1e1c', 0, 1]); }
      if (car.k === 'flat') for (let i = 0; i < 2; i++) g.props.push([RX, 1.75 + 0.45, cz - 3 + i * 6, 2.4, 0.9, 4.4, '#565c3e', 0, 1]); // crates lashed down
      g.boxes.push({ x0: RX - 1.5, z0: cz - car.len / 2, x1: RX + 1.5, z1: cz + car.len / 2, h: h + 0.3, tag: 'boxcar', holes: null });
      // The cargo: each boxcar and the flat's crates are searchable (their side door, east).
      if (car.k !== 'loco') { const id = `ring:${Math.round((RX + 1.9) * 10)}:${Math.round(cz * 10)}`; g.boxesIn.push({ id, x: RX + 1.9, z: cz, table: car.k === 'flat' ? 'military' : 'gunsmith', cap: 80, label: car.k === 'flat' ? 'LASHED CRATES · CARGO TRAIN' : 'BOXCAR · CARGO TRAIN' }); }
      train.push({ kind: car.k, x: RX, z: cz, len: car.len });
      zc -= car.len + 1.4;
    }
    this.train = train;
    this.lots.push(L);
  }

  // ---- the way down (the underground system attaches its levels here) ------------------------------------------------------
  down() {
    const D = this.B.down;
    if (!D) return;
    const L = this.lotOf(D.at) ?? this.lotOf('hq') ?? this.lots[0];
    if (!L) return;
    // On a pad beside the building, away from the street: a steel hatch, or a lift's cage and its machine house.
    const away = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] }[L.front];
    const ax = (L.x0 + L.x1) / 2 + away[0] * ((L.x1 - L.x0) / 2 + 7), az = (L.z0 + L.z1) / 2 + away[1] * ((L.z1 - L.z0) / 2 + 7);
    const x = Math.round(ax) + 0.5, z = Math.round(az) + 0.5;
    this.P('floors', x, 0.05, z, 7, 0.08, 7, '#8f8a7d');
    if (D.kind === 'lift') {
      this.P('props', x, 1.6, z, 3.6, 3.2, 0.12, '#4a4c46'); this.P('props', x - 1.8, 1.6, z + 1.8, 0.12, 3.2, 3.6, '#4a4c46'); this.P('props', x + 1.8, 1.6, z + 1.8, 0.12, 3.2, 3.6, '#4a4c46');
      this.P('props', x, 3.3, z + 1.8, 4.2, 0.25, 4.2, '#55594a'); this.P('props', x, 0.04, z + 1.8, 3.4, 0.06, 3.4, '#2f2f2b');
      this.P('props', x + 3.2, 1.1, z - 0.6, 1.6, 2.2, 1.6, '#5a5c54'); this.boxC(x + 3.2, z - 0.6, 1.6, 1.6, 2.2, 'generator');
    } else {
      this.P('props', x, 0.12, z, 2.4, 0.24, 2.4, '#5a5c54'); this.P('barrels', x, 0.32, z, 1.4, 0.16, 1.4, '#3a3c36'); this.P('props', x, 0.42, z, 1.2, 0.06, 0.12, '#a3392a');
    }
    this.clear({ x0: x - 5, z0: z - 5, x1: x + 5, z1: z + 5 });
    this.hook = { id: `${this.id}:${D.kind}`, base: this.id, kind: D.kind, x, z, levels: D.levels, building: L.id, programme: L.programme, project: this.B.project?.name ?? null, region: this.region };
  }

  // ---- the war's wreckage, one 64 m cell at a time on the open ground -----------------------------------------------------
  wreckage() {
    const cell = MIL_RULES.scatterCell, S = this.T.scatter, n = Math.floor(this.side / cell);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = this.x0 + (i + 0.5) * cell, z = this.z0 + (j + 0.5) * cell;
      const r = rngOf(hash32(this.seed, i, j, 0x57524b));
      let p = r(), pick = null;
      for (const [f, ch] of S) { if ((p -= ch) < 0) { pick = f; break; } }
      if (!pick) continue;
      const px = x + r.range(-cell / 3, cell / 3), pz = z + r.range(-cell / 3, cell / 3);
      if (this.keepClear.some((q) => px > q.x0 - 14 && px < q.x1 + 14 && pz > q.z0 - 14 && pz < q.z1 + 14) || !this.inBase(px, pz, -14)) continue;
      if (this.region !== 'arizona' && this.wet(px, pz)) continue;
      if (pick === 'crater') { const rr = r.range(2.5, 6); this.P('floors', px, 0.03, pz, rr * 2, 0.02, rr * 2, '#3a3128', r.range(0, 3)); this.P('floors', px, 0.035, pz, rr, 0.02, rr, '#2a241e', r.range(0, 3)); }
      else if (pick === 'hulk') this.hulk(px, pz, r, r() < 0.6 ? 'tank' : 'truck');
      else if (pick === 'wreckplane') this.aircraft(px, pz, r, true);
      else if (pick === 'bunker') { this.P('props', px, 1.1, pz, 6, 2.2, 5, '#8a877e'); this.P('props', px, 1.4, pz + 2.55, 4, 0.35, 0.1, '#1e1e1c'); this.boxC(px, pz, 6, 5, 2.2, 'bunker'); }
      else if (pick === 'trench') { for (let k = 0; k < 5; k++) { this.P('props', px - 6 + k * 3, 0.35, pz, 2.6, 0.7, 1.0, '#8a7c5a'); } this.box(px - 7.5, pz - 0.5, px + 7.5, pz + 0.5, 0.7, 'sandbags'); }
      else if (pick === 'target') this.targetFrame(px, pz);
      else if (pick === 'silo') this.silo(px, pz, r, false);
      else if (pick === 'igloo') this.igloo(px, pz, r);
    }
  }

  // ---- what chunks ask ------------------------------------------------------------------------------------------------------
  streets(x0, z0, x1, z1) {
    this.ensure();
    const out = [];
    for (const s of this.streetList) {
      if (s.x1 < x0 - 12 || s.x0 > x1 + 12 || s.z1 < z0 - 12 || s.z0 > z1 + 12) continue;
      const a0 = s.axis === 'x' ? s.x0 : s.z0, a1 = s.axis === 'x' ? s.x1 : s.z1, q0 = s.axis === 'x' ? x0 : z0, q1 = s.axis === 'x' ? x1 : z1;
      out.push({ ...s, open0: a0 < q0, open1: a1 > q1 });
    }
    return out;
  }
  blocksOver(x0, z0, x1, z1, fn) { this.ensure(); for (const b of this.blocks) if (b.x1 > x0 && b.x0 < x1 && b.z1 > z0 && b.z0 < z1) fn(b); }
  pads(b) { return b.pads ?? []; }
  owned(cx, cz) {
    const ox = cx * C, oz = cz * C, key = `${cx},${cz}`;
    const o = this.lots.filter((L) => L.cx >= ox && L.cx < ox + C && L.cz >= oz && L.cz < oz + C);
    for (const L of o) L.owner = key;
    return o;
  }
  around(cx, cz, m = 4) {
    this.ensure();
    const ox = cx * C, oz = cz * C, X1 = ox + C, Z1 = oz + C, mine = this.owned(cx, cz), near = [];
    for (const L of this.lots) {
      if (mine.includes(L)) continue;
      if (L.lot.x1 > ox - m && L.lot.x0 < X1 + m && L.lot.z1 > oz - m && L.lot.z0 < Z1 + m) { L.owner ??= `${chunkOf(L.cx)},${chunkOf(L.cz)}`; near.push(L); }
    }
    return { mine, near };
  }
  // A building's shell through the ring's own generator; the base's own rules on top (cached with it): the armory's
  // front door locked steel, the containers' tables by holder (an abandoned base was picked over) and the records that
  // hold the project's logs.
  geo(L) {
    if (L.yard) return L.geo;
    const had = !!L.geo, g = this.W.ring.geo(L);
    if (!had) {
      if (L.lock) for (const d of g.doors) { d.material = 'metal'; d.locked = d.kind === 'front' || d.kind === 'bay'; }
      const loot = this.H.loot;
      for (const q of g.boxesIn) { if (loot) q.table = loot; if (q.label.startsWith(MIL_RULES.logLabel)) q.log = true; }
    }
    return g;
  }
  wrecks() { return []; }
  railIn() { return null; }
  lotById(id) { this.ensure(); return this.lots.find((L) => L.id === id) ?? null; }
  extras(cx, cz) {
    this.ensure();
    const ox = cx * C, oz = cz * C, X1 = ox + C, Z1 = oz + C;
    return {
      items: this.byChunk.get(`${cx},${cz}`) ?? [],
      flora: [],
      boxes: this.boxes.filter((b) => b.x1 > ox - 3 && b.x0 < X1 + 3 && b.z1 > oz - 3 && b.z0 < Z1 + 3),
    };
  }
  nameAt(x, z) {
    if (!this.inBase(x, z, 60) && !this.onRoad(x, z, 8)) return null;
    this.ensure();
    if (this.onRoad(x, z, 2)) return this.streetList.find((s) => s.line.endsWith(':road'))?.name ?? this.name;
    if (!this.inBase(x, z)) return `OUTSIDE ${this.name}`;
    if (this.yard && x > this.yard.x0 && x < this.yard.x1 && z > this.yard.z0 && z < this.yard.z1) return `${this.name} · RAIL YARD`;
    const L = this.lots.find((q) => !q.yard && x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1);
    if (L) return `${this.name} · ${L.programme}`;
    if (this.runwayR && x > this.runwayR.x0 && x < this.runwayR.x1 && z > this.runwayR.z0 && z < this.runwayR.z1) return `${this.name} · THE RUNWAY`;
    if (x > this.cantonW.x0 && x < this.cantonW.x1 && z > this.cantonW.z0 && z < this.cantonW.z1) return `${this.name} · MAIN POST`;
    return `${this.name} · THE RANGE`;
  }
  view() {
    this.ensure();
    const r1 = (v) => Math.round(v * 10) / 10;
    return { id: this.id, name: this.name, template: this.row.template, hold: this.row.hold, region: this.region, centre: [this.cx, this.cz], side: this.side, moved: this.moved,
      fence: { x0: this.x0, z0: this.z0, x1: this.x1, z1: this.z1 }, gate: { side: this.gate, x: r1(this.gateAt.x), z: r1(this.gateAt.z) },
      road: this.roads.map((s) => ({ x0: r1(s.x0), z0: r1(s.z0), x1: r1(s.x1), z1: r1(s.z1) })), roadEnd: this.roadEnd && { x: r1(this.roadEnd.x), z: r1(this.roadEnd.z) }, target: this.target,
      buildings: this.lots.filter((L) => !L.yard).map((L) => ({ id: L.id, kind: L.kind, programme: L.programme, x: r1(L.cx), z: r1(L.cz), front: L.front, ruined: !!L.ruined, locked: !!L.lock })),
      towers: this.towers.length, runway: this.runwayR ?? null, yard: this.yard, train: this.train, hook: this.hook, dropped: this.dropped };
  }
}

export { SIDES };
