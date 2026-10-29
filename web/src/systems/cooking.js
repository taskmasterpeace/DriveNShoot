import { ITEMS } from '../data/items.js';
import { SKILLS as DEEP } from '../data/stats.js';
import { RECIPES, RECIPE_BY_ID, QUALITY } from '../data/cooking.js';

// COOKING MEALS (docs/design/WEB_FARMING.md §3.5; rows in data/cooking.js). g.cooking.
// A recipe turns REAL ingredients (taken from your pack) into meal items at a fire pit, a camp stove or the kitchen of a
// base you hold (a stove burns a deadwood a batch). The quality number comes from the cook's level, the herbs, how fresh
// the ingredients were and the bench; the tier it falls in is the item you hold (`<recipe>__off|poor|good|fine`), so it
// survives the pack, a trade and a save. Cooking food that had already rotted makes an `off` meal: eating it poisons you.
// Eating a good or fine meal lifts morale and keeps you well fed for hours (a little hp back every game hour).
const r2 = (v) => Math.round(v * 100) / 100;
DEEP.cooking.xp = { ...(DEEP.cooking.xp ?? {}), mealCooked: 5 };

export class Cooking {
  constructor(game) {
    this.g = game; game.cooking = this;
    this.wellFed = null;  // { until, hpPerHour, tier, recipe }
    this.lastAt = null;
    this.stats = { batches: 0, meals: 0, off: 0, eaten: 0, crewBatches: 0 };
    this.seen = 0;
  }
  hours() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }
  inv() { return this.g.inventory; }
  lv() { return this.g.outdoors?.lv?.('cooking') ?? 0; }

  // What is under your hands to cook on: a fire (a pit, a stove in a camper), or a held base's kitchen.
  bench(p = this.g.player) {
    const g = this.g, h = g.fauna?.heatNear?.(p.x, p.z);
    if (h) return { kind: 'fire', label: h.kind };
    const b = g.homes?.baseAt?.(p.x, p.z, 0);
    if (b && b.state === 'held' && g.homes.gives(b).cook) return { kind: 'stove', label: 'kitchen stove', base: b };
    return null;
  }
  benchOk(r, b) { return r.bench === 'any' ? !!b : b?.kind === r.bench; }
  hasTool(tag) { const inv = this.inv(); return inv.hasTag(tag); }
  have(r, pool = this.inv().carried) { const out = {}; for (const [id, n] of Object.entries(r.inputs)) out[id] = pool.count(id) >= n; return out; }
  canMake(r, pool = this.inv().carried) { return Object.values(this.have(r, pool)).every(Boolean); }

  // Take the inputs of one batch out of a box; returns { rotten, fresh (0..1 mean), herbs } or null when something is short.
  takeInputs(r, box) {
    const inv = this.inv();
    if (!this.canMake(r, box)) return null;
    let units = 0, score = 0, rotten = false;
    for (const [id, n] of Object.entries(r.inputs)) {
      let need = n;
      for (let i = 0; i < box.slots.length && need > 0; i++) {
        const s = box.slots[i]; if (s.id !== id) continue;
        const f = inv.freshness(s), k = f === 'rotten' ? 0 : f === 'stale' ? QUALITY.staleMul : 1, t = Math.min(need, s.n);
        if (f === 'rotten') rotten = true;
        units += t; score += k * t; need -= t;
        inv.take(box, i, t); i = -1; // the slot list shifts when a stack empties
      }
    }
    inv.changed();
    return { rotten, fresh: units ? score / units : 1, herbs: 'herbs' in r.inputs };
  }
  quality(inp, lvl, bench, pot) {
    const Q = QUALITY;
    return r2(Math.max(0, Math.min(1, Q.base + Q.perLevel * lvl + (inp.herbs ? Q.herbs : 0) + Q.fresh * (inp.fresh - 0.5) * 2 * 0.5 + (bench === 'stove' ? Q.stoveBonus : 0) + (pot ? Q.potBonus : 0))));
  }
  tierOf(q, rotten) {
    if (rotten) return 'off';
    const T = QUALITY.tiers; let t = 'poor';
    for (let i = 1; i < T.length; i++) if (q >= T[i][1]) t = T[i][0];
    return t;
  }
  options() {
    const b = this.bench(), inv = this.inv();
    return RECIPES.map((r) => ({ id: r.id, name: r.name, inputs: r.inputs, have: this.have(r), tools: r.tools, toolsOk: r.tools.every((t) => this.hasTool(t)), bench: r.bench, benchOk: this.benchOk(r, b), can: this.canMake(r) && r.tools.every((t) => this.hasTool(t)) && this.benchOk(r, b), hours: r.hours, food: r.food, makes: r.output.n }));
  }
  cook(id, batches = 1) {
    const g = this.g, P = g.player, inv = this.inv(), r = RECIPE_BY_ID[id];
    if (!r) return { ok: false, why: `unknown recipe ${id} (${RECIPES.map((q) => q.id).join(', ')})` };
    const b = this.bench(P);
    if (!b) return { ok: false, why: 'you need a fire, a camp stove or the kitchen of a place you hold' };
    if (!this.benchOk(r, b)) return { ok: false, why: `${r.name.toLowerCase()} needs ${r.bench === 'stove' ? 'a real stove (a held kitchen)' : 'a fire'}` };
    for (const t of r.tools) if (!this.hasTool(t)) return { ok: false, why: `you need a ${t} (${t === 'pot' ? 'a cooking pot' : t})` };
    batches = Math.max(1, Math.min(4, Math.floor(batches)));
    for (const [item, n] of Object.entries(r.inputs)) if (inv.carried.count(item) < n * batches) return { ok: false, why: `${r.name.toLowerCase()} needs ${n * batches} ${ITEMS[item].name.toLowerCase()} (you have ${inv.carried.count(item)})` };
    if (b.kind === 'stove' && inv.carried.count('deadwood') < QUALITY.deadwoodPerBatch * batches) return { ok: false, why: 'the stove wants wood: bring deadwood' };
    if (g.farming?.job) return { ok: false, why: `busy: ${g.farming.job.label}` };
    const secs = Math.max(3, Math.min(14, r.hours * 6)) * batches;
    return g.farming.startJob(`cooking ${r.name.toLowerCase()}`, +secs.toFixed(1), () => this.finish(r, batches, b, P));
  }
  finish(r, batches, b, P) {
    const g = this.g, inv = this.inv();
    if (b.kind === 'stove') for (let k = 0; k < QUALITY.deadwoodPerBatch * batches; k++) inv.take(inv.carried, inv.carried.slots.findIndex((s) => s.id === 'deadwood'), 1);
    let rotten = false, fresh = 0, herbs = false, done = 0;
    for (let k = 0; k < batches; k++) { const inp = this.takeInputs(r, inv.carried); if (!inp) break; rotten ||= inp.rotten; fresh += inp.fresh; herbs ||= inp.herbs; done++; }
    if (!done) return { ok: false, why: 'the ingredients went missing' };
    const pot = r.tools.includes('pot'), q = this.quality({ fresh: fresh / done, herbs }, this.lv(), b.kind, pot), tier = this.tierOf(q, rotten), item = `${r.id}__${tier}`;
    const n = r.output.n * done, got = inv.add(inv.carried, item, n, { made: this.hours() });
    inv.changed();
    this.stats.batches += done; this.stats.meals += got; if (tier === 'off') this.stats.off += got;
    g.outdoors?.gain?.('cooking', 1.5 * done);
    g.emit('mealCooked', { recipe: r.id, tier, q, n: got, bench: b.kind });
    g.hud?.toast?.(`COOKED · ${got} ${ITEMS[item].name.toUpperCase()}${tier === 'off' ? ' · THE FOOD WAS ROTTEN' : ''}`, tier === 'off' ? 'warn' : 'job');
    return { ok: true, recipe: r.id, tier, q, item, n: got, text: `${got} ${ITEMS[item].name.toUpperCase()} · QUALITY ${Math.round(q * 100)}` };
  }

  // The crew's COOK job (systems/crew.js jobCycle): the best meal their stock allows, at the camp or base fire.
  crewCook(m, mul = 1) {
    const g = this.g, inv = this.inv(), skill = (m?.row?.skills?.cook ?? 1) * 2;
    const pools = [inv.carried, inv.boxes.get('crew:stash')].filter(Boolean);
    let best = null;
    for (const box of pools) for (const r of RECIPES) {
      if (r.bench === 'stove' || !this.canMake(r, box) || !r.tools.every((t) => this.hasTool(t) || box.slots.some((s) => ITEMS[s.id]?.tags?.includes(t)))) continue;
      const score = r.food * r.output.n; if (!best || score > best.score) best = { r, box, score };
    }
    if (!best) return null;
    const inp = this.takeInputs(best.r, best.box); if (!inp) return null;
    const q = this.quality(inp, skill * Math.min(1.5, mul), 'fire', best.r.tools.includes('pot')), tier = this.tierOf(q, inp.rotten);
    const item = `${best.r.id}__${tier}`, n = best.r.output.n;
    const eaters = [...(g.crew?.members ?? []).filter((x) => x.c?.alive)], per = (best.r.food * QUALITY.mul[tier] * n) / Math.max(1, eaters.length + 0.5);
    this.stats.crewBatches++; this.stats.meals += n; if (tier === 'off') this.stats.off += n;
    g.emit('mealCooked', { recipe: best.r.id, tier, q, n, bench: 'camp', by: m?.id ?? 'crew' });
    return { recipe: best.r.id, tier, q, item, n, per, text: `${ITEMS[item].name.toLowerCase()}`, off: tier === 'off' };
  }

  // Eating (inventory.use emits itemUsed): a meal's tier sets the mood and how long you stay well fed.
  onEvent(e) {
    if (e.type !== 'itemUsed') return;
    const it = ITEMS[e.item]; if (!it?.meal) return;
    const t = it.meal.tier, g = this.g, M = QUALITY.mood[t];
    this.stats.eaten++;
    if (M) g.deep?.moraleAdd?.(M);
    if (QUALITY.wellFedH[t] > 0) this.wellFed = { until: this.hours() + QUALITY.wellFedH[t], tier: t, recipe: it.meal.recipe };
    if (t === 'off' && !g.godMode) { g.survival?.sicken?.('poisoning'); g.emit('poisoned', { item: e.item }); }
  }
  update(dt) {
    const g = this.g, E = g.events;
    if (E?.length) { let i = E.length - 1; while (i > 0 && E[i - 1].seq > this.seen) i--; for (; i < E.length; i++) { if (E[i].seq <= this.seen) continue; this.seen = E[i].seq; this.onEvent(E[i]); } }
    const now = this.hours();
    if (this.lastAt === null) this.lastAt = now;
    const d = Math.max(0, Math.min(2, now - this.lastAt)); this.lastAt = now;
    if (this.wellFed) {
      if (now >= this.wellFed.until) this.wellFed = null;
      else if (d > 0 && g.player?.alive) { const P = g.player; P.hp = Math.min(P.maxHp ?? 100, P.hp + QUALITY.wellFed.hpPerHour * d); }
    }
  }
  view() { return { level: this.lv(), bench: this.bench(), wellFed: this.wellFed ? { tier: this.wellFed.tier, hoursLeft: r2(this.wellFed.until - this.hours()) } : null, stats: { ...this.stats }, options: this.options() }; }
  save() { return { wellFed: this.wellFed, stats: { ...this.stats } }; }
  load(s) { this.wellFed = s?.wellFed ?? null; Object.assign(this.stats, s?.stats ?? {}); this.lastAt = null; }
}
