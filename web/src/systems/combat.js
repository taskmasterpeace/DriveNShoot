import { rayCircle, RAY_BULLET, RAY_SOLID, RAY_SIGHT } from '../engine/collision.js';
import { muzzleForward, carryLateral } from './characters.js';
import { CARRY } from '../data/arms.js';
import { BALLISTICS as BL } from '../data/ballistics.js';

const NOBODY = {}; // a round with no shooter (a test's ghost): nobody's car, nobody's floor

// Data-driven weapons. Add a row, get a gun.
// modes (docs/design/WEB_CONTROLLER.md §3.4): the fire modes or alternate uses the weapon bar raises above the slot.
//   burst  rounds per pull: 1 single, n a burst (fired at `rate`, then `after` s before the next pull), 0 automatic
//   rate   s between rounds (cyclic); spread x the row's spread; kick: the recoil bloom one round adds
//   dmg / pellets / range: an alternate use replaces the row's (the sawn-off's slug)
// A row with no modes gets one from `auto` (systems/arms.js). `mode` names the default.
export const WEAPONS = {
  pistol:  { name: '.45 REVOLVER', short: 'PISTOL', dmg: 38, rate: 0.26, mag: 6, reload: 1.3, spread: 0.025, range: 55, auto: false, pellets: 1, ammo: 'pistol', sound: 'pistol', shake: 0.25,
    modes: [{ id: 'single', name: 'SINGLE', burst: 1, rate: 0.26, spread: 1, kick: 0.35 }, { id: 'fan', name: 'FAN', burst: 3, rate: 0.085, spread: 2.6, kick: 0.45, after: 0.5 }] },
  smg:     { name: 'RUST-9 SMG', short: 'SMG', dmg: 17, rate: 0.075, mag: 32, reload: 1.7, spread: 0.075, range: 42, auto: true, pellets: 1, ammo: 'smg', sound: 'smg', shake: 0.15, mode: 'auto',
    modes: [{ id: 'semi', name: 'SEMI', burst: 1, rate: 0.12, spread: 0.6, kick: 0.22 }, { id: 'burst', name: 'BURST', burst: 3, rate: 0.065, spread: 0.85, kick: 0.2, after: 0.3 }, { id: 'auto', name: 'AUTO', burst: 0, rate: 0.075, spread: 1, kick: 0.18 }] },
  shotgun: { name: 'SAWN-OFF', short: 'SHOTGUN', dmg: 14, rate: 0.75, mag: 2, reload: 1.9, spread: 0.2, range: 22, auto: false, pellets: 8, ammo: 'shells', sound: 'shotgun', shake: 0.6,
    modes: [{ id: 'buck', name: 'BUCK', burst: 1, rate: 0.75, spread: 1, kick: 0.8 }, { id: 'slug', name: 'SLUG', burst: 1, rate: 0.85, spread: 0.11, kick: 1.0, dmg: 82, pellets: 1, range: 40, round: 'slug' }] },
  // The Federal Remnant's issue rifle (systems/bases.js arms its sentries): reaches further and hits harder than the
  // SMG, fires slower. Generic by design: no make, no model.
  rifle:   { name: 'SERVICE RIFLE', short: 'RIFLE', dmg: 24, rate: 0.12, mag: 30, reload: 2.1, spread: 0.035, range: 68, auto: true, pellets: 1, ammo: 'rifle', sound: 'rifle', shake: 0.22, mode: 'auto',
    modes: [{ id: 'semi', name: 'SEMI', burst: 1, rate: 0.17, spread: 0.55, kick: 0.26 }, { id: 'burst', name: 'BURST', burst: 3, rate: 0.09, spread: 0.8, kick: 0.24, after: 0.35 }, { id: 'auto', name: 'AUTO', burst: 0, rate: 0.12, spread: 1, kick: 0.22 }] },
  // The original game's pistol and pump shotgun (game/proto3d/weapon.gd rows), at this engine's scale: its pistol hit for
  // 18 against a 9-a-pellet pump; here the revolver hits 38, so both scale by about two. The self-loader eats the SMG's
  // small fast rounds; the pump takes shells, five in the tube, a slower pump between shots than the sawn-off's two.
  auto:    { name: 'SELF-LOADER', short: 'AUTO', dmg: 22, rate: 0.17, mag: 12, reload: 1.2, spread: 0.04, range: 50, auto: false, pellets: 1, ammo: 'smg', sound: 'pistol', shake: 0.18, model: 'auto' },
  pump:    { name: 'PUMP SHOTGUN', short: 'PUMP', dmg: 15, rate: 0.95, mag: 5, reload: 2.4, spread: 0.16, range: 26, auto: false, pellets: 7, ammo: 'shells', sound: 'shotgun', shake: 0.55, model: 'pump' },
};

export class Combat {
  constructor(game) {
    this.g = game;
    this.seg = { x: 0, z: 0, dx: 0, dz: 0, dmg: 0, energy: 0, kind: null }; // segment()'s answer, reused
    this.inFlight = null; // the round (systems/ballistics.js) segment() is resolving: its speed picks the crack or the whiz
  }

  // Fire `wkey` from character `ch` along angle `ang`. Returns true if a shot left the barrel. `w`: the row as fired (the
  // player's fire mode, grip and recoil folded in by systems/arms.js); the table's row when not given. seed: replay a
  // recorded pull (systems/ballistics.js record: a remote page flies the same pellets); a new seed per pull otherwise.
  fire(ch, wkey, ang, w = WEAPONS[wkey], seed = null) {
    const g = this.g;
    if (ch.onDeck && !g.decks.muzzleClear(ch, ang)) return false; // inside a van or an RV: out of a window or a door only
    const fx = Math.sin(ang), fz = Math.cos(ang);
    // The round flies the body's centre line to the aim (so where you hit is what it always was); the gun you SEE sits
    // at the side (characters.js aim pose, data/arms.js CARRY), toed in to the same point, and the flash leaves its
    // muzzle: off the centre on the dominant hand, toward the aim point (or the target, or CARRY.toeInDefault m out).
    const mf = muzzleForward(w), ox = ch.x + fx * mf, oz = ch.z + fz * mf;
    const lat = carryLateral(ch, w), hs = ch.hand === 'L' ? -1 : 1;
    const dAim = ch.aimD ?? (ch.target ? Math.hypot(ch.target.x - ch.x, ch.target.z - ch.z) : CARRY.toeInDefault);
    const toe = ang + hs * Math.min(CARRY.toeInMax * Math.PI / 180, Math.atan2(lat, Math.max(0.5, dAim)));
    const mx = ch.x - hs * lat * Math.cos(ang) + Math.sin(toe) * mf, mz = ch.z + hs * lat * Math.sin(ang) + Math.cos(toe) * mf; // -x of the body: its right
    ch._mx = mx; ch._mz = mz; ch._shotAng = toe; // the gun's muzzle and line (the selftest's gun-at-the-side check)
    // Upstairs (world/storeys.js) the shot flies at that floor's height: its walls stop it, the floors' walls below and
    // above do not. On the street, ry = -1 and everything is as it was.
    const fy = ch.storey || ch.ug ? (ch.gy ?? 0) - (ch.storey?.y0 ?? (ch.ug ? g.under?.y0 ?? 0 : 0)) : 0, ry = fy > 0.5 || fy < -0.5 ? fy + 1.3 : -1; // below the street too (systems/underground.js)
    // Muzzle can't poke through a wall we're hugging.
    if (!g.statics.lineOfSight(ch.x, ch.z, ox, oz, RAY_SIGHT, ry)) return false;
    // Pressed against a window or a door, the barrel reaches past the glass, boards or leaf: the round
    // starts at the hand, so it still meets them.
    const hug = !g.statics.lineOfSight(ch.x, ch.z, ox, oz, RAY_SOLID, ry);
    if (ch === g.player) g.arms?.onShot(); // a shot raises the gun, whatever path fired it
    g.fx.flash(hug ? ox : mx, 1.5 + fy, hug ? oz : mz, w.pellets > 1 ? 2.2 : 1.4, 0.05);
    g.fx.light(ox, 1.8 + fy, oz, '#ffb35a', w.pellets > 1 ? 30 : 18, 0.07);
    g.audio.gun(w.sound, Math.hypot(ch.x - g.player.x, ch.z - g.player.z), g.pan(ch.x), ch); // ch: whose gun (their faction's recordings, data/audiosets.js)
    g.noise(ch.x, ch.z, 45, ch);
    g.ambient?.eject(ch, ang);
    g.ambient?.onShot(ch.x, ch.z);
    g.voice?.onShot(ch.x, ch.z, ch); // a calm line nearby is cut short; somebody close may shout (systems/voice.js)
    const sky = ch === g.player ? g.fauna?.skyShot(ch, ang) : null; // the mouse on a bird in the sky: the shot rises to it (systems/fauna.js skyAim)
    const lift = sky ? sky.slope : 0, ang0 = sky ? sky.ang : ang;
    // The pull's seed (systems/ballistics.js): every pellet's spread and reach rolls from it, so the record replays it.
    const B = g.ballistics, round = B ? B.rowKey(w) : w.ammo;
    if (B) { if (seed !== null) B.reseed(seed); else B.seed(ch, w.ammo, round, hug ? ch.x : ox, hug ? ch.z : oz, ang0, w.pellets); }
    for (let p = 0; p < w.pellets; p++) {
      const sp = w.spread * (ch === g.player ? (g.skills?.spreadMul ?? 1) * (g.needs?.sway ?? 1) : 1); // dexterity steadies the player's hands; tiredness and fever shake them
      const a = ang0 + ((B ? B.rand() : Math.random()) - 0.5) * 2 * sp;
      const reach = w.range * (0.85 + (B ? B.rand() : Math.random()) * 0.15), rise = lift ? lift + ((B ? B.rand() : Math.random()) - 0.5) * 2 * sp : 0;
      this.hitscan(ch, hug ? ch.x : ox, hug ? ch.z : oz, Math.sin(a), Math.cos(a), reach, w.dmg, w.ammo, rise, round);
    }
    return true;
  }

  // The shot's entry, one per pellet. ammo: what the round is (data/materials.js PUNCH: how hard it carries through
  // things); round: its flight row (data/ballistics.js ROUNDS; the ammo by default). A round with a row FLIES
  // (systems/ballistics.js: muzzle velocity, drag, drop, the shooter's car under it) and meets what is in its way when it
  // gets there, through segment() below. Without one (a vehicle mount, a shot up at a bird, ballistics off) it lands now,
  // segment by segment: a round that meets a wall goes on through it, glances off it or stops in it by what the wall is
  // made of (systems/materials.js); whatever it reaches after that it reaches with what is left.
  // slope: a round aimed up into the sky (m up a m out): it passes over people, cars and dogs once above head height.
  hitscan(shooter, ox, oz, dx, dz, range, dmg, ammo = null, slope = 0, round = ammo) {
    const g = this.g, M = g.materials;
    g.drones?.shotThrough(shooter, ox, oz, dx, dz, range, dmg); // a round passing under one of THEIR drones may take it (systems/drones.js)
    if (g.ballistics?.takes(round, slope)) { g.ballistics.launch(shooter, ox, oz, dx, dz, range, dmg, ammo, round); return; }
    let left = range, energy = dmg * (M ? M.punch(ammo) : 1);
    for (let seg = 0; seg < 4; seg++) {
      if (this.segment(shooter, shooter, ox, oz, dx, dz, left, dmg, energy, ammo, slope, true) !== 2) return;
      const o = this.seg;
      left -= Math.hypot(o.x - ox, o.z - oz);
      if (left < 0.5) return;
      ox = o.x; oz = o.z; dx = o.dx; dz = o.dz; dmg = o.dmg; energy = o.energy;
    }
  }

  // One straight run of a round, `left` m from (ox, oz) along (dx, dz): the first thing on it takes it. F: the floor it
  // was fired on (the shooter at the trigger; a round in flight keeps a copy). Returns 0 when it meets nothing (this.seg
  // at the run's end), 1 when it stops (this.seg: where, and seg.kind char | veh | dog | fauna | train | wall), 2 when it
  // goes on through or off a wall (this.seg: from where, which way, with what damage and energy).
  segment(shooter, F, ox, oz, dx, dz, left, dmg, energy, ammo = null, slope = 0, tracer = true) {
    const g = this.g, M = g.materials, over = slope > 0 ? 1.15 / slope : Infinity, out = this.seg;
    shooter = shooter ?? NOBODY; F = F ?? NOBODY;
    // Bullets go through window openings; glass, boards and a closed door stop them (systems/interiors.js).
    const fy = F.storey || F.ug ? (F.gy ?? 0) - (F.storey?.y0 ?? (F.ug ? g.under?.y0 ?? 0 : 0)) : 0, up = fy > 0.5 || fy < -0.5; // upstairs (or below): the round stays on that floor
    const down = up && fy > 0.5 && !F.ug; // up a building: its walls stop the round unless it leaves by a window hole or over the parapet
    let best = g.statics.raycast(ox, oz, dx, dz, left, RAY_BULLET, up ? fy + 1.3 : -1);
    const box = g.statics.hit.box, wnx = g.statics.hit.nx, wnz = g.statics.hit.nz;
    let target = null, kind = null;
    for (const c of g.chars) {
      if (c === shooter || !c.alive || c.inVehicle || c.hidden) continue;
      if (c.dive > 0.25 && Math.random() < 0.6) continue; // mid-air dive: most rounds miss
      if (c.underwater) continue;                          // bullets don't reach under water
      // through a floor: no (world/storeys.js) - except a round fired DOWN out of a window or over a parapet at someone
      // in the street (or another building), never at the floors of your own (WEB_CITYGEN.md §3.3)
      if (!g.storeys.sameFloor(F, c) && !(down && (c.gy ?? 0) - (F.storey?.y0 ?? 0) < fy - 1.6 && !c.ug && g.storeys.at(c.x, c.z) !== F.storey)) continue;
      const t = rayCircle(ox, oz, dx, dz, c.x, c.z, c.radius + 0.1, best);
      if (t >= 0 && t < best && t < over) { best = t; target = c; kind = 'char'; }
    }
    for (const v of g.vehicles) {
      if (up || v === shooter.inVehicle || v === shooter.firingFrom) continue; // the street's cars are a floor below
      if (target?.onDeck?.v === v && !g.decks.covered(v, target)) continue;   // a rider standing in its open bed: above its sides
      for (const s of [-1, 1]) {
        const cx = v.x + Math.sin(v.h) * v.len * 0.25 * s, cz = v.z + Math.cos(v.h) * v.len * 0.25 * s;
        const t = rayCircle(ox, oz, dx, dz, cx, cz, v.wid * 0.62, best);
        if (t >= 0 && t < best && t < over) { best = t; target = v; kind = 'veh'; }
      }
    }
    // A dog in the line of fire (systems/dogs.js) takes the round like anyone would.
    const dh = !up && g.dogs ? g.dogs.raycast(ox, oz, dx, dz, Math.min(best, over)) : null;
    if (dh) { best = dh.t; target = dh.dog; kind = 'dog'; }
    const fh = !up && g.fauna ? g.fauna.raycast(ox, oz, dx, dz, best, slope) : null; // an animal (systems/fauna.js); a bird in the sky at its height
    if (fh) { best = fh.t; target = fh.animal; kind = 'fauna'; }
    const sh = !up && g.sealife ? g.sealife.raycast(ox, oz, dx, dz, best) : null; // a shark's back at the surface, an arm of the deep one (systems/sealife.js)
    if (sh) { best = sh.t; target = sh.a; kind = 'sea'; this.seaArm = sh.arm; }
    if (g.train && !up && !shooter.onTrain && !target?.onTrain) {
      const th = g.train.raycast(ox, oz, dx, dz, best);
      if (th) { best = th.t; target = th.car; kind = 'train'; }
    }
    const hx = ox + dx * best, hz = oz + dz * best;
    out.x = hx; out.z = hz; out.dx = dx; out.dz = dz; out.dmg = dmg; out.energy = energy; out.kind = kind;
    // Near miss on the player: a round faster than sound CRACKS past (audio.crack), a slower one whispers (the whiz).
    if (shooter !== g.player && target !== g.player && g.player.alive) {
      const px = g.player.x - ox, pz = g.player.z - oz, along = px * dx + pz * dz;
      if (along > 0 && along < best && Math.abs(px * dz - pz * dx) < BL.nearMiss) {
        const P = this.inFlight, pan = g.pan(g.player.x + dx);
        if (P && P.sp > BL.sound && g.audio.crack) { g.ballistics.stats.cracks++; g.audio.crack(pan); }
        else { if (P) g.ballistics.stats.whispers++; g.audio.whiz(pan); }
      }
    }
    if (tracer) g.fx.tracer(ox, oz, hx, hz, 1.45 + fy);
    let o = null;
    if (kind === 'char') {
      this.damage(target, dmg, shooter === NOBODY ? null : shooter, dx, dz);
      if (shooter === g.player) g.skillsSys?.onHit();
    } else if (kind === 'veh') {
      g.fx.sparks(hx, 1, hz, -dx, -dz, 5);
      if (!g.garage?.absorb(target, hx, hz, dmg)) { // a plated face takes the round; a bare one lets it through
        g.vehiclesSys.damage(target, dmg * (target.armor ?? 0.5), shooter);
        g.carCombat.onBulletHit(target, shooter, dmg, dx, dz); // glass, then whoever's behind broken glass
        g.vehDamage.hit(target, hx, hz, dmg, 'bullet');        // dents, tyres, engine, tank
      }
      if (shooter === g.player) g.qol.hit(false);
    } else if (kind === 'dog') {
      g.dogs.hurt(target, dmg, shooter, dx, dz, 'bullet');
    } else if (kind === 'fauna') {
      g.fauna.hurt(target, dmg, shooter, dx, dz, 'bullet');
      if (shooter === g.player) { g.qol.hit(!target.alive); g.skillsSys?.onHit(); }
    } else if (kind === 'sea') {
      g.sealife.hurt(target, dmg, shooter, dx, dz, 'bullet', this.seaArm);
      if (shooter === g.player) g.qol.hit(!!target.dead);
    } else if (kind === 'train') {
      g.fx.sparks(hx, 1.6, hz, -dx, -dz, 4);
      g.train.hitCar(target, dmg, shooter);
    } else if (box?.op) {
      g.interiors.onBullet(box.op, hx, hz, dx, dz, dmg, shooter); // cracks glass, splinters boards, shoots locks
      // A door leaf is wood or steel: a round may go on through it (windows keep their own rules: they stop it).
      if (box.op.kind === 'leaf' && M) o = M.throughLeaf(box.op, ox, oz, dx, dz, best, g.interiors.nx, g.interiors.nz, dmg, energy, shooter, 1.4 + fy);
    } else if (box && M) {
      o = M.bullet(box, ox, oz, dx, dz, best, wnx, wnz, dmg, energy, shooter, 1.4 + fy, up ? fy + 1.3 : -1); // through, off or into it
    } else if (box) {
      g.fx.sparks(hx, 1.4 + fy, hz, wnx, wnz, 4);
      if (Math.random() < 0.3) g.audio.ricochet(g.pan(hx), Math.hypot(hx - g.player.x, hz - g.player.z));
      if (!up && Math.random() < 0.3) g.fx.decal(hx + wnx * 0.2, hz + wnz * 0.2, 0.3, '#1a1714');
    }
    if (!kind && !box) return 0;
    if (!o) { if (!kind) out.kind = 'wall'; return 1; }
    out.x = o.x; out.z = o.z; out.dx = o.dx; out.dz = o.dz; out.dmg = o.dmg; out.energy = o.energy; out.kind = 'wall';
    return 2;
  }

  // part: the body part the hit lands on (head | torso | arms | legs), else rolled from the cause (data/gear.js HIT_ODDS).
  damage(c, dmg, attacker, dx = 0, dz = 0, cause = 'bullet', part = null) {
    const g = this.g;
    if (!c.alive) {
      // Shooting corpses still sprays. Gratuitous, as ordered.
      g.fx.bloodSpray(c.x, 0.4 + (c.gy ?? 0), c.z, dx, dz, 6, 0.6);
      return;
    }
    if (c === g.player && (g.godMode || c.graceT > 0)) return; // just patched up at the clinic (main.js RESPAWN_GRACE)
    // Continuous damage (burning, drowning) is "quiet": no blood, no hit sound, no event spam.
    const quiet = cause === 'fire' || cause === 'drown';
    if (quiet) {
      if (c === g.player) { dmg *= (g.qol?.damageTaken() ?? 1) * (g.deep?.fx.damageMul ?? 1); c.sinceHit = 0; g.hud.hurt(dmg * 0.5); }
      c.hp -= dmg; c.lastAttacker = attacker ?? c.lastAttacker;
      if (cause === 'fire') { c.charred = Math.min(1, (c.charred ?? 0) + dmg / 90); if (Math.random() < 0.05) g.charR.paint(c); }
      if (c.hp <= 0) this.kill(c, attacker, dx, dz, cause);
      return;
    }
    // Worn armor eats its share first (systems/gear.js): the one place a hit is cut, for anyone wearing anything.
    if (g.gear && (c === g.player || c.worn)) { const s = g.gear.soak(c, cause, part); if (s.cut > 0) { if (c === g.player) g.gear.soaked += dmg * s.cut; dmg *= 1 - s.cut; } }
    if (c === g.player) { dmg *= (g.qol?.damageTaken() ?? 1) * (g.deep?.fx.damageMul ?? 1); c.sinceHit = 0; g.survival?.hurt(); g.emit('hurt', { amount: Math.round(dmg), by: attacker?.id ?? null, byFaction: attacker?.faction ?? null, cause, hp: Math.round(c.hp - dmg) }); }
    c.hp -= dmg;
    if (attacker === g.player && c !== g.player) g.feedback?.damage(c, dmg, part); // damage numbers (ui/feedback.js, a setting)
    c.lastAttacker = attacker;
    c.bleed = Math.min(1, c.bleed + dmg / 120);
    c.blood = Math.min(1, c.blood + dmg / 140);
    g.charR.paint(c); // clothes soak through
    if (c.inVehicle && !c.seatPose) {
      // Hit through a window: a little blood out of the window toward the attacker, not out of the roof.
      const ax = attacker ? attacker.x - c.x : -dx, az = attacker ? attacker.z - c.z : -dz, al = Math.hypot(ax, az) || 1;
      g.fx.bloodSpray(c.x + (ax / al) * 1.1, 1.3 + (c.gy ?? 0), c.z + (az / al) * 1.1, ax / al, az / al, 3, 0.5);
    } else if (cause === 'bash' || cause === 'glass') g.fx.bloodSpray(c.x, 1.4 + (c.gy ?? 0), c.z, dx, dz, 5, 0.6); // a bloody nose, glass cuts
    else {
      g.fx.bloodSpray(c.x, 1.3 + (c.gy ?? 0), c.z, dx, dz, cause === 'bullet' ? 10 : 18, cause === 'bullet' ? 1 : 1.4);
      if (cause === 'bullet') g.blood?.splash(c, dx, dz, dmg, c.hp <= 0); // onto the wall, door or car behind them (systems/blood.js)
    }
    g.audio.hit();
    if (c === g.player) g.hud.hurt(dmg);
    g.ai.onDamaged(c, attacker);
    if (attacker === g.player) g.qol.hit(c.hp <= 0);
    if (c.hp <= 0) this.kill(c, attacker, dx, dz, cause);
  }

  kill(c, attacker, dx, dz, cause) {
    if (cause === 'fire' || cause === 'drown') {
      // Burned or drowned: no blood bath, just the body (charred if it burned).
      const g = this.g;
      c.alive = false; c.hp = 0; c.deadTime = 0; c.speed = 0; c.aiming = false; c.burning = 0;
      if (cause === 'fire') { c.charred = 1; g.charR.paint(c); g.fx.decal(c.x, c.z, 1.6, '#151210'); }
      g.audio.death();
      if (c.npc && attacker !== g.player) { c.downedT = 45; g.emit('downed', { id: c.id, name: c.npc.name, backInSeconds: 45, by: attacker?.id ?? null }); }
      g.onKill(c, attacker, cause);
      return;
    }
    const g = this.g;
    c.alive = false;
    c.hp = 0;
    c.deadTime = 0;
    c.speed = 0;
    c.aiming = false;
    if (Math.hypot(dx, dz) > 0.1) c.face = Math.atan2(-dx, -dz); // feet toward the shooter
    g.fx.pool(c.x - dx * 0.8, c.z - dz * 0.8, 2.2 + Math.random() * 1.4);
    g.fx.bloodSpray(c.x, 1.0 + (c.gy ?? 0), c.z, dx, dz, 26, 1.3);
    if (cause === 'vehicle' || cause === 'explosion') g.fx.gibs(c.x, c.z, dx, dz, cause === 'explosion' ? 14 : 8);
    // Head pops: explosions, high-speed impacts, or a point-blank shotgun.
    const pointBlank = attacker && (WEAPONS[attacker.weapon]?.pellets ?? 1) > 1 && Math.hypot(attacker.x - c.x, attacker.z - c.z) < 5;
    if (cause === 'explosion' || (cause === 'vehicle' && Math.random() < 0.5) || pointBlank) {
      c.headless = true;
      c.neckSpray = 2.5;
      const hx = c.x - Math.sin(c.face) * 0.9, hz = c.z - Math.cos(c.face) * 0.9;
      g.fx.gibs(hx, hz, dx, dz, 10);
    }
    c.blood = 1;
    g.charR.paint(c);
    g.audio.death();
    // Named characters are essential: if anyone but the player drops them they're only
    // downed — Doc Reyes gets them back on their feet a bit later. The player's kills stick.
    if (c.npc && (attacker !== g.player || c.npc.essential)) { c.downedT = 45; g.hud.toast(`${c.npc.name} is down — Doc Reyes will patch them up`, 'warn'); g.emit('downed', { id: c.id, name: c.npc.name, backInSeconds: 45, by: attacker?.id ?? null }); }
    g.onKill(c, attacker, cause); // without the cause every kill logged as 'bullet': no ROADKILL or BLOWN UP in the feed
  }
}
