import { GEAR, GEAR_LOOT, GEAR_LOOT_ADD, gearKg, gearBulk, gearValue } from './gear.js';
import { GADGETS, DRONES, DOOR_KIT, KIT, CELLS, KIT_LOOT_ADD } from './gadgets.js';
import { DOG_GEAR } from './dogs.js';

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
export const ITEMS = {
  // ---- water -----------------------------------------------------------------------------------------------
  water_bottle: { name: 'Water bottle', kind: 'water', kg: 0.55, kgEmpty: 0.05, bulk: 0.6, stack: 1, value: 6, uses: 3, refill: 'water', use: { need: 'water', amount: 0.16 },
    desc: 'Half a litre in a plastic bottle gone milky in the sun. Three good swallows.' },
  canteen: { name: 'Steel canteen', kind: 'water', kg: 1.25, kgEmpty: 0.3, bulk: 1.1, stack: 1, value: 25, uses: 6, refill: 'water', use: { need: 'water', amount: 0.12, hp: 2 },
    desc: 'A litre in dented steel under a felt cover. Keeps it cooler than plastic does.', tags: ['steel'] },
  water_can: { name: 'Water can', kind: 'water', kg: 10.6, kgEmpty: 0.6, bulk: 12, stack: 1, value: 30, uses: 40, refill: 'water', use: { need: 'water', amount: 0.2 },
    desc: 'Ten litres in a blue plastic can. A week for one careful person. Heavy as sin.' },
  // ---- food ------------------------------------------------------------------------------------------------
  beans_tin: { name: 'Tin of beans', kind: 'food', kg: 0.45, bulk: 0.45, stack: 6, value: 8, use: { need: 'food', amount: 0.3, hp: 3 }, needs: 'blade',
    desc: 'Beans in sauce, label long gone. Keeps forever. You need a blade or an opener to get in.' },
  peaches_tin: { name: 'Tin of peaches', kind: 'food', kg: 0.48, bulk: 0.45, stack: 6, value: 10, use: { need: 'food', amount: 0.22, water: 0.06 }, needs: 'blade',
    desc: 'Peaches in syrup. Drink the syrup; out here nobody wastes it.' },
  jerky: { name: 'Jerky', kind: 'food', kg: 0.08, bulk: 0.1, stack: 10, value: 4, use: { need: 'food', amount: 0.12, water: -0.03 }, dog: { bond: 6, hp: 12 },
    desc: 'A strip of dried meat. What kind of meat is a question you stop asking. Salty: it costs you water.' },
  // From the original game's larder. `dog`: what feeding it to a dog does (systems/dogs.js): bond earned, hp mended.
  dried_meat: { name: 'Dried meat', kind: 'food', kg: 0.4, bulk: 0.4, stack: 6, value: 9, spoils: 120, use: { need: 'food', amount: 0.32, hp: 2, water: -0.04 }, dog: { bond: 10, hp: 30 },
    desc: 'A slab of smoke-dried meat wrapped in paper. A dog will follow you a mile for it. So will people.' },
  coffee: { name: 'Trail coffee', kind: 'food', kg: 0.3, bulk: 0.3, stack: 4, value: 12, use: { need: 'rest', amount: 0.12, water: 0.04 },
    desc: 'Ground coffee in a twist of foil, boiled black in a can. It buys you an hour on your feet.' },
  rotgut: { name: 'Rotgut', kind: 'food', kg: 0.9, kgEmpty: 0.3, bulk: 0.8, stack: 1, value: 14, uses: 4, use: { hp: 3, calm: true, water: -0.05 },
    desc: 'Clear liquor from a still behind somebody\'s garage. Steadies the hands, then doesn\'t.' },
  flatbread: { name: 'Flatbread', kind: 'food', kg: 0.2, bulk: 0.3, stack: 4, value: 5, spoils: 48, use: { need: 'food', amount: 0.25 },
    desc: 'Baked on a steel plate in Rust Haven this week. Eat it before it turns.' },
  cactus_fruit: { name: 'Cactus fruit', kind: 'food', kg: 0.1, bulk: 0.15, stack: 8, value: 2, spoils: 36, use: { need: 'food', amount: 0.08, water: 0.06 },
    desc: 'Red pear off a paddle cactus, spines rubbed off in the sand. Wet and sweet.' },
  ration: { name: 'Ration pack', kind: 'food', kg: 0.65, bulk: 0.8, stack: 4, value: 40, use: { need: 'food', amount: 0.55, hp: 8 }, dog: { bond: 8, hp: 20 },
    desc: 'A sealed meal in olive foil, stamped with a date from before the split. Still good. Probably.', tags: ['military'] },
  honey: { name: 'Jar of honey', kind: 'food', kg: 0.5, bulk: 0.4, stack: 4, value: 15, use: { need: 'food', amount: 0.3, hp: 4 },
    desc: 'Honey does not go off. Somebody kept bees out here once.' },
  // ---- medical ---------------------------------------------------------------------------------------------
  rag: { name: 'Torn rag', kind: 'med', kg: 0.04, bulk: 0.1, stack: 10, value: 1, use: { hp: 4, bleed: true },
    desc: 'A strip of somebody\'s shirt. It will stop the bleeding. It will not keep it clean.' },
  bandage: { name: 'Bandage', kind: 'med', kg: 0.05, bulk: 0.1, stack: 8, value: 12, use: { hp: 12, bleed: true },
    desc: 'A clean roll of gauze, still in the paper.' },
  painkillers: { name: 'Painkillers', kind: 'med', kg: 0.06, bulk: 0.05, stack: 1, value: 18, uses: 8, use: { hp: 6, calm: true },
    desc: 'A brown bottle with eight pills rattling in it. Takes the edge off; does not take the bullet out.' },
  antibiotics: { name: 'Antibiotics', kind: 'med', kg: 0.03, bulk: 0.05, stack: 4, value: 70, use: { hp: 4, cure: true },
    desc: 'A blister pack, a course for one. Worth more than the gun you\'d trade for it.' },
  suture_kit: { name: 'Suture kit', kind: 'med', kg: 0.2, bulk: 0.3, stack: 2, value: 45, use: { hp: 35, bleed: true },
    desc: 'Curved needle, thread, a little bottle of iodine. Sit still.' },
  first_aid: { name: 'First-aid kit', kind: 'med', kg: 0.7, bulk: 1.2, stack: 1, value: 80, uses: 3, use: { hp: 30, bleed: true },
    desc: 'A red tin box with most of what it should have in it. Three proper patch-ups.' },
  // ---- tools -----------------------------------------------------------------------------------------------
  knife: { name: 'Folding knife', kind: 'tool', kg: 0.15, bulk: 0.1, stack: 1, value: 15, tags: ['blade'],
    desc: 'A lock-back with a chipped edge. Opens tins, cuts cloth.' },
  can_opener: { name: 'Can opener', kind: 'tool', kg: 0.1, bulk: 0.1, stack: 1, value: 4, tags: ['blade'],
    desc: 'The little army kind that lives on a keyring.' },
  lockpicks: { name: 'Lockpicks', kind: 'tool', kg: 0.05, bulk: 0.05, stack: 1, value: 30, uses: 6, use: { act: 'pick' }, tags: ['picks'],
    desc: 'A roll of picks and a tension wrench. Quiet. Each lock costs you a pick or two.' },
  hacksaw: { name: 'Hacksaw', kind: 'tool', kg: 0.7, bulk: 0.6, stack: 1, value: 14, tags: ['cut', 'steel'], // UNDER THE STREET: cuts an outfall's bars, slowly and quietly (data/understreet.js WAYS.outfall)
    desc: 'A bow saw for metal and a spare blade. Slow work, and nobody hears it.' },
  crowbar: { name: 'Crowbar', kind: 'tool', kg: 2.4, bulk: 1.2, stack: 1, value: 18, use: { act: 'pry' }, tags: ['pry', 'steel'],
    desc: 'Forged steel, the paint worn off the end that does the work. Opens what keys don\'t. Loudly.' },
  // TIMED ACTIONS (data/actions.js TOOLS; docs/design/WEB_TIMED_ACTIONS.md): break-in tools that wear (slot.wear), a
  // ladder you carry, and the small things look-around and a thorough search turn up. Not in any loot table yet.
  bolt_cutters: { name: 'Bolt cutters', kind: 'tool', kg: 3.2, bulk: 1.4, stack: 1, value: 26, tags: ['cutters', 'steel'],
    desc: 'Two-foot jaws on long handles. A padlock\'s shackle or a run of chain-link, quietly.' },
  sledgehammer: { name: 'Sledgehammer', kind: 'tool', kg: 4.5, bulk: 1.6, stack: 1, value: 20, tags: ['sledge', 'steel'],
    desc: 'Ten pounds on a hickory handle. Any door, any lock, and everyone for a block hears it.' },
  hammer_nails: { name: 'Hammer and nails', kind: 'tool', kg: 1.1, bulk: 0.5, stack: 1, value: 12, tags: ['hammer'],
    desc: 'A claw hammer and a coffee tin of bent nails. Boards go up, boards come down.' },
  ladder_portable: { name: 'Aluminium ladder', kind: 'tool', kg: 7.5, bulk: 2.8, stack: 1, value: 30, use: { act: 'place_ladder' }, tags: ['ladder'],
    desc: 'A folding ladder, sixteen feet open. Set it against a wall and the roof is yours.' },
  door_key: { name: 'Door key', kind: 'paper', kg: 0.01, bulk: 0.01, stack: 4, value: 2,
    desc: 'A brass key on a split ring. Somebody\'s door, somewhere near.' },
  scrap_note: { name: 'Folded note', kind: 'paper', kg: 0.01, bulk: 0.01, stack: 1, value: 0,
    desc: 'A page torn from a pad, folded small. Whoever dropped it was in a hurry.' },
  // The portable radio (systems/radio.js): the stations anywhere, not only in a car. Not in any loot table yet (a content call).
  radio_portable: { name: 'Portable radio', kind: 'tool', kg: 0.7, bulk: 0.6, stack: 1, value: 40, tags: ['radio'],
    desc: 'A battered transistor set with a bent aerial. Comma and period walk the dial.' },
  wrench: { name: 'Wrench', kind: 'tool', kg: 0.6, bulk: 0.3, stack: 1, value: 14, tags: ['wrench', 'steel'],
    desc: 'An adjustable wrench. Any repair goes faster with one.' },
  // The original's blades and the axe: no bare-hands or melee mode in this engine yet, so they are tools first.
  machete: { name: 'Machete', kind: 'tool', kg: 0.9, bulk: 0.7, stack: 1, value: 22, tags: ['blade', 'steel'],
    desc: 'A cane knife with a taped grip. Opens tins, cuts brush, settles arguments.' },
  fire_axe: { name: 'Fire axe', kind: 'tool', kg: 2.8, bulk: 1.6, stack: 1, value: 26, use: { act: 'pry' }, tags: ['pry', 'blade', 'steel'],
    desc: 'A red-handled axe off a firehouse wall. Takes a locked door off its hinges, loudly.' },
  // A road flare (the original's): struck and dropped, it burns where you stand for a minute. Dogs and the dead keep off it.
  flare: { name: 'Road flare', kind: 'tool', kg: 0.25, bulk: 0.2, stack: 6, value: 6, use: { act: 'flare' },
    desc: 'A red flare in a paper tube. Strike it and put it down: a minute of fire nothing with sense walks into.' },
  duct_tape: { name: 'Duct tape', kind: 'tool', kg: 0.3, bulk: 0.3, stack: 1, value: 10, uses: 4, use: { act: 'repair' },
    desc: 'Half a roll. Holds a radiator, a tank, a cracked hose until it doesn\'t.' },
  fuel_can: { name: 'Fuel can', kind: 'part', kg: 8.4, kgEmpty: 1.2, bulk: 11, stack: 1, value: 40, uses: 1, refill: 'fuel', use: { act: 'refuel', litres: 10 },
    desc: 'Ten litres of gasoline that smells like it has been through a few cans. Pour it into anything that runs.' },
  // The roadside (systems/roadside.js): E at a dead station's fill caps draws what is left in its underground tank.
  siphon_hose: { name: 'Siphon hose', kind: 'tool', kg: 0.7, bulk: 0.8, stack: 1, value: 15, tags: ['hose'],
    desc: 'Three metres of fuel line and a hand bulb. Down a station\'s fill pipe, the dregs come up into your car or your cans.' },
  spare_tyre: { name: 'Spare tyre', kind: 'part', kg: 9, bulk: 40, stack: 1, value: 35, use: { act: 'tyre' },
    desc: 'A spare on a rim, more patches than tread. Swaps for a flat.' },
  scrap: { name: 'Scrap steel', kind: 'part', kg: 1.5, bulk: 1, stack: 10, value: 3, tags: ['steel'],
    desc: 'Sheet steel, a bent hubcap, a length of rebar. A mechanic can make plate out of it.' },
  spark_plugs: { name: 'Spark plugs', kind: 'part', kg: 0.2, bulk: 0.1, stack: 4, value: 12, use: { act: 'repair' },
    desc: 'A set of four, wrapped in an oily rag. A misfiring engine wants these.' },
  // ---- packs (worn on your back) ---------------------------------------------------------------------------
  // Sleep anywhere (survival.js): worse than a bed, better than the ground. Bulky: it wants a backpack.
  bedroll: { name: 'Bedroll', kind: 'tool', kg: 1.6, bulk: 7, stack: 1, value: 18, use: { act: 'sleep' },
    desc: 'A rolled blanket and a sheet of foam, tied with cord. Better than the ground; not much better.' },
  satchel: { name: 'Satchel', kind: 'pack', kg: 0.5, bulk: 2, stack: 1, value: 12, pack: 8,
    desc: 'A canvas bag on a strap. Room for a few days of water and food.' },
  backpack: { name: 'Backpack', kind: 'pack', kg: 1.2, bulk: 4, stack: 1, value: 35, pack: 22,
    desc: 'A school pack, the zip mended with wire. Twenty-odd litres.' },
  ruck: { name: 'Frame ruck', kind: 'pack', kg: 2.3, bulk: 6, stack: 1, value: 90, pack: 45, tags: ['military'],
    desc: 'An army ruck on an alloy frame. Carries like a mule; you will feel every kilo of it.' },
  // ---- rounds and guns ---------------------------------------------------------------------------------------
  // Rounds are real things in your pack: they weigh, take room, sit in a trunk, get looted and traded. The gun you
  // fire draws them through g.inv.ammo (inventory.bindAmmo), so a reload takes rounds out of the pack. Bulk is per
  // round (a box of fifty pistol rounds is about a third of a litre; a shotgun shell is fat).
  ammo_pistol: { name: 'Pistol rounds', kind: 'ammo', kg: 0.012, bulk: 0.006, stack: 200, value: 0.4, ammo: 'pistol',
    desc: 'Big, slow revolver rounds, loose in a paper box gone soft at the corners.' },
  ammo_smg: { name: 'SMG rounds', kind: 'ammo', kg: 0.008, bulk: 0.004, stack: 300, value: 0.3, ammo: 'smg',
    desc: 'Small, fast rounds for a submachine gun. Some are reloads; you can tell by the dents.' },
  ammo_shells: { name: 'Shotgun shells', kind: 'ammo', kg: 0.045, bulk: 0.04, stack: 50, value: 1.2, ammo: 'shells',
    desc: 'Twelve-gauge buckshot in faded red hulls. Bulky; every one counts.' },
  ammo_rifle: { name: 'Rifle rounds', kind: 'ammo', kg: 0.025, bulk: 0.012, stack: 150, value: 0.9, ammo: 'rifle',
    desc: 'Long brass rounds on stripper clips, the old government\'s issue.', tags: ['military'] },
  // A gun as a thing: in a trunk, on a body, on the ground. On you, a gun is in your loadout (g.inv.weapons), not the
  // list: it hangs on a sling or sits in a holster. `cond` 1 = clean, 0 = broken; `loaded` = rounds in it.
  gun_pistol: { name: '.45 revolver', kind: 'gun', kg: 1.2, bulk: 0.8, stack: 1, value: 80, weapon: 'pistol',
    desc: 'A six-shot revolver, the bluing worn to grey where a hand has held it for twenty years.' },
  gun_smg: { name: 'Rust-9 SMG', kind: 'gun', kg: 3.2, bulk: 2.6, stack: 1, value: 220, weapon: 'smg',
    desc: 'A stamped-steel submachine gun from a backyard shop. Eats rounds; jams when it is dirty.' },
  gun_shotgun: { name: 'Sawn-off', kind: 'gun', kg: 3.3, bulk: 3.5, stack: 1, value: 160, weapon: 'shotgun',
    desc: 'A double barrel cut down to the forestock with a hacksaw. Two shots, then a long minute.' },
  gun_rifle: { name: 'Service rifle', kind: 'gun', kg: 3.8, bulk: 5.5, stack: 1, value: 350, weapon: 'rifle',
    desc: 'The Federal Remnant\'s issue rifle, serial filed off. Reaches further than anything else out here.', tags: ['military'] },
  // The original game's pistol and pump shotgun, carried over (combat.js WEAPONS rows 'auto' and 'pump').
  gun_auto: { name: 'Self-loader', kind: 'gun', kg: 1.0, bulk: 0.7, stack: 1, value: 120, weapon: 'auto',
    desc: 'A twelve-round semi-automatic pistol in the small, fast calibre the SMGs eat. Quick to hand, quick to empty.' },
  gun_pump: { name: 'Pump shotgun', kind: 'gun', kg: 3.4, bulk: 4.5, stack: 1, value: 190, weapon: 'pump',
    desc: 'A full-length pump gun with five in the tube. Slower to fire than the sawn-off, slower to run dry.' },
  cleaning_kit: { name: 'Gun cleaning kit', kind: 'tool', kg: 0.35, bulk: 0.4, stack: 1, value: 25, uses: 5, use: { act: 'clean' },
    desc: 'A rod, brushes, patches and a little can of oil. Takes the grit out of whatever you are holding.' },
  // ---- valuables and keepsakes -----------------------------------------------------------------------------
  wristwatch: { name: 'Wristwatch', kind: 'valuable', kg: 0.08, bulk: 0.05, stack: 1, value: 20,
    desc: 'It still ticks. Somebody wound it every morning until they didn\'t.' },
  gold_ring: { name: 'Gold ring', kind: 'valuable', kg: 0.01, bulk: 0.01, stack: 5, value: 45,
    desc: 'Somebody\'s promise. Worth more than a promise now.' },
  silverware: { name: 'Silverware', kind: 'valuable', kg: 0.2, bulk: 0.2, stack: 5, value: 6,
    desc: 'A fork and two spoons, real silver. Traders weigh it.' },
  road_atlas: { name: 'Road atlas', kind: 'paper', kg: 0.6, bulk: 0.8, stack: 1, value: 10,
    desc: 'A spiral-bound atlas of the old states, the borders inked over in three colours of pen.' },
  photograph: { name: 'Photograph', kind: 'paper', kg: 0.01, bulk: 0.01, stack: 1, value: 0,
    desc: 'A family on a porch, squinting into the sun. Nobody you know.' },
  // What is left of a dog that did not make it (systems/dogs.js): on its remains, never found anywhere else.
  dog_collar: { name: 'Dog collar', kind: 'paper', kg: 0.08, bulk: 0.05, stack: 1, value: 0, tags: ['keepsake'],
    desc: 'A worn leather collar with a name scratched into the buckle. You know the name.' },
  // Given, never found: Sheriff Okonkwo pins one on a known deputy (docs/design/WEB_ROLES.md) and takes it back.
  tin_star: { name: "Deputy's star", kind: 'paper', kg: 0.03, bulk: 0.02, stack: 1, value: 0, tags: ['badge'],
    desc: 'Pressed tin, the points filed round, RUST HAVEN stamped in a ring. Okonkwo pins one on the people who keep her peace.' },
};

// Where things are found. Each table: weighted rows [item, weight, countMin, countMax]; a container rolls `rolls`
// times (min..max), and a roll can come up empty (the `none` weight).
// Florida's game (docs/design/WEB_FLORIDA.md §3.6): what a dead alligator gives up. Rows, like everything here.
Object.assign(ITEMS, {
  gator_meat: { name: 'Gator tail meat', kind: 'food', kg: 0.9, bulk: 0.8, stack: 4, value: 9, spoils: 24, use: { need: 'food', amount: 0.35, hp: 2 },
    desc: 'White, tough, tastes like the swamp it came out of. Cook it today: in this heat it turns by tomorrow.' },
  gator_hide: { name: 'Gator hide', kind: 'valuable', kg: 2.2, bulk: 2.5, stack: 2, value: 35,
    desc: 'A belly hide, scraped and salted. Traders in Meridian pay for these: boots, belts, holsters.' },
});
export const LOOT = {
  gator: { rolls: [1, 2], none: 0, rows: [['gator_meat', 5, 1, 2], ['gator_hide', 3, 1, 1]] },
  kitchen: { rolls: [1, 3], none: 4, rows: [['beans_tin', 5, 1, 2], ['peaches_tin', 3, 1, 1], ['water_bottle', 4, 1, 2], ['honey', 1, 1, 1], ['can_opener', 2, 1, 1], ['knife', 1, 1, 1], ['silverware', 2, 1, 3], ['flatbread', 1, 1, 1]] },
  bathroom: { rolls: [1, 2], none: 3, rows: [['bandage', 4, 1, 2], ['rag', 3, 1, 3], ['painkillers', 2, 1, 1], ['antibiotics', 1, 1, 1], ['suture_kit', 1, 1, 1]] },
  bedroom: { rolls: [1, 2], none: 5, rows: [['wristwatch', 2, 1, 1], ['gold_ring', 1, 1, 1], ['photograph', 3, 1, 1], ['satchel', 1, 1, 1], ['backpack', 1, 1, 1], ['water_bottle', 2, 1, 1], ['road_atlas', 1, 1, 1], ['bedroll', 2, 1, 1]] },
  garage: { rolls: [1, 3], none: 3, rows: [['wrench', 3, 1, 1], ['duct_tape', 3, 1, 1], ['scrap', 4, 1, 4], ['spark_plugs', 2, 1, 1], ['fuel_can', 2, 1, 1], ['crowbar', 1, 1, 1], ['spare_tyre', 1, 1, 1], ['cleaning_kit', 1, 1, 1]] },
  // Ike's shop: rounds of every kind, the odd second-hand gun, the kit to keep one running.
  gunsmith: { rolls: [2, 4], none: 1, rows: [['ammo_pistol', 5, 12, 36], ['ammo_smg', 4, 20, 60], ['ammo_shells', 3, 4, 12], ['ammo_rifle', 1, 10, 30], ['cleaning_kit', 3, 1, 1], ['gun_pistol', 1, 1, 1], ['gun_smg', 1, 1, 1], ['wrench', 1, 1, 1], ['duct_tape', 1, 1, 1]] },
  office: { rolls: [1, 2], none: 5, rows: [['photograph', 2, 1, 1], ['water_bottle', 2, 1, 1], ['jerky', 2, 1, 3], ['lockpicks', 1, 1, 1], ['road_atlas', 2, 1, 1], ['painkillers', 1, 1, 1], ['ammo_pistol', 1, 6, 18]] },
  military: { rolls: [2, 4], none: 2, rows: [['ration', 5, 1, 3], ['canteen', 3, 1, 1], ['first_aid', 2, 1, 1], ['bandage', 3, 2, 4], ['antibiotics', 1, 1, 2], ['ruck', 1, 1, 1], ['crowbar', 1, 1, 1], ['ammo_rifle', 4, 15, 60], ['cleaning_kit', 1, 1, 1]] },
  wreck: { rolls: [0, 2], none: 5, rows: [['scrap', 5, 1, 3], ['fuel_can', 1, 1, 1], ['water_bottle', 2, 1, 1], ['jerky', 2, 1, 2], ['duct_tape', 1, 1, 1], ['photograph', 1, 1, 1]] },
  desert: { rolls: [1, 1], none: 1, rows: [['cactus_fruit', 6, 1, 3], ['water_bottle', 1, 1, 1], ['jerky', 1, 1, 2]] },
  // The Phoenix ring's shops (data/ring.js): a corner store's shelves, a fuel stop's counter and back room.
  storefront: { rolls: [1, 3], none: 4, rows: [['beans_tin', 4, 1, 3], ['peaches_tin', 3, 1, 2], ['water_bottle', 4, 1, 2], ['jerky', 3, 1, 2], ['painkillers', 1, 1, 1], ['duct_tape', 1, 1, 1], ['can_opener', 1, 1, 1], ['road_atlas', 1, 1, 1]] },
  pumps: { rolls: [1, 3], none: 3, rows: [['fuel_can', 3, 1, 1], ['spare_tyre', 1, 1, 1], ['spark_plugs', 2, 1, 1], ['jerky', 2, 1, 2], ['water_bottle', 2, 1, 1], ['road_atlas', 2, 1, 1], ['duct_tape', 1, 1, 1]] },
  person: { rolls: [0, 2], none: 3, rows: [['water_bottle', 4, 1, 1], ['jerky', 3, 1, 2], ['rag', 3, 1, 2], ['photograph', 3, 1, 1], ['flatbread', 2, 1, 1], ['wristwatch', 1, 1, 1], ['gold_ring', 1, 1, 1], ['painkillers', 1, 1, 1], ['knife', 1, 1, 1]] },
  raider: { rolls: [1, 3], none: 2, rows: [['jerky', 4, 1, 3], ['water_bottle', 3, 1, 1], ['rag', 3, 1, 2], ['scrap', 2, 1, 2], ['gold_ring', 1, 1, 2], ['knife', 1, 1, 1], ['canteen', 1, 1, 1], ['ammo_smg', 3, 8, 30], ['ammo_pistol', 2, 4, 14], ['ammo_shells', 1, 2, 6]] },
  // A Federal Remnant soldier's pockets and webbing (bases.js): issue kit, nothing personal left.
  soldier: { rolls: [1, 3], none: 2, rows: [['ration', 4, 1, 1], ['canteen', 3, 1, 1], ['bandage', 4, 1, 2], ['first_aid', 1, 1, 1], ['knife', 1, 1, 1], ['photograph', 1, 1, 1], ['ammo_rifle', 4, 10, 40], ['bedroll', 1, 1, 1]] },
};

// What you start with: pockets, a satchel on your back, a bottle and a little food (plus the guns in g.inv).

// The rounds each gun's ammo type is (g.inv.ammo keys) and the item a loadout gun becomes when you put it down.
export const AMMO_ITEM = { pistol: 'ammo_pistol', smg: 'ammo_smg', shells: 'ammo_shells', rifle: 'ammo_rifle' };
export const GUN_ITEM = { pistol: 'gun_pistol', smg: 'gun_smg', shotgun: 'gun_shotgun', rifle: 'gun_rifle', auto: 'gun_auto', pump: 'gun_pump' };
// What each gun loses per shot (condition: 1 clean, 0 broken) and how readily it jams once worn (x the base rate).
// A revolver at 0.82 has ~680 shots in it before it breaks; the stamped SMG wears least per shot but fires the most.
export const GUN_WEAR = {
  pistol: { wear: 0.0012, jam: 0.5 },  // a revolver rarely truly jams: a dud, and the cylinder turns past it
  smg: { wear: 0.0007, jam: 1.6 },     // a cheap spring and an open action: dirt stops it
  shotgun: { wear: 0.0018, jam: 0.6 }, // a swollen shell that will not fire
  rifle: { wear: 0.0009, jam: 1 },
  auto: { wear: 0.001, jam: 0.9 },    // a slide that wants oil
  pump: { wear: 0.0014, jam: 0.7 },   // a short-stroked pump feeds nothing
};
// Keeping a gun working (docs/design/WEB_INVENTORY.md, guns):
//   jamBelow   - below this condition every shot may jam: chance (jamBelow - cond) x jamRate x the gun's jam
//   clearTime  - seconds to clear a jam (x dexterity's reload multiplier); the stuck round is thrown away
//   kit        - condition one use of a cleaning kit puts back, up to kitMax (worn parts need a gunsmith)
//   smith      - the gunsmith's price to restore a whole point of condition (to 1.0), as a share of the gun's
//                value (fixing a rifle takes rifle parts); smithMin is his least charge
export const GUN_CARE = { jamBelow: 0.65, jamRate: 0.06, clearTime: 0.9, kit: 0.35, kitMax: 0.95, smith: 0.6, smithMin: 10 };
// The guns the dead leave: condition range, how full the gun was (of its magazine), and the spare rounds for it they
// had on them, by who carried it. A raider's gun is junk held together with tape; a Remnant soldier's rifle is the
// best thing on the road, and soldiers carry spare magazines.
export const GUN_FOUND = {
  raider: { cond: [0.18, 0.6], loaded: [0, 0.6], spare: [0, 12] },
  soldier: { cond: [0.62, 0.95], loaded: [0.3, 1], spare: [20, 60] },
  warden: { cond: [0.55, 0.9], loaded: [0.4, 1], spare: [6, 24] },
  default: { cond: [0.3, 0.8], loaded: [0, 0.8], spare: [0, 8] },
};
export const START_KIT = { pack: 'satchel', items: [['water_bottle', 1], ['jerky', 2], ['rag', 2], ['knife', 1], ['flashlight', 1], ['battery_cell', 1]] }; // the torch is a thing you carry now (WEB_GADGETS2.md)

// Room on your person before any pack: pockets and belt.
export const BODY_LITRES = 3;

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
