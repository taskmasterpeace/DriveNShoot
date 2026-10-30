// TOWING (data/towing.js; docs/design/WEB_MOVE_TOW.md): lines between vehicles, the winch, the wrecker's boom, the boat
// trailer, a car held by the mud, a gate or a wreck dragged off the road.
//   A LINE (rope, chain, winch cable) is a spring that only pulls. It sags when slack, goes taut, and parts when its
//   smoothed tension passes the row's breakLoad. A BAR (the boom, a trailer's hitch) is rigid: the towed body swings on
//   the pivot behind the puller (the articulated hitch), pushes as well as pulls, and can't jackknife past `fold`.
//   vehicles.js calls pre(dt) before anything drives (the springs change velocities), post(dt) after (the bars place
//   their towed bodies, the boats ride their trailers, the lines are drawn), drag(v) for a towed car's rolling drag and
//   ground(v, dt, fxm) for the mud.
// Nobody cheats: a line comes out of a pack or a trunk (and goes back on release; a parted one is gone), a winch is a
// vehicle's (the wrecker's own, or the workshop's), a boat leaves its trailer only where the water is deep enough.
// One InstancedMesh draws every line and bar (one draw call, none when nothing is hooked); no per-frame allocation.
import * as THREE from 'three';
import { LINES, TOW, MUD, MUD_PITS, TRAILER, TOW_VEHICLES, TOW_ITEMS } from '../data/towing.js';
import { VEHICLES } from './vehicles.js';
import { ITEMS } from '../data/items.js';
import { LAKE } from '../world/water.js';

for (const [k, v] of Object.entries(TOW_VEHICLES)) VEHICLES[k] ??= v;
for (const [k, v] of Object.entries(TOW_ITEMS)) ITEMS[k] ??= v;

const CAR_TAGS = new Set(['wreck', 'cg-wreck', 'bl-burnt', 'bl-carblocks', 'hulk', 'chassis', 'car']);
const FOLD = 1.35; // a bar never lets the towed body swing further than this off the puller's line (rad)
const _A = { x: 0, z: 0 }, _B = { x: 0, z: 0 }, _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3(0, 0, 1), _c = new THREE.Color();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const r2 = (v) => Math.round(v * 100) / 100;

export class Towing {
  constructor(game) {
    this.g = game;
    this.links = [];
    this.pits = MUD_PITS.slice();
    this.pits.push({ id: 'lake-sw', x: LAKE.x - LAKE.r * 0.72 - 7, z: LAKE.z + LAKE.r * 0.72 + 7, r: 5, depth: 1 }); // the lake's soft south-west shore
    this.counts = { hitched: 0, snapped: 0, released: 0, bogged: 0, freed: 0, launched: 0, hauled: 0, gates: 0, wrecks: 0 };
    this.nextId = 1;
    this.gHold = 0; this.gWinch = null;
    const max = TOW.maxLinks * TOW.segs;
    if (game.scene) {
      this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.3 }), max);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.setColorAt(0, _c.set('#ffffff'));
      this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.name = 'towlines';
      game.scene.add(this.mesh);
    }
  }

  // ---- anchors ------------------------------------------------------------------------------------------------------
  // The hook point at one end of a vehicle: end +1 its nose, -1 its tail (a wrecker's tail is its boom's end).
  anchor(v, end, out) {
    const o = end > 0 ? v.len / 2 + 0.05 : -(v.len / 2 + (v.tow === 'boom' ? 0.45 : 0.05));
    out.x = v.x + Math.sin(v.h) * o; out.z = v.z + Math.cos(v.h) * o;
    return out;
  }
  linkOf(v, end) { for (const L of this.links) if ((L.a === v && L.aEnd === end) || (L.b === v && L.bEnd === end)) return L; return null; }
  towing(v) { for (const L of this.links) if (L.b === v) return L; return null; }
  // A bar's two halves (and a boat on its trailer) never collide; a rope's or a chain's still bump (brake hard with a car
  // on a rope and it runs into your tail).
  linked(v, o) { for (const L of this.links) if (L.L.rigid && ((L.a === v && L.b === o) || (L.a === o && L.b === v))) return true; return v.carriedBy === o || o.carriedBy === v; }
  canWinch(v) { return !!(v?.winch || v?.utility?.winch); }
  lineCount(v, id) {
    const I = this.g.inventory; if (!I) return 0;
    return I.carried.count(id) + (v ? I.trunk(v).count(id) : 0);
  }
  takeLine(v, id) { const I = this.g.inventory; if (I.carried.count(id) > 0) { I.spend(id, 1); return true; } const T = I.trunk(v), i = T.slots.findIndex((s) => s.id === id); if (i >= 0) { I.take(T, i, 1); I.changed(); return true; } return false; }

  // ---- what is there to hook --------------------------------------------------------------------------------------
  // Nearest thing to the puller's end (end -1: behind its tail; +1: ahead of its nose, a winch's reach), within `reach`.
  // -> { type: 'veh' | 'gate' | 'wreck', v?, door?, rec?, end?, x, z, d } or null
  find(a, end = -1, reach = TOW.reach) {
    const g = this.g, A = this.anchor(a, end, _A);
    let best = null, bd = reach;
    for (const v of g.vehicles) {
      if (v === a || v.carriedBy || (v.driver && v.driver !== g.player) || v.driver === g.player || this.towing(v)) continue;
      if (v.boat && (v.depth ?? 0) > 0.3 && !(end > 0 && this.canWinch(a))) continue; // a boat afloat: the trailer's winch hauls it, not a tow
      if (Math.abs(v.x - A.x) > reach + v.len || Math.abs(v.z - A.z) > reach + v.len) continue;
      for (const e of [1, -1]) {
        this.anchor(v, e, _B);
        const d = Math.hypot(_B.x - A.x, _B.z - A.z);
        if (d < bd) { bd = d; best = { type: 'veh', v, end: e, x: _B.x, z: _B.z, d }; }
      }
    }
    for (const D of g.interiors?.doors ?? []) {
      if (D.broken || D.pulled || !D.gate) continue;
      const d = Math.hypot(D.x - A.x, D.z - A.z);
      if (d < bd) { bd = d; best = { type: 'gate', door: D, x: D.x, z: D.z, d }; }
    }
    const W = g.wrecks;
    if (W?.recs) for (const [id, r] of W.recs) {
      if (r.gone || !VEHICLES[r.type]) continue;
      const d = Math.hypot(r.x - A.x, r.z - A.z) - VEHICLES[r.type].len * 0.4;
      if (d < bd) { bd = d; best = { type: 'wreck', rec: r, inst: id, x: r.x, z: r.z, d: Math.max(0, d) }; }
    }
    return best;
  }

  // ---- making and breaking links ------------------------------------------------------------------------------------
  // a tows b. kind: rope | chain | cable | boom | hitch. opts: { aEnd, bEnd, free: true (staging: no item spent), len }
  hitch(a, b, kind, opts = {}) {
    const g = this.g, L = LINES[kind];
    if (!L || !a || !b || a === b) return { ok: false, why: 'no such line' };
    if (this.links.length >= TOW.maxLinks) return { ok: false, why: 'too many lines out' };
    const aEnd = opts.aEnd ?? (kind === 'cable' ? 1 : -1);
    if (this.linkOf(a, aEnd)) return { ok: false, why: 'that end is already hooked' };
    if (b.anchors && this.towing(b)) return { ok: false, why: 'already on a line' };
    if (kind === 'cable' && !this.canWinch(a)) return { ok: false, why: 'no winch on this vehicle' };
    if (kind === 'boom' && a.tow !== 'boom') return { ok: false, why: 'only a wrecker has a boom' };
    if (kind === 'hitch' && !b.trailer) return { ok: false, why: 'a hitch takes a trailer' };
    if (L.item && !opts.free) { if (!this.takeLine(a, L.item)) return { ok: false, why: `you have no ${L.name}` }; }
    let bEnd = opts.bEnd;
    if (b.anchors && bEnd === undefined) { this.anchor(a, aEnd, _A); const f = this.anchor(b, 1, _B), df = Math.hypot(f.x - _A.x, f.z - _A.z); this.anchor(b, -1, _B); bEnd = Math.hypot(_B.x - _A.x, _B.z - _A.z) < df ? -1 : 1; }
    if (L.rigid) bEnd = 1;
    this.anchor(a, aEnd, _A);
    const fx = b.anchors ? this.anchor(b, bEnd, _B) : (_B.x = b.x, _B.z = b.z, _B);
    const d = Math.hypot(fx.x - _A.x, fx.z - _A.z);
    const link = { id: `t${this.nextId++}`, kind, L, a, b, aEnd, bEnd: bEnd ?? 1, len: opts.len ?? (L.winch ? Math.min(L.range, Math.max(2, d + 0.3)) : L.rigid ? L.len : Math.max(1.5, Math.min(L.len, d + TOW.tieSlack))), load: 0, loadS: 0, peak: 0, winching: false, item: opts.free ? null : L.item, t: g.time, stall: false };
    if (L.winch && d > L.range) return { ok: false, why: 'out of the cable\'s reach' };
    if (b.anchors) { b.towedBy = a; b.parked = false; b.lifted = !!L.lift; if (L.rigid) b._tw = { x: b.x, z: b.z }; }
    this.links.push(link);
    this.counts.hitched++;
    g.emit('towHitched', { id: link.id, kind, from: a.id, to: b.id ?? b.door?.id ?? null, what: b.anchors ? b.type : b.kind });
    return { ok: true, link };
  }

  release(link, why = 'released') {
    const g = this.g, i = this.links.indexOf(link);
    if (i < 0) return false;
    this.links.splice(i, 1);
    const b = link.b;
    if (b?.anchors) { b.towedBy = null; b.lifted = false; }
    if (why === 'released' && link.item) g.inventory?.stow(link.item, 1); // the line back in your pack
    if (why === 'snapped') {
      this.counts.snapped++;
      this.anchor(link.a, link.aEnd, _A);
      g.fx?.sparks?.(_A.x, 0.8, _A.z, 0, 0, 8);
      g.audio?.yank?.();
      if (link.a.driver === g.player || b?.driver === g.player) { g.hud?.shake?.(TOW.snapFling); g.hud?.toast?.(`THE ${link.L.name.toUpperCase()} PARTED`, 'warn'); }
      g.noise?.(_A.x, _A.z, 18, link.a.driver ?? null);
    } else this.counts.released++;
    g.emit(why === 'snapped' ? 'towSnapped' : 'towReleased', { id: link.id, kind: link.kind, from: link.a.id, to: b?.id ?? null, load: r2(link.loadS), peak: r2(link.peak), breakLoad: link.L.breakLoad });
    return true;
  }
  releaseAll(v) { for (const L of [...this.links]) if (L.a === v || L.b === v) this.release(L, 'gone'); }

  // A static wreck on the line: it becomes a live dead car (its collider and its batched body go), the line holds it.
  freeWreck(t) {
    const g = this.g, r = t.rec, W = g.wrecks;
    r.gone = true;
    W.mesh?.deleteInstance(t.inst); W.recs.delete(t.inst);
    for (const ids of W.sets.values()) { const i = ids.indexOf(t.inst); if (i >= 0) { ids.splice(i, 1); break; } }
    const S = g.statics, c = S.cell;
    const near = (b) => CAR_TAGS.has(b.tag) && r.x > b.minX - 0.4 && r.x < b.maxX + 0.4 && r.z > b.minZ - 0.4 && r.z < b.maxZ + 0.4;
    for (const b of S.boxes) if (near(b)) b.base = 99;
    for (let gx = Math.floor(r.x / c) - 1; gx <= Math.floor(r.x / c) + 1; gx++) for (let gz = Math.floor(r.z / c) - 1; gz <= Math.floor(r.z / c) + 1; gz++) {
      for (const b of S.chunkCell(gx, gz)) if (near(b)) b.base = 99;
      if (S.cg?.n) for (const b of S.cg.cell(gx, gz)) if (near(b)) b.base = 99;
    }
    const v = g.vehiclesSys.spawn(r.type, r.x, r.z, r.rot ?? 0, '#4a4036');
    v.dead = true; v.hp = 0; v.mesh.material = g.vehiclesSys.wreckMat; v.fromWreck = r.key ?? true;
    this.counts.wrecks++;
    g.emit('wreckFreed', { type: r.type, x: r2(r.x), z: r2(r.z), vehicle: v.id });
    return v;
  }

  // ---- the player at the wheel ----------------------------------------------------------------------------------------
  // G: tap to hitch what is behind (a trailer, a car, a gate, a wreck: the best line you carry, the wrecker's boom) or to
  // drop the line you have out; with a boat trailer at the water, a tap launches the boat or hauls one up. Hold G with a
  // winch: the cable to whatever is ahead, reeling in while held. Returns true when it used the key this frame.
  driveInput(p, v, I, dt) {
    if (v.driver !== p) return false;
    const down = I.key('KeyG');
    const tail = this.linkOf(v, -1), nose = this.linkOf(v, 1);
    if (nose?.winching && !down) { nose.winching = false; this.g.emit('winch', { id: nose.id, on: false, len: r2(nose.len) }); }
    if (down) {
      this.gHold += dt;
      if (this.gHold > 0.4 && this.canWinch(v)) {
        if (!nose) { const t = this.find(v, 1, LINES.cable.range); if (t?.type === 'veh') { const r = this.hitch(v, t.v, 'cable', { aEnd: 1, bEnd: t.end }); if (r.ok) this.winch(r.link, true); } else if (!this.gWinch) { this.gWinch = 1; this.g.hud.toast('NOTHING AHEAD FOR THE WINCH', 'warn'); } }
        else if (!nose.winching) this.winch(nose, true);
      }
      this.prompt(v, tail, nose);
      return true;
    }
    const tapped = this.gHold > 0 && this.gHold <= 0.4;
    this.gHold = 0; this.gWinch = null;
    if (!tapped) { this.prompt(v, tail, nose); return false; }
    if (nose && !tail) { this.release(nose); return true; }
    if (tail) {
      const tr = tail.b;
      if (tr?.trailer && this.atRamp(tr, tr.boat ? 1 : 0.6)) { if (tr.boat) { this.launch(tr); return true; } const b = this.boatBehind(tr); if (b) { this.haul(tr, b); return true; } }
      this.release(tail); return true;
    }
    const t = this.find(v, -1);
    if (!t) { this.g.hud.toast('NOTHING BEHIND TO HITCH', 'warn'); return true; }
    const kind = t.type === 'veh' && t.v.trailer ? 'hitch' : t.type === 'veh' && v.tow === 'boom' ? 'boom' : this.lineCount(v, 'tow_chain') ? 'chain' : this.lineCount(v, 'tow_rope') ? 'rope' : null;
    if (!kind) { this.g.hud.toast('NO TOW LINE · A ROPE OR A CHAIN IN YOUR PACK OR TRUNK', 'warn'); return true; }
    const r = this.hookTarget(v, t, kind);
    this.g.hud.toast(r.ok ? `HITCHED · ${LINES[kind].name.toUpperCase()}` : r.why.toUpperCase(), r.ok ? 'job' : 'warn');
    return true;
  }
  hookTarget(v, t, kind) {
    if (t.type === 'veh') return this.hitch(v, t.v, kind, { bEnd: t.end });
    if (LINES[kind].rigid) return { ok: false, why: 'a bar needs a car on it' };
    if (t.type === 'gate') return this.hitch(v, { door: t.door, x: t.x, z: t.z, kind: 'gate' }, kind);
    const w = this.freeWreck(t);
    return this.hitch(v, w, kind);
  }
  prompt(v, tail, nose) {
    const H = this.g.hud;
    if (v.bog > MUD.stuckAt) { H.prompt(`<b class="warn">BOGGED</b> · a winch or a tow pulls it out${this.canWinch(v) ? ' · hold <kbd>G</kbd> winch' : ''}`); return; }
    if (nose?.winching) { H.prompt(`WINCHING · ${nose.len.toFixed(1)} m · load ${Math.round(nose.loadS)}/${nose.L.breakLoad}${nose.stall ? ' · <b class="warn">STALLED</b>' : ''}`); return; }
    if (tail) {
      const tr = tail.b, ramp = tr?.trailer && this.atRamp(tr, tr.boat ? 1 : 0.6);
      H.prompt(ramp ? (tr.boat ? '<kbd>G</kbd> Launch the boat' : this.boatBehind(tr) ? '<kbd>G</kbd> Winch the boat up' : 'AT THE RAMP · back a boat onto the bunks') : `TOWING · ${tail.L.name} · load ${Math.round(tail.loadS)}/${tail.L.breakLoad} · <kbd>G</kbd> drop it`);
    }
  }

  // ---- the winch ------------------------------------------------------------------------------------------------------
  winch(link, on) {
    if (!link?.L.winch) return false;
    link.winching = !!on;
    this.g.emit('winch', { id: link.id, on: !!on, len: r2(link.len) });
    if (on) this.g.audio?.clank?.();
    return true;
  }

  // ---- the boat trailer -----------------------------------------------------------------------------------------------
  // Its tail in the water deep enough, its wheels not drowned: the ramp.
  // k: a share of tailDepth (a haul holds on at 0.6 of it: the rig settling back a hand's width off the line stays a ramp).
  atRamp(t, k = 1) {
    const W = this.g.water; if (!W?.depthAt) return false;
    this.anchor(t, -1, _A);
    const tail = W.depthAt(_A.x, _A.z), mid = W.depthAt(t.x, t.z);
    return tail >= TRAILER.tailDepth * k && mid <= TRAILER.wheelMax;
  }
  // A boat whose bow is at the trailer's tail, slow and lined up with it.
  boatBehind(t) {
    this.anchor(t, -1, _A);
    for (const b of this.g.vehicles) {
      if (!b.boat || b.carriedBy || b.driver && b.driver !== this.g.player || b.len > t.len + 1.4 || this.g.vehiclesSys.speed(b) > TRAILER.loadSpeed) continue;
      this.anchor(b, 1, _B);
      if (Math.hypot(_B.x - _A.x, _B.z - _A.z) > TRAILER.loadReach) continue;
      if (Math.abs(wrap(b.h - t.h)) > TRAILER.loadAngle) continue;
      return b;
    }
    return null;
  }
  // Put a boat on the bunks (spawning a rig, a check's staging; haul() ends here too).
  load(t, b) {
    if (b.driver === this.g.player) this.g.exitVehicle(true);
    for (const o of [...(b.occ ?? [])]) if (o) this.g.seats.leave(o, true);
    t.boat = b; b.carriedBy = t; b.hauling = null; b.vx = b.vz = 0; b.av = 0;
    this.carryBoat(t);
  }
  launch(t) {
    const g = this.g, b = t.boat;
    if (!b || !this.atRamp(t)) return { ok: false, why: t.boat ? 'not at the water (the tail must stand in the water)' : 'no boat on it' };
    t.boat = null; b.carriedBy = null;
    const fx = Math.sin(t.h), fz = Math.cos(t.h), back = t.len / 2 - b.len / 2 + 0.6;
    b.x = t.x - fx * back; b.z = t.z - fz * back; b.h = t.h;
    b.vx = -fx * TRAILER.launchPush; b.vz = -fz * TRAILER.launchPush;
    this.counts.launched++;
    g.fx?.spawn?.(2, b.x - fx * b.len * 0.5, 0.3, b.z - fz * b.len * 0.5, 0, 1.2, 0, 1.2, 0.5, '#dfe9ea', 3);
    g.emit('boatLaunched', { boat: b.id, trailer: t.id, x: r2(b.x), z: r2(b.z), depth: r2(g.water.depthAt(b.x, b.z)) });
    if (t.towedBy?.driver === g.player) g.hud?.toast?.(`${b.name} AFLOAT`, 'job');
    return { ok: true, boat: b.id };
  }
  haul(t, b) {
    if (t.boat || b.carriedBy) return { ok: false, why: 'the bunks are taken' };
    if (!this.atRamp(t, 0.6)) return { ok: false, why: 'back the trailer into the water first' };
    if (b.driver === this.g.player) this.g.exitVehicle(true);
    b.hauling = t;
    this.g.emit('boatHaul', { boat: b.id, trailer: t.id });
    return { ok: true };
  }
  carryBoat(t) {
    const b = t.boat, fx = Math.sin(t.h), fz = Math.cos(t.h);
    b.x = t.x + fx * TRAILER.bunkZ; b.z = t.z + fz * TRAILER.bunkZ; b.h = t.h; b.vx = t.vx; b.vz = t.vz; b.av = 0;
    b.y = b.gy = (t.y ?? 0) + TRAILER.bunkY; b.depth = 0;
    b.group.position.set(b.x, b.y, b.z);
    b.group.rotation.set(t.group.rotation.x, t.h, t.group.rotation.z);
  }

  // ---- mud ------------------------------------------------------------------------------------------------------------
  mudAt(x, z) {
    for (const P of this.pits) if (P.r > 0 && Math.abs(x - P.x) < P.r && Math.abs(z - P.z) < P.r && Math.hypot(x - P.x, z - P.z) < P.r) return P.depth ?? 1;
    return 0;
  }
  addPit(x, z, r = 5, id = `pit${this.pits.length}`) {
    const P = { id, x, z, r, depth: 1 };
    this.pits.push(P);
    this.g.fx?.decal?.(x, z, r * 1.9, '#3a2c1e', 0); // the soft ground reads darker
    return P;
  }
  removePit(id) { const i = this.pits.findIndex((p) => p.id === id); if (i >= 0) this.pits.splice(i, 1); }
  // vehicles.drive: the mud under v (fxm.power cut), returns the rolling-drag multiplier for this frame.
  ground(v, dt, fxm) {
    if (v.boat || v.air || v.trailer) return 1;
    if (!this.pits.length && !v.bog) return 1;
    const m = this.mudAt(v.x, v.z); // only a pit holds a car: rain on the desert never bogs the whole road
    let bog = v.bog ?? 0;
    if (m > 0) {
      const sp = Math.hypot(v.vx, v.vz), spin = !!v.driver && Math.abs(v.throttle) > 0.1 && sp < MUD.spinSpeed;
      bog = Math.min(MUD.maxBog * m, bog + dt * (spin ? MUD.sink : MUD.sinkIdle) * m);
    } else if (bog > 0) bog = Math.max(0, bog - dt * MUD.firm);
    const soft = m > 0 ? m : 0; // soft ground drags at the wheels before it holds them
    if (soft) fxm.power *= 1 - MUD.softPower * soft;
    if (bog <= 0) { if (v.bog) v.bog = 0; return soft ? Math.exp(-dt * MUD.soft * soft) : 1; }
    const was = v.bog ?? 0;
    v.bog = bog;
    if (was <= MUD.stuckAt && bog > MUD.stuckAt) { this.counts.bogged++; this.g.emit('bogged', { vehicle: v.id, x: r2(v.x), z: r2(v.z) }); if (v.driver === this.g.player) this.g.hud.toast('BOGGED DOWN · YOU NEED A PULL', 'warn'); }
    if (was > MUD.freeAt && bog <= MUD.freeAt) { this.counts.freed++; this.g.emit('unbogged', { vehicle: v.id }); v.bog = 0; return 1; }
    fxm.power *= 1 - bog * MUD.power;
    if (Math.random() < dt * 6 * bog && Math.abs(v.throttle) > 0.1) this.g.fx?.spawn?.(2, v.x, 0.2, v.z, (Math.random() - 0.5) * 2, 1.2, (Math.random() - 0.5) * 2, 0.6, 0.3, '#4a3a28', 6); // mud off the tyres
    return Math.exp(-dt * (bog * MUD.drag + MUD.soft * soft));
  }
  // vehicles.drive: a towed body rolls in neutral, not on its brakes.
  drag(v) { return v.lifted ? TOW.liftedDrag : TOW.towedDrag * (v.dead ? TOW.deadDrag : 1); }

  // ---- the physics ----------------------------------------------------------------------------------------------------
  pre(dt) {
    if (!this.links.length || dt <= 0) return;
    const g = this.g, k = 1 - Math.exp(-dt * TOW.filter);
    for (let i = this.links.length - 1; i >= 0; i--) {
      const l = this.links[i], L = l.L, a = l.a, b = l.b;
      if (!g.vehicles.includes(a) || a.sunk || (b.anchors && (!g.vehicles.includes(b) || b.sunk))) { this.release(l, 'gone'); continue; }
      if (L.rigid) continue;
      if (b.kind === 'gate' && (b.door.broken || b.door.pulled)) { this.release(l, 'gone'); continue; }
      const A = this.anchor(a, l.aEnd, _A), B = b.anchors ? this.anchor(b, l.bEnd, _B) : (_B.x = b.x, _B.z = b.z, _B);
      let dx = B.x - A.x, dz = B.z - A.z;
      const d = Math.hypot(dx, dz) || 1e-6; dx /= d; dz /= d;
      if (l.winching) {
        l.stall = l.loadS > TOW.stallLoad;
        if (!l.stall) l.len = Math.max(1.4, l.len - TOW.reelSpeed * dt);
        const s = Math.exp(-dt * 8); a.vx *= s; a.vz *= s; // the puller's brakes hold while the drum turns
      }
      const st = d - l.len;
      let F = 0;
      if (st > 0) {
        const rel = b.anchors ? (b.vx - a.vx) * dx + (b.vz - a.vz) * dz : -(a.vx * dx + a.vz * dz);
        F = Math.max(0, L.k * st + L.damp * rel);
        const ma = a.mass, mb = b.anchors ? b.mass : Infinity;
        a.vx += dx * F / ma * dt; a.vz += dz * F / ma * dt;
        if (b.anchors) {
          b.vx -= dx * F / mb * dt; b.vz -= dz * F / mb * dt;
          if (!b.driver) { const rx = B.x - b.x, rz = B.z - b.z, I = mb * b.len * b.len * TOW.inertia; b.av += (rz * -dx * F - rx * -dz * F) / I * dt; } // the line swings the towed body's end round toward it
          if (b.bog > 0) { const was = b.bog; b.bog = Math.max(0, b.bog - F / (mb * MUD.pullFree) * dt); if (was > MUD.freeAt && b.bog <= MUD.freeAt) { b.bog = 0; this.counts.freed++; g.emit('unbogged', { vehicle: b.id, by: a.id }); } }
        }
        if (st > L.maxStretch) { // the hard stop: the line holds the ends at len + maxStretch
          const over = st - L.maxStretch, share = b.anchors ? mb / (ma + mb) : 1;
          a.x += dx * over * share; a.z += dz * over * share;
          if (b.anchors) { b.x -= dx * over * (1 - share); b.z -= dz * over * (1 - share); const rv = (b.vx - a.vx) * dx + (b.vz - a.vz) * dz; if (rv > 0) { a.vx += dx * rv * share; a.vz += dz * rv * share; b.vx -= dx * rv * (1 - share); b.vz -= dz * rv * (1 - share); } }
          else { const rv = -(a.vx * dx + a.vz * dz); if (rv > 0) { a.vx += dx * rv; a.vz += dz * rv; } }
        }
      }
      l.load = F; l.loadS += (F - l.loadS) * k; l.peak = Math.max(l.peak, l.loadS);
      if (l.loadS > L.breakLoad) { this.release(l, 'snapped'); continue; }
      if (b.kind === 'gate' && l.loadS > TOW.gateLoad) {
        const D = b.door;
        g.gadgets?.breach?.(D, a.driver ?? null);
        D.pulled = true; this.counts.gates++;
        g.audio?.yank?.(); g.hud?.shake?.(0.4);
        g.emit('gateDragged', { door: D.id, gate: !!D.gate, vehicle: a.id, line: l.kind });
        this.release(l, 'released');
      }
    }
  }

  post(dt) {
    const g = this.g;
    for (const l of this.links) {
      if (!l.L.rigid) continue;
      const a = l.a, b = l.b;
      // the pivot behind the puller; the towed body hangs off it nose first, swinging on it (an articulated hitch)
      const A = this.anchor(a, -1, _A);
      const tongue = b.len / 2 + l.L.len;
      let ux = A.x - b.x, uz = A.z - b.z;
      const du = Math.hypot(ux, uz) || 1; ux /= du; uz /= du;
      let h = Math.atan2(ux, uz), off = wrap(h - a.h);
      if (Math.abs(off) > FOLD) { off = Math.sign(off) * FOLD; h = a.h + off; ux = Math.sin(h); uz = Math.cos(h); }
      const x = A.x - ux * tongue, z = A.z - uz * tongue;
      const px = b._tw?.x ?? b.x, pz = b._tw?.z ?? b.z;
      if (dt > 0) { b.vx = (x - px) / dt; b.vz = (z - pz) / dt; }
      b.av = dt > 0 ? wrap(h - b.h) / dt : 0;
      b.x = x; b.z = z; b.h = h; b._tw = b._tw ?? { x, z }; b._tw.x = x; b._tw.z = z;
      l.loadS = Math.hypot(b.vx - a.vx, b.vz - a.vz) * b.mass; l.load = l.loadS; // a bar's load: what it is forcing on the towed body
      const lift = b.lifted ? 0.14 : 0;
      b.group.position.set(x, Math.max(b.y ?? 0, b.gy ?? 0) + lift * 1.6, z);
      b.group.rotation.set(-(b.pitch ?? 0) - lift, h, b.roll ?? 0);
    }
    for (const t of g.vehicles) {
      if (t.boat && t.carriedBy && !g.vehicles.includes(t.carriedBy)) { t.carriedBy = null; continue; }
      if (t.trailer && t.boat) this.carryBoat(t);
    }
    // a boat being winched up the bunks: along the trailer's line, onto it
    for (const b of g.vehicles) {
      const t = b.hauling;
      if (!t) continue;
      if (!g.vehicles.includes(t) || t.boat) { b.hauling = null; continue; }
      const fx = Math.sin(t.h), fz = Math.cos(t.h), tx = t.x + fx * TRAILER.bunkZ, tz = t.z + fz * TRAILER.bunkZ;
      const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
      b.h += wrap(t.h - b.h) * Math.min(1, dt * 3);
      if (d < 0.3) { this.load(t, b); this.counts.hauled++; g.emit('boatHauled', { boat: b.id, trailer: t.id }); if (t.towedBy?.driver === g.player) g.hud?.toast?.(`${b.name} ON THE TRAILER`, 'job'); continue; }
      const s = Math.min(d, TRAILER.haulSpeed * dt) / (d || 1);
      b.x += dx * s; b.z += dz * s; b.vx = b.vz = 0;
      b.group.position.set(b.x, b.group.position.y + (TRAILER.bunkY - 0) * Math.min(1, dt * 1.5), b.z); b.group.rotation.y = b.h;
    }
    this.draw();
  }

  // ---- drawing ----------------------------------------------------------------------------------------------------------
  draw() {
    const M = this.mesh;
    if (!M) return;
    let n = 0;
    const S = TOW.segs;
    for (const l of this.links) {
      const L = l.L, a = l.a, b = l.b;
      const A = this.anchor(a, l.L.rigid ? -1 : l.aEnd, _A), B = b.anchors ? this.anchor(b, l.L.rigid ? 1 : l.bEnd, _B) : (_B.x = b.x, _B.z = b.z, _B);
      const ya = (a.y ?? 0) + 0.62, yb = (b.anchors ? (b.group?.position.y ?? 0) : 0) + (b.anchors ? 0.6 : 1.0);
      const d = Math.hypot(B.x - A.x, B.z - A.z), slack = L.rigid ? 0 : clamp((l.len - d) / Math.max(0.5, l.len), 0, 1);
      const sag = L.rigid ? 0 : L.sag * (0.08 + 0.92 * Math.sqrt(slack)) * Math.min(1, l.len / 3);
      _c.set(L.color);
      let x0 = A.x, y0 = ya, z0 = A.z;
      const segs = L.rigid ? 1 : S;
      for (let s = 1; s <= segs; s++) {
        const u = s / segs, x1 = A.x + (B.x - A.x) * u, z1 = A.z + (B.z - A.z) * u;
        const y1 = Math.max(0.03, ya + (yb - ya) * u - sag * 4 * u * (1 - u));
        _d.set(x1 - x0, y1 - y0, z1 - z0);
        const len = _d.length() || 1e-4;
        _q.setFromUnitVectors(_f, _d.normalize());
        _p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); _s.set(L.w, L.w, len + L.w * 0.5);
        if (n < M.instanceMatrix.count) { M.setMatrixAt(n, _m.compose(_p, _q, _s)); M.setColorAt(n, _c); n++; }
        x0 = x1; y0 = y1; z0 = z1;
      }
    }
    M.count = n; M.visible = n > 0;
    if (n) { M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true; }
  }

  view() {
    return {
      links: this.links.map((l) => ({ id: l.id, kind: l.kind, from: l.a.id, to: l.b.id ?? l.b.door?.id ?? null, toType: l.b.type ?? l.b.kind, len: r2(l.len), load: r2(l.loadS), peak: r2(l.peak), breakLoad: l.L.breakLoad, winching: l.winching, stall: l.stall, taut: l.L.rigid || r2(this.span(l)) >= r2(l.len) })),
      pits: this.pits.filter((p) => p.r > 0).map((p) => ({ id: p.id, x: r2(p.x), z: r2(p.z), r: p.r })),
      bogged: this.g.vehicles.filter((v) => v.bog > 0).map((v) => ({ id: v.id, type: v.type, bog: r2(v.bog), stuck: v.bog > MUD.stuckAt })),
      trailers: this.g.vehicles.filter((v) => v.trailer).map((t) => ({ id: t.id, boat: t.boat?.id ?? null, ramp: this.atRamp(t), towedBy: t.towedBy?.id ?? null })),
      counts: this.counts,
    };
  }
  span(l) { const A = this.anchor(l.a, l.aEnd, _A), B = l.b.anchors ? this.anchor(l.b, l.bEnd, _B) : (_B.x = l.b.x, _B.z = l.b.z, _B); return Math.hypot(B.x - A.x, B.z - A.z); }
}
