// THE HOUSE GARDEN as rows (docs/design/WEB_FARMING.md): plots dug in a yard you hold, real seed, water and days; a coop of
// hens. systems/farming.js is the one consumer. Adding a crop is adding a row; nothing here makes stock: a harvest is
// bounded by the seed that went in, the water that was carried and the days that passed (WEB_DEPTH_PLAN law 1 and 2).
// Our own words; the plants are real ones. No purple (crop colours are validated).
import { ITEMS } from './items.js';

// ---- 1. the calendar shim ---------------------------------------------------------------------------------------------
// The SEASONS lane owns the calendar. Until its systems/seasons.js lands this reads g.seasons when present (`month` 1-12
// or `calendar()` returning { month }) and otherwise holds a fixed spring, so a garden is never blocked on another lane.
export const CALENDAR_FALLBACK = { month: 4, name: 'APRIL', season: 'spring', fixed: true };
export const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const SEASON_OF = (m) => (m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn');
// The seasons lane's system (systems/seasons.js, g.seasons: calendar().month is 0-11, read(x,z), growthFactor(x,z)) is
// the real source; a bare { month: 1-12 } (a test's stub) is still read, and nothing at all holds a fixed April.
export const hasSeasons = (g) => typeof g?.seasons?.read === 'function' && typeof g.seasons.calendar === 'function';
export function calendar(g) {
  const S = g?.seasons;
  let m = null;
  if (S) m = hasSeasons(g) ? (S.calendar()?.month ?? -1) + 1 : S.month ?? S.cal?.month ?? null;
  if (Number.isFinite(m) && m >= 1 && m <= 12) return { month: Math.round(m), name: MONTH_NAMES[Math.round(m) - 1], season: SEASON_OF(Math.round(m)), fixed: false };
  return { ...CALENDAR_FALLBACK };
}
// Chance per night of a killing frost, by month (the cold months), before the region and a crop's hardiness.
export const FROST = { 1: 0.5, 2: 0.4, 3: 0.14, 4: 0.02, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0.04, 11: 0.2, 12: 0.45 };
// Region/biome lean: frost x, rain chance a day, evaporation x, pest x (usmap biome letters: d desert, f flats, p plains,
// m mountain, w wetland, a farmland, F forest, s swamp, u dead sprawl, . scrub).
export const CLIMATE = {
  d: { frost: 0.5, rain: 0.04, evap: 1.7, pest: 0.6 }, f: { frost: 0.6, rain: 0.06, evap: 1.5, pest: 0.7 },
  p: { frost: 1.0, rain: 0.18, evap: 1.0, pest: 1.0 }, m: { frost: 1.6, rain: 0.22, evap: 0.8, pest: 0.9 },
  w: { frost: 0.8, rain: 0.3, evap: 0.8, pest: 1.2 }, a: { frost: 1.0, rain: 0.2, evap: 1.0, pest: 1.1 },
  F: { frost: 1.0, rain: 0.28, evap: 0.8, pest: 1.3 }, s: { frost: 0.15, rain: 0.4, evap: 0.9, pest: 1.3 },
  u: { frost: 1.0, rain: 0.15, evap: 1.1, pest: 0.8 }, '.': { frost: 0.8, rain: 0.1, evap: 1.3, pest: 0.8 },
};
export const CLIMATE_DEFAULT = { frost: 1, rain: 0.15, evap: 1, pest: 1 };
// Heat by month for evaporation (x the base).
export const HEAT = { 1: 0.5, 2: 0.55, 3: 0.7, 4: 0.85, 5: 1.05, 6: 1.35, 7: 1.5, 8: 1.45, 9: 1.2, 10: 0.9, 11: 0.65, 12: 0.5 };

// ---- 2. the plot and the garden rules --------------------------------------------------------------------------------
export const GARDEN = {
  yardPad: 18,          // m past a held building's walls that still counts as its yard
  maxPlots: 8,          // beds a household can keep
  plotSize: [2.6, 1.9], // m (x, z) of one bed
  gap: 0.6,             // m kept between two beds
  tillSecs: 8,          // digging a bed (a hoe or a shovel; a shovel is slower, a hoe is made for it)
  sowSecs: 3, waterSecs: 3, harvestSecs: 4, fenceSecs: 10, clearSecs: 4, feedSecs: 2,
  reach: 2.6,           // m from a bed that you can work it
  litrePerWater: 0.2,   // one litre of water is this much of a bed's wet (a bed holds 5 L)
  toolSkillTime: { hoe: 1, shovel: 1.35 },
  fertStart: { d: 0.3, f: 0.35, '.': 0.35, s: 0.5, default: 0.6 },
  fertCompost: 0.35, fertDay: 0.01, fertMax: 1,
  evapPerHour: 0.012,   // a bed's wet lost an hour in April weather (x HEAT x climate x crop thirst)
  rainWater: 0.5,       // wet a rainy day puts in an uncovered bed
  dryBelow: 0.1,        // a bed under this is dry: the crop takes damage
  dryDmgPerHour: 0.02,  // x the crop's thirst
  growWetFull: 0.4,     // at this wet and above the crop grows at full pace
  growNeedWet: 0.12,    // under this it does not grow at all
  offSeasonRate: 0.25, shoulderRate: 0.6, bestRate: 1.15, plantRate: 1,
  healthFloor: 0.05,    // a crop at this health or less is wilted
  blight: { perDay: 0.035, wetMul: 2, repeatMul: 2.2, spreadR: 7, spreadP: 0.25, dmgPerHour: 0.012 },
  pest: { perDay: 0.12, fence: 0.12, scarecrow: 0.5, dmg: 0.22, ripeLoss: 0.3, grazeR: 3.2, grazeDmg: 0.1 },
  tramplesR: 2.2, theftR: 2.6, // m a hostile must stand to trample or to lift a ripe crop
  scarecrowR: 9,
  sunkLabour: 0.04,     // xp a sown seed teaches (the real teacher is the harvest)
  yieldSkill: 0.07,     // yield x (1 + this x farming level 0-10)
  rippleHold: 1,
  catchUpMaxDays: 60,   // a long absence still only plays this many days
  fence: { cost: [['planks', 4]], dmgMul: 0.12, colour: '#7a6246', posts: 6 },
  scarecrow: { cost: [['rag', 2], ['deadwood', 2]], colour: '#8a7a56' },
  catcherReach: 9, catcherTrickle: 1.0, // an adjacent rain catcher waters a thirsty bed from its own tank (litres per hour)
  colours: { bed: '#3e2f22', bedWet: '#2c2218', stem: '#4f7a2e', leaf: '#5d8a34', wilt: '#6a5a3a', seed: '#7a6a4a', blight: '#5a5a32' },
};

// ---- 3. the crops ------------------------------------------------------------------------------------------------------
//   days      game days from sown to ripe (at the best pace)         thirst    x evaporation and dry damage
//   plant     months it is sown in; best: its best months (pace x1.15); anything else is off-season (pace x0.25)
//   hardy     0-1 cold hardiness: a killing frost takes it with chance FROST x (1 - hardy)
//   yield     [min, max] of produce at skill 0 and rich soil; seeds: packets saved off a harvest
//   hold      game days a ripe crop keeps on the plant before it spoils there
//   drain     the fertility a harvest takes from the bed         region: only grows here (citrus: florida)
//   perennial after a harvest it goes back to this share of growth instead of dying (a tree)
//   fruit     the colour of what ripens (drawn as a small block at the top of the plant); h its height (m)
export const CROPS = {
  beans:   { name: 'Pole beans', seed: 'seed_beans', item: 'bean_pods', days: 8, thirst: 0.9, plant: [4, 5, 6, 7, 8], best: [5, 6], hardy: 0.1, yield: [6, 9], seeds: [1, 2], hold: 4, drain: 0.1, fruit: '#5f8a2e', h: 0.7, leaf: '#6a9a3a', fs: 0.1 },
  squash:  { name: 'Summer squash', seed: 'seed_squash', item: 'squash', days: 10, thirst: 1.1, plant: [4, 5, 6, 7], best: [5, 6], hardy: 0.05, yield: [4, 6], seeds: [1, 2], hold: 6, drain: 0.16, fruit: '#e0b830', h: 0.5, leaf: '#3f7a34', fs: 0.2, ground: true },
  corn:    { name: 'Sweet corn', seed: 'seed_corn', item: 'corn_ear', days: 14, thirst: 1.1, plant: [4, 5, 6], best: [4, 5], hardy: 0.1, yield: [5, 8], seeds: [1, 2], hold: 5, drain: 0.2, fruit: '#e0c850', h: 1.4, leaf: '#5f8f2e', blade: 0.9, ear: true },
  tomato:  { name: 'Tomatoes', seed: 'seed_tomato', item: 'tomato', days: 12, thirst: 1.2, plant: [4, 5, 6], best: [5, 6], hardy: 0.0, yield: [7, 10], seeds: [1, 2], hold: 3, drain: 0.18, fruit: '#d83a26', h: 0.9, leaf: '#4a8a34', fs: 0.14 },
  pepper:  { name: 'Peppers', seed: 'seed_pepper', item: 'pepper', days: 14, thirst: 0.9, plant: [4, 5, 6, 7], best: [5, 6, 7], hardy: 0.0, yield: [5, 8], seeds: [1, 2], hold: 6, drain: 0.12, fruit: '#d85a1e', h: 0.7, leaf: '#3f7a2e', fs: 0.11 },
  potato:  { name: 'Potatoes', seed: 'seed_potato', item: 'potato', days: 12, thirst: 0.9, plant: [2, 3, 4, 9], best: [3, 4], hardy: 0.5, yield: [6, 10], seeds: [1, 2], hold: 20, drain: 0.16, fruit: '#efe6d2', h: 0.45, leaf: '#4f8a38', fs: 0.08 },
  greens:  { name: 'Collard greens', seed: 'seed_greens', item: 'greens', days: 6, thirst: 1.0, plant: [2, 3, 4, 9, 10, 11], best: [3, 4, 10], hardy: 0.85, yield: [5, 8], seeds: [1, 2], hold: 8, drain: 0.08, fruit: '#4f9a3c', h: 0.5, leaf: '#3a8a3a', fs: 0.1 },
  herbs:   { name: 'Kitchen herbs', seed: 'seed_herbs', item: 'herbs', days: 7, thirst: 0.6, plant: [3, 4, 5, 6, 9], best: [4, 5], hardy: 0.4, yield: [3, 5], seeds: [1, 3], hold: 10, drain: 0.04, fruit: '#a8d06a', h: 0.35, leaf: '#7aa84a', fs: 0.07 },
  melon:   { name: 'Watermelon', seed: 'seed_melon', item: 'melon', days: 14, thirst: 1.3, plant: [4, 5, 6], best: [5, 6], hardy: 0.0, yield: [2, 4], seeds: [2, 4], hold: 6, drain: 0.2, fruit: '#4a8a44', h: 0.4, leaf: '#3a7a3a', fs: 0.34, ground: true },
  citrus:  { name: 'Orange tree', seed: 'seed_citrus', item: 'orange', days: 30, thirst: 0.8, plant: [2, 3, 4, 9, 10], best: [3, 4, 10], hardy: 0.55, yield: [8, 14], seeds: [0, 1], hold: 12, drain: 0.1, fruit: '#f0902a', h: 1.7, leaf: '#3a7a32', fs: 0.16, perennial: 0.55, region: 'florida' },
};
export const STAGES = ['seed', 'sprout', 'mid', 'ripe', 'wilted'];
export const STAGE_AT = { seed: 0, sprout: 0.1, mid: 0.4, ripe: 1 }; // growth shares

// ---- 4. the hens -------------------------------------------------------------------------------------------------------
export const COOP = {
  cost: [['planks', 6]], secure: [['scrap', 2]], // a plain coop; a latch and wire (secure) keep the night out
  secs: 14, secureSecs: 6, slots: 6, reach: 2.8, size: [1.8, 1.1, 1.2], run: [3.2, 2.6], colour: '#7a5a3c', roof: '#5a4630',
  feedPerHen: 0.5,       // feed units a hen eats a day (one chicken_feed = 1; an ear of corn = 0.5)
  waterPerHen: 0.25,     // litres a hen drinks a day
  lay: 0.7,              // chance a fed, watered hen lays on a day
  fedDaysMax: 2,         // days a hen goes unfed before it stops laying; she dies at deadDays
  deadDays: 5,
  predator: { perNight: 0.16, secure: 0.15, dog: 0.35, infected: 3 }, // x when the latch+wire is on; x with a bonded dog in the yard; x with infected near
  chickDays: 3, hatchP: 0.12, growDays: 14, // with a rooster in the coop a hen may hatch a chick a day; a chick grows to a hen
  meat: { hen: [['raw_fowl', 2, 2], ['feathers', 2, 3]], rooster: [['raw_fowl', 2, 3], ['feathers', 1, 3]], chick: [['raw_fowl', 1, 1]] },
  feedItems: { chicken_feed: 1, corn_ear: 0.5, bean_pods: 0.25 },
};

// ---- 5. the items (added to data/items.js ITEMS at boot) ---------------------------------------------------------------
const SEED = (crop, name, v, desc) => ({ name: `${name} seed`, kind: 'part', kg: 0.01, bulk: 0.02, stack: 12, value: v, spoils: 4000, seedOf: crop, use: { act: 'sow' }, tags: ['seed'], desc });
const PRODUCE = (name, kg, value, spoils, food, extra = {}) => ({ name, kind: 'food', kg, bulk: kg * 1.1, stack: 12, value, spoils, use: { need: 'food', amount: food, water: 0.01 }, dog: { bond: 2, hp: 4 }, tags: ['produce'], ...extra });
export const FARM_ITEMS = {
  hoe: { name: 'Garden hoe', kind: 'tool', kg: 1.6, bulk: 2.4, stack: 1, value: 14, use: { act: 'dig' }, tags: ['dig', 'till', 'steel'], desc: 'A forged blade on an ash handle, the edge bright from use. Breaks ground for a bed.' },
  shovel: { name: 'Shovel', kind: 'tool', kg: 2.4, bulk: 2.8, stack: 1, value: 16, use: { act: 'dig' }, tags: ['dig', 'steel'], desc: 'A round-point shovel. It digs a bed, a hole or a grave, slower than a hoe on a bed.' },
  bucket: { name: 'Galvanised bucket', kind: 'water', kg: 10.4, kgEmpty: 0.4, bulk: 11, stack: 1, value: 9, uses: 10, refill: 'water', use: { act: 'garden_water' }, tags: ['bucket'], desc: 'Ten litres of well water in a dented pail. Pour it on a bed, a hen\'s trough or, if you must, your own head.' },
  compost: { name: 'Compost', kind: 'part', kg: 0.8, bulk: 1, stack: 6, value: 2, use: { act: 'fertilise' }, tags: ['fertiliser'], desc: 'Dark crumbly rot from the pile. Feeds a bed for a season.' },
  chicken_feed: { name: 'Chicken feed', kind: 'part', kg: 1.2, bulk: 1.4, stack: 6, value: 4, spoils: 900, use: { act: 'feedcoop' }, tags: ['feed'], desc: 'Cracked grain in a paper sack. A hen a day, half a scoop.' },
  hen: { name: 'Laying hen', kind: 'part', kg: 2.2, bulk: 3, stack: 1, value: 28, live: 'hen', use: { act: 'stock' }, desc: 'A brown hen, indignant. She wants a coop, feed and water. In return, eggs.' },
  rooster: { name: 'Rooster', kind: 'part', kg: 2.8, bulk: 3.4, stack: 1, value: 30, live: 'rooster', use: { act: 'stock' }, desc: 'Loud. Keep him with the hens and the flock replaces itself.' },
  egg: { name: 'Egg', kind: 'food', kg: 0.06, bulk: 0.08, stack: 12, value: 3, spoils: 480, raw: true, cooks: 'boiled_egg', use: { need: 'food', amount: 0.05 }, dog: { bond: 3, hp: 6 }, tags: ['produce'], desc: 'Still warm. Cook it: raw is a gamble you do not need.' },
  boiled_egg: { name: 'Boiled egg', kind: 'food', kg: 0.06, bulk: 0.08, stack: 12, value: 4, spoils: 120, use: { need: 'food', amount: 0.1, hp: 1 }, dog: { bond: 3, hp: 6 }, desc: 'A hard-boiled egg, salt if you have it.' },
  cook_pot: { name: 'Cooking pot', kind: 'tool', kg: 1.1, bulk: 2, stack: 1, value: 14, tags: ['pot', 'steel'], desc: 'A dented pot with a wire bail. Stews and soups need one.' },
  bean_pods: PRODUCE('Green beans', 0.25, 2, 120, 0.06),
  squash: PRODUCE('Squash', 0.5, 3, 200, 0.1),
  corn_ear: PRODUCE('Ear of corn', 0.35, 2, 140, 0.08, { raw: false }),
  tomato: PRODUCE('Tomato', 0.2, 3, 100, 0.05, { use: { need: 'food', amount: 0.05, water: 0.03 } }),
  pepper: PRODUCE('Pepper', 0.12, 3, 140, 0.04),
  potato: PRODUCE('Potato', 0.3, 2, 500, 0.07),
  greens: PRODUCE('Collard greens', 0.2, 2, 80, 0.05),
  herbs: PRODUCE('Kitchen herbs', 0.04, 4, 120, 0.01),
  melon: PRODUCE('Watermelon', 3.5, 6, 160, 0.14, { use: { need: 'food', amount: 0.12, water: 0.12 }, stack: 2, bulk: 4 }),
  orange: PRODUCE('Orange', 0.25, 4, 300, 0.05, { use: { need: 'food', amount: 0.05, water: 0.05 } }),
};
for (const [id, c] of Object.entries(CROPS)) FARM_ITEMS[c.seed] = SEED(id, c.name.split(' ').pop() === 'tree' ? 'Orange' : c.name, 2, `A twist of paper, a pinch of ${c.name.toLowerCase()} seed. One bed of ${c.name.toLowerCase()}, if you have the water.`);
for (const [id, r] of Object.entries(FARM_ITEMS)) if (!ITEMS[id]) ITEMS[id] = r;
// Where the kit turns up. NOT in the world's loot tables: those feed every generated chunk, and the P1 chunk hashes are
// pinned (a row added to LOOT moved chunk -6,0). Seeds and tools come by the two channels that do not touch a chunk:
//   a trader's counter (Mags, who buys fruit, keeps seed and a hoe, a bucket, a sack of feed and a hen or two), and
//   the crew's scavenge runs (data/crewjobs.js CREW_RUN_LOOT: seeds in a kitchen drawer, a hoe in a shed).
// Both are the existing channels; nothing here makes a seed a loot box would not.
import { TRADERS } from './trade.js';
import { CREW_RUN_LOOT } from './crewjobs.js';
export const FARM_KEEPS = [['seed_beans', 4], ['seed_herbs', 4], ['seed_potato', 3], ['seed_greens', 3], ['seed_tomato', 2], ['seed_squash', 2], ['seed_corn', 2], ['hoe', 1], ['bucket', 1], ['chicken_feed', 2], ['hen', 2]];
export const FARM_RUN_LOOT = [['seed_beans', 2, 1, 2], ['seed_herbs', 2, 1, 2], ['seed_tomato', 1, 1, 2], ['seed_potato', 1, 1, 2], ['seed_pepper', 1, 1, 1], ['hoe', 1, 1, 1], ['bucket', 1, 1, 1], ['compost', 1, 1, 2]];
if (TRADERS.mags && !TRADERS.mags.keeps?.some((k) => k[0] === 'hoe')) TRADERS.mags.keeps = [...(TRADERS.mags.keeps ?? []), ...FARM_KEEPS];
for (const r of FARM_RUN_LOOT) if (!CREW_RUN_LOOT.some((q) => q[0] === r[0])) CREW_RUN_LOOT.push(r);

export function validateFarming(crops = CROPS, items = ITEMS) {
  const bad = [];
  const hue = (hex) => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return -1; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; return h; };
  for (const [id, c] of Object.entries(crops)) {
    const at = `crop ${id}`;
    if (!c.name || !(c.days > 0)) bad.push(`${at}: name and days`);
    if (!items[c.seed]) bad.push(`${at}: seed ${c.seed} is not an item`);
    if (!items[c.item]) bad.push(`${at}: produce ${c.item} is not an item`);
    else if (items[c.item].kind !== 'food') bad.push(`${at}: produce must be food`);
    if (!c.plant?.length || c.plant.some((m) => !(m >= 1 && m <= 12))) bad.push(`${at}: plant months 1-12`);
    if (c.best?.some((m) => !c.plant.includes(m))) bad.push(`${at}: a best month must be a planting month`);
    if (!(c.hardy >= 0 && c.hardy <= 1)) bad.push(`${at}: hardy 0-1`);
    if (!(c.thirst > 0)) bad.push(`${at}: thirst`);
    if (!(c.yield?.[0] >= 1 && c.yield[1] >= c.yield[0])) bad.push(`${at}: yield [min,max]`);
    if (!(c.seeds?.[1] >= c.seeds?.[0])) bad.push(`${at}: seeds range`);
    if (!(c.hold > 0)) bad.push(`${at}: hold`);
    if (c.perennial !== undefined && !(c.perennial > 0 && c.perennial < 1)) bad.push(`${at}: perennial is a share 0-1`);
    if (items[c.seed] && items[c.seed].seedOf !== id) bad.push(`${at}: its seed item must point back (seedOf)`);
    if (c.region && !['florida', 'west'].includes(c.region)) bad.push(`${at}: region`);
    const hf = hue(c.fruit); if (hf >= 270 && hf <= 320) bad.push(`${at}: fruit colour is purple`);
  }
  for (const k of Object.keys(GARDEN.colours)) { const h = hue(GARDEN.colours[k]); if (h >= 270 && h <= 320) bad.push(`garden colour ${k} is purple`); }
  for (const [item] of [...GARDEN.fence.cost, ...GARDEN.scarecrow.cost, ...COOP.cost, ...COOP.secure]) if (!items[item]) bad.push(`build cost ${item} is not an item`);
  for (const k of Object.keys(COOP.feedItems)) if (!items[k]) bad.push(`feed ${k} is not an item`);
  for (const k of Object.keys(CLIMATE)) if (!(CLIMATE[k].rain >= 0 && CLIMATE[k].evap > 0)) bad.push(`climate ${k}`);
  for (const f of [...Object.values(COOP.meat).flat()]) if (!items[f[0]]) bad.push(`coop meat ${f[0]} is not an item`);
  return { ok: !bad.length, bad, crops: Object.keys(crops).length };
}
