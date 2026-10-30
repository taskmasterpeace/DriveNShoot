import { MELEE as M } from '../data/arms.js';
import { FN_MELEE_CARRY } from '../data/fannods.js';

// Melee that saves rounds (docs/design/WEB_CONTROLLER.md §3.6). The player's hands, boots and whatever they hold:
// tap (RMB / pad R3) strikes with what is in your hand - fists, the gun's butt when it is up, a knife you carry when it is
// not; hold past MELEE.heavyAt and it is a kick; sprinting into it is a shoulder shove. Every blow has a windup, a moment of
// contact (the damage lands then, not on the click), and a recovery; it costs stamina (spent, the blow is weak and slow);
// three strikes chained inside the combo window land the third harder and put them down. The infected stagger shorter.
// A blow is combat.damage with cause 'bash' (so the hurt deed, the witness pass and the AI's anger all follow as for a
// shot), plus a knockdown (knockT, which ai.js already honours) and a push.
//
//   update(dt)  per frame (main.js, after the player): the button, then the blow in flight
//   swing(kind) start a blow (the `melee` command and the selftest's hands use the button; this is what it calls)
export class Melee {
  constructor(game) {
    this.g = game;
    this.act = null;           // { kind, t, landed, weak, target }
    this.ready = false;        // the button is down, deciding strike or kick
    this.chain = 0; this.chainT = -9;
    this.counts = { swings: 0, hits: 0, kills: 0, knockdowns: 0, whiffs: 0, combos: 0 };
    this.last = null;
  }

  can() {
    const g = this.g, p = g.player;
    return p.alive && !p.inVehicle && !p.grabbing && !p.onTrain && !p.swim && !p.vault && !(p.knockT > 0) && !(p.dive > 0) && !g.dialogue.active && !g.invUI?.open && !g.survival?.sleep;
  }

  strikeKind() {
    const g = this.g, A = g.arms;
    if (A?.stance === 'raised' && g.player.weapon) return 'butt';
    const held = this.carried(); if (held) return held.tap; // the found blades (data/fannods.js)
    if (g.inventory?.carried?.count?.('knife') > 0) return 'knife';
    return 'fists';
  }

  // A carried blade of the found things (data/fannods.js FN_MELEE_CARRY), first match; its held strike replaces the kick
  // (the cane's blade comes out of the shaft). Not while a gun is up: then it is the butt and the kick as ever.
  carried() {
    const inv = this.g.inventory?.carried;
    if (!inv || (this.g.arms?.stance === 'raised' && this.g.player.weapon)) return null;
    for (const r of FN_MELEE_CARRY) if (inv.count?.(r.item) > 0) return r;
    return null;
  }

  update(dt) {
    const g = this.g, p = g.player, C = g.controls;
    if (!this.can()) { this.act = null; this.ready = false; p.meleeT = 0; return; }
    if (this.act) { this.advance(dt); return; }
    if (!C) return;
    if (C.hit('melee')) {
      if (p.speed > 5.2) { this.swing('shove'); return; }
      this.ready = true;
    }
    if (this.ready) {
      if (C.held('melee') && C.heldFor('melee') >= M.heavyAt) { this.ready = false; this.swing(this.carried()?.heavy ?? 'kick'); }
      else if (!C.held('melee')) { this.ready = false; this.swing(this.strikeKind()); }
    }
  }

  swing(kind) {
    const g = this.g, p = g.player, K = M[kind];
    if (!K || this.act || !this.can()) return null;
    const weak = (p.stamina ?? 1) < K.stamina;
    p.stamina = Math.max(0, (p.stamina ?? 1) - K.stamina * (g.arms?.sprintDrain?.() ?? 1));
    this.act = { kind, t: 0, landed: false, weak, windup: K.windup * (weak ? 1.4 : 1), total: (K.windup + K.recover) * (weak ? 1.4 : 1), target: null };
    p.reloading = 0; p.clearing = false; // the hands are busy
    // Step into it.
    const t = { x: p.x + Math.sin(p.face) * M.lunge, z: p.z + Math.cos(p.face) * M.lunge };
    g.statics.resolveBody(t, p.radius, p);
    p.x = t.x; p.z = t.z;
    this.counts.swings++;
    g.audio?.throwWhoosh?.(0);
    g.emit('meleeSwing', { kind, weak });
    return this.act;
  }

  advance(dt) {
    const g = this.g, p = g.player, a = this.act;
    a.t += dt;
    p.meleeT = Math.min(1, a.t / a.total); p.meleeKind = a.kind; p.meleeHit = a.windup / a.total;
    if (!a.landed && a.t >= a.windup) this.land(a);
    if (a.t >= a.total) { this.act = null; p.meleeT = 0; }
  }

  // The moment of contact: the nearest person in reach and in the arc in front of you takes it.
  land(a) {
    const g = this.g, p = g.player, K = M[a.kind];
    a.landed = true;
    const fx = Math.sin(p.face), fz = Math.cos(p.face);
    let best = null, bd = Infinity;
    for (const c of g.chars) {
      if (c === p || !c.alive || c.inVehicle || c.hidden || c.underwater) continue;
      const dx = c.x - p.x, dz = c.z - p.z;
      if (Math.abs(dx) > 3 || Math.abs(dz) > 3) continue;
      const d = Math.hypot(dx, dz);
      if (d > K.reach + (c.radius ?? 0.45)) continue;
      if (d > 0.2 && Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d))) > K.arc) continue;
      if (!g.storeys.sameFloor(p, c) || !g.statics.lineOfSight(p.x, p.z, c.x, c.z, undefined, p.ug ? (p.gy ?? 0) + 1.2 : -1)) continue; // below the street: the level's walls
      if (d < bd) { bd = d; best = c; }
    }
    g.noise(p.x, p.z, K.noise, p);
    if (!best) { this.counts.whiffs++; this.last = { kind: a.kind, hit: null }; g.emit('melee', { kind: a.kind, hit: null }); return; }
    // The chain: strikes inside the window; the third lands harder and puts them down.
    const strike = a.kind === 'fists' || a.kind === 'butt' || a.kind === 'knife';
    this.chain = strike && g.time - this.chainT < M.combo.window ? this.chain + 1 : strike ? 1 : 0;
    this.chainT = g.time;
    const combo = strike && this.chain >= M.combo.at;
    if (combo) { this.chain = 0; this.counts.combos++; }
    const str = 1 + 0.05 * (g.skillsSys?.lv?.strength ?? 0); // strength, grown by doing (skills.js)
    const dmg = K.dmg * (a.weak ? 0.5 : 1) * (combo ? M.combo.mul : 1) * str * (g.deep?.fx.meleeMul ?? 1); // Brawn, Blunt/Unarmed, Pacifist (systems/stats.js)
    const dl = Math.max(0.01, bd), ux = (best.x - p.x) / dl, uz = (best.z - p.z) / dl;
    const hp0 = best.hp;
    g.combat.damage(best, dmg, p, ux, uz, 'bash');
    if (K.bleed) best.bleed = Math.min(1, (best.bleed ?? 0) + K.bleed);
    // Down they go (the infected shrug it off quicker), and back.
    const knock = (combo ? Math.max(K.knock, 0.9) : K.knock) * (best.faction === 'zombie' ? M.infectedKnock : 1) * (a.weak ? 0.5 : 1);
    if (best.alive && knock > 0) { best.knockT = Math.max(best.knockT ?? 0, knock); this.counts.knockdowns++; }
    if (best.alive && K.push > 0) {
      const t = { x: best.x + ux * K.push, z: best.z + uz * K.push };
      g.statics.resolveBody(t, best.radius ?? 0.45, best);
      best.x = t.x; best.z = t.z;
    }
    g.fx.sparks?.(best.x, 1.3 + (best.gy ?? 0), best.z, -ux, -uz, 2);
    g.hud.shake(a.kind === 'kick' || combo ? 0.3 : 0.15);
    g.controls?.rumble('melee');
    g.skillsSys?.gain?.('strength', 0.6);
    this.counts.hits++;
    if (!best.alive) this.counts.kills++;
    this.last = { kind: a.kind, hit: best.id, dmg: +dmg.toFixed(1), hp: [Math.round(hp0), Math.round(best.hp)], knock: +knock.toFixed(2), combo, killed: !best.alive };
    g.emit('melee', { kind: a.kind, hit: best.id, faction: best.faction, dmg: +dmg.toFixed(1), knock: +knock.toFixed(2), combo, killed: !best.alive });
  }

  view() { return { busy: !!this.act, kind: this.act?.kind ?? null, chain: this.chain, last: this.last, counts: { ...this.counts }, staminaNow: +(this.g.player.stamina ?? 1).toFixed(2), next: this.strikeKind() }; }
}
