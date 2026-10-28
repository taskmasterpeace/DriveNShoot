// THE BACK LOTS AT RUNTIME (docs/design/WEB_BACK_LOTS.md §3): what a generated town's alleys and yards do once they stand.
//   gates     a yard's gates (world/citygen/backlots-build.js out.gates) hang as real leaves from the interiors pool while
//             you are near (kick, pick, pry; a locked one blocks the nav grid), a share of them locked by LOCKS[class].gate
//   locks     backLock(B, rec): the share of a building's back doors locked, by its class x the town's state (citygen.openings)
//   fences    E at a fence panel: hold to CLIMB it (slow, its climbNoise heard), tap to KICK it (a picket or board panel
//             breaks after its kicks, loud; chain-link and adobe do not give)
//   pathing   navOverlay: the live towns' ground colliders go into the foot and car nav windows (engine/nav.js overlay), so
//             people route round buildings, through doors and gates, and down the alleys
// One instance: main.js constructs it after citygen; update(dt) every frame (cheap: a scan every 0.5 s), interact() in the
// E chain after the interiors and citygen's bays.
import { FENCES, GATES, LOCKS, KIND_CLASS } from '../data/backlots.js';
import { WINDOW } from '../data/interiors.js';

const h01 = (s) => { let v = 2166136261; for (let i = 0; i < s.length; i++) { v ^= s.charCodeAt(i); v = Math.imul(v, 16777619); } return (v >>> 0) / 4294967296; };
const CLIMB_VAULT = 0.7; // s: the drop over the top once you have hauled yourself up

export class BackLots {
  constructor(g) {
    this.g = g;
    this.scanT = 0; this.hold = 0; this.holdOn = null; this.kickAt = -9;
    this.ring = { x: 0, z: 0, len: 2 };
    this.W = { id: '', x: 0, z: 0, ux: 0, uz: 0, nx: 0, nz: 0, half: 1 }; // the fence as interiors.startVault wants a window
    this.counts = { climbs: 0, kicks: 0, broken: 0, gatesHung: 0 };
    this.liveKey = '';
    this.hung = new Map(); // interiors ring id -> its town's id (a released town gives its gates back)
    const cg = g.citygen;
    if (g.nav) for (const k of ['foot', 'car']) g.nav[k].overlay = (grid) => this.navOverlay(grid);
    void cg;
  }

  // The share of a building's back doors (and dock doors) locked: its class x the town's state.
  backLock(B, rec) {
    const L = LOCKS[KIND_CLASS[B.kind] ?? 'home'] ?? LOCKS.home;
    return L[rec.state] ?? L.holding;
  }
  gateLock(B, rec) {
    if (rec.state === 'overrun') return 0;
    return (LOCKS[KIND_CLASS[B?.kind] ?? 'home'] ?? LOCKS.home).gate;
  }

  update(dt) {
    const CG = this.g.citygen;
    if (!CG) return;
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = 0.5;
    // a town built or released: the nav windows take its colliders on (or off) at their next query
    let key = ''; for (const id of CG.live.keys()) key += id + ';';
    if (key !== this.liveKey) { this.liveKey = key; this.dirtyNav(); this.dropGone(); }
    const P = this.g.player;
    this.hang(P.inVehicle ? P.inVehicle.x : P.x, P.inVehicle ? P.inVehicle.z : P.z);
  }
  // A town released (or removed): its gates' leaves go back to the pool.
  dropGone() {
    const I = this.g.interiors, CG = this.g.citygen;
    for (const [id, town] of this.hung) if (!CG.live.has(town)) { if (I.ringOpen.has(id)) I.detachRing(id); this.hung.delete(id); }
  }
  dirtyNav() { const n = this.g.nav; if (n) { n.foot.dirty = true; n.car.dirty = true; } }

  // Yards' gates near (x, z) hang as interiors leaves; far ones give theirs back.
  hang(px, pz, near = GATES.near) {
    const I = this.g.interiors, CG = this.g.citygen;
    if (!I?.attachRing) return;
    for (const t of CG.live.values()) {
      const B = t.built;
      if (!B.gates.length) continue;
      B.yardOpen ??= new Map();
      for (const y of t.T.yards ?? []) {
        const id = `bl:${y.id}`, gs = B.gatesBy?.get(y.id) ?? (B.gatesBy ??= this.groupGates(B)).get(y.id);
        if (!gs) continue;
        const g0 = gs[0], d = Math.hypot(g0.x - px, g0.z - pz);
        const open = B.yardOpen.get(y.id);
        if (open && (!I.ringOpen.has(id) || d > near + 25)) { if (I.ringOpen.has(id)) I.detachRing(id); B.yardOpen.delete(y.id); this.hung.delete(id); continue; }
        if (open || d > near) continue;
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const q of gs) { x0 = Math.min(x0, q.x - 1); x1 = Math.max(x1, q.x + 1); z0 = Math.min(z0, q.z - 1); z1 = Math.max(z1, q.z + 1); }
        I.attachRing(id, { x0, z0, x1, z1, ruined: false, y: B.y0 || undefined }, { doors: gs.map((q) => ({ x: q.x, z: q.z, w: q.w, nx: q.nx, nz: q.nz, kind: 'gate' })), innerDoors: [], windows: [] });
        B.yardOpen.set(y.id, true); this.hung.set(id, t.rec.id);
        this.counts.gatesHung += gs.length;
        const rec = I.ringOpen.get(id), H = t.T.buildings.find((q) => q.id === y.b), odds = this.gateLock(H, t.rec);
        if (rec) for (const door of rec.doors) { door.gate = true; door.yard = y.id; if (h01(door.id) < odds) I.setLocked(door, true); }
      }
    }
  }
  groupGates(B) { const m = new Map(); for (const q of B.gates) (m.get(q.yard) ?? m.set(q.yard, []).get(q.yard)).push(q); return m; }

  // ---- fences: climb, kick -------------------------------------------------------------------------------------------
  // The fence panel within reach of p (cg grid boxes carry .fence), nearest first; null when none.
  fenceNear(p, reach = 1.15) {
    const G = this.g.statics.cg;
    if (!G || !G.n) return null;
    let best = null, bd = reach;
    for (let gx = Math.floor((p.x - 2) / 8); gx <= Math.floor((p.x + 2) / 8); gx++) for (let gz = Math.floor((p.z - 2) / 8); gz <= Math.floor((p.z + 2) / 8); gz++) {
      const L = G.cell(gx, gz);
      for (let i = 0; i < L.length; i++) {
        const b = L[i], f = b.fence;
        if (!f || f.broken) continue;
        const qx = p.x < b.minX ? b.minX : p.x > b.maxX ? b.maxX : p.x, qz = p.z < b.minZ ? b.minZ : p.z > b.maxZ ? b.maxZ : p.z;
        const d = Math.hypot(p.x - qx, p.z - qz);
        if (d < bd) { bd = d; best = f; }
      }
    }
    return best;
  }

  // The far side of a fence panel from p: where a climb drops you (null when something stands there).
  over(f, p) {
    const b = f.box, W = this.W, horiz = f.horiz;
    W.id = f.id; W.x = (b.minX + b.maxX) / 2; W.z = (b.minZ + b.maxZ) / 2;
    W.ux = horiz ? 1 : 0; W.uz = horiz ? 0 : 1; W.nx = horiz ? 0 : 1; W.nz = horiz ? 1 : 0;
    W.half = (horiz ? b.maxX - b.minX : b.maxZ - b.minZ) / 2;
    const side = (p.x - W.x) * W.nx + (p.z - W.z) * W.nz >= 0 ? 1 : -1;
    const r = p.radius ?? 0.4, along = Math.max(-W.half + r, Math.min(W.half - r, (p.x - W.x) * W.ux + (p.z - W.z) * W.uz)), out = 0.25 + r + 0.3;
    const tx = W.x + W.ux * along - W.nx * side * out, tz = W.z + W.uz * along - W.nz * side * out;
    return this.g.statics.pointBlocked(tx, tz, r * 0.9) ? null : side;
  }

  // Climb now (the agent verb and the held key both end here): the noise, the drop.
  climb(f, p) {
    const side = this.over(f, p);
    if (side === null) return false;
    const F = FENCES[f.fence];
    this.g.noise(p.x, p.z, F.climbNoise, p);
    this.g.interiors.startVault(p, this.W, side, CLIMB_VAULT);
    this.counts.climbs++;
    this.g.emit?.('fenceClimbed', { fence: f.id, kind: f.fence, by: p.id });
    return true;
  }
  // One kick: a breakable panel loses one of its kicks and goes at none; a wall or chain-link only rings.
  kick(f, by) {
    const g = this.g, F = FENCES[f.fence], b = f.box, x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2;
    if (g.time < this.kickAt) return { kicked: false };
    this.kickAt = g.time + 0.55;
    g.audio.thud?.(g.pan(x));
    this.counts.kicks++;
    if (!F.kicks) { g.noise(x, z, 10, by); return { kicked: true, gives: false }; }
    g.noise(x, z, F.breakNoise * 0.6, by);
    if (--f.kicks > 0) return { kicked: true, gives: true, kicksLeft: f.kicks };
    this.breakFence(f, by);
    return { kicked: true, gives: true, broken: true };
  }
  breakFence(f, by) {
    const g = this.g, F = FENCES[f.fence], b = f.box, x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2;
    f.broken = true; f.kicks = 0;
    b.base = 99; // nothing left standing to meet (collision, sight, the nav grid skip a box this high)
    const t = g.citygen.live.get(f.town);
    if (t) { for (const i of f.items) { const it = t.built.items[i]; if (it?.idx !== undefined) g.citygen.place(it.idx, false); } g.citygen.mesh.instanceMatrix.needsUpdate = true; }
    g.noise(x, z, F.breakNoise, by);
    g.fx?.dust?.(x, z, 3);
    this.counts.broken++;
    this.dirtyNav();
    g.emit?.('fenceBroken', { fence: f.id, kind: f.fence, by: by?.id ?? null });
  }

  // E at a fence panel (main.js, after the interiors' doors/windows and citygen's bays): hold to climb, tap to kick.
  interact(p, I, dt) {
    if (p.inVehicle || p.vault || (p.storey && (p.gy ?? 0) > 1)) { this.hold = 0; return null; }
    const f = this.fenceNear(p);
    if (!f) { this.hold = 0; this.holdOn = null; return null; }
    if (this.holdOn !== f) { this.hold = 0; this.holdOn = f; }
    const g = this.g, F = FENCES[f.fence], down = I.key('KeyE'), b = f.box;
    const R = this.ring; R.x = Math.max(b.minX, Math.min(b.maxX, p.x)); R.z = Math.max(b.minZ, Math.min(b.maxZ, p.z)); R.len = 2;
    const kickWord = F.kicks ? 'tap <kbd>E</kbd> Kick it down (loud)' : `the ${F.name} won't give to a boot`;
    if (down && this.hold >= 0) {
      this.hold += dt;
      const k = (this.hold - WINDOW.holdTap) / F.climb;
      if (k >= 1) { this.hold = -1; if (!this.climb(f, p)) g.hud.prompt('No room to drop down on the far side'); return R; }
      g.hud.prompt(k > 0 ? `Climbing the ${F.name}… ${Math.round(Math.min(1, k) * 100)}%` : `Hold <kbd>E</kbd> Climb the ${F.name} · ${kickWord}`);
      return R;
    }
    if (!down && this.hold > 0 && this.hold < WINDOW.holdTap) this.kick(f, p);
    if (!down) this.hold = 0;
    g.hud.prompt(`Hold <kbd>E</kbd> Climb the ${F.name} · ${kickWord}`);
    return R;
  }

  // ---- pathing: the live towns in the nav window (engine/nav.js rebuild calls this on its window) ------------------
  navOverlay(grid) {
    const CG = this.g.citygen;
    if (!CG?.live.size) return;
    const n = grid.n, ox = grid.ox, oz = grid.oz, Wd = grid.W, B = grid.blocked, c = grid.cell;
    for (const t of CG.live.values()) {
      const T = t.T;
      if (T.x1 + 40 < ox || T.x0 - 40 > ox + Wd || T.z1 + 40 < oz || T.z0 - 40 > oz + Wd) continue;
      grid.rasterise(t.built.boxes, B, n, ox, oz);
      // doorways and gateways stay open (a 1.4 m gap can fall between two cell centres once the walls are grown)
      const carve = (x, z, w, nx, nz) => {
        if (grid.radius > 1) return; // a car does not go through a man door
        const ax = nz !== 0, hw = w / 2 - 0.2;
        for (let s = -hw; s <= hw + 1e-6; s += c * 0.5) for (const a of [-0.8, 0, 0.8]) {
          const x2 = ax ? x + s : x + a, z2 = ax ? z + a : z + s;
          const i = Math.floor((x2 - ox) / c), j = Math.floor((z2 - oz) / c);
          if (i > 0 && j > 0 && i < n - 1 && j < n - 1 && B[j * n + i] === 1) B[j * n + i] = 0;
        }
      };
      for (const d of t.built.doors) if (d.kind === 'door') carve(d.x, d.z, d.w, d.side === 'E' || d.side === 'W' ? 1 : 0, d.side === 'N' || d.side === 'S' ? 1 : 0);
      for (const q of t.built.gates) carve(q.x, q.z, q.w, q.nx, q.nz);
    }
  }

  view() {
    const CG = this.g.citygen; let alleys = 0, yards = 0, gates = 0, fences = 0, broken = 0, docks = 0;
    for (const t of CG?.live.values() ?? []) { alleys += t.T.alleys?.length ?? 0; yards += t.T.yards?.length ?? 0; docks += t.T.docks?.length ?? 0; gates += t.built.gates.length; fences += t.built.fences.length; broken += t.built.fences.filter((f) => f.broken).length; }
    return { alleys, yards, docks, gates, fences, broken, counts: this.counts };
  }
}
