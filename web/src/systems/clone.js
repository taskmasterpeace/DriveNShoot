import * as THREE from 'three';
import { CLONE_RULES, CLONE_KEEPS, VATS } from '../data/clones.js';
import { ITEMS, GUN_ITEM, START_KIT, BODY_LITRES } from '../data/items.js';
import { SICKNESS } from '../data/survival.js';
import { WEAPONS } from './combat.js';
import { randomName } from '../data/npcs.js';
import { STREAM } from '../data/streaming.js';
import { outfit } from './characters.js';

// CLONING (docs/design/WEB_CLONE_TRAVEL.md, rows in data/clones.js). Death as Autoduel had it:
//   - a PRESSING (backup) is bought at a vat's counter: the skills and xp of that moment, your look and flag. A vat holds
//     one body; coming up uses it, so you get pressed again or the next death is your last.
//   - dying lays a HUSK where you fell: everything you carried and wore, the scrip in your pockets, in one container you
//     (and the pickers) can go through; your car stays where you left it, trunk and all, marked on the map.
//   - after a few black seconds you COME UP in the vat holding your pressing: the pressing's skills, nothing on you but
//     the vat's loaner, brine-sick for a day, the brine book (your account) untouched.
//   - no pressing: you DIE FLAT. On a shard that character is over; on a local save it is flagged in the lineage and a
//     fresh drifter walks in (the character creator opens instead, when it lands: g.creator?.open).
// The pickers work every husk on the game clock (an hourly roll by where it lies, the best thing first, seeded per husk
// and hour so the same hours always take the same things), and after keepDays the husk is gone.

const r1 = (v) => Math.round(v * 10) / 10;
const BRINE = 'brine';
// Clone sickness rides the survival fold's one sickness slot (systems/survival.js N.sick): its row, registered here.
SICKNESS[BRINE] = { hours: CLONE_RULES.sickHours, eff: CLONE_RULES.sick, start: 'BRINE-SICK: THE NEW BODY IS NOT YOURS YET', over: 'THE BRINE SICKNESS PASSES: THE BODY IS YOURS' };

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Clone {
  constructor(game) {
    this.g = game;
    this.pressing = null;   // { vat, at (game hours), day, skills: {lv, xp}, look: {name, flag, colors}, free }
    this.bank = 0;          // the brine book: scrip that outlives you
    this.owed = 0;          // days of brine money unpaid
    this.husks = [];        // { id, n, name, flag, colors, x, z, gy, at, cash, throwables, car, lost[], pickedTo, gone }
    this.lineage = [];      // characters that died flat: { name, flag, at, reruns }
    this.reruns = 0;        // how many times this character has come up
    this.flat = null;       // { at, name } on a shard: this character is over
    this.nHusk = 0;
    this.lastDay = null;
    this.lastWake = null;   // what the last waking did (agents, the selftest)
    this.vatMeshes = [];
    this.started = false;
  }

  // ---- places --------------------------------------------------------------------------------------------------------
  get W() { return this.g.streamer?.W ?? null; }
  hours() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }
  vat(id) { return VATS.find((v) => v.id === id) ?? null; }
  // Where a vat stands: a world point on the map ({x, z, wake, onMap: true}) or a node off it ({onMap: false, node}).
  vatPlace(row) {
    if (!row) return null;
    if (row.at) return { x: row.at.x, z: row.at.z, wake: row.wake ?? { x: row.at.x, z: row.at.z + 2 }, onMap: true };
    const T = this.g.travel, n = row.port ? T?.node(row.port) : null;
    if (n?.onMap) return { x: n.counter.x, z: n.counter.z, wake: { x: n.counter.x + 1.5, z: n.counter.z + 1.5 }, onMap: true, node: row.port };
    if (n) return { onMap: false, node: row.port };
    const L = this.W?.locate(row.town);
    if (L && L.built && Math.hypot(L.x, L.z) < STREAM.dustWall - 1500) return { x: L.x, z: L.z, wake: { x: L.x + 2, z: L.z + 2 }, onMap: true };
    return { onMap: false, node: null };
  }
  // The vat whose counter you stand at (on the map), or the one in the off-map city whose hall holds you.
  vatHere(reach = 4) {
    const T = this.g.travel, away = T?.away;
    if (away) return VATS.find((v) => v.port === away.node) ?? null;
    const p = this.g.player;
    for (const row of VATS) { const pl = this.vatPlace(row); if (pl?.onMap && Math.hypot(pl.x - p.x, pl.z - p.z) < reach + 1.5) return row; }
    return null;
  }
  price(row = this.vatHere()) { return Math.round(CLONE_RULES.price * (row?.priceMul ?? 1)); }
  upkeep(row = this.vat(this.pressing?.vat)) { return Math.round(CLONE_RULES.upkeepPerDay * (row?.upkeepMul ?? 1)); }
  // What your pressing costs a day: Rust Haven's free starter pressing pays no brine money (the town covers its newcomers).
  due() { return this.pressing && !this.pressing.free ? this.upkeep() : 0; }

  // ---- the counter -----------------------------------------------------------------------------------------------------
  // Get pressed at the vat you stand at (or `vatId` with force, for agents staging). Pays from your pockets, then the brine
  // book. The scan takes an hour in the chair (the clock runs). Replaces the pressing you held (wherever it was).
  press(vatId = null, { free = false, force = false } = {}) {
    const g = this.g, row = vatId ? this.vat(vatId) : this.vatHere();
    if (!row) return { ok: false, why: vatId ? `no vat called ${vatId}` : 'not at a vat counter (a clinic brine room, or a knot that has one)' };
    if (!force && !free && this.vatHere()?.id !== row.id) return { ok: false, why: `you are not at ${row.name}` };
    const cost = free ? 0 : this.price(row);
    if (!this.pay(cost)) return { ok: false, why: `a pressing here is $${cost}: you have $${g.cash} on you and $${this.bank} in the brine book` };
    const p = g.player, was = this.pressing;
    this.pressing = { vat: row.id, at: +this.hours().toFixed(2), day: g.society?.day ?? 0, skills: JSON.parse(JSON.stringify(g.skillsSys.save())), look: { name: p.name, flag: p.flag, colors: p.colors ? JSON.parse(JSON.stringify(p.colors)) : null }, free };
    this.owed = 0;
    if (!free && CLONE_RULES.pressHours > 0) this.g.travel?.advanceHours(CLONE_RULES.pressHours, 'pressed');
    g.emit('pressed', { vat: row.id, cost, replaced: was?.vat ?? null, skills: this.pressing.skills.lv });
    if (!free) g.hud?.toast?.(`PRESSED AT ${row.short} · $${cost} · BRINE MONEY $${this.upkeep(row)}/DAY`, 'job');
    return { ok: true, vat: row.id, cost, pressing: this.pressingView() };
  }
  // Pay from the pockets first, then the brine book.
  pay(n) {
    const g = this.g;
    if (n <= 0) return true;
    if (g.cash + this.bank < n) return false;
    const fromPocket = Math.min(g.cash, n);
    g.cash -= fromPocket; this.bank -= n - fromPocket;
    return true;
  }
  deposit(n, { force = false } = {}) {
    const g = this.g;
    n = Math.floor(n);
    if (!(n > 0)) return { ok: false, why: 'deposit how much?' };
    if (!force && !this.vatHere()) return { ok: false, why: 'the brine book is kept at a vat counter' };
    if (g.cash < n) return { ok: false, why: `you have $${g.cash} on you` };
    g.cash -= n; this.bank += n;
    if (this.owed > 0 && this.pressing) this.settle();
    g.emit('brineBook', { deposit: n, bank: this.bank });
    return { ok: true, bank: this.bank, cash: g.cash };
  }
  withdraw(n, { force = false } = {}) {
    const g = this.g;
    n = Math.floor(n);
    if (!(n > 0)) return { ok: false, why: 'withdraw how much?' };
    if (!force && !this.vatHere()) return { ok: false, why: 'the brine book is kept at a vat counter' };
    if (this.bank < n) return { ok: false, why: `the brine book holds $${this.bank}` };
    this.bank -= n; g.cash += n;
    g.emit('brineBook', { withdraw: n, bank: this.bank });
    return { ok: true, bank: this.bank, cash: g.cash };
  }

  // ---- brine money: once a new day, from the brine book --------------------------------------------------------------
  newDay() {
    if (!this.pressing) { this.owed = 0; return; }
    const g = this.g, cost = this.due();
    if (this.bank >= cost) { this.bank -= cost; this.settle(); g.emit('brineMoney', { paid: cost, bank: this.bank }); return; }
    this.owed++;
    g.emit('brineMoney', { owed: this.owed, bank: this.bank });
    if (this.owed > CLONE_RULES.graceDays) {
      const v = this.vat(this.pressing.vat);
      this.pressing = null; this.owed = 0;
      g.hud?.toast?.(`THE VAT AT ${v?.short ?? 'THE BRINE ROOM'} DRAINED YOUR PRESSING: NOBODY PAID THE BRINE MONEY`, 'hot');
      g.emit('pressingLost', { vat: v?.id, why: 'unpaid' });
    } else g.hud?.toast?.(`BRINE MONEY OWED · ${this.owed} DAY${this.owed > 1 ? 'S' : ''} · PUT SCRIP IN THE BRINE BOOK`, 'warn');
  }
  settle() {
    while (this.owed > 0 && this.bank >= this.due()) { this.bank -= this.due(); this.owed--; }
  }

  // ---- dying ------------------------------------------------------------------------------------------------------------
  // main.js onKill, the player: the husk is laid now, with everything that was on you; the waking comes after the black.
  onDeath(p) {
    const g = this.g, inv = g.inventory, I = g.inv, R = CLONE_RULES.husk;
    const n = ++this.nHusk, id = `husk:${n}`;
    const name = p.name && p.name !== 'You' ? p.name : 'YOU';
    const box = inv.place(id, 'person', p.x, p.z, R.cap, `YOUR HUSK${name !== 'YOU' ? ` · ${name.toUpperCase()}` : ''}`);
    box.rolled = true; box.husk = true;
    if ((p.gy ?? 0) > 0.5) box.y = p.gy;
    let things = 0;
    for (const s of inv.carried.slots) { box.slots.push({ ...s }); things += s.n; }
    inv.carried.slots.length = 0;
    if (inv.worn) { inv.add(box, inv.worn, 1); things++; }
    inv.worn = null; inv.carried.cap = BODY_LITRES;
    const gearWorn = g.gear?.save()?.worn ?? {};
    for (const gid of Object.values(gearWorn)) { inv.add(box, gid, 1); things++; }
    g.gear?.load(null);
    for (const k of I.weapons) { const gi = GUN_ITEM[k]; if (gi) { inv.add(box, gi, 1, { cond: +(I.cond?.[k] ?? 1).toFixed(3), loaded: I.mag?.[k] ?? 0 }); things++; } }
    I.weapons = []; I.mag = {}; I.cond = {}; I.jam = {};
    const throwables = {};
    for (const [k, c] of Object.entries(I.throwables ?? {})) if (k !== 'rock' && c > 0) { throwables[k] = c; I.throwables[k] = 0; }
    const cash = g.cash; g.cash = 0;
    // Your car: the one you died in, or your last one if it stands close by.
    const v = p.inVehicle ?? g.lastVehicle;
    const car = v && g.vehicles.includes(v) && !v.dead && (p.inVehicle === v || Math.hypot(v.x - p.x, v.z - p.z) < R.carRange)
      ? { id: v.id, type: v.type, name: v.name, x: r1(v.x), z: r1(v.z) } : null;
    if (car) v.huskOf = id;
    const h = { id, n, name, flag: p.flag ?? 'US', colors: p.colors ? JSON.parse(JSON.stringify(p.colors)) : null, x: r1(p.x), z: r1(p.z), gy: r1(p.gy ?? 0), face: p.face ?? 0,
      at: +this.hours().toFixed(2), day: g.society?.day ?? 0, cash, throwables, car, lost: [], pickedTo: Math.floor(this.hours()), gone: false, corpse: null, stripped: false, where: this.whereKind(p.x, p.z) };
    this.husks.push(h);
    inv.changed();
    g.emit('huskLaid', { id, x: h.x, z: h.z, things, cash, car: car?.id ?? null, pressing: this.pressing?.vat ?? null });
    return h;
  }

  // The waking: main.js calls this when the black is over. Comes up in the pressing's vat, or dies flat.
  wake() {
    const g = this.g, p = g.player, P = this.pressing;
    if (!P) return this.dieFlat();
    const row = this.vat(P.vat), place = this.vatPlace(row);
    this.pressing = null; this.reruns++;
    this.revive(P.look);
    g.skillsSys.load(JSON.parse(JSON.stringify(P.skills))); // what you knew the day you were pressed: no more, no less
    this.kit();
    const N = g.needs;
    N.sick = { kind: BRINE, until: +(this.hours() + CLONE_RULES.sickHours).toFixed(2) };
    let where;
    if (place?.onMap) {
      const t = { x: place.wake.x, z: place.wake.z };
      g.statics.resolveCircle(t, 0.5);
      p.x = t.x; p.z = t.z; p.gy = 0; p.storey = null; g.standOn?.(p);
      p.face = Math.atan2(place.x - p.x, place.z - p.z); // looking at the vat you came out of
      g.camLook.x = p.x; g.camLook.z = p.z;
      g.streamer?.ensureHot(p.x, p.z, 'load');
      where = row.short;
    } else {
      g.travel?.hold(place?.node ?? null, { why: 'wake', vat: row?.id });
      where = row?.short ?? 'OFF THE MAP';
    }
    const h = this.husks[this.husks.length - 1];
    this.lastWake = { vat: row?.id, x: r1(p.x), z: r1(p.z), skills: P.skills.lv, husk: h?.id ?? null, at: +this.hours().toFixed(2), onMap: !!place?.onMap };
    g.emit('cloneWake', { vat: row?.id, x: r1(p.x), z: r1(p.z), reruns: this.reruns, husk: h?.id ?? null, stale: r1(this.hours() - P.at) });
    g.emit('respawn', { x: r1(p.x), z: r1(p.z) });
    if (h && !h.gone) g.qol?.setWaypoint?.({ x: h.x, z: h.z });
    g.hud?.toast?.(`YOU CAME UP IN THE BRINE · ${where}`, 'hot');
    g.hud?.toast?.(`BRINE-SICK FOR A DAY · NO PRESSING IN THE VAT NOW`, 'warn');
    if (h) g.hud?.subtitle?.(`Your husk lies ${this.placeName(h.x, h.z)}${h.car ? `, your ${h.car.name} beside it` : ''}. The pickers are already walking. [M] map`, 7);
    g.travel?.card?.('cloneWake', { where: row?.name ?? where, husk: h ? this.placeName(h.x, h.z) : null, stale: r1(this.hours() - P.at) });
    return { ok: true, ...this.lastWake };
  }

  // Back on your feet, whole, in a body that has never been anywhere.
  revive(look) {
    const g = this.g, p = g.player, N = g.needs;
    p.alive = true; p.hp = p.maxHp * CLONE_RULES.wakeHp; p.bleed = 0; p.burning = 0; p.deadTime = 0; p.inVehicle = null; p.onTrain = null; p.seatPose = null;
    p.headless = false; p.blood = 0;
    if (look?.name) p.name = look.name;
    if (look?.flag) p.flag = look.flag;
    if (look?.colors) { p.colors = JSON.parse(JSON.stringify(look.colors)); g.charR?.paint?.(p); }
    N.water = Math.max(N.water, 0.6); N.food = Math.max(N.food, 0.6); N.rest = Math.max(N.rest, 0.8);
    N.wounds.length = 0; N.infection = null; N.fever = null; N.wet = 0;
    g.wanted = 0;
    for (const c of g.chars) {
      if (c.grudge === p || c.target === p) { c.grudge = null; c.target = null; c.state = 'idle'; }
      if (c.ztarget === p) c.ztarget = null;
    }
  }

  // What the vat hands you: a worn loaner pistol, empty, a bottle of water, a rag. No pack.
  kit() {
    const g = this.g, I = g.inv, inv = g.inventory, K = CLONE_RULES.wakeKit, W = WEAPONS[K.gun];
    I.weapons = [K.gun]; I.current = K.gun; I.mag = { [K.gun]: Math.min(W?.mag ?? 0, K.loaded) }; I.cond = { [K.gun]: K.cond }; I.jam = {};
    for (const k of Object.keys(I.throwables ?? {})) I.throwables[k] = K.throwables?.[k] ?? 0;
    inv.worn = null; inv.carried.cap = BODY_LITRES; inv.carried.slots.length = 0;
    for (const [id, n] of K.items) inv.add(inv.carried, id, n);
    g.gear?.load(null);
    g.player.weapon = K.gun; g.player.reloading = 0;
    inv.changed();
  }

  // No pressing in the brine: this character is over. Shard: gone for good (the shard refuses it). Local: flagged in the
  // lineage, and a fresh drifter walks in from the flats (or the creator opens).
  dieFlat() {
    const g = this.g, p = g.player;
    const was = { name: p.name && p.name !== 'You' ? p.name : 'YOU', flag: p.flag, at: +this.hours().toFixed(2), reruns: this.reruns, day: g.society?.day ?? 0 };
    this.lineage.push(was);
    g.emit('diedFlat', { name: was.name, reruns: was.reruns });
    const onShard = g.shard?.state === 'inworld';
    if (onShard) {
      this.flat = { at: was.at, name: was.name };
      g.hud?.toast?.(`YOU DIED FLAT · NO PRESSING IN THE BRINE · ${was.name} IS OVER`, 'hot');
      g.travel?.card?.('flat', { name: was.name, shard: true });
      g.shard?.flushOnExit?.(); // the shard hears it now: it will not let this character in again
      this.lastWake = { flat: true, shard: true };
      return { ok: true, flat: true, shard: true };
    }
    // A fresh drifter: a new name and face, nothing learned, nothing owed, a stranger to every faction.
    const fresh = randomName();
    this.revive(null);
    p.hp = p.maxHp;
    p.name = fresh;
    g.skillsSys.load({ lv: Object.fromEntries(Object.keys(g.skillsSys.lv).map((k) => [k, 0])), xp: Object.fromEntries(Object.keys(g.skillsSys.xp).map((k) => [k, 0])) });
    const I = g.inv, inv = g.inventory;
    I.weapons = ['pistol']; I.current = 'pistol'; I.mag = { pistol: WEAPONS.pistol.mag }; I.cond = { pistol: 0.8 }; I.jam = {};
    inv.carried.slots.length = 0; inv.wear(START_KIT.pack);
    for (const [id, n] of START_KIT.items) inv.add(inv.carried, id, n);
    I.ammo.pistol = 18;
    g.gear?.load(null); p.weapon = 'pistol';
    inv.changed();
    g.cash = 0; this.bank = 0; this.owed = 0; this.reruns = 0;
    g.roles?.reset?.();
    const F = g.society?.factions;
    if (F) for (const id of F.ids) { const row = F.row(id); if (row.memory !== 'none') F.set(id, row.start); }
    if (this.quests0) g.quests = JSON.parse(JSON.stringify(this.quests0));
    // Rust Haven takes newcomers in at the clinic door, and presses them once (it needs bodies).
    const clinic = g.world?.spawns?.shops?.[0];
    const door = clinic?.doors?.[0] ?? { x: -53.5, z: -66 };
    p.x = door.x; p.z = door.z - 1.2; p.gy = 0; p.storey = null; g.standOn?.(p);
    g.camLook.x = p.x; g.camLook.z = p.z;
    if (CLONE_RULES.starterPressing) this.press('rust_haven', { free: true, force: true });
    this.lastWake = { flat: true, shard: false, fresh, x: r1(p.x), z: r1(p.z) };
    g.emit('respawn', { x: r1(p.x), z: r1(p.z) });
    g.hud?.toast?.(`YOU DIED FLAT · ${was.name} IS OVER`, 'hot');
    g.hud?.toast?.(`A NEW DRIFTER WALKS IN FROM THE FLATS: ${fresh.toUpperCase()}`, 'warn');
    g.travel?.card?.('flat', { name: was.name, fresh });
    g.creator?.open?.({ why: 'diedFlat' });
    return { ok: true, flat: true, shard: false, fresh };
  }

  // ---- the husk: taking your things back ----------------------------------------------------------------------------
  husk(id) { return this.husks.find((h) => h.id === id && !h.gone) ?? null; }
  nearestHusk(x, z, reach = 3) { let best = null, bd = reach; for (const h of this.husks) { if (h.gone) continue; const d = Math.hypot(h.x - x, h.z - z); if (d < bd) { bd = d; best = h; } } return best; }
  // Opening your husk (the PACK screen): the scrip in your old pockets and the throwables come straight back; the rest you
  // take like any body's things (or reclaim() takes all of it that fits).
  onOpened(h) {
    const g = this.g;
    if (h.cash > 0) { g.cash += h.cash; g.hud?.toast?.(`YOUR OLD ROLL OF SCRIP · +$${h.cash}`, 'job'); g.emit('huskCash', { id: h.id, cash: h.cash }); h.cash = 0; }
    for (const [k, c] of Object.entries(h.throwables ?? {})) if (c > 0) { g.inv.throwables[k] = (g.inv.throwables[k] ?? 0) + c; h.throwables[k] = 0; }
    if (!h.found) { h.found = +this.hours().toFixed(2); g.emit('huskFound', { id: h.id, hours: r1(h.found - h.at), lost: h.lost.length }); }
  }
  reclaim(id = null, { force = false } = {}) {
    const g = this.g, p = g.player, h = id ? this.husk(id) : this.nearestHusk(p.x, p.z, 3.5);
    if (!h) return { ok: false, why: id ? `no husk ${id}` : 'no husk of yours within reach' };
    if (!force && Math.hypot(h.x - p.x, h.z - p.z) > 3.5) return { ok: false, why: `your husk is ${Math.round(Math.hypot(h.x - p.x, h.z - p.z))} m away` };
    const inv = g.inventory, box = inv.boxes.get(h.id);
    this.onOpened(h);
    const took = [], left = [];
    if (box) {
      // Your guns first (slung or stowed), then a pack (worn, so the rest fits), then the rest.
      for (let i = box.slots.length - 1; i >= 0; i--) { const s = box.slots[i], it = ITEMS[s.id]; if (it?.kind === 'gun') { const r = inv.sling(box, i, true); if (r.ok) took.push(s.id); } }
      for (let i = box.slots.length - 1; i >= 0; i--) { const s = box.slots[i], it = ITEMS[s.id]; if (it?.pack && !inv.worn) { inv.take(box, i, 1); inv.wear(s.id); took.push(s.id); } }
      for (let i = box.slots.length - 1; i >= 0; i--) {
        const s = box.slots[i], it = ITEMS[s.id];
        if (it?.slot && g.gear?.row(s.id) && !g.gear.worn[g.gear.row(s.id).slot]) { inv.take(box, i, 1); g.gear.put(s.id); took.push(s.id); continue; }
        // Your own things back: no salvage, no theft (inventory.move would count it as a scavenger's find).
        const it2 = ITEMS[s.id], k = Math.min(s.n, it2?.bulk > 0 ? Math.floor((inv.room(inv.carried) + 1e-6) / it2.bulk) : s.n);
        if (k > 0) { const t = inv.take(box, i, k); inv.add(inv.carried, t.id, t.n, t); took.push(s.id); }
        if (s.n > 0) left.push(s.id); // what did not fit stays on the husk
      }
      inv.changed();
    }
    g.inventory.bindAmmo();
    g.emit('huskReclaimed', { id: h.id, took: took.length, left: left.length });
    return { ok: true, id: h.id, took, left, cash: g.cash };
  }

  // ---- the pickers --------------------------------------------------------------------------------------------------
  whereKind(x, z) {
    if (Math.abs(x) < 88 && Math.abs(z) < 88) return 'haven';
    const W = this.W;
    if (W?.ring?.inCity(x, z, 0) || (Math.abs(x) < 464 && Math.abs(z) < 464)) return 'ring';
    if (W && W.project(x, z, 600).d < 40) return 'road';
    return 'wild';
  }
  // One game hour of pickers on one husk (hour = the absolute game hour). Seeded: the same husk and hour always roll the
  // same. Returns what was taken, or null.
  pickHour(h, hour) {
    const g = this.g, P = CLONE_RULES.pick, rng = rngOf(hash(`${h.id}:${hour}`));
    const hh = ((hour % 24) + 24) % 24, night = hh >= 20 || hh < 5;
    const odds = (P.perHour[h.where] ?? P.perHour.wild) * (night ? P.night : 1);
    const inv = g.inventory, box = inv.boxes.get(h.id);
    let took = null;
    if (rng() < odds) {
      // The best thing first: the stack worth most, or the pocket scrip if that is worth more.
      let bi = -1, bv = 0;
      if (box) for (let i = 0; i < box.slots.length; i++) { const s = box.slots[i], v = (ITEMS[s.id]?.value ?? 1) * s.n; if (v > bv) { bv = v; bi = i; } }
      if (h.cash > 0 && h.cash * P.cashShare >= bv) { const n = Math.max(1, Math.floor(h.cash * P.cashShare)); h.cash -= n; took = { what: 'scrip', n, hour }; }
      else if (bi >= 0) { const s = box.slots[bi]; box.slots.splice(bi, 1); took = { what: s.id, n: s.n, hour }; }
    }
    // The car's trunk, at half the rate; after carStripDays its tyres go.
    const v = h.car && g.vehicles.find((x) => x.id === h.car.id);
    if (v && rng() < odds * P.trunkMul) {
      const t = inv.trunks.get(v.id);
      if (t?.slots.length) { let bi = 0, bv = -1; for (let i = 0; i < t.slots.length; i++) { const s = t.slots[i], val = (ITEMS[s.id]?.value ?? 1) * s.n; if (val > bv) { bv = val; bi = i; } } const s = t.slots.splice(bi, 1)[0]; h.lost.push({ what: s.id, n: s.n, hour, from: 'trunk' }); }
    }
    if (v && !h.stripped && hour - h.at >= P.carStripDays * 24 && Math.hypot(v.x - h.car.x, v.z - h.car.z) < 25) this.strip(h, v);
    if (took) { h.lost.push(took); g.emit('huskPicked', { id: h.id, what: took.what, n: took.n }); }
    return took;
  }
  strip(h, v) {
    h.stripped = true;
    for (const t of ['RL', 'RR']) this.g.vehDamage?.popTyre?.(v, t);
    this.g.emit('carStripped', { id: v.id, husk: h.id });
  }
  // Run the pickers up to `now` (game hours) on every husk; husks past keepDays are gone.
  pickTo(now) {
    const K = CLONE_RULES.husk.keepDays * 24;
    for (const h of this.husks) {
      if (h.gone) continue;
      const end = Math.floor(now);
      for (let hr = h.pickedTo + 1; hr <= end; hr++) {
        if (hr - h.at > K) { this.lose(h, 'the husk is gone: dragged off in the night'); break; }
        this.pickHour(h, hr);
      }
      h.pickedTo = Math.max(h.pickedTo, end);
    }
  }
  lose(h, why) {
    const g = this.g;
    h.gone = true;
    g.inventory.boxes.delete(h.id);
    if (h.corpse) { const c = g.chars.find((x) => x.id === h.corpse); if (c) g.removeChar(c); h.corpse = null; }
    g.emit('huskGone', { id: h.id, why });
  }

  // ---- the frame ------------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g;
    if (!this.started) this.start();
    const day = g.society?.day ?? 0;
    if (this.lastDay === null) this.lastDay = day;
    while (this.lastDay < day) { this.lastDay++; this.newDay(); }
    if (this.lastDay > day) this.lastDay = day; // a load from earlier
    this.pickT = (this.pickT ?? 0) - dt;
    if (this.pickT <= 0) { this.pickT = 0.5; this.pickTo(this.hours()); this.drawHusks(); }
    // Your husk opened on the PACK screen: what was in your pockets comes back.
    const op = g.inventory.opened;
    if (op?.husk) { const h = this.husk(op.id); if (h && (h.cash > 0 || Object.values(h.throwables ?? {}).some((c) => c > 0) || !h.found)) this.onOpened(h); }
  }
  start() {
    this.started = true;
    const g = this.g;
    this.quests0 = JSON.parse(JSON.stringify(g.quests ?? {}));
    if (CLONE_RULES.starterPressing && !this.pressing && !this.husks.length && !this.lineage.length && !this.loaded) this.press('rust_haven', { free: true, force: true });
    this.buildVats();
  }
  // The body on the ground: a real dead body near you, drawn by the character renderer; nothing far off.
  drawHusks() {
    const g = this.g, p = g.player, R = CLONE_RULES.husk.promoteR;
    if (!p.alive) return; // the black: your own body is still lying there as you
    for (const h of this.husks) {
      let c = h.corpse ? g.chars.find((x) => x.id === h.corpse) : null;
      const near = !h.gone && Math.hypot(h.x - p.x, h.z - p.z) < R;
      if (near && !c) {
        c = g.addChar({ x: h.x, z: h.z, faction: 'drifter', name: `${h.name} (husk)`, flag: h.flag, colors: h.colors ?? undefined, hp: 1 });
        if (!c) continue;
        c.id = `husk-body:${h.n}`; c.husk = h.id;
        c.x = h.x; c.z = h.z; c.gy = h.gy; c.face = h.face;
        c.alive = false; c.hp = 0; c.deadTime = 30; c.blood = 0.85; c.hold = true; c.speed = 0;
        g.charR?.paint?.(c);
        h.corpse = c.id;
        this.maybePicker(h);
      } else if (c && !near) { g.removeChar(c); h.corpse = null; c = null; this.dropPicker(h); }
      if (c) { c.deadTime = 30; c.x = h.x; c.z = h.z; } // never recycled as an old corpse while you are near (main.js cleans those past 90 s)
      this.watchPicker(h);
    }
  }

  // ---- a picker at work: who took your things, caught at it ---------------------------------------------------------
  // When the husk is drawn and something was taken from it in the last `fresh` hours, the one who took it may still be
  // there, crouched over it (seeded per husk and hour). Seen close, they run with what they took; dropped, it is on them.
  maybePicker(h) {
    const g = this.g, PS = CLONE_RULES.pick.seen, now = this.hours();
    if (h.picker) return;
    const recent = h.lost.filter((l) => l.from !== 'trunk' && l.what !== 'scrip' && now - l.hour < PS.fresh);
    if (!recent.length || rngOf(hash(`${h.id}:picker:${Math.floor(now)}`))() > PS.odds) return;
    const rng = rngOf(hash(`${h.id}:pk:${Math.floor(now)}`));
    const pk = g.addChar({ x: h.x + 0.9, z: h.z + 0.5, faction: 'drifter', weapon: rng() < PS.armed ? 'pistol' : null, name: randomName(rng), flag: g.randomFlag ? g.randomFlag(rng) : 'US', colors: outfit('drifter', rng) });
    if (!pk) return;
    pk.picker = h.id; pk.loot = recent.map((l) => ({ what: l.what, n: l.n })); pk.crouch = true; pk.hold = true;
    pk.home = { x: pk.x, z: pk.z }; pk.wx = pk.x; pk.wz = pk.z; pk.face = Math.atan2(h.x - pk.x, h.z - pk.z);
    for (const l of recent) l.carried = pk.id;
    h.picker = pk.id;
    g.emit('pickerAtHusk', { husk: h.id, id: pk.id, carrying: pk.loot.map((l) => l.what) });
  }
  watchPicker(h) {
    const g = this.g, p = g.player, PS = CLONE_RULES.pick.seen;
    if (!h.picker) return;
    const pk = g.chars.find((c) => c.id === h.picker);
    if (!pk) { h.picker = null; return; }
    if (!pk.alive) {
      // Dropped: what they took is on their body now (main.js made their box when they fell).
      const box = g.inventory.boxes.get(`body:${pk.id}`);
      if (box) { for (const l of pk.loot ?? []) if (ITEMS[l.what]) g.inventory.add(box, l.what, l.n); box.rolled = true; }
      g.emit('pickerDown', { husk: h.id, id: pk.id, dropped: (pk.loot ?? []).map((l) => l.what) });
      pk.loot = []; h.picker = null;
      return;
    }
    const d = Math.hypot(pk.x - p.x, pk.z - p.z);
    if (pk.hold && d < PS.fleeR && g.statics.lineOfSight(pk.x, pk.z, p.x, p.z)) {
      pk.hold = false; pk.crouch = false; pk.flee = 12; pk.fleeX = p.x; pk.fleeZ = p.z;
      g.emit('pickerRuns', { husk: h.id, id: pk.id });
      g.hud?.toast?.('A PICKER AT YOUR HUSK · THEY RUN WITH YOUR THINGS', 'warn');
    }
    if (!pk.hold && Math.hypot(pk.x - h.x, pk.z - h.z) > PS.goneR) { g.emit('pickerGone', { husk: h.id, id: pk.id, took: (pk.loot ?? []).map((l) => l.what) }); g.removeChar(pk); h.picker = null; }
  }
  dropPicker(h) {
    if (!h.picker) return;
    const pk = this.g.chars.find((c) => c.id === h.picker);
    if (pk?.alive && pk.hold) this.g.removeChar(pk); // still crouched there unseen: back into the record
    h.picker = null;
  }

  // ---- the vat you come up in: a glass tank of amber brine with a body in it (2 draw calls, culled off screen) ---------
  buildVats() {
    const g = this.g;
    if (!g.scene || this.vatMeshes.length) return;
    for (const row of VATS) {
      const pl = this.vatPlace(row);
      if (!pl?.onMap || !row.at) continue; // the knots' vats stand inside their halls (no hall built yet): the clinic's is drawn
      const grp = vatModel();
      grp.position.set(pl.x, 0, pl.z);
      g.scene.add(grp);
      this.vatMeshes.push(grp);
    }
  }

  // ---- what agents and the map read ------------------------------------------------------------------------------------
  placeName(x, z) {
    const W = this.W;
    if (Math.abs(x) < 464 && Math.abs(z) < 464) return `in ${this.g.qol ? 'Phoenix' : 'the island'} (${Math.round(x)}, ${Math.round(z)})`;
    if (W) { const pr = W.project(x, z, 4096); if (pr.d < 300) return `at I-10 mile ${(pr.s / STREAM.mile).toFixed(1)}`; return `out at ${W.nameAt(x, z)}`; }
    return `at (${Math.round(x)}, ${Math.round(z)})`;
  }
  pressingView() {
    const P = this.pressing;
    if (!P) return null;
    const row = this.vat(P.vat);
    return { vat: P.vat, name: row?.name, at: P.at, day: P.day, staleHours: r1(this.hours() - P.at), skills: P.skills.lv, xp: P.skills.xp, look: P.look?.name ?? null, free: !!P.free };
  }
  view() {
    const g = this.g, here = this.vatHere();
    return {
      pressing: this.pressingView(), bank: this.bank, owed: this.owed, upkeepPerDay: this.due(), reruns: this.reruns,
      flat: this.flat, lineage: this.lineage, sick: g.needs?.sick?.kind === BRINE ? { hoursLeft: r1(g.needs.sick.until - this.hours()) } : null,
      here: here ? { vat: here.id, name: here.name, price: this.price(here) } : null,
      husks: this.husks.map((h) => {
        const box = g.inventory.boxes.get(h.id), v = h.car && g.vehicles.find((x) => x.id === h.car.id);
        return { id: h.id, x: h.x, z: h.z, place: this.placeName(h.x, h.z), where: h.where, hoursAgo: r1(this.hours() - h.at), gone: h.gone, cash: h.cash, found: h.found ?? null,
          items: box ? box.slots.map((s) => ({ id: s.id, n: s.n })) : [], lost: h.lost.length, lostList: h.lost.slice(-8),
          car: h.car ? { ...h.car, there: !!v, x: v ? r1(v.x) : h.car.x, z: v ? r1(v.z) : h.car.z, trunk: v ? (g.inventory.trunks.get(v.id)?.slots ?? []).map((s) => ({ id: s.id, n: s.n })) : [], stripped: h.stripped } : null,
          drawn: !!h.corpse, dist: Math.round(Math.hypot(h.x - g.player.x, h.z - g.player.z)) };
      }),
      vats: VATS.map((v) => { const pl = this.vatPlace(v); return { id: v.id, name: v.name, town: v.town, onMap: !!pl?.onMap, x: pl?.onMap ? r1(pl.x) : null, z: pl?.onMap ? r1(pl.z) : null, price: this.price(v), upkeep: this.upkeep(v) }; }),
      keeps: CLONE_KEEPS, lastWake: this.lastWake,
    };
  }
  // Marks on the big map (qol.js calls every layer with its own world->canvas transform).
  drawMap(c, T) {
    for (const h of this.husks) {
      if (h.gone) continue;
      const [x, y] = T(h.x, h.z);
      c.strokeStyle = '#1b1410'; c.lineWidth = 5; c.beginPath(); c.moveTo(x - 7, y - 7); c.lineTo(x + 7, y + 7); c.moveTo(x + 7, y - 7); c.lineTo(x - 7, y + 7); c.stroke();
      c.strokeStyle = '#ff5a3c'; c.lineWidth = 3; c.stroke();
      c.font = '700 13px Barlow Condensed'; c.textAlign = 'left'; c.lineWidth = 3; c.strokeStyle = '#1b1410'; c.fillStyle = '#ffb59a';
      c.strokeText('YOUR HUSK', x + 10, y + 4); c.fillText('YOUR HUSK', x + 10, y + 4);
      const v = h.car && this.g.vehicles.find((q) => q.id === h.car.id);
      if (v) { const [a, b] = T(v.x, v.z); c.strokeStyle = '#1b1410'; c.lineWidth = 4; c.strokeRect(a - 5, b - 5, 10, 10); c.strokeStyle = '#f2e6d0'; c.lineWidth = 2; c.strokeRect(a - 5, b - 5, 10, 10); c.fillStyle = '#f2e6d0'; c.strokeText(`YOUR ${v.name}`, a + 9, b + 20); c.fillText(`YOUR ${v.name}`, a + 9, b + 20); }
    }
  }

  // ---- save / load ----------------------------------------------------------------------------------------------------
  save() {
    const inv = this.g.inventory;
    return {
      v: 1, pressing: this.pressing ? JSON.parse(JSON.stringify(this.pressing)) : null, bank: this.bank, owed: this.owed, reruns: this.reruns, flat: this.flat, nHusk: this.nHusk, lastDay: this.lastDay,
      lineage: this.lineage.map((x) => ({ ...x })),
      husks: this.husks.map((h) => ({ ...h, corpse: null, lost: h.lost.map((x) => ({ ...x })), throwables: { ...h.throwables }, car: h.car ? { ...h.car } : null, slots: (inv.boxes.get(h.id)?.slots ?? []).map((s) => ({ ...s })) })),
    };
  }
  load(s) {
    const g = this.g, inv = g.inventory;
    // The bodies drawn before (and any the save brought back as plain dead people) go; they are drawn again near you.
    for (const c of [...g.chars]) if (c.husk || String(c.id).startsWith('husk-body:')) g.removeChar(c);
    for (const h of this.husks) inv.boxes.delete(h.id);
    this.loaded = true; this.started = this.started || false;
    if (!s) { this.husks = []; return; }
    this.pressing = s.pressing ? JSON.parse(JSON.stringify(s.pressing)) : null;
    this.bank = s.bank ?? 0; this.owed = s.owed ?? 0; this.reruns = s.reruns ?? 0; this.flat = s.flat ?? null; this.nHusk = s.nHusk ?? 0;
    this.lastDay = s.lastDay ?? null;
    this.lineage = (s.lineage ?? []).map((x) => ({ ...x }));
    this.husks = (s.husks ?? []).map((h) => {
      const { slots, ...rest } = h;
      const r = { ...rest, corpse: null, lost: (h.lost ?? []).map((x) => ({ ...x })), throwables: { ...(h.throwables ?? {}) }, car: h.car ? { ...h.car } : null };
      if (!r.gone) {
        const box = inv.place(r.id, 'person', r.x, r.z, CLONE_RULES.husk.cap, `YOUR HUSK${r.name !== 'YOU' ? ` · ${String(r.name).toUpperCase()}` : ''}`);
        box.rolled = true; box.husk = true; if (r.gy > 0.5) box.y = r.gy;
        box.slots = (slots ?? []).filter((x) => ITEMS[x.id]).map((x) => ({ ...x }));
      }
      return r;
    });
    for (const h of this.husks) if (h.stripped && h.car) { const v = g.vehicles.find((x) => x.id === h.car.id); if (v) { v.huskOf = h.id; for (const t of ['RL', 'RR']) g.vehDamage?.popTyre?.(v, t); } }
  }
}

// The vat: a steel plinth and crown, pipes, a glass tube, amber brine, and the next body floating in it.
const _vatGeo = {};
function vatModel() {
  const grp = new THREE.Group();
  if (!_vatGeo.solid) {
    const parts = [];
    const col = (geo, hex) => { const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo.index ? geo.toNonIndexed() : geo; };
    const fix = (g) => (g.index ? g.toNonIndexed() : g);
    parts.push(col(fix(new THREE.CylinderGeometry(0.82, 0.9, 0.42, 20)).translate(0, 0.21, 0), '#3c3a37'));     // plinth
    parts.push(col(fix(new THREE.CylinderGeometry(0.86, 0.86, 0.08, 20)).translate(0, 0.46, 0), '#8a7a5a'));    // brass ring
    // The crown is a ring with a cross-brace and the feed valve to one side: from the street camera you look down
    // through it into the brine.
    parts.push(col(fix(new THREE.TorusGeometry(0.76, 0.1, 8, 24)).rotateX(Math.PI / 2).translate(0, 2.3, 0), '#3c3a37'));
    parts.push(col(fix(new THREE.BoxGeometry(1.5, 0.08, 0.1)).translate(0, 2.32, 0), '#4a4642'));
    parts.push(col(fix(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 10)).translate(0.55, 2.42, -0.35), '#8a7a5a'));
    // The brine (amber, lit from below) and the next body floating in it, arms out, seen from above.
    parts.push(col(fix(new THREE.CapsuleGeometry(0.19, 0.75, 4, 10)).translate(0, 1.38, 0), '#8a5a3a'));          // torso and legs
    parts.push(col(fix(new THREE.SphereGeometry(0.17, 10, 8)).translate(0, 1.92, 0.02), '#8a5a3a'));             // head, just under
    parts.push(col(fix(new THREE.CapsuleGeometry(0.06, 0.5, 3, 6)).rotateZ(1.2).translate(0.28, 1.7, 0), '#8a5a3a'));   // arms out
    parts.push(col(fix(new THREE.CapsuleGeometry(0.06, 0.5, 3, 6)).rotateZ(-1.2).translate(-0.28, 1.7, 0), '#8a5a3a'));
    // A drain grate on the floor in front, where you came out.
    parts.push(col(fix(new THREE.BoxGeometry(1.1, 0.03, 0.7)).translate(0, 0.015, 1.15), '#4a443c'));
    for (let k = -2; k <= 2; k++) parts.push(col(fix(new THREE.BoxGeometry(0.06, 0.04, 0.66)).translate(k * 0.2, 0.03, 1.15), '#9a9080'));
    // Pipes to the wall, and a gauge box.
    for (const sx of [-1, 1]) parts.push(col(fix(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8)).rotateX(Math.PI / 2).translate(sx * 0.42, 2.25, -0.75), '#5a5048'));
    parts.push(col(fix(new THREE.BoxGeometry(0.42, 0.5, 0.18)).translate(0.95, 1.2, -0.3), '#2c2a28'));
    parts.push(col(fix(new THREE.BoxGeometry(0.3, 0.16, 0.02)).translate(0.95, 1.3, -0.2), '#e0a030'));
    const merged = mergeAll(parts);
    _vatGeo.solid = merged;
    _vatGeo.glass = new THREE.CylinderGeometry(0.74, 0.74, 1.82, 24, 1, true).translate(0, 1.37, 0);
    // The brine: amber, see-through enough to show who floats in it, lit a little from inside.
    _vatGeo.brine = new THREE.CylinderGeometry(0.67, 0.67, 1.64, 24).translate(0, 1.29, 0);
    _vatGeo.brineMat = new THREE.MeshStandardMaterial({ color: '#e09a2a', emissive: '#7a3e08', emissiveIntensity: 0.55, transparent: true, opacity: 0.5, roughness: 0.25, depthWrite: false });
    _vatGeo.solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3, emissive: '#3a1e04', emissiveIntensity: 0.6 });
    _vatGeo.glassMat = new THREE.MeshStandardMaterial({ color: '#cfe0d0', transparent: true, opacity: 0.28, roughness: 0.08, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  }
  const solid = new THREE.Mesh(_vatGeo.solid, _vatGeo.solidMat); solid.castShadow = true; solid.receiveShadow = true;
  const brine = new THREE.Mesh(_vatGeo.brine, _vatGeo.brineMat); brine.renderOrder = 1;
  const glass = new THREE.Mesh(_vatGeo.glass, _vatGeo.glassMat); glass.renderOrder = 2;
  grp.add(solid, brine, glass);
  return grp;
}
function mergeAll(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.computeBoundingSphere();
  return m;
}
