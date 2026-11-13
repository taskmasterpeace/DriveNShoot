// OUT OF AN UPPER WINDOW (docs/design/WEB_WINDOW_EXIT.md; rows data/interiors.js WINDOW_EXIT; the fall is the ladders'
// rule, data/actions.js LADDER.fall). Upstairs, at a window opening in an outside wall: hold E to climb out, hang from
// the sill and drop to the street. You land hurt if it is high, and down for a moment. A sprinter in its burst that
// reaches the same window jumps after you; the herd and the Echoes cannot (they come round by the stairs, or lose you).
//   find(p)             the opening you face: { x, z, nx, nz, drop, land: { x, z, y } } | { blocked } | null
//   interact(p, I, dt)  main.js E chain (upstairs only): the prompt, the hold, the drop. Returns truthy when it has E
//   update(dt)          the sprinters that follow
//   view()              the `windowExit` command
import { RAY_SOLID, RAY_SIGHT } from '../engine/collision.js';
import { WINDOW_EXIT as WX } from '../data/interiors.js';
import { LADDER } from '../data/actions.js';

const r1 = (v) => Math.round(v * 10) / 10;

export class WindowExit {
  constructor(g) {
    this.g = g;
    this.hold = 0;
    this.last = null; // the last way out: { x, z, nx, nz, land, S, y, t } (who may follow, for WX.follow.secs)
    this.found = { x: 0, z: 0, nx: 0, nz: 0, drop: 0, blocked: null, land: { x: 0, z: 0, y: 0 } };
    this.counts = { exits: 0, hurt: 0, followed: 0, refused: 0 };
  }

  // The window opening p faces from inside, upstairs: a wall that stops a body where sight passes (a hole in it), on an
  // OUTSIDE wall (past it there is no floor of this building), with ground to land on below.
  find(p) {
    const g = this.g, S = p.storey;
    if (!S || p.inVehicle || p.ug) return null;
    const y0 = S.y0 ?? 0, up = (p.gy ?? 0) - y0;
    if (up < WX.minUp) return null;
    // The outside wall you face: the building's own edge on that side, within reach. (A wall's box spans the storeys with
    // its window holes, so the wall is found from the building's footprint, and the hole by a line at chest height.)
    const a = p.face ?? 0, dx = Math.sin(a), dz = Math.cos(a), ST = g.statics, chest = up + 1.3, B = S.b;
    const nx = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0, nz = nx ? 0 : Math.sign(dz);
    const e = nx > 0 ? B.maxX - p.x : nx < 0 ? p.x - B.minX : nz > 0 ? B.maxZ - p.z : p.z - B.minZ; // to the wall's outer face
    if (!(e > 0 && e < WX.reach + WX.wall)) return null;
    // straight out through it at chest height: open all the way (a window's hole), for a body's line and for sight
    if (ST.raycast(p.x, p.z, nx, nz, e + 0.9, RAY_SOLID, chest) < e + 0.9 || ST.raycast(p.x, p.z, nx, nz, e + 0.9, RAY_SIGHT, chest) < e + 0.9) return null;
    const wx = p.x + nx * e, wz = p.z + nz * e;
    const lx = wx + nx * WX.out, lz = wz + nz * WX.out;
    if (g.storeys.at(lx, lz) === S) return null; // an inside wall (a partition's doorway is walked, not climbed)
    const F = this.found;
    F.x = wx; F.z = wz; F.nx = nx; F.nz = nz; F.blocked = null;
    const ground = g.streamer?.W?.terrain ? g.streamer.W.groundAt(lx, lz) : y0;
    F.land.x = lx; F.land.z = lz; F.land.y = ground;
    F.drop = Math.max(0, (p.gy ?? 0) - ground - WX.hang);
    // somewhere to land: open ground at the street (not a wall, a roof, another building, a car)
    const solid = ST.raycast(lx - nx * 0.1, lz - nz * 0.1, nx, nz, 0.5, RAY_SOLID, -1) < 0.5 || ST.raycast(lx, lz, -nx, -nz, 0.6, RAY_SOLID, -1) < 0.45;
    if (g.storeys.at(lx, lz)) return null; // out there is another floor to walk onto (a fire escape, the next building's deck): not a drop
    if (solid || g.citygen?.buildingAt?.(lx, lz)) F.blocked = 'nothing to land on below';
    else for (const v of g.vehicles) if (Math.hypot(v.x - lx, v.z - lz) < (v.len ?? 4) * 0.6) { F.blocked = 'a car is under the window'; break; }
    return F;
  }

  interact(p, I, dt) {
    const g = this.g, F = this.find(p);
    if (!F) { this.hold = 0; return null; }
    if (F.blocked) { this.hold = 0; g.hud.prompt(`Way out · ${F.blocked}`); return F; }
    const hurt = Math.round(this.damageOf(F.drop));
    if (I.key('KeyE') && this.hold >= 0) {
      this.hold += dt;
      const k = this.hold / WX.hold;
      if (k >= 1) { this.hold = -1; this.exit(p, F); return F; }
      g.hud.prompt(`Climbing out… ${Math.round(k * 100)}%`);
      p.speed = 0;
    } else {
      if (!I.key('KeyE')) this.hold = 0;
      g.hud.prompt(`Way out · hold <kbd>E</kbd> Climb out and drop ${r1(F.drop)} m${hurt > 0 ? ` (it will hurt: about ${hurt})` : ''}`);
    }
    return F;
  }

  damageOf(drop) { return Math.max(0, drop - LADDER.fall.safe) * LADDER.fall.hpPerM; }

  // Over the sill, hang, let go. The same fall for anyone (c: you, or a sprinter that follows).
  exit(c, F) {
    const g = this.g, me = c === g.player, S = c.storey, y = c.gy ?? 0;
    const dmg = this.damageOf(F.drop);
    c.x = F.land.x; c.z = F.land.z; c.gy = F.land.y; c.storey = null; c.vx = 0; c.vz = 0;
    g.standOn?.(c);
    c.face = Math.atan2(F.nx, F.nz);
    if (dmg > 0) { g.combat?.damage?.(c, dmg, null, 0, 0, 'fall'); if (me) this.counts.hurt++; }
    c.knockT = c.knockMax = dmg > 0 ? WX.down.hurt : WX.down.clean;
    g.noise?.(c.x, c.z, WX.noise[0] + F.drop * WX.noise[1], c);
    if (!g.audio?.sample?.('common', 'bodyfall', { x: c.x, z: c.z, range: 40 })) g.audio?.thud?.(g.pan(c.x));
    if (me) {
      this.counts.exits++;
      this.last = { x: F.x, z: F.z, nx: F.nx, nz: F.nz, land: { x: F.land.x, z: F.land.z, y: F.land.y }, S, y, drop: F.drop, t: g.time };
      g.hud?.toast?.(dmg > 0 ? `OUT THE WINDOW · ${r1(F.drop)} M · IT HURT` : 'OUT THE WINDOW', dmg > 0 ? 'warn' : 'job');
    } else this.counts.followed++;
    g.emit?.('windowExit', { id: c.id, drop: r1(F.drop), dmg: Math.round(dmg), you: me, kind: c.zkind ?? null });
  }

  // Who follows: a sprinter in its burst, on the floor you left, that reaches the window you went out of.
  update(dt) {
    const L = this.last, g = this.g;
    if (!L) return;
    if (g.time - L.t > WX.follow.secs) { this.last = null; return; }
    for (const c of g.chars) {
      if (c.faction !== 'zombie' || !c.alive || c.storey !== L.S || Math.abs((c.gy ?? 0) - L.y) > 1) continue;
      if (Math.hypot(c.x - L.x, c.z - L.z) > WX.follow.reach) continue;
      if (!WX.follow.kinds.includes(c.zkind ?? 'shambler') || c.zs?.state !== 'burst' || c.crawl) continue; // the herd and the Echoes stay at the sill
      this.exit(c, L);
    }
  }

  view() {
    const p = this.g.player, F = this.find(p);
    return {
      window: F ? { x: r1(F.x), z: r1(F.z), out: [F.nx, F.nz], drop: r1(F.drop), hurt: Math.round(this.damageOf(F.drop)), blocked: F.blocked, land: { x: r1(F.land.x), z: r1(F.land.z), y: r1(F.land.y) } } : null,
      upstairs: !!p.storey && (p.gy ?? 0) - (p.storey?.y0 ?? 0) >= WX.minUp,
      last: this.last ? { x: r1(this.last.x), z: r1(this.last.z), drop: r1(this.last.drop), ago: r1(this.g.time - this.last.t) } : null,
      counts: { ...this.counts }, rows: { WINDOW_EXIT: WX, fall: LADDER.fall },
    };
  }
}
