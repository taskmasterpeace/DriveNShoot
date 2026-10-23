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
  ruins: { share: 0.45, storeys: [1, 3], minArea: 220 }, // the Glass Flats' blocks: two to four storeys of rooms to clear
};

// Upstairs is furnished from its own rows: crates and shelves become containers (inventory.js placeFurniture), a
// mattress is somewhere to sleep. per = one piece per this many m² of floor.
export const UPSTAIRS = { per: 60, crate: 0.4, shelf: 0.3, bed: 0.3 };
