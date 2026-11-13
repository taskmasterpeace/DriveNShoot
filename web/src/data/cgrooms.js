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
// parts: the detail on a piece (systems/decor.js draws them for the buildings near you; they are looks only, no collider
//   and nothing to loot). Each is [u, v, y, su, sv, sy, col]: u along the wall and v out from it, each -0.5..0.5 of the
//   piece (v -0.5 is the wall side, 0.5 the side facing the room); y the part's underside in m above the floor;
//   su, sv its size as a share of the piece; sy its height in m; col a colour or a DECOR.palettes key (a seeded pick).
export const PIECES = {
  bed: { w: 1.0, d: 2.0, h: 0.55, col: '#8c8a7a', parts: [[0, -0.38, 0.55, 0.7, 0.16, 0.12, '#dcd8cc'], [0, 0.12, 0.55, 1.0, 0.62, 0.05, 'cloth']] },
  hbed: { w: 1.0, d: 2.1, h: 0.7, col: '#bfc4c0', parts: [[0, -0.4, 0.7, 0.7, 0.14, 0.1, '#eeeeea'], [0, 0.12, 0.7, 1.0, 0.6, 0.04, '#9fb4b8']] },
  bunk: { w: 1.0, d: 2.0, h: 1.7, col: '#5a5f4a', parts: [[0, 0, 1.7, 0.94, 0.96, 0.08, '#8a8a70']] },
  dresser: { w: 1.2, d: 0.6, h: 1.0, col: '#6b4a2e', holds: true, parts: [[0, 0.5, 0.3, 0.9, 0.05, 0.04, '#3e2a18'], [0, 0.5, 0.65, 0.9, 0.05, 0.04, '#3e2a18'], [-0.22, 0, 1.0, 0.22, 0.4, 0.2, 'cloth']] },
  wardrobe: { w: 1.2, d: 0.6, h: 1.9, col: '#5c3f28', holds: true, parts: [[0, 0.5, 0.1, 0.03, 0.05, 1.7, '#2e1f12']] },
  sofa: { w: 2.0, d: 0.9, h: 0.8, col: '#5d6a58', parts: [[0, -0.36, 0.8, 1.0, 0.28, 0.3, '#4d5a48'], [-0.45, 0.1, 0.8, 0.1, 0.72, 0.12, '#4d5a48'], [0.45, 0.1, 0.8, 0.1, 0.72, 0.12, '#4d5a48'], [0, 0.12, 0.8, 0.76, 0.6, 0.04, '#6f7c68']] },
  table: { w: 1.4, d: 0.9, h: 0.75, col: '#7a5a34', parts: [[-0.22, 0, 0.75, 0.16, 0.25, 0.03, '#dcd8cc'], [0.25, 0.1, 0.75, 0.07, 0.11, 0.2, 'bottles']] },
  bench: { w: 1.6, d: 0.5, h: 0.5, col: '#6e5a40', parts: [[0, -0.4, 0.5, 1.0, 0.2, 0.5, '#7a3a30']] },
  counter: { w: 2.4, d: 0.7, h: 1.0, col: '#6e5a40', holds: true, parts: [[-0.3, 0, 1.0, 0.16, 0.55, 0.3, '#33373a'], [-0.3, 0.3, 1.3, 0.1, 0.1, 0.12, '#9ad08a'], [0.22, 0, 1.0, 0.34, 0.6, 0.14, 'goods']] },
  stove: { w: 0.8, d: 0.7, h: 0.95, col: '#4a4a48', parts: [[0, 0.06, 0.95, 0.8, 0.7, 0.02, '#1f1f1f'], [0, -0.42, 0.95, 1.0, 0.14, 0.22, '#5e5e5c']] },
  fridge: { w: 0.8, d: 0.7, h: 1.8, col: '#c9c6ba', holds: true, parts: [[0.3, 0.5, 0.9, 0.07, 0.08, 0.6, '#8a8a84'], [0, 0.5, 1.25, 0.96, 0.04, 0.03, '#9a978c']] },
  cupboard: { w: 1.6, d: 0.6, h: 0.95, col: '#8a7a5c', holds: true, parts: [[-0.2, 0, 0.95, 0.35, 0.62, 0.03, '#b8bcc0'], [-0.2, -0.32, 0.98, 0.04, 0.1, 0.22, '#9aa0a4'], [0.25, 0, 0.95, 0.2, 0.4, 0.16, 'goods']] },
  toilet: { w: 0.5, d: 0.7, h: 0.5, col: '#d8d5cc', parts: [[0, -0.32, 0.5, 0.9, 0.3, 0.42, '#e4e1d8']] },
  tub: { w: 1.6, d: 0.8, h: 0.55, col: '#d0cdc4', parts: [[0, 0, 0.5, 0.86, 0.7, 0.06, '#a4b6ba']] },
  basin: { w: 0.6, d: 0.6, h: 0.9, col: '#d8d5cc', holds: true, parts: [[0, -0.45, 1.3, 0.8, 0.06, 0.5, '#b4c6ca']] },
  shelf: { w: 2.0, d: 0.6, h: 1.9, col: '#6a6052', holds: true, parts: [[0, 0.5, 0.35, 0.9, 0.08, 0.3, 'goods'], [0, 0.5, 0.85, 0.9, 0.08, 0.3, 'goods'], [0, 0.5, 1.35, 0.9, 0.08, 0.3, 'goods'], [0, 0.05, 1.9, 0.8, 0.6, 0.14, 'goods']] },
  aisle: { w: 2.4, d: 0.6, h: 1.6, col: '#6a6052', holds: true, parts: [[0, 0.5, 0.4, 0.92, 0.08, 0.4, 'goods'], [0, 0.5, 1.0, 0.92, 0.08, 0.4, 'goods'], [0, -0.5, 0.4, 0.92, 0.08, 0.4, 'goods'], [0, -0.5, 1.0, 0.92, 0.08, 0.4, 'goods'], [0, 0, 1.6, 0.86, 0.6, 0.12, 'goods']] },
  cooler: { w: 1.6, d: 0.7, h: 2.0, col: '#2c3136', holds: true, parts: [[0, 0.5, 0.2, 0.9, 0.05, 1.5, '#a6c8d2'], [0, 0.53, 0.35, 0.82, 0.04, 0.28, 'bottles'], [0, 0.53, 0.8, 0.82, 0.04, 0.28, 'bottles'], [0, 0.53, 1.25, 0.82, 0.04, 0.28, 'bottles'], [0, 0.5, 1.78, 1.0, 0.08, 0.18, '#c23b2a']] },
  rack: { w: 2.4, d: 0.8, h: 2.2, col: '#4f5258', holds: true, parts: [[-0.25, 0, 2.2, 0.3, 0.7, 0.36, '#9a7a4c'], [0.2, 0, 2.2, 0.26, 0.6, 0.28, '#6f7a58'], [0, 0.5, 1.0, 0.94, 0.06, 0.4, '#8a6a42']] },
  desk: { w: 1.5, d: 0.75, h: 0.75, col: '#6b5236', holds: true, parts: [[0, -0.18, 0.75, 0.34, 0.08, 0.38, '#2a2d30'], [0.3, 0.15, 0.75, 0.2, 0.32, 0.02, '#e2ded0']] },
  pupil: { w: 0.7, d: 0.5, h: 0.7, col: '#8a6a42' },
  cabinet: { w: 0.6, d: 0.6, h: 1.4, col: '#70726c', holds: true, parts: [[0, 0.5, 0.45, 0.9, 0.05, 0.03, '#4e504a'], [0, 0.5, 0.92, 0.9, 0.05, 0.03, '#4e504a']] },
  locker: { w: 0.9, d: 0.6, h: 1.9, col: '#56605e', holds: true, parts: [[0, 0.5, 0.1, 0.03, 0.05, 1.7, '#3a4442']] },
  pew: { w: 3.0, d: 0.6, h: 0.9, col: '#5a3f26', parts: [[0, -0.38, 0.9, 1.0, 0.2, 0.3, '#4a321e']] },
  workbench: { w: 2.2, d: 0.8, h: 0.95, col: '#5e4a30', holds: true, parts: [[-0.3, 0, 0.95, 0.24, 0.5, 0.26, '#9a3326'], [0.35, 0.2, 0.95, 0.1, 0.3, 0.2, '#3c4044'], [0, -0.47, 1.3, 0.9, 0.05, 0.7, '#7a6a4a']] },
  bar: { w: 4.0, d: 0.8, h: 1.1, col: '#4a321e', parts: [[-0.3, -0.15, 1.1, 0.03, 0.14, 0.3, 'bottles'], [-0.1, -0.15, 1.1, 0.03, 0.14, 0.3, 'bottles'], [0.15, -0.15, 1.1, 0.03, 0.14, 0.3, 'bottles'], [0.36, 0.1, 1.1, 0.06, 0.3, 0.16, '#c8c0aa']] },
  tyres: { w: 1.0, d: 1.0, h: 0.8, col: '#1e1e1e', parts: [[0, 0, 0.8, 0.45, 0.45, 0.02, '#6a6a6a'], [0, 0, 0.26, 1.04, 1.04, 0.03, '#0e0e0e'], [0, 0, 0.53, 1.04, 1.04, 0.03, '#0e0e0e']] },
  drum: { w: 0.7, d: 0.7, h: 0.95, col: '#3f6a7a', parts: [[0, 0, 0.95, 0.85, 0.85, 0.03, '#2e4e5a'], [0, 0, 0.45, 1.04, 1.04, 0.05, '#2e4e5a']] },
  pallet: { w: 1.3, d: 1.1, h: 1.1, col: '#9a7a4c', parts: [[0, 0, 0.0, 1.06, 1.06, 0.14, '#6e5636'], [-0.15, 0, 1.1, 0.5, 0.6, 0.4, '#8a7448'], [0, 0.5, 0.55, 0.5, 0.04, 0.2, '#e2ded0']] },
};

// DECOR: how the detail is drawn. near / far m from a building's footprint at which its detail is drawn and given back;
// every s between scans; max parts drawn at once (the pool: the nearest buildings are dressed first; one that does not
// fit goes without until others are given back);
// palettes a part's colour key picks from (seeded by where the part stands, so a shelf keeps its goods). Never purple.
export const DECOR = {
  near: 45, far: 65, every: 0.4, max: 6000,
  palettes: {
    goods: ['#c23b2a', '#d9a02c', '#3f7a4a', '#2f6f8a', '#e6dcc0', '#b8562a', '#7a8a3a', '#d8d2c4'],
    bottles: ['#3f6a3a', '#8a5a2a', '#b8b090', '#2f6f8a', '#a83a2a', '#d0c060'],
    cloth: ['#7a3b32', '#3f5a6a', '#5a6a3f', '#8a7340', '#6a6a62'],
  },
};

// FRONTS: what a building of a kind wears on its street face so you know it from the road. board: a sign board over the
// front door (colour); awning: a canopy over the front door (colour); price: a gas station's price sign on its canopy
// post (colour). Looks only: all of it is above head height or on something that already had a collider.
export const FRONTS = {
  gas_station: { board: '#b8322a', price: '#b8322a', pumps: 2 }, truck_stop: { board: '#b8322a' },
  shop: { board: '#2f6f5a', awning: '#3f7a5a' }, diner: { board: '#b8562a', awning: '#c8b08a' }, saloon: { board: '#6a3a22', awning: '#5a4630' },
  auto_shop: { board: '#2f5f8a' }, garage: {}, warehouse: { board: '#5a5a52' }, motel: { board: '#b8822a' }, hotel: { board: '#8a6a2a', awning: '#6a3a30' },
};

// ROOM_TYPES[type] = { wall: pieces to stand against the walls, in order (the list repeats until the room is full),
//   centre: a piece set out in rows in the middle of a room big enough (or null), name: what the room is called }
export const ROOM_TYPES = {
  living: { name: 'living room', wall: ['sofa', 'shelf', 'dresser'], centre: 'table' },
  kitchen: { name: 'kitchen', wall: ['cupboard', 'stove', 'fridge', 'cupboard'], centre: null },
  bedroom: { name: 'bedroom', wall: ['bed', 'dresser', 'wardrobe'], centre: null },
  bath: { name: 'bathroom', wall: ['toilet', 'basin', 'tub'], centre: null },
  trailer: { name: 'trailer', wall: ['bed', 'cupboard', 'sofa', 'fridge'], centre: null },
  sales: { name: 'shop floor', wall: ['counter', 'cooler', 'shelf', 'shelf'], centre: 'aisle', retry: true }, // retry: if the counter fits on no wall the room still gets the rest
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
  workshop: { name: 'workshop', wall: ['workbench', 'rack', 'tyres', 'locker', 'drum'], centre: null },
  warehouse: { name: 'warehouse floor', wall: ['rack', 'rack', 'shelf'], centre: 'pallet' },
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
export const CG_ROOMS = { wall: 0.2, door: 1.4, lintel: 2.6, corridor: 2.0, bay: 4.6, minRoom: 2.6, clear: 1.4, pass: 1.4, perPiece: 4.5, pieces: [2, 9], centreMin: 4.8, centreEdge: 2.1, aisle: 1.3, under: 0.24 };

const purple = (hex) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return b > g + 24 && r > g + 24; };
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
    for (const [i, t] of (q.parts ?? []).entries()) {
      if (!Array.isArray(t) || t.length !== 7) { bad.push(`piece ${p} part ${i}: [u, v, y, su, sv, sy, col]`); continue; }
      const [u, v, y, su, sv, sy, col] = t;
      if (!(Math.abs(u) <= 0.5 && Math.abs(v) <= 0.56 && y >= 0 && y <= 2.6 && su > 0 && su <= 1.1 && sv > 0 && sv <= 1.1 && sy > 0 && sy <= 1.8 && y + sy <= 2.7)) bad.push(`piece ${p} part ${i}: out of range (a part tops out under 2.7 m)`);
      if (!/^#[0-9a-f]{6}$/i.test(col) && !DECOR.palettes[col]) bad.push(`piece ${p} part ${i}: colour "${col}" is neither a colour nor a palette`);
      else if (/^#/.test(col) && purple(col)) bad.push(`piece ${p} part ${i}: purple is not allowed`);
    }
    if ((q.parts ?? []).length > 6) bad.push(`piece ${p}: more than 6 parts`);
  }
  for (const [k, list] of Object.entries(DECOR.palettes)) for (const c of list) if (!/^#[0-9a-f]{6}$/i.test(c) || purple(c)) bad.push(`DECOR.palettes.${k}: "${c}" (a colour, never purple)`);
  if (!(DECOR.near >= 20 && DECOR.far > DECOR.near && DECOR.max >= 1000 && DECOR.max <= 20000 && DECOR.every > 0)) bad.push('DECOR: near >= 20, far > near, max 1000-20000');
  for (const [k, F] of Object.entries(FRONTS)) for (const f of ['board', 'awning', 'price']) if (F[f] !== undefined && (!/^#[0-9a-f]{6}$/i.test(F[f]) || purple(F[f]))) bad.push(`FRONTS.${k}.${f}: a colour, never purple`);
  const C = CG_ROOMS;
  // no hand through a partition (systems/reach.js: inside REACH.touch + a body's radius nothing is asked of the walls):
  // a container in a piece against a partition must be further than that from someone pressed to the other side
  for (const [p, q] of Object.entries(PIECES)) if (q.holds && 0.4 + C.wall + q.d / 2 < touch + 0.05) bad.push(`piece ${p}: holds loot but is only ${q.d} m deep (with a ${C.wall} m partition a hand reaches it from the next room)`);
  if (!(C.door >= 0.9 && C.door <= 1.6)) bad.push('CG_ROOMS.door: 0.9-1.6');
  if (!(C.corridor >= 1.6 && C.corridor <= 3)) bad.push('CG_ROOMS.corridor: 1.6-3');
  if (!(C.minRoom >= 2.2)) bad.push('CG_ROOMS.minRoom: 2.2 or more');
  return bad;
}
