// ROAD KIT · THE WILD v1 (2026-10-03). DATA ONLY: clear slots in the land between cities where non-city factions, bandits and
// encounters can be hung later. Nothing here spawns anyone and nothing reads a faction system: a slot is an empty, addressable,
// position-seeded place with tags and a hook contract. Docs: docs/ROADKIT.md ("The wild stays wild").
//
// THE RULE: the land between cities is NOT tamed by the road kit. Roadside scenes are the human footprint (houses, signs, gas);
// wild slots are the opposite layer: the places a road makes dangerous or strange (a bend with cover, a wreck, a dead exit, a
// camp off the shoulder). They thin out near a city (the protected radius) and thicken the further a cell is from one.
import { rollOf, KIT_CLASSES, H } from './road-kit.js';
import { BIOME_IDS } from './world-engine/between-cities.js';

export const PROTECTED_CELLS = 2;            // within this many cells of a city: no wild slots (the city's own law)
export const FULL_WILD_CELLS = 8;            // at this distance and beyond: full wildness
export const DEFAULT_WILD_KNOBS = Object.freeze({ wildness: 1, hostile: 1, strange: 1, wildlife: 1 });
// THE MAIN ROAD IS NOT WILD (Robert, 2026-10-03). A freeway (interstate / divided: KIT_CLASSES rank >= FREEWAY_RANK) carries ambient traffic, highway patrol, checkpoints, rest stops,
// billboards, exit scenes, breakdowns and convoys (road-kit-highway.js). Bandits, ambushes, wrecks, camps, wildlife stampedes and faction fights live OFF it: on exit roads, back
// roads, open country, ghost towns, camps. So a cell the main road runs through offers no wild slot except the weather front (weather is not an encounter someone placed).
export const MAIN_ROAD_ALLOWED = Object.freeze(['weather-front']);
export const isMainRoadCell = module => !!module && Object.values(module.edges || {}).some(c => c && KIT_CLASSES[c] && KIT_CLASSES[c].rank >= 5);

/** 0 in the protected radius, ramping smoothly to 1 at FULL_WILD_CELLS. */
export function wildnessAt(cityDist, knob = 1) {
  const t = Math.max(0, Math.min(1, (cityDist - PROTECTED_CELLS) / (FULL_WILD_CELLS - PROTECTED_CELLS)));
  return Math.min(1.5, t * t * (3 - 2 * t) * knob);
}
const W = (o, dflt = 0) => Object.fromEntries(BIOME_IDS.map(b => [b, o[b] ?? dflt]));
/**
 * SLOT KINDS. chance = base x wildness x byClass x biome x knob(group) per cell. `hooks.accepts` = the faction/encounter keys a
 * later system may claim the slot with (FACTION_HOOKS). `needs` = what the slot expects the road/cell to offer.
 * Encounter ids echo docs/research/ROAD-BIOMES-2026-09-21.md (the 30 road-encounter templates) where one fits.
 */
export const WILD_SLOT_KINDS = Object.freeze({
  'ambush-bend': { label: 'Bend with cover', group: 'hostile', base: 0.22, byClass: { 'two-lane': 1.4, rural: 1.2, dirt: 1.5, divided: 0.5, interstate: 0.2 }, weights: W({ forest: 1.5, wetland: 1.2, desert: 0.8, grassland: 0.5, farmland: 0.6, tundra: 0.8 }), needs: 'a curve or a tree wall within 60 u of the road',
    tags: ['cover', 'close-range', 'road-pinch'], hooks: { accepts: ['bandits', 'militia', 'creature'], note: 'sniper nest, rope across the road, a felled tree' } },
  'roadblock': { label: 'Roadblock site', group: 'hostile', base: 0.12, byClass: { interstate: 1.2, divided: 1, 'two-lane': 1.3, rural: 0.7, dirt: 0.4 }, weights: W({}, 1), needs: 'a straight run with a shoulder to park vehicles',
    tags: ['blocks-road', 'vehicles', 'checkpoint'], hooks: { accepts: ['bandits', 'militia', 'patrol', 'cult'], note: 'toll, shakedown, a closed military exit, a checkpoint with no flag' } },
  'wreck': { label: 'Wreck / pileup', group: 'strange', base: 0.2, byClass: { interstate: 1.4, divided: 1.2, 'two-lane': 1, rural: 0.6, dirt: 0.3 }, weights: W({ desert: 1.2, tundra: 1.3, wetland: 1, forest: 0.9, grassland: 1, farmland: 0.8 }), needs: 'any straight run',
    tags: ['lootable', 'bait', 'cover'], hooks: { accepts: ['scavengers', 'bandits', 'convoy', 'creature'], note: 'overturned bus, convoy with no plates, a burnt-out tanker' } },
  'camp-off-road': { label: 'Camp off the shoulder', group: 'hostile', base: 0.16, byClass: { 'two-lane': 1.2, rural: 1.4, dirt: 1.6, divided: 0.8, interstate: 0.5 }, weights: W({ forest: 1.6, desert: 1.1, wetland: 1, grassland: 1, farmland: 0.6, tundra: 1 }), needs: '80-300 u of open or wooded ground beside the road',
    tags: ['hideout', 'fire-smoke', 'foot-traffic'], hooks: { accepts: ['bandits', 'scavengers', 'nomads', 'cult'], note: 'a smoke column you can see from the road' } },
  'bandit-den': { label: 'Den (building or cave)', group: 'hostile', base: 0.07, byClass: { rural: 1.4, dirt: 1.8, 'two-lane': 1, divided: 0.4, interstate: 0.2 }, weights: W({ forest: 1.4, desert: 1.5, wetland: 0.8, grassland: 0.8, farmland: 0.9, tundra: 0.7 }), needs: 'a farm lane, a dead exit, or a rock face',
    tags: ['stronghold', 'interior', 'loot', 'boss-slot'], hooks: { accepts: ['bandits', 'militia', 'cult', 'creature'], note: 'the one place a faction keeps a base; later a boss or a quest giver' } },
  'dead-exit': { label: 'Exit that goes nowhere', group: 'strange', base: 0.1, byClass: { interstate: 2, divided: 1.2, 'two-lane': 0.3, rural: 0, dirt: 0 }, weights: W({}, 1), needs: 'an exit-capable class (the road-kit exit module or a pull-off)',
    tags: ['ramp', 'abandoned', 'mystery'], hooks: { accepts: ['cult', 'militia', 'scavengers'], note: 'the exit that should not exist; a closed military exit' } },
  'wildlife-crossing': { label: 'Wildlife crossing', group: 'wildlife', base: 0.2, byClass: { 'two-lane': 1.2, rural: 1.2, dirt: 1, divided: 1, interstate: 0.8 }, weights: W({ forest: 1.4, grassland: 1.6, wetland: 1.1, tundra: 1.2, farmland: 0.7, desert: 0.6 }), needs: 'a tree wall or open ground on both sides',
    tags: ['animals', 'traffic-hazard', 'neutral'], hooks: { accepts: ['wildlife', 'creature'], note: 'a stampede, a migration, a giant footprint crossing' } },
  'weather-front': { label: 'Weather front on the road', group: 'strange', base: 0.1, byClass: { interstate: 1, divided: 1, 'two-lane': 1, rural: 1, dirt: 1 }, weights: W({ desert: 1.4, grassland: 1.4, wetland: 1.2, tundra: 1.5, forest: 0.8, farmland: 1 }), needs: 'any cell (a multi-cell effect: claim the whole run)',
    tags: ['multi-cell', 'sight-lines', 'driving-physics'], hooks: { accepts: ['weather'], note: 'dust storm, whiteout, tornado chase, a fire roadblock' } },
});
export const WILD_KIND_IDS = Object.freeze(Object.keys(WILD_SLOT_KINDS));
/** The keys a later faction / encounter system may claim slots with. Documented, not implemented. */
export const FACTION_HOOKS = Object.freeze({
  bandits: 'Road gangs: ambush, toll, den', scavengers: 'Pick over wrecks and camps; neutral until provoked', militia: 'Self-appointed checkpoints and patrols; a state in miniature',
  cult: 'Roadside congregations, dead-exit shrines', nomads: 'Convoy camps and traders; sells, does not fight first', patrol: 'A distant authority: the city police or the army looking out',
  convoy: 'Moving vehicles that stop at a wreck or roadblock', creature: 'Animals and anomalies that are not a faction', wildlife: 'Herds and migrations', weather: 'A front that covers cells',
});

/** The wild slots of one cell. ctx = { seed, biome, cityDist (number or (i,k)=>number), knobs }. Pure, position-seeded. */
export function wildSlotsForCell(module, ctx = {}) {
  const { seed = 1, biome = 'forest' } = ctx, knobs = { ...DEFAULT_WILD_KNOBS, ...(ctx.knobs || {}) };
  const cityDist = typeof ctx.cityDist === 'function' ? ctx.cityDist(module.i, module.k) : (ctx.cityDist ?? 99), wild = wildnessAt(cityDist, knobs.wildness);
  if (wild <= 0 || module.kind === 'empty') return [];
  const protectedRoad = knobs.protectMainRoad !== false && isMainRoadCell(module);
  const roadCls = module.main?.cls || SIDEBEST(module), out = [];
  for (const id of WILD_KIND_IDS) {
    if (protectedRoad && !MAIN_ROAD_ALLOWED.includes(id)) continue;
    const def = WILD_SLOT_KINDS[id], k = knobs[def.group] ?? 1, byC = def.byClass[roadCls] ?? 0, wb = def.weights[biome] ?? 0;
    if (def.needs.startsWith('an exit-capable') && !['exit', 'diamond', 'cloverleaf', 'transition'].includes(module.kind) && !(module.kind === 'straight' && (roadCls === 'interstate' || roadCls === 'divided'))) continue;
    if (module.kind === 'hub' && id !== 'roadblock' && id !== 'camp-off-road') continue;
    const chance = def.base * wild * byC * wb * k * (module.kind === 'straight' ? 1 : 0.6);
    if (chance <= 0 || rollOf(seed, 'wild', module.i, module.k, id) >= Math.min(0.9, chance)) continue;
    const along = -H + 90 + (2 * H - 180) * rollOf(seed, 'wildx', module.i, module.k, id), side = rollOf(seed, 'wildside', module.i, module.k, id) < 0.5 ? 1 : -1;
    const C = KIT_CLASSES[roadCls] || KIT_CLASSES['two-lane'], off = id === 'roadblock' ? 0 : id === 'wreck' ? C.half * 0.7 : C.half + C.clearZone + 20 + 180 * rollOf(seed, 'wildy', module.i, module.k, id);
    const axis = module.main?.axis || 'ew', local = axis === 'ew' ? { x: along, z: side * off } : { x: -side * off, z: along };
    out.push({ id: `wild:${module.i},${module.k}:${id}`, kind: id, label: def.label, group: def.group, cell: module.id, at: local, side: side === 1 ? 'right' : 'left', roadCls, biome, cityDist, wildness: +wild.toFixed(3),
      tags: [...def.tags], hooks: { accepts: [...def.hooks.accepts], note: def.hooks.note }, claim: null });
  }
  return out;
}
const SIDEBEST = m => { const o = ['interstate', 'divided', 'two-lane', 'street', 'rural', 'dirt']; const have = Object.values(m.edges).filter(Boolean); return o.find(c => have.includes(c)) || 'two-lane'; };

/** Claim a slot for a faction/encounter (pure: returns a new slot; the kit never mutates). Refuses a key the slot does not accept. */
export function claimSlot(slot, { by, spawn = null, data = null }) {
  if (slot.claim) throw new Error(`slot ${slot.id} is already claimed by ${slot.claim.by}`);
  if (!slot.hooks.accepts.includes(by)) throw new Error(`slot ${slot.id} (${slot.kind}) does not accept ${by}; accepts ${slot.hooks.accepts.join(', ')}`);
  return { ...slot, claim: { by, spawn, data } };
}
export const unclaimed = slots => slots.filter(s => !s.claim);
export function wildSlotsForStrip(cells, { seed = 1, biome = 'forest', knobs = {}, length, ends = 'city', cityDist = null } = {}) {
  const n = length ?? (Math.max(...cells.map(c => c.i)) + 1), cd = cityDist || (i => (ends === 'city' ? Math.min(i, n - 1 - i) : 99));
  return cells.flatMap(m => wildSlotsForCell(m, { seed, biome, knobs, cityDist: (i, k) => cd(i, k) + Math.abs(k) * 0 }));
}
