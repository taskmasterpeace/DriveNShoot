// UNDER THE STREET's generator (docs/design/WEB_UNDERSTREET.md §3): a town's storm drains as a pure function of its
// street plan. No three.js, no world state: the runtime (systems/understreet.js) hands in what it read off the world once
// (where the water is, the ground's height at each way's top) and keeps it in the site row, so the row alone makes the
// same level every time.
//
// drainSite(rec, T, world)  the site row of kind `drains` (data/underground.js KINDS.drains) from a town plan T
//                           (world/citygen/layout.js): its network (`net`) laid under the town's streets and alleys
// planDrains(site)          the frame (a 1 m grid round the network), the floor heights (the street, the sewer) and every
//                           flight: the outfall's ramp, the culvert's two ramps, the breaches up into stores, the manholes,
//                           the loose kerb grates (the storeys law: a slope between two decks entered at its ends)
// genDrains(site, k, plan)  the level: cells (rock, floor, the shafts' stair mass), what class each floor cell is (trunk
//                           channel, bench, lateral, alley, chamber...), colliders, floors, props, doors (the outfall's
//                           bars), containers, the pump station's generator, logs, who lives there, the flow field
//                           toward the outfall, and the proof: from the outfall's foot every pipe, chamber and way is
//                           reached
// GEN.drains registers both with world/undergen.js, so the underground's planSite / genLevel answer for a drain site.
import { makeRng } from '../engine/rng.js';
import { Hasher } from './geo.js';
import { GEN, ROCK, OPEN, STAIR, mergeRects, flight, flightColliders } from './undergen.js';
import { SEWER, PIPES, CHAMBERS, WAYS, LIFE, CACHES } from '../data/understreet.js';
import { UG } from '../data/underground.js';
import { ROADS } from '../data/citygen.js';

// Floor classes (L.cls): which pipe or room a cell belongs to. LIFT_OF: how high its floor stands over the trunk's channel.
export const CLS = { rock: 0, channel: 1, bench: 2, lateral: 3, alley: 4, connector: 5, outfall: 6, culvert: 7, junction: 8, pump: 9, basement: 10, stub: 11 };
export const CLS_NAMES = Object.keys(CLS);
export const LIFT_OF = [0, 0, 0.32, PIPES.lateral.lift, PIPES.alley.lift, PIPES.connector.lift, PIPES.outfall.lift, PIPES.culvert.lift, CHAMBERS.junction.lift, CHAMBERS.pump.lift, CHAMBERS.basement.lift, PIPES.lateral.lift];
const FLOOR_OF = ['#000000', PIPES.trunk.floor, PIPES.trunk.bench_c, PIPES.lateral.floor, PIPES.alley.floor, PIPES.connector.floor, PIPES.outfall.floor, PIPES.culvert.floor, CHAMBERS.junction.floor, CHAMBERS.pump.floor, CHAMBERS.basement.floor, PIPES.lateral.floor];
const FL = (k, look) => ({ pitch: WAYS[k].flight.pitch, w: WAYS[k].flight.w, speed: WAYS[k].flight.speed, look });
const hashStr = (s) => { let v = 2166136261; for (let i = 0; i < s.length; i++) { v ^= s.charCodeAt(i); v = Math.imul(v, 16777619); } return v >>> 0; };
const r2 = (v) => Math.round(v * 100) / 100;
const rnd = Math.round;

// ---- the network from a town plan ------------------------------------------------------------------------------------
// world: { wet(x, z) -> water depth (0 dry), ground(x, z) -> the ground's height } (both optional: a flat dry world).
// Returns the site row (or null: a place too small to sewer).
export function drainSite(rec, T, world = {}) {
  const net = planNet(T, world, (rec.seed ?? hashStr(rec.id)) >>> 0, rec.y ?? 0);
  if (!net) return null;
  return {
    id: `us_${rec.id}`, name: `${(T.name ?? rec.name ?? rec.id).toUpperCase()} · UNDER THE STREETS`, kind: 'drains', entrance: 'manhole',
    x: (T.x0 + T.x1) / 2, z: (T.z0 + T.z1) / 2, dir: 'N', levels: 1, seed: ((rec.seed ?? 1) ^ 0x5e3e2) >>> 0, y: rec.y ?? 0,
    power: false, fuel: 0, town: rec.id, half: Math.max(T.x1 - T.x0, T.z1 - T.z0) / 2, net,
  };
}

// The pipes: a trunk under the main street(s), a lateral under every other street, a drain down every alley (stretched to
// the streets at its ends), junction chambers where the trunk crosses, the outfall at the water (the end of a pipe line
// that reaches it, or the dry wash past the trunk's end), the culvert under the main road out of town, a pump station in
// a big town, the breaches under stores, the manholes and grates along the pipes.
function planNet(T, world, seed, y0) {
  const rng = makeRng(seed ^ 0xd2a1);
  const wet = world.wet ?? (() => 0), ground = world.ground ?? (() => y0);
  const roads = T.roads ?? [];
  if (!roads.length) return null;
  const pipes = [], rooms = [], ways = [], lights = [];
  const clampA = (axis, a) => (axis === 'x' ? Math.max(T.x0, Math.min(T.x1, a)) : Math.max(T.z0, Math.min(T.z1, a)));
  // streets
  for (const r of roads) {
    const cls = r.main ? 'trunk' : 'lateral', w = PIPES[cls].w, at = rnd(r.at);
    const a0 = rnd(clampA(r.axis, r.axis === 'x' ? r.x0 : r.z0)), a1 = rnd(clampA(r.axis, r.axis === 'x' ? r.x1 : r.z1));
    if (a1 - a0 < 12) continue;
    pipes.push({ id: `p${pipes.length}`, cls, axis: r.axis, at, a0, a1, w, row: r.row, road: r });
  }
  if (!pipes.some((p) => p.cls === 'trunk')) { // no main street (a ring of tracks): the longest street is the trunk
    const L = pipes.reduce((a, p) => (p.a1 - p.a0 > a.a1 - a.a0 ? p : a), pipes[0]);
    if (!L) return null; L.cls = 'trunk'; L.w = PIPES.trunk.w;
  }
  // alleys: their lane's centre line, stretched to the cross street at each end (within 18 m)
  for (const A of T.alleys ?? []) {
    const axis = A.axis, lane = A.lane ?? A, at = rnd(axis === 'x' ? (lane.z0 + lane.z1) / 2 : (lane.x0 + lane.x1) / 2);
    let a0 = axis === 'x' ? A.x0 : A.z0, a1 = axis === 'x' ? A.x1 : A.z1;
    const cross = pipes.filter((p) => p.axis !== axis && at >= p.a0 && at <= p.a1);
    const lo = cross.filter((p) => p.at <= a0 + 2 && p.at >= a0 - 18).sort((a, b) => b.at - a.at)[0], hi = cross.filter((p) => p.at >= a1 - 2 && p.at <= a1 + 18).sort((a, b) => a.at - b.at)[0];
    if (lo) a0 = lo.at; if (hi) a1 = hi.at;
    if (!lo && !hi) continue; // joined to nothing: no drain
    if (a1 - a0 < 10) continue;
    pipes.push({ id: `p${pipes.length}`, cls: 'alley', axis, at, a0: rnd(a0), a1: rnd(a1), w: PIPES.alley.w, alley: A.id, corr: { x0: A.x0, z0: A.z0, x1: A.x1, z1: A.z1 } });
  }
  const trunks = pipes.filter((p) => p.cls === 'trunk');
  const main = trunks.reduce((a, p) => (p.a1 - p.a0 > a.a1 - a.a0 ? p : a), trunks[0]);
  // junction chambers where a trunk crosses another pipe
  for (const P of pipes) if (P.axis === 'x') for (const Q of pipes) {
    if (Q.axis !== 'z' || (P.cls !== 'trunk' && Q.cls !== 'trunk')) continue;
    if (Q.at < P.a0 || Q.at > P.a1 || P.at < Q.a0 || P.at > Q.a1) continue;
    const C = CHAMBERS.junction;
    if (rooms.some((r) => Math.abs((r.x0 + r.x1) / 2 - Q.at) < 12 && Math.abs((r.z0 + r.z1) / 2 - P.at) < 12)) continue;
    rooms.push({ id: `r${rooms.length}`, type: 'junction', x0: Q.at - C.w / 2, z0: P.at - C.d / 2, x1: Q.at + C.w / 2, z1: P.at + C.d / 2 });
  }
  if (!rooms.length) { // a trunk with no crossing: a chamber at its middle
    const C = CHAMBERS.junction, a = rnd((main.a0 + main.a1) / 2);
    rooms.push(main.axis === 'x' ? { id: 'r0', type: 'junction', x0: a - C.w / 2, z0: main.at - C.d / 2, x1: a + C.w / 2, z1: main.at + C.d / 2 } : { id: 'r0', type: 'junction', x0: main.at - C.w / 2, z0: a - C.d / 2, x1: main.at + C.w / 2, z1: a + C.d / 2 });
  }
  // The outfall: where a pipe's line, carried on past its end, first meets water within `search` m (the trunk first),
  // the ramp's top on the dry bank just short of it; else the dry wash past the main trunk's far end.
  const O = WAYS.outfall, yFloor = y0 - SEWER.depth;
  let out = null;
  const order = [main, ...trunks.filter((p) => p !== main), ...pipes.filter((p) => p.cls === 'lateral')];
  for (const P of order) {
    for (const s of [1, -1]) {
      const end = s > 0 ? P.a1 : P.a0;
      for (let d = 4; d <= O.search; d += 2) {
        const a = end + s * d, x = P.axis === 'x' ? a : P.at, z = P.axis === 'x' ? P.at : a;
        if (wet(x, z) > 0.3) { if (d >= 14) out = { pipe: P, s, bank: a - s * 3, water: true }; break; }
      }
      if (out) break;
    }
    if (out) break;
  }
  if (!out) out = { pipe: main, s: 1, bank: main.a1 + 16, water: false };
  // The culvert: under the main road, `out` m past the town's edge at the end away from the outfall.
  const cs = out.pipe === main ? -out.s : 1, cEnd = cs > 0 ? main.a1 : main.a0, cA = cEnd + cs * WAYS.culvert.out;
  const roadHalf = main.road ? (ROADS[main.road.row]?.w ?? 8) / 2 + (ROADS[main.road.row]?.walk ?? 1) : 6;
  // the trunk carries on to the culvert and the outfall's pipe to its ramp's foot
  if (cs > 0) main.a1 = cA + PIPES.culvert.w / 2; else main.a0 = cA - PIPES.culvert.w / 2;
  const P0 = out.pipe, yBank = ground(P0.axis === 'x' ? out.bank : P0.at, P0.axis === 'x' ? P0.at : out.bank);
  const oLen = Math.max(2, Math.ceil((yBank - yFloor) / O.flight.pitch));
  const foot = out.bank - out.s * oLen;
  if (out.s > 0) P0.a1 = Math.max(P0.a1, foot + 1); else P0.a0 = Math.min(P0.a0, foot - 1);
  if (P0.cls !== 'trunk') P0.outW = PIPES.outfall.w;
  const oWay = { id: 'outfall', kind: 'outfall', axis: P0.axis, u: -out.s, aTop: out.bank, b0: P0.at - Math.floor(O.flight.w / 2), wc: O.flight.w, yTop: r2(yBank), water: out.water, bars: rng.chance(O.bars) };
  ways.push(oWay);
  // the outfall pipe: from the town's edge to the foot (wider than a lateral)
  const tEnd = out.s > 0 ? (P0.axis === 'x' ? T.x1 : T.z1) : (P0.axis === 'x' ? T.x0 : T.z0);
  if (Math.abs(foot - tEnd) > 3) pipes.push({ id: `p${pipes.length}`, cls: 'outfall', axis: P0.axis, at: P0.at, a0: Math.min(tEnd, foot), a1: Math.max(tEnd, foot), w: PIPES.outfall.w });
  // the culvert box across the road, and a ramp up out of each end
  const C = WAYS.culvert, cw = PIPES.culvert.w, cHalf = Math.ceil(roadHalf + 3), across = main.axis === 'x' ? 'z' : 'x';
  const cLen = Math.max(4, Math.ceil(SEWER.depth / C.flight.pitch));
  pipes.push({ id: `p${pipes.length}`, cls: 'culvert', axis: across, at: rnd(cA), a0: main.at - cHalf, a1: main.at + cHalf, w: cw });
  for (const s of [-1, 1]) {
    const g0 = main.at + s * (cHalf + cLen), yT = ground(across === 'x' ? g0 : rnd(cA), across === 'x' ? rnd(cA) : g0);
    const len = Math.max(2, Math.ceil((yT - yFloor) / C.flight.pitch)), aTop = main.at + s * (cHalf + len); // the ramp's foot meets the box
    ways.push({ id: `culvert${s > 0 ? 'B' : 'A'}`, kind: 'culvert', axis: across, u: -s, aTop, b0: rnd(cA) - Math.floor(C.flight.w / 2), wc: C.flight.w, yTop: r2(yT) });
  }
  // The pump station (a big town): beside the trunk, a third of the way in from the outfall's end, joined by a passage.
  const size = Math.max(T.x1 - T.x0, T.z1 - T.z0);
  if (size >= CHAMBERS.pump.minSize) {
    const Pm = CHAMBERS.pump, a = rnd(out.pipe === main ? (out.s > 0 ? main.a1 - (main.a1 - main.a0) * 0.35 : main.a0 + (main.a1 - main.a0) * 0.35) : (main.a0 + main.a1) / 2);
    for (const side of [1, -1]) {
      const off = main.at + side * (main.w / 2 + 4 + Pm.d / 2);
      const R = main.axis === 'x' ? { x0: a - Pm.w / 2, z0: off - Pm.d / 2, x1: a + Pm.w / 2, z1: off + Pm.d / 2 } : { x0: off - Pm.d / 2, z0: a - Pm.w / 2, x1: off + Pm.d / 2, z1: a + Pm.w / 2 };
      if (pipes.some((p) => hitsPipe(p, R, 2)) || rooms.some((r) => overlap(r, R, 2))) continue;
      rooms.push({ id: `r${rooms.length}`, type: 'pump', ...R });
      const c0 = main.axis === 'x' ? { x0: a - 1, x1: a + 1, z0: Math.min(main.at, off), z1: Math.max(main.at, off) } : { z0: a - 1, z1: a + 1, x0: Math.min(main.at, off), x1: Math.max(main.at, off) };
      pipes.push({ id: `p${pipes.length}`, cls: 'connector', axis: main.axis === 'x' ? 'z' : 'x', at: a, a0: main.axis === 'x' ? c0.z0 : c0.x0, a1: main.axis === 'x' ? c0.z1 : c0.x1, w: 2 });
      break;
    }
  }
  // Breaches: the quiet way into a store from below. A cellar under it, a passage from the pipe under its street, a stair
  // up through its floor, the top 2.4 m in from the front wall beside a side wall (never in its front door's swing).
  const B = WAYS.breach, cand = [];
  for (const b of T.buildings ?? []) {
    if (!B.kinds.includes(b.kind) || b.ruined) continue;
    const fr = b.front, nx = fr === 'W' ? 1 : fr === 'E' ? -1 : 0, nz = fr === 'N' ? 1 : fr === 'S' ? -1 : 0;
    const deep = nz ? b.z1 - b.z0 : b.x1 - b.x0, wide = nz ? b.x1 - b.x0 : b.z1 - b.z0;
    if (deep < B.minDepth || wide < 9) continue;
    const front = fr === 'N' ? b.z0 : fr === 'S' ? b.z1 : fr === 'W' ? b.x0 : b.x1, mid = nz ? (b.x0 + b.x1) / 2 : (b.z0 + b.z1) / 2;
    const P = pipes.find((p) => (p.cls === 'trunk' || p.cls === 'lateral') && p.axis === (nz ? 'x' : 'z') && mid > p.a0 + 4 && mid < p.a1 - 4 && (front - p.at) * (nz || nx) > 0 && Math.abs(front - p.at) < 26);
    if (P) cand.push({ b, P, nx, nz, front, deep, wide });
  }
  const want = Math.min(cand.length, rng.int(B.per[0], B.per[1]) + (size > 360 ? 1 : 0));
  for (let i = 0; i < want && cand.length; i++) {
    const c = cand.splice(rng.int(0, cand.length - 1), 1)[0], b = c.b, n = c.nz || c.nx, along = c.nz ? 'x' : 'z';
    const lo = along === 'x' ? b.x0 : b.z0, hi = along === 'x' ? b.x1 : b.z1;
    // the stair's band (and its cellar's) clear of every door and bay in the front wall (their swing and their way in)
    const fronts = (b.doors ?? []).filter((d) => d.side === b.front);
    let s0 = null;
    const fl0 = c.front, nn = c.nz || c.nx, dA = Math.min(fl0 + nn * 1.0, fl0 + nn * 7.8), dB = Math.max(fl0 + nn * 1.0, fl0 + nn * 7.8);
    const footprint = (t) => (c.nz ? { x0: t - 0.5, x1: t + 1.5, z0: dA, z1: dB } : { x0: dA, x1: dB, z0: t - 0.5, z1: t + 1.5 });
    for (let t = rnd(lo + 1.6); t <= hi - 6.4 && s0 === null; t++) if (!fronts.some((d) => d.at + d.w / 2 + 1.2 > t - 1 && d.at - d.w / 2 - 1.2 < t + 2) && !world.blocked?.(footprint(t))) s0 = t; // clear of its doors, its own stair core, its counters
    if (s0 === null || s0 - 1 < lo + 0.4 || s0 + 5 > hi - 0.4) continue;
    const fl = rnd(c.front), len = Math.ceil(SEWER.depth / B.flight.pitch), aTop = fl + n * 2.4, aBot = aTop + n * len;
    const cel = { a0: Math.min(aBot, aBot + n * 5), a1: Math.max(aBot, aBot + n * 5) };
    const back = c.nz ? (n > 0 ? b.z1 : b.z0) : (n > 0 ? b.x1 : b.x0);
    if ((back - (n > 0 ? cel.a1 : cel.a0)) * n < 0.4) continue;
    const room = along === 'x' ? { x0: s0 - 1, x1: s0 + 5, z0: cel.a0, z1: cel.a1 } : { z0: s0 - 1, z1: s0 + 5, x0: cel.a0, x1: cel.a1 };
    if (rooms.some((r) => overlap(r, room, 2)) || pipes.some((p) => p.cls !== 'lateral' && p.cls !== 'trunk' && hitsPipe(p, room, 1))) continue;
    rooms.push({ id: `r${rooms.length}`, type: 'basement', store: b.id, storeKind: b.kind, ...room });
    const ce = c.P.at + Math.sign(c.front - c.P.at) * (c.P.w / 2); // the pipe's edge on the store's side
    pipes.push({ id: `p${pipes.length}`, cls: 'connector', axis: along === 'x' ? 'z' : 'x', at: s0 + 3, a0: Math.min(ce, aBot), a1: Math.max(ce, aBot), w: 2, breach: b.id });
    ways.push({ id: `breach${ways.filter((w) => w.kind === 'breach').length}`, kind: 'breach', axis: along === 'x' ? 'z' : 'x', u: n, aTop, b0: s0, wc: 1, yTop: y0, store: b.id, storeKind: b.kind, storeRect: { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 }, front: b.front });
  }
  // Manholes along every street and alley pipe; grates at the kerbs of the street pipes (a share of them loose).
  const tops = ways.map((w) => wayTop(w));
  const near = (x, z, r) => tops.some((t) => Math.abs(t.x - x) < r && Math.abs(t.z - z) < r);
  const wrecks = T.wrecks ?? [];
  const onRoad = (x, z, P) => (P.road ? x > P.road.x0 + 0.3 && x < P.road.x1 - 0.3 && z > P.road.z0 + 0.3 && z < P.road.z1 - 0.3 : P.corr ? x > P.corr.x0 + 0.3 && x < P.corr.x1 - 0.3 && z > P.corr.z0 + 0.3 && z < P.corr.z1 - 0.3 : false);
  let mh = 0, gr = 0;
  for (const P of pipes) {
    if (P.cls !== 'trunk' && P.cls !== 'lateral' && P.cls !== 'alley') continue;
    const M = WAYS.manhole, run = Math.max(2, Math.ceil(SEWER.depth / M.flight.pitch));
    const first = P.cls === 'alley' ? (P.a0 + P.a1) / 2 : P.a0 + 9, step = P.cls === 'alley' ? 1e9 : M.every;
    let side = rng.chance(0.5) ? 1 : -1;
    // the shaft stands in a niche beside the pipe, along it (so it fits the narrowest street): its top on the street a
    // metre off the pipe's centre line, its foot stepping sideways into the pipe
    for (let a = first; a < P.a1 - 6; a += step) {
      const aa = rnd(a), u = rng.chance(0.5) ? 1 : -1, b0 = side > 0 ? P.at + P.w / 2 : P.at - P.w / 2 - 1;
      const R = P.axis === 'x' ? { x0: Math.min(aa, aa + u * run) - 1, x1: Math.max(aa, aa + u * run) + 1, z0: b0, z1: b0 + 1 } : { x0: b0, x1: b0 + 1, z0: Math.min(aa, aa + u * run) - 1, z1: Math.max(aa, aa + u * run) + 1 };
      const t = P.axis === 'x' ? { x: aa - u * 0.9, z: b0 + 0.5 } : { x: b0 + 0.5, z: aa - u * 0.9 };
      if (!onRoad(t.x, t.z, P) || near(t.x, t.z, 6) || wrecks.some((w) => Math.hypot(w.x - t.x, w.z - t.z) < 3.4) || rooms.some((r) => overlap(r, R, 3)) || pipes.some((q) => q !== P && hitsPipe(q, R, 1))) { side = -side; continue; }
      ways.push({ id: `mh${mh++}`, kind: 'manhole', axis: P.axis, u, aTop: aa, b0, wc: 1, yTop: r2(ground(t.x, t.z)), pipe: P.id });
      tops.push(t);
      side = -side;
    }
    if (P.cls === 'alley' || !P.road) continue;
    const G = WAYS.grate, rw = (ROADS[P.road.row]?.w ?? 8) / 2, gside0 = rng.chance(0.5) ? 1 : -1;
    let k = 0;
    for (let a = P.a0 + 6 + G.every / 2; a < P.a1 - 6; a += G.every, k++) {
      const s = k % 2 ? -gside0 : gside0, aa = rnd(a), kerb = rnd(P.at + s * (rw - 0.4)), edge = P.at + s * (P.w / 2);
      if (Math.abs(kerb - edge) < 1) continue;
      const t = P.axis === 'x' ? { x: aa + 0.5, z: kerb } : { x: kerb, z: aa + 0.5 };
      if (near(t.x, t.z, 4) || rooms.some((r) => t.x > r.x0 - 2 && t.x < r.x1 + 2 && t.z > r.z0 - 2 && t.z < r.z1 + 2)) continue;
      const loose = rng.chance(G.enter) && Math.abs(kerb - edge) >= 2;
      const run = Math.max(2, Math.ceil(SEWER.depth / G.flight.pitch));
      if (loose && Math.abs(kerb - edge) >= run) {
        ways.push({ id: `gr${gr++}`, kind: 'grate', axis: P.axis === 'x' ? 'z' : 'x', u: -s, aTop: kerb + s * 0.0, b0: aa, wc: 1, yTop: r2(ground(t.x, t.z)), pipe: P.id, stub: { from: edge, to: kerb - s * run } });
        tops.push(t);
      }
      lights.push({ x: t.x, z: t.z, pipe: P.id, axis: P.axis, from: edge, to: kerb, at: aa, side: s, loose });
    }
  }
  // the frame: everything plus the rock round it
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  const grow = (a, b, c, d) => { x0 = Math.min(x0, a); z0 = Math.min(z0, b); x1 = Math.max(x1, c); z1 = Math.max(z1, d); };
  for (const p of pipes) { const w = (p.outW ?? p.w) / 2; if (p.axis === 'x') grow(p.a0, p.at - w, p.a1, p.at + w); else grow(p.at - w, p.a0, p.at + w, p.a1); }
  for (const r of rooms) grow(r.x0, r.z0, r.x1, r.z1);
  for (const w of ways) { const t = wayTop(w); grow(t.x - 2, t.z - 2, t.x + 2, t.z + 2); }
  const m = SEWER.margin + 2;
  return { y0, frame: { x0: Math.floor(x0) - m, z0: Math.floor(z0) - m, x1: Math.ceil(x1) + m, z1: Math.ceil(z1) + m }, pipes: pipes.map(({ road, corr, ...p }) => p), rooms, ways, lights, outfall: { water: out.water, x: wayTop(oWay).x, z: wayTop(oWay).z, pipe: P0.id }, size };
}
const overlap = (a, b, m = 0) => a.x0 - m < b.x1 && a.x1 + m > b.x0 && a.z0 - m < b.z1 && a.z1 + m > b.z0;
function hitsPipe(p, R, m) { const w = (p.outW ?? p.w) / 2; const q = p.axis === 'x' ? { x0: p.a0, z0: p.at - w, x1: p.a1, z1: p.at + w } : { x0: p.at - w, z0: p.a0, x1: p.at + w, z1: p.a1 }; return overlap(q, R, m); }
// Where you step onto a way from the street (0.9 m past its top edge).
export function wayTop(w) { const a = w.aTop - w.u * 0.9, b = w.b0 + w.wc / 2; return w.axis === 'x' ? { x: a, z: b } : { x: b, z: a }; }

// ---- the plan ------------------------------------------------------------------------------------------------------------
function planDrains(site) {
  const N = site.net, F = N.frame, y0 = N.y0, y1 = y0 - SEWER.depth;
  const W = F.x1 - F.x0, H = F.z1 - F.z0;
  const P = { site: site.id, n: 1, size: Math.max(W, H), W, H, ox: F.x0, oz: F.z0, Y: [y0, y1], flights: [], lift: null, axis: 'x', u: 1, drains: true, ways: [] };
  const look = { manhole: 'ladder', grate: 'ladder', outfall: 'concrete', culvert: 'concrete', breach: 'stair' };
  // the outfall first (the underground's `flights[0]`: the way an agent's `enter` uses)
  const order = [...N.ways.filter((w) => w.kind === 'outfall'), ...N.ways.filter((w) => w.kind !== 'outfall')];
  for (const w of order) {
    const f = flight(`${site.id}:${w.id}`, w.kind, 0, 1, w.axis, w.u, w.aTop, w.b0, w.wc, w.yTop, y1, 0, FL(w.kind, look[w.kind]));
    f.way = w.id; f.wkind = w.kind; f.lid = !!WAYS[w.kind].lid;
    P.flights.push(f); P.ways.push({ ...w, flight: f.id, top: { x: r2(f.top.x), z: r2(f.top.z) }, bottom: { x: r2(f.bottom.x), z: r2(f.bottom.z) }, rect: f.rect });
  }
  return P;
}

// ---- the level ------------------------------------------------------------------------------------------------------------
function genDrains(site, k, P) {
  const N = site.net, W = P.W, H = P.H, ox = P.ox, oz = P.oz, y = P.Y[1];
  const rng = makeRng((site.seed ^ hashStr(site.id)) >>> 0);
  const L = {
    site: site.id, k: 1, y, ox, oz, W, H, kind: 'drains', carry: SEWER.carry, fillColor: SEWER.fill,
    cells: new Uint8Array(W * H), space: new Int16Array(W * H).fill(-1), cls: new Uint8Array(W * H),
    rooms: [], doors: [], colliders: [], walls: [], floors: [], props: [], boxes: [], lights: [], glows: [], spawns: [], logs: [],
    squeeze: [], collapses: [], generator: null, arrival: null, departure: null, lobby: null, flights: P.flights.map((f) => f.id), name: site.name,
    grates: [], ways: P.ways, pipes: N.pipes,
  };
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i);
  const cellOf = (x, z) => at(Math.floor(x - ox), Math.floor(z - oz));
  const fill = (x0, z0, x1, z1, cls, only = false) => {
    for (let j = Math.floor(z0 - oz); j < Math.ceil(z1 - oz); j++) for (let i = Math.floor(x0 - ox); i < Math.ceil(x1 - ox); i++) {
      const q = at(i, j); if (q < 0) continue;
      if (only && L.cells[q] !== ROCK) continue;
      if (L.cells[q] === OPEN && (L.cls[q] === CLS.channel || L.cls[q] === CLS.bench) && cls !== CLS.channel && cls !== CLS.bench && cls < CLS.junction) continue; // the trunk keeps its channel where a lateral meets it
      L.cells[q] = OPEN; L.cls[q] = cls; L.space[q] = cls;
    }
  };
  const rectOf = (p, w = p.w) => (p.axis === 'x' ? [p.a0, p.at - w / 2, p.a1, p.at + w / 2] : [p.at - w / 2, p.a0, p.at + w / 2, p.a1]);
  // 1. pipes: the narrow first, the trunk over them (its channel and benches), then the rooms
  const ordered = [...N.pipes].sort((a, b) => (a.cls === 'trunk') - (b.cls === 'trunk'));
  for (const p of ordered) {
    if (p.cls === 'trunk') {
      const [a, b, c, d] = rectOf(p), bn = PIPES.trunk.bench;
      if (p.axis === 'x') { fill(a, b, c, b + bn, CLS.bench); fill(a, d - bn, c, d, CLS.bench); fill(a, b + bn, c, d - bn, CLS.channel); }
      else { fill(a, b, a + bn, d, CLS.bench); fill(c - bn, b, c, d, CLS.bench); fill(a + bn, b, c - bn, d, CLS.channel); }
    } else fill(...rectOf(p, p.outW ?? p.w), CLS[p.cls] ?? CLS.lateral);
  }
  for (const r of N.rooms) {
    fill(r.x0, r.z0, r.x1, r.z1, CLS[r.type]);
    L.rooms.push({ id: `${site.id}:${r.id}`, type: r.type, label: CHAMBERS[r.type].name.toUpperCase(), x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, store: r.store });
  }
  // 2. the grates' stubs (light falls down them) and the shafts' stair mass (every way's flight lands on this level)
  for (const g of N.lights) {
    const a = g.at, lo = Math.min(g.from, g.to), hi = Math.max(g.from, g.to);
    if (g.axis === 'x') fill(a, lo, a + 1, hi, CLS.stub, true); else fill(lo, a, hi, a + 1, CLS.stub, true);
    L.grates.push({ x: r2(g.x), z: r2(g.z), loose: g.loose, fx: g.axis === 'x' ? a + 0.5 : (g.from + g.to) / 2, fz: g.axis === 'x' ? (g.from + g.to) / 2 : a + 0.5 });
  }
  for (const w of N.ways) if (w.stub) { const lo = Math.min(w.stub.from, w.stub.to), hi = Math.max(w.stub.from, w.stub.to); if (w.axis === 'z') fill(w.b0, lo, w.b0 + 1, hi, CLS.stub, true); else fill(lo, w.b0, hi, w.b0 + 1, CLS.stub, true); }
  for (const f of P.flights) {
    const R = f.rect;
    for (let j = Math.floor(R.minZ - oz); j < Math.ceil(R.maxZ - oz); j++) for (let i = Math.floor(R.minX - ox); i < Math.ceil(R.maxX - ox); i++) { const q = at(i, j); if (q >= 0) { L.cells[q] = STAIR; L.cls[q] = 0; L.space[q] = -1; } }
    // the foot: open floor where you step off (the pipe the shaft stands beside)
    const b = f.bottom, q = cellOf(b.x, b.z);
    if (q >= 0 && L.cells[q] === ROCK) { L.cells[q] = OPEN; L.cls[q] = CLS.stub; L.space[q] = CLS.stub; }
  }
  // 3. the outfall's bars (a grille across its pipe a metre in from the ramp's foot) and the culvert's
  const OF = P.flights[0], OW = P.ways[0];
  if (OW.bars) {
    const fx = OF.bottom.x + (OF.axis === 'x' ? OF.u * 0.6 : 0), fz = OF.bottom.z + (OF.axis === 'z' ? OF.u * 0.6 : 0);
    const ax = OF.axis === 'x' ? 'z' : 'x'; // the grille's line runs across the pipe
    L.doors.push({ id: `${site.id}:1:bars`, room: null, x: r2(OF.axis === 'x' ? Math.round(fx) : OF.b0 + OF.wc / 2), z: r2(OF.axis === 'z' ? Math.round(fz) : OF.b0 + OF.wc / 2), axis: ax, nx: OF.axis === 'x' ? -OF.u : 0, nz: OF.axis === 'z' ? -OF.u : 0, width: OF.wc, leaves: 2, hinge: 1, material: 'bars', locked: true, bars: true });
  }
  // 4. the flow field: steps from the outfall's foot over the floor (the water runs down it), and the proof
  const dist = new Int32Array(W * H).fill(-1), Q = new Int32Array(W * H);
  const s = cellOf(OF.bottom.x, OF.bottom.z);
  let h = 0, t = 0;
  if (s >= 0) { dist[s] = 0; Q[t++] = s; }
  while (h < t) {
    const p = Q[h++], i = p % W, j = (p - i) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = at(i + di, j + dj); if (n >= 0 && dist[n] < 0 && L.cells[n] === OPEN) { dist[n] = dist[p] + 1; Q[t++] = n; } }
  }
  L.dist = dist;
  // a cell nothing reaches (a corner two pipes left) goes back to rock; a whole pipe nothing reaches fails the proof
  let open = 0, sealed = 0;
  for (let q = 0; q < W * H; q++) if (L.cells[q] === OPEN) { if (dist[q] >= 0) open++; else { L.cells[q] = ROCK; L.cls[q] = 0; L.space[q] = -1; sealed++; } }
  const unreached = [];
  for (const p of N.pipes) { const m = (p.a0 + p.a1) / 2, q = p.axis === 'x' ? cellOf(m, p.at) : cellOf(p.at, m); if (q < 0 || dist[q] < 0) unreached.push(p.id); }
  for (const w of P.ways) { const q = cellOf(w.bottom.x, w.bottom.z); if (q < 0 || dist[q] < 0) unreached.push(w.id); }
  for (const r of L.rooms) { const q = cellOf((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2); if (q < 0 || dist[q] < 0) unreached.push(r.id); }
  // 5. colliders: the rock that touches a floor cell, merged; the flights' flanks and blocks
  const edge = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const q = j * W + i;
    if (L.cells[q] !== ROCK) continue;
    let touch = false;
    for (let dj = -1; dj <= 1 && !touch; dj++) for (let di = -1; di <= 1; di++) { const n = at(i + di, j + dj); if (n >= 0 && L.cells[n] === OPEN) { touch = true; break; } }
    if (touch) edge[q] = 1;
  }
  for (const R of mergeRects(edge, W, H)) L.colliders.push({ x0: ox + R[0], z0: oz + R[1], x1: ox + R[2], z1: oz + R[3], base: y, top: y + UG.wallH, tag: 'ug-wall' });
  L.walls = L.colliders.map((b) => [b.x0, b.z0, b.x1, b.z1]);
  L.edge = edge;
  for (const f of P.flights) flightColliders(L, f);
  // 6. floors, by class
  const masks = new Map();
  for (let q = 0; q < W * H; q++) if (L.cells[q] === OPEN) { const c = L.cls[q]; if (!masks.has(c)) masks.set(c, new Uint8Array(W * H)); masks.get(c)[q] = 1; }
  for (const [c, mask] of masks) for (const R of mergeRects(mask, W, H)) L.floors.push([ox + R[0], oz + R[1], ox + R[2], oz + R[3], FLOOR_OF[c] ?? '#4a463d']);
  L.arrival = { x: OF.bottom.x, z: OF.bottom.z };
  // 7. what is in it
  furnish(L, N, P, rng, cellOf, dist);
  L.proof = { ok: !unreached.length && sealed < open * 0.01, unreached, open, sealed, pipes: N.pipes.length, ways: P.ways.length, rooms: L.rooms.length, outfall: { ...N.outfall }, start: [r2(OF.bottom.x), r2(OF.bottom.z)] };
  // 8. the hash
  const Hh = new Hasher().str(L.site).num(ox).num(oz).int(W).int(H);
  for (let q = 0; q < W * H; q++) Hh.int(L.cells[q] | (L.cls[q] << 4));
  for (const f of P.flights) Hh.str(f.id).num(f.aTop).num(f.b0).num(f.yTop);
  for (const d of L.doors) Hh.str(d.id).num(d.x).num(d.z);
  for (const b of L.boxes) Hh.str(b.id).num(b.x).num(b.z).str(b.table);
  for (const sp of L.spawns) Hh.str(sp.kind).num(sp.x).num(sp.z);
  L.hash = Hh.hex();
  return L;
}

// Rooms dressed, the camp and the nests, the caches, the logs.
function furnish(L, N, P, rng, cellOf, dist) {
  const y = L.y, rooms = L.rooms;
  const free = (x0, z0, x1, z1, tries = 40) => {
    for (let t = 0; t < tries; t++) {
      const x = rng.range(x0, x1), z = rng.range(z0, z1), q = cellOf(x, z);
      if (q < 0 || L.cells[q] !== OPEN) continue;
      if (L.props.some((p) => x > p.x0 - 0.6 && x < p.x1 + 0.6 && z > p.z0 - 0.6 && z < p.z1 + 0.6)) continue;
      return { x: r2(x), z: r2(z) };
    }
    return null;
  };
  const prop = (kind, x0, z0, x1, z1, h, extra = {}) => { const p = { kind, x0: r2(x0), z0: r2(z0), x1: r2(x1), z1: r2(z1), h, ...extra }; L.props.push(p); return p; };
  const box = (table, x, z, label, cap = 30, extra = {}) => { const b = { id: `ring:ug:${L.site}:1:b${L.boxes.length}`, table, x: r2(x), z: r2(z), cap, label, room: null, ...extra }; L.boxes.push(b); return b; };
  const log = (id, spot, room = null) => { if (spot) L.logs.push({ id, x: spot.x, z: spot.z, paper: true, room, code: null }); };
  const centre = (r) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
  // the pump station: its generator against the far wall, two pumps, a shelf (its cache), strip lights the power runs
  const pump = rooms.find((r) => r.type === 'pump');
  if (pump) {
    const c = centre(pump), wide = pump.x1 - pump.x0 >= pump.z1 - pump.z0;
    const g = wide ? prop('generator', c.x - 1.3, pump.z1 - 2.2, c.x + 1.3, pump.z1 - 0.8, 1.6) : prop('generator', pump.x1 - 2.2, c.z - 1.3, pump.x1 - 0.8, c.z + 1.3, 1.6);
    L.generator = { x: r2((g.x0 + g.x1) / 2), z: r2((g.z0 + g.z1) / 2), room: pump.id };
    for (const s of [-1, 1]) wide ? prop('pump', c.x + s * 4.2 - 0.8, pump.z0 + 1, c.x + s * 4.2 + 0.8, pump.z0 + 2.2, 1.3) : prop('pump', pump.x0 + 1, c.z + s * 4.2 - 0.8, pump.x0 + 2.2, c.z + s * 4.2 + 0.8, 1.3);
    const sh = wide ? prop('shelf', pump.x0 + 0.6, pump.z1 - 1.1, pump.x0 + 2.6, pump.z1 - 0.6, 1.9) : prop('shelf', pump.x1 - 1.1, pump.z0 + 0.6, pump.x1 - 0.6, pump.z0 + 2.6, 1.9);
    box('us_pump', (sh.x0 + sh.x1) / 2, (sh.z0 + sh.z1) / 2, 'SHELF · PUMP STATION', 40);
    for (let i = 0; i < 3; i++) L.lights.push(wide ? { x: r2(pump.x0 + (pump.x1 - pump.x0) * (i + 0.5) / 3), z: r2(c.z), along: 'x', len: 1.6, room: pump.id } : { x: r2(c.x), z: r2(pump.z0 + (pump.z1 - pump.z0) * (i + 0.5) / 3), along: 'z', len: 1.6, room: pump.id });
    log('us_pump', free(pump.x0 + 1, pump.z0 + 1, pump.x1 - 1, pump.z1 - 1), pump.id);
  }
  // breaches' cellars: a rubble heap under the hole, an old shelf
  for (const r of rooms) if (r.type === 'basement') { const s = free(r.x0 + 0.8, r.z0 + 0.8, r.x1 - 0.8, r.z1 - 0.8); if (s) prop('crate', s.x - 0.6, s.z - 0.4, s.x + 0.6, s.z + 0.4, 0.75); }
  // the junctions, far to near: the squatters' camp in one, the nests in others
  const juncs = rooms.filter((r) => r.type === 'junction').map((r) => ({ r, d: dist[cellOf(...Object.values(centre(r)))] ?? 0 })).sort((a, b) => b.d - a.d);
  const used = new Set();
  if (rng.chance(LIFE.squat) && juncs.length > 1) {
    const J = juncs[Math.min(juncs.length - 1, 1)].r, c = centre(J); used.add(J.id);
    prop('cot', J.x0 + 0.6, J.z0 + 0.6, J.x0 + 1.5, J.z0 + 2.6, 0.5); prop('cot', J.x1 - 1.5, J.z0 + 0.6, J.x1 - 0.6, J.z0 + 2.6, 0.5);
    const cr = prop('crate', c.x - 0.6, J.z1 - 1.4, c.x + 0.6, J.z1 - 0.6, 0.75);
    box('us_squat', (cr.x0 + cr.x1) / 2, (cr.z0 + cr.z1) / 2, 'THE SQUATTERS\' CACHE', 60, { camp: true });
    L.camp = { x: r2(c.x), z: r2(c.z), room: J.id };
    L.glows.push({ x: r2(c.x + 0.6), z: r2(c.z - 0.4), c: 1 });
    const n = rng.int(LIFE.squatters[0], LIFE.squatters[1]);
    for (let i = 0; i < n; i++) { const p = free(J.x0 + 1, J.z0 + 1, J.x1 - 1, J.z1 - 1); if (p) L.spawns.push({ kind: 'drifter', ...p, post: { ...p }, weapon: rng.chance(0.4) ? 'pistol' : null, squat: true }); }
    log('us_squat', free(J.x0 + 1, J.z0 + 1, J.x1 - 1, J.z1 - 1), J.id);
  }
  const nN = Math.max(1, Math.round(N.size / LIFE.nestPer));
  const nestAt = [];
  for (const { r } of juncs) { if (nestAt.length >= nN) break; if (!used.has(r.id)) { nestAt.push(centre(r)); used.add(r.id); } }
  // too few chambers: the far end of a pipe (a dead end) holds a nest
  if (nestAt.length < nN) {
    let best = -1, bq = -1;
    for (let q = 0; q < dist.length; q++) if (dist[q] > best && L.cls[q] !== CLS.stub) { best = dist[q]; bq = q; }
    if (bq >= 0) nestAt.push({ x: L.ox + (bq % L.W) + 0.5, z: L.oz + Math.floor(bq / L.W) + 0.5 });
  }
  L.nests = [];
  for (const c of nestAt) {
    const m = rng.int(LIFE.nestSize[0], LIFE.nestSize[1]), nest = { x: r2(c.x), z: r2(c.z), r: 3.4 };
    L.nests.push(nest);
    for (let i = 0; i < m; i++) { const p = free(c.x - 3, c.z - 3, c.x + 3, c.z + 3); if (p) L.spawns.push({ kind: i === 0 && rng.chance(0.6) ? 'sprinter' : 'shambler', ...p, post: { ...nest }, nest: true }); }
    const p = free(c.x - 2.5, c.z - 2.5, c.x + 2.5, c.z + 2.5); if (p) box('us_nest', p.x, p.z, 'WHAT THE NEST KEPT', 40);
  }
  L.nest = L.nests[0] ?? null;
  // the loose dead: anywhere in the pipes, away from the outfall
  const pipeCell = () => { for (let t = 0; t < 60; t++) { const q = rng.int(0, dist.length - 1); if (L.cells[q] === OPEN && dist[q] > 30 && L.cls[q] !== CLS.stub && L.cls[q] !== CLS.basement) return { x: r2(L.ox + (q % L.W) + 0.5), z: r2(L.oz + Math.floor(q / L.W) + 0.5) }; } return null; };
  const nl = rng.int(LIFE.loose[0], LIFE.loose[1]);
  for (let i = 0; i < nl; i++) { const p = pipeCell(); if (p) L.spawns.push({ kind: rng.chance(LIFE.runners) ? 'sprinter' : 'shambler', ...p, post: { ...p } }); }
  // flotsam: in the chambers and the pipes; some under the murk with nothing on show
  const nf = rng.int(CACHES.flotsam[0], CACHES.flotsam[1]);
  for (let i = 0; i < nf; i++) {
    const r = rng.chance(0.5) && rooms.length ? rooms[rng.int(0, rooms.length - 1)] : null, p = r ? free(r.x0 + 0.8, r.z0 + 0.8, r.x1 - 0.8, r.z1 - 0.8) : pipeCell();
    if (!p) continue;
    const sub = rng.chance(CACHES.submerged);
    box('us_flotsam', p.x, p.z, sub ? 'SOMETHING UNDER THE WATER' : 'A WASHED-DOWN BAG', 20, { submerged: sub });
  }
  // notes: the chalk by the outfall's foot, the water line in a chamber
  const a = L.arrival; log('us_chalk', free(a.x - 4, a.z - 4, a.x + 4, a.z + 4));
  if (juncs.length) { const J = juncs[juncs.length - 1].r; log('us_flood', free(J.x0 + 1, J.z0 + 1, J.x1 - 1, J.z1 - 1), J.id); }
  void y;
}

// A level as text (the agent's `understreet action=map`): # rock, . floor, ~ channel, = stair, + door, g generator,
// c box, z infected, p person, ? log, M a way's foot. Cropped to a window round (cx, cz) when given.
export function drainMap(L, cx = null, cz = null, r = 40) {
  const i0 = cx === null ? 0 : Math.max(0, Math.floor(cx - r - L.ox)), i1 = cx === null ? L.W : Math.min(L.W, Math.ceil(cx + r - L.ox));
  const j0 = cz === null ? 0 : Math.max(0, Math.floor(cz - r - L.oz)), j1 = cz === null ? L.H : Math.min(L.H, Math.ceil(cz + r - L.oz));
  const rows = [];
  for (let j = j0; j < j1; j++) { let s = ''; for (let i = i0; i < i1; i++) { const q = j * L.W + i, c = L.cells[q]; s += c === STAIR ? '=' : c !== OPEN ? '#' : L.cls[q] === CLS.channel ? '~' : '.'; } rows.push(s.split('')); }
  const put = (x, z, ch) => { const i = Math.floor(x - L.ox) - i0, j = Math.floor(z - L.oz) - j0; if (j >= 0 && j < rows.length && i >= 0 && i < rows[j].length) rows[j][i] = ch; };
  for (const w of L.ways) put(w.bottom.x, w.bottom.z, 'M');
  for (const d of L.doors) put(d.x, d.z, '+');
  for (const b of L.boxes) put(b.x, b.z, 'c');
  for (const g of L.logs) put(g.x, g.z, '?');
  for (const s of L.spawns) put(s.x, s.z, s.kind === 'drifter' ? 'p' : 'z');
  if (L.generator) put(L.generator.x, L.generator.z, 'g');
  return rows.map((r) => r.join('')).join('\n');
}

GEN.drains = { plan: planDrains, level: genDrains };
export { planDrains, genDrains };
