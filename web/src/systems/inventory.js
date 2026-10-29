import { ITEMS, LOOT, START_KIT, BODY_LITRES, AMMO_ITEM, GUN_ITEM, GUN_WEAR, GUN_CARE, GUN_FOUND } from '../data/items.js';
import * as THREE from 'three';
import { makeRng } from '../engine/rng.js';
import { WEAPONS } from './combat.js';
import { LEVEL } from '../data/storeys.js';
import { PROGRAMMES } from '../data/floorplans.js';

// What you carry and what the world holds (docs/design/WEB_INVENTORY.md). Everything is an item in a container,
// rounds included. The guns you carry are your loadout (g.inv.weapons: holster and sling, outside the list, quick
// to hand); a gun you put down becomes an item that keeps its condition and the rounds in it.
//   carried   - one list on your person: pockets and belt (BODY_LITRES) plus whatever pack you wear
//   worn      - the pack on your back (an item id, outside the list; its litres are the list's extra room)
//   boxes     - the world's containers (cupboards, crates, trunks, the dead): placed by whoever builds the place,
//               rolled from a seeded loot table the first time anyone opens them, saved once touched
// A slot is { id, n, left?, made?, cond?, loaded? }: left = uses left in a thing that has uses (stack 1), made = the
// game hour food was fresh from (it spoils on the game clock, not in real time), cond and loaded = a gun's condition
// (1 clean, 0 broken) and the rounds in it.
const MAX_BODIES = 60;
const BOUND = Symbol('rounds are items');
// What a shop's shelves and crates hold (by the shopkeeper's trade), and what a home's shelves might.
const SHOP_LOOT = { Clinic: 'bathroom', Mechanic: 'garage', Gunsmith: 'gunsmith', 'Water Trader': 'kitchen', 'Radio DJ': 'office', 'Warden Captain': 'office' };
const HOME_LOOT = ['kitchen', 'bathroom', 'bedroom', 'office', 'kitchen'];
const TRUNK = { rig: 900, interceptor: 260, buggy: 60, pickup: 700, sedan: 380, van: 1400, rv: 600, airboat: 120, jetski: 20, gunboat: 400, atv: 50, bike: 22, patrol: 600, apc: 1200 };

export class Container {
  constructor(id, label, cap, kind = 'box') { this.id = id; this.label = label; this.cap = cap; this.kind = kind; this.slots = []; }
  litres() { let l = 0; for (const s of this.slots) l += (ITEMS[s.id]?.bulk ?? 0) * s.n; return l; }
  kg() { let k = 0; for (const s of this.slots) k += slotKg(s); return k; }
  count(id) { let n = 0; for (const s of this.slots) if (s.id === id) n += s.n; return n; }
}

// One slot's weight: things with uses get lighter as they empty (a dry canteen still weighs its steel).
export function slotKg(s) {
  const it = ITEMS[s.id];
  if (!it) return 0;
  if (it.uses && it.kgEmpty !== undefined) return (it.kgEmpty + (it.kg - it.kgEmpty) * ((s.left ?? it.uses) / it.uses)) * s.n;
  return it.kg * s.n;
}

export class Inventory {
  constructor(game) {
    this.g = game;
    this.carried = new Container('you', 'ON YOU', BODY_LITRES, 'person');
    this.worn = null;
    this.boxes = new Map();
    this.trunks = new Map(); // vehicle id -> Container
    this.opened = null;      // the container the player is looking into (UI)
    this.piles = 0;          // ground piles ever made (ids)
    this.buildPiles(game.scene);
    this.wear(START_KIT.pack);
    for (const [id, n] of START_KIT.items) this.add(this.carried, id, n);
    this.bindAmmo(); // the starting rounds go into your pockets
  }

  // ---- the clock food spoils on ----------------------------------------------------------------------------
  hours() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }
  // fresh | stale | rotten | null (it doesn't spoil)
  freshness(s) {
    const it = ITEMS[s.id];
    if (!it?.spoils || s.made === undefined) return null;
    const age = this.hours() - s.made;
    return age < it.spoils ? 'fresh' : age < it.spoils * 2 ? 'stale' : 'rotten';
  }

  // ---- moving things ---------------------------------------------------------------------------------------
  room(box) { return Math.max(0, box.cap - box.litres()); }

  // Put n of an item into a box: tops up matching slots first, then opens new ones. Returns how many went in
  // (fewer than n when the box runs out of room). state: { left, made } for a thing that has them.
  add(box, id, n = 1, state = {}) {
    const it = ITEMS[id];
    if (!it || n <= 0) return 0;
    const fit = it.bulk > 0 ? Math.min(n, Math.floor((this.room(box) + 1e-6) / it.bulk)) : n;
    let left = fit;
    const made = it.spoils ? state.made ?? this.hours() : undefined;
    if (it.stack > 1) {
      for (const s of box.slots) {
        if (!left) break;
        if (s.id !== id || s.n >= it.stack || (it.spoils && this.freshness(s) !== this.freshness({ id, made }))) continue;
        const k = Math.min(left, it.stack - s.n); s.n += k; left -= k;
        if (it.spoils) s.made = Math.min(s.made, made); // a stack is as old as its oldest
      }
    }
    while (left > 0) {
      const k = Math.min(left, it.stack);
      const s = { id, n: k };
      if (it.uses) s.left = state.left ?? it.uses;
      if (it.spoils) s.made = made;
      if (it.kind === 'gun') { s.cond = state.cond ?? 1; s.loaded = state.loaded ?? 0; }
      box.slots.push(s); left -= k;
    }
    return fit;
  }

  // Take n out of slot i of a box. Returns the taken { id, n, left, made } or null.
  take(box, i, n = 1) {
    const s = box.slots[i];
    if (!s) return null;
    const k = Math.min(n, s.n);
    const out = { id: s.id, n: k, left: s.left, made: s.made, cond: s.cond, loaded: s.loaded };
    s.n -= k;
    if (s.n <= 0) box.slots.splice(i, 1);
    return out;
  }

  // Move n from slot i of one box to another. Returns how many moved. paid: bought over a counter (trade.js), not taken.
  move(from, i, to, n = 1, paid = false) {
    const s = from.slots[i];
    if (!s || from === to) return 0;
    const it = ITEMS[s.id];
    const k = Math.min(n, s.n, it.bulk > 0 ? Math.floor((this.room(to) + 1e-6) / it.bulk) : n);
    if (k <= 0) return 0;
    const t = this.take(from, i, k);
    this.add(to, t.id, t.n, t);
    // Out of somebody's shop and anywhere not theirs (your pocket, your trunk, the floor): theft, as the world sees it
    // (deeds: witnesses, word, memory). Bought over the counter, it is not.
    if (from.owner && to.owner !== from.owner && !paid) this.stole(from, t);
    // Out of a box nobody owns (a crate, the dead, a wreck) into your pocket: salvage, the scavenger's living (roles.js).
    else if (!from.owner && to === this.carried && from !== this.carried && from.kind !== 'ground' && from.kind !== 'trunk') this.g.roles?.onLoot((ITEMS[t.id]?.value ?? 0) * t.n);
    this.changed();
    return k;
  }

  // A theft: one deed per box per half-minute however many things you take, sized by what they were worth. The
  // owner, if they're alive and see it, remembers it (robbedMe); anyone else who saw it talks.
  stole(box, t) {
    // The owner: a named shopkeeper by id, or (a Phoenix ring household, systems/residents.js) whichever of them is nearest.
    const g = this.g, owner = g.chars.find((c) => c.id === box.owner && c.alive) ?? g.residents?.ownerOf(box) ?? null;
    const worth = (ITEMS[t.id]?.value ?? 1) * t.n;
    box.stolen = (box.stolen ?? 0) + worth;
    if ((box.stealT ?? -99) > g.time - 30) return;
    box.stealT = g.time;
    const P = g.player; // witnesses see the thief, not the inside of the shelf
    const rec = g.society?.deeds?.record('steal', { target: owner ?? null, x: P.x, z: P.z, m: Math.min(4, 1 + worth / 40), label: box.ownerName, tf: owner?.fid ?? box.ownerFid ?? 'rusthaven', stars: 1, owner: true });
    if (box.ownerFid) g.residents?.onSteal(box, rec);
    g.emit('stole', { box: box.id, owner: box.owner, item: t.id, n: t.n, worth, witnesses: rec?.ws ?? 0 });
  }

  // ---- the pack on your back -------------------------------------------------------------------------------
  wear(id) {
    const it = ITEMS[id];
    if (!it?.pack) return false;
    const cap = BODY_LITRES + it.pack;
    if (this.carried.litres() > cap + 1e-6) return false; // what you hold wouldn't fit in the smaller pack
    this.worn = id; this.carried.cap = cap;
    this.changed();
    return true;
  }

  // Swap the worn pack for a pack in slot i of the carried list (the old one takes the new one's place).
  swapPack(i) {
    const s = this.carried.slots[i], it = s && ITEMS[s.id];
    if (!it?.pack) return { ok: false, why: 'not a pack' };
    const old = this.worn, oldIt = old && ITEMS[old];
    const capAfter = BODY_LITRES + it.pack;
    const litresAfter = this.carried.litres() - it.bulk + (oldIt?.bulk ?? 0);
    if (litresAfter > capAfter + 1e-6) return { ok: false, why: 'what you carry will not fit in it' };
    this.take(this.carried, i, 1);
    this.worn = s.id; this.carried.cap = capAfter;
    if (old) this.add(this.carried, old, 1);
    this.changed();
    return { ok: true, worn: this.worn, was: old };
  }

  // ---- using things ----------------------------------------------------------------------------------------
  hasTag(tag) { for (const s of this.carried.slots) if (ITEMS[s.id]?.tags?.includes(tag)) return true; return false; }

  // Use one of slot i (in the carried list). Returns { ok, text } or { ok: false, why }.
  use(i) {
    const g = this.g, box = this.carried, s = box.slots[i], it = s && ITEMS[s.id];
    if (it?.kind === 'gun') return this.sling(box, i); // a gun in your pack: sling it (swapped for yours)
    if (!it?.use) return { ok: false, why: it ? `${it.name} is not something you use like that` : 'nothing there' };
    if (it.uses && !(s.left > 0)) return { ok: false, why: `the ${it.name.toLowerCase()} is empty` };
    if (it.needs && !this.hasTag(it.needs)) return { ok: false, why: it.needs === 'blade' ? 'you need a knife or an opener for that' : `you need something with a ${it.needs}` };
    const u = it.use, texts = [];
    const sv = g.survival?.useItem?.(s.id); if (sv && !sv.ok) return sv; if (sv?.text) texts.push(sv.text); // wounds, mood, motor oil (survival.js TREATMENTS)
    if (u.act) { const r = this.act(u.act, s, it); if (!r.ok) return r; texts.push(r.text); }
    const fresh = this.freshness(s), k = fresh === 'stale' ? 0.5 : fresh === 'rotten' ? 0.15 : 1;
    const P = g.player, N = g.needs;
    if (u.need && N) { N[u.need] = Math.max(0, Math.min(1, N[u.need] + u.amount * k)); texts.push(u.need === 'water' ? '+ WATER' : u.need === 'rest' ? '+ AWAKE' : '+ FOOD'); }
    if (u.water && N) N.water = Math.max(0, Math.min(1, N.water + u.water * k));
    if (u.hp && P) { P.hp = Math.min(P.maxHp, P.hp + u.hp * k); texts.push(`+${Math.round(u.hp * k)} HP`); }
    if (u.bleed && P) { P.bleed = 0; texts.push('BLEEDING STOPPED'); }
    if (u.calm && g.hud) g.hud.hurtV = 0; // the shakes ease off
    if (u.cure) { const t = g.survival?.antibiotics(); if (t) texts.push(t); } // a fever treated; a full night breaks it
    if (fresh === 'rotten' && P) { g.combat?.damage(P, 6, null, 0, 0, 'sickness'); texts.push('IT WAS OFF'); }
    if (N?.pips && g.survival) for (const k2 of ['water', 'food']) N.pips[k2] = g.survival.pip(N[k2]);
    if (it.uses) { s.left--; if (s.left <= 0 && it.kgEmpty === undefined) this.take(box, i, 1); } // spent; a refillable keeps its shell
    else if (!(u.act && it.kind === 'tool')) this.take(box, i, 1); // a crowbar is not used up; a tyre or a tin is
    this.changed();
    g.emit('itemUsed', { item: s.id, fresh, text: texts.join(' · ') });
    return { ok: true, text: texts.join(' · ') || it.name.toUpperCase() };
  }

  // Tools and parts that work on something nearby: the car you're in or standing at, the lock in front of you.
  act(verb, s, it) {
    const g = this.g, P = g.player;
    if (verb === 'place_ladder') return g.actions?.beginPlace() ?? { ok: false, why: 'not here' }; // TIMED ACTIONS: set a carried ladder against the wall in front of you
    const v = P.inVehicle ?? g.vehicles.find((c) => !c.dead && !c.sunk && Math.hypot(c.x - P.x, c.z - P.z) < Math.max(3.4, c.len * 0.65));
    const d = v?.dmg;
    if (verb === 'refuel') {
      if (!v) return { ok: false, why: 'no vehicle close enough to pour it into' };
      if (v.fuel >= v.fuelCap - 0.5) return { ok: false, why: 'the tank is already full' };
      v.fuel = Math.min(v.fuelCap, v.fuel + it.use.litres);
      return { ok: true, text: `+${it.use.litres} L FUEL` };
    }
    if (verb === 'tyre') {
      const t = d && Object.keys(d.tyres).find((k) => d.tyres[k] <= 0);
      if (!t) return { ok: false, why: v ? 'none of its tyres is flat' : 'no vehicle close enough' };
      d.tyres[t] = 1; d.dirty = true;
      return { ok: true, text: 'TYRE CHANGED' };
    }
    if (verb === 'repair') {
      if (!d) return { ok: false, why: 'no vehicle close enough to work on' };
      const part = ['engine', 'radiator', 'tank'].reduce((a, b) => (d[b] < d[a] ? b : a));
      if (d[part] > 0.92) return { ok: false, why: 'nothing on it needs patching' };
      const amt = ((s.id === 'spark_plugs' ? (part === 'engine' ? 0.45 : 0) : 0.25) + (this.hasTag('wrench') ? 0.15 : 0)) * (g.gear?.repairMul() ?? 1); // mechanic's wraps on the wrist
      if (!amt) return { ok: false, why: 'plugs only help an engine' };
      d[part] = Math.min(1, d[part] + amt);
      return { ok: true, text: `${part.toUpperCase()} PATCHED` };
    }
    if (verb === 'gadget' || verb === 'drone' || verb === 'barricade' || verb === 'wedge' || verb === 'keys') return g.gadgets?.useItem(verb, s.id) ?? { ok: false, why: 'not here' }; // set, thrown or flown (systems/gadgets.js)
    if (verb === 'kit' || verb === 'doggear') return g.kit?.useItem(verb, s.id) ?? { ok: false, why: 'not here' }; // switched on and off, or put on your dog (systems/kit.js)
    if (verb === 'sleep') return g.survival?.sleepAt('bedroll') ?? { ok: false, why: 'not now' }; // where you stand
    if (verb === 'snare') return g.fauna?.setSnare() ?? { ok: false, why: 'not here' }; // a snare a stride ahead (systems/fauna.js)
    if (verb === 'flare') { // struck and put down: a small fire at your feet for a minute (dogs keep off it, systems/dogs.js)
      if (!g.throwables || P.inVehicle) return { ok: false, why: 'not from in here' };
      g.throwables.startFire(P.x + Math.sin(P.face) * 0.9, P.z + Math.cos(P.face) * 0.9, 0.7, 60, P);
      return { ok: true, text: 'FLARE LIT' };
    }
    if (verb === 'clean') { // the gun in your hands
      const k = g.inv.current, c = this.cond(k), name = WEAPONS[k]?.short ?? k;
      if (c <= 0) return { ok: false, why: `the ${name.toLowerCase()} is broken, not dirty: a gunsmith can fix it` };
      if (c >= GUN_CARE.kitMax - 0.005) return { ok: false, why: `the ${name.toLowerCase()} is as clean as a kit gets it` };
      g.inv.cond[k] = Math.min(GUN_CARE.kitMax, c + GUN_CARE.kit);
      delete g.inv.jam[k];
      g.emit('gunCleaned', { weapon: k, cond: +g.inv.cond[k].toFixed(3) });
      return { ok: true, text: `${name} CLEANED · ${Math.round(g.inv.cond[k] * 100)}%` };
    }
    if (verb === 'pick' || verb === 'pry') {
      const door = g.interiors?.nearest(P);
      if (!door?.leaves || !door.locked) return { ok: false, why: 'nothing locked within reach' };
      this.forceLock(door, verb, false);
      return { ok: true, text: verb === 'pick' ? 'LOCK PICKED' : 'PRIED OPEN' };
    }
    return g.outdoors?.act(verb, s, it) ?? { ok: false, why: 'not here' }; // a rod, a fish trap, a net, a tarp (systems/outdoors.js)
  }

  // Open a locked door with what you carry: picks are quiet and leave it shut (a pick snaps: one use), a crowbar
  // is loud and bursts it open. spend: take the pick's use here (false when use() already counts it).
  forceLock(door, how, spend = true) {
    const g = this.g, P = g.player, I = g.interiors;
    if (how === 'pick') {
      if (spend) { const i = this.carried.slots.findIndex((s) => s.id === 'lockpicks' && s.left > 0); if (i < 0) return false; const s = this.carried.slots[i]; if (--s.left <= 0) this.take(this.carried, i, 1); this.changed(); }
      g.audio.burst?.({ dur: 0.08, freq: 3200, type: 'bandpass', q: 6, vol: 0.12, decay: 0.07 }); // a click
      I.unlock(door, 'picked', P, false);
    } else {
      g.audio.burst?.({ dur: 0.45, freq: 520, type: 'bandpass', q: 2, vol: 0.55, decay: 0.4, pitchDrop: 0.6 }); // wood and steel giving
      g.noise(door.x, door.z, 18, P);
      I.unlock(door, 'pried', P, true);
    }
    return true;
  }

  // The best thing you carry for a need ('water' | 'food' | 'med'): food that spoils soonest first, the smallest
  // bandage that does the job. Returns a slot index or -1.
  best(kind) {
    let bi = -1, bScore = -Infinity;
    this.carried.slots.forEach((s, i) => {
      const it = ITEMS[s.id];
      if (!it?.use || it.kind !== kind) return;
      if (it.uses && !(s.left > 0)) return;
      if (it.needs && !this.hasTag(it.needs)) return;
      const f = this.freshness(s);
      if (f === 'rotten') return;
      let score = kind === 'med' ? -(it.value) : (f === 'stale' ? 3 : f === 'fresh' ? 2 : 0) - it.value * 0.01;
      if (kind === 'med' && this.g.player?.bleed > 0.2 && it.use.bleed) score += 100;
      if (score > bScore) { bScore = score; bi = i; }
    });
    return bi;
  }

  // ---- patching somebody else up (the medic's work, docs/design/WEB_ROLES.md) ----------------------------------
  // Is c someone you could patch up right now (hurt or bleeding, close, alive), and with what? Returns a slot index.
  hurtEnough(c) { return !!c?.alive && (c.hp < c.maxHp * 0.85 || (c.bleed ?? 0) > 0.1); }
  bestFor(c, id = null) {
    const missing = c.maxHp - c.hp, bleeding = (c.bleed ?? 0) > 0.1;
    let bi = -1, bScore = -Infinity;
    this.carried.slots.forEach((s, i) => {
      const it = ITEMS[s.id], u = it?.use;
      if (it?.kind !== 'med' || !u?.hp || (id && s.id !== id) || (it.uses && !(s.left > 0))) return;
      const score = (bleeding && u.bleed ? 50 : 0) + Math.min(u.hp * 1.5, missing) - it.value * 0.3; // the smallest thing that does the job
      if (score > bScore) { bScore = score; bi = i; }
    });
    return bi;
  }
  // Use one med item on c: it heals half again what it does for you (both hands free, they hold still) times the medic's
  // healMul, and stops their bleeding if it stops yours. A `heal` deed: the patient sees your face, and so does anyone
  // watching. Returns { ok, text, item, healed } or { ok: false, why }.
  treat(c, id = null) {
    const g = this.g, P = g.player, name = c?.npc?.name ?? c?.name ?? 'them';
    if (!c?.alive || c === P) return { ok: false, why: 'nobody there to patch up' };
    if (Math.hypot(c.x - P.x, c.z - P.z) > 4.5) return { ok: false, why: `${name} is too far away` };
    if (!this.hurtEnough(c)) return { ok: false, why: `${name} is not hurt` };
    const i = this.bestFor(c, id);
    if (i < 0) return { ok: false, why: id ? `you carry no ${ITEMS[id]?.name.toLowerCase() ?? id} to use` : 'you carry nothing to patch them up with' };
    const s = this.carried.slots[i], it = ITEMS[s.id], u = it.use;
    const healed = Math.min(c.maxHp - c.hp, u.hp * 1.5 * (g.roles?.perk.healMul ?? 1));
    c.hp += healed;
    if (u.bleed) c.bleed = 0;
    c.treated = true; c.flee = 0;
    if (c.grudge === P && !c.weapon) c.grudge = null; // you shot them once; now you are stitching them up
    if (it.uses) { if (--s.left <= 0 && it.kgEmpty === undefined) this.take(this.carried, i, 1); } else this.take(this.carried, i, 1);
    this.changed();
    g.society?.deeds?.record('heal', { target: c });
    g.emit('treated', { npc: c.id, name, item: s.id, healed: Math.round(healed), hp: Math.round(c.hp) });
    return { ok: true, text: `PATCHED UP ${name.toUpperCase()}`, item: s.id, healed: Math.round(healed) };
  }

  // ---- rounds ------------------------------------------------------------------------------------------------
  // The gun code reads and writes rounds as g.inv.ammo[kind] (reload, the HUD, pickups, trades, the agent), so
  // g.inv.ammo is a view onto the carried list: reading counts the rounds you carry, writing adds rounds (what will
  // not fit goes in the trunk of the car you're in, else at your feet) or takes them out, newest stacks first.
  // Called on a new game and after every load: the plain numbers g.inv.ammo held become the count, so a save from
  // before rounds were items migrates by itself.
  bindAmmo() {
    const inv = this.g.inv;
    if (!inv) return;
    inv.cond ??= {}; inv.jam ??= {};
    const plain = inv.ammo;
    if (plain?.[BOUND]) return;
    const self = this, C = this.carried;
    inv.ammo = new Proxy({}, {
      get(_, k) { if (k === BOUND) return true; const id = AMMO_ITEM[k]; return id ? C.count(id) : undefined; },
      set(_, k, v) { const id = AMMO_ITEM[k]; if (id) self.setCount(id, v); return true; },
      has(_, k) { return k in AMMO_ITEM; },
      deleteProperty() { return true; },
      ownKeys() { return Object.keys(AMMO_ITEM); },
      getOwnPropertyDescriptor(_, k) { const id = AMMO_ITEM[k]; return id ? { value: C.count(id), writable: true, enumerable: true, configurable: true } : undefined; },
    });
    if (plain) for (const k in AMMO_ITEM) if (plain[k] !== undefined) inv.ammo[k] = plain[k];
  }

  // Make the carried count of an item exactly n.
  setCount(id, n) {
    const have = this.carried.count(id), want = Math.max(0, Math.round(Number(n) || 0));
    if (want > have) this.stow(id, want - have);
    else if (want < have) this.spend(id, have - want);
  }

  // Into your pockets; what will not fit goes in the trunk of the car you're in, else on the ground at your feet.
  // Returns how many of the n you now carry.
  stow(id, n, state = {}) {
    const k = this.add(this.carried, id, n, state);
    if (k < n) {
      const P = this.g.player, v = P?.inVehicle, it = ITEMS[id];
      const t = v ? this.add(this.trunk(v), id, n - k, state) : 0;
      if (n - k - t > 0) this.add(this.groundAt(P?.x ?? 0, P?.z ?? 0), id, n - k - t, state);
      this.g.hud?.toast?.(`NO ROOM · ${n - k} ${(it?.name ?? id).toUpperCase()} ${t >= n - k ? 'IN THE TRUNK' : 'AT YOUR FEET'}`, 'warn');
      this.g.emit('noRoom', { item: id, n: n - k, trunk: t });
    }
    this.changed();
    return k;
  }

  // Out of your pockets, newest stacks first (the part-used box before the full one). Returns how many.
  spend(id, n) {
    let left = n;
    for (let i = this.carried.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.carried.slots[i];
      if (s.id !== id) continue;
      const k = Math.min(left, s.n);
      this.take(this.carried, i, k); left -= k;
    }
    this.changed();
    return n - left;
  }

  // ---- guns ------------------------------------------------------------------------------------------------
  // Each gun you carry has a condition (g.inv.cond: 1 clean, 0 broken) that every shot wears (GUN_WEAR). Below
  // GUN_CARE.jamBelow a shot may jam it (g.inv.jam) until you clear it; at 0 it will not fire until a gunsmith
  // fixes it. A cleaning kit puts some back.
  cond(k) { return this.g.inv.cond?.[k] ?? 1; }
  gunState(k) { const c = this.cond(k); return c <= 0 ? 'broken' : this.g.inv.jam?.[k] ? 'jammed' : c < GUN_CARE.jamBelow ? 'worn' : 'ok'; }

  // A round of gun k went off. Returns true when the next one jammed.
  shot(k) {
    const inv = this.g.inv, W = GUN_WEAR[k] ?? { wear: 0.001, jam: 1 };
    const c = inv.cond[k] = Math.max(0, this.cond(k) - W.wear);
    if (c <= 0) { this.g.emit('gunBroke', { weapon: k }); return false; }
    if (c < GUN_CARE.jamBelow && Math.random() < (GUN_CARE.jamBelow - c) * GUN_CARE.jamRate * W.jam) {
      inv.jam[k] = true;
      this.g.emit('jam', { weapon: k, cond: +c.toFixed(3) });
      return true;
    }
    return false;
  }

  // The jam is out: the round that stuck is thrown away.
  cleared(k) {
    const inv = this.g.inv;
    if (!inv.jam?.[k]) return;
    delete inv.jam[k];
    if ((inv.mag[k] ?? 0) > 0) inv.mag[k]--;
    this.g.emit('jamCleared', { weapon: k });
  }

  // A gun comes to you (bought, given): slung if you have none of its kind, else a spare in your pack. state: { cond,
  // loaded }. Returns 'slung' | 'spare'.
  gainGun(k, state = {}) {
    const inv = this.g.inv, W = WEAPONS[k];
    if (!W) return null;
    if (!inv.weapons.includes(k)) {
      inv.weapons.push(k);
      inv.cond[k] = state.cond ?? 1; inv.mag[k] = Math.min(W.mag, state.loaded ?? W.mag); delete inv.jam[k];
      this.changed();
      return 'slung';
    }
    this.stow(GUN_ITEM[k], 1, { cond: state.cond ?? 1, loaded: state.loaded ?? 0 });
    return 'spare';
  }

  // Sling the gun in slot i of a box: into your loadout if you have none of its kind, else swapped for yours (yours
  // goes where it lay, with its condition and its rounds). Out of somebody's shop it is still theft.
  sling(box, i, paid = false) {
    const g = this.g, inv = g.inv, s = box?.slots[i], it = s && ITEMS[s.id];
    if (it?.kind !== 'gun') return { ok: false, why: 'that is not a gun' };
    const k = it.weapon, had = inv.weapons.includes(k);
    const t = this.take(box, i, 1);
    if (had) this.add(box, GUN_ITEM[k], 1, { cond: this.cond(k), loaded: inv.mag[k] ?? 0 });
    else inv.weapons.push(k);
    inv.cond[k] = t.cond ?? 1; inv.mag[k] = Math.min(WEAPONS[k].mag, t.loaded ?? 0); delete inv.jam[k];
    if (box.owner && box !== this.carried && !paid) this.stole(box, t);
    if (g.player) g.player.reloading = 0; // a reload in progress was for the other gun
    g.switchWeapon?.(k);
    this.changed();
    g.emit('gunSlung', { weapon: k, from: box.id, swapped: had, cond: +inv.cond[k].toFixed(3), loaded: inv.mag[k] });
    return { ok: true, text: `${had ? 'SWAPPED · ' : ''}${WEAPONS[k].name} · ${Math.round(inv.cond[k] * 100)}%` };
  }

  // Put a gun from your loadout into a box (a trunk, a body, a shelf, the ground). It keeps its condition and its
  // rounds. The last one stays on you: the hands need a gun (this engine has no unarmed mode).
  stowGun(k, box) {
    const g = this.g, inv = g.inv;
    if (!inv.weapons.includes(k)) return { ok: false, why: 'you do not carry that' };
    if (inv.weapons.length <= 1) return { ok: false, why: 'your last gun stays on you' };
    if (!this.add(box, GUN_ITEM[k], 1, { cond: this.cond(k), loaded: inv.mag[k] ?? 0 })) return { ok: false, why: `no room in ${box.label.toLowerCase()}` };
    inv.weapons.splice(inv.weapons.indexOf(k), 1);
    inv.mag[k] = 0; delete inv.cond[k]; delete inv.jam[k];
    if (inv.current === k) { if (g.player) g.player.reloading = 0; g.switchWeapon(inv.weapons[0]); }
    this.changed();
    g.emit('gunStowed', { weapon: k, to: box.id });
    return { ok: true, text: `${WEAPONS[k].short} ${box.kind === 'ground' ? 'PUT DOWN' : `INTO THE ${box.label.split(' · ')[0]}`}` };
  }

  // The dead keep the gun they carried (in their body's container), worn and part-loaded by who they were, with a
  // few spare rounds for it.
  armBody(box, c) {
    const k = c.weapon, id = GUN_ITEM[k], W = WEAPONS[k];
    if (!id || !W) return;
    const F = GUN_FOUND[c.faction] ?? GUN_FOUND.default, rng = makeRng(box.seed ^ 0x9e3779b9);
    const r = (a) => a[0] + rng() * (a[1] - a[0]);
    this.add(box, id, 1, { cond: +r(F.cond).toFixed(3), loaded: Math.round(W.mag * r(F.loaded)) });
    const spare = Math.round(r(F.spare));
    if (spare > 0 && AMMO_ITEM[W.ammo]) this.add(box, AMMO_ITEM[W.ammo], spare);
  }

  // The gunsmith brings a gun back to clean for a share of its worth per point of wear (GUN_CARE.smith).
  smithQuote(k) { return Math.max(GUN_CARE.smithMin, Math.round((1 - this.cond(k)) * (ITEMS[GUN_ITEM[k]]?.value ?? 100) * GUN_CARE.smith)); }
  smithFix(k) {
    const g = this.g;
    if (!g.inv.weapons.includes(k)) return { ok: false, why: 'you do not carry that' };
    if (this.cond(k) >= 0.995) return { ok: false, why: 'there is nothing wrong with it' };
    const cost = this.smithQuote(k);
    if (!g.spend(cost)) return { ok: false, why: 'not enough cash' };
    g.inv.cond[k] = 1; delete g.inv.jam[k];
    g.emit('gunFixed', { weapon: k, cost });
    return { ok: true, cost };
  }

  gunView() {
    const inv = this.g.inv;
    return inv.weapons.map((k) => ({ weapon: k, name: WEAPONS[k]?.name, cond: +this.cond(k).toFixed(3), state: this.gunState(k), loaded: inv.mag[k] ?? 0, mag: WEAPONS[k]?.mag, reserve: inv.ammo[WEAPONS[k]?.ammo] ?? 0, inHand: inv.current === k }));
  }

  // ---- the world's containers ------------------------------------------------------------------------------
  // Every crate and shelf inside a building is a container (world/city.js furnishes them), its loot fitting the
  // place: a clinic's shelves hold medicine, the mechanic's hold parts, a house has kitchen, bedroom and bathroom
  // things. A named shopkeeper owns what is in their shop: taking from it is a `steal` deed (move()).
  // Called once the people are placed (shop buildings learn their names then). Ids come from positions, so a save
  // finds the same box again.
  placeFurniture() {
    const g = this.g, B = g.world?.buildings ?? [], keepers = g.chars.filter((c) => c.npc?.title);
    for (const b of g.statics.boxes) {
      if (b.tag !== 'crate' && b.tag !== 'shelf') continue;
      const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2;
      const bld = B.find((q) => q.enterable && x > q.minX && x < q.maxX && z > q.minZ && z < q.maxZ);
      if (!bld) continue;
      const id = `box:${Math.round(x * 10)}:${Math.round(z * 10)}${b.storeyLv ? `:L${b.storeyLv}` : ''}`, h = hash(id); // upstairs (world/storeys.js): its floor in the id
      const shop = bld.shopName?.split(' · ')[0] ?? null;
      // A planned building's pieces carry their room's table and their own label (world/city.js, world/storeys.js): a
      // keeper's shop rooms keep the trade's (SHOP_LOOT); their kitchen, bedroom and bath upstairs or behind are their home.
      const work = !b.storeyLv && (!b.room || PROGRAMMES.working.includes(b.room));
      const table = (work ? SHOP_LOOT[shop] : null) ?? b.loot ?? SHOP_LOOT[shop] ?? (b.tag === 'crate' ? (h % 3 ? 'kitchen' : 'garage') : HOME_LOOT[h % HOME_LOOT.length]);
      const what = b.label ?? (b.tag === 'crate' ? 'CRATE' : 'SHELF');
      const box = this.place(id, table, x, z, b.tag === 'crate' ? 60 : 40, `${what}${shop ? ` · ${shop.toUpperCase()}` : bld.label ? ` · ${bld.label}` : ''}`, h);
      if (b.base > 0) box.y = b.base; // reachable from its own floor only (nearest)
      const keeper = shop && keepers.find((c) => c.npc.title === bld.shopName);
      if (keeper) { box.owner = keeper.id; box.ownerName = keeper.npc.name; }
    }
  }
  // The Phoenix ring's containers (world/ring.js) come and go with their chunk (streamer.ringOn / ringOff): only the hot
  // chunks' boxes are registered. A box anyone has been through is remembered while it is away (ringKept: its id and
  // what is left in it), so when its chunk comes back, or the chunk is rebuilt, or a save is loaded, the box with that
  // id has the same contents. One never opened is rolled from its id's seed whenever it is first opened: same loot.
  registerRing(list) {
    this.ringKept ??= new Map();
    for (const q of list) {
      if (this.boxes.has(q.id)) continue;
      const box = this.place(q.id, q.table, q.x, q.z, q.cap, q.label);
      box.ring = true;
      const kept = this.ringKept.get(q.id);
      if (kept) { box.slots = kept; box.rolled = true; }
    }
  }
  unregisterRing(list) {
    this.ringKept ??= new Map();
    for (const q of list) {
      const box = this.boxes.get(q.id);
      if (!box?.ring) continue;
      if (box.rolled) this.ringKept.set(q.id, box.slots);
      if (this.opened === box) this.opened = null;
      this.boxes.delete(q.id);
    }
  }
  // Register a container (loot rolls the first time it's opened). kind names its LOOT table.
  place(id, kind, x, z, cap, label, seed) {
    // The dead are remembered as containers until there are too many; the oldest unsearched go first.
    if (id.startsWith('body:')) { let n = 0; for (const k of this.boxes.keys()) if (k.startsWith('body:')) n++; if (n >= MAX_BODIES) for (const [k, b] of this.boxes) if (k.startsWith('body:') && b.rolled && !b.slots.length) { this.boxes.delete(k); if (--n < MAX_BODIES) break; } }
    const box = new Container(id, label ?? kind.toUpperCase(), cap, kind);
    box.x = x; box.z = z; box.seed = seed ?? hash(id); box.rolled = false;
    this.boxes.set(id, box);
    return box;
  }

  open(box) {
    if (!box.rolled) { this.roll(box, this.g.gear?.luckRolls() ?? 0); box.rolled = true; this.g.roles?.onSearch(box); } // first time through: a search (a lucky charm: more turns up)
    this.opened = box;
    this.g.emit('containerOpened', { id: box.id, kind: box.kind, items: box.slots.length });
    return box;
  }

  // extra: rolls on top (the player's luck, systems/gear.js): drawn after the box's own, so they only ever add.
  roll(box, extra = 0) {
    const T = LOOT[box.kind];
    if (!T) return;
    const rng = makeRng(box.seed);
    const n = T.rolls[0] + Math.floor(rng() * (T.rolls[1] - T.rolls[0] + 1)) + extra;
    const total = T.none + T.rows.reduce((a, r) => a + r[1], 0);
    for (let k = 0; k < n; k++) {
      let pick = rng() * total;
      if ((pick -= T.none) < 0) continue;
      for (const [id, w, lo, hi] of T.rows) {
        if ((pick -= w) >= 0) continue;
        const it = ITEMS[id], count = lo + Math.floor(rng() * (hi - lo + 1));
        // Found things are not new: part-used, and food already some way along.
        const state = { left: it.uses ? Math.max(1, Math.ceil(it.uses * (0.35 + rng() * 0.65))) : undefined, made: it.spoils ? this.hours() - rng() * it.spoils * 1.6 : undefined };
        if (it.kind === 'gun') { state.cond = +(0.45 + rng() * 0.5).toFixed(3); state.loaded = 0; } // second-hand, and nobody leaves one loaded on a shelf
        this.add(box, id, count, state);
        break;
      }
    }
  }

  // y: the asker's height. A box on another floor (world/storeys.js) is out of reach whatever its x, z. Without y, any floor.
  nearest(x, z, reach = 2.2, notGround = false, y = undefined) {
    let best = null, bd = reach;
    for (const b of this.boxes.values()) { if (b.unseen || (notGround && b.kind === 'ground')) continue; /* unseen: lying where nobody has looked (systems/actions.js look-around) */ if (y !== undefined && Math.abs((b.y ?? 0) - y) > LEVEL.same) continue; const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  // What's on the ground here: the pile within reach, or a fresh empty one (pruned again if nothing is left in it).
  // y: the floor it lies on (upstairs: world/storeys.js); by default the player's.
  groundAt(x, z, y = this.g.player?.gy ?? 0) {
    let best = null, bd = 1.6;
    for (const b of this.boxes.values()) if (b.kind === 'ground' && !b.unseen && Math.abs((b.y ?? 0) - y) <= LEVEL.same) { const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
    if (best) return best;
    const b = this.place(`ground:${++this.piles}`, 'ground', x, z, 999, 'THE GROUND');
    if (y > 0.5) b.y = y;
    b.rolled = true;
    return b;
  }

  prune() {
    for (const [id, b] of this.boxes) if (b.kind === 'ground' && !b.slots.length) this.boxes.delete(id);
    this.drawPiles();
  }

  // Whatever is lying on the ground shows: a canvas bundle where somebody left things. One draw call for all.
  buildPiles(scene) {
    if (!scene) return;
    const geo = new THREE.IcosahedronGeometry(0.32, 0).scale(1.25, 0.55, 1);
    geo.translate(0, 0.16, 0);
    this.pileMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#6b5a42', roughness: 0.95, flatShading: true }), 96);
    this.pileMesh.count = 0; this.pileMesh.visible = false; this.pileMesh.castShadow = true; this.pileMesh.receiveShadow = true;
    scene.add(this.pileMesh);
  }

  drawPiles() {
    const m = this.pileMesh;
    if (!m) return;
    let n = 0;
    const o = _o;
    for (const b of this.boxes.values()) {
      if (b.kind !== 'ground' || b.unseen || !b.slots.length || n >= 96) continue;
      o.position.set(b.x, this.g.stunts?.heightAt(b.x, b.z) ?? 0, b.z); o.rotation.set(0, (b.seed % 628) / 100, 0);
      const k = Math.min(1.6, 0.8 + b.litres() * 0.04); o.scale.set(k, k, k); o.updateMatrix();
      m.setMatrixAt(n++, o.matrix);
    }
    m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true;
  }

  trunk(v) {
    let t = this.trunks.get(v.id);
    if (!t) { t = new Container(`trunk:${v.id}`, `${v.name} · ${v.bike || v.quad ? 'SADDLEBAGS' : v.type === 'pickup' ? 'BED' : 'TRUNK'}`, TRUNK[v.type] ?? 200, 'trunk'); this.trunks.set(v.id, t); }
    return t;
  }

  // ---- what it weighs, what the agent sees ---------------------------------------------------------------
  kg() { return this.carried.kg() + (this.worn ? ITEMS[this.worn].kg : 0) + (this.g.gear?.wornKg() ?? 0); } // and what you wear (systems/gear.js)
  changed() { this.g.skillsSys?.recompute?.(); this.dirty = true; this.drawPiles(); }

  slotView(s) {
    const it = ITEMS[s.id];
    return { id: s.id, name: it?.name ?? s.id, n: s.n, kind: it?.kind, kg: +slotKg(s).toFixed(2), litres: +((it?.bulk ?? 0) * s.n).toFixed(2), left: s.left, uses: it?.uses, fresh: this.freshness(s), value: it?.value, cond: s.cond, loaded: s.loaded };
  }

  boxView(b) { return b && { id: b.id, label: b.label, kind: b.kind, litres: +b.litres().toFixed(1), cap: b.cap, kg: +b.kg().toFixed(1), items: b.slots.map((s) => this.slotView(s)) }; }

  view() {
    return { worn: this.worn, kg: +this.kg().toFixed(1), guns: this.gunView(), carried: this.boxView(this.carried), opened: this.opened ? this.boxView(this.opened) : null, boxes: this.boxes.size, rolled: [...this.boxes.values()].filter((b) => b.rolled).length };
  }

  save() {
    const touched = [];
    for (const b of this.boxes.values()) if (b.rolled) touched.push({ id: b.id, slots: b.slots });
    // The ring's boxes that are away with their chunks (ringKept), too.
    for (const [id, slots] of this.ringKept ?? []) if (!this.boxes.has(id)) touched.push({ id, slots });
    return { worn: this.worn, carried: this.carried.slots, boxes: touched, trunks: [...this.trunks].map(([id, t]) => ({ id, slots: t.slots })) };
  }

  load(s) {
    if (!s) return;
    this.worn = s.worn ?? null;
    this.carried.cap = BODY_LITRES + (this.worn ? ITEMS[this.worn]?.pack ?? 0 : 0);
    this.carried.slots = (s.carried ?? []).filter((x) => ITEMS[x.id]).map((x) => ({ ...x }));
    // The ring's boxes: the save is the whole truth about them (one it does not name is as nobody left it).
    this.ringKept = new Map();
    for (const box of this.boxes.values()) if (box.ring) { box.slots = []; box.rolled = false; }
    for (const b of s.boxes ?? []) {
      const box = this.boxes.get(b.id);
      if (box) { box.slots = b.slots.map((x) => ({ ...x })); box.rolled = true; }
      else if (b.id.startsWith('ring:')) this.ringKept.set(b.id, b.slots.map((x) => ({ ...x })));
    }
    for (const t of s.trunks ?? []) { const v = this.g.vehicles.find((x) => x.id === t.id); if (v) this.trunk(v).slots = t.slots.map((x) => ({ ...x })); }
    this.changed();
  }
}

const _o = new THREE.Object3D();

// A stable seed from a container id.
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
