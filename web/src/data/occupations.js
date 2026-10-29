// OCCUPATIONS (docs/design/WEB_OCCUPATIONS.md): the work people do in the settlements of the country. A row is a JOB:
// where it is done (building kinds from data/citygen.js KINDS, a site's hero structures by name, or an open-air spot),
// its shift on the game clock, what the worker carries, what the work makes (law 2: goods come from real work and only
// from it; world/occupations.js counts the work hours, systems/workforce.js pays them out), what the job fits (the
// settlement tags below) and how the worker talks.
//
// A settlement's MIX is a pure function of these rows and its plan record (world/occupations.js mixOf): its TAGS come
// from its archetype, its biome, its site row's kind, what its site row makes, its hero structures and who holds it
// (FACTION_CLASS); every job scores base + the sum of its fit over those tags, times its faction factor, times its
// wealth fit, times a per-settlement jitter (MIX.jitter: two towns of a kind never hire alike); the workforce is shared
// out by those scores, never more than a job's cap of it (row `max`, else MIX.cap), never a job with no workplace.
//
// Row fields:
//   name     what people call the job.                 at     building kinds it is worked in (any of)
//   hero     a regex over a site's hero structure names (a pier, a headframe) that also counts as its workplace
//   out      an open-air spot instead: street | edge | gate (walls or a hold) | dock (water) | field (land worked)
//   shift    [from, to] game hours (to < from runs past midnight)
//   carry    ITEMS ids the worker has on them        makes  [item, work hours per unit, most a workplace keeps, label]
//   deals    what they trade (data/trade.js deal kinds), for a worker who sells rather than makes
//   fit      { tag: weight } added to base when the settlement has the tag
//   needs    the settlement must have at least one of these tags        bans   none of these tags
//   fac      { class: factor } (0 = never; missing = 1)    wealth [lo, hi]: outside it the score is x MIX.offWealth
//   minN     the smallest workforce that has one of these (a judge needs a town)   one: at most one worker
//   talk     what they say when you ask about the work (three or more lines; the dialogue picks by the hour)

export const MIX = {
  workShare: 0.55, // of a settlement's people, the share who hold a job here (the rest are children, the old, the idle)
  minWorkers: 8, maxWorkers: 64,
  minPop: 6,       // a settlement whose most people are fewer than this is nobody's workplace (a dead ruin)
  cap: 0.4,        // the most of a workforce one job may take, unless its row says `max`
  jitter: 0.5,     // per settlement and job: score x exp(jitter x u), u in [-1, 1] from the seed
  offWealth: 0.35, // a job outside its wealth band
  neighbourKm: 80, // same-kind settlements this close are neighbours for the diversity goal
  tailN: 2,        // a trade that would keep fewer people than this here (the long tail of one-hand jobs)...
  tailKeep: 0.7,   // ...is here with this chance, by the seed (1 = always: every town keeps its whole tail)
  tailFrom: 24,    // the tail only thins a workforce at least this big (a hamlet keeps what little it has)
  tailCore: 1.5,   // ...unless it fits the place at least this well (the sum of its fit over the place's tags): a core trade stays
};

// THE DIVERSITY GOAL (tools/role-diversity.mjs; WEB_DEPTH_PLAN §5): per settlement, Shannon diversity of its jobs at
// least `shannon`, no job over `maxShare` of it, and its nearest same-kind neighbour's set of jobs at least `jaccard`
// different (Jaccard distance).
export const GOAL = { shannon: 1.6, maxShare: 0.25, jaccard: 0.3 };

// ---- tags --------------------------------------------------------------------------------------------------------------
export const TAGS = ['port', 'sea', 'water', 'coast', 'river', 'lake', 'swamp', 'fishing', 'boats', 'desert', 'dry', 'plains', 'forest', 'cold', 'hot', 'farm', 'ranch',
  'mine', 'mill', 'oil', 'salt', 'timber', 'industry', 'military', 'trade', 'market', 'road', 'rail', 'ruin', 'holdout', 'walled', 'camp', 'civic', 'college', 'casino',
  'leisure', 'metro', 'suburb', 'oasis', 'pueblo', 'hills', 'florida', 'still', 'hunting', 'salvage', 'slaving', 'raiding', 'healing', 'arms', 'power', 'tech', 'garage',
  'news', 'faith', 'bar', 'jail', 'waterworks', 'landmark', 'station', 'company'];

export const ARCH_TAGS = {
  sonoran_sprawl: ['metro', 'road'], adobe_pueblo: ['pueblo', 'farm'], plains_grain_town: ['farm', 'rail', 'market'], rustbelt_mill: ['mill', 'industry', 'river'],
  appalachian_hollow: ['mine', 'hills', 'still'], gulf_stilt_town: ['fishing', 'boats'], swamp_ferry: ['boats', 'still'], new_england_green: ['civic', 'market'],
  pacific_timber_port: ['port', 'timber'], alpine_mining_stack: ['mine', 'hills'], interstate_exit: ['road', 'trade'], county_seat: ['civic', 'market', 'farm'],
  company_town: ['mine', 'mill', 'company'], college_town: ['college', 'civic'], military_town: ['military', 'road'], dead_suburb: ['suburb', 'salvage'],
  port_wharf: ['port', 'fishing'], refinery_town: ['oil', 'industry'], oasis_ring: ['oasis', 'trade'], tundra_station: ['station'], badlands_crossroads: ['trade', 'road', 'ranch'],
  salt_works: ['salt', 'industry'], delta_river_town: ['river', 'farm', 'market'], hot_zone_ruin: ['ruin', 'hot', 'salvage'], walled_stronghold: ['walled', 'market'],
  boom_strip: ['casino', 'metro', 'leisure'], military_base: ['military'],
};
export const BIOME_TAGS = {
  desert_sonoran: ['desert', 'dry'], desert_mojave: ['desert', 'dry'], salt_flat: ['desert', 'dry', 'salt'], high_plateau: ['dry'], badlands: ['dry'],
  great_plains: ['plains'], prairie_farm: ['plains', 'farm'], temperate_forest: ['forest'], appalachian: ['forest', 'hills'], northern_pine: ['forest', 'cold'],
  pacific_rain: ['forest', 'coast', 'sea', 'water'], alpine: ['cold', 'hills'], tundra_north: ['cold'], deep_south_swamp: ['swamp', 'water'],
  gulf_coast: ['coast', 'sea', 'water'], atlantic_coast: ['coast', 'sea', 'water'], river_delta: ['river', 'water'], great_lakes_rust: ['lake', 'water'], hot_ground: ['hot'],
};
// A site row's kind (data/sites/*.js)
export const SITE_KIND_TAGS = {
  holdout: ['holdout'], fort: ['holdout', 'walled'], ruin: ['ruin', 'salvage'], trade: ['trade', 'market'], camp: ['camp'], station: ['station', 'road'],
  industrial: ['industry'], landmark: ['landmark'], farm: ['farm', 'ranch'], military: ['military'],
};
// What a site row's economy makes, by word
export const MAKES_TAGS = [
  [/fish|clam|crab|oyster|lobster|shrimp|crawfish/, 'fishing'], [/boat|ferry|ship|hull|passage|river_trade|sail/, 'boats'],
  [/ore|coal|silver|gold|copper|lead|iron|stone|cement|mines|isotopes/, 'mine'], [/fuel|oil|gasoline|diesel|propellant|crude/, 'oil'],
  [/grain|corn|flour|bread|vegetable|seed|rice|apple|fruit|garden|maize|hay|cotton|sugar|wine|cider|honey/, 'farm'],
  [/cattle|beef|horse|hide|leather|wool|lamb|jerky|meat|cheese|venison/, 'ranch'], [/moonshine|whiskey|rum|liquor|beer|ale|drink/, 'still'],
  [/gator|frog|snake|fur|hunt/, 'hunting'], [/salvage|scrap|old_tech|relic|car_parts|old_goods/, 'salvage'], [/slave|captive|tribute/, 'slaving'],
  [/raid|plunder|toll/, 'raiding'], [/medicine|herb|healing/, 'healing'], [/ammo|gun|weapon|arms|powder|ordnance|shell|cannon/, 'arms'],
  [/power|electric|energy|heat/, 'power'], [/timber|lumber|charcoal|firewood|paper/, 'timber'], [/water/, 'waterworks'], [/tech|electronic|science|research|lab_/, 'tech'],
  [/vehicle|repair|car_rebuild|machine_parts|engineering/, 'garage'], [/gambl|games|fight_bets|pleasure|rides|spectacle/, 'leisure'],
  [/trade|barter|market|everything|caravan/, 'market'], [/news|printing|signal|comms|forecast/, 'news'], [/salt/, 'salt'], [/rail|transit/, 'rail'],
];
// A site's hero structures (row.structures[].kind), by word
export const HERO_TAGS = [
  [/pier|wharf|dock|marina|boat|ferry|slip|harbor|lighthouse/, 'port'], [/mine|headframe|tipple|quarry|ore_|crusher|stamp_mill/, 'mine'],
  [/barn|silo|orchard|vineyard|farm|corral|ranch|grain/, 'farm'], [/derrick|pumpjack|refiner|tank_farm|crude|tank_battery/, 'oil'],
  [/church|chapel|temple|tabernacle|cathedral|mission/, 'faith'], [/hospital|clinic/, 'healing'], [/saloon|tavern|inn\b|cantina|roadhouse/, 'bar'],
  [/barracks|armory|hangar|motor_pool|magazine/, 'military'], [/slave/, 'slaving'], [/casino/, 'leisure'], [/rail|depot|roundhouse/, 'rail'],
  [/school|college/, 'college'], [/jail|prison|cellhouse|cell_block/, 'jail'], [/market/, 'market'], [/radio|antenna/, 'news'], [/mill|factory|plant/, 'industry'],
];
// Who holds a site (row.society.faction), by word: the first match wins; nothing matches = free
export const FACTION_CLASS = [
  [/raider|gang|pirate|toll|night_family|invaders/, 'raider'], [/lords|court|crown|samurai|eastern_state/, 'warlord'],
  [/soldier|warden|remnant|trooper/, 'garrison'], [/cult|mutant|visions/, 'cult'], [/merchant|trader|trade|league|rail|compact/, 'merchant'],
  [/trust|institute/, 'company'],
];
export const CLASSES = ['free', 'raider', 'warlord', 'garrison', 'cult', 'merchant', 'company'];
// A planned town (no site row) is held by: its archetype's class, else free, with a seeded chance of raiders
export const TOWN_CLASS = { walled_stronghold: 'warlord', company_town: 'company', military_town: 'garrison', raiderChance: { badlands_crossroads: 0.45, interstate_exit: 0.25, refinery_town: 0.3, salt_works: 0.2 } };
// A site's wealth by its kind (towns use their archetype's), before a seeded +-0.15
export const SITE_WEALTH = { holdout: 0.5, fort: 0.5, ruin: 0.15, trade: 0.55, camp: 0.25, station: 0.35, industrial: 0.35, landmark: 0.3, farm: 0.4, military: 0.45 };

// ---- the jobs ----------------------------------------------------------------------------------------------------------
const DAY = [7, 18], DAWN = [4, 13], LATE = [14, 23], NIGHT = [20, 6], EARLY = [5, 15];
const J = (o) => ({ base: 0.6, fit: {}, carry: [], talk: [], ...o });
export const OCCUPATIONS = {
  // everyday work, found almost anywhere people live
  cook: J({ name: 'cook', at: ['diner', 'saloon', 'hotel', 'truck_stop'], shift: EARLY, carry: ['knife', 'rag'], makes: ['flatbread', 3, 12, 'flatbread off the griddle'], base: 0.9, fit: { market: 0.6, road: 0.6, trade: 0.4, casino: 0.4 },
    talk: ['Grease, flour and whatever the hunters bring. That is the menu.', 'Nobody eats free. Not even the sheriff.', 'Griddle is hot by five. Bread is gone by noon.'] }),
  barkeep: J({ name: 'barkeep', at: ['saloon'], hero: 'saloon|tavern|cantina|roadhouse', shift: LATE, carry: ['rotgut', 'rag'], deals: ['food', 'water'], base: 0.7, fit: { bar: 1, trade: 0.5, leisure: 0.6, road: 0.3 }, max: 0.15,
    talk: ['Drink or talk. Both cost.', 'Every rumour in this valley crosses my bar sooner or later.', 'You start a fight in here, you finish it outside.'] }),
  storekeeper: J({ name: 'storekeeper', at: ['shop'], hero: 'store|trading_post|general', shift: DAY, carry: ['road_atlas'], deals: ['food', 'tool', 'pack'], base: 0.9, fit: { market: 0.8, trade: 0.6, civic: 0.3 }, max: 0.2, minN: 10,
    talk: ['Shelves fill when a caravan comes in. Not before.', 'I trade fair. Ask anybody who is still alive.', 'Scrip, brass or something worth more than both.'] }),
  mechanic: J({ name: 'mechanic', at: ['auto_shop', 'garage', 'gas_station', 'truck_stop'], shift: DAY, carry: ['wrench', 'mechanic_wraps', 'spark_plugs'], makes: ['spark_plugs', 6, 8, 'plugs rebuilt from wrecks'], base: 0.7, fit: { road: 0.8, garage: 1, oil: 0.4, trade: 0.3 },
    talk: ['Bring me the part and I fix the car. Bring me nothing and I fix nothing.', 'Half these engines run on prayer and baling wire.', 'Every wreck on that road is a parts shelf to me.'] }),
  water_carrier: J({ name: 'water carrier', out: 'street', shift: DAWN, carry: ['water_can', 'canteen'], makes: ['water_bottle', 2, 16, 'filtered water'], base: 0.4, fit: { desert: 1.2, oasis: 1.4, dry: 0.6, waterworks: 1 },
    talk: ['Two trips to the well before the sun clears the roofs.', 'Clear water is the only money nobody argues with.', 'Boil it twice. The well is not what it was.'] }),
  scavenger: J({ name: 'scavenger', out: 'edge', shift: DAY, carry: ['crowbar', 'satchel'], makes: ['scrap', 3, 20, 'salvage off the dead streets'], base: 0.5, fit: { ruin: 1.4, salvage: 1.2, suburb: 1, metro: 0.6, hot: 0.6 }, wealth: [0, 0.6], max: 0.22,
    talk: ['The old houses still give, if you know which wall to open.', 'Copper wire, a good spring, a sealed tin. That is a good day.', 'The dead streets are not empty. Walk quiet.'] }),
  guard: J({ name: 'guard', out: 'gate', shift: DAY, carry: ['gun_shotgun', 'ammo_shells'], base: 0.4, fit: { walled: 1, holdout: 1, market: 0.3, metro: 0.3 }, fac: { raider: 0.6 },
    talk: ['Keep your hands where I can see them inside the wall.', 'Day watch is boring. Night watch is not.', 'We let traders in. We let raiders in once.'] }),
  night_watch: J({ name: 'night watch', out: 'gate', shift: NIGHT, carry: ['gun_rifle', 'ammo_rifle', 'flare'], base: 0.25, fit: { walled: 0.9, holdout: 0.9, camp: 0.4 },
    talk: ['Dark is when they come. So dark is when I work.', 'A flare up means wake everybody.', 'I count the lights on the road every night.'] }),
  medic: J({ name: 'medic', at: ['clinic', 'hospital'], hero: 'hospital|clinic|infirmary', shift: DAY, carry: ['bandage', 'suture_kit', 'painkillers'], makes: ['bandage', 4, 10, 'boiled and rolled bandages'], base: 0.5, fit: { healing: 1.4, civic: 0.5, college: 0.5 }, max: 0.15,
    talk: ['I stitch what comes through the door. I do not ask how it happened.', 'Antibiotics are worth more than your car.', 'Wash the wound. Most die of the dirt, not the bullet.'] }),
  preacher: J({ name: 'preacher', at: ['church'], hero: 'church|chapel|temple|tabernacle|mission', shift: [8, 16], carry: ['photograph'], base: 0.3, fit: { faith: 1.4, civic: 0.4 }, fac: { cult: 2.5 }, one: true,
    talk: ['The world ended. People still need somewhere to put their grief.', 'Sunday we feed whoever comes. That is the whole sermon.', 'I bury them and I marry them. Lately more of the first.'] }),
  teacher: J({ name: 'teacher', at: ['school'], hero: 'school|college', shift: [8, 14], carry: ['road_atlas'], base: 0.3, fit: { college: 1.2, civic: 0.8 }, fac: { raider: 0, warlord: 0.4 }, minN: 14, max: 0.12,
    talk: ['If they can read a map and count rounds, I have done my job.', 'The children ask what the stars were for. I tell them: ships.', 'Books are fuel to most people. Not in my room.'] }),
  washer: J({ name: 'washer', out: 'street', shift: [6, 15], carry: ['rag'], makes: ['rag', 2, 20, 'clean rags'], base: 0.35, fit: { market: 0.3, water: 0.4 }, wealth: [0, 0.6],
    talk: ['Lye, a board and a good arm.', 'You can tell who works by the dirt on what they bring me.', 'Blood comes out in cold water. I would know.'] }),
  carpenter: J({ name: 'carpenter', at: ['warehouse', 'barn'], shift: DAY, carry: ['planks', 'work_gloves'], makes: ['planks', 3, 16, 'planed boards'], base: 0.5, fit: { timber: 1.4, forest: 0.8, walled: 0.4, boats: 0.4 },
    talk: ['Every board in a barricade went through my hands.', 'Pull nails from the ruins, straighten them, use them again.', 'Good wood is getting scarce. The old barns are my forest.'] }),
  smith: J({ name: 'smith', at: ['auto_shop', 'barn', 'warehouse'], shift: DAY, carry: ['wrench', 'work_gloves'], makes: ['knife', 8, 6, 'blades from leaf springs'], base: 0.45, fit: { farm: 0.7, ranch: 0.6, mine: 0.6, pueblo: 0.5, arms: 0.8 },
    talk: ['A car spring makes the best blade you will ever carry.', 'Shoes for horses, hinges for gates, hooks for meat. All day.', 'Coal is dear. I burn what the woodcutters bring.'] }),
  tanner: J({ name: 'tanner', at: ['barn', 'warehouse'], shift: DAY, carry: ['knife', 'work_gloves'], makes: ['leather_cap', 8, 6, 'cured leather'], minN: 45, base: 0.3, fit: { ranch: 1.2, hunting: 1.2, swamp: 0.4 },
    talk: ['Smell does not bother me any more. It bothers my wife.', 'A good hide is a coat, a cap and a pair of boots.', 'Bring me the skin whole. Do not hack at it.'] }),
  hunter: J({ name: 'hunter', out: 'edge', shift: DAWN, carry: ['gun_rifle', 'ammo_rifle', 'knife'], makes: ['dried_meat', 4, 12, 'smoked game'], base: 0.4, fit: { forest: 1, plains: 0.8, cold: 0.8, hunting: 1.4, hills: 0.5 },
    talk: ['Deer went north. The things that ate the deer did not.', 'One round, one animal. Ammo is too dear to miss.', 'I smoke what I shoot before it turns.'] }),

  // water: ports, coasts, rivers, swamps
  dockhand: J({ name: 'dockhand', at: ['warehouse'], hero: 'pier|wharf|dock|slip|harbor', shift: [6, 17], needs: ['port', 'boats', 'sea', 'fishing'], carry: ['work_gloves', 'crowbar'], base: 0.4, fit: { port: 2.2, boats: 0.8, fishing: 0.5, trade: 0.3 },
    talk: ['Crates off, crates on. The boats do not wait.', 'Half of what comes over the water is junk. The other half is worth killing for.', 'Watch the gaff. It takes fingers.'] }),
  net_mender: J({ name: 'net mender', out: 'dock', shift: [7, 16], needs: ['fishing', 'coast', 'boats', 'river', 'lake'], carry: ['knife', 'rag'], base: 0.3, fit: { fishing: 1.5, coast: 0.6, port: 0.6 },
    talk: ['A torn net feeds nobody.', 'I can mend a net with my eyes shut. Some nights I do.', 'Gators tear them, sharks tear them, fools tear them.'] }),
  harbourmaster: J({ name: 'harbourmaster', at: ['office', 'warehouse'], hero: 'harbor|custom_house|lighthouse|wharf', shift: DAY, needs: ['port'], carry: ['radio_portable', 'road_atlas'], base: 0.4, fit: { port: 1.5 }, one: true, minN: 12,
    talk: ['Every hull that ties up here pays the berth.', 'I know what every boat carries. That is the job.', 'Storm coming in two days. Tie everything down twice.'] }),
  fisher: J({ name: 'fisher', out: 'dock', shift: DAWN, needs: ['water', 'fishing'], carry: ['knife', 'satchel'], makes: ['dried_meat', 3, 16, 'smoked fish'], base: 0.4, fit: { fishing: 1.6, coast: 0.8, river: 0.6, lake: 0.8, swamp: 0.4 },
    talk: ['Out before light, back before the heat.', 'The fish taste of oil some days. We eat them anyway.', 'Something big lives under the old pier. Leave it be.'] }),
  boatman: J({ name: 'boatman', out: 'dock', shift: DAY, needs: ['swamp', 'river', 'boats', 'lake'], carry: ['planks', 'rag'], deals: ['water'], base: 0.4, fit: { swamp: 1.3, river: 1, boats: 1.2, florida: 0.4 },
    talk: ['Pole or paddle, I know every channel through this water.', 'I carry anybody who pays. I ask nothing.', 'The causeway is out past the bend. The water is the road now.'] }),
  crabber: J({ name: 'crabber', out: 'dock', shift: DAWN, needs: ['sea', 'coast'], carry: ['satchel', 'knife'], makes: ['dried_meat', 4, 12, 'crab meat, salted'], base: 0.3, fit: { coast: 1, florida: 0.8, fishing: 0.8 },
    talk: ['Traps out at dusk, pulled at dawn.', 'The crabs eat what the sea gives them. Do not ask what.', 'Low tide is my market.'] }),
  shipwright: J({ name: 'shipwright', at: ['warehouse'], hero: 'boat|dry_dock|slip|marina', shift: DAY, needs: ['port', 'boats'], carry: ['planks', 'duct_tape'], makes: ['planks', 4, 10, 'hull planking'], base: 0.25, fit: { boats: 1.2, port: 1, timber: 0.6 }, one: true,
    talk: ['A hull is a promise you keep with tar and nails.', 'I patch what the reefs and the raiders leave.', 'Bring me a straight log and I will bring you a boat.'] }),

  // the swamp and the Florida country
  gator_hunter: J({ name: 'gator hunter', out: 'edge', shift: [17, 2], needs: ['swamp', 'florida', 'hunting'], carry: ['gun_rifle', 'machete', 'flare'], makes: ['gator_hide', 6, 8, 'gator hides'], base: 0.3, fit: { swamp: 1.6, florida: 1, hunting: 1 },
    talk: ['You hunt them at night. Their eyes shine red in the light.', 'Hide sells. Meat feeds. Teeth make good luck.', 'Never wade where you cannot see the bottom.'] }),
  moonshiner: J({ name: 'moonshiner', at: ['barn', 'cabin', 'warehouse'], shift: [16, 2], carry: ['rotgut', 'fuel_can'], makes: ['rotgut', 5, 12, 'corn liquor'], base: 0.2, fit: { still: 1.6, swamp: 0.8, hills: 0.6, forest: 0.4 }, fac: { garrison: 0.3 },
    talk: ['Clear as water, kicks like a mule.', 'The still is where it is. You did not see it.', 'Clean it, drink it, burn it in a lamp. All good.'] }),
  moss_gatherer: J({ name: 'moss gatherer', out: 'edge', shift: [6, 13], needs: ['swamp'], carry: ['machete', 'satchel'], makes: ['rag', 3, 12, 'cured moss stuffing'], base: 0.25, fit: { swamp: 1, florida: 0.5 },
    talk: ['Moss stuffs a mattress, a cushion, a wound if you are desperate.', 'Shake it out first. Chiggers.', 'The old oaks are full of it.'] }),

  // the land: farms, ranches, the plains
  grower: J({ name: 'grower', at: ['barn', 'farmhouse'], out: 'field', shift: [5, 17], needs: ['farm', 'plains', 'pueblo', 'river', 'oasis'], bans: ['hot'], carry: ['work_gloves', 'machete'], makes: ['cactus_fruit', 4, 20, 'a crate of greens'], base: 0.6, fit: { farm: 1.6, plains: 0.8, river: 0.6, pueblo: 0.6, oasis: 0.6 },
    talk: ['Seed is life. We guard the seed store like gold.', 'The ground is sick in places. You learn which places.', 'Rain comes, we eat. Rain does not, we pray.'] }),
  harvest_crew: J({ name: 'harvest crew hand', out: 'field', shift: [5, 17], needs: ['farm'], minN: 45, carry: ['work_gloves', 'machete'], base: 1, fit: { farm: 2, plains: 0.4 }, max: 0.12,
    talk: ['Wheat does not wait. When it is ripe the whole farm goes into the field.', 'Bring the whole crew or lose the crop, that is the arithmetic.', 'The big farms hire hands by the season. Small ones just pray for rain.'] }),
  miller: J({ name: 'miller', at: ['mill', 'grain_elevator'], shift: DAY, needs: ['farm', 'mill'], carry: ['work_gloves'], makes: ['flatbread', 3, 12, 'flour, milled and baked'], base: 0.35, fit: { farm: 1.2, rail: 0.4 }, one: true,
    talk: ['The wheel turns, the flour falls. Weevils get a share.', 'Every family in the valley owes me a sack.', 'I grind what they grow. Simple.'] }),
  vet: J({ name: 'vet', at: ['barn', 'clinic'], shift: DAY, needs: ['farm', 'ranch'], carry: ['suture_kit', 'antibiotics'], base: 0.3, fit: { ranch: 1, farm: 0.8 }, one: true, minN: 10,
    talk: ['A sick cow can starve a family. I do not lose many.', 'Horses are worth more than cars now. They do not need fuel.', 'I treat people too, when the doctor is drunk.'] }),
  beekeeper: J({ name: 'beekeeper', out: 'field', shift: [8, 16], needs: ['farm', 'forest', 'plains'], carry: ['dust_mask'], makes: ['honey', 8, 8, 'comb honey'], base: 0.2, fit: { farm: 0.8, forest: 0.4 }, one: true,
    talk: ['The bees came back before the people did.', 'Honey keeps forever. That is worth something now.', 'Smoke them gentle and they forgive you.'] }),
  rancher: J({ name: 'rancher', at: ['barn', 'ranch_house'], out: 'field', shift: [5, 17], needs: ['ranch', 'plains', 'dry'], bans: ['hot'], carry: ['gun_rifle', 'knife'], makes: ['jerky', 5, 12, 'dried beef'], base: 0.35, fit: { ranch: 1.6, plains: 0.8, dry: 0.4 },
    talk: ['Cattle do not care who runs the country. They want grass and water.', 'Rustlers lose a hand out here. Sometimes more.', 'A good dog is worth three hands.'] }),
  wrangler: J({ name: 'wrangler', out: 'field', shift: [5, 16], needs: ['ranch'], carry: ['road_chain', 'knife'], base: 0.25, fit: { ranch: 1.2, trade: 0.3 },
    talk: ['I break horses. The horses mostly break me.', 'A horse that will not spook at gunfire is gold.', 'The herd moves at dawn. Ride with it or eat its dust.'] }),
  elevator_hand: J({ name: 'elevator hand', at: ['grain_elevator'], shift: DAY, needs: ['farm', 'rail'], carry: ['work_gloves', 'dust_mask'], base: 0.25, fit: { rail: 1, farm: 0.6 },
    talk: ['Grain dust burns like powder. No smoking.', 'The elevator feeds three towns when the harvest is good.', 'Rats eat more than we sell some years.'] }),

  // mines and company towns
  digger: J({ name: 'digger', at: ['mill', 'warehouse'], hero: 'mine|headframe|tipple|quarry|pit', shift: [6, 18], needs: ['mine'], carry: ['crowbar', 'work_gloves', 'dust_mask'], makes: ['scrap', 4, 20, 'ore, sorted'], base: 0.5, fit: { mine: 2, hills: 0.4, company: 0.6 },
    talk: ['Down at six, up at six. The sun is a rumour.', 'The deep seams are flooded. We work the old ones twice.', 'Listen for the timbers. They talk before they go.'] }),
  powder_man: J({ name: 'powder man', at: ['warehouse', 'quonset'], shift: DAY, needs: ['mine', 'arms'], carry: ['remote_charge', 'signal_flare'], base: 0.25, fit: { mine: 1.2, arms: 0.8 }, one: true,
    talk: ['Fire in the hole means run. Not look.', 'I have all my fingers. That makes me the best here.', 'Powder is the only thing I trust less than people.'] }),
  company_clerk: J({ name: 'company store clerk', at: ['shop', 'office'], shift: DAY, needs: ['company', 'mine', 'mill'], carry: ['road_atlas'], deals: ['food', 'tool'], base: 0.3, fit: { company: 1.6, mine: 0.6 }, one: true,
    talk: ['Paid in company scrip. Spent at the company store.', 'Everybody owes the store. That is how the store likes it.', 'Prices? Same as yesterday. Higher than last year.'] }),
  assayer: J({ name: 'assayer', at: ['office'], shift: DAY, needs: ['mine'], carry: ['wristwatch'], base: 0.2, fit: { mine: 1, trade: 0.4 }, one: true, minN: 14,
    talk: ['Bring me a rock and I tell you what it is worth.', 'Most bring fool\'s gold. Some bring trouble.', 'Silver is up. Lead is always up.'] }),

  // raider camps and warlord holds
  scout: J({ name: 'scout', out: 'edge', shift: [5, 14], carry: ['gun_rifle', 'ammo_rifle', 'road_atlas'], base: 0.1, fit: { camp: 0.8, raiding: 1, road: 0.3 }, fac: { raider: 6, warlord: 3, garrison: 2, free: 0.4 }, max: 0.2,
    talk: ['I count your wheels and your guns before you see me.', 'The road tells you everything if you lie still long enough.', 'Three trucks east at noon. Someone will want to know.'] }),
  slaver: J({ name: 'slaver', at: ['barracks', 'warehouse'], hero: 'slave|pen|stockade|cage', shift: DAY, carry: ['road_chain', 'gun_pistol'], base: 0, fit: { slaving: 2, raiding: 0.6, camp: 0.3 }, fac: { raider: 1.6, warlord: 1.6, free: 0, garrison: 0, merchant: 0, company: 0, cult: 0.6 }, max: 0.12,
    talk: ['Everybody is worth something to somebody.', 'Keep walking, outsider. This is not your business.', 'The chains are not mine. I just hold the key.'] }),
  quartermaster: J({ name: 'quartermaster', at: ['warehouse', 'quonset', 'barracks'], shift: DAY, carry: ['key_ring', 'gun_pistol'], deals: ['ammo', 'gun', 'part'], base: 0.15, fit: { military: 1, walled: 0.6, camp: 0.6, raiding: 0.6 }, fac: { raider: 3, warlord: 3, garrison: 3 }, one: true,
    talk: ['Every round goes out on my list and comes back on it.', 'You want gear, you earn gear.', 'The store is locked. I am the key.'] }),
  chop_mechanic: J({ name: 'chop mechanic', at: ['auto_shop', 'garage'], shift: [10, 22], carry: ['wrench', 'siphon_hose'], makes: ['spark_plugs', 5, 8, 'parts stripped from stolen cars'], base: 0, fit: { garage: 0.6, road: 0.6 }, fac: { raider: 1.8, warlord: 0.8 },
    talk: ['Cars come in whole. They leave in pieces. Or with new paint.', 'I do not ask whose it was.', 'Plate armour on a pickup. You want it? You cannot afford it.'] }),
  lookout: J({ name: 'lookout', out: 'gate', shift: [12, 24], carry: ['gun_rifle', 'flare'], base: 0.1, fit: { holdout: 0.5, walled: 0.4, camp: 0.6 }, fac: { raider: 3, warlord: 2, garrison: 1.6 },
    talk: ['From up here I see dust on the road an hour out.', 'Wave a white rag and walk slow.', 'I have shot three tires this month. And one driver.'] }),
  tollman: J({ name: 'tollman', out: 'gate', shift: DAY, carry: ['gun_shotgun', 'spike_strip'], base: 0.05, fit: { road: 0.8, raiding: 1.2, river: 0.4, trade: 0.3 }, fac: { raider: 3, warlord: 2.4, merchant: 0.8, free: 0.3 }, one: true,
    talk: ['Road is ours. Toll is fair.', 'Pay in fuel, ammo or goods. Not in lip.', 'The strip goes down at dusk. Do not race it.'] }),

  // garrisons and bases
  sentry: J({ name: 'sentry', at: ['guardhouse'], out: 'gate', shift: DAY, needs: ['military'], carry: ['gun_rifle', 'ammo_rifle', 'combat_helmet'], base: 0.6, fit: { military: 1.6 }, fac: { garrison: 1.6 }, max: 0.22,
    talk: ['Papers or turn around.', 'The wire is live. That is not a bluff.', 'Twelve hours on, twelve off. Same as before the end.'] }),
  armorer: J({ name: 'armorer', at: ['barracks', 'warehouse', 'quonset'], shift: DAY, needs: ['military', 'arms'], carry: ['cleaning_kit', 'wrench'], makes: ['ammo_pistol', 4, 12, 'reloaded pistol rounds'], base: 0.3, fit: { arms: 1.4, military: 1 }, one: true,
    talk: ['Brass, powder, primer, patience.', 'Every round I reload is a round we did not have to find.', 'Clean your rifle. I do not fix neglect.'] }),
  radio_operator: J({ name: 'radio operator', at: ['office', 'hq'], hero: 'radio|antenna|signal', shift: [6, 22], carry: ['radio_portable'], base: 0.15, fit: { military: 0.8, news: 1.2, station: 0.6 }, one: true,
    talk: ['The air is full of voices. Most of them lie.', 'Storm on the coast, caravan on the I-10, a call for a medic. Same as every day.', 'I hear more than I say. That is the job.'] }),
  drill_sergeant: J({ name: 'drill sergeant', at: ['barracks'], shift: [5, 15], needs: ['military'], carry: ['gun_pistol', 'tin_star'], base: 0.15, fit: { military: 1 }, fac: { garrison: 2 }, one: true, minN: 14,
    talk: ['Soft people die first out there. Not in my yard.', 'Again. Faster.', 'The kids who listen live.'] }),

  // fuel and industry
  pumper: J({ name: 'pumper', at: ['warehouse'], hero: 'derrick|pumpjack|tank|well', shift: [6, 18], needs: ['oil'], carry: ['wrench', 'fuel_can'], makes: ['fuel_can', 6, 8, 'crude, cooked to fuel'], base: 0.4, fit: { oil: 2 },
    talk: ['The old pumps still nod if you feed them.', 'Fuel is power. The people with fuel make the rules.', 'One spark and this whole field goes up. Remember that.'] }),
  refinery_hand: J({ name: 'refinery hand', at: ['mill', 'warehouse'], shift: [6, 18], needs: ['oil'], carry: ['dust_mask', 'work_gloves'], base: 0.3, fit: { oil: 1.4, industry: 0.6 },
    talk: ['The fumes take your nose first. Then your lungs.', 'We cook crude in what is left of the stills.', 'Bad batch last week. A truck blew up on the bridge.'] }),
  salt_raker: J({ name: 'salt raker', out: 'field', shift: DAWN, needs: ['salt'], carry: ['dust_mask', 'work_gloves'], base: 0.5, fit: { salt: 2 },
    talk: ['The flats give salt and take your eyes.', 'Meat keeps because of us. Remember that when you eat.', 'Rake, pile, bag, repeat.'] }),
  millhand: J({ name: 'millhand', at: ['mill'], hero: 'mill|factory|plant', shift: [6, 18], needs: ['mill', 'industry', 'timber'], carry: ['work_gloves'], makes: ['rag', 2, 20, 'bolts of rough cloth'], base: 0.4, fit: { mill: 1.6, industry: 1, timber: 0.6 },
    talk: ['The looms run on the water wheel now.', 'Twelve hours and your ears ring all night.', 'The company keeps the mill. The mill keeps the town.'] }),
  woodcutter: J({ name: 'woodcutter', out: 'edge', shift: [6, 16], needs: ['forest', 'cold', 'timber'], carry: ['fire_axe', 'work_gloves'], makes: ['planks', 4, 16, 'split timber'], base: 0.35, fit: { forest: 1.2, timber: 1.4, cold: 0.6 },
    talk: ['Winter eats a forest a year.', 'Fell, buck, split, stack.', 'Keep your axe sharp and your back straight.'] }),
  trapper: J({ name: 'trapper', at: ['cabin'], out: 'edge', shift: DAWN, needs: ['cold', 'forest', 'hunting'], carry: ['knife', 'leather_vest'], makes: ['leather_vest', 12, 4, 'furs and a stitched vest'], base: 0.2, fit: { cold: 1.2, hunting: 1, forest: 0.6 }, wealth: [0, 0.4],
    talk: ['The lines run twenty miles. I walk them every three days.', 'Fur keeps you alive in the north. Nothing else does.', 'Something has been robbing my traps. Something big.'] }),

  // the road and the trade
  caravan_hand: J({ name: 'caravan hand', at: ['warehouse', 'truck_stop'], out: 'street', shift: DAY, carry: ['backpack', 'gun_pistol'], base: 0.3, fit: { trade: 1.2, road: 0.8, market: 0.5, rail: 0.4 }, fac: { merchant: 1.8 },
    talk: ['We roll at dawn whether you are on the truck or not.', 'Eight towns, three weeks, two ambushes. A good run.', 'Load the water first. Always the water first.'] }),
  fuel_seller: J({ name: 'fuel seller', at: ['gas_station', 'truck_stop'], shift: DAY, carry: ['fuel_can', 'siphon_hose'], deals: ['tool', 'part'], base: 0.4, fit: { road: 1, oil: 0.8, trade: 0.4 }, one: true,
    talk: ['Fuel by the can. Cash or trade.', 'No, you cannot siphon your own. I watch.', 'Price goes up when the refinery boys get raided.'] }),
  innkeeper: J({ name: 'innkeeper', at: ['motel', 'hotel'], hero: 'inn|motel|hotel|lodge', shift: [10, 23], carry: ['key_ring'], deals: ['food', 'water'], base: 0.35, fit: { road: 0.8, casino: 1, trade: 0.5 }, one: true,
    talk: ['A bed, a lock and no questions. That is what you pay for.', 'Keep your guns in your room.', 'Checkout is when I say.'] }),
  card_dealer: J({ name: 'card dealer', at: ['hotel', 'saloon'], hero: 'casino', shift: [16, 4], needs: ['casino', 'leisure'], carry: ['wristwatch'], base: 0.3, fit: { casino: 1.6, leisure: 1 }, wealth: [0.4, 1],
    talk: ['House always wins. Even after the end of the world.', 'Play or move along.', 'The big game is upstairs. You need a sponsor.'] }),
  bouncer: J({ name: 'bouncer', at: ['saloon', 'hotel'], shift: [18, 4], carry: ['brass_knuckles'], base: 0.15, fit: { casino: 1.2, leisure: 0.8, bar: 0.4 },
    talk: ['Not tonight.', 'You walk out or you get carried out.', 'Leave the iron at the door.'] }),
  porter: J({ name: 'porter', out: 'street', shift: DAY, carry: ['backpack'], base: 0.25, fit: { market: 0.6, trade: 0.6, rail: 0.6, casino: 0.4 }, wealth: [0, 0.7], minN: 10,
    talk: ['I carry what you cannot. For a price.', 'Two bags, one trip, a quarter-scrip.', 'My back is the only machine I own.'] }),

  // civic life
  judge: J({ name: 'circuit judge', at: ['courthouse'], shift: [9, 15], needs: ['civic', 'walled'], carry: ['tin_star'], base: 0.3, fit: { civic: 1.2, walled: 0.6 }, fac: { raider: 0 }, one: true, minN: 18,
    talk: ['I hear disputes over water, land and wives. Mostly water.', 'Justice is slow. The rope is quick.', 'Bring witnesses. Real ones.'] }),
  newsman: J({ name: 'newsman', at: ['office'], hero: 'radio|press|printing', shift: [8, 18], carry: ['radio_portable', 'photograph'], base: 0.15, fit: { news: 1.6, civic: 0.6, college: 0.6 }, one: true,
    talk: ['One sheet a week. Read it, then burn it for warmth.', 'Truth is a story somebody did not want printed.', 'Seen anything I should know?'] }),
  scholar: J({ name: 'scholar', at: ['school', 'office'], shift: [8, 17], needs: ['college', 'tech'], carry: ['road_atlas', 'radio_portable'], base: 0.25, fit: { college: 1.4, tech: 1.2 },
    talk: ['We keep the old knowledge. Somebody has to.', 'The library flooded twice. We saved what we could carry.', 'Bring me books and I will pay in food.'] }),
  grave_digger: J({ name: 'grave digger', out: 'edge', shift: [6, 13], carry: ['work_gloves'], base: 0.15, fit: { faith: 0.6, holdout: 0.3, ruin: 0.3 }, one: true,
    talk: ['Six feet if they are loved. Three if they are not.', 'Business is always good.', 'The ground is hard this year. So are the people.'] }),

  // ruins, the hot ground, the desert
  relic_hunter: J({ name: 'relic hunter', out: 'edge', shift: [6, 15], needs: ['ruin', 'hot', 'tech', 'salvage', 'landmark'], carry: ['scav_compass', 'dust_mask', 'crowbar'], makes: ['wristwatch', 12, 4, 'working old-world goods'], base: 0.25, fit: { ruin: 1, hot: 1, tech: 1, landmark: 0.6 },
    talk: ['The old world left treasure in the strangest places.', 'A working watch. A sealed drive. Sometimes a gun nobody found.', 'The hot ground pays best. It kills too.'] }),
  potter: J({ name: 'potter', at: ['adobe'], shift: [6, 15], needs: ['pueblo', 'dry'], carry: ['canteen'], makes: ['canteen', 6, 8, 'fired water jars'], base: 0.3, fit: { pueblo: 1.6, dry: 0.4 },
    talk: ['Clay holds water. Plastic cracks in the sun.', 'My grandmother taught me. The kiln remembers.', 'Every family needs jars before the dry season.'] }),
  cactus_cutter: J({ name: 'cactus cutter', out: 'field', shift: DAWN, needs: ['desert'], carry: ['machete', 'work_gloves'], makes: ['cactus_fruit', 3, 16, 'prickly pear and nopal'], base: 0.3, fit: { desert: 1.2, oasis: 0.6, pueblo: 0.4 },
    talk: ['The desert feeds you if you respect the spines.', 'Fruit in the summer, pads all year.', 'Burn the spines off before you eat.'] }),
  well_keeper: J({ name: 'well keeper', out: 'street', shift: DAY, needs: ['desert', 'dry', 'oasis'], carry: ['water_can', 'wrench'], deals: ['water'], base: 0.25, fit: { oasis: 1.4, desert: 0.6, waterworks: 1 }, one: true,
    talk: ['The pump is mine. The water belongs to everybody who pays.', 'The level dropped a foot this year.', 'Poison the well and you hang. That is the law here.'] }),
};

// ---- the check -----------------------------------------------------------------------------------------------------------
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const SPOTS = ['street', 'edge', 'gate', 'dock', 'field'];
// Every row: a real workplace, a real shift, real items, sane weights, known tags. Returns { ok, errors }.
export function validateOccupations(rows = OCCUPATIONS, { items = null, kinds = null, deals = null } = {}) {
  const errors = [];
  for (const [id, o] of Object.entries(rows)) {
    if (!o.name) errors.push(`${id}: no name`);
    if (!(o.at?.length || o.out || o.hero)) errors.push(`${id}: no workplace (at, hero or out)`);
    for (const k of o.at ?? []) if (kinds && !kinds[k]) errors.push(`${id}: works in an unknown building kind ${k}`);
    if (o.out && !SPOTS.includes(o.out)) errors.push(`${id}: out must be one of ${SPOTS.join(' ')}`);
    if (o.hero) { try { new RegExp(o.hero); } catch { errors.push(`${id}: hero is not a regex`); } }
    if (!Array.isArray(o.shift) || o.shift.length !== 2 || !o.shift.every((h) => num(h) && h >= 0 && h <= 24) || o.shift[0] === o.shift[1]) errors.push(`${id}: shift must be [from, to] hours`);
    for (const it of o.carry ?? []) if (items && !items[it]) errors.push(`${id}: carries an item that does not exist: ${it}`);
    if (o.makes) {
      const [it, h, cap] = o.makes;
      if (items && !items[it]) errors.push(`${id}: makes an item that does not exist: ${it}`);
      if (!num(h) || h <= 0) errors.push(`${id}: makes needs work hours per unit > 0`);
      if (!num(cap) || cap < 1) errors.push(`${id}: makes needs a cap >= 1`);
    }
    if (o.deals && deals) for (const d of o.deals) if (!deals.includes(d)) errors.push(`${id}: deals in an unknown kind ${d}`);
    if (!num(o.base) || o.base < 0) errors.push(`${id}: base must be >= 0`);
    for (const [t, w] of Object.entries(o.fit ?? {})) { if (!TAGS.includes(t)) errors.push(`${id}: fit names an unknown tag ${t}`); if (!num(w)) errors.push(`${id}: fit ${t} is not a number`); }
    for (const f of ['needs', 'bans']) for (const t of o[f] ?? []) if (!TAGS.includes(t)) errors.push(`${id}: ${f} names an unknown tag ${t}`);
    for (const [c, w] of Object.entries(o.fac ?? {})) { if (!CLASSES.includes(c)) errors.push(`${id}: fac names an unknown class ${c}`); if (!num(w) || w < 0) errors.push(`${id}: fac ${c} must be >= 0`); }
    if (o.wealth && !(o.wealth.length === 2 && o.wealth[0] <= o.wealth[1])) errors.push(`${id}: wealth must be [lo, hi]`);
    if (o.max !== undefined && (!num(o.max) || o.max <= 0 || o.max > 1)) errors.push(`${id}: max is a share in (0, 1]`);
    if ((o.talk ?? []).length < 3) errors.push(`${id}: needs at least three talk lines`);
  }
  if (Object.keys(rows).length < 40) errors.push(`only ${Object.keys(rows).length} occupations (at least 40)`);
  return { ok: errors.length === 0, errors };
}
