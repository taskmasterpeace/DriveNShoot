import { ATTRIBUTES, ATTR_MIN, ATTR_MAX, rankToAttr, DERIVED, SKILLS, SKILL_MAX, TIERS_AT, TIER_NAMES, tierOf, TAGS, XP_CURVE, GUN_SKILL, PERKS,
  TRAITS, TRAIT_RULES, EARN, CONDITIONS, ZONES, INJURIES, INJURY_AT, STRESS, MORALE, REPUTATION, CHECK } from '../data/stats.js';

// THE DEEP SHEET, live (data/stats.js; docs/design/WEB_VOICE_STATS.md §5). One survivor's attributes, skills, perks,
// traits, conditions, injuries, stress, morale and reputation, folded every half second into g.deep.fx: the flat
// object of multipliers and adds that the engine's single consumers read (the list is the top of data/stats.js).
// The fold is neutral for an ordinary, untrained, calm, unhurt survivor: every multiplier 1, every add 0.
//   live      false: the sheet holds still - the fold is exactly neutral and nothing is learned or suffered (the
//             selftest battery runs with it off so no other check's numbers move; the stats checks turn it on)
//   check(req) the dialogue/quest gate (skill: stat: trait: item: trust: crew:) -> { ok, why }
//   sheetFor(c) a crew member's sheet, same rows (the crew lane: c.sheet = stats.sheetFor(c) when it hires them)
const MUL = ['spreadMul', 'reloadMul', 'sprintDrainMul', 'speedMul', 'priceMul', 'seenMul', 'drainMul', 'wakeMul', 'healMul', 'meleeMul', 'handling', 'noiseMul', 'lockMul', 'scentMul', 'damageMul', 'xpMul'];
const ADD = ['carryKg', 'repair', 'luck'];
export const FX_KEYS = [...MUL, ...ADD];
const clampMul = (v) => Math.max(0.2, Math.min(3, v));

export class Stats {
  constructor(game) {
    this.g = game;
    this.attrs = Object.fromEntries(Object.keys(ATTRIBUTES).map((k) => [k, 5]));
    // What THE CREATOR already pays for (its ranks move skills.js and its own fx): the fold counts only what you are
    // ABOVE or BELOW that since (training, an injury, a command), so a creator pick is never counted twice.
    this.base = Object.fromEntries(Object.keys(ATTRIBUTES).map((k) => [k, 5]));
    this.foldAttrs = { ...this.attrs };
    this.skill = Object.fromEntries(Object.keys(SKILLS).map((k) => [k, 0]));
    this.tags = [];
    this.traits = new Set();
    this.perks = {};          // skill -> ['a'|'b' per tier taken]
    this.stress = 0; this.panic = 0;
    this.morale = [];         // [{ id, v, until (game hours) }]
    this.rep = Object.fromEntries(Object.keys(REPUTATION).map((k) => [k, 0]));
    this.counts = { carKills: 0, humanKills: 0, fights: 0, jumps: 0, blasts: 0, curedBites: 0 };
    this.zones = Object.fromEntries(Object.keys(ZONES).map((k) => [k, { hp: 1, injuries: [] }])); // hp: share 0..1 of the zone
    this.cond = Object.fromEntries(Object.keys(CONDITIONS).map((k) => [k, 0]));
    this.timed = { drunk: 0, deaf: 0, grief: 0, inspired: 0, fed: 0, withdrawal: 0 }; // seconds left on a condition source
    this.live = true;
    this.fx = Object.fromEntries([...MUL.map((k) => [k, 1]), ...ADD.map((k) => [k, 0])]);
    this.why = {};            // fx key -> the contributions that moved it (the sheet's tooltips)
    this.lastSeq = game.eventSeq ?? 0;
    this.t = 0; this.sheetSeen = null;
    this.xpLog = [];
    game.deep = this;
    this.recompute();
  }

  // ---- the attributes off THE CREATOR's sheet (ranks 1..6 -> 1..10); charm is ours alone ---------------------------
  fromSheet() {
    const sh = this.g.sheet, A = sh?.picks?.attrs;
    if (!A || this.sheetSeen === sh) return;
    if (this.keepAttrs) { this.keepAttrs = false; this.sheetSeen = sh; return; } // a save's own attributes win over the sheet's
    this.sheetSeen = sh;
    for (const [k, d] of Object.entries(ATTRIBUTES)) if (d.creator && A[d.creator] !== undefined) this.attrs[k] = this.base[k] = rankToAttr(A[d.creator]);
    this.dirty = true;
  }

  hours() { return this.g.sky?.totalHours?.() ?? (this.g.time ?? 0) / 60; }
  derived(k) { return DERIVED[k].f(this.attrs, this.skill); }
  cap() { return this.derived('stressCap'); }

  // ---- learning ----------------------------------------------------------------------------------------------------
  gain(id, amount, why = '') {
    const d = SKILLS[id];
    if (!d || !(amount > 0) || this.skill[id] >= SKILL_MAX || !this.live) return 0; // held still: nothing is learned
    const v0 = this.skill[id], tag = this.tags.includes(id) ? TAGS.xpMul : 1;
    const add = (amount * this.fx.xpMul * tag) / (1 + v0 / XP_CURVE);
    this.skill[id] = Math.min(SKILL_MAX, v0 + add);
    if (tierOf(this.skill[id]) > tierOf(v0)) {
      const t = tierOf(this.skill[id]);
      this.g.hud?.toast?.(`${d.label.toUpperCase()}: ${TIER_NAMES[t]} - a perk to pick (\`)`, 'job');
      this.g.emit('statTier', { skill: id, tier: t, name: TIER_NAMES[t] });
      this.dirty = true;
    }
    this.xpLog.push({ id, add: +add.toFixed(3), why }); if (this.xpLog.length > 20) this.xpLog.shift();
    return add;
  }
  // A bullet of yours landed (systems/skills.js onHit): the gun in your hands learns.
  onHit() { const w = this.g.player?.weapon; const s = GUN_SKILL[w]; if (s) this.gain(s, 1.2, 'hit'); }
  // Perks waiting to be picked (a tier crossed) and taking one.
  pending() {
    const out = [];
    for (const id of Object.keys(SKILLS)) { const t = tierOf(this.skill[id]), have = this.perks[id]?.length ?? 0; for (let i = have; i < t; i++) out.push({ skill: id, tier: i + 1, a: PERKS[id][i].a, b: PERKS[id][i].b }); }
    return out;
  }
  pickPerk(id, which) {
    const p = this.pending().find((x) => x.skill === id);
    if (!p) return { ok: false, why: `no perk waiting on ${id}` };
    if (which !== 'a' && which !== 'b') return { ok: false, why: 'pick=a or pick=b' };
    (this.perks[id] ??= []).push(which);
    this.recompute();
    return { ok: true, perk: p[which] };
  }

  // ---- traits ------------------------------------------------------------------------------------------------------
  // Made-with traits obey the budget (TRAIT_RULES); earned ones (cost null) come only from EARN.
  validTraits(list) {
    const pos = list.filter((t) => TRAITS[t]?.cost > 0), neg = list.filter((t) => TRAITS[t]?.cost < 0);
    const bad = list.find((t) => !TRAITS[t] || TRAITS[t].cost === null);
    if (bad) return `${bad}: not a trait you can be made with`;
    if (pos.length > TRAIT_RULES.maxPositive) return `at most ${TRAIT_RULES.maxPositive} good traits`;
    if (neg.length > TRAIT_RULES.maxNegative) return `at most ${TRAIT_RULES.maxNegative} flaws`;
    const net = list.reduce((n, t) => n + TRAITS[t].cost, 0);
    if (Math.abs(net) > TRAIT_RULES.budget) return `traits must net within +-${TRAIT_RULES.budget} points (these net ${net})`;
    return null;
  }
  setTraits(list, force = false) {
    const err = force ? null : this.validTraits(list);
    if (err) return { ok: false, why: err };
    for (const t of [...this.traits]) if (TRAITS[t]?.cost !== null) this.traits.delete(t);
    for (const t of list) { this.traits.add(t); for (const [s, v] of Object.entries(TRAITS[t].skills ?? {})) this.skill[s] = Math.max(this.skill[s], v); if (TRAITS[t].tag && !this.tags.includes(TRAITS[t].tag)) this.tags.push(TRAITS[t].tag); }
    this.recompute();
    return { ok: true, traits: [...this.traits] };
  }
  setTags(list) {
    if (list.length > TAGS.count || list.some((s) => !SKILLS[s])) return { ok: false, why: `up to ${TAGS.count} skills: ${Object.keys(SKILLS).join(', ')}` };
    for (const s of this.tags) if (!list.includes(s)) this.skill[s] = Math.max(0, this.skill[s] - TAGS.bonus);
    for (const s of list) if (!this.tags.includes(s)) this.skill[s] = Math.min(SKILL_MAX, this.skill[s] + TAGS.bonus);
    this.tags = [...list];
    this.recompute();
    return { ok: true, tags: this.tags };
  }

  // ---- the world happening to you ------------------------------------------------------------------------------------
  stressAdd(n, why) {
    if (!this.live || !(n > 0)) return;
    let mul = 1; for (const t of this.traits) mul *= TRAITS[t].stressMul ?? 1;
    if ((this.g.sky?.night ?? 0) > 0.5) for (const t of this.traits) mul *= TRAITS[t].night?.stressMul ?? 1;
    for (const [s, picks] of Object.entries(this.perks)) picks.forEach((w, i) => { mul *= PERKS[s][i][w].stressMul ?? 1; });
    this.stress = Math.min(this.cap() * 1.2, this.stress + n * mul);
    this.lastStressWhy = why;
  }
  moraleAdd(id) { const m = MORALE.mods[id]; if (!m) return; this.morale = this.morale.filter((x) => x.id !== id); this.morale.push({ id, v: m.v, until: this.hours() + m.hours }); }
  moraleNow() { const h = this.hours(); this.morale = this.morale.filter((x) => x.until > h); return Math.max(-100, Math.min(100, this.morale.reduce((n, x) => n + x.v, 0))); }
  moraleBand() { const v = this.moraleNow(); return MORALE.bands.find(([at]) => v >= at)[1]; }

  // A wound lands on a zone (by weight, seeded by the event so a replay lands the same), maybe opening an injury.
  wound(amount, cause = '', seed = 0) {
    if (!this.live || !(amount > 0)) return null;
    const p = this.g.player, maxHp = p?.maxHp ?? 100;
    let tot = 0; for (const z of Object.values(ZONES)) tot += z.weight;
    let r = ((Math.imul(seed + 1, 2654435761) >>> 0) % 1000) / 1000 * tot, zone = 'torso';
    for (const [k, z] of Object.entries(ZONES)) { r -= z.weight; if (r <= 0) { zone = k; break; } }
    const Z = this.zones[zone], share = amount / (maxHp * ZONES[zone].share);
    Z.hp = Math.max(0, Z.hp - share);
    let injury = null;
    if (share >= INJURY_AT) {
      const c = String(cause).toLowerCase();
      const type = Object.entries(INJURIES).find(([, d]) => d.from.some((f) => c.includes(f)) && (!d.zones || d.zones.includes(zone)))?.[0] ?? (c.includes('bite') ? 'bite' : 'laceration');
      injury = { type, at: +this.hours().toFixed(2), left: INJURIES[type].heal };
      Z.injuries.push(injury); if (Z.injuries.length > 4) Z.injuries.shift();
      this.g.emit('injury', { zone, type, label: `${INJURIES[type].label} (${ZONES[zone].label})` });
    }
    this.dirty = true;
    return { zone, hp: +Z.hp.toFixed(2), injury };
  }

  // ---- the per-frame part: events in, timers down, the fold twice a second ----------------------------------------------
  update(dt) {
    const g = this.g, p = g.player;
    this.fromSheet();
    // Events since last frame.
    let i = g.events.length;
    while (i > 0 && g.events[i - 1].seq > this.lastSeq) i--;
    for (; i < g.events.length; i++) this.onEvent(g.events[i]);
    // Doing: driving, hauling, sneaking.
    if (p?.alive) {
      const v = p.inVehicle;
      if (v && v.driver === p) { const sp = Math.abs(g.vehiclesSys?.speed?.(v) ?? 0); if (sp > 6) { this.gain('driving', 0.04 * dt, 'drive'); this.gain('navigation', 0.012 * dt, 'road'); } }
      else if (p.crouch && p.speed > 0.5) this.gain('fieldcraft', 0.03 * dt, 'sneak');
      // The infected close: stress.
      if (this.live) {
        let near = 0, hostile = false;
        for (const c of g.chars) {
          if (!c.alive || c === p || Math.abs(c.x - p.x) > 20 || Math.abs(c.z - p.z) > 20) continue;
          if (c.faction === 'zombie') { if (Math.hypot(c.x - p.x, c.z - p.z) < 3) near++; hostile = true; } else if (c.target === p) hostile = true;
        }
        if (near) this.stressAdd(STRESS.gain.infectedClose * near * dt, 'the dead, close');
        if (!hostile) this.stress = Math.max(0, this.stress - STRESS.fall.calmPerSec * dt * (p.sleeping ? 8 : 1));
        for (const k in this.timed) if (this.timed[k] > 0) this.timed[k] = Math.max(0, this.timed[k] - dt);
        // Zones mend: a full zone in about two game days, faster with healMul.
        const mend = dt * 0.0006 * (g.needs?.healMul ?? this.fx.healMul); // survival's healMul already folds ours
        for (const k in this.zones) { const Z = this.zones[k]; if (Z.hp < 1) Z.hp = Math.min(1, Z.hp + mend); if (Z.injuries.length) { for (const j of Z.injuries) j.left -= dt / 60; Z.injuries = Z.injuries.filter((j) => j.left > 0); } }
      }
    }
    if ((this.t -= dt) <= 0 || this.dirty) { this.t = 0.5; this.dirty = false; this.recompute(); }
  }

  onEvent(e) {
    const g = this.g, p = g.player;
    this.lastSeq = e.seq;
    // Skills taught by this event type.
    for (const [id, d] of Object.entries(SKILLS)) { const a = d.xp?.[e.type]; if (a) this.gain(id, a, e.type); }
    switch (e.type) {
      case 'hurt': {
        this.stressAdd(STRESS.gain.hurt, 'hurt');
        this.wound(e.amount ?? 0, e.cause ?? '', e.seq);
        break;
      }
      case 'kill': {
        if (e.by === p?.id || e.by === 'c1') {
          const w = p?.inVehicle ? 'car' : p?.weapon;
          if (GUN_SKILL[w]) this.gain(GUN_SKILL[w], 4, 'kill');
          if (p?.inVehicle) this.counts.carKills++;
          if (e.faction && e.faction !== 'zombie') this.counts.humanKills++;
          this.moraleAdd('won_fight');
        } else if (e.faction && p && e.faction !== 'zombie') {
          const dead = g.chars.find((c) => c.id === e.victim);
          if (dead && Math.hypot(dead.x - p.x, dead.z - p.z) < 25 && (dead.crew || dead.ally)) { this.stressAdd(STRESS.gain.allyKilled, 'a friend died'); this.moraleAdd('friend_died'); this.timed.grief = 600; }
        }
        break;
      }
      case 'detonated': case 'tankerExploded': {
        if (p && (e.x === undefined || Math.hypot(e.x - p.x, e.z - p.z) < 30)) { this.stressAdd(STRESS.gain.blast, 'a blast'); this.counts.blasts++; this.timed.deaf = 20; }
        break;
      }
      case 'jump': this.counts.jumps++; break;
      case 'sleep': this.stress = Math.max(0, this.stress - STRESS.fall.sleepPerHour * 4); this.moraleAdd(g.insideBuilding ? 'slept_bed' : 'slept_rough'); break;
      case 'consumed': case 'itemUsed': {
        const id = String(e.item ?? e.id ?? '');
        if (/whiskey|booze|liquor|beer|moonshine|mescal/.test(id)) { this.stress = Math.max(0, this.stress - STRESS.fall.drink); this.timed.drunk = Math.min(1800, this.timed.drunk + 420); }
        else if (/cig|smoke|tobacco/.test(id)) this.stress = Math.max(0, this.stress - STRESS.fall.smoke);
        else if (/stew|cooked|meal|steak/.test(id)) { this.moraleAdd('ate_well'); this.timed.fed = 1800; }
        else if (/raw/.test(id)) this.moraleAdd('ate_raw');
        break;
      }
      case 'jobPaid': this.moraleAdd('got_paid'); break;
      case 'deed': {
        const rec = g.society?.chronicle?.last?.();
        if (rec && rec.seq === e.record && rec.a === 'player') for (const [ax, d] of Object.entries(REPUTATION)) { const v = d.verbs[e.verb]; if (v) this.rep[ax] = Math.max(d.range[0], Math.min(d.range[1], this.rep[ax] + v)); }
        if (e.verb === 'kill') this.counts.fights++;
        break;
      }
      default:
    }
    for (const [t, r] of Object.entries(EARN)) if (!this.traits.has(t) && this.counts[r.count] >= r.at) { this.traits.add(t); this.g.hud?.toast?.(`EARNED: ${TRAITS[t].label}`, 'job'); this.g.emit('traitEarned', { trait: t }); this.dirty = true; }
  }

  // ---- conditions off live state -----------------------------------------------------------------------------------
  conditions() {
    const g = this.g, N = g.needs, C = this.cond, p = g.player, live = this.live;
    const ladder = (v, rungs) => { let l = 0; for (const r of rungs) if (v >= r) l++; return l; };
    C.hungry = N ? ladder(1 - N.food, [0.45, 0.65, 0.8, 0.92]) : 0;
    C.thirsty = N ? ladder(1 - N.water, [0.45, 0.65, 0.8, 0.92]) : 0;
    C.tired = N ? ladder(1 - N.rest, [0.5, 0.7, 0.85, 0.95]) : 0;
    C.exhausted = live && p ? ladder(1 - (p.stamina ?? 1), [0.6, 0.8, 0.95]) : 0;
    const cap = this.cap(), share = this.stress / cap, panicAt = (this.derived('panicAt') + this.traitSum('panicAdd')) / 100;
    C.stressed = live ? ladder(share, STRESS.rungs) : 0;
    C.panicked = live && share >= panicAt ? Math.min(3, 1 + Math.floor((share - panicAt) / 0.08)) : 0;
    C.bored = N ? ladder(N.mood?.boredom ?? 0, [0.4, 0.65, 0.85]) : 0;
    C.lonely = 0;
    let pain = 0; for (const [k, Z] of Object.entries(this.zones)) { pain += (1 - Z.hp) * ZONES[k].share * 6; for (const j of Z.injuries) pain += INJURIES[j.type].pain * 0.5; }
    pain *= 50 / Math.max(10, this.derived('painTol'));
    C.pain = live ? ladder(pain, [0.6, 1.4, 2.4, 3.6]) : 0;
    C.bleeding = N ? Math.min(4, (N.wounds ?? []).filter((w) => w.open).length) : 0;
    C.cold = N && live ? ladder(N.pips?.cold ?? 0, [1, 2, 3, 4]) : 0;
    C.hot = N && live ? ladder(N.pips?.hot ?? 0, [1, 2, 3]) : 0;
    C.wet = N && live ? ladder(N.wet ?? 0, [0.3, 0.6, 0.85]) : 0;
    C.sick = N?.sick ? 2 : 0;
    C.food_poisoned = N?.sick?.kind === 'food' ? 2 : 0;
    C.infected = N?.infection ? 1 + Math.min(4, Math.floor(((g.time ?? 0) - (N.infection.since ?? 0)) / 600)) : 0;
    C.drunk = live ? ladder(this.timed.drunk, [1, 600, 1200]) : 0;
    C.withdrawal = live ? ladder(this.timed.withdrawal, [1, 1200, 2400]) : 0;
    C.concussed = live && this.zones.head.injuries.some((j) => j.type === 'concussion') ? (this.zones.head.hp < 0.4 ? 2 : 1) : 0;
    C.encumbered = ladder(g.skills?.load ?? 0, [0.75, 1, 1.25]);
    C.deafened = live ? ladder(this.timed.deaf, [1, 12]) : 0;
    C.grieving = live ? ladder(this.timed.grief, [1, 300, 500]) : 0;
    C.inspired = live ? ladder(this.timed.inspired, [1, 300]) : 0;
    C.well_fed = live ? ladder(this.timed.fed, [1, 1200]) : 0;
    return C;
  }
  traitSum(k) { let n = 0; for (const t of this.traits) n += TRAITS[t][k] ?? 0; return n; }

  // ---- the fold ----------------------------------------------------------------------------------------------------
  recompute() {
    const F = this.fx, W = this.why;
    for (const k of MUL) F[k] = 1; for (const k of ADD) F[k] = 0;
    for (const k in W) W[k].length = 0;
    if (!this.live) { this.conditions(); this.g.skillsSys?.recompute?.(); return F; } // held still (the battery): the fold is exactly neutral
    const put = (fx, src, scale = 1) => {
      if (!fx) return;
      for (const k in fx) {
        if (!(k in F)) continue;
        const d = fx[k] * scale; if (!d) continue;
        F[k] += d; (W[k] ??= []).push(`${src} ${d > 0 ? '+' : ''}${+(d * (ADD.includes(k) ? 1 : 100)).toFixed(1)}${ADD.includes(k) ? '' : '%'}`);
      }
    };
    // Attributes -> derived (over the creator's baseline: 5 + what moved since).
    for (const k in this.attrs) this.foldAttrs[k] = 5 + this.attrs[k] - (this.base[k] ?? 5);
    for (const [id, d] of Object.entries(DERIVED)) {
      if (!d.to) continue;
      const v = d.f(this.foldAttrs, this.skill), delta = ADD.includes(d.to) ? v : v - 1;
      if (delta) put({ [d.to]: delta }, d.label);
    }
    // Skills (a firearms skill only for the gun in your hands).
    const gun = GUN_SKILL[this.g.player?.weapon];
    for (const [id, d] of Object.entries(SKILLS)) {
      if (!d.fx || !this.skill[id]) continue;
      if (d.weapon && id !== gun) continue;
      put(d.fx, d.label, this.skill[id]);
    }
    // Perks.
    for (const [s, picks] of Object.entries(this.perks)) picks.forEach((w, i) => put(PERKS[s]?.[i]?.[w]?.fx, PERKS[s]?.[i]?.[w]?.label ?? s));
    // Traits (and their night side).
    const night = (this.g.sky?.night ?? 0) > 0.5;
    for (const t of this.traits) { put(TRAITS[t].fx, TRAITS[t].label); if (night) put(TRAITS[t].night, `${TRAITS[t].label} (night)`); }
    // Conditions, injuries, morale: what is happening to you now.
    const C = this.conditions();
    for (const [k, lv] of Object.entries(C)) if (lv && CONDITIONS[k].fx) put(CONDITIONS[k].fx[lv - 1], `${CONDITIONS[k].label} ${lv}`);
    if (this.live) for (const [k, Z] of Object.entries(this.zones)) { if (Z.hp <= 0) put(ZONES[k].disabled, `${ZONES[k].label} disabled`); else if (Z.hp < 0.5) put(ZONES[k].hurt, `${ZONES[k].label} hurt`); }
    if (this.live) put(MORALE.fx[this.moraleBand()], `Morale ${this.moraleBand()}`);
    for (const k of MUL) F[k] = clampMul(F[k]);
    this.g.skillsSys?.recompute?.(); // the engine's own numbers re-read the fold
    return F;
  }

  // ---- checks: the dialogue and quest gates ---------------------------------------------------------------------------
  // req: { skill: {id: min} | 'id>=min', stat: {key: min}, trait: id | [ids] | '!id', item: id | {id: n}, trust: n, crew: id|true }
  // stat keys: an attribute, a derived stat, a reputation axis, 'stress', 'morale'. -> { ok, why }
  statValue(k) {
    if (k in this.attrs) return this.attrs[k];
    if (k in this.rep) return this.rep[k];
    if (k in DERIVED) return this.derived(k);
    if (k === 'stress') return this.stress;
    if (k === 'morale') return this.moraleNow();
    if (k in this.skill) return this.skill[k];
    return null;
  }
  check(req = {}) {
    const g = this.g, fail = (why) => ({ ok: false, why });
    const pairs = (v) => (typeof v === 'string' ? [v.split(/>=|:/)] : Object.entries(v ?? {}));
    for (const [id, min] of pairs(req.skill)) {
      if (!SKILLS[id]) return fail(`unknown skill ${id}`);
      const eff = this.skill[id] + CHECK.attrStep * (this.attrs[SKILLS[id].attr] - 5);
      if (eff < +min) return fail(`${SKILLS[id].label} ${Math.floor(eff)}/${min}`);
    }
    for (const [k, min] of pairs(req.stat)) {
      const v = this.statValue(k);
      if (v === null) return fail(`unknown stat ${k}`);
      if (v < +min) return fail(`${ATTRIBUTES[k]?.label ?? REPUTATION[k]?.label ?? k} ${Math.round(v)}/${min}`);
    }
    for (const t of [].concat(req.trait ?? [])) {
      const neg = t.startsWith('!'), id = neg ? t.slice(1) : t;
      if (neg ? this.traits.has(id) : !this.traits.has(id)) return fail(neg ? `not if you are ${TRAITS[id]?.label ?? id}` : `needs ${TRAITS[id]?.label ?? id}`);
    }
    if (req.item) {
      for (const [id, n] of typeof req.item === 'string' ? [[req.item, 1]] : Object.entries(req.item)) {
        const have = g.inventory?.count?.(id) ?? g.inventory?.carried?.slots?.filter((s) => s.id === id).reduce((a, s) => a + (s.n ?? 1), 0) ?? 0;
        if (have < n) return fail(`needs ${n > 1 ? `${n} x ` : ''}${id.replace(/_/g, ' ')}`);
      }
    }
    if (req.trust !== undefined) {
      const c = g.dialogue?.npc ?? g.dialogue?.c, F = g.society?.factions, i = F?.index?.[c?.fid];
      const v = c?.trust ?? (i >= 0 ? F.standing?.[i] ?? F.s?.[i] : 0) ?? 0;
      if (v < req.trust) return fail(`trust ${Math.round(v)}/${req.trust}`);
    }
    if (req.crew) {
      const p = g.player, want = req.crew;
      const ok = g.chars.some((c) => c.alive && c !== p && (c.crew || c.follower) && (want === true || c.npc?.id === want || c.crewId === want) && Math.hypot(c.x - p.x, c.z - p.z) < 20);
      if (!ok) return fail(want === true ? 'needs one of your crew here' : `needs ${want} with you`);
    }
    return { ok: true, why: null };
  }

  // A crew member's own sheet from the same rows (the crew lane's hook; plain data, no fold of its own yet).
  sheetFor(c, seed = 0) {
    const h = (s) => (Math.imul((seed ^ s) + 0x9e3779b9, 2654435761) >>> 0) % 1000 / 1000;
    const attrs = Object.fromEntries(Object.keys(ATTRIBUTES).map((k, i) => [k, Math.max(ATTR_MIN, Math.min(ATTR_MAX, Math.round(3 + h(i + 1) * 5)))]));
    const pos = Object.keys(TRAITS).filter((t) => TRAITS[t].cost > 0), neg = Object.keys(TRAITS).filter((t) => TRAITS[t].cost < 0);
    return { name: c?.name ?? null, attrs, traits: [pos[Math.floor(h(91) * pos.length)], neg[Math.floor(h(92) * neg.length)]], skill: {}, stress: 0, morale: 0 };
  }

  view() {
    const r1 = (v) => +v.toFixed(2);
    const skills = {};
    for (const [id, d] of Object.entries(SKILLS)) { if (d.hidden && !this.skill[id]) continue; (skills[d.group] ??= []).push({ id, label: d.label, level: +this.skill[id].toFixed(1), tier: TIER_NAMES[tierOf(this.skill[id])], tag: this.tags.includes(id), attr: d.attr }); }
    return {
      attrs: { ...this.attrs },
      derived: Object.fromEntries(Object.entries(DERIVED).map(([k, d]) => [k, { label: d.label, value: r1(d.f(this.attrs, this.skill)), why: d.why }])),
      skills, tags: this.tags, perks: this.perks, pending: this.pending().map((p) => ({ skill: p.skill, tier: p.tier, a: p.a.label, b: p.b.label })),
      traits: [...this.traits].map((t) => ({ id: t, label: TRAITS[t].label, does: TRAITS[t].does, earned: TRAITS[t].cost === null })),
      conditions: Object.entries(this.cond).filter(([, v]) => v).map(([k, v]) => ({ id: k, label: CONDITIONS[k].label, level: v, of: CONDITIONS[k].levels, cure: CONDITIONS[k].cure })),
      injuries: Object.entries(this.zones).map(([k, Z]) => ({ zone: k, label: ZONES[k].label, hp: r1(Z.hp), state: Z.hp <= 0 ? 'disabled' : Z.hp < 0.5 ? 'hurt' : Z.hp < 1 ? 'bruised' : 'whole', injuries: Z.injuries.map((j) => ({ type: j.type, label: INJURIES[j.type].label, hoursLeft: +(j.left / 60).toFixed(1) })) })),
      stress: { value: +this.stress.toFixed(1), cap: this.cap(), panicAt: this.derived('panicAt') + this.traitSum('panicAdd') },
      morale: { value: this.moraleNow(), band: this.moraleBand(), mods: this.morale.map((m) => ({ label: MORALE.mods[m.id].label, v: m.v })) },
      reputation: Object.fromEntries(Object.entries(this.rep).map(([k, v]) => [k, { label: REPUTATION[k].label, value: +v.toFixed(1) }])),
      fx: Object.fromEntries(Object.entries(this.fx).map(([k, v]) => [k, r1(v)])),
      live: this.live,
    };
  }

  save() { return { base: { ...this.base }, attrs: { ...this.attrs }, skill: { ...this.skill }, tags: [...this.tags], traits: [...this.traits], perks: JSON.parse(JSON.stringify(this.perks)), stress: this.stress, morale: this.morale.map((m) => ({ ...m })), rep: { ...this.rep }, counts: { ...this.counts }, zones: JSON.parse(JSON.stringify(this.zones)) }; }
  load(s) {
    if (!s) return;
    Object.assign(this.attrs, s.attrs ?? {}); Object.assign(this.base, s.base ?? s.attrs ?? {}); this.sheetSeen = this.g.sheet; this.keepAttrs = true; Object.assign(this.skill, s.skill ?? {}); this.tags = s.tags ?? []; this.traits = new Set(s.traits ?? []);
    this.perks = s.perks ?? {}; this.stress = s.stress ?? 0; this.morale = s.morale ?? []; Object.assign(this.rep, s.rep ?? {}); Object.assign(this.counts, s.counts ?? {});
    if (s.zones) for (const k in this.zones) if (s.zones[k]) this.zones[k] = s.zones[k];
    this.recompute();
  }
  reset() { const live = this.live; const g = this.g; Object.assign(this, new Stats(g)); this.live = live; g.deep = this; this.recompute(); }
}
