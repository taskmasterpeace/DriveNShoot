import { NEEDS, STAGES, EFFECTS, CONSUMABLES, SLEEP, FEVER } from '../data/survival.js';

// The player's needs and body (data/survival.js; docs/design/WEB_SURVIVAL.md). g.needs holds the live values the
// HUD, the movement and the gun code read:
//   g.needs.water / food / rest  0..1
//   g.needs.pips  { water, food, rest }  0..4 wear pips
//   g.needs.staminaRegen, maxStamina, vignette, sway  the combined effect of every pip, and of a fever, right now
//   g.needs.fever  null | { until (game hour), treated }  BITE FEVER (canon: THE_INFECTED.md §3.6)
//   g.needs.blackout  seconds of a microsleep left (dead on your feet): the screen goes, the hands let go
// Drains on the game clock (fast-forward drains faster), never while dead, in a dialogue or in photo mode. Asleep
// (this.sleep), REST fills instead and water and food drain at SLEEP.drain of their waking rate.
export class Survival {
  constructor(game) {
    this.g = game;
    game.needs = { water: NEEDS.water.start, food: NEEDS.food.start, rest: NEEDS.rest.start, pips: { water: 0, food: 0, rest: 0 }, staminaRegen: 1, maxStamina: 1, vignette: 0, sway: 1, fever: null, blackout: 0 };
    this.hpAcc = 0;
    this.sleep = null;   // { kind, quality, slept (game hours), bed }
    this.microT = 60;    // seconds to the next microsleep while dead on your feet
    this.watchT = 0;     // asleep: seconds to the next look around for danger
    this.breathT = 0;    // fevered: seconds to the next laboured breath
  }

  pip(v) { let p = 0; for (const line of STAGES) if (v <= line) p++; return p; }
  hours() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }

  update(dt) {
    const g = this.g, p = g.player, N = g.needs;
    if (!p.alive) { if (this.sleep) this.wake('dead'); return; } // (god mode still gets thirsty; it just can't be hurt by it)
    const hours = dt * g.sky.timeScale * (g.sky.fast ? 40 : 1);
    const S = this.sleep;
    if (S) {
      S.slept += hours;
      if ((this.watchT -= dt) <= 0) { this.watchT = 0.5; const t = this.threat(SLEEP.wakeR); if (t) { this.wake(`${t} close by`); return; } }
    }
    const sprinting = !S && p.speed > 5 && !p.inVehicle, hot = g.sky.phase === 'DAY', F = N.fever;
    let regen = 1, maxSt = 1, vig = 0, hpPerMin = 0, sway = 1, micro = false;
    for (const key of Object.keys(NEEDS)) {
      const def = NEEDS[key];
      if (key === 'rest' && S) N.rest = Math.min(1, N.rest + SLEEP.perHour * S.quality * hours);
      else {
        let mul = S ? SLEEP.drain : (sprinting ? def.sprint : 1) * (hot ? def.dayHeat : 1);
        if (key === 'food' && F) mul *= FEVER.foodDrain;
        N[key] = Math.max(0, N[key] - def.drainPerHour * mul * hours);
      }
      const pip = this.pip(N[key]);
      if (pip !== N.pips[key]) {
        const worse = pip > N.pips[key];
        N.pips[key] = pip;
        if (pip > 0 && worse && !S) g.hud?.toast?.(`${def.words[pip]}${key === 'rest' ? ' · N TO SLEEP' : ''}`, pip >= 3 ? 'hot' : 'warn');
        g.emit('need', { need: key, pip, value: +N[key].toFixed(3), word: def.words[pip] || null });
      }
      const e = EFFECTS[key][pip];
      regen *= e.staminaRegen ?? 1; maxSt = Math.min(maxSt, e.maxStamina ?? 1);
      vig = Math.max(vig, e.vignette ?? 0); hpPerMin += e.hpPerMin ?? 0; sway *= e.sway ?? 1; micro ||= !!e.microsleep;
    }
    if (F) {
      regen *= FEVER.staminaRegen; sway *= FEVER.sway; vig = Math.max(vig, FEVER.vignette);
      if (!S && (this.breathT -= dt) <= 0) { this.breathT = 3.2 + Math.random() * 0.9; g.audio?.breath?.(F.treated ? 0.45 : 1); } // you can hear it
      if (this.hours() >= F.until) this.feverEnds('passed');
    }
    N.staminaRegen = regen; N.maxStamina = maxSt; N.vignette = vig; N.sway = sway;
    // Dead on your feet: the eyes close on their own, a second or two at a time, wherever you are.
    if (N.blackout > 0) N.blackout = Math.max(0, N.blackout - dt);
    if (micro && !S) {
      if ((this.microT -= dt) <= 0) {
        const M = SLEEP.microsleep;
        this.microT = M.every[0] + Math.random() * (M.every[1] - M.every[0]);
        N.blackout = M.secs;
        g.emit('microsleep', { secs: M.secs, driving: !!p.inVehicle });
      }
    } else this.microT = Math.max(this.microT, SLEEP.microsleep.every[0]);
    if (S && (N.rest >= 0.995 || S.slept >= SLEEP.maxHours)) this.wake('rested');
    if (hpPerMin < 0) {
      this.hpAcc += (-hpPerMin / 60) * dt;
      if (this.hpAcc >= 1) {
        const n = Math.floor(this.hpAcc); this.hpAcc -= n;
        g.combat.damage(p, n, null, 0, 0, N.water <= 0 ? 'thirst' : 'hunger');
      }
    }
  }

  // ---- sleep -------------------------------------------------------------------------------------------------
  // The nearest danger to the player within r: 'the infected', 'enemies', or null.
  threat(r) {
    const g = this.g, p = g.player;
    for (const c of g.chars) {
      if (c === p || !c.alive || Math.abs(c.x - p.x) > r || Math.abs(c.z - p.z) > r || Math.hypot(c.x - p.x, c.z - p.z) > r) continue;
      if (c.faction === 'zombie') return 'the infected';
      if (c.target === p || c.grudge === p || g.ai?.hostile?.(c, p)) return 'enemies';
    }
    return null;
  }

  // Lie down in a bed (bed = { x, z }), on a bedroll you carry, or on the bare ground. Refused at the wheel, when
  // you're not tired, or with danger in earshot. Returns { ok, text } | { ok: false, why }.
  sleepAt(kind, bed = null) {
    const g = this.g, p = g.player, N = g.needs;
    if (this.sleep) return { ok: false, why: 'you are already asleep' };
    if (!p.alive) return { ok: false, why: 'dead' };
    if (p.inVehicle && kind !== 'car') return { ok: false, why: 'not in a vehicle' };
    if (kind === 'car' && (!p.inVehicle || g.vehiclesSys.speed(p.inVehicle) > 0.4)) return { ok: false, why: p.inVehicle ? 'not while it rolls' : 'not in a car' };
    if (N.rest > SLEEP.tiredBelow) return { ok: false, why: 'you are not tired' };
    const t = this.threat(SLEEP.wakeR * 1.5);
    if (t) return { ok: false, why: `not with ${t} this close` };
    if (g.invUI?.open) g.invUI.toggle(false);
    this.sleep = { kind, quality: SLEEP.quality[kind] ?? SLEEP.quality.ground, slept: 0, bed };
    this.watchT = 0.5;
    if (bed) { p.x = bed.x; p.z = bed.z; p.face = bed.face ?? p.face; }
    p.sleeping = true; p.speed = 0; p.reloading = 0; p.bedY = bed?.bedY ?? (kind === 'bedroll' ? 0.05 : 0); // the body lies on what it lies on
    g.sky.fast = true; // the night goes by
    g.emit('sleep', { kind, quality: this.sleep.quality, rest: +N.rest.toFixed(3) });
    return { ok: true, text: kind === 'bed' ? 'YOU LIE DOWN' : kind === 'bedroll' ? 'YOU ROLL OUT THE BEDROLL' : kind === 'car' ? 'YOU TIP THE SEAT BACK' : 'YOU LIE DOWN ON THE BARE GROUND' };
  }

  // Up again: rested, woken (why says by what), or on your own (E). A full night, woken by nothing, breaks a fever
  // that antibiotics have treated.
  wake(why = 'you got up') {
    const g = this.g, S = this.sleep, p = g.player;
    if (!S) return null;
    this.sleep = null; p.sleeping = false; g.sky.fast = false;
    const full = why === 'rested' && S.slept >= SLEEP.fullNight, F = g.needs.fever;
    if (full && F?.treated) this.feverEnds('broke');
    const h = Math.round(S.slept * 10) / 10;
    this.lastWake = { why, hours: h, full };
    if (why !== 'dead') g.hud?.toast?.(why === 'rested' ? `SLEPT ${Math.max(1, Math.round(S.slept))} H · RESTED` : `${why === 'you got up' ? 'UP' : `WOKEN · ${why.toUpperCase()}`} · ${Math.round(S.slept)} H`, why === 'rested' ? 'job' : 'warn');
    g.emit('wake', { why, hours: h, full, rest: +g.needs.rest.toFixed(3) });
    return { why, hours: h, full };
  }

  // Asleep and hurt, or a noise that reaches you (main.js noise): up at once.
  hurt() { if (this.sleep) this.wake('hurt'); }
  heard(x, z, r) {
    if (!this.sleep) return;
    const p = this.g.player;
    if (Math.hypot(x - p.x, z - p.z) <= Math.min(r, SLEEP.wakeNoise)) this.wake('a noise');
  }

  // ---- bite fever ----------------------------------------------------------------------------------------------
  // A bite from the infected landed: BITE FEVER starts, or a new dirty wound starts its clock again (and undoes a
  // treatment: it's a new wound).
  bitten() {
    const g = this.g, N = g.needs, was = !!N.fever;
    N.fever = { until: this.hours() + FEVER.hours, treated: false };
    if (!was) g.hud?.toast?.('BITTEN · THE WOUND IS DIRTY', 'hot');
    g.emit('fever', { state: was ? 'renewed' : 'started', until: +N.fever.until.toFixed(2) });
  }

  // Antibiotics taken (inventory.js, the `cure` use). Returns the line to show, or null with no fever to treat.
  antibiotics() {
    const F = this.g.needs.fever;
    if (!F) return null;
    if (!F.treated) { F.treated = true; this.g.emit('fever', { state: 'treated' }); }
    return 'TREATED · A FULL NIGHT\'S SLEEP WILL BREAK IT';
  }

  feverEnds(how) {
    const g = this.g;
    if (!g.needs.fever) return;
    g.needs.fever = null;
    g.hud?.toast?.(how === 'broke' ? 'THE FEVER BROKE' : 'THE FEVER PASSED', 'job');
    g.emit('fever', { state: how });
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
    const N = this.g.needs, F = N.fever, S = this.sleep;
    const words = {}, hoursLeft = {};
    for (const k of Object.keys(NEEDS)) { words[k] = NEEDS[k].words[N.pips[k]] || null; hoursLeft[k] = +(N[k] / NEEDS[k].drainPerHour).toFixed(1); }
    return {
      water: +N.water.toFixed(3), food: +N.food.toFixed(3), rest: +N.rest.toFixed(3), pips: { ...N.pips }, words,
      effects: { staminaRegen: +N.staminaRegen.toFixed(2), maxStamina: +N.maxStamina.toFixed(2), vignette: N.vignette, sway: +N.sway.toFixed(3), blackout: +N.blackout.toFixed(2) },
      hoursLeft,
      fever: F ? { hoursLeft: +(F.until - this.hours()).toFixed(1), treated: F.treated } : null,
      asleep: S ? { kind: S.kind, quality: S.quality, hours: +S.slept.toFixed(2) } : null,
    };
  }

  save() { const N = this.g.needs; return { water: N.water, food: N.food, rest: N.rest, fever: N.fever ? { ...N.fever } : null }; }
  load(s) {
    if (!s) return;
    const N = this.g.needs;
    if (this.sleep) this.wake('dead'); // a load never resumes a sleep
    N.water = s.water ?? N.water; N.food = s.food ?? N.food; N.rest = s.rest ?? NEEDS.rest.start;
    N.fever = s.fever ? { until: s.fever.until, treated: !!s.fever.treated } : null; // an older save: no fever
    for (const k of Object.keys(NEEDS)) N.pips[k] = this.pip(N[k]);
  }
}
