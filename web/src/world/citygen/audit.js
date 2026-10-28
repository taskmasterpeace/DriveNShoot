// THE WALKABILITY AUDIT (docs/design/WEB_CITYGEN.md §8): a built town walked on its own colliders and decks, headless.
// It moves the way a person moves: a 0.4 m circle on a 0.5 m grid, its height from the storeys law at every step (a
// flight lifts it, a floor holds it only once it is up near it), the boxes that count at that height (the street: anything
// that starts below 2.5 m; upstairs: what spans your own floor - engine/collision.js resolveBody), a step of at most
// STEP m. From the street in front of each building's front door it must reach EVERY floor (and the roof when the kind has
// roof access); from the street in front of each roll-up bay a CAR (a 1.1 m circle) must reach the bay lane inside, and
// through the far bay when the building is a drive-through.
import { recHeight, doorXZ } from './build.js';

const STEP = 0.95, H = 0.5, R_FOOT = 0.4, R_CAR = 1.1;

export class TownProbe {
  constructor(built) {
    this.boxes = built.boxes; this.recs = built.recs;
    this.cell = 4; this.grid = new Map(); this.rgrid = new Map();
    for (const b of this.boxes) this.ins(this.grid, b, b);
    for (const S of this.recs) this.ins(this.rgrid, S.b, S);
    this.mark = 1;
  }
  ins(G, r, v) {
    const c = this.cell;
    for (let x = Math.floor(r.minX / c); x <= Math.floor(r.maxX / c); x++) for (let z = Math.floor(r.minZ / c); z <= Math.floor(r.maxZ / c); z++) {
      const k = x * 73856093 ^ z * 19349663; let L = G.get(k); if (!L) G.set(k, (L = [])); L.push(v);
    }
  }
  recAt(x, z) {
    const L = this.rgrid.get(Math.floor(x / this.cell) * 73856093 ^ Math.floor(z / this.cell) * 19349663);
    if (!L) return null;
    for (const S of L) { const b = S.b; if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return S; }
    return null;
  }
  heightAt(x, z, y) { const S = this.recAt(x, z); return S ? recHeight(S, x, z, y) : 0; }
  blocked(x, z, y, r) {
    const c = this.cell, up = y > 0.5;
    for (let gx = Math.floor((x - r) / c); gx <= Math.floor((x + r) / c); gx++) for (let gz = Math.floor((z - r) / c); gz <= Math.floor((z + r) / c); gz++) {
      const L = this.grid.get(gx * 73856093 ^ gz * 19349663);
      if (!L) continue;
      for (const b of L) {
        if (up ? !(b.height > y + 0.25 && b.base < y + 2.4) : !(b.base < 2.5)) continue;
        const qx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x, qz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
        if ((x - qx) ** 2 + (z - qz) ** 2 < r * r - 1e-6) return true;
      }
    }
    return false;
  }
  // Flood from (sx, sz) on the street within rect W = { x0, z0, x1, z1 }. Returns the reached states [x, z, y].
  flood(sx, sz, W, r = R_FOOT, maxStates = 120000) {
    const nx = Math.ceil((W.x1 - W.x0) / H) + 1, nz = Math.ceil((W.z1 - W.z0) / H) + 1;
    const seen = new Map(), out = [], Q = [];
    const key = (i, j, y) => (i * nz + j) * 64 + Math.max(0, Math.min(63, Math.round(y * 2)));
    const si = Math.round((sx - W.x0) / H), sj = Math.round((sz - W.z0) / H);
    const x0 = W.x0 + si * H, z0 = W.z0 + sj * H;
    if (this.blocked(x0, z0, 0, r)) return { states: out, startBlocked: true };
    Q.push(si, sj, 0); seen.set(key(si, sj, 0), 1);
    let q = 0;
    while (q < Q.length && out.length < maxStates) {
      const i = Q[q++], j = Q[q++], y = Q[q++];
      const x = W.x0 + i * H, z = W.z0 + j * H;
      out.push([x, z, y]);
      for (let d = 0; d < 4; d++) {
        const ii = i + (d === 0 ? 1 : d === 1 ? -1 : 0), jj = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const xx = W.x0 + ii * H, zz = W.z0 + jj * H, yy = r > 0.6 ? 0 : this.heightAt(xx, zz, y);
        if (Math.abs(yy - y) > STEP) continue;
        const k = key(ii, jj, yy);
        if (seen.has(k)) continue;
        seen.set(k, 1);
        if (this.blocked(xx, zz, yy, r)) continue;
        Q.push(ii, jj, yy);
      }
    }
    return { states: out, startBlocked: false };
  }
}

const outside = (B, side, at, dist) => (side === 'N' ? [at, B.z0 - dist] : side === 'S' ? [at, B.z1 + dist] : side === 'W' ? [B.x0 - dist, at] : [B.x1 + dist, at]);

// One building: { id, kind, storeys, floors: [{ y, reached }], roof, ok, bays: [{ in, through }] }
export function auditBuilding(P, R) {
  const B = R.B, m = 8;
  const W = { x0: B.x0 - m, z0: B.z0 - m, x1: B.x1 + m, z1: B.z1 + m };
  // grow the window over the escape and any bridge landing on it
  if (R.E) { const e = R.E.b; W.x0 = Math.min(W.x0, e.minX - 2); W.x1 = Math.max(W.x1, e.maxX + 2); W.z0 = Math.min(W.z0, e.minZ - 2); W.z1 = Math.max(W.z1, e.maxZ + 2); }
  const res = { id: B.id, kind: B.kind, storeys: B.n, levels: R.S ? R.S.n : 0, roofAccess: !!(R.S && R.S.n === B.n), floors: [], ok: true, bays: [], why: [] };
  const door = B.doors.find((d) => d.kind === 'door') ?? B.doors[0];
  if (!door) { res.ok = false; res.why.push('no door'); return res; }
  const [sx, sz] = outside(B, door.side, door.at, 1.6);
  const F = P.flood(sx, sz, W, R_FOOT);
  if (F.startBlocked) { res.ok = false; res.why.push('front step blocked'); return res; }
  const inB = (x, z) => x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1;
  const levels = R.S ? R.S.Y : [0];
  for (let k = 0; k < levels.length; k++) {
    const y = levels[k], got = F.states.some(([x, z, yy]) => inB(x, z) && Math.abs(yy - y) < 0.3);
    res.floors.push({ k, y: +y.toFixed(2), reached: got });
    if (!got) { res.ok = false; res.why.push(`floor ${k} (${y.toFixed(1)} m) not reached`); }
  }
  // bays: a car's circle from 4 m out (the middle of the narrowest street) reaches 3 m inside; a drive-through reaches the far side's outside
  for (const d of B.doors) {
    if (d.kind !== 'bay') continue;
    const [bx, bz] = outside(B, d.side, d.at, 4);
    const [ix, iz] = outside(B, d.side, d.at, -3.5);
    const C = P.flood(bx, bz, { x0: B.x0 - 12, z0: B.z0 - 12, x1: B.x1 + 12, z1: B.z1 + 12 }, R_CAR, 40000);
    const near = (x, z) => C.states.some(([a, c]) => Math.abs(a - x) <= 0.5 && Math.abs(c - z) <= 0.5);
    const opp = { N: 'S', S: 'N', E: 'W', W: 'E' }[d.side];
    const far = B.doors.find((o) => o.kind === 'bay' && o.side === opp && Math.abs(o.at - d.at) < 0.5);
    const [fx, fz] = far ? outside(B, opp, far.at, 3) : [0, 0];
    const bay = { side: d.side, at: d.at, in: !C.startBlocked && near(ix, iz), through: far ? near(fx, fz) : null };
    res.bays.push(bay);
    if (!bay.in) { res.ok = false; res.why.push(`bay ${d.side}@${d.at} not drivable in`); }
    if (far && !bay.through) { res.ok = false; res.why.push(`bay ${d.side}@${d.at} not drivable through`); }
  }
  return res;
}

// The town: every storeyed building, every drive-in (cap: `limit` of each, nearest the centre first when capped).
export function auditTown(built, T, limit = Infinity) {
  const P = new TownProbe(built);
  const pick = built.blds.filter((R) => R.S || R.B.drive).sort((a, b) => Math.hypot((a.B.x0 + a.B.x1) / 2 - T.cx, (a.B.z0 + a.B.z1) / 2 - T.cz) - Math.hypot((b.B.x0 + b.B.x1) / 2 - T.cx, (b.B.z0 + b.B.z1) / 2 - T.cz)).slice(0, limit);
  const res = pick.map((R) => auditBuilding(P, R));
  const bad = res.filter((r) => !r.ok);
  return { town: T.id, arch: T.arch, audited: res.length, storeyed: res.filter((r) => r.levels).length, driveIns: res.filter((r) => r.bays.length).length, floors: res.reduce((a, r) => a + r.floors.length, 0), bad: bad.map((r) => `${r.id}(${r.kind}): ${r.why.join('; ')}`), ok: !bad.length };
}
