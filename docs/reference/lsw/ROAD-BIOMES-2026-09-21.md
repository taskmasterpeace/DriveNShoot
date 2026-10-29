# Road biomes: Robert's Perplexity research (2026-09-21), condensed

Source (shared session): https://www.perplexity.ai/search/33be649c-9f11-4cfb-a2f2-9b90314f0f43
Robert's question: encounters for street heroes (Punisher, Daredevil, Taskmaster) and big heroes (Goku, Superman) on a cross-country road trip; NPCs and locations; which places around the world are unique vs "just change the trees"; "road biomes" for the whole world.
Robert on 2026-09-23: "All the US has to be is roads that connect all the cities, but then we have exits… sometimes you got to get off the exit to get to another major road… different types of major roads: six-lane highway all the way down to a two-lane highway where the trees are close to the car… there's no sidewalk."

## Core model
**Road Biome = Ecosystem + Road Class + Human Footprint + Weather/Time + Regional Culture + Threat Layer**
Example: "Blue Ridge Rain Interstate" = temperate forest + mountain interstate + scattered towns/tourism + heavy rain at dusk + Appalachian roadside culture + a crashed prison convoy.

| Layer | Examples | Controls |
|---|---|---|
| Natural biome | desert, pine forest, prairie, rainforest, tundra, Mediterranean scrub | plants, soil colour, haze, animals, distant views, materials |
| Terrain form | flat basin, rolling hills, canyon, coast, river valley, mountain pass | road curves, visibility, ambush routes, bridges, tunnels |
| Road class | interstate, two-lane highway, beltway, rural route, dirt road, coastal cliff road | speed, traffic, encounter density, police response |
| Settlement pattern | dense suburb, commercial strip, farm towns, isolated gas station, megacity edge | NPC types, stores, mission hooks |
| Weather/season | thunderstorm, dust storm, wildfire smoke, snow, fog, hurricane | driving physics, sight lines, rescues |
| Threat layer | street crime, pursuit, crash, creature migration, quarantine | what turns scenery into content |

Procedural approach: generate the base region, then pick road-biome variants and encounter skins. Stream road chunks; keep the current biome's rules; put a memorable transition beat where the region changes.

**Three-level hierarchy:** (1) global biome (desert, tropical rainforest, temperate forest, grassland, mountain, polar, wetland, Mediterranean) → (2) regional road biome ("Virginia Blue Ridge interstate", "Namib gravel highway", "Japanese mountain expressway", "Outback road-train route") → (3) local encounter skin (diner, checkpoint, bridge, market, wildfire, convoy, cult, hidden base, stranded civilians, anomaly). Start with 10–15 road-biome families and add regional packs.

## Encounter scales
Street (Punisher/Daredevil/Taskmaster/Batman: exit, motel, warehouse, rest stop) · Road (convoy, armoured truck, prison bus, pileup) · Regional (storm front, wildfire, dam, migration across towns) · National/planetary (satellite crash, launch, arrival) · Mythic/dimensional (reality tear, road exiting into another realm). **The same gas station serves every scale** (cartel truck route / witness extraction / camera footage / tanker about to poison a town / a sealed artifact beyond the station).

30 road-encounter templates (each with biome fit, NPC, what heroes see, escalation): convoy with no plates, impossible detour, last-stop diner, overturned bus, ghost radio broadcast, highway sniper, animal stampede, fuel theft at the border, tornado chase, forest-fire roadblock, closed military exit, carnival in a dead town, freight-train parallel chase, bridge hostage crisis, roadside fight club, motel room 13, giant footprint crossing, town with no internet, celebrity motorcade, dam release, pilgrimage traffic jam, lightning on one mile, roadside memorial speaks, truck stop under siege, border of the burned zone, biker funeral procession, seasonal workers disappear, the exit that should not exist, refugee caravan, fallen object in a field.
Big-hero encounters keep a decision in play: continental storm wall, mountain pass collapse, the moving crater, ocean-road evacuation, giant creature migration (maybe not the villain), solar blackout chase, orbital debris corridor, multi-state prison transfer (can't catch them all), reality fault line, cross-country race with stakes. Batman notices the crime pattern, while Superman notices heartbeats and radiation and can end the chase, but doing so scatters the cargo or the mastermind.

## 19 global road biomes
Humid eastern forest corridor · Managed pine/plantation road · Temperate old-world countryside (hedgerows, roundabouts) · Continental farm belt (silos, straight roads) · Steppe/open grass sea · Tropical savanna road (red laterite soil) · Tropical monsoon road (rice, motorbikes, floods) · Tropical rainforest corridor · Mediterranean coast and scrub · True hot desert highway · Semi-arid scrub and badlands · High mountain pass (switchbacks, tunnels) · Volcanic island/lava road · Boreal highway/taiga · Arctic/polar road · Wetland and delta road (causeways, stilt homes: **swamps**) · Megacity edge/peri-urban sprawl · Post-industrial corridor (Rust Belt) · Coastal typhoon/cyclone route.

## Regional identity packs (what you can't fake by swapping trees)
Sub-Saharan Africa (laterite, long-distance buses, roadside markets, wildlife corridors) · North Africa/Middle East (walled towns, palms at water, checkpoints, exposed stone, oil/gas) · Western Europe (narrow lanes, roundabouts, stone villages, rail) · Eastern Europe/Balkans (concrete apartment edges, post-socialist industry, rough local roads beside motorways) · East Asia (density, terraces, tunnels/bridges, neon, scooters) · South Asia (dense mixed traffic incl. animals, religious sites, monsoon floods, painted freight trucks) · Southeast Asia (motorbikes, stilt structures, night markets, ferries) · Oceania (huge distances, road trains, kangaroo signs, bushfire; NZ volcanic/alpine) · Latin America (Andes switchbacks, colonial cores, hillside settlements, river crossings) · Antarctica (logistics-horror: whiteout, ice runways, tracked vehicles).
Same gameplay grammar with a regional expression. For example, "isolated roadside stop" = US gas station/diner/motel | East African fuel kiosk/market/ranger post | SE Asian food stall/motorbike repair | European service area/village café.

## Official maps to build on
WWF Terrestrial Ecoregions (~825 ecoregions, 14 biomes, 8 realms) · FAO Global Ecological Zones · National Geographic biome layers · EPA ecoregions (US detail, gradual change not at state borders).

## Road class ladder for our US (Robert)
Interstate (6+ lanes, exits/interchanges, no sidewalks) → US/state highway (4-lane divided) → two-lane highway (trees close, no sidewalk, shoulders) → rural route → dirt/forest road; plus beltways/ring roads around cities. **Exits** connect a road class to the next one down; sometimes you exit to reach another major road.
