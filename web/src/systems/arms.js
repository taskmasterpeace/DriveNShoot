import { WEAPONS } from './combat.js';
import { STANCE, GRIP } from '../data/arms.js';
import { PAD } from '../data/controls.js';
import { TRADERS } from '../data/trade.js';
import { angleLerp } from '../engine/rng.js';

// How the player carries a gun (docs/design/WEB_CONTROLLER.md §3.2-3.4): the stance (holstered, lowered, raised), the grip
// (one hand or two, chosen or forced), the fire modes on each weapon row and the trigger that runs them (single, burst,
// automatic), recoil bloom, the weapon bar's slot keys and the pad's weapon wheel; and what the world reads off a raised
// gun (guards tense, traders shut the counter). gunpoint.js holds people at gunpoint; melee.js fights hand to hand.
//
//   update(dt)            per frame (main.js, after the player): the verbs (H, J, B, RB), the stance clock, the forced
//                         grip, bloom, free hands on doors, who has noticed the gun
//   row(k)                the weapon as fired: its mode, grip and bloom folded in (combat.fire takes it)
//   trigger(I, k)         handleShooting asks: does a round go now? (raises or draws the gun, runs bursts)
//   afterShot(row)        a round went: bloom, the burst's count, and the cool-down before the next
//   slotKeys(I, dt)       the number keys: a new slot selects it, the same slot again (or held) cycles its mode boxes
//   refuses(c)            trade.js: a trader who has seen a gun raised in their shop will not deal
export class Arms {
  constructor(game) {
    this.g = game;
    this.stance = STANCE.start;
    this.drawT = 0;
    this.gripPref = 'two'; this.grip = 'two'; this.gripWhy = 'chosen';
    this.mode = {};           // weapon key -> mode id (the player's choice; the row's `mode` or first by default)
    this.burstLeft = 0; this.bloom = 0;
    this.lastShotT = -1e9; this.engagedT = -1e9; this.raisedT = -1e9;
    this.rows = {};
    this.barT = -1e9;         // the mode boxes stand up above the slot until this game time
    this.radialOpen = false; this.radialSlot = 0; this.radialT = 0;
    this.slotHeld = -1; this.slotRep = 0;
    this.holdDone = false; this.wheelDone = false;
    this.tense = new Set();   // people who have noticed your raised gun (guards, traders)
    this.noticeT = 0;
    this.lastX = null; this.lastZ = null;
    this.counts = { raised: 0, lowered: 0, holstered: 0, drawn: 0, modeChanges: 0, gripChanges: 0, doorPushes: 0, tensed: 0 };
  }

  // ---- fire modes ---------------------------------------------------------------------------------------------------
  modes(k) {
    const w = WEAPONS[k];
    if (!w) return [];
    if (!w.modes) w.modes = [w.auto ? { id: 'auto', name: 'AUTO', burst: 0, rate: w.rate, spread: 1, kick: 0.2 } : { id: 'single', name: 'SINGLE', burst: 1, rate: w.rate, spread: 1, kick: 0.3 }];
    return w.modes;
  }
  modeOf(k) {
    const M = this.modes(k), want = this.mode[k] ?? WEAPONS[k]?.mode;
    return M.find((m) => m.id === want) ?? M[0];
  }
  setMode(k, id) {
    const M = this.modes(k), m = M.find((x) => x.id === id);
    if (!m) return false;
    if (this.modeOf(k).id !== m.id) { this.counts.modeChanges++; this.g.audio?.blip?.(); this.g.emit('fireMode', { weapon: k, mode: m.id, burst: m.burst }); }
    this.mode[k] = m.id; this.burstLeft = 0;
    this.barT = this.g.time + 4;
    return true;
  }
  cycleMode(k, step = 1) {
    const M = this.modes(k);
    if (M.length < 2) { this.barT = this.g.time + 2; return false; }
    const i = M.indexOf(this.modeOf(k));
    return this.setMode(k, M[(i + step + M.length) % M.length].id);
  }

  gun(k) { return GRIP.guns[k] ?? GRIP.guns.default; }
  gripSpread(k) { return this.grip === 'one' ? 1 + (GRIP.one.spread - 1) * this.gun(k).oneHand : GRIP.two.spread; }
  gripKick(k) { return this.grip === 'one' ? 1 + (GRIP.one.kick - 1) * this.gun(k).oneHand : GRIP.two.kick; }

  // The weapon as it fires right now. One cached object per gun, refreshed in place (no allocation per shot).
  row(k) {
    const w = WEAPONS[k];
    if (!w) return null;
    const m = this.modeOf(k), r = (this.rows[k] ??= {});
    Object.assign(r, w);
    r.modeId = m.id; r.modeName = m.name; r.burst = m.burst;
    r.rate = m.rate ?? w.rate; r.dmg = m.dmg ?? w.dmg; r.pellets = m.pellets ?? w.pellets; r.range = m.range ?? w.range;
    r.auto = m.burst === 0; r.after = m.after ?? r.rate; r.kick = m.kick ?? 0.25;
    r.spread = w.spread * (m.spread ?? 1) * this.gripSpread(k) * (1 + this.bloom);
    r.round = m.round ?? w.round; // the flight row (data/ballistics.js): the slug flies as a slug
    r.grip = this.grip;
    return r;
  }

  // ---- the trigger --------------------------------------------------------------------------------------------------
  // Does a round go this frame? A pull on a lowered gun raises it and fires; on a holstered one it draws (no shot until
  // it is out). A burst, once pulled, finishes on its own; semi wants a fresh pull; auto fires while held.
  trigger(I, k) {
    const g = this.g, pull = I.mouse.left, pulled = I.mouse.leftPressed;
    if (g.melee?.act) return false;                 // mid-swing
    if (this.stance === 'holstered') { if (pulled) this.draw(); return false; }
    if (this.drawT > 0) { if (pulled) this.burstLeft = 0; return false; }
    if (this.stance === 'lowered' && pulled) this.raise('fire');
    if (this.stance !== 'raised') return false;
    const inv = g.inv, dry = !(inv.mag[k] > 0) || !!inv.jam[k] || (g.inventory?.cond?.(k) ?? 1) <= 0;
    if (dry) { this.burstLeft = 0; return pulled; } // the empty click, the dead trigger, the broken gun: main.js says so
    if (this.burstLeft > 0 && this.burstGun === k) return true;
    this.burstLeft = 0;
    const m = this.modeOf(k);
    if (m.burst === 0) return pull;
    if (pulled) { this.burstLeft = m.burst; this.burstGun = k; return true; }
    return false;
  }
  afterShot(r) {
    this.burstLeft = Math.max(0, this.burstLeft - 1);
    this.bloom = Math.min(GRIP.bloomMax, this.bloom + r.kick * this.gripKick(this.g.inv.current));
    return this.burstLeft > 0 ? r.rate : r.burst > 1 ? r.after : r.rate;
  }
  // Any shot by the player (the fire command included): the gun is up.
  onShot() {
    this.lastShotT = this.g.time;
    if (this.stance !== 'raised') { this.stance = 'raised'; this.drawT = 0; this.raisedT = this.g.time; this.g.emit('stance', { stance: 'raised', why: 'shot' }); }
  }
  kickMul() { return this.gripKick(this.g.inv.current); }

  // ---- the stance ---------------------------------------------------------------------------------------------------
  raise(why = 'key') {
    if (this.stance === 'raised') return;
    if (this.stance === 'holstered') { this.draw(); return; }
    this.stance = 'raised'; this.raisedT = this.g.time; this.engagedT = this.g.time; this.counts.raised++;
    this.g.emit('stance', { stance: 'raised', why });
  }
  lower(why = 'key') {
    if (this.stance !== 'raised' && this.drawT <= 0) return;
    this.stance = 'lowered'; this.drawT = 0; this.burstLeft = 0; this.counts.lowered++;
    this.g.emit('stance', { stance: 'lowered', why });
  }
  holster(why = 'key') {
    if (this.stance === 'holstered') return;
    const p = this.g.player;
    p.reloading = 0; p.clearing = false;
    this.stance = 'holstered'; this.drawT = 0; this.burstLeft = 0; this.counts.holstered++;
    this.g.audio?.blip?.();
    this.g.emit('stance', { stance: 'holstered', why });
  }
  draw() {
    if (this.drawT > 0 || this.stance === 'raised') return;
    const k = this.g.inv.current;
    this.drawT = STANCE.draw[k] ?? STANCE.draw.default;
    this.stance = 'lowered'; this.counts.drawn++;
    this.g.audio?.reload?.();
    this.g.emit('stance', { stance: 'drawing', secs: this.drawT });
  }
  setStance(s) { if (s === 'raised') { this.stance = 'lowered'; this.drawT = 0; this.raise('command'); } else if (s === 'lowered') { this.stance = 'raised'; this.lower('command'); } else if (s === 'holstered') this.holster('command'); return this.stance; }
  setGrip(pref) { if (pref !== 'one' && pref !== 'two') return false; if (pref !== this.gripPref) this.counts.gripChanges++; this.gripPref = pref; this.updateGrip(); this.g.emit('grip', { pref, grip: this.grip, why: this.gripWhy }); return true; }

  // One hand when the other is busy, whatever you chose: a car seat (the window), hanging on, a throw being cooked,
  // a sprint, something carried.
  updateGrip() {
    const p = this.g.player;
    let why = null;
    if (p.inVehicle || p.firingFrom) why = 'vehicle';
    else if (p.grabbing) why = 'hanging on';
    else if (p.cookT > 0) why = 'throwing';
    else if (p.carrying) why = 'carrying';
    else if (p.speed > GRIP.sprintAt && !p.dive) why = 'running';
    this.grip = why ? 'one' : this.gripPref;
    this.gripWhy = why ?? 'chosen';
  }

  moveMul() {
    if (this.stance === 'holstered') return STANCE.move.holstered;
    if (this.stance === 'lowered') return STANCE.move.lowered;
    const h = this.gun(this.g.inv.current).heft;
    return 1 - (this.gripPref === 'two' ? GRIP.moveTwo : GRIP.moveOne) * h; // the grip you hold at a walk
  }
  sprintDrain() { return STANCE.sprintDrain[this.stance] ?? 1; }
  vaultMul() { return STANCE.vault[this.stance] ?? 1; }

  // ---- per frame ----------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g, p = g.player, C = g.controls, live = p.alive && !g.dialogue.active && !g.invUI?.open && !g.survival?.sleep;
    if (this.drawT > 0 && (this.drawT -= dt) <= 0) { this.drawT = 0; this.stance = 'raised'; this.raisedT = g.time; this.engagedT = g.time; this.counts.raised++; g.emit('stance', { stance: 'raised', why: 'drawn' }); }
    if (live && C) this.verbs(dt, C);
    // A raised gun nobody needs drops to the ground: no shot, nobody covered, nobody hunting you close by.
    if (this.stance === 'raised' && g.time - Math.max(this.lastShotT, this.engagedT, this.raisedT) > STANCE.calm && !this.threatNear() && !g.gunpoint?.busy()) this.lower('calm');
    // The pad: a strong throw of the right stick is aiming, and aiming raises the gun.
    if (C?.device === 'pad' && !this.radialOpen && C.aimStick.mag >= PAD.aim.raiseAt && this.stance === 'lowered' && this.drawT <= 0 && live && !p.inVehicle) this.raise('stick');
    this.hands(dt);
    this.updateGrip();
    this.bloom = Math.max(0, this.bloom - GRIP[this.grip].recover * dt);
    p.holstered = this.stance === 'holstered';
    p.oneHand = this.grip === 'one';
    if (live && !p.inVehicle && !p.grabbing && !p.onTrain) this.doorHand(dt);
    this.lastX = p.x; this.lastZ = p.z;
    this.notice(dt);
  }

  verbs(dt, C) {
    const g = this.g, p = g.player, k = g.inv.current, driving = p.inVehicle?.driver === p;
    // H: tap - up or down; hold - holster (or draw).
    if (C.held('holster')) {
      if (!this.holdDone && C.heldFor('holster') >= PAD.holdTime) {
        this.holdDone = true;
        if (this.stance === 'holstered') this.draw(); else this.holster();
      }
    } else if (C.released('holster')) {
      if (!this.holdDone && !(driving && p.inVehicle?.harpoon)) {
        if (this.stance === 'holstered') this.draw();
        else if (this.stance === 'raised' || this.drawT > 0) this.lower();
        else this.raise();
      }
      this.holdDone = false;
    }
    if (C.hit('grip')) {
      this.setGrip(this.gripPref === 'two' ? 'one' : 'two');
      g.hud?.toast?.(this.gripPref === 'one' ? 'ONE HAND · QUICKER, WILDER' : 'TWO HANDS · STEADY, SLOWER');
    }
    if (C.hit('mode') && !driving && !this.radialOpen) this.cycleMode(k, 1);
    // RB: tap - the next gun; hold - the weapon wheel (the right stick picks a slot, the D-pad its mode, let go to take it).
    if (C.held('wheel')) {
      if (!this.radialOpen && !this.wheelDone && C.heldFor('wheel') >= PAD.holdTime && !driving) this.openRadial();
    } else if (C.released('wheel')) {
      if (this.radialOpen) this.closeRadial(true);
      else if (!this.wheelDone) this.nextWeapon(1);
      this.wheelDone = false;
    }
    if (this.radialOpen) this.updateRadial(C);
  }

  nextWeapon(step) {
    const g = this.g, W = g.inv.weapons, i = W.indexOf(g.inv.current);
    if (W.length < 2) return;
    g.switchWeapon(W[(i + step + W.length) % W.length]);
    this.barT = g.time + 3;
  }

  // ---- the number keys and the weapon wheel -----------------------------------------------------------------------
  slotKeys(I, dt) {
    const g = this.g, W = g.inv.weapons;
    let held = -1;
    for (let i = 0; i < W.length && i < 9; i++) {
      const code = `Digit${i + 1}`;
      if (I.hit(code)) {
        if (W[i] !== g.inv.current) { g.switchWeapon(W[i]); this.barT = g.time + 4; this.slotRep = -PAD.holdTime; }
        else { this.cycleMode(W[i], 1); this.slotRep = -PAD.holdTime; }
      }
      if (I.key(code)) held = i;
    }
    // Held: the boxes keep cycling (after a beat, then every PAD.repeat s).
    if (held >= 0 && W[held] === g.inv.current) {
      this.barT = Math.max(this.barT, g.time + 1.5);
      if ((this.slotRep += dt) >= PAD.repeat) { this.slotRep = 0; this.cycleMode(W[held], 1); }
    } else this.slotRep = 0;
  }

  openRadial() {
    const g = this.g;
    this.radialOpen = true; this.radialSlot = Math.max(0, g.inv.weapons.indexOf(g.inv.current)); this.radialT = g.time; this.wheelDone = true;
    this.radialMode = Object.fromEntries(g.inv.weapons.map((k) => [k, this.modeOf(k).id]));
    g.emit('radial', { open: true });
  }
  updateRadial(C) {
    const g = this.g, W = g.inv.weapons, s = C.aimStick;
    if (s.mag >= PAD.radialAt && W.length) {
      // The wheel is a fan above the bar: stick hard left is slot 1, hard right the last.
      let th = Math.atan2(-s.z, s.x); // 0 = right, pi/2 = up, pi = left; the lower half folds onto its nearer end
      if (th < 0) th = th < -Math.PI / 2 ? Math.PI : 0;
      const t = (Math.PI - th) / Math.PI;
      this.radialSlot = Math.min(W.length - 1, Math.floor(t * W.length));
    }
    const k = W[this.radialSlot];
    if (k && (C.hit('mode') || C.hit('modePrev'))) {
      const M = this.modes(k), i = M.findIndex((m) => m.id === this.radialMode[k]);
      this.radialMode[k] = M[(i + (C.hit('mode') ? 1 : -1) + M.length) % M.length].id;
      g.audio?.blip?.();
    }
  }
  closeRadial(apply) {
    const g = this.g, k = g.inv.weapons[this.radialSlot];
    this.radialOpen = false;
    if (apply && k) {
      if (k !== g.inv.current) g.switchWeapon(k);
      if (this.radialMode[k]) this.setMode(k, this.radialMode[k]);
      this.barT = g.time + 3;
    }
    g.emit('radial', { open: false, weapon: g.inv.current, mode: this.modeOf(g.inv.current).id });
  }

  // ---- busy hands ------------------------------------------------------------------------------------------------------
  // Both hands on something (the E-hold ring at a window or a lock, a box or a body being searched, something dragged or
  // carried): the gun comes down and both arms do the work, facing it. It goes back up when the work ends (if it was up),
  // or the moment you pull the trigger.
  busyWith() {
    const g = this.g, p = g.player, I = g.interiors;
    if (!p.alive || p.inVehicle || p.grabbing || p.onTrain) return null;
    if (I && I.hold > 0 && I.holdOn) return I.holdOn;
    if (g.invUI?.open && g.inventory?.opened && g.inventory.opened.kind !== 'carried') return g.inventory.opened;
    if (p.carrying || p.dragging) return p.carrying ?? p.dragging;
    return null;
  }
  hands(dt) {
    const g = this.g, p = g.player, t = this.busyWith();
    const had = !!this.work;
    this.work = t && Number.isFinite(t.x) ? t : t ? { x: p.x + Math.sin(p.face), z: p.z + Math.cos(p.face) } : null;
    if (this.work) {
      if (!had) { this.workWas = this.stance; this.workT = 0; g.emit('handsBusy', { on: true }); }
      this.workT += dt;
      if (this.stance === 'raised' && g.time - this.lastShotT > 0.3) { this.stance = 'lowered'; this.burstLeft = 0; }
      p.work = this.work; p.workT = this.workT; p.aiming = false;
    } else if (had) {
      p.work = null;
      if (this.workWas === 'raised' && this.stance === 'lowered') { this.stance = 'raised'; this.raisedT = g.time; }
      this.workWas = null;
      g.emit('handsBusy', { on: false });
    }
  }

  // ---- free hands on a door -----------------------------------------------------------------------------------------
  // Holstered, a closed door you walk into is pushed open ahead of you with your free hand (systems/interiors.js swings
  // it from there), so you keep your stride. With a gun up you shoulder it and lose a step.
  doorHand(dt) {
    const g = this.g, p = g.player, I = g.interiors, D = STANCE.doorHand;
    if (this.stance !== 'holstered' || !I || this.lastX === null) return;
    const vx = p.x - this.lastX, vz = p.z - this.lastZ, v = Math.hypot(vx, vz);
    if (v < 0.4 * dt) return;
    const ux = vx / v, uz = vz / v;
    for (const door of I.doors) {
      if (door.locked || Math.abs(door.x - p.x) > 3 || Math.abs(door.z - p.z) > 3) continue;
      for (const L of door.leaves) {
        if (L.jamT > 0 || Math.abs(L.th) > 1.2) continue;
        // nearest point of the leaf to the player
        const ex = p.x - L.hx, ez = p.z - L.hz;
        const s = Math.max(0, Math.min(L.len, ex * L.dx + ez * L.dz));
        const qx = L.hx + L.dx * s - p.x, qz = L.hz + L.dz * s - p.z, d = Math.hypot(qx, qz);
        if (d > D.reach || d < 1e-4) continue;
        if ((qx * ux + qz * uz) / d < D.cone) continue; // walking into it, not past it
        const side = ex * L.px + ez * L.pz >= 0 ? 1 : -1, w = -side * D.spin;
        if (Math.abs(L.w ?? 0) < D.spin || (L.w ?? 0) * w < 0) {
          L.w = w; L.pusher = p; L.pushT = g.time;
          I.wake(L);
          if (!this.pushing || this.pushing !== L) { this.counts.doorPushes++; this.pushing = L; g.emit('doorHand', { door: door.id }); }
        }
      }
    }
  }

  // ---- who reads a raised gun ---------------------------------------------------------------------------------------
  threatNear() {
    const g = this.g, P = g.player, R = STANCE.calmR;
    for (const c of g.chars) if (c.alive && (c.target === P || c.ztarget === P) && Math.abs(c.x - P.x) < R && Math.abs(c.z - P.z) < R) return true;
    return false;
  }
  isGuard(c) { return STANCE.guards.includes(c.faction); }
  isTrader(c) { return !!(c.npc && TRADERS[c.npc.id]); }
  notice(dt) {
    const g = this.g, P = g.player;
    for (const c of this.tense) {
      if (!c.alive || !g.chars.includes(c)) { this.tense.delete(c); c.tenseT = 0; continue; }
      if ((c.tenseT -= dt) <= 0) { c.tenseT = 0; c.noticeT = 0; this.tense.delete(c); g.emit('relaxed', { id: c.id }); continue; }
      // A tense guard watches you (stands, turns to you) unless he has other business.
      if (this.isGuard(c) && !c.target && c.hold !== true && !c.telling) { c.hold = Math.max(typeof c.hold === 'number' ? c.hold : 0, 0.3); c.face = angleLerp(c.face, Math.atan2(P.x - c.x, P.z - c.z), Math.min(1, dt * 6)); }
    }
    if ((this.noticeT += dt) < 0.2) return;
    const step = this.noticeT; this.noticeT = 0;
    if (this.stance !== 'raised' || !P.alive || P.inVehicle) return;
    const R = STANCE.seeR;
    for (const c of g.chars) {
      if (c === P || !c.alive || c.sleeping || c.inVehicle || c.faction === 'zombie' || c.faction === 'raider' || c.target === P) continue;
      if (!this.isGuard(c) && !this.isTrader(c)) continue;
      if (Math.abs(c.x - P.x) > R || Math.abs(c.z - P.z) > R || Math.hypot(c.x - P.x, c.z - P.z) > R || !g.sees(c, P)) continue;
      c.noticeT = (c.noticeT ?? 0) + step;
      if (c.noticeT < STANCE.notice) continue;
      if (!(c.tenseT > 0)) {
        this.counts.tensed++;
        g.emit('tense', { id: c.id, name: c.npc?.name ?? c.name, guard: this.isGuard(c), trader: this.isTrader(c) });
        const L = g.gunpoint?.lines('tense');
        if (L) g.feedback?.floater(c.x, c.z, L, 'bark');
      }
      c.tenseT = STANCE.relax; this.tense.add(c);
    }
  }
  // trade.js: a trader who has seen your gun up in the last few seconds will not open the counter.
  refuses(c) {
    if (!(c?.tenseT > 0) || !this.isTrader(c)) return false;
    if (this.g.time - (this.refusedT ?? -9) > 4) { this.refusedT = this.g.time; this.g.hud?.toast?.(`${(c.npc?.name ?? 'THE TRADER').toUpperCase()} WON'T DEAL WITH A GUN OUT · HOLSTER IT (H)`, 'warn'); }
    return true;
  }

  view() {
    const g = this.g, k = g.inv.current, r = this.row(k);
    return {
      stance: this.drawT > 0 ? 'drawing' : this.stance, drawIn: +this.drawT.toFixed(2), grip: this.grip, gripPref: this.gripPref, gripWhy: this.gripWhy,
      weapon: k, mode: r?.modeId, burst: r?.burst, rate: r?.rate, spread: r ? +r.spread.toFixed(4) : null, bloom: +this.bloom.toFixed(3), moveMul: +this.moveMul().toFixed(3),
      modes: Object.fromEntries(g.inv.weapons.map((w) => [w, { current: this.modeOf(w).id, all: this.modes(w).map((m) => m.id) }])),
      radial: this.radialOpen ? { slot: this.radialSlot, weapon: g.inv.weapons[this.radialSlot], modes: { ...this.radialMode } } : null,
      tense: [...this.tense].map((c) => ({ id: c.id, name: c.npc?.name ?? c.name, secs: +c.tenseT.toFixed(1) })),
      counts: { ...this.counts },
    };
  }
  save() { return { stance: this.stance === 'raised' ? 'lowered' : this.stance, gripPref: this.gripPref, mode: { ...this.mode } }; }
  load(s) { if (!s) return; this.stance = s.stance ?? STANCE.start; this.drawT = 0; this.gripPref = s.gripPref ?? 'two'; this.mode = { ...(s.mode ?? {}) }; }
}
