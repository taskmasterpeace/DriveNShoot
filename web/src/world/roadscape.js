// THE ROADSCAPE (docs/design/WEB_ROADSCAPE.md; rows in data/roadscape.js): what stands beside the open road, placed by the
// research's slot cadence (docs/reference/lsw/road-kit-roadside.js) on both sides of every corridor and county road.
//
//   placeRoadside(...)   PURE: road runs (centreline arc length -> point and tangent, paved half-width, skip spans) +
//                        a road-biome lookup + a distance-to-town lookup -> instance placements. No THREE, no W, no
//                        stream: every roll is a hash of (seed, road, side, slot, what), so a slot's scenes and every prop
//                        in it are the same whichever chunk asks, in any order (a chunk keeps the props that stand in it).
//   roadscapeStage(...)  the chunk generator's hook (world/chunkgen.js): builds this chunk's road runs from the world,
//                        drops what lands in a road, a clear zone, water or a settlement, and writes the rest into the
//                        chunk's instance pools and collision. Layout time only: nothing here runs per frame.
//
// LOCALITY: a slot is 64 m of road on one side, a block 8 slots (scenes are chosen greedily inside it), a super-block 3
// blocks (the "nothing for a while" roll and the service stop). The same seed gives the same roadside byte for byte.
import { CADENCE, ROAD_CLASSES, ROAD_BIOMES, BIOME_MAP, SCENES, LOOK, DEFAULT_KNOBS, CLASS_OF, MAX_REACH } from '../data/roadscape.js';

// ---- rolls: an integer hash to [0, 1) (no strings, no allocation) -------------------------------------------------------
const mix = (h, v) => { h = Math.imul(h ^ (v | 0), 0x5bd1e995); return h ^ (h >>> 15); };
export function roll(seed, road, side, a, b = 0, c = 0) {
  let h = mix(mix(mix(mix(mix(mix(0x2545f491, seed), road), side + 3), a), b), c);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const saltOf = (s) => { s = String(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; };
// What a roll is for (the third key after the slot): never reorder, append.
const R_NOTHING = 1, R_SVC = 2, R_SVCSLOT = 3, R_SVCSIDE = 4, R_SVCPICK = 5, R_FILL = 6, R_PICK = 7, R_SIDE = 8, R_PROP = 9;

const RGB = new Map();
// '#rrggbb' (sRGB, as the rows write it) to the linear RGB the instance pools take (what THREE.Color.set gives chunkgen's col()).
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const rgbOf = (hex) => { let c = RGB.get(hex); if (!c) { const v = parseInt(hex.slice(1), 16); RGB.set(hex, (c = [lin(((v >> 16) & 255) / 255), lin(((v >> 8) & 255) / 255), lin((v & 255) / 255)])); } return c; };

// ---- the road biome of a place (BIOME_MAP): a usmap/landcover letter, the region it is in, the state ---------------------
export function roadBiomeOf(letter, region = null, state = null) {
  const M = BIOME_MAP;
  if (state && M.snowStates.includes(state) && M.snowLetters.includes(letter)) return 'snow';
  if (state && M.hillStates.includes(state) && M.hillLetters.includes(letter)) return 'forest-hills';
  return (region && M[region]?.[letter]) ?? M.default[letter] ?? 'desert';
}

// ---- scenes: which are eligible in a slot, and the scenes of one block of one side ---------------------------------------
const SCENE_IDS = Object.keys(SCENES);
function weightOf(id, biome, cls, cityDist, k) {
  const s = SCENES[id];
  let w = (s.weights[biome] ?? 0) * (s.byClass[cls] ?? 0) * (s.group === 'service' ? 1 : k.density) * (k[s.group] ?? 1);
  if (w > 0 && s.nearCity) {
    if (cityDist > s.nearCity) w = s.cityOnly ? 0 : w * 0.35; // a sound wall only stands where the town's houses are
    else w *= 1 + (s.nearBoost ?? 2) * (1 - cityDist / s.nearCity);
  }
  return w;
}
// The chance a super-block is empty: the road biome's NOTHING x the class factor x the knob (capped at 0.95).
export const nothingChance = (biome, cls, k = DEFAULT_KNOBS) => Math.min(0.95, (ROAD_BIOMES[biome]?.nothing ?? 0.2) * (ROAD_CLASSES[cls]?.nothing ?? 1) * (k.nothing ?? 1));

// One road's view for the resolver: { salt, cls, L, at(s, P), half(s), skip(s) } plus the lookups biomeAt(x, z) and
// cityDistAt(x, z) (from the centreline point). Memoised per block within one call (Map keyed by block*2+side).
function slotInfo(ctx, R, A) {
  const S = CADENCE.slot, s = (A + 0.5) * S, P = ctx.P;
  if (s < 0 || s > R.L || R.skip(s) || R.skip(s - S * 0.45) || R.skip(s + S * 0.45)) return null;
  R.at(s, P);
  return { biome: ctx.biomeAt(P.x, P.z), city: ctx.cityDistAt(P.x, P.z) };
}
export function superInfo(ctx, R, sup) {
  const S = CADENCE.slot, n = CADENCE.blockSlots * CADENCE.superBlocks, s = Math.min(R.L, Math.max(0, (sup * n + n / 2) * S)), P = ctx.P;
  R.at(s, P);
  const biome = ctx.biomeAt(P.x, P.z), ch = nothingChance(biome, R.cls, ctx.knobs);
  return { biome, chance: ch, nothing: roll(ctx.seed, R.salt, 0, sup, R_NOTHING) < ch };
}
export function resolveBlock(ctx, R, block, side) {
  const key = block * 2 + (side > 0 ? 1 : 0), memo = R.memo ??= new Map();
  if (memo.has(key)) return memo.get(key);
  const BS = CADENCE.blockSlots, SB = CADENCE.superBlocks, k = ctx.knobs, sup = Math.floor(block / SB), seed = ctx.seed;
  const info = [], taken = [], out = [];
  for (let q = 0; q < BS; q++) { const I = slotInfo(ctx, R, block * BS + q); info.push(I); taken.push(!I); }
  const put = (id, q) => { const sp = SCENES[id].span; for (let t = 0; t < sp; t++) taken[q + t] = true; out.push({ id, slot: block * BS + q, span: sp, group: SCENES[id].group }); };
  // the service stop of this super-block (never suppressed by "nothing": a gas stop in the middle of nowhere is the trope)
  const svc = (ROAD_CLASSES[R.cls]?.service ?? 0) * (k.service ?? 1);
  if (svc > 0 && roll(seed, R.salt, 0, sup, R_SVC) < Math.min(1, svc)) {
    const slotIn = Math.floor(roll(seed, R.salt, 0, sup, R_SVCSLOT) * BS * SB), mySide = roll(seed, R.salt, 0, sup, R_SVCSIDE) < 0.5 ? 1 : -1;
    const q = slotIn - (block - sup * SB) * BS;
    if (q >= 0 && q < BS - 1 && mySide === side && info[q] && info[q + 1]) {
      const el = [];
      for (const id of SCENE_IDS) if (SCENES[id].group === 'service') { const w = weightOf(id, info[q].biome, R.cls, info[q].city, k); if (w > 0) el.push(id, w); }
      if (el.length) put(pickW(el, roll(seed, R.salt, 0, sup, R_SVCPICK)), q);
    }
  }
  const SI = superInfo(ctx, R, sup);
  if (!SI.nothing) {
    for (let q = 0; q < BS; q++) {
      if (taken[q]) continue;
      const maxSpan = q + 1 < BS && !taken[q + 1] ? 2 : 1, I = info[q], el = [];
      let total = 0;
      for (const id of SCENE_IDS) {
        const s = SCENES[id];
        if (s.group === 'service' || s.span > maxSpan) continue;
        const w = weightOf(id, I.biome, R.cls, I.city, k);
        if (w > 0) { el.push(id, w); total += w; }
      }
      if (!el.length || roll(seed, R.salt, side, block * BS + q, R_FILL) * (total + CADENCE.emptyWeight) >= total) continue;
      put(pickW(el, roll(seed, R.salt, side, block * BS + q, R_PICK)), q);
    }
  }
  const res = { scenes: out, nothing: SI.nothing, biome: SI.biome };
  memo.set(key, res);
  return res;
}
// el = [id, w, id, w, ...]
function pickW(el, r) { let t = 0; for (let i = 1; i < el.length; i += 2) t += el[i]; let x = r * t; for (let i = 0; i < el.length; i += 2) if ((x -= el[i + 1]) < 0) return el[i]; return el[el.length - 2]; }

// ---- the placer -----------------------------------------------------------------------------------------------------------
// o = { seed, roads: [run], ox, oz, C, biomeAt(x,z) -> road biome, cityDistAt(x,z) -> m, knobs, all (keep props outside the
// chunk too: the checks) }; run = { id, salt, cls, L, at(s, P) (sets P.x P.z P.tx P.tz), half(s), skip(s), sA, sB }.
// Returns { props: [...], scenes: [...] }. A prop: { pool, sp (a flora species), x, y, z, rot, sx, sy, sz, c: [r,g,b],
// box: null | { r } | { sa, su }, h (collision height), tag, scene, kind, lat (metres from the centreline), edge }.
export function placeRoadside(o) {
  const ctx = { seed: o.seed | 0, biomeAt: o.biomeAt, cityDistAt: o.cityDistAt, knobs: { ...DEFAULT_KNOBS, ...(o.knobs ?? {}) }, P: { x: 0, z: 0, tx: 0, tz: 1 } };
  const props = [], scenes = [], S = CADENCE.slot, BS = CADENCE.blockSlots;
  const own = o.all ? () => true : (x, z) => x >= o.ox && x < o.ox + o.C && z >= o.oz && z < o.oz + o.C;
  for (const R of o.roads) {
    R.memo = null;
    const A0 = Math.max(0, Math.floor(R.sA / S) - 1), A1 = Math.min(Math.floor(R.L / S), Math.floor(R.sB / S));
    for (const side of [1, -1]) {
      for (let b = Math.floor(A0 / BS); b <= Math.floor(A1 / BS); b++) {
        const blk = resolveBlock(ctx, R, b, side);
        for (const sc of blk.scenes) {
          if (sc.slot < A0 || sc.slot > A1) continue;
          const def = SCENES[sc.id];
          if (def.side === 'one' && (roll(ctx.seed, R.salt, 0, sc.slot, R_SIDE) < 0.5) !== (side > 0)) continue;
          const n0 = props.length;
          emitScene(ctx, R, def, sc, side, props, own);
          scenes.push({ road: R.id, cls: R.cls, scene: sc.id, side, slot: sc.slot, span: sc.span, s0: sc.slot * S, s1: (sc.slot + sc.span) * S, props: props.length - n0 });
        }
      }
    }
  }
  return { props, scenes };
}

// ---- the props of one scene on one side -----------------------------------------------------------------------------------
const TAU = Math.PI * 2, lerp = (a, b, t) => a + (b - a) * t, between = (r, v) => lerp(v[0], v[1], r);
function emitScene(ctx, R, def, sc, side, props, own) {
  const S = CADENCE.slot, s0 = sc.slot * S, s1 = (sc.slot + sc.span) * S, cls = ROAD_CLASSES[R.cls], P = { x: 0, z: 0, tx: 0, tz: 1 };
  const seed = ctx.seed, B = ROAD_BIOMES[ctx.biomeAt((R.at(lerp(s0, s1, 0.5), P), P.x), P.z)] ?? ROAD_BIOMES.desert;
  let pi = 0;
  const lane = { s: 0, lat: 0, len: 0, on: false };
  // A roll for this prop, keyed by (slot, side, prop index, i, j).
  const r = (i = 0, j = 0) => roll(seed, R.salt, side, sc.slot * 64 + pi, R_PROP * 4096 + i, j);
  // (s, distance past the clear zone's edge) -> world; the edge follows the paved half-width at s.
  const W = { x: 0, z: 0, rot: 0, lat: 0, edge: 0 };
  const place = (s, past) => {
    R.at(s, P);
    const edge = R.half(s) + cls.clearZone, lat = edge + past;
    W.x = P.x - P.tz * lat * side; W.z = P.z + P.tx * lat * side; W.rot = Math.atan2(P.tx, P.tz); W.lat = lat; W.edge = edge;
    return W;
  };
  const push = (pool, kind, x, y, z, rot, sx, sy, sz, c, extra) => {
    if (!own(x, z)) return null;
    const p = { pool, sp: null, x, y, z, rot, sx, sy, sz, c, box: null, h: 0, tag: null, scene: sc.id, kind, lat: W.lat, edge: W.edge, side };
    if (extra) Object.assign(p, extra);
    props.push(p);
    return p;
  };
  // A tree of the road biome's mix (r1 picks the species, r2 the height).
  const treeOf = (x, z, r1, r2, rot, shade = 1, past) => {
    let t = 0; for (const q of B.trees) t += q[1];
    let v = r1 * t, row = B.trees[B.trees.length - 1];
    for (const q of B.trees) if ((v -= q[1]) < 0) { row = q; break; }
    const h = lerp(row[2], row[3], r2);
    return push('flora', 'tree', x, 0, z, rot, 1, 1, 1, null, { sp: row[0], h, treeH: h, shade, box: { r: row[0] === 'liveoak' || row[0] === 'oak' ? 0.5 : 0.35 }, tag: 'tree', past });
  };
  const sA = s0 + 3, sB = s1 - 3; // a scene keeps 3 m off its slot ends (a seam is never a wall of props)
  for (const p of def.props) {
    pi++;
    switch (p.kind) {
      case 'treewall': {
        // Ranks of trees from the clear zone's edge back into the woods: the front ranks close, the deep ones thinner, a
        // ragged front edge and the odd clearing (a 16 m bucket left open).
        const depth = between(r(1), p.depth), set = between(r(2), p.set), sp = p.spacing, rows = Math.max(2, Math.round(depth / (sp * 0.9)));
        for (let j = 0; j < rows; j++) {
          const keepP = j < 2 ? 0.94 : 0.62 - 0.25 * (j / rows);
          for (let i = 0, n = Math.floor((sB - sA) / sp); i < n; i++) {
            const s = sA + (i + 0.5) * sp + (r(i, j * 8 + 1) - 0.5) * sp * 0.9;
            if (roll(seed, R.salt, side, Math.floor(s / 16), R_PROP * 4096 + 77) < 0.07 && j > 0) continue; // a clearing
            if (r(i, j * 8 + 2) > keepP) continue;
            const past = set + j * sp * 0.9 + r(i, j * 8 + 3) * sp * (j ? 0.7 : 0.3) + (j ? 0 : r(i, j * 8 + 4) * 1.2);
            place(s, past);
            treeOf(W.x, W.z, r(i, j * 8 + 5), r(i, j * 8 + 6), r(i, j * 8 + 7) * TAU, 0.82 + 0.22 * r(i, j * 8 + 5), past);
            if (j === 0 && r(i, 99) < p.understory) {
              const ss = 0.6 + r(i, 98) * 0.8, c = rgbOf(B.scrub), v = 0.8 + 0.25 * r(i, 97);
              place(s + (r(i, 96) - 0.5) * sp, Math.max(0.3, past - 1.2 - r(i, 95) * 1.5));
              push('shrubs', 'understory', W.x, ss * 0.25, W.z, r(i, 94) * TAU, ss * 1.2, ss * 0.55, ss * 1.1, [c[0] * v, c[1] * v, c[2] * v]);
            }
          }
        }
        break;
      }
      case 'treescreen': case 'firclump': {
        const n = p.n[0] + Math.floor(r(1) * (p.n[1] - p.n[0] + 1)), cs = lerp(sA, sB, 0.2 + 0.6 * r(2)), cp = between(r(3), p.set);
        for (let i = 0; i < n * (p.kind === 'firclump' ? 3 : 1); i++) {
          const past = Math.max(p.set[0], cp + (r(i, 1) - 0.5) * 10);
          place(Math.min(sB, Math.max(sA, cs + (r(i, 2) - 0.5) * 22)), past);
          treeOf(W.x, W.z, r(i, 3), r(i, 4), r(i, 5) * TAU, p.kind === 'firclump' ? 0.7 : 0.9, past);
        }
        break;
      }
      case 'lane': {
        // A farm lane, square off the road, from the verge to the farm (its pieces are 6 m of packed dirt).
        lane.s = lerp(sA + 10, sB - 10, 0.25 + 0.5 * r(1)); lane.len = between(r(2), p.len); lane.on = true;
        const c = rgbOf(LOOK.drive);
        for (let d = -cls.clearZone; d < lane.len; d += 6) { place(lane.s, d + 3); push('props', 'lane', W.x, 0.03, W.z, W.rot + Math.PI / 2, 6.2, 0.06, 3.2, c); }
        place(lane.s, lane.len); lane.lat = W.lat;
        break;
      }
      case 'mailbox': {
        const s = lane.on ? lane.s + 4 : lerp(sA, sB, r(1));
        place(s, between(r(2), p.set));
        mailbox(push, W);
        break;
      }
      case 'house': case 'barn': case 'silo': {
        const n = p.n[0] + Math.floor(r(1) * (p.n[1] - p.n[0] + 1));
        for (let i = 0; i < n; i++) {
          const s = p.end && lane.on ? lane.s + (r(i, 1) - 0.5) * 30 + (p.kind === 'barn' ? 18 : p.kind === 'silo' ? -14 - i * 7 : 0) : lerp(sA + 8, sB - 8, (i + 0.15 + 0.7 * r(i, 1)) / Math.max(1, n));
          const past = (p.end && lane.on ? lane.len : 0) + between(r(i, 2), p.set);
          place(s, past);
          if (p.kind === 'silo') { silo(push, W, r(i, 3)); continue; }
          building(push, W, p.kind, r(i, 3), r(i, 4), r(i, 5), p.backs ? -1 : 1, side);
          if (p.drive && p.kind === 'house') {
            const c = rgbOf(LOOK.drive);
            for (let d = -cls.clearZone; d < past - 5; d += 6) { place(s, d + 3); push('props', 'drive', W.x, 0.03, W.z, W.rot + Math.PI / 2, 6.2, 0.06, 2.8, c); }
            if (p.mailbox) { place(s + 3.5, 0.9); mailbox(push, W); }
          }
        }
        break;
      }
      case 'soundwall': {
        // 4 m concrete panels on posts, a darker cap; the odd panel fallen out (gaps), a stretch gone where a car went in.
        const set = between(r(1), p.set), c = rgbOf(LOOK.soundwall), cap = rgbOf(LOOK.soundwallCap), post = rgbOf(LOOK.soundwallPost);
        for (let s = sA, i = 0; s < sB - 2; s += 4, i++) {
          if (r(i, 1) < p.gaps) continue;
          const v = 0.9 + 0.14 * r(i, 2), h = p.h * (r(i, 3) < 0.06 ? 0.55 : 1);
          place(s + 2, set + 0.25);
          push('walls', 'soundwall', W.x, h / 2, W.z, W.rot, 0.5, h, 4.02, [c[0] * v, c[1] * v, c[2] * v], { box: { sa: 4, su: 0.55 }, h, tag: 'soundwall' });
          push('props', 'soundwallcap', W.x, h + 0.08, W.z, W.rot, 0.7, 0.16, 4.02, cap);
          place(s, set + 0.25);
          push('props', 'soundwallpost', W.x, (h + 0.3) / 2, W.z, W.rot, 0.62, h + 0.3, 0.45, post);
        }
        break;
      }
      case 'billboard': {
        const s = lerp(sA + 6, sB - 6, r(1)), set = between(r(2), p.set), w = 9 + r(3) * 4, h = p.h, torn = r(4) < 0.3;
        place(s, set + 0.4);
        const post = rgbOf(LOOK.billboardPost), face = rgbOf(LOOK.billboardFace[Math.floor(r(5) * LOOK.billboardFace.length)]), back = rgbOf(LOOK.billboardBack);
        const x = W.x, z = W.z, rot = W.rot, tx = Math.sin(rot), tz = Math.cos(rot);
        for (const k of [-0.33, 0.33]) push('trunks', 'billboardpost', x + tx * w * k, h / 2, z + tz * w * k, 0, 1.4, h, 1.4, post, { box: { r: 0.3 }, h, tag: 'billboard' });
        push('props', 'billboardback', x, h + 1.6, z, rot, 0.25, 3.4, w, back);
        // the face toward the road (a strip torn off it, or the lower half gone)
        const fh = torn ? 1.6 + r(6) * 1.4 : 3.2, nx = -tz * side, nz = tx * side;
        push('props', 'billboard', x - nx * 0.16, h + 1.6 + (3.2 - fh) / 2 * (torn ? 1 : 0), z - nz * 0.16, rot, 0.06, fh, w * (torn ? 0.7 + r(7) * 0.3 : 1), face);
        push('props', 'billboardcatwalk', x - nx * 0.6, h - 0.1, z - nz * 0.6, rot, 0.9, 0.08, w, post);
        break;
      }
      case 'fence': {
        // Posts and rails (or barbed wire) along the field edge; a post leaning out, a run of rails down.
        const set = between(r(1), p.set), cp = rgbOf(LOOK.fencePost), cr = rgbOf(p.wire ? LOOK.wire : LOOK.fenceRail), step = p.post;
        for (let s = sA, i = 0; s < sB; s += step, i++) {
          place(s, set);
          push('props', 'fencepost', W.x, 0.6, W.z, W.rot, 0.14, 1.2, 0.14, cp);
          if (s + step >= sB || r(i, 2) < 0.1) continue; // a span down
          place(s + step / 2, set);
          for (let k = 0; k < p.rails; k++) push('props', 'fencerail', W.x, 0.45 + k * (0.7 / Math.max(1, p.rails - 1)), W.z, W.rot, p.wire ? 0.03 : 0.07, p.wire ? 0.03 : 0.12, step, cr);
        }
        break;
      }
      case 'cropfield': {
        // A dead crop in rows parallel to the road (16 m pieces so they follow the curve and the land), gone patchy.
        const set = between(r(1), p.set), depth = between(r(2), p.depth), crop = rgbOf(LOOK.crop[Math.floor(r(3) * LOOK.crop.length)]), stub = rgbOf(LOOK.stubble), soil = rgbOf(LOOK.soil), fallow = r(4) < 0.3;
        for (let j = 0, rows = Math.floor(depth / p.row); j < rows; j++) for (let s = sA + 4, i = 0; s < sB - 4; s += 16, i++) {
          if (r(i, j + 1000) < 0.14) continue;
          const v = 0.86 + 0.2 * r(i, j + 2000), h = fallow ? 0.18 : 0.35 + 0.35 * r(i, j + 3000), c = fallow ? stub : crop;
          place(s + 8, set + 1 + j * p.row);
          push('props', 'furrow', W.x, 0.03, W.z, W.rot, p.row * 0.98, 0.06, 16, [soil[0] * v, soil[1] * v, soil[2] * v]);
          push('props', 'crop', W.x, h / 2, W.z, W.rot, 0.5, h, 15.4, [c[0] * v, c[1] * v, c[2] * v]);
        }
        break;
      }
      case 'windmill': {
        const s = lerp(sA + 8, sB - 8, r(1)); place(s, between(r(2), p.set));
        const c = rgbOf(LOOK.windmill), vc = rgbOf(LOOK.vane), x = W.x, z = W.z, h = 9 + r(3) * 3;
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) push('props', 'windmillleg', x + a * 0.9, h / 2, z + b * 0.9, 0, 0.14, h, 0.14, c);
        push('props', 'windmilldeck', x, h, z, 0, 1.0, 0.12, 1.0, c, { box: { r: 1.1 }, h, tag: 'windmill' });
        const yaw = r(4) * TAU;
        for (let k = 0; k < 6; k++) push('props', 'vane', x + Math.sin(yaw) * 0.5, h + 0.6, z + Math.cos(yaw) * 0.5, yaw + Math.PI / 2 + (k - 2.5) * 0.12, 0.05, 2.6, 0.3, vc);
        push('props', 'tailvane', x - Math.sin(yaw) * 1.4, h + 0.6, z - Math.cos(yaw) * 1.4, yaw, 0.05, 0.9, 1.8, vc);
        break;
      }
      case 'stocktank': {
        const s = lerp(sA + 8, sB - 8, r(1)); place(s + 6, between(r(2), p.set) + 4);
        const c = rgbOf(LOOK.tank), w = rgbOf(LOOK.water), rr = 2.2 + r(3) * 1.2, dry = r(4) < 0.5;
        push('barrels', 'stocktank', W.x, 0.45, W.z, 0, rr / 0.45, 0.82, rr / 0.45, c, { box: { r: rr * 0.8 }, h: 0.9, tag: 'tank' });
        if (!dry) push('barrels', 'stockwater', W.x, 0.5, W.z, 0, (rr - 0.12) / 0.45, 0.8, (rr - 0.12) / 0.45, w);
        break;
      }
      case 'powerline': {
        // Poles every `spacing` along the scene, a crossarm, three wires to the next pole (some down), one leaning.
        const set = between(r(1), p.set), pc = rgbOf(LOOK.pole), ac = rgbOf(LOOK.arm), wc = rgbOf(LOOK.wire), h = p.h;
        const poles = [];
        for (let s = sA + r(2) * 8, i = 0; s < sB; s += p.spacing * (0.9 + 0.2 * r(i, 1)), i++) { place(s, set); poles.push([W.x, W.z, W.rot, W.lat, W.edge]); }
        for (let i = 0; i < poles.length; i++) {
          const [x, z, rot] = poles[i];
          W.lat = poles[i][3]; W.edge = poles[i][4];
          push('trunks', 'pole', x, h / 2, z, rot, 0.6, h, 0.6, pc, { box: { r: 0.25 }, h, tag: 'pole' });
          push('props', 'crossarm', x, h - 0.5, z, rot + Math.PI / 2, 2.4, 0.13, 0.13, ac);
          if (i + 1 < poles.length && r(i, 3) > 0.12) {
            const [x2, z2] = poles[i + 1], mx = (x + x2) / 2, mz = (z + z2) / 2, L = Math.hypot(x2 - x, z2 - z), wr = Math.atan2(x2 - x, z2 - z);
            for (const k of [-1, 0, 1]) push('props', 'wire', mx + Math.cos(wr) * k * 1.0, h - 0.62 - (k ? 0 : 0.05), mz - Math.sin(wr) * k * 1.0, wr, 0.04, 0.04, L, wc);
          }
        }
        break;
      }
      case 'scrub': {
        const n = p.n[0] + Math.floor(r(1) * (p.n[1] - p.n[0] + 1)), c = rgbOf(B.scrub);
        for (let i = 0; i < n * 2; i++) {
          place(lerp(sA, sB, r(i, 1)), between(r(i, 2), p.set));
          const s2 = 0.5 + r(i, 3) * 0.9, v = 0.75 + 0.3 * r(i, 4);
          push('shrubs', 'scrub', W.x, s2 * 0.22, W.z, r(i, 5) * TAU, s2 * (1 + 0.4 * r(i, 6)), s2 * 0.5, s2 * (1 + 0.4 * r(i, 7)), [c[0] * v, c[1] * v, c[2] * v]);
        }
        break;
      }
      case 'rock': {
        const n = p.n[0] + Math.floor(r(1) * (p.n[1] - p.n[0] + 1));
        for (let i = 0; i < n; i++) {
          const big = p.big || r(i, 1) < 0.25, rr = big ? 1.5 + r(i, 2) * 2.4 : 0.4 + r(i, 2) * 0.9, c = rgbOf(LOOK.rock[Math.floor(r(i, 3) * LOOK.rock.length)]);
          place(lerp(sA, sB, r(i, 4)), between(r(i, 5), p.set) + rr);
          push('boulders', 'rock', W.x, rr * 0.33, W.z, r(i, 6) * TAU, rr * (1 + 0.3 * r(i, 7)), rr * (0.55 + 0.3 * r(i, 8)), rr * (1 + 0.3 * r(i, 9)), c, big ? { box: { r: rr * 0.8 }, h: rr * 0.7, tag: 'boulder' } : null);
        }
        break;
      }
      case 'snowpole': {
        const n = p.n[0] + Math.floor(r(1) * (p.n[1] - p.n[0] + 1)), c = rgbOf(LOOK.snowpole), dk = rgbOf(LOOK.fencePost);
        for (let i = 0; i < n; i++) { place(lerp(sA, sB, (i + 0.5) / n), between(r(i, 2), p.set)); push('props', 'snowpole', W.x, 0.9, W.z, 0, 0.07, 1.8, 0.07, dk); push('props', 'snowpoletip', W.x, 1.95, W.z, 0, 0.09, 0.32, 0.09, c); }
        break;
      }
      case 'snowfence': {
        const set = between(r(1), p.set), c = rgbOf(LOOK.snowfence);
        for (let s = sA, i = 0; s < sB - 3; s += 3.4, i++) { if (r(i, 1) < 0.15) continue; place(s + 1.5, set); push('props', 'snowfence', W.x, p.h / 2, W.z, W.rot, 0.08, p.h, 2.9, c); }
        break;
      }
      case 'cattails': {
        // Clumps of cattail stems with brown heads, sawgrass blades round them (on the wet verge, not in the water).
        const n = p.n[0] + Math.floor(r(1) * (p.n[1] - p.n[0] + 1)), cs = rgbOf(LOOK.cattail), ch = rgbOf(LOOK.cattailHead), sg = rgbOf(LOOK.sawgrass);
        for (let i = 0; i < n; i++) {
          place(lerp(sA, sB, r(i, 1)), between(r(i, 2), p.set));
          const x = W.x, z = W.z;
          for (let k = 0; k < 6; k++) {
            const a = r(i, 10 + k) * TAU, d = r(i, 20 + k) * 1.1, h = 1.2 + r(i, 30 + k) * 0.9, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
            push('props', 'cattail', px, h / 2, pz, a, 0.05, h, 0.05, cs);
            if (k < 4) push('props', 'cattailhead', px, h - 0.18, pz, a, 0.11, 0.3, 0.11, ch);
            else push('props', 'sawgrass', px + 0.3, 0.5, pz, a, 0.14, 1.0, 0.04, sg);
          }
        }
        break;
      }
      case 'stiltshack': {
        const n = r(9) < (p.chance ?? 1) ? p.n[0] + Math.floor(r(1) * (p.n[1] - p.n[0] + 1)) : 0;
        for (let i = 0; i < n; i++) {
          place(lerp(sA + 10, sB - 10, r(i, 1)), between(r(i, 2), p.set));
          const x = W.x, z = W.z, rot = W.rot, w = 5 + r(i, 3) * 2, d = 4 + r(i, 4) * 2, c = rgbOf(LOOK.shell[Math.floor(r(i, 5) * 3)]);
          for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) push('props', 'stilt', x + a * (w / 2 - 0.3), 0.6, z + b * (d / 2 - 0.3), 0, 0.25, 1.2, 0.25, [0.3, 0.26, 0.22]);
          push('walls', 'shack', x, 2.4, z, rot, d, 2.4, w, c, { box: { sa: w, su: d }, h: 3.6, tag: 'shack' });
          push('roofs', 'shackroof', x, 3.75, z, rot, d + 0.8, 0.25, w + 0.8, [0.5, 0.52, 0.5]);
        }
        break;
      }
      case 'gasstop': {
        // A dead gas stop: a gravel apron, a canopy on four posts over two pumps, a shell of a store behind it.
        const s = lerp(sA + 30, sB - 30, r(1)), set = between(r(2), p.set), gv = rgbOf(LOOK.drive), cn = rgbOf(LOOK.canopy), pu = rgbOf(LOOK.pump);
        for (let a = -24; a <= 24; a += 8) for (let d = -cls.clearZone; d < set + 28; d += 8) { place(s + a, d + 4); push('props', 'apron', W.x, 0.03, W.z, W.rot, 8.1, 0.06, 8.1, gv); }
        place(s, set + 8);
        const x = W.x, z = W.z, rot = W.rot, tx = Math.sin(rot), tz = Math.cos(rot);
        for (const [a, b] of [[-6, -3], [6, -3], [-6, 3], [6, 3]]) push('props', 'canopypost', x + tx * a - tz * b * side, 2.4, z + tz * a + tx * b * side, rot, 0.3, 4.8, 0.3, cn);
        push('roofs', 'canopy', x, 4.95, z, rot, 8.6, 0.3, 14.6, cn);
        for (const a of [-3, 3]) push('props', 'pump', x + tx * a, 0.75, z + tz * a, rot, 0.7, 1.5, 0.9, pu, { box: { r: 0.5 }, h: 1.5, tag: 'pump' });
        place(s + (r(3) - 0.5) * 10, set + 22);
        const c = rgbOf(LOOK.shell[Math.floor(r(4) * 3)]);
        push('walls', 'store', W.x, 1.7, W.z, W.rot, 9, 3.4, 15, c, { box: { sa: 15, su: 9 }, h: 3.4, tag: 'ruin' });
        if (r(5) < 0.6) push('roofs', 'storeroof', W.x, 3.55, W.z, W.rot, 9.6 * (0.6 + 0.3 * r(6)), 0.25, 15.6 * (0.6 + 0.4 * r(7)), [0.42, 0.38, 0.34]);
        break;
      }
      default: break;
    }
  }
}
function mailbox(push, W) {
  const c = rgbOf(LOOK.mailbox);
  push('props', 'mailboxpost', W.x, 0.55, W.z, W.rot, 0.1, 1.1, 0.1, rgbOf(LOOK.fencePost));
  push('props', 'mailbox', W.x, 1.15, W.z, W.rot, 0.24, 0.24, 0.48, c);
}
function silo(push, W, rv) {
  const h = 9 + rv * 6, c = rgbOf(LOOK.silo), rr = 2.2 + rv;
  push('barrels', 'silo', W.x, h / 2, W.z, 0, rr / 0.45, h / 1.1, rr / 0.45, c, { box: { r: rr * 0.85 }, h, tag: 'tank' });
  push('barrels', 'silocap', W.x, h + 0.3, W.z, 0, (rr * 0.8) / 0.45, 0.5, (rr * 0.8) / 0.45, [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8]);
}
// A house, or a barn: a shell (walls) with its roof, fallen in on the burnt ones; faces the road (or backs onto it).
function building(push, W, kind, r1, r2, r3, face, side) {
  const barn = kind === 'barn', burnt = !barn && r3 < 0.3, w = barn ? 12 + r1 * 4 : 8 + r1 * 4, d = barn ? 9 + r2 * 3 : 7 + r2 * 3, h = barn ? 5 + r3 * 1.5 : burnt ? 1.4 + r3 * 2 : 2.8 + r3 * 0.6;
  const pal = barn ? LOOK.barn : LOOK.house, c = rgbOf(pal[Math.floor(r1 * 997) % pal.length]), v = burnt ? 0.55 : 1;
  const rc = rgbOf(LOOK.roof[Math.floor(r2 * 991) % LOOK.roof.length]);
  push('walls', kind, W.x, h / 2, W.z, W.rot, d, h, w, [c[0] * v, c[1] * v, c[2] * v], { box: { sa: w, su: d }, h, tag: barn ? 'barn' : 'homestead' });
  if (!burnt) push('roofs', `${kind}roof`, W.x, h + 0.15, W.z, W.rot, d + 0.9, barn ? 0.4 : 0.3, w + 0.9, rc);
  else { // burnt out: a low shell, the roof fallen in as charred timbers on top of the rubble
    const ch = rgbOf(LOOK.char);
    push('props', `${kind}char`, W.x, h + 0.08, W.z, W.rot, d * 0.92, 0.14, w * 0.92, ch); // (props: the roofs pool would paint tiles on it)
    for (let k = 0; k < 3; k++) push('props', 'charbeam', W.x + (k - 1) * 1.6 * Math.cos(W.rot), h + 0.3, W.z - (k - 1) * 1.6 * Math.sin(W.rot), W.rot + 0.3 * (k - 1), 0.25, 0.25, w * 0.8, ch);
  }
  // the porch step on the side it faces (face 1: toward the road; -1: backed onto it), a barn's big doors
  const fx = side * Math.cos(W.rot) * face, fz = -side * Math.sin(W.rot) * face, o = d / 2 + 0.6;
  push('props', barn ? 'barndoor' : 'porch', W.x + fx * o, barn ? 1.8 : 0.15, W.z + fz * o, W.rot, 1.2, barn ? 3.6 : 0.3, barn ? 4 : 3, barn ? [0.32, 0.2, 0.14] : [0.45, 0.4, 0.34]);
}

// ---- the chunk generator's hook -------------------------------------------------------------------------------------------
// The edge of a road's clear zone, metres from its centreline (world/chunkgen.js keeps every scatter outside it).
export const clearEdge = (cls, half) => half + (ROAD_CLASSES[cls]?.clearZone ?? 0);

// The cities a sound wall stands near: Phoenix's ring, the built towns, the holdouts, the exit communities and the
// city generator's planned towns. Built once per world (and again when the city generator's plan grows).
function cityList(W) {
  const n = W.citygen?.plan?.length ?? 0;
  if (W._rsCities && W._rsCities.n === n) return W._rsCities.list;
  const list = [];
  for (const t of W.towns ?? []) if (t.built) list.push({ x: t.x, z: t.z, r: 320 });
  for (const H of W.holdouts ?? []) list.push({ x: H.cx, z: H.cz, r: Math.max(H.hw ?? 100, H.hd ?? 100) });
  for (const X of W.exits ?? []) if (X.community && X.dest) list.push({ x: X.dest.x, z: X.dest.z, r: 200 });
  for (const rec of W.citygen?.plan ?? []) if (rec.kind === 'town') list.push({ x: rec.x, z: rec.z, r: rec.half ?? 150 });
  W._rsCities = { n, list };
  return list;
}
export function cityDistOf(W) {
  const L = cityList(W);
  return (x, z) => {
    let d = W.ring ? -W.ring.depth(x, z) : Infinity;
    for (const c of L) { const q = Math.hypot(c.x - x, c.z - z) - c.r; if (q < d) d = q; }
    return d;
  };
}
export const roadBiomeAtOf = (W) => (x, z) => roadBiomeOf(W.biomeAt(x, z), W.regionOf?.(x, z, 3000)?.id ?? null, W.stateAt(x, z));

// A corridor as a road run for the placer (sA..sB: the arc length to scan). Its skip spans: the trimmed ends, every
// interchange (its own furniture), a bridge and its fills, the Phoenix island and ring, a built town's frontage.
export function corridorRun(W, cor, sA, sB) {
  const id = cor.id ?? 'I-10', i10 = cor === W.i10, exits = i10 ? (W.exits ?? []).filter((X) => !X.cor || X.cor === W.i10) : cor.exits;
  return {
    id, salt: saltOf(id), cls: CLASS_OF.corridor, L: cor.L, sA, sB,
    at: (s, P) => { const f = cor.at(s); P.x = f.x; P.z = f.z; P.tx = f.tx; P.tz = f.tz; return P; },
    half: (s) => cor.section(s).out,
    skip: (s) => {
      if (s < cor.mainlineFrom + 200 || s > cor.L - 120) return true;
      for (const X of exits) if (Math.abs(X.s - s) < 650) return true;
      if (i10 && W.water?.onBridge(s, 60)) return true;
      const f = cor.at(s);
      if (Math.abs(f.x) < 700 && Math.abs(f.z) < 700) return true;
      if (W.ring && W.ring.inCity(f.x, f.z, 40)) return true;
      for (const t of W.towns ?? []) if (t.built && Math.hypot(t.x - f.x, t.z - f.z) < 380) return true;
      return false;
    },
  };
}
// A county ribbon (an exit's cross road, a community's access road) as a road run. Its skip spans: its ends, its fills
// and decks, and the interchange it leaves.
export function ribbonRun(W, rb) {
  const seg = (s) => { let lo = 0, hi = rb.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rb.s[m] <= s) lo = m; else hi = m; } return lo; };
  return {
    id: rb.id, salt: saltOf(rb.id), cls: CLASS_OF.county, L: rb.L, sA: 0, sB: rb.L,
    at: (s, P) => { const i = seg(Math.max(0, Math.min(rb.L, s))), l = rb.s[i + 1] - rb.s[i] || 1, t = Math.max(0, Math.min(1, (s - rb.s[i]) / l)), dx2 = rb.x[i + 1] - rb.x[i], dz2 = rb.z[i + 1] - rb.z[i], dl = Math.hypot(dx2, dz2) || 1; P.x = rb.x[i] + dx2 * t; P.z = rb.z[i] + dz2 * t; P.tx = dx2 / dl; P.tz = dz2 / dl; return P; },
    half: (s) => { const i = seg(Math.max(0, Math.min(rb.L, s))); return Math.max(rb.wl[i], rb.wr[i]); },
    skip: (s) => {
      if (s < 12 || s > rb.L - 12) return true;
      const i = seg(s);
      if (rb.y[i] > 0.4 || rb.y[Math.min(rb.n - 1, i + 1)] > 0.4) return true; // on a fill or a deck
      const P = { x: rb.x[i], z: rb.z[i] };
      for (const cor of W.corridors ?? [W.i10]) { const q = cor.project(P.x, P.z, 90); if (q.d < 90) return true; } // the interchange
      return false;
    },
  };
}
// Debug (the roadscape command's audits): keep each chunk's placed props (kind, x, z, radius) on its layout.
export const RSC_DEBUG = { keep: false };
// This chunk's road runs: every corridor whose roadside can reach it, and every county ribbon nearby.
export function chunkRoads(W, cx, cz, C, featuresOf) {
  const ox = cx * C, oz = cz * C, mx = ox + C / 2, mz = oz + C / 2, R0 = C * 0.7072 + MAX_REACH, roads = [];
  for (const cor of W.corridors ?? [W.i10]) {
    if (!cor) continue;
    if (cor !== W.i10 && (cor.bbox.x1 < ox - R0 || cor.bbox.x0 > ox + C + R0 || cor.bbox.z1 < oz - R0 || cor.bbox.z0 > oz + C + R0)) continue;
    const pr = cor.project(mx, mz, R0);
    if (pr.d <= R0) roads.push(corridorRun(W, cor, pr.s - R0, pr.s + R0));
  }
  // County roads (exit cross roads and community access roads): the ribbons the 3 x 3 chunks round this one carry.
  const seen = new Set();
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const F = featuresOf(cx + dx, cz + dz);
    if (!F) continue;
    for (const rb of F.ribbons) {
      if (seen.has(rb) || rb.mainline || CLASS_OF[rb.kind] !== 'two-lane' || rb.n < 2 || rb.L < 60) continue;
      seen.add(rb);
      if (rb.x1 < ox - MAX_REACH || rb.x0 > ox + C + MAX_REACH || rb.z1 < oz - MAX_REACH || rb.z0 > oz + C + MAX_REACH) continue;
      roads.push(ribbonRun(W, rb));
    }
  }
  return roads;
}

// The stage: place, keep out, write. ctx = { W, cx, cz, C, INST, addBox, addOriented, blocked, wet, plant, specH, pause,
// resume, featuresOf, out }. Returns its stats (the chunk's out.roadscape).
export function* roadscapeStage(ctx) {
  const { W, cx, cz, C, INST, addBox, addOriented, blocked, wet, plant, specH } = ctx;
  const roads = chunkRoads(W, cx, cz, C, ctx.featuresOf);
  const st = { roads: roads.map((r) => `${r.id}:${r.cls}`), scenes: {}, placed: 0, dropped: { blocked: 0, wet: 0, pool: 0 }, kinds: {} };
  if (!roads.length) return st;
  const res = placeRoadside({ seed: W.seed, roads, ox: cx * C, oz: cz * C, C, biomeAt: roadBiomeAtOf(W), cityDistAt: cityDistOf(W) });
  ctx.pause(); yield; ctx.resume();
  for (const s of res.scenes) st.scenes[s.scene] = (st.scenes[s.scene] ?? 0) + 1;
  let k = 0;
  for (const p of res.props) {
    const rr = p.box?.r ?? (p.box ? p.box.su / 2 : 0.2); // an oriented box keeps its thickness off the road (it runs along it)
    if (blocked(p.x, p.z, p.kind === 'wire' ? 0 : Math.min(rr, 2))) { st.dropped.blocked++; continue; }
    if (wet(p.x, p.z)) { st.dropped.wet++; continue; }
    let i;
    if (p.pool === 'flora') { const sc = p.treeH / specH(p.sp); i = plant(p.sp, p.x, p.z, sc, p.rot, p.shade); }
    else i = INST[p.pool].push(p.x, p.y, p.z, p.rot, p.sx, p.sy, p.sz, p.c[0], p.c[1], p.c[2]);
    if (i < 0) { st.dropped.pool++; continue; }
    if (p.tag) {
      if (p.box.sa) addOriented(p.x, p.z, p.box.sa, p.box.su, p.rot, p.tag, p.h);
      else addBox(p.x - p.box.r, p.z - p.box.r, p.x + p.box.r, p.z + p.box.r, p.tag, p.h);
    }
    st.placed++; st.kinds[p.kind] = (st.kinds[p.kind] ?? 0) + 1;
    if (RSC_DEBUG.keep) (st.kept ??= []).push({ kind: p.kind, scene: p.scene, x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: p.kind === 'wire' ? 0 : Math.min(rr, 2), lat: +p.lat.toFixed(2), edge: +p.edge.toFixed(2) });
    if ((++k & 255) === 255) { ctx.pause(); yield; ctx.resume(); }
  }
  return st;
}
