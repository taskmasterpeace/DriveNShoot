// CLONES AS ROWS (docs/design/WEB_CLONE_TRAVEL.md). Death is Autoduel's: you wake as your clone, in the vat that holds
// your last PRESSING (the backup), knowing what you knew the day it was taken, with nothing on you. Your HUSK (the body
// you left) lies where you fell with everything you carried, your car where you parked it, and you have to get back to
// them before the pickers do. No pressing in the brine when you die: you DIE FLAT, and that character is over.
//
// Everything here is a number or a row; systems/clone.js reads it. Region-agnostic: a vat is a town row (any id the
// usmap knows, built or not) plus where in it the vat stands; the World Forge's MAP tab can add them as rows.

// ---- the rules -------------------------------------------------------------------------------------------------------
export const CLONE_RULES = {
  // A pressing (backup): what it costs at the counter, what the brine costs to keep it, how long you may fall behind.
  price: 400,            // scrip, at a vat's counter (a vat row's priceMul scales it)
  upkeepPerDay: 20,      // brine money, drawn from the brine book at each new day while a pressing is held
  graceDays: 2,          // days the brine book may run dry before the vat drains your pressing (it is gone)
  starterPressing: true, // a new character starts pressed once, free, at the first vat (Rust Haven presses newcomers: it needs bodies)
  pressHours: 1,         // the scan takes an hour in the chair: the clock runs
  // Waking (coming up).
  wakeDelay: 4,          // seconds of black between the last breath and the brine draining
  wakeHp: 0.6,           // you come up at this share of your max health
  sickHours: 24,         // brine-sick for a game day
  sick: { staminaRegen: 0.6, maxStamina: 0.7, sway: 1.3, speedMul: 0.9, healMul: 0.6, vignette: 0.22, waterMul: 1.2 },
  // What the vat hands a body coming up out of the brine: the engine's hands need a gun, so a worn clinic loaner, empty.
  wakeKit: { gun: 'pistol', cond: 0.35, loaded: 0, items: [['water_bottle', 1], ['rag', 1]], throwables: { rock: 99 } },
  // The husk (your body where you fell).
  husk: {
    cap: 999,            // litres: everything you had fits on you, that is where it was
    carRange: 350,       // your last car is "where you fell" if you died in it or it stood this close (m)
    keepDays: 10,        // after this many days the husk is gone (dragged off, eaten): what is left on it with it
    promoteR: 150,       // the body is drawn (a real dead body on the ground) within this many metres of you
  },
  // The pickers: every game hour a roll per husk takes something. Odds an hour by where the husk lies; the best thing first.
  pick: {
    perHour: { haven: 0.01, ring: 0.06, road: 0.09, wild: 0.04 }, // inside Rust Haven's walls, the dead city, I-10 itself, the open desert
    night: 1.5,          // night hours multiply the odds
    cashShare: 0.35,     // a pick that finds the scrip takes this share of it
    trunkMul: 0.5,       // a car's trunk is picked at half the rate (it is locked, mostly)
    carStripDays: 4,     // a car left this long unattended has its wheels taken (it will not move until a garage)
    // Caught at it: walk up while something taken in the last `fresh` hours is still being carried off, and (these odds) the
    // picker is crouched over the husk; seen within fleeR they run, past goneR from the husk they are gone with it.
    seen: { fresh: 8, odds: 0.7, armed: 0.4, fleeR: 22, goneR: 140 },
  },
  // Dying flat (no pressing in the brine). On a shard the character is over for good; on a local save it is flagged and
  // a fresh drifter walks in (the character creator, when it lands, opens instead: g.creator?.open).
  flat: { shard: 'gone', local: 'fresh' },
};

// What a clone keeps and what it loses (the design table, shown at the counter and read by the selftest).
export const CLONE_KEEPS = {
  keeps: ['your name, face and flag', 'skills and xp as of the pressing', 'scrip in your brine book', 'what the world knows of you (standing, roles, deeds)', 'your quests', 'your house and anything stored away'],
  loses: ['everything you carried (it is on your husk)', 'everything you wore (on your husk)', 'scrip in your pockets (on your husk)', 'skill xp earned after the pressing', 'one pressing: a vat holds one body, you must be pressed again'],
};

// ---- the vats ---------------------------------------------------------------------------------------------------------
// One per metro row, plus the holdouts that run one. `town` is a usmap town id (W.locate), `at` a world point when the vat
// is a known building (Rust Haven's clinic back room), else it stands at the town's travel port. priceMul / upkeepMul
// scale the rules. A vat in a town the map has not built yet is still a row: you can be pressed there and come up there
// (you arrive at that node off the map: systems/travel.js holds you in its arrivals hall).
export const VATS = [
  // The clinic's middle room (between Reyes's front room and the ward): the vat against its north wall, you come up in front of it.
  { id: 'rust_haven', town: 'phoenix', name: "DOC REYES'S BRINE ROOM", short: 'RUST HAVEN', at: { x: -53.2, z: -56.6 }, wake: { x: -53.6, z: -54.4 }, keeper: 'reyes', priceMul: 1, upkeepMul: 1 },
  { id: 'los_angeles', town: 'losangeles', name: 'THE ANGEL STREET VATS', short: 'LOS ANGELES', port: 'la_knot', priceMul: 1.25, upkeepMul: 1.2 },
  { id: 'el_paso', town: 'elpaso', name: 'PASO BRINE WORKS', short: 'EL PASO', port: 'paso_knot', priceMul: 0.9, upkeepMul: 0.9 },
  // Florida's start (WEB_FLORIDA.md): the clone bay behind Meridian's clinic (systems/regions.js clinic('meridian')).
  { id: 'meridian', town: 'meridian', clinic: 'meridian', port: 'meridian_knot', name: 'MERIDIAN CLONE BAY', short: 'MERIDIAN', keeper: 'mer_doc', priceMul: 1, upkeepMul: 1 },
  { id: 'new_york', town: 'newyork', name: 'HARBOR BRINE HOUSE', short: 'NEW YORK', port: 'ny_field', priceMul: 1.6, upkeepMul: 1.5 },
  { id: 'chicago', town: 'chicago', name: 'LAKESHORE VAT HALL', short: 'CHICAGO', port: 'chi_field', priceMul: 1.4, upkeepMul: 1.3 },
  { id: 'new_orleans', town: 'neworleans', name: 'THE LEVEE TANKS', short: 'NEW ORLEANS', port: 'nola_field', priceMul: 1.2, upkeepMul: 1.1 },
  { id: 'ohio', town: 'cincinnati', name: 'RIVER BEND PRESSING HOUSE', short: 'OHIO', port: 'ohio_field', priceMul: 1.1, upkeepMul: 1 },
];

// ---- our words (the glossary is in docs/design/WEB_CLONE_TRAVEL.md; tools/ip-lint.mjs checks none are the novels') ----
export const SLANG = {
  rerun: 'a clone; "she is on her third rerun"',
  brine: 'the vat and what fills it; "came up out of the brine"',
  'brine room': "a clinic's vat room",
  pressing: 'a backup scan; "get pressed", "a cold pressing" is an old one',
  'come up': 'to wake as your clone',
  husk: 'the body you left where you fell',
  'husk run': 'the trip back to your own body',
  picker: 'a scavenger who strips husks',
  'die flat': 'to die with no pressing in the brine: the end of you',
  'brine money': 'the upkeep a vat charges to keep your pressing',
  'brine book': 'your account at the vats: scrip that outlives you',
  'brine-sick': 'clone sickness, the first day out of the vat',
  punch: 'a ticket (the conductor punches it)',
  pole: 'a bus stop: a post, a bench and a schedule board',
  trundle: 'the bus',
  'ride the iron': 'take the train',
  'sky ticket': 'a fare on the one airline',
  knot: 'a travel port, where lines meet',
};
