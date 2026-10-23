import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DOG_TYPES, BREEDS, DOG_NAMES, BOND_TIERS, BOND_AT, BOND, WHISTLE, GAIT, DOG_RULES as R, STRAY_PACKS, LONE_STRAYS, CACHES } from '../data/dogs.js';
import { ITEMS } from '../data/items.js';
import { makeRng, angleLerp } from '../engine/rng.js';
import { RAY_SOLID, rayCircle } from '../engine/collision.js';

// Dogs (docs/design/WEB_DOGS.md): the original game's dogs (game/proto3d/dog.gd) on this engine. Data in data/dogs.js.
// A dog is a record here, not a Character: it never takes a person's slot, it has its own body (four legs, drawn by
// five InstancedMeshes for every dog in the world), its own brain, and the one damage law reaches it through combat.js
// (hitscan rays and throwables' blasts call hurt()).
//   strays  - pack up round their ground, wander at a walk or a trot, sniff toward smells (the dead, food, a pile of
//             things), eat at a body, mark, bark at a threat before you see it, growl when it is close, cower at gunfire
//             and run, keep their distance from you until you feed them, run from fire and headlights at night
//   yours   - earned by feeding (BOND). Heels at your side, guards a spot, seeks a cache or a box, attacks on SIC (and
//             pounces), jumps a low wall, digs up buried caches, rides in your car, is hurt, goes down, is bandaged or
//             dies (a grave, a collar on its remains, a name in the fallen), and remembers what you did (mem)
// The whistle is C on foot (main.js): tap heel, double guard, triple seek, hold SIC, four sharp SHIELD (soulbound only).
const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const BANDAGES = ['bandage', 'rag', 'suture_kit', 'first_aid'];
const HIT = { t: 0, dog: null };
// Where a dog wants to be this frame, written into its own object (the brains run every frame for every dog).
function W(d, x, z, v, face = undefined, path = false, base = 0) { const w = d.w; w.x = x; w.z = z; w.v = v; w.face = face; w.path = path; w.base = base; return w; }
const TIMERS = ['jumpCd', 'pounceCd', 'biteCd', 'barkCd', 'alertT', 'cowerT', 'fleeT', 'pointT', 'infT'], SIDES = [-1, 1];

export class Dogs {
  constructor(game) {
    this.g = game;
    this.dogs = [];
    this.seq = 0;
    this.t = 0;
    this.caches = CACHES.map((c) => ({ ...c, dug: false }));
    this.graves = [];   // { x, z, name, tier }
    this.fallen = [];   // the memorial: { name, breed, tier, saves, day }
    this.wh = { down: false, downT: 0, taps: 0, gap: 0, held: false, last: null };
    this.pathBudget = 0;
    this.dayChecked = -1;
    this.r = game.scene ? new DogRenderer(game.scene) : null;
    this.spawnWorld();
  }

  // ---- making dogs ---------------------------------------------------------------------------------------------------
  make(breed, x, z, o = {}) {
    if (this.dogs.length >= R.maxDogs) return null;
    const B = BREEDS[breed] ?? BREEDS.mutt, T = DOG_TYPES[B.type];
    const p = { ...T };
    for (const [k, m] of Object.entries(B.mods)) p[k] = k === 'obey' ? m : p[k] * m; // a breed is multipliers (a collie obeys at once)
    const pos = { x, z };
    this.g.statics.resolveCircle(pos, R.radius + 0.1);
    const rng = o.rng ?? Math.random;
    const d = {
      id: o.id ?? `d${++this.seq}`, name: o.name ?? this.freshName(rng), breed: B === BREEDS[breed] ? breed : 'mutt', type: B.type, p, B,
      x: pos.x, z: pos.z, y: 0, vy: 0, vx: 0, vz: 0, face: o.face ?? rng() * TAU, speed: 0, air: false,
      hp: p.hp, maxHp: p.hp, alive: true, downed: false, bleedT: 0, dead: false, deadT: 0,
      bond: 0, owned: false, cmd: 'heel', q: [], state: 'wander', stT: 0,
      pack: o.pack ?? null, home: { x: pos.x, z: pos.z }, goal: null, goalT: 0,
      mem: { fed: 0, saves: 0, shot: 0, lastFed: -1, nag: -1, by: null },
      smells: new Map(), smell: null, threat: null, alertT: 0, ax: 0, az: 0, cowerT: 0, fleeT: 0, fx: 0, fz: 0,
      jumpCd: 0, pounceCd: 0, biteCd: 0, barkCd: rng() * 2, markT: R.markEvery[0] + rng() * (R.markEvery[1] - R.markEvery[0]), scanT: rng() * R.scanEvery,
      ride: null, guard: null, sic: null, seek: null, digT: 0, pointT: 0, stuckT: 0, side: rng() < 0.5 ? -1 : 1, path: null, pathI: 0, pathT: 0,
      infT: 0, pouncing: false, still: 0,
      jumps: 0, pounces: 0, bites: 0, ate: 0, marks: 0, barks: 0, digs: 0,
      w: { x: 0, z: 0, v: 0, face: undefined, path: false, base: 0 }, // what it wants this frame (W(): reused, no garbage)
      a: { phase: rng(), gait: 0, head: 0, wag: 0, tuck: 0, tail: 0.3, crouch: 0, sit: 0, dig: 0, eat: 0, mark: 0, flinch: 0, bark: 0, air: 0, lie: 0 },
    };
    this.dogs.push(d);
    return d;
  }

  // A name no living dog has (two Sadies in one pack reads as a bug).
  freshName(rng) {
    const used = new Set([...this.dogs.filter((d) => !d.dead).map((d) => d.name), ...LONE_STRAYS.map((L) => L.name)]);
    const free = DOG_NAMES.filter((n) => !used.has(n));
    const list = free.length ? free : DOG_NAMES;
    return list[Math.floor(rng() * list.length)];
  }

  // The island's strays (data/dogs.js STRAY_PACKS, LONE_STRAYS), from their own seed: nothing else in the world moves.
  spawnWorld() {
    const rng = makeRng(0xd06);
    for (const P of STRAY_PACKS) {
      let leader = null;
      P.breeds.forEach((b, i) => {
        const a = (i / P.breeds.length) * TAU;
        const d = this.make(b, P.x + Math.cos(a) * 3, P.z + Math.sin(a) * 3, { rng, pack: P.id });
        if (d) { d.home = { x: P.x, z: P.z }; if (!leader) leader = d; d.leader = leader; }
      });
    }
    for (const L of LONE_STRAYS) { const d = this.make(L.breed, L.x, L.z, { rng, name: L.name }); if (d) d.leader = d; }
  }

  tier(d) { let t = 0; for (let i = 0; i < BOND_AT.length; i++) if (d.bond >= BOND_AT[i]) t = i; return t; }
  mine() { return this.dogs.filter((d) => d.owned && !d.dead); }
  byId(id) {
    if (id === 'mine') return this.mine()[0] ?? null;
    if (id === 'nearest') { const P = this.g.player; let b = null, bd = Infinity; for (const d of this.dogs) { if (d.dead) continue; const k = Math.hypot(d.x - P.x, d.z - P.z); if (k < bd) { bd = k; b = d; } } return b; }
    return this.dogs.find((d) => d.id === id || d.name.toLowerCase() === String(id).toLowerCase()) ?? null;
  }
  day() { return this.g.society?.day ?? 0; }

  // ---- the sim ----------------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g, P = g.player;
    this.t += dt;
    this.pathBudget = 1; // one A* query a frame for all dogs
    // A new day: a dog of yours that has not eaten in BOND.hungryDays loses some of the bond (and says so when you're near).
    const day = this.day();
    if (day !== this.dayChecked) { if (this.dayChecked >= 0) for (const d of this.mine()) if (d.mem.lastFed >= 0 && day - d.mem.lastFed > BOND.hungryDays) d.bond = Math.max(BOND_AT[1], d.bond - BOND.hungryLoss); this.dayChecked = day; }
    let rank = 0;
    for (const d of this.dogs) if (d.owned && !d.dead) d.rank = rank++; // each of yours has its own place at heel
    for (const d of this.dogs) {
      if (d.dead) { d.deadT += dt; continue; }
      if (!d.owned && Math.abs(d.x - P.x) + Math.abs(d.z - P.z) > R.simR * 1.4) continue; // a stray far away holds still
      try { this.tick(d, dt); } catch (e) { g.reportError?.(e); }
    }
    // Strays dead a long time are gone (the yours stay: a grave).
    for (let i = this.dogs.length - 1; i >= 0; i--) if (this.dogs[i].dead && !this.dogs[i].owned && this.dogs[i].deadT > 400) this.dogs.splice(i, 1);
  }

  tick(d, dt) {
    const g = this.g, P = g.player, A = d.a;
    for (const k of TIMERS) if (d[k] > 0) d[k] -= dt;
    A.flinch = Math.max(0, A.flinch - dt * 5); A.bark = Math.max(0, A.bark - dt * 4);
    // Riding with you: in the car until you get out (hidden in the cab, out beside you after).
    if (d.ride) {
      const v = d.ride;
      d.x = v.x; d.z = v.z; d.speed = 0;
      if (v.dead || P.inVehicle !== v) {
        d.ride = null;
        const s = P.inVehicle ? v : P, a = (P.face ?? 0) + d.side * 1.2;
        const pos = { x: s.x + Math.sin(a) * 1.6, z: s.z + Math.cos(a) * 1.6 }; g.statics.resolveCircle(pos, R.radius + 0.15);
        d.x = pos.x; d.z = pos.z; d.vx = d.vz = 0; d.y = this.ground(d);
        if (v.dead) this.hurt(d, 20, null, 0, 0, 'explosion');
        g.emit('dogHopsOut', { dog: d.id, vehicle: v.id });
      }
      return;
    }
    if (d.downed) {
      d.bleedT -= dt; d.speed = 0; d.vx = d.vz = 0; A.lie = Math.min(1, A.lie + dt * 4);
      if (d.bleedT <= 0) this.die(d);
      return;
    }
    A.lie = Math.max(0, A.lie - dt * 3);
    // The orders you gave, arriving after the dog's own beat (its type's obey delay, shorter as the bond grows).
    for (let i = d.q.length - 1; i >= 0; i--) if ((d.q[i].t -= dt) <= 0) { this.apply(d, d.q[i]); d.q.splice(i, 1); }
    this.hazards(d, dt);
    if (!d.alive) return;
    if ((d.scanT -= dt) <= 0) { d.scanT = R.scanEvery; this.sense(d); }
    const want = d.owned ? this.brainOwned(d, dt) : this.brainStray(d, dt);
    this.move(d, dt, want);
    this.animate(d, dt);
  }

  // ---- what hurts a dog (fire, the infected, cars) -------------------------------------------------------------------
  hazards(d, dt) {
    const g = this.g;
    for (const f of g.throwables?.fires ?? []) {
      const dd = Math.hypot(f.x - d.x, f.z - d.z);
      if (dd < f.r) this.hurt(d, R.burnDps * dt, f.by ?? null, 0, 0, 'fire');
    }
    // The infected bite a dog that gets close (they do not hunt dogs; a dog in a fight with them pays for it).
    if (d.infT <= 0 && !d.air) {
      for (const c of g.chars) {
        if (c.faction !== 'zombie' || !c.alive || Math.abs(c.x - d.x) > 1.3 || Math.abs(c.z - d.z) > 1.3) continue;
        if (Math.hypot(c.x - d.x, c.z - d.z) < 1.15) { d.infT = R.infectedEvery; this.hurt(d, R.infectedBite, c, d.x - c.x, d.z - c.z, 'bite'); break; }
      }
    }
    // A car that hits a dog: thrown, hurt (a dog sidesteps one it sees coming: steer()).
    for (const v of g.vehicles) {
      if (v.dead || v.sunk || Math.abs(v.x - d.x) > 6 || Math.abs(v.z - d.z) > 6) continue;
      const sp = Math.hypot(v.vx ?? 0, v.vz ?? 0);
      if (sp < 3 || d.air) continue;
      for (const s of SIDES) {
        const cx = v.x + Math.sin(v.h) * v.len * 0.25 * s, cz = v.z + Math.cos(v.h) * v.len * 0.25 * s;
        if (Math.hypot(cx - d.x, cz - d.z) < v.wid * 0.55 + R.radius) {
          const k = 1 / (sp || 1);
          this.hurt(d, sp * R.carHitK, v.driver ?? null, v.vx * k, v.vz * k, 'vehicle');
          d.vx = v.vx * 0.9; d.vz = v.vz * 0.9; d.vy = 3 + sp * 0.12; d.air = true;
          g.emit('dogHit', { dog: d.id, vehicle: v.id, speed: +sp.toFixed(1) });
          return;
        }
      }
    }
  }

  // ---- senses: a dog knows what is behind you ----------------------------------------------------------------------------
  hostileTo(d, c) {
    const g = this.g, P = g.player;
    if (!c.alive || c === P || c.inVehicle || c.hidden) return false;
    if (c.faction === 'zombie') return true;
    if (d.owned) return g.ai.hostile(c, P) || c.target === P || c.grudge === P;
    return !!c.weapon && (c.faction === 'raider' || c.target === P); // a stray reads a man with a gun out hunting
  }

  sense(d) {
    const g = this.g, P = g.player, p = d.p;
    // Threats. Yours measures from you, and counts your blind side (behind where you look) further; a stray from itself.
    const ox = d.owned ? P.x : d.x, oz = d.owned ? P.z : d.z;
    const fx = Math.sin(P.face ?? 0), fz = Math.cos(P.face ?? 0);
    let best = null, bd = Infinity, behind = false;
    for (const c of g.chars) {
      if (Math.abs(c.x - ox) > 40 || Math.abs(c.z - oz) > 40 || !this.hostileTo(d, c)) continue;
      const tx = c.x - ox, tz = c.z - oz, dist = Math.hypot(tx, tz);
      const back = d.owned && dist > 0.5 && (tx * fx + tz * fz) / dist < -0.25;
      const radius = p.threatR * (back ? p.rearMul : 1);
      if (dist < radius && dist < bd) { bd = dist; best = c; behind = back; }
    }
    const was = d.threat;
    d.threat = best;
    if (best && (best !== was || d.alertT <= -4)) {
      d.alertT = 1.8; d.ax = best.x - d.x; d.az = best.z - d.z;
      if (d.owned && best !== was) {
        g.feedback?.floater?.(best.x, best.z, '!', 'hot'); // its senses become yours: a mark over what it smelled
        g.emit('dogAlert', { dog: d.id, threat: best.id, behind, dist: +bd.toFixed(1) });
        if (behind) g.hud?.toast?.(`${d.name.toUpperCase()} GROWLS · SOMETHING BEHIND YOU`, 'warn');
      }
      // The pack hears one of its own: they all turn to it.
      if (!d.owned && d.pack) for (const o of this.dogs) if (o !== d && o.pack === d.pack && !o.dead && !o.owned && !o.threat) { o.threat = best; o.alertT = 1.8; o.ax = best.x - o.x; o.az = best.z - o.z; }
    }
    // The nose: a stray smells the dead, food and piles; yours (a hunter's nose) finds caches and unsearched boxes.
    if (!d.owned) this.sniffOut(d);
    else if (p.noseR > 0 && d.cmd === 'heel' && !d.threat) this.noseFor(d);
  }

  sniffOut(d) {
    if (d.smell || d.fleeT > 0 || d.cowerT > 0) return;
    const g = this.g, t = this.t;
    let best = null, bd = R.scentR;
    const fresh = (id) => (d.smells.get(id) ?? -1e9) < t - R.scentCd;
    for (const c of g.chars) {
      if (c.alive || c === g.player || Math.abs(c.x - d.x) > bd || Math.abs(c.z - d.z) > bd || (c.deadTime ?? 0) > 900) continue;
      const k = Math.hypot(c.x - d.x, c.z - d.z), id = `c:${c.id}`;
      if (k < bd && fresh(id)) { bd = k; best = { id, kind: 'body', x: c.x, z: c.z, ref: c }; }
    }
    for (const it of g.pickups ?? []) {
      if (!it.alive || it.type !== 'food' || Math.abs(it.x - d.x) > bd || Math.abs(it.z - d.z) > bd) continue;
      const k = Math.hypot(it.x - d.x, it.z - d.z), id = `p:${Math.round(it.x)}:${Math.round(it.z)}`;
      if (k < bd && fresh(id)) { bd = k; best = { id, kind: 'pickup', x: it.x, z: it.z, ref: it }; }
    }
    for (const b of g.inventory?.boxes.values() ?? []) {
      if (b.kind !== 'ground' || !b.slots.length || Math.abs(b.x - d.x) > bd || Math.abs(b.z - d.z) > bd) continue;
      const k = Math.hypot(b.x - d.x, b.z - d.z);
      if (k < bd && fresh(b.id) && b.slots.some((s) => ITEMS[s.id]?.kind === 'food')) { bd = k; best = { id: b.id, kind: 'pile', x: b.x, z: b.z, ref: b }; }
    }
    if (best) { d.smell = best; d.stT = 0; d.state = 'sniff'; g.emit('dogSmells', { dog: d.id, kind: best.kind, x: +best.x.toFixed(1), z: +best.z.toFixed(1) }); }
  }

  noseFor(d) {
    const g = this.g;
    d.pinged ??= new Set();
    for (const c of this.caches) {
      if (c.dug || d.pinged.has(c.id) || Math.hypot(c.x - d.x, c.z - d.z) > d.p.noseR) continue;
      d.pinged.add(c.id);
      d.seek = { kind: 'cache', ref: c, x: c.x, z: c.z };
      this.order(d, 'seek');
      g.hud?.toast?.(`${d.name.toUpperCase()} SMELLS SOMETHING UNDER THE DIRT`, 'job');
      g.emit('dogNose', { dog: d.id, kind: 'cache', id: c.id });
      return;
    }
    if (d.type !== 'hunter') return; // a hunter's nose points out boxes nobody has been through; the rest find caches only
    for (const b of g.inventory?.boxes.values() ?? []) {
      if (b.rolled || b.kind === 'ground' || b.owner || d.pinged.has(b.id) || b.id.startsWith('body:') || Math.abs(b.x - d.x) > d.p.noseR || Math.abs(b.z - d.z) > d.p.noseR) continue;
      if (Math.hypot(b.x - d.x, b.z - d.z) > d.p.noseR) continue;
      d.pinged.add(b.id);
      d.pointAt = { x: b.x, z: b.z }; d.pointT = 2; d.alertT = 1.6; d.ax = b.x - d.x; d.az = b.z - d.z;
      g.feedback?.floater?.(b.x, b.z, '?', 'loot');
      g.emit('dogNose', { dog: d.id, kind: 'box', id: b.id });
      return;
    }
  }

  // ---- strays ----------------------------------------------------------------------------------------------------------
  // Returns where it wants to be: { x, z, v (m/s), face? } or null to stand.
  brainStray(d, dt) {
    const g = this.g, P = g.player, A = d.a;
    A.eat = Math.max(0, A.eat - dt * 3); A.mark = Math.max(0, A.mark - dt * 3); A.sit = Math.max(0, A.sit - dt * 3); A.dig = Math.max(0, A.dig - dt * 4);
    d.stT += dt;
    // Gunfire: down low, shaking; then it runs.
    if (d.cowerT > 0) { d.state = 'cower'; A.crouch = Math.min(1, A.crouch + dt * 8); if (d.cowerT <= dt * 1.5) d.fleeT = R.fleeT; return null; }
    A.crouch = Math.max(0, A.crouch - dt * 3);
    if (d.fleeT > 0) { d.state = 'flee'; const dx = d.x - d.fx, dz = d.z - d.fz, l = Math.hypot(dx, dz) || 1; return W(d, d.x + (dx / l) * 8, d.z + (dz / l) * 8, d.p.speed * 1.05); }
    // A threat: bark at it before you'd ever see it; too close and armed, or one of the infected, and it runs.
    const t = d.threat;
    if (t?.alive) {
      const k = Math.hypot(t.x - d.x, t.z - d.z);
      if ((t.faction === 'zombie' && k < 7) || (t.weapon && k < 9)) { d.fleeT = R.fleeT; d.fx = t.x; d.fz = t.z; return null; }
      d.state = k < R.growlR ? 'growl' : 'bark';
      this.bark(d, k < R.growlR ? 'grrr' : 'WOOF');
      return W(d, d.x, d.z, 0, Math.atan2(t.x - d.x, t.z - d.z));
    }
    // You: kept at a distance until you've fed it. Stand still with something it wants and it comes to you, slowly. Shot
    // by you, it gives you a wide berth and growls (it remembers).
    const pd = P.alive && !P.inVehicle ? Math.hypot(P.x - d.x, P.z - d.z) : Infinity;
    if (pd < R.begR && d.bond < 3 && d.mem.shot < 2 && P.speed < 0.8 && this.foodSlot() >= 0) {
      d.state = 'beg';
      if (pd < 2.4) { A.sit = Math.min(1, A.sit + dt * 4); return W(d, d.x, d.z, 0, Math.atan2(P.x - d.x, P.z - d.z)); }
      A.sit = 0; A.head = Math.max(A.head - dt, -0.3);
      return W(d, P.x, P.z, 1.2);
    }
    if (pd < (d.mem.shot ? 14 : R.wary) && d.bond < 3) {
      d.state = 'wary';
      if (d.mem.shot && pd < 8) this.bark(d, 'grrr');
      const dx = d.x - P.x, dz = d.z - P.z, l = pd || 1;
      return W(d, d.x + (dx / l) * 5, d.z + (dz / l) * 5, P.speed > 4 ? d.p.speed * 0.8 : 2.4);
    }
    // Warm to you (fed once): it hangs about at a distance, curious, and comes in close when you hold out food.
    if (d.bond >= 3 && pd < 30) {
      const food = this.foodSlot() >= 0;
      if (food && P.speed < 0.8 && pd < R.begR) { d.state = 'beg'; A.sit = Math.min(1, A.sit + dt * 4); return pd > 2 ? W(d, P.x, P.z, 1.6) : W(d, d.x, d.z, 0, Math.atan2(P.x - d.x, P.z - d.z)); }
      if (pd > 7) { d.state = 'tag'; return W(d, P.x - Math.sin(P.face) * 5, P.z - Math.cos(P.face) * 5, pd > 14 ? d.p.speed * 0.7 : 2.6); }
    }
    // A smell: nose down, trot to it; at a body it eats, at a pile it takes the food, a dropped tin it carries off.
    const s = d.smell;
    if (s) {
      const k = Math.hypot(s.x - d.x, s.z - d.z);
      if (d.stT > 40 || (s.kind === 'body' && s.ref.alive)) { d.smells.set(s.id, this.t); d.smell = null; d.state = 'wander'; return null; }
      if (k > 1.25) { d.state = 'sniff'; A.head = Math.max(A.head - dt * 3, -0.55); return W(d, s.x, s.z, k > 8 ? d.p.speed * 0.5 : 1.5); }
      d.state = 'eat'; A.eat = Math.min(1, A.eat + dt * 6);
      if (d.eatT === undefined) d.eatT = R.scavenge[0] + Math.random() * (R.scavenge[1] - R.scavenge[0]);
      if ((d.eatT -= dt) <= 0) {
        d.eatT = undefined; d.ate++;
        if (s.kind === 'pickup' && s.ref.alive) { s.ref.alive = false; g.pickupsDirty = true; }
        if (s.kind === 'pile') { const i = s.ref.slots.findIndex((x) => ITEMS[x.id]?.kind === 'food'); if (i >= 0) { g.inventory.take(s.ref, i, 1); g.inventory.changed(); } }
        g.emit('dogAte', { dog: d.id, kind: s.kind, x: +s.x.toFixed(1), z: +s.z.toFixed(1) });
        d.smells.set(s.id, this.t); d.smell = null; d.state = 'wander';
      }
      return W(d, d.x, d.z, 0, Math.atan2(s.x - d.x, s.z - d.z));
    }
    // Marking its ground: stop, a hind leg up, then on.
    if ((d.markT -= dt) <= 0) {
      d.state = 'mark'; A.mark = Math.min(1, A.mark + dt * 8);
      if (d.markT < -1.6) { d.markT = R.markEvery[0] + Math.random() * (R.markEvery[1] - R.markEvery[0]); d.marks++; g.emit('dogMarked', { dog: d.id, x: +d.x.toFixed(1), z: +d.z.toFixed(1) }); }
      return null;
    }
    // The pack: the leader roams its ground at a walk; the rest keep with it at a trot.
    const L = d.leader && d.leader !== d && !d.leader.dead && !d.leader.owned ? d.leader : null;
    if (L) {
      const k = Math.hypot(L.x - d.x, L.z - d.z);
      d.state = 'pack';
      if (k > R.packGap[1]) { const a = Math.atan2(d.x - L.x, d.z - L.z); return W(d, L.x + Math.sin(a) * R.packGap[0], L.z + Math.cos(a) * R.packGap[0], k > 12 ? d.p.speed * 0.7 : 3.4); }
      if (L.speed < 0.5 && Math.random() < dt * 0.15) A.sit = 1;
      return null;
    }
    d.state = 'wander';
    d.goalT -= dt;
    if (!d.goal || d.goalT <= 0 || Math.hypot(d.goal.x - d.x, d.goal.z - d.z) < 1.2) {
      if (!d.goal || d.goalT <= -3 || Math.random() < 0.4) {
        const a = Math.random() * TAU, rr = Math.random() * R.wanderR;
        d.goal = { x: 0, z: 0, v: Math.random() < 0.7 ? 1.3 : 3.2 }; d.goal.x = d.home.x + Math.cos(a) * rr; d.goal.z = d.home.z + Math.sin(a) * rr; // a new spot now and then (not every frame)
        d.goalT = 8 + Math.random() * 10;
      } else { d.goalT = 2 + Math.random() * 3; return null; } // a pause: nose round where it stands
    }
    return W(d, d.goal.x, d.goal.z, d.goal.v);
  }

  // ---- yours -------------------------------------------------------------------------------------------------------------
  brainOwned(d, dt) {
    const g = this.g, P = g.player, A = d.a, p = d.p;
    A.eat = Math.max(0, A.eat - dt * 3); A.mark = 0; A.crouch = Math.max(0, A.crouch - dt * 3);
    const pd = Math.hypot(P.x - d.x, P.z - d.z);
    // Time at your side is bond; a hungry dog lets you know once a day.
    if (pd < 8 && P.alive) this.addBond(d, (BOND.heelPerMin / 60) * dt, false);
    const day = this.day();
    if (d.mem.lastFed >= 0 && day - d.mem.lastFed >= BOND.hungryDays && d.mem.nag !== day && pd < 20) { d.mem.nag = day; g.hud?.toast?.(`${d.name.toUpperCase()} HASN'T EATEN SINCE DAY ${d.mem.lastFed} · IT DOESN'T COMPLAIN`, 'warn'); }
    // In your car with you.
    if (P.inVehicle && !d.ride && d.cmd === 'heel' && Math.hypot(P.inVehicle.x - d.x, P.inVehicle.z - d.z) < R.rideR) { d.ride = P.inVehicle; g.emit('dogBoards', { dog: d.id, vehicle: P.inVehicle.id }); return null; }
    // Left far behind: it finds you (out of sight).
    if (d.cmd === 'heel' && pd > R.catchUp && !P.inVehicle && P.alive) {
      const a = (P.face ?? 0) + Math.PI + d.side * 0.5, pos = { x: P.x + Math.sin(a) * 6, z: P.z + Math.cos(a) * 6 };
      g.statics.resolveCircle(pos, R.radius + 0.2);
      d.x = pos.x; d.z = pos.z; d.vx = d.vz = 0; d.path = null; d.y = this.ground(d);
      g.emit('dogCaughtUp', { dog: d.id });
    }
    const cmd = d.cmd;
    if (cmd === 'sic') {
      const t = d.sic;
      if (!t?.alive || t.inVehicle || Math.hypot(t.x - d.x, t.z - d.z) > 70) { d.sic = null; d.cmd = 'heel'; g.emit('dogSicDone', { dog: d.id, target: t?.id ?? null, alive: !!t?.alive }); }
      else return this.chase(d, t, dt);
    }
    if (cmd === 'guard' || cmd === 'shield') {
      if (cmd === 'shield') { d.guard ??= { x: 0, z: 0 }; d.guard.x = P.x; d.guard.z = P.z; } // the post rides your hip
      const gp = d.guard ?? { x: d.x, z: d.z }, rr = p.threatR * (cmd === 'shield' ? 0.6 : 1);
      let t = null, bd = rr;
      for (const c of g.chars) { if (Math.abs(c.x - gp.x) > rr || Math.abs(c.z - gp.z) > rr || !this.hostileTo(d, c)) continue; const k = Math.hypot(c.x - gp.x, c.z - gp.z); if (k < bd) { bd = k; t = c; } }
      if (t) return this.chase(d, t, dt);
      d.state = cmd;
      const k = Math.hypot(gp.x - d.x, gp.z - d.z);
      if (k > (cmd === 'shield' ? 1.6 : 1.4)) return W(d, gp.x, gp.z, k > 6 ? p.speed : 2.4);
      A.sit = Math.min(1, A.sit + dt * 2);
      return W(d, d.x, d.z, 0, d.face);
    }
    if (cmd === 'seek') {
      const s = d.seek;
      if (!s || (s.kind === 'cache' && s.ref.dug) || (s.kind === 'box' && s.ref.rolled)) { d.seek = null; d.cmd = 'heel'; }
      else {
        const k = Math.hypot(s.x - d.x, s.z - d.z);
        if (k > 1.1) { d.state = 'seek'; A.head = Math.max(A.head - dt * 2, -0.45); d.digT = 0; return W(d, s.x, s.z, k > 6 ? p.speed * 0.9 : 2.2, undefined, k > 6); }
        if (s.kind === 'cache') {
          d.state = 'dig'; A.dig = Math.min(1, A.dig + dt * 7);
          if (Math.random() < dt * 8) g.fx?.dust(d.x + Math.sin(d.face) * 0.4, d.z + Math.cos(d.face) * 0.4, 1);
          if ((d.digT += dt) >= R.digTime) { this.unearth(d, s.ref); d.seek = null; d.cmd = 'heel'; A.dig = 0; }
          return W(d, d.x, d.z, 0, Math.atan2(s.x - d.x, s.z - d.z));
        }
        // A box: it stands at it, nose pointed, barking once, until you come.
        d.state = 'point'; this.bark(d, 'WOOF');
        if (!s.told) { s.told = true; g.emit('dogFound', { dog: d.id, box: s.ref.id }); g.feedback?.floater?.(s.x, s.z, '?', 'loot'); }
        if (pd < 3 || (d.seekWait = (d.seekWait ?? 0) + dt) > 12) { d.seek = null; d.cmd = 'heel'; d.seekWait = 0; }
        return W(d, d.x, d.z, 0, Math.atan2(s.x - d.x, s.z - d.z));
      }
    }
    A.dig = Math.max(0, A.dig - dt * 4);
    // A threat (heel or stay): it faces it, hackles up, and barks: you hear it before you see it.
    if (d.threat?.alive && d.alertT > 0) {
      d.state = 'alert';
      this.bark(d, Math.hypot(d.threat.x - d.x, d.threat.z - d.z) < R.growlR ? 'grrr' : 'WOOF');
      if (cmd === 'stay' || (d.alertT > 0.7 && pd < 6)) return W(d, d.x, d.z, 0, Math.atan2(d.threat.x - d.x, d.threat.z - d.z)); // stops and points its nose at it
    }
    if (d.pointT > 0 && d.pointAt) { d.state = 'point'; return W(d, d.x, d.z, 0, Math.atan2(d.pointAt.x - d.x, d.pointAt.z - d.z)); }
    if (cmd === 'stay') { d.state = 'stay'; A.sit = Math.min(1, A.sit + dt * 2); return W(d, d.x, d.z, 0, d.face); }
    // HEEL: a spot at your side and a little behind, on the side it likes; tighter as the bond grows.
    d.state = 'heel';
    const ps = P.inVehicle ?? P, mvx = (ps.x - (d.lpx ?? ps.x)) / Math.max(dt, 1e-3), mvz = (ps.z - (d.lpz ?? ps.z)) / Math.max(dt, 1e-3);
    d.lpx = ps.x; d.lpz = ps.z;
    const pv = Math.hypot(mvx, mvz);
    if (pv > 0.6) d.hd = Math.atan2(mvx, mvz); else d.hd ??= P.face ?? 0;
    const fd = p.followDist * (1 - BOND.followMul * this.tier(d)), h = d.hd;
    const idx = d.rank ?? 0, rank = idx >> 1; // two at your heels, the rest a pace further back each pair
    const side = fd * 0.55 * (rank ? (idx % 2 ? 1 : -1) : d.side), back = fd * 0.5 + rank * 1.1;
    const hx = ps.x + Math.cos(h) * side - Math.sin(h) * back, hz = ps.z - Math.sin(h) * side - Math.cos(h) * back;
    const k = Math.hypot(hx - d.x, hz - d.z);
    if (pv < 0.4) d.still += dt; else d.still = 0;
    if (k < 0.8 && pv < 0.4) { A.sit = Math.min(1, A.sit + (d.still > 2 ? dt * 2 : 0)); return W(d, d.x, d.z, 0, angleLerp(d.face, P.face ?? d.face, Math.min(1, dt * 2))); }
    A.sit = Math.max(0, A.sit - dt * 6);
    // Match your pace and close the gap: a sprint after you when it has fallen behind.
    const v = Math.min(p.speed * 1.35, Math.max(pv * (k > 1.5 ? 1.25 : 1), k > 12 ? p.speed * 1.35 : k > 5 ? p.speed : k > 1.2 ? Math.max(1.6, p.speed * 0.45) : 1.2));
    return { x: hx, z: hz, v, base: pv, path: pd > 10 }; // base: your pace (it slows onto its spot, not to a stop behind you)
  }

  // Chase and bite (SIC, a guard's threat). The pounce: inside its window, on the ground, a clear line - it leaves the
  // ground and the teeth arrive with the body.
  chase(d, t, dt) {
    const g = this.g, p = d.p;
    const dx = t.x - d.x, dz = t.z - d.z, k = Math.hypot(dx, dz) || 1;
    d.state = 'attack';
    // Never into fire after anybody.
    for (const f of g.throwables?.fires ?? []) if (Math.hypot(f.x - t.x, f.z - t.z) < f.r + 1.2) { d.state = 'balk'; this.bark(d, 'WOOF'); return W(d, d.x, d.z, 0, Math.atan2(dx, dz)); }
    if (!d.air && d.pounceCd <= 0 && k > R.pounceR[0] && k < R.pounceR[1] && g.statics.lineOfSight(d.x, d.z, t.x, t.z, RAY_SOLID)) {
      const v = Math.max(p.speed * 1.1, 8);
      d.vx = (dx / k) * v; d.vz = (dz / k) * v; d.vy = R.pounceV; d.air = true; d.pouncing = t; d.pounceCd = R.pounceCd; d.pounces++;
      this.bark(d, 'GRRAH', true);
      g.emit('dogPounce', { dog: d.id, target: t.id, dist: +k.toFixed(1) });
    }
    if (k <= R.biteR) this.bite(d, t, false);
    if (p.bite <= 0) this.bark(d, 'WOOF'); // a lap dog makes a noise about it and nothing else
    return W(d, t.x, t.z, p.speed, Math.atan2(dx, dz), k > 6);
  }

  bite(d, t, pounce) {
    const g = this.g, p = d.p;
    if (d.biteCd > 0 || p.bite <= 0 || !t.alive) return false;
    if (!g.statics.lineOfSight(d.x, d.z, t.x, t.z, RAY_SOLID)) return false; // a wall between: no teeth (the melee law)
    d.biteCd = R.biteCd; d.bites++;
    const k = Math.hypot(t.x - d.x, t.z - d.z) || 1;
    g.combat.damage(t, p.bite * (1 + 0.08 * this.tier(d)), d.owned ? g.player : null, (t.x - d.x) / k, (t.z - d.z) / k, 'bite');
    // Down they go (not the infected: nothing puts those on their back for long).
    if (t.alive && t !== g.player && t.faction !== 'zombie' && Math.random() < p.biteKd * (pounce ? R.pounceKdMul : 1)) { t.knockT = 1.3; t.knockMax = 1.3; g.emit('dogKnockdown', { dog: d.id, target: t.id }); }
    g.emit('dogBite', { dog: d.id, target: t.id, pounce, hp: Math.round(t.hp) });
    return true;
  }

  bark(d, word, force = false) {
    if (d.barkCd > 0 && !force) return;
    const g = this.g, P = g.player;
    d.barkCd = R.barkEvery * (0.8 + Math.random() * 0.5); d.barks++; d.a.bark = 1;
    const dist = Math.hypot(d.x - P.x, d.z - P.z);
    if (dist < 60) {
      g.audio?.dog?.(word === 'grrr' ? 'growl' : 'bark', d.p.scale, dist, g.pan?.(d.x) ?? 0);
      if (dist < (g.viewR ?? 30) * 1.2 && Math.random() < 0.6) g.feedback?.floater?.(d.x, d.z, word, word === 'grrr' ? 'hot' : '');
    }
  }

  // ---- moving ---------------------------------------------------------------------------------------------------------------
  ground(d) { return this.g.stunts?.heightAt(d.x, d.z, d.y) ?? 0; }

  move(d, dt, want) {
    const g = this.g, P = g.player;
    let tx = want?.x ?? d.x, tz = want?.z ?? d.z, v = want?.v ?? 0;
    // Round a wall to you or to a find: an A* path (one query a frame for every dog), followed point to point.
    if (want?.path && v > 0) {
      const k = Math.hypot(tx - d.x, tz - d.z);
      const blocked = k > 4 && !g.statics.lineOfSight(d.x, d.z, tx, tz, RAY_SOLID);
      if (blocked && (!d.path || (d.pathT -= dt) <= 0) && this.pathBudget > 0 && g.footPath) {
        this.pathBudget--; d.pathT = 1.5;
        try { d.path = g.footPath(d.x, d.z, tx, tz); d.pathI = 0; } catch { d.path = null; }
      }
      if (!blocked) d.path = null;
      if (d.path?.length) {
        while (d.pathI < d.path.length - 1 && Math.hypot(d.path[d.pathI].x - d.x, d.path[d.pathI].z - d.z) < 0.8) d.pathI++;
        tx = d.path[d.pathI].x; tz = d.path[d.pathI].z;
      }
    }
    let dx = tx - d.x, dz = tz - d.z;
    const dist = Math.hypot(dx, dz);
    let wx = 0, wz = 0;
    if (dist > 0.15 && v > 0) { const s = Math.min(v, dist * 3 + (want.base ?? 0)); wx = (dx / dist) * s; wz = (dz / dist) * s; }
    // What a dog keeps clear of: fire (always), a lit car's beam at night (a stray runs, yours shies), a car coming at
    // it, and its packmates.
    let rx = 0, rz = 0;
    for (const f of g.throwables?.fires ?? []) {
      const ex = d.x - f.x, ez = d.z - f.z, e = Math.hypot(ex, ez), keep = f.r + R.fireR;
      if (e < keep) { const k = (keep - e) / keep * 9; rx += (ex / (e || 1)) * k; rz += (ez / (e || 1)) * k; if (!d.owned && e < keep * 0.8) { d.fleeT = Math.max(d.fleeT, 2.5); d.fx = f.x; d.fz = f.z; } }
    }
    const night = g.sky?.night ?? 0;
    for (const c of g.vehicles) {
      if (c.dead || Math.abs(c.x - d.x) > 22 || Math.abs(c.z - d.z) > 22) continue;
      const ex = d.x - c.x, ez = d.z - c.z, e = Math.hypot(ex, ez) || 1, fx = Math.sin(c.h), fz = Math.cos(c.h), ahead = (ex * fx + ez * fz) / e;
      if (c.onFire > 0 || c.burn > 0) { const keep = 6 + R.fireR; if (e < keep) { rx += (ex / e) * (keep - e); rz += (ez / e) * (keep - e); } }
      if (c.driver && night > R.beamNight && e < R.beamR && ahead > R.beamDot) {
        const sx = -fz, sz = fx, sd = ex * sx + ez * sz >= 0 ? 1 : -1; // out of the beam, sideways
        const k = d.owned ? (this.tier(d) >= 2 ? 0 : 3) : 8;
        rx += sx * sd * k; rz += sz * sd * k;
        if (!d.owned && d.fleeT <= 0) { d.fleeT = 1.2; d.fx = c.x; d.fz = c.z; g.emit('dogBeam', { dog: d.id, vehicle: c.id }); }
      }
      const sp = Math.hypot(c.vx ?? 0, c.vz ?? 0);
      if (sp > 3 && e < R.carDodge && ahead > 0.4 && (c.vx * ex + c.vz * ez) > 0) { const sx = -fz, sz = fx, sd = ex * sx + ez * sz >= 0 ? 1 : -1; rx += sx * sd * 12; rz += sz * sd * 12; }
    }
    for (const o of this.dogs) {
      if (o === d || o.dead || o.ride || Math.abs(o.x - d.x) > 1.2 || Math.abs(o.z - d.z) > 1.2) continue;
      const ex = d.x - o.x, ez = d.z - o.z, e = Math.hypot(ex, ez) || 0.01;
      if (e < 1.0) { rx += (ex / e) * (1 - e) * 4; rz += (ez / e) * (1 - e) * 4; }
    }
    wx += rx; wz += rz;
    const top = d.p.speed * 1.4, wl = Math.hypot(wx, wz);
    if (wl > top) { wx *= top / wl; wz *= top / wl; }
    if (!d.air) {
      const k = Math.min(1, dt * 7);
      d.vx += (wx - d.vx) * k; d.vz += (wz - d.vz) * k;
      // The bound: a low thing ahead (a wall, a crate, a bonnet) it can clear, and it goes over instead of round.
      const sp = Math.hypot(d.vx, d.vz);
      if (sp > 1.4 && d.jumpCd <= 0) {
        const nx = d.vx / sp, nz = d.vz / sp, look = 0.9 + sp * 0.22; // far enough out that the bound clears it
        const hit = g.statics.raycast(d.x, d.z, nx, nz, look, RAY_SOLID);
        const b = hit < look ? g.statics.hit.box : null;
        if (b && !b.op && !(b.base > 0) && b.height <= R.jumpMax && b.height > 0.25) {
          const go = Math.max(sp, 6);
          d.vx = nx * go; d.vz = nz * go; d.vy = R.leapV; d.air = true; d.jumpCd = R.jumpCd; d.jumps++;
          g.emit('dogJumped', { dog: d.id, height: +b.height.toFixed(2), x: +d.x.toFixed(1), z: +d.z.toFixed(1) });
        }
      }
    }
    // Step, then out of anything it has gone into (in the air, what it is above passes under it).
    const g0 = this.ground(d);
    const pos = _p; pos.x = d.x + d.vx * dt; pos.z = d.z + d.vz * dt;
    // Deep water: a dog will not go in past its chest (it stops at the bank).
    if (g.water && pos.x > 290 && g.water.depthAt(pos.x, pos.z) > 0.7) { pos.x = d.x; pos.z = d.z; d.vx *= 0.3; d.vz *= 0.3; }
    const above = d.air ? d.y - g0 : 0;
    g.statics.resolveCircle(pos, R.radius * d.p.scale, null, d.air ? above - 0.05 : -Infinity);
    const moved = Math.hypot(pos.x - d.x, pos.z - d.z);
    d.x = pos.x; d.z = pos.z;
    if (d.air || d.vy > 0) {
      d.y += d.vy * dt; d.vy -= R.gravity * dt;
      const gr = this.ground(d);
      if (d.y <= gr) {
        d.y = gr; d.vy = 0; d.air = false;
        if (d.pouncing) { const t = d.pouncing; d.pouncing = null; if (t.alive && Math.hypot(t.x - d.x, t.z - d.z) < R.biteR + 0.6) { d.biteCd = 0; this.bite(d, t, true); } }
        d.vx *= 0.5; d.vz *= 0.5;
      }
    } else d.y = this.ground(d);
    d.speed = moved / Math.max(dt, 1e-4);
    // Face where it goes, or where it was told to look.
    if (want?.face !== undefined && d.speed < 0.6) d.face = angleLerp(d.face, want.face, Math.min(1, dt * 8));
    else if (d.speed > 0.3) d.face = angleLerp(d.face, Math.atan2(d.vx, d.vz), Math.min(1, dt * 10));
    // Stuck on something it can't clear: sidestep, and pick its other side.
    if (v > 1 && dist > 1.5 && d.speed < 0.4 && !d.air) {
      if ((d.stuckT += dt) > 0.4) { d.stuckT = 0; d.side = -d.side; const a = Math.atan2(dx, dz) + d.side * Math.PI / 2; d.vx += Math.sin(a) * 4; d.vz += Math.cos(a) * 4; d.pathT = 0; }
    } else d.stuckT = 0;
  }

  // ---- the body's state for the renderer ---------------------------------------------------------------------------------
  animate(d, dt) {
    const A = d.a, P = this.g.player;
    // The gait: blended by speed, the phase advances by distance (a real stride, no skating).
    const v = d.air ? 0 : d.speed;
    const gk = v <= GAIT.walk.upTo ? 0 : v <= GAIT.trot.upTo ? 1 : 2;
    A.gait += (gk - A.gait) * Math.min(1, dt * 6);
    const per = gk === 0 ? GAIT.walk.perM : gk === 1 ? GAIT.trot.perM : GAIT.lope.perM;
    A.phase = (A.phase + v * dt * per / Math.max(0.6, d.p.scale)) % 1;
    A.air = d.air ? Math.min(1, A.air + dt * 9) : Math.max(0, A.air - dt * 7);
    // Morale: the tail's readout. Near you and well, it wags wide and quick; hurt, hunted or shot at, it tucks.
    let m = d.owned ? 0.6 : 0.42;
    if (d.owned && Math.hypot(P.x - d.x, P.z - d.z) < 5) m += 0.25;
    m += (d.hp / d.maxHp - 0.5) * 0.5;
    if (d.cowerT > 0 || d.fleeT > 0) m -= 0.6;
    if (d.state === 'beg') m += 0.2;
    if (d.type === 'cuddle') m += 0.15;
    m = clamp01(m);
    const alert = d.alertT > 0 || d.state === 'attack' || d.state === 'growl' || d.state === 'bark';
    A.tuck += (clamp01((0.38 - m) / 0.38) - A.tuck) * Math.min(1, dt * 6);
    A.tail += ((alert ? 0.9 : 0.15 + m * 0.6) - A.tail) * Math.min(1, dt * 5);
    A.wag += dt * (alert ? 2 : 4 + m * 13);
    A.wagAmp = alert ? 0.05 : (0.1 + m * 0.6) * (1 - A.tuck);
    // The head: nose down to sniff and eat and dig, up when alert, a snap up with each bark.
    let head = d.state === 'sniff' || d.state === 'seek' ? -0.5 : d.state === 'wander' && d.speed < 1.5 ? -0.25 + Math.sin(this.t * 3 + d.x) * 0.12 : alert ? 0.3 : 0;
    head -= A.eat * 0.7 + A.dig * 0.55 + A.crouch * 0.35;
    head += A.bark * 0.2;
    A.head += (head - A.head) * Math.min(1, dt * 7);
  }

  // ---- what happens to a dog ------------------------------------------------------------------------------------------------
  hurt(d, dmg, by, dx = 0, dz = 0, cause = 'bullet') {
    const g = this.g;
    if (!d || d.dead || !(dmg > 0)) return;
    if (d.downed) { d.bleedT = Math.max(0, d.bleedT - 8); return; } // kicking a downed dog shortens its clock
    d.hp -= dmg; d.a.flinch = 1;
    if (cause !== 'fire') { g.fx?.bloodSpray(d.x, 0.45 + d.y, d.z, dx, dz, 4, 0.5); if (Math.random() < 0.4) g.fx?.decal(d.x, d.z, 0.25, '#5a0606'); }
    const dist = Math.hypot(d.x - g.player.x, d.z - g.player.z);
    if (cause !== 'fire' || Math.random() < 0.05) g.audio?.dog?.('yelp', d.p.scale, dist, g.pan?.(d.x) ?? 0);
    if (by === g.player) {
      d.mem.shot++; d.mem.by = 'you';
      if (d.owned) d.bond = Math.max(0, d.bond - dmg * BOND.shotMul);
      g.emit('dogShot', { dog: d.id, by: 'player', bond: +d.bond.toFixed(1), shot: d.mem.shot });
    }
    if (!d.owned) { d.fleeT = R.fleeT + 2; d.fx = by?.x ?? d.x - dx; d.fz = by?.z ?? d.z - dz; d.smell = null; }
    if (d.hp > 0) return;
    if (d.owned) {
      d.hp = 0; d.downed = true; d.bleedT = R.bleedOut; d.vx = d.vz = 0; d.sic = null; d.seek = null;
      g.hud?.toast?.(`${d.name.toUpperCase()} IS DOWN · ${R.bleedOut} SECONDS · A BANDAGE SAVES ${d.name.toUpperCase()}`, 'hot');
      g.emit('dogDowned', { dog: d.id, by: by?.id ?? null, bleedOut: R.bleedOut });
    } else this.die(d);
  }

  blast(x, z, r, dmg, by) {
    for (const d of this.dogs) {
      if (d.dead || d.ride) continue;
      const k = Math.hypot(d.x - x, d.z - z);
      if (k > r || !this.g.statics.lineOfSight(x, z, d.x, d.z)) continue;
      const f = 1 - k / r;
      this.hurt(d, dmg * f * f + 10 * f, by, (d.x - x) / (k || 1), (d.z - z) / (k || 1), 'explosion');
      if (!d.downed && !d.dead) { d.vx += ((d.x - x) / (k || 1)) * f * 7; d.vz += ((d.z - z) / (k || 1)) * f * 7; d.vy = 2 + f * 4; d.air = true; }
    }
  }

  die(d) {
    const g = this.g;
    d.alive = false; d.dead = true; d.downed = false; d.deadT = 0; d.speed = 0; d.a.lie = 1;
    if (d.owned) {
      const tierName = BOND_TIERS[this.tier(d)];
      this.graves.push({ x: d.x + 1.1, z: d.z, name: d.name, tier: tierName });
      // The keepsake is on what is left of it: you choose whether to carry it.
      const inv = g.inventory;
      if (inv) { const box = inv.place(`dog:${d.id}`, 'dogremains', d.x, d.z, 2, `${d.name.toUpperCase()}'S REMAINS`); box.rolled = true; inv.add(box, 'dog_collar', 1); }
      this.fallen.push({ name: d.name, breed: BREEDS[d.breed].name, tier: tierName, saves: d.mem.saves, day: this.day() });
      g.hud?.toast?.(`${d.name.toUpperCase()} (${BREEDS[d.breed].name.toUpperCase()} · ${tierName}) IS GONE. THE COLLAR IS THERE IF YOU CAN FACE IT.`, 'hot');
      g.audio?.dog?.('whine', d.p.scale, 0, 0);
    }
    g.emit('dogDied', { dog: d.id, name: d.name, owned: d.owned, x: +d.x.toFixed(1), z: +d.z.toFixed(1) });
  }

  stabilize(d) {
    const g = this.g;
    d.downed = false; d.hp = R.stabilizeHp; d.mem.saves++; d.cmd = 'heel';
    this.addBond(d, BOND.saved);
    g.hud?.toast?.(d.mem.saves > 1 ? `${d.name.toUpperCase()} IS UP · THAT'S ${d.mem.saves} TIMES YOU'VE PULLED ${d.name.toUpperCase()} BACK` : `${d.name.toUpperCase()} IS BACK ON ITS FEET · IT LOOKS AT YOU DIFFERENTLY NOW`, 'job');
    g.emit('dogSaved', { dog: d.id, saves: d.mem.saves, bond: +d.bond.toFixed(1) });
  }

  unearth(d, c) {
    const g = this.g;
    c.dug = true; d.digs++;
    const box = g.inventory?.place(`cache:${c.id}`, c.table, c.x, c.z, 40, 'DUG-UP CACHE');
    this.addBond(d, BOND.dug);
    g.hud?.toast?.(`${d.name.toUpperCase()} DIGS IT UP · A BURIED CACHE`, 'job');
    g.feedback?.floater?.(c.x, c.z, 'DUG UP', 'loot');
    g.emit('dogDug', { dog: d.id, cache: c.id, box: box?.id ?? null });
  }

  addBond(d, n, tell = true) {
    const t0 = this.tier(d);
    d.bond = Math.max(0, Math.min(100, d.bond + n));
    const t1 = this.tier(d);
    if (t1 > t0 && tell && d.owned) { this.g.hud?.toast?.(`${d.name.toUpperCase()} IS YOUR ${BOND_TIERS[t1]} NOW`, 'job'); this.g.emit('dogBond', { dog: d.id, tier: BOND_TIERS[t1] }); }
    else if (t1 > t0 && d.owned) this.g.emit('dogBond', { dog: d.id, tier: BOND_TIERS[t1] });
  }

  // ---- you and a dog (E) --------------------------------------------------------------------------------------------------
  // The best thing you carry a dog would eat (a food row's `dog`), or -1.
  foodSlot() {
    const C = this.g.inventory?.carried;
    if (!C) return -1;
    let bi = -1, bs = -1;
    C.slots.forEach((s, i) => { const f = ITEMS[s.id]?.dog; if (f && f.bond > bs) { bs = f.bond; bi = i; } });
    return bi;
  }
  bandageSlot() {
    const C = this.g.inventory?.carried;
    if (!C) return -1;
    for (const id of BANDAGES) { const i = C.slots.findIndex((s) => s.id === id && (!ITEMS[id].uses || s.left > 0)); if (i >= 0) return i; }
    return -1;
  }

  // The dog within reach of you that E would act on, and what it would do: { d, verb, text } or null.
  nearFor(P) {
    let best = null, bd = 2.6;
    for (const d of this.dogs) { if (d.dead || d.ride) continue; const k = Math.hypot(d.x - P.x, d.z - P.z); if (k < bd) { bd = k; best = d; } }
    if (!best) return null;
    const d = best, tierName = BOND_TIERS[this.tier(d)];
    if (d.downed) return this.bandageSlot() >= 0 ? { d, verb: 'bandage', text: `Bandage ${d.name} · ${Math.ceil(d.bleedT)} s` } : { d, verb: 'none', text: `${d.name} is bleeding out (${Math.ceil(d.bleedT)} s) · no bandage` };
    const fi = this.foodSlot(), food = fi >= 0 ? ITEMS[this.g.inventory.carried.slots[fi].id] : null;
    if (!d.owned) {
      if (d.mem.shot >= 2) return { d, verb: 'none', text: `${d.name} won't come near you · it remembers` };
      return food ? { d, verb: 'feed', text: `Feed ${d.name} the ${food.name.toLowerCase()} (${BREEDS[d.breed].name} · ${tierName})` } : { d, verb: 'none', text: `${d.name} · ${BREEDS[d.breed].name} · stray · it wants food` };
    }
    if (food && (d.hp < d.maxHp - 5 || this.day() - d.mem.lastFed >= 1)) return { d, verb: 'feed', text: `Feed ${d.name} the ${food.name.toLowerCase()} (${tierName})` };
    return { d, verb: d.cmd === 'stay' ? 'heel' : 'stay', text: `${d.name} (${tierName}): ${d.cmd === 'stay' ? 'Follow' : 'Stay'}` };
  }

  interact(d, verb) {
    const g = this.g, P = g.player;
    if (verb === 'bandage') {
      const i = this.bandageSlot(); if (i < 0) return { ok: false, why: 'you carry nothing to bind the wound with' };
      const inv = g.inventory, s = inv.carried.slots[i];
      if (ITEMS[s.id].uses) { if (--s.left <= 0) inv.take(inv.carried, i, 1); } else inv.take(inv.carried, i, 1);
      inv.changed();
      this.stabilize(d);
      return { ok: true, text: `${d.name.toUpperCase()} STABILIZED` };
    }
    if (verb === 'feed') return this.feed(d);
    if (verb === 'stay' || verb === 'heel') { this.order(d, verb); return { ok: true, text: `${d.name.toUpperCase()}: ${verb.toUpperCase()}` }; }
    return { ok: false, why: 'nothing to do' };
  }

  // Feed it the best thing you carry for a dog. A stray fed up to BOND.adoptAt is yours.
  feed(d, id = null) {
    const g = this.g, inv = g.inventory;
    if (d.dead || d.downed) return { ok: false, why: `${d.name} can't eat now` };
    if (!d.owned && d.mem.shot >= 2) return { ok: false, why: `${d.name} won't come near you: it remembers who shot it` };
    const i = id ? inv.carried.slots.findIndex((s) => s.id === id) : this.foodSlot();
    const s = inv.carried.slots[i], f = s && ITEMS[s.id]?.dog;
    if (!f) return { ok: false, why: id ? `a dog won't eat ${ITEMS[id]?.name.toLowerCase() ?? id}` : 'you carry nothing a dog will eat (jerky, dried meat, a ration)' };
    inv.take(inv.carried, i, 1); inv.changed();
    d.hp = Math.min(d.maxHp, d.hp + f.hp);
    d.mem.fed++; d.mem.lastFed = this.day(); d.fleeT = 0; d.cowerT = 0; d.smell = null; d.a.eat = 1;
    const was = d.owned;
    // Shot once and fed anyway: it forgives, slowly (half the bond the first time).
    this.addBond(d, f.bond * (d.mem.shot && !d.owned ? 0.5 : 1));
    if (!d.owned && d.bond >= BOND.adoptAt) this.adopt(d);
    g.audio?.dog?.('bark', d.p.scale, 2, 0);
    g.emit('dogFed', { dog: d.id, item: s.id, bond: +d.bond.toFixed(1), owned: d.owned, adopted: d.owned && !was });
    return { ok: true, text: d.owned && !was ? `${d.name.toUpperCase()} THE ${BREEDS[d.breed].name.toUpperCase()} FOLLOWS YOU NOW` : `${d.name.toUpperCase()} WOLFS IT DOWN · ${BOND_TIERS[this.tier(d)]}`, bond: d.bond };
  }

  adopt(d) {
    d.owned = true; d.cmd = 'heel'; d.pack = null; d.leader = null; d.state = 'heel'; d.threat = null;
    for (const o of this.dogs) if (o.leader === d && o !== d) o.leader = this.dogs.find((x) => x.pack === o.pack && !x.dead && !x.owned && x !== d) ?? o; // the pack picks another
    d.hp = Math.max(d.hp, d.maxHp * 0.6);
    this.g.hud?.toast?.(`${d.name.toUpperCase()} THE ${BREEDS[d.breed].name.toUpperCase()} ${DOG_TYPES[d.type].name.toUpperCase()} FOLLOWS YOU NOW · C WHISTLES`, 'job');
    this.g.emit('dogAdopted', { dog: d.id, name: d.name, breed: d.breed });
  }

  // ---- the whistle --------------------------------------------------------------------------------------------------------
  // Called every on-foot frame with whether C is held (main.js); taps and the hold become calls.
  whistleKey(held, dt) {
    const w = this.wh;
    if (held) {
      if (!w.down) { w.down = true; w.downT = 0; w.held = false; }
      w.downT += dt;
      if (w.downT >= WHISTLE.hold && !w.held) { w.held = true; w.taps = 0; this.command('sic'); }
    } else if (w.down) {
      w.down = false;
      if (!w.held) { w.taps++; w.gap = 0; }
    } else if (w.taps > 0 && (w.gap += dt) >= WHISTLE.tapWindow) {
      this.command(WHISTLE.calls[Math.min(4, w.taps)]); w.taps = 0;
    }
  }

  // A call to every dog of yours. target: a character id for SIC (else the one nearest your aim, else the nearest threat).
  command(call, target = null) {
    const g = this.g, P = g.player, mine = this.mine().filter((d) => !d.downed);
    this.wh.last = call;
    g.audio?.whistle?.(call);
    let toast = '', out = { call, dogs: mine.length };
    if (call === 'heel') { for (const d of mine) { d.sic = null; d.seek = null; this.order(d, 'heel'); } toast = '*WHISTLE* · HEEL'; }
    else if (call === 'guard') { for (const d of mine) { d.guard = { x: P.x, z: P.z }; this.order(d, 'guard'); } toast = '*WHISTLE-WHISTLE* · GUARD THIS SPOT'; }
    else if (call === 'seek') {
      const s = this.seekTarget();
      if (s) for (const d of mine) { d.seek = { ...s }; this.order(d, 'seek'); }
      toast = s ? '*WHISTLE ×3* · GO FIND IT' : '*WHISTLE ×3* · NOTHING TO SNIFF OUT';
      out.found = s ? { kind: s.kind, id: s.ref.id, x: +s.x.toFixed(1), z: +s.z.toFixed(1) } : null;
    } else if (call === 'sic') {
      const t = target ? g.api?.findChar?.(target) ?? g.chars.find((c) => c.id === target) : this.sicTarget();
      if (t && t.alive && t !== P) for (const d of mine) { d.sic = t; this.order(d, 'sic'); }
      toast = t ? `*LOOOONG WHISTLE* · SIC 'EM` : '*LONG WHISTLE* · NO TARGET NEAR';
      out.target = t?.id ?? null;
    } else if (call === 'shield') {
      let any = 0;
      for (const d of mine) if (this.tier(d) >= 3) { d.guard = { x: P.x, z: P.z }; this.order(d, 'shield'); any++; }
      toast = any ? '*FOUR SHARP* · SHIELD · YOUR PARTNER LOCKS TO YOUR HIP' : '*FOUR SHARP* · ONLY A SOULBOUND DOG ANSWERS THAT CALL';
      out.answered = any;
    }
    if (mine.length) g.hud?.toast?.(toast, 'job');
    g.emit('whistle', out);
    return out;
  }

  order(d, cmd) {
    const delay = (d.p.obey ?? 0) * (1 - BOND.obeyMul * this.tier(d));
    const o = { t: delay, cmd };
    if (delay <= 0.03) this.apply(d, o); else { d.q = d.q.filter((x) => x.cmd !== cmd); d.q.push(o); }
  }
  apply(d, o) { d.cmd = o.cmd; d.path = null; d.digT = 0; if (o.cmd !== 'sic') d.pouncing = null; }

  seekTarget() {
    const g = this.g, P = g.player;
    let best = null, bd = WHISTLE.seekR;
    for (const c of this.caches) { if (c.dug) continue; const k = Math.hypot(c.x - P.x, c.z - P.z); if (k < bd) { bd = k; best = { kind: 'cache', ref: c, x: c.x, z: c.z }; } }
    if (best) return best; // a cache first: that is what a nose is for
    for (const b of g.inventory?.boxes.values() ?? []) {
      if (b.rolled || b.kind === 'ground' || b.owner || b.id.startsWith('body:') || b.id.startsWith('cache:') || Math.abs(b.x - P.x) > bd || Math.abs(b.z - P.z) > bd) continue;
      const k = Math.hypot(b.x - P.x, b.z - P.z); if (k < bd) { bd = k; best = { kind: 'box', ref: b, x: b.x, z: b.z }; }
    }
    return best;
  }

  sicTarget() {
    const g = this.g, P = g.player, aim = g.aim;
    let best = null, bd = 5;
    for (const c of g.chars) { if (c === P || !c.alive || c.inVehicle || c.hidden) continue; const k = Math.hypot(c.x - aim.x, c.z - aim.z); if (k < bd) { bd = k; best = c; } }
    if (best) return best;
    bd = WHISTLE.sicR;
    for (const c of g.chars) { if (c === P || !c.alive || c.inVehicle || !(g.ai.hostile(c, P) || c.target === P || c.faction === 'zombie')) continue; const k = Math.hypot(c.x - P.x, c.z - P.z); if (k < bd) { bd = k; best = c; } }
    return best;
  }

  // ---- the world's hooks ---------------------------------------------------------------------------------------------------
  // A loud noise (main.js noise): gunfire and blasts. A stray, or a dog not yet bonded, cowers and then runs; yours flinches
  // and turns to it.
  onNoise(x, z, r, src) {
    if (r < 40) return;
    const P = this.g.player;
    for (const d of this.dogs) {
      if (d.dead || d.downed || d.ride) continue;
      const k = Math.hypot(d.x - x, d.z - z);
      if (k > Math.min(r, R.gunR)) continue;
      d.a.flinch = 1;
      if (!d.owned || this.tier(d) < 1) {
        if (d.cowerT <= 0 && d.fleeT <= 0) { d.cowerT = R.cower[0] + Math.random() * (R.cower[1] - R.cower[0]); d.fx = x; d.fz = z; d.smell = null; this.g.emit('dogCowers', { dog: d.id, dist: +k.toFixed(1) }); }
      } else if (src !== P) { d.alertT = Math.max(d.alertT, 1.2); d.ax = x - d.x; d.az = z - d.z; }
    }
  }

  // The bullet's line (combat.js hitscan): the nearest dog it crosses before maxT. Reuses one result object.
  raycast(ox, oz, dx, dz, maxT) {
    let best = null, bt = maxT;
    for (const d of this.dogs) {
      if (d.dead || d.ride || d.air && d.y > 1.4) continue;
      const t = rayCircle(ox, oz, dx, dz, d.x, d.z, 0.42 * d.p.scale, bt);
      if (t >= 0.3 && t < bt) { bt = t; best = d; }
    }
    if (!best) return null;
    HIT.t = bt; HIT.dog = best;
    return HIT;
  }

  // Place a buried cache (agents, tests). Returns it.
  addCache(x, z, table = 'buried_cache') {
    const c = { id: `c${this.caches.length + 1}x`, x, z, table, dug: false };
    this.caches.push(c);
    return c;
  }

  // ---- the agent's view ----------------------------------------------------------------------------------------------------
  view(d) {
    return {
      id: d.id, name: d.name, breed: d.breed, breedName: BREEDS[d.breed].name, type: d.type, typeName: DOG_TYPES[d.type].name,
      owned: d.owned, bond: +d.bond.toFixed(1), tier: BOND_TIERS[this.tier(d)], cmd: d.owned ? d.cmd : null, state: d.dead ? 'dead' : d.downed ? 'downed' : d.ride ? 'riding' : d.state,
      x: +d.x.toFixed(1), z: +d.z.toFixed(1), y: +d.y.toFixed(2), speed: +d.speed.toFixed(1), hp: Math.round(d.hp), maxHp: d.maxHp, air: d.air,
      bleedOut: d.downed ? +d.bleedT.toFixed(1) : undefined, pack: d.pack, threat: d.threat?.id ?? null, ride: d.ride?.id ?? null,
      memory: { fed: d.mem.fed, saves: d.mem.saves, shotByYou: d.mem.shot, lastFed: d.mem.lastFed },
      counts: { jumps: d.jumps, pounces: d.pounces, bites: d.bites, ate: d.ate, marks: d.marks, barks: d.barks, digs: d.digs },
      senses: { threatR: +d.p.threatR.toFixed(1), noseR: +d.p.noseR.toFixed(1), speed: +d.p.speed.toFixed(2), obey: +d.p.obey.toFixed(2), bite: d.p.bite },
    };
  }

  save() {
    return {
      seq: this.seq,
      dogs: this.dogs.map((d) => ({ id: d.id, name: d.name, breed: d.breed, x: +d.x.toFixed(2), z: +d.z.toFixed(2), face: +d.face.toFixed(2), hp: d.hp, bond: d.bond, owned: d.owned, cmd: d.cmd, dead: d.dead, downed: d.downed, bleedT: d.bleedT, pack: d.pack, home: d.home, mem: { ...d.mem }, guard: d.guard })),
      caches: this.caches.map((c) => ({ id: c.id, x: c.x, z: c.z, table: c.table, dug: c.dug })),
      graves: this.graves.map((x) => ({ ...x })), fallen: this.fallen.map((x) => ({ ...x })),
    };
  }

  load(s) {
    if (!s) return;
    this.dogs = []; this.seq = 0;
    for (const r of s.dogs ?? []) {
      if (!BREEDS[r.breed]) continue;
      const d = this.make(r.breed, r.x, r.z, { id: r.id, name: r.name, face: r.face, pack: r.pack });
      if (!d) continue;
      Object.assign(d, { hp: r.hp, bond: r.bond, owned: !!r.owned, cmd: r.cmd ?? 'heel', dead: !!r.dead, alive: !r.dead, downed: !!r.downed, bleedT: r.bleedT ?? 0, home: r.home ?? d.home, guard: r.guard ?? null });
      Object.assign(d.mem, r.mem ?? {});
      d.x = r.x; d.z = r.z; d.y = this.ground(d);
      if (d.dead) d.a.lie = 1;
    }
    this.seq = Math.max(s.seq ?? 0, ...this.dogs.map((d) => Number(d.id.slice(1)) || 0));
    // Packs find their leaders again.
    for (const d of this.dogs) if (!d.owned && !d.dead) d.leader = d.pack ? this.dogs.find((o) => o.pack === d.pack && !o.dead && !o.owned) ?? d : d;
    if (s.caches) this.caches = s.caches.map((c) => ({ ...c }));
    this.graves = (s.graves ?? []).map((x) => ({ ...x }));
    this.fallen = (s.fallen ?? []).map((x) => ({ ...x }));
  }

  // ---- drawing ----------------------------------------------------------------------------------------------------------
  draw(dt) { this.r?.sync(this, this.g.camLook ?? this.g.player, dt); }
}

const _p = { x: 0, z: 0 };

// ======================================================================================================================
// The four-legged body: a rounded barrel, a head with its ears (pricked or dropped: two packed variants), and legs, neck and
// tail drawn from one tapered limb (two segments a leg: a real elbow, stifle and hock). Five InstancedMeshes for every dog
// in the world; a variant nobody uses costs no draw call. Poses are solved per frame into joint positions in the dog's own
// frame (+z forward), like the people's (characters.js).
const MAXD = 32, LIMBS = 11; // 8 leg segments + neck + tail + saddle
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _M = new THREE.Matrix4(), _T = new THREE.Matrix4(), _S = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _dir = new THREE.Vector3(), _sc = new THREE.Vector3(), _c = new THREE.Color();
const _DOWN = new THREE.Vector3(0, -1, 0);
// Legs: [x side, z, upper, lower, front]
const LEGS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];

function tint(geo, hex) {
  if (geo.index) geo = geo.toNonIndexed();
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

function bodyGeo() {
  // A barrel: deeper at the chest than the loin, a darker back (vertex shade, the instance colour is the coat).
  let g = new RoundedBoxGeometry(0.29, 0.29, 0.66, 2, 0.1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), y = p.getY(i), t = (z + 0.33) / 0.66; // 0 rump, 1 chest
    if (y < 0) p.setY(i, y * (0.8 + 0.4 * t));                   // the chest hangs lower than the belly at the loin
    p.setX(i, p.getX(i) * (0.9 + 0.15 * t));
  }
  g.computeVertexNormals();
  g = g.toNonIndexed();
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i), k = y > 0.06 ? 0.72 : y < -0.1 ? 1.08 : 0.92; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function headGeo(ears) {
  const parts = [
    tint(new RoundedBoxGeometry(0.2, 0.18, 0.2, 1, 0.05), '#ffffff'),                         // skull
    tint(new THREE.BoxGeometry(0.11, 0.09, 0.17).translate(0, -0.035, 0.16), '#d8d0c4'),     // muzzle
    tint(new THREE.BoxGeometry(0.06, 0.05, 0.04).translate(0, -0.01, 0.255), '#141010'),     // nose
    tint(new THREE.BoxGeometry(0.035, 0.03, 0.02).translate(0.055, 0.035, 0.1), '#141010'),  // eyes
    tint(new THREE.BoxGeometry(0.035, 0.03, 0.02).translate(-0.055, 0.035, 0.1), '#141010'),
  ];
  if (ears === 'up') for (const s of [1, -1]) parts.push(tint(new THREE.ConeGeometry(0.045, 0.12, 4).rotateY(Math.PI / 4).translate(0.065 * s, 0.14, -0.03), '#d0c8bc'));
  else for (const s of [1, -1]) parts.push(tint(new THREE.BoxGeometry(0.035, 0.13, 0.08).rotateZ(0.25 * s).translate(0.11 * s, -0.02, -0.01), '#a09890'));
  return mergeGeometries(parts.map((x) => (x.index ? x.toNonIndexed() : x)));
}

class DogRenderer {
  constructor(scene) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true });
    const plain = new THREE.MeshStandardMaterial({ roughness: 0.92 });
    const make = (geo, material, count, shadow) => {
      const m = new THREE.InstancedMesh(geo, material, count);
      m.castShadow = shadow; m.receiveShadow = false; m.frustumCulled = false;
      for (let i = 0; i < count; i++) { m.setMatrixAt(i, ZERO); m.setColorAt(i, _c.set('#888')); }
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0; m.visible = false;
      scene.add(m);
      return m;
    };
    this.body = make(bodyGeo(), mat, MAXD, true);
    this.headUp = make(headGeo('up'), mat, MAXD, false);
    this.headDown = make(headGeo('down'), mat, MAXD, false);
    this.limb = make(new THREE.CylinderGeometry(1, 0.78, 1, 7, 1).translate(0, -0.5, 0), plain, MAXD * LIMBS, true);
    // Packed earth over a cache, and a grave's stone and mound: one box mesh, coloured per instance.
    this.prop = make(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), plain, 96, true);
    this.nb = 0; this.nh = 0; this.nd = 0; this.nl = 0; this.np = 0;
  }

  seg(F, from, dir, len, r, color) {
    _q.setFromUnitVectors(_DOWN, dir);
    _M.compose(from, _q, _sc.set(r, len, r)).premultiply(F);
    this.limb.setMatrixAt(this.nl, _M); this.limb.setColorAt(this.nl++, color);
  }

  prop1(x, y, z, sx, sy, sz, ry, hex) {
    if (this.np >= 96) return;
    _e.set(0, ry, 0); _q.setFromEuler(_e);
    _M.compose(_a.set(x, y, z), _q, _sc.set(sx, sy, sz));
    this.prop.setMatrixAt(this.np, _M); this.prop.setColorAt(this.np++, _c.set(hex));
  }

  sync(sys, cam, dt) {
    this.nb = this.nh = this.nd = this.nl = this.np = 0;
    const cx = cam.x, cz = cam.z, Rr = R.drawR, t = sys.t;
    for (const d of sys.dogs) {
      if (d.ride || Math.abs(d.x - cx) > Rr || Math.abs(d.z - cz) > Rr || this.nb >= MAXD) continue;
      if (d.dead && d.deadT > 300 && !d.owned) continue;
      this.pose(d, t);
    }
    // Caches (packed earth, until dug) and graves.
    for (const c of sys.caches) { if (Math.abs(c.x - cx) > Rr || Math.abs(c.z - cz) > Rr) continue; if (!c.dug) this.prop1(c.x, -0.02, c.z, 1.05, 0.22, 0.95, 0.6, '#6a5236'); else this.prop1(c.x, -0.05, c.z, 1.1, 0.1, 1.0, 0.6, '#3e3022'); }
    for (const gr of sys.graves) {
      if (Math.abs(gr.x - cx) > Rr || Math.abs(gr.z - cz) > Rr) continue;
      this.prop1(gr.x, 0, gr.z, 0.42, 0.75, 0.14, 0, '#6e6a62');
      this.prop1(gr.x, -0.04, gr.z + 0.62, 0.7, 0.16, 1.0, 0, '#4a3a28');
    }
    this.done(this.body, this.nb); this.done(this.headUp, this.nh); this.done(this.headDown, this.nd); this.done(this.limb, this.nl); this.done(this.prop, this.np);
  }

  // An empty mesh costs no draw call.
  done(m, n) {
    m.count = n; m.visible = n > 0;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  pose(d, t) {
    const A = d.a, s = d.p.scale, B = d.B, build = B.build;
    const wx = build === 'heavy' ? 1.25 : 1, wy = build === 'heavy' ? 1.12 : 1, L = build === 'long' ? 1.18 : 1, legK = build === 'long' ? 0.84 : build === 'heavy' ? 0.95 : 1;
    const up = 0.27 * s * legK, lo = 0.27 * s * legK; // leg segment lengths
    const gIdx = A.gait, G = gIdx < 1 ? GAIT.walk : gIdx < 2 ? GAIT.trot : GAIT.lope, G2 = gIdx < 1 ? GAIT.trot : GAIT.lope, gb = gIdx - Math.floor(gIdx);
    const moving = d.speed > 0.25 && !d.air;
    const amp = moving ? (G.amp + (G2.amp - G.amp) * gb) * Math.min(1, d.speed / 1.2) : 0;
    const lift = moving ? G.lift + (G2.lift - G.lift) * gb : 0;
    const bob = moving ? Math.abs(Math.sin(A.phase * TAU * 2)) * (G.bob + (G2.bob - G.bob) * gb) : 0;
    const lie = A.lie, sit = A.sit * (1 - lie), crouch = A.crouch * (1 - lie);
    const shiver = d.cowerT > 0 ? Math.sin(t * 47 + d.x) * 0.012 : 0;
    const flinch = A.flinch;
    // Root: on the ground under the body centre, yawed to its facing; pitched (a sit, a leap, a lope's rock), rolled
    // onto its side lying down.
    const standH = (up + lo) * 0.97 + 0.05 * s;
    const h = standH * (1 - 0.32 * crouch) - 0.13 * s * sit + bob * s + flinch * 0.05 * s;
    const H = h * (1 - lie) + 0.15 * s * wx * lie;
    const pitch = -0.5 * sit + (A.air ? -d.vy * 0.04 * A.air : 0) + (gIdx > 1.5 && moving ? Math.sin(A.phase * TAU) * GAIT.lope.pitch : 0) + 0.12 * A.dig - 0.08 * flinch;
    _e.set(pitch, d.face, lie * 1.45, 'YXZ'); _q.setFromEuler(_e);
    const F = _T.compose(_a.set(d.x + shiver, d.y + H, d.z), _q, _sc.set(1, 1, 1));
    // Body.
    _M.compose(_b.set(0, 0, 0), _q.identity(), _sc.set(s * wx, s * wy, s * L)).premultiply(F);
    this.body.setMatrixAt(this.nb, _M); this.body.setColorAt(this.nb, _c.set(B.coat)); this.nb++;
    const legC = _cl.set(B.legs), coatC = _cc.set(B.coat);
    // Legs: [left fore, right fore, left hind, right hind]. Swing about the hip, the lower segment folding in the swing.
    const offs = G.offsets, offs2 = G2.offsets;
    for (let i = 0; i < 4; i++) {
      const side = LEGS[i][0], front = LEGS[i][1] > 0;
      const jx = side * 0.1 * s * wx, jy = (front ? -0.07 : -0.05) * s, jz = (front ? 0.21 : -0.22) * s * L;
      let ph = (offs[i] + (offs2[i] - offs[i]) * gb + A.phase) * TAU;
      let a = amp * Math.sin(ph), fold = lift * Math.max(0, Math.cos(ph)) * Math.min(1, d.speed / 1.5);
      let a1 = front ? a - 0.06 : a + 0.38, a2 = front ? a1 - fold * 1.3 + 0.08 : a - 0.32 - fold * 0.9, splay = 0;
      // Crouched (cowering): legs fold under. Sitting: the hinds fold forward flat, the fores stand.
      a1 += crouch * (front ? 0.35 : 0.65); a2 -= crouch * (front ? 0.9 : 1.1);
      if (!front && sit > 0) { a1 += sit * 1.1; a2 -= sit * 1.9; }
      // In the air: fores reach, hinds trail.
      if (A.air > 0) { a1 = a1 * (1 - A.air) + (front ? 1.0 : -0.95) * A.air; a2 = a2 * (1 - A.air) + (front ? 0.75 : -1.25) * A.air; }
      // Digging: the fores scrape fast, in turn.
      if (front && A.dig > 0) { const sc = Math.sin(t * 18 + (side > 0 ? 0 : Math.PI)); a1 = a1 * (1 - A.dig) + (0.65 + sc * 0.45) * A.dig; a2 = a2 * (1 - A.dig) + (0.2 + sc * 0.6) * A.dig; }
      // Marking: the right hind lifts out to the side.
      if (!front && side < 0 && A.mark > 0) splay = 1.25 * A.mark;
      // Eating: the fores brace.
      if (front && A.eat > 0) a1 += 0.25 * A.eat;
      _a.set(jx, jy, jz);
      _dir.set(side * Math.sin(splay), -Math.cos(a1) * Math.cos(splay), Math.sin(a1) * Math.cos(splay)).normalize(); // splay: out to its own side
      this.seg(F, _a, _dir, up, 0.058 * s * (front ? 1 : 1.15) * (build === 'heavy' ? 1.2 : 1), legC);
      _b.copy(_a).addScaledVector(_dir, up);
      _dir.set(side * Math.sin(splay) * 0.6, -Math.cos(a2), Math.sin(a2)).normalize();
      this.seg(F, _b, _dir, lo, 0.043 * s * (build === 'heavy' ? 1.2 : 1), legC);
    }
    // A saddle: a darker back over the coat (one more limb instance lying along the spine).
    if (B.saddle) {
      _a.set(0, 0.075 * s * wy, -0.25 * s * L); _dir.set(0, 0.06, 1).normalize();
      _b.copy(_a).addScaledVector(_dir, 0.44 * s * L); _nd.copy(_dir).negate();
      this.seg(F, _b, _nd, 0.44 * s * L, 0.105 * s * wx, _cs.set(B.saddle));
    }
    // Neck and head: the head dips to sniff, eat and dig, lifts to alert, snaps up to bark.
    const hp = A.head - lie * 0.2;
    _a.set(0, 0.07 * s * wy, 0.26 * s * L);
    _dir.set(0, 0.55 + hp * 0.9, 0.85).normalize(); // forward and up (or down, nose to the ground)
    const neckLen = 0.17 * s;
    // The neck segment hangs along -y in its geometry: draw it from the head end back down to the withers.
    _b.copy(_a).addScaledVector(_dir, neckLen);
    _nd.copy(_dir).negate();
    this.seg(F, _b, _nd, neckLen, 0.085 * s * wx, coatC);
    _e.set(-hp * 0.9 - 0.1, 0, 0, 'YXZ'); _q.setFromEuler(_e);
    _M.compose(_b.addScaledVector(_dir, 0.06 * s), _q, _sc.set(s * (build === 'heavy' ? 1.15 : 1), s, s)).premultiply(F);
    const head = B.ears === 'up' ? this.headUp : this.headDown, hi = B.ears === 'up' ? this.nh++ : this.nd++;
    head.setMatrixAt(hi, _M); head.setColorAt(hi, _c.set(B.mask));
    // The tail: the readout. Up and wagging, level, or tucked between the legs.
    const tl = 0.34 * s * (B.tail ?? 1);
    if (tl > 0.02) {
      const elev = (A.tail - 0.25) * 1.4 - A.tuck * 1.5 - lie * 0.4, wag = Math.sin(A.wag) * (A.wagAmp ?? 0.2);
      _a.set(0, 0.09 * s * wy, -0.32 * s * L);
      _dir.set(Math.sin(wag) * Math.cos(elev), Math.sin(elev), -Math.cos(wag) * Math.cos(elev)).normalize();
      _b.copy(_a).addScaledVector(_dir, tl);
      _nd.copy(_dir).negate();
      this.seg(F, _b, _nd, tl, 0.03 * s * (build === 'heavy' ? 1.3 : 1), coatC);
    }
  }
}
const _cl = new THREE.Color(), _cc = new THREE.Color(), _cs = new THREE.Color(), _nd = new THREE.Vector3();
