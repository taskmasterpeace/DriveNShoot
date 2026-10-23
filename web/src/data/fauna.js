// L5 LIFE: regional animals as rows (docs/design/WEB_FAUNA.md, the plan's layer L5 in WEB_WORLD_EDITOR_PLAN.md §3.1).
// A species is a row (how it lives, senses, moves, fights, what it gives when butchered, how it is drawn); a HABITAT row
// says where it lives (region + biome letters, or hot ground) and how many per km²; the director in systems/fauna.js
// spawns by the formula
//   per chunk = perKm2 x chunk km² x biome share x ACTIVE[pattern][phase] x (1 - presence)       (FAUNA_RULES caps it)
// Adding an animal is adding a SPECIES row and a HABITAT row. Florida's biomes (swamp s, pine flatwoods F, scrub f,
// groves a, prairie p, dead suburbs u, wetland w, coast .) drop in as rows: the region key is whatever the region layer
// reports at a point ('west' when there is none). Our own words; no purple (hue 270-320); real animals are ours to use.
import { ITEMS, LOOT } from './items.js';
import { REGIONS, FAUNA as REGION_FAUNA } from './regions.js';

// ---- when an animal is about ----------------------------------------------------------------------------------------
// The day in four phases by game hour, and each activity pattern's factor in each phase (the formula's time term).
export const PHASES = [
  { id: 'night', from: 20, to: 5 },
  { id: 'dawn', from: 5, to: 8 },
  { id: 'day', from: 8, to: 17 },
  { id: 'dusk', from: 17, to: 20 },
];
export const ACTIVE = {
  diurnal: { night: 0.1, dawn: 0.8, day: 1, dusk: 0.7 },
  nocturnal: { night: 1.3, dawn: 0.6, day: 0.15, dusk: 0.9 },
  crepuscular: { night: 0.5, dawn: 1.5, day: 0.35, dusk: 1.5 },
  any: { night: 1, dawn: 1, day: 1, dusk: 1 },
};

// ---- the species --------------------------------------------------------------------------------------------------
//   form     how it is drawn: quad (the dogs' four-legged body, systems/dogs.js DogRenderer), snake, bird, gator,
//            crawler (six legs and glass), stilt (four long legs and a lamp), swarm (a cloud of sparks)
//   group    herd | pack | solo | flock | sounder, size [min, max]
//   active   diurnal | nocturnal | crepuscular | any (ACTIVE)
//   temper   prey (flees), predator (stalks the weak), territorial (warns, then charges), ambush (waits, warns, strikes),
//            scavenger (bodies first, the dying next)
//   senses   sight / smell / hear (m); night: the share of sight it keeps in the dark (1 = sees as well as by day)
//   speed    walk / run (m/s); turn: how fast it can swing round (rad/s)
//   hp       what it takes to drop it
//   attack   { kind: bite | charge | strike | lunge | pounce | sting, dmg, every (s), reach (m), kd: chance to knock a
//            person down, venom: a SICKNESS row (data/survival.js), hot: rad added to your dose }
//   fear     fire: keeps this far past a fire's edge; beam: backs out of a lit beam this close (m); gun: a shot this near
//            sends it off. flee: the share of its hp at which it gives up and runs
//   alarm    prey: how near a threat may come before it bolts (m); territory: territorial: how near before it warns
//   butcher  time: seconds of work with a blade (dexterity shortens it); yields [item, min, max]; hide: the item a
//            failed skill check ruins (a torn hide is worth a third)
//   body     how it looks: scale and the dog body's proportions (legK, lenK, wideK, deepK, neckK, neckUp), head kind,
//            colours; snakes/birds/gators their own sizes. eyes: night eyeshine colour (in a beam)
export const SPECIES = {
  // ---- the West (the I-10 corridor: desert d, scrub f, mountains m, plains p, dry riverbed w, farmland a, urban u) ----
  coyote: {
    name: 'Coyote', form: 'quad', group: { kind: 'pack', size: [2, 4] }, active: 'nocturnal', temper: 'predator',
    senses: { sight: 28, smell: 45, hear: 70, night: 0.95 }, speed: { walk: 1.5, run: 10.5 }, turn: 7, hp: 35,
    attack: { kind: 'bite', dmg: 7, every: 1.0, reach: 1.5, kd: 0.05 }, fear: { fire: 8, beam: 16, gun: 45 }, flee: 0.5,
    stalk: 13, courage: 2, voice: 'yip',
    butcher: { time: 7, yields: [['raw_game', 1, 2], ['coyote_pelt', 1, 1], ['bone', 1, 1]], hide: 'coyote_pelt' },
    body: { scale: 1.02, coat: '#b09a74', mask: '#9a8462', legs: '#c2aa82', saddle: '#7a6648', head: 'up', tail: 1.1, tailR: 1.6, build: 'lean', legK: 1.06, eyes: '#d8e070' },
  },
  javelina: {
    name: 'Javelina', form: 'quad', group: { kind: 'herd', size: [4, 7] }, active: 'crepuscular', temper: 'territorial',
    senses: { sight: 14, smell: 40, hear: 40, night: 0.6 }, speed: { walk: 1.1, run: 7.5 }, turn: 5, hp: 40,
    attack: { kind: 'charge', dmg: 9, every: 1.4, reach: 1.2, kd: 0.25 }, fear: { fire: 6, beam: 6, gun: 30 }, flee: 0.35,
    territory: 7, voice: 'grunt',
    butcher: { time: 9, yields: [['raw_pork', 1, 2], ['hog_hide', 1, 1], ['bone', 1, 1]], hide: 'hog_hide' },
    body: { scale: 0.68, coat: '#5a524a', mask: '#4a4440', legs: '#2e2a26', collar: '#c8c0b0', head: 'hog', tail: 0.15, build: 'heavy', legK: 0.78, lenK: 0.92, wideK: 1.15, deepK: 1.25, neckK: 0.6, neckR: 1.4 },
  },
  mule_deer: {
    name: 'Mule deer', form: 'quad', group: { kind: 'herd', size: [3, 6] }, active: 'crepuscular', temper: 'prey',
    senses: { sight: 46, smell: 50, hear: 60, night: 0.7 }, speed: { walk: 1.3, run: 12.5 }, turn: 6, hp: 55,
    fear: { fire: 9, beam: 18, gun: 80 }, alarm: 26, flee: 1, voice: 'snort', bucks: 0.35,
    butcher: { time: 14, yields: [['raw_venison', 3, 5], ['deer_hide', 1, 1], ['bone', 1, 2]], hide: 'deer_hide' },
    body: { scale: 1.32, coat: '#8a7a64', mask: '#6a5a48', legs: '#9a8a72', rump: '#e6e0d0', head: 'deer', tail: 0.3, build: 'lean', legK: 1.32, lenK: 1.08, neckK: 1.9, neckUp: 1.15 },
  },
  jackrabbit: {
    name: 'Jackrabbit', form: 'quad', group: { kind: 'solo', size: [1, 2] }, active: 'crepuscular', temper: 'prey',
    senses: { sight: 30, smell: 20, hear: 50, night: 0.8 }, speed: { walk: 1.0, run: 13 }, turn: 12, hp: 8,
    fear: { fire: 6, beam: 10, gun: 60 }, alarm: 14, flee: 1, zigzag: true,
    butcher: { time: 3, yields: [['raw_game', 1, 1], ['rabbit_pelt', 1, 1]], hide: 'rabbit_pelt' },
    body: { scale: 0.36, coat: '#a89878', mask: '#8a7a60', legs: '#b0a080', head: 'hare', tail: 0.25, build: 'lean', legK: 1.15, lenK: 0.95 },
  },
  rattlesnake: {
    name: 'Rattlesnake', form: 'snake', group: { kind: 'solo', size: [1, 1] }, active: 'crepuscular', temper: 'ambush',
    senses: { sight: 8, smell: 10, hear: 12, night: 1 }, speed: { walk: 0.35, run: 0.9 }, turn: 3, hp: 12,
    attack: { kind: 'strike', dmg: 12, every: 1.6, reach: 1.6, venom: 'poisoning' }, fear: { fire: 3, beam: 0, gun: 0 }, flee: 0.4,
    warn: { r: 4.2, hold: 1.0, sound: 'rattle' }, voice: 'rattle',
    butcher: { time: 3, yields: [['raw_game', 1, 1], ['snakeskin', 1, 1], ['rattle', 1, 1]], hide: 'snakeskin' },
    body: { len: 1.25, girth: 0.075, coat: '#b09a70', dark: '#5e4a32', belly: '#d2c4a0', tip: '#e2d8bc', head: '#8a7452' },
  },
  vulture: {
    name: 'Turkey vulture', form: 'bird', group: { kind: 'flock', size: [2, 5] }, active: 'diurnal', temper: 'scavenger',
    senses: { sight: 600, smell: 400, hear: 20, night: 0.2 }, speed: { walk: 0.8, run: 9 }, turn: 1.4, hp: 10,
    fear: { fire: 4, beam: 0, gun: 25 }, alarm: 14, flee: 1, voice: 'hiss',
    butcher: null, // nobody eats a vulture twice
    body: { span: 1.75, len: 0.62, coat: '#2e2620', wing: '#3e342a', tipc: '#6e665a', head: '#b04a34', soar: true, alt: [7, 11], circle: [6, 11] },
  },
  // ---- Florida (rows for the start region's biomes) ---------------------------------------------------------------
  // The alligator is Florida's row (data/regions.js FAUNA.gator: hp, bite, lunge, notice, size, colours), taken over
  // here (gatorFromRegion below): these are only the numbers that row does not carry.
  gator: {
    name: 'Alligator', form: 'gator', group: { kind: 'solo', size: [1, 1] }, active: 'any', temper: 'ambush',
    senses: { sight: 14, smell: 30, hear: 30, night: 1 }, speed: { walk: 2.4, run: 9.5 }, turn: 2.2, hp: 160,
    attack: { kind: 'lunge', dmg: 26, every: 1.6, reach: 4.5, kd: 0.6, roll: 2.2, rollDps: 9, drag: 1.1 }, fear: { fire: 5, beam: 0, gun: 12 }, flee: 0.3,
    leash: 12, voice: 'hiss',
    butcher: { time: 18, yields: [['raw_gator', 3, 5], ['gator_hide', 1, 1], ['bone', 1, 1]], hide: 'gator_hide' },
    body: { len: [2.6, 3.8], coat: ['#3a4a2a', '#2f3d24', '#46502e', '#38402a'], belly: '#b8b08a', ridge: '#24301c' },
  },
  hog: {
    name: 'Wild hog', form: 'quad', group: { kind: 'sounder', size: [3, 7] }, active: 'crepuscular', temper: 'territorial',
    senses: { sight: 16, smell: 55, hear: 45, night: 0.7 }, speed: { walk: 1.3, run: 9.5 }, turn: 4.5, hp: 70,
    attack: { kind: 'charge', dmg: 14, every: 1.5, reach: 1.3, kd: 0.4 }, fear: { fire: 6, beam: 5, gun: 20 }, flee: 0.3,
    territory: 9, voice: 'grunt',
    butcher: { time: 12, yields: [['raw_pork', 2, 4], ['hog_hide', 1, 1], ['bone', 1, 1]], hide: 'hog_hide' },
    body: { scale: 1.0, coat: '#4a3e34', mask: '#3a302a', legs: '#2a2420', head: 'hog', tail: 0.25, build: 'heavy', legK: 0.72, lenK: 1.1, wideK: 1.2, deepK: 1.32, neckK: 0.55, neckR: 1.5, coats: ['#4a3e34', '#6a5848', '#2e2824', '#7a6450'] },
  },
  whitetail: {
    name: 'White-tailed deer', form: 'quad', group: { kind: 'herd', size: [2, 5] }, active: 'crepuscular', temper: 'prey',
    senses: { sight: 44, smell: 55, hear: 60, night: 0.7 }, speed: { walk: 1.3, run: 13 }, turn: 6.5, hp: 50,
    fear: { fire: 9, beam: 18, gun: 80 }, alarm: 28, flee: 1, voice: 'snort', bucks: 0.35, flag: true,
    butcher: { time: 13, yields: [['raw_venison', 3, 4], ['deer_hide', 1, 1], ['bone', 1, 2]], hide: 'deer_hide' },
    body: { scale: 1.2, coat: '#8a6a48', mask: '#6a4e34', legs: '#9a7a58', rump: '#c8b8a0', head: 'deer', tail: 0.38, build: 'lean', legK: 1.3, lenK: 1.05, neckK: 1.8, neckUp: 1.1, flagC: '#f2eee4' },
  },
  panther: {
    name: 'Florida panther', form: 'quad', group: { kind: 'solo', size: [1, 1] }, active: 'nocturnal', temper: 'predator',
    senses: { sight: 40, smell: 40, hear: 70, night: 1 }, speed: { walk: 1.3, run: 14 }, turn: 6, hp: 90,
    attack: { kind: 'pounce', dmg: 22, every: 1.6, reach: 1.8, kd: 0.5 }, fear: { fire: 9, beam: 10, gun: 30 }, flee: 0.45,
    stalk: 16, courage: 1, voice: 'growl',
    butcher: { time: 15, yields: [['raw_game', 2, 3], ['panther_pelt', 1, 1], ['bone', 1, 1]], hide: 'panther_pelt' },
    body: { scale: 1.12, coat: '#b08a5a', mask: '#9a7a50', legs: '#a07e52', head: 'cat', tail: 1.9, build: 'lean', legK: 0.95, lenK: 1.45, eyes: '#c8f090' },
  },
  cottonmouth: {
    name: 'Cottonmouth', form: 'snake', group: { kind: 'solo', size: [1, 1] }, active: 'any', temper: 'ambush',
    senses: { sight: 8, smell: 10, hear: 12, night: 1 }, speed: { walk: 0.35, run: 1.0 }, turn: 3, hp: 10,
    attack: { kind: 'strike', dmg: 10, every: 1.5, reach: 1.4, venom: 'poisoning' }, fear: { fire: 3, beam: 0, gun: 0 }, flee: 0.4,
    warn: { r: 3.0, hold: 0.8, sound: 'gape' }, voice: 'hiss',
    butcher: { time: 3, yields: [['raw_game', 1, 1], ['snakeskin', 1, 1]], hide: 'snakeskin' },
    body: { len: 1.05, girth: 0.08, coat: '#3e3c2c', dark: '#24241a', belly: '#8a8466', tip: '#3e3c2c', head: '#2e2c20', mouth: '#f0ece0' },
  },
  heron: {
    name: 'Wading birds', form: 'bird', group: { kind: 'flock', size: [3, 7] }, active: 'diurnal', temper: 'prey',
    senses: { sight: 40, smell: 5, hear: 30, night: 0.5 }, speed: { walk: 0.5, run: 8 }, turn: 2, hp: 6,
    fear: { fire: 6, beam: 10, gun: 90 }, alarm: 18, flee: 1, voice: 'squawk',
    butcher: { time: 2, yields: [['raw_game', 1, 1]] },
    body: { span: 1.5, len: 0.6, coat: '#ece8dc', wing: '#e2ddd0', tipc: '#d8d2c4', head: '#ece8dc', beak: '#d8a83a', legs: '#2a2620', wader: true, coats: ['#ece8dc', '#ece8dc', '#7a8a8e'] },
  },
  // ---- hot ground (systems/hotground.js zones and the BRUSH's rad strokes: any region) ----------------------------
  // The Glassling and the Lantern are hotground.js's own creatures (data/hotground.js HOT_FAUNA: characters there, for
  // its AI and the one damage law); these rows are only their bodies, drawn here instead of a stand-in person.
  glassling: { name: 'Glassling', form: 'crawler', body: { len: 0.95, coat: '#cfd2b8', dark: '#6a6c52', glass: '#a8bc7a', shine: '#e2ecb0', eyes: '#d9e66a' } },
  lantern: { name: 'the Lantern', form: 'stilt', body: { h: 3.4, coat: '#e2dfc8', dark: '#a8a48c', glow: '#d9e66a' } },
  // Ours: a two-headed scavenger that runs the hot ground in twos and threes. Hairless, mottled, never alone.
  twinback: {
    name: 'Twinback', form: 'quad', group: { kind: 'pack', size: [2, 3] }, active: 'any', temper: 'scavenger',
    senses: { sight: 22, smell: 60, hear: 50, night: 1 }, speed: { walk: 1.4, run: 9 }, turn: 7, hp: 45,
    attack: { kind: 'bite', dmg: 9, every: 1.1, reach: 1.5, kd: 0.1, hot: 6 }, fear: { fire: 7, beam: 9, gun: 35 }, flee: 0.4,
    stalk: 10, courage: 2, voice: 'yip', hot: true,
    butcher: { time: 8, yields: [['hot_meat', 1, 2], ['bone', 1, 2]] },
    body: { scale: 0.95, coat: '#9c9282', mask: '#8a7c6c', legs: '#7e7466', saddle: '#5e564a', head: 'twin', tail: 0.35, build: 'lean', legK: 1.12, wideK: 1.12, eyes: '#e8f070' },
  },
  // Ours: a swarm of glowing midges that boils up off the seeps at night and goes for anything warm. Fire turns it.
  cinders: {
    name: 'Cinder swarm', form: 'swarm', group: { kind: 'solo', size: [1, 1] }, active: 'nocturnal', temper: 'swarm',
    senses: { sight: 22, smell: 22, hear: 0, night: 1 }, speed: { walk: 0.6, run: 2.6 }, turn: 3, hp: 30,
    attack: { kind: 'sting', dmg: 3, every: 0.5, reach: 2.4, hot: 0.8 }, fear: { fire: 7, beam: 0, gun: 0 }, flee: 0, leash: 40,
    hot: true, onlyBy: ['fire', 'explosion'],
    butcher: null,
    body: { n: 36, r: 1.6, glow: '#ffb648', core: '#ffd27a' },
  },
};

// The fauna region of a state (WorldIndex.stateAt) when no region layer answers: Florida's rows apply in Florida.
export const REGION_OF_STATE = { FLORIDA: 'florida' };

// ---- where they live ------------------------------------------------------------------------------------------------
//   region   the region key at the chunk (systems/fauna.js regionAt: 'west' unless the region layer says otherwise)
//   biomes   usmap legend letters the row lives in (the chunk's biome share is the fraction of its sample points in them)
//   hot      true: lives on hot ground (a hot ground zone or a BRUSH rad stroke) in any region, instead of by biome
//   near     'water': only within reach of a bank (its share is the fraction of sample points at a water's edge)
//   perKm2   the base density (animals a square kilometre at factor 1)
export const HABITATS = [
  { region: 'west', biomes: 'dfpmwa', species: 'jackrabbit', perKm2: 14 },
  { region: 'west', biomes: 'dfpmw', species: 'coyote', perKm2: 4.5 },
  { region: 'west', biomes: 'dfw', species: 'javelina', perKm2: 4 },
  { region: 'west', biomes: 'fmpwF', species: 'mule_deer', perKm2: 6 },
  { region: 'west', biomes: 'd', species: 'mule_deer', perKm2: 1.6 },
  { region: 'west', biomes: 'dfmw', species: 'rattlesnake', perKm2: 6 },
  { region: 'west', biomes: 'dfpmwau', species: 'vulture', perKm2: 0.5 },
  { region: 'florida', biomes: 'sFfpau', species: 'hog', perKm2: 6 },
  { region: 'florida', biomes: 'Ffpa', species: 'whitetail', perKm2: 8 },
  { region: 'florida', biomes: 'sF', species: 'panther', perKm2: 0.25 },
  { region: 'florida', biomes: 'sw', species: 'cottonmouth', perKm2: 10, near: 'water' },
  { region: 'florida', biomes: 'sw.', species: 'heron', perKm2: 12, near: 'water' },
  { region: 'florida', biomes: 'sFfpau', species: 'vulture', perKm2: 0.8 },
  { region: 'florida', biomes: 'Ffp', species: 'coyote', perKm2: 1.5 },
  { hot: true, species: 'twinback', perKm2: 22 },
  { hot: true, species: 'cinders', perKm2: 14 },
];

// ---- human presence (the formula's last term) --------------------------------------------------------------------------
// 0 = wild, 1 = nothing wild comes here. The largest of: a town (full inside r, fading to nothing over fade), the island's
// ruins, a road (I-10's centreline), and the noise heat (gunfire and blasts heat a coarse grid that cools on the game
// clock: heat 1 = presence `heatK`).
export const PRESENCE = {
  rustHaven: { x: 0, z: 0, r: 110, fade: 170 },          // the walled town at the island's middle
  ruins: { r: 260, v: 0.45 },                             // Phoenix's ruins round it: people, dogs, the infected
  town: { r: 260, fade: 340, v: 0.9 },                   // a built town on the corridor (WorldIndex towns)
  road: { d: 30, fade: 90, v: 0.3 },                     // the interstate: traffic and the noise of it
  heat: { cell: 64, perShot: 0.9, minR: 30, halfLife: 2.5, heatK: 0.5, max: 4 }, // halfLife in game hours
};

// ---- the director's budget and the brains' numbers ------------------------------------------------------------------------
export const FAUNA_RULES = {
  chunk: 256,            // a cell is a streamed chunk (data/streaming.js STREAM.chunk)
  samples: 3,            // biome sample grid per side (3 x 3 points a chunk)
  liveR: 300,            // a chunk whose centre is this near you is alive (its animals have bodies)
  dropR: 420,            // ...and is written back to records past this
  chunkBudget: 9,        // at most this many animals a chunk (the pool budget)
  maxLive: 44,           // bodies in the world at once (the renderers' budget: quads 40, snakes 12, birds 40, gators 10)
  maxQuads: 40, maxSnakes: 12, maxBirds: 40, maxGators: 10, maxCrawl: 16, maxSwarms: 4,
  recordHours: 30,       // a chunk's roll is good for this many game hours away (then it is rolled again)
  carcassHours: 20,      // a carcass lies this long (game hours), then it is bones and gone
  tick: 0.5,             // the director's beat (s)
  senseEvery: 0.25,      // each animal looks round this often (staggered)
  viewPad: 12,           // never spawn within the camera's view plus this
  drawR: 140,            // drawn within this of the camera
  carHitK: 2.4,          // damage per m/s of a car that hits an animal
  carDent: 0.55,         // crash strength per m/s x the animal's size it puts into the car (vehicledamage.hit)
  carDodge: 6,           // an animal that sees a car coming steps aside inside this... unless it is fleeing in a panic
  infectedBite: 9, infectedEvery: 1.3,
  scavenge: [8, 14],     // seconds at a body, a bite at a time
  // Vultures (the sky's clue): a body draws them within `arrive` game minutes (the clock runs 2 game minutes a real
  // second: 30..75 is 15..38 s); they circle for `circle` game minutes, then come down to it if nobody is within `land` m
  // (and go back up when somebody comes within `flush`). freshMin: a body dead longer than this (real s) draws none.
  vulture: { arrive: [30, 75], circle: [60, 180], land: 26, flush: 15, max: 4, perBody: [2, 4], bodyR: 520, freshMin: 180 },
  // Butchering (E at a carcass with a blade): dexterity shortens it and saves the hide; a hide's skill check:
  // chance = base + perDex x dexterity level (x the blade's own number).
  butcher: { reach: 2.4, base: 0.55, perDex: 0.05, timeDex: 0.04, xp: 3, moveCancel: 1.4, blades: { knife: 1, machete: 0.9, fire_axe: 1.25, can_opener: 2.2 } },
  // Cooking: raw meat in your pack over a fire (a flare, a molotov's fire, a burning car) or a camped RV's stove.
  cook: { reach: 3.2, rvReach: 7, rawSick: 0.35, hotDose: 40 },
  // Night: who you meet in the dark. Eyeshine shows on an animal in your beam or a car's headlights, or this near you.
  eyes: { near: 12 },
};

// ---- what an animal gives (added to data/items.js ITEMS at boot, like the paperdoll's and survival's rows) ------------
// raw: eaten raw it may turn your stomach (FAUNA_RULES.cook.rawSick); cooks: what a fire makes of it; hot: rad when eaten.
export const FAUNA_ITEMS = {
  raw_venison: { name: 'Raw venison', kind: 'food', kg: 0.5, bulk: 0.5, stack: 6, value: 6, spoils: 12, raw: true, cooks: 'cooked_venison', use: { need: 'food', amount: 0.12 }, dog: { bond: 9, hp: 20 },
    desc: 'A dark red cut off a deer, still warm when you wrapped it. Cook it before the heat gets to it.' },
  cooked_venison: { name: 'Cooked venison', kind: 'food', kg: 0.42, bulk: 0.45, stack: 6, value: 12, spoils: 48, use: { need: 'food', amount: 0.36, hp: 5 }, dog: { bond: 9, hp: 24 },
    desc: 'Venison charred over a fire. Lean, smoky, the best thing you have eaten this week.' },
  raw_pork: { name: 'Raw pork', kind: 'food', kg: 0.55, bulk: 0.5, stack: 6, value: 5, spoils: 10, raw: true, cooks: 'cooked_pork', use: { need: 'food', amount: 0.1 }, dog: { bond: 8, hp: 18 },
    desc: 'A slab off a wild hog. Pig meat eaten raw is a gamble nobody sensible takes.' },
  cooked_pork: { name: 'Roast pork', kind: 'food', kg: 0.45, bulk: 0.45, stack: 6, value: 11, spoils: 40, use: { need: 'food', amount: 0.38, hp: 5 }, dog: { bond: 8, hp: 22 },
    desc: 'Hog roasted till the fat ran. Greasy, filling, gone too soon.' },
  raw_game: { name: 'Raw game', kind: 'food', kg: 0.3, bulk: 0.3, stack: 8, value: 3, spoils: 10, raw: true, cooks: 'cooked_game', use: { need: 'food', amount: 0.07 }, dog: { bond: 6, hp: 12 },
    desc: 'A little stringy meat off something small and quick. Cook it.' },
  cooked_game: { name: 'Cooked game', kind: 'food', kg: 0.25, bulk: 0.25, stack: 8, value: 6, spoils: 40, use: { need: 'food', amount: 0.2, hp: 2 }, dog: { bond: 6, hp: 14 },
    desc: 'Small game cooked on a stick. Tough. Food.' },
  raw_gator: { name: 'Gator tail', kind: 'food', kg: 0.6, bulk: 0.55, stack: 6, value: 8, spoils: 10, raw: true, cooks: 'cooked_gator', use: { need: 'food', amount: 0.1 }, dog: { bond: 8, hp: 18 },
    desc: 'Pale meat cut from an alligator\'s tail. They say it tastes like chicken; nobody remembers chicken.' },
  cooked_gator: { name: 'Fried gator', kind: 'food', kg: 0.5, bulk: 0.5, stack: 6, value: 14, spoils: 40, use: { need: 'food', amount: 0.36, hp: 6 }, dog: { bond: 8, hp: 22 },
    desc: 'Gator tail cooked in its own fat in a can lid. Swamp people trade for this.' },
  hot_meat: { name: 'Hot meat', kind: 'food', kg: 0.35, bulk: 0.35, stack: 6, value: 0, spoils: 8, raw: true, hot: true, use: { need: 'food', amount: 0.1 },
    desc: 'Off a twinback. It is warm, and it should not be, and the counter clicks when you hold it close.' },
  // Hides and the rest: traders buy them (data/trade.js: Mags deals in hides).
  deer_hide: { name: 'Deer hide', kind: 'hide', kg: 2.2, bulk: 3, stack: 3, value: 24, desc: 'A green deer hide, rolled hair side in. A tanner pays for it; so does anyone who sews.' },
  hog_hide: { name: 'Hog hide', kind: 'hide', kg: 2.6, bulk: 3, stack: 3, value: 14, desc: 'A bristly pig hide. Thick enough for boot soles and gun slings.' },
  coyote_pelt: { name: 'Coyote pelt', kind: 'hide', kg: 1.1, bulk: 2, stack: 3, value: 16, desc: 'A grey-gold pelt with the tail still on. Warm, and it smells of the night it came from.' },
  rabbit_pelt: { name: 'Rabbit pelt', kind: 'hide', kg: 0.15, bulk: 0.3, stack: 8, value: 4, desc: 'A thin rabbit skin. Ten make a hat.' },
  gator_hide: { name: 'Gator hide', kind: 'hide', kg: 4.5, bulk: 5, stack: 2, value: 65, desc: 'An alligator\'s back, plates and all. Worth more than the gator was willing to give up.' },
  panther_pelt: { name: 'Panther pelt', kind: 'hide', kg: 3.2, bulk: 4, stack: 2, value: 110, desc: 'A tawny cat skin, long as a man. There are not many left to take.' },
  snakeskin: { name: 'Snakeskin', kind: 'hide', kg: 0.1, bulk: 0.15, stack: 8, value: 12, desc: 'A patterned snakeskin. Hatbands, knife grips, good luck.' },
  torn_hide: { name: 'Torn hide', kind: 'hide', kg: 1.2, bulk: 1.5, stack: 6, value: 5, desc: 'A hide cut through in the skinning. Scraps for patches.' },
  rattle: { name: 'Rattle', kind: 'valuable', kg: 0.01, bulk: 0.01, stack: 10, value: 8, tags: ['keepsake'], desc: 'The buttons off a rattlesnake\'s tail. Shake it and every dog in earshot looks up.' },
  bone: { name: 'Bone', kind: 'part', kg: 0.3, bulk: 0.3, stack: 10, value: 1, desc: 'Clean bone. Needles, hooks, handles, broth.' },
  glass_plate: { name: 'Glass plate', kind: 'valuable', kg: 0.4, bulk: 0.3, stack: 6, value: 30, desc: 'A pale green plate of fused glass off a Glassling\'s back. It hums a little in the dark.' },
  // Set a snare where game runs (E on it from the PACK screen): a Greyborn-style wire noose (data/greyborn.js TRAPS snare)
  // that catches what walks into it.
  snare_wire: { name: 'Snare wire', kind: 'tool', kg: 0.1, bulk: 0.1, stack: 4, value: 6, use: { act: 'snare' }, desc: 'A coil of brass wire bent into nooses. Set one on a game trail and come back tomorrow.' },
};
for (const [id, r] of Object.entries(FAUNA_ITEMS)) if (!ITEMS[id]) ITEMS[id] = r;
// Where snare wire turns up.
for (const [table, row] of [['garage', ['snare_wire', 2, 1, 2]], ['desert', ['snare_wire', 1, 1, 1]], ['bedroom', ['snare_wire', 1, 1, 1]]]) if (LOOT[table] && !LOOT[table].rows.some((r) => r[0] === row[0])) LOOT[table].rows.push(row);

// Florida's own rows (another agent's data/regions.js `life.fauna`: { kind, biomes, perKm2, night, near, max }) become
// HABITAT rows: their `kind` names a SPECIES row here.
export function habitatsFromRegion(regionId, life) {
  const out = [];
  for (const L of life?.fauna ?? []) if (SPECIES[L.kind]) out.push({ region: regionId, biomes: Array.isArray(L.biomes) ? L.biomes.join('') : L.biomes, species: L.kind, perKm2: L.perKm2, near: L.near ? 'water' : undefined });
  return out;
}

// A region's FAUNA row (data/regions.js: { hp, bite, land, swim, lunge, lungeRange, notice, leash, biteEvery, size,
// colors, belly }) onto a SPECIES row: the region's numbers win, ours fill the rest.
export function speciesFromRegionRow(S, F) {
  if (!S || !F) return S;
  S.name = F.name ?? S.name; S.hp = F.hp ?? S.hp;
  S.senses = { ...S.senses, sight: F.notice ?? S.senses.sight };
  S.speed = { walk: F.land ?? S.speed.walk, run: F.lunge ?? S.speed.run, swim: F.swim };
  S.attack = { ...S.attack, dmg: F.bite ?? S.attack.dmg, every: F.biteEvery ?? S.attack.every, reach: F.lungeRange ?? S.attack.reach, drag: F.drag ?? S.attack.drag };
  S.body = { ...S.body, len: F.size ?? S.body.len, coat: F.colors ?? S.body.coat, belly: F.belly ?? S.body.belly };
  return S;
}

// Florida (data/regions.js) taken over: its alligator row becomes the gator species, its `life.fauna` rows become
// habitat rows (so the region's density, biomes and water are the region's own). systems/regions.js keeps its own
// lair-spawned gators only while this layer is off.
for (const [kind, F] of Object.entries(REGION_FAUNA ?? {})) speciesFromRegionRow(SPECIES[kind], F);
for (const [id, R] of Object.entries(REGIONS ?? {})) if (R.life?.fauna) HABITATS.push(...habitatsFromRegion(id, R.life));
