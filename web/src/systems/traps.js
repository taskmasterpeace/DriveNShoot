import * as THREE from 'three';
import { TRAPS, TRAPCRAFT } from '../data/greyborn.js';
import { layerMesh } from '../engine/depthlayers.js';

// Traps as world objects (docs/design/WEB_GREYBORN_GRAPEVINE.md §3.1; rows in data/greyborn.js TRAPS). A trap has a
// place, an owner (a Greyborn settlement, a Grapevine pack, or nobody), a kind and a state: armed, sprung or disarmed.
// It catches anything that walks onto it (the player, people, the infected, the hot ground's creatures), never its own
// owner's people. You see one only by looking carefully (spot range from crouch, pace, light and TRAPCRAFT, a skill
// learned by doing); a spotted one wears an amber ring, and a held E takes it apart.
//
// Drawing: every part of every trap is one instance of one box mesh (one draw call); the rings are a second.
const MAX_PARTS = 640, MAX_RINGS = 48;
const _o = new THREE.Object3D(), _c = new THREE.Color(), SAND = new THREE.Color('#a88c62');
const WOOD = '#6a4c30', DARK = '#2a2118', WIRE = '#b9b5a6', CAN = '#8a8478', HOLE = '#140f0b', CLOTH = '#7a3a24', BONE = '#d8d0b8';

export class Traps {
  constructor(game) {
    this.g = game;
    this.list = [];          // { id, kind, x, z, rot, owner, state, spotted, look, seed, by, at, relayAt }
    this.holds = [];         // who a trap has: { c, t, x, z, until }
    this.xp = 0;             // trapcraft
    this.seq = 0;
    this.disarming = null; this.hold = 0;
    this.stats = { sprung: 0, caught: 0, spotted: 0, disarmed: 0, slips: 0 };
    this.parts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95 }), MAX_PARTS);
    this.parts.castShadow = true; this.parts.receiveShadow = true; this.parts.count = 0; this.parts.frustumCulled = false;
    const rg = new THREE.RingGeometry(0.93, 1.0, 48); rg.rotateX(-Math.PI / 2);
    this.rings = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ color: '#f0a52a', transparent: true, opacity: 0.75, depthWrite: false }), MAX_RINGS);
    this.rings.count = 0; layerMesh(this.rings, 'ring'); this.rings.frustumCulled = false; // engine/depthlayers.js
    game.scene.add(this.parts, this.rings);
    this.dirty = true;
  }

  get craft() { return Math.min(TRAPCRAFT.max, Math.floor(Math.sqrt(this.xp / 4))); }
  gain(n) { const before = this.craft; this.xp += n; if (this.craft > before) { this.g.hud?.toast(`TRAPCRAFT ${this.craft}`, 'job'); this.g.emit('trapcraft', { level: this.craft }); } }

  place(kind, x, z, owner = null, rot = 0) {
    if (!TRAPS[kind]) return null;
    const t = { id: `T${++this.seq}`, kind, x, z, rot, owner, state: 'armed', spotted: false, look: 0, seed: (this.seq * 2654435761) >>> 0, by: null, at: 0, relayAt: 0, tries: 0 };
    this.list.push(t); this.dirty = true;
    return t;
  }
  remove(t) { const i = this.list.indexOf(t); if (i >= 0) this.list.splice(i, 1); this.holds = this.holds.filter((h) => h.t !== t); this.dirty = true; }
  byId(id) { return this.list.find((t) => t.id === id) ?? null; }
  // The owner's own people never trip their own traps.
  owns(t, c) { return !!t.owner && (c.gb?.town === t.owner || c.gv?.pack === t.owner); }

  // Somebody stepped in it.
  spring(t, c) {
    const g = this.g, T = TRAPS[t.kind];
    if (t.state !== 'armed') return false;
    t.state = 'sprung'; t.by = c?.id ?? null; t.at = g.time; t.spotted = true; this.dirty = true;
    this.stats.sprung++;
    const P = g.player, pan = g.pan(t.x), d = Math.hypot(t.x - P.x, t.z - P.z);
    if (c && !c.inVehicle) {
      this.stats.caught++;
      if (T.dmg) g.combat.damage(c, T.dmg, null, 0, 0, 'trap');
      if (T.knock && c.alive) { c.knockT = T.knock; c.knockMax = T.knock; c.knockCool = g.time + T.knock + 0.6; }
      if (T.hold && c.alive) this.holds.push({ c, t, x: t.x, z: t.z, until: g.time + T.hold });
      if (c === P) { this.gain(TRAPCRAFT.sprung); g.hud?.toast(`${T.name.toUpperCase()}${T.hold ? ' · HOLD E TO WORK FREE' : ''}`, 'warn'); }
    }
    if (d < 60) g.audio.burst?.({ dur: 0.12, freq: t.kind === 'deadfall' ? 260 : 900, vol: 0.5, decay: 0.1, pan });
    if (T.noise) { g.noise(t.x, t.z, T.noise, null); for (let k = 0; k < 4; k++) if (d < 90) g.audio.clink?.(pan); }
    if (t.kind === 'deadfall' && d < 40) g.fx.dust(t.x, t.z, 4);
    g.emit('trapSprung', { id: t.id, kind: t.kind, owner: t.owner, by: c?.id ?? null, byFaction: c?.faction ?? null, x: +t.x.toFixed(1), z: +t.z.toFixed(1) });
    g.greyborn?.onTrap(t, c);
    g.grapevine?.onTrap(t, c);
    return true;
  }

  // Taken apart. by: who did it (the player, a check); slip: it went off in their hands instead.
  disarm(t, by = this.g.player) {
    const g = this.g, T = TRAPS[t.kind];
    if (t.state !== 'armed') return { ok: false, why: `it is ${t.state}` };
    t.tries++;
    const roll = ((t.seed ^ (t.tries * 0x9e3779b9)) >>> 0) / 4294967296;
    if (roll < T.slip * Math.max(0, 1 - 0.1 * this.craft)) { this.stats.slips++; this.spring(t, by); return { ok: false, slipped: true }; }
    t.state = 'disarmed'; t.by = by?.id ?? null; t.at = g.time; this.dirty = true; this.stats.disarmed++;
    if (by === g.player) {
      this.gain(TRAPCRAFT.disarm);
      if (T.salvage && g.inventory?.add(g.inventory.carried, T.salvage, 1)) g.inventory.changed();
      g.feedback?.floater(t.x, t.z, `${T.name.toUpperCase()} DISARMED`, 'loot');
    }
    g.audio.clink?.(g.pan(t.x));
    g.emit('trapDisarmed', { id: t.id, kind: t.kind, owner: t.owner, by: by?.id ?? null });
    g.greyborn?.onTrap(t, null);
    return { ok: true, salvage: T.salvage ?? null };
  }

  relay(t) { t.state = 'armed'; t.spotted = false; t.look = 0; t.by = null; t.tries = 0; this.dirty = true; this.g.emit('trapRelaid', { id: t.id, kind: t.kind, owner: t.owner }); }

  // The spot range for this trap, from where and how you are (§4).
  spotRange(t) {
    const g = this.g, P = g.player, T = TRAPS[t.kind], night = g.sky?.night ?? 0;
    const sp = P.speed ?? 0, pace = sp < 2.6 ? 1.25 : sp > 5 ? 0.5 : 1;
    let light = 1 - 0.7 * night;
    if (night > 0.3 && g.flashMat?.opacity > 0) {
      const a = Math.atan2(t.x - P.x, t.z - P.z); let da = Math.abs(a - P.face); if (da > Math.PI) da = Math.PI * 2 - da;
      if (da < 0.45 && Math.hypot(t.x - P.x, t.z - P.z) < 15) light = Math.max(light, 0.9);
    }
    return T.spot * (P.crouch ? 1.5 : 1) * pace * light * (1 + 0.12 * this.craft);
  }

  update(dt) {
    const g = this.g, P = g.player;
    // Who is in a trap: held where it caught them (after everyone has moved this frame).
    for (let i = this.holds.length - 1; i >= 0; i--) {
      const h = this.holds[i], c = h.c;
      if (!c.alive || g.time > h.until || !g.chars.includes(c) || c.inVehicle) { this.holds.splice(i, 1); continue; }
      const dx = c.x - h.x, dz = c.z - h.z, d = Math.hypot(dx, dz);
      if (d > 0.3) { c.x = h.x + (dx / d) * 0.3; c.z = h.z + (dz / d) * 0.3; }
      c.speed = 0;
      if (c === P) {
        g.hud?.prompt(`<b class="warn">${TRAPS[h.t.kind].name.toUpperCase()}</b> · hold <kbd>E</kbd> to work free`);
        if (g.input.key('KeyE')) h.until -= dt * 1.5; // working at it
      }
    }
    if (!this.list.length) { this.draw(); return; }
    // Anyone stepping on an armed trap near the action springs it (a check every frame: traps are few).
    for (const t of this.list) {
      if (t.state !== 'armed') continue;
      if (Math.abs(t.x - P.x) > 220 || Math.abs(t.z - P.z) > 220) continue; // far off: nobody's looking
      const r = TRAPS[t.kind].r;
      for (const c of g.chars) {
        if (!c.alive || Math.abs(c.x - t.x) > r || Math.abs(c.z - t.z) > r) continue;
        if (c.inVehicle) continue;
        if (this.owns(t, c) || c.leapT > 0) continue;
        if (Math.hypot(c.x - t.x, c.z - t.z) <= r) { this.spring(t, c); break; }
      }
      // A car rolling over it springs it harmlessly (a tripwire still rattles).
      if (t.state === 'armed') for (const v of g.vehicles) if (!v.dead && Math.abs(v.x - t.x) < 1.6 && Math.abs(v.z - t.z) < 1.6 && Math.hypot(v.x - t.x, v.z - t.z) < 1.4) { this.spring(t, null); break; }
    }
    // Bait: the infected and the creatures drift to it.
    this.lureT = (this.lureT ?? 0) - dt;
    if (this.lureT <= 0) {
      this.lureT = 2;
      for (const t of this.list) {
        if (t.state !== 'armed' || t.kind !== 'bait') continue;
        const R = TRAPS.bait.lure;
        for (const c of g.chars) if (c.alive && c.faction === 'zombie' && !c.ztarget && !c.gb && Math.abs(c.x - t.x) < R && Math.abs(c.z - t.z) < R) { c.wx = t.x; c.wz = t.z; c.timer = 6; }
      }
    }
    // Looking carefully: a trap inside your spot range, in your sight cone, with a clear line, for long enough.
    if (P.alive && !P.inVehicle) {
      const look = Math.atan2(g.aim.x - P.x, g.aim.z - P.z), cone = (TRAPCRAFT.cone * Math.PI) / 180;
      let near = null, nd = 1.5;
      for (const t of this.list) {
        if (t.state === 'disarmed') continue;
        const d = Math.hypot(t.x - P.x, t.z - P.z);
        if (t.spotted) { if (t.state === 'armed' && d < nd) { nd = d; near = t; } continue; }
        if (d > 12) continue;
        let da = Math.abs(Math.atan2(t.x - P.x, t.z - P.z) - look); if (da > Math.PI) da = Math.PI * 2 - da;
        if (d <= this.spotRange(t) && (da < cone || d < 1.5) && g.los(P.x, P.z, t.x, t.z)) {
          if ((t.look += dt) >= TRAPCRAFT.look) {
            t.spotted = true; this.dirty = true; this.stats.spotted++; this.gain(TRAPCRAFT.spot);
            g.feedback?.floater(t.x, t.z, TRAPS[t.kind].name.toUpperCase(), 'warn');
            g.emit('trapSpotted', { id: t.id, kind: t.kind, owner: t.owner, d: +d.toFixed(1) });
          }
        } else t.look = Math.max(0, t.look - dt * 0.5);
      }
      // Hold E at a spotted, armed trap: take it apart.
      if (near && !this.holds.some((h) => h.c === P)) {
        const need = TRAPS[near.kind].disarm * (1 - 0.06 * this.craft);
        if (this.disarming !== near) { this.disarming = near; this.hold = 0; }
        if (g.input.key('KeyE')) {
          this.hold += dt;
          g.hud?.prompt(`Disarming the ${TRAPS[near.kind].name.toLowerCase()}… ${Math.round(Math.min(1, this.hold / need) * 100)}%`);
          if (this.hold >= need) { this.disarm(near, P); this.hold = 0; this.disarming = null; }
        } else { this.hold = 0; g.hud?.prompt(`Hold <kbd>E</kbd> Disarm the <b>${TRAPS[near.kind].name.toLowerCase()}</b>`); }
      } else if (this.disarming) { this.disarming = null; this.hold = 0; }
    }
    this.draw();
  }

  // ---- drawing --------------------------------------------------------------------------------------------------
  draw() {
    if (!this.dirty) return;
    this.dirty = false;
    const g = this.g;
    let n = 0, nr = 0;
    const put = (t, lx, ly, lz, sx, sy, sz, col, ry = 0, rx = 0, rz = 0) => {
      if (n >= MAX_PARTS) return;
      const cs = Math.cos(t.rot), sn = Math.sin(t.rot), gy = g.stunts?.heightAt(t.x, t.z, 0) ?? 0;
      _o.position.set(t.x + lx * cs + lz * sn, gy + ly, t.z - lx * sn + lz * cs);
      _o.rotation.set(rx, t.rot + ry, rz);
      _o.scale.set(sx, sy, sz); _o.updateMatrix();
      this.parts.setMatrixAt(n, _o.matrix);
      _c.set(col); if (!t.spotted && t.state === 'armed' && t.kind !== 'bait') _c.lerp(SAND, 0.72); // half buried, the ground's colour
      this.parts.setColorAt(n, _c); n++;
    };
    for (const t of this.list) {
      const s = t.state, armed = s === 'armed';
      if (s === 'disarmed') { put(t, 0, 0.04, 0, 0.9, 0.06, 0.08, WOOD, 0.4); put(t, 0.2, 0.04, 0.2, 0.6, 0.05, 0.06, WOOD, -0.8); continue; }
      switch (t.kind) {
        case 'snare':
          put(t, -0.45, armed ? 0.45 : 0.55, 0, 0.07, 0.95, 0.07, WOOD, 0, 0, armed ? 0.5 : 0.05); // the bent sapling
          if (armed) for (const [x, z, w, d] of [[0, -0.22, 0.46, 0.03], [0, 0.22, 0.46, 0.03], [-0.22, 0, 0.03, 0.46], [0.22, 0, 0.03, 0.46]]) put(t, x, 0.03, z, w, 0.025, d, WIRE);
          else put(t, -0.45, 0.95, 0, 0.03, 0.5, 0.03, WIRE);
          put(t, 0.35, 0.08, 0, 0.06, 0.16, 0.06, WOOD); // the peg
          break;
        case 'deadfall':
          put(t, -0.8, 0.65, 0, 0.12, 1.3, 0.12, WOOD); put(t, 0.8, 0.65, 0, 0.12, 1.3, 0.12, WOOD);
          if (armed) { put(t, 0, 1.25, 0.1, 2.0, 0.32, 0.32, '#5a3e26', 0, 0.35); put(t, 0, 0.35, 0.1, 0.05, 0.7, 0.05, '#7a5a38', 0, 0, 0.3); }
          else put(t, 0, 0.17, 0, 2.0, 0.32, 0.32, '#5a3e26');
          put(t, 0, 0.04, -0.5, 0.5, 0.08, 0.4, DARK); // the stones it rests on
          break;
        case 'pit':
          if (armed) { put(t, 0, 0.03, 0, 1.7, 0.05, 1.7, '#8f7552'); put(t, 0.3, 0.06, -0.2, 1.1, 0.03, 0.12, '#6a5236', 0.3); }
          else { put(t, 0, 0.012, 0, 1.7, 0.01, 1.7, HOLE); for (const [x, z] of [[-0.5, -0.5], [0.5, -0.4], [-0.4, 0.5], [0.45, 0.45], [0, 0]]) put(t, x, 0.18, z, 0.06, 0.36, 0.06, BONE, 0, 0.2, -0.2); put(t, 1.2, 0.04, 0.2, 1.4, 0.05, 0.4, '#8f7552', 0.6); }
          break;
        case 'tripwire':
          put(t, -1.2, 0.2, 0, 0.06, 0.4, 0.06, WOOD); put(t, 1.2, 0.2, 0, 0.06, 0.4, 0.06, WOOD);
          if (armed) { put(t, 0, 0.28, 0, 2.4, 0.015, 0.015, WIRE); for (let k = 0; k < 3; k++) put(t, 1.1 + k * 0.08, 0.2 - k * 0.04, 0.12, 0.08, 0.12, 0.08, CAN); }
          else { put(t, 0.5, 0.02, 0.15, 1.4, 0.012, 0.012, WIRE, 0.3); for (let k = 0; k < 3; k++) put(t, 1.3 + k * 0.2, 0.04, 0.3 + k * 0.1, 0.08, 0.08, 0.12, CAN, k); }
          break;
        case 'bait':
          if (armed) { put(t, 0, 0.18, 0, 0.55, 0.36, 0.4, CLOTH, 0.3); put(t, 0.05, 0.4, 0, 0.3, 0.1, 0.25, '#5a4a32', 0.3); put(t, 0.35, 0.05, 0.2, 0.2, 0.1, 0.12, BONE, 1.1); }
          else put(t, 0, 0.04, 0, 0.5, 0.06, 0.4, CLOTH, 0.3);
          break;
      }
      if (t.spotted && armed && nr < MAX_RINGS) {
        const gy = g.stunts?.heightAt(t.x, t.z, 0) ?? 0;
        _o.position.set(t.x, gy + 0.06, t.z); _o.rotation.set(0, 0, 0); _o.scale.setScalar(t.kind === 'tripwire' ? 1.6 : 1.1); _o.updateMatrix();
        this.rings.setMatrixAt(nr++, _o.matrix);
      }
    }
    this.parts.count = n; this.rings.count = nr;
    this.parts.instanceMatrix.needsUpdate = true; if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
    this.rings.instanceMatrix.needsUpdate = true;
  }

  view(t) {
    const P = this.g.player;
    return { id: t.id, kind: t.kind, owner: t.owner, state: t.state, spotted: t.spotted, x: +t.x.toFixed(1), z: +t.z.toFixed(1), d: +Math.hypot(t.x - P.x, t.z - P.z).toFixed(1), spotRange: +this.spotRange(t).toFixed(2) };
  }
  save() { return { xp: this.xp, seq: this.seq, list: this.list.map((t) => ({ id: t.id, kind: t.kind, x: t.x, z: t.z, rot: t.rot, owner: t.owner, state: t.state, spotted: t.spotted, seed: t.seed, relayAt: t.relayAt })) }; }
  load(s) {
    if (!s) return;
    this.xp = s.xp ?? 0; this.seq = s.seq ?? this.seq; this.holds = [];
    this.list = (s.list ?? []).map((t) => ({ look: 0, by: null, at: 0, tries: 0, relayAt: 0, ...t }));
    this.dirty = true;
  }
}
