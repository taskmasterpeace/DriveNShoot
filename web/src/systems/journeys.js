import { JOURNEY_RULES, ROAD_STRETCHES, WEATHER_MUL, INCIDENTS, HAUL } from '../data/journeys.js';
import { LINES } from '../data/travel.js';
import { ITEMS } from '../data/items.js';
import { STREAM } from '../data/streaming.js';
import { outfit } from './characters.js';
import { randomName } from '../data/npcs.js';

// RISKY JOURNEYS (docs/design/WEB_INSURANCE_JOURNEYS.md, rows in data/journeys.js). Owned by systems/travel.js (g.travel.j):
//   - roll(): a leg's INCIDENT, seeded (the same seed, the same leg, the same thing: its choices' amounts are rolled at
//     the same moment, so what a choice will cost is fixed before you choose it).
//   - resolve(): a choice's consequences on you (scrip, hp, a bag, the bulls' search, a fight's outcome, put off).
//   - plan(): the way home: the cheapest line (fare plus shoe leather) from a point or a node to a point, on the real
//     timetables, with the nearest pole to where you are going and the walk from it.
//   - the hitch: thumb out at an interstate's roadside; a car may stop, depending on what the road thinks of you.

const r1 = (v) => Math.round(v * 10) / 10;
const MILE = STREAM.mile;
const JR = JOURNEY_RULES;
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const span = (rng, a) => (a ? a[0] + rng() * (a[1] - a[0]) : 0);
const isNight = (h) => { const hh = ((h % 24) + 24) % 24; return hh >= JR.night.from || hh < JR.night.to; };

export { hash, rngOf };

export class Journeys {
  constructor(game, travel) {
    this.g = game; this.T = travel;
    this.pending = null;   // an incident waiting for your choice: { inc, ctx, onDone }
    this.last = null;      // the last incident resolved (agents, the selftest)
    this.thumb = null;     // thumb out: { t, tries, dir, s, cor }
    this.lift = null;      // a car that stopped for you: { vid, driver, dir, toS, state, cor }
    this.nLift = 0;
  }

  // ---- the road's danger ---------------------------------------------------------------------------------------------
  stretch(road, mile) {
    let best = null;
    for (const r of ROAD_STRETCHES) if (r.road === road && mile >= r.from && mile < r.to) best = r;
    return best;
  }
  // A leg's context: danger (the worst stretch it touches), who holds it, the hour, the weather.
  ctxFor(L, from, to, hour, extra = {}) {
    const T = this.T, kind = L.kind;
    let danger = 1, held = null, miles = extra.miles ?? 0, name = null;
    if (kind === 'bus') {
      const A = T.node(from), B = T.node(to), road = L.road ?? 'I-10';
      if (A?.s !== undefined && B?.s !== undefined) {
        miles = miles || Math.abs(B.s - A.s) / MILE;
        const m0 = Math.min(A.s, B.s) / MILE, m1 = Math.max(A.s, B.s) / MILE;
        for (const r of ROAD_STRETCHES) if (r.road === road && r.to > m0 && r.from < m1 && r.danger >= danger) { danger = r.danger; held = r.held; name = r.name; }
      }
    } else if (kind === 'haul') { danger = extra.danger ?? 1; miles = miles || extra.routeMiles || 0; }
    return { kind, line: L.id, from, to, miles, hour, danger, held, stretch: name, weather: this.g.sky?.weatherKey ?? 'CLEAR', perMile: kind === 'haul' ? HAUL.perMile : L.risk?.perMile ?? 0.01, nightMul: L.risk?.night ?? 1.5 };
  }
  // The odds the leg turns something up at all.
  odds(ctx) {
    const night = isNight(ctx.hour);
    let p = 1 - (1 - ctx.perMile * ctx.danger) ** Math.max(0, ctx.miles);
    if (night) p *= ctx.nightMul;
    p *= WEATHER_MUL[ctx.weather] ?? 1;
    return Math.min(JR.maxP, p);
  }

  // ---- the roll: which incident, and what every choice will cost (seeded) ------------------------------------------------
  roll(ctx, seed, { force = null, p: pOver = null } = {}) {
    const rng = rngOf(seed), night = isNight(ctx.hour);
    const p = pOver ?? this.odds(ctx), hit = rng();
    if (!force && hit >= p) return null;
    const pool = INCIDENTS.filter((e) => e.kinds.includes(ctx.kind));
    const wOf = (e) => e.weight * (night ? e.night ?? 1 : 1) * (ctx.held && e.held?.[ctx.held] ? e.held[ctx.held] : 1) * (e.weather?.[ctx.weather] ?? 1);
    let row = force ? INCIDENTS.find((e) => e.id === force) : null;
    if (!row) { let w = rng() * pool.reduce((a, e) => a + wOf(e), 0); row = pool[0]; for (const e of pool) { if ((w -= wOf(e)) < 0) { row = e; break; } } }
    else rng();
    const at = 0.15 + rng() * 0.7; // how far along the leg it happens
    const inc = {
      id: row.id, title: row.title, text: row.text, p: Math.round(p * 1000) / 1000, at: Math.round(at * 1000) / 1000, seed, stretch: ctx.stretch, held: ctx.held,
      take: row.take ? { cashShare: row.take.cashShare ?? 0 } : null,
      choices: row.choices.map((c) => {
        const o = { id: c.id, t: c.t };
        if (c.delay) o.delay = r1(span(rng, c.delay));
        if (c.hurt) o.hurt = Math.round(span(rng, c.hurt));
        if (c.cost) o.cost = Math.round(span(rng, c.cost));
        if (c.fine) o.fine = Math.round(span(rng, c.fine));
        if (c.cashShare) o.cashShare = c.cashShare;
        if (c.bag) o.bag = true;
        if (c.search) o.search = true;
        if (c.putOff) o.putOff = true;
        if (c.back) o.back = true;
        if (c.fight) {
          const won = rng() < c.fight.odds, side = won ? c.fight.win : c.fight.lose;
          o.fight = { odds: c.fight.odds, won };
          if (side.delay) o.delay = r1((o.delay ?? 0) + span(rng, side.delay));
          if (side.hurt) o.hurt = (o.hurt ?? 0) + Math.round(span(rng, side.hurt));
          if (side.cashShare) o.cashShare = side.cashShare;
          if (side.back) o.back = true;
        }
        return o;
      }),
    };
    return inc;
  }
  // The legacy shape travel.skip and its check read (what the default choice does), from an incident.
  flat(inc, choiceId = null) {
    if (!inc) return null;
    const c = inc.choices.find((x) => x.id === choiceId) ?? inc.choices[0];
    return { id: inc.id, text: inc.title, p: inc.p, delay: c.delay ?? 0, hurt: c.hurt ?? 0, cashShare: c.cashShare ?? inc.take?.cashShare ?? 0, toll: c.cost ?? 0, putOff: !!c.putOff, choice: c.id, incident: inc };
  }

  // ---- the consequences of a choice, on you ---------------------------------------------------------------------------
  // Returns { choice, delay, hurt, cashLost, paid, lost: [ids], seized: [ids], putOff, won }.
  resolve(inc, choiceId = null) {
    const g = this.g, p = g.player, inv = g.inventory;
    let c = inc.choices.find((x) => x.id === choiceId) ?? inc.choices[0];
    const out = { incident: inc.id, choice: c.id, delay: 0, hurt: 0, cashLost: 0, paid: 0, lost: [], seized: [], putOff: false, won: null };
    // The thief's hand was in your pocket before anyone chose anything.
    let taken = 0;
    if (inc.take?.cashShare) { taken = Math.floor(g.cash * inc.take.cashShare); g.cash -= taken; out.cashLost += taken; }
    // A toll or a bribe you cannot pay: the next choice is what happens (they take it another way).
    if (c.cost && g.cash < c.cost) { const alt = inc.choices.find((x) => x !== c && !x.cost); if (alt) { out.couldNotPay = c.id; c = alt; out.choice = c.id; } }
    if (c.cost) { g.cash -= c.cost; out.paid += c.cost; }
    if (c.fight) out.won = c.fight.won;
    if (c.back && taken) { g.cash += taken; out.cashLost -= taken; out.back = taken; }
    if (c.cashShare) { const n = Math.floor(g.cash * c.cashShare); g.cash -= n; out.cashLost += n; }
    if (c.bag) {
      const s = this.bestStack(inv.carried);
      if (s >= 0) { const t = inv.take(inv.carried, s, inv.carried.slots[s].n); out.lost.push(t.id); }
      else if (inv.worn) { out.lost.push(inv.worn); inv.worn = null; }
      inv.changed?.();
    }
    if (c.search) {
      for (let i = inv.carried.slots.length - 1; i >= 0; i--) { const s = inv.carried.slots[i]; if (JR.contraband.includes(s.id)) { inv.take(inv.carried, i, s.n); out.seized.push(s.id); } }
      for (const k of [...g.inv.weapons]) { const gi = `gun_${k}`; if (JR.contraband.includes(gi)) { g.inv.weapons = g.inv.weapons.filter((w) => w !== k); out.seized.push(gi); } }
      if (!g.inv.weapons.includes(g.inv.current)) g.inv.current = g.inv.weapons[0] ?? null;
      if (out.seized.length && c.fine) { const f = Math.min(g.cash, c.fine); g.cash -= f; out.paid += f; }
      inv.changed?.();
    }
    if (c.delay) out.delay = c.delay;
    if (c.hurt) { out.hurt = c.hurt; p.hp = Math.max(Math.min(p.hp, 10), p.hp - c.hurt); g.hud?.shake?.(0.5); }
    if (c.putOff) out.putOff = true;
    this.last = { ...out, title: inc.title };
    g.emit('incidentResolved', { ...out });
    return out;
  }
  bestStack(box) {
    let bi = -1, bv = 0;
    for (let i = 0; i < box.slots.length; i++) { const s = box.slots[i], v = (ITEMS[s.id]?.value ?? 1) * s.n; if (v > bv) { bv = v; bi = i; } }
    return bi;
  }

  // ---- the card: an incident waiting on your choice -------------------------------------------------------------------
  // The world holds still while it is up (the travel panel pauses it). onDone(result) runs once a choice is made.
  ask(inc, onDone, { where = null } = {}) {
    const g = this.g, T = this.T;
    this.pending = { inc, onDone, where };
    g.emit('incident', { id: inc.id, choices: inc.choices.map((c) => c.id), where });
    // An agent's command running (or no screen): the choice it named, else the first (the default).
    if ((g.api?.deadline != null) || !T.ui.wrap) { const pick = this.agentChoice ?? null; this.agentChoice = null; return this.choose(pick); }
    const build = () => ({
      kind: 'ON THE ROAD', title: inc.title, sub: `${inc.stretch ? `${inc.stretch.toUpperCase()} · ` : ''}${where ?? ''}`, note: inc.text,
      head: ['', 'WHAT YOU DO', ''],
      rows: inc.choices.map((c, k) => ({ key: String(k + 1), cols: ['', c.t, this.costLabel(c)], hot: k === 0 })),
      foot: [['1-' + inc.choices.length, 'Choose']],
      hall: false,
      onKey: (code) => { const k = /^Digit([1-9])$/.exec(code)?.[1]; const c = k && inc.choices[+k - 1]; if (!c) return false; T.ui.close(); this.choose(c.id); return 'close'; },
      onClose: () => { if (this.pending?.inc === inc) this.choose(null); }, // Esc: the default
    });
    T.ui.show({ ...build(), build });
    return { pending: true };
  }
  costLabel(c) {
    const b = [];
    if (c.cost) b.push(`$${c.cost}`);
    if (c.delay) b.push(`+${c.delay} H`);
    if (c.fight) b.push(`${Math.round(c.fight.odds * 100)}% ODDS`);
    if (c.putOff) b.push('ON FOOT');
    if (c.bag) b.push('A BAG');
    if (c.search) b.push('SEARCHED');
    return b.join(' · ');
  }
  choose(choiceId) {
    const P = this.pending;
    if (!P) return null;
    this.pending = null;
    const r = this.resolve(P.inc, choiceId);
    P.onDone?.(r);
    return r;
  }

  // ---- the planner: the cheapest way home ------------------------------------------------------------------------------
  // from: { x, z } or a node id (an off-map hall); to: { x, z, name }. Returns { ok, cost, fare, hours, walkKm, legs,
  // nearestPole: { node, km }, lastWalkKm } on the real timetables from `now`.
  plan(from, to, now = this.T.hours()) {
    const T = this.T, nodes = T.nodes(), W = JR.walk, ts = T.ts;
    const walkH = (m) => m / W.speed * ts, walkC = (m) => m / 1000 * W.costPerKm;
    const ids = Object.keys(nodes);
    const dist = new Map(), prev = new Map(), time = new Map(), done = new Set();
    const START = '@start', END = '@end';
    const pt = (n) => n.counter ?? (n.x !== undefined ? n : null);
    const relax = (a, b, cost, t1, leg) => { const c = (dist.get(a) ?? 0) + cost; if (c < (dist.get(b) ?? Infinity) - 1e-9) { dist.set(b, c); time.set(b, t1); prev.set(b, { from: a, leg }); } };
    const startNode = typeof from === 'string' ? from : null;
    dist.set(START, 0); time.set(START, now);
    const edgesFrom = (id, t) => {
      const out = [];
      if (id === START) {
        if (startNode) out.push({ to: startNode, cost: 0, t1: t, leg: null });
        else {
          for (const nid of ids) { const n = nodes[nid], q = n.onMap && pt(n); if (!q) continue; const d = Math.hypot(q.x - from.x, q.z - from.z); if (d <= W.maxLegM) out.push({ to: nid, cost: walkC(d), t1: t + walkH(d), leg: { kind: 'walk', from: 'here', to: nid, m: Math.round(d), hours: r1(walkH(d)) } }); }
          const d = Math.hypot(to.x - from.x, to.z - from.z);
          out.push({ to: END, cost: walkC(d), t1: t + walkH(d), leg: { kind: 'walk', from: 'here', to: 'there', m: Math.round(d), hours: r1(walkH(d)) } });
        }
        return out;
      }
      const n = nodes[id], q = n?.onMap && pt(n);
      if (q) { const d = Math.hypot(to.x - q.x, to.z - q.z); out.push({ to: END, cost: walkC(d), t1: t + walkH(d), leg: { kind: 'walk', from: id, to: 'there', m: Math.round(d), hours: r1(walkH(d)) } }); }
      for (const L of [...LINES]) {
        if (L.kind === 'bus') {
          const st = L.stops, i = st.indexOf(id);
          if (i < 0 || !T.table(L)) continue;
          for (let j = 0; j < st.length; j++) {
            if (j === i) continue;
            const dir = Math.sign(j - i), nb = T.nextBus(L, i, dir, t);
            if (!nb) continue;
            const ride = T.busHours(L, i, j, dir), fare = T.fare(L, id, st[j]);
            out.push({ to: st[j], cost: fare, t1: nb.at + ride, leg: { kind: 'bus', line: L.id, name: L.name, from: id, to: st[j], dir, fare, depart: r1(nb.at), hours: r1(nb.at + ride - t) } });
          }
        } else if (L.kind === 'rail') {
          if (!L.stops.includes(id)) continue;
          for (const b of L.stops) { if (b === id) continue; const wait = Math.abs(t - now) < 0.01 ? T.ironEta(id) : T.ironCycleH() / 2, ride = T.ironHours(L, id, b), fare = T.fare(L, id, b); out.push({ to: b, cost: fare, t1: t + wait + ride, leg: { kind: 'rail', line: L.id, name: L.name, from: id, to: b, fare, depart: r1(t + wait), hours: r1(wait + ride) } }); }
        } else if (L.kind === 'air' || L.kind === 'haul') {
          for (const f of L.kind === 'air' ? L.flights : L.routes) {
            if (f.from !== id) continue;
            const d = T.nextFlight(f, t);
            if (d === null) continue;
            out.push({ to: f.to, cost: f.fare, t1: d + f.hours, leg: { kind: L.kind, line: L.id, name: L.name, from: id, to: f.to, fare: f.fare, depart: r1(d), hours: r1(d + f.hours - t) } });
          }
        }
      }
      return out;
    };
    // Dijkstra on cost (fare + shoe leather), carrying the clock along the chosen path.
    for (let guard = 0; guard < 200; guard++) {
      let u = null, ud = Infinity;
      for (const [k, v] of dist) if (!done.has(k) && v < ud) { ud = v; u = k; }
      if (u === null || u === END) break;
      done.add(u);
      for (const e of edgesFrom(u, time.get(u))) if (!done.has(e.to)) relax(u, e.to, e.cost, e.t1, e.leg);
    }
    if (!dist.has(END)) return { ok: false, why: 'no line runs anywhere near there' };
    const legs = [];
    for (let k = END; prev.has(k); k = prev.get(k).from) { const pl = prev.get(k); if (pl.leg) legs.unshift(pl.leg); }
    const fare = legs.reduce((a, l) => a + (l.fare ?? 0), 0), walkM = legs.filter((l) => l.kind === 'walk').reduce((a, l) => a + l.m, 0);
    const last = legs[legs.length - 1], rides = legs.filter((l) => l.kind !== 'walk');
    return { ok: true, cost: Math.round(dist.get(END)), fare, hours: r1(time.get(END) - now), walkKm: r1(walkM / 1000), legs, rides: rides.length,
      first: rides[0] ? `${rides[0].name} ${T.nodeName(rides[0].from)} > ${T.nodeName(rides[0].to)}` : 'ON FOOT', lastWalkKm: last?.kind === 'walk' ? r1(last.m / 1000) : 0, getOff: rides.length ? rides[rides.length - 1].to : null,
      nearestPole: this.nearestPole(to) };
  }
  // The pole (a road stop on any bus line) nearest a point: where to buy your punch to.
  nearestPole(to, { line = null } = {}) {
    const T = this.T;
    let best = null, bd = Infinity;
    for (const L of LINES) {
      if (L.kind !== 'bus' || (line && L.id !== line)) continue;
      for (const id of L.stops) { const n = T.node(id); if (!n?.onMap || !n.road) continue; for (const q of [n.poles[1], n.poles[-1]]) { const d = Math.hypot(q.x - to.x, q.z - to.z); if (d < bd) { bd = d; best = { node: id, name: n.name, line: L.id, km: r1(d / 1000), m: Math.round(d) }; } } }
    }
    return best;
  }

  // ---- the hitch: thumb out at the roadside ----------------------------------------------------------------------------
  roadHere(x, z) {
    const W = this.T.W;
    if (!W) return null;
    for (const R of [W, ...(W.corridors ?? [])]) { const pr = R.project(x, z, 120); if (pr.d < 30) return { R, pr }; }
    return null;
  }
  thumbOut({ seed = null } = {}) {
    const g = this.g, p = g.player;
    if (p.inVehicle || !p.alive) return { ok: false, why: 'on foot, at the side of an interstate' };
    if (this.lift) return { ok: false, why: 'a car is already stopping for you' };
    const at = this.roadHere(p.x, p.z);
    if (!at) return { ok: false, why: 'stand at the side of an interstate to thumb a ride' };
    // Which way you want to go: the way you face along the road.
    const f = at.R.at(at.pr.s), dir = Math.sin(p.face) * f.tx + Math.cos(p.face) * f.tz >= 0 ? 1 : -1;
    this.thumb = { t: 0.5, tries: 0, dir, seed: seed ?? hash(`thumb:${Math.floor(this.T.hours() * 60)}`), cor: at.R === this.T.W ? null : at.R };
    g.emit('thumbOut', { dir, s: Math.round(at.pr.s) });
    g.hud?.toast?.('THUMB OUT · SOMEBODY MIGHT STOP · WHAT THE ROAD THINKS OF YOU DECIDES', 'job');
    return { ok: true, dir };
  }
  // The odds a car stops: the drifters' reading of you (what the road's people think of you).
  hitchOdds() {
    const H = JR.hitch, F = this.g.society?.factions, i = F?.index?.drifters;
    const st = i === undefined ? 0 : F.reading(i);
    if (st < H.refuseBelow) return { p: 0, standing: st };
    return { p: Math.max(H.min, Math.min(H.max, H.base + st * H.perStanding)), standing: st };
  }
  updateHitch(dt) {
    const g = this.g, p = g.player, H = JR.hitch, th = this.thumb;
    if (th) {
      if (p.inVehicle || !p.alive || (p.speed ?? 0) > 2.5) { this.thumb = null; }
      else if ((th.t -= dt) <= 0) {
        th.t = H.everyS; th.tries++;
        const rng = rngOf(th.seed + th.tries * 7919), od = this.hitchOdds();
        if (rng() < od.p) this.spawnLift(th, rng);
        else { g.emit('hitchPassed', { tries: th.tries, p: od.p }); g.hud?.toast?.(od.p === 0 ? 'A CAR SLOWS, SEES WHO YOU ARE, AND GUNS IT' : 'A CAR BLOWS PAST WITHOUT SLOWING', 'warn'); }
      }
    }
    if (this.lift) this.driveLift(dt);
  }
  spawnLift(th, rng) {
    const g = this.g, T = this.T, p = g.player, R = th.cor ?? T.W, pr = R.project(p.x, p.z, 200);
    const s = Math.max(30, Math.min(T.roadLen(R) - 30, pr.s - th.dir * H().spawnBack));
    const q = T.stopPoint(s, th.dir, R), type = H().types[Math.floor(rng() * H().types.length)];
    const v = g.vehiclesSys.spawn(type, q.x, q.z, q.h, ['#7a5a3a', '#5a6a5a', '#8a7a62'][Math.floor(rng() * 3)], { ai: 'lift' });
    if (!v) return null;
    v.vx = Math.sin(q.h) * 14; v.vz = Math.cos(q.h) * 14;
    const d = g.addChar({ x: q.x, z: q.z, faction: 'drifter', weapon: rng() < 0.4 ? 'pistol' : null, name: randomName(rng), flag: g.randomFlag ? g.randomFlag(rng) : 'US', colors: outfit('drifter', rng) });
    if (d) { d.hold = true; d.trundle = 'lift'; g.seats.board(d, v, 0); }
    // Where it is going: the next stop or exit up the road, never farther than rideMaxM.
    const toS = Math.max(30, Math.min(T.roadLen(R) - 30, pr.s + th.dir * Math.min(H().rideMaxM, 1500 + rng() * (H().rideMaxM - 1500))));
    this.lift = { id: ++this.nLift, vid: v.id, driver: d?.id ?? null, dir: th.dir, toS, state: 'coming', cor: th.cor, waitT: 25, at: { x: p.x, z: p.z } };
    this.thumb = null;
    g.emit('hitchStopped', { vehicle: v.id, driver: d?.name ?? null, flag: d?.flag ?? null, toMile: r1(toS / MILE) });
    return v;
  }
  liftVehicle() { return this.lift ? this.g.vehicles.find((v) => v.id === this.lift.vid) ?? null : null; }
  // The car that stopped for you: it pulls up beside you, waits for you to get in, drives you up the road, lets you out.
  driveLift(dt) {
    const g = this.g, T = this.T, Lf = this.lift, v = this.liftVehicle(), p = g.player;
    if (!v || v.dead || !v.driver?.alive) { if (v && p.inVehicle === v && v.dead) g.exitVehicle(true); this.endLift(v ? 'wrecked' : 'gone'); return; }
    if (v.driver === p) { v.ai = null; this.lift = null; g.emit('liftTaken', { vehicle: v.id }); return; } // you took the wheel: a stolen car now
    const R = Lf.cor ?? T.W, pr = R.project(v.x, v.z, 600), sp = g.vehiclesSys.speed(v), aboard = p.inVehicle === v;
    let want = 0;
    if (Lf.state === 'coming') {
      const mine = R.project(Lf.at.x, Lf.at.z, 600).s, along = (mine - pr.s) * Lf.dir;
      want = Math.min(16, Math.sqrt(2 * 3 * Math.max(0, along - 2)) + 0.5);
      if (along < 3 || (along < 8 && sp < 1)) { Lf.state = 'waiting'; g.hud?.toast?.(`${v.driver.name?.toUpperCase() ?? 'A DRIVER'} PULLS OVER · [O] GET IN`, 'job'); g.emit('liftWaiting', { vehicle: v.id }); }
      if (along < -40) { this.endLift('missed'); return; }
    } else if (Lf.state === 'waiting') {
      want = 0; Lf.waitT -= dt;
      if (aboard) { Lf.state = 'driving'; g.emit('liftBoarded', { vehicle: v.id }); g.hud?.toast?.(`RIDING WITH ${v.driver.name?.toUpperCase() ?? 'A STRANGER'} · [F] ASK TO BE LET OUT`, 'job'); }
      else if (Lf.waitT <= 0 || Math.hypot(v.x - p.x, v.z - p.z) > 60) { Lf.state = 'leaving'; }
    } else if (Lf.state === 'driving') {
      const along = (Lf.toS - pr.s) * Lf.dir;
      want = Lf.cord ? 0 : Math.min(19, Math.sqrt(2 * 3 * Math.max(0, along - 2)) + 0.5);
      if (!aboard) { Lf.state = 'leaving'; }
      else if ((Lf.cord || along < 3) && sp < JR.cord.stopSpeed) { this.T.dropRoadside(v, Lf.cord ? 'asked out' : 'end of the ride'); Lf.state = 'leaving'; Lf.cord = false; }
    } else if (Lf.state === 'leaving') {
      want = 19;
      if (Math.hypot(v.x - p.x, v.z - p.z) > 400) { this.endLift('drove off'); return; }
    }
    const ap = g.streamer.autopilot(v, Lf.dir, 1, want, Lf.cor);
    v.steer = ap.steer; v.handbrake = want < 0.5 && sp < 1;
    v.throttle = want < 0.5 ? (sp > 0.4 ? -1 : 0) : ap.throttle;
  }
  endLift(why) {
    const g = this.g, Lf = this.lift;
    if (!Lf) return;
    this.lift = null;
    const v = g.vehicles.find((x) => x.id === Lf.vid), d = g.chars.find((c) => c.id === Lf.driver);
    if (v && g.player.inVehicle !== v) { if (d) { if (d.inVehicle) g.seats.leave(d, true); g.removeChar(d); } g.vehiclesSys.remove(v); }
    g.emit('liftEnded', { why });
  }
  // [O] on foot: thumb out, or get into the car that stopped for you.
  key() {
    const g = this.g, p = g.player, v = this.liftVehicle();
    if (v && this.lift.state === 'waiting' && !p.inVehicle && Math.hypot(v.x - p.x, v.z - p.z) < 9) return g.enterVehicle(v, 'passenger');
    if (!p.inVehicle) { const r = this.thumbOut(); if (!r.ok) g.hud?.toast?.(r.why.toUpperCase(), 'warn'); return r.ok; }
    return false;
  }

  // ---- passengers aboard a real coach ----------------------------------------------------------------------------------
  seatPassengers(v, rng) {
    const g = this.g, [a, b] = JR.passengers, n = a + Math.floor(rng() * (b - a + 1)), out = [];
    const kinds = JR.passengerKinds, tot = kinds.reduce((s, k) => s + k.weight, 0);
    const seats = v.seats.map((s, i) => i).filter((i) => i >= 2 && !v.occ?.[i]);
    for (let k = 0; k < n && seats.length > 2; k++) { // always two rows free for you
      let w = rng() * tot, kind = kinds[0]; for (const q of kinds) { if ((w -= q.weight) < 0) { kind = q; break; } }
      const si = seats.splice(Math.floor(rng() * seats.length), 1)[0];
      const c = g.addChar({ x: v.x, z: v.z, faction: kind.faction, weapon: kind.weapon, name: randomName(rng), flag: g.randomFlag ? g.randomFlag(rng) : 'US', colors: outfit(kind.faction, rng) });
      if (!c) break;
      c.trundle = 'passenger'; c.hold = true;
      g.seats.board(c, v, si);
      out.push(c.id);
    }
    return out;
  }
  // The passengers panel (U aboard): who rides with you, where they are from, and what they say.
  openPassengers() {
    const g = this.g, T = this.T, B = T.bus, v = T.busVehicle();
    if (!B || !v || g.player.inVehicle !== v) return { ok: false, why: 'not aboard a coach' };
    let said = null;
    const people = () => (v.occ ?? []).filter((o) => o && o !== g.player && o.alive);
    const build = () => ({
      kind: 'ABOARD THE COACH', title: `${T.line(B.line)?.name ?? 'THE COACH'} · ${people().length} ABOARD`, sub: 'THE PEOPLE YOU RIDE WITH. EVERYBODY IS FROM SOMEWHERE.',
      note: said, head: ['WHO', 'FROM', 'SEAT'],
      rows: people().slice(0, 9).map((c, k) => ({ key: String(k + 1), cols: [c.name ?? 'SOMEONE', c.flag ?? 'US', c.trundle === 'passenger' ? 'PASSENGER' : (c.trundle ?? '').toUpperCase()], flag: c.flag })),
      foot: [['1-9', 'Talk to them'], ['ESC', 'Back to the window']],
      onKey: (code) => {
        const k = /^Digit([1-9])$/.exec(code)?.[1], c = k && people()[+k - 1];
        if (!c) return false;
        const topics = g.talk?.topics?.(c) ?? [];
        const lines = topics.map((t) => t.reply()).filter(Boolean);
        said = `${(c.name ?? 'THEY').toUpperCase()}: ${lines.join(' ') || 'They look out the window and say nothing.'}`;
        g.emit('passengerTalk', { id: c.id, flag: c.flag });
        return true;
      },
    });
    T.ui.show({ ...build(), build });
    return { ok: true, people: people().map((c) => ({ id: c.id, name: c.name, flag: c.flag, faction: c.faction, seat: c.trundle })) };
  }

  view() {
    const v = this.liftVehicle();
    return { pending: this.pending ? { id: this.pending.inc.id, title: this.pending.inc.title, choices: this.pending.inc.choices } : null, last: this.last,
      thumb: this.thumb ? { tries: this.thumb.tries, dir: this.thumb.dir, odds: this.hitchOdds() } : null,
      lift: this.lift ? { ...this.lift, x: v ? r1(v.x) : null, z: v ? r1(v.z) : null, driverName: v?.driver?.name ?? null, flag: v?.driver?.flag ?? null } : null };
  }
}
function H() { return JR.hitch; }

