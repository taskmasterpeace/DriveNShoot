// ROAD KIT · THE EXIT TABLE v1 (2026-10-03). Pure data + pure functions (no DOM, no THREE, no storage, no Math.random).
// Every exit on a highway is its own thing: a position-seeded roll picks a KIND from a weighted table (biome x ecotype x highway class x
// distance from the nearest city), the kind fixes the branch road, its length, what stands at the end (the DESTINATION: a streamer cell
// kind + an open-country overlay), the sign, and which faction hooks the exit accepts. Docs: docs/plans/BETWEEN_CITIES_PLAN.md.
//
// HOW IT STAYS ORDER INDEPENDENT (the seam rule of road-kit.js, extended):
//   * An exit SITE is a pure function of position: a cell is a site iff it is a straight through-highway cell, its roll is below the class
//     chance, and its roll is the LOWEST among every candidate cell within EXIT_RADIUS (a local-minimum rule: it spaces the exits out
//     without a stream, and one changed cell re-decides only its own window).
//   * The BRANCH is written onto the edge field by canonical edge key (edgeKey). `field(i,k,side)` = base class, else the class of the
//     branch that owns that key (found by probing the sites on the same row/column within MAX_BRANCH). Both cells that touch an edge
//     read the same key, so the seam is symmetric by construction, and road-kit buildModule turns the through cell into an `exit` module
//     (freeway) or a `hub` (two-lane turnoff) and the branch cells into straights ending in a stub (the destination).
//   * Nothing reads a neighbour's module and nothing depends on build order.
import { rollOf, edgeKey, rankOf, FREEWAY_RANK } from './road-kit.js';
import { BIOME_IDS } from './world-engine/between-cities.js';

export const EXITS_VERSION = 1;
export const EXIT_RADIUS_BY = Object.freeze({ interstate: 6, divided: 7, 'two-lane': 9, rural: 12 });   // two candidates conflict within the larger of their classes' radius (Chebyshev cells): sparser roads, sparser exits
export const EXIT_RADIUS = 6;                 // the smallest: no two exits are ever closer than this
const MAX_RADIUS = 12;
export const MAX_BRANCH = 6;                  // longest branch (cells)
export const MIN_CITY_CELLS = 2;              // no exit closer than this to a city (the city's own ramps own that ground)
export const KM_PER_CELL = 0.25536;           // 1344 u * 0.19 m (world-scale.js)
/** Chance a candidate cell that wins its window becomes an exit, by the through road class. */
export const EXIT_CHANCE = Object.freeze({ interstate: 0.62, divided: 0.5, 'two-lane': 0.34, rural: 0.2, dirt: 0 });
export const DEFAULT_EXIT_KNOBS = Object.freeze({ exits: 1, service: 1, settled: 1, industry: 1, nature: 1, strange: 1, secret: 1, law: 1 });

const W = (o, d = 0) => Object.fromEntries(BIOME_IDS.map(b => [b, o[b] ?? d]));
const HW = (o, d = 0) => ({ interstate: o.interstate ?? d, divided: o.divided ?? d, 'two-lane': o['two-lane'] ?? d, rural: o.rural ?? d, dirt: 0 });

/**
 * EXIT KINDS. weights = biome x hwy class x eco (ecotype multiplier) x group knob x distance term.
 *   branch {cls, len:[min,max]}      the lower road from the ramp terminal, and how many cells it runs
 *   dest   {stream, light, overlay, openKind}   what the last branch cell is: stream = cell-streamer kind ('open' = LIGHT cell),
 *          overlay = open-country OVERLAY_KINDS the cell should wear (town/strip/industrial/hamlet/cabin/lone-house), openKind = a CELL_KIND
 *   state  open | closed | gated | abandoned | checkpoint        what the ramp looks like on arrival
 *   near: N  more likely inside N cells of a city (and rare beyond)   far: N  only past N cells (ramps up to it)   min: hard minimum
 *   hooks.accepts                    the FACTION_HOOKS keys that may claim the exit (claimSlot contract, road-kit-wild.js)
 *   at                               what stands at the ramp terminal (road-kit prop names; roadside-studio fills in the models)
 */
export const EXIT_KINDS = Object.freeze({
  'gas-stop': { label: 'Gas stop', group: 'service', branch: { cls: 'two-lane', len: [1, 1] }, dest: { stream: 'open', light: true, overlay: 'strip', openKind: null }, state: 'open', sign: 'GAS', near: 14,
    weights: W({ forest: 1.2, farmland: 1.3, grassland: 1.5, desert: 1.2, tundra: 1, wetland: 1 }), hwy: HW({ interstate: 3, divided: 2, 'two-lane': 1.2 }), eco: {}, hooks: ['scavengers', 'bandits'], at: ['gas-station', 'parking', 'sign-pole'], tags: ['fuel', 'shop'] },
  'diner-motel': { label: 'Diner and motel', group: 'service', branch: { cls: 'two-lane', len: [1, 2] }, dest: { stream: 'open', light: true, overlay: 'strip', openKind: null }, state: 'open', sign: 'FOOD LODGING',
    weights: W({ forest: 1, farmland: 1.2, grassland: 1.3, desert: 1.2, tundra: 0.8, wetland: 0.7 }), hwy: HW({ interstate: 2.4, divided: 1.8, 'two-lane': 1.4, rural: 0.6 }), eco: {}, hooks: ['scavengers', 'bandits', 'nomads'], at: ['diner', 'motel', 'parking', 'neon-sign'], tags: ['food', 'bed', 'rumours'] },
  'truck-stop': { label: 'Truck stop', group: 'service', branch: { cls: 'two-lane', len: [1, 2] }, dest: { stream: 'open', light: true, overlay: 'strip', openKind: null }, state: 'open', sign: 'TRUCK STOP FUEL', far: 6,
    weights: W({ desert: 3, grassland: 1.8, farmland: 0.8, forest: 0.4, tundra: 0.8, wetland: 0.3 }), hwy: HW({ interstate: 3, divided: 1.6 }), eco: { 'high-desert': 1.4, sagebrush: 1.3 }, hooks: ['nomads', 'convoy', 'bandits'], at: ['gas-station', 'truck-park', 'diner', 'motel', 'scale-house'], tags: ['fuel', 'convoy-hub', 'trade'] },
  'rest-area': { label: 'Rest area', group: 'service', branch: { cls: 'rural', len: [1, 1] }, dest: { stream: 'open', light: true, overlay: null, openKind: null }, state: 'open', sign: 'REST AREA',
    weights: W({ forest: 1.2, farmland: 1.2, grassland: 1.2, desert: 1.4, tundra: 1, wetland: 0.7 }), hwy: HW({ interstate: 2.4, divided: 1 }), eco: {}, hooks: ['scavengers', 'nomads'], at: ['rest-building', 'picnic', 'parking', 'vending'], tags: ['safe-ish', 'map-board'] },
  'little-town': { label: 'Little town', group: 'settled', branch: { cls: 'two-lane', len: [2, 5] }, dest: { stream: 'open', light: true, overlay: 'town', openKind: null }, state: 'open', sign: 'TOWN SERVICES',
    weights: W({ forest: 1.4, farmland: 2.4, grassland: 1.1, desert: 0.5, tundra: 0.4, wetland: 0.9 }), hwy: HW({ interstate: 2, divided: 2, 'two-lane': 1.2, rural: 0.5 }), eco: { cornbelt: 1.4, 'mixed-farm': 1.2, flatwoods: 1.2 }, hooks: ['militia', 'patrol'], at: ['town-sign', 'water-tower'], tags: ['settlement', 'shops', 'law'] },
  'farm-road': { label: 'Farm road', group: 'settled', branch: { cls: 'rural', len: [1, 4] }, dest: { stream: 'open', light: true, overlay: null, openKind: 'farm' }, state: 'open', sign: null,
    weights: W({ farmland: 4, grassland: 1.6, forest: 0.7, wetland: 0.5 }), hwy: HW({ interstate: 0.8, divided: 1.4, 'two-lane': 1.8, rural: 1 }), eco: { cornbelt: 1.5, wheatbelt: 1.5, paddies: 1.4, plantation: 1.3 }, hooks: ['scavengers', 'bandits'], at: ['mailbox', 'cattle-guard'], tags: ['farm', 'dogs'] },
  'ranch': { label: 'Ranch gate', group: 'settled', branch: { cls: 'dirt', len: [2, 5] }, dest: { stream: 'open', light: true, overlay: null, openKind: 'ranch' }, state: 'open', sign: null,
    weights: W({ grassland: 3.2, desert: 1.4, farmland: 0.8, forest: 0.4, tundra: 0.3 }), hwy: HW({ interstate: 0.7, divided: 1, 'two-lane': 1.6, rural: 1.2 }), eco: { shortgrass: 1.6, savanna: 1.4 }, hooks: ['militia', 'bandits'], at: ['ranch-gate', 'cattle-guard', 'mailbox'], tags: ['livestock', 'private'] },
  'airstrip': { label: 'Crop-duster airstrip', group: 'settled', branch: { cls: 'rural', len: [2, 4] }, dest: { stream: 'open', light: true, overlay: null, openKind: 'plains' }, state: 'open', sign: null, far: 5,
    weights: W({ farmland: 2.4, grassland: 1.6, desert: 1, forest: 0.1, wetland: 0.3 }), hwy: HW({ interstate: 0.5, divided: 1, 'two-lane': 1.4, rural: 1 }), eco: { cornbelt: 1.4, wheatbelt: 1.4 }, hooks: ['nomads', 'bandits', 'patrol'], at: ['windsock', 'hangar'], tags: ['aircraft', 'smugglers'] },
  'industrial-yard': { label: 'Industrial yard', group: 'industry', branch: { cls: 'two-lane', len: [1, 3] }, dest: { stream: 'open', light: true, overlay: 'industrial', openKind: null }, state: 'open', sign: 'INDUSTRIAL PARK', near: 18,
    weights: W({ forest: 1, farmland: 1.2, grassland: 1, desert: 0.8, tundra: 0.5, wetland: 0.7 }), hwy: HW({ interstate: 2, divided: 2, 'two-lane': 1, rural: 0.3 }), eco: {}, hooks: ['militia', 'bandits', 'scavengers'], at: ['chain-fence', 'loading-dock', 'tank'], tags: ['industry', 'trucks', 'loot'] },
  'quarry': { label: 'Quarry and gravel pit', group: 'industry', branch: { cls: 'dirt', len: [2, 4] }, dest: { stream: 'open', light: true, overlay: 'industrial', openKind: 'badlands' }, state: 'open', sign: null,
    weights: W({ desert: 1.6, forest: 1.2, grassland: 1, farmland: 0.7, tundra: 1, wetland: 0.15 }), hwy: HW({ interstate: 1, divided: 1.2, 'two-lane': 1.5, rural: 1 }), eco: { mountain: 1.8, appalachian: 1.4, 'oak-hills': 1.3 }, hooks: ['bandits', 'militia', 'creature'], at: ['gravel-pile', 'haul-truck', 'conveyor'], tags: ['industry', 'pit', 'cover'] },
  'scenic-overlook': { label: 'Scenic overlook', group: 'nature', branch: { cls: 'rural', len: [1, 3] }, dest: { stream: 'open', light: true, overlay: null, openKind: 'mountain' }, state: 'open', sign: 'SCENIC VIEW',
    weights: W({ forest: 1.6, tundra: 1.8, desert: 1.4, grassland: 0.8, farmland: 0.4, wetland: 0.2 }), hwy: HW({ interstate: 1, divided: 1.2, 'two-lane': 1.6, rural: 1 }), eco: { mountain: 2.2, alpine: 2, appalachian: 1.5 }, hooks: ['nomads', 'creature'], at: ['overlook-wall', 'telescope', 'parking'], tags: ['view', 'safe-ish'] },
  'campground': { label: 'Campground', group: 'nature', branch: { cls: 'dirt', len: [1, 3] }, dest: { stream: 'open', light: true, overlay: 'cabin', openKind: 'woods' }, state: 'open', sign: 'CAMPING',
    weights: W({ forest: 3, tundra: 1.2, wetland: 0.8, grassland: 0.5, farmland: 0.3, desert: 0.3 }), hwy: HW({ interstate: 1, divided: 1.2, 'two-lane': 1.8, rural: 1.4 }), eco: { 'northern-forest': 1.5, taiga: 1.5, flatwoods: 1.2, appalachian: 1.3 }, hooks: ['scavengers', 'nomads', 'creature'], at: ['camp-sign', 'fire-ring', 'outhouse'], tags: ['woods', 'wildlife'] },
  'fish-camp': { label: 'Fish camp and boat ramp', group: 'nature', branch: { cls: 'dirt', len: [1, 3] }, dest: { stream: 'open', light: true, overlay: 'cabin', openKind: 'swamp' }, state: 'open', sign: 'BOAT RAMP',
    weights: W({ wetland: 5, forest: 0.4, farmland: 0.2 }), hwy: HW({ interstate: 0.8, divided: 1.2, 'two-lane': 1.8, rural: 1.4 }), eco: { bayou: 2.2, swamp: 2, everglades: 2.2, mangrove: 2.4, 'tidal-marsh': 1.8, marsh: 1.3 }, hooks: ['scavengers', 'bandits', 'nomads'], at: ['boat-ramp', 'dock', 'bait-shack'], tags: ['water-access', 'boats'] },
  'abandoned-exit': { label: 'Abandoned exit', group: 'strange', branch: { cls: 'rural', len: [1, 3] }, dest: { stream: 'open', light: true, overlay: null, openKind: 'plains' }, state: 'abandoned', sign: null, far: 5,
    weights: W({}, 0.55), hwy: HW({ interstate: 2, divided: 1.4, 'two-lane': 0.5 }), eco: {}, hooks: ['cult', 'scavengers', 'militia'], at: ['faded-sign', 'cracked-ramp', 'barrier'], tags: ['ruin', 'mystery'] },
  'ghost-town': { label: 'Ghost town', group: 'strange', branch: { cls: 'two-lane', len: [2, 5] }, dest: { stream: 'open', light: true, overlay: 'town', openKind: null, ruined: true }, state: 'abandoned', sign: null, far: 8,
    weights: W({ desert: 2.4, grassland: 1.6, tundra: 1.4, forest: 0.8, farmland: 0.7, wetland: 0.6 }), hwy: HW({ interstate: 1.2, divided: 1.4, 'two-lane': 1.6 }), eco: { 'high-desert': 1.5, sagebrush: 1.4 }, hooks: ['scavengers', 'bandits', 'cult'], at: ['broken-sign', 'water-tower', 'tumbleweed'], tags: ['ruin', 'loot', 'ambush'] },
  'military-road': { label: 'Military access road', group: 'law', branch: { cls: 'rural', len: [2, 5] }, dest: { stream: 'open', light: true, overlay: null, openKind: 'plains', family: 'military-base' }, state: 'gated', sign: 'GOVERNMENT PROPERTY', far: 9,
    weights: W({ desert: 2.4, grassland: 1.6, forest: 1, tundra: 1, farmland: 0.5, wetland: 0.3 }), hwy: HW({ interstate: 1.1, divided: 0.9, 'two-lane': 0.4 }), eco: { 'high-desert': 1.6, sagebrush: 1.4 }, hooks: ['patrol', 'militia'], at: ['gate', 'guard-shack', 'no-trespass-sign'], tags: ['restricted', 'armed'] },
  'checkpoint': { label: 'Checkpoint', group: 'law', branch: { cls: 'two-lane', len: [1, 2] }, dest: { stream: 'open', light: true, overlay: null, openKind: null }, state: 'checkpoint', sign: 'ALL TRAFFIC STOP', far: 7,
    weights: W({}, 1), hwy: HW({ interstate: 1.1, divided: 0.8, 'two-lane': 1 }), eco: {}, hooks: ['militia', 'bandits', 'patrol'], at: ['barricade', 'vehicle', 'flag'], tags: ['toll', 'shakedown'] },
  'compound-drive': { label: 'Compound drive', group: 'secret', branch: { cls: 'rural', len: [3, 6] }, dest: { stream: 'open', light: true, overlay: null, openKind: 'lone-house', family: 'compound' }, state: 'gated', sign: null, far: 6,
    weights: W({ forest: 1.4, farmland: 1.2, grassland: 1.2, desert: 0.8, tundra: 0.6, wetland: 0.5 }), hwy: HW({ interstate: 1.4, divided: 1.2, 'two-lane': 1.2, rural: 0.8 }), eco: {}, hooks: ['militia', 'cult', 'patrol'], at: ['gate', 'camera-pole', 'long-wall'], tags: ['estate', 'guarded', 'goods'] },
  'dead-end-secret': { label: 'Dead end with something at it', group: 'secret', branch: { cls: 'dirt', len: [4, 6] }, dest: { stream: 'open', light: true, overlay: null, openKind: 'woods', secret: true }, state: 'open', sign: null, far: 9,
    weights: W({ forest: 1.6, desert: 1.4, wetland: 1.2, tundra: 1, grassland: 0.8, farmland: 0.6 }), hwy: HW({ interstate: 0.6, divided: 0.6, 'two-lane': 0.9, rural: 0.8 }), eco: {}, hooks: ['cult', 'bandits', 'creature'], at: ['locked-gate', 'tyre-tracks'], tags: ['hidden', 'stronghold', 'boss-slot'] },
});
export const EXIT_KIND_IDS = Object.freeze(Object.keys(EXIT_KINDS));
for (const id of EXIT_KIND_IDS) EXIT_KINDS[id].id = id;

/** Display kinds the lab colours. */
export const EXIT_GROUPS = Object.freeze({ service: 'Services', settled: 'Settled', industry: 'Industry', nature: 'Nature', strange: 'Strange', law: 'Law', secret: 'Secret' });

const PERP = { ew: ['north', 'south'], ns: ['west', 'east'] };
const STEP = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/** Weight of a kind at a place. ctx = { biome, ecotype, hwyCls, cityDist, knobs }. */
export function exitWeight(kind, ctx) {
  const d = EXIT_KINDS[kind], k = { ...DEFAULT_EXIT_KNOBS, ...(ctx.knobs || {}) };
  let w = (d.weights[ctx.biome] ?? 0) * (d.hwy[ctx.hwyCls] ?? 0) * (d.eco[ctx.ecotype] ?? 1) * (k[d.group] ?? 1) * (ctx.econ && ctx.econ[kind] != null ? ctx.econ[kind] : 1);   // econ = the economy's demand table for this cell { kind: multiplier } (null = region data only)
  if (d.near != null) w *= ctx.cityDist <= d.near ? 1 + 1.2 * (1 - ctx.cityDist / d.near) : 0.35;
  if (d.far != null) w *= smooth(ctx.cityDist / d.far);
  return w;
}
/** THE ECONOMY HOOK: the weighted kind list for a place. econ = { kind: multiplier } supplied by the economy (demand per cell: a fuel-short region wants gas stops, a mining region wants quarries and truck stops); null = region data alone. */
export function exitKindWeights(region, road, distance, econ = null, knobs = null) {
  const ctx = { biome: region.biome, ecotype: region.ecotype || null, hwyCls: road, cityDist: distance, knobs, econ };
  return EXIT_KIND_IDS.map(id => ({ id, w: exitWeight(id, ctx) })).filter(x => x.w > 0);
}
const pickW = (items, r) => { const t = items.reduce((s, x) => s + x.w, 0); let x = r * t; for (const it of items) { if ((x -= it.w) < 0) return it; } return items.at(-1); };

/**
 * Build the exit net over a base road field.
 *   base      (i,k,side) -> road class | null            the road network without exits (symmetric by edgeKey, as every field)
 *   cityDist  (i,k) -> cells to the nearest city
 *   locate    (i,k) -> { biome, ecotype?, region? }     where a cell is (regions.js regionForCell in the lab/game)
 *   returns   { field, siteAt(i,k), cellRole(i,k), sitesIn(box), clear() }
 */
export function createExitNet({ seed = 1, base, cityDist = () => 99, locate = () => ({ biome: 'forest', ecotype: null }), knobs = {}, econ = null } = {}) {
  const kn = { ...DEFAULT_EXIT_KNOBS, ...knobs }, memo = { hwy: new Map(), site: new Map(), loc: new Map() }, key = (i, k) => `${i},${k}`;
  const where = (i, k) => { const c = key(i, k); let v = memo.loc.get(c); if (!v) { v = locate(i, k) || { biome: 'forest', ecotype: null }; memo.loc.set(c, v); } return v; };
  /** The through highway of a straight cell: { axis, cls } or null. */
  function hwy(i, k) {
    const c = key(i, k); if (memo.hwy.has(c)) return memo.hwy.get(c);
    const n = base(i, k, 'north'), e = base(i, k, 'east'), s = base(i, k, 'south'), w = base(i, k, 'west'); let out = null;
    if (e && w && e === w && !n && !s && rankOf(e) >= 2 && EXIT_CHANCE[e] > 0) out = { axis: 'ew', cls: e };
    else if (n && s && n === s && !e && !w && rankOf(n) >= 2 && EXIT_CHANCE[n] > 0) out = { axis: 'ns', cls: n };
    memo.hwy.set(c, out); return out;
  }
  /** Cells a branch could run from (i,k) towards `side`, all with no base road on any edge (length, up to MAX_BRANCH). */
  function freeLen(i, k, side) {
    const [dx, dz] = STEP[side]; let n = 0;
    for (let d = 1; d <= MAX_BRANCH; d++) {
      const ci = i + dx * d, ck = k + dz * d;
      if (['north', 'east', 'south', 'west'].some(s => { const [ex, ez] = STEP[s]; return !(ex === -dx && ez === -dz) && base(ci, ck, s); })) break;   // a road already touches that cell (other than our own branch edge)
      if (base(ci, ck, side === 'north' ? 'south' : side === 'south' ? 'north' : side === 'east' ? 'west' : 'east')) break;
      n = d;
    }
    return n;
  }
  const isCandidate = (i, k) => { const h = hwy(i, k); if (!h) return false; if (cityDist(i, k) < MIN_CITY_CELLS) return false; return PERP[h.axis].some(s => freeLen(i, k, s) >= 1); };
  const score = (i, k) => rollOf(seed, 'exit', 'score', i, k);
  function siteAt(i, k) {
    const c = key(i, k); if (memo.site.has(c)) return memo.site.get(c);
    let site = null;
    if (isCandidate(i, k) && kn.exits > 0) {
      const h = hwy(i, k), s0 = score(i, k);
      let win = s0 < Math.min(0.95, EXIT_CHANCE[h.cls] * kn.exits);
      for (let dk = -MAX_RADIUS; win && dk <= MAX_RADIUS; dk++) for (let di = -MAX_RADIUS; di <= MAX_RADIUS; di++) {
        if (!di && !dk) continue; const ci = i + di, ck = k + dk, ho = hwy(ci, ck); if (!ho || Math.max(Math.abs(di), Math.abs(dk)) > Math.max(EXIT_RADIUS_BY[h.cls], EXIT_RADIUS_BY[ho.cls]) || !isCandidate(ci, ck)) continue;
        const so = score(ci, ck); if (so < s0 || (so === s0 && (ci < i || (ci === i && ck < k)))) { win = false; break; }
      }
      if (win) site = decide(i, k, h);
    }
    memo.site.set(c, site); return site;
  }
  function decide(i, k, h) {
    const loc = where(i, k), cd = cityDist(i, k), free = PERP[h.axis].map(s => ({ s, n: freeLen(i, k, s) })).filter(x => x.n >= 1);
    const sideRoll = rollOf(seed, 'exit', 'side', i, k), ctx = { biome: loc.biome, ecotype: loc.ecotype, hwyCls: h.cls, cityDist: cd, knobs: kn, econ: econ ? econ(i, k, loc) : null };
    const side = free[Math.floor(sideRoll * free.length)], room = side.n;
    let el = EXIT_KIND_IDS.filter(id => EXIT_KINDS[id].branch.len[0] <= room).map(id => ({ id, w: exitWeight(id, ctx) })).filter(x => x.w > 0);
    if (!el.length) el = [{ id: 'farm-road', w: 1 }];
    const kind = pickW(el, rollOf(seed, 'exit', 'kind', i, k)).id, d = EXIT_KINDS[kind], [a, b] = d.branch.len, hi = Math.min(b, room);
    const len = a + Math.floor(rollOf(seed, 'exit', 'len', i, k) * (hi - a + 1)), [dx, dz] = STEP[side.s], along = h.axis === 'ew' ? i : k;
    const dest = { i: i + dx * len, k: k + dz * len, stream: d.dest.stream, light: d.dest.light, overlay: d.dest.overlay, openKind: d.dest.openKind, ...(d.dest.family ? { family: d.dest.family } : {}), ...(d.dest.ruined ? { ruined: true } : {}), ...(d.dest.secret ? { secret: true } : {}) };
    const km = Math.round(Math.abs(along) * KM_PER_CELL);
    return { id: `exit:${i},${k}`, i, k, kind, label: d.label, group: d.group, state: d.state, axis: h.axis, side: side.s, len, hwyCls: h.cls, branchCls: d.branch.cls, dest,
      cells: Array.from({ length: len }, (_, q) => ({ i: i + dx * (q + 1), k: k + dz * (q + 1) })), km, no: km % 1000, sign: d.sign ? `EXIT ${km % 1000}  ${d.sign}` : `EXIT ${km % 1000}`,
      biome: loc.biome, ecotype: loc.ecotype || null, cityDist: cd, hooks: [...d.hooks], at: [...d.at], tags: [...d.tags], claim: null };
  }
  /** The class of the branch that owns an edge key, or null. Probes the sites on the same row / column. */
  function branchClass(k0) {
    const [ax, rest] = k0.split(':'), [ei, ek] = rest.split(',').map(Number); let best = null;
    const consider = s => { if (!best || rankOf(s.branchCls) > rankOf(best) || (rankOf(s.branchCls) === rankOf(best) && s.branchCls < best)) best = s.branchCls; };
    for (let e = -MAX_BRANCH - 1; e <= MAX_BRANCH + 1; e++) {
      if (ax === 'v') {            // vertical edge south of (ei, ek): exit cells (ei, ek + e) with a north/south branch
        const ci = ei, ck = ek + e, s = siteAt(ci, ck); if (!s || s.axis !== 'ew') continue;
        if (s.side === 'south' && ck <= ek && ek - ck < s.len) consider(s); else if (s.side === 'north' && ck - 1 - ek >= 0 && ck - 1 - ek < s.len) consider(s);
      } else {                     // horizontal edge east of (ei, ek): exit cells (ei + e, ek) with an east/west branch
        const ci = ei + e, ck = ek, s = siteAt(ci, ck); if (!s || s.axis !== 'ns') continue;
        if (s.side === 'east' && ci <= ei && ei - ci < s.len) consider(s); else if (s.side === 'west' && ci - 1 - ei >= 0 && ci - 1 - ei < s.len) consider(s);
      }
    }
    return best;
  }
  const field = (i, k, side) => base(i, k, side) || branchClass(edgeKey(i, k, side));
  /** What this cell is in the exit system: { role:'exit'|'branch'|'terminal', site, d } | null. */
  function cellRole(i, k) {
    const own = siteAt(i, k); if (own) return { role: 'exit', site: own, d: 0 };
    for (let e = -MAX_BRANCH; e <= MAX_BRANCH; e++) for (const [ci, ck] of [[i, k + e], [i + e, k]]) {
      const s = siteAt(ci, ck); if (!s) continue; const q = s.cells.findIndex(c => c.i === i && c.k === k);
      if (q >= 0) return { role: q === s.cells.length - 1 ? 'terminal' : 'branch', site: s, d: q + 1 };
    }
    return null;
  }
  function sitesIn({ i0, i1, k0, k1 }) { const out = []; for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) { const s = siteAt(i, k); if (s) out.push(s); } return out; }
  return { field, base, siteAt, cellRole, sitesIn, branchClass, where, hwy, clear() { memo.hwy.clear(); memo.site.clear(); memo.loc.clear(); }, seed, knobs: kn };
}

/** Cell-level dressing for road-kit-roadside: services are the exit's job near an exit (a gas pull-off right beside a gas exit is clutter). */
export function roadsideKnobsNear(net, i, k, knobs = {}) {
  for (let d = -1; d <= 1; d++) if (net.siteAt(i + d, k) || net.siteAt(i, k + d)) return { ...knobs, services: (knobs.services ?? 1) * 0.15, signage: (knobs.signage ?? 1) * 0.5 };
  return knobs;
}

/** Claim an exit for a faction / encounter (pure: returns a new record; the net never mutates). Same contract as road-kit-wild claimSlot. */
export function claimExit(site, { by, spawn = null, data = null }) {
  if (site.claim) throw new Error(`exit ${site.id} is already claimed by ${site.claim.by}`);
  if (!site.hooks.includes(by)) throw new Error(`exit ${site.id} (${site.kind}) does not accept ${by}; accepts ${site.hooks.join(', ')}`);
  return { ...site, claim: { by, spawn, data } };
}

/** A ledger of a list of sites: counts by kind, group, state, and the spacing between exits (cells) along a route order. */
export function exitLedger(sites) {
  const byKind = {}, byGroup = {}, byState = {};
  for (const s of sites) { byKind[s.kind] = (byKind[s.kind] || 0) + 1; byGroup[s.group] = (byGroup[s.group] || 0) + 1; byState[s.state] = (byState[s.state] || 0) + 1; }
  return { total: sites.length, byKind, byGroup, byState };
}
