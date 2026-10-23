// Dogs as rows (docs/design/WEB_DOGS.md), carried over from the original game (game/proto3d/dog.gd): four TYPES, each
// mechanically its own, breeds as multipliers under a type, the BOND from stray to soulbound, the whistle's verbs.
// The law of dogs: a dog always knows what is behind you. Adding a breed, a pack or a cache is adding a row.

// ---- the four types -----------------------------------------------------------------------------------------------
//   followDist  heel distance (m) at bond 0 (a tighter bond walks closer: followMul)
//   speed       top run (m/s); trot and walk are fractions of it (GAIT)
//   threatR     how far it notices a threat (m); rearMul: how much further behind you (your blind side)
//   noseR       how far it smells a cache or an unsearched box (0 = it does not go looking)
//   calm        how much a cuddle dog steadies you (reserved: no stress system in this engine yet)
//   scale       body size; obey: seconds before it acts on a whistle (less as the bond grows)
//   bite        damage a bite does (0 = it will not bite: a lap dog barks); biteKd: chance a bite puts them down
//   hp          what it takes to put it down
export const DOG_TYPES = {
  security: { name: 'Guard', followDist: 3.2, speed: 8.0, threatR: 26, rearMul: 1.5, noseR: 0, calm: 0, scale: 1.15, obey: 0.5, bite: 16, biteKd: 0.45, hp: 70 },
  hunter: { name: 'Hunter', followDist: 4.5, speed: 8.5, threatR: 14, rearMul: 1.2, noseR: 24, calm: 0, scale: 1.0, obey: 0.6, bite: 9, biteKd: 0.2, hp: 50 },
  companion: { name: 'Companion', followDist: 2.6, speed: 8.0, threatR: 16, rearMul: 1.2, noseR: 10, calm: 2, scale: 1.0, obey: 0, bite: 12, biteKd: 0.25, hp: 55 },
  cuddle: { name: 'Lap dog', followDist: 1.8, speed: 7.0, threatR: 8, rearMul: 1.1, noseR: 0, calm: 9, scale: 0.62, obey: 0.8, bite: 0, biteKd: 0, hp: 30 },
};

// ---- breeds: multipliers over the type's numbers, a coat, a build -------------------------------------------------
//   coat body colour, mask head colour, legs leg colour; tail length (0..1), ears up (prick) or down (drop);
//   build: lean | heavy | long (stretches the body); saddle: a darker back (a shepherd's black saddle), drawn over the coat
export const BREEDS = {
  shepherd: { name: 'Shepherd', type: 'security', mods: {}, coat: '#7a5a34', mask: '#2b2118', legs: '#8a6a40', tail: 1, ears: 'up', saddle: '#1e1914', build: 'lean' },
  rottweiler: { name: 'Rottweiler', type: 'security', mods: { threatR: 0.8, speed: 1.05 }, coat: '#221c18', mask: '#2a211a', legs: '#7a4a28', tail: 0.25, ears: 'down', build: 'heavy' },
  mastiff: { name: 'Mastiff', type: 'security', mods: { threatR: 1.15, speed: 0.82, scale: 1.12 }, coat: '#9a7a52', mask: '#2a2420', legs: '#9a7a52', tail: 0.8, ears: 'down', build: 'heavy' },
  bloodhound: { name: 'Bloodhound', type: 'hunter', mods: { noseR: 1.4 }, coat: '#8a5430', mask: '#6a3a20', legs: '#8a5430', tail: 0.9, ears: 'down', saddle: '#3a2216', build: 'long' },
  pointer: { name: 'Pointer', type: 'hunter', mods: { speed: 1.1 }, coat: '#d8ccb4', mask: '#6a4428', legs: '#d8ccb4', tail: 0.8, ears: 'down', saddle: '#7a4e2c', build: 'lean' },
  coyote_cross: { name: 'Coyote-cross', type: 'hunter', mods: { noseR: 1.15, threatR: 1.1 }, coat: '#a08a64', mask: '#7a6448', legs: '#b8a07a', tail: 0.9, ears: 'up', saddle: '#6a5a40', build: 'lean' },
  lab: { name: 'Lab', type: 'companion', mods: { speed: 1.05 }, coat: '#c9a465', mask: '#c9a465', legs: '#c9a465', tail: 0.9, ears: 'down', build: 'heavy' },
  collie: { name: 'Border collie', type: 'companion', mods: { obey: 0 }, coat: '#1e1a18', mask: '#e8e0d0', legs: '#e8e0d0', tail: 1, ears: 'up', build: 'lean' },
  mutt: { name: 'Mutt', type: 'companion', mods: {}, coat: '#8a6c48', mask: '#5a4430', legs: '#c8b490', tail: 0.8, ears: 'up', saddle: '#5a4430', build: 'lean' },
  pocket: { name: 'Pocket', type: 'cuddle', mods: { calm: 1.25, speed: 1.1 }, coat: '#d2b88a', mask: '#d2b88a', legs: '#d2b88a', tail: 0.6, ears: 'up', build: 'lean' },
  wheezer: { name: 'Wheezer', type: 'cuddle', mods: { calm: 1.1, speed: 0.8 }, coat: '#b8946a', mask: '#2a2420', legs: '#b8946a', tail: 0.2, ears: 'down', build: 'heavy' },
  ratter: { name: 'Ratter', type: 'cuddle', mods: { threatR: 1.2 }, coat: '#e2dccc', mask: '#7a5a3a', legs: '#e2dccc', tail: 0.4, ears: 'up', build: 'lean' },
};

export const DOG_NAMES = ['Rex', 'Lucky', 'Brutus', 'Scout', 'Biscuit', 'Duke', 'Rosie', 'Pepper', 'Ranger', 'Blue', 'Sadie', 'Bandit', 'Dusty', 'Rusty', 'Tank', 'Copper', 'Ziggy', 'Hank', 'Lola', 'Boone', 'Maggie', 'Sarge', 'Pistol', 'Juniper', 'Cholla', 'Mesa', 'Tumbleweed', 'Ash', 'Grit', 'Nugget'];

// ---- the bond ------------------------------------------------------------------------------------------------------
// 0..100. A stray becomes yours at COMPANION. Feeding is how it starts (a food row's `dog` amount, data/items.js).
export const BOND_TIERS = ['STRAY', 'COMPANION', 'PARTNER', 'SOULBOUND'];
export const BOND_AT = [0, 15, 45, 80];
export const BOND = {
  adoptAt: 15,         // fed up to here, a stray is yours: it follows
  heelPerMin: 0.6,     // time at heel near you (within 8 m), per game minute
  saved: 15,           // carried back from the brink with a bandage
  dug: 2,              // it found you something
  shotMul: 0.6,        // bond lost per point of damage you do it
  hungryDays: 2,       // days without food before it says so (once a day, when you're near)
  hungryLoss: 3,       // bond lost each day past that
  followMul: 0.12,     // heel distance shrinks by this per tier
  obeyMul: 0.12,       // obedience delay shrinks by this per tier
};

// ---- the whistle (C on foot): one button, five calls ------------------------------------------------------------------
// taps within tapWindow s of each other; a hold of hold s is SIC. Four sharp is SHIELD: only a soulbound dog answers.
export const WHISTLE = { tapWindow: 0.38, hold: 0.5, calls: { 1: 'heel', 2: 'guard', 3: 'seek', 4: 'shield' }, sicR: 45, seekR: 45 };

// ---- how dogs move ------------------------------------------------------------------------------------------------------
// GAIT: walk (lateral four-beat), trot (diagonal pairs), lope (rotary gallop with a moment of flight), blended by speed.
// offsets: phase of each foot in its cycle [left fore, right fore, left hind, right hind]; amp: leg swing (rad);
// lift: knee bend in the swing; cadence: strides per metre at that gait (the faster gait takes longer strides).
export const GAIT = {
  walk: { upTo: 1.9, offsets: [0.25, 0.75, 0, 0.5], amp: 0.35, lift: 0.55, perM: 0.95, bob: 0.015, pitch: 0 },
  trot: { upTo: 5.2, offsets: [0, 0.5, 0.5, 0], amp: 0.5, lift: 0.7, perM: 0.6, bob: 0.03, pitch: 0 },
  lope: { upTo: 99, offsets: [0.55, 0.65, 0, 0.1], amp: 0.75, lift: 0.9, perM: 0.38, bob: 0.06, pitch: 0.12 },
};

export const DOG_RULES = {
  maxDogs: 32,            // the renderer's budget
  simR: 170,              // strays farther than this from you hold still (cheap); yours always run
  drawR: 130,             // drawn within this of the camera
  radius: 0.32,           // body circle for walls
  jumpMax: 1.3,           // the tallest thing a dog clears in a bound (m): a low wall, a crate, a car bonnet
  leapV: 5.8,             // launch speed up (m/s); with g = 13: about 1.3 m of air
  gravity: 13,
  jumpCd: 0.9,
  pounceR: [1.6, 3.8],    // the pounce window (m from the target)
  pounceV: 4.4,           // pounce launch up (m/s)
  pounceCd: 2.2,
  pounceKdMul: 1.6,       // a pounce that lands is more likely to put them down than a bite
  biteR: 1.5, biteCd: 0.8,
  bleedOut: 45,           // seconds a downed dog of yours has
  stabilizeHp: 30,
  scentR: 34,             // strays smell bodies, food and piles this far
  scentCd: 140,           // seconds before a smell it has been to draws it again
  scavenge: [6, 11],      // seconds at a body
  markEvery: [22, 50],    // seconds between marking (a stray on its rounds)
  wanderR: 26,            // a pack roams this far round its ground
  packGap: [2.2, 5.5],    // packmates keep this far from the leader
  wary: 6.5,              // a stray keeps this far from you until it trusts you
  begR: 9,                // a stray comes to beg within this, if you carry what it wants and stand still
  gunR: 32,               // gunfire within this makes a dog flinch (yours) or cower (a stray)
  cower: [2, 3.2],        // seconds of cowering, then it runs
  fleeT: 5,
  fireR: 4.5,             // keeps this far past a fire's edge; a burning car is a fire of 6 m
  burnDps: 7,
  beamR: 20, beamDot: 0.55, beamNight: 0.3, // a lit car's beam, at night: strays run out of it, yours shy from it
  carDodge: 7,            // sidesteps a car coming at it inside this
  carHitK: 2.6,           // damage per m/s of a car that hits a dog
  infectedBite: 9, infectedEvery: 1.3, // the infected bite a dog that gets close
  digTime: 2.2,
  barkEvery: 0.8, growlR: 10,
  catchUp: 95,            // yours finds you again (off-screen) when it falls this far behind
  rideR: 14,              // jumps in with you when you take a car, from this close
  scanEvery: 0.35,
};

// ---- the world's dogs ---------------------------------------------------------------------------------------------------
// Stray packs on the island (Phoenix's ruins and the flats past them), kept clear of Rust Haven's streets and the test
// ground in the Glass Flats. breeds: who is in it. A lone stray waits by the town's south road for someone with food.
export const STRAY_PACKS = [
  { id: 'eastruins', x: 168, z: 128, breeds: ['shepherd', 'mutt', 'coyote_cross', 'mutt'] },
  { id: 'westyards', x: -176, z: -96, breeds: ['rottweiler', 'mutt', 'lab'] },
  { id: 'southflats', x: -96, z: 216, breeds: ['coyote_cross', 'coyote_cross', 'pointer'] },
  { id: 'northwash', x: 104, z: -232, breeds: ['mastiff', 'mutt', 'ratter'] },
];
export const LONE_STRAYS = [
  { name: 'Lucky', breed: 'mutt', x: 18, z: 118 },
  { name: 'Biscuit', breed: 'pocket', x: -132, z: 40 },
];

// Buried caches: packed earth a dog's nose finds and its paws open (the original's buried_cache), rolled from LOOT.
export const CACHES = [
  { id: 'c1', x: 152, z: 148, table: 'buried_cache' },
  { id: 'c2', x: -200, z: -118, table: 'buried_cache' },
  { id: 'c3', x: -78, z: 236, table: 'cache_rare' },
  { id: 'c4', x: 122, z: -250, table: 'buried_cache' },
  { id: 'c5', x: 236, z: 196, table: 'armor_cache' },
  { id: 'c6', x: -248, z: 132, table: 'buried_cache' },
];
