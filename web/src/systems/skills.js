import { SKILLS, MAX_LEVEL, XP_BASE, XP_GROWTH, XP, PER_LEVEL, CARRY, ITEM_KG } from '../data/skills.js';
import { WEAPONS } from './combat.js';

// The player's body: skills that grow by doing (data/skills.js) and the weight they carry. g.skills holds the live
// multipliers the movement and combat code read:
//   spreadMul, reloadMul (dexterity) · sprintDrainMul (endurance) · carryKg (strength)
//   kg, load (kg / carryKg), speedMul, overloaded (no sprint)
export class Skills {
  constructor(game) {
    this.g = game;
    this.lv = Object.fromEntries(Object.keys(SKILLS).map((k) => [k, 0]));
    this.xp = Object.fromEntries(Object.keys(SKILLS).map((k) => [k, 0]));
    game.skills = { spreadMul: 1, reloadMul: 1, sprintDrainMul: 1, carryKg: CARRY.baseKg, kg: 0, load: 0, speedMul: 1, overloaded: false };
    this.weighT = 0;
    this.recompute();
  }

  need(lv) { return XP_BASE * XP_GROWTH ** lv; }

  gain(skill, amount) {
    if (!(skill in this.lv) || !(amount > 0) || this.lv[skill] >= MAX_LEVEL) return;
    this.xp[skill] += amount;
    while (this.lv[skill] < MAX_LEVEL && this.xp[skill] >= this.need(this.lv[skill])) {
      this.xp[skill] -= this.need(this.lv[skill]);
      this.lv[skill]++;
      this.g.hud?.toast?.(`${SKILLS[skill].label} ${this.lv[skill]}`, 'job');
      this.g.emit('skillUp', { skill, level: this.lv[skill] });
      this.recompute();
    }
  }

  // A bullet of the player's landed on someone: steadier hands next time.
  onHit() { this.gain('dexterity', XP.dexterity.hit); }

  // Everything the player is carrying, in kilograms.
  weigh() {
    const inv = this.g.inv;
    let kg = 0;
    for (const w of inv.weapons) kg += ITEM_KG.weapon[w] ?? ITEM_KG.weapon[WEAPONS[w]?.ammo === 'shells' ? 'shotgun' : WEAPONS[w]?.ammo] ?? 2.5;
    for (const [w, n] of Object.entries(inv.mag)) if (inv.weapons.includes(w)) kg += (ITEM_KG.round[WEAPONS[w]?.ammo] ?? 0.01) * n; // only guns you carry hold rounds
    for (const [a, n] of Object.entries(inv.ammo)) kg += (ITEM_KG.round[a] ?? 0.01) * n;
    for (const [t, n] of Object.entries(inv.throwables)) kg += (ITEM_KG.throwable[t] ?? 0.5) * (t === 'rock' ? 0 : n);
    return kg + (this.g.inventory?.kg() ?? 0); // and everything in your pockets and pack (inventory.js)
  }

  recompute() {
    const S = this.g.skills, L = this.lv;
    S.spreadMul = 1 - PER_LEVEL.spread * L.dexterity;
    S.reloadMul = 1 - PER_LEVEL.reload * L.dexterity;
    S.sprintDrainMul = 1 - PER_LEVEL.sprintDrain * L.endurance;
    S.carryKg = CARRY.baseKg + PER_LEVEL.carryKg * L.strength;
    S.kg = this.g.inv ? this.weigh() : 0;
    S.load = S.kg / S.carryKg;
    S.overloaded = S.load > 1;
    S.speedMul = S.overloaded ? CARRY.overSpeed : S.load > CARRY.slowAt ? CARRY.slowSpeed : 1;
    S.drainMul = S.load > CARRY.slowAt ? CARRY.slowDrain : 1;
  }

  // Per frame: xp for sprinting, swimming and hauling; the scale re-read twice a second (inventory changes anywhere).
  update(dt) {
    const g = this.g, p = g.player;
    if ((this.weighT -= dt) <= 0) { this.weighT = 0.5; this.recompute(); }
    if (!p.alive || p.inVehicle) return;
    const moving = p.speed > 1;
    if (moving && p.speed > 5) this.gain('endurance', XP.endurance.sprintPerSec * dt);
    if (p.swim) this.gain('endurance', XP.endurance.swimPerSec * dt);
    if (moving && g.skills.load >= XP.strength.heavyAt) this.gain('strength', XP.strength.heavyPerSec * dt);
  }

  view() {
    const S = this.g.skills;
    return {
      skills: Object.fromEntries(Object.keys(SKILLS).map((k) => [k, { level: this.lv[k], xp: +this.xp[k].toFixed(1), next: this.lv[k] >= MAX_LEVEL ? null : +this.need(this.lv[k]).toFixed(1), what: SKILLS[k].what }])),
      effects: { spreadMul: +S.spreadMul.toFixed(3), reloadMul: +S.reloadMul.toFixed(3), sprintDrainMul: +S.sprintDrainMul.toFixed(3) },
      carry: { kg: +S.kg.toFixed(1), capacityKg: +S.carryKg.toFixed(1), load: +S.load.toFixed(2), speedMul: S.speedMul, overloaded: S.overloaded },
    };
  }

  save() { return { lv: { ...this.lv }, xp: { ...this.xp } }; }
  load(s) { if (!s) return; Object.assign(this.lv, s.lv ?? {}); Object.assign(this.xp, s.xp ?? {}); this.recompute(); }
}
