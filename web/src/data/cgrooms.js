// ROOMS FOR GENERATED BUILDINGS (docs/design/WEB_CG_ROOMS.md): every country-town, military-base and ring-tower building
// is made by world/citygen/build.js as a shell with stairs. These rows give each kind its rooms and what stands in them,
// on every floor. The rule that lays them out is world/citygen/rooms.js (pure, like build.js).
//
// KIND_ROOMS[kind] = { street: [layout, ...types], up: [layout, ...types] }   (up: the floors above the street)
//   layout 'hall'      one room, no partitions                               types: [room]
//          'split'     a front room and a back band of one or two rooms      types: [front, backA, backB]
//          'home'      front: two rooms side by side; back: two rooms        types: [frontA, frontB, backA, backB]
//          'corridor'  a corridor down the long axis, rooms off both sides   types: [room]
// A footprint too small for its layout falls back to a hall of the layout's first type.
const R = (street, up = null) => ({ street, up: up ?? street });
const HOME = ['home', 'living', 'kitchen', 'bedroom', 'bath'], BEDS = ['home', 'bedroom', 'bedroom', 'bedroom', 'bath'];
export const KIND_ROOMS = {
  house: R(HOME, BEDS), bungalow: R(HOME), rowhouse: R(HOME, BEDS), adobe: R(HOME, BEDS), stilt_house: R(HOME, BEDS), cabin: R(HOME),
  farmhouse: R(HOME, BEDS), ranch_house: R(HOME), trailer: R(['hall', 'trailer']),
  shop: R(['split', 'sales', 'stock', 'office'], HOME), saloon: R(['hall', 'bar'], ['corridor', 'hotelroom']),
  diner: R(['split', 'diner', 'kitchen', 'restroom']), gas_station: R(['split', 'sales', 'stock', 'restroom']),
  auto_shop: R(['hall', 'workshop']), garage: R(['hall', 'workshop']), parking: R(['hall', 'empty']),
  warehouse: R(['hall', 'warehouse']), quonset: R(['hall', 'warehouse']), barn: R(['hall', 'barn']),
  grain_elevator: R(['hall', 'barn']), mill: R(['hall', 'warehouse']),
  motel: R(['corridor', 'hotelroom']), church: R(['hall', 'nave']), school: R(['corridor', 'classroom']),
  fire_station: R(['hall', 'workshop'], ['corridor', 'bunk']), clinic: R(['corridor', 'ward']), hospital: R(['corridor', 'ward']),
  courthouse: R(['corridor', 'office']), apartment: R(['corridor', 'flat']), office: R(['corridor', 'office']),
  hotel: R(['hall', 'lobby'], ['corridor', 'hotelroom']), police_station: R(['corridor', 'policeoffice']),
  cloning_center: R(['corridor', 'lab']), barracks: R(['corridor', 'bunk']), hq: R(['corridor', 'office']),
  guardhouse: R(['hall', 'guard']), truck_stop: R(['split', 'sales', 'stock', 'restroom']),
};
export const DEFAULT_ROOMS = R(['hall', 'store']);

// PIECES: w along the wall it backs onto, d out from that wall, h tall (m); col; holds: a loot container may live in it
// (build.js moves the floor's containers into these instead of loose crates: nothing new is made, the same containers).
export const PIECES = {
  bed: { w: 1.0, d: 2.0, h: 0.55, col: '#8c8a7a' }, hbed: { w: 1.0, d: 2.1, h: 0.7, col: '#bfc4c0' }, bunk: { w: 1.0, d: 2.0, h: 1.7, col: '#5a5f4a' },
  dresser: { w: 1.2, d: 0.6, h: 1.0, col: '#6b4a2e', holds: true }, wardrobe: { w: 1.2, d: 0.6, h: 1.9, col: '#5c3f28', holds: true },
  sofa: { w: 2.0, d: 0.9, h: 0.8, col: '#5d6a58' }, table: { w: 1.4, d: 0.9, h: 0.75, col: '#7a5a34' }, bench: { w: 1.6, d: 0.5, h: 0.5, col: '#6e5a40' },
  counter: { w: 2.4, d: 0.7, h: 1.0, col: '#6e5a40', holds: true }, stove: { w: 0.8, d: 0.7, h: 0.95, col: '#4a4a48' },
  fridge: { w: 0.8, d: 0.7, h: 1.8, col: '#c9c6ba', holds: true }, cupboard: { w: 1.6, d: 0.6, h: 0.95, col: '#8a7a5c', holds: true },
  toilet: { w: 0.5, d: 0.7, h: 0.5, col: '#d8d5cc' }, tub: { w: 1.6, d: 0.8, h: 0.55, col: '#d0cdc4' }, basin: { w: 0.6, d: 0.6, h: 0.9, col: '#d8d5cc', holds: true },
  shelf: { w: 2.0, d: 0.6, h: 1.9, col: '#6a6052', holds: true }, aisle: { w: 2.4, d: 0.6, h: 1.6, col: '#6a6052', holds: true },
  rack: { w: 2.4, d: 0.8, h: 2.2, col: '#4f5258', holds: true }, desk: { w: 1.5, d: 0.75, h: 0.75, col: '#6b5236', holds: true },
  pupil: { w: 0.7, d: 0.5, h: 0.7, col: '#8a6a42' }, cabinet: { w: 0.6, d: 0.6, h: 1.4, col: '#70726c', holds: true },
  locker: { w: 0.9, d: 0.6, h: 1.9, col: '#56605e', holds: true }, pew: { w: 3.0, d: 0.6, h: 0.9, col: '#5a3f26' },
  workbench: { w: 2.2, d: 0.8, h: 0.95, col: '#5e4a30', holds: true }, bar: { w: 4.0, d: 0.8, h: 1.1, col: '#4a321e' },
};

// ROOM_TYPES[type] = { wall: pieces to stand against the walls, in order (the list repeats until the room is full),
//   centre: a piece set out in rows in the middle of a room big enough (or null), name: what the room is called }
export const ROOM_TYPES = {
  living: { name: 'living room', wall: ['sofa', 'shelf', 'dresser'], centre: 'table' },
  kitchen: { name: 'kitchen', wall: ['cupboard', 'stove', 'fridge', 'cupboard'], centre: null },
  bedroom: { name: 'bedroom', wall: ['bed', 'dresser', 'wardrobe'], centre: null },
  bath: { name: 'bathroom', wall: ['toilet', 'basin', 'tub'], centre: null },
  trailer: { name: 'trailer', wall: ['bed', 'cupboard', 'sofa', 'fridge'], centre: null },
  sales: { name: 'shop floor', wall: ['counter', 'shelf', 'shelf', 'shelf'], centre: 'aisle' },
  stock: { name: 'stock room', wall: ['rack', 'shelf', 'rack'], centre: null },
  office: { name: 'office', wall: ['desk', 'cabinet', 'shelf'], centre: null },
  restroom: { name: 'restroom', wall: ['toilet', 'basin'], centre: null },
  diner: { name: 'diner', wall: ['counter', 'bench', 'bench'], centre: 'table' },
  bar: { name: 'bar room', wall: ['bar', 'shelf', 'bench', 'bench'], centre: null }, // the middle is the card tables' (systems/casinos.js)
  hotelroom: { name: 'room', wall: ['bed', 'dresser', 'wardrobe'], centre: null },
  flat: { name: 'flat', wall: ['bed', 'cupboard', 'fridge', 'sofa'], centre: null },
  bunk: { name: 'bunk room', wall: ['bunk', 'locker', 'bunk', 'locker'], centre: null },
  classroom: { name: 'classroom', wall: ['desk', 'shelf', 'cabinet'], centre: 'pupil' },
  ward: { name: 'ward', wall: ['hbed', 'cabinet', 'hbed', 'basin'], centre: null },
  lab: { name: 'lab', wall: ['hbed', 'cabinet', 'desk', 'rack'], centre: null },
  policeoffice: { name: 'duty room', wall: ['desk', 'locker', 'cabinet'], centre: null },
  nave: { name: 'nave', wall: ['bench'], centre: 'pew' },
  lobby: { name: 'lobby', wall: ['desk', 'sofa', 'sofa'], centre: null },
  workshop: { name: 'workshop', wall: ['workbench', 'rack', 'locker'], centre: null },
  warehouse: { name: 'warehouse floor', wall: ['rack', 'rack', 'shelf'], centre: null },
  barn: { name: 'barn floor', wall: ['rack', 'workbench'], centre: null },
  guard: { name: 'guard room', wall: ['desk', 'locker'], centre: null },
  store: { name: 'store room', wall: ['shelf', 'rack'], centre: null },
  corridor: { name: 'corridor', wall: [], centre: null },
  empty: { name: 'deck', wall: [], centre: null },
};

// The numbers the layout uses (m).
//   wall      partition thickness; door: a doorway's width; lintel: its height
//   corridor  corridor width; bay: the length of a room along a corridor (rooms are cut to the nearest whole count)
//   minRoom   a room is never laid thinner than this; clear: kept free round stairs, doors and doorways; pass: the
//             walkway always left between pieces on facing walls (a 0.4 m walker on a 0.5 m grid needs 1.3 or more)
//   perPiece  m² of room per piece against the walls (min, max per room); centreMin: a room needs this much each way
//             before anything stands in its middle (centreEdge: kept clear round the rows); aisle: the gap between rows
//   under     a partition stops this far under the deck above (it never shows through the floor or the roof)
export const CG_ROOMS = { wall: 0.2, door: 1.4, lintel: 2.6, corridor: 2.0, bay: 4.6, minRoom: 2.6, clear: 1.4, pass: 1.4, perPiece: 4.5, pieces: [2, 9], centreMin: 4.2, centreEdge: 1.5, aisle: 1.3, under: 0.24 };

export function validateCgRooms(kinds = null, touch = 0.8) {
  const bad = [], layouts = { hall: 1, split: 3, home: 4, corridor: 1 };
  const row = (id, r) => {
    for (const f of ['street', 'up']) {
      const L = r[f];
      if (!Array.isArray(L) || layouts[L[0]] === undefined) { bad.push(`${id}.${f}: unknown layout "${L?.[0]}"`); continue; }
      if (L.length - 1 !== layouts[L[0]]) bad.push(`${id}.${f}: layout ${L[0]} takes ${layouts[L[0]]} room type(s)`);
      for (const t of L.slice(1)) if (!ROOM_TYPES[t]) bad.push(`${id}.${f}: unknown room type "${t}"`);
    }
  };
  for (const [id, r] of Object.entries(KIND_ROOMS)) row(id, r);
  row('DEFAULT', DEFAULT_ROOMS);
  if (kinds) for (const k of kinds) if (!KIND_ROOMS[k]) bad.push(`building kind "${k}" has no rooms row`);
  for (const [t, r] of Object.entries(ROOM_TYPES)) {
    if (!r.name) bad.push(`room ${t}: no name`);
    for (const p of r.wall) if (!PIECES[p]) bad.push(`room ${t}: unknown piece "${p}"`);
    if (r.centre && !PIECES[r.centre]) bad.push(`room ${t}: unknown centre piece "${r.centre}"`);
  }
  for (const [p, q] of Object.entries(PIECES)) {
    if (!(q.w > 0.2 && q.w <= 4.5 && q.d > 0.2 && q.d <= 2.4 && q.h > 0.2 && q.h <= 2.4)) bad.push(`piece ${p}: size out of range`);
    const m = /^#([0-9a-f]{6})$/i.exec(q.col ?? '');
    if (!m) { bad.push(`piece ${p}: colour`); continue; }
    const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (b > g + 24 && r > g + 24) bad.push(`piece ${p}: purple is not allowed`);
  }
  const C = CG_ROOMS;
  // no hand through a partition (systems/reach.js: inside REACH.touch + a body's radius nothing is asked of the walls):
  // a container in a piece against a partition must be further than that from someone pressed to the other side
  for (const [p, q] of Object.entries(PIECES)) if (q.holds && 0.4 + C.wall + q.d / 2 < touch + 0.05) bad.push(`piece ${p}: holds loot but is only ${q.d} m deep (with a ${C.wall} m partition a hand reaches it from the next room)`);
  if (!(C.door >= 0.9 && C.door <= 1.6)) bad.push('CG_ROOMS.door: 0.9-1.6');
  if (!(C.corridor >= 1.6 && C.corridor <= 3)) bad.push('CG_ROOMS.corridor: 1.6-3');
  if (!(C.minRoom >= 2.2)) bad.push('CG_ROOMS.minRoom: 2.2 or more');
  return bad;
}
