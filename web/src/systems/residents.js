import { RESIDENTS, RES_RULES, RES_NAMES } from '../data/ring.js';
import { INFECTED } from '../data/infected.js';
// Names come from the ring's own pools (data/ring.js RES_NAMES), never npcs.js randomName: that one keeps a running list
// of names already handed out, and a household must come out the same every time it is made.
import { outfit } from './characters.js';
import { AMBIENT_RESERVE } from './zombies.js';
// Residents are ambient: they never take the last AMBIENT_RESERVE slots (the director's events need them; RES_RULES can
// ask for more).
const RESERVE = () => Math.max(RES_RULES.reserve, AMBIENT_RESERVE);
import { hash32, rngOf } from '../world/geo.js';

// THE PHOENIX RING, R2: the people who live in it (docs/design/WEB_STREAMING.md §1.3 "R2 as built"; rows in
// data/ring.js RESIDENTS and RES_RULES). Thinly and memorably: a scavenger family in a dead house with a bed each, squatters
// behind a boarded-up shop front, a Dustwolf chop shop in each quarter of THE YARDS, an infected nest in THE BURN that holes
// up somewhere new most dawns with an Echo working at its boards.
//
// A household is a RECORD keyed by its building's id (R<k>.<j>.<n>, §3.7's ghost tier). Who lives there - names, flags,
// faces, guns, beds - is a pure function of the rows and the seed (world/ring.js household() and homeOf()); what happens to
// them - hp, grudges, what they carry, their deaths, the Echo's work on the boards - is kept on the record, so a family you
// killed is still dead when its chunk goes and comes back, and across a save. Records are the truth; characters are views:
//   promote  when their chunk is hot and they are within RES_RULES.promoteR of you: real characters (main.addChar), placed
//            where the clock says they are (asleep in their beds, out on a run, at home, the nest in its lair or roaming)
//   demote   past demoteR, when the chunk goes cold, or first of all when the character budget is full (yieldSlot):
//            written back to the record and taken out. Never out from under you mid-fight (engaged()).
// Their boxes are theirs while one of them lives (inventory.js stole(): taking is a `steal`, witnessed by whoever is home),
// they witness everything else the way anyone does (deeds.js, under their faction's row), they sleep in their own beds on
// the game clock (ai.toBed does the lying down), go out by day and come home on foot paths (g.footPath).
export class Residents {
  constructor(game) {
    this.g = game;
    this.recs = new Map();    // building id -> record (created when its chunk is first hot; pure ones may be dropped)
    this.deltas = new Map();  // building id -> saved state not yet applied to a record (a load)
    this.live = new Set();    // records with at least one member promoted
    this.byChunk = new Map(); // chunk key -> the lots of that chunk somebody lives in (pure)
    this.queue = [];          // records waiting to be promoted, nearest first
    this.scanT = 0; this.pathsLeft = 0;
    this.n = 0;               // members promoted right now (alive or dead)
    this.stats = { promoted: 0, demoted: 0, yielded: 0, deaths: 0, steals: 0, budgetSkips: 0, stalls: 0, ms: [], msMax: 0 };
  }
  get RG() { return this.g.streamer?.W?.ring ?? null; }
  gh() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 12); } // game hours since day 0

  // ---- records ------------------------------------------------------------------------------------------------------
  // The lots of chunk (cx, cz) somebody lives in.
  households(cx, cz) {
    const key = `${cx},${cz}`;
    let list = this.byChunk.get(key);
    if (list) return list;
    const RG = this.RG;
    list = RG ? RG.owned(cx, cz).filter((L) => RG.household(L)) : [];
    if (this.byChunk.size > 300) this.byChunk.clear();
    this.byChunk.set(key, list);
    return list;
  }
  // The lot with this building id (R<k>.<j>.<n>), or null.
  lotById(id) {
    const m = /^R(-?\d+)\.(-?\d+)\.(\d+)$/.exec(id ?? ''), RG = this.RG;
    if (!m || !RG) return null;
    const L = RG.block(+m[1], +m[2]).lots.find((q) => q.id === id && !q.empty);
    if (!L) return null;
    RG.owned(Math.floor(L.cx / 256), Math.floor(L.cz / 256));
    return L.cut || !RG.household(L) ? null : L;
  }
  rec(L) {
    let r = this.recs.get(L.id);
    if (!r) {
      r = this.make(L);
      if (this.recs.size > 600) for (const [id, o] of this.recs) if (!o.dirty && !this.live.has(o)) { this.recs.delete(id); if (this.recs.size < 450) break; }
      this.recs.set(L.id, r);
    }
    return r;
  }
  make(L) {
    const g = this.g, RG = this.RG, hh = RG.household(L), R = RESIDENTS[hh.kind], geo = RG.geo(L), rng = rngOf(hh.seed);
    const zombie = R.faction === 'zombie', fam = rng.pick(RES_NAMES.last), flag0 = g.randomFlag(rng);
    const inMine = (q) => geo.home.rooms.some((r) => q.x > r.x0 && q.x < r.x1 && q.z > r.z0 && q.z < r.z1);
    const rec = {
      id: L.id, kind: hh.kind, R, fid: R.fid, owner: L.owner, L, cx: L.cx, cz: L.cz, x0: L.x0, z0: L.z0, x1: L.x1, z1: L.z1, front: L.front,
      name: zombie ? R.name : R.faction === 'raider' ? R.name : `${fam.toUpperCase()} ${hh.kind === 'family' ? 'FAMILY' : 'SQUAT'}`,
      ownerName: R.faction === 'raider' ? 'the Dustwolf pack' : hh.kind === 'family' ? `the ${fam} family` : `the ${fam} squat`,
      rooms: geo.home.rooms, beds: geo.home.beds.map((i) => geo.beds[i]),
      boxIds: zombie ? [] : geo.boxesIn.filter(inMine).map((q) => q.id),
      doors: geo.doors.filter((d) => !d.barricade).map((d) => ({ x: d.x, z: d.z, nx: d.nx, nz: d.nz, kind: d.kind })),
      barricade: geo.barricade ? { ...geo.barricade, hp: RES_RULES.barricade.hp } : null,
      members: [], wronged: 0, dirty: false, barkAt: 0, spots: null, lairs: null,
    };
    // The people: names, flags, faces and guns from their own seeds.
    let armed = 0;
    const size = zombie ? hh.size : Math.max(1, Math.min(hh.size, rec.beds.length)); // a bed each: never more people than the house can sleep
    for (let n = 0; n < size; n++) {
      const seed = hash32(hh.seed, n, 0x4d454d42), mr = rngOf(seed);
      const first = mr.pick(RES_NAMES.first);
      let name, flag, hp, weapon = null, zkind = null;
      if (zombie) {
        zkind = n === 0 && R.echo ? 'echo' : mr() < (R.sprinters ?? 0) ? 'sprinter' : 'shambler';
        name = INFECTED[zkind].name; hp = INFECTED[zkind].hp; flag = g.randomFlag(mr);
      } else {
        name = R.names ? `${mr.pick(R.names)}` : hh.kind === 'family' ? `${first} ${fam}` : `${first} ${mr.pick(RES_NAMES.last)}`;
        flag = hh.kind === 'family' && mr() < 0.85 ? flag0 : R.faction === 'raider' && mr() < 0.6 ? 'US' : g.randomFlag(mr);
        hp = mr.int(R.hp[0], R.hp[1]);
        const A = R.armed;
        if (A && armed < A.max && mr() < A.share) { armed++; weapon = pickW(mr, A.weapons); }
      }
      rec.members.push({ n, key: `${L.id}#${n}`, seed, name, flag, weapon, zkind, maxHp: hp, hp, dead: false, x: 0, z: 0, face: 0, by: null, when: null, grudge: 0, carry: null, body: null, c: null, plan: null, planDay: -1 });
    }
    const d = this.deltas.get(L.id);
    if (d) { this.apply(rec, d); this.deltas.delete(L.id); }
    return rec;
  }
  apply(rec, d) {
    rec.wronged = d.wronged ?? 0; rec.dirty = true;
    if (rec.barricade && d.bar !== undefined) rec.barricade.hp = d.bar;
    for (const s of d.members ?? []) {
      const m = rec.members[s.n];
      if (!m) continue;
      Object.assign(m, { hp: s.hp ?? m.hp, dead: !!s.dead, x: s.x ?? 0, z: s.z ?? 0, face: s.face ?? 0, by: s.by ?? null, when: s.when ?? null, grudge: s.grudge ?? 0, carry: s.carry ?? null, body: s.body ?? null });
    }
  }
  alive(rec) { return rec.members.some((m) => !m.dead); }

  // ---- where the clock puts them ------------------------------------------------------------------------------------
  inWindow(w, h) { return w[0] > w[1] ? h >= w[0] || h < w[1] : h >= w[0] && h < w[1]; }
  watchman(rec, m) { return m.n < (rec.R.watch ?? 0); }
  asleep(rec, m, h) { return !!rec.R.sleep && rec.beds.length > 0 && !this.watchman(rec, m) && this.inWindow(rec.R.sleep, h); }
  bedOf(rec, m) { return rec.beds[m.n % rec.beds.length]; }
  // A standing spot in their rooms (each member their own, jittered from their seed, clear of the walls).
  homeSpot(rec, m) {
    if (this.watchman(rec, m) && rec.doors.length) {
      // The lookout: just inside the bay door, facing the street.
      const d = rec.doors.find((q) => q.kind === 'bay') ?? rec.doors[0];
      return { x: d.x - d.nx * 2.2, z: d.z - d.nz * 2.2, face: Math.atan2(d.nx, d.nz) };
    }
    const r = rec.rooms[m.n % rec.rooms.length], mr = rngOf(m.seed ^ 0x5eed);
    const w = Math.max(0, r.x1 - r.x0 - 2.4), d = Math.max(0, r.z1 - r.z0 - 2.4);
    return { x: (r.x0 + r.x1) / 2 + (mr() - 0.5) * w * 0.6, z: (r.z0 + r.z1) / 2 + (mr() - 0.5) * d * 0.6, face: mr() * 6.28 };
  }
  // Points out on the street a scavenger walks to: in front of other buildings within reach (pure, cached on the record).
  spotsOf(rec, reach) {
    if (rec.spots) return rec.spots;
    const RG = this.RG, out = (rec.spots = []), G = 80, [r0, r1] = reach;
    const k0 = Math.floor((rec.cx - r1) / G), k1 = Math.floor((rec.cx + r1) / G), j0 = Math.floor((rec.cz - r1) / G), j1 = Math.floor((rec.cz + r1) / G);
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) {
      const B = RG.block(k, j);
      if (!B.city) continue;
      for (const L of B.lots) {
        if (L.empty || L.id === rec.id) continue;
        const x = L.front === 'W' ? L.x0 - 2.6 : L.front === 'E' ? L.x1 + 2.6 : L.cx, z = L.front === 'N' ? L.z0 - 2.6 : L.front === 'S' ? L.z1 + 2.6 : L.cz;
        const d = Math.hypot(x - rec.cx, z - rec.cz);
        if (d >= r0 && d <= r1) out.push({ x, z, id: L.id });
      }
    }
    out.sort((a, b) => (a.id < b.id ? -1 : 1));
    return out;
  }
  // Today's plan for one member (seeded by the day): out or not, when they leave and are back, where they stop.
  plan(rec, m, day) {
    if (m.planDay === day && m.plan) return m.plan;
    const O = rec.R.out, r = rngOf(hash32(m.seed, day + 7, 0x504c414e));
    const p = { out: false, leave: 0, back: 0, stops: [], linger: 20 };
    if (O && !this.watchman(rec, m) && r() < O.share) {
      const spots = this.spotsOf(rec, O.reach);
      if (spots.length) {
        p.out = true; p.leave = r.range(O.leave[0], O.leave[1]); p.back = r.range(O.back[0], O.back[1]); p.linger = r.range(O.linger[0], O.linger[1]);
        for (let i = 0, n = r.int(O.stops[0], O.stops[1]); i < n; i++) p.stops.push(spots[Math.floor(r() * spots.length)]);
      }
    }
    m.plan = p; m.planDay = day;
    return p;
  }
  // The nest: the buildings of its chunk it moves between (origin first), and tonight's / today's lair.
  lairsOf(rec) {
    if (rec.lairs) return rec.lairs;
    const RG = this.RG, [cx, cz] = rec.owner.split(',').map(Number);
    const cand = RG.owned(cx, cz).filter((L) => L.zone === 'ruins' && L.id !== rec.id).sort((a, b) => Math.hypot(a.cx - rec.cx, a.cz - rec.cz) - Math.hypot(b.cx - rec.cx, b.cz - rec.cz));
    rec.lairs = [rec.L, ...cand.slice(0, Math.max(0, (rec.R.lairs ?? 1) - 1))].map((L) => ({ id: L.id, cx: L.cx, cz: L.cz, rooms: RG.geo(L).rooms }));
    return rec.lairs;
  }
  lair(rec, day) { const Ls = this.lairsOf(rec); return Ls[hash32(rec.L.seed, day + 3, 0x4c414952) % Ls.length]; }
  // Where the nest is: by day its lair (the one for today: a new one most dawns); by night roaming the streets round the
  // lair it left, toward a point that changes every game hour.
  nestNow(rec, h, day) {
    const R = rec.R, night = this.inWindow(R.night, h);
    if (!night) return { night: false, lair: this.lair(rec, day) };
    const from = this.lair(rec, h < R.night[1] ? day - 1 : day);
    const spots = this.spotsOf(rec, [0, R.roam[1]]).filter((s) => Math.hypot(s.x - from.cx, s.z - from.cz) >= R.roam[0] * 0.5);
    const at = spots.length ? spots[hash32(rec.L.seed, day, Math.floor(h), 0x524f414d) % spots.length] : { x: from.cx, z: from.cz };
    return { night: true, lair: from, at };
  }
  lairSpot(lair, m) {
    const r = lair.rooms[m.n % lair.rooms.length], mr = rngOf(m.seed ^ 0x1a12);
    return { x: (r.x0 + r.x1) / 2 + (mr() - 0.5) * Math.max(0, r.x1 - r.x0 - 2.4) * 0.7, z: (r.z0 + r.z1) / 2 + (mr() - 0.5) * Math.max(0, r.z1 - r.z0 - 2.4) * 0.7 };
  }
  herdOffset(m) { const mr = rngOf(m.seed ^ 0x4e44); return { x: (mr() - 0.5) * 6, z: (mr() - 0.5) * 6 }; }
  echoPost(rec) {
    const B = rec.barricade;
    if (B) return { x: B.x + B.nx * 0.9, z: B.z + B.nz * 0.9, boards: B };
    const d = rec.doors[0];
    return d ? { x: d.x + d.nx * 1.5, z: d.z + d.nz * 1.5 } : { x: rec.cx, z: rec.cz };
  }
  // Where a member is right now, by the clock: { x, z, face, sleep, bed, out, stop }.
  placeFor(rec, m) {
    const g = this.g, h = g.sky.time, day = g.society?.day ?? 0;
    if (rec.R.faction === 'zombie') {
      if (m.zkind === 'echo') { const p = this.echoPost(rec); return { x: p.x, z: p.z, face: 0 }; }
      const N = this.nestNow(rec, h, day);
      if (N.night) { const o = this.herdOffset(m); return { x: N.at.x + o.x, z: N.at.z + o.z, face: 0 }; }
      return { ...this.lairSpot(N.lair, m), face: 0 };
    }
    if (this.asleep(rec, m, h)) { const b = this.bedOf(rec, m); return { x: b.x, z: b.z, face: b.face ?? 0, sleep: true, bed: b }; }
    const p = this.plan(rec, m, day);
    if (p.out && h >= p.leave && h < p.back) {
      const i = Math.min(p.stops.length - 1, Math.floor(((h - p.leave) / (p.back - p.leave)) * p.stops.length));
      return { x: p.stops[i].x, z: p.stops[i].z, face: 0, out: true, stop: i };
    }
    return this.homeSpot(rec, m);
  }

  // ---- promote / demote ----------------------------------------------------------------------------------------------
  // Members of rec who are not characters now (the dead too: their bodies lie where they fell).
  missing(rec) { let n = 0; for (const m of rec.members) if (!m.c) n++; return n; }
  // Room for need more: free slots above the reserve, or a body long dead out of sight that the clean-up would take
  // anyway (main.updatePopulation's rule, sooner). Never an island character who is alive.
  budget(need) {
    const g = this.g;
    if (this.n + need > RES_RULES.max) return false;
    while (g.freeSlots.length - need < RESERVE()) if (!this.reclaim()) return false;
    return true;
  }
  reclaim() {
    const g = this.g, P = g.player, far = Math.max(70, (g.viewR ?? 0) + 10);
    let best = null;
    for (const c of g.chars) if (!c.alive && c !== P && !c.npc && !c.res && c.deadTime > 20 && Math.hypot(c.x - P.x, c.z - P.z) > far && (!best || c.deadTime > best.deadTime)) best = c;
    if (!best) return false;
    g.removeChar(best);
    this.stats.reclaimed = (this.stats.reclaimed ?? 0) + 1;
    return true;
  }
  promote(rec) {
    const g = this.g, R = rec.R, P = g.player, t0 = performance.now();
    const zombie = R.faction === 'zombie';
    let made = 0;
    this.claim(rec);
    for (const m of rec.members) {
      if (m.c) continue;
      if (!this.budget(1)) { this.stats.budgetSkips++; break; }
      const pos = m.dead ? { x: m.x, z: m.z, face: m.face } : this.placeFor(rec, m);
      let c;
      if (zombie) {
        c = m.zkind === 'echo' ? g.zombies.spawnKind('echo', pos.x, pos.z, this.echoPost(rec)) : g.zombies.spawn(pos.x, pos.z, m.zkind === 'sprinter');
        if (c) { c.colors = outfit('zombie', rngOf(m.seed)); c.name = m.name; c.flag = m.flag; }
      } else c = g.addChar({ x: pos.x, z: pos.z, faction: R.faction, weapon: m.weapon, hp: m.maxHp, colors: outfit(R.faction, rngOf(m.seed)), name: m.name, flag: m.flag, res: true });
      if (!c) break;
      c.maxHp = m.maxHp; c.hp = m.hp; c.face = pos.face ?? c.face;
      c.res = { rec, m, route: null, ri: 0, repath: 0, gx: NaN, gz: NaN, stop: pos.stop ?? 0, linger: 0, day: g.society?.day ?? 0, done: false, wander: 0, roused: 0, sniff: 0, where: '' };
      c.house = rec.id; c.fid = rec.fid; g.society.factions.assign(c);
      const home = this.homeSpot(rec, m);
      c.home = { x: home.x, z: home.z };
      if (m.dead) {
        c.alive = false; c.hp = 0; c.deadTime = 999; c.blood = 1; c.x = m.x; c.z = m.z; c.face = m.face;
        if (!zombie) this.layBody(rec, m, c);
      } else if (pos.sleep) {
        c.x = pos.x; c.z = pos.z; c.face = pos.face; c.bed = pos.bed; c.bedT = 0; c.sleeping = true; c.bedY = pos.bed.bedY ?? 0; c.res.where = 'bed';
      }
      if (!m.dead && m.grudge > this.gh()) c.grudge = P;
      g.standOn(c);
      g.charR.paint(c);
      m.c = c; this.n++; made++;
      this.stats.promoted++;
    }
    if (rec.members.some((m) => m.c)) this.live.add(rec);
    if (!made) return; // no room this time (the budget is full): nothing happened, nothing to measure
    const ms = performance.now() - t0;
    this.stats.ms.push(ms); if (this.stats.ms.length > 200) this.stats.ms.shift();
    if (ms > this.stats.msMax) this.stats.msMax = ms;
    const S = g.streamer;
    if (ms > RES_RULES.promoteStallMs && !S.sync) { this.stats.stalls++; S.stall(rec.owner, ms, 'promote'); }
    g.emit('residentsPromoted', { id: rec.id, kind: rec.kind, members: rec.members.filter((m) => m.c).length, ms: +ms.toFixed(2) });
  }
  // Is c in the middle of something that must not vanish from under you: a fight, a flight, a hit in the last seconds, a
  // witness carrying word (they keep it until it lands).
  engaged(c) {
    const g = this.g;
    if (!c.alive) return false;
    return !!c.target || (c.ztarget && c.ztarget === g.player) || c.flee > 0 || (c.hitAt ?? -99) > g.time - RES_RULES.engaged || !!c.telling ||!!g.society?.deeds?.holdsRumor(c);
  }
  // Back onto the record and out of the world.
  writeBack(rec, m, c) {
    const g = this.g, P = g.player;
    if (!c.alive && !m.dead) this.markDead(rec, m, c, c.lastAttacker);
    if (c.alive) {
      if (Math.round(c.hp) !== m.hp) { m.hp = Math.max(1, Math.round(c.hp)); rec.dirty = true; }
      if (c.grudge === P || c.target === P || c.ztarget === P) { m.grudge = this.gh() + RES_RULES.grudgeHours; rec.dirty = true; }
    }
    if (m.dead && m.bodyId) {
      const inv = g.inventory, box = inv.boxes.get(m.bodyId);
      if (box) { m.body = box.slots.map((s) => ({ ...s })); inv.boxes.delete(m.bodyId); if (inv.opened === box) inv.opened = null; }
    }
  }
  demoteMember(rec, m, silent = false) {
    const c = m.c, g = this.g;
    if (!c) return;
    if (!silent) this.writeBack(rec, m, c);
    if (c.bed?.by === c.id) c.bed.by = null;
    if (g.chars.includes(c)) g.removeChar(c);
    m.c = null; this.n--;
    this.stats.demoted++;
  }
  // force: the chunk is gone (or a load): everyone goes, engaged or not.
  demote(rec, force = false) {
    for (const m of rec.members) if (m.c && (force || !this.engaged(m.c))) this.demoteMember(rec, m);
    if (!rec.members.some((m) => m.c)) this.live.delete(rec);
  }
  // The budget is full: the farthest resident nobody is fighting goes first (the dead before the living).
  yieldSlot() {
    const g = this.g, P = g.player;
    let best = null, br = null, bd = -1;
    for (const rec of this.live) for (const m of rec.members) {
      const c = m.c;
      if (!c || this.engaged(c)) continue;
      const d = Math.hypot(c.x - P.x, c.z - P.z) + (c.alive ? 0 : 10000);
      if (d > bd) { bd = d; best = m; br = rec; }
    }
    if (!best) return false;
    this.demoteMember(br, best);
    if (!br.members.some((q) => q.c)) this.live.delete(br);
    this.stats.yielded++;
    return true;
  }

  // ---- the dead and the robbed ---------------------------------------------------------------------------------------
  // main.onKill: one of them died (whoever did it). The record keeps it; their body is theirs (what they carried and the
  // gun they held), under an id that outlives the character.
  onKill(c, attacker) {
    const S = c.res;
    if (!S) return;
    this.markDead(S.rec, S.m, c, attacker);
  }
  markDead(rec, m, c, attacker) {
    const g = this.g;
    if (m.dead) return;
    m.dead = true; m.hp = 0; m.x = +c.x.toFixed(2); m.z = +c.z.toFixed(2); m.face = +c.face.toFixed(3);
    m.by = attacker === g.player ? 'player' : attacker?.faction ?? 'unknown';
    m.when = { day: g.society?.day ?? 0, hour: +(g.sky.time ?? 0).toFixed(2) };
    rec.dirty = true; this.stats.deaths++;
    if (rec.R.faction !== 'zombie') {
      const inv = g.inventory, old = inv.boxes.get(`body:${c.id}`);
      if (old) { inv.boxes.delete(old.id); if (inv.opened === old) inv.opened = null; }
      this.layBody(rec, m, c);
    }
    if (!this.alive(rec)) this.claim(rec); // nobody left: their things are nobody's now
    g.emit('residentDied', { id: c.id, house: rec.id, kind: rec.kind, name: m.name, by: m.by, left: rec.members.filter((q) => !q.dead).length });
  }
  // Their body as a container: what they carried (rolled from their own seed until something changes it) and their gun.
  layBody(rec, m, c) {
    const inv = this.g.inventory, id = `body:res:${m.key}`;
    m.bodyId = id;
    if (inv.boxes.has(id)) return inv.boxes.get(id);
    const box = inv.place(id, rec.R.loot ?? 'person', m.x, m.z, 20, `${(m.name ?? 'SOMEBODY').toUpperCase()} (DEAD)`, m.seed);
    if (m.body) box.slots = m.body.map((s) => ({ ...s }));
    else { if (m.carry) box.slots = m.carry.map((s) => ({ ...s })); else inv.roll(box); if (m.weapon) inv.armBody(box, { weapon: m.weapon, faction: rec.R.faction }); }
    box.rolled = true;
    return box;
  }
  // Their shelves are theirs while one of them lives (not the infected's: nobody owns a nest).
  claim(rec) {
    const inv = this.g.inventory, own = rec.R.faction !== 'zombie' && this.alive(rec);
    for (const id of rec.boxIds) {
      const box = inv?.boxes.get(id);
      if (!box) continue;
      if (own) { box.owner = rec.id; box.ownerName = rec.ownerName; box.ownerFid = rec.fid; }
      else if (box.owner === rec.id) { box.owner = null; box.ownerName = null; box.ownerFid = null; }
    }
  }
  // inventory.stole: whose box is it - the one of them nearest you, if any are here.
  ownerOf(box) {
    const rec = this.recs.get(box.owner), P = this.g.player;
    if (!rec) return null;
    let best = null, bd = Infinity;
    for (const m of rec.members) if (m.c?.alive) { const d = Math.hypot(m.c.x - P.x, m.c.z - P.z); if (d < bd) { bd = d; best = m.c; } }
    return best;
  }
  // A theft from their house, after the deed was recorded: whoever of them saw it holds it against you (and says so).
  onSteal(box, deed) {
    const rec = this.recs.get(box.owner), g = this.g;
    if (!rec) return;
    rec.wronged++; rec.dirty = true; this.stats.steals++;
    const saw = new Set(deed?.w ?? []);
    let said = false;
    for (const m of rec.members) {
      const c = m.c;
      if (!c?.alive || !saw.has(c.id)) continue;
      m.grudge = this.gh() + RES_RULES.grudgeHours;
      c.grudge = g.player;
      if (!said && rec.R.lines?.steal?.length) { said = true; g.feedback?.floater(c.x, c.z, rec.R.lines.steal[rec.wronged % rec.R.lines.steal.length], 'bark'); }
    }
  }

  // ---- streaming hooks -----------------------------------------------------------------------------------------------
  // streamer.ringOn: the chunk's boxes are registered; the households' shelves become theirs.
  chunkOn(L) { for (const lot of this.households(L.cx, L.cz)) this.claim(this.rec(lot)); }
  // streamer.ringOff: the chunk goes cold - its people go back onto their records.
  chunkOff(L) {
    for (const rec of [...this.live]) if (rec.owner === L.key) this.demote(rec, true);
    for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].owner === L.key) this.queue.splice(i, 1);
  }

  // ---- per frame -----------------------------------------------------------------------------------------------------
  update(dt) {
    const S = this.g.streamer;
    if (!S || !this.RG) return;
    this.pathsLeft = RES_RULES.paths;
    if ((this.scanT -= dt) <= 0) { this.scanT = 0.25; this.scan(S); }
    // Promote from the queue: one household a frame while streaming in real time, all of them in a stepped (sync) run.
    for (let k = 0; this.queue.length && (S.sync || k < RES_RULES.perFrame); k++) {
      const rec = this.queue.shift();
      if (S.layouts.get(rec.owner)?.hot?.done && this.missing(rec) && this.budget(1)) this.promote(rec);
    }
  }
  scan(S) {
    const g = this.g, f = S.focus();
    // The promoted: gone from the world some other way (a load, a remove), too far, or their chunk cold.
    for (const rec of [...this.live]) {
      for (const m of rec.members) if (m.c && !g.chars.includes(m.c)) { m.c = null; this.n--; }
      if (!rec.members.some((m) => m.c)) { this.live.delete(rec); continue; }
      const L = S.layouts.get(rec.owner);
      if (!L) { this.demote(rec, true); continue; }
      if (!L.hot || Math.hypot(rec.cx - f.x, rec.cz - f.z) > RES_RULES.demoteR) this.demote(rec, false);
      else for (const m of rec.members) if (m.c && Math.hypot(m.c.x - f.x, m.c.z - f.z) > RES_RULES.demoteR + 40 && !this.engaged(m.c)) this.demoteMember(rec, m); // wandered off out of reach
    }
    // Who should be promoted: the households of hot ring chunks within reach, nearest first.
    this.queue.length = 0;
    for (const L of S.hot.values()) {
      if (!L.ring || !L.hot?.done) continue;
      for (const lot of this.households(L.cx, L.cz)) {
        const d = Math.hypot(lot.cx - f.x, lot.cz - f.z);
        if (d > RES_RULES.promoteR) continue;
        const rec = this.rec(lot);
        if (!this.missing(rec)) continue;
        if (!rec.claimed) { rec.claimed = true; this.claim(rec); }
        rec.qd = d;
        this.queue.push(rec);
      }
    }
    this.queue.sort((a, b) => a.qd - b.qd);
  }

  // ---- what they do (ai.update hands residents over here) ------------------------------------------------------------
  // Walk to (tx, tz) on a foot path (planned once, re-planned when stuck; a few plans a frame across everyone).
  walk(c, tx, tz, speed, dt) {
    const S = c.res, g = this.g;
    if (Math.hypot(tx - c.x, tz - c.z) < 0.7) { c.speed = 0; return true; }
    S.repath -= dt;
    const goalMoved = !(Math.abs(S.gx - tx) < 0.5 && Math.abs(S.gz - tz) < 0.5);
    // A watchdog on progress: no closer by 0.3 m in 4 s (wedged on a corner the slide and the detours cannot get round)
    // plans again from where they stand.
    const dist = Math.hypot(tx - c.x, tz - c.z);
    if (goalMoved || !(dist < S.best - 0.3)) { if (goalMoved || (S.noGain = (S.noGain ?? 0) + dt) > 4) { S.best = dist; S.noGain = 0; if (!goalMoved) { S.route = null; S.wedged = (S.wedged ?? 0) + 1; this.stats.wedged = (this.stats.wedged ?? 0) + 1; c.detour = 0.6; c.detourA = (Math.random() < 0.5 ? 1 : -1) * (1.2 + Math.random()); } } }
    else { S.best = dist; S.noGain = 0; }
    if ((goalMoved || !S.route || (S.repath <= 0 && (c.stuck ?? 0) > 0.25)) && this.pathsLeft > 0) {
      this.pathsLeft--;
      // A goal in a cell the grid calls blocked (a bed against a wall, a stop by a kerb wreck) gets no path of its own:
      // then a path to a free spot a step from it, and the last step straight.
      let route = g.footPath(c.x, c.z, tx, tz);
      for (let k = 0; !route && k < 4 && Math.hypot(tx - c.x, tz - c.z) < 30; k++) route = g.footPath(c.x, c.z, tx + NEAR8[k][0], tz + NEAR8[k][1]);
      S.route = route ?? [{ x: tx, z: tz }]; S.ri = 0; S.repath = 3; S.gx = tx; S.gz = tz; S.lost = route ? 0 : (S.lost ?? 0) + 1;
    }
    if (!S.route) { c.speed = 0; return false; } // waiting for a plan this frame
    let wp = S.route[S.ri];
    while (S.ri < S.route.length - 1 && Math.hypot(wp.x - c.x, wp.z - c.z) < 1.1) wp = S.route[++S.ri];
    // The route's last point is the nearest free cell to the goal (a bed against a wall is not one): the last step is
    // straight there.
    if (S.ri === S.route.length - 1 && Math.hypot(wp.x - c.x, wp.z - c.z) < 1.1) wp = { x: tx, z: tz };
    g.ai.move(c, wp.x - c.x, wp.z - c.z, speed, dt);
    return false;
  }
  inside(rec, c) { return c.x > rec.x0 && c.x < rec.x1 && c.z > rec.z0 && c.z < rec.z1; }

  think(c, dt, pd) {
    const g = this.g, S = c.res, rec = S.rec, m = S.m, R = rec.R, h = g.sky.time, day = g.society?.day ?? 0, P = g.player;
    if (c.restless > 0) c.restless -= dt;
    if (pd > 150) { c.speed = 0; return; } // far: they keep still (the record knows where the clock has them)
    // Night: to their own bed and asleep (ai.toBed lies them down and wakes them for someone at the bedside).
    if (this.asleep(rec, m, h) && !(c.restless > 0)) {
      const b = this.bedOf(rec, m);
      if (!c.sleeping && Math.hypot(b.x - c.x, b.z - c.z) > 0.7) { S.where = 'to bed'; this.walk(c, b.x, b.z, 1.4, dt); return; }
      if (c.bed !== b) { c.bed = b; c.bedT = 0; }
      S.where = 'bed';
      g.ai.toBed(c, dt, pd);
      return;
    }
    if (c.sleeping) g.ai.wake(c, 'dawn');
    if (c.bed) c.bed = null;
    if (S.day !== day) { S.day = day; S.done = false; S.stop = 0; S.linger = 0; }
    const p = this.plan(rec, m, day);
    if (p.out && !S.done && h >= p.leave && h < p.back) {
      // Out on a run: from stop to stop, a while at each, then home with what they found.
      const st = p.stops[Math.min(S.stop, p.stops.length - 1)];
      S.where = 'out';
      if (!this.walk(c, st.x, st.z, 1.6, dt)) return;
      if ((S.linger += dt) < p.linger) { c.speed = 0; c.crouch = S.linger % 6 < 3; return; } // going through what is there
      c.crouch = false; S.linger = 0;
      if (++S.stop >= p.stops.length) { S.done = true; this.found(rec, m, day); }
      return;
    }
    if (p.out && h >= p.back) S.done = true;
    c.crouch = false;
    // Home: in through a door, then about their rooms.
    const home = this.homeSpot(rec, m);
    if (!this.inside(rec, c) || (this.watchman(rec, m) && Math.hypot(home.x - c.x, home.z - c.z) > 0.8)) {
      S.where = S.done && p.out ? 'coming home' : 'home';
      if (this.walk(c, home.x, home.z, S.done && p.out ? 1.9 : 1.5, dt) && this.watchman(rec, m)) c.face = home.face;
      return;
    }
    S.where = this.watchman(rec, m) ? 'watch' : 'home';
    if (this.watchman(rec, m)) { c.speed = 0; c.face = home.face; }
    else {
      // Pottering about their own room (straight lines inside one room: no walls in the way).
      const r = rec.rooms[m.n % rec.rooms.length];
      if ((S.wander -= dt) <= 0) { S.wander = 4 + Math.random() * 6; c.wx = r.x0 + 1.2 + Math.random() * Math.max(0, r.x1 - r.x0 - 2.4); c.wz = r.z0 + 1.2 + Math.random() * Math.max(0, r.z1 - r.z0 - 2.4); }
      if (Math.hypot(c.wx - c.x, c.wz - c.z) > 0.6 && c.x > r.x0 && c.x < r.x1 && c.z > r.z0 && c.z < r.z1) g.ai.move(c, c.wx - c.x, c.wz - c.z, 1.1, dt);
      else if (!(c.x > r.x0 && c.x < r.x1 && c.z > r.z0 && c.z < r.z1)) this.walk(c, home.x, home.z, 1.3, dt);
      else c.speed = 0;
    }
    // You walked into their place: one of them says so (a household speaks at most every barkEvery seconds).
    if (g.insideBuilding?.id === rec.id && g.time > rec.barkAt && P.alive && pd < 12 && g.sees(c, P) && R.lines?.enter?.length) {
      rec.barkAt = g.time + RES_RULES.barkEvery;
      g.feedback?.floater(c.x, c.z, R.lines.enter[Math.floor(Math.random() * R.lines.enter.length)], 'bark');
      g.emit('residentBark', { id: c.id, house: rec.id, line: 'enter' });
    }
  }
  // Back from a run: something from the street goes in their pockets (it is on their body if they die).
  found(rec, m, day) {
    const T = rec.R.out?.finds, inv = this.g.inventory;
    if (!T || !inv) return;
    const tmp = inv.place(`tmp:res:${m.key}`, T, 0, 0, 20, 'TMP', hash32(m.seed, day, 0x46494e44));
    inv.roll(tmp);
    inv.boxes.delete(tmp.id);
    if (!m.carry) { const base = inv.place(`tmp:res:base:${m.key}`, rec.R.loot ?? 'person', 0, 0, 20, 'TMP', m.seed); inv.roll(base); inv.boxes.delete(base.id); m.carry = base.slots; }
    for (const s of tmp.slots) if (m.carry.length < 6) m.carry.push(s);
    rec.dirty = true;
    this.g.emit('residentFound', { house: rec.id, member: m.n, items: tmp.slots.map((s) => s.id) });
  }

  // The nest (ai.update, before the infected's own brain): true when handled here. Hunting, a noise, the Echo at its
  // boards: the infected's own brain (zombies.think) does it.
  thinkInfected(c, dt) {
    const g = this.g, S = c.res, rec = S.rec, m = S.m, R = rec.R, P = g.player;
    if (c.zkind === 'echo') return false;
    if (c.ztarget?.alive || S.roused > g.time || c.zs?.state === 'burst' || c.zs?.state === 'overheat') return false;
    const pd = Math.hypot(P.x - c.x, P.z - c.z);
    if (pd > 150) { c.speed = 0; return true; }
    const h = g.sky.time, day = g.society?.day ?? 0, N = this.nestNow(rec, h, day);
    // Smell: by night their full nose (the infected's own pick); by day, holed up, only what comes right up to them.
    if ((S.sniff -= dt) <= 0) {
      S.sniff = 0.5;
      const t = g.zombies.pickTarget(c);
      if (t && (N.night || (Math.hypot(t.x - c.x, t.z - c.z) < 9 && g.sees(c, t)))) { c.ztarget = t; return false; }
    }
    const pace = Math.min(1.3, c.zSpeed || 1.1);
    if (N.night) {
      const o = this.herdOffset(m);
      S.where = 'roaming';
      if (this.walk(c, N.at.x + o.x, N.at.z + o.z, pace, dt)) c.speed = 0;
      return true;
    }
    const sp = this.lairSpot(N.lair, m);
    S.where = Math.hypot(sp.x - c.x, sp.z - c.z) < 1.5 ? 'lair' : 'to the lair';
    if (this.walk(c, sp.x, sp.z, pace, dt)) { c.speed = 0; c.crouch = false; }
    return true;
  }

  // ---- save / load / view --------------------------------------------------------------------------------------------
  // Everything changed, written back (the promoted ones stay where they are).
  sync() {
    for (const rec of this.live) for (const m of rec.members) if (m.c) this.writeBack(rec, m, m.c);
  }
  pack(rec) {
    return { id: rec.id, wronged: rec.wronged, bar: rec.barricade?.hp, members: rec.members.map((m) => ({ n: m.n, hp: m.hp, dead: m.dead || undefined, x: m.dead ? m.x : undefined, z: m.dead ? m.z : undefined, face: m.dead ? m.face : undefined, by: m.by ?? undefined, when: m.when ?? undefined, grudge: m.grudge || undefined, carry: m.carry ?? undefined, body: m.body ?? undefined })) };
  }
  save() {
    // Write live state back, then put the bodies' current contents on the record (without taking the boxes away).
    this.sync();
    const inv = this.g.inventory;
    for (const rec of this.live) for (const m of rec.members) if (m.dead && m.bodyId) { const box = inv.boxes.get(m.bodyId); if (box) { m.body = box.slots.map((s) => ({ ...s })); rec.dirty = true; } }
    const out = [];
    for (const rec of this.recs.values()) if (rec.dirty) out.push(this.pack(rec));
    for (const [id, d] of this.deltas) if (!this.recs.has(id)) out.push(d);
    return { v: 1, recs: out };
  }
  // A load: everyone promoted goes (the save is the truth), the records start again from the saved deltas.
  load(s) {
    const g = this.g, inv = g.inventory;
    for (const rec of this.live) for (const m of rec.members) {
      if (m.c) { if (g.chars.includes(m.c)) g.removeChar(m.c); m.c = null; }
    }
    for (const rec of this.recs.values()) for (const m of rec.members) if (m.bodyId) inv?.boxes.delete(m.bodyId);
    for (const id of [...(inv?.boxes.keys() ?? [])]) if (id.startsWith('body:res:')) inv.boxes.delete(id);
    this.live.clear(); this.recs.clear(); this.queue.length = 0; this.n = 0;
    this.deltas = new Map((s?.recs ?? []).map((d) => [d.id, d]));
    this.scanT = 0;
  }
  memberView(rec, m) {
    const c = m.c, h = this.g.sky.time, p = !m.dead && rec.R.faction !== 'zombie' ? this.plan(rec, m, this.g.society?.day ?? 0) : null;
    return { n: m.n, name: m.name, flag: m.flag, weapon: m.weapon, kind: m.zkind ?? undefined, hp: c ? Math.round(c.hp) : m.hp, maxHp: m.maxHp, dead: m.dead || (c ? !c.alive : false),
      by: m.by, when: m.when, grudge: m.grudge > this.gh(), id: c?.id ?? null, x: c ? +c.x.toFixed(1) : m.dead ? m.x : null, z: c ? +c.z.toFixed(1) : m.dead ? m.z : null,
      asleep: c ? !!c.sleeping : !m.dead && this.asleep(rec, m, h), where: c?.res?.where || null, inside: c ? this.inside(rec, c) : null,
      bed: rec.R.faction === 'zombie' || !rec.beds.length ? null : rec.beds.indexOf(this.bedOf(rec, m)),
      plan: p ? { out: p.out, leave: +p.leave.toFixed(2), back: +p.back.toFixed(2), stops: p.stops.length } : undefined,
      carry: (m.carry ?? []).map((s) => `${s.id}x${s.n}`), body: m.bodyId ?? null };
  }
  view(rec) {
    const g = this.g, day = g.society?.day ?? 0, h = g.sky.time;
    const nest = rec.R.faction === 'zombie' ? this.nestNow(rec, h, day) : null;
    return { id: rec.id, kind: rec.kind, name: rec.name, faction: rec.fid, chunk: rec.owner, x: +rec.cx.toFixed(1), z: +rec.cz.toFixed(1), promoted: this.live.has(rec),
      alive: rec.members.filter((m) => !m.dead).length, dead: rec.members.filter((m) => m.dead).length, beds: rec.beds.length, boxes: rec.boxIds.length,
      owned: rec.boxIds.filter((id) => g.inventory?.boxes.get(id)?.owner === rec.id).length, wronged: rec.wronged,
      barricade: rec.barricade ? { x: +rec.barricade.x.toFixed(1), z: +rec.barricade.z.toFixed(1), hp: Math.round(rec.barricade.hp) } : null,
      nest: nest ? { night: nest.night, lair: nest.lair.id, tomorrow: this.lair(rec, day + 1).id, roamTo: nest.at ? { x: +nest.at.x.toFixed(1), z: +nest.at.z.toFixed(1) } : null, lairs: this.lairsOf(rec).map((q) => q.id) } : undefined,
      members: rec.members.map((m) => this.memberView(rec, m)) };
  }
  summary() {
    const byKind = {};
    for (const rec of this.recs.values()) { const k = (byKind[rec.kind] ??= { households: 0, alive: 0, dead: 0 }); k.households++; for (const m of rec.members) m.dead ? k.dead++ : k.alive++; }
    const ms = this.stats.ms.slice().sort((a, b) => a - b);
    return { records: this.recs.size, unappliedSaved: this.deltas.size, promotedHouseholds: this.live.size, promotedPeople: this.n, queue: this.queue.length,
      budget: { cap: this.g.freeSlots.length + this.g.chars.length, chars: this.g.chars.length, free: this.g.freeSlots.length, reserve: RESERVE(), max: RES_RULES.max },
      byKind, stats: { ...this.stats, ms: undefined, promoteMs: ms.length ? { p50: +ms[Math.floor(ms.length / 2)].toFixed(2), p95: +ms[Math.floor(ms.length * 0.95)].toFixed(2), max: +this.stats.msMax.toFixed(2) } : null } };
  }
}

const NEAR8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
function pickW(rng, rows) { let t = 0; for (const r of rows) t += r[1]; let p = rng() * t; for (const r of rows) if ((p -= r[1]) < 0) return r[0]; return rows[rows.length - 1][0]; }
