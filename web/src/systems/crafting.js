import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import '../data/fauna.js'; // its items (snare wire) join ITEMS on import: recipes name them
import { RECIPES, RECIPE_BY_ID, CRAFT_RULES, GROUPS, matterOf } from '../data/recipes.js';
import { BENCHES, TOWN_BENCHES, PLACE_RULES } from '../data/benches.js';
import { SKILLS } from '../data/stats.js';

// THE MAKER (docs/design/WEB_CRAFTING.md): one engine that runs every recipe row. Under depth law 2 (the world never
// regenerates loot) this is the honest way scrap becomes stock, so it never creates matter: a make costs its inputs up
// front, every tool in the hand wears, the clock runs, and what comes out weighs no more than what went in (data/recipes.js
// validateRecipes). It owns: what you know, the benches in reach, a queue with a progress bar on the GAME clock, and the
// benches you have set down. Crew jobs reuse the same rows (crewRun).
const tick = (n, d = 2) => +n.toFixed(d);

export class Crafting {
  constructor(game) {
    this.g = game;
    this.learned = new Set();   // recipe ids learned from a book, a teacher or the books lane (knowRecipe)
    this.placed = [];           // { id, bench, item, x, z } benches you set down: furniture is only what you found and carried
    this.providers = [];        // (g) => [{ bench, x, z, reach?, owner?, fee? }]: a base lane's benches register here
    this.queue = [];            // { rid, need, done, q, paid, inputs, tools, bench } the head is being worked
    this.lastT = null;
    this.stats = { made: 0, byRecipe: {}, wornOut: 0, refused: 0, hours: 0, paid: 0 };
    this.meshes = new Map();
    this.sink = []; // last results, for the agent
    // The camps lane's carried furniture: a workbench or a stove standing within reach (in a house, or set down in a base) is that bench.
    this.addProvider((g) => (g.homes?.piecesNear?.(g.player.x, g.player.z, 4) ?? []).flatMap((p) => (p.kind === 'workbench' ? [{ bench: 'workbench', x: p.x, z: p.z, reach: 4 }] : p.kind === 'stove' ? [{ bench: 'kitchen', x: p.x, z: p.z, reach: 4 }] : [])));
    this.dirty = true;
  }

  // ---- knowledge ----------------------------------------------------------------------------------------------------
  skillOf(r) { return this.g.deep?.skill?.[r.skill] ?? 0; }
  // Learn a recipe by any hook: a manual, a teacher, a book (the books lane calls this).
  knowRecipe(id, how = 'taught') {
    if (!RECIPE_BY_ID[id]) return { ok: false, why: `no recipe ${id}` };
    const was = this.knows(id);
    this.learned.add(id);
    if (!was) { this.g.hud?.toast?.(`LEARNED: ${RECIPE_BY_ID[id].name.toUpperCase()}`, 'job'); this.g.emit?.('recipeLearned', { id, how }); }
    this.dirty = true;
    return { ok: true, id, how, already: was };
  }
  forgetRecipe(id) { const had = this.learned.delete(id); this.dirty = true; return { ok: had }; }
  knows(id) {
    const r = RECIPE_BY_ID[id];
    if (!r) return false;
    if (this.learned.has(id)) return true;
    const lf = r.learnedFrom;
    if (lf === 'default') return true;
    if (lf === 'skill') return this.skillOf(r) >= r.minSkill;
    if (lf.startsWith('perk:')) { const [, s, t] = lf.split(':'); return (this.g.deep?.perks?.[s]?.length ?? 0) >= +t; }
    return false;
  }
  // What teaches a recipe you do not know, in plain words.
  teaches(id) {
    const r = RECIPE_BY_ID[id], lf = r.learnedFrom;
    if (lf === 'skill') return `comes with ${SKILLS[r.skill]?.label ?? r.skill} ${r.minSkill}`;
    if (lf.startsWith('perk:')) { const [, s, t] = lf.split(':'); return `a ${SKILLS[s]?.label ?? s} perk (tier ${t})`; }
    if (lf.startsWith('book:')) return `read ${ITEMS[lf.slice(5)]?.name ?? lf.slice(5)}`;
    return '';
  }
  // A manual (use act 'learn'): every recipe it names.
  act(verb, s, it) {
    if (verb === 'learn') {
      const ids = it.learns ?? [];
      if (!ids.length) return { ok: false, why: 'nothing in it you can use' };
      const fresh = ids.filter((id) => !this.knows(id));
      for (const id of ids) this.learned.add(id);
      this.dirty = true;
      if (!fresh.length) return { ok: false, why: 'you already know all of it' };
      this.g.emit?.('recipeLearned', { ids: fresh, how: 'book', item: s.id });
      return { ok: true, text: `LEARNED ${fresh.map((id) => RECIPE_BY_ID[id].name.toUpperCase()).join(', ')}` };
    }
    if (verb === 'mendgear') {
      const n = this.mendGear(0.25);
      return n ? { ok: true, text: `${n} PIECE${n > 1 ? 'S' : ''} PATCHED` } : { ok: false, why: 'nothing you wear or carry needs patching' };
    }
    return { ok: false, why: 'not here' };
  }

  // ---- reach: what is in your pack, in the trunk beside you ---------------------------------------------------------
  trunkNear() {
    const g = this.g, p = g.player, v = p.inVehicle ?? g.vehicles.find((c) => !c.dead && !c.sunk && Math.hypot(c.x - p.x, c.z - p.z) < Math.max(3.6, c.len * 0.7));
    return v ? g.inventory.trunk(v) : null;
  }
  pool() { const t = this.trunkNear(); return t ? [this.g.inventory.carried, t] : [this.g.inventory.carried]; }
  have(id) { let n = 0; for (const b of this.pool()) n += b.count(id); return n; }
  // The best carried tool for a spec ('hammer', 'saw|blade'): { box, i, s } or null (best = most condition left).
  toolFor(spec, pool = this.pool()) {
    let best = null;
    const alts = spec.split('|');
    for (const box of pool) box.slots.forEach((s, i) => {
      const it = ITEMS[s.id];
      if (!it || (s.cond ?? 1) <= 0 || it.kind === 'gun') return;
      if (!alts.some((a) => a === s.id || it.tags?.includes(a))) return;
      if (!best || (s.cond ?? 1) > (best.s.cond ?? 1)) best = { box, i, s };
    });
    return best;
  }
  spendFrom(id, n) {
    const inv = this.g.inventory;
    let left = n;
    for (const box of this.pool()) {
      for (let i = box.slots.length - 1; i >= 0 && left > 0; i--) {
        if (box.slots[i].id !== id) continue;
        const k = Math.min(left, box.slots[i].n);
        inv.take(box, i, k); left -= k;
      }
    }
    inv.changed();
    return n - left;
  }

  // ---- benches ---------------------------------------------------------------------------------------------------
  fireNear(x, z, reach) {
    const g = this.g;
    for (const f of g.throwables?.fires ?? []) if (Math.hypot(f.x - x, f.z - z) < f.r + reach) return { x: f.x, z: f.z };
    for (const v of g.vehicles) if ((v.onFire > 0 || v.burn > 0) && !v.dead && Math.hypot(v.x - x, v.z - z) < 6 + reach) return { x: v.x, z: v.z };
    return null;
  }
  addProvider(fn) { this.providers.push(fn); }
  // { benchId: { via: 'fire'|'placed'|'town'|'mobile'|'base'|'hand', fee?, name?, owner? } } for where the player stands.
  benchesHere() {
    const g = this.g, p = g.player, out = { hand: { via: 'hand' } };
    const put = (id, v) => { if (!out[id] || (v.fee ?? 0) < (out[id].fee ?? 0)) out[id] = v; }; // the free one wins
    if (this.fireNear(p.x, p.z, BENCHES.campfire.reach)) put('campfire', { via: 'fire' });
    for (const b of this.placed) if (Math.hypot(b.x - p.x, b.z - p.z) < BENCHES[b.bench].reach) put(b.bench, { via: 'placed', placed: b.id });
    for (const fn of this.providers) for (const b of fn(g) ?? []) if (Math.hypot(b.x - p.x, b.z - p.z) < (b.reach ?? 4)) put(b.bench, { via: 'base', fee: b.fee ?? 0, owner: b.owner });
    for (const [tid, T] of Object.entries(TOWN_BENCHES)) {
      const c = g.chars.find((k) => k.npc?.id === T.keeper);
      if (!c || !c.alive || c.asleep || c.sleeping || c.downedT > 0 || Math.hypot(c.x - p.x, c.z - p.z) > T.r) continue;
      if (g.society?.memory?.refuses?.(c)) continue; // they will not have you in the shop
      const fee = T.fee * (g.roles?.priceMul?.(c.fid, c) ?? 1) * (g.deep?.fx?.priceMul ?? 1);
      for (const b of T.bench) put(b, { via: 'town', town: tid, name: T.name, owner: T.keeper, fee: tick(fee) });
    }
    for (const box of this.pool()) if (box.slots.some((s) => s.id === 'tool_roll')) put('mobile', { via: 'mobile' });
    return out;
  }
  benchFor(r, here = this.benchesHere()) {
    if (here[r.bench]) return { id: r.bench, ...here[r.bench] };
    if (r.mobile && here.mobile) return { id: 'mobile', ...here.mobile, standIn: true };
    return null;
  }

  // Set a bench item down where you stand (it leaves your pack and stands in the world), or pick it back up.
  place(itemId, at = null) { // at: { x, z } to stand it somewhere in reach (a base lane, a test); else a stride ahead of you
    const g = this.g, p = g.player, it = ITEMS[itemId];
    if (!it?.bench || !BENCHES[it.bench] || BENCHES[it.bench].kind !== 'placed') return { ok: false, why: `${it?.name ?? itemId} is not a bench you can set down` };
    if (p.inVehicle) return { ok: false, why: 'not from in here' };
    if (this.have(itemId) < 1) return { ok: false, why: `you are not carrying a ${it.name.toLowerCase()}` };
    const same = this.placed.filter((b) => b.bench === it.bench);
    if (same.length >= PLACE_RULES.maxPerBench) return { ok: false, why: `you have ${PLACE_RULES.maxPerBench} ${BENCHES[it.bench].name.toLowerCase()}s down already` };
    const sx = at?.x ?? p.x + Math.sin(p.face) * 1.3, sz = at?.z ?? p.z + Math.cos(p.face) * 1.3;
    if (this.placed.some((b) => Math.hypot(b.x - sx, b.z - sz) < PLACE_RULES.minApart)) return { ok: false, why: 'something is already set down right here' };
    this.spendFrom(itemId, 1);
    const b = { id: `bench:${(this.placeSeq = (this.placeSeq ?? 0) + 1)}`, bench: it.bench, item: itemId, x: tick(at?.x ?? p.x + Math.sin(p.face) * 1.3), z: tick(at?.z ?? p.z + Math.cos(p.face) * 1.3) };
    this.placed.push(b); this.mesh(b); this.dirty = true;
    g.emit?.('benchPlaced', { bench: b.bench, x: b.x, z: b.z });
    return { ok: true, text: `${BENCHES[it.bench].name} SET DOWN`, bench: b };
  }
  pickup() {
    const p = this.g.player;
    let best = null, bd = 3.2;
    for (const b of this.placed) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bd) { bd = d; best = b; } }
    if (!best) return { ok: false, why: 'no bench of yours within reach' };
    if (this.queue.some((j) => j.bench === best.bench && j.via === 'placed')) return { ok: false, why: 'work is running on it: cancel that first' };
    this.placed.splice(this.placed.indexOf(best), 1);
    const m = this.meshes.get(best.id); if (m) { m.parent?.remove(m); this.meshes.delete(best.id); }
    this.g.inventory.stow(best.item, 1);
    this.dirty = true;
    return { ok: true, text: `PICKED UP THE ${BENCHES[best.bench].name}`, bench: best };
  }
  // A blocky bench in its own colours (a forge glows, a press is green steel): one small group per set-down bench, shared
  // geometry and materials, nothing per frame.
  mesh(b) {
    const g = this.g;
    if (!g.scene) return;
    const L = { workbench: ['#8a6a45', '#b08a5c'], forge: ['#3c3834', '#d4601c'], sewing: ['#9a7a5a', '#cdb48a'], kitchen: ['#b8b4a8', '#e6e2d6'], reloading: ['#4e6240', '#8aa070'], chem: ['#5c7878', '#9ac0c0'] }[b.bench] ?? ['#8a6a45', '#b08a5c'];
    const T = (Crafting.geo ??= { box: new THREE.BoxGeometry(1.5, 0.85, 0.8), top: new THREE.BoxGeometry(1.6, 0.1, 0.9), vise: new THREE.BoxGeometry(0.28, 0.3, 0.3) });
    const mats = (Crafting.mats ??= {}), mat = (c, emit) => (mats[c + emit] ??= new THREE.MeshLambertMaterial({ color: c, emissive: emit ? c : '#000000', emissiveIntensity: emit ? 0.55 : 0 }));
    const grp = new THREE.Group();
    const body = new THREE.Mesh(T.box, mat(L[0], false)); body.position.y = 0.43; body.castShadow = true;
    const top = new THREE.Mesh(T.top, mat(L[1], b.bench === 'forge')); top.position.y = 0.9;
    const vise = new THREE.Mesh(T.vise, mat('#2c2a28', false)); vise.position.set(0.55, 1.1, 0.2);
    grp.add(body, top, vise);
    grp.position.set(b.x, g.stunts?.heightAt(b.x, b.z, 0) ?? 0, b.z); grp.rotation.y = g.player.face;
    g.scene.add(grp); this.meshes.set(b.id, grp);
  }

  // ---- can I make this --------------------------------------------------------------------------------------------
  // The whole verdict for one recipe, with every miss named: { ok, missing: [...strings], inputs: [...], tools: [...], ... }
  assess(id, here = this.benchesHere()) {
    const r = RECIPE_BY_ID[id];
    if (!r) return { ok: false, why: `no recipe ${id}`, missing: [`no recipe ${id}`] };
    const missing = [], inputs = r.inputs.map(([item, n]) => ({ item, name: ITEMS[item]?.name ?? item, need: n, have: this.have(item) }));
    const known = this.knows(id), skill = this.skillOf(r);
    if (!known) missing.push(`you do not know it: ${this.teaches(id)}`);
    else if (skill < r.minSkill) missing.push(`${SKILLS[r.skill]?.label ?? r.skill} ${r.minSkill} (you have ${Math.floor(skill)})`);
    for (const i of inputs) if (i.have < i.need) missing.push(`${i.need - i.have} more ${i.name.toLowerCase()}`);
    const tools = r.tools.map(([spec, wear]) => { const t = this.toolFor(spec); const alt = spec.split('|').map((a) => ITEMS[a]?.name ?? a).join(' or '); return { spec, name: alt, wear, have: !!t, cond: t ? tick(t.s.cond ?? 1) : 0 }; });
    for (const t of tools) if (!t.have) missing.push(`a tool: ${t.name.toLowerCase()}`);
    const bench = this.benchFor(r, here);
    if (!bench) missing.push(`at a ${BENCHES[r.bench].name.toLowerCase()}`);
    if (known && r.effect && !this.effectTarget(r)) missing.push(r.effect[0] === 'mendgear' ? 'nothing you carry needs patching' : `nothing with a ${r.effect[1]} that is worn`);
    if (this.queue.length >= CRAFT_RULES.queueMax) missing.push('the queue is full');
    const hours = this.hoursFor(r), fee = bench?.fee ? tick(bench.fee * hours * CRAFT_RULES.townPerHour) : 0;
    if (fee > (this.g.cash ?? 0)) missing.push(`$${Math.ceil(fee)} for the bench (you have $${Math.floor(this.g.cash ?? 0)})`);
    return { ok: !missing.length, id, name: r.name, known, skill: tick(skill, 1), inputs, tools, bench: bench ? { id: bench.id, via: bench.via, standIn: !!bench.standIn, fee, owner: bench.owner } : null, hours: tick(hours), fee, q: this.qualityFor(r, bench), missing, why: missing[0] ?? '' };
  }
  hoursFor(r) { return r.hours * (1 - CRAFT_RULES.speed * Math.min(1, this.skillOf(r) / 100)); }
  // The condition a made durable comes out at: skill above the floor, a bench of its own kind, a worn tool takes a little.
  qualityFor(r, bench, toolCond = 1) {
    const f = Math.max(0, Math.min(1, (this.skillOf(r) - r.minSkill) / CRAFT_RULES.qSpan));
    let q = CRAFT_RULES.qMin + (1 - CRAFT_RULES.qMin) * f;
    if (bench && bench.id === r.bench && r.bench !== 'hand') q += CRAFT_RULES.qBench;
    q -= (1 - toolCond) * CRAFT_RULES.qTool;
    return tick(Math.max(0.05, Math.min(1, q)), 3);
  }
  effectTarget(r) {
    const [k, a] = r.effect;
    if (k === 'mendgear') return this.gearSlots().find(({ s }) => (s.cond ?? 1) < 0.99) ?? null;
    const sharp = k === 'sharpen';
    let best = null;
    for (const box of this.pool()) box.slots.forEach((s, i) => { const it = ITEMS[s.id]; if (!it || it.kind === 'gun' || !it.tags?.includes(a) || s.cond === undefined || s.cond >= 0.99 || (sharp && it.kind !== 'tool')) return; if (!best || s.cond < best.s.cond) best = { box, i, s }; });
    return best;
  }
  gearSlots() { const out = []; for (const box of this.pool()) box.slots.forEach((s, i) => { const k = ITEMS[s.id]?.kind; if ((k === 'armor' || k === 'gear' || k === 'pack') && s.cond !== undefined) out.push({ box, i, s }); }); return out; }
  mendGear(amount) {
    let n = 0;
    for (const { s } of this.gearSlots()) if (s.cond < 0.99) { s.cond = Math.min(1, s.cond + amount); n++; }
    if (n) this.g.inventory.changed();
    return n;
  }

  // ---- making ---------------------------------------------------------------------------------------------------
  // Queue a make: inputs are taken now, tools wear now, the job runs on the game clock. instant: pass the hours at once.
  make(id, { instant = false, pay = true } = {}) {
    const g = this.g, r = RECIPE_BY_ID[id], inv = g.inventory;
    const A = this.assess(id);
    if (!A.ok) { this.stats.refused++; return { ok: false, why: A.why, missing: A.missing }; }
    if (A.fee && pay) g.cash -= A.fee, this.stats.paid += A.fee;
    // Inputs consumed exactly; remembered so a cancel hands the very same things back.
    const took = [];
    for (const [item, n] of r.inputs) took.push([item, this.spendFrom(item, n)]);
    // Tools wear (a tool at 0 breaks and is gone).
    let toolCond = 1;
    for (const [spec, wear] of r.tools) {
      const t = this.toolFor(spec); if (!t) continue;
      toolCond = Math.min(toolCond, t.s.cond ?? 1);
      t.s.cond = tick((t.s.cond ?? 1) - wear, 4);
      if (t.s.cond <= 0.0001) { inv.take(t.box, t.box.slots.indexOf(t.s), 1); this.stats.wornOut++; g.hud?.toast?.(`YOUR ${ITEMS[t.s.id].name.toUpperCase()} BROKE`, 'warn'); g.emit?.('toolBroke', { item: t.s.id, recipe: id }); }
    }
    inv.changed();
    const job = { rid: id, need: this.hoursFor(r), done: 0, q: this.qualityFor(r, A.bench, toolCond), bench: r.bench, via: A.bench.via, took, fee: A.fee };
    this.queue.push(job);
    if (r.noise > 0) g.noise?.(g.player.x, g.player.z, r.noise, g.player);
    g.emit?.('craftStart', { recipe: id, hours: tick(job.need), q: job.q });
    this.dirty = true;
    if (instant) { this.skip(job); return this.sink.at(-1) ?? { ok: true, queued: id }; }
    return { ok: true, queued: id, hours: tick(job.need), q: job.q, position: this.queue.length };
  }
  // Run the clock for a job to the end (the agent's `instant`, the crew): time passes for real.
  skip(job = this.queue[0]) {
    if (!job) return;
    const g = this.g, left = Math.max(0, job.need - job.done);
    g.sky.time = (g.sky.time + left) % 24; // the same clock the workshop spends
    this.stats.hours += left; job.done = job.need;
    this.finish(job);
  }
  update() {
    const g = this.g, now = g.inventory.hours();
    if (this.lastT === null) this.lastT = now;
    const dh = Math.max(0, Math.min(2, now - this.lastT)); this.lastT = now;
    const job = this.queue[0];
    if (!job || !dh) return;
    const r = RECIPE_BY_ID[job.rid], here = this.benchesHere();
    if (!this.benchFor(r, here)) { job.paused = true; return; } // walked off the bench: the work waits
    job.paused = false;
    job.done += dh; this.stats.hours += dh; this.dirty = true;
    if (job.done >= job.need) this.finish(job);
  }
  finish(job) {
    const g = this.g, inv = g.inventory, r = RECIPE_BY_ID[job.rid];
    this.queue.splice(this.queue.indexOf(job), 1);
    const made = [];
    if (r.effect) {
      const [k, a, b] = r.effect;
      if (k === 'mendgear') { const n = this.mendGear(a); made.push(['patched', n]); }
      else { const t = this.effectTarget(r); if (t) { t.s.cond = Math.min(1, +(t.s.cond + b).toFixed(4)); made.push([k === 'sharpen' ? 'sharpened' : 'mended', ITEMS[t.s.id].name]); inv.changed(); } }
    }
    for (const [item, n] of r.outputs) {
      const it = ITEMS[item];
      inv.stow(item, n, it.dur ? { cond: job.q } : {});
      made.push([item, n]);
    }
    for (const [item, n] of r.byproducts) { inv.stow(item, n); made.push([item, n]); }
    g.deep?.gain?.(r.skill, r.xp * (1 + r.hours * CRAFT_RULES.xpHours), 'craft');
    this.stats.made++; this.stats.byRecipe[r.id] = (this.stats.byRecipe[r.id] ?? 0) + 1;
    const text = r.effect ? made.map(([a, b]) => `${a} ${b}`).join(' · ').toUpperCase() : r.outputs.map(([i, n]) => `${n > 1 ? `${n} ` : ''}${ITEMS[i].name}`).join(' + ').toUpperCase();
    g.hud?.toast?.(`MADE: ${text}`, 'job');
    g.emit?.('crafted', { recipe: r.id, q: job.q, outputs: r.outputs, byproducts: r.byproducts });
    this.sink.push({ ok: true, made: r.id, outputs: r.outputs, byproducts: r.byproducts, q: job.q, hours: tick(job.need), text });
    if (this.sink.length > 20) this.sink.shift();
    this.dirty = true;
    return this.sink.at(-1);
  }
  // Cancel the head or a queued job: the same inputs come back (nothing was made); the tool keeps its wear.
  cancel(index = 0) {
    const job = this.queue[index];
    if (!job) return { ok: false, why: 'nothing queued' };
    this.queue.splice(index, 1);
    for (const [item, n] of job.took) if (n) this.g.inventory.stow(item, n);
    if (job.fee) this.g.cash += job.fee;
    this.dirty = true;
    return { ok: true, refunded: job.took.filter(([, n]) => n), recipe: job.rid };
  }

  // ---- the crew's hands: a job row names a recipe and runs the same row (data/crewjobs.js `recipe`) ----------------------------
  // Crew bring their own hands and small tools: no bench or tool is demanded (a base's bench is the base itself), but a tool
  // you carry that fits still wears. Inputs come from the crew pool (your pack, then the trunk). mul = their skill's speed.
  crewRun(id, deliver) {
    const r = RECIPE_BY_ID[id];
    if (!r || r.effect) return { ok: false, why: 'no such recipe for a crew' };
    for (const [item, n] of r.inputs) if (this.have(item) < n) return { ok: false, why: `out of ${ITEMS[item]?.name.toLowerCase() ?? item}` };
    for (const [item, n] of r.inputs) this.spendFrom(item, n);
    for (const [spec, wear] of r.tools) { const t = this.toolFor(spec); if (t) { t.s.cond = tick((t.s.cond ?? 1) - wear, 4); if (t.s.cond <= 0.0001) { this.g.inventory.take(t.box, t.box.slots.indexOf(t.s), 1); this.stats.wornOut++; } } }
    const out = [];
    for (const [item, n] of [...r.outputs, ...r.byproducts]) out.push([item, deliver ? deliver(item, n) : this.g.inventory.stow(item, n)]);
    this.stats.made++; this.stats.byRecipe[id] = (this.stats.byRecipe[id] ?? 0) + 1;
    return { ok: true, outputs: out, text: r.outputs.map(([i, n]) => `${n} ${ITEMS[i].name.toLowerCase()}`).join(', ') };
  }

  // ---- the agent and the screen -------------------------------------------------------------------------------------------
  list({ group = null, known = null, can = null } = {}) {
    const here = this.benchesHere(), rows = [];
    for (const r of RECIPES) {
      if (group && r.group !== group) continue;
      const A = this.assess(r.id, here), k = this.knows(r.id);
      if (known !== null && known !== k) continue;
      if (can !== null && can !== A.ok) continue;
      rows.push({ id: r.id, name: r.name, group: r.group, known: k, can: A.ok, bench: r.bench, hours: A.hours, skill: r.skill, minSkill: r.minSkill, missing: A.missing, teaches: k ? '' : this.teaches(r.id), inputs: A.inputs, tools: A.tools, outputs: r.outputs, byproducts: r.byproducts, effect: r.effect ?? null, q: A.q, benchHere: !!A.bench });
    }
    return rows;
  }
  view() {
    const here = this.benchesHere();
    return { benches: Object.fromEntries(Object.entries(here).map(([k, v]) => [k, v.via + (v.fee ? ` $${v.fee}/h` : '')])), queue: this.queue.map((j) => ({ recipe: j.rid, done: tick(j.done), need: tick(j.need), q: j.q, paused: !!j.paused })), placed: this.placed.map((b) => ({ ...b })), learned: [...this.learned], stats: { ...this.stats, byRecipe: { ...this.stats.byRecipe } } };
  }
  matter(id) { return matterOf(RECIPE_BY_ID[id], ITEMS); }

  save() { return { learned: [...this.learned], placed: this.placed.map((b) => ({ ...b })), queue: this.queue.map((j) => ({ ...j, took: j.took.map((t) => [...t]) })), stats: { ...this.stats, byRecipe: { ...this.stats.byRecipe } }, seq: this.placeSeq ?? 0 }; }
  load(s) {
    for (const m of this.meshes.values()) m.parent?.remove(m);
    this.meshes.clear();
    this.learned = new Set((s?.learned ?? []).filter((id) => RECIPE_BY_ID[id]));
    this.placed = (s?.placed ?? []).filter((b) => BENCHES[b.bench]).map((b) => ({ ...b }));
    this.placeSeq = s?.seq ?? this.placed.length;
    for (const b of this.placed) this.mesh(b);
    this.queue = (s?.queue ?? []).filter((j) => RECIPE_BY_ID[j.rid]).map((j) => ({ ...j }));
    this.stats = { made: 0, byRecipe: {}, wornOut: 0, refused: 0, hours: 0, paid: 0, ...(s?.stats ?? {}) };
    this.lastT = null; this.dirty = true;
  }
}

export { GROUPS };
