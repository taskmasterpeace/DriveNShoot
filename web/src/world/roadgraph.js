// THE ROAD GRAPH (docs/status/WORLD_CONNECTED.md): the streamed world's roads as one graph, built from the very ribbons the
// chunks pave (WorldIndex.ribbons: interstate carriageways, added lanes, ramps, cross roads, access roads, exit communities'
// streets, the usmap towns' streets, a holdout's roads). Answers: from a start, which places can you reach by road; which
// road ends go nowhere; where a road runs through water with no deck; which places reach the interstate only through a
// city; where a road's lanes break the lane rule. agent/roads-api.js drives it for real (`roads action=trip`).
//
// Nodes: a ribbon's points every ~10 m, at the centre of its pavement (a carriageway's stored line is its median edge).
// Edges: along a ribbon (one-way roads - a carriageway, a ramp, an added lane - cost 25x driven backwards), and between
// ribbons wherever their pavements touch at the same height (a ramp meeting the mainline, an access road leaving a cross
// road's end; a deck over the interstate is 7 m up, so it never joins the road under it).
import { inIsland } from './geo.js';
import { lanesFor } from '../data/lanes.js';

const ONE_WAY = new Set(['hwy', 'ramp', 'aux']);
const SKIP = new Set(['walk', 'yard', 'lot', 'white']);
export const GRAPH = { step: 10, cell: 32, join: 2.5, endJoin: 7, dy: 2.5, backCost: 25, wetDepth: 0.6, deadEndClear: 140 };

export function buildRoadGraph(W) {
  const t0 = performance.now();
  const nodes = [], adj = [], ribs = W.ribbons.filter((rb) => rb.n >= 2 && !SKIP.has(rb.band));
  const add = (o) => { nodes.push(o); adj.push([]); return nodes.length - 1; };
  const link = (a, b, wab, wba) => { adj[a].push([b, wab]); adj[b].push([a, wba]); };
  ribs.forEach((rb, ri) => {
    let prev = -1, lastS = -1e9;
    const oneWay = ONE_WAY.has(rb.band) || rb.mainline || rb.lane;
    rb._g0 = nodes.length;
    for (let i = 0; i < rb.n; i++) {
      if (i && i < rb.n - 1 && rb.s[i] - lastS < GRAPH.step) continue;
      const k0 = Math.max(0, i - 1), k1 = Math.min(rb.n - 1, i + 1), tx = rb.x[k1] - rb.x[k0], tz = rb.z[k1] - rb.z[k0], l = Math.hypot(tx, tz) || 1;
      const nx = -tz / l, nz = tx / l, c = (rb.wr[i] - rb.wl[i]) / 2;
      const id = add({ x: rb.x[i] + nx * c, z: rb.z[i] + nz * c, y: rb.y[i], h: (rb.wl[i] + rb.wr[i]) / 2, ri, end: i === 0 ? 'start' : i === rb.n - 1 ? 'end' : null, rib: rb });
      if (prev >= 0) { const d = Math.hypot(nodes[id].x - nodes[prev].x, nodes[id].z - nodes[prev].z); link(prev, id, d, oneWay ? d * GRAPH.backCost : d); }
      prev = id; lastS = rb.s[i];
    }
    rb._g1 = nodes.length;
  });
  // junctions: pavements that touch at the same height
  const cell = GRAPH.cell, H = new Map(), key = (cx, cz) => cx * 131071 + cz;
  nodes.forEach((n, i) => { const k = key(Math.floor(n.x / cell), Math.floor(n.z / cell)); let L = H.get(k); if (!L) H.set(k, (L = [])); L.push(i); });
  let joins = 0;
  for (let a = 0; a < nodes.length; a++) {
    const A = nodes[a], cx = Math.floor(A.x / cell), cz = Math.floor(A.z / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const b of H.get(key(cx + dx, cz + dz)) ?? []) {
      if (b <= a) continue;
      const B = nodes[b];
      if (B.ri === A.ri || Math.abs(A.y - B.y) > GRAPH.dy) continue;
      const d = Math.hypot(A.x - B.x, A.z - B.z);
      // a ribbon's end tapers to nothing where it merges (a ramp's gore, an added lane's taper): an end joins within
      // GRAPH.endJoin of the other pavement
      const tol = A.end || B.end ? GRAPH.endJoin : GRAPH.join;
      if (d < A.h + B.h + tol) { link(a, b, d + 1, d + 1); A.joined = B.joined = true; joins++; }
    }
  }
  return { nodes, adj, ribs, hash: H, cell, joins, ms: +(performance.now() - t0).toFixed(0) };
}

export function nearestNode(G, x, z, maxD = 200) {
  let best = -1, bd = maxD;
  const c = G.cell, r = Math.ceil(maxD / c), cx = Math.floor(x / c), cz = Math.floor(z / c), key = (a, b) => a * 131071 + b;
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (const i of G.hash.get(key(cx + dx, cz + dz)) ?? []) { const n = G.nodes[i], d = Math.hypot(n.x - x, n.z - z) - n.h; if (d < bd) { bd = d; best = i; } }
  return best;
}

// Dijkstra from a set of start nodes: dist and prev per node (a binary heap; the graph is ~10^5 nodes).
export function shortest(G, starts, avoid = null) {
  const N = G.nodes.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const heap = [], push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  for (const s of starts) if (s >= 0) { dist[s] = 0; push(0, s); }
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    for (const [j, w] of G.adj[i]) { if (avoid && avoid(j)) continue; const nd = d + w; if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push(nd, j); } }
  }
  return { dist, prev };
}
export function pathTo(S, j) { const out = []; for (let k = j; k >= 0; k = S.prev[k]) out.push(k); return out.reverse(); }

// Every place you can go into, where its road should arrive (an access road's end at its entry; a usmap town's middle;
// a holdout's approach; an exit community's street).
export function destinations(W, plan) {
  const out = [];
  const region = (x, z) => (W.regionOf?.(x, z)?.id === 'florida' ? 'florida' : 'arizona');
  for (const r of plan ?? []) {
    if (r.beyond || !(r.kind === 'town' || r.kind === 'site' || r.kind === 'base') || !W.inWorld(r.x, r.z, -50)) continue;
    const e = r.access?.entry;
    out.push({ id: r.id, name: r.name, kind: r.kind === 'town' && r.major ? 'metro' : r.kind, x: e?.x ?? r.x, z: e?.z ?? r.z, cx: r.x, cz: r.z, reach: e ? 60 : r.half, region: region(r.x, r.z), exit: r.access?.number ?? null });
  }
  for (const t of W.towns ?? []) if (t.built) out.push({ id: t.id, name: t.name, kind: t.kind === 'city' ? 'city' : 'town', x: t.x, z: t.z, cx: t.x, cz: t.z, reach: 420, region: region(t.x, t.z), usmap: true });
  for (const H of W.holdouts ?? []) { const a = H.approach ?? { x: H.cx, z: H.cz }; out.push({ id: H.row?.id ?? H.id ?? 'holdout', name: H.row?.name ?? H.name ?? 'HOLDOUT', kind: 'holdout', x: a.x, z: a.z, cx: H.cx, cz: H.cz, reach: 120, region: region(H.cx, H.cz) }); }
  for (const X of W.exits ?? []) if (X.community) out.push({ id: `${X.id}-community`, name: X.name, kind: 'exit community', x: X.dest.x, z: X.dest.z, cx: X.dest.x, cz: X.dest.z, reach: 60, region: region(X.dest.x, X.dest.z) });
  out.push({ id: 'phoenix', name: 'RUST HAVEN (PHOENIX)', kind: 'city', x: 0, z: -470, cx: 0, cz: 0, reach: 700, region: 'arizona' });
  return out;
}

// The whole audit. starts: { arizona: {x,z}, florida: {x,z} }.
export function auditWorld(W, plan, starts) {
  const G = buildRoadGraph(W), D = destinations(W, plan);
  const startNode = {}, reach = {};
  for (const [rg, p] of Object.entries(starts)) { startNode[rg] = nearestNode(G, p.x, p.z, 900); reach[rg] = shortest(G, [startNode[rg]]); }
  const places = D.map((q) => {
    const n = nearestNode(G, q.x, q.z, q.reach), by = Object.keys(reach).find((rg) => n >= 0 && reach[rg].dist[n] < Infinity) ?? null;
    return { ...q, node: n, onRoad: n >= 0, reached: !!by, from: by, km: by ? +(reach[by].dist[n] / 1000).toFixed(1) : null };
  });
  // road ends that go nowhere: a ribbon end with no join, not at a place, a town, the island or the world's edge
  const deadEnds = [];
  for (const [i, n] of G.nodes.entries()) {
    if (!n.end || n.joined || G.adj[i].length > 1) continue;
    const at = D.find((q) => Math.hypot(q.x - n.x, q.z - n.z) < GRAPH.deadEndClear + (q.usmap ? 300 : 0) || Math.hypot(q.cx - n.x, q.cz - n.z) < 450);
    const edge = !W.inWorld(n.x, n.z, -2500), isl = inIsland(n.x, n.z, 300) || W.ring?.inCity?.(n.x, n.z, 100);
    const rec = W.citygen?.recAt?.(n.x, n.z, 80), site = W.roadside?.nearSite?.(n.x, n.z, 200);
    if (at || edge || isl || rec || site) continue;
    // an exit's cross road runs 300 m past the bridge on both sides; on a side with no town it stops in the open (a stub)
    const kind = / cross road$/.test(n.rib.id) ? 'stub' : 'dead end';
    deadEnds.push({ road: n.rib.id, kind, x: Math.round(n.x), z: Math.round(n.z), region: W.regionOf?.(n.x, n.z)?.id ?? 'arizona' });
  }
  // water: a road point under water deeper than a car can ford, with no deck under it
  const wet = [];
  for (const rb of G.ribs) {
    let run = null;
    for (let i = rb._g0; i < rb._g1; i++) {
      const n = G.nodes[i], gy = W.groundAt?.(n.x, n.z) ?? 0;
      // a deck carries the road at its own height: ask the water at the road (and on I-10, the bridge record)
      const deck = (rb.mainline && !rb.cor && W.water?.onBridge?.(W.project(n.x, n.z, 60).s, 20)) || W.water?.deckAt?.(n.x, n.z, gy + n.y + 0.3) >= 0;
      const d = deck ? 0 : W.depthAt?.(n.x, n.z, gy + n.y + 0.05) ?? 0;
      if (d > GRAPH.wetDepth) { if (!run) run = { road: rb.id, x: Math.round(n.x), z: Math.round(n.z), m: 0, depth: 0 }; run.m += GRAPH.step; run.depth = Math.max(run.depth, +d.toFixed(2)); }
      else if (run) { wet.push(run); run = null; }
    }
    if (run) wet.push(run);
  }
  // places that reach the interstate only through a city: drop every node inside a city (a usmap city, a metro, the
  // island and ring) and see if the place still reaches an interstate carriageway
  const cities = new Set((W.towns ?? []).filter((t) => t.kind === 'city').map((t) => `ST-${t.id}-`));
  const cityAt = (n) => inIsland(n.x, n.z, 200) || W.ring?.inCity?.(n.x, n.z, 0) || [...cities].some((p) => n.rib.id.startsWith(p));
  const mainline = new Set(); G.nodes.forEach((n, i) => { if (n.rib.mainline) mainline.add(i); });
  const onlyCity = [];
  for (const q of places) {
    if (!q.onRoad || q.kind === 'city' || q.kind === 'metro') continue;
    const S = shortest(G, [q.node], (j) => cityAt(G.nodes[j]) && !mainline.has(j));
    let ok = false; for (const j of mainline) if (S.dist[j] < Infinity) { ok = true; break; }
    q.toInterstate = ok;
    if (!ok) onlyCity.push({ id: q.id, name: q.name });
  }
  // lanes against the rule: an interstate sample whose built lanes differ from the rule with no reason held on record,
  // and a town road whose lanes differ from the rule
  const laneBreaks = [];
  for (const cor of [W.i10, ...(W.corridors ?? []).filter((c) => c !== W.i10)]) for (const p of cor?.laneProfile ?? []) if (p.built !== p.rule && !p.held) laneBreaks.push({ road: cor.id, mile: +(p.s / 1609.344).toFixed(1), rule: p.rule, built: p.built });
  for (const rb of W.ribbons) if (rb.town && rb.lanes && rb.laneWhy && rb.lanes !== (rb.band === 'street' ? 1 : 2)) laneBreaks.push({ road: rb.id, rule: rb.lanes, built: rb.band === 'street' ? 1 : 2 });
  const held = {}; for (const cor of [W.i10, ...(W.corridors ?? []).filter((c) => c !== W.i10)]) for (const p of cor?.laneProfile ?? []) if (p.held) held[p.held] = (held[p.held] ?? 0) + 1;
  return { graph: { nodes: G.nodes.length, ribbons: G.ribs.length, joins: G.joins, ms: G.ms }, starts: Object.fromEntries(Object.entries(starts).map(([k, p]) => [k, { ...p, node: startNode[k] }])),
    places, unreachable: places.filter((q) => !q.reached), deadEnds, wet, onlyCity, laneBreaks, laneHeld: held, G, reach };
}
export { lanesFor };
