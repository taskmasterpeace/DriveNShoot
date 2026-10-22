import { NEEDS, STAGES, EFFECTS, CONSUMABLES } from '../data/survival.js';

// The player's needs (data/survival.js). g.needs holds the live values the HUD and the movement code read:
//   g.needs.water / g.needs.food  0..1
//   g.needs.pips  { water, food }  0..4 wear pips
//   g.needs.staminaRegen, maxStamina, vignette  the combined effect of every pip right now
// Drains on the game clock (fast-forward drains faster), never while dead, in a dialogue or in photo mode.
export class Survival {
  constructor(game) {
    this.g = game;
    game.needs = { water: NEEDS.water.start, food: NEEDS.food.start, pips: { water: 0, food: 0 }, staminaRegen: 1, maxStamina: 1, vignette: 0 };
    this.hpAcc = 0;
  }

  pip(v) { let p = 0; for (const line of STAGES) if (v <= line) p++; return p; }

  update(dt) {
    const g = this.g, p = g.player, N = g.needs;
    if (!p.alive) return; // (god mode still gets thirsty; it just can't be hurt by it)
    const hours = dt * g.sky.timeScale * (g.sky.fast ? 40 : 1);
    const sprinting = p.speed > 5 && !p.inVehicle, hot = g.sky.phase === 'DAY';
    let regen = 1, maxSt = 1, vig = 0, hpPerMin = 0;
    for (const key of Object.keys(NEEDS)) {
      const def = NEEDS[key];
      const mul = (sprinting ? def.sprint : 1) * (hot ? def.dayHeat : 1);
      N[key] = Math.max(0, N[key] - def.drainPerHour * mul * hours);
      const pip = this.pip(N[key]);
      if (pip !== N.pips[key]) {
        const worse = pip > N.pips[key];
        N.pips[key] = pip;
        if (pip > 0 && worse) g.hud?.toast?.(def.words[pip], pip >= 3 ? 'hot' : 'warn');
        g.emit('need', { need: key, pip, value: +N[key].toFixed(3), word: def.words[pip] || null });
      }
      const e = EFFECTS[key][pip];
      regen *= e.staminaRegen ?? 1; maxSt = Math.min(maxSt, e.maxStamina ?? 1);
      vig = Math.max(vig, e.vignette ?? 0); hpPerMin += e.hpPerMin ?? 0;
    }
    N.staminaRegen = regen; N.maxStamina = maxSt; N.vignette = vig;
    if (hpPerMin < 0) {
      this.hpAcc += (-hpPerMin / 60) * dt;
      if (this.hpAcc >= 1) {
        const n = Math.floor(this.hpAcc); this.hpAcc -= n;
        g.combat.damage(p, n, null, 0, 0, N.water <= 0 ? 'thirst' : 'hunger');
      }
    }
  }

  // Eat or drink something from CONSUMABLES. Returns the text to float, or null if it's unknown.
  consume(kind) {
    const c = CONSUMABLES[kind], g = this.g;
    if (!c) return null;
    g.needs[c.need] = Math.min(1, g.needs[c.need] + c.amount);
    if (c.hp) g.player.hp = Math.min(g.player.maxHp, g.player.hp + c.hp);
    g.needs.pips[c.need] = this.pip(g.needs[c.need]);
    g.emit('consumed', { kind, need: c.need, value: +g.needs[c.need].toFixed(3) });
    return c.text;
  }

  view() {
    const N = this.g.needs;
    return {
      water: +N.water.toFixed(3), food: +N.food.toFixed(3), pips: { ...N.pips },
      words: { water: NEEDS.water.words[N.pips.water] || null, food: NEEDS.food.words[N.pips.food] || null },
      effects: { staminaRegen: +N.staminaRegen.toFixed(2), maxStamina: +N.maxStamina.toFixed(2), vignette: N.vignette },
      hoursLeft: { water: +(N.water / NEEDS.water.drainPerHour).toFixed(1), food: +(N.food / NEEDS.food.drainPerHour).toFixed(1) },
    };
  }

  save() { const N = this.g.needs; return { water: N.water, food: N.food }; }
  load(s) { if (!s) return; const N = this.g.needs; N.water = s.water ?? N.water; N.food = s.food ?? N.food; N.pips.water = this.pip(N.water); N.pips.food = this.pip(N.food); }
}
