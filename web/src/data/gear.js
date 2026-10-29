// What you wear (docs/design/WEB_INVENTORY.md §Gear): the original game's 19-slot paperdoll, carried over as rows.
// One engine, everything a row: a piece is a row in GEAR, worn one per slot, and each slot starts bare. Armor is a
// relative SOAK (0..1) over the body parts a piece covers, summed per part and capped (SOAK_CAP) so nobody is ever
// bulletproof. The clothing and accessory slots earn their keep through MODS, each read by one consumer:
//   soak    -> combat.js damage (the one damage choke point)      carry  -> skills.js carryKg
//   speed   -> skills.js speedMul                                  reload -> skills.js reloadMul
//   stealth -> ai.js scan (how close the hostile spot you)         repair -> inventory.js act('repair')
//   luck    -> inventory.js roll (extra rolls in a box you open)   unarmed -> none yet: this engine has no bare hands
// A gear row is also an item (registered into ITEMS below): it weighs, takes room, is found, bought and stolen like
// anything else, and F on the PACK screen wears it. Our own words; no brand names, no purple.

// The 19 slots in paperdoll read order: 6 armor, 7 clothing, 6 accessories.
export const SLOTS = [
  'head', 'neck', 'chest', 'arms', 'hands', 'legs',
  'coat', 'shirt', 'belt', 'feet', 'sash', 'face', 'back',
  'ear_l', 'ear_r', 'ring_l', 'ring_r', 'talisman', 'bracelet',
];
export const ARMOR_SLOTS = ['head', 'neck', 'chest', 'arms', 'hands', 'legs'];
// What the PACK screen calls each slot.
export const SLOT_LABEL = {
  head: 'HEAD', neck: 'NECK', chest: 'CHEST', arms: 'ARMS', hands: 'HANDS', legs: 'LEGS',
  coat: 'COAT', shirt: 'UNDER', belt: 'BELT', feet: 'FEET', sash: 'SASH', face: 'FACE', back: 'BACK',
  ear_l: 'EAR L', ear_r: 'EAR R', ring_l: 'RING L', ring_r: 'RING R', talisman: 'CHARM', bracelet: 'WRIST',
};
// The back slot is the pack you wear (data/items.js pack rows: satchel, backpack, frame ruck): one thing on your back.
export const BACK_IS_PACK = true;

// Body parts a hit can land on.
export const PARTS = ['head', 'torso', 'arms', 'legs'];
// Where a hit lands, by what made it. A cause not listed lands on the torso; one in NO_SOAK goes through armor
// untouched (fire, drowning, a bad tin). 'all' spreads the hit over every part (a blast): the mean soak, halved.
export const HIT_ODDS = {
  bullet: { head: 0.1, torso: 0.5, arms: 0.2, legs: 0.2 },
  bite: { head: 0.05, torso: 0.25, arms: 0.3, legs: 0.4 },   // the infected and dogs go for limbs
  bash: { head: 0.35, torso: 0.45, arms: 0.2, legs: 0 },     // a door to the face, a crash in a seat
  glass: { head: 0.3, torso: 0.3, arms: 0.4, legs: 0 },
  vehicle: { head: 0, torso: 0.4, arms: 0.1, legs: 0.5 },     // run down: the bumper takes the legs
  explosion: 'all',
};
export const NO_SOAK = ['fire', 'drown', 'sickness', 'fall', 'starve', 'thirst'];
export const SOAK_CAP = 0.75; // the most any part can be cut, however much you stack on it
export const BLAST_SOAK = 0.5; // armor against a blast: half its soak (the shock goes round it)
// Caps on the mods, summed over everything worn.
export const MOD_CAP = { carry: 24, speed: 0.15, reload: 0.3, stealth: 0.45, repair: 0.35, luck: 3, unarmed: 0.3 };

// THE CATALOG. name, slot, tier (1..5), soak + covers (armor), or a mod (carry kg, speed, reload, stealth, repair,
// luck rolls, unarmed). kg and litres from the tier unless given. value in scrip. look: what the player's body wears
// while it is on (systems/characters.js styles): a vest on the chest, a helmet on the head.
export const GEAR = {
  // ---- chest: the core ladder -----------------------------------------------------------------------------------
  leather_vest: { name: 'Leather vest', slot: 'chest', tier: 1, soak: 0.08, covers: ['torso'], look: { gear: 'vest', color: '#5a3f24' },
    desc: 'Two layers of cowhide stitched with wire. It turns a knife more often than a round.' },
  scrap_vest: { name: 'Scrap-plate vest', slot: 'chest', tier: 2, soak: 0.15, covers: ['torso'], look: { gear: 'vest', color: '#5d5548' },
    desc: 'Hubcaps and sheet steel riveted to a canvas vest. Loud, heavy, better than skin.' },
  soft_vest: { name: 'Soft armor vest', slot: 'chest', tier: 3, soak: 0.24, covers: ['torso'], look: { gear: 'vest', color: '#3d4232' },
    desc: 'Woven ballistic panels in a faded carrier. Stops a pistol round; argues with a rifle.' },
  service_armor: { name: 'Service body armor', slot: 'chest', tier: 4, soak: 0.34, covers: ['torso'], look: { gear: 'vest', color: '#4d5338' }, tags: ['military'],
    desc: 'Plate carrier with ceramic inserts, old government issue. The best thing a soldier ever left behind.' },
  composite_shell: { name: 'Composite shell', slot: 'chest', tier: 5, soak: 0.42, covers: ['torso'], look: { gear: 'vest', color: '#6b6448' }, tags: ['military'],
    desc: 'A moulded composite torso shell from a lab nobody comes back from. Light for what it stops.' },
  // ---- head ------------------------------------------------------------------------------------------------------
  leather_cap: { name: 'Leather cap', slot: 'head', tier: 1, soak: 0.05, covers: ['head'], look: { hat: 'cap', color: '#5a3f24' },
    desc: 'A flying cap gone soft with sweat. It keeps the sun off and a little else.' },
  riot_helmet: { name: 'Riot helmet', slot: 'head', tier: 3, soak: 0.16, covers: ['head'], look: { hat: 'helmet', color: '#2f3230' },
    desc: 'A police riot lid with the visor snapped off. Built for bottles, good for worse.' },
  combat_helmet: { name: 'Combat helmet', slot: 'head', tier: 4, soak: 0.24, covers: ['head'], look: { hat: 'helmet', color: '#4d5338' }, tags: ['military'],
    desc: 'A steel-and-resin helmet with the chinstrap mended in paracord.' },
  // ---- neck, arms, hands, legs -----------------------------------------------------------------------------------
  armored_collar: { name: 'Armored collar', slot: 'neck', tier: 2, soak: 0.06, covers: ['head', 'torso'],
    desc: 'A padded collar with a ballistic insert. Where the artery runs, a little helps a lot.' },
  arm_guards: { name: 'Arm guards', slot: 'arms', tier: 2, soak: 0.09, covers: ['arms'],
    desc: 'Hard plastic forearm guards off a riot kit, strapped over the sleeves.' },
  work_gloves: { name: 'Combat gloves', slot: 'hands', tier: 2, soak: 0.03, covers: ['arms'],
    desc: 'Knuckle-padded gloves. Glass, wire and teeth go through less of you.' },
  padded_leggings: { name: 'Padded leggings', slot: 'legs', tier: 2, soak: 0.1, covers: ['legs'],
    desc: 'Quilted trousers with shin and knee pads sewn in. The dead bite low.' },
  plate_leggings: { name: 'Plate leggings', slot: 'legs', tier: 4, soak: 0.22, covers: ['legs'],
    desc: 'Thigh and shin plates on straps. You walk like a door, and nothing gets your legs.' },
  // ---- under the shirt: a thin plate the same soak law reads ------------------------------------------------------
  flex_base: { name: 'Flex armor base', slot: 'shirt', tier: 2, soak: 0.06, covers: ['head', 'torso', 'arms', 'legs'],
    desc: 'A stretch base layer with cut-resistant weave. Worn under everything.' },
  trauma_insert: { name: 'Trauma plate insert', slot: 'shirt', tier: 3, soak: 0.12, covers: ['torso'],
    desc: 'A steel plate in an undershirt pocket over the heart. It has a dent in it already.' },
  // ---- clothing: mods, not soak -------------------------------------------------------------------------------------
  leather_duster: { name: 'Leather duster', slot: 'coat', tier: 2, stealth: 0.05, look: { gear: 'poncho', color: '#4a3424' },
    desc: 'A long riding coat the colour of the road. Breaks your outline at a distance.' },
  brush_poncho: { name: 'Brush poncho', slot: 'coat', tier: 3, stealth: 0.12, look: { gear: 'poncho', color: '#5b5a42' },
    desc: 'Burlap strips and dead brush sewn onto netting. Lie still in it and you are scrub.' },
  combat_boots: { name: 'Combat boots', slot: 'feet', tier: 2, speed: 0.04,
    desc: 'Broken-in boots that fit. Out here that is worth more than a gun.' },
  trail_boots: { name: 'Trail runners', slot: 'feet', tier: 3, speed: 0.08,
    desc: 'Light boots with a lugged sole. Every step a little longer, a little quicker.' },
  utility_belt: { name: 'Utility belt', slot: 'belt', tier: 2, carry: 6,
    desc: 'Pouches and loops on webbing. Weight on the hips is weight off the shoulders.' },
  rig_belt: { name: 'Rig belt', slot: 'belt', tier: 3, carry: 10,
    desc: 'A padded war belt with a harness. Carries like a second pack.' },
  ammo_bandolier: { name: 'Ammo bandolier', slot: 'sash', tier: 2, reload: 0.08, look: { gear: 'bandolier', color: '#5a3f24' },
    desc: 'Loops for rounds across the chest. The next reload is already in your hand.' },
  double_bandolier: { name: 'Double bandolier', slot: 'sash', tier: 3, reload: 0.14, look: { gear: 'bandolier', color: '#3a3128' },
    desc: 'Two belts crossed over the chest. You can reload in your sleep.' },
  dust_mask: { name: 'Dust mask', slot: 'face', tier: 2,
    desc: 'A rubber mask with two filters. Seals the face slot; the filters do nothing for the air yet.' },
  // ---- accessories ----------------------------------------------------------------------------------------------------
  brass_knuckles: { name: 'Brass knuckles', slot: 'ring_l', tier: 2, unarmed: 0.12,
    desc: 'Four rings of cast brass. Teeth for your fists, when fists are all you have.' },
  knuckle_ring: { name: 'Knuckle ring', slot: 'ring_r', tier: 3, unarmed: 0.08,
    desc: 'A heavy steel ring with a ridge on it. It does not come off easily, and neither do teeth it meets.' },
  mechanic_wraps: { name: 'Mechanic wraps', slot: 'bracelet', tier: 2, repair: 0.1,
    desc: 'Leather wrist wraps with a feeler gauge and a pick tucked in. Your patches hold better.' },
  data_cuff: { name: 'Data cuff', slot: 'bracelet', tier: 4, repair: 0.18,
    desc: 'A wrist computer from before the split, still loaded with service manuals. It knows every engine.' },
  rabbit_foot: { name: 'Lucky foot', slot: 'talisman', tier: 1, luck: 1,
    desc: 'A dried rabbit\'s foot on a cord. Your eye catches what others miss. Probably.' },
  scav_compass: { name: 'Scavver\'s compass', slot: 'talisman', tier: 3, luck: 2,
    desc: 'A brass compass with a needle that never points north. It points at things worth taking.' },
};

// What a piece weighs, takes and is worth when the row does not say: armor by its tier, the rest light.
// A chest plate is the heavy one; a helmet, leg plates and the small pieces less (the original's 0.8 + 0.7 x tier, for the
// chest only).
export function gearKg(r) {
  const t = r.tier, kg = r.slot === 'chest' ? 0.8 + 0.7 * t : r.slot === 'head' ? 0.4 + 0.3 * t : r.slot === 'legs' ? 0.6 + 0.5 * t : r.soak ? 0.3 + 0.2 * t : 0.4 + 0.1 * t;
  return r.kg ?? Math.round(kg * 100) / 100;
}
export function gearBulk(r) { return r.bulk ?? (r.slot === 'chest' ? 6 : r.slot === 'head' ? 4 : r.slot === 'legs' ? 3 : r.slot === 'coat' ? 3 : r.soak ? 1.2 : 0.5); }
export function gearValue(r) { return r.value ?? (r.soak ? 40 : 18) * Math.max(1, r.tier); }

// Where gear is found (merged into data/items.js LOOT): new tables from the original's loot rows (a dug-up cache, a
// rare cache, an armory, a gun safe, a police locker) and a few rows added to tables that already exist.
export const GEAR_LOOT = {
  buried_cache: { rolls: [2, 4], none: 1, rows: [['scrap', 9, 2, 5], ['dried_meat', 6, 1, 2], ['first_aid', 2, 1, 1], ['scrap_vest', 2, 1, 1], ['backpack', 2, 1, 1], ['leather_duster', 2, 1, 1], ['knuckle_ring', 1, 1, 1], ['utility_belt', 2, 1, 1], ['ammo_bandolier', 2, 1, 1], ['mechanic_wraps', 2, 1, 1], ['rabbit_foot', 1, 1, 1], ['gold_ring', 2, 1, 2], ['ammo_pistol', 3, 6, 18]] },
  cache_rare: { rolls: [1, 3], none: 1, rows: [['machete', 3, 1, 1], ['first_aid', 4, 1, 1], ['gun_pistol', 2, 1, 1], ['gun_auto', 2, 1, 1], ['ammo_pistol', 4, 6, 18], ['soft_vest', 3, 1, 1], ['combat_helmet', 2, 1, 1], ['brush_poncho', 1, 1, 1], ['ruck', 1, 1, 1], ['brass_knuckles', 2, 1, 1]] },
  armor_cache: { rolls: [2, 3], none: 0, rows: [['soft_vest', 5, 1, 1], ['service_armor', 2, 1, 1], ['combat_helmet', 4, 1, 1], ['plate_leggings', 3, 1, 1], ['arm_guards', 4, 1, 1], ['gun_pump', 3, 1, 1], ['ammo_shells', 5, 8, 20], ['ammo_slug', 3, 4, 10]] },
  gun_safe: { rolls: [1, 3], none: 1, rows: [['gun_pistol', 5, 1, 1], ['gun_pump', 3, 1, 1], ['ammo_pistol', 7, 5, 40], ['ammo_shells', 4, 2, 16], ['ammo_birdshot', 3, 4, 16], ['ammo_slug', 2, 2, 8], ['cleaning_kit', 3, 1, 1]] },
  police_locker: { rolls: [1, 3], none: 2, rows: [['ammo_smg', 6, 6, 24], ['gun_auto', 2, 1, 1], ['bandage', 4, 1, 2], ['riot_helmet', 3, 1, 1], ['soft_vest', 2, 1, 1], ['arm_guards', 2, 1, 1]] },
};
// Rows added to the tables that already exist: issue armor in the armory and on soldiers, junk armor on raiders.
export const GEAR_LOOT_ADD = {
  // (Shop tables - a trader's counter - are left as they were: what Ike, Kenji, Reyes and Mags stock is data/trade.js's.)
  military: [['service_armor', 1, 1, 1], ['combat_helmet', 2, 1, 1], ['soft_vest', 2, 1, 1], ['rig_belt', 1, 1, 1], ['double_bandolier', 1, 1, 1], ['dust_mask', 1, 1, 1]],
  soldier: [['soft_vest', 1, 1, 1], ['combat_helmet', 1, 1, 1]],
  raider: [['leather_vest', 1, 1, 1], ['leather_cap', 1, 1, 1], ['brass_knuckles', 1, 1, 1]],
  bedroom: [['leather_duster', 1, 1, 1], ['combat_boots', 1, 1, 1], ['rabbit_foot', 1, 1, 1]],
};
