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
    this.found = { x: 0, z: 0, nx: 0, nz: 0, drop: 0, blocked: null, land: { x: 0, z: 0, y: 0 }, roof: null, pipe: null, foot: { x: 0, z: 0, y: 0 } };
    this.holdUp = 0;
    this.up = { P: null, S: null, k: 0, x: 0, z: 0, y: 0, climb: 0 };
    this.counts = { exits: 0, hurt: 0, followed: 0, refused: 0, pipeDown: 0, pipeUp: 0, roofs: 0 };
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
    F.x = wx; F.z = wz; F.nx = nx; F.nz = nz; F.blocked = null; F.roof = null; F.pipe = null; F.dropBlocked = null;
    const ground = g.streamer?.W?.terrain ? g.streamer.W.groundAt(lx, lz) : y0;
    F.land.x = lx; F.land.z = lz; F.land.y = ground;
    F.drop = Math.max(0, (p.gy ?? 0) - ground - WX.hang);
    // somewhere to land: open ground at the street (not a wall, a roof, another building, a car)
    const solid = ST.raycast(lx - nx * 0.1, lz - nz * 0.1, nx, nz, 0.5, RAY_SOLID, -1) < 0.5 || ST.raycast(lx, lz, -nx, -nz, 0.6, RAY_SOLID, -1) < 0.45;
    // What is out there: the spot a drop lands on, or, across an alley, the next building within a jump (WX.roof.jump).
    let S2 = g.storeys.at(lx, lz), jx = lx, jz = lz;
    if (!S2) for (const o of WX.roof.jump) { const q = g.storeys.at(wx + nx * o, wz + nz * o); if (q && q !== S) { S2 = q; jx = wx + nx * o; jz = wz + nz * o; break; } }
    if (S2 && S2 !== g.storeys.at(lx, lz)) { // across the alley: only a lower roof you can stand on counts; anything else and it is the street below as before
      const roofY2 = S2.cg && S2.b?.B && S2.n === S2.b.B.n ? S2.Y[S2.n] : null;
      if (roofY2 === null || roofY2 > (p.gy ?? 0) - WX.roof.min || ST.raycast(wx, wz, nx, nz, Math.hypot(jx - wx, jz - wz), RAY_SOLID, chest) < Math.hypot(jx - wx, jz - wz) - 0.05) S2 = null;
    }
    if (S2) {
      // Out there is another building. If it is a floor to walk onto (a fire escape, a deck level with you) this is not a
      // drop. If it is a ROOF YOU CAN STAND ON, lower than your floor, you drop onto it (WEB_WINDOWS2.md): inside its edge.
      const roofY = S2.cg && S2.b?.B && S2.n === S2.b.B.n ? S2.Y[S2.n] : null;
      if (roofY === null || roofY > (p.gy ?? 0) - WX.roof.min) return null;
      const m = WX.roof.in, rx = Math.max(S2.b.minX + m, Math.min(S2.b.maxX - m, jx)), rz = Math.max(S2.b.minZ + m, Math.min(S2.b.maxZ - m, jz));
      if (Math.hypot(rx - wx, rz - wz) > WX.roof.reach) return null;
      F.land.x = rx; F.land.z = rz; F.land.y = roofY; F.roof = S2;
      F.drop = Math.max(0, (p.gy ?? 0) - roofY - WX.hang);
      const ry = roofY - (S2.y0 ?? 0) + 0.5; // on the deck, clear of a bulkhead, a tank, the stair's own opening
      if (g.storeys.heightAt(rx, rz, roofY + 0.5) !== roofY || ST.raycast(rx - 0.3, rz, 1, 0, 0.6, RAY_SOLID, ry) < 0.6 || ST.raycast(rx, rz - 0.3, 0, 1, 0.6, RAY_SOLID, ry) < 0.6) F.blocked = 'nothing to land on over there';
      return F;
    }
    if (solid || g.citygen?.buildingAt?.(lx, lz)) F.blocked = 'nothing to land on below';
    else for (const v of g.vehicles) if (Math.hypot(v.x - lx, v.z - lz) < (v.len ?? 4) * 0.6) { F.blocked = 'a car is under the window'; break; }
    // Something to hold: this wall's drainpipe within reach of the window you face. You climb down it instead of
    // dropping, if there is ground at its foot.
    const P = B.B?.pipe, lvl = g.storeys.levelOf(S, p.gy ?? 0);
    if (P && P.nx === nx && P.nz === nz && P.floors.includes(lvl) && Math.hypot(P.x - wx, P.z - wz) < WX.pipe.reach) { // from a floor the pipe serves (not from the roof: it stops at the top window)
      const fx = P.x + nx * WX.pipe.foot, fz = P.z + nz * WX.pipe.foot;
      let ok = ST.raycast(fx - 0.25, fz, 1, 0, 0.5, RAY_SOLID, -1) >= 0.5 && ST.raycast(fx, fz - 0.25, 0, 1, 0.5, RAY_SOLID, -1) >= 0.5 && !g.storeys.at(fx, fz) && !g.citygen?.buildingAt?.(fx, fz);
      if (ok) for (const v of g.vehicles) if (Math.hypot(v.x - fx, v.z - fz) < (v.len ?? 4) * 0.6) { ok = false; break; }
      if (ok) { F.pipe = P; F.foot.x = fx; F.foot.z = fz; F.foot.y = g.streamer?.W?.terrain ? g.streamer.W.groundAt(fx, fz) : y0; F.dropBlocked = F.blocked; F.blocked = null; } // dropBlocked: what a body that JUMPS from this window would land in
    }
    return F;
  }

  interact(p, I, dt) {
    const g = this.g, F = this.find(p);
    if (!F) { this.hold = 0; this.holdKey = null; return null; }
    // the hold belongs to one way out of one window: turn to another wall, or from the pipe to a drop, and it starts again
    const key = `${F.pipe ? 'p' : F.roof ? 'r' : 'd'}:${F.nx},${F.nz}:${Math.round(F.x)},${Math.round(F.z)}`;
    if (key !== this.holdKey) { this.holdKey = key; this.hold = I.key('KeyE') ? -1 : 0; } // E already down when it changed: let go first
    if (F.pipe) { // the pipe: slower than letting go, and it costs nothing
      const h = Math.max(0.5, (p.gy ?? 0) - F.foot.y), need = WX.hold + h / WX.pipe.speed;
      if (I.key('KeyE') && this.hold >= 0) {
        this.hold += dt;
        if (this.hold >= need) { this.hold = -1; this.pipeDown(p, F); return F; }
        g.hud.prompt(`Climbing down the pipe… ${Math.round((this.hold / need) * 100)}%`); p.speed = 0;
      } else { if (!I.key('KeyE')) this.hold = 0; g.hud.prompt(`Way down · hold <kbd>E</kbd> Climb down the drainpipe (${r1(h)} m, no fall)`); }
      return F;
    }
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
      g.hud.prompt(`Way out · hold <kbd>E</kbd> Climb out and drop ${r1(F.drop)} m${F.roof ? ' onto the roof' : ''}${hurt > 0 ? ` (it will hurt: about ${hurt})` : ''}`);
    }
    return F;
  }

  damageOf(drop) { return Math.max(0, drop - LADDER.fall.safe) * LADDER.fall.hpPerM; }

  // Over the sill, hang, let go. The same fall for anyone (c: you, or a sprinter that follows).
  exit(c, F) {
    const g = this.g, me = c === g.player, S = c.storey, y = c.gy ?? 0;
    const dmg = this.damageOf(F.drop);
    c.x = F.land.x; c.z = F.land.z; c.gy = F.land.y; c.storey = F.roof ?? null; c.vx = 0; c.vz = 0;
    g.standOn?.(c);
    c.face = Math.atan2(F.nx, F.nz);
    if (dmg > 0) { g.combat?.damage?.(c, dmg, null, 0, 0, 'fall'); if (me) this.counts.hurt++; }
    c.knockT = c.knockMax = dmg > 0 ? WX.down.hurt : WX.down.clean;
    g.noise?.(c.x, c.z, WX.noise[0] + F.drop * WX.noise[1], c);
    if (!g.audio?.sample?.('common', 'bodyfall', { x: c.x, z: c.z, range: 40 })) g.audio?.thud?.(g.pan(c.x));
    if (me) {
      this.counts.exits++; if (F.roof) this.counts.roofs++;
      this.last = { x: F.x, z: F.z, nx: F.nx, nz: F.nz, land: { x: F.land.x, z: F.land.z, y: F.land.y }, roof: F.roof ?? null, S, y, drop: F.drop, t: g.time };
      g.hud?.toast?.(dmg > 0 ? `OUT THE WINDOW · ${r1(F.drop)} M · IT HURT` : F.roof ? 'OUT THE WINDOW · ONTO THE ROOF' : 'OUT THE WINDOW', dmg > 0 ? 'warn' : 'job');
    } else this.counts.followed++;
    g.emit?.('windowExit', { id: c.id, drop: r1(F.drop), dmg: Math.round(dmg), you: me, kind: c.zkind ?? null });
  }

  // Down the pipe: hand over hand to the street. No fall, no hurt, a little noise. (A sprinter that reaches the window
  // you left still jumps: it lands where a drop from that window lands.)
  pipeDown(c, F) {
    const g = this.g, S = c.storey, y = c.gy ?? 0;
    c.x = F.foot.x; c.z = F.foot.z; c.gy = F.foot.y; c.storey = null; c.vx = 0; c.vz = 0;
    g.standOn?.(c);
    c.face = Math.atan2(F.nx, F.nz);
    g.noise?.(c.x, c.z, WX.pipe.noise, c);
    if (c === g.player) {
      this.counts.pipeDown++;
      // who may jump after you: only if a drop from this window has somewhere to land (a car or a wall under it: nobody follows)
      this.last = F.dropBlocked ? null : { x: F.x, z: F.z, nx: F.nx, nz: F.nz, land: { x: F.land.x, z: F.land.z, y: F.land.y }, roof: null, S, y, drop: Math.max(0, y - F.land.y - WX.hang), t: g.time };
      g.hud?.toast?.('DOWN THE PIPE', 'job');
    }
    g.emit?.('pipeClimb', { id: c.id, dir: 'down', m: r1(y - F.foot.y) });
  }

  // FROM THE STREET: the drainpipe whose foot you stand at, and the lowest window on it that is open to climb in by.
  // { P, S, k, x, z, y, climb } | null
  findUp(p) {
    const g = this.g, CG = g.citygen, ST = g.statics;
    if (!CG || p.storey || p.inVehicle || p.ug) return null;
    for (const t of CG.live.values()) {
      if (Math.abs(t.rec.x - p.x) > t.rec.half + 4 || Math.abs(t.rec.z - p.z) > t.rec.half + 4) continue;
      for (const R of t.blds) {
        const P = R.B.pipe, S = R.S;
        if (!P || !S) continue;
        const fx = P.x + P.nx * WX.pipe.foot, fz = P.z + P.nz * WX.pipe.foot;
        if (Math.abs(fx - p.x) > WX.pipe.grab || Math.abs(fz - p.z) > WX.pipe.grab || Math.hypot(fx - p.x, fz - p.z) > WX.pipe.grab) continue;
        const y0 = S.y0 ?? 0;
        for (const k of P.floors) {
          const up = S.Y[k] - y0, ox = P.wx + P.nx * 0.7, oz = P.wz + P.nz * 0.7; // from just outside the window, in through it at chest height
          if (ST.raycast(ox, oz, -P.nx, -P.nz, 1.7, RAY_SOLID, up + 1.3) < 1.7 || ST.raycast(ox, oz, -P.nx, -P.nz, 1.7, RAY_SIGHT, up + 1.3) < 1.7) continue; // glazed, boarded, or something stands inside it
          const ax = P.wx - P.nx * 1.0, az = P.wz - P.nz * 1.0;
          if (g.storeys.heightAt(ax, az, S.Y[k] + 0.3) !== S.Y[k]) continue; // inside that window is the stair's opening: not a place to climb in
          const U = this.up;
          U.P = P; U.S = S; U.k = k; U.x = ax; U.z = az; U.y = S.Y[k]; U.climb = Math.max(0.5, S.Y[k] - (p.gy ?? y0));
          return U;
        }
      }
    }
    return null;
  }

  // The E chain on the street (main.js): the prompt, the hold, the climb.
  interactUp(p, I, dt) {
    const g = this.g, U = this.findUp(p);
    if (g.time - (this.upAsked ?? -9) > 0.25) this.holdUp = I.key('KeyE') ? -1 : 0; // not asked last frame (something else had E): the hold starts again, from a fresh press
    this.upAsked = g.time;
    if (!U) { this.holdUp = 0; return null; }
    const need = WX.hold + U.climb / WX.pipe.speed;
    if (I.key('KeyE') && this.holdUp >= 0) {
      this.holdUp += dt;
      if (this.holdUp >= need) { this.holdUp = -1; this.pipeUp(p, U); return U; }
      g.hud.prompt(`Climbing the pipe… ${Math.round((this.holdUp / need) * 100)}%`); p.speed = 0;
    } else { if (!I.key('KeyE')) this.holdUp = 0; g.hud.prompt(`Drainpipe · hold <kbd>E</kbd> Climb up and in by the window (${r1(U.climb)} m)`); }
    return U;
  }

  // Up the pipe and in over the sill.
  pipeUp(c, U) {
    const g = this.g;
    c.x = U.x; c.z = U.z; c.gy = U.y; c.storey = U.S; c.vx = 0; c.vz = 0;
    g.standOn?.(c);
    c.face = Math.atan2(-U.P.nx, -U.P.nz);
    g.noise?.(c.x, c.z, WX.pipe.noise, c);
    if (c === g.player) { this.counts.pipeUp++; g.hud?.toast?.('IN BY THE WINDOW', 'job'); }
    g.emit?.('pipeClimb', { id: c.id, dir: 'up', m: r1(U.climb), floor: U.k });
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
      this.exit(c, L); // L.roof (if you dropped onto a roof) goes with it
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
