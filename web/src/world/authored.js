// AUTHORED BUILDINGS (docs/design/WEB_BUILDING_LAB.md): a building laid out or edited by hand in the Building Lab
// (web/lab.html), exported as a data row, and stood in the Phoenix ring in place of what the generator would put there -
// on a lot (site.lot: a lot id, the building turned to face that lot's street) or at a world position (site.x, site.z:
// the lots of that block it covers are cleared). Rows live in data/authored.js (AUTHORED); the `author` command adds one
// at run time. No three.js here: world/ring.js geo() builds an authored building's street storey on its own path (walls,
// doorways, windows, furniture proved on the nav probe, collision, nav, roof), and this file is the rest - the frame, the
// stairs, the floors above (as data and for the lab's view), and the reachability proof the lab and the selftest share.
//
// A row, in its own frame (metres; +x east, +z south, the front door on side `front`):
//   { v: 1, id, name, kind, zone, front, x0, z0, x1, z1 (the footprint: wall centre lines), h (the street storey's height:
//     floor 1 stands on it), top (the wall top: the roof), seed, units, walkway (m of covered walk along the front, 0: none),
//     floors: [{ y, deck (null: the whole floor; a mezzanine's rect), rooms: [{ type, x0, z0, x1, z1 (inner faces), unit }],
//               walls: [{ horizontal, fixed, a0, a1, gaps: [{ at, w }] }] (partitions, centre lines),
//               doors: [{ side, at, w, kind: front|bay|back, unit }] (floor 0 only) }],
//     flights: [{ from (floor), x0, z0, x1, z1 (the run, landings not included), axis: 'x'|'z', dir: +1|-1 (the way up) }],
//     site: { lot: 'R<k>.<j>.<n>' } | { x, z, front } }
// Door and doorway centres sit on nav cell centres (whole metres + 0.5), so a building is placed only by whole metres and
// quarter turns: both keep them there.
import { RING, KINDS, ZONES } from '../data/ring.js';
import { ROOMS, PLANS, PLAN_RULES } from '../data/floorplans.js';
import { STOREY, FLIGHT, RAIL, WINDOWS } from '../data/storeys.js';
import { NavProbe, planRng } from './floorplan.js';
import { hash32, rngOf } from './geo.js';

export const AUTHORED_V = 1;
const T = RING.wall, SIDES = ['N', 'E', 'S', 'W'];
const clone = (o) => JSON.parse(JSON.stringify(o));
const r2 = (v) => Math.round(v * 100) / 100;

// ---- the frame ------------------------------------------------------------------------------------------------------
// k quarter turns clockwise on screen (the front N turns to E), then a move by (tx, tz).
function turnPt(x, z, k) { for (let i = 0; i < k; i++) [x, z] = [-z, x]; return [x, z]; }
function turnRect(r, k, tx, tz) {
  const [ax, az] = turnPt(r.x0, r.z0, k), [bx, bz] = turnPt(r.x1, r.z1, k);
  return { ...r, x0: r2(Math.min(ax, bx) + tx), x1: r2(Math.max(ax, bx) + tx), z0: r2(Math.min(az, bz) + tz), z1: r2(Math.max(az, bz) + tz) };
}
function turnWall(w, k, tx, tz) {
  let { horizontal, fixed, a0, a1 } = w, gaps = w.gaps.map((g) => ({ ...g }));
  for (let i = 0; i < k; i++) {
    if (horizontal) { horizontal = false; fixed = -fixed; } // z = c, x along -> x = -c, z along (the same values)
    else { horizontal = true; [a0, a1] = [-a1, -a0]; gaps = gaps.map((g) => ({ ...g, at: -g.at })); } // x = c -> z = c, x = -z
  }
  const da = horizontal ? tx : tz;
  return { ...w, horizontal, fixed: r2(fixed + (horizontal ? tz : tx)), a0: r2(a0 + da), a1: r2(a1 + da), gaps: gaps.map((g) => ({ ...g, at: r2(g.at + da) })) };
}
function turnDoor(d, k, tx, tz) {
  let side = d.side, at = d.at;
  for (let i = 0; i < k; i++) { if (side === 'E' || side === 'W') at = -at; side = SIDES[(SIDES.indexOf(side) + 1) % 4]; }
  return { ...d, side, at: r2(at + (side === 'N' || side === 'S' ? tx : tz)) };
}
function turnFlight(f, k, tx, tz) {
  let { axis, dir } = f;
  for (let i = 0; i < k; i++) { if (axis === 'x') axis = 'z'; else { axis = 'x'; dir = -dir; } }
  return { ...turnRect(f, k, tx, tz), from: f.from, axis, dir };
}
// The row turned to face `front` with its footprint centred on (x, z) (rounded to whole metres). Returns a placed row.
export function place(row, x, z, front = row.front) {
  const k = (SIDES.indexOf(front) - SIDES.indexOf(row.front) + 4) % 4;
  const [cx, cz] = turnPt((row.x0 + row.x1) / 2, (row.z0 + row.z1) / 2, k);
  const tx = Math.round(x - cx), tz = Math.round(z - cz);
  const fp = turnRect(row, k, tx, tz);
  return {
    ...clone(row), front, x0: fp.x0, z0: fp.z0, x1: fp.x1, z1: fp.z1, turn: k, at: [tx, tz],
    floors: row.floors.map((f) => ({ y: f.y, deck: f.deck ? turnRect(f.deck, k, tx, tz) : null, rooms: f.rooms.map((r) => turnRect(r, k, tx, tz)),
      walls: f.walls.map((w) => turnWall(w, k, tx, tz)), doors: (f.doors ?? []).map((d) => turnDoor(d, k, tx, tz)) })),
    flights: (row.flights ?? []).map((f) => turnFlight(f, k, tx, tz)),
  };
}

// ---- floors and stairs ----------------------------------------------------------------------------------------------
export const floorY = (row, k) => (k === 0 ? 0 : row.h + (k - 1) * STOREY.up);
// The interior (inner faces) of the footprint, and a floor's deck (the whole interior unless it is a mezzanine).
export const interior = (row) => ({ x0: row.x0 + T / 2, z0: row.z0 + T / 2, x1: row.x1 - T / 2, z1: row.z1 - T / 2 });
export const deckOf = (row, k) => row.floors[k]?.deck ?? interior(row);
// A flight's rise and run (the storeys rules: one pitch, so a taller storey has a longer run), its landings (FLIGHT.landing
// deep, beyond each end) and the points a walker stands on at its foot and its head.
export function riseOf(row, from) { return floorY(row, from + 1) - floorY(row, from); }
export function runOf(row, from) { return riseOf(row, from) / FLIGHT.pitch; }
export function landings(f) {
  const L = FLIGHT.landing, ax = f.axis === 'x', lo = ax ? f.x0 : f.z0, hi = ax ? f.x1 : f.z1, c0 = ax ? f.z0 : f.x0, c1 = ax ? f.z1 : f.x1;
  const bot = f.dir > 0 ? [lo - L, lo] : [hi, hi + L], top = f.dir > 0 ? [hi, hi + L] : [lo - L, lo];
  const rect = (a, b) => (ax ? { x0: a, x1: b, z0: c0, z1: c1 } : { x0: c0, x1: c1, z0: a, z1: b });
  const pt = (a, b) => (ax ? [(a + b) / 2, (c0 + c1) / 2] : [(c0 + c1) / 2, (a + b) / 2]);
  return { bottom: rect(...bot), top: rect(...top), foot: pt(...bot), head: pt(...top) };
}
// Floor k for the nav rule, without its furniture: the outside walls (the street floor's with its door gaps), the void past
// a mezzanine's deck, the stairwells arriving, the runs leaving, the partitions with their doorways.
function navBoxes(row, k) {
  const out = [], F = row.floors[k], B = (x0, z0, x1, z1) => out.push({ x0, z0, x1, z1 });
  const sides = { N: [true, row.z0, row.x0 - T / 2, row.x1 + T / 2], S: [true, row.z1, row.x0 - T / 2, row.x1 + T / 2], W: [false, row.x0, row.z0, row.z1], E: [false, row.x1, row.z0, row.z1] };
  for (const [side, [horizontal, fixed, a0, a1]] of Object.entries(sides)) {
    const gaps = k ? [] : (F.doors ?? []).filter((d) => d.side === side).map((d) => ({ at: d.at, w: d.w }));
    for (const s of spans({ horizontal, fixed, a0, a1, gaps })) B(s.x0, s.z0, s.x1, s.z1);
  }
  for (const w of F.walls) for (const s of spans(w)) B(s.x0, s.z0, s.x1, s.z1);
  if (k) for (const v of cut(interior(row), deckOf(row, k))) B(v.x0, v.z0, v.x1, v.z1);
  for (const f of row.flights ?? []) if (f.from === k || f.from === k - 1) B(f.x0, f.z0, f.x1, f.z1);
  return out;
}
// Where a walker steps off at the head of flight f: the landing's first standable cell in its room upstairs, or null.
function headCell(row, f) {
  const l = landings(f), up = row.floors[f.from + 1], room = up?.rooms.find((q) => within(l.top, q, 0.06)) ?? (up ? deckOf(row, f.from + 1) : null);
  return room ? standable(l.top, room, f) : null;
}
// A landing a walker can stand on by the nav grid's rule: a 1 m cell's centre in it that is more than the walker's 0.45 m
// from the room's walls and from the flight's run.
function standable(l, room, f) {
  const m = 0.46, ax = f.axis === 'x';
  let x0 = Math.max(l.x0, room.x0 + m), x1 = Math.min(l.x1, room.x1 - m), z0 = Math.max(l.z0, room.z0 + m), z1 = Math.min(l.z1, room.z1 - m);
  if (ax) { if (l.x0 >= f.x1 - 0.01) x0 = Math.max(x0, f.x1 + m); else x1 = Math.min(x1, f.x0 - m); }
  else { if (l.z0 >= f.z1 - 0.01) z0 = Math.max(z0, f.z1 + m); else z1 = Math.min(z1, f.z0 - m); }
  // The cell centre nearest the middle of what is left, or null.
  const pick = (a, b) => { const c = Math.floor((a + b) / 2) + 0.5, opts = [c, c - 1, c + 1].filter((v) => v >= a && v <= b); return opts.length ? opts[0] : null; };
  if (!(x1 > x0 && z1 > z0)) return null;
  const x = pick(x0, x1), z = pick(z0, z1);
  return x === null || z === null ? null : [x, z];
}
const overlap = (a, b, m = 0) => a.x0 < b.x1 - m && a.x1 > b.x0 + m && a.z0 < b.z1 - m && a.z1 > b.z0 + m;
const within = (a, b, m = 0) => a.x0 >= b.x0 - m && a.x1 <= b.x1 + m && a.z0 >= b.z0 - m && a.z1 <= b.z1 + m;
const wallRect = (w) => (w.horizontal ? { x0: w.a0, x1: w.a1, z0: w.fixed - T / 2, z1: w.fixed + T / 2 } : { x0: w.fixed - T / 2, x1: w.fixed + T / 2, z0: w.a0, z1: w.a1 });
// Wall spans between its gaps (each a solid rect).
function spans(w) {
  const out = [], gaps = w.gaps.slice().sort((p, q) => p.at - q.at);
  let cur = w.a0;
  for (const g of gaps) { if (g.at - g.w / 2 - cur > 0.05) out.push([cur, g.at - g.w / 2]); cur = g.at + g.w / 2; }
  if (w.a1 - cur > 0.05) out.push([cur, w.a1]);
  return out.map(([a, b]) => (w.horizontal ? { x0: a, x1: b, z0: w.fixed - T / 2, z1: w.fixed + T / 2 } : { x0: w.fixed - T / 2, x1: w.fixed + T / 2, z0: a, z1: b }));
}
// Clearances furniture keeps (and a flight's run may not take): inside every outside door, both sides of every doorway.
function doorZones(row, k) {
  const F = row.floors[k], z = [];
  for (const d of F.doors ?? []) {
    const [x, zz] = doorXZ(row, d), hw = d.w / 2 + 0.15, dep = PLAN_RULES.frontClear;
    z.push(d.side === 'N' || d.side === 'S' ? { x0: x - hw, x1: x + hw, z0: zz - dep, z1: zz + dep } : { x0: x - dep, x1: x + dep, z0: zz - hw, z1: zz + hw });
  }
  for (const w of F.walls) for (const g of w.gaps) {
    const hw = g.w / 2 + 0.15, dep = T / 2 + PLAN_RULES.doorClear;
    z.push(w.horizontal ? { x0: g.at - hw, x1: g.at + hw, z0: w.fixed - dep, z1: w.fixed + dep } : { x0: w.fixed - dep, x1: w.fixed + dep, z0: g.at - hw, z1: g.at + hw });
  }
  return z;
}
export function doorXZ(row, d) { return d.side === 'N' ? [d.at, row.z0] : d.side === 'S' ? [d.at, row.z1] : d.side === 'W' ? [row.x0, d.at] : [row.x1, d.at]; }
const ROOM_PREF = { corr18: 0, corr24: 0, hall: 0, officelobby: 1, schoollobby: 1, frontdesk: 1, living: 2, floor: 2, sales: 2, diningroom: 3, dining: 3, stock: 4 };
// Where a flight from floor `from` to the floor above goes: its run along a wall of a room, its foot's landing in that room,
// its head's landing in a room of the floor above (on its deck), clear of doorways, partitions and other flights on both
// floors. Tried room by room (halls and the day rooms first), face by face, along each wall from its corners. Returns a
// flight or null.
export function placeFlight(row, from, avoid = []) {
  const A = row.floors[from], B = row.floors[from + 1];
  if (!A || !B) return null;
  const run = runOf(row, from), fw = FLIGHT.w, deck = deckOf(row, from + 1);
  const zA = doorZones(row, from), zB = doorZones(row, from + 1), wA = A.walls.map(wallRect), wB = B.walls.map(wallRect);
  const others = (row.flights ?? []).filter((f) => f.from === from || f.from === from + 1 || f.from === from - 1).concat(avoid);
  const used = others.flatMap((f) => { const l = landings(f); return [f, l.bottom, l.top]; });
  const rooms = A.rooms.map((r, i) => ({ r, i })).sort((p, q) => (ROOM_PREF[p.r.type] ?? 6) - (ROOM_PREF[q.r.type] ?? 6) || (q.r.x1 - q.r.x0) * (q.r.z1 - q.r.z0) - (p.r.x1 - p.r.x0) * (p.r.z1 - p.r.z0));
  // The last word on a candidate: the nav rule itself, on both floors (walls, partitions, the stairs already there), so a
  // run never seals a doorway's approach or a room, and the walker can step off at its head and reach every room above.
  const pa = new NavProbe(64), pb = new NavProbe(64);
  const fill = (p, k) => { p.reset(row.x0, row.z0, row.x1, row.z1, 2); for (const b of navBoxes(row, k)) p.add(b); };
  fill(pa, from); fill(pb, from + 1);
  const startsA = from === 0 ? A.doors.map((d) => doorXZ(row, d)) : (row.flights ?? []).filter((f) => f.from === from - 1).map((f) => headCell(row, f) ?? landings(f).head);
  const proves = (f, l) => {
    const box = { x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1 };
    pa.add(box); pa.flood(startsA);
    const okA = A.rooms.every((q) => pa.roomReached(q)) && landingReached(pa, l.bottom);
    pa.add(box, -1);
    if (!okA) return false;
    pb.add(box); const head = headCell({ ...row, flights: [f] }, f); pb.flood(head ? [head] : []);
    const okB = !!head && B.rooms.every((q) => pb.roomReached(q));
    pb.add(box, -1);
    return okB;
  };
  for (const { r } of rooms) {
    for (const face of ['N', 'S', 'W', 'E']) {
      const ax = face === 'N' || face === 'S' ? 'x' : 'z';
      const across = ax === 'x' ? r.z1 - r.z0 : r.x1 - r.x0;
      if (across < fw + 1.9) continue; // a walker passes beside it (a 1 m nav cell clear of both, wherever the grid falls)
      const c0 = face === 'N' ? r.z0 + 0.02 : face === 'S' ? r.z1 - fw - 0.02 : face === 'W' ? r.x0 + 0.02 : r.x1 - fw - 0.02, c1 = c0 + fw;
      const lo = (ax === 'x' ? r.x0 : r.z0) + 0.05, hi = (ax === 'x' ? r.x1 : r.z1) - 0.05;
      // Along the wall in 0.25 m steps, and flush with either end (a head that lands right on a mezzanine's edge).
      const at = [lo - 0.05, hi + 0.05 - run];
      for (let s = lo; s + run <= hi + 1e-6; s += 0.25) at.push(s);
      for (const dir of [1, -1]) {
        for (const s of at) {
          const f = ax === 'x' ? { from, x0: r2(s), x1: r2(s + run), z0: r2(c0), z1: r2(c1), axis: ax, dir } : { from, z0: r2(s), z1: r2(s + run), x0: r2(c0), x1: r2(c1), axis: ax, dir };
          const l = landings(f);
          if (!within(l.bottom, r, 0.06) || !standable(l.bottom, r, f)) continue;      // its foot on this floor, in this room
          const up = B.rooms.find((q) => within(l.top, q, 0.06));
          if (!within(l.top, deck, 0.02) || !up || !standable(l.top, up, f)) continue; // its head upstairs, on the deck
          if (zA.some((z) => overlap(f, z)) || zB.some((z) => overlap(f, z) || overlap(l.top, z))) continue;
          if (wA.some((w) => overlap(f, w, 0.01) || overlap(l.bottom, w, 0.01)) || wB.some((w) => overlap(f, w, 0.01) || overlap(l.top, w, 0.01))) continue;
          if (used.some((u) => overlap(f, u) || overlap(l.bottom, u) || overlap(l.top, u))) continue;
          if (!proves(f, l)) continue;
          return f;
        }
      }
    }
  }
  return null;
}

// ---- from the generator ---------------------------------------------------------------------------------------------
// A row from a floorplan() result (world/floorplan.js) for a footprint centred on the origin: the plan's rooms and
// partitions, a front door per unit, a back door where the kind's `back` odds say (the plan's best spot), and for a plan
// row with `up` (a depot's mezzanine) the floor above and its flight. kind's KINDS row gives the heights.
export function rowFromPlan({ kind, zone, front, w, d, seed, units = 1, fp, h }) {
  const K = KINDS[kind], x0 = r2(-w / 2), z0 = r2(-d / 2), x1 = r2(w / 2), z1 = r2(d / 2);
  const rng = planRng(hash32(seed, 0x4c414232));
  const wallH = r2(h ?? K.h[0] + (K.h[1] - K.h[0]) * rng());
  const doors = fp.front.map((at, u) => ({ side: front, at, w: K.bay ?? RING.door, kind: K.bay ? 'bay' : 'front', unit: u }));
  for (let u = 0; u < units; u++) {
    if (rng() >= (K.back ?? 0)) continue;
    const c = fp.back.find((q) => q.unit === u && !doors.some((o) => o.side === q.side && Math.abs(o.at - q.at) < (o.w + RING.backDoor) / 2 + 0.6));
    if (c) doors.push({ side: c.side, at: c.at, w: RING.backDoor, kind: 'back', unit: u });
  }
  const row = {
    v: AUTHORED_V, id: `lab-${kind}-${seed}`, name: '', kind, zone, front, x0, z0, x1, z1, h: wallH, top: wallH, seed, units, walkway: K.walkway ?? 0, plan: fp.plans[0],
    floors: [{ y: 0, deck: null, rooms: fp.rooms.map((r) => ({ type: r.type, x0: r2(r.x0), z0: r2(r.z0), x1: r2(r.x1), z1: r2(r.z1), unit: r.unit })), walls: fp.inner.map((q) => ({ horizontal: q.horizontal, fixed: r2(q.fixed), a0: r2(q.a0), a1: r2(q.a1), gaps: q.gaps.map((g) => ({ at: r2(g.at), w: g.w })), ...(q.party ? { party: true } : {}) })), doors }],
    flights: [],
  };
  const P = PLANS[kind]?.find((q) => q.id === fp.plans[0]);
  for (const up of P?.up ?? []) {
    // A mezzanine over the rooms that do not touch the front wall, at the kind's mezzanine height; the shed rises to h.
    const back = row.floors[0].rooms.filter((r) => !(front === 'N' ? r.z0 < z0 + T : front === 'S' ? r.z1 > z1 - T : front === 'W' ? r.x0 < x0 + T : r.x1 > x1 - T));
    if (!back.length) continue;
    const I = interior(row), bb = { x0: Math.min(...back.map((r) => r.x0)), z0: Math.min(...back.map((r) => r.z0)), x1: Math.max(...back.map((r) => r.x1)), z1: Math.max(...back.map((r) => r.z1)) };
    // (its open edge over the partition, flush with the front room's face: a flight's head lands right on it)
    const deck = { x0: bb.x0 > I.x0 + 0.01 ? r2(bb.x0 - T) : I.x0, z0: bb.z0 > I.z0 + 0.01 ? r2(bb.z0 - T) : I.z0, x1: bb.x1 < I.x1 - 0.01 ? r2(bb.x1 + T) : I.x1, z1: bb.z1 < I.z1 - 0.01 ? r2(bb.z1 + T) : I.z1 };
    row.h = K.mezz ?? STOREY.up;
    row.shed = wallH; // the shed's walls rise past the mezzanine to the roof
    row.floors.push({ y: row.h, deck, rooms: [{ type: up.room, ...deck, unit: 0 }], walls: [] });
    const f = placeFlight(row, 0);
    if (f) row.flights.push(f); else { row.floors.pop(); row.h = wallH; delete row.shed; }
  }
  topOf(row);
  return row;
}
// The wall top: a storey's height over the top floor, or the street storey's own walls, or a shed's.
function topOf(row) {
  const n = row.floors.length;
  row.top = r2(Math.max(row.h, row.shed ?? 0, n > 1 ? floorY(row, n - 1) + STOREY.up : 0));
  row.floors.forEach((f, k) => { f.y = r2(floorY(row, k)); });
  return row;
}

// A storey on top: a copy of the floor below's rooms and partitions (an office floor over an office floor), or one open
// room, with a flight up to it placed by the storeys rules. Returns the row, or an error string (no wall had room).
export function addStorey(row, mode = 'copy', type = null) {
  const n = row.floors.length, below = row.floors[n - 1], I = interior(row);
  const f = mode === 'copy' && !below.deck
    ? { y: 0, deck: null, rooms: clone(below.rooms), walls: clone(below.walls) }
    : { y: 0, deck: null, rooms: [{ type: type ?? 'living', ...I, unit: 0 }], walls: [] };
  row.floors.push(f);
  topOf(row);
  const fl = placeFlight(row, n - 1);
  if (!fl) { const run = r2(runOf(row, n - 1)); row.floors.pop(); topOf(row); return `no room on floor ${n - 1} has a wall long enough for a flight (${run} m run + two ${FLIGHT.landing} m landings, ${FLIGHT.w} m wide, room to pass beside it) clear of its doorways`; }
  row.flights.push(fl);
  return topOf(row);
}
export function removeStorey(row) {
  if (row.floors.length < 2) return row;
  row.floors.pop();
  row.flights = row.flights.filter((f) => f.from + 1 < row.floors.length);
  return topOf(row);
}
export { topOf };

// ---- into the ring ---------------------------------------------------------------------------------------------------
// compile(P): what world/ring.js geo() reads from a lot with `authored` set: its street storey's plan in floorplan()'s
// format, its doors, its heights, and the two hooks geo() calls (before the furniture: the stairs and the shell above;
// after: the roof lifted to the wall top).
export function compile(P, opt = {}) {
  const f0 = P.floors[0];
  const rooms = f0.rooms.map((r) => ({ type: r.type, name: ROOMS[r.type]?.name ?? String(r.type).toUpperCase(), x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, unit: r.unit ?? 0, entry: false }));
  for (const d of f0.doors) if (d.kind !== 'back') {
    const [x, z] = doorXZ(P, d), r = rooms.find((q) => x > q.x0 - 0.6 && x < q.x1 + 0.6 && z > q.z0 - 0.6 && z < q.z1 + 0.6);
    if (r) r.entry = true;
  }
  return {
    P, h: P.h, top: P.top ?? P.h, units: P.units ?? 1,
    fp: { rooms, inner: clone(f0.walls), front: [], back: [], plans: [P.id] },
    doors: f0.doors.map((d) => ({ at: d.at, w: d.w, kind: d.kind, unit: d.unit ?? 0, side: d.side })),
    before: (ring, g, L) => {
      // The street storey's flights: the run is solid (its high end is a ceiling away), its foot's landing kept clear.
      g.clear = [];
      for (const f of P.flights.filter((q) => q.from === 0)) {
        g.boxes.push({ x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1, h: P.h, tag: 'furniture', holes: null });
        g.props.push(...treads(P, f, 0));
        const l = landings(f);
        g.clear.push({ x0: l.bottom.x0 - 0.15, z0: l.bottom.z0 - 0.15, x1: l.bottom.x1 + 0.15, z1: l.bottom.z1 + 0.15 });
      }
      if (opt.shell !== false) for (const e of shellAbove(P, L.color)) g.walls.push(e);
      if (P.walkway > 0) walkway(P, g);
    },
    after: (ring, g) => { const lift = (P.top ?? P.h) - P.h; if (lift > 0.01) for (const e of g.roof) e[1] += lift; },
  };
}
// A flight's steps as boxes from its floor to each tread (they read as a stair from above), at floor `k`'s height.
export function treads(P, f, k) {
  const rise = riseOf(P, f.from), n = Math.max(4, Math.round(rise / 0.18)), y0 = floorY(P, f.from), ax = f.axis === 'x';
  const lo = ax ? f.x0 : f.z0, len = (ax ? f.x1 : f.z1) - lo, c0 = ax ? f.z0 : f.x0, c1 = ax ? f.z1 : f.x1, out = [];
  for (let i = 0; i < n; i++) {
    const t = f.dir > 0 ? i : n - 1 - i, a = lo + (t * len) / n, b = a + len / n, top = ((i + 1) * rise) / n;
    const shade = 0.82 + 0.18 * ((i % 2) ? 1 : 0.9);
    out.push(ax ? [(a + b) / 2, y0 + top / 2, (c0 + c1) / 2, b - a, top, c1 - c0, '#8a8478', 0, shade] : [(c0 + c1) / 2, y0 + top / 2, (a + b) / 2, c1 - c0, top, b - a, '#8a8478', 0, shade]);
  }
  void k;
  return out;
}
// The outside walls above the street storey (to the wall top), a window per WINDOWS.every metres on each floor's band.
export function shellAbove(P, col = '#b9a98a') {
  const out = [], top = P.top ?? P.h;
  if (top <= P.h + 0.05) return out;
  const sides = [[true, P.z0, P.x0 - T / 2, P.x1 + T / 2], [true, P.z1, P.x0 - T / 2, P.x1 + T / 2], [false, P.x0, P.z0 + T / 2, P.z1 - T / 2], [false, P.x1, P.z0 + T / 2, P.z1 - T / 2]];
  const piece = (hz, fixed, a0, a1, y0, y1, shade = 1) => { if (a1 - a0 < 0.05 || y1 - y0 < 0.02) return; out.push(hz ? [(a0 + a1) / 2, (y0 + y1) / 2, fixed, a1 - a0, y1 - y0, T, col, 0, shade] : [fixed, (y0 + y1) / 2, (a0 + a1) / 2, T, y1 - y0, a1 - a0, col, 0, shade]); };
  const bands = [];
  for (let k = 1; k < P.floors.length; k++) bands.push([floorY(P, k), k + 1 < P.floors.length ? floorY(P, k + 1) : top]);
  if (!bands.length) bands.push([P.h, top]);
  for (const [hz, fixed, a0, a1] of sides) for (const [y0, y1] of bands) {
    const len = a1 - a0, n = Math.max(0, Math.floor(len / WINDOWS.every)), ws = WINDOWS.sill, wh = Math.min(WINDOWS.h, y1 - y0 - ws - 0.3);
    if (wh < 0.4 || !n) { piece(hz, fixed, a0, a1, y0, y1); continue; }
    piece(hz, fixed, a0, a1, y0, y0 + ws);
    piece(hz, fixed, a0, a1, y0 + ws + wh, y1);
    let c = a0;
    for (let i = 0; i < n; i++) { const m = a0 + ((i + 0.5) * len) / n; piece(hz, fixed, c, m - WINDOWS.w / 2, y0 + ws, y0 + ws + wh); piece(hz, fixed, m - WINDOWS.w / 2, m + WINDOWS.w / 2, y0 + ws, y0 + ws + 0.06, 0.6); c = m + WINDOWS.w / 2; }
    piece(hz, fixed, c, a1, y0 + ws, y0 + ws + wh);
  }
  return out;
}
// A motel's covered walk along its front: a concrete slab, a canopy on posts every few metres.
function walkway(P, g) {
  const d = P.walkway, f = P.front, h = P.h;
  const r = f === 'N' ? { x0: P.x0 - 0.6, x1: P.x1 + 0.6, z0: P.z0 - d - T / 2, z1: P.z0 - T / 2 } : f === 'S' ? { x0: P.x0 - 0.6, x1: P.x1 + 0.6, z0: P.z1 + T / 2, z1: P.z1 + d + T / 2 }
    : f === 'W' ? { z0: P.z0 - 0.6, z1: P.z1 + 0.6, x0: P.x0 - d - T / 2, x1: P.x0 - T / 2 } : { z0: P.z0 - 0.6, z1: P.z1 + 0.6, x0: P.x1 + T / 2, x1: P.x1 + d + T / 2 };
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, sx = r.x1 - r.x0, sz = r.z1 - r.z0, along = f === 'N' || f === 'S';
  g.props.push([cx, 0.09, cz, sx, 0.18, sz, '#a8a090', 0, 1]);
  g.canopy.push([cx, h + 0.05, cz, sx + 0.4, 0.2, sz + 0.5, '#8a7a5a', 0, 1]);
  const len = along ? sx : sz, n = Math.max(2, Math.round(len / 4.5));
  for (let i = 0; i <= n; i++) {
    const a = (along ? r.x0 : r.z0) + 0.3 + ((len - 0.6) * i) / n;
    const out = f === 'N' ? r.z0 + 0.25 : f === 'S' ? r.z1 - 0.25 : f === 'W' ? r.x0 + 0.25 : r.x1 - 0.25;
    const x = along ? a : out, z = along ? out : a;
    g.props.push([x, h / 2, z, 0.2, h, 0.2, '#4a4642', 0, 1]);
    g.boxes.push({ x0: x - 0.12, z0: z - 0.12, x1: x + 0.12, z1: z + 0.12, h, tag: 'post', holes: null });
  }
}

// ---- the floors above (the lab draws them; the proof walks them) -------------------------------------------------------
// One upper floor as geometry at its own height: the deck (with its holes), its outside band's inner faces are the shell's,
// its partitions with their doorways, rails round a stairwell and along a mezzanine's edge, its furniture placed and proved
// by the ring's own furnish() (world/ring.js) from the flight's head as its door, and the flights up from it.
// Returns { y, deck: [pieces], walls, props, rails, boxes (2D, for the nav probe), rooms, beds, starts }.
export function upperFloor(ring, L, P, k) {
  const F = P.floors[k], y = floorY(P, k), yUp = k + 1 < P.floors.length ? floorY(P, k + 1) : P.top ?? y + STOREY.up;
  const I = interior(P), deck = deckOf(P, k), out = { y, deck: [], walls: [], props: [], rails: [], boxes: [], rooms: [], beds: [], boxesIn: [], starts: [] };
  const col = L.color ?? '#b9a98a';
  // The deck: its rect less the holes of the flights that arrive through it.
  let pieces = [deck];
  const arriving = P.flights.filter((f) => f.from === k - 1), leaving = P.flights.filter((f) => f.from === k);
  for (const f of arriving) pieces = pieces.flatMap((p) => cut(p, f));
  for (const p of pieces) out.deck.push([(p.x0 + p.x1) / 2, y - STOREY.slab / 2 + 0.12, (p.z0 + p.z1) / 2, p.x1 - p.x0, STOREY.slab, p.z1 - p.z0, '#8a8274', 0, 1]);
  // Walking: the outside walls, the void beyond a mezzanine's deck, the stairwells, the partitions.
  const B = (x0, z0, x1, z1, tag = 'wall') => out.boxes.push({ x0, z0, x1, z1, h: yUp - y, tag, holes: null });
  B(P.x0 - T / 2, P.z0 - T / 2, P.x1 + T / 2, P.z0 + T / 2); B(P.x0 - T / 2, P.z1 - T / 2, P.x1 + T / 2, P.z1 + T / 2);
  B(P.x0 - T / 2, P.z0, P.x0 + T / 2, P.z1); B(P.x1 - T / 2, P.z0, P.x1 + T / 2, P.z1);
  for (const v of cut(I, deck)) B(v.x0, v.z0, v.x1, v.z1, 'void');
  for (const f of arriving) B(f.x0, f.z0, f.x1, f.z1, 'void');
  for (const f of leaving) B(f.x0, f.z0, f.x1, f.z1, 'furniture');
  const hh = (yUp - y) * 0.96;
  for (const w of F.walls) for (const s of spans(w)) {
    B(s.x0, s.z0, s.x1, s.z1);
    out.walls.push([(s.x0 + s.x1) / 2, y + hh / 2, (s.z0 + s.z1) / 2, s.x1 - s.x0, hh, s.z1 - s.z0, col, 0, 0.94]);
  }
  // Rails: three sides of a stairwell (its head end open), and a mezzanine's open edges (open where a flight arrives).
  const rail = (x0, z0, x1, z1) => { if (x1 - x0 < 0.05 && z1 - z0 < 0.05) return; out.rails.push([(x0 + x1) / 2, y + 0.12 + RAIL.h / 2, (z0 + z1) / 2, Math.max(RAIL.t, x1 - x0), RAIL.h, Math.max(RAIL.t, z1 - z0), '#3d3a36', 0, 1]); };
  for (const f of arriving) {
    if (!within(f, deck, 0.01) && !overlap(f, deck)) continue;
    const ax = f.axis === 'x', t = RAIL.t;
    if (ax) { rail(f.x0, f.z0 - t, f.x1, f.z0); rail(f.x0, f.z1, f.x1, f.z1 + t); if (f.dir > 0) rail(f.x0 - t, f.z0, f.x0, f.z1); else rail(f.x1, f.z0, f.x1 + t, f.z1); }
    else { rail(f.x0 - t, f.z0, f.x0, f.z1); rail(f.x1, f.z0, f.x1 + t, f.z1); if (f.dir > 0) rail(f.x0, f.z0 - t, f.x1, f.z0); else rail(f.x0, f.z1, f.x1, f.z1 + t); }
  }
  for (const [edge, along] of [['z0', 'x'], ['z1', 'x'], ['x0', 'z'], ['x1', 'z']]) {
    const at = deck[edge];
    if (Math.abs(at - I[edge]) < 0.02) continue; // the outside wall is this edge
    const a0 = deck[along + '0'], a1 = deck[along + '1'];
    // Open where a flight's head lands against this edge.
    const gaps = arriving.map((f) => landings(f).top).filter((l) => Math.abs(l[edge] - at) < 0.3)
      .map((l) => (along === 'x' ? [l.x0, l.x1] : [l.z0, l.z1])).sort((p, q) => p[0] - q[0]);
    let c = a0;
    for (const [g0, g1] of gaps) { if (g0 > c) (along === 'x' ? rail(c, at - RAIL.t / 2, g0, at + RAIL.t / 2) : rail(at - RAIL.t / 2, c, at + RAIL.t / 2, g0)); c = Math.max(c, g1); }
    if (a1 > c) (along === 'x' ? rail(c, at - RAIL.t / 2, a1, at + RAIL.t / 2) : rail(at - RAIL.t / 2, c, at + RAIL.t / 2, a1));
  }
  for (const f of leaving) out.props.push(...treads(P, f, k));
  // Furniture: the ring's own furnish(), with each arriving flight's head as a door (its clearance, the probe's start).
  const g = { walls: [], boxes: out.boxes.slice(), props: [], beds: [], boxesIn: [], doors: [], inner: F.walls.map((w) => ({ ...w, gaps: w.gaps.map((q) => ({ ...q })) })), clear: [] };
  for (const f of arriving) {
    // The walker steps off at the head's first standable cell (by the nav rule), the landing's own room around it.
    const l = landings(f), ax = f.axis === 'x', room = F.rooms.find((q) => within(l.top, q, 0.06)) ?? deck, [hx, hz] = standable(l.top, room, f) ?? l.head;
    g.doors.push({ x: hx, z: hz, nx: ax ? -f.dir : 0, nz: ax ? 0 : -f.dir, w: FLIGHT.w, kind: 'stair' });
    out.starts.push([hx, hz]);
  }
  for (const f of leaving) { const l = landings(f); g.clear.push({ x0: l.bottom.x0 - 0.15, z0: l.bottom.z0 - 0.15, x1: l.bottom.x1 + 0.15, z1: l.bottom.z1 + 0.15 }); }
  const rooms = F.rooms.map((r) => ({ type: r.type, name: ROOMS[r.type]?.name ?? r.type, x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, ui: r.unit ?? 0, unit: null, frontRoom: false, back: r.type === 'bedroom', office: r.type === 'office' }));
  out.rooms = rooms;
  if (ring && rooms.length) {
    const K = KINDS[P.kind] ?? KINDS.house, Z = ZONES[P.zone] ?? ZONES.residential;
    ring.furnish({ x0: P.x0, z0: P.z0, x1: P.x1, z1: P.z1 }, g, rooms, K, Z, rngOf(hash32(P.seed >>> 0, 0x55500 + k)), []);
  }
  for (const e of g.props) {
    // A floor finish (a thin sheet on the slab) has the stairwell cut out of it too.
    if (e[4] < 0.02 && e[1] < 0.2 && arriving.length) {
      let parts = [{ x0: e[0] - e[3] / 2, x1: e[0] + e[3] / 2, z0: e[2] - e[5] / 2, z1: e[2] + e[5] / 2 }];
      for (const f of arriving) parts = parts.flatMap((p) => cut(p, f));
      for (const p of parts) out.props.push([(p.x0 + p.x1) / 2, e[1] + y, (p.z0 + p.z1) / 2, p.x1 - p.x0, e[4], p.z1 - p.z0, e[6], e[7], e[8]]);
      continue;
    }
    out.props.push([e[0], e[1] + y, e[2], e[3], e[4], e[5], e[6], e[7], e[8]]);
  }
  out.boxes = g.boxes; out.beds = g.beds; out.boxesIn = g.boxesIn;
  return out;
}
// Rect a less rect b: up to four rects.
function cut(a, b) {
  if (!overlap(a, b)) return [a];
  const o = [], x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1);
  if (b.z0 > a.z0) o.push({ x0: a.x0, x1: a.x1, z0: a.z0, z1: b.z0 });
  if (b.z1 < a.z1) o.push({ x0: a.x0, x1: a.x1, z0: b.z1, z1: a.z1 });
  const z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1);
  if (b.x0 > a.x0) o.push({ x0: a.x0, x1: x0, z0, z1 });
  if (b.x1 < a.x1) o.push({ x0: x1, x1: a.x1, z0, z1 });
  return o.filter((r) => r.x1 - r.x0 > 0.01 && r.z1 - r.z0 > 0.01);
}

// ---- the proof -------------------------------------------------------------------------------------------------------
// The reachability proof (the ring's own rule: NavProbe, world/floorplan.js - 1 m cells, boxes grown by the walker's 0.45 m,
// 8 neighbours, no corner cutting): the street storey flooded from its doors, each floor above from the heads of the
// flights whose feet were reached below. Every room reached, every open cell inside reached (no sealed pocket), every bed
// with a reached cell beside it, every doorway clear (open and reached on both sides), every flight's foot reached and its
// head on a deck. Rooms under their row's minimum are warnings. Returns { ok, problems: [{ floor, kind, text, at }],
// warnings, floors: [{ k, rooms: [{ i, reached }], cells, beds, doors, flights }] }.
export function prove(ring, L, geo = null) {
  const P = L.authored.P, g = geo ?? ring.geo(L), probe = new NavProbe(64), problems = [], warnings = [], floors = [];
  const fpRooms = g.rooms;
  const footFor = new Map();
  for (let k = 0; k < P.floors.length; k++) {
    const F = P.floors[k], up = k ? upperFloor(ring, L, P, k) : null;
    const boxes = k ? up.boxes : g.boxes, rooms = k ? up.rooms : fpRooms;
    probe.reset(P.x0, P.z0, P.x1, P.z1, 2);
    for (const b of boxes) probe.add(b);
    const starts = k ? (up.starts.filter((s, i) => footFor.get(P.flights.filter((f) => f.from === k - 1)[i]))) : g.doors.filter((d) => !d.barricade).map((d) => [d.x, d.z]);
    probe.flood(starts);
    const rep = { k, y: floorY(P, k), rooms: [], cells: [], beds: [], doors: [], flights: [], starts: starts.length };
    // A floor nothing reaches is one problem, not one per room and doorway (they are still marked on the plan).
    const cutOff = !starts.length, say = (p) => { if (!cutOff) problems.push(p); };
    if (cutOff) problems.push({ floor: k, kind: 'floor', text: k ? `floor ${k}: no stairs reach it (no flight's foot below is reachable) - its ${rooms.length} rooms are cut off` : 'floor 0: no way in (no open outside door)' });
    rooms.forEach((r, i) => {
      const ok = probe.roomReached(r);
      rep.rooms.push({ i, type: r.type, reached: ok });
      if (!ok) say({ floor: k, kind: 'room', i, text: `floor ${k}: ${ROOMS[r.type]?.name ?? r.type} (${r2(r.x1 - r.x0)} x ${r2(r.z1 - r.z0)} m) cannot be reached`, at: [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2] });
      const R = ROOMS[r.type], mn = Math.min(r.x1 - r.x0, r.z1 - r.z0), need = R ? (R.fix ? R.fix : Math.min(R.min, R.max ?? R.min)) : 0;
      if (R && mn < need - 0.05) warnings.push({ floor: k, kind: 'size', i, text: `floor ${k}: ${R.name} is ${r2(mn)} m across, its row wants ${need} m`, at: [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2] });
    });
    // Open cells inside the walls that nothing reaches (a pocket sealed off by furniture or a wall).
    const I = deckOf(P, k);
    for (let j = 0; j < probe.nz; j++) for (let i = 0; i < probe.nx; i++) {
      const x = probe.ox + i + 0.5, z = probe.oz + j + 0.5;
      if (x < I.x0 || x > I.x1 || z < I.z0 || z > I.z1) continue;
      if (probe.cnt[j * probe.nx + i] === 0 && !probe.reached(x, z)) rep.cells.push([x, z]);
    }
    if (rep.cells.length && rooms.every((r, i) => rep.rooms[i].reached)) problems.push({ floor: k, kind: 'cells', text: `floor ${k}: ${rep.cells.length} m² of floor sealed off (furniture or a wall closes a pocket)`, at: rep.cells[0] });
    const roomAt = (x, z) => rooms.findIndex((r) => x > r.x0 - 0.05 && x < r.x1 + 0.05 && z > r.z0 - 0.05 && z < r.z1 + 0.05);
    const reachedAt = (x, z) => { const i = roomAt(x, z); return i < 0 || rep.rooms[i].reached; };
    for (const b of (k ? up.beds : g.beds)) { const ok = probe.near(b.x, b.z); rep.beds.push({ x: b.x, z: b.z, ok }); if (!ok && reachedAt(b.x, b.z)) say({ floor: k, kind: 'bed', text: `floor ${k}: a bed at (${r2(b.x)}, ${r2(b.z)}) has no reachable floor beside it`, at: [b.x, b.z] }); }
    // Doorways: open, and reached on both sides (a perpendicular wall or a piece of furniture can close one off).
    // (each side: a reached cell in the doorway's own width within 1.5 m of the wall)
    const side = (w, gp, s) => { const a = w.fixed + s * T / 2, b = w.fixed + s * (T / 2 + 1.5), lo = Math.min(a, b), hi = Math.max(a, b); return w.horizontal ? { x0: gp.at - gp.w / 2, x1: gp.at + gp.w / 2, z0: lo, z1: hi } : { z0: gp.at - gp.w / 2, z1: gp.at + gp.w / 2, x0: lo, x1: hi }; };
    for (const w of F.walls) for (const gp of w.gaps) {
      const ok = landingReached(probe, side(w, gp, -1)) && landingReached(probe, side(w, gp, 1));
      rep.doors.push({ x: w.horizontal ? gp.at : w.fixed, z: w.horizontal ? w.fixed : gp.at, ok, inner: true });
      // (a doorway into a room already reported cut off says nothing new)
      const a = w.horizontal ? [gp.at, w.fixed - 0.8] : [w.fixed - 0.8, gp.at], b = w.horizontal ? [gp.at, w.fixed + 0.8] : [w.fixed + 0.8, gp.at];
      if (!ok && reachedAt(...a) && reachedAt(...b)) say({ floor: k, kind: 'door', text: `floor ${k}: the doorway at (${r2(w.horizontal ? gp.at : w.fixed)}, ${r2(w.horizontal ? w.fixed : gp.at)}) is not clear on both sides`, at: w.horizontal ? [gp.at, w.fixed] : [w.fixed, gp.at] });
    }
    if (!k) for (const d of g.doors) {
      if (d.barricade) continue;
      const hw = d.w / 2, x0 = d.nx ? Math.min(d.x, d.x - d.nx * 1.7) : d.x - hw, x1 = d.nx ? Math.max(d.x, d.x - d.nx * 1.7) : d.x + hw, z0 = d.nz ? Math.min(d.z, d.z - d.nz * 1.7) : d.z - hw, z1 = d.nz ? Math.max(d.z, d.z - d.nz * 1.7) : d.z + hw;
      const ok = landingReached(probe, { x0, z0, x1, z1 });
      rep.doors.push({ x: d.x, z: d.z, ok, inner: false });
      if (!ok) problems.push({ floor: 0, kind: 'door', text: `floor 0: the ${d.kind} door at (${r2(d.x)}, ${r2(d.z)}) opens onto nothing reachable inside`, at: [d.x, d.z] });
    }
    // Flights up from here: the foot's landing reached; the head on the next floor's deck, in a room.
    for (const f of P.flights.filter((q) => q.from === k)) {
      const l = landings(f), ok = landingReached(probe, l.bottom);
      const deckOK = within(l.top, deckOf(P, k + 1), 0.05) && (P.floors[k + 1]?.rooms ?? []).some((q) => within(l.top, q, 0.08));
      footFor.set(f, ok && deckOK);
      rep.flights.push({ i: P.flights.indexOf(f), foot: ok, head: deckOK });
      if (!ok) say({ floor: k, kind: 'flight', text: `floor ${k}: the foot of the stairs up to floor ${k + 1} cannot be reached`, at: l.foot });
      if (!deckOK) problems.push({ floor: k + 1, kind: 'flight', text: `floor ${k + 1}: the head of the stairs from floor ${k} lands off the floor (off its deck or across a wall)`, at: l.head });
      const crossA = F.walls.some((w) => spans(w).some((s) => overlap(f, s, 0.01))), crossB = (P.floors[k + 1]?.walls ?? []).some((w) => spans(w).some((s) => overlap(f, s, 0.01)));
      if (crossA || crossB) problems.push({ floor: crossA ? k : k + 1, kind: 'flight', text: `floor ${crossA ? k : k + 1}: the stairs run through a wall`, at: [(f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2] });
    }
    floors.push(rep);
  }
  return { ok: !problems.length, problems, warnings, floors };
}
function landingReached(probe, r) {
  for (let z = Math.floor(r.z0) + 0.5; z < r.z1 + 0.5; z += 1) for (let x = Math.floor(r.x0) + 0.5; x < r.x1 + 0.5; x += 1) if (x > r.x0 - 0.5 && x < r.x1 + 0.5 && z > r.z0 - 0.5 && z < r.z1 + 0.5 && probe.reached(x, z)) return true;
  return false;
}

// ---- standing one in the ring -----------------------------------------------------------------------------------------
// Ring.makeBlock calls this after laying a block's lots (world/ring.js): every authored row whose site is in this block
// replaces its lot, or clears the lots it covers and stands as a new one. A row that does not fit is left out (a reason
// in ring.authoredErrors). With no authored rows the ring is exactly what it was.
export function placeAuthored(ring, b) {
  ring.authoredErrors ??= [];
  ring.authored.forEach((row, i) => {
    const site = row.site ?? {};
    if (site.lot) {
      const [k, j] = site.lot.slice(1).split('.').map(Number);
      if (k !== b.k || j !== b.j) return;
      const L = b.lots.find((q) => q.id === site.lot && !q.empty);
      if (!L) return void ring.authoredErrors.push(`${row.id}: lot ${site.lot} has no building`);
      const P = place(row, (L.x0 + L.x1) / 2, (L.z0 + L.z1) / 2, L.front);
      if (!within(P, { x0: L.lot.x0 + 0.5, z0: L.lot.z0 + 0.5, x1: L.lot.x1 - 0.5, z1: L.lot.z1 - 0.5 })) return void ring.authoredErrors.push(`${row.id}: ${r2(P.x1 - P.x0)} x ${r2(P.z1 - P.z0)} m does not fit lot ${site.lot}`);
      stand(L, P, b);
      return;
    }
    if (site.x === undefined || Math.floor(site.x / RING.grid) !== b.k || Math.floor(site.z / RING.grid) !== b.j) return;
    if (!b.city) return void ring.authoredErrors.push(`${row.id}: (${site.x}, ${site.z}) is not in the ring's city`);
    const P = place(row, site.x, site.z, site.front ?? row.front);
    const yard = Math.max(3, (P.walkway ?? 0) + 1.5);
    if (!within(P, { x0: b.x0 + 1, z0: b.z0 + 1, x1: b.x1 - 1, z1: b.z1 - 1 })) return void ring.authoredErrors.push(`${row.id}: the footprint leaves block ${b.k},${b.j} (keep it inside its streets)`);
    const ground = { x0: Math.max(b.x0, P.x0 - yard), z0: Math.max(b.z0, P.z0 - yard), x1: Math.min(b.x1, P.x1 + yard), z1: Math.min(b.z1, P.z1 + yard) };
    b.lots = b.lots.filter((q) => !(overlap(q.lot, ground) || (!q.empty && overlap(q, ground))));
    const L = { id: `R${b.k}.${b.j}.${50 + i}`, kind: row.kind, zone: b.zone, front: P.front, x0: P.x0, z0: P.z0, x1: P.x1, z1: P.z1, lot: ground, cx: (P.x0 + P.x1) / 2, cz: (P.z0 + P.z1) / 2, seed: row.seed >>> 0, ok: true, blockKey: `${b.k},${b.j}` };
    stand(L, P, b);
    b.lots.push(L);
  });
}
function stand(L, P, b) {
  Object.assign(L, { kind: P.kind, x0: P.x0, z0: P.z0, x1: P.x1, z1: P.z1, cx: (P.x0 + P.x1) / 2, cz: (P.z0 + P.z1) / 2, front: P.front, seed: P.seed >>> 0, ruined: false, hh: null, geo: undefined, authored: compile(P) });
  if (!KINDS[P.kind]) L.kind = 'house';
  void b;
}
// Add (or replace, by id) an authored row on a live ring and drop what it changes: the block's cache, ownership, the
// quarter picks. Returns the chunks to lay out again (the block's and every chunk next to them: buildings clip into their
// neighbours). removeAuthored(ring, id) takes one away the same way.
export function addAuthored(ring, row) {
  const err = checkRow(row);
  if (err) return { error: err };
  ring.authored = ring.authored.filter((q) => q.id !== row.id).concat([row]);
  return { chunks: dropFor(ring, row) };
}
export function removeAuthored(ring, id) {
  const row = ring.authored.find((q) => q.id === id);
  if (!row) return { error: `no authored building ${id}` };
  ring.authored = ring.authored.filter((q) => q.id !== id);
  return { chunks: dropFor(ring, row) };
}
function dropFor(ring, row) {
  const s = row.site ?? {};
  let k, j;
  if (s.lot) [k, j] = s.lot.slice(1).split('.').map(Number); else { k = Math.floor(s.x / RING.grid); j = Math.floor(s.z / RING.grid); }
  ring.blockCache.delete(k * 4096 + j); ring.ownCache.clear(); ring.qCache?.clear();
  const C = 256, out = new Set();
  for (let cx = Math.floor((k * RING.grid) / C) - 1; cx <= Math.floor(((k + 1) * RING.grid) / C) + 1; cx++) for (let cz = Math.floor((j * RING.grid) / C) - 1; cz <= Math.floor(((j + 1) * RING.grid) / C) + 1; cz++) out.add(`${cx},${cz}`);
  return [...out];
}
// The shape a row must have to load (the lab's export, a hand-written row): null when it does.
export function checkRow(row) {
  if (!row || typeof row !== 'object') return 'not a row';
  if (row.v !== AUTHORED_V) return `version ${row.v}: this engine reads v${AUTHORED_V}`;
  if (!row.id || !KINDS[row.kind]) return `kind ${row.kind}: not a KINDS row (data/ring.js)`;
  if (!SIDES.includes(row.front)) return 'front must be N, E, S or W';
  if (!(row.x1 > row.x0 && row.z1 > row.z0) || row.x1 - row.x0 > 62 || row.z1 - row.z0 > 62) return 'footprint must be under 62 x 62 m';
  if (!Array.isArray(row.floors) || !row.floors.length) return 'no floors';
  for (const f of row.floors) for (const r of f.rooms) if (!ROOMS[r.type]) return `room type ${r.type}: not a ROOMS row (data/floorplans.js)`;
  if (!row.floors[0].doors?.some((d) => d.kind !== 'back')) return 'floor 0 has no front door';
  const s = row.site;
  if (s && !s.lot && !(Number.isFinite(s.x) && Number.isFinite(s.z))) return 'site: { lot } or { x, z }';
  return null;
}
