import * as THREE from 'three';
import {
  NEEDS, STAGES, EFFECTS, CONSUMABLES, SLEEP, FEVER, PROFILES, CLIMATE, WARMTH, WET, BODY_EFFECTS, INJURIES, MAX_WOUNDS, WOUND_FROM,
  INFECTION, SICKNESS, TREATMENTS, MED_ITEMS, MED_LOOT, MOODS, APPRAISALS, MOOD_EFFECTS, SHELTER, HOLD, SLEEP_COMFORT, PROWL, CONDITION,
} from '../data/survival.js';
import { ITEMS, LOOT } from '../data/items.js';
import { HIT_ODDS } from '../data/gear.js';
import { woundPart, DOLL_PART_IDS, WOUND_PARTS } from '../data/bodydoll.js';
import { Upkeep } from './upkeep.js';
import { Telltales } from '../ui/telltales.js';

const MATS = 48;
const _m = new THREE.Object3D();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// Hits the body does to itself: no wound, no fright (the need that did it is already on the HUD).
const SELF = new Set(['thirst', 'hunger', 'bleeding', 'cold', 'heat', 'infection', 'burn', 'exposure', 'sickness', 'drown', 'fire']);

// The wound rows' new things to carry (splint, disinfectant, burn salve, motor oil) join the item table and the loot
// tables once, at import: rows, not code (data/survival.js MED_ITEMS, MED_LOOT).
for (const [id, row] of Object.entries(MED_ITEMS)) if (!ITEMS[id]) ITEMS[id] = row;
for (const [t, rows] of Object.entries(MED_LOOT)) { const L = LOOT[t]; if (L) for (const r of rows) if (!L.rows.some((x) => x[0] === r[0])) L.rows.push(r); }

// The player's needs and body (data/survival.js; docs/design/WEB_SURVIVAL.md). g.needs holds the live values the HUD, the
// movement and the gun code read:
//   water / food / rest 0..1, warmth 0..1 (0.5 comfortable), wet 0..1, mood { fear, gloom, boredom } 0..10
//   pips { water, food, rest, cold, hot, wet, fear, gloom, boredom } 0..4
//   wounds [{ kind, left, open, clean, set, dirt, heal }], infection null | { since }, sick null | { kind, until }
//   fever null | { until, treated }  BITE FEVER (canon: THE_INFECTED.md §3.6)
//   the single consumers, every state folded: staminaRegen, maxStamina, sway, speedMul, healMul, sight, vignette, blackout
//   shelter 'hold' | 'house' | 'car' | 'rough', air and felt (degrees C), condition { value, word }
// Drains on the game clock (fast-forward drains faster), never while dead, in a dialogue or in photo mode. Asleep, REST
// fills instead (at the bed's quality x the shelter's x the comfort of the night) and water and food drain at SLEEP.drain.
export class Survival {
  constructor(game) {
    this.g = game;
    game.needs = {
      water: NEEDS.water.start, food: NEEDS.food.start, rest: NEEDS.rest.start, warmth: 0.5, wet: 0,
      mood: { fear: 0, gloom: 0, boredom: 0 }, wounds: [], infection: null, sick: null,
      pips: { water: 0, food: 0, rest: 0, cold: 0, hot: 0, wet: 0, fear: 0, gloom: 0, boredom: 0 },
      staminaRegen: 1, maxStamina: 1, vignette: 0, sway: 1, speedMul: 1, healMul: 1, sight: 1, fever: null, blackout: 0,
      shelter: 'rough', air: 20, felt: 20, condition: { value: 100, word: 'SOUND' },
    };
    this.profileName = 'full';
    this.prof = PROFILES.full;
    this.hpAcc = 0;
    this.hurtBy = 'hunger';
    this.waterMul = 1; this.foodMul = 1; this.gloomMul = 1;
    this.sleep = null;   // { kind, quality, slept (game hours), bed, shelter, rest (its multiplier), danger, risk, building, barred, q }
    this.microT = 60;    // seconds to the next microsleep while dead on your feet
    this.watchT = 0;     // asleep: seconds to the next look around for danger
    this.breathT = 0;    // fevered: seconds to the next laboured breath
    this.matT = 0;       // seconds to the next look at who sleeps on the floor (the mats)
    this.scanT = 0;      // seconds to the next look around for who is near (mood pressures)
    this.near = { hostile: 0, infected: 0, company: false }; // how many within reach (look())
    this.evSeq = 0;      // the last event (g.events) the body has read: hits, kills, talk, searches
    this.charred0 = 0;   // how burnt the player was last frame (fire is a quiet hurt: no event)
    this.hold = null;    // the house you hold: { key, name, minX, maxX, minZ, maxZ, bi, ring }
    this.acc = { regen: 1, maxSt: 1, vig: 0, hpm: 0, sway: 1, micro: false, speed: 1, heal: 1, sight: 1, water: 1, food: 1, gloom: 1, worst: 0, why: 'hunger' };
    this.buildMats(game.scene);
    this.upkeep = game.upkeep = new Upkeep(game);
    this.ui = null;      // the telltales (ui/telltales.js), built once the HUD exists
  }

  setProfile(name) {
    if (!PROFILES[name]) return false;
    this.profileName = name; this.prof = PROFILES[name];
    return true;
  }

  pip(v) { let p = 0; for (const line of STAGES) if (v <= line) p++; return p; }
  lineUp(v, lines) { let p = 0; for (const l of lines) if (v >= l) p++; return p; }
  lineDown(v, lines) { let p = 0; for (const l of lines) if (v <= l) p++; return p; }
  hours() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }

  // ---- the air ------------------------------------------------------------------------------------------------
  // Degrees C in the open right now: a cosine from the dawn low to the afternoon high, shifted by the weather.
  airAt(hour = this.g.sky?.time ?? 12, wx = this.g.sky?.weatherKey ?? 'CLEAR') {
    const C = CLIMATE, rise = (C.highAt - C.lowAt + 24) % 24;
    const t = ((hour - C.lowAt) % 24 + 24) % 24;
    const k = t <= rise ? 0.5 - 0.5 * Math.cos(Math.PI * t / rise) : 0.5 + 0.5 * Math.cos(Math.PI * (t - rise) / (24 - rise));
    return C.low + (C.high - C.low) * k + (C.weather[wx] ?? 0);
  }
  // Where the player is, as shelter: 'hold' (the house you hold), 'house' (under any roof), 'car' (a closed car), 'rough'.
  shelterKind() {
    const g = this.g, p = g.player, v = p.inVehicle;
    if (v) return v.open || v.bike || v.boat ? 'rough' : 'car';
    const b = g.insideBuilding;
    if (!b) return g.homes?.shelterKind() ?? 'rough'; // your pitched camp (systems/homes.js)
    return this.isHold(b) ? 'hold' : 'house';
  }
  isHold(b) { const H = this.hold; return !!(H && b && Math.abs(b.minX - H.minX) < 0.01 && Math.abs(b.maxX - H.maxX) < 0.01 && Math.abs(b.minZ - H.minZ) < 0.01 && Math.abs(b.maxZ - H.maxZ) < 0.01); }

  // ---- the frame ----------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g, p = g.player, N = g.needs, PR = this.prof;
    this.layMats(dt);
    if (!this.ui && g.hud?.el?.hud && typeof document !== 'undefined') this.ui = new Telltales(g, g.hud.el.hud);
    this.readEvents();
    this.upkeep.update(dt);
    if (!p.alive) { if (this.sleep) this.wake('dead'); this.ui?.update(dt); return; } // (god mode still gets thirsty; it just can't be hurt by it)
    const hours = dt * g.sky.timeScale * (g.sky.fast ? 40 : 1);
    const S = this.sleep;
    if (S) {
      S.slept += hours;
      if ((this.watchT -= dt) <= 0) { this.watchT = 0.5; const t = this.threat(SLEEP.wakeR * (g.sheet?.fx.wakeMul ?? 1) * (g.deep?.fx.wakeMul ?? 1)); if (t) { this.wake(`${t} close by`); this.ui?.update(dt); return; } } // a light sleeper hears them sooner (data/creator.js)
    }
    const sprinting = !S && p.speed > 5 && !p.inVehicle, hot = g.sky.phase === 'DAY', F = N.fever;
    if ((this.scanT -= dt) <= 0) { this.scanT = 0.25; this.look(); }
    const kind = this.shelterKind(), SH = SHELTER[kind];
    N.shelter = kind;

    // The air and the body's heat; rain and the river soak you.
    N.air = this.airAt();
    if (PR.climate) {
      const inside = kind !== 'rough';
      const rain = g.sky.cur?.rain ?? 0;
      if (!inside && rain > 0.05) N.wet = Math.min(1, N.wet + WET.rain * rain * hours);
      const wetState = g.lastWet;
      if (wetState === 'swim') N.wet = 1; else if (wetState === 'wade') N.wet = Math.max(N.wet, 0.7);
      if (!(rain > 0.05 && !inside) && wetState !== 'swim' && wetState !== 'wade') N.wet = Math.max(0, N.wet - WET.dry * hours * (N.air > 30 ? WET.heatDry : 1) * (inside ? WET.indoorDry : 1));
      const v = p.inVehicle, pull = kind === 'car' && SH.running && !S && !v.dead && v.fuel > 0 && g.vehiclesSys.speed(v) > 1 ? SH.running : SH.pull; // on the move: the heater runs
      const felt = N.air + (SH.to - N.air) * pull + (sprinting ? CLIMATE.sprintHeat : 0) - N.wet * CLIMATE.wetChill + (S ? CLIMATE.asleepWarm[S.kind] ?? 0 : 0);
      N.felt = felt;
      const target = clamp01(0.5 + (felt - CLIMATE.comfort) / CLIMATE.span);
      if (hours > 0) N.warmth += (target - N.warmth) * (1 - Math.exp(-CLIMATE.rate * hours));
    } else N.felt = N.air;
    this.setPip('cold', this.lineDown(N.warmth, WARMTH.cold.lines), WARMTH.cold.words, S);
    this.setPip('hot', this.lineUp(N.warmth, WARMTH.hot.lines), WARMTH.hot.words, S);
    this.setPip('wet', this.lineUp(N.wet, WET.lines), WET.words, S);

    // Wounds bleed, gather dirt, mend; a dirty one turns into an infection; food poisoning runs its hours.
    if (PR.injuries) this.tendWounds(hours, S);
    if (N.sick && this.hours() >= N.sick.until) { const over = SICKNESS[N.sick.kind]?.over ?? 'YOUR STOMACH SETTLES'; N.sick = null; g.hud?.toast?.(over, 'job'); g.emit('sick', { state: 'over' }); } // a row may say how it ends (brine sickness, systems/clone.js)

    // Mood: the pressures of the moment push the drives; the moods settle on their own.
    if (PR.mood) this.moodTick(dt, hours, S, kind);
    for (const k of Object.keys(MOODS)) this.setPip(k, this.lineUp(N.mood[k], MOODS[k].lines), MOODS[k].words, S);

    // Fold every state into the single consumers.
    const A = this.acc;
    A.regen = 1; A.maxSt = 1; A.vig = 0; A.hpm = 0; A.sway = 1; A.micro = false; A.speed = 1; A.heal = 1; A.sight = 1; A.water = 1; A.food = 1; A.gloom = 1; A.worst = 0; A.why = 'hunger';
    for (const key of Object.keys(NEEDS)) {
      const def = NEEDS[key];
      if (key === 'rest' && S) N.rest = Math.min(1, N.rest + SLEEP.perHour * this.sleepQuality() * hours);
      else {
        let mul = S ? SLEEP.drain : (sprinting ? def.sprint : 1) * (hot ? def.dayHeat : 1);
        if (key === 'food' && F) mul *= FEVER.foodDrain;
        if (key === 'water') mul *= this.waterMul;
        if (key === 'food') mul *= this.foodMul;
        mul *= (g.sheet?.fx.drain[key] ?? 1) * (key === 'rest' ? 1 : g.deep?.fx.drainMul ?? 1); // the deep sheet: Grit, Hardy, Cooking (systems/stats.js); an iron gut, a dry mouth (the traits you were made with, data/creator.js)
        N[key] = Math.max(0, N[key] - def.drainPerHour * mul * hours);
      }
      const pip = this.pip(N[key]);
      if (pip !== N.pips[key]) {
        const worse = pip > N.pips[key];
        N.pips[key] = pip;
        if (pip > 0 && worse && !S) g.hud?.toast?.(`${def.words[pip]}${key === 'rest' ? ' · N TO SLEEP' : ''}`, pip >= 3 ? 'hot' : 'warn');
        g.emit('need', { need: key, pip, value: +N[key].toFixed(3), word: def.words[pip] || null });
      }
      this.fold(EFFECTS[key][pip], key === 'water' ? 'thirst' : key === 'food' ? 'hunger' : 'exhaustion');
    }
    this.fold(BODY_EFFECTS.cold[N.pips.cold], 'cold');
    this.fold(BODY_EFFECTS.hot[N.pips.hot], 'heat');
    this.fold(BODY_EFFECTS.wet[N.pips.wet], 'exposure');
    for (const k of Object.keys(MOODS)) this.fold(MOOD_EFFECTS[k][N.pips[k]], 'gloom');
    for (const w of N.wounds) {
      const def = INJURIES[w.kind];
      this.fold(w.open || (def.needs.includes('splint') && !w.set) ? def.eff : def.dressed, w.kind === 'burn' ? 'burn' : 'bleeding');
      if (w.open && def.bleeds) this.foldHp(-def.bleeds, 'bleeding');
      if (w.open && def.hpPerMin) this.foldHp(def.hpPerMin, 'burn');
    }
    if (N.infection) { this.fold(INFECTION.eff, 'infection'); if (this.hours() - N.infection.since > INFECTION.hurtsAfter) this.foldHp(INFECTION.hpPerMin, 'infection'); }
    if (N.sick) this.fold(SICKNESS[N.sick.kind]?.eff, 'sickness');
    if (F) {
      A.regen *= FEVER.staminaRegen; A.sway *= FEVER.sway; A.vig = Math.max(A.vig, FEVER.vignette);
      if (!S && (this.breathT -= dt) <= 0) { this.breathT = 3.2 + Math.random() * 0.9; g.audio?.breath?.(F.treated ? 0.45 : 1); } // you can hear it
      if (this.hours() >= F.until) this.feverEnds('passed');
    }
    N.staminaRegen = A.regen; N.maxStamina = A.maxSt; N.vignette = A.vig; N.sway = A.sway;
    N.speedMul = A.speed; N.healMul = A.heal * (g.deep?.fx.healMul ?? 1); N.sight = A.sight; // healMul: + Grit, First aid, Resilient (systems/stats.js)
    this.waterMul = A.water; this.foodMul = A.food; this.gloomMul = A.gloom;
    N.condition = this.condition();
    // Dead on your feet: the eyes close on their own, a second or two at a time, wherever you are.
    if (N.blackout > 0) N.blackout = Math.max(0, N.blackout - dt);
    if (A.micro && !S) {
      if ((this.microT -= dt) <= 0) {
        const M = SLEEP.microsleep;
        this.microT = M.every[0] + Math.random() * (M.every[1] - M.every[0]);
        N.blackout = M.secs;
        g.emit('microsleep', { secs: M.secs, driving: !!p.inVehicle });
      }
    } else this.microT = Math.max(this.microT, SLEEP.microsleep.every[0]);
    if (S) {
      S.q += this.sleepQuality() * hours;
      if (this.prof.shelter !== false && S.danger > 0 && hours > 0) {
        S.risk += S.danger * hours * (PROWL.jitter[0] + Math.random() * (PROWL.jitter[1] - PROWL.jitter[0]));
        if (S.risk >= 1) { S.risk -= 1; this.prowl(); }
      }
    }
    if (S && (N.rest >= 0.995 || S.slept >= SLEEP.maxHours)) this.wake('rested');
    if (A.hpm < 0) {
      this.hpAcc += (-A.hpm / 60) * dt;
      if (this.hpAcc >= 1) {
        const n = Math.floor(this.hpAcc); this.hpAcc -= n;
        g.combat.damage(p, n, null, 0, 0, A.why);
      }
    }
    this.ui?.update(dt);
  }

  // One state's costs into the running fold. `why` names it if it is the one taking the most health.
  fold(e, why) {
    if (!e) return;
    const A = this.acc;
    if (e.staminaRegen) A.regen *= e.staminaRegen;
    if (e.maxStamina) A.maxSt = Math.min(A.maxSt, e.maxStamina);
    if (e.vignette) A.vig = Math.max(A.vig, e.vignette);
    if (e.sway) A.sway *= e.sway;
    if (e.microsleep) A.micro = true;
    if (e.speedMul) A.speed *= e.speedMul;
    if (e.healMul) A.heal *= e.healMul;
    if (e.sight) A.sight = Math.min(A.sight, e.sight);
    if (e.waterMul) A.water *= e.waterMul;
    if (e.foodMul) A.food *= e.foodMul;
    if (e.gloomMul) A.gloom *= e.gloomMul;
    if (e.hpPerMin) this.foldHp(e.hpPerMin, why);
  }
  foldHp(v, why) { const A = this.acc; A.hpm += v; if (v < A.worst) { A.worst = v; A.why = why; } }

  setPip(key, pip, words, asleep) {
    const N = this.g.needs, was = N.pips[key] ?? 0;
    if (pip === was) return;
    N.pips[key] = pip;
    if (pip > was && pip >= 2 && !asleep) this.g.hud?.toast?.(words[pip], pip >= 3 ? 'hot' : 'warn');
    this.g.emit('need', { need: key, pip, word: words[pip] || null });
  }

  // CONDITION: every state folded into one 0-100 number and a word (data/survival.js CONDITION).
  condition() {
    const N = this.g.needs, C = CONDITION;
    let v = 100;
    for (const [k, w] of Object.entries(C.weights)) v -= (N.pips[k] ?? 0) ** 1.5 * C.pip * w;
    for (const w of N.wounds) v -= C.wound + (w.open ? C.open : 0);
    if (N.infection) v -= C.sick;
    if (N.fever) v -= C.sick * (N.fever.treated ? 0.5 : 1);
    if (N.sick) v -= C.sick;
    const p = this.g.player;
    if (p) v -= Math.max(0, (1 - p.hp / p.maxHp)) * 30;
    v = Math.max(0, Math.round(v));
    return { value: v, word: C.words.find(([min]) => v >= min)?.[1] ?? 'DYING' };
  }

  // ---- what happened to you (the event log) --------------------------------------------------------------------
  readEvents() {
    const g = this.g, E = g.events;
    if (!E?.length) return;
    let i = E.length - 1;
    while (i > 0 && E[i - 1].seq > this.evSeq) i--;
    for (; i < E.length; i++) {
      const e = E[i];
      if (e.seq <= this.evSeq) continue;
      this.evSeq = e.seq;
      this.onEvent(e);
    }
  }
  onEvent(e) {
    const g = this.g, PR = this.prof, pid = g.player?.id;
    if (e.type === 'hurt') {
      if (e.cause === 'sickness' && PR.injuries) this.sicken('poisoning');
      if (SELF.has(e.cause)) return;
      if (PR.mood) this.appraise('hurt', Math.min(2, (e.amount ?? 10) / 15));
      if (PR.injuries) {
        const cause = e.cause === 'bullet' && !e.by ? 'impact' : e.cause;
        for (const [kind, chance, min] of WOUND_FROM[cause] ?? []) if ((e.amount ?? 0) >= min && Math.random() < chance) { this.wound(kind, { part: woundPart(e.part, HIT_ODDS[cause]) }); break; } // on the part the hit landed on (data/bodydoll.js)
      }
    } else if (e.type === 'kill') {
      if (!PR.mood) return;
      if (e.faction === 'ally' && e.victim !== pid) this.appraise('allyDied');
      else if (e.by === pid) this.appraise('killed');
    } else if (e.type === 'dialogueOpen' || e.type === 'trade') { if (PR.mood) { this.appraise('talked'); this.lastTalk = this.hours(); } }
    else if (e.type === 'containerOpened') { if (PR.mood) this.appraise('searched'); }
  }

  // ---- wounds --------------------------------------------------------------------------------------------------
  // A new wound of `kind` (INJURIES). Returns it.
  wound(kind, opts = {}) {
    const g = this.g, N = g.needs, def = INJURIES[kind];
    if (!def) return null;
    if (N.wounds.length >= MAX_WOUNDS) N.wounds.shift(); // the oldest has half-mended under the new ones
    const w = { kind, left: def.heal, open: def.bleeds > 0 || def.needs.includes('bandage'), clean: !def.dirt, set: false, dirt: 0, heal: 1, at: +this.hours().toFixed(2), ...opts };
    w.part = DOLL_PART_IDS.includes(w.part) ? w.part : woundPart(w.part, null); // where it is (the body doll): a gear part picks a side, none is the torso
    const can = WOUND_PARTS[kind]; if (can && !can.includes(w.part)) w.part = can[Math.floor(Math.random() * can.length)]; // a sprain is a limb's
    N.wounds.push(w);
    if (def.bleeds && w.open) g.player.bleed = Math.max(g.player.bleed ?? 0, 0.5);
    g.hud?.toast?.(`${def.label}${def.bleeds ? ' · BLEEDING' : ''}${def.needs.includes('splint') ? ' · SPLINT IT' : ''}`, 'hot');
    g.emit('wound', { kind, open: w.open });
    return w;
  }
  tendWounds(hours, S) {
    const g = this.g, N = g.needs, p = g.player;
    // Fire is a quiet hurt (no event): the char on your clothes is the tell.
    const ch = p.charred ?? 0;
    if (ch > this.charred0 + 0.02 && !N.wounds.some((w) => w.kind === 'burn' && w.open)) this.wound('burn');
    this.charred0 = ch;
    for (let i = N.wounds.length - 1; i >= 0; i--) {
      const w = N.wounds[i], def = INJURIES[w.kind];
      if (w.open && def.bleeds) p.bleed = Math.max(p.bleed ?? 0, 0.35); // it drips (main.js lays the trail)
      if (def.dirt && !w.clean && hours > 0) {
        w.dirt += def.dirt * hours * (w.open ? 1.5 : 1);
        if (w.dirt >= 1 && !N.infection) { N.infection = { since: +this.hours().toFixed(2) }; g.hud?.toast?.('WOUND INFECTION · ANTIBIOTICS', 'hot'); g.emit('infection', { state: 'started', from: w.kind }); }
        if (w.dirt >= 1) w.clean = true; // it has done its harm
      }
      const unset = def.needs.includes('splint') && !w.set;
      w.left -= hours * N.healMul * w.heal * (unset ? def.slow ?? 1 : w.open && def.bleeds ? 0.5 : 1);
      if (w.left <= 0) { N.wounds.splice(i, 1); if (!S) g.hud?.toast?.(`${def.label.replace('BROKEN BONE', 'THE BONE')} · HEALED`, 'job'); g.emit('wound', { kind: w.kind, healed: true }); }
    }
  }
  sicken(kind) {
    const N = this.g.needs, row = SICKNESS[kind];
    if (!row) return;
    const was = N.sick;
    N.sick = { kind, until: +(this.hours() + row.hours).toFixed(2) };
    if (!was) this.g.hud?.toast?.('SICK TO YOUR STOMACH', 'hot');
    this.g.emit('sick', { state: 'started', kind });
  }

  // A carried thing used on the body or the car (TREATMENTS, by item id). inventory.js asks before the item's own hp and
  // bleed land. null: nothing for this layer to do (the item works as before); { ok: false, why }: refused, not used up.
  useItem(id) {
    const T = TREATMENTS[id], g = this.g, N = g.needs;
    if (!T) return null;
    const texts = [];
    if (T.oil) { const r = this.upkeep.oilUp(T.oil); if (!r.ok) return r; texts.push(r.text); }
    const ws = N.wounds.filter((w) => !T.only || w.kind === T.only);
    let did = false;
    if (T.bandage) for (const w of ws) if (w.open && INJURIES[w.kind].needs.includes('bandage')) { w.open = false; did = true; if (T.dirty) w.dirt += T.dirty; if (T.heal) w.heal = Math.max(w.heal, T.heal); texts.push(`${INJURIES[w.kind].label.split(' ')[0]} DRESSED`); }
    if (T.disinfect) for (const w of ws) if (!w.clean && INJURIES[w.kind].dirt) { w.clean = true; w.dirt = 0; did = true; if (T.heal) w.heal = Math.max(w.heal, T.heal); texts.push('CLEANED'); }
    if (T.splint) for (const w of ws) if (!w.set && INJURIES[w.kind].needs.includes('splint')) { w.set = true; did = true; if (T.heal) w.heal = Math.max(w.heal, T.heal); texts.push(w.kind === 'fracture' ? 'BONE SET' : 'JOINT STRAPPED'); }
    if (T.calm && N.mood.fear > 0) { N.mood.fear = Math.max(0, N.mood.fear - T.calm); did = true; texts.push('STEADIER'); }
    if (T.gloom && N.mood.gloom > 0) { N.mood.gloom = Math.max(0, N.mood.gloom - T.gloom); did = true; }
    if (did) g.emit('treated', { item: id, text: texts.join(' · ') });
    if (T.must && !did && !T.oil) return { ok: false, why: T.splint ? 'nothing on you needs setting' : T.only ? `no ${T.only} to dress` : 'no wound that needs it' };
    return { ok: true, text: [...new Set(texts)].join(' · ') };
  }

  // ---- mood ----------------------------------------------------------------------------------------------------
  // Who is near, four times a second: someone who means to kill you, one of the infected, someone riding with you.
  look() {
    const g = this.g, p = g.player, n = this.near;
    n.hostile = 0; n.infected = 0; n.company = false;
    for (const c of g.chars) {
      if (c === p || !c.alive) continue;
      const dx = Math.abs(c.x - p.x), dz = Math.abs(c.z - p.z);
      if (dx > 30 || dz > 30) continue;
      if (c.faction === 'zombie') { if (dx < 14 && dz < 14 && Math.hypot(dx, dz) < 14) n.infected++; continue; }
      if (c.follower && dx < 20 && dz < 20) n.company = true;
      else if ((c.target === p || c.grudge === p) && Math.hypot(dx, dz) < 30) n.hostile++;
    }
  }
  // An event appraised: each drive it touches, scaled. A thwarted drive raises its mood; a served one lowers it.
  appraise(key, scale = 1, dtOrHours = 1) {
    const a = APPRAISALS[key];
    if (!a) return;
    for (const [m, row] of Object.entries(MOODS)) {
      const push = (a[row.drive] ?? 0) * scale * dtOrHours;
      if (!push) continue;
      this.feel(m, push < 0 ? -push * (m === 'gloom' ? this.gloomMul : 1) : -push);
    }
  }
  feel(mood, amt) { const M = this.g.needs.mood; M[mood] = Math.max(0, Math.min(10, M[mood] + amt)); }
  moodTick(dt, hours, S, kind) {
    const g = this.g, p = g.player, n = this.near, M = g.needs.mood;
    const fear0 = M.fear;
    if (!S) {
      if (n.infected) this.appraise('infectedNear', Math.min(3, n.infected), dt);
      if (n.hostile) this.appraise('hostileNear', Math.min(3, n.hostile), dt);
      if ((g.sky.night ?? 0) > 0.6 && kind === 'rough' && !p.inVehicle) this.appraise('darkOutside', 1, dt);
      if (kind !== 'rough' && !n.hostile && !n.infected) this.appraise('sheltered', 1, dt);
      if (n.company) this.appraise('company', 1, hours); else if (!g.dialogue?.active) this.appraise('alone', 1, hours);
      const moving = p.inVehicle ? g.vehiclesSys.speed(p.inVehicle) > 3 : p.speed > 1.5;
      if (moving || n.hostile) this.appraise('busy', 1, hours); else if (!g.dialogue?.active) this.appraise('idle', 1, hours);
    }
    if (M.fear <= fear0) M.fear = Math.max(0, M.fear - MOODS.fear.fade * dt);
    M.gloom = Math.max(0, M.gloom - MOODS.gloom.fade * hours);
    M.boredom = Math.max(0, M.boredom - MOODS.boredom.fade * hours * (S ? 3 : 1)); // a night's sleep passes the time
  }

  // ---- floor mats --------------------------------------------------------------------------------------------
  // A rolled-out bedroll under everyone asleep on the floor or the ground (bedY under 0.1: no mattress), re-laid four
  // times a second. One InstancedMesh, hidden when nobody needs one.
  buildMats(scene) {
    if (!scene) return;
    const geo = new THREE.BoxGeometry(0.82, 0.05, 2.05); geo.translate(0, 0.025, 0);
    this.mats = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.95 }), MATS);
    this.mats.count = 0; this.mats.visible = false; this.mats.receiveShadow = true;
    const cols = ['#4a5236', '#5a4a34', '#3f4a44', '#5d5440'].map((c) => new THREE.Color(c));
    for (let i = 0; i < MATS; i++) this.mats.setColorAt(i, cols[i % cols.length]);
    scene.add(this.mats);
  }
  layMats(dt) {
    const m = this.mats;
    if (!m || (this.matT -= dt) > 0) return;
    this.matT = 0.25;
    let n = 0;
    for (const c of this.g.chars) {
      if (!c.sleeping || c.inVehicle || (c.bedY ?? 0) > 0.1 || n >= MATS) continue;
      if (c === this.g.player && this.sleep?.kind !== 'bedroll') continue; // the bare ground has no mat
      _m.position.set(c.x, this.g.stunts?.heightAt(c.x, c.z) ?? 0, c.z); _m.rotation.set(0, c.face, 0); _m.updateMatrix();
      m.setMatrixAt(n++, _m.matrix);
    }
    if (n !== m.count || n) { m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true; }
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

  // What a night here is worth right now: the bed's quality x the shelter's x the cold or heat of it.
  sleepQuality() {
    const S = this.sleep, N = this.g.needs;
    if (!S) return 0;
    return S.quality * S.rest * SLEEP_COMFORT.cold[N.pips.cold] * SLEEP_COMFORT.hot[N.pips.hot];
  }

  // The house you hold, read where you stand: whether its doors bar, how many drinks are stored in it.
  holdParts(b = this.g.insideBuilding) {
    const g = this.g, out = { door: false, water: 0, doors: [] };
    if (!b) return out;
    if (!b.ring && g.interiors) { const bi = g.world.buildings.indexOf(b); out.doors = g.interiors.doors.filter((d) => d.bi === bi && d.leaves.length); out.door = out.doors.length > 0; }
    for (const box of g.inventory?.boxes?.values() ?? []) {
      if (!(box.x > b.minX && box.x < b.maxX && box.z > b.minZ && box.z < b.maxZ)) continue;
      for (const s of box.slots) { const it = ITEMS[s.id]; if (it?.kind === 'water') out.water += (it.uses ? (s.left ?? it.uses) : 1) * s.n; }
    }
    return out;
  }
  // Shelter as a night: its rest multiplier, its danger a game hour, and what the hold has going for it.
  shelterFor(kind) {
    const sh = SHELTER[kind] ?? SHELTER.rough;
    if (this.prof.shelter === false) return { kind, rest: 1, danger: 0, parts: null };
    if (kind === 'camp' && this.g.homes?.camp) return this.g.homes.shelterFor(); // its danger read off roads, towns, hordes, the fire, the watch
    if (kind !== 'hold') return { kind, rest: sh.rest, danger: sh.danger, parts: null };
    const parts = this.holdParts();
    const water = parts.water >= HOLD.water.uses;
    return { kind, rest: sh.rest + (parts.door ? HOLD.door.rest : 0) + (water ? HOLD.water.rest : 0) + (this.g.homes?.restBonus() ?? 0), danger: parts.door ? HOLD.door.danger : sh.danger, parts: { door: parts.door, water: parts.water, stored: water, doors: parts.doors } };
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
    if (bed) { p.x = bed.x; p.z = bed.z; p.face = bed.face ?? p.face; }
    if (bed && g.updateInterior) g.updateInterior(); // the building you lie down in, now
    const sk = this.shelterKind(), sh = this.shelterFor(sk);
    this.sleep = { kind, quality: SLEEP.quality[kind] ?? SLEEP.quality.ground, slept: 0, bed, shelter: sk, rest: sh.rest, danger: sh.danger, risk: 0, q: 0,
      building: kind === 'bed' ? g.insideBuilding : null, barred: [] };
    // Your hold's doors bar from the inside while you sleep (and open again when you get up).
    if (sh.parts?.door) for (const d of sh.parts.doors) if (!d.locked) { g.interiors.setLocked(d, true); this.sleep.barred.push(d); }
    this.watchT = 0.5;
    p.sleeping = true; p.speed = 0; p.reloading = 0; p.bedY = bed?.bedY ?? (kind === 'bedroll' ? 0.05 : 0); // the body lies on what it lies on
    g.sky.fast = true; // the night goes by
    g.emit('sleep', { kind, quality: this.sleep.quality, shelter: sk, rest: +N.rest.toFixed(3), shelterRest: +sh.rest.toFixed(2), danger: sh.danger });
    const where = sk === 'hold' ? ' · YOUR HOLD' : sk === 'rough' && kind !== 'car' ? ' · SLEEPING ROUGH' : '';
    return { ok: true, text: (kind === 'bed' ? 'YOU LIE DOWN' : kind === 'bedroll' ? 'YOU ROLL OUT THE BEDROLL' : kind === 'car' ? 'YOU TIP THE SEAT BACK' : 'YOU LIE DOWN ON THE BARE GROUND') + (sh.parts?.door ? ' · DOORS BARRED' : '') + where };
  }

  // Up again: rested, woken (why says by what), or on your own (E). A full night, woken by nothing, breaks a fever
  // that antibiotics have treated; a full night in a bed under a roof makes the place yours (the hold).
  wake(why = 'you got up') {
    const g = this.g, S = this.sleep, p = g.player;
    if (!S) return null;
    this.sleep = null; p.sleeping = false; g.sky.fast = false;
    for (const d of S.barred) if (d.locked) g.interiors.setLocked(d, false);
    const full = why === 'rested' && S.slept >= SLEEP.fullNight, F = g.needs.fever;
    if (full && F?.treated) this.feverEnds('broke');
    let claimed = false;
    if (full && S.kind === 'bed' && S.building && this.prof.shelter !== false && !this.isHold(S.building)) { this.claim(S.building); claimed = true; }
    if (full && S.shelter === 'hold' && this.prof.mood) this.appraise('restedInHold');
    const h = Math.round(S.slept * 10) / 10, avgQ = S.slept > 0 ? +(S.q / S.slept).toFixed(3) : 0;
    this.lastWake = { why, hours: h, full, shelter: S.shelter, quality: avgQ, claimed };
    if (why !== 'dead') g.hud?.toast?.(why === 'rested' ? `SLEPT ${Math.max(1, Math.round(S.slept))} H · RESTED` : `${why === 'you got up' ? 'UP' : `WOKEN · ${why.toUpperCase()}`} · ${Math.round(S.slept)} H`, why === 'rested' ? 'job' : 'warn');
    if (claimed) g.hud?.toast?.('THIS PLACE IS YOURS NOW · YOUR HOLD', 'job');
    g.emit('wake', { why, hours: h, full, rest: +g.needs.rest.toFixed(3), shelter: S.shelter, quality: avgQ, claimed });
    return { why, hours: h, full, shelter: S.shelter, quality: avgQ, claimed };
  }

  // Make a building the house you hold (a full night in its bed does it; `shelter claim=true` stages it).
  claim(b) {
    if (!b) return null;
    const g = this.g;
    this.hold = { name: b.shopName ?? (b.ring ? `${b.kind ?? 'house'} ${b.id}`.toUpperCase() : 'THE HOUSE'), minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, ring: !!b.ring, id: b.ring ? b.id : g.world.buildings.indexOf(b) };
    g.emit('hold', { state: 'claimed', x: +((b.minX + b.maxX) / 2).toFixed(1), z: +((b.minZ + b.maxZ) / 2).toFixed(1) });
    return this.hold;
  }

  // Danger rolls came due: something finds the sleeper. At night one of the infected, by day a raider after your things,
  // PROWL.r m off and walking in; the sleeper's own watch wakes you when it comes close.
  prowl() {
    const g = this.g, p = g.player, a = Math.random() * Math.PI * 2, x = p.x + Math.sin(a) * PROWL.r, z = p.z + Math.cos(a) * PROWL.r;
    const night = (g.sky.night ?? 0) > 0.5;
    const c = night ? g.zombies?.spawn(x, z, false) : g.spawnRaider?.(x, z);
    if (!c) return null;
    if (night) c.ztarget = p; else c.target = p;
    c.prowler = true;
    g.emit('prowler', { id: c.id, kind: night ? 'infected' : 'raider', shelter: this.sleep?.shelter });
    return c;
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

  // Antibiotics taken (inventory.js, the `cure` use): treat a fever, clear a wound infection. Returns the line to show,
  // or null with nothing to treat.
  antibiotics() {
    const N = this.g.needs, F = N.fever, out = [];
    if (N.infection) { N.infection = null; this.g.emit('infection', { state: 'cured' }); out.push('THE INFECTION IS CLEARING'); }
    if (F) { if (!F.treated) { F.treated = true; this.g.emit('fever', { state: 'treated' }); } out.push('TREATED · A FULL NIGHT\'S SLEEP WILL BREAK IT'); }
    return out.length ? out.join(' · ') : null;
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

  // ---- the states a HUD shows (ui/telltales.js) ------------------------------------------------------------------
  // [{ id, icon, word, pip 1..4, good, title }], worst first. Only what is wrong right now (or what shelters you).
  telltales() {
    const g = this.g, N = g.needs, out = [];
    const add = (id, icon, word, pip, title, good = false) => out.push({ id, icon, word, pip, title, good });
    for (const k of ['water', 'food', 'rest']) if (N.pips[k]) add(k, k, NEEDS[k].words[N.pips[k]], N.pips[k], `${NEEDS[k].label} ${Math.round(N[k] * 100)}%`);
    if (N.pips.cold) add('cold', 'cold', WARMTH.cold.words[N.pips.cold], N.pips.cold, `Body ${Math.round(N.warmth * 100)} · air ${Math.round(N.air)}°C, feels ${Math.round(N.felt)}°C`);
    if (N.pips.hot) add('hot', 'hot', WARMTH.hot.words[N.pips.hot], N.pips.hot, `Body ${Math.round(N.warmth * 100)} · air ${Math.round(N.air)}°C, feels ${Math.round(N.felt)}°C`);
    if (N.pips.wet) add('wet', 'wet', WET.words[N.pips.wet], N.pips.wet, `Soaked ${Math.round(N.wet * 100)}%: wet clothes feel colder`);
    const kinds = {};
    for (const w of N.wounds) { const k = kinds[w.kind] ??= { n: 0, open: false, unset: false, dirty: false }; k.n++; k.open ||= w.open; k.unset ||= INJURIES[w.kind].needs.includes('splint') && !w.set; k.dirty ||= !w.clean; }
    for (const [kind, k] of Object.entries(kinds)) {
      const def = INJURIES[kind], bleeding = k.open && def.bleeds;
      const pip = bleeding ? 4 : k.unset ? (kind === 'fracture' ? 4 : 3) : k.open ? 3 : k.dirty ? 2 : 1;
      const word = bleeding ? 'BLEEDING' : k.unset ? (kind === 'fracture' ? 'BROKEN · SPLINT IT' : 'SPRAINED · STRAP IT') : k.open ? `${def.label} · DRESS IT` : k.dirty ? `${def.label} · CLEAN IT` : `${def.label} · MENDING`;
      add(`w_${kind}`, def.icon, word, pip, `${k.n} ${kind}${k.n > 1 ? 's' : ''}: ${def.needs.join(', ')}`);
    }
    if (N.infection) add('infection', 'germ', 'INFECTED', 4, 'Wound infection: antibiotics clear it');
    if (N.fever) add('fever', 'fever', N.fever.treated ? 'FEVER · TREATED' : 'FEVER', N.fever.treated ? 2 : 4, 'Bite fever: antibiotics, then a full night\'s sleep');
    if (N.sick) add('sick', 'sick', 'SICK', 3, 'Food poisoning: it passes; drink');
    for (const k of Object.keys(MOODS)) if (N.pips[k]) add(k, k, MOODS[k].words[N.pips[k]], N.pips[k], `${k} ${N.mood[k].toFixed(1)} / 10`);
    if (g.player.inVehicle) this.upkeep.telltales(g.player.inVehicle, add); // the car's own warning lights
    out.sort((a, b) => (a.good - b.good) || b.pip - a.pip);
    // Where you'd sleep tonight, while you're under a roof or in a closed car: good news is shown too.
    const sh = N.shelter;
    if (sh === 'hold') add('shelter', 'hold', 'YOUR HOLD', 1, 'Rest is best here; its doors bar while you sleep', true);
    else if (sh === 'car' && g.player.inVehicle) add('shelter', 'car', 'CAR · CRAMPED', 1, 'A night in the seat: slow rest, cold by night', true);
    else if (this.sleep && sh === 'rough') add('shelter', 'rough', 'SLEEPING ROUGH', 3, 'Poor rest; something will find you');
    return out;
  }

  view() {
    const N = this.g.needs, F = N.fever, S = this.sleep;
    const words = {}, hoursLeft = {};
    for (const k of Object.keys(NEEDS)) { words[k] = NEEDS[k].words[N.pips[k]] || null; hoursLeft[k] = +(N[k] / NEEDS[k].drainPerHour).toFixed(1); }
    words.cold = WARMTH.cold.words[N.pips.cold] || null; words.hot = WARMTH.hot.words[N.pips.hot] || null; words.wet = WET.words[N.pips.wet] || null;
    for (const k of Object.keys(MOODS)) words[k] = MOODS[k].words[N.pips[k]] || null;
    const r2 = (x) => Math.round(x * 100) / 100;
    return {
      profile: this.profileName,
      water: +N.water.toFixed(3), food: +N.food.toFixed(3), rest: +N.rest.toFixed(3), pips: { ...N.pips }, words,
      body: { warmth: +N.warmth.toFixed(3), wet: +N.wet.toFixed(3), air: r2(N.air), felt: r2(N.felt), shelter: N.shelter },
      mood: { fear: r2(N.mood.fear), gloom: r2(N.mood.gloom), boredom: r2(N.mood.boredom) },
      wounds: N.wounds.map((w) => ({ kind: w.kind, hoursLeft: r2(w.left), open: w.open, clean: w.clean, set: w.set, dirt: r2(w.dirt) })),
      infection: N.infection ? { hours: r2(this.hours() - N.infection.since), hurting: this.hours() - N.infection.since > INFECTION.hurtsAfter } : null,
      sick: N.sick ? { kind: N.sick.kind, hoursLeft: r2(N.sick.until - this.hours()) } : null,
      effects: { staminaRegen: +N.staminaRegen.toFixed(2), maxStamina: +N.maxStamina.toFixed(2), vignette: N.vignette, sway: +N.sway.toFixed(3), blackout: +N.blackout.toFixed(2), speedMul: +N.speedMul.toFixed(3), healMul: +N.healMul.toFixed(3), sight: +N.sight.toFixed(3), waterMul: +this.waterMul.toFixed(3) },
      condition: { ...N.condition },
      hoursLeft,
      fever: F ? { hoursLeft: +(F.until - this.hours()).toFixed(1), treated: F.treated } : null,
      asleep: S ? { kind: S.kind, quality: S.quality, shelter: S.shelter, shelterRest: +S.rest.toFixed(2), comfort: +(this.sleepQuality() / (S.quality * S.rest)).toFixed(2), danger: S.danger, risk: +S.risk.toFixed(2), hours: +S.slept.toFixed(2) } : null,
      hold: this.hold ? { name: this.hold.name, x: r2((this.hold.minX + this.hold.maxX) / 2), z: r2((this.hold.minZ + this.hold.maxZ) / 2), ring: this.hold.ring } : null,
      telltales: this.telltales().map((t) => `${t.word}${t.good ? '' : ` (${t.pip})`}`),
    };
  }

  save() {
    const N = this.g.needs;
    return {
      water: N.water, food: N.food, rest: N.rest, fever: N.fever ? { ...N.fever } : null,
      warmth: N.warmth, wet: N.wet, mood: { ...N.mood }, wounds: N.wounds.map((w) => ({ ...w })), infection: N.infection ? { ...N.infection } : null, sick: N.sick ? { ...N.sick } : null,
      hold: this.hold ? { ...this.hold } : null, upkeep: this.upkeep.save(),
    };
  }
  load(s) {
    if (!s) return;
    const N = this.g.needs;
    if (this.sleep) this.wake('dead'); // a load never resumes a sleep
    N.water = s.water ?? N.water; N.food = s.food ?? N.food; N.rest = s.rest ?? NEEDS.rest.start;
    N.fever = s.fever ? { until: s.fever.until, treated: !!s.fever.treated } : null; // an older save: no fever
    N.warmth = s.warmth ?? 0.5; N.wet = s.wet ?? 0; // an older save: comfortable, dry, calm, whole
    N.mood = { fear: s.mood?.fear ?? 0, gloom: s.mood?.gloom ?? 0, boredom: s.mood?.boredom ?? 0 };
    N.wounds = (s.wounds ?? []).filter((w) => INJURIES[w.kind]).map((w) => ({ ...w }));
    N.infection = s.infection ? { ...s.infection } : null; N.sick = s.sick ? { ...s.sick } : null;
    this.hold = s.hold ? { ...s.hold } : null;
    this.upkeep.load(s.upkeep);
    for (const k of Object.keys(NEEDS)) N.pips[k] = this.pip(N[k]);
    N.pips.cold = this.lineDown(N.warmth, WARMTH.cold.lines); N.pips.hot = this.lineUp(N.warmth, WARMTH.hot.lines); N.pips.wet = this.lineUp(N.wet, WET.lines);
    for (const k of Object.keys(MOODS)) N.pips[k] = this.lineUp(N.mood[k], MOODS[k].lines);
    this.evSeq = this.g.eventSeq ?? this.evSeq; // what happened before the load is not news
  }
}
