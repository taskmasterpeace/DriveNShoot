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
  jerky: { name: 'Jerky', kind: 'food', kg: 0.08, bulk: 0.1, stack: 10, value: 4, use: { need: 'food', amount: 0.12, water: -0.03 },
    desc: 'A strip of dried meat. What kind of meat is a question you stop asking. Salty: it costs you water.' },
  flatbread: { name: 'Flatbread', kind: 'food', kg: 0.2, bulk: 0.3, stack: 4, value: 5, spoils: 48, use: { need: 'food', amount: 0.25 },
    desc: 'Baked on a steel plate in Rust Haven this week. Eat it before it turns.' },
  cactus_fruit: { name: 'Cactus fruit', kind: 'food', kg: 0.1, bulk: 0.15, stack: 8, value: 2, spoils: 36, use: { need: 'food', amount: 0.08, water: 0.06 },
    desc: 'Red pear off a paddle cactus, spines rubbed off in the sand. Wet and sweet.' },
  ration: { name: 'Ration pack', kind: 'food', kg: 0.65, bulk: 0.8, stack: 4, value: 40, use: { need: 'food', amount: 0.55, hp: 8 },
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
  crowbar: { name: 'Crowbar', kind: 'tool', kg: 2.4, bulk: 1.2, stack: 1, value: 18, use: { act: 'pry' }, tags: ['pry', 'steel'],
    desc: 'Forged steel, the paint worn off the end that does the work. Opens what keys don\'t. Loudly.' },
  wrench: { name: 'Wrench', kind: 'tool', kg: 0.6, bulk: 0.3, stack: 1, value: 14, tags: ['wrench', 'steel'],
    desc: 'An adjustable wrench. Any repair goes faster with one.' },
  duct_tape: { name: 'Duct tape', kind: 'tool', kg: 0.3, bulk: 0.3, stack: 1, value: 10, uses: 4, use: { act: 'repair' },
    desc: 'Half a roll. Holds a radiator, a tank, a cracked hose until it doesn\'t.' },
  fuel_can: { name: 'Fuel can', kind: 'part', kg: 8.4, kgEmpty: 1.2, bulk: 11, stack: 1, value: 40, uses: 1, refill: 'fuel', use: { act: 'refuel', litres: 10 },
    desc: 'Ten litres of gasoline that smells like it has been through a few cans. Pour it into anything that runs.' },
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
};

// Where things are found. Each table: weighted rows [item, weight, countMin, countMax]; a container rolls `rolls`
// times (min..max), and a roll can come up empty (the `none` weight).
export const LOOT = {
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
  person: { rolls: [0, 2], none: 3, rows: [['water_bottle', 4, 1, 1], ['jerky', 3, 1, 2], ['rag', 3, 1, 2], ['photograph', 3, 1, 1], ['flatbread', 2, 1, 1], ['wristwatch', 1, 1, 1], ['gold_ring', 1, 1, 1], ['painkillers', 1, 1, 1], ['knife', 1, 1, 1]] },
  raider: { rolls: [1, 3], none: 2, rows: [['jerky', 4, 1, 3], ['water_bottle', 3, 1, 1], ['rag', 3, 1, 2], ['scrap', 2, 1, 2], ['gold_ring', 1, 1, 2], ['knife', 1, 1, 1], ['canteen', 1, 1, 1], ['ammo_smg', 3, 8, 30], ['ammo_pistol', 2, 4, 14], ['ammo_shells', 1, 2, 6]] },
  // A Federal Remnant soldier's pockets and webbing (bases.js): issue kit, nothing personal left.
  soldier: { rolls: [1, 3], none: 2, rows: [['ration', 4, 1, 1], ['canteen', 3, 1, 1], ['bandage', 4, 1, 2], ['first_aid', 1, 1, 1], ['knife', 1, 1, 1], ['photograph', 1, 1, 1], ['ammo_rifle', 4, 10, 40], ['bedroll', 1, 1, 1]] },
};

// What you start with: pockets, a satchel on your back, a bottle and a little food (plus the guns in g.inv).

// The rounds each gun's ammo type is (g.inv.ammo keys) and the item a loadout gun becomes when you put it down.
export const AMMO_ITEM = { pistol: 'ammo_pistol', smg: 'ammo_smg', shells: 'ammo_shells', rifle: 'ammo_rifle' };
export const GUN_ITEM = { pistol: 'gun_pistol', smg: 'gun_smg', shotgun: 'gun_shotgun', rifle: 'gun_rifle' };
// What each gun loses per shot (condition: 1 clean, 0 broken) and how readily it jams once worn (x the base rate).
// A revolver at 0.82 has ~680 shots in it before it breaks; the stamped SMG wears least per shot but fires the most.
export const GUN_WEAR = {
  pistol: { wear: 0.0012, jam: 0.5 },  // a revolver rarely truly jams: a dud, and the cylinder turns past it
  smg: { wear: 0.0007, jam: 1.6 },     // a cheap spring and an open action: dirt stops it
  shotgun: { wear: 0.0018, jam: 0.6 }, // a swollen shell that will not fire
  rifle: { wear: 0.0009, jam: 1 },
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
export const START_KIT = { pack: 'satchel', items: [['water_bottle', 1], ['jerky', 2], ['rag', 2], ['knife', 1]] };

// Room on your person before any pack: pockets and belt.
export const BODY_LITRES = 3;
