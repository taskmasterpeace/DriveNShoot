// HOLDOUTS as rows (docs/design/WEB_FLORIDA.md §3.4): walled towns the streamed world builds from the existing
// generators: zones and lots like the Phoenix ring's, floor-planned walk-in buildings (world/floorplan.js through
// world/ring.js geo), the holdout fill of data/holdout.js (a market, gardens, tanks, washing lines), and its people.
// world/holdout.js lays one out; systems/regions.js brings its people in. Change a row, not the code.
// Positions are metres in the holdout's own frame: x east, z south, (0, 0) its centre. No purple, no brand names.

// MERIDIAN: the starting holdout (Robert, EM3 Briefing: START IN FLORIDA), Florida's Rust Haven. In the Godot game it is
// the proving-ground town at I-95 Exit 9 (Main Street with a civic row and a commercial row, the clinic with its clone
// wing, the police station, the market, the motel, the junkyard, the derby bowl): its roster comes over through this
// adapter; Florida stands it on I-95 at mile 9, between the interstate and the Indian River lagoon, behind a wall.
export const HOLDOUTS = {
  meridian: {
    id: 'meridian', name: 'MERIDIAN', motto: 'HOLD THE LINE · KEEP THE PEACE',
    size: [372, 300],          // the wall, outside to outside (E-W, N-S)
    shoreGap: 330,             // metres from the east wall to the lagoon's mainland shore
    approach: 16,              // the access road from the interstate ends this far outside the west gate
    seed: 909,
    faction: { id: 'meridian', name: 'Meridian', color: '#4f9a8a', start: 12 },
    wall: { h: 3.6, t: 0.7, panel: 6, colors: ['#7a6a52', '#8a5a3a', '#6e6a62', '#9a8a6a', '#7f7a6e'], cap: '#4f4234', post: '#4a3a2a',
      tower: { size: 5.2, h: 7.6, roof: '#6e5a44' }, gate: 16, junk: 0.35 },
    gates: [{ side: 'W', at: 0, name: 'WEST GATE' }, { side: 'E', at: 0, name: 'LAGOON GATE' }, { side: 'N', at: 46, name: 'NORTH GATE' }],
    // Streets: E-W rows at z, N-S avenues at x, with their names (the HUD street sign).
    streets: {
      ew: [{ at: -74, w: 12, name: 'CYPRESS ROW' }, { at: 0, w: 16, name: 'MAIN STREET', gates: true }, { at: 74, w: 12, name: 'TIDEWATER ROW' }],
      ns: [{ at: -104, w: 12, name: 'PALMETTO AVENUE' }, { at: 46, w: 12, name: 'COURTHOUSE STREET', north: true }, { at: 124, w: 12, name: 'YARD STREET' }],
    },
    walk: 3, lane: 9, // sidewalks either side of every street; the dirt lane inside the wall
    // Blocks by [column, row] between the avenues and rows (column 0 west of Palmetto .. 3 east of Yard St; row 0 north
    // of Cypress .. 3 south of Tidewater). front: the street side the buildings face. lots: programmes in order along the
    // front (a kind in data/ring.js KINDS; ['house', 3] = three of them); open: an open lot instead (market, garden,
    // arena, yard, junk, tower) laid out by world/holdout.js from data/holdout.js rows.
    blocks: [
      { at: [1, 1], front: 'S', name: 'THE CIVIC ROW', lots: ['clinic', 'clonewing', 'sheriff', 'townhall', 'chapel', 'radio'] },
      { at: [1, 2], front: 'N', name: 'MAIN STREET', lots: ['store', 'cantina', 'gunsmith', 'water', 'boarding', 'diner'] },
      { at: [2, 1], open: 'market', name: 'THE MARKET' },
      { at: [2, 2], front: 'N', name: 'THE GARAGE', lots: ['mechanic', 'gas'], open: 'yard' },
      { at: [0, 1], front: 'S', lots: ['boarding', 'house', 'house'] },
      { at: [0, 2], front: 'N', lots: [['house', 3]] },
      { at: [3, 1], front: 'S', lots: ['house'], open: 'tower' },
      { at: [3, 2], front: 'N', lots: ['warehouse'] },
      { at: [0, 0], front: 'S', lots: [['house', 2], 'bungalow'] },
      { at: [1, 0], front: 'S', lots: ['house', 'bungalow', 'duplex', 'house', 'bungalow', 'house'] },
      { at: [2, 0], open: 'garden', name: 'THE GARDENS' },
      { at: [3, 0], front: 'S', lots: [['house', 2]] },
      { at: [0, 3], open: 'garden', name: 'THE FIELDS' },
      { at: [1, 3], front: 'N', lots: ['house', 'duplex', 'house', 'bungalow', 'house', 'house'] },
      { at: [2, 3], open: 'arena', name: 'THE PIT' },
      { at: [3, 3], open: 'junk', name: 'THE BONEYARD' },
    ],
    // The lagoon landing: a dirt road out of the east gate to a pier, boats tied up at it.
    dock: { len: 46, w: 3.2, boats: [['airboat', '#5a6a48'], ['jetski', '#2f7f8a']] },
    // The clinic (WEB_FLORIDA §3.5): where a new character wakes, and the clone bay's hook for the clone agent: a clone
    // wakes in a vat in `clinic.bay`'s room and walks out the clinic's front door. respawn: the fee, as Rust Haven's.
    clinic: { lot: 'clinic', bay: 'clonewing', fee: 0.15, doctor: 'mer_doc' },
    // Living trees along Main Street and in the market (world/flora.js species; fallbacks when a model is not in yet).
    trees: { street: ['sabal', 'fanpalm'], every: 26, square: ['liveoak', 'sabal'] },
    // The holdout fill (data/holdout.js reads): market stalls, gardens, tanks, washing lines, shade.
    lamps: 32,
  },
};

// Meridian's people (systems/regions.js brings them in when you come near, and keeps their records when you leave).
// Named ones carry a dialogue tree (data/meridian-talk.js) and a post: the front room of their building (`at` a lot
// kind) or a spot (`spot`: gate, market, dock, garden, pit). job: what they do; trades: a TRADERS row (data/trade.js).
// Everybody's from somewhere: a real flag on each (ui/portrait.js FLAGS).
export const PEOPLE = {
  meridian: {
    named: [
      { id: 'mer_sheriff', name: 'Sheriff Marisol Duarte', title: "Sheriff · Meridian", flag: 'CU', at: 'sheriff', job: 'sheriff', weapon: 'smg', essential: true,
        portrait: { seed: 401, skin: '#a8714a', hair: '#1c1410', hat: 'cowboy', mood: 'neutral', shirt: '#5a6a4a', gear: 'bandolier' } },
      { id: 'mer_doc', name: 'Dr. Kwame Asante', title: 'Doctor · Meridian Clinic', flag: 'GH', at: 'clinic', job: 'doctor', essential: true, trades: { deals: ['med'] },
        portrait: { seed: 402, skin: '#4a2a18', hair: '#2a2420', hat: 'bald', mood: 'smile', shirt: '#d8d4c8', gear: 'goggles' } },
      { id: 'mer_mech', name: 'Lucien Boudreaux', title: 'Mechanic · The Garage', flag: 'HT', at: 'mechanic', job: 'mechanic', trades: { deals: ['part', 'tool', 'pack'] },
        portrait: { seed: 403, skin: '#5a3220', hair: '#1a1410', hat: 'cap', mood: 'neutral', shirt: '#3f5a62', gear: 'none' } },
      { id: 'mer_store', name: 'Nguyen Thi Hoa', title: 'Trader · General Store', flag: 'VN', at: 'store', job: 'trader', trades: { deals: ['food', 'water', 'tool', 'pack', 'valuable', 'paper'] },
        portrait: { seed: 404, skin: '#c8a07a', hair: '#141010', hat: 'long', mood: 'smile', shirt: '#9a4a2e', gear: 'none' } },
      { id: 'mer_guns', name: 'Abel Mendoza', title: 'Gunsmith · Meridian', flag: 'MX', at: 'gunsmith', job: 'gunsmith', weapon: 'pistol', trades: { deals: ['gun', 'ammo', 'tool'] },
        portrait: { seed: 405, skin: '#9a6a44', hair: '#3a2a20', hat: 'short', mood: 'neutral', shirt: '#4a4440', gear: 'eyepatch' } },
      { id: 'mer_water', name: 'Precious Owusu', title: 'Water Seller · Meridian', flag: 'NG', at: 'water', job: 'water', trades: { deals: ['water', 'food', 'valuable', 'paper'] },
        portrait: { seed: 406, skin: '#5a3420', hair: '#141010', hat: 'wrap', mood: 'smile', shirt: '#2f7f8a', gear: 'none' } },
      { id: 'mer_cantina', name: 'Teo Ruiz', title: 'Keeper · The Cantina', flag: 'PR', at: 'cantina', job: 'barkeep', trades: { deals: ['food', 'water'] },
        portrait: { seed: 407, skin: '#b07a52', hair: '#2a1a12', hat: 'short', mood: 'smile', shirt: '#7a3a2a', gear: 'none' } },
      { id: 'mer_radio', name: 'Della Kincaid', title: 'Voice of WMRD · 1210 AM', flag: 'US', at: 'radio', job: 'radio',
        portrait: { seed: 408, skin: '#e0b896', hair: '#8a5a2a', hat: 'long', mood: 'neutral', shirt: '#4a5a6a', gear: 'none' } },
      { id: 'mer_mayor', name: 'Mayor Winston Clarke', title: 'Mayor · Meridian', flag: 'JM', at: 'townhall', job: 'mayor', essential: true,
        portrait: { seed: 409, skin: '#4a2a1a', hair: '#7a7470', hat: 'short', mood: 'neutral', shirt: '#e8e0d0', gear: 'none' } },
    ],
    // Deputies at the gates (archetype warden: they guard and they shoot back), townsfolk at their work.
    deputies: { count: 5, spots: ['gate:W', 'gate:W', 'gate:E', 'gate:N', 'market'], weapon: [['smg', 2], ['shotgun', 1]], hp: 130 },
    folk: [
      { job: 'farmer', spot: 'garden', count: 4 }, { job: 'fisher', spot: 'dock', count: 2 }, { job: 'stallkeeper', spot: 'market', count: 4 },
      { job: 'scrapper', spot: 'junk', count: 2 }, { job: 'mechanic hand', spot: 'yard', count: 1 }, { job: 'pit fighter', spot: 'pit', count: 2 },
      { job: 'townsfolk', spot: 'main', count: 8 }, { job: 'patient', spot: 'clinic', count: 2 },
    ],
    flags: [['US', 5], ['CU', 3], ['HT', 2], ['PR', 2], ['JM', 1], ['MX', 1], ['CO', 1], ['VN', 1], ['BR', 1], ['PH', 1]],
    promoteR: 520, demoteR: 900,
  },
};
