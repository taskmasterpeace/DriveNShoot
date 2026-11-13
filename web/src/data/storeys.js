// Buildings that rise (docs/design/WEB_STOREYS.md). A storey's floor is a deck (counted only for someone already up
// near it, like the streaming world's bridge decks), its walls are boxes with a base and a height, and a flight of
// stairs is a slope between two decks. Every number here is a knob; world/storeys.js reads them.

// STOREY      up: floor to floor of an upper storey (m). The street storey keeps the wall height city.js rolled
//             for it (4.2-6 m), so the first floor stands on its wall top and its flight is longer, at the same pitch.
//             slab: a floor's thickness. top: the parapet above the top storey's ceiling.
// FLIGHT      a staircase: pitch (rise over run: 3.2 / 4.4 is 36°, a real stair's 30-40°), w across, landing = clear
//             floor at each end. A flight is entered at its two ends only: flanks, rails and a block see to that.
// RAIL        the railing round a stairwell's hole upstairs: its height off the floor.
// WINDOWS     upper storeys get a window opening every `every` m of wall, `w` wide, sill at `sill`, opening `h` tall
//             (glass long gone: an opening that sight and bullets pass, nobody climbs).
// LEVEL       how far apart two heights may be and still count as one floor (sight, bullets, reach, deeds).
export const STOREY = { up: 3.2, slab: 0.22, top: 0.5 };
export const FLIGHT = { pitch: 3.2 / 4.4, w: 1.4, landing: 1.4, block: 2.0 };
export const RAIL = { h: 1.0, t: 0.12 };
export const WINDOWS = { every: 4, w: 1.3, sill: 0.95, h: 1.2 };
export const LEVEL = { same: 1.6, step: 0.25, head: 2.4, eye: 1.2 };

// Which buildings rise: a share of the intact (roofed) enterable buildings, by district, rolled from the building's own
// seed (its position), never from the city's stream - the island's layout and its golden hash do not move.
//   share     the chance a building of the district rises
//   storeys   [min, max] floors above the street storey
//   minArea   the footprint a building needs (m²): a staircase and its landings take a wall's length
export const RISE = {
  town: { share: 0.3, storeys: [1, 1], minArea: 220 },   // Rust Haven: three houses in ten have an upstairs
  ruins: { share: 0.45, storeys: [1, 3], minArea: 220, tower: 5 }, // the Glass Flats' blocks: two to four storeys of rooms to clear;
  //                                                                tower: the biggest one rising is downtown's six-storey tower
};
// The skyline's cap (docs/design/WEB_DEATHLANDS_GAP.md §7 storeys.maxAbove): floors ABOVE the street storey, anywhere -
// the island, the ring, a generated town (data/citygen.js VERT.maxStoreys = maxAbove + 1). Safe 3-7: above 5 the tilted
// camera needs >= 60 m of boom to see the roofs.
export const MAX_ABOVE = 5;

// STOREYS v2 - THE RING RISES (docs/design/WEB_STOREYS.md §9). Which of the Phoenix ring's lots stand taller than one
// storey, by zone, rolled from the lot's own seed (world/ringrise.js; the ring's own rng is never read). A lot that rises
// is built by the generated-town builder (world/citygen/build.js: stairs to every floor, a roof you can stand on, fire
// escapes, roof bridges, loot per floor) in place of the ring's one-storey shell.
//   belt      the DOWNTOWN belt: blocks whose centre is within `belt` m of the island's edge (Chebyshev) - the towers
//             that ring the walled island, the skyline you drive past on the first ring street
//   share     the chance a lot of that zone rises; storeys [min, max] INCLUDING the street storey (cap MAX_ABOVE + 1)
//   kinds     ring kind -> generated kind (data/citygen.js KINDS): the street storey's height, roof access, escape odds,
//             the loot row; a kind not listed never rises (a fuel stop keeps its canopy, a warehouse its one tall bay)
//   grow      downtown footprints grow inside their lot to [w, d] at most (a tower needs a floor plate), keeping
//             `side` m clear each side (a fire escape's 2.8 m and a walker) and `back` m to the lot's back line
//   escape    the chance a building of 3+ storeys gets an outside stair (overrides the kind's odds); bridges: the share of
//             facing roof pairs (gap 1.5-7 m, within 3.2 m of height) joined by planks
export const RING_RISE = {
  belt: 170,
  downtown: { share: 0.62, storeys: [4, 6], kinds: { mall: 'hotel', diner: 'office', house: 'apartment', bungalow: 'apartment', duplex: 'apartment', shop: 'office' },
    grow: { w: 24, d: 20, side: 3.1, back: 2.5 }, escape: 0.85, bridges: 0.85 },
  strip: { share: 0.4, storeys: [2, 3], kinds: { mall: 'shop', diner: 'shop' }, escape: 0.6, bridges: 0.5 },
  residential: { share: 0.2, storeys: [2, 2], kinds: { house: 'house', bungalow: 'house', duplex: 'rowhouse' }, escape: 0, bridges: 0 },
  industrial: null, // THE YARDS stay one tall storey (a warehouse's bay is 6-7.4 m: the mezzanine is its office's roof)
  ruins: { share: 0.12, storeys: [2, 3], kinds: { house: 'adobe', bungalow: 'adobe', shop: 'shop' }, ruined: 0.6, escape: 0.3, bridges: 0 },
};

// The floors as places to fight (docs/design/WEB_STOREYS.md §9.3): what crosses between floors.
//   window    an upper-floor person within `reach` m of an outside wall (or `roof` m of a roof's edge) sees and is seen
//             from the street and the other buildings through the window bays, at their own floor's height; `range`: the
//             farthest such a line runs (m)
//   noise     how far a noise carries by floors apart inside a storeyed building: [same, one, two+] x its radius
//   blast     a blast's share by floors apart (same, one, two+); the street counts as floor 0 of every building
export const ACROSS = { window: { reach: 2.4, roof: 3.0, range: 70 }, noise: [1, 0.5, 0], blast: [1, 0.5, 0] };

// Upstairs is more dangerous (world/ringrise.js populate): a risen building's floor k (k >= 1) holds infected with chance
// infected.base + infected.perFloor * k (up to infected.max a floor), and a building of `sniper.minStoreys`+ storeys a
// rifleman on the roof (perched behind the parapet: he turns and shoots, never steps off) at sniper.share. A chunk wakes
// at most `cap` of them; free character slots are kept for the street.
export const DANGER = { infected: { base: 0.08, perFloor: 0.1, max: 2 }, sniper: { minStoreys: 4, share: 0.45, weapon: 'rifle', faction: 'raider', hp: 90 }, cap: 6, reserve: 32 };

// THE FACADE KIT (world/facades.js; docs/design/WEB_STOREYS.md §9.2): what dresses a storeyed building's outside. Every
// roll is the building's own (its id), so a building looks the same each time it is built.
//   window    each upper window bay's state: glass (a cracked pane left in the top of it), boarded (planks with a firing
//             slit at eye height: rounds and sight still pass the slit), blown (soot up the wall over it), open; lit: the
//             share of glass/open bays with a lamp behind them after dark (warm, never a light: an emissive pane)
//   ledge     a string course at every floor line (proud m, tall m); cornice: the top band
//   roof      water tank (towers of tankMin+ storeys), HVAC boxes, a sandbag nest (always on a sniper's roof)
//   damage    rebar-and-hole patches on a building (share; ruined: always), lean: a tin lean-to against a side wall at
//             street level; laundry: a line strung between two upper windows of a home
//   signs     a hand-painted sign over a shop's door (no brand names: plain trade words)
export const FACADE = {
  window: { glass: 0.34, boarded: 0.26, blown: 0.14, lit: 0.2 },
  ledge: { proud: 0.14, h: 0.16 }, cornice: { proud: 0.28, h: 0.4 },
  roof: { tankMin: 4, hvac: [1, 3], nest: 0.22 },
  damage: 0.32, lean: 0.3, laundry: 0.45,
  colors: {
    glass: '#3c4d55', board: ['#7a5a3a', '#6a4e32', '#8a6a44'], soot: '#1c1916', ledge: 0.82, cornice: 0.74, hvac: ['#8a8c86', '#6e726e', '#9a9488'],
    tank: ['#6a5a48', '#4e5a5a', '#7a6a58'], sand: ['#a8946a', '#9a8660', '#b4a078'], tin: ['#8a8a84', '#7a7e7a', '#9a8e76'], rebar: '#3a2e26',
    cloth: ['#c8b89a', '#b24a32', '#3f6a8a', '#d8d0bc', '#6a8a4a', '#c9963a', '#8a4a3a'], lit: '#d9822e',
  },
  signs: ['PAWN', 'GUNS', 'WATER', 'EAT', 'TIRES', 'LIQUOR', 'HOTEL', 'ROOMS', 'BAIL', 'PARTS', 'CASH', 'SALVAGE'],
};

// Upstairs is furnished from its own rows: crates and shelves become containers (inventory.js placeFurniture), a
// mattress is somewhere to sleep. per = one piece per this many m² of floor.
export const UPSTAIRS = { per: 60, crate: 0.4, shelf: 0.3, bed: 0.3 };

// The first floor of an island building with a stair hall (world/storeys.js quarters): living quarters, the keeper's in
// Rust Haven. The hall's partition goes on up with a doorway off the top landing (door: its gap, jamb: wall either side);
// the rest is a living room with the kitchen along its walls and, when the floor is long enough (bedroom / living: the
// least each needs along the hall), a bedroom beyond a second partition. Pieces from data/ring.js FURNITURE, placed by the
// ring's rules (world/furnish.js). The floors above that keep UPSTAIRS.
export const QUARTERS = {
  door: 1.9, jamb: 0.3, bedroom: 3.2, living: 4.0,
  living_list: ['fridge', 'stove', 'sink', 'kcounter', 'kcounter', 'couch', 'armchair', 'armchair', 'tv', 'rug', 'shelf'],
  bedroom_list: ['bed', 'nightstand', 'nightstand', 'dresser', 'rug', 'shelf', 'armchair'],
};
