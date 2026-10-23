// THE ROADSIDE, live (docs/design/WEB_ROADSIDE.md; laid out by world/roadside.js from data/roadside.js): what a person
// can DO at the places the road goes past. Survival is what they are for: fuel, scrap and water.
//   - a station's underground tank: E at its fill caps with a siphon hose draws what is left into the car beside you,
//     then into the empty fuel cans you carry. A looted station has the dregs; a holdout's tank is watched (its keeper
//     sells by the litre instead) until nobody keeps it.
//   - a junkyard hulk: E with a wrench or a pry bar strips it piece by piece on the game clock (a piece of scrap every
//     quarter hour into your pack, or onto the ground at your feet), loud work the infected hear.
//   - water: a farm's stock tank (a windmill pumps a little in every game day) and the dam's cistern (filled only while
//     its gates are open); E fills your bottles, canteens and cans.
//   - the dam's gate wheel: whoever holds the crest holds the water. The Sluice's keeper turns it for a price; with
//     nobody holding the wheel it is yours.
//   - keepers (a station's holdout, a junkyard's squatters, the sluice): made real near you, back on their record past
//     the far line (dead stays dead), with a counter that sells fuel, water and a hose. A junkyard's guard dog is a stray
//     of the dogs system, homed on its kennel.
// State is only what changed (litres drawn, hulks stripped, the gates, who is dead), keyed by the rows' ids: it rides
// the save. The layout itself never changes (a chunk stays a pure function of the data).
import { ROADSIDE_RULES as RR, KEEPERS } from '../data/roadside.js';
import { ITEMS } from '../data/items.js';
import { PRICE_TIER } from '../data/trade.js';

const WATER_L = { water_bottle: 0.5, canteen: 1, water_can: 10 }; // litres each water container holds when full
const r1 = (v) => Math.round(v * 10) / 10;

export class RoadsideSys {
  constructor(game) {
    this.g = game;
    this.tank = {};    // station tank id -> litres left (only once touched)
    this.hulk = {};    // hulk id -> scrap left (only once touched)
    this.water = {};   // stock tank / cistern id -> { l, h } litres at game hour h
    this.dam = {};     // dam id -> { gates: 'shut' | 'open', since: hours }
    this.dead = {};    // keeper id -> true
    this.dogs = {};    // junkyard site id -> dog id (spawned once)
    this.live = {};    // site id -> { chars: [c] } keepers made real now
    this.job = null;   // { id, acc, last, got } a hulk being stripped
    this.warned = {};  // hazard id -> real time warned (a toast per approach)
    this.t = 0;
    this.stats = { siphoned: 0, stripped: 0, scrap: 0, water: 0, promoted: 0 };
  }
  get R() { return this.g.streamer?.W?.roadside ?? null; }
  hours() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }

  // ---- reads -------------------------------------------------------------------------------------------------------------
  litres(sp) { return this.tank[sp.id] ?? sp.litres; }
  scrapLeft(sp) { return this.hulk[sp.id] ?? sp.scrap; }
  gates(id) { return this.dam[id]?.gates ?? 'shut'; }
  // A water tank's litres now: a windmill fills its own every day; the cistern only while the dam's gates are open.
  waterNow(sp) {
    const now = this.hours(), w = this.water[sp.id] ?? { l: sp.source === 'cistern' ? 0 : sp.cap * 0.5, h: now };
    const flowing = sp.source !== 'cistern' || this.gates(sp.site) === 'open'; // a cistern's site is its dam
    const l = flowing ? Math.min(sp.cap, w.l + Math.max(0, now - w.h) * (sp.perDay / 24)) : w.l;
    return l;
  }
  setWater(sp, l) { this.water[sp.id] = { l, h: this.hours() }; }

  // ---- E: the spot within reach ----------------------------------------------------------------------------------------
  spotNear(p) {
    const R = this.R;
    if (!R || p.inVehicle || !p.alive) return null;
    let best = null, bd = Infinity;
    for (const sp of R.spots) {
      const d = Math.hypot(sp.x - p.x, sp.z - p.z);
      if (d > sp.r || d >= bd || Math.abs((p.gy ?? 0) - (sp.y ?? 0)) > 2) continue;
      best = sp; bd = d;
    }
    if (!best) return null;
    return { roadside: true, kind: best.kind, id: best.id, sp: best, label: this.label(best) };
  }
  label(sp) {
    if (sp.kind === 'tank') { const l = this.litres(sp); return l <= 0.05 ? 'The tank is dry' : `<kbd>E</kbd> Siphon the tank${this.g.inventory?.hasTag('hose') ? '' : ' · <b class="warn">needs a hose</b>'}`; }
    if (sp.kind === 'hulk') { const l = this.scrapLeft(sp); if (this.job?.id === sp.id) return `Stripping · ${l} left · <kbd>E</kbd> stop`; return l <= 0 ? 'Stripped bare' : `<kbd>E</kbd> Strip it for scrap · ${l} left${this.tool() ? '' : ' · <b class="warn">needs a wrench or a pry bar</b>'}`; }
    if (sp.kind === 'water') { const l = this.waterNow(sp); return l < 0.2 ? (sp.source === 'cistern' ? 'The cistern is dry · the gates are shut' : 'The stock tank is dry') : `<kbd>E</kbd> Fill up · ${Math.round(l)} L in the ${sp.source === 'cistern' ? 'cistern' : 'tank'}`; }
    if (sp.kind === 'wheel') return `<kbd>E</kbd> ${this.gates(sp.site) === 'open' ? 'Shut' : 'Open'} the gates`;
    return null;
  }
  interact(spot) {
    const sp = spot.sp ?? this.R?.spotById(spot.id);
    if (!sp) return { ok: false, why: 'nothing there' };
    let r;
    if (sp.kind === 'tank') r = this.siphon(sp.id);
    else if (sp.kind === 'hulk') r = this.job?.id === sp.id ? this.stopStrip('you stopped') : this.strip(sp.id);
    else if (sp.kind === 'water') r = this.fillWater(sp.id);
    else if (sp.kind === 'wheel') r = this.turnWheel(sp.site);
    else r = { ok: false, why: 'nothing to do' };
    this.g.hud?.toast((r.ok ? r.text : r.why).toUpperCase(), r.ok ? 'job' : 'warn');
    return r;
  }
  tool() { const I = this.g.inventory; return I?.hasTag('wrench') ? 'wrench' : I?.hasTag('pry') ? 'pry bar' : null; }

  // ---- siphoning -------------------------------------------------------------------------------------------------------
  // What you can hold: the car beside the caps first (its tank's room), then every empty fuel can in your pack.
  siphon(id, { force = false } = {}) {
    const g = this.g, P = g.player, sp = this.R?.spotById(id);
    if (!sp || sp.kind !== 'tank') return { ok: false, why: `no tank ${id}` };
    if (!force && Math.hypot(sp.x - P.x, sp.z - P.z) > sp.r + 0.5) return { ok: false, why: 'stand at the fill caps' };
    if (!g.inventory?.hasTag('hose')) return { ok: false, why: 'you need a siphon hose' };
    const site = this.R.siteById(sp.site);
    if (sp.guarded && this.keepersAlive(site)) return { ok: false, why: `${site.name} keeps its tank: buy at the counter` };
    let left = this.litres(sp);
    if (left <= 0.05) return { ok: false, why: 'the tank is dry' };
    const before = left, into = [];
    const v = g.vehicles.find((c) => !c.dead && !c.sunk && c.fuelCap && Math.hypot(c.x - sp.x, c.z - sp.z) < 9);
    if (v) { const k = Math.min(left, Math.max(0, v.fuelCap - v.fuel)); if (k > 0.05) { v.fuel += k; left -= k; into.push({ to: v.name, id: v.id, litres: r1(k) }); } }
    const C = g.inventory.carried;
    for (const s of C.slots) {
      if (left < 0.5) break;
      if (s.id !== 'fuel_can' || (s.left ?? 0) > 0) continue;
      const cap = ITEMS.fuel_can.use.litres;
      if (left + 1e-6 < cap) break; // a can is filled whole or not at all (its use pours ten litres)
      s.left = 1; left -= cap; into.push({ to: 'fuel can', litres: cap });
    }
    if (!into.length) return { ok: false, why: v ? `the ${v.name.toLowerCase()} is full and you carry no empty can` : 'nothing to siphon into: bring the car alongside, or an empty can' };
    this.tank[sp.id] = Math.max(0, r1(left));
    g.inventory.changed();
    this.stats.siphoned += before - left;
    g.emit?.('siphon', { tank: sp.id, site: sp.site, litres: r1(before - left), left: this.tank[sp.id], into });
    return { ok: true, text: `+${r1(before - left)} L SIPHONED${this.tank[sp.id] <= 0.05 ? ' · TANK DRY' : ` · ${Math.round(this.tank[sp.id])} L LEFT`}`, litres: r1(before - left), left: this.tank[sp.id], into };
  }

  // ---- stripping a hulk ------------------------------------------------------------------------------------------------
  strip(id, { force = false } = {}) {
    const g = this.g, P = g.player, sp = this.R?.spotById(id);
    if (!sp || sp.kind !== 'hulk') return { ok: false, why: `no hulk ${id}` };
    if (!force && Math.hypot(sp.x - P.x, sp.z - P.z) > sp.r + 0.5) return { ok: false, why: 'get up close to it' };
    if (this.scrapLeft(sp) <= 0) return { ok: false, why: 'stripped bare' };
    const tool = this.tool();
    if (!tool) return { ok: false, why: 'you need a wrench or a pry bar' };
    this.job = { id, acc: 0, last: this.hours(), got: 0, tool, force };
    return { ok: true, text: `STRIPPING WITH THE ${tool.toUpperCase()}`, left: this.scrapLeft(sp) };
  }
  stopStrip(why) { const j = this.job; this.job = null; return { ok: true, text: why ?? 'stopped', got: j?.got ?? 0 }; }
  tickStrip() {
    const j = this.job, g = this.g, P = g.player;
    if (!j) return;
    const sp = this.R?.spotById(j.id), now = this.hours();
    const dh = Math.max(0, now - j.last); j.last = now;
    if (!sp || !P.alive || P.inVehicle || (!j.force && Math.hypot(sp.x - P.x, sp.z - P.z) > sp.r + 1) || !this.tool()) { this.stopStrip(); return; }
    j.acc += dh;
    while (j.acc >= RR.hulk.hoursPer && this.scrapLeft(sp) > 0) {
      j.acc -= RR.hulk.hoursPer;
      this.hulk[sp.id] = this.scrapLeft(sp) - 1;
      const I = g.inventory, put = I.add(I.carried, 'scrap', 1);
      if (!put) I.add(I.groundAt(P.x, P.z), 'scrap', 1);
      I.changed();
      j.got++; this.stats.scrap++;
      g.noise?.(sp.x, sp.z, RR.hulk.noise, P);
      g.emit?.('strip', { hulk: sp.id, site: sp.site, left: this.hulk[sp.id], toPack: !!put });
    }
    if (this.scrapLeft(sp) <= 0) { this.stats.stripped++; g.hud?.toast('STRIPPED BARE', 'job'); this.stopStrip('stripped bare'); }
  }

  // ---- water -----------------------------------------------------------------------------------------------------------
  // Fill every water container you carry from a tank (as much as it holds), and drink your fill.
  fillWater(id, { force = false } = {}) {
    const g = this.g, P = g.player, sp = this.R?.spotById(id);
    if (!sp || sp.kind !== 'water') return { ok: false, why: `no water ${id}` };
    if (!force && Math.hypot(sp.x - P.x, sp.z - P.z) > sp.r + 0.5) return { ok: false, why: 'get to the tank' };
    let l = this.waterNow(sp);
    if (l < 0.2) return { ok: false, why: sp.source === 'cistern' ? 'the cistern is dry: the gates are shut' : 'the stock tank is dry' };
    const l0 = l;
    for (const s of g.inventory.carried.slots) {
      const it = ITEMS[s.id], full = WATER_L[s.id];
      if (!full || it.refill !== 'water' || (s.left ?? 0) >= it.uses) continue;
      const need = ((it.uses - (s.left ?? 0)) / it.uses) * full;
      const k = Math.min(need, l); if (k <= 0) break;
      s.left = Math.min(it.uses, (s.left ?? 0) + Math.floor((k / full) * it.uses + 1e-6)); l -= k;
    }
    const N = g.needs;
    if (N && N.water < 0.95 && l > 0.5) { const k = Math.min(l, 0.5); N.water = Math.min(1, N.water + 0.35); l -= k; if (N.pips && g.survival) N.pips.water = g.survival.pip(N.water); }
    if (l0 - l < 0.05) return { ok: false, why: 'you are full and so is everything you carry' };
    this.setWater(sp, l);
    g.inventory.changed();
    this.stats.water += l0 - l;
    return { ok: true, text: `+${r1(l0 - l)} L WATER`, litres: r1(l0 - l), left: r1(l) };
  }

  // ---- the dam -----------------------------------------------------------------------------------------------------------
  // The wheel: yours to turn when nobody holds the crest (the sluice keeper dead), or when they let you (allied).
  turnWheel(siteId, { force = false, open } = {}) {
    const site = this.R?.siteById(siteId);
    if (!site || site.kind !== 'dam') return { ok: false, why: `no dam ${siteId}` };
    const holder = this.keepersAlive(site, 'sluice') ? 'sluice' : null;
    const tier = this.tier();
    if (holder && !force && tier !== 'allied') return { ok: false, why: 'the sluice holds the wheel: ask its keeper' };
    return this.setGates(siteId, open ?? this.gates(siteId) !== 'open');
  }
  setGates(siteId, open) {
    const site = this.R.siteById(siteId), now = this.hours();
    // The cistern's water up to now is settled first (it only fills while the gates stand open).
    for (const sp of this.R.tanks) if (sp.site === siteId && sp.source === 'cistern') this.setWater(sp, this.waterNow(sp));
    this.dam[siteId] = { gates: open ? 'open' : 'shut', since: now };
    this.g.emit?.('gates', { dam: siteId, gates: this.dam[siteId].gates });
    return { ok: true, text: `${site.name}: GATES ${open ? 'OPEN' : 'SHUT'}`, gates: this.dam[siteId].gates };
  }

  // ---- keepers ---------------------------------------------------------------------------------------------------------
  tier() { const F = this.g.society?.factions, i = F?.index?.drifters; return i === undefined ? 'neutral' : F.tiers[i]; }
  keepersAlive(site, job = null) {
    if (!site?.keepers) return false;
    // Anybody of the job asked about (by default: whoever keeps the counter or the wheel) still alive.
    return (KEEPERS[site.keepers] ?? []).some((k) => !this.dead[k.id] && (job ? k.job === job : k.job === 'fuel' || k.job === 'sluice'));
  }
  post(site, at) {
    const R = this.R;
    if (at === 'counter' && site.lot) {
      const L = R.lots.find((q) => q.id === site.lot), geo = L && this.g.streamer.W.ring.geo(L), d = geo?.doors.find((q) => q.kind === 'front') ?? geo?.doors[0];
      if (d) return { x: d.x - d.nx * 2.2, z: d.z - d.nz * 2.2, face: Math.atan2(d.nx, d.nz), y: 0 };
    }
    if (at === 'forecourt' && site.forecourt) return { ...site.forecourt, face: 0, y: 0 };
    if (at === 'yard') { const c = site.camp ?? site.yard; return c ? { x: c.x + 3, z: c.z + 2, face: 0, y: 0 } : null; }
    if ((at === 'wheel' || at === 'crest') && site.posts) return { ...site.posts[at], face: 0 };
    return { x: site.x, z: site.z, face: 0, y: 0 };
  }
  promote(site) {
    const g = this.g, list = KEEPERS[site.keepers] ?? [], live = (this.live[site.id] = { chars: [] });
    for (const k of list) {
      if (this.dead[k.id]) continue;
      const at = this.post(site, k.at); if (!at) continue;
      const p = k.portrait, jit = list.indexOf(k) * 0.9;
      const opts = { x: at.x + jit, z: at.z, faction: 'drifter', weapon: k.weapon ?? null, hp: 120, name: k.name, flag: k.flag,
        npc: { id: k.id, name: k.name, title: k.title, flag: k.flag, faction: 'drifter', portrait: p, ...this.talk(site, k) },
        colors: { skin: p.skin, hair: p.hair, shirt: p.shirt ?? '#5a4a38', pants: '#2f2a24', boots: '#2b241e', hat: '#5a3f24',
          hatStyle: ['cowboy', 'cap', 'mohawk', 'wrap', 'long', 'bald'].includes(p.hat) ? p.hat : 'short', gearStyle: p.gear === 'bandolier' ? 'bandolier' : 'none', gear: '#3a3128',
          accStyle: { goggles: 'goggles', bandana: 'mask', eyepatch: 'eyepatch' }[p.gear] ?? 'none', mask: '#6a2a1e', sleeves: 'short' } };
      const c = g.addChar(opts);
      if (!c) continue;
      c.fid = 'drifters'; g.society?.factions?.assign?.(c);
      c.face = at.face ?? 0; c.home = { x: c.x, z: c.z }; c.hold = true; c.roadside = site.id; c.keeper = k.id;
      if (at.y) { c.gy = at.y; g.standOn?.(c); }
      live.chars.push(c); this.stats.promoted++;
    }
  }
  demote(site) {
    const g = this.g, L = this.live[site.id];
    if (!L) return;
    for (const c of L.chars) { if (!c.alive && !(c.downedT > 0)) this.dead[c.keeper] = true; if (g.chars.includes(c)) g.removeChar(c); }
    delete this.live[site.id];
  }
  // A keeper's counter (the dialogue tree): fuel by the litre into your car or your cans, water, a hose; the sluice's
  // gates for a price. Prices by how the drifters read you (data/trade.js PRICE_TIER).
  talk(site, k) {
    const sys = this, S = RR.station;
    const mul = () => PRICE_TIER[sys.tier()]?.buy ?? null;
    const price = (base) => { const m = mul(); return m ? Math.ceil(base * m) : null; };
    const fuelCost = () => price(S.sell.litres * S.sell.price), waterCost = () => price(S.water.litres * S.water.price), hoseCost = () => price(S.hose);
    if (k.job === 'squatter') return { start: 'hi', nodes: { hi: { text: 'This yard is ours now. Strip what you like off the far rows, but you touch our tents and the dog eats.', choices: [{ t: '[Leave]', end: true }] } } };
    if (k.job === 'guard') return { start: 'hi', nodes: { hi: { text: site.kind === 'dam' ? 'Crest is open to anybody on foot. Guns stay on your back up here.' : 'Pumps are hers. You want something, ask at the counter.', choices: [{ t: '[Leave]', end: true }] } } };
    if (k.job === 'sluice') return { start: 'hi', nodes: {
      hi: { text: (g) => `The river comes through here or it doesn't. Gates are ${sys.gates(site.id)}. ${sys.gates(site.id) === 'open' ? 'Fields below are drinking.' : 'Fields below can wait.'}`, choices: [
        { t: () => `Open the gates for the fields (${price(120) ? `$${price(120)}` : 'they will not deal'})`, req: (g) => sys.gates(site.id) !== 'open' && !!price(120) && g.cash >= price(120), do: (g) => { if (g.spend(price(120))) { sys.setGates(site.id, true); g.hud?.toast('THE SLUICE OPENS THE GATES', 'job'); } }, next: 'done' },
        { t: () => `Fill my water (${waterCost() ? `$${waterCost()}` : 'no'})`, req: (g) => !!waterCost() && g.cash >= waterCost(), do: (g) => { if (g.spend(waterCost())) { const r = sys.buyWater(); if (!r.ok) g.cash += waterCost(); } }, next: 'done' },
        { t: 'Shut them.', req: () => sys.gates(site.id) === 'open', do: () => sys.setGates(site.id, false), next: 'done' },
        { t: '[Leave]', end: true },
      ] },
      done: { text: 'Done. Mind the edge.', choices: [{ t: '[Leave]', end: true }] },
    } };
    return { start: 'hi', nodes: {
      hi: { text: () => `${site.name}. Gas is ${S.sell.price * (mul() ?? 1)} a litre, ${S.sell.litres} at a time. Water too. No guns drawn on my apron.`, choices: [
        { t: () => `Twenty litres into the car ($${fuelCost()})`, req: (g) => !!fuelCost() && g.cash >= fuelCost() && !!sys.nearCar(site), do: (g) => { if (g.spend(fuelCost())) { const r = sys.buyFuel(site); if (!r.ok) g.cash += fuelCost(); } }, next: 'done' },
        { t: () => `Fill my empty cans ($${fuelCost()} each)`, req: (g) => !!fuelCost() && g.cash >= fuelCost() && g.inventory.carried.slots.some((s) => s.id === 'fuel_can' && !(s.left > 0)), do: (g) => { if (g.spend(fuelCost())) { const r = sys.fillCan(); if (!r.ok) g.cash += fuelCost(); } }, next: 'done' },
        { t: () => `Fill my water ($${waterCost()})`, req: (g) => !!waterCost() && g.cash >= waterCost(), do: (g) => { if (g.spend(waterCost())) { const r = sys.buyWater(); if (!r.ok) g.cash += waterCost(); } }, next: 'done' },
        { t: () => `A siphon hose ($${hoseCost()})`, req: (g) => !!hoseCost() && g.cash >= hoseCost() && !g.inventory.hasTag('hose'), do: (g) => { if (g.spend(hoseCost())) g.inventory.add(g.inventory.carried, 'siphon_hose', 1); g.inventory.changed(); }, next: 'done' },
        { t: '[Leave]', end: true },
      ] },
      done: { text: 'Pleasure. Road safe.', choices: [{ t: '[Leave]', end: true }] },
    } };
  }
  nearCar(site) { const g = this.g, v = g.lastVehicle; return v && !v.dead && v.fuelCap && Math.hypot(v.x - site.x, v.z - site.z) < 60 ? v : null; }
  buyFuel(site) {
    const v = this.nearCar(site);
    if (!v) return { ok: false, why: 'no car of yours at the pumps' };
    const sp = this.R.tanks.find((t) => t.site === site.id && t.kind === 'tank'), have = this.litres(sp), k = Math.min(RR.station.sell.litres, Math.max(0, v.fuelCap - v.fuel), have);
    if (k <= 0.05) return { ok: false, why: 'nothing to pour' };
    v.fuel += k; this.tank[sp.id] = r1(have - k);
    return { ok: true, text: `+${r1(k)} L FUEL` };
  }
  fillCan() {
    const s = this.g.inventory.carried.slots.find((q) => q.id === 'fuel_can' && !(q.left > 0));
    if (!s) return { ok: false, why: 'no empty can' };
    s.left = 1; this.g.inventory.changed();
    return { ok: true, text: 'CAN FILLED' };
  }
  buyWater() {
    let got = 0;
    for (const s of this.g.inventory.carried.slots) { const it = ITEMS[s.id]; if (WATER_L[s.id] && it.refill === 'water' && (s.left ?? 0) < it.uses) { got += ((it.uses - (s.left ?? 0)) / it.uses) * WATER_L[s.id]; s.left = it.uses; } }
    const N = this.g.needs; if (N) N.water = Math.min(1, N.water + 0.3);
    this.g.inventory.changed();
    return { ok: true, text: `+${r1(got)} L WATER` };
  }

  // ---- the frame -------------------------------------------------------------------------------------------------------
  update(dt) {
    const R = this.R, g = this.g, P = g.player;
    if (!R) return;
    this.tickStrip();
    this.t += dt;
    if (this.t < 0.5) return;
    this.t = 0;
    const px = P.x, pz = P.z;
    for (const s of R.sites) {
      const d = Math.hypot(s.x - px, s.z - pz) - Math.min(s.r, 200);
      // Keepers: made real near you, back onto their record past the far line.
      if (s.keepers) { if (!this.live[s.id] && d < RR.keeper.promoteR) this.promote(s); else if (this.live[s.id] && d > RR.keeper.demoteR) this.demote(s); }
      if (this.live[s.id]) for (const c of this.live[s.id].chars) if (!c.alive && !(c.downedT > 0)) this.dead[c.keeper] = true;
      // A junkyard's dog, once, when you first come near (the dogs system keeps it from then on, and in the save).
      if (s.dog && !this.dogs[s.id] && d < RR.keeper.promoteR && g.dogs && s.kennel) {
        const dd = g.dogs.make(s.dog.breed, s.kennel.x + 1.5, s.kennel.z + 1.5, { id: `rs_${s.id}`, name: s.dog.name, pack: `rs:${s.id}` });
        if (dd) { dd.home = { x: s.kennel.x, z: s.kennel.z }; dd.leader = dd; this.dogs[s.id] = dd.id; }
      }
    }
    // A downed line ahead: one warning as you come at it in a car.
    const v = P.inVehicle;
    if (v) for (const h of R.hazards) {
      const d = Math.hypot(h.x - v.x, h.z - v.z), sp = Math.hypot(v.vx, v.vz);
      if (d < 260 && d > 40 && sp > 8 && ((h.x - v.x) * v.vx + (h.z - v.z) * v.vz) > 0.6 * d * sp && (this.warned[h.id] ?? -1e9) < g.time - 60) { this.warned[h.id] = g.time; g.hud?.toast('DOWNED LINE ACROSS THE ROAD AHEAD', 'hot'); }
    }
  }

  // ---- save --------------------------------------------------------------------------------------------------------------
  save() { return { tank: { ...this.tank }, hulk: { ...this.hulk }, water: JSON.parse(JSON.stringify(this.water)), dam: JSON.parse(JSON.stringify(this.dam)), dead: { ...this.dead }, dogs: { ...this.dogs } }; }
  load(s) {
    for (const id of Object.keys(this.live)) { const site = this.R?.siteById(id); if (site) this.demote(site); }
    this.job = null;
    this.tank = { ...(s?.tank ?? {}) }; this.hulk = { ...(s?.hulk ?? {}) }; this.water = JSON.parse(JSON.stringify(s?.water ?? {}));
    this.dam = JSON.parse(JSON.stringify(s?.dam ?? {})); this.dead = { ...(s?.dead ?? {}) }; this.dogs = { ...(s?.dogs ?? {}) };
  }
  view() {
    const R = this.R;
    return { sites: R.sites.length, tanks: R.tanks.length, hulks: R.hulks.length, live: Object.fromEntries(Object.entries(this.live).map(([k, v]) => [k, v.chars.map((c) => ({ id: c.id, name: c.name, alive: c.alive }))])), dead: Object.keys(this.dead), job: this.job, stats: { ...this.stats, siphoned: r1(this.stats.siphoned), water: r1(this.stats.water) } };
  }
}
