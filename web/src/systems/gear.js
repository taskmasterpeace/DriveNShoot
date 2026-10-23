import { SLOTS, ARMOR_SLOTS, GEAR, PARTS, HIT_ODDS, NO_SOAK, SOAK_CAP, BLAST_SOAK, MOD_CAP, SLOT_LABEL } from '../data/gear.js';
import { ITEMS } from '../data/items.js';

// What you wear: the 19-slot paperdoll (data/gear.js, docs/design/WEB_INVENTORY.md §Gear). This is the wearer, one
// piece per slot; the catalog is data. A piece comes out of the carried list when worn and goes back into it when
// taken off (the ground at your feet if there is no room). The back slot is the worn pack (inventory.worn).
// mods: the summed effects of what is worn, each read by exactly one consumer:
//   soak (per part) -> combat.js damage       carry, speed, reload -> skills.js recompute
//   stealth -> ai.js scan                     repair -> inventory.js act       luck -> inventory.js roll
// Anyone else may wear gear too (c.worn, the same shape): soak() reads it from the character it is asked about.
const MODS = ['carry', 'speed', 'reload', 'stealth', 'repair', 'luck', 'unarmed'];

export class Gear {
  constructor(game) {
    this.g = game;
    this.worn = Object.fromEntries(SLOTS.map((s) => [s, null]));
    this.mods = Object.fromEntries(MODS.map((k) => [k, 0]));
    this.soakBy = Object.fromEntries(PARTS.map((p) => [p, 0])); // the player's cut per body part
    this.look0 = null; // the player's own styles, put back when the armor comes off
    this.soaked = 0;   // damage armor has eaten (the player's)
    this.recompute();
  }

  row(id) { return id ? GEAR[id] ?? null : null; }

  // A part's soak for anyone wearing gear: every worn piece that covers it, summed, capped.
  partSoak(worn, part) {
    let s = 0;
    for (const slot in worn) { const r = this.row(worn[slot]); if (r?.soak && r.covers?.includes(part)) s += r.soak; }
    return Math.min(SOAK_CAP, s);
  }

  // How much of a hit on c the armor eats (0..SOAK_CAP): the part it lands on by what made it (HIT_ODDS), or the part
  // the caller names. Returns { cut, part }. Nothing worn, or a cause armor does nothing for: cut 0.
  soak(c, cause = 'bullet', part = null) {
    const worn = c === this.g.player ? this.worn : c?.worn;
    if (!worn || NO_SOAK.includes(cause)) return { cut: 0, part: null };
    const odds = HIT_ODDS[cause] ?? { torso: 1 };
    if (!part && odds === 'all') {
      let s = 0;
      for (const p of PARTS) s += this.partSoak(worn, p);
      return { cut: (s / PARTS.length) * BLAST_SOAK, part: 'all' };
    }
    if (!part) {
      let r = Math.random(), last = 'torso';
      for (const p of PARTS) { const w = odds[p] ?? 0; if (!w) continue; last = p; if ((r -= w) < 0) { part = p; break; } }
      part ??= last;
    }
    return { cut: this.partSoak(worn, part), part };
  }

  // ---- wearing ------------------------------------------------------------------------------------------------------
  // Wear the gear in slot i of the carried list. What was in its slot goes back in the pack. Returns { ok, text } or why.
  wear(i) {
    const inv = this.g.inventory, s = inv.carried.slots[i], r = s && this.row(s.id);
    if (!r) return { ok: false, why: s ? `${ITEMS[s.id]?.name ?? s.id} is not something you wear` : 'nothing there' };
    const was = this.worn[r.slot];
    inv.take(inv.carried, i, 1);
    this.worn[r.slot] = s.id;
    if (was) this.stow(was);
    this.recompute();
    this.g.emit('gearWorn', { item: s.id, slot: r.slot, was });
    return { ok: true, text: `WEARING ${r.name.toUpperCase()}${was ? ` · ${GEAR[was].name.toUpperCase()} OFF` : ''}`, slot: r.slot, was };
  }

  // Take off what is in a slot: into the pack, or at your feet if there is no room for it.
  takeOff(slot) {
    const id = this.worn[slot];
    if (!id) return { ok: false, why: `nothing worn on your ${(SLOT_LABEL[slot] ?? slot).toLowerCase()}` };
    this.worn[slot] = null;
    const where = this.stow(id);
    this.recompute();
    this.g.emit('gearOff', { item: id, slot, where });
    return { ok: true, text: `${GEAR[id].name.toUpperCase()} OFF${where === 'ground' ? ' · AT YOUR FEET' : ''}` };
  }

  stow(id) {
    const inv = this.g.inventory, P = this.g.player;
    if (inv.add(inv.carried, id, 1)) { inv.changed(); return 'pack'; }
    inv.add(inv.groundAt(P.x, P.z), id, 1); inv.changed();
    return 'ground';
  }

  // Put a piece straight on (agents and tests; the PACK screen goes through wear()).
  put(id) {
    const r = this.row(id);
    if (!r) return false;
    this.worn[r.slot] = id;
    this.recompute();
    return true;
  }

  // ---- the numbers the consumers read ---------------------------------------------------------------------------------
  recompute() {
    for (const k of MODS) this.mods[k] = 0;
    for (const slot of SLOTS) { const r = this.row(this.worn[slot]); if (r) for (const k of MODS) if (r[k]) this.mods[k] += r[k]; }
    for (const k of MODS) this.mods[k] = Math.max(-MOD_CAP[k], Math.min(MOD_CAP[k], this.mods[k]));
    for (const p of PARTS) this.soakBy[p] = this.partSoak(this.worn, p);
    this.dress();
    this.g.skillsSys?.recompute?.(); // carry, speed, reload
    if (this.g.inventory) this.g.inventory.dirty = true;
  }
  // Single-consumer reads (kept as methods so the consumer never re-derives them).
  carryKg() { return this.mods.carry; }
  wornKg() { let k = 0; for (const s of SLOTS) { const id = this.worn[s]; if (id) k += ITEMS[id]?.kg ?? 0; } return k; } // what you wear still weighs (inventory.kg)
  speedMul() { return 1 + this.mods.speed; }
  reloadMul() { return 1 - this.mods.reload; }
  // ...and the traits you were made with (data/creator.js, g.sheet.fx) fold into the same three numbers.
  seenMul() { return (1 - this.mods.stealth) * (this.g.sheet?.fx.seenMul ?? 1); }     // how close a hostile must be to spot you
  repairMul() { return 1 + this.mods.repair + (this.g.sheet?.fx.repair ?? 0); }
  luckRolls() { return Math.round(this.mods.luck + (this.g.sheet?.fx.luck ?? 0)); }

  // What the player's body shows: a vest, a helmet, a poncho, a bandolier while one is worn (characters.js styles).
  dress() {
    const P = this.g.player, C = P?.colors;
    if (!C) return;
    this.look0 ??= { hatStyle: C.hatStyle, hat: C.hat, gearStyle: C.gearStyle, gear: C.gear };
    const L = this.look0;
    let hat = L.hatStyle, hatC = L.hat, gear = L.gearStyle, gearC = L.gear;
    for (const slot of ['sash', 'coat', 'chest']) { const k = this.row(this.worn[slot])?.look; if (k?.gear) { gear = k.gear; gearC = k.color ?? gearC; } } // the chest piece shows over the rest
    const h = this.row(this.worn.head)?.look; if (h?.hat) { hat = h.hat; hatC = h.color ?? hatC; }
    if (C.hatStyle === hat && C.gearStyle === gear && C.hat === hatC && C.gear === gearC) return;
    Object.assign(C, { hatStyle: hat, hat: hatC, gearStyle: gear, gear: gearC });
    this.g.charR?.paint(P);
  }

  // ---- what the agent and the PACK screen see -------------------------------------------------------------------------
  view() {
    const inv = this.g.inventory;
    const slots = SLOTS.map((s) => {
      const id = s === 'back' ? inv?.worn ?? null : this.worn[s], r = s === 'back' ? null : this.row(id);
      return { slot: s, label: SLOT_LABEL[s], armor: ARMOR_SLOTS.includes(s), item: id, name: id ? (ITEMS[id]?.name ?? id) : null, soak: r?.soak ?? 0, covers: r?.covers ?? [], mod: r ? MODS.filter((k) => r[k]).map((k) => `${k} ${r[k]}`).join(' ') || null : null };
    });
    return {
      worn: slots.filter((x) => x.item).length, slots,
      soak: Object.fromEntries(PARTS.map((p) => [p, +this.soakBy[p].toFixed(3)])),
      mods: { ...this.mods },
      consumers: { carryKg: +(this.g.skills?.carryKg ?? 0).toFixed(1), speedMul: +(this.g.skills?.speedMul ?? 1).toFixed(3), reloadMul: +(this.g.skills?.reloadMul ?? 1).toFixed(3), seenMul: +this.seenMul().toFixed(3), repairMul: +this.repairMul().toFixed(3), luckRolls: this.luckRolls(), unarmed: 'no bare-hands fighting in this engine yet' },
      soaked: Math.round(this.soaked),
    };
  }

  save() { return { worn: Object.fromEntries(SLOTS.filter((s) => this.worn[s]).map((s) => [s, this.worn[s]])), soaked: Math.round(this.soaked) }; }
  load(s) {
    for (const k of SLOTS) this.worn[k] = null;
    for (const [slot, id] of Object.entries(s?.worn ?? {})) if (SLOTS.includes(slot) && GEAR[id]?.slot === slot) this.worn[slot] = id; // a piece the catalog lost, or a mis-slotted one, is dropped
    this.soaked = s?.soaked ?? 0;
    this.recompute();
  }
}
