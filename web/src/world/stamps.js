// THE WORLD TOOLS' fold (docs/design/WEB_WORLD_TOOLS.md §3): stamp rows (src/data/stamps.json, written by the World
// Forge's STAMP tab and the `stamp` command) into what the engine already reads. Nothing here builds geometry: a REGION
// stamp becomes a region row world/regions.js builds like Florida's; an EXIT stamp becomes one of its exit rows
// (world/worldindex.js addExit lays the interchange); a CITY stamp and its NEIGHBOURHOODS, the BUILDINGS OUTSIDE CITIES
// and the state's MILITARY BASE become citygen records (systems/citygen.js planWorld stamps them as it stamps its own).
// Pure: the rows, the usmap and the seed. Two boots fold the same world; an empty stamps file folds to nothing.
import STAMPS from '../data/stamps.json';
import USMAP from '../data/usmap.json';
import { REGIONS } from '../data/regions.js';
import { LOOKS, CLIMATES, CITY_SIZES, HOOD_KINDS, EXIT_OFFERS, OUTSIDE_KINDS, OUTSIDE_DENSITY, OUTSIDE_RULES, validateStamps } from '../data/worldtools.js';
import { toWorldX, toWorldZ, hash32 } from './geo.js';

export { STAMPS };
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---- regions -------------------------------------------------------------------------------------------------------------
// Two boxes share an edge when one's side lies on the other's (within a metre) over some length: the interval in usmap m.
export function sharedEdges(a, b) {
  const out = [];
  const ov = (p0, p1, q0, q1) => { const lo = Math.max(p0, q0), hi = Math.min(p1, q1); return hi - lo > 1 ? [lo, hi] : null; };
  let I;
  if (Math.abs(a.y0 - b.y1) < 1 && (I = ov(a.x0, a.x1, b.x0, b.x1))) out.push({ side: 'N', y: a.y0, x0: I[0], x1: I[1] }); // a's north edge (small y) on b's south
  if (Math.abs(a.y1 - b.y0) < 1 && (I = ov(a.x0, a.x1, b.x0, b.x1))) out.push({ side: 'S', y: a.y1, x0: I[0], x1: I[1] });
  if (Math.abs(a.x0 - b.x1) < 1 && (I = ov(a.y0, a.y1, b.y0, b.y1))) out.push({ side: 'W', x: a.x0, y0: I[0], y1: I[1] });
  if (Math.abs(a.x1 - b.x0) < 1 && (I = ov(a.y0, a.y1, b.y0, b.y1))) out.push({ side: 'E', x: a.x1, y0: I[0], y1: I[1] });
  return out;
}
const inside = (b, p) => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1;

// The interstates a region stamp carries: every usmap interstate with a run inside the box, run SOUTH to NORTH (an exit
// number is its milepost from the region's south end, the real state rule). Where a neighbour region's corridor of the same
// road crosses the shared edge, this one starts on THAT corridor's line (its last point inside the neighbour and the next
// one), so the two built roads meet at the edge on one line: no gap, no step (the seam law).
export function corridorsFor(stamp, neighbours, U = USMAP) {
  const b = stamp.box, out = [];
  for (const r of U.interstates) {
    if ((stamp.roads && !stamp.roads.includes(r.id))) continue;
    let P = r.pts.map((p) => [p[0], p[1]]);
    if (!P.some((p) => inside(b, p)) && !segCrosses(P, b)) continue;
    if (P[0][1] < P[P.length - 1][1]) P.reverse(); // south (large usmap y) first
    for (const N of neighbours) {
      const cr = N.row.corridors?.find((c) => c.id === r.id);
      if (!cr) continue;
      const Q = cr.pts;
      let k = -1;
      for (let i = Q.length - 2; i >= 0; i--) if (inside(N.row.box, Q[i]) && !inside(N.row.box, Q[i + 1])) { k = i; break; }
      if (k < 0 || !inside(b, Q[k + 1]) && !segCrosses([Q[k], Q[k + 1]], b)) continue;
      // splice: the neighbour's tail, then this road's own points from the first one past the tail's end (further north)
      const yEnd = Q[k + 1][1], j = P.findIndex((p) => p[1] < yEnd - 5);
      P = [[...Q[k]], [...Q[k + 1]], ...(j >= 0 ? P.slice(j) : [])];
      break;
    }
    // a run shorter than 3 usmap km inside the box is not worth a corridor (it clips a corner)
    let len = 0;
    for (let i = 1; i < P.length; i++) if (inside(b, P[i]) || inside(b, P[i - 1])) len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    if (len < 3000) continue;
    out.push({ id: r.id, dirs: ['NORTH', 'SOUTH'], salt: hashStr(`${stamp.id}:${r.id}`) & 0xffff, pts: P, stamped: true });
  }
  return out;
}
function segCrosses(P, b) {
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1], [bx, by] = P[i];
    if (Math.max(ax, bx) < b.x0 || Math.min(ax, bx) > b.x1 || Math.max(ay, by) < b.y0 || Math.min(ay, by) > b.y1) continue;
    for (let t = 0; t <= 1; t += 1 / 32) if (inside(b, [ax + (bx - ax) * t, ay + (by - ay) * t])) return true;
  }
  return false;
}

// A region stamp -> a region row (the fields world/regions.js and world/worldindex.js read, as REGIONS.florida has them).
export function regionRow(stamp, doc = STAMPS, base = REGIONS) {
  const L = LOOKS[stamp.look] ?? LOOKS.southeast_pine, from = L.from ? base[L.from] : null;
  const biomes = { ...(from ? clone(from.biomes) : {}), ...clone(L.biomes ?? {}) };
  const neighbours = Object.entries(base).filter(([, r]) => r.box && sharedEdges(stamp.box, r.box).length).map(([id, row]) => ({ id, row }));
  const corridors = corridorsFor(stamp, neighbours);
  const exits = (doc.exits ?? []).filter((x) => x.region === stamp.id).map((x) => {
    const O = EXIT_OFFERS[x.offers] ?? EXIT_OFFERS.nothing;
    return { road: x.road, mile: x.mile, name: x.name, archetype: O.archetype, tier: x.tier ?? O.tier, tags: x.tags ?? O.tags, risk: x.risk ?? 2, side: x.side ?? 'E', m: x.m ?? 560,
      ...(O.structures ? { structures: O.structures } : {}), stamp: x.id };
  });
  const C = CLIMATES[stamp.climate] ?? CLIMATES.humid_subtropical, danger = stamp.danger ?? 2;
  return {
    id: stamp.id, name: stamp.name ?? stamp.id.toUpperCase(), state: stamp.state ?? null, box: { ...stamp.box }, stamped: true,
    look: stamp.look, climate: stamp.climate ?? 'humid_subtropical', danger, lean: { ...(stamp.lean ?? {}) },
    wall: clone(L.wall ?? from?.wall), corridors, exits, ground: L.ground ?? from?.ground ?? 'marsh',
    biomes, sand: from?.sand ?? [0.98, 0.92, 0.74], mud: from?.mud ?? [0.42, 0.4, 0.3], wet: from?.wet ?? [0.58, 0.6, 0.46],
    shrubs: clone(from?.shrubs ?? { palmetto: '#5e7a34', sawgrass: '#a8a05a' }),
    // inland: no Atlantic; the grid's own ocean cells (if any) and sloughs in the swamp rows
    water: { gulf: { wave: 900, amp: 0.28, slope: 40, max: 8 }, slough: { wave: 210, cut: 0.69, depth: 7, max: 1.9, clearRoad: 70, clearTown: 140 } },
    life: { fauna: from?.life?.fauna?.map((f) => ({ ...f, perKm2: f.perKm2 * C.wet })) ?? [],
      infected: { density: 1 + danger * 0.25, dayHerds: [1 + Math.floor(danger / 2), 2 + danger], nightHerds: [2 + danger, 4 + danger], every: 9, cap: 14 + danger * 4, runners: 0.1 + danger * 0.04, never: 'holdout' } },
    citygen: { ...(L.citygen ?? {}) },
    autoTowns: stamp.autoTowns ?? false, // the country's own town scatter stays off a stamped region: its cities are stamps
  };
}

// Every stamped region as rows (the hand-authored REGIONS first: a stamp never replaces one).
let _folded = null;
export function stampedRegions(doc = STAMPS) {
  if (doc === STAMPS && _folded) return _folded;
  const out = {};
  for (const s of doc.regions ?? []) { if (REGIONS[s.id] || !s.box) continue; out[s.id] = regionRow(s, doc, { ...REGIONS, ...out }); }
  if (doc === STAMPS) _folded = out;
  return out;
}
export function resetFold() { _folded = null; }

// ---- citygen records: cities and their hoods, the outside places, the base overrides ----------------------------------
// Returns { records: [rec...], bases: Map(milbase id -> {x, z}), report } for planWorld (systems/citygen.js). W: the
// WorldIndex (towns, regions, corridors, inWorld). free(x, z, half): planWorld's own clearance test.
export function stampRecords(W, seed, free, doc = STAMPS) {
  const recs = [], report = { cities: [], hoods: 0, outside: 0, density: [], bases: [] };
  const towns = new Map((W.towns ?? []).map((t) => [t.id, t]));
  const regionOf = (id) => W.regions?.[id] ?? null;
  const biomeAt = (x, z) => { const R = W.regionOf?.(x, z); const ch = W.biomeAt?.(x, z) ?? 'F'; return R?.row?.citygen?.[ch] ?? 'temperate_forest'; };
  const taken = [];
  const clear = (x, z, half) => !taken.some((o) => Math.abs(o.x - x) < o.half + half + 20 && Math.abs(o.z - z) < o.half + half + 20);
  // CITIES: the centre is the usmap town (or pos); the hoods are the stamp's own, else the size class's ring.
  for (const c of doc.cities ?? []) {
    const S = CITY_SIZES[c.size]; if (!S) continue;
    const t = c.town ? towns.get(c.town) : null;
    const cx = c.pos ? toWorldX(c.pos[0]) : t?.x, cz = c.pos ? toWorldZ(c.pos[1]) : t?.z;
    if (!Number.isFinite(cx)) continue;
    const mine = (doc.hoods ?? []).filter((h) => h.city === c.id);
    const hoods = mine.length ? mine : S.ring.map(([kind, ang, d], i) => ({ id: `${c.id}-${kind}-${i}`, city: c.id, kind, at: [Math.round(Math.cos((ang * Math.PI) / 180) * d), Math.round(Math.sin((ang * Math.PI) / 180) * d)], auto: true }));
    const rep = { id: c.id, name: c.name, x: Math.round(cx), z: Math.round(cz), hoods: [] };
    for (const h of hoods) {
      const H = HOOD_KINDS[h.kind]; if (!H) continue;
      const hs = makeSeed(seed, `${c.id}/${h.id}`), size = h.size ?? Math.round(H.size[0] + ((hs >>> 8) % 1000) / 1000 * (H.size[1] - H.size[0]));
      const x = Math.round(cx + h.at[0]), z = Math.round(cz + h.at[1]), half = size / 2 + 30;
      const ok = W.inWorld?.(x, z, -half) !== false && clear(x, z, half);
      rep.hoods.push({ id: h.id, kind: h.kind, x, z, size, ok });
      if (!ok) continue;
      const rec = { kind: 'town', arch: H.arch, biome: biomeAt(x, z), half, size, x, z, seed: hs, name: `${(c.name ?? c.id).toUpperCase()} ${H.name.toUpperCase()}`,
        city: c.id, hood: h.kind, stamp: h.auto ? c.id : h.id, ...(H.walls ? { wallsOverride: H.walls, gated: true, guards: H.guards ?? 2 } : {}) };
      recs.push(rec); taken.push(rec); report.hoods++;
    }
    report.cities.push(rep);
  }
  // OUTSIDE: one place, or a density row along the region's roads (its corridors, both sides) at believable spacing.
  const towners = [...(W.towns ?? []).filter((t) => t.built || t.holdout), ...recs];
  const exitDests = (W.corridors ?? []).flatMap((cor) => cor.exits ?? []).map((X) => X.dest).filter(Boolean);
  const okOutside = (x, z, half) => {
    if (!clear(x, z, half)) return false;
    for (const t of towners) if (Math.hypot(t.x - x, t.z - z) < OUTSIDE_RULES.clearTown + (t.half ?? 0)) return false;
    for (const d of exitDests) if (Math.hypot(d.x - x, d.z - z) < OUTSIDE_RULES.clearExit) return false;
    return free ? free(x, z, half) : true;
  };
  const RURAL_HALF = (kind) => { const r = OUTSIDE_KINDS[kind]?.rural; return r ? 60 : 50; };
  for (const o of doc.outside ?? []) {
    if (o.mix) continue;
    const K = OUTSIDE_KINDS[o.kind]; if (!K || !o.pos) continue;
    const x = Math.round(toWorldX(o.pos[0])), z = Math.round(toWorldZ(o.pos[1])), half = RURAL_HALF(o.kind);
    if (!okOutside(x, z, half)) { report.density.push({ id: o.id, placed: 0, why: 'no clear ground' }); continue; }
    const rec = { kind: 'rural', arch: K.rural, biome: biomeAt(x, z), half, x, z, seed: makeSeed(seed, o.id), front: o.front ?? 'N', name: (o.name ?? K.name).toUpperCase(), stamp: o.id, outside: o.kind };
    recs.push(rec); taken.push(rec); report.outside++;
  }
  for (const o of doc.outside ?? []) {
    if (!o.mix) continue;
    const R = regionOf(o.region); if (!R) continue;
    const rng = rngOf(makeSeed(seed, o.id));
    const placed = {}; let n = 0;
    for (const cor of R.corridors ?? []) {
      const mix = o.mix.interstate ?? OUTSIDE_DENSITY.interstate;
      for (let s = OUTSIDE_RULES.step; s < cor.L - OUTSIDE_RULES.step && n < OUTSIDE_RULES.maxPerRegion; s += OUTSIDE_RULES.step) {
        for (const [kind, perKm] of Object.entries(mix)) {
          if (rng() >= (perKm * OUTSIDE_RULES.step) / 1000) continue;
          const K = OUTSIDE_KINDS[kind]; if (!K) continue;
          const f = cor.at(s), sd = rng() < 0.5 ? 1 : -1, off = 140 + rng() * 160, half = RURAL_HALF(kind);
          const x = Math.round(f.x + f.nx * sd * off), z = Math.round(f.z + f.nz * sd * off);
          if (!okOutside(x, z, half) || recs.some((q) => q.outside && Math.hypot(q.x - x, q.z - z) < OUTSIDE_RULES.apart)) continue;
          const front = Math.abs(f.nx) > Math.abs(f.nz) ? (f.nx * sd > 0 ? 'W' : 'E') : (f.nz * sd > 0 ? 'N' : 'S');
          const rec = { kind: 'rural', arch: K.rural, biome: biomeAt(x, z), half, x, z, seed: makeSeed(seed, `${o.id}:${cor.id}:${s}`), front, name: K.name.toUpperCase(), stamp: o.id, outside: kind, cor: cor.id, s };
          recs.push(rec); taken.push(rec); placed[kind] = (placed[kind] ?? 0) + 1; n++;
          break; // one place a step
        }
      }
    }
    report.density.push({ id: o.id, region: o.region, placed: n, byKind: placed });
    report.outside += n;
  }
  // BASES: the state's row moved onto ground inside the drivable region (planWorld places it near this point).
  const bases = new Map();
  for (const b of doc.bases ?? []) { const at = b.at ? { x: toWorldX(b.at[0]), z: toWorldZ(b.at[1]) } : null; bases.set(b.milbase, at); report.bases.push({ id: b.id, state: b.state, milbase: b.milbase, at: at ? [Math.round(at.x), Math.round(at.z)] : null }); }
  return { records: recs, bases, report };
}
const makeSeed = (seed, s) => (hashStr(s) ^ (seed >>> 0)) >>> 0;
function rngOf(s) { let a = s >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// The check with the engine's tables (the forge page, the command and the selftest call this one).
export async function validateWithEngine(doc = STAMPS) {
  const [{ ARCHETYPES, RURAL }, { MILBASES_BY_ID }] = await Promise.all([import('../data/citygen.js'), import('../data/milbases.js')]);
  return validateStamps(doc, { usmap: USMAP, regions: REGIONS, milbases: MILBASES_BY_ID, archetypes: ARCHETYPES, rural: RURAL });
}
export { hash32 };
