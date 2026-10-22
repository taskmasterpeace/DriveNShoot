import { ITEMS, LOOT, START_KIT, BODY_LITRES } from '../data/items.js';
import * as THREE from 'three';
import { makeRng } from '../engine/rng.js';

// What you carry and what the world holds (docs/design/WEB_INVENTORY.md). The guns and their rounds stay in g.inv
// (combat reads them every shot); everything else is an item in a container.
//   carried   - one list on your person: pockets and belt (BODY_LITRES) plus whatever pack you wear
//   worn      - the pack on your back (an item id, outside the list; its litres are the list's extra room)
//   boxes     - the world's containers (cupboards, crates, trunks, the dead): placed by whoever builds the place,
//               rolled from a seeded loot table the first time anyone opens them, saved once touched
// A slot is { id, n, left?, made? }: left = uses left in a thing that has uses (stack 1), made = the game hour food
// was fresh from (it spoils on the game clock, not in real time).
const MAX_BODIES = 60;
// What a shop's shelves and crates hold (by the shopkeeper's trade), and what a home's shelves might.
const SHOP_LOOT = { Clinic: 'bathroom', Mechanic: 'garage', Gunsmith: 'office', 'Water Trader': 'kitchen', 'Radio DJ': 'office', 'Warden Captain': 'office' };
const HOME_LOOT = ['kitchen', 'bathroom', 'bedroom', 'office', 'kitchen'];
const TRUNK = { rig: 900, interceptor: 260, buggy: 60, pickup: 700, sedan: 380, van: 1400, airboat: 120, jetski: 20, gunboat: 400, atv: 50, bike: 22 };

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
      box.slots.push(s); left -= k;
    }
    return fit;
  }

  // Take n out of slot i of a box. Returns the taken { id, n, left, made } or null.
  take(box, i, n = 1) {
    const s = box.slots[i];
    if (!s) return null;
    const k = Math.min(n, s.n);
    const out = { id: s.id, n: k, left: s.left, made: s.made };
    s.n -= k;
    if (s.n <= 0) box.slots.splice(i, 1);
    return out;
  }

  // Move n from slot i of one box to another. Returns how many moved.
  move(from, i, to, n = 1) {
    const s = from.slots[i];
    if (!s || from === to) return 0;
    const it = ITEMS[s.id];
    const k = Math.min(n, s.n, it.bulk > 0 ? Math.floor((this.room(to) + 1e-6) / it.bulk) : n);
    if (k <= 0) return 0;
    const t = this.take(from, i, k);
    this.add(to, t.id, t.n, t);
    // Out of somebody's shop and into your pocket: theft, as the world sees it (deeds: witnesses, word, memory).
    if (from.owner && to === this.carried) this.stole(from, t);
    this.changed();
    return k;
  }

  // A theft: one deed per box per half-minute however many things you take, sized by what they were worth. The
  // owner, if they're alive and see it, remembers it (robbedMe); anyone else who saw it talks.
  stole(box, t) {
    const g = this.g, owner = g.chars.find((c) => c.id === box.owner && c.alive);
    const worth = (ITEMS[t.id]?.value ?? 1) * t.n;
    box.stolen = (box.stolen ?? 0) + worth;
    if ((box.stealT ?? -99) > g.time - 30) return;
    box.stealT = g.time;
    const P = g.player; // witnesses see the thief, not the inside of the shelf
    const rec = g.society?.deeds?.record('steal', { target: owner ?? null, x: P.x, z: P.z, m: Math.min(4, 1 + worth / 40), label: box.ownerName, tf: owner?.fid ?? 'rusthaven', stars: 1 });
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
    if (!it?.use) return { ok: false, why: it ? `${it.name} is not something you use like that` : 'nothing there' };
    if (it.uses && !(s.left > 0)) return { ok: false, why: `the ${it.name.toLowerCase()} is empty` };
    if (it.needs && !this.hasTag(it.needs)) return { ok: false, why: it.needs === 'blade' ? 'you need a knife or an opener for that' : `you need something with a ${it.needs}` };
    const u = it.use, texts = [];
    if (u.act) { const r = this.act(u.act, s, it); if (!r.ok) return r; texts.push(r.text); }
    const fresh = this.freshness(s), k = fresh === 'stale' ? 0.5 : fresh === 'rotten' ? 0.15 : 1;
    const P = g.player, N = g.needs;
    if (u.need && N) { N[u.need] = Math.max(0, Math.min(1, N[u.need] + u.amount * k)); texts.push(u.need === 'water' ? '+ WATER' : '+ FOOD'); }
    if (u.water && N) N.water = Math.max(0, Math.min(1, N.water + u.water * k));
    if (u.hp && P) { P.hp = Math.min(P.maxHp, P.hp + u.hp * k); texts.push(`+${Math.round(u.hp * k)} HP`); }
    if (u.bleed && P) { P.bleed = 0; texts.push('BLEEDING STOPPED'); }
    if (u.calm && g.hud) g.hud.hurtV = 0; // the shakes ease off
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
      const amt = (s.id === 'spark_plugs' ? (part === 'engine' ? 0.45 : 0) : 0.25) + (this.hasTag('wrench') ? 0.15 : 0);
      if (!amt) return { ok: false, why: 'plugs only help an engine' };
      d[part] = Math.min(1, d[part] + amt);
      return { ok: true, text: `${part.toUpperCase()} PATCHED` };
    }
    if (verb === 'pick' || verb === 'pry') {
      const door = g.interiors?.nearest(P);
      if (!door?.leaves || !door.locked) return { ok: false, why: 'nothing locked within reach' };
      this.forceLock(door, verb, false);
      return { ok: true, text: verb === 'pick' ? 'LOCK PICKED' : 'PRIED OPEN' };
    }
    return { ok: false, why: 'not here' };
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
      const id = `box:${Math.round(x * 10)}:${Math.round(z * 10)}`, h = hash(id);
      const shop = bld.shopName?.split(' · ')[0] ?? null;
      const table = SHOP_LOOT[shop] ?? (b.tag === 'crate' ? (h % 3 ? 'kitchen' : 'garage') : HOME_LOOT[h % HOME_LOOT.length]);
      const box = this.place(id, table, x, z, b.tag === 'crate' ? 60 : 40, `${b.tag === 'crate' ? 'CRATE' : 'SHELF'}${shop ? ` · ${shop.toUpperCase()}` : ''}`, h);
      const keeper = shop && keepers.find((c) => c.npc.title === bld.shopName);
      if (keeper) { box.owner = keeper.id; box.ownerName = keeper.npc.name; }
    }
  }
  // Register a container (loot rolls the first time it's opened). kind names its LOOT table.
  place(id, kind, x, z, cap, label, seed) {
    // The dead are remembered as containers until there are too many; the oldest unsearched go first.
    if (id.startsWith('body:')) { let n = 0; for (const k of this.boxes.keys()) if (k.startsWith('body:')) n++; if (n >= MAX_BODIES) for (const [k, b] of this.boxes) if (k.startsWith('body:') && !b.slots.length) { this.boxes.delete(k); if (--n < MAX_BODIES) break; } }
    const box = new Container(id, label ?? kind.toUpperCase(), cap, kind);
    box.x = x; box.z = z; box.seed = seed ?? hash(id); box.rolled = false;
    this.boxes.set(id, box);
    return box;
  }

  open(box) {
    if (!box.rolled) { this.roll(box); box.rolled = true; }
    this.opened = box;
    this.g.emit('containerOpened', { id: box.id, kind: box.kind, items: box.slots.length });
    return box;
  }

  roll(box) {
    const T = LOOT[box.kind];
    if (!T) return;
    const rng = makeRng(box.seed);
    const n = T.rolls[0] + Math.floor(rng() * (T.rolls[1] - T.rolls[0] + 1));
    const total = T.none + T.rows.reduce((a, r) => a + r[1], 0);
    for (let k = 0; k < n; k++) {
      let pick = rng() * total;
      if ((pick -= T.none) < 0) continue;
      for (const [id, w, lo, hi] of T.rows) {
        if ((pick -= w) >= 0) continue;
        const it = ITEMS[id], count = lo + Math.floor(rng() * (hi - lo + 1));
        // Found things are not new: part-used, and food already some way along.
        const state = { left: it.uses ? Math.max(1, Math.ceil(it.uses * (0.35 + rng() * 0.65))) : undefined, made: it.spoils ? this.hours() - rng() * it.spoils * 1.6 : undefined };
        this.add(box, id, count, state);
        break;
      }
    }
  }

  nearest(x, z, reach = 2.2, notGround = false) {
    let best = null, bd = reach;
    for (const b of this.boxes.values()) { if (notGround && b.kind === 'ground') continue; const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  // What's on the ground here: the pile within reach, or a fresh empty one (pruned again if nothing is left in it).
  groundAt(x, z) {
    let best = null, bd = 1.6;
    for (const b of this.boxes.values()) if (b.kind === 'ground') { const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
    if (best) return best;
    const b = this.place(`ground:${++this.piles}`, 'ground', x, z, 999, 'THE GROUND');
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
      if (b.kind !== 'ground' || !b.slots.length || n >= 96) continue;
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
  kg() { return this.carried.kg() + (this.worn ? ITEMS[this.worn].kg : 0); }
  changed() { this.g.skillsSys?.recompute?.(); this.dirty = true; this.drawPiles(); }

  slotView(s) {
    const it = ITEMS[s.id];
    return { id: s.id, name: it?.name ?? s.id, n: s.n, kind: it?.kind, kg: +slotKg(s).toFixed(2), litres: +((it?.bulk ?? 0) * s.n).toFixed(2), left: s.left, uses: it?.uses, fresh: this.freshness(s), value: it?.value };
  }

  boxView(b) { return b && { id: b.id, label: b.label, kind: b.kind, litres: +b.litres().toFixed(1), cap: b.cap, kg: +b.kg().toFixed(1), items: b.slots.map((s) => this.slotView(s)) }; }

  view() {
    return { worn: this.worn, kg: +this.kg().toFixed(1), carried: this.boxView(this.carried), opened: this.opened ? this.boxView(this.opened) : null, boxes: this.boxes.size, rolled: [...this.boxes.values()].filter((b) => b.rolled).length };
  }

  save() {
    const touched = [];
    for (const b of this.boxes.values()) if (b.rolled) touched.push({ id: b.id, slots: b.slots });
    return { worn: this.worn, carried: this.carried.slots, boxes: touched, trunks: [...this.trunks].map(([id, t]) => ({ id, slots: t.slots })) };
  }

  load(s) {
    if (!s) return;
    this.worn = s.worn ?? null;
    this.carried.cap = BODY_LITRES + (this.worn ? ITEMS[this.worn]?.pack ?? 0 : 0);
    this.carried.slots = (s.carried ?? []).filter((x) => ITEMS[x.id]).map((x) => ({ ...x }));
    for (const b of s.boxes ?? []) { const box = this.boxes.get(b.id); if (box) { box.slots = b.slots.map((x) => ({ ...x })); box.rolled = true; } }
    for (const t of s.trunks ?? []) { const v = this.g.vehicles.find((x) => x.id === t.id); if (v) this.trunk(v).slots = t.slots.map((x) => ({ ...x })); }
    this.changed();
  }
}

const _o = new THREE.Object3D();

// A stable seed from a container id.
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
