import { GEAR, GEAR_LOOT, GEAR_LOOT_ADD, gearKg, gearBulk, gearValue } from './gear.js';
import { GADGETS, DRONES, DOOR_KIT, KIT, CELLS, KIT_LOOT_ADD } from './gadgets.js';
import { DOG_GEAR } from './dogs.js';
import { FN_ITEMS, FN_LOOT, FN_AMMO_ITEM, FN_GUN_ITEM } from './fannods.js';
import { MAKER_ITEMS, MAKER_LOOT_ADD, MAKER_MANUAL_LOOT } from './makeritems.js';
import { rows, one, itemMap } from './tables/items/index.js';
import { MELEE_ITEMS } from './melee.js'; // bats, knuckles, pipes, sledges (WEB_MELEE.md)

// Things you can carry (docs/design/WEB_INVENTORY.md). Our own goods and our own words; no brand names.
// A row is what a thing is, what it weighs and how much room it takes, how many share a slot, and what using it does.
//   kg       weight full; kgEmpty: weight once its uses are gone (a canteen still weighs something dry)
//   bulk     litres of room it takes in a pocket, a pack or a trunk
//   stack    how many share one slot (1 = each one is its own thing, with its own wear or uses left)
//   value    what a trader starts from, in scrip
//   uses     how many times it can be used before it is spent; refill: where it fills again ('water', 'fuel')
//   use      what one use does: { need, amount } eats or drinks (negative amounts cost you: jerky is salty),
//            hp heals, bleed: true stops bleeding; or `act`: a verb another system carries out
//            ('repair', 'refuel', 'tyre', 'pick', 'pry')
//   needs    a tag some other carried thing must have before it can be used (a tin needs a 'blade')
//   spoils   game hours it stays fresh; as long again it is stale (half the good, half the price); then rotten
//   pack     litres it adds when worn on your back (a satchel, a pack); one is worn at a time
//   tags     what tools, loot tables and crafting know it by
export const ITEMS = rows('Items');

Object.assign(ITEMS, MELEE_ITEMS); // the melee rows' carried things (data/melee.js)
// Where things are found. Each table: weighted rows [item, weight, countMin, countMax]; a container rolls `rolls`
// times (min..max), and a roll can come up empty (the `none` weight).
export const LOOT = rows('LootTables');

// What you start with: pockets, a satchel on your back, a bottle and a little food (plus the guns in g.inv).

// The rounds each gun's ammo type is (g.inv.ammo keys) and the item a loadout gun becomes when you put it down.
export const AMMO_ITEM = itemMap('AmmoTypeItems');
export const GUN_ITEM = itemMap('GunItems');
// What each gun loses per shot (condition: 1 clean, 0 broken) and how readily it jams once worn (x the base rate).
// A revolver at 0.82 has ~680 shots in it before it breaks; the stamped SMG wears least per shot but fires the most.
export const GUN_WEAR = rows('GunWear');
// Keeping a gun working (docs/design/WEB_INVENTORY.md, guns):
//   jamBelow   - below this condition every shot may jam: chance (jamBelow - cond) x jamRate x the gun's jam
//   clearTime  - seconds to clear a jam (x dexterity's reload multiplier); the stuck round is thrown away
//   kit        - condition one use of a cleaning kit puts back, up to kitMax (worn parts need a gunsmith)
//   smith      - the gunsmith's price to restore a whole point of condition (to 1.0), as a share of the gun's
//                value (fixing a rifle takes rifle parts); smithMin is his least charge
export const GUN_CARE = one('GunCare');
// The guns the dead leave: condition range, how full the gun was (of its magazine), and the spare rounds for it they
// had on them, by who carried it. A raider's gun is junk held together with tape; a Remnant soldier's rifle is the
// best thing on the road, and soldiers carry spare magazines.
export const GUN_FOUND = rows('GunFound');
export const START_KIT = one('StartKit'); // the torch is a thing you carry now (WEB_GADGETS2.md)

// Room on your person before any pack: pockets and belt.
export const BODY_LITRES = one('PackSettings').bodyLitres;

// ---- the paperdoll's gear as items (data/gear.js): one catalog, so a piece is found, carried, traded and worn like any
// thing. kind 'armor' (it soaks) or 'gear' (a mod); `slot` is what F on the PACK screen wears it in.
for (const [id, r] of Object.entries(GEAR)) {
  if (ITEMS[id]) continue; // a row of its own in ITEMS wins
  ITEMS[id] = { name: r.name, kind: r.soak ? 'armor' : 'gear', kg: gearKg(r), bulk: gearBulk(r), stack: 1, value: gearValue(r), slot: r.slot, tags: r.tags, desc: r.desc };
}
for (const [table, row] of Object.entries(GEAR_LOOT)) LOOT[table] ??= row;
for (const [table, rows] of Object.entries(GEAR_LOOT_ADD)) if (LOOT[table]) LOOT[table].rows.push(...rows);
// ---- gadgets, drones and the door kit (data/gadgets.js, docs/design/WEB_GADGETS.md): placed, thrown or launched through
// use act 'gadget' / 'drone' (systems/gadgets.js). A drone leaves the pack when it flies and comes back when it lands.
for (const [id, r] of Object.entries(GADGETS)) ITEMS[id] ??= { name: r.name, kind: 'gadget', tags: ['gadget'], ...r.item, use: { act: 'gadget' } }; // car_mine: the workshop's mine dropper loads the same item
for (const [id, r] of Object.entries(DRONES)) ITEMS[`drone_${id}`] ??= { name: r.name, kind: 'drone', ...r.item, use: { act: 'drone' }, tags: ['drone'] };
for (const [id, r] of Object.entries(DOOR_KIT)) ITEMS[id] ??= r;
// ---- GADGETS-2: the kit you wear and look through, what feeds it, your dog's gear (data/gadgets.js KIT, CELLS;
// data/dogs.js DOG_GEAR; docs/design/WEB_GADGETS2.md). Switched on and off through use act 'kit' (systems/kit.js).
for (const [id, r] of Object.entries(KIT)) ITEMS[id] ??= { name: r.name, kind: 'kit', tags: ['kit', r.slot], ...r.item, use: { act: 'kit' } };
for (const [id, r] of Object.entries(CELLS)) ITEMS[id] ??= r;
for (const [id, r] of Object.entries(DOG_GEAR)) ITEMS[id] ??= { name: r.name, kind: 'gear', tags: ['dog_gear'], ...r.item, use: { act: 'doggear' } };
for (const [table, rows] of Object.entries(KIT_LOOT_ADD)) if (LOOT[table]) LOOT[table].rows.push(...rows);
// ---- THE FOUND THINGS (data/fannods.js, docs/design/WEB_FAN_NODS.md): the old revolver and its box, the cane, the jungle
// blade, the lapel counter, the self-heating meal; the case's and the ditch's own tables.
for (const [id, r] of Object.entries(FN_ITEMS)) ITEMS[id] ??= r;
for (const [k, T] of Object.entries(FN_LOOT)) LOOT[k] ??= T;
Object.assign(AMMO_ITEM, FN_AMMO_ITEM); Object.assign(GUN_ITEM, FN_GUN_ITEM);
// ---- THE MAKER's goods (data/makeritems.js, docs/design/WEB_CRAFTING.md): raw stock, made things, benches, manuals; found rarely, never regenerated.
for (const [id, r] of Object.entries(MAKER_ITEMS)) ITEMS[id] ??= r;
for (const add of [MAKER_LOOT_ADD, MAKER_MANUAL_LOOT]) for (const [table, rows] of Object.entries(add)) if (LOOT[table]) LOOT[table].rows.push(...rows);
