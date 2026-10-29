import { OCCUPATIONS } from '../data/occupations.js';
import { rosterOf, onShift, hashU } from '../world/occupations.js';
import { RES_NAMES } from '../data/ring.js';
import { outfit } from './characters.js';
import { AMBIENT_RESERVE } from './zombies.js';
import { rngOf } from '../world/geo.js';

// THE WORKFORCE (docs/design/WEB_OCCUPATIONS.md): the people who work in a built settlement. Who they are and what they do
// is pure (world/occupations.js rosterOf over the town's plan record and data/occupations.js); where they work and sleep
// is picked from the built town's own buildings (a dockhand's warehouse, a miller's mill, a scout's stretch of the edge).
// Records are the truth, characters are views (the residents' pattern, systems/residents.js):
//   promote  when their town is built and they are within WORK.promoteR of you (nearest first, never into the last
//            WORK.reserve character slots): a real character where the clock says they are - at work on shift, at home off it
//   think    (systems/ai.js asks first) on shift: walk to the workplace on a foot path and work there (the arms' work pose,
//            facing the job); off shift: walk home and stand down. A fight, a scare or a talk is the ordinary AI's.
//   produce  every tick, a worker AT their workplace ON shift banks the game hours that passed; a job that makes
//            something turns `hours` banked into one unit in the workplace's stock, up to its cap (law 2: nothing appears
//            that nobody worked for; a worker who is away, asleep, dead or off shift banks nothing)
//   demote   past WORK.demoteR, or their town torn down: written back to the record (alive, wounds, hours banked)
// Their deaths stay: a dead worker's record is dead, and their job goes unworked.
export const WORK = {
  promoteR: 170,   // m from you to a worker's place before they are made real
  demoteR: 240,    // m before they fold back into their record
  maxLive: 24,     // workers real at once, across every town
  reserve: 28,     // character slots always left free (AMBIENT_RESERVE and the director's events first)
  tick: 0.5,       // s between passes (promotion, production)
  walk: 1.45,      // m/s
  arriveR: 1.3,    // m: at the place
  repath: 4,       // s between foot-path plans while walking
  maxDh: 1,        // game hours one tick may bank (a skipped clock does not pay a shift it did not see)
};
const HOMES = ['house', 'bungalow', 'rowhouse', 'adobe', 'stilt_house', 'cabin', 'trailer', 'apartment', 'farmhouse', 'ranch_house', 'barracks', 'hotel', 'motel'];

const doorOf = (B, d) => (d.side === 'N' ? [d.at, B.z0, 0, -1] : d.side === 'S' ? [d.at, B.z1, 0, 1] : d.side === 'W' ? [B.x0, d.at, -1, 0] : [B.x1, d.at, 1, 0]);

export class Workforce {
  constructor(g) {
    this.g = g;
    this.enabled = true;
    this.towns = new Map(); // plan record id -> { rec, P, workers, stock, made, lastGh }
    this.live = new Set();  // worker records with a character
    this.t = 0;
    this.stats = { promoted: 0, demoted: 0, made: 0, ticks: 0 };
  }
  gh() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 12); }
  hour() { return this.g.sky?.time ?? 12; }

  // ---- records ------------------------------------------------------------------------------------------------------
  // A town's book: its roster (pure), each worker's name, flag, home and workplace (from its built buildings, once).
  book(t) {
    const rec = t.rec;
    let B = this.towns.get(rec.id);
    if (B && B.placed === t) return B;
    if (!B) {
      const R = rosterOf(rec);
      if (!R.P) return null;
      B = { rec, P: R.P, stock: {}, made: [], lastGh: this.gh(), placed: null, workers: R.workers.map((w) => {
        const rng = rngOf((rec.seed ^ Math.imul(w.n + 1, 0x9e3779b1)) >>> 0);
        const o = OCCUPATIONS[w.occ];
        return { id: `${rec.id}.w${w.n}`, town: rec.id, n: w.n, occ: w.occ, name: `${rng.pick(RES_NAMES.first)} ${rng.pick(RES_NAMES.last)}`, flag: this.g.randomFlag?.(rng) ?? 'US',
          seed: rng() * 4294967296 >>> 0, shift: o.shift, wp: w.work, alive: true, hp: 100, workH: 0, made: 0, c: null, state: 'away', home: null, work: null };
      }) };
      this.towns.set(rec.id, B);
    }
    this.place(B, t);
    return B;
  }
  // Workplaces and homes in the built town (the same every time it is built: its buildings are a pure layout).
  place(B, t) {
    const blds = t.blds.map((R) => R.B), T = t.T, cx = t.rec.x, cz = t.rec.z;
    const byKind = new Map();
    for (const b of blds) { if (b.ruined) continue; let L = byKind.get(b.kind); if (!L) byKind.set(b.kind, (L = [])); L.push(b); }
    const homes = blds.filter((b) => HOMES.includes(b.kind) && !b.ruined);
    const front = (b, k, spread) => { // a spot outside the building's front door, facing it; workers of one place stand apart
      const d = b.doors?.find((q) => q.side === b.front) ?? b.doors?.[0];
      const [x, z, nx, nz] = d ? doorOf(b, d) : [(b.x0 + b.x1) / 2, b.z1, 0, 1];
      const lat = spread ? ((k % 4) - 1.5) * 1.3 : 0;
      return { x: x + nx * 1.4 - nz * lat, z: z + nz * 1.4 + nx * lat, face: Math.atan2(-nx, -nz), label: (b.hero ?? b.name ?? b.kind).replace(/_/g, ' '), bid: b.id };
    };
    const edge = (u, k) => { // a spot on the settlement's edge (u in [0, 1) round it)
      const hw = (T.x1 - T.x0) / 2 - 6, hd = (T.z1 - T.z0) / 2 - 6, a = u * Math.PI * 2;
      const s = Math.max(Math.abs(Math.cos(a)) / hw, Math.abs(Math.sin(a)) / hd);
      return { x: cx + Math.cos(a) / s, z: cz + Math.sin(a) / s, face: Math.atan2(Math.cos(a), Math.sin(a)), label: 'the edge of town', bid: null, k };
    };
    const street = (u) => {
      // on the kerb of a main street (either side), facing the road: a stall, a pump, a washtub, never the crown of the road
      const roads = (T.roads ?? []).filter((r) => r.main); const r = roads[Math.floor(u * roads.length)] ?? T.roads?.[0];
      if (!r) return { x: cx, z: cz, face: 0, label: 'the street', bid: null };
      const v = 0.1 + 0.8 * hashU(Math.floor(u * 1e6), 'along'), side = hashU(Math.floor(u * 1e6), 'side') < 0.5 ? -1 : 1;
      if (r.axis === 'x') { const z = side < 0 ? r.z0 + 0.8 : r.z1 - 0.8; return { x: Math.max(T.x0 + 10, Math.min(T.x1 - 10, r.x0 + (r.x1 - r.x0) * v)), z, face: side < 0 ? 0 : Math.PI, label: 'the street', bid: null }; }
      const x = side < 0 ? r.x0 + 0.8 : r.x1 - 0.8;
      return { x, z: Math.max(T.z0 + 10, Math.min(T.z1 - 10, r.z0 + (r.z1 - r.z0) * v)), face: side < 0 ? Math.PI / 2 : -Math.PI / 2, label: 'the street', bid: null };
    };
    const count = new Map();
    for (const w of B.workers) {
      const u = hashU(w.seed, 'spot'), o = OCCUPATIONS[w.occ];
      let spot = null;
      if (w.wp?.at || w.wp?.hero) {
        const L = w.wp.at ? byKind.get(w.wp.at) ?? [] : blds.filter((b) => b.hero === w.wp.hero);
        if (L.length) { const b = L[(w.n + Math.floor(u * L.length)) % L.length], k = count.get(b) ?? 0; count.set(b, k + 1); spot = front(b, k, true); }
      }
      if (!spot && o.at?.length) for (const k of o.at) { const L = byKind.get(k); if (L?.length) { const b = L[Math.floor(u * L.length)], j = count.get(b) ?? 0; count.set(b, j + 1); spot = front(b, j, true); break; } }
      if (!spot) {
        const out = w.wp?.out ?? o.out ?? 'street';
        if (out === 'gate' && T.gates?.length) { const G = T.gates[Math.floor(u * T.gates.length)]; const inX = G.side === 'W' ? 1 : G.side === 'E' ? -1 : 0, inZ = G.side === 'N' ? 1 : G.side === 'S' ? -1 : 0; spot = { x: G.x + inX * 4 + inZ * (u - 0.5) * 4, z: G.z + inZ * 4 + inX * (u - 0.5) * 4, face: Math.atan2(-inX, -inZ), label: 'the gate', bid: null }; }
        else if (out === 'field') { const L = [...(byKind.get('barn') ?? []), ...(byKind.get('farmhouse') ?? [])]; spot = L.length ? { ...front(L[Math.floor(u * L.length)], w.n, true), label: 'the fields' } : { ...edge(u), label: 'the fields' }; }
        else if (out === 'dock') spot = { ...edge(u), label: 'the waterside' };
        else if (out === 'street') spot = street(u);
        else spot = edge(u);
      }
      w.work = spot;
      const h = homes.length ? homes[(w.n * 7 + Math.floor(hashU(w.seed, 'home') * homes.length)) % homes.length] : null;
      w.home = h ? { ...front(h, w.n, false), label: 'home' } : { ...edge(hashU(w.seed, 'camp')), label: 'a camp at the edge' };
    }
    B.placed = t;
  }
  // Where the clock says a worker is: { x, z, face, at: 'work' | 'home' }
  goal(w, h = this.hour()) { return onShift(w.shift, h) ? { ...w.work, at: 'work' } : { ...w.home, at: 'home' }; }

  // ---- promote / demote -----------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.enabled) return;
    if ((this.t -= dt) > 0) return;
    this.t = WORK.tick;
    this.stats.ticks++;
    this.produce();
    const g = this.g, CG = g.citygen, p = g.player;
    // fold back the far, and everyone of a town no longer built
    for (const w of [...this.live]) {
      const c = w.c, t = CG?.live.get(w.town);
      if (!t || !c || Math.hypot(c.x - p.x, c.z - p.z) > WORK.demoteR || g.chars.indexOf(c) < 0) this.demote(w);
    }
    if (!CG?.live.size) return;
    const want = [];
    for (const t of CG.live.values()) {
      if (Math.hypot(t.rec.x - p.x, t.rec.z - p.z) > WORK.promoteR + t.rec.half) continue;
      const B = this.book(t); if (!B) continue;
      for (const w of B.workers) {
        if (w.c || !w.alive) continue;
        const q = this.goal(w), d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < WORK.promoteR) want.push([d, w, q]);
      }
    }
    want.sort((a, b) => a[0] - b[0]);
    const reserve = Math.max(WORK.reserve, AMBIENT_RESERVE);
    for (const [, w, q] of want) {
      if (this.live.size >= WORK.maxLive || g.freeSlots.length <= reserve) break;
      this.promote(w, q);
    }
  }
  promote(w, q = this.goal(w)) {
    const g = this.g, o = OCCUPATIONS[w.occ];
    const gun = o.carry?.find((i) => i.startsWith('gun_'));
    const weapon = gun ? { gun_pistol: 'pistol', gun_smg: 'smg', gun_shotgun: 'shotgun', gun_rifle: 'rifle', gun_pump: 'shotgun', gun_auto: 'smg' }[gun] ?? null : null;
    const c = g.addChar({ x: q.x, z: q.z, faction: 'drifter', weapon, hp: w.hp, colors: outfit('drifter', rngOf(w.seed)), name: w.name, flag: w.flag });
    if (!c) return null;
    c.occRec = w; c.face = q.face ?? 0; c.home = { x: w.home.x, z: w.home.z };
    c.title = o.name;
    w.c = c; w.state = q.at === 'work' ? 'working' : 'home'; w.route = null; w.ri = 0; w.rt = 0;
    this.live.add(w); this.stats.promoted++;
    return c;
  }
  demote(w) {
    const c = w.c;
    if (c) { w.alive = c.alive; w.hp = c.alive ? c.hp : 0; c.occRec = null; c.work = false; if (this.g.chars.indexOf(c) >= 0) this.g.removeChar(c); }
    w.c = null; w.state = 'away'; w.route = null;
    this.live.delete(w); this.stats.demoted++;
  }

  // ---- the work -------------------------------------------------------------------------------------------------------
  // ai.js asks first: true = handled. A worker in a fight, fleeing, following or talking is the ordinary AI's.
  think(c, dt) {
    const w = c.occRec; if (!w) return false;
    if (c.target || c.flee > 0 || c.follower || c.cowerT > 0) { c.work = false; return false; }
    if (this.g.dialogue?.active && this.g.dialogue.npc === c) { c.work = false; c.speed = 0; return true; }
    const q = this.goal(w), d = Math.hypot(q.x - c.x, q.z - c.z);
    if (d < WORK.arriveR) {
      c.speed = 0; c.face = q.face ?? c.face;
      if (q.at === 'work') { c.work = true; c.workT = (c.workT ?? 0) + dt; w.state = 'working'; }
      else { c.work = false; w.state = 'home'; }
      w.route = null;
      return true;
    }
    c.work = false; w.state = q.at === 'work' ? 'to work' : 'going home';
    if (!w.route || (w.rt -= dt) <= 0 || w.gx !== q.x) {
      w.route = this.g.footPath?.(c.x, c.z, q.x, q.z) ?? [{ x: q.x, z: q.z }];
      w.ri = 0; w.rt = WORK.repath; w.gx = q.x;
    }
    let wp = w.route[w.ri] ?? q;
    if (Math.hypot(wp.x - c.x, wp.z - c.z) < 0.9 && w.ri < w.route.length - 1) wp = w.route[++w.ri];
    this.g.ai.move(c, wp.x - c.x, wp.z - c.z, WORK.walk, dt);
    return true;
  }
  // Bank the hours each worker spent at work on shift since the last tick; pay out units of what the job makes.
  produce() {
    const now = this.gh(), h = this.hour();
    for (const B of this.towns.values()) {
      const dh = Math.max(0, Math.min(WORK.maxDh, now - B.lastGh));
      B.lastGh = now;
      if (dh <= 0) continue;
      for (const w of B.workers) {
        const c = w.c;
        if (!c || !c.alive || w.state !== 'working' || !onShift(w.shift, h)) continue;
        if (Math.hypot(c.x - w.work.x, c.z - w.work.z) > WORK.arriveR * 1.5) continue;
        w.workH += dh;
        const mk = OCCUPATIONS[w.occ].makes; if (!mk) continue;
        const [item, hours, cap, label] = mk, key = `${w.work.bid ?? w.work.label}|${item}`;
        while (w.workH >= hours) {
          const have = B.stock[key]?.n ?? 0;
          if (have >= cap) { w.workH = hours; break; } // the shelf is full: the work waits for someone to take from it
          w.workH -= hours; w.made++;
          (B.stock[key] ??= { item, label, at: w.work.label, n: 0 }).n++;
          B.made.push({ gh: +now.toFixed(2), by: w.id, item }); if (B.made.length > 60) B.made.shift();
          this.stats.made++;
          this.g.emit?.('made', { town: B.rec.id, by: w.name, job: w.occ, item, at: w.work.label });
        }
      }
    }
  }
  // Take n units of an item from a town's stock (a trade, a theft): what was there, never more.
  take(townId, item, n = 1) {
    const B = this.towns.get(townId); if (!B) return 0;
    let got = 0;
    for (const s of Object.values(B.stock)) if (s.item === item && got < n) { const k = Math.min(s.n, n - got); s.n -= k; got += k; }
    return got;
  }

  // ---- talk (ui/dialogue.js asks, after the pulls) ------------------------------------------------------------------
  talkFor(c) {
    const w = c.occRec; if (!w) return null;
    const o = OCCUPATIONS[w.occ], B = this.towns.get(w.town), lines = o.talk;
    const text = `"${lines[Math.floor(this.hour() + w.n) % lines.length]}"`;
    const [a, b] = o.shift, hh = (x) => `${String(x % 24).padStart(2, '0')}:00`;
    const choices = [{ t: 'What do you do here?', reply: () => `"${o.name[0].toUpperCase()}${o.name.slice(1)}. ${w.work.label === 'home' ? 'Here' : `At ${w.work.label}`}, ${hh(a)} to ${hh(b)}."` }];
    if (o.makes && B) choices.push({ t: 'What have you made lately?', reply: () => { const s = B.stock[`${w.work.bid ?? w.work.label}|${o.makes[0]}`]; return s?.n ? `"${s.n} ${s.label} at ${s.at}. Every one of them worked for."` : '"Nothing on the shelf yet. Ask me at the end of the shift."'; } });
    choices.push({ t: '[Leave]', end: true });
    return { text, choices };
  }

  // ---- views -------------------------------------------------------------------------------------------------------
  view(w) { const c = w.c; return { id: w.id, name: w.name, flag: w.flag, job: w.occ, title: OCCUPATIONS[w.occ].name, shift: w.shift, onShift: onShift(w.shift, this.hour()), state: w.state, alive: c ? c.alive : w.alive, char: c?.id ?? null, x: c ? +c.x.toFixed(1) : null, z: c ? +c.z.toFixed(1) : null, work: w.work && { label: w.work.label, x: +w.work.x.toFixed(1), z: +w.work.z.toFixed(1) }, home: w.home && { x: +w.home.x.toFixed(1), z: +w.home.z.toFixed(1) }, workH: +w.workH.toFixed(2), made: w.made }; }
  // Save (shard-shaped: per town, who lives, hours banked, the stock): restore() lays it back over the pure books.
  save() { const out = {}; for (const [id, B] of this.towns) out[id] = { stock: B.stock, w: B.workers.filter((w) => !w.alive || w.workH || w.made || (w.c && !w.c.alive)).map((w) => [w.n, w.c ? w.c.alive : w.alive, +w.workH.toFixed(3), w.made]) }; return out; }
  restore(S) { this.pending = S ?? null; for (const B of this.towns.values()) this.apply(B); }
  apply(B) { const s = this.pending?.[B.rec.id]; if (!s) return; B.stock = s.stock ?? {}; for (const [n, alive, h, made] of s.w ?? []) { const w = B.workers[n]; if (w) { w.alive = alive; w.workH = h; w.made = made; } } }
}
