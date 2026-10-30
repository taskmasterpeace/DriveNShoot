import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { SHELTER } from '../data/survival.js';
import { KINDS as CG_KINDS } from '../data/citygen.js';
import { roadLines } from '../world/city.js';
import { outfit } from './characters.js';
import { CAMP_KIT, CAMP_BELLS, CAMP_RULES as CR, FORTIFY, FURNITURE, FURNISHED, HAUL, ROOMS, BASE_RULES as BR, RAID, TENURE as T } from '../data/homes.js';

// CAMPS AND BASES (docs/design/WEB_CAMPS_BASES.md; rows in data/homes.js). g.homes.
//   camp     a night off the road: a bedroll or a tent from your pack, the wilds' fire pit (a real fire), trip bells, the
//            crew's watch. Seen and smelt (seenR, a lit fire at night is a beacon), risk read off roads, towns and hordes,
//            fed to survival.js as the shelter's danger; strike it and the same kit goes back in your pack
//   bases    a claimed building (citygen's claimable kinds): empty, cleared or taken. Fortified with real planks and scrap
//            (the interiors' boards, the gadgets' door bars, a yard wall, a gate, a tower, a turret you found), furnished
//            with pieces of the world you carried home, rooms that work, a stash that persists, burglars on the clock
//   pieces   every lived-in building's furniture (piecesOf: seeded from its id). A piece has ONE place: where it was made,
//            your hands, a vehicle, a base room or the ground (`moved`). Nothing is ever minted
//   owners   who really owns a town's houses (a faction, a family, a landlord): a record with a purse, and a person at
//            the door when you are near. You rent or buy from them and nobody else; rent and tax come due on the clock
// The truth lives here (records keyed by `<town id>:<building id>`); citygen rebuilds a town from its plan, so ownership is
// written back onto the live buildings (B.owner) and the boards and bars onto their openings each time they attach.
const r1 = (v) => Math.round(v * 10) / 10;
const hashS = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rngOf = (s) => { let a = hashS(s) || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; };
const MAX_INST = 420, ISLAND = 464;
const _o = new THREE.Object3D(), _c = new THREE.Color();
const NO_PIECES = Object.freeze([]);

// The camp is a shelter survival.js knows (its climate pull and the rest), its danger is ours (shelterFor).
SHELTER.camp ??= { label: 'CAMP', rest: 0.9, pull: 0.2, to: 18, danger: CR.danger };

export class Homes {
  constructor(game) {
    const g = (this.g = game);
    game.homes = this;
    this.camp = null;            // { x, z, face, kit, bells, pit, at, watch: { i, at } }
    this.bases = new Map();      // bk -> base
    this.owners = new Map();     // owner id -> { id, kind, name, flag, faction, town, purse, dead, c }
    this.ownerOfBk = new Map();  // bk -> owner id (derived once, pure)
    this.tenure = new Map();     // bk -> { mode: 'rent' | 'own', owner, since, paidTo, taxTo, missed }
    this.moved = new Map();      // fid -> { at: 'hands' | 'veh' | 'base' | 'ground' | 'gone', kind, from, veh, bk, room, x, z }
    this.pieceCache = new Map(); // bk -> [{ fid, kind, x, z, face }] (pure)
    this.hauling = null;         // fid in your arms
    this.raids = [];             // the log: { day, bk, burglar, took, def, gaveUp }
    this.burglars = [];          // { id, name, flag, faction, carried, from, day }
    this.job = null;             // { label, t, need, x, z, done }
    this.applied = new Map(); // bk -> the openings record our boards and bars went onto (not saved)
    this.seq = 0; this.slowT = 0; this.drawT = 0; this.lastDay = null; this.noticed = 0;
    this.stats = { pitched: 0, struck: 0, belled: 0, warned: 0, claimed: 0, fortified: 0, lifted: 0, placed: 0, raids: 0, bought: 0, rented: 0, evicted: 0, burned: 0 };
    if (game.scene) {
      this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92 }), MAX_INST);
      this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false; this.mesh.castShadow = true;
      this.mesh.setColorAt(0, _c.set('#000000'));
      game.scene.add(this.mesh);
    }
  }
  hours() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }
  day() { return this.g.society?.day ?? 0; }
  night() { return (this.g.sky?.night ?? 0) > 0.5; }
  inv() { return this.g.inventory; }

  // ---- the work clock (one place: the timed-actions lane's clock replaces this when it lands) ---------------------------
  startJob(label, secs, done) {
    const P = this.g.player;
    if (this.job) return { ok: false, why: `busy: ${this.job.label}` };
    this.job = { label, t: 0, need: secs, x: P.x, z: P.z, done };
    this.g.emit('homeJob', { label, secs });
    return { ok: true, text: `${label.toUpperCase()} · ${secs} S`, secs };
  }
  jobStep(dt) {
    const J = this.job, P = this.g.player;
    if (Math.hypot(P.x - J.x, P.z - J.z) > 2.5 || P.inVehicle || !P.alive) { this.job = null; this.g.hud?.toast?.(`STOPPED · ${J.label.toUpperCase()}`, 'warn'); this.g.emit('homeJobStopped', { label: J.label }); return; }
    J.t += dt;
    if (J.t >= J.need) { this.job = null; this.lastJob = J.done(); }
  }

  // ---- where things are --------------------------------------------------------------------------------------------
  // Metres to the nearest road's edge (the island's grid, the corridors, a live town's streets); Infinity past 400 m.
  roadDist(x, z) {
    const g = this.g;
    let d = Infinity;
    if (Math.abs(x) < ISLAND && Math.abs(z) < ISLAND) for (const c of roadLines) { const k = Math.min(Math.abs(x - c), Math.abs(z - c)) - 7; if (k < d) d = k; }
    const W = g.convoy?.W ?? g.world?.index ?? null, pr = W?.project?.(x, z, 400);
    if (pr && Number.isFinite(pr.d)) d = Math.min(d, pr.d - 6);
    for (const t of g.citygen?.live?.values() ?? []) {
      const TT = t.T; if (x < TT.x0 - 60 || x > TT.x1 + 60 || z < TT.z0 - 60 || z > TT.z1 + 60) continue;
      for (const r of TT.roads) { const k = Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1)); if (k < d) d = k; }
    }
    return Math.max(0, d);
  }
  // Metres to the nearest settlement's edge (a holding one; a fallen town is a horde's, counted there).
  townDist(x, z) {
    let d = Infinity;
    for (const s of this.g.citygen?.near?.(x, z, CR.town.r + 600) ?? []) { if (s.state === 'overrun') continue; const k = Math.hypot(s.x - x, s.z - z) - s.half; if (k < d) d = k; }
    if (Math.abs(x) < ISLAND + CR.town.r && Math.abs(z) < ISLAND + CR.town.r) d = Math.min(d, Math.max(0, Math.max(Math.abs(x), Math.abs(z)) - ISLAND));
    return Math.max(0, d);
  }
  infectedNear(x, z, r) { let n = 0; for (const c of this.g.chars) if (c.alive && c.faction === 'zombie' && Math.abs(c.x - x) < r && Math.abs(c.z - z) < r && Math.hypot(c.x - x, c.z - z) < r) n++; return n; }
  hostile(c) { const g = this.g, P = g.player; return c !== P && c.alive && (c.faction === 'zombie' || c.target === P || !!g.ai?.hostile?.(c, P)); }

  // ======================================================================================================== THE CAMP
  kitOf(kind) { return CAMP_KIT[kind] ?? null; }
  pitch({ kind = 'bedroll', fire = false, bells = false } = {}) {
    const g = this.g, P = g.player, inv = this.inv(), K = this.kitOf(kind);
    if (!K) return { ok: false, why: `pitch what? ${Object.keys(CAMP_KIT).join(' | ')}` };
    if (this.camp) return { ok: false, why: 'you have a camp pitched (strike it first)' };
    if (P.inVehicle || P.swim || (g.water?.depthAt?.(P.x, P.z) ?? 0) > CR.keepOff.water) return { ok: false, why: 'pitch on dry ground, out of the car' };
    if (g.insideBuilding || g.citygen?.buildingAt?.(P.x, P.z)) return { ok: false, why: 'under a roof you sleep in a building, not a camp' };
    const rd = this.roadDist(P.x, P.z);
    if (rd < CR.keepOff.road) return { ok: false, why: `too near the road (${r1(rd)} m): get ${CR.keepOff.road} m off it` };
    if (!inv.carried.count(K.item)) return { ok: false, why: `no ${ITEMS[K.item].name.toLowerCase()} on you` };
    if (bells && !inv.carried.count(CAMP_BELLS.item)) return { ok: false, why: 'no trip bells on you' };
    if (fire && (inv.carried.count('deadwood') ?? 0) < 3) return { ok: false, why: 'a fire takes 3 deadwood' };
    return this.startJob('pitching camp', CR.pitchS, () => {
      inv.spend(K.item, 1); if (bells) inv.spend(CAMP_BELLS.item, 1); // the bed goes behind you, the fire pit in front (outdoors.build)
      const o = { x: r1(P.x - Math.sin(P.face) * 1.9), z: r1(P.z - Math.cos(P.face) * 1.9), face: +P.face.toFixed(2), kit: kind, bells: !!bells, pit: null, at: +this.hours().toFixed(2), watch: { i: 0, at: this.hours() } };
      this.camp = o;
      let lit = null;
      if (fire) { const r = g.outdoors?.build?.('firepit'); if (r?.ok) { o.pit = r.id; lit = true; } else lit = r?.why ?? 'no fire'; }
      inv.changed?.(); this.stats.pitched++;
      g.emit('campPitched', { kit: kind, x: o.x, z: o.z, bells: o.bells, fire: o.pit, risk: this.campView().danger });
      g.hud?.toast?.(`CAMP PITCHED · ${kind.toUpperCase()}${o.pit ? ' · FIRE LIT' : ' · COLD CAMP'}${o.bells ? ' · BELLS OUT' : ''}`, 'job');
      return { ok: true, camp: this.campView(), fire: lit };
    });
  }
  strike() {
    const g = this.g, o = this.camp;
    if (!o) return { ok: false, why: 'no camp pitched' };
    if (Math.hypot(g.player.x - o.x, g.player.z - o.z) > 4) return { ok: false, why: 'walk back to your camp to strike it' };
    if (g.survival?.sleep) return { ok: false, why: 'you are asleep' };
    return this.startJob('striking camp', CR.strikeS, () => {
      const inv = this.inv(), back = [{ item: CAMP_KIT[o.kit].item, n: 1 }];
      inv.stow(CAMP_KIT[o.kit].item, 1);
      if (o.bells) { inv.stow(CAMP_BELLS.item, 1); back.push({ item: CAMP_BELLS.item, n: 1 }); }
      const pit = o.pit && g.outdoors?.camp?.find((k) => k.id === o.pit);
      if (pit) pit.fuel = 0; // kicked out: the ash ring stays, the wood is burnt
      this.camp = null; inv.changed?.(); this.stats.struck++;
      g.emit('campStruck', { back });
      g.hud?.toast?.('CAMP STRUCK · PACKED UP', 'job');
      return { ok: true, back };
    });
  }
  pitOf() { const o = this.camp; return o?.pit ? this.g.outdoors?.camp?.find((k) => k.id === o.pit) ?? null : null; }
  lit() { const p = this.pitOf(); return !!p && p.fuel > 0; }
  // How far off someone notices the camp now (night = true/false to ask about the other half of the day).
  seenR(night = this.night()) {
    const o = this.camp; if (!o) return 0;
    const K = CAMP_KIT[o.kit];
    return (night ? CR.seen.night : CR.seen.day) * K.hide * (this.lit() ? (night ? CR.fire.night : CR.fire.day) : 1);
  }
  smellR() { return this.lit() ? CR.fire.smellR : 0; }
  // The lookout: your crew within 30 m of the camp, each standing CR.watchHours in turn.
  watchers() { const o = this.camp, out = []; if (!o) return out; for (const m of this.g.crew?.members ?? []) { const c = m.c; if (c?.alive && !m.down && Math.hypot(c.x - o.x, c.z - o.z) < 30) out.push(m); } return out; }
  onWatch() { const W = this.watchers(); if (!W.length) return null; return W[Math.floor(this.hours() / CR.watchHours) % W.length]; }
  danger() {
    const o = this.camp; if (!o) return 0;
    const night = this.night(), f = { road: 1, town: 1, horde: 1, fire: 1, lookout: 1 };
    if (this.roadDist(o.x, o.z) < CR.road.r) f.road = CR.road.mul;
    if (this.townDist(o.x, o.z) < CR.town.r) f.town = CR.town.mul;
    if (this.infectedNear(o.x, o.z, CR.horde.r) >= CR.horde.min) f.horde = CR.horde.mul;
    if (this.lit()) f.fire = night ? CR.fireMul.night : CR.fireMul.day;
    if (this.onWatch()) f.lookout = CR.lookout.mul;
    this.factors = f;
    return CR.danger * f.road * f.town * f.horde * f.fire * f.lookout;
  }
  atCamp(x, z) { const o = this.camp; return !!o && Math.hypot(x - o.x, z - o.z) < 4.5; }
  // survival.js asks: are you lying down in your camp? (shelterKind) and what is a night there worth (shelterFor).
  shelterKind() { const P = this.g.player; return !P.inVehicle && this.atCamp(P.x, P.z) ? 'camp' : null; }
  shelterFor() { const K = CAMP_KIT[this.camp.kit]; return { kind: 'camp', rest: K.rest + (this.camp.kit === 'tent' ? 0.02 : 0), danger: this.danger(), parts: null }; }
  campBed(p) { return this.atCamp(p.x, p.z); }
  sleep() {
    const g = this.g, P = g.player;
    if (!this.camp) return { ok: false, why: 'no camp pitched' };
    if (!this.atCamp(P.x, P.z)) return { ok: false, why: 'lie down at your camp (within 4 m)' };
    return g.survival.sleepAt('bedroll');
  }
  // Once a second: the bells, the watch, and who out there sees the camp.
  campPass() {
    const g = this.g, o = this.camp, S = g.survival;
    if (!o) return;
    const asleep = !!S?.sleep, night = this.night(), seen = this.seenR(night), watcher = this.onWatch();
    const warnR = watcher ? (night ? CR.lookout.warnRNight : CR.lookout.warnR) : 0;
    for (const c of g.chars) {
      if (!this.hostile(c)) continue;
      const d = Math.hypot(c.x - o.x, c.z - o.z);
      if (asleep && o.bells && d < CAMP_BELLS.r) { this.stats.belled++; g.audio?.bell?.(g.pan?.(o.x)); g.emit('campBells', { by: c.id, d: r1(d) }); S.wake('the bells'); return; }
      if (asleep && watcher && d < warnR) { this.stats.warned++; g.emit('campWarned', { by: c.id, watcher: watcher.id ?? watcher.name, d: r1(d) }); S.wake(`${watcher.name ?? 'your lookout'} on watch`); return; }
      this.notice(c, d, seen);
    }
  }
  // Someone out there sees the camp: the infected remember the place, anyone hostile comes to look.
  notice(c, d, seen = this.seenR()) {
    const o = this.camp;
    if (!o || d > seen || c.campSeen === o.at) return false;
    c.campSeen = o.at; this.noticed++;
    if (c.faction === 'zombie') this.g.zombies?.remember?.(c, o.x, o.z, 'camp');
    else if (!c.target && c.weapon && this.atCamp(this.g.player.x, this.g.player.z)) { c.target = this.g.player; c.state = 'fight'; } // they come to look
    this.g.emit('campSeen', { by: c.id, faction: c.faction, d: r1(d), seenR: r1(seen), lit: this.lit() });
    return true;
  }
  campView() {
    const o = this.camp; if (!o) return null;
    const P = this.g.player, w = this.onWatch();
    return { kit: o.kit, x: o.x, z: o.z, dist: r1(Math.hypot(o.x - P.x, o.z - P.z)), bells: o.bells, fire: o.pit, lit: this.lit(), seenR: r1(this.seenR()), seenRDay: r1(this.seenR(false)), seenRNight: r1(this.seenR(true)), smellR: this.smellR(),
      danger: +this.danger().toFixed(3), factors: { ...this.factors }, road: r1(Math.min(9999, this.roadDist(o.x, o.z))), town: r1(Math.min(99999, this.townDist(o.x, o.z))), watch: w ? (w.name ?? w.id) : null, watchers: this.watchers().length };
  }

  // ======================================================================================================== OWNERS
  bkOf(R) { return `${R.rec?.id ?? 'x'}:${R.B.id}`; }
  liveR(bk) {
    const i = bk.indexOf(':'), tid = bk.slice(0, i), bid = bk.slice(i + 1), t = this.g.citygen?.live?.get(tid);
    return t?.blds.find((R) => String(R.B.id) === bid) ?? null;
  }
  buildingNear(x, z) { return this.g.citygen?.buildingAt?.(x, z) ?? null; }
  // Who owns it (pure from the ids, then whatever happened since): an owner record, or null for nobody.
  ownerOf(R) {
    const bk = this.bkOf(R);
    const T0 = this.tenure.get(bk);
    if (T0?.mode === 'own') return { id: 'player', kind: 'player', name: this.g.player?.name ?? 'you' };
    if (this.bases.has(bk) && !T0) return { id: 'player', kind: 'player', name: this.g.player?.name ?? 'you' };
    let id = this.ownerOfBk.get(bk);
    if (id === undefined) { id = this.deriveOwner(R, bk); this.ownerOfBk.set(bk, id); }
    return id ? this.owners.get(id) ?? null : null;
  }
  deriveOwner(R, bk) {
    const g = this.g, B = R.B, rec = R.rec ?? {}, rng = rngOf(`own:${bk}`);
    if (!B.claimable || rec.state === 'overrun' || rec.kind === 'base') return null;
    let kind;
    if (rec.kind === 'rural') { if (rng() < T.ruralEmpty) return null; kind = 'family'; }
    else { const k = rng(); kind = k < T.owners.faction ? 'faction' : k < T.owners.faction + T.owners.family ? 'family' : 'landlord'; }
    const place = g.stories?.place?.(rec.id), holder = place?.owner?.kind === 'faction' ? place.owner : null;
    if (kind === 'faction' && !holder) kind = 'landlord';
    const id = kind === 'faction' ? `fac:${rec.id}` : kind === 'landlord' ? `land:${rec.id}` : `fam:${bk}`;
    const old = this.owners.get(id);
    if (!old || old.restored) {
      const r = rngOf(id), sur = T.surnames[Math.floor(r() * T.surnames.length)], given = T.given[Math.floor(r() * T.given.length)], flag = T.flags[Math.floor(r() * T.flags.length)];
      const name = kind === 'faction' ? `${holder.name} quartermaster` : kind === 'landlord' ? `${given} ${sur}` : `${given} ${sur}`;
      this.owners.set(id, { id, kind, name, house: kind === 'family' ? `the ${sur} family` : null, flag, faction: kind === 'faction' ? holder.id : 'drifter', town: rec.id, purse: old?.purse ?? 0, dead: !!old?.dead, moved: !!old?.moved, c: null, door: bk });
    }
    return id;
  }
  // The owner as a person: at the door of the house we first met them by, while you are near (law 1: you deal face to face).
  ownersPass() {
    const g = this.g, P = g.player;
    for (const O of this.owners.values()) {
      if (O.c && (!O.c.alive || !g.chars.includes(O.c))) { if (!O.c.alive && O.c.homeOwner === O.id) { O.dead = true; g.emit('ownerDied', { owner: O.id, name: O.name }); } O.c = null; }
      if (O.dead || !O.door) continue;
      const R = this.liveR(O.door), far = !R || Math.hypot((R.minX + R.maxX) / 2 - P.x, (R.minZ + R.maxZ) / 2 - P.z) > 130;
      if (O.c && far) { g.removeChar(O.c); O.c = null; continue; }
      if (!O.c && R && !far && Math.hypot((R.minX + R.maxX) / 2 - P.x, (R.minZ + R.maxZ) / 2 - P.z) < 80) this.promote(O, R);
    }
  }
  doorOf(R) {
    const t = this.g.citygen?.live?.get(R.rec?.id), B = R.B;
    const d = t?.built.doors.find((q) => q.b === B.id && q.kind === 'door' && q.side === B.front) ?? t?.built.doors.find((q) => q.b === B.id && q.kind === 'door');
    if (!d) return { x: (R.minX + R.maxX) / 2, z: R.maxZ + 1.6 };
    return { x: d.x + (d.side === 'E' ? 1.6 : d.side === 'W' ? -1.6 : 0), z: d.z + (d.side === 'S' ? 1.6 : d.side === 'N' ? -1.6 : 0) };
  }
  promote(O, R) {
    const g = this.g, at = this.doorOf(R);
    const c = g.addChar({ x: at.x, z: at.z, faction: O.faction, hp: 100, colors: outfit(O.faction === 'drifter' ? 'drifter' : O.faction), name: O.kind === 'family' ? `${O.name} (${O.house})` : O.name, flag: O.flag });
    if (!c) return null;
    c.homeOwner = O.id; c.hold = true; c.home = { x: at.x, z: at.z }; c.amb = true;
    O.c = c;
    return c;
  }

  // ======================================================================================================== HOUSES: list, rent, buy
  price(R) {
    const B = R.B, area = (R.maxX - R.minX) * (R.maxZ - R.minZ), st = Math.max(1, B.n ?? 1);
    return Math.round(T.perM2 * area * st * (T.kindMul[B.kind] ?? 1) * (T.stateMul[R.rec?.state === 'overrun' ? 'overrun' : 'holding']));
  }
  houseView(R) {
    const bk = this.bkOf(R), O = this.ownerOf(R), price = this.price(R), Tn = this.tenure.get(bk), mine = this.bases.has(bk);
    const offer = !O || O.kind === 'player' || O.dead ? [] : O.kind === 'family' ? ['buy'] : ['rent', 'buy'];
    return { id: bk, kind: R.B.kind, x: r1((R.minX + R.maxX) / 2), z: r1((R.minZ + R.maxZ) / 2), storeys: R.B.n ?? 1, owner: O ? { id: O.id, kind: O.kind, name: O.name, flag: O.flag, dead: !!O.dead, at: O.c ? O.c.id : null } : null,
      price: O?.kind === 'family' ? Math.round(price * 1.2) : price, rent: Math.round(price * T.rentShare), offer, tenure: Tn ? { ...Tn } : null, mine, claimable: !!R.B.claimable };
  }
  houses(x = this.g.player.x, z = this.g.player.z, r = 300) {
    const out = [];
    for (const t of this.g.citygen?.live?.values() ?? []) for (const R of t.blds) {
      if (!R.B.claimable || Math.hypot((R.minX + R.maxX) / 2 - x, (R.minZ + R.maxZ) / 2 - z) > r) continue;
      out.push(this.houseView(R));
    }
    return out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  }
  // Deal with the owner in person: `from` is who you hand the money to. Only the real owner can take it.
  deal(R, mode, from) {
    const g = this.g, P = g.player, bk = this.bkOf(R), O = this.ownerOf(R);
    if (!O || O.dead) return { ok: false, why: 'nobody owns it to sell: claim it (base action=claim)' };
    if (O.kind === 'player') return { ok: false, why: 'it is yours already' };
    if (mode === 'rent' && O.kind === 'family') return { ok: false, why: `the ${O.house ?? 'family'} live in it: they would sell, not let it` };
    if (!from || from.homeOwner !== O.id || !from.alive) return { ok: false, why: `${from?.name ?? 'they'} ${from ? 'do not' : 'does not'} own it: ${O.name} does`, owner: O.id };
    if (Math.hypot(from.x - P.x, from.z - P.z) > T.reach) return { ok: false, why: `stand with ${O.name} (within ${T.reach} m)` };
    if (this.bases.size >= BR.max && !this.bases.has(bk)) return { ok: false, why: `you hold ${BR.max} places already` };
    const v = this.houseView(R), cost = mode === 'buy' ? v.price : v.rent;
    if (g.cash < cost) return { ok: false, why: `$${cost} ${mode === 'buy' ? 'to buy' : 'a week'} (you have $${g.cash})` };
    g.cash -= cost; O.purse += cost;
    const day = this.day();
    this.tenure.set(bk, mode === 'buy' ? { mode: 'own', owner: 'player', from: O.id, since: day, paidTo: Infinity, taxTo: day + T.weekDays, missed: 0, price: v.price } : { mode: 'rent', owner: O.id, since: day, paidTo: day + T.weekDays, taxTo: Infinity, missed: 0, rent: v.rent });
    if (mode === 'buy' && O.kind === 'family') { O.moved = true; if (O.c) { O.c.hold = false; O.c.home = { x: O.c.x + 40, z: O.c.z }; } }
    this.makeBase(R, mode === 'buy' ? 'bought' : 'rented');
    g.society?.deeds?.record?.(mode === 'buy' ? 'trade' : 'pay', { target: from, x: P.x, z: P.z, m: 1, tf: g.society?.factions?.fidFor?.(from) ?? '' });
    this.stats[mode === 'buy' ? 'bought' : 'rented']++;
    g.emit(mode === 'buy' ? 'houseBought' : 'houseRented', { id: bk, owner: O.id, cost });
    g.hud?.toast?.(`${mode === 'buy' ? 'BOUGHT' : 'RENTED'} · ${R.B.kind.toUpperCase()} · $${cost}${mode === 'rent' ? '/WEEK' : ''} · FROM ${O.name.toUpperCase()}`, 'job');
    return { ok: true, id: bk, cost, owner: O.id, purse: O.purse, cash: g.cash };
  }
  pay(bk) {
    const g = this.g, P = g.player, Tn = this.tenure.get(bk);
    if (!Tn) return { ok: false, why: 'you neither rent nor own that' };
    if (Tn.mode === 'rent') {
      const O = this.owners.get(Tn.owner);
      if (!O?.c || Math.hypot(O.c.x - P.x, O.c.z - P.z) > T.reach) return { ok: false, why: `pay ${O?.name ?? 'the owner'} in person (within ${T.reach} m)` };
      if (g.cash < Tn.rent) return { ok: false, why: `$${Tn.rent} due` };
      g.cash -= Tn.rent; O.purse += Tn.rent; Tn.paidTo = Math.max(Tn.paidTo, this.day()) + T.weekDays; Tn.missed = 0;
      return { ok: true, paid: Tn.rent, paidTo: Tn.paidTo };
    }
    const R = this.liveR(bk), rec = R?.rec;
    if (!rec || Math.hypot(rec.x - P.x, rec.z - P.z) > rec.half + 20) return { ok: false, why: 'the collector takes it in town' };
    const tax = Math.round(Tn.price * T.tax.share);
    if (g.cash < tax) return { ok: false, why: `$${tax} due` };
    g.cash -= tax; const H = this.owners.get(`fac:${rec.id}`); if (H) H.purse += tax;
    Tn.taxTo = Math.max(Tn.taxTo, this.day()) + T.weekDays; Tn.missed = 0;
    return { ok: true, paid: tax, taxTo: Tn.taxTo, to: H?.name ?? 'the town' };
  }
  // The day turns: rent and tax come due; unpaid, the place is taken back, or burned.
  dueDay(day) {
    for (const [bk, Tn] of this.tenure) {
      if (Tn.mode === 'rent' && day > Tn.paidTo + T.graceDays) this.evict(bk, 'rent unpaid');
      else if (Tn.mode === 'own' && day > Tn.taxTo + T.tax.graceDays) { Tn.missed++; Tn.taxTo = day; if (Tn.missed >= T.tax.burnAfter) this.burn(bk, 'protection unpaid'); }
    }
  }
  evict(bk, why) {
    const g = this.g, Tn = this.tenure.get(bk), b = this.bases.get(bk);
    this.tenure.delete(bk);
    if (b) { const box = this.inv().boxes.get(b.stash); if (box) { box.owner = this.owners.get(Tn.owner)?.c?.id ?? null; box.ownerName = this.owners.get(Tn.owner)?.name; } this.unbase(bk); }
    this.stats.evicted++;
    g.emit('evicted', { id: bk, why, owner: Tn?.owner });
    g.hud?.toast?.(`TAKEN BACK · ${why.toUpperCase()}`, 'hot');
  }
  burn(bk, why) {
    const g = this.g, b = this.bases.get(bk);
    if (!b) return null;
    const box = this.inv().boxes.get(b.stash), lost = box ? box.slots.map((s) => ({ id: s.id, n: s.n })) : [];
    if (box) box.slots.length = 0;
    for (const fid of b.pieces) { const m = this.moved.get(fid); if (m) m.at = 'gone'; }
    b.pieces.length = 0; b.fort = { windows: 0, doors: 0, parts: [] }; b.state = 'burned';
    const F = g.throwables?.fires;
    if (F && Math.hypot(b.x - g.player.x, b.z - g.player.z) < 200) for (let k = 0; k < 3; k++) F.push({ x: b.x + (k - 1) * 2.5, z: b.z, r: 2.2, t: 1, dur: 40, by: null });
    this.tenure.delete(bk); this.unbase(bk); this.stats.burned++;
    g.emit('baseBurned', { id: bk, why, lost });
    g.hud?.toast?.(`BURNED OUT · ${why.toUpperCase()}`, 'hot');
    return lost;
  }

  // ======================================================================================================== THE BASE
  claim(R) {
    const g = this.g, P = g.player;
    if (!R) return { ok: false, why: 'stand in the building you want' };
    const B = R.B, bk = this.bkOf(R);
    if (!B.claimable) return { ok: false, why: `a ${CG_KINDS[B.kind]?.name ?? B.kind} is not a place you can live in` };
    if (this.bases.has(bk)) return { ok: false, why: 'it is yours already' };
    if (this.bases.size >= BR.max) return { ok: false, why: `you hold ${BR.max} places already` };
    const inside = g.chars.filter((c) => this.hostile(c) && c.x > R.minX - BR.clearR && c.x < R.maxX + BR.clearR && c.z > R.minZ - BR.clearR && c.z < R.maxZ + BR.clearR).length;
    if (inside) return { ok: false, why: `clear it first: ${inside} hostile inside` };
    const O = this.ownerOf(R);
    let how = 'empty';
    if (O && O.kind !== 'player' && !O.dead) {
      const F = g.society?.factions, fi = F?.index?.[O.faction];
      const hostile = (O.c && g.ai?.hostile?.(O.c, P)) || (fi !== undefined && F.playerHostile?.[fi] === 1);
      if (!hostile) return { ok: false, why: `${O.name} owns it: rent or buy (home action=list)`, owner: O.id };
      how = 'taken';
      g.society?.deeds?.record?.('steal', { x: P.x, z: P.z, m: 3, label: `${O.name}'s house`, tf: O.faction, stars: 0 });
    } else if (O?.dead) how = 'taken';
    else if (R.rec?.state === 'overrun') how = 'cleared';
    const b = this.makeBase(R, how);
    return { ok: true, id: bk, how, base: this.baseView(b) };
  }
  makeBase(R, how) {
    const g = this.g, bk = this.bkOf(R), B = R.B, x = r1((R.minX + R.maxX) / 2), z = r1((R.minZ + R.maxZ) / 2);
    let b = this.bases.get(bk);
    if (!b) {
      b = { id: bk, kind: B.kind, name: `${(CG_KINDS[B.kind]?.name ?? B.kind).toUpperCase()} · ${R.rec?.name ?? 'OUT IN THE OPEN'}`, town: R.rec?.id ?? null, how, day: this.day(), x, z,
        rect: { x0: r1(R.minX), z0: r1(R.minZ), x1: r1(R.maxX), z1: r1(R.maxZ) }, front: B.front ?? 'S', stash: `base:${bk}`, fort: { windows: 0, doors: 0, parts: [] }, pieces: [], state: 'held' };
      this.bases.set(bk, b);
    } else b.how = how;
    this.stashOf(b);
    B.owner = 'player';
    g.citygen?.claim?.(R);
    g.survival?.claim?.(R);
    if (g.crew && !g.crew.base) g.crew.base = { x, z, name: b.name, day: this.day() };
    for (const c of g.chars) if (c !== g.player && c.home && !c.homeOwner && c.home.x > R.minX && c.home.x < R.maxX && c.home.z > R.minZ && c.home.z < R.maxZ) c.home = this.doorOf(R); // whoever slept here moves out
    this.stats.claimed++;
    g.emit('baseClaimed', { id: bk, how, kind: B.kind, x, z });
    g.hud?.toast?.(`${how === 'bought' ? 'BOUGHT' : how === 'rented' ? 'RENTED' : 'CLAIMED'} · ${b.name} · YOURS`, 'job');
    return b;
  }
  unbase(bk) {
    const g = this.g, b = this.bases.get(bk);
    if (!b) return;
    this.bases.delete(bk);
    const R = this.liveR(bk); if (R) R.B.owner = null;
    if (g.survival?.hold && Math.abs(g.survival.hold.minX - b.rect.x0) < 0.06 && Math.abs(g.survival.hold.minZ - b.rect.z0) < 0.06) g.survival.hold = null;
    if (g.crew?.base && Math.hypot(g.crew.base.x - b.x, g.crew.base.z - b.z) < 1) g.crew.base = null;
  }
  stashOf(b) {
    const inv = this.inv();
    let box = inv.boxes.get(b.stash);
    if (!box) { box = inv.place(b.stash, 'crate', b.x, b.z, this.stashCap(b), `BASE STASH · ${b.name}`); box.rolled = true; }
    box.cap = this.stashCap(b); box.x = b.x; box.z = b.z; box.owner = null; box.ownerName = null;
    return box;
  }
  baseAt(x, z, pad = 0) { for (const b of this.bases.values()) if (x > b.rect.x0 - pad && x < b.rect.x1 + pad && z > b.rect.z0 - pad && z < b.rect.z1 + pad) return b; return null; }
  // Who holds the ground at (x, z): 'player' in your base, an owner id in a house somebody owns, else null.
  ownerAt(x, z) {
    if (this.baseAt(x, z)) return 'player';
    const R = this.buildingNear(x, z);
    return R?.B?.claimable ? this.ownerOf(R)?.id ?? null : null;
  }
  // ---- rooms ----
  rooms(b) {
    const out = {};
    for (const fid of b.pieces) { const m = this.moved.get(fid); if (!m?.room) continue; (out[m.room] ??= []).push(m.kind); }
    return out;
  }
  gives(b) {
    const g0 = { stash: 0, rest: 0, heal: 1, crewBeds: 0, cook: false, dogRest: false, repair: 1, mood: 0 }, rooms = this.rooms(b);
    for (const [room, kinds] of Object.entries(rooms)) {
      const Rm = ROOMS[room]; if (!Rm) continue;
      const G = Rm.gives;
      if (G.crewBeds) g0.crewBeds += kinds.length * G.crewBeds;
      if (G.stash) g0.stash += G.stash;
      if (G.rest) g0.rest += G.rest;
      if (G.heal) g0.heal = Math.max(g0.heal, G.heal);
      if (G.cook) g0.cook = true;
      if (G.dogRest) g0.dogRest = true;
      if (G.repair) g0.repair = Math.max(g0.repair, G.repair);
      if (G.mood) g0.mood += G.mood;
    }
    return g0;
  }
  stashCap(b) { return BR.stash + this.gives(b).stash; }
  // survival.js: a night in your hold is worth its infirmary.
  restBonus() { const H = this.g.survival?.hold; if (!H) return 0; const b = this.baseAt((H.minX + H.maxX) / 2, (H.minZ + H.maxZ) / 2); return b ? this.gives(b).rest : 0; }

  // ---- fortify ----
  defense(b) {
    let d = b.fort.windows * FORTIFY.board_windows.def + b.fort.doors * FORTIFY.bar_doors.def;
    for (const p of b.fort.parts) d += FORTIFY[p]?.def ?? 0;
    return Math.min(BR.defenseCap, d);
  }
  openingsOf(b) { const R = this.liveR(b.id); return R?.open ? this.g.interiors?.ringOpen?.get(R.open) ?? null : null; }
  fortify(kind) {
    const g = this.g, P = g.player, inv = this.inv(), F = FORTIFY[kind];
    if (!F) return { ok: false, why: `fortify what? ${Object.keys(FORTIFY).join(' | ')}` };
    const b = this.baseAt(P.x, P.z, 8);
    if (!b) return { ok: false, why: 'stand at your base' };
    if (F.needs && !b.fort.parts.includes(F.needs)) return { ok: false, why: `a ${F.name} needs the ${FORTIFY[F.needs].name} first` };
    if (!F.per && b.fort.parts.includes(kind)) return { ok: false, why: `it has a ${F.name}` };
    let todo = 1, list = null;
    if (F.per) {
      const O = this.openingsOf(b);
      if (!O) return { ok: false, why: 'its doors and windows are not in reach (walk up to it)' };
      list = F.per === 'window' ? O.windows.filter((W) => W.state !== 'boarded') : O.doors.filter((d) => !d.barricade && !d.broken && d.leaves?.length !== 0);
      if (!list.length) return { ok: false, why: `every ${F.per} is done` };
      const can = Math.min(...F.cost.map(([id, n]) => Math.floor(inv.carried.count(id) / n)));
      todo = Math.min(list.length, can);
      if (!todo) return { ok: false, why: `each ${F.per} takes ${F.cost.map(([id, n]) => `${n} ${ITEMS[id].name.toLowerCase()}`).join(' and ')}` };
    } else for (const [id, n] of F.cost) if (inv.carried.count(id) < n) return { ok: false, why: `a ${F.name} takes ${F.cost.map(([i, k]) => `${k} ${ITEMS[i].name.toLowerCase()}`).join(' and ')}` };
    return this.startJob(`${F.per ? `${F.name} x${todo}` : `building the ${F.name}`}`, F.secs * todo, () => {
      for (const [id, n] of F.cost) inv.spend(id, n * todo);
      if (kind === 'board_windows') for (let i = 0; i < todo; i++) { const W = list[i], R = this.liveR(b.id); g.interiors.board(W, this.outside(W, R), P); }
      else if (kind === 'bar_doors') for (let i = 0; i < todo; i++) g.gadgets?.barricade?.(list[i], 'planks', P, false);
      if (kind === 'board_windows') b.fort.windows += todo; else if (kind === 'bar_doors') b.fort.doors += todo; else b.fort.parts.push(kind);
      this.stats.fortified += todo; inv.changed?.();
      g.emit('baseFortified', { id: b.id, kind, n: todo, defense: +this.defense(b).toFixed(2) });
      g.hud?.toast?.(`${F.name.toUpperCase()}${todo > 1 ? ` x${todo}` : ''} · DEFENSE ${Math.round(this.defense(b) * 100)}`, 'job');
      return { ok: true, kind, n: todo, defense: +this.defense(b).toFixed(2) };
    });
  }
  // Which side of a window is out (boards go on the inside: you board up from within).
  outside(W, R) { if (!R) return 1; const cx = (R.minX + R.maxX) / 2, cz = (R.minZ + R.maxZ) / 2; return ((W.x - cx) * (W.nx ?? 0) + (W.z - cz) * (W.nz ?? 0)) >= 0 ? -1 : 1; }
  // A town rebuilt from its plan gets new openings: the boards and the bars you put up go back on them.
  reapply() {
    const g = this.g;
    for (const b of this.bases.values()) {
      const R = this.liveR(b.id);
      if (!R) { this.applied.delete(b.id); continue; }
      R.B.owner = 'player';
      if (!R.open) continue;
      const O = g.interiors?.ringOpen?.get(R.open); if (!O || this.applied.get(b.id) === O) continue; // the record, not its id: a rebuilt town reuses the id
      let w = b.fort.windows, d = b.fort.doors;
      for (const W of O.windows) if (w > 0 && W.state !== 'boarded') { g.interiors.board(W, this.outside(W, R), null); w--; } else if (W.state === 'boarded') w--;
      for (const door of O.doors) if (d > 0 && !door.barricade) { g.gadgets?.barricade?.(door, 'planks', null, false); d--; }
      this.applied.set(b.id, O);
    }
  }

  // ---- furniture: lift, load, place ----
  piecesOf(R) {
    const bk = this.bkOf(R);
    let L = this.pieceCache.get(bk);
    if (L) return L;
    const B = R.B, F = FURNISHED[B.kind] ?? (B.claimable || B.loot === 'house' ? FURNISHED._default : null);
    if (!F) { this.pieceCache.set(bk, NO_PIECES); return NO_PIECES; }
    const rng = rngOf(`furn:${bk}`), n = F.n[0] + Math.floor(rng() * (F.n[1] - F.n[0] + 1)), w = R.maxX - R.minX, d = R.maxZ - R.minZ;
    L = [];
    const bag = F.from.slice(); // drawn without putting back: a house has one stove, not two (a list may name a kind twice)
    for (let i = 0; i < n && bag.length; i++) {
      const kind = bag.splice(Math.floor(rng() * bag.length), 1)[0], S = FURNITURE[kind].size;
      const x = R.minX + 1.1 + S[0] / 2 + rng() * Math.max(0, w - 2.2 - S[0]), z = R.minZ + 1.1 + S[2] / 2 + rng() * Math.max(0, d - 2.2 - S[2]);
      L.push({ fid: `pc:${bk}:${i}`, kind, x: r1(x), z: r1(z), face: rng() < 0.5 ? 0 : Math.PI / 2, bk });
    }
    this.pieceCache.set(bk, L);
    return L;
  }
  // Where a piece is now: its record if it moved, else where it was made (if its building is built).
  pieceWhere(fid) {
    const m = this.moved.get(fid); if (m) return m;
    const bk = fid.slice(3, fid.lastIndexOf(':')), R = this.liveR(bk);
    const p = R && this.piecesOf(R).find((q) => q.fid === fid);
    return p ? { at: 'origin', kind: p.kind, from: bk, x: p.x, z: p.z } : null;
  }
  // Every place the world holds this piece (the check counts them: it must be exactly one).
  placesOf(fid) {
    let n = 0;
    const m = this.moved.get(fid);
    if (m && m.at !== 'gone') n++;
    if (!m) { const w = this.pieceWhere(fid); if (w) n++; }
    for (const b of this.bases.values()) if (b.pieces.includes(fid) && m?.at !== 'base') n++;
    return n;
  }
  piecesNear(x, z, r = HAUL.reach) {
    const out = [];
    const R = this.buildingNear(x, z);
    if (R) for (const p of this.piecesOf(R)) if (!this.moved.has(p.fid) && Math.hypot(p.x - x, p.z - z) < r) out.push({ fid: p.fid, kind: p.kind, x: p.x, z: p.z, at: 'origin' });
    for (const [fid, m] of this.moved) if ((m.at === 'ground' || m.at === 'base') && Math.hypot(m.x - x, m.z - z) < r) out.push({ fid, kind: m.kind, x: m.x, z: m.z, at: m.at, room: m.room ?? null });
    return out.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  }
  lift(fid) {
    const g = this.g, P = g.player;
    if (this.hauling) return { ok: false, why: 'your arms are full' };
    if (P.inVehicle) return { ok: false, why: 'get out first' };
    const near = this.piecesNear(P.x, P.z), p = fid ? near.find((q) => q.fid === fid) : near[0];
    if (!p) return { ok: false, why: fid ? `no piece ${fid} within ${HAUL.reach} m` : 'no furniture within reach' };
    return this.startJob(`lifting the ${FURNITURE[p.kind].name}`, HAUL.liftS, () => {
      const prev = this.moved.get(p.fid);
      if (prev?.at === 'base') { const b = this.bases.get(prev.bk); if (b) b.pieces.splice(b.pieces.indexOf(p.fid), 1); }
      const from = prev?.from ?? p.fid.slice(3, p.fid.lastIndexOf(':'));
      this.moved.set(p.fid, { at: 'hands', kind: p.kind, from });
      this.hauling = p.fid; P.haulSlow = FURNITURE[p.kind].slow; this.stats.lifted++;
      // Somebody else's sofa: a theft (their house, their things).
      if (p.at === 'origin') { const R = this.liveR(from), O = R && this.ownerOf(R); if (O && !O.dead && O.kind !== 'player') g.society?.deeds?.record?.('steal', { target: O.c ?? null, x: P.x, z: P.z, m: 2, label: O.name, tf: O.faction, stars: 1, owner: true }); }
      g.emit('pieceLifted', { fid: p.fid, kind: p.kind, from });
      return { ok: true, fid: p.fid, kind: p.kind, slow: P.haulSlow };
    });
  }
  haulRoom(v) { return HAUL.vehicle[v.type] ?? HAUL.vehicle[v.kind] ?? (this.g.decks?.room?.(v) ? HAUL.vehicle.pickup : HAUL.vehicle._default); }
  load(v) {
    const g = this.g, P = g.player, fid = this.hauling;
    if (!fid) return { ok: false, why: 'carry something to load' };
    if (!v || v.dead || Math.hypot(v.x - P.x, v.z - P.z) > 5) return { ok: false, why: 'walk it to a vehicle' };
    const cap = this.haulRoom(v); let used = 0;
    for (const m of this.moved.values()) if (m.at === 'veh' && m.veh === v.id) used += FURNITURE[m.kind].bulk;
    const m = this.moved.get(fid), need = FURNITURE[m.kind].bulk;
    if (used + need > cap) return { ok: false, why: cap ? `no room in the ${v.type} (${cap - used} L left, a ${FURNITURE[m.kind].name} is ${need})` : `a ${v.type} has no bed to haul in` };
    m.at = 'veh'; m.veh = v.id; this.hauling = null; P.haulSlow = 1;
    g.emit('pieceLoaded', { fid, veh: v.id });
    return { ok: true, fid, veh: v.id, used: used + need, cap };
  }
  unload(v, fid) {
    const P = this.g.player;
    if (this.hauling) return { ok: false, why: 'your arms are full' };
    if (!v || Math.hypot(v.x - P.x, v.z - P.z) > 5) return { ok: false, why: 'stand at the vehicle' };
    const id = fid ?? [...this.moved].find(([, m]) => m.at === 'veh' && m.veh === v.id)?.[0];
    const m = id && this.moved.get(id);
    if (!m || m.at !== 'veh' || m.veh !== v.id) return { ok: false, why: 'nothing of that in it' };
    m.at = 'hands'; m.veh = null; this.hauling = id; P.haulSlow = FURNITURE[m.kind].slow;
    return { ok: true, fid: id };
  }
  set(room = null) {
    const g = this.g, P = g.player, fid = this.hauling;
    if (!fid) return { ok: false, why: 'carry something to set down' };
    const m = this.moved.get(fid), F = FURNITURE[m.kind], b = this.baseAt(P.x, P.z);
    if (room && !F.uses.includes(room)) return { ok: false, why: `a ${F.name} serves ${F.uses.join(' | ')}` };
    return this.startJob(`setting the ${F.name} down`, HAUL.setS, () => {
      m.x = r1(P.x); m.z = r1(P.z); this.hauling = null; P.haulSlow = 1;
      if (b) { m.at = 'base'; m.bk = b.id; m.room = room ?? F.uses[0]; b.pieces.push(fid); this.stashOf(b); this.stats.placed++; }
      else { m.at = 'ground'; m.room = null; m.bk = null; }
      g.emit('piecePlaced', { fid, kind: m.kind, at: m.at, base: m.bk ?? null, room: m.room });
      return { ok: true, fid, at: m.at, base: m.bk ?? null, room: m.room, rooms: b ? this.rooms(b) : null };
    });
  }

  // ---- raids: a burglar on the clock while you are away ----
  exposure(b) {
    const R = this.liveR(b.id), rec = R?.rec ?? this.g.citygen?.byId?.get?.(b.town);
    let e = !b.town ? RAID.exposure.open : rec?.state === 'overrun' ? RAID.exposure.fallen : rec?.kind === 'rural' ? RAID.exposure.open : RAID.exposure.town;
    if (this.infectedNear(b.x, b.z, 220) >= 6) e *= RAID.exposure.horde;
    return e;
  }
  worth(box) { let w = 0; for (const s of box.slots) w += (ITEMS[s.id]?.value ?? 1) * s.n; return w; }
  raidOdds(b) {
    const box = this.inv().boxes.get(b.stash), Tn = this.tenure.get(b.id);
    const taxed = Tn?.mode === 'own' && Tn.missed > 0 ? 3 : 1, prot = Tn?.mode === 'own' && !Tn.missed ? RAID.protect : 1;
    return Math.min(0.95, RAID.base * this.exposure(b) * (1 - this.defense(b)) * (box && this.worth(box) > RAID.worthFloor ? 1 : 0.3) * prot * taxed);
  }
  // One burglary. The burglar is a person record; each point of defense is time he spends at your boards, and past
  // RAID.giveUp he walks off with nothing. Otherwise he takes the best worth a kilo he can carry, no more.
  burgle(b, rng = Math.random) {
    const g = this.g, box = this.stashOf(b), def = this.defense(b);
    const burglar = { id: `burglar${++this.seq}`, name: RAID.names[Math.floor(rng() * RAID.names.length)], flag: T.flags[Math.floor(rng() * T.flags.length)], faction: RAID.factions[Math.floor(rng() * RAID.factions.length)], carried: [], from: b.id, day: this.day() };
    const log = { day: this.day(), bk: b.id, burglar: { id: burglar.id, name: burglar.name, flag: burglar.flag, faction: burglar.faction }, def: +def.toFixed(2), took: [], gaveUp: def >= RAID.giveUp };
    if (!log.gaveUp) {
      const order = box.slots.map((s, i) => ({ i, s, wpk: ((ITEMS[s.id]?.value ?? 1)) / Math.max(0.05, ITEMS[s.id]?.kg ?? 0.5) })).sort((a, c) => c.wpk - a.wpk);
      let kg = 0, L = 0;
      const plan = [];
      for (const o of order) {
        const it = ITEMS[o.s.id], k1 = Math.max(0.01, it?.kg ?? 0.5), l1 = it?.bulk ?? 1;
        const n = Math.min(o.s.n, Math.floor((RAID.carryKg - kg) / k1 + 1e-9), Math.floor((RAID.carryL - L) / Math.max(0.01, l1) + 1e-9));
        if (n <= 0) continue;
        plan.push({ i: o.i, n }); kg += n * k1; L += n * l1;
      }
      plan.sort((a, c) => c.i - a.i); // take from the back so the indices hold
      const inv = this.inv();
      for (const q of plan) { const t = inv.take(box, q.i, q.n); burglar.carried.push({ ...t }); log.took.push({ id: t.id, n: t.n }); }
      this.burglars.push(burglar);
      if (this.burglars.length > 24) this.burglars.shift();
    }
    this.raids.push(log); if (this.raids.length > 40) this.raids.shift();
    this.stats.raids++;
    g.emit('baseBurgled', { id: b.id, burglar: log.burglar, took: log.took, gaveUp: log.gaveUp, def: log.def });
    return log;
  }
  dayPass(day) {
    const P = this.g.player;
    this.dueDay(day);
    for (const b of [...this.bases.values()]) {
      if (b.state !== 'held' || Math.hypot(P.x - b.x, P.z - b.z) < RAID.away) continue; // watchers wait till you leave
      if (Math.random() < this.raidOdds(b)) this.burgle(b);
    }
  }

  baseView(b) {
    const box = this.inv().boxes.get(b.stash), G = this.gives(b), R = this.liveR(b.id), O = R ? this.openingsOf(b) : null;
    return { id: b.id, name: b.name, kind: b.kind, how: b.how, state: b.state, x: b.x, z: b.z, rect: b.rect, day: b.day, tenure: this.tenure.get(b.id) ?? null,
      defense: +this.defense(b).toFixed(2), fort: { windows: b.fort.windows, doors: b.fort.doors, parts: [...b.fort.parts] }, live: !!R, openings: O ? { windows: O.windows.length, boarded: O.windows.filter((W) => W.state === 'boarded').length, doors: O.doors.length, barred: O.doors.filter((d) => d.barricade).length } : null,
      pieces: b.pieces.map((fid) => ({ fid, kind: this.moved.get(fid)?.kind, room: this.moved.get(fid)?.room })), rooms: this.rooms(b), gives: G,
      stash: box ? { id: box.id, cap: box.cap, litres: +box.litres().toFixed(1), worth: this.worth(box), items: box.slots.map((s) => ({ id: s.id, n: s.n })) } : null, raidOdds: +this.raidOdds(b).toFixed(3) };
  }
  view() {
    return { camp: this.campView(), bases: [...this.bases.values()].map((b) => this.baseView(b)), hauling: this.hauling ? { fid: this.hauling, kind: this.moved.get(this.hauling)?.kind } : null, job: this.job ? { label: this.job.label, t: r1(this.job.t), need: this.job.need } : null,
      tenure: [...this.tenure].map(([id, t]) => ({ id, ...t })), raids: this.raids.slice(-8), stats: { ...this.stats } };
  }

  // ---- the loop ----
  update(dt) {
    const g = this.g;
    if (this.job) this.jobStep(dt);
    if ((this.slowT -= dt) <= 0) {
      this.slowT = 1;
      this.campPass();
      if (this.owners.size) this.ownersPass();
      if (this.bases.size) this.reapply();
      const day = this.day();
      if (this.lastDay === null) this.lastDay = day;
      else if (day !== this.lastDay) { for (let d = this.lastDay + 1; d <= day; d++) this.dayPass(d); this.lastDay = day; }
    }
    if ((this.drawT -= dt) <= 0) { this.drawT = 0.25; this.draw(); }
  }
  put(n, x, y, z, sx, sy, sz, face, col) {
    if (n >= MAX_INST) return n;
    _o.position.set(x, y, z); _o.rotation.set(0, face, 0); _o.scale.set(sx, sy, sz); _o.updateMatrix();
    this.mesh.setMatrixAt(n, _o.matrix); this.mesh.setColorAt(n, _c.set(col));
    return n + 1;
  }
  groundY(x, z) { return this.g.fx?.ground ? this.g.fx.ground(x, z) : 0; }
  draw() {
    const m = this.mesh; if (!m) return;
    const g = this.g, P = g.player;
    let n = 0;
    const o = this.camp;
    if (o) {
      const K = CAMP_KIT[o.kit], [sx, sy, sz] = K.size, y = this.groundY(o.x, o.z);
      n = this.put(n, o.x, y + sy / 2, o.z, sx, sy, sz, o.face, K.colour);
      if (o.kit === 'tent') n = this.put(n, o.x, y + sy + 0.04, o.z, 0.08, 0.08, sz + 0.2, o.face, '#6a5a3a'); // the ridge pole
      if (o.bells) for (let k = 0; k < CAMP_BELLS.posts; k++) { const a = (k / CAMP_BELLS.posts) * Math.PI * 2, x = o.x + Math.sin(a) * CAMP_BELLS.r, z = o.z + Math.cos(a) * CAMP_BELLS.r; n = this.put(n, x, this.groundY(x, z) + 0.35, z, 0.06, 0.7, 0.06, 0, CAMP_BELLS.colour); }
    }
    for (const b of this.bases.values()) {
      if (Math.abs(b.x - P.x) > 160 || Math.abs(b.z - P.z) > 160) continue;
      const R = b.rect, y = this.liveR(b.id) ? (g.citygen.live.get(b.town)?.built.y0 ?? 0) : this.groundY(b.x, b.z);
      if (b.fort.parts.includes('wall')) {
        const W = FORTIFY.wall.part, pad = 3, x0 = R.x0 - pad, x1 = R.x1 + pad, z0 = R.z0 - pad, z1 = R.z1 + pad, gate = b.fort.parts.includes('gate') ? FORTIFY.gate.part.w : 0;
        const fx = (x0 + x1) / 2, fz = b.front === 'N' ? z0 : z1;
        n = this.put(n, fx, y + W.h / 2, b.front === 'N' ? z1 : z0, x1 - x0, W.h, W.t, 0, W.colour);
        n = this.put(n, x0, y + W.h / 2, (z0 + z1) / 2, W.t, W.h, z1 - z0, 0, W.colour);
        n = this.put(n, x1, y + W.h / 2, (z0 + z1) / 2, W.t, W.h, z1 - z0, 0, W.colour);
        const half = (x1 - x0 - Math.max(gate, 3.5)) / 2;
        n = this.put(n, x0 + half / 2, y + W.h / 2, fz, half, W.h, W.t, 0, W.colour);
        n = this.put(n, x1 - half / 2, y + W.h / 2, fz, half, W.h, W.t, 0, W.colour);
        if (gate) n = this.put(n, fx, y + FORTIFY.gate.part.h / 2, fz, gate, FORTIFY.gate.part.h, W.t * 0.8, 0, FORTIFY.gate.part.colour);
      }
      if (b.fort.parts.includes('watchtower')) {
        const Tw = FORTIFY.watchtower.part, tx = R.x0 - 1.5, tz = R.z0 - 1.5;
        for (const [ox, oz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) n = this.put(n, tx + ox, y + Tw.h / 2, tz + oz, 0.18, Tw.h, 0.18, 0, Tw.colour);
        n = this.put(n, tx, y + Tw.h, tz, Tw.w, 0.18, Tw.w, 0, '#b08a5a');
        n = this.put(n, tx, y + Tw.h + 0.55, tz, Tw.w, 1.0, 0.08, 0, '#8a6a44');
      }
      if (b.fort.parts.includes('turret')) { const Tu = FORTIFY.turret.part, tx = R.x1 + 1.2, tz = R.z1 + 1.2; n = this.put(n, tx, y + Tu.h / 2, tz, Tu.w, Tu.h, Tu.w, 0, Tu.colour); n = this.put(n, tx, y + Tu.h + 0.1, tz + 0.5, 0.12, 0.12, 1.2, 0, '#1f1f1f'); }
    }
    // furniture: what lies in the buildings near you, in your bases, on the ground, and in your arms
    for (const t of g.citygen?.live?.values() ?? []) {
      if (Math.abs(t.rec.x - P.x) > t.rec.half + 60 || Math.abs(t.rec.z - P.z) > t.rec.half + 60) continue;
      const y0 = t.built.y0 ?? 0;
      for (const R of t.blds) {
        if (Math.abs((R.minX + R.maxX) / 2 - P.x) > 45 || Math.abs((R.minZ + R.maxZ) / 2 - P.z) > 45) continue;
        for (const p of this.piecesOf(R)) { if (this.moved.has(p.fid)) continue; const S = FURNITURE[p.kind].size; n = this.put(n, p.x, y0 + S[1] / 2, p.z, S[0], S[1], S[2], p.face, FURNITURE[p.kind].colour); }
      }
    }
    for (const [fid, q] of this.moved) {
      if (q.at === 'hands' && fid === this.hauling) { const S = FURNITURE[q.kind].size; n = this.put(n, P.x + Math.sin(P.face) * 0.7, (P.gy ?? 0) + 1.1, P.z + Math.cos(P.face) * 0.7, S[0] * 0.9, S[1] * 0.9, S[2] * 0.9, P.face + Math.PI / 2, FURNITURE[q.kind].colour); continue; }
      if (q.at !== 'base' && q.at !== 'ground') continue;
      if (Math.abs(q.x - P.x) > 80 || Math.abs(q.z - P.z) > 80) continue;
      const S = FURNITURE[q.kind].size, b = q.bk && this.bases.get(q.bk), y = b && this.liveR(b.id) ? (g.citygen.live.get(b.town)?.built.y0 ?? 0) : this.groundY(q.x, q.z);
      n = this.put(n, q.x, y + S[1] / 2, q.z, S[0], S[1], S[2], 0, FURNITURE[q.kind].colour);
    }
    m.count = n; m.visible = n > 0;
    if (n) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  // ---- save / load: the shard's truth about camps, bases, pieces, owners and tenure ----
  save() {
    const box = (b) => this.inv().boxes.get(b.stash);
    return {
      seq: this.seq, camp: this.camp ? { ...this.camp, watch: { ...this.camp.watch } } : null, hauling: this.hauling, lastDay: this.lastDay,
      bases: [...this.bases.values()].map((b) => ({ ...b, rect: { ...b.rect }, fort: { windows: b.fort.windows, doors: b.fort.doors, parts: [...b.fort.parts] }, pieces: [...b.pieces], stashSlots: (box(b)?.slots ?? []).map((s) => ({ ...s })) })),
      moved: [...this.moved].map(([fid, m]) => [fid, { ...m }]),
      owners: [...this.owners.values()].filter((O) => O.purse || O.dead || O.moved).map((O) => ({ id: O.id, purse: O.purse, dead: O.dead, moved: !!O.moved })),
      tenure: [...this.tenure].map(([id, t]) => [id, { ...t, paidTo: Number.isFinite(t.paidTo) ? t.paidTo : null, taxTo: Number.isFinite(t.taxTo) ? t.taxTo : null }]),
      raids: this.raids.map((r) => ({ ...r, took: r.took.map((x) => ({ ...x })) })), burglars: this.burglars.map((b) => ({ ...b, carried: b.carried.map((x) => ({ ...x })) })),
    };
  }
  load(s) {
    const g = this.g;
    for (const O of this.owners.values()) if (O.c && g.chars.includes(O.c)) g.removeChar(O.c);
    this.camp = null; this.bases.clear(); this.moved.clear(); this.tenure.clear(); this.owners.clear(); this.ownerOfBk.clear(); this.raids = []; this.burglars = []; this.job = null; this.hauling = null; this.lastDay = null; this.applied.clear();
    if (g.player) g.player.haulSlow = 1;
    if (!s) return;
    this.seq = s.seq ?? 0; this.camp = s.camp ?? null; this.lastDay = s.lastDay ?? null;
    for (const [fid, m] of s.moved ?? []) this.moved.set(fid, { ...m });
    for (const [id, t] of s.tenure ?? []) this.tenure.set(id, { ...t, paidTo: t.paidTo ?? Infinity, taxTo: t.taxTo ?? Infinity });
    this.pendingOwners = s.owners ?? [];
    for (const o of s.bases ?? []) { const b = { ...o }; delete b.stashSlots; delete b.appliedTo; this.bases.set(b.id, b); const box = this.stashOf(b); box.slots = (o.stashSlots ?? []).filter((x) => ITEMS[x.id]).map((x) => ({ ...x })); }
    this.raids = s.raids ?? []; this.burglars = s.burglars ?? [];
    this.hauling = s.hauling ?? null;
    if (this.hauling && g.player) g.player.haulSlow = FURNITURE[this.moved.get(this.hauling)?.kind]?.slow ?? 1;
    // The owners re-derive from the ids; what happened to them since (a purse, a death, a move) lands as they come back.
    for (const o of this.pendingOwners) { const [kind] = o.id.split(':'); this.owners.set(o.id, { id: o.id, kind: kind === 'fac' ? 'faction' : kind === 'land' ? 'landlord' : 'family', name: o.id, flag: 'US', faction: 'drifter', town: null, purse: o.purse, dead: o.dead, moved: o.moved, c: null, door: null, restored: true }); }
  }
}
