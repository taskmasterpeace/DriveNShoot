# PZ GAP ANALYSIS: what a long-running survival sim has that DSOA does not (2026-10-29)

Robert's ask (2026-10-29): "go through Project Zomboid and the mods. And just add whatever you think we need in our game."
This is research only. No game code changed. Project Zomboid (PZ) and its mods are **research sources**: we learn what a mechanic is *for*
and re-write it as DSOA rows and systems in our own words and numbers (WEB_FAN_SERVICE_BIBLE rules, `ip-lint` 0 deny). Nothing here is copied.

## 0. What was read, and how sure the "DSOA has it?" column is

**PZ side.** The base game is Build 42 (`media/lua` shared/server/client folders, the English translation files for sandbox options, moodles,
context-menu verbs, multistage builds, entities), plus the farming, foraging, fishing, trap and camping scripts. Of the 110 Workshop items
(132 mods) I read every `mod.info`, and the READMEs/changelogs of the ones that add a *mechanic*. About 70 of the 132 are renderer, camera,
model-pack, UI-skin or compatibility mods (the "Viewpoint" family, Knox Inventory, terrain/roof/curtain/door packs, translations): they teach us nothing
DSOA needs and are ignored. Robert's own mods (A-Life Fair World, Consequences of Failure VR, Miami packs, weapon feel) are the source of the depth-plan laws and are already absorbed.

**Mods that taught something** (the rest of the list is in section 4): Bandits + NPC Bases + Living NPC (people-as-threat, claimed and fortified bases, injuries/nutrition on companions), Last Signal / Perimeter Electronics
(base sensor networks), RadArchery (silent ranged with recoverable ammo), Horse Mod, Companion Dogs (+ breed pack), True Weathers + Winter FX (readable storms, snow that builds), Heli Event (an overflight that draws a horde),
Dynamic Trading, TVRadio, wired-radio and walkie-talkie mods, Survivor Briefing + SmartWatch HUD (diegetic knowledge), Visible Loot, Immersive Driving, RV interiors.

**DSOA side.** `web/AGENTS.md`, `docs/design/INDEX.md`, every `WEB_*.md` index row, `WEB_DEPTH_PLAN.md`, the lead's `dsoa-status.json`, and the data files
(`survival.js`, `stats.js`, `skills.js`, `outdoors.js`, `crewjobs.js`, `items.js`, `workshop.js`, `parts.js`, `sky.js`). "Has it" was checked by reading those files and
grepping `web/src/data` + `web/src/systems`. **Confidence:** "yes / partly" with a file named = read. "no" = I found nothing in code *or* design docs; a lane that is mid-build can still surprise me, so the lead should skim section 1 against the lane briefs before committing a pick.

**Lanes running or just landed (so not backlog):** timed actions + ladders + break-ins, melee, police/SWAT, camps/bases/own house (pitch a camp, claim and fortify, rent or buy), casinos, calibers + forensics,
gunfire reactions, move/boats/towing, carry/drag bodies + two-person tasks, body doll/inventory UI, game tour, semis, workshop extras, world voice, vein zombies, deaths + smart Echoes, bullet shells, flaky-check fixes, world-building tools (queued).

**The honest headline.** DSOA is already *ahead* of PZ in the places PZ is famous for being deep on the body and the dead: a six-zone injury/condition ladder, climate and wetness, bite fever, sleep, 36 skills with perks and 36 traits,
senses and memory on the infected, hordes drawn by noise, a society layer (rumours, factions, grudges), police, bounty guild, real bullets, car armour. What PZ has and DSOA does not is almost all **the home-and-hands economy**:
make things, grow things, power things, keep things clean, learn from books, and let a place *decay* on a calendar. Those are exactly the systems that turn "no loot regeneration" from a punishment into a loop,
because they are the only legitimate source of new stock. That is the through-line of the ranking below.

## 1. The table: PZ systems and mod features vs DSOA

Columns: **PZ / mod** (one line) · **DSOA today** (yes / partly / no / lane) · **DSOA-shaped version** (our world: top-down driving, nobody cheats, no regeneration, persistent shard, knowledge travels by channels).

### 1.1 The body

| Area | PZ / mod: what it is | DSOA today | DSOA-shaped version |
|---|---|---|---|
| Hunger / thirst / sleep | Three drains with stages; fatigue, sleeping in beds/ground | **Yes** (`survival.js` water/food/rest, pips, microsleep, car sleep) | Nothing to add |
| Moodles (status icons) | A row of HUD icons, 4 levels each, with a one-line cause and cure | **Partly**: pips + 24-condition ladder with a cure line (`stats.js CONDITIONS`); HUD surface is the panel editor's job | Make the *cure line* the tooltip on every pip so the HUD teaches itself (S, folds into the body-doll lane) |
| Injuries by body part | Per-part wounds: scratch, laceration, deep wound, bullet, fracture, burn, glass | **Yes** (`survival.js INJURIES`, `stats.js ZONES`) | Bullet/glass are not treated as separate things (see Field medicine) |
| Treatment verbs | Bandage, disinfect, **stitch, remove stitches, remove glass, remove bullet, splint, clean burn**, doctor skill gates them | **Partly**: bandage, disinfect, splint exist; `suture_kit` is an item with no wound that needs it | Stitch deep gashes, dig out a bullet, pick out glass; each a timed action with a skill roll and a kit that is *used up* (S/M) |
| Painkillers, withdrawal, alcohol | Pills suppress pain for a window; drink makes drunk; smoking calms stress | **Yes** (`painkillers`, `rotgut`, drunk/withdrawal conditions) | Nothing to add |
| Cold, heat, wet | Body temperature from air, wind, clothing, activity, rain | **Yes** (`CLIMATE`, `WARMTH`, `WET`) | Needs *clothing* to matter more (see Clothing) |
| Nutrition and body weight | B42 tracks calories/protein/fat/carbs; weight gain and loss change stamina | **No** (food is one number) | A calorie ledger and body condition that shows on the body doll: a long famine is *visible* (M) |
| Infection and fever | Zombie infection is a timer to death | **Yes, our own canon**: bite fever, never a turn | Nothing; PZ's version is the thing the canon deliberately is not |
| Fitness / strength training | Exercise sessions, weight loss, muscle strain | **Partly**: skills grow by doing (endurance, strength) | Skip |
| Hygiene, smell, hair, blood on body | Dirty clothes, smell moodle, wash, haircut | **No**; noted only in look-and-feel docs | Smell as a *stealth* number the dogs and infected already read (scentMul exists) (S, part of Clothing) |

### 1.2 Food, water, land

| Area | PZ / mod | DSOA today | DSOA-shaped version |
|---|---|---|---|
| Farming | Furrows, seeds by month, watering, compost, mildew/aphids/slugs/flies, harvest skill, seeds saved | **No.** A `farm` crew job is a stub ("one plot, one ration a half-day"); `farming` skill is a check-only row; farm *belts* are scenery | Plots at a claimed base or town garden: growth in game-days, water, pests, compost; the harvest feeds the base and the trade shelves; a raided farm stays raided (L) |
| Animal husbandry | B42 livestock: feed troughs, milking, eggs, breeding, butchering | **No** (wild fauna, dogs, butchering exist) | Chickens, goats, a cow at a base: need feed and water (so it needs the farm), produce slowly, can be stolen and slaughtered (L) |
| Cooking | Evolved recipes (soup, stew, pie, stir-fry), spices, pans over heat, food poisoning, cooking skill changes nutrition and boredom | **Partly**: fire pit cooks raw meat; drying rack; `cooking` skill; CREW cook job; raw/cooked states | Recipe rows with real ingredients and a cooked-quality number that buys morale and "well fed"; a crew cook that actually uses stock (M) |
| Food spoilage, refrigeration | Items rot on a timer, fridges slow it, power shutoff kills fridges | **Partly** (spoilage rows in `items.js`; no fridge effect) | A working fridge needs power (see Power) so cold storage is a base you can lose (S once Power exists) |
| Clean water, taint | B42 fluids: water has a source and can be tainted; boil, purify, rain barrels, water shutoff on a day | **Partly**: litres, canteen, rain catcher at camp, river/swamp water exists; **no** safe-vs-dirty water | Water has a purity number; rivers and swamps are dirty, towers/wells are clean only if pumped; boil, tablets, a filter (M) |
| Plumbing, wells, water towers | Sinks, taps, water towers feed a grid until it is shut off | **No** (landmark water towers are scenery) | A well or a tower is a *place state* (pumped / dry); a town with a working tower is rich (part of Water) |
| Foraging | Search mode, skill radius, seasons, zones, poultices from herbs | **Yes** (`outdoors.js FORAGE`, patches thin and regrow, talents) | Nothing; herb poultice as a medical recipe later |
| Fishing, trapping | Rod/bait/line; snares and traps checked later | **Yes** (`FISHING`, `TRAPPING`, fish traps on the clock) | Nothing |
| Hunting, butchering | Hunt, butcher, hides, bones | **Yes** (`butcher` rows, bird shooting, tracks) | Nothing |
| Seasons and months | A real calendar: planting months, winter, snow builds and melts | **No** (weather states exist; no calendar, no snow) | A compressed year (e.g. 4 seasons x 7 game-days) driving biome weather, farming, clothing and fuel need (M/L) |
| Weather forecast and presentation | Storms seen coming on the horizon; radio forecasts | **Partly** (`sky.js` 7 states incl. acid storm, dust, ash; radio warns) | A forecast *channel* (radio, a barkeep) so weather is a plan, not a surprise (S) |

### 1.3 Hands: making, mending, learning

| Area | PZ / mod | DSOA today | DSOA-shaped version |
|---|---|---|---|
| Crafting recipes | Hundreds of recipes: inputs, tools, time, a skill, a workstation entity (B42 "entities": input/output slots, progress, temperature) | **Partly**: car workshop is deep (`workshop.js`), gadget recipes, CREW jobs (mend, ammo); **no general recipe engine** | One recipe-row type: inputs, tools, hours, skill, bench kind, output; benches are placed things at bases and towns (L) |
| Carpentry and barricades | Multistage walls, windows, planks, metal sheets/bars, doors, stairs, floors | **Lane** (camps/bases fortify) + `windowBoarded` xp, boarded windows in infected rows | Whatever the camps lane ships; do not duplicate |
| Metalworking | Furnace, anvil, bellows, welding, forge tools and weapons | **Partly** (welding of car plate in workshop; no forge) | Bench rows inside the recipe engine (a forge at a smithy is a place worth holding) |
| Tailoring | Sew, patch holes, add padding, rip clothes for rags, clothing condition | **No** | See Clothing |
| Primitive crafts | Knapping, pottery, glass, masonry, carving | **No** | Mostly skip; keep knapping/bone only if bows land |
| Skill books, magazines, literacy | Books multiply XP for a skill up to a level, magazines teach recipes, a literacy trait; read over game hours | **No** (skills only grow by doing; `item: book` is flavour) | Rare, *finite* books and magazines: reading takes game hours, multiplies one skill's xp to a cap, magazines unlock recipes. No respawn, so each is an expedition prize (S/M) |
| Recorded media (VHS/CD) | Found tapes play on a TV/player; TV shows give small skill xp and relieve boredom | **Partly** (radio, music stations; boredom exists) | Cassettes as found items: morale + a lore fragment + a recipe hint (S, folds into books) |
| Item condition and repair | Tools and weapons wear; sharpen, repair with kit and skill; clothes tear | **Partly**: guns have condition, jams, cleaning kits (`GUN_WEAR`); car parts damaged | Same wear on knives, axes, hammers, lockpicks, and clothes, repaired with scrap and a skill (M) |
| Maintenance / mechanics skill | Skill gates which car parts you can fit and how well | **Yes** (mechanics skill, gun fixing, car upkeep) | Hotwire/part swap below |

### 1.4 Power, fire, light

| Area | PZ / mod | DSOA today | DSOA-shaped version |
|---|---|---|---|
| Generators and grid | Generator burns fuel, powers a radius (lights, fridges, radios, tools), is loud, can break; grid cut off on a day | **No** as a system (a `generator` is a prop in bases and sites) | Generator item + fuel + noise + condition; a base or a town has a power state; dead grid is the default, working power is the prize (M/L) |
| Lights, appliances | Lamps, TVs, stoves need power; headlights drain the battery | **Partly** (flashlight, headlamp, batteries as items, vehicle lights) | Base lights/fridge/stove draw from the generator; a lit base is seen from afar (the world already reads light) |
| Wired radios, sensors, alarms | Wire radios to the grid; Last Signal: sensor nodes, hub terminal, decoy sirens, detonator relays, raiders cut wires | **Partly** (gadgets: alarms, mines, flares, scanner) | A small sensor kit (tripwire to alarm to floodlight) that raiders can cut. Honourable mention, after Power and camps |
| Fire | Fire spreads along flammable tiles; extinguishers; campfire/fireplace/BBQ; burn corpses | **Partly**: fire pit, molotov, burn injury, flammable `materials.js`; I found **no spread system** | Fire spreads through a block by material rows; a fire is a noise and a light and a smoke column others see; a burned house is gone (L) |
| Propane, fuel handling | Propane tanks, gas cans, siphoning, refuelling | **Yes** (`fuel_can`, `siphon_hose`, pumps) | Nothing |

### 1.5 Vehicles

| Area | PZ / mod | DSOA today | DSOA-shaped version |
|---|---|---|---|
| Part condition, repair | Every part has condition and a skill/tools gate; mechanic UI | **Yes, ahead** (5-part damage, `vehicledamage.js`, garage, plates, mounts) | Nothing |
| Keys, hotwire | Keys in the world; hotwire with a skill roll and noise | **No** (docs mention it; nothing built). Depth law 1 already says NPCs need a real key | Keys as items bound to a car; hotwire as a timed, noisy, skill-rolled verb; ignition-cut wrecks (M) |
| Battery, charging | Battery drains with lights/radio; car battery charger | **Partly** (battery items) | Skip unless Power lands |
| Trunks, gloveboxes, junk | Per-car loot distribution; trunk size; gloveboxes | **Yes** (trunks, loot rows) | Nothing |
| Trailers, towing | Attach trailers | **Lane** (move-tow) | Lane owns it |
| RV interiors | Walkable furnished RV | **Yes** (coach with beds/stove/awning) | Nothing |
| Horses | Ride, stamina, saddle, saddlebags, feed, breeding | **No** | See Horses |
| Steering hands, ignition gestures, seat head-look | Immersive Driving | **Partly** (visible driver, seat anchors) | Skip |

### 1.6 People, dogs, bases

| Area | PZ / mod | DSOA today | DSOA-shaped version |
|---|---|---|---|
| NPC survivors (join, recruit) | Superb Survivors, NotAlone, Remnants: recruit, give orders, share inventory | **Yes, ahead** (crew, jobs, loyalty, mortal) | Nothing |
| NPC raiders and claimed bases | Bandits: roaming clans claim buildings, fortify in 4 stages, night generators, supply runs, raids | **Yes** (site stories, faction sim, raids that take places, the Tally) | Nothing; Power would add "night generator" tells |
| Companion dogs | Breeds, puppies, saddlebags, pack roles, formations | **Yes** (`dogs.js`: bond, whistle verbs, gear, graves) | Breeding/puppies and dog-carried packs: S/M, low rank |
| Safehouses, factions (MP) | Claim a building, member lists, faction chat | **Lane** (camps/bases) + factions | Lane owns it |
| Trading | Dynamic Trading: prices from stock and standing | **Yes** (`trade.js`, tiers, caravans) | Nothing |
| NPC injury and nutrition | Living NPC: body-part injuries, treatment, nutrition, prosthetics | **Partly** (crew mortal, tend wounds job) | Follows the player's Field medicine work |
| Skill-based starting kits | Occupation/trait kits at spawn | **Yes** (creator, `START_KIT`, occupations) | Nothing |
| Pre-collapse start | Bandits Week One: play the week before it falls | **No** (start is the bus) | Skip |

### 1.7 The dead, noise, events

| Area | PZ / mod | DSOA today | DSOA-shaped version |
|---|---|---|---|
| Zombie lore options | Speed, strength, toughness, cognition, memory, sight, hearing, door-opening, crawl-under-car, transmission | **Yes, our own** (3 breeds as rows, senses, memory, Echo works doors, Choir) | Nothing |
| Hordes, migration, rally | Population peaks and respawns; "rally groups" move toward sound; migration | **Partly**: hordes drawn by noise; herds-as-cells is a listed follow-up | Herds as cell data that *drift* along roads on the world clock (already planned) |
| Loot where zombies are | `ZombiePopLootEffect`: dense-zombie zones roll better loot | **Partly** (site rows hold loot by kind) | Danger-weighted rolls: loot value follows site danger (S, a tuning row) |
| Helicopter event | A helicopter overflight with loudspeaker draws zombies | **No** | A Remnant/Tally overflight on a schedule: radio warning, noise that pulls hordes along its path (M) |
| Loot respawn | Sandbox option: restock a container after N unseen hours | **Deliberately no.** Depth law 2 | Do not add. This is the one PZ option we reject |
| Alarms, locked houses | House alarms, locked doors, alarm battery decay | **Yes** (alarm gadget, locked backs, lockpicks, kicks) | Nothing |

### 1.8 Information, interface, social

| Area | PZ / mod | DSOA today | DSOA-shaped version |
|---|---|---|---|
| Map and annotations | Read a map item; draw symbols, write text; maps shared | **Partly** (atlas, waypoints, pins, `road_atlas` item) | Player notes and pins that other players on the shard can *find* (S/M) |
| Stash maps | Found maps point to hidden caches ("stashes") | **No** | Notes on bodies and in drawers that give a real cache location. One-time loot, no refill, competitors read the same note (S/M) |
| Written notes, graffiti | Write on paper; sign placing | **Partly** (wall tags in world-voice) | Leave a note in a place for the next survivor |
| Radio, TV broadcasts | Scripted broadcasts, ham/walkie radios by frequency, VOIP | **Partly** (radio, scanner, airwaves source) | Walkie-talkie pairs on frequencies with range and battery for crews and shards (M) |
| Diegetic info | Survivor Briefing "only what the character can know", watch HUD | **Partly** (wristwatch item; law 6 for NPCs) | No watch means no exact time; day part only (S) |
| Hotbar / quick slots | Weapons and tools attached to belt/back, 1..9 | **Partly** (V quick-use; body-doll lane) | Lane owns it |
| Inventory weight | Encumbrance, container capacity | **Yes** (weight, litres, packs) | Nothing |
| Sandbox / difficulty options | ~350 options in a creator screen | **Yes, three dials + the goal loop** | Nothing |
| Visible loot on shelves | Shelves show what is on them | **Partly** (searchable crates; stock visible on trader shelves) | Skip |
| Gore, dismemberment | Layered wounds on bodies | **Yes** (deaths lane) | Nothing |
| Seasonal presentation | Snow builds up, breath, tracks | **No** | Rides on Seasons |

## 2. The ranked backlog: 20 additions DSOA does not have and no lane is building

Ranked by how hard each one makes the **run loop** work: scarcity (stock only falls unless someone makes it), distance (a reason to go far),
consequence (it can be lost, and the world notices). Effort: S under a day of lane time, M a lane of a few days, L a multi-lane arc. "Builds on" names files/systems that exist today.

| # | Addition | Why it matters for the run loop | Effort | Builds on |
|---|---|---|---|---|
| 1 | **Crafting recipes + benches** (one recipe-row type: inputs, tools, hours, skill, bench) | The *only* honest way to turn scrap into stock under law 2. Every other maker item (cook, mend, sew, forge) is a row, not a system. Benches at smithies/kitchens make **places** worth holding | L | `workshop.js` (cars), `gadgets.js` recipes, `crewjobs.js`, timed-actions lane, inventory rows |
| 2 | **Farming and gardens** (plots, water, compost, pests, harvest, seed saving) | Gives a base a reason to be a *home*: you can be stronger without going out every day, but a raid or a drought still costs you. Feeds trade shelves via real couriers | L | `crewjobs.js` farm stub, `occupations.js` growers, camp rain catcher, `outdoors.js` patch regrowth, camps/bases lane |
| 3 | **Power: generators, fuel, noise, power as a place state** | Fuel and noise are the price of comfort. Fridges, lights, workshop tools, wired radios all hang off it. A lit, humming base is seen and heard from far: consequence | M/L | `fuel_can`, `noise()` propagation, gadgets batteries, bases `generator` props, spoilage rows |
| 4 | **Clean water: purity, boiling, filters, wells and pumped towers** | Makes the desert and the swamp bite in a new way: water is not just "full/empty", it is *safe or not*. Distance: the next clean well is a destination | M | `items.js` litres, `outdoors.js` rain catcher, `water.js`, swamp water, `food_poisoned` condition |
| 5 | **Skill books, magazines, recorded media** (finite, read over game hours) | Expedition prizes that cannot be farmed: a manual in a library or a bunker. Skills stay "by doing" but a book can double the pace up to a cap | S/M | `skills.js`/`stats.js` xpMul, timed-actions lane, loot rows, radio/music media |
| 6 | **Stash maps, notes and shared map pins** | The cheapest, cleanest *pull*: a note on a body says where a cache is. One-time, no refill, and another survivor can read the same note | S/M | pulls + knowledge model (law 6), `road_atlas`, journal, quests |
| 7 | **Cooking: recipes, quality, meals that matter** | Food gets better than "eat the can": a cooked meal buys morale and well-fed. Real ingredients from the farm/forage/hunt: the first reason to carry salt and a pan | M | camp fire pit, drying rack, `cooking` skill, CREW cook job, `well_fed` condition |
| 8 | **Clothing that wears: condition, dirt, holes, patches, laundry, layered warmth** | Makes the paperdoll a supply problem. Armour and coats tear; wet, dirty clothes cost warmth and add smell (dogs and the infected read it). Needles/thread/cloth are scrap-run loot | M | `gear.js` paperdoll, `survival.js WET/CLIMATE`, `scentMul`, tailoring skill row |
| 9 | **Tool and gear durability + repair for everything** | Guns already wear. Knives, axes, crowbars, lockpicks and bags do not. Wear is the steady scarcity that keeps "the world's stock only goes down" true even for what you carry | M | `GUN_WEAR`/`GUN_CARE`, melee lane's weapon rows, repair mul, scrap |
| 10 | **Bows and silent ranged weapons with recoverable arrows** | A weapon that does not ring the dinner bell, built from carved wood, feathers and bone. Arrows lodge in bodies and are recovered by looting the dead (a percentage per arrow type) | M | `ballistics.js` (travel and drop), calibers lane, `FORAGE` feathers, `BIRDS`, noise model |
| 11 | **Vehicle ignition: real keys, hotwire, ignition-cut wrecks** | Law 1 already says NPCs need a real key. For the player: a stolen car is a noisy, timed, skill-rolled act, and a car without a key is a part-out wreck, not a free ride | M | `vehicledamage.js`, `seats.js`, wrecks, `lockcraft`, timed-actions lane, deeds (theft) |
| 12 | **Seasons: a compressed year** (winter snow north, long dry south, planting windows) | Gives the map *when* as well as *where*. Winter makes the north a hard trip (fuel for heat, coats), summer cooks the desert. Drives farming, clothing and the grapevine | M/L | `sky.js` states, `CLIMATE`, `regions.js`, WEB_STREAMING biome letters |
| 13 | **Fire as a system** (spread by material, smoke columns, burned houses, extinguishers) | Consequence in its purest form: a campfire left lit, a molotov, a generator on a leaking can. A burning block is seen for miles and ends the loot in it | L | `materials.js` flammability, `throwables.js`, `burn` injury, storeys, noise/light |
| 14 | **Field medicine, finished** (stitches, bullet and glass removal, doctor roll, pain windows) | PZ's best-loved loop is "who treats this". DSOA has the wounds and the kit item but no verb that needs the kit. A medic role and a clinic already exist to pay it off | S/M | `INJURIES`, `suture_kit`, roles (medic), crew `tend`, timed actions |
| 15 | **Horses** (ride, feed, water, saddlebags, stamina) | Fuel is scarce; a horse is a second kind of distance. Quiet, goes where cars cannot, but needs feed (so it needs the farm), can be shot, stolen, and starve | L | quadruped rig in `fauna.js`, `dogs.js` bond, `decks.js` riders, stance, water/forage |
| 16 | **Overflight events** (a patrol aircraft on a schedule, radio warning, noise path that pulls hordes) | A world event that makes you move *today*: take cover, kill the engine, or ride the noise away. Gives the Remnant and the Tally something to do in the sky | M | `director.js`, `milbases.js` helipads, radio, `zombies.js` noise pull |
| 17 | **Livestock and husbandry** (chickens, goats, a cow; feed, eggs, milk, theft, slaughter) | The long-arc food loop after farming. Nothing for free: they need feed and water that someone grew or carried | L | Farming, `fauna.js`, `butcher` rows, trade couriers |
| 18 | **Calories, nutrition and visible body condition** | A starved survivor looks starved. Variety matters (beans alone do not carry you). Ties the body doll, cooking and farming into one honest scoreboard | M | `survival.js` food, body-doll lane, `well_fed`, items nutrition rows |
| 19 | **Walkie-talkies and radio frequencies for crews and shards** | Multiplayer-first: range, battery, a channel only people with the same set hear. Raiders with a scanner hear unsecured chatter (the scanner kit already listens) | M | `radio.js`, scanner, airwaves source, battery cells, crew |
| 20 | **Diegetic clock and forecast** (no watch = day part only; weather by radio or barkeep) | Cheap, strong flavour, and exactly law 6: you know the time because you carry a watch. Makes the wristwatch loot and the radio matter | S | `wristwatch` item, HUD clock, `radio.js`, `sky.js` states |

**Honourable mentions** (real, but later or small): base sensor networks (tripwire to alarm to floodlight, raiders cut wires) once Power and camps land;
sheet-rope and escape-rope as base-defence items; danger-weighted loot as a tuning row; dog breeding and dog-carried packs; propane stoves; a herbal poultice recipe set once the recipe engine exists.

**Rejected on purpose:** loot respawn (law 2), zombie transmission by corpse or a "turn" timer (canon), a class menu (law of roles), character skill points to spend (skills grow by doing),
pre-collapse start week (our start is the bus), sandbox-screen of 350 options (three dials and the goal loop).

### Why the top of the list is ordered the way it is

1. **#1 is the enabler.** Cooking, mending, sewing, forging, handloading and the generator itself are all recipes. Build the engine once (rows + `validate*` + a forge surface) and the rest become row work, which is what law 7 asks for.
2. **#2-#4 are the three things a base *needs* to survive without a daily run:** food, power, water. Each has a failure mode (drought and blight, fuel and noise, taint) that creates consequence, and each creates a thing raiders and rivals want to take.
3. **#5-#6 are the cheap pulls.** Both are "an item in the world that sends you somewhere", cost almost nothing to build, and fit the knowledge model that already exists.
4. **#7-#11** make what you carry and wear a supply line, so the long arc keeps pushing you out.
5. **#12-#16** are the big, world-shaped arcs (calendar, fire, horse, overflight) that should follow once the maker economy exists to give them stakes.

## 3. Top 8 (sent to the status pane as one question)

1. Crafting recipes + benches
2. Farming and gardens
3. Power (generators, fuel, noise)
4. Clean water
5. Skill books, magazines, recorded media
6. Stash maps, notes, shared pins
7. Cooking
8. Clothing that wears

Grouped into four answers Robert can pick: **Crafting + skill books** (#1, #5), **Farming + cooking** (#2, #7), **Power + clean water** (#3, #4), **Stash maps + clothing wear** (#6, #8).
Suggested order if he wants a path rather than a pick: crafting engine first (it carries the rest), then Farming + cooking and Power + water in parallel lanes (they touch different files),
with stash maps as a one-day side lane whenever a slot is free.

## 4. Source notes (what each study item was and what it taught)

| Source | Taught |
|---|---|
| PZ base: Farming scripts | Crop rows carry water level, grow time in hours, sow/best/bad months, harvest level, disease chances; the "months" make farming a calendar skill |
| PZ base: Foraging | Zones + skill vision radius + categories; DSOA's `FORAGE` already covers the shape |
| PZ base: Entities / multistage build | Placed workstations with input/output slots and progress; walls upgrade in stages (rickety, wooden, strong, metal) |
| PZ base: ContextMenu verbs | The verb list is a feature inventory: stitch, remove glass/bullet, splint, clean burn, sheet rope, throw corpse over fence, bury, generator connect/fix/take, siphon, hotwire, plumb, patch hole, add padding, dye hair, claim safehouse |
| PZ base: Sandbox options | ~350 knobs; the ones that map to DSOA laws: water/electric shutoff day, loot respawn (rejected), zombie population loot effect, season/farming speed, XP multipliers, zombie senses |
| PZ base: Moodles | The status icon vocabulary and the one-line cause/cure text |
| Bandits, NPC Bases, Living NPC, Remnants, NotAlone, Superb Survivors | NPCs as threat and companion; four-stage claimed bases; DSOA's society layer already covers the shape |
| Last Signal / Perimeter Electronics | Sensor nodes and a hub; raiders cut wires; decoy sirens |
| RadArchery | Silent ranged with arrows that lodge in bodies and are recovered by looting; recovery chance by arrow type |
| Horse Mod | Riding stamina, saddle, saddlebags, feed |
| Companion Dogs + breed packs | Breeds, puppies, saddlebags, pack roles |
| True Weathers, Winter FX | Storms visible on the horizon, snow that builds and melts, wet surfaces, window frost |
| Heli Event | Overflight, loudspeaker, noise pulling zombies |
| Dynamic Trading, TVRadio, wired/walkie radio mods | Prices from stock, scripted broadcasts, radios on power, frequencies |
| Survivor Briefing, SmartWatch HUD | "Only what your character can know" display mode |
| Visible Loot, Knox Inventory, Viewpoint family, terrain/roof/door/curtain packs | Presentation only; nothing to carry over |

## 5. Method note for whoever builds from this

Every pick must ship the way the lanes already do: data rows, a `validate*` function, a forge/editor surface, two green batteries, and a design doc that
says which of scarcity / distance / consequence it makes bite harder (depth-plan law 7 and the loop table). Re-state laws 1 (nobody cheats), 2 (no regeneration),
3 (the world moves only while someone is in it), 5 (multiplayer first) and 6 (nobody knows what they weren't told) in each brief. `ip-lint` must report 0 deny: use our
own names for everything, and do not carry PZ's item names, recipe names or UI wording into player-facing strings.
