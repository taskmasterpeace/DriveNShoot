// FLOOR PLANS (docs/design/WEB_FLOORPLANS.md): a ring building's rooms as a pure function of its footprint, its front,
// its kind and a seed. No three.js, no world state: world/ring.js geo() calls floorplan() and builds what comes back on its
// existing path (walls with doorways, windows, collision, nav).
//
// How a plan is made: each kind has slicing trees (data/floorplans.js PLANS) laid out in the building's own frame (s
// along the front wall from the entry room's end, v from the front wall to the back). A tree is fitted to the footprint:
// every room gets its minimum, the space left over is shared by the rooms' `grow` weights (jittered by the seed), a hall
// is nudged so its centre sits on a 1 m nav cell's centre. Then the doorways: a spanning tree from the entry room, each
// room joined to one neighbour it shares enough wall with, and only to the room types its `via` row allows (a bedroom
// off the hall, never off the kitchen). A tree reaches every room by construction (Robert's BSP rule in his own floor
// plan lab, D:/lsw: one doorway per cut). A tree that does not fit, or cannot be joined up by those rules, is skipped.
//
// NavProbe is the proof the furniture keeps: it rasterises a building's walls and furniture exactly as the foot nav grid
// does (1 m cells on whole metres + 0.5, a box grown by 0.45 m blocks a cell whose centre is inside it, 8 neighbours, no
// corner cutting) and floods from its doors, so geo() can refuse a piece that would seal a pocket or a room off.
import { ROOMS, PLANS, PLAN_RULES } from '../data/floorplans.js';

const EPS = 1e-6;
const snapW = (v) => Math.round(v - 0.5) + 0.5; // the nearest nav cell centre (whole metres + 0.5)
// A small seeded generator of its own (mulberry32), so the plan never draws on anyone else's stream.
export function planRng(seed) {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  return r;
}
// Door centres in [lo, hi] (world) whose gap lets a 1 m nav cell's column through: within w/2 - 0.5 of a cell centre.
export function doorSpots(lo, hi, w) {
  const tol = Math.max(0, w / 2 - 0.5), out = [];
  if (hi < lo) return out;
  for (let p = Math.ceil(lo - tol - 0.5) + 0.5; p <= hi + tol + 1e-9; p += 1) {
    const c = Math.min(hi, Math.max(lo, p));
    if (Math.abs(c - p) <= tol + 1e-9 && !(out.length && Math.abs(out[out.length - 1] - c) < 1e-6)) out.push(c);
  }
  return out;
}
const mix = (a, b) => { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; return (h ^ (h >>> 16)) >>> 0; };

// ---- the trees ------------------------------------------------------------------------------------------------------
const parsed = new Map();
function parse(t) {
  if (typeof t === 'string') { if (!ROOMS[t]) throw new Error(`floorplan: no room type ${t}`); return { room: t, R: ROOMS[t] }; }
  const [split, ...rest] = t;
  const opt = rest[0] && typeof rest[0] === 'object' && !Array.isArray(rest[0]) ? rest.shift() : {};
  return { split: split === 'u' ? 's' : 'v', opt, kids: rest.map(parse) };
}
// stair (the island's buildings that rise, world/storeys.js): every tree gets a STAIR HALL laid beside it, full depth along
// a side wall (['u', 'stair', tree]; 'side') or full width along the back wall (['v', tree, 'stair']; 'back'). The ring
// never asks for one, so its plans are exactly what they were.
export function plansOf(kind, stair = null) {
  if (!PLANS[kind]) return null;
  const key = stair ? `${kind}|${stair}` : kind;
  let p = parsed.get(key);
  if (!p) parsed.set(key, (p = PLANS[kind].map((P) => ({ id: stair ? `${P.id}+stair` : P.id, w: P.w, size: P.size, node: parse(stair === 'side' ? ['u', 'stair', P.tree] : stair === 'back' ? ['v', P.tree, 'stair'] : P.tree) }))));
  return p;
}
const entryOf = (n) => (n.room ? (n.R.entry ? n.room : null) : n.kids.map(entryOf).find(Boolean) ?? null);
// Sizes along `axis` for a node whose parent split along pAxis.
function minOf(n, axis, pAxis, T) {
  if (n.room) return axis === pAxis && n.R.fix ? n.R.fix : n.R.min;
  if (n.split === axis) return n.kids.reduce((s, k) => s + minOf(k, axis, axis, T), 0) + T * (n.kids.length - 1);
  return Math.max(...n.kids.map((k) => minOf(k, axis, n.split, T)));
}
function maxOf(n, axis, pAxis, T) {
  if (n.room) return axis === pAxis && n.R.fix ? n.R.fix : n.R.max ?? Infinity;
  if (n.opt.max && axis !== n.split) return n.opt.max;
  if (n.split === axis) return n.kids.reduce((s, k) => s + maxOf(k, axis, axis, T), 0) + T * (n.kids.length - 1);
  return Math.max(...n.kids.map((k) => maxOf(k, axis, n.split, T)));
}
function growOf(n, axis, pAxis) {
  if (n.room) return axis === pAxis && n.R.fix ? 0 : n.R.grow;
  const g = n.kids.map((k) => growOf(k, axis, n.split));
  return n.split === axis ? g.reduce((s, x) => s + x, 0) : g.reduce((s, x) => s + x, 0) / g.length;
}

// Fit node into the interior rect r = {s0, s1, v0, v1}; leaves into out.rooms, partitions into out.walls (local, interior
// coordinates: a wall's `at` is its centre line). Returns false when it does not fit.
function fit(n, r, pAxis, ctx, out) {
  const T = ctx.T;
  if (n.room) {
    const ws = r.s1 - r.s0, wv = r.v1 - r.v0;
    const need = (axis) => (axis === pAxis && n.R.fix ? n.R.fix : n.R.min) - 0.02;
    if (ws < need('s') || wv < need('v')) return false;
    out.rooms.push({ type: n.room, R: n.R, s0: r.s0, s1: r.s1, v0: r.v0, v1: r.v1 });
    return true;
  }
  const a = n.split, E = a === 's' ? r.s1 - r.s0 : r.v1 - r.v0;
  const k = n.kids.length, mins = n.kids.map((c) => minOf(c, a, a, T)), maxs = n.kids.map((c) => maxOf(c, a, a, T));
  const grows = n.kids.map((c) => growOf(c, a, a) * (1 + (ctx.rng() * 2 - 1) * PLAN_RULES.jitter));
  // Every kid must fit across too (the other axis is the parent's).
  const across = a === 's' ? r.v1 - r.v0 : r.s1 - r.s0, oa = a === 's' ? 'v' : 's';
  if (n.kids.some((c) => minOf(c, oa, a, T) > across + 0.02)) return false;
  const size = mins.slice();
  let extra = E - mins.reduce((s, x) => s + x, 0) - T * (k - 1);
  if (extra < -0.02) return false;
  for (let pass = 0; pass < 6 && extra > 1e-4; pass++) {
    const open = size.map((s, i) => (s < maxs[i] - 1e-6 && grows[i] > 0 ? i : -1)).filter((i) => i >= 0);
    if (!open.length) break;
    const gsum = open.reduce((s, i) => s + grows[i], 0);
    let used = 0;
    for (const i of open) { const add = Math.min(maxs[i] - size[i], (extra * grows[i]) / gsum); size[i] += add; used += add; }
    extra -= used;
  }
  if (extra > 1e-4) { // every room at its max: the roomiest kid takes the rest
    let best = 0; for (let i = 1; i < k; i++) if (grows[i] > grows[best]) best = i;
    if (grows[best] <= 0) best = size.indexOf(Math.max(...size));
    size[best] += extra;
  }
  // A hall's centre on a nav cell centre (in the world), paid for by its neighbours.
  for (let i = 1; i < k - 1; i++) {
    const c = n.kids[i];
    if (!(c.room && c.R.fix)) continue;
    let p = a === 's' ? r.s0 : r.v0;
    for (let q = 0; q < i; q++) p += size[q] + T;
    // The hall's cells are open while their centres sit within tol of its centre line (its walls grown by the walker's
    // 0.45 m): move it the least that brings a nav cell centre inside that, toward the nearer grid line or the other one.
    const w = ctx.toW(a, p + size[i] / 2), dl = snapW(w) - w, tol = size[i] / 2 - 0.45 - 0.04, sg = ctx.sgn(a);
    const shift = (dd) => (Math.abs(dd) <= tol ? 0 : dd - Math.sign(dd) * tol) * sg;
    let ok = false;
    for (const d of [shift(dl), shift(dl - Math.sign(dl || 1))]) {
      if (size[i - 1] + d >= mins[i - 1] - 0.02 && size[i + 1] - d >= mins[i + 1] - 0.02) { size[i - 1] += d; size[i + 1] -= d; ok = true; break; }
    }
    if (!ok) return false;
  }
  let p = a === 's' ? r.s0 : r.v0;
  for (let i = 0; i < k; i++) {
    const kr = a === 's' ? { s0: p, s1: p + size[i], v0: r.v0, v1: r.v1 } : { s0: r.s0, s1: r.s1, v0: p, v1: p + size[i] };
    if (!fit(n.kids[i], kr, a, ctx, out)) return false;
    p += size[i];
    if (i < k - 1) {
      // The partition: its centre line, across the parent from one bounding wall's centre line to the other's.
      out.walls.push({ axis: a, at: p + T / 2, from: (a === 's' ? r.v0 : r.s0) - T / 2, to: (a === 's' ? r.v1 : r.s1) + T / 2, gaps: [] });
      p += T;
    }
  }
  return true;
}

// The doorways: a spanning tree from the entry room by the `via` rules. Returns false if a room cannot be joined.
function join(out, ctx) {
  const T = ctx.T, rooms = out.rooms, w = ctx.innerDoor, J = PLAN_RULES.jamb;
  const entry = rooms.findIndex((q) => q.R.entry);
  if (entry < 0) return false;
  const reached = new Set([entry]);
  // Shared wall between two rooms: { axis, at, o0, o1 } (axis: the constant coordinate of the wall) or null.
  const shared = (A, B) => {
    if (Math.abs(A.s1 + T - B.s0) < 1e-4 || Math.abs(B.s1 + T - A.s0) < 1e-4) {
      const o0 = Math.max(A.v0, B.v0), o1 = Math.min(A.v1, B.v1);
      return o1 - o0 >= w + 2 * J ? { axis: 's', at: Math.abs(A.s1 + T - B.s0) < 1e-4 ? A.s1 + T / 2 : B.s1 + T / 2, o0, o1 } : null;
    }
    if (Math.abs(A.v1 + T - B.v0) < 1e-4 || Math.abs(B.v1 + T - A.v0) < 1e-4) {
      const o0 = Math.max(A.s0, B.s0), o1 = Math.min(A.s1, B.s1);
      return o1 - o0 >= w + 2 * J ? { axis: 'v', at: Math.abs(A.v1 + T - B.v0) < 1e-4 ? A.v1 + T / 2 : B.v1 + T / 2, o0, o1 } : null;
    }
    return null;
  };
  // Snapped doorway positions (local) on a shared wall: whole metres + 0.5 in the world.
  const spots = (sh) => {
    const along = sh.axis === 's' ? 'v' : 's', lo = sh.o0 + J + w / 2, hi = sh.o1 - J - w / 2, out2 = [];
    const a = ctx.toW(along, lo), b = ctx.toW(along, hi), wlo = Math.min(a, b), whi = Math.max(a, b);
    for (const x of doorSpots(wlo, whi, w)) out2.push(ctx.toL(along, x));
    return out2;
  };
  out.links = [];
  while (reached.size < rooms.length) {
    let best = null;
    for (let i = 0; i < rooms.length; i++) {
      if (reached.has(i)) continue;
      const X = rooms[i];
      for (const j of reached) {
        const Y = rooms[j], rank = X.R.via?.indexOf(Y.type) ?? -1;
        if (rank < 0) continue;
        const sh = shared(X, Y);
        if (!sh) continue;
        const sp = spots(sh);
        if (!sp.length) continue;
        const len = sh.o1 - sh.o0;
        if (!best || rank < best.rank || (rank === best.rank && len > best.len)) best = { i, j, rank, len, sh, sp };
      }
    }
    if (!best) return false;
    reached.add(best.i);
    // Toward one end of the shared wall, mostly (a door by the corner leaves the walls free), else anywhere along it.
    const sp = best.sp, r = ctx.rng();
    const at = r < 0.4 ? sp[0] : r < 0.8 ? sp[sp.length - 1] : sp[Math.floor(ctx.rng() * sp.length)];
    const wall = out.walls.find((q) => q.axis === best.sh.axis && Math.abs(q.at - best.sh.at) < 1e-4 && q.from <= at + 1e-6 && q.to >= at - 1e-6);
    if (!wall) return false;
    wall.gaps.push({ at, w });
    out.links.push({ a: best.j, b: best.i, axis: best.sh.axis, at: best.sh.at, along: at });
    rooms[best.i].parent = best.j;
  }
  return true;
}

// ---- floorplan() ----------------------------------------------------------------------------------------------------
// opts: { x0, z0, x1, z1 (wall centre lines), front: 'N'|'S'|'W'|'E', kind, units (count), seed, T (wall), door (front
// door width), innerDoor, backDoor, stair ('lo' | 'hi' | 'back': the island's stair hall, plansOf above) }. Returns null
// for a kind with no PLANS row, else:
//   rooms   [{ type, name, x0, z0, x1, z1 (interior faces), unit, entry }]
//   inner   partition walls in geo()'s format { horizontal, fixed, a0, a1, gaps: [{ at, w }] } (party walls included)
//   front   [at] the front door's centre along the front wall, one per unit (inside its entry room)
//   back    [{ side, at, unit, pref }] where a back door may go (outside walls of rooms with a `back` row), best first
//   plans   [template id per unit]
export function floorplan(o) {
  const sk = o.stair === 'back' ? 'back' : o.stair ? 'side' : null, list = plansOf(o.kind, sk);
  if (!list) return null;
  const { x0, z0, x1, z1, front, T } = o, ns = front === 'N' || front === 'S';
  const Uc = ns ? x1 - x0 : z1 - z0, Vc = ns ? z1 - z0 : x1 - x0, n = Math.max(1, o.units ?? 1), uw = Uc / n;
  const vSgn = front === 'N' || front === 'W' ? 1 : -1, vBase = front === 'N' ? z0 : front === 'S' ? z1 : front === 'W' ? x0 : x1, uBase = ns ? x0 : z0;
  const res = { rooms: [], inner: [], front: [], back: [], plans: [] };
  const side = { lo: ns ? 'W' : 'N', hi: ns ? 'E' : 'S', back: { N: 'S', S: 'N', W: 'E', E: 'W' }[front] };
  for (let u = 0; u < n; u++) {
    const uLo = u * uw, uHi = (u + 1) * uw, Wi = uHi - uLo - T, Vi = Vc - T;
    const urng = planRng(mix(o.seed >>> 0, 0x504c4e00 + u));
    let pick = null;
    // Plans in a weighted random order, the first that fits wins (the same odds as a weighted pick among the ones that fit,
    // without fitting them all).
    const left = list.map((P, t) => ({ P, t }));
    while (left.length && !pick) {
      let tw = 0; for (const q of left) tw += q.P.w;
      let p = urng() * tw, k = left.length - 1;
      for (let i = 0; i < left.length; i++) if ((p -= left[i].P.w) < 0) { k = i; break; }
      const { P, t } = left.splice(k, 1)[0];
      const order = urng() < 0.5 ? [false, true] : [true, false];
      // A plan row may say what it is for (size: interior metres along u and v, the stair hall's share left out): a
      // footprint outside that skips it. o.stair puts the stair hall at the low ('lo') or high ('hi') end of u, no mirror
      // choice, or across the back ('back').
      if (P.size) {
        const su = Wi - (sk === 'side' ? ROOMS.stair.fix + T : 0), sv = Vi - (sk === 'back' ? ROOMS.stair.fix + T : 0), z = P.size;
        if ((z.u && (su < z.u[0] || su > z.u[1])) || (z.v && (sv < z.v[0] || sv > z.v[1]))) continue;
      }
      const mirrors = sk === 'side' ? [o.stair === 'hi'] : order;
      for (const mirror of mirrors) {
        const rng = planRng(mix(o.seed >>> 0, (t * 4 + (mirror ? 1 : 0)) * 64 + u + 1));
        // local s, v (interior) -> centre-line u, v -> world; and back.
        const uC = (s) => (mirror ? uHi - T / 2 - s : uLo + T / 2 + s), vC = (v) => v + T / 2;
        const ctx = {
          T, rng, innerDoor: o.innerDoor,
          toW: (axis, x) => (axis === 's' ? uBase + uC(x) : vBase + vSgn * vC(x)),
          toL: (axis, w) => (axis === 's' ? (mirror ? uHi - T / 2 - (w - uBase) : w - uBase - uLo - T / 2) : vSgn * (w - vBase) - T / 2),
          sgn: (axis) => (axis === 's' ? (mirror ? -1 : 1) : vSgn),
        };
        const out = { rooms: [], walls: [] };
        if (!fit(P.node, { s0: 0, s1: Wi, v0: 0, v1: Vi }, null, ctx, out)) continue;
        if (!join(out, ctx)) continue;
        // The front door: in the entry room's front wall, clear of its corners.
        const e = out.rooms.find((q) => q.R.entry);
        if (e.v0 > 1e-4) continue;
        const dw = o.door, lo = ctx.toW('s', e.s0 + 0.35 + dw / 2), hi = ctx.toW('s', e.s1 - 0.35 - dw / 2);
        const cands = [];
        cands.push(...doorSpots(Math.min(lo, hi), Math.max(lo, hi), dw));
        if (!cands.length) continue;
        pick = { P, mirror, out, ctx, cands, rng };
        break;
      }
    }
    if (!pick) {
      // Nothing fits (a footprint squeezed by its lot): one open room, the old shell's way.
      const entryType = entryOf(list[0].node);
      const uC = (s) => uLo + T / 2 + s;
      const ctx = { toW: (axis, x) => (axis === 's' ? uBase + uC(x) : vBase + vSgn * (x + T / 2)) };
      pick = { P: { id: 'open' }, out: { rooms: [{ type: entryType, R: ROOMS[entryType], s0: 0, s1: Wi, v0: 0, v1: Vi }], walls: [] }, ctx, cands: [snapW(uBase + (uLo + uHi) / 2)], rng: urng, mirror: false };
    }
    res.plans.push(pick.P.id);
    const { out, ctx, cands } = pick;
    // Doors toward the middle of the living room's wall, give or take.
    const mid = (cands.length - 1) / 2, ci = Math.max(0, Math.min(cands.length - 1, Math.round(mid + (pick.rng() * 2 - 1) * Math.max(0, mid - 0.5))));
    res.front.push(cands[ci]);
    // World rects and walls.
    const W = (axis, x) => ctx.toW(axis, x);
    for (const q of out.rooms) {
      const ax = [W('s', q.s0), W('s', q.s1)], av = [W('v', q.v0), W('v', q.v1)];
      const xs = ns ? ax : av, zs = ns ? av : ax;
      res.rooms.push({ type: q.type, name: q.R.name, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), unit: u, entry: !!q.R.entry });
      // Back doors: the outside walls of a room with a `back` row (the back wall, or the end wall of an end unit).
      if (q.R.back == null) continue;
      const bw = o.backDoor, J = 0.35;
      const walls = [];
      if (q.v1 > Vi - 1e-4) walls.push({ side: side.back, lo: q.s0, hi: q.s1, axis: 's', pref: q.R.back });
      const atLo = !pick.mirror ? q.s0 < 1e-4 && u === 0 : q.s0 < 1e-4 && u === n - 1;
      const atHi = !pick.mirror ? q.s1 > Wi - 1e-4 && u === n - 1 : q.s1 > Wi - 1e-4 && u === 0;
      if (atLo) walls.push({ side: pick.mirror ? side.hi : side.lo, lo: q.v0, hi: q.v1, axis: 'v', pref: q.R.back + 0.5 });
      if (atHi) walls.push({ side: pick.mirror ? side.lo : side.hi, lo: q.v0, hi: q.v1, axis: 'v', pref: q.R.back + 0.5 });
      for (const wl of walls) {
        const a = W(wl.axis, wl.lo + J + bw / 2), b = W(wl.axis, wl.hi - J - bw / 2), c = [];
        c.push(...doorSpots(Math.min(a, b), Math.max(a, b), bw));
        if (c.length) res.back.push({ side: wl.side, at: c[Math.floor(pick.rng() * c.length)], unit: u, pref: wl.pref + pick.rng() * 0.1, room: q.type });
      }
    }
    for (const wl of out.walls) {
      // A wall of constant s runs along v; constant s is constant x when the front is N or S.
      const horizontal = wl.axis === 's' ? !ns : ns, along = wl.axis === 's' ? 'v' : 's';
      const a0 = W(along, wl.from), a1 = W(along, wl.to);
      res.inner.push({ horizontal, fixed: W(wl.axis, wl.at), a0: Math.min(a0, a1), a1: Math.max(a0, a1), gaps: wl.gaps.map((gp) => ({ at: W(along, gp.at), w: gp.w })) });
    }
    if (u > 0) res.inner.push({ horizontal: !ns, fixed: uBase + uLo, a0: ns ? z0 : x0, a1: ns ? z1 : x1, gaps: [], party: true });
  }
  res.back.sort((p, q) => p.pref - q.pref);
  return res;
}

// ---- the nav probe --------------------------------------------------------------------------------------------------
// One per Ring (reused: no allocation per building). reset() a window round a building, add() its boxes, then ok() floods
// from its doors and answers: is every open cell inside reached, and does every room have one?
export class NavProbe {
  constructor(max = 64, radius = 0.45) {
    this.r = radius; this.cap = max * max;
    this.cnt = new Uint16Array(this.cap); this.seen = new Uint32Array(this.cap); this.q = new Int32Array(this.cap); this.stamp = 0;
  }
  reset(x0, z0, x1, z1, pad = 2) {
    this.ox = Math.floor(x0 - pad); this.oz = Math.floor(z0 - pad);
    this.nx = Math.min(64, Math.ceil(x1 + pad) - this.ox); this.nz = Math.min(64, Math.ceil(z1 + pad) - this.oz);
    this.cnt.fill(0, 0, this.nx * this.nz);
    this.bx0 = x0; this.bz0 = z0; this.bx1 = x1; this.bz1 = z1;
  }
  // The nav rule: a cell is blocked when its centre (ox + i + 0.5) lies inside the box grown by the radius (inclusive).
  add(b, d = 1) {
    if (b.base > 0) return;
    const r = this.r;
    const i0 = Math.max(0, Math.ceil(b.x0 - r - this.ox - 0.5)), i1 = Math.min(this.nx - 1, Math.floor(b.x1 + r - this.ox - 0.5));
    const j0 = Math.max(0, Math.ceil(b.z0 - r - this.oz - 0.5)), j1 = Math.min(this.nz - 1, Math.floor(b.z1 + r - this.oz - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.cnt[j * this.nx + i] += d;
  }
  idx(x, z) { const i = Math.floor(x - this.ox), j = Math.floor(z - this.oz); return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : j * this.nx + i; }
  free(x, z) { const k = this.idx(x, z); return k >= 0 && this.cnt[k] === 0; }
  // Flood from the start points (each the cell holding it, when open).
  flood(starts) {
    const s = ++this.stamp, nx = this.nx, nz = this.nz, C = this.cnt, S = this.seen, Q = this.q;
    let h = 0, t = 0;
    for (const [x, z] of starts) { const k = this.idx(x, z); if (k >= 0 && !C[k] && S[k] !== s) { S[k] = s; Q[t++] = k; } }
    while (h < t) {
      const k = Q[h++], i = k % nx, j = (k - i) / nx;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const a = i + dx, b = j + dz;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const kk = b * nx + a;
        if (C[kk] || S[kk] === s) continue;
        if (dx && dz && (C[j * nx + a] || C[b * nx + i])) continue; // no corner cutting
        S[kk] = s; Q[t++] = kk;
      }
    }
    return s;
  }
  reached(x, z) { const k = this.idx(x, z); return k >= 0 && this.seen[k] === this.stamp && !this.cnt[k]; }
  // Every open cell inside the walls reached, and every room holding one.
  ok(starts, rooms, inset) {
    this.flood(starts);
    const s = this.stamp, nx = this.nx;
    const i0 = Math.ceil(this.bx0 + inset - this.ox - 0.5), i1 = Math.floor(this.bx1 - inset - this.ox - 0.5);
    const j0 = Math.ceil(this.bz0 + inset - this.oz - 0.5), j1 = Math.floor(this.bz1 - inset - this.oz - 0.5);
    for (let j = Math.max(0, j0); j <= Math.min(this.nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) {
      const k = j * nx + i;
      if (!this.cnt[k] && this.seen[k] !== s) return false;
    }
    for (const r of rooms) if (!this.roomReached(r)) return false;
    return true;
  }
  roomReached(r) {
    const s = this.stamp, nx = this.nx;
    for (let j = Math.max(0, Math.ceil(r.z0 - this.oz - 0.5)); j <= Math.min(this.nz - 1, Math.floor(r.z1 - this.oz - 0.5)); j++)
      for (let i = Math.max(0, Math.ceil(r.x0 - this.ox - 0.5)); i <= Math.min(nx - 1, Math.floor(r.x1 - this.ox - 0.5)); i++) {
        const k = j * nx + i;
        if (!this.cnt[k] && this.seen[k] === s) return true;
      }
    return false;
  }
  // A reached open cell within d of (x, z) (a bed's approach: the walk's last step is straight from there).
  near(x, z, d = 1.05) {
    const s = this.stamp;
    for (let j = Math.floor(z - d - this.oz); j <= Math.ceil(z + d - this.oz); j++) for (let i = Math.floor(x - d - this.ox); i <= Math.ceil(x + d - this.ox); i++) {
      if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
      const k = j * this.nx + i;
      if (this.cnt[k] || this.seen[k] !== s) continue;
      if (Math.hypot(this.ox + i + 0.5 - x, this.oz + j + 0.5 - z) <= d) return true;
    }
    return false;
  }
}
