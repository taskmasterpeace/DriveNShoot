// THE FOUND THINGS, RUN (docs/design/WEB_FAN_NODS.md; rows data/fannods.js). Most of the eight are rows other systems
// already read (the underground's glass room and calendars, the weapons, the ring's glass case, the sky's burning rain);
// this runs the parts that live in time:
//   hum        the glass room's chamber hums when you stand near it (a low tone, nothing more)
//   counter    the lapel counter in your pack ticks near hot ground (systems/hotground.js zones), from past the edge
//   meal       the self-heating meal: the tab pulled, half a minute later a hot meal is in your pack
//   rain       the burning rain stings bare skin under the open sky; the unarmed folk near you run for a door
//   convoy     the armoured trade convoy (a systems/semis.js freight run): rolls up, pulls over, opens a side, trades
//              from real boxes, closes up and rolls on, guards on the roofs
//   bones      the skeletons in the interstate's ditches, a broad blade by one hand (a ring box: taken once)
// Its look is one InstancedMesh (the trailers' slits and plates, the open side's flap, the bones and the blade): one draw
// call while any of it is near, none otherwise. Scratch objects only: nothing is allocated per frame.
import * as THREE from 'three';
import { GLASS_CHAMBER, BADGE, HEATER, SICK_SKY, CONVOY, CONVOY_ROOF, DITCH_BONES, DITCH, FN_LOOT_ADD } from '../data/fannods.js';
import { LOOT } from '../data/items.js';
import { UG_LOOT } from '../data/underground.js';
import { MB_LOOT } from '../data/milbases.js';
import { TRADERS } from '../data/trade.js';
import { FREIGHT } from '../data/trailers.js';
import { HOT_GROUND } from '../data/hotground.js';
import { outfit } from './characters.js';
import { randomName } from '../data/npcs.js';
import { makeRng } from '../engine/rng.js';

const CAP = 160;
const _o = new THREE.Object3D(), _c = new THREE.Color(), _m = new THREE.Matrix4();
const r1 = (v) => Math.round(v * 10) / 10;
const CONVOY_FLAGS = ['US', 'US', 'US', 'MX', 'CA', 'US'];

export class FanNods {
  constructor(g) {
    this.g = g;
    this.rng = makeRng(0x6f4e1d);
    // the rows other tables carry (the found things' rare rows in tables that exist; the convoy's run and counter)
    for (const [k, rows] of Object.entries(FN_LOOT_ADD)) { const T = LOOT[k] ?? UG_LOOT[k] ?? MB_LOOT[k]; if (T && !T.fnAdded) { T.rows.push(...rows); T.fnAdded = true; } }
    FREIGHT.rigs.armoured ??= CONVOY.rigs;
    TRADERS[CONVOY.trader.id] ??= { name: CONVOY.trader.name, deals: CONVOY.trader.deals };
    CONVOY_ROOF.key ??= 'convoyRoof';
    this.counts = { hums: 0, ticks: 0, heated: 0, burns: 0, sheltered: 0, convoys: 0, halts: 0, trades: 0, bones: 0 };
    this.humT = 0;
    this.badge = { on: false, rate: 0, acc: 0, zone: null, d: null };
    this.heating = [];
    this.rain = { acc: 0, warned: false, hurt: 0, exposed: false, scanT: 0 };
    this.convoy = null; this.convoyT = CONVOY.every;
    this.ditch = new Map(); // row id -> { x, z, y, box }
    this.ditchT = 0; this.ditchW = null; this.ditchAt = new Map();
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.15 }), CAP);
    this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.setColorAt(0, _c.set('#ffffff'));
    g.scene.add(this.mesh);
  }

  update(dt) {
    const p = this.g.player;
    if (!p) return;
    this.n = 0;
    this.hum(dt, p);
    this.counter(dt, p);
    this.cook(dt);
    this.burningRain(dt, p);
    this.convoyStep(dt, p);
    this.bones(dt, p);
    this.flush();
  }

  // ---- 1. the glass room's hum -----------------------------------------------------------------------------------------
  // The chamber on the level your feet are on, if you are within GLASS_CHAMBER.hum m of its middle. -> { x, z, d } or null
  chamberNear(p) {
    const U = this.g.under, A = U?.A;
    if (!A || !p.ug) return null;
    const P = A.levels.get(U.levelOf(p.gy ?? 0));
    if (!P) return null;
    for (const q of P.L.props) if (q.kind === 'glasshex') { const x = (q.x0 + q.x1) / 2, z = (q.z0 + q.z1) / 2, d = Math.hypot(p.x - x, p.z - z); if (d < GLASS_CHAMBER.hum) return { x, z, d }; }
    return null;
  }
  hum(dt, p) {
    this.humT -= dt;
    if (this.humT > 0) return;
    this.humT = 0.5;
    const C = this.chamberNear(p);
    if (!C) return;
    this.humT = GLASS_CHAMBER.humEvery;
    const v = 0.05 * (1 - C.d / GLASS_CHAMBER.hum) + 0.012;
    this.g.audio?.tone?.(55, GLASS_CHAMBER.humEvery * 0.95, v, 'sine', 0);
    this.g.audio?.tone?.(110.5, GLASS_CHAMBER.humEvery * 0.9, v * 0.35, 'sine', 0);
    this.counts.hums++;
    this.g.emit('glassHum', { d: r1(C.d) });
  }

  // ---- 4. the lapel counter --------------------------------------------------------------------------------------------
  // The rate it ticks at (per s) for someone at (x, z): 0 out of reach of every hot zone; from BADGE.rate[0] at `reach` m
  // outside an edge, up to [1] at the worst ground's middle (the zone's dose times nearness^1.5, as its own field).
  rateAt(x, z) {
    let best = 0, zone = null, dist = null;
    for (const Z of HOT_GROUND) {
      const d = Math.hypot(x - Z.x, z - Z.z) - Z.r;
      if (d > BADGE.reach) continue;
      const k = d > 0 ? 0.12 * (1 - d / BADGE.reach) : 0.12 + 0.88 * Math.min(1, (Z.dose / 3) * Math.pow(-d / Z.r, 1.5) * 1.6 + 0.05);
      const rate = BADGE.rate[0] + (BADGE.rate[1] - BADGE.rate[0]) * k;
      if (rate > best) { best = rate; zone = Z.id; dist = d; }
    }
    return { rate: best, zone, d: dist };
  }
  counter(dt, p) {
    const B = this.badge, inv = this.g.inventory;
    B.on = !!inv && (inv.carried?.count?.(BADGE.item) ?? 0) > 0 && p.alive;
    if (!B.on) { B.rate = 0; return; }
    const v = p.inVehicle, R = this.rateAt(v ? v.x : p.x, v ? v.z : p.z);
    B.rate = R.rate; B.zone = R.zone; B.d = R.d;
    if (!B.rate) { B.acc = 0; return; }
    B.acc += B.rate * dt * (0.75 + Math.random() * 0.5); // a counter's ticks come uneven, as they do
    while (B.acc >= 1) { B.acc -= 1; this.counts.ticks++; this.g.audio?.burst?.({ dur: 0.008, freq: 5600, type: 'highpass', vol: BADGE.vol, decay: 0.006 }); }
  }

  // ---- 8. the self-heating meal ----------------------------------------------------------------------------------------
  // use act 'heatmeal' (systems/inventory.js act): the pouch leaves your pack, the heater hisses, HEATER.wait s later the
  // hot meal is in it. -> { ok, text }
  heatMeal(by = this.g.player) {
    const g = this.g;
    if (!by?.alive) return { ok: false, why: 'not now' };
    this.heating.push({ t: HEATER.wait, made: 0 });
    g.audio?.burst?.({ dur: 0.9, freq: 2400, q: 0.6, type: 'bandpass', vol: 0.12, decay: 0.6 }); // the tab pulled: a long hiss
    g.noise?.(by.x, by.z, HEATER.noise, by);
    g.emit('mealHeating', { wait: HEATER.wait });
    return { ok: true, text: `THE BAG HISSES · HOT IN ${HEATER.wait} S` };
  }
  cook(dt) {
    if (!this.heating.length) return;
    const g = this.g, inv = g.inventory;
    for (let i = this.heating.length - 1; i >= 0; i--) {
      const h = this.heating[i];
      h.t -= dt;
      if (h.t > 0) continue;
      this.heating.splice(i, 1);
      if (!inv) continue;
      inv.add(inv.carried, HEATER.hot, 1, { made: inv.hours?.() ?? 0 });
      inv.changed?.();
      this.counts.heated++;
      g.hud?.toast?.('THE MEAL IS HOT', 'job');
      g.emit('mealHot', { item: HEATER.hot });
    }
  }

  // ---- 6. the burning rain ---------------------------------------------------------------------------------------------
  // Bare skin under the open sky: no roof (survival's shelter), not in a hard-topped car, not below ground.
  exposed(p) {
    const g = this.g;
    if (!p.alive || p.ug || p.underwater || g.sky?.below) return false;
    return (g.survival?.shelterKind?.() ?? 'rough') === 'rough';
  }
  burningRain(dt, p) {
    const g = this.g, R = this.rain, burn = g.sky?.cur?.burn ?? 0;
    if (burn < SICK_SKY.from) { R.acc = 0; R.exposed = false; if (burn < 0.05) R.warned = false; return; }
    R.exposed = this.exposed(p);
    if (R.exposed) {
      R.acc += SICK_SKY.dmg * burn * dt;
      if (R.acc >= 1) { const n = Math.floor(R.acc); R.acc -= n; R.hurt += n; this.counts.burns++; g.combat?.damage(p, n, null, 0, 0, 'sickness'); }
      if (!R.warned) { R.warned = true; g.hud?.toast?.('THE RAIN BURNS · GET UNDER A ROOF', 'hot'); g.emit('rainBurns', {}); }
    }
    // anyone with sense: the unarmed folk near you out in it make for the nearest door
    R.scanT -= dt;
    if (R.scanT > 0) return;
    R.scanT = 1;
    const doors = g.interiors?.doors ?? [];
    for (const c of g.chars) {
      if (c === p || !c.alive || c.weapon || c.npc || c.faction === 'zombie' || c.inVehicle || c.ug || c.flee > 1 || Math.hypot(c.x - p.x, c.z - p.z) > SICK_SKY.flee * 3) continue;
      let best = null, bd = 40;
      for (const d of doors) { const dd = Math.hypot(d.x - c.x, d.z - c.z); if (dd < bd && dd > 1.2) { bd = dd; best = d; } }
      if (!best) continue;
      c.flee = Math.min(6, bd / 4 + 1); c.fleeX = c.x - (best.x - c.x); c.fleeZ = c.z - (best.z - c.z); // flee runs away from (fleeX, fleeZ): mirrored, it runs to the door
      this.counts.sheltered++;
    }
  }

  // ---- 5. the armoured trade convoy -------------------------------------------------------------------------------------
  out() { const S = this.g.semis, p = this.g.player; return !!(S?.W && S.outside(p.inVehicle?.x ?? p.x, p.inVehicle?.z ?? p.z)); }
  // Start one (the rare roll, or the `fannods action=convoy` command). near: it rolls in just ahead of you, not from behind.
  startConvoy(near = false) {
    const g = this.g, S = g.semis;
    if (!S || this.convoy || S.freight) return null;
    const F = S.spawnFreight('armoured', { near });
    if (!F) return null;
    F.fnConvoy = true;
    const C = { F, phase: 'rolling', t: 0, away: 0, trader: null, boxes: [], guards: [], flap: 0, mid: F.members[Math.min(1, F.members.length - 1)]?.v.towing ?? null, seed: this.counts.convoys };
    const rng = makeRng(0x51ab + C.seed * 7919);
    for (const m of F.members) {
      const T = m.v.towing;
      if (!T) continue;
      T.fnConvoy = true; m.v.fnConvoy = true;
      T.roofDeck = CONVOY_ROOF; T.deckRiders ??= [];
      for (let k = 0; k < CONVOY.guards; k++) {
        const c = g.addChar({ x: T.x, z: T.z, faction: 'drifter', weapon: 'rifle', hp: CONVOY.guardHp, colors: outfit('drifter', rng), name: randomName(rng), flag: CONVOY_FLAGS[Math.floor(rng() * CONVOY_FLAGS.length)] });
        if (!c) continue;
        c.fnConvoy = true; c.hold = true;
        g.decks?.mount(c, T, k ? 0.5 : -0.5, k ? -3.2 : 3.2, 'load', CONVOY_ROOF);
        C.guards.push(c);
      }
    }
    this.convoy = C; this.counts.convoys++;
    g.emit('convoySpotted', { dir: F.dir > 0 ? 'east' : 'west', road: F.road, rigs: F.members.length, guards: C.guards.length });
    return C;
  }
  convoyStep(dt, p) {
    const g = this.g, S = g.semis;
    let C = this.convoy;
    if (!C) {
      if (!S || S.freight || !this.out()) return;
      this.convoyT -= dt;
      if (this.convoyT > 0) return;
      this.convoyT = CONVOY.every;
      if (this.rng() < CONVOY.chance) this.startConvoy(false);
      return;
    }
    if (S.freight !== C.F) { this.endConvoy(); return; } // gone down the road (or cleared)
    C.t += dt;
    const F = C.F, lead = F.members.find((m) => !m.v.dead)?.v, px = p.inVehicle?.x ?? p.x, pz = p.inVehicle?.z ?? p.z;
    if (!lead) return;
    const d = Math.hypot(lead.x - px, lead.z - pz);
    if (C.phase === 'rolling' && C.t > 2 && d < CONVOY.halt) { F.halt = true; F.pull = CONVOY.pull; C.phase = 'pulling'; C.t = 0; this.counts.halts++; g.emit('convoyHalt', { d: r1(d) }); }
    else if (C.phase === 'pulling') { C.still = F.members.every((m) => m.v.dead || g.vehiclesSys.speed(m.v) < 0.6) ? (C.still ?? 0) + dt : 0; if (C.still > 1.5 || C.t > 40) { F.hold = true; this.openSide(C); } } // all stopped a moment (or long enough): every rig holds where it is
    else if (C.phase === 'open') {
      C.flap = Math.min(1, C.flap + dt * 0.6);
      C.away = Math.hypot(C.mid.x - px, C.mid.z - pz) > 60 ? C.away + dt : 0;
      if (C.t > CONVOY.stay || C.away > CONVOY.leave || (C.trader && !C.trader.alive)) this.closeSide(C);
    } else if (C.phase === 'closing') { C.flap = Math.max(0, C.flap - dt * 0.8); if (C.flap <= 0) { F.halt = false; F.hold = false; F.pull = 0; C.phase = 'leaving'; C.t = 0; g.emit('convoyRollsOn', {}); } }
  }
  // The middle trailer's shoulder side: unit (x, z) out from it, away from the traffic.
  shoulder(T) {
    const W = this.g.semis?.W, F = this.convoy?.F;
    if (W && F) { const s = W.project(T.x, T.z, 400).s, f = W.at(s); return { x: f.nx * F.dir, z: f.nz * F.dir }; }
    return { x: Math.cos(T.h), z: -Math.sin(T.h) };
  }
  openSide(C) {
    const g = this.g, T = C.mid, inv = g.inventory;
    C.phase = 'open'; C.t = 0;
    if (!T || T.dead) return;
    const o = this.shoulder(T), fx = Math.sin(T.h), fz = Math.cos(T.h), out = T.wid / 2;
    const rng = makeRng(0x7ad0 + C.seed * 131);
    const name = randomName(rng), flag = CONVOY_FLAGS[Math.floor(rng() * CONVOY_FLAGS.length)];
    const tx = T.x + o.x * (out + 2.2), tz = T.z + o.z * (out + 2.2);
    const c = g.addChar({ x: tx, z: tz, faction: 'drifter', weapon: 'pistol', hp: 130, colors: outfit('drifter', rng), name, flag,
      npc: { id: CONVOY.trader.id, name, title: 'Convoy trader', flag, faction: 'drifter', portrait: { seed: (C.seed * 37) % 997, skin: rng.pick(['#9a6a44', '#c08a62', '#6a4a32', '#e0b48a']), hair: '#2a1e18', hat: 'cap', mood: 'neutral', shirt: '#5a5a44', gear: 'none' }, ...this.talk() } });
    if (c) { c.fnConvoy = true; c.hold = true; c.face = Math.atan2(-o.x, -o.z) + Math.PI; C.trader = c; }
    // the counter: the stock behind the flap (the convoy's own boxes, rolled once from its table: nobody cheats)
    for (let i = 0; i < CONVOY.boxes; i++) {
      const a = (i - (CONVOY.boxes - 1) / 2) * 1.6, id = `fn:convoy:${C.seed}:${i}`;
      if (!inv) break;
      const box = inv.place(id, 'fn_convoy', T.x + o.x * (out + 0.7) + fx * a, T.z + o.z * (out + 0.7) + fz * a, 60, 'CONVOY STOCK');
      box.y = 1.1; box.owner = c?.id ?? null; box.ownerName = name;
      C.boxes.push(box);
    }
    g.emit('convoyOpen', { trader: c?.id ?? null, boxes: C.boxes.length, x: r1(tx), z: r1(tz) });
  }
  talk() {
    const sys = this;
    return { start: 'hi', nodes: { hi: { text: () => 'We stop an hour, maybe less. Look, buy, keep your hands where the roof can see them.', choices: [
      { t: 'Show me what you carry.', do: (g) => { const c = sys.convoy?.trader; if (c) { sys.counts.trades++; g.trade?.openCounter(c); } }, end: true },
      { t: '[Leave]', end: true },
    ] } } };
  }
  closeSide(C) {
    const g = this.g, inv = g.inventory;
    C.phase = 'closing'; C.t = 0;
    if (C.trader) { if (g.chars.includes(C.trader)) g.removeChar(C.trader); C.trader = null; }
    for (const b of C.boxes) { if (inv?.opened === b) inv.opened = null; inv?.boxes.delete(b.id); }
    C.boxes.length = 0;
    g.emit('convoyClosed', {});
  }
  endConvoy() {
    const C = this.convoy, g = this.g;
    if (!C) return;
    if (C.phase === 'open') this.closeSide(C);
    for (const c of C.guards) if (g.chars.includes(c)) { if (c.onDeck) g.decks?.dismount(c, 'gone', true); g.removeChar(c); }
    this.convoy = null;
  }

  // ---- 3. the bones in the ditch ----------------------------------------------------------------------------------------
  ditchSpot(row, W) {
    let q = this.ditchAt.get(row.id);
    if (q && this.ditchW === W) return q;
    if (this.ditchW !== W) { this.ditchAt.clear(); this.ditchW = W; }
    const s = row.at * W.cl.L, f = W.at(s), sec = W.section(s), u = row.side * (sec.out + row.set);
    const x = f.x + f.nx * u, z = f.z + f.nz * u;
    q = { x, z, h: Math.atan2(f.tx, f.tz) + row.side * 1.1, y: W.groundAt?.(x, z) ?? 0 };
    this.ditchAt.set(row.id, q);
    return q;
  }
  bones(dt, p) {
    const g = this.g, W = g.semis?.W, inv = g.inventory;
    this.ditchT -= dt;
    if (this.ditchT <= 0) {
      this.ditchT = 0.5;
      const on = W && this.out();
      for (const row of DITCH_BONES) {
        const live = this.ditch.get(row.id);
        const q = on ? this.ditchSpot(row, W) : null, d = q ? Math.hypot(q.x - p.x, q.z - p.z) : Infinity;
        if (!live && d < DITCH.near && inv) { inv.registerRing([{ id: `fn:${row.id}`, table: 'fn_ditch', x: q.x, z: q.z, cap: 8, label: 'BONES IN THE DITCH' }]); const box = inv.boxes.get(`fn:${row.id}`); if (box) box.y = q.y; this.ditch.set(row.id, { ...q, row }); this.counts.bones++; g.emit('ditchBones', { id: row.id }); }
        else if (live && d > DITCH.far) { inv?.unregisterRing([{ id: `fn:${row.id}` }]); this.ditch.delete(row.id); }
      }
    }
  }

  // ---- the look -------------------------------------------------------------------------------------------------------
  put(x, y, z, sx, sy, sz, h, col) {
    if (this.n >= CAP) return;
    _o.position.set(x, y, z); _o.rotation.set(0, h, 0); _o.scale.set(sx, sy, sz); _o.updateMatrix();
    this.mesh.setMatrixAt(this.n, _o.matrix); this.mesh.setColorAt(this.n, _c.set(col)); this.n++;
  }
  // a box in a vehicle's own frame (its group's world matrix: heading, and the pitch a trailer rides at on its fifth wheel):
  // lx across, ly up from its ground, lz along (+ forward)
  putOn(v, lx, ly, lz, sx, sy, sz, col) {
    if (this.n >= CAP || !v.group) return;
    _o.position.set(lx, ly, lz); _o.rotation.set(0, 0, 0); _o.scale.set(sx, sy, sz); _o.updateMatrix();
    _m.multiplyMatrices(v.group.matrixWorld, _o.matrix);
    this.mesh.setMatrixAt(this.n, _m); this.mesh.setColorAt(this.n, _c.set(col)); this.n++;
  }
  flush() {
    const C = this.convoy, inv = this.g.inventory;
    if (C) for (const m of C.F.members) {
      const T = m.v.towing;
      if (!T || T.dead) continue;
      const hw = T.wid / 2 + 0.02, y = T.tall * 0.66;
      for (let k = 0; k < 4; k++) this.putOn(T, 0, T.tall + 0.02, (k - 1.5) * T.len * 0.235, T.wid - 0.16, 0.05, T.len * 0.215, k % 2 ? CONVOY.plate : '#47483b'); // plate over the roof, in panels (what the camera sees)
      for (const s of [-1, 1]) {
        this.putOn(T, s * hw, T.tall * 0.42, 0, 0.05, 0.5, T.len * 0.86, CONVOY.plate);                                        // a plated band along the side
        for (let k = 0; k < CONVOY.slits; k++) this.putOn(T, s * (hw + 0.01), y, (k / (CONVOY.slits - 1) - 0.5) * T.len * 0.7, 0.05, 0.11, 0.85, CONVOY.slit); // the slits
      }
      if (T === C.mid && C.flap > 0) { // the side let down into a counter
        const o = this.shoulder(T), side = Math.sign(o.x * Math.cos(T.h) - o.z * Math.sin(T.h)) || 1, a = C.flap;
        this.putOn(T, side * (hw + 0.6 * a), 1.15 + 0.9 * (1 - a), 0, 1.2 * a + 0.05, 0.08, T.len * 0.4, '#6a6450');
        this.putOn(T, side * (hw + 0.005), 1.95, 0, 0.04, 1.4 * a + 0.01, T.len * 0.4, '#151410');                             // the dark of the open side
      }
    }
    for (const L of this.ditch.values()) {
      const fx = Math.sin(L.h), fz = Math.cos(L.h), at = (a, b) => [L.x + fx * a + fz * b, L.z + fz * a - fx * b];
      const P = (a, b, y, sx, sy, sz, col, dh = 0) => { const [x, z] = at(a, b); this.put(x, L.y + y, z, sx, sy, sz, L.h + dh, col); };
      P(0.82, 0, 0.1, 0.2, 0.18, 0.24, DITCH.bone);                                   // the skull
      P(0.35, 0, 0.06, 0.34, 0.1, 0.5, DITCH.cloth);                                   // what is left of a coat
      for (let k = 0; k < 4; k++) P(0.5 - k * 0.1, 0, 0.09, 0.36, 0.04, 0.05, DITCH.bone); // ribs
      P(-0.05, 0, 0.06, 0.08, 0.05, 0.42, DITCH.bone);                                 // the spine's end, the hips
      P(-0.45, 0.12, 0.05, 0.06, 0.05, 0.48, DITCH.bone, 0.08); P(-0.45, -0.12, 0.05, 0.06, 0.05, 0.48, DITCH.bone, -0.15); // the legs
      P(0.42, 0.42, 0.04, 0.05, 0.04, 0.42, DITCH.bone, 0.9);                          // an arm out toward the blade
      const box = inv?.boxes.get(`fn:${L.row.id}`);
      if (!box?.rolled || box.slots.some((s) => s.id === 'jungle_blade')) { P(0.55, 0.85, 0.03, 0.12, 0.025, 0.5, DITCH.blade, 0.15); P(0.55, 0.85, 0.035, 0.07, 0.04, 0.16, DITCH.grip, 0.15); }
    }
    this.mesh.count = this.n; this.mesh.visible = this.n > 0;
    if (this.n) { this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
  }

  // ---- agents ---------------------------------------------------------------------------------------------------------
  status() {
    const g = this.g, C = this.convoy, p = g.player;
    return {
      counts: { ...this.counts },
      chamber: this.chamberNear(p),
      counter: { carried: this.badge.on, rate: r1(this.badge.rate), zone: this.badge.zone, edge: this.badge.d == null ? null : r1(this.badge.d) },
      heating: this.heating.map((h) => r1(h.t)),
      rain: { burn: +(g.sky?.cur?.burn ?? 0).toFixed(2), weather: g.sky?.weatherKey, exposed: this.rain.exposed, hurt: this.rain.hurt },
      convoy: C ? { phase: C.phase, t: r1(C.t), halt: !!C.F.halt, rigs: C.F.members.map((m) => ({ id: m.v.id, x: r1(m.v.x), z: r1(m.v.z), speed: r1(g.vehiclesSys.speed(m.v)), trailer: m.v.towing?.id ?? null })),
        guards: C.guards.filter((c) => c.alive).map((c) => ({ id: c.id, roof: c.onDeck?.D === CONVOY_ROOF, y: r1(c.gy ?? 0) })), trader: C.trader?.id ?? null, boxes: C.boxes.map((b) => b.id), flap: +C.flap.toFixed(2) } : null,
      ditch: [...this.ditch.values()].map((L) => ({ id: L.row.id, x: r1(L.x), z: r1(L.z) })),
      drawn: this.n,
    };
  }
}
