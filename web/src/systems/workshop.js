import * as THREE from 'three';
import { RAY_BULLET, rayCircle } from '../engine/collision.js';
import { ITEMS } from '../data/items.js';
import { FACES6, FACE_BEARING, ARMOR, CHASSIS, MOUNT_WEAPONS, UTILITY, AMMO_ITEMS, PAINTS, REPAIR, WORKSHOPS, ARENAS, LOANER, validateWorkshop } from '../data/workshop.js';
import { groupOf } from './garage.js';

// THE WORKSHOP (docs/design/WEB_WORKSHOP.md): the counter and the guns.
//   The counter: install / remove / repair / reload / paint at a shop (data/workshop.js WORKSHOPS: Kenji's, a town
//   garage the cities lane stamps, your own bench), each with a price (the keeper's prices for you) and labour hours
//   that pass on the clock. systems/garage.js holds what the car wears; ui/workshop.js is the screen.
//   The guns: fireMount(vehicle, group, angle, shooter) fires every mount of a trigger group whose ARC holds the aim
//   (1 aimed: hood + pods, 2 the tail, 3 the turret). Hitscan guns ride combat.hitscan (the bullet path, plate first);
//   rockets fly (one InstancedMesh, pooled), beams and rail slugs are this file's own rays (fire and pierce types), the
//   flamer is a cone, droppers lay hazards (garage.hazard), the EMP stalls engines. AI drivers use the same verb
//   (aiFire, and the tactics lane can call fireMount directly).
const MAX_ROCKETS = 48, MAX_DECOYS = 8, MAX_HITS = 8;
const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _o = new THREE.Object3D(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const EMPTY = Object.freeze({});
const _hits = Array.from({ length: MAX_HITS * 3 }, () => ({ t: 0, kind: '', o: null }));

// Register the car's rounds as things you carry (data/items.js ITEMS), once, without touching that file.
for (const [id, row] of Object.entries(AMMO_ITEMS)) if (!ITEMS[id]) ITEMS[id] = row;

export class Workshop {
  constructor(game) {
    this.g = game;
    const geo = new THREE.CylinderGeometry(0.09, 0.11, 0.75, 6).rotateX(Math.PI / 2);
    this.rocketMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#6f6a60', roughness: 0.5, metalness: 0.5, emissive: '#3a1a08' }), MAX_ROCKETS);
    this.rocketMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rocketMesh.frustumCulled = false; this.rocketMesh.count = 0; this.rocketMesh.visible = false;
    game.scene.add(this.rocketMesh);
    this.rockets = Array.from({ length: MAX_ROCKETS }, () => ({ on: false, x: 0, z: 0, y: 1.1, dx: 0, dz: 1, speed: 0, life: 0, dmg: 0, r: 0, by: null, owner: null, target: null, turn: 0, ox: 0, oz: 0, t: 0, trail: 0 }));
    this.decoys = Array.from({ length: MAX_DECOYS }, () => ({ x: 0, z: 0, until: -1, by: null }));
    this.site = null;          // the shop the screen is open at (open())
    this.hoursWorked = 0;      // labour hours the clock has run on the counter (stats)
    this.stats = { installs: 0, removes: 0, repairs: 0, reloads: 0, paid: 0, shots: 0, rockets: 0, breaches: 0 };
    this.radarSeen = new Set(); this.radarT = 0;
    this.locks = new WeakMap(); // a seeker mount's lock { on: vehicle, t, said }: kept off the mount row so the row stays plain JSON (saves, the shard)
  }

  // ---- where it opens ----------------------------------------------------------------------------------------------
  // The shop you are at: a keeper there and awake, or a fixed site in reach, or your own garage.
  siteAt(x, z) {
    const g = this.g;
    for (const [id, S] of Object.entries(WORKSHOPS)) {
      if (S.keeper) {
        const c = g.chars.find((k) => k.npc?.id === S.keeper);
        if (c && c.alive && !c.asleep && Math.hypot(c.x - x, c.z - z) < S.r) return { id, ...S, keeperChar: c };
      } else if (S.kind === 'base') {
        const h = g.baseGarage?.(); // the home base's garage (whichever system owns your base hands this over)
        if (h && Math.hypot(h.x - x, h.z - z) < S.r) return { id, ...S };
      } else if (S.x !== undefined && Math.hypot(S.x - x, S.z - z) < S.r) {
        const F = g.society?.factions, fi = F?.index?.remnant; // standing is a Float32Array; reading(i) is what a faction acts on
        if (S.needStanding && (fi === undefined ? 0 : F.reading(fi)) < S.needStanding) continue;
        return { id, ...S };
      }
    }
    for (const S of this.extraSites ?? []) if (Math.hypot(S.x - x, S.z - z) < S.r) return S; // town garages stamped at run time (addSite)
    return null;
  }
  // A town's garage as a row (the cities lane stamps these where it builds a mechanic's shop).
  addSite(row) { (this.extraSites ??= []).push({ r: 14, rate: 20, rare: [], ...row }); return this.extraSites.length; }

  // The car you would work on: the one you are in, else the last you drove if it is parked close.
  carFor() {
    const g = this.g, p = g.player, v = p.inVehicle ?? g.lastVehicle;
    return v && !v.dead && Math.hypot(v.x - p.x, v.z - p.z) < 40 ? v : null;
  }
  open(force = false) {
    const g = this.g, p = g.player, site = this.siteAt(p.x, p.z) ?? (force ? { id: 'field', name: 'FIELD BENCH', where: 'here', r: 0, rate: 20, rare: ['uncommon', 'prewar'] } : null);
    if (!site) return { ok: false, why: 'no garage here: Kenji in Rust Haven, a town garage, or your own' };
    const v = this.carFor();
    if (!v) return { ok: false, why: 'bring your car round: park it within 40 m' };
    if (!g.garage.chassis(v)) return { ok: false, why: `a ${v.name} can't be worked on here` };
    this.site = site; this.car = v;
    return { ok: true, site, vehicle: v };
  }

  // Prices for you at this counter (the keeper's standing with you, a role, the creator's tongue), and labour.
  mul(site = this.site) {
    const g = this.g, c = site?.keeperChar;
    return (c ? g.roles?.priceMul?.(c.fid, c) ?? 1 : 1) * (g.sheet?.fx?.priceMul ?? 1);
  }
  labour(hours, site = this.site) { return Math.round(hours * (site?.rate ?? 20) * this.mul(site)); }
  passHours(h, site = this.site) {
    const g = this.g, hh = h * (site?.selfWork ?? 1);
    g.sky.time = (g.sky.time + hh) % 24;
    this.hoursWorked += hh;
    return hh;
  }
  sells(part, site = this.site) {
    const row = ARMOR[part] ?? MOUNT_WEAPONS[part] ?? UTILITY[part];
    return !!row && (!row.rare || (site?.rare ?? []).includes(row.rare));
  }
  pay(cost, pay) { if (!pay || cost <= 0) return true; if (!this.g.spend(cost)) return false; this.stats.paid += cost; return true; }

  // What an operation would cost, without doing it. op: install | remove | repair | reload | paint.
  quote(v, op, a = {}) {
    const G = this.g.garage, m = this.mul();
    if (op === 'install') {
      if (ARMOR[a.part]) {
        const A = ARMOR[a.part], faces = a.face === 'sides' ? 2 : a.face === 'all' ? 4 : 1, n = Math.max(0, a.n ?? 4), h = n * faces * A.labour;
        return { part: a.part, price: Math.round(n * faces * A.price * m), hours: +h.toFixed(2), labour: this.labour(h), kg: n * faces * A.kg };
      }
      const R = MOUNT_WEAPONS[a.part] ?? UTILITY[a.part];
      if (!R) return null;
      return { part: a.part, price: Math.round(R.price * m), hours: R.labour, labour: this.labour(R.labour), kg: R.kg, stocked: this.sells(a.part) };
    }
    if (op === 'repair') {
      if (a.face) {
        const full = v.platesFull?.[a.face] ?? 0, miss = Math.max(0, full - (v.plates?.[a.face] ?? 0)), A = ARMOR[G.kindOf(v, a.face)] ?? ARMOR.plate, h = miss * REPAIR.plateLabour;
        return { face: a.face, points: +miss.toFixed(1), price: Math.round(miss * A.price * REPAIR.platePt * m), hours: +h.toFixed(2), labour: this.labour(h) };
      }
      const d = v.dmg, P = REPAIR.part;
      if (!d) return null;
      const lost = a.part === 'tyres' ? Object.values(d.tyres).reduce((s, t) => s + (1 - t), 0) : a.part === 'body' ? Object.values(d.zones).reduce((s, z) => s + z, 0) / 4 + (1 - v.hp / v.maxHp) : 1 - (d[a.part] ?? 1);
      const base = a.part === 'tyres' ? P.tyre : P[a.part] ?? 0, h = lost > 0.01 ? REPAIR.partLabour * Math.min(1.5, lost + 0.25) : 0;
      return { part: a.part, worn: +lost.toFixed(2), price: Math.round(base * lost * m), hours: +h.toFixed(2), labour: this.labour(h) };
    }
    return null;
  }

  // ---- the counter -------------------------------------------------------------------------------------------------
  // Fit a part. Armour: part=<ARMOR id> face=<face|sides|all> n=<points>. A gun or dropper: part=<MOUNT_WEAPONS id>
  // face=<mount point> (default: the first free one it fits). Utility: part=<UTILITY id>. pay=false skips the till
  // (tests, the loaner night); time=false skips the clock.
  install(v, { part, face, n = 4, pay = true, time = true } = {}) {
    const g = this.g, G = g.garage;
    if (!v || v.dead) return { ok: false, why: 'no car' };
    if (ARMOR[part]) {
      if (!face) return { ok: false, why: `which face? one of ${FACES6.join(', ')} (or sides, all)` };
      const q = this.quote(v, 'install', { part, face, n }), cost = q.price + q.labour;
      if (pay && g.cash < cost) return { ok: false, why: `not enough scrip: ${cost} for ${n} of ${ARMOR[part].name}` };
      const r = G.plate(v, face, n, part);
      if (!r.ok) return { ok: false, why: r.why };
      const share = r.added / Math.max(1, n * (face === 'sides' ? 2 : face === 'all' ? 4 : 1)), paid = Math.round(cost * share);
      this.pay(paid, pay);
      v.platesFull ??= {};
      for (const f of face === 'sides' ? ['left', 'right'] : face === 'all' ? ['front', 'rear', 'left', 'right'] : [face]) v.platesFull[f] = v.plates[f];
      const hours = time ? this.passHours(q.hours * share) : 0;
      this.stats.installs++;
      g.emit('workshop', { op: 'install', part, face, added: r.added, cost: paid, hours: +hours.toFixed(2), vehicle: v.id });
      return { ok: true, part, face, added: r.added, cost: paid, hours: +hours.toFixed(2) };
    }
    const W = MOUNT_WEAPONS[part];
    if (W) {
      const C = G.chassis(v);
      if (!C) return { ok: false, why: `a ${v.name} can't be worked on` };
      face ??= W.faces.find((f) => C.mounts[f] && !v.mounts?.[f] && !G.canMount(v, f, part)) ?? W.faces.find((f) => C.mounts[f] && !G.canMount(v, f, part));
      if (!face) return { ok: false, why: `nowhere on a ${v.name} takes a ${W.name}` };
      const why = G.canMount(v, face, part);
      if (why) return { ok: false, why };
      if (pay && !this.sells(part)) return { ok: false, why: `${this.site?.name ?? 'this shop'} does not deal in ${W.name} (${W.rare}): find one` };
      const q = this.quote(v, 'install', { part }), cost = q.price + q.labour;
      if (pay && g.cash < cost) return { ok: false, why: `not enough scrip: ${cost} for a ${W.name}` };
      const old = v.mounts?.[face]?.kind ?? null;
      this.pay(cost, pay);
      G.setMount(v, face, part);
      const hours = time ? this.passHours(q.hours) : 0;
      this.stats.installs++;
      g.emit('workshop', { op: 'install', part, face, replaced: old, cost: pay ? cost : 0, hours: +hours.toFixed(2), vehicle: v.id });
      return { ok: true, part, face, replaced: old, group: groupOf(face, W), cost: pay ? cost : 0, hours: +hours.toFixed(2) };
    }
    const U = UTILITY[part];
    if (U) {
      if (pay && !this.sells(part)) return { ok: false, why: `${this.site?.name ?? 'this shop'} does not deal in ${U.name}: find one` };
      const q = this.quote(v, 'install', { part }), cost = q.price + q.labour;
      if (pay && g.cash < cost) return { ok: false, why: `not enough scrip: ${cost} for ${U.name}` };
      const r = G.addUtility(v, part);
      if (!r.ok) return r;
      this.pay(cost, pay);
      const hours = time ? this.passHours(q.hours) : 0;
      this.stats.installs++;
      g.emit('workshop', { op: 'install', part, cost: pay ? cost : 0, hours: +hours.toFixed(2), vehicle: v.id });
      return { ok: true, part, cost: pay ? cost : 0, hours: +hours.toFixed(2) };
    }
    return { ok: false, why: `unknown part ${part}; see workshop stats for the rows` };
  }

  // Take something off: a face's plate (scrap, no refund), a mount or a gadget (the shop buys it back at 40%).
  remove(v, { part, face, pay = true, time = true } = {}) {
    const g = this.g, G = g.garage;
    if (!v) return { ok: false, why: 'no car' };
    let back = 0, what = null, h = 0;
    const plateOff = face && (part === 'plate' || ARMOR[part] || (!part && !v.mounts?.[face] && v.plates?.[face] > 0));
    if (part && UTILITY[part]) {
      if (!G.removeUtility(v, part)) return { ok: false, why: `no ${UTILITY[part].name} fitted` };
      back = Math.round(UTILITY[part].price * 0.4); h = UTILITY[part].labour * 0.5; what = part;
    } else if (plateOff) {
      const pts = v.plates?.[face] ?? 0;
      if (!(pts > 0)) return { ok: false, why: `no plate on the ${face}` };
      h = pts * (ARMOR[G.kindOf(v, face)]?.labour ?? 0.05) * 0.5;
      v.plates[face] = 0; if (v.plateKind) delete v.plateKind[face]; if (v.platesFull) delete v.platesFull[face];
      G.retune(v); what = `plate:${face}`;
    } else if (face && v.mounts?.[face]) {
      const k = G.unmount(v, face), W = MOUNT_WEAPONS[k];
      back = Math.round((W?.price ?? 0) * 0.4); h = (W?.labour ?? 0.5) * 0.5; what = k;
    } else return { ok: false, why: 'remove what? face=<face> (the gun on it, else its plate; part=plate for the plate) or part=<utility id>' };
    const lab = this.labour(h), net = back - lab;
    if (pay) { if (net >= 0) g.cash += net; else if (!this.pay(-net, true)) return { ok: false, why: 'not enough scrip for the labour' }; }
    const hours = time ? this.passHours(h) : 0;
    this.stats.removes++;
    g.emit('workshop', { op: 'remove', part: what, face, refund: pay ? net : 0, hours: +hours.toFixed(2), vehicle: v.id });
    return { ok: true, removed: what, refund: pay ? net : 0, hours: +hours.toFixed(2) };
  }

  repair(v, { face, part, pay = true, time = true } = {}) {
    const g = this.g;
    if (!v) return { ok: false, why: 'no car' };
    const q = this.quote(v, 'repair', { face, part });
    if (!q) return { ok: false, why: 'repair what? face=<face> or part=engine|radiator|tank|lights|tyres|body' };
    if ((q.points ?? q.worn ?? 0) <= 0.01) return { ok: false, why: 'nothing to fix there' };
    const cost = q.price + q.labour;
    if (!this.pay(cost, pay)) return { ok: false, why: `not enough scrip: ${cost}` };
    if (face) { v.plates[face] = v.platesFull[face]; g.garage.retune(v); }
    else if (part === 'tyres') { for (const t of Object.keys(v.dmg.tyres)) v.dmg.tyres[t] = 1; v.dmg.dirty = true; }
    else if (part === 'body') { for (const z of Object.keys(v.dmg.zones)) v.dmg.zones[z] = 0; v.dmg.off = {}; v.hp = v.maxHp; v.dmg.dirty = true; v.dmg.deformT = 0; if (v.baseCol) v.mesh.geometry.attributes.color.array.set(v.baseCol); }
    else { v.dmg[part] = 1; if (part === 'radiator') v.dmg.temp = 0; }
    const hours = time ? this.passHours(q.hours) : 0;
    this.stats.repairs++;
    g.emit('workshop', { op: 'repair', face, part, cost: pay ? cost : 0, hours: +hours.toFixed(2), vehicle: v.id });
    return { ok: true, face, part, cost: pay ? cost : 0, hours: +hours.toFixed(2) };
  }

  // Load a mount (or a gadget with charges) from its ammo item: out of your pack first, then the trunk, then bought here.
  reload(v, { face, part, pay = true } = {}) {
    const g = this.g, inv = g.inventory, m = face ? v.mounts?.[face] : null, u = part ? v.utility?.[part] : null;
    const R = m ? MOUNT_WEAPONS[m.kind] : u ? UTILITY[part] : null;
    if (!R || !R.ammo) return { ok: false, why: m || u ? `${R?.name ?? 'that'} takes no rounds (it runs on power)` : 'reload what? face=<mount point> or part=<utility id>' };
    const key = m ? ('charges' in m ? 'charges' : 'ammo') : 'charges', obj = m ?? u, cap = m ? R.mag : R.charges;
    const want = cap - obj[key];
    if (want <= 0) return { ok: false, why: 'already full' };
    const items = Math.ceil(want / R.perItem);
    let got = 0, bought = 0;
    const takeFrom = (box) => { if (!box) return; for (let i = box.slots.length - 1; i >= 0 && got < items; i--) { const s = box.slots[i]; if (s.id !== R.ammo) continue; const k = Math.min(s.n, items - got); s.n -= k; got += k; if (s.n <= 0) box.slots.splice(i, 1); } };
    takeFrom(inv?.carried); takeFrom(inv?.trunk(v));
    if (got < items && pay && this.site) {
      const each = Math.round((ITEMS[R.ammo]?.value ?? 20) * this.mul()), can = Math.min(items - got, Math.floor(g.cash / Math.max(1, each)));
      if (can > 0 && this.pay(can * each, true)) { got += can; bought = can; }
    } else if (!pay) got = items;
    if (got <= 0) return { ok: false, why: `no ${ITEMS[R.ammo]?.name ?? R.ammo} to load` };
    obj[key] = Math.min(cap, obj[key] + got * R.perItem);
    inv?.changed?.();
    this.stats.reloads++;
    g.emit('workshop', { op: 'reload', face, part, items: got, bought, vehicle: v.id });
    return { ok: true, loaded: obj[key], of: cap, items: got, bought };
  }

  // The spray booth: recolour the body's paint (the vertex colours that were the old paint).
  paint(v, key, free = false) {
    const P = PAINTS[key];
    if (!P) return { ok: false, why: `unknown paint; known: ${Object.keys(PAINTS).join(', ')}` };
    if (!free && !this.pay(Math.round(P.price * this.mul()), true)) return { ok: false, why: 'not enough scrip' };
    const geo = v.mesh?.geometry, col = geo?.attributes.color, base = v.baseCol;
    if (col && base) {
      const from = new THREE.Color(v.paint), to = new THREE.Color(P.color);
      from.convertSRGBToLinear?.(); to.convertSRGBToLinear?.();
      const near = (i, c) => Math.abs(base[i] - c.r) < 0.02 && Math.abs(base[i + 1] - c.g) < 0.02 && Math.abs(base[i + 2] - c.b) < 0.02;
      const f0 = new THREE.Color(v.paint), t0 = new THREE.Color(P.color);
      for (let i = 0; i < base.length; i += 3) {
        const hit = near(i, from) ? to : near(i, f0) ? t0 : null;
        if (!hit) continue;
        base[i] = hit.r; base[i + 1] = hit.g; base[i + 2] = hit.b;
      }
      col.array.set(base); col.needsUpdate = true;
      if (v.dmg) { v.dmg.dirty = true; v.dmg.deformT = 0; }
    }
    v.paint = P.color; v.paintKey = key;
    if (!free) this.g.emit('workshop', { op: 'paint', paint: key, vehicle: v.id });
    return { ok: true, paint: key, color: P.color };
  }

  // ---- firing ------------------------------------------------------------------------------------------------------
  // Fire every mount in trigger group `group` whose arc holds `ang` (world heading). Returns { inArc, fired, dropped }.
  // A held trigger is called every frame: the rail gun and the EMP charge while it is held.
  fireMount(v, group, ang, shooter) {
    const g = this.g, out = this._out ??= { inArc: 0, fired: 0, dropped: null, charging: false };
    out.inArc = 0; out.fired = 0; out.dropped = null; out.charging = false;
    if (!v?.mounts || v.dead) return out;
    shooter ??= v.driver ?? null;
    const C = g.garage.chassis(v);
    for (const face in v.mounts) {
      const m = v.mounts[face], W = MOUNT_WEAPONS[m.kind];
      if (!W || groupOf(face, W) !== group) continue;
      if (W.kind === 'drop') { out.inArc++; const k = this.dropFrom(v, face, m, W); if (k) out.dropped = k; continue; }
      const bearing = v.h + FACE_BEARING[face], arc = Math.min(W.arc ?? Infinity, C?.mounts[face]?.arc ?? 0.45);
      let off = wrap(ang - bearing);
      if (face !== 'top' && Math.abs(off) > arc) { if (group !== 2) continue; off = 0; } // a tail gun on B fires straight back
      out.inArc++;
      // Bolted to the frame: a few degrees of give toward the aim (the old hood gun's 0.07), the turret slews to it.
      const aim = face === 'top' ? ang : bearing + Math.max(-0.07, Math.min(0.07, off));
      if (face === 'top') m.yaw = ang;
      m.aimAng = ang;
      const r = this.shoot(v, face, m, W, aim, shooter);
      if (r === 'charging') out.charging = true; else if (r) out.fired++;
    }
    return out;
  }

  // Where a mount's muzzle is, in the world.
  muzzle(v, face, m, ang) {
    const L = v.len, W = v.wid, c = Math.cos(v.h), s = Math.sin(v.h);
    const [lx, lz] = face === 'front' ? [(m.alt = !m.alt) ? 0.32 : -0.32, L / 2 + 0.55] : face === 'rear' ? [0, -L / 2 - 0.6] : face === 'left' ? [W / 2 + 0.5, 0.2] : face === 'right' ? [-W / 2 - 0.5, 0.2] : [0, 0];
    let x = v.x + lx * c + lz * s, z = v.z - lx * s + lz * c;
    if (face === 'top') { x += Math.sin(ang) * (v.wid * 0.5 + 0.9); z += Math.cos(ang) * (v.wid * 0.5 + 0.9); }
    const y = face === 'top' ? (v.tall ?? 1.8) + 0.2 : 1.15;
    const o = (this._mz ??= { x: 0, z: 0, y: 0 });
    o.x = x; o.z = z; o.y = y;
    return o;
  }

  shoot(v, face, m, W, ang, shooter) {
    const g = this.g, t = g.time, mine = shooter === g.player;
    if (W.charge) { // held: charge first (the rail gun sings, the EMP coil whines)
      if (t - (m.lastPull ?? -9) > 0.2) { m.chargeStart = t; if (mine) g.audio.hiss?.(g.pan(v.x)); g.emit('mountCharge', { vehicle: v.id, face, kind: m.kind }); }
      m.lastPull = t;
    }
    if (t < (m.cool ?? 0)) { m.chargeStart = t; return false; } // a charge starts over once it can fire again
    if (W.mag > 0 && !('charges' in m) && m.ammo <= 0) {
      if (t > (m.dry ?? 0)) { g.audio.empty?.(); m.dry = t + 0.5; if (mine) g.hud?.toast?.(`${W.name} DRY — RELOAD AT A GARAGE`, 'warn'); }
      m.chargeStart = t; return false;
    }
    if (W.power && (v.power?.e ?? 0) < W.power) {
      if (t > (m.dry ?? 0)) { m.dry = t + 0.8; if (mine) g.hud?.toast?.(`${W.name}: NOT ENOUGH POWER`, 'warn'); g.emit('mountNoPower', { vehicle: v.id, kind: m.kind }); }
      m.chargeStart = t; return false; // no power, no charge: the coil starts over when the battery can feed it
    }
    if (W.charge && t - m.chargeStart < W.charge) return 'charging';
    m.cool = t + W.rate; m.chargeStart = t + 99;
    if (W.mag > 0) m.ammo--;
    if (W.power) v.power.e -= W.power;
    this.stats.shots++;
    const mz = this.muzzle(v, face, m, ang), spreadMul = v.utility?.targeting ? UTILITY.targeting.spread : 1;
    const a = ang + (Math.random() - 0.5) * 2 * (W.spread ?? 0) * spreadMul, dx = Math.sin(a), dz = Math.cos(a);
    const near = Math.hypot(mz.x - g.player.x, mz.z - g.player.z);
    g.noise(mz.x, mz.z, W.kind === 'beam' ? 25 : 60, shooter);
    if (W.kind === 'hitscan') {
      if (!shooter) return false;
      g.fx.flash(mz.x, mz.y, mz.z, W.size > 1 ? 1.8 : 1.1, 0.04);
      g.audio.gun(W.sound ?? 'smg', near, g.pan(mz.x));
      g.combat.hitscan(shooter, mz.x, mz.z, dx, dz, W.range, W.dmg);
      if (W.size > 1) { v.vx -= dx * 0.6 / v.mass; v.vz -= dz * 0.6 / v.mass; } // the autocannon rocks the car
    } else if (W.kind === 'rocket') this.launch(v, mz, dx, dz, W, shooter, m);
    else if (W.kind === 'flame') this.flame(v, mz, a, W, shooter);
    else if (W.kind === 'beam') this.beam(v, mz, dx, dz, W, shooter, 1);
    else if (W.kind === 'rail') this.beam(v, mz, dx, dz, W, shooter, W.pierce);
    else if (W.kind === 'harpoon') { if (v.driver === g.player) g.vehiclesSys.fireHarpoon(v, a); else return false; }
    else if (W.kind === 'emp') this.emp(v, mz, a, W, shooter);
    g.emit('mountFire', { vehicle: v.id, face, kind: m.kind, by: shooter?.id ?? null });
    return true;
  }

  // ---- what each kind does ----------------------------------------------------------------------------------------------
  launch(v, mz, dx, dz, W, by, m) {
    const g = this.g, R = this.rockets.find((r) => !r.on);
    if (!R) return;
    const lockT = W.lock ? W.lock.time * (v.utility?.targeting ? UTILITY.targeting.lock : 1) : 0;
    Object.assign(R, { on: true, x: mz.x, z: mz.z, ox: mz.x, oz: mz.z, y: mz.y, dx, dz, speed: W.speed, life: W.range / W.speed, dmg: W.dmg, r: W.blast, by, owner: v, t: 0, trail: 0,
      target: W.lock && this.locks.get(m)?.on && this.locks.get(m).t >= lockT && !this.locks.get(m).on.dead ? this.locks.get(m).on : null, turn: W.lock?.turn ?? 0 });
    this.stats.rockets++;
    g.fx.flash(mz.x, mz.y, mz.z, 1.6, 0.06);
    g.audio.gun?.('shotgun', Math.hypot(mz.x - g.player.x, mz.z - g.player.z), g.pan(mz.x));
    g.emit('rocket', { vehicle: v.id, homing: !!R.target, target: R.target?.id ?? null });
  }

  flame(v, mz, ang, W, by) {
    const g = this.g, R = W.range;
    for (let i = 0; i < 4; i++) {
      const a = ang + (Math.random() - 0.5) * W.cone * 1.6, s = 10 + Math.random() * 6;
      g.fx.spawn(2, mz.x, 1.0, mz.z, Math.sin(a) * s + v.vx, 0.6 + Math.random(), Math.cos(a) * s + v.vz, 0.75, 0.7, Math.random() < 0.5 ? '#ff8a2a' : '#ffc04a', -1.5);
    }
    for (const c of g.chars) {
      if (!c.alive || c.inVehicle || c === by) continue;
      const dx = c.x - mz.x, dz = c.z - mz.z, d = Math.hypot(dx, dz);
      if (d > R || Math.abs(wrap(Math.atan2(dx, dz) - ang)) > W.cone || !g.statics.lineOfSight(mz.x, mz.z, c.x, c.z)) continue;
      g.combat.damage(c, W.dmg * (1 - d / R * 0.5), by, dx / (d || 1), dz / (d || 1));
      c.burning = Math.max(c.burning ?? 0, 2);
    }
    for (const o of g.vehicles) {
      if (o === v || o.dead) continue;
      const dx = o.x - mz.x, dz = o.z - mz.z, d = Math.hypot(dx, dz) - o.len * 0.4;
      if (d > R || Math.abs(wrap(Math.atan2(dx, dz) - ang)) > W.cone + 0.2) continue;
      this.hitVehicle(o, mz.x, mz.z, W.dmg * 1.5, 'fire', by);
    }
    if (Math.random() < 0.08) g.throwables?.startFire?.(mz.x + Math.sin(ang) * R * 0.7, mz.z + Math.cos(ang) * R * 0.7, 1.4, 6, by);
  }

  // A beam (laser: one target) or a rail slug (pierce: on through up to N targets, `carry` of the damage each time).
  beam(v, mz, dx, dz, W, by, pierce) {
    const g = this.g, wall = g.statics.raycast(mz.x, mz.z, dx, dz, W.range, RAY_BULLET);
    let n = 0;
    for (const c of g.chars) {
      if (n >= MAX_HITS || !c.alive || c.inVehicle || c === by) continue;
      const t = rayCircle(mz.x, mz.z, dx, dz, c.x, c.z, (c.radius ?? 0.4) + 0.1, wall);
      if (t >= 0 && t < wall) { const h = _hits[n++]; h.t = t; h.kind = 'char'; h.o = c; }
    }
    for (const o of g.vehicles) {
      if (n >= MAX_HITS * 2 || o === v || o.dead) continue;
      let best = -1;
      for (const s of [-1, 1]) { const t = rayCircle(mz.x, mz.z, dx, dz, o.x + Math.sin(o.h) * o.len * 0.25 * s, o.z + Math.cos(o.h) * o.len * 0.25 * s, o.wid * 0.62, wall); if (t >= 0 && (best < 0 || t < best)) best = t; }
      if (best >= 0) { const h = _hits[n++]; h.t = best; h.kind = 'veh'; h.o = o; }
    }
    // Nearest first (insertion sort over the few hits: no allocation).
    for (let i = 1; i < n; i++) { const h = _hits[i]; let j = i - 1; while (j >= 0 && _hits[j].t > h.t) { _hits[j + 1] = _hits[j]; j--; } _hits[j + 1] = h; }
    let dmg = W.dmg, end = wall, hitN = 0;
    for (let i = 0; i < n && hitN < pierce; i++) {
      const h = _hits[i], hx = mz.x + dx * h.t, hz = mz.z + dz * h.t;
      if (h.kind === 'char') g.combat.damage(h.o, dmg, by, dx, dz, pierce > 1 ? 'explosion' : 'bullet');
      else this.hitVehicle(h.o, hx, hz, dmg, W.type, by, null, mz.x, mz.z);
      g.emit('railHit', { kind: h.kind, id: h.o.id, dmg: Math.round(dmg), n: hitN + 1, beam: pierce === 1 });
      hitN++; end = h.t;
      dmg *= W.carry ?? 0;
      if (dmg < 1) break;
    }
    if (hitN < pierce || n === 0) end = wall;
    const bx = mz.x + dx * end, bz = mz.z + dz * end;
    g.fx.tracer(mz.x, mz.z, bx, bz, mz.y, pierce > 1 ? 0.16 : 0.08);
    g.fx.flash(mz.x, mz.y, mz.z, pierce > 1 ? 2.6 : 1.2, pierce > 1 ? 0.12 : 0.05);
    if (pierce > 1) { g.hud?.shake?.(0.35); g.fx.sparks(bx, 1, bz, -dx, -dz, 12); g.audio.gun?.('rifle', Math.hypot(mz.x - g.player.x, mz.z - g.player.z), g.pan(mz.x)); }
    this.lastBeam = { hits: hitN, end: +end.toFixed(1) };
  }

  emp(v, mz, ang, W, by) {
    const g = this.g;
    let n = 0;
    for (const o of g.vehicles) {
      if (o === v || o.dead) continue;
      const dx = o.x - mz.x, dz = o.z - mz.z, d = Math.hypot(dx, dz);
      if (d > W.range || Math.abs(wrap(Math.atan2(dx, dz) - ang)) > W.cone) continue;
      o.empUntil = g.time + W.stall; if (o.power) o.power.e = 0; n++;
      g.fx.sparks(o.x, 1.2, o.z, 0, 0, 10);
      if (o.driver === g.player) g.hud?.toast?.('ENGINE DEAD — EMP', 'hot');
    }
    for (let i = 0; i < 10; i++) { const a = ang + (Math.random() - 0.5) * W.cone * 2, s = 18 + Math.random() * 10; g.fx.spawn(1, mz.x, 1.2, mz.z, Math.sin(a) * s, 0.5, Math.cos(a) * s, 0.5, 0.12, '#cfefff', 0); }
    g.emit('emp', { vehicle: v.id, stalled: n });
  }

  dropFrom(v, face, m, W) {
    const g = this.g;
    if (m.charges <= 0) { if (v.driver === g.player && g.time > (m.dry ?? 0)) { m.dry = g.time + 0.5; g.hud?.toast?.(`${W.name} EMPTY`, 'warn'); } return null; }
    if (g.time < (m.cool ?? 0)) return null;
    m.cool = g.time + 0.35; m.charges--;
    const G = g.garage, back = -(v.len / 2 + 1.6), x = v.x + Math.sin(v.h) * back, z = v.z + Math.cos(v.h) * back;
    if (m.kind === 'oil') { G.hazard('oil', x, z, W.slick.r, W.slick.life); g.fx.decal(x, z, W.slick.r * 1.15, '#0d0b09'); }
    else if (m.kind === 'caltrops') { G.hazard('caltrops', x, z, W.field.r, W.field.life); for (let i = 0; i < 6; i++) g.fx.decal(x + (Math.random() - 0.5) * 4, z + (Math.random() - 0.5) * 4, 0.25, '#2a2724'); }
    else if (m.kind === 'smoke') { g.throwables.smokes.push({ x, z, r: 5.5, t: 0, dur: 14 }); g.audio.hiss?.(g.pan(x)); }
    else if (m.kind === 'minedrop') { G.hazard('mine', x, z, W.mine.r, W.mine.life, { owner: v, by: v.driver ?? null }); g.fx.decal(x, z, 0.7, '#2b2a26'); }
    else if (m.kind === 'paint') { G.hazard('paint', x, z, W.cloud.r, W.cloud.life, { owner: v }); g.fx.decal(x, z, W.cloud.r, '#d8d2c2'); for (let i = 0; i < 12; i++) g.fx.spawn(2, x, 1.2, z, (Math.random() - 0.5) * 5, 1, (Math.random() - 0.5) * 5, 2.5, 0.9, '#e8e2d2', -0.3); }
    else if (m.kind === 'flares') {
      const d = this.decoys.find((q) => q.until < g.time) ?? this.decoys[0];
      d.x = x; d.z = z; d.until = g.time + W.flare.life; d.by = v;
      v.flareUntil = g.time + W.flare.life; // the drones lane reads this: a car shedding flares fools a heat-seeker
      for (let i = 0; i < 8; i++) g.fx.spawn(1, x, 2.5, z, (Math.random() - 0.5) * 8, 6 + Math.random() * 4, (Math.random() - 0.5) * 8, 1.4, 0.18, '#fff2b0', 8);
      g.fx.light?.(x, 3, z, '#ffd890', 40, 0.6);
    }
    g.audio.clink?.(g.pan(x));
    g.emit('dropped', { vehicle: v.id, kind: m.kind, x: +x.toFixed(1), z: +z.toFixed(1), left: m.charges });
    return m.kind;
  }

  // ---- hits on vehicles: THE BREACH ------------------------------------------------------------------------------------
  // Plate first (garage.soak, by face and type); whatever gets through reaches the hull, the glass and, on a breached
  // face, the parts behind it (vehicledamage.breach). (ox, oz): where the hit came from (picks the face), default (x, z).
  hitVehicle(v, x, z, dmg, type = 'bullet', by = null, face = null, ox = x, oz = z) {
    const g = this.g, G = g.garage;
    if (!v || v.dead) return 0;
    face ??= G.faceAt(v, ox, oz);
    const through = v.plates ? G.soak(v, face, dmg, type, by) : dmg;
    if (through > 0) {
      g.vehiclesSys.damage(v, through * (type === 'bullet' ? v.armor ?? 0.5 : 0.8), by);
      if (v.plates && !(v.plates[face] > 0)) g.vehDamage.breach?.(v, face, through, type);
      if (type === 'blast') g.vehDamage.hit(v, x, z, Math.min(1, through / 200), 'blast');
      else g.vehDamage.hit(v, x, z, through, 'bullet');
      if (by && type !== 'blast' && face !== 'under' && face !== 'top') g.carCombat.onBulletHit(v, by, through, 0, 0);
    } else g.audio.ricochet?.(g.pan(x), Math.hypot(x - g.player.x, z - g.player.z));
    g.fx.sparks(x, 1, z, 0, 0, 4);
    return through;
  }

  // A blast at (x, z): people, animals and glass as a grenade's; vehicles through their plate. `direct` took it on `face`.
  blast(x, z, dmg, r, by, direct = null, face = null, ox = x, oz = z) {
    const g = this.g;
    g.fx.explosion(x, z);
    g.audio.explosion(Math.hypot(x - g.player.x, z - g.player.z));
    g.hud?.shake?.(Math.max(0, 1.1 - Math.hypot(x - g.player.x, z - g.player.z) / 30));
    g.noise(x, z, 80, by);
    g.interiors?.blast?.(x, z, r, by);
    for (const c of g.chars) {
      if (!c.alive || c.inVehicle) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > r || !g.statics.lineOfSight(x, z, c.x, c.z)) continue;
      const f = 1 - d / r;
      g.combat.damage(c, dmg * f * f + 10 * f, by, (c.x - x) / (d || 1), (c.z - z) / (d || 1), f > 0.5 ? 'explosion' : 'bullet');
    }
    g.dogs?.blast?.(x, z, r, dmg * 0.6, by);
    g.fauna?.blast?.(x, z, r, dmg * 0.6, by);
    for (const v of g.vehicles) {
      if (v.dead) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (v !== direct && d > r + v.len / 2) continue;
      const f = v === direct ? 1 : Math.max(0, 1 - Math.max(0, d - v.len / 2) / r);
      this.hitVehicle(v, x, z, dmg * (v === direct ? 1 : 0.55 * f), 'blast', by, v === direct ? face : null, v === direct ? ox : x, v === direct ? oz : z);
      if (v.windows) for (const s of Object.keys(v.windows)) if (Math.random() < f * 0.7) g.carCombat.damageWindow(v, s, 9999, by);
      v.vx += ((v.x - x) / (d || 1)) * f * 7 / v.mass; v.vz += ((v.z - z) / (d || 1)) * f * 7 / v.mass; v.av += (Math.random() - 0.5) * f * 3;
    }
  }

  mineBlast(h, v) {
    const g = this.g, M = MOUNT_WEAPONS.minedrop.mine;
    this.blast(h.x, h.z, M.dmg, M.blast, h.by ?? null, v, 'under');
    v.av += (Math.random() < 0.5 ? -1 : 1) * 3 / v.mass;
    g.emit('mineHit', { vehicle: v.id, by: h.owner?.id ?? null });
  }

  // ---- the AI's trigger (vehicles.js raider brain; the tactics lane may call fireMount itself) --------------------------
  aiFire(v, tx, tz, dt) {
    if (!v.mounts || !v.driver || v.dead) return;
    const g = this.g, d = Math.hypot(tx - v.x, tz - v.z), ang = Math.atan2(tx - v.x, tz - v.z);
    if ((v.blindUntil ?? 0) > g.time) return; // painted glass: nothing to aim at
    v.aiGunT = (v.aiGunT ?? 0) - dt;
    if (d < 70 && v.aiGunT <= 0 && g.statics.lineOfSight(v.x, v.z, tx, tz)) {
      const r1 = this.fireMount(v, 1, ang, v.driver), r3 = this.fireMount(v, 3, ang, v.driver);
      if (!(r1.charging || r3.charging) && r1.fired + r3.fired === 0) v.aiGunT = 0.15;
    }
    const behind = Math.abs(wrap(ang - v.h)) > 2.4;
    if (behind && d < 28 && Math.random() < dt * 0.6) this.fireMount(v, 2, v.h + Math.PI, v.driver);
  }

  // ---- every frame ---------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g, P = g.player;
    for (const v of g.vehicles) {
      if (v.dead || (!v.mounts && !v.utility && !v.power)) continue;
      if (v.power && v.driver) v.power.e = Math.min(v.power.cap, v.power.e + v.power.regen * dt);
      const U = v.utility;
      if (U) {
        if (U.extinguisher && v.onFire > 0 && U.extinguisher.charges > 0) {
          U.extinguisher.charges--; v.onFire = 0; v.hp = Math.max(v.hp, v.maxHp * 0.12);
          for (let i = 0; i < 14; i++) g.fx.spawn(2, v.x, 1.2, v.z, (Math.random() - 0.5) * 6, 1.5, (Math.random() - 0.5) * 6, 1.5, 0.8, '#eceae4', -0.5);
          g.emit('extinguished', { vehicle: v.id, left: U.extinguisher.charges });
          if (v.driver === P) g.hud?.toast?.(`FIRE OUT — ${U.extinguisher.charges} BOTTLE${U.extinguisher.charges === 1 ? '' : 'S'} LEFT`, 'job');
        }
        if (U.nitrous) {
          const on = (v.nitroUntil ?? 0) > g.time;
          if (!on && v.boost && !v.boostWas && U.nitrous.charges > 0 && g.vehiclesSys.speed(v) > 4 && !v.bike) {
            U.nitrous.charges--; v.nitroUntil = g.time + UTILITY.nitrous.burst.time; g.garage.retune(v);
            g.emit('nitrous', { vehicle: v.id, left: U.nitrous.charges }); if (v.driver === P) g.hud?.toast?.('NITROUS', 'job');
          } else if (v.nitroOn && !on) g.garage.retune(v);
          v.nitroOn = on;
        }
        v.boostWas = v.boost;
      }
      if (v.mounts) this.lockTick(v, dt);
      // Spikes and a cowcatcher: hands come off that face fast and bloody.
      if (v.grabbers?.length && v.plates) for (const gr of v.grabbers) {
        const k = g.garage.kindOf(v, gr.side), A = ARMOR[k];
        if (!(v.plates[gr.side] > 0) || !A?.grabbers && !A?.plow) continue;
        if (A.plow && gr.side === 'front') { gr.grip = 0; continue; }
        gr.grip -= dt * A.grabbers.grip; gr.spikeT = (gr.spikeT ?? 0) - dt;
        if (gr.spikeT <= 0) { gr.spikeT = 0.5; g.combat.damage(gr.c, A.grabbers.dps * 0.5, v.driver ?? null, 0, 0); }
      }
    }
    // Radar detector: armed cars closing (once each), and lock-ons on you (lockTick).
    const pv = P.inVehicle;
    if (pv?.utility?.radar) {
      this.radarT -= dt;
      if (this.radarT <= 0) {
        this.radarT = 1;
        for (const o of g.vehicles) if (o !== pv && !o.dead && o.mounts && o.driver && o.driver !== P && o.ai === 'raider' && !this.radarSeen.has(o.id) && Math.hypot(o.x - pv.x, o.z - pv.z) < UTILITY.radar.warn) {
          this.radarSeen.add(o.id); g.hud?.toast?.('RADAR: ARMED CAR CLOSING', 'warn'); g.emit('radar', { vehicle: o.id });
        }
      }
    }
    this.flyRockets(dt);
  }

  // A seeker mount holds a lock on the car nearest its aim inside the cone and range.
  lockTick(v, dt) {
    const g = this.g;
    for (const face in v.mounts) {
      const m = v.mounts[face], W = MOUNT_WEAPONS[m.kind];
      if (!W?.lock) continue;
      const aim = v.driver === g.player ? Math.atan2(g.aim.x - v.x, g.aim.z - v.z) : m.aimAng ?? v.h;
      let best = null, bo = W.lock.cone;
      for (const o of g.vehicles) {
        if (o === v || o.dead || o.sunk) continue;
        const dx = o.x - v.x, dz = o.z - v.z, d = Math.hypot(dx, dz);
        if (d > W.range) continue;
        const off = Math.abs(wrap(Math.atan2(dx, dz) - aim));
        if (off < bo && Math.abs(wrap(Math.atan2(dx, dz) - (v.h + FACE_BEARING[face]))) < (face === 'top' ? TAU : 0.6)) { bo = off; best = o; }
      }
      let L = this.locks.get(m);
      if (!L) this.locks.set(m, (L = { on: null, t: 0, said: false }));
      if (best && best === L.on) L.t += dt; else { L.on = best; L.t = 0; L.said = false; }
      const need = W.lock.time * (v.utility?.targeting ? UTILITY.targeting.lock : 1);
      if (best && L.t >= need && !L.said) {
        L.said = true;
        g.emit('lockOn', { vehicle: v.id, target: best.id });
        if (v.driver === g.player) g.hud?.toast?.('LOCKED', 'job');
        if (best.driver === g.player && best.utility?.radar) g.hud?.toast?.('RADAR: MISSILE LOCK — DROP FLARES', 'hot');
      }
    }
  }

  flyRockets(dt) {
    const g = this.g, M = this.rocketMesh;
    let n = 0;
    for (const R of this.rockets) {
      if (!R.on) continue;
      R.t += dt; R.life -= dt;
      // Homing: a flare near the target steals it; then steer toward whatever it chases.
      if (R.target) {
        for (const d of this.decoys) if (d.until > g.time && d.by === R.target) { R.target = d; break; }
        const T = R.target;
        if (T.dead || (T.until !== undefined && T.until < g.time)) R.target = null;
        else {
          const want = Math.atan2(T.x - R.x, T.z - R.z), cur = Math.atan2(R.dx, R.dz), turn = Math.max(-R.turn * dt, Math.min(R.turn * dt, wrap(want - cur)));
          R.dx = Math.sin(cur + turn); R.dz = Math.cos(cur + turn);
          if (T.until !== undefined && Math.hypot(T.x - R.x, T.z - R.z) < 1.5) { this.detonate(R, null); continue; }
        }
      }
      const step = R.speed * dt, wall = g.statics.raycast(R.x, R.z, R.dx, R.dz, step, RAY_BULLET);
      let hitV = null;
      for (const o of g.vehicles) {
        if (o.dead || (o === R.owner && R.t < 0.4) || Math.abs(o.x - R.x) > o.len + step || Math.abs(o.z - R.z) > o.len + step) continue;
        for (const d of g.vehiclesSys.discs(o)) if (rayCircle(R.x, R.z, R.dx, R.dz, d.x, d.z, d.r, step + 0.01) >= 0) { hitV = o; break; }
        if (hitV) break;
      }
      let hitC = false;
      if (!hitV) for (const c of g.chars) if (c.alive && !c.inVehicle && c !== R.by && Math.abs(c.x - R.x) < step + 1 && Math.abs(c.z - R.z) < step + 1 && rayCircle(R.x, R.z, R.dx, R.dz, c.x, c.z, 0.6, step) >= 0) { hitC = true; break; }
      if (hitV || hitC || wall < step || R.life <= 0) { if (wall < step && !hitV) { R.x += R.dx * Math.max(0, wall - 0.2); R.z += R.dz * Math.max(0, wall - 0.2); } this.detonate(R, hitV); continue; }
      R.x += R.dx * step; R.z += R.dz * step;
      R.trail -= dt;
      if (R.trail <= 0) { R.trail = 0.035; g.fx.spawn(2, R.x - R.dx * 0.5, R.y, R.z - R.dz * 0.5, 0, 0.3, 0, 0.9, 0.35, '#b9b2a6', -0.4); }
      _o.position.set(R.x, R.y, R.z); _o.rotation.set(0, Math.atan2(R.dx, R.dz), 0); _o.scale.set(1, 1, 1); _o.updateMatrix();
      M.setMatrixAt(n++, _o.matrix);
    }
    M.count = n; M.visible = n > 0;
    if (n) M.instanceMatrix.needsUpdate = true;
  }
  detonate(R, hitV) {
    R.on = false;
    this.blast(R.x, R.z, R.dmg, R.r, R.by, hitV, null, R.ox, R.oz);
    this.g.emit('rocketHit', { vehicle: hitV?.id ?? null, x: +R.x.toFixed(1), z: +R.z.toFixed(1) });
  }

  // ---- what an agent and the screen read ---------------------------------------------------------------------------------
  report(v) {
    const g = this.g, G = g.garage, C = G.chassis(v), base = G.base(v);
    const faces = Object.fromEntries(FACES6.map((f) => [f, { kind: G.kindOf(v, f), pts: +(v.plates?.[f] ?? 0).toFixed(1), full: v.platesFull?.[f] ?? +(v.plates?.[f] ?? 0).toFixed(1), max: C?.faces[f] ?? 0 }]));
    const mounts = Object.fromEntries(Object.entries(C?.mounts ?? {}).map(([f, P]) => {
      const m = v.mounts?.[f], W = m ? MOUNT_WEAPONS[m.kind] : null;
      return [f, { size: P.size, arc: +(Math.min(W?.arc ?? Infinity, P.arc)).toFixed(2), group: groupOf(f, W), kind: m?.kind ?? null, name: W?.name ?? null, loaded: m ? ('charges' in m ? m.charges : m.ammo) : null, mag: W?.mag ?? null, ammo: W?.ammo ?? null }];
    }));
    return {
      ...G.view(v), faces, mountPoints: mounts, armorTotal: Math.round(FACES6.reduce((s, f) => s + (v.plates?.[f] ?? 0), 0)),
      perf: { accel: +(v.accel / base.accel).toFixed(3), top: +(v.maxSpeed / base.maxSpeed).toFixed(3), turn: +(v.turn / base.turn).toFixed(3), brake: +(v.brakeMul ?? 1).toFixed(3) },
      site: this.site ? { id: this.site.id, name: this.site.name, rate: this.site.rate } : null,
    };
  }
  rows() { return { armor: Object.keys(ARMOR), weapons: Object.keys(MOUNT_WEAPONS), utility: Object.keys(UTILITY), ammo: Object.keys(AMMO_ITEMS), paints: Object.keys(PAINTS), arenas: Object.keys(ARENAS), shops: Object.keys(WORKSHOPS), loaner: LOANER, valid: validateWorkshop() }; }
}
