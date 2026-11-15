// The JS furnishing rows and the shapes the furnishing tables carry them in (shared by gen-furnishing.mjs and tools/tables-furnishing.test.mjs).
import { ROOMS, PLANS, PROGRAMMES, SCATTER, FRONTS, PLAN_RULES } from '../../src/data/floorplans.js';
import { FURNITURE } from '../../src/data/ring.js';
export { ROOMS, PROGRAMMES, SCATTER, FRONTS, PLAN_RULES };

// the room types in a plan tree, counted ('u'/'v' are split axes, { max } a size hint)
export function treeRooms(tree, out = {}) {
  if (typeof tree === 'string') { out[tree] = (out[tree] ?? 0) + 1; return out; } // a plan whose whole tree is one room
  for (const n of tree) {
    if (typeof n === 'string') { if (n !== 'u' && n !== 'v') out[n] = (out[n] ?? 0) + 1; } else if (Array.isArray(n)) treeRooms(n, out);
  }
  return out;
}
export const planRows = () => {
  const rows = {};
  for (const [kind, list] of Object.entries(PLANS)) for (const p of list) {
    const { tree, id, w, ...rest } = p;
    rows[`${kind}_${id}`.replace(/[^A-Za-z0-9_]/g, '_')] = { kind, planId: id, w, ...rest, rooms: Object.entries(treeRooms(tree)) };
  }
  return rows;
};
export const furniturePieces = () => Object.fromEntries(Object.entries(FURNITURE).map(([k, { parts, ...p }]) => [k, p]));


// PROGRAMMES.names is { 5: 'TRADING POST', 9: ... } (numeric keys): a table carries it as rows { at, name }.
export const namesRows = (names) => Object.entries(names).map(([at, name]) => ({ at: +at, name }));
