// THE RING RISES - STOREYS v2 (docs/design/WEB_STOREYS.md §9; rows in data/storeys.js RING_RISE, DANGER). The Phoenix ring
// was one storey everywhere; now a share of its lots stand two to six storeys tall, by zone: the DOWNTOWN belt of hotels,
// offices and apartment blocks round the walled island (4-6), the Strip (2-3), the dead houses (2), the Burn's adobe
// shells (2-3, roofs and top floors open to the sky). Industrial yards stay one tall storey.
//
// Pure part (no three.js, no game): riseBlock(ring, b) is called by world/ring.js makeBlock once a block's lots are laid.
// A lot that rises is turned into an EMPTY lot carrying `rise` (its building's row): the ring never builds its one-storey
// shell, its scatter keeps off it (ring.solid), and the generated-town builder makes it (world/citygen/build.js: a stair
// core to every floor and up to the roof, a parapet, fire escapes, plank bridges between facing roofs, per-floor loot).
// Every roll is the lot's own (its seed): nothing the ring rolled before moves, and the same lot rises the same way every
// time it is laid out.
//
// Live part (RingRise, a system): a ring chunk going HOT (world/streamer.js ringOn) has its risers built as one generated
// "town" registered with systems/citygen.js stampRing (collision tier, the one instanced mesh, the storeys law, doors and
// windows, loot per floor) and dressed by world/facades.js; going cold releases it. The building is the same whichever
// chunk you come from (the chunk that holds its centre owns it). Upstairs is more dangerous: infected on the upper floors
// and a rifleman on a tall roof (DANGER).
import { RING } from '../data/ring.js';
import { RING_RISE, MAX_ABOVE, DANGER } from '../data/storeys.js';
import { hash32, rngOf, C } from './geo.js';
import { makeBuilding, roofBridges } from './citygen/layout.js';
import { buildTown } from './citygen/build.js';
import { makeRng } from '../engine/rng.js';

const SIDES = ['N', 'E', 'S', 'W'];
const r1 = (v) => Math.round(v * 10) / 10;
const ESC = 2.8 + 0.3; // a fire escape's depth off its wall (two 1.4 m bands) and the clearance it keeps to the lot's line

// The downtown belt: a block whose centre is within RING_RISE.belt of the island's edge (Chebyshev).
export function inBelt(b) { return Math.max(Math.abs(b.cx), Math.abs(b.cz)) - RING.island <= RING_RISE.belt; }

// The rise row of lot L in block b, or null. { kind (a generated kind), n (storeys incl. the street's), ruined, x0..z1 (the
// footprint: wall centre lines), front, color, roof, zone, escape (odds), bridges (share), downtown }
export function riseOf(b, L) {
  if (L.empty || L.authored || !b.city) return null;
  const down = inBelt(b) && (b.zone === 'strip' || b.zone === 'residential');
  const R = down ? RING_RISE.downtown : RING_RISE[b.zone];
  if (!R) return null;
  const kind = R.kinds[L.kind];
  if (!kind) return null;
  const rng = rngOf(hash32(L.seed >>> 0, 0x52495345)); // 'RISE': the lot's own stream
  if (rng() >= R.share) return null;
  const n = Math.min(MAX_ABOVE + 1, rng.int(R.storeys[0], R.storeys[1]));
  let x0 = L.x0, z0 = L.z0, x1 = L.x1, z1 = L.z1;
  if (down && R.grow) {
    // A floor plate inside the lot: wider along the street (clear of the side yards' escapes), deeper toward the back.
    const G = R.grow, l = L.lot, ns = L.front === 'N' || L.front === 'S';
    const a0 = ns ? l.x0 : l.z0, a1 = ns ? l.x1 : l.z1, ca = ns ? (L.x0 + L.x1) / 2 : (L.z0 + L.z1) / 2;
    const w = Math.min(G.w, a1 - a0 - 2 * G.side);
    if (w >= 10) {
      const ac = Math.min(a1 - G.side - w / 2, Math.max(a0 + G.side + w / 2, ca));
      let f, d;
      if (L.front === 'N') { f = L.z0; d = Math.min(G.d, l.z1 - G.back - f); z0 = f; z1 = f + d; }
      else if (L.front === 'S') { f = L.z1; d = Math.min(G.d, f - (l.z0 + G.back)); z1 = f; z0 = f - d; }
      else if (L.front === 'W') { f = L.x0; d = Math.min(G.d, l.x1 - G.back - f); x0 = f; x1 = f + d; }
      else { f = L.x1; d = Math.min(G.d, f - (l.x0 + G.back)); x1 = f; x0 = f - d; }
      if (ns) { x0 = ac - w / 2; x1 = ac + w / 2; } else { z0 = ac - w / 2; z1 = ac + w / 2; }
      if (d < 10) { x0 = L.x0; z0 = L.z0; x1 = L.x1; z1 = L.z1; }
    }
  }
  const Z = b.Z;
  return {
    id: `${L.id}.rise`, lot: L.id, kind, n, ruined: !!R.ruined && rng() < R.ruined, front: L.front, zone: down ? 'downtown' : b.zone, downtown: down,
    x0: r1(x0), z0: r1(z0), x1: r1(x1), z1: r1(z1), area: { ...L.lot }, seed: hash32(L.seed >>> 0, 0x544f5752) >>> 0,
    color: Z.walls[Math.floor(rng() * Z.walls.length)], roof: Z.roofs[Math.floor(rng() * Z.roofs.length)], escape: R.escape ?? 0, bridges: R.bridges ?? 0,
  };
}

// world/ring.js makeBlock: the block's rising lots become empty lots that carry their building's row.
export function riseBlock(b) {
  if (!b.city) return;
  for (let i = 0; i < b.lots.length; i++) {
    const L = b.lots[i], row = riseOf(b, L);
    if (!row) continue;
    b.lots[i] = { empty: true, id: L.id, lot: L.lot, rise: row, blockKey: L.blockKey };
  }
}

// The risers whose centre is in chunk (cx, cz): the rows, in id order (the same set every time).
export function risersIn(ring, cx, cz) {
  const out = [], ox = cx * C, oz = cz * C;
  if (!ring.touches(cx, cz)) return out;
  ring.blocksOver(ox - 40, oz - 40, ox + C + 40, oz + C + 40, (b) => {
    for (const L of b.lots) {
      const R = L.rise;
      if (!R) continue;
      const mx = (R.x0 + R.x1) / 2, mz = (R.z0 + R.z1) / 2;
      if (mx >= ox && mx < ox + C && mz >= oz && mz < oz + C && !out.includes(R)) out.push(R);
    }
  });
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

// A chunk's risers as a generated-town plan (world/citygen/layout.js shape) for buildTown: the buildings, the roof bridges
// between facing roofs, then each tall one's fire escape on a side wall the lot has room for (never under a bridge).
export function chunkTown(ring, cx, cz) {
  const rows = risersIn(ring, cx, cz);
  if (!rows.length) return null;
  const id = `ring:${cx},${cz}`, seed = hash32(ring.seed, cx + 9000, cz + 9000, 0x52495345) >>> 0;
  const T = { id, name: 'PHOENIX', arch: 'ring', biome: 'desert_sonoran', seed, cx: (cx + 0.5) * C, cz: (cz + 0.5) * C, size: C,
    x0: cx * C, z0: cz * C, x1: (cx + 1) * C, z1: (cz + 1) * C, damage: 0.4, wealth: 0.3, roads: [], blocks: [], buildings: [], bridges: [], wall: null, gates: [], wrecks: [], lamps: [],
    alleys: [], yards: [], docks: [], backProps: [], ring: true };
  const byB = new Map();
  for (const R of rows) {
    const rng = makeRng(R.seed);
    const B = makeBuilding(rng, R.kind, R.x0, R.z0, R.x1, R.z1, R.front, { storeys: R.n, ruined: R.ruined, color: R.color, roofColor: R.roof, id: R.id, zone: R.zone });
    B.escape = null; B.ringRow = R;
    T.buildings.push(B); byB.set(B, R);
  }
  // Roof bridges: the pairs a row allows (both rows' share), one per roof.
  const brng = makeRng(seed ^ 0x42524447);
  const share = Math.max(0, ...rows.map((R) => R.bridges));
  if (share > 0) T.bridges = roofBridges(brng, T.buildings, id, share).filter((br) => byB.get(br.from).bridges > 0 && byB.get(br.to).bridges > 0);
  const bridged = new Map(); // building -> sides a bridge lands on
  for (const br of T.bridges) {
    const fs = br.axis === 'x' ? 'E' : 'S', ts = br.axis === 'x' ? 'W' : 'N';
    (bridged.get(br.from) ?? bridged.set(br.from, new Set()).get(br.from)).add(fs);
    (bridged.get(br.to) ?? bridged.set(br.to, new Set()).get(br.to)).add(ts);
  }
  // Fire escapes: 3+ storeys, a side wall (never the front), the lot's own side yard deep enough, no bridge on that side.
  for (const B of T.buildings) {
    const R = byB.get(B);
    if (B.n < 3 || !R.escape) continue;
    const rng = makeRng(R.seed ^ 0x45534350);
    if (rng() >= R.escape) continue;
    const fi = SIDES.indexOf(B.front), cand = rng() < 0.5 ? [SIDES[(fi + 1) % 4], SIDES[(fi + 3) % 4]] : [SIDES[(fi + 3) % 4], SIDES[(fi + 1) % 4]];
    const l = R.area, o = 0.2; // the wall's outer face is 0.2 m out from its centre line
    for (const s of cand) {
      if (bridged.get(B)?.has(s)) continue;
      const room = s === 'W' ? B.x0 - o - l.x0 : s === 'E' ? l.x1 - (B.x1 + o) : s === 'N' ? B.z0 - o - l.z0 : l.z1 - (B.z1 + o);
      if (room >= ESC) { B.escape = { side: s }; break; }
    }
  }
  return T;
}

// ---- the live system ------------------------------------------------------------------------------------------------
export class RingRise {
  constructor(g) {
    this.g = g;
    this.enabled = true;
    this.live = new Map(); // chunk key -> { T, rec, built, chars }
    this.counts = { built: 0, released: 0, buildings: 0, sniper: 0, infected: 0, ms: 0 };
  }
  get ring() { return this.g.streamer?.W?.ring ?? null; }

  // world/streamer.js ringOn / ringOff
  chunkOn(L) {
    if (!this.enabled || !this.g.citygen || this.live.has(L.key)) return;
    const ring = this.ring;
    if (!ring) return;
    const t0 = performance.now();
    const T = chunkTown(ring, L.cx, L.cz);
    if (!T) return;
    const built = buildTown(T);
    const rec = { id: T.id, kind: 'ringrise', ringrise: true, name: 'PHOENIX', x: T.cx, z: T.cz, half: C / 2 + 40, seed: T.seed, state: 'holding', infestation: 0, y: 0, pinned: true };
    this.g.facades?.addTown(T.id, T, built); // first: its roof clutter and lean-to posts join the colliders
    const t = this.g.citygen.stampRing(rec, T, built);
    const entry = { key: L.key, T, rec, built, t, chars: [] };
    this.live.set(L.key, entry);
    this.populate(entry);
    this.counts.built++; this.counts.buildings += T.buildings.length; this.counts.ms = +(performance.now() - t0).toFixed(1);
  }
  chunkOff(L) {
    const e = this.live.get(L.key);
    if (!e) return;
    for (const c of e.chars) if (this.g.chars.includes(c) && c !== this.g.player) this.g.removeChar(c);
    e.chars.length = 0;
    this.g.facades?.remove(e.T.id);
    this.g.citygen?.releaseRing(e.rec.id);
    this.live.delete(L.key);
    this.counts.released++;
  }
  clear() { for (const k of [...this.live.keys()]) this.chunkOff({ key: k }); }
  // Once a second: the chunks whose people waited for free slots get them.
  update(dt) {
    if ((this.popT = (this.popT ?? 0) - dt) > 0) return;
    this.popT = 1;
    for (const e of this.live.values()) if (e.pending) this.populate(e);
  }

  // Upstairs is more dangerous (data/storeys.js DANGER): infected on the floors above the street (more the higher you
  // go), a rifleman on a tall roof behind the parapet. Rolled from each building's own seed, once per build; never into
  // the slots the street needs (DANGER.reserve).
  populate(e) {
    const g = this.g, D = DANGER;
    let n = e.chars.length;
    e.pending = false;
    for (const R of e.built.blds) {
      const S = R.S, B = R.B;
      if (!S || !B.ringRow || B.peopled) continue;
      // no slots to spare now (a crowded street): this building waits for update() to try again
      if ((g.freeSlots?.length ?? 0) <= D.reserve) { e.pending = true; continue; }
      B.peopled = true;
      const rng = makeRng(B.ringRow.seed ^ 0x44414e47);
      const free = () => (g.freeSlots?.length ?? 0) > D.reserve && n < D.cap;
      // the roof: a rifleman (a roof you can stand on: the stair reached it)
      if (B.n >= D.sniper.minStoreys && S.n === B.n && !B.ruined && rng() < D.sniper.share && free()) {
        const p = this.roofSpot(B, S, rng);
        const c = g.addChar({ x: p.x, z: p.z, faction: D.sniper.faction, weapon: D.sniper.weapon, hp: D.sniper.hp, name: 'Rooftop Rifleman', perch: true, perchY: S.Y[S.n], flag: g.randomFlag?.(Math.random) ?? 'US' });
        if (c) { c.x = p.x; c.z = p.z; c.gy = S.Y[S.n]; c.storey = S; c.ringRise = e.rec.id; c.face = p.face; e.chars.push(c); n++; this.counts.sniper++; B.sniper = c.id; }
      }
      // the floors above the street
      for (let k = 1; k < Math.min(S.n + 1, B.n); k++) {
        const odds = Math.min(0.9, D.infected.base + D.infected.perFloor * k);
        for (let i = 0; i < D.infected.max; i++) {
          if (rng() >= odds || !free()) continue;
          const p = this.floorSpot(B, S, rng, k);
          const c = g.zombies?.spawn(p.x, p.z, rng() < 0.15);
          if (!c) continue;
          c.x = p.x; c.z = p.z; c.gy = S.Y[k]; c.storey = S; c.ringRise = e.rec.id; c.home = { x: p.x, z: p.z };
          e.chars.push(c); n++; this.counts.infected++;
        }
      }
    }
  }
  // A spot on a floor clear of the stair core's footprint and a metre in from the walls.
  floorSpot(B, S, rng, k = -1) {
    const A = S.area, sol = k >= 0 ? B.floorSolids?.[k] : null; // that floor's partitions and furniture (world/citygen/rooms.js)
    for (let i = 0; i < 16; i++) {
      const x = B.x0 + 1.4 + rng() * (B.x1 - B.x0 - 2.8), z = B.z0 + 1.4 + rng() * (B.z1 - B.z0 - 2.8);
      if (A && x > A.minX - 1.2 && x < A.maxX + 1.2 && z > A.minZ - 1.2 && z < A.maxZ + 1.2) continue;
      if (sol && sol.some((b) => x + 0.5 > b.minX && x - 0.5 < b.maxX && z + 0.5 > b.minZ && z - 0.5 < b.maxZ)) continue;
      return { x, z };
    }
    return { x: (B.x0 + B.x1) / 2, z: (B.z0 + B.z1) / 2 };
  }
  // The rifleman's place: behind the parapet on the street side, facing the street.
  roofSpot(B, S, rng) {
    if (B.nest) { const f = B.front; return { x: B.nest.x, z: B.nest.z, face: f === 'N' ? Math.PI : f === 'S' ? 0 : f === 'W' ? -Math.PI / 2 : Math.PI / 2 }; } // the facade kit's sandbag nest
    const f = B.front, t = 0.25 + rng() * 0.5, ins = 1.0;
    const x = f === 'W' ? B.x0 + ins : f === 'E' ? B.x1 - ins : B.x0 + 1.5 + t * (B.x1 - B.x0 - 3);
    const z = f === 'N' ? B.z0 + ins : f === 'S' ? B.z1 - ins : B.z0 + 1.5 + t * (B.z1 - B.z0 - 3);
    const A = S.area, clash = A && x > A.minX - 1 && x < A.maxX + 1 && z > A.minZ - 1 && z < A.maxZ + 1;
    const face = f === 'N' ? Math.PI : f === 'S' ? 0 : f === 'W' ? -Math.PI / 2 : Math.PI / 2;
    if (clash) return { x: (B.x0 + B.x1) / 2, z: f === 'N' ? B.z0 + ins : f === 'S' ? B.z1 - ins : (B.z0 + B.z1) / 2, face };
    return { x, z, face };
  }

  // ---- for agents ---------------------------------------------------------------------------------------------------
  // Every live riser (or those within radius of x, z): its building, storeys, floors, roof access, escape, bridges.
  view(x, z, radius = Infinity) {
    const out = [];
    for (const e of this.live.values()) for (const R of e.built.blds) {
      const B = R.B, mx = (B.x0 + B.x1) / 2, mz = (B.z0 + B.z1) / 2;
      if (x !== undefined && Math.hypot(mx - x, mz - z) > radius) continue;
      out.push({ id: B.id, chunk: e.key, kind: B.kind, zone: B.zone, storeys: B.n, x: r1(mx), z: r1(mz), x0: B.x0, z0: B.z0, x1: B.x1, z1: B.z1, front: B.front, ruined: B.ruined,
        floors: R.S ? R.S.Y.map((y) => r1(y)) : [0], roof: !!(R.S && R.S.n === B.n), escape: R.E ? { side: B.escape?.side ?? null, landings: R.E.Y.map((y) => r1(y)) } : null,
        bridges: e.built.bridges.filter((q) => q.br.from === B || q.br.to === B).map((q) => q.br.id), sniper: B.sniper ?? null });
    }
    return out;
  }
  bridges() {
    const out = [];
    for (const e of this.live.values()) for (const q of e.built.bridges) { const br = q.br; out.push({ id: br.id, axis: br.axis, x0: br.x0, z0: br.z0, x1: br.x1, z1: br.z1, from: br.from.id, to: br.to.id, yFrom: br.yFrom, yTo: br.yTo, S: q.S }); }
    return out;
  }
  record(id) { for (const e of this.live.values()) for (const R of e.built.blds) if (R.B.id === id) return { e, R }; return null; }
  status() { return { enabled: this.enabled, live: this.live.size, buildings: [...this.live.values()].reduce((s, e) => s + e.built.blds.length, 0), counts: this.counts }; }
}
