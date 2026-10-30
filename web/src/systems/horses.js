// HORSES (docs/design/WEB_HORSES.md; rows in data/horses.js). Not a second animal system: a horse is the fauna layer's
// four-legged body (data/fauna.js SPECIES `horse_<breed>`, drawn by the dogs' quad rig, butchered by its yield rows, shot by
// the same bullets) with a RECORD on top of it in this ledger: owner, name, feed, water, stamina, hoof, lameness, bond, tack,
// saddlebags. The ledger is the horse's life; the fauna body is only its presence near you.
//   - WILD horses (owner 'wild') are fauna prey: the herd grazes, bolts at a bang, and is placed ONCE from a HERD row (a herd
//     that is shot or ridden off is smaller for good; nothing regenerates).
//   - TAME horses (owner 'player' or 'stable:<id>') are `a.ctl`: the fauna brain skips them and this system moves them, so
//     the rider steers, a tied horse stays put, an untied one grazes and drifts, a frightened one bolts.
//   - Riding: the player is `p.mount = record`; p.x/z follow the horse; the rider is drawn in the saddle (characters.js, the
//     bike pose kind 'ride'); the top-down camera follows the player as always.
// Time is the game clock (fauna.hours(): 24 game hours = 12 real minutes); a horse that is not near you still gets hungry.
import * as THREE from 'three';
import { clamp, angleLerp } from '../engine/rng.js';
import { ITEMS } from '../data/items.js';
import { SPECIES } from '../data/fauna.js';
import { BREEDS, CARE, GAITS, GAIT_ORDER, HERDS, STABLES, HITCHES, validateHorses } from '../data/horses.js';
import { outfit } from './characters.js';

const TAU = Math.PI * 2;
const _M = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const MAXI = 160;
const r1 = (n) => +n.toFixed(1), r2 = (n) => +n.toFixed(2);
const wrap = (d) => Math.atan2(Math.sin(d), Math.cos(d));
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const NAMES = ['Dusty', 'Bell', 'Hickory', 'Rook', 'Maple', 'Copper', 'Juniper', 'Tumble', 'Ash', 'Clover', 'Sorrel', 'Pike', 'Willow', 'Ember', 'Nickel', 'Bandit', 'Mesa', 'Sage'];

export const tierOf = (bond) => { let t = CARE.bondTiers[0][0]; for (const [n, from] of CARE.bondTiers) if (bond >= from) t = n; return t; };

export class Horses {
  constructor(game) {
    this.g = game;
    game.horses = this;
    this.enabled = true;
    this.list = [];            // the ledger: every horse that has ever been placed (dead ones are trimmed)
    this.placed = new Set();   // HERD / STABLE row ids already laid down (never laid again)
    this.stables = new Map();  // stable id -> { handDead, rails: [{x,z}] }
    this.rails = HITCHES.map((h) => ({ ...h }));   // hitching rails: rows + each stable's
    this.graves = [];          // { x, z, name, breed, day }
    this.seq = 0; this.t = 0; this.lastH = null; this.checkT = 0; this.fearT = 0;
    this.stats = { mounts: 0, dismounts: 0, bolts: 0, throws: 0, fed: 0, watered: 0, stolen: 0, bought: 0, tamed: 0, hops: 0, blown: 0, lamed: 0, died: 0, starved: 0, buried: 0 };
    this.r = game.scene ? new HorseRenderer(game.scene) : null;
  }

  // ---- clocks and look-ups ---------------------------------------------------------------------------------------------------
  hours() { return this.g.fauna?.hours?.() ?? 0; }
  F() { return this.g.fauna; }
  bodyOf(H) { return H.a && this.F().live.includes(H.a) ? H.a : null; }
  mine() { return this.list.filter((h) => h.owner === 'player' && h.alive); }
  get(id) { return this.list.find((h) => h.id === id) ?? null; }
  ridden() { return this.g.player.mount ?? null; }
  breed(H) { return BREEDS[H.breed]; }
  focus() { const P = this.g.player; return P.inVehicle ?? P; }

  // ---- placing the world's horses, once ----------------------------------------------------------------------------------------
  mk(breed, o) {
    const B = BREEDS[breed], id = `hz${++this.seq}`;
    const seed = hash(`${id}:${breed}:${o.x}:${o.z}`);
    const H = {
      id, breed, name: o.name ?? NAMES[Math.floor(seed * 997) % NAMES.length], seed, owner: o.owner ?? 'wild', herd: o.herd ?? null, lead: !!o.lead,
      x: o.x, z: o.z, face: seed * TAU, hx: o.x, hz: o.z, hp: B.hp, maxHp: B.hp, alive: true, buck: false,
      feed: o.feed ?? 0.85, water: o.water ?? 0.85, stamina: 1, hoof: 1, lame: 0, bond: o.bond ?? 0, saddle: !!o.saddle, bags: !!o.bags, bagSlots: [],
      tied: null, stolen: null, price: o.price ?? B.price, t: this.hours(), brushedAt: -99, km: 0, born: this.g.society?.day ?? 0,
      v: 0, gait: 'stand', blown: false, boltT: 0, boltDir: 0, hopT: 0, fearCd: 0, mountT: 0, dismountT: 0, graze: false,
    };
    this.list.push(H);
    return H;
  }

  place() {
    for (const h of HERDS) {
      if (this.placed.has(h.id)) continue;
      this.placed.add(h.id);
      for (let i = 0; i < h.count; i++) {
        const ang = (i / h.count) * TAU, rr = 4 + (i % 3) * 3, br = h.breeds[(i * 7 + 3) % h.breeds.length];
        const H = this.mk(br, { x: h.x + Math.sin(ang) * rr, z: h.z + Math.cos(ang) * rr, herd: h.id, lead: i === 0 });
        H.hx = h.x; H.hz = h.z; H.roam = h.roam;
      }
    }
    for (const s of STABLES) {
      if (this.placed.has(s.id)) continue;
      this.placed.add(s.id);
      const rails = [];
      for (let i = 0; i < s.rails; i++) rails.push({ x: s.x + i * 2.6, z: s.z + 7, stable: s.id });
      this.rails.push(...rails);
      this.stables.set(s.id, { handDead: false });
      s.horses.forEach((hr, i) => {
        const rail = rails[i % rails.length], H = this.mk(hr.breed, { x: rail.x, z: rail.z - 1.2, owner: `stable:${s.id}`, name: hr.name, bond: 20, saddle: i === 0, price: BREEDS[hr.breed].price });
        H.tied = { x: rail.x, z: rail.z - 1.2, post: true }; H.hx = H.x; H.hz = H.z;
      });
    }
  }
  stableOf(H) { return H.owner.startsWith('stable:') ? STABLES.find((s) => `stable:${s.id}` === H.owner) : null; }
  handOf(sid) { return this.g.chars.find((c) => c.alive && c.stableHand === sid) ?? null; }

  // ---- bodies: a horse near you is a fauna animal -----------------------------------------------------------------------------
  spawnBody(H) {
    const F = this.F();
    if (!F || !this.enabled) return null;
    const S = SPECIES[`horse_${H.breed}`];
    const rec = { id: H.id, sp: `horse_${H.breed}`, x: H.x, z: H.z, hx: H.hx, hz: H.hz, hp: H.hp, dead: !H.alive, deadAt: H.deadAt ?? null, butchered: !!H.butchered, grp: `hg:${H.herd ?? H.id}`, lead: H.lead, var: H.seed, cell: '__horses', buck: false };
    const a = F.make(rec);
    if (!a) return null;
    a.horse = H; H.a = a; a.face = H.face;
    a.maxHp = H.maxHp; a.hp = H.hp;
    a.ctl = H.owner !== 'wild';
    a.p.scale = (S.body.scale ?? 1) * (0.94 + H.seed * 0.12);
    if (!a.ctl) {
      F.groupUp();
      a.gentle = (best) => this.gentleOK(H, best);
    }
    return a;
  }
  dropBody(H, keep = true) {
    const a = this.bodyOf(H);
    if (a) { this.syncDown(H, a); this.F().remove(a, true); }
    H.a = null;
  }
  syncDown(H, a) {
    H.x = a.x; H.z = a.z; H.face = a.face; H.hp = a.hp;
    if (a.dead && H.alive) { this.died(H, 'shot'); }
    if (a.butchered) H.butchered = true;
  }

  // A wild horse lets a person who comes slowly with feed in their pack come close (the fauna sense hook in fauna.js).
  gentleOK(H, best) {
    const g = this.g, P = g.player;
    if (best !== P || H.alive === false) return false;
    const slow = (P.crouch || P.crouched || P.speed < 2.6) && !P.mount;
    return slow && !!this.feedItem() && Math.hypot(P.x - H.x, P.z - H.z) < 24 && g.time - (H.shotAt ?? -99) > 30;
  }
  feedItem() { const c = this.g.inventory?.carried; return c?.count('oats') > 0 ? 'oats' : c?.count('hay') > 0 ? 'hay' : null; }

  // ---- the beat ---------------------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g;
    if (!this.enabled) return;
    this.t += dt;
    if (!this.placed.size) this.place();
    const F = this.F(), now = this.hours(), foc = this.focus();
    const dh = this.lastH === null ? 0 : clamp(now - this.lastH, 0, 6);
    this.lastH = now;
    const P = g.player;
    this.checkT -= dt; this.fearT -= dt;
    const doCheck = this.checkT <= 0; if (doCheck) this.checkT = 0.4;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const H = this.list[i];
      let a = this.bodyOf(H);
      if (H.a && !a) H.a = null;              // fauna cleared it (fauna.enabled=false / clear): the record stands
      const d = Math.hypot(H.x - foc.x, H.z - foc.z);
      const mounted = P.mount === H;
      // a body near you, none far off; a ridden horse is always near
      if (doCheck && !a && F.enabled && d < CARE.liveR && (H.alive || !H.butchered)) a = this.spawnBody(H);
      else if (doCheck && a && d > CARE.dropR && !mounted) { this.dropBody(H); a = null; }
      if (a) {
        if (!H.alive || a.dead) { if (a.dead && H.alive) this.died(H, 'shot'); }
        else if (a.hp < H.hp - 0.4 && H.owner !== 'wild') this.onHit(H, a, H.hp - a.hp);
        H.hp = a.hp;
        if (a.butchered) H.butchered = true;
        H.x = a.x; H.z = a.z; H.face = a.face;
        if (H.alive && a.ctl && !mounted) this.idle(H, a, dt);
      }
      if (H.alive && H.owner !== 'wild' && dh > 0) this.care(H, a, dh);
      if (H.bagBox) { H.bagBox.x = H.x; H.bagBox.z = H.z; }
      if (H.owner === 'wild' && a && H.alive) H.x = a.x, H.z = a.z;
      if (H.fearCd > 0) H.fearCd -= dt;
      if (H.boltT > 0) H.boltT -= dt;
    }
    if (doCheck) { this.pollInfected(); this.hands(); this.trim(); }
    if (P.mount && !P.alive) this.dismount(P, 'down', false); // you went down in the saddle: the horse stands
    if (P.mount) this.riderPose(P);
  }

  // Ledger housekeeping: butchered horses leave it; the dead lie as bones in the fauna layer's own time.
  trim() {
    for (let i = this.list.length - 1; i >= 0; i--) { const H = this.list[i]; if (!H.alive && H.butchered && !this.bodyOf(H) && this.g.player.mount !== H) { this.releaseBags(H); this.list.splice(i, 1); } }
  }

  // The rancher at each stable: stands by the rails while you are near; once killed he is gone for good.
  hands() {
    const g = this.g, foc = this.focus();
    for (const S of STABLES) {
      const st = this.stables.get(S.id);
      if (!st) continue;
      let c = this.handOf(S.id);
      if (c && !c.alive) { st.handDead = true; c.stableHand = null; c = null; }
      const near = Math.hypot(S.x - foc.x, S.z - foc.z) < 160;
      if (!c && near && !st.handDead && g.freeSlots?.length) {
        c = g.addChar({ x: S.x + 1, z: S.z + 4.5, faction: 'drifter', colors: outfit('drifter'), name: S.hand, flag: S.flag, hp: 100 });
        if (c) { c.stableHand = S.id; c.home = { x: c.x, z: c.z }; c.wx = c.x; c.wz = c.z; c.hold = true; c.maxHp = 100; g.society.factions.assign(c); }
      }
    }
  }

  // ---- care: hunger, thirst, hoof, rest, the lame ---------------------------------------------------------------------------------
  care(H, a, dh) {
    const B = this.breed(H), C = CARE;
    // a stable's horse is fed and watered by its keeper while he lives (kill him, or steal it, and the clock is yours)
    const SR = this.stableOf(H);
    if (SR && !H.stolen && !this.stables.get(SR.id)?.handDead) { H.feed = Math.max(H.feed, 0.8); H.water = Math.max(H.water, 0.8); return; }
    H.feed = clamp(H.feed - B.feedDay * dh / 24, 0, 1);
    H.water = clamp(H.water - B.waterDay * dh / 24, 0, 1);
    const moving = a && Math.abs(a.speed) > 0.6;
    if (!moving && H.stamina < 1 && this.g.player.mount !== H) H.stamina = clamp(H.stamina + C.regenStand * dh * 30 * (H.feed > 0.1 ? 1 : 0.2), 0, 1); // dh is hours; x30 is ~2 game min/s
    if (H.feed <= 0) { this.hurtRec(H, a, C.starveHpPerHour * dh, 'starve'); H.bond = Math.max(0, H.bond - C.neglectBondPerDay * dh / 24); }
    if (H.water <= 0) { this.hurtRec(H, a, C.dryHpPerHour * dh, 'thirst'); H.bond = Math.max(0, H.bond - C.neglectBondPerDay * dh / 24); }
    if (H.lame > 0) {
      // it heals only at rest (standing or tied) and fed; a bandage on the leg halves it (use a bandage at the horse)
      const rest = !a || Math.abs(a.speed) < 0.6;
      if (rest && H.feed > 0.15) H.lame = Math.max(0, H.lame - dh);
      if (H.lame <= 0) { H.lameWhy = null; this.g.emit('horseSound', { id: H.id, name: H.name }); }
    }
    if (H.hoof < C.lame.hoofLame && H.lame <= 0 && Math.random() < dh * 0.8) this.lame(H, 'a stone in the hoof');
  }
  hurtRec(H, a, dmg, why) {
    if (a) { a.hp -= dmg; if (a.hp <= 0 && H.alive) { a.hp = 0; this.F().die(a, null, why); } }
    else { H.hp -= dmg; if (H.hp <= 0 && H.alive) { H.hp = 0; this.died(H, why); } }
    H.hp = a ? a.hp : H.hp;
    if (!H.alive || H.hp <= 0) this.stats.starved += why === 'starve' || why === 'thirst' ? 1 : 0;
  }
  lame(H, why, forced = false) {
    if (H.lame > 0 || (H.noLame && !forced)) return;
    H.lame = CARE.lame.hoursToHeal; H.lameWhy = why; this.stats.lamed++;
    this.g.emit('horseLame', { id: H.id, name: H.name, why, hours: H.lame });
    if (this.g.player.mount === H) this.g.hud.toast(`${H.name.toUpperCase()} IS LAME · WALK HER HOME AND REST HER`, 'warn');
  }
  died(H, why) {
    if (!H.alive) return;
    H.alive = false; H.deadAt = this.hours(); this.stats.died++;
    const P = this.g.player;
    if (P.mount === H) this.throwRider(P, 'down', true);
    this.releaseBags(H);
    this.g.emit('horseDied', { id: H.id, name: H.name, breed: H.breed, owner: H.owner, why, x: r1(H.x), z: r1(H.z) });
    if (H.owner === 'player') this.g.hud?.toast?.(`${H.name.toUpperCase()} IS DEAD`, 'warn');
  }

  // ---- feeding, watering, tack (the item verbs) -----------------------------------------------------------------------------------
  nearest(x, z, reach = CARE.mountReach + 1.2, pred = null) {
    let best = null, bd = reach;
    for (const H of this.list) {
      if (!H.alive || (pred && !pred(H))) continue;
      const d = Math.hypot(H.x - x, H.z - z);
      if (d < bd) { bd = d; best = H; }
    }
    return best;
  }
  feedHorse(H, kind) {
    const C = CARE, B = this.breed(H);
    if (!this.g.inventory.spend(kind, 1)) return { ok: false, why: `no ${kind} in your pack` };
    if (kind === 'hay') { if (H.feed > 0.97) { this.g.inventory.stow(kind, 1); return { ok: false, why: `${H.name} is full` }; } H.feed = Math.min(1, H.feed + C.hay); }
    else { H.feed = Math.min(1, H.feed + C.oats); H.stamina = Math.min(1, H.stamina + C.oatsStamina); }
    H.bond = Math.min(100, H.bond + (H.owner === 'wild' ? C.oatsBond : 1.5)); this.stats.fed++;
    this.g.emit('horseFed', { id: H.id, name: H.name, kind, feed: r2(H.feed), bond: r1(H.bond) });
    return { ok: true, text: `${H.name.toUpperCase()} EATS THE ${kind.toUpperCase()} · FED ${Math.round(H.feed * 100)}%` };
  }
  // E on a wild horse that lets you close with feed in your pack: oats bring it round; at the tame bond, a lead rope halters it.
  gentle(H) {
    const C = CARE, g = this.g;
    if (H.owner !== 'wild') return { ok: false, why: 'it is already someone\'s' };
    if (H.bond < C.tameBond) {
      const f = this.feedItem();
      if (!f) return { ok: false, why: 'it wants feed in your hand' };
      const r = this.feedHorse(H, f);
      if (r.ok && H.bond >= C.tameBond) r.text += ' · IT WILL TAKE A ROPE NOW';
      return r;
    }
    if (!g.inventory.carried.count('lead_rope')) return { ok: false, why: 'it will take a halter: you need a lead rope' };
    H.owner = 'player'; H.herd = null; H.hx = H.x; H.hz = H.z; this.stats.tamed++;
    const a = this.bodyOf(H); if (a) { a.ctl = true; a.gentle = null; a.grp = null; }
    g.emit('horseTamed', { id: H.id, name: H.name, breed: H.breed });
    return { ok: true, text: `${H.name.toUpperCase()} IS YOURS · ${BREEDS[H.breed].name.toUpperCase()}` };
  }
  // Items: hay / oats feed it, tack goes on or off it, a rope ties or unties it, a brush gains trust, a pick clears the hooves.
  useItem(verb, itemId) {
    const g = this.g, P = g.player, it = ITEMS[itemId];
    const H = P.mount ?? this.nearest(P.x, P.z, 3.4, (h) => h.owner !== 'wild' || verb === 'horsefeed');
    if (!H) return { ok: false, why: 'no horse within reach' };
    if (verb === 'horsefeed') return this.feedHorse(H, it.feed);
    if (H.owner === 'wild') return { ok: false, why: 'it is not yours to dress' };
    const t = it.tack;
    if (t === 'saddle') { if (H.saddle) { H.saddle = false; g.inventory.stow('saddle', 1); return { ok: true, text: `SADDLE OFF ${H.name.toUpperCase()}` }; } if (P.mount) return { ok: false, why: 'get down first' }; if (!g.inventory.spend('saddle', 1)) return { ok: false, why: 'no saddle' }; H.saddle = true; return { ok: true, text: `${H.name.toUpperCase()} IS SADDLED` }; }
    if (t === 'bags') { if (!H.saddle) return { ok: false, why: 'bags buckle to a saddle' }; if (H.bags) { if (H.bagBox?.slots.length) return { ok: false, why: 'empty the bags first' }; H.bags = false; this.dropBags(H); g.inventory.stow('saddlebags', 1); return { ok: true, text: 'SADDLEBAGS OFF' }; } if (!g.inventory.spend('saddlebags', 1)) return { ok: false, why: 'no saddlebags' }; H.bags = true; this.ensureBags(H); return { ok: true, text: `SADDLEBAGS ON · ${this.breed(H).bagL} L` }; }
    if (t === 'rope') { if (H.tied) { H.tied = null; return { ok: true, text: `${H.name.toUpperCase()} UNTIED` }; } return this.tie(H); }
    if (t === 'brush') return this.groom(H);
    if (t === 'pick') { H.hoof = 1; return { ok: true, text: `${H.name.toUpperCase()}'S HOOVES CLEAN` }; }
    return { ok: false, why: 'not that' };
  }
  groom(H) {
    const C = CARE, now = this.hours();
    if (now - H.brushedAt < C.brushEveryHours) return { ok: false, why: `${H.name} was brushed a short while ago` };
    H.brushedAt = now; H.bond = Math.min(100, H.bond + C.brushBond);
    return { ok: true, text: `${H.name.toUpperCase()} LEANS INTO THE BRUSH · BOND ${Math.round(H.bond)}` };
  }
  tie(H, rail = null) {
    const g = this.g;
    rail ??= this.railNear(H.x, H.z, 3.2);
    if (!rail && !g.inventory.carried.count('lead_rope')) return { ok: false, why: 'tie it to a hitching rail, or carry a lead rope' };
    H.tied = { x: H.x, z: H.z, post: !!rail };
    H.v = 0; return { ok: true, text: `${H.name.toUpperCase()} TIED${rail ? ' AT THE RAIL' : ''}` };
  }
  railNear(x, z, r = 3) { let b = null, bd = r; for (const R of this.rails) { const d = Math.hypot(R.x - x, R.z - z); if (d < bd) { bd = d; b = R; } } return b; }
  // Bandage on a lame leg: half the time.
  treat(H) {
    if (H.lame <= 0) return { ok: false, why: `${H.name} is sound` };
    if (!this.g.inventory.spend('bandage', 1)) return { ok: false, why: 'you need a bandage' };
    H.lame *= CARE.lame.bandageMul; return { ok: true, text: `${H.name.toUpperCase()}'S LEG BOUND · ${r1(H.lame)} H TO HEAL` };
  }
  drink(H, a, dt) {
    const d = this.g.water?.depthAt?.(H.x + Math.sin(H.face) * 0.9, H.z + Math.cos(H.face) * 0.9) ?? 0;
    if (d > 0.08 && H.water < 1) { H.water = Math.min(1, H.water + CARE.drinkPerSec * dt); if (a) a.a.eat = Math.min(1, a.a.eat + dt * 3); if (H.water >= 1) this.stats.watered++; return true; }
    return false;
  }

  // ---- saddlebags -------------------------------------------------------------------------------------------------------------------
  ensureBags(H) {
    if (H.bagBox || !H.bags) return H.bagBox ?? null;
    const inv = this.g.inventory;
    const box = inv.place(`bags:${H.id}`, 'bags', H.x, H.z, this.breed(H).bagL, `${H.name.toUpperCase()} · SADDLEBAGS`);
    box.rolled = true; box.horse = H.id; box.slots = H.bagSlots ?? [];
    H.bagBox = box; H.bagSlots = box.slots;
    return box;
  }
  dropBags(H) { if (H.bagBox) { this.g.inventory.boxes.delete(H.bagBox.id); H.bagBox = null; } }
  releaseBags(H) {
    const inv = this.g.inventory;
    if (H.bagBox?.slots?.length) { const gr = inv.groundAt(H.x, H.z, 0); for (const s of [...H.bagBox.slots]) inv.add(gr, s.id, s.n, s); H.bagBox.slots.length = 0; inv.changed?.(); }
    if (H.bagBox) this.dropBags(H);
    H.bagSlots = [];
  }
  carryKg(H) { return H.bagBox ? H.bagBox.kg() : 0; }

  // ---- mount and dismount ----------------------------------------------------------------------------------------------------------------
  nearFor(p) {
    if (!this.enabled || !p.alive || p.inVehicle || p.mount) return null;
    const H = this.nearest(p.x, p.z, CARE.mountReach + 0.4);
    if (!H) return null;
    const a = this.bodyOf(H);
    if (!a) return null;
    const nm = `${H.name} the ${BREEDS[H.breed].name.toLowerCase()}`;
    if (H.owner === 'wild') {
      if (H.bond >= CARE.tameBond) return { h: H, verb: 'gentle', text: `Halter ${nm} (lead rope)` };
      if (this.feedItem()) return { h: H, verb: 'gentle', text: `Offer ${this.feedItem()} to the wild ${BREEDS[H.breed].name.toLowerCase()} · trust ${Math.round(H.bond)}/${CARE.tameBond}` };
      return { h: H, verb: 'none', text: `A wild ${BREEDS[H.breed].name.toLowerCase()} lets you close · it wants feed in your hand` };
    }
    if (H.owner.startsWith('stable:') && !H.stolen) {
      const S = this.stableOf(H), hand = this.handOf(S.id);
      if (hand && Math.hypot(hand.x - H.x, hand.z - H.z) < 40) return { h: H, verb: 'buy', text: `Buy ${nm} · $${Math.round(H.price)} · <kbd>F</kbd> take her (theft)` };
      return { h: H, verb: 'take', text: `Take ${nm} (nobody is minding the stable)` };
    }
    return { h: H, verb: 'mount', text: `Mount ${nm}${H.tied ? ' (untie)' : ''} · bond ${tierOf(H.bond)}` };
  }
  interact(o, key = 'KeyE') {
    const g = this.g, P = g.player, H = o.h;
    if (o.verb === 'gentle') { const r = this.gentle(H); return r; }
    if (o.verb === 'buy' && key === 'KeyF') return this.steal(H, true);
    if (o.verb === 'buy') {
      const price = Math.round(H.price);
      if (g.cash < price) return { ok: false, why: `$${price}: you have $${Math.floor(g.cash)}` };
      g.cash -= price; H.owner = 'player'; H.tied = H.tied; this.stats.bought++;
      g.emit('horseBought', { id: H.id, name: H.name, price, from: this.stableOf(H)?.name });
      return { ok: true, text: `BOUGHT ${H.name.toUpperCase()} · $${price}` };
    }
    if (o.verb === 'take') return this.steal(H, false);
    if (o.verb === 'mount') return this.mount(P, H);
    return { ok: false, why: 'not now' };
  }
  steal(H, seen) {
    const g = this.g, S = this.stableOf(H);
    const hand = S ? this.handOf(S.id) : null;
    g.society?.deeds?.record('steal', { target: hand ?? null, x: H.x, z: H.z, m: 3, label: `${H.name}, a ${BREEDS[H.breed].name.toLowerCase()} from ${S?.name ?? 'a ranch'}`, tf: hand?.fid, stars: 1, owner: true });
    H.stolen = { from: S?.name ?? '?', day: g.society?.day ?? 0 }; H.owner = 'player'; this.stats.stolen++;
    g.emit('horseStolen', { id: H.id, name: H.name, from: S?.name, witnessed: !!hand });
    return { ...this.mount(g.player, H), stolen: true };
  }
  mount(p, H) {
    const g = this.g, C = CARE;
    if (!H.alive) return { ok: false, why: 'it is dead' };
    const a = this.bodyOf(H);
    if (!a) return { ok: false, why: 'it is out of reach' };
    if (p.mount) return { ok: false, why: 'already in the saddle' };
    if (p.inVehicle) return { ok: false, why: 'get out of the car' };
    if (Math.hypot(a.x - p.x, a.z - p.z) > C.mountReach + 1) return { ok: false, why: 'too far: walk up to it' };
    if (H.owner === 'wild') return { ok: false, why: 'it is wild: oats, patience and a lead rope first' };
    if (H.lame > 0 && H.lame > C.lame.hoursToHeal * 0.6) { /* a very lame horse can be ridden, slowly: the player's call */ }
    p.mount = H; H.rider = p.id; H.tied = null; H.mountT = C.mountSecs; H.v = 0; H.boltT = 0;
    p.seatPose = null; p.speed = 0;
    a.ctl = true; a.a.eat = 0;
    this.stats.mounts++;
    g.emit('mounted', { id: p.id, horse: H.id, name: H.name, bond: r1(H.bond), saddle: H.saddle });
    // a stranger's horse that is not at ease with you throws you at once
    if (H.bond < C.mountBond && H.owner === 'player' && !H.saddle && Math.random() < this.breed(H).spook * 0.5) { this.throwRider(p, 'unfamiliar'); return { ok: false, why: `${H.name} does not know you yet · it throws you` }; }
    return { ok: true, text: `UP ON ${H.name.toUpperCase()}${H.saddle ? '' : ' · BAREBACK'}` };
  }
  dismount(p, why = 'got down', tie = true) {
    const H = p.mount;
    if (!H) return false;
    const a = this.bodyOf(H);
    p.mount = null; p.seatPose = null; H.rider = null; H.dismountT = 0.3;
    if (a) {
      const side = a.face + Math.PI / 2, t = { x: a.x + Math.sin(side) * 1.25, z: a.z + Math.cos(side) * 1.25 };
      this.g.statics.resolveCircle(t, 0.45);
      p.x = t.x; p.z = t.z;
      const rail = tie ? this.railNear(H.x, H.z, 3.4) : null;
      if (rail) { H.tied = { x: H.x, z: H.z, post: true }; this.g.hud?.toast?.(`${H.name.toUpperCase()} TIED AT THE RAIL`, 'job'); }
    }
    p.speed = 0; H.v = 0; H.gait = 'stand';
    this.stats.dismounts++;
    this.g.emit('dismounted', { id: p.id, horse: H.id, name: H.name, why, tied: !!H.tied });
    return true;
  }
  throwRider(p, why, quiet = false) {
    const H = p.mount;
    if (!H) return;
    const g = this.g, dmg = CARE.fright.throwDmg[0] + Math.random() * (CARE.fright.throwDmg[1] - CARE.fright.throwDmg[0]);
    const spd = H.v;
    this.dismount(p, why, false);
    const dx = Math.sin(H.face), dz = Math.cos(H.face);
    const t = { x: p.x + dx * spd * 0.25, z: p.z + dz * spd * 0.25 }; g.statics.resolveCircle(t, 0.45); p.x = t.x; p.z = t.z;
    if (!quiet || why !== 'down') { g.combat.damage(p, dmg * clamp(0.4 + spd / 10, 0.4, 1.4), null, dx, dz, 'fall'); p.knockT = CARE.thrownKnock; p.knockMax = CARE.thrownKnock; }
    this.stats.throws++;
    g.emit('thrown', { id: p.id, from: 'horse', horse: H.id, why, speed: r1(spd) });
    if (!quiet) g.hud?.toast?.(`THROWN · ${H.name.toUpperCase()} ${why === 'hit' ? 'WAS HIT' : why === 'fright' ? 'BOLTED' : why === 'unfamiliar' ? 'DOES NOT KNOW YOU' : 'WENT DOWN'}`, 'warn');
  }

  // ---- riding ---------------------------------------------------------------------------------------------------------------------------------------
  // Called from main.updatePlayer while p.mount is set (before the on-foot code, like the car branch). Returns true: the rest of
  // the on-foot code is skipped; main then aims and shoots from the saddle.
  ride(p, I, dt) {
    const g = this.g, C = CARE, H = p.mount, a = H ? this.bodyOf(H) : null;
    if (!H || !a || !H.alive || a.dead) { if (H) this.throwRider(p, 'down', true); return false; }
    const B = this.breed(H);
    a.ctl = true;
    // input: the same stick/keys the on-foot code reads, camera-relative
    let mx = 0, mz = 0;
    if (I.key('KeyW') || I.key('ArrowUp')) mz -= 1;
    if (I.key('KeyS') || I.key('ArrowDown')) mz += 1;
    if (I.key('KeyA') || I.key('ArrowLeft')) mx -= 1;
    if (I.key('KeyD') || I.key('ArrowRight')) mx += 1;
    const pm = g.controls.move;
    const keys = !!(mx || mz);
    if (pm.mag) { mx += pm.x; mz += pm.z; }
    if (g.cam.yaw) { const w = g.cam.toWorld(mx, mz); mx = w.x; mz = w.z; }
    let want = null;                              // the heading asked for
    let gait = 'stand';
    const stickLight = !keys && pm.mag && pm.mag < 0.55;
    if (H.goto) {                                   // agents: rideTo
      const dx = H.goto.x - a.x, dz = H.goto.z - a.z, dist = Math.hypot(dx, dz);
      if (dist < (H.goto.tol ?? 2.2)) { H.goto = null; g.emit('arrived', { x: r1(a.x), z: r1(a.z), horse: H.id }); }
      else { want = Math.atan2(dx, dz); gait = H.goto.gait ?? 'trot'; if (H.goto.hop && H.hopT <= 0 && H.v > 2 && g.statics.pointBlocked(a.x + Math.sin(want) * 2.2, a.z + Math.cos(want) * 2.2, 0.4)) this.hop(H, a); }
    } else if (Math.hypot(mx, mz) > 0.08) {
      want = Math.atan2(mx, mz);
      gait = 'trot';
      if (stickLight || g.controls.held('crouch')) gait = 'walk';
      else if (g.controls.held('sprint') || I.key('ShiftLeft')) gait = 'canter';
      if (g.controls.held('dive') || I.key('Space')) gait = 'gallop';
    }
    if (H.mountT > 0) { H.mountT -= dt; want = null; gait = 'stand'; }
    // frightened: the reins are no use
    if (H.boltT > 0) { want = H.boltDir; gait = H.blown ? 'canter' : 'gallop'; }
    // limits: blown wind, lameness, weakness
    const ixG = (id) => GAIT_ORDER.indexOf(id);
    let cap = 4;
    if (H.blown) cap = Math.min(cap, 1);
    if (H.lame > 0) cap = Math.min(cap, 2);
    if (H.feed <= 0.05 || H.water <= 0.05) cap = Math.min(cap, 2);
    if (ixG(gait) > cap) gait = GAIT_ORDER[cap];
    if (gait === 'gallop' && H.stamina <= 0.02) { gait = 'canter'; }
    // terrain: the biome under it, the water in front of it
    const biome = g.fauna.biomeAt(a.x, a.z), T = C.terrain[biome] ?? { v: 0.9, tire: 1.15 };
    const depth = g.water?.depthAt?.(a.x, a.z) ?? 0;
    let tv = T.v, tt = T.tire;
    if (depth > C.swim.from) { tv *= C.swim.v; tt *= C.swim.tire; if (ixG(gait) > 2) gait = 'trot'; }
    else if (depth > C.wade.from) { tv *= C.wade.v; tt *= C.wade.tire; if (ixG(gait) > 3) gait = 'canter'; }
    // the load: rider and pack over what the breed carries
    const load = g.inventory.kg() + this.carryKg(H) + 70 - B.carryKg, over = Math.max(0, load);
    const loadV = 1 - Math.min(C.overload.max, over * C.overload.perKg), loadT = 1 + over * C.overload.tirePerKg;
    const lameV = H.lame > 0 ? C.lame.slowMul : 1, hungerV = H.feed < C.hungry || H.water < C.thirsty ? 0.85 : 1;
    const vt = gait === 'stand' ? 0 : B.speed[gait] * tv * loadV * lameV * hungerV;
    // speed: horses start and stop on a few strides
    const turnTo = want === null ? 0 : Math.abs(wrap(want - a.face));
    const acc = vt > H.v ? 4.6 : 8.5;
    H.v += clamp(vt - H.v, -acc * dt, acc * dt);
    if (turnTo > 1.2 && H.v > 3.5) H.v *= Math.max(0, 1 - dt * 2.2);   // it cannot turn flat out: it slows into the corner
    if (want !== null) {
      const rate = (H.v < 0.3 ? 2.6 : 3.4 - 1.9 * clamp(H.v / 12, 0, 1)) * (H.boltT > 0 ? 0.5 : 1);
      a.face = angleLerp(a.face, a.face + wrap(want - a.face), Math.min(1, rate * dt));
    }
    // stamina: the tank empties by gait x tire x terrain x load; refills when it eases
    const gd = GAITS[H.v < 0.4 ? 'stand' : H.v > B.speed.canter * 0.9 ? 'gallop' : H.v > B.speed.trot * 0.9 ? 'canter' : H.v > B.speed.walk * 1.2 ? 'trot' : 'walk'];
    H.gait = gd.id;
    const dr = gd.drain > 0 ? gd.drain * B.tire * tt * loadT : gd.drain;
    const was = H.stamina;
    H.stamina = clamp(H.stamina - dr * dt * (H.feed > 0.1 ? 1 : 1.6), 0, 1);
    if (H.stamina <= 0.001 && !H.blown) { H.blown = true; this.stats.blown++; g.emit('horseBlown', { id: H.id, name: H.name }); g.hud?.toast?.(`${H.name.toUpperCase()} IS BLOWN · EASE OFF`, 'warn'); if (gd.id === 'gallop' && Math.random() < C.lame.blownGallop * 20) this.lame(H, 'ridden past its wind'); }
    if (H.blown && H.stamina >= C.blownRecover) H.blown = false;
    if (was > 0.001 && gd.id === 'gallop' && (T.tire > 1.2) && Math.random() < C.lame.gallopRough * dt) this.lame(H, 'a bad step on rough ground');
    H.hoof = clamp(H.hoof - C.lame.hoofWear * H.v * dt * tt, 0, 1);
    // hop
    if (H.hopT <= 0 && !H.goto && (I.hit('Space') || g.controls.hit('dive')) && H.v > B.speed.walk * 1.5 && H.stamina > C.hop.cost && ixG(gait) >= ixG(C.hop.minGait)) this.hop(H, a);
    if (H.hopT > 0) { H.hopT -= dt; const k = 1 - Math.max(0, H.hopT) / C.hop.secs; a.y = Math.sin(clamp(k, 0, 1) * Math.PI) * C.hop.rise; a.air = true; a.vy = Math.cos(k * Math.PI) * 3; if (H.hopT <= 0) { a.y = g.stunts?.heightAt?.(a.x, a.z, 0) ?? 0; a.air = false; a.vy = 0; g.fx?.dust?.(a.x, a.z, 2); } }
    // move
    const dist = H.v * dt;
    const pos = { x: a.x + Math.sin(a.face) * dist, z: a.z + Math.cos(a.face) * dist };
    const minY = H.hopT > 0 ? a.y + 0.05 : -Infinity;
    const moved0 = Math.hypot(pos.x - a.x, pos.z - a.z);
    g.statics.resolveCircle(pos, 0.7, null, minY);
    const moved = Math.hypot(pos.x - a.x, pos.z - a.z);
    if (depth > C.swim.from + 0.6 && vt > 0) { /* deep water: the current is the water system's, the horse swims on */ }
    if (moved0 > 0.01 && moved < moved0 * 0.45 && H.v > 3) H.v *= 0.5;            // a wall: the stride breaks
    if (H.v > 7 && moved0 > 0.01 && moved < moved0 * 0.25 && H.hopT <= 0 && H.boltT > 0) { this.hurtRec(H, a, 8, 'crash'); this.throwRider(p, 'fright'); return false; }
    a.x = pos.x; a.z = pos.z;
    a.vx = Math.sin(a.face) * H.v; a.vz = Math.cos(a.face) * H.v;
    a.speed = moved / Math.max(dt, 1e-4);
    if (H.hopT <= 0) a.y = a.air ? a.y : (g.stunts?.heightAt?.(a.x, a.z, 0) ?? 0);
    a.state = H.v > 0.4 ? 'roam' : 'idle'; a.fleeT = 0; a.threat = null;
    H.x = a.x; H.z = a.z; H.face = a.face;
    H.km += moved / 1000;
    if (H.owner === 'player' && moved > 0) H.bond = Math.min(100, H.bond + C.rideBondPerKm * moved / 1000);
    p.x = a.x; p.z = a.z; p.speed = a.speed;
    // water in its mouth: stand in a ford and it drinks
    if (H.v < 0.4 && depth > 0.08) this.drink(H, a, dt);
    // the sound of it
    H.hoofT = (H.hoofT ?? 0) - dt;
    if (H.hoofT <= 0 && gd.noise > 0) { H.hoofT = C.noise.hoofEvery; this.hoofing = true; try { g.noise(a.x, a.z, gd.noise, p); } finally { this.hoofing = false; } } // its own hoofbeats never frighten it
    this.riderPose(p);
    p.aiming = g.arms?.stance === 'raised';
    // keys: E gets down; the pack and the rest are the on-foot code's (main.js)
    if (I.hit('KeyE') && H.mountT <= 0) { this.dismount(p, 'got down'); return false; }
    return true;
  }
  hop(H, a) {
    H.hopT = CARE.hop.secs; H.stamina = Math.max(0, H.stamina - CARE.hop.cost); this.stats.hops++;
    this.g.emit('horseHop', { id: H.id, x: r1(a.x), z: r1(a.z) });
  }
  // Where the rider sits: on the back, a little behind the withers; rises into the saddle over mountSecs.
  backY(a) {
    const s = a.p.scale ?? 1, B = a.B, build = B.build;
    const legK = (build === 'long' ? 0.84 : build === 'heavy' ? 0.95 : 1) * (B.legK ?? 1);
    const standH = (0.27 * s * legK * 2) * 0.97 + 0.05 * s;
    return a.y + standH + 0.2 * s * (build === 'heavy' ? 1.12 : 1) * (B.deepK ?? 1);
  }
  riderPose(p) {
    const H = p.mount, a = H && this.bodyOf(H);
    if (!a) return;
    const sp = (p._ridePose ??= { x: 0, y: 0, z: 0, h: 0, lean: 0, pitch: 0, kind: 'ride', twist: 0 });
    const k = H.mountT > 0 ? 1 - H.mountT / CARE.mountSecs : 1, by = this.backY(a) - 0.86;
    const rock = H.v > 1 ? Math.sin(a.a.phase * TAU * 2) * 0.03 * clamp(H.v / 6, 0, 1.5) : 0;
    sp.x = a.x - Math.sin(a.face) * 0.12; sp.z = a.z - Math.cos(a.face) * 0.12; sp.y = a.y + (by - a.y) * k + rock;
    sp.h = a.face; sp.kind = 'ride';
    sp.twist = p.aiming ? clamp(wrap(p.face - a.face), -2.6, 2.6) : 0;
    sp.pitch = a.a ? -(a.air ? 0.08 : 0) : 0; sp.lean = 0;
    p.seatPose = sp;
  }
  aimTax(ch) {
    const H = ch.mount; if (!H) return 1;
    const C = CARE.rider;
    return (H.gait === 'gallop' ? C.aimTaxGallop : H.v > 0.5 ? C.aimTax : 1.25) * (H.saddle ? 1 : 1.6) * (H.boltT > 0 ? 1.8 : 1);
  }
  meleeTax() { return CARE.rider.meleeTax; }
  canMelee(ch) { const H = ch.mount; return !!H && H.saddle && H.boltT <= 0; }

  // ---- the horse that is not ridden ------------------------------------------------------------------------------------------------------------------------
  idle(H, a, dt) {
    const g = this.g, B = this.breed(H);
    a.ctl = true;
    a.stT += dt;
    // a bolt: run from the fright, then settle home
    let tx = a.x, tz = a.z, v = 0;
    if (H.boltT > 0) { tx = a.x + Math.sin(H.boltDir) * 20; tz = a.z + Math.cos(H.boltDir) * 20; v = B.speed.gallop * (H.blown ? 0.5 : 1); a.state = 'flee'; }
    else if (H.tied) {
      const d = Math.hypot(H.tied.x - a.x, H.tied.z - a.z);
      if (d > 0.4) { tx = H.tied.x; tz = H.tied.z; v = B.speed.walk; }
    } else {
      // a free tame horse stays about where you left it, grazes, and goes to water if it is thirsty and there is some near
      H.wanderT = (H.wanderT ?? 0) - dt;
      if (H.wanderT <= 0) { H.wanderT = 6 + Math.random() * 10; const ang = Math.random() * TAU, rr = Math.random() * 7; H.goal = { x: H.hx + Math.sin(ang) * rr, z: H.hz + Math.cos(ang) * rr }; if (H.water < 0.45) H.goal = this.waterGoal(H) ?? H.goal; }
      if (H.goal) { const d = Math.hypot(H.goal.x - a.x, H.goal.z - a.z); if (d > 1.2 && !a.air) { tx = H.goal.x; tz = H.goal.z; v = B.speed.walk * 0.6; } }
    }
    this.moveFree(H, a, dt, tx, tz, v);
    // grazing / drinking where it stands
    const still = Math.abs(a.speed) < 0.3;
    H.graze = false;
    if (still && H.boltT <= 0) {
      if (this.drink(H, a, dt)) a.state = 'graze';
      else if (H.feed < 0.97) H.graze = this.grazeStep(H, a, dt);
    }
    if (!H.graze) a.a.eat = Math.max(0, a.a.eat - dt * 2);
    a.state = H.boltT > 0 ? 'flee' : still ? (H.graze ? 'graze' : 'idle') : 'roam';
  }
  waterGoal(H) {
    const g = this.g;
    for (let r = 6; r <= 36; r += 6) for (let k = 0; k < 8; k++) { const ang = k * TAU / 8, x = H.x + Math.sin(ang) * r, z = H.z + Math.cos(ang) * r; if ((g.water?.depthAt?.(x, z) ?? 0) > 0.1 && (g.water?.depthAt?.(x, z) ?? 0) < 0.8) return { x, z }; }
    return null;
  }
  grazeStep(H, a, dt) {
    const g = this.g, G = CARE.graze, b = g.fauna.biomeAt(a.x, a.z);
    if (H.noGraze) return false;                            // hobbled or fed by hand only (tests, and a stable's stalled horse)
    if (!G.biomes.includes(b)) return false;
    const P = g.outdoors?.patch?.(a.x, a.z);
    if (!P || P.r < G.minPatch) return false;
    const dh = dt * 2 / 60;                                 // game hours this step (the game clock runs ~2 game min a second)
    P.r = Math.max(0, P.r - G.patchPerHour * dh);          // the patch thins like a forage does, and grows back (outdoors.patch)
    H.feed = Math.min(1, H.feed + G.perHour * dh * P.r);
    a.a.eat = Math.min(1, a.a.eat + dt * 2);
    return true;
  }
  // a free horse's simple steering (the fauna move() brain-less): walk toward a point, stop at walls and deep water
  moveFree(H, a, dt, tx, tz, v) {
    const g = this.g, dx = tx - a.x, dz = tz - a.z, dist = Math.hypot(dx, dz);
    let want = v > 0 && dist > 0.2 ? Math.atan2(dx, dz) : a.face;
    const S = a.S;
    if (v > 0 && dist > 0.2) a.face = angleLerp(a.face, want, Math.min(1, (S.turn ?? 4) * dt * (a.speed > 4 ? 0.7 : 1.4)));
    const sp = v > 0 && dist > 0.2 ? Math.min(v, dist * 3) : 0;
    const k = Math.min(1, dt * 5), wx = Math.sin(a.face) * sp, wz = Math.cos(a.face) * sp;
    a.vx += (wx - a.vx) * k; a.vz += (wz - a.vz) * k;
    const pos = { x: a.x + a.vx * dt, z: a.z + a.vz * dt };
    if ((g.water?.depthAt?.(pos.x, pos.z) ?? 0) > 0.9) { pos.x = a.x; pos.z = a.z; a.vx *= 0.3; a.vz *= 0.3; }
    g.statics.resolveCircle(pos, 0.7);
    const moved = Math.hypot(pos.x - a.x, pos.z - a.z);
    a.x = pos.x; a.z = pos.z; a.speed = moved / Math.max(dt, 1e-4);
    a.y = g.stunts?.heightAt?.(a.x, a.z, a.y) ?? 0;
    H.x = a.x; H.z = a.z; H.v = a.speed;
    if (v === 0 && !H.tied && !H.boltT) { H.hx += (a.x - H.hx) * 0.02; H.hz += (a.z - H.hz) * 0.02; }
  }

  // ---- fright, hits ------------------------------------------------------------------------------------------------------------------------------------------
  // main.noise -> here: a bang, a blast, an engine at the throttle. src: who made it.
  onNoise(x, z, r, src) {
    if (!this.enabled || r < 30 || this.hoofing) return;
    const C = CARE.fright, P = this.g.player;
    for (const H of this.list) {
      if (!H.alive || H.owner === 'wild' || H.fearCd > 0) continue;
      const d = Math.hypot(H.x - x, H.z - z);
      if (d > Math.min(r, C.gun)) continue;
      const own = src === P && (P.mount === H) ;
      this.frighten(H, x, z, own ? C.ownGun : 1, r >= C.blast ? 1.4 : 1);
    }
  }
  frighten(H, fx, fz, mul = 1, loud = 1, why = 'fright') {
    const C = CARE.fright, B = this.breed(H), P = this.g.player, a = this.bodyOf(H);
    if (!a || H.fearCd > 0 || H.boltT > 0) return false;
    const calm = H.owner === 'player' ? clamp(H.bond / 100, 0, 0.95) : 0.1;
    const chance = clamp(B.spook * Math.pow(1 - calm, 1.4) * mul * loud, 0, 0.98);
    H.fearCd = C.cool;
    if (Math.random() >= chance) { a.a.flinch = 1; return false; }
    H.boltDir = Math.atan2(H.x - fx, H.z - fz);
    H.boltT = C.bolt[0] + Math.random() * (C.bolt[1] - C.bolt[0]);
    this.stats.bolts++;
    this.g.emit('horseBolt', { id: H.id, name: H.name, why, chance: r2(chance), ridden: P.mount === H, x: r1(H.x), z: r1(H.z) });
    if (H.tied && !H.tied.post && Math.random() < 0.5) H.tied = null;                      // a rope tied to nothing holds worse than a rail
    if (H.tied) H.boltT = 0.6;                                                              // tied: it plunges and pulls but holds
    if (P.mount === H) { H.goto = null; if (chance > C.throwAt && H.bond < 60 && Math.random() < chance) this.throwRider(P, 'fright'); else this.g.hud?.toast?.(`${H.name.toUpperCase()} BOLTS`, 'warn'); }
    return true;
  }
  onHit(H, a, dmg) {
    const P = this.g.player, T = CARE.hitThrow;
    this.g.emit('horseHit', { id: H.id, name: H.name, dmg: r1(dmg), hp: Math.round(a.hp) });
    H.shotAt = this.g.time;
    if (H.owner === 'wild') return;
    if (P.mount === H && (dmg >= T.dmg || a.hp < H.maxHp * T.below)) { this.throwRider(P, 'hit'); }
    else if (P.mount === H) this.g.hud?.toast?.(`${H.name.toUpperCase()} IS HIT`, 'warn');
    if (a.hp / H.maxHp < 0.35 && H.lame <= 0 && Math.random() < 0.5) this.lame(H, 'a wound to the leg');
    const spook = this.frighten(H, a.x - Math.sin(a.face) * 4, a.z - Math.cos(a.face) * 4, 1.4, 1.2, 'hit');
    void spook;
  }
  // The infected and fire frighten a tame horse at a distance (checked on the slow beat).
  pollInfected() {
    const g = this.g, C = CARE.fright;
    for (const H of this.list) {
      if (!H.alive || H.owner === 'wild' || H.fearCd > 0 || !this.bodyOf(H)) continue;
      for (const f of g.throwables?.fires ?? []) if (Math.hypot(f.x - H.x, f.z - H.z) < f.r + C.fire) { this.frighten(H, f.x, f.z, 1, 1, 'fire'); break; }
      if (H.fearCd > 0) continue;
      for (const c of g.chars) if (c.faction === 'zombie' && c.alive && Math.abs(c.x - H.x) < C.infected && Math.abs(c.z - H.z) < C.infected && Math.hypot(c.x - H.x, c.z - H.z) < C.infected) { this.frighten(H, c.x, c.z, 1.1, 1, 'infected'); break; }
    }
  }

  // ---- surfaces for the player ------------------------------------------------------------------------------------------------------------------------------------
  chip(p) {
    const H = p.mount;
    if (!H) return null;
    const B = this.breed(H), bar = (v) => `<b style="color:${v < 0.25 ? '#e0603a' : v < 0.5 ? '#e0b43a' : '#8fbf5a'}">${'▮'.repeat(Math.round(v * 8)).padEnd(8, '▯')}</b>`;
    return `<b>${H.name.toUpperCase()}</b> ${H.gait.toUpperCase()}${H.blown ? ' <b style="color:#e0603a">BLOWN</b>' : ''}${H.lame > 0 ? ' <b style="color:#e0603a">LAME</b>' : ''} · WIND ${bar(H.stamina)} FEED ${bar(H.feed)} WATER ${bar(H.water)}`;
  }
  view(H) {
    const a = this.bodyOf(H), P = this.g.player;
    return {
      id: H.id, name: H.name, breed: H.breed, owner: H.owner, alive: H.alive, x: r1(H.x), z: r1(H.z), hp: Math.round(H.hp), maxHp: H.maxHp,
      feed: r2(H.feed), water: r2(H.water), stamina: r2(H.stamina), hoof: r2(H.hoof), lame: r1(H.lame), lameWhy: H.lameWhy ?? null, blown: H.blown, bond: r1(H.bond), tier: tierOf(H.bond),
      saddle: H.saddle, bags: H.bags, bagItems: H.bagBox ? H.bagBox.slots.map((s) => `${s.id}x${s.n}`) : [], tied: H.tied ? { x: r1(H.tied.x), z: r1(H.tied.z), post: !!H.tied.post } : null,
      gait: H.gait, speed: r1(H.v), ridden: P.mount === H, body: !!a, state: a?.state ?? null, stolen: H.stolen ?? null, km: r2(H.km), price: Math.round(H.price), dist: r1(Math.hypot(H.x - P.x, H.z - P.z)),
    };
  }
  summary() {
    const live = this.list.filter((h) => this.bodyOf(h)).length;
    return { enabled: this.enabled, total: this.list.length, alive: this.list.filter((h) => h.alive).length, mine: this.mine().length, wild: this.list.filter((h) => h.alive && h.owner === 'wild').length, bodies: live, placed: [...this.placed], stables: Object.fromEntries([...this.stables].map(([k, v]) => [k, v.handDead])), rails: this.rails.length, drawn: this.r?.n ?? 0, graves: this.graves.length, stats: { ...this.stats } };
  }
  validate() { return validateHorses(); }

  // ---- a grave for a horse (death-rites style: a mound, a marker and a name; the bond is the cost of the shovel's time) -------------------
  bury(H) {
    const g = this.g;
    if (H.alive) return { ok: false, why: 'it is not dead' };
    if (!g.inventory.carried.count('shovel') && !g.inventory.carried.count('trowel') && !g.inventory.carried.count('crowbar')) return { ok: false, why: 'you need something to dig with (a shovel)' };
    const a = this.bodyOf(H); if (a) this.F().remove(a, true);
    this.graves.push({ x: H.x, z: H.z, name: H.name, breed: H.breed, day: g.society?.day ?? 0 });
    H.butchered = true; H.buried = true; this.stats.buried++;
    g.emit('horseBuried', { id: H.id, name: H.name, x: r1(H.x), z: r1(H.z) });
    return { ok: true, text: `${H.name.toUpperCase()} BURIED` };
  }
  deadNear(x, z, r = 3) { let b = null, bd = r; for (const H of this.list) { if (H.alive || H.butchered || H.owner !== 'player') continue; const d = Math.hypot(H.x - x, H.z - z); if (d < bd) { bd = d; b = H; } } return b; }

  // ---- the world's mention of a horse ---------------------------------------------------------------------------------------------------------------------------
  // A stray horse near a road is something people say. radio/pulls read this: the nearest unowned horse's place and breed.
  strayNear(x, z, r = 4000) {
    let b = null, bd = r;
    for (const H of this.list) { if (!H.alive || H.owner !== 'wild') continue; const d = Math.hypot(H.x - x, H.z - z); if (d < bd) { bd = d; b = H; } }
    return b && { id: b.id, breed: b.breed, name: BREEDS[b.breed].name, herd: b.herd, x: r1(b.x), z: r1(b.z), dist: Math.round(bd) };
  }

  // ---- the shard and the save -------------------------------------------------------------------------------------------------------------------------------------------
  save() {
    for (const H of this.list) { const a = this.bodyOf(H); if (a) this.syncDown(H, a); }
    const P = this.g.player;
    return {
      seq: this.seq, placed: [...this.placed], stables: [...this.stables].map(([k, v]) => [k, v.handDead]), graves: this.graves.map((x) => ({ ...x })), stats: { ...this.stats }, mounted: P.mount?.id ?? null,
      list: this.list.map((H) => ({
        id: H.id, breed: H.breed, name: H.name, seed: H.seed, owner: H.owner, herd: H.herd, lead: H.lead, x: r2(H.x), z: r2(H.z), face: r2(H.face), hx: r1(H.hx), hz: r1(H.hz), roam: H.roam,
        hp: Math.round(H.hp), maxHp: H.maxHp, alive: H.alive, deadAt: H.deadAt ?? null, butchered: !!H.butchered, feed: r2(H.feed), water: r2(H.water), stamina: r2(H.stamina), hoof: r2(H.hoof), lame: r2(H.lame), lameWhy: H.lameWhy ?? null,
        bond: r2(H.bond), saddle: H.saddle, bags: H.bags, bagSlots: (H.bagBox ? H.bagBox.slots : H.bagSlots ?? []).map((s) => ({ ...s })), tied: H.tied ? { ...H.tied } : null, stolen: H.stolen ?? null, price: H.price, t: r2(H.t ?? 0), brushedAt: r2(H.brushedAt), km: r2(H.km), born: H.born,
      })),
    };
  }
  load(s) {
    // bodies and bags of the horses we had are gone; the ledger comes back
    for (const H of this.list) { const a = this.bodyOf(H); if (a) this.F().remove(a, true); this.dropBags(H); }
    this.list.length = 0; this.placed = new Set(); this.stables.clear(); this.graves = []; this.rails = HITCHES.map((h) => ({ ...h }));
    this.g.player.mount = null; this.g.player.seatPose = null;
    if (!s) return;
    this.seq = s.seq ?? 0; this.placed = new Set(s.placed ?? []);
    for (const [k, dead] of s.stables ?? []) this.stables.set(k, { handDead: dead });
    for (const S of STABLES) if (this.placed.has(S.id)) for (let i = 0; i < S.rails; i++) this.rails.push({ x: S.x + i * 2.6, z: S.z + 7, stable: S.id });
    this.graves = (s.graves ?? []).map((x) => ({ ...x }));
    Object.assign(this.stats, s.stats ?? {});
    for (const r of s.list ?? []) {
      const H = { ...r, a: null, v: 0, gait: 'stand', blown: false, boltT: 0, boltDir: 0, hopT: 0, fearCd: 0, mountT: 0, dismountT: 0, graze: false, bagBox: null };
      H.bagSlots = (r.bagSlots ?? []).map((x) => ({ ...x }));
      this.list.push(H);
      if (H.bags) this.ensureBags(H);
    }
    this.lastH = null; this.checkT = 0;
    const m = s.mounted && this.get(s.mounted);
    if (m) { const P = this.g.player; this.spawnBody(m); if (this.bodyOf(m)) { P.mount = m; m.rider = P.id; this.riderPose(P); } }
  }

  draw(dt) { this.r?.sync(this, dt); }
}

// ======================================================================================================================
// The tack, the rails and the graves: ONE instanced box mesh (one draw call) in world space. A saddle and bags ride on the
// fauna body's own pose (the same back height the rider sits at); posts and rails are fixed.
class HorseRenderer {
  constructor(scene) {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85 }), MAXI);
    m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false;
    for (let i = 0; i < MAXI; i++) { m.setMatrixAt(i, ZERO); m.setColorAt(i, _c.set('#888')); }
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.visible = false;
    scene.add(m);
    this.m = m; this.n = 0;
  }
  box(x, y, z, sx, sy, sz, yaw, pitch, roll, hex) {
    if (this.n >= MAXI) return;
    _e.set(pitch, yaw, roll, 'YXZ'); _q.setFromEuler(_e);
    _M.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.m.setMatrixAt(this.n, _M); this.m.setColorAt(this.n++, _c.set(hex));
  }
  sync(S, dt) {
    const g = S.g, cam = g.camLook ?? g.player, R = 120;
    this.n = 0;
    for (const H of S.list) {
      const a = S.bodyOf(H);
      if (!a || Math.abs(a.x - cam.x) > R || Math.abs(a.z - cam.z) > R) continue;
      if (!H.saddle && !H.bags) continue;
      if (a.dead) continue;
      const y = S.backY(a) - 0.08, s = a.p.scale ?? 1, f = a.face, sf = Math.sin(f), cf = Math.cos(f), lx = cf, lz = -sf;
      const rock = a.a.air ? 0 : 0;
      if (H.saddle) {
        this.box(a.x - sf * 0.08, y, a.z - cf * 0.08, 0.5 * s * 0.55, 0.07, 0.62 * s * 0.5, f, 0, 0, '#5a3a22');            // the seat
        this.box(a.x + sf * 0.2 * s * 0.5, y + 0.07, a.z + cf * 0.2 * s * 0.5, 0.1, 0.1, 0.12, f, 0, 0, '#3a2616');          // the horn
        this.box(a.x - sf * 0.34 * s * 0.5, y + 0.06, a.z - cf * 0.34 * s * 0.5, 0.3 * s * 0.5, 0.1, 0.1, f, 0, 0, '#3a2616'); // the cantle
        this.box(a.x, y - 0.1, a.z, 0.62 * s * 0.5, 0.05, 0.7 * s * 0.5, f, 0, 0, '#c2a47c');                                  // the blanket under it
      }
      if (H.bags) {
        for (const sd of [-1, 1]) this.box(a.x + lx * sd * 0.34 * s * 0.5 - sf * 0.1, y - 0.28, a.z + lz * sd * 0.34 * s * 0.5 - cf * 0.1, 0.14, 0.32, 0.4 * s * 0.5, f, 0, 0, '#6a4a2c');
      }
      void rock;
    }
    // rails: two posts and a bar each, graves: a mound and a marker
    for (const R of S.rails) {
      if (Math.abs(R.x - cam.x) > R2 || Math.abs(R.z - cam.z) > R2) continue;
      this.box(R.x - 0.9, 0.55, R.z, 0.14, 1.1, 0.14, 0, 0, 0, '#5a432b'); this.box(R.x + 0.9, 0.55, R.z, 0.14, 1.1, 0.14, 0, 0, 0, '#5a432b');
      this.box(R.x, 0.95, R.z, 2.1, 0.1, 0.1, 0, 0, 0, '#6e5236');
    }
    for (const G of S.graves) {
      if (Math.abs(G.x - cam.x) > R2 || Math.abs(G.z - cam.z) > R2) continue;
      this.box(G.x, 0.12, G.z, 1.0, 0.24, 2.2, 0, 0, 0, '#7a6246'); this.box(G.x, 0.5, G.z - 1.3, 0.12, 0.9, 0.12, 0, 0, 0, '#cfc7b4'); this.box(G.x, 0.7, G.z - 1.3, 0.5, 0.1, 0.1, 0, 0, 0, '#cfc7b4');
    }
    const m = this.m; m.count = this.n; m.visible = this.n > 0;
    if (this.n === 0 && m._n === 0) return;
    m._n = this.n;
    const A = m.instanceMatrix; A.clearUpdateRanges(); A.addUpdateRange(0, Math.max(1, this.n) * 16); A.needsUpdate = true;
    const C = m.instanceColor; if (C) { C.clearUpdateRanges(); C.addUpdateRange(0, Math.max(1, this.n) * 3); C.needsUpdate = true; }
  }
}
const R2 = 150;
