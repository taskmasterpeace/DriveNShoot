import * as THREE from 'three';
import { TRAVEL_RULES, NODES, LINES, EN_ROUTE } from '../data/travel.js';
import { NEEDS, SLEEP } from '../data/survival.js';
import { STREAM } from '../data/streaming.js';
import { VEHICLES } from './vehicles.js';
import { outfit } from './characters.js';
import { randomName } from '../data/npcs.js';
import { RAIL } from '../world/rail.js';
import { TravelPanel } from '../ui/travelpanel.js';
import { VATS, CLONE_KEEPS } from '../data/clones.js';
import { Journeys, hash as jhash, rngOf as jrng } from './journeys.js';
import { JOURNEY_RULES } from '../data/journeys.js';

// THE TRAVEL NETWORK (docs/design/WEB_CLONE_TRAVEL.md, rows in data/travel.js): how you get back to your husk.
//   - the TRUNDLE (bus) runs I-10 pole to pole on a timetable on the game clock. Near you it is a real vehicle on the road
//     (a driver and a guard aboard, ambushable, its driver killable); far from you it is a timetable. Buy a PUNCH
//     (ticket) at a pole, wait, board (C), ride in real time or sleep through it (N): the clock runs the whole trip and the
//     road rolls for what happened on the way.
//   - the IRON (the Iron Line freight, systems/train.js) stops at Dust Bowl Station and runs its loop through the yards.
//   - FIVE CITY AIR flies five cities, rarely and dear. Four are past the dust (off the map): you land in that city's
//     arrivals hall and wait there for a flight back onto the map.
//   - KNOTS (travel ports) are where the lines meet: Los Angeles (trundle + air), the Iron Crossing (trundle + iron),
//     El Paso.

const r1 = (v) => Math.round(v * 10) / 10;
const MILE = STREAM.mile;
const VB = TRAVEL_RULES;
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clock = (h) => { const d = Math.floor(h / 24), t = ((h % 24) + 24) % 24, hh = Math.floor(t), mm = Math.floor((t - hh) * 60); return { day: d, text: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` }; };

// The trundle: a long steel coach, as a vehicle row (its body is built in vehiclebodies.js busBody). Riders sit inside
// under the roof; the driver up front, the guard on the step with the shotgun.
const BUS_SEATS = [{ id: 'driver', side: 'left', row: 0, at: [0.62, 1.25, 4.3] }, { id: 'guard', side: 'right', row: 0, at: [-0.62, 1.25, 4.0] }];
for (let r = 0; r < 4; r++) for (const sd of [1, -1]) BUS_SEATS.push({ id: `row${r + 1}${sd > 0 ? 'L' : 'R'}`, side: sd > 0 ? 'left' : 'right', row: r + 1, at: [sd * 0.62, 1.25, 2.6 - r * 1.5] });
VEHICLES.bus ??= { name: 'TRUNDLE', base: 'bus', len: 11.2, wid: 2.6, tall: 3.2, maxSpeed: 27, accel: 8, turn: 1.15, grip: 6.4, mass: 5.2, hp: 700, armor: 0.12, fuelCap: 300, springs: 'rig', seats: BUS_SEATS };

export class Travel {
  constructor(game) {
    this.g = game;
    this.punches = [];    // { id, line, from, to, dir, fare, bought, flight }
    this.ride = null;     // { punch, line, kind, vid, from, at (hours), meters }
    this.away = null;     // { node, since, why } held in an off-map arrivals hall
    this.bus = null;      // the one real trundle: { vid, crew, line, dir, next, state, dwellT, k, aboardSeen }
    this.log = [];        // the last trips
    this.nPunch = 0;
    this.nodesR = null;
    this.tables = new Map();
    this.ui = typeof document !== 'undefined' ? new TravelPanel(game, document.getElementById('ui')) : new TravelPanel(game, null);
    this.realT = 0;
    this.eventT = 0;
    this.lastCard = null;
    this.j = new Journeys(game, this); // incidents, the planner, the hitch (systems/journeys.js, WEB_INSURANCE_JOURNEYS.md)
  }

  get W() { return this.g.streamer?.W ?? null; }
  get ts() { return this.g.sky?.timeScale ?? 1 / 30; }
  hours() { return (this.g.society?.day ?? 0) * 24 + (this.g.sky?.time ?? 0); }
  line(id) { return LINES.find((l) => l.id === id) ?? null; }
  linesAt(nodeId) { return LINES.filter((l) => (l.stops ?? l.fields ?? []).includes(nodeId)); }

  // ---- nodes: where every stop is, in whatever the world knows -------------------------------------------------------
  nodes() {
    if (this.nodesR) return this.nodesR;
    const W = this.W;
    if (!W) return {};
    const out = {};
    for (const [id, row] of Object.entries(NODES)) {
      const n = { id, ...row, onMap: false, road: false };
      let x, z, s = null;
      const at = row.at, R = this.roadById(at?.road ?? row.roadId ?? 'I-10');
      if (!R) { out[id] = n; continue; } // a road the world has not built (a region not laid out): off the map
      n.cor = R;
      if (at?.s !== undefined) s = at.s;
      else if (at?.exit) { const X = (R === W ? W.exits : R.exits).find((e) => e.name === at.exit) ?? null; if (X) s = X.s; else { const L = W.locate(at.exit); if (L?.built) s = R.project(L.x, L.z, 4096).s; } }
      else if (at?.town) { const L = W.locate(at.town); if (L?.built) { const pr = R.project(L.x, L.z, 4096); if (pr.d < 1500) s = Math.min(pr.s, this.roadLen(R) - 120); else { x = L.x; z = L.z; } } }
      else if (at && at.x !== undefined) { x = at.x; z = at.z; const pr = R.project(x, z, 600); if (pr.d < 30 && !row.rail) s = pr.s; }
      else if (row.town) { const L = W.locate(row.town); if (L?.built && this.inWorld(L.x, L.z)) { x = L.x; z = L.z; } }
      if (s !== null) { const f = R.at(s); x = f.x; z = f.z; n.s = s; n.road = true; }
      if (x !== undefined && this.inWorld(x, z)) {
        n.onMap = true; n.x = x; n.z = z;
        if (n.road) {
          n.poles = { 1: this.poleAt(s, 1, 0, R), [-1]: this.poleAt(s, -1, 0, R) };
          const side = row.side ?? 1, off = row.off ?? 0;
          n.counter = off ? this.poleAt(s, side, off, R) : n.poles[side];
        } else n.counter = { x, z, h: 0 };
      }
      out[id] = n;
    }
    // A field that shares a knot's spot stands off the road on the far side (Los Angeles: the trundle's pole and the field).
    for (const n of Object.values(out)) if (n.air && n.road && n.counter) { const c = this.poleAt(n.s, n.side ?? -1, 26, n.cor); n.counter = c; }
    return (this.nodesR = out);
  }
  node(id) { return this.nodes()[id] ?? null; }
  // The road a line or a node runs on: I-10 is the world index itself, a region's interstate one of W.corridors.
  roadById(id) { const W = this.W; return !id || id === 'I-10' ? W : W.corridors?.find((c) => c.id === id) ?? null; }
  roadOf(L) { return this.roadById(L?.road); }
  roadLen(R) { return R === this.W ? this.W.cl.L : R.L; }
  // On the map: inside P1's dust-wall circle or a region's box, well clear of its edge.
  inWorld(x, z) { const W = this.W; return W.inWorld ? W.inWorld(x, z, -1500) : Math.hypot(x, z) < STREAM.dustWall - 1500; }
  poleAt(s, dir, extra = 0, R = this.W) {
    const W = R, f = W.at(s), sec = W.section(s), u = dir * (sec.out + VB.poleOffset + extra);
    return { x: f.x + f.nx * u, z: f.z + f.nz * u, h: Math.atan2(-f.nx * dir, -f.nz * dir), dir };
  }
  // The stop point on the outer lane, in the direction of travel.
  stopPoint(s, dir, R = this.W) {
    const W = R, f = W.at(s), sec = W.section(s), lw = (sec.lane2 - sec.lane0) / 2, u = dir * (sec.lane0 + lw * 1.5);
    return { x: f.x + f.nx * u, z: f.z + f.nz * u, h: Math.atan2(f.tx * dir, f.tz * dir) };
  }
  nodeName(id) { return NODES[id]?.short ?? id; }
  // EAST > / < WEST on I-10, NORTH > / < SOUTH on a road that runs south to north (a line row's dirs).
  dirLabel(lineId, dir) { const d = this.line(lineId)?.dirs ?? ['EAST', 'WEST']; return dir > 0 ? `${d[0]} ▸ ` : `◂ ${d[1]} `; }

  // ---- timetables -----------------------------------------------------------------------------------------------------
  // The trundle: hours from each end's departure to each stop (the road at cruise, plus a dwell at every pole before).
  table(L) {
    let t = this.tables.get(L.id);
    if (t) return t;
    const ts = this.ts, st = L.stops.map((id) => this.node(id));
    if (st.some((n) => !n?.road)) return null;
    const s0 = st[0].s, sN = st[st.length - 1].s, dw = L.dwell * ts, n = st.length;
    t = st.map((nd, i) => ({ id: nd.id, s: nd.s, offE: (nd.s - s0) / L.speed * ts + i * dw, offW: (sN - nd.s) / L.speed * ts + (n - 1 - i) * dw }));
    this.tables.set(L.id, t);
    return t;
  }
  // The next trundle due at stop i going dir (+1 east / -1 west), at or after `now`: { k, at, dep } in absolute game hours.
  nextBus(L, i, dir, now = this.hours()) {
    const T = this.table(L)?.[i];
    if (!T) return null;
    const off = dir > 0 ? T.offE : T.offW;
    const k = Math.ceil((now - off - L.first) / L.every - 1e-9);
    const at = L.first + k * L.every + off;
    return { k, at, dep: at - off, inHours: at - now };
  }
  busHours(L, i, j, dir) { const T = this.table(L); return Math.abs((dir > 0 ? T[j].offE - T[i].offE : T[j].offW - T[i].offW)); }
  milesBetween(L, a, b) {
    if (L.kind === 'bus') { const A = this.node(a), B = this.node(b); return Math.abs(B.s - A.s) / MILE; }
    if (L.kind === 'rail') return this.ironMeters(a, b) / MILE;
    return 0;
  }
  fare(L, a, b, flight = null) {
    if (L.kind === 'air' || L.kind === 'haul') return flight?.fare ?? 0;
    return Math.round(L.fare.base + L.fare.perMile * this.milesBetween(L, a, b));
  }
  // The iron runs south (+z) down the line and loops back in from the north off the map.
  ironMeters(a, b) {
    const za = NODES[a].at.z, zb = NODES[b].at.z;
    return zb >= za ? zb - za : (1000 - za) + (zb + 1000);
  }
  ironHours(L, a, b) {
    const za = NODES[a].at.z, zb = NODES[b].at.z;
    return (this.ironMeters(a, b) / L.speed) * this.ts + (zb < za ? L.loopHours : 0);
  }
  // When the freight is next at a station or halt (game hours from now), from the train's own state.
  ironEta(nodeId) {
    const T = this.g.train, ts = this.ts, z = NODES[nodeId].at.z, cycle = this.ironCycleH();
    if (!T) return cycle;
    const head = T.state === 'away' ? RAIL.z0 - 10 - T.away * 17 : T.head;
    let d = (z - head) / 17 * ts;
    if (nodeId === 'dustbowl' && T.state === 'dwell') return 0;
    if (nodeId === 'dustbowl' && (T.state === 'leaving' || T.state === 'running2')) d = ((RAIL.z1 + T.length + 20 - T.head) / 17 + 25 + (STATION_Z - RAIL.z0 + 10) / 17 + 4) * ts;
    while (d < 0) d += cycle;
    return d;
  }
  ironCycleH() { const T = this.g.train; return ((RAIL.z1 - RAIL.z0 + 30 + (T?.length ?? 70)) / 17 + 25 + 14 + 8) * this.ts; }
  // The next departure of a flight row at or after now.
  nextFlight(f, now = this.hours()) {
    for (let d = Math.floor(now / 24); d < Math.floor(now / 24) + 3 * f.everyDays + 2; d++) if (d % f.everyDays === 0 && d * 24 + f.dep >= now - 1e-6) return d * 24 + f.dep;
    return null;
  }
  flightsFrom(nodeId, lineId = 'air') { const A = this.line(lineId); return (A.flights ?? A.routes).map((f, i) => ({ ...f, i })).filter((f) => f.from === nodeId); }
  // A flight or a long-haul run: the line's rows (both are timetabled legs past the dust).
  legRows(L) { return L.flights ?? L.routes ?? []; }

  // ---- punches (tickets) ------------------------------------------------------------------------------------------------
  // Buy a punch at the pole / station / field you stand at (or `from` with force, for agents staging). Returns the punch.
  buy(lineId, to, { from = null, force = false, flight = null } = {}) {
    const g = this.g, L = this.line(lineId);
    if (!L) return { ok: false, why: `no line ${lineId}; lines: ${LINES.map((l) => l.id).join(', ')}` };
    const here = this.away?.node ?? this.nodeHere()?.id;
    from = from ?? here;
    if (!from) return { ok: false, why: 'not at a pole, a station, a field or a knot (stand by its board and ticket box)' };
    if (!force && from !== here) return { ok: false, why: `you are not at ${this.nodeName(from)}` };
    const stops = L.stops ?? L.fields;
    if (!stops.includes(from)) return { ok: false, why: `${L.name} does not stop at ${this.nodeName(from)}` };
    let fl = null, dir = 0;
    if (L.kind === 'air' || L.kind === 'haul') {
      const R = this.legRows(L);
      fl = flight !== null ? R[flight] : R.find((f) => f.from === from && f.to === to);
      if (!fl || fl.from !== from) return { ok: false, why: `no ${L.name} run from ${this.nodeName(from)} to ${this.nodeName(to)}; from here: ${this.flightsFrom(from, L.id).map((f) => this.nodeName(f.to)).join(', ') || 'none'}` };
      to = fl.to;
    } else {
      if (!stops.includes(to) || to === from) return { ok: false, why: `${L.name} from ${this.nodeName(from)} goes to: ${stops.filter((x) => x !== from).join(', ')}` };
      dir = L.kind === 'bus' ? Math.sign(stops.indexOf(to) - stops.indexOf(from)) : 1;
    }
    if (this.punches.length >= VB.punchMax) return { ok: false, why: `you hold ${VB.punchMax} punches already` };
    const fare = this.fare(L, from, to, fl);
    if (!g.spend(fare)) return { ok: false, why: `the fare is $${fare}; you have $${g.cash}` };
    const p = { id: `P${++this.nPunch}`, line: L.id, from, to, dir, fare, bought: +this.hours().toFixed(2), flight: fl ? this.legRows(L).indexOf(fl) : null };
    this.punches.push(p);
    g.emit('punchBought', { ...p });
    g.hud?.toast?.(`${L.kind === 'air' ? 'SKY TICKET' : 'PUNCH'} · ${L.name} · ${this.nodeName(from)} TO ${this.nodeName(to)} · $${fare}`, 'job');
    return { ok: true, punch: { ...p } };
  }
  punchFor(lineId, from, dir = null) { return this.punches.find((p) => p.line === lineId && (from === null || p.from === from) && (dir === null || p.dir === dir)) ?? null; }
  usePunch(p) { const i = this.punches.indexOf(p); if (i >= 0) this.punches.splice(i, 1); }

  // ---- where you stand ---------------------------------------------------------------------------------------------------
  // The node whose board you stand at (within boardR of its counter or either pole).
  nodeHere(x = this.g.player.x, z = this.g.player.z, reach = VB.boardR) {
    let best = null, bd = reach;
    for (const n of Object.values(this.nodes())) {
      if (!n.onMap) continue;
      for (const q of [n.counter, n.poles?.[1], n.poles?.[-1]]) { if (!q) continue; const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; best = n; } }
    }
    return best;
  }
  // For main.js's E: a board to read (a pole, a station, a field) or a vat counter, within a few metres.
  spotNear(p) {
    if (p.inVehicle || !p.alive) return null;
    const v = this.g.clone?.vatHere(2.2);
    if (v && !this.away) return { kind: 'vat', id: v.id, label: `<kbd>E</kbd> The brine room · ${v.name}` };
    const n = this.nodeHere(p.x, p.z, 4.5);
    if (n) return { kind: 'board', id: n.id, label: `<kbd>E</kbd> Read the board · ${n.name}` };
    return null;
  }
  interact(spot) {
    if (spot.kind === 'vat') return this.openVat();
    return this.openBoard(spot.id);
  }

  // ---- the boards (the panel) --------------------------------------------------------------------------------------------
  boardRows(nodeId) {
    const rows = [], now = this.hours();
    for (const L of this.linesAt(nodeId)) {
      if (L.kind === 'bus') {
        const st = L.stops, i = st.indexOf(nodeId);
        for (const dir of [1, -1]) for (let j = i + dir; j >= 0 && j < st.length; j += dir) {
          const nb = this.nextBus(L, i, dir, now);
          if (!nb) continue;
          rows.push({ line: L.id, kind: L.kind, to: st[j], dir, dep: nb.at, arr: nb.at + this.busHours(L, i, j, dir), fare: this.fare(L, nodeId, st[j]), miles: r1(this.milesBetween(L, nodeId, st[j])) });
        }
      } else if (L.kind === 'rail') {
        for (const to of L.stops) if (to !== nodeId) { const eta = this.ironEta(nodeId); rows.push({ line: L.id, kind: L.kind, to, dir: 1, dep: now + eta, arr: now + eta + this.ironHours(L, nodeId, to), fare: this.fare(L, nodeId, to), miles: r1(this.milesBetween(L, nodeId, to)) }); }
      } else if (L.kind === 'air' || L.kind === 'haul') {
        for (const f of this.flightsFrom(nodeId, L.id)) { const d = this.nextFlight(f, now); rows.push({ line: L.id, kind: L.kind, to: f.to, flight: f.i, dep: d, arr: d + f.hours, fare: f.fare, hours: f.hours, offMap: !this.node(f.to)?.onMap }); }
      }
    }
    return rows;
  }
  openBoard(nodeId) {
    const n = this.node(nodeId), ui = this.ui;
    const build = () => {
      const rows = this.boardRows(nodeId), now = this.hours();
      const fmt = (h) => { const c = clock(h), d0 = Math.floor(now / 24); return c.day === d0 ? c.text : c.day === d0 + 1 ? `TMRW ${c.text}` : `DAY ${c.day} ${c.text}`; };
      const shown = rows.slice(0, 9);
      const lines = [...new Set(rows.map((r) => this.line(r.line).name))].join(' · ');
      return {
        kind: n.knot ? 'TRAVEL KNOT' : n.air ? 'FIVE CITY AIR' : n.rail ? 'THE IRON LINE' : n.haul ? 'THE LONG HAUL' : 'THE TRUNDLE',
        title: n.name, sub: `${lines} · NOW ${fmt(now)}`,
        note: this.away ? null : [this.punches.length ? `YOUR PUNCHES: ${this.punches.map((p) => `${this.line(p.line).name} TO ${this.nodeName(p.to)}`).join(' · ')}` : null, this.homeNote()].filter(Boolean).join(' · ') || null,
        head: ['TO', 'LEAVES', 'ARRIVES', 'FARE'],
        rows: shown.map((r, k) => ({ key: String(k + 1), cols: [`${r.kind === 'bus' ? this.dirLabel(r.line, r.dir) : r.kind === 'air' ? '✈ ' : r.kind === 'haul' ? 'LONG HAUL ▸ ' : '▸ '}${this.nodeName(r.to)}${r.offMap ? ' (PAST THE DUST)' : ''}`, fmt(r.dep), fmt(r.arr), `$${r.fare}`],
          mark: this.punches.some((p) => p.line === r.line && p.from === nodeId && p.to === r.to) ? 'PUNCHED' : '', hot: this.punches.some((p) => p.line === r.line && p.from === nodeId && p.to === r.to) })),
        foot: [['1-9', 'Buy a punch'], ['N', 'Sleep through the trip (the clock runs)'], ['ESC', 'Wait here in real time']],
        onKey: (code) => {
          const k = /^Digit([1-9])$/.exec(code)?.[1];
          if (k) { const r = shown[+k - 1]; if (r) this.buy(r.line, r.to, { flight: r.flight ?? null }); return true; }
          if (code === 'KeyN') { const p = this.punches.find((q) => q.from === nodeId); if (!p) { this.g.hud?.toast?.('BUY A PUNCH FIRST', 'warn'); return true; } this.ui.close(); this.skip({ punch: p.id }); return 'close'; }
          return false;
        },
      };
    };
    ui.show({ ...build(), build });
    return { ok: true, board: nodeId, rows: this.boardRows(nodeId).length };
  }
  // vatId: opened by the vat's keeper (Doc Reyes takes you through to her back room from her counter).
  openVat(vatId = null) {
    const C = this.g.clone, ui = this.ui, force = !!vatId;
    const build = () => {
      const row = vatId ? C.vat(vatId) : C.vatHere(4), P = C.pressingView(), price = C.price(row);
      return {
        kind: 'THE BRINE ROOM', title: row?.name ?? 'THE BRINE ROOM', showBank: true,
        sub: P ? `PRESSED AT ${VATS.find((v) => v.id === P.vat)?.short} · ${r1(P.staleHours)} H AGO · BRINE MONEY $${C.due()}/DAY${C.owed ? ` · ${C.owed} DAY(S) OWED` : ''}` : 'NO PRESSING IN THE BRINE: DIE NOW AND YOU DIE FLAT',
        note: `A RERUN KEEPS: ${CLONE_KEEPS.keeps.slice(0, 3).join(', ')}. IT LOSES: ${CLONE_KEEPS.loses.slice(0, 3).join(', ')}.`,
        head: ['', 'WHAT', 'COST'],
        rows: [
          { key: '1', cols: ['GET PRESSED', `A scan in the chair (an hour). Skills as they are now${P ? '; replaces the one you hold' : ''}`, `$${price}`], hot: !P },
          { key: '2', cols: ['BRINE BOOK: PUT IN $100', 'Scrip in the book outlives you; brine money comes out of it', '$100'] },
          { key: '3', cols: ['BRINE BOOK: TAKE OUT $100', '', '+$100'] },
        ],
        foot: [['1', 'Press'], ['2', 'Deposit'], ['3', 'Withdraw'], ['ESC', 'Leave']],
        onKey: (code) => {
          let r = null;
          if (code === 'Digit1') r = C.press(row?.id ?? null, { force });
          else if (code === 'Digit2') r = C.deposit(100, { force });
          else if (code === 'Digit3') r = C.withdraw(100, { force });
          else return false;
          if (r && !r.ok) this.g.hud?.toast?.(r.why.toUpperCase(), 'warn');
          return true;
        },
      };
    };
    ui.show({ ...build(), build });
    return { ok: true };
  }

  // ---- the off-map arrivals hall ----------------------------------------------------------------------------------------
  hold(nodeId, { why = 'arrived', vat = null } = {}) {
    const g = this.g, p = g.player;
    this.away = { node: nodeId, since: +this.hours().toFixed(2), why, vat };
    p.graceT = 1e6; p.speed = 0;
    if (p.inVehicle) g.exitVehicle(true);
    g.emit('heldOffMap', { node: nodeId, why });
    this.openHall();
    return this.away;
  }
  openHall() {
    const A = this.away;
    if (!A) return;
    const n = NODES[A.node], C = this.g.clone, ui = this.ui;
    const build = () => {
      const rows = A.node ? this.boardRows(A.node) : [], now = this.hours(), fmt = (h) => { const c = clock(h); return `DAY ${c.day} ${c.text}`; };
      const vat = VATS.find((v) => v.port === A.node);
      return {
        hall: true, showBank: true, kind: 'ARRIVALS HALL · PAST THE DUST', title: n?.name ?? 'SOMEWHERE OFF THE MAP',
        sub: `${n?.short ?? ''} · NOW ${fmt(now)} · THIS CITY IS NOT ON THE MAP YET: BUY YOUR WAY BACK`,
        note: A.why === 'wake' ? 'YOU CAME UP IN THIS CITY\'S BRINE. YOUR HUSK IS A LONG WAY WEST.' : null,
        head: ['FLIGHT OR COACH', 'LEAVES', 'ARRIVES', 'FARE'],
        rows: [...rows.map((r, k) => ({ key: String(k + 1), cols: [`${r.kind === 'haul' ? 'LONG HAUL ▸ ' : '✈ '}${this.nodeName(r.to)}${r.offMap ? ' (PAST THE DUST)' : ''}`, fmt(r.dep), fmt(r.arr), `$${r.fare}`] })),
          ...(vat ? [{ key: 'P', cols: [`GET PRESSED · ${vat.name}`, '', '', `$${C.price(vat)}`] }] : [])],
        foot: [['1-9', 'Buy the ticket and go'], ...(vat ? [['P', 'Press here']] : [])],
        onKey: (code) => {
          const k = /^Digit([1-9])$/.exec(code)?.[1];
          if (k) { const r = rows[+k - 1]; if (!r) return false; const b = this.buy(r.line, r.to, { flight: r.flight }); if (!b.ok) { this.g.hud?.toast?.(b.why.toUpperCase(), 'warn'); return true; } this.skip({ punch: b.punch.id }); return this.away ? true : 'close'; }
          if (code === 'KeyP' && vat) { const r = C.press(vat.id); if (!r.ok) this.g.hud?.toast?.(r.why.toUpperCase(), 'warn'); return true; }
          return false;
        },
      };
    };
    ui.show({ ...build(), build });
  }
  leaveHall() {
    const g = this.g, p = g.player;
    if (!this.away) return;
    this.away = null;
    p.graceT = 0;
    if (this.ui.model?.hall) this.ui.close();
  }

  // ---- the clock ------------------------------------------------------------------------------------------------------
  // Run the game clock forward h hours (a nap through a trip, an hour in the brine-room chair): the day turns and the
  // world's off-screen ticks run (society), the needs drain as if dozing in a seat (never below the floor), the husks'
  // pickers get their hours.
  advanceHours(h, why = 'travel') {
    const g = this.g, S = g.sky, N = g.needs;
    if (!(h > 0)) return 0;
    let left = h;
    while (left > 1e-6) { const step = Math.min(1, left); S.time += step; if (S.time >= 24) S.time -= 24; g.society?.update(0); left -= step; }
    if (N) {
      const F = VB.napFloor;
      for (const k of ['water', 'food']) { const drop = NEEDS[k].drainPerHour * SLEEP.drain * h; if (N[k] > F[k]) N[k] = Math.max(F[k], N[k] - drop); }
      N.rest = Math.min(1, N.rest + SLEEP.perHour * 0.6 * h);
    }
    g.clone?.pickTo(this.hours());
    g.emit('clockSkip', { hours: r1(h), why });
    return h;
  }

  // ---- what the road turns up ---------------------------------------------------------------------------------------------
  // One roll for a trip (seeded). The trundle and the long haul roll an INCIDENT (systems/journeys.js: the stretch's danger,
  // who holds it, the hour, the weather; ctx from j.ctxFor), returned flat (what its default choice does) with the incident
  // on it; the iron and the air roll the old EN_ROUTE rows. { id, text, ...amounts } or null.
  roll(L, miles, depHour, seed, ctx = null) {
    if (L.kind === 'bus' || L.kind === 'haul') return this.j.flat(this.j.roll(ctx ?? this.j.ctxFor(L, null, null, depHour, { miles }), seed));
    const rng = rngOf(seed);
    const hh = ((depHour % 24) + 24) % 24, night = hh >= 20 || hh < 5;
    let p = L.kind === 'air' ? L.risk.perFlight : 1 - (1 - L.risk.perMile) ** miles;
    if (night && L.risk.night) p *= L.risk.night;
    p = Math.min(0.9, p);
    const pick = rng();
    if (pick >= p) return null;
    const pool = EN_ROUTE.filter((e) => e.kinds.includes(L.kind));
    let w = rng() * pool.reduce((a, e) => a + e.weight, 0), ev = pool[0];
    for (const e of pool) { if ((w -= e.weight) < 0) { ev = e; break; } }
    const r = (a) => a[0] + rng() * (a[1] - a[0]);
    return { id: ev.id, text: ev.text, p: r1(p * 100) / 100, delay: ev.delay ? r1(r(ev.delay)) : 0, hurt: ev.hurt ? Math.round(r(ev.hurt)) : 0, cashShare: ev.cashShare ?? 0, toll: ev.toll ? Math.round(r(ev.toll)) : 0 };
  }

  // ---- sleeping through a trip (the skip) ------------------------------------------------------------------------------
  // punch: which (default: one from where you stand, or the one you ride on). The clock runs the wait and the trip, the road
  // rolls once, and you step off at the far end (or into its arrivals hall). seed: the roll's seed (agents, tests). choice:
  // what you do if the road turns something up (an incident's choice id; else the card asks you, or an agent gets the first).
  skip({ punch = null, seed = null, force = false, choice = null } = {}) {
    const g = this.g, p = g.player, now = this.hours();
    if (this.j.pending) return { ok: false, why: 'something on the road is waiting for you to choose (travel action=incident choose=)' };
    const aboard = this.ride && this.bus && p.inVehicle && p.inVehicle.id === this.bus.vid ? this.ride : null;
    let P = punch ? this.punches.find((q) => q.id === punch) ?? (aboard?.punch?.id === punch ? aboard.punch : null) : aboard?.punch ?? null;
    const here = this.away?.node ?? this.nodeHere()?.id ?? null;
    if (!P) P = this.punches.find((q) => q.from === here) ?? null;
    if (!P) return { ok: false, why: here ? `no punch from ${this.nodeName(here)}: buy one at its board` : 'not at a pole, station or field, and not riding' };
    const L = this.line(P.line);
    if (!aboard && !force && P.from !== here) return { ok: false, why: `that punch starts at ${this.nodeName(P.from)}; you are ${here ? `at ${this.nodeName(here)}` : 'not at a board'}` };
    let waitH = 0, rideH = 0, miles = 0, leg = null, s0 = null;
    const from = P.from;
    if (L.kind === 'bus') {
      const st = L.stops, i = st.indexOf(P.from), j = st.indexOf(P.to);
      if (aboard) {
        const v = p.inVehicle, s = this.roadOf(L).project(v.x, v.z, 600).s, sj = this.node(P.to).s;
        s0 = s;
        miles = Math.abs(sj - s) / MILE;
        const left = Math.max(0, (sj - s) * P.dir);
        let stops = 0; for (let k = i + P.dir; k !== j && k >= 0 && k < st.length; k += P.dir) if ((this.node(st[k]).s - s) * P.dir > 0) stops++;
        rideH = left / L.speed * this.ts + stops * L.dwell * this.ts;
      } else {
        const nb = this.nextBus(L, i, P.dir, now);
        waitH = Math.max(0, nb.at - now);
        rideH = this.busHours(L, i, j, P.dir);
        miles = this.milesBetween(L, P.from, P.to);
        s0 = this.node(P.from).s;
      }
    } else if (L.kind === 'rail') {
      waitH = aboard ? 0 : this.ironEta(P.from);
      rideH = this.ironHours(L, P.from, P.to);
      miles = this.milesBetween(L, P.from, P.to);
    } else {
      leg = this.legRows(L)[P.flight];
      const d = this.nextFlight(leg, now);
      waitH = Math.max(0, d - now); rideH = leg.hours; miles = leg.miles ?? 0;
    }
    const sd = seed ?? hash(`${P.id}:${Math.floor(now * 60)}`);
    const incidental = L.kind === 'bus' || L.kind === 'haul';
    const inc = incidental ? this.j.roll(this.j.ctxFor(L, P.from, P.to, now + waitH, { miles, danger: leg?.danger, routeMiles: leg?.miles }), sd) : null;
    const ev = incidental ? null : this.roll(L, miles, now + waitH, sd);
    if (aboard) this.endRide('slept');
    this.usePunch(P);
    if (this.bus && !this.bus.keep) this.despawnBus();
    const T0 = { P, L, from, waitH, rideH, miles, sd, ev, inc, now, s0, leg, ranH: 0 };
    if (!inc) return this.finishSkip(T0, null);
    // The road turned something up: the clock runs to it, the card asks (an agent's choice=, or the default), then the rest.
    const toInc = waitH + inc.at * rideH;
    this.advanceHours(toInc, `${L.id}:${P.from}->${P.to}:to-incident`);
    T0.ranH = toInc;
    if (choice) this.j.agentChoice = choice;
    let out = null;
    const asked = this.j.ask(inc, (res) => { out = this.finishSkip(T0, res); }, { where: `${this.nodeName(P.from)} TO ${this.nodeName(P.to)}` });
    this.j.agentChoice = null;
    if (asked?.pending) return { ok: true, pending: true, incident: inc };
    return out;
  }
  // The rest of a slept trip once the incident (if any) is settled: the clock, the consequences, the step off.
  finishSkip(T0, res) {
    const g = this.g, p = g.player, { P, L, from, waitH, miles, sd, inc } = T0;
    let rideH = T0.rideH, ev = T0.ev;
    let to = P.to, cashLost = 0, hurt = 0, toll = 0, roadside = null;
    if (ev) {
      rideH += ev.delay;
      if (ev.cashShare) { cashLost = Math.floor(g.cash * ev.cashShare); g.cash -= cashLost; }
      if (ev.hurt) hurt = ev.hurt;
    }
    if (res) {
      ev = { ...this.j.flat(inc, res.choice), delay: res.delay, hurt: res.hurt, putOff: res.putOff };
      cashLost = Math.max(0, res.cashLost); toll = res.paid; hurt = res.hurt;
      if (res.putOff) {
        if (L.kind === 'bus' && T0.s0 !== null && this.node(P.to)?.onMap) {
          // Left at the roadside where it happened: the walk is yours.
          const RD = this.roadOf(L), sTo = this.node(P.to).s, s = T0.s0 + (sTo - T0.s0) * inc.at, q = this.stopPoint(s, P.dir, RD), f = RD.at(s), u = P.dir * JOURNEY_RULES.cord.side;
          roadside = { x: q.x + f.nx * u, z: q.z + f.nz * u };
          to = null;
        } else rideH += (1 - inc.at) * rideH * 2 + res.delay; // a long haul's walk: the rest of the way on foot, three times as long
      } else rideH += res.delay;
    }
    const total = waitH + rideH;
    if (roadside) this.advanceHours(Math.max(0, res?.delay ?? 0), `${L.id}:roadside`);
    else this.advanceHours(Math.max(0, total - T0.ranH), `${L.id}:${P.from}->${to}`);
    if (hurt && !res) { p.hp = Math.max(Math.min(p.hp, 10), p.hp - hurt); g.hud?.shake?.(0.6); }
    const arrived = roadside ? this.arriveAt(roadside) : this.arrive(to, L, { dir: P.dir || 1 });
    const hours = roadside ? r1(T0.ranH + (res?.delay ?? 0)) : r1(total);
    const trip = { line: L.id, from, to: to ?? 'roadside', wanted: P.to, kind: L.kind, waitHours: r1(waitH), rideHours: r1(rideH), hours, miles: r1(miles), fare: P.fare, event: ev, choice: res?.choice ?? null, cashLost, toll, hurt, seed: sd, onMap: arrived.onMap, at: +this.hours().toFixed(2), roadside: roadside ? { x: r1(roadside.x), z: r1(roadside.z) } : null, lost: res?.lost ?? [], seized: res?.seized ?? [] };
    this.log.push(trip); if (this.log.length > 20) this.log.shift();
    g.emit('arrived', { ...trip, event: ev?.id ?? null });
    const c = clock(this.hours());
    this.card('arrive', { name: roadside ? `THE ROADSIDE · ${this.g.clone?.placeName?.(roadside.x, roadside.z) ?? ''}` : NODES[to]?.name, line: L.name, hours, when: `DAY ${c.day} ${c.text}`, event: ev, cashLost, toll, hurt });
    return { ok: true, trip };
  }
  // Set down at a point (the roadside: a cord, an incident's walk).
  arriveAt(q) {
    const g = this.g, p = g.player;
    if (this.away) this.leaveHall();
    if (p.inVehicle) g.exitVehicle(true);
    const t = { x: q.x, z: q.z };
    g.streamer?.ensureHot(t.x, t.z, 'load');
    g.statics.resolveCircle(t, 0.5);
    p.x = t.x; p.z = t.z; p.gy = 0; p.storey = null; g.standOn?.(p);
    g.camLook.x = p.x; g.camLook.z = p.z;
    return { onMap: true, x: r1(p.x), z: r1(p.z) };
  }
  // The board's note: the pole nearest your base and the walk from it (the planner's answer, in one line).
  homeNote() {
    const base = this.g.clone?.ins?.baseXZ?.(), np = base && this.j.nearestPole(base);
    return np ? `NEAREST POLE TO YOUR BASE: ${np.name} · ${np.km} KM WALK` : null;
  }

  // Step off at a node: its pole (the side you were travelling on), its counter, or its arrivals hall off the map.
  arrive(nodeId, L, { dir = 1 } = {}) {
    const g = this.g, p = g.player, n = this.node(nodeId);
    if (!n?.onMap) { this.hold(nodeId, { why: 'arrived' }); return { onMap: false }; }
    if (this.away) this.leaveHall();
    if (p.inVehicle) g.exitVehicle(true);
    if (p.onTrain) { p.onTrain = null; p.seatPose = null; }
    const at = n.road && L?.kind === 'bus' ? n.poles[dir] ?? n.counter : n.counter;
    const t = { x: at.x + (n.road ? 0 : 1.2), z: at.z + (n.road ? 0 : 1.2) };
    g.statics.resolveCircle(t, 0.5);
    p.x = t.x; p.z = t.z; p.gy = 0; p.storey = null; g.standOn?.(p);
    g.camLook.x = p.x; g.camLook.z = p.z;
    g.streamer?.ensureHot(p.x, p.z, 'load');
    return { onMap: true, x: r1(p.x), z: r1(p.z) };
  }

  card(kind, d = {}) {
    let title, lines;
    if (kind === 'cloneWake') { title = 'YOU CAME UP IN THE BRINE'; lines = [d.where, d.husk ? `YOUR HUSK LIES ${d.husk}` : null, d.stale < 1 ? "THE PRESSING WAS FRESH" : `THE PRESSING WAS ${d.stale} H COLD`]; }
    else if (kind === 'flat') { title = 'YOU DIED FLAT'; lines = [`NO PRESSING IN THE BRINE: ${d.name} IS OVER`, d.fresh ? `A NEW DRIFTER WALKS IN FROM THE FLATS: ${d.fresh}` : 'THIS CHARACTER IS GONE FROM THE SHARD']; }
    else {
      title = `ARRIVED · ${d.name}`;
      lines = [`${d.line} · ${d.hours} H ON THE CLOCK · ${d.when}`, d.event ? `${d.event.text}${d.event.choice ? ` (${d.event.choice.toUpperCase()})` : ''}${d.cashLost ? ` · -$${d.cashLost}` : ''}${d.toll ? ` · TOLL $${d.toll}` : ''}${d.hurt ? ` · -${d.hurt} HP` : ''}${d.event.delay ? ` · +${d.event.delay} H` : ''}${d.event.putOff ? ' · PUT OFF SHORT' : ''}` : 'A QUIET RIDE'];
    }
    this.lastCard = { kind, title, lines };
    this.ui.card(kind, title, lines, kind === 'flat' ? 7 : 5);
  }

  // ---- the real trundle ----------------------------------------------------------------------------------------------
  // Spawn the trundle for line L going dir, due at stop i: up the road out of sight (or dwelling at its first pole).
  spawnBus(L, i, dir, { atStop = false, k = null } = {}) {
    const g = this.g, st = this.table(L);
    if (!st) return null;
    const first = dir > 0 ? 0 : st.length - 1;
    let s = st[i].s - dir * VB.busSpawnAhead, next = i;
    if (atStop || i === first) { s = st[i].s; atStop = true; }
    const RD = this.roadOf(L);
    s = Math.max(30, Math.min(this.roadLen(RD) - 30, s));
    if (!atStop) { next = i; for (let q = first; q !== i; q += dir) if ((st[q].s - s) * dir > 2) { next = q; break; } }
    const q = this.stopPoint(s, dir, RD);
    const v = g.vehiclesSys.spawn('bus', q.x, q.z, q.h, L.vehicle.paint, { ai: 'bus' });
    v.trundle = L.id;
    if (!atStop) { v.vx = Math.sin(q.h) * L.speed * 0.85; v.vz = Math.cos(q.h) * L.speed * 0.85; }
    const crew = [];
    for (const c of L.crew) {
      const ch = g.addChar({ x: q.x, z: q.z, faction: 'drifter', weapon: c.weapon, name: `${randomName()}`, flag: g.randomFlag ? g.randomFlag(Math.random) : 'US', colors: outfit('drifter') });
      if (!ch) continue;
      ch.trundle = c.role; ch.hold = true;
      g.seats.board(ch, v, c.seat);
      crew.push(ch.id);
    }
    // Passengers: people with names, flags and factions in the coach's rows (systems/journeys.js), seeded by the run.
    const pax = this.j.seatPassengers(v, jrng(jhash(`${L.id}:${k ?? 'x'}:${dir}`)));
    this.bus = { vid: v.id, crew, pax, line: L.id, dir, next, state: atStop ? 'dwell' : 'drive', dwellT: atStop ? L.dwell : 0, k, s0: s, broke: 0, rolledM: 0, actors: [] };
    g.emit('trundleSpawned', { vehicle: v.id, line: L.id, dir: dir > 0 ? 'east' : 'west', at: this.nodeName(st[next].id), crew: crew.length });
    return v;
  }
  busVehicle() { return this.bus ? this.g.vehicles.find((v) => v.id === this.bus.vid) ?? null : null; }
  despawnBus() {
    const g = this.g, B = this.bus;
    if (!B) return;
    const v = this.busVehicle();
    for (const id of [...B.crew, ...(B.pax ?? []), ...(B.actors ?? [])]) { const c = g.chars.find((x) => x.id === id); if (c) { if (c.inVehicle) g.seats.leave(c, true); g.removeChar(c); } }
    if (this.j.pending?.where === 'aboard') this.j.choose(null);
    if (v) for (let i = 0; i < (v.occ?.length ?? 0); i++) if (v.occ[i] && v.occ[i] !== g.player && !g.chars.includes(v.occ[i])) v.occ[i] = null; // seats of crew a load already took
    if (v && !v.occ?.includes(g.player)) g.vehiclesSys.remove(v);
    this.bus = null;
  }
  // Make the next trundle real when you wait at its pole and it is nearly due (or step the clock to it: wait()).
  maybeSpawnBus() {
    const g = this.g, p = g.player;
    if (this.bus || this.away || !p.alive) return;
    const n = this.nodeHere(p.x, p.z, VB.busRealR);
    if (!n?.road) return;
    const now = this.hours();
    for (const L of this.linesAt(n.id)) {
      if (L.kind !== 'bus') continue;
      const i = L.stops.indexOf(n.id);
      for (const dir of [1, -1]) {
        const last = dir > 0 ? L.stops.length - 1 : 0;
        if (i === last) continue; // the end of the line in that direction: nothing leaves here that way
        const nb = this.nextBus(L, i, dir, now);
        const secs = nb.inHours / this.ts;
        if (secs >= 0 && secs <= VB.dueRealS) { this.spawnBus(L, i, dir, { k: nb.k }); return; }
      }
    }
  }
  // Step the clock until the next trundle (or iron) is nearly due at the board you stand at, and make it real.
  wait({ line = null, dir = null } = {}) {
    const g = this.g, n = this.nodeHere();
    if (!n) return { ok: false, why: 'not at a pole or station' };
    const now = this.hours();
    let best = null;
    for (const L of this.linesAt(n.id)) {
      if (line && L.id !== line) continue;
      if (L.kind === 'bus') {
        const i = L.stops.indexOf(n.id);
        // The way your punch from here goes, if you hold one; else whichever comes first.
        const held = !dir && this.punches.find((q) => q.line === L.id && q.from === n.id);
        for (const d of [1, -1]) {
          if ((dir && d !== dir) || (held && held.dir !== d)) continue;
          if (i === (d > 0 ? L.stops.length - 1 : 0)) continue;
          const nb = this.nextBus(L, i, d, now);
          if (!best || nb.at < best.at) best = { L, i, dir: d, at: nb.at, k: nb.k };
        }
      } else if (L.kind === 'rail' && n.id === 'dustbowl') {
        const eta = this.ironEta('dustbowl');
        if (!best || now + eta < best.at) best = { L, at: now + eta, rail: true };
      }
    }
    if (!best) return { ok: false, why: 'nothing leaves from here' };
    const lead = best.rail ? 0.05 : VB.dueRealS * 0.6 * this.ts; // arrive a little before it does
    const skip = Math.max(0, best.at - now - lead);
    this.advanceHours(skip, 'waited');
    if (!best.rail) { if (this.bus) this.despawnBus(); this.spawnBus(best.L, best.i, best.dir, { k: best.k }); }
    return { ok: true, waitedHours: r1(skip), line: best.L.id, dir: best.dir ?? null, due: r1(best.at), vehicle: this.bus?.vid ?? null };
  }

  // The trundle's driver: the outer lane of I-10 pole to pole, braking for each pole and for anything in the lane.
  driveBus(dt) {
    const g = this.g, B = this.bus, v = this.busVehicle(), L = this.line(B?.line);
    if (!B || !v || !L) { if (B) this.bus = null; return; }
    const p = g.player, aboard = p.inVehicle === v;
    if (v.dead) { if (aboard || this.ride) this.endRide('wrecked'); B.state = 'dead'; }
    if (v.driver === p) { // you took the wheel: it is a stolen bus now, not the line's
      g.emit('trundleTaken', { vehicle: v.id }); v.ai = null; v.trundle = null; if (this.ride) this.endRide('took the wheel'); this.bus = null; return;
    }
    const st = this.table(L), sp = g.vehiclesSys.speed(v);
    const RD = this.roadOf(L), pr = RD.project(v.x, v.z, 600), s = pr.s;
    if (!v.driver || !v.driver.alive || B.state === 'dead') { v.throttle = 0; v.steer = 0; v.handbrake = sp < 2; if (B.state !== 'dead' && B.state !== 'stranded') { B.state = 'stranded'; g.emit('trundleStranded', { vehicle: v.id }); if (aboard) g.hud?.toast?.('THE TRUNDLE IS DEAD IN THE ROAD · [F] GET OFF, OR TAKE THE WHEEL', 'hot'); } return; }
    // The guard: shoots at anything coming for the coach.
    this.guard(v, dt);
    // The cord: brake where you are and let you down at the roadside (not a pole).
    if (B.cord) {
      v.throttle = sp > 0.4 ? -1 : 0; v.handbrake = sp < 1.5; v.steer *= 0.5;
      if (sp < JOURNEY_RULES.cord.stopSpeed) { B.cord = false; if (aboard) this.dropRoadside(v, 'cord'); }
      return;
    }
    // Something on the road (an incident staged on the map): brake to a stop short of it, then the card asks.
    if (B.halt) {
      const along = (B.halt.s - s) * B.dir;
      const want = Math.max(0, Math.min(L.speed, Math.sqrt(2 * 3.2 * Math.max(0, along - 4))));
      const ap = g.streamer.autopilot(v, B.dir, 1, want, RD === this.W ? null : RD);
      v.steer = ap.steer; v.throttle = want < 0.5 ? (sp > 0.4 ? -1 : 0) : ap.throttle; v.handbrake = want < 0.5 && sp < 1.2;
      if (sp < 1.2 && along < 10 && !B.halt.asked) { B.halt.asked = true; this.askOnMap(B.halt.inc, L, v); }
      return;
    }
    if (B.fightT > 0) { B.fightT -= dt; v.throttle = sp > 0.5 ? -1 : 0; v.handbrake = true; v.steer = 0; if (!(B.actors ?? []).some((id) => g.chars.find((c) => c.id === id)?.alive)) B.fightT = 0; return; }
    if (B.broke > 0) { B.broke -= dt; v.throttle = sp > 1 ? -1 : 0; v.handbrake = sp < 1.5; v.steer = 0; return; }
    if (B.state === 'dwell') {
      v.throttle = sp > 0.5 ? -1 : 0; v.handbrake = true; v.steer = 0;
      B.dwellT -= dt;
      if (B.dwellT <= 0) {
        const last = B.dir > 0 ? st.length - 1 : 0;
        if (B.next === last) { B.state = 'end'; if (aboard) this.alight(st[B.next].id, 'end of the line'); return; }
        B.next += B.dir; B.state = 'drive';
        g.emit('trundleDeparted', { vehicle: v.id, next: st[B.next].id });
      }
      return;
    }
    if (B.state !== 'drive') { v.throttle = sp > 0.5 ? -1 : 0; v.handbrake = true; return; }
    const target = st[B.next], along = (target.s - s) * B.dir;
    let want = Math.min(L.speed, Math.sqrt(2 * 2.4 * Math.max(0, along - 1.2)) + 0.6);
    // Its lane: the outer one; round a car stopped in it by the inner lane, or the oncoming one when that is clear for a
    // long way (parked cars on Rust Haven's main street, a wreck on the interstate); back to the outer lane once past.
    const W = RD, sec = W.section(s), lw = (sec.lane2 - sec.lane0) / 2, U = (B.u ??= { 1: 0, 0: 0, [-1]: 0 });
    for (const l of LANES) U[l] = B.dir * (sec.lane0 + lw * (l + 0.5)); // each lane's offset from the centreline
    const blocked = (B.blk ??= { 1: 99, 0: 99, [-1]: 99 }); blocked[1] = blocked[0] = blocked[-1] = 99; // reused: no per-frame garbage
    let beside = false;
    for (const o of g.vehicles) {
      if (o === v || (o.dead && o.sunk)) continue;
      if (Math.abs(o.x - v.x) > 70 || Math.abs(o.z - v.z) > 70) continue;
      const q = W.project(o.x, o.z, 120), ds = (q.s - s) * B.dir, uo = q.side * q.d, osp = g.vehiclesSys.speed(o);
      const oncoming = osp > 3 && (o.vx * Math.sin(v.h) + o.vz * Math.cos(v.h)) < 0;
      for (const l of LANES) {
        if (Math.abs(uo - U[l]) > 2.5) continue;
        if (ds > 2 && ds < (l === -1 ? 70 : 32) && (osp < 4 || oncoming || l === -1)) blocked[l] = Math.min(blocked[l], ds);
        else if (l === 1 && ds > -12 && ds <= 2 && osp < 4) beside = true; // still alongside what it went round: not back yet
      }
    }
    // What does not move: a wreck in the lane, a kerb car, a barrier. Three rays down each lane (the coach's width).
    const f = W.at(s), tx = f.tx * B.dir, tz = f.tz * B.dir;
    for (const l of LANES) {
      const u = U[l];
      for (const k of WIDTH) {
        const ox = f.x + f.nx * (u + k) + tx * 4, oz = f.z + f.nz * (u + k) + tz * 4;
        const t = g.statics.raycast(ox, oz, tx, tz, 34);
        if (t < 33.9) blocked[l] = Math.min(blocked[l], t + 4);
      }
    }
    if (B.lane === undefined) B.lane = 1;
    if (B.lane !== 1 && blocked[1] > 30 && !beside && (s - (B.passS ?? s)) * B.dir >= 0) B.lane = 1;
    else if (blocked[B.lane] < 30) {
      let free; for (const l of LANES) if (blocked[l] >= (l === -1 ? 70 : 30)) { free = l; break; }
      if (free !== undefined) { if (free !== 1) B.passS = s + B.dir * (blocked[B.lane] + 20); B.lane = free; } // hold the lane until well past it
    }
    if (blocked[B.lane] < 30) want = Math.min(want, Math.max(0, (blocked[B.lane] - 9) * 0.8));
    if (B.lane !== 1) want = Math.min(want, 9); // easy round it
    // Anyone on foot in its path: stop and lean on the horn.
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    for (const c of g.chars) { if (!c.alive || c.inVehicle) continue; const ox = c.x - v.x, oz = c.z - v.z; if (Math.abs(ox) > 18 || Math.abs(oz) > 18) continue; const a = ox * fx + oz * fz, w = Math.abs(ox * fz - oz * fx); if (a > 2 && a < 15 && w < 2.2) { want = 0; v.honk = (v.honk ?? 0) - dt; if (v.honk <= 0) { g.audio?.horn?.(Math.hypot(c.x - p.x, c.z - p.z)); v.honk = 2.5; } } }
    const ap = g.streamer.autopilot(v, B.dir, B.lane, want, RD === this.W ? null : RD);
    v.steer = ap.steer; v.handbrake = false;
    v.throttle = want < 0.5 ? (sp > 0.4 ? -1 : 0) : ap.throttle;
    if (along < 1.6 && sp < 1.6 || along < -6) { B.state = 'dwell'; B.dwellT = L.dwell; this.atPole(target.id, v); }
    // En route with you aboard: a mile of road can turn something up.
    if (aboard && this.ride) {
      B.rolledM += sp * dt;
      if (B.rolledM > JOURNEY_RULES.rollEveryM) { B.rolledM -= JOURNEY_RULES.rollEveryM; this.rollRealtime(L, v); }
    }
  }
  // The guard and every armed passenger: shoot from the windows at anything coming for the coach.
  guard(v, dt) {
    for (const o of v.occ ?? []) if (o && o.alive && o.weapon && (o.trundle === 'guard' || o.trundle === 'passenger')) this.shootFrom(v, o, dt);
  }
  shootFrom(v, gd, dt) {
    const g = this.g;
    gd.cool = (gd.cool ?? 0) - dt;
    if (gd.cool > 0) return;
    let best = null, bd = 34;
    for (const c of g.chars) { if (!c.alive || c === gd || c.inVehicle === v) continue; if (c.faction !== 'raider' && c.faction !== 'zombie' && c.target !== g.player && c.target !== gd) continue; const d = Math.hypot(c.x - v.x, c.z - v.z); if (d < bd) { bd = d; best = c; } }
    if (!best || !g.statics.lineOfSight(v.x, v.z, best.x, best.z)) return;
    gd.cool = 0.9 + Math.random() * 0.6;
    g.carCombat.fireFromVehicle(gd, v, gd.weapon, Math.atan2(best.x - v.x, best.z - v.z) + (Math.random() - 0.5) * 0.15);
  }
  // A real-time ride's roll every rollEveryM of road (one incident per ride): an INCIDENT row played out on the map with
  // the real coach (systems/journeys.js rolls it, seeded by the punch and the stretch of road).
  rollRealtime(L, v) {
    const R = this.ride;
    if (!R || R.event) return;
    R.seg = (R.seg ?? 0) + 1;
    const ctx = this.j.ctxFor(L, R.punch.from, R.punch.to, this.hours());
    const p = this.j.odds({ ...ctx, miles: JOURNEY_RULES.rollEveryM / MILE }) * JOURNEY_RULES.realMul;
    const inc = this.j.roll(ctx, jhash(`${R.punch.id}:rt:${R.seg}`), { p });
    if (inc) this.stageIncident(inc, L, v);
  }
  // Put an incident on the map: the coach brakes for a roadblock or the bulls' checkpoint ahead (and the card asks when it
  // stops), stops dead for a breakdown or a crash, meets the dead coming out of the brush; a thief is one of the passengers.
  stageIncident(inc, L, v) {
    const g = this.g, B = this.bus, R = this.ride, RD = this.roadOf(L), s = RD.project(v.x, v.z, 600).s;
    if (!B || !R) return null;
    R.event = inc.id; B.inc = inc;
    g.emit('enRoute', { event: inc.id, vehicle: v.id, onMap: true });
    g.hud?.toast?.(inc.title, 'hot');
    const ahead = (m, lane = 0) => { const q = this.stopPoint(s + B.dir * m, B.dir, RD), f = RD.at(s + B.dir * m); return { x: q.x + f.nx * lane, z: q.z + f.nz * lane }; };
    if (inc.id === 'roadblock' || inc.id === 'checkpoint') {
      B.halt = { s: s + B.dir * 70, inc, asked: false };
      if (inc.id === 'checkpoint') for (let k = 0; k < 2; k++) { const q = ahead(76, B.dir * (5 + k * 2)), c = g.addChar({ x: q.x, z: q.z, faction: 'warden', weapon: 'shotgun', name: `Town Bull ${k + 1}`, flag: g.randomFlag ? g.randomFlag(Math.random) : 'US', colors: outfit('warden') }); if (c) { c.hold = true; c.trundle = 'bull'; B.actors.push(c.id); } }
    } else if (inc.id === 'breakdown' || inc.id === 'crash') {
      if (inc.id === 'crash') { v.hp = Math.max(1, v.hp - v.maxHp * 0.45); g.hud?.shake?.(1); }
      B.halt = { s: s + B.dir * 12, inc, asked: false };
    } else {
      if (inc.id === 'infected' && g.zombies?.enabled) { const q = ahead(150); g.zombies.horde?.(q.x, q.z, 6, 0.2); }
      this.askOnMap(inc, L, v);
    }
    return inc;
  }
  askOnMap(inc, L, v) {
    this.j.ask(inc, (res) => this.afterIncident(res, inc, L, v), { where: 'aboard' });
  }
  // What a choice does on the map: the coach goes on, waits, fights, or you are walking.
  afterIncident(res, inc, L, v) {
    const g = this.g, B = this.bus, RD = this.roadOf(L);
    if (!B) return;
    B.halt = null;
    const wait = (h) => { B.broke = Math.min(30, (h ?? 0) / this.ts); };
    if (inc.id === 'roadblock' && res.choice === 'fight') {
      // Out of the wrecks they come, shooting; the guard and the armed passengers shoot back from the windows.
      const s = RD.project(v.x, v.z, 600).s, f = RD.at(s + B.dir * 40);
      for (let k = 0; k < 4; k++) { const c = g.spawnRaider?.(f.x + (k - 1.5) * 3, f.z + (k - 1.5) * 2, Math.random, k ? 'pistol' : 'smg'); if (c) { c.target = g.player; c.grudge = g.player; B.actors.push(c.id); } }
      B.fightT = 60;
    } else if (inc.id === 'thief' && res.choice === 'accuse' && res.won === false) {
      const th = (B.pax ?? []).map((id) => g.chars.find((c) => c.id === id)).find((c) => c?.alive);
      if (th) { g.seats.leave(th, true); th.hold = false; th.flee = 14; th.fleeX = v.x; th.fleeZ = v.z; th.trundle = null; B.pax = B.pax.filter((id) => id !== th.id); }
    }
    if (res.putOff) { if (inc.id === 'crash') B.state = 'stranded'; this.dropRoadside(v, inc.id); return; }
    if (inc.id === 'crash') B.state = 'stranded';
    wait(res.delay);
    g.emit('incidentOnMap', { id: inc.id, choice: res.choice, vehicle: v.id });
  }
  // Pull the cord (F aboard a moving coach, or riding a stranger's car): stop where you are. False when there is nothing to
  // pull (on foot, at a pole: F is the old F).
  cord() {
    const g = this.g, p = g.player, Lf = this.j.lift, lv = this.j.liftVehicle();
    if (Lf && lv && p.inVehicle === lv && Lf.state === 'driving') { Lf.cord = true; g.hud?.toast?.('YOU ASK TO BE LET OUT HERE', 'job'); g.emit('cordPulled', { vehicle: lv.id, lift: true }); return true; }
    const v = this.busVehicle();
    if (!this.ride || !v || p.inVehicle !== v || !this.bus) return false;
    if (this.bus.state === 'dwell' || g.vehiclesSys.speed(v) < JOURNEY_RULES.cord.stopSpeed) return false;
    if (this.bus.cord) return true;
    this.bus.cord = true;
    g.emit('cordPulled', { vehicle: v.id });
    g.hud?.toast?.('YOU PULL THE CORD · THE DRIVER PULLS OVER HERE', 'job');
    return true;
  }
  // Set down beside a vehicle at the roadside (the cord, an incident's walk, a hitch's end): the outer shoulder side.
  dropRoadside(v, why) {
    const g = this.g, p = g.player, R = this.ride, L = this.line(R?.line ?? this.bus?.line);
    const RD = (this.j.lift && this.j.lift.vid === v.id ? this.j.lift.cor : null) ?? (L ? this.roadOf(L) : this.W);
    const pr = RD.project(v.x, v.z, 600), f = RD.at(pr.s), side = pr.side || 1, off = (v.wid ?? 2.4) / 2 + JOURNEY_RULES.cord.side * 0.5;
    const at = { x: v.x, z: v.z };
    if (R) this.endRide(why);
    if (p.inVehicle) g.exitVehicle(true);
    const t = { x: v.x + f.nx * side * off, z: v.z + f.nz * side * off };
    g.statics.resolveCircle(t, 0.5);
    p.x = t.x; p.z = t.z; p.gy = 0; p.storey = null; g.standOn?.(p);
    const dist = r1(Math.hypot(p.x - at.x, p.z - at.z));
    if (R) {
      const trip = { line: R.line, from: R.punch.from, to: 'roadside', wanted: R.punch.to, kind: R.kind, hours: r1(this.hours() - R.at), fare: R.punch.fare, realtime: true, event: R.event ?? null, cord: why === 'cord', at: +this.hours().toFixed(2), onMap: true, roadside: { x: r1(p.x), z: r1(p.z) }, mile: r1(pr.s / MILE) };
      this.log.push(trip); if (this.log.length > 20) this.log.shift();
      g.emit('arrived', { ...trip });
      const c = clock(this.hours());
      this.card('arrive', { name: `THE ROADSIDE · MILE ${trip.mile}`, line: L?.name ?? '', hours: trip.hours, when: `DAY ${c.day} ${c.text}` });
    }
    this.lastDrop = { x: r1(p.x), z: r1(p.z), vx: r1(at.x), vz: r1(at.z), dist, why, mile: r1(pr.s / MILE) };
    g.emit('droppedRoadside', { ...this.lastDrop });
    return this.lastDrop;
  }
  // The trundle stopped at a pole: your stop? off you get.
  atPole(nodeId, v) {
    const g = this.g, R = this.ride;
    g.emit('trundleAtPole', { vehicle: v.id, node: nodeId });
    if (R && g.player.inVehicle === v && R.punch.to === nodeId) this.alight(nodeId, 'your stop');
  }
  alight(nodeId, why) {
    const g = this.g, R = this.ride, L = this.line(R?.line ?? this.bus?.line);
    if (!R) return;
    this.endRide(why);
    const a = this.arrive(nodeId, L, { dir: R.punch.dir || 1 });
    const trip = { line: L.id, from: R.punch.from, to: nodeId, wanted: R.punch.to, kind: L.kind, hours: r1(this.hours() - R.at), miles: r1(this.milesBetween(L, R.punch.from, nodeId)), fare: R.punch.fare, realtime: true, event: R.event ?? null, at: +this.hours().toFixed(2), onMap: a.onMap };
    this.log.push(trip); if (this.log.length > 20) this.log.shift();
    g.emit('arrived', { ...trip });
    const c = clock(this.hours());
    this.card('arrive', { name: NODES[nodeId]?.name, line: L.name, hours: trip.hours, when: `DAY ${c.day} ${c.text}` });
  }
  endRide(why) {
    const R = this.ride;
    if (!R) return;
    this.ride = null;
    this.g.emit('rideEnded', { why, line: R.line });
  }

  // ---- the frame --------------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g, p = g.player;
    this.ui.update(dt);
    if (!this.W) return;
    if (!this.props) this.buildProps();
    if (this.away && !this.ui.open && !g.api?.busy) this.openHall();
    if ((this.realT -= dt) <= 0) { this.realT = 0.5; this.maybeSpawnBus(); this.placeProps(); }
    if (this.bus) {
      this.driveBus(dt);
      const v = this.busVehicle();
      // Aboard without a punch for this coach: off you get.
      if (v && p.inVehicle === v && !this.ride) {
        const B = this.bus, L = this.line(B.line), st = L.stops;
        const P = this.punches.find((q) => q.line === L.id && q.dir === B.dir && (this.node(q.to).s - this.roadOf(L).project(v.x, v.z, 600).s) * B.dir > 0);
        if (P) {
          this.usePunch(P);
          this.ride = { punch: P, line: L.id, kind: 'bus', vid: v.id, from: P.from, at: +this.hours().toFixed(2), event: null };
          g.emit('boardedTrundle', { punch: P.id, to: P.to, vehicle: v.id });
          g.hud?.toast?.(`PUNCHED · ${L.name} TO ${this.nodeName(P.to)} · [N] SLEEP THROUGH IT`, 'job');
        } else {
          g.exitVehicle(true);
          g.hud?.toast?.(`NO PUNCH, NO RIDE · BUY ONE AT THE POLE (${st.includes(this.nodeHere()?.id) ? 'HERE' : 'THE BOARD'})`, 'warn');
          g.emit('refusedBoarding', { vehicle: v.id });
        }
      }
      if (this.ride && this.ride.kind === 'bus' && p.inVehicle !== v) { this.endRide(p.alive ? 'got off' : 'died'); }
      // Gone from the story once it has passed you and is well up the road (or very far), or its run is over out of reach.
      if (!this.ride && this.bus) {
        const d = v ? Math.hypot(v.x - p.x, v.z - p.z) : Infinity, W = this.roadOf(this.line(this.bus.line));
        const passed = v && (W.project(v.x, v.z, 900).s - W.project(p.x, p.z, 900).s) * this.bus.dir > 0;
        const over = this.bus.state === 'end' || this.bus.state === 'dead' || this.bus.state === 'stranded';
        if (!v || d > 1500 || (passed && d > 400) || (over && d > 120)) this.despawnBus();
      }
    }
    this.updateIron();
    this.j.updateHitch(dt);
    // Aboard the coach: U for THE PASSENGERS. On foot: O thumbs out (or gets into the car that stopped for you).
    const I = g.input;
    if (I?.hit && !this.ui.open && p.alive) {
      if (I.hit('KeyU') && this.ride?.kind === 'bus') this.j.openPassengers();
      else if (I.hit('KeyO')) this.j.key();
    }
  }
  // The iron: riding the freight off the island completes the trip (a fade): your halt, or a stowaway's luck.
  updateIron() {
    const g = this.g, p = g.player, T = g.train;
    if (!T || !p.onTrain) { this.stowaway = false; if (this.ride?.kind === 'rail' && !p.onTrain && T?.state !== 'away') this.endRide('got off'); return; }
    const L = this.line('iron');
    if (!this.ride) {
      const P = this.punches.find((q) => q.line === 'iron' && q.from === 'dustbowl');
      if (P && Math.abs(p.z - 96) < 120) { this.usePunch(P); this.ride = { punch: P, line: 'iron', kind: 'rail', from: P.from, at: +this.hours().toFixed(2), event: null }; g.emit('boardedIron', { punch: P.id, to: P.to }); g.hud?.toast?.(`PUNCHED · THE IRON TO ${this.nodeName(P.to)}`, 'job'); }
      else if (!this.stowaway) { this.stowaway = true; g.emit('stowaway', {}); }
    }
    if (T.state !== 'away' && T.present) return;
    // Off the island: the rest of the trip goes by on the clock.
    const R = this.ride, to = R?.punch.to ?? 'south_halt', from = R?.from ?? 'dustbowl';
    const total = this.ironHours(L, from, to), spent = R ? this.hours() - R.at : 0;
    p.onTrain = null; p.seatPose = null;
    this.endRide('iron');
    let thrown = false;
    if (!R && Math.random() < VB.stowawayRisk) thrown = true;
    this.stowaway = false;
    this.advanceHours(Math.max(0, total - spent), `iron:${from}->${to}`);
    const a = this.arrive(to, L);
    if (thrown) { g.combat.damage(p, 18, null, 1, 0, 'bullet'); g.hud?.toast?.('THE BRAKEMAN FOUND YOU AND PUT YOU OFF THE IRON', 'hot'); }
    const trip = { line: 'iron', from, to, kind: 'rail', hours: r1(Math.max(total, spent)), fare: R?.punch.fare ?? 0, stowaway: !R, thrown, at: +this.hours().toFixed(2), onMap: a.onMap };
    this.log.push(trip); if (this.log.length > 20) this.log.shift();
    g.emit('arrived', { ...trip });
    const c = clock(this.hours());
    this.card('arrive', { name: NODES[to]?.name, line: L.name, hours: trip.hours, when: `DAY ${c.day} ${c.text}` });
  }
  // N on the trundle with a punch: sleep through the rest of it.
  napRide() {
    const p = this.g.player;
    if (!this.ride || !p.inVehicle || p.inVehicle.id !== this.bus?.vid) return false;
    const r = this.skip({ punch: this.ride.punch.id });
    if (!r.ok) this.g.hud?.toast?.(r.why.toUpperCase(), 'warn');
    return true;
  }

  // ---- the world's furniture: poles with a bench and a ticket box, the board you read ---------------------------------
  buildProps() {
    const g = this.g;
    this.props = true;
    if (!g.scene) return;
    const geo = poleKit();
    this.poleMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.25 }), 48);
    this.poleMesh.count = 0; this.poleMesh.visible = false; this.poleMesh.castShadow = true; this.poleMesh.receiveShadow = true;
    g.scene.add(this.poleMesh);
    // The board: one canvas, drawn for the nearest pole.
    const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (cv) {
      cv.width = 512; cv.height = 300;
      this.boardCanvas = cv;
      this.boardTex = new THREE.CanvasTexture(cv); this.boardTex.colorSpace = THREE.SRGBColorSpace; this.boardTex.anisotropy = 4;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.1), new THREE.MeshStandardMaterial({ map: this.boardTex, roughness: 0.8, metalness: 0.1, emissive: '#ffffff', emissiveMap: this.boardTex, emissiveIntensity: 0.22 }));
      m.rotation.x = -1.02; m.visible = false; m.castShadow = true;
      g.scene.add(m);
      this.boardMesh = m;
    }
    this.propAt = { x: 1e9, z: 1e9 };
  }
  placeProps() {
    const g = this.g, P = g.player, cx = P.inVehicle?.x ?? P.x, cz = P.inVehicle?.z ?? P.z;
    if (!this.poleMesh) return;
    if (Math.hypot(cx - this.propAt.x, cz - this.propAt.z) > 40) {
      this.propAt = { x: cx, z: cz };
      let n = 0;
      const o = _o;
      for (const nd of Object.values(this.nodes())) {
        if (!nd.onMap) continue;
        const spots = nd.road ? [nd.poles[1], nd.poles[-1], ...(nd.air ? [nd.counter] : [])] : [nd.counter];
        for (const q of spots) {
          if (!q || n >= 48 || Math.hypot(q.x - cx, q.z - cz) > 400) continue;
          o.position.set(q.x, g.stunts?.heightAt?.(q.x, q.z) ?? 0, q.z); o.rotation.set(0, q.h ?? 0, 0); o.scale.set(1, 1, 1); o.updateMatrix();
          this.poleMesh.setMatrixAt(n++, o.matrix);
        }
      }
      this.poleMesh.count = n; this.poleMesh.visible = n > 0; this.poleMesh.instanceMatrix.needsUpdate = true;
      if (n) this.poleMesh.computeBoundingSphere(); // culled like any mesh: no draw call (or shadow pass) unless a pole is on screen
    }
    // The board at the nearest pole within 120 m, redrawn when the stop or the clock's ten minutes change.
    if (!this.boardMesh) return;
    let best = null, bd = 120, bq = null;
    for (const nd of Object.values(this.nodes())) {
      if (!nd.onMap) continue;
      for (const q of nd.road ? [nd.poles[1], nd.poles[-1], ...(nd.air ? [nd.counter] : [])] : [nd.counter]) { if (!q) continue; const d = Math.hypot(q.x - cx, q.z - cz); if (d < bd) { bd = d; best = nd; bq = q; } }
    }
    if (!best) { this.boardMesh.visible = false; return; }
    const tk = `${best.id}:${bq.x.toFixed(0)}:${Math.floor(this.hours() * 6)}`;
    if (tk !== this.boardKey) { this.boardKey = tk; this.drawBoard(best); }
    // Beside the pole, along the road, legible from the street camera (its top to the north).
    const ax = Math.cos(bq.h ?? 0), az = -Math.sin(bq.h ?? 0);
    this.boardMesh.position.set(bq.x - ax * 3.3, 2.3, bq.z - az * 3.3); // the ticket-box side, clear of the lean-to's roof
    this.boardMesh.visible = true;
  }
  drawBoard(nd) {
    const c = this.boardCanvas?.getContext('2d');
    if (!c) return;
    const W = 512, H = 300, now = this.hours();
    const grd = c.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#4a4640'); grd.addColorStop(1, '#2a2723');
    c.fillStyle = grd; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#7a6a4c'; c.lineWidth = 8; c.strokeRect(4, 4, W - 8, H - 8);
    c.fillStyle = '#9c8a64'; for (const [x, y] of [[16, 16], [W - 16, 16], [16, H - 16], [W - 16, H - 16]]) { c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); }
    c.fillStyle = '#c8602c'; c.fillRect(14, 22, W - 28, 50);
    c.fillStyle = '#f3e6c8'; c.textAlign = 'left'; c.font = '900 34px "Big Shoulders Stencil Display", "Arial Narrow", sans-serif';
    const lines = [...new Set(this.linesAt(nd.id).map((l) => l.name))].join(' · ');
    c.fillText(lines || 'THE LINE', 26, 60);
    c.fillStyle = '#e8d6b0'; c.font = '800 30px "Barlow Condensed", "Arial Narrow", sans-serif';
    c.fillText(nd.name, 26, 108);
    c.textAlign = 'right'; c.fillStyle = '#f0b43a'; c.fillText(clock(now).text, W - 26, 108); c.textAlign = 'left';
    const rows = this.boardRows(nd.id), shown = [];
    // One line per direction (bus) or per destination (iron, air): the next one.
    const seen = new Set();
    for (const r of rows) { const key = r.kind === 'bus' ? `${r.line}:${r.dir}` : `${r.line}:${r.to}`; if (seen.has(key)) continue; seen.add(key); shown.push(r); }
    c.font = '700 27px "Barlow Condensed", "Arial Narrow", sans-serif';
    shown.slice(0, 4).forEach((r, k) => {
      const y = 152 + k * 36;
      const last = r.kind === 'bus' ? this.line(r.line).stops[r.dir > 0 ? this.line(r.line).stops.length - 1 : 0] : r.to;
      c.fillStyle = '#efe6d6'; c.fillText(`${r.kind === 'bus' ? this.dirLabel(r.line, r.dir) : r.kind === 'air' ? '✈ ' : '▸ '}${this.nodeName(last)}`, 26, y);
      const cd = clock(r.dep), d0 = Math.floor(now / 24), when = cd.day === d0 ? cd.text : cd.day === d0 + 1 ? `TMRW ${cd.text}` : `DAY ${cd.day} ${cd.text}`;
      c.fillStyle = '#f0b43a'; c.textAlign = 'right'; c.fillText(when, W - 26, y); c.textAlign = 'left';
    });
    c.fillStyle = '#b6a88f'; c.font = '600 21px "Barlow Condensed", "Arial Narrow", sans-serif';
    c.fillText('PUNCHES AT THE BOX · NO PUNCH, NO RIDE', 26, H - 22);
    this.boardTex.needsUpdate = true;
  }

  // ---- the map --------------------------------------------------------------------------------------------------------
  drawMap(c, T) {
    for (const n of Object.values(this.nodes())) {
      if (!n.onMap) continue;
      const q = n.counter ?? n, [x, y] = T(q.x, q.z);
      if (x < -20 || y < -20 || x > 800 || y > 800) continue;
      c.fillStyle = n.knot ? '#f0b43a' : n.air ? '#e8e2d4' : '#c8602c'; c.strokeStyle = '#1b1410'; c.lineWidth = 2;
      c.beginPath(); c.rect(x - 4, y - 4, 8, 8); c.fill(); c.stroke();
      if (n.knot || n.rail) { c.font = '700 11px Barlow Condensed'; c.textAlign = 'left'; c.lineWidth = 3; c.strokeText(n.short, x + 7, y + 13); c.fillStyle = '#f2e6d0'; c.fillText(n.short, x + 7, y + 13); }
    }
    for (const P of this.punches) { const n = this.node(P.to); if (!n?.onMap) continue; const [x, y] = T(n.counter.x, n.counter.z); c.strokeStyle = '#f0b43a'; c.lineWidth = 2; c.setLineDash([3, 3]); c.beginPath(); c.arc(x, y, 11, 0, 7); c.stroke(); c.setLineDash([]); }
  }

  // ---- reads -----------------------------------------------------------------------------------------------------------
  view() {
    const g = this.g, here = this.away?.node ?? this.nodeHere()?.id ?? null, v = this.busVehicle();
    return {
      here, away: this.away, punches: this.punches.map((p) => ({ ...p })),
      ride: this.ride ? { line: this.ride.line, kind: this.ride.kind, to: this.ride.punch.to, from: this.ride.from, since: this.ride.at, event: this.ride.event } : null,
      bus: this.bus ? { ...this.bus, x: v ? r1(v.x) : null, z: v ? r1(v.z) : null, speed: v ? r1(g.vehiclesSys.speed(v)) : 0, next: this.line(this.bus.line).stops[this.bus.next], hp: v ? Math.round(v.hp) : 0, driver: v?.driver?.id ?? null } : null,
      board: here ? this.boardRows(here).map((r) => ({ ...r, dep: r1(r.dep), arr: r1(r.arr), toName: this.nodeName(r.to) })) : null,
      log: this.log.slice(-6), now: r1(this.hours()), lastCard: this.lastCard, journeys: this.j.view(), lastDrop: this.lastDrop ?? null,
      pax: this.bus ? (this.bus.pax ?? []).map((id) => this.g.chars.find((c) => c.id === id)).filter(Boolean).map((c) => ({ id: c.id, name: c.name, flag: c.flag, faction: c.faction, weapon: c.weapon ?? null })) : [],
    };
  }
  nodesView() {
    return Object.values(this.nodes()).map((n) => ({ id: n.id, name: n.name, onMap: n.onMap, road: n.road, s: n.s !== undefined ? Math.round(n.s) : null, mile: n.s !== undefined ? r1(n.s / MILE) : null, x: n.counter ? r1(n.counter.x) : null, z: n.counter ? r1(n.counter.z) : null, lines: this.linesAt(n.id).map((l) => l.id), knot: !!n.knot }));
  }
  linesView() {
    return LINES.map((L) => ({ id: L.id, kind: L.kind, name: L.name, slang: L.slang, stops: L.stops ?? L.fields, every: L.every ?? null, first: L.first ?? null, speed: L.speed ?? null, fare: L.fare ?? null, risk: L.risk,
      flights: L.flights?.map((f, i) => ({ i, from: f.from, to: f.to, dep: f.dep, everyDays: f.everyDays, hours: f.hours, fare: f.fare, next: r1(this.nextFlight(f)) })) }));
  }

  save() {
    const v = this.busVehicle();
    return { v: 1, punches: this.punches.map((p) => ({ ...p })), nPunch: this.nPunch, away: this.away ? { ...this.away } : null, log: this.log.map((t) => ({ ...t })),
      ride: this.ride ? { punch: { ...this.ride.punch }, line: this.ride.line, kind: this.ride.kind, from: this.ride.from, at: this.ride.at, event: this.ride.event } : null,
      bus: this.bus && v ? { line: this.bus.line, dir: this.bus.dir, next: this.bus.next, state: this.bus.state, dwellT: this.bus.dwellT, x: v.x, z: v.z, h: v.h, hp: v.hp, vid: v.id, crew: [...this.bus.crew] } : null };
  }
  load(s) {
    const g = this.g;
    // Whatever trundle the save or this page had: it goes, and the saved one is made again (its crew re-seated by role).
    if (this.bus) this.despawnBus();
    for (const v of [...g.vehicles]) if (v.type === 'bus' && (v.ai === 'bus' || v.trundle)) { for (const o of [...(v.occ ?? [])]) if (o && o !== g.player) { g.seats.leave(o, true); if (g.chars.includes(o)) g.removeChar(o); } if (g.player.inVehicle === v) g.exitVehicle(true); g.vehiclesSys.remove(v); }
    if (s?.bus?.crew) for (const id of s.bus.crew) { const c = g.chars.find((x) => x.id === id); if (c) g.removeChar(c); }
    if (this.ui.open) this.ui.close();
    this.punches = (s?.punches ?? []).map((p) => ({ ...p })); this.nPunch = s?.nPunch ?? this.punches.length;
    this.log = (s?.log ?? []).map((t) => ({ ...t }));
    this.ride = null; this.away = null;
    if (s?.bus) {
      const L = this.line(s.bus.line), v = L && this.spawnBus(L, s.bus.next, s.bus.dir, { atStop: s.bus.state === 'dwell' });
      if (v) { v.x = s.bus.x; v.z = s.bus.z; v.h = s.bus.h; v.hp = s.bus.hp; v.vx = 0; v.vz = 0; this.bus.next = s.bus.next; this.bus.state = s.bus.state === 'dwell' ? 'dwell' : 'drive'; this.bus.dwellT = s.bus.dwellT ?? 0; }
      if (v && s.ride?.kind === 'bus') {
        const p = g.player;
        if (p.inVehicle) g.exitVehicle(true);
        g.seats.board(p, v, g.seats.freeSeat(v, { passengerOnly: true }));
        this.ride = { ...s.ride, punch: { ...s.ride.punch }, vid: v.id };
      }
    } else if (s?.ride && s.ride.kind !== 'bus') this.ride = { ...s.ride, punch: { ...s.ride.punch } };
    if (s?.away) this.hold(s.away.node, { why: s.away.why, vat: s.away.vat });
  }
}

const STATION_Z = 110;
const LANES = [1, 0, -1], WIDTH = [-1.1, 0, 1.1]; // the trundle's lanes (outer, inner, oncoming) and its width in rays
const _o = new THREE.Object3D();
// A pole: a steel post with the line's disc, a bench under a rusted lean-to, and a ticket box. Local +z faces the road.
function poleKit() {
  const parts = [];
  const col = (geo, hex) => { geo = geo.index ? geo.toNonIndexed() : geo; const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; };
  const box = (sx, sy, sz, x, y, z, hex) => parts.push(col(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), hex));
  box(0.14, 3.2, 0.14, 0, 1.6, 0, '#2c2a28');                                                  // the post
  parts.push(col(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 18).rotateX(Math.PI / 2).translate(0, 2.95, 0.08), '#c8602c')); // the disc
  parts.push(col(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 18).rotateX(Math.PI / 2).translate(0, 2.95, 0.09), '#e8d6b0'));
  parts.push(col(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 18).rotateX(Math.PI / 2).translate(0, 2.95, 0.1), '#c8602c'));
  // A roundel on top of the post: what the street camera reads as THE POLE (rust ring, bone ring, a rust bull).
  parts.push(col(new THREE.CylinderGeometry(0.72, 0.72, 0.06, 22).translate(0, 3.24, 0), '#c8602c'));
  parts.push(col(new THREE.CylinderGeometry(0.52, 0.52, 0.07, 22).translate(0, 3.25, 0), '#e8d6b0'));
  parts.push(col(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 18).translate(0, 3.26, 0), '#c8602c'));
  // The lean-to: back wall, roof (what the street camera sees: a rust plate with a sand stripe), bench, legs.
  box(2.8, 2.0, 0.08, 1.9, 1.0, -0.9, '#6a4a32');
  box(3.0, 0.08, 1.5, 1.9, 2.25, -0.35, '#8a4a26');
  box(3.0, 0.09, 0.22, 1.9, 2.3, 0.3, '#d9b46a');
  box(2.2, 0.08, 0.46, 1.9, 0.5, -0.55, '#7a5a3a');
  for (const x of [0.95, 2.85]) box(0.08, 0.46, 0.4, x, 0.23, -0.55, '#2c2a28');
  // The ticket box: yellow and black, on its own post.
  box(0.1, 1.1, 0.1, -0.9, 0.55, 0, '#2c2a28');
  box(0.5, 0.62, 0.34, -0.9, 1.35, 0, '#d9a42a');
  box(0.52, 0.12, 0.36, -0.9, 1.6, 0, '#1e1c1a');
  box(0.3, 0.06, 0.02, -0.9, 1.3, 0.18, '#1e1c1a');
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), cc = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) { g.computeVertexNormals(); pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); cc.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  return m;
}
