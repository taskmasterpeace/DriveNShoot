import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { SKILLS as DEEP } from '../data/stats.js';
import { CROPS, GARDEN, COOP, FROST, CLIMATE, CLIMATE_DEFAULT, HEAT, STAGE_AT, calendar, validateFarming } from '../data/farming.js';

// THE HOUSE GARDEN (docs/design/WEB_FARMING.md; rows in data/farming.js). g.farming.
//   plots    beds dug in the yard of a place you hold (homes.js baseAt): sown from a real seed packet, watered from a real
//            bucket (or a rain catcher beside them), fed with compost, grown on the GAME clock by crop row, hurt by
//            drought, frost, blight and pests, fenced against the pests, harvested into your pack
//   coops    a coop of hens in the yard: fed and watered by someone, laying a few eggs a day, taken by foxes in the night
//   crew     the crew's FARM job (crewTend): waters and harvests the base's beds from the real stock
//   market   a consignment to a trader's shelf carried by your crew (the only way garden produce reaches a shelf)
// Nothing here makes stock: a harvest is the seed that went in, the water that was carried and the days that passed.
// The truth lives here in plain records; the world only DRAWS them (one instanced mesh).
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hashS = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rngOf = (s) => { let a = hashS(String(s)) || 1; return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; }; };
const MAX_INST = 1500;
const _o = new THREE.Object3D(), _c = new THREE.Color();
const PLOT_SEP = 3.4, COOP_CLEAR = 6.2; // m between bed centres; a coop's centre and any bed or other coop (the house and its run)

// What a sown seed, a harvest and an egg teach (the deep sheet's farming row was check-only until now).
DEEP.farming.xp = { cropSown: 1.2, cropHarvested: 5, coopEgg: 0.6 };

export class Farming {
  constructor(game) {
    const g = (this.g = game);
    game.farming = this;
    this.plots = [];        // beds
    this.coops = [];        // { id, x, z, face, bk, secure, hens: [{ id, sex, age, unfed }], eggs: [{ at }], feed, water, last }
    this.consign = [];      // { id, trader, name, items: [{ id, n, made }], leaveAt, arriveAt, by }
    this.thieves = [];      // { c, items: [{ id, n }] } what a thief carries until he is killed
    this.log = [];          // the garden's own book: frosts, blight, raids, theft
    this.job = null;        // { label, t, need, x, z, done }
    this.seq = 0; this.last = null; this.skew = 0; this.slowT = 0; this.drawT = 0; this.panelOpen = false;
    this.stats = { tilled: 0, sown: 0, watered: 0, harvested: 0, produce: 0, seedsSaved: 0, frosted: 0, blighted: 0, pestLoss: 0, grazed: 0, trampled: 0, stolen: 0, withered: 0, eggs: 0, henLost: 0, consigned: 0, delivered: 0, cooked: 0 };
    if (game.scene) {
      this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }), MAX_INST);
      this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false; this.mesh.castShadow = true;
      this.mesh.setColorAt(0, _c.set('#000000'));
      game.scene.add(this.mesh);
    }
  }
  // The garden's clock is the world's (plus `skew`, the hours the age() test hook has let it run ahead). Things that go into your pack are stamped with the WORLD's hour.
  worldHours() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }
  hours() { return this.worldHours() + this.skew; }
  inv() { return this.g.inventory; }
  cal() { return calendar(this.g); }
  farmLv() { return clamp((this.g.deep?.skill?.farming ?? 0) / 10, 0, 10); }
  biome(x, z) { return this.g.fauna?.biomeAt?.(x, z) ?? 'p'; }
  region(x, z) { return this.g.fauna?.regionAt?.(x, z) ?? 'west'; }
  clim(x, z) { return CLIMATE[this.biome(x, z)] ?? CLIMATE_DEFAULT; }
  note(text, extra = {}) { this.log.push({ day: this.g.society?.day ?? 0, text, ...extra }); if (this.log.length > 40) this.log.shift(); }
  count(id) { return this.inv()?.carried.count(id) ?? 0; }

  // ---- the work clock (the timed-actions lane's clock replaces this when it lands) --------------------------------------
  startJob(label, secs, done, opt = null) {
    const P = this.g.player;
    if (opt?.instant) return done(); // the PACK screen's use: the item's own use() already counted it, no timed work
    if (this.job) return { ok: false, why: `busy: ${this.job.label}` };
    if (P.inVehicle) return { ok: false, why: 'not from the car' };
    this.job = { label, t: 0, need: secs, x: P.x, z: P.z, done };
    this.g.emit('gardenJob', { label, secs });
    return { ok: true, text: `${label.toUpperCase()} · ${secs} S`, secs };
  }
  jobStep(dt) {
    const J = this.job, P = this.g.player;
    if (Math.hypot(P.x - J.x, P.z - J.z) > 2.5 || P.inVehicle || !P.alive) { this.job = null; this.g.hud?.toast?.(`STOPPED · ${J.label.toUpperCase()}`, 'warn'); this.g.emit('gardenJobStopped', { label: J.label }); return; }
    J.t += dt;
    if (J.t >= J.need) { this.job = null; this.lastJob = J.done(); }
  }

  // ---- where a bed may go ----------------------------------------------------------------------------------------------
  yardOf(x, z) { const b = this.g.homes?.baseAt?.(x, z, GARDEN.yardPad); return b && b.state === 'held' ? b : null; }
  siteOk(x, z, ignore = null) {
    const g = this.g;
    const b = this.yardOf(x, z);
    if (!b) return { ok: false, why: 'dig in the yard of a place you hold (claim, rent or buy a house first)' };
    if (g.citygen?.buildingAt?.(x, z)) return { ok: false, why: 'that is a floor, not a yard' };
    if ((g.water?.depthAt?.(x, z) ?? 0) > 0) return { ok: false, why: 'too wet to dig' };
    if (g.statics?.blocked?.(x, z)) return { ok: false, why: 'something solid is in the way' };
    if ((g.homes?.roadDist?.(x, z) ?? 99) < 3) return { ok: false, why: 'not on the road' };
    for (const p of this.plots) if (p !== ignore && Math.hypot(p.x - x, p.z - z) < PLOT_SEP) return { ok: false, why: 'too close to another bed' };
    for (const c of this.coops) if (c !== ignore && Math.hypot(c.x - x, c.z - z) < COOP_CLEAR) return { ok: false, why: 'too close to the coop (its run needs room)' };
    return { ok: true, base: b };
  }
  plotsOf(b) { return this.plots.filter((p) => p.bk === (b?.id ?? b)); }
  plotNear(x, z, r = GARDEN.reach + 1.2) { let best = null, bd = r; for (const p of this.plots) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } } return best; }
  coopNear(x, z, r = COOP.reach + 1) { let best = null, bd = r; for (const c of this.coops) { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } } return best; }

  // ---- digging, sowing, watering, tending --------------------------------------------------------------------------------
  toolOf() { const C = this.inv().carried; return C.count('hoe') ? 'hoe' : C.count('shovel') ? 'shovel' : null; }
  till(x, z) {
    const P = this.g.player;
    x ??= P.x + Math.sin(P.face) * 1.9; z ??= P.z + Math.cos(P.face) * 1.9;
    const tool = this.toolOf();
    if (!tool) return { ok: false, why: 'you need a hoe or a shovel' };
    const ok = this.siteOk(x, z); if (!ok.ok) return ok;
    if (this.plotsOf(ok.base).length >= GARDEN.maxPlots) return { ok: false, why: `${GARDEN.maxPlots} beds is all one household keeps` };
    const secs = GARDEN.tillSecs * GARDEN.toolSkillTime[tool] * Math.max(0.6, 1 - this.farmLv() * 0.03);
    return this.startJob('digging a bed', r1(secs), () => {
      const again = this.siteOk(x, z); if (!again.ok) return again;
      const bio = this.biome(x, z), fert = GARDEN.fertStart[bio] ?? GARDEN.fertStart.default;
      const p = { id: `G${++this.seq}`, x: r1(x), z: r1(z), face: P.face, bk: again.base.id, owner: 'player', crop: null, state: 'bare', sownAt: 0, progress: 0, water: 0.15, fert, health: 1, blight: false, fenced: false, scarecrow: false, loss: 0, last: null, restUntil: 0, why: null, ripeAt: null, dryH: 0 };
      this.plots.push(p); this.stats.tilled++;
      this.g.emit('gardenTilled', { id: p.id, x: p.x, z: p.z, fert: r2(fert), tool });
      this.g.hud?.toast?.(`A BED DUG · ${Math.round(fert * 100)}% RICH SOIL`, 'job');
      return { ok: true, id: p.id, fert, text: 'BED DUG' };
    });
  }
  seedFor(crop) { return CROPS[crop]?.seed; }
  // The seed packets in your pack, best fit for the month first.
  seedsCarried() {
    const m = this.cal().month, out = [];
    for (const [id, c] of Object.entries(CROPS)) { const n = this.count(c.seed); if (n) out.push({ crop: id, seed: c.seed, n, fits: c.plant.includes(m), best: c.best.includes(m) }); }
    return out.sort((a, b) => (b.best - a.best) || (b.fits - a.fits));
  }
  sow(p, crop, opt = null) {
    const g = this.g, inv = this.inv();
    if (!p) return { ok: false, why: 'no bed within reach' };
    const c = CROPS[crop]; if (!c) return { ok: false, why: `unknown crop ${crop} (${Object.keys(CROPS).join(', ')})` };
    if (p.state !== 'bare') return { ok: false, why: `the bed already holds ${p.crop ? CROPS[p.crop].name.toLowerCase() : 'dead plants'}: clear it first` };
    if (c.region && this.region(p.x, p.z) !== c.region) return { ok: false, why: `${c.name.toLowerCase()} only grows in ${c.region}` };
    if (this.hours() < p.restUntil) return { ok: false, why: 'the bed is resting after the blight: give it a day or two' };
    if (!opt?.free && !this.count(c.seed)) return { ok: false, why: `you have no ${ITEMS[c.seed].name.toLowerCase()}` };
    const m = this.cal().month, off = !c.plant.includes(m);
    return this.startJob('sowing', GARDEN.sowSecs, () => {
      if (!opt?.free) { if (!inv.carried.count(c.seed)) return { ok: false, why: 'the seed is gone' }; inv.take(inv.carried, inv.carried.slots.findIndex((s) => s.id === c.seed), 1); inv.changed(); }
      Object.assign(p, { crop, state: 'growing', sownAt: this.hours(), progress: 0, health: 1, blight: false, loss: 0, why: null, ripeAt: null, dryH: 0 });
      this.stats.sown++;
      g.emit('cropSown', { id: p.id, crop, month: m, off });
      g.hud?.toast?.(`SOWN · ${c.name.toUpperCase()}${off ? ' · OFF SEASON, SLOW AND RISKY' : ''}`, off ? 'warn' : 'job');
      return { ok: true, id: p.id, crop, off, text: 'SOWN', month: m };
    }, opt);
  }
  // A bucket (or a water can) in the pack with water left in it.
  waterSource() { const C = this.inv().carried; for (const tag of ['bucket', 'water_can']) { const i = C.slots.findIndex((s) => s.id === tag && s.left > 0); if (i >= 0) return { i, s: C.slots[i] }; } return null; }
  catcherBy(p, r = GARDEN.catcherReach) { return (this.g.outdoors?.camp ?? []).find((o) => o.kind === 'catcher' && Math.hypot(o.x - p.x, o.z - p.z) < r && o.water >= 1) ?? null; }
  water(p, litres = null, opt = null) {
    if (!p) return { ok: false, why: 'no bed within reach' };
    if (p.water >= 0.95) return { ok: false, why: 'the bed is wet through' };
    const want = Math.ceil((1 - p.water) / GARDEN.litrePerWater - 1e-6);
    const src = this.waterSource(), cat = !src && this.catcherBy(p, GARDEN.reach + 2);
    if (opt?.free) { const L = litres ?? 1; p.water = clamp(p.water + L * GARDEN.litrePerWater, 0, 1); this.stats.watered++; this.g.emit('gardenWatered', { id: p.id, litres: L, water: r2(p.water) }); return { ok: true, litres: L, water: r2(p.water), text: `${L} L POURED` }; }
    if (!src && !cat) return { ok: false, why: 'you have no water to pour: fill a bucket at a well, a river or a rain catcher' };
    return this.startJob('watering', GARDEN.waterSecs, () => {
      const s = this.waterSource(), C = this.inv().carried;
      let L = Math.min(litres ?? want, want);
      if (s) { L = Math.min(L, s.s.left); s.s.left -= L; }
      else { const o = this.catcherBy(p, GARDEN.reach + 2); if (!o) return { ok: false, why: 'the catcher ran dry' }; L = Math.min(L, Math.floor(o.water)); o.water -= L; }
      if (!(L > 0)) return { ok: false, why: 'nothing to pour' };
      p.water = clamp(p.water + L * GARDEN.litrePerWater, 0, 1); this.inv().changed(); this.stats.watered++;
      this.g.emit('gardenWatered', { id: p.id, litres: L, water: r2(p.water) });
      return { ok: true, litres: L, water: r2(p.water), text: `${L} L POURED` };
    });
  }
  fertilise(p, opt = null) {
    if (!p) return { ok: false, why: 'no bed within reach' };
    if (p.fert >= GARDEN.fertMax - 0.02) return { ok: false, why: 'the soil is as rich as it gets' };
    if (!opt?.free && !this.count('compost')) return { ok: false, why: 'you have no compost (compost: rotten food and wilted plants)' };
    const inv = this.inv(); if (!opt?.free) { inv.take(inv.carried, inv.carried.slots.findIndex((s) => s.id === 'compost'), 1); inv.changed(); }
    p.fert = Math.min(GARDEN.fertMax, p.fert + GARDEN.fertCompost);
    this.g.emit('gardenFertilised', { id: p.id, fert: r2(p.fert) });
    return { ok: true, fert: r2(p.fert), text: `SOIL ${Math.round(p.fert * 100)}% RICH` };
  }
  // Make compost from food that has rotted in your pack: three rotten portions, one compost.
  compost() {
    const inv = this.inv(), C = inv.carried;
    let have = 0; for (const s of C.slots) if (ITEMS[s.id]?.kind === 'food' && inv.freshness(s) === 'rotten') have += s.n;
    const bins = Math.floor(have / 3); if (!bins) return { ok: false, why: 'you have no rotten food to rot down (three portions make one compost)' };
    let need = bins * 3;
    for (let i = C.slots.length - 1; i >= 0 && need > 0; i--) { const s = C.slots[i]; if (ITEMS[s.id]?.kind === 'food' && inv.freshness(s) === 'rotten') { const t = Math.min(need, s.n); inv.take(C, i, t); need -= t; } }
    const got = inv.add(C, 'compost', bins); inv.changed();
    return { ok: true, compost: got, text: `${got} COMPOST` };
  }
  // Pull a dead, blighted or spent crop (blight: burn it; the bed rests).
  clear(p) {
    if (!p) return { ok: false, why: 'no bed within reach' };
    if (p.state === 'bare') return { ok: false, why: 'the bed is bare' };
    return this.startJob('clearing the bed', GARDEN.clearSecs, () => {
      const sick = p.blight, crop = p.crop;
      Object.assign(p, { last: crop, crop: null, state: 'bare', progress: 0, blight: false, loss: 0, why: null, ripeAt: null, restUntil: sick ? this.hours() + 48 : 0 });
      this.g.emit('gardenCleared', { id: p.id, sick });
      return { ok: true, id: p.id, text: sick ? 'PULLED AND BURNED · THE BED RESTS' : 'BED CLEARED' };
    });
  }
  fence(p) {
    if (!p) return { ok: false, why: 'no bed within reach' };
    if (p.fenced) return { ok: false, why: 'it is fenced already' };
    for (const [id, n] of GARDEN.fence.cost) if (this.count(id) < n) return { ok: false, why: `a fence takes ${n} ${ITEMS[id].name.toLowerCase()} (you have ${this.count(id)})` };
    return this.startJob('fencing the bed', GARDEN.fenceSecs, () => {
      for (const [id, n] of GARDEN.fence.cost) { const inv = this.inv(); let k = n; while (k-- > 0) inv.take(inv.carried, inv.carried.slots.findIndex((s) => s.id === id), 1); }
      this.inv().changed(); p.fenced = true; this.g.emit('gardenFenced', { id: p.id });
      return { ok: true, text: 'FENCED' };
    });
  }
  scarecrow(p) {
    if (!p) return { ok: false, why: 'no bed within reach' };
    if (p.scarecrow) return { ok: false, why: 'it has one' };
    for (const [id, n] of GARDEN.scarecrow.cost) if (this.count(id) < n) return { ok: false, why: `a scarecrow takes ${n} ${ITEMS[id].name.toLowerCase()} (you have ${this.count(id)})` };
    return this.startJob('standing a scarecrow', GARDEN.fenceSecs * 0.6, () => {
      for (const [id, n] of GARDEN.scarecrow.cost) { const inv = this.inv(); let k = n; while (k-- > 0) inv.take(inv.carried, inv.carried.slots.findIndex((s) => s.id === id), 1); }
      this.inv().changed(); p.scarecrow = true; this.g.emit('gardenScarecrow', { id: p.id });
      return { ok: true, text: 'SCARECROW UP' };
    });
  }

  // ---- growth ------------------------------------------------------------------------------------------------------------
  stageOf(p) {
    if (p.state === 'bare') return 'bare';
    if (p.state === 'wilted') return 'wilted';
    if (p.progress >= STAGE_AT.ripe) return 'ripe';
    return p.progress >= STAGE_AT.mid ? 'mid' : p.progress >= STAGE_AT.sprout ? 'sprout' : 'seed';
  }
  monthRate(c, m) {
    if (c.best.includes(m)) return GARDEN.bestRate;
    if (c.plant.includes(m)) return GARDEN.plantRate;
    return c.plant.some((q) => Math.abs(q - m) === 1 || Math.abs(q - m) === 11) ? GARDEN.shoulderRate : GARDEN.offSeasonRate;
  }
  // The pace a bed grows at right now (1 = the crop row's days).
  rate(p, m = this.cal().month) {
    const c = CROPS[p.crop]; if (!c || p.state !== 'growing') return 0;
    const wet = clamp((p.water - GARDEN.growNeedWet) / (GARDEN.growWetFull - GARDEN.growNeedWet), 0, 1);
    return this.monthRate(c, m) * wet * (0.6 + 0.4 * p.fert) * (0.5 + 0.5 * p.health);
  }
  wilt(p, why) {
    if (p.state === 'wilted' || p.state === 'bare') return;
    p.state = 'wilted'; p.why = why;
    if (why === 'dry' || why === 'frost' || why === 'blight' || why === 'rot') this.stats.withered++;
    this.g.emit('cropWilted', { id: p.id, crop: p.crop, why });
    this.note(`${CROPS[p.crop]?.name ?? 'a crop'} died: ${why}`, { id: p.id });
  }
  stepHours(h, t1, live, cal) {
    const g = this.g;
    const mHeat = HEAT[cal.month] ?? 1;
    for (const p of this.plots) {
      const c = CROPS[p.crop], cl = this.clim(p.x, p.z);
      if (!c || p.state === 'bare') { p.fert = Math.min(GARDEN.fertMax, p.fert + (GARDEN.fertDay / 24) * h); p.water = Math.max(0, p.water - GARDEN.evapPerHour * mHeat * cl.evap * 0.5 * h); continue; }
      // water: evaporation, live rain, a catcher beside it
      p.water = Math.max(0, p.water - GARDEN.evapPerHour * mHeat * cl.evap * c.thirst * h);
      if (live) { const rain = Math.min(1.6, g.sky?.cur?.rain ?? 0); if (rain > 0.05) p.water = Math.min(1, p.water + rain * 0.06 * h); }
      if (p.water < 0.5 && p.state !== 'wilted') { const o = this.catcherBy(p); if (o) { const L = Math.min(o.water, GARDEN.catcherTrickle * h, (0.6 - p.water) / GARDEN.litrePerWater); if (L > 0) { o.water -= L; p.water += L * GARDEN.litrePerWater; } } }
      if (p.state === 'wilted') continue;
      if (p.water < GARDEN.dryBelow) { p.health -= GARDEN.dryDmgPerHour * c.thirst * h; p.dryH += h; }
      if (p.blight) p.health -= GARDEN.blight.dmgPerHour * h;
      if (p.state === 'growing') {
        p.progress += (h / (c.days * 24)) * this.rate(p, cal.month);
        if (p.progress >= 1) { p.progress = 1; p.state = 'ripe'; p.ripeAt = t1; g.emit('cropRipe', { id: p.id, crop: p.crop }); }
      } else if (p.state === 'ripe' && p.ripeAt !== null && (t1 - p.ripeAt) / 24 > c.hold) this.wilt(p, 'rot');
      if (p.health <= GARDEN.healthFloor) this.wilt(p, p.blight ? 'blight' : p.dryH > 12 ? 'dry' : 'sickness');
    }
    for (const co of this.coops) co.water = Math.max(0, co.water);
  }
  // Once a game day, per bed: rain off the clock, frost, blight, pests (each its own seeded roll, so a save replays the same weather).
  dayPass(day, cal) {
    const g = this.g;
    for (const p of this.plots) {
      const c = CROPS[p.crop], cl = this.clim(p.x, p.z);
      const R = (tag) => rngOf(`${p.id}:${day}:${tag}`)();
      const rained = R('rain') < cl.rain;
      if (rained && p.state !== 'bare') p.water = Math.min(1, p.water + GARDEN.rainWater * (this.covered(p) ? 0 : 1));
      if (!c || p.state === 'bare' || p.state === 'wilted') continue;
      const frostP = this.frostOdds(p, cal.month);
      if (frostP > 0 && R('frost') < frostP) { this.stats.frosted++; this.wilt(p, 'frost'); continue; }
      const B = GARDEN.blight;
      let bp = B.perDay * (cl.blight ?? 1) * (rained ? B.wetMul : 1) * (p.last === p.crop ? B.repeatMul : 1);
      if (this.plots.some((q) => q !== p && q.blight && Math.hypot(q.x - p.x, q.z - p.z) < B.spreadR)) bp += B.spreadP;
      if (!p.blight && R('blight') < bp) { p.blight = true; this.stats.blighted++; this.note(`blight in the ${c.name.toLowerCase()}`, { id: p.id }); g.emit('cropBlight', { id: p.id, crop: p.crop }); }
      const pp = this.pestOdds(p);
      if (R('pest') < pp) this.pestHit(p, 'pests');
    }
  }
  covered(p) { return false; }
  frostOdds(p, m = this.cal().month) { const c = CROPS[p.crop]; return c ? (FROST[m] ?? 0) * this.clim(p.x, p.z).frost * (1 - c.hardy) : 0; }
  // Test/agent hook: let N garden days pass at once (the garden's own clock only; the world's day does not move).
  age(days) { this.last ??= this.hours(); this.skew += Math.min(GARDEN.catchUpMaxDays, Math.max(0, days)) * 24; this.clock(); }
  pestOdds(p) {
    const cl = this.clim(p.x, p.z), P = GARDEN.pest;
    return P.perDay * cl.pest * (p.fenced ? P.fence : 1) * (p.scarecrow || this.scarecrowNear(p) ? P.scarecrow : 1);
  }
  scarecrowNear(p) { return this.plots.some((q) => q !== p && q.scarecrow && Math.hypot(q.x - p.x, q.z - p.z) < GARDEN.scarecrowR); }
  pestHit(p, who) {
    const P = GARDEN.pest;
    if (p.state === 'ripe') p.loss = Math.min(0.8, p.loss + P.ripeLoss); else p.health -= P.dmg;
    this.stats.pestLoss++;
    this.g.emit('cropPests', { id: p.id, crop: p.crop, who, loss: r2(p.loss), health: r2(p.health) });
    this.note(`${who} in the ${CROPS[p.crop]?.name.toLowerCase()}${p.fenced ? ' (over the fence)' : ''}`, { id: p.id });
    if (p.health <= GARDEN.healthFloor) this.wilt(p, 'pests');
  }
  clock() {
    const now = this.hours();
    if (this.last === null) { this.last = now; return; }
    let d = now - this.last;
    if (d < 0) { this.last = now; return; } // set back: nothing grows backwards
    if (d < 0.05) return;
    const clamped = Math.min(d, GARDEN.catchUpMaxDays * 24), live = d <= 1.5, cal = this.cal();
    let t = now - clamped;
    while (t < now - 1e-9) {
      const h = Math.min(1, now - t), t1 = t + h;
      this.stepHours(h, t1, live, cal);
      this.henHours(h);
      if (Math.floor(t1 / 24 + 1e-9) > Math.floor(t / 24 + 1e-9)) { const day = Math.floor(t1 / 24 + 1e-9); this.dayPass(day, cal); this.henDay(day); }
      t = t1;
    }
    this.last = now;
  }

  // ---- harvest -----------------------------------------------------------------------------------------------------------
  expected(p) {
    const c = CROPS[p.crop]; if (!c) return 0;
    const avg = (c.yield[0] + c.yield[1]) / 2;
    const n = avg * (0.7 + 0.5 * p.fert) * clamp(p.health, 0.2, 1) * (1 - p.loss) * (1 + GARDEN.yieldSkill * this.farmLv());
    return Math.max(p.state === 'ripe' ? 1 : 0, Math.round(n));
  }
  harvest(p) {
    const g = this.g, inv = this.inv();
    if (!p) return { ok: false, why: 'no bed within reach' };
    if (p.state !== 'ripe') return { ok: false, why: p.state === 'growing' ? `not ripe: ${Math.round(p.progress * 100)}%` : p.state === 'wilted' ? 'nothing to pick: pull the dead plants' : 'the bed is bare' };
    const c0 = CROPS[p.crop];
    if (inv.room(inv.carried) < ITEMS[c0.item].bulk * this.expected(p)) return { ok: false, why: 'your pack is too full for the harvest: make room' };
    return this.startJob('picking', GARDEN.harvestSecs, () => {
      const c = CROPS[p.crop], n = this.expected(p);
      const got = inv.add(inv.carried, c.item, n, { made: this.worldHours() });
      const rng = rngOf(`${p.id}:${p.sownAt}:seeds`), sd = c.seeds[0] + Math.floor(rng() * (c.seeds[1] - c.seeds[0] + 1)) + (this.farmLv() >= 5 ? 1 : 0);
      const saved = sd > 0 ? inv.add(inv.carried, c.seed, sd) : 0; inv.changed();
      this.stats.harvested++; this.stats.produce += got; this.stats.seedsSaved += saved;
      const owned = p.owner === 'player';
      if (!owned) g.society?.deeds?.record?.('steal', { x: p.x, z: p.z, m: 2, label: `${p.owner}'s garden`, tf: p.ownerFaction ?? '', stars: 0 });
      p.fert = Math.max(0, p.fert - c.drain);
      p.last = p.crop;
      if (c.perennial) { p.state = 'growing'; p.progress = c.perennial; p.ripeAt = null; p.loss = 0; } else { p.crop = null; p.state = 'bare'; p.progress = 0; p.loss = 0; p.ripeAt = null; }
      g.emit('cropHarvested', { id: p.id, crop: p.last, item: c.item, n: got, seeds: saved, stolen: !owned });
      g.hud?.toast?.(`PICKED · ${got} ${ITEMS[c.item].name.toUpperCase()}${saved ? ` · ${saved} SEED SAVED` : ''}`, 'job');
      return { ok: true, id: p.id, item: c.item, n: got, seeds: saved, text: `${got} ${ITEMS[c.item].name.toUpperCase()}` };
    });
  }

  // ---- the infected, the thieves, the deer ------------------------------------------------------------------------------
  livePass() {
    const g = this.g;
    if (!this.plots.length) return;
    const P = g.player;
    for (const p of this.plots) {
      if (!p.crop || p.state === 'bare' || p.state === 'wilted') continue;
      for (const c of g.chars) {
        if (!c.alive || c === P || c.downedT > 0) continue;
        if (Math.abs(c.x - p.x) > 3.5 || Math.abs(c.z - p.z) > 3.5) continue;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (c.faction === 'zombie') { if (d < GARDEN.tramplesR) { this.stats.trampled++; this.wilt(p, 'trampled'); g.emit('cropTrampled', { id: p.id }); } continue; }
        if (p.state !== 'ripe' || d > GARDEN.theftR || c.crew || c.ally || !g.ai?.hostile?.(c, P)) continue;
        if (p.fenced && c.faction !== 'raider') continue; // a fence turns back a hungry stranger, not a raider
        this.steal(p, c);
      }
      // the deer and the birds: live prey grazes an open bed in front of you
      if (!p.fenced && !p.scarecrow && !this.scarecrowNear(p)) for (const a of g.fauna?.live ?? []) {
        if (a.dead || a.S?.temper !== 'prey') continue;
        if (Math.abs(a.x - p.x) > GARDEN.pest.grazeR || Math.abs(a.z - p.z) > GARDEN.pest.grazeR) continue;
        if (Math.random() < 0.3) { p.health -= GARDEN.pest.grazeDmg; this.stats.grazed++; g.emit('cropGrazed', { id: p.id, who: a.S.name }); if (p.health <= GARDEN.healthFloor) this.wilt(p, 'pests'); }
      }
    }
    // a thief killed on the road gives back what he carried (the real item moved from the bed to him, and onto his body)
    for (let i = this.thieves.length - 1; i >= 0; i--) {
      const T = this.thieves[i];
      if (T.c.alive && g.chars.includes(T.c)) continue;
      const box = this.inv().boxes.get(`body:${T.c.id}`);
      if (box) { for (const it of T.items) this.inv().add(box, it.id, it.n, it); this.thieves.splice(i, 1); } else if (!g.chars.includes(T.c)) this.thieves.splice(i, 1);
    }
  }
  steal(p, c) {
    const g = this.g, crop = CROPS[p.crop], n = Math.min(this.expected(p), 12);
    const owner = p.owner === 'player' ? 'your' : `${p.owner}'s`;
    let T = this.thieves.find((q) => q.c === c); if (!T) this.thieves.push((T = { c, items: [] }));
    T.items.push({ id: crop.item, n, made: this.worldHours() });
    this.stats.stolen += n;
    g.society?.deeds?.record?.('steal', { actor: c, x: p.x, z: p.z, m: 2, label: `${owner} garden`, tf: p.owner === 'player' ? 'player' : '', src: 'world' });
    Object.assign(p, { last: p.crop, crop: null, state: 'bare', progress: 0, loss: 0, ripeAt: null });
    g.emit('cropStolen', { id: p.id, by: c.id, item: crop.item, n, name: c.name ?? c.id });
    this.note(`${c.name ?? 'someone'} stole ${n} ${ITEMS[crop.item].name.toLowerCase()}`, { id: p.id, by: c.id });
    if (Math.hypot(c.x - g.player.x, c.z - g.player.z) < 60) g.hud?.toast?.(`SOMEONE IS IN YOUR GARDEN · ${String(c.name ?? 'A STRANGER').toUpperCase()}`, 'hot');
    return { ok: true, n };
  }

  // ---- the hens -----------------------------------------------------------------------------------------------------------
  buildCoop(x, z) {
    const g = this.g, P = g.player;
    x ??= P.x + Math.sin(P.face) * 2.4; z ??= P.z + Math.cos(P.face) * 2.4;
    const ok = this.siteOk(x, z); if (!ok.ok) return ok;
    if (this.plots.some((p) => Math.hypot(p.x - x, p.z - z) < COOP_CLEAR)) return { ok: false, why: 'too close to a bed (the coop run needs room)' };
    if (this.coops.length >= 2) return { ok: false, why: 'two coops is a farm; you have a yard' };
    for (const [id, n] of COOP.cost) if (this.count(id) < n) return { ok: false, why: `a coop takes ${n} ${ITEMS[id].name.toLowerCase()} (you have ${this.count(id)})` };
    return this.startJob('building a coop', COOP.secs, () => {
      for (const [id, n] of COOP.cost) { const inv = this.inv(); let k = n; while (k-- > 0) inv.take(inv.carried, inv.carried.slots.findIndex((s) => s.id === id), 1); }
      this.inv().changed();
      const co = { id: `C${++this.seq}`, x: r1(x), z: r1(z), face: P.face, bk: ok.base.id, secure: false, hens: [], eggs: [], feed: 0, water: 0, lastDay: null, nid: 0 };
      this.coops.push(co); g.emit('coopBuilt', { id: co.id });
      return { ok: true, id: co.id, text: 'COOP BUILT' };
    });
  }
  secureCoop(co) {
    if (!co) return { ok: false, why: 'no coop within reach' };
    if (co.secure) return { ok: false, why: 'it has its latch and wire already' };
    for (const [id, n] of COOP.secure) if (this.count(id) < n) return { ok: false, why: `a latch and wire take ${n} ${ITEMS[id].name.toLowerCase()}` };
    return this.startJob('wiring the coop', COOP.secureSecs, () => { for (const [id, n] of COOP.secure) { const inv = this.inv(); let k = n; while (k-- > 0) inv.take(inv.carried, inv.carried.slots.findIndex((s) => s.id === id), 1); } this.inv().changed(); co.secure = true; return { ok: true, text: 'LATCHED AND WIRED' }; });
  }
  stock(co, sex = 'hen', opt = null) {
    if (!co) return { ok: false, why: 'no coop within reach' };
    if (co.hens.length >= COOP.slots) return { ok: false, why: `the coop holds ${COOP.slots}` };
    const item = sex === 'rooster' ? 'rooster' : 'hen', inv = this.inv();
    if (!opt?.free && !this.count(item)) return { ok: false, why: `you have no ${item} to put in` };
    if (sex === 'rooster' && co.hens.some((h) => h.sex === 'rooster')) return { ok: false, why: 'one rooster is plenty' };
    if (!opt?.free) { inv.take(inv.carried, inv.carried.slots.findIndex((s) => s.id === item), 1); inv.changed(); }
    co.hens.push({ id: `${co.id}h${++co.nid}`, sex, age: 30, unfed: 0 });
    return { ok: true, hens: co.hens.length, text: `A ${item.toUpperCase()} IN THE COOP` };
  }
  feedCoop(co, opt = null) {
    if (!co) return { ok: false, why: 'no coop within reach' };
    const inv = this.inv(), C = inv.carried; let moved = 0, watered = 0;
    if (opt?.free) { if (co.feed + 1 > 6.01) return { ok: false, why: 'the trough is full' }; co.feed += 1; return { ok: true, feed: r1(co.feed), water: r1(co.water), text: `FED · TROUGH ${r1(co.feed)}` }; }
    for (const [id, u] of Object.entries(COOP.feedItems)) {
      while (co.feed + u <= 6.01 && C.count(id)) { inv.take(C, C.slots.findIndex((s) => s.id === id), 1); co.feed += u; moved++; if (id !== 'chicken_feed') break; }
    }
    const src = this.waterSource();
    if (src && co.water < 3) { const L = Math.min(src.s.left, Math.ceil(3 - co.water)); src.s.left -= L; co.water += L; watered = L; }
    inv.changed();
    if (!moved && !watered) return { ok: false, why: co.feed >= 6 ? 'the trough is full' : 'you carry no feed (chicken feed or corn) or water for the hens' };
    return { ok: true, feed: r1(co.feed), water: r1(co.water), text: `FED · TROUGH ${r1(co.feed)} · ${r1(co.water)} L` };
  }
  collectEggs(co) {
    if (!co) return { ok: false, why: 'no coop within reach' };
    if (!co.eggs.length) return { ok: false, why: 'no eggs today' };
    const inv = this.inv(); let n = 0;
    while (co.eggs.length) { const e = co.eggs[0]; if (!inv.add(inv.carried, 'egg', 1, { made: e.at })) break; co.eggs.shift(); n++; }
    inv.changed(); this.g.emit('eggsCollected', { coop: co.id, n });
    return n ? { ok: true, n, text: `${n} EGGS` } : { ok: false, why: 'no room in your pack' };
  }
  slaughter(co, sex = null) {
    if (!co) return { ok: false, why: 'no coop within reach' };
    const i = co.hens.findIndex((h) => (sex ? h.sex === sex : h.sex === 'hen' && h.age >= 20)) >= 0 ? co.hens.findIndex((h) => (sex ? h.sex === sex : h.sex === 'hen' && h.age >= 20)) : co.hens.findIndex((h) => !sex || h.sex === sex);
    if (i < 0) return { ok: false, why: 'nothing to kill' };
    const h = co.hens.splice(i, 1)[0], inv = this.inv(), out = [];
    for (const [id, a, b] of COOP.meat[h.sex]) { const n = a + Math.floor(Math.random() * (b - a + 1)); inv.add(inv.carried, id, n, { made: this.worldHours() }); out.push({ id, n }); }
    inv.changed(); this.g.emit('henSlaughtered', { coop: co.id, sex: h.sex });
    return { ok: true, items: out, text: 'THE HEN IS DEAD · DRESSED' };
  }
  henHours() {}
  // The chance a night takes a hen: the row x a latched coop x a bonded dog in the yard x the dead nearby x the region's wildlife.
  predatorOdds(co) {
    const g = this.g, P = COOP.predator;
    const dogs = (g.dogs?.mine?.() ?? []).some((d) => Math.hypot(d.x - co.x, d.z - co.z) < 30);
    const infected = g.chars.some((c) => c.alive && c.faction === 'zombie' && Math.hypot(c.x - co.x, c.z - co.z) < 45);
    return P.perNight * (co.secure ? P.secure : 1) * (dogs ? P.dog : 1) * (infected ? P.infected : 1) * this.clim(co.x, co.z).pest;
  }
  henDay(day) {
    const g = this.g, K = COOP;
    for (const co of this.coops) {
      if (co.lastDay === day) continue; co.lastDay = day;
      const n = co.hens.length; if (!n) continue;
      const needF = n * K.feedPerHen, needW = n * K.waterPerHen;
      const feedK = needF > 0 ? Math.min(1, co.feed / needF) : 1, waterK = needW > 0 ? Math.min(1, co.water / needW) : 1;
      co.feed = Math.max(0, co.feed - needF); co.water = Math.max(0, co.water - needW);
      const rng = rngOf(`${co.id}:${day}`);
      for (const h of [...co.hens]) {
        h.age++;
        if (feedK < 0.99 || waterK < 0.99) h.unfed++; else h.unfed = 0;
        if (h.unfed >= K.deadDays) { co.hens.splice(co.hens.indexOf(h), 1); this.stats.henLost++; this.note('a hen starved', { id: co.id }); g.emit('henLost', { coop: co.id, why: 'starved' }); continue; }
        if (h.sex === 'chick') { if (h.age >= K.growDays + 30) h.sex = 'hen'; continue; }
        if (h.sex === 'hen' && h.unfed < K.fedDaysMax && h.age >= 20 && rng() < K.lay * Math.min(1, (feedK + waterK) / 2 + 0.01)) { co.eggs.push({ at: day * 24 + 6 - this.skew }); this.stats.eggs++; g.emit('coopEgg', { coop: co.id }); }
      }
      if (co.eggs.length > 18) co.eggs.splice(0, co.eggs.length - 18);
      if (co.hens.some((h) => h.sex === 'rooster') && co.hens.length < K.slots && co.hens.filter((h) => h.sex === 'hen' && h.age >= 20).length && rng() < K.hatchP) co.hens.push({ id: `${co.id}h${++co.nid}`, sex: 'chick', age: 0, unfed: 0 });
      // the night: a fox, a coyote, a coon, or the dead
      const infected = g.chars.some((c) => c.alive && c.faction === 'zombie' && Math.hypot(c.x - co.x, c.z - co.z) < 45), pk = this.predatorOdds(co);
      if (co.hens.length && rng() < pk) { const i = Math.floor(rng() * co.hens.length); co.hens.splice(i, 1); this.stats.henLost++; const who = infected ? 'the dead' : ['a fox', 'a coyote', 'a raccoon'][Math.floor(rng() * 3)]; this.note(`${who} took a hen`, { id: co.id }); g.emit('henLost', { coop: co.id, why: who }); }
    }
  }

  // ---- the crew's FARM job (data/crewjobs.js 'farm') ----------------------------------------------------------------------
  crewTend(m, mul = 1) {
    const g = this.g, base = g.crew?.base, inv = this.inv();
    const mine = this.plots.filter((p) => !base || Math.hypot(p.x - base.x, p.z - base.z) < 160);
    if (!mine.length && !this.coops.length) return { ok: false, why: 'no beds or coop at the base' };
    // 1. ripe beds first
    const ripe = mine.find((p) => p.state === 'ripe');
    if (ripe) {
      const c = CROPS[ripe.crop], n = this.expected(ripe), seeds = c.seeds[0] + (mul > 1.2 ? 1 : 0);
      const dst = inv.boxes.get('crew:stash') && base && Math.hypot(g.player.x - base.x, g.player.z - base.z) > 30 ? inv.boxes.get('crew:stash') : inv.carried;
      const got = inv.add(dst, c.item, n, { made: this.worldHours() }); if (seeds > 0) inv.add(dst, c.seed, seeds);
      ripe.fert = Math.max(0, ripe.fert - c.drain); ripe.last = ripe.crop;
      if (c.perennial) { ripe.state = 'growing'; ripe.progress = c.perennial; } else { ripe.crop = null; ripe.state = 'bare'; ripe.progress = 0; }
      Object.assign(ripe, { loss: 0, ripeAt: null }); this.stats.harvested++; this.stats.produce += got; inv.changed();
      g.emit('cropHarvested', { id: ripe.id, crop: ripe.last, item: c.item, n: got, by: m?.id ?? 'crew' });
      return { ok: true, what: `${got} ${ITEMS[c.item].name.toLowerCase()} picked` };
    }
    // 2. the thirstiest bed, from the real water in the pack, the base stash or the catcher beside it
    const dry = mine.filter((p) => p.crop && p.state !== 'wilted' && p.water < 0.45).sort((a, b) => a.water - b.water)[0];
    if (dry) {
      const want = Math.ceil((1 - dry.water) / GARDEN.litrePerWater - 1e-6);
      let L = 0; const stash = inv.boxes.get('crew:stash');
      for (const box of [inv.carried, stash]) { if (!box || L >= want) continue; for (const s of box.slots) if ((s.id === 'bucket' || s.id === 'water_can') && s.left > 0 && L < want) { const t = Math.min(s.left, want - L); s.left -= t; L += t; } }
      if (L < want) { const o = this.catcherBy(dry, 30); if (o) { const t = Math.min(Math.floor(o.water), want - L); o.water -= t; L += t; } }
      if (L > 0) { dry.water = clamp(dry.water + L * GARDEN.litrePerWater, 0, 1); inv.changed(); return { ok: true, what: `${L} L poured on the beds` }; }
      return { ok: false, why: 'no water for the beds (a bucket or a catcher)' };
    }
    // 3. the hens
    const co = this.coops.find((q) => q.hens.length);
    if (co) {
      let did = '';
      if (co.eggs.length) { const n = co.eggs.length; const dst = inv.carried; for (const e of co.eggs.splice(0)) inv.add(dst, 'egg', 1, { made: e.at }); did = `${n} eggs`; }
      if (co.feed < co.hens.length * COOP.feedPerHen) { const C = inv.carried; for (const [id, u] of Object.entries(COOP.feedItems)) if (C.count(id) && co.feed + u <= 6.01) { inv.take(C, C.slots.findIndex((s) => s.id === id), 1); co.feed += u; did += did ? ' and fed the hens' : 'fed the hens'; break; } }
      if (did) { inv.changed(); return { ok: true, what: did }; }
    }
    return { ok: true, what: 'weeded and watched the beds', idle: true };
  }

  // ---- the market: the one way garden produce reaches a trader's shelf ----------------------------------------------------
  consignTo(traderId, itemId, n = 1) {
    const g = this.g, inv = this.inv();
    const t = g.chars.find((c) => c.npc?.id === traderId || c.id === traderId);
    if (!t) return { ok: false, why: `no such trader (try a trader's npc id)` };
    if (!g.crew?.members?.length) return { ok: false, why: 'a courier has to be someone: you need a crew member to carry it' };
    const m = g.crew.members.find((q) => q.c?.alive && !q.away) ?? g.crew.members[0];
    if (!(n >= 1) || this.count(itemId) < n) return { ok: false, why: `you have ${this.count(itemId)} ${ITEMS[itemId]?.name?.toLowerCase() ?? itemId}` };
    if (!['food'].includes(ITEMS[itemId].kind)) return { ok: false, why: 'only food goes to market from the garden' };
    const slot = inv.carried.slots.find((s) => s.id === itemId), made = slot?.made;
    inv.take(inv.carried, inv.carried.slots.findIndex((s) => s.id === itemId), n); inv.changed();
    const dist = Math.hypot(t.x - g.player.x, t.z - g.player.z), travel = Math.max(0.25, dist / 4500); // a walking courier, 4.5 km/h
    const rec = { id: `M${++this.seq}`, trader: t.npc?.id ?? t.id, name: t.name ?? t.id, items: [{ id: itemId, n, made }], leaveAt: r1(this.hours()), arriveAt: r1(this.hours() + travel), by: m?.id ?? 'crew' };
    this.consign.push(rec); this.stats.consigned += n; g.emit('consigned', { ...rec });
    return { ok: true, id: rec.id, arriveInH: r1(travel), text: `${n} ${ITEMS[itemId].name.toUpperCase()} ON THE WAY TO ${String(rec.name).toUpperCase()} · ${r1(travel)} H` };
  }
  marketPass() {
    const now = this.hours();
    for (let i = this.consign.length - 1; i >= 0; i--) {
      const M = this.consign[i];
      const by = this.g.crew?.members?.find((q) => q.id === M.by);
      if (by && by.c && !by.c.alive) { this.consign.splice(i, 1); this.note(`the courier to ${M.name} never arrived`, { id: M.id }); this.g.emit('consignLost', { id: M.id }); continue; }
      if (now < M.arriveAt) continue;
      const r = this.g.rites?.deliver?.(M.trader, M.items, { kind: 'producer', id: M.id });
      if (r?.ok) { this.stats.delivered += M.items.reduce((s, x) => s + x.n, 0); this.consign.splice(i, 1); this.note(`${M.name} took the delivery`, { id: M.id }); this.g.emit('consignDelivered', { id: M.id, trader: M.trader }); } else if (r) { this.consign.splice(i, 1); }
    }
  }

  // ---- E, the pack and the commands ---------------------------------------------------------------------------------------
  nearFor(p) {
    if (!p.alive || p.inVehicle) return null;
    if (this.job) return { farm: true, verb: 'busy', text: `${this.job.label[0].toUpperCase()}${this.job.label.slice(1)} · ${Math.round((this.job.t / this.job.need) * 100)}% · move to stop` };
    const bed = this.plotNear(p.x, p.z);
    if (bed) {
      const c = CROPS[bed.crop], st = this.stageOf(bed), pct = Math.round(bed.progress * 100), wet = Math.round(bed.water * 100);
      if (st === 'ripe') return { farm: true, verb: 'harvest', plot: bed, text: `Pick the ${c.name.toLowerCase()} (~${this.expected(bed)})` };
      if (st === 'wilted') return { farm: true, verb: 'clear', plot: bed, text: `Pull the dead ${c?.name.toLowerCase() ?? 'plants'} (${bed.why})` };
      if (st === 'bare') { const s = this.seedsCarried().find((q) => !CROPS[q.crop].region || CROPS[q.crop].region === this.region(bed.x, bed.z)); if (s) return { farm: true, verb: 'sow', plot: bed, crop: s.crop, text: `Sow ${CROPS[s.crop].name.toLowerCase()}${s.fits ? '' : ' (off season)'} · ${s.n} packet${s.n > 1 ? 's' : ''}` }; return { farm: true, verb: 'none', plot: bed, text: `Garden bed · bare · ${wet}% wet · find seed` }; }
      if (bed.water < 0.35 && (this.waterSource() || this.catcherBy(bed, GARDEN.reach + 2))) return { farm: true, verb: 'water', plot: bed, text: `Water the ${c.name.toLowerCase()} (${wet}% wet)` };
      if (bed.fert < 0.45 && this.count('compost')) return { farm: true, verb: 'fertilise', plot: bed, text: 'Dress the bed with compost' };
      return { farm: true, verb: 'none', plot: bed, text: `${c.name} · ${pct}% grown · ${wet}% wet${bed.blight ? ' · BLIGHT' : ''}` };
    }
    const co = this.coopNear(p.x, p.z);
    if (co) {
      if (co.eggs.length) return { farm: true, verb: 'eggs', coop: co, text: `Take the eggs (${co.eggs.length})` };
      if (this.count('hen') && co.hens.length < COOP.slots) return { farm: true, verb: 'stock', coop: co, text: 'Put your hen in the coop' };
      if (co.feed < co.hens.length * COOP.feedPerHen && Object.keys(COOP.feedItems).some((id) => this.count(id))) return { farm: true, verb: 'feedcoop', coop: co, text: 'Feed the hens' };
      return { farm: true, verb: 'none', coop: co, text: `Coop · ${co.hens.length} bird${co.hens.length === 1 ? '' : 's'} · trough ${r1(co.feed)} · ${r1(co.water)} L` };
    }
    if ((p.crouch || p.crouched) && this.toolOf()) { const at = this.siteOk(p.x + Math.sin(p.face) * 1.9, p.z + Math.cos(p.face) * 1.9); if (at.ok) return { farm: true, verb: 'till', text: `Dig a garden bed (${this.toolOf()})` }; }
    return null;
  }
  interact(o) {
    switch (o.verb) {
      case 'harvest': return this.harvest(o.plot);
      case 'sow': return this.sow(o.plot, o.crop);
      case 'water': return this.water(o.plot);
      case 'fertilise': return this.fertilise(o.plot);
      case 'clear': return this.clear(o.plot);
      case 'till': return this.till();
      case 'eggs': return this.collectEggs(o.coop);
      case 'stock': return this.stock(o.coop);
      case 'feedcoop': return this.feedCoop(o.coop);
      case 'busy': return { ok: true, text: 'STILL WORKING' };
      default: return { ok: false, why: o.text ?? 'nothing to do' };
    }
  }
  // The PACK screen's use verbs (inventory.act asks us before the wilds' tools). null: not ours.
  act(verb, s) {
    const P = this.g.player;
    const here = this.plotNear(P.x, P.z), co = this.coopNear(P.x, P.z);
    const via = { instant: true, free: true }; // the pack's use() takes the item itself
    if (verb === 'dig') return this.till();
    if (verb === 'sow') return this.sow(here, ITEMS[s.id]?.seedOf, via);
    if (verb === 'fertilise') return this.fertilise(here, via);
    if (verb === 'garden_water') return this.water(here, 1, via);
    if (verb === 'stock') return this.stock(co, ITEMS[s.id]?.live === 'rooster' ? 'rooster' : 'hen', via);
    if (verb === 'feedcoop') return this.feedCoop(co, via);
    return null;
  }

  // ---- views ---------------------------------------------------------------------------------------------------------------
  risks(p) {
    const cal = this.cal(), c = CROPS[p.crop], out = [];
    if (!c || p.state === 'bare') return out;
    if (p.state === 'wilted') return [`dead: ${p.why}`];
    if (p.water < 0.2) out.push('DRY');
    if (p.blight) out.push('BLIGHT');
    const fp = this.frostOdds(p, cal.month);
    if (fp >= 0.04) out.push(`FROST ${Math.round(fp * 100)}%/night`);
    if (!c.plant.includes(cal.month)) out.push('OFF SEASON');
    const po = this.pestOdds(p); if (po >= 0.03) out.push(`PESTS ${Math.round(po * 100)}%/day`);
    if (p.state === 'ripe' && p.ripeAt !== null) out.push(`ROTS IN ${r1(c.hold - (this.hours() - p.ripeAt) / 24)} D`);
    return out;
  }
  plotView(p) {
    const c = CROPS[p.crop], P = this.g.player, r = this.rate(p);
    const left = c && p.state === 'growing' ? (r > 0.02 ? r1(((1 - p.progress) * c.days) / r) : null) : c && p.state === 'ripe' ? 0 : null;
    return { id: p.id, x: p.x, z: p.z, dist: r1(Math.hypot(p.x - P.x, p.z - P.z)), crop: p.crop, name: c?.name ?? null, stage: this.stageOf(p), progress: r2(p.progress), daysLeft: left, stalled: p.state === 'growing' && r <= 0.02,
      water: r2(p.water), fert: r2(p.fert), health: r2(p.health), blight: p.blight, fenced: p.fenced, scarecrow: p.scarecrow, loss: r2(p.loss), expected: p.state === 'ripe' ? this.expected(p) : null, risks: this.risks(p), why: p.why, owner: p.owner, base: p.bk, restH: r1(Math.max(0, p.restUntil - this.hours())) };
  }
  coopView(co) { return { id: co.id, x: co.x, z: co.z, dist: r1(Math.hypot(co.x - this.g.player.x, co.z - this.g.player.z)), secure: co.secure, hens: co.hens.map((h) => ({ id: h.id, sex: h.sex, age: h.age, unfed: h.unfed })), eggs: co.eggs.length, feed: r1(co.feed), water: r1(co.water), needFeed: r1(co.hens.length * COOP.feedPerHen), needWater: r1(co.hens.length * COOP.waterPerHen) }; }
  view() {
    return { calendar: this.cal(), plots: this.plots.map((p) => this.plotView(p)), coops: this.coops.map((c) => this.coopView(c)), consign: this.consign.map((m) => ({ ...m })), seeds: this.seedsCarried(), job: this.job ? { label: this.job.label, t: r1(this.job.t), need: this.job.need } : null, log: this.log.slice(-8), stats: { ...this.stats }, farmLevel: r1(this.farmLv()) };
  }

  // A garden goes with its house: a place you lost (rent unpaid, burned, given up) takes its beds and coop with it.
  orphans() {
    const B = this.g.homes?.bases; if (!B) return;
    for (let i = this.plots.length - 1; i >= 0; i--) if (!B.has(this.plots[i].bk)) { this.note('a bed went with the house', { id: this.plots[i].id }); this.g.emit('gardenLost', { id: this.plots[i].id }); this.plots.splice(i, 1); }
    for (let i = this.coops.length - 1; i >= 0; i--) if (!B.has(this.coops[i].bk)) { this.note('the coop went with the house', { id: this.coops[i].id }); this.g.emit('gardenLost', { id: this.coops[i].id }); this.coops.splice(i, 1); }
  }

  // A garden goes with its house: a place you lost (rent unpaid, burned, given up) takes its beds and coop with it.
  orphans() {
    const B = this.g.homes?.bases; if (!B) return;
    for (let i = this.plots.length - 1; i >= 0; i--) if (!B.has(this.plots[i].bk)) { this.note('a bed went with the house', { id: this.plots[i].id }); this.g.emit('gardenLost', { id: this.plots[i].id }); this.plots.splice(i, 1); }
    for (let i = this.coops.length - 1; i >= 0; i--) if (!B.has(this.coops[i].bk)) { this.note('the coop went with the house', { id: this.coops[i].id }); this.g.emit('gardenLost', { id: this.coops[i].id }); this.coops.splice(i, 1); }
  }

  // ---- the loop ---------------------------------------------------------------------------------------------------------------
  update(dt) {
    if (this.job) this.jobStep(dt);
    if (!this.plots.length && !this.coops.length && !this.consign.length) { this.last = null; if (this.mesh?.count) { this.mesh.count = 0; this.mesh.visible = false; } return; }
    this.drawT -= dt;
    if ((this.liveT = (this.liveT ?? 0) - dt) <= 0) { this.liveT = 0.4; this.livePass(); } // thieves and the dead are quick
    if ((this.slowT -= dt) <= 0) { this.slowT = 1; this.orphans(); this.clock(); if (this.consign.length) this.marketPass(); }
    if (this.drawT <= 0) { this.drawT = this.coops.some((c) => c.hens.length && Math.abs(c.x - this.g.player.x) < 40 && Math.abs(c.z - this.g.player.z) < 40) ? 0.12 : 0.5; this.draw(); } // hens move: quick when you can see them
  }

  // ---- drawing: one instanced mesh of boxes (beds, plants by stage, fences, scarecrows, coops, hens) ---------------------------
  put(n, x, y, z, sx, sy, sz, yaw, col) {
    if (n >= MAX_INST) return n;
    _o.position.set(x, y, z); _o.rotation.set(0, yaw, 0); _o.scale.set(sx, sy, sz); _o.updateMatrix();
    this.mesh.setMatrixAt(n, _o.matrix); this.mesh.setColorAt(n, _c.set(col));
    return n + 1;
  }
  groundY(x, z) { return this.g.fx?.ground ? this.g.fx.ground(x, z) : 0; }
  draw() {
    const m = this.mesh; if (!m) return;
    const P = this.g.player, t = this.g.time ?? 0, K = GARDEN.colours;
    let n = 0;
    for (const p of this.plots) {
      if (Math.abs(p.x - P.x) > 95 || Math.abs(p.z - P.z) > 95) continue;
      const y = this.groundY(p.x, p.z), s = Math.sin(p.face), c = Math.cos(p.face);
      const at = (lx, lz) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
      const [hx, hz] = GARDEN.plotSize;
      _c.set(K.bed).lerp(_c2.set(K.bedWet), clamp(p.water * 1.2, 0, 1));
      n = this.put(n, p.x, y + 0.07, p.z, hx, 0.14, hz, p.face, `#${_c.getHexString()}`);
      for (const [lx, lz, sx, sz] of [[-hx / 2, 0, 0.1, hz + 0.1], [hx / 2, 0, 0.1, hz + 0.1], [0, -hz / 2, hx + 0.1, 0.1], [0, hz / 2, hx + 0.1, 0.1]]) { const [qx, qz] = at(lx, lz); n = this.put(n, qx, y + 0.11, qz, sx, 0.22, sz, p.face, '#7a5e3e'); } // the raised bed's boards
      for (let r = -1; r <= 1; r++) { const [qx, qz] = at(0, r * 0.6); n = this.put(n, qx, y + 0.16, qz, hx - 0.2, 0.06, 0.2, p.face, '#2c2118'); } // the tilled rows
      const cr = CROPS[p.crop], st = this.stageOf(p);
      if (cr && st !== 'bare') {
        const tree = !!cr.perennial;
        const spots = tree ? [[0, 0]] : [[-0.85, -0.6], [0, -0.6], [0.85, -0.6], [-0.85, 0.6], [0, 0.6], [0.85, 0.6]];
        spots.forEach(([lx, lz], k) => {
          const [qx, qz] = at(lx, lz), sick = p.blight, leaf = sick ? K.blight : cr.leaf ?? K.leaf, shade = k % 2 ? 0.92 : 1;
          const col = (hex, m = 1) => { _c3.set(hex); _c3.multiplyScalar(m); return `#${_c3.getHexString()}`; };
          if (st === 'wilted') { n = this.put(n, qx, y + 0.2, qz, 0.05, 0.3, 0.05, p.face + 0.4, K.wilt); for (let b = 0; b < 3; b++) n = this.put(n, qx + 0.06 * b, y + 0.15 - b * 0.01, qz - 0.05 * b, 0.34, 0.025, 0.1, p.face + b * 1.05 + k, K.wilt); return; }
          if (st === 'seed') { n = this.put(n, qx, y + 0.17, qz, 0.14, 0.06, 0.14, p.face, K.seed); n = this.put(n, qx + 0.02, y + 0.19, qz, 0.05, 0.05, 0.05, p.face, '#c8b48a'); return; }
          const f = st === 'sprout' ? 0.3 : st === 'mid' ? 0.68 : 1, h = cr.h * f * (tree ? 1.1 : 1), top = y + 0.14 + h;
          n = this.put(n, qx, y + 0.14 + h / 2, qz, tree ? 0.14 : 0.05, h, tree ? 0.14 : 0.05, p.face, tree ? '#5a4630' : col(K.stem));
          if (st === 'sprout') { for (let b = 0; b < 2; b++) n = this.put(n, qx, top, qz, 0.24, 0.03, 0.08, p.face + b * 1.57 + k, col(leaf, 1.15)); return; }
          const blades = tree ? 5 : cr.blade ? 2 : 3, len = (tree ? 0.9 + 0.9 * f : (cr.blade ?? 0.34) * (0.45 + 0.7 * f)), wid = tree ? 0.55 : cr.blade ? 0.07 : 0.15 + 0.1 * f;
          for (let b = 0; b < blades; b++) n = this.put(n, qx, top - (cr.blade ? 0.18 * (b % 2) : 0.05 * (b % 2)), qz, len, 0.035, wid, p.face + k * 0.5 + (b * Math.PI) / blades, col(leaf, shade * (b % 2 ? 0.88 : 1.05)));
          if (st === 'ripe') {
            const fs = cr.fs ?? 0.13, fc = cr.fruit;
            if (tree) for (let b = 0; b < 5; b++) { const an = b * 1.26 + k; n = this.put(n, qx + Math.sin(an) * 0.45, top - 0.1 - (b % 2) * 0.2, qz + Math.cos(an) * 0.45, fs, fs, fs, 0, fc); }
            else if (cr.ground) n = this.put(n, qx + 0.2, y + 0.14 + fs / 2, qz + 0.1, fs * 1.4, fs, fs, p.face + k, fc); // squash and melon lie on the ground
            else if (cr.ear) n = this.put(n, qx + 0.07, y + 0.14 + h * 0.55, qz, 0.09, 0.09, 0.3, p.face + k, fc); // corn: an ear on the stalk
            else for (let b = 0; b < 3; b++) { const an = b * 2.1 + k; n = this.put(n, qx + Math.sin(an) * 0.17, top - 0.05, qz + Math.cos(an) * 0.17, fs, fs, fs, 0, fc); }
          }
        });
      }
      if (p.fenced) {
        const px = hx / 2 + 0.35, pz = hz / 2 + 0.35;
        for (const [lx, lz] of [[-px, -pz], [px, -pz], [-px, pz], [px, pz], [0, -pz], [0, pz]]) { const [qx, qz] = at(lx, lz); n = this.put(n, qx, y + 0.45, qz, 0.07, 0.9, 0.07, p.face, GARDEN.fence.colour); }
        for (const [lx, lz, sx, sz] of [[0, -pz, px * 2, 0.04], [0, pz, px * 2, 0.04], [-px, 0, 0.04, pz * 2], [px, 0, 0.04, pz * 2]]) { const [qx, qz] = at(lx, lz); n = this.put(n, qx, y + 0.62, qz, sx, 0.06, sz, p.face, GARDEN.fence.colour); n = this.put(n, qx, y + 0.3, qz, sx, 0.05, sz, p.face, GARDEN.fence.colour); }
      }
      if (p.scarecrow) { const [qx, qz] = at(hx / 2 + 0.7, hz / 2 + 0.2); n = this.put(n, qx, y + 0.8, qz, 0.06, 1.6, 0.06, p.face, GARDEN.scarecrow.colour); n = this.put(n, qx, y + 1.25, qz, 0.95, 0.06, 0.06, p.face, GARDEN.scarecrow.colour); n = this.put(n, qx, y + 1.62, qz, 0.24, 0.24, 0.24, p.face, '#b09a6a'); n = this.put(n, qx, y + 1.78, qz, 0.34, 0.06, 0.34, p.face, '#4a3a2a'); }
    }
    for (const co of this.coops) {
      if (Math.abs(co.x - P.x) > 95 || Math.abs(co.z - P.z) > 95) continue;
      const y = this.groundY(co.x, co.z), s = Math.sin(co.face), c = Math.cos(co.face);
      const at = (lx, lz) => [co.x + lx * c + lz * s, co.z - lx * s + lz * c];
      const [w, h, d] = COOP.size, [rw, rd] = COOP.run;
      n = this.put(n, co.x, y + 0.45 + h / 2 - 0.2, co.z, w, h, d, co.face, COOP.colour);
      n = this.put(n, co.x, y + h + 0.32, co.z, w + 0.2, 0.08, d + 0.3, co.face, COOP.roof);
      for (const [lx, lz] of [[-rw / 2, d / 2 + rd], [rw / 2, d / 2 + rd], [-rw / 2, d / 2], [rw / 2, d / 2]]) { const [qx, qz] = at(lx, lz); n = this.put(n, qx, y + 0.5, qz, 0.06, 1, 0.06, co.face, '#6a5a44'); }
      for (const [lx, lz, sx, sz] of [[0, d / 2 + rd, rw, 0.03], [-rw / 2, d / 2 + rd / 2, 0.03, rd], [rw / 2, d / 2 + rd / 2, 0.03, rd]]) { const [qx, qz] = at(lx, lz); n = this.put(n, qx, y + 0.5, qz, sx, 0.7, sz, co.face, '#8a8a82'); }
      co.hens.forEach((hen, i) => {
        const a = t * (0.3 + 0.07 * i) + i * 2.1, lx = Math.sin(a) * (rw / 2 - 0.4), lz = d / 2 + rd / 2 + Math.cos(a * 1.3) * (rd / 2 - 0.3), [qx, qz] = at(lx, lz), big = hen.sex === 'chick' ? 0.5 : 1, yaw = co.face + a + Math.PI / 2;
        const col = hen.sex === 'rooster' ? '#8a3a22' : i % 2 ? '#a8743a' : '#c8b08a';
        n = this.put(n, qx, y + 0.22 * big, qz, 0.2 * big, 0.2 * big, 0.34 * big, yaw, col);
        n = this.put(n, qx + Math.sin(yaw) * 0.2 * big, y + 0.36 * big, qz + Math.cos(yaw) * 0.2 * big, 0.1 * big, 0.14 * big, 0.1 * big, yaw, '#b83a2a');
      });
      for (let e = 0; e < Math.min(3, co.eggs.length); e++) { const [qx, qz] = at(-0.3 + e * 0.25, d / 2 + 0.1); n = this.put(n, qx, y + 0.1, qz, 0.1, 0.12, 0.1, 0, '#efe6d2'); }
    }
    m.count = n; m.visible = n > 0;
    if (n) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  // ---- save / load ---------------------------------------------------------------------------------------------------------------
  save() {
    return {
      seq: this.seq, last: this.last, skew: this.skew, plots: this.plots.map((p) => ({ ...p })), coops: this.coops.map((c) => ({ ...c, hens: c.hens.map((h) => ({ ...h })), eggs: c.eggs.map((e) => ({ ...e })) })),
      consign: this.consign.map((m) => ({ ...m, items: m.items.map((x) => ({ ...x })) })), log: this.log.slice(-20), stats: { ...this.stats },
    };
  }
  load(s) {
    this.plots = []; this.coops = []; this.consign = []; this.thieves = []; this.job = null; this.log = [];
    this.skew = s?.skew ?? 0;
    if (!s) { this.last = null; return; }
    this.seq = s.seq ?? 0; this.last = s.last ?? null;
    for (const p of s.plots ?? []) if (!p.crop || CROPS[p.crop]) this.plots.push({ ...p });
    for (const c of s.coops ?? []) this.coops.push({ ...c, hens: (c.hens ?? []).map((h) => ({ ...h })), eggs: (c.eggs ?? []).map((e) => ({ ...e })) });
    this.consign = (s.consign ?? []).map((m) => ({ ...m, items: m.items.map((x) => ({ ...x })) }));
    this.log = s.log ?? []; Object.assign(this.stats, s.stats ?? {});
  }
}
const _c2 = new THREE.Color(), _c3 = new THREE.Color();
export { validateFarming };
