import { DRONES, FOE_DRONES, ANTI_DRONE, BAY_DRONE } from '../data/gadgets.js';
import { ITEMS } from '../data/items.js';
import { rayCircle } from '../engine/collision.js';

// DRONES (docs/design/WEB_GADGETS.md §4; rows in data/gadgets.js DRONES). Launched from the pack: the item leaves it and
// a drone lifts off where you stand. While it flies YOU fly it (WASD, Shift boosts, E brings it home, ` drops a bomb)
// and your body stays put, frozen where you left it (main.js updatePlayer hands the keys here). Battery drains by the
// second (twice as fast boosting); the signal weakens past `weak` of its range and is lost past the range itself: then
// it flies itself home and lands, and so it does on a low battery. Landed beside you it goes back in the pack (charged
// again after `recharge` s). Every half second it MARKS the enemies under it (the minimap rings them for 8 s). It is a
// flier like the birds: anyone armed and hostile who sees it inside 35 m shoots at it, and at 0 hp it falls and breaks
// (what is left lies on the ground as scrap).
//
// The camera lane owns the rig: this only publishes g.droneCam { active, x, z, h } and main.js updateCamera follows it
// through one small hook while active.
//
// THEIR drones (`foes`, rows in data/gadgets.js FOE_DRONES): flown at you by someone else. A skip tracers' response
// sends a spotter up off its car (systems/security.js); a drop drone is what a raider flies (`drone action=foe`). A
// spotter circles over you and, every so often, tells its own side where you are; a drop drone circles tight and lets
// go of its charges on you. Against them (ANTI_DRONE): shoot them (combat.hitscan hands every round's line here), light
// a signal flare (it circles the flare instead, and bombs it), or stand in smoke (it loses you and circles where it last
// saw you). Each one turns for home after its `life`.
//
// THE OUTRIDER (`o`, the row BAY_DRONE): the drone that rides a DRONE BAY on the car (data/workshop.js UTILITY.dronebay).
// Backslash (the dronebay row) sends it up from the car you are in, at any speed, and calls it home. Nobody flies it: it
// holds `lead` m ahead of the car along its heading (circles `orbit` m out while the car is parked), marks what is
// hostile under it like the scout, and comes home on its own past `range` from the CAR or on a low battery. Docked it
// charges on the car you are in (the bay's slot keeps its battery, v.utility.dronebay.bat, saved with the build). Shot
// down, the bay is empty (slot.empty) until a scout drone from your pack goes in it (Backslash again).
const SHOOT_R = 35, MARK_FOR = 8;
const r1 = (v) => Math.round(v * 10) / 10;

export class Drones {
  constructor(game, gadgets) {
    this.g = game; this.gx = gadgets;
    this.rows = DRONES;
    this.d = null;            // the one in the air: { kind, def, x, z, y, h, vx, vz, battery, hp, bombs, state, pilot, ... }
    this.piloting = false;
    this.bombs = [];          // falling: { x, z, y, t, def, by }
    this.cool = {};           // kind -> game time it is charged again
    this.counts = { launched: 0, landed: 0, lost: 0, shotDown: 0, marked: 0, bombs: 0, crashed: 0, foes: 0, foesDown: 0, decoyed: 0, calls: 0, foeBombs: 0, bayUp: 0, bayDocked: 0, bayDown: 0, bayLoaded: 0 };
    this.foes = [];           // theirs: { id, kind, def, x, z, y, h, vx, vz, hp, bombs, t, state hunt|leave|down, owner, of, lx, lz, seen, ... }
    this.fseq = 0;
    this.o = null;            // the outrider up off a car: { v, x, z, y, h, vx, vz, bat, hp, state out|home|down, why, t, markT, shotT }
    game.droneCam = this.cam = { active: false, x: 0, z: 0, h: 40 };
  }

  launch(kind, pilot = this.g.player) {
    const g = this.g, def = DRONES[kind];
    if (!def) return { ok: false, why: `kinds: ${Object.keys(DRONES).join(', ')}` };
    if (this.d) return { ok: false, why: 'one drone in the air at a time' };
    if (pilot.inVehicle && g.vehiclesSys.speed(pilot.inVehicle) > 2) return { ok: false, why: 'stop the car first' };
    if ((this.cool[kind] ?? 0) > g.time) return { ok: false, why: `its battery is still charging (${Math.ceil(this.cool[kind] - g.time)} s)` };
    const x = pilot.x + Math.sin(pilot.face ?? 0) * 0.8, z = pilot.z + Math.cos(pilot.face ?? 0) * 0.8;
    this.d = { kind, def, x, z, y: 0.3, h: pilot.face ?? 0, vx: 0, vz: 0, battery: def.battery, hp: def.hp, bombs: def.bombs, state: 'fly', pilot, markT: 0, shotT: 0, buzzT: 0, signal: 1, t: 0, ix: 0, iz: 0, boost: false, why: null };
    this.piloting = pilot === g.player;
    this.counts.launched++;
    g.emit('droneLaunched', { kind, x: r1(x), z: r1(z) });
    return { ok: true, text: `${def.name.toUpperCase()} UP · WASD FLY · E HOME${def.bombs ? ' · ` DROP' : ''}` };
  }

  // The keys while flying (main.js updatePlayer calls this instead of moving you).
  input(I) {
    const d = this.d;
    if (!d || d.state !== 'fly') return;
    d.ix = (I.key('KeyD') || I.key('ArrowRight') ? 1 : 0) - (I.key('KeyA') || I.key('ArrowLeft') ? 1 : 0);
    d.iz = (I.key('KeyS') || I.key('ArrowDown') ? 1 : 0) - (I.key('KeyW') || I.key('ArrowUp') ? 1 : 0);
    d.boost = I.key('ShiftLeft') || I.key('ShiftRight');
    if (I.hit('KeyE')) this.recall('called home');
  }

  // Fly it from outside (the drone command, a scenario): a direction held for the next frames, or a point to go to.
  steer(ix, iz, boost = false) { const d = this.d; if (!d) return; d.ix = ix; d.iz = iz; d.boost = boost; d.goto = null; }
  goTo(x, z) { const d = this.d; if (!d) return; d.goto = { x, z }; }

  recall(why) {
    const d = this.d;
    if (!d || d.state === 'down') return;
    if (d.state !== 'home') { d.state = 'home'; d.why = why; this.g.emit('droneReturning', { kind: d.kind, why }); }
  }

  dropBomb() {
    const g = this.g, d = this.d;
    if (!d || d.state === 'down') return { ok: false, why: 'no drone up' };
    if (!(d.bombs > 0)) { if (this.piloting) g.hud?.toast('NO BOMBS ON THIS ONE', 'warn'); return { ok: false, why: 'no bombs left' }; }
    d.bombs--; this.counts.bombs++;
    this.bombs.push({ x: d.x, z: d.z, y: d.def.alt, t: 0, def: d.def.bomb, by: d.pilot, vx: d.vx * 0.6, vz: d.vz * 0.6 });
    g.audio.clink?.(g.pan(d.x));
    g.emit('droneBomb', { x: r1(d.x), z: r1(d.z), left: d.bombs });
    return { ok: true, left: d.bombs };
  }

  // Shot at: a hit takes hp; at 0 it falls.
  hurt(dmg, by) {
    const d = this.d;
    if (!d || d.state === 'down') return;
    d.hp -= dmg;
    this.g.fx.sparks(d.x, d.y, d.z, 0, 0, 4);
    if (d.hp <= 0) { this.counts.shotDown++; this.crash('shot down', by); }
  }

  crash(why, by = null) {
    const g = this.g, d = this.d;
    d.state = 'down'; d.why = why; d.downT = 0;
    this.piloting = false;
    g.emit('droneDown', { kind: d.kind, why, by: by?.id ?? null, x: r1(d.x), z: r1(d.z) });
    if (d.pilot === g.player) g.hud?.toast(`DRONE ${why.toUpperCase()}`, 'hot');
  }

  land() {
    const g = this.g, d = this.d;
    this.counts.landed++;
    this.cool[d.kind] = g.time + (d.battery < d.def.battery * 0.5 ? d.def.recharge : d.def.recharge * 0.3);
    if (d.pilot === g.player) g.inventory?.stow(`drone_${d.kind}`, 1);
    g.emit('droneLanded', { kind: d.kind, why: d.why, battery: Math.round(d.battery), bombs: d.bombs });
    this.d = null; this.piloting = false;
  }

  // Every hostile to P inside r of d is marked for the minimap (MARK_FOR s); emits droneMarked with how many are new.
  markUnder(d, r, P) {
    const g = this.g;
    let n = 0;
    for (const c of g.chars) {
      if (!c.alive || Math.abs(c.x - d.x) > r || Math.abs(c.z - d.z) > r) continue;
      if (!this.gx.enemyOf(P, c) || Math.hypot(c.x - d.x, c.z - d.z) > r) continue;
      if (!(c.marked > g.time)) n++;
      c.marked = g.time + MARK_FOR;
    }
    if (n) { this.counts.marked += n; g.emit('droneMarked', { n, x: r1(d.x), z: r1(d.z), by: d === this.o ? 'outrider' : d.kind }); }
    return n;
  }

  // The armed and hostile to P who can see d take a shot at it; hit(dmg, shooter) for each round that lands.
  shotAt(d, P, hit) {
    const g = this.g;
    for (const c of g.chars) {
      if (!c.alive || !c.weapon || c.inVehicle || c === P || Math.abs(c.x - d.x) > SHOOT_R || Math.abs(c.z - d.z) > SHOOT_R) continue;
      if (!g.ai.hostile(c, P) || (c.blind ?? 0) > 0 || !g.los(c.x, c.z, d.x, d.z)) continue;
      const r = Math.hypot(c.x - d.x, c.z - d.z);
      if (r > SHOOT_R) continue;
      g.audio.gun?.(c.weapon === 'shotgun' ? 'shotgun' : 'smg', Math.hypot(c.x - g.player.x, c.z - g.player.z), g.pan(c.x));
      g.fx.flash(c.x, 1.3, c.z, 0.8, 0.04);
      c.face = Math.atan2(d.x - c.x, d.z - c.z);
      if (Math.random() < 0.55 - r / 90) hit(c.weapon === 'shotgun' ? 14 : 8, c);
      if (d.state === 'down') return;
    }
  }

  // ---- the outrider (BAY_DRONE) ------------------------------------------------------------------------------------------
  slot(v) { return v?.utility?.dronebay ?? null; }
  roofY(v) { return (v.y ?? 0) + (v.tall ?? 1.8) + 0.12; }

  // Backslash, or the drone command: up off v, home if it is up, or load an empty bay from the pack.
  bay(v = this.g.player.inVehicle) {
    const g = this.g, B = BAY_DRONE, s = this.slot(v);
    if (!s) return { ok: false, why: v ? `no drone bay on the ${v.name}` : 'get in a car with a drone bay' };
    const o = this.o;
    if (o && o.v === v) {
      if (o.state !== 'out') return { ok: false, why: o.state === 'down' ? 'it is coming down' : 'it is already on its way home' };
      o.state = 'home'; o.why = 'called home'; g.emit('bayRecalled', { why: o.why });
      return { ok: true, text: 'OUTRIDER COMING HOME' };
    }
    if (o) return { ok: false, why: 'one outrider up at a time' };
    if (s.empty) {
      if (!g.inventory || g.inventory.spend(B.refill, 1) < 1) return { ok: false, why: `the bay is empty: a ${ITEMS[B.refill]?.name ?? B.refill} from your pack goes in it` };
      s.empty = undefined; s.bat = B.battery * 0.25; this.counts.bayLoaded++;
      g.emit('bayLoaded', { car: v.id ?? null });
      return { ok: true, text: 'A DRONE IN THE BAY · CHARGING' };
    }
    const bat = s.bat ?? B.battery;
    if (bat < B.battery * (B.low + 0.1)) return { ok: false, why: `its battery is charging (${Math.round((bat / B.battery) * 100)}%)` };
    const y = this.roofY(v);
    this.o = { v, x: v.x, z: v.z, y, h: v.h, vx: v.vx ?? 0, vz: v.vz ?? 0, bat, hp: B.hp, state: 'out', why: null, t: 0, markT: 0, shotT: 0.6, bombs: 0 };
    s.up = true; this.counts.bayUp++;
    g.emit('bayLaunched', { x: r1(v.x), z: r1(v.z), bat: Math.round(bat) });
    return { ok: true, text: 'OUTRIDER UP · IT FLIES AHEAD · \\ HOME' };
  }

  dock() {
    const g = this.g, o = this.o, s = this.slot(o.v);
    if (s) { s.bat = Math.max(0, o.bat); s.up = undefined; }
    this.counts.bayDocked++;
    g.emit('bayDocked', { why: o.why, bat: Math.round(o.bat) });
    this.o = null;
  }

  bayDown(why, by = null) {
    const g = this.g, o = this.o;
    o.state = 'down'; o.why = why; o.downT = 0;
    g.emit('bayDown', { why, by: by?.id ?? null, x: r1(o.x), z: r1(o.z) });
    if (g.player.inVehicle === o.v) g.hud?.toast(`OUTRIDER ${why.toUpperCase()}`, 'hot');
  }

  updateBay(dt) {
    const g = this.g, B = BAY_DRONE, P = g.player;
    // The car you are in charges its docked outrider.
    const ps = this.slot(P.inVehicle);
    if (ps && !ps.up && !ps.empty && (ps.bat ?? B.battery) < B.battery) ps.bat = Math.min(B.battery, (ps.bat ?? B.battery) + B.charge * dt);
    const o = this.o;
    if (!o) return;
    const v = o.v; o.t += dt;
    if (o.state !== 'down' && (v.dead || !this.slot(v))) this.bayDown('lost its car');
    if (o.state === 'down') {
      o.y = Math.max(0.15, o.y - dt * 14); o.downT += dt;
      if (o.downT > 1.2) {
        const s = this.slot(v); if (s) { s.empty = true; s.up = undefined; s.bat = 0; }
        g.inventory?.add(g.inventory.groundAt(o.x, o.z), 'scrap', 1); g.fx.explosion?.(o.x, o.z);
        this.counts.bayDown++; this.o = null;
      }
      return;
    }
    o.bat -= dt;
    if (o.bat <= 0) { this.bayDown('ran flat'); return; }
    const sp = Math.hypot(v.vx ?? 0, v.vz ?? 0), dist = Math.hypot(o.x - v.x, o.z - v.z);
    if (o.state === 'out') {
      const why = dist > B.range ? 'out of range' : o.bat < B.battery * B.low ? 'low battery' : null;
      if (why) { o.state = 'home'; o.why = why; g.emit('bayRecalled', { why }); if (P.inVehicle === v) g.hud?.toast(`OUTRIDER ${why.toUpperCase()} · COMING HOME`, 'warn'); }
    }
    let tx, tz, alt = B.alt;
    if (o.state === 'home') {
      tx = v.x; tz = v.z;
      if (dist < 6) alt = this.roofY(v);
      if (dist < 1.5) { // over the bay: it rides the car down onto the cradle
        o.x = v.x; o.z = v.z; o.vx = v.vx ?? 0; o.vz = v.vz ?? 0; o.h = v.h;
        o.y += (alt - o.y) * (1 - Math.exp(-dt * 6));
        if (o.y - alt < 0.3) this.dock();
        return;
      }
    } else if (sp > 3) { tx = v.x + Math.sin(v.h) * B.lead; tz = v.z + Math.cos(v.h) * B.lead; }
    else { const a = o.t * 0.5; tx = v.x + Math.sin(a) * B.orbit; tz = v.z + Math.cos(a) * B.orbit; }
    const gx = tx - o.x, gz = tz - o.z, gd = Math.hypot(gx, gz), want = gd > 0.01 ? Math.min(B.speed + sp, gd * 3) / gd : 0;
    const k = 1 - Math.exp(-dt * 4);
    o.vx += (gx * want - o.vx) * k; o.vz += (gz * want - o.vz) * k;
    o.x += o.vx * dt; o.z += o.vz * dt;
    o.y += (alt - o.y) * (1 - Math.exp(-dt * 2));
    if (Math.hypot(o.vx, o.vz) > 0.5) o.h = Math.atan2(o.vx, o.vz);
    o.markT -= dt;
    if (o.markT <= 0) { o.markT = B.markEvery; if (o.state === 'out') this.markUnder(o, B.mark, P); }
    o.shotT -= dt;
    if (o.shotT <= 0) {
      o.shotT = 0.6;
      this.shotAt(o, P, (dmg, c) => { o.hp -= dmg; g.fx.sparks(o.x, o.y, o.z, 0, 0, 4); if (o.hp <= 0 && o.state !== 'down') this.bayDown('shot down', c); });
    }
  }

  bayView(v = this.g.player.inVehicle) {
    const s = this.slot(v), o = this.o;
    return { fitted: !!s, empty: !!s?.empty, docked: !!s && !s.up && !s.empty, bat: s ? Math.round(s.up && o ? o.bat : (s.bat ?? BAY_DRONE.battery)) : null,
      up: o ? { state: o.state, why: o.why, x: r1(o.x), z: r1(o.z), alt: r1(o.y), hp: Math.round(o.hp), d: r1(Math.hypot(o.x - o.v.x, o.z - o.v.z)),
        ahead: r1((o.x - o.v.x) * Math.sin(o.v.h) + (o.z - o.v.z) * Math.cos(o.v.h)), mine: o.v === v } : null };
  }

  // ---- theirs ----------------------------------------------------------------------------------------------------------
  // One of theirs lifts off at (x, z); owner: who flies it (its side is theirs; null: raiders for a drop drone, the
  // wardens for a spotter).
  foe(kind, x, z, owner = null) {
    const g = this.g, def = FOE_DRONES[kind], P = g.player;
    if (!def) return { ok: false, why: `kinds: ${Object.keys(FOE_DRONES).join(', ')}` };
    if (this.foes.length >= 4) return { ok: false, why: 'four of theirs are up already' };
    const f = { id: `FD${++this.fseq}`, kind, def, x, z, y: 0.5, h: 0, vx: 0, vz: 0, hp: def.hp, bombs: def.bombs, t: 0, state: 'hunt', owner,
      of: owner?.faction ?? (kind === 'dropper' ? 'raider' : 'warden'), lx: P.x, lz: P.z, seen: false, saw: false, callT: 0, bombT: 1.5, ang: Math.random() * 6.283, decoy: null, downT: 0, buzzT: 0 };
    this.foes.push(f);
    this.counts.foes++;
    g.emit('foeDroneUp', { id: f.id, kind, by: owner?.id ?? null, x: r1(x), z: r1(z) });
    return { ok: true, id: f.id, kind };
  }

  // A round's line (combat.hitscan, before it is resolved on the ground): one passing under one of theirs may take it.
  shotThrough(shooter, ox, oz, dx, dz, range, dmg) {
    if (!this.foes.length || !shooter) return;
    for (const f of this.foes) {
      if (f.state === 'down' || shooter === f.owner || (shooter !== this.g.player && shooter.faction === f.of)) continue;
      if (rayCircle(ox, oz, dx, dz, f.x, f.z, ANTI_DRONE.shotR, range) < 0) continue;
      if (Math.random() < ANTI_DRONE.shotHit) this.hurtFoe(f, dmg, shooter);
    }
  }

  hurtFoe(f, dmg, by = null) {
    const g = this.g;
    if (f.state === 'down') return;
    f.hp -= dmg;
    g.fx.sparks(f.x, f.y, f.z, 0, 0, 4);
    if (f.hp > 0) return;
    f.state = 'down'; f.downT = 0;
    this.counts.foesDown++;
    g.emit('foeDroneDown', { id: f.id, kind: f.kind, by: by?.id ?? null, x: r1(f.x), z: r1(f.z) });
    if (by === g.player) g.hud?.toast(`${f.def.name.toUpperCase()} DOWN`, 'job');
  }

  // A lit signal flare within reach of it (systems/gadgets.js burn keeps p.lit), nearest first; null when none.
  flareNear(f) {
    let best = null, bd = ANTI_DRONE.flareR;
    for (const p of this.gx.list) {
      if (p.kind !== 'signal_flare' || !(p.lit > 0)) continue;
      const k = Math.hypot(p.x - f.x, p.z - f.z);
      if (k < bd) { bd = k; best = p; }
    }
    return best;
  }

  smoked(x, z) {
    for (const s of this.g.throwables?.smokes ?? []) if (Math.hypot(s.x - x, s.z - z) < s.r) return true;
    return false;
  }

  updateFoes(dt) {
    const g = this.g, P = g.player, B = P.inVehicle ?? P;
    for (let i = this.foes.length - 1; i >= 0; i--) {
      const f = this.foes[i], def = f.def;
      f.t += dt;
      if (f.state === 'down') {
        f.y = Math.max(0.15, f.y - dt * 14); f.downT += dt;
        if (f.downT > 1.2) { g.inventory?.add(g.inventory.groundAt(f.x, f.z), 'scrap', ANTI_DRONE.scrap); g.fx.explosion?.(f.x, f.z); this.foes.splice(i, 1); }
        continue;
      }
      if (f.state !== 'leave' && (f.t > def.life || (f.bombs <= 0 && def.bombs > 0))) { f.state = 'leave'; g.emit('foeDroneLeaving', { id: f.id, kind: f.kind }); }
      let gx, gz;
      if (f.state === 'leave') {
        const ax = f.x - B.x, az = f.z - B.z, ad = Math.hypot(ax, az) || 1;
        if (ad > 120) { this.foes.splice(i, 1); continue; }
        gx = f.x + (ax / ad) * 20; gz = f.z + (az / ad) * 20; f.seen = false;
      } else {
        const fl = this.flareNear(f);
        if (fl) {
          if (f.decoy !== fl.id) { f.decoy = fl.id; this.counts.decoyed++; g.emit('foeDroneDecoyed', { id: f.id, flare: fl.id }); }
          gx = fl.x; gz = fl.z; f.seen = false;
        } else {
          f.decoy = null;
          f.seen = P.alive && !this.smoked(B.x, B.z) && Math.hypot(B.x - f.x, B.z - f.z) < def.sight;
          if (f.seen) {
            f.lx = B.x; f.lz = B.z;
            if (!f.saw) { f.saw = true; g.hud?.toast(`${def.name.toUpperCase()} OVERHEAD`, 'hot'); g.emit('foeDroneSpotted', { id: f.id, kind: f.kind }); }
          }
          gx = f.lx; gz = f.lz;
        }
      }
      // Circle what it watches (a leaving one just goes).
      let tx = gx, tz = gz;
      if (f.state !== 'leave') { f.ang += dt * def.speed / Math.max(def.orbit, 2) * 0.35; tx += Math.sin(f.ang) * def.orbit; tz += Math.cos(f.ang) * def.orbit; }
      const mx = tx - f.x, mz = tz - f.z, md = Math.hypot(mx, mz), sp = Math.min(def.speed, md * 2.5);
      const k = 1 - Math.exp(-dt * 3);
      f.vx += ((md > 0.01 ? mx / md : 0) * sp - f.vx) * k; f.vz += ((md > 0.01 ? mz / md : 0) * sp - f.vz) * k;
      f.x += f.vx * dt; f.z += f.vz * dt;
      f.y += (def.alt - f.y) * (1 - Math.exp(-dt * 2));
      if (Math.hypot(f.vx, f.vz) > 0.5) f.h = Math.atan2(f.vx, f.vz);
      f.buzzT -= dt;
      if (f.buzzT <= 0) { f.buzzT = 2; g.zombies?.onNoise(f.x, f.z, 22); }
      // A spotter tells its own side where you are.
      if (def.call && f.seen) {
        f.callT -= dt;
        if (f.callT <= 0) {
          f.callT = def.callEvery;
          let n = 0;
          for (const c of g.chars) {
            if (!c.alive || !c.weapon || c === P || c.faction !== f.of || c.target || Math.abs(c.x - B.x) > def.call || Math.abs(c.z - B.z) > def.call) continue;
            if (!g.ai.hostile(c, P)) continue;
            c.target = P; c.state = 'fight'; n++;
          }
          if (n) { this.counts.calls += n; g.emit('foeDroneCalled', { id: f.id, n }); }
        }
      }
      // A drop drone over what it watches lets one go.
      if (f.bombs > 0 && (f.seen || f.decoy) && f.state !== 'leave') {
        f.bombT -= dt;
        if (f.bombT <= 0 && Math.hypot(gx - f.x, gz - f.z) < def.orbit + 2) {
          f.bombT = def.bombEvery; f.bombs--; this.counts.foeBombs++;
          this.bombs.push({ x: f.x, z: f.z, y: f.y, t: 0, def: def.bomb, by: f.owner, vx: f.vx * 0.6, vz: f.vz * 0.6 });
          g.audio.clink?.(g.pan(f.x));
          g.emit('foeDroneBomb', { id: f.id, x: r1(f.x), z: r1(f.z), on: f.decoy ? 'flare' : 'you', left: f.bombs });
        }
      }
    }
  }

  update(dt) {
    const g = this.g, d = this.d;
    this.cam.active = false;
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.t += dt; b.x += b.vx * dt; b.z += b.vz * dt; b.y -= (9 + 20 * b.t) * dt;
      if (b.y <= 0.2) { this.gx.blast(b.x, b.z, b.def, b.by); this.bombs.splice(i, 1); }
    }
    if (this.foes.length) this.updateFoes(dt);
    this.updateBay(dt);
    if (!d) return;
    d.t += dt;
    const P = d.pilot, def = d.def;
    if (!P.alive) { if (d.state !== 'down') this.crash('lost its pilot'); }
    if (d.state === 'down') {
      d.y = Math.max(0.15, d.y - dt * 14); d.downT += dt;
      if (d.downT > 1.2) { this.counts.crashed++; if (d.pilot === g.player) g.inventory?.add(g.inventory.groundAt(d.x, d.z), 'scrap', 1); g.fx.explosion?.(d.x, d.z); this.d = null; }
      return;
    }
    const dx = d.x - P.x, dz = d.z - P.z, dist = Math.hypot(dx, dz);
    // Battery, signal.
    d.battery -= dt * (d.boost && d.state === 'fly' ? 2 : 1);
    d.signal = Math.max(0, 1 - Math.max(0, dist - def.range * def.weak) / (def.range * (1 - def.weak)));
    if (d.state === 'fly') {
      if (dist > def.range) { this.counts.lost++; g.emit('droneSignalLost', { kind: d.kind, d: r1(dist) }); if (this.piloting) g.hud?.toast('SIGNAL LOST · IT IS COMING HOME', 'hot'); this.recall('signal lost'); }
      else if (d.battery < def.battery * 0.12) this.recall('low battery');
    }
    if (d.battery <= 0) { this.crash('ran flat'); return; }
    // Where it wants to go.
    let ix = d.ix, iz = d.iz, sp = def.speed * (d.boost ? def.boost : 1);
    if (d.state === 'home') {
      if (dist < 1.6) { d.y -= dt * 6; if (d.y <= 0.35) { this.land(); return; } ix = iz = 0; }
      else { ix = -dx / dist; iz = -dz / dist; sp = def.speed; }
      this.piloting = false;
    } else if (d.goto) {
      const gx = d.goto.x - d.x, gz = d.goto.z - d.z, gd = Math.hypot(gx, gz);
      if (gd < 1) { ix = iz = 0; } else { ix = gx / gd; iz = gz / gd; }
    } else { const m = Math.hypot(ix, iz); if (m > 1) { ix /= m; iz /= m; } }
    const k = 1 - Math.exp(-dt * 4);
    d.vx += (ix * sp - d.vx) * k; d.vz += (iz * sp - d.vz) * k;
    d.x += d.vx * dt; d.z += d.vz * dt;
    if (d.state === 'fly') d.y += (def.alt - d.y) * (1 - Math.exp(-dt * 2));
    if (Math.hypot(d.vx, d.vz) > 0.5) d.h = Math.atan2(d.vx, d.vz);
    // Weak signal: a warning, a wobble.
    if (this.piloting) {
      g.hud?.prompt(`<b>DRONE</b> · battery ${Math.round((d.battery / def.battery) * 100)}% · signal ${d.signal < 1 ? `<b class="warn">${Math.round(d.signal * 100)}%</b>` : 'good'}${def.bombs ? ` · bombs ${d.bombs} <kbd>\`</kbd>` : ''} · <kbd>E</kbd> home`);
      if (d.signal < 1) { d.vx += (Math.random() - 0.5) * (1 - d.signal) * 4; d.vz += (Math.random() - 0.5) * (1 - d.signal) * 4; }
    }
    // The buzz the dead hear (THE PULL: drone flyovers drag them).
    d.buzzT -= dt;
    if (d.buzzT <= 0) { d.buzzT = 2; g.zombies?.onNoise(d.x, d.z, 22); }
    // Marks: every enemy under it.
    d.markT -= dt;
    if (d.markT <= 0) { d.markT = def.markEvery; this.markUnder(d, def.mark, P); }
    // Shot at like any flier: the armed and hostile who can see it.
    d.shotT -= dt;
    if (d.shotT <= 0) { d.shotT = 0.6; this.shotAt(d, P, (dmg, c) => this.hurt(dmg, c)); if (!this.d || this.d.state === 'down') return; }
    if (this.piloting || d.state === 'home') { this.cam.active = this.piloting; this.cam.x = d.x; this.cam.z = d.z; this.cam.h = 46; }
  }

  // Into the gadgets' box mesh: a body, four rotors, a shadow on the ground. Falling bombs.
  draw(gx) {
    const d = this.d, t = this.g.time;
    for (const b of this.bombs) gx.put(b.x, b.y, b.z, t * 5, 0, 0, 0, 0.12, 0.32, 0.12, '#6a5a4a');
    for (const f of this.foes) this.body(gx, f, f.def.look, t);
    if (d) this.body(gx, d, d.kind === 'bomber' ? '#5a5a48' : '#3a3a36', t);
    if (this.o) this.body(gx, this.o, BAY_DRONE.look, t);
    const v = this.g.player.inVehicle, s = this.slot(v); // docked on the roof: still rotors, a dark eye
    if (s && !s.up && !s.empty) this.body(gx, { x: v.x, z: v.z, y: this.roofY(v), h: v.h, bombs: 0 }, BAY_DRONE.look, 0);
  }

  body(gx, d, col, t) {
    const y = d.y, h = d.h, spin = t * 40;
    gx.put(d.x, y, d.z, h, 0, 0, 0, 0.42, 0.14, 0.42, col);
    for (const [lx, lz] of [[0.32, 0.32], [-0.32, 0.32], [0.32, -0.32], [-0.32, -0.32]]) {
      gx.put(d.x, y, d.z, h, lx * 0.6, 0.02, lz * 0.6, 0.06, 0.04, 0.32, '#262626', 0, 0);
      gx.put(d.x, y, d.z, h, lx, 0.1, lz, 0.36, 0.01, 0.05, '#8a8478'); // the blur of a rotor
      gx.put(d.x, y, d.z, h + spin, lx, 0.1, lz, 0.05, 0.01, 0.36, '#8a8478');
    }
    gx.put(d.x, y, d.z, h, 0, -0.1, 0.18, 0.08, 0.06, 0.08, Math.sin(t * 8) > 0 ? '#ff3b2a' : '#3a1a14'); // the eye
    if (d.bombs > 0) gx.put(d.x, y, d.z, h, 0, -0.18, 0, 0.12, 0.2, 0.12, '#6a5a4a');
    gx.put(d.x, 0, d.z, h, 0, 0.03, 0, 0.5, 0.01, 0.5, '#151210'); // its shadow
  }

  drawMinimap(c, px, pz, scale, R) {
    const g = this.g;
    c.lineWidth = 1.8; c.strokeStyle = '#f5b21a';
    for (const ch of g.chars) {
      if (!(ch.marked > g.time) || !ch.alive) continue;
      const x = R + (ch.x - px) * scale, y = R + (ch.z - pz) * scale;
      if ((x - R) ** 2 + (y - R) ** 2 > (R - 16) ** 2) continue;
      c.beginPath(); c.arc(x, y, 4.5, 0, 6.3); c.stroke();
    }
    c.fillStyle = '#ff3b2a';
    for (const f of this.foes) {
      if (f.state === 'down') continue;
      const x = R + (f.x - px) * scale, y = R + (f.z - pz) * scale;
      if ((x - R) ** 2 + (y - R) ** 2 > (R - 16) ** 2) continue;
      c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x + 4, y); c.lineTo(x, y + 4); c.lineTo(x - 4, y); c.closePath(); c.fill();
    }
    const o = this.o;
    if (o && o.state !== 'down') {
      const x = R + (o.x - px) * scale, y = R + (o.z - pz) * scale;
      if ((x - R) ** 2 + (y - R) ** 2 <= (R - 16) ** 2) { c.fillStyle = '#f5b21a'; c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x + 4, y); c.lineTo(x, y + 4); c.lineTo(x - 4, y); c.closePath(); c.fill(); }
    }
    const d = this.d;
    if (!d) return;
    const x = R + (d.x - px) * scale, y = R + (d.z - pz) * scale;
    if ((x - R) ** 2 + (y - R) ** 2 > (R - 16) ** 2) return;
    c.fillStyle = d.signal < 1 ? '#ff5a3a' : '#f3e6cf';
    c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x + 4, y); c.lineTo(x, y + 4); c.lineTo(x - 4, y); c.closePath(); c.fill();
  }

  foeView() { return this.foes.map((f) => ({ id: f.id, kind: f.kind, state: f.state, x: r1(f.x), z: r1(f.z), hp: Math.round(f.hp), bombs: f.bombs, seen: f.seen, decoy: f.decoy, by: f.owner?.id ?? null, of: f.of })); }

  view() {
    const d = this.d, P = this.g.player;
    if (!d) return { up: false, foes: this.foeView(), bay: this.bayView(), cooling: Object.fromEntries(Object.entries(this.cool).filter(([, t]) => t > this.g.time).map(([k, t]) => [k, r1(t - this.g.time)])), counts: { ...this.counts } };
    return { up: true, kind: d.kind, state: d.state, why: d.why, x: r1(d.x), z: r1(d.z), alt: r1(d.y), d: r1(Math.hypot(d.x - d.pilot.x, d.z - d.pilot.z)), range: d.def.range,
      signal: +d.signal.toFixed(2), battery: Math.round(d.battery), hp: Math.round(d.hp), bombs: d.bombs, piloting: this.piloting, pilotAt: { x: r1(P.x), z: r1(P.z) }, foes: this.foeView(), bay: this.bayView(), counts: { ...this.counts } };
  }
}
