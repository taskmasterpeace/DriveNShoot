#!/usr/bin/env node
// ROOM SCAN -> AUTHORED ROW (docs/design/WEB_ROOM_SCAN.md). Step 2 of the room-scan pipeline:
//   phone scan --(scan2room.py)--> room.json --(this)--> an authored building row (world/authored.js v1)
// The row stands in the Phoenix ring with the `author` command like any Building Lab export: walls, doorways, a front
// door, windows, collision, nav and the reachability proof all come from the engine. The scanned room keeps its real
// shape (an L stays an L) and its furniture stands where it stands in the real room (rooms[].pieces). The rest of the
// footprint's rectangle is the part of the house not scanned yet: its own rooms, joined to the scanned one by a doorway.
//
//   node tools/room-scan/room2row.mjs <room.json> [--out row.json] [--id scan-myroom] [--name "MY ROOM"]
//
// Privacy (WEB_DEPTH_PLAN §9): no photo, no address, nothing but sizes reaches the row.
import { readFileSync, writeFileSync } from 'node:fs';
import { RING, FURNITURE } from '../../src/data/ring.js';
import { ROOMS } from '../../src/data/floorplans.js';

const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const src = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!src) { console.error('usage: room2row.mjs <room.json> [--out row.json] [--id id] [--name NAME]'); process.exit(1); }
const room = JSON.parse(readFileSync(src, 'utf8'));
const T = RING.wall, r2 = (v) => Math.round(v * 100) / 100, EPS = 1e-6;

// ---- the scanned outline (inner faces, a rectilinear ring) on a grid of its own x and z lines ----------------------
// Wall lines closer than 30 cm are one wall seen twice (scan fuzz): snap them together, then drop the steps that leaves.
const snapLines = (vals) => { const u = [...new Set(vals)].sort((a, b) => a - b), map = new Map(); let grp = [];
  const flush = () => { const m = r2(grp.reduce((a, b) => a + b, 0) / grp.length); for (const v of grp) map.set(v, m); grp = []; };
  for (const v of u) { if (grp.length && v - grp[0] > 0.3) flush(); grp.push(v); } if (grp.length) flush(); return map; };
const mx = snapLines(room.outline.map((p) => r2(p[0]))), mz = snapLines(room.outline.map((p) => r2(p[1])));
let P = room.outline.map(([x, z]) => [mx.get(r2(x)), mz.get(r2(z))]);
P = P.filter((p, i) => { const q = P[(i + P.length - 1) % P.length]; return !(Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS); });
P = P.filter((p, i) => { const a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length]; return !((Math.abs(a[0] - p[0]) < EPS && Math.abs(b[0] - p[0]) < EPS) || (Math.abs(a[1] - p[1]) < EPS && Math.abs(b[1] - p[1]) < EPS)); });
const xs = [...new Set(P.map((p) => p[0]))].sort((a, b) => a - b), zs = [...new Set(P.map((p) => p[1]))].sort((a, b) => a - b);
const inPoly = (x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const NX = xs.length - 1, NZ = zs.length - 1;
const inside = [...Array(NX)].map((_, i) => [...Array(NZ)].map((_, j) => inPoly((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2)));
// Not-scanned pockets too thin for a doorway into them (under 2 m: scan fuzz, a closet nook) join the scanned room.
for (let pass = 0; pass < 2; pass++) for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) if (!inside[i][j] && Math.min(xs[i + 1] - xs[i], zs[j + 1] - zs[j]) < 2.0) inside[i][j] = true;

// Rectangles over grid cells of one kind (greedy: widest run along x, then grown down z).
function rects(want) {
  const used = inside.map((c) => c.map(() => false)), out = [];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    if (used[i][j] || inside[i][j] !== want) continue;
    let i1 = i; while (i1 + 1 < NX && !used[i1 + 1][j] && inside[i1 + 1][j] === want) i1++;
    let j1 = j; while (j1 + 1 < NZ && [...Array(i1 - i + 1)].every((_, k) => !used[i + k][j1 + 1] && inside[i + k][j1 + 1] === want)) j1++;
    for (let a = i; a <= i1; a++) for (let b = j; b <= j1; b++) used[a][b] = true;
    out.push({ i0: i, i1: i1 + 1, j0: j, j1: j1 + 1, x0: xs[i], x1: xs[i1 + 1], z0: zs[j], z1: zs[j1 + 1] });
  }
  return out;
}

// ---- the footprint: the outline's box, its walls' centre lines a half wall out ------------------------------------
const bx0 = xs[0], bx1 = xs[NX], bz0 = zs[0], bz1 = zs[NZ];
const x0 = r2(bx0 - T / 2), x1 = r2(bx1 + T / 2), z0 = r2(bz0 - T / 2), z1 = r2(bz1 + T / 2);

// Door centres on nav cell centres (whole metres + 0.5); what the scan saw along a wall.
const halfs = (a, b, w, pad) => { const out = []; for (let p = Math.ceil(a + pad + w / 2 - 0.5) + 0.5; p <= b - pad - w / 2 + EPS; p += 1) out.push(p); return out; };
const segs = room.segments ?? [];
const segOn = (h, fixed, a0, a1, types) => segs.find((s) => types.includes(s.type) && (h ? Math.abs(s.z1 - fixed) < 0.15 && Math.abs(s.z2 - fixed) < 0.15 : Math.abs(s.x1 - fixed) < 0.15 && Math.abs(s.x2 - fixed) < 0.15)
  && Math.max(h ? Math.min(s.x1, s.x2) : Math.min(s.z1, s.z2), a0) < Math.min(h ? Math.max(s.x1, s.x2) : Math.max(s.z1, s.z2), a1));
const segMid = (s, h) => (h ? (s.x1 + s.x2) / 2 : (s.z1 + s.z2) / 2);

// The plan for the current split of scanned / not scanned. A pocket of the rest whose only doorway would land on scanned
// furniture (the engine keeps 1 m each side of a doorway clear) comes back in `blocked`: it joins the scanned room, open
// plan, and the plan is made again.
function plan() {
  const scanRects = rects(true), restRects = rects(false);

  // ---- partitions: every grid edge between scanned and not-scanned cells, merged into straight runs -------------------
  const edges = []; // { horizontal, fixed, a0, a1, rest: which side is the rest (+1 / -1) }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    if (i + 1 < NX && inside[i][j] !== inside[i + 1][j]) edges.push({ horizontal: false, fixed: xs[i + 1], a0: zs[j], a1: zs[j + 1], rest: inside[i][j] ? 1 : -1 });
    if (j + 1 < NZ && inside[i][j] !== inside[i][j + 1]) edges.push({ horizontal: true, fixed: zs[j + 1], a0: xs[i], a1: xs[i + 1], rest: inside[i][j] ? 1 : -1 });
  }
  edges.sort((p, q) => (p.horizontal - q.horizontal) || p.fixed - q.fixed || p.a0 - q.a0);
  const walls = [];
  for (const e of edges) {
    const w = walls[walls.length - 1];
    if (w && w.horizontal === e.horizontal && Math.abs(w.fixed - e.fixed) < EPS && Math.abs(w.a1 - e.a0) < EPS && w.rest === e.rest) w.a1 = e.a1;
    else walls.push({ ...e, gaps: [] });
  }
  // A partition that reaches the outside wall runs on to its centre line; one that meets another partition stops at it.
  const lo = (h) => (h ? bx0 : bz0), hi = (h) => (h ? bx1 : bz1);
  for (const w of walls) {
    if (Math.abs(w.a0 - lo(w.horizontal)) < EPS) w.a0 = lo(w.horizontal) - T / 2;
    if (Math.abs(w.a1 - hi(w.horizontal)) < EPS) w.a1 = hi(w.horizontal) + T / 2;
  }

  // ---- rooms (inner faces): a rectangle's side on a partition gives up half a wall ------------------------------------
  const onWall = (h, fixed, a0, a1) => walls.some((w) => w.horizontal === h && Math.abs(w.fixed - fixed) < EPS && w.a0 < a1 - EPS && w.a1 > a0 + EPS);
  const shrink = (r) => ({
    x0: r2(r.x0 + (onWall(false, r.x0, r.z0, r.z1) ? T / 2 : 0)), x1: r2(r.x1 - (onWall(false, r.x1, r.z0, r.z1) ? T / 2 : 0)),
    z0: r2(r.z0 + (onWall(true, r.z0, r.x0, r.x1) ? T / 2 : 0)), z1: r2(r.z1 - (onWall(true, r.z1, r.x0, r.x1) ? T / 2 : 0)),
  });
  // What the scanned room is, by what stands in it.
  const kinds = new Set(room.furniture.map((f) => f.kind));
  const scanType = kinds.has('bed') ? 'bedroom' : kinds.has('sofa') ? 'living' : kinds.has('table') ? 'dining' : 'den';
  const rooms = scanRects.map((r) => ({ type: scanType, ...shrink(r), unit: 0 }));
  for (const r of restRects) { const s = shrink(r); rooms.push({ type: Math.min(s.x1 - s.x0, s.z1 - s.z0) < 2.6 ? 'hall' : 'den', ...s, unit: 0 }); }

  // ---- furniture: the scan's boxes as FURNITURE rows, each in the scanned rectangle that holds its centre ------------
  const MAP = { bed: (f) => (Math.min(f.w, f.d) < 1.2 ? 'sbed' : 'bed'), sofa: () => 'couch', table: (f) => (f.h < 0.7 ? 'table' : Math.max(f.w, f.d) > 1.6 ? 'dtable' : 'desk'), chair: () => 'armchair', stool: () => 'nightstand', shelf: () => 'shelf', cabinet: (f) => (f.h > 1.2 ? 'shelf' : 'dresser') };
  let pieces = 0;
  for (const f of room.furniture) {
    const kind = (MAP[f.kind] ?? (() => 'crate'))(f);
    if (!FURNITURE[kind]) continue;
    const home = rooms.slice(0, scanRects.length).find((r) => f.x > r.x0 && f.x < r.x1 && f.z > r.z0 && f.z < r.z1);
    if (!home) continue;
    const q = { kind, x0: r2(Math.max(home.x0, f.x - f.w / 2)), z0: r2(Math.max(home.z0, f.z - f.d / 2)), x1: r2(Math.min(home.x1, f.x + f.w / 2)), z1: r2(Math.min(home.z1, f.z + f.d / 2)) };
    if (q.x1 - q.x0 < 0.3 || q.z1 - q.z0 < 0.3) continue;
    (home.pieces ??= []).push(q); pieces++;
  }

  // ---- doorways: door centres on nav cell centres (whole metres + 0.5) ------------------------------------------------
  // Each stretch of the rest gets one doorway into the scanned room: where the scan saw a door or an opening, else the
  // middle of the longest partition that faces it.
  for (const w of walls) {
    const s = segOn(w.horizontal, w.fixed, w.a0, w.a1, ['door', 'open']);
    const spots = halfs(w.a0, w.a1, RING.innerDoor, 0.35 + T / 2);
    if (!spots.length) continue;
    const want = s ? segMid(s, w.horizontal) : (w.a0 + w.a1) / 2;
    // The engine keeps a doorway's clear zone (1 m each side) free of furniture: take the spot nearest what the scan saw
    // whose zone misses every scanned piece, else the nearest one (that piece is then nudged or left out).
    const hw = RING.innerDoor / 2 + 0.15, dep = T / 2 + 1.0, all = rooms.flatMap((r) => r.pieces ?? []);
    const clear = (at) => !all.some((q) => (w.horizontal ? q.x0 < at + hw && q.x1 > at - hw && q.z0 < w.fixed + dep && q.z1 > w.fixed - dep : q.z0 < at + hw && q.z1 > at - hw && q.x0 < w.fixed + dep && q.x1 > w.fixed - dep));
    const order = spots.slice().sort((p, q) => Math.abs(p - want) - Math.abs(q - want));
    w.want = { at: order.find(clear) ?? order[0], clear: order.some(clear), seen: !!s, len: w.a1 - w.a0 };
  }
  const restOf = (w) => { const m = (w.a0 + w.a1) / 2, o = w.fixed + w.rest * 0.5; const k = rooms.slice(scanRects.length).findIndex((r) => (w.horizontal ? m >= r.x0 - T && m <= r.x1 + T && o > r.z0 - T && o < r.z1 + T : m >= r.z0 - T && m <= r.z1 + T && o > r.x0 - T && o < r.x1 + T)); return k < 0 ? -1 : k + scanRects.length; };
  const joined = new Set();
  for (const w of walls.filter((q) => q.want).sort((p, q) => (q.want.seen - p.want.seen) || q.want.len - p.want.len)) {
    const k = restOf(w);
    if (joined.has(k) && !w.want.seen) continue;
    joined.add(k); w.gaps.push({ at: w.want.at, w: RING.innerDoor });
  }
  const blocked = [];
  for (const k of new Set(walls.filter((w) => w.want && !w.want.clear && w.gaps.length).map(restOf))) if (k >= 0 && !walls.some((w) => restOf(w) === k && w.want?.clear)) blocked.push(restRects[k - scanRects.length]);
  return { scanRects, restRects, walls, rooms, pieces, scanType, blocked };
}
let PL = plan();
for (let n = 0; n < 4 && PL.blocked.length; n++) { for (const r of PL.blocked) for (let i = r.i0; i < r.i1; i++) for (let j = r.j0; j < r.j1; j++) inside[i][j] = true; PL = plan(); }
const { scanRects, restRects, walls, rooms, pieces, scanType } = PL;

// ---- the front door: in the scanned room's outside wall, where the scan saw a door, else its longest stretch -------
const sides = [];
for (const r of scanRects) {
  if (Math.abs(r.z0 - bz0) < EPS) sides.push({ side: 'N', a0: r.x0, a1: r.x1, fixed: bz0 });
  if (Math.abs(r.z1 - bz1) < EPS) sides.push({ side: 'S', a0: r.x0, a1: r.x1, fixed: bz1 });
  if (Math.abs(r.x0 - bx0) < EPS) sides.push({ side: 'W', a0: r.z0, a1: r.z1, fixed: bx0 });
  if (Math.abs(r.x1 - bx1) < EPS) sides.push({ side: 'E', a0: r.z0, a1: r.z1, fixed: bx1 });
}
let front = null;
for (const sd of sides) {
  const h = sd.side === 'N' || sd.side === 'S', s = segOn(h, sd.fixed, sd.a0, sd.a1, ['door', 'open']);
  const spots = halfs(sd.a0, sd.a1, RING.door, 0.35);
  if (!spots.length) continue;
  // The engine keeps 1.3 m inside the front door clear of furniture: prefer a spot whose zone misses every scanned piece.
  const all = rooms.flatMap((r) => r.pieces ?? []), hw = RING.door / 2 + 0.15, dep = 1.3;
  const clear = (p) => !all.some((q) => (h ? q.x0 < p + hw && q.x1 > p - hw && q.z0 < sd.fixed + dep && q.z1 > sd.fixed - dep : q.z0 < p + hw && q.z1 > p - hw && q.x0 < sd.fixed + dep && q.x1 > sd.fixed - dep));
  const want = s ? segMid(s, h) : (sd.a0 + sd.a1) / 2, order = spots.slice().sort((p, q) => Math.abs(p - want) - Math.abs(q - want));
  const at = order.find(clear) ?? order[0];
  const score = (order.some(clear) ? 100 : 0) + (s ? 50 : 0) + (sd.a1 - sd.a0) + (sd.side === 'S' ? 0.5 : 0);
  if (process.env.R2R_DEBUG) console.error(sd.side, sd.a0, sd.a1, spots, at, order.some(clear), score);
  if (!front || score > front.score) front = { side: sd.side, at, score };
}
if (!front) { console.error('no outside wall of the scanned room is long enough for a front door'); process.exit(2); }

const id = flag('id', `scan-${String(room.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`);
const h = r2(Math.min(3.6, Math.max(2.8, room.size?.h ?? 2.8)));
const row = {
  v: 1, id, name: flag('name', `SCANNED ${ROOMS[scanType].name}`), kind: 'house', zone: 'residential', front: front.side,
  x0, z0, x1, z1, h, top: h, seed: [...id].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7), units: 1, walkway: 0, plan: 'room-scan',
  floors: [{ y: 0, deck: null, rooms, walls: walls.map((w) => ({ horizontal: w.horizontal, fixed: r2(w.fixed), a0: r2(w.a0), a1: r2(w.a1), gaps: w.gaps })), doors: [{ side: front.side, at: front.at, w: RING.door, kind: 'front', unit: 0 }] }],
  flights: [],
  scan: { source: room.source, scanned: scanType, size: room.size, pieces, rest: restRects.length },
};
const out = flag('out', null), json = JSON.stringify(row);
if (out) writeFileSync(out, JSON.stringify(row, null, 1));
console.log(out ? `${out}: ${row.name} ${r2(x1 - x0)} x ${r2(z1 - z0)} m, ${rooms.length} rooms (${scanRects.length} scanned), ${walls.length} partitions, ${pieces} pieces, front door ${front.side} at ${front.at}` : json);
