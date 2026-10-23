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

  // ---- the Phoenix island (docs/design/WEB_FLOORPLANS.md "The island"): Rust Haven's rebuilt holdout and the Old Phoenix
  // ruins. Rows the ring never uses, so its plans do not move. A shopkeeper works in the front room and lives behind it
  // (quarters: kitchen, bedroom, bath, a sitting room when the building is wide) or above it (the STAIR HALL).
  stair: { name: 'STAIR HALL', min: 11.3, fix: 4.0, grow: 0, furniture: [], // a flight along its outside wall, ~2.5 m of hall beside it
    via: ['corridor', 'hall', 'qliving', 'qkitchen', 'backroom', 'lobby', 'waiting', 'living', 'kitchen', 'sales', 'gunshop', 'garage', 'watershop', 'studio', 'barroom', 'offices', 'ward', 'study', 'den', 'shack'] },
  corridor: { name: 'HALL', min: 2.6, fix: 1.3, grow: 0, back: 2, furniture: [],
    via: ['waiting', 'lobby', 'barroom', 'gunshop', 'garage', 'watershop', 'studio', 'sales', 'offices', 'backroom', 'corridor'] },
  // The clinic: a waiting room with the desk, exam rooms off the hall, a ward of cots, the pharmacy, Doc's office.
  waiting: { name: 'WAITING ROOM', min: 4.0, grow: 3, entry: true, back: 4, floor: '#c4bca6', stay: true,
    furniture: [['counter', 1, 1], ['seats', 3, 5], ['armchair', 0, 2], ['shelf', 0, 1]] },
  ward: { name: 'WARD', min: 4.0, grow: 2.2, via: ['corridor', 'waiting'], back: 3, floor: '#cfc9b9', loot: 'bathroom', stay: true,
    furniture: [['cot', 3, 6], ['medcab', 0, 1]] },
  exam: { name: 'EXAM ROOM', min: 3.0, max: 4.2, grow: 0.5, via: ['corridor', 'waiting'], floor: '#cfc9b9', loot: 'bathroom',
    furniture: [['extable', 1, 1], ['vanity', 1, 1], ['medcab', 1, 1], ['cabinet', 0, 1]] },
  pharmacy: { name: 'PHARMACY', min: 2.6, max: 4.4, grow: 0.9, via: ['waiting', 'corridor'], floor: '#c4bca6', loot: 'bathroom', stay: true,
    furniture: [['shelf', 2, 4], ['medcab', 0, 1]] },
  study: { name: 'OFFICE', min: 2.6, max: 4.4, grow: 0.5, via: ['corridor', 'waiting', 'lobby', 'sales', 'offices', 'backroom'], back: 5, floor: '#7a786e', loot: 'office', stay: true,
    furniture: [['desk', 1, 1], ['cabinet', 0, 1], ['shelf', 0, 1]] },
  wc: { name: 'RESTROOM', min: 2.4, max: 2.8, grow: 0.2, via: ['corridor', 'waiting', 'barroom', 'lobby', 'sales', 'offices', 'backroom', 'study'], floor: '#bdbdb4', loot: 'bathroom',
    furniture: [['toilet', 1, 1], ['vanity', 1, 1]] },
  // Rust Haven's working front rooms (the shopkeeper's counter faces the door).
  gunshop: { name: 'GUN SHOP', min: 5.0, grow: 3, entry: true, back: 4, floor: '#8a7660', stay: true,
    furniture: [['counter', 1, 1], ['gunrack', 2, 4], ['workbench', 1, 1], ['shelf', 1, 2], ['crate', 1, 2]] },
  garage: { name: 'GARAGE', min: 5.0, grow: 3, entry: true, back: 3, floor: '#8e8a80', stay: true,
    furniture: [['workbench', 1, 2], ['tyres', 2, 4], ['rack', 1, 2], ['crate', 1, 3], ['shelf', 0, 1]] },
  watershop: { name: 'WATER SHOP', min: 5.0, grow: 3, entry: true, back: 4, floor: '#a89c84', stay: true,
    furniture: [['counter', 1, 1], ['tank', 3, 5], ['crate', 1, 2], ['shelf', 0, 1]] },
  studio: { name: 'STUDIO', min: 5.0, grow: 3, entry: true, back: 4, floor: '#6e5a4a', stay: true,
    furniture: [['console', 1, 1], ['records', 2, 4], ['couch', 1, 1], ['armchair', 1, 2], ['rug', 1, 1], ['shelf', 0, 1]] },
  backroom: { name: 'STOCK ROOM', min: 2.6, grow: 0.7, back: 1, floor: '#7e7a72', stay: true,
    via: ['gunshop', 'garage', 'watershop', 'studio', 'sales', 'barroom', 'offices', 'corridor', 'ckitchen', 'qkitchen', 'lobby'],
    furniture: [['rack', 1, 2], ['crate', 1, 3], ['shelf', 0, 1]] },
  // Where they live: behind the shop, off its own hall.
  qkitchen: { name: 'KITCHEN', min: 3.0, max: 4.6, grow: 1.2, via: ['corridor', 'qliving', 'backroom', 'lobby'], back: 1, floor: '#b3a582', loot: 'kitchen', stay: true,
    furniture: [['fridge', 1, 1], ['stove', 1, 1], ['sink', 1, 1], ['kcounter', 1, 2], ['table', 0, 1]] },
  qbed: { name: 'BEDROOM', min: 3.0, max: 4.6, grow: 1.0, via: ['corridor', 'qliving'], floor: '#8a7062', loot: 'bedroom', stay: true,
    furniture: [['bed', 1, 1], ['nightstand', 1, 2], ['dresser', 1, 1]] },
  qbath: { name: 'BATHROOM', min: 2.4, max: 2.9, grow: 0.2, via: ['corridor', 'qbed', 'qliving'], floor: '#bdbdb4', loot: 'bathroom',
    furniture: [['tub', 1, 1], ['toilet', 1, 1], ['vanity', 1, 1]] },
  qliving: { name: 'LIVING ROOM', min: 3.5, grow: 2, via: ['corridor', 'lobby', 'backroom'], floor: null, stay: true,
    furniture: [['couch', 1, 1], ['armchair', 1, 2], ['rug', 0, 1], ['shelf', 0, 1]] },
  // The cantina: the bar room, its kitchen, stock and a restroom.
  barroom: { name: 'BAR ROOM', min: 5.0, grow: 3, entry: true, back: 4, floor: '#9a8466', stay: true,
    furniture: [['bar', 1, 1], ['booth', 3, 5], ['ctable', 1, 1], ['shelf', 1, 1]] },
  ckitchen: { name: 'KITCHEN', min: 3.0, max: 7.0, grow: 1.6, via: ['barroom', 'corridor'], back: 1, floor: '#b3a582', loot: 'kitchen', stay: true,
    furniture: [['stove', 1, 2], ['fridge', 1, 1], ['sink', 1, 1], ['kcounter', 1, 2]] },
  // A boarding house: the lobby with its desk, a hall of rooms to let, a shared bath, a kitchen and a parlour.
  lobby: { name: 'LOBBY', min: 4.0, grow: 3, entry: true, back: 4, floor: null, stay: true,
    furniture: [['counter', 1, 1], ['armchair', 1, 2], ['bench', 0, 1], ['shelf', 0, 1]] },
  cell: { name: 'ROOM', min: 2.8, max: 3.6, grow: 0.5, via: ['corridor'], floor: '#8a7062', loot: 'bedroom', stay: true,
    furniture: [['sbed', 1, 1], ['nightstand', 1, 1], ['dresser', 0, 1]] },
  sbath: { name: 'SHARED BATH', min: 2.6, max: 4.0, grow: 0.4, via: ['corridor'], floor: '#bdbdb4', loot: 'bathroom',
    furniture: [['toilet', 2, 2], ['vanity', 1, 2], ['tub', 0, 1]] },
  // The ruins: old Phoenix offices and the odd shack out in the flats.
  offices: { name: 'OFFICE FLOOR', min: 5.0, grow: 3, entry: true, back: 4, floor: '#7a786e', stay: true,
    furniture: [['desk', 2, 4], ['cabinet', 1, 3], ['shelf', 0, 1]] },
  den: { name: 'FAMILY ROOM', min: 3.5, grow: 2, via: ['living', 'kitchen', 'hall'], floor: null, stay: true,
    furniture: [['couch', 1, 1], ['tv', 1, 1], ['armchair', 0, 1], ['shelf', 0, 1]] },
  shack: { name: 'SHACK', min: 3.5, grow: 2, entry: true, back: 2, floor: null, stay: true,
    furniture: [['mattress', 1, 1], ['stove', 0, 1], ['table', 0, 1], ['crate', 1, 2], ['shelf', 0, 1]] },
  shackback: { name: 'BACK ROOM', min: 2.6, max: 4.0, grow: 0.6, via: ['shack'], back: 1, floor: null, stay: true,
    furniture: [['mattress', 0, 1], ['crate', 1, 2]] },
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

  // ---- the Phoenix island (WEB_FLOORPLANS.md "The island"). Rust Haven's buildings are 16-24 x 14-22 m and the ruins
  // 13-24 x 12-22, so a row may say what footprint it is for (size: interior metres along u and v, a stair hall's 4 m
  // left out); { max } on a column caps how wide it grows, so the rooms that must stay room-sized (a bedroom, a bath, an
  // exam room) do, and the big public room takes the spare metres.
  clinic: [
    { id: 'clinic-side', w: 3, size: { u: [0, 14.5] }, tree: ['u', ['v', 'waiting', 'study', 'ward'], 'corridor', ['v', { max: 4.4 }, 'pharmacy', 'exam', 'exam', 'wc']] },
    { id: 'clinic-wide', w: 3, size: { u: [12.4, 99] }, tree: ['u', ['v', ['u', 'study', 'waiting'], 'ward'], 'corridor', ['v', { max: 4.4 }, 'pharmacy', 'exam', 'exam', 'wc']] },
  ],
  // A shop and the keeper's quarters behind it, off their own hall (gunsmith, mechanic, water trader, radio): FRONT is the
  // programme's own front room (FRONTS below). A deep shop keeps an office behind its stock room.
  quarters: [
    { id: 'shop-quarters', w: 3, size: { u: [0, 13.6], v: [0, 17] }, tree: ['v', ['u', 'FRONT', 'backroom'], 'corridor', ['u', { max: 4.8 }, 'qkitchen', 'qbath', 'qbed']] },
    { id: 'shop-quarters-wide', w: 3, size: { u: [13.4, 99], v: [0, 17] }, tree: ['v', ['u', 'FRONT', 'backroom'], 'corridor', ['u', { max: 4.8 }, 'qkitchen', 'qbath', 'qbed', 'qliving']] },
    { id: 'shop-quarters-deep', w: 3, size: { u: [0, 13.6], v: [16.5, 99] }, tree: ['v', ['u', 'FRONT', ['v', { max: 4.6 }, 'backroom', 'study']], 'corridor', ['u', { max: 4.8 }, 'qkitchen', 'qbath', 'qbed']] },
    { id: 'shop-quarters-wide-deep', w: 3, size: { u: [13.4, 99], v: [16.5, 99] }, tree: ['v', ['u', 'FRONT', ['v', { max: 4.6 }, 'backroom', 'study']], 'corridor', ['u', { max: 4.8 }, 'qkitchen', 'qbath', 'qbed', 'qliving']] },
  ],
  store: [
    { id: 'store', w: 3, size: { u: [0, 15] }, tree: ['v', 'sales', ['u', { max: 5.0 }, 'backroom', 'wc', 'study']] },
    { id: 'store-wide', w: 3, size: { u: [14, 99] }, tree: ['v', 'sales', ['u', { max: 5.0 }, 'backroom', 'wc', 'study', 'backroom']] },
  ],
  cantina: [
    { id: 'cantina', w: 3, tree: ['v', 'barroom', ['u', { max: 5.0 }, 'ckitchen', 'wc', 'backroom']] },
  ],
  boarding: [
    { id: 'boarding-3', w: 3, size: { u: [0, 12.6], v: [12.4, 16.2] }, tree: ['u', ['v', 'lobby', 'qkitchen'], 'corridor', ['v', { max: 3.8 }, 'cell', 'sbath', 'cell', 'cell']] },
    { id: 'boarding-4-narrow', w: 3, size: { u: [0, 12.6], v: [15.6, 19.6] }, tree: ['u', ['v', 'lobby', 'qkitchen'], 'corridor', ['v', { max: 3.8 }, 'cell', 'cell', 'sbath', 'cell', 'cell']] },
    { id: 'boarding-5-narrow', w: 3, size: { u: [0, 12.6], v: [18.9, 99] }, tree: ['u', ['v', 'lobby', 'qkitchen'], 'corridor', ['v', { max: 3.8 }, 'cell', 'cell', 'sbath', 'cell', 'cell', 'cell']] },
    { id: 'boarding-4', w: 3, size: { u: [12, 99], v: [15.6, 19.6] }, tree: ['u', ['v', 'lobby', ['u', 'qliving', 'qkitchen']], 'corridor', ['v', { max: 3.8 }, 'cell', 'cell', 'sbath', 'cell', 'cell']] },
    { id: 'boarding-5', w: 3, size: { u: [12, 99], v: [18.9, 99] }, tree: ['u', ['v', 'lobby', ['u', 'qliving', 'qkitchen']], 'corridor', ['v', { max: 3.8 }, 'cell', 'cell', 'sbath', 'cell', 'cell', 'cell']] },
    { id: 'boarding-across', w: 3, size: { u: [0, 16], v: [0, 15.8] }, tree: ['v', ['u', 'lobby', 'qkitchen'], 'corridor', ['u', { max: 3.8 }, 'cell', 'cell', 'sbath', 'cell']] },
    { id: 'boarding-across-wide', w: 3, size: { u: [15.5, 99], v: [0, 15.8] }, tree: ['v', ['u', 'lobby', 'qkitchen'], 'corridor', ['u', { max: 3.8 }, 'cell', 'cell', 'sbath', 'cell', 'cell']] },
  ],
  // The ruins: houses, offices and shops of the old city. A wide house has a family room beside its kitchen.
  rhouse: [
    { id: 'old-house-2bed', w: 3, size: { u: [0, 15.5], v: [0, 13.6] }, tree: ['u', ['v', 'living', 'kitchen'], 'hall', ['v', { max: 4.6 }, 'bedroom', 'bath', 'bedroom']] },
    { id: 'old-house-3bed', w: 3, size: { u: [0, 15.5], v: [12.8, 18.6] }, tree: ['u', ['v', 'living', 'kitchen'], 'hall', ['v', { max: 4.6 }, 'bedroom', 'bath', 'bedroom', 'bedroom']] },
    { id: 'old-house-4bed', w: 3, size: { u: [0, 15.5], v: [16.4, 99] }, tree: ['u', ['v', 'living', 'kitchen'], 'hall', ['v', { max: 4.6 }, 'bedroom', 'bedroom', 'bath', 'bedroom', 'bedroom']] },
    { id: 'old-house-2bed-den', w: 3, size: { u: [14.5, 99], v: [0, 13.6] }, tree: ['u', ['v', 'living', ['u', 'den', 'kitchen']], 'hall', ['v', { max: 4.6 }, 'bedroom', 'bath', 'bedroom']] },
    { id: 'old-house-3bed-den', w: 3, size: { u: [14.5, 99], v: [12.8, 18.6] }, tree: ['u', ['v', 'living', ['u', 'den', 'kitchen']], 'hall', ['v', { max: 4.6 }, 'bedroom', 'bath', 'bedroom', 'bedroom']] },
    { id: 'old-house-4bed-den', w: 3, size: { u: [14.5, 99], v: [16.4, 99] }, tree: ['u', ['v', 'living', ['u', 'den', 'kitchen']], 'hall', ['v', { max: 4.6 }, 'bedroom', 'bedroom', 'bath', 'bedroom', 'bedroom']] },
  ],
  roffice: [
    { id: 'old-office-small', w: 3, size: { v: [0, 12.4] }, tree: ['u', 'offices', 'corridor', ['v', { max: 4.4 }, 'study', 'wc', 'backroom']] },
    { id: 'old-office', w: 3, size: { v: [11.7, 99] }, tree: ['u', 'offices', 'corridor', ['v', { max: 4.4 }, 'study', 'study', 'wc', 'backroom']] },
  ],
  rshop: [
    { id: 'old-shop', w: 3, size: { u: [0, 15] }, tree: ['v', 'sales', ['u', { max: 5.0 }, 'backroom', 'wc', 'study']] },
    { id: 'old-shop-wide', w: 3, size: { u: [14, 99] }, tree: ['v', 'sales', ['u', { max: 5.0 }, 'backroom', 'wc', 'study', 'backroom']] },
  ],
  shack: [
    { id: 'shack-two', w: 3, tree: ['v', 'shack', 'shackback'] },
    { id: 'shack-one', w: 1, tree: 'shack' },
  ],
};
// What the island's enterable buildings are (world/city.js makeEnterable). Rust Haven's twelve by their shop index, the
// way data/npcs.js `where: 'shop:N'` puts the named keepers in them: 0 Doc Reyes's clinic (the respawn point), 1 Ike the
// gunsmith, 2 Kenji the mechanic, 3 Mags the water trader, 4 STATIC 1660 AM; 5-11 have no keeper. The ruins roll theirs
// (by weight, from the building's own seed); a shack out in the flats is a shack.
//   name   what the HUD calls it on the way in (a keeper's own title wins)   loot  its containers' table when the room
//   has none of its own (a named shop's working rooms keep inventory.js SHOP_LOOT)
export const PROGRAMMES = {
  shops: ['clinic', 'gunsmith', 'mechanic', 'water', 'radio', 'store', 'cantina', 'boarding', 'boarding', 'store', 'boarding', 'cantina'],
  names: { 5: 'TRADING POST', 9: 'GENERAL STORE' },
  rows: {
    clinic: { name: 'CLINIC', loot: 'bathroom' }, gunsmith: { name: 'GUNSMITH', loot: 'gunsmith' }, mechanic: { name: 'GARAGE', loot: 'garage' },
    water: { name: 'WATER TRADER', loot: 'kitchen' }, radio: { name: 'RADIO STATION', loot: 'office' }, store: { name: 'STORE', loot: 'storefront' },
    cantina: { name: 'CANTINA', loot: 'kitchen' }, boarding: { name: 'BOARDING HOUSE', loot: 'bedroom' },
    rhouse: { name: 'OLD HOUSE', loot: 'bedroom' }, roffice: { name: 'OLD OFFICES', loot: 'office' }, rshop: { name: 'OLD SHOP', loot: 'storefront' }, shack: { name: 'SHACK', loot: 'kitchen' },
  },
  ruins: [['rhouse', 5], ['roffice', 2.5], ['rshop', 2.5]],
  lose: 0.35, // a ruin's chance of losing each partition (its doorway goes with it: nothing is sealed)
  working: ['waiting', 'ward', 'exam', 'pharmacy', 'gunshop', 'garage', 'watershop', 'studio', 'sales', 'backroom', 'barroom', 'lobby'], // a keeper's shop rooms (SHOP_LOOT)
};
// The island's big public rooms fill their middles too (the walls' pieces alone left a bar room or a lobby a bare floor
// from above): pieces on a grid `every` metres apart, `inset` in from the walls, at most `max`, each proved on the nav
// probe like the rest (world/city.js). [kind, every, inset, max]
export const SCATTER = {
  barroom: ['ctable', 3.6, 2.4, 6], lobby: ['ctable', 4.0, 2.4, 2], waiting: ['bench', 3.4, 2.2, 4],
  sales: ['gondola', 3.4, 2.4, 6], offices: ['desk', 3.0, 2.2, 8], garage: ['tyres', 4.0, 2.4, 2], qliving: ['ctable', 3.6, 2.2, 1],
  gunshop: ['counter', 3.6, 2.4, 2], watershop: ['tank', 3.6, 2.4, 2], studio: ['ctable', 4.0, 2.4, 1],
};
// The island's front rooms for the 'quarters' plans (the FRONT slot), by programme: each gets its own plan rows.
export const FRONTS = { gunsmith: 'gunshop', mechanic: 'garage', water: 'watershop', radio: 'studio' };
{
  const swap = (t, room) => (t === 'FRONT' ? room : Array.isArray(t) ? t.map((x) => swap(x, room)) : t);
  for (const [prog, room] of Object.entries(FRONTS)) PLANS[prog] = PLANS.quarters.map((P) => ({ ...P, id: P.id.replace('shop', prog), tree: swap(P.tree, room) }));
  delete PLANS.quarters;
}

// The plan's numbers. jamb: wall left either side of an inside doorway (metres); doorClear / frontClear: how far into a
// room a doorway keeps furniture out (inside / front and back doors); aisle: the floor kept clear in front of a piece
// against a wall (snug: a bedroom, kitchen or bathroom; open: the living room and the shops); jitter: how far a room's
// share of the spare space wanders (x 1 +- jitter).
export const PLAN_RULES = { jamb: 0.25, doorClear: 1.0, frontClear: 1.3, aisle: { snug: 0.85, open: 1.6 }, jitter: 0.3, sameWall: 0.04, cornerGap: 0.3, snug: ['bedroom', 'kitchen', 'dkitchen', 'bath', 'restroom', 'office', 'stock',
  // the island's (rows the ring never uses: its plans do not move)
  'exam', 'pharmacy', 'study', 'wc', 'backroom', 'qkitchen', 'qbed', 'qbath', 'ckitchen', 'cell', 'sbath', 'shackback'] };
