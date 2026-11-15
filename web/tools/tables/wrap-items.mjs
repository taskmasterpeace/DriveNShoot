// One-off: data/items.js literals -> table wrappers. Not re-runnable.
import { rewrite } from './wrap-lib.mjs';

rewrite('src/data/items.js', {
  ITEMS: "export const ITEMS = rows('Items');",
  LOOT: "export const LOOT = rows('LootTables');",
  AMMO_ITEM: "export const AMMO_ITEM = itemMap('AmmoTypeItems');",
  GUN_ITEM: "export const GUN_ITEM = itemMap('GunItems');",
  GUN_WEAR: "export const GUN_WEAR = rows('GunWear');",
  GUN_CARE: "export const GUN_CARE = one('GunCare');",
  GUN_FOUND: "export const GUN_FOUND = rows('GunFound');",
  START_KIT: "export const START_KIT = one('StartKit');",
  BODY_LITRES: "export const BODY_LITRES = one('PackSettings').bodyLitres;",
}, (s) => {
  // the gator rows now live in the Items table (same order: they followed the literal)
  const g = s.indexOf('Object.assign(ITEMS, {\n  gator_meat');
  if (g < 0) throw new Error('gator block not found');
  const ge = s.indexOf('});\n', g) + 4;
  s = s.slice(0, g) + s.slice(ge);
  return s.replace("import { MELEE_ITEMS } from './melee.js';", "import { rows, one, itemMap } from './tables/items/index.js';\nimport { MELEE_ITEMS } from './melee.js';");
});
console.log('wrapped items.js');
