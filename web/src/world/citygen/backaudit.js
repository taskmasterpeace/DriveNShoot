// THE BACK-LOT AUDITS (docs/design/WEB_BACK_LOTS.md §8): a built town walked on its own colliders, headless, the way
// world/citygen/audit.js walks floors and bays (its TownProbe: a 0.4 m person / a 1.1 m car on a 0.5 m grid).
//   alleys     a car's circle drives every block's alley end to end, inside the corridor
//   loops      with every door and bay of every building SHUT (a plug in each gap: nobody cuts through a building), a
//              person from the front step reaches all four sides and all four corners of it: the way round it is open
//   yards      a yard home's back yard is closed: from inside it, with its gates shut, a person reaches neither the alley
//              lane nor the street; with them open, the alley
//   backs      every building on a lot has a door or a bay on its back wall, and the back wall faces its block's alley
import { TownProbe } from './audit.js';
import { doorXZ } from './build.js';
import { YARD } from '../../data/backlots.js';

const R_FOOT = 0.4, R_CAR = 1.1;
const plug = (x0, z0, x1, z1) => ({ minX: x0, minZ: z0, maxX: x1, maxZ: z1, tag: 'plug', height: 3, base: 0 });
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };

export function auditAlleys(built, T) {
  const P = new TownProbe(built), bad = [];
  let n = 0;
  for (const A of T.alleys ?? []) {
    n++;
    const L = A.lane, ax = A.axis === 'x', w = ax ? L.z1 - L.z0 : L.x1 - L.x0;
    if (w < 4.5 - 1e-6) { bad.push(`${A.id}: lane ${w.toFixed(1)} m`); continue; }
    const W = { x0: A.x0 - (ax ? 2 : 0), x1: A.x1 + (ax ? 2 : 0), z0: A.z0 - (ax ? 0 : 2), z1: A.z1 + (ax ? 0 : 2) };
    const sx = ax ? L.x0 + 1.5 : (L.x0 + L.x1) / 2, sz = ax ? (L.z0 + L.z1) / 2 : L.z0 + 1.5, ex = ax ? L.x1 - 1.5 : sx, ez = ax ? sz : L.z1 - 1.5;
    const F = P.flood(sx, sz, W, R_CAR, 60000);
    if (F.startBlocked) { bad.push(`${A.id}: its mouth is blocked`); continue; }
    if (!F.states.some(([x, z]) => Math.abs(x - ex) <= 0.6 && Math.abs(z - ez) <= 0.6)) bad.push(`${A.id}: a car cannot drive it end to end`);
  }
  return { alleys: n, blocks: T.blocks.length, greens: T.blocks.filter((b) => b.green).length, unalleyed: T.blocks.filter((b) => !b.green && !b.alley).length, bad, ok: !bad.length && !T.blocks.some((b) => !b.green && !b.alley) };
}

// Every door and bay plugged: the town as somebody outside sees it.
export function shutProbe(built, T) {
  const plugs = [];
  for (const B of T.buildings) for (const d of B.doors) {
    const [x, z] = doorXZ(B, d), hw = d.w / 2 + 0.05;
    plugs.push(d.side === 'N' || d.side === 'S' ? plug(x - hw, z - 0.25, x + hw, z + 0.25) : plug(x - 0.25, z - hw, x + 0.25, z + hw));
  }
  return new TownProbe({ boxes: [...built.boxes, ...plugs], recs: built.recs });
}

export function auditLoops(built, T, P = shutProbe(built, T), limit = Infinity) {
  const bad = [];
  let n = 0;
  const list = T.buildings.slice(0, limit);
  for (const B of list) {
    const d = B.doors.find((q) => q.side === B.front && q.kind === 'door') ?? B.doors.find((q) => q.side === B.front) ?? B.doors[0];
    const [dx, dz] = doorXZ(B, d), out = d.kind === 'bay' ? 4 : 1.6;
    const sx = d.side === 'E' ? dx + out : d.side === 'W' ? dx - out : dx, sz = d.side === 'S' ? dz + out : d.side === 'N' ? dz - out : dz;
    const m = 9, W = { x0: B.x0 - m, z0: B.z0 - m, x1: B.x1 + m, z1: B.z1 + m };
    const F = P.flood(sx, sz, W, R_FOOT, 60000);
    n++;
    if (F.startBlocked) { bad.push(`${B.id}(${B.kind}): front step blocked`); continue; }
    const o0 = 0.25, o1 = 3.6, x0 = B.x0, x1 = B.x1, z0 = B.z0, z1 = B.z1;
    const regions = {
      N: [x0, z0 - o1, x1, z0 - o0], S: [x0, z1 + o0, x1, z1 + o1], W: [x0 - o1, z0, x0 - o0, z1], E: [x1 + o0, z0, x1 + o1, z1],
      NW: [x0 - o1, z0 - o1, x0 - o0, z0 - o0], NE: [x1 + o0, z0 - o1, x1 + o1, z0 - o0], SW: [x0 - o1, z1 + o0, x0 - o0, z1 + o1], SE: [x1 + o0, z1 + o0, x1 + o1, z1 + o1],
    };
    const miss = [];
    for (const [k, [a, b, c, e]] of Object.entries(regions)) if (!F.states.some(([x, z]) => x >= a && x <= c && z >= b && z <= e)) miss.push(k);
    if (miss.length) bad.push(`${B.id}(${B.kind}): no way round past ${miss.join(',')}`);
  }
  return { buildings: n, bad, ok: !bad.length };
}

export function auditYards(built, T) {
  const bad = [];
  const homes = T.buildings.filter((B) => YARD.kinds.includes(B.kind) && !B.hero && (B.zone === 'res' || B.zone === 'farm'));
  const byB = new Map((T.yards ?? []).map((y) => [y.b, y]));
  const shut = shutProbe(built, T);
  // the gates shut too
  const gatePlugs = built.gates.map((q) => (q.nz !== 0 ? plug(q.x - q.w / 2 - 0.05, q.z - 0.25, q.x + q.w / 2 + 0.05, q.z + 0.25) : plug(q.x - 0.25, q.z - q.w / 2 - 0.05, q.x + 0.25, q.z + q.w / 2 + 0.05)));
  const closed = new TownProbe({ boxes: [...shut.boxes, ...gatePlugs], recs: built.recs });
  let fenced = 0, gated = 0, enclosed = 0, opens = 0;
  for (const B of homes) {
    const y = byB.get(B.id);
    if (!y) { bad.push(`${B.id}(${B.kind}): no yard`); continue; }
    const fences = built.fences.filter((f) => f.yard === y.id).length, gate = built.gates.find((q) => q.yard === y.id && q.kind === 'alley');
    if (fences >= 3) fenced++; else bad.push(`${B.id}: ${fences} fence panels`);
    if (gate) gated++; else { bad.push(`${B.id}: no alley gate`); continue; }
    // a cell inside the yard: just inside the alley gate
    const ix = gate.x - gate.nx * 1.0, iz = gate.z - gate.nz * 1.0;
    const W = { x0: Math.min(B.x0, gate.x) - 12, z0: Math.min(B.z0, gate.z) - 12, x1: Math.max(B.x1, gate.x) + 12, z1: Math.max(B.z1, gate.z) + 12 };
    const A = y.alley, lane = A?.lane;
    const inLane = (x, z) => lane && x > lane.x0 && x < lane.x1 && z > lane.z0 && z < lane.z1;
    const fv = B.front === 'N' ? B.z0 - 3 : B.front === 'S' ? B.z1 + 3 : B.front === 'W' ? B.x0 - 3 : B.x1 + 3; // the front yard toward the street
    const toStreet = (x, z) => (B.front === 'N' ? z < fv : B.front === 'S' ? z > fv : B.front === 'W' ? x < fv : x > fv);
    const C = closed.flood(ix, iz, W, R_FOOT, 40000);
    const leaks = !C.startBlocked && C.states.some(([x, z]) => inLane(x, z) || toStreet(x, z));
    if (C.startBlocked) bad.push(`${B.id}: the yard behind the gate is blocked`);
    else if (leaks) bad.push(`${B.id}: the yard is not closed`);
    else enclosed++;
    const O = shut.flood(ix, iz, W, R_FOOT, 40000);
    if (O.states.some(([x, z]) => inLane(x, z))) opens++; else bad.push(`${B.id}: the open gate does not reach the alley`);
  }
  return { homes: homes.length, yards: (T.yards ?? []).length, fenced, gated, enclosed, opens, bad, ok: !bad.length };
}

export function auditBacks(T) {
  const bad = [];
  const alleys = new Map((T.alleys ?? []).map((A) => [A.id, A]));
  let n = 0, facing = 0;
  for (const B of T.buildings) {
    const back = OPP[B.front];
    if (!B.doors.some((d) => d.side === back)) { bad.push(`${B.id}(${B.kind}): no back door`); continue; }
    if (B.outbuilding) continue; // a yard's garage: its bay faces the alley, its man door the yard
    const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    const blk = T.blocks.find((b) => cx > b.x0 && cx < b.x1 && cz > b.z0 && cz < b.z1);
    if (!blk || blk.green) continue;
    const A = alleys.get(blk.alley);
    if (!A) { bad.push(`${B.id}: its block has no alley`); continue; }
    n++;
    const ok = back === 'S' ? A.z0 >= B.z1 - 0.01 : back === 'N' ? A.z1 <= B.z0 + 0.01 : back === 'E' ? A.x0 >= B.x1 - 0.01 : A.x1 <= B.x0 + 0.01;
    const sameAxis = (back === 'N' || back === 'S') === (A.axis === 'x');
    if (ok && sameAxis) facing++; else bad.push(`${B.id}(${B.kind}): back ${back} does not face ${A.id}`);
  }
  return { onBlocks: n, facing, bad, ok: !bad.length };
}
