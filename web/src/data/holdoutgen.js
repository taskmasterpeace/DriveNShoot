// THE HOLDOUT GENERATOR's rows (docs/design/WEB_HOLDOUTS.md; G7 of WEB_DEATHLANDS_GAP.md). Every town is its own little
// kingdom: a wall of what the fall left lying about, one gate, a Keyholder who holds its key, the bulls who hold it for
// them, the gatemen who read you the HOUSE RULES, and paper that is only good at home. world/holdoutgen.js turns a seed
// and a few params into a HOLDOUTS row (data/holdouts.js shape) that world/holdout.js lays out; systems/holdouts.js
// enforces the rules through the witness and deed system. Change a row, not the code.
// House words only (WEB_FAN_SERVICE_BIBLE §1): holdout, Keyholder, bulls, gatemen, sutlers, HOUSE RULES, scrip, the Swap.
// No purple (hue 270-320 is banned). Everybody is from somewhere: every person carries a real flag (ui/portrait.js).

// The wall kit: what a stretch of wall is built from, by weight. Each piece is ~one panel (wall.panel m) long.
//   container  a shipping container on its side, sometimes a second on top (rust red, teal, faded blue, cream, olive)
//   husk       dead cars stacked two or three high (our own bodies: systems/wrecks.js), a tin backing behind them
//   tin        corrugated sheets in two or three colours, patched
//   sandbag    sandbag courses to chest height, a tin screen above
export const WALL_KIT = {
  container: { h: 2.6, len: 6.0, colors: ['#8a3a22', '#2f6f6a', '#3f5f7a', '#c8b89a', '#5f6a3a', '#9a5a2a', '#6e3a2a'], second: 0.75 },
  husk: { stack: [3, 4], backing: ['#7d827c', '#8a5a3a', '#6e6a62'] },
  tin: { colors: ['#7d827c', '#8e938c', '#8a5a3a', '#7a4a2e', '#9a6a44', '#6e6a62', '#3f6f7a', '#a8a49a'] },
  sandbag: { h: 1.5, colors: ['#b0a07a', '#a8966c', '#9c8a62', '#bca97e'], screen: ['#7d827c', '#8a5a3a'] },
};

// Region palettes: what the land gives a holdout to build with and plant, and who lives there (flag weights).
export const PALETTE = {
  florida: {
    kit: [['container', 4], ['husk', 4], ['tin', 3], ['sandbag', 1]],
    trees: { street: ['sabal', 'fanpalm'], every: 30, square: ['liveoak', 'sabal'], squareH: [4.6, 6.2] },
    flags: [['US', 6], ['CU', 3], ['HT', 2], ['PR', 2], ['JM', 2], ['MX', 1], ['CO', 1], ['VN', 1], ['BR', 1], ['NG', 1]],
    cap: '#4f4234', post: '#4a3a2a', roof: '#6e5a44',
  },
  arizona: {
    kit: [['husk', 5], ['container', 3], ['tin', 3], ['sandbag', 2]],
    trees: { street: ['datepalm', 'fanpalm'], every: 34, square: ['mesquite', 'paloverde'], squareH: [4.2, 5.4] },
    flags: [['US', 6], ['MX', 5], ['CA', 1], ['PH', 1], ['KR', 1], ['DE', 1], ['IE', 1], ['IT', 1], ['GH', 1]],
    cap: '#5a4630', post: '#4a3a2a', roof: '#7a5a3a',
  },
};

// Sizes: the wall outside to outside [E-W, N-S], how many N-S avenues (blocks are columns x 2 rows either side of Main
// Street), how many bulls and folk. A column must fit the civic row (the Keyholder's hall, the jail, the clinic).
export const SIZES = {
  small: { size: [204, 172], cols: 2, bulls: 4, folk: 14, lamps: 14 },
  medium: { size: [280, 192], cols: 3, bulls: 6, folk: 20, lamps: 20 },
  large: { size: [360, 232], cols: 4, bulls: 8, folk: 26, lamps: 26 },
};

// The Keyholder: who holds the key, as kinds. title: what the town calls them; vices and laws: one each is drawn;
// rules: HOUSE_RULES ids this kind leans to (weights on top of the table's); kit: wall-kit weight multipliers;
// incorruptible: the gatemen will not take a bribe; scrip: the paper's name pattern ({TOWN}); wealth: added to the param.
export const KEYHOLDERS = {
  waterlord: { title: 'WATER BOSS', hall: 'THE VALVE HOUSE', rules: { water_tithe: 6, no_wheels: 2 }, kit: { tin: 1.5 }, wealth: 0.1,
    vices: ['drinks the town\'s best water in front of it', 'counts every cup twice', 'keeps a pool nobody may swim in'],
    laws: ['Water is owed before it is drunk.', 'Whoever holds the valve holds the town.', 'A tithe paid is a life kept.'], scrip: '{TOWN} WATER CHITS' },
  broker: { title: 'BROKER', hall: 'THE COUNTING HOUSE', rules: { scrip_toll: 6, guns_checked: 3 }, kit: { container: 1.6 }, wealth: 0.25,
    vices: ['gambles the treasury on dog fights', 'wears a dead man\'s suit every day', 'buys loyalty and never trusts it'],
    laws: ['Everything inside the wall has a price.', 'House paper or no business.', 'A debt is a leash.'], scrip: '{TOWN} PAPER' },
  judge: { title: 'THE JUDGE', hall: 'THE COURTHOUSE', rules: { guns_checked: 6, curfew: 3 }, kit: { sandbag: 2 }, incorruptible: true, wealth: 0,
    vices: ['hangs a man a week whether or not one is owed', 'keeps the old law books and reads them aloud', 'never sleeps'],
    laws: ['The law is what the bench says it is.', 'No steel but the house\'s.', 'Every stranger is on trial.'], scrip: '{TOWN} COURT SCRIP' },
  matriarch: { title: 'MATRIARCH', hall: 'THE FAMILY HOUSE', rules: { dogs_leashed: 5, curfew: 4 }, kit: { tin: 1.3 }, wealth: 0.05,
    vices: ['marries her enemies to her grandchildren', 'remembers every slight for forty years', 'feeds strays and starves visitors'],
    laws: ['Family first, guests a long way after.', 'Nobody walks the streets at night but blood.', 'A loose dog is a dead dog.'], scrip: '{TOWN} FAMILY NOTES' },
  pitboss: { title: 'PIT BOSS', hall: 'THE BOSS HALL', rules: { no_wheels: 5, no_drawn_steel: 4 }, kit: { husk: 1.6 }, wealth: 0.15,
    vices: ['bets on the house fighters', 'collects the teeth of champions', 'cannot stand to lose at anything'],
    laws: ['Every quarrel goes to the pit.', 'Blood is spent in the ring or not at all.', 'Wheels stay outside: the town is for walking.'], scrip: '{TOWN} PIT MARKERS' },
  preacher: { title: 'THE PREACHER', hall: 'THE MEETING HOUSE', rules: { curfew: 5, guns_checked: 4 }, kit: { sandbag: 1.5 }, incorruptible: true, wealth: -0.05,
    vices: ['takes a tenth of everything and calls it grace', 'hears confessions and sells them', 'fasts the town when the wells run low'],
    laws: ['The gate is a door to a house of peace.', 'No iron under the roof of the faithful.', 'The night belongs to prayer.'], scrip: '{TOWN} OFFERING SLIPS' },
  scrapking: { title: 'SCRAP KING', hall: 'THE THRONE ROOM', rules: { no_wheels: 4, water_tithe: 3, scrip_toll: 2 }, kit: { husk: 2, container: 1.2 }, wealth: 0.1,
    vices: ['wears a crown cut from a hubcap', 'strips your car while you buy the drinks', 'hoards engines that will never run again'],
    laws: ['Whatever rolls in stays in.', 'Every hulk is the house\'s.', 'Pay the gate or feed the crusher.'], scrip: '{TOWN} SCRAP TICKETS' },
};

// HOUSE RULES. Each holdout gets 1-2 (table weight x its Keyholder's lean). gate: what the gateman asks for at the gate
// (guns: hand them over, held in the gate locker and given back at the gate on the way out; toll: n of the house's
// paper; water: one water; park: leave the car outside); inside: what a bull watches for inside the wall (a break in
// sight of a bull, a gateman or the Keyholder is a deed they witness: systems/holdouts.js -> deeds.record). when: always
// or night (game hours [from, to)). heat: local wanted levels a witnessed break is worth (1..3).
export const HOUSE_RULES = {
  guns_checked: { w: 3, name: 'GUNS CHECKED AT THE GATE', line: 'Guns get checked at the gate. You get them back on your way out.', gate: 'guns', inside: 'gunOut', when: 'always', heat: 2 },
  dogs_leashed: { w: 2, name: 'DOGS LEASHED AFTER DARK', line: 'After dark your dog stays at your heel. A loose dog gets shot.', gate: null, inside: 'dogLoose', when: 'night', heat: 1 },
  water_tithe: { w: 2, name: 'A WATER TITHE AT THE GATE', line: 'One water to the house at the gate. Nobody drinks here who did not tithe.', gate: 'water', inside: 'drinkUntithed', when: 'always', heat: 1 },
  curfew: { w: 2, name: 'NO STRANGERS ABROAD AFTER CURFEW', line: 'Curfew is ten. After that a stranger is indoors or in the jail.', gate: null, inside: 'abroadAtNight', when: 'night', heat: 1 },
  scrip_toll: { w: 2, name: 'TOLL IN HOUSE PAPER ONLY', line: 'The toll is paid in house paper. Dollars do not spend at this gate.', gate: 'toll', inside: null, when: 'always', heat: 1 },
  no_wheels: { w: 2, name: 'NO WHEELS INSIDE THE WALLS', line: 'Wheels stay outside. Inside the wall you walk.', gate: 'park', inside: 'driving', when: 'always', heat: 1 },
  no_drawn_steel: { w: 1, name: 'NO DRAWN STEEL IN THE SWAP', line: 'Nobody shows a gun in the Swap. Not raised, not in hand.', gate: null, inside: 'armedInSwap', when: 'always', heat: 2 },
};
// The rule every holdout keeps whatever its Keyholder says: in by the gate check, or not at all.
export const THE_GATE = { id: 'the_gate', name: 'IN BY THE GATE CHECK', heat: 2 };
export const NIGHT = { from: 22, to: 5 };

// The gate check (systems/holdouts.js): a gateman stands either side of the main gate; within `trigger` m of the gate's
// outside mouth, on foot or at the wheel, the nearer one stops you and reads the house rules (the dialogue panel: their
// words are its subtitles). Comply, bribe (`bribe` dollars x the town's greed), lie (a Persuade check: `lie` + the
// Keyholder's suspicion), or fight. A pass lasts until you leave past `leaveR` m from the wall.
export const GATE = { trigger: 8, talk: 5.2, inside: -1.2, aside: 3.8, leaveR: 60, bribe: [25, 60], lie: [18, 40], tollPaper: [4, 12], waterValue: 6, park: 26 };

// Local wanted (per holdout, 0..3): a witnessed break raises it by the rule's heat; the town's bulls, gatemen and Keyholder
// shoot on sight while it is up (a vendetta, their town only). It cools `cool` levels a game hour while you are out of the
// wall and nobody of theirs sees you, or clears at once when you pay the fine at the gate (`fine` x level dollars).
export const WANTED = { max: 3, cool: 0.25, fine: 40, seenR: 30 };

// House scrip (FIFTY PAPERS: each town's own paper, bad paper discounted by distance from home). A note is worth `face`
// dollars at home; anywhere else it is worth face x max(floor, 1 - perKm x km from home). The house buys its own paper
// back at `cashOut` and sells it at `buy`; a sutler takes foreign paper at its discounted worth less `cut`.
export const SCRIP = { face: 1, perKm: 0.02, floor: 0.2, buy: 1.1, cashOut: 0.9, cut: 0.1 };

// Names for people the generator makes (first, last), and the Keyholder's own (a family name the town goes by).
export const NAMES = {
  first: ['Marta', 'Elias', 'Odessa', 'Ramon', 'Ines', 'Tobias', 'Yolanda', 'Desmond', 'Celia', 'Augustin', 'Beatriz', 'Corwin', 'Lupe', 'Hollis', 'Nadia', 'Ezequiel',
    'Rosalind', 'Abner', 'Pilar', 'Silas', 'Adaeze', 'Thuy', 'Kofi', 'Mercedes', 'Jasper', 'Ondina', 'Reyes', 'Wendell', 'Dalia', 'Cyrus'],
  last: ['Varga', 'Okafor', 'Delacroix', 'Montoya', 'Pryce', 'Castellanos', 'Achebe', 'Quill', 'Navarro', 'Holloway', 'Tran', 'Abernathy', 'Ferreira', 'Duvall',
    'Escobedo', 'Marchetti', 'Rourke', 'Batiste', 'Mensah', 'Calloway', 'Soto', 'Kwan', 'Lindqvist', 'Obi', 'Peralta', 'Whitcombe'],
};

// The seeded holdouts: one per exit town in the streamed regions (Arizona's I-10, Florida's I-95 and I-75), standing
// where the exit's community stood. region + exit (the exit's name, or I-10's row id), side (which side of the road the
// town stands: W|E beside a north-south road, N|S beside an east-west one) and m (metres off the road). The first five
// are hand-polished (name, motto, Keyholder, rules, scrip fixed; the rest of the town from the seed).
export const SEEDS = [
  { id: 'sebastian', region: 'florida', exit: 'SEBASTIAN', side: 'W', m: 520, seed: 1401, size: 'medium', wealth: 0.55, keyholder: 'waterlord',
    polish: { name: 'SEBASTIAN', motto: 'THE WELLS RUN DEEP · PAY THE WATER', keyholder: { name: 'Odessa Varga', flag: 'CU' }, rules: ['water_tithe', 'guns_checked'], scrip: 'SEBASTIAN WATER CHITS' } },
  { id: 'little_river', region: 'florida', exit: 'LITTLE RIVER', side: 'W', m: 700, seed: 1402, size: 'large', wealth: 0.8, keyholder: 'broker',
    polish: { name: 'LITTLE RIVER', motto: 'EVERYTHING HAS A PRICE', keyholder: { name: 'Augustin Delacroix', flag: 'HT' }, rules: ['scrip_toll', 'guns_checked'], scrip: 'LITTLE RIVER PAPER' } },
  { id: 'daytona', region: 'florida', exit: 'DAYTONA', side: 'E', m: 380, seed: 1403, size: 'medium', wealth: 0.6, keyholder: 'pitboss',
    polish: { name: 'DAYTONA', motto: 'SETTLE IT IN THE PIT', keyholder: { name: 'Hollis Rourke', flag: 'US' }, rules: ['no_wheels', 'no_drawn_steel'], scrip: 'DAYTONA PIT MARKERS' } },
  { id: 'alligator_alley', region: 'florida', exit: 'ALLIGATOR ALLEY', side: 'N', m: 420, seed: 1404, size: 'small', wealth: 0.3, keyholder: 'matriarch',
    polish: { name: 'THE ALLEY', motto: 'BLOOD KEEPS THE GATE', keyholder: { name: 'Mercedes Batiste', flag: 'PR' }, rules: ['dogs_leashed', 'curfew'], scrip: 'ALLEY FAMILY NOTES' } },
  { id: 'furnace_mile', region: 'arizona', exit: 'I-10_X1', side: 'S', m: 640, seed: 1405, size: 'medium', wealth: 0.35, keyholder: 'judge',
    polish: { name: 'FURNACE MILE', motto: 'THE BENCH SEES ALL', keyholder: { name: 'Ezequiel Montoya', flag: 'MX' }, rules: ['guns_checked', 'curfew'], scrip: 'FURNACE COURT SCRIP' } },
  { id: 'las_palmas', region: 'arizona', exit: 'I-10_X3', side: 'S', m: 700, seed: 1406, size: 'large', wealth: 0.5, keyholder: 'scrapking' },
  { id: 'st_augustine', region: 'florida', exit: 'ST. AUGUSTINE', side: 'E', m: 360, seed: 1407, size: 'small', wealth: 0.4, keyholder: 'preacher' },
  { id: 'canal_locks', region: 'florida', exit: 'THE CANAL LOCKS', side: 'W', m: 600, seed: 1408, size: 'small', wealth: 0.25, keyholder: 'scrapking' },
];

// Validation ranges (validateHoldouts): what a row must stay inside to lay out and to play.
export const LIMITS = { wall: [140, 420], wallH: [3, 6.5], gate: [12, 20], rules: [1, 2], bulls: [2, 12], wealth: [0, 1] };
