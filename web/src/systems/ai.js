import { WEAPONS } from './combat.js';
import { stridePhase } from './characters.js';
import { angleLerp } from '../engine/rng.js';
import { MAX_FACTIONS } from './factions.js';
import { TOWN_NIGHT } from '../data/survival.js';
import { LEAD } from '../data/ballistics.js';

const NO_BEDS = [];
// Floor spots tried around home, nearest first: a body lies along z (2 m), so rows sit 1.2 m apart across and 2.2 along.
const FLOOR_RING = [[0, 0], [1.2, 0], [-1.2, 0], [2.4, 0], [-2.4, 0], [0, 2.2], [0, -2.2], [1.2, 2.2], [-1.2, 2.2], [1.2, -2.2], [-1.2, -2.2], [3.6, 0], [-3.6, 0]];

// On-foot AI: wander, flee, fight. Cheap per-character state machine,
// target scans are staggered so 150 NPCs cost almost nothing.
export class AI {
  constructor(game) {
    this.floor = []; this.floorNight = -1; // tonight's floor spots (floorSpot)
    this.g = game;
    this.scanIdx = 0;
    this.tmp = { x: 0, z: 0 };
  }

  // Nobody c isn't hostile to stands in the line of fire to t (a review saw a townsman down the sheriff, and the sheriff
  // kill one of her own wardens, in the opening seconds): hold the shot and sidestep for a clear line instead.
  clearShot(c, t, ang, d) {
    const fx = Math.sin(ang), fz = Math.cos(ang);
    for (const o of this.g.chars) {
      // The cheap geometry first (in range, ahead, inside the corridor); who they are only for someone actually in it.
      // Asking hostile() of everyone on every shot showed in the stress profile.
      const ox = o.x - c.x, oz = o.z - c.z;
      if (Math.abs(ox) > d + 1 || Math.abs(oz) > d + 1) continue;
      const along = ox * fx + oz * fz;
      if (along <= 0.3 || along >= d) continue;
      if (Math.abs(ox * fz - oz * fx) >= (o.radius ?? 0.45) + 0.4) continue;
      if (o === c || o === t || !o.alive || o.inVehicle || o.hidden || (o.ug ?? null) !== (c.ug ?? null) || this.hostile(c, o)) continue; // a floor of earth between: not in the way
      return false;
    }
    return true;
  }

  hostile(a, b) {
    if (!a.alive || !b.alive || a === b) return false;
    if (b.captive || a.captive) return false; // tied up at a camp (systems/crew.js): nobody's fight until cut loose

    // The dead hunt every living thing; anyone armed (and the player) fights them.
    if (a.faction === 'zombie') return b.faction !== 'zombie';
    if (b.faction === 'zombie' || b.faction === 'grapevine') return !!a.weapon || a === this.g.player; // the Grapevine too (systems/grapevine.js)
    // Allies fight whoever the player fights.
    if (a.faction === 'ally') return b.faction === 'raider' || b.grudge === this.g.player || b.target === this.g.player;
    if (b.faction === 'ally' && a.faction === 'raider') return true;
    if (a.grudge === b) return true;
    if (a.vendetta && a.weapon && b === this.g.player) return true; // they remember what you did to theirs
    // Toward the player, standing decides (WEB_WORLD_MEMORY): a faction at hostile or worse shoots on sight, a
    // friendlier one holds fire; Rust Haven's bulls also answer to the wanted stars. NPC-vs-NPC rules stay below.
    // A sworn deputy (roles.js office) gets one star of slack from the bulls.
    const P = this.g.player, F = this.g.society?.factions, slack = this.g.roles?.offices.deputy ? 1 : 0;
    if (b === P && F && a.fi >= 0) return F.hostileToPlayer(a) || (a.faction === 'warden' && this.g.wanted > slack);
    // Soldiers (the Federal Remnant) go by their faction's relations: at war (≤ -50) means shoot on sight.
    if (a.faction === 'soldier') return !!F && a.fi >= 0 && b.fi >= 0 && F.rel[a.fi * MAX_FACTIONS + b.fi] <= -50;
    if (a.faction === 'raider') return b.faction !== 'raider';
    if (a.faction === 'warden') return b.faction === 'raider' || (b === this.g.player && this.g.wanted > slack);
    return false;
  }

  // quiet: the caller already recorded the deed (a carjack is not also an assault).
  onDamaged(c, attacker, quiet = false) {
    c.hitAt = this.g.time; // a resident hit in the last seconds is never demoted out from under you (systems/residents.js)
    if (c.faction === 'zombie') this.g.zombies?.onHurt(c, attacker === c ? null : attacker); // legs, falls, which way it came from (systems/zombies.js)
    if (c.sleeping) this.wake(c, 'hurt');
    if (!attacker || attacker === c || c === this.g.player) return;
    if (!quiet) this.g.society?.deeds.onHurt(c, attacker); // witnesses decide whether the law hears of it
    if (c.faction === 'zombie') return; // the dead don't flee; what they know of the attacker is zombies.onHurt's (law 6: a direction, not a position)
    if (c.faction !== attacker.faction || attacker === this.g.player) c.grudge = attacker;
    if (c.weapon) { c.target = attacker; c.state = 'fight'; }
    else { c.flee = 8; c.fleeX = attacker.x; c.fleeZ = attacker.z; }
    // Friends join in.
    for (const o of this.g.chars) {
      if (o === c || !o.alive || o.faction !== c.faction || !o.weapon || o === this.g.player) continue;
      if (Math.abs(o.x - c.x) + Math.abs(o.z - c.z) > 30) continue;
      if (attacker.faction === o.faction && attacker !== this.g.player) continue;
      o.grudge = attacker; o.target = attacker; o.state = 'fight';
    }
  }

  // Gunfire is heard: civilians scatter, fighters investigate.
  onNoise(x, z, r, src) {
    if (src?.weapon) this.g.tactics?.onShot(src); // rounds passing close pin people down (systems/tactics.js suppression)
    for (const c of this.g.chars) {
      if (!c.alive || c === this.g.player || c === src || c.inVehicle || c.ug) continue; // below the street: it never reaches them (systems/underground.js)
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > r) continue;
      if (c.sleeping) { if (d > r * TOWN_NIGHT.hearAsleep) continue; this.wake(c, 'a noise'); } // asleep: half an ear
      if (!c.weapon) { if (c.flee <= 0) { c.flee = 5 + Math.random() * 4; c.fleeX = x; c.fleeZ = z; } }
      else if (!c.target && src && this.hostile(c, src)) { c.target = src; c.state = 'fight'; }
    }
  }

  // ---- the town at night (data/survival.js TOWN_NIGHT) ------------------------------------------------------------
  sleeper(c) { return (c.faction === 'drifter' || (!!c.npc && c.faction !== 'warden')) && !c.follower && !c.baseId && !c.hunt && !!c.home; }
  night() { const h = this.g.sky.time; return h >= TOWN_NIGHT.from || h < TOWN_NIGHT.to; }
  // Which night it is (the one that began on this calendar day): a bed's claim holds only for tonight.
  nightId() { return (this.g.society?.day ?? 0) - (this.g.sky.time < TOWN_NIGHT.to ? 1 : 0); }

  // A bed within reach of home nobody has claimed tonight, else the floor at home.
  claimBed(c) {
    const n = this.nightId(), R = TOWN_NIGHT.bedR;
    let best = null, bd = R;
    for (const b of this.g.world.spawns.beds ?? NO_BEDS) {
      if (b.night === n && b.by && b.by !== c.id) continue; // somebody's tonight
      if (b.upstairs || b.ring) continue; // a mattress upstairs is a traveller's (world/storeys.js), and the Phoenix ring's are out past the walls (world/ring.js)
      const d = Math.hypot(b.x - c.home.x, b.z - c.home.z);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) { best.by = c.id; best.night = n; return best; }
    return this.floorSpot(c);
  }

  // No bed: the floor near home, a body's length clear of anyone else sleeping there tonight and of the walls.
  floorSpot(c) {
    const g = this.g, n = this.nightId();
    if (this.floorNight !== n) { this.floorNight = n; this.floor.length = 0; }
    for (let k = 0; k < FLOOR_RING.length; k++) {
      const x = c.home.x + FLOOR_RING[k][0], z = c.home.z + FLOOR_RING[k][1];
      let clear = !g.statics.pointBlocked(x, z, 0.45);
      for (let i = 0; clear && i < this.floor.length; i++) if (Math.abs(this.floor[i].x - x) < 1.1 && Math.abs(this.floor[i].z - z) < 2.1) clear = false;
      for (const b of g.world.spawns.beds ?? NO_BEDS) if (clear && Math.abs(b.x - x) < 1.1 && Math.abs(b.z - z) < 2.1) clear = false;
      if (!clear) continue;
      const spot = { x, z, bedY: 0, floor: true, face: 0 };
      this.floor.push(spot);
      return spot;
    }
    return { x: c.home.x, z: c.home.z, bedY: 0, floor: true, face: 0 }; // nowhere better: home it is
  }

  // Bedtime: walk to the bed (giving up after a while: the floor will do) and sleep; asleep, lie still. Someone who
  // stands at the bedside long enough wakes them (and they take it as the intrusion it is).
  toBed(c, dt, pd) {
    if (!c.bed) { c.bed = this.claimBed(c); c.bedT = 0; }
    c.speed = 0;
    if (!c.sleeping) {
      const b = c.bed, d = Math.hypot(b.x - c.x, b.z - c.z);
      c.bedT += dt;
      if (d > 0.6 && c.bedT < TOWN_NIGHT.giveUp) { this.move(c, b.x - c.x, b.z - c.z, 1.3, dt); return; }
      if (d <= 0.6) { c.x = b.x; c.z = b.z; c.face = b.face ?? c.face; c.bedY = b.bedY ?? 0; } else c.bedY = 0;
      c.sleeping = true; c.standT = 0; c.aiming = false;
      this.g.emit('npcSleep', { id: c.id, name: c.npc?.name ?? c.name, bed: !b.floor && d <= 0.6 });
      return;
    }
    if (pd < 1.6 && !this.g.player.inVehicle) {
      if ((c.standT += dt) > TOWN_NIGHT.wakeStand) {
        this.wake(c, 'someone at the bed');
        this.g.society?.deeds?.record('trespass', { target: c, x: this.g.player.x, z: this.g.player.z, m: 1, stars: 0 });
      }
    } else c.standT = 0;
  }

  wake(c, why = 'woke') {
    if (!c.sleeping) return;
    c.sleeping = false; c.bedY = 0;
    if (why !== 'dawn') c.restless = TOWN_NIGHT.restless;
    this.g.emit('npcWoke', { id: c.id, name: c.npc?.name ?? c.name, why });
  }

  move(c, dx, dz, speed, dt) {
    if (c.perch) { c.speed = 0; return; } // a sentry on a tower deck turns and shoots, but never steps off it
    if (c.ug && this.g.under) { // below the street: the level's own grid round its walls, a flight's pace (systems/underground.js)
      const w = this.g.under.waypoint(c, c.x + dx, c.z + dz);
      if (w) { dx = w.x - c.x; dz = w.z - c.z; }
      speed *= this.g.under.speedMul(c);
    }
    const len = Math.hypot(dx, dz);
    if (len < 0.001) { c.speed = 0; return; }
    dx /= len; dz /= len;
    if (c.detour > 0) {
      c.detour -= dt;
      const cs = Math.cos(c.detourA), sn = Math.sin(c.detourA);
      const ndx = dx * cs - dz * sn, ndz = dx * sn + dz * cs;
      dx = ndx; dz = ndz;
    }
    const px = c.x, pz = c.z;
    const t = this.tmp;
    t.x = c.x + dx * speed * dt; t.z = c.z + dz * speed * dt;
    // Stay out of deep water (zombies can't swim at all: the river is a moat against them).
    if (this.wades(c, t.x, t.z)) { c.speed = 0; c.stuck = (c.stuck || 0) + dt; return; }
    this.g.statics.resolveBody(t, c.radius, c); // doors swing open for them (never a locked one); upstairs, only their floor's walls
    c.x = t.x; c.z = t.z;
    this.g.standOn(c); // up a stair, onto a floor
    if (c.vault) return; // walked into a broken window while hunting: climbing through
    const moved = Math.hypot(c.x - px, c.z - pz);
    c.speed = moved / dt;
    if (moved < speed * dt * 0.3) {
      c.stuck = (c.stuck || 0) + dt;
      if (c.stuck > 0.35) { c.detour = 0.7; c.detourA = (Math.random() < 0.5 ? 1 : -1) * (1 + Math.random()); c.stuck = 0; }
    } else c.stuck = 0;
    if (!c.aiming) c.face = angleLerp(c.face, Math.atan2(dx, dz), Math.min(1, dt * 10));
    c.walk += stridePhase(c.speed, dt);
  }

  // Would stepping c to x,z take it into water it must not enter? The living won't wade in past
  // 1.2 m. The dead never go deeper once past 0.6 m: the rule used to be "don't cross the waterline",
  // so a crowd shoving one of the infected 1 cm past it freed it to walk out into the lake after its prey.
  wades(c, x, z) {
    const w = this.g.water;
    if (!w || (x <= 290 && x >= -464 && z >= -464 && z <= 464)) return false; // the island's water is all east of x 290; the streamed world's is anywhere
    const d = w.depthAt(x, z), d0 = w.depthAt(c.x, c.z);
    return c.faction === 'zombie' ? d > 0.6 && d > d0 : d > 1.2 && d0 <= 1.2;
  }

  scan(c) {
    let best = null, bd = c.faction === 'raider' ? 34 : 30;
    for (const o of this.g.chars) {
      if (!this.hostile(c, o) || o.hidden || o.underwater) continue; // dived under: out of sight
      const d = Math.abs(o.x - c.x) + Math.abs(o.z - c.z);
      // Crouching targets are harder to spot; smoke hides everyone.
      // A coat that breaks your outline (systems/gear.js seenMul): they have to be closer to pick you out.
      // Prone (systems/stance.js, D2): 0.25x in the open, unseen past 12 m in grass or cover, never past a deck's rail.
      const seenAt = o.prone && this.g.stance ? this.g.stance.seenRange(o, bd, 0.6, c.x, c.z, c) : bd * (o.crouch ? 0.6 : 1);
      if (d < seenAt * (o === this.g.player ? this.g.gear?.seenMul() ?? 1 : 1) && this.g.sees(c, o)) { bd = d; best = o; }
    }
    if (best) { c.target = best; c.state = 'fight'; c.react = 0.45 + Math.random() * 0.5; }
  }

  // ---- leading a moving target (docs/design/WEB_BALLISTICS.md §3.4) ------------------------------------------------
  // watch: every frame c SEES t (the same sight it shoots by). It keeps a velocity smoothed out of the positions it saw;
  // a new target, or half a second out of sight, starts the estimate over. The error it will lead with is rolled here
  // every 0.4 s (LEAD.err, a person's own leadErr, worse when suppressed), so the aim does not twitch frame to frame.
  watch(c, t, dt) {
    if (!(dt > 0) || !t) return;
    const W = (c._lead ??= { who: null, x: 0, z: 0, vx: 0, vz: 0, at: -1e9, age: 0, err: 1, errT: 0 });
    const tx = t.inVehicle ? t.inVehicle.x : t.x, tz = t.inVehicle ? t.inVehicle.z : t.z, now = this.g.time;
    if (W.who !== t || now - W.at > LEAD.forget) { W.who = t; W.x = tx; W.z = tz; W.vx = 0; W.vz = 0; W.at = now; W.age = 0; return; }
    const a = Math.min(1, dt / LEAD.smooth);
    W.vx += ((tx - W.x) / dt - W.vx) * a; W.vz += ((tz - W.z) / dt - W.vz) * a;
    W.x = tx; W.z = tz; W.at = now; W.age += dt;
    if ((W.errT -= dt) <= 0) { W.errT = 0.4; W.err = 1 + (Math.random() - 0.5) * 2 * (c.leadErr ?? LEAD.err) * (c.tac ? this.g.tactics.aimMul(c) : 1); }
  }

  // The heading to shoot along at t (seen at tx, tz) with a round of row `round`: where the velocity it watched puts them
  // when the round arrives (their velocity less the shooter's own car's, which the round inherits), off by its error.
  leadAngle(c, t, tx, tz, round) {
    const W = c._lead, B = this.g.ballistics;
    let ax = tx, az = tz;
    if (W && W.who === t && W.age > 0.15 && B?.on && round) {
      const pv = B.platformV(c), rvx = W.vx - (pv ? pv.vx : 0), rvz = W.vz - (pv ? pv.vz : 0);
      if (Math.hypot(rvx, rvz) >= LEAD.minSpeed) {
        let d = Math.hypot(tx - c.x, tz - c.z), lx = 0, lz = 0;
        for (let k = 0; k < 2; k++) {
          const tf = B.flightTime(round, d) ?? 0;
          lx = rvx * tf * W.err; lz = rvz * tf * W.err;
          const L = Math.hypot(lx, lz); if (L > LEAD.maxLead) { lx *= LEAD.maxLead / L; lz *= LEAD.maxLead / L; }
          d = Math.hypot(tx + lx - c.x, tz + lz - c.z);
        }
        ax = tx + lx; az = tz + lz;
      }
    }
    return Math.atan2(ax - c.x, az - c.z);
  }

  // Where c believes t is now, from what it last SAW (law 6, WEB_DEPTH_PLAN.md): the last sighting carried on along the
  // motion it saw, for at most LEAD.coast s (a man who ducked behind a wall is shot at where he was heading, not where he
  // is). With no sighting of t, (fx, fz): the caller's own last-known point. One object, reused.
  seenAt(c, t, fx, fz) {
    const W = c._lead, S = this._seen ??= { x: 0, z: 0, fresh: false };
    if (W && W.who === t) { const k = Math.min(LEAD.coast, Math.max(0, this.g.time - W.at)); S.x = W.x + W.vx * k; S.z = W.z + W.vz * k; S.fresh = this.g.time - W.at < 0.1; }
    else { S.x = fx; S.z = fz; S.fresh = false; }
    return S;
  }

  update(dt) {
    const g = this.g;
    const chars = g.chars;
    g.tactics?.beginFrame(); // the tactical plans this frame may run (systems/tactics.js: staggered, perFrame at most)
    // Stagger hostility scans: ~12 per frame.
    for (let k = 0; k < 12 && chars.length; k++) {
      this.scanIdx = (this.scanIdx + 1) % chars.length;
      const c = chars[this.scanIdx];
      if (c.alive && c.weapon && !c.target && c !== g.player && !c.inVehicle) this.scan(c);
    }

    for (const c of chars) {
      if (c === g.player) continue;
      // A follower riding as a passenger: their window (or the roof turret, data/decks.js TURRET_SEAT). The driver is the
      // vehicle AI's; everyone else in a seat just rides.
      if (c.inVehicle) { if (c.follower && c.alive && c.inVehicle.driver !== c && !c.crewRec) g.seats.followThink(c, dt); continue; }
      if (!c.alive) {
        c.deadTime += dt;
        if (c.downedT > 0 && (c.downedT -= dt) <= 0) {
          // Revive essential NPC at home.
          c.alive = true; c.hp = c.maxHp; c.headless = false; c.blood = 0.3; c.neckSpray = 0; c.bleed = 0;
          c.x = c.home.x; c.z = c.home.z; c.target = null; c.grudge = null;
          c.gy = 0; c.storey = null; this.g.standOn(c); // home is on the street floor, whatever floor they went down on (world/storeys.js)
          g.charR.paint(c); g.emit('revived', { id: c.id, name: c.npc.name });
          continue;
        }
        if (c.neckSpray > 0) {
          // Arterial spray from the neck stump, weakening over a couple of seconds.
          c.neckSpray -= dt;
          const nx = -Math.sin(c.face), nz = -Math.cos(c.face);
          if (Math.random() < dt * 40 * Math.min(1, c.neckSpray)) g.fx.spawn(0, c.x + nx * 0.85, 0.3, c.z + nz * 0.85, nx * 3 + (Math.random() - 0.5) * 2, 2 + Math.random() * 3 * c.neckSpray, nz * 3 + (Math.random() - 0.5) * 2, 1, 0.08, '#7a0808');
        }
        continue;
      }
      if (c.dragged) continue;
      if (c.knockT > 0) { c.knockT -= dt; c.speed = 0; c.aiming = false; continue; } // on the floor after a door to the face
      if (c.vault) { g.interiors.stepVault(c, dt); continue; }                       // climbing through a window
      if (c.leapT > 0) continue;                               // diving out of a car's way (Ambient moves them)
      if (c.cowerT > 0) { c.speed = 0; c.walk = (c.walk ?? 0) + dt; continue; } // hands up, shaking
      // Ordered to stand still (a staged scene, a test, a sentry post): no wander, no flight, same facing.
      // hold = true stays until cleared; a number counts down in seconds.
      if (c.hold) { if (c.hold !== true && (c.hold -= dt) <= 0) c.hold = 0; c.speed = 0; continue; }
      if (c.ugRole && g.under?.think(c, dt)) continue; // below the street: the holdout's posts and its drone (systems/underground.js)
      if (c.fauna) { g.regions?.think(c, dt); continue; } // an animal (systems/regions.js: FAUNA rows)
      if (c.faction === 'zombie') { if (!(c.res && g.residents?.thinkInfected(c, dt))) g.zombies.think(c, dt); continue; } // a nest's own (systems/residents.js) first
      if (c.gv) { g.grapevine.think(c, dt); continue; } // a Grapevine pack's own mind (systems/grapevine.js)
      if ((c.pullRec || c.barRole) && g.pulls?.think(c, dt)) continue; // a road person walks their shoulder; a barkeep keeps the bar (systems/pulls.js)
      if (c.crewRec && g.crew.think(c, dt)) continue; // your crew: orders, jobs, downed, drift (systems/crew.js)
      if (c.follower && c.inVehicle) { g.seats.followThink(c, dt); continue; }
      if (c.follower && !c.target && g.seats.followThink(c, dt)) continue;
      if (c.grabbing) { c.cool -= dt; continue; } // riding on a car: CarCombat drives them
      c.cool -= dt;
      if (c.reloading > 0) { c.reloading -= dt; if (c.reloading <= 0) c.mag = WEAPONS[c.weapon].mag; }
      c.aiming = false;

      // Bleeding out leaves a trail.
      if (c.bleed > 0.2 && Math.random() < dt * 4 * c.bleed) g.fx.decal(c.x, c.z, 0.25 + Math.random() * 0.3, '#5a0606');

      // A witness running home to tell it (systems/witnesses.js): runs at any distance, deaf to the rest.
      if (c.telling && g.witnesses.think(c, dt)) continue;
      const pd = Math.hypot(g.player.x - c.x, g.player.z - c.z);
      // Far-away NPCs sleep (simulation LOD).
      if (pd > 150 && !c.target) continue;
      // A named person you've wronged (or helped) says so when you come close - once a minute at most.
      if (c.npc && pd < 9 && g.time > (c.barkAt ?? 0)) g.society?.memory.maybeBark(c);

      if (c.sleeping && (c.target || c.flee > 0)) this.wake(c, 'trouble');
      if (g.dialogue.active && g.dialogue.npc === c) {
        c.face = angleLerp(c.face, Math.atan2(g.player.x - c.x, g.player.z - c.z), Math.min(1, dt * 8));
        c.speed = 0;
        continue;
      }

      if (c.flee > 0) {
        c.flee -= dt;
        this.move(c, c.x - c.fleeX, c.z - c.fleeZ, 5.8, dt);
        continue;
      }

      if (c.target) {
        const t = c.target;
        const tx = t.inVehicle ? t.inVehicle.x : t.x, tz = t.inVehicle ? t.inVehicle.z : t.z;
        const d = Math.hypot(tx - c.x, tz - c.z);
        if (!t.alive || d > (c.leash ?? 70) || (!this.hostile(c, t) && c.grudge !== t)) { c.target = null; c.state = 'idle'; continue; } // hunters run a longer leash
        const w = WEAPONS[c.weapon];
        if (c.blind > 0) {
          // Flashbanged: stagger around, can't aim.
          c.blind -= dt; c.aiming = false;
          this.move(c, Math.sin(c.blind * 3), Math.cos(c.blind * 2), 1.2, dt);
          continue;
        }
        const los = !t.underwater && (t.inVehicle ? g.los(c.x, c.z, tx, tz) : g.sees(c, t)); // under water: lost sight (they wait at the shore); another floor: lost too
        // Dug-in target out of sight but close: lob a grenade over the cover.
        if (!los && d < 26 && d > 7 && (c.grenades ?? 0) > 0 && Math.random() < dt * 0.35) {
          c.grenades--;
          g.throwables.throw(c, 'frag', tx + (Math.random() - 0.5) * 3, tz + (Math.random() - 0.5) * 3, Math.random() * 0.8);
          g.emit('npcThrew', { by: c.id, kind: 'frag' });
        }
        if (los && d < w.range * 0.9) {
          c.aiming = true;
          this.watch(c, t, dt); // what it sees of them moving (the lead's only source: no cheating)
          const want = this.leadAngle(c, t, tx, tz, g.ballistics?.rowKey(w));
          c.face = angleLerp(c.face, want, Math.min(1, dt * 7));
          // Strafe a little so firefights move.
          c.strafeT = (c.strafeT || 0) - dt;
          if (c.strafeT <= 0) { c.strafeT = 0.8 + Math.random() * 1.4; c.strafeDir = Math.random() < 0.5 ? -1 : 1; if (Math.random() < 0.3) c.strafeDir = 0; }
          // Where to stand is the tactics brain's (cover, band, flank: systems/tactics.js); the old strafe is the fallback.
          if (g.tactics?.fight(c, t, tx, tz, d, true, dt)) { /* moved by tactics */ }
          else if (c.strafeDir) this.move(c, Math.cos(want) * c.strafeDir, -Math.sin(want) * c.strafeDir, 2.2, dt);
          else c.speed = 0;
          c.aiming = true;
          if (c.mag <= 0 && c.reloading <= 0) { c.reloading = w.reload * 1.3; }
          else if (c.tac?.holdFire) { /* HOLD FIRE (a crew order) */ }
          else if ((c.react = (c.react ?? 0) - dt) <= 0 && c.cool <= 0 && c.reloading <= 0 && Math.abs(angleLerp(c.face, want, 1) - c.face) < 0.3 && (this.clearShot(c, t, want, d) || (c.strafeT = 0, false))) {
            // AI is deliberately worse than the player: reaction delay, burst discipline,
            // spread that grows with range and with a moving target.
            const tMoving = (t.inVehicle ? g.vehiclesSys.speed(t.inVehicle) : t.speed) > 2;
            const sloppy = (0.1 + d * 0.006 + (tMoving ? 0.1 : 0)) * (c.tac ? g.tactics.aimMul(c) : 1); // suppressed: worse aim
            if (g.combat.fire(c, c.weapon, c.face + (Math.random() - 0.5) * sloppy)) {
              c.mag--;
              if (w.auto) {
                c.burst = (c.burst ?? (3 + Math.floor(Math.random() * 3))) - 1;
                if (c.burst <= 0) { c.burst = undefined; c.cool = 0.8 + Math.random() * 0.7; } else c.cool = w.rate * 1.3;
              } else c.cool = w.rate * 2.6 + Math.random() * 0.4;
            }
          }
        } else if (!(t.storey || c.storey) && g.tactics?.fight(c, t, tx, tz, d, los, dt)) {
          // Out of sight or out of range: the tactics brain moves them (flank, bound, cover in band). The pinning element
          // keeps the target's head down: rounds at the cover they went behind (suppressive fire).
          const U = c.tac;
          if (!los && U && !U.holdFire && d < w.range * 0.9 && c.mag > 0 && c.cool <= 0 && c.reloading <= 0 && U.lastX && g.tactics.suppressive(c)) {
            const S = this.seenAt(c, t, U.lastX, U.lastZ), ang = Math.atan2(S.x - c.x, S.z - c.z); // where they were heading (law 6)
            c.aiming = true; c.face = angleLerp(c.face, ang, Math.min(1, dt * 7));
            if (Math.abs(angleLerp(c.face, ang, 1) - c.face) < 0.3 && g.combat.fire(c, c.weapon, c.face + (Math.random() - 0.5) * 0.18)) { c.mag--; c.cool = w.rate * 3 * 1.6 + Math.random() * 0.5; }
          }
        } else {
          const wp = t.inVehicle ? null : g.storeys.steer(c, tx, tz, t.gy ?? 0); // upstairs (or down): by the stairs

          if (wp) this.move(c, wp.x - c.x, wp.z - c.z, 4.6, dt);
          else this.move(c, tx - c.x, tz - c.z, 4.6, dt);
        }
        continue;
      }

      // The Phoenix ring's residents keep their own day (systems/residents.js): their beds, their runs, their rooms.
      if (c.res && g.residents) { g.residents.think(c, dt, pd); continue; }
      // Night: the town's own people go to bed and sleep till dawn (WEB_SURVIVAL); a woken one stays up a while.
      if (c.restless > 0) c.restless -= dt;
      if (this.sleeper(c) && this.night() && !(c.restless > 0)) { this.toBed(c, dt, pd); continue; }
      if (c.sleeping) this.wake(c, 'dawn');
      if (c.bed && !this.night()) { if (c.bed.by === c.id) c.bed.by = null; c.bed = null; } // the claim ends with the night
      // A base's soldiers keep their posts, walk their patrols, close on a trespasser (systems/bases.js).
      if (c.baseId && g.bases?.think(c, dt)) continue;
      // A hunter or a skip tracer on somebody's trail works their sign (systems/outdoors.js trailStep).
      if (c.trailing && g.outdoors?.trailStep(c, dt)) continue;
      // Idle wander.
      c.timer -= dt;
      const dh = Math.hypot(c.wx - c.x, c.wz - c.z);
      if (c.timer <= 0) {
        const r = c.npc ? 2.5 : c.faction === 'warden' ? 6 : 12;
        c.wx = c.home.x + (Math.random() - 0.5) * r * 2;
        c.wz = c.home.z + (Math.random() - 0.5) * r * 2;
        c.timer = 3 + Math.random() * 6;
      }
      // Named characters wait for you when you walk up to them (instead of wandering off).
      if (c.npc && pd < 6) { c.speed = 0; c.wx = c.x; c.wz = c.z; }
      else if (dh > 0.6) {
        const wp = c.storey ? g.storeys.steer(c, c.wx, c.wz, 0) : null; // home is on the street floor
        if (wp) this.move(c, wp.x - c.x, wp.z - c.z, c.npc ? 1.2 : 1.6, dt);
        else this.move(c, c.wx - c.x, c.wz - c.z, c.npc ? 1.2 : 1.6, dt);
      }
      else c.speed = 0;
      if (c.npc && pd < 5) c.face = angleLerp(c.face, Math.atan2(g.player.x - c.x, g.player.z - c.z), Math.min(1, dt * 4));
    }

    // Cheap crowd separation (n^2 over awake characters; n is small).
    for (let i = 0; i < chars.length; i++) {
      const a = chars[i];
      if (!a.alive || a.inVehicle || a.perch || a.sleeping) continue; // nobody shoulders a sentry off a tower deck, or a sleeper out of bed
      for (let j = i + 1; j < chars.length; j++) {
        const b = chars[j];
        if (!b.alive || b.inVehicle || b.perch || b.sleeping) continue;
        // Written so a NaN position FAILS the tests (every comparison with NaN is false): a NaN
        // neighbour used to slip through and make everyone it touched NaN, the player included.
        const dx = b.x - a.x, dz = b.z - a.z;
        if (!(Math.abs(dx) <= 1 && Math.abs(dz) <= 1)) continue;
        if ((a.storey || b.storey) && Math.abs((a.gy ?? 0) - (b.gy ?? 0)) > 1.6) continue; // one upstairs, one below: the floor between them
        const d2 = dx * dx + dz * dz;
        if (!(d2 > 1e-6 && d2 <= 0.64)) continue;
        const d = Math.sqrt(d2), push = (0.8 - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        // The player has right of way: they shoulder NPCs aside instead of being blocked in doorways.
        const P = this.g.player;
        const wa = a === P ? 0 : b === P ? 2 : 1, wb = b === P ? 0 : a === P ? 2 : 1;
        const ta = { x: a.x - nx * push * wa, z: a.z - nz * push * wa }, tb = { x: b.x + nx * push * wb, z: b.z + nz * push * wb };
        // Never shove anyone through a wall, nor the dead into deep water.
        this.g.statics.resolveBody(ta, a.radius, a, null); this.g.statics.resolveBody(tb, b.radius, b, null);
        if (a.faction === 'zombie' && this.wades(a, ta.x, ta.z)) { ta.x = a.x; ta.z = a.z; }
        if (b.faction === 'zombie' && this.wades(b, tb.x, tb.z)) { tb.x = b.x; tb.z = b.z; }
        a.x = ta.x; a.z = ta.z; b.x = tb.x; b.z = tb.z;
      }
    }
  }
}
