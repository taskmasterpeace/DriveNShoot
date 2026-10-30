// THE TRAVEL MATH (docs/design/WEB_WORLD_TOOLS.md §3.1, §4.1): real distances between real places on the compressed map.
// One road graph, two kinds of line:
//   BUILT    every streamed corridor (I-10 from W.cl, each region's interstates from cor.cl): the road you actually drive,
//            meander, fillets and all, in world metres; its exits hang off it at their own s with their access roads
//   NATIONAL every usmap interstate (where no built corridor of that road covers it), county and dirt road, at x K and
//            the class's sinuosity (data/worldtools.js ROAD_CLASSES), so a trip past the streamed world is priced too
// Places are towns, holdouts and exits (by id or name), or `x,z` world metres. A trip is a Dijkstra on time for the vehicle
// row and the mode; it answers distance, game miles, minutes, litres, tanks, and how far one tank gets on each class.
// Pure: no game, no three.js (the forge page and node build it too).
import { ROAD_CLASSES, FUEL_LAW, SETTLE, OFFROAD, MODES, MEASURED, NET_RULES, GAME_MILE } from '../data/worldtools.js';
import { toWorld, toUsmap } from './geo.js';

const CELL = 512; // spatial hash for node merging and segment lookups (world m)
const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;

export class TravelNet {
  // W: a WorldIndex (built corridors, towns, exits, regions); vehicles: VEHICLES rows (systems/vehicles.js).
  constructor(W, vehicles) {
    this.W = W; this.V = vehicles ?? {}; this.K = W?.K ?? 5.2;
    this.nodes = []; this.adj = []; this.edges = []; this.places = new Map(); this.lines = [];
    this.build();
  }

  // ---- the graph -------------------------------------------------------------------------------------------------------
  build() {
    const W = this.W, D = W.data, K = this.K;
    const built = [];
    if (W.cl) built.push({ id: 'I-10', cl: W.cl, cor: W.i10 });
    for (const R of Object.values(W.regions ?? {})) for (const cor of R.corridors ?? []) built.push({ id: cor.id, cl: cor.cl, cor });
    for (const b of built) {
      const c = b.cl, pts = [];
      const step = Math.max(1, Math.round(250 / ((c.L / (c.n - 1)) || 1)));
      for (let i = 0; i < c.n; i += step) pts.push([c.x[i], c.z[i]]);
      if (pts.length < 2 || pts[pts.length - 1][0] !== c.x[c.n - 1]) pts.push([c.x[c.n - 1], c.z[c.n - 1]]);
      this.lines.push({ id: b.id, cls: 'interstate', built: true, pts, cor: b.cor, sin: 1 });
    }
    // A usmap interstate segment is covered where a built corridor of the same road runs within 2.5 km of its midpoint
    // inside the streamed world: the built line answers there.
    const covered = (id, x, z) => W.inWorld?.(x, z, 0) && built.some((b) => b.id === id && (b.cor?.project ? b.cor.project(x, z, 2500).d : W.project(x, z, 2500).d) < 2500);
    for (const r of D.interstates) {
      let run = [];
      const flush = () => { if (run.length >= 2) this.lines.push({ id: r.id, cls: 'interstate', pts: run, sin: ROAD_CLASSES.interstate.sinuosity }); run = []; };
      const P = r.pts.map((p) => toWorld(p));
      for (let i = 0; i < P.length; i++) {
        const cov = i > 0 && covered(r.id, (P[i][0] + P[i - 1][0]) / 2, (P[i][1] + P[i - 1][1]) / 2);
        if (cov) { flush(); continue; }
        if (!run.length && i > 0) run.push(P[i - 1]);
        run.push(P[i]);
      }
      flush();
    }
    for (const r of D.roads ?? []) {
      const cls = r.kind === 'dirt' ? 'dirt' : 'county';
      this.lines.push({ id: r.id, cls, pts: r.pts.map((p) => toWorld(p)), sin: ROAD_CLASSES[cls].sinuosity });
    }
    // T-junctions: a line's end within snap of another line's middle gets a vertex there (both meet the same node).
    const snap = NET_RULES.snap * K;
    const segIdx = new Map();
    this.lines.forEach((L, li) => { for (let i = 1; i < L.pts.length; i++) { const [ax, az] = L.pts[i - 1], [bx, bz] = L.pts[i]; for (let gx = Math.floor((Math.min(ax, bx) - snap) / CELL); gx <= Math.floor((Math.max(ax, bx) + snap) / CELL); gx++) for (let gz = Math.floor((Math.min(az, bz) - snap) / CELL); gz <= Math.floor((Math.max(az, bz) + snap) / CELL); gz++) { const k = `${gx},${gz}`; if (!segIdx.has(k)) segIdx.set(k, []); segIdx.get(k).push([li, i]); } } });
    const inserts = new Map(); // line index -> [{i, t, pt}]
    this.lines.forEach((L, li) => {
      for (const p of [L.pts[0], L.pts[L.pts.length - 1]]) {
        let best = null;
        for (const [lj, j] of segIdx.get(key(p[0], p[1])) ?? []) {
          if (lj === li) continue;
          const A = this.lines[lj].pts[j - 1], B = this.lines[lj].pts[j], q = segPt(p[0], p[1], A[0], A[1], B[0], B[1]);
          if (q.d < snap && q.t > 0.01 && q.t < 0.99 && (!best || q.d < best.d)) best = { lj, j, ...q };
        }
        if (best) { if (!inserts.has(best.lj)) inserts.set(best.lj, []); inserts.get(best.lj).push({ i: best.j, t: best.t, pt: [best.x, best.y] }); }
      }
    });
    for (const [lj, list] of inserts) { list.sort((a, b) => b.i - a.i || b.t - a.t); for (const q of list) this.lines[lj].pts.splice(q.i, 0, q.pt); }
    // Nodes: vertices merged within snap (the forge's dead-end rule), so roads that end at each other meet.
    const grid = new Map();
    const nodeAt = (x, z, r = snap) => {
      const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
      let best = -1, bd = r;
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) for (const n of grid.get(`${gx + ox},${gz + oz}`) ?? []) { const d = Math.hypot(this.nodes[n].x - x, this.nodes[n].z - z); if (d < bd) { bd = d; best = n; } }
      if (best >= 0) return best;
      const id = this.nodes.length; this.nodes.push({ x, z }); this.adj.push([]);
      const k = key(x, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(id);
      return id;
    };
    this.nodeAt = nodeAt;
    for (const L of this.lines) {
      L.nodes = L.pts.map((p) => nodeAt(p[0], p[1], L.built ? 8 : snap));
      for (let i = 1; i < L.pts.length; i++) this.addEdge(L.nodes[i - 1], L.nodes[i], Math.hypot(L.pts[i][0] - L.pts[i - 1][0], L.pts[i][1] - L.pts[i - 1][1]) * L.sin, L.cls, L.id, L.built);
    }
    // A built corridor's ends meet the national line of the same road (the uncovered usmap vertex nearest each end).
    for (const L of this.lines.filter((q) => q.built)) for (const e of [L.nodes[0], L.nodes[L.nodes.length - 1]]) {
      if (this.adj[e].length > 1) continue;
      let best = -1, bd = NET_RULES.joinBuilt * K;
      for (const M of this.lines) if (!M.built && M.id === L.id) for (const n of M.nodes) { const d = Math.hypot(this.nodes[n].x - this.nodes[e].x, this.nodes[n].z - this.nodes[e].z); if (d < bd) { bd = d; best = n; } }
      if (best >= 0 && best !== e) this.addEdge(e, best, bd * ROAD_CLASSES.interstate.sinuosity, 'interstate', L.id, false);
    }
    // Exits on built corridors: a node on the corridor at the exit's s (the nearest corridor vertex), then the ramp and its
    // access road to the community (as built: the access ribbon's length when it has one).
    this.exitNodes = [];
    for (const L of this.lines.filter((q) => q.built)) for (const X of (L.cor === W.i10 ? (W.exits ?? []).filter((q) => !q.cor || q.cor === W.i10) : L.cor?.exits ?? [])) {
      const on = this.nearestOnLine(L, X.x, X.z);
      const acc = X.access, accLen = acc ? ribbonLen(acc) : Math.hypot(X.dest.x - X.x, X.dest.z - X.z);
      const d = nodeAt(X.dest.x, X.dest.z, 30);
      this.addEdge(on, d, 600 + accLen, 'ramp', `${X.id} ramp`, true);
      const P = { kind: 'exit', id: X.id, name: X.name, number: X.number, x: X.dest.x, z: X.dest.z, node: d, road: L.id, built: true };
      this.exitNodes.push(P); this.addPlace(P);
    }
    // Towns and holdouts: reached by a street from the nearest node (within townReach).
    for (const t of W.towns ?? []) {
      const n = this.nearestNode(t.x, t.z, NET_RULES.townReach * K);
      if (n < 0) continue;
      const tn = nodeAt(t.x, t.z, 1);
      if (tn !== n) this.addEdge(tn, n, Math.hypot(this.nodes[n].x - t.x, this.nodes[n].z - t.z), 'street', `${t.id} streets`, !!t.built);
      this.addPlace({ kind: t.holdout ? 'holdout' : t.kind === 'city' ? 'city' : 'town', id: t.id, name: t.name, x: t.x, z: t.z, node: tn, built: !!t.built || !!t.holdout || t.id === 'phoenix' });
    }
    this.counts = { nodes: this.nodes.length, edges: this.edges.length, lines: this.lines.length, built: this.lines.filter((q) => q.built).length, places: new Set(this.places.values()).size };
  }
  addEdge(a, b, len, cls, road, built) {
    if (a === b || !(len > 0)) return;
    const e = { a, b, len, cls, road, built: !!built };
    this.edges.push(e); this.adj[a].push(e); this.adj[b].push(e);
  }
  addPlace(P) { for (const k of [P.id, P.name].filter(Boolean)) this.places.set(String(k).toLowerCase(), P); }
  nearestNode(x, z, maxD = Infinity) { let best = -1, bd = maxD; for (let i = 0; i < this.nodes.length; i++) { if (!this.adj[i].length) continue; const d = Math.hypot(this.nodes[i].x - x, this.nodes[i].z - z); if (d < bd) { bd = d; best = i; } } return best; }
  nearestOnLine(L, x, z) { let best = L.nodes[0], bd = Infinity; L.nodes.forEach((n, i) => { const d = Math.hypot(L.pts[i][0] - x, L.pts[i][1] - z); if (d < bd) { bd = d; best = n; } }); return best; }

  // A place by id, name (any case), "exit N", or "x,z" world metres.
  place(q) {
    if (q && typeof q === 'object' && Number.isFinite(q.x)) { const n = this.nearestNode(q.x, q.z); return n < 0 ? null : { kind: 'point', id: `${Math.round(q.x)},${Math.round(q.z)}`, name: `${Math.round(q.x)}, ${Math.round(q.z)}`, x: q.x, z: q.z, node: n, off: Math.hypot(this.nodes[n].x - q.x, this.nodes[n].z - q.z) }; }
    const s = String(q ?? '').trim().toLowerCase();
    const m = s.match(/^(-?[\d.]+)\s*,\s*(-?[\d.]+)$/);
    if (m) return this.place({ x: +m[1], z: +m[2] });
    if (this.places.has(s)) return this.places.get(s);
    for (const [k, P] of this.places) if (k.includes(s)) return P;
    return null;
  }

  // ---- the vehicle on a road class ---------------------------------------------------------------------------------------
  // What a vehicle row holds on a class in a mode: { v m/s, throttle 0..1, lps litres/s, lpm litres/metre }.
  pace(vkey, cls, mode = 'cruise') {
    const row = this.V[vkey]; if (!row) return null;
    const top = row.maxSpeed * (SETTLE[vkey] ?? SETTLE.other), C = ROAD_CLASSES[cls] ?? ROAD_CLASSES.county;
    const cap = (C.cap ?? Infinity) * (OFFROAD[vkey]?.[cls] ?? 1), target = MODES[mode]?.target ?? MODES.cruise.target;
    const v = Math.max(0.5, Math.min(top, cap, target));
    const throttle = Math.min(1, Math.pow(v / top, MEASURED.throttleExp) + C.throttle);
    const lps = row.fuelCap > 0 && !row.noEngine ? FUEL_LAW.idle + FUEL_LAW.perThrottle * throttle : 0;
    return { v, top, throttle, lps, lpm: lps / v };
  }

  // ---- a trip --------------------------------------------------------------------------------------------------------------
  trip(from, to, vkey = 'interceptor', mode = 'cruise') {
    const A = this.place(from), B = this.place(to), row = this.V[vkey];
    if (!A) return { ok: false, error: `no place "${from}"`, hint: 'a town or holdout id or name, an exit name, or x,z world metres' };
    if (!B) return { ok: false, error: `no place "${to}"`, hint: 'a town or holdout id or name, an exit name, or x,z world metres' };
    if (!row) return { ok: false, error: `no vehicle "${vkey}"`, hint: `one of ${Object.keys(this.V).join(', ')}` };
    if (row.boat) return { ok: false, error: `${row.name} is a boat`, hint: 'the road graph is for land vehicles' };
    const paces = Object.fromEntries(Object.keys(ROAD_CLASSES).map((c) => [c, this.pace(vkey, c, mode)]));
    // Dijkstra on time (a binary heap)
    const N = this.nodes.length, T = new Float64Array(N).fill(Infinity), prev = new Array(N).fill(null);
    T[A.node] = 0;
    const heap = [[0, A.node]];
    while (heap.length) {
      const [t, n] = hpop(heap);
      if (t > T[n]) continue;
      if (n === B.node) break;
      for (const e of this.adj[n]) { const m = e.a === n ? e.b : e.a, nt = t + e.len / paces[e.cls].v; if (nt < T[m]) { T[m] = nt; prev[m] = e; hpush(heap, [nt, m]); } }
    }
    if (!Number.isFinite(T[B.node])) return { ok: false, error: `no road from ${A.name} to ${B.name}`, hint: 'the two places are on parts of the network that do not meet (mapCheck kind=deadends)' };
    const legs = [];
    for (let n = B.node; n !== A.node;) { const e = prev[n]; legs.push(e); n = e.a === n ? e.b : e.a; }
    legs.reverse();
    let dist = 0, time = 0, fuel = 0, builtM = 0;
    const byClass = {}, roads = [];
    const path = [[this.nodes[A.node].x, this.nodes[A.node].z]];
    let cur = A.node;
    for (const e of legs) {
      const p = paces[e.cls], s = e.len / p.v;
      dist += e.len; time += s; fuel += p.lps * s; if (e.built) builtM += e.len;
      const b = (byClass[e.cls] ??= { km: 0, minutes: 0, litres: 0, mps: +p.v.toFixed(1) });
      b.km += e.len / 1000; b.minutes += s / 60; b.litres += p.lps * s;
      if (roads[roads.length - 1] !== e.road) roads.push(e.road);
      cur = e.a === cur ? e.b : e.a; path.push([this.nodes[cur].x, this.nodes[cur].z]);
    }
    for (const b of Object.values(byClass)) { b.km = +b.km.toFixed(2); b.minutes = +b.minutes.toFixed(1); b.litres = +b.litres.toFixed(1); }
    const cap = row.fuelCap ?? 0;
    const range = Object.fromEntries(Object.entries(paces).filter(([, p]) => p.lpm > 0).map(([c, p]) => [c, +((cap / p.lpm) / 1000).toFixed(1)]));
    return {
      ok: true, from: { id: A.id, name: A.name, kind: A.kind }, to: { id: B.id, name: B.name, kind: B.kind }, vehicle: vkey, vehicleName: row.name, mode,
      km: +(dist / 1000).toFixed(2), miles: +(dist / GAME_MILE).toFixed(1), minutes: +(time / 60).toFixed(1), litres: +fuel.toFixed(1),
      tank: cap, tanks: cap > 0 ? +(fuel / cap).toFixed(2) : null, oneTank: cap > 0 ? fuel <= cap : null, refuels: cap > 0 ? Math.max(0, Math.ceil(fuel / cap) - 1) : null,
      rangeKm: range, built: +(builtM / Math.max(1, dist)).toFixed(2), byClass, roads, legs: legs.length,
      path: thin(path, 40), pathUsmap: thin(path, 40).map((p) => toUsmap(p[0], p[1]).map((v) => Math.round(v))),
    };
  }

  // The table Robert asked for: every pair of the given places for each vehicle (cruise and flat out).
  table(places, vehicles, modes = ['cruise', 'flat']) {
    const rows = [];
    for (let i = 0; i < places.length; i++) for (let j = i + 1; j < places.length; j++) for (const v of vehicles) for (const m of modes) {
      const r = this.trip(places[i], places[j], v, m);
      rows.push(r.ok ? { from: r.from.name, to: r.to.name, vehicle: r.vehicleName, mode: m, km: r.km, miles: r.miles, minutes: r.minutes, litres: r.litres, tanks: r.tanks, built: r.built } : { from: places[i], to: places[j], vehicle: v, mode: m, error: r.error });
    }
    return rows;
  }
}

function ribbonLen(r) { let L = 0; for (let i = 1; i < r.n; i++) L += Math.hypot(r.x[i] - r.x[i - 1], r.z[i] - r.z[i - 1]); return L; }
function segPt(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t, y = az + dz * t;
  return { t, x, y, d: Math.hypot(px - x, pz - y) };
}
function thin(path, n) { if (path.length <= n) return path.map((p) => [Math.round(p[0]), Math.round(p[1])]); const out = []; for (let i = 0; i < n; i++) { const p = path[Math.round((i / (n - 1)) * (path.length - 1))]; out.push([Math.round(p[0]), Math.round(p[1])]); } return out; }
function hpush(h, v) { h.push(v); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
function hpop(h) { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top; }
