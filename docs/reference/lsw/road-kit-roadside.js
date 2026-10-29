// ROAD KIT · ROADSIDE SCENES v1 (2026-10-03). Pure data + pure functions. What stands beside the road between cities,
// by biome (between-cities.js BIOME_IDS) and road class (road-kit.js KIT_CLASSES). Docs: docs/ROADKIT.md.
//
// POSITION-SEEDED, LOCALITY LAW (data/neighborhoods.js): every roll is a hash of (seed, axis, line, block, slot, kind), never a
// stream, so the same place + seed always gives the same roadside byte for byte and a knob or an edit moves only the slots it touches.
//   slot   = 336 u of road on one side of the road (4 per World Cell, a scene never crosses a cell edge)
//   block  = 8 slots (2 cells): scenes are placed greedily inside one block, so they never depend on a neighbouring block
//   super  = 3 blocks (6 cells, ~1.5 km): the "see nothing for a while" decision and the service stop (rest area / gas) live here
// Frame: canonical travel frame of a straight cell (x along the road, z across; +z = the RIGHT-hand side). Placements are also given in
// cell-local world coordinates (rotated for N-S roads), with a facing vector.
import { KIT_CLASSES, H, rollOf, isFreeway, rankOf } from './road-kit.js';
import { BIOME_IDS } from './world-engine/between-cities.js';

export const SLOT = 336, SLOTS_PER_CELL = 4, BLOCK_SLOTS = 8, SUPER_BLOCKS = 3;
export const SCENE_GROUPS = Object.freeze({ houses: 'houses', wall: 'walls', signage: 'signage', nature: 'nature', farm: 'farm', service: 'services' });
export const DEFAULT_KNOBS = Object.freeze({ density: 1, nothing: 1, houses: 1, walls: 1, signage: 1, nature: 1, farm: 1, services: 1 });
const EMPTY_WEIGHT = 6;                                  // weight of "nothing here" in a slot at density 1

const ALL = ['interstate', 'divided', 'two-lane', 'street', 'rural', 'dirt'];
const W = (o, dflt = 0) => Object.fromEntries(BIOME_IDS.map(b => [b, o[b] ?? dflt]));
/**
 * SCENES. weights = biome base weight x byClass multiplier x group knob x (near-city term). props: what is placed.
 *   n [min,max] count · set [min,max] setback in u beyond the clear zone (the verge) · strip: a continuous run, not points
 *   face: 'road' | 'away' | 'along' · side: 'one' (a hashed side) | 'both' · span: slots (1-2) · y: height in u when it matters
 */
export const SCENES = Object.freeze({
  'houses-off-road': { label: 'A few houses off the road', group: 'houses', span: 2, side: 'one', weights: W({ forest: 3, farmland: 2.2, wetland: 1.2, grassland: 0.7, tundra: 0.5 }), byClass: { 'two-lane': 1, rural: 1.2, divided: 0.4, dirt: 0.3 },
    props: [{ prop: 'house', n: [1, 4], set: [60, 150], face: 'road' }, { prop: 'driveway', n: [1, 2], set: [0, 0], face: 'road', note: 'dirt drive from the shoulder to each house' }, { prop: 'tree-screen', n: [2, 5], set: [30, 60], face: 'away' }] },
  'soundwall-houses': { label: 'Houses behind the sound wall', group: 'wall', span: 2, side: 'one', weights: W({}, 1), byClass: { interstate: 1, divided: 0.7 }, nearCity: 4,
    props: [{ prop: 'sound-wall', strip: true, set: [4, 4], y: 40, face: 'road' }, { prop: 'house', n: [3, 6], set: [80, 120], face: 'away', note: 'backs to the wall, seen over it' }] },
  'billboard': { label: 'Billboard', group: 'signage', span: 1, side: 'one', weights: W({ forest: 0.6, farmland: 1, grassland: 1.3, desert: 1.5, tundra: 0.25, wetland: 0.5 }), byClass: { interstate: 3, divided: 2, 'two-lane': 0.5, rural: 0 }, nearCity: 6,
    props: [{ prop: 'billboard', n: [1, 1], set: [10, 18], face: 'road', y: 45 }] },
  'billboard-pair': { label: 'Billboard pair', group: 'signage', span: 2, side: 'both', weights: W({ grassland: 0.7, desert: 0.9, farmland: 0.6 }), byClass: { interstate: 1.6, divided: 0.8 }, nearCity: 5,
    props: [{ prop: 'billboard', n: [2, 2], set: [10, 18], face: 'road', y: 45 }] },
  'tree-wall': { label: 'Woods close to the road', group: 'nature', span: 2, side: 'both', weights: W({ forest: 6, wetland: 1.6, tundra: 2.2, farmland: 0.7, grassland: 0.2 }), byClass: { 'two-lane': 1.6, rural: 1.8, dirt: 2.4, divided: 0.9, interstate: 0.5 },
    props: [{ prop: 'tree-wall', strip: true, set: [1, 6], depth: [120, 320], face: 'road' }] },
  'open-view': { label: 'Open view, nothing in it', group: 'nature', span: 1, side: 'both', weights: W({ desert: 1.5, grassland: 1.5, tundra: 1.2, farmland: 0.8, wetland: 0.5 }), byClass: { interstate: 1, divided: 1, 'two-lane': 1, rural: 1, dirt: 1 },
    props: [{ prop: 'rock', n: [0, 2], set: [60, 400], face: 'away' }] },
  'farm-lane': { label: 'Farm lane to a farmhouse', group: 'farm', span: 2, side: 'one', weights: W({ farmland: 4, grassland: 1.6, forest: 0.5 }), byClass: { 'two-lane': 1, rural: 1.5, divided: 0.3, dirt: 0.6 },
    props: [{ prop: 'farm-lane', lane: true, len: [140, 330], set: [0, 0] }, { prop: 'mailbox', n: [1, 1], set: [4, 8], face: 'road' }, { prop: 'farmhouse', n: [1, 1], end: true, set: [0, 20], face: 'road' }, { prop: 'barn', n: [1, 1], end: true, set: [30, 70], face: 'road' }, { prop: 'silo', n: [0, 2], end: true, set: [40, 90], face: 'away' }] },
  'field-fence': { label: 'Crop field behind a fence', group: 'farm', span: 2, side: 'both', weights: W({ farmland: 3.5, grassland: 1.5 }), byClass: { 'two-lane': 1, rural: 1.3, divided: 0.8, interstate: 0.6, dirt: 0.8 },
    props: [{ prop: 'fence', strip: true, set: [2, 4], y: 6, face: 'road' }, { prop: 'crop-field', strip: true, set: [6, 8], depth: [220, 480], face: 'away' }] },
  'windmill-stock': { label: 'Windmill and stock tank', group: 'farm', span: 1, side: 'one', weights: W({ grassland: 2.4, farmland: 0.8, desert: 0.5 }), byClass: { 'two-lane': 1, rural: 1.2, divided: 0.7, interstate: 0.5, dirt: 0.8 },
    props: [{ prop: 'windmill', n: [1, 1], set: [40, 120], face: 'road', y: 60 }, { prop: 'stock-tank', n: [1, 1], set: [40, 120], face: 'road' }, { prop: 'cattle-fence', strip: true, set: [3, 5], y: 6, face: 'road' }] },
  'power-line': { label: 'Power line along the road', group: 'nature', span: 2, side: 'one', weights: W({ farmland: 1.4, grassland: 1.4, desert: 1.2, forest: 0.5, tundra: 0.3 }), byClass: { 'two-lane': 1, rural: 1.2, divided: 0.8, interstate: 0.7, dirt: 0.4 },
    props: [{ prop: 'power-pole', n: [2, 3], set: [10, 22], face: 'along', y: 55 }] },
  'scrub-buttes': { label: 'Scrub and a butte', group: 'nature', span: 2, side: 'both', weights: W({ desert: 5, grassland: 0.8 }), byClass: { interstate: 1, divided: 1, 'two-lane': 1, rural: 1, dirt: 1 },
    props: [{ prop: 'scrub', n: [3, 8], set: [8, 120], face: 'away' }, { prop: 'butte', n: [0, 1], set: [260, 520], face: 'away', y: 140 }] },
  'snow-line': { label: 'Snow fence and marker poles', group: 'nature', span: 2, side: 'both', weights: W({ tundra: 5 }), byClass: { interstate: 1, divided: 1, 'two-lane': 1.2, rural: 1, dirt: 0.6 },
    props: [{ prop: 'snow-pole', n: [3, 5], set: [3, 6], face: 'along', y: 28 }, { prop: 'snow-fence', strip: true, set: [30, 45], y: 10, face: 'road' }, { prop: 'fir-clump', n: [1, 3], set: [60, 200], face: 'away' }] },
  'causeway-reeds': { label: 'Reeds, standing water, a stilt shack', group: 'nature', span: 2, side: 'both', weights: W({ wetland: 6 }), byClass: { 'two-lane': 1.3, rural: 1.2, divided: 0.9, interstate: 0.8, dirt: 1 },
    props: [{ prop: 'cattails', n: [4, 9], set: [3, 40], face: 'away' }, { prop: 'standing-water', strip: true, set: [6, 12], depth: [120, 280], face: 'away' }, { prop: 'stilt-shack', n: [0, 1], set: [80, 180], face: 'road', y: 28 }] },
  'rest-stop': { label: 'Rest stop', group: 'service', span: 2, side: 'one', weights: W({ forest: 1, farmland: 1, grassland: 1, desert: 1, tundra: 0.7, wetland: 0.6 }), byClass: { interstate: 3, divided: 1.2, 'two-lane': 0.3, rural: 0, dirt: 0 },
    props: [{ prop: 'pull-off', n: [1, 1], set: [0, 0], face: 'along', note: 'diverge, parking, merge' }, { prop: 'rest-building', n: [1, 1], set: [50, 70], face: 'road' }, { prop: 'picnic', n: [2, 4], set: [40, 110], face: 'away' }, { prop: 'parking', n: [1, 1], set: [18, 30], face: 'along' }] },
  'gas-stop': { label: 'Gas stop and diner', group: 'service', span: 2, side: 'one', weights: W({ forest: 1, farmland: 1.2, grassland: 1.4, desert: 1, tundra: 1, wetland: 0.9 }), byClass: { 'two-lane': 2, rural: 1, divided: 1.6, interstate: 1.3, dirt: 0 },
    props: [{ prop: 'gas-station', n: [1, 1], set: [20, 40], face: 'road' }, { prop: 'diner', n: [0, 1], set: [40, 70], face: 'road' }, { prop: 'parking', n: [1, 1], set: [10, 20], face: 'along' }] },
  'truck-stop': { label: 'Truck stop and motel', group: 'service', span: 2, side: 'one', weights: W({ desert: 3, grassland: 1.6, farmland: 0.6, forest: 0.3 }), byClass: { interstate: 3, divided: 1.8, 'two-lane': 0.2 },
    props: [{ prop: 'gas-station', n: [1, 1], set: [24, 40], face: 'road' }, { prop: 'truck-park', n: [1, 1], set: [18, 30], face: 'along' }, { prop: 'diner', n: [1, 1], set: [50, 70], face: 'road' }, { prop: 'motel', n: [0, 1], set: [90, 130], face: 'road' }] },
});
export const SCENE_IDS = Object.freeze(Object.keys(SCENES));
const SERVICE_IDS = SCENE_IDS.filter(id => SCENES[id].group === 'service');
/** Chance a super-block (6 cells) of nothing: the long empty stretches of the country. Biome base x class factor. */
export const NOTHING_CHANCE = Object.freeze({ desert: 0.5, tundra: 0.5, grassland: 0.38, farmland: 0.2, wetland: 0.22, forest: 0.12 });
const NOTHING_CLASS = { interstate: 1.15, divided: 1.1, 'two-lane': 1, rural: 0.85, dirt: 0.7 };
/** Chance a super-block holds a service stop (rest area / gas), by class: an expressway has one every few km. */
export const SERVICE_CHANCE = Object.freeze({ interstate: 0.85, divided: 0.6, 'two-lane': 0.45, rural: 0.25, dirt: 0, street: 0 });

const knobOf = (knobs, group) => (knobs[SCENE_GROUPS[group]] ?? 1);
/** Eligible scenes for a slot: [{ id, w }]. cityDist = cells to the nearest city (near-city scenes ramp up as it falls). */
export function eligible(biome, cls, { cityDist = 99, knobs = DEFAULT_KNOBS, maxSpan = 2, servicesOnly = false } = {}) {
  const k = { ...DEFAULT_KNOBS, ...knobs }, out = [];
  for (const id of SCENE_IDS) {
    const s = SCENES[id]; if (s.span > maxSpan) continue; if (servicesOnly !== (s.group === 'service')) continue;
    let w = (s.weights[biome] ?? 0) * (s.byClass[cls] ?? 0) * (servicesOnly ? 1 : k.density) * knobOf(k, s.group);
    if (s.nearCity) { if (cityDist > s.nearCity + 2) w *= 0.25; else w *= 1 + (s.nearCity - Math.min(cityDist, s.nearCity)) * 0.9; }
    if (id === 'soundwall-houses' && cityDist > s.nearCity) w = 0;           // a sound wall only exists where the city's houses are
    if (w > 0) out.push({ id, w });
  }
  return out;
}
const pickW = (items, r) => { const t = items.reduce((s, x) => s + x.w, 0); let x = r * t; for (const it of items) { if ((x -= it.w) < 0) return it; } return items.at(-1); };

/**
 * The scenes of ONE block of ONE side of a road line (the unit everything else is built from).
 * Returns [{ id, slot (0..7 in block), span, group }] sorted by slot. Pure function of its arguments.
 */
export function resolveBlock({ seed = 1, axis = 'ew', line = 0, block = 0, side = 1, biome = 'forest', cls = 'two-lane', cityDist = 99, knobs = DEFAULT_KNOBS }) {
  const k = { ...DEFAULT_KNOBS, ...knobs }, sup = Math.floor(block / SUPER_BLOCKS), keyL = [seed, axis, line];
  const nothing = rollOf(...keyL, 'nothing', sup) < Math.min(0.95, (NOTHING_CHANCE[biome] ?? 0.2) * (NOTHING_CLASS[cls] ?? 1) * k.nothing);
  const taken = new Array(BLOCK_SLOTS).fill(false), out = [];
  const put = (id, slot) => { const sp = SCENES[id].span; for (let q = 0; q < sp; q++) taken[slot + q] = true; out.push({ id, slot, span: sp, group: SCENES[id].group }); };
  // the service stop of this super-block (never suppressed by "nothing": a gas stop in the middle of nowhere is the trope)
  const svcChance = (SERVICE_CHANCE[cls] ?? 0) * k.services;
  if (svcChance > 0 && rollOf(...keyL, 'svc', sup) < Math.min(1, svcChance)) {
    const cellInSuper = Math.floor(rollOf(...keyL, 'svccell', sup) * SUPER_BLOCKS * 2), q = rollOf(...keyL, 'svcq', sup) < 0.5 ? 0 : 2, slotInSuper = cellInSuper * SLOTS_PER_CELL + q;
    const mySide = rollOf(...keyL, 'svcside', sup) < 0.5 ? 1 : -1;
    if (Math.floor(slotInSuper / BLOCK_SLOTS) === block - sup * SUPER_BLOCKS && mySide === side) {
      const el = eligible(biome, cls, { cityDist, knobs, servicesOnly: true });
      if (el.length) put(pickW(el, rollOf(...keyL, 'svcpick', sup)).id, slotInSuper % BLOCK_SLOTS);
    }
  }
  if (nothing) return out.sort((a, b) => a.slot - b.slot);
  for (let s = 0; s < BLOCK_SLOTS; s++) {
    if (taken[s]) continue;
    const maxSpan = Math.min(2, SLOTS_PER_CELL - (s % SLOTS_PER_CELL), taken[s + 1] ? 1 : 2);   // never across a cell edge or onto a taken slot
    const el = eligible(biome, cls, { cityDist, knobs, maxSpan }), total = el.reduce((a, x) => a + x.w, 0);
    if (!el.length || rollOf(...keyL, 'fill', block, side, s) * (total + EMPTY_WEIGHT) >= total) continue;
    const it = pickW(el, rollOf(...keyL, 'pick', block, side, s)); put(it.id, s);
  }
  return out.sort((a, b) => a.slot - b.slot);
}

/**
 * The roadside of one straight cell: scenes + placed props. Only straight modules carry scenes (the others are junctions:
 * their furniture is in module.features). ctx = { seed, biome, cityDist (number or (i,k)=>number), knobs }.
 */
export function roadsideForCell(module, ctx = {}) {
  const { seed = 1, biome = 'forest', knobs = DEFAULT_KNOBS } = ctx, cityDist = typeof ctx.cityDist === 'function' ? ctx.cityDist(module.i, module.k) : (ctx.cityDist ?? 99);
  if (module.kind !== 'straight') return { cell: module.id, scenes: [], props: [], nothing: false, note: `no scenes on a ${module.kind} cell` };
  const { cls, axis } = module.main, C = KIT_CLASSES[cls], lineIdx = axis === 'ew' ? module.k : module.i, cellAlong = axis === 'ew' ? module.i : module.k;
  const rot = axis === 'ew' ? 0 : 1, scenes = [], props = [], base = cellAlong * SLOTS_PER_CELL;
  let nothing = true;
  for (const side of [1, -1]) {
    const blocks = new Map();
    for (let q = 0; q < SLOTS_PER_CELL; q++) { const A = base + q, bl = Math.floor(A / BLOCK_SLOTS); if (!blocks.has(bl)) blocks.set(bl, resolveBlock({ seed, axis, line: lineIdx, block: bl, side, biome, cls, cityDist, knobs })); }
    for (const [bl, list] of blocks) for (const sc of list) {
      const A = bl * BLOCK_SLOTS + sc.slot, c = Math.floor(A / SLOTS_PER_CELL); if (c !== cellAlong) continue;
      const def = SCENES[sc.id], q = A % SLOTS_PER_CELL;
      // "one side" scenes pick a hashed side: only the owning side keeps them; "both" scenes keep both
      if (def.side === 'one' && rollOf(seed, axis, lineIdx, 'sidepick', A) < 0.5 !== (side === 1)) continue;
      nothing = false;
      const sceneRec = { scene: sc.id, label: def.label, group: def.group, side: side === 1 ? 'right' : 'left', slot: q, span: sc.span, x0: -H + q * SLOT, x1: -H + (q + sc.span) * SLOT };
      scenes.push(sceneRec);
      props.push(...placeProps(def, sceneRec, { seed, axis, lineIdx, A, side, C, meander: module.meander?.amp || 0, rot, sid: sc.id }));
    }
  }
  return { cell: module.id, cls, axis, biome, cityDist, scenes, props, nothing };
}

const lerp = (a, b, t) => a + (b - a) * t;
const between = (r, [a, b]) => lerp(a, b, r);
function placeProps(def, sc, c) {
  const out = [], edge = C => C.half + C.clearZone, e0 = edge(c.C), span = sc.x1 - sc.x0;
  const rotp = (x, z) => (c.rot ? { x: -z, z: x } : { x, z });
  const dirs = { road: [0, -c.side], away: [0, c.side], along: [1, 0] };
  let idx = 0;
  for (const p of def.props) {
    idx++;
    const R = (...t) => rollOf(c.seed, c.axis, c.lineIdx, 'prop', c.A, c.side, idx, ...t);
    const lat = (setb, rr) => c.side * (e0 + between(rr, setb));
    const wobble = x => c.meander * Math.pow(Math.sin(Math.PI * (x + H) / (2 * H)), 2);
    const rec = (extra) => { const cz = extra.z, cx = extra.x, w = rotp(cx, cz + wobble(cx)), d = extra.face ? rotp(...dirs[extra.face]) : null; return { prop: p.prop, scene: c.sid, group: def.group, side: sc.side, x: w.x, z: w.z, along: cx, lateral: cz, face: d ? { x: d[0] ?? d.x, z: d[1] ?? d.z } : null, y: p.y || 0, ...(extra.rest || {}) }; };
    const fixFace = o => { if (o.face && Array.isArray(o.face)) o.face = { x: o.face[0], z: o.face[1] }; return o; };
    if (p.strip) {
      const z = lat(p.set, R('lat')), depth = p.depth ? between(R('depth'), p.depth) : 0;
      const o = { prop: p.prop, scene: c.sid, group: def.group, side: sc.side, kind: 'strip', x0: sc.x0 + 8, x1: sc.x1 - 8, lateral: z, depth, y: p.y || 0 };
      const a = rotp(o.x0, z), b = rotp(o.x1, z); o.from = a; o.to = b; out.push(o); continue;
    }
    if (p.lane) {                                                    // a farm lane: perpendicular to the road, from the verge to the farm
      const len = between(R('len'), p.len), x = lerp(sc.x0, sc.x1, 0.25 + 0.5 * R('x')), z0 = c.side * e0, z1 = c.side * (e0 + len);
      out.push({ prop: p.prop, scene: c.sid, group: def.group, side: sc.side, kind: 'lane', from: rotp(x, z0), to: rotp(x, z1), len: Math.round(len), width: 12 });
      c._laneEnd = { x, z: z1 }; c._laneLen = len; continue;
    }
    const cnt = p.n[0] + Math.floor(R('n') * (p.n[1] - p.n[0] + 1));
    for (let q = 0; q < cnt; q++) {
      const t = (q + 0.15 + 0.7 * R('along', q)) / Math.max(1, cnt), x = p.end && c._laneEnd ? c._laneEnd.x + (R('ex', q) - 0.5) * 70 : lerp(sc.x0, sc.x1, t);
      const z = p.end && c._laneEnd ? c.side * (e0 + c._laneLen + between(R('lat', q), p.set)) : lat(p.set, R('lat', q));
      out.push(fixFace(rec({ x, z, face: p.face, rest: { variant: Math.floor(R('var', q) * 4), scale: +lerp(0.9, 1.15, R('scale', q)).toFixed(2) } })));
    }
  }
  return out;
}

/** Whole-strip helper: roadside for every straight module of a planStrip result, cityDist from the strip ends. */
export function roadsideForStrip(cells, { seed = 1, biome = 'forest', knobs = DEFAULT_KNOBS, length, ends = 'city', cityDist = null } = {}) {
  const n = length ?? (Math.max(...cells.map(c => c.i)) + 1), cd = cityDist || ((i) => (ends === 'city' ? Math.min(i, n - 1 - i) : 99));
  return cells.map(m => roadsideForCell(m, { seed, biome, knobs, cityDist: (i, k) => cd(i, k) }));
}
export { rankOf, isFreeway };
