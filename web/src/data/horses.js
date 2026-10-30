// HORSES as rows (docs/design/WEB_HORSES.md; systems/horses.js). A horse is the fauna layer's four-legged body (data/fauna.js
// SPECIES, drawn by the dogs' quad rig) with a second record on top of it: who owns it, how it is fed, watered, shod and
// rested, what it carries. Fuel is scarce; a horse is the other kind of distance: quiet, off-road, through the forest and
// the dunes and the towns, but it eats, drinks, tires, goes lame, can be shot, stolen or left to starve.
// Adding a breed is a BREED row (it becomes a SPECIES row below); a herd or a stable is a HERD / STABLE row; a feed or a
// piece of tack is an ITEM row. validateHorses(rows) is the World Forge's check. Our own words; no purple (hue 270-320).
import { SPECIES } from './fauna.js';
import { ITEMS, LOOT } from './items.js';

// ---- gaits: what the rider asks for, what it costs ----------------------------------------------------------------------
//   key      the input that selects it (stick tilt on a pad): walk = Ctrl or a light tilt; trot = the default; canter = Sprint;
//            gallop = hold Dive (Space / A)
//   drain    stamina tank per second (x the breed's tire, x terrain, x load); a negative number refills
//   noise    metres a hoofbeat carries (ai.onNoise): a walk is nearly silent, a gallop on a road is heard from a block away
//   gait     the quad rig's gait index (0 walk 1 trot 2 lope) is picked from speed by fauna.animate; this is only the sound
export const GAITS = {
  stand: { id: 'stand', drain: -0.09, noise: 0 },
  walk: { id: 'walk', drain: -0.045, noise: 3 },
  trot: { id: 'trot', drain: 0.002, noise: 9 },
  canter: { id: 'canter', drain: 0.011, noise: 17 },
  gallop: { id: 'gallop', drain: 0.03, noise: 30 },
};
export const GAIT_ORDER = ['stand', 'walk', 'trot', 'canter', 'gallop'];

// ---- breeds -------------------------------------------------------------------------------------------------------------
//   speed    m/s at each gait (a walking person 4.6, a sprinting person 7.6, a car 20+)
//   tire     x the stamina drain (a mustang is tough, a draft horse is built to pull, not to run)
//   hp       it takes this much to drop it
//   carryKg  rider + pack over this slows it (CARE.overload) and tires it faster
//   bagL     the saddlebags' room in litres (bulk) when a pair is fitted
//   spook    0..1 how easily it takes fright (x (1 - bond) at a bang, a fire, the infected)
//   feedDay  the share of a full feed tank it burns in a game day; waterDay the same for water
//   price    cash at a stable (x condition)
//   body     the fauna row's body (scale, coat, legs...): coats picks one by the horse's seed
export const BREEDS = {
  mustang: {
    name: 'Mustang', speed: { walk: 1.9, trot: 4.9, canter: 8.2, gallop: 12.0 }, tire: 0.8, hp: 120, carryKg: 105, bagL: 36, spook: 0.65, feedDay: 0.34, waterDay: 0.6, price: 90,
    desc: 'Wild-born and wiry. Sees a rattlesnake before you do and will not forgive a heavy hand.',
    body: { scale: 1.85, coats: ['#9a6a3e', '#b98a56', '#7a4a2c', '#c8a878', '#8a8478'], mask: '#4a3424', legs: '#3a2a20', head: 'deer', tail: 0.9, tailR: 1.5, build: 'lean', legK: 1.42, lenK: 1.12, neckK: 2.7, neckR: 2.2, neckUp: 1.15, eyes: '#e0c070' },
  },
  quarter: {
    name: 'Quarter horse', speed: { walk: 2.0, trot: 5.2, canter: 8.8, gallop: 13.0 }, tire: 1.0, hp: 140, carryKg: 130, bagL: 48, spook: 0.35, feedDay: 0.4, waterDay: 0.65, price: 160,
    desc: 'A ranch horse, bred for a short sprint and a long working day. Steady under a gun if you have raised it.',
    body: { scale: 1.95, coats: ['#8a4a26', '#a8703a', '#6a3a22', '#c09660', '#4a3a30'], mask: '#3a281c', legs: '#2c2018', head: 'deer', tail: 0.9, tailR: 1.5, build: 'heavy', legK: 1.38, lenK: 1.1, wideK: 1.08, neckK: 2.8, neckR: 2.2, neckUp: 1.15, eyes: '#e0c070' },
  },
  draft: {
    name: 'Draft horse', speed: { walk: 1.7, trot: 4.1, canter: 6.4, gallop: 9.0 }, tire: 1.25, hp: 200, carryKg: 210, bagL: 90, spook: 0.15, feedDay: 0.55, waterDay: 0.8, price: 240,
    desc: 'Slow, huge and nearly unflappable. It will carry a house of your belongings and not much else.',
    body: { scale: 2.25, coats: ['#9a7a54', '#6a5848', '#b8aa96', '#7a5e40'], mask: '#3a2c22', legs: '#d8d0c0', head: 'deer', tail: 0.8, tailR: 1.5, build: 'heavy', legK: 1.3, lenK: 1.18, wideK: 1.2, deepK: 1.15, neckK: 2.5, neckR: 2.4, neckUp: 1.05, eyes: '#d0b070' },
  },
  pony: {
    name: 'Pony', speed: { walk: 1.7, trot: 4.3, canter: 7.0, gallop: 10.0 }, tire: 0.9, hp: 80, carryKg: 75, bagL: 26, spook: 0.45, feedDay: 0.26, waterDay: 0.45, price: 55,
    desc: 'Small, stubborn, cheap to keep. A child\'s horse, and a loner\'s: it can live on weeds.',
    body: { scale: 1.45, coats: ['#a88258', '#d8c8a8', '#6a5a46', '#8a7a64'], mask: '#5a4630', legs: '#4a3a2c', head: 'deer', tail: 0.9, tailR: 1.5, build: 'heavy', legK: 1.2, lenK: 1.05, wideK: 1.1, neckK: 2.3, neckR: 2.1, neckUp: 1.05, eyes: '#e0c070' },
  },
};

// ---- the care rules: every number in the formulas of docs/design/WEB_HORSES.md §4 --------------------------------------
export const CARE = {
  mountReach: 2.8,        // m: how close you must stand to swing up
  mountSecs: 0.9,         // the swing up (a TIMED ACTION when the lane has landed, else this fixed time)
  dismountSecs: 0.45,
  mountBond: 12,          // below this bond a horse that is not tied or haltered throws you off again (it was never yours)
  liveR: 260, dropR: 380, // a body within liveR of you, written back past dropR
  bondTiers: [['wild', 0], ['shy', 10], ['familiar', 30], ['trusted', 60], ['soulbound', 85]],
  tameBond: 25,           // oats and patience get a wild horse to here; then a lead rope halters it
  oatsBond: 8,            // per feeding at hand
  brushBond: 3, brushEveryHours: 12,
  rideBondPerKm: 1.2, // bond grows with the road you share
  neglectBondPerDay: 5,   // bond lost per game day hungry, thirsty or tied without water
  // feed and water: tanks 0..1; below `hungry`/`thirsty` it slows, at 0 it is starving / dying of thirst
  hungry: 0.3, thirsty: 0.3, starveHpPerHour: 4, dryHpPerHour: 9,
  hay: 0.5, oats: 0.3, oatsStamina: 0.25, drinkPerSec: 0.22, bucketWater: 0.4,
  graze: { perHour: 0.35, patchPerHour: 0.12, minPatch: 0.12, biomes: 'pFfaw' }, // grass patch thins like foraging (outdoors.patch)
  // stamina (a tank 0..1): empty = blown, it walks until it has caught its breath (`blownRecover`)
  blownRecover: 0.35, regenStand: 0.09,
  overload: { perKg: 0.006, tirePerKg: 0.01, max: 0.45 },   // speed lost / extra tire per kg over the breed's carryKg
  // terrain: speed multiplier (and drain multiplier) by the biome letter under the hooves; water by depth
  terrain: {
    d: { v: 0.82, tire: 1.25 }, m: { v: 0.78, tire: 1.35 }, s: { v: 0.72, tire: 1.35 }, w: { v: 0.9, tire: 1.1 },
    F: { v: 0.95, tire: 1.05 }, f: { v: 0.92, tire: 1.1 }, p: { v: 1, tire: 1 }, a: { v: 1, tire: 1 }, u: { v: 1, tire: 1 }, '.': { v: 0.85, tire: 1.2 },
  },
  road: { v: 1.05, tire: 0.9, noiseMul: 1.6 },   // on pavement: a little faster, a lot louder
  wade: { from: 0.35, v: 0.62, tire: 1.6 },      // a ford: knee-deep
  swim: { from: 1.15, v: 0.4, tire: 2.6 },       // out of its depth: it swims, the rider keeps their seat, the saddlebags get wet
  // injury and lameness
  lame: { gallopRough: 0.008, stumbleHp: 0.35, blownGallop: 0.05, hoofWear: 0.00035, hoofLame: 0.25, hoursToHeal: 10, bandageMul: 0.5, slowMul: 0.55 },
  // jumps: Space-tap over a low obstacle; the hop clears `h` m of fence at canter or better
  hop: { secs: 0.55, h: 1.15, minGait: 'trot', cost: 0.07, forward: 3.2, rise: 1.0 },
  // fright: a bang / fire / the infected near it. chance = spook x (1 - bond/100)^1.4 x (1 - calm) x loud; ridden: a bolt that
  // overrides the reins for `bolt` s; a rider who is not up to it (low bond) is thrown on a hard one
  fright: { gun: 55, ownGun: 0.45, fire: 7, infected: 11, blast: 90, bolt: [1.6, 3.2], throwAt: 0.55, throwDmg: [6, 16], cool: 6 },
  thrownKnock: 1.1,
  hitThrow: { dmg: 22, below: 0.3 },               // a hit this hard, or a horse this hurt, throws its rider
  rider: { aimTax: 1.9, aimTaxGallop: 3.0, meleeTax: 0.55, meleeOffside: true }, // spread x tax while mounted (combat.js reads g.player.mountTax)
  hitched: { stay: true },
  theftWitnessR: 40,
  noise: { hoofEvery: 0.45 },
};

// ---- wild herds, ranches, hitching posts -------------------------------------------------------------------------------
// A HERD row is placed ONCE, when the world first needs it: the horses it makes are records in the horse ledger and never
// regenerate (kill them, ride them off, and the herd is smaller for good). A STABLE row is a ranch: tack and feed for sale,
// a few horses with a price, an optional hand who sells and sees a theft, hitching rails, a corral of rail posts.
//   x, z, count   world metres; breeds are drawn from `breeds` by the horse's seed
export const HERDS = [
  { id: 'dry_wash', name: 'The Dry Wash herd', region: 'west', x: -5000, z: 0, count: 5, breeds: ['mustang'], roam: 120 },
  { id: 'east_plains', name: 'The east plains herd', region: 'west', x: 5000, z: -2500, count: 4, breeds: ['mustang', 'mustang', 'pony'], roam: 130 },
  { id: 'flatwoods_a', name: 'The flatwoods herd', region: 'florida', x: 178000, z: 22000, count: 5, breeds: ['mustang', 'quarter'], roam: 140 },
  { id: 'flatwoods_b', name: 'The scrub herd', region: 'florida', x: 206000, z: 14000, count: 4, breeds: ['mustang', 'pony'], roam: 140 },
];
export const STABLES = [
  {
    id: 'cottonwood', name: 'Cottonwood Stables', region: 'west', x: -2500, z: 0, hand: 'Walt Okafor', flag: 'US',
    horses: [{ breed: 'quarter', name: 'Biscuit' }, { breed: 'draft', name: 'Judge' }, { breed: 'pony', name: 'Pepper' }],
    rails: 3, stock: [['hay', 6], ['oats', 4], ['lead_rope', 2], ['saddle', 1], ['saddlebags', 1], ['horse_brush', 1]],
  },
  {
    id: 'pine_ridge', name: 'Pine Ridge Ranch', region: 'florida', x: 198000, z: 24000, hand: 'Inez Carrow', flag: 'US',
    horses: [{ breed: 'quarter', name: 'Cinder' }, { breed: 'quarter', name: 'Duchess' }, { breed: 'mustang', name: 'Saint' }],
    rails: 3, stock: [['hay', 8], ['oats', 5], ['lead_rope', 2], ['saddle', 2], ['saddlebags', 1], ['hoof_pick', 1]],
  },
];
// Hitching rails in towns: the town centre plus an offset (rows, so the forge can move them). Tying to a rail needs no rope.
export const HITCHES = [
  { id: 'rust_haven_gate', x: 14, z: -6 },
];

// ---- items (added to data/items.js ITEMS at boot; new keys only) -------------------------------------------------------
export const HORSE_ITEMS = {
  hay: { name: 'Hay', kind: 'feed', kg: 3.5, bulk: 6, stack: 2, value: 6, spoils: 400, use: { act: 'horsefeed' }, feed: 'hay', desc: 'A flake of dry grass hay, tied with twine. Horses will walk through fire for it. E at a horse feeds it.' },
  oats: { name: 'Oats', kind: 'feed', kg: 1.2, bulk: 2, stack: 4, value: 8, spoils: 600, use: { act: 'horsefeed' }, feed: 'oats', desc: 'A scoop of oats in a feed sack. A wild horse will come to a hand that holds it, and a tired one runs a little further on it.' },
  saddle: { name: 'Saddle', kind: 'tack', kg: 9, bulk: 9, stack: 1, value: 75, use: { act: 'horsetack' }, tack: 'saddle', desc: 'A worn stock saddle with a horn. A horse without one can be ridden bareback, badly: you cannot shoot from it, and bags need it.' },
  saddlebags: { name: 'Saddlebags', kind: 'tack', kg: 3, bulk: 4, stack: 1, value: 45, use: { act: 'horsetack' }, tack: 'bags', desc: 'Two leather bags that buckle over a saddle. They hold what a horse can carry; they do not hold much after a river.' },
  lead_rope: { name: 'Lead rope', kind: 'tool', kg: 0.6, bulk: 0.8, stack: 3, value: 10, use: { act: 'horsetack' }, tack: 'rope', desc: 'Braided cotton rope with a snap. Halters a horse that trusts you, and ties one where it stands.' },
  horse_brush: { name: 'Horse brush', kind: 'tool', kg: 0.3, bulk: 0.5, stack: 1, value: 14, use: { act: 'horsetack' }, tack: 'brush', desc: 'A stiff brush. Twice a day is for show; once is for trust.' },
  hoof_pick: { name: 'Hoof pick', kind: 'tool', kg: 0.2, bulk: 0.2, stack: 1, value: 9, use: { act: 'horsetack' }, tack: 'pick', desc: 'A hooked steel pick. Stones in a hoof are how a good horse goes lame in a good week.' },
};
for (const [id, r] of Object.entries(HORSE_ITEMS)) if (!ITEMS[id]) ITEMS[id] = r;
// Where tack and feed turn up: farm and garage shelves, a stable's loft.
for (const [table, row] of [['garage', ['lead_rope', 1, 1, 1]], ['garage', ['saddlebags', 1, 1, 1]], ['desert', ['hay', 1, 1, 1]], ['bedroom', ['horse_brush', 1, 1, 1]]]) if (LOOT[table] && !LOOT[table].rows.some((r) => r[0] === row[0])) LOOT[table].rows.push(row);

// ---- the breeds as fauna species (so the body, the butcher's yields, the wild herd's fright are the fauna layer's own) ----
//  A wild horse is `prey` (the herd bolts, a stallion leads); butchered it gives meat, a hide and bone like any large game.
for (const [id, B] of Object.entries(BREEDS)) {
  SPECIES[`horse_${id}`] = {
    name: B.name, form: 'quad', group: { kind: 'herd', size: [3, 6] }, active: 'diurnal', temper: 'prey', horse: id,
    senses: { sight: 52, smell: 50, hear: 80, night: 0.75 }, speed: { walk: B.speed.walk, run: B.speed.gallop }, turn: 4.2, hp: B.hp,
    fear: { fire: 10, beam: 14, gun: 90 }, alarm: 24, flee: 1, voice: 'snort',
    butcher: { time: 22, yields: [['raw_venison', 5, 8], ['horse_hide', 1, 1], ['bone', 2, 3]], hide: 'horse_hide' },
    body: { ...B.body },
  };
}
ITEMS.horse_hide ??= { name: 'Horse hide', kind: 'hide', kg: 4, bulk: 5, stack: 2, value: 30, desc: 'A big, thick hide. Boots and harness leather, for anyone who can stomach the work.' };

// ---- the check the World Forge runs on these rows ---------------------------------------------------------------------------
export function validateHorses(rows = { BREEDS, HERDS, STABLES, HITCHES, GAITS, CARE }) {
  const issues = [];
  const ok = (c, msg) => { if (!c) issues.push(msg); };
  const B = rows.BREEDS ?? {}, ids = new Set();
  for (const [id, b] of Object.entries(B)) {
    ok(b.name && b.body && b.speed, `breed ${id}: needs name, speed and body`);
    const s = b.speed ?? {};
    ok(s.walk < s.trot && s.trot < s.canter && s.canter < s.gallop, `breed ${id}: gait speeds must rise walk < trot < canter < gallop`);
    ok(b.hp > 0 && b.tire > 0 && b.carryKg > 0 && b.bagL >= 0, `breed ${id}: hp, tire, carryKg must be positive`);
    ok(b.spook >= 0 && b.spook <= 1, `breed ${id}: spook is 0..1`);
    ok(b.feedDay > 0 && b.feedDay < 3 && b.waterDay > 0 && b.waterDay < 3, `breed ${id}: feedDay and waterDay are tank shares per game day`);
    ok(b.price >= 0, `breed ${id}: price`);
    ok(!purpleHex(JSON.stringify(b.body ?? {})), `breed ${id}: body colours must not be purple (hue 270-320)`);
  }
  for (const h of rows.HERDS ?? []) {
    ok(!ids.has(h.id), `herd ${h.id}: duplicate id`); ids.add(h.id);
    ok(Number.isFinite(h.x) && Number.isFinite(h.z), `herd ${h.id}: needs x and z`);
    ok(h.count >= 1 && h.count <= 12, `herd ${h.id}: count 1..12`);
    for (const b of h.breeds ?? []) ok(B[b], `herd ${h.id}: unknown breed ${b}`);
  }
  for (const s of rows.STABLES ?? []) {
    ok(!ids.has(s.id), `stable ${s.id}: duplicate id`); ids.add(s.id);
    ok(Number.isFinite(s.x) && Number.isFinite(s.z), `stable ${s.id}: needs x and z`);
    for (const h of s.horses ?? []) ok(B[h.breed], `stable ${s.id}: unknown breed ${h.breed}`);
    for (const [it] of s.stock ?? []) ok(ITEMS[it], `stable ${s.id}: unknown stock item ${it}`);
  }
  for (const h of rows.HITCHES ?? []) ok(Number.isFinite(h.x) && Number.isFinite(h.z), `hitch ${h.id}: needs x and z`);
  const g = rows.GAITS ?? {};
  for (const k of GAIT_ORDER) ok(g[k], `gait ${k} missing`);
  return issues;
}
// A #rrggbb colour in the banned hue band (270-320 degrees: violet, indigo, lavender, magenta).
function purpleHex(json) {
  for (const m of json.matchAll(/#([0-9a-fA-F]{6})/g)) {
    const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 0.08) continue;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    if (h >= 270 && h <= 320) return true;
  }
  return false;
}
