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

// ==== BIG BUILDINGS (the Building Lab, docs/design/WEB_BUILDING_LAB.md) ================================================
// Corridors, offices, classrooms, motel rooms, a warehouse with a mezzanine, a hospital ward. None of these kinds is
// generated by the ring (no ZONES row names them): the Building Lab (web/lab.html) lays them out from these rows, and an
// authored building (world/authored.js) can stand one anywhere in the ring. Added after the rows above, never over one: a
// key that already exists is left alone (a console warning), so no existing plan's output can move.
// Real sizes: corridors 1.8 m (offices) and 2.4 m (a school, a ward: two beds pass), classrooms about 9 x 7 m, a motel
// room about 4 x 8 m with its bath behind, a ward room 4-6 m for two beds.
const BIG_ROOMS = {
  corr18: { name: 'CORRIDOR', min: 2.6, fix: 1.8, grow: 0, via: ['officelobby', 'frontdesk', 'schoollobby', 'corr18', 'corr24'], back: 2, floor: '#8e877a', furniture: [] },
  corr24: { name: 'CORRIDOR', min: 2.6, fix: 2.4, grow: 0, via: ['schoollobby', 'frontdesk', 'officelobby', 'corr24', 'corr18'], back: 2, floor: '#8e877a', furniture: [] },
  officelobby: { name: 'LOBBY', min: 4.0, max: 8.0, grow: 1.2, entry: true, back: 6, floor: '#9a9284', stay: true,
    furniture: [['counter', 1, 1], ['armchair', 2, 3], ['shelf', 0, 1]] },
  officecell: { name: 'OFFICE', min: 3.0, max: 5.2, grow: 1, via: ['corr18', 'corr24', 'officelobby'], back: 6, floor: '#7a786e', loot: 'office', stay: true,
    furniture: [['desk', 1, 1], ['cabinet', 1, 2], ['shelf', 0, 1]] },
  breakroom: { name: 'BREAK ROOM', min: 3.0, max: 5.5, grow: 0.8, via: ['corr18', 'corr24', 'officelobby'], back: 3, floor: '#b3a582', loot: 'kitchen', stay: true,
    furniture: [['fridge', 1, 1], ['sink', 1, 1], ['kcounter', 1, 1], ['table', 1, 1]] },
  washroom: { name: 'RESTROOM', min: 2.4, max: 3.4, grow: 0.2, via: ['corr18', 'corr24', 'officelobby', 'schoollobby', 'frontdesk'], floor: '#bdbdb4', loot: 'bathroom',
    furniture: [['toilet', 2, 3], ['vanity', 1, 2]] },
  supply: { name: 'SUPPLY ROOM', min: 2.4, max: 4.4, grow: 0.5, via: ['corr24', 'corr18', 'frontdesk', 'officelobby', 'schoollobby'], back: 1, floor: '#7e7a72', stay: true,
    furniture: [['shelf', 1, 3], ['crate', 0, 1]] },
  schoollobby: { name: 'ENTRANCE HALL', min: 4.0, max: 7.0, grow: 1, entry: true, back: 6, floor: '#9a9284', stay: true,
    furniture: [['bench', 1, 2], ['shelf', 0, 1]] },
  classroom: { name: 'CLASSROOM', min: 6.8, max: 9.6, grow: 1, via: ['corr24', 'corr18'], back: 6, floor: '#9a8a6a', loot: 'office', stay: true,
    furniture: [['deskrows', 1, 1], ['desk', 1, 1], ['shelf', 1, 2], ['cabinet', 0, 1]] },
  staffroom: { name: 'STAFF ROOM', min: 3.0, max: 5.5, grow: 0.8, via: ['schoollobby', 'corr24', 'corr18'], back: 3, floor: '#7a786e', loot: 'office', stay: true,
    furniture: [['table', 1, 1], ['kcounter', 1, 1], ['fridge', 0, 1], ['cabinet', 0, 1]] },
  motelroom: { name: 'MOTEL ROOM', min: 3.4, max: 4.4, grow: 1, entry: true, back: 5, floor: '#8a7062', loot: 'bedroom', stay: true,
    furniture: [['dbed', 1, 1], ['nightstand', 1, 1], ['dresser', 1, 1], ['tv', 0, 1]] },
  motelbath: { name: 'BATHROOM', min: 2.0, max: 2.6, grow: 0.2, via: ['motelroom'], floor: '#bdbdb4', loot: 'bathroom',
    furniture: [['tub', 1, 1], ['toilet', 1, 1], ['vanity', 1, 1]] },
  frontdesk: { name: 'RECEPTION', min: 4.0, max: 8.0, grow: 1.2, entry: true, back: 6, floor: '#bdbdb4', stay: true,
    furniture: [['counter', 1, 1], ['armchair', 2, 4], ['cabinet', 0, 1]] },
  wardroom: { name: 'WARD', min: 3.8, max: 6.0, grow: 1, via: ['corr24', 'corr18'], back: 6, floor: '#c4c2b6', loot: 'bathroom', stay: true,
    furniture: [['bed', 2, 2], ['nightstand', 1, 2], ['cabinet', 0, 1]] },
  nursestation: { name: 'NURSES\' STATION', min: 3.0, max: 5.0, grow: 0.6, via: ['corr24', 'corr18', 'frontdesk'], back: 4, floor: '#c4c2b6', loot: 'bathroom', stay: true,
    furniture: [['counter', 1, 1], ['cabinet', 1, 2], ['desk', 0, 1]] },
  treatment: { name: 'TREATMENT ROOM', min: 3.2, max: 5.5, grow: 0.8, via: ['frontdesk', 'corr24', 'corr18'], floor: '#c4c2b6', loot: 'bathroom',
    furniture: [['bed', 1, 1], ['vanity', 1, 1], ['cabinet', 1, 1]] },
  mezzanine: { name: 'MEZZANINE', min: 3.0, grow: 1, floor: null, stay: true, furniture: [['rack', 2, 4], ['crate', 1, 3]] },
  // The rooms with no `max`: when every other room in a row is at its biggest, the spare metres go here (an open-plan
  // office, a library, a day room) rather than into a 20 m lobby or an 18 m classroom.
  officeopen: { name: 'OPEN OFFICE', min: 4.0, grow: 0.6, via: ['corr18', 'corr24', 'officelobby'], back: 6, floor: '#7a786e', loot: 'office', stay: true,
    furniture: [['desk', 2, 6], ['cabinet', 1, 3], ['shelf', 0, 2]] },
  library: { name: 'LIBRARY', min: 6.8, grow: 0.5, via: ['corr24', 'corr18', 'schoollobby'], back: 6, floor: '#8a7062', loot: 'office', stay: true,
    furniture: [['shelf', 3, 6], ['dtable', 1, 1], ['desk', 0, 1]] },
  artroom: { name: 'ART ROOM', min: 6.8, grow: 0.5, via: ['corr24', 'corr18', 'schoollobby'], back: 6, floor: '#9a8a6a', loot: 'office', stay: true,
    furniture: [['dtable', 1, 1], ['sink', 1, 1], ['kcounter', 1, 2], ['shelf', 1, 2]] },
  dayroom: { name: 'DAY ROOM', min: 3.8, grow: 0.5, via: ['corr24', 'corr18', 'frontdesk'], back: 6, floor: '#a89c84', stay: true,
    furniture: [['couch', 1, 1], ['armchair', 2, 4], ['tv', 0, 1], ['table', 0, 1]] },
};
// up: floors above the street storey a generated plan comes with (the lab reads it; floorplan() does not): deck 'back' is
// a mezzanine over the rooms behind the front room, one room of `room` type, reached by a flight from the front room.
const BIG_PLANS = {
  offices: [ // a corridor along the building, offices off both sides; the lobby holds the front door
    { id: 'offices-4x2', w: 2, tree: ['v', ['u', 'officecell', 'officelobby', 'officecell', 'officeopen'], 'corr18', ['u', 'officecell', 'breakroom', 'washroom', 'officecell', 'officeopen']] },
    { id: 'offices-6x2', w: 3, tree: ['v', ['u', 'officecell', 'officecell', 'officelobby', 'officecell', 'officecell', 'officeopen'], 'corr18', ['u', 'officecell', 'officecell', 'breakroom', 'washroom', 'washroom', 'officecell', 'officeopen']] },
    { id: 'offices-8x2', w: 2, tree: ['v', ['u', 'officecell', 'officecell', 'officecell', 'officelobby', 'officecell', 'officecell', 'officecell', 'officeopen'], 'corr18', ['u', 'officecell', 'officecell', 'officecell', 'breakroom', 'washroom', 'washroom', 'supply', 'officecell', 'officecell', 'officeopen']] },
  ],
  school: [ // a wing: the entrance hall across the front, a 2.4 m hall running back from it, classrooms off both sides
    { id: 'wing-4', w: 2, tree: ['v', ['u', 'washroom', 'schoollobby', 'staffroom'], ['u', ['v', 'classroom', 'artroom'], 'corr24', ['v', 'classroom', 'library']]] },
    { id: 'wing-6', w: 3, tree: ['v', ['u', 'washroom', 'schoollobby', 'staffroom'], ['u', ['v', 'classroom', 'classroom', 'artroom'], 'corr24', ['v', 'classroom', 'classroom', 'library']]] },
    { id: 'wing-8', w: 2, tree: ['v', ['u', 'washroom', 'schoollobby', 'staffroom'], ['u', ['v', 'classroom', 'classroom', 'classroom', 'artroom'], 'corr24', ['v', 'classroom', 'classroom', 'supply', 'washroom', 'library']]] },
  ],
  motel: [ // each unit a room off the walkway out front (its own front door), the bath behind it
    { id: 'motel-room', w: 1, tree: ['v', 'motelroom', 'motelbath'] },
  ],
  depot: [ // a warehouse: the shop floor (roll-up bay), offices and stock rooms along the back, a mezzanine over them
    { id: 'depot-mezz', w: 3, tree: ['v', 'floor', ['u', { max: 5.2 }, 'office', 'restroom', 'stock', 'stock']], up: [{ deck: 'back', room: 'mezzanine' }] },
    { id: 'depot-mezz-2office', w: 1, tree: ['v', 'floor', ['u', { max: 5.2 }, 'office', 'office', 'restroom', 'stock']], up: [{ deck: 'back', room: 'mezzanine' }] },
  ],
  hospital: [ // a ward: reception across the front, a 2.4 m corridor back from it, two-bed wards off both sides
    { id: 'ward-6', w: 2, tree: ['v', ['u', 'supply', 'frontdesk', 'treatment'], ['u', ['v', 'wardroom', 'wardroom', 'wardroom', 'dayroom'], 'corr24', ['v', 'wardroom', 'nursestation', 'washroom', 'dayroom']]] },
    { id: 'ward-8', w: 3, tree: ['v', ['u', 'supply', 'frontdesk', 'treatment'], ['u', ['v', 'wardroom', 'wardroom', 'wardroom', 'wardroom', 'dayroom'], 'corr24', ['v', 'wardroom', 'wardroom', 'nursestation', 'washroom', 'dayroom']]] },
  ],
};
for (const [k, v] of Object.entries(BIG_ROOMS)) { if (ROOMS[k]) console.warn(`floorplans: room ${k} already exists, the Building Lab's row is skipped`); else ROOMS[k] = v; }
for (const [k, v] of Object.entries(BIG_PLANS)) { if (PLANS[k]) console.warn(`floorplans: plans for ${k} already exist, the Building Lab's rows are skipped`); else PLANS[k] = v; }
// ==== end BIG BUILDINGS =================================================================================================
