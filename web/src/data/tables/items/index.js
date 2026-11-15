// The item family's tables, read (src/data/tables/items/*.csv + *.schema.json; loader: ../load.js). data/items.js re-exports
// these under their old names, then folds in the rows other modules own (gear, gadgets, melee, maker, fan nods).
import { tableObjects, tableOne } from '../load.js';

const F = 'items';
export const rows = (table) => tableObjects(F, table);
export const one = (table) => tableOne(F, table);
// AMMO_ITEM and GUN_ITEM are { key: itemKey }: the table row holds the item key as { item }.
export const itemMap = (table) => Object.fromEntries(Object.entries(rows(table)).map(([k, v]) => [k, v.item]));
