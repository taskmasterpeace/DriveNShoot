// Migration: tools/fixtures/tables/items.legacy.json (inline literals of data/items.js as they were) -> src/data/tables/items/*.csv.
// Run: node tools/tables/extract-items.mjs   (CSVs are the source of truth afterwards.)
import { readFileSync } from 'node:fs';
import { extract, writeTables } from './extract.mjs';

const snap = JSON.parse(readFileSync(new URL('../fixtures/tables/items.legacy.json', import.meta.url), 'utf8'), (k, v) => (v === '__Infinity__' ? Infinity : v)).inline;
const OUT = new URL('../../src/data/tables/items/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const outs = [];
const add = (spec) => outs.push(...extract({ family: 'items', ...spec }));
const DOC = 'design: docs/design/WEB_INVENTORY.md';

add({
  table: 'Items', rows: { ...snap.ITEMS, ...snap.GATOR_ITEMS }, parentCol: 'Item', legacy: 'src/data/items.js ITEMS (the rows typed in that file; gear, gadgets, melee, maker and fan-nod items are folded in by code)',
  description: 'Things you can carry: weight, room, stack size, price, what using one does. One row per item; tags are the ItemsTags child table. docs/design/WEB_INVENTORY.md. Rows other modules register (gear.js, gadgets.js, melee.js, makeritems.js, fannods.js, towing, workshop ammo) migrate with their own families.',
  units: { kg: 'kg', kgEmpty: 'kg', bulk: 'L', value: 'scrip', spoils: 'gh', pack: 'L', 'use.amount': '', 'use.hp': 'hp', 'use.water': '', 'use.food': '', 'dog.hp': 'hp', 'dog.bond': '' },
  ints: ['stack', 'uses'],
  descs: { kg: 'Weight when full (kg).', kgEmpty: 'Weight once its uses are gone (kg).', bulk: 'Room it takes in a pocket, pack or trunk (litres).', stack: 'How many share one slot (1 = each its own thing).', value: 'What a trader starts from (scrip).', uses: 'Uses before it is spent.', spoils: 'Game hours it stays fresh; as long again stale, then rotten.', pack: 'Litres it adds when worn on the back.', 'use.need': 'The need one use feeds (water, food, rest ...).', needs: 'A tag another carried thing must have before it can be used.', refill: 'Where it fills again (water, fuel).' },
  source: DOC,
});
add({
  table: 'LootTables', rows: snap.LOOT, parentCol: 'Table', legacy: 'src/data/items.js LOOT (the tables typed in that file; other modules add tables and rows by code)',
  description: 'Where things are found. A container rolls `rolls` times (Rolls_Min..Rolls_Max); a roll can come up empty (the None weight). LootTablesRows are the weighted entries: an item key, a weight, a count range.',
  tuples: { rolls: ['Min', 'Max'] }, childTuples: { LootTablesRows: ['Item', 'Weight', 'CountMin', 'CountMax'] },
  units: { none: '', 'LootTablesRows:0': '', 'LootTablesRows:1': '', 'LootTablesRows:2': 'count', 'LootTablesRows:3': 'count', rolls: 'count' }, ints: ['rolls.0', 'rolls.1', 'LootTablesRows:2', 'LootTablesRows:3'],
  descs: { none: 'Weight of an empty roll.' }, source: DOC,
});
add({
  table: 'AmmoTypeItems', rows: Object.fromEntries(Object.entries(snap.AMMO_ITEM).map(([k, v]) => [k, { item: v }])), parentCol: 'Ammo', legacy: 'src/data/items.js AMMO_ITEM',
  description: 'The item that is each ammo type (g.inv.ammo keys). Row Name = ammo type, Item = the Items key.', source: DOC,
});
add({
  table: 'GunItems', rows: Object.fromEntries(Object.entries(snap.GUN_ITEM).map(([k, v]) => [k, { item: v }])), parentCol: 'Gun', legacy: 'src/data/items.js GUN_ITEM',
  description: 'The item a loadout gun becomes when you put it down. Row Name = gun key, Item = the Items key.', source: DOC,
});
add({
  table: 'GunWear', rows: snap.GUN_WEAR, parentCol: 'Gun', legacy: 'src/data/items.js GUN_WEAR',
  description: 'What each gun loses per shot (condition 1 clean .. 0 broken) and how readily it jams once worn (x the base rate).', units: { wear: '', jam: '' }, source: DOC,
});
add({
  table: 'GunCare', rows: { default: snap.GUN_CARE }, parentCol: 'Setting', legacy: 'src/data/items.js GUN_CARE',
  description: 'Keeping a gun working: the condition below which shots may jam, jam rate, jam clearing time, what a cleaning kit restores, the gunsmith\'s price share. One row.',
  units: { jamBelow: '', jamRate: '', clearTime: 's', kit: '', kitMax: '', smith: '', smithMin: 'scrip' }, source: DOC,
});
add({
  table: 'GunFound', rows: snap.GUN_FOUND, parentCol: 'Carrier', legacy: 'src/data/items.js GUN_FOUND',
  description: 'The guns the dead leave, by who carried them: condition range, how full the magazine was, spare rounds on them.',
  tuples: { cond: ['Min', 'Max'], loaded: ['Min', 'Max'], spare: ['Min', 'Max'] }, units: { cond: '', loaded: '', spare: 'count' }, source: DOC,
});
add({
  table: 'StartKit', rows: { default: snap.START_KIT }, parentCol: 'Kit', legacy: 'src/data/items.js START_KIT',
  description: 'What a new character starts with: the pack worn and the items carried (StartKitItems: item key, count). One row.',
  childTuples: { StartKitItems: ['Item', 'Count'] }, units: { 'StartKitItems:1': 'count' }, ints: ['StartKitItems:1'], source: DOC,
});
add({
  table: 'PackSettings', rows: { default: { bodyLitres: snap.BODY_LITRES } }, parentCol: 'Setting', legacy: 'src/data/items.js BODY_LITRES',
  description: 'Room on your person before any pack: pockets and belt (litres). One row.', units: { bodyLitres: 'L' }, source: DOC,
});
writeTables(OUT, outs);
console.log(outs.map((o) => `${o.name}:${o.rows}`).join(' '), '\nrows', outs.reduce((a, o) => a + o.rows, 0), 'tables', outs.length);
