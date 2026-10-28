// ROAD KIT v1 (2026-10-03): expressways, ramps and junctions as Lego. Pure data + pure functions
// (no DOM, no THREE, no storage, no Math.random). Companion files: road-kit-roadside.js (the scenes beside
// the road) and road-kit-wild.js (the clear encounter slots in the gaps). Docs: docs/ROADKIT.md.
//
// THE SEAM RULE (order independent, like edgeContract in world-district.js):
//   Every cell edge has ONE road state, found by a canonical key (edgeKey): the same edge seen from either
//   cell is the same key, so the same class. A cell's module is a pure function of its FOUR edge states plus
//   a position-seeded roll (seed, i, k). Nothing reads a neighbour's module, nothing depends on build order,
//   so two neighbours cannot disagree by construction (the Wang-tile trick), and changing one edge re-picks
//   only the two cells that touch it. Ports sit at EDGE MIDPOINTS (between-cities.js portOf) and each class
//   fixes its lane offsets, so a port is fully described by (side, class).
//
// MODULES (kind): empty · stub (road ends) · straight · curve · transition (class change, the city-exit
//   taper) · hub (at-grade junction of any classes) · exit (freeway + a lower branch: off-ramp and on-ramp
//   pairs to an overpassing road: a diamond with a missing arm) · diamond · cloverleaf (loops + outer ramps)
//   · overpass (grade separation, no connection).
// Frame: cell-local u, x east, z south, y up, -672..672 (1u = 0.19 m). Right-hand traffic. A path is
//   { id, role, cls, oneWay, points:[{x,z,y?}] }; oneWay paths run in their travel direction.
import { ROAD_CLASSES } from './world-engine/between-cities.js';
import { WORLD_CELL_SIZE } from './world-address.js';

export const ROAD_KIT_VERSION = 1;
export const H = WORLD_CELL_SIZE / 2;
export const SIDES = Object.freeze(['north', 'east', 'south', 'west']);
export const OPPOSITE = Object.freeze({ north: 'south', south: 'north', east: 'west', west: 'east' });
export const LANE_W = 19;
export const DECK_H = 32;                       // overpass deck height (u, ~6 m)

// ---- classes -------------------------------------------------------------------------------------------------
const SHOULDER = { interstate: 24, divided: 14, 'two-lane': 8, rural: 0, dirt: 0, street: 0 };
const KRANK = { interstate: 6, divided: 5, 'two-lane': 4, street: 3, rural: 2, dirt: 1 };
function mk(id, c) {
  const divided = !!c.divided, sh = SHOULDER[id] ?? 0, lanes = c.lanes ?? 2;
  const width = c.width ?? lanes * LANE_W + 2 * sh;
  const half = divided ? c.median / 2 + (lanes / 2) * LANE_W + sh : width / 2 + (c.sidewalk || 0);
  const off = divided ? c.median / 2 + (lanes / 2) * LANE_W / 2 : 0;      // centre of each carriageway
  return Object.freeze({ id, label: c.label, rank: KRANK[id], lanes, divided, median: c.median ?? 0, shoulder: sh, width, sidewalk: c.sidewalk || 0,
    half, off, clearZone: c.clearZone, lighting: c.lighting ?? 'none', meander: c.meander ?? [0, 0] });
}
/** The kit's edge classes: the road ladder (between-cities.js ROAD_CLASSES) + the city street. */
export const KIT_CLASSES = Object.freeze({
  interstate: mk('interstate', ROAD_CLASSES.interstate), divided: mk('divided', ROAD_CLASSES.divided), 'two-lane': mk('two-lane', ROAD_CLASSES['two-lane']),
  street: mk('street', { label: 'City street', lanes: 2, width: 42, sidewalk: 9, clearZone: 6, meander: [0, 0] }),
  rural: mk('rural', ROAD_CLASSES.rural), dirt: mk('dirt', ROAD_CLASSES.dirt),
});
export const EDGE_CLASS_IDS = Object.freeze(Object.keys(KIT_CLASSES));
export const FREEWAY_RANK = 5;                 // divided and up get grade separation
export const RAMP = Object.freeze({ id: 'ramp', rank: 0, lanes: 1, width: 36, half: 18 });
export const isFreeway = c => !!c && KIT_CLASSES[c].rank >= FREEWAY_RANK;
export const rankOf = c => (c ? KIT_CLASSES[c].rank : 0);

// ---- position-seeded rolls (shared by the three kit files) ----------------------------------------------------
export const fnv = s => { s = String(s); let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
export const rollOf = (...k) => { let a = fnv(k.join('|')); a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const lerp = (a, b, t) => a + (b - a) * t, clamp01 = t => Math.max(0, Math.min(1, t)), ss = t => { t = clamp01(t); return t * t * (3 - 2 * t); };

// ---- edges: the seam rule ----------------------------------------------------------------------------------------
/** Canonical key of the edge a cell side touches: identical from both cells. 'h' = the edge east of (i,k), 'v' = the edge south of (i,k). */
export function edgeKey(i, k, side) {
  if (side === 'east') return `h:${i},${k}`;
  if (side === 'west') return `h:${i - 1},${k}`;
  if (side === 'south') return `v:${i},${k}`;
  return `v:${i},${k - 1}`;
}
export const edgesOf = (field, i, k) => ({ north: field(i, k, 'north') || null, east: field(i, k, 'east') || null, south: field(i, k, 'south') || null, west: field(i, k, 'west') || null });
/** An edge field from a map of canonical keys -> class. */
export const fieldFromMap = map => (i, k, side) => map.get(edgeKey(i, k, side)) || null;
/** A deterministic random edge field (tests, wild land): class per CANONICAL edge key, so it is symmetric by construction. */
export function hashEdgeField(seed, { density = 0.55, classes = EDGE_CLASS_IDS } = {}) {
  return (i, k, side) => { const key = edgeKey(i, k, side); if (rollOf(seed, 'edge', key) >= density) return null; return classes[Math.floor(rollOf(seed, 'edgeclass', key) * classes.length)]; };
}
const DISTRICT_TYPE_CLASS = { highway: 'divided', asphalt: 'street', residential: 'street', dirt: 'dirt' };
/** Adapter: the edge class a generated CITY cell offers on a side (world-district.js edgeContract, centre line only: ports sit at midpoints). */
export function districtEdgeClass(edgeContract, i, k, side) {
  const c = edgeContract(i, k, side).find(p => p.at === 0);
  return c ? (DISTRICT_TYPE_CLASS[c.type] || 'street') : null;
}

// ---- geometry helpers ----------------------------------------------------------------------------------------------
const r3 = v => Math.round(v * 1000) / 1000;
const pt = (x, z, y) => (y ? { x: r3(x), z: r3(z), y: r3(y) } : { x: r3(x), z: r3(z) });
const rotPt = (p, n) => { let { x, z } = p; for (let q = 0; q < n; q++) [x, z] = [-z, x]; const o = { x: r3(x + 0), z: r3(z + 0) }; if (p.y) o.y = p.y; return o; };
export const rotSide = (s, n) => SIDES[(SIDES.indexOf(s) + n) % 4];
const rotFor = (canon, actual) => (SIDES.indexOf(actual) - SIDES.indexOf(canon) + 4) % 4;
const MID = { north: { x: 0, z: -H }, east: { x: H, z: 0 }, south: { x: 0, z: H }, west: { x: -H, z: 0 } };
const INWARD = { north: [0, 1], east: [-1, 0], south: [0, -1], west: [1, 0] };
/** Port point of a side for a lane offset measured to the RIGHT of an inbound car. */
export function portPoint(side, off) { const [nx, nz] = INWARD[side], rx = -nz, rz = nx; return { x: MID[side].x + rx * off, z: MID[side].z + rz * off }; }
/** Lane list of a class: inbound-right offsets. dir: 'in' (towards the cell, offset +o), 'out' (offset -o), 'both' (centre). */
export function laneList(cls) { const c = KIT_CLASSES[cls]; return c.divided ? [{ off: c.off, dir: 'in' }, { off: -c.off, dir: 'out' }] : [{ off: 0, dir: 'both' }]; }
const bez = (a, b, c, d, n = 14) => { const o = []; for (let q = 0; q <= n; q++) { const t = q / n, u = 1 - t; o.push(pt(u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1])); } return o; };
const line = (a, b, n = 8) => { const o = []; for (let q = 0; q <= n; q++) o.push(pt(lerp(a[0], b[0], q / n), lerp(a[1], b[1], q / n))); return o; };
const arc = (cx, cz, r, a0, a1, n = 18) => { const o = []; for (let q = 0; q <= n; q++) { const a = lerp(a0, a1, q / n); o.push(pt(cx + r * Math.cos(a), cz + r * Math.sin(a))); } return o; };
const P = (id, role, cls, points, oneWay = false, extra = {}) => ({ id, role, cls, oneWay, points, ...extra });
const deckY = z => DECK_H * ss((300 - Math.abs(z)) / 130);

// ---- canonical generators (west = main in, then rotated into place) --------------------------------------------------
const along = (cls, role, tag, f, n = 24) => laneList(cls).map(l => {   // f(x, laneOff) -> z, for x -H..H on the canonical west->east frame
  const o = l.off, pts = []; for (let q = 0; q <= n; q++) { const x = lerp(-H, H, q / n); pts.push(pt(x, f(x, o))); }
  return l.dir === 'out' ? P(`${tag}:${l.dir}`, role, cls, pts.reverse(), true) : P(`${tag}:${l.dir}`, role, cls, pts, l.dir === 'in');
});
function genStraight(cls, seed, i, k) {
  const c = KIT_CLASSES[cls], [lo, hi] = c.meander, amp = (lo + (hi - lo) * rollOf(seed, 'meander', i, k)) * (rollOf(seed, 'msign', i, k) < 0.5 ? -1 : 1);
  return { paths: along(cls, 'main', 'main', (x, o) => o + amp * Math.pow(Math.sin(Math.PI * (x + H) / (2 * H)), 2)), meander: { amp: r3(amp) } };
}
function genCurve(cls) {                       // canonical west + south, arc about the SW corner
  const c = KIT_CLASSES[cls], paths = [];
  for (const l of laneList(cls)) {
    const R = H - l.off, ang = []; for (let q = 0; q <= 20; q++) { const t = (q / 20) * Math.PI / 2; ang.push(pt(-H + R * Math.sin(t), H - R * Math.cos(t))); }
    paths.push(l.dir === 'out' ? P(`curve:${l.dir}`, 'main', cls, ang.reverse(), true) : P(`curve:${l.dir}`, 'main', cls, ang, l.dir === 'in'));
  }
  return { paths, features: [{ kind: 'bend', at: pt(-H * 0.3, H * 0.3), radius: H - c.off }] };
}
function genStub(cls) {
  const c = KIT_CLASSES[cls], paths = [], feats = [];
  for (const l of laneList(cls)) {
    const end = c.divided ? -200 : -10, pts = line([-H, l.off], [end, l.off]);
    paths.push(l.dir === 'out' ? P(`stub:${l.dir}`, 'main', cls, pts.reverse(), true) : P(`stub:${l.dir}`, 'main', cls, pts, l.dir === 'in'));
  }
  feats.push(c.divided ? { kind: 'road-end', at: pt(-200, 0), note: 'barrier: the road ends (a wild or unfinished arm)' } : { kind: 'turnaround', at: pt(0, 0), radius: 44 });
  return { paths, features: feats };
}
function genTransition(a, b) {                  // canonical: west class a (higher rank), east class b
  const A = KIT_CLASSES[a], B = KIT_CLASSES[b], paths = [], feats = [];
  const half = (id, role, cls, f, x0, x1, lane) => { const pts = []; for (let q = 0; q <= 14; q++) { const x = lerp(x0, x1, q / 14); pts.push(pt(x, f(x))); } return lane === 'out' ? P(id, role, cls, pts.reverse(), true) : P(id, role, cls, pts, lane === 'in'); };
  if (A.divided && B.divided) {
    for (const s of [1, -1]) { const f = x => s * lerp(A.off, B.off, ss((x + 300) / 600)), d = s > 0 ? 'in' : 'out';
      paths.push(half(`tr:w:${d}`, 'main', a, f, -H, 0, d), half(`tr:e:${d}`, 'main', b, f, 0, H, d)); }
  } else if (A.divided) {
    for (const s of [1, -1]) { const d = s > 0 ? 'in' : 'out', f = x => s * lerp(A.off, 9.5, ss((x + 320) / 280)); paths.push(half(`tr:w:${d}`, 'taper', a, f, -H, -40, d)); }
    paths.push(P('tr:e:both', 'main', b, line([-40, 0], [H, 0]), false)); feats.push({ kind: 'carriageway-join', at: pt(-40, 0), note: 'two carriageways close up into one two-way road' });
  } else paths.push(P('tr:w:both', 'main', a, line([-H, 0], [0, 0]), false), P('tr:e:both', 'main', b, line([0, 0], [H, 0]), false));
  if (a === 'street' || b === 'street') feats.push({ kind: 'city-exit', at: pt(0, 0), note: 'the class changes where the city streets meet the country road', sign: 'CITY LIMIT', soundWall: isFreeway(a) || isFreeway(b) });
  feats.push({ kind: 'class-change', at: pt(0, 0), from: a, to: b });
  return { paths, features: feats };
}
function genHub(edges) {                        // at-grade junction of any classes: spokes to a hub disc
  const paths = [], feats = [], Rh = 70; let big = 0, bigCls = null;
  for (const s of SIDES) {
    const cls = edges[s]; if (!cls) continue; if (rankOf(cls) > big) { big = rankOf(cls); bigCls = cls; }
    const [nx, nz] = INWARD[s];
    for (const l of laneList(cls)) {
      const p0 = portPoint(s, l.off), p1 = { x: p0.x + nx * (H - Rh), z: p0.z + nz * (H - Rh) }, pts = line([p0.x, p0.z], [p1.x, p1.z], 6);
      paths.push(l.dir === 'out' ? P(`hub:${s}:${l.dir}`, 'spoke', cls, pts.reverse(), true) : P(`hub:${s}:${l.dir}`, 'spoke', cls, pts, l.dir === 'in'));
    }
  }
  feats.push({ kind: 'junction', at: pt(0, 0), radius: Rh, cls: bigCls, arms: SIDES.filter(s => edges[s]) });
  return { paths, features: feats };
}

// ---- crossing family: overpass / diamond / exit / cloverleaf ---------------------------------------------------------
// Canonical: main road W->E at ground, cross road N->S on a deck over it.
function crossPath(cls, lane, zTop, tag) {      // one cross-road lane with its deck profile, from zTop (north end) to +H
  const x = lane.dir === 'both' ? 0 : -lane.off, pts = [];   // canonical W->E lane (z=+o) rotates to a southbound lane at x=-o
  for (let z = zTop; z < H - 1; z += 54) pts.push(pt(x, z, deckY(z)));
  pts.push(pt(x, H, 0));
  if (zTop === -H) pts[0] = pt(x, -H, 0);
  return lane.dir === 'out' ? P(`${tag}:${lane.dir}`, 'deck', cls, pts.reverse(), true) : P(`${tag}:${lane.dir}`, 'deck', cls, pts, lane.dir === 'in');
}
function genCrossing(cm, cc, mode, { northArm = true } = {}) {
  const paths = [], feats = [], M = KIT_CLASSES[cm], C = KIT_CLASSES[cc], om = M.divided ? M.off : 0, oc = C.divided ? C.off : 0;
  paths.push(...along(cm, 'main', 'main', (x, o) => o));
  const zTop = northArm ? -H : -380;
  for (const l of laneList(cc)) paths.push(crossPath(cc, l, zTop, 'cross'));
  if (!northArm) feats.push({ kind: 'turnaround', at: pt(0, -380), radius: 44, note: 'the missing arm: the branch road ends here (this cell has no edge on that side)' });
  const T = 300;
  if (mode === 'diamond') {
    const R = (id, role, pts) => P(id, role, 'ramp', pts, true);
    // eastbound (south side, z=+om): off-ramp before the crossing to the south terminal, on-ramp after it
    paths.push(R('ramp:eb:off', 'offramp', bez([-470, om], [-300, om], [-150, T], [0, T])), R('ramp:eb:on', 'onramp', bez([0, T], [150, T], [320, om], [470, om])),
      R('ramp:wb:off', 'offramp', bez([470, -om], [300, -om], [150, -T], [0, -T])), R('ramp:wb:on', 'onramp', bez([0, -T], [-150, -T], [-320, -om], [-470, -om])));
    for (const [x, z, n] of [[0, T, 'S'], [0, -T, 'N']]) feats.push({ kind: 'ramp-terminal', at: pt(x, z), note: `${n} ramp terminal (signal/stop)` });
    feats.push({ kind: 'gore', at: pt(-470, om), note: 'diverge nose (eastbound)' }, { kind: 'gore', at: pt(470, -om), note: 'diverge nose (westbound)' },
      { kind: 'merge', at: pt(470, om), note: 'on-ramp merge (eastbound)' }, { kind: 'merge', at: pt(-470, -om), note: 'on-ramp merge (westbound)' });
  } else if (mode === 'clover') {
    const make = (a, b) => {                      // a = main-lane offset the car leaves, b = the cross lane it joins: SW outer ramp + SE loop
      const outer = bez([-470, a], [-300, a], [-b, 130], [-b, 330]);
      const r = 150, gap = 24, cx = b + r, cz = a + r + gap;
      const loop = [...bez([150, a], [175, a], [185, a + gap], [cx, a + gap], 6), ...arc(cx, cz, r, -Math.PI / 2, Math.PI, 22).slice(1), ...line([b, cz], [b, cz - 90], 4).slice(1)];
      return [outer, loop];
    };
    for (let m = 0; m < 4; m++) {
      const [outer, loop] = m % 2 === 0 ? make(om, oc) : make(oc, om);
      for (const [pts, role, nm] of [[outer, 'ramp', 'outer'], [loop, 'loop', 'loop']]) paths.push(P(`ramp:${nm}:${m}`, role, 'ramp', pts.map(p => rotPt(p, m)), true));
    }
    feats.push({ kind: 'clover', note: 'four loop ramps (left turns) and four outer ramps (right turns)' });
  }
  if (mode !== 'over' && M.lighting === 'masts-at-exits') for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) feats.push({ kind: 'high-mast', at: pt(sx * 250, sz * 250), height: 130 });
  feats.push({ kind: mode === 'over' ? 'grade-separation' : 'interchange', mode, deck: cc, under: cm, clearance: DECK_H });
  return { paths, features: feats };
}

// ---- the chooser: four edge states -> one module ------------------------------------------------------------------------
const AX = s => (s === 'north' || s === 'south' ? 'ns' : 'ew');
/** Pick and build the module of cell (i,k) for its four edge classes. Pure: a function of (edges, seed, i, k) only. */
export function buildModule(edges, { seed = 1, i = 0, k = 0 } = {}) {
  const act = SIDES.filter(s => edges[s]), n = act.length, id = `${i},${k}`;
  let kind = 'empty', gen = { paths: [], features: [] }, rot = 0, why = 'no road crosses this cell', extra = {};
  const done = () => finalize({ id, i, k, kind, rot, edges: { ...edges }, why, ...extra }, gen, rot);
  if (n === 0) return done();
  if (n === 1) { kind = 'stub'; rot = rotFor('west', act[0]); gen = genStub(edges[act[0]]); why = 'one road edge: the road ends in this cell'; return done(); }
  if (n === 2) {
    const [p, q] = act, a = edges[p], b = edges[q];
    if (AX(p) === AX(q)) {
      const hi = rankOf(a) > rankOf(b) || (rankOf(a) === rankOf(b) && SIDES.indexOf(p) < SIDES.indexOf(q)) ? p : q, lo = hi === p ? q : p;
      if (a === b) { kind = 'straight'; rot = AX(p) === 'ew' ? 0 : 1; gen = genStraight(a, seed, i, k); why = `${a} runs straight through`; extra = { main: { cls: a, axis: AX(p) } }; }
      else { kind = 'transition'; rot = rotFor('west', hi); gen = genTransition(edges[hi], edges[lo]); why = `class change ${edges[hi]} to ${edges[lo]}${edges[hi] === 'street' || edges[lo] === 'street' ? ' (city exit)' : ''}`; }
      return done();
    }
    if (a === b) { kind = 'curve'; rot = { 'south,west': 0, 'north,west': 1, 'east,north': 2, 'east,south': 3 }[[p, q].sort().join(',')]; gen = genCurve(a); why = `${a} turns a corner`; return done(); }
    kind = 'hub'; gen = genHub(edges); why = 'two classes meet at a corner: at-grade junction'; return done();
  }
  if (n === 3) {
    const missing = SIDES.find(s => !edges[s]), br = OPPOSITE[missing], th = act.filter(s => s !== br), ct = edges[th[0]];
    if (edges[th[0]] === edges[th[1]] && isFreeway(ct) && rankOf(edges[br]) < rankOf(ct)) {
      kind = 'exit'; rot = rotFor('south', br); gen = genCrossing(ct, edges[br], 'diamond', { northArm: false });
      why = `${ct} with a lower branch (${edges[br]}): off-ramp + on-ramp pairs to the overpassing branch`; extra = { branchSide: br }; return done();
    }
    kind = 'hub'; gen = genHub(edges); why = 'three roads meet at grade'; return done();
  }
  const ew = edges.east === edges.west, ns = edges.north === edges.south;
  if (ew && ns) {
    const rE = rankOf(edges.east), rN = rankOf(edges.north), main = rE >= rN ? 'ew' : 'ns', cm = main === 'ew' ? edges.east : edges.north, cc = main === 'ew' ? edges.north : edges.east;
    if (Math.max(rE, rN) >= FREEWAY_RANK) {
      const roll = rollOf(seed, 'xchg', i, k);
      if (Math.min(rE, rN) >= FREEWAY_RANK) {
        if (roll < 0.6) { kind = 'cloverleaf'; gen = genCrossing(cm, cc, 'clover'); why = `${cm} meets ${cc}: cloverleaf`; }
        else { kind = 'overpass'; gen = genCrossing(cm, cc, 'over'); why = `${cm} under ${cc}: grade separation, no connection`; }
      } else if (roll < 0.7) { kind = 'diamond'; gen = genCrossing(cm, cc, 'diamond'); why = `${cm} meets ${cc}: diamond interchange`; }
      else { kind = 'overpass'; gen = genCrossing(cm, cc, 'over'); why = `${cc} over ${cm}: grade separation, no ramps`; }
      rot = main === 'ns' ? 1 : 0; return done();
    }
  }
  kind = 'hub'; gen = genHub(edges); why = '4-way at-grade crossing'; return done();
}

function finalize(m, gen, rot) {
  const paths = (gen.paths || []).map(p => ({ ...p, points: p.points.map(q => rotPt(q, rot)) }));
  const features = (gen.features || []).map(f => ({ ...f, ...(f.at ? { at: rotPt(f.at, rot) } : {}) }));
  return { ...m, paths, features, meander: gen.meander || null, ports: derivePorts(paths) };
}

// ---- ports (derived from the geometry, then checked against the edge classes) ---------------------------------------------------
/** Every path end that sits on the cell boundary: { side, x, z, dir:'in'|'out'|'both', cls, pathId }. */
export function derivePorts(paths) {
  const out = [], E = 0.01, side = p => (Math.abs(p.z + H) < E ? 'north' : Math.abs(p.z - H) < E ? 'south' : Math.abs(p.x - H) < E ? 'east' : Math.abs(p.x + H) < E ? 'west' : null);
  for (const p of paths) for (const [q, first] of [[p.points[0], true], [p.points[p.points.length - 1], false]]) { const s = side(q); if (s) out.push({ side: s, x: q.x, z: q.z, y: q.y || 0, dir: p.oneWay ? (first ? 'in' : 'out') : 'both', cls: p.cls, pathId: p.id }); }
  return out;
}
/** Problems with a module (empty = consistent): ports must equal the lane list of each edge class (right-hand lanes); all points finite and inside the cell. */
export function validateModule(m) {
  const bad = [], key = p => `${p.side}|${r3(p.x)}|${r3(p.z)}|${p.dir}`;
  for (const s of SIDES) {
    const have = m.ports.filter(p => p.side === s), cls = m.edges[s];
    if (!cls) { if (have.length) bad.push(`${s}: ports on an edge with no road`); continue; }
    const want = laneList(cls).map(l => { const q = portPoint(s, l.off); return { side: s, x: q.x, z: q.z, dir: l.dir }; });
    if (want.map(key).sort().join() !== have.map(key).sort().join()) bad.push(`${s}: ports ${have.map(key).join(' ')} != lanes of ${cls} ${want.map(key).join(' ')}`);
    if (have.some(p => p.y)) bad.push(`${s}: a port is off the ground`);
    if (have.some(p => p.cls !== cls)) bad.push(`${s}: port class differs from the edge class`);
  }
  for (const p of m.paths) for (const q of p.points) { if (![q.x, q.z].every(Number.isFinite)) bad.push(`${p.id}: non-finite point`); else if (Math.abs(q.x) > H + 0.01 || Math.abs(q.z) > H + 0.01) bad.push(`${p.id}: leaves the cell`); }
  return bad;
}
/** World-space port lanes of a module (cell origin = (i*2H, k*2H)). */
export const worldPorts = m => m.ports.map(p => ({ side: p.side, x: r3(p.x + m.i * 2 * H), z: r3(p.z + m.k * 2 * H), dir: p.dir, cls: p.cls }));

// ---- planning an area / a strip (the lab and any caller) -------------------------------------------------------------------------
export function planArea(field, { i0 = 0, i1 = 0, k0 = 0, k1 = 0, seed = 1 } = {}) {
  const cells = []; for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) cells.push(buildModule(edgesOf(field, i, k), { seed, i, k })); return cells;
}
/**
 * A country road between two ends, with crossroads. Returns { field, cells, span, crossings }.
 *   cls        the main road class; length cells along row 0
 *   ends       'city' puts a street class at both ends (city-exit transitions), 'wild' leaves the road running off the strip
 *   crossings  [{ i, cls, side? }] crossroads (side 'south' or 'north' makes a one-sided branch: an exit module on a freeway) (arms run `arm` cells each way and stop)
 */
export function planStrip({ cls = 'interstate', length = 9, seed = 1, ends = 'city', crossings = null, arm = 2 } = {}) {
  const map = new Map(), n = Math.max(3, length), xs = crossings || defaultCrossings(cls, n, seed);
  for (let i = 0; i < n - 1; i++) map.set(edgeKey(i, 0, 'east'), cls);
  map.set(edgeKey(0, 0, 'west'), ends === 'city' ? 'street' : cls); map.set(edgeKey(n - 1, 0, 'east'), ends === 'city' ? 'street' : cls);
  for (const x of xs) for (let d = 1; d <= arm; d++) { if (x.side !== 'north') map.set(edgeKey(x.i, d - 1, 'south'), x.cls); if (x.side !== 'south') map.set(edgeKey(x.i, -(d - 1), 'north'), x.cls); }
  const field = fieldFromMap(map), cells = planArea(field, { i0: 0, i1: n - 1, k0: -arm, k1: arm, seed });
  return { field, cells, span: { i0: 0, i1: n - 1, k0: -arm, k1: arm }, crossings: xs, seed };
}
function defaultCrossings(cls, n, seed) {
  const out = [], lower = ['interstate', 'divided'].includes(cls) ? ['two-lane', 'rural', 'street', 'divided'] : cls === 'two-lane' ? ['rural', 'two-lane', 'dirt'] : ['dirt', 'rural'];
  for (let i = 2; i < n - 2; i++) if (rollOf(seed, 'xing', i) < 0.4 && !out.some(x => Math.abs(x.i - i) < 2)) out.push({ i, cls: lower[Math.floor(rollOf(seed, 'xcls', i) * lower.length)] });
  return out;
}
export const KIT_KINDS = Object.freeze(['empty', 'stub', 'straight', 'curve', 'transition', 'hub', 'exit', 'diamond', 'cloverleaf', 'overpass']);
