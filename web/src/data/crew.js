// THE CREW as rows (docs/design/WEB_CREW.md; the gap spec docs/design/WEB_DEATHLANDS_GAP.md G3 + §4.4).
// The eight CREW CARDS of docs/design/WEB_ATLAS.md §3.3 (archetype: true) and the generic hireables, one schema:
//   id          the row
//   name        what the card is called (an archetype, never a person's name)
//   archetype   one of the eight cards: at most CREW_RULES.archetypeCap of them in one crew (the IP law, bible §3.5 row 13)
//   names       the pool a recruit's own name is drawn from (our names, no book's)
//   flags       the pool their flag is drawn from (ui/portrait.js FLAGS keys: every person shows a real flag)
//   look        skin, hair, shirt, pants, hatStyle, accStyle, gearStyle (characters.js outfit fields)
//   hand        right | left (the dominant hand: the window they shoot from first)
//   weapon      the gun they carry (systems/combat.js WEAPONS) and rounds: what they bring in the pack
//   signature   { item, text }: the thing they are known for (an items.js id when it exists, else the words)
//   flaw        { id, text }: what goes wrong (systems/crew.js reads the id: talker, wanderer, healer, hothead, ...)
//   skills      1-5 in the crew skills (CREW_SKILLS): what jobs they are good at (data/crewjobs.js reads them)
//   ai          { style, moves, cover, retreat, ammo }: the atlas's four columns, as the tactics knobs:
//                 bandMul (their preferred distance x the weapon's band), coverPref (0-1: how hard they look for
//                 cover), breakAt (morale under which they fall back), thrift (0-1: fewer, aimed shots), flank (0-1: take
//                 the flank role when the squad splits), stray (0-1: chance to wander off mid-fight, the Thrown Man)
//   values      how a deed moves their trust (-5..+5 per verb, §4.4); the crew's own events too (CREW_EVENTS)
//   trustStart  where trust begins (hires 10, rescued 35, sworn 50 when the row gives none)
//   pay         scrip a day for a hire (0: they ride for the cause)
//   role        a role (data/roles.js) whose renowned tier draws this card to you (the EARN way in)
//   hp          their body

export const CREW_SKILLS = ['shooting', 'driving', 'medic', 'mechanic', 'scavenge', 'cook', 'scout', 'gunsmith'];

// The crew's own events, alongside the world's deed verbs (data/society.js VERBS): what systems/crew.js feeds the
// trust formula. weight 1-4 is the §4.4 deed weight.
export const CREW_EVENTS = {
  killUnarmed: { weight: 3, why: 'killed somebody with no gun in their hand' },
  killRaider: { weight: 1, why: 'put a Dustwolf down' },
  winOutnumbered: { weight: 3, why: 'won a fight we were outnumbered in' },
  abandonCrew: { weight: 4, why: 'left one of us to bleed out' },
  savedCrew: { weight: 3, why: 'pulled one of us back from the edge' },
  leftStranger: { weight: 2, why: 'walked past a hurt stranger' },
  shotCrew: { weight: 4, why: 'shot one of us' },
  paid: { weight: 1, why: 'paid us on time' },
  unpaid: { weight: 3, why: 'did not pay us' },
  fedCrew: { weight: 1, why: 'kept us fed' },
  starved: { weight: 2, why: 'let us go hungry' },
};

export const CREW_RULES = {
  cap: 6,                 // the band is 1 to 6 counting you: you + 5 (Robert, 2026-10-27)
  archetypeCap: 4,        // at most 4 of the 8 CREW CARDS in one crew (IP law)
  trustMin: -100, trustMax: 100,
  trustDecayPerDay: 2,    // daily drift toward 0
  heardMul: 0.4,          // a deed they only heard of in camp talk
  refuseBelow: -25,       // refuses risky orders
  leaveBelow: -40,        // leaves at dawn with a 1/N share
  betrayBelow: -80,       // a rival's offer and they turn
  lastStandAbove: 60,     // shields you, drags you out
  bleedOut: 75,           // seconds a downed member has before they are gone
  stabilizeHp: 0.35,      // what a patched-up member stands up with (of max)
  reviveReach: 1.8,       // how close you have to be to patch them up or take hold of them
  dragSpeed: 2.2,         // m/s you can drag a body
  witnessR: 34,           // a member this close and in sight saw the deed (else they hear it at camp)
  thinkHz: 6,             // their order brain, staggered
  followGap: { walk: 4, run: 12 },
  formations: {           // offsets in the leader's frame: x right, z back (m), slot by slot
    wedge: [[-2.6, 2.6], [2.6, 2.6], [-5.2, 5.2], [5.2, 5.2], [0, 6]],
    file: [[0, 2.6], [0, 5.2], [0, 7.8], [0, 10.4], [0, 13]],
    spread: [[-4.5, 1.5], [4.5, 1.5], [-9, 3], [9, 3], [0, 5]],
  },
  needsPerHour: { food: 0.03, water: 0.05, rest: 0.035 }, // a member's needs drain on the game clock
  hungerTrust: 0.25,      // needs under this at dawn: the starved event
  seekR: 150,             // a candidate is promoted to a person within this of you, and written back past seekR + 60
};

const LOOK = (skin, hair, shirt, pants, hatStyle = 'short', accStyle = 'none', gearStyle = 'none') => ({ skin, hair, shirt, pants, hatStyle, accStyle, gearStyle });

// ---- the eight CREW CARDS (WEB_ATLAS §3.3, in our words) ------------------------------------------------------------
export const CREW_CARDS = [
  { id: 'wheelboss', name: 'the Wheel Boss', archetype: true, names: ['Dace Merrow', 'Hollis Kade', 'Ruth Calder', 'Amos Teague'], flags: ['US', 'CA', 'IE'],
    look: LOOK('#9a6a4a', '#2a2018', '#4a3a28', '#2f2a24', 'cowboy', 'eyepatch', 'bandolier'), hand: 'right', weapon: 'rifle', rounds: 90,
    signature: { item: 'gun_rifle', text: 'a long scoped rifle, every round counted aloud' }, flaw: { id: 'hothead', text: 'answers every insult in person' },
    skills: { shooting: 5, driving: 4, medic: 1, mechanic: 2, scavenge: 2, cook: 1, scout: 3, gunsmith: 2 },
    ai: { style: 'leader', moves: 'leads from the front, short bounds, the high side of the road', cover: 'hard cover only, never a car door', retreat: 'last out, covering the others', ammo: 'aimed fire only', bandMul: 1, coverPref: 0.8, breakAt: 0.15, thrift: 0.8, flank: 0.2, stray: 0, hardCoverOnly: true },
    values: { kill: 0, killRaider: 1, winOutnumbered: 3, abandonCrew: -5, savedCrew: 3, betray: -5, rob: -2, defend: 3, shotCrew: -5, unpaid: -2 }, trustStart: 40, pay: 0, role: 'rider', hp: 150 },
  { id: 'staticear', name: 'the Static-Ear', archetype: true, names: ['Wren Askew', 'Lio Sarte', 'Noor Hale', 'Ines Vary'], flags: ['MX', 'CU', 'PR', 'BR'],
    look: LOOK('#b08060', '#1b1410', '#3e4a52', '#2e2c28', 'wrap', 'goggles'), hand: 'left', weapon: 'pistol', rounds: 30,
    signature: { item: null, text: 'the warning: she hears trouble coming' }, flaw: { id: 'choirsick', text: 'infected nests knock her flat' },
    skills: { shooting: 2, driving: 2, medic: 2, mechanic: 1, scavenge: 3, cook: 2, scout: 5, gunsmith: 1 },
    ai: { style: 'scout', moves: 'mid-file, stops dead when the static rises', cover: 'low cover, eyes on the crew', retreat: 'calls it early', ammo: 'thrifty', bandMul: 1.1, coverPref: 0.7, breakAt: 0.45, thrift: 0.7, flank: 0.3, stray: 0 },
    values: { kill: -1, killUnarmed: -4, heal: 2, rescue: 3, abandonCrew: -4, savedCrew: 2, silence: -3 }, trustStart: 30, pay: 0, role: 'samaritan', hp: 100 },
  { id: 'quartermaster', name: 'the Quartermaster', archetype: true, names: ['Teo Bain', 'Mira Holt', 'Kip Vasquez', 'Odile Rook'], flags: ['MX', 'VN', 'PH', 'US'],
    look: LOOK('#7a5238', '#3a2a1c', '#4a4f38', '#3a3630', 'cap', 'none', 'bandolier'), hand: 'right', weapon: 'smg', rounds: 128,
    signature: { item: null, text: 'a charge for every door' }, flaw: { id: 'hoarder', text: 'will not leave a gun behind' },
    skills: { shooting: 3, driving: 2, medic: 1, mechanic: 3, scavenge: 4, cook: 1, scout: 2, gunsmith: 4 },
    ai: { style: 'flanker', moves: 'flanks while the others fix the enemy', cover: 'blows a wall and goes through', retreat: 'mines the way back', ammo: 'short bursts', bandMul: 0.9, coverPref: 0.6, breakAt: 0.3, thrift: 0.5, flank: 0.9, stray: 0, grenades: 3 },
    values: { steal: 1, destroy: 1, trade: 1, abandonCrew: -4, savedCrew: 2, unpaid: -3, paid: 1 }, trustStart: 25, pay: 0, role: 'trader', hp: 110 },
  { id: 'marshkid', name: 'the Marsh Kid', archetype: true, names: ['Jory Pell', 'Sable', 'Tadpole', 'Cass Mire'], flags: ['US', 'HT', 'JM'],
    look: LOOK('#6a4630', '#1b1410', '#4a4f38', '#3e4a52', 'long', 'mask'), hand: 'left', weapon: 'pistol', rounds: 18,
    signature: { item: null, text: 'a short spear and a fish knife' }, flaw: { id: 'townhater', text: 'hates engines and towns' },
    skills: { shooting: 2, driving: 1, medic: 1, mechanic: 1, scavenge: 4, cook: 3, scout: 5, gunsmith: 1 },
    ai: { style: 'stalker', moves: 'scouts ahead off the road, comes in from behind', cover: 'concealment, never where he was', retreat: 'vanishes; turns up later', ammo: 'steel first', bandMul: 0.8, coverPref: 0.5, breakAt: 0.4, thrift: 0.9, flank: 1, stray: 0 },
    values: { kill: -1, destroy: -1, rescue: 2, carjack: -1, abandonCrew: -5, savedCrew: 3, trespass: 1 }, trustStart: 20, pay: 0, role: 'scavenger', hp: 90 },
  { id: 'sleeper', name: 'the Sleeper', archetype: true, names: ['Agnes Thorne', 'Mei Arden', 'Clare Doyle', 'Ruth Okafor'], flags: ['IE', 'JP', 'NG', 'CA'],
    look: LOOK('#c49a7a', '#6a665a', '#5a6a6a', '#2f2a24', 'short', 'none'), hand: 'right', weapon: 'rifle', rounds: 60,
    signature: { item: 'suture_kit', text: 'the suture kit and a marksman\'s eye' }, flaw: { id: 'healer', text: 'will stop to treat anyone' },
    skills: { shooting: 4, driving: 1, medic: 5, mechanic: 1, scavenge: 2, cook: 3, scout: 2, gunsmith: 1 },
    ai: { style: 'marksman', moves: 'stays back with the wounded', cover: 'a firing position, held', retreat: 'drags a casualty with her', ammo: 'single aimed shots', bandMul: 1.15, coverPref: 0.9, breakAt: 0.25, thrift: 1, flank: 0, stray: 0, highGround: true },
    values: { heal: 4, rescue: 3, kill: -1, killUnarmed: -5, silence: -5, leftStranger: -4, abandonCrew: -5, savedCrew: 4, hurt: -1 }, trustStart: 50, pay: 0, role: 'medic', hp: 100 },
  { id: 'thrownman', name: 'the Thrown Man', archetype: true, names: ['Walter Pym', 'Dr. Eli Sorensen', 'Harlan Voss', 'Mr. Abernathy'], flags: ['US', 'DE', 'IT'],
    look: LOOK('#d0a888', '#9a9f86', '#6a5a48', '#4a463c', 'bald', 'goggles'), hand: 'right', weapon: 'shotgun', rounds: 16,
    signature: { item: null, text: 'reads station panels nobody else can' }, flaw: { id: 'wanderer', text: 'drifts away mid-fight' },
    skills: { shooting: 2, driving: 1, medic: 2, mechanic: 4, scavenge: 3, cook: 1, scout: 1, gunsmith: 3 },
    ai: { style: 'erratic', moves: 'stands in the open, then does something brilliant', cover: 'forgets it', retreat: 'has to be fetched', ammo: 'both barrels at once', bandMul: 1, coverPref: 0.15, breakAt: 0.35, thrift: 0.1, flank: 0.4, stray: 0.25 },
    values: { trade: 1, rescue: 2, kill: -1, destroy: -2, abandonCrew: -3, savedCrew: 3 }, trustStart: 30, pay: 0, role: 'stuntdriver', hp: 90 },
  { id: 'prospect', name: 'the Prospect', archetype: true, names: ['Danny Kade', 'Pip Merrow', 'Joel Teague', 'Mags Calder'], flags: ['US', 'CA', 'MX'],
    look: LOOK('#a07050', '#4a3a28', '#7a5a3a', '#2f2a24', 'cap', 'none'), hand: 'right', weapon: 'pistol', rounds: 36,
    signature: { item: null, text: 'a sling and a borrowed pistol' }, flaw: { id: 'brave', text: 'does the brave, stupid thing' },
    skills: { shooting: 2, driving: 3, medic: 1, mechanic: 2, scavenge: 3, cook: 2, scout: 3, gunsmith: 1 },
    ai: { style: 'eager', moves: 'runs to where the fight is', cover: 'copies whoever he admires', retreat: 'only when ordered twice', ammo: 'empties the magazine', bandMul: 0.7, coverPref: 0.3, breakAt: 0.05, thrift: 0, flank: 0.6, stray: 0 },
    values: { kill: 1, killRaider: 2, winOutnumbered: 4, stunt: 2, abandonCrew: -4, savedCrew: 4, betray: -3 }, trustStart: 45, pay: 0, role: 'deputy', hp: 95 },
  { id: 'scrapsmith', name: 'the Scrap Smith', archetype: true, names: ['Ike Pamu', 'Lono Reyes', 'Tavi Kahale', 'Rocco Salas'], flags: ['PH', 'KR', 'VN', 'US'],
    look: LOOK('#8a5a3a', '#1b1410', '#3a3631', '#3e4a52', 'short', 'goggles', 'pack'), hand: 'left', weapon: 'smg', rounds: 96,
    signature: { item: null, text: 'clears any jam, builds guns from junk' }, flaw: { id: 'talker', text: 'talks while he works' },
    skills: { shooting: 3, driving: 2, medic: 1, mechanic: 4, scavenge: 3, cook: 2, scout: 1, gunsmith: 5 },
    ai: { style: 'support', moves: 'second rank', cover: 'behind the vehicle', retreat: 'with the gear', ammo: 'reloads others first', bandMul: 1, coverPref: 0.7, breakAt: 0.3, thrift: 0.5, flank: 0.2, stray: 0, vehicleCover: true },
    values: { trade: 1, destroy: -1, steal: 1, abandonCrew: -4, savedCrew: 3, unpaid: -2 }, trustStart: 30, pay: 0, role: 'wheelman', hp: 105 },
];

// ---- the generic hireables (drifters, sutlers' guards, freed captives): unlimited in a crew ---------------------------
const GEN = (id, name, weapon, rounds, skills, ai, values, extra = {}) => ({
  id, name, archetype: false, names: extra.names ?? GENERIC_NAMES, flags: extra.flags ?? ['US', 'MX', 'CA', 'CU', 'NG', 'GH', 'CO', 'BR', 'PH', 'KR'],
  look: extra.look ?? LOOK('#a07050', '#2a2018', '#5a4a38', '#2f2a24'), hand: extra.hand ?? 'right', weapon, rounds,
  signature: extra.signature ?? { item: null, text: 'nothing special: steady hands' }, flaw: extra.flaw ?? { id: 'none', text: 'none worth naming' },
  skills: { shooting: 2, driving: 2, medic: 1, mechanic: 1, scavenge: 2, cook: 2, scout: 2, gunsmith: 1, ...skills },
  ai: { style: 'line', moves: 'with the group', cover: 'whatever is close', retreat: 'when it goes bad', ammo: 'steady', bandMul: 1, coverPref: 0.6, breakAt: 0.35, thrift: 0.5, flank: 0.4, stray: 0, ...ai },
  values: { abandonCrew: -3, savedCrew: 2, unpaid: -4, paid: 1, ...values }, trustStart: extra.trustStart ?? 10, pay: extra.pay ?? 0, role: null, hp: extra.hp ?? 100,
});
const GENERIC_NAMES = ['Bo Carney', 'Lupe Ortiz', 'Hank Dwillard', 'Tess Mabry', 'Joaquin Rey', 'Effie Lantz', 'Marcus Obi', 'Dale Pruitt', 'Rosa Quill', 'Gus Fenner', 'June Albright', 'Kwame Asante', 'Lena Petrov', 'Sal Moretti', 'Yuki Tan', 'Ana Lima', 'Cyrus Webb', 'Nell Haskins', 'Pete Rourke', 'Vera Ocampo'];

export const CREW_GENERICS = [
  GEN('drifter_gun', 'a drifter with a gun', 'pistol', 24, { shooting: 3 }, {}, { kill: -1, rob: -2 }, { pay: 20 }),
  GEN('drifter_scav', 'a drifter scavenger', 'pistol', 12, { scavenge: 4 }, { breakAt: 0.5 }, { steal: 1 }, { pay: 15 }),
  GEN('drifter_cook', 'a camp cook', null, 0, { cook: 4, medic: 2 }, { coverPref: 0.9, breakAt: 0.6 }, { heal: 2, kill: -2 }, { pay: 15 }),
  GEN('sutler_guard', "a sutler's guard", 'smg', 64, { shooting: 3, driving: 3 }, { coverPref: 0.7 }, { rob: -3, trade: 1 }, { pay: 40, hp: 120 }),
  GEN('caravan_driver', 'a caravan driver', 'pistol', 18, { driving: 5, mechanic: 3 }, { breakAt: 0.45 }, { carjack: -2, stunt: 1 }, { pay: 30 }),
  GEN('wall_veteran', 'a retired wall guard', 'rifle', 45, { shooting: 4, scout: 3 }, { coverPref: 0.85, breakAt: 0.2, thrift: 0.8 }, { kill: -1, defend: 2 }, { pay: 45, hp: 110 }),
  GEN('field_medic', 'a field medic', 'pistol', 12, { medic: 4, cook: 2 }, { coverPref: 0.8, breakAt: 0.5, flank: 0 }, { heal: 3, killUnarmed: -4 }, { pay: 35 }),
  GEN('mechanic_hand', 'a grease monkey', 'pistol', 12, { mechanic: 4, driving: 3 }, { breakAt: 0.5 }, { destroy: -1 }, { pay: 30 }),
  GEN('gun_tinker', 'a gun tinker', 'smg', 48, { gunsmith: 4, shooting: 2 }, {}, { trade: 1 }, { pay: 35 }),
  GEN('tracker', 'a tracker', 'rifle', 30, { scout: 4, scavenge: 3 }, { bandMul: 1.1, flank: 0.7 }, { trespass: 1 }, { pay: 30 }),
  GEN('shotgun_rider', 'a shotgun rider', 'shotgun', 24, { shooting: 3, driving: 2 }, { bandMul: 0.8, flank: 0.6 }, { kill: 0, defend: 2 }, { pay: 30, hp: 115 }),
  GEN('farmhand', 'a farmhand', null, 0, { cook: 3, scavenge: 3 }, { breakAt: 0.6 }, { kill: -2, rescue: 2 }, { pay: 10 }),
  GEN('radio_hand', 'a radio hand', 'pistol', 12, { scout: 3, mechanic: 3 }, { breakAt: 0.5 }, {}, { pay: 25 }),
  GEN('deserter', 'a Remnant deserter', 'rifle', 60, { shooting: 4, scout: 2 }, { coverPref: 0.85, thrift: 0.7 }, { trespass: -1, kill: 0 }, { pay: 40, hp: 115 }),
  GEN('ex_raider', 'a turned Dustwolf', 'smg', 48, { shooting: 3, driving: 4 }, { coverPref: 0.4, flank: 0.8, breakAt: 0.2 }, { killRaider: -1, rob: 1 }, { pay: 25, hp: 110 }),
  GEN('captive_trader', 'a freed trader', null, 0, { scavenge: 3, cook: 2 }, { breakAt: 0.7 }, { trade: 2, rescue: 3 }, { trustStart: 35 }),
  GEN('captive_hand', 'a freed road hand', 'pistol', 6, { driving: 3, mechanic: 2 }, { breakAt: 0.55 }, { rescue: 3, killRaider: 2 }, { trustStart: 35 }),
  GEN('captive_kid', 'a freed runaway', null, 0, { scout: 3, scavenge: 3 }, { breakAt: 0.7 }, { rescue: 4, kill: -1 }, { trustStart: 35, hp: 80 }),
  GEN('swamp_guide', 'a swamp guide', 'shotgun', 16, { scout: 4, cook: 3 }, { coverPref: 0.6, flank: 0.7 }, { destroy: -1 }, { pay: 25, flags: ['US', 'HT', 'CU', 'JM'] }),
  GEN('ferryman', 'a ferry hand', 'pistol', 18, { driving: 4, mechanic: 2 }, {}, { rescue: 2 }, { pay: 25, flags: ['US', 'CU', 'PR', 'HT'] }),
];

export const CREW_ROWS = [...CREW_CARDS, ...CREW_GENERICS];
export const CREW_BY_ID = Object.fromEntries(CREW_ROWS.map((r) => [r.id, r]));

// ---- who you can meet without the API (systems/crew.js seeds these as candidates) ------------------------------------
// how: talk (they ask to come, or you ask) | hire (scrip a day, a sutler's board) | rescue (a captive: cut them loose)
//      | earn (arrives when a role reaches renowned). where: island metres, or { holdout, dx, dz } off its clinic door,
//      or { camp: i, dx, dz } off a Dustwolf camp.
export const CREW_SEEDS = [
  { key: 'rh_wheelboss', row: 'wheelboss', how: 'talk', where: { x: 6, z: -22 }, line: 'You drive like you mean it. The road east needs a crew that means it.' },
  { key: 'rh_guard', row: 'sutler_guard', how: 'hire', where: { x: -12, z: -26 }, line: 'Forty a day and I watch your back. The board says I am the best rate in the Haven.' },
  { key: 'mer_sleeper', row: 'sleeper', how: 'talk', where: { holdout: 'meridian', dx: 3.5, dz: 2.5 }, line: 'I woke up a lifetime late. If you are going out there, take a nurse.' },
  { key: 'camp0_captive_a', row: 'captive_hand', how: 'rescue', where: { camp: 0, dx: -6, dz: 5 }, line: 'They were going to sell me east. Cut me loose and I ride with you.' },
  { key: 'camp0_captive_b', row: 'captive_kid', how: 'rescue', where: { camp: 0, dx: -8, dz: 3 }, line: 'Please. I can scout. I can find food. Just get me out.' },
];

// The ways in, by what trust they start at (§4.4) when the row gives none.
export const JOIN_TRUST = { hire: 10, rescue: 35, talk: 20, earn: 50, api: 20 };

// Validate rows: names, flags drawable, weapons real, numbers in range, the caps sane. Returns { ok, errors }.
export function validateCrew(rows = CREW_ROWS, { flags = null, weapons = null, verbs = null } = {}) {
  const errors = [], ids = new Set();
  let cards = 0;
  for (const r of rows) {
    const at = `crew row "${r?.id}"`;
    if (!r || typeof r.id !== 'string' || !r.id) { errors.push('a row with no id'); continue; }
    if (ids.has(r.id)) errors.push(`${at}: duplicate id`);
    ids.add(r.id);
    if (r.archetype) cards++;
    if (!r.name || typeof r.name !== 'string') errors.push(`${at}: no name`);
    if (!Array.isArray(r.names) || !r.names.length) errors.push(`${at}: an empty name pool`);
    if (!Array.isArray(r.flags) || !r.flags.length) errors.push(`${at}: no flags`);
    if (flags) for (const f of r.flags ?? []) if (!flags.includes(f)) errors.push(`${at}: flag ${f} cannot be drawn`);
    if (r.weapon !== null && weapons && !weapons.includes(r.weapon)) errors.push(`${at}: weapon ${r.weapon} is not a WEAPONS row`);
    if (!['right', 'left'].includes(r.hand)) errors.push(`${at}: hand must be right|left`);
    if (!r.flaw?.id || !r.signature?.text) errors.push(`${at}: needs a flaw id and a signature`);
    for (const s of CREW_SKILLS) { const v = r.skills?.[s]; if (!(v >= 1 && v <= 5)) errors.push(`${at}: skill ${s} must be 1-5`); }
    const a = r.ai ?? {};
    for (const k of ['coverPref', 'breakAt', 'thrift', 'flank', 'stray']) if (!(a[k] >= 0 && a[k] <= 1)) errors.push(`${at}: ai.${k} must be 0-1`);
    if (!(a.bandMul > 0.3 && a.bandMul < 2)) errors.push(`${at}: ai.bandMul out of range`);
    for (const [k, v] of Object.entries(r.values ?? {})) {
      if (!(v >= -5 && v <= 5)) errors.push(`${at}: value ${k} must be -5..5`);
      if (verbs && !(k in verbs) && !(k in CREW_EVENTS)) errors.push(`${at}: value ${k} is neither a deed verb nor a crew event`);
    }
    if (!(r.trustStart >= -100 && r.trustStart <= 100)) errors.push(`${at}: trustStart out of range`);
    if (!(r.hp > 0)) errors.push(`${at}: hp`);
  }
  if (cards !== 8 && rows === CREW_ROWS) errors.push(`expected the 8 CREW CARDS, found ${cards}`);
  if (CREW_RULES.archetypeCap > 4) errors.push('archetypeCap may not exceed 4 (IP law)');
  if (CREW_RULES.cap < 1 || CREW_RULES.cap > 6) errors.push('cap must be 1-6');
  for (const s of CREW_SEEDS) if (!ids.has(s.row) && rows === CREW_ROWS) errors.push(`seed ${s.key}: no row ${s.row}`);
  return { ok: !errors.length, errors, cards, generics: rows.length - cards };
}
