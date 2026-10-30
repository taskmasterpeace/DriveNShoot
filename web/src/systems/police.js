import { STATION_TIERS, HEAVY_WEALTH, FORCES, FORCE_BY_ARCH, RESPONSES, BREACH_TRUCK, SEVERITY, CHANNELS, PATROLS, SIREN, DISPATCH_LINES, PLACE_WORDS } from '../data/police.js';
import { ARCHETYPES } from '../data/citygen.js';
import { VERBS } from '../data/society.js';
import { RAIDERS } from '../data/sitestories.js';
import { spatial } from './audio.js';
import { outfit } from './characters.js';
import { VEHICLES } from './vehicles.js';

// The breach truck is a row like any vehicle (data/police.js BREACH_TRUCK on the patrol truck's frame).
if (!VEHICLES.breach_truck) VEHICLES.breach_truck = { ...VEHICLES.patrol, ...BREACH_TRUCK };

// POLICE RESPONSE (docs/design/WEB_POLICE_RESPONSE.md; rows in data/police.js). Every live generated town that has a
// police station (world/citygen/layout.js T.police, from 30 buildings up) gets a DESK: its tier by size (post, station,
// precinct), its force by owner (a sheriff's bulls, a family's militia, a raider boss's enforcers), a motor pool parked
// at the station's bays, an armory roster, holding cells, and the town's own street graph (T.roads) to drive on.
//   beats     patrol cars loop the street corners round the centre and officers walk the main street, on shifts
//   reports   a crime becomes known to the desk only through a CHANNEL: a witness who RUNS to the station (and can be
//             stopped), an officer who saw it (on the radio), shots the station or a resident heard (the spot is where
//             the hearer thinks it was), or an alarm wired to the desk. Nothing else: law 6.
//   dispatch  severity picks the rung: a patrol car (the beat car nearest is diverted), a posse (two cars), the heavy team
//             (the breach truck: shields, a ram, rifles) only where the town keeps one; else the best it has
//   units     leave the motor pool and DRIVE the town's streets (the street router below) to the REPORTED spot, never
//             your true position; park, get out, search round it, hold the block's corners, breach a building the report
//             names; on sight of you: the cuffs (if the force arrests) or the guns; nothing found: clear and drive home
//   sirens    a rolling unit's siren is heard through the same falloff every sound uses (audio.js spatial), with its
//             direction; the desk's lines go out on the air from the station (systems/kit.js keyUp: a scanner copies them)
// Hooks: main.js constructs/updates it and calls onNoise from g.noise; gadgets.js draws its lights into its parts mesh;
// security.js leaves a town this desk owns to it. No allocation in the per-frame paths (scratch below; few units).
const r1 = (v) => Math.round(v * 10) / 10;
const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
// +z is south (screen down), +x east. A bearing from the listener to the source: 0 = north, clockwise.
export const bearingOf = (dx, dz) => { let b = Math.atan2(dx, -dz) * 180 / Math.PI; if (b < 0) b += 360; return b; };
export const compassOf = (deg) => COMPASS[Math.round(deg / 45) % 8];
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const rngOf = (seed) => { let s = (seed * 4294967296) >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)) >>> 0) / 4294967296; };

// ---- the town's streets as a graph (pure: T.roads -> crossings and the street pieces between them) -------------------
// An x-road is a strip along x at z = at (x0..x1); a z-road along z at x = at (z0..z1). A crossing is where an x-road's
// line and a z-road's line meet inside both. route(a, b): the shortest way along the streets from a point to a point
// (each end joins the street nearest it), as a polyline [a, foot of a, crossings..., foot of b, b].
export class StreetGraph {
  constructor(T) {
    this.roads = T.roads.filter((r) => r.axis === 'x' || r.axis === 'z');
    this.nodes = []; this.adj = [];
    const key = new Map(), node = (x, z) => { const k = `${Math.round(x)},${Math.round(z)}`; let i = key.get(k); if (i === undefined) { i = this.nodes.length; key.set(k, i); this.nodes.push({ x, z }); this.adj.push([]); } return i; };
    this.on = this.roads.map(() => []); // per road: [node index, coordinate along it]
    this.roads.forEach((a, ia) => {
      if (a.axis !== 'x') return;
      this.roads.forEach((b, ib) => {
        if (b.axis !== 'z') return;
        const x = b.at, z = a.at;
        if (x < a.x0 - 1 || x > a.x1 + 1 || z < b.z0 - 1 || z > b.z1 + 1) return;
        const n = node(x, z);
        this.on[ia].push([n, x]); this.on[ib].push([n, z]);
      });
    });
    this.roads.forEach((r, i) => {
      const L = this.on[i].sort((p, q) => p[1] - q[1]);
      for (let k = 1; k < L.length; k++) { const a = L[k - 1][0], b = L[k][0], d = Math.abs(L[k][1] - L[k - 1][1]); if (a !== b) { this.adj[a].push([b, d]); this.adj[b].push([a, d]); } }
    });
    this.main = this.roads.find((r) => r.main) ?? this.roads[0] ?? null;
    this.blocked = new Set(); // street pieces a wreck (or a car that could not get by) closes: 'a-b' node pairs, a < b
  }
  ek(a, b) { return a < b ? `${a}-${b}` : `${b}-${a}`; }
  // Close every street piece a dead car stands in (the town's own wrecks: built.wrecks), and every crossing it fills.
  blockWrecks(wrecks, r = 3.4) {
    let n = 0;
    for (let a = 0; a < this.adj.length; a++) for (const [b] of this.adj[a]) {
      if (b < a) continue;
      const A = this.nodes[a], B = this.nodes[b], dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz || 1;
      for (const w of wrecks) { const t = Math.max(0, Math.min(1, ((w.x - A.x) * dx + (w.z - A.z) * dz) / L2)); if (Math.hypot(A.x + dx * t - w.x, A.z + dz * t - w.z) < r) { this.blocked.add(this.ek(a, b)); n++; break; } }
    }
    return n;
  }
  blockNode(i) { for (const [b] of this.adj[i] ?? []) this.blocked.add(this.ek(i, b)); }
  // The foot on the nearest street: { road index, x, z, d (off it), along }
  foot(x, z) {
    let best = null;
    this.roads.forEach((r, i) => {
      const fx = r.axis === 'x' ? Math.max(r.x0, Math.min(r.x1, x)) : r.at, fz = r.axis === 'x' ? r.at : Math.max(r.z0, Math.min(r.z1, z));
      const d = Math.hypot(x - fx, z - fz);
      if (!best || d < best.d) best = { i, x: fx, z: fz, d, along: r.axis === 'x' ? fx : fz };
    });
    return best;
  }
  route(ax, az, bx, bz) {
    const A = this.foot(ax, az), B = this.foot(bx, bz);
    if (!A || !B) return [{ x: bx, z: bz }];
    const out = [{ x: A.x, z: A.z }];
    if (A.i === B.i) { out.push({ x: B.x, z: B.z }, { x: bx, z: bz }); return out; }
    // Dijkstra from the crossings either side of A's foot to those either side of B's (few hundred nodes at most).
    const n = this.nodes.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    const ends = (F) => { const L = this.on[F.i]; let lo = null, hi = null; for (const p of L) { if (p[1] <= F.along) lo = p; if (p[1] >= F.along && !hi) hi = p; } return [lo, hi].filter(Boolean).map((p) => [p[0], Math.abs(p[1] - F.along)]); };
    for (const [i, d] of ends(A)) if (d < dist[i]) dist[i] = d;
    const goal = new Map(ends(B).map(([i, d]) => [i, d]));
    for (;;) {
      let u = -1, du = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < du) { du = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const [v, w] of this.adj[u]) if (du + w < dist[v] && !this.blocked.has(this.ek(u, v))) { dist[v] = du + w; prev[v] = u; }
    }
    let gi = -1, gd = Infinity;
    for (const [i, d] of goal) if (dist[i] + d < gd) { gd = dist[i] + d; gi = i; }
    if (gi < 0) { if (this.blocked.size && !this.retry) { const keep = this.blocked; this.blocked = new Set(); this.retry = true; const r = this.route(ax, az, bx, bz); this.retry = false; this.blocked = keep; return r; } out.push({ x: bx, z: bz }); return out; }
    const chain = []; for (let i = gi; i >= 0; i = prev[i]) chain.push(i);
    for (let k = chain.length - 1; k >= 0; k--) out.push({ x: this.nodes[chain[k]].x, z: this.nodes[chain[k]].z, n: chain[k] });
    out.push({ x: B.x, z: B.z }, { x: bx, z: bz });
    return out;
  }
  // The crossings nearest a point (a block's corners round a spot: the perimeter's posts).
  corners(x, z, n = 2) { return this.nodes.map((p) => ({ x: p.x, z: p.z, d: Math.hypot(p.x - x, p.z - z) })).sort((a, b) => a.d - b.d).slice(0, n); }
}
export function routeLen(R) { let L = 0; for (let i = 1; i < R.length; i++) L += Math.hypot(R[i].x - R[i - 1].x, R[i].z - R[i - 1].z); return L; }

// The tier a town of this size and wealth keeps (pure; the selftest's response table uses it too).
export function tierOf(nBld, wealth = 0.4, major = false) {
  let id = null;
  for (const [k, t] of Object.entries(STATION_TIERS)) if (nBld >= t.minBld) id = k;
  if (!id) return null;
  const heavy = STATION_TIERS[id].heavy || !!major || (id === 'station' && wealth >= HEAVY_WEALTH);
  return { id, heavy };
}
export function forceOf(arch, owner) {
  if (owner?.kind === 'faction' && RAIDERS.includes(owner.id)) return 'enforcers';
  if (owner?.kind === 'family') return owner.raids ? 'enforcers' : 'militia';
  return FORCE_BY_ARCH[arch] ?? 'sheriff';
}

export class Police {
  constructor(g) {
    this.g = g;
    this.enabled = true;   // the desk listens and sends (off: nothing is reported, beats stay in)
    this.beatsOn = true;   // the patrols go out on their shifts
    this.towns = new Map(); // town id -> desk
    this.cases = []; this.pending = []; this.units = []; this.runners = [];
    this.seq = 0; this.lastSeq = g.eventSeq ?? 0; this.scanT = 0; this.sirenT = 0; this.wailT = 0;
    this.heard = [];       // the sirens you heard: { unit, at, d, bearing, compass, arrivedAt }
    this.counts = { reports: 0, silenced: 0, cases: 0, dispatched: 0, byChannel: { witness: 0, patrol: 0, heard: 0, alarm: 0 }, byRung: { patrol: 0, posse: 0, heavy: 0 }, arrived: 0, breaches: 0, contacts: 0, cleared: 0, fined: 0, jailed: 0, beatsOut: 0 };
    this.lastReport = null;
  }

  // ---- the desks: one per live town with a station ---------------------------------------------------------------------
  scan() {
    const g = this.g, CG = g.citygen;
    if (!CG?.live) return;
    for (const [id, D] of this.towns) if (CG.live.get(id) !== D.t) this.drop(D); // released, or rebuilt under the same id
    for (const [id, t] of CG.live) if (!this.towns.has(id) && t.T.police && t.rec.kind === 'town') this.adopt(t);
  }
  adopt(t) {
    const g = this.g, T = t.T, B = T.police, A = ARCHETYPES[t.rec.arch] ?? {};
    const nBld = T.buildings.filter((b) => !b.outbuilding).length, tier = tierOf(nBld, T.wealth ?? A.wealth, A.major);
    if (!tier) return null;
    const owner = g.stories?.place?.(t.rec.id)?.owner ?? null, force = forceOf(t.rec.arch, owner);
    const y = t.built?.y0 ?? t.rec.y ?? 0;
    const doorAt = (d) => (d.side === 'N' ? { x: d.at, z: B.z0 - 1.5, h: Math.PI } : d.side === 'S' ? { x: d.at, z: B.z1 + 1.5, h: 0 } : d.side === 'W' ? { x: B.x0 - 1.5, z: d.at, h: -Math.PI / 2 } : { x: B.x1 + 1.5, z: d.at, h: Math.PI / 2 });
    const door = B.doors.find((d) => d.kind === 'door') ?? B.doors[0];
    const front = door ? doorAt(door) : { x: (B.x0 + B.x1) / 2, z: B.z1 + 1.5, h: 0 };
    // The motor pool: a stall out front of each bay (the bay's own apron), then the curb along the front.
    const pool = [];
    for (const d of B.doors.filter((q) => q.kind === 'bay')) { const p = doorAt(d); pool.push({ x: p.x + Math.sin(p.h) * 3.5, z: p.z + Math.cos(p.h) * 3.5, h: p.h }); }
    const SG = new StreetGraph(T), F0 = SG.foot(front.x, front.z);
    const wrecks = (t.built?.wrecks ?? T.wrecks ?? []).map((w) => ({ x: w.x, z: w.z }));
    // (the dead cars in the street are passed a lane wide in driveTo; a crossing a car truly cannot get through is closed
    // then, by the car that tried: SG.blockNode)
    const row = STATION_TIERS[tier.id], need = Math.max(4, row.cars + (tier.heavy ? 1 : 0));
    // Then the station's own curb: nose to tail along the street, a car's width in from the kerb on the station's side,
    // starting past the last bay's stall.
    const Rd = F0 ? SG.roads[F0.i] : null, ax = Rd ? (Rd.axis === 'x' ? 1 : 0) : 1, half = Rd ? (ax ? Rd.z1 - Rd.z0 : Rd.x1 - Rd.x0) / 2 : 4;
    const toward = F0 ? Math.sign(ax ? front.z - F0.z : front.x - F0.x) || 1 : 1, kerb = Math.max(0, half - 1.4) * toward;
    let start = 0; for (const p of pool) start = Math.max(start, (ax ? p.x - (F0?.x ?? front.x) : p.z - (F0?.z ?? front.z)) + 6);
    for (let k = pool.length, j = 0; k < need; k++, j++) { const off = Math.max(8, start) + j * 6.5; pool.push({ x: (F0?.x ?? front.x) + ax * off + (1 - ax) * kerb, z: (F0?.z ?? front.z) + (1 - ax) * off + ax * kerb, h: ax ? Math.PI / 2 : 0 }); }
    const D = { id: t.rec.id, name: t.rec.name ?? T.name, t, T, B, y, tier: tier.id, heavy: tier.heavy, force, forceRow: FORCES[force], owner: owner?.name ?? null, nBld,
      front, pool, SG, wrecks, cx: (T.x0 + T.x1) / 2, cz: (T.z0 + T.z1) / 2,
      fleet: [], officersLeft: row.officers, cells: row.cells, held: 0,
      beats: [], shift: null, holder: `police:${t.rec.id}`, lastHeard: -99 };
    const k = g.pulls?.k ?? g.knowledge; k?.holder?.(D.holder, { name: FORCES[force].dispatcher, kind: 'desk', x: front.x, z: front.z, cap: 60 });
    // The motor pool, parked: the town's cars in their stalls (bays first) and the heavy team's truck; a call takes one
    // of THESE out, and it comes back to the same stall.
    for (let i = 0; i < row.cars + (tier.heavy ? 1 : 0); i++) {
      const truck = i === row.cars, spot = D.pool[i], v = g.vehiclesSys.spawn(truck ? 'breach_truck' : D.forceRow.car.type, spot.x, spot.z, spot.h, truck ? BREACH_TRUCK.paint : D.forceRow.car.paint, { ai: null });
      if (!v) continue;
      v.pol = { town: D.id, spot: i, parked: true, truck }; v.lights = false; v.handbrake = true;
      D.fleet.push(v);
    }
    this.planBeats(D);
    this.towns.set(D.id, D);
    g.emit('policeDesk', { town: D.id, name: D.name, tier: D.tier, heavy: D.heavy, force, buildings: nBld, station: { x: r1(front.x), z: r1(front.z) } });
    return D;
  }
  drop(D) {
    for (const u of [...this.units]) if (u.town === D.id) this.retire(u, true);
    for (const b of [...D.beats]) this.endBeat(D, b, true);
    for (const v of D.fleet) if (!v.dead && v !== this.g.player.inVehicle && this.g.vehicles.includes(v)) { for (const o of [...(v.occ ?? [])]) if (o && o !== this.g.player) this.g.seats.leave(o, true); this.g.vehiclesSys.remove(v); }
    this.cases = this.cases.filter((c) => c.town !== D.id); this.pending = this.pending.filter((r) => r.town !== D.id);
    this.towns.delete(D.id);
  }
  deskAt(x, z, m = 40) { for (const D of this.towns.values()) if (x > D.T.x0 - m && x < D.T.x1 + m && z > D.T.z0 - m && z < D.T.z1 + m) return D; return null; }
  owns(x, z) { return this.enabled && !!this.deskAt(x, z, 60); }
  placeName(D, x, z) {
    const dx = (x - D.cx) / Math.max(1, D.T.x1 - D.T.x0), dz = (z - D.cz) / Math.max(1, D.T.z1 - D.T.z0);
    const w = Math.abs(dx) < 0.18 && Math.abs(dz) < 0.18 ? 'C' : Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : (dz > 0 ? 'S' : 'N');
    return `${PLACE_WORDS[w]} of ${D.name.toLowerCase()}`;
  }

  // ---- the beats (rows: PATROLS; counts: the tier's carBeats/footBeats per shift) -------------------------------------
  planBeats(D) {
    const SG = D.SG, row = STATION_TIERS[D.tier];
    // Car beats: round a block of the town's own grid - the block nearest the centre, `ring` blocks wide, a block
    // wider for each further car - driven clockwise through every crossing on its edge (no U-turns on a beat).
    const xs = [...new Set(SG.roads.filter((r) => r.axis === 'z').map((r) => r.at))].sort((a, b) => a - b);
    const zs = [...new Set(SG.roads.filter((r) => r.axis === 'x').map((r) => r.at))].sort((a, b) => a - b);
    const idx = (L, c) => { let i = 0; for (let k = 0; k < L.length - 1; k++) if (L[k] <= c) i = k; return i; };
    const node = (x, z) => SG.nodes.findIndex((p) => Math.abs(p.x - x) < 1.5 && Math.abs(p.z - z) < 1.5);
    const loops = [], nCar = Math.max(row.carBeats.day, row.carBeats.night), ix = idx(xs, D.cx), iz = idx(zs, D.cz);
    for (let k = 0; k < nCar; k++) {
      const w = PATROLS.car.ring - 1 + k;
      const xa = xs[Math.max(0, ix - w)], xb = xs[Math.min(xs.length - 1, ix + 1 + w)], za = zs[Math.max(0, iz - w)], zb = zs[Math.min(zs.length - 1, iz + 1 + w)];
      const L = [];
      const edge = (pts) => { for (const [x, z] of pts) { const n = node(x, z); if (n >= 0 && !L.some((q) => q.n === n)) L.push({ x: SG.nodes[n].x, z: SG.nodes[n].z, n }); } };
      if (xa !== undefined && xb !== undefined && za !== undefined && zb !== undefined && xa !== xb && za !== zb) {
        edge(xs.filter((x) => x >= xa && x <= xb).map((x) => [x, za]));                 // the north edge, west to east
        edge(zs.filter((z) => z >= za && z <= zb).map((z) => [xb, z]));                 // the east edge, north to south
        edge(xs.filter((x) => x >= xa && x <= xb).reverse().map((x) => [x, zb]));       // the south edge, east to west
        edge(zs.filter((z) => z >= za && z <= zb).reverse().map((z) => [xa, z]));       // the west edge, south to north
      }
      if (L.length < 3) { // no grid block here (an organic town): the crossings nearest the centre, by angle
        const near = SG.nodes.map((p) => ({ x: p.x, z: p.z, a: Math.atan2(p.x - D.cx, p.z - D.cz), d: Math.hypot(p.x - D.cx, p.z - D.cz) })).sort((a, b) => a.d - b.d);
        L.length = 0; for (const p of near.slice(0, Math.max(4, Math.min(8, near.length))).sort((a, b) => a.a - b.a)) L.push({ x: p.x, z: p.z });
      }
      loops.push(L);
    }
    // Foot beats: up and down the main street, centred on the foot of the station's front.
    const M = SG.main, F = SG.foot(D.front.x, D.front.z);
    const nFoot = Math.max(row.footBeats.day, row.footBeats.night), feet = [];
    if (M) for (let k = 0; k < nFoot; k++) {
      const walk = M.axis === 'x' ? { lo: Math.max(M.x0 + 10, (F?.x ?? D.cx) - PATROLS.foot.len), hi: Math.min(M.x1 - 10, (F?.x ?? D.cx) + PATROLS.foot.len) } : { lo: Math.max(M.z0 + 10, (F?.z ?? D.cz) - PATROLS.foot.len), hi: Math.min(M.z1 - 10, (F?.z ?? D.cz) + PATROLS.foot.len) };
      const side = (k % 2 ? -1 : 1) * ((M.z1 - M.z0 > M.x1 - M.x0 ? M.x1 - M.x0 : M.z1 - M.z0) / 2 - 0.8); // the sidewalk, not the lanes
      const a = M.axis === 'x' ? { x: walk.lo, z: M.at + side } : { x: M.at + side, z: walk.lo }, b = M.axis === 'x' ? { x: walk.hi, z: M.at + side } : { x: M.at + side, z: walk.hi };
      feet.push([a, b]);
    }
    D.beatPlan = { loops, feet };
  }
  shiftNow() { const h = this.g.sky?.time ?? 12, [a, b] = PATROLS.shifts.day; return h >= a && h < b ? 'day' : 'night'; }
  stepBeats(D, dt) {
    const g = this.g, row = STATION_TIERS[D.tier], s = this.shiftNow();
    if (D.shift !== s) {
      // Shift change: those out go home; the new shift goes out (from the station: the motor pool, the front door).
      for (const b of D.beats) if (b.state !== 'home') b.state = 'goHome';
      D.shift = s;
      if (this.beatsOn) {
        for (let k = 0; k < row.carBeats[s] && k < D.beatPlan.loops.length; k++) this.startBeat(D, 'car', k);
        for (let k = 0; k < row.footBeats[s] && k < D.beatPlan.feet.length; k++) this.startBeat(D, 'foot', k);
      }
    }
    for (let i = D.beats.length - 1; i >= 0; i--) {
      const b = D.beats[i];
      if (!b.men.some((c) => c.alive)) { this.endBeat(D, b); continue; }
      if (b.unit) continue; // diverted to a call: the unit drives it
      if (b.kind === 'car') this.driveBeat(D, b, dt); else this.walkBeat(D, b, dt);
    }
  }
  startBeat(D, kind, k) {
    const g = this.g;
    if (kind === 'car') {
      const v = this.take(D, 'patrol');
      if (!v) return null;
      const men = this.crew(D, v, 2, RESPONSES.patrol, { beat: true });
      if (!men.length) { this.park(v); return null; }
      const loop = D.beatPlan.loops[k]; let i0 = 0, bd = Infinity; loop.forEach((p, j) => { const d = Math.hypot(p.x - v.x, p.z - v.z); if (d < bd) { bd = d; i0 = j; } });
      const b = { id: `${D.id}:car${k}`, kind, k, v, men, loop, i: i0, i0, state: 'out', visits: [], laps: 0, dwell: 0, route: null, ri: 0, shift: D.shift, at: g.time };
      D.beats.push(b); this.counts.beatsOut++;
      g.emit('beatOut', { town: D.id, beat: b.id, kind, car: v.id, men: men.map((c) => c.id), shift: D.shift, first: { x: r1(b.loop[0].x), z: r1(b.loop[0].z) } });
      return b;
    }
    const [a, bb] = D.beatPlan.feet[k], men = [];
    for (let j = 0; j < 2; j++) { const c = this.officer(D, D.front.x + j * 1.2, D.front.z + 0.6, RESPONSES.patrol, { beat: true }); if (c) men.push(c); }
    if (!men.length) return null;
    const b = { id: `${D.id}:foot${k}`, kind, k, men, ends: [a, bb], i: 0, state: 'out', visits: [], laps: 0, dwell: 0, route: null, ri: 0, shift: D.shift, at: g.time };
    D.beats.push(b); this.counts.beatsOut++;
    g.emit('beatOut', { town: D.id, beat: b.id, kind, men: men.map((c) => c.id), shift: D.shift, first: { x: r1(a.x), z: r1(a.z) } });
    return b;
  }
  endBeat(D, b, silent = false) {
    const i = D.beats.indexOf(b); if (i >= 0) D.beats.splice(i, 1);
    this.stow(b.v ? [b.v] : [], b.men);
    if (!silent) this.g.emit('beatIn', { town: D.id, beat: b.id, laps: b.laps, visits: b.visits.length });
  }
  driveBeat(D, b, dt) {
    const g = this.g, v = b.v;
    if (!v || v.dead || !v.driver) return;
    if (b.state === 'goHome') {
      if (this.driveTo(v, b, D.pool[v.pol.spot], dt, 6, PATROLS.car.cruise)) this.endBeat(D, b);
      return;
    }
    if (b.dwell > 0) { b.dwell -= dt; v.throttle = 0; v.handbrake = true; return; }
    const w = b.loop[b.i % b.loop.length];
    if (this.driveTo(v, b, w, dt, PATROLS.car.corner, PATROLS.car.cruise)) {
      b.visits.push({ i: b.i % b.loop.length, t: r1(g.time) }); if (b.visits.length > 40) b.visits.shift();
      b.i++; if (b.i % b.loop.length === 0) b.laps++;
      b.dwell = PATROLS.car.dwell; b.route = null;
    }
  }
  walkBeat(D, b, dt) {
    const g = this.g;
    const lead = b.men.find((c) => c.alive);
    if (b.state === 'goHome') {
      let home = true;
      for (const c of b.men) if (c.alive && this.walk(c, D.front.x, D.front.z, PATROLS.foot.walk * 1.3, dt) > 2.5) home = false;
      if (home) this.endBeat(D, b);
      return;
    }
    if (b.dwell > 0) { b.dwell -= dt; for (const c of b.men) if (c.alive) { c.hold = 0.3; c.speed = 0; } return; }
    const w = b.ends[b.i % 2];
    let there = true;
    b.men.forEach((c, j) => { if (c.alive && this.walk(c, w.x + j * 1.1, w.z + j * 0.4, PATROLS.foot.walk, dt) > 1.6) there = false; });
    if (there && lead) { b.visits.push({ i: b.i % 2, t: r1(g.time) }); if (b.visits.length > 40) b.visits.shift(); b.i++; if (b.i % 2 === 0) b.laps++; b.dwell = PATROLS.foot.look; }
  }
  // The motor pool's count: cars (not the truck) still running, parked in their stalls, out on the street.
  fleetCount(D, what) { let n = 0; for (const v of D.fleet) if (!v.dead && (what === 'truck' ? v.pol.truck : !v.pol.truck) && (what !== 'parked' || v.pol.parked) && (what !== 'out' || !v.pol.parked)) n++; return n; }
  carsOut(D) { return this.fleetCount(D, 'out'); }

  // ---- people and cars out of the station ---------------------------------------------------------------------------
  officer(D, x, z, R, o = {}) {
    const g = this.g;
    if (D.officersLeft <= 0) return null;
    const rng = rngOf(hash(`${D.id}:${++this.seq}`));
    let r = rng(), weapon = Object.keys(R.weapons)[0];
    for (const [w, p] of Object.entries(R.weapons)) if ((r -= p) <= 0) { weapon = w; break; }
    const F = D.forceRow, colors = outfit(F.look, rng);
    // What they wear shows: the heavy team in helmets and vests (data/police.js RESPONSES.*.worn), a posse in caps.
    if (R.worn?.head === 'riot_helmet') Object.assign(colors, { hatStyle: 'helmet', hat: '#2f3230', gearStyle: 'vest', gear: '#3d4232', accStyle: 'none' });
    else if (R.worn?.head === 'leather_cap') Object.assign(colors, { hatStyle: 'cap', hat: '#4a3a28' });
    const c = g.addChar({ x, z, faction: 'warden', weapon, hp: R.hp, colors, name: F.title.replace(/s$/, '').replace(/^The /, ''), flag: g.randomFlag(rng) });
    if (!c) return null;
    c.hp = c.maxHp = R.hp;
    c.worn = {}; for (const [slot, id] of Object.entries(R.worn ?? {})) if (id) c.worn[slot] = id;
    c.pol = { town: D.id, ...o };
    c.hold = 0.3;
    D.officersLeft--;
    return c;
  }
  // Out of its stall: the first parked car of the kind (the truck for the heavy team), its engine started.
  take(D, rung) {
    const truck = rung === 'heavy';
    for (const v of D.fleet) if (!v.dead && v.pol.parked && v.pol.truck === truck && this.g.vehicles.includes(v) && !v.driver) { v.pol.parked = false; v.pol.rung = rung; v.ai = 'police'; v.lights = true; v.handbrake = false; return v; }
    return null;
  }
  // Back in its stall (the last few metres of a car that drove home); a car left out in the town stays where it stands.
  park(v, force = false) {
    const D = this.towns.get(v.pol?.town), s = D?.pool[v.pol.spot];
    v.ai = null; v.lights = false; v.throttle = 0; v.steer = 0; v.handbrake = true;
    if (!s || (!force && Math.hypot(v.x - s.x, v.z - s.z) > 25)) return false; // the last few metres into the stall are not driven
    v.x = s.x; v.z = s.z; v.h = s.h; v.vx = 0; v.vz = 0; v.av = 0; v.pol.parked = true;
    return true;
  }
  crew(D, v, n, R, o = {}) {
    const g = this.g, men = [];
    for (let m = 0; m < n; m++) {
      const c = this.officer(D, v.x + 1.5, v.z, R, o);
      if (!c) break;
      g.seats.board(c, v, m < (v.seats?.length ?? 2) ? m : -1);
      if (!c.inVehicle) { g.removeChar(c); D.officersLeft++; break; }
      men.push(c);
    }
    return men;
  }
  // In the station: the car parked in its bay and the men inside (nothing is lost; they can be sent again).
  stow(cars, men) {
    const g = this.g, P = g.player;
    for (const v of cars) if (v && !v.dead && v !== P.inVehicle) { for (const o of [...(v.occ ?? [])]) if (o && o !== P) { g.seats.leave(o, true); } this.park(v); }
    for (const c of men) if (c && c.alive && g.chars.includes(c)) { if (c.inVehicle) g.seats.leave(c, true); g.removeChar(c); const D = this.towns.get(c.pol?.town); if (D) D.officersLeft++; }
  }

  // ---- moving: along the town's streets ------------------------------------------------------------------------------
  // Drive v toward goal along the street route held on `o` (o.route/o.ri; planned once, again if goal moves). True when
  // parked within stopAt. The car steers like any AI driver (security.drive's law): slow for corners, stop for people.
  driveTo(v, o, goal, dt, stopAt = 8, cruise = 14, D = null) {
    const g = this.g;
    if (!v.driver || v.dead) return false;
    D ??= this.towns.get(v.pol?.town);
    if (!o.route || o.goalX !== goal.x || o.goalZ !== goal.z) {
      o.route = D ? D.SG.route(v.x, v.z, goal.x, goal.z) : [{ x: goal.x, z: goal.z }]; o.ri = 0; o.goalX = goal.x; o.goalZ = goal.z;
      o.routeLen = routeLen([{ x: v.x, z: v.z }, ...o.route]); o.lastD = undefined; o.lastX = undefined; o.progT = 0; o.sideT = 0; o.rev = 0; o.turnT = 0;
    }
    const R = o.route;
    while (o.ri < R.length - 1 && Math.hypot(R[o.ri].x - v.x, R[o.ri].z - v.z) < 6) o.ri++;
    const tgt = R[o.ri], dEnd = Math.hypot(goal.x - v.x, goal.z - v.z);
    const sp = Math.hypot(v.vx, v.vz);
    if (dEnd < stopAt) { v.steer = 0; v.throttle = sp > 0.8 ? -1 : 0; v.handbrake = sp < 2; return sp < 1.5; }
    // Stuck (a post, a wreck, a wall: the speed can read high while it is pinned, so it is judged by PROGRESS toward the
    // next corner): back off a moment, then go round it a lane to the side, the other side each time.
    let ax = tgt.x, az = tgt.z;
    // Keep right: the aim rides a lane to the right of the street's crown (not on the last stretch to the goal).
    if (o.ri > 0 && dEnd > 20) { const prev = R[o.ri - 1], sx = tgt.x - prev.x, sz = tgt.z - prev.z, L = Math.hypot(sx, sz); if (L > 1) { ax -= (sz / L) * 1.9; az += (sx / L) * 1.9; } }
    if (o.sideT > 0) {
      o.sideT -= dt;
      const prev = R[Math.max(0, o.ri - 1)], sx = tgt.x - prev.x, sz = tgt.z - prev.z, L = Math.hypot(sx, sz) || 1, ux = sx / L, uz = sz / L;
      const along = (v.x - prev.x) * ux + (v.z - prev.z) * uz;
      ax = prev.x + ux * (along + 7) + uz * 3.4 * o.side; az = prev.z + uz * (along + 7) - ux * 3.4 * o.side; // a lane over, a car length on
    }
    // A dead car in the lane ahead: aim a lane past it, on its far side from the line.
    if (D) {
      const lx = ax - v.x, lz = az - v.z, L = Math.hypot(lx, lz) || 1, ux = lx / L, uz = lz / L;
      for (const w of D.wrecks) {
        const wx = w.x - v.x, wz = w.z - v.z; if (Math.abs(wx) > 16 || Math.abs(wz) > 16) continue;
        const along = wx * ux + wz * uz, lat = wx * uz - wz * ux;
        if (along > 0 && along < 15 && Math.abs(lat) < 3.2) { const k = Math.sign(lat || 1) * (3.3 - Math.abs(lat)); ax = v.x + ux * along - uz * k; az = v.z + uz * along + ux * k; break; }
      }
    }
    let want = Math.atan2(ax - v.x, az - v.z), diff = ang(want - v.h);
    // Facing away from where it must go (a call behind it, the next corner back the way it came): a three-point turn -
    // back up on the opposite lock until the nose comes round, then on.
    if (!(o.turnT > 0) && Math.abs(diff) > 2.1 && sp < 5) o.turnT = 3;
    if (o.turnT > 0) {
      o.turnT -= dt;
      if (Math.abs(diff) < 1.1) o.turnT = 0;
      else { v.steer = -Math.sign(diff); v.throttle = sp > 3 && v.throttle > 0 ? -1 : -0.55; v.handbrake = false; o.lastX = undefined; return false; }
    }
    if (o.rev > 0) { o.rev -= dt; v.steer = -Math.sign(diff || 1); v.throttle = -0.85; v.handbrake = false; return false; }
    const dT0 = Math.hypot(tgt.x - v.x, tgt.z - v.z);
    if ((o.progT = (o.progT ?? 0) + dt) > 1.5) {
      const moved = o.lastX === undefined ? 9 : Math.hypot(v.x - o.lastX, v.z - o.lastZ);
      o.lastX = v.x; o.lastZ = v.z;
      if (o.lastD !== undefined && moved < 0.7 && (o.wantSp ?? 0) > 2 && v.throttle > 0) {
        o.rev = 1.1; o.side = -(o.side || -1); o.sideT = 4; o.slowT = 5; o.stucks = (o.stucks ?? 0) + 1;
        // Wedged this close to where it is going (cars parked round the stall, a crowd at the scene): it is there.
        if (o.stucks >= 2 && dEnd < 25) { o.rev = 0; o.sideT = 0; o.stucks = 0; v.throttle = 0; v.handbrake = true; return true; }
        // Twice and no way by: that crossing is closed (for every car of this desk); go round the block.
        if (o.stucks >= 2 && D && tgt.n !== undefined) { D.SG.blockNode(tgt.n); o.route = null; o.stucks = 0; this.g.emit('streetBlocked', { town: D.id, at: { x: r1(tgt.x), z: r1(tgt.z) }, car: v.id }); return false; }
        if (o.stucks > 4 && o.ri < R.length - 1) { o.ri++; o.stucks = 0; }
      }
      o.progT = 0; o.lastD = dT0;
    }
    v.steer = Math.max(-1, Math.min(1, diff * 2.2));
    // Corner ahead: slow to take it.
    const next = R[o.ri + 1], dT = dT0;
    let target = Math.min(cruise, 5 + dEnd * 0.5) * (Math.abs(diff) > 0.6 ? 0.45 : 1);
    if (next && dT < 22) { const turn = Math.abs(ang(Math.atan2(next.x - tgt.x, next.z - tgt.z) - want)); if (turn > 0.6) target = Math.min(target, 6 + dT * 0.35); }
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    for (const c of g.chars) {
      if (!c.alive || c.inVehicle || Math.abs(c.x - v.x) > 14 || Math.abs(c.z - v.z) > 14) continue;
      const ox = c.x - v.x, oz = c.z - v.z, along = ox * fx + oz * fz;
      if (along > 0 && along < 10 && Math.abs(ox * fz - oz * fx) < v.wid * 0.5 + 1.2) target = 0;
    }
    // Another car ahead in the lane: follow one that moves; go a lane round one that stands (a parked car, a wreck that
    // still runs) - never into it.
    for (const q of g.vehicles) {
      if (q === v || Math.abs(q.x - v.x) > 16 || Math.abs(q.z - v.z) > 16) continue;
      const ox = q.x - v.x, oz = q.z - v.z, along = ox * fx + oz * fz, lat = ox * fz - oz * fx;
      if (along <= 0 || along > 12 || Math.abs(lat) > (v.wid + (q.wid ?? 2)) * 0.5 + 0.4) continue;
      if (Math.hypot(q.vx ?? 0, q.vz ?? 0) > 1) target = Math.min(target, Math.max(0, along - 6.5));
      else if (!(o.sideT > 0)) { o.side = lat > 0 ? -1 : 1; o.sideT = 2.5; target = Math.min(target, 5); }
    }
    if (o.slowT > 0) { o.slowT -= dt; target = Math.min(target, 5); } // feeling past what stopped it, not ramming it
    o.wantSp = target;
    v.throttle = sp < target ? 0.85 : sp > target + 1.5 ? -0.7 : 0.1;
    v.handbrake = false;
    this.g.gadgets?.steer?.(v, dt); // a chain in the road: brake or go round
    return false;
  }
  // Walk c toward (x, z) (the foot nav round walls when far); returns the distance left. c.hold keeps the AI's own
  // thinking off them while the desk moves them.
  walk(c, x, z, speed, dt) {
    const d = Math.hypot(x - c.x, z - c.z);
    c.hold = 0.3; c.aiming = false;
    if (d < 0.6) { c.speed = 0; return d; }
    if (d > 12) {
      const o = c.polPath ??= {};
      if (!o.path || o.pathX !== x || o.pathZ !== z || (o.repath = (o.repath ?? 0) - dt) <= 0) { o.path = this.g.footPath(c.x, c.z, x, z) ?? [{ x, z }]; o.pi = 0; o.pathX = x; o.pathZ = z; o.repath = 5; }
      let w = o.path[o.pi];
      while (o.pi < o.path.length - 1 && Math.hypot(w.x - c.x, w.z - c.z) < 1.4) w = o.path[++o.pi];
      this.g.ai.move(c, w.x - c.x, w.z - c.z, speed, dt);
    } else this.g.ai.move(c, x - c.x, z - c.z, speed, dt);
    return d;
  }

  // ---- reports: the only way in --------------------------------------------------------------------------------------
  // o: { town (desk id), channel, x, z (the REPORTED spot), sev, verb, suspect ('player' | null), due (game time it
  //      reaches the desk), witness (the runner: dies before = never told), building (the B the report names), from }
  file(o) {
    const D = this.towns.get(o.town);
    if (!D || !this.enabled) return null;
    const r = { id: `P${++this.seq}`, at: this.g.time, ...o };
    this.pending.push(r); this.counts.reports++;
    this.g.emit('crimeReported', { id: r.id, town: D.id, channel: r.channel, sev: r.sev, verb: r.verb ?? null, dueIn: r1(r.due - this.g.time), at: { x: r1(r.x), z: r1(r.z) }, witness: r.witness?.id ?? null });
    return r;
  }
  deliver() {
    const g = this.g;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const r = this.pending[i];
      if (r.witness && r.channel === 'witness') {
        const c = r.witness;
        if (!c.alive || !g.chars.includes(c)) { this.pending.splice(i, 1); this.counts.silenced++; g.emit('reportSilenced', { id: r.id, town: r.town, witness: c.id }); this.dropRunner(c); continue; }
        if (!r.arrived && g.time < r.at + 3 * (r.due - r.at) + 30) continue; // a runner wedged on the way still gets there, late
      }
      if (r.due > g.time) continue;
      this.pending.splice(i, 1);
      this.toDesk(r);
    }
  }
  toDesk(r) {
    const g = this.g, D = this.towns.get(r.town);
    if (!D) return;
    this.counts.byChannel[r.channel] = (this.counts.byChannel[r.channel] ?? 0) + 1;
    this.lastReport = { id: r.id, channel: r.channel, x: r1(r.x), z: r1(r.z), sev: r.sev, t: r1(g.time), happened: r1(r.at) };
    // The desk's copy: a fact with its source and its spot (the knowledge model, law 6).
    const k = g.pulls?.k ?? g.knowledge;
    if (k?.record) { const f = k.record({ what: 'crime', subject: `case:${D.id}`, text: `${r.verb ?? 'trouble'} at ${this.placeName(D, r.x, r.z)}`, where: { x: r.x, z: r.z }, life: 2 }); k.put?.(D.holder, f, { channel: r.channel, from: r.from ?? r.channel }, r.channel === 'heard' ? 0.5 : 0.9, 1); }
    let C = this.cases.find((c) => c.town === D.id && c.open && Math.hypot(c.x - r.x, c.z - r.z) < CHANNELS.merge.r && g.time - c.t < CHANNELS.merge.secs);
    if (C) {
      C.reports.push(r.id); C.sev = Math.max(C.sev, r.sev); if (r.suspect) C.suspect = r.suspect; if (r.building && !C.building) C.building = r.building;
      if (r.channel !== 'heard') { C.x = r.x; C.z = r.z; } // a firmer spot
    } else {
      C = { id: `K${++this.seq}`, town: D.id, open: true, t: g.time, x: r.x, z: r.z, sev: r.sev, suspect: r.suspect ?? null, building: r.building ?? null, reports: [r.id], channel: r.channel, verb: r.verb ?? null, units: [], lastSeen: null };
      this.cases.push(C); this.counts.cases++;
    }
    g.emit('caseOpen', { id: C.id, town: D.id, sev: C.sev, at: { x: r1(C.x), z: r1(C.z) }, channel: r.channel, reports: C.reports.length });
    this.respond(D, C);
  }
  rungFor(D, sev) { const L = SEVERITY.ladder; return sev >= L.heavy && D.heavy && this.fleetCount(D, 'truck') > 0 ? 'heavy' : sev >= L.posse ? 'posse' : 'patrol'; }
  respond(D, C) {
    const want = this.rungFor(D, C.sev), order = ['patrol', 'posse', 'heavy'];
    const have = C.units.map((id) => this.units.find((u) => u.id === id)).filter((u) => u && u.live);
    if (have.some((u) => order.indexOf(u.rung) >= order.indexOf(want))) return null; // already answered at that rung
    return this.dispatch(D, C, want);
  }
  // Send a rung to case C: out of the motor pool (or the nearest beat car, for a patrol call).
  dispatch(D, C, rung) {
    const g = this.g, R = RESPONSES[rung];
    let u = null;
    if (rung === 'patrol') {
      let best = null, bd = Infinity;
      for (const b of D.beats) if (b.kind === 'car' && !b.unit && b.state === 'out' && b.v && !b.v.dead && b.v.driver) { const d = Math.hypot(b.v.x - C.x, b.v.z - C.z); if (d < bd) { bd = d; best = b; } }
      if (best) { u = this.unit(D, C, rung, [best.v], best.men.slice(), best); best.unit = u.id; }
    }
    if (!u) {
      const cars = [], men = [];
      const nCars = rung === 'heavy' ? 1 : R.cars;
      for (let k = 0; k < nCars; k++) {
        const v = this.take(D, rung); if (!v) break;
        const m = this.crew(D, v, R.men, R, { resp: true });
        if (!m.length) { this.park(v); break; }
        cars.push(v); men.push(...m);
      }
      if (!cars.length) { g.emit('dispatchRefused', { case: C.id, town: D.id, rung, why: D.officersLeft <= 0 ? 'no officers left' : 'no car in the motor pool' }); if (rung !== 'patrol') return this.dispatch(D, C, rung === 'heavy' ? 'posse' : 'patrol'); return null; }
      u = this.unit(D, C, rung, cars, men, null);
    }
    if (rung === 'heavy') { u.men[0] && (u.men[0].pol.shield = true); u.men[1] && (u.men[1].pol.ram = true); }
    this.counts.dispatched++; this.counts.byRung[rung]++;
    const line = this.say('send', D, { unit: u.call, place: this.placeName(D, C.x, C.z), what: C.verb ? `a report of ${C.verb === 'kill' ? 'a killing' : C.verb === 'steal' ? 'a theft' : C.verb === 'rob' ? 'a robbery' : C.verb}` : C.channel === 'heard' ? 'shots heard' : C.channel === 'alarm' ? 'an alarm' : 'a disturbance', code: R.siren ? ', lights and siren' : '' });
    this.air(D, line, C.x, C.z, u);
    g.emit('policeDispatched', { id: u.id, case: C.id, town: D.id, rung, from: { x: r1(u.cars[0].x), z: r1(u.cars[0].z) }, to: { x: r1(C.x), z: r1(C.z) }, cars: u.cars.map((v) => v.id), men: u.men.map((c) => c.id), routeM: Math.round(u.routeLen), diverted: !!u.beat });
    return u;
  }
  unit(D, C, rung, cars, men, beat) {
    const g = this.g, R = RESPONSES[rung];
    const lead = cars[0], park = D.SG.foot(C.x, C.z), goal = park ? { x: park.x, z: park.z } : { x: C.x, z: C.z };
    const n = this.units.filter((u) => u.town === D.id).length + 1;
    const u = { id: `U${++this.seq}`, town: D.id, case: C.id, rung, call: rung === 'heavy' ? D.forceRow.heavyName : `unit ${n}`, cars, men, beat, live: true, mode: 'roll', t0: g.time, goal, siren: R.siren, R,
      route: null, ri: 0, routeLen: 0, arrivedAt: null, searchT: 0, ring: 0, posts: [], stack: null, contact: null, seenAt: -99, from: { x: lead.x, z: lead.z } };
    u.route = D.SG.route(lead.x, lead.z, goal.x, goal.z); u.routeLen = routeLen([{ x: lead.x, z: lead.z }, ...u.route]); u.goalX = goal.x; u.goalZ = goal.z;
    for (const c of men) { c.pol.unit = u.id; }
    C.units.push(u.id);
    this.units.push(u);
    return u;
  }
  say(key, D, o) { return DISPATCH_LINES[key].replace(/\{(\w+)\}/g, (_, w) => (w === 'who' ? D.forceRow.dispatcher : w === 'heavy' ? D.forceRow.heavyName : o[w] ?? '')); }
  // A line on the air, from the station's set: the scanner copies it inside its range (systems/kit.js keyUp).
  air(D, text, x, z, u = null) {
    const g = this.g, k = g.pulls?.k ?? g.knowledge;
    (D.log ??= []).push({ t: r1(g.time), text }); if (D.log.length > 12) D.log.shift();
    g.emit('dispatchLine', { town: D.id, unit: u?.id ?? null, text });
    if (k?.record && g.kit?.keyUp) { const f = k.record({ what: 'chatter', subject: `police:${D.id}`, text, where: { x, z }, life: 1 }); g.kit.keyUp(f, D.front.x, D.front.z, D.forceRow.dispatcher); }
  }

  // ---- the channels ---------------------------------------------------------------------------------------------------
  // Deeds (events 'deed'): its identified witnesses. An officer among them: the radio. A townsperson: they RUN to the
  // station (a runner below) and it reaches the desk when they get there.
  onDeed(e) {
    const g = this.g, rec = g.society?.deeds?.find?.(e.record);
    if (!rec || rec.a !== 'player') return;
    const D = this.deskAt(rec.x, rec.z);
    if (!D) return;
    const victim = rec.o ? g.chars.find((c) => c.id === rec.o) : null;
    let sev = SEVERITY.verb[rec.v] ?? Math.round(VERBS[rec.v] ?? 1);
    if (victim?.pol) sev += SEVERITY.officer;
    if (!(sev > 0) || rec.v === 'trade' || rec.v === 'deliver' || rec.v === 'heal' || rec.v === 'rescue' || rec.v === 'pay' || rec.v === 'defend' || rec.v === 'stunt') return;
    const building = g.citygen?.buildingAt?.(rec.x, rec.z)?.B?.id ?? null;
    const W = (rec.w ?? []).map((id) => g.chars.find((c) => c.id === id)).filter((c) => c && c.alive && c !== victim);
    const cop = W.find((c) => c.pol);
    if (cop) { this.file({ town: D.id, channel: 'patrol', x: rec.x, z: rec.z, sev, verb: rec.v, suspect: 'player', due: g.time + CHANNELS.patrol.radio, building, from: cop.id }); return; }
    // A townsperson who saw it carries it on foot: the nearest to the station goes (one runner a deed).
    let best = null, bd = Infinity;
    for (const c of W) { if (c.telling || c.inVehicle || c.follower || c.npc?.quiet) continue; const d = Math.hypot(c.x - D.front.x, c.z - D.front.z); if (d < bd && d < CHANNELS.witness.maxR) { bd = d; best = c; } }
    if (!best) return;
    this.runFor(D, best, { channel: 'witness', x: rec.x, z: rec.z, sev, verb: rec.v, suspect: 'player', building });
  }
  runFor(D, c, o) {
    const g = this.g, d = Math.hypot(c.x - D.front.x, c.z - D.front.z);
    const r = this.file({ town: D.id, ...o, witness: c, due: g.time + d / CHANNELS.witness.run + CHANNELS.witness.tell, from: c.id });
    if (!r) return null;
    r.arrived = false;
    this.runners.push({ c, r, D, route: null, ri: 0 });
    g.emit('witnessToStation', { id: c.id, town: D.id, dist: Math.round(d), report: r.id });
    return r;
  }
  dropRunner(c) { const i = this.runners.findIndex((q) => q.c === c); if (i >= 0) this.runners.splice(i, 1); }
  stepRunners(dt) {
    const g = this.g;
    for (let i = this.runners.length - 1; i >= 0; i--) {
      const q = this.runners[i], c = q.c, D = q.D;
      if (!c.alive || !g.chars.includes(c) || !this.pending.includes(q.r)) { this.runners.splice(i, 1); continue; }
      // An officer within hail: they flag them down and it goes on the radio from there.
      for (const b of D.beats) for (const m of b.men) if (m.alive && Math.hypot(m.x - c.x, m.z - c.z) < CHANNELS.witness.flag) { q.r.arrived = true; q.r.due = Math.min(q.r.due, g.time + CHANNELS.patrol.radio); q.r.flagged = m.id; }
      if (q.r.arrived) { this.runners.splice(i, 1); continue; }
      c.flee = 0; c.target = null;
      if (this.walk(c, D.front.x, D.front.z, CHANNELS.witness.run, dt) < 3) { q.r.arrived = true; q.r.due = g.time + CHANNELS.witness.tell; this.runners.splice(i, 1); g.emit('witnessAtStation', { id: c.id, town: D.id, report: q.r.id }); }
    }
  }
  // g.noise: shots and blasts the player makes. The station hears them inside stationEar x r; else the nearest townsperson
  // who heard runs it in, and the spot is where THEY think it was (off by fuzz x their distance).
  onNoise(x, z, r, src) {
    const g = this.g;
    if (!this.enabled || src !== g.player || r < CHANNELS.heard.minNoise) return;
    const D = this.deskAt(x, z, r);
    if (!D || g.time - D.lastHeard < 12) return;
    // An officer in earshot: they heard it themselves.
    for (const b of D.beats) for (const m of b.men) if (m.alive && Math.hypot(m.x - x, m.z - z) < r) {
      D.lastHeard = g.time;
      const seen = g.sees(m, g.player) && Math.hypot(m.x - x, m.z - z) < PATROLS.sightR;
      this.file({ town: D.id, channel: 'patrol', x: seen ? x : x + (hash(`${g.time}`) - 0.5) * 20, z: seen ? z : z + (hash(`${g.time}z`) - 0.5) * 20, sev: SEVERITY.shots, verb: 'shots', suspect: seen ? 'player' : null, due: g.time + CHANNELS.patrol.radio, from: m.id });
      return;
    }
    const ds = Math.hypot(D.front.x - x, D.front.z - z);
    if (ds < r * CHANNELS.heard.stationEar) {
      D.lastHeard = g.time;
      const e = ds * CHANNELS.heard.fuzz, a = hash(`${D.id}:${Math.round(g.time)}`) * Math.PI * 2;
      this.file({ town: D.id, channel: 'heard', x: x + Math.cos(a) * e, z: z + Math.sin(a) * e, sev: SEVERITY.shots, verb: 'shots', suspect: null, due: g.time + CHANNELS.heard.tell, from: 'the desk' });
      return;
    }
    let best = null, bd = Infinity;
    for (const c of g.chars) {
      if (!c.alive || c === g.player || c.pol || c.faction === 'zombie' || c.faction === 'player' || c.sleeping || c.inVehicle || c.telling || !(c.fi >= 0)) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < r && d < bd && c.x > D.T.x0 && c.x < D.T.x1 && c.z > D.T.z0 && c.z < D.T.z1) { bd = d; best = c; }
    }
    if (!best) return;
    D.lastHeard = g.time;
    const e = bd * CHANNELS.heard.fuzz, a = hash(`${best.id}`) * Math.PI * 2;
    this.runFor(D, best, { channel: 'heard', x: x + Math.cos(a) * e, z: z + Math.sin(a) * e, sev: SEVERITY.shots, verb: 'shots', suspect: null });
  }
  // A door kicked or glass broken by you at a building whose alarm is wired to the desk.
  onBreakIn(x, z, what) {
    const g = this.g, D = this.deskAt(x, z, 0);
    if (!D) return;
    const R = g.citygen?.buildingAt?.(x, z) ?? this.nearBuilding(D, x, z);
    const B = R?.B ?? R;
    if (!B || !this.alarmed(B)) return;
    if (this.pending.some((p) => p.building === B.id) || this.cases.some((c) => c.open && c.building === B.id)) return;
    const bx = (B.x0 + B.x1) / 2, bz = (B.z0 + B.z1) / 2, d = Math.hypot(bx - D.front.x, bz - D.front.z);
    this.file({ town: D.id, channel: 'alarm', x: bx, z: bz, sev: SEVERITY.alarm, verb: 'a break-in', suspect: null, building: B.id, due: g.time + d / CHANNELS.alarm.wire + CHANNELS.alarm.delay, from: `the ${B.kind.replace(/_/g, ' ')}'s alarm` });
  }
  alarmed(B) { return CHANNELS.alarm.kinds.includes(B.kind) && hash(`alarm:${B.id}`) < CHANNELS.alarm.share + (B.kind === 'police_station' ? 1 : 0); }
  nearBuilding(D, x, z) { let best = null, bd = 4; for (const B of D.T.buildings) { const dx = Math.max(B.x0 - x, 0, x - B.x1), dz = Math.max(B.z0 - z, 0, z - B.z1), d = Math.hypot(dx, dz); if (d < bd) { bd = d; best = B; } } return best; }
  readEvents() {
    const g = this.g, E = g.events;
    let i = E.length;
    while (i > 0 && E[i - 1].seq > this.lastSeq) i--;
    for (; i < E.length; i++) {
      const e = E[i]; this.lastSeq = e.seq;
      if (e.type === 'deed') this.onDeed(e);
      else if ((e.type === 'doorKick' || e.type === 'windowShattered') && e.by === g.player.id) {
        const o = this.g.interiors?.byId?.get(e.type === 'doorKick' ? e.door : e.window);
        if (o) this.onBreakIn(o.x, o.z, e.type);
      }
    }
  }

  // ---- the units on a call --------------------------------------------------------------------------------------------
  stepUnit(u, dt) {
    const g = this.g, P = g.player, D = this.towns.get(u.town), C = this.cases.find((c) => c.id === u.case);
    if (!D) return;
    const men = u.men.filter((c) => c.alive);
    if (!men.length) { this.retire(u); return; }
    const lead = u.cars.find((v) => !v.dead && v.driver) ?? null;
    if (u.mode === 'roll') {
      // Out of the station and along the streets to the REPORTED spot (u.goal, from the case: never P).
      let parked = !lead;
      for (let k = 0; k < u.cars.length; k++) {
        const v = u.cars[k];
        if (v.dead || !v.driver) continue;
        if (g.time - u.t0 < k * 3) { v.throttle = 0; v.handbrake = true; continue; } // the next car pulls out when the first is clear
        const o = v === lead ? u : (v.polRoute ??= {}); if (this.driveTo(v, o, u.goal, dt, 9 + k * 6, u.R.cruise, D)) parked = true;
      }
      if (parked || (lead && Math.hypot(lead.x - u.goal.x, lead.z - u.goal.z) < 9)) {
        for (const v of u.cars) for (const o of [...(v.occ ?? [])]) if (o && o !== P && o.pol) g.seats.leave(o);
        u.mode = u.R.breach && C?.building ? 'stack' : 'search'; u.arrivedAt = g.time; u.siren = false; this.counts.arrived++;
        u.posts = u.R.perimeter ? D.SG.corners(C?.x ?? u.goal.x, C?.z ?? u.goal.z, u.R.perimeter) : [];
        for (const h of this.heard) if (h.unit === u.id && h.arrivedAt === null) h.arrivedAt = g.time;
        this.air(D, this.say('scene', D, { unit: u.call, place: this.placeName(D, u.goal.x, u.goal.z) }), u.goal.x, u.goal.z, u);
        g.emit('policeArrived', { id: u.id, rung: u.rung, town: D.id, secs: r1(g.time - u.t0), routeM: Math.round(u.routeLen), at: { x: r1(lead?.x ?? u.goal.x), z: r1(lead?.z ?? u.goal.z) }, reported: C ? { x: r1(C.x), z: r1(C.z) } : null, player: { x: r1(P.x), z: r1(P.z) } });
      }
      return;
    }
    if (u.mode === 'home') {
      // Back in the cars and to the motor pool; parked, they are in the station.
      for (const v of u.cars) if (!v.dead && !v.driver) {
        const c = men.find((m) => !m.inVehicle && Math.hypot(m.x - v.x, m.z - v.z) < 3.5); if (c) g.seats.board(c, v, 0);
      }
      let all = true;
      for (const c of men) if (!c.inVehicle) { const v = u.cars.find((q) => !q.dead); if (v) { all = false; if (this.walk(c, v.x, v.z, 2.6, dt) < 3.5) g.seats.board(c, v, -1); } else this.walk(c, D.front.x, D.front.z, 2.4, dt); }
      for (const c of men) if (c.inVehicle && !c.inVehicle.driver) g.seats.board(c, c.inVehicle, 0);
      if (!all && u.cars.some((v) => !v.dead)) return;
      let home = true;
      for (const v of u.cars) if (!v.dead && v.driver && !this.driveTo(v, v === u.cars[0] ? u : (v.polRoute ??= {}), D.pool[v.pol.spot], dt, 7, 10, D)) home = false;
      if (home) this.retire(u);
      return;
    }
    // On foot at the scene: does any of them see you? (only their own eyes: g.sees inside their sight)
    const seen = this.spot(u, men, C);
    if (u.mode === 'contact') { this.stepContact(u, men, C, D, dt, seen); return; }
    if (seen && C && (C.suspect === 'player' || this.armed())) { this.contact(u, C, D, seen); return; }
    // Perimeter posts (the block's corners): hold, facing the spot.
    const searchers = [];
    men.forEach((c, j) => { if (j >= men.length - u.posts.length || (u.mode === 'stack' && !(c.pol.shield || c.pol.ram) && j >= 4)) { const p = u.posts[j - (men.length - u.posts.length)]; if (p) { if (this.walk(c, p.x, p.z, 3.2, dt) < 1.5) { c.face = Math.atan2((C?.x ?? u.goal.x) - c.x, (C?.z ?? u.goal.z) - c.z); c.aiming = true; } return; } } searchers.push(c); });
    if (u.mode === 'stack') { this.stepStack(u, searchers, C, D, dt); return; }
    // The search: a party of the searchers (systems/investigate.js) from the reported spot, or from where they last saw
    // you: the spot, brass, anyone who saw, blood, the hiding places, rings outward. It gives up after the response's
    // `search` s without a fresh clue; hard evidence (blood, brass) brings backup (the case's rung goes up).
    u.searchT += dt;
    const cx = C?.lastSeen?.x ?? C?.x ?? u.goal.x, cz = C?.lastSeen?.z ?? C?.z ?? u.goal.z, IVS = g.investigate;
    if (!u.party && IVS && searchers.length) {
      u.party = IVS.start({ members: searchers, x: cx, z: cz, side: D.id, until: u.R.search, r: u.mode === 'inside' ? 10 : undefined, t0: C?.t,
        onBackup: () => { if (C?.open) { C.sev = Math.max(C.sev, SEVERITY.ladder.posse); this.respond(D, C); } } });
    }
    if (u.party && !u.party.done) return;
    if (u.party?.found && C && (C.suspect === 'player' || this.armed())) { u.party = null; return; } // seen: spot() takes it next frame
    u.mode = 'home'; this.counts.cleared++;
    if (C) { C.units = C.units.filter((id) => id !== u.id); if (!C.units.length) C.open = false; }
    this.air(D, this.say('clear', D, { unit: u.call, place: this.placeName(D, cx, cz) }), cx, cz, u);
    g.emit('policeClear', { id: u.id, case: C?.id ?? null, town: D.id, searched: r1(u.searchT), checked: u.party?.qi ?? 0, clues: u.party?.clues?.length ?? 0 });
  }
  armed() { const a = this.g.arms; return !!this.g.player.weapon && a?.stance !== 'holstered'; }
  spot(u, men, C) {
    const g = this.g, P = g.player;
    if (!P.alive) return null;
    const night = g.sky?.night ?? 0, R = PATROLS.sightR * (1 - 0.55 * night);
    for (const c of men) { if (c.inVehicle) continue; const d = Math.hypot(P.x - c.x, P.z - c.z); if (d < R && g.sees(c, P)) { if (C) C.lastSeen = { x: P.x, z: P.z, t: g.time, by: c.id }; u.seenAt = g.time; return c; } }
    return null;
  }
  // The stack at the door: the shield first, the ram behind it; all up, the ram goes in (the door's own lock: interiors
  // kick, the ram's weight in each blow), then they clear the inside.
  stepStack(u, men, C, D, dt) {
    const g = this.g, B = D.T.buildings.find((b) => b.id === C?.building);
    if (!B) { u.mode = 'search'; return; }
    if (!u.stack) {
      const d = B.doors.find((q) => q.kind === 'door') ?? B.doors[0];
      const at = !d ? { x: (B.x0 + B.x1) / 2, z: B.z1 + 1.5, h: 0 } : d.side === 'N' ? { x: d.at, z: B.z0 - 1.6, h: Math.PI } : d.side === 'S' ? { x: d.at, z: B.z1 + 1.6, h: 0 } : d.side === 'W' ? { x: B.x0 - 1.6, z: d.at, h: -Math.PI / 2 } : { x: B.x1 + 1.6, z: d.at, h: Math.PI / 2 };
      u.stack = { ...at, t: 0, blows: 0, open: false, door: null, B: B.id, announced: false };
      const I = g.interiors; let bd = 3.5;
      for (const q of I?.doors ?? []) { const dd = Math.hypot(q.x - at.x, q.z - at.z); if (dd < bd) { bd = dd; u.stack.door = q; } }
    }
    const S = u.stack, nx = Math.sin(S.h), nz = Math.cos(S.h), sx = Math.cos(S.h), sz = -Math.sin(S.h);
    let up = 0;
    men.forEach((c, j) => {
      // In a file along the wall beside the door: the shield at the frame, the ram behind, the rest stacked on.
      // (S is 1.6 m out from the door; the file hugs the wall 0.8 m out, nose to tail, the shield at the frame)
      const k = c.pol.shield ? 0 : c.pol.ram ? 1 : 2 + Math.max(0, j - 2), px = S.x + sx * (1.15 + k * 1.0) - nx * 0.8, pz = S.z + sz * (1.15 + k * 1.0) - nz * 0.8;
      c.pol.slot = c.pol.slot ?? {}; c.pol.slot.x = px; c.pol.slot.z = pz;
      if (this.walk(c, px, pz, 2.6, dt) < 0.7) { up++; c.hold = 0.3; c.speed = 0; c.face = Math.atan2(-sx, -sz); c.crouch = true; }
    });
    S.t += dt;
    // Every man in the file up before the ram swings (or 25 s and they go with who is there), then a breath to settle.
    if (up < men.length && S.t < 25) { S.ready = 0; return; }
    if ((S.ready = (S.ready ?? 0) + dt) < 1.5) return;
    if (!S.announced) { S.announced = true; this.air(D, this.say('stack', D, {}), S.x, S.z, u); g.emit('policeStack', { id: u.id, building: B.id, kind: B.kind, at: { x: r1(S.x), z: r1(S.z) }, men: men.length, shield: men.some((c) => c.pol.shield), ram: men.some((c) => c.pol.ram) }); }
    if (!S.open) {
      const ram = men.find((c) => c.pol.ram) ?? men[0], door = S.door;
      if ((S.blowT = (S.blowT ?? 0) - dt) > 0) return;
      S.blowT = 1.1; S.blows++;
      // The breaking-in verb: the timed-actions lane's when it is in (g.actions.breakIn), else the door's own kick, the
      // ram's weight landing two blows' worth each swing.
      let done = false;
      if (door && g.actions?.breakIn) done = !!g.actions.breakIn(ram, door, { tool: 'ram' })?.open;
      else if (door && g.interiors?.kick) { ram.kickAt = -9; const r = g.interiors.kick(door, ram); if (r?.kicked && door.locked) { ram.kickAt = -9; g.interiors.kick(door, ram); } done = !door.locked; }
      else done = S.blows >= 3;
      g.noise?.(S.x, S.z, 30, ram);
      if (done || S.blows > 8) { for (const c of men) c.crouch = false; S.open = true; this.counts.breaches++; g.emit('policeBreach', { id: u.id, building: B.id, blows: S.blows, door: door?.id ?? null }); u.mode = 'inside'; u.searchT = 0; u.party = null; if (C) { C.x = (B.x0 + B.x1) / 2; C.z = (B.z0 + B.z1) / 2; } }
    }
  }
  contact(u, C, D, by) {
    const g = this.g;
    u.mode = 'contact'; this.counts.contacts++;
    if (u.party && !u.party.done) g.investigate?.stop(u.party, 'contact'); u.party = null;
    u.contact = { t: 0, still: 0, offer: D.forceRow.arrest && C.sev <= 2, hp0: u.men.map((c) => c.hp) };
    this.air(D, this.say('contact', D, { unit: u.call, place: this.placeName(D, g.player.x, g.player.z) }), g.player.x, g.player.z, u);
    g.emit('policeContact', { id: u.id, case: C.id, by: by.id, offer: u.contact.offer, at: { x: r1(g.player.x), z: r1(g.player.z) } });
    if (u.contact.offer) g.hud?.toast?.('HANDS UP · HOLSTER AND STAND STILL', 'warn');
    else this.fight(u);
  }
  fight(u) { for (const c of u.men) if (c.alive) { c.crouch = false; c.hold = 0; c.target = this.g.player; c.grudge = this.g.player; c.state = 'fight'; } if (u.contact) u.contact.offer = false; }
  stepContact(u, men, C, D, dt, seen) {
    const g = this.g, P = g.player, K = u.contact;
    K.t += dt;
    if (!P.alive) { u.mode = 'home'; return; }
    if (!K.offer) {
      // Fighting: while they see you; lose you for 12 s and they search where they last saw you (the case's lastSeen).
      if (!seen && g.time - u.seenAt > 12) { u.mode = 'search'; u.searchT = 0; u.party = null; for (const c of men) { c.target = null; c.state = 'idle'; } }
      return;
    }
    for (let i = 0; i < u.men.length; i++) { const c = u.men[i]; if (K.hp0[i] > 0 && (c.hp < K.hp0[i] - 0.5 || !c.alive) && c.lastAttacker === P) { this.fight(u); return; } }
    let nd = Infinity;
    for (const c of men) { const d = Math.hypot(P.x - c.x, P.z - c.z); nd = Math.min(nd, d); c.face = Math.atan2(P.x - c.x, P.z - c.z); c.aiming = true; if (d > 3.5) this.walk(c, P.x, P.z, d > 12 ? 4.2 : 2.2, dt); else { c.hold = 0.3; c.speed = 0; } }
    if (nd > 40 || K.t > 30) { this.fight(u); return; }
    const still = !P.inVehicle && (P.speed ?? 0) < 0.5 && g.arms?.stance === 'holstered';
    if (nd < 5.5 && still) { K.still += dt; if (K.still > 1.5) this.surrender(u, C, D); } else K.still = 0;
  }
  // Taken in: a fine if you can pay, else THIS station's cell (its tier's cells) for the hours.
  surrender(u, C, D) {
    const g = this.g, P = g.player, F = D.forceRow, fine = F.fine * C.sev;
    let out;
    if (g.cash >= fine) { g.cash -= fine; this.counts.fined++; out = { outcome: 'fined', fine }; g.hud?.toast?.(`FINED $${fine}`, 'warn'); }
    else {
      const hours = F.jail * C.sev, B = D.B;
      if (P.inVehicle) g.exitVehicle(true);
      P.x = (B.x0 + B.x1) / 2; P.z = (B.z0 + B.z1) / 2; g.sky.time = (g.sky.time + hours) % 24; D.held++;
      this.counts.jailed++; out = { outcome: 'jailed', hours, cell: D.id };
      g.hud?.toast?.(`${hours} HOURS IN THE ${D.name} CELLS`, 'warn');
    }
    C.open = false; u.mode = 'home';
    g.emit('policeArrest', { id: u.id, case: C.id, town: D.id, ...out });
    return out;
  }
  retire(u, silent = false) {
    u.live = false;
    if (u.party && !u.party.done) this.g.investigate?.stop(u.party, 'unit in');
    const i = this.units.indexOf(u); if (i >= 0) this.units.splice(i, 1);
    const D = this.towns.get(u.town);
    if (u.beat && D) {
      const b = D.beats.find((x) => x.id === u.beat.id);
      if (b) { b.unit = null; b.route = null; b.men = b.men.filter((c) => c.alive); for (const c of b.men) if (!c.inVehicle && b.v && !b.v.dead) this.g.seats.board(c, b.v, -1); return; }
    }
    this.stow(u.cars, u.men);
    for (const c of u.men) if (!c.alive && D) { /* the dead stay where they fell: the roster is short one */ }
    if (!silent) this.g.emit('unitIn', { id: u.id, town: u.town });
  }

  // ---- the siren: heard through the shared falloff, with its direction ---------------------------------------------
  listen(dt) {
    const g = this.g, P = g.player, A = g.audio;
    if ((this.sirenT -= dt) > 0) return;
    this.sirenT = 0.25;
    this.wailT -= 0.25;
    let loud = null, lg = 0;
    for (const u of this.units) {
      if (!u.siren || u.mode !== 'roll') continue;
      const v = u.cars.find((q) => !q.dead); if (!v) continue;
      const dx = v.x - P.x, dz = v.z - P.z, d = Math.hypot(dx, dz), sp = spatial(d, SIREN.range, false);
      if (sp.gain < SIREN.audible) continue;
      const deg = bearingOf(dx, dz);
      if (!this.heard.some((h) => h.unit === u.id)) {
        const h = { unit: u.id, rung: u.rung, at: r1(g.time), d: Math.round(d), bearing: Math.round(deg), compass: compassOf(deg), gain: +sp.gain.toFixed(3), arrivedAt: null, carAt: { x: r1(v.x), z: r1(v.z) }, you: { x: r1(P.x), z: r1(P.z) } };
        this.heard.push(h); if (this.heard.length > 16) this.heard.shift();
        g.emit('sirenHeard', { unit: u.id, rung: u.rung, d: h.d, bearing: h.bearing, compass: h.compass, gain: h.gain });
      }
      if (sp.gain > lg) { lg = sp.gain; loud = { u, v, dx, deg, gain: sp.gain }; }
    }
    this.loudest = loud ? { unit: loud.u.id, compass: compassOf(loud.deg), bearing: Math.round(loud.deg), gain: +loud.gain.toFixed(3) } : null;
    if (loud && this.wailT <= 0) {
      this.wailT = SIREN.wail;
      g.hud?.subtitle?.(`SIRENS · TO THE ${compassOf(loud.deg).toUpperCase()}`, 2);
      if (A?.ctx) { const vol = Math.min(0.22, 0.3 * loud.gain), pan = Math.max(-1, Math.min(1, loud.dx / 60)); A.tone(620, SIREN.wail * 0.5, vol, 'sawtooth', 1.45, pan); setTimeout(() => A.tone(900, SIREN.wail * 0.5, vol, 'sawtooth', 0.69, pan), SIREN.wail * 500); A.count?.('policeSiren'); }
    }
  }

  // ---- the loop ---------------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g;
    if ((this.scanT -= dt) <= 0) { this.scanT = 1; this.scan(); }
    if (!this.towns.size) { this.lastSeq = g.events.length ? g.events[g.events.length - 1].seq : this.lastSeq; return; }
    if (this.enabled) { this.readEvents(); this.stepRunners(dt); this.deliver(); }
    else this.lastSeq = g.events.length ? g.events[g.events.length - 1].seq : this.lastSeq;
    for (const D of this.towns.values()) if (this.beatsOn || D.beats.length) this.stepBeats(D, dt);
    for (let i = this.units.length - 1; i >= 0; i--) { const u = this.units[i]; if (u.live) this.stepUnit(u, dt); }
    this.listen(dt);
  }

  // The lights (red and blue only), the shield and the ram, into the gadgets' parts and glow meshes (no new draw calls).
  draw(gx) {
    const g = this.g, P = g.player, t = g.time, L = SIREN.lights, on = Math.sin(t * Math.PI * 2 * L.hz) > 0;
    const bar = (v, flashing) => {
      if (Math.abs(v.x - P.x) > 160 || Math.abs(v.z - P.z) > 160 || v.dead) return;
      const y = (v.y ?? 0) + (v.tall ?? 1.8) + 0.02;
      gx.put(v.x, y, v.z, v.h, -0.32, 0, 0.1, 0.5, 0.14, 0.26, flashing ? (on ? L.a : '#3a0e0a') : '#5a1e18');
      gx.put(v.x, y, v.z, v.h, 0.32, 0, 0.1, 0.5, 0.14, 0.26, flashing ? (on ? '#0e1a3a' : L.b) : '#1a2a5a');
      if (flashing) { // the bar throws red one side and blue the other, swapping at the flash rate
        const cx = Math.cos(v.h), cz = -Math.sin(v.h), k = on ? 1 : -1;
        gx.shine?.(v.x + cx * 1.6 * k, v.z + cz * 1.6 * k, L.glow, L.a, 0.1 + (v.y ?? 0));
        gx.shine?.(v.x - cx * 1.6 * k, v.z - cz * 1.6 * k, L.glow * 0.8, L.b, 0.1 + (v.y ?? 0));
      }
    };
    for (const D of this.towns.values()) {
      // The station's blue lamp over the front door.
      if (Math.abs(D.front.x - P.x) < 160 && Math.abs(D.front.z - P.z) < 160) { gx.put(D.front.x, D.y, D.front.z, D.front.h, 0, 3.4, -0.6, 0.35, 0.35, 0.35, L.b); if ((g.sky?.night ?? 0) > 0.4) gx.shine?.(D.front.x, D.front.z, 4, L.b, D.y + 0.1); }
      for (const b of D.beats) if (b.v && !b.unit) bar(b.v, false);
    }
    for (const u of this.units) {
      for (const v of u.cars) bar(v, u.mode === 'roll' || u.mode === 'contact' || u.mode === 'stack');
      for (const c of u.men) {
        if (!c.alive || c.inVehicle || Math.abs(c.x - P.x) > 120 || Math.abs(c.z - P.z) > 120) continue;
        // The shield: a slab carried before him (a pale rim and a viewport band read from the camera above); the ram: a
        // black steel bar with two grips, carried at the hip.
        if (c.pol?.shield) { const y = (c.gy ?? 0) + (c.crouch ? -0.3 : 0); gx.put(c.x, y, c.z, c.face, 0, 1.0, 0.62, 0.9, 1.3, 0.12, '#202325'); gx.put(c.x, y, c.z, c.face, 0, 1.68, 0.56, 0.96, 0.08, 0.32, '#e6e0ca'); gx.put(c.x, y, c.z, c.face, 0, 1.3, 0.69, 0.5, 0.14, 0.03, '#7d8f96'); }
        if (c.pol?.ram) { const y = (c.gy ?? 0) + (c.crouch ? -0.3 : 0); gx.put(c.x, y, c.z, c.face, 0.3, 1.82, 0.3, 0.24, 0.24, 1.2, '#1c1e20'); gx.put(c.x, y, c.z, c.face, 0.3, 1.82, 0.95, 0.32, 0.32, 0.16, '#d2a21c'); gx.put(c.x, y, c.z, c.face, 0.3, 1.97, 0.0, 0.3, 0.08, 0.08, '#8a8478'); gx.put(c.x, y, c.z, c.face, 0.3, 1.97, 0.5, 0.3, 0.08, 0.08, '#8a8478'); } // the ram up at the shoulder, ready to swing
      }
    }
  }

  // ---- views (the `police` command) -----------------------------------------------------------------------------------
  stationView(D) {
    const row = STATION_TIERS[D.tier];
    return { town: D.id, name: D.name, tier: D.tier, tierName: row.name, buildings: D.nBld, force: D.force, title: D.forceRow.title, owner: D.owner, heavy: D.heavy,
      station: { x: r1(D.front.x), z: r1(D.front.z), building: D.B.id, bays: D.B.doors.filter((d) => d.kind === 'bay').length },
      motorPool: { cars: row.cars, carsLeft: this.fleetCount(D, 'car'), parked: this.fleetCount(D, 'parked'), out: this.carsOut(D), truck: D.heavy ? 1 : 0, truckLeft: this.fleetCount(D, 'truck'), fleet: D.fleet.map((v) => ({ id: v.id, type: v.type, parked: v.pol.parked, dead: !!v.dead })), spots: D.pool.map((p) => ({ x: r1(p.x), z: r1(p.z) })) },
      armory: { officers: row.officers, left: D.officersLeft, draws: Object.fromEntries(Object.entries(RESPONSES).map(([k, r]) => [k, r.weapons])) },
      cells: { n: D.cells, held: D.held }, desk: { dispatcher: D.forceRow.dispatcher, log: (D.log ?? []).slice(-6) },
      streets: { roads: D.SG.roads.length, crossings: D.SG.nodes.length } };
  }
  beatView(D, b) {
    const v = b.v, lead = v ?? b.men.find((c) => c.alive);
    return { id: b.id, town: D.id, kind: b.kind, state: b.unit ? 'on a call' : b.state, shift: b.shift, car: v ? { id: v.id, x: r1(v.x), z: r1(v.z) } : null, men: b.men.filter((c) => c.alive).map((c) => ({ id: c.id, flag: c.flag, weapon: c.weapon, x: r1(c.x), z: r1(c.z) })),
      route: (b.loop ?? b.ends).map((p) => ({ x: r1(p.x), z: r1(p.z) })), next: b.loop ? b.i % b.loop.length : b.i % 2, laps: b.laps, visits: b.visits.slice(-12), at: lead ? { x: r1(lead.x), z: r1(lead.z) } : null };
  }
  unitView(u) {
    const P = this.g.player, lead = u.cars.find((v) => !v.dead);
    return { id: u.id, town: u.town, case: u.case, rung: u.rung, call: u.call, mode: u.mode, siren: u.siren, diverted: !!u.beat, secs: r1(this.g.time - u.t0), routeM: Math.round(u.routeLen), arrivedAfter: u.arrivedAt !== null ? r1(u.arrivedAt - u.t0) : null,
      goal: { x: r1(u.goal.x), z: r1(u.goal.z) }, from: { x: r1(u.from.x), z: r1(u.from.z) }, car: lead ? { id: lead.id, type: lead.type, x: r1(lead.x), z: r1(lead.z), d: r1(Math.hypot(lead.x - P.x, lead.z - P.z)) } : null,
      men: u.men.map((c) => ({ id: c.id, alive: c.alive, flag: c.flag, weapon: c.weapon, worn: c.worn, shield: !!c.pol?.shield, ram: !!c.pol?.ram, inVehicle: !!c.inVehicle, x: r1(c.x), z: r1(c.z) })),
      posts: u.posts.map((p) => ({ x: r1(p.x), z: r1(p.z) })), stack: u.stack && { x: r1(u.stack.x), z: r1(u.stack.z), open: u.stack.open, blows: u.stack.blows, building: u.stack.B } };
  }
  caseView(C) { return { id: C.id, town: C.town, open: C.open, sev: C.sev, channel: C.channel, verb: C.verb, at: { x: r1(C.x), z: r1(C.z) }, suspect: C.suspect, building: C.building, reports: C.reports.length, units: C.units, lastSeen: C.lastSeen && { x: r1(C.lastSeen.x), z: r1(C.lastSeen.z), t: r1(C.lastSeen.t) }, age: r1(this.g.time - C.t) }; }
  view() {
    return { enabled: this.enabled, beatsOn: this.beatsOn, shift: this.shiftNow(), stations: [...this.towns.values()].map((D) => this.stationView(D)),
      cases: this.cases.slice(-10).map((C) => this.caseView(C)), pending: this.pending.map((r) => ({ id: r.id, town: r.town, channel: r.channel, sev: r.sev, dueIn: r1(r.due - this.g.time), witness: r.witness?.id ?? null, running: !!r.witness && !r.arrived })),
      units: this.units.map((u) => this.unitView(u)), heard: this.heard.slice(-6), loudest: this.loudest ?? null, lastReport: this.lastReport, counts: JSON.parse(JSON.stringify(this.counts)) };
  }
  // The agents' reset (the police command's clear, the selftest between checks): everyone back in the station at once,
  // every running car back in its stall.
  clear() {
    for (const u of [...this.units]) this.retire(u, true);
    for (const D of this.towns.values()) { for (const b of [...D.beats]) this.endBeat(D, b, true); D.shift = null; for (const v of D.fleet) if (!v.dead && this.g.vehicles.includes(v) && v !== this.g.player.inVehicle) { for (const o of [...(v.occ ?? [])]) if (o && o !== this.g.player) this.g.seats.leave(o, true); this.park(v, true); } }
    this.cases.length = 0; this.pending.length = 0; this.runners.length = 0; this.heard.length = 0;
  }
}
