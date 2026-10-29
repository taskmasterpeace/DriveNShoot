// THE UNDERGROUND's generator (docs/design/WEB_UNDERGROUND.md §3): a site's levels as a pure function of its row (data/
// underground.js), its depth and its seed. No three.js, no world state: systems/underground.js builds what comes back.
//
// planSite(site): the frame every level of the site shares (a grid of 1 m cells on whole metres, like the nav grids), the
// floor heights (basements are negative storeys: Y[0] is the street, Y[k] = -(depth + (k-1)·step)), the entrance flight
// from the street to level 1, the flights between levels (each a slope between two decks, entered at its two ends: the
// storeys law), the freight lift's shaft. genLevel(site, k): one level - cells (rock, floor, pool, deep water, the hole a
// flight leaves in the floor above, the stair mass on the floor below, the lift shaft), rooms or chambers, doors (locks,
// keypads, blast doors), colliders, props, containers, strip lights, chem-light glows, who lives there, the logs, the
// generator, the loose roof spans, and the proof: NavProbe (world/floorplan.js, the ring's own reachability rule) floods
// from where you arrive and must reach every room, the way down and the lift. Every level carries a hash of what it is.
//
// Own random streams only (a site's seed, mixed with the level), so nothing here moves the island's golden hash or any
// streamed chunk's.
import { makeRng } from '../engine/rng.js';
import { Hasher } from './geo.js';
import { NavProbe } from './floorplan.js';
import { UG, FLIGHTS, ENTRANCES, LIFT, KINDS, ROOMS, PROPS, PROJECTS, LOGS, HOLDOUT, HOLDOUT_LOGS, CODE_LOGS, BLAST } from '../data/underground.js';

export const ROCK = 0, OPEN = 1, POOL = 2, DEEP = 3, HOLE = 4, STAIR = 5, SHAFT = 6;
const DIRS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const OPEN_OPENING = { hatch: 2.5, mouth: 6, lift: 2, culvert: 5 }; // metres of the entrance flight open to the sky
const hashStr = (s) => { let v = 2166136261; for (let i = 0; i < s.length; i++) { v ^= s.charCodeAt(i); v = Math.imul(v, 16777619); } return v >>> 0; };
const mix = (a, b) => { let h = (a ^ Math.imul((b + 0x9e3779b9) >>> 0, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; return (h ^ (h >>> 16)) >>> 0; };
const r2 = (v) => Math.round(v * 100) / 100;

// ---- the site plan ----------------------------------------------------------------------------------------------------
// GEN: a kind whose plan and levels another generator makes (UNDER THE STREET: world/understreet.js registers `drains`,
// a town's storm drains made from its street plan). { plan(site), level(site, k, plan) }, both pure.
export const GEN = {};
const plans = new Map();
export function planSite(site) {
  const key = `${site.id}|${site.seed}|${site.x}|${site.z}|${site.dir}|${site.levels}`;
  let P = plans.get(key);
  if (P) return P;
  P = GEN[site.kind] ? GEN[site.kind].plan(site) : makePlan(site);
  if (plans.size > 64) plans.delete(plans.keys().next().value);
  plans.set(key, P);
  return P;
}

function makePlan(site) {
  const K = KINDS[site.kind], E = ENTRANCES[site.entrance], rng = makeRng(mix(site.seed >>> 0, 0x51ab1e));
  const n = site.levels, size = Math.min(60, rng.int(K.size[0], K.size[1]));
  const y0 = site.y ?? 0, Y = [y0];
  for (let k = 1; k <= n; k++) Y.push(y0 - UG.depth - (k - 1) * UG.step);
  const [dx, dz] = DIRS[site.dir], axis = dx ? 'x' : 'z', u = dx || dz;
  const F = FLIGHTS[E.flight], wc = Math.max(1, Math.round(F.w));
  const aTop = Math.round(axis === 'x' ? site.x : site.z), bC = axis === 'x' ? site.z : site.x;
  const b0 = Math.round(bC - wc / 2);
  // The grid: the entrance's top 2 m in from the edge it comes in at, the rest of the level beyond the foot of its stair.
  const ga0 = u > 0 ? aTop - 2 : aTop + 2 - size;
  const liftW = E.lift ? LIFT.w + 1 : 0;
  let gb0 = Math.round(bC - size * rng.range(0.35, 0.65));
  gb0 = Math.min(gb0, b0 - 4); gb0 = Math.max(gb0, b0 + wc + liftW + 4 - size);
  const ox = axis === 'x' ? ga0 : gb0, oz = axis === 'x' ? gb0 : ga0;
  const P = { site: site.id, n, size, W: size, H: size, ox, oz, Y, flights: [], lift: null, axis, u };
  // The entrance flight: street (Y[0]) to level 1.
  P.flights.push(flight(`${site.id}:F0`, E.flight, 0, 1, axis, u, aTop, b0, wc, Y[0], Y[1], OPEN_OPENING[E.look] ?? 2.5));
  // The freight lift beside it (a built kind's 'lift' entrance): a shaft through every level, its top at the street.
  if (E.lift) {
    const s0 = b0 + wc + 1, a1 = aTop + u * LIFT.d;
    const rect = axis === 'x' ? { minX: Math.min(aTop, a1), maxX: Math.max(aTop, a1), minZ: s0, maxZ: s0 + LIFT.w } : { minX: s0, maxX: s0 + LIFT.w, minZ: Math.min(aTop, a1), maxZ: Math.max(aTop, a1) };
    const cx = (rect.minX + rect.maxX) / 2, cz = (rect.minZ + rect.maxZ) / 2;
    const lob = (s) => (axis === 'x' ? { x: cx + u * s * (LIFT.d / 2 + 1.2), z: cz } : { x: cx, z: cz + u * s * (LIFT.d / 2 + 1.2) });
    P.lift = { id: `${site.id}:lift`, rect, cx, cz, axis, u, stops: Y.map((y, k) => ({ k, y })), lobby: lob(1), street: lob(-1) };
  }
  // The flights between levels: the way down from level k far from where you arrive on it, clear of the lift and of the
  // other flights on the floors they share.
  for (let k = 1; k < n; k++) {
    const arrive = P.flights[k - 1].bottom;
    const kind = site.kind === 'cave' ? 'slope' : 'stair', Fk = FLIGHTS[kind], wk = Math.max(1, Math.round(Fk.w)), len = Math.ceil((Y[k] - Y[k + 1]) / Fk.pitch);
    let best = null, bd = -1;
    for (let t = 0; t < 60; t++) {
      const ax = rng() < 0.5 ? 'x' : 'z', uu = rng() < 0.5 ? 1 : -1;
      const along0 = ax === 'x' ? ox : oz, across0 = ax === 'x' ? oz : ox;
      const aT = along0 + (uu > 0 ? rng.int(4, size - len - 6) : rng.int(len + 6, size - 4));
      const bb = across0 + rng.int(5, size - wk - 5);
      const f = flight(`${site.id}:F${k}`, kind, k, k + 1, ax, uu, aT, bb, wk, Y[k], Y[k + 1], 0);
      const pad = 3, hit = (r, q) => r.minX - pad < q.maxX && r.maxX + pad > q.minX && r.minZ - pad < q.maxZ && r.maxZ + pad > q.minZ;
      const box = { minX: f.rect.minX - 2, maxX: f.rect.maxX + 2, minZ: f.rect.minZ - 2, maxZ: f.rect.maxZ + 2 };
      if (box.minX < ox + 5 || box.maxX > ox + size - 5 || box.minZ < oz + 5 || box.maxZ > oz + size - 5) continue;
      if (P.flights.some((g) => (g.from === k || g.to === k) && hit(g.rect, box)) || (P.lift && hit(P.lift.rect, box))) continue;
      const d = Math.hypot(f.top.x - arrive.x, f.top.z - arrive.z);
      if (d > bd) { bd = d; best = f; }
    }
    if (!best) throw new Error(`undergen: no room for the flight down from level ${k} of ${site.id}`);
    P.flights.push(best);
  }
  return P;
}

// One flight: axis x|z, u the way it goes DOWN along the axis, aTop the along-coordinate of its top end, b0/wc its band.
// F: its FLIGHTS row (another generator may hand its own: world/understreet.js).
export function flight(id, kind, from, to, axis, u, aTop, b0, wc, yTop, yBot, open, F = FLIGHTS[kind]) {
  const len = Math.max(2, Math.ceil((yTop - yBot) / F.pitch)), aBot = aTop + u * len;
  const a0 = Math.min(aTop, aBot), a1 = Math.max(aTop, aBot);
  const rect = axis === 'x' ? { minX: a0, maxX: a1, minZ: b0, maxZ: b0 + wc } : { minX: b0, maxX: b0 + wc, minZ: a0, maxZ: a1 };
  const bc = b0 + wc / 2, pt = (a) => (axis === 'x' ? { x: a, z: bc } : { x: bc, z: a });
  return { id, kind, from, to, axis, u, aTop, aBot, b0, wc, len, yTop, yBot, pitch: (yTop - yBot) / len, speed: F.speed, look: F.look, rect,
    top: pt(aTop - u * 0.9), bottom: pt(aBot + u * 0.9), topEdge: pt(aTop), bottomEdge: pt(aBot), open };
}

// Height on a flight at (x, z) for someone standing at y, or null (not on it). The continuity rule: you are on the slope
// only if you are near its height there (you step on at an end; crossing over its covered part on the floor above, or
// under it on the floor below, you stay where you are).
export function flightHeight(f, x, z, y) {
  const R = f.rect;
  if (x < R.minX || x > R.maxX || z < R.minZ || z > R.maxZ) return null;
  const a = f.axis === 'x' ? x : z, t = Math.min(1, Math.max(0, ((a - f.aTop) * f.u) / f.len)), h = f.yTop + (f.yBot - f.yTop) * t;
  return Math.abs(h - y) < 0.75 ? h : null;
}

// ---- one level --------------------------------------------------------------------------------------------------------
const levels = new Map();
export function genLevel(site, k) {
  const key = `${site.id}|${site.seed}|${k}|${site.x}|${site.z}|${site.dir}`;
  let L = levels.get(key);
  if (L) return L;
  L = GEN[site.kind] ? GEN[site.kind].level(site, k, planSite(site)) : makeLevel(site, k, planSite(site));
  if (levels.size > 48) levels.delete(levels.keys().next().value);
  levels.set(key, L);
  return L;
}
export function clearCache() { plans.clear(); levels.clear(); }

function makeLevel(site, k, P) {
  const K = KINDS[site.kind], rng = makeRng(mix(mix(site.seed >>> 0, hashStr(site.id)), k * 0x2545f491));
  const W = P.W, H = P.H;
  const L = {
    site: site.id, k, y: P.Y[k], ox: P.ox, oz: P.oz, W, H, kind: site.kind,
    cells: new Uint8Array(W * H), space: new Int16Array(W * H).fill(-1),
    rooms: [], doors: [], colliders: [], walls: [], floors: [], props: [], boxes: [], lights: [], glows: [], spawns: [], logs: [],
    squeeze: [], collapses: [], generator: null, arrival: null, departure: null, lobby: null, flights: [], name: null,
  };
  // The flights that touch this level: the one that arrives (its stair stands here), the one that leaves (its hole).
  const arrive = P.flights.find((f) => f.to === k), leave = P.flights.find((f) => f.from === k);
  L.flights = P.flights.filter((f) => f.to === k || f.from === k).map((f) => f.id);
  L.arrival = { x: arrive.bottom.x, z: arrive.bottom.z };
  if (leave) L.departure = { x: leave.top.x, z: leave.top.z };
  if (P.lift) L.lobby = { ...P.lift.lobby };
  const ix = (x) => Math.floor(x - L.ox), iz = (z) => Math.floor(z - L.oz);
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i);
  const markRect = (R, type) => { for (let j = iz(R.minZ); j < Math.ceil(R.maxZ - L.oz); j++) for (let i = ix(R.minX); i < Math.ceil(R.maxX - L.ox); i++) { const q = at(i, j); if (q >= 0) L.cells[q] = type; } };
  const reserved = new Uint8Array(W * H); // cells the room and chamber carving must leave alone (stairs, holes, the shaft and its walls)
  const reserve = (R, pad = 0) => { for (let j = iz(R.minZ) - pad; j < Math.ceil(R.maxZ - L.oz) + pad; j++) for (let i = ix(R.minX) - pad; i < Math.ceil(R.maxX - L.ox) + pad; i++) { const q = at(i, j); if (q >= 0) reserved[q] = 1; } };
  // Anchors: the arriving stair (its mass stands on this floor), the leaving flight's hole, the lift shaft. Their own
  // rects are kept off-limits with a wall's ring; the landings at their ends are open floor.
  markRect(arrive.rect, STAIR); reserve(arrive.rect, 1);
  if (leave) { markRect(leave.rect, HOLE); reserve(leave.rect, 1); }
  if (P.lift) { markRect(P.lift.rect, SHAFT); reserve(P.lift.rect, 1); }
  const landing = (p, r = 1) => { const ci = ix(p.x), cj = iz(p.z); for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) { const q = at(i, j); if (q >= 0 && !L.cells[q]) { L.cells[q] = OPEN; reserved[q] = 0; } } };
  // the flight's end cells: open whatever the ring said (the reach in and out of the stair)
  const endCells = (f, which) => { const e = which === 'bottom' ? f.bottomEdge : f.topEdge, out = which === 'bottom' ? f.u : -f.u; for (let s = 0; s < 2; s++) for (let b = 0; b < f.wc; b++) { const x = f.axis === 'x' ? e.x + out * (s + 0.5) : f.b0 + b + 0.5, z = f.axis === 'x' ? f.b0 + b + 0.5 : e.z + out * (s + 0.5); const q = at(ix(x), iz(z)); if (q >= 0) { L.cells[q] = OPEN; reserved[q] = 0; } } };
  endCells(arrive, 'bottom'); landing(L.arrival, 1);
  if (leave) { endCells(leave, 'top'); landing(L.departure, 1); }
  if (P.lift) { const lb = P.lift.lobby; landing(lb, 1); const R = P.lift.rect; for (let s = 0; s < 2; s++) for (let b = 0; b < LIFT.w; b++) { const x = P.lift.axis === 'x' ? (P.lift.u > 0 ? R.maxX : R.minX) + P.lift.u * (s + 0.5) : R.minX + b + 0.5, z = P.lift.axis === 'x' ? R.minZ + b + 0.5 : (P.lift.u > 0 ? R.maxZ : R.minZ) + P.lift.u * (s + 0.5); const q = at(ix(x), iz(z)); if (q >= 0) { L.cells[q] = OPEN; reserved[q] = 0; } } }
  const ctx = { site, K, P, L, rng, W, H, ix, iz, at, reserved, arrive, leave, k };
  if (K.built) built(ctx); else cave(ctx);
  finish(ctx);
  return L;
}

// ---- built levels: a corridor spine joining the anchors, rooms off it -----------------------------------------------
function built(c) {
  const { L, K, P, rng, W, H, at, reserved, k, site } = c;
  const cw = K.corridor;
  const open = (i, j, sp = 0) => { const q = at(i, j); if (q >= 0 && !reserved[q] && L.cells[q] === ROCK) { L.cells[q] = OPEN; L.space[q] = sp; } };
  const isFree = (i, j) => { const q = at(i, j); return q >= 0 && i > 0 && j > 0 && i < W - 1 && j < H - 1 && !reserved[q]; };
  // A corridor from a to b: a breadth-first route over cells that are free (not reserved), thickened to the corridor's
  // width without eating into anything reserved. Prefers straight runs (a turn costs).
  const corridor = (a, b) => {
    const s = at(c.ix(a.x), c.iz(a.z)), t = at(c.ix(b.x), c.iz(b.z));
    const prev = new Int32Array(W * H).fill(-1), dist = new Float32Array(W * H).fill(1e9), dir = new Int8Array(W * H).fill(-1);
    const open4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const q = [s]; dist[s] = 0;
    // Dijkstra on a small grid with a binary-ish bucket: costs are 1 (straight) or 3 (a turn), so a plain array of buckets.
    const buckets = [[s]]; let bi = 0;
    while (bi < buckets.length) {
      const B = buckets[bi]; if (!B || !B.length) { bi++; continue; }
      const p = B.pop();
      if (dist[p] < bi) continue;
      if (p === t) break;
      const pi = p % W, pj = (p - pi) / W;
      for (let d = 0; d < 4; d++) {
        const ni = pi + open4[d][0], nj = pj + open4[d][1], nq = at(ni, nj);
        if (nq < 0 || (!isFree(ni, nj) && nq !== t && L.cells[nq] === ROCK)) continue;
        if (L.cells[nq] === STAIR || L.cells[nq] === HOLE || L.cells[nq] === SHAFT) continue;
        const nd = bi + (dir[p] >= 0 && dir[p] !== d ? 3 : 1) + (rng() < 0.08 ? 1 : 0);
        if (nd < dist[nq]) { dist[nq] = nd; prev[nq] = p; dir[nq] = d; (buckets[nd] ??= []).push(nq); }
      }
    }
    void q;
    if (prev[t] < 0 && t !== s) return false;
    const path = [];
    for (let p = t; p >= 0; p = prev[p]) { path.push(p); if (p === s) break; }
    const lo = -Math.floor((cw - 1) / 2), hi = lo + cw - 1;
    for (const p of path) { const pi = p % W, pj = (p - pi) / W; for (let dj = lo; dj <= hi; dj++) for (let di = lo; di <= hi; di++) open(pi + di, pj + dj, 0); }
    return path;
  };
  const spine = [L.arrival];
  if (L.lobby) spine.push(L.lobby);
  if (L.departure) spine.push(L.departure);
  else {
    // The bottom level: the corridor runs out to the far side (the deep end, where the vault and the sealed room go).
    const far = { x: L.ox + (L.arrival.x - L.ox < W / 2 ? W - 6 : 6) + rng.int(-3, 3), z: L.oz + (L.arrival.z - L.oz < H / 2 ? H - 6 : 6) + rng.int(-3, 3) };
    spine.push(far);
  }
  let main = [];
  for (let i = 1; i < spine.length; i++) { const p = corridor(spine[i - 1], spine[i]); if (p) main = main.concat(p); }
  // Branches: stubs off the spine for more rooms.
  for (let b = 0; b < 3; b++) {
    if (!main.length) break;
    const p = main[rng.int(Math.floor(main.length * 0.15), Math.floor(main.length * 0.85))], pi = p % W, pj = (p - pi) / W;
    const d = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]), len = rng.int(7, 14);
    const end = { x: L.ox + Math.max(3, Math.min(W - 4, pi + d[0] * len)) + 0.5, z: L.oz + Math.max(3, Math.min(H - 4, pj + d[1] * len)) + 0.5 };
    corridor({ x: L.ox + pi + 0.5, z: L.oz + pj + 0.5 }, end);
  }
  // Rooms off the corridor: the programme (a project's own rooms first, the sealed room first of all on the bottom level).
  const project = site.kind === 'facility' ? PROJECTS[site.project] : null;
  const prog = [];
  const sealedHere = project && k === site.levels;
  if (sealedHere) prog.push({ type: project.sealed.room, sealed: true });
  for (const r of project?.rooms?.[k - 1] ?? []) prog.push({ type: r });
  for (const r of K.programme[Math.min(k - 1, K.programme.length - 1)]) prog.push({ type: r });
  // The generator: the first level whose programme has a generator room (the plan's choice, the same for every level).
  const genLevel = 1 + Math.max(0, K.programme.findIndex((pr, i) => i < site.levels && pr.includes('generator')));
  for (const item of prog) {
    if (item.type === 'generator' && k !== genLevel) continue;
    const R = ROOMS[item.type];
    for (let tries = 0; tries < 90; tries++) {
      if (placeRoom(c, item, R)) break;
    }
  }
}

// A room against the corridor: pick a corridor cell with rock beside it, grow the room out from the wall there.
function placeRoom(c, item, R) {
  const { L, rng, W, H, at, reserved } = c;
  const w = rng.int(R.w[0], R.w[1]), d = rng.int(R.d[0], R.d[1]);
  // a random corridor cell
  let q = -1;
  for (let t = 0; t < 40; t++) { const p = rng.int(0, W * H - 1); if (L.cells[p] === OPEN && L.space[p] === 0) { q = p; break; } }
  if (q < 0) return false;
  const qi = q % W, qj = (q - qi) / W;
  const D = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  // walk out of the corridor in D to its edge
  let ei = qi, ej = qj;
  while (true) { const n = at(ei + D[0], ej + D[1]); if (n < 0) return false; if (L.cells[n] !== OPEN || L.space[n] !== 0) break; ei += D[0]; ej += D[1]; }
  // the wall cell is ei+D, the room starts one past it
  const along = D[0] ? [0, 1] : [1, 0];
  const depth = D[0] ? w : d, span = D[0] ? d : w;
  const off = rng.int(0, span - 2);
  const r0i = ei + D[0] * 2 - along[0] * off, r0j = ej + D[1] * 2 - along[1] * off;
  // the room's cells: from (r0) out D for `depth`, across `span`
  const cells = [];
  for (let s = 0; s < depth; s++) for (let a = 0; a < span; a++) cells.push([r0i + D[0] * s + along[0] * a, r0j + D[1] * s + along[1] * a]);
  // it and its ring of wall must be rock, free and inside
  let i0 = Infinity, j0 = Infinity, i1 = -Infinity, j1 = -Infinity;
  for (const [i, j] of cells) { i0 = Math.min(i0, i); j0 = Math.min(j0, j); i1 = Math.max(i1, i); j1 = Math.max(j1, j); }
  if (i0 < 2 || j0 < 2 || i1 > W - 3 || j1 > H - 3) return false;
  for (let j = j0 - 1; j <= j1 + 1; j++) for (let i = i0 - 1; i <= i1 + 1; i++) { const p = at(i, j); if (p < 0 || reserved[p] || L.cells[p] !== ROCK) return false; }
  // the door: two cells of the wall between the corridor edge and the room, both with corridor on one side, room on the other
  const di = ei + D[0], dj = ej + D[1];
  const dw = 2;
  const door = [];
  for (let s = 0; s < dw; s++) {
    const i = di + along[0] * s, j = dj + along[1] * s;
    const outQ = at(i - D[0], j - D[1]), inI = i + D[0], inJ = j + D[1];
    if (outQ < 0 || L.cells[outQ] !== OPEN || L.space[outQ] !== 0) return false;
    if (inI < i0 || inI > i1 || inJ < j0 || inJ > j1) return false;
    door.push([i, j]);
  }
  const id = L.rooms.length + 1;
  for (const [i, j] of cells) { const p = at(i, j); L.cells[p] = OPEN; L.space[p] = id; }
  for (const [i, j] of door) { const p = at(i, j); L.cells[p] = OPEN; L.space[p] = -2; reserved[p] = 1; } // the doorway: kept clear
  const x0 = L.ox + i0, z0 = L.oz + j0, x1 = L.ox + i1 + 1, z1 = L.oz + j1 + 1;
  const room = { id, type: item.type, label: item.sealed ? PROJECTS[c.site.project].sealed.label : R.label, sealed: !!item.sealed, x0, z0, x1, z1, cells: cells.length };
  L.rooms.push(room);
  // The door row (systems/interiors.js shape): centre on the wall line, axis along it, normal out into the corridor.
  const cx = L.ox + di + (D[0] ? (D[0] > 0 ? 0.5 : 0.5) : 1), cz = L.oz + dj + (D[1] ? 0.5 : 1);
  const doorX = D[0] ? L.ox + di + 0.5 : L.ox + di + 1, doorZ = D[0] ? L.oz + dj + 1 : L.oz + dj + 0.5;
  void cx; void cz;
  const mat = item.sealed ? 'blast' : R.door ?? 'wood';
  const seal = item.sealed ? PROJECTS[c.site.project].sealed.seal : R.keypad ?? null;
  const locked = item.sealed || rng() < (R.locked ?? 0);
  L.doors.push({ id: `${L.site}:${L.k}:d${L.doors.length}`, room: id, x: doorX, z: doorZ, axis: D[0] ? 'z' : 'x', nx: -D[0], nz: -D[1], width: 1.9,
    material: mat, locked, keypad: locked && (R.keypad || item.sealed) ? seal : null, blast: mat === 'blast', leaves: mat === 'blast' ? 2 : 1, hinge: rng() < 0.5 ? -1 : 1 });
  return true;
}

// ---- natural levels: chambers joined by passages ---------------------------------------------------------------------
function cave(c) {
  const { L, K, rng, W, H, at, reserved, ix, iz } = c;
  const carve = (i, j, sp) => { const q = at(i, j); if (q >= 0 && i > 0 && j > 0 && i < W - 1 && j < H - 1 && !reserved[q] && L.cells[q] === ROCK) { L.cells[q] = OPEN; L.space[q] = sp; } };
  const disc = (x, z, r, sp) => { for (let j = Math.floor(z - r - L.oz); j <= Math.ceil(z + r - L.oz); j++) for (let i = Math.floor(x - r - L.ox); i <= Math.ceil(x + r - L.ox); i++) if (Math.hypot(L.ox + i + 0.5 - x, L.oz + j + 0.5 - z) <= r) carve(i, j, sp); };
  // Chambers: the two anchors' (where you arrive, where the way down is) and the rest scattered with room between them.
  const ch = [{ x: L.arrival.x, z: L.arrival.z, r: 3.4 }];
  if (L.departure) ch.push({ x: L.departure.x, z: L.departure.z, r: 3.4 });
  const want = rng.int(K.chambers[0], K.chambers[1]);
  for (let t = 0; t < 400 && ch.length < want; t++) {
    const r = rng.range(K.radius[0], K.radius[1]), x = L.ox + rng.range(r + 2, W - r - 2), z = L.oz + rng.range(r + 2, H - r - 2);
    if (ch.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 3)) continue;
    let clash = false;
    for (let j = Math.floor(z - r - L.oz); j <= Math.ceil(z + r - L.oz) && !clash; j++) for (let i = Math.floor(x - r - L.ox); i <= Math.ceil(x + r - L.ox); i++) { const q = at(i, j); if (q >= 0 && reserved[q] && Math.hypot(L.ox + i + 0.5 - x, L.oz + j + 0.5 - z) <= r) { clash = true; break; } }
    if (clash) continue;
    ch.push({ x, z, r });
  }
  ch.forEach((o, i) => { o.id = i + 1; o.seed = rng() * 6.28; });
  // Joined by a spanning tree (nearest first) and a loop or two: the loops are where a roof may come down.
  const inT = new Set([0]), edges = [], loops = [];
  while (inT.size < ch.length) {
    let best = null, bd = Infinity;
    for (const a of inT) for (let b = 0; b < ch.length; b++) { if (inT.has(b)) continue; const d = Math.hypot(ch[a].x - ch[b].x, ch[a].z - ch[b].z); if (d < bd) { bd = d; best = [a, b]; } }
    edges.push(best); inT.add(best[1]);
  }
  const cand = [];
  for (let a = 0; a < ch.length; a++) for (let b = a + 1; b < ch.length; b++) if (!edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) cand.push([a, b, Math.hypot(ch[a].x - ch[b].x, ch[a].z - ch[b].z)]);
  cand.sort((p, q) => p[2] - q[2]);
  for (let i = 0; i < Math.min(cand.length, rng.int(1, 2)); i++) if (cand[i][2] < W * 0.6) loops.push([cand[i][0], cand[i][1]]);
  // The chambers: a lumpy ellipse each.
  for (const o of ch) {
    const sx = rng.range(0.8, 1.2), sz = rng.range(0.8, 1.2);
    for (let j = Math.floor(o.z - o.r * 1.3 - L.oz); j <= Math.ceil(o.z + o.r * 1.3 - L.oz); j++) for (let i = Math.floor(o.x - o.r * 1.3 - L.ox); i <= Math.ceil(o.x + o.r * 1.3 - L.ox); i++) {
      const x = L.ox + i + 0.5 - o.x, z = L.oz + j + 0.5 - o.z, a = Math.atan2(z, x), rr = o.r * (1 + 0.22 * Math.sin(a * 3 + o.seed) + 0.12 * Math.sin(a * 5 - o.seed * 2));
      if (Math.hypot(x / sx, z / sz) <= rr) carve(i, j, 1000 + o.id);
    }
  }
  // The passages: a wandering line between two chambers, a disc swept along it; a few are squeezes (a metre wide).
  const passage = (a, b, loop) => {
    const A = ch[a], B = ch[b], n = 6, pts = [[A.x, A.z]];
    const nx = -(B.z - A.z), nz = B.x - A.x, nl = Math.hypot(nx, nz) || 1;
    for (let s = 1; s < n; s++) { const t = s / n, off = rng.range(-3, 3); pts.push([A.x + (B.x - A.x) * t + (nx / nl) * off, A.z + (B.z - A.z) * t + (nz / nl) * off]); }
    pts.push([B.x, B.z]);
    const squeeze = !loop && rng() < K.squeeze;
    const wdt = squeeze ? 0.5 : rng.range(K.tunnel[0], K.tunnel[1]) / 2;
    const cells = [];
    let last = null;
    for (let s = 0; s < pts.length - 1; s++) {
      const [x0, z0] = pts[s], [x1, z1] = pts[s + 1], len = Math.hypot(x1 - x0, z1 - z0), steps = Math.ceil(len / 0.4);
      for (let t = 0; t <= steps; t++) {
        const x = x0 + ((x1 - x0) * t) / steps, z = z0 + ((z1 - z0) * t) / steps;
        if (squeeze) {
          // a metre wide, but four-connected (a step that only touches diagonally is a corner nobody can cut)
          const ci = ix(x), cj = iz(z);
          for (const [qi, qj] of last && last[0] !== ci && last[1] !== cj ? [[ci, last[1]], [ci, cj]] : [[ci, cj]]) { const q = at(qi, qj); if (q >= 0 && !reserved[q] && L.cells[q] === ROCK) { L.cells[q] = OPEN; L.space[q] = 0; } if (q >= 0) cells.push(q); }
          last = [ci, cj];
        }
        else disc(x, z, wdt, 0);
      }
    }
    if (squeeze) L.squeeze.push(...cells.filter((q) => L.space[q] === 0));
    if (loop) {
      // a cracked span in the middle of a loop passage: it can come down without sealing anything off
      const mid = pts[Math.floor(pts.length / 2)];
      L.collapses.push({ id: `${L.site}:${L.k}:c${L.collapses.length}`, x: r2(mid[0]), z: r2(mid[1]), r: Math.max(1.6, wdt + 0.6) });
    }
  };
  for (const [a, b] of edges) passage(a, b, false);
  for (const [a, b] of loops) passage(a, b, true);
  // Pools: a shallow skirt and a deep middle in a chamber or two (never the anchors').
  const pools = rng.int(K.pools[0], K.pools[1]);
  for (let p = 0, t = 0; p < pools && t < 20; t++) {
    const o = ch[rng.int(L.departure ? 2 : 1, ch.length - 1)];
    if (!o || o.pool || o.r < 4) continue;
    o.pool = true; p++;
    const pr = o.r * rng.range(0.45, 0.6), px = o.x + rng.range(-1, 1), pz = o.z + rng.range(-1, 1);
    for (let j = Math.floor(pz - pr - L.oz); j <= Math.ceil(pz + pr - L.oz); j++) for (let i = Math.floor(px - pr - L.ox); i <= Math.ceil(px + pr - L.ox); i++) {
      const q = at(i, j); if (q < 0 || L.cells[q] !== OPEN) continue;
      const d = Math.hypot(L.ox + i + 0.5 - px, L.oz + j + 0.5 - pz);
      if (d <= pr * 0.55) L.cells[q] = DEEP; else if (d <= pr) L.cells[q] = POOL;
    }
    o.poolAt = { x: px, z: pz, r: pr };
    // the water must not cut a chamber off: if the flood from the arrival misses one now, the deep part goes shallow
    const seen = flood(L, at);
    if (!ch.every((q) => { const qq = at(ix(q.x), iz(q.z)); return qq < 0 || seen[qq] || L.cells[qq] === DEEP; })) for (let q = 0; q < W * H; q++) if (L.cells[q] === DEEP && Math.hypot(L.ox + (q % W) + 0.5 - px, L.oz + Math.floor(q / W) + 0.5 - pz) <= pr) L.cells[q] = POOL;
  }
  // A cracked roof by the big pool, when there is a loop to put it on (the log says so): already on the loops.
  L.chambers = ch.map((o) => ({ id: o.id, x: r2(o.x), z: r2(o.z), r: r2(o.r), pool: !!o.pool }));
  c.chambers = ch;
}

// ---- everything after the shape: proof, colliders, props, people, logs --------------------------------------------
function finish(c) {
  const { L, K, P, rng, W, H, at, site, k, arrive, leave } = c;
  const y = L.y, wallH = UG.wallH;
  // 1. Seal off what nothing reaches (a cave's lump that smoothing left alone), from the arrival.
  const reach = flood(L, at);
  for (let q = 0; q < W * H; q++) if ((L.cells[q] === OPEN || L.cells[q] === POOL) && !reach[q]) { L.cells[q] = ROCK; L.space[q] = -1; }
  // 2. Colliders: the rock that touches an open cell (8 neighbours), merged into rectangles; deep water as low boxes.
  const edge = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const q = j * W + i;
    if (L.cells[q] !== ROCK) continue;
    let touch = false;
    for (let dj = -1; dj <= 1 && !touch; dj++) for (let di = -1; di <= 1; di++) { const n = at(i + di, j + dj); if (n >= 0 && L.cells[n] !== ROCK && L.cells[n] !== STAIR && L.cells[n] !== HOLE && L.cells[n] !== SHAFT) { touch = true; break; } }
    if (touch) edge[q] = 1;
  }
  for (const R of mergeRects(edge, W, H)) L.colliders.push({ x0: L.ox + R[0], z0: L.oz + R[1], x1: L.ox + R[2], z1: L.oz + R[3], base: y, top: y + wallH, tag: K.built ? 'ug-wall' : 'ug-rock' }); // poured concrete, or the living rock (data/materials.js)
  const deep = new Uint8Array(W * H); for (let q = 0; q < W * H; q++) if (L.cells[q] === DEEP) deep[q] = 1;
  for (const R of mergeRects(deep, W, H)) L.colliders.push({ x0: L.ox + R[0], z0: L.oz + R[1], x1: L.ox + R[2], z1: L.oz + R[3], base: y - 1.2, top: y + 0.15, tag: 'ug-water' });
  // Visual walls: a built level's merged concrete; a cave's rock is drawn cell by cell (systems/underground.js).
  L.walls = K.built ? L.colliders.filter((b) => b.tag === 'ug-wall').map((b) => [b.x0, b.z0, b.x1, b.z1]) : null;
  L.edge = edge;
  // 3. Floors: a built level's rooms each their own colour (merged per space); a cave's open cells drawn cell by cell.
  if (K.built) {
    const spaces = new Map();
    for (let q = 0; q < W * H; q++) if (L.cells[q] === OPEN) { const s = L.space[q]; if (!spaces.has(s)) spaces.set(s, new Uint8Array(W * H)); spaces.get(s)[q] = 1; }
    for (const [s, mask] of spaces) {
      const room = s > 0 ? L.rooms[s - 1] : null, col = room ? ROOMS[room.type]?.floor ?? '#55524a' : s === -2 ? '#4f4c46' : '#4c4943';
      for (const R of mergeRects(mask, W, H)) L.floors.push([L.ox + R[0], L.oz + R[1], L.ox + R[2], L.oz + R[3], col]);
    }
  }
  // 4. The flights' and the lift's own colliders on this level's heights (flanks, rails, end blocks, the lift's gates).
  for (const f of P.flights) if (f.to === k) flightColliders(L, f);
  if (P.lift) {
    const R = P.lift.rect, gateAt = P.lift.u > 0 ? (P.lift.axis === 'x' ? R.maxX : R.maxZ) : (P.lift.axis === 'x' ? R.minX : R.minZ);
    L.gate = P.lift.axis === 'x' ? { x0: gateAt - 0.12, x1: gateAt + 0.12, z0: R.minZ, z1: R.maxZ } : { x0: R.minX, x1: R.maxX, z0: gateAt - 0.12, z1: gateAt + 0.12 };
    // the shaft's other three sides are the rock ring the reserve left; its wall caps the shaft on this floor
  }
  // 5. The probe: the ring's own rule. Boxes: the colliders, the stairs and holes and the shaft (nobody walks into one
  // within a floor), the props as they go in.
  const probe = new NavProbe(64);
  probe.reset(L.ox, L.oz, L.ox + W, L.oz + H, 2);
  const pb = (x0, z0, x1, z1) => probe.add({ x0, z0, x1, z1, base: 0 });
  for (const b of L.colliders) pb(b.x0, b.z0, b.x1, b.z1);
  for (const b of L.flightBoxes ?? []) if (b.tag !== 'ug-rail') pb(b.x0, b.z0, b.x1, b.z1); // a rail is the floor above's
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const t = L.cells[j * W + i]; if (t === STAIR || t === HOLE || t === SHAFT) pb(L.ox + i, L.oz + j, L.ox + i + 1, L.oz + j + 1); }
  // the grid's own edge is rock: the probe's pad round it is blocked too
  pb(L.ox - 2, L.oz - 2, L.ox + W + 2, L.oz); pb(L.ox - 2, L.oz + H, L.ox + W + 2, L.oz + H + 2); pb(L.ox - 2, L.oz, L.ox, L.oz + H); pb(L.ox + W, L.oz, L.ox + W + 2, L.oz + H);
  const targets = () => {
    const t = [];
    for (const r of L.rooms) t.push({ room: r.id, x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 });
    for (const ch of L.chambers ?? []) { const e = Math.max(1, ch.r * 0.6); t.push({ chamber: ch.id, x0: ch.x - e, z0: ch.z - e, x1: ch.x + e, z1: ch.z + e }); }
    if (L.departure) t.push({ way: 'down', x0: L.departure.x - 0.6, z0: L.departure.z - 0.6, x1: L.departure.x + 0.6, z1: L.departure.z + 0.6 });
    if (L.lobby) t.push({ way: 'lift', x0: L.lobby.x - 0.6, z0: L.lobby.z - 0.6, x1: L.lobby.x + 0.6, z1: L.lobby.z + 0.6 });
    return t;
  };
  const starts = [[L.arrival.x, L.arrival.z]];
  const proved = () => { probe.flood(starts); return targets().every((r) => probe.roomReached(r)); };
  c.probe = probe; c.proved = proved;
  // 6. Props: each placed only if the proof still holds with it (a piece that would seal a room is dropped).
  if (K.built) furnishBuilt(c); else furnishCave(c);
  // 7. The proof, kept on the level for the selftest and the agent: what the flood reaches.
  probe.flood(starts);
  const unreached = targets().filter((r) => !probe.roomReached(r)).map((r) => r.room ? `room ${r.room}` : r.chamber ? `chamber ${r.chamber}` : r.way);
  L.proof = { ok: !unreached.length, unreached, rooms: L.rooms.length, chambers: (L.chambers ?? []).length, start: [L.arrival.x, L.arrival.z] };
  // 8. Lights: strip lights along a built level's corridors (they burn when the site's power is on), a chem-light trail
  // in a cave (somebody marked the way out).
  if (K.built) stripLights(c); else chemTrail(c);
  // 9. People: who lives here (systems/underground.js spawns them when the level is promoted).
  people(c);
  // 10. Logs and the codes they teach.
  logs(c);
  // 11. The hash: what this level is, cell by cell and piece by piece.
  const Hh = new Hasher().str(L.site).int(L.k).num(L.ox).num(L.oz).int(W).int(H);
  for (let q = 0; q < W * H; q++) Hh.int(L.cells[q] | ((L.space[q] + 2) << 4));
  for (const d of L.doors) Hh.str(d.id).num(d.x).num(d.z).int(d.locked ? 1 : 0).str(d.material);
  for (const b of L.boxes) Hh.str(b.id).num(b.x).num(b.z).str(b.table);
  for (const s of L.spawns) Hh.str(s.kind).num(s.x).num(s.z);
  for (const g of L.logs) Hh.str(g.id).num(g.x).num(g.z);
  L.hash = Hh.hex();
  delete L.flightBoxesTmp;
  c.probe = null;
}

// A flight's own boxes, kept with the LOWER level (its stair stands there): flanks over the flight's whole height range
// (they are the rails round its hole on the floor above), the block under its top end, the rail across its foot's hole
// on the floor above.
export function flightColliders(L, f) {
  const T = 0.14, R = f.rect, top = f.yTop + 1.0, bot = f.yBot;
  const out = (L.flightBoxes ??= []);
  if (f.axis === 'x') {
    out.push({ x0: R.minX, z0: R.minZ - T, x1: R.maxX, z1: R.minZ, base: bot, top, tag: 'ug-flank' }, { x0: R.minX, z0: R.maxZ, x1: R.maxX, z1: R.maxZ + T, base: bot, top, tag: 'ug-flank' });
    const xt = f.aTop, xb = f.aBot;
    out.push({ x0: Math.min(xt, xt - f.u * T), z0: R.minZ, x1: Math.max(xt, xt - f.u * T), z1: R.maxZ, base: bot, top: bot + UG.wallH, tag: 'ug-endblock', under: true });
    out.push({ x0: Math.min(xb, xb + f.u * T), z0: R.minZ, x1: Math.max(xb, xb + f.u * T), z1: R.maxZ, base: f.yTop - 0.4, top, tag: 'ug-rail' });
  } else {
    out.push({ x0: R.minX - T, z0: R.minZ, x1: R.minX, z1: R.maxZ, base: bot, top, tag: 'ug-flank' }, { x0: R.maxX, z0: R.minZ, x1: R.maxX + T, z1: R.maxZ, base: bot, top, tag: 'ug-flank' });
    const zt = f.aTop, zb = f.aBot;
    out.push({ x0: R.minX, z0: Math.min(zt, zt - f.u * T), x1: R.maxX, z1: Math.max(zt, zt - f.u * T), base: bot, top: bot + UG.wallH, tag: 'ug-endblock', under: true });
    out.push({ x0: R.minX, z0: Math.min(zb, zb + f.u * T), x1: R.maxX, z1: Math.max(zb, zb + f.u * T), base: f.yTop - 0.4, top, tag: 'ug-rail' });
  }
  for (const b of out.slice(-4)) b.flight = f.id;
}

// Flood the open cells from the arrival (4 + diagonal without corner cutting), for the seal-off pass.
function flood(L, at) {
  const W = L.W, H = L.H, seen = new Uint8Array(W * H), q = new Int32Array(W * H);
  const s = at(Math.floor(L.arrival.x - L.ox), Math.floor(L.arrival.z - L.oz));
  if (s < 0) return seen;
  const walk = (t) => t === OPEN || t === POOL;
  let h = 0, t = 0; seen[s] = 1; q[t++] = s;
  while (h < t) {
    const p = q[h++], i = p % W, j = (p - i) / W;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const n = at(i + di, j + dj);
      if (n < 0 || seen[n] || !walk(L.cells[n])) continue;
      if (di && dj && (!walk(L.cells[at(i + di, j)]) || !walk(L.cells[at(i, j + dj)]))) continue;
      seen[n] = 1; q[t++] = n;
    }
  }
  return seen;
}

// Greedy rectangles over a mask (rows of runs, then each run grown down while the rows below match).
export function mergeRects(mask, W, H) {
  const used = new Uint8Array(W * H), out = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const q = j * W + i;
    if (!mask[q] || used[q]) continue;
    let i1 = i; while (i1 + 1 < W && mask[j * W + i1 + 1] && !used[j * W + i1 + 1]) i1++;
    let j1 = j;
    outer: while (j1 + 1 < H) { for (let x = i; x <= i1; x++) { const n = (j1 + 1) * W + x; if (!mask[n] || used[n]) break outer; } j1++; }
    for (let jj = j; jj <= j1; jj++) for (let x = i; x <= i1; x++) used[jj * W + x] = 1;
    out.push([i, j, i1 + 1, j1 + 1]);
  }
  return out;
}

// ---- furnishing --------------------------------------------------------------------------------------------------------
// One piece: its footprint against a wall (or in the middle), checked against everything already placed and the doorways,
// then the proof; it stays only if every room, the way down and the lift are still reached.
function tryPiece(c, kind, rect, extra = {}) {
  const { L, at, probe, proved } = c, P = PROPS[kind];
  const pad = 0.05;
  for (const b of L.props) if (rect.x0 < b.x1 + pad && rect.x1 > b.x0 - pad && rect.z0 < b.z1 + pad && rect.z1 > b.z0 - pad) return null;
  // every cell under it is open floor of one room (not a doorway, not the corridor unless asked)
  for (let j = Math.floor(rect.z0 - L.oz); j < Math.ceil(rect.z1 - L.oz); j++) for (let i = Math.floor(rect.x0 - L.ox); i < Math.ceil(rect.x1 - L.ox); i++) {
    const q = at(i, j);
    if (q < 0 || L.cells[q] !== OPEN) return null;
    if (extra.space !== undefined && L.space[q] !== extra.space) return null;
  }
  // a doorway's clearance: 1.2 m in front of and behind every door
  for (const d of L.doors) { const cl = 1.3, hw = d.width / 2 + 0.3; const bx = d.axis === 'x' ? [d.x - hw, d.z - cl, d.x + hw, d.z + cl] : [d.x - cl, d.z - hw, d.x + cl, d.z + hw]; if (rect.x0 < bx[2] && rect.x1 > bx[0] && rect.z0 < bx[3] && rect.z1 > bx[1]) return null; }
  for (const p of [L.arrival, L.departure, L.lobby]) if (p && rect.x0 < p.x + 1.6 && rect.x1 > p.x - 1.6 && rect.z0 < p.z + 1.6 && rect.z1 > p.z - 1.6) return null;
  const box = { x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: rect.z1, base: 0 };
  probe.add(box, 1);
  if (!proved()) { probe.add(box, -1); return null; }
  const piece = { kind, x0: r2(rect.x0), z0: r2(rect.z0), x1: r2(rect.x1), z1: r2(rect.z1), h: extra.h ?? P.h, color: P.color, room: extra.room ?? null, face: extra.face ?? 0, round: !!P.round, screen: !!P.screen, bed: !!P.bed };
  L.props.push(piece);
  return piece;
}

function furnishBuilt(c) {
  const { L, rng, site, k } = c;
  const project = site.kind === 'facility' ? PROJECTS[site.project] : null;
  for (const room of L.rooms) {
    const R = ROOMS[room.type];
    const list = [];
    for (const [kind, n, where] of R.props) for (let i = 0; i < n; i++) list.push({ kind, mid: where === 'mid' });
    if (room.type === 'generator') list.unshift({ kind: 'generator', mid: true, gen: true });
    let made = 0;
    for (const it of list) {
      const P = PROPS[it.kind];
      let placed = null;
      for (let t = 0; t < 14 && !placed; t++) {
        const [w, d] = P.size;
        if (it.mid && !(it.gen && t > 6)) {
          const cx = rng.range(room.x0 + 1.4 + w / 2, room.x1 - 1.4 - w / 2), cz = rng.range(room.z0 + 1.4 + d / 2, room.z1 - 1.4 - d / 2);
          if (!(cx === cx) || !(cz === cz) || room.x1 - room.x0 < w + 2.8 || room.z1 - room.z0 < d + 2.8) break;
          placed = tryPiece(c, it.kind, { x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 }, { space: room.id, room: room.id });
        } else {
          // against a wall: pick a side, slide along it
          const side = rng.int(0, 3), along = side < 2;
          const len = along ? room.x1 - room.x0 : room.z1 - room.z0;
          if (len < w + 0.2) continue;
          const s = rng.range(0.1, len - w - 0.1);
          const rect = side === 0 ? { x0: room.x0 + s, z0: room.z0 + 0.05, x1: room.x0 + s + w, z1: room.z0 + 0.05 + d }
            : side === 1 ? { x0: room.x0 + s, z0: room.z1 - 0.05 - d, x1: room.x0 + s + w, z1: room.z1 - 0.05 }
            : side === 2 ? { x0: room.x0 + 0.05, z0: room.z0 + s, x1: room.x0 + 0.05 + d, z1: room.z0 + s + w }
            : { x0: room.x1 - 0.05 - d, z0: room.z0 + s, x1: room.x1 - 0.05, z1: room.z0 + s + w };
          placed = tryPiece(c, it.kind, rect, { space: room.id, room: room.id, face: side });
        }
      }
      if (!placed) continue;
      made++;
      if (it.gen) { L.generator = { x: r2((placed.x0 + placed.x1) / 2), z: r2((placed.z0 + placed.z1) / 2), room: room.id }; placed.gen = true; continue; }
      const P2 = PROPS[it.kind];
      if (P2.container) {
        const id = `ring:ug:${L.site}:${L.k}:b${L.boxes.length}`;
        const table = room.sealed && project ? (room.type === 'cold' ? 'ug_seeds' : 'ug_vault') : R.loot;
        L.boxes.push({ id, table, x: r2((placed.x0 + placed.x1) / 2), z: r2((placed.z0 + placed.z1) / 2), cap: P2.container, label: `${P2.label} · ${room.label}`, room: room.id });
      }
    }
    room.pieces = made;
  }
  void k;
}

function furnishCave(c) {
  const { L, rng, chambers } = c;
  // Fallen rock in the chambers (cover, and something to walk round), never in the anchors' chambers' middles.
  for (const o of chambers) {
    const n = Math.floor(o.r / 1.6);
    for (let i = 0; i < n; i++) {
      const a = rng() * 6.28, d = rng.range(o.r * 0.35, o.r * 0.85), s = rng.range(0.7, 1.4);
      const x = o.x + Math.cos(a) * d, z = o.z + Math.sin(a) * d;
      tryPiece(c, 'crate', { x0: x - s / 2, z0: z - s / 2, x1: x + s / 2, z1: z + s / 2 }, { h: rng.range(0.6, 1.3) })?.kind && (L.props[L.props.length - 1].kind = 'rock');
    }
  }
  // An explorer's camp in a chamber that is not an anchor: a bedroll, a dead fire, their pack (a container) and their log.
  const spare = chambers.filter((o, i) => i > (L.departure ? 1 : 0) && !o.pool);
  const camp = spare.length ? spare[rng.int(0, spare.length - 1)] : null;
  if (camp) {
    const id = `ring:ug:${L.site}:${L.k}:b${L.boxes.length}`;
    L.boxes.push({ id, table: 'ug_cave', x: r2(camp.x + 0.8), z: r2(camp.z), cap: 30, label: 'AN EXPLORER\'S PACK', room: null });
    L.camp = { x: r2(camp.x), z: r2(camp.z) };
    camp.camp = true;
  }
  // The nest: the farthest chamber from where you come in (not the way down's), with the remains of those it took.
  const far = chambers.slice(L.departure ? 2 : 1).filter((o) => !o.camp && !o.pool).sort((a, b) => Math.hypot(b.x - L.arrival.x, b.z - L.arrival.z) - Math.hypot(a.x - L.arrival.x, a.z - L.arrival.z))[0];
  if (far && rng() < c.K.nest) {
    far.nest = true;
    L.nest = { x: r2(far.x), z: r2(far.z), r: r2(far.r) };
    const id = `ring:ug:${L.site}:${L.k}:b${L.boxes.length}`;
    L.boxes.push({ id, table: 'ug_nest', x: r2(far.x - 0.6), z: r2(far.z + 0.4), cap: 40, label: 'WHAT THE NEST KEPT', room: null });
  }
}

// ---- lights ------------------------------------------------------------------------------------------------------------
function stripLights(c) {
  const { L, W, H, at } = c;
  // Along every corridor wall run, a strip at the wall's top every 4 m (dark until the site's power is on).
  let n = 0;
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const q = j * W + i;
    if (L.cells[q] !== OPEN || L.space[q] !== 0) continue;
    if ((i * 7 + j * 3) % 5) continue;
    for (const [di, dj] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const n2 = at(i + di, j + dj);
      if (n2 < 0 || L.cells[n2] !== ROCK) continue;
      const x = L.ox + i + 0.5 + di * 0.5, z = L.oz + j + 0.5 + dj * 0.5;
      if (L.lights.some((l) => Math.hypot(l.x - x, l.z - z) < 3.5)) break;
      L.lights.push({ x: r2(x - di * 0.08), z: r2(z - dj * 0.08), along: di ? 'z' : 'x', len: 1.4 });
      n++;
      break;
    }
  }
  // One a room, on the wall across from its door.
  for (const room of L.rooms) {
    const d = L.doors.find((q) => q.room === room.id);
    if (!d) continue;
    const x = d.axis === 'x' ? (room.x0 + room.x1) / 2 : d.nx > 0 ? room.x0 + 0.08 : room.x1 - 0.08;
    const z = d.axis === 'x' ? (d.nz > 0 ? room.z0 + 0.08 : room.z1 - 0.08) : (room.z0 + room.z1) / 2;
    L.lights.push({ x: r2(x), z: r2(z), along: d.axis === 'x' ? 'x' : 'z', len: 1.6, room: room.id });
  }
  void n;
}

function chemTrail(c) {
  const { L, rng, chambers } = c;
  // Somebody went in with a bag of chem lights and cracked one at every turn: from the arrival toward the camp.
  const to = L.camp ?? (chambers[2] ? { x: chambers[2].x, z: chambers[2].z } : null);
  if (!to) return;
  const steps = Math.floor(Math.hypot(to.x - L.arrival.x, to.z - L.arrival.z) / 7);
  for (let s = 1; s <= steps; s++) {
    const x = L.arrival.x + ((to.x - L.arrival.x) * s) / (steps + 1), z = L.arrival.z + ((to.z - L.arrival.z) * s) / (steps + 1);
    const q = c.at(c.ix(x), c.iz(z));
    if (q >= 0 && L.cells[q] === OPEN) L.glows.push({ x: r2(x + rng.range(-0.4, 0.4)), z: r2(z + rng.range(-0.4, 0.4)), c: rng.int(0, 2) });
  }
  if (L.camp) L.glows.push({ x: L.camp.x - 0.4, z: L.camp.z + 0.6, c: 1 });
}

// ---- people ------------------------------------------------------------------------------------------------------------
function freeSpot(c, x0, z0, x1, z1, tries = 30) {
  const { L, rng, at, probe } = c;
  for (let t = 0; t < tries; t++) {
    const x = rng.range(x0, x1), z = rng.range(z0, z1), q = at(Math.floor(x - L.ox), Math.floor(z - L.oz));
    if (q < 0 || L.cells[q] !== OPEN) continue;
    if (L.props.some((p) => x > p.x0 - 0.5 && x < p.x1 + 0.5 && z > p.z0 - 0.5 && z < p.z1 + 0.5)) continue;
    void probe;
    return { x: r2(x), z: r2(z) };
  }
  return null;
}

function people(c) {
  const { L, K, rng, site, k } = c;
  const project = site.kind === 'facility' ? PROJECTS[site.project] : null;
  if (site.holdout) {
    // The garrison: posts by room, a patrol on the corridor, the drone on the longest straight corridor run.
    for (const room of L.rooms) {
      const n = HOLDOUT.posts[room.type] ?? 0;
      for (let i = 0; i < n; i++) { const p = freeSpot(c, room.x0 + 1, room.z0 + 1, room.x1 - 1, room.z1 - 1); if (p) L.spawns.push({ kind: 'soldier', ...p, post: { ...p, room: room.id }, weapon: rng() < 0.75 ? 'rifle' : 'smg' }); }
    }
    for (let i = 0; i < HOLDOUT.patrol; i++) L.spawns.push({ kind: 'soldier', x: L.arrival.x, z: L.arrival.z, route: [{ ...L.arrival }, L.departure ? { ...L.departure } : { x: (L.rooms[0]?.x0 + L.rooms[0]?.x1) / 2 || L.arrival.x, z: (L.rooms[0]?.z0 + L.rooms[0]?.z1) / 2 || L.arrival.z }], weapon: 'rifle' });
    if (k === 1) { const run = longestRun(c); if (run) L.spawns.push({ kind: 'drone', x: run[0].x, z: run[0].z, route: run }); }
    return;
  }
  // The dead who live here: in rooms and chambers away from where you arrive.
  const [lo, hi] = K.infected[Math.min(k - 1, K.infected.length - 1)], n = rng.int(lo, hi);
  const places = (L.rooms.length ? L.rooms.filter((r) => !r.sealed).map((r) => [r.x0 + 0.8, r.z0 + 0.8, r.x1 - 0.8, r.z1 - 0.8]) : (L.chambers ?? []).filter((o) => Math.hypot(o.x - L.arrival.x, o.z - L.arrival.z) > 8 && !o.pool).map((o) => [o.x - o.r * 0.6, o.z - o.r * 0.6, o.x + o.r * 0.6, o.z + o.r * 0.6]));
  for (let i = 0; i < n && places.length; i++) {
    const pl = places[rng.int(0, places.length - 1)], p = freeSpot(c, ...pl);
    if (p && Math.hypot(p.x - L.arrival.x, p.z - L.arrival.z) > 7) L.spawns.push({ kind: rng() < K.runners ? 'sprinter' : 'shambler', ...p, post: { ...p } });
  }
  // A cave's nest: a knot of them round what they keep, one standing watch.
  if (L.nest) {
    const m = rng.int(K.nestSize[0], K.nestSize[1]);
    for (let i = 0; i < m; i++) { const p = freeSpot(c, L.nest.x - L.nest.r * 0.7, L.nest.z - L.nest.r * 0.7, L.nest.x + L.nest.r * 0.7, L.nest.z + L.nest.r * 0.7); if (p) L.spawns.push({ kind: i === 0 ? 'sprinter' : 'shambler', ...p, post: { ...L.nest }, nest: true }); }
  }
  // The sealed room's: they have been in there since the door shut.
  const sealed = L.rooms.find((r) => r.sealed);
  if (sealed && project) for (const [kind, m] of project.sealed.spawns) for (let i = 0; i < m; i++) { const p = freeSpot(c, sealed.x0 + 0.8, sealed.z0 + 0.8, sealed.x1 - 0.8, sealed.z1 - 0.8); if (p) L.spawns.push({ kind, ...p, post: { ...p }, sealed: true }); }
}

// The longest straight run of corridor (a drone flies it end to end).
function longestRun(c) {
  const { L, W, H } = c;
  let best = null, bl = 0;
  for (const horiz of [true, false]) {
    const A = horiz ? H : W, B = horiz ? W : H;
    for (let a = 1; a < A - 1; a++) {
      let s = -1;
      for (let b = 0; b <= B; b++) {
        const i = horiz ? b : a, j = horiz ? a : b, q = b < B ? j * W + i : -1;
        const ok = q >= 0 && L.cells[q] === OPEN && L.space[q] === 0;
        if (ok && s < 0) s = b;
        if (!ok && s >= 0) {
          const len = b - s;
          if (len > bl) { bl = len; best = horiz ? [{ x: L.ox + s + 1, z: L.oz + a + 0.5 }, { x: L.ox + b - 1, z: L.oz + a + 0.5 }] : [{ x: L.ox + a + 0.5, z: L.oz + s + 1 }, { x: L.ox + a + 0.5, z: L.oz + b - 1 }]; }
          s = -1;
        }
      }
    }
  }
  return bl >= 8 ? best : null;
}

// ---- logs and codes ----------------------------------------------------------------------------------------------------
// The site's codes: four digits a keypad group (the holdout's armory: its founding day), from the site's own stream.
export function siteCodes(site) {
  const rng = makeRng(mix(site.seed >>> 0, 0xc0de));
  const out = {};
  for (const g of ['armory', 'vault', 'ward', 'cold', 'cell', 'deep', 'stores']) out[g] = String(rng.int(1000, 9999));
  if (site.holdout) out.armory = '0704';
  return out;
}

// Which logs lie on level k of a site (a fixed share-out, so every level knows what the others teach).
export function levelLogIds(site, k) {
  const K = KINDS[site.kind], project = site.kind === 'facility' ? PROJECTS[site.project] : null;
  if (site.holdout) return k === 1 ? [HOLDOUT_LOGS[0], HOLDOUT_LOGS[1], HOLDOUT_LOGS[2]] : k === 2 ? [HOLDOUT_LOGS[3]] : [];
  if (project) return [[0], [1, 2], [3, 4]][Math.min(k - 1, 2)].map((i) => project.logs[i]).filter(Boolean);
  return (K.logs ?? []).filter((_, i) => i % site.levels === k - 1);
}
export function taughtGroups(site) {
  const out = new Set();
  for (let k = 1; k <= site.levels; k++) for (const id of levelLogIds(site, k)) if (LOGS[id]?.code) out.add(LOGS[id].code);
  return out;
}

function logs(c) {
  const { L, rng, site, k } = c;
  const ids = levelLogIds(site, k);
  // a keypad on this level whose code no log on the site teaches: the card for it lies on this level
  const taught = taughtGroups(site);
  for (const d of L.doors) if (d.keypad && !taught.has(d.keypad)) { const id = CODE_LOGS[d.keypad]; if (id && !ids.includes(id)) ids.push(id); else if (!id) d.keypad = null; }
  // Where they lie: a room that takes logs (a generator card in the generator room), else a chamber or the camp.
  const rooms = L.rooms.filter((r) => ROOMS[r.type]?.log && !r.sealed);
  for (const id of ids) {
    const row = LOGS[id];
    let spot = null, roomId = null;
    if (/fuel|generator/i.test(id) || /GENERATOR|FUEL/.test(row.title)) { const gr = L.rooms.find((r) => r.type === 'generator'); if (gr) { spot = freeSpot(c, gr.x0 + 0.8, gr.z0 + 0.8, gr.x1 - 0.8, gr.z1 - 0.8); roomId = gr.id; } }
    if (!spot && rooms.length) { const r = rooms[rng.int(0, rooms.length - 1)]; spot = freeSpot(c, r.x0 + 0.8, r.z0 + 0.8, r.x1 - 0.8, r.z1 - 0.8); roomId = r.id; }
    if (!spot && L.camp) spot = { x: L.camp.x + rng.range(-1, 1), z: L.camp.z + rng.range(-1, 1) };
    if (!spot && L.chambers?.length) { const o = L.chambers[rng.int(0, L.chambers.length - 1)]; spot = freeSpot(c, o.x - o.r * 0.5, o.z - o.r * 0.5, o.x + o.r * 0.5, o.z + o.r * 0.5); }
    if (!spot) spot = freeSpot(c, L.arrival.x - 3, L.arrival.z - 3, L.arrival.x + 3, L.arrival.z + 3) ?? { x: L.arrival.x, z: L.arrival.z };
    L.logs.push({ id, x: r2(spot.x), z: r2(spot.z), paper: !!row.paper, room: roomId, code: row.code ?? null });
  }
}

// ---- views for the agent and the selftest -----------------------------------------------------------------------------
// An ASCII map of a level: # rock, . floor, ~ pool, w deep water, = the stair from above, O the hole of the way down,
// L the lift shaft, + a door (B a blast door), g the generator, c a container, s/z/D who lives there, ? a log.
export function asciiMap(L) {
  const rows = [];
  for (let j = 0; j < L.H; j++) {
    let s = '';
    for (let i = 0; i < L.W; i++) { const t = L.cells[j * L.W + i]; s += t === ROCK ? (L.edge?.[j * L.W + i] ? '#' : ' ') : t === OPEN ? '.' : t === POOL ? '~' : t === DEEP ? 'w' : t === HOLE ? 'O' : t === STAIR ? '=' : 'L'; }
    rows.push(s.split(''));
  }
  const put = (x, z, ch) => { const i = Math.floor(x - L.ox), j = Math.floor(z - L.oz); if (rows[j]?.[i] !== undefined) rows[j][i] = ch; };
  for (const b of L.boxes) put(b.x, b.z, 'c');
  for (const d of L.doors) put(d.x, d.z, d.blast ? 'B' : '+');
  for (const s of L.spawns) put(s.x, s.z, s.kind === 'soldier' ? 's' : s.kind === 'drone' ? 'D' : 'z');
  for (const g of L.logs) put(g.x, g.z, '?');
  if (L.generator) put(L.generator.x, L.generator.z, 'g');
  return rows.map((r) => r.join(''));
}
