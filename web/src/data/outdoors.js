// THE WILDS as rows (docs/design/WEB_WILDS.md): living off the land outside the towns. Birds you can shoot out of the
// sky, the sign everything leaves on the ground (tracks), fish by water and region, what grows by biome, snares and
// fish traps that fill on the game clock, a camp kit, and the eight outdoor skills with their talents. systems/outdoors.js
// is the one consumer; fauna.js, dogs.js and the inventory read a few of these numbers through it.
// Adding a bird / fish / plant / talent is adding a row. Our own words; real animals and plants are ours to use; no purple.
import { ITEMS, LOOT } from './items.js';
import { SPECIES, HABITATS, FAUNA_RULES } from './fauna.js';
import { SKILLS } from './skills.js';
import { BREEDS } from './dogs.js';

// ---- 1. birds you can shoot (data/fauna.js SPECIES rows, added at boot) -----------------------------------------------
// Ground birds feed in the open and go up together at a shot or a threat (THE QUIET: they lift before you see why);
// water birds rest at a bank. Up in the air they are hit at their height by a round aimed at them (the mouse ray:
// systems/fauna.js skyAim), a shotgun's spread being the best chance. A bird shot down falls and lies as a carcass.
export const BIRDS = {
  crow: {
    name: 'Crow', form: 'bird', group: { kind: 'flock', size: [3, 8] }, active: 'diurnal', temper: 'prey',
    senses: { sight: 55, smell: 5, hear: 50, night: 0.3 }, speed: { walk: 0.7, run: 10 }, turn: 3, hp: 4,
    fear: { fire: 5, beam: 8, gun: 110 }, alarm: 15, flee: 1, voice: 'caw',
    butcher: { time: 2, yields: [['raw_fowl', 1, 1], ['feathers', 1, 2]] },
    body: { span: 0.95, len: 0.42, coat: '#1c1a19', wing: '#24211f', tipc: '#302c29', head: '#1c1a19', legs: '#1a1816', ground: true },
  },
  dove: {
    name: 'Mourning dove', form: 'bird', group: { kind: 'flock', size: [2, 6] }, active: 'diurnal', temper: 'prey',
    senses: { sight: 40, smell: 5, hear: 40, night: 0.3 }, speed: { walk: 0.6, run: 13 }, turn: 4, hp: 3,
    fear: { fire: 5, beam: 8, gun: 90 }, alarm: 12, flee: 1, voice: 'coo',
    butcher: { time: 1.5, yields: [['raw_fowl', 1, 1], ['feathers', 1, 1]] },
    body: { span: 0.48, len: 0.3, coat: '#a89c8a', wing: '#9a8e7c', tipc: '#4a4440', head: '#b4a896', legs: '#b8645a', ground: true },
  },
  duck: {
    name: 'Wild duck', form: 'bird', group: { kind: 'flock', size: [3, 8] }, active: 'diurnal', temper: 'prey',
    senses: { sight: 40, smell: 5, hear: 40, night: 0.5 }, speed: { walk: 0.5, run: 14 }, turn: 3, hp: 6,
    fear: { fire: 6, beam: 10, gun: 100 }, alarm: 18, flee: 1, voice: 'quack',
    butcher: { time: 3, yields: [['raw_fowl', 1, 2], ['feathers', 1, 2]] },
    body: { span: 0.9, len: 0.5, coat: '#7a6a52', wing: '#6a5c48', tipc: '#3e3a34', head: '#2e5a3e', beak: '#d8b03a', legs: '#d88a3a', wader: true, coats: ['#7a6a52', '#8a7a62', '#6a5e4c'] },
  },
  goose: {
    name: 'Goose', form: 'bird', group: { kind: 'flock', size: [4, 9] }, active: 'diurnal', temper: 'prey',
    senses: { sight: 50, smell: 5, hear: 45, night: 0.5 }, speed: { walk: 0.6, run: 15 }, turn: 2.2, hp: 12,
    fear: { fire: 6, beam: 10, gun: 110 }, alarm: 22, flee: 1, voice: 'honk',
    butcher: { time: 4, yields: [['raw_fowl', 2, 3], ['feathers', 2, 3], ['bone', 1, 1]] },
    body: { span: 1.6, len: 0.75, coat: '#8a8274', wing: '#7a7266', tipc: '#3a3632', head: '#1e1c1a', beak: '#24221e', legs: '#24221e', wader: true },
  },
};
for (const [id, row] of Object.entries(BIRDS)) if (!SPECIES[id]) SPECIES[id] = row;
// Where they live: ground birds by biome, water birds only within reach of a bank (data/fauna.js HABITATS).
export const BIRD_HABITATS = [
  { region: 'west', biomes: 'pau', species: 'crow', perKm2: 3 },
  { region: 'west', biomes: 'dfpa', species: 'dove', perKm2: 4 },
  { region: 'west', biomes: 'dfpmwau', species: 'duck', perKm2: 10, near: 'water' },
  { region: 'west', biomes: 'pmwa', species: 'goose', perKm2: 5, near: 'water' },
  { region: 'florida', biomes: 'paFu', species: 'crow', perKm2: 3 },
  { region: 'florida', biomes: 'pafF', species: 'dove', perKm2: 4 },
  { region: 'florida', biomes: 'sw.Ffp', species: 'duck', perKm2: 12, near: 'water' },
];
// Wing shooting (systems/fauna.js skyShot): a shot at a bird on the wing lands this many seconds of its flight behind it
// (x (1 - 0.06 x HUNTING level), at least 0.3 of it). A duck at full speed is ~0.8 m on: a bullet misses, buckshot does not.
FAUNA_RULES.wingLag ??= 0.06;
for (const h of BIRD_HABITATS) if (!HABITATS.some((x) => x.species === h.species && x.region === h.region)) HABITATS.push(h);

// What else comes off an animal now (added to the fauna rows' yields): sinew off the big four-legged game, feathers
// off the wading birds, and a vulture's feathers (nobody eats a vulture: no meat).
const MORE_YIELDS = { mule_deer: [['sinew', 1, 2]], whitetail: [['sinew', 1, 2]], hog: [['sinew', 1, 1]], javelina: [['sinew', 1, 1]], coyote: [['sinew', 1, 1]], panther: [['sinew', 1, 2]], heron: [['feathers', 1, 2]] };
for (const [sp, rows] of Object.entries(MORE_YIELDS)) { const B = SPECIES[sp]?.butcher; if (B) for (const r of rows) if (!B.yields.some((y) => y[0] === r[0])) B.yields.push(r); }
if (SPECIES.vulture && !SPECIES.vulture.butcher) SPECIES.vulture.butcher = { time: 3, yields: [['feathers', 2, 4], ['bone', 1, 1]] };

// ---- 2. tracks: the sign everything leaves (systems/outdoors.js keeps them in one pool, drawn as one decal mesh) ------
//   size      the decal's length along the way it went (m); w its width (m); colour how dark it darkens the ground
//             (the decal MULTIPLIES the ground: it can only darken it, and an old print fades toward white, i.e. away)
//   every     a print every this many metres of travel; stagger  m a boot's left and right feet sit either side of the line
//   cell      which shape in the print atlas (systems/outdoors.js printAtlas): 0 a boot sole, 1 a shuffling scuff (toe
//             dragged), 2 a long drag or smear, 3 a round splat (drops, paws, hooves)
//   base      how readable it is fresh (1 = plain as day; a snake's drag in the sand is faint; a herd's trampled path, 2.5,
//             is plainer than plain); blood  it is blood (read longer, and the Read-the-blood talent reads it)
//   lifeH     game hours it lasts on good ground in dry weather before it is gone to anybody
export const TRACK_KINDS = {
  boot: { name: 'boot prints', size: 0.3, w: 0.13, colour: '#4a3a2c', every: 1.5, base: 1, lifeH: 18, cell: 0, stagger: 0.11 },
  paw: { name: 'paw prints', size: 0.14, w: 0.12, colour: '#4e4032', every: 1.3, base: 0.8, lifeH: 12, cell: 3 },
  hoof: { name: 'hoof prints', size: 0.16, w: 0.13, colour: '#4a3a2c', every: 1.8, base: 0.9, lifeH: 16, cell: 3, stagger: 0.12 },
  claw: { name: 'a belly drag and claw marks', size: 0.6, w: 0.35, colour: '#423a28', every: 1.6, base: 1, lifeH: 14, cell: 2 },
  slither: { name: "a snake's wavy drag", size: 0.5, w: 0.12, colour: '#5a4e3a', every: 1.2, base: 0.55, lifeH: 6, cell: 2 },
  bird: { name: 'bird feet', size: 0.1, w: 0.08, colour: '#504636', every: 0.8, base: 0.5, lifeH: 4, cell: 3 },
  tyre: { name: 'tyre tracks', size: 2.6, w: 0.24, colour: '#3e3428', every: 3, base: 1, lifeH: 30, cell: 2, stagger: 0.75 },
  blood: { name: 'blood drops', size: 0.18, w: 0.18, colour: '#6a0c08', every: 2, base: 1, lifeH: 10, cell: 3, blood: true },
  // The infected (WEB_ZOMBIES.md): they shuffle, toes dragging; a crawler drags itself, hands clawing; the wounded smear.
  scuff: { name: 'shuffling prints, the toes dragged', size: 0.75, w: 0.34, colour: '#2a1c10', every: 1.1, base: 2.5, lifeH: 18, cell: 1, stagger: 0.13 },
  drag: { name: 'something dragging itself, hands clawing', size: 1.0, w: 0.55, colour: '#2a1c10', every: 0.55, base: 2.5, lifeH: 20, cell: 2 },
  smear: { name: 'smeared blood', size: 0.8, w: 0.3, colour: '#6a0a06', every: 1.2, base: 1, lifeH: 12, cell: 2, blood: true },
};
// Which kind of print a maker leaves (fauna form / species; people; dogs; vehicles).
export const TRACK_OF = { quad: 'hoof', snake: 'slither', bird: 'bird', gator: 'claw', crawler: 'paw', paws: ['coyote', 'panther', 'twinback'], infected: 'scuff', infectedCrawl: 'drag', infectedBlood: 'smear' };
// How well the ground holds a print (usmap biome letters): sand and mud hold, rock and pavement barely.
export const GROUND_HOLD = { d: 1, f: 0.9, m: 0.5, p: 0.9, w: 1.25, a: 1.1, u: 0.35, s: 1.2, F: 0.9, '.': 0.7 };
export const TRACKS = {
  pool: 640,           // tracks kept at once (oldest go first)
  draw: 420,           // drawn at once at most (one InstancedMesh: one draw call)
  drawR: 55,           // drawn within this of where the camera looks
  layEvery: 0.2,       // seconds between deposit passes
  makerR: 160,         // movers further than this from you leave nothing (nobody would ever read it)
  readR: 14,           // `read` looks this far round the point by default
  // What a reader of skill L sees: a track no older than (ageH + perLevelH x L) x the ground's hold x weather; tiny
  // things (bird feet, a snake's drag) need the skill more (x base).
  ageH: 0.35, perLevelH: 0.4, rainMul: 0.35, bleedFresh: 0.6, // blood stays readable this much longer than prints (x)
  wounded: 0.7,        // an animal under this share of its hp bleeds as it goes; a person while c.bleed > 0
};

// ---- 3. fish ------------------------------------------------------------------------------------------------------------
// The water body kind comes from THE water authority (world/water.js depthAt + the streamed world's body rows); the
// island's water is river or lake; Florida's open water is swamp or sea.
//   waters  where it bites; regions; w its weight in the roll; rare: the fishing talent raises its weight
export const FISH = [
  { id: 'catfish', item: 'fish_catfish', waters: ['river', 'lake', 'canal', 'swamp', 'creek'], regions: ['west', 'florida'], w: 5 },
  { id: 'carp', item: 'fish_carp', waters: ['river', 'lake', 'canal'], regions: ['west'], w: 5 },
  { id: 'bass', item: 'fish_bass', waters: ['lake', 'river', 'swamp'], regions: ['west', 'florida'], w: 4 },
  { id: 'panfish', item: 'fish_panfish', waters: ['lake', 'creek', 'swamp', 'canal'], regions: ['west', 'florida'], w: 6 },
  { id: 'trout', item: 'fish_trout', waters: ['creek', 'river'], regions: ['west'], w: 2, rare: true },
  { id: 'gar', item: 'fish_gar', waters: ['swamp', 'river', 'canal'], regions: ['florida', 'west'], w: 2, rare: true },
  { id: 'mullet', item: 'fish_mullet', waters: ['sea', 'lagoon', 'canal'], regions: ['florida'], w: 6 },
  { id: 'crayfish', item: 'crayfish', waters: ['creek', 'swamp', 'canal', 'river'], regions: ['west', 'florida'], w: 2 },
];
export const FISH_TRASH = [['old_boot', 3], ['rusty_can', 4], ['tangled_line', 2]];
export const FISHING = {
  reach: [2.5, 9],      // the cast lands this far ahead of you (m); the first point with this much water takes it
  minDepth: 0.45,
  biteS: [5, 16],       // real seconds till a bite (x skill, x bait, x the hour: dawn and dusk bite best)
  window: 0.65,         // seconds to strike once it bites (+ skill)
  trash: 0.12,          // a boot instead of a fish (less with skill)
  hookLoss: 0.15,       // a missed strike loses the hook this often (and always the bait)
  bait: { grubs: 1, raw_game: 0.85, raw_fowl: 0.85, fish_panfish: 0.75, crayfish: 0.8 }, // x the wait
  hourMul: { dawn: 0.7, dusk: 0.7, day: 1, night: 1.15 },
  moveCancel: 1.2,
  // Fish traps and gill nets set in water fill on the game clock: catches an hour, the most they hold.
  traps: { fishtrap: { perHour: 0.18, max: 3, item: 'fish_trap' }, net: { perHour: 0.4, max: 6, item: 'gill_net' } },
};

// ---- 4. foraging --------------------------------------------------------------------------------------------------------
//   biomes   usmap letters it grows in; region (optional); p: the chance a search turns it up; n: how many
//   poison   a forager without the mushroom talent may pick it (it is in the basket; eaten, it makes you sick)
export const FORAGE = [
  { item: 'cactus_fruit', biomes: 'dfm', p: 0.45, n: [1, 3] },
  { item: 'mesquite_pods', biomes: 'dfpw', p: 0.4, n: [2, 4] },
  { item: 'yucca_root', biomes: 'dfm', p: 0.25, n: [1, 1] },
  { item: 'juniper_berries', biomes: 'mfF', p: 0.3, n: [2, 5] },
  { item: 'wild_onion', biomes: 'pafF', p: 0.3, n: [1, 3] },
  { item: 'cattail_root', biomes: 'ws.', p: 0.35, n: [1, 2], wet: true },
  { item: 'swamp_cabbage', biomes: 'sF', p: 0.3, n: [1, 1], region: 'florida' },
  { item: 'wild_berries', biomes: 'FpasF', p: 0.3, n: [2, 6], region: 'florida' },
  { item: 'desert_sage', biomes: 'dfm', p: 0.25, n: [1, 2], med: true },
  { item: 'creosote_leaves', biomes: 'df', p: 0.3, n: [1, 3], med: true },
  { item: 'willow_bark', biomes: 'ws', p: 0.25, n: [1, 2], med: true, wet: true },
  { item: 'puffball', biomes: 'pafFsw', p: 0.18, n: [1, 2] },
  { item: 'pale_cap', biomes: 'pafFsw', p: 0.14, n: [1, 1], poison: true },
  { item: 'grubs', biomes: 'dfpmwaFs', p: 0.4, n: [1, 4] },
  { item: 'deadwood', biomes: 'dfpmwaFs.', p: 0.7, n: [1, 3] },
];
export const FORAGING = {
  seconds: 6,          // a search (real s; you stand and look; moving off ends it)
  rolls: 2,            // rows tried per search (+ the talent)
  cell: 48,            // a patch: picking it over thins it; it grows back
  take: 0.34,          // what one search takes out of a patch (richness 1 = untouched)
  regrowPerDay: 0.5,
  moveCancel: 1.4,
};

// ---- 5. trapping --------------------------------------------------------------------------------------------------------
// A snare on a game trail (snare wire from your pack) fills on the game clock while you are away: a chance an hour by
// the ground's small game (x the trapping skill), one animal a snare.
export const TRAPPING = {
  maxSnares: 4,
  perHour: 0.06,
  biomeGame: { d: 1, f: 1.2, p: 1.1, m: 0.7, w: 1.1, a: 1, u: 0.25, s: 0.9, F: 1.2 },
  // What a snare holds when checked: a rabbit mostly, now and then a ground bird. dressed: what the field-dressing talent adds.
  catch: [{ name: 'jackrabbit', w: 3, items: [['raw_game', 1, 1], ['rabbit_pelt', 1, 1]], dressed: [['sinew', 1, 1], ['bone', 1, 1]] },
    { name: 'ground bird', w: 1, items: [['raw_fowl', 1, 1], ['feathers', 1, 2]], dressed: [['feathers', 1, 1]] }],
};

// ---- 6. the camp kit ----------------------------------------------------------------------------------------------------
// Built where you stand (`camp build=`), kept in the save. A fire pit is a real fire (cooking: fauna.cook; the cold),
// fed with deadwood; a drying rack turns raw meat and fish into dried meat on the game clock; a rain catcher fills while
// it rains and tops up your water. Drawn as plain shapes (one instanced mesh).
export const CAMP = {
  firepit: { name: 'fire pit', cost: [['deadwood', 3]], hoursPerWood: 1.5, r: 0.55, colour: '#2a2522', size: [1.1, 0.18, 1.1] },
  rack: { name: 'drying rack', cost: [['deadwood', 4]], hours: 6, slots: 8, makes: 'dried_meat', colour: '#6a5236', size: [1.4, 1.1, 0.25] },
  catcher: { name: 'rain catcher', cost: [['tarp', 1]], perHour: 1.6, cap: 12, colour: '#5e6a5a', size: [1.3, 0.5, 1.3] }, // litres an hour at full rain
  reach: 2.6, max: 12,
};

// ---- 7. the skills (data/skills.js rows: they grow by doing) and their talents --------------------------------------------
export const OUTDOOR_SKILLS = {
  tracking: { label: 'TRACKING', short: 'TRK', what: 'older, fainter sign; who made it, how many, which way, how long ago, who is bleeding' },
  hunting: { label: 'HUNTING', short: 'HNT', what: 'cleaner kills and butchering: faster, more meat, hides that do not tear' },
  fishing: { label: 'FISHING', short: 'FSH', what: 'quicker bites, a longer strike window, fewer boots' },
  foraging: { label: 'FORAGING', short: 'FRG', what: 'more found in a search; which mushroom kills you' },
  trapping: { label: 'TRAPPING', short: 'TRP', what: 'snares and fish traps that fill faster' },
  animal_handling: { label: 'ANIMAL HANDLING', short: 'ANM', what: 'dogs that follow a trail further and fetch what you shoot' },
  cooking: { label: 'COOKING', short: 'CK', what: 'cooked food that keeps; faster drying; no gut from raw meat' },
  outdoorsman: { label: 'OUTDOORSMAN', short: 'OUT', what: 'quicker camp work, a thriftier fire, a trail of your own that fades' },
};
for (const [k, row] of Object.entries(OUTDOOR_SKILLS)) if (!SKILLS[k]) SKILLS[k] = row;
// Where xp comes from.
export const OUTDOOR_XP = {
  tracking: { read: 1.2, blood: 2, dogTrail: 2 },
  hunting: { kill: 4, bird: 3, butcher: 3 },
  fishing: { catch: 3, trash: 0.5 },
  foraging: { find: 1, med: 1.5 },
  trapping: { catch: 3, set: 0.5 },
  animal_handling: { dogTrail: 3, fetch: 2 },
  cooking: { cut: 1, rack: 1.5 },
  outdoorsman: { build: 3, perHourOut: 0.6 },
};
// What a level is worth, before talents (each fx key multiplies or adds where its consumer reads it).
export const OUTDOOR_PER_LEVEL = {
  butcherTime: -0.04, hideChance: 0.04, biteWait: -0.05, strikeWindow: 0.04, trash: -0.009, forageP: 0.06,
  snareRate: 0.08, dogNose: 0.05, cookKeepH: 3, campTime: -0.03,
};
// Talents: at a level the skill opens a talent; fx adds (+) or sets (=) a number its consumer reads.
export const TALENTS = [
  { skill: 'tracking', at: 3, id: 'count_feet', name: 'Count the feet', fx: { countFeet: 1 }, what: 'how many made the sign, not just what' },
  { skill: 'tracking', at: 6, id: 'read_blood', name: 'Read the blood', fx: { readBlood: 1, bloodAgeMul: 1.5 }, what: 'who is bleeding; blood reads half as long again' },
  { skill: 'tracking', at: 9, id: 'old_sign', name: 'Old sign', fx: { trackAgeH: 3 }, what: 'sign three game hours older than anyone else sees' },
  { skill: 'hunting', at: 3, id: 'clean_kill', name: 'Clean kill', fx: { meatBonus: 1 }, what: 'one more cut of meat off every carcass' },
  { skill: 'hunting', at: 6, id: 'waste_nothing', name: 'Waste nothing', fx: { sinewBonus: 1, boneBonus: 1 }, what: 'one more sinew and bone' },
  { skill: 'hunting', at: 9, id: 'still_hunter', name: 'Still hunter', fx: { preyNoticeMul: 0.7 }, what: 'game notices you at 70% of the distance' },
  { skill: 'fishing', at: 3, id: 'read_water', name: 'Read the water', fx: { rareMul: 2 }, what: 'the rare fish come twice as often' },
  { skill: 'fishing', at: 6, id: 'two_hooks', name: 'Two hooks', fx: { doubleCatch: 0.25 }, what: 'a quarter of strikes land two' },
  { skill: 'fishing', at: 9, id: 'night_lines', name: 'Night lines', fx: { trapFillMul: 1.5 }, what: 'fish traps and nets fill half as fast again' },
  { skill: 'foraging', at: 3, id: 'mushroom_lore', name: 'Mushroom lore', fx: { knowPoison: 1 }, what: 'you leave the pale caps in the ground' },
  { skill: 'foraging', at: 6, id: 'full_basket', name: 'Full basket', fx: { forageRolls: 1 }, what: 'one more find a search' },
  { skill: 'foraging', at: 9, id: 'desert_pantry', name: 'Desert pantry', fx: { regrowMul: 2 }, what: 'picked ground grows back twice as fast' },
  { skill: 'trapping', at: 3, id: 'no_scent', name: 'No scent', fx: { snareRateMul: 1.4 }, what: 'snares fill 40% faster' },
  { skill: 'trapping', at: 6, id: 'trapline', name: 'Trapline', fx: { maxSnares: 2 }, what: 'two more snares out at once' },
  { skill: 'trapping', at: 9, id: 'field_dress', name: 'Field dressed', fx: { snareDressed: 1 }, what: 'a snared animal comes out with its sinew and bone too' },
  { skill: 'animal_handling', at: 3, id: 'fetch', name: 'Fetch', fx: { fetch: 1 }, what: 'any dog of yours brings back what you shoot (a bird dog does it untrained)' },
  { skill: 'animal_handling', at: 6, id: 'cold_trail', name: 'Cold trail', fx: { dogTrailAgeMul: 1.6 }, what: 'your dogs work a trail 60% older' },
  { skill: 'animal_handling', at: 9, id: 'calm_hand', name: 'Calm hand', fx: { territorialMul: 0.6 }, what: 'territorial animals warn and charge at 60% of the distance' },
  { skill: 'cooking', at: 3, id: 'smoke_salt', name: 'Smoke and salt', fx: { rackHoursMul: 0.6 }, what: 'a rack dries in 60% of the time' },
  { skill: 'cooking', at: 6, id: 'camp_cook', name: 'Camp cook', fx: { fireHoursMul: 1.5 }, what: 'a fire pit burns half as long again on its wood' },
  { skill: 'cooking', at: 9, id: 'iron_gut', name: 'Iron gut', fx: { rawSickMul: 0 }, what: 'raw meat never turns your stomach' },
  { skill: 'outdoorsman', at: 3, id: 'fire_starter', name: 'Fire starter', fx: { fireWood: -1 }, what: 'a fire pit takes one less deadwood' },
  { skill: 'outdoorsman', at: 6, id: 'weather_eye', name: 'Weather eye', fx: { catcherMul: 1.5 }, what: 'a rain catcher fills half as fast again' },
  { skill: 'outdoorsman', at: 9, id: 'pathfinder', name: 'Pathfinder', fx: { ownTrackMul: 0.4 }, what: 'your own sign lasts 40% as long: hard to follow' },
];
// The talent numbers with no talent (what consumers read by default).
export const FX0 = {
  countFeet: 0, readBlood: 0, bloodAgeMul: 1, trackAgeH: 0, meatBonus: 0, sinewBonus: 0, boneBonus: 0, preyNoticeMul: 1,
  rareMul: 1, doubleCatch: 0, trapFillMul: 1, knowPoison: 0, forageRolls: 0, regrowMul: 1, snareRateMul: 1, maxSnares: 0,
  snareDressed: 0, fetch: 0, dogTrailAgeMul: 1, territorialMul: 1, rackHoursMul: 1, fireHoursMul: 1, rawSickMul: 1,
  fireWood: 0, catcherMul: 1, ownTrackMul: 1,
};

// ---- 8. dogs: trait rows on the breeds (data/dogs.js BREEDS) ------------------------------------------------------------
//   tracker   works a scent trail (the SEEK whistle on a track, or `track dog=true`): nose x, how old a trail it follows
//   bird_dog  flushes ground birds as it ranges, and fetches what you shoot down
export const DOG_TRAITS = {
  tracker: { name: 'Tracker', noseMul: 1.6, trailAgeH: 3, trailSpeed: 1.1 },
  bird_dog: { name: 'Bird dog', flushR: 9, fetch: true },
};
export const DOG_TRAIL = { noseR: 9, trailAgeH: 1.2, speed: 6.5, endR: 3, quarryR: 8, give: 25 }; // any dog's defaults
for (const [breed, traits] of Object.entries({ bloodhound: ['tracker'], coyote_cross: ['tracker'], pointer: ['bird_dog'], lab: ['bird_dog'], shepherd: ['tracker'] })) if (BREEDS[breed]) BREEDS[breed].traits ??= traits;

// ---- 9. the items (added to data/items.js ITEMS at boot) ------------------------------------------------------------------
const FISH_ITEM = (name, kg, value, desc) => ({ name, kind: 'food', kg, bulk: kg, stack: 4, value, spoils: 8, raw: true, cooks: 'cooked_fish', use: { need: 'food', amount: 0.08 }, dog: { bond: 6, hp: 12 }, tags: ['fish'], desc });
export const OUTDOOR_ITEMS = {
  raw_fowl: { name: 'Raw fowl', kind: 'food', kg: 0.3, bulk: 0.3, stack: 8, value: 3, spoils: 9, raw: true, cooks: 'cooked_fowl', use: { need: 'food', amount: 0.07 }, dog: { bond: 6, hp: 12 }, desc: 'A plucked bird, small and blue-white. It wants a fire, soon.' },
  cooked_fowl: { name: 'Roast bird', kind: 'food', kg: 0.25, bulk: 0.25, stack: 8, value: 7, spoils: 36, use: { need: 'food', amount: 0.22, hp: 3 }, dog: { bond: 6, hp: 14 }, desc: 'A bird turned on a stick till the skin cracked. Mostly bones. Worth every one.' },
  cooked_fish: { name: 'Cooked fish', kind: 'food', kg: 0.3, bulk: 0.3, stack: 6, value: 8, spoils: 30, use: { need: 'food', amount: 0.24, hp: 3, water: 0.02 }, dog: { bond: 6, hp: 14 }, desc: 'White flesh off the bone, smoky from the fire.' },
  fish_catfish: FISH_ITEM('Catfish', 1.2, 6, 'A whiskered river cat, still slapping. Bottom feeder; tastes of the mud it came out of.'),
  fish_carp: FISH_ITEM('Carp', 1.6, 4, 'A big bronze carp. Bony, but there is a lot of it.'),
  fish_bass: FISH_ITEM('Bass', 0.9, 7, 'A bass with a mouth you could put a fist in. The best eating in the lake.'),
  fish_panfish: FISH_ITEM('Panfish', 0.25, 2, 'A palm-sized sunfish. Three make a meal; one makes bait.'),
  fish_trout: FISH_ITEM('Trout', 0.6, 10, 'A speckled trout out of cold running water. Rare down here now.'),
  fish_gar: FISH_ITEM('Gar', 2.2, 9, 'A gar: armour plates and a beak full of needles. The meat under the plates is good.'),
  fish_mullet: FISH_ITEM('Mullet', 0.8, 5, 'A silver mullet out of the salt. Florida eats these.'),
  crayfish: { ...FISH_ITEM('Crayfish', 0.05, 1, 'A mud bug. Boil a dozen and pick them. Or bait a hook.'), stack: 20 },
  old_boot: { name: 'Old boot', kind: 'part', kg: 0.7, bulk: 1, stack: 2, value: 0, desc: 'A boot full of river. The other one is out there somewhere, with whoever wore it.' },
  rusty_can: { name: 'Rusty can', kind: 'part', kg: 0.1, bulk: 0.3, stack: 6, value: 0, desc: 'A can rusted through. It held something once.' },
  tangled_line: { name: 'Tangled line', kind: 'part', kg: 0.02, bulk: 0.05, stack: 6, value: 1, desc: 'Somebody else\'s lost line, in a knot. Picked apart, it is line again.' },
  fishing_rod: { name: 'Fishing rod', kind: 'tool', kg: 0.6, bulk: 2, stack: 1, value: 22, use: { act: 'fish' }, desc: 'A cane rod with a wire guide and a hand-wound reel. Use it facing water (bait and a hook on you).' },
  fish_hook: { name: 'Fish hooks', kind: 'part', kg: 0.005, bulk: 0.01, stack: 30, value: 1, desc: 'Bent wire and bone hooks. You lose them on snags.' },
  grubs: { name: 'Grubs', kind: 'part', kg: 0.02, bulk: 0.03, stack: 20, value: 1, spoils: 30, desc: 'Fat white grubs dug from under deadwood. Fish love them. You could too, if it came to it.' },
  fish_trap: { name: 'Fish trap', kind: 'tool', kg: 1.4, bulk: 4, stack: 2, value: 18, use: { act: 'fishtrap' }, desc: 'A wicker funnel trap. Sink it in water and come back: it fills on its own.' },
  gill_net: { name: 'Gill net', kind: 'tool', kg: 1.8, bulk: 3, stack: 1, value: 40, use: { act: 'net' }, desc: 'A strung net with stone weights. Strung across water it catches more than a man with a rod.' },
  feathers: { name: 'Feathers', kind: 'part', kg: 0.01, bulk: 0.05, stack: 30, value: 1, desc: 'Flight feathers. Fletching, fly hooks, pillow stuffing, trade.' },
  sinew: { name: 'Sinew', kind: 'part', kg: 0.05, bulk: 0.05, stack: 20, value: 3, desc: 'Dried tendon. Splits into thread stronger than anything you can buy.' },
  mesquite_pods: { name: 'Mesquite pods', kind: 'food', kg: 0.1, bulk: 0.15, stack: 12, value: 1, spoils: 200, use: { need: 'food', amount: 0.05 }, desc: 'Sweet bean pods off a mesquite. Chewed or ground into flour.' },
  yucca_root: { name: 'Yucca root', kind: 'food', kg: 0.3, bulk: 0.3, stack: 6, value: 2, spoils: 100, use: { need: 'food', amount: 0.1, water: 0.03 }, desc: 'A starchy root dug out from under a yucca. Roast it.' },
  juniper_berries: { name: 'Juniper berries', kind: 'food', kg: 0.05, bulk: 0.06, stack: 20, value: 1, spoils: 120, use: { need: 'food', amount: 0.03 }, desc: 'Blue, bitter, resinous. A handful takes the edge off.' },
  wild_onion: { name: 'Wild onion', kind: 'food', kg: 0.05, bulk: 0.05, stack: 12, value: 1, spoils: 60, use: { need: 'food', amount: 0.04 }, desc: 'A little bulb that smells like it should. Makes anything taste like something.' },
  cattail_root: { name: 'Cattail root', kind: 'food', kg: 0.2, bulk: 0.2, stack: 8, value: 2, spoils: 48, use: { need: 'food', amount: 0.09, water: 0.03 }, desc: 'A pale starchy root pulled from the mud at the water\'s edge.' },
  swamp_cabbage: { name: 'Swamp cabbage', kind: 'food', kg: 0.5, bulk: 0.6, stack: 4, value: 4, spoils: 36, use: { need: 'food', amount: 0.14, water: 0.05 }, desc: 'The heart cut out of a palm. Crisp, a little sweet. The palm does not survive it.' },
  wild_berries: { name: 'Wild berries', kind: 'food', kg: 0.1, bulk: 0.12, stack: 12, value: 2, spoils: 24, use: { need: 'food', amount: 0.05, water: 0.03 }, desc: 'A handful of dark berries off a low bush. Sour, then sweet.' },
  desert_sage: { name: 'Desert sage', kind: 'med', kg: 0.03, bulk: 0.05, stack: 12, value: 3, use: { hp: 4, calm: true }, desc: 'Grey-green leaves that smell like rain. Chewed, they settle the nerves.' },
  creosote_leaves: { name: 'Creosote leaves', kind: 'med', kg: 0.03, bulk: 0.05, stack: 12, value: 3, use: { hp: 6, water: -0.02 }, desc: 'Sticky, stinking leaves. A poultice keeps a wound clean. The tea is foul.' },
  willow_bark: { name: 'Willow bark', kind: 'med', kg: 0.05, bulk: 0.05, stack: 12, value: 4, use: { hp: 8 }, desc: 'Inner bark off a river willow. Chew it for the pain.' },
  puffball: { name: 'Puffball', kind: 'food', kg: 0.15, bulk: 0.2, stack: 6, value: 2, spoils: 24, use: { need: 'food', amount: 0.07 }, desc: 'A round white mushroom, white all the way through. Safe. If it is white all the way through.' },
  pale_cap: { name: 'Pale cap', kind: 'food', kg: 0.08, bulk: 0.12, stack: 6, value: 0, spoils: 24, poison: true, use: { need: 'food', amount: 0.03 }, desc: 'A pale mushroom with a ring on its stem. It looks like supper.' },
  deadwood: { name: 'Deadwood', kind: 'part', kg: 1.1, bulk: 1.6, stack: 8, value: 1, desc: 'Dry dead branches. Three make a fire you can cook on.' },
  tarp: { name: 'Tarp', kind: 'tool', kg: 1.2, bulk: 2.5, stack: 2, value: 12, use: { act: 'catcher' }, desc: 'A sheet of tough plastic with grommets. Strung up, it catches rain.' },
};
for (const [id, r] of Object.entries(OUTDOOR_ITEMS)) if (!ITEMS[id]) ITEMS[id] = r;
// Where the kit turns up (data/items.js LOOT tables, when they exist).
for (const [table, row] of [['garage', ['fishing_rod', 1, 1, 1]], ['garage', ['tarp', 2, 1, 1]], ['bedroom', ['fish_hook', 2, 3, 8]], ['garage', ['fish_hook', 2, 3, 8]], ['garage', ['fish_trap', 1, 1, 1]], ['desert', ['fish_hook', 1, 2, 5]], ['bedroom', ['fishing_rod', 1, 1, 1]]])
  if (LOOT[table] && !LOOT[table].rows.some((r) => r[0] === row[0])) LOOT[table].rows.push(row);
