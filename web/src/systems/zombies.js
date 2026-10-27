import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { outfit } from './characters.js';
import { INFECTED, CHOIR_SITES } from '../data/infected.js';
import { Wilds } from './wilds.js';

// The infected (canon: docs/design/THE_INFECTED.md - shamblers, and the rare sprinter; never "zombies" on screen). They hunt by smell (no line of sight needed), swarm to
// noise (gunfire, engines, horns), claw at cars until the glass gives, reach in for the
// driver, and latch onto slow vehicles. Night brings hordes; Rust Haven's wall keeps
// them out of town.

const SH = INFECTED.shambler, SP = INFECTED.sprinter, EC = INFECTED.echo, CH = INFECTED.choir;
const SMELL = SH.smell;    // metres: notice the living without seeing them
const BITE = SH.claw;
const CAP_NIGHT = 30;
// Ambient spawns (night hordes here, Dustwolf top-ups in main.js) stop this many slots short of the 160-character cap,
// so the director's events (hunters, raids, a herd drawn to the dead) are never starved by the background war.
export const AMBIENT_RESERVE = 16;
// Night hordes rise this far from the town's centre (its wall stands at 88 m: they used to spawn at the gates) and not in
// the first HORDE_QUIET game-seconds of a game.
const HORDE_MIN_R = 130, HORDE_QUIET = 180;

export class Zombies {
  constructor(game) {
    this.g = game;
    this.spawnT = 8;
    this.groanT = 3;
    this.enabled = true;
    this.choirs = [];       // the living Choir-Touched (their aura reaches the infected near them)
    this.sites = CHOIR_SITES.map((s) => ({ ...s, night: -1 }));
    this.counts = { bursts: 0, overheats: 0, echoStrikes: 0, hums: 0 };
    this.buildSites();
    // The Greyborn, the Grapevine, their traps and the hot ground (systems/wilds.js, docs/design/WEB_GREYBORN_GRAPEVINE.md).
    this.wilds = new Wilds(game);
    this.auraRing = null; // the ring on the ground (not this.aura: that is the method think() asks) round a living Choir-Touched (one mesh, shown only while one is near)
  }

  // The aura made visible: a faint ring on the ground at its 30 m reach, breathing with the hum. Without it a player could
  // not tell why the herd near the mast is faster (a review found the Choir-Touched read as 'a shambler with a pale head').
  showAura(dt) {
    const g = this.g, P = g.player;
    let q = null, bd = 120;
    for (const c of this.choirs) { if (!c.alive) continue; const d = Math.hypot(c.x - P.x, c.z - P.z); if (d < bd) { bd = d; q = c; } }
    if (!q) { if (this.auraRing) this.auraRing.visible = false; return; }
    if (!this.auraRing) {
      const geo = new THREE.RingGeometry(CH.aura - 0.6, CH.aura, 96); geo.rotateX(-Math.PI / 2);
      this.auraRing = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#b9c2a4', transparent: true, opacity: 0.18, depthWrite: false }));
      this.auraRing.renderOrder = 2;
      g.scene.add(this.auraRing);
    }
    this.auraRing.visible = true;
    this.auraRing.position.set(q.x, 0.06 + (q.gy ?? 0), q.z);
    const k = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(g.time * ((Math.PI * 2) / CH.humEvery)));
    this.auraRing.material.opacity = k;
  }

  // Every choir site has its anchor where you can see it: a dead relay mast, a rusted lattice tower with its beacon out.
  // One merged mesh (one draw call) and a small solid base; built after the streamer, so the island's golden hash and
  // the nav grids are not touched (a walker steps round a 3 m base).
  buildSites() {
    const g = this.g, geos = [], H = 22, seg = 6;
    const put = (x, y, z, sx, sy, sz) => { const b = new THREE.BoxGeometry(sx, sy, sz); b.translate(x, y, z); geos.push(b); };
    for (const s of this.sites) {
      for (let k = 0; k < seg; k++) {
        const y0 = (k / seg) * H, y1 = ((k + 1) / seg) * H, half = 1.5 - (1.2 * (k + 0.5)) / seg, t = 0.16;
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(s.x + dx * half, (y0 + y1) / 2, s.z + dz * half, t, y1 - y0, t); // the legs
        put(s.x, y1, s.z - half, half * 2, t, t); put(s.x, y1, s.z + half, half * 2, t, t); // the braces
        put(s.x - half, y1, s.z, t, t, half * 2); put(s.x + half, y1, s.z, t, t, half * 2);
      }
      put(s.x + 0.5, H - 2, s.z, 0.25, 1.8, 1.6); // a dish gone sideways
      put(s.x, H + 0.5, s.z, 0.35, 1, 0.35); // the dead beacon
      g.statics.addCentered(s.x, s.z, 3, 3, 'mast', H);
    }
    if (!geos.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 0.9, metalness: 0.3 }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.scene.add(mesh);
  }

  // A shambler - or, with runner, a SPRINTER: the same name, the same walk, until it breaks (data/infected.js).
  spawn(x, z, runner = Math.random() < 0.2) {
    const g = this.g;
    const c = g.addChar({ x, z, faction: 'zombie', weapon: null, hp: runner ? SP.hp : SH.hp, colors: outfit('zombie'), name: SH.name, flag: g.randomFlag(Math.random) });
    if (!c) return null;
    c.zSpeed = SH.speed[0] + Math.random() * (SH.speed[1] - SH.speed[0]);
    c.runner = runner;
    if (runner) { c.zkind = 'sprinter'; c.zs = { state: 'dormant', t: 0 }; }
    c.blood = 0.45 + Math.random() * 0.3;
    g.charR.paint(c);
    c.timer = Math.random() * 2;
    return c;
  }

  horde(x, z, count = 8, runners = 0.2, radius = 8) {
    const ids = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
      const c = this.spawn(x + Math.cos(a) * r, z + Math.sin(a) * r, Math.random() < runners);
      if (c) ids.push(c.id);
    }
    return ids;
  }

  // An ECHO at a place, or a CHOIR-TOUCHED (data/infected.js). post: where it stands (an Echo works within reach of it;
  // the Choir-Touched faces it: the site's anchor).
  spawnKind(kind, x, z, post = null) {
    const g = this.g, row = INFECTED[kind];
    if (!row || kind === 'shambler' || kind === 'sprinter') return this.spawn(x, z, kind === 'sprinter');
    const colors = outfit('zombie');
    if (kind === 'choir') colors.skin = '#b9bab0'; // ash-pale: one stands wrong
    const c = g.addChar({ x, z, faction: 'zombie', weapon: null, hp: row.hp, colors, name: row.name, flag: g.randomFlag(Math.random) });
    if (!c) return null;
    c.zSpeed = 0; c.zkind = kind; c.post = post ?? { x, z }; c.blood = 0.3; c.timer = 0;
    if (kind === 'choir') this.choirs.push(c);
    g.charR.paint(c);
    g.emit('infectedSpawned', { id: c.id, kind });
    return c;
  }

  // A sprinter breaks: the burst (6 s at 9 m/s, claws x1.4), the overheat (3 s bent double, wheezing), dormant again.
  burst(c, why = 'moved') {
    if (c.zkind !== 'sprinter' || c.zs.state !== 'dormant' || !c.alive) return false;
    c.zs.state = 'burst'; c.zs.t = SP.burst; c.zs.base = c.zs.base ?? c.zSpeed; c.zSpeed = SP.burstSpeed; c.crouch = false;
    c.name = 'Sprinter'; // it has shown what it is (the tag says so until it is a walker again)
    this.counts.bursts++;
    this.g.emit('sprinterBurst', { id: c.id, why });
    return true;
  }
  sprinter(c, dt) {
    const Z = c.zs, g = this.g;
    if (Z.state === 'dormant') {
      if (c.zSpeed > SH.speed[1] + 0.5) { c.zSpeed = SH.speed[0] + 0.35; c.name = SH.name; } // a save taken mid-burst: back to the walk
      if ((Z.t -= dt) > 0) return false; // re-arming
      // Someone living moving faster than a walk inside its ear (a car counts: it is loud and fast). Listened for about
      // seven times a second, staggered, not every frame: a scan of everyone per sprinter per frame showed in the stress A/B.
      if ((Z.scan = (Z.scan ?? Math.random() * 0.15) - dt) > 0) return false;
      Z.scan = 0.15;
      for (const o of g.chars) {
        if (!o.alive || o.faction === 'zombie' || o === c) continue;
        const ox = o.inVehicle ? o.inVehicle.x : o.x, oz = o.inVehicle ? o.inVehicle.z : o.z;
        if (Math.abs(ox - c.x) > SP.ear || Math.abs(oz - c.z) > SP.ear || Math.hypot(ox - c.x, oz - c.z) > SP.ear) continue;
        const sp = o.inVehicle ? g.vehiclesSys.speed(o.inVehicle) : o.speed ?? 0;
        if (sp > SP.trigger) { this.burst(c, o === g.player ? 'you ran' : 'someone ran'); if (!c.ztarget) c.ztarget = o; break; }
      }
      return false;
    }
    if ((Z.t -= dt) > 0) {
      if (Z.state === 'overheat') { c.speed = 0; c.crouch = true; if (Math.random() < dt * 0.8) g.audio.wheeze?.(g.pan(c.x), Math.hypot(c.x - g.player.x, c.z - g.player.z)); return true; }
      return false;
    }
    if (Z.state === 'burst') { Z.state = 'overheat'; Z.t = SP.overheat; c.zSpeed = Z.base; this.counts.overheats++; g.emit('sprinterOverheat', { id: c.id }); return true; }
    Z.state = 'dormant'; Z.t = SP.rearm; c.crouch = false; c.name = SH.name; // stood up: a shambler again
    return false;
  }

  // The player is watching c: close, in sight, and looking its way (the Echo's rule).
  watched(c) {
    const g = this.g, P = g.player;
    if (!P.alive) return false;
    const dx = c.x - P.x, dz = c.z - P.z, d = Math.hypot(dx, dz);
    if (d > EC.watch) return false;
    const look = Math.atan2(g.aim.x - P.x, g.aim.z - P.z), to = Math.atan2(dx, dz);
    let da = Math.abs(to - look); if (da > Math.PI) da = Math.PI * 2 - da;
    return da < (EC.cone * Math.PI) / 180 && (P.inVehicle ? g.los(P.x, P.z, c.x, c.z) : g.sees(P, c));
  }

  // The Echo: at something, never advancing on anyone; works only unobserved, frozen mid-motion while watched.
  echo(c, dt) {
    const g = this.g, I = g.interiors, P = g.player, post = c.post;
    c.aiming = false;
    // Its phrase, on a loop: the approach tell.
    c.phraseT = (c.phraseT ?? Math.random() * EC.phrase) - dt;
    if (c.phraseT <= 0) {
      c.phraseT = EC.phrase;
      const d = Math.hypot(c.x - P.x, c.z - P.z);
      if (d < EC.hear) { g.feedback?.floater(c.x, c.z, EC.line, 'bark'); g.audio.murmur?.(g.pan(c.x), d); }
    }
    if (this.watched(c)) { c.speed = 0; c.frozen = true; return; } // hands still on the wire (handsUp stays as it was: mid-motion)
    c.frozen = false;
    // What it is at: the nearest boarded window or locked door to its post.
    if (!c.work || (c.work.W && c.work.W.state !== 'boarded') || (c.work.door && !c.work.door.locked) || (c.work.B && c.work.B.hp <= 0)) {
      c.work = null;
      let bd = EC.reach;
      // A Phoenix ring nest's boards (systems/residents.js): a barricade with hp on its household's record.
      const B = post.boards;
      if (B && B.hp > 0) { const d = Math.hypot(B.x - post.x, B.z - post.z); if (d < bd) { bd = d; c.work = { B, x: B.x + B.nx * 0.85, z: B.z + B.nz * 0.85 }; } }
      for (const W of I?.windows ?? []) if (W.state === 'boarded') { const d = Math.hypot(W.x - post.x, W.z - post.z); if (d < bd) { bd = d; c.work = { W, x: W.x + W.nx * 0.85 * (W.boardSide || 1), z: W.z + W.nz * 0.85 * (W.boardSide || 1) }; } }
      for (const door of I?.doors ?? []) if (door.locked) { const d = Math.hypot(door.x - post.x, door.z - post.z); if (d < bd) { bd = d; c.work = { door, x: door.x + door.nx * 0.9, z: door.z + door.nz * 0.9 }; } }
    }
    const tx = c.work ? c.work.x : post.x, tz = c.work ? c.work.z : post.z, d = Math.hypot(tx - c.x, tz - c.z);
    if (d > 0.4) { c.handsUp = false; g.ai.move(c, tx - c.x, tz - c.z, 1.1, dt); return; }
    c.speed = 0;
    c.handsUp = !!c.work; // at its window or door: hands on it
    if (!c.work) return;
    const at = c.work.W ?? c.work.door ?? c.work.B;
    c.face = Math.atan2(at.x - c.x, at.z - c.z);
    c.workT = (c.workT ?? 0) - dt;
    if (c.workT > 0) return;
    if (c.work.B) { c.workT = EC.workEvery; c.work.B.hp = Math.max(0, c.work.B.hp - EC.boards); if (c.res) c.res.rec.dirty = true; this.counts.echoStrikes++; g.emit('echoStrike', { id: c.id, boards: c.res?.rec.id ?? 'ring', boardHp: Math.round(c.work.B.hp) }); }
    else if (c.work.W) { c.workT = EC.workEvery; I.damageBoards(c.work.W, EC.boards, c); this.counts.echoStrikes++; g.emit('echoStrike', { id: c.id, window: c.work.W.id, boardHp: Math.round(c.work.W.boardHp) }); }
    else { c.workT = EC.kickEvery; I.kick(c.work.door, c); this.counts.echoStrikes++; g.emit('echoStrike', { id: c.id, door: c.work.door.id, locked: c.work.door.locked }); }
  }

  // The Choir-Touched: stands at its site facing the anchor, hums; its aura is read by every infected near it.
  choir(c, dt) {
    const g = this.g, P = g.player, post = c.post;
    c.speed = 0; c.aiming = false;
    if (Math.hypot(c.x - post.x, c.z - post.z) > 2.5) { g.ai.move(c, post.x - c.x, post.z - c.z, 1.1, dt); return; }
    c.face = Math.atan2((post.ax ?? post.x) - c.x, (post.az ?? post.z + 1) - c.z);
    c.zt = (c.zt ?? 0) - dt;
    if (c.zt <= 0) { c.zt = 0.5; c.ztarget = this.pickTarget(c); } // its loudest target: everyone in the aura shares it
    c.humT = (c.humT ?? Math.random() * CH.humEvery) - dt;
    if (c.humT <= 0) { c.humT = CH.humEvery; const d = Math.hypot(c.x - P.x, c.z - P.z); if (d < CH.hum) { g.audio.hum?.(g.pan(c.x), d / CH.hum); this.counts.hums++; } }
  }

  // The Choir's aura at c: { mul, target } (mul 1 and no target outside every aura).
  aura(c) {
    let best = null, bd = CH.aura;
    for (const q of this.choirs) { if (!q.alive || q === c) continue; const d = Math.hypot(q.x - c.x, q.z - c.z); if (d < bd) { bd = d; best = q; } }
    c.auraMul = best ? CH.speed : 1;
    return best;
  }

  // Noise draws every infected in range toward it.
  onNoise(x, z, r) {
    for (const c of this.g.chars) {
      if (c.faction !== 'zombie' || !c.alive) continue;
      // A sprinter breaks at a noise inside its ear.
      if (c.zkind === 'sprinter' && Math.abs(c.x - x) < SP.ear && Math.abs(c.z - z) < SP.ear && Math.hypot(c.x - x, c.z - z) <= Math.min(r, SP.ear)) this.burst(c, 'noise');
      if (c.ztarget || c.zkind === 'echo' || c.zkind === 'choir' || c.wild) continue;
      if (Math.abs(c.x - x) > r || Math.abs(c.z - z) > r) continue;
      if (c.res) c.res.roused = this.g.time + 20; // a nest's own (systems/residents.js): roused, it goes to look
      c.wx = x + (Math.random() - 0.5) * 6; c.wz = z + (Math.random() - 0.5) * 6; c.timer = 10;
    }
  }

  pickTarget(c) {
    let best = null, bd = SMELL;
    for (const o of this.g.chars) {
      if (!o.alive || o.faction === 'zombie' || o.hidden || o.underwater || o === c) continue; // no scent under water
      const ox = o.inVehicle ? o.inVehicle.x : o.x, oz = o.inVehicle ? o.inVehicle.z : o.z;
      let d = Math.abs(ox - c.x) + Math.abs(oz - c.z);
      if (o === this.g.player) d *= 0.8 * (this.g.deep?.fx.scentMul ?? 1); // the living hero smells best (unwashed: worse; fieldcraft: better)
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // A choir site wakes once a night, when the player comes near and it is out of their sight: one Choir-Touched facing the
  // anchor, a herd of shamblers standing round it. force: now, whatever the hour (agents, checks).
  wakeSite(s, force = false) {
    const g = this.g, P = g.player, night = g.society?.day ?? Math.floor(g.time / 1440);
    if (!force) {
      if (g.sky.night < 0.6 || s.night === night || !this.enabled) return null;
      const d = Math.hypot(s.x - P.x, s.z - P.z);
      if (d > s.near || d < Math.max(60, (g.viewR ?? 0) + 10)) return null;
    }
    if (this.choirs.some((q) => q.alive && q.site === s.id && g.chars.includes(q))) return null; // a removed one (a clean-up) doesn't hold the site
    s.night = night;
    const q = this.spawnKind('choir', s.x + 2.6, s.z + 2.6, { x: s.x + 2.6, z: s.z + 2.6, ax: s.x, az: s.z }); // at the mast's foot, facing it
    if (!q) return null;
    q.site = s.id;
    const n = CH.herd[0] + Math.floor(Math.random() * (CH.herd[1] - CH.herd[0] + 1));
    const herd = this.horde(s.x, s.z, n, 0.15, 9);
    g.emit('choirSite', { site: s.id, choir: q.id, herd: herd.length });
    return { choir: q.id, herd };
  }

  // Per-zombie brain (called from AI.update instead of the normal state machine).
  think(c, dt) {
    const g = this.g;
    if (c.grabbing) return; // CarCombat drives grabbers
    c.aiming = false;
    // One of the infected made by anything but spawn() (an old save, a content pack) still needs a pace,
    // or it walks at NaN m/s and its NaN spreads through crowd separation. 0 is a real pace (one staged
    // to stand still); only a missing or broken one is repaired.
    if (!(c.zSpeed >= 0)) c.zSpeed = SH.speed[0] + 0.35;
    if (!Number.isFinite(c.timer)) c.timer = 0;
    if (c.wild && this.wilds.think(c, dt)) return; // the Greyborn and the hot ground's creatures have their own minds
    if (c.zkind === 'echo') { this.echo(c, dt); return; }
    if (c.zkind === 'choir') { this.choir(c, dt); return; }
    if (c.runner && !c.zs) { c.zkind = 'sprinter'; c.zs = { state: 'dormant', t: 0 }; } // an old save's runner
    if (c.zkind === 'sprinter' && this.sprinter(c, dt)) return; // overheated: bent double, going nowhere
    const amp = this.choirs.length ? this.aura(c) : (c.auraMul = 1, null);
    const pace = c.zSpeed * c.auraMul;
    c.zt = (c.zt ?? 0) - dt;
    if (c.zt <= 0) {
      c.zt = 0.4 + Math.random() * 0.3;
      if (amp?.ztarget?.alive) c.ztarget = amp.ztarget; // the amplifier's loudest target is everyone's
      else if (!c.ztarget || !c.ztarget.alive || Math.hypot(c.ztarget.x - c.x, c.ztarget.z - c.z) > SMELL * 1.4) c.ztarget = this.pickTarget(c);
    }
    const t = c.ztarget;
    if (!t) {
      // Shamble around; drift toward the last noise.
      c.timer -= dt;
      if (c.timer <= 0) { c.wx = c.x + (Math.random() - 0.5) * 16; c.wz = c.z + (Math.random() - 0.5) * 16; c.timer = 4 + Math.random() * 5; }
      if (Math.hypot(c.wx - c.x, c.wz - c.z) > 0.8) g.ai.move(c, c.wx - c.x, c.wz - c.z, Math.min(1.3, pace), dt);
      else c.speed = 0;
      return;
    }
    if (t.inVehicle) {
      const v = t.inVehicle;
      // Distance to the car's body (chain of discs), not its centre.
      let gap = Infinity;
      for (const d of g.vehiclesSys.discs(v)) gap = Math.min(gap, Math.hypot(d.x - c.x, d.z - c.z) - d.r);
      if (gap < 0.95) { c.speed = 0; g.carCombat.zombieAttack(c, v, dt); }
      else g.ai.move(c, v.x - c.x, v.z - c.z, pace, dt);
      return;
    }
    const d = Math.hypot(t.x - c.x, t.z - c.z);
    // Upstairs or down (world/storeys.js): no bite through a floor; they find the stairs.
    if (!g.storeys.sameFloor(c, t)) {
      const wp = g.storeys.steer(c, t.x, t.z, t.gy ?? 0);
      if (wp) g.ai.move(c, wp.x - c.x, wp.z - c.z, pace, dt);
      else g.ai.move(c, t.x - c.x, t.z - c.z, pace, dt);
      return;
    }
    if (d < 1.25) {
      c.speed = 0;
      c.face = Math.atan2(t.x - c.x, t.z - c.z);
      c.cool -= dt;
      if (c.cool <= 0) {
        c.cool = 0.85 + Math.random() * 0.3;
        g.combat.damage(t, BITE * (c.zs?.state === 'burst' ? SP.claw : 1), c, (t.x - c.x) / (d || 1), (t.z - c.z) / (d || 1), 'bite');
        if (t === g.player && t.alive && !g.godMode) g.survival?.bitten(); // BITE FEVER (canon: never a turn)
        if (t.grabbing && t === g.player && Math.random() < 0.3) g.carCombat.letGo(t, 0.5);
      }
    } else {
      g.ai.move(c, t.x - c.x, t.z - c.z, pace, dt);
      // The unarmed living run.
      if (!t.weapon && t !== g.player && d < 12 && t.flee <= 0) { t.flee = 5; t.fleeX = c.x; t.fleeZ = c.z; }
    }
  }

  update(dt) {
    const g = this.g;
    this.wilds.update(dt); // its own switch (wilds.enabled): hushing the herd leaves the Greyborn and the Grapevine alone
    if (!this.enabled) return;
    // Groans from the infected nearby.
    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = 1.5 + Math.random() * 2.5;
      let near = null, nd = 30;
      for (const c of g.chars) if (c.faction === 'zombie' && c.alive) { const d = Math.hypot(c.x - g.player.x, c.z - g.player.z); if (d < nd) { nd = d; near = c; } }
      if (near) g.audio.groan?.(g.pan(near.x), nd);
    }
    // The Choir: the dead fall out of the list (their aura and hum die with them); a site wakes at night, out of sight.
    for (let i = this.choirs.length - 1; i >= 0; i--) if (!this.choirs[i].alive || !g.chars.includes(this.choirs[i])) { const q = this.choirs[i]; this.choirs.splice(i, 1); if (!q.alive) g.emit('choirSilenced', { id: q.id }); }
    this.sites.forEach((s) => this.wakeSite(s));
    this.showAura(dt);
    // Engines and horns carry: driving fast drags the dead after you.
    const pv = g.player.inVehicle;
    if (pv && g.vehiclesSys.speed(pv) > 5 && Math.random() < dt) this.onNoise(pv.x, pv.z, 60);
    // Night hordes, spawned out of sight, never inside Rust Haven's wall.
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 7;
    const night = g.sky.night;
    const alive = g.chars.reduce((n, c) => n + (c.faction === 'zombie' && c.alive ? 1 : 0), 0);
    if (night < 0.6) {
      // Daylight: the far-off infected crawl back into the ruins.
      for (const c of [...g.chars]) if (c.faction === 'zombie' && c.alive && !c.grabbing && !c.res && !c.wild && Math.hypot(c.x - g.player.x, c.z - g.player.z) > Math.max(140, (g.viewR ?? 0) + 20) && Math.random() < 0.3) g.removeChar(c);
      return;
    }
    if (alive >= CAP_NIGHT || g.freeSlots.length <= AMBIENT_RESERVE || g.time < HORDE_QUIET) return; // the director's events need room too; a new arrival gets a quiet start
    const px = g.player.x, pz = g.player.z;
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2, r = Math.max(55, (g.viewR ?? 0) + 8) + Math.random() * 55; // out of sight at any zoom
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (Math.max(Math.abs(x), Math.abs(z)) < HORDE_MIN_R || Math.max(Math.abs(x), Math.abs(z)) > 440) continue; // out past the gates, not at them
      if (!g.nav.foot.free(x, z)) continue;
      this.horde(x, z, 3 + Math.floor(Math.random() * 4), 0.15, 5);
      g.emit('hordeSpawned', { x: Math.round(x), z: Math.round(z) });
      break;
    }
  }
}
