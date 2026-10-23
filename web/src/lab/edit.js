// The Building Lab's hand edits (docs/design/WEB_BUILDING_LAB.md): pure functions on an authored row (world/authored.js),
// in the row's own frame. Every edit returns null when it worked, or a sentence saying why it did not; the lab then runs the
// reachability proof on the result. Rooms stay rectangles, partitions straight; doorways sit on nav cell centres.
import { RING } from '../data/ring.js';
import { ROOMS } from '../data/floorplans.js';
import { placeFlight, interior, landings } from '../world/authored.js';

const T = RING.wall, J = 0.25, MIN = 1.2, E = 1e-3;
const cell = (v) => Math.floor(v) + 0.5;
const r2 = (v) => Math.round(v * 100) / 100;
const near = (a, b, e = 0.02) => Math.abs(a - b) < e;

// Every wall of floor k as one list: partitions { ref: { i }, ... } and the outside walls { ref: { side }, ... }.
export function wallsOf(row, k) {
  const out = row.floors[k].walls.map((w, i) => ({ ref: { i }, horizontal: w.horizontal, fixed: w.fixed, a0: w.a0, a1: w.a1, gaps: w.gaps, party: !!w.party }));
  out.push({ ref: { side: 'N' }, horizontal: true, fixed: row.z0, a0: row.x0 - T / 2, a1: row.x1 + T / 2, ext: true });
  out.push({ ref: { side: 'S' }, horizontal: true, fixed: row.z1, a0: row.x0 - T / 2, a1: row.x1 + T / 2, ext: true });
  out.push({ ref: { side: 'W' }, horizontal: false, fixed: row.x0, a0: row.z0 - T / 2, a1: row.z1 + T / 2, ext: true });
  out.push({ ref: { side: 'E' }, horizontal: false, fixed: row.x1, a0: row.z0 - T / 2, a1: row.z1 + T / 2, ext: true });
  return out;
}
const lo = (r, hz) => (hz ? r.z0 : r.x0), hi = (r, hz) => (hz ? r.z1 : r.x1);
const alo = (r, hz) => (hz ? r.x0 : r.z0), ahi = (r, hz) => (hz ? r.x1 : r.z1);

// Drag a wall to `to` (its centre line). A partition moves on its own floor; an outside wall moves the footprint on every
// floor. The rooms either side follow, so do the walls that end on it and the doorways along those.
export function moveWall(row, k, ref, to) {
  to = r2(Math.round(to * 20) / 20);
  if (ref.side) return moveOutside(row, ref.side, to);
  const F = row.floors[k], W = F.walls[ref.i], hz = W.horizontal, old = W.fixed;
  if (near(to, old, 0.001)) return null;
  const span = (r) => alo(r, hz) < W.a1 - E && ahi(r, hz) > W.a0 + E;
  const A = F.rooms.filter((r) => span(r) && near(hi(r, hz), old - T / 2)), B = F.rooms.filter((r) => span(r) && near(lo(r, hz), old + T / 2));
  const minTo = Math.max(...A.map((r) => lo(r, hz) + MIN + T / 2), -Infinity), maxTo = Math.min(...B.map((r) => hi(r, hz) - MIN - T / 2), Infinity);
  to = Math.max(minTo, Math.min(maxTo, to));
  if (!Number.isFinite(to)) return 'that wall has nothing on one side';
  for (const r of A) hz ? (r.z1 = r2(to - T / 2)) : (r.x1 = r2(to - T / 2));
  for (const r of B) hz ? (r.z0 = r2(to + T / 2)) : (r.x0 = r2(to + T / 2));
  for (const P of F.walls) {
    if (P.horizontal === hz || P.fixed < W.a0 - E || P.fixed > W.a1 + E) continue;
    if (near(P.a0, old)) P.a0 = to; if (near(P.a1, old)) P.a1 = to;
    fitGaps(P);
  }
  W.fixed = r2(to);
  return null;
}
function moveOutside(row, side, to) {
  const hz = side === 'N' || side === 'S', key = { N: 'z0', S: 'z1', W: 'x0', E: 'x1' }[side], old = row[key], sgn = side === 'N' || side === 'W' ? 1 : -1;
  const face = old + sgn * (T / 2), keyR = key; // the rooms' face on this wall has the same name (z0 for N...)
  // Limits: every room on it keeps MIN; the footprint stays 6..60 m.
  let lim = sgn > 0 ? Infinity : -Infinity;
  for (const F of row.floors) for (const r of F.rooms) if (near(r[keyR], face)) {
    const other = r[key[0] + (key[1] === '0' ? '1' : '0')];
    lim = sgn > 0 ? Math.min(lim, other - MIN - T / 2) : Math.max(lim, other + MIN + T / 2);
  }
  const opp = row[key[0] + (key[1] === '0' ? '1' : '0')];
  if (sgn > 0) to = Math.max(opp - 60, Math.min(lim, to, opp - 6)); else to = Math.min(opp + 60, Math.max(lim, to, opp + 6));
  if (near(to, old, 0.001)) return null;
  const nf = to + sgn * (T / 2);
  for (const F of row.floors) {
    for (const r of F.rooms) if (near(r[keyR], face)) r[keyR] = r2(nf);
    if (F.deck && near(F.deck[keyR], face)) F.deck[keyR] = r2(nf);
    for (const P of F.walls) {
      if (P.horizontal === hz) continue;
      if (near(P.a0, old)) P.a0 = to; if (near(P.a1, old)) P.a1 = to;
      // (a wall whose end is at the old outside corner: the corner moved)
      if (near(P.a0, old - T / 2)) P.a0 = r2(to - T / 2); if (near(P.a1, old + T / 2)) P.a1 = r2(to + T / 2);
      fitGaps(P);
    }
  }
  row[key] = r2(to);
  for (const d of row.floors[0].doors) if ((d.side === 'N' || d.side === 'S') !== hz) {
    const a = hz ? row.x0 : row.z0, b = hz ? row.x1 : row.z1;
    d.at = clampDoor(d.at, a + T / 2 + 0.35 + d.w / 2, b - T / 2 - 0.35 - d.w / 2);
  }
  return null;
}
const clampDoor = (at, a, b) => { if (b < a) return cell((a + b) / 2); let c = cell(Math.max(a, Math.min(b, at))); if (c < a) c += 1; if (c > b) c -= 1; return c; };
function fitGaps(P) {
  const a = P.a0 + T / 2 + J, b = P.a1 - T / 2 - J;
  P.gaps = P.gaps.filter((g) => b - a >= g.w).map((g) => ({ ...g, at: clampDoor(g.at, a + g.w / 2, b - g.w / 2) }));
}

// Slide a doorway (a partition's gap, or an outside door) along its wall; it lands on a nav cell centre.
export function moveDoor(row, k, ref, at) {
  if (ref.door !== undefined) {
    const d = row.floors[0].doors[ref.door], hz = d.side === 'N' || d.side === 'S';
    const a = (hz ? row.x0 : row.z0) + T / 2 + 0.35 + d.w / 2, b = (hz ? row.x1 : row.z1) - T / 2 - 0.35 - d.w / 2;
    d.at = clampDoor(at, a, b);
    return null;
  }
  const P = row.floors[k].walls[ref.i], g = P.gaps[ref.gap];
  g.at = clampDoor(at, P.a0 + T / 2 + J + g.w / 2, P.a1 - T / 2 - J - g.w / 2);
  return null;
}
// A doorway in a wall at `at`: an inside one 1.8 m (RING.innerDoor), an outside one a back door (a front door on the
// front side, 2.4 m), floor 0 only for outside doors.
export function addDoor(row, k, ref, at) {
  if (ref.side) {
    if (k) return 'outside doors go on the street floor only';
    const front = ref.side === row.front, w = front ? RING.door : RING.backDoor;
    const hz = ref.side === 'N' || ref.side === 'S', a = (hz ? row.x0 : row.z0) + T / 2 + 0.35 + w / 2, b = (hz ? row.x1 : row.z1) - T / 2 - 0.35 - w / 2;
    if (b < a) return 'that wall is too short for a door';
    const c = clampDoor(at, a, b), D = row.floors[0].doors;
    if (D.some((d) => d.side === ref.side && Math.abs(d.at - c) < (d.w + w) / 2 + 0.6)) return 'too close to the door already there';
    D.push({ side: ref.side, at: c, w, kind: front ? 'front' : 'back', unit: unitAt(row, ref.side, c) });
    return null;
  }
  const P = row.floors[k].walls[ref.i], w = RING.innerDoor, a = P.a0 + T / 2 + J + w / 2, b = P.a1 - T / 2 - J - w / 2;
  if (b < a) return `that wall is ${r2(P.a1 - P.a0 - T)} m long: a doorway needs ${r2(w + 2 * J)} m`;
  const c = clampDoor(at, a, b);
  if (P.gaps.some((g) => Math.abs(g.at - c) < (g.w + w) / 2 + 0.3)) return 'there is a doorway there already';
  P.gaps.push({ at: c, w });
  return null;
}
function unitAt(row, side, at) {
  const r = row.floors[0].rooms.find((q) => (side === 'N' || side === 'S' ? at > q.x0 && at < q.x1 : at > q.z0 && at < q.z1) && (side === 'N' ? near(q.z0, row.z0 + T / 2) : side === 'S' ? near(q.z1, row.z1 - T / 2) : side === 'W' ? near(q.x0, row.x0 + T / 2) : near(q.x1, row.x1 - T / 2)));
  return r?.unit ?? 0;
}
export function removeDoor(row, k, ref) {
  if (ref.door !== undefined) {
    const D = row.floors[0].doors;
    if (D[ref.door].kind !== 'back' && D.filter((d) => d.kind !== 'back').length < 2) return 'the last front door stays (a building needs a way in from its street)';
    D.splice(ref.door, 1);
    return null;
  }
  row.floors[k].walls[ref.i].gaps.splice(ref.gap, 1);
  return null;
}

// Split a room with a partition: across x = at (vertical) or z = at (horizontal), with a doorway in its middle.
export function splitRoom(row, k, i, horizontal, at) {
  const F = row.floors[k], R = F.rooms[i];
  at = r2(Math.round(at * 10) / 10);
  const a = horizontal ? R.z0 : R.x0, b = horizontal ? R.z1 : R.x1;
  if (at - T / 2 - a < MIN || b - at - T / 2 < MIN) return `too close to the wall: each side keeps ${MIN} m`;
  const R2 = { ...R };
  if (horizontal) { R.z1 = r2(at - T / 2); R2.z0 = r2(at + T / 2); } else { R.x1 = r2(at - T / 2); R2.x0 = r2(at + T / 2); }
  F.rooms.splice(i + 1, 0, R2);
  const W = horizontal ? { horizontal: true, fixed: at, a0: r2(R.x0 - T / 2), a1: r2(R.x1 + T / 2), gaps: [] } : { horizontal: false, fixed: at, a0: r2(R.z0 - T / 2), a1: r2(R.z1 + T / 2), gaps: [] };
  const len = W.a1 - W.a0 - T;
  if (len >= RING.innerDoor + 2 * J) W.gaps.push({ at: clampDoor((W.a0 + W.a1) / 2, W.a0 + T / 2 + J + RING.innerDoor / 2, W.a1 - T / 2 - J - RING.innerDoor / 2), w: RING.innerDoor });
  F.walls.push(W);
  return null;
}
// A hall through a room: a strip `width` wide centred on `at` (its centre on a nav cell centre), running along x
// (horizontal: a band of z) or along z, with a doorway from each side room into it.
export function carveHall(row, k, i, horizontal, at, width) {
  const F = row.floors[k], R = F.rooms[i];
  const c = cell(at), w = width;
  const a = horizontal ? R.z0 : R.x0, b = horizontal ? R.z1 : R.x1;
  let h0 = r2(c - w / 2), h1 = r2(c + w / 2);
  const before = h0 - T - a, after = b - (h1 + T);
  if (h0 < a - E || h1 > b + E) return `the hall (${w} m) does not fit across this room`;
  const keepA = before >= MIN, keepB = after >= MIN;
  if (!keepA && before > 0.05) { h0 = a; }
  if (!keepB && after > 0.05) { h1 = b; }
  const type = w <= 1.5 ? 'hall' : w <= 2.0 ? 'corr18' : 'corr24';
  const make = (o) => ({ ...R, ...o });
  const out = [];
  if (keepA) out.push(make(horizontal ? { z1: r2(h0 - T) } : { x1: r2(h0 - T) }));
  const hall = make(horizontal ? { z0: h0, z1: h1, type } : { x0: h0, x1: h1, type });
  out.push(hall);
  if (keepB) out.push(make(horizontal ? { z0: r2(h1 + T) } : { x0: r2(h1 + T) }));
  F.rooms.splice(i, 1, ...out);
  for (const [keep, fixed] of [[keepA, r2(h0 - T / 2)], [keepB, r2(h1 + T / 2)]]) {
    if (!keep) continue;
    const W = horizontal ? { horizontal: true, fixed, a0: r2(R.x0 - T / 2), a1: r2(R.x1 + T / 2), gaps: [] } : { horizontal: false, fixed, a0: r2(R.z0 - T / 2), a1: r2(R.z1 + T / 2), gaps: [] };
    if (W.a1 - W.a0 - T >= RING.innerDoor + 2 * J) W.gaps.push({ at: clampDoor((W.a0 + W.a1) / 2, W.a0 + T / 2 + J + RING.innerDoor / 2, W.a1 - T / 2 - J - RING.innerDoor / 2), w: RING.innerDoor });
    F.walls.push(W);
  }
  return null;
}
// Take a partition out: the two rooms either side become one (when together they make a rectangle).
export function removeWall(row, k, i) {
  const F = row.floors[k], W = F.walls[i], hz = W.horizontal;
  const span = (r) => alo(r, hz) < W.a1 - E && ahi(r, hz) > W.a0 + E;
  const A = F.rooms.filter((r) => span(r) && near(hi(r, hz), W.fixed - T / 2)), B = F.rooms.filter((r) => span(r) && near(lo(r, hz), W.fixed + T / 2));
  if (A.length !== 1 || B.length !== 1 || !near(alo(A[0], hz), alo(B[0], hz)) || !near(ahi(A[0], hz), ahi(B[0], hz))) return 'only a wall between exactly two rooms of the same span comes out (split rooms meet it here)';
  const a = A[0], b = B[0], keep = (a.x1 - a.x0) * (a.z1 - a.z0) >= (b.x1 - b.x0) * (b.z1 - b.z0) ? a : b;
  const M = { ...keep, x0: Math.min(a.x0, b.x0), z0: Math.min(a.z0, b.z0), x1: Math.max(a.x1, b.x1), z1: Math.max(a.z1, b.z1) };
  F.rooms = F.rooms.filter((r) => r !== a && r !== b); F.rooms.push(M);
  F.walls.splice(i, 1);
  return null;
}
export function setRoomType(row, k, i, type) {
  if (!ROOMS[type]) return `no room type ${type}`;
  row.floors[k].rooms[i].type = type;
  return null;
}
// A flight moved by (dx, dz) (snapped to 0.25 m), turned round (it climbs the other way), or placed afresh by the rules.
export function moveFlight(row, fi, dx, dz) {
  const f = row.flights[fi], s = (v) => Math.round(v * 4) / 4;
  const ddx = s(dx), ddz = s(dz);
  const I = interior(row);
  if (f.x0 + ddx < I.x0 - E || f.x1 + ddx > I.x1 + E || f.z0 + ddz < I.z0 - E || f.z1 + ddz > I.z1 + E) return 'the stairs stay inside the walls';
  f.x0 = r2(f.x0 + ddx); f.x1 = r2(f.x1 + ddx); f.z0 = r2(f.z0 + ddz); f.z1 = r2(f.z1 + ddz);
  return null;
}
export function reverseFlight(row, fi) { row.flights[fi].dir = -row.flights[fi].dir; return null; }
export function replaceFlight(row, fi) {
  const f = row.flights[fi], rest = row.flights.filter((q) => q !== f);
  const nf = placeFlight({ ...row, flights: rest }, f.from);
  if (!nf) return 'no other place for these stairs fits the rules';
  row.flights[fi] = nf;
  return null;
}
export { landings };
