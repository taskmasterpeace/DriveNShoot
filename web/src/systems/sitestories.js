import * as THREE from 'three';
import { STORY_RULES as R, GOODS, PLACE_KINDS, WALL_DEFENSE, RAIDERS, PROBLEMS, MOVERS, ECON, STORY_VERBS, STORY_FACT_KINDS, GUILD, GUILD_WORDS } from '../data/sitestories.js';
import { FACT_KINDS, CHANNELS } from '../data/pulls.js';
import { SITES_BY_ID } from '../data/sites/index.js';
import { outfit } from './characters.js';
import { hash32, rngOf } from '../world/geo.js';

// SITE STORIES + THE TALLY (docs/design/WEB_SITE_STORIES.md). Every planned town, every SITE row, Rust Haven and the
// Dustwolf camps carry a living STATE (owner, problem, stock and prices, people, a clock). Each game day a place eats,
// makes, sickens or heals, and decides: send a trader with its surplus, send a raid, ask its friends for guns. What it
// sends is a MOVER, a party on a real road (the corridor between the two places, or the straight track across the land
// where no road joins them) at the pace its bodies keep on screen (law 1). Near you a mover is people and a car; far from
// you it is a record. When it arrives, the load changes hands, the raid is fought, the sick bring the sickness.
// Chains of these events are STORIES: chronicle rows (src 'story', a = the arc) whose cause is the row before. Each
// telling one is a fact the place holds; it reaches anyone else only by the knowledge model's doors (law 6): a traveller
// who leaves carries the place's fresh news and its board's postings, and tells them where they arrive.
// THE TALLY is the bounty guild: halls in a few towns, postings on boards everywhere, hunters who ride in pairs and track
// from sightings a town made and tips they were told, never from where their mark really is.
// Nothing here runs per frame except the few live cars' steering (update): records tick twice a second.

Object.assign(FACT_KINDS, STORY_FACT_KINDS); // the story kinds join the knowledge model's (data/pulls.js), so the board shows them

const r1 = (v) => Math.round(v * 10) / 10;
const titled = (s) => String(s ?? '').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
const roll = (rng, [a, b]) => a + rng() * (b - a);
const iroll = (rng, [a, b]) => a + Math.floor(rng() * (b - a + 1));
const pick = (rng, a) => a[Math.floor(rng() * a.length) % a.length];
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
const RAID_FAMILIES = new Set(['raider', 'highway_raiders', 'lake_raiders', 'river_gangs', 'street_gangs', 'city_gangs', 'keys_pirates', 'desert_lords', 'river_tolls', 'fuel_cult']);
const FACTION_OF = { raider: 'dustwolves', soldier: 'remnant', remnant: 'remnant', meridian: 'meridian', warden: 'rusthaven' };
const DRESS_CAP = 900;
const _o = new THREE.Object3D(), _c = new THREE.Color();
const _p = { x: 0, z: 0, tx: 0, tz: 1 };
const GLYPH = { T: ['111', '010', '010', '010', '010'], A: ['010', '101', '111', '101', '101'], L: ['100', '100', '100', '100', '111'], Y: ['101', '101', '010', '010', '010'] };

export class SiteStories {
  constructor(g) {
    this.g = g;
    this.enabled = true;
    this.places = new Map();   // id -> place state
    this.movers = [];          // parties on the road (and the hunters, who never dissolve)
    this.arcs = [];            // the stories: { id, title, rows: [{ seq, v, text, place, cause, h }] }
    this.bounties = [];        // the Tally's book
    this.halls = [];           // town ids with a Tally House
    this.nid = 0; this.t = 0; this.clock = null; this.lastMove = null; this.built = false;
    this.stats = { days: 0, traders: 0, raids: 0, falls: 0, refugees: 0, camps: 0, sick: 0, posted: 0, claimed: 0, paid: 0, sightings: 0, promoted: 0 };
    this.dirty = true;
  }
  get k() { return this.g.pulls.k; }
  hours() { return this.g.pulls.hours(); }
  pace(on) { return (on === 'walk' ? R.walk : R.drive) / (this.g.sky?.timeScale ?? 1 / 30); }

  // ---- places ------------------------------------------------------------------------------------------------------------
  // Built once the plan is ready: every planned town (the pulls' nodes), every SITE row (in the streamed world or beyond
  // it), the island's Dustwolf camps. Seeded from the place's own id, so a fresh world is the same world.
  ensure() {
    if (this.built) return true;
    const g = this.g, cg = g.citygen, P = g.pulls;
    if (!cg?.plan?.length || !P) return false;
    this.registerGuild();
    for (const n of P.nodes()) {
      const rec = cg.byId?.get(n.id);
      this.addPlace({ id: n.id, name: n.name, kind: 'town', x: n.x, z: n.z, half: rec?.half ?? 400, holder: `town:${n.id}`, walls: rec?.walls ?? (n.id === 'rust_haven' ? 'wall' : 'none'), beyond: false,
        owner: n.id === 'rust_haven' ? { kind: 'faction', id: 'rusthaven', name: 'Rust Haven' } : null, pop: n.id === 'rust_haven' ? [160, 200] : rec?.major ? [180, 260] : [50, 140] });
    }
    for (const rec of cg.plan) {
      if (rec.kind !== 'site') continue;
      const row = SITES_BY_ID.get(rec.site); if (!row) continue;
      const fam = row.society?.faction ?? null, popR = row.society?.pop ?? [10, 40];
      const owner = !fam || fam === 'none' || popR[1] <= 0 ? { kind: 'none', id: null, name: 'no one' }
        : FACTION_OF[fam] ? { kind: 'faction', id: FACTION_OF[fam], name: g.society.factions.row(FACTION_OF[fam])?.name ?? titled(fam) }
        : fam === 'drifter' || fam === 'drifters' ? null // a family (named below)
        : { kind: 'family', id: fam, name: titled(fam.replace(/_/g, ' ')), raids: RAID_FAMILIES.has(fam) };
      this.addPlace({ id: rec.id, name: titled(rec.name), kind: PLACE_KINDS[row.kind] ? row.kind : 'landmark', x: rec.x, z: rec.z, half: rec.half, holder: `site:${rec.id}`, walls: row.walls?.type ?? 'none', beyond: !!rec.beyond, owner, pop: popR, site: row.id, makes: row.economy?.makes ?? [] });
    }
    (g.world?.spawns?.camps ?? []).forEach((c, i) => this.addPlace({ id: `camp_${i}`, name: g.society.places?.[`camp_${i}`]?.name ?? `Camp ${i + 1}`, kind: 'camp', x: c.x, z: c.z, half: 60, holder: `site:camp_${i}`, walls: 'fence', beyond: false, owner: { kind: 'faction', id: 'dustwolves', name: 'The Dustwolves' }, pop: [22, 30] }));
    this.pickHalls();
    this.built = true;
    return true;
  }
  addPlace(o) {
    const g = this.g, rng = rngOf(hash32(o.id.length * 131, Math.round(o.x) | 0, Math.round(o.z) | 0));
    const pop = o.pop ? Math.max(0, iroll(rng, o.pop)) : 0;
    const owner = o.owner ?? { kind: 'family', id: null, name: `the ${pick(rng, GUILD.surnames)} family` };
    const K = PLACE_KINDS[o.kind] ?? PLACE_KINDS.landmark;
    const stock = {}; for (const gd of Object.keys(GOODS)) stock[gd] = Math.round(pop * ((K.make[gd] ?? 0) * roll(rng, [3, 9]) + (GOODS[gd].eat ?? 0) * roll(rng, [4, 9])));
    const p = { id: o.id, name: o.name, kind: o.kind, x: o.x, z: o.z, half: o.half ?? 200, holder: o.holder, walls: o.walls ?? 'none', beyond: !!o.beyond, site: o.site ?? null,
      owner, pop, pop0: pop, stock, price: {}, coin: Math.round(pop * roll(rng, [3, 8])), problem: null, fallen: false, arc: null, arcRow: null, guard: 0, garrison: null,
      links: null, seed: hash32(o.id.length, Math.round(o.x) | 0, 0x53545259), lastSight: -99, camp: o.camp ?? null, raidedAt: null };
    this.reprice(p);
    this.places.set(p.id, p);
    this.k.holder(p.holder, { name: p.name, kind: 'site', x: p.x, z: p.z, cap: 40, radio: pop >= 40 });
    this.k.holder(this.boardOf(p), { name: `the ${p.name} board`, kind: 'board', x: p.x, z: p.z, cap: 40 });
    return p;
  }
  boardOf(p) { return `board:${p.id}`; }
  place(id) { return this.places.get(id) ?? null; }
  defense(p) {
    const K = PLACE_KINDS[p.kind] ?? PLACE_KINDS.landmark;
    return p.pop * K.guard * 2 + (WALL_DEFENSE[p.walls] ?? 0) + p.guard * 4 + Math.min(10, (p.stock.ammo ?? 0) / 4);
  }
  raids(p) { return p.pop > 0 && ((p.owner.kind === 'faction' && RAIDERS.includes(p.owner.id)) || !!p.owner.raids); }
  wants(p, gd) { return Math.max(4, p.pop * (GOODS[gd].eat ?? 0.03) * ECON.weekOf); }
  reprice(p) { for (const gd of Object.keys(GOODS)) { const w = this.wants(p, gd), s = p.stock[gd] ?? 0; p.price[gd] = r1(GOODS[gd].base * Math.max(ECON.priceMin, Math.min(ECON.priceMax, Math.sqrt(w / Math.max(0.5, s))))); } }
  linksOf(p) {
    if (p.links) return p.links;
    const out = [];
    for (const q of this.places.values()) { if (q === p) continue; const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < R.linkKm * 1000) out.push([d, q.id]); }
    out.sort((a, b) => a[0] - b[0]);
    p.links = out.slice(0, R.links).map((x) => x[1]);
    return p.links;
  }
  nearestPlace(x, z, max = 1e9, ok = () => true) { let b = null, bd = max; for (const p of this.places.values()) { if (!ok(p)) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; b = p; } } return b; }

  // ---- the guild ---------------------------------------------------------------------------------------------------------
  registerGuild() {
    const F = this.g.society.factions;
    if (F.index[GUILD.id] === undefined) F.register(GUILD.id, { name: GUILD.name, archetype: 'guild', color: GUILD.color, start: 0, stars: false, forgivesSelfDefense: true, cohesion: 0.8, memoryDays: 30, relations: { '*': 0, infected: -100, dustwolves: -40 }, values: { 'kill:self': -12, 'hurt:self': -3, 'pay:self': 3 } });
  }
  // Halls in Rust Haven and the towns that stand furthest from every other hall (in the streamed world).
  pickHalls() {
    const towns = [...this.places.values()].filter((p) => p.kind === 'town' && !p.beyond);
    if (!towns.length) return;
    const halls = [towns.find((p) => p.id === 'rust_haven') ?? towns[0]];
    while (halls.length < Math.min(GUILD.halls, towns.length)) {
      let best = null, bd = -1;
      for (const t of towns) { if (halls.includes(t)) continue; const d = Math.min(...halls.map((h) => Math.hypot(h.x - t.x, h.z - t.z))); if (d > bd) { bd = d; best = t; } }
      halls.push(best);
    }
    this.halls = halls.map((h) => h.id);
    let ni = 0;
    for (const h of halls) {
      this.k.holder(`hall:${h.id}`, { name: `the ${GUILD.hallName} at ${h.name}`, kind: 'person', x: h.x, z: h.z, cap: 60 });
      for (let i = 0; i < GUILD.hunters; i++) {
        const rng = rngOf(hash32(h.id.length * 7, i, 0x54414c4c));
        const m = this.newMover('hunters', h, h, { rng, stay: true });
        m.people.forEach((q, j) => { q.name = `${GUILD.hunterNames[ni % GUILD.hunterNames.length]} ${pick(rngOf(hash32(ni, j, 3)), GUILD.surnames)}`; q.hp = GUILD.hunterHp; ni++; });
        m.hall = h.id; m.at = h.id; m.itin = 0; m.waitUntil = null;
      }
    }
  }
  isHall(id) { return this.halls.includes(id); }

  // ---- the clock ---------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.enabled) { this.lastMove = null; this.clock = null; return; } // off: nothing moved, so nothing catches up when it comes back on
    // the few live cars steer every frame (their records are moved by the tick)
    for (let i = 0; i < this.movers.length; i++) { const m = this.movers[i]; if (m.live && m.car?.v && m.state === 'road') this.steer(m, dt); }
    this.t += dt;
    if (this.t < R.tick) return;
    this.t = 0;
    this.tick();
  }
  tick() {
    if (!this.ensure()) return;
    const now = this.hours();
    if (this.clock === null) { this.clock = Math.floor(now); this.lastMove = now; }
    if (now < this.lastMove) { this.lastMove = now; this.clock = Math.floor(now); } // the clock was set back (a load): start from here
    let n = 0;
    while (this.clock + 1 <= now && n < R.maxCatchUp) { this.clock += 1; this.hour(this.clock); n++; }
    if (this.clock + 1 <= now) this.clock = Math.floor(now);
    const dh = Math.max(0, now - this.lastMove); this.lastMove = now;
    for (let i = this.movers.length - 1; i >= 0; i--) this.advance(this.movers[i], dh, now);
    this.sightings(now);
    this.hereNews();
    this.bodies();
    this.watch(now);
    this.movers = this.movers.filter((m) => m.state !== 'gone' || m.live);
    // what is drawn changes only when the places near you, the stamps or the boards do
    const me = this.g.pulls.me(); let sig = this.g.citygen?.live?.size ?? 0;
    for (const p of this.places.values()) if (Math.abs(p.x - me.x) < 900 && Math.abs(p.z - me.z) < 900) sig = sig * 31 + (this.k.holders.get(this.boardOf(p))?.facts.length ?? 0) + (p.fallen ? 7 : 0) + (p.raidedAt ? 3 : 0) + p.id.length;
    if (sig !== this.sig) { this.sig = sig; this.dirty = true; }
    if (this.dirty) this.dress();
  }
  // A live hunter's own eyes: his mark in sight is a sighting he holds (saw), and the pair gets out and goes for him.
  watch(now) {
    const g = this.g, P = g.player; if (!P?.alive) return;
    const tx = P.inVehicle ? P.inVehicle.x : P.x, tz = P.inVehicle ? P.inVehicle.z : P.z;
    for (const m of this.movers) {
      if (!m.live || m.kind !== 'hunters') continue;
      for (const q of m.people) {
        const c = q.c; if (!c?.alive || Math.hypot(c.x - tx, c.z - tz) > GUILD.sightR) continue;
        if (!(c.inVehicle || P.inVehicle ? g.los(c.x, c.z, tx, tz) : g.sees(c, P))) continue;
        if (!(now - (m.sawH ?? -9) < 0.05)) { m.sawH = now; this.seen(m.holder, 'the road', tx, tz, 'player', this.youName()); }
        const b = m.contract ? this.bounty(m.contract) : null;
        if ((b && b.target.kind === 'player' && b.state === 'open') || m.grudge) {
          if (!m.fight) g.emit?.('huntersEngage', { id: m.id, contract: m.contract ?? null });
          m.fight = true;
          for (const r of m.people) if (r.c?.alive) { if (r.c.inVehicle) g.seats.leave(r.c); r.c.target = P; }
        }
        break;
      }
    }
  }
  // One game hour of every place (and the day's decisions at the place's day hour).
  hour(h) {
    const day = Math.floor(h / 24), hr = h - day * 24;
    for (const p of this.places.values()) {
      if (p.pop <= 0 && !p.garrison) continue;
      const K = PLACE_KINDS[p.kind] ?? PLACE_KINDS.landmark, P = p.problem ? PROBLEMS[p.problem.kind] : null;
      // eat, make
      let short = 0;
      for (const gd of Object.keys(GOODS)) {
        const make = (K.make[gd] ?? 0) * p.pop / 24 * (p.fallen ? 0.5 : 1) * (P?.stops === gd ? 0 : 1);
        const eat = (GOODS[gd].eat ?? 0) * p.pop / 24;
        p.stock[gd] = (p.stock[gd] ?? 0) + make - eat;
        if (p.stock[gd] < 0) { short += -p.stock[gd]; p.stock[gd] = 0; }
      }
      if (short > 0) p.pop = Math.max(0, p.pop - Math.min(p.pop * 0.004, short * 0.2)); // the hungry leave or die
      // the problem's hour
      if (P) {
        p.problem.sev = Math.min(1, p.problem.sev + P.grows / 24);
        if (P.kills) p.pop = Math.max(0, p.pop - p.pop * P.kills * p.problem.sev / 24);
        if (P.heals?.meds && (p.stock.meds ?? 0) >= 0.25) { p.stock.meds -= 0.25; p.problem.sev = Math.max(0, p.problem.sev - P.heals.meds / 6); }
        if (p.problem.sev <= 0.01 && P.grows > 0) p.problem = null;
      }
    }
    if (hr === R.dayHour) this.day(day);
  }
  day(day) {
    this.stats.days++;
    const busy = () => this.movers.filter((m) => m.state === 'road' && m.kind !== 'hunters').length >= R.maxMovers;
    for (const p of this.places.values()) {
      if (p.pop <= 0) continue;
      const rng = rngOf(hash32(p.seed, day, 0x44415953));
      this.reprice(p);
      // a nest that has eaten the place: it falls to the infected
      if (p.problem?.kind === 'nest' && p.pop < p.pop0 * 0.25 && !p.fallen) this.fall(p, { kind: 'faction', id: 'infected', name: 'the infected' }, p.arcRow, null);
      // troubles rise on their own (a place far beyond the world keeps its own troubles, but sends nobody)
      if (p.problem && this.hours() - p.problem.since > (p.problem.lasts ?? 9) * 24) { const o = p.problem.other ? this.place(p.problem.other) : null; if (o?.problem?.other === p.id) o.problem = null; p.problem = null; } // it ran its course
      if (!p.problem && !p.fallen) for (const [kind, P] of Object.entries(PROBLEMS)) if (rng() < P.chance) { this.trouble(p, kind, rng); break; }
      if (p.beyond || busy() || this.hold) continue; // hold: nobody sends (a staged test)
      // the day's sending
      if (this.raids(p) && p.pop > ECON.raidMin + 4 && rng() < ECON.raidChance && !this.movers.some((m) => m.from === p.id && m.kind === 'raiders' && m.state === 'road')) this.raid(p, null, rng);
      else if (!this.movers.some((m) => m.from === p.id && m.kind === 'trader' && m.state === 'road')) this.trade(p, rng);
      if (p.problem?.kind === 'feud' && rng() < 0.3) { const o = this.place(p.problem.other); if (o && !o.fallen) this.raid(p, o, rng, true); }
      if (p.problem?.kind === 'cache' && !p.problem.sought && rng() < ECON.seekChance) { const t = this.nearestPlace(p.x, p.z, 30000, (q) => q.kind === 'town' && q !== p); if (t) { p.problem.sought = true; this.send('seekers', t, p, { arc: p.arc, cause: p.arcRow }); } }
    }
  }

  // ---- events -------------------------------------------------------------------------------------------------------------
  // A trouble comes to a place: a chronicle row that starts (or carries on) its story, and a fact the place holds.
  trouble(p, kind, rng = Math.random, other = null) {
    const P = PROBLEMS[kind]; if (!P) return null;
    if (kind === 'feud' && !other) { const L = this.linksOf(p).map((id) => this.place(id)).filter((q) => q && !q.fallen && q.pop > 0 && !q.problem); other = L.length ? pick(rng, L) : null; if (!other) return null; }
    p.problem = { kind, sev: kind === 'feud' || kind === 'cache' ? 0.5 : 0.2, since: this.hours(), other: other?.id ?? null, lasts: roll(rng, P.lasts) };
    const row = this.story(p, 'trouble', { problem: P.name.replace(/^\w/, (m) => m.toUpperCase()) }, { arc: p.arc, other, word: fill(P.word, { place: p.name, other: other?.name ?? '' }) });
    if (kind === 'feud' && other) {
      other.problem = { kind, sev: 0.5, since: this.hours(), other: p.id, lasts: p.problem.lasts }; other.arc = p.arc; other.arcRow = p.arcRow;
      // a feud draws allies: each side asks a place its owner holds (or a neighbour) for guns
      for (const [a, b] of [[p, other], [other, p]]) {
        const friend = this.linksOf(a).map((id) => this.place(id)).find((q) => q && q !== b && !q.fallen && q.pop > 20 && (q.owner.id === a.owner.id || q.owner.kind === a.owner.kind));
        if (friend && rng() < ECON.allyChance) this.send('allies', friend, a, { arc: p.arc, cause: p.arcRow });
      }
    }
    if (kind === 'sickness') this.stats.sick++;
    return row;
  }
  // Send the surplus a neighbour pays most for.
  trade(p, rng) {
    let best = null;
    for (const gd of Object.keys(GOODS)) {
      const spare = (p.stock[gd] ?? 0) - this.wants(p, gd) * ECON.surplus;
      if (spare < 3) continue;
      for (const id of this.linksOf(p)) {
        const q = this.place(id); if (!q || q.fallen || q.pop <= 0 || q.beyond || this.raids(q)) continue;
        const gain = (q.price[gd] - p.price[gd]) * Math.min(spare, MOVERS.trader.cargo);
        if (gain > 2 && (!best || gain > best.gain)) best = { gd, q, n: Math.floor(Math.min(spare, MOVERS.trader.cargo)), gain };
      }
    }
    if (!best) return null;
    p.stock[best.gd] -= best.n; // the goods leave this place's stock now: they are on the truck (law 2)
    const m = this.send('trader', p, best.q, { cargo: { [best.gd]: best.n }, rng });
    this.stats.traders++;
    return m;
  }
  raid(p, target = null, rng = Math.random, feud = false) {
    if (!target) {
      let bd = -1;
      for (const id of this.linksOf(p)) {
        const q = this.place(id); if (!q || q.fallen || q.pop <= 0 || q.beyond || this.raids(q)) continue;
        const loot = Object.values(q.stock).reduce((s, v) => s + v, 0), w = loot / Math.max(4, this.defense(q));
        if (w > bd) { bd = w; target = q; }
      }
    }
    if (!target) return null;
    const M = MOVERS.raiders, n = Math.min(M.people[1], Math.max(M.people[0], Math.floor(p.pop - ECON.raidMin)));
    if (n < M.people[0]) return null;
    p.pop -= n;
    const row = this.story(target, 'raidout', { n, from: p.name }, { arc: target.arc ?? p.arc, other: p, quiet: true });
    const m = this.send('raiders', p, target, { n, arc: row.arc, cause: row.seq, rng });
    m.feud = feud;
    this.stats.raids++;
    return m;
  }
  // A party leaves `from` for `to` on the road between them. It takes the place's fresh news and its board's postings.
  send(kind, from, to, o = {}) {
    const m = this.newMover(kind, from, to, o);
    this.carryOut(m, from);
    const P = from.problem;
    if (P && PROBLEMS[P.kind].spreads && (o.rng ?? Math.random)() < P.sev) m.sick = { from: from.id, arc: from.arc, cause: from.arcRow };
    return m;
  }
  newMover(kind, from, to, { rng = null, n = null, cargo = null, arc = null, cause = null, stay = false, at = null } = {}) {
    const M = MOVERS[kind], id = `m${++this.nid}`;
    rng ??= rngOf(hash32(this.nid * 977, Math.round(this.hours() * 10), 0x4d4f5645));
    const count = n ?? iroll(rng, M.people);
    const m = { id, kind, from: from.id, to: to.id, home: from.id, state: stay ? 'stay' : 'road', arc, cause, born: this.hours(), lastH: this.hours(), s: 0, route: null, live: false,
      people: [], cargo: cargo ?? {}, coin: kind === 'refugees' ? 0 : iroll(rng, [10, 60]), sick: null, car: M.on === 'drive' ? { type: M.car, v: null, fuel: 1 } : null, holder: `m:${id}`, x: at?.x ?? from.x, z: at?.z ?? from.z, seed: hash32(this.nid, 17, 0x4d56) };
    for (let i = 0; i < count; i++) m.people.push({ n: i, name: M.names[Math.min(i, M.names.length - 1)], flag: this.g.randomFlag(rngOf(hash32(m.seed, i, 5))), hp: 100, weapon: M.weapon[i % M.weapon.length] ?? null, dead: false, c: null });
    this.k.holder(m.holder, { name: m.people[0]?.name ?? kind, kind: 'person', x: m.x, z: m.z, cap: 24 });
    if (!stay) this.routeTo(m, m.x, m.z, to.x, to.z);
    this.movers.push(m);
    this.g.emit?.('moverOut', { id, kind, from: from.id, to: to.id, people: count });
    return m;
  }
  // The road from (ax, az) to (bx, bz): a corridor that passes near both ends carries the middle of it (in the lane for
  // the way it goes; walkers on the shoulder); otherwise the straight track across the land.
  routeTo(m, ax, az, bx, bz) {
    const pts = [ax, az], walk = MOVERS[m.kind].on === 'walk';
    for (const c of this.g.pulls.cors()) {
      const pa = c.project?.(ax, az, 3000), pb = c.project?.(bx, bz, 3000);
      if (!pa || !pb || pa.d > 3000 || pb.d > 3000 || Math.abs(pa.s - pb.s) < 900) continue;
      const dir = Math.sign(pb.s - pa.s), hw = this.g.pulls.halfW(c), u = dir * (walk ? hw + 2.4 : hw * 0.5);
      for (let s = pa.s; dir > 0 ? s < pb.s : s > pb.s; s += dir * 300) { const f = c.at(Math.max(0, Math.min(c.L, s))); pts.push(f.x + f.nx * u, f.z + f.nz * u); }
      const f = c.at(Math.max(0, Math.min(c.L, pb.s))); pts.push(f.x + f.nx * u, f.z + f.nz * u);
      m.cor = c.id;
      break;
    }
    pts.push(bx, bz);
    const cum = [0]; for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
    m.route = { pts, cum, L: cum[cum.length - 1] }; m.s = 0; m.state = 'road';
  }
  // A point on the route at s (writes into out; no allocation on the per-frame path).
  at(m, s, out = _p) {
    if (!m.route) { out.x = m.x; out.z = m.z; out.tx = 0; out.tz = 1; return out; } // staying put (hunters at a hall)
    const { pts, cum, L } = m.route; s = Math.max(0, Math.min(L, s));
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / seg, ax = pts[(i - 1) * 2], az = pts[(i - 1) * 2 + 1], bx = pts[i * 2], bz = pts[i * 2 + 1];
    out.x = ax + (bx - ax) * t; out.z = az + (bz - az) * t; out.tx = (bx - ax) / seg; out.tz = (bz - az) / seg;
    return out;
  }
  // How far along its route a point is (the nearest segment within a few of the record's own).
  project(m, x, z) {
    if (!m.route) return 0;
    const { pts, cum } = m.route;
    let i0 = 1; while (i0 < cum.length - 1 && cum[i0] < m.s) i0++;
    let best = m.s, bd = Infinity;
    for (let i = Math.max(1, i0 - 2); i < Math.min(cum.length, i0 + 3); i++) {
      const ax = pts[(i - 1) * 2], az = pts[(i - 1) * 2 + 1], bx = pts[i * 2], bz = pts[i * 2 + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < bd) { bd = d; best = cum[i - 1] + t * Math.sqrt(l2); }
    }
    return best;
  }

  // One party forward on the world clock: off screen at its bodies' pace; on screen the bodies set where it is.
  advance(m, dh, now) {
    if (m.state === 'gone') { if (m.live && this.far(m)) this.demote(m); return; }
    m.lastH = now;
    if (m.kind === 'hunters') this.hunt(m, now);
    if (m.state === 'road' && m.route) {
      const lead = m.people.find((q) => q.c?.alive);
      if (m.live && lead) {
        const b = lead.c.inVehicle ?? lead.c; m.s = Math.max(m.s, this.project(m, b.x, b.z)); m.x = b.x; m.z = b.z;
      } else if (!m.live) {
        const start = this.at(m, 0);
        if (!(m.s < 1 && this.g.pulls.inView(start.x, start.z))) m.s += this.pace(MOVERS[m.kind].on) * dh; // not out of the gate while you watch it
        const q = this.at(m, m.s); m.x = q.x; m.z = q.z;
      }
      const end = this.at(m, m.route.L);
      if (m.s >= m.route.L - 1 || Math.hypot(m.x - end.x, m.z - end.z) < R.arriveR) this.arrive(m);
      else if (m.kind === 'refugees' && now >= (m.campAt ??= m.born + roll(rngOf(m.seed), R.campAfter))) this.makeCamp(m);
    }
    const H = this.k.holders.get(m.holder); if (H) { H.x = m.x; H.z = m.z; }
    if (!m.people.some((q) => !q.dead)) { m.state = 'gone'; }
  }
  arrive(m) {
    const to = this.place(m.to), from = this.place(m.from);
    if (!to) { m.state = 'gone'; return; }
    this.carryIn(m, to);
    const alive = m.people.filter((q) => !q.dead).length;
    if (m.sick && !to.problem) { to.arc = m.sick.arc ?? to.arc; to.arcRow = m.sick.cause ?? to.arcRow; this.trouble(to, 'sickness'); this.story(to, 'sickened', { from: this.place(m.sick.from)?.name ?? 'the road' }, { arc: to.arc, cause: m.sick.cause }); m.sick = null; }
    if (m.kind === 'trader' && !m.back) {
      let taken = 0;
      if (to.problem?.kind === 'toll') for (const gd in m.cargo) { const t = Math.floor(m.cargo[gd] * PROBLEMS.toll.takes); m.cargo[gd] -= t; taken += t; }
      for (const gd in m.cargo) {
        const n = m.cargo[gd]; if (!n) continue;
        const cost = Math.min(to.coin, Math.round(n * to.price[gd]));
        to.stock[gd] = (to.stock[gd] ?? 0) + n; to.coin -= cost; m.coin += cost; m.sold = { gd, n, cost, taken };
        this.story(to, 'traded', { n, good: GOODS[gd].name, from: from?.name ?? 'the road' }, { arc: null, quiet: true });
        m.cargo[gd] = 0;
      }
      this.reprice(to);
      this.g.emit?.('moverArrived', { id: m.id, kind: m.kind, to: to.id, sold: m.sold ?? null });
      if (from) { m.back = true; m.from = to.id; m.to = from.id; this.routeTo(m, m.x, m.z, from.x, from.z); this.carryOut(m, to); return; }
    } else if ((m.kind === 'trader' || m.kind === 'seekers') && m.back) { to.coin += m.coin; m.coin = 0; for (const gd in m.cargo) to.stock[gd] = (to.stock[gd] ?? 0) + m.cargo[gd]; m.cargo = {}; }
    else if (m.kind === 'raiders' && !m.back) { this.battle(m, to, from); return; }
    else if (m.kind === 'raiders' && m.back) { for (const gd in m.cargo) to.stock[gd] = (to.stock[gd] ?? 0) + m.cargo[gd]; to.pop += alive; m.cargo = {}; }
    else if (m.kind === 'refugees') {
      to.pop += alive; for (const gd in m.cargo) to.stock[gd] = (to.stock[gd] ?? 0) + m.cargo[gd]; to.coin += m.coin;
      const row = this.story(to, 'joined', { from: from?.name ?? 'the road' }, { arc: m.arc, cause: m.cause });
      this.postFor(m, to, row);
    } else if (m.kind === 'allies') { to.guard += alive; this.story(to, 'allied', { from: from?.name ?? 'a friend' }, { arc: m.arc ?? to.arc, cause: m.cause }); }
    else if (m.kind === 'seekers' && !m.back) {
      const rng = rngOf(m.seed);
      if (to.problem?.kind === 'cache') { to.problem = null; if (rng() < 0.5) m.cargo = { ammo: iroll(rng, [6, 20]), scrap: iroll(rng, [4, 12]), meds: iroll(rng, [0, 4]) }; }
      if (from) { this.goHome(m, from); this.carryOut(m, to); return; } // home with what they dug
    } else if (m.kind === 'hunters') { m.state = 'stay'; m.at = to.id; this.carryOut(m, to); return; }
    this.g.emit?.('moverArrived', { id: m.id, kind: m.kind, to: to.id });
    m.state = 'gone';
  }
  // The raid, fought where it lands (by the record: the people there are its defenders).
  battle(m, to, from) {
    const rng = rngOf(hash32(m.seed, 31, 0x46494748));
    const n = m.people.filter((q) => !q.dead).length, att = n * 4 * roll(rng, [0.7, 1.3]), def = Math.max(1, this.defense(to));
    const lostA = Math.min(n - 1, Math.round(n * 0.4 * Math.min(1.5, def / att) * rng()));
    for (let i = 0, k = 0; i < m.people.length && k < lostA; i++) if (!m.people[i].dead && i > 0) { m.people[i].dead = true; m.people[i].hp = 0; k++; }
    to.raidedAt = this.hours(); this.dirty = true;
    if (att <= def) {
      const row = this.story(to, 'repelled', { from: from?.name ?? 'raiders' }, { arc: m.arc, cause: m.cause, other: from });
      to.pop = Math.max(0, to.pop - Math.round(rng() * 2));
      this.goHome(m, from); return row;
    }
    const lost = Math.min(Math.round(to.pop * 0.3), Math.max(1, Math.round((att / def) * to.pop * 0.08)));
    to.pop = Math.max(0, to.pop - lost);
    const share = Math.min(0.6, 0.3 * att / def); let took = 0;
    const room = MOVERS.raiders.cargo;
    for (const gd of Object.keys(GOODS)) { const t = Math.min(room - took, Math.floor((to.stock[gd] ?? 0) * share)); if (t > 0) { to.stock[gd] -= t; m.cargo[gd] = (m.cargo[gd] ?? 0) + t; took += t; } }
    const raided = this.story(to, 'raided', { from: from?.name ?? 'raiders', lost, took }, { arc: m.arc, cause: m.cause, other: from });
    this.stats.raidsHit = (this.stats.raidsHit ?? 0) + 1;
    if (att > def * 1.6 || to.pop * (PLACE_KINDS[to.kind]?.guard ?? 0.2) < 4) {
      // it falls: the raiders hold it (the boss stays as its master), the rest walk out
      const boss = m.people[0];
      to.garrison = { name: boss.name === 'Raid boss' ? `${pick(rng, GUILD.hunterNames)} ${pick(rng, ['the Knife', 'Cutter', 'Two-Guns', 'the Mule', 'Sixgun'])}` : boss.name, flag: boss.flag, n: m.people.filter((q) => !q.dead).length, alive: true, bounty: null, c: null, guards: [] };
      for (const gd in m.cargo) to.stock[gd] = (to.stock[gd] ?? 0) + m.cargo[gd];
      m.cargo = {};
      this.fall(to, from?.owner ?? { kind: 'faction', id: 'dustwolves', name: 'The Dustwolves' }, raided.seq, m.arc);
      to.pop += to.garrison.n;
      m.state = 'gone';
      return raided;
    }
    this.goHome(m, from);
    return raided;
  }
  goHome(m, from) { if (!from) { m.state = 'gone'; return; } m.back = true; m.from = m.to; m.to = from.id; this.routeTo(m, m.x, m.z, from.x, from.z); }
  // A place falls: a new owner, a chronicle row, and the people who will not live under it walk out toward a town.
  fall(p, owner, cause, arc) {
    p.fallen = true; p.owner = { ...owner }; p.problem = p.problem?.kind === 'nest' ? p.problem : null; this.stats.falls++; this.dirty = true;
    const row = this.story(p, 'fell', { owner: owner.name }, { arc: arc ?? p.arc, cause, word: `${p.name} has fallen to ${owner.name}. Those who could walked out` });
    // a falling place calls on the radio while it has a set
    const f = this.k.fact(row.fact); if (f && (this.k.holders.get(p.holder)?.radio)) this.k.broadcast(f, p.x, p.z, CHANNELS.radio.range, `a voice from ${p.name}`);
    const rng = rngOf(hash32(p.seed, row.seq, 0x464c4545));
    const n = Math.min(MOVERS.refugees.people[1], Math.max(MOVERS.refugees.people[0], Math.round(p.pop * roll(rng, ECON.fleeShare))));
    if (p.pop < 2) return row;
    const to = this.nearestPlace(p.x, p.z, 40000, (q) => q !== p && q.kind === 'town' && !q.fallen && !q.beyond) ?? this.nearestPlace(p.x, p.z, 40000, (q) => q !== p && !q.fallen && !this.raids(q));
    if (!to) return row;
    p.pop = Math.max(0, p.pop - n);
    const cargo = {}; for (const gd of ['food', 'water', 'meds']) { const t = Math.min(Math.floor(p.stock[gd] ?? 0), 2); cargo[gd] = t; p.stock[gd] -= t; }
    const fled = this.story(to, 'fled', { n, from: p.name }, { arc: row.arc, cause: row.seq, other: p });
    const m = this.newMover('refugees', p, to, { n, cargo, arc: row.arc, cause: fled.seq, rng });
    m.coin = Math.round(p.coin * 0.3); p.coin -= m.coin;
    m.people[0].name = `${pick(rng, ['Ada', 'Ruben', 'Lucia', 'Wen', 'Mara', 'Dale', 'Ines', 'Tobiah'])} ${pick(rng, GUILD.surnames)}`;
    m.raidedBy = p.garrison ? { place: p.id, name: p.garrison.name } : null;
    this.carryOut(m, p);
    this.stats.refugees++;
    return row;
  }
  // Refugees who have walked as far as they will: they stop and make a camp where they stand, a place of its own.
  makeCamp(m) {
    const from = this.place(m.from), g = this.g;
    if (this.g.pulls.inView(m.x, m.z) && !m.live) return; // they stop where you are not looking... or in front of you, as people (live)
    if (this.nearestPlace(m.x, m.z, 400)) return; // too near a place: they walk on
    if (this.places.size >= R.maxPlaces) return;
    const id = `refuge_${++this.nid}`, alive = m.people.filter((q) => !q.dead);
    const p = this.addPlace({ id, name: `${from?.name ?? 'Refugee'} Camp`, kind: 'refuge', x: m.x, z: m.z, half: 30, holder: `site:${id}`, walls: 'none', owner: { kind: 'family', id: null, name: `the ${m.people[0].name.split(' ').pop()} family` }, pop: [0, 0], camp: { from: m.from, h: this.hours() } });
    p.pop = p.pop0 = alive.length; p.coin = m.coin; for (const gd of Object.keys(GOODS)) p.stock[gd] = m.cargo[gd] ?? 0; this.reprice(p);
    for (const q of this.places.values()) q.links = null;
    this.carryIn(m, p);
    const row = this.story(p, 'camped', { from: from?.name ?? 'the road' }, { arc: m.arc, cause: m.cause });
    this.postFor(m, p, row);
    this.stats.camps++;
    m.state = 'gone';
    if (m.live) for (const q of m.people) if (q.c) { q.c.storyCamp = id; q.c.home = { x: q.c.x, z: q.c.z }; } // they stay where they stopped
    g.emit?.('campMade', { id, from: m.from, people: alive.length });
    return p;
  }
  // The leader of the people a raid drove out posts the raid boss's name with the Tally, out of what they carried.
  postFor(m, at, row) {
    const R0 = m.raidedBy; if (!R0) return null;
    const p = this.place(R0.place); if (!p?.garrison?.alive || p.garrison.bounty) return null;
    const rng = rngOf(hash32(m.seed, 77, 1)), pay = Math.min(Math.max(20, at.coin), iroll(rng, GUILD.pay.raid));
    const b = this.post({ target: { kind: 'npc', place: p.id, name: p.garrison.name }, by: { name: m.people[0].name, place: at.id }, deed: { seq: row.seq, verb: 'raid', text: `the raid on ${p.name}` }, pay, arc: m.arc, cause: row.seq });
    if (b.ok) p.garrison.bounty = b.bounty.id;
    return b;
  }

  // ---- the story ----------------------------------------------------------------------------------------------------------
  // A chronicle row (src 'story'; a = the arc), the arc's own record of it with its cause, and (for a telling event) a fact
  // the place holds. Returns { seq, arc, fact }.
  story(p, v, words, { arc = null, cause = null, other = null, quiet = false, word = null } = {}) {
    const g = this.g, V = STORY_VERBS[v];
    const text = word ?? fill(V.say, { place: p.name, owner: p.owner?.name, ...words });
    let A = arc ? this.arcs.find((a) => a.id === arc) : null;
    if (!A && v !== 'traded') { A = { id: `arc${this.arcs.length + 1}`, title: text, place: p.id, rows: [], h: this.hours() }; this.arcs.push(A); if (this.arcs.length > 200) this.arcs.shift(); }
    const rec = g.society.chronicle.add({ t: +(g.time ?? 0).toFixed(2), day: g.society.day, hr: +(g.sky?.time ?? 0).toFixed(2), a: A ? `arc:${A.id}` : 'arc:', af: p.owner?.id ?? '', v, o: other?.id ?? '', on: p.name, of: other?.owner?.id ?? '', p: p.id,
      x: +p.x.toFixed(1), z: +p.z.toFixed(1), m: V.m, w: [], ws: 0, un: 0, k: 0, src: 'story' });
    const out = { seq: rec.seq, arc: A?.id ?? null, fact: null };
    if (A) { A.rows.push({ seq: rec.seq, v, text, place: p.id, placeName: p.name, cause: cause ?? A.rows[A.rows.length - 1]?.seq ?? null, h: r1(this.hours()) }); p.arc = A.id; p.arcRow = rec.seq; }
    if (!quiet && V.m >= 2) {
      const f = this.k.record({ what: 'story', subject: A ? `arc:${A.id}` : null, text, where: { x: p.x, z: p.z, place: p.name }, who: p.owner?.name ?? null, data: { place: p.id, v, seq: rec.seq } });
      this.k.see(p.holder, f, null);
      out.fact = f.id;
    }
    g.emit?.('story', { v, place: p.id, arc: out.arc, seq: rec.seq, text });
    return out;
  }
  // What a party takes with it from a place: the place's fresh news (said) and every posting on its board (read there).
  carryOut(m, p) {
    const K = this.k, H = K.holder(m.holder), now = this.hours(), src = K.holders.get(p.holder), bd = K.holders.get(this.boardOf(p));
    if (src) for (const c of src.facts) if (now - c.heard < R.freshH && (c.what === 'story' || c.what === 'sighting' || c.what === 'posting')) K.tell(p.holder, m.holder, c.id, 'said', { force: true });
    if (bd) for (const c of bd.facts) if (c.what === 'posting' || c.what === 'outcome') K.put(m.holder, K.fact(c.id) ?? c, { channel: 'board', from: bd.id, fromName: bd.name }, c.conf * CHANNELS.board.conf, c.hops + 1);
    H.x = m.x; H.z = m.z;
  }
  // ...and what it tells where it arrives: the news to the place's people, the postings pinned on its board.
  carryIn(m, p) {
    const K = this.k, H = K.holders.get(m.holder); if (!H) return;
    const lead = m.people.find((q) => !q.dead)?.name ?? MOVERS[m.kind].names[0];
    for (const c of H.facts) {
      const f = K.fact(c.id) ?? c;
      if (c.what === 'posting' || (c.what === 'outcome' && c.subject?.startsWith('bounty:'))) K.put(this.boardOf(p), { ...f, where: c.where, when: c.when, text: c.text }, { channel: 'said', from: m.holder, fromName: lead }, c.conf * CHANNELS.said.conf, c.hops + 1);
      if (c.what === 'story' || c.what === 'sighting' || c.what === 'posting') K.put(p.holder, { ...f, where: c.where, when: c.when, text: c.text }, { channel: 'said', from: m.holder, fromName: lead }, c.conf * CHANNELS.said.conf, c.hops + 1);
    }
  }

  // ---- you, seen --------------------------------------------------------------------------------------------------------
  // A town (or any peopled place) you stand in sees you: a sighting it holds (and the grapevine and travellers carry on).
  sightings(now) {
    const p = this.g.player; if (!p?.alive) return;
    const me = this.g.pulls.me();
    const q = this.nearestPlace(me.x, me.z, GUILD.townSeesR, (x) => x.pop > 0);
    if (!q || (now - q.lastSight < GUILD.sightEvery && Math.hypot(me.x - (q.lastAt?.x ?? 1e9), me.z - (q.lastAt?.z ?? 1e9)) < 250 && now >= q.lastSight)) return;
    q.lastSight = now; q.lastAt = { x: me.x, z: me.z };
    this.seen(q.holder, q.name, me.x, me.z, 'player', this.youName());
    this.stats.sightings++;
  }
  seen(hid, placeName, x, z, who, whoName) {
    const f = this.k.record({ what: 'sighting', subject: `sight:${who}`, text: GUILD_WORDS.sighting({ who: whoName, place: placeName }), where: { x, z, place: placeName }, who: whoName, data: { who } });
    return this.k.see(hid, f, { x, z });
  }
  youName() { const n = this.g.creator?.P?.name ?? this.g.player?.name; return n && n !== 'You' ? n : 'the stranger from Rust Haven'; }
  // Standing in a place, its people tell you its own news (said, by the place's name).
  hereNews() {
    const me = this.g.pulls.me(), q = this.nearestPlace(me.x, me.z, R.hereR); if (!q) return;
    const H = this.k.holders.get(q.holder); if (!H) return;
    for (const c of H.facts) if (c.what === 'story' && this.k.fact(c.id)?.data?.place === q.id && !this.k.holds('player', c.id)) this.k.tell(q.holder, 'player', c.id, 'said', { force: true });
  }

  // ---- the Tally ----------------------------------------------------------------------------------------------------------
  // A bounty: posted by a real person or place for a real deed (a chronicle row), paid out of the poster's real purse into
  // the guild's escrow, pinned on the poster's board (and the hall's, if it is a hall town). Nobody else knows until a
  // traveller carries it.
  post({ target, by, deed, pay, arc = null, cause = null }) {
    const g = this.g, at = this.place(by.place);
    if (!at) return { ok: false, why: `no place ${by.place}` };
    if (!deed?.seq) return { ok: false, why: 'a bounty needs a real deed (a chronicle row)' };
    const row = g.society.chronicle.query({ since: deed.seq - 1, limit: 400 }).find((r) => r.seq === deed.seq) ?? this.arcs.flatMap((a) => a.rows).find((r) => r.seq === deed.seq);
    if (!row) return { ok: false, why: `no chronicle row ${deed.seq}` };
    if (target.kind === 'player' && row.a !== 'player') return { ok: false, why: `row ${deed.seq} is not your deed` };
    if (this.bounties.some((b) => b.state === 'open' && b.deed.seq === deed.seq && b.target.kind === target.kind && (b.target.place ?? null) === (target.place ?? null))) return { ok: false, why: 'that deed is already on the board' };
    pay = Math.round(Math.min(pay, Math.max(0, at.coin)));
    if (pay < 10) return { ok: false, why: `${at.name} cannot pay a bounty (${Math.round(at.coin)} in its chest)` };
    at.coin -= pay;
    const id = `b${++this.nid}`;
    const b = { id, target: { ...target }, by: { ...by, placeName: at.name }, deed: { ...deed }, pay, escrow: pay, state: 'open', posted: this.hours(), takers: [], claimedBy: null, killedBy: null, arc, fact: null };
    const f = this.k.record({ what: 'posting', subject: `bounty:${id}`, text: GUILD_WORDS.posting({ by: by.name, target: target.name, deed: deed.text, pay }), where: { x: at.x, z: at.z, place: at.name }, who: target.name, life: STORY_FACT_KINDS.posting.life, data: { bounty: id, target: target.kind === 'player' ? 'player' : `npc:${target.place}` } });
    b.fact = f.id;
    this.k.put(this.boardOf(at), f, { channel: 'board', from: at.holder, fromName: by.name }, 1, 0);
    this.k.put(at.holder, f, { channel: 'said', from: at.holder, fromName: by.name }, 1, 0);
    if (this.isHall(at.id)) this.k.put(`hall:${at.id}`, f, { channel: 'board', from: this.boardOf(at), fromName: by.name }, 1, 0);
    this.bounties.push(b);
    this.story(at, 'posted', { by: by.name, pay, target: target.name }, { arc, cause: cause ?? deed.seq, quiet: true });
    this.stats.posted++;
    this.dirty = true;
    this.g.emit?.('bountyPosted', { id, target: target.name, by: by.name, at: at.id, pay });
    return { ok: true, bounty: b };
  }
  bounty(id) { return this.bounties.find((b) => b.id === id) ?? null; }
  // The hall at a town (within its reach): the Tally House you stand in, or null.
  hallAt(x, z) { for (const id of this.halls) { const p = this.place(id); if (p && Math.hypot(p.x - x, p.z - z) < GUILD.townSeesR) return p; } return null; }
  townAt(x, z) { return this.nearestPlace(x, z, GUILD.townSeesR); }
  // You take a bounty you have read on the board where you stand.
  take(id) {
    const b = this.bounty(id); if (!b) return { ok: false, why: `no bounty ${id}` };
    const me = this.g.pulls.me(), t = this.townAt(me.x, me.z);
    if (!t || !this.k.holds(this.boardOf(t), b.fact)) return { ok: false, why: 'take it at a board that has it pinned (you are not standing at one)' };
    if (b.state !== 'open') return { ok: false, why: `the bounty is ${b.state}` };
    if (b.target.kind === 'player') return { ok: false, why: 'that is your own name' };
    this.k.put('player', this.k.fact(b.fact), { channel: 'board', from: this.boardOf(t), fromName: `the ${t.name} board` }, 1, 0);
    if (!b.takers.includes('player')) b.takers.push('player');
    return { ok: true, bounty: this.bview(b) };
  }
  // Collect: the mark is dead by your hand; at a Tally House the escrow is paid out, less the guild's cut.
  claim(id) {
    const b = this.bounty(id); if (!b) return { ok: false, why: `no bounty ${id}` };
    const me = this.g.pulls.me(), h = this.hallAt(me.x, me.z);
    if (!h) return { ok: false, why: 'collect at a Tally House' };
    if (b.state !== 'open' || b.killedBy !== 'player') return { ok: false, why: b.killedBy ? `${b.killedBy} did the deed` : 'the mark still lives' };
    const out = Math.round(b.escrow * (1 - GUILD.cut));
    this.g.cash += out; b.escrow = 0; b.state = 'claimed'; b.claimedBy = 'player'; this.stats.claimed++;
    this.closed(b, h, GUILD_WORDS.claimed({ target: b.target.name, who: this.youName() }), 'claimed', { who: this.youName(), target: b.target.name });
    return { ok: true, paid: out };
  }
  // Pay your own name off the board, at a Tally House: the poster gets the bounty back and more, the guild its cut.
  payOff(id) {
    const b = this.bounty(id); if (!b) return { ok: false, why: `no bounty ${id}` };
    if (b.target.kind !== 'player') return { ok: false, why: 'only the one named can pay a bounty off' };
    if (b.state !== 'open') return { ok: false, why: `the bounty is ${b.state}` };
    const me = this.g.pulls.me(), h = this.hallAt(me.x, me.z);
    if (!h) return { ok: false, why: 'pay it off at a Tally House' };
    const cost = Math.round(b.pay * GUILD.payOff);
    if (this.g.cash < cost) return { ok: false, why: `it costs $${cost}; you have $${this.g.cash}` };
    this.g.cash -= cost;
    const poster = this.place(b.by.place); if (poster) poster.coin += b.escrow + Math.round(cost * (1 - GUILD.cut));
    b.escrow = 0; b.state = 'paid'; this.stats.paid++;
    this.closed(b, h, GUILD_WORDS.paid({ target: b.target.name }), 'paid', { target: b.target.name });
    return { ok: true, cost };
  }
  // A closed bounty is a fact like any other: struck at the hall where it happened; hunters stop only when they hear it.
  closed(b, at, text, v, words) {
    const f = this.k.record({ what: 'outcome', subject: `bounty:${b.id}`, text, where: { x: at.x, z: at.z, place: at.name }, who: b.target.name, data: { bounty: b.id, state: b.state } });
    b.closedFact = f.id;
    this.k.put(this.boardOf(at), f, { channel: 'board', from: `hall:${at.id}`, fromName: GUILD.hallName }, 1, 0);
    if (this.isHall(at.id)) this.k.put(`hall:${at.id}`, f, { channel: 'saw', from: `hall:${at.id}` }, 1, 0);
    this.story(at, v, { place: at.name, ...words }, { arc: b.arc, cause: b.deed.seq, quiet: true });
    this.dirty = true;
  }
  // A pair of hunters, each game hour: hear what the hall or the town they stand in holds, pick a contract, and ride on
  // the freshest tip they hold. With no tip they ride their own round of towns (seeded by the pair: never by where you
  // are), asking at each.
  hunt(m, now) {
    if (m.state === 'gone') return;
    if (m.huntH !== undefined && now - m.huntH < GUILD.askEvery) return;
    m.huntH = now;
    const K = this.k, H = K.holder(m.holder), here = m.state === 'stay' ? this.place(m.at ?? m.hall) : null;
    // asking where they stand: the hall's book, the board, the town's talk about their mark
    if (here) {
      if (this.isHall(here.id)) { const hl = K.holders.get(`hall:${here.id}`); if (hl) for (const c of hl.facts) if (!K.holds(m.holder, c.id)) K.tell(hl.id, m.holder, c.id, 'said', { force: true }); }
      const bd = K.holders.get(this.boardOf(here)); if (bd) for (const c of bd.facts) if (!K.holds(m.holder, c.id)) K.put(m.holder, K.fact(c.id) ?? c, { channel: 'board', from: bd.id, fromName: bd.name }, c.conf * CHANNELS.board.conf, c.hops + 1);
    }
    let b = m.contract ? this.bounty(m.contract) : null;
    // a struck name: only when they have heard it (law 6)
    if (b && H.facts.some((c) => c.what === 'outcome' && c.subject === `bounty:${b.id}`)) { m.contract = null; b = null; }
    if (!b && !m.grudge) {
      // a posting they hold, not taken by another pair
      for (const c of H.facts) {
        if (c.what !== 'posting') continue;
        const q = this.bounty(K.fact(c.id)?.data?.bounty); if (!q || q.state !== 'open') continue;
        if (H.facts.some((o) => o.what === 'outcome' && o.subject === `bounty:${q.id}`)) continue;
        if (this.movers.some((o) => o !== m && o.kind === 'hunters' && o.contract === q.id)) continue;
        m.contract = q.id; b = q; if (!q.takers.includes(m.id)) q.takers.push(m.id); break;
      }
    }
    const mark = b ? (b.target.kind === 'player' ? 'player' : `npc:${b.target.place}`) : m.grudge ? 'player' : null;
    if (!mark) { if (m.state === 'stay' && m.at && m.at !== m.hall) { const h = this.place(m.hall); if (h) this.ride(m, h.x, h.z, h.id); } return; }
    // an NPC mark lives at the place it holds: the posting names the place (that is what was written)
    if (mark.startsWith('npc:')) {
      const p = this.place(b.target.place);
      if (m.state === 'stay' && m.at === p?.id) this.collect(m, b, p);
      else if (m.state === 'stay' && p) this.ride(m, p.x, p.z, p.id);
      return;
    }
    if (here) { const hp = K.holders.get(here.holder); if (hp) for (const c of hp.facts) if (c.subject === `sight:${mark}` && !K.holds(m.holder, c.id)) K.tell(hp.id, m.holder, c.id, 'said', { force: true }); }
    // the freshest tip they hold
    let tip = null; for (const c of H.facts) if (c.subject === `sight:${mark}` && now - c.when < GUILD.tipFresh && (!tip || c.when > tip.when)) tip = c;
    m.tip = tip ? { id: tip.id, x: tip.where.x, z: tip.where.z, when: tip.when, from: tip.source.fromName, channel: tip.source.channel } : null;
    if (tip && (m.tipRode ?? -1) < tip.when && Math.hypot(tip.where.x - m.x, tip.where.z - m.z) > GUILD.closeR) {
      m.tipRode = tip.when; const at = this.nearestPlace(tip.where.x, tip.where.z, 1200);
      this.ride(m, tip.where.x, tip.where.z, at?.id ?? null); return;
    }
    if (m.state !== 'stay') return;
    // nothing to go on: ask around a while, then ride the round (the pair's own order; nothing about the mark)
    if (m.waitUntil === null || m.waitUntil === undefined) { m.waitUntil = now + roll(rngOf(hash32(m.seed, m.itin, 9)), GUILD.waitAsk); return; }
    if (now < m.waitUntil) return;
    m.waitUntil = null;
    const round = this.round(m), next = round[m.itin++ % round.length];
    if (next) this.ride(m, next.x, next.z, next.id);
  }
  // The pair's round: their hall's town and the towns linked to it, in an order seeded by the pair alone.
  round(m) {
    if (m.roundIds) return m.roundIds.map((id) => this.place(id)).filter(Boolean);
    const h = this.place(m.hall), out = [h, ...this.linksOf(h).map((id) => this.place(id))].filter((q) => q && q.kind === 'town');
    const rng = rngOf(hash32(m.seed, 0x524f, 1)); for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    m.roundIds = out.map((q) => q.id);
    return out;
  }
  ride(m, x, z, placeId) {
    m.to = placeId ?? m.to; m.at = null;
    if (placeId === null) { const tmp = `spot_${m.id}`; m.to = tmp; this.places.set(tmp, this.places.get(tmp) ?? { id: tmp, name: 'the spot', kind: 'spot', x, z, pop: 0, holder: `site:${tmp}`, stock: {}, price: {}, coin: 0, owner: { kind: 'none', name: 'no one' }, links: [], spot: true, lastSight: -99 }); const s = this.places.get(tmp); s.x = x; s.z = z; }
    this.routeTo(m, m.x, m.z, x, z);
  }
  // At an NPC mark's place: the pair against the garrison (by the record), the mark dead or the pair broken.
  collect(m, b, p) {
    const G = p.garrison; if (!G?.alive) { m.contract = null; return; }
    const rng = rngOf(hash32(m.seed, Math.floor(this.hours()), 0x434f4c));
    const mine = m.people.filter((q) => !q.dead).length * 5, theirs = Math.max(1, G.n) * 2.5;
    if (rng() < mine / (mine + theirs)) {
      G.alive = false; G.n = Math.max(0, G.n - 1); b.killedBy = m.people[0].name; b.state = 'claimed'; b.claimedBy = m.id; b.escrow = 0; this.stats.claimed++;
      this.closed(b, p, GUILD_WORDS.claimed({ target: b.target.name, who: `${m.people[0].name} of the Tally` }), 'claimed', { who: `${m.people[0].name} of the Tally`, target: b.target.name });
      m.contract = null;
    } else { const q = m.people.find((x) => !x.dead); if (q) { q.dead = true; q.hp = 0; } }
  }

  // ---- bodies -------------------------------------------------------------------------------------------------------------
  far(m) { const me = this.g.pulls.me(); return Math.hypot(m.x - me.x, m.z - me.z) > R.demoteR; }
  bodies() {
    const me = this.g.pulls.me(), live = this.movers.filter((m) => m.live).length;
    for (const m of this.movers) {
      const d = Math.hypot(m.x - me.x, m.z - me.z);
      if (!m.live && d < R.promoteR && m.state !== 'gone' && live < R.maxLive && m.people.some((q) => !q.dead)) this.promote(m);
      else if (m.live && d > R.demoteR && !m.people.some((q) => q.c?.inVehicle && q.c.inVehicle === this.g.player.inVehicle)) this.demote(m);
    }
    // a fallen place's master and guards stand in it when you come near (the bounty's mark is a real person)
    for (const p of this.places.values()) {
      const G = p.garrison; if (!G) continue;
      const d = Math.hypot(p.x - me.x, p.z - me.z);
      if (G.alive && !G.c && d < R.promoteR + 60) this.promoteGarrison(p);
      else if (G.c && d > R.demoteR + 80) this.demoteGarrison(p);
    }
  }
  promote(m) {
    const g = this.g, M = MOVERS[m.kind];
    const q = this.at(m, m.s), h = Math.atan2(q.tx, q.tz);
    if (m.car && m.state === 'road') {
      const v = g.vehiclesSys.spawn(m.car.type, q.x, q.z, h, m.kind === 'raiders' ? '#4a2018' : m.kind === 'hunters' ? '#3a3226' : '#6a5030');
      if (v) { v.storyCar = m.id; v.ai = 'story'; m.car.v = v; v.fuel = Math.max(0.2, m.car.fuel ?? 1); g.seats.init?.(v); }
    }
    let i = 0;
    const here = m.state === 'stay' ? this.place(m.at ?? m.hall) : null, spot = here && !here.spot ? this.boardSpot(here) : null; // a pair staying in a town waits by its board
    for (const p of m.people) {
      if (p.dead || p.c) continue;
      const side = (this.movers.filter((o) => o.kind === 'hunters' && o.hall === m.hall).indexOf(m) % 2 ? 1 : -1) * 3.2 + (i - 0.5) * 1.3;
      const back = spot ? { x: spot.x + Math.sin(spot.ry) * 3.6 + Math.cos(spot.ry) * side, z: spot.z + Math.cos(spot.ry) * 3.6 - Math.sin(spot.ry) * side } : this.at(m, m.s - 1.6 * (i + 1), {});
      const c = g.addChar({ x: m.car?.v ? q.x + 2 : back.x, z: m.car?.v ? q.z + 2 : back.z, faction: M.faction, weapon: p.weapon, hp: p.hp, colors: outfit(M.faction, rngOf(hash32(m.seed, p.n, 1))), name: p.name, flag: p.flag });
      if (!c) break;
      c.storyMover = m.id; c.storyM = m; c.storyN = p.n; c.home = { x: c.x, z: c.z }; c.hp = Math.max(1, p.hp);
      if (m.kind === 'hunters') { c.fid = GUILD.id; g.society.factions.assign(c); }
      if (m.car?.v) g.seats.board(c, m.car.v, i < (m.car.v.seats?.length ?? 2) ? i : -1);
      if (spot) c.face = spot.ry;
      g.standOn?.(c);
      p.c = c; i++;
    }
    m.live = true; this.stats.promoted++;
  }
  demote(m) {
    const g = this.g;
    for (const p of m.people) {
      const c = p.c; if (!c) continue;
      p.hp = c.alive ? Math.round(c.hp) : 0; if (!c.alive) p.dead = true;
      if (c.inVehicle) g.seats.leave(c, true);
      if (g.chars.includes(c)) g.removeChar(c);
      p.c = null;
    }
    if (m.car?.v) { const v = m.car.v; m.car.fuel = v.fuel; if (!(v.occ ?? []).some(Boolean)) g.vehiclesSys.remove(v); m.car.v = null; }
    m.live = false;
  }
  // The live car keeps to its route: steer for a point ahead of it, hold the road's pace, back off when stuck.
  steer(m, dt) {
    const v = m.car.v, d = v.driver;
    if (!d?.alive || d.storyMover !== m.id || v.dead) return;
    if (m.fight) { v.throttle = 0; v.handbrake = true; return; }
    const sp = Math.hypot(v.vx, v.vz), s = m.s, end = m.route.L;
    const q = this.at(m, Math.min(end, s + Math.max(14, sp * 1.1)));
    const want = Math.atan2(q.x - v.x, q.z - v.z), diff = Math.atan2(Math.sin(want - v.h), Math.cos(want - v.h));
    const left = Math.hypot(this.at(m, end).x - v.x, this.at(m, end).z - v.z);
    const target = left < 30 ? 0 : Math.min(R.drive, Math.sqrt(2 * 3 * left)) * (Math.abs(diff) > 0.6 ? 0.5 : 1);
    m.stuck = sp < 0.8 && target > 2 ? (m.stuck ?? 0) + dt : 0;
    if (m.stuck > 5) { m.backT = 1.5; m.stuck = 0; }
    if (m.backT > 0) { m.backT -= dt; v.throttle = -1; v.steer = -Math.max(-1, Math.min(1, diff * 2.2)); v.handbrake = false; return; }
    v.steer = Math.max(-1, Math.min(1, diff * 2.2));
    v.throttle = sp > target + 1 ? -0.5 : sp < target - 1 ? 1 : 0.15;
    v.handbrake = target < 0.5 && sp < 1;
  }
  // A body of ours, on foot (ai.js asks first): refugees walk their shoulder; a camp's people stay by their fire.
  think(c, dt) {
    if (c.target || c.flee > 0) return false;
    if (c.storyCamp) { c.speed = 0; return true; }
    if (c.storyGarrison) { c.speed = 0; return true; }
    const m = c.storyM; if (!m) return false;
    if (m.state === 'road' && m.route && !c.inVehicle) {
      const s = this.project(m, c.x, c.z) + 5, q = this.at(m, s);
      this.g.ai.move(c, q.x - c.x, q.z - c.z, R.walk, dt);
      return true;
    }
    c.speed = 0;
    return true;
  }
  promoteGarrison(p) {
    const g = this.g, G = p.garrison, rng = rngOf(hash32(p.seed, 0x47, 1));
    const c = g.addChar({ x: p.x + 3, z: p.z + 3, faction: 'raider', weapon: 'shotgun', hp: 140, colors: outfit('raider', rng), name: G.name, flag: G.flag });
    if (!c) return;
    c.storyGarrison = p.id; c.storyBoss = G.bounty; c.home = { x: c.x, z: c.z }; g.standOn?.(c); G.c = c;
    for (let i = 0; i < Math.min(3, G.n - 1); i++) { const q = g.addChar({ x: p.x + 6 + i * 2, z: p.z - 4, faction: 'raider', weapon: pick(rng, ['smg', 'pistol']), hp: 90, colors: outfit('raider', rng), name: 'Raider', flag: g.randomFlag(rng) }); if (q) { q.storyGarrison = p.id; q.home = { x: q.x, z: q.z }; g.standOn?.(q); G.guards.push(q); } }
  }
  demoteGarrison(p) {
    const g = this.g, G = p.garrison;
    for (const c of [G.c, ...G.guards]) { if (!c) continue; if (!c.alive && c !== G.c) G.n = Math.max(1, G.n - 1); if (g.chars.includes(c)) g.removeChar(c); }
    G.c = null; G.guards = [];
  }
  // A death among ours: a party's person (their record), a fallen place's master (the bounty's mark), a hunter (his partner
  // remembers, and the Tally posts the one who did it).
  onKill(c, attacker) {
    const g = this.g, P = g.player;
    if (c.storyBoss || (c.storyGarrison && this.place(c.storyGarrison)?.garrison?.c === c)) {
      const p = this.place(c.storyGarrison), G = p?.garrison;
      if (G) { G.alive = false; G.n = Math.max(0, G.n - 1); }
      const b = G?.bounty ? this.bounty(G.bounty) : null;
      if (b && b.state === 'open') b.killedBy = attacker === P ? 'player' : attacker?.name ?? 'somebody';
    }
    if (c.storyMover) {
      const m = this.movers.find((x) => x.id === c.storyMover), p = m?.people[c.storyN];
      if (p && !p.dead) { p.dead = true; p.hp = 0; }
      if (m?.kind === 'hunters' && attacker === P) {
        const mate = m.people.find((q) => !q.dead);
        // the partner remembers: he saw who did it if he was there to see, and he keeps after you without a contract
        if (mate) { m.grudge = true; if (mate.c && Math.hypot(mate.c.x - c.x, mate.c.z - c.z) < GUILD.sightR) this.seen(m.holder, 'where his partner fell', P.x, P.z, 'player', this.youName()); }
        const row = this.deedOf(c);
        const hall = this.place(m.hall);
        if (row && hall) { this.story(hall, 'hunterdown', { who: p?.name ?? 'a tallyman', target: this.youName() }, { quiet: true, cause: row.seq }); hall.coin = Math.max(hall.coin, 0) + 400; this.post({ target: { kind: 'player', name: this.youName() }, by: { name: GUILD.name, place: hall.id }, deed: { seq: row.seq, verb: 'kill', text: `killing ${p?.name ?? 'a tallyman'}` }, pay: iroll(rngOf(m.seed), GUILD.pay.hunter) }); }
      } else if (attacker === P && m) {
        // a killing of one of a place's people, seen: the place posts your name
        const row = this.deedOf(c);
        const home = this.place(m.home);
        if (row && row.ws > 0 && home && home.pop > 0 && !this.raids(home)) this.post({ target: { kind: 'player', name: this.youName() }, by: { name: home.name, place: home.id }, deed: { seq: row.seq, verb: 'kill', text: `the killing of ${p?.name ?? 'one of ours'}` }, pay: iroll(rngOf(m.seed), GUILD.pay.kill) });
      }
    }
  }

  // Your deed against this person: the chronicle's row of the killing (a 'silence' when they had seen something of yours).
  deedOf(c) { return this.g.society.chronicle.query({ actor: 'player', limit: 8 }).find((r) => r.o === c.id && (r.v === 'kill' || r.v === 'silence')) ?? null; }

  // ---- what you can see: the halls' signs, every town's board, the marks a raid leaves, a refugee camp ----------------------
  // One instanced mesh of lit boxes, rebuilt only when what is near you changes (never per frame).
  dress() {
    this.dirty = false;
    const g = this.g; if (!g.scene) return;
    if (!this.mesh) {
      this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 }), DRESS_CAP);
      this.mesh.name = 'site-stories'; this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DRESS_CAP * 3).fill(1), 3);
      this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false; this.mesh.count = 0;
      g.scene.add(this.mesh);
    }
    const me = g.pulls.me(), mesh = this.mesh; let n = 0;
    const box = (x, y, z, sx, sy, sz, col, ry = 0, rx = 0) => { if (n >= DRESS_CAP) return; _o.position.set(x, y, z); _o.rotation.set(rx, ry, 0); _o.scale.set(sx, sy, sz); _o.updateMatrix(); mesh.setMatrixAt(n, _o.matrix); mesh.setColorAt(n, _c.set(col)); n++; };
    this.dressed = [];
    for (const p of this.places.values()) {
      if (Math.hypot(p.x - me.x, p.z - me.z) > 900) continue;
      const y = this.g.citygen?.byId?.get(p.id)?.y ?? (this.g.streamer?.W?.groundAt?.(p.x, p.z) ?? 0);
      const spot = this.boardSpot(p);
      // the board (every peopled place): two posts, a plank, a little roof, and a paper for each posting pinned on it
      if (p.pop > 0 || p.kind === 'town') {
        const bd = this.k.holders.get(this.boardOf(p)), papers = bd ? bd.facts.filter((c) => c.what === 'posting').length : 0;
        const ry = spot.ry, ax = Math.cos(ry), az = -Math.sin(ry);
        for (const s of [-1, 1]) box(spot.x + ax * s * 1.1, y + 1.1, spot.z + az * s * 1.1, 0.14, 2.2, 0.14, '#4a3420', ry);
        box(spot.x, y + 1.55, spot.z, 2.5, 1.2, 0.1, '#6b4a2a', ry);
        box(spot.x, y + 2.3, spot.z, 2.8, 0.08, 0.6, '#3a2a1a', ry, 0.18);
        for (let i = 0; i < Math.min(8, papers); i++) box(spot.x + ax * (-0.85 + (i % 4) * 0.56) + Math.sin(ry) * 0.07, y + 1.85 - Math.floor(i / 4) * 0.55, spot.z + az * (-0.85 + (i % 4) * 0.56) + Math.cos(ry) * 0.07, 0.42, 0.48, 0.02, i % 3 === 0 ? '#e8dcc0' : '#d6c9a6', ry);
        this.dressed.push({ kind: 'board', place: p.id, x: spot.x, z: spot.z, papers });
      }
      // a Tally House: the sign over its door, TALLY in brass letters on a dark board, two lanterns
      if (this.isHall(p.id) && spot.hall) {
        const H = spot.hall, ry = H.ry, ax = Math.cos(ry), az = -Math.sin(ry), fx = Math.sin(ry), fz = Math.cos(ry);
        box(H.x, y + 4.1, H.z, 6.2, 1.5, 0.16, '#2a1e14', ry);
        let col = -2.6;
        for (const ch of 'TALLY') {
          const G = GLYPH[ch];
          for (let r = 0; r < 5; r++) for (let k = 0; k < G[r].length; k++) if (G[r][k] === '1') box(H.x + ax * (col + k * 0.22) + fx * 0.1, y + 4.6 - r * 0.22, H.z + az * (col + k * 0.22) + fz * 0.1, 0.2, 0.2, 0.06, '#d4a237', ry);
          col += 0.22 * 4 + 0.12;
        }
        for (const s of [-1, 1]) { box(H.x + ax * s * 3.4 + fx * 0.3, y + 3.2, H.z + az * s * 3.4 + fz * 0.3, 0.3, 0.45, 0.3, '#f0b040', ry); }
        box(H.x + fx * 1.4, y + 0.04, H.z + fz * 1.4, 3.6, 0.08, 2.4, '#5a3a22', ry); // the step
        this.dressed.push({ kind: 'hall', place: p.id, x: H.x, z: H.z });
      }
      // a raided or fallen place: scorch on the ground, rubble, a burned-out barricade at its middle
      if (p.fallen || (p.raidedAt !== null && this.hours() - p.raidedAt < 72)) {
        // along the street in front of the place's board (open ground: the middle of a place is built over)
        const rng = rngOf(hash32(p.seed, 0x5343, 2)), ax = Math.cos(spot.ry), az = -Math.sin(spot.ry), fx = Math.sin(spot.ry), fz = Math.cos(spot.ry);
        const at = (u, w) => [spot.x + ax * u + fx * w, spot.z + az * u + fz * w];
        for (let i = 0; i < 14; i++) { const [x, z] = at((rng() - 0.5) * 50, 3 + rng() * 9), r = rng() * 3, w = 1.6 + rng() * 2.4; box(x, y + 0.03, z, w, 0.04, w * (0.5 + rng() * 0.6), '#3a2c22', r); box(x, y + 0.045, z, w * 0.55, 0.04, w * 0.45, '#221a14', r + 0.7); } // soot: a burn, darker at its heart
        for (let i = 0; i < 18; i++) { const [x, z] = at((rng() - 0.5) * 44, 2 + rng() * 10); box(x, y + 0.25, z, 0.5 + rng() * 1, 0.3 + rng() * 0.5, 0.4 + rng() * 0.8, rng() < 0.5 ? '#3a3028' : '#5a4a3a', rng() * 3, rng() * 0.4); }
        for (let i = 0; i < 6; i++) { const [x, z] = at(-9 + i * 3.4, 8 + (i % 2) * 0.8); box(x, y + 0.45, z, 2.8, 0.9, 0.5, '#2a2018', spot.ry + 0.25 * (i - 3), 0.35); } // the barricade they burned
        this.dressed.push({ kind: 'raided', place: p.id, fallen: p.fallen });
      }
      // a refugee camp: lean-to tents, bedrolls, a fire ring and its embers
      if (p.kind === 'refuge') {
        const rng = rngOf(hash32(p.seed, 0x4341, 3)), N = Math.max(3, Math.min(8, Math.round(p.pop)));
        for (let i = 0; i < N; i++) { const a = (i / N) * 6.28, x = p.x + Math.cos(a) * 6, z = p.z + Math.sin(a) * 6; box(x, y + 0.6, z, 2.2, 1.2, 1.8, i % 2 ? '#8a7a5a' : '#6a5e48', -a, 0.0); box(x - Math.cos(a) * 1.6, y + 0.06, z - Math.sin(a) * 1.6, 0.8, 0.12, 1.9, '#5a4030', -a); }
        for (let i = 0; i < 8; i++) { const a = i * 0.785; box(p.x + Math.cos(a) * 0.9, y + 0.12, p.z + Math.sin(a) * 0.9, 0.35, 0.24, 0.3, '#5a5450', a); }
        box(p.x, y + 0.2, p.z, 0.7, 0.3, 0.7, '#e06a1a'); box(p.x, y + 0.45, p.z, 0.35, 0.4, 0.35, '#f5b21a');
        void rng;
        this.dressed.push({ kind: 'camp', place: p.id });
      }
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.dressN = n;
  }
  // Where a place's board stands: by its Tally House's door, or its saloon's, or the middle of the place.
  boardSpot(p) {
    const t = this.g.citygen?.live?.get(p.id);
    const Bs = t?.T?.buildings ?? [];
    const face = (B) => { const f = B.front ?? 'S', cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2; const o = f === 'N' ? [cx, B.z0 - 0.6, Math.PI] : f === 'S' ? [cx, B.z1 + 0.6, 0] : f === 'W' ? [B.x0 - 0.6, cz, -Math.PI / 2] : [B.x1 + 0.6, cz, Math.PI / 2]; return { x: o[0], z: o[1], ry: o[2] }; };
    let hallB = null;
    if (this.isHall(p.id) && Bs.length) { hallB = Bs.filter((B) => !B.ruined && B.kind !== 'saloon').sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0))[0] ?? null; }
    if (hallB) { const f = face(hallB), sx = Math.cos(f.ry), sz = -Math.sin(f.ry); return { x: f.x + sx * 4.6 + Math.sin(f.ry) * 1.2, z: f.z + sz * 4.6 + Math.cos(f.ry) * 1.2, ry: f.ry, hall: { ...f } }; }
    const sal = Bs.find((B) => B.kind === 'saloon' && !B.ruined);
    if (sal) { const f = face(sal), sx = Math.cos(f.ry), sz = -Math.sin(f.ry); return { x: f.x + sx * 5 + Math.sin(f.ry) * 1.2, z: f.z + sz * 5 + Math.cos(f.ry) * 1.2, ry: f.ry }; }
    if (this.isHall(p.id)) return { x: p.x + 6, z: p.z + 6, ry: 0, hall: { x: p.x + 6, z: p.z + 2, ry: 0 } };
    return { x: p.x + 6, z: p.z + 6, ry: 0 };
  }

  // Off (the battery's other checks): every body back onto its record, nothing drawn.
  sleep() {
    for (const m of this.movers) if (m.live) this.demote(m);
    for (const p of this.places.values()) if (p.garrison?.c) this.demoteGarrison(p);
    if (this.mesh) this.mesh.count = 0;
    this.sig = null; this.lastMove = null; this.clock = null;
  }

  // ---- views ---------------------------------------------------------------------------------------------------------------
  pview(p) {
    return { id: p.id, name: p.name, kind: p.kind, x: Math.round(p.x), z: Math.round(p.z), beyond: p.beyond, owner: p.owner, pop: Math.round(p.pop), fallen: p.fallen, problem: p.problem ? { kind: p.problem.kind, sev: r1(p.problem.sev), other: p.problem.other } : null,
      stock: Object.fromEntries(Object.entries(p.stock).map(([k, v]) => [k, r1(v)])), price: p.price, coin: Math.round(p.coin), defense: r1(this.defense(p)), guard: p.guard, arc: p.arc, hall: this.isHall(p.id),
      garrison: p.garrison ? { name: p.garrison.name, alive: p.garrison.alive, n: p.garrison.n, bounty: p.garrison.bounty } : null, links: this.linksOf(p),
      outbound: this.movers.filter((m) => m.from === p.id && m.state === 'road').map((m) => m.id), inbound: this.movers.filter((m) => m.to === p.id && m.state === 'road').map((m) => m.id) };
  }
  mview(m) {
    return { id: m.id, kind: m.kind, state: m.state, from: m.from, to: m.to, back: !!m.back, s: Math.round(m.s), L: Math.round(m.route?.L ?? 0), x: Math.round(m.x), z: Math.round(m.z), cor: m.cor ?? null, live: m.live, cargo: m.cargo, coin: m.coin, sick: !!m.sick, arc: m.arc,
      people: m.people.map((q) => ({ name: q.name, flag: q.flag, dead: q.dead, weapon: q.weapon, c: q.c?.id ?? null })), car: m.car ? { type: m.car.type, v: m.car.v?.id ?? null } : null,
      ...(m.kind === 'hunters' ? { hall: m.hall, at: m.at ?? null, contract: m.contract ?? null, grudge: !!m.grudge, tip: m.tip ?? null, knows: this.k.holders.get(m.holder)?.facts.length ?? 0 } : {}) };
  }
  bview(b) { return { id: b.id, target: b.target, by: b.by, deed: b.deed, pay: b.pay, escrow: b.escrow, state: b.state, takers: b.takers, killedBy: b.killedBy, claimedBy: b.claimedBy, fact: b.fact, posted: r1(b.posted) }; }
  arcView(a) { return { id: a.id, title: a.title, place: a.place, rows: a.rows.map((r) => ({ ...r })) }; }

  // ---- save ----------------------------------------------------------------------------------------------------------------
  save() {
    const strip = (m) => ({ ...m, live: false, people: m.people.map((q) => ({ ...q, c: null })), car: m.car ? { type: m.car.type, fuel: m.car.v?.fuel ?? m.car.fuel ?? 1, v: null } : null });
    // a deep copy: a save must not change when the world goes on after it
    return JSON.parse(JSON.stringify({ nid: this.nid, clock: this.clock, lastMove: this.lastMove, halls: this.halls, places: [...this.places.values()].map((p) => ({ ...p, links: null, garrison: p.garrison ? { ...p.garrison, c: null, guards: [] } : null })),
      movers: this.movers.map(strip), arcs: this.arcs, bounties: this.bounties, stats: { ...this.stats } }));
  }
  load(s) {
    const g = this.g;
    for (const m of this.movers) if (m.live) this.demote(m);
    for (const p of this.places.values()) if (p.garrison?.c) this.demoteGarrison(p);
    for (const c of [...g.chars]) if ((c.storyMover || c.storyGarrison || c.storyCamp) && g.chars.includes(c)) g.removeChar(c);
    for (const v of [...g.vehicles]) if (v.storyCar && !(v.occ ?? []).some((c) => c && !c.storyMover)) g.vehiclesSys.remove(v);
    this.places.clear(); this.movers = []; this.arcs = []; this.bounties = []; this.halls = []; this.built = false; this.clock = null; this.lastMove = null;
    if (!s) { this.dirty = true; return; }
    s = JSON.parse(JSON.stringify(s));
    this.nid = s.nid ?? 0; this.clock = s.clock ?? null; this.lastMove = s.lastMove ?? null; this.halls = s.halls ?? [];
    for (const p of s.places ?? []) this.places.set(p.id, { ...p, links: null });
    this.movers = s.movers ?? []; this.arcs = s.arcs ?? []; this.bounties = s.bounties ?? []; Object.assign(this.stats, s.stats ?? {});
    this.built = this.places.size > 0;
    if (this.built) this.registerGuild();
    this.dirty = true;
  }
}
