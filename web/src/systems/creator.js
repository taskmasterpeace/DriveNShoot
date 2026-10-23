import {
  CREATOR, START, ATTRS, BACKGROUNDS, TRAITS, FLAWS, STATES, freshPicks, tally, validate, effects, startSkills, knowing, kitOf,
  lookColors, buildOf, randomPicks, randomLook, cleanPicks, priceOfRank, priceOfTrait, traitById, isFlaw, backgroundById,
} from '../data/creator.js';
import { NPCS, randomName } from '../data/npcs.js';
import { FLAGS, FLAG_KEYS } from '../ui/portrait.js';
import { RULERS } from '../data/atlas.js';
import { GEAR } from '../data/gear.js';
import { ITEMS } from '../data/items.js';
import { WEAPONS } from './combat.js';
import { makeRng } from '../engine/rng.js';

// THE CREATOR, the system half (docs/design/WEB_CREATOR.md; the rows are data/creator.js, the screen ui/creator.js).
// It holds the DRAFT the screen and the agent edit (every buy and refund goes through here, so neither can overspend),
// and the SHEET: the picks the player was made from, live on g.sheet = { picks, fx } for the consumers to read.
//   begin(picks)   the draft becomes the player: identity, look, skills, kit, gear, who knows you, then the start
//   load(sheet)    identity, look and the numbers only (a save or the shard brings its own skills, pack and gear)
//   clear()        back to the engine's default player (no sheet: every consumer reads 1 / 0)
export class Creator {
  constructor(g) {
    this.g = g;
    this.draft = freshPicks();
    this.sheet = null;
    g.sheet = null;
    this.onStart = null;      // the start-place hook (the Florida lane): (sheet, game) => void
    this.lock = null;         // { name, flag } the shard already gave this character (they cannot change here)
    this.pending = false;     // a shard character whose creator is not finished (net/shard.js opens it again at login)
    this.made = 0;            // characters begun on this page
    const p = g.player;
    this.base = p ? { name: p.name, flag: p.flag, colors: { ...p.colors }, maxHp: p.maxHp } : null;
  }

  // ---- the draft: every edit returns { ok, why?, cost? } and never leaves it over budget ---------------------------
  left(p = this.draft) { return tally(p).left; }
  setRank(k, rank) {
    const a = ATTRS.find((x) => x.k === k);
    if (!a) return { ok: false, why: `no attribute "${k}" (${ATTRS.map((x) => x.k).join(', ')})` };
    const r = Math.round(rank);
    if (r < CREATOR.rankMin || r > CREATOR.rankMax) return { ok: false, why: `${a.label} runs ${CREATOR.rankMin}-${CREATOR.rankMax}` };
    const cost = priceOfRank(this.draft, k, r);
    if (cost > 0 && cost > this.left()) return { ok: false, why: `${a.label} ${r} costs ${cost}; ${this.left()} left`, cost };
    this.draft.attrs[k] = r;
    return { ok: true, cost, left: this.left() };
  }
  bump(k, d) { return this.setRank(k, (this.draft.attrs[k] ?? CREATOR.rankStart) + Math.sign(d)); }
  setTrait(id, on) {
    const t = traitById(id);
    if (!t) return { ok: false, why: `no trait "${id}"` };
    const P = this.draft, has = P.traits.includes(id);
    if (on === undefined) on = !has;
    if (on === has) return { ok: true, cost: 0, left: this.left() };
    if (on) {
      const flaw = isFlaw(id), flaws = P.traits.filter(isFlaw), goods = P.traits.filter((x) => !isFlaw(x));
      if (flaw && flaws.length >= CREATOR.maxFlaws) return { ok: false, why: `${CREATOR.maxFlaws} flaws at most` };
      if (!flaw && goods.length >= CREATOR.maxGood) return { ok: false, why: `${CREATOR.maxGood} good traits at most` };
      const clash = P.traits.find((x) => (t.not ?? []).includes(x) || (traitById(x).not ?? []).includes(id));
      if (clash) return { ok: false, why: `${t.label} and ${traitById(clash).label} cannot both be true` };
    }
    const cost = priceOfTrait(P, id, on);
    if (cost > 0 && cost > this.left()) return { ok: false, why: `${t.label} costs ${cost}; ${this.left()} left`, cost };
    P.traits = on ? [...P.traits, id] : P.traits.filter((x) => x !== id);
    return { ok: true, cost, left: this.left() };
  }
  set(fields = {}) {
    const P = this.draft, out = {};
    if (fields.name !== undefined) { if (this.lock) out.name = 'locked by the shard'; else P.name = String(fields.name).slice(0, CREATOR.nameMax); }
    if (fields.flag !== undefined) { if (this.lock) out.flag = 'locked by the shard'; else if (FLAGS[fields.flag]) P.flag = fields.flag; else return { ok: false, why: `no flag "${fields.flag}" (${FLAG_KEYS.join(' ')})` }; }
    if (fields.state !== undefined) { if (!STATES[fields.state]) return { ok: false, why: `no state "${fields.state}" (USPS code)` }; P.state = fields.state; }
    if (fields.background !== undefined) { if (!backgroundById(fields.background)) return { ok: false, why: `no background "${fields.background}" (${BACKGROUNDS.map((b) => b.id).join(', ')})` }; P.background = fields.background; }
    if (fields.look) Object.assign(P.look, cleanPicks({ look: { ...P.look, ...fields.look } }).look);
    return { ok: true, ...(Object.keys(out).length ? { ignored: out } : {}) };
  }
  rollName(rng = Math.random) { if (this.lock) return this.draft.name; this.draft.name = randomName(rng); return this.draft.name; }
  randomize(seed = (Math.random() * 1e9) | 0) {
    const rng = makeRng(seed);
    const p = randomPicks(rng, { names: (r) => randomName(r), flags: FLAG_KEYS });
    if (this.lock) { p.name = this.lock.name; p.flag = this.lock.flag; }
    this.draft = p;
    return { ok: true, seed, left: this.left() };
  }
  randomizeLook(seed = (Math.random() * 1e9) | 0) { this.draft.look = randomLook(makeRng(seed)); return { ok: true }; }
  reset() { this.draft = freshPicks(); if (this.lock) { this.draft.name = this.lock.name; this.draft.flag = this.lock.flag; } }

  // Everything the screen and the agent read about a set of picks.
  view(p = this.draft) {
    const b = backgroundById(p.background);
    return {
      picks: JSON.parse(JSON.stringify(p)), tally: tally(p), errors: validate(p), effects: effects(p), skills: startSkills(p), maxHp: 100 + effects(p).hp,
      kit: kitOf(p), knowing: knowing(p, NPCS), background: b ? { id: b.id, label: b.label } : null,
      origin: { flag: p.flag, country: FLAGS[p.flag]?.name ?? p.flag, state: p.state, stateName: STATES[p.state], ruler: RULERS[p.state] ?? null },
      locked: this.lock ? { ...this.lock } : null,
    };
  }

  // ---- BEGIN: the draft becomes the player --------------------------------------------------------------------------
  begin(picks = this.draft, { start = true } = {}) {
    const P = cleanPicks(picks);
    if (this.lock) { P.name = this.lock.name; P.flag = this.lock.flag; }
    const errs = validate(P);
    if (errs.length) return { ok: false, errors: errs };
    const g = this.g, p = g.player;
    if (p.inVehicle) g.exitVehicle?.(true);
    this.applyIdentity(P);
    // Skills: the attributes' starting levels, no xp toward the next.
    const S = g.skillsSys, lv = startSkills(P);
    for (const k of Object.keys(S.lv)) { S.lv[k] = lv[k] ?? 0; S.xp[k] = 0; }
    // The kit: an empty pack of the background's kind, its things, its guns (loaded, rounds in your pockets), its gear on.
    const K = kitOf(P), inv = g.inventory;
    inv.carried.slots = []; inv.worn = null; inv.carried.cap = 0;
    inv.wear(K.pack);
    for (const [id, n] of K.items) if (ITEMS[id]) inv.add(inv.carried, id, n);
    const guns = K.guns.filter(([w]) => WEAPONS[w]);
    const ammo = { pistol: 0, smg: 0, shells: 0, rifle: 0 }, mag = {}, cond = {};
    for (const [w, rounds, c] of guns) { const W = WEAPONS[w], load = Math.min(W.mag, rounds); mag[w] = load; cond[w] = c ?? 1; ammo[W.ammo] = (ammo[W.ammo] ?? 0) + Math.max(0, rounds - load); }
    const thr = { frag: 0, molotov: 0, smoke: 0, flash: 0, pipe: 0, sticky: 0, rock: 99, ...K.throwables };
    g.inv = { weapons: guns.map(([w]) => w), current: guns[0]?.[0] ?? 'pistol', mag, cond, jam: {}, ammo, throwables: thr,
      throwable: Object.keys(thr).find((k) => k !== 'rock' && thr[k] > 0) ?? 'rock' };
    if (!g.inv.weapons.length) { g.inv.weapons = ['pistol']; g.inv.mag.pistol = 0; g.inv.cond.pistol = 0.5; } // the engine needs a gun in hand
    inv.bindAmmo();
    p.weapon = g.inv.current; p.reloading = 0;
    g.gear.load({ worn: {} });
    for (const id of K.wear) if (GEAR[id]) g.gear.put(id);
    inv.changed();
    g.cash = K.cash;
    // Who already knows you.
    const W = knowing(P, NPCS), F = g.society.factions;
    for (const [fid, d] of Object.entries(W.standing)) F.add(fid, d);
    for (const n of W.npcs) g.society.memory.remember(n.id, n.kind, { weight: n.weight ?? 1, about: n.about ?? '' });
    for (const [rid, r] of Object.entries(W.renown)) g.roles?.setRenown?.(rid, r);
    for (const c of g.chars) F.assign(c);
    p.hp = p.maxHp; p.alive = true;
    S.recompute();
    this.made++;
    this.pending = false; this.lock = null;
    // Where they wake: the engine's start unless a row or the start lane's hook says otherwise.
    let at = null;
    if (start && START.place) {
      p.x = START.place.x; p.z = START.place.z; g.standOn?.(p);
      g.camLook.x = p.x; g.camLook.z = p.z; g.streamer?.ensureHot(p.x, p.z, 'load');
      at = { x: p.x, z: p.z };
    }
    if (start) this.onStart?.(this.sheet, g);
    const bg = backgroundById(P.background);
    g.emit('created', { name: P.name, flag: P.flag, state: P.state, background: P.background, traits: [...P.traits], left: tally(P).left, cash: g.cash });
    return { ok: true, name: P.name, flag: P.flag, background: bg.label, skills: lv, maxHp: p.maxHp, cash: g.cash, guns: g.inv.weapons, worn: K.wear, knowing: W.lines, at };
  }

  // Identity and the numbers: name, flag, look and build, max hp, g.sheet. A load does only this.
  applyIdentity(P) {
    const g = this.g, p = g.player, fx = effects(P);
    this.sheet = { picks: JSON.parse(JSON.stringify(P)), fx };
    g.sheet = this.sheet;
    p.name = P.name; p.flag = FLAGS[P.flag] ? P.flag : 'US';
    p.colors = lookColors(P);
    const b = buildOf(P); p.build = b.w === 1 && b.h === 1 ? null : b;
    if (g.gear) { g.gear.look0 = null; g.gear.dress(); }
    g.charR?.paint(p);
    p.maxHp = 100 + fx.hp;
    if (p.hp > p.maxHp) p.hp = p.maxHp;
    g.hud?.paintFlag?.(p.flag);
    this.nameTape(P.name);
    g.skillsSys?.recompute();
  }

  // The stitched name tape under the HUD's flag patch.
  nameTape(name) {
    const host = this.g.hud?.el?.flag;
    if (!host) return;
    let t = host.querySelector('.cr-tape');
    if (!name) { t?.remove(); return; }
    if (!t) { t = document.createElement('div'); t.className = 'cr-tape'; host.appendChild(t); }
    t.textContent = name.toUpperCase();
  }

  clear() {
    const g = this.g, p = g.player, B = this.base;
    this.sheet = null; g.sheet = null;
    if (B) { p.name = B.name; p.flag = B.flag; p.colors = { ...B.colors }; p.maxHp = B.maxHp; if (p.hp > p.maxHp) p.hp = p.maxHp; }
    p.build = null;
    if (g.gear) { g.gear.look0 = null; g.gear.dress(); }
    g.charR?.paint(p);
    g.hud?.paintFlag?.(p.flag);
    this.nameTape(null);
    g.skillsSys?.recompute();
  }

  save() { return this.sheet ? JSON.parse(JSON.stringify(this.sheet.picks)) : null; }
  load(s) { if (s) this.applyIdentity(cleanPicks(s)); else this.clear(); }

  // The shard made a character with a name and a flag and nothing else: the screen opens on it (net/shard.js).
  forShard(char, onDone) {
    this.lock = { name: char.name, flag: FLAGS[char.flag] ? char.flag : 'US' };
    this.pending = true;
    this.reset();
    this.g.creatorUI?.open({ shard: true, onBegin: onDone });
  }
}

export { CREATOR, ATTRS, BACKGROUNDS, TRAITS, FLAWS };
