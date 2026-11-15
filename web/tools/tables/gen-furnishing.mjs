// BUILDING FURNISHING as tables (new family): what rooms a building kind has and what stands in each room.
// Derived from the repo's own rows: src/data/floorplans.js (ROOMS, PLANS, PROGRAMMES, SCATTER, FRONTS, PLAN_RULES) and src/data/ring.js (FURNITURE).
// Run: node --import ./tools/tables/register-json.mjs tools/tables/gen-furnishing.mjs
// NOTHING READS THESE TABLES YET, and the JS stays the source of truth until the zombies/interiors furnishing pass has landed, so
// tools/tables-furnishing.test.mjs fails when the JS has moved on: re-run this generator then.
// Not tabulated (render/layout data, stays JS): FURNITURE `parts` (the boxes a piece is drawn from) and the PLANS `tree` (the partition topology);
// the tree's room COUNTS are in PlanLayoutsRooms.
import { extract, writeTables } from './extract.mjs';
import { ROOMS, PROGRAMMES, SCATTER, FRONTS, PLAN_RULES, planRows, furniturePieces, namesRows } from './furnishing-shapes.mjs';

const OUT = new URL('../../src/data/tables/furnishing/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const outs = [];
const add = (spec) => outs.push(...extract({ family: 'furnishing', ...spec }));
const SRC = 'design: docs/design/WEB_FLOORPLANS.md';

add({
  table: 'RoomTypes', rows: ROOMS, parentCol: 'Room', legacy: 'src/data/floorplans.js ROOMS',
  description: 'One row per room type: size limits, how it grows, whether the front door opens into it, the floor finish, the loot table its containers roll, and what stands in it (RoomTypesFurniture: piece, min, max). RoomTypesVia lists the room types its doorway may open onto, best first. RoomTypesRare: a piece that appears by chance. `Fix`: exactly this wide along its split axis (a hall).',
  childTuples: { RoomTypesFurniture: ['Piece', 'Min', 'Max'], RoomTypesRare: ['Piece', 'Chance'] },
  units: { min: 'm', max: 'm', fix: 'm', grow: '', back: '', 'RoomTypesFurniture:1': 'count', 'RoomTypesFurniture:2': 'count', 'RoomTypesRare:1': '' },
  ints: ['back', 'RoomTypesFurniture:1', 'RoomTypesFurniture:2'],
  descs: { floor: 'Hex colour of a floor finish laid over the building floor; empty = the building\'s own floor.', loot: 'Loot table key (items/LootTables).', grow: 'Share of the space left over once every room has its minimum.', back: 'A back door may go in its outside wall (lower = preferred).', stay: 'Residents spend their day here.' },
  source: SRC,
});
add({
  table: 'Furniture', rows: furniturePieces(), parentCol: 'Piece', legacy: 'src/data/ring.js FURNITURE (without `parts`, the boxes it is drawn from)',
  description: 'One row per piece of furniture: size (X along the wall, Y out from it, Z height; metres), colours (FurnitureColors, FurnitureAlt), whether it is a container (Box_*) and the loot table it rolls, solid, bed and sleeping spots, and placement rules: near/far a piece already in the room, FarDoor, Centre.',
  tuples: { size: ['X', 'Y', 'Z'] }, units: { size: 'm', 'box.cap': 'L', spots: 'count' }, ints: ['spots'],
  descs: { 'box.cap': 'Litres the container holds.', near: 'Placed close to this piece already in the room (* = any).', far: 'Placed away from this piece.', farDoor: 'Away from the room\'s doorway (a bed\'s head wall).', centre: 'Stands in the middle of the room, not on a wall.' },
  source: SRC,
});
add({
  table: 'PlanLayouts', rows: planRows(), parentCol: 'Plan', legacy: 'src/data/floorplans.js PLANS (the tree is not tabulated; PlanLayoutsRooms counts its rooms)',
  description: 'One row per floor plan of a building kind: Kind, PlanId, the weight it is picked with (W), and the room types it has with how many of each (PlanLayoutsRooms). Which building kind gets which rooms, hence which furniture.',
  tuples: { 'size.u': ['Min', 'Max'], 'size.v': ['Min', 'Max'] }, childTuples: { PlanLayoutsRooms: ['Room', 'Count'] },
  units: { w: '', 'size.u': 'm', 'size.v': 'm', 'PlanLayoutsRooms:1': 'count' }, ints: ['PlanLayoutsRooms:1'],
  source: SRC,
});
add({
  table: 'ProgrammeRows', rows: PROGRAMMES.rows, parentCol: 'Programme', legacy: 'src/data/floorplans.js PROGRAMMES.rows',
  description: 'Shop and ruin programmes: the display name and the loot table.', source: SRC,
});
add({
  table: 'ProgrammeSettings', rows: { default: { shops: PROGRAMMES.shops, names: namesRows(PROGRAMMES.names), ruins: PROGRAMMES.ruins, lose: PROGRAMMES.lose, working: PROGRAMMES.working } }, parentCol: 'Setting', legacy: 'src/data/floorplans.js PROGRAMMES (shops, names, ruins, lose, working)',
  description: 'The island shop order (ProgrammeSettingsShops, by Index), the names of numbered shops (ProgrammeSettingsNames: At = which shop, Name), the ruin mix (Programme, weight), the chance a ruin loses each partition, and the room types a keeper shop works in. One row.',
  childTuples: { ProgrammeSettingsRuins: ['Programme', 'Weight'] }, units: { lose: '', 'ProgrammeSettingsRuins:1': '' }, source: SRC,
});
add({
  table: 'RoomScatter', rows: Object.fromEntries(Object.entries(SCATTER).map(([k, [piece, every, inset, max]]) => [k, { piece, every, inset, max }])), parentCol: 'Room', legacy: 'src/data/floorplans.js SCATTER',
  description: 'Big public rooms fill their middles: a piece on a grid Every metres apart, Inset in from the walls, at most Max.', units: { every: 'm', inset: 'm', max: 'count' }, ints: ['max'], source: SRC,
});
add({
  table: 'RoomFronts', rows: Object.fromEntries(Object.entries(FRONTS).map(([k, room]) => [k, { room }])), parentCol: 'Programme', legacy: 'src/data/floorplans.js FRONTS',
  description: 'The island front room for a quarters plan, by programme.', source: SRC,
});
add({
  table: 'PlanRules', rows: { default: PLAN_RULES }, parentCol: 'Setting', legacy: 'src/data/floorplans.js PLAN_RULES',
  description: 'The plan numbers: wall left beside an inside doorway, furniture clearances, aisle widths, jitter, and the room types that are snug (PlanRulesSnug). One row.',
  units: { jamb: 'm', doorClear: 'm', frontClear: 'm', 'aisle.snug': 'm', 'aisle.open': 'm', jitter: '', sameWall: '', cornerGap: 'm' }, source: SRC,
});
writeTables(OUT, outs);
console.log(outs.map((o) => `${o.name}:${o.rows}`).join(' '));
console.log('rows', outs.reduce((a, o) => a + o.rows, 0), 'tables', outs.length);
