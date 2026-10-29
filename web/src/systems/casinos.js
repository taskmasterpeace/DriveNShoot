import * as THREE from 'three';
import { STAKES, BLACKJACK, CHESS_PLAYERS, CHESS_AT, EYE, DEALER_EYE, GUARD, CAMERA, CAGE, SAFE, WITNESS, SEC_DRONE, JAMMER, CASINO_NAMES } from '../data/casinos.js';
import { ITEMS } from '../data/items.js';
import { ARCHETYPES } from '../data/citygen.js';
import { outfit } from './characters.js';
import { hash32, rngOf } from '../world/geo.js';
import { Shoe, Blackjack } from './cards.js';
import * as Chess from './chess.js';
import { wayTop } from '../world/understreet.js';

// CASINOS (docs/design/WEB_CASINOS.md; rows in data/casinos.js). Card tables, chess boards and the house's money, in the
// towns that are built near you, and everything you need to take that money the other way.
//   venues    every live town's rooms, rolled ONCE from the building's id (stakes row by building: a saloon's back room,
//             a town's hotel floor, a casino strip's high-roller room). The cage and the safe hold real cash that only
//             bets, robberies and a guard carrying it between them ever move (law 2).
//   people    near you (140 m) a room's dealers, chess players, cashier and guards stand on their marks (a hook in ai.js
//             keeps them there); past 220 m they are written back to the record (a dead guard stays dead).
//   tables    E at a seat: the table panel (ui/tablepanel.js). Blackjack from a real shoe (systems/cards.js) and chess
//             against the row's player (systems/chess.js); the bet leaves your pocket into the cage, the payout leaves
//             the cage into your pocket, by exactly what the hand says.
//   the eye   the dealer counts too: bet big on a hot shoe and the pit boss asks you to leave; palm a card and get caught
//             and the guards are on you.
//   robbery   the cage at gunpoint (hold E with your gun up), the back office's safe (picks, a pry bar or a charge). Who
//             knows: a guard who sees it (line of sight) or hears it (a shot, a blown safe), a camera when somebody is
//             in the office to watch its monitor, a drone, or a witness who RUNS to a guard. The rest of the room runs
//             to the town's board, and the bounty is posted when the first of them gets there (law 6).
//   drones    the house and its owner's home fly security drones (data/casinos.js SEC_DRONE): a loop over the property,
//             sight by line of sight only, they mark you and call the guards to where they saw you. Shoot them down (a
//             hook in combat.js), jam them (a jammer in your pack), or keep under a roof and in the dark.
// Two instanced meshes (the rooms' furniture, rebuilt only when a room opens or closes; the drones, written in place every
// frame), no lights.

const FURN_CAP = 900, DYN_CAP = 120, LIVE_R = 140, DROP_R = 220;
const _o = new THREE.Object3D(), _c = new THREE.Color();
const r1 = (v) => Math.round(v * 10) / 10;
const iroll = (rng, [a, b]) => Math.round(a + rng() * (b - a));
const pick = (rng, a) => a[Math.floor(rng() * a.length)];
for (const [id, r] of Object.entries(JAMMER)) ITEMS[id] ??= r;

export class Casinos {
  constructor(game) {
    this.g = game;
    this.venues = new Map();   // building id -> venue record
    this.homes = new Map();    // building id -> a rich home (its owner's drone)
    this.drones = [];          // every security drone record (live venues and homes)
    this.runners = [];         // witnesses on their way (people, a target list)
    this.seat = null;          // the player's seat: { v, t, game }
    this.barred = {};          // venue id -> game hours you are barred until
    this.counts = { hands: 0, chessGames: 0, robberies: 0, alarms: 0, bounties: 0, barred: 0, caught: 0, dronesDown: 0, carried: 0, spotted: 0 };
    this.events = [];          // a short log (newest last) for the agent
    this.hold = 0; this.holdOn = null;
    this.ring = { x: 0, z: 0, len: 1.6 };
    this.enabled = true;
    this.dirty = true;
  }
  hours() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }
  log(t, data = {}) { this.events.push({ t: r1(this.hours()), what: t, ...data }); if (this.events.length > 40) this.events.shift(); this.g.emit?.(`casino_${t}`, data); }

  // ---- which rooms a live town has ----------------------------------------------------------------------------------------
  scan() {
    const cg = this.g.citygen; if (!cg) return;
    for (const t of cg.live.values()) {
      const rec = t.rec; if (rec.state === 'overrun' || rec.kind !== 'town') continue;
      const A = ARCHETYPES[rec.arch], blds = t.T.buildings ?? [];
      const hotels = blds.filter((B) => B.kind === 'hotel' && !B.ruined);
      const strip = rec.arch === 'boom_strip' || A?.major;
      const tallest = strip && hotels.length ? hotels.reduce((a, b) => ((b.n ?? 1) > (a.n ?? 1) ? b : a)) : null;
      for (const B of blds) {
        if (B.ruined) continue;
        let kind = null;
        if (B.kind === 'saloon') kind = 'backroom';
        else if (B === tallest) kind = 'highroller';
        else if (B.kind === 'hotel' && B === hotels.find((h) => h !== tallest)) kind = 'floor';
        if (kind && !this.venues.has(B.id)) this.make(t, B, kind);
      }
      // the money's home: the biggest house of a town with a room that buys drones
      if ([...this.venues.values()].some((v) => v.town === rec.id && v.row.drones)) {
        const homes = blds.filter((B) => !B.ruined && ['house', 'ranch_house', 'farmhouse', 'bungalow', 'rowhouse', 'adobe', 'cabin', 'apartment'].includes(B.kind)); // a strip's money lives in the penthouse
        if (homes.length) { const H = homes.reduce((a, b) => ((b.x1 - b.x0) * (b.z1 - b.z0) > (a.x1 - a.x0) * (a.z1 - a.z0) ? b : a)); if (!this.homes.has(H.id)) this.makeHome(t, H); }
      }
    }
  }
  make(t, B, kind) {
    const g = this.g, rec = t.rec, row = STAKES[kind], rng = rngOf(hash32(B.id.length * 53, B.x0 | 0, B.z0 | 0));
    const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    const v = { id: B.id, kind, row, town: rec.id, townName: titled(rec.name), x: cx, z: cz, y: rec.y ?? 0, w: B.x1 - B.x0, d: B.z1 - B.z0, front: B.front ?? 'N', B,
      name: kind === 'backroom' ? `${titled(rec.name)} saloon (back room)` : `${pick(rng, CASINO_NAMES[kind])}, ${titled(rec.name)}`,
      cage: row.cage ? iroll(rng, row.cage) : 0, safe: { cash: row.safe ? iroll(rng, row.safe) : 0, state: 'locked', work: 0 },
      tables: [], staff: [], guards: [], cameras: [], live: false, alarm: 'calm', lastSeen: null, paid: -1, susp: 0, avgBet: 0, carrying: null, lost: 0,
      stats: { betIn: 0, paidOut: 0, robbed: 0 }, seed: hash32(B.id.length, cx | 0, 0x43415349), owner: `the ${pick(rng, ['Vance', 'Okafor', 'Marchetti', 'Delgado', 'Brandt', 'Sato', 'Kowalski'])} family` };
    const L = this.layout(v), eye = DEALER_EYE[kind];
    if (kind === 'backroom') {
      const bar = g.pulls?.bars.get(B.id); const P = bar ? g.pulls.plan(bar) : null, T0 = P?.tables?.[0];
      const c = T0 ? g.pulls.layout(bar).at(T0.din, T0.dw) : L.at(L.depth * 0.6, 0);
      v.tables.push(this.table(v, 0, 'blackjack', c, L, rng, eye));
    } else {
      const games = [...Array(row.tables.blackjack).fill('blackjack'), ...Array(row.tables.chess).fill('chess')];
      const cols = Math.max(1, Math.min(3, Math.floor((L.width - 4) / 4))), rows = Math.ceil(games.length / cols);
      games.forEach((gm, i) => {
        const cI = i % cols, rI = Math.floor(i / cols);
        const din = L.depth * 0.38 + rI * Math.min(3.8, (L.depth * 0.45) / Math.max(1, rows - 1 || 1));
        const dw = (cI - (cols - 1) / 2) * Math.min(4.6, (L.width - 6) / Math.max(1, cols - 1 || 1));
        v.tables.push(this.table(v, i, gm, L.at(din, dw), L, rng, eye));
      });
      // the cage on the back wall (left), the office in the back corner (right) with the safe, the door at the front
      v.cagePos = L.at(1.6, -L.width / 2 + 3.2); v.cashierAt = L.at(0.8, -L.width / 2 + 3.2);
      v.officePos = L.at(2.4, L.width / 2 - 3.2); v.safePos = L.at(0.7, L.width / 2 - 1.2);
      v.doorPos = L.at(L.depth - 1.6, 0);
      v.staff.push({ role: 'cashier', name: 'Cashier', flag: g.randomFlag(rng), at: v.cashierAt, face: Math.atan2(L.inX, L.inZ), c: null, dead: false });
      const posts = { door: { at: L.at(L.depth - 2.2, 1.6), face: Math.atan2(L.inX, L.inZ) + Math.PI }, cage: { at: L.at(2.6, -L.width / 2 + 1.4), face: Math.atan2(L.inX, L.inZ) },
        office: { at: v.officePos, face: Math.atan2(L.inX, L.inZ) } };
      let k = 0;
      for (const p of row.guards.post) { const P0 = posts[p]; v.guards.push({ role: p, name: p === 'door' ? 'Door man' : p === 'cage' ? 'Cage guard' : p === 'office' ? (k++ ? 'House gun' : 'Pit boss') : GUARD.names[0], flag: g.randomFlag(rng), post: { x: P0.at.x + (k > 1 ? 1.2 : 0), z: P0.at.z, face: P0.face }, c: null, dead: false }); }
      for (let i = 0; i < row.guards.patrol; i++) {
        const loop = [L.at(L.depth * 0.3, -L.width / 2 + 1.6 + i), L.at(L.depth * 0.3, L.width / 2 - 1.6 - i), L.at(L.depth - 3, L.width / 2 - 1.6 - i), L.at(L.depth - 3, -L.width / 2 + 1.6 + i)];
        v.guards.push({ role: 'patrol', name: 'Floor man', flag: g.randomFlag(rng), post: null, loop, c: null, dead: false });
      }
      for (let i = 0; i < row.cameras; i++) { const s = i % 2 ? 1 : -1, back = i < 2; const at = L.at(back ? 0.4 : L.depth - 0.4, s * (L.width / 2 - 0.4)); v.cameras.push({ x: at.x, z: at.z, h: Math.atan2(L.at(L.depth / 2, 0).x - at.x, L.at(L.depth / 2, 0).z - at.z), broken: false }); }
      for (let i = 0; i < row.drones; i++) this.drones.push(this.droneRec(v, i, B, [0, 24]));
    }
    this.venues.set(v.id, v);
    this.dirty = true;
    return v;
  }
  table(v, i, game, c, L, rng, eye) {
    const rot = L.along, seat = { x: c.x + L.inX * 1.25, z: c.z + L.inZ * 1.25 }, dealerAt = { x: c.x - L.inX * 1.05, z: c.z - L.inZ * 1.05 };
    const t = { i, game, x: c.x, z: c.z, rot, seat, dealerAt, faceSeat: Math.atan2(c.x - seat.x, c.z - seat.z), faceDealer: Math.atan2(c.x - dealerAt.x, c.z - dealerAt.z),
      dealer: { name: game === 'chess' ? null : 'Card dealer', flag: this.g.randomFlag(rng), c: null, dead: false, eye }, opp: null, purse: 0, shoe: null, bj: null, chess: null };
    if (game === 'chess') { const id = pick(rng, CHESS_AT[v.kind]); const P = CHESS_PLAYERS[id]; t.opp = id; t.dealer.name = P.name; t.purse = iroll(rng, P.purse); }
    else t.shoe = new Shoe(BLACKJACK[v.kind].decks, BLACKJACK[v.kind].pen, rngOf(hash32(v.seed, i, 0x53484f45)));
    return t;
  }
  makeHome(t, B) {
    const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    const h = { id: B.id, town: t.rec.id, x: cx, z: cz, y: t.rec.y ?? 0, w: B.x1 - B.x0, d: B.z1 - B.z0, B, owner: null, home: true, alarm: 'calm', lastSeen: null, guards: [] };
    const v = [...this.venues.values()].find((q) => q.town === t.rec.id && q.row.drones); h.owner = v?.owner ?? 'the house'; h.venue = v?.id ?? null;
    this.homes.set(B.id, h);
    this.drones.push(this.droneRec(h, 0, B, SEC_DRONE.hours));
  }
  // A drone's loop: the property's corners 4 m out from the walls, at its height.
  droneRec(v, i, B, hours) {
    const m = 4, loop = [[B.x0 - m, B.z0 - m], [B.x1 + m, B.z0 - m], [B.x1 + m, B.z1 + m], [B.x0 - m, B.z1 + m]].map(([x, z]) => ({ x, z }));
    const k = i % 4, p = loop[k];
    return { id: `${v.id}:d${i}`, owner: v, loop, k: (k + 1) % 4, x: p.x, z: p.z, y: SEC_DRONE.alt, h: 0, hp: SEC_DRONE.hp, state: 'patrol', hours, seen: null, seenT: 0, markT: 0, jamT: 0, dock: { x: (B.x0 + B.x1) / 2, z: (B.z0 + B.z1) / 2 }, live: false, down: 0 };
  }
  // The room laid out from its own front (the same frame pulls.js uses for a bar).
  layout(v) {
    const B = { x0: v.x - v.w / 2, x1: v.x + v.w / 2, z0: v.z - v.d / 2, z1: v.z + v.d / 2 }, f = v.front ?? 'N';
    const inX = f === 'E' ? 1 : f === 'W' ? -1 : 0, inZ = f === 'S' ? 1 : f === 'N' ? -1 : 0;
    const backX = inX ? (inX > 0 ? B.x0 : B.x1) : v.x, backZ = inZ ? (inZ > 0 ? B.z0 : B.z1) : v.z;
    const ax = inZ ? 1 : 0, az = inX ? 1 : 0, width = inZ ? v.w : v.d, depth = inZ ? v.d : v.w;
    return { inX, inZ, ax, az, width, depth, along: inZ ? 0 : Math.PI / 2, at: (din, dw) => ({ x: backX + inX * din + ax * dw, z: backZ + inZ * din + az * dw }) };
  }
  inside(v, x, z, m = 0) { return Math.abs(x - v.x) < v.w / 2 + m && Math.abs(z - v.z) < v.d / 2 + m; }
  venueAt(x, z, m = 0) { for (const v of this.venues.values()) if (this.inside(v, x, z, m)) return v; return null; }

  // ---- the house's money --------------------------------------------------------------------------------------------------
  // A back room's house is its bar's till (pulls.js): the same real cash, never a second purse.
  house(v) { if (v.kind === 'backroom') return this.g.pulls?.bars.get(v.id)?.till ?? 0; return v.cage; }
  setHouse(v, n) { if (v.kind === 'backroom') { const b = this.g.pulls?.bars.get(v.id); if (b) b.till = n; return; } v.cage = n; }
  moveHouse(v, d) { this.setHouse(v, this.house(v) + d); }

  // ---- people ----------------------------------------------------------------------------------------------------------
  promote(v) {
    const g = this.g;
    const add = (o, name, flag, x, z, face, extra) => {
      const c = g.addChar({ x, z, faction: 'drifter', weapon: extra.weapon ?? null, hp: extra.hp ?? 100, colors: outfit(extra.weapon ? 'warden' : 'drifter', rngOf(hash32(v.seed, name.length, (x * 7) | 0))), name, flag });
      if (!c) return null;
      c.casinoId = v.id; c.home = { x, z }; c.face = face; c.casinoRole = extra.role; c.post = extra.post ?? { x, z, face }; c.loop = extra.loop ?? null; c.ri = 0; c.crouch = !!extra.seated;
      if (extra.weapon) c.mag = c.mag || 6;
      g.standOn?.(c); o.c = c; return c;
    };
    for (const t of v.tables) if (!t.dealer.dead && !t.dealer.c) add(t.dealer, t.dealer.name, t.dealer.flag, t.dealerAt.x, t.dealerAt.z, t.faceDealer, { role: t.game === 'chess' ? 'player' : 'dealer', seated: t.game === 'chess' });
    for (const s of v.staff) if (!s.dead && !s.c) add(s, s.name, s.flag, s.at.x, s.at.z, s.face, { role: s.role });
    for (const q of v.guards) if (!q.dead && !q.c) { const p = q.post ?? q.loop[0]; add(q, q.name, q.flag, p.x, p.z, q.post?.face ?? 0, { role: 'guard', weapon: v.row.guards.weapon, hp: GUARD.hp, post: q.post, loop: q.loop }); }
    v.live = true; this.dirty = true;
  }
  demote(v) {
    const g = this.g;
    for (const o of [...v.tables.map((t) => t.dealer), ...v.staff, ...v.guards]) {
      if (!o.c) continue;
      if (!o.c.alive) o.dead = true;
      if (g.chars.includes(o.c)) g.removeChar(o.c);
      o.c = null;
    }
    v.live = false; if (v.alarm === 'alert' && !this.seat) v.alarm = 'calm'; this.dirty = true;
  }
  people(v) { const out = []; for (const o of [...v.tables.map((t) => t.dealer), ...v.staff, ...v.guards]) if (o.c?.alive) out.push(o.c); return out; }
  guardsOf(v) { const out = []; for (const q of v.guards) if (q.c?.alive) out.push(q.c); return out; }

  // ai.js: a house person with nothing to shoot at keeps their mark; a guard on an alarm goes to where it was seen.
  think(c, dt) {
    const v = this.venues.get(c.casinoId); if (!v) return false;
    const g = this.g;
    if (c.telling) return false;
    if (c.casinoRole === 'runner') return this.runStep(c, dt);
    if (c.casinoRole === 'guard' && v.alarm === 'alert' && v.lastSeen && g.time - v.lastSeen.t < 40) {
      if (Math.hypot(v.lastSeen.x - v.x, v.lastSeen.z - v.z) < GUARD.leash) { if (this.goTo(c, v.lastSeen.x, v.lastSeen.z, 4.2, dt)) c.speed = 0; return true; }
    }
    if (c.casinoRole === 'guard' && v.carrying?.by === c) { const to = v.carrying.to; if (this.goTo(c, to.x, to.z, 1.8, dt)) this.carried(v); return true; }
    if (c.loop) { const wp = c.loop[c.ri]; if (this.goTo(c, wp.x, wp.z, 1.3, dt)) c.ri = (c.ri + 1) % c.loop.length; return true; }
    const p = c.post; if (!p) return false;
    if (this.goTo(c, p.x, p.z, 1.6, dt)) { c.speed = 0; c.face = p.face + (c.casinoRole === 'guard' ? Math.sin(g.time * 0.4 + c.slot) * 0.5 : 0); }
    return true;
  }
  goTo(c, tx, tz, speed, dt) {
    const dx = tx - c.x, dz = tz - c.z;
    if (dx * dx + dz * dz < 0.36) return true;
    this.g.ai.move(c, dx, dz, speed, dt);
    return false;
  }

  // ---- seats: entry, the panel -------------------------------------------------------------------------------------------
  // Who gets a seat (the row's entry): barred, wanted, standing, the cash shown at the door, the dress, the fee.
  entry(v) {
    const g = this.g, E = v.row.entry, P = g.player;
    if ((this.barred[v.id] ?? -1) > this.hours()) return { ok: false, why: `you are barred from ${v.name} for ${Math.ceil((this.barred[v.id] - this.hours()) / 24)} more days` };
    if ((g.wanted ?? 0) > E.wanted) return { ok: false, why: 'the door man knows your face from a poster' };
    const st = this.standing(v); if (st < E.standing) return { ok: false, why: `the house does not deal with you (standing ${Math.round(st)})` };
    if (g.cash < E.minCash) return { ok: false, why: `show $${E.minCash} at the door to sit in here` };
    const day = Math.floor(this.hours() / 24), paid = v.paid === day;
    const dressed = !E.dress || E.dress.some((s) => g.gear?.worn?.[s]);
    if (!dressed && !paid) { const fee = E.fee * 2; if (g.cash < fee) return { ok: false, why: `not dressed for the room: wear a coat or a vest, or pay the $${fee} door` }; return { ok: true, fee }; }
    if (E.fee && !paid) { if (g.cash < E.fee) return { ok: false, why: `the door is $${E.fee}` }; return { ok: true, fee: E.fee }; }
    void P; return { ok: true, fee: 0 };
  }
  standing(v) { const F = this.g.society?.factions; const c = this.people(v)[0]; return F && c && c.fi >= 0 ? F.reading(c.fi) : 0; }
  payDoor(v, fee) { if (!fee) return; const g = this.g; g.cash -= fee; this.moveHouse(v, fee); v.paid = Math.floor(this.hours() / 24); v.stats.betIn += 0; this.log('door', { venue: v.id, fee }); }
  seatNear(x, z, r = 1.2) {
    for (const v of this.venues.values()) { if (!v.live) continue; for (const t of v.tables) { if (Math.hypot(t.seat.x - x, t.seat.z - z) < r) return { v, t }; } }
    return null;
  }
  // Sit at table t of venue v (you are at its seat). Opens the panel; the world holds still while you play.
  sit(v, t) {
    const g = this.g, P = g.player;
    if (!v.live) return { ok: false, why: 'nobody is in that room' };
    if (!t.dealer.c?.alive) return { ok: false, why: t.game === 'chess' ? 'the chair across is empty' : 'there is nobody to deal' };
    if (v.alarm === 'alert') return { ok: false, why: 'the room is in an uproar' };
    if (Math.hypot(P.x - t.seat.x, P.z - t.seat.z) > 2.2) return { ok: false, why: 'stand at the seat first' };
    const e = this.entry(v); if (!e.ok) return e;
    this.payDoor(v, e.fee);
    P.x = t.seat.x; P.z = t.seat.z; P.face = t.faceSeat; P.crouch = true;
    if (t.game === 'chess') {
      const R = CHESS_PLAYERS[t.opp];
      t.chess = { S: Chess.start(), you: 'w', stake: Math.min(R.stake[1], t.purse, g.cash), over: null, moves: [], rng: rngOf(hash32(v.seed, t.i, this.counts.chessGames + 1)) };
      if (t.chess.stake < R.stake[0]) { P.crouch = false; return { ok: false, why: t.purse < R.stake[0] ? `${R.name} is cleaned out` : `you cannot cover the $${R.stake[0]} stake` } }
      g.cash -= t.chess.stake; t.purse -= t.chess.stake; t.chess.pot = t.chess.stake * 2; // both stakes on the table
    } else t.bj = null;
    this.seat = { v, t, game: t.game };
    g.tablePanel?.show(this);
    this.log('sit', { venue: v.id, table: t.i, game: t.game, fee: e.fee });
    return { ok: true, venue: v.id, table: t.i, game: t.game, fee: e.fee };
  }
  leave(why = 'up') {
    const s = this.seat; if (!s) return { ok: false, why: 'you are not sitting' };
    const g = this.g, t = s.t;
    if (t.game === 'chess' && t.chess && !t.chess.over) this.resign();
    if (t.game === 'blackjack' && t.bj?.phase === 'play') { for (const h of t.bj.hands) h.done = true; this.settle(s.v, t, t.bj.finish()); } // standing up mid-hand stands every hand
    this.seat = null; g.player.crouch = false;
    if (g.tablePanel?.open) g.tablePanel.close();
    return { ok: true, why };
  }

  // ---- blackjack ---------------------------------------------------------------------------------------------------------
  // Take the bet out of your pocket into the house (the cage). The house must cover a max split-and-double of it.
  bet(amount) {
    const s = this.seat; if (!s || s.game !== 'blackjack') return { ok: false, why: 'sit at a blackjack table' };
    const g = this.g, v = s.v, t = s.t, R = v.row, rule = BLACKJACK[v.kind];
    if (t.bj?.phase === 'play') return { ok: false, why: 'finish this hand' };
    const b = Math.round(amount);
    if (!(b >= R.min && b <= R.max)) return { ok: false, why: `bets here are $${R.min} to $${R.max}` };
    if (g.cash < b) return { ok: false, why: 'you cannot cover that' };
    if (this.house(v) < b * (2 + rule.bjPays)) return { ok: false, why: 'the house cannot cover that bet: the cage is short' };
    // the dealer's eye, BEFORE the cards: the true count the dealer keeps, and how your bet jumped against your average
    // (your base: the smallest of your last ten bets here, what a counter bets while the shoe is cold)
    const tc = t.shoe.trueCount(), recent = (v.recent ??= []), base = recent.length ? Math.min(...recent) : b;
    if (tc >= EYE.hot && b >= EYE.spread * base) v.susp += t.dealer.eye * EYE.jump; else v.susp = Math.max(0, v.susp - EYE.decay);
    recent.push(b); if (recent.length > 10) recent.shift();
    v.avgBet = v.avgBet ? v.avgBet * 0.8 + b * 0.2 : b;
    g.cash -= b; this.moveHouse(v, b); v.stats.betIn += b;
    t.bj = new Blackjack(rule, t.shoe);
    this.counts.hands++;
    const r = t.bj.deal(b);
    if (r.done) this.settle(v, t, r);
    if (v.susp >= 1) this.bar(v, 'counting cards');
    return { ok: true, ...this.bjView(t) };
  }
  act(move) {
    const s = this.seat; if (!s || s.game !== 'blackjack' || t0(s.t)) return { ok: false, why: 'no hand out' };
    const g = this.g, v = s.v, t = s.t, B = t.bj, h = B.hand();
    let r;
    if (move === 'hit') r = B.hit();
    else if (move === 'stand') r = B.stand();
    else if (move === 'double' || move === 'split') {
      if (move === 'double' ? !B.canDouble() : !B.canSplit()) return { ok: false, why: `you cannot ${move} this hand` };
      if (g.cash < h.bet) return { ok: false, why: 'you cannot cover the second bet' };
      g.cash -= h.bet; this.moveHouse(v, h.bet); v.stats.betIn += h.bet;
      r = move === 'double' ? B.double() : B.split();
    } else if (move === 'palm') return this.palm();
    else return { ok: false, why: 'hit | stand | double | split | palm' };
    if (!r.ok) return r;
    if (r.done) this.settle(v, t, r);
    return { ok: true, ...this.bjView(t) };
  }
  // The payout leaves the house into your pocket, exactly what the hand paid back.
  settle(v, t, r) {
    const g = this.g;
    if (r.paid > 0) { this.moveHouse(v, -r.paid); g.cash += r.paid; v.stats.paidOut += r.paid; }
    t.last = { staked: r.staked, paid: r.paid, net: r.net, dealer: r.dealer, at: r1(this.hours()) };
    this.log('hand', { venue: v.id, staked: r.staked, paid: r.paid });
    this.float(v);
  }
  // Cheat: swap your last card for an ace out of your sleeve. Caught: the hand is the house's, you are barred, the guards
  // are on you. Not caught: the ace plays (it is not one of the shoe's).
  palm() {
    const s = this.seat, v = s.v, t = s.t, B = t.bj, h = B?.hand();
    if (!h || B.phase !== 'play') return { ok: false, why: 'no hand out' };
    const rng = rngOf(hash32(v.seed, this.counts.hands, 0x50414c4d)), p = EYE.catch[0] + t.dealer.eye * EYE.catch[1];
    if (rng() < p) {
      for (const x of B.hands) { x.done = true; x.result = 'forfeit'; x.back = 0; }
      B.phase = 'done';
      t.last = { staked: B.hands.reduce((a, x) => a + x.bet, 0), paid: 0, net: -B.hands.reduce((a, x) => a + x.bet, 0), caught: true };
      this.counts.caught++;
      this.bar(v, 'palming a card');
      this.alarm(v, 'cheat', { x: this.g.player.x, z: this.g.player.z }, t.dealer.c);
      return { ok: true, caught: true, ...this.bjView(t) };
    }
    h.cards[h.cards.length - 1] = 'AS';
    return { ok: true, caught: false, ...this.bjView(t) };
  }
  bar(v, why) {
    this.barred[v.id] = this.hours() + EYE.barDays * 24; this.counts.barred++;
    this.g.hud?.toast?.(`THE PIT BOSS SHOWS YOU THE DOOR · ${why.toUpperCase()}`, 'hot');
    this.log('barred', { venue: v.id, why });
    if (this.seat?.v === v) this.leave('barred');
  }
  bjView(t) { return { game: 'blackjack', hand: t.bj ? t.bj.view() : null, last: t.last ?? null }; }

  // ---- chess ---------------------------------------------------------------------------------------------------------------
  move(txt) {
    const s = this.seat; if (!s || s.game !== 'chess') return { ok: false, why: 'sit at a chess table' };
    const t = s.t, C = t.chess; if (C.over) return { ok: false, why: `the game is over (${C.over})` };
    if (C.S.turn !== C.you) return { ok: false, why: 'not your move' };
    const m = typeof txt === 'string' ? Chess.parseMove(C.S, txt) : txt;
    if (!m || !Chess.isLegal(C.S, m)) return { ok: false, why: `${txt} is not a legal move` };
    C.S = Chess.play(C.S, m); C.moves.push(Chess.moveName(m));
    if (this.chessEnd(s.v, t)) return { ok: true, ...this.chessView(t) };
    const R = CHESS_PLAYERS[t.opp], reply = Chess.think(C.S, R, C.rng);
    C.illegal = (C.illegal ?? 0) + (Chess.isLegal(C.S, reply) ? 0 : 1); // never: think() only picks from legal()
    C.S = Chess.play(C.S, reply); C.moves.push(Chess.moveName(reply)); C.reply = Chess.moveName(reply);
    this.chessEnd(s.v, t);
    return { ok: true, ...this.chessView(t) };
  }
  chessEnd(v, t) {
    const C = t.chess, st = Chess.status(C.S); if (st !== 'mate' && st !== 'stalemate' && st !== 'draw') return false;
    const g = this.g, youWon = st === 'mate' && C.S.turn !== C.you;
    C.over = st === 'mate' ? (youWon ? 'you won' : 'you lost') : st;
    if (youWon) g.cash += C.pot; else if (st === 'mate') t.purse += C.pot; else { g.cash += C.pot / 2; t.purse += C.pot / 2; }
    C.pot = 0; this.counts.chessGames++;
    this.log('chess', { venue: v.id, table: t.i, result: C.over, moves: C.moves.length });
    return true;
  }
  resign() { const t = this.seat?.t, C = t?.chess; if (!C || C.over) return { ok: false, why: 'no game' }; C.over = 'you resigned'; t.purse += C.pot; C.pot = 0; this.counts.chessGames++; return { ok: true }; }
  chessView(t) { const C = t.chess; return { game: 'chess', board: C ? C.S.b.slice() : null, turn: C?.S.turn, status: C ? Chess.status(C.S) : null, over: C?.over ?? null, reply: C?.reply ?? null, moves: C?.moves.slice(-12) ?? [], stake: C?.stake ?? 0, opponent: CHESS_PLAYERS[t.opp]?.name, purse: t.purse }; }

  // ---- the float: cash carried from the safe to the cage (law 1) ----------------------------------------------------------
  float(v) {
    if (v.kind === 'backroom' || v.carrying || v.cage >= v.row.floatAt || v.safe.cash <= 0 || v.safe.state !== 'locked') return;
    const q = v.guards.find((x) => x.role === 'office' && x.c?.alive);
    const amt = Math.min(v.row.carry, v.safe.cash);
    if (!q) { if (!v.live) { v.safe.cash -= amt; v.cage += amt; this.counts.carried++; } return; } // off screen: the office's own hands
    v.safe.cash -= amt;
    v.carrying = { by: q.c, amt, to: v.cagePos };
    this.log('carry', { venue: v.id, amt });
  }
  carried(v) { const C = v.carrying; if (!C) return; v.cage += C.amt; v.carrying = null; this.counts.carried++; this.log('float', { venue: v.id, amt: C.amt }); }

  // ---- robbery ---------------------------------------------------------------------------------------------------------------
  // Who saw it: every live house person (and anyone else in the room) inside sight with a line of sight; guards also hear
  // `noise` m. Cameras tell when the office's watcher is alive at his post. Returns { guards (who know), witnesses (the
  // rest who saw), camera }.
  whoKnows(v, x, z, noise = 0) {
    const g = this.g, night = g.sky?.night ?? 0, sight = GUARD.sight[0] + (GUARD.sight[1] - GUARD.sight[0]) * night;
    const out = { guards: [], witnesses: [], camera: false, heard: false };
    for (const c of g.chars) {
      if (!c.alive || c === g.player || c.sleeping) continue;
      const mine = c.casinoId === v.id; if (!mine && !this.inside(v, c.x, c.z)) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      const sees = d < sight && (d < 1.5 || g.los(c.x, c.z, x, z));
      const hears = noise > 0 && d < Math.min(noise, GUARD.hear);
      if (mine && c.casinoRole === 'guard') { if (sees || hears) { out.guards.push(c); if (!sees) out.heard = true; } }
      else if (sees) out.witnesses.push(c);
    }
    const watcher = v.guards.find((q) => q.role === 'office' && q.c?.alive && Math.hypot(q.c.x - q.post.x, q.c.z - q.post.z) < 2.5);
    if (watcher) for (const cam of v.cameras) {
      if (cam.broken) continue;
      const dx = x - cam.x, dz = z - cam.z, d = Math.hypot(dx, dz); if (d > CAMERA.range || d < 0.3) continue;
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - cam.h), Math.cos(Math.atan2(dx, dz) - cam.h)));
      if (off < (CAMERA.cone * Math.PI) / 360 && g.los(cam.x, cam.z, x, z)) { out.camera = true; break; }
    }
    return out;
  }
  // The alarm: the guards who know go for you (grudge) and to where you were seen, not to where you are.
  alarm(v, why, at, by = null) {
    const g = this.g, first = v.alarm !== 'alert';
    v.alarm = 'alert'; v.lastSeen = { x: at.x, z: at.z, t: g.time, why, by: by?.id ?? null };
    for (const c of this.guardsOf(v)) c.grudge = g.player;
    if (first) { this.counts.alarms++; g.hud?.toast?.(`${v.name.toUpperCase()} · THE GUARDS ARE ON YOU (${why})`, 'hot'); this.log('alarm', { venue: v.id, why, by: by?.id ?? null }); }
  }
  // Rob the cage: your gun up at the cashier inside reach. Or the safe: open it with what you carry.
  robCage(v) {
    const g = this.g, P = g.player;
    if (v.kind === 'backroom') return { ok: false, why: 'the back room has no cage (the till is the bar\'s: hold up the barkeep)' };
    if (Math.hypot(P.x - v.cagePos.x, P.z - v.cagePos.z) > CAGE.reach + 1) return { ok: false, why: 'get to the cage' };
    if (!P.weapon || (g.arms && g.arms.stance !== 'raised')) return { ok: false, why: 'raise a gun at the cashier' };
    const cashier = v.staff.find((s) => s.role === 'cashier');
    if (!cashier?.c?.alive) return { ok: false, why: 'nobody behind the cage to open it' };
    const take = v.cage; v.cage = 0; g.cash += take; v.stats.robbed += take;
    return this.robbed(v, 'cage', take, cashier.c, 0);
  }
  safeTools() { const inv = this.g.inventory; return Object.keys(SAFE).filter((k) => inv?.carried.count(SAFE[k].needs) > 0); }
  // Work the safe for dt (held E or the command): the time per the tool; its noise when done.
  workSafe(v, how, dt) {
    const g = this.g, P = g.player, S = SAFE[how];
    if (!S) return { ok: false, why: `how: ${Object.keys(SAFE).join(' | ')}` };
    if (!v.safePos) return { ok: false, why: 'no safe in a back room' };
    if (v.safe.state !== 'locked') return { ok: false, why: `the safe is ${v.safe.state}` };
    if (Math.hypot(P.x - v.safePos.x, P.z - v.safePos.z) > 2.2) return { ok: false, why: 'get to the safe' };
    if (!(g.inventory.carried.count(S.needs) > 0)) return { ok: false, why: `you carry no ${ITEMS[S.needs]?.name ?? S.needs}` };
    v.safe.work += dt; v.safe.how = how;
    if (v.safe.work < S.time) return { ok: true, working: r1(v.safe.work / S.time) };
    if (S.uses) g.inventory.spend(S.needs, S.uses);
    v.safe.state = how === 'blow' ? 'blown' : 'open'; v.safe.work = 0;
    if (how === 'blow') g.fx?.explosion?.(v.safePos.x, v.safePos.z);
    if (S.noise) g.noise(v.safePos.x, v.safePos.z, S.noise, P);
    const take = v.safe.cash; v.safe.cash = 0; g.cash += take; v.stats.robbed += take;
    return this.robbed(v, 'safe', take, null, S.noise);
  }
  robbed(v, what, take, victim, noise) {
    const g = this.g, P = g.player;
    const W = this.whoKnows(v, P.x, P.z, noise);
    const rec = g.society?.deeds?.record('rob', { target: victim, x: P.x, z: P.z, label: v.name, witness: true });
    const R = { venue: v.id, what, took: take, seq: rec?.seq ?? null, guards: W.guards.map((c) => c.id), witnesses: W.witnesses.map((c) => c.id), camera: W.camera, at: { x: r1(P.x), z: r1(P.z) }, posted: null };
    v.robbery = R; this.counts.robberies++;
    if (W.guards.length || W.camera) this.alarm(v, W.camera && !W.guards.length ? 'the camera' : W.heard ? 'heard it' : 'saw it', P, W.guards[0] ?? null);
    // the rest of the room runs: to a guard first if the house does not know yet, then to the town's board
    for (const c of W.witnesses) this.sendRunner(v, c, R);
    this.log('robbed', { venue: v.id, what, took: take, guards: W.guards.length, witnesses: W.witnesses.length, camera: W.camera });
    return { ok: true, ...R };
  }
  // A witness's run (people on foot, at WITNESS.speed): a guard if the house is calm, then the board.
  sendRunner(v, c, R) {
    const place = this.placeOf(v); if (!place) return;
    const gq = v.alarm !== 'alert' ? this.guardsOf(v).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0] : null;
    const run = { c, v, R, stops: [...(gq ? [{ guard: gq }] : []), { board: place }], i: 0, sawAt: { ...R.at }, t0: this.g.time };
    c.casinoRole = 'runner'; c.casinoId = v.id; c.crouch = false; c.runRec = run;
    this.runners.push(run);
  }
  runStep(c, dt) {
    const run = c.runRec; if (!run) return false;
    const s = run.stops[run.i]; if (!s) { c.casinoRole = 'gone'; return false; }
    const tx = s.guard ? s.guard.x : s.board.x, tz = s.guard ? s.guard.z : s.board.z;
    if (s.guard && !s.guard.alive) { run.i++; return true; }
    if (Math.hypot(tx - c.x, tz - c.z) < (s.guard ? 2 : WITNESS.arrive)) { this.arrive(run, s); run.i++; return true; }
    if (!c.rp || this.g.time - c.rp.t > 3 || Math.hypot(c.rp.tx - tx, c.rp.tz - tz) > 3) c.rp = { t: this.g.time, tx, tz, pts: this.g.footPath?.(c.x, c.z, tx, tz) ?? [{ x: tx, z: tz }], i: 0 };
    let wp = c.rp.pts[Math.min(c.rp.i, c.rp.pts.length - 1)];
    if (Math.hypot(wp.x - c.x, wp.z - c.z) < 1.2 && c.rp.i < c.rp.pts.length - 1) wp = c.rp.pts[++c.rp.i];
    this.g.ai.move(c, wp.x - c.x, wp.z - c.z, WITNESS.speed, dt);
    return true;
  }
  // A guard told raises the alarm at where the witness SAW you; the board posts the bounty (the house pays it).
  arrive(run, s) {
    const g = this.g, v = run.v, R = run.R;
    if (s.guard) { if (v.alarm !== 'alert') this.alarm(v, 'a witness told', run.sawAt, run.c); return; }
    if (R.posted || !g.stories || !R.seq) return;
    const SS = g.stories, at = s.board;
    const pay = Math.max(WITNESS.min, Math.min(WITNESS.max, Math.round(R.took * WITNESS.bounty)));
    const fund = Math.min(pay, v.cage + v.safe.cash);
    if (fund <= 0) return;
    const fromCage = Math.min(fund, v.cage); v.cage -= fromCage; v.safe.cash -= fund - fromCage; at.coin += fund; // the house funds it through the town's chest
    const r = SS.post({ target: { kind: 'player', name: SS.youName() }, by: { name: v.owner, place: at.id }, deed: { seq: R.seq, verb: 'rob', text: `robbing ${v.name}` }, pay: fund });
    if (r.ok) { R.posted = { bounty: r.bounty.id, place: at.id, pay: r.bounty.pay, at: r1(this.hours()), by: run.c.id }; this.counts.bounties++; this.log('posted', { venue: v.id, bounty: r.bounty.id, pay: r.bounty.pay }); }
    else { at.coin -= fund; v.cage += fromCage; v.safe.cash += fund - fromCage; R.postFail = r.why; }
  }
  // The town's place in the site stories (its board): the plan's own, or one opened for an ad-hoc town.
  placeOf(v) {
    const SS = this.g.stories; if (!SS) return null;
    SS.ensure?.();
    let p = SS.nearestPlace(v.x, v.z, 450, (q) => q.kind === 'town' || q.kind === 'city');
    if (!p) {
      const t = this.g.citygen?.byId?.get(v.town);
      p = SS.addPlace({ id: `cas-${v.town}`, name: v.townName, kind: 'town', x: t?.x ?? v.x, z: t?.z ?? v.z, half: t?.half ?? 200, holder: `site:cas-${v.town}`, pop: [40, 80] });
    }
    return p;
  }
  // Routes in: the front door, the back door (back lots), a storm drain under the street (understreet).
  plan(v) {
    const g = this.g, L = this.layout(v), out = { venue: v.id, name: v.name, front: L.at(L.depth + 0.5, 0), routes: [] };
    out.routes.push({ how: 'front door', at: { x: r1(out.front.x), z: r1(out.front.z) }, past: v.guards.filter((q) => q.role === 'door').length + ' door man' });
    const back = L.at(-0.5, 0);
    const doors = g.interiors?.doors ?? [];
    let bd = null, best = 1e9; for (const d of doors) { const dd = Math.hypot(d.x - back.x, d.z - back.z); if (dd < best && dd < Math.max(v.w, v.d) / 2 + 2 && Math.hypot(d.x - out.front.x, d.z - out.front.z) > 4) { best = dd; bd = d; } }
    out.routes.push(bd ? { how: 'back door', at: { x: r1(bd.x), z: r1(bd.z) }, locked: !!bd.locked } : { how: 'back door', at: null, note: 'no back door on this building' });
    // a breach that comes up inside this very building beats any manhole on the street
    const row = g.understreet?.byTown?.get(v.town), ways = row?.net?.ways ?? [];
    let drain = null, dd = 1e9; for (const w of ways) { const q = wayTop(w), k = w.store === v.id ? -1 : Math.hypot(q.x - v.x, q.z - v.z); if (k < dd) { dd = k; drain = { ...q, kind: w.kind, under: w.store === v.id }; } }
    out.routes.push(drain ? { how: 'storm drain', way: drain.kind, under: drain.under, at: { x: r1(drain.x), z: r1(drain.z) }, d: Math.round(Math.hypot(drain.x - v.x, drain.z - v.z)) } : { how: 'storm drain', at: null, note: 'no drain mouth near this block' });
    out.inside = { cage: v.cagePos && { x: r1(v.cagePos.x), z: r1(v.cagePos.z), cash: '?' }, safe: v.safePos && { x: r1(v.safePos.x), z: r1(v.safePos.z) }, guards: v.guards.length, cameras: v.cameras.length, drones: this.drones.filter((d) => d.owner === v).length };
    return out;
  }

  // ---- security drones -------------------------------------------------------------------------------------------------------
  // Line of sight only: a body inside a building is under its roof; the dark and a crouch shorten it.
  droneSees(d, c) {
    const g = this.g; if (!c?.alive) return false;
    if (c.ug || g.insideBuilding || this.venueAt(c.x, c.z) || this.homeAt(c.x, c.z)) return false;
    const night = g.sky?.night ?? 0, D = SEC_DRONE;
    let r = D.sight[0] + (D.sight[1] - D.sight[0]) * night; if (c.crouch || c.prone) r *= D.crouchMul;
    const dist = Math.hypot(c.x - d.x, c.z - d.z); if (dist > r) return false;
    return g.los(d.x, d.z, c.x, c.z);
  }
  homeAt(x, z) { for (const h of this.homes.values()) if (Math.abs(x - h.x) < h.w / 2 && Math.abs(z - h.z) < h.d / 2) return h; return null; }
  onDuty(d) { const [a, b] = d.hours, h = this.g.sky?.time ?? 12; return a <= b ? h >= a && h < b : h >= a || h < b; }
  // Who the drone calls in on: anyone on a home's grounds while it flies; at a room, only a barred or wanted face, a gun
  // up, or anyone once the alarm is out.
  intruder(d) {
    const g = this.g, o = d.owner;
    if (o.home) return true;
    if (o.alarm === 'alert' || (this.barred[o.id] ?? -1) > this.hours() || (g.wanted ?? 0) > o.row.entry.wanted) return true;
    return !!g.player.weapon && g.arms?.stance === 'raised';
  }
  updateDrones(dt) {
    const g = this.g, P = g.player, D = SEC_DRONE, jam = g.inventory?.carried.count('jammer') > 0;
    for (const d of this.drones) {
      d.live = !!(d.owner.home ? this.g.citygen?.live?.has(d.owner.town) : d.owner.live);
      if (!d.live || d.state === 'gone') continue;
      if (d.state === 'falling') { d.y = Math.max(0.15, d.y - dt * 12); d.down += dt; if (d.down > 1) { d.state = 'gone'; g.fx?.explosion?.(d.x, d.z); } continue; }
      if (!this.onDuty(d)) { d.state = 'docked'; this.fly(d, d.dock.x, d.dock.z, dt); d.y = Math.max(d.owner.home ? 4 : 6, d.y - dt); continue; }
      if (d.state === 'docked') d.state = 'patrol';
      if (jam && Math.hypot(P.x - d.x, P.z - d.z) < D.jam) { if (d.state !== 'jammed') { d.state = 'jammed'; d.jamT = D.homeRest; d.seen = null; this.log('jammed', { drone: d.id }); } }
      if (d.state === 'jammed') { d.jamT -= dt; this.fly(d, d.dock.x, d.dock.z, dt); if (d.jamT <= 0) d.state = 'patrol'; continue; }
      const sees = this.droneSees(d, P);
      if (sees && this.intruder(d)) {
        if (d.state !== 'track') { this.counts.spotted++; this.log('spotted', { drone: d.id, at: { x: r1(P.x), z: r1(P.z) } }); }
        d.state = 'track'; d.seen = { x: P.x, z: P.z, t: g.time };
        P.marked = g.time + D.mark;
        const o = d.owner, v = o.home ? (o.venue ? this.venues.get(o.venue) : null) : o;
        if (v) this.alarm(v, 'a drone saw you', d.seen, null);
        else { o.alarm = 'alert'; o.lastSeen = { ...d.seen }; }
      }
      if (d.state === 'track') {
        if (!d.seen || g.time - d.seen.t > 6) { d.state = 'patrol'; d.seen = null; }
        else { this.fly(d, d.seen.x, d.seen.z, dt, 1.4); continue; }
      }
      const wp = d.loop[d.k]; if (this.fly(d, wp.x, wp.z, dt)) d.k = (d.k + 1) % d.loop.length;
      d.y += (D.alt - d.y) * Math.min(1, dt * 2);
    }
  }
  fly(d, tx, tz, dt, mul = 1) {
    const dx = tx - d.x, dz = tz - d.z, dist = Math.hypot(dx, dz), sp = SEC_DRONE.speed * mul * dt;
    if (dist < 0.8) return true;
    d.h = Math.atan2(dx, dz);
    const k = Math.min(1, sp / dist); d.x += dx * k; d.z += dz * k;
    return false;
  }
  // combat.js: a round crossing a drone (its body, seen from above: the shot passes under the guns' height only at the drone's own spot).
  raycast(ox, oz, dx, dz, max) {
    let best = null;
    for (const d of this.drones) {
      if (!d.live || d.state === 'gone' || d.state === 'falling') continue;
      const px = d.x - ox, pz = d.z - oz, t = px * dx + pz * dz; if (t < 0 || t > max) continue;
      const off = Math.abs(px * dz - pz * dx); if (off > 0.55) continue;
      if (!best || t < best.t) best = { t, drone: d };
    }
    return best;
  }
  hurtDrone(d, dmg, by) {
    if (d.state === 'gone' || d.state === 'falling') return;
    d.hp -= dmg; this.g.fx?.sparks?.(d.x, d.y, d.z, 0, 0, 4);
    if (d.hp <= 0) { d.state = 'falling'; d.down = 0; this.counts.dronesDown++; this.log('droneDown', { drone: d.id, by: by?.id ?? null }); if (by === this.g.player) this.g.hud?.toast?.('SECURITY DRONE DOWN', 'job'); }
  }

  // ---- gunshots and blasts carry to the guards ----------------------------------------------------------------------------
  onNoise(x, z, r, src) {
    if (src !== this.g.player || r < 20) return;
    for (const v of this.venues.values()) {
      if (!v.live || v.alarm === 'alert') continue;
      for (const c of this.guardsOf(v)) if (Math.hypot(c.x - x, c.z - z) < Math.min(r, GUARD.hear)) { this.alarm(v, 'a shot', { x, z }, c); break; }
    }
  }

  // ---- per frame -----------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.enabled) return;
    const g = this.g, P = g.player;
    this.scanT = (this.scanT ?? 0) - dt;
    if (this.scanT <= 0) {
      this.scanT = 1;
      this.scan();
      for (const v of this.venues.values()) {
        const town = g.citygen?.live?.has(v.town);
        const d = Math.hypot(v.x - P.x, v.z - P.z);
        if (!v.live && town && d < LIVE_R) this.promote(v);
        else if (v.live && (!town || d > DROP_R)) this.demote(v);
        if (!town) { this.venues.delete(v.id); this.dropDrones(v); }
        else this.float(v);
      }
      for (const h of this.homes.values()) if (!g.citygen?.live?.has(h.town)) { this.homes.delete(h.id); this.dropDrones(h); }
      // the alarm settles when nobody has seen you in a while
      for (const v of this.venues.values()) if (v.alarm === 'alert' && v.lastSeen && g.time - v.lastSeen.t > 90) { v.alarm = 'calm'; for (const c of this.guardsOf(v)) { if (c.grudge === P) c.grudge = null; if (c.target === P) { c.target = null; c.state = 'idle'; } } }
    }
    for (let i = this.runners.length - 1; i >= 0; i--) { const r = this.runners[i]; if (!r.c.alive || r.i >= r.stops.length || !g.chars.includes(r.c)) { if (r.c.alive && g.chars.includes(r.c)) r.c.casinoRole = 'gone'; this.runners.splice(i, 1); } }
    for (const v of this.venues.values()) if (v.carrying && !v.carrying.by.alive) { v.lost += v.carrying.amt; v.carrying = null; } // dead on the way: the money lies with him
    this.updateDrones(dt);
    if (this.dirty) { this.dirty = false; this.furnish(); }
    this.drawDrones();
  }
  dropDrones(o) { for (let i = this.drones.length - 1; i >= 0; i--) if (this.drones[i].owner === o) this.drones.splice(i, 1); }

  // ---- E in the world: a seat, the cage, the safe -----------------------------------------------------------------------------
  interact(p, I, dt) {
    if (!this.enabled || p.inVehicle || this.g.tablePanel?.open) return false;
    const g = this.g, at = this.seatNear(p.x, p.z, 1.1);
    if (at) {
      const e = this.entry(at.v), label = at.t.game === 'chess' ? `Play chess with ${at.t.dealer.name.toLowerCase()} ($${Math.min(CHESS_PLAYERS[at.t.opp].stake[1], at.t.purse)})` : `Sit at blackjack ($${at.v.row.min}-$${at.v.row.max})`;
      g.hud.prompt(e.ok ? `<kbd>E</kbd> ${label}${e.fee ? ` · $${e.fee} at the door` : ''}` : `${label} · <b class="warn">${e.why}</b>`);
      this.ring.x = at.t.x; this.ring.z = at.t.z; g.qol?.highlight?.(this.ring);
      if (e.ok && I.hit('KeyE')) { const r = this.sit(at.v, at.t); if (!r.ok) g.hud.toast(r.why.toUpperCase(), 'warn'); g.hud.prompt(null); }
      return true;
    }
    for (const v of this.venues.values()) {
      if (!v.live || !v.cagePos) continue;
      if (Math.hypot(p.x - v.cagePos.x, p.z - v.cagePos.z) < CAGE.reach && v.cage > 0 && p.weapon && g.arms?.stance === 'raised') {
        const down = I.key('KeyE');
        this.hold = down ? this.hold + dt : 0;
        g.hud.prompt(this.hold > 0 ? `Holding up the cage… ${Math.round(Math.min(1, this.hold / CAGE.hold) * 100)}%` : '<kbd>E</kbd> hold: Hold up the cage');
        if (this.hold >= CAGE.hold) { this.hold = 0; const r = this.robCage(v); g.hud.toast(r.ok ? `YOU TOOK $${r.took}` : r.why.toUpperCase(), r.ok ? 'hot' : 'warn'); }
        return true;
      }
      if (Math.hypot(p.x - v.safePos.x, p.z - v.safePos.z) < 1.6 && v.safe.state === 'locked') {
        const tools = this.safeTools();
        if (!tools.length) { g.hud.prompt('The office safe · you need picks, a pry bar or a charge'); return true; }
        const how = tools[0], S = SAFE[how];
        if (I.key('KeyE')) { const r = this.workSafe(v, how, dt); g.hud.prompt(r.ok && r.working !== undefined ? `${S.words}… ${Math.round(r.working * 100)}%` : r.ok ? `THE SAFE IS OPEN · $${r.took}` : r.why); }
        else g.hud.prompt(`<kbd>E</kbd> hold: ${S.words.toLowerCase()} (${how}${S.noise ? ', loud' : ', quiet'})`);
        return true;
      }
    }
    return false;
  }

  // ---- drawing ----------------------------------------------------------------------------------------------------------------
  ensureMeshes() {
    if (this.furn || !this.g.scene) return;
    const mk = (cap, name) => { const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 }), cap); m.name = name; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); m.frustumCulled = false; m.count = 0; m.castShadow = true; m.receiveShadow = true; this.g.scene.add(m); return m; };
    this.furn = mk(FURN_CAP, 'casino-rooms'); this.dyn = mk(DYN_CAP, 'casino-drones');
  }
  furnish() {
    this.ensureMeshes(); if (!this.furn) return;
    let n = 0;
    const box = (x, z, y, sx, sy, sz, rot, col) => { if (n >= FURN_CAP) return; _o.position.set(x, y + sy / 2, z); _o.rotation.set(0, rot, 0); _o.scale.set(sx, sy, sz); _o.updateMatrix(); this.furn.setMatrixAt(n, _o.matrix); this.furn.setColorAt(n, _c.set(col)); n++; };
    const wood = '#4a2f1e', rail = '#2a1a10', chip = ['#c8402a', '#e8dcc0', '#2a5a8a', '#1a1a18', '#d8a83a'];
    for (const v of this.venues.values()) {
      if (!v.live) continue;
      const L = this.layout(v), y = v.y ?? 0, rot = L.along;
      if (v.kind !== 'backroom') {
        // the floor carpet: a deep red field in a gold border, and the felt tables on it
        const c0 = L.at(L.depth / 2, 0), sx = L.inZ ? L.width - 1 : L.depth - 1, sz = L.inZ ? L.depth - 1 : L.width - 1;
        box(c0.x, c0.z, y + 0.03, sx, 0.02, sz, 0, '#b8902a'); box(c0.x, c0.z, y + 0.04, sx - 0.6, 0.02, sz - 0.6, 0, '#5a1a14');
        // the cage: a counter with bars, the cashier's window
        const cg = v.cagePos; box(cg.x, cg.z, y, 2.6, 1.1, 0.6, rot, wood); for (let i = 0; i < 7; i++) { const q = L.at(1.6, -L.width / 2 + 2 + i * 0.4); box(q.x, q.z, y + 1.1, 0.05, 1.2, 0.05, 0, '#b8a060'); }
        box(cg.x, cg.z, y + 2.3, 2.7, 0.08, 0.7, rot, '#b8a060');
        // the office: a partition and the safe (dark steel; open it hangs ajar)
        const sf = v.safePos; box(sf.x, sf.z, y, 0.9, 1.1, 0.8, rot, v.safe.state === 'locked' ? '#3a3e40' : '#6a6e70');
        if (v.safe.state !== 'locked') box(sf.x + L.inX * 0.6, sf.z + L.inZ * 0.6, y, 0.08, 1.0, 0.8, rot + 0.9, '#3a3e40');
        const part = L.at(3.6, L.width / 2 - 3.2); box(part.x, part.z, y, L.inZ ? 4.4 : 0.15, 2.4, L.inZ ? 0.15 : 4.4, 0, '#6a5038');
        for (const cam of v.cameras) box(cam.x, cam.z, y + 2.8, 0.22, 0.16, 0.3, cam.h, cam.broken ? '#2a2a2a' : '#1c1c1a');
      }
      for (const t of v.tables) {
        const felt = v.row.felt;
        if (t.game === 'chess') {
          box(t.x, t.z, y, 1.0, 0.74, 1.0, rot, wood);
          for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const ox = (i - 1.5) * 0.18, oz = (j - 1.5) * 0.18; box(t.x + ox, t.z + oz, y + 0.74, 0.18, 0.02, 0.18, 0, (i + j) % 2 ? '#2a1a10' : '#d8c8a0'); }
        } else {
          // a half-moon of felt on a padded rail: two boxes and a rail, the dealer's tray and a chip stack
          box(t.x, t.z, y, 2.2, 0.76, 1.3, rot, rail); box(t.x, t.z, y + 0.76, 2.0, 0.03, 1.1, rot, felt);
          box(t.dealerAt.x * 0.3 + t.x * 0.7, t.dealerAt.z * 0.3 + t.z * 0.7, y + 0.79, 0.5, 0.06, 0.2, rot, '#1a1a18');
          for (let k = 0; k < 4; k++) box(t.x + (k - 1.5) * 0.12 * (L.inZ ? 1 : 0), t.z + (k - 1.5) * 0.12 * (L.inX ? 1 : 0), y + 0.8, 0.08, 0.03 + k * 0.012, 0.08, 0, chip[k % chip.length]);
          box(t.x, t.z, y + 0.8, 0.12, 0.005, 0.17, rot + 0.2, '#efe6d2'); box(t.x + 0.2, t.z + 0.1, y + 0.8, 0.12, 0.005, 0.17, rot - 0.15, '#efe6d2');
        }
        box(t.seat.x, t.seat.z, y, 0.45, 0.5, 0.45, rot, '#3a2416'); // your stool
      }
    }
    this.furn.count = n; this.furn.instanceMatrix.needsUpdate = true; if (this.furn.instanceColor) this.furn.instanceColor.needsUpdate = true;
  }
  drawDrones() {
    if (!this.dyn) { if (!this.drones.length) return; this.ensureMeshes(); if (!this.dyn) return; }
    let n = 0; const t = this.g.time ?? 0;
    const put = (x, y, z, h, lx, ly, lz, sx, sy, sz, col) => { if (n >= DYN_CAP) return; const c = Math.cos(h), s = Math.sin(h); _o.position.set(x + lx * c + lz * s, y + ly, z - lx * s + lz * c); _o.rotation.set(0, h, 0); _o.scale.set(sx, sy, sz); _o.updateMatrix(); this.dyn.setMatrixAt(n, _o.matrix); this.dyn.setColorAt(n, _c.set(col)); n++; };
    for (const d of this.drones) {
      if (!d.live || d.state === 'gone') continue;
      put(d.x, d.y, d.z, d.h, 0, 0, 0, 0.5, 0.16, 0.5, SEC_DRONE.color);
      for (const [lx, lz] of [[0.36, 0.36], [-0.36, 0.36], [0.36, -0.36], [-0.36, -0.36]]) put(d.x, d.y, d.z, d.h + (d.state === 'falling' ? 0 : t * 30), lx, 0.1, lz, 0.38, 0.01, 0.06, '#8a8478');
      put(d.x, d.y, d.z, d.h, 0, -0.1, 0.22, 0.09, 0.07, 0.09, d.state === 'track' ? (Math.sin(t * 14) > 0 ? SEC_DRONE.eye : '#ffd25a') : d.state === 'jammed' ? '#5a5a52' : SEC_DRONE.eye);
      put(d.x, 0.04, d.z, d.h, 0, 0, 0, 0.6, 0.01, 0.6, '#151210');
    }
    this.dyn.count = n; this.dyn.instanceMatrix.needsUpdate = true; if (this.dyn.instanceColor) this.dyn.instanceColor.needsUpdate = true;
  }
  drawMinimap(c, px, pz, scale, R) {
    c.fillStyle = '#ff5a3a';
    for (const d of this.drones) {
      if (!d.live || d.state === 'gone') continue;
      const x = R + (d.x - px) * scale, y = R + (d.z - pz) * scale;
      if ((x - R) ** 2 + (y - R) ** 2 > (R - 16) ** 2) continue;
      c.fillRect(x - 2, y - 2, 4, 4);
    }
  }

  // ---- for agents ----------------------------------------------------------------------------------------------------------
  vView(v, full = false) {
    const o = { id: v.id, kind: v.kind, stakes: v.row.name, name: v.name, town: v.town, at: { x: r1(v.x), z: r1(v.z) }, d: Math.round(Math.hypot(v.x - this.g.player.x, v.z - this.g.player.z)), live: v.live,
      min: v.row.min, max: v.row.max, house: this.house(v), safe: v.safe.cash, safeState: v.safe.state, alarm: v.alarm, tables: v.tables.map((t) => ({ i: t.i, game: t.game, seat: { x: r1(t.seat.x), z: r1(t.seat.z) }, dealer: t.dealer.c?.id ?? null, opp: t.opp, purse: t.game === 'chess' ? t.purse : undefined })),
      guards: v.guards.map((q) => ({ role: q.role, id: q.c?.id ?? null, dead: q.dead || (q.c && !q.c.alive) })), cameras: v.cameras.length, drones: this.drones.filter((d) => d.owner === v).length, barred: (this.barred[v.id] ?? -1) > this.hours() };
    if (full) Object.assign(o, { stats: v.stats, robbery: v.robbery ?? null, carrying: v.carrying ? { amt: v.carrying.amt, by: v.carrying.by.id } : null, cage: v.cagePos && { x: r1(v.cagePos.x), z: r1(v.cagePos.z) }, safePos: v.safePos && { x: r1(v.safePos.x), z: r1(v.safePos.z) } });
    return o;
  }
  view() {
    const s = this.seat;
    return { venues: [...this.venues.values()].map((v) => this.vView(v)), homes: [...this.homes.values()].map((h) => ({ id: h.id, town: h.town, owner: h.owner, at: { x: r1(h.x), z: r1(h.z) }, alarm: h.alarm })),
      drones: this.drones.map((d) => ({ id: d.id, state: d.state, live: d.live, x: r1(d.x), z: r1(d.z), y: r1(d.y), hp: d.hp, home: !!d.owner.home })),
      seat: s ? { venue: s.v.id, table: s.t.i, game: s.game, ...(s.game === 'chess' ? this.chessView(s.t) : this.bjView(s.t)) } : null,
      runners: this.runners.map((r) => ({ id: r.c.id, stop: r.i, of: r.stops.length, venue: r.v.id })), counts: { ...this.counts }, events: this.events.slice(-8) };
  }
}
const t0 = (t) => !t.bj || t.bj.phase !== 'play';
const titled = (s) => String(s ?? '').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
