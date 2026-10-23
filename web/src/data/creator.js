// THE CREATOR's rulebook (docs/design/WEB_CREATOR.md): how a new survivor is made, as rows. Robert's call: point-buy,
// the structure of the origin creator in his superhero game (D:/lsw src/data/creator.js) carried into this world.
// What came over: one pool of points, attributes on a named rank ladder with escalating cumulative costs, catalogs of
// rows that each cost points (good traits) or pay them back (flaws: LSW's "gifts" turned inside out), a tally that
// breaks the spend down, a validate() save gate whose words are the screen's errors, and a build step that turns the
// picks into the plain things the engine already runs on. What did not: superpowers (there are none out here), the
// budget tiers (one pool for everyone on a shard), threat ratings and power slots.
//
// Every number a pick moves is read by exactly ONE consumer the engine already has:
//   strength, endurance, dexterity -> systems/skills.js starting levels (carry, sprint drain, spread + reload)
//   endurance, thick skin, thin blood -> the player's max hp
//   carryKg, spreadMul, reloadMul, sprintDrainMul, speedMul, nightSpreadMul -> skills.js recompute()
//   seenMul -> gear.seenMul() -> ai.js scan (how close a hostile must be to spot you)
//   repair -> gear.repairMul() -> inventory.js repair      luck -> gear.luckRolls() -> inventory.js first search
//   priceMul -> trade.js counter prices                    drain.water/food/rest, wakeMul -> survival.js
//   standing, memory, renown (a background's "knowing") -> the society and roles at BEGIN, then theirs to keep
// Our own words; no names from anybody's books; no purple.

// ---- the pool --------------------------------------------------------------------------------------------------------
export const CREATOR = {
  pool: 30,          // points everyone starts with (one pool: a shard is fair)
  scripPerPoint: 4,  // a point left unspent at BEGIN is scrip in your pocket
  cashBase: 60,      // scrip everyone walks out with before the unspent points
  rankMin: 1, rankMax: 6, rankStart: 2, // attributes at creation; skills still grow to 10 by doing
  maxGood: 4,        // good traits
  minFlaws: 1, maxFlaws: 3, refundCap: 12, // everybody has a flaw; the refund is capped
  nameMin: 2, nameMax: 20,
  // A character made on the shard (LOG IN, NEW CHARACTER: a name and a flag) opens THE CREATOR when it first enters
  // the world (net/shard.js). Off by default: the shard's two-client proof (tools/shard-test.mjs) walks a fresh
  // character straight into the world, and the shard lane turns this on with that proof updated. ?creator=1 on the
  // page turns it on for one session.
  shardNew: false,
};

// Where a new survivor wakes. place null: wherever the engine starts now (the Florida start is its own lane; that
// agent sets place {x, z} and state 'FL' here, or calls g.creator.onStart). state: a survivor from the start's own
// state is a local there (localStanding with localFaction).
export const START = { place: null, state: 'AZ', localFaction: 'rusthaven', localStanding: 5 };
// By the region the game started in (systems/regions.js `start`: ?start=florida|phoenix, players default to Florida): a
// Floridian starting at Meridian is a local of Meridian's people, an Arizonan at Rust Haven of Rust Haven's.
export const START_BY = { phoenix: START, florida: { place: null, state: 'FL', localFaction: 'meridian', localStanding: 5 } };

// ---- attributes: the rank ladder -------------------------------------------------------------------------------------
// Cumulative cost to HOLD a rank (index = rank). Rank 1 is free, each rung dearer than the last (LSW's ATTR_COST shape).
export const ATTR_COST = [0, 0, 2, 5, 9, 14, 20];
export const RANKS = [null, 'SOFT', 'ORDINARY', 'CAPABLE', 'HARD', 'RARE', 'ONE IN A THOUSAND'];
// skill: the systems/skills.js skill this attribute starts (level = rank - 1, plus the background's)
export const ATTRS = [
  { k: 'strength', label: 'STRENGTH', short: 'STR', skill: 'strength', does: 'what you carry before it slows you' },
  { k: 'endurance', label: 'ENDURANCE', short: 'END', skill: 'endurance', does: 'stamina that lasts, and the blood you can lose' },
  { k: 'dexterity', label: 'DEXTERITY', short: 'DEX', skill: 'dexterity', does: 'tighter shots, faster reloads' },
  { k: 'perception', label: 'PERCEPTION', short: 'PER', does: 'you wake to them coming; you find what others miss' },
  { k: 'wits', label: 'WITS', short: 'WIT', does: 'a fair price at the counter, and a fix that holds' },
  { k: 'nerve', label: 'NERVE', short: 'NRV', does: 'your aim holds in the dark' },
];
// What a rank is worth (rank r; the formulas in WEB_CREATOR.md §4).
export const PER_RANK = {
  hpPerEndurance: 4,      // max hp = 100 + 4 (END - 2)
  wakePerPerception: 0.1, // sleep wake radius x (0.8 + 0.1 PER)
  luckAt: [5, 6],         // PER 5: one more roll the first time you search a box; PER 6: two
  pricePerWits: 0.02,     // counter prices x (1 - 0.02 (WIT - 2))
  repairPerWits: 0.05,    // repairs + 0.05 (WIT - 2)
  nightPerNerve: 0.05,    // aim spread at night x (1 + 0.05 (2 - NRV))
};

// ---- backgrounds: what you did before, or since ----------------------------------------------------------------------
// skills: levels on top of the attributes. kit: what you walk out with (pack, items [id, n], guns [weapon, rounds,
// condition], gear you wear, throwables, cash on top of the base). knowing: who already knows you - standing with a
// faction, a named person who remembers you (memory kind from data/society.js MEMORY_KINDS), renown toward a role
// (data/roles.js; set under its first tier: they have heard of you, nobody calls you that yet), and the line the KIT
// screen reads out. Every background carries a gun: the engine has no empty hands yet (the controller's holster is).
export const BACKGROUNDS = [
  { id: 'trucker', label: 'LONG-HAUL DRIVER', blurb: 'Eighteen wheels and every exit between the coasts. You slept in the cab more nights than in a bed.',
    skills: { endurance: 1 }, kit: { pack: 'backpack', items: [['canteen', 1], ['jerky', 4], ['road_atlas', 1], ['wrench', 1], ['flare', 2], ['coffee', 2]],
      guns: [['pistol', 18, 0.8]], wear: ['leather_duster'], throwables: { rock: 99 }, cash: 20 },
    knowing: { standing: { drifters: 8 }, npc: { id: 'tomas', kind: 'helped', about: 'a ride in your cab' }, renown: { wheelman: 6 },
      line: 'Old Tomás rode in your cab once and tells it. The drifters know the rig.' } },
  { id: 'cook', label: 'LINE COOK', blurb: 'You fed a town off one stove and a bad generator. Quick hands, a hard stomach, a knife you trust.',
    skills: { dexterity: 1 }, kit: { pack: 'satchel', items: [['beans_tin', 3], ['peaches_tin', 2], ['flatbread', 2], ['can_opener', 1], ['water_bottle', 1]],
      guns: [['pistol', 12, 0.5]], wear: [], throwables: { molotov: 1, rock: 99 }, cash: 10 },
    knowing: { standing: { rusthaven: 4 }, npc: { id: 'mags', kind: 'traded', weight: 4, about: 'your stew' }, renown: {},
      line: 'Mags Delacroix bought your stew by the bucket. Rust Haven remembers the smell.' } },
  { id: 'guardsman', label: 'GATE GUARD', blurb: 'You stood a wall for whoever paid, and some nights for nobody. You know a rush when you see one.',
    skills: { strength: 1, endurance: 1 }, kit: { pack: 'satchel', items: [['water_bottle', 1], ['jerky', 2], ['bandage', 1]],
      guns: [['auto', 24, 0.85]], wear: ['riot_helmet', 'leather_vest'], throwables: { smoke: 1, rock: 99 }, cash: 0 },
    knowing: { standing: { rusthaven: 10, dustwolves: -10 }, npc: { id: 'okonkwo', kind: 'helped', about: 'a night on the north wall' }, renown: { deputy: 6 },
      line: 'Sheriff Okonkwo stood a wall beside you. The Dustwolves remember who held it.' } },
  { id: 'medic', label: 'FIELD MEDIC', blurb: 'You have sewn worse than this by a flashlight in your teeth. People live because you did not stop.',
    skills: { dexterity: 1 }, kit: { pack: 'backpack', items: [['first_aid', 1], ['bandage', 4], ['painkillers', 1], ['antibiotics', 1], ['water_bottle', 1]],
      guns: [['pistol', 18, 0.75]], wear: [], throwables: { rock: 99 }, cash: 10 },
    knowing: { standing: { drifters: 5, rusthaven: 3 }, npc: { id: 'reyes', kind: 'helped', about: 'a long night in her clinic' }, renown: { medic: 7 },
      line: 'Doc Reyes worked a long night with you and asks after you. Word is out you patch people up.' } },
  { id: 'mechanic', label: 'MECHANIC', blurb: 'Grease to the elbow. You can hear a bad bearing over a running engine and fix it with what is lying around.',
    skills: { strength: 1 }, kit: { pack: 'backpack', items: [['wrench', 1], ['duct_tape', 1], ['spark_plugs', 2], ['scrap', 2], ['water_bottle', 1]],
      guns: [['pistol', 18, 0.8]], wear: ['mechanic_wraps', 'work_gloves'], throwables: { rock: 99 }, cash: 15 },
    knowing: { standing: { rusthaven: 4 }, npc: { id: 'kenji', kind: 'helped', about: 'a gearbox you rebuilt together' }, renown: {},
      line: 'Kenji Mori rebuilt a gearbox with you. He will let you near the Whaler.' } },
  { id: 'preacher', label: 'ROAD PREACHER', blurb: 'You carried a book and a voice from town to town. Folk fed you for the words, and some hated you for them.',
    skills: { endurance: 1 }, kit: { pack: 'satchel', items: [['water_bottle', 2], ['flatbread', 2], ['bandage', 2], ['photograph', 1]],
      guns: [['pistol', 6, 0.6]], wear: [], throwables: { rock: 99 }, cash: 25 },
    knowing: { standing: { drifters: 15 }, npc: { id: 'saoirse', kind: 'helped', about: 'the sermons she read on the air' }, renown: { samaritan: 6 },
      line: 'Static Byrne read your sermons on 1660 AM. Every drifter camp has heard your voice.' } },
  { id: 'scavkid', label: 'SCAV KID', blurb: 'You grew up small and quick in the ruins, through windows nobody else fit through. You know what is under a sink.',
    skills: { dexterity: 1, endurance: 1 }, kit: { pack: 'satchel', items: [['lockpicks', 1], ['rag', 3], ['jerky', 2], ['water_bottle', 1]],
      guns: [['auto', 12, 0.55]], wear: ['rabbit_foot'], throwables: { rock: 99 }, cash: 0 },
    knowing: { standing: { drifters: 3, rusthaven: -4 }, npc: { id: 'vo', kind: 'helped', about: 'how to move unseen' }, renown: { scavenger: 7 },
      line: 'Vo taught you to move unseen. Rust Haven still counts its shelves when you walk in.' } },
  { id: 'hunter', label: 'BOUNTY HUNTER', blurb: 'You brought men in, mostly breathing. The paper on your belt has faces on it, and some faces have paper on you.',
    skills: { dexterity: 1, strength: 1 }, kit: { pack: 'satchel', items: [['water_bottle', 1], ['jerky', 2], ['bandage', 1]],
      guns: [['pump', 15, 0.8]], wear: ['ammo_bandolier'], throwables: { flash: 1, rock: 99 }, cash: 30 },
    knowing: { standing: { rusthaven: 5, dustwolves: -20 }, npc: { id: 'okonkwo', kind: 'helped', about: 'a Dustwolf you brought in' }, renown: {},
      line: 'The sheriff paid you for a Dustwolf once. His pack has your face.' } },
  { id: 'convict', label: 'CONVICT', blurb: 'You did time, and the time did you. You came out strong, with friends on the wrong side and a debt on the right one.',
    skills: { strength: 2 }, kit: { pack: 'satchel', items: [['knife', 1], ['rag', 2], ['jerky', 1], ['rotgut', 1]],
      guns: [['pistol', 6, 0.35]], wear: ['brass_knuckles'], throwables: { rock: 99 }, cash: 0 },
    knowing: { standing: { dustwolves: 20, rusthaven: -8 }, npc: { id: 'ike', kind: 'owesMe', about: 'a gun from before' }, renown: {},
      line: 'Old cellmates ride with the Dustwolves. Ike says you still owe him for a gun.' } },
  { id: 'farmhand', label: 'GROVE HAND', blurb: 'Orange groves, cane fields, cattle. Up before the sun and still going after it. Hard work is just work.',
    skills: { strength: 1, endurance: 1 }, kit: { pack: 'backpack', items: [['machete', 1], ['canteen', 1], ['dried_meat', 2], ['cactus_fruit', 2]],
      guns: [['shotgun', 8, 0.7]], wear: ['trail_boots'], throwables: { rock: 99 }, cash: 10 },
    knowing: { standing: { drifters: 6 }, npc: { id: 'mags', kind: 'helped', about: 'a season of fruit you hauled' }, renown: {},
      line: 'Mags bought a season of fruit off you. The drifters trust a grove hand.' } },
];
export const backgroundById = (id) => BACKGROUNDS.find((b) => b.id === id) ?? null;

// ---- traits: good ones cost, flaws pay back --------------------------------------------------------------------------
// fx: the numbers each moves (see the header for who reads them). not: traits it cannot sit beside.
export const TRAITS = [
  { id: 'iron_gut', label: 'IRON GUT', cost: 3, d: 'bad tins and ditch water stay down: food lasts longer', fx: { drain: { food: 0.85 } }, not: ['big_appetite'] },
  { id: 'camel', label: 'DRY COUNTRY', cost: 3, d: 'you go a long way on a little water', fx: { drain: { water: 0.85 } }, not: ['always_thirsty'] },
  { id: 'night_eyes', label: 'NIGHT EYES', cost: 4, d: 'your shots hold in the dark', fx: { nightSpreadMul: 0.85 }, not: ['night_blind'] },
  { id: 'light_sleeper', label: 'LIGHT SLEEPER', cost: 2, d: 'anything walking up wakes you sooner', fx: { wakeMul: 1.4 }, not: ['heavy_sleeper'] },
  { id: 'pack_mule', label: 'PACK MULE', cost: 4, d: 'five more kilos before the load slows you', fx: { carryKg: 5 }, not: ['bad_back'] },
  { id: 'quick_hands', label: 'QUICK HANDS', cost: 4, d: 'reloads and jams cleared 10% faster', fx: { reloadMul: 0.9 }, not: ['fumbler'] },
  { id: 'steady', label: 'STEADY HANDS', cost: 5, d: 'tighter shots, always', fx: { spreadMul: 0.92 }, not: ['the_shakes'] },
  { id: 'fleet', label: 'FLEET-FOOTED', cost: 5, d: 'a little faster on foot', fx: { speedMul: 1.04 }, not: ['bad_knee'] },
  { id: 'quiet_step', label: 'QUIET STEP', cost: 4, d: 'hostiles have to be closer to pick you out', fx: { seenMul: 0.9 }, not: ['heavy_footed'] },
  { id: 'silver_tongue', label: 'SILVER TONGUE', cost: 4, d: 'every counter charges you less', fx: { priceMul: 0.94 }, not: ['sour_face'] },
  { id: 'tinker', label: 'TINKER', cost: 3, d: 'repairs take better', fx: { repair: 0.12 } },
  { id: 'lucky', label: 'LUCKY', cost: 5, d: 'one more find the first time you search a box', fx: { luck: 1 } },
  { id: 'thick_skin', label: 'THICK SKIN', cost: 5, d: 'ten more hit points', fx: { hp: 10 }, not: ['thin_blood'] },
  { id: 'long_wind', label: 'LONG WIND', cost: 4, d: 'sprinting tires you slower', fx: { sprintDrainMul: 0.88 }, not: ['short_breath'] },
];
export const FLAWS = [
  { id: 'night_blind', label: 'NIGHT-BLIND', refund: 4, d: 'after dark your shots wander', fx: { nightSpreadMul: 1.3 } },
  { id: 'bad_back', label: 'BAD BACK', refund: 4, d: 'six kilos less before the load slows you', fx: { carryKg: -6 } },
  { id: 'marked', label: 'MARKED', refund: 5, d: 'the Dustwolves want you dead and send riders for it', fx: {}, knowing: { standing: { dustwolves: -30 }, line: 'The Dustwolves put a price on you. They will come looking.' } },
  { id: 'heavy_sleeper', label: 'HEAVY SLEEPER', refund: 3, d: 'you sleep through them walking up', fx: { wakeMul: 0.6 } },
  { id: 'big_appetite', label: 'BIG APPETITE', refund: 3, d: 'you get hungry fast', fx: { drain: { food: 1.2 } } },
  { id: 'always_thirsty', label: 'ALWAYS THIRSTY', refund: 3, d: 'water goes through you', fx: { drain: { water: 1.2 } } },
  { id: 'the_shakes', label: 'THE SHAKES', refund: 4, d: 'your hands are never quite still', fx: { spreadMul: 1.1 } },
  { id: 'bad_knee', label: 'BAD KNEE', refund: 4, d: 'a step slower on foot', fx: { speedMul: 0.95 } },
  { id: 'heavy_footed', label: 'HEAVY-FOOTED', refund: 3, d: 'hostiles pick you out from further off', fx: { seenMul: 1.12 } },
  { id: 'sour_face', label: 'SOUR FACE', refund: 3, d: 'every counter charges you more', fx: { priceMul: 1.06 } },
  { id: 'short_breath', label: 'SHORT OF BREATH', refund: 3, d: 'sprinting winds you fast', fx: { sprintDrainMul: 1.2 } },
  { id: 'thin_blood', label: 'THIN BLOOD', refund: 3, d: 'ten fewer hit points', fx: { hp: -10 } },
  { id: 'fumbler', label: 'FUMBLER', refund: 3, d: 'reloads take longer', fx: { reloadMul: 1.12 } },
];
export const traitById = (id) => TRAITS.find((t) => t.id === id) ?? FLAWS.find((t) => t.id === id) ?? null;
export const isFlaw = (id) => FLAWS.some((t) => t.id === id);

// ---- where you are from ----------------------------------------------------------------------------------------------
// Country of origin: one of the flags the game can draw for real (ui/portrait.js FLAGS); the named people who share it
// warm to you a little (memory 'traded', weight COUNTRYMAN). Home state: USPS code; its ruler from data/atlas.js RULERS.
export const COUNTRYMAN = 3;
export const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
export const STATE_KEYS = Object.keys(STATES);

// ---- the look: the in-engine body's own options (systems/characters.js) ---------------------------------------------
// build: the body scaled (w across, h tall) by CharacterRenderer; the rest are the colour and style keys outfit() fills.
export const BUILDS = [
  { id: 'average', label: 'AVERAGE', w: 1, h: 1 },
  { id: 'lean', label: 'LEAN', w: 0.91, h: 1.01 },
  { id: 'wiry', label: 'WIRY', w: 0.88, h: 0.97 },
  { id: 'broad', label: 'BROAD', w: 1.09, h: 1.01 },
  { id: 'heavy', label: 'HEAVY', w: 1.17, h: 0.99 },
  { id: 'tall', label: 'TALL', w: 0.98, h: 1.07 },
  { id: 'short', label: 'SHORT', w: 1.03, h: 0.92 },
];
export const SKIN = ['#f1c9a5', '#e0ac85', '#c68863', '#a86b45', '#8d5532', '#6e3f22', '#4f2c17'];
export const HAIR = ['#1b1410', '#3b2516', '#6a4428', '#a0794a', '#c9b48a', '#7a7672', '#d8d4cc', '#b0301e'];
// hair: drawn in the hair colour; hats: in the hat colour (characters.js HAIR_STYLES)
export const HAIR_STYLES = [
  { id: 'short', label: 'SHORT' }, { id: 'long', label: 'LONG' }, { id: 'mohawk', label: 'MOHAWK' }, { id: 'bald', label: 'SHAVED' },
  { id: 'cap', label: 'CAP' }, { id: 'cowboy', label: 'WIDE BRIM' }, { id: 'beanie', label: 'BEANIE' }, { id: 'bandana', label: 'BANDANA' }, { id: 'wrap', label: 'HEAD WRAP' },
];
export const HAT_COLORS = ['#5a3f24', '#3d3530', '#6b5a3a', '#7a4a2a', '#2f3b42', '#4a4a38', '#8a2a1e', '#c9b48a'];
export const FACES = [{ id: 'none', label: 'BARE' }, { id: 'goggles', label: 'GOGGLES' }, { id: 'mask', label: 'DUST MASK' }, { id: 'eyepatch', label: 'EYEPATCH' }];
export const SCARS = [{ id: 'none', label: 'NONE' }, { id: 'brow', label: 'ACROSS THE BROW' }, { id: 'cheek', label: 'DOWN THE CHEEK' }, { id: 'jaw', label: 'ALONG THE JAW' }];
// The story a scar tells when somebody asks. Identity, not a number.
export const SCAR_STORIES = [
  'a windshield that came in', 'a knife in a bar fight', 'a bite that never turned', 'a fence you went over too fast',
  'a round that only grazed', 'a dog that was not friendly', 'a fall off a roof', 'you never say',
];
export const SHIRTS = ['#7d6a52', '#5f6a5a', '#8a5a3a', '#6b6156', '#4f5a62', '#9a7a52', '#7a3e2a', '#5a5040', '#2f4a52', '#3d4232', '#a8a090', '#6a2a1e'];
export const PANTS = ['#3b3a36', '#4c4232', '#2f3438', '#5a4a36', '#3e4a52', '#2a2622', '#4c5038', '#6b5a3a'];
export const BOOTS = ['#2b241e', '#3a2a1c', '#1c1a18', '#5a4630'];
export const SLEEVES = ['long', 'short'];

// ---- fresh picks ------------------------------------------------------------------------------------------------------
export function freshPicks() {
  return {
    v: 1, name: '', flag: 'US', state: 'FL', background: 'trucker',
    attrs: Object.fromEntries(ATTRS.map((a) => [a.k, CREATOR.rankStart])),
    traits: [],
    look: { build: 'average', skin: 2, hair: 1, hairStyle: 'short', hat: 0, face: 'none', scar: 'none', scarStory: 0, shirt: 0, pants: 0, boots: 0, sleeves: 'long' },
  };
}

// ---- the accounting ---------------------------------------------------------------------------------------------------
export function attrCost(r) { return ATTR_COST[Math.max(CREATOR.rankMin, Math.min(CREATOR.rankMax, r | 0))]; }
export function tally(p) {
  const attrs = ATTRS.reduce((s, a) => s + attrCost(p.attrs?.[a.k] ?? CREATOR.rankStart), 0);
  let good = 0, refund = 0;
  for (const id of p.traits ?? []) { const t = traitById(id); if (!t) continue; if (isFlaw(id)) refund += t.refund; else good += t.cost; }
  const refunded = Math.min(CREATOR.refundCap, refund);
  const spent = attrs + good - refunded;
  return { pool: CREATOR.pool, attrs, good, refund: refunded, refundRaw: refund, spent, left: CREATOR.pool - spent };
}

// What changing one thing would cost (positive) or give back (negative), without changing it.
export function priceOfRank(p, k, rank) { return attrCost(rank) - attrCost(p.attrs[k]); }
export function priceOfTrait(p, id, on) {
  const t = traitById(id); if (!t) return 0;
  const after = { ...p, traits: on ? [...new Set([...(p.traits ?? []), id])] : (p.traits ?? []).filter((x) => x !== id) };
  return tally(after).spent - tally(p).spent;
}

// The save gate. Its strings are the screen's errors, word for word.
export function validate(p) {
  const errs = [], T = tally(p), name = String(p.name ?? '').trim();
  if (name.length < CREATOR.nameMin || name.length > CREATOR.nameMax) errs.push(`Give them a name (${CREATOR.nameMin}-${CREATOR.nameMax} letters).`);
  else if (!/^[A-Za-z][A-Za-z '\-.]*$/.test(name)) errs.push('A name is letters, spaces, apostrophes and hyphens.');
  if (!STATES[p.state]) errs.push('Pick a home state.');
  if (!backgroundById(p.background)) errs.push('Pick what you did before.');
  for (const a of ATTRS) { const r = p.attrs?.[a.k]; if (!(r >= CREATOR.rankMin && r <= CREATOR.rankMax) || r !== Math.round(r)) errs.push(`${a.label} must be ${CREATOR.rankMin}-${CREATOR.rankMax}.`); }
  const traits = p.traits ?? [];
  for (const id of traits) if (!traitById(id)) errs.push(`No such trait: ${id}.`);
  if (new Set(traits).size !== traits.length) errs.push('Each trait once.');
  const flaws = traits.filter(isFlaw), goods = traits.filter((id) => !isFlaw(id) && traitById(id));
  if (flaws.length < CREATOR.minFlaws) errs.push('Everybody has a flaw. Take at least one.');
  if (flaws.length > CREATOR.maxFlaws) errs.push(`No more than ${CREATOR.maxFlaws} flaws.`);
  if (goods.length > CREATOR.maxGood) errs.push(`No more than ${CREATOR.maxGood} good traits.`);
  for (const id of goods) for (const x of traitById(id).not ?? []) if (traits.includes(x)) errs.push(`${traitById(id).label} and ${traitById(x).label} cannot both be true.`);
  if (T.left < 0) errs.push(`Over by ${-T.left} point${T.left === -1 ? '' : 's'}.`);
  return errs;
}

// ---- what the picks do -------------------------------------------------------------------------------------------------
// The sheet's live numbers (g.sheet.fx): 1 / 0 is no change. Pure from the picks.
export function effects(p) {
  const A = p.attrs ?? {}, R = PER_RANK;
  const fx = { carryKg: 0, spreadMul: 1, reloadMul: 1, sprintDrainMul: 1, speedMul: 1, nightSpreadMul: 1, seenMul: 1, priceMul: 1, repair: 0, luck: 0, hp: 0, wakeMul: 1, drain: { water: 1, food: 1, rest: 1 } };
  fx.hp += R.hpPerEndurance * ((A.endurance ?? 2) - 2);
  fx.wakeMul *= 0.8 + R.wakePerPerception * (A.perception ?? 2);
  fx.luck += (A.perception ?? 2) >= R.luckAt[1] ? 2 : (A.perception ?? 2) >= R.luckAt[0] ? 1 : 0;
  fx.priceMul *= 1 - R.pricePerWits * ((A.wits ?? 2) - 2);
  fx.repair += R.repairPerWits * ((A.wits ?? 2) - 2);
  fx.nightSpreadMul *= 1 + R.nightPerNerve * (2 - (A.nerve ?? 2));
  for (const id of p.traits ?? []) {
    const f = traitById(id)?.fx; if (!f) continue;
    for (const [k, v] of Object.entries(f)) {
      if (k === 'drain') { for (const [n, m] of Object.entries(v)) fx.drain[n] *= m; }
      else if (k.endsWith('Mul')) fx[k] *= v; else fx[k] += v;
    }
  }
  for (const k of Object.keys(fx)) if (typeof fx[k] === 'number') fx[k] = +fx[k].toFixed(4);
  for (const n of Object.keys(fx.drain)) fx.drain[n] = +fx.drain[n].toFixed(4);
  return fx;
}

// Starting skill levels: the attribute's rank - 1, plus the background's, capped at the skills' own 0..10.
export function startSkills(p) {
  const b = backgroundById(p.background), out = {};
  for (const a of ATTRS) if (a.skill) out[a.skill] = Math.max(0, Math.min(10, (p.attrs?.[a.k] ?? 2) - 1 + (b?.skills?.[a.skill] ?? 0)));
  return out;
}

// Who already knows you: the background's, the flaws', the home state's (a local), and your countrymen.
export function knowing(p, npcs = [], where = 'phoenix') {
  const S = START_BY[where] ?? START;
  const b = backgroundById(p.background), out = { standing: {}, npcs: [], renown: {}, lines: [] };
  const addSt = (s) => { for (const [f, v] of Object.entries(s ?? {})) out.standing[f] = (out.standing[f] ?? 0) + v; };
  if (b) {
    addSt(b.knowing.standing);
    if (b.knowing.npc) out.npcs.push({ ...b.knowing.npc });
    Object.assign(out.renown, b.knowing.renown ?? {});
    out.lines.push(b.knowing.line);
  }
  for (const id of p.traits ?? []) { const k = traitById(id)?.knowing; if (k) { addSt(k.standing); if (k.line) out.lines.push(k.line); } }
  if (p.state === S.state) { addSt({ [S.localFaction]: S.localStanding }); out.lines.push(`You are from ${STATES[p.state]}: a local here.`); }
  const kin = [];
  for (const n of npcs) if (n.id && n.flag === p.flag && !kin.some((x) => x.id === n.id || x.name === n.name) && !out.npcs.some((x) => x.id === n.id)) kin.push(n);
  for (const n of kin) out.npcs.push({ id: n.id, kind: 'traded', weight: COUNTRYMAN, about: 'home', countryman: true });
  if (kin.length) out.lines.push(`${kin.slice(0, 3).map((n) => n.name).join(', ')}${kin.length > 3 ? ` and ${kin.length - 3} more` : ''} ${kin.length === 1 ? 'is' : 'are'} from your country too.`);
  return out;
}

// The kit you walk out with: the background's, plus the scrip your unspent points are worth.
export function kitOf(p) {
  const b = backgroundById(p.background), T = tally(p);
  const k = b?.kit ?? { pack: 'satchel', items: [], guns: [['pistol', 12, 0.7]], wear: [], throwables: { rock: 99 }, cash: 0 };
  return { pack: k.pack, items: k.items.map(([id, n]) => [id, n]), guns: k.guns.map(([w, r, c]) => [w, r, c]), wear: [...k.wear], throwables: { ...k.throwables },
    cash: CREATOR.cashBase + (k.cash ?? 0) + Math.max(0, T.left) * CREATOR.scripPerPoint };
}

// The colours and styles the body is painted with (characters.js outfit() shape), and its build.
export function lookColors(p) {
  const L = p.look ?? freshPicks().look, at = (arr, i) => arr[((i | 0) % arr.length + arr.length) % arr.length];
  return {
    skin: at(SKIN, L.skin), hair: at(HAIR, L.hair), hat: at(HAT_COLORS, L.hat), hatStyle: L.hairStyle ?? 'short',
    shirt: at(SHIRTS, L.shirt), pants: at(PANTS, L.pants), boots: at(BOOTS, L.boots),
    gearStyle: 'none', gear: '#4a3a2a', accStyle: L.face ?? 'none', mask: '#5a4a32', sleeves: L.sleeves === 'short' ? 'short' : 'long',
    scar: L.scar && L.scar !== 'none' ? L.scar : null, scarColor: mixHex(at(SKIN, L.skin), '#f2c4b0', 0.55),
  };
}
// A scar heals paler than the skin round it.
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), ch = (v, s) => (v >> s) & 255;
  const m = (s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, '0')}`;
}
export function buildOf(p) { const b = BUILDS.find((x) => x.id === p.look?.build) ?? BUILDS[0]; return { w: b.w, h: b.h }; }

// ---- randomize, inside the budget -------------------------------------------------------------------------------------
// Never overspends: every buy is checked against what is left before it is made. names: a function (rng) -> name.
export function randomPicks(rng, { names, flags = ['US'] } = {}) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const p = freshPicks();
  p.name = names ? names(rng) : 'Drifter';
  p.flag = rng() < 0.45 ? 'US' : pick(flags);
  p.state = rng() < 0.35 ? 'FL' : pick(STATE_KEYS);
  p.background = pick(BACKGROUNDS).id;
  // a flaw or two first (they pay for the rest), then raises and good traits while the points last
  const flaws = [...FLAWS].sort(() => rng() - 0.5).slice(0, 1 + Math.floor(rng() * 2));
  for (const f of flaws) p.traits.push(f.id);
  for (let tries = 0; tries < 40; tries++) {
    const T = tally(p);
    if (T.left <= 1) break;
    if (rng() < 0.6) {
      const a = pick(ATTRS), r = p.attrs[a.k];
      if (r < CREATOR.rankMax && priceOfRank(p, a.k, r + 1) <= T.left) p.attrs[a.k] = r + 1;
    } else {
      const t = pick(TRAITS), goods = p.traits.filter((id) => !isFlaw(id));
      if (p.traits.includes(t.id) || goods.length >= CREATOR.maxGood || (t.not ?? []).some((x) => p.traits.includes(x))) continue;
      if (priceOfTrait(p, t.id, true) <= T.left) p.traits.push(t.id);
    }
  }
  p.look = randomLook(rng);
  return p;
}
export function randomLook(rng) {
  const pick = (a) => a[Math.floor(rng() * a.length)], n = (a) => Math.floor(rng() * a.length);
  return {
    build: pick(BUILDS).id, skin: n(SKIN), hair: n(HAIR), hairStyle: pick(HAIR_STYLES).id, hat: n(HAT_COLORS),
    face: rng() < 0.6 ? 'none' : pick(FACES).id, scar: rng() < 0.55 ? 'none' : pick(SCARS.slice(1)).id, scarStory: n(SCAR_STORIES),
    shirt: n(SHIRTS), pants: n(PANTS), boots: n(BOOTS), sleeves: rng() < 0.35 ? 'short' : 'long',
  };
}

// A clean copy of picks from anywhere (a save, the shard, an agent): unknown keys dropped, numbers clamped, look filled.
export function cleanPicks(src) {
  const p = freshPicks();
  if (!src || typeof src !== 'object') return p;
  if (typeof src.name === 'string') p.name = src.name.slice(0, CREATOR.nameMax + 4);
  if (typeof src.flag === 'string') p.flag = src.flag;
  if (STATES[src.state]) p.state = src.state;
  if (backgroundById(src.background)) p.background = src.background;
  for (const a of ATTRS) { const r = Number(src.attrs?.[a.k]); if (Number.isFinite(r)) p.attrs[a.k] = Math.max(CREATOR.rankMin, Math.min(CREATOR.rankMax, Math.round(r))); }
  if (Array.isArray(src.traits)) p.traits = [...new Set(src.traits.filter((id) => traitById(id)))];
  const L = src.look ?? {};
  for (const k of Object.keys(p.look)) if (L[k] !== undefined) p.look[k] = L[k];
  return p;
}
