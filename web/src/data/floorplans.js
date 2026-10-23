// FLOOR PLANS as rows (docs/design/WEB_FLOORPLANS.md): what rooms a ring building has, at what sizes, and what stands in
// them. world/floorplan.js turns a footprint + a kind into typed rooms and partition walls from these rows; world/ring.js
// builds the walls, doors, windows and furniture. Change a row here, not the code. No purple (hue 270-320 is banned).
//
// ROOMS: one row per room type.
//   min     the smallest it may be, interior metres, on both axes (a bedroom fits a double bed and a walk round it)
//   max     the most it grows along the axis it was split on (a bathroom stays a bathroom); fix: exactly this wide
//           along that axis (a hall: 1.3 m clear, its centre on a nav cell's centre so the 1 m grid routes down it)
//   grow    its share of the space left over once every room has its minimum
//   entry   the front door opens into it (one per unit)
//   via     the room types its doorway may open onto, best first: a bedroom off the hall, else the living room; never off
//           the kitchen. The plan is a spanning tree from the entry room, so every room is reached through doorways
//   back    a back door may go in its outside wall (lower = preferred: the kitchen's, then the end of the hall)
//   floor   a floor finish laid over the building's floor (tile, linoleum, carpet) so the room reads from above; null:
//           the building's own floor (boards)
//   loot    the table its containers roll when the piece has none of its own
//   stay    residents spend their day here (not the hall or the bathroom)
//   furniture [kind, min, max]: pieces from FURNITURE, placed against the walls in this order (`centre: true` rows stand
//           in the middle: a rug, a dining table). A bedroom's `bed` is a double in the unit's biggest bedroom, a single
//           in the others
export const ROOMS = {
  living: { name: 'LIVING ROOM', min: 4.0, grow: 3, entry: true, back: 4, floor: null, stay: true,
    furniture: [['couch', 1, 1], ['rug', 1, 1], ['tv', 1, 1], ['armchair', 1, 2], ['shelf', 0, 1]] },
  kitchen: { name: 'KITCHEN', min: 3.0, max: 4.6, grow: 1.4, via: ['living', 'dining', 'hall'], back: 1, floor: '#b3a582', loot: 'kitchen', stay: true,
    furniture: [['fridge', 1, 1], ['stove', 1, 1], ['sink', 1, 1], ['kcounter', 1, 2], ['table', 0, 1]] },
  dining: { name: 'DINING ROOM', min: 3.4, max: 4.4, grow: 1, via: ['living', 'kitchen'], back: 3, floor: null, loot: 'kitchen', stay: true,
    furniture: [['dtable', 1, 1], ['shelf', 0, 1]] },
  bedroom: { name: 'BEDROOM', min: 3.0, max: 4.6, grow: 1.5, via: ['hall', 'living'], floor: '#8a7062', loot: 'bedroom', stay: true,
    furniture: [['bed', 1, 1], ['nightstand', 1, 2], ['dresser', 1, 1]] },
  bath: { name: 'BATHROOM', min: 2.4, max: 2.9, grow: 0.2, via: ['hall', 'living', 'bedroom'], floor: '#bdbdb4', loot: 'bathroom',
    furniture: [['tub', 1, 1], ['toilet', 1, 1], ['vanity', 1, 1]] },
  hall: { name: 'HALL', min: 2.6, fix: 1.3, grow: 0, via: ['living', 'hall'], back: 2, floor: null, furniture: [] },
  // Shops and diners.
  floor: { name: 'SHOP FLOOR', min: 5.0, grow: 3, entry: true, back: 3, floor: null, stay: true,
    furniture: [['rack', 2, 3], ['crate', 1, 3], ['bench', 0, 1]] },
  sales: { name: 'SALES FLOOR', min: 4.0, grow: 3, entry: true, back: 4, floor: null, stay: true,
    furniture: [['counter', 1, 1], ['shelf', 3, 5], ['crate', 0, 1]] },
  diningroom: { name: 'DINING ROOM', min: 5.0, grow: 3, entry: true, back: 4, floor: '#a89c84', stay: true,
    furniture: [['counter', 1, 1], ['booth', 2, 4], ['shelf', 0, 1]] },
  stock: { name: 'STOCK ROOM', min: 2.6, max: 6, grow: 1, via: ['floor', 'sales', 'kitchen', 'hall', 'diningroom'], back: 1, floor: '#7e7a72', stay: true,
    furniture: [['rack', 1, 2], ['crate', 1, 2]] },
  restroom: { name: 'RESTROOM', min: 2.0, max: 2.6, grow: 0.2, via: ['hall', 'sales', 'floor', 'diningroom', 'stock', 'office'], floor: '#bdbdb4', loot: 'bathroom',
    furniture: [['toilet', 1, 1], ['vanity', 1, 1]] },
  office: { name: 'OFFICE', min: 2.6, max: 4.4, grow: 0.6, via: ['floor', 'sales', 'diningroom', 'stock', 'hall'], back: 5, floor: '#7a786e', loot: 'office', stay: true,
    furniture: [['desk', 1, 1], ['cabinet', 0, 1], ['shelf', 0, 1]] },
  dkitchen: { name: 'KITCHEN', min: 3.0, max: 6, grow: 1.2, via: ['diningroom'], back: 1, floor: '#b3a582', loot: 'kitchen', stay: true,
    furniture: [['stove', 1, 2], ['fridge', 1, 1], ['sink', 1, 1], ['kcounter', 1, 2], ['rack', 0, 1]] },
};

// PLANS: per building kind, the layouts it may take, as slicing trees in the building's own frame: u runs along the front
// wall (from the end the entry room sits at; the plan is mirrored at random), v from the front wall to the back.
// ['u', a, b, ...] lays a, b side by side along u; ['v', a, b, ...] front to back; a string is a room (ROOMS). A plan
// that does not fit the footprint at the rooms' minimums, or whose rooms cannot all be reached through doorways by the
// `via` rules, is skipped; a fitting one is picked by weight. `units` buildings plan each unit on its own.
//
// Why these: an American ranch house of 90-130 m2 opens into a living room with the kitchen behind or beside it (the
// kitchen keeps the back door), the bedrooms and the bath down a short hall. 'side' runs the hall front to back between
// the day rooms and the bedrooms (the common shallow ranch); 'across' runs it along the house between the day rooms at the
// front and the bedrooms and bath across the back (deep lots); 'compact' is the one-bedroom fallback with no hall.
export const PLANS = {
  house: [
    { id: 'side-3bed', w: 3, tree: ['u', ['v', 'living', ['u', 'kitchen', 'bedroom']], 'hall', ['v', 'bedroom', 'bath', 'bedroom']] },
    { id: 'across-3bed', w: 2, tree: ['v', ['u', 'living', 'kitchen'], 'hall', ['u', 'bedroom', 'bath', 'bedroom', 'bedroom']] },
    { id: 'side-2bed', w: 4, tree: ['u', ['v', 'living', ['u', 'kitchen', 'bath']], 'hall', ['v', 'bedroom', 'bedroom']] },
    { id: 'across-2bed', w: 3, tree: ['v', ['u', 'living', 'kitchen'], 'hall', ['u', 'bedroom', 'bath', 'bedroom']] },
    { id: 'compact-1bed', w: 0.2, tree: ['v', ['u', 'living', 'kitchen'], ['u', 'bedroom', 'bath']] },
  ],
  bungalow: [
    { id: 'side-2bed-dining', w: 2, tree: ['u', ['v', 'living', ['u', 'kitchen', 'dining']], 'hall', ['v', 'bedroom', 'bath', 'bedroom']] },
    { id: 'across-3bed-dining', w: 3, tree: ['v', ['u', 'living', 'dining', 'kitchen'], 'hall', ['u', 'bedroom', 'bath', 'bedroom', 'bedroom']] },
    { id: 'side-3bed', w: 2, tree: ['u', ['v', 'living', ['u', 'kitchen', 'bedroom']], 'hall', ['v', 'bedroom', 'bath', 'bedroom']] },
    { id: 'across-3bed', w: 2, tree: ['v', ['u', 'living', 'kitchen'], 'hall', ['u', 'bedroom', 'bath', 'bedroom', 'bedroom']] },
    { id: 'side-2bed', w: 0.5, tree: ['u', ['v', 'living', ['u', 'kitchen', 'bath']], 'hall', ['v', 'bedroom', 'bedroom']] },
    { id: 'compact-1bed', w: 0.1, tree: ['v', ['u', 'living', 'kitchen'], ['u', 'bedroom', 'bath']] },
  ],
  duplex: [ // each unit: a one- or two-bedroom flat of its own
    { id: 'unit-2bed-across', w: 3, tree: ['v', ['u', 'living', 'kitchen'], 'hall', ['u', 'bedroom', 'bath', 'bedroom']] },
    { id: 'unit-2bed-side', w: 3, tree: ['u', ['v', 'living', 'kitchen'], 'hall', ['v', 'bedroom', 'bath', 'bedroom']] },
    { id: 'unit-1bed', w: 1, tree: ['v', ['u', 'living', 'kitchen'], ['u', 'bedroom', 'bath']] },
  ],
  shop: [
    { id: 'workshop', w: 3, tree: ['v', 'floor', ['u', { max: 4.2 }, 'office', 'restroom', 'stock']] },
  ],
  gas: [
    { id: 'fuel-stop', w: 3, tree: ['v', 'sales', ['u', { max: 3.2 }, 'stock', 'restroom']] },
    { id: 'fuel-stop-office', w: 1, tree: ['v', 'sales', ['u', { max: 3.2 }, 'office', 'restroom', 'stock']] },
  ],
  diner: [
    { id: 'diner', w: 3, tree: ['v', 'diningroom', ['u', { max: 4.2 }, 'dkitchen', 'restroom', 'stock']] },
    { id: 'diner-office', w: 2, tree: ['v', 'diningroom', ['u', { max: 4.2 }, 'dkitchen', 'restroom', 'office']] },
  ],
  mall: [ // each unit: a shop floor with a stock room and a restroom behind
    { id: 'unit-stock', w: 3, tree: ['v', 'sales', ['u', { max: 3.6 }, 'stock', 'restroom']] },
  ],
};

// The plan's numbers. jamb: wall left either side of an inside doorway (metres); doorClear / frontClear: how far into a
// room a doorway keeps furniture out (inside / front and back doors); aisle: the floor kept clear in front of a piece
// against a wall (snug: a bedroom, kitchen or bathroom; open: the living room and the shops); jitter: how far a room's
// share of the spare space wanders (x 1 +- jitter).
export const PLAN_RULES = { jamb: 0.25, doorClear: 1.0, frontClear: 1.3, aisle: { snug: 0.85, open: 1.6 }, jitter: 0.3, sameWall: 0.04, cornerGap: 0.3, snug: ['bedroom', 'kitchen', 'dkitchen', 'bath', 'restroom', 'office', 'stock'] };
