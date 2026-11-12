// TOWN ROADS (docs/design/WEB_TOWNS_ROADS.md): every generated town and every SITE stamp in the streamed world gets an
// exit off its interstate and an access road to its own main street, so no place you can enter is "drive off-road and
// hope", and no place is reached only through another town. The interstates get the lane rule (data/lanes.js): an added
// lane each way through a city (an auxiliary lane, exit to exit), none on a bridge, none in the open. And the access road
// gets its roadside (data/towns.js ACCESS_DETAIL): the town's name board, a wreck, a burned car, fences, mailboxes, a
// billboard for a big town, a gas canopy before a town that sells fuel, a notice board, a checkpoint at a gated town.
//
// Runs ONCE at boot, inside the streamer (before the sign atlas is painted): layTownRoads(W, plan) with the citygen plan
// (systems/citygen.js planWorld, planned before any exit is added and handed to CityGen as W.townPlan). Pure: a function
// of the world index and the plan, so two boots lay the same roads. Nothing here may reach a pinned P1 chunk
// (data/golden.json p1Chunks) or the Phoenix island and its ring: what would is skipped, and the report says why.
import { STREAM } from '../data/streaming.js';
import { LANE_LAY, lanesFor, placeSize } from '../data/lanes.js';
import { ACCESS_DETAIL, regionOf, COUNTERS, CLASS_RULES, ruleText, REGION_ECON, NIGHT_CURFEW, CURFEW_WORDS } from '../data/towns.js';
import { ARCHETYPES } from '../data/citygen.js';
import { TOWN_CLASS } from '../data/occupations.js';
import { SITES_BY_ID } from '../data/sites/index.js';
import GOLDEN from '../data/golden.json';
import { inIsland, C as CHUNK } from './geo.js';
import { ribbon, fillet, resample, laneExtra } from './worldindex.js';
import { regionAt, regionWater, WK } from './regions.js';
import { layoutTown } from './citygen/layout.js';
import { layoutSite } from './citygen/site.js';
import { layoutBase } from './citygen/layout.js';
import { layoutMilbase } from './citygen/milbase.js';
import { MILBASES_BY_ID } from '../data/milbases.js';

const PIN = new Set(Object.keys(GOLDEN.p1Chunks ?? {}));
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// Within m metres of a pinned chunk (the box x0..x1, z0..z1 grown by m)?
export function nearPinned(x0, z0, x1, z1, m = 0) {
  for (let cx = Math.floor((x0 - m) / CHUNK); cx <= Math.floor((x1 + m) / CHUNK); cx++) for (let cz = Math.floor((z0 - m) / CHUNK); cz <= Math.floor((z1 + m) / CHUNK); cz++) if (PIN.has(`${cx},${cz}`)) return true;
  return false;
}
// The exits' footprint along the road (gore + aux + taper each side of the cross road) and the spacing two keep.
const RAMP = STREAM.ramp, REACH = STREAM.crossRoad.reach, MI = STREAM.mile;
const EXIT_SPAN = RAMP.gore + RAMP.aux + RAMP.taper;           // 520 m each way
export const TOWNROADS = {
  maxD: 60000,       // m: a place further than this from every interstate is reported unserved (none is today)
  exitGap: 1300,     // m: a new exit keeps this far (along the road) from every other
  reuseR: 2600,      // m: (kept for the report) a town with no room for an exit of its own takes the nearest working one
  reuseMax: 30000,   // m: ...along the road, at most this far
  detours: [700, -700, 1400, -1400, 2400, -2400, 3600, -3600], // m: sideways tries round water, a pinned chunk or another town
  causewayMax: 1500,
  straight: 1e9,     // m: (off) the ramps are bent onto the road's curve (bendInterchange), so a town's exit may stand on a curve // m: open water a town's road may cross on a causeway (a lagoon to a barrier island), at most
  edgePad: 900,      // m: no new exit this near a corridor's trimmed ends
  pinPad: 320,       // m: no new feature this near a pinned P1 chunk
  laneWhy: true,
};

// ---- the places the lane rule reads -------------------------------------------------------------------------------------
export function placesOf(W, plan) {
  const out = [{ id: 'phoenix', x: 0, z: 0, r: W.ring?.reach ?? 1500, size: 'metro', name: 'PHOENIX' }];
  for (const t of W.towns ?? []) if (t.built || t.holdout) out.push({ id: t.id, x: t.x, z: t.z, r: 300, size: placeSize({ kind: t.kind }), name: t.name });
  for (const H of W.holdouts ?? []) out.push({ id: H.id ?? H.row?.id, x: H.cx, z: H.cz, r: Math.max(H.hw ?? 100, H.hd ?? 100), size: 'town', name: H.name ?? H.row?.name });
  for (const r of plan ?? []) {
    if (r.beyond) continue;
    if (r.kind === 'town') { const A = ARCHETYPES[r.arch]; out.push({ id: r.id, x: r.x, z: r.z, r: r.half, size: placeSize({ kind: 'town', major: !!r.major, sizeM: A?.sizeM[1] ?? 0, popMax: A?.pop[1] ?? 0 }), name: r.name }); }
    else if (r.kind === 'site') { const row = SITES_BY_ID.get(r.site); out.push({ id: r.id, x: r.x, z: r.z, r: r.half, size: placeSize({ kind: 'site', footprintM: Math.max(...(row?.footprint ?? [0])), popMax: row?.society?.pop?.[1] ?? 0 }), name: r.name }); }
  }
  return out;
}

// ---- the lane rule on a corridor -----------------------------------------------------------------------------------------
// Samples the rule every LANE_LAY.step metres: { s, rule (lanes), built (lanes), why, place }. An added lane is BUILT where
// the rule asks for it, except within an interchange (its own ramps' lanes are there), on a bridge (the rule says so
// itself), near a pinned chunk, or inside the island and ring; runs shorter than LANE_LAY.minRun are not built.
export function laneProfile(W, cor, places) {
  const i10 = cor === W.i10, out = [], step = LANE_LAY.step, lo = (cor.mainlineFrom ?? 0) + 300, hi = cor.L - 300;
  const exits = i10 ? W.i10.exits : cor.exits;
  const rg = cor.region?.id === 'florida' ? 'florida' : 'desert';
  for (let s = lo; s <= hi; s += step) {
    const f = cor.at(s);
    let best = null;
    for (const P of places) {
      const km = Math.max(0, Math.hypot(P.x - f.x, P.z - f.z) - P.r) / 1000;
      if (km > 8) continue;
      const L = lanesFor({ cls: 'interstate', size: P.size, km, terrain: 'flat', region: rg });
      if (!best || L.lanes > best.L.lanes) best = { L, P, km };
    }
    const bridge = i10 ? !!W.water?.onBridge?.(s, 80) : false;
    const mountain = W.biomeAt?.(f.x, f.z) === 'm';
    const terrain = bridge ? 'bridge' : mountain ? 'mountain' : 'flat';
    const L = best ? lanesFor({ cls: 'interstate', size: best.P.size, km: best.km, terrain, region: rg }) : lanesFor({ cls: 'interstate', terrain, region: rg });
    let built = L.lanes, held = null;
    if (L.lanes > 4) {
      if (exits.some((X) => Math.abs(X.s - s) < EXIT_SPAN + 60)) held = 'interchange';
      else if (nearPinned(f.x, f.z, f.x, f.z, TOWNROADS.pinPad)) held = 'pinned P1 chunk';
      else if (inIsland(f.x, f.z, 400) || W.ring?.inCity?.(f.x, f.z, 200)) held = 'the island and ring';
      if (held) built = 4;
    }
    out.push({ s, rule: L.lanes, built, why: L.why, held, place: best?.P.name ?? null, km: best ? +best.km.toFixed(2) : null });
  }
  return out;
}
// The runs an added lane is built on (both carriageways), from a profile.
export function laneRunsOf(prof) {
  const runs = [], dropped = [];
  let a = null;
  const close = (b) => { if (a === null) return; const s0 = a - LANE_LAY.step / 2, s1 = b + LANE_LAY.step / 2; if (s1 - s0 >= LANE_LAY.minRun) runs.push({ s0, s1, w: LANE_LAY.laneW, taper: LANE_LAY.taper }); else dropped.push({ s0, s1, why: 'shorter than a lane is worth building' }); a = null; };
  for (let i = 0; i < prof.length; i++) {
    const p = prof[i];
    if (p.built > 4) { if (a === null) a = p.s; } else close(prof[i - 1]?.s ?? p.s);
  }
  close(prof[prof.length - 1]?.s ?? 0);
  return { runs, dropped };
}
// The added lane's ribbons: one per carriageway per run, painted with the atlas's added-lane strip (dashes on its left,
// a solid edge and a rumble-stripped shoulder on its right), centred a lane outside lane 2.
function laneRibbons(W, cor, runs, label) {
  const out = [], lw = LANE_LAY.laneW / 2, so = RAMP.shoulder;
  for (const r of runs) for (const side of [1, -1]) {
    const pts = [];
    for (let s = r.s0; s <= r.s1 + 0.01; s += 8) {
      const f = cor.at(s), sec = cor.section(s), k = laneExtra([r], Math.min(Math.max(s, r.s0 + 0.01), r.s1 - 0.01)) / r.w;
      const u = side * (sec.lane2 + lw * k);
      pts.push({ x: f.x + f.nx * u, z: f.z + f.nz * u, y: 0.036, wl: lw * k, wr: (lw + so) * k });
    }
    if (pts.length < 2) continue;
    if (side < 0) pts.reverse();
    out.push(ribbon(`${label} ${side > 0 ? 'R' : 'L'} added lane ${Math.round(r.s0)}`, 'aux', 'aux', pts, { lane: true, cor: cor === W.i10 ? null : cor }));
  }
  return out;
}

// ---- a town's way in --------------------------------------------------------------------------------------------------
// The layout's main street ends (and gates): where an access road should arrive. Pure (the same layout citygen stamps).
function layoutOf(rec) {
  if (rec.usmap) return rec.usmap; // a usmap town: its own streets (the pass above)
  // a military base: its main road runs out through both gates along the approaches (world/citygen/milbase.js)
  if (rec.kind === 'base' && rec.milbase) return layoutMilbase({ row: MILBASES_BY_ID.get(rec.milbase), seed: rec.seed, x: rec.x, z: rec.z, biome: rec.biome, id: rec.id, name: rec.name });
  if (rec.kind === 'base') return layoutBase({ seed: rec.seed, x: rec.x, z: rec.z, biome: rec.biome, id: rec.id, name: rec.name });
  if (rec.kind === 'site') return layoutSite(SITES_BY_ID.get(rec.site), { x: rec.x, z: rec.z, seed: rec.seed });
  return layoutTown({ arch: rec.arch, biome: rec.biome, seed: rec.seed, x: rec.x, z: rec.z, id: rec.id, name: rec.name, size: rec.size, walls: rec.wallsOverride });
}
function entriesOf(T) {
  if (T.entries?.length) return T.entries.map((e) => ({ ...e }));
  const out = [];
  const mains = (T.roads ?? []).filter((r) => r.main);
  for (const r of mains.length ? mains : T.roads ?? []) {
    if (r.axis === 'x') { const z = (r.z0 + r.z1) / 2; out.push({ x: r.x0, z, dx: -1, dz: 0 }, { x: r.x1, z, dx: 1, dz: 0 }); }
    else { const x = (r.x0 + r.x1) / 2; out.push({ x, z: r.z0, dx: 0, dz: -1 }, { x, z: r.z1, dx: 0, dz: 1 }); }
  }
  for (const G of T.gates ?? []) out.push({ x: G.x, z: G.z, gate: true, dx: G.side === 'W' ? -1 : G.side === 'E' ? 1 : 0, dz: G.side === 'N' ? -1 : G.side === 'S' ? 1 : 0 });
  if (!out.length) { const cx = (T.x0 + T.x1) / 2, cz = (T.z0 + T.z1) / 2; out.push({ x: T.x0 - 20, z: cz, dx: -1, dz: 0 }, { x: T.x1 + 20, z: cz, dx: 1, dz: 0 }, { x: cx, z: T.z0 - 20, dx: 0, dz: -1 }, { x: cx, z: T.z1 + 20, dx: 0, dz: 1 }); }
  return out;
}
// What a town is to its signs and boards: its people, its class, its rules, its curfew, whether it is gated.
export function townFacts(rec, T = null) {
  const row = rec.kind === 'site' ? SITES_BY_ID.get(rec.site) : null, A = ARCHETYPES[rec.arch];
  const pop = row ? Math.round(((row.society?.pop?.[0] ?? 0) + (row.society?.pop?.[1] ?? 0)) / 2) : A ? Math.round((A.pop[0] + A.pop[1]) / 2) : 0;
  let cls = 'free';
  if (row) { const f = String(row.society?.faction ?? ''); cls = /raider|gang|pirate|toll/.test(f) ? 'raider' : /lords|court|crown/.test(f) ? 'warlord' : /soldier|warden|remnant|trooper/.test(f) ? 'garrison' : /cult|visions/.test(f) ? 'cult' : /merchant|trader|trade|league/.test(f) ? 'merchant' : 'free'; }
  else cls = TOWN_CLASS[rec.arch] ?? 'free';
  const own = row?.society?.houseRules ?? [];
  const rules = own.length ? own.slice(0, 3).map(ruleText) : (CLASS_RULES[cls] ?? CLASS_RULES.free).rules;
  const curfew = own.some((r) => CURFEW_WORDS.test(r)) ? NIGHT_CURFEW : (CLASS_RULES[cls] ?? CLASS_RULES.free).curfew;
  const walled = !!(T ? (T.wall || T.gates?.length) : (row?.walls?.type && row.walls.type !== 'none') || (A?.walls && A.walls !== 'none'));
  const region = regionOf(rec.biome ?? row?.biome, rec.region === 'florida' || row?.region === 'FL' || rec.inFlorida);
  return { pop, cls, rules, curfew, walled, gated: walled || cls === 'garrison' || cls === 'warlord' || cls === 'raider', region, ruler: row?.society?.ruler ? { name: row.society.ruler, title: row.society.rulerTitle ?? 'the boss' } : null };
}
const hh = (h) => `${String(h % 24).padStart(2, '0')}:00`;
export const curfewText = (c) => (c ? `${hh(c[0])}-${hh(c[1])}` : 'NONE');

// ---- the roadside kits along an access road (structs + sign faces) ------------------------------------------------------
// A frame at fraction u of a ribbon: the point, its tangent (toward the town) and normal.
function frameAt(rb, u) {
  const i = Math.max(1, Math.min(rb.n - 2, Math.round(u * (rb.n - 1)))), tx0 = rb.x[i + 1] - rb.x[i - 1], tz0 = rb.z[i + 1] - rb.z[i - 1], l = Math.hypot(tx0, tz0) || 1;
  const tx = tx0 / l, tz = tz0 / l;
  return { x: rb.x[i], z: rb.z[i], tx, tz, nx: -tz, nz: tx, half: Math.max(rb.wl[i], rb.wr[i]), s: rb.s[i] };
}
export const KIT_COLORS = {
  rust: ['#7a4a2e', '#8a5a3a', '#6a4a3a', '#5e5a50'], char: ['#1e1b18', '#2a2420', '#36302a'], post: '#6a5a46', wood: '#8a6a48', board: '#a08458',
  canopy: '#c8c2b0', pillar: '#a8a294', pump: '#b0301e', booth: '#7a7a6a', sandbag: '#a8946a', mailbox: ['#7a7a7a', '#3a5a3c', '#8a3a2a', '#c9c0a4'],
};
export function kitParts(kit, F, side, o = {}) {
  // a box in the road frame: along a (m, +toward town), across u (m, + = side), y0..y1; returns a struct row
  const S = [], signs = [];
  const box = (a, u, sa, su, y0, y1, col, tag = null, solid = false) => S.push({ x: F.x + F.tx * a + F.nx * u, z: F.z + F.tz * a + F.nz * u, y0, y1, sa, su, rot: Math.atan2(F.tx, F.tz), col, tag: tag ?? kit, solid, base: 0, tx: F.tx, tz: F.tz, kit });
  const off = side * (F.half + 2.2);
  const face = Math.atan2(-F.tx, -F.tz); // reads toward traffic heading into town
  const pick = (L, k) => L[Math.abs(k) % L.length];
  switch (kit) {
    case 'town_sign': signs.push({ a: 0, u: off, h: face, w: 6.4, hgt: 3.2, style: 'guide', lines: o.lines }); box(0, off - 2.2, 0.15, 0.15, 0, 1.7, KIT_COLORS.post); box(0, off + 2.2, 0.15, 0.15, 0, 1.7, KIT_COLORS.post); break;
    case 'mailboxes': for (let k = 0; k < 5; k++) { const a = k * 1.1 - 2.2; box(a, off - side * 0.6, 0.1, 0.1, 0, 1.1, KIT_COLORS.post); box(a, off - side * 0.6, 0.48, 0.26, 1.0, 1.26, pick(KIT_COLORS.mailbox, k + (o.seed ?? 0))); } break;
    case 'wreck': case 'burned_car': {
      const C2 = kit === 'wreck' ? KIT_COLORS.rust : KIT_COLORS.char, k = o.seed ?? 0, u = off + side * 0.6;
      box(0, u, 4.3, 1.8, 0.25, 1.15, pick(C2, k), 'wreck', true); box(-0.3, u, 2.1, 1.6, 1.15, 1.75, pick(C2, k + 1), 'wreck', true);
      if (kit === 'burned_car') { box(1.6, u, 0.6, 1.9, 0.0, 0.45, '#141210'); box(-1.6, u, 0.6, 1.9, 0.0, 0.45, '#141210'); }
      break;
    }
    case 'fence_run': for (let k = 0; k <= 14; k++) box(k * 3 - 21, off + side * 2.5, 0.12, 0.12, 0, 1.3, KIT_COLORS.post); box(0, off + side * 2.5, 42, 0.05, 1.05, 1.12, KIT_COLORS.wood); box(0, off + side * 2.5, 42, 0.05, 0.6, 0.66, KIT_COLORS.wood); break;
    case 'billboard': { const u = off + side * 6; box(0, u, 0.35, 0.35, 0, 4.2, KIT_COLORS.post, 'billboard', true); box(3.2, u, 0.35, 0.35, 0, 4.2, KIT_COLORS.post); box(-3.2, u, 0.35, 0.35, 0, 4.2, KIT_COLORS.post); signs.push({ a: 0, u, h: face, w: 9.6, hgt: 4.4, lift: 3.8, style: 'town', lines: o.lines }); break; }
    case 'canopy': {
      const u = off + side * 7;
      for (const [a, b] of [[-4.2, -2.6], [4.2, -2.6], [-4.2, 2.6], [4.2, 2.6]]) box(a, u + b, 0.35, 0.35, 0, 4.4, KIT_COLORS.pillar, 'canopy', true);
      box(0, u, 10.6, 7.2, 4.4, 4.95, KIT_COLORS.canopy, 'canopy_roof', false);
      box(-1.8, u, 0.6, 1.1, 0, 1.6, KIT_COLORS.pump, 'pump', true); box(1.8, u, 0.6, 1.1, 0, 1.6, KIT_COLORS.pump, 'pump', true);
      box(0, u, 3.0, 0.9, 0, 0.2, '#6a6458'); // the pump island
      signs.push({ a: 0, u: u - side * 3.7, h: face, w: 4.2, hgt: 1.6, lift: 4.95, style: 'warn', lines: o.lines });
      break;
    }
    case 'notice_board': box(-1.3, off, 0.14, 0.14, 0, 2.5, KIT_COLORS.post); box(1.3, off, 0.14, 0.14, 0, 2.5, KIT_COLORS.post); box(0, off + side * 0.08, 2.9, 0.08, 0.9, 2.45, KIT_COLORS.board, 'notice_board', true); signs.push({ a: 0, u: off - side * 0.05, h: face, w: 2.7, hgt: 1.45, lift: 0.95, style: 'town', lines: o.lines }); break;
    case 'checkpoint': {
      const u = F.half + 2.6;
      box(0, u, 2.4, 2.4, 0, 2.6, KIT_COLORS.booth, 'checkpoint', true); box(0, u, 2.9, 2.9, 2.6, 2.85, '#5a5a4a');
      box(-6, u + 0.3, 3.2, 0.9, 0, 1.0, KIT_COLORS.sandbag, 'sandbags', true); box(-6, -u - 0.3, 3.2, 0.9, 0, 1.0, KIT_COLORS.sandbag, 'sandbags', true);
      box(1.6, u - 1.6, 0.18, 0.18, 0, 4.2, '#d8d2bc'); // the barrier arm, up
      box(1.6, u - 1.6, 0.22, 0.22, 1.2, 1.7, '#b0301e');
      signs.push({ a: -1.5, u: -u - 0.4, h: face, w: 5.6, hgt: 2.6, lift: 1.2, style: 'warn', lines: o.lines });
      break;
    }
    default: break;
  }
  return { structs: S, signs: signs.map((q) => ({ ...q, x: F.x + F.tx * q.a + F.nx * q.u, z: F.z + F.tz * q.a + F.nz * q.u })) };
}

// A route for an access road: the control points, bent sideways (TOWNROADS.detours) wherever the line runs into water, a
// pinned chunk, the island and ring, or another town (avoid(x, z) says which). Returns { rs (6 m samples), bad, detours }.
// Water a road cannot be laid through: the sea, a lagoon, a canal (a river is crossed: the water plan gives a road laid
// before it a deck or a ford; a swamp slough keeps itself off every paved road).
const _w = { d: 0, k: 0, s: 0 };
export function hardWater(W, x, z) { const R = regionAt(W.regions, x, z); if (!R?.water) return false; regionWater(R, x, z, _w, { ribbons: [] }); return _w.d > 0.05 && _w.k >= WK.canal; }
function routeAccess(W, pts, avoid) {
  const badAt = (x, z) => hardWater(W, x, z) || nearPinned(x, z, x, z, 40) || inIsland(x, z, 300) || W.ring?.inCity?.(x, z, 150) || !!avoid(x, z);
  const firstBad = (P, from = 0) => { const rs = resample(fillet(P, STREAM.access.cornerR), 20); for (let i = 3; i < rs.n - 3; i++) if (badAt(rs.x[i], rs.z[i])) return { i, rs }; return { i: -1, rs }; };
  const clear = (a, b) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 25); for (let k = 1; k < n; k++) { const t = k / n; if (badAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false; } return true; };
  let P = pts.map((q) => ({ x: q.x, z: q.z })), detours = 0;
  for (let it = 0; it < 10; it++) {
    const { i, rs } = firstBad(P);
    if (i < 0) break;
    // which leg of the control line holds the bad sample: the nearest leg to it
    const bx = rs.x[i], bz = rs.z[i];
    let j = 0, bd = Infinity;
    for (let k = 0; k < P.length - 1; k++) { const ax = P[k].x, az = P[k].z, dx = P[k + 1].x - ax, dz = P[k + 1].z - az, l = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((bx - ax) * dx + (bz - az) * dz) / l)), d = Math.hypot(ax + dx * t - bx, az + dz * t - bz); if (d < bd) { bd = d; j = k; } }
    const a = P[j], b = P[j + 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
    let put = null;
    for (const off of TOWNROADS.detours) { const q = { x: bx + nx * off, z: bz + nz * off }; if (!badAt(q.x, q.z) && clear(a, q) && clear(q, b)) { put = q; break; } }
    if (!put) for (const off of TOWNROADS.detours) { const q = { x: bx + nx * off, z: bz + nz * off }; if (!badAt(q.x, q.z)) { put = q; break; } }
    if (!put) break;
    P.splice(j + 1, 0, put); detours++;
  }
  const rs = resample(fillet(P, STREAM.access.cornerR), 6);
  let bad = 0, wet = 0, other = 0;
  for (let i = 4; i < rs.n - 4; i++) if (badAt(rs.x[i], rs.z[i])) { bad++; const x = rs.x[i], z = rs.z[i]; if (nearPinned(x, z, x, z, 40) || inIsland(x, z, 300) || W.ring?.inCity?.(x, z, 150) || avoid(x, z)) other++; else wet++; }
  // only open water left, and not too much of it: a causeway across it (regions.js keeps the water off a causeway)
  const causeway = !other && wet > 0 && wet * 6 <= TOWNROADS.causewayMax;
  return { rs, bad: causeway ? 0 : bad, detours, causeway: causeway ? wet * 6 : 0, wet, other };
}

// addExit lays an interchange on a straight frame at the exit (L(a, u) = C + a T + u N). The boot's own exits have the
// meander flattened round them; a town's exit comes later and may stand on a curve, where a straight ramp 500 m long
// leaves the road by tens of metres. Every point of its ramps, their fills, rails and stop lines is moved from the
// straight frame onto the curved one: (a, u) -> cor.at(s + a) + u N(s + a). The cross road (a = 0) and the bridge stay.
export function bendInterchange(W, cor, X) {
  const map = (x, z) => { const dx = x - X.x, dz = z - X.z, a = dx * X.tx + dz * X.tz, u = dx * X.nx + dz * X.nz, F = cor.at(Math.max(0, Math.min(cor.L, X.s + a))); return [F.x + F.nx * u, F.z + F.nz * u]; };
  const bbox = (o, xs, zs, pad) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (let i = 0; i < xs.length; i++) { x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); z0 = Math.min(z0, zs[i]); z1 = Math.max(z1, zs[i]); } o.x0 = x0 - pad; o.z0 = z0 - pad; o.x1 = x1 + pad; o.z1 = z1 + pad; };
  for (const rb of W.ribbons) {
    if (rb.exit !== X.id || rb.kind !== 'ramp') continue;
    for (let i = 0; i < rb.n; i++) { const [x, z] = map(rb.x[i], rb.z[i]); rb.x[i] = x; rb.z[i] = z; if (i) rb.s[i] = rb.s[i - 1] + Math.hypot(rb.x[i] - rb.x[i - 1], rb.z[i] - rb.z[i - 1]); }
    rb.L = rb.s[rb.n - 1];
    let pad = 0; for (let i = 0; i < rb.n; i++) pad = Math.max(pad, Math.max(rb.wl[i], rb.wr[i]) + 2 * rb.y[i] + 2);
    bbox(rb, rb.x, rb.z, pad);
    for (const p of W.pieces) if (p.rib === rb) { p.x0 = rb.x0; p.z0 = rb.z0; p.x1 = rb.x1; p.z1 = rb.z1; }
  }
  // rails: only a ramp's (along the road, |a| past the cross road's edge); the cross road's own rails run out along N to
  // 300 m, where bending them by the road's turn would push them across the cross road
  const hw = STREAM.crossRoad.halfW + 2;
  for (const r of W.rails) if (r.exit === X.id) { const along = r.pts.some((q) => Math.abs((q.x - X.x) * X.tx + (q.z - X.z) * X.tz) > hw); if (along) for (const q of r.pts) { const [x, z] = map(q.x, q.z); q.x = x; q.z = z; } }
  // the abutment's solid top stood 5 cm above the approach fill where it meets the deck: a car driving over the bridge hit
  // it and stopped dead. Its collision top goes under the deck slab (the slab, H-1.1..H, still covers it to the eye)
  for (const st of W.structs) if (st.exit === X.id && st.tag === 'abutment') st.y1 = Math.min(st.y1, STREAM.ramp.deckH - 1.15);
  for (const st of W.stops) if (st.exit === X.id) { [st.x, st.z] = map(st.x, st.z); if (st.sign) { const [x, z] = map(st.sign.x, st.sign.z); st.sign.x = x; st.sign.z = z; } }
}

// ---- the whole pass ------------------------------------------------------------------------------------------------------
export function layTownRoads(W, plan) {
  const t0 = performance.now();
  const rep = { towns: [], exits: 0, reused: 0, unserved: [], lanes: {}, signs: 0, structs: 0, ribbons: 0, skipped: [] };
  const cors = [W.i10, ...Object.values(W.regions ?? {}).flatMap((R) => R.corridors ?? [])].filter(Boolean);
  const recs = (plan ?? []).filter((r) => !r.beyond && (r.kind === 'town' || r.kind === 'site' || r.kind === 'base') && W.inWorld(r.x, r.z, -50));
  // a usmap town with streets (WorldIndex.buildTowns) that no interstate or exit reaches (San Diego and Albuquerque sit
  // 12 and 29 km off I-10, on roads that are not built): it gets an exit and a road like any other town
  for (const t of W.towns ?? []) {
    if (!t.built || !W.inWorld(t.x, t.z, -50)) continue;
    const streets = W.ribbons.filter((r) => r.id.startsWith(`ST-${t.id}-`)); if (!streets.length) continue;
    const near = cors.some((c) => c.project(t.x, t.z, 2500).d < 2000) || (W.exits ?? []).some((X) => X.town === t.id || (X.dest && Math.hypot(X.dest.x - t.x, X.dest.z - t.z) < 1500));
    if (near) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; const entries = [];
    for (const r of streets) { x0 = Math.min(x0, r.x0); z0 = Math.min(z0, r.z0); x1 = Math.max(x1, r.x1); z1 = Math.max(z1, r.z1); if (/main|ew0/.test(r.id)) for (const i of [0, r.n - 1]) entries.push({ x: r.x[i], z: r.z[i], dx: 0, dz: 0 }); }
    recs.push({ kind: 'town', id: `us-${t.id}`, name: t.name, x: t.x, z: t.z, half: Math.max(x1 - x0, z1 - z0) / 2, seed: 1, usmap: { x0: x0 + 4, z0: z0 + 4, x1: x1 - 4, z1: z1 - 4, roads: [], gates: [], entries } });
  }
  const added = { ribbons: [], structs: [], signs: [] };
  const signId = (cor, id) => (cor === W.i10 ? id : `${cor.id}:${id}`);
  const pushSign = (cor, sg) => { if (nearPinned(sg.x, sg.z, sg.x, sg.z, 30) || inIsland(sg.x, sg.z, 30)) return false; added.signs.push({ y: 0, ...sg, region: cor === W.i10 ? undefined : cor.region?.id }); return true; };
  const corSign = (cor, s, dir, off, style, lines, id, w = 7.2, hgt = 3.6) => {
    if (s < (cor.mainlineFrom ?? 0) + 40 || s > cor.L - 40) return;
    const f = cor.at(s), sec = cor.section(s), u = dir * (sec.out + off);
    pushSign(cor, { id: signId(cor, id), x: f.x + f.nx * u, z: f.z + f.nz * u, h: Math.atan2(-f.tx * dir, -f.tz * dir), w, hgt, style, lines, s, dir, cor: cor.id, town: true });
  };
  // every planned record in the world keeps a road off it: towns, sites, homesteads and bases
  const solids = (plan ?? []).filter((r) => !r.beyond && W.inWorld(r.x, r.z, -50));
  const blocked = (x, z, self) => { for (const r of solids) if (r !== self && Math.abs(r.x - x) < r.half + 15 && Math.abs(r.z - z) < r.half + 15) return r; return null; };
  const usedNumbers = new Set(cors.flatMap((c) => (c === W.i10 ? W.i10.exits : c.exits).map((X) => `${c.id}:${X.number}`)));
  // 1. an exit and an access road for every town and site
  for (const rec of recs) {
    let best = null;
    for (const cor of cors) { const p = cor.project(rec.x, rec.z, TOWNROADS.maxD); if (p.d < (best?.p.d ?? Infinity)) best = { cor, p }; }
    if (!best || best.p.d > TOWNROADS.maxD) { rep.unserved.push({ id: rec.id, name: rec.name, why: `no interstate within ${TOWNROADS.maxD / 1000} km` }); continue; }
    const { cor } = best, exits = cor === W.i10 ? W.i10.exits : cor.exits;
    let T = null;
    try { T = layoutOf(rec); } catch (e) { rep.skipped.push({ id: rec.id, why: `layout: ${e.message}` }); continue; }
    rec.inFlorida = W.regionOf?.(rec.x, rec.z)?.id === 'florida';
    const facts = townFacts(rec, T);
    // the entry nearest the interstate (a main street's end or a gate); the town's own footprint along the road
    const ents = entriesOf(T).map((e) => ({ ...e, p: cor.project(e.x, e.z, TOWNROADS.maxD + 600) })).sort((a, b) => a.p.d - b.p.d);
    const e = ents[0];
    let sMin = Infinity, sMax = -Infinity;
    for (const [x, z] of [[T.x0, T.z0], [T.x1, T.z0], [T.x0, T.z1], [T.x1, T.z1]]) { const q = cor.project(x, z, TOWNROADS.maxD + 900); sMin = Math.min(sMin, q.s); sMax = Math.max(sMax, q.s); }
    const far = e.p.d > 2500; // a place well off the road: its exit stands where its entry meets the road
    const cands = far || e.p.s < sMin - 40 || e.p.s > sMax + 40 ? [e.p.s, e.p.s - 900, e.p.s + 900, e.p.s - 1800, e.p.s + 1800] : [];
    cands.push(sMin - 260, sMax + 260, sMin - 700, sMax + 700);
    const ok = (s) => {
      if (s < (cor.mainlineFrom ?? 0) + TOWNROADS.edgePad || s > cor.L - TOWNROADS.edgePad) return 'near the road\'s end';
      if (exits.some((X) => Math.abs(X.s - s) < TOWNROADS.exitGap)) return 'too near another exit';
      if (cor === W.i10 && W.water?.onBridge?.(s, 700)) return 'on a bridge';
      const f = cor.at(s), a = cor.at(Math.max(0, s - EXIT_SPAN)), b = cor.at(Math.min(cor.L, s + EXIT_SPAN));
      const x0 = Math.min(a.x, b.x, f.x - REACH), x1 = Math.max(a.x, b.x, f.x + REACH), z0 = Math.min(a.z, b.z, f.z - REACH), z1 = Math.max(a.z, b.z, f.z + REACH);
      if (nearPinned(x0, z0, x1, z1, TOWNROADS.pinPad)) return 'a pinned P1 chunk';
      if (inIsland(f.x, f.z, 1200) || W.ring?.inCity?.(f.x, f.z, 400)) return 'the island and ring';
      if ((W.roadside?.billboards ?? []).some((b) => b.road === cor.id && Math.abs(b.s - s) < 700)) return 'a roadside billboard';
      if (W.roadside?.nearSite?.(f.x, f.z, REACH + 120)) return 'a roadside site';
      for (let u = -REACH; u <= REACH; u += 25) { const x = f.x + f.nx * u, z = f.z + f.nz * u, q = blocked(x, z, rec); if (q) return `the cross road runs into ${q.name}`; if (x > T.x0 - 40 && x < T.x1 + 40 && z > T.z0 - 40 && z < T.z1 + 40) return 'the cross road runs into the town itself'; }
      for (let u = -REACH; u <= REACH; u += 20) if (Math.abs(u) > 30 && W.depthAt?.(f.x + f.nx * u, f.z + f.nz * u, 0, true) > 0.05) return 'the cross road crosses water';
      // an interchange is laid on a straight frame (addExit): the road must run straight under all of it, or the ramps leave
      // the road on its curve (the boot's own exits have the meander flattened round them; a town's exit comes later)
      for (let a = -EXIT_SPAN; a <= EXIT_SPAN; a += 40) { const P = cor.at(Math.max(0, Math.min(cor.L, s + a))), lat = (P.x - f.x) * f.nx + (P.z - f.z) * f.nz; if (Math.abs(lat) > TOWNROADS.straight) return `the road curves ${Math.abs(lat).toFixed(1)} m off its line under the ramps`; }
      return null;
    };
    const own = (x, z) => x > T.x0 - 10 && x < T.x1 + 10 && z > T.z0 - 10 && z < T.z1 + 10;
    const tc = { x: (T.x0 + T.x1) / 2, z: (T.z0 + T.z1) / 2 };
    const routeFrom = (Xf) => {
      const sd = (tc.x - Xf.x) * Xf.nx + (tc.z - Xf.z) * Xf.nz >= 0 ? 1 : -1;
      const pA = { x: Xf.x + Xf.nx * sd * REACH, z: Xf.z + Xf.nz * sd * REACH };
      const byNear = ents.slice().sort((a, b) => Math.hypot(a.x - pA.x, a.z - pA.z) - Math.hypot(b.x - pA.x, b.z - pA.z));
      let best = null;
      for (const en of byNear.slice(0, 4)) {
        const dl = Math.hypot(en.x - pA.x, en.z - pA.z);
        if (dl <= 40) return { R: null, en, pA, dl };
        const pB = { x: Xf.x + Xf.nx * sd * (REACH + Math.min(160, dl * 0.3)), z: Xf.z + Xf.nz * sd * (REACH + Math.min(160, dl * 0.3)) };
        const R = routeAccess(W, [pA, pB, { x: en.x, z: en.z }], (x, z) => blocked(x, z, rec) || own(x, z));
        if (!best || R.bad < best.R.bad) best = { R, en, pA, dl };
        if (!R.bad) break;
      }
      return best;
    };
    let sEx = null, why = [], route = null;
    for (const s of cands) {
      let w = ok(s);
      if (!w) { route = routeFrom(cor.at(s)); if (route?.R?.bad) w = `its road could not be routed clean (${route.R.bad} points)`; }
      if (!w) { sEx = s; break; }
      why.push(`${Math.round(s)}: ${w}`); route = null;
    }
    let X = null, reused = false;
    if (sEx !== null) {
      const f = cor.at(sEx);
      let num = Math.max(1, Math.round(sEx / MI)), tag = '';
      for (const L of ['', 'A', 'B', 'C', 'D']) if (!usedNumbers.has(`${cor.id}:${num}${L}`)) { tag = L; break; }
      usedNumbers.add(`${cor.id}:${num}${tag}`);
      const row = { id: `TX-${rec.id}`, exit_number: `${num}${tag}`, name: rec.name, archetype: rec.kind === 'base' ? 'military' : 'town', community_tier: 'T2', service_tags: rec.kind === 'base' ? ['military'] : ['fuel', 'food', 'ammo'], risk_rating: rec.kind === 'base' ? 4 : 2 };
      const nb = W.ribbons.length;
      X = W.addExit(cor, row, f.x, f.z, e.x, e.z, { town: rec.id });
      X.townRec = rec.id;
      bendInterchange(W, cor, X);
      if (cor.region) { X.region = cor.region; cor.region.exits?.push(X); } // a region's exit list (systems/travel.js reads it), as WorldIndex's own region exits
      for (let k = nb; k < W.ribbons.length; k++) added.ribbons.push(W.ribbons[k]);
      W.ribbons.length = nb; // re-added below with the rest (one bucket pass)
      rep.exits++;
      // its signs: 1 mile, 1/2 mile, the gore (name and services), and past the on-ramp what is next
      const D = cor === W.i10 ? ['E', 'W'] : [cor.dirs[0][0], cor.dirs[1][0]];
      for (const dir of [1, -1]) {
        const g = X.s - dir * RAMP.gore, dn = dir > 0 ? D[0] : D[1];
        corSign(cor, g - dir * MI, dir, 3.2, 'guide', [`EXIT ${X.number}`, rec.name, '1 MILE'], `${X.id}-${dn}-1`);
        corSign(cor, g - dir * MI / 2, dir, 3.2, 'guide', [`EXIT ${X.number}`, rec.name, '1/2 MILE'], `${X.id}-${dn}-half`);
        corSign(cor, g + dir * 18, dir, 6.5, 'guide', [`EXIT ${X.number}`, rec.name, rec.kind === 'base' ? 'MILITARY · NO SERVICES' : 'FUEL · FOOD · AMMO'], `${X.id}-${dn}-gore`, 6.4, 3.4);
      }
    } else {
      // no room for an exit of its own: the nearest working exit along the road serves it
      const near = exits.filter((q) => !q.dead && !(cor === W.i10 && W.ring?.inCity?.(q.x, q.z, 300))).map((q) => [Math.abs(q.s - e.p.s), q]).sort((a, b) => a[0] - b[0])[0];
      if (!near || near[0] > TOWNROADS.reuseMax) { rep.unserved.push({ id: rec.id, name: rec.name, why: `no room for an exit (${why.join('; ')}) and no exit within ${TOWNROADS.reuseMax / 1000} km` }); continue; }
      X = near[1]; reused = true; rep.reused++;
    }
    // the access road: from the cross road's end on the town's side to the town's entry, routed round water, the pinned
    // chunks, the island and other towns (a detour sideways where the straight line meets one); a new exit's own straight
    // road (addExit) is replaced by it, so every town's road is laid by the same rule.
    if (!reused && X.access) { const i = added.ribbons.indexOf(X.access); if (i >= 0) added.ribbons.splice(i, 1); X.access = null; }
    if (!route) route = routeFrom(X);
    e.x = route.en.x; e.z = route.en.z; e.gate = route.en.gate;
    let acc = null;
    if (route.R) {
      const R = route.R;
      if (R.bad) { rep.unserved.push({ id: rec.id, name: rec.name, why: `its road could not be routed clear of water, a pinned chunk or a settlement (${R.bad} points: ${R.wet} in water, ${R.other} on land it must keep off)` }); continue; }
      const ap = [];
      for (let i = 0; i < R.rs.n; i++) ap.push({ x: R.rs.x[i], z: R.rs.z[i], y: 0.032, wl: STREAM.access.halfW, wr: STREAM.access.halfW });
      acc = ribbon(`${rec.id} access`, 'county', 'county', ap, { exit: X.id, town: rec.id });
      acc.wet = R.bad; acc.detours = R.detours;
      if (R.causeway) {
        acc.causeway = R.causeway;
        // the water's lookup gets only the wet stretches (+-24 m), each its own short ribbon: regions.js tests a point against them
        const wetI = []; for (let i = 0; i < acc.n; i++) if (hardWater(W, acc.x[i], acc.z[i])) wetI.push(i);
        for (let k = 0; k < wetI.length;) { let j = k; while (j + 1 < wetI.length && wetI[j + 1] - wetI[j] <= 2) j++; const a = Math.max(0, wetI[k] - 4), b = Math.min(acc.n - 1, wetI[j] + 4), pts = []; for (let i = a; i <= b; i++) pts.push({ x: acc.x[i], z: acc.z[i] }); const seg = ribbon(`${acc.id} causeway ${k}`, 'county', 'county', pts, { halfW: 3 }); seg.causewayHalf = STREAM.access.halfW + 2.5; (W.causeways ??= []).push(seg); k = j + 1; }
        rep.causeways = (rep.causeways ?? 0) + 1;
      }
      added.ribbons.push(acc);
      if (!reused) X.access = acc;
      (W.townAccess ??= []).push(acc);
      if (R.bad) rep.fords = (rep.fords ?? 0) + 1;
    }
    // lanes on it: the rule (a hamlet's road is one lane: the plain strip, narrower)
    const size = placeSize(rec.kind === 'site' ? { kind: 'site', footprintM: Math.max(...(SITES_BY_ID.get(rec.site)?.footprint ?? [0])), popMax: SITES_BY_ID.get(rec.site)?.society?.pop?.[1] ?? 0 } : { kind: 'town', major: !!rec.major, sizeM: ARCHETYPES[rec.arch]?.sizeM[1] ?? 0, popMax: ARCHETYPES[rec.arch]?.pop[1] ?? 0 });
    const LR = lanesFor({ cls: 'county', size, km: 0, region: facts.region });
    if (acc) { acc.lanes = LR.lanes; acc.laneWhy = LR.why; acc.town = rec.id; if (LR.lanes < 2) { acc.band = 'street'; acc.wl.fill(2.9); acc.wr.fill(2.9); } }
    // the roadside along it
    const detail = [];
    if (acc && acc.n > 8) {
      const fuel = true; // every town keeps a fuel counter (data/towns.js COUNTERS)
      for (const d of ACCESS_DETAIL) {
        if (rec.kind === 'base' && d.kit !== 'town_sign') continue; // a base's approach has its own checkpoints (milbase.js)
        if (d.when === 'gated' && !facts.gated) continue;
        if (d.when === 'walled' && !facts.walled) continue;
        if (d.when === 'big' && size !== 'city' && size !== 'metro') continue;
        if (d.when === 'small' && (size === 'city' || size === 'metro')) continue;
        if (d.when === 'fuel' && !fuel) continue;
        // short roads squeeze their kits: none closer than 20 m to either end, the town sign first
        const at = d.from === 'start' ? d.m : acc.L - d.m;
        if ((at < 20 || at > acc.L - 20) && d.kit !== 'town_sign') continue;
        const F = frameAt(acc, Math.max(0, Math.min(1, at / acc.L)));
        if (nearPinned(F.x, F.z, F.x, F.z, 60)) continue;
        const R = facts, E = REGION_ECON[R.region];
        const lines = {
          town_sign: rec.kind === 'base' ? [rec.name, 'MILITARY RESERVATION', 'NO ENTRY WITHOUT LEAVE'] : [rec.name, `POP ${R.pop}`, 'FUEL · FOOD · AMMO'],
          billboard: [rec.name, 'FUEL · FOOD · AMMO', `EXIT ${X.number} · ${R.walled ? 'WALLED' : 'OPEN'} TOWN`],
          canopy: ['FUEL', rec.name],
          notice_board: [`${rec.name} · NOTICES`, `FUEL ${hh(COUNTERS.fuel.hours[0])}-${hh(COUNTERS.fuel.hours[1])} · FOOD · AMMO`, R.rules[0], `CURFEW ${curfewText(R.curfew)}`, E?.note ?? ''],
          checkpoint: [`${rec.name} CHECKPOINT`, R.rules[0], R.rules[1] ?? 'STATE YOUR BUSINESS'],
        }[d.kit];
        const P = kitParts(d.kit, F, d.side || 1, { lines, seed: (rec.seed >>> (detail.length % 8)) & 7 });
        for (const q of P.structs) added.structs.push({ ...q, exit: X.id, town: rec.id });
        P.signs.forEach((q, k) => { pushSign(cor, { id: `${rec.id}-${d.kit}-${k}`, ...q, town: rec.id, s: undefined }); });
        detail.push(d.kit);
      }
    }
    rep.towns.push({ id: rec.id, name: rec.name, kind: rec.kind, cor: cor.id, exit: X.id, number: X.number, reused, s: Math.round(X.s), access: acc ? { id: acc.id, m: Math.round(acc.L), lanes: acc.lanes, band: acc.band } : null, entry: { x: Math.round(e.x), z: Math.round(e.z), gate: !!e.gate }, detail, facts: { pop: facts.pop, cls: facts.cls, gated: facts.gated, region: facts.region, rules: facts.rules, curfew: facts.curfew } });
    rec.access = { exit: X.id, number: X.number, cor: cor.id, ribbon: acc?.id ?? null, entry: { x: e.x, z: e.z } };
  }
  // the exit lists keep their shape (code reads W.exits[0] as I-10's first): I-10's own, sorted, then every region's in
  // the order they were laid (a town's exit after them); each corridor's own list sorted along it
  for (const cor of cors) (cor === W.i10 ? W.i10.exits : cor.exits).sort((a, b) => a.s - b.s);
  W.exits = [...W.i10.exits, ...W.exits.filter((X) => X.cor && X.cor !== W.i10)];
  relabelBillboards(W, cors);
  // 2. in, then the lane rule on every interstate (after the new exits: an added lane never runs through an interchange).
  // relayLanes runs again whenever the water re-plans its decks (WorldIndex.applyWater: real terrain on), so an added lane
  // never stands on a bridge it did not know about; signs and mileposts are set out from where they stood (their base).
  W.ribbons.push(...added.ribbons); W.structs.push(...added.structs); W.signs.push(...added.signs);
  if (W.signs0) W.signs0.push(...added.signs.map((q) => ({ ...q })));
  const places = placesOf(W, plan);
  W.relayLanes = () => relayLanes(W, cors, places, rep);
  // the water plan again, now with the towns' roads in it (a deck or a ford where one crosses a river; it lays the lanes
  // through relayLanes and buckets everything)
  if (W.water) W.applyWater(true); else { W.relayLanes(); W.bucketFeatures(); }
  rep.signs = added.signs.length; rep.structs = added.structs.length; rep.ribbons = added.ribbons.length;
  rep.ms = +(performance.now() - t0).toFixed(1);
  W.townRoads = rep;
  return rep;
}

export function relabelBillboards(W, cors) {
  const R = W.roadside; if (!R) return 0;
  let n = 0;
  for (const b of R.billboards) {
    if (b.kind !== 'exit') continue;
    const cor = cors.find((c) => c.id === b.road); if (!cor) continue;
    const dir = b.dir === cor.dirs[0][0] ? 1 : -1, list = cor === W.i10 ? W.i10.exits : cor.exits;
    const X = list.filter((o) => (o.s - b.s) * dir > 0).sort((p, q) => Math.abs(p.s - b.s) - Math.abs(q.s - b.s))[0];
    if (!X || X.id === b.next?.id) continue;
    const miles = Math.max(1, Math.round(Math.abs(X.s - b.s) / MI));
    b.next = { id: X.id, number: X.number, name: X.name, miles, metres: Math.round(Math.abs(X.s - b.s)), dead: !!X.dead };
    const face = R.faces.find((f) => f.id === b.id) ?? R.pendingBills?.find((q) => q.id === b.id)?.face;
    if (face) face.lines = [`EXIT ${X.number}`, X.name, `${miles} ${miles === 1 ? 'MILE' : 'MILES'}`, X.dead ? 'NO SERVICES' : X.townRec ? 'FUEL · FOOD · AMMO' : X.holdout ? 'HOLDOUT · SAFE BEDS' : X.tags?.length ? X.tags.slice(0, 3).join(' · ').toUpperCase() : ''];
    b.lines = face ? face.lines.filter(Boolean) : b.lines;
    n++;
  }
  return n;
}

export function relayLanes(W, cors, places, rep = null) {
  W.ribbons = W.ribbons.filter((r) => !r.lane);
  for (const cor of cors) {
    const prof = laneProfile(W, cor, places), { runs, dropped } = laneRunsOf(prof);
    if (cor === W.i10) W.laneRuns = runs; else cor.laneRuns = runs;
    cor.laneProfile = prof;
    W.ribbons.push(...laneRibbons(W, cor, runs, cor.id));
    if (rep) rep.lanes[cor.id] = { runs: runs.map((r) => [Math.round(r.s0), Math.round(r.s1)]), km6: +(runs.reduce((a, r) => a + r.s1 - r.s0, 0) / 1000).toFixed(1), km: +(cor.L / 1000).toFixed(1), dropped: dropped.length, held: prof.filter((p) => p.held).length };
  }
  // what stands at the old outer edge moves out with the added lane: from its base, so a second pass never doubles it
  const corOf = (sg) => (sg.cor ? cors.find((c) => c.id === sg.cor) : !sg.region ? W.i10 : cors.find((c) => sg.id?.startsWith(`${c.id}:`)));
  let moved = 0;
  for (const sg of W.signs) {
    if (!Number.isFinite(sg.s) || !sg.dir) continue;
    const cor = corOf(sg); if (!cor) continue;
    sg.bx ??= sg.x; sg.bz ??= sg.z;
    const ex = cor.section(sg.s).extra, f = cor.at(sg.s);
    sg.x = sg.bx + f.nx * sg.dir * ex; sg.z = sg.bz + f.nz * sg.dir * ex; if (ex) moved++;
  }
  for (const m of W.mileposts ?? []) {
    const cor = m.cor ? cors.find((c) => c.id === m.cor) : W.i10; if (!cor) continue;
    m.bx ??= m.x; m.bz ??= m.z;
    const s = m.mile * MI, ex = cor.section(s).extra, f = cor.at(s), dir = (m.bx - f.x) * f.nx + (m.bz - f.z) * f.nz >= 0 ? 1 : -1;
    m.x = m.bx + f.nx * dir * ex; m.z = m.bz + f.nz * dir * ex; if (ex) moved++;
  }
  if (rep) rep.moved = moved;
  return moved;
}

// ---- the check: every town reaches the interstate network, by its own road ------------------------------------------------
// For the streamed world (the plan) and the national map (usmap.json: towns, roads, interstates): a town is served when an
// access road leaves an interchange for it, or (the national map) when it is on an interstate or one of its roads meets an
// interstate away from any city (a road that only meets the interstate inside a city is "through a city": Robert's case).
export function auditTownRoads(W, plan, usmap) {
  const errors = [], rows = [];
  for (const rec of (plan ?? []).filter((r) => !r.beyond && (r.kind === 'town' || r.kind === 'site' || r.kind === 'base') && W.inWorld(r.x, r.z, -50))) {
    const a = rec.access, rb = a?.ribbon && W.ribbons.find((r) => r.id === a.ribbon);
    const X = a && [...(W.exits ?? []), ...Object.values(W.regions ?? {}).flatMap((R) => R.corridors.flatMap((c) => c.exits))].find((q) => q.id === a.exit);
    let why = null;
    if (!a) why = 'no access';
    else if (!X) why = `exit ${a.exit} not built`;
    else if (!rb) why = 'no access road';
    else { const end = Math.hypot(rb.x[rb.n - 1] - a.entry.x, rb.z[rb.n - 1] - a.entry.z); if (end > 30) why = `the road ends ${Math.round(end)} m short of the town`; }
    if (!why) { let bad = 0; for (let i = 4; i < rb.n - 4; i += 2) if (hardWater(W, rb.x[i], rb.z[i]) || nearPinned(rb.x[i], rb.z[i], rb.x[i], rb.z[i], 0)) bad++; if (bad) why = `${bad} points of its road are in the sea, a lagoon, a canal or a pinned chunk`; }
    if (!why) { const other = (plan ?? []).find((r) => r !== rec && !r.beyond && (() => { for (let i = 4; i < rb.n - 4; i += 3) if (Math.abs(rb.x[i] - r.x) < r.half - 5 && Math.abs(rb.z[i] - r.z) < r.half - 5) return true; return false; })()); if (other) why = `its road runs through ${other.name}`; }
    rows.push({ id: rec.id, name: rec.name, ok: !why, why, exit: a?.number ?? null });
    if (why) errors.push(`${rec.name} (${rec.id}): ${why}`);
  }
  // the national map
  const nat = [];
  if (usmap) {
    const seg = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); };
    const dl = (p, pts) => { let m = Infinity; for (let i = 1; i < pts.length; i++) m = Math.min(m, seg(p, pts[i - 1], pts[i])); return m; };
    const cities = usmap.towns.filter((t) => t.kind === 'city'), hw = usmap.interstates;
    const servedByExit = (t) => usmap.exits.some((x) => x.dest && Math.hypot(x.dest[0] - t.pos[0], x.dest[1] - t.pos[1]) < 2500);
    for (const t of usmap.towns) {
      const d = Math.min(...hw.map((h) => dl(t.pos, h.pts)));
      if (d < 800 || servedByExit(t)) { nat.push({ id: t.id, ok: true, by: d < 800 ? 'on the interstate' : 'an exit' }); continue; }
      const roads = usmap.roads.filter((r) => dl(t.pos, r.pts) < 600);
      const open = roads.some((r) => r.pts.some((p) => hw.some((h) => dl(p, h.pts) < 300) && !cities.some((c) => c.id !== t.id && Math.hypot(c.pos[0] - p[0], c.pos[1] - p[1]) < 2500)));
      nat.push({ id: t.id, ok: open, by: open ? 'its road meets an interstate in the open' : roads.length ? 'only through a city' : 'no road' });
      if (!open) errors.push(`national map: ${t.name} reaches the interstates ${roads.length ? 'only through a city' : 'by no road'}`);
    }
  }
  return { ok: !errors.length, errors, towns: rows, national: nat };
}
