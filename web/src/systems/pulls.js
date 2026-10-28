import * as THREE from 'three';
import { PULL_RULES as R, PULL_KINDS as KINDS, BAR, CHANNELS, FACT_KINDS, PULL_WORDS as WORDS } from '../data/pulls.js';
import { ITEMS } from '../data/items.js';
import { WEAPONS } from './combat.js';
import { outfit } from './characters.js';
import { Knowledge } from './knowledge.js';
import { hash32, rngOf } from '../world/geo.js';

// PULLS: why go out today (docs/design/WEB_PULLS.md). Every pull is a real person or event: a RECORD with a place, a clock
// and a purse, promoted to characters near you and written back when you leave. You hear of one only through a channel
// (systems/knowledge.js, law 6): a barkeep who holds it, a rider who saw it, the radio inside its range, a board you read,
// a note on a body, or your own eyes. The board (ui/pullsboard.js) lists only the copies you hold.
//   road     hitchhikers, refugees and a trader WALK the corridor on the world clock (walk / sky.timeScale m a game hour,
//            the same pace as a body on screen); a stranded driver, a broken-down caravan and a wreck stay put
//   radio    a medic call and a stranded driver's CB go out from where they are, inside the channel's range
//   towns    every planned town is a holder with a radio; its bar's barkeep hears what is said in it; its board holds
//            bounties, work orders and missing persons; the grapevine carries a town's news to the next one at the
//            grapevine's speed (a fact lands only when the road between them has been driven)
//   bars     a barkeep and drinkers in every saloon of a town built near you: a drink off the bar's own shelf buys a rumour
//            the barkeep actually holds; cards against a drinker's real purse; a gun hand for hire; a sore loser
//   needs    your own fuel, rounds, meds, food and water read off what you carry and drive (your own eyes)
// Births are where the road is, never at you and never in sight; rewards come out of a purse, a shelf or a till (law 2).
// Nothing per frame: tick() every R.tick seconds; think() per promoted body inside the AI loop.

const r1 = (v) => Math.round(v * 10) / 10;
const pick = (rng, a) => a[Math.floor(rng() * a.length) % a.length];
const roll = (rng, [a, b]) => a + rng() * (b - a);
const iroll = (rng, [a, b]) => Math.floor(a + rng() * (b - a + 1));
const BIRTH_W = [['hitchhiker', 3], ['stranded', 1.6], ['caravan', 1], ['refugees', 1.3], ['trader', 1.3], ['wreck', 1]];
const MILE = 1609;
const FURN_CAP = 480; // bar furniture boxes, every bar near you (one instanced draw call)
const _o = new THREE.Object3D(), _c = new THREE.Color();

export class Pulls {
  constructor(g) {
    this.g = g;
    this.k = new Knowledge(g);
    this.enabled = true;
    this.list = [];            // the pull records (road, radio, town)
    this.bars = new Map();     // building id -> bar record
    this.towns = null;         // grapevine nodes (built on first use: the plan is ready by then)
    this.nid = 0; this.t = 0; this.needT = 0; this.hourAt = null; this.nextBirth = null;
    this.visited = new Set();  // towns you have stood in (your own eyes: you know they are there)
    this.stats = { born: 0, promoted: 0, demoted: 0, arrived: 0, died: 0, rides: 0, robbed: 0, paid: 0, drinks: 0, hands: 0 };
    this.k.holder('player', { name: 'you', kind: 'player', cap: R.playerHolds });
  }
  hours() { return this.k.hours(); }
  walkPerHour() { return R.walk / (this.g.sky?.timeScale ?? 1 / 30); }

  // ---- the road ---------------------------------------------------------------------------------------------------------
  cors() {
    const W = this.g.streamer?.W;
    if (!W) return [];
    return [W.i10, ...Object.values(W.regions ?? {}).flatMap((Rg) => Rg.corridors ?? [])].filter((c) => c && c.L > 0);
  }
  cor(id) { return this.cors().find((c) => c.id === id) ?? null; }
  halfW(c) { return (c.road?.lanes ?? 4) * 1.85 + (c.road?.divided ? 3 : 0); }
  onRoad(c, s, side = 1) { const f = c.at(Math.max(0, Math.min(c.L, s))), o = side * (this.halfW(c) + R.shoulder); return { x: f.x + f.nx * o, z: f.z + f.nz * o, tx: f.tx, tz: f.tz }; }
  // 'the Furnace Run (I-10)': the road's own name, said the way people say it
  roadName(c) { const n = c.road?.nickname ? titled(c.road.nickname).replace(/^The /, '') : null; return n ? `the ${n} (${c.id})` : c.id; }
  mileOf(c, s) { return Math.round(s / MILE); }
  island(c, s) { return Number.isFinite(c.sIslW) && s > c.sIslW - 200 && s < c.sIslE + 200; }

  // ---- towns: the grapevine's nodes ------------------------------------------------------------------------------------
  // Every planned town and the island's Rust Haven. A node on a corridor knows its s along it (walkers walk to it).
  nodes() {
    if (this.towns) return this.towns;
    const out = [], cg = this.g.citygen;
    const ring = (h) => { const rng = rngOf(hash32(h.length * 977, h.charCodeAt(0), 0x544f574e)); return { purse: iroll(rng, [300, 900]), stock: {} }; };
    out.push({ id: 'rust_haven', name: 'Rust Haven', x: 0, z: 0, cor: 'I-10', s: null, ...ring('rust_haven') });
    for (const r of cg?.plan ?? []) if (r.kind === 'town' && !r.beyond) out.push({ id: r.id, name: titled(r.name), x: r.x, z: r.z, cor: r.cor ?? null, s: r.s ?? null, ...ring(r.id) });
    const i10 = this.cor('I-10');
    if (i10 && Number.isFinite(i10.sIslW)) out[0].s = (i10.sIslW + i10.sIslE) / 2;
    // a town off any corridor's s: project it onto the nearest one (within 3 km) so walkers can head for it
    for (const n of out) if (n.s === null) for (const c of this.cors()) { const p = c.project?.(n.x, n.z, 3000); if (p && p.d < 3000) { n.cor = c.id; n.s = p.s; break; } }
    for (const n of out) this.k.holder(`town:${n.id}`, { name: n.name, kind: 'town', x: n.x, z: n.z, cap: R.townHolds, radio: true });
    this.towns = out;
    return out;
  }
  node(id) { return this.nodes().find((n) => n.id === id) ?? null; }
  // A town stamped after the plan (an ad-hoc stamp, a forge edit) becomes a node when its bar first opens.
  ensureNode(rec) {
    let n = this.node(rec.id);
    if (n) return n;
    const rng = rngOf(hash32(rec.id.length * 977, rec.x | 0, 0x544f574e));
    n = { id: rec.id, name: titled(rec.name), x: rec.x, z: rec.z, cor: null, s: null, purse: iroll(rng, [300, 900]), stock: {} };
    for (const c of this.cors()) { const pr = c.project?.(n.x, n.z, 3000); if (pr && pr.d < 3000) { n.cor = c.id; n.s = pr.s; break; } }
    this.towns.push(n); for (const m of this.towns) m.nb = null;
    this.k.holder(`town:${n.id}`, { name: n.name, kind: 'town', x: n.x, z: n.z, cap: R.townHolds, radio: true });
    return n;
  }
  nearestNode(x, z, max = 1e9) { let b = null, bd = max; for (const n of this.nodes()) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; b = n; } } return b; }
  // The two towns either side of s on a corridor (a walker comes from one and walks to the other).
  bracket(cid, s) {
    let lo = null, hi = null;
    for (const n of this.nodes()) { if (n.cor !== cid || n.s === null) continue; if (n.s <= s && (!lo || n.s > lo.s)) lo = n; if (n.s > s && (!hi || n.s < hi.s)) hi = n; }
    return { lo, hi };
  }
  // The towns a town trades news with: the next on its road each way, and any within 14 km.
  neighbours(n) {
    if (n.nb) return n.nb;
    const out = new Set();
    if (n.cor && n.s !== null) { const { lo } = this.bracket(n.cor, n.s - 1); const { hi } = this.bracket(n.cor, n.s + 1); if (lo && lo !== n) out.add(lo); if (hi && hi !== n) out.add(hi); }
    for (const m of this.nodes()) if (m !== n && Math.hypot(m.x - n.x, m.z - n.z) < 14000) out.add(m);
    n.nb = [...out];
    return n.nb;
  }

  // ---- in view? (the same measure the population fold uses) ------------------------------------------------------------
  inView(x, z) {
    const g = this.g, p = g.player, lx = g.camLook?.x ?? p.x, lz = g.camLook?.z ?? p.z, rv = Math.max(70, (g.viewR ?? 30) + R.viewPad);
    return Math.hypot(x - lx, z - lz) < rv || Math.hypot(x - p.x, z - p.z) < rv;
  }
  me() { const p = this.g.player, v = p.inVehicle; return { x: v ? v.x : p.x, z: v ? v.z : p.z }; }

  // ---- births ----------------------------------------------------------------------------------------------------------
  // A road person is born on the corridor you are near, birthR along it from you, out of sight. Returns the record or why not.
  birth(kind = null, { seed = null, force = false, cor = null, s = null } = {}) {
    const g = this.g, me = this.me(), now = this.hours();
    const rng = rngOf(seed ?? hash32(Math.floor(now * 7) + this.nid * 131, this.list.length, 0x50554c4c));
    kind ??= wpick(rng, BIRTH_W);
    const K = KINDS[kind];
    if (!K?.road) return { ok: false, why: `${kind} is not a road pull` };
    if (!force && this.list.filter((p) => KINDS[p.kind]?.road && p.state !== 'gone').length >= R.maxRoad) return { ok: false, why: 'the road is full' };
    let C = cor ? this.cor(cor) : null, ps = null;
    if (!C) { let bd = 3000; for (const c of this.cors()) { const pr = c.project?.(me.x, me.z, 3000); if (pr && pr.d < bd) { bd = pr.d; C = c; ps = pr.s; } } }
    else ps = C.project?.(me.x, me.z, 1e6)?.s ?? 0;
    if (!C) return { ok: false, why: 'no road near you: road people live on the road' };
    let at = null, ss = s;
    for (let k = 0; k < 24 && !at; k++) {
      if (s === null) ss = ps + (rng() < 0.5 ? -1 : 1) * roll(rng, R.birthR);
      if (ss < 200 || ss > C.L - 200 || this.island(C, ss)) { if (s !== null) break; continue; }
      const side = rng() < 0.5 ? -1 : 1, q = this.onRoad(C, ss, side);
      if (Math.hypot(q.x - me.x, q.z - me.z) < R.birthR[0] || this.inView(q.x, q.z)) { if (s !== null) break; continue; } // never at you, never in sight
      at = { s: ss, side, x: q.x, z: q.z };
    }
    if (!at) return { ok: false, why: 'nowhere on this road out of your sight' };
    const { lo, hi } = this.bracket(C.id, at.s);
    const toHi = lo && hi ? rng() < 0.5 : !!hi;
    const from = toHi ? lo : hi, to = toHi ? hi : lo;
    const id = `pull${++this.nid}`;
    const rec = { id, kind, state: K.walks ? 'walking' : kind === 'wreck' ? 'lying' : 'waiting', cor: C.id, s: at.s, side: at.side, dir: toHi ? 1 : -1, x: at.x, z: at.z,
      from: from?.id ?? null, to: to?.id ?? null, born: now, lastH: now, deadline: K.deadline ? now + roll(rng, K.deadline) : null, seed: hash32(rng() * 1e9 | 0, this.nid, 7),
      people: [], stock: (K.stock ?? []).map(([it, a, b]) => [it, iroll(rng, [a, b])]).filter((x) => x[1] > 0), live: false, car: K.car ? { type: K.car, v: null } : null, fact: null };
    const n = iroll(rng, K.people ?? [1, 1]);
    for (let i = 0; i < n; i++) rec.people.push(this.person(rec, i, rng, K));
    this.list.push(rec);
    this.stats.born++;
    this.announce(rec, rng);
    g.emit('pullBorn', { id, kind, cor: C.id, s: Math.round(at.s), x: Math.round(at.x), z: Math.round(at.z), dist: Math.round(Math.hypot(at.x - me.x, at.z - me.z)) });
    return { ok: true, rec };
  }
  person(rec, i, rng, K) {
    const g = this.g, seed = hash32(rec.seed, i, 0x50455253);
    const items = (K.items ?? []).map(([it, a, b]) => [it, iroll(rng, [a, b])]).filter((x) => x[1] > 0);
    const rob = K.rob ? rng() < K.rob : false, purse = iroll(rng, K.purse ?? [0, 0]);
    const p = { n: i, seed, name: `${K.name[Math.min(i, K.name.length - 1)]}`, flag: g.randomFlag(rngOf(seed)), hp: K.dead ? 0 : rec.kind === 'medic' || rec.kind === 'missing' ? 28 : 100, purse, items, dead: !!K.dead, rob, weapon: rob ? 'pistol' : null, rounds: rob ? 6 : 0, c: null, pay: K.pay ? Math.min(purse, iroll(rng, K.pay)) : 0 };
    this.k.holder(`p:${rec.id}:${i}`, { name: p.name, kind: 'person', x: rec.x, z: rec.z });
    return p;
  }

  // Who learns of a new pull, and how (its row's heard list): the town it left, its own CB, or nobody (seen only).
  announce(rec, rng) {
    const K = KINDS[rec.kind], C = this.cor(rec.cor), to = this.node(rec.to), from = this.node(rec.from);
    const who = rec.people.length > 1 ? `${rec.people.length} people` : 'somebody';
    const text = (WORDS[rec.kind] ?? (() => rec.kind))({ who: who === 'somebody' ? (rec.kind === 'hitchhiker' ? 'a hitchhiker' : 'a driver') : who, road: C ? this.roadName(C) : 'road', toName: to?.name ?? 'the next town', fromName: from?.name ?? 'town', mile: C ? this.mileOf(C, rec.s) : 0, n: rec.people.length });
    const f = this.k.record({ what: rec.kind, subject: rec.id, text: cap(text), where: { x: rec.x, z: rec.z, place: C ? `${C.id} mile ${this.mileOf(C, rec.s)}` : null }, who: rec.people[0]?.name ?? null, data: { to: rec.to } });
    rec.fact = f.id;
    // the people themselves know (they tell whoever picks them up, or the town they came from)
    for (const p of rec.people) if (!p.dead) this.k.see(`p:${rec.id}:${p.n}`, f, null);
    if (from && (K.heard.includes('said') || K.heard.includes('grapevine')) && !K.dead) this.k.put(`town:${from.id}`, f, { channel: 'said', from: `p:${rec.id}:0`, fromName: rec.people[0]?.name }, CHANNELS.said.conf, 1);
    if (K.dead) { const near = this.nearestNode(rec.x, rec.z); if (near) { this.k.holder(`road:${rec.id}`, { name: 'a passing trader', x: rec.x, z: rec.z }); this.k.put(`road:${rec.id}`, f, { channel: 'saw', from: `road:${rec.id}` }, 1, 0); rec.findAt = this.hours() + 1 + rng() * 6; } }
    if (K.heard.includes('radio')) rec.radioAt = this.hours();
  }

  // A pull called in on the radio from a real place: a medic call (a homestead, a ruin, the shoulder of the road).
  call(kind = 'medic', { seed = null, x = null, z = null } = {}) {
    const g = this.g, now = this.hours(), me = this.me(), rng = rngOf(seed ?? hash32(Math.floor(now * 11), this.nid, 0x4d454443));
    const K = KINDS[kind];
    let at = x !== null ? { x, z } : null;
    if (!at) for (let k = 0; k < 30 && !at; k++) {
      // the shoulder of a road, or a rural parcel, 600-2400 m from you, out of sight
      const cand = rng() < 0.5 ? this.ruralNear(me, rng) : null;
      const q = cand ?? (() => { const b = this.birthSpot(rng); return b; })();
      if (!q) continue;
      if (Math.hypot(q.x - me.x, q.z - me.z) < 500 || this.inView(q.x, q.z)) continue;
      at = q;
    }
    if (!at) return { ok: false, why: 'nowhere out of your sight to call from' };
    if (this.inView(at.x, at.z)) return { ok: false, why: 'a caller is never born in your sight' };
    const id = `pull${++this.nid}`;
    const rec = { id, kind, state: 'waiting', x: at.x, z: at.z, cor: at.cor ?? null, s: at.s ?? null, side: at.side ?? 1, born: now, lastH: now, deadline: now + roll(rng, K.deadline), seed: hash32(rng() * 1e9 | 0, this.nid, 9), people: [], stock: [], live: false, car: null, fact: null, radioAt: now };
    rec.people.push(this.person(rec, 0, rng, K));
    const near = this.nearestNode(at.x, at.z);
    const placeName = at.place ?? (near ? `${compass(near, at)} of ${near.name}` : 'the flats');
    const hours = Math.max(1, Math.round(rec.deadline - now));
    const f = this.k.record({ what: kind, subject: id, text: cap(WORDS[kind]({ who: 'somebody', placeName, hours })), where: { x: at.x, z: at.z, place: placeName }, who: rec.people[0].name, life: rec.deadline - now, ends: rec.deadline });
    rec.fact = f.id;
    this.k.see(`p:${id}:0`, f, null);
    this.list.push(rec); this.stats.born++;
    g.emit('pullBorn', { id, kind, x: Math.round(at.x), z: Math.round(at.z), dist: Math.round(Math.hypot(at.x - me.x, at.z - me.z)), deadline: r1(rec.deadline) });
    return { ok: true, rec };
  }
  birthSpot(rng) {
    const me = this.me();
    for (const c of this.cors()) {
      const pr = c.project?.(me.x, me.z, 3500); if (!pr || pr.d > 3500) continue;
      const s = pr.s + (rng() < 0.5 ? -1 : 1) * roll(rng, [700, 2400]);
      if (s < 200 || s > c.L - 200 || this.island(c, s)) continue;
      const side = rng() < 0.5 ? -1 : 1, q = this.onRoad(c, s, side);
      return { x: q.x, z: q.z, cor: c.id, s, side, place: `${c.id} mile ${this.mileOf(c, s)}` };
    }
    return null;
  }
  ruralNear(me, rng) {
    const L = (this.g.citygen?.plan ?? []).filter((r) => r.kind === 'rural' && Math.hypot(r.x - me.x, r.z - me.z) < 2600 && Math.hypot(r.x - me.x, r.z - me.z) > 600);
    if (!L.length) return null;
    const r = pick(rng, L);
    const n = this.nearestNode(r.x, r.z);
    return { x: r.x + (rng() - 0.5) * 10, z: r.z + (rng() - 0.5) * 10, place: `a ${String(r.name).toLowerCase()} ${n ? `${compass(n, r)} of ${n.name}` : 'out on the flats'}` };
  }

  // A town posts work: a bounty, a work order, a missing person. It goes on the town's board and into the town's talk.
  post(kind, townId = null, { seed = null } = {}) {
    const g = this.g, now = this.hours(), me = this.me();
    const T = townId ? this.node(townId) : this.nearestNode(me.x, me.z);
    if (!T) return { ok: false, why: 'no town' };
    const rng = rngOf(seed ?? hash32(Math.floor(now * 13), this.nid, 0x504f5354)), K = KINDS[kind];
    const id = `pull${++this.nid}`;
    const rec = { id, kind, state: 'posted', town: T.id, x: T.x, z: T.z, born: now, lastH: now, deadline: null, seed: hash32(rng() * 1e9 | 0, this.nid, 11), people: [], stock: [], live: false, car: null, fact: null };
    let text = '', where = { x: T.x, z: T.z, place: T.name };
    if (kind === 'bounty') {
      const camps = (g.world?.spawns?.camps ?? []).map((c, i) => ({ ...c, i })).sort((a, b) => Math.hypot(a.x - T.x, a.z - T.z) - Math.hypot(b.x - T.x, b.z - T.z));
      const cp = camps[0];
      if (!cp) return { ok: false, why: 'no raider camp near this town' };
      rec.camp = { x: cp.x, z: cp.z, i: cp.i, name: g.society?.places?.[`camp_${cp.i}`]?.name ?? 'the camp' };
      rec.kills = iroll(rng, K.kills); rec.tally = 0; rec.pay = Math.min(T.purse, iroll(rng, K.pay));
      text = WORDS.bounty({ fromName: T.name, pay: rec.pay, kills: rec.kills, placeName: rec.camp.name }); where = { x: cp.x, z: cp.z, place: rec.camp.name };
    } else if (kind === 'work') {
      const [it, a, b] = pick(rng, K.want); rec.want = { id: it, n: iroll(rng, [a, b]) }; rec.pay = Math.min(T.purse, iroll(rng, K.pay));
      text = WORDS.work({ fromName: T.name, n: rec.want.n, itemName: (ITEMS[it]?.name ?? it).toLowerCase(), pay: rec.pay });
    } else if (kind === 'missing') {
      // a real person out on the road, hurt, somewhere toward the place named (the town only knows the direction)
      const b = this.birthSpot(rng) ?? { x: T.x + 900, z: T.z, place: 'the flats' };
      if (this.inView(b.x, b.z)) return { ok: false, why: 'never born in your sight' };
      rec.x = b.x; rec.z = b.z; rec.cor = b.cor ?? null; rec.s = b.s ?? null; rec.side = b.side ?? 1; rec.state = 'waiting'; rec.deadline = now + roll(rng, K.deadline);
      rec.people.push(this.person(rec, 0, rng, K)); rec.people[0].name = `${pick(rng, ['Ada', 'Ruben', 'Lucia', 'Tomas', 'Wen', 'Ike', 'Mara', 'Dale'])} ${pick(rng, ['Okafor', 'Reyes', 'Kowal', 'Brandt', 'Ito', 'Haddad', 'Sauer', 'Mbeki'])}`;
      rec.pay = Math.min(T.purse, iroll(rng, K.reward)); rec.to = T.id; // the family pays out of the town's chest when they are home
      // the town's guess of where (it can be wrong: up to 400 m off the real spot)
      where = { x: b.x + (rng() - 0.5) * 800, z: b.z + (rng() - 0.5) * 800, place: b.place };
      text = WORDS.missing({ who: rec.people[0].name, fromName: T.name, placeName: b.place });
    } else return { ok: false, why: `${kind} is not posted by a town` };
    const f = this.k.record({ what: kind, subject: id, text: cap(text), where, who: rec.people[0]?.name ?? T.name, life: K.deadline ? rec.deadline - now : FACT_KINDS[kind].life, ends: K.deadline ? rec.deadline : null });
    rec.fact = f.id;
    const board = this.k.holder(`board:${T.id}`, { name: `the ${T.name} board`, kind: 'board', x: T.x, z: T.z, cap: R.townHolds });
    this.k.put(board.id, f, { channel: 'board', from: `town:${T.id}`, fromName: T.name }, 1, 0);
    this.k.put(`town:${T.id}`, f, { channel: 'said', from: `town:${T.id}`, fromName: T.name }, 1, 0);
    this.list.push(rec); this.stats.born++;
    g.emit('pullBorn', { id, kind, town: T.id });
    return { ok: true, rec };
  }

  // ---- the clock -------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.enabled) return;
    this.t += dt; this.needT += dt;
    if (this.t < R.tick) return;
    const step = this.t; this.t = 0;
    this.tick(step);
  }
  tick(step = R.tick) {
    const g = this.g, now = this.hours(), me = this.me(), P = this.k.holder('player');
    P.x = me.x; P.z = me.z;
    this.nodes();
    if (this.hourAt === null) this.hourAt = now;
    if (this.nextBirth === null) this.nextBirth = now + 1;
    // births on the clock
    if (now >= this.nextBirth) { this.nextBirth = now + roll(rngOf(hash32(Math.floor(now * 3), 5, 5)), R.birthEvery); this.birth(); }
    for (const rec of this.list) this.advance(rec, now, me);
    // the hour: the grapevine's trucks leave, broadcasts repeat
    if (now - this.hourAt >= 1 || now < this.hourAt) { this.hourAt = now; this.spread(now); }
    this.k.deliver();
    this.bars_(me);
    this.see(me, now);
    if (this.needT >= R.needEvery) { this.needT = 0; this.needs(); }
    this.ride(step);
    // a hired gun's days are up: they say so and go back to their bar's town (the pay stays theirs)
    for (const b of this.bars.values()) for (const d of b.drinkers) if (d.hired && now >= d.until) {
      d.hired = false;
      if (d.c?.alive) { g.seats.dismiss(d.c); d.c.home = { x: b.x, z: b.z }; g.hud?.subtitle?.(`${d.name}: "That is the days you paid for."`, 4); if (b.live) d.c.barRole = 'gun'; else { if (g.chars.includes(d.c)) g.removeChar(d.c); d.c = null; } }
      g.emit('hireEnded', { bar: b.id, n: d.n });
    }
    // the gone are forgotten by the world (their facts live on in whoever holds them)
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].state === 'gone' && !this.list[i].live) this.list.splice(i, 1);
  }

  // One record forward on the world clock.
  advance(rec, now, me) {
    const dh = Math.max(0, now - rec.lastH); rec.lastH = now;
    const K = KINDS[rec.kind] ?? {}, C = rec.cor ? this.cor(rec.cor) : null;
    // walking: on screen the body walks (think) and the record follows it; off screen the record walks the same pace
    if (rec.state === 'walking' && C) {
      if (rec.live && rec.people[0]?.c?.alive && !rec.people[0].c.inVehicle) { const c = rec.people[0].c, pr = C.project?.(c.x, c.z, 60); if (pr) rec.s = pr.s; rec.x = c.x; rec.z = c.z; }
      else if (!rec.live) { rec.s += rec.dir * this.walkPerHour() * dh; const q = this.onRoad(C, rec.s, rec.side); rec.x = q.x; rec.z = q.z; }
      const to = this.node(rec.to);
      if (to && to.s !== null && (rec.dir > 0 ? rec.s >= to.s - R.townR : rec.s <= to.s + R.townR)) this.arrive(rec, to);
      else if (rec.s <= 0 || rec.s >= C.L) rec.state = 'gone';
    }
    // the clock decides without you: a caller bleeds out, a caravan gets hit, the missing die where they lie
    if (rec.deadline !== null && now >= rec.deadline && (rec.state === 'waiting')) this.expire(rec);
    // a CB keeps calling while somebody is alive to call
    if (rec.radioAt !== undefined && rec.state === 'waiting' && now >= rec.radioAt && rec.people.some((p) => !p.dead)) {
      rec.radioAt = now + R.radioEvery;
      const f = this.k.fact(rec.fact); if (f) this.k.broadcast(f, rec.x, rec.z, CHANNELS.radio.range, rec.kind === 'medic' ? 'a voice on the CB' : 'a CB on the road');
    }
    // a wreck is found by a passing trader, who tells the nearest town (after the drive there)
    if (rec.findAt && now >= rec.findAt) { rec.findAt = null; const n = this.nearestNode(rec.x, rec.z); if (n) this.k.sendWire(`road:${rec.id}`, `town:${n.id}`, rec.fact); }
    // the people's holders stand where they stand
    for (const p of rec.people) { const h = this.k.holders.get(`p:${rec.id}:${p.n}`); if (h) { h.x = p.c?.x ?? rec.x; h.z = p.c?.z ?? rec.z; } }
    // bodies near you, records far from you
    const d = Math.hypot(rec.x - me.x, rec.z - me.z);
    if (!rec.live && d < R.promoteR && rec.people.length && rec.state !== 'gone' && rec.state !== 'arrived') this.promote(rec);
    else if (rec.live && d > R.demoteR && !rec.people.some((p) => p.c?.inVehicle)) this.demote(rec);
    // the bounty: kills counted as they happen (onKill); a work order waits at the bar
  }
  arrive(rec, to) {
    rec.state = 'arrived'; this.stats.arrived++;
    // they tell the town what they saw on the road (their own copies), and the town knows they made it
    for (const p of rec.people) { if (p.dead) continue; const h = this.k.holders.get(`p:${rec.id}:${p.n}`); if (h) for (const c of h.facts) if (c.id !== rec.fact) this.k.put(`town:${to.id}`, this.k.fact(c.id) ?? c, { channel: 'said', from: h.id, fromName: p.name }, c.conf * CHANNELS.said.conf, c.hops + 1); }
    const f = this.k.record({ what: 'outcome', subject: rec.id, text: `${cap(rec.people.length > 1 ? `the ${rec.kind} party` : `the ${rec.kind}`)} made it to ${to.name}`, where: { x: to.x, z: to.z, place: to.name }, who: rec.people[0]?.name });
    this.k.put(`town:${to.id}`, f, { channel: 'saw', from: `town:${to.id}`, fromName: to.name }, 1, 0);
    this.g.emit('pullArrived', { id: rec.id, kind: rec.kind, town: to.id });
    if (!rec.live) rec.state = 'gone';
  }
  expire(rec) {
    const g = this.g;
    if (rec.kind === 'caravan') { this.hit(rec); return; }
    // nobody knows it yet: the world records it; whoever sees the body learns it (see())
    rec.outcome ??= this.k.record({ what: 'outcome', subject: rec.id, text: `${rec.people[0]?.name ?? 'The caller'} died waiting: nobody came`, where: { x: rec.x, z: rec.z, place: this.k.fact(rec.fact)?.where?.place ?? null }, who: rec.people[0]?.name }).id;
    // bleeds out where they lie: the body stays (with what they carried)
    for (const p of rec.people) {
      if (p.dead) continue;
      if (p.c?.alive) { g.combat.kill(p.c, null, 0, 0, 'bleed'); continue; } // onKill lays the body with what they carried
      p.dead = true; p.hp = 0; this.stats.died++;
    }
    rec.state = 'dead';
    g.emit('pullExpired', { id: rec.id, kind: rec.kind, died: rec.people.length });
  }
  // The caravan's clock: raiders reach it. With you there (inside the promote radius) they come up the road for real and
  // it is a fight; without you the load is taken and the hands killed, and the world records it.
  hit(rec) {
    const g = this.g, me = this.me();
    if (rec.live && Math.hypot(rec.x - me.x, rec.z - me.z) < R.promoteR) {
      if (rec.raided) return;
      rec.raided = true; rec.deadline = this.hours() + 2;
      const C = this.cor(rec.cor), rng = rngOf(hash32(rec.seed, 77, 1));
      // they come up the road from beyond your sight
      for (let i = 0; i < 3 && C; i++) {
        let q = null;
        for (let k = 0; k < 12 && !q; k++) { const s = rec.s + (rng() < 0.5 ? -1 : 1) * roll(rng, [140, 220]); const t = this.onRoad(C, s, rec.side); if (!this.inView(t.x, t.z)) q = t; }
        if (!q) continue;
        const c = g.addChar({ x: q.x, z: q.z, faction: 'raider', weapon: pick(rng, ['pistol', 'smg', 'shotgun']), hp: 90, name: 'Dustwolf', flag: g.randomFlag(rng) });
        if (!c) break;
        c.target = rec.people.find((p) => p.c?.alive)?.c ?? g.player; c.leash = 260; c.pullRaider = rec.id;
      }
      g.emit('caravanRaided', { id: rec.id, withYou: true });
      return;
    }
    let lost = 0;
    for (const p of rec.people) if (!p.dead) { p.dead = true; p.hp = 0; lost++; }
    rec.takenStock = rec.stock; rec.stock = []; // the load went with the raiders (it is theirs now: law 2, nothing is minted or lost)
    rec.state = 'dead'; this.stats.died += lost;
    rec.outcome = this.k.record({ what: 'outcome', subject: rec.id, text: 'The caravan was hit on the road: the load is gone, the hands are dead', where: { x: rec.x, z: rec.z, place: this.k.fact(rec.fact)?.where?.place }, who: null }).id;
    g.emit('caravanRaided', { id: rec.id, withYou: false, lost });
  }

  // The hour: each town's fresh news (heard in the last 8 hours, not too many hops) goes out on the trucks.
  spread(now) {
    for (const n of this.nodes()) {
      const h = this.k.holders.get(`town:${n.id}`); if (!h || !h.facts.length) continue;
      for (const c of h.facts) { if (now - c.heard > 8 || c.hops >= R.hopsMax) continue; for (const m of this.neighbours(n)) this.k.sendWire(h.id, `town:${m.id}`, c.id); }
    }
  }

  // Your own eyes: a road person in sight (day or night range, line of sight) is a fact you hold now.
  see(me, now) {
    const g = this.g, p = g.player, night = (g.sky?.night ?? 0) > 0.5, range = night ? R.sightNight : R.sightDay;
    for (const rec of this.list) {
      if (!rec.live || !rec.fact) continue;
      for (const q of rec.people) {
        let c = q.c;
        if (!c && q.dead && q.riteId) { const Rb = g.rites?.bodies?.get(q.riteId); if (Rb) c = Rb.c ?? { x: Rb.x, z: Rb.z, alive: false, rite: true }; } // a folded body is still there to be found
        if (!c) continue;
        const d = Math.hypot(c.x - me.x, c.z - me.z);
        if (d > range) continue;
        if (!(p.inVehicle || c.rite ? g.los(me.x, me.z, c.x, c.z) : g.sees(p, c))) continue;
        // the living: where they are now; the dead: how it ended (a corpse never renews a call)
        if (c.alive || rec.kind === 'wreck') { const f = this.k.fact(rec.fact); if (f) this.k.see('player', f, { x: c.x, z: c.z }); }
        else if (rec.outcome) { const o = this.k.fact(rec.outcome); if (o && !this.k.holds('player', o.id)) this.k.see('player', o, { x: c.x, z: c.z }); }
        // a note on a body is read standing over it (written: the one who wrote it is the source)
        if (!c.alive && rec.note && d < CHANNELS.note.range + 1 && !this.k.holds('player', rec.note)) {
          const n = this.k.fact(rec.note);
          if (n && this.k.put('player', n, { channel: 'note', from: `p:${rec.id}:${q.n}`, fromName: q.name }, CHANNELS.note.conf, 0)) g.hud?.subtitle?.(n.text, 6);
        }
        break;
      }
    }
    // a town you stand in is a town you know
    const n = this.nearestNode(me.x, me.z, 700);
    if (n && !this.visited.has(n.id)) this.visited.add(n.id);
  }

  // ---- bodies ----------------------------------------------------------------------------------------------------------
  promote(rec) {
    const g = this.g, C = rec.cor ? this.cor(rec.cor) : null;
    const tx = C ? C.at(Math.max(0, Math.min(C.L, rec.s ?? 0))).tx : 1, tz = C ? C.at(Math.max(0, Math.min(C.L, rec.s ?? 0))).tz : 0;
    if (rec.car && !rec.car.v && C) {
      // the car on the shoulder, nose along the road (a wreck: dead; stranded: a dry tank; a caravan's: a broken axle)
      const q = this.onRoad(C, rec.s + rec.dir * 4, rec.side), h = Math.atan2(tx * rec.dir, tz * rec.dir);
      const v = g.vehiclesSys.spawn(rec.car.type, q.x, q.z, h, rec.kind === 'wreck' ? '#4a3a2a' : '#7a5a3a');
      if (v) {
        v.pullCar = rec.id; v.parked = true; rec.car.v = v;
        if (rec.kind === 'wreck') { v.dead = true; v.hp = 0; v.mesh.material = g.vehiclesSys.wreckMat ?? v.mesh.material; }
        else if (rec.kind === 'stranded') { v.fuel = rec.car.fuel ?? 0; }
        else if (rec.kind === 'caravan') { v.hp = Math.min(v.hp, v.maxHp * 0.35); v.pullBroken = true; }
        if (rec.stock.length && rec.kind === 'caravan') { const box = g.inventory?.trunk?.(v); if (box && !box.pullFilled) { box.slots = rec.stock.map(([id, n]) => ({ id, n })); box.rolled = true; box.pullFilled = true; box.owner = 'caravan'; box.ownerName = 'the caravan'; } }
      }
    }
    for (const p of rec.people) {
      if (p.c) continue;
      if (p.dead && p.riteId && g.rites?.bodies?.has(p.riteId)) continue; // the dead are the rites' record now (systems/rites.js draws and ages them)
      const o = p.n * 1.4, dir = rec.dir ?? 1, q = { x: rec.x - tz * o * dir * 0.6 + tx * o * 0.3, z: rec.z + tx * o * dir * 0.6 + tz * o * 0.3 }; // a party stands in a loose line on the shoulder
      const c = g.addChar({ x: q.x, z: q.z, faction: 'drifter', weapon: null, hp: 100, colors: outfit('drifter', rngOf(p.seed)), name: p.name, flag: p.flag });
      if (!c) break;
      c.pullRec = rec.id; c.pullN = p.n; c.home = { x: q.x, z: q.z }; c.hp = Math.max(1, p.hp);
      if (p.dead) { c.alive = false; c.hp = 0; c.deadTime = 1; c.blood = 0.7; g.charR.paint(c); this.layBody(rec, p, c); const Rb = g.rites?.onDeath?.(c, null, rec.kind === 'wreck' ? 'vehicle' : 'bleed'); if (Rb) { Rb.at = rec.deadline ?? rec.born; p.riteId = Rb.id; } } // died off screen: the body goes on the rites' clock from when it happened
      else if (rec.kind === 'medic' || rec.kind === 'missing') { c.bleed = 0.25; c.blood = 0.5; g.charR.paint(c); }
      g.standOn?.(c);
      p.c = c;
    }
    rec.live = true; this.stats.promoted++;
    // a note on the wreck's body (a written fact: read it at the body)
    if (rec.kind === 'wreck' && !rec.note) rec.note = this.k.record({ what: 'place', subject: rec.id, text: `A note in the driver's pocket: "${pick(rngOf(rec.seed), ['Went for fuel at the next town. If I am not back, the kids are at the culvert past mile', 'They took the water at the overpass. Do not stop for the woman with the dog. Mile', 'Left the spare rounds under the third pole past mile'])} ${C ? this.mileOf(C, rec.s) + 2 : 0}."`, where: { x: rec.x, z: rec.z, place: C ? `${C.id} mile ${this.mileOf(C, rec.s)}` : null }, who: rec.people[0]?.name }).id;
  }
  demote(rec) {
    const g = this.g;
    for (const p of rec.people) {
      const c = p.c; if (!c) continue;
      if (c.inVehicle) continue;
      p.hp = c.alive ? Math.round(c.hp) : 0; if (!c.alive && !p.dead) { p.dead = true; }
      if (!c.alive && c.riteId) p.riteId = c.riteId; // the rites keep the body (folded when it leaves the world)
      if (c.follower) { p.c = null; continue; } // a hired hand goes with you, not back onto the record
      if (g.chars.includes(c)) g.removeChar(c);
      p.c = null;
    }
    if (rec.car?.v) { const v = rec.car.v; if (!v.driver && !(v.occ ?? []).some(Boolean)) { rec.car.fuel = v.fuel; g.vehiclesSys.remove(v); rec.car.v = null; } }
    rec.live = rec.people.some((p) => p.c);
    this.stats.demoted++;
    if (!rec.live && (rec.state === 'arrived' || rec.state === 'saved')) rec.state = 'gone';
  }
  // A body holds what the person carried: their purse as cash, their items, their gun - nothing rolled (law 2).
  layBody(rec, p, c) {
    const inv = this.g.inventory; if (!inv) return;
    const id = `body:${c.id}`;
    let box = inv.boxes.get(id);
    if (!box) box = inv.place(id, 'person', c.x, c.z, 20, `${(p.name ?? 'SOMEBODY').toUpperCase()} (DEAD)`);
    box.slots = p.items.map(([it, n]) => ({ id: it, n }));
    if (p.weapon && ITEMS[`gun_${p.weapon}`]) box.slots.push({ id: `gun_${p.weapon}`, n: 1, cond: 0.7, loaded: p.rounds });
    box.rolled = true; box.pullBody = rec.id;
    // their purse spills where they lie: exactly what they had, picked up once (main.js updatePickups reads amount)
    if (p.purse > 0 && !p.spilled) { this.g.dropPickup?.(c.x + 0.7, c.z, 'cash'); const pk = this.g.pickups?.[this.g.pickups.length - 1]; if (pk) pk.amount = p.purse; p.spilled = p.purse; p.purse = 0; }
  }

  onKill(c, attacker) {
    if (c.pullRec) {
      const rec = this.byId(c.pullRec), p = rec?.people[c.pullN];
      if (p && !p.dead) {
        p.dead = true; p.hp = 0; this.layBody(rec, p, c); this.stats.died++;
        if (!rec.people.some((q) => !q.dead)) rec.state = 'dead';
        rec.outcome ??= this.k.record({ what: 'outcome', subject: rec.id, text: `${p.name} was killed on the road${attacker === this.g.player ? ' (by you)' : ''}`, where: { x: c.x, z: c.z }, who: p.name }).id;
      }
    }
    if (c.barRole) { const b = this.bars.get(c.barId); const d = b?.drinkers?.[c.barN]; if (d) d.dead = true; if (c.barRole === 'keep' && b) b.keepDead = true; }
    // bounties: a raider put down near the posted camp, by you
    if (attacker === this.g.player && c.faction === 'raider') for (const rec of this.list) if (rec.kind === 'bounty' && rec.state === 'posted' && Math.hypot(c.x - rec.camp.x, c.z - rec.camp.z) < 160) rec.tally++;
  }

  // A promoted body's own mind (ai.js calls it before the general branches; false hands back to the general AI: a fight,
  // a flight). Walkers walk their shoulder; the waiting wait; the hurt lie still.
  think(c, dt) {
    if (c.target || c.flee > 0 || c.follower) return false;
    if (c.barRole) { c.speed = 0; return true; }
    const rec = this.byId(c.pullRec); if (!rec) return false;
    if (this.g.dialogue?.active && this.g.dialogue.npc === c) return false;
    if (rec.state === 'walking') {
      const C = this.cor(rec.cor); if (!C) return false;
      const pr = C.project?.(c.x, c.z, 80), s = (pr?.s ?? rec.s) + rec.dir * 6, q = this.onRoad(C, s, rec.side), o = c.pullN * 1.2;
      this.g.ai.move(c, q.x - c.x - q.tz * o * 0, q.z - c.z, R.walk, dt);
      return true;
    }
    if (rec.state === 'boarding') {
      const v = rec.rideV; if (!v) return false;
      const d = Math.hypot(v.x - c.x, v.z - c.z);
      if (d < 3.2) { this.boardNow(rec, c, v); return true; }
      this.g.ai.move(c, v.x - c.x, v.z - c.z, 2.6, dt);
      return true;
    }
    c.speed = 0;
    return true;
  }

  // ---- talking -------------------------------------------------------------------------------------------------------
  // The dialogue for one of ours (ui/dialogue.js asks before a stranger's small talk): { text, choices } or null.
  talkFor(c) {
    if (c.barRole) return this.barTalk(c);
    const rec = c.pullRec ? this.byId(c.pullRec) : null; if (!rec) return null;
    const p = rec.people[c.pullN], g = this.g, K = KINDS[rec.kind] ?? {};
    const hid = `p:${rec.id}:${p.n}`, H = this.k.holder(hid); H.x = c.x; H.z = c.z;
    const leave = { t: '[Leave]', end: true };
    const tellOne = () => this.tellPlayer(hid);
    const ch = [];
    ch.push({ t: 'Seen anything on the road?', reply: () => { const r = tellOne(); return r ? `"${r.text}."` : '"Nothing you would want to hear."'; } });
    if (rec.kind === 'hitchhiker' || rec.kind === 'refugees' || rec.kind === 'missing' || (rec.kind === 'stranded' && rec.state === 'waiting')) {
      const v = this.nearCar();
      ch.push({ t: v ? `Get in. I can take you${rec.to ? ` toward ${this.node(rec.to)?.name ?? 'town'}` : ''}.` : '(You have no car close enough to offer a ride.)', locked: v ? undefined : 'no car within 14 m', do: () => this.offerRide(rec, v), end: true });
    }
    if ((rec.kind === 'medic' || rec.kind === 'missing') && c.alive) ch.unshift({ t: 'Let me look at that.', reply: () => { const r = this.help(rec.id); return r.ok ? `"${r.line}"` : `(${r.why})`; } });
    if (rec.kind === 'stranded' && rec.state === 'waiting') ch.unshift({ t: 'I have fuel. (a fuel can)', reply: () => { const r = this.help(rec.id); return r.ok ? `"${r.line}"` : `(${r.why})`; } });
    if (rec.kind === 'refugees') ch.unshift({ t: 'Here, take some food.', reply: () => { const r = this.help(rec.id); return r.ok ? `"${r.line}"` : `(${r.why})`; } });
    if (rec.kind === 'trader') for (const [it, n] of rec.stock) if (n > 0) ch.push({ t: `Buy ${(ITEMS[it]?.name ?? it).toLowerCase()} ($${this.price(it)}) · ${n} left`, reply: () => { const r = this.buy(rec.id, it); return r.ok ? `"There you go." (${r.left} left)` : `(${r.why})`; } });
    if (rec.kind === 'caravan' && rec.state === 'waiting') ch.unshift({ t: 'I will stand with you till the road clears.', reply: () => '"Then stay close. They come up the road at dusk."' });
    ch.push(leave);
    const open = { hitchhiker: '"Going my way?"', stranded: '"Tank ran dry a mile back. You carry any fuel?"', caravan: '"Axle went. If you have a gun, we could use it."', refugees: '"We walked from the east. There is nothing back there."', trader: '"Looking or buying?"', medic: '"You heard me? On the radio? Please..."', missing: '"Is somebody looking for me? I can\'t walk on this leg."' }[rec.kind] ?? '"..."';
    return { text: open, choices: ch.slice(0, 9) };
  }
  // Tell the player one fact this holder has that the player doesn't (the freshest pull first). Returns the copy or null.
  tellPlayer(hid, channel = 'said') {
    const H = this.k.holders.get(hid), P = this.k.holder('player'), me = this.me(); P.x = me.x; P.z = me.z;
    if (!H) return null;
    const pool = H.facts.filter((c) => !this.k.holds('player', c.id)).sort((a, b) => (FACT_KINDS[b.what]?.pull ? 1 : 0) - (FACT_KINDS[a.what]?.pull ? 1 : 0) || b.heard - a.heard);
    for (const c of pool) { const got = this.k.tell(hid, 'player', c.id, channel, { force: true }); if (got) return got; }
    return null;
  }
  nearCar() { const g = this.g, p = g.player; const v = p.inVehicle ?? g.lastVehicle; return v && !v.dead && Math.hypot(v.x - p.x, v.z - p.z) < 14 && g.seats.freeSeat(v, { passengerOnly: true }) >= 0 ? v : null; }

  // Offer a ride: they walk to the car and take a real passenger seat (systems/seats.js).
  offerRide(rec, v = this.nearCar()) {
    if (!v) return { ok: false, why: 'no car with a free seat within 14 m' };
    const p = rec.people.find((q) => q.c?.alive && !q.c.inVehicle); if (!p) return { ok: false, why: 'nobody to ride' };
    rec.prevState = rec.state; rec.state = 'boarding'; rec.rideV = v;
    if (Math.hypot(v.x - p.c.x, v.z - p.c.z) < 3.2) this.boardNow(rec, p.c, v);
    return { ok: true };
  }
  boardNow(rec, c, v) {
    const seat = this.g.seats.freeSeat(v, { passengerOnly: true });
    if (seat < 0 || !this.g.seats.board(c, v, seat)) { rec.state = rec.prevState ?? 'walking'; return false; }
    rec.state = 'riding'; rec.rideT = 0; rec.talkT = R.rideTalk * 0.4; rec.rideV = v; this.stats.rides++;
    this.g.emit('pullBoarded', { id: rec.id, vehicle: v.id, seat: v.seats[seat].id });
    return true;
  }
  // Riding: they talk on the way, ask out near where they are going (and pay out of their own purse), or rob you.
  ride(step) {
    const g = this.g;
    for (const rec of this.list) {
      if (rec.state !== 'riding') continue;
      const p = rec.people.find((q) => q.c?.inVehicle), c = p?.c, v = c?.inVehicle;
      if (!c || !v) { rec.state = 'walking'; continue; }
      rec.rideT += step; rec.talkT -= step;
      const H = this.k.holder(`p:${rec.id}:${p.n}`); H.x = v.x; H.z = v.z;
      const stopped = Math.hypot(v.vx ?? 0, v.vz ?? 0) < 1.2;
      if (p.rob && rec.rideT > R.robAfter && stopped && c.alive) {
        // the gun they carried in comes out: off the seat, on you
        g.seats.leave(c); c.weapon = p.weapon; c.mag = Math.min(WEAPONS[p.weapon]?.mag ?? 6, p.rounds); c.grudge = g.player; c.target = g.player; c.leash = 120;
        rec.state = 'robbing'; this.stats.robbed++;
        g.hud?.subtitle?.(`${p.name}: "Wallet. Keys. Now."`, 4);
        g.emit('pullRobbed', { id: rec.id, by: c.id });
        continue;
      }
      if (rec.talkT <= 0 && c.alive) { rec.talkT = R.rideTalk; const r = this.tellPlayer(H.id); if (r) g.hud?.subtitle?.(`${p.name}: "${r.text}."`, 5); }
      const to = this.node(rec.to);
      if (to && Math.hypot(v.x - to.x, v.z - to.z) < R.rideDrop + 300 && stopped) {
        g.seats.leave(c);
        let pay;
        if (rec.kind === 'missing') { pay = Math.min(to.purse, rec.pay ?? 0); to.purse -= pay; } // home: the town's chest pays what the board promised
        else { pay = Math.min(p.purse, p.pay); p.purse -= pay; }
        g.cash += pay; this.stats.paid += pay;
        rec.state = 'arrived'; this.stats.arrived++;
        g.hud?.subtitle?.(`${p.name}: "${pay ? `Here. $${pay}. It is what I have.` : 'Thank you. I have nothing to give.'}"`, 4);
        g.society?.deeds?.direct?.('rescue', c, 2);
        g.emit('pullDropped', { id: rec.id, town: to.id, paid: pay });
        this.arrive(rec, to);
      }
    }
  }
  // The help a pull asks for, given out of your own pack (the item is spent), paid out of their own purse.
  help(id) {
    const g = this.g, rec = this.byId(id); if (!rec) return { ok: false, why: 'no such pull' };
    const p = rec.people.find((q) => q.c?.alive), inv = g.inventory, me = this.me();
    if (!p) return { ok: false, why: 'nobody alive to help' };
    if (Math.hypot(p.c.x - g.player.x, p.c.z - g.player.z) > R.medicR + 1) return { ok: false, why: 'too far away' };
    if (rec.kind === 'medic' || rec.kind === 'missing') {
      const has = ['bandage', 'suture_kit', 'medkit'].find((it) => inv.carried.count(it) > 0);
      if (!has) return { ok: false, why: 'nothing in your pack to patch them with' };
      inv.spend(has, 1); p.c.hp = Math.min(p.c.maxHp ?? 100, p.c.hp + 40); p.c.bleed = 0; p.hp = Math.round(p.c.hp);
      rec.state = rec.kind === 'missing' ? 'found' : 'saved'; rec.deadline = null;
      const pay = rec.kind === 'missing' ? 0 : Math.min(p.purse, p.pay); // the missing are paid for at home, by their town p.purse -= pay; g.cash += pay; this.stats.paid += pay;
      g.society?.deeds?.direct?.('heal', p.c, 3);
      rec.outcome = this.k.record({ what: 'outcome', subject: rec.id, text: `${p.name} lived: somebody came`, where: { x: rec.x, z: rec.z } }).id;
      this.k.see('player', this.k.fact(rec.outcome), me);
      return { ok: true, line: rec.kind === 'missing' ? 'Get me home. My people will see you right.' : pay ? `You came. Take this, $${pay}.` : 'You came. I have nothing, but you came.', paid: pay, used: has };
    }
    if (rec.kind === 'stranded') {
      if (inv.carried.count('fuel_can') <= 0) return { ok: false, why: 'no fuel can in your pack' };
      inv.spend('fuel_can', 1);
      if (rec.car) rec.car.fuel = (rec.car.fuel ?? 0) + (ITEMS.fuel_can.use?.litres ?? 10); if (rec.car?.v) rec.car.v.fuel = rec.car.fuel;
      const pay = Math.min(p.purse, p.pay); p.purse -= pay; g.cash += pay; this.stats.paid += pay;
      rec.state = 'saved'; rec.deadline = null; g.society?.deeds?.direct?.('rescue', p.c, 2);
      return { ok: true, line: `That will get me there. $${pay}, and thank you.`, paid: pay };
    }
    if (rec.kind === 'refugees') {
      const food = ['beans_tin', 'peaches_tin', 'jerky', 'dried_meat'].find((it) => inv.carried.count(it) > 0);
      if (!food) return { ok: false, why: 'no food in your pack' };
      inv.spend(food, 1); rec.fed = (rec.fed ?? 0) + 1; g.society?.deeds?.direct?.('rescue', p.c, 1);
      const r = this.tellPlayer(`p:${rec.id}:${p.n}`);
      return { ok: true, line: r ? `Bless you. Listen: ${r.text}.` : 'Bless you.', told: r?.id ?? null };
    }
    return { ok: false, why: 'nothing to do for them' };
  }
  price(it) { return Math.max(1, Math.round((ITEMS[it]?.value ?? 5) * 1.4)); }
  // Buy off a trader's cart: the item moves from their stock to your pack; the cash from you to their purse.
  buy(id, it) {
    const g = this.g, rec = this.byId(id), row = rec?.stock.find((x) => x[0] === it);
    if (!row || row[1] <= 0) return { ok: false, why: 'sold out' };
    const cost = this.price(it); if (g.cash < cost) return { ok: false, why: `you need $${cost}` };
    if (!g.inventory.add(g.inventory.carried, it, 1)) return { ok: false, why: 'no room in your pack' };
    row[1]--; g.cash -= cost; rec.people[0].purse += cost; g.inventory.changed?.();
    return { ok: true, left: row[1], cost };
  }

  // ---- bars --------------------------------------------------------------------------------------------------------------
  // Every saloon of a town built near you gets its bar record (rolled once from the building's id) and, while you are
  // near, its people. The barkeep hears what is said in the town (a copy from the town's holder, said).
  bars_(me) {
    const g = this.g, cg = g.citygen; if (!cg) return;
    for (const t of cg.live.values()) {
      const rec = t.rec; if (rec.state === 'overrun') continue;
      for (const B of t.T.buildings ?? []) {
        if (B.kind !== 'saloon' || B.ruined) continue;
        let bar = this.bars.get(B.id);
        if (!bar) bar = this.makeBar(t, B);
        const keep = this.k.holder(`bar:${bar.id}`);
        // the town's talk reaches the bar
        const town = this.k.holders.get(`town:${bar.town}`);
        if (town) for (const c of town.facts) if (!keep.facts.some((x) => x.id === c.id)) this.k.tell(town.id, keep.id, c.id, 'said', { force: true });
        const d = Math.hypot(bar.x - me.x, bar.z - me.z);
        if (!bar.live && d < 140) this.promoteBar(bar);
        else if (bar.live && d > 220) this.demoteBar(bar);
      }
    }
    for (const bar of this.bars.values()) if (bar.live && !cg.live.has(bar.town)) this.demoteBar(bar);
  }
  makeBar(t, B) {
    const g = this.g, rng = rngOf(hash32(B.id.length * 31, B.x0 | 0, B.z0 | 0)), rec = t.rec;
    const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    this.ensureNode(rec);
    const bar = { id: B.id, town: rec.id, townName: titled(rec.name), name: `${titled(rec.name)} saloon`, x: cx, z: cz, y: rec.y ?? 0, w: B.x1 - B.x0, d: B.z1 - B.z0,
      front: B.front, stock: iroll(rng, BAR.stock), till: iroll(rng, BAR.purse), keep: { name: BAR.names.keep[0], flag: g.randomFlag(rng), c: null }, drinkers: [], live: false, keepDead: false };
    const n = iroll(rng, BAR.drinkers);
    for (let i = 0; i < n; i++) {
      const gun = rng() < BAR.gun.share;
      bar.drinkers.push({ n: i, seed: hash32(B.id.length, i, 0x44524b), name: gun ? BAR.names.gun[0] : pick(rng, BAR.names.drinker), flag: g.randomFlag(rng), purse: iroll(rng, BAR.drinkerPurse), gun, price: iroll(rng, BAR.gun.price), beaten: 0, hired: false, dead: false, c: null });
    }
    this.bars.set(B.id, bar);
    this.k.holder(`bar:${bar.id}`, { name: `the barkeep at ${bar.name}`, kind: 'person', x: cx, z: cz, cap: R.townHolds });
    // the town itself: a node (the plan's own) and a board in the bar
    const T = this.node(rec.id);
    if (T) this.k.holder(`board:${T.id}`, { name: `the ${T.name} board`, kind: 'board', x: cx, z: cz, cap: R.townHolds });
    return bar;
  }
  promoteBar(bar) {
    const g = this.g;
    const L = this.layout(bar), len = Math.min(L.width * 0.6, 7.5);
    const faceIn = Math.atan2(L.inX, L.inZ);
    if (!bar.keepDead && !bar.keep.c) {
      const q = L.at(1.85, 0); // behind the counter, back to the shelf
      const c = g.addChar({ x: q.x, z: q.z, faction: 'drifter', weapon: null, hp: 100, colors: { ...outfit('drifter', rngOf(hash32(bar.id.length, 9, 9))), ...BAR.colors.keep }, name: 'Barkeep', flag: bar.keep.flag });
      if (c) { c.barRole = 'keep'; c.barId = bar.id; c.home = { ...q }; c.face = faceIn; g.standOn?.(c); bar.keep.c = c; }
    }
    for (const d of bar.drinkers) {
      if (d.c || d.dead || d.hired) continue;
      // two on the stools at the counter, the rest round the card table
      const tbl = L.at(Math.min(L.depth - 3, 6.2), L.width * 0.22);
      const q = d.n < 2 ? L.at(3.8, -len / 3 + d.n * len / 3) : { x: tbl.x + (d.n === 2 ? 1.05 : -1.05), z: tbl.z };
      const c = g.addChar({ x: q.x, z: q.z, faction: 'drifter', weapon: null, hp: d.gun ? BAR.gun.hp : 100, colors: outfit('drifter', rngOf(d.seed)), name: d.name, flag: d.flag });
      if (!c) break;
      c.barRole = d.gun ? 'gun' : 'drinker'; c.barId = bar.id; c.barN = d.n; c.home = { ...q }; c.face = d.n < 2 ? faceIn + Math.PI : Math.atan2(tbl.x - q.x, tbl.z - q.z); g.standOn?.(c); d.c = c;
      // a drinker knows a little of the town's talk (a copy, said over a glass)
      const hid = `d:${bar.id}:${d.n}`, H = this.k.holder(hid, { name: d.name, x: q.x, z: q.z }), town = this.k.holders.get(`town:${bar.town}`);
      if (town) for (const f of town.facts.slice(-3)) this.k.tell(town.id, hid, f.id, 'said', { force: true });
      void H;
    }
    bar.live = true;
    this.furnish();
  }
  demoteBar(bar) {
    const g = this.g;
    if (bar.keep.c) { if (!bar.keep.c.alive) bar.keepDead = true; if (g.chars.includes(bar.keep.c)) g.removeChar(bar.keep.c); bar.keep.c = null; }
    for (const d of bar.drinkers) { if (!d.c) continue; if (!d.c.alive) d.dead = true; if (!d.c.follower && g.chars.includes(d.c)) g.removeChar(d.c); d.c = null; }
    bar.live = false;
    this.furnish();
  }
  // ---- the furniture: a counter, the back shelf and its bottles, stools, a card table, the board on the wall ----------
  // Laid out from the building's own front: the counter faces the door, the shelf against the back wall. One instanced
  // mesh for every bar near you; rebuilt only when a bar opens or closes (never per frame).
  layout(bar) {
    const B = { x0: bar.x - bar.w / 2, x1: bar.x + bar.w / 2, z0: bar.z - bar.d / 2, z1: bar.z + bar.d / 2 }, f = bar.front ?? 'N';
    // back wall point and the inward direction (toward the door), the width axis along the back wall
    const inX = f === 'E' ? 1 : f === 'W' ? -1 : 0, inZ = f === 'S' ? 1 : f === 'N' ? -1 : 0;
    const backX = inX ? (inX > 0 ? B.x0 : B.x1) : bar.x, backZ = inZ ? (inZ > 0 ? B.z0 : B.z1) : bar.z;
    const ax = inZ ? 1 : 0, az = inX ? 1 : 0, width = inZ ? bar.w : bar.d, depth = inZ ? bar.d : bar.w;
    const at = (din, dw) => ({ x: backX + inX * din + ax * dw, z: backZ + inZ * din + az * dw });
    return { at, inX, inZ, ax, az, width, depth, along: inZ ? 0 : Math.PI / 2 };
  }
  furnish() {
    const g = this.g;
    if (!this.furn) {
      this.furn = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.04 }), FURN_CAP);
      this.furn.name = 'pulls-bars'; this.furn.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FURN_CAP * 3).fill(1), 3);
      this.furn.castShadow = true; this.furn.receiveShadow = true; this.furn.frustumCulled = false; this.furn.count = 0;
      g.scene?.add(this.furn);
    }
    let n = 0;
    const box = (p, y, sx, sy, sz, rot, col) => {
      if (n >= FURN_CAP) return;
      _o.position.set(p.x, y + sy / 2, p.z); _o.rotation.set(0, rot, 0); _o.scale.set(sx, sy, sz); _o.updateMatrix();
      this.furn.setMatrixAt(n, _o.matrix); this.furn.setColorAt(n, _c.set(col)); n++;
    };
    for (const bar of this.bars.values()) {
      if (!bar.live) continue;
      const L = this.layout(bar), y = bar.y ?? 0, len = Math.min(L.width * 0.6, 7.5), rot = L.along;
      const wood = '#4b3020', dark = '#2e1e14', top = '#6a4a2e';
      box(L.at(2.9, 0), y, len, 1.05, 0.7, rot, wood);                 // the counter
      box(L.at(2.9, 0), y + 1.05, len + 0.2, 0.06, 0.85, rot, top);     // its top
      box(L.at(0.75, 0), y, len, 1.3, 0.5, rot, dark);                  // the back shelf
      const bottles = ['#7a4a12', '#3f5a2a', '#8a6a2a', '#5a2e14', '#2f4a3a', '#9a7a3a'];
      for (let i = 0; i < Math.min(14, bar.stock); i++) box(L.at(0.75, -len / 2 + 0.4 + i * (len - 0.8) / 13), y + 1.3, 0.14, 0.36, 0.14, rot, bottles[i % bottles.length]); // what is left on it
      for (let i = 0; i < 3; i++) box(L.at(3.75, -len / 3 + i * len / 3), y, 0.42, 0.72, 0.42, rot, dark); // stools
      const tbl = L.at(Math.min(L.depth - 3, 6.2), L.width * 0.22);
      box(tbl, y, 1.5, 0.76, 1.5, rot, wood); box(tbl, y + 0.76, 1.6, 0.05, 1.6, rot, '#2e4a2e'); // the card table and its baize
      for (const [dx, dz] of [[1.05, 0], [-1.05, 0], [0, 1.05], [0, -1.05]]) box({ x: tbl.x + dx, z: tbl.z + dz }, y, 0.45, 0.5, 0.45, rot, dark);
      // the board: a plank on the side wall with its papers
      const side = L.at(Math.min(L.depth - 2, 4.5), -L.width / 2 + 0.12);
      box(side, y + 1.2, L.inZ ? 0.08 : 1.6, 1.0, L.inZ ? 1.6 : 0.08, 0, '#5a4028');
      for (let i = 0; i < 3; i++) { const q = { x: side.x + (L.inZ ? 0.06 : -0.55 + i * 0.5), z: side.z + (L.inZ ? -0.55 + i * 0.5 : 0.06) }; box(q, y + 1.45 - (i % 2) * 0.3, L.inZ ? 0.03 : 0.36, 0.42, L.inZ ? 0.36 : 0.03, 0, '#e8dcc0'); }
    }
    this.furn.count = n;
    this.furn.instanceMatrix.needsUpdate = true; if (this.furn.instanceColor) this.furn.instanceColor.needsUpdate = true;
    this.furn.visible = n > 0;
  }
  barTalk(c) {
    const bar = this.bars.get(c.barId); if (!bar) return null;
    const g = this.g, leave = { t: '[Leave]', end: true };
    const keepH = this.k.holder(`bar:${bar.id}`); keepH.x = c.x; keepH.z = c.z;
    if (c.barRole === 'keep') {
      const T = this.node(bar.town), ch = [];
      ch.push({ t: `Pour me one. ($${BAR.price}) · ${bar.stock} bottles on the shelf`, reply: () => { const r = this.drink(bar.id); return r.ok ? (r.fact ? `(A glass, poured.) "${r.fact.text}."` : '(A glass, poured.) "Quiet week. Nobody tells me anything."') : `(${r.why})`; } });
      ch.push({ t: 'Read the board on the wall.', reply: () => { const r = this.readBoard(bar.town); return r.length ? `(The board.) ${r.map((x) => x.text).join(' · ')}` : '(The board is bare.)'; } });
      for (const rec of this.list) {
        if (rec.town !== bar.town || rec.state !== 'posted') continue;
        if (rec.kind === 'work' && this.k.holds('player', rec.fact)) ch.push({ t: `Hand over ${rec.want.n} ${(ITEMS[rec.want.id]?.name ?? rec.want.id).toLowerCase()} ($${rec.pay})`, reply: () => { const r = this.deliver(rec.id); return r.ok ? `"That is the lot. $${r.paid}."` : `(${r.why})`; } });
        if (rec.kind === 'bounty' && this.k.holds('player', rec.fact)) ch.push({ t: `Collect the bounty (${rec.tally}/${rec.kills})`, reply: () => { const r = this.collect(rec.id); return r.ok ? `"Word came in. $${r.paid}."` : `(${r.why})`; } });
      }
      ch.push(leave);
      void T;
      return { text: '"What will it be?"', choices: ch.slice(0, 9) };
    }
    const d = bar.drinkers[c.barN]; if (!d) return null;
    const ch = [];
    ch.push({ t: 'Heard anything?', reply: () => { const r = this.tellPlayer(`d:${bar.id}:${d.n}`); return r ? `"${r.text}."` : '"Not a thing."'; } });
    ch.push({ t: `A hand of cards? (stake up to $${Math.min(BAR.cards.stake[1], d.purse)})`, reply: () => { const r = this.cards(bar.id, d.n); return r.ok ? (r.won ? `(You win $${r.stake}.) ${r.fight ? '"You cheat."' : '"Again."'}` : `(You lose $${r.stake}.) "Better luck."`) : `(${r.why})`; } });
    if (d.gun && !d.hired) ch.push({ t: `I need a gun hand. ($${d.price} for ${R.hireDays} days)`, reply: () => { const r = this.hire(bar.id, d.n); return r.ok ? '"Let me finish this. Then I am yours."' : `(${r.why})`; } });
    ch.push(leave);
    return { text: d.gun ? '"You looking for somebody who can shoot?"' : '"Pull up a stool."', choices: ch };
  }
  // A drink off the bar's own shelf (a real bottle to your pack), and the barkeep tells you one thing he holds.
  drink(barId) {
    const g = this.g, bar = this.bars.get(barId);
    if (!bar) return { ok: false, why: 'no bar' };
    if (bar.keepDead) return { ok: false, why: 'nobody behind the bar' };
    if (bar.stock <= 0) return { ok: false, why: 'the shelf is empty; the next wagon brings more' };
    if (g.cash < BAR.price) return { ok: false, why: `you need $${BAR.price}` };
    if (!g.inventory.add(g.inventory.carried, BAR.drink, 1)) return { ok: false, why: 'no room in your pack for the bottle' };
    g.cash -= BAR.price; bar.till += BAR.price; bar.stock--; this.stats.drinks++; g.inventory.changed?.();
    if (bar.stock < 14) this.furnish(); // one bottle fewer on the shelf
    const fact = this.tellPlayer(`bar:${bar.id}`);
    g.emit('pullDrink', { bar: bar.id, fact: fact?.id ?? null, stock: bar.stock });
    return { ok: true, fact, stock: bar.stock, till: bar.till };
  }
  readBoard(townId) {
    const b = this.k.holders.get(`board:${townId}`); if (!b) return [];
    const out = [];
    for (const c of b.facts) { const got = this.k.tell(b.id, 'player', c.id, 'board', { force: true }); if (got) out.push(got); }
    return out;
  }
  cards(barId, n, stake = null) {
    const g = this.g, bar = this.bars.get(barId), d = bar?.drinkers[n];
    if (!d || d.dead) return { ok: false, why: 'nobody to play' };
    const st = Math.max(1, Math.min(stake ?? BAR.cards.stake[1], d.purse, g.cash));
    if (st < BAR.cards.stake[0] && (d.purse < BAR.cards.stake[0] || g.cash < BAR.cards.stake[0])) return { ok: false, why: d.purse < BAR.cards.stake[0] ? 'they are cleaned out' : 'you cannot cover the stake' };
    const luck = 5 + (g.deep?.fx?.luck ?? 0) + (g.gear?.mods?.luck ?? 0);
    const rng = rngOf(hash32(Math.floor(this.hours() * 60), n + this.stats.hands, 0x43415244)); this.stats.hands++;
    const won = rng() < 0.42 + (Number(luck) || 5) * 0.012;
    if (won) { d.purse -= st; g.cash += st; d.beaten++; } else { g.cash -= st; d.purse += st; }
    let fight = false;
    if (won && d.beaten >= BAR.fight.after && rng() < BAR.fight.chance && d.c?.alive) {
      fight = true;
      if (d.gun) { d.c.weapon = BAR.gun.weapon; d.c.mag = WEAPONS[BAR.gun.weapon].mag; d.c.grudge = g.player; d.c.target = g.player; d.c.barRole = null; }
      else { d.c.flee = 8; d.c.fleeX = g.player.x; d.c.fleeZ = g.player.z; d.c.barRole = null; }
      g.emit('barFight', { bar: barId, drinker: n, armed: d.gun });
    }
    return { ok: true, won, stake: st, fight, purse: d.purse };
  }
  hire(barId, n) {
    const g = this.g, bar = this.bars.get(barId), d = bar?.drinkers[n];
    if (!d?.gun || d.dead || d.hired) return { ok: false, why: 'not for hire' };
    if (g.cash < d.price) return { ok: false, why: `you need $${d.price}` };
    if (!d.c?.alive) return { ok: false, why: 'not here' };
    g.cash -= d.price; d.purse += d.price; d.hired = true; d.until = this.hours() + R.hireDays * 24;
    d.c.barRole = null; d.c.weapon = BAR.gun.weapon;
    g.seats.recruit(d.c); d.c.mag = WEAPONS[BAR.gun.weapon].mag; // the rounds in their own gun (recruit's 99 is not theirs)
    return { ok: true, paid: d.price, until: r1(d.until) };
  }
  deliver(id) {
    const g = this.g, rec = this.byId(id), T = rec && this.node(rec.town);
    if (!rec || rec.kind !== 'work' || rec.state !== 'posted') return { ok: false, why: 'no such order' };
    if (g.inventory.carried.count(rec.want.id) < rec.want.n) return { ok: false, why: `you carry ${g.inventory.carried.count(rec.want.id)} of ${rec.want.n}` };
    if (T.purse < rec.pay) return { ok: false, why: 'the town cannot pay' };
    g.inventory.spend(rec.want.id, rec.want.n); T.stock[rec.want.id] = (T.stock[rec.want.id] ?? 0) + rec.want.n; // the goods are the town's now
    T.purse -= rec.pay; g.cash += rec.pay; rec.state = 'done'; this.stats.paid += rec.pay;
    return { ok: true, paid: rec.pay };
  }
  collect(id) {
    const g = this.g, rec = this.byId(id), T = rec && this.node(rec.town);
    if (!rec || rec.kind !== 'bounty' || rec.state !== 'posted') return { ok: false, why: 'no such bounty' };
    if (rec.tally < rec.kills) return { ok: false, why: `${rec.tally} of ${rec.kills} so far` };
    if (T.purse < rec.pay) return { ok: false, why: 'the town cannot pay' };
    T.purse -= rec.pay; g.cash += rec.pay; rec.state = 'done'; this.stats.paid += rec.pay;
    return { ok: true, paid: rec.pay };
  }

  // ---- the radio's town broadcasts and the weather ----------------------------------------------------------------------
  // Tuning in: the nearest town's set reads out its board inside the radio's range (a copy each, radio).
  listen() {
    const g = this.g, me = this.me();
    if (!g.radio?.canHear?.()) return { ok: false, why: 'no radio here (a car, or a portable in your pack)', heard: [] };
    const heard = [];
    for (const n of this.nodes()) {
      if (Math.hypot(n.x - me.x, n.z - me.z) > CHANNELS.radio.range) continue;
      const b = this.k.holders.get(`board:${n.id}`); if (!b) continue;
      for (const c of b.facts) if (KINDS[c.what]?.heard?.includes('radio') && !this.k.holds('player', c.id)) { const f = this.k.fact(c.id); if (f && this.k.put('player', f, { channel: 'radio', from: `town:${n.id}`, fromName: `${n.name}'s set` }, c.conf * CHANNELS.radio.conf, c.hops + 1)) heard.push(c.id); }
    }
    // the weather: a warning on the air is the weather over you now (the set can only tell what is so)
    const key = g.sky?.weatherKey;
    if (key && /STORM|DUST|ACID|ASH|HAIL/i.test(key)) {
      const n = this.nearestNode(me.x, me.z, CHANNELS.radio.range);
      if (n) { const f = this.k.record({ id: `wx:${key}:${Math.floor(this.hours() / 6)}`, what: 'weather', subject: null, text: `${g.sky.label ?? key} over ${n.name}: keep off the open road`, where: { x: n.x, z: n.z, place: n.name }, life: 6 }); if (this.k.put('player', f, { channel: 'radio', from: `town:${n.id}`, fromName: `${n.name}'s set` }, CHANNELS.radio.conf, 1)) heard.push(f.id); }
    }
    return { ok: true, heard };
  }

  // ---- your own needs ----------------------------------------------------------------------------------------------------
  needs() {
    const g = this.g, inv = g.inventory, v = g.player.inVehicle ?? g.lastVehicle, me = this.me(), out = [];
    if (!inv) return out;
    const near = [...this.visited].map((id) => this.node(id)).filter(Boolean).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0] ?? null;
    const w = g.inv?.current, ammo = w ? WEAPONS[w]?.ammo : null, rounds = ammo ? g.inv.ammo?.[ammo] ?? 0 : 0;
    if (v && !v.dead && v.fuelCap && v.fuel / v.fuelCap < 0.25) out.push(['fuel', `Your ${v.name ?? 'car'} is down to ${Math.round(v.fuel)} litres`]);
    if (w && ammo && rounds < (WEAPONS[w].mag ?? 6) * 2) out.push(['ammo', `${rounds} rounds left for the ${WEAPONS[w].short ?? w}`]);
    const meds = ['bandage', 'suture_kit', 'medkit', 'painkillers'].reduce((n, it) => n + inv.carried.count(it), 0);
    if (meds === 0) out.push(['meds', 'Nothing in your pack to stop a bleed']);
    const nd = g.needs;
    if (nd && nd.water < 0.3) out.push(['water', 'Your water is running low']);
    if (nd && nd.food < 0.3) out.push(['food', 'You are hungry']);
    if (v && !v.dead && v.maxHp && v.hp / v.maxHp < 0.4) out.push(['parts', `Your ${v.name ?? 'car'} is coming apart`]);
    const keep = new Set();
    for (const [k, text] of out) {
      const id = `need:${k}`; keep.add(id);
      const f = this.k.record({ id, what: 'need', subject: id, text: `${text}${near ? `. ${near.name} is the nearest town you know` : ''}`, where: near ? { x: near.x, z: near.z, place: near.name } : null, life: 999 });
      this.k.see('player', f, null);
    }
    const P = this.k.holders.get('player');
    if (P) P.facts = P.facts.filter((c) => c.what !== 'need' || keep.has(c.id)); // a need met is gone off the board
    return out;
  }

  // ---- the board (what reached you) --------------------------------------------------------------------------------------
  board({ all = false } = {}) {
    const me = this.me(), P = this.k.holder('player');
    const rows = P.facts.filter((c) => FACT_KINDS[c.what]?.pull || all).map((c) => {
      const v = this.k.view(c, me.x, me.z);
      // what you have since learned of how it went (an outcome fact you hold about the same pull)
      const out = c.subject ? P.facts.find((o) => o.what === 'outcome' && o.subject === c.subject) : null;
      return { ...v, kind: FACT_KINDS[c.what]?.name ?? c.what, channelName: CHANNELS[v.channel]?.name ?? v.channel, outcome: out?.text ?? null };
    });
    rows.sort((a, b) => (a.expired - b.expired) || (a.what === 'need') - (b.what === 'need') || a.ageH - b.ageH);
    return rows;
  }
  chip() {
    const rows = this.board().filter((r) => !r.expired && !r.outcome);
    const near = rows.filter((r) => r.distM !== null && r.what !== 'need').sort((a, b) => a.distM - b.distM)[0];
    return { n: rows.length, near };
  }

  byId(id) { return this.list.find((p) => p.id === id) ?? null; }
  view(rec) {
    const me = this.me();
    return { id: rec.id, kind: rec.kind, state: rec.state, x: Math.round(rec.x), z: Math.round(rec.z), cor: rec.cor ?? null, s: rec.s !== null && rec.s !== undefined ? Math.round(rec.s) : null, dir: rec.dir ?? null, to: rec.to ?? null, town: rec.town ?? null,
      born: r1(rec.born), deadline: rec.deadline !== null && rec.deadline !== undefined ? r1(rec.deadline) : null, live: rec.live, dist: Math.round(Math.hypot(rec.x - me.x, rec.z - me.z)),
      people: rec.people.map((p) => ({ name: p.name, flag: p.flag, dead: p.dead, purse: p.purse, rob: p.rob, c: p.c?.id ?? null, seat: p.c?.inVehicle ? p.c.seat : null })), stock: rec.stock, fact: rec.fact, playerKnows: rec.fact ? this.k.holds('player', rec.fact) : false };
  }

  // ---- save -------------------------------------------------------------------------------------------------------------
  save() {
    const strip = (rec) => ({ ...rec, live: false, rideV: null, people: rec.people.map((p) => ({ ...p, c: null })), car: rec.car ? { type: rec.car.type, fuel: rec.car.v?.fuel ?? rec.car.fuel ?? 0, v: null } : null, state: rec.state === 'riding' || rec.state === 'boarding' ? 'walking' : rec.state });
    return { nid: this.nid, list: this.list.map(strip), bars: [...this.bars.values()].map((b) => ({ ...b, live: false, keep: { ...b.keep, c: null }, drinkers: b.drinkers.map((d) => ({ ...d, c: null })) })), towns: (this.towns ?? []).map((n) => ({ id: n.id, purse: n.purse, stock: n.stock })), visited: [...this.visited], k: this.k.save(), nextBirth: this.nextBirth };
  }
  load(s) {
    const g = this.g;
    for (const rec of this.list) { for (const p of rec.people) if (p.c && g.chars.includes(p.c)) g.removeChar(p.c); if (rec.car?.v) g.vehiclesSys.remove(rec.car.v); }
    for (const b of this.bars.values()) this.demoteBar(b);
    this.list = []; this.bars.clear(); this.visited.clear();
    if (!s) { this.k.load(null); this.k.holder('player', { name: 'you', kind: 'player', cap: R.playerHolds }); this.towns = null; return; }
    this.nid = s.nid ?? 0; this.list = s.list ?? []; this.nextBirth = s.nextBirth ?? null;
    for (const b of s.bars ?? []) this.bars.set(b.id, b);
    for (const id of s.visited ?? []) this.visited.add(id);
    this.k.load(s.k); this.k.holder('player', { name: 'you', kind: 'player', cap: R.playerHolds });
    this.towns = null; this.nodes();
    for (const t of s.towns ?? []) { const n = this.node(t.id); if (n) { n.purse = t.purse; n.stock = t.stock ?? {}; } }
  }
}

function wpick(rng, rows) { const tot = rows.reduce((n, r) => n + r[1], 0); let x = rng() * tot; for (const [k, w] of rows) { x -= w; if (x <= 0) return k; } return rows[0][0]; }
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function titled(s) { return String(s ?? '').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()); }
function compass(from, to) { const a = Math.atan2(to.x - from.x, -(to.z - from.z)); return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][(Math.round(a / (Math.PI / 4)) + 8) % 8]; }
