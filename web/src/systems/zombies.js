import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { layerMesh } from '../engine/depthlayers.js';
import { outfit } from './characters.js';
import { INFECTED, CHOIR_SITES, FOOTSTEPS, INSIDE, BREEDS } from '../data/infected.js';
import { HIT_ODDS } from '../data/gear.js';
import { HEADSHOT } from '../data/deaths.js';
import { BREED_ANSWERS, WARNINGS } from '../data/hordes.js';
import { Wilds } from './wilds.js';
import { EchoMind } from './echomind.js';

// The infected (canon: docs/design/THE_INFECTED.md - shamblers, and the rare sprinter; never "zombies" on screen). They hunt by smell (no line of sight needed), swarm to
// noise (gunfire, engines, horns), claw at cars until the glass gives, reach in for the
// driver, and latch onto slow vehicles. Night brings hordes; Rust Haven's wall keeps
// them out of town.

const SH = INFECTED.shambler, SP = INFECTED.sprinter, EC = INFECTED.echo, CH = INFECTED.choir;
const BS = BREED_ANSWERS.sprinter, BE = BREED_ANSWERS.echo, WG = WARNINGS.groan; // what each breed demands (data/hordes.js)
const wrapA = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const D2R = Math.PI / 180;
const rowOf = (c) => INFECTED[c.zkind] ?? SH; // a plain shambler has no zkind
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
    this.counts = { bursts: 0, overheats: 0, echoStrikes: 0, hums: 0, remembered: 0, forgot: 0, thumps: 0, doorsBroken: 0, crawlers: 0, lunges: 0, falls: 0, lights: 0, fireFled: 0, called: 0 };
    this.buildSites();
    // The Greyborn, the Grapevine, their traps and the hot ground (systems/wilds.js, docs/design/WEB_GREYBORN_GRAPEVINE.md).
    this.wilds = new Wilds(game);
    this.minds = new EchoMind(game, this); // the smart Echo: stalks, lures, lays traps, learns (systems/echomind.js)
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
      layerMesh(this.auraRing, 'ring'); // engine/depthlayers.js
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
    c.blood = 0.15 + Math.random() * 0.45; // stained, not all soaked: the clothes underneath still tell one from another
    g.charR.paint(c);
    c.timer = Math.random() * 2; c._zhp = c.hp;
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
    c.zSpeed = 0; c.zkind = kind; c.post = post ?? { x, z }; c.blood = 0.3; c.timer = 0; c._zhp = c.hp;
    if (kind === 'choir') this.choirs.push(c);
    g.charR.paint(c);
    g.emit('infectedSpawned', { id: c.id, kind });
    return c;
  }

  // A sprinter breaks: the scream, then the run (9 m/s, claws x1.4) for as long as it has you, 6 s more once it has lost
  // you, the overheat (3 s bent double, wheezing), dormant again.
  burst(c, why = 'moved') {
    if (c.zkind !== 'sprinter' || c.zs.state !== 'dormant' || !c.alive) return false;
    // It SCREAMS first (BREED_ANSWERS.sprinter.windup: the tell, the moment to step aside), then charges.
    c.zs.state = 'windup'; c.zs.t = BS.windup; c.zs.base = c.zs.base ?? c.zSpeed; c.crouch = false;
    c.name = 'Sprinter'; // it has shown what it is (the tag says so until it is a walker again)
    this.counts.bursts++; this.counts.screams = (this.counts.screams ?? 0) + 1;
    const g = this.g, P = g.player, d = Math.hypot(c.x - P.x, c.z - P.z);
    if (d < WARNINGS.scream.range) { const A = g.audio; A?.count?.('scream'); if (!A?.sample?.('sprinter', 'attack', { dist: d, pan: g.pan(c.x), range: WARNINGS.scream.range })) A?.burst?.({ dur: 0.55, freq: 2300, type: 'bandpass', q: 3, vol: Math.max(0.02, 0.22 * (1 - d / WARNINGS.scream.range)), decay: 0.5, pitchDrop: 0.6, pan: g.pan(c.x) }); }
    g.emit('sprinterBurst', { id: c.id, why });
    g.emit('sprinterScream', { id: c.id, dist: Math.round(d), windup: BS.windup });
    return true;
  }
  sprinter(c, dt) {
    const Z = c.zs, g = this.g;
    if ((Z.state === 'windup' || Z.state === 'burst') && this.leap(c)) return true;
    if (Z.state === 'windup') {
      const t = c.zsee?.alive ? c.zsee : c.ztarget?.alive ? c.ztarget : null;
      if ((Z.t -= dt) > 0) { c.speed = 0; c.handsUp = true; if (t) c.face = Math.atan2((t.inVehicle?.x ?? t.x) - c.x, (t.inVehicle?.z ?? t.z) - c.z); return true; } // reared back, screaming
      // The charge: locked on where the target stood at the end of the scream; it runs straight past that spot by
      // BS.overshoot m before it can turn (a step aside and it goes by).
      c.handsUp = false; Z.state = 'burst'; Z.t = SP.burst; Z.run = 0; c.zSpeed = SP.burstSpeed;
      const m = !t && this.fresh(c) ? c.zm : null; // broke at a noise: at where it heard it
      const tx = t ? (t.inVehicle?.x ?? t.x) : m ? m.x : c.x + Math.sin(c.face), tz = t ? (t.inVehicle?.z ?? t.z) : m ? m.z : c.z + Math.cos(c.face);
      c.zhead = Math.atan2(tx - c.x, tz - c.z); c.zlock = { x: tx, z: tz, past: false };
      return false;
    }
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
    if (Z.state === 'burst') { // committed: the clock only runs once it has lost you (its own senses: c.zsee), or when it is spent
      if (c.zsee?.alive) Z.t = SP.burst;
      if ((Z.run = (Z.run ?? 0) + dt) > SP.chase) Z.t = 0;
    }
    if ((Z.t -= dt) > 0) {
      if (Z.state === 'overheat') { c.speed = 0; c.crouch = true; if (Math.random() < dt * 0.8) g.audio.wheeze?.(g.pan(c.x), Math.hypot(c.x - g.player.x, c.z - g.player.z)); return true; }
      return false;
    }
    if (Z.state === 'burst') { Z.state = 'overheat'; Z.t = SP.overheat; c.zSpeed = Z.base; c.zlock = null; this.counts.overheats++; g.emit('sprinterOverheat', { id: c.id }); return true; }
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
    // It COPIES what it heard (BREED_ANSWERS.echo): the noise comes back from where it stands, and the dead round it walk
    // to the copy. A stealth problem: fight loud near one and it doubles the crowd.
    if (c.ecopy && (c.ecopy.t -= dt) <= 0) {
      const r = c.ecopy.r; c.ecopy = null;
      this._echoing = true;
      this.onNoise(c.x, c.z, r, 'echo');
      g.citygen?.overrun?.onNoise?.(c.x, c.z, r / 2);
      this._echoing = false;
      this.counts.echoCopies = (this.counts.echoCopies ?? 0) + 1;
      const d = Math.hypot(c.x - P.x, c.z - P.z);
      if (d < 90) { g.audio.murmur?.(g.pan(c.x), Math.min(25, d * 0.4)); g.feedback?.floater(c.x, c.z, c.ecopyWhat ?? 'BANG', 'bark'); }
      g.emit('echoCopied', { id: c.id, r: Math.round(r), what: c.ecopyWhat ?? 'noise' });
    }
    // Its phrase, on a loop: the approach tell. Hunting you it keeps quiet (its lure is its only voice), except lying in
    // wait at a door, where the phrase calls the dead round it to that door (a choke: systems/echomind.js).
    const em = c.em, hunting = em && em.state !== 'work', trap = em?.state === 'ambush' ? em.door : null;
    c.phraseT = (c.phraseT ?? Math.random() * EC.phrase) - dt;
    if (c.phraseT <= 0 && hunting && !trap) c.phraseT = EC.phrase;
    if (c.phraseT <= 0) {
      c.phraseT = EC.phrase;
      const d = Math.hypot(c.x - P.x, c.z - P.z);
      if (d < EC.hear) { g.feedback?.floater(c.x, c.z, EC.line, 'bark'); g.audio.murmur?.(g.pan(c.x), d); }
      // The phrase calls: the infected in earshot that know of nothing better come to where it works (they heard it).
      const wx = trap ? trap.x : c.work ? c.work.x : c.x, wz = trap ? trap.z : c.work ? c.work.z : c.z;
      for (const o of g.chars) {
        if (o === c || !o.alive || o.faction !== 'zombie' || o.zkind === 'echo' || o.zkind === 'choir' || o.wild || o.zsee || this.fresh(o)) continue;
        if (Math.abs(o.x - c.x) > EC.call || Math.abs(o.z - c.z) > EC.call || Math.hypot(o.x - c.x, o.z - c.z) > EC.call) continue;
        this.remember(o, wx + (Math.random() - 0.5) * 3, wz + (Math.random() - 0.5) * 3, 'echo'); this.counts.called++;
        g.emit('infectedCalled', { id: o.id, by: c.id, x: +wx.toFixed(1), z: +wz.toFixed(1) });
      }
    }
    if (this.minds.think(c, dt)) return; // it knows of you: it hunts (echomind.js); else it works its door
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
    if (d > (c.work ? 1.5 : 0.4)) { c.handsUp = false; g.ai.move(c, tx - c.x, tz - c.z, 1.1, dt); return; } // within arm's reach of what it works (a frame can hold it a metre off)
    c.speed = 0;
    c.handsUp = !!c.work; // at its window or door: hands on it
    if (!c.work) return;
    const at = c.work.W ?? c.work.door ?? c.work.B;
    c.face = Math.atan2(at.x - c.x, at.z - c.z);
    c.workT = (c.workT ?? 0) - dt;
    if (c.workT > 0) return;
    if (c.work.B) { c.workT = EC.workEvery; c.work.B.hp = Math.max(0, c.work.B.hp - EC.boards); if (c.res) c.res.rec.dirty = true; this.counts.echoStrikes++; g.emit('echoStrike', { id: c.id, boards: c.res?.rec.id ?? 'ring', boardHp: Math.round(c.work.B.hp) }); }
    else if (c.work.W) { c.workT = EC.workEvery; I.damageBoards(c.work.W, EC.boards, c); this.counts.echoStrikes++; g.emit('echoStrike', { id: c.id, window: c.work.W.id, boardHp: Math.round(c.work.W.boardHp) }); }
    else { c.workT = EC.door.every; this.thump(c.work.door, c, EC.door.dmg); this.counts.echoStrikes++; g.emit('echoStrike', { id: c.id, door: c.work.door.id, locked: c.work.door.locked }); }
  }

  // The Choir-Touched: stands at its site facing the anchor, hums; its aura is read by every infected near it.
  choir(c, dt) {
    const g = this.g, P = g.player, post = c.post;
    c.speed = 0; c.aiming = false;
    if (Math.hypot(c.x - post.x, c.z - post.z) > 2.5) { g.ai.move(c, post.x - c.x, post.z - c.z, 1.1, dt); return; }
    c.face = Math.atan2((post.ax ?? post.x) - c.x, (post.az ?? post.z + 1) - c.z);
    c.zt = (c.zt ?? 0) - dt;
    if (c.zt <= 0) { c.zt = 0.5; c.ztarget = this.pickTarget(c); } // what it perceives: everyone in the aura shares it
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

  // ---- SENSES and MEMORY (law 6: nobody knows what they weren't told; docs/design/WEB_ZOMBIES.md §3.1) ---------------
  // Each of the infected keeps ONE last-known spot (c.zm: where, when, how it learned it, of whom). It walks there, searches
  // round it, and forgets. It never reads where anyone truly is: only what it saw, heard or smelled this sense tick.
  mem(c) { return c.zm ?? (c.zm = { x: 0, z: 0, t: -1e9, src: null, who: null, searchT: 0, sx: 0, sz: 0, sT: 0 }); }
  remember(c, x, z, src, who = null) {
    const m = this.mem(c);
    m.x = x; m.z = z; m.t = this.g.time; m.src = src; m.who = who?.id ?? null; m.searchT = 0; m.sT = 0;
    this.counts.remembered++;
  }
  forget(c) { const m = c.zm; if (!m || m.src === null) return; m.t = -1e9; m.src = null; m.who = null; this.counts.forgot++; this.g.emit('infectedForgot', { id: c.id }); }
  // Fresh: worth walking to (and searching round) still.
  fresh(c) { const m = c.zm, S = rowOf(c).sense; return !!m && m.src !== null && this.g.time - m.t < S.memory + S.search; }
  // How far o's own feet carry right now (FOOTSTEPS): a run, a walk, a crouch; prone and standing are silent.
  steps(o) {
    if (o.inVehicle || o.prone) return 0;
    if (o.swim) return FOOTSTEPS.swim;
    const sp = o.speed ?? 0;
    if (sp < 0.3) return FOOTSTEPS.stand;
    if (o.crouch) return FOOTSTEPS.crouch;
    return sp > FOOTSTEPS.runAt ? FOOTSTEPS.run : FOOTSTEPS.walk;
  }
  // Lit at night: your flashlight on, a driven car's headlights, standing in a fire's glow.
  lit(o) {
    const g = this.g;
    if (o.inVehicle) return !!o.inVehicle.driver && !o.inVehicle.dead;
    if (o === g.player && (g.flashMat?.opacity ?? 0) > 0.05) return true;
    for (const f of g.throwables?.fires ?? []) if (Math.abs(f.x - o.x) < f.r + 6 && Math.abs(f.z - o.z) < f.r + 6) return true;
    return false;
  }
  // One sense tick: the nearest of the living it can see (cone, range by light, the stance's spotting rule, line of
  // sight), hear (their footsteps) or smell. Writes its memory; sets c.zsee (null: nobody right now) and c.zhow.
  sense(c, R = rowOf(c)) {
    const g = this.g, S = R.sense, P = g.player, night = (g.sky?.night ?? 0) > 0.55;
    const fx = Math.sin(c.face ?? 0), fz = Math.cos(c.face ?? 0), cone = Math.cos(Math.min(180, S.cone) * D2R);
    const maxR = Math.max(S.lit, S.sight, FOOTSTEPS.run * S.steps, S.smell * 1.25);
    let best = null, bs = Infinity, how = null;
    for (const o of g.chars) {
      if (!o.alive || o.faction === 'zombie' || o.hidden || o.underwater || o === c) continue;
      if ((o.ug ?? null) !== (c.ug ?? null)) continue; // nor through the earth over a level below
      const v = o.inVehicle, ox = v ? v.x : o.x, oz = v ? v.z : o.z, dx = ox - c.x, dz = oz - c.z;
      if (dx > maxR || dx < -maxR || dz > maxR || dz < -maxR) continue;
      const d = Math.hypot(dx, dz);
      if (d > maxR || d >= bs) continue;
      let k = null;
      if (!v && d < S.smell * (o === P ? 1.25 * (g.deep?.fx.scentMul ?? 1) : 1)) k = 'smell'; // the living hero smells best
      else if (d < this.steps(o) * S.steps) k = 'sound';
      else {
        let r = night ? (this.lit(o) ? S.lit : S.night) : S.sight;
        if (o === P) r *= g.gear?.seenMul?.() ?? 1;
        if (!v && g.stance) r = g.stance.seenRange(o, r, 0.6, c.x, c.z, c); // crouch 0.6; prone 0.25, hidden in grass past 12 m (D2)
        if (d < r && (d < S.near || (dx * fx + dz * fz) / (d || 1) > cone) && (v ? g.los(c.x, c.z, ox, oz) : g.sees(c, o))) k = 'sight';
      }
      if (k) { best = o; bs = d; how = k; }
    }
    c.zsee = best; c.zhow = how;
    if (best) { const v = best.inVehicle; this.remember(c, v ? v.x : best.x, v ? v.z : best.z, how, best); }
    return best;
  }
  // At night, with nothing better: a light it can see (your flashlight, headlights, a burning flare, a fire).
  seekLight(c, R) {
    const g = this.g, L = R.light;
    if (!L || (g.sky?.night ?? 0) <= 0.55) return false;
    const P = g.player, Q = this._lq ?? (this._lq = { x: 0, z: 0, d: 0 });
    Q.d = L;
    if (P.alive && !P.inVehicle && !P.ug && (g.flashMat?.opacity ?? 0) > 0.05 && Math.abs(P.x - c.x) < L && Math.abs(P.z - c.z) < L) this.lightAt(c, P.x + Math.sin(P.face) * 6, P.z + Math.cos(P.face) * 6); // the beam's pool, a little ahead
    for (const v of g.vehicles) if (v.driver && !v.dead && Math.abs(v.x - c.x) < L && Math.abs(v.z - c.z) < L) this.lightAt(c, v.x, v.z);
    for (const p of g.gadgets?.list ?? []) if (p.lit > 0 && Math.abs(p.x - c.x) < L && Math.abs(p.z - c.z) < L) this.lightAt(c, p.x, p.z);
    for (const f of g.throwables?.fires ?? []) if (Math.abs(f.x - c.x) < L && Math.abs(f.z - c.z) < L) this.lightAt(c, f.x, f.z);
    if (Q.d >= L) return false;
    this.remember(c, Q.x, Q.z, 'light'); this.counts.lights++;
    return true;
  }
  lightAt(c, x, z) { const Q = this._lq, d = Math.hypot(x - c.x, z - c.z); if (d < Q.d && d > 3 && this.g.los(c.x, c.z, x, z)) { Q.d = d; Q.x = x; Q.z = z; } }
  // The nearest fire it keeps from (patches, burning cars), refreshed on the sense tick: c.zfire = {x,z,r} or null.
  nearFire(c, R) {
    const g = this.g, pad = R.fire ?? 0;
    c.zfire = null;
    if (!pad) return;
    for (const f of g.throwables?.fires ?? []) {
      if (Math.abs(f.x - c.x) > f.r + pad + 4 || Math.abs(f.z - c.z) > f.r + pad + 4) continue;
      c.zfire = c._zf ?? (c._zf = { x: 0, z: 0, r: 0 }); c.zfire.x = f.x; c.zfire.z = f.z; c.zfire.r = f.r; return;
    }
    for (const v of g.vehicles) {
      if (!(v.onFire > 0 || v.burn > 0) || v.dead || Math.abs(v.x - c.x) > pad + 10 || Math.abs(v.z - c.z) > pad + 10) continue;
      c.zfire = c._zf ?? (c._zf = { x: 0, z: 0, r: 0 }); c.zfire.x = v.x; c.zfire.z = v.z; c.zfire.r = 3; return;
    }
  }
  // Steer (dx, dz) at pace, keeping out of the fire it fears: inside the fear ring it backs out, at its edge it goes round.
  go(c, dx, dz, pace, dt) {
    const F = c.zfire;
    if (F && c.zs?.state !== 'burst') {
      const fx = c.x - F.x, fz = c.z - F.z, fd = Math.hypot(fx, fz) || 1, keep = F.r + rowOf(c).fire;
      if (fd < keep) { if (!c.zfled) this.counts.fireFled++; c.zfled = true; this.g.ai.move(c, fx / fd, fz / fd, Math.max(pace, 1.6), dt); return; }
      c.zfled = false;
      const into = (dx * -fx + dz * -fz) / ((Math.hypot(dx, dz) || 1) * fd);
      if (fd < keep + 2.5 && into > 0.3) { const tx = -fz / fd, tz = fx / fd, s = tx * dx + tz * dz >= 0 ? 1 : -1; this.g.ai.move(c, tx * s, tz * s, pace, dt); return; }
    }
    this.g.ai.move(c, dx, dz, pace, dt);
  }

  // ---- doors and windows (Zomboid's thumping; an Echo's whole purpose) ------------------------------------------------
  // One thump on a locked door: `dmg` off its lock (planks and furniture are part of that hp); at 0 it bursts open.
  thump(door, c, dmg) {
    const g = this.g, I = g.interiors;
    door.lockHp -= dmg;
    g.audio.thud?.(g.pan(door.x));
    this.counts.thumps++;
    g.noise(door.x, door.z, 16, c); // the others hear it (and come)
    if (door.lockHp > 0) { g.emit('doorThump', { door: door.id, by: c.id, kind: c.zkind ?? 'shambler', lockHp: Math.round(door.lockHp) }); return false; }
    if (door.barricade) { door.barricade = null; if (g.gadgets) g.gadgets.barred = g.gadgets.barred.filter((b) => b.door !== door); }
    I.unlock(door, 'thumped', c, true);
    this.counts.doorsBroken++;
    g.emit('doorBroken', { door: door.id, by: c.id, kind: c.zkind ?? 'shambler' });
    return true;
  }
  // Stuck against something on the way to what it wants: the locked door or boarded window it is pressed against.
  blocker(c) {
    const I = this.g.interiors;
    let best = null, bd = 2.4;
    for (const d of I?.doors ?? []) { if (!d.locked || (d.ug ?? null) !== (c.ug ?? null)) continue; const k = Math.abs(d.x - c.x) + Math.abs(d.z - c.z); if (k < bd) { bd = k; best = d; } }
    for (const W of I?.windows ?? []) { if (W.state !== 'boarded') continue; const k = Math.abs(W.x - c.x) + Math.abs(W.z - c.z); if (k < bd) { bd = k; best = W; } }
    return best;
  }
  // Work the thing it is stuck at while it still wants past it: a thump every door.every s.
  work(c, R, dt) {
    const B = c.zblock;
    const win = B?.kind === 'window';
    if (!B || (win ? B.state !== 'boarded' : !B.locked)) { c.zblock = null; c.handsUp = false; return false; }
    c.speed = 0; c.handsUp = true; c.face = Math.atan2(B.x - c.x, B.z - c.z);
    c.zthT = (c.zthT ?? Math.random() * R.door.every) - dt;
    if (c.zthT > 0) return true;
    c.zthT = R.door.every;
    if (!win) { if (this.thump(B, c, R.door.dmg)) { c.zblock = null; c.handsUp = false; } }
    else { this.g.interiors.damageBoards(B, R.door.dmg * 1.5, c); this.counts.thumps++; }
    return true;
  }

  // ---- hurt: legs, falls (from ai.onDamaged) --------------------------------------------------------------------------
  // The part is c.hitPart when the shooter knows it (a one-shot field: BALLISTICS or a check sets it before the hit),
  // else rolled from HIT_ODDS as every other hit in the engine is. Legs gone: a CRAWLER. A hard hit: down, then up.
  onHurt(c, attacker) {
    const g = this.g, R = rowOf(c);
    const dmg = Math.max(0, (c._zhp ?? c.maxHp ?? c.hp) - c.hp); c._zhp = c.hp;
    let part = c.hitPart; c.hitPart = null;
    if (!part) { const o = HIT_ODDS.bullet; let u = Math.random(); part = 'torso'; for (const k in o) { if ((u -= o[k]) <= 0) { part = k; break; } } }
    c._hit = part; // the death library's clip reads it (systems/deaths.js)
    // A HEADSHOT drops it clean (data/deaths.js HEADSHOT): whatever its hp, it folds where it stood.
    if (part === 'head' && c.alive && c.hp > 0 && dmg >= HEADSHOT.min && HEADSHOT.causes.includes(c._hitCause)) { c.hp = 0; this.counts.headshots = (this.counts.headshots ?? 0) + 1; g.emit('headshot', { id: c.id, kind: c.zkind ?? 'shambler' }); return; }
    if (c.zkind === 'echo') this.minds.hurt(c, attacker); // it learns to keep further off
    if (attacker && attacker !== c && attacker.alive && !c.zsee) {
      // It knows which way the hit came from, not who or how far: a spot up to 20 m back along it.
      const dx = attacker.x - c.x, dz = attacker.z - c.z, d = Math.hypot(dx, dz) || 1, k = Math.min(d, 20) / d;
      this.remember(c, c.x + dx * k, c.z + dz * k, 'hurt');
    }
    if (!R.legs || !c.alive) return;
    if (c.hp > 0 && !c.wild) g.deaths?.limbHit(c, part, dmg, c._hitCause, 0, 0, attacker); // limbs come off; a leg gone and it crawls
    if (part === 'legs' && !c.crawl) { c.zlegs = (c.zlegs ?? R.legs) - dmg; if (c.zlegs <= 0) this.crawler(c, 'legs'); }
    if (!c.crawl && R.fall && dmg >= R.fall.dmg && Math.random() < R.fall.chance && !(c.knockT > 0)) {
      c.knockT = c.knockMax = R.fall.getUp; c.zrise = true; this.counts.falls++;
      g.emit('infectedFell', { id: c.id, getUp: R.fall.getUp });
    }
  }
  crawler(c, why) {
    const R = rowOf(c);
    if (c.crawl) return;
    c.crawl = true; c.zSpeed = R.crawl; c.crouch = false; c.prone = true; c.proneT = 0; c.zlegs = 0;
    if (c.zs) { c.zs.state = 'dormant'; c.zs.t = 1e9; } // a sprinter with no legs runs nowhere
    this.counts.crawlers++;
    this.g.emit('infectedCrawler', { id: c.id, why });
  }

  // Noise: everyone of the infected in reach of it HEARS it (x their row's hear) and, knowing of nothing better (nobody in
  // sight), remembers roughly where it was (a heard spot is off by sense.scatter m).
  onNoise(x, z, r, src = 'sound') {
    const g = this.g;
    for (const c of g.chars) {
      if (c.faction !== 'zombie' || !c.alive || c.ug) continue; // below the street a noise travels its own corridors (systems/underground.js)
      // An Echo hears it and will give it back (never its own copy, nor another Echo's: one echo, not a chain).
      if (c.zkind === 'echo' && !this._echoing && !c.ecopy && r >= BE.minR && g.time >= (c.ecopyAt ?? 0) && Math.abs(c.x - x) < BE.hear && Math.abs(c.z - z) < BE.hear && Math.hypot(c.x - x, c.z - z) < BE.hear) { c.ecopy = { t: BE.delay, r: r * BE.gain }; c.ecopyAt = g.time + BE.every; c.ecopyWhat = r >= 60 ? 'BANG' : r >= 25 ? 'CRACK' : 'TAP'; }
      // A sprinter breaks at a noise inside its ear, or at a loud one (a shot, an engine) from as far as it hears it.
      if (c.zkind === 'sprinter' && !c.crawl) { const hr = r >= SP.wake ? r * SP.sense.hear : Math.min(r, SP.ear); if (Math.abs(c.x - x) <= hr && Math.abs(c.z - z) <= hr && Math.hypot(c.x - x, c.z - z) <= hr) this.burst(c, 'noise'); }
      if (c.zsee || c.zkind === 'echo' || c.zkind === 'choir' || c.wild) continue;
      const S = rowOf(c).sense, rr = r * S.hear;
      if (Math.abs(c.x - x) > rr || Math.abs(c.z - z) > rr || Math.hypot(c.x - x, c.z - z) > rr) continue;
      if (c.res) c.res.roused = g.time + 20; // a nest's own (systems/residents.js): roused, it goes to look
      this.remember(c, x + (Math.random() - 0.5) * 2 * S.scatter, z + (Math.random() - 0.5) * 2 * S.scatter, src);
      c.wx = c.zm.x; c.wz = c.zm.z; c.timer = 10;
    }
  }

  // The nearest of the living the Choir-Touched perceives (its own senses: it is an amplifier, not an oracle).
  pickTarget(c) { return this.sense(c, rowOf(c)); }

  // Who is inside a building when you come to it, by its kind (data/infected.js INSIDE; Zomboid's lesson). b: { x, z, w,
  // d, kind }. Spawns on the street storey, never in view. Returns the ids.
  occupy(b, rng = Math.random) {
    const g = this.g, B = INSIDE[b.kind] ?? INSIDE.default, ids = [];
    const n = B.n[0] + Math.floor(rng() * (B.n[1] - B.n[0] + 1));
    for (let i = 0; i < n; i++) {
      let u = rng(), kind = 'shambler';
      for (const k of BREEDS) { if ((u -= B.mix[k] ?? 0) <= 0) { kind = k; break; } }
      const x = b.x + (rng() - 0.5) * Math.max(1, (b.w ?? 6) - 2), z = b.z + (rng() - 0.5) * Math.max(1, (b.d ?? 6) - 2);
      if (g.nav?.foot && !g.nav.foot.free(x, z)) continue;
      const c = kind === 'echo' ? this.spawnKind('echo', x, z) : this.spawn(x, z, kind === 'sprinter');
      if (c) { c.inside = b.id ?? true; ids.push(c.id); }
    }
    return ids;
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

  // The sprinter's charge (BREED_ANSWERS.sprinter): straight along its locked heading until it is `overshoot` m past the
  // spot it locked, then it skids round toward (tx, tz) for `skid` s (slowed, turning as fast as it needs: at least
  // `steer` rad/s) and locks a new line at (tx, tz): where it perceives its target now. A dodge costs it time, not you.
  charge(c, tx, tz, pace, dt) {
    const L = c.zlock, hx = Math.sin(c.zhead), hz = Math.cos(c.zhead);
    if (!L.past && (L.x - c.x) * hx + (L.z - c.z) * hz < -BS.overshoot) { L.past = true; L.skid = BS.skid; this.counts.overshoots = (this.counts.overshoots ?? 0) + 1; this.g.emit('sprinterOvershoot', { id: c.id }); }
    if (L.past) {
      const want = wrapA(Math.atan2(tx - c.x, tz - c.z) - c.zhead), m = Math.max(BS.steer, Math.abs(want) / Math.max(L.skid, dt)) * dt;
      c.zhead += Math.max(-m, Math.min(m, want));
      if ((L.skid -= dt) <= 0) { L.x = tx; L.z = tz; L.past = false; c.zhead = Math.atan2(tx - c.x, tz - c.z); } // round: a new line
      pace *= 0.35;
    }
    this.g.ai.move(c, Math.sin(c.zhead), Math.cos(c.zhead), pace, dt);
  }
  // A screaming or charging sprinter LEAPS onto a moving car inside BS.carLeap m, at any speed (a car is no answer to it).
  leap(c) {
    const g = this.g;
    if (c.grabbing || c.crawl || !g.carCombat) return null;
    for (const v of g.vehicles) {
      if (v.dead || !v.driver?.alive || g.vehiclesSys.speed(v) < 2) continue;
      if (Math.abs(v.x - c.x) > BS.carLeap + v.len || Math.abs(v.z - c.z) > BS.carLeap + v.len) continue;
      let gap = Infinity;
      for (const dd of g.vehiclesSys.discs(v)) gap = Math.min(gap, Math.hypot(dd.x - c.x, dd.z - c.z) - dd.r);
      if (gap > BS.carLeap) continue;
      if (g.carCombat.grab(c, v)) { c.handsUp = false; this.counts.leaps = (this.counts.leaps ?? 0) + 1; g.emit('sprinterLeap', { id: c.id, vehicle: v.id, speed: Math.round(g.vehiclesSys.speed(v)) }); return v; }
    }
    return null;
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
    if (c.zkind === 'sprinter' && !c.crawl && this.sprinter(c, dt)) return; // overheated: bent double, going nowhere
    const R = rowOf(c), S = R.sense;
    const amp = this.choirs.length ? this.aura(c) : (c.auraMul = 1, null);
    let pace = c.zSpeed * c.auraMul;
    // Up off the floor (a fall): whoever is inside its grab reach as it rises, it lunges at.
    if (c.zrise) { c.zrise = false; if (c.zsee?.alive && R.lunge && Math.hypot(c.zsee.x - c.x, c.zsee.z - c.z) < R.fall.grab + 1.25) { c.zlungeT = R.lunge.t; c.zlungeAt = g.time + R.lunge.cool; this.counts.lunges++; g.emit('infectedLunge', { id: c.id, from: 'floor' }); } }
    c.zt = (c.zt ?? 0) - dt;
    if (c.zt <= 0) {
      c.zt = 0.4 + Math.random() * 0.3;
      // Told: another system pointed it at someone (the director's bloody night, a sleeper's visitor, a burst). That is
      // one fix of where they were, carried as memory; from here it must sense them itself.
      const told = c.ztarget;
      if (told && told !== c.zsee && told.alive) this.remember(c, told.inVehicle ? told.inVehicle.x : told.x, told.inVehicle ? told.inVehicle.z : told.z, 'told', told);
      if (amp?.zsee?.alive) { c.zsee = amp.zsee; c.zhow = 'choir'; this.remember(c, amp.zm.x, amp.zm.z, 'choir', amp.zsee); } // the amplifier's loudest target is everyone's
      else this.sense(c, R);
      this.nearFire(c, R);
      if (!c.zsee && !this.fresh(c)) { this.forget(c); this.seekLight(c, R); }
      c.ztarget = c.zsee; // who it is after right now (only ever someone it perceives)
      // A sprinter that perceives one of the living (it saw them, heard their steps, smelled them) breaks and commits.
      if (c.zkind === 'sprinter' && !c.crawl && c.zsee?.alive && c.zs.state === 'dormant' && c.zs.t <= 0) this.burst(c, c.zsee === g.player ? 'saw you' : 'saw someone');
      // Stuck pressing at a locked door or a boarded window on its way: it works that.
      const moved = Math.abs(c.x - (c._zpx ?? 0)) + Math.abs(c.z - (c._zpz ?? 0));
      c._zpx = c.x; c._zpz = c.z;
      if (!c.zblock && this.fresh(c) && moved < 0.25 && (c.zwant ?? 0) > 1.2) c.zblock = this.blocker(c);
      else if (c.zblock && !this.fresh(c)) { c.zblock = null; c.handsUp = false; }
    }
    if (c.crawl) pace = R.crawl;
    if (c.zlungeT > 0) { c.zlungeT -= dt; pace = R.lunge.speed; }
    const t = c.zsee;
    if (!t || !t.alive) {
      if (c.zblock && this.work(c, R, dt)) return;
      const m = c.zm;
      if (m && m.src !== null && this.fresh(c)) {
        // To the last-known spot; there, search round it (sense.search s within searchR m); then forget.
        const dm = Math.hypot(m.x - c.x, m.z - c.z);
        if (m.searchT <= 0 && dm > 1.5) { c.zwant = dm; this.go(c, m.x - c.x, m.z - c.z, pace, dt); return; }
        m.searchT += dt; c.zwant = 0;
        if (m.searchT > S.search) { this.forget(c); return; }
        if ((m.sT -= dt) <= 0) { m.sT = 2 + Math.random() * 2; const a = Math.random() * Math.PI * 2, r = Math.random() * S.searchR; m.sx = m.x + Math.cos(a) * r; m.sz = m.z + Math.sin(a) * r; }
        if (Math.hypot(m.sx - c.x, m.sz - c.z) > 0.8) this.go(c, m.sx - c.x, m.sz - c.z, Math.min(1.3, pace), dt); else c.speed = 0;
        return;
      }
      // Shamble around; drift toward the last noise (wx/wz: a lure, a horde's road).
      c.zwant = 0;
      c.timer -= dt;
      if (c.timer <= 0) { c.wx = c.x + (Math.random() - 0.5) * 16; c.wz = c.z + (Math.random() - 0.5) * 16; c.timer = 4 + Math.random() * 5; }
      if (Math.hypot(c.wx - c.x, c.wz - c.z) > 0.8) this.go(c, c.wx - c.x, c.wz - c.z, Math.min(1.3, pace), dt);
      else c.speed = 0;
      return;
    }
    if (t.inVehicle) {
      const v = t.inVehicle;
      // Distance to the car's body (chain of discs), not its centre.
      let gap = Infinity;
      for (const d of g.vehiclesSys.discs(v)) gap = Math.min(gap, Math.hypot(d.x - c.x, d.z - c.z) - d.r);
      if (gap < 0.95 && !c.crawl) { c.speed = 0; g.carCombat.zombieAttack(c, v, dt); }
      else this.go(c, v.x - c.x, v.z - c.z, pace, dt);
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
    const reach = c.crawl ? 1.0 : 1.25;
    if (d < reach) {
      c.speed = 0; c.zwant = 0; c.zblock = null; c.handsUp = false;
      c.face = Math.atan2(t.x - c.x, t.z - c.z);
      c.cool -= dt;
      if (c.cool <= 0) {
        c.cool = 0.85 + Math.random() * 0.3;
        const k = (c.zs?.state === 'burst' ? SP.claw : 1) * (c.crawl ? 0.8 : 1);
        g.combat.damage(t, BITE * k, c, (t.x - c.x) / (d || 1), (t.z - c.z) / (d || 1), 'bite');
        if (t === g.player && t.alive && !g.godMode) g.survival?.bitten(); // BITE FEVER (canon: never a turn)
        if (t.grabbing && t === g.player && Math.random() < 0.3) g.carCombat.letGo(t, 0.5);
      }
    } else {
      // The last metres: a lunge at someone it can see (not a crawler, not mid-lunge, cooled down).
      const L = R.lunge;
      if (L && !c.crawl && c.zhow === 'sight' && d < L.at && d > 1.3 && !(c.zlungeT > 0) && g.time > (c.zlungeAt ?? 0)) { c.zlungeT = L.t; c.zlungeAt = g.time + L.cool; c.cool = 0; this.counts.lunges++; g.emit('infectedLunge', { id: c.id, at: t.id }); }
      if (c.zblock && this.work(c, R, dt)) return; // smelling you through the door it is pressed at
      c.zwant = d;
      if (c.zs?.state === 'burst' && c.zlock) this.charge(c, t.x, t.z, pace, dt);
      else this.go(c, t.x - c.x, t.z - c.z, pace, dt);
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
      // READABLE WARNINGS (data/hordes.js WARNINGS.groan): you hear them before you see them. The nearest you cannot see
      // inside its range groans (a positional sound); else the nearest you can.
      this.groanT = WG.every[0] + Math.random() * (WG.every[1] - WG.every[0]);
      const P = g.player;
      let near = null, nd = WG.range, hid = null, hd = WG.range;
      for (const c of g.chars) {
        if (c.faction !== 'zombie' || !c.alive || c.wild) continue;
        const dx = c.x - P.x, dz = c.z - P.z;
        if (dx > WG.range || dx < -WG.range || dz > WG.range || dz < -WG.range) continue;
        const d = Math.hypot(dx, dz);
        if (d < nd) { nd = d; near = c; }
        if (d < hd && !(P.inVehicle ? g.los(P.x, P.z, c.x, c.z) : g.sees(P, c))) { hd = d; hid = c; }
      }
      const q = hid ?? near, qd = hid ? hd : nd;
      if (q) {
        g.audio.groan?.(g.pan(q.x), qd * (32 / WG.range)); // heard to the row's range
        if (hid) this.counts.groansUnseen = (this.counts.groansUnseen ?? 0) + 1;
        g.emit('groanHeard', { id: q.id, dist: Math.round(qd), seen: !hid });
      }
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
