import { MELEE as LEGACY } from '../data/arms.js';
import { MELEE_WEAPONS as MW, MELEE_RULES as R, MELEE_AI as MAI, WEAPON_IDS } from '../data/melee.js';
import { angleLerp } from '../engine/rng.js';

// HAND TO HAND (docs/design/WEB_MELEE.md; the rows are data/melee.js). Fast, readable, lethal, and the same for everyone:
// the player and every NPC swing, block, parry, grab and struggle through one resolver (law 1: nobody cheats; an NPC only
// knows a blow is coming when it could see the wind-up, after its reaction time).
//
// Two ways to fight:
//   THE GUN IN HAND (lowered or raised): the old verbs (WEB_CONTROLLER.md §3.6) - RMB / R3 tap strikes (the gun's butt when
//     it is up, the knife you carry, fists), held and let go it is a kick, sprinting into it a shoulder shove.
//   FISTS UP (holstered, or no gun): PUNCH (LMB / RT: combo jabs; held and let go, a heavy - a kick with bare hands),
//     BLOCK (hold RMB / LT; raised right as a blow lands it is a PARRY that opens the attacker), GRAB (G / X: from behind
//     and unseen, the neck - a hostage, a choke; from the front a clinch). What is in your hand is whatever melee weapon
//     you carry (0 / RB tap cycles): knuckles, a knife, a machete, a bat, a crowbar, a pipe, a sledge.
// Every blow: a wind-up you can SEE (the pose draws back the whole time), a moment of contact (the damage lands then),
// a recovery. A blocked bat still hurts the arm; a blade blocked bare cuts it; a parried swing leaves the swinger open.
// A downed body can be finished. Hits push bodies (an impulse that slides them; a slide into something solid trips them).
//
//   update(dt)       per frame (main.js, after the player): the player's buttons, then every fight in flight
//   swing(kind)      the legacy verbs (fists | butt | knife | kick | shove) and the `melee` command
//   attack(c, o)     anyone: { heavy, kind: 'light' | 'heavy' | 'finish' }; grab(c), block(c, on)
//   think(c, dt)     ai.js: an NPC with a melee weapon and no gun fights by these rules
//   busy(c, dt)      ai.js: held, staggered, mid-blow or holding someone: the melee system moves them this frame

// The legacy kinds, folded into the row shape (data/arms.js MELEE: unchanged numbers).
const LEG = {};
for (const k of ['fists', 'butt', 'knife', 'kick', 'shove']) {
  const K = LEGACY[k];
  LEG[k] = { name: K.name, kind: K.bleed ? 'blade' : 'blunt', hands: 1, dmg: K.dmg, windup: K.windup, recover: K.recover, reach: K.reach, arc: K.arc, stamina: K.stamina, noise: K.noise,
    knock: [K.knock > 0 ? 1 : 0, K.knock], push: K.push, bleed: K.bleed ?? 0, bone: k === 'kick' ? 0.05 : 0, sever: 0,
    aim: { head: 0.35, torso: 0.45, arms: 0.2, legs: 0 }, parts: { head: 1, torso: 1, arms: 1, legs: 1 }, heavy: { mul: 1, wind: 1, knockAdd: 0, sta: 1 }, block: { soak: 0.6, arm: 1 }, dur: null, finish: 34, legacy: true };
}
const DEG = Math.PI / 180;
const PARTS = ['head', 'torso', 'arms', 'legs'];

// One record per person who ever fights (made once, reused).
function rec(c) {
  return c.m ?? (c.m = { act: null, guard: false, guardT0: -9, guardAt: -1, guardOff: -1, arm: 0, armBroken: false, stagT: 0, openT: 0, vx: 0, vz: 0,
    held: null, dur: {}, sta: 1, hold: null, heldBy: null, chain: 0, chainT: -9, effort: 0.7, effortT: 0, plan: null, planT: 0, aiT: 0, boneHits: 0, lastBy: null });
}

export class Melee {
  constructor(game) {
    this.g = game;
    this.act = null;          // the player's blow in flight (the legacy API: arms.js and the old checks read it)
    this.ready = false;       // the legacy button is down, deciding strike or kick
    this.atkReady = false;    // fists up: PUNCH is down, deciding light or heavy
    this.chain = 0; this.chainT = -9;
    this.live = [];           // everyone with a fight in flight (acts, slides, guards, holds)
    this.holds = [];          // { a, v, mode: 'neck' | 'clinch', t, bar, choke, shield }
    this.mash = 0; this.mashT = 0; this.mashRate = 0; // the player's presses / s in a struggle
    this.grabHeldT = 0;
    this.counts = { swings: 0, hits: 0, kills: 0, knockdowns: 0, whiffs: 0, combos: 0, blocked: 0, parried: 0, bones: 0, severed: 0, finishers: 0, grabs: 0, neck: 0, clinch: 0,
      choked: 0, hostages: 0, broke: 0, struggles: 0, released: 0, broken: 0, trips: 0, npcBlocks: 0, npcParries: 0, npcGrabs: 0, heldFire: 0 };
    this.last = null; this.lastBlock = null; this.lastStruggle = null;
    this.on = true;
    this.plate(); this.plateT = 0;
  }

  // The HUD plate (data/hudlayout.js row `melee`): what is in your hand and its wear, the guard, the arm, a struggle.
  plate() {
    this.plateEl = null; this.plateKey = '';
    if (typeof document === 'undefined') return;
    const st = document.createElement('style');
    st.textContent = `.melee-plate{display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none;font:700 11px var(--display,system-ui);letter-spacing:.08em;color:var(--bone,#efe6d2)}
.melee-plate .mp-row{display:flex;gap:6px}.melee-plate span{padding:3px 8px;background:rgba(26,20,14,.82);border:1px solid #5a4226;border-radius:3px}
.melee-plate span.hot{color:#ffb347;border-color:#8a5a1a}.melee-plate span.bad{color:#ff5a3a;border-color:#7a2a1a}.melee-plate span.ok{color:#d9f0a0}
.melee-plate .mp-bar{position:relative;width:240px;height:10px;background:rgba(26,20,14,.85);border:1px solid #5a4226;border-radius:3px;overflow:hidden}
.melee-plate .mp-bar i{position:absolute;top:0;bottom:0;left:50%;background:#e0a030}.melee-plate .mp-bar i.lose{background:#d83a2a}
.melee-plate .mp-bar b{position:absolute;top:-1px;bottom:-1px;left:50%;width:2px;background:#efe6d2}.melee-plate:empty{display:none}`;
    document.head.appendChild(st);
    this.plateEl = document.createElement('div'); this.plateEl.className = 'melee-plate';
    (document.getElementById('ui') ?? document.body).appendChild(this.plateEl);
  }
  refreshPlate(dt) {
    if (!this.plateEl || (this.plateT -= dt) > 0) return;
    this.plateT = 0.12;
    const p = this.g.player, m = p.m, H = m?.hold ?? m?.heldBy;
    let key = '';
    if (H) {
      const mine = H.a === p, bar = mine ? H.bar : -H.bar, w = Math.round(Math.abs(bar) * 50);
      const what = H.mode === 'neck' ? (mine ? (H.choke > 0 ? `CHOKING ${Math.round(H.choke * 100)}%` : H.shield ? 'HOSTAGE' : 'NECK HOLD') : 'GRABBED FROM BEHIND · MASH TO BREAK FREE') : 'CLINCH · MASH';
      key = `<div class="mp-row"><span class="${mine ? 'hot' : 'bad'}">${what}</span></div><div class="mp-bar"><i class="${bar < 0 ? 'lose' : ''}" style="${bar < 0 ? `left:${50 - w}%;` : ''}width:${w}%"></i><b></b></div>`;
    } else if (p.alive && this.fistsUp()) {
      const id = this.inHand(p), W = this.row(id), dur = W.dur ? Math.round(100 * (m?.dur?.[id] ?? W.dur) / W.dur) : null;
      const parts = [`<span>${W.name}${dur !== null ? ` ${dur}%` : ''}</span>`];
      if (m?.guard) parts.push('<span class="ok">GUARD</span>');
      if (m?.stagT > 0) parts.push('<span class="bad">STAGGERED</span>');
      if (m?.armBroken) parts.push('<span class="bad">ARM BROKEN</span>'); else if ((m?.arm ?? 0) >= R.arm.hp * R.arm.hurtAt) parts.push('<span class="hot">ARM HURT</span>');
      key = `<div class="mp-row">${parts.join('')}</div>`;
    }
    if (key !== this.plateKey) { this.plateKey = key; this.plateEl.innerHTML = key; }
  }

  // ---- what you hold -------------------------------------------------------------------------------------------------
  row(id) { return MW[id] ?? LEG[id] ?? MW.fists; }
  // Fists up: holstered, or no gun at all (the gun in hand keeps the old verbs).
  fistsUp() {
    const p = this.g.player;
    return this.on && p.alive && !p.inVehicle && !p.onTrain && (!p.weapon || this.g.arms?.stance === 'holstered');
  }
  carries(c, id) {
    const w = MW[id];
    if (!w) return false;
    if (!w.item) return true;
    if (c === this.g.player) return (this.g.inventory?.carried?.count?.(w.item) ?? 0) > 0;
    return c.meleeW === id || (c.meleeCarry?.includes?.(id) ?? false);
  }
  // What is in your hand when the fists are up (the player picks it; an NPC holds what it carries).
  inHand(c) {
    const m = c.m;
    if (c === this.g.player) {
      const id = m?.held;
      if (id && this.carries(c, id)) return id;
      if (m) m.held = null;
      return 'fists';
    }
    return c.meleeW && MW[c.meleeW] ? c.meleeW : 'fists';
  }
  // 0 / RB tap: the next thing you carry to fight with (fists always).
  cycleHeld(step = 1) {
    if (!this.fistsUp()) return false;
    const p = this.g.player, m = rec(p);
    const own = WEAPON_IDS.filter((id) => this.carries(p, id));
    const i = own.indexOf(this.inHand(p));
    m.held = own[(i + step + own.length) % own.length];
    if (m.held === 'fists') m.held = null;
    const W = this.row(this.inHand(p));
    this.g.hud?.toast?.(`IN HAND · ${W.name}`, 'info');
    this.g.emit('meleeHeld', { weapon: this.inHand(p) });
    return true;
  }
  wield(id) {
    const p = this.g.player, m = rec(p);
    if (id !== 'fists' && !this.carries(p, id)) return false;
    m.held = id === 'fists' ? null : id;
    return true;
  }
  moveMul() {
    const p = this.g.player, m = p.m;
    if (!m) return 1;
    return (m.guard ? R.block.moveMul : 1) * (m.hold ? R.grab.hold.moveMul : 1) * (m.stagT > 0 ? 0.3 : 1);
  }

  can(c = this.g.player) {
    const g = this.g;
    if (c === g.player) return c.alive && !c.inVehicle && !c.grabbing && !c.onTrain && !c.swim && !c.vault && !(c.knockT > 0) && !(c.dive > 0) && !g.dialogue.active && !g.invUI?.open && !g.survival?.sleep && !(c.m?.heldBy) && !(c.m?.stagT > 0);
    return c.alive && !c.inVehicle && !c.swim && !(c.knockT > 0) && !(c.m?.heldBy) && !(c.m?.stagT > 0);
  }

  strikeKind() {
    const g = this.g, A = g.arms;
    if (A?.stance === 'raised' && g.player.weapon) return 'butt';
    if (g.inventory?.carried?.count?.('knife') > 0) return 'knife';
    return 'fists';
  }

  enlist(c) { rec(c); if (!this.live.includes(c)) this.live.push(c); }

  // ---- per frame -----------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g, p = g.player;
    this.playerInput(dt);
    this.updateHolds(dt);
    for (let i = this.live.length - 1; i >= 0; i--) {
      const c = this.live[i], m = c.m;
      if (!c.alive || !g.chars.includes(c)) { if (m) { m.act = null; m.guard = false; } this.live.splice(i, 1); if (c === p) { this.act = null; p.meleeT = 0; } continue; }
      if (m.stagT > 0) m.stagT -= dt;
      if (m.openT > 0) m.openT -= dt;
      if (m.act) this.advance(c, dt);
      else if (c !== p) c.meleeT = 0;
      if (c !== p) this.npcGuard(c);
      if (m.vx || m.vz) this.slide(c, dt);
      if (c !== p) m.sta = Math.min(1, m.sta + dt * 0.12);
      if (!m.act && !m.guard && !m.hold && !m.heldBy && !(m.stagT > 0) && !m.vx && !m.vz && m.arm <= 0 && !(m.guardAt > 0) && c !== p) this.live.splice(i, 1);
      else if (m.arm > 0 && !m.act && !m.guard) m.arm = Math.max(0, m.arm - R.arm.heal * dt);
    }
    p.mGuard = !!p.m?.guard;
    this.refreshPlate(dt);
    const ih = this.fistsUp() ? this.inHand(p) : null;
    p.mProp = ih && MW[ih]?.model ? ih : null; // what the pose solver draws in the hand (systems/characters.js)
  }

  playerInput(dt) {
    const g = this.g, p = g.player, C = g.controls, I = g.input;
    const m = p.m;
    if (m?.heldBy) { this.victimInput(dt); return; }
    if (!this.can()) {
      if (this.act && !p.alive) this.act = null;
      if (m) m.guard = false;
      this.ready = false; this.atkReady = false;
      if (!this.act) p.meleeT = 0;
      return;
    }
    if (!C) return;
    // Holding someone: G tap lets go, G held chokes, PUNCH strikes the held (or fires the gun you hold one-handed).
    if (m?.hold) { this.holderInput(dt); return; }
    if (this.fistsUp()) {
      const pm = rec(p);
      // BLOCK: hold. The moment it goes up is what a parry is timed from.
      const blk = C.held('block') && !this.act;
      if (blk && !pm.guard) { pm.guard = true; pm.guardT0 = g.time; this.enlist(p); g.emit('guard', { id: p.id, up: true }); }
      else if (!blk && pm.guard) { pm.guard = false; }
      if (pm.guard) { this.ready = false; this.atkReady = false; return; }
      if (this.act) return;
      if (C.hit('grab') && !(I?.phys?.has?.('KeyG') && !I.hit('KeyG'))) { this.grab(p); return; } // G already spent (a burial, a car to hang on): not a grab
      // The pad's R3 kicks with the fists up (its old job); the mouse's RMB is the guard here.
      if (C.padHeld('melee') && C.hit('melee')) { this.swing(p.speed > 5.2 ? 'shove' : 'kick'); return; }
      if (C.hit('punch')) { if (p.speed > 5.2) { this.swing('shove'); return; } this.atkReady = true; }
      if (this.atkReady) {
        if (C.held('punch') && C.heldFor('punch') >= R.heavyAt) { this.atkReady = false; this.attack(p, { heavy: true }); }
        else if (!C.held('punch')) { this.atkReady = false; this.attack(p, { heavy: false }); }
      }
      return;
    }
    if (m) m.guard = false;
    if (this.act) return;
    if (C.hit('melee')) {
      if (p.speed > 5.2) { this.swing('shove'); return; }
      this.ready = true;
    }
    if (this.ready) {
      if (C.held('melee') && C.heldFor('melee') >= LEGACY.heavyAt) { this.ready = false; this.swing('kick'); }
      else if (!C.held('melee')) { this.ready = false; this.swing(this.strikeKind()); }
    }
  }

  // ---- the blow ------------------------------------------------------------------------------------------------------
  // The legacy verbs (the gun in hand, the `melee` command): the player only.
  swing(kind) {
    const g = this.g, p = g.player;
    if (!LEG[kind] || this.act || !this.can()) return null;
    return this.begin(p, kind, LEG[kind], false, kind);
  }

  // Anyone. o.heavy: the held swing; o.kind 'finish' forces the finisher (a downed body in reach makes it one anyway).
  attack(c, o = {}) {
    const g = this.g, m = rec(c);
    if (m.act || !this.can(c)) return null;
    const wid = this.inHand(c), W = this.row(wid);
    const downed = this.downedInReach(c, R.finish.reach);
    if (o.kind === 'finish' || (downed && !this.standingInReach(c, W.reach))) return this.begin(c, 'finish', W, false, wid, downed);
    if (wid === 'fists' && o.heavy) return this.begin(c, 'kick', LEG.kick, false, 'kick');
    return this.begin(c, o.heavy ? 'heavy' : 'light', W, !!o.heavy, wid);
  }

  begin(c, kind, W, heavy, wid, target = null) {
    const g = this.g, m = rec(c), P = c === g.player;
    const sta = (kind === 'finish' ? R.finish.stamina : W.stamina * (heavy ? W.heavy.sta : 1)) * (P ? g.arms?.sprintDrain?.() ?? 1 : 1);
    const have = P ? p0(c.stamina) : m.sta;
    const weak = have < sta;
    if (P) c.stamina = Math.max(0, have - sta); else m.sta = Math.max(0, have - sta);
    let wind = kind === 'finish' ? R.finish.windup : W.windup * (heavy ? W.heavy.wind : 1);
    let rcv = kind === 'finish' ? R.finish.recover : W.recover;
    if (weak) { wind *= 1.4; rcv *= 1.4; }
    const a = { kind, wid, heavy, t: 0, landed: false, weak, windup: wind, total: wind + rcv, target, W };
    m.act = a;
    if (P) { this.act = a; c.reloading = 0; c.clearing = false; }
    // Step into it.
    const t = { x: c.x + Math.sin(c.face) * LEGACY.lunge, z: c.z + Math.cos(c.face) * LEGACY.lunge };
    g.statics.resolveBody(t, c.radius ?? 0.45, c);
    c.x = t.x; c.z = t.z;
    this.enlist(c);
    this.counts.swings++;
    if (P || Math.abs(c.x - g.player.x) + Math.abs(c.z - g.player.z) < 30) g.audio?.throwWhoosh?.(g.pan?.(c.x) ?? 0);
    g.emit('meleeSwing', { kind, weapon: wid, heavy, weak, by: c.id, windup: +wind.toFixed(2) });
    this.warnNear(c, a);
    return a;
  }

  advance(c, dt) {
    const g = this.g, m = c.m, a = m.act;
    a.t += dt;
    c.meleeT = Math.min(1, a.t / a.total); c.meleeKind = a.kind === 'light' || a.kind === 'heavy' || a.kind === 'finish' ? (MW[a.wid]?.model ? a.wid : a.kind === 'finish' ? 'stomp' : 'fists') : a.kind; c.meleeHit = a.windup / a.total;
    c.meleeWid = a.wid; c.meleeHeavy = a.heavy;
    if (!a.landed && a.t >= a.windup) this.land(c, a);
    if (a.t >= a.total) { m.act = null; c.meleeT = 0; if (c === g.player) this.act = null; }
  }

  // ---- who is in reach -----------------------------------------------------------------------------------------------
  inArc(c, o, reach, arc) {
    const dx = o.x - c.x, dz = o.z - c.z;
    if (Math.abs(dx) > 3 || Math.abs(dz) > 3) return -1;
    const d = Math.hypot(dx, dz);
    if (d > reach + (o.radius ?? 0.45)) return -1;
    if (d > 0.2) { const cs = (dx * Math.sin(c.face) + dz * Math.cos(c.face)) / d; if (Math.acos(Math.max(-1, Math.min(1, cs))) > arc) return -1; }
    return d;
  }
  ok(c, o) {
    const g = this.g;
    return o !== c && o.alive && !o.inVehicle && !o.hidden && !o.underwater && g.storeys.sameFloor(c, o) && g.statics.lineOfSight(c.x, c.z, o.x, o.z, undefined, c.ug ? (c.gy ?? 0) + 1.2 : -1);
  }
  downedInReach(c, reach) {
    let best = null, bd = Infinity;
    for (const o of this.g.chars) {
      if (!(o.knockT > 0) || o === c.m?.hold?.v || !o.alive) continue;
      if (c !== this.g.player && !this.g.ai.hostile(c, o) && o !== c.target) continue;
      const d = this.inArc(c, o, reach, 1.1);
      if (d >= 0 && d < bd && this.ok(c, o)) { bd = d; best = o; }
    }
    return best;
  }
  standingInReach(c, reach) {
    for (const o of this.g.chars) {
      if (o.knockT > 0 || o === c.m?.hold?.v || o === c) continue;
      if (o.alive && this.inArc(c, o, reach, 0.9) >= 0 && this.ok(c, o)) return true;
    }
    return false;
  }
  pick(c, W, a) {
    const g = this.g;
    if (a.target && a.target.alive && this.inArc(c, a.target, Math.max(W.reach, R.finish.reach), 1.2) >= 0 && this.ok(c, a.target)) return a.target;
    let best = null, bd = Infinity;
    for (const o of g.chars) {
      if (o === c || o === c.m?.hold?.v) continue;
      const d = this.inArc(c, o, W.reach, W.arc);
      if (d < 0 || d >= bd || !this.ok(c, o)) continue;
      if (c !== g.player && o !== c.target && !g.ai.hostile(c, o)) continue; // an NPC swings at whom it fights
      bd = d; best = o;
    }
    return best;
  }

  // ---- the moment of contact -----------------------------------------------------------------------------------------
  land(c, a) {
    const g = this.g, P = g.player, W = a.W;
    a.landed = true;
    const T = this.pick(c, W, a);
    g.noise(c.x, c.z, a.kind === 'finish' ? R.finish.noise : W.noise, c);
    if (!T) { this.counts.whiffs++; if (c === P) this.last = { kind: a.kind, weapon: a.wid, hit: null }; g.emit('melee', { kind: a.kind, weapon: a.wid, by: c.id, hit: null }); return; }
    const dl = Math.max(0.01, Math.hypot(T.x - c.x, T.z - c.z)), ux = (T.x - c.x) / dl, uz = (T.z - c.z) / dl;
    const tm = rec(T), cm = c.m;
    // The chain: the hands' strikes inside the window; the third lands harder and puts them down.
    const strike = a.kind === 'fists' || a.kind === 'butt' || a.kind === 'knife' || (a.kind === 'light' && (a.wid === 'fists' || a.wid === 'knuckles' || a.wid === 'knife'));
    cm.chain = strike && g.time - cm.chainT < R.combo.window ? cm.chain + 1 : strike ? 1 : 0;
    cm.chainT = g.time;
    const combo = strike && cm.chain >= R.combo.at;
    if (combo) { cm.chain = 0; this.counts.combos++; }
    if (c === P) { this.chain = cm.chain; this.chainT = cm.chainT; }
    const lvl = c === P ? g.skillsSys?.lv?.strength ?? 0 : c.npc?.strength ?? (c.faction === 'raider' || c.faction === 'soldier' ? 3 : 1);
    const str = 1 + 0.05 * lvl;
    let dmg = W.dmg * (a.heavy ? W.heavy.mul : 1) * (a.weak ? 0.5 : 1) * (combo ? R.combo.mul : 1) * str * (c === P ? g.deep?.fx.meleeMul ?? 1 : 1) * (cm.armBroken ? R.arm.brokenDmg : 1);
    if (tm.openT > 0) dmg *= R.parry.openMul;
    // ---- the guard: is T facing this blow with its guard up? ----
    const facing = Math.abs(wrap(Math.atan2(c.x - T.x, c.z - T.z) - T.face)) <= R.block.arcDeg * DEG;
    if (a.kind !== 'finish' && tm.guard && facing && !(tm.stagT > 0) && !(T.knockT > 0)) {
      const since = g.time - tm.guardT0;
      if (since <= R.parry.window) return this.parried(c, T, a, since);
      return this.blocked(c, T, a, dmg, ux, uz, combo);
    }
    // ---- a clean hit ----
    let part;
    if (a.kind === 'finish') { part = 'head'; dmg = W.finish * str * (a.weak ? 0.6 : 1) * (c === P ? g.deep?.fx.meleeMul ?? 1 : 1); this.counts.finishers++; }
    else part = W.legacy ? null : rollPart(W.aim);
    if (part) dmg *= W.parts[part];
    const hp0 = T.hp, cause = W.kind === 'blade' ? 'blade' : 'bash', god = T === P && (g.godMode || T.graceT > 0); // invulnerable: no knockdown, no bones, no limbs either
    g.combat.damage(T, dmg, c, ux, uz, cause, part ?? null);
    if (W.bleed) T.bleed = Math.min(1, (T.bleed ?? 0) + W.bleed * (a.heavy ? 1.4 : 1));
    if (T === P && W.kind === 'blade' && dmg >= 8 && Math.random() < 0.7) g.survival?.wound?.('laceration');
    // Knocked down: the chance, a head hit doubles it, a heavy adds; the combo always does. The infected shrug it off quicker.
    let kc = W.knock[0] * (part === 'head' ? 2 : 1) + (a.heavy ? W.heavy.knockAdd : 0);
    if (combo) kc = 1;
    let knock = 0;
    if (T.alive && !god && a.kind !== 'finish' && Math.random() < kc) {
      knock = (combo ? Math.max(W.knock[1], 0.9) : W.knock[1] * (a.heavy ? 1.3 : 1)) * (T.faction === 'zombie' ? R.infectedKnock : 1) * (a.weak ? 0.5 : 1);
      if (knock > 0) this.knockDown(T, knock);
    }
    // A blunt blow on an arm or a leg breaks it.
    let bone = null;
    if (T.alive && !god && W.kind === 'blunt' && (part === 'arms' || part === 'legs') && Math.random() < W.bone * (a.heavy ? 1.5 : 1)) bone = this.breakBone(T, part, c);
    // A heavy blade on a limb (or the neck of a body it just killed) takes it off.
    let severed = null;
    if (!god && W.kind === 'blade' && W.sever > 0 && (part === 'arms' || part === 'legs' || (part === 'head' && !T.alive)) && (a.heavy || dmg >= 40 || !T.alive) && Math.random() < W.sever * (a.heavy ? 1.5 : 1)) severed = this.sever(T, part, ux, uz);
    // The body takes the blow: an impulse along the line of it (systems: a slide that can trip them on furniture).
    const push = (a.kind === 'finish' ? 0.1 : W.push) * (a.heavy ? 1.4 : 1) * (T.faction === 'zombie' ? 0.8 : 1);
    if (T.alive && push > 0) { tm.vx += ux * push / R.body.slide; tm.vz += uz * push / R.body.slide; this.enlist(T); }
    // Blood where it belongs: on the wall behind, under them.
    if (dmg >= 18) g.blood?.splash?.(T, ux, uz, dmg, !T.alive);
    if (dmg >= 12) g.fx.decal(T.x + ux * 0.4, T.z + uz * 0.4, 0.2 + Math.min(0.5, dmg / 120), '#5a0606', undefined, g.fx.onFloor?.(T));
    g.fx.sparks?.(T.x, 1.3 + (T.gy ?? 0), T.z, -ux, -uz, 2);
    this.feel(c, T, a.heavy || combo || a.kind === 'kick' || a.kind === 'finish' ? 'heavy' : 'light', bone);
    if (c === P) { g.controls?.rumble('melee'); g.skillsSys?.gain?.('strength', 0.6); }
    this.wear(c, a.wid, a.heavy ? 2 : 1);
    this.counts.hits++;
    if (!T.alive) this.counts.kills++;
    tm.lastBy = c;
    const out = { kind: a.kind, weapon: a.wid, by: c.id, hit: T.id, part, dmg: +dmg.toFixed(1), hp: [Math.round(hp0), Math.round(T.hp)], knock: +knock.toFixed(2), combo, bone, severed, heavy: a.heavy, killed: !T.alive, blocked: false };
    if (c === P || T === P) this.last = out;
    g.emit('melee', { ...out, faction: T.faction });
  }

  parried(c, T, a, since) {
    const g = this.g, cm = c.m, tm = T.m;
    cm.stagT = R.parry.stagger; cm.openT = R.parry.stagger + 0.4; cm.chain = 0;
    if (cm.act === a) { a.t = Math.max(a.t, a.windup); } // the blow is spent
    const back = { x: c.x - Math.sin(c.face) * 0.35, z: c.z - Math.cos(c.face) * 0.35 };
    g.statics.resolveBody(back, c.radius ?? 0.45, c); c.x = back.x; c.z = back.z;
    if (T !== g.player) tm.sta = Math.max(0, tm.sta - R.parry.stamina); else T.stamina = Math.max(0, p0(T.stamina) - R.parry.stamina);
    this.counts.parried++; if (T !== g.player) this.counts.npcParries++;
    if (!g.audio?.sample?.('common', 'impact.metal', { x: T.x, z: T.z, range: 45, rate: 1.2 })) g.audio?.burst?.({ dur: 0.09, freq: 3200, type: 'bandpass', q: 6, vol: 0.3, decay: 0.08, pitchDrop: 0.5 }); // a parry: steel on steel, recorded
    g.fx.sparks?.((c.x + T.x) / 2, 1.4, (c.z + T.z) / 2, 0, 0, 6);
    this.feel(c, T, 'parry');
    const out = { kind: a.kind, weapon: a.wid, by: c.id, hit: T.id, parried: true, since: +since.toFixed(3), dmg: 0, stagger: R.parry.stagger };
    this.lastBlock = out; if (c === g.player || T === g.player) this.last = out;
    g.emit('parry', out);
  }

  blocked(c, T, a, dmg, ux, uz, combo) {
    const g = this.g, W = a.W, tm = T.m, P = g.player;
    const bid = T === P ? (this.fistsUp() ? this.inHand(T) : 'fists') : this.inHand(T), B = this.row(bid), bare = !B.model || bid === 'knuckles';
    let soak = B.block.soak;
    if (W.kind === 'blade' && bare) soak *= R.block.vsBladeBare;
    if (tm.arm >= R.arm.hp * R.arm.hurtAt) soak *= R.arm.hurtSoak;
    if (tm.armBroken) soak *= R.arm.brokenSoak;
    const through = dmg * (1 - soak), armDmg = through * B.block.arm + (bare ? dmg * soak * 0.25 : 0);
    tm.arm += armDmg;
    let bone = null;
    if (!(T === P && g.godMode) && W.kind === 'blunt' && bare && !tm.armBroken && (tm.arm >= R.arm.hp * R.arm.breakAt || Math.random() < W.bone * R.block.boneBare * (a.heavy ? 1.5 : 1))) bone = this.breakBone(T, 'arms', c);
    g.combat.damage(T, through, c, ux, uz, W.kind === 'blade' ? 'blade' : 'bash', 'arms');
    if (W.kind === 'blade' && bare) { T.bleed = Math.min(1, (T.bleed ?? 0) + W.bleed * R.block.cutBare * 0.5); if (T === P && Math.random() < 0.6) g.survival?.wound?.('laceration'); }
    // The guard costs the bar; empty, it breaks.
    const cost = R.block.staminaPerHit * (dmg / 25);
    let broke = false;
    if (T === P) { T.stamina = Math.max(0, p0(T.stamina) - cost); broke = T.stamina <= 0; }
    else { tm.sta = Math.max(0, tm.sta - cost); broke = tm.sta <= 0; }
    tm.stagT = Math.max(tm.stagT, broke ? R.block.guardBreakStagger : R.block.blockedStagger * (a.heavy ? 2 : 1));
    if (broke) { tm.guard = false; g.emit('guardBroken', { id: T.id }); }
    if (!bare) this.wear(T, bid, 1);
    const push = W.push * 0.35 * (a.heavy ? 1.4 : 1);
    if (T.alive && push > 0) { tm.vx += ux * push / R.body.slide; tm.vz += uz * push / R.body.slide; }
    this.wear(c, a.wid, 1);
    this.counts.blocked++; if (T !== P) this.counts.npcBlocks++;
    g.audio?.thud?.(g.pan?.(T.x) ?? 0);
    this.feel(c, T, a.heavy ? 'heavy' : 'light', bone);
    const out = { kind: a.kind, weapon: a.wid, by: c.id, hit: T.id, blocked: true, with: bid, part: 'arms', dmg: +through.toFixed(1), full: +dmg.toFixed(1), arm: +tm.arm.toFixed(1), bone, broke, heavy: a.heavy, killed: !T.alive, combo };
    this.lastBlock = out; if (c === P || T === P) this.last = out;
    g.emit('melee', { ...out, faction: T.faction });
  }

  knockDown(T, s) {
    T.knockT = Math.max(T.knockT ?? 0, s); T.knockMax = Math.max(T.knockMax ?? 0, T.knockT); T.speed = 0; T.aiming = false;
    if (T.m) { T.m.guard = false; if (T.m.act) { T.m.act = null; T.meleeT = 0; if (T === this.g.player) this.act = null; } }
    if (T.m?.hold) this.release(T.m.hold, 'knocked');
    this.counts.knockdowns++;
    this.g.emit('knockdown', { id: T.id, secs: +s.toFixed(2) });
  }
  breakBone(T, part, by) {
    const g = this.g, m = rec(T);
    m.boneHits++;
    if (part === 'arms') { m.armBroken = true; m.arm = Math.max(m.arm, R.arm.hp); }
    else m.legBroken = true;
    if (T === g.player) g.survival?.wound?.('fracture');
    this.counts.bones++;
    if (!g.audio?.sample?.('common', 'impact.flesh', { x: T.x, z: T.z, range: 45, rate: 0.8, vol: 1.3 })) { // a bone going: the recorded hit, lower and harder
      g.audio?.burst?.({ dur: 0.06, freq: 2600, type: 'highpass', q: 2, vol: 0.4, decay: 0.05, pitchDrop: 0.3, pan: g.pan?.(T.x) ?? 0 });
      g.audio?.burst?.({ dur: 0.05, freq: 1400, type: 'bandpass', q: 4, vol: 0.3, decay: 0.04, at: 0.03, pan: g.pan?.(T.x) ?? 0 });
    }
    g.emit('boneBreak', { id: T.id, part, by: by?.id ?? null });
    return part;
  }
  // A limb off (the death library reads `lost`; the pose solver hides what is gone). A head: only on a body that is done.
  sever(T, part, ux, uz) {
    const g = this.g, m = rec(T);
    let side = null;
    if (part === 'head') { T.headless = true; T.neckSpray = 2.5; side = 'head'; }
    else {
      const L = T.lost ?? (T.lost = { larm: false, rarm: false, lleg: false, rleg: false });
      const key = part === 'arms' ? (Math.random() < 0.5 ? 'larm' : 'rarm') : (Math.random() < 0.5 ? 'lleg' : 'rleg');
      if (L[key]) return null;
      L[key] = true; side = key;
      if (part === 'arms') { m.armBroken = true; T.lostArm = key; }
      else { m.legBroken = true; T.lostLeg = key; if (T.alive) this.knockDown(T, 4); }
      T.bleed = 1;
    }
    for (let k = 0; k < 3; k++) g.fx.bloodSpray?.(T.x, 1.1 + (T.gy ?? 0), T.z, ux, uz, 14, 1.4);
    g.fx.decal(T.x + ux * 0.9, T.z + uz * 0.9, 0.7, '#4a0404', undefined, g.fx.onFloor?.(T));
    this.counts.severed++;
    g.emit('limbOff', { id: T.id, part: side });
    return side;
  }

  feel(c, T, how, bone = null) {
    const g = this.g, P = g.player;
    if (c !== P && T !== P) return;
    const F = R.feel;
    const ms = how === 'parry' ? F.stopParry : bone ? F.stopBone : how === 'heavy' ? F.stopHeavy : F.stopLight;
    if (ms > 0) g.look?.stop?.(ms, `melee ${how}`);
    g.hud.shake(how === 'light' ? F.shakeLight : F.shakeHeavy);
    if (g.look?.kick && T) { const k = (how === 'light' ? 0.08 : 0.2) * (g.look.settings?.kick ?? 1), d = Math.hypot(T.x - c.x, T.z - c.z) || 1; g.look.kick.x += ((T.x - c.x) / d) * k; g.look.kick.z += ((T.z - c.z) / d) * k; }
  }

  // Each hit wears the weapon; at 0 it breaks in your hands.
  wear(c, wid, n) {
    const W = MW[wid];
    if (!W || !W.dur) return;
    const m = rec(c);
    m.dur[wid] = (m.dur[wid] ?? W.dur) - n;
    if (m.dur[wid] > 0) return;
    const g = this.g;
    m.dur[wid] = W.dur;
    this.counts.broken++;
    if (c === g.player) {
      const box = g.inventory.carried, i = box.slots.findIndex((s) => s.id === W.item);
      if (i >= 0) g.inventory.take(box, i, 1);
      if (m.held === wid) m.held = null;
      g.hud?.toast?.(`${W.name} BROKE`, 'warn');
    } else if (c.meleeW === wid) c.meleeW = null;
    g.emit('meleeBroke', { id: c.id, weapon: wid });
  }

  // A hit's slide (an impulse that decays). Slammed into something solid fast enough: they go over it.
  slide(c, dt) {
    const g = this.g, m = c.m;
    const sp = Math.hypot(m.vx, m.vz);
    if (sp < 0.05 || m.heldBy) { m.vx = 0; m.vz = 0; return; }
    const want = { x: c.x + m.vx * dt, z: c.z + m.vz * dt };
    const t = { x: want.x, z: want.z };
    g.statics.resolveBody(t, c.radius ?? 0.45, c);
    const blocked = Math.hypot(t.x - want.x, t.z - want.z) > Math.max(0.01, sp * dt * 0.5);
    if (c.faction === 'zombie' && g.ai.wades?.(c, t.x, t.z)) { t.x = c.x; t.z = c.z; }
    c.x = t.x; c.z = t.z;
    if (blocked && sp >= R.body.tripSpeed && c.alive && !(c.knockT > 0)) { this.knockDown(c, R.body.tripKnock); this.counts.trips++; g.emit('tripped', { id: c.id, speed: +sp.toFixed(2) }); }
    const k = Math.exp(-dt / (R.body.slide * 0.45));
    m.vx *= k; m.vz *= k;
    if (blocked) { m.vx *= 0.3; m.vz *= 0.3; }
    if (Math.abs(m.vx) + Math.abs(m.vz) < 0.08) { m.vx = 0; m.vz = 0; }
  }

  // An NPC watching a blow come at it decides (after its reaction time) to raise a guard, sometimes timed into a parry.
  warnNear(c, a) {
    const g = this.g;
    if (a.kind === 'finish') return;
    for (const o of g.chars) {
      if (o === c || o === g.player || !o.alive || o.inVehicle || o.knockT > 0 || o.faction === 'zombie' || o.fauna || o.noGuard) continue; // noGuard: a test dummy
      if (Math.abs(o.x - c.x) > 3 || Math.abs(o.z - c.z) > 3) continue;
      if (this.inArc(c, o, a.W.reach + 0.4, a.W.arc + 0.2) < 0) continue;
      // It can only answer what it can see: c in front of it, in its sight.
      if (Math.abs(wrap(Math.atan2(c.x - o.x, c.z - o.z) - o.face)) > 100 * DEG || !this.g.sees(o, c)) continue;
      // Only someone already in it with c guards (a bystander's first punch lands): fighting c, wronged by c, hostile to c.
      if (o.target !== c && o.grudge !== c && o.m?.lastBy !== c && !g.ai.hostile(o, c)) continue;
      const AI = MAI[o.faction] ?? MAI.default, om = rec(o);
      if (om.stagT > 0 || om.act || om.heldBy || om.hold) continue;
      const contact = g.time + (a.windup - a.t);
      const readAt = g.time + AI.react * (o.m?.sta < 0.2 ? 1.5 : 1);
      if (readAt > contact - 0.02) continue;      // too quick to read
      if (Math.random() >= AI.block) continue;
      // A parry raises the guard just inside the window; a plain block as soon as it is read.
      const parry = Math.random() < AI.parry;
      om.guardAt = parry ? Math.max(readAt, contact - R.parry.window * 0.5) : readAt;
      om.guardOff = contact + 0.35;
      om.guardBy = c;
      this.enlist(o);
    }
  }
  npcGuard(c) {
    const g = this.g, m = c.m;
    if (m.guardAt > 0 && g.time >= m.guardAt && !m.guard && !(m.stagT > 0) && !(c.knockT > 0)) {
      m.guard = true; m.guardT0 = g.time; m.guardAt = -1;
      if (m.guardBy) c.face = Math.atan2(m.guardBy.x - c.x, m.guardBy.z - c.z);
    }
    if (m.guard && (g.time >= m.guardOff || m.stagT > 0 || c.knockT > 0)) { m.guard = false; m.guardBy = null; }
    if (m.guard && m.guardBy) c.face = angleLerp(c.face, Math.atan2(m.guardBy.x - c.x, m.guardBy.z - c.z), 0.3);
  }

  // ---- the grab ------------------------------------------------------------------------------------------------------
  // Unseen from behind: the neck (a hostage, a choke). From the front: a clinch (a short struggle; the winner throws).
  grab(c, T = null) {
    const g = this.g, m = rec(c);
    if (m.act || m.hold || !this.can(c)) return null;
    if (!T) {
      let bd = Infinity;
      for (const o of g.chars) {
        if (o === c || !o.alive || o.inVehicle || o.hidden || o.knockT > 0 || o.m?.heldBy || o.fauna || o.faction === 'zombie' && c === g.player && false) continue;
        const d = this.inArc(c, o, R.grab.reach, 1.0);
        if (d >= 0 && d < bd && this.ok(c, o)) { bd = d; T = o; }
      }
    }
    m.act = null;
    c.meleeT = 0;
    if (!T) { this.counts.whiffs++; g.emit('grab', { by: c.id, hit: null }); return { hit: null }; }
    const behind = Math.abs(wrap(Math.atan2(c.x - T.x, c.z - T.z) - T.face)) > R.grab.behindDeg * DEG;
    const aware = this.aware(T, c);
    const mode = behind && !aware ? 'neck' : 'clinch';
    const H = { a: c, v: T, mode, t: 0, bar: mode === 'neck' ? R.struggle.neckStart : 0, choke: 0, shield: false, why: null, effort: [0.7, 0.7] };
    m.hold = H; rec(T).heldBy = H;
    T.m.guard = false; if (T.m.act) { T.m.act = null; T.meleeT = 0; if (T === g.player) this.act = null; }
    T.speed = 0; T.aiming = false;
    if (T === g.player) g.arms?.lower?.('grabbed');
    this.holds.push(H); this.enlist(c); this.enlist(T);
    this.counts.grabs++; this.counts[mode]++; if (c !== g.player) this.counts.npcGrabs++;
    if (c !== g.player && T !== g.player) { /* npc on npc */ }
    c.stamina = c === g.player ? Math.max(0, p0(c.stamina) - R.grab.stamina) : c.stamina;
    g.noise(c.x, c.z, mode === 'neck' ? 2 : 5, c);
    g.audio?.thud?.(g.pan?.(c.x) ?? 0);
    if (mode === 'neck') this.feel(c, T, 'light');
    if (T !== g.player) g.ai.onDamaged?.(T, c, true);
    g.emit('grab', { by: c.id, hit: T.id, mode, behind, aware });
    if (c === g.player) g.hud?.toast?.(mode === 'neck' ? 'NECK HOLD · WALK THEM · HOLD G TO CHOKE · TAP G TO LET GO' : 'CLINCH · MASH TO WIN IT', 'job');
    return { hit: T.id, mode, behind, aware };
  }
  // Does T know c is there? It is fighting or chasing c, or c is in front of it, in sight, or c is loud (sprinting).
  aware(T, c) {
    if (T.target === c || T.grudge === c || T.m?.guardBy === c) return true;
    if (T === this.g.player) return Math.abs(wrap(Math.atan2(c.x - T.x, c.z - T.z) - T.face)) < 100 * DEG;
    if (c.speed > 5.2) return true;
    return Math.abs(wrap(Math.atan2(c.x - T.x, c.z - T.z) - T.face)) < 100 * DEG && this.g.sees(T, c);
  }

  power(c, effort) {
    const g = this.g, m = c.m;
    const lvl = c === g.player ? g.skillsSys?.lv?.strength ?? 0 : c.npc?.strength ?? (c.faction === 'raider' || c.faction === 'soldier' ? 3 : 1);
    const sta = c === g.player ? p0(c.stamina) : m.sta;
    return (1 + 0.08 * lvl) * (c.strength ?? 1) * (0.35 + 0.65 * sta) * (0.4 + 0.6 * Math.max(0, c.hp / (c.maxHp || 100))) * (m.armBroken ? 0.6 : 1) * effort;
  }
  effortOf(c, H, dt) {
    // The player's effort is how hard they mash (a person mashing flat out outworks an NPC's steady effort); holding a neck
    // without mashing still holds it at `holdEffort`.
    if (c === this.g.player) { const e = Math.min(1, this.mashRate / R.struggle.mashFull) * R.struggle.mashMax; return H.a === c && H.mode === 'neck' ? Math.max(R.struggle.holdEffort, e) : e; }
    const m = c.m;
    if ((m.effortT -= dt) <= 0) { const [lo, hi] = R.struggle.npcEffort; m.effort = lo + Math.random() * (hi - lo); m.effortT = 0.4; }
    if (H.v === c && c.knockT > 0) return 0;
    if (H.a === c && H.mode === 'neck' && H.shield && c !== this.g.player) return m.effort * 0.9;
    return m.effort;
  }

  updateHolds(dt) {
    const g = this.g, P = g.player, S = R.struggle;
    if ((this.mashT += dt) >= 0.5) { this.mashRate = this.mash / this.mashT; this.mash = 0; this.mashT = 0; }
    for (let i = this.holds.length - 1; i >= 0; i--) {
      const H = this.holds[i], a = H.a, v = H.v;
      if (!a.alive || !v.alive || !g.chars.includes(a) || !g.chars.includes(v) || a.inVehicle || v.inVehicle || a.knockT > 0) { this.release(H, !v.alive ? 'dead' : 'lost'); continue; }
      H.t += dt;
      // The held stand in front of the holder, facing the same way (a shield faces what you face).
      const fx = Math.sin(a.face), fz = Math.cos(a.face);
      const t = { x: a.x + fx * R.grab.hold.dist, z: a.z + fz * R.grab.hold.dist };
      g.statics.resolveBody(t, (v.radius ?? 0.45) * 0.8, v);
      v.x = t.x; v.z = t.z; v.face = H.mode === 'neck' ? a.face : a.face + Math.PI; v.speed = a.speed; v.walk = a.walk; v.aiming = false; v.gy = a.gy; v.storey = a.storey;
      // The struggle.
      const ea = this.effortOf(a, H, dt), ev = H.choke >= 1 ? 0 : this.effortOf(v, H, dt);
      H.effort[0] = ea; H.effort[1] = ev;
      const pa = this.power(a, ea), pv = this.power(v, ev);
      H.bar = Math.max(-1, Math.min(1, H.bar + (pa - pv) * S.rate * dt));
      for (const c of [a, v]) { if (c === P) c.stamina = Math.max(0, p0(c.stamina) - S.drain * dt); else c.m.sta = Math.max(0, c.m.sta - S.drain * dt); }
      if (H.bar <= -1) { this.breakFree(H); continue; }
      if (H.mode === 'clinch') {
        if (H.bar >= 1 || H.t >= R.grab.clinch.secs) {
          const winner = H.bar >= 0 ? a : v, loser = winner === a ? v : a;
          this.release(H, 'thrown');
          this.knockDown(loser, R.grab.clinch.throwKnock);
          const dx = loser.x - winner.x, dz = loser.z - winner.z, d = Math.hypot(dx, dz) || 1; rec(loser).vx += (dx / d) * 4; loser.m.vz += (dz / d) * 4; this.enlist(loser);
          this.lastStruggle = { mode: 'clinch', winner: winner.id, loser: loser.id, secs: +H.t.toFixed(2) };
          g.emit('struggle', this.lastStruggle);
          this.feel(winner, loser, 'heavy');
        }
        continue;
      }
      // The neck: choking (held G for the player; an NPC that isn't using them as a shield chokes) runs while the bar holds.
      const choking = a === P ? g.controls?.held?.('grab') && this.grabHeldT >= 0.3 : !H.shield;
      if (choking && H.bar > 0) {
        H.choke += dt / R.grab.choke.secs * (0.3 + 0.7 * H.bar);
        if (H.t % 1 < dt) g.noise(a.x, a.z, R.grab.choke.noise, a);
        if (H.choke >= 1) {
          this.release(H, 'choked');
          this.knockDown(v, R.grab.choke.outSecs);
          v.chokedOut = true;
          this.counts.choked++;
          this.lastStruggle = { mode: 'neck', winner: a.id, loser: v.id, choked: true, secs: +H.t.toFixed(2) };
          g.emit('chokedOut', { by: a.id, id: v.id, secs: R.grab.choke.outSecs });
          g.emit('struggle', this.lastStruggle);
        }
      }
      // Nobody fires through a hostage they care about (ai.js clearShot reads v.m.heldBy; the reckless do).
      if (H.shield !== true && this.shieldNeeded(a)) { H.shield = true; this.counts.hostages++; g.emit('hostage', { by: a.id, id: v.id }); }
      if (H.mode === 'neck' && a !== P && H.shield && H.t > MAI.think.holdShieldSecs) this.release(H, 'let go');
    }
  }
  // Is anybody with a gun near the holder who would care about the held? (Then it is a shield, not just a hold.)
  shieldNeeded(a) {
    const g = this.g;
    for (const o of g.chars) {
      if (o === a || o === a.m?.hold?.v || !o.alive || !o.weapon) continue;
      if (Math.abs(o.x - a.x) > 30 || Math.abs(o.z - a.z) > 30) continue;
      if (o.target === a || g.ai.hostile(o, a)) return true;
    }
    return a !== g.player && (g.player.weapon && g.arms?.stance === 'raised' && Math.hypot(g.player.x - a.x, g.player.z - a.z) < 30);
  }
  breakFree(H) {
    const g = this.g, a = H.a, v = H.v, B = R.struggle.breakFree;
    this.release(H, 'broke free');
    const r = Math.random();
    const how = r < B.elbow ? 'elbow' : r < B.elbow + B.bite ? 'bite' : 'shove';
    const dx = a.x - v.x, dz = a.z - v.z, d = Math.hypot(dx, dz) || 1;
    if (how === 'elbow') g.combat.damage(a, B.elbowDmg, v, dx / d, dz / d, 'bash', 'head');
    if (how === 'bite') { g.combat.damage(a, B.biteDmg, v, dx / d, dz / d, 'bite', 'arms'); a.bleed = Math.min(1, (a.bleed ?? 0) + 0.15); }
    rec(a).stagT = B.stagger; a.m.vx += (dx / d) * 2.5; a.m.vz += (dz / d) * 2.5;
    this.counts.broke++;
    this.lastStruggle = { mode: H.mode, winner: v.id, loser: a.id, broke: how, secs: +H.t.toFixed(2) };
    g.emit('struggle', this.lastStruggle);
    g.emit('breakFree', { id: v.id, from: a.id, how });
    this.feel(v, a, 'light');
  }
  release(H, why = 'let go') {
    const g = this.g, i = this.holds.indexOf(H);
    if (i >= 0) this.holds.splice(i, 1);
    if (H.a.m?.hold === H) H.a.m.hold = null;
    if (H.v.m?.heldBy === H) H.v.m.heldBy = null;
    H.why = why;
    if (why === 'let go' || why === 'shoved') { const fx = Math.sin(H.a.face), fz = Math.cos(H.a.face); rec(H.v).vx += fx * R.grab.release.push / R.body.slide * 0.5; H.v.m.vz += fz * R.grab.release.push / R.body.slide * 0.5; this.enlist(H.v); }
    this.counts.released++;
    g.emit('release', { by: H.a.id, id: H.v.id, why, mode: H.mode, secs: +H.t.toFixed(2) });
  }

  holderInput(dt) {
    const g = this.g, p = g.player, C = g.controls, H = p.m.hold;
    if (C.held('grab')) this.grabHeldT += dt;
    if (C.hit('grab')) { this.grabHeldT = 0; this.mash++; }
    if (C.hit('punch') || C.hit('block')) this.mash++;
    if (C.released('grab') && this.grabHeldT < 0.3 && H.t > 0.25 && H.mode === 'neck') { this.release(H, 'let go'); this.grabHeldT = 0; return; }
    if (!C.held('grab')) this.grabHeldT = 0;
    if (H.mode !== 'neck') return;
    // E with the hostage at a locked door: they open it (they know the way in).
    if (C.hit('interact')) {
      const door = g.gunpoint?.lockedDoorNear?.(H.v);
      if (door) { g.interiors.unlock(door, 'key', H.v); g.emit('hostageDoor', { id: H.v.id, door: door.id }); g.hud?.toast?.('THEY OPEN IT FOR YOU', 'job'); }
    }
    // PUNCH on the held: a knee to the gut, the knife across the throat.
    if (C.hit('punch') && !this.act && !(p.weapon && g.arms?.stance !== 'holstered')) {
      const wid = this.inHand(p), W = this.row(wid);
      const dmg = (wid === 'knife' || wid === 'machete' ? 120 : W.dmg * 0.8) * (g.deep?.fx.meleeMul ?? 1);
      const v = H.v;
      g.combat.damage(v, dmg, p, Math.sin(p.face), Math.cos(p.face), W.kind === 'blade' ? 'blade' : 'bash', wid === 'knife' || wid === 'machete' ? 'head' : 'torso');
      if (W.kind === 'blade') v.bleed = 1;
      this.feel(p, v, 'heavy');
      this.last = { kind: 'heldStrike', weapon: wid, hit: v.id, dmg: +dmg.toFixed(1), killed: !v.alive };
      g.emit('melee', { ...this.last, by: p.id });
    }
  }
  victimInput(dt) {
    const g = this.g, C = g.controls;
    if (!C) return;
    for (const id of ['punch', 'grab', 'block', 'interact', 'melee']) if (C.hit(id)) this.mash++;
    if (g.input?.hit?.('Space')) this.mash++;
  }

  // ---- the AI (ai.js hooks) ------------------------------------------------------------------------------------------
  // Held, staggered, mid-blow, or holding someone: the melee system owns them this frame.
  busy(c, dt) {
    const m = c.m;
    if (!m) return false;
    if (m.heldBy) { c.speed = 0; c.aiming = false; return true; }
    if (m.stagT > 0) { c.speed = 0; c.aiming = false; return true; }
    if (m.act) { c.speed = 0; if (m.act.target) c.face = angleLerp(c.face, Math.atan2(m.act.target.x - c.x, m.act.target.z - c.z), Math.min(1, dt * 6)); return true; }
    if (m.hold) return this.holderThink(c, dt);
    return false;
  }
  holderThink(c, dt) {
    const g = this.g, H = c.m.hold, P = g.player;
    // Back away from the gun on them, the hostage in front.
    const threat = H.v === P ? null : P.alive && Math.hypot(P.x - c.x, P.z - c.z) < 30 ? P : c.target; // holding YOU: it just holds on
    if (threat) {
      c.face = angleLerp(c.face, Math.atan2(threat.x - c.x, threat.z - c.z), Math.min(1, dt * 5));
      const d = Math.hypot(threat.x - c.x, threat.z - c.z);
      if (d < 9) g.ai.move(c, c.x - threat.x, c.z - threat.z, 1.2 * R.grab.hold.moveMul + 0.3, dt); else c.speed = 0;
      if (H.shield && Math.random() < dt * 0.15) g.feedback?.floater(c.x, c.z, pickLine(BARKS.hostage), 'bark');
    } else c.speed = 0;
    return true;
  }

  // An NPC that fights hand to hand (carries a melee weapon and no gun, or is a brawler): close in, swing, grab from
  // behind if it got there unseen, run when it's beaten. Returns true when it moved them this frame.
  think(c, dt) {
    const g = this.g;
    const m = rec(c), AI = MAI[c.faction] ?? MAI.default;
    if (c.weapon && (c.mag > 0 || c.reloading > 0)) return false; // a gun with rounds in it: it shoots (ai.js)
    if (c.flee > 0 && c.fledMelee) return false; // beaten and running (ai.js flee)
    // Who to fight: whoever it already fights, else the nearest it is hostile to that it can see.
    let t = c.target && c.target.alive ? c.target : null;
    if (!t && (m.aiT -= dt) <= 0) {
      m.aiT = 0.5 + Math.random() * 0.3;
      let bd = 16;
      for (const o of g.chars) {
        if (o === c || !o.alive || o.inVehicle || o.hidden) continue;
        if (Math.abs(o.x - c.x) > bd || Math.abs(o.z - c.z) > bd) continue;
        const d = Math.hypot(o.x - c.x, o.z - c.z);
        if (d < bd && g.ai.hostile(c, o) && g.sees(c, o)) { bd = d; t = o; }
      }
      if (t) { c.target = t; c.state = 'fight'; }
    }
    if (!t) return false;
    const dx = t.x - c.x, dz = t.z - c.z, d = Math.hypot(dx, dz);
    if (d > (c.leash ?? 40)) { c.target = null; return false; }
    // Beaten: run.
    if (c.hp < (c.maxHp || 100) * AI.flee && !c.fledMelee) { c.fledMelee = true; c.flee = 6 + Math.random() * 3; c.fleeX = t.x; c.fleeZ = t.z; c.target = null; g.emit('meleeFlee', { id: c.id }); return false; }
    const W = this.row(this.inHand(c));
    const want = Math.atan2(dx, dz);
    // Behind them and unseen: creep in and take the neck.
    const behind = Math.abs(wrap(Math.atan2(c.x - t.x, c.z - t.z) - t.face)) > R.grab.behindDeg * DEG;
    if (m.plan === null) m.plan = Math.random() < AI.grab ? 'grab' : 'strike';
    if (m.plan === 'grab' && behind && !this.aware(t, c) && d < MAI.think.sneakFrom) {
      c.face = angleLerp(c.face, want, Math.min(1, dt * 8));
      if (d <= R.grab.reach + 0.1) { this.grab(c, t); m.plan = null; return true; }
      g.ai.move(c, dx, dz, MAI.think.sneakSpeed, dt);
      return true;
    }
    c.face = angleLerp(c.face, want, Math.min(1, dt * 9));
    if (d > W.reach * 0.9) { g.ai.move(c, dx, dz, MAI.think.closeSpeed, dt); return true; }
    c.speed = 0;
    // In reach: swing when it's ready (a downed one gets finished), now and then a heavy.
    if (m.sta > 0.12 && (m.aiT -= dt) <= 0 && Math.abs(wrap(want - c.face)) < 0.35) {
      m.aiT = 0.35 + Math.random() * 0.6;
      const heavy = Math.random() < 0.3 || (t.m?.openT > 0);
      this.attack(c, { heavy, kind: t.knockT > 0 ? 'finish' : undefined });
      if (m.act) m.act.target = t;
      m.plan = null;
    }
    return true;
  }

  // ---- people who fight this way -------------------------------------------------------------------------------------
  // A share of the world's raiders are BRUISERS: no gun, a real bat or pipe or blade they carry (and drop when they die).
  bruiser(c) {
    if (!c || Math.random() >= MAI.world.bruiserShare) return false;
    const pool = MAI.world.bruiserWeapons;
    c.weapon = null; c.mag = 0; c.meleeW = pool[Math.floor(Math.random() * pool.length)];
    c.name = 'Dustwolf Bruiser';
    return true;
  }
  onBody(box, c) { const W = MW[c.meleeW]; if (W?.item) this.g.inventory.add(box, W.item, 1); }

  // ---- the agent's view ----------------------------------------------------------------------------------------------
  holdView(H) { return H && { by: H.a.id, id: H.v.id, mode: H.mode, secs: +H.t.toFixed(2), bar: +H.bar.toFixed(3), choke: +H.choke.toFixed(3), shield: H.shield, effort: H.effort.map((e) => +e.toFixed(2)) }; }
  view() {
    const g = this.g, p = g.player, m = p.m;
    return { busy: !!this.act, kind: this.act?.kind ?? null, chain: this.chain, last: this.last, lastBlock: this.lastBlock, lastStruggle: this.lastStruggle, counts: { ...this.counts }, staminaNow: +(p.stamina ?? 1).toFixed(2), next: this.strikeKind(),
      fistsUp: this.fistsUp(), inHand: this.inHand(p), carried: WEAPON_IDS.filter((id) => this.carries(p, id)), guard: !!m?.guard, arm: +(m?.arm ?? 0).toFixed(1), armBroken: !!m?.armBroken, stagger: +(m?.stagT ?? 0).toFixed(2),
      dur: Object.fromEntries(WEAPON_IDS.filter((id) => MW[id].dur && this.carries(p, id)).map((id) => [id, m?.dur?.[id] ?? MW[id].dur])),
      holding: this.holdView(m?.hold), heldBy: this.holdView(m?.heldBy), holds: this.holds.map((H) => this.holdView(H)) };
  }
  person(c) { const m = c.m; return { id: c.id, weapon: this.inHand(c), guard: !!m?.guard, arm: +(m?.arm ?? 0).toFixed(1), armBroken: !!m?.armBroken, legBroken: !!m?.legBroken, stagger: +(m?.stagT ?? 0).toFixed(2), open: +(m?.openT ?? 0).toFixed(2), knockT: +(c.knockT ?? 0).toFixed(2), lost: c.lost ?? null, sta: +(m?.sta ?? 1).toFixed(2), hp: Math.round(c.hp), alive: c.alive, holding: this.holdView(m?.hold), heldBy: this.holdView(m?.heldBy) }; }
  save() { const m = this.g.player.m; return { held: m?.held ?? null, dur: { ...(m?.dur ?? {}) }, arm: m?.arm ?? 0, armBroken: !!m?.armBroken }; }
  load(s) { if (!s) return; const m = rec(this.g.player); m.held = s.held ?? null; m.dur = { ...(s.dur ?? {}) }; m.arm = s.arm ?? 0; m.armBroken = !!s.armBroken; }
  clear() {
    for (const H of [...this.holds]) this.release(H, 'cleared');
    for (const c of this.live) { const m = c.m; if (!m) continue; m.act = null; m.guard = false; m.stagT = 0; m.openT = 0; m.vx = 0; m.vz = 0; m.guardAt = -1; c.meleeT = 0; }
    this.live.length = 0; this.act = null; this.ready = false; this.atkReady = false;
  }
}

const BARKS = { hostage: ['Back off or they die!', 'Drop it! I swear I\'ll do it!', 'One more step...', 'Stay back!'] };
const pickLine = (L) => L[Math.floor(Math.random() * L.length)];
function p0(v) { return v ?? 1; }
function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function rollPart(aim) {
  let r = Math.random();
  for (const k of PARTS) { r -= aim[k] ?? 0; if (r <= 0) return k; }
  return 'torso';
}
