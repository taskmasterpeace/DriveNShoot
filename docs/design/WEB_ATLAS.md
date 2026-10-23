# WEB_ATLAS — every road-novel place, its people and its fights, on the DSOA map

**Status:** design reference and data, 2026-10-23. **Data:** `web/src/data/atlas.js` (rows only; nothing imports it, it is
not wired into the game). **Tool:** `web/tools/atlas-project.mjs` (derives world x/z, writes the tables below).
**Owner of the calls:** Robert. **Method:** clean-room study. Public sources only (fan wiki through its API, publisher
blurbs, Goodreads, GraphicAudio product pages, opening-chapter previews, Wikipedia); the raw notes and their source URLs
live in `web/.study/deathlands/` (gitignored, never shipped). Everything below is written in our words.

---

## 1. Overview

Robert asked for every location in every book of James Axler's road novels, reimagined; for the whole ensemble, not
only the leads; for combat over dialogue; and for one real military base per state, sized by its real footprint. This
document is that atlas for the DIVIDED STATES OF AMERICA web engine (`web/`).

The series ran to 158 numbered titles (1986–2026; Gold Eagle paperbacks, then GraphicAudio audio originals) plus four
prequel audio dramas. The study read every title it could find a public summary for. The wall
(`WEB_FAN_SERVICE_BIBLE.md` §3.1) decides what crosses:

| Crosses the wall (used here) | Stays behind (never in this doc or the data) |
|---|---|
| real places: cities, landmarks, parks, rivers, bases, abroad | the series' invented place names and its nicknames for real places |
| kinds of places: a sealed lab, a walled trade town, a toll pass | plot beats ("who did what to whom there") |
| kinds of people: the armorer, the one-eyed leader, the swamp kid | character names, signature combinations, catchphrases |
| how fights feel: scarce ammo, ambush ground, hot ground | the series' slang for bunkers, money, guards, monsters, vehicles |

| Part | Where | Count |
|---|---|---|
| (a) Sites: real places, reimagined | §3.2, `ATLAS_SITES` | **147** (124 on the mainland grid, 23 off it: abroad, Alaska, Puerto Rico, the Keys); 106 named in sources, 41 anchored by us from a region |
| (b) The cast: archetypes, leads to bit parts | §3.3, `ATLAS_CAST` | **81** (8 crew, 6 allies, 18 rulers, 23 villains, 12 creature kinds, 14 minor parts) |
| (c) Combat situations | §3.4, `ATLAS_SITUATIONS` | **23**, each with what the engine already does and what is missing |
| (d) Military installations | §3.5, `ATLAS_BASES` | **50**, one per state, real coordinates and real area, 8 of them the canon Carousel ring rows |
| Holders (who owns a place) | `HOLDERS`, `RULERS` | 20 holder kinds; the 50 canon rulers of `docs/DIVIDED_STATES.md` |

Coverage: of the 158 numbered titles, a real-world setting was found and placed for 122 (and in the four prequels, none). The
ones without one are listed in §5.

## 2. Player Fantasy

*The country you drive is the one the old paperbacks drove, but it is yours. The swamp suburb where every house stands
and nobody lives; the lodge on the canyon rim; the town that pumps fuel out of a buried tank farm in the hottest valley in
the West; a museum mile of teen crews; a vault behind four stone faces; a river where whoever floats the most steel owns
the water. You never meet the books' people, but you meet their kind: the Keyholder with one odd law, the gallows clerk,
the ride boss, the rail general on his armored train, the duster waiting at the place you must go. Every one of them
fights the way their place makes them fight. And every state has its base, behind wire, sized like the real one, held by
somebody who will tell you once to turn around.*

| If you love… | You should feel… |
|---|---|
| the road novels | "I know this place" at Crater Lake, Mount Rushmore, the Florida Keys, Shiloh, Niagara, the Pine Barrens, without ever reading a name from the books |
| GTA2 / Autoduel | every site is a reason to drive somewhere specific, and the road there is the fight |
| Project Zomboid / 28 Days Later | the herd siege, the trap town, the haven that is not one |
| We're Alive | living people are the worst thing on the map |

## 3. Detailed Rules

### 3.1 The wall, applied to this atlas
1. **A site's display name is ours.** It describes the place in DSOA terms (THE BONEYARD TOWN, THE FACE VAULT). It never
   reuses the books' invented town names or their nicknames for real places (both are in the landmine register,
   `WEB_FAN_SERVICE_BIBLE.md` §3.5 row 12). The real place name may appear in `real` because it is geography.
2. **A site's line says what the place IS in DSOA and how it fights, never what happened there in a book.** The first
   draft carried 60+ plot beats; they were cut to place-and-fight descriptions before commit.
3. **An archetype carries a handle, never a person's name.** Handles are roles in our voice (the Quartermaster, the
   Static-Ear). No archetype copies a lead's signature combination (weapon + look + origin); see §5 for the set-level call.
4. **Our canon wins.** The series' cause (a nuclear war) does not cross: in DSOA the country broke in the Fracture and
   Black Week (`docs/LORE_BIBLE.md`). The series' craters become our Capitol Dead Zone, hot ground, failed reactors and
   ring faults; its matter transmitters are our Carousel; its mutants map onto our infected and failed-fix animals.
5. **Real places only.** If a book named only an invented town, the site anchors on the real place the sources put it in
   or near, marked `conf: 'inferred'`. If no real place could be found, there is no site (§5 lists those books).

### 3.2 (a) Sites

Each row: `id`, `name` (ours), `real` (the real place), `lat`/`lon`, `state` (USPS code, `DC`, `PR`, or `null` abroad),
`kind`, `situation` (a §3.4 id), `biome` (the usmap legend plus `arctic`, `island`, `jungle`), `terrain`, `holder` (a
`HOLDERS` key; `ruler` resolves to the state's canon ruler), `what` (one or two lines), `conf`.

Kinds: **holdout** (a town with a gate and a Keyholder) · **station** (a Carousel Station: our bunker with a ring) ·
**depot** (a sealed store with no ring; COLD DEPOTS rules) · **lab** (a trial lab; the Lab Kin) · **ruin** · **hazard**
(hot ground, flood, quake, smoke) · **route** (a pass, a crossing, a road) · **arena** · **wilds**.

World x/z are derived (§4 F1); "moved n" means the state law (§4 F3) shifted the point n usmap cells (500 m each, 2.6 km
in the world) to land inside its own state.

<!-- atlas:sites -->
| # | Site | Real place | lat, lon | world x, z (km) | DSOA kind | Combat | Biome: terrain | Held by | Placement |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **THE BLUE CALDERA** | Crater Lake and Wizard Island, Oregon | 42.945, -122.109 | -67.9, -88.2 | lab | Bunker clearing | mountains: caldera rim, a cold deep lake, one cinder island | the Lab Kin | stated |
| 2 | **THE SOUND UNDERCITY** | Seattle, Washington | 47.606, -122.332 | -68.9, -131.3 | ruin | Tunnel fight | urban: a dead downtown over a warren of utility tunnels | the Aerospace Guild | stated |
| 3 | **THE PAID HUNT** | Yakima, Washington | 46.602, -120.506 | -56.8, -122.1 | holdout | Manhunt | scrub: shrub-steppe hills, dry washes, one fenced orchard town | a local Keyholder family | stated |
| 4 | **THE CASCADE GATE** | Snoqualmie Pass, Washington | 47.425, -121.414 | -62.8, -129.7 | route | Road ambush | mountains: a high pass, snow sheds, switchbacks | The Crimson Road | stated |
| 5 | **THE FIELD OF THREE MILLION** | Willamette National Cemetery, Portland, Oregon | 45.462, -122.540 | -70.6, -111.3 | wilds | Urban gang war | forest: endless grave rows, dig pits, spoil heaps | contested | inferred |
| 6 | **BADWATER FUEL** | Death Valley (Furnace Creek), California | 36.457, -116.867 | -33.2, -28.6 | holdout | Siege of a walled town | desert: salt pan, a buried tank farm, heat that kills engines | the Silicon CEO, the Cartel and the Angel Warlords | stated |
| 7 | **THE EMPTY FORT** | the Mojave near Barstow, California | 34.900, -117.020 | -33.8, -14.2 | ruin | Ruin crawl | desert: a deserters' adobe fort, wind, nobody home | nobody | inferred |
| 8 | **THE SAND PALACE** | Guadalupe-Nipomo Dunes, California | 34.966, -120.640 | -58.1, -14.8 | holdout | Cult compound | desert: coastal dunes over a buried 1920s film set of plaster gods | The Broadcast Church | stated |
| 9 | **THE HILL MANSION** | Hearst Castle, San Simeon, California | 35.685, -121.168 | -61.7, -21.6 | holdout | Siege of a walled town | scrub: a hilltop palace above the coast road | The Corporate Corridor | stated |
| 10 | **THE STRIP PIT** | Las Vegas Strip, Nevada | 36.115, -115.173 | -22.3, -25.5 | arena | Arena and blood sport | urban: casino shells around a sunken fighting pit | the House | stated |
| 11 | **THE ROCK HARBOR** | Morro Bay, California | 35.371, -120.867 | -59.6, -18.6 | holdout | Sea and lake raid | ocean: fog, a sandspit, the great rock | the corsairs | stated |
| 12 | **SULFUR ISLAND** | San Clemente Island, California | 32.900, -118.500 | -43.7, 4.4 | holdout | Sea and lake raid | island: a dry rock island, an old naval airstrip, sulfur pits | contested | stated |
| 13 | **THE ORANGE ISLE** | Santa Cruz Island, California | 34.000, -119.720 | -51.7, -5.9 | wilds | Road ambush | island: orange groves gone wild, sea cliffs, a half-fallen bunker | nobody | stated |
| 14 | **THE SEAWALL BREAK** | Port of Long Beach, California | 33.770, -118.190 | -41.3, -3.9 | hazard | Hazard crossing | water: a flooded port district, cranes standing in the tide | the Silicon CEO, the Cartel and the Angel Warlords | inferred |
| 15 | **THE PINE SANCTUARY** | Sierra foothills east of Fresno (Shaver Lake), California | 37.105, -119.318 | -49.3, -34.6 | holdout | Cult compound | forest: pines, roaring rivers, a valley the Fracture missed | The Green Belt | inferred |
| 16 | **THE BLACK ROCK SEA** | Black Rock Desert, Nevada | 40.780, -119.210 | -48.4, -68.4 | hazard | River fight | water: a flooded playa, old peaks standing up as islands | nobody | stated |
| 17 | **THE SALT BREACH** | Salt Lake City (west suburbs), Utah | 40.761, -111.891 | 1.3, -68.9 | hazard | Ruin crawl | urban: a suburb flattened from the inside out | the Prophet | stated |
| 18 | **QUARANTINE BRIGHAM** | Brigham City, Utah | 41.510, -112.016 | 0.4, -75.7 | holdout | Siege of a walled town | farmland: orchard town behind a sick-line of wire | The Federal Remnant | stated |
| 19 | **THE BRINE PANS** | Great Salt Lake Desert salt ponds, Utah | 40.730, -113.000 | -6.3, -68.5 | route | Trap town | desert: salt flats, brine ponds, a palm oasis that should not be there | the chain trade | inferred |
| 20 | **THE RIM HOTEL** | Grand Canyon South Rim, Arizona | 36.057, -112.140 | -1.0, -24.8 | holdout | Armored train | mountains: an old rim lodge, the canyon edge, a rail spur | the Sun Court | stated |
| 21 | **THE BONEYARD TOWN** | Tucson, Arizona | 32.223, -110.975 | 7.2, 10.7 | holdout | Manhunt | desert: saguaro flats, rows of dead aircraft, adobe walls | the Sun Court | stated |
| 22 | **THE WHITE FLATS** | White Sands, New Mexico | 32.787, -106.326 | 38.6, 4.9 | lab | Bunker clearing | desert: white gypsum dunes, a test range, blockhouses | The Federal Remnant | stated |
| 23 | **THE MESA VAULT** | Archuleta Mesa near Dulce, New Mexico | 36.934, -107.000 | 33.8, -31.2 (moved 1) | station | Bunker clearing | mountains: a high mesa with doors in its side | the Lab Kin | stated |
| 24 | **THE SEIZED PUEBLO** | Taos, New Mexico | 36.407, -105.573 | 43.6, -28.6 | holdout | Siege of a walled town | mountains: adobe town under the Sangre de Cristo | a local Keyholder family | stated |
| 25 | **FOUR CORNERS TOLL** | Farmington, New Mexico | 36.728, -108.219 | 25.7, -31.3 | holdout | Road ambush | desert: a river town on the north road, a chain across the bridge | a local Keyholder family | stated |
| 26 | **DURANGO GRADE** | Durango, Colorado | 37.275, -107.880 | 28.0, -36.3 | route | Road ambush | mountains: a narrow-gauge line climbing a river canyon | The Free Counties | stated |
| 27 | **THE PASS FORT** | Sunspot (Sacramento Peak), New Mexico | 32.789, -105.820 | 42.0, 4.9 | holdout | Range war | mountains: observatory domes on a pass above the white basin | contested | stated |
| 28 | **THE CLIFF HOUSES** | Mesa Verde, Colorado | 37.184, -108.489 | 23.9, -35.4 | holdout | Cult compound | mountains: cliff dwellings, canyon rims, ladders | a local Keyholder family | stated |
| 29 | **THE DAM MAZE** | Navajo Dam, New Mexico | 36.801, -107.612 | 29.8, -32.0 | lab | Creature swarm | desert: a dam, its galleries and spillway tunnels | failed-fix animals | inferred |
| 30 | **THE TWO TOWNS FEUD** | Deming, New Mexico | 32.269, -107.759 | 29.0, 9.7 | holdout | Road ambush | desert: flat desert between two rival trade towns | contested | inferred |
| 31 | **THE BORDER WAGON ROAD** | Rio Grande at Presidio, Texas | 29.561, -104.372 | 51.6, 34.6 | route | Convoy escort | desert: river cane, cliffs, a wagon road | the Republic | inferred |
| 32 | **THE CATTLE PASS** | Ash Fork, Arizona | 35.225, -112.484 | -3.2, -16.9 | route | Road ambush | scrub: a narrow pass on the drive trail | The Crimson Road | inferred |
| 33 | **THE CAVALRY POST** | Fort Union National Monument, New Mexico | 35.907, -105.014 | 47.3, -24.0 | ruin | Siege of a walled town | plains: adobe ruins of a frontier fort on the Santa Fe Trail | contested | inferred |
| 34 | **THE RANCH ROAD** | the Rio Grande valley near Hatch, New Mexico | 32.665, -107.153 | 33.1, 6.0 | route | Road ambush | farmland: chile fields, a ranch house, a road bandits like | nobody | inferred |
| 35 | **THE TENT FIELD BUNKER** | Denver International Airport, Colorado | 39.856, -104.674 | 50.2, -59.6 | station | Bunker clearing | plains: white tent roofs on the high plains, everything else underground | the Lab Kin | stated |
| 36 | **THE LIT CITY** | Denver (Capitol Hill), Colorado | 39.739, -104.990 | 48.1, -58.5 | holdout | Urban gang war | urban: the high ground above the drowned river bottoms | contested | stated |
| 37 | **THE TWO-MILE TOWN** | Leadville, Colorado | 39.251, -106.293 | 39.0, -54.1 | holdout | Siege of a walled town | mountains: the highest town on the map, mine tailings, thin air | The Free Counties | stated |
| 38 | **SOUTH PARK POST** | Fairplay, Colorado | 39.225, -105.998 | 41.0, -53.8 | holdout | Siege of a walled town | mountains: a high basin, an old mining main street | The Free Counties | stated |
| 39 | **THE EMPTIED CAMP** | Alma, Colorado | 39.284, -106.063 | 40.6, -54.4 | ruin | Ruin crawl | mountains: one street, every door open | nobody | stated |
| 40 | **THE SPRINGS DINER** | Glenwood Springs, Colorado | 39.550, -107.325 | 31.9, -57.0 | holdout | Trap town | mountains: hot springs, a canyon, one diner | a local Keyholder family | stated |
| 41 | **THE GOLD CAMP** | Cripple Creek, Colorado | 38.747, -105.178 | 46.5, -49.4 | holdout | Siege of a walled town | mountains: mine headframes on a volcanic bowl | The Free Counties | stated |
| 42 | **THE RESORT VALLEY** | Buena Vista, Colorado | 38.842, -106.131 | 40.0, -50.4 | holdout | Range war | mountains: a resort town in the upper Arkansas valley | contested | stated |
| 43 | **THE PLAINS PESTHOLE** | Yuma, Colorado | 40.122, -102.725 | 62.8, -62.2 | holdout | Range war | plains: a grain-elevator town on the high plains | a local Keyholder family | stated |
| 44 | **THE ICE PARK** | Glacier National Park and Grinnell Glacier, Montana | 48.760, -113.787 | -11.5, -142.4 | station | Bunker clearing | mountains: glaciers, a lake road, deep timber | The Free Counties | stated |
| 45 | **THE BURNED JUNCTION** | Moccasin, Montana | 47.057, -109.946 | 14.0, -126.5 | ruin | Convoy escort | plains: a wheat town on the plains, burned flat | nobody | stated |
| 46 | **THE MAP VALLEY** | the Rocky Mountain Front near the Bob Marshall Wilderness, Montana | 47.600, -112.900 | -5.6, -131.6 | depot | Convoy escort | mountains: a hidden valley behind the front range | failed-fix animals | inferred |
| 47 | **THE FALLEN STAR** | Idaho Falls, Idaho | 43.492, -112.034 | 0.1, -93.6 | ruin | Ruin crawl | urban: a river city of scavengers, wreckage across the lava plain | the Preppers' Republic | stated |
| 48 | **THE SLAG CAMPS** | Rupert, Idaho | 42.619, -113.677 | -11.0, -85.6 | holdout | Slaver raid and rescue | scrub: mines in glassed ground, crevasses, a fenced work camp | The Corporate Corridor | stated |
| 49 | **THE FACE VAULT** | Mount Rushmore, South Dakota | 43.879, -103.459 | 57.8, -97.1 | station | Bunker clearing | mountains: granite faces, pine slopes, a vault inside the mountain | The Federal Remnant | stated |
| 50 | **THE WALL** | Badlands, South Dakota | 43.855, -102.340 | 65.4, -96.9 | wilds | Herd siege | scrub: eroded walls, buttes, blizzard prairie | The Crimson Road | stated |
| 51 | **THE TRENCH TOWN** | Ogallala and the Sandhills, Nebraska | 41.128, -101.720 | 69.5, -71.6 | hazard | Range war | plains: trenches across flat plains; ground that moves | The Federal Remnant | stated |
| 52 | **THE ASH CITY** | Bismarck, North Dakota | 46.808, -100.784 | 76.1, -124.5 | ruin | Ruin crawl | urban: a city under falling ash, lightning the only light | The Broadcast Church | inferred |
| 53 | **THE TOWER LINE** | the rail line at Jamestown, North Dakota | 46.910, -98.708 | 90.1, -125.5 | route | Armored train | plains: flat sandy plains, old track, broadcast towers | The Broadcast Church | inferred |
| 54 | **THE PALACE IN THE TREES** | Abilene, Kansas | 38.917, -97.214 | 99.9, -51.4 | holdout | Siege of a walled town | forest: Kansas gone to hardwood forest, a rich family's walled estate | The Corporate Corridor | inferred |
| 55 | **THE SPLIT TOWN** | Salina, Kansas | 38.840, -97.611 | 97.2, -50.6 | holdout | Herd siege | farmland: a grain town split down the main street | contested | inferred |
| 56 | **THE VINE CITY** | Kansas City, Missouri | 39.100, -94.579 | 118.3, -53.3 | ruin | Creature swarm | urban: a city gone under creeper vines | failed-fix animals | stated |
| 57 | **THE GALLOWS TOWN** | Muskogee, Oklahoma | 35.748, -95.370 | 112.1, -22.1 | holdout | Prison break | forest: a stone courthouse, a gallows, a ring of mutant thorns | a local Keyholder family | inferred |
| 58 | **THE HEAVING FIELDS** | Woodward, Oklahoma | 36.434, -99.390 | 85.0, -28.4 | wilds | Creature swarm | plains: cracked plains that heave and re-form | failed-fix animals | inferred |
| 59 | **THE PUMPJACK CITY** | Luling oil field, Texas | 29.680, -97.647 | 96.7, 33.9 | holdout | Siege of a walled town | scrub: pumpjacks, a refinery, worker barracks | the Republic | inferred |
| 60 | **THE PUMP STATION** | Salt Flat, Texas | 31.746, -105.084 | 54.6, 20.8 (moved 3.6) | holdout | Siege of a walled town | desert: adobe walls on a vast salt flat around a water pump | a local Keyholder family | stated |
| 61 | **SONORA SHOWDOWN** | Sonora, Texas | 30.567, -100.643 | 76.6, 25.6 | holdout | Gunslinger or sniper duel | scrub: limestone hills, a courthouse square | The Crimson Road | stated |
| 62 | **THE BURNING SHORE** | La Porte and the Houston ship channel, Texas | 29.666, -95.019 | 109.2, 33.8 (moved 2) | hazard | Road ambush | swamp: a radioactive coastal plain, thorn scrub, rigs still burning in the Gulf | The Crimson Road | stated |
| 63 | **THE REFINERY WHARF** | Port Arthur, Texas | 29.885, -93.940 | 109.2, 31.2 (moved 5) | holdout | Sea and lake raid | swamp: refinery towers, a deepwater wharf | sutlers and haulers | stated |
| 64 | **THE LONG BARRIER** | Padre Island, Texas | 27.000, -97.380 | 98.6, 58.1 | holdout | Sea and lake raid | island: a barrier island of dunes and outposts | the Republic | stated |
| 65 | **THE RIVER-MOUTH POST** | Matamoros, Tamaulipas, Mexico | 25.869, -97.503 | off grid | holdout | Sea and lake raid | swamp: the Rio Grande mouth, a border town | the corsairs | stated |
| 66 | **THE SINKING VALLEY** | Mexico City and the Valley of Mexico | 19.433, -99.133 | off grid | ruin | Siege of a walled town | urban: a half-flooded megacity in a quaking highland valley | contested | stated |
| 67 | **THE LIT HARBOR** | Veracruz, Mexico | 19.174, -96.134 | off grid | holdout | Sea and lake raid | jungle: an old fort harbor with working electric light | the corsairs | stated |
| 68 | **THE SILENT SUBURB** | Lafayette (west side), Louisiana | 30.224, -92.020 | 134.8, 28.6 | ruin | Gunslinger or sniper duel | swamp: an intact suburb with nobody in it | a local Keyholder family | stated |
| 69 | **THE GREAT SWAMP** | Atchafalaya Basin, Louisiana | 30.300, -91.750 | 136.7, 28.0 | wilds | River fight | swamp: cypress, open water, nature-trail boardwalks | the Bayou Krewe | stated |
| 70 | **THE CURSED ESTUARY** | Morgan City and Atchafalaya Bay, Louisiana | 29.699, -91.207 | 140.4, 33.5 | holdout | Sea and lake raid | swamp: an estuary barony, a mansion on stilts, storms off the Gulf | a local Keyholder family | stated |
| 71 | **THE BOAT CITY** | New Orleans, Louisiana | 29.951, -90.072 | 148.2, 31.2 | station | River fight | swamp: a drowned city lashed together out of hulls | the Bayou Krewe | stated |
| 72 | **THE IRONCLAD YARD** | Vicksburg and the Yazoo mouth, Mississippi | 32.353, -90.878 | 142.5, 9.3 | holdout | River fight | swamp: river bluffs, reed banks, poisoned backwater | the River Barons | stated |
| 73 | **THE BLUFF THRONE** | Memphis, Tennessee | 35.150, -90.049 | 153.4, -18.2 (moved 2.2) | holdout | Siege of a walled town | urban: river bluffs, a ruined downtown, a mansion fort | the Music Barons | stated |
| 74 | **THE BATTLEFIELD LANDING** | Pittsburg Landing and Shiloh, Tennessee | 35.150, -88.321 | 159.8, -16.2 | holdout | Slaver raid and rescue | forest: a river landing, a Civil War battlefield of cannon and markers | a local Keyholder family | stated |
| 75 | **THE FORKS** | Cairo, Illinois (Ohio-Mississippi confluence) | 37.005, -89.177 | 156.0, -41.6 (moved 3.2) | holdout | Trap town | swamp: two great rivers meeting, riverboats at anchor | sutlers and haulers | stated |
| 76 | **THE ARCH FERRY** | St. Louis (Soulard and the south side), Missouri | 38.627, -90.199 | 146.9, -48.1 | holdout | Urban gang war | urban: the Arch, the brewery district, the market district, acid rain | the Gateway barons | stated |
| 77 | **THE NEW LANDING** | Ste. Genevieve, Missouri | 37.981, -90.042 | 148.0, -42.2 | holdout | Convoy escort | farmland: a rebuilt river town fifty miles below the old city | sutlers and haulers | inferred |
| 78 | **THE DUST MARKET** | Dumas, Arkansas | 33.887, -91.492 | 138.3, -4.6 | holdout | Siege of a walled town | farmland: a walled vice market on dust-bowl delta | a local Keyholder family | stated |
| 79 | **THE OPRY CIRCUS** | Nashville, Tennessee | 36.163, -86.782 | 170.3, -26.0 | holdout | Slaver raid and rescue | urban: a music-theme attraction town, a mine behind it | the Music Barons | stated |
| 80 | **THE HEALING SPRING** | Red Boiling Springs, Tennessee | 36.533, -85.850 | 176.5, -29.4 | holdout | Trap town | forest: a mineral spring, wooden hotels, fields | a local Keyholder family | inferred |
| 81 | **THE PLAGUE LIE** | Hazard, Kentucky | 37.250, -83.193 | 194.0, -36.0 | holdout | Prison break | forest: a coal hollow town | a local Keyholder family | stated |
| 82 | **THE SINKHOLE FARMS** | the Pennyrile karst near Hopkinsville, Kentucky | 36.866, -87.489 | 171.6, -36.4 (moved 2.8) | wilds | Tunnel fight | farmland: sinkholes, springs, a collapsed mine and command post under the fields | failed-fix animals | inferred |
| 83 | **THE BASEMENT CITY** | Chicago (the Loop), Illinois | 41.878, -87.630 | 165.1, -79.3 | ruin | Tunnel fight | urban: basements joined into tunnels under a flattened downtown | the Machine City | stated |
| 84 | **THE MOTOR STREETS** | Detroit, Michigan | 42.331, -83.046 | 197.6, -88.4 (moved 2) | holdout | Urban gang war | urban: an overgrown metropolis, a flooded station under it | the Motor Guild | stated |
| 85 | **THE LAKEFRONT WALL** | Milwaukee, Wisconsin | 43.039, -87.906 | 163.1, -89.9 | holdout | Siege of a walled town | urban: a lakefront city with a seawall | the Brewer Barons and the Dairy Chiefs | stated |
| 86 | **THE REACTOR SHORE** | Point Beach nuclear plant, Lake Michigan, Wisconsin | 44.281, -87.536 | 166.4, -104.0 (moved 1) | hazard | Hazard crossing | water: a dead reactor on the lakeshore, a warm-water outflow | failed-fix animals | inferred |
| 87 | **THE SURGEON TEMPLE** | Baraboo, Wisconsin | 43.471, -89.744 | 150.4, -93.7 | holdout | Cult compound | forest: a hospital on a hill, a river town below | a local Keyholder family | stated |
| 88 | **THE DEALING TREE CROSSING** | Madison, Indiana (Ohio River) | 38.736, -85.380 | 179.4, -52.0 (moved 1) | holdout | Air raid | forest: a river crossing and pass, a big tree where deals are made | a local Keyholder family | inferred |
| 89 | **THE REFORMATORY** | Ohio State Reformatory, Mansfield, Ohio | 40.784, -82.502 | 199.3, -68.7 | holdout | Prison break | farmland: a gothic prison with a town inside its walls | a local Keyholder family | inferred |
| 90 | **THE GENIUS'S TOWN** | Jefferson City, Missouri | 38.577, -92.174 | 133.8, -48.0 | holdout | Prison break | forest: a clean town on a river bluff, labs under the square | a local Keyholder family | inferred |
| 91 | **THE WAGON SALOON** | Duquesne (Joplin), Missouri | 37.077, -94.456 | 118.5, -34.4 | route | Trap town | farmland: a road through mining country | sutlers and haulers | stated |
| 92 | **THE OUTSIDERS' CAMP** | Tonganoxie, Kansas | 39.109, -95.088 | 111.8, -54.6 (moved 1) | ruin | Ruin crawl | farmland: a ruined town beside a stranger camp | nobody | stated |
| 93 | **THE RANGE WAR VALLEY** | Des Moines River valley near Ottumwa, Iowa | 41.020, -92.411 | 132.3, -70.8 | wilds | Range war | farmland: river bluffs, open prairie, barbed-wire ranch compounds | The Free Counties | stated |
| 94 | **THE TALLY PRISON** | Iowa State Penitentiary, Fort Madison, Iowa | 40.630, -91.315 | 137.8, -67.6 (moved 1) | arena | Arena and blood sport | farmland: a river-town prison turned into a society | a local Keyholder family | stated |
| 95 | **THE HARBOR INSTITUTES** | Duluth, Minnesota | 46.787, -92.100 | 134.5, -124.5 | lab | Bunker clearing | forest: a harbor city on a hill, three sealed private institutes | the Lab Kin | stated |
| 96 | **THE LONGHOUSE SHORE** | Two Harbors, Lake Superior, Minnesota | 47.023, -91.671 | 137.5, -126.7 | holdout | Sea and lake raid | forest: a rocky shore, longhouses, a poisoned river | a local Keyholder family | stated |
| 97 | **THE ISLAND THAT LIES** | Isle Royale, Lake Superior | 48.000, -88.830 | 169.0, -135.2 (moved 5) | holdout | Bunker clearing | island: a long forest island, a hulked ship holding a vault | a local Keyholder family | stated |
| 98 | **THE WRECK FLEET** | Thunder Bay (Alpena), Lake Huron, Michigan | 45.062, -83.433 | 193.2, -108.3 | holdout | Sea and lake raid | water: a shipwreck bay, a festival town, a sunken freighter used as a fort | the corsairs | stated |
| 99 | **THE ISLAND OF GANGS** | Manhattan (Fifth Avenue and the museum mile), New York | 40.783, -73.959 | 249.6, -78.0 (moved 5) | ruin | Urban gang war | urban: a spiral museum, mansion basements, tunnels | the Council of Trade | stated |
| 100 | **THE RIVER RUN SOUTH** | Kingston and the Hudson, New York | 41.927, -73.997 | 254.8, -83.2 (moved 2.2) | route | River fight | forest: a raft run down the Mohawk and the Hudson past ruined river towns, the Catskills above | nobody | stated |
| 101 | **THE STOCKTON CROSSING** | Stockton, New Jersey (Delaware River) | 40.405, -74.977 | 248.7, -64.2 | route | Road ambush | forest: a broken river bridge, the interstate west | the Turnpike Toll-Lords | stated |
| 102 | **THE CAPITOL RUINS** | Harrisburg, Pennsylvania | 40.273, -76.887 | 236.6, -63.3 | ruin | Ruin crawl | urban: a dome on the river, empty streets | the Foundry King and the Plain Folk | stated |
| 103 | **THE FALLS FARM** | Niagara Falls, New York | 43.083, -79.074 | 223.6, -93.6 (moved 1) | holdout | Slaver raid and rescue | farmland: green farmland near the falls the Fracture never touched | the chain trade | stated |
| 104 | **THE LAKE SHORE HOLDOUT** | Lake Champlain shore near Burlington, Vermont | 44.476, -73.212 | 262.0, -102.7 | holdout | Cult compound | forest: a small lake holdout, a fake old-west ghost town nearby | a local Keyholder family | stated |
| 105 | **THE GRANITE HIGHLANDS** | White Mountains, New Hampshire | 44.270, -71.300 | 275.0, -100.8 | wilds | Range war | mountains: forest highlands, big game, lava fields the war opened | The Free Counties | stated |
| 106 | **THE ISLAND PARK STATIONS** | Acadia National Park (Cadillac Mountain) and Isle au Haut, Maine | 44.353, -68.225 | 291.2, -106.6 (moved 2.8) | station | Bunker clearing | forest: granite domes, sea fog, an island in the bay | the Lighthouse Keepers' Compact | stated |
| 107 | **THE WHALING HARBOR** | Stonington, Maine | 44.156, -68.666 | 292.7, -99.7 | holdout | Sea and lake raid | ocean: a granite harbor, whaleboats, old speech | a local Keyholder family | inferred |
| 108 | **THE SLAVERS' HARBOR** | Rockland and Penobscot Bay, Maine | 44.104, -69.109 | 289.7, -99.3 | holdout | Slaver raid and rescue | ocean: a cold harbor town that trades with slavers | the chain trade | inferred |
| 109 | **THE PINE STATE** | New Jersey Pine Barrens | 39.800, -74.550 | 251.5, -58.6 | holdout | Cult compound | forest: sand roads, pitch pine, cedar water | a local Keyholder family | stated |
| 110 | **THE CRAB SHORE** | New Haven, Connecticut | 41.308, -72.928 | 263.5, -73.1 | wilds | Creature swarm | ocean: a harbor beach, spike-shelled crabs by the thousand | the Gun Barons | stated |
| 111 | **THE CRATER** | Washington, DC (the Mall) | 38.889, -77.035 | 236.6, -50.5 | ruin | Bunker clearing | urban: a glowing crater, drowned monuments, an orderly city underneath | The Capitol Dead Zone | stated |
| 112 | **THE FIVE-SIDED PIT** | the Pentagon, Arlington, Virginia | 38.872, -77.056 | 231.4, -44.2 (moved 2.8) | ruin | Bunker clearing | urban: a broken five-ring building over deep basements | The Capitol Dead Zone | stated |
| 113 | **THE MORGUE HARBOR** | Baltimore, Maryland | 39.290, -76.612 | 239.2, -54.3 | ruin | Urban gang war | urban: a dead harbor city cut into turf | the Beltway Ghosts | inferred |
| 114 | **THE NORTH VALLEY SEAT** | the northern Shenandoah Valley, Virginia | 38.920, -78.190 | 226.2, -49.4 (moved 1.4) | holdout | Siege of a walled town | farmland: a walled valley barony and its hamlets, the Blue Ridge above | a local Keyholder family | stated |
| 115 | **THE SEABOARD NATION** | the Delmarva peninsula (Salisbury), Maryland | 38.361, -75.599 | 239.2, -46.8 (moved 2) | holdout | Range war | farmland: flat farm peninsula between the bay and the ocean | contested | inferred |
| 116 | **THE KITE-BURNED HAMLETS** | Manassas (Bull Run) and Casanova, Virginia | 38.751, -77.475 | 228.8, -46.8 (moved 2.2) | ruin | Air raid | farmland: burned farm hamlets on the old battlefield | nobody | stated |
| 117 | **THE LISTENING DISH** | Green Bank, West Virginia | 38.433, -79.840 | 216.9, -46.8 | holdout | Cult compound | mountains: a quiet mountain valley around a giant radio dish | The Broadcast Church | stated |
| 118 | **THE LURE TOWN** | Buena Vista, Virginia | 37.734, -79.354 | 220.1, -40.4 | holdout | Trap town | mountains: a sealed mountain town, untouched, rich-looking | a local Keyholder family | stated |
| 119 | **THE HIGH HOMESTEAD** | Blue Ridge near Roanoke, Virginia | 37.271, -79.941 | 216.1, -36.1 | holdout | Siege of a walled town | mountains: a mountain homestead and its fields | nobody | inferred |
| 120 | **THE HONEY COMMUNE** | Floyd, Virginia (Blue Ridge plateau) | 36.911, -80.320 | 213.5, -32.8 | holdout | Cult compound | farmland: white-robed women, beehives, perfect fields | The Green Belt | inferred |
| 121 | **THE NAVAL TRADING POST** | Virginia Beach (Oceana), Virginia | 36.853, -75.978 | 242.7, -32.2 | holdout | Convoy escort | ocean: a tavern town beside the old naval air station | the Admiralty | stated |
| 122 | **THE MALL FORT** | Raleigh-Durham, North Carolina | 35.880, -78.790 | 223.7, -23.3 | holdout | Herd siege | urban: the biggest mall in the Carolinas, walled with its own parking decks | the Research Barons | stated |
| 123 | **THE TOWER HOTEL** | Charlotte, North Carolina | 35.227, -80.843 | 209.9, -17.2 | holdout | Slaver raid and rescue | urban: a 25-storey hotel holdout | the Research Barons | stated |
| 124 | **THE ADMIRAL'S YARD** | Kings Bay, Georgia | 30.798, -81.565 | 205.4, 20.8 (moved 1) | holdout | Sea and lake raid | swamp: a submarine yard, dry docks, a refitted fleet | The Federal Remnant | stated |
| 125 | **THE TIDE ISLANDS** | Georgia Sea Islands (St. Simons) | 31.150, -81.370 | 206.1, 20.9 | route | Sea and lake raid | island: tidal marsh, live oaks, ruined coastal towns | nobody | stated |
| 126 | **THE THRILL PARK** | the Everglades edge west of Miami, Florida | 25.760, -80.450 | 212.8, 68.9 | arena | Arena and blood sport | swamp: a rebuilt amusement park on the swamp edge | a local Keyholder family | inferred |
| 127 | **THE KEYS LAB** | Florida Keys (Marathon to Key West) | 24.714, -81.090 | off grid | lab | Sea and lake raid | island: broken keys, a missing highway, sulfur vents offshore | the Lab Kin | stated |
| 128 | **THE SULFUR PITS** | phosphate country near Mulberry, Florida | 27.896, -81.973 | 202.2, 49.9 | hazard | Hazard crossing | swamp: sulfur pits, geysers, sinkholes | failed-fix animals | inferred |
| 129 | **THE BRIGHT CITY** | San Juan and El Morro, Puerto Rico | 18.466, -66.106 | off grid | holdout | Bunker clearing | urban: a near-intact old city, a stone fortress on the point | the Lab Kin | stated |
| 130 | **THE BEAST INTERIOR** | Puerto Rico central mountains | 18.200, -66.500 | off grid | wilds | Creature swarm | jungle: jungle mountains, a station in the middle of the island | contested | stated |
| 131 | **THE NEUTRAL HARBOR** | Nevis, West Indies | 17.150, -62.580 | off grid | holdout | Sea and lake raid | island: a volcanic island harbor | the corsairs | stated |
| 132 | **THE ASH ISLAND** | Mount Pelee and Saint-Pierre, Martinique | 14.809, -61.165 | off grid | ruin | Hazard crossing | island: a black cinder island, a city killed by its volcano | nobody | stated |
| 133 | **THE SUNKEN ROAD** | the Bimini Road, Bahamas | 25.766, -79.278 | off grid | wilds | Creature swarm | ocean: shallow sea over a stone line, sharks and barracuda | nobody | stated |
| 134 | **THE ATOLL THRONE** | Majuro and the Marshall Islands | 7.090, 171.380 | off grid | holdout | Sea and lake raid | island: atolls, a bomb-test lagoon, a waterfall town on a cliff | the corsairs | stated |
| 135 | **THE DEEP STATION** | the Pacific seafloor about 1,600 km east of Hawaii | 20.500, -140.000 | off grid | station | Bunker clearing | ocean: a flooding undersea base | the continuity network | inferred |
| 136 | **THE QUAKE PORT** | Anchorage, Alaska | 61.218, -149.900 | off grid | station | Range war | arctic: a quake-broken port, a dam, an old missile site | the Pipeline Clans | stated |
| 137 | **THE STRAIT CROSSING** | the Bering Strait | 65.750, -168.750 | off grid | route | Cold survival | arctic: pack ice between two continents | nobody | stated |
| 138 | **THE ICE CAMP** | the Arctic coast (Utqiagvik), Alaska | 71.291, -156.789 | off grid | station | Cold survival | arctic: tundra, an ice-encased station | nobody | inferred |
| 139 | **THE FROZEN BASE** | Fairbanks and the far-north bases, Alaska | 64.838, -147.716 | off grid | arena | Arena and blood sport | arctic: a winter-ruined city, a long-abandoned base | a local Keyholder family | inferred |
| 140 | **THE NORTH MINE** | Yukon mountains (Dawson City), Canada | 64.060, -139.432 | off grid | holdout | Slaver raid and rescue | arctic: snowfields north of the border, a slave mine | the chain trade | inferred |
| 141 | **THE REACTOR CONVOY** | Trans-Canada Highway: Val-d'Or, CFB Borden, Thunder Bay | 48.097, -77.783 | off grid | route | Convoy escort | forest: northern forest highway, cold-war bunkers, a frozen lake | sutlers and haulers | stated |
| 142 | **THE ICE SHELF LAB** | McMurdo Sound, Ross Ice Shelf and the South Pole, Antarctica | -77.846, 166.676 | off grid | lab | Cold survival | arctic: sea ice, glacier cliffs, tunnels under the ice | the Lab Kin | stated |
| 143 | **THE DOMED ISLES** | New Zealand (Wellington) | -41.286, 174.776 | off grid | holdout | Siege of a walled town | island: twin islands under a failing shield | The Corporate Corridor | inferred |
| 144 | **THE SUN EMPIRE** | Japan (Tokyo region) | 35.676, 139.650 | off grid | holdout | Siege of a walled town | urban: an island empire with its own warrior law | the local ruler | inferred |
| 145 | **THE RED SUBURBS** | Moscow, Russia | 55.756, 37.617 | off grid | holdout | Siege of a walled town | urban: a destroyed center, prosperous patrolled suburbs, strontium snow | the local ruler | stated |
| 146 | **THE DRUID WEALD** | London and southern England | 51.507, -0.128 | off grid | holdout | Cult compound | forest: a sunken capital, a new town forty miles off, hollowed giant roots | the local ruler | stated |
| 147 | **THE NIGHT ISLES** | the Azores, North Atlantic | 37.741, -25.676 | off grid | holdout | Herd siege | island: two islands, a port, fishing fleets | failed-fix animals | inferred |
<!-- /atlas:sites -->

What each site is, in one or two lines:

<!-- atlas:site_lines -->
| Site | What it is in DSOA |
|---|---|
| THE BLUE CALDERA | A trial lab sealed under the island. The staff's grandchildren still run the tests, on whoever rows across. |
| THE SOUND UNDERCITY | The Guild holds the Needle; nobody holds what lives under the streets. |
| THE PAID HUNT | The land will not farm, so the Keyholder sells hunts. The quarry is whoever wanders in. |
| THE CASCADE GATE | The only fast way over the mountains, so it is the best place on the coast to stop a column. |
| THE FIELD OF THREE MILLION | The war dead went into the ground with their gear. Digging crews fight over the rows, pit by pit. |
| BADWATER FUEL | A town that pumps fuel out of a pre-Fracture tank farm. Everyone wants it and nobody can live there long. |
| THE EMPTY FORT | A deserters' fort. The gate stands open and the well still works. |
| THE SAND PALACE | A sun cult lives in the buried film city among plaster gods, and every newcomer is a convert or a servant. |
| THE HILL MANSION | A rich family's fort. They kept the zoo animals; some of them got out. |
| THE STRIP PIT | The House runs a fighting pit in a casino shell. Rulers settle quarrels here by proxy, and the House takes the bets. |
| THE ROCK HARBOR | Where the island ships take on water and sell what they caught. |
| SULFUR ISLAND | Sulfur means powder. Whoever holds the pits arms every gunsmith on the coast, so somebody always wants them. |
| THE ORANGE ISLE | Hot-ground clans with slings and black powder hold the groves and the cliff paths. |
| THE SEAWALL BREAK | The low basin took the sea in. At king tide the water reaches the freeway. |
| THE PINE SANCTUARY | Untouched country, and the people in it mean to keep it that way: strangers are an offering. |
| THE BLACK ROCK SEA | A dry lakebed that filled and stayed full. Crossing means a boat, and the islands are not empty. |
| THE SALT BREACH | A ring under the suburb misfired and something came through it. The Prophet calls it a judgment and fences it. |
| QUARANTINE BRIGHAM | Cholera inside, a cordon outside. The Remnant shoots anyone crossing either way. |
| THE BRINE PANS | The oasis gives water free. The water is drugged; you wake roped, robbed and sold. |
| THE RIM HOTEL | A rim lodge turned toll fort. The rail spur along the rim is the fastest way across and the easiest place to fall. |
| THE BONEYARD TOWN | Built against the aircraft boneyard. The Sun Court's bulls hunt parts thieves through the rows. |
| THE WHITE FLATS | A test range where the trial labs ran their time-and-ring work. The blockhouses still hum. |
| THE MESA VAULT | The old rumor of a base under the mesa was true. The deepest level never answered the stand-down. |
| THE SEIZED PUEBLO | An incomer drove the old families out and took their town. They are still in the hills, and they still raid. |
| FOUR CORNERS TOLL | Pay or fight. Most fight, once. |
| DURANGO GRADE | The mountain road north from the toll; every bend is a firing step. |
| THE PASS FORT | Whoever holds the pass holds the south road. Two armies trade it every spring; one of them fires gas shells. |
| THE CLIFF HOUSES | Cliff houses with one way up. Whoever holds the ladders holds the canyon. |
| THE DAM MAZE | Lab-made animals nest in the galleries. The village below keeps the doors shut and does not say why. |
| THE TWO TOWNS FEUD | Two rival trade towns share one road and an old feud. The meeting ground between them is an ambush site. |
| THE BORDER WAGON ROAD | Wagon trains hire guns for the river road. A sealed cold-sleep vault waits near the water. |
| THE CATTLE PASS | Rustlers wait for the drive to bunch in the pass. |
| THE CAVALRY POST | A mercenary company rides out of the old fort on horseback, in the uniforms of an army two centuries dead. |
| THE RANCH ROAD | A good ranch on a bad road. Bandits come every season. |
| THE TENT FIELD BUNKER | Everyone said there was something under the airport. There is: a clean enclave that helps nobody for free. |
| THE LIT CITY | It kept its power plant, so two leaders want it badly enough to arm their neighbors. |
| THE TWO-MILE TOWN | The highest town on the map: thin air, hard people, every newcomer watched. |
| SOUTH PARK POST | A high-basin trading street where the news of the mountains passes through. |
| THE EMPTIED CAMP | Bandits came through. The doors are still open. |
| THE SPRINGS DINER | Hot springs and one roadhouse. The welcome is warm until you look like money. |
| THE GOLD CAMP | A mining camp that never stopped mining. Every family is armed and every claim is disputed. |
| THE RESORT VALLEY | The town came through with its houses standing and its people dead. Two bosses war over the empty rooms. |
| THE PLAINS PESTHOLE | Its boss and the next town's boss have been at war since one burned the other's house. |
| THE ICE PARK | One of the first stations, lost to everyone but a forest militia that turns back anyone looking for it. |
| THE BURNED JUNCTION | Burned flat in a convoy battle; the black hulls of armored rigs still sit in the main street. |
| THE MAP VALLEY | A hidden valley behind the front range: a sealed stockpile, and a meadow of burrowers between you and it. |
| THE FALLEN STAR | Wreckage from orbit lies across the lava plain. The Preppers' bulls race scavengers for every piece. |
| THE SLAG CAMPS | Contractors in powered armor took the town and put it to work in the mines. Their shields stop rifles; their suits do not stop fire. |
| THE FACE VAULT | A vault behind the faces holds what the old government left. The Stone Kings carve new faces on the outside. |
| THE WALL | Raider country of walls and buttes; herds drift through on the wind. |
| THE TRENCH TOWN | A ring fault makes the land shift. A Remnant line is dug in across it and the trenches move with the ground. |
| THE ASH CITY | It is always night here. A church hierarchy rules the lit blocks; things hunt the dark ones. |
| THE TOWER LINE | Broadcast towers along the line. The Church guards them, and the trains that keep them supplied. |
| THE PALACE IN THE TREES | The richest family in the middle of the country lives walled in the hardwoods. Guests rarely leave. |
| THE SPLIT TOWN | A grain town split down the main street by two claimants. A herd is coming and both sides are hiring. |
| THE VINE CITY | The vines hold spore pods. People who sleep under them get up again with the vines in them. |
| THE GALLOWS TOWN | A self-made judge runs the town from the courthouse and the gallows is busy. Outside, a thorn thicket nobody crosses. |
| THE HEAVING FIELDS | Armored burrowers come up under you. |
| THE PUMPJACK CITY | Built to pull workers to the wells. The founder is dead and three men want his chair. |
| THE PUMP STATION | Whoever holds the pump holds the town. |
| SONORA SHOWDOWN | A dead courthouse town in the hills, every window a firing position. |
| THE BURNING SHORE | Bike raiders work the coast road at night; boats from the south land where the wrecks are. |
| THE REFINERY WHARF | The last safe port before the hot zone. Sea traders sign on guns here. |
| THE LONG BARRIER | Fortified outposts strung down the island. A pirate fleet has been taking them one by one. |
| THE RIVER-MOUTH POST | Burned by the pirate fleet on its way north. Abroad: off the mainland grid. |
| THE SINKING VALLEY | A half-flooded megacity in a quaking valley; lords of the dry districts war for the rest. Abroad. |
| THE LIT HARBOR | A harbor city with working electric light, home port of the Gulf corsairs. Abroad. |
| THE SILENT SUBURB | Every house stands and nobody lives in them. Somebody shoots from the roofs. |
| THE GREAT SWAMP | Cypress and open water; boats are the only road. |
| THE CURSED ESTUARY | An estuary barony on stilts at the edge of the Gulf: storms, boats, and something big under the bay. |
| THE BOAT CITY | The Krewe rules from the masked boats. A station sits in the old ground under the levee. |
| THE IRONCLAD YARD | River towns at war over iron. Whoever floats the most steel owns the river. |
| THE BLUFF THRONE | A ruling house in the ruins on the bluffs. |
| THE BATTLEFIELD LANDING | A river landing beside the old battlefield. The woods behind it hold labor camps. |
| THE FORKS | Riverboat gambling and river trade. The house always wins and the river keeps the losers. |
| THE ARCH FERRY | Two districts under the twin barons with the Arch between them. Flying swarms nest in the river ruins. |
| THE NEW LANDING | The river traders moved downstream and built new. It is the busiest landing on the river. |
| THE DUST MARKET | Booze, pills and scrip behind a wall, rich enough that everyone wants to take it. |
| THE OPRY CIRCUS | Music halls out front, a mine out back, and nobody asks who works it. |
| THE HEALING SPRING | A spring that is supposed to make you young. Pilgrims arrive; fewer leave. |
| THE PLAGUE LIE | A hollow town that keeps its people by fear of the fever. The gate opens one way. |
| THE SINKHOLE FARMS | Cave dwellers come up out of the old mine to raid the farms. |
| THE BASEMENT CITY | People who go into the tunnels after dark do not come out. The Crown knows who lives down there. |
| THE MOTOR STREETS | Crews hold the avenues and the police are one more crew. The flooded tunnels under the city are worse. |
| THE LAKEFRONT WALL | Raiders with gills come out of the lake by night and go for the wall. |
| THE REACTOR SHORE | Hot ground. The gill raiders nest in the warm outflow. |
| THE SURGEON TEMPLE | The last medicine, rationed as a sacrament. Archer bands fight in the woods around it. |
| THE DEALING TREE CROSSING | A river crossing that pays tribute to whoever owns the sky this year. |
| THE REFORMATORY | The warden's family still rules; the guards' grandchildren still guard; everyone else is an inmate by birth. |
| THE GENIUS'S TOWN | A clean town with labs under the square. Guests are watched. |
| THE WAGON SALOON | A traveling saloon on wheels that sells guns out the back. |
| THE OUTSIDERS' CAMP | A dead town a few hours from a camp of people nobody lets in. |
| THE RANGE WAR VALLEY | Cattle barons against hill shepherds, with artillery. |
| THE TALLY PRISON | A prison that became a society. Rank is a tally of violent acts; you climb it in the cage. |
| THE HARBOR INSTITUTES | Three sealed private institutes on the hill. At least one is still running. |
| THE LONGHOUSE SHORE | Boat clans who live by the oar and the axe, raiding along the lake. |
| THE ISLAND THAT LIES | Its lord keeps the ferry broken on purpose. Machines guard a vault in a hulked ship. |
| THE WRECK FLEET | Lake raiders based in a sunken freighter; a festival town on the shore; storms. |
| THE ISLAND OF GANGS | Teen crews hold the avenues; the Council holds the bridges. A station hides under a mansion. |
| THE RIVER RUN SOUTH | Hill clans in the Catskills eat travelers. The river is safer, which is not saying much. |
| THE STOCKTON CROSSING | Cross the Delaware, then the long interstate run west past dead Harrisburg. The Toll-Lords own both. |
| THE CAPITOL RUINS | You pass it. Everyone passes it. Somebody always stops. |
| THE FALLS FARM | A farm that deals in people. The falls power the lights. |
| THE LAKE SHORE HOLDOUT | A small lake holdout with a closed council. The tourist ghost town down the road is a good place to be ambushed. |
| THE GRANITE HIGHLANDS | Hunting rights are settled with rifles, and a militia with a few old tanks enforces them. The lava fields belong to cannibals. |
| THE ISLAND PARK STATIONS | Two stations under the park. One holds a cold-sleep and gene lab that still runs. |
| THE WHALING HARBOR | A granite whaling harbor: proud, closed, quick to hang. |
| THE SLAVERS' HARBOR | A cold harbor that trades with slavers and does not ask questions. |
| THE PINE STATE | A cult town in the pines, and the breakaways who fight it from the trees. |
| THE CRAB SHORE | The beach moves. Do not sleep on it. |
| THE CRATER | The hardest-hit place in the country. Under it, an orderly society keeps the old forms. |
| THE FIVE-SIDED PIT | One of the first targets. The Carousel prize everyone talks about is somewhere under it. |
| THE MORGUE HARBOR | Every block is someone's. Cross it split up and you will each have your own bad night. |
| THE NORTH VALLEY SEAT | A walled valley barony that has changed hands by murder more than once. |
| THE SEABOARD NATION | The scarred stopped hiding and founded a nation of their own. Every holdout on the coast is choosing a side. |
| THE KITE-BURNED HAMLETS | Burned from the air. The raiders here fly kites big enough to lift a man and a firebomb. |
| THE LISTENING DISH | A town grew up around the dish. The Church thinks the dish hears the voice in the static, and it may be right. |
| THE LURE TOWN | A sealed, rich-looking mountain town that sends out word of trade. Few convoys leave. |
| THE HIGH HOMESTEAD | Somewhere to finally stop. Then an organized slaving army of the scarred comes up the road. |
| THE HONEY COMMUNE | It is too kind. The honey does something; the men who stay do not leave. |
| THE NAVAL TRADING POST | Where convoys hire on for the run inland. |
| THE MALL FORT | A trading post in a mall, until the infected came in through the loading docks. |
| THE TOWER HOTEL | An eastern baron's seat, floor by floor, worked by captives. Fight up the stairs or drop in from the roof. |
| THE ADMIRAL'S YARD | A submarine yard refitted by a self-made navy. |
| THE TIDE ISLANDS | The way north by water up the coast. |
| THE THRILL PARK | A rebuilt amusement park whose rides are death traps. |
| THE KEYS LAB | A sea-research lab built in an old missile base. |
| THE SULFUR PITS | Tooth and claw country in the middle of the peninsula. The ground is the first enemy. |
| THE BRIGHT CITY | A near-intact old city around a stone fortress. Off the mainland grid. |
| THE BEAST INTERIOR | Jungle mountains full of lab animals, among them the spined gliders of island folklore. Off the mainland grid. |
| THE NEUTRAL HARBOR | The one port where every pirate crew drinks together and nobody draws. Abroad. |
| THE ASH ISLAND | Abroad. |
| THE SUNKEN ROAD | Wade it and the water fights you. Abroad. |
| THE ATOLL THRONE | An island king's armada and a bomb-test lagoon. Abroad. |
| THE DEEP STATION | The base's machine keeps its crew alive by turning them into its soldiers. |
| THE QUAKE PORT | A quake-broken port with a station under it; raiders cross the strait to get at it. Off the mainland grid. |
| THE STRAIT CROSSING | The only road from the other side. |
| THE ICE CAMP | An ice-locked station on the Arctic coast. The cold is the enemy. Off the mainland grid. |
| THE FROZEN BASE | A long-abandoned northern base where crews settle things in a ring. Off the mainland grid. |
| THE NORTH MINE | A slave mine in the snowfields north of the border. Abroad. |
| THE REACTOR CONVOY | A long convoy west on the northern highway, hunted the whole way. Abroad. |
| THE ICE SHELF LAB | A lab under the ice; giant flightless birds hunt the shelf. Abroad. |
| THE DOMED ISLES | An enclave that kept the old life under a shield, until the shield started to fail. Abroad. |
| THE SUN EMPIRE | Abroad. |
| THE RED SUBURBS | Further along than the Divided States: lights, water, patrols. Abroad. |
| THE DRUID WEALD | Feudal barons again, a community under druid law, a theater that still plays. Abroad. |
| THE NIGHT ISLES | Day rulers and night rulers. At night the half-giants who drink blood come down; we play them as Howlers. Abroad. |
<!-- /atlas:site_lines -->

### 3.3 (b) The cast

Archetypes for the whole ensemble: the crew (as CREW CARDS, one signature item and one flaw, bible §3.2), recurring
allies, rulers, villains, creature kinds and minor parts. Kit uses engine ids where the thing exists (`gun`: the four
WEAPONS rows in `systems/combat.js`; `throw`: `systems/throwables.js`; `veh`: `systems/vehicles.js`) and *italics* for
kit the engine does not have yet. "Moves / Cover / Retreat / Ammo" is how they behave in a fight; today's `ai.js` gives
every armed character wander, flee and fight with a grenade lob over cover, so most of these columns are the spec for
behaviour that does not exist yet (§3.4).

Creature kinds use canon first (infected: Shamblers, Sprinters, Echoes, Choir-Touched, Criers; animals: Howlers,
Rooters, Tone dogs, Showcats). Six are new proposals (Gutterwings, Sinkers, Creeper hosts, Gill raiders, Carrion kites,
Spike crabs) and need Robert's yes before they become rows anywhere else.

<!-- atlas:cast -->
| Archetype | Group | Role in our world | Kit (engine ids; *new* = not built) | Moves | Cover | Retreat | Ammo | Faction |
|---|---|---|---|---|---|---|---|---|
| **the Wheel Boss** | crew | One-eyed crew leader, an ex-convoy outrider who learned everything on the road. Signature: a long scoped rifle. Flaw: answers every insult in person. | gun rifle, gun pistol, throw frag, veh pickup, *scoped long rifle*, *machete* | leads from the front, short bounds, always on the high side of the road | hard cover only; never a car door | last out, covering the others | counts every round aloud; aimed fire only | Drifters |
| **the Static-Ear** | crew | A survivor of the Echo trial who hears trouble before it comes. Signature: the warning. Flaw: Choir sites knock her flat. | gun pistol, throw smoke, *bow* | mid-file, stops dead when the static rises | low cover, keeps eyes on the crew | calls it early and is usually right | thrifty; the bow first | Drifters |
| **the Quartermaster** | crew | Small, careful armorer and demolitions hand. Signature: charges for every door. Flaw: will not leave a gun behind. | gun smg, gun shotgun, throw pipe, throw sticky, throw frag, *satchel charge*, *tripwire kit* | flanks while the others fix the enemy | uses the charge as the cover: blows a wall and goes through | mines the way back | short bursts; carries the crew's spare magazines | Drifters |
| **the Marsh Kid** | crew | A swamp-raised teen tracker who barely talks. Signature: a short spear and a fish knife. Flaw: hates engines and towns. | gun pistol, throw rock, *short spear*, *climbing* | scouts ahead off the road, climbs, comes in from behind | concealment, not cover: never where he was | vanishes; turns up later | steel first, the pistol only when it has to be loud | Drifters |
| **the Sleeper** | crew | A trial-ward nurse woken from a Calm Protocol pod a lifetime late. Signature: the suture kit and a marksman's eye. Flaw: will stop to treat anyone. | gun rifle, *field surgery* | stays back with the wounded | picks a firing position and holds it | drags a casualty with her | single aimed shots, never a spare round spent | Drifters |
| **the Thrown Man** | crew | A misjump victim from the years before the Fracture, half lost in time. Signature: reads station panels nobody else can. Flaw: drifts away mid-fight. | gun shotgun, *coach gun*, *jump-code notebook* | erratic: stands in the open, then does something brilliant | forgets it | has to be fetched | both barrels at once | Drifters |
| **the Prospect** | crew | The leader's half-grown son, learning the road. Signature: a sling and a borrowed pistol. Flaw: the brave, stupid thing. | gun pistol, throw rock, *sling* | runs to where the fight is | copies whoever he admires | only when ordered twice | empties the magazine | Drifters |
| **the Scrap Smith** | crew | An island kid apprenticed to an armorer; builds guns from junk. Signature: clears any jam. Flaw: talks while he works. | gun smg, *field gunsmithing* | second rank | behind the vehicle | with the gear | reloads others first | Drifters |
| **the Old Man of the Road** | ally | A legendary convoy boss everyone thought dead; taught half the crew. Pays for loyalty, never fights fair. | gun rifle, veh rig, veh apc, *belt-fed gun on a rig* | never on foot if a rig will do | armor plate and a second rig | abandons cargo, never people | unlimited at the rig, rationed on foot | sutlers and haulers |
| **Flank Riders** | ally | Convoy guards on bikes and buggies, paid by the mile (FLANK PAY). | gun smg, gun shotgun, veh bike, veh buggy | weave along the column, peel off to chase | speed | back to the column | burst and move | sutlers and haulers |
| **the Healer-Scout** | ally | A nation healer and tracker who guides strangers through country they do not understand. | gun rifle, *bow*, *herbal kit* | ahead, off trail | ground and brush | into country only he knows | few shots, all counted | The Free Counties |
| **the River Skipper** | ally | Captain of a river tug with a boat gun lashed to the bow; married to her engineer. | gun shotgun, veh gunboat, *anti-armor rifle on a mount* | keeps the boat moving | the wheelhouse steel | into backwater the gunboats cannot follow | saves the big gun for armor | sutlers and haulers |
| **the Salt Hauler** | ally | A savage, famous sea trader; carries guns south and secrets north. | gun shotgun, gun pistol, *boarding cutlass*, *deck gun* | boards first | the bulwark | cuts the lines and runs | one volley, then steel | sutlers and haulers |
| **the Star-Chaser** | ally | One of a society of night-sky watchers who follow falling wreckage and old signals. | gun pistol, *radio direction finder* | toward the signal | poor | with the data | barely armed | nobody |
| **the Keyholder** | ruler | A holdout ruler with one odd law that everyone must keep (HOUSE RULES). | gun pistol, veh interceptor | stays inside the walls | his bulls | to the keep, then the bolt-hole | he never fires; his gatemen do | a local Keyholder family |
| **the Gallows Clerk** | ruler | A self-made judge who hangs at will, with marshals who fight with knives. | gun pistol, *gallows*, *court of law* | holds court | the courthouse | never; he believes the law protects him | none personally | a local Keyholder family |
| **the Ride Boss** | ruler | A showman engineer who rebuilt an amusement park and runs it as a killing machine. | gun smg, *rigged rides*, *park control room* | from the control room | machinery | into the service tunnels | lets the rides do it | a local Keyholder family |
| **the Hunt Seller** | ruler | A ruler of barren land who sells hunts on people to rich visitors. | gun rifle, *hunting dogs*, *hunt lodge* | watches from the lodge | paying guests | his own town turns on him | his guests' ammo | a local Keyholder family |
| **the Spring Preacher** | ruler | A holy-water seller whose town murders the pilgrims who come for it. | gun shotgun, *poisoned welcome* | welcomes | his believers | too late | the town's | a local Keyholder family |
| **the Dreaming Heir** | ruler | A child ruler with visions, kept on the throne by the men who interpret them. | *visions* | carried | his regents | his regents decide | none | a local Keyholder family |
| **the Lighthouse Liar** | ruler | An island lord who keeps the ferry broken so nobody leaves. | gun rifle, *repeating crossbow guards*, *law book* | from the hall | the law | to the vault in the hulk | his guards use crossbows to save powder | a local Keyholder family |
| **the Rail General** | ruler | A warlord rebuilding his idea of the country with press-ganged track crews and an armored train. | gun rifle, gun smg, *armored train*, *press gang* | never leaves the train | armor | reverses the train | plenty: the train is an arsenal | The Federal Remnant |
| **the Draft Lord** | ruler | A warlord who drafts every town he takes and shells his enemies with gas. | gun rifle, *gas shells*, *conscript army* | behind his line | conscripts | shoots deserters, then runs | conscripts get five rounds | contested |
| **the Brand Council** | ruler | Cattle barons sworn together, with a general and field guns. | gun rifle, gun pistol, *field guns*, *horses* | mounted | ranch walls and barbed wire | to the home ranch | well supplied | The Free Counties |
| **the Pill Keyholder** | ruler | A ruler whose chemists make medicine and also the drug he really sells. | gun smg, *drug lab* | stays near the lab | the lab is the hostage | burns the lab | buys it | a local Keyholder family |
| **the Mayor of Nothing** | ruler | A city mayor with a heavily armed police force, hiring outsiders to break a gang he cannot. | gun smg, gun rifle, veh interceptor, veh patrol | never on the street | city hall | sells out his hired help | police armory | a local Keyholder family |
| **the Lantern Sheriff** | ruler | A sheriff who sends out word of rich trade to lure convoys into his sealed town, then kills them. | gun pistol, *war hounds* | welcomes the convoy in | the town | escapes with his hounds | the convoy's | a local Keyholder family |
| **the Warden's Line** | ruler | Descendants of a prison warden still running the prison as a kingdom. | gun shotgun, gun rifle, *cell blocks* | tower and catwalk | walls and bars | locks down | the old armory | a local Keyholder family |
| **the Lake Seer** | ruler | A mystic who rules a lakeshore through her sworn followers. | gun pistol, veh gunboat, *sworn followers* | stays on the water | followers | onto the lake | her followers' | the corsairs |
| **the Mother of the Rows** | ruler | The matriarch of a sheltered farm commune that believes the earth itself guards it. | *the commune* | does not fight | the commune | never | none | The Green Belt |
| **the Dry-Dock Admiral** | ruler | A self-appointed admiral refitting a naval yard into a fleet. | gun rifle, veh gunboat, *deck guns*, *patrol boats* | from the bridge | steel hulls | to sea | naval stores | The Federal Remnant |
| **the Co-Regents** | ruler | Two domineering women ruling one town, each scheming to dig up the cache under it first. | gun pistol, gun smg | through others | each other's enemies | into an alliance with you, briefly | enough | a local Keyholder family |
| **the Patchwork Director** | villain | A man rebuilt by a Carousel medical annex, more machine every year. Fields bred beasts instead of fighting. | *bred shock beasts*, *implants* | appears where you are not looking | his creations | always escapes once (one record per grudge, bible §3.5 row 1) | none; he does not shoot | the continuity network |
| **the Recovery Agent** | villain | A half-machine agent of the old continuity network sent to collect one particular time-thrown man. | gun rifle, *tracking*, *armor plating* | direct, relentless | its plating | only when broken | precise | the continuity network |
| **the Hired Colonel** | villain | A cruel mercenary captain whose company holds an old fort. | gun rifle, gun pistol, veh patrol, *cavalry* | commands from a horse | his company | leaves the company to die | paid in rounds | contested |
| **the Usurper** | villain | Whoever took the holdout's seat by murder and now has to keep it. | gun pistol | from the hall | bulls | to the tower | his bulls' | a local Keyholder family |
| **the Coat Clans** | villain | Inbred descendants of trial-lab staff, still testing, still sure they are right. | gun smg, *gas*, *security machines*, *bioweapons* | stay in the lab | blast doors | seal the level | what the lab stored | the Lab Kin |
| **the Herd Shepherd** | villain | A trial survivor who can steer the infected; walks with a herd like a dog walks with sheep. | *herd control* | inside the herd | the herd | the herd closes behind | none needed | the infected |
| **the Gulf Corsairs** | villain | A pirate fleet and theocracy from the south: lamps, blood rites, galley slaves. | gun shotgun, gun smg, veh gunboat, *boarding parties*, *cannon* | land at night from boats | darkness and smoke | back to the boats with captives | one volley then cutlasses | the corsairs |
| **Lake Raiders** | villain | Freshwater pirates working the lakes from a sunken freighter. | gun shotgun, gun rifle, veh gunboat, veh jetski | fast boats, hit and run | wrecks | into fog | short | the corsairs |
| **the Hungry Warlord** | villain | A scarred, charismatic conqueror who takes an island or a province town by town and sells the leftovers. | gun rifle, veh pickup, *army* | with his army | numbers | into a vault, where something worse waits | plenty | contested |
| **the Chain Buyers** | villain | Slavers: buyers, breeders, press gangs. | gun shotgun, gun smg, veh van, veh pickup, *nets*, *drugged water* | take the weak and run | captives as shields | sell and leave | they avoid firefights | the chain trade |
| **the Pit Clans** | villain | Cannibal clans in hills, lava fields and mines. | gun shotgun, *spears*, *pit traps*, *cleavers* | encircle at night | terrain | underground | almost none: steel and traps | nobody |
| **the Static Preacher** | villain | A Broadcast Church preacher who reads the voice in the static as scripture. | gun pistol, *radio tower*, *sonic staff* | stays by the tower | the congregation | the tower is his last stand | his congregation's | The Broadcast Church |
| **the Young Tide** | villain | A youth cult that kills everyone over twenty-one. | gun pistol, gun smg | swarming | numbers | never as a group | wasteful | The Broadcast Church |
| **the Duster** | villain | A skip tracer in a sun-faded duster, hired by grudge-holders, who waits at the place you must go. | gun pistol, gun rifle, *quickdraw duel* | chooses the ground in advance | shade and glare | never mid-duel | one shot, maybe two | nobody |
| **the Clean Men** | villain | Corporate contractors in powered armor and riot shields who take towns as work camps. | gun rifle, veh apc, *powered armor*, *riot shields* | slow, in line | shields | by the book | contracted | The Corporate Corridor |
| **the Deserter with the Last Good Gun** | villain | A deserter who set up as a warlord because he owns the only weapon of its kind. | *one exotic weapon* | lets you come to him | the gun's reputation | if the gun is taken | precious | nobody |
| **the Drowned Crew** | villain | Grandchildren of a stranded submarine crew, still keeping a navy's ranks on a cold coast. | gun rifle, gun smg, *boats* | by sea | drill | in good order | well stocked | the corsairs |
| **the Caretaker** | villain | A base machine that keeps its people alive by making them into its soldiers. | *converted soldiers*, *base controls* | never; it is the base | the base | floods the level | none | the continuity network |
| **Bulls and Gatemen** | villain | A ruler's muscle at the gate and on the walk. | gun shotgun, gun smg | hold posts, patrol in pairs | gate posts and sandbags | to the next post | issued, counted | a local Keyholder family |
| **Speed Crews** | villain | Crimson Road bikers, buggy gangs and snow-machine raiders who worship going fast. | gun smg, gun shotgun, throw molotov, veh bike, veh buggy, veh atv | circle and strike | speed | when outrun (outrunning them earns standing) | sprays | The Crimson Road |
| **the Road Saint** | villain | A vigilante in a fast loud car who burns road gangs, and anyone near them, with fire bombs. | gun smg, throw molotov, veh interceptor, *fire bombs* | drives at you | his car | to his fortress | too much fire | The Crimson Road |
| **the Barnstormer** | villain | An air raider in a rebuilt biplane, dive-bombing towns for tribute. | *biplane*, *dropped bombs* | dives, climbs away | altitude | to the airstrip | one bomb load per sortie | nobody |
| **the Diggers** | villain | Grave-robber crews with shovels and shotguns who fight over the rows. | gun shotgun, *shovels*, *dynamite* | hold their pits | spoil heaps | into the rows | what they dug up | contested |
| **Shamblers and Sprinters** | creature | The infected (canon). Herds that pour onto towns and stalled columns. | *claws*, *latching onto cars* | drift to noise; sprinters run | none | never | none | the infected |
| **Choir-Touched and Criers** | creature | Canon. Amplifiers at Carousel sites; criers bawl alarm tones and gather herds. | *the call* | stand still and call | the herd | never | none | the infected |
| **Howlers** | creature | Canon. They own the night; our answer to blood-drinking night giants on far islands. | *pack hunting*, *night* | circle, scream, charge | dark | from headlights and fire | none | failed-fix animals |
| **Rooters** | creature | Canon gene-edited feral hogs; here also the rat-hog warrens with a giant queen, and meadows of burrowers that eat a man alive. | *tusks*, *warrens* | burst out of the ground | burrows | down | none | failed-fix animals |
| **Showcats and zoo escapes** | creature | Canon roadside-zoo tigers; here also armored cats, six-legged mountain cats and river crocodiles from the same zoos. | *pounce* | stalk and leap | brush | when burned | none | failed-fix animals |
| **Tone dogs** | creature | Canon police-dog program dogs that answer machine tones; here also war hounds and stinger-tailed pack dogs. | *pack*, *tracking* | flank in pairs | none | on the tone | none | failed-fix animals |
| **Gutterwings** | creature | Proposed: swarming scaled flyers drawn by noise and blood; a preacher with a whistle-staff can call them. | *swarm flight* | over walls, from above | none | from fire and smoke | none | failed-fix animals |
| **Sinkers** | creature | Proposed: big burrowers (armored insects, sand-worms, cave centipedes) that come up under you. | *burrow ambush* | under the surface; feel for footsteps | the ground | down | none | failed-fix animals |
| **Creeper hosts** | creature | Proposed: a vine that takes over sleepers; one giant plant at the root of it. | *spore pods*, *grabbing tendrils* | slow; the vine is fast | growth | never | none | failed-fix animals |
| **Gill raiders** | creature | Proposed: lab-made lake and sea folk with needle teeth who raid shores at night. | *spears*, *water ambush* | from the water | the water | into the water | none | failed-fix animals |
| **Carrion kites** | creature | Proposed: giant birds (thunderhead eagles, ice-shelf flightless hunters, buzzards) that take prey and tear metal. | *dive*, *carry off* | dive from height | sky | after one strike | none | failed-fix animals |
| **Spike crabs** | creature | Proposed: spike-shelled shore crabs by the thousand. | *swarm* | tide-borne swarm | sand | with the tide | none | failed-fix animals |
| **Hot-ground clans** | minor | People scarred by dose who live where nobody else can; slings, black powder and spears. | *sling*, *black-powder musket*, *spear* | from groves and cliff paths | terrain | to ground nobody follows them onto | one shot then close in | nobody |
| **Low-water clans** | minor | Swamp folk with flat boats, drums and old feuds. | gun shotgun, veh airboat, *fish spears* | by boat and boardwalk | cypress | into channels | short | nobody |
| **Dart folk** | minor | Hill raiders who spit poison darts from cover. | *blowpipe darts* | hide by the road | rocks | uphill | darts | nobody |
| **the Kin** | minor | Inbred holdouts pressed into fights they cannot win. | gun shotgun, *clubs* | mass rush | none | break and scatter | little | nobody |
| **the Seer** | minor | A fortune-teller every town has; sometimes right. | *warnings* | hides | anyone | first | none | nobody |
| **the Barkeep** | minor | Sells drinks and sells you. | gun shotgun | behind the bar | the bar | out the back | two shells | a local Keyholder family |
| **the Crooked Storekeep** | minor | A trading-post owner who sells to both sides. | gun pistol | stays in the store | the counter | trapdoor | little | sutlers and haulers |
| **the Hangman** | minor | Works the gallows; knows every way out of the jail. | *rope* | none | none | none | none | a local Keyholder family |
| **the Wagon Master** | minor | Runs a wagon train and hires guns for food and water. | gun rifle, *wagons*, *horses* | circles the wagons | wagons | cuts loose the slow ones | pooled | sutlers and haulers |
| **the Moonshiner Guide** | minor | Knows the back ways; drinks the profit. | gun shotgun | ahead, then gone | woods | home | two shells | nobody |
| **the Carnival Caravan** | minor | Traveling show folk and their wagons, caught between feuding rulers. | *knives*, *wagons* | with the wagons | wagons | pack up and go | none | sutlers and haulers |
| **the Old Storyteller** | minor | Knows the legends of the canyon, the lake, the vault. | *lore* | sits | none | none | none | nobody |
| **the Farm Daughter** | minor | A local who knows the ground and needs one thing fixed. | gun shotgun | guides | fences | home | birdshot | The Free Counties |
| **the Scavenger Band** | minor | A ragged crew who know the ruins and will help for a share. | gun pistol, *crowbars* | through the ruins | rubble | scatter | scrounged | nobody |
<!-- /atlas:cast -->

### 3.4 (c) Combat situations

The fights the series kept staging, as shapes we can build. "Sites" counts the atlas rows whose dominant fight it is.

<!-- atlas:situations -->
| Situation | The shape | Sites | What our engine already does | What is missing |
|---|---|---|---|---|
| **Road ambush** (`road_ambush`) | a blocked road, shooters on the high side, a second group closing the way back | 9 | convoy.js war convoys break formation and hunt; garage.js caltrops and oil; carcombat.js shooting from windows, grabbing on, dragging out; throwables.js smoke and frags | a roadblock placement (felled tree, cable, burning wreck); ambushers who wait hidden until a trigger line; the dog warning before contact (THE QUIET) |
| **Convoy escort** (`convoy_run`) | ride guard on a slow column for pay per mile; raiders probe the flanks; the column must not stop | 6 | convoy.js formations, outriders, a cargo hauler that spills when killed; seats.js riders in beds and hatches | a FRIENDLY convoy you join (FLANK PAY); a column that follows a route across streamed chunks; pay per mile and the code you can break |
| **Siege of a walled town** (`town_siege`) | a wall, a gate, defenders on the walk; attackers probe, then mass at one place | 20 | bases.js fence, gate, towers, searchlights, the trespass rule; factionsim.js off-screen raids and towns changing hands; the infected system holds herds at a wall | an on-screen assault wave (ladders, a ram truck, fire arrows); defenders who man the walk and fall back to a keep; breach points that stay broken |
| **Bunker clearing** (`bunker_clear`) | a sealed vault or Carousel Station, room by room: locked doors, dead power, something still awake inside | 13 | interiors.js doors, locks, kicks, lockpicks; storeys.js floors and stairs; ring.js the Carousel ring platform; bases.js locked armory | an underground level type (no roof, artificial light, generator); security machines and turrets; blast doors on a code (the 1-in-12 dud stock of COLD DEPOTS) |
| **River fight** (`river_war`) | boats on a channel or a big river: gunboats, a ferry, a crossing under fire | 5 | vehicles.js AIRBOAT, WATERBIKE, RAIDER GUNBOAT; water.js swimming | armored river craft (an ironclad, a tug with a boat gun); current that carries a drifting boat; a ferry or raft you can stand on |
| **Sea and lake raid** (`sea_boarding`) | raiders come off the water at a harbor; ship-to-ship fire; a storm makes it worse | 15 | vehicles.js RAIDER GUNBOAT; water.js swimming and drowning | open-water swell and a storm state; boarding (walk from one deck to another); a harbor kit (piers, cranes, hulks) |
| **Creature swarm** (`swarm`) | many small fast animals, or a few huge ones, drawn by noise or blood; the answer is fire, height or a car | 6 | the infected system: noise-driven swarming and car latching; throwables.js fire that spreads | animal rows (flyers, burrowers, pack hunters, a nest queen); burrow ambush (comes up under you); flyers that ignore walls |
| **Herd siege** (`herd`) | the infected pour onto a holdout or a stalled column; the fight is about holding a line and not making noise | 4 | the infected system: shamblers, sprinters, echoes, Choir-Touched, night hordes; THE PULL noise rules (bible §3.2) | herd trails that persist on the atlas; a defensible-line tool (barricade kit) |
| **Gunslinger or sniper duel** (`sniper_duel`) | one shooter waits at a known place; the player chooses the angle, the time and the light | 2 | combat.js rifle range 68 m, spread; sky.js night and fog | a scoped long gun with a zoomed view; a named duellist who waits, shifts position and never panics; glint and sound tells |
| **Arena and blood sport** (`arena`) | you are made to fight for an audience: a pit, a cage, a ring of wrecks, rules that change | 4 | stunts.js the Thrill Show and its witnesses; combat.js and throwables.js | a closed arena placement with a crowd that bets; loadout taken at the gate, a weapon thrown in; rounds and a ruler who changes the rules |
| **Manhunt** (`manhunt`) | you are the quarry: hunters with dogs and a head start, open country, a boundary you must reach | 2 | director.js squads that arrive out of sight; witnesses.js and deeds.js word that travels; bases.js searchlights and spot ranges | tracking (hunters follow your trail, not your position); hunting dogs; a declared boundary and timer |
| **Slaver raid and rescue** (`slaver_raid`) | free the penned and get them out alive; the slavers fight dirty and sell what they cannot hold | 7 | residents.js people with homes and schedules; seats.js and vehicles to carry them; bases.js fenced compounds | captives that follow you and can be hurt; shackles and a pen kit; a sale clock: wait too long and they are gone |
| **Cult compound** (`cult_compound`) | a town that looks kind; the trap is the law inside; you fight your way out of a sermon | 9 | talk.js conversations; society.js laws and deeds; HOUSE RULES (bible §3.2) | a congregation that turns all at once; drugged food and water; a believer you can turn |
| **Armored train** (`armored_train`) | a moving fortress on rails: climb aboard, fight car to car, or derail it | 2 | train.js the Iron Line freight: boardable roofs, a tanker that blows, crossings | armored cars with turrets and loopholes; a crew that fights from the train; points and derailment |
| **Air raid** (`air_raid`) | something flies over the town and drops fire; the town has no answer until you give it one | 2 | throwables.js fire and blast; fx.js and audio.js | an aircraft actor (biplane, man-lifting kite, drone); ground fire against it; a landing strip to find |
| **Hazard crossing** (`storm_crossing`) | cross bad ground or bad weather: a refinery smoke front, hot ground, a sand wall, a flood | 4 | sky.js weather and the dust wall; survival.js wear; surfaces.js | HOT GROUND dose (bible §3.2); smoke fronts that move; shelter you must reach |
| **Range war** (`range_war`) | two armies over grass, water or a pass, with artillery; you pick a side or sell to both | 8 | factionsim.js wars between factions; deeds.js standing on both sides | artillery (indirect fire, ranging shots); trenches and front lines; mounted riders |
| **Urban gang war** (`gang_war`) | blocks held by crews; crossing the street is the fight; everyone hires you | 6 | world/ring.js the dead city; residents.js; factions.js | turf lines that move; crews that set up in buildings (storeys) and hold windows |
| **Prison break** (`prison`) | you start inside: gear gone, guards on a clock, a way out to find | 4 | inventory.js take and return gear; interiors.js locks and doors; bases.js guards | a cell block kit; a start-captured state (gear held in a lockup); guards with routines you can learn |
| **Tunnel fight** (`tunnel_fight`) | under a city or a mine: narrow, dark, things that live there and know it | 3 | storeys.js floors; sky.js light | underground streets and sewers; carried light (torch, lamp) as the only light; enemies that come from side passages |
| **Cold survival** (`cold_survival`) | snow, ice, a frozen lake: the cold fights you while people do | 3 | survival.js wear (temperature) | snow and ice surfaces; ice that breaks under weight; snow machines |
| **Trap town** (`trap_town`) | a welcome, a meal, a bed; then the knives; the town lives by killing travelers for their goods | 6 | talk.js; residents.js schedules; society.js word that hops | a town-wide hidden betrayal state; tells the player can learn (SWEET SIGNAL rules for towns) |
| **Ruin crawl** (`ruin_crawl`) | search a dead place under a clock: light, noise, other scavengers, something that wakes | 7 | world/ring.js searchable ruins; inventory.js containers; the infected system: noise draws herds | rival scavenger crews who race you to the same cache |
<!-- /atlas:situations -->

**What the table says.** Five situations are close to buildable today with data and small code: the armored train
(`train.js` already boards and blows up), the road ambush (convoys, caltrops, car combat), the town siege (bases.js has
fence, gate, towers, searchlights and the trespass rule), the herd siege (the infected system), and the ruin crawl (the
Phoenix ring). The biggest shared gaps are **an underground level type** (bunker clearing, tunnel fight, prison: 20
sites), **boats you can stand on and fight from** (river and sea: 20 sites), **animal rows** (swarm: 6 sites, plus every
creature kind in §3.3) and **AI that uses cover, retreats and counts ammo** (every archetype in §3.3).

### 3.5 (d) Military installations

One real installation per state: the largest, or the canon one where the ring already names it
(`game/data/carousel.json`: Fort Bragg, Fort Benning, Fort Campbell, Fort Hood, Nellis, Cheyenne Mountain, Fort
Leavenworth, Norfolk). Areas are the real footprint: `wiki` = the installation's Wikipedia article, `cdp` = the
Census-designated-place area where no total is published (Air Force bases), `other` = a public source in the study notes.
"Fence side" is the square that area becomes at the road law (§4 F2); "Built" is that side clamped to what we can build.

DSOA status: **abandoned** · **remnant** (a Federal Remnant garrison) · **raider** (a raider-held armory) · **overrun**
(the infected or creatures) · **ruler** (the state's ruler holds it) · **automated** (the continuity network, nobody
home) · **contested**. Count: ruler 20, remnant 7, overrun 7, raider 6, abandoned 5, contested 3, automated 2.

<!-- atlas:bases -->
| State | Installation | lat, lon | Real area (km²) | Source | Fence side at 1:14 (m) | Built (m) | Kind | DSOA | Held by | world x, z (km) | Ring row |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AL | **Redstone Arsenal** | 34.684, -86.654 | 147.6 | wiki | 868 | 868 | army | ruler | the Rocket Barony | 171.6, -7.8 (moved 2) |  |
| AK | **Joint Base Elmendorf-Richardson** | 61.251, -149.806 | 259 | wiki | 1150 | 1150 | air | abandoned | nobody | off grid |  |
| AZ | **Davis-Monthan Air Force Base** | 32.164, -110.849 | 43.56 | wiki | 471 | 471 | air | ruler | the Sun Court | 8.1, 11.2 |  |
| AR | **Pine Bluff Arsenal** | 34.333, -92.087 | 54.6 | wiki | 528 | 528 | depot | overrun | failed-fix animals | 134.3, -8.7 |  |
| CA | **Fort Irwin National Training Center** | 35.246, -116.682 | 2579.77 | wiki | 3628 | 3000 | army | raider | The Crimson Road | -31.7, -17.4 |  |
| CO | **Cheyenne Mountain Complex** | 38.742, -104.848 | 0.0206 | wiki | 10 | 64 | space | automated | the continuity network | 48.8, -49.4 | cheyenne_mountain |
| CT | **Naval Submarine Base New London** | 41.398, -72.087 | 2.78 | wiki | 119 | 119 | navy | ruler | the Gun Barons | 267.8, -72.8 (moved 1) |  |
| DE | **Dover Air Force Base** | 39.128, -75.465 | 15.78 | other | 284 | 284 | air | remnant | The Federal Remnant | 245.8, -52.5 |  |
| FL | **Eglin Air Force Base** | 30.489, -86.542 | 1874.2 | wiki | 3092 | 3000 | air | contested | contested | 179.4, 33.8 (moved 4.2) |  |
| GA | **Fort Benning** | 32.366, -84.969 | 736.5 | wiki | 1938 | 1938 | army | overrun | the infected | 182.1, 9.0 | fort_benning |
| HI | **Joint Base Pearl Harbor-Hickam** | 21.349, -157.944 | 113.3 | other | 760 | 760 | navy | contested | the restored Kingdom | off grid |  |
| ID | **Mountain Home Air Force Base** | 43.040, -115.870 | 25.6 | cdp | 361 | 361 | air | ruler | the Preppers' Republic | -25.8, -89.3 |  |
| IL | **Rock Island Arsenal** | 41.517, -90.542 | 3.83 | wiki | 140 | 140 | depot | raider | the corsairs | 145.0, -75.5 |  |
| IN | **Naval Support Activity Crane** | 38.870, -86.834 | 250.9 | other | 1131 | 1131 | depot | ruler | the Speedway Warlord | 169.6, -50.9 |  |
| IA | **Iowa Army Ammunition Plant** | 40.791, -91.245 | 76.9 | wiki | 626 | 626 | depot | abandoned | nobody | 137.8, -67.6 (moved 1) |  |
| KS | **Fort Leavenworth** | 39.355, -94.921 | 22.7 | wiki | 340 | 340 | army | automated | the continuity network | 111.8, -54.6 (moved 2) | fort_leavenworth |
| KY | **Fort Knox** | 37.900, -85.950 | 440 | wiki | 1498 | 1498 | army | ruler | the Bourbon Barons and the Gold Reeve | 175.5, -42.0 |  |
| LA | **Fort Polk** | 31.073, -93.081 | 801.3 | wiki | 2022 | 2022 | army | overrun | failed-fix animals | 127.5, 20.8 |  |
| ME | **Portsmouth Naval Shipyard (Kittery)** | 43.079, -70.734 | 1.125 | other | 76 | 76 | navy | ruler | the Lighthouse Keepers' Compact | 286.0, -98.8 (moved 4.2) |  |
| MD | **Fort George G. Meade** | 39.107, -76.743 | 20.5 | wiki | 323 | 323 | army | contested | contested | 238.5, -52.6 |  |
| MA | **Joint Base Cape Cod** | 41.704, -70.542 | 89 | wiki | 674 | 674 | guard | remnant | The Federal Remnant | 278.2, -83.2 (moved 2.2) |  |
| MI | **Camp Grayling** | 44.634, -84.772 | 594.9 | wiki | 1742 | 1742 | guard | ruler | the Motor Guild | 184.2, -104.4 |  |
| MN | **Camp Ripley** | 46.076, -94.347 | 214.5 | wiki | 1046 | 1046 | guard | ruler | the Ore Chiefs | 119.1, -118.0 |  |
| MS | **Camp Shelby** | 31.188, -89.199 | 525 | wiki | 1637 | 1637 | guard | abandoned | nobody | 153.9, 19.9 |  |
| MO | **Fort Leonard Wood** | 37.773, -92.114 | 252.8 | cdp | 1136 | 1136 | army | remnant | The Federal Remnant | 134.2, -40.5 |  |
| MT | **Malmstrom Air Force Base** | 47.505, -111.187 | 13.5 | cdp | 262 | 262 | air | ruler | the Missileer Cult | 5.8, -130.7 |  |
| NE | **Offutt Air Force Base** | 41.119, -95.909 | 11.3 | cdp | 240 | 240 | air | remnant | The Federal Remnant | 104.0, -70.2 (moved 2.2) |  |
| NV | **Nellis Air Force Base** | 36.236, -115.034 | 45.7 | wiki | 483 | 483 | air | raider | The Crimson Road | -21.4, -26.6 | nellis_grounds |
| NH | **Pease Air National Guard Base** | 43.078, -70.823 | 0.89 | wiki | 67 | 67 | guard | abandoned | nobody | 278.4, -89.8 |  |
| NJ | **Joint Base McGuire-Dix-Lakehurst** | 40.016, -74.592 | 170 | wiki | 931 | 931 | air | remnant | The Federal Remnant | 251.2, -60.6 |  |
| NM | **White Sands Missile Range** | 32.336, -106.406 | 8300 | wiki | 6507 | 3000 | army | ruler | the Atomic Priesthood | 38.2, 9.1 |  |
| NY | **Fort Drum** | 44.054, -75.787 | 434.09 | wiki | 1488 | 1488 | army | remnant | The Federal Remnant | 244.5, -98.8 |  |
| NC | **Fort Bragg** | 35.139, -78.999 | 650 | wiki | 1821 | 1821 | army | ruler | the Research Barons | 222.3, -16.4 | fort_bragg |
| ND | **Minot Air Force Base** | 48.416, -101.358 | 20 | cdp | 319 | 319 | air | ruler | the Petro-Emir | 72.4, -139.5 |  |
| OH | **Wright-Patterson Air Force Base** | 39.823, -84.049 | 25.9 | cdp | 364 | 364 | air | ruler | the Aviator King | 188.0, -59.9 |  |
| OK | **Fort Sill** | 34.671, -98.390 | 380.4 | wiki | 1393 | 1393 | army | ruler | the Dust Chiefs | 91.7, -12.2 |  |
| OR | **Umatilla Chemical Depot** | 45.843, -119.438 | 69.4 | other | 595 | 595 | depot | overrun | failed-fix animals | -49.7, -115.1 |  |
| PA | **Fort Indiantown Gap** | 40.437, -76.576 | 73 | wiki | 610 | 610 | guard | remnant | The Federal Remnant | 238.5, -64.8 |  |
| RI | **Naval Station Newport** | 41.522, -71.309 | 4.3 | wiki | 148 | 148 | navy | raider | the corsairs | 274.9, -75.3 |  |
| SC | **Fort Jackson** | 34.039, -80.822 | 210.4 | wiki | 1036 | 1036 | army | ruler | the Secession Baron | 210.0, -6.2 |  |
| SD | **Ellsworth Air Force Base** | 44.146, -103.075 | 19.66 | other | 317 | 317 | air | raider | The Crimson Road | 60.4, -99.6 |  |
| TN | **Fort Campbell** | 36.650, -87.467 | 414 | wiki | 1453 | 1453 | army | overrun | failed-fix animals | 165.6, -30.4 | fort_campbell |
| TX | **Fort Hood** | 31.140, -97.766 | 866 | wiki | 2102 | 2102 | army | ruler | the Republic | 96.0, 20.3 | fort_hood |
| UT | **Dugway Proving Ground** | 40.221, -112.744 | 3243.58 | wiki | 4068 | 3000 | army | overrun | failed-fix animals | -4.5, -63.8 |  |
| VT | **Camp Ethan Allen Training Site** | 44.480, -72.951 | 45.4 | other | 481 | 481 | guard | ruler | the Dairy Collective | 263.8, -102.8 |  |
| VA | **Naval Station Norfolk** | 36.945, -76.313 | 13.76 | other | 265 | 265 | navy | raider | contested | 240.4, -33.2 | norfolk_yard |
| WA | **Yakima Training Center** | 46.761, -120.191 | 1323.3 | wiki | 2598 | 2598 | army | abandoned | nobody | -54.7, -123.6 |  |
| WV | **Camp Dawson** | 39.445, -79.670 | 16.906 | wiki | 294 | 294 | guard | ruler | the Mine Kings | 218.1, -56.0 |  |
| WI | **Fort McCoy** | 44.010, -90.683 | 242.8 | other | 1113 | 1113 | army | overrun | failed-fix animals | 143.9, -98.7 |  |
| WY | **Francis E. Warren Air Force Base** | 41.133, -104.867 | 13 | cdp | 258 | 258 | air | ruler | the Caldera Wardens | 46.8, -75.4 (moved 2) |  |
<!-- /atlas:bases -->

<!-- atlas:base_lines -->
| Installation | In DSOA |
|---|---|
| Redstone Arsenal (AL) | The Rocket Barony's arsenal. Test stands and missile yards; the baron flies rockets on holidays. |
| Joint Base Elmendorf-Richardson (AK) | Snowed under; the hangars are full of things nobody can fly. |
| Davis-Monthan Air Force Base (AZ) | The aircraft boneyard. The Sun Court strips it for the last good parts. |
| Pine Bluff Arsenal (AR) | An old chemical store. Hot ground in the igloo rows; something nests there. |
| Fort Irwin National Training Center (CA) | A mock-town training ground in the Mojave. Speed crews hold the motor pools. |
| Cheyenne Mountain Complex (CO) | A hub of the Carousel inside the mountain; the Council claims it, the machine runs it. The real complex is 5 acres of tunnel. |
| Naval Submarine Base New London (CT) | The Gun Barons keep their best works here, behind the sub pens. |
| Dover Air Force Base (DE) | Huge cargo hangars; the Remnant flies one transport a month and nobody knows where. |
| Eglin Air Force Base (FL) | The Free Arsenal's armories; every militia in the panhandle claims a piece of the range. |
| Fort Benning (GA) | The first Choir zone: purge the congregation and the silence stays (THE_INFECTED.md 0.4). |
| Joint Base Pearl Harbor-Hickam (HI) | A Carousel terminus the Queen and the fleet still dispute. Off the mainland grid. |
| Mountain Home Air Force Base (ID) | The Preppers' Republic keeps the runway clear and the bunkers full. |
| Rock Island Arsenal (IL) | An island arsenal in the Mississippi. River raiders took it by boat. |
| Naval Support Activity Crane (IN) | Munitions bunkers in the Indiana hills; the Speedway Warlord's war chest. |
| Iowa Army Ammunition Plant (IA) | Igloo rows of shells, half of them duds (COLD DEPOTS). |
| Fort Leavenworth (KS) | The disciplinary barracks still locks and unlocks on schedule with nobody inside. |
| Fort Knox (KY) | The Gold Reeve's seat. The vault may be empty; nobody who looked came back. |
| Fort Polk (LA) | Swamp training lanes; Howler warrens under the pines. |
| Portsmouth Naval Shipyard (Kittery) (ME) | The Keepers' one shipyard: an island of dry docks at the river mouth. |
| Fort George G. Meade (MD) | A fought-over Carousel hub; the spymasters and the Remnant each hold half the wire. |
| Joint Base Cape Cod (MA) | A Remnant beachhead; the Colleges pretend not to see it. |
| Camp Grayling (MI) | The Motor Guild tests its new engines on the ranges. |
| Camp Ripley (MN) | The Ore Chiefs train their militia here between frozen lakes. |
| Camp Shelby (MS) | Pine barrens and empty barracks; the River Barons never wanted it. |
| Fort Leonard Wood (MO) | Engineer school; the Remnant keeps its bridge-builders here. |
| Malmstrom Air Force Base (MT) | Missile field country: the Missileer Cult worships the silos (the real field covers 61,000 km2). |
| Offutt Air Force Base (NE) | The General's command post and the last real chain of command. |
| Nellis Air Force Base (NV) | The proving grounds; raiders garrison the ring station. |
| Pease Air National Guard Base (NH) | The Free Town has no use for an air force. |
| Joint Base McGuire-Dix-Lakehurst (NJ) | Deep in the Pine Barrens; the Toll-Lords pay the Remnant to stay inside the wire. |
| White Sands Missile Range (NM) | The Atomic Priesthood's pilgrim range. |
| Fort Drum (NY) | Snowbound upstate garrison, the Remnant's northern hand. |
| Fort Bragg (NC) | The airborne warlords' Carousel garrison. |
| Minot Air Force Base (ND) | Silo country on the Petro-Emir's flare fields. |
| Wright-Patterson Air Force Base (OH) | The Aviator King's airfield-fort; the old hangar of secrets. |
| Fort Sill (OK) | The Dust Chiefs hold the artillery school and its guns. |
| Umatilla Chemical Depot (OR) | Emptied chemical igloos on the sage plain; hot ground and Sorebacks. |
| Fort Indiantown Gap (PA) | A Remnant post on the ridge above the interstate the convoys use. |
| Naval Station Newport (RI) | The Smugglers' Republic runs contraband through the old piers. |
| Fort Jackson (SC) | The Secession Baron's drill ground. |
| Ellsworth Air Force Base (SD) | Biker country below the Black Hills; the bomber hangars are a clubhouse. |
| Fort Campbell (TN) | Howler warren on the state line (most of the post lies in Tennessee). |
| Fort Hood (TX) | The Republic's troops hold the ring station. |
| Dugway Proving Ground (UT) | The chemical and germ range on the salt desert. Nobody holds it; things live in it. |
| Camp Ethan Allen Training Site (VT) | The Dairy Collective's mountain school: quiet, armed, unbothered. |
| Naval Station Norfolk (VA) | The ring station by the piers: raiders hold it, the Admiralty's carriers sit offshore. |
| Yakima Training Center (WA) | Shrub-steppe ranges, the Paid Hunt's back country. |
| Camp Dawson (WV) | The Mine Kings' training ground on the Cheat River. |
| Fort McCoy (WI) | A vault under the post, its lower levels a rat-hog warren with a queen. |
| Francis E. Warren Air Force Base (WY) | Missile wing country; the Caldera Wardens watch the silos and the north both. |
<!-- /atlas:base_lines -->

A base from this list becomes a `BASES` row in `web/src/data/bases.js` the way OUTPOST NINE is one
(`WEB_MILITARY.md` §3.1): origin at its world x/z, fence at its built side, buildings at real size inside it.

### 3.6 The ten to build first, and why

Ordered by what the engine can stream today (P1: I-10 from Los Angeles to El Paso) and next (P2: Florida), then by how
much of the situation already exists.

| # | Site | Why first |
|---|---|---|
| 1 | **THE TWO TOWNS FEUD** (Deming, NM; world 29.0, 9.7 km) | On I-10 inside the streamed corridor. A road ambush between two rival towns is FEUD MATH (bible §3.2) on top of convoys, caltrops and car combat that already ship. |
| 2 | **THE BONEYARD TOWN** + **Davis-Monthan** (Tucson; 7.2, 10.7 km) | On I-10, 13 km from Phoenix in the world. A holdout plus a second base row next to it: bases.js builds a base from one row, so the aircraft boneyard is mostly data. |
| 3 | **THE WHITE FLATS** + **White Sands Missile Range** (38.7, 4.9 km) | Inside the corridor next to El Paso. The first lab and the first bunker clearing: forces the underground level type everything else needs. |
| 4 | **THE PASS FORT** (Sunspot, NM; 42.0, 4.9 km) | The first range war: factionsim.js already trades towns off-screen; this puts a front line and artillery on-screen. |
| 5 | **THE SEAWALL BREAK** (Long Beach; -41.3, -3.9 km) | At I-10 mile 0. A hazard crossing on water.js; the cheapest way to make the West Coast read as changed. |
| 6 | **THE RIM HOTEL** (Grand Canyon; -1.0, -24.8 km) | Just north of the P1 box (its edge is z = −22.1 km). The armored train is the situation closest to done (train.js boards, smashes and blows up); it needs armor, a crew and a cliff. |
| 7 | **THE STRIP PIT** (Las Vegas; -22.3, -25.5 km) | Just north of the P1 box. The arena, with the House taking bets: stunts.js witnesses and the Thrill Show already do crowd and reward. |
| 8 | **THE BORDER WAGON ROAD** (Rio Grande; 51.6, 34.6 km) | Convoy escort (FLANK PAY) is the most-promised missing system in the bible; this is its natural first road. |
| 9 | **THE THRILL PARK** (Miami edge; 212.8, 68.9 km) | P2 brings Florida; Miami is its anchor. A second arena with a different shape (rides as traps). |
| 10 | **THE ADMIRAL'S YARD** (Kings Bay, GA; 205.4, 20.8 km) | On the I-95 run north of Jacksonville. The first sea raid with the RAIDER GUNBOAT that already ships; it starts the boats work. |

## 4. Formulas

**F1 — Real place to world metres.**
```
u = Q(lon, lat) + Σ w_i r_i / Σ w_i · k        world = (u − PHX) · K
w_i = (1 − d_i / R)² / d_i²   for cities within R       k = W / (W + 16 / R²),  W = Σ w_i
```
- `Q` is a quadratic in normalised `(lon + 96) / 15`, `(lat − 38) / 8` (six terms per axis), fitted by least squares to
  the 36 usmap towns that are real cities (`CITY_LL` in the tool). `r_i` is city `i`'s leftover error (its usmap
  position minus `Q`), `d_i` its great-circle distance in km, `R` = 900 km. A real city therefore lands exactly on its
  usmap town, and a place near it keeps its real offset from it. `PHX = (−43250, 7250)`, `K = 5.2` (`WEB_STREAMING.md` §4 F3).
- Range: the fit alone is 142 usmap m rms over the 36 cities (worst Philadelphia, 323 m). x and z round to 10 m.
- **Worked example.** Orlando (28.5383, −81.3792), which has no usmap row: F1 gives usmap (−3603, 15756), world
  (206,164, 44,231) m. `WEB_STREAMING.md` §4 F3 planned (−3570, 15790) → (206,336, 44,408) m by hand: 172 m and 177 m
  apart in the world, under 0.1% of the Miami → Orlando leg.

**F2 — Footprint at the road law.**
```
fence_area = A_real / S²        side = √fence_area        built = clamp(side, 64, 3000)
```
- `S` = 14 (the road law, `WEB_STREAMING.md` §4 F1: distances compress 1:14, objects do not). Land inside the wire
  compresses like land between towns; barracks, hangars and fences keep real size.
- `64` m is OUTPOST NINE's fence (64 × 60 m, the smallest base we ship). `3000` m is a metro (decision 5,
  `WEB_STREAMING.md`): no base is bigger than Phoenix.
- **Worked examples.** Fort Bragg, 650 km²: `650,000,000 / 196 = 3,316,327 m²`, side **1,821 m**, built 1,821 m.
  Cheyenne Mountain, 5.1 acres of tunnel (0.0206 km²): 105 m², side 10 m, **built 64 m** (the portal compound; the
  mountain is the rest). White Sands, 8,300 km²: side 6,507 m, **built 3,000 m**; the range beyond the built square is
  open desert under the Remnant's warning signs.

**F3 — The state law.** If F1 puts a row in a states_grid cell of another state, it moves to the nearest cell (by
squared cell distance, searched in rings up to 40 cells) of its own state; `snap` records the distance in cells. A row
whose biome is ocean, island or water may stay in an ocean cell. Rows in Alaska, Hawaii, Puerto Rico or abroad, and
any point outside the grid, are `null`.
- Range: 31 of 172 on-grid rows (124 sites, 48 bases) move; the largest move is 5 cells (13 km in the world): Port Arthur, Isle Royale and
  Manhattan, all coastal or island points that land in water or the neighbouring state on the hand-drawn grid.

**F4 — Coverage.** `titles_with_site / titles = 122 / 158 = 77%`. Sites per situation range 2 (sniper duel, armored
train, air raid, manhunt) to 20 (town siege).

## 5. Edge Cases

**Canon conflicts (resolved here; flag if you disagree)**
- **Denver.** Canon drowns Denver (`DIVIDED_STATES.md`); the books keep a lit city there. THE LIT CITY sits on Capitol
  Hill above the flooded river bottoms; THE TENT FIELD BUNKER is out on the high plains at the airport, both dry.
- **Los Angeles.** The books sink it; the engine already streams LA as a metro at I-10 mile 0. THE SEAWALL BREAK floods
  only the port district at Long Beach.
- **Norfolk.** Canon has the Admiralty ruling from carriers; `carousel.json` puts a raider garrison in the ring station.
  The base row is `raider`, held as `contested`, with the carriers offshore.
- **Washington state.** The canon ring row `bremerton_annex` is invented, not a real installation; the base row is Yakima
  Training Center (real, largest by area, and next to THE PAID HUNT).
- **Tennessee and Kentucky.** Fort Campbell's post office is in Kentucky but most of the post is in Tennessee, so it is
  Tennessee's row, and Kentucky keeps Fort Knox (the canon Gold Reeve).
- **Texas.** Fort Bliss is larger, but the ring's row is Fort Hood, so Fort Hood is the row.
- **Fort names.** Bragg, Benning, Hood and Polk carry the names in use in 2026 (restored in 2025); the canon ring rows use
  the same names.

**Grid and data**
- **Off the grid:** 23 site rows (abroad, Alaska, Puerto Rico, plus the Florida Keys, which fall south of the usmap grid)
  and 2 base rows (Alaska, Hawaii) have `null` world x/z. They stay in the atlas as **throw** destinations: a misjump can
  put you there (canon, `DIVIDED_STATES.md` THE CAROUSEL).
- **DC** has no state letter in `states_grid`; THE CRATER is not snapped.
- **An inferred anchor** (`conf: 'inferred'`, 41 rows) is our pick of a real place inside the region a source names
  ("central Texas oil wells" → the Luling field). It can move without breaking anything; nothing else keys on it.
- **Areas from the census** (`areaSrc: 'cdp'`, six Air Force bases) under-count the airfield; they are the right order
  of magnitude and all six build at their scaled side anyway (11–26 km² → 240–360 m).
- **Huge ranges** (White Sands, Fort Bliss's neighbour, Dugway, Fort Irwin, Eglin) hit the 3 km cap. Missile fields
  (Malmstrom's 61,000 km²) are not the base: the row is the base, the field is scenery.
- **Re-running the tool** after any lat/lon edit rewrites the xz block and these tables; `--check` fails CI-style if
  either is stale (§8).

**Places the study could not place**
- **Unplaced settings:** Moon Fate (the Moon), Zero City and Breakthrough (a parallel Earth), Separation (an unnamed
  island), Demons of Eden (a hidden valley), Damnation Road Show (an unnamed mountain lake), Motherlode (an invented town,
  no state), Rat King (a working army base, unplaced), Cannibal Moon (no setting found), Prodigal's Return (invented
  names only), Emerald Fire (a jungle shrine in an unstated country), Black
  Harvest ("the Midwest"), Prophecy (plains, three states), Desert Kings (Utah only), Lost Gates (Colorado in passing),
  End Program (California only), Amazon Gate ("the northwest"), Destiny's Truth ("New England"), and among the audio
  originals 126–129, 134, 136, 142, 144, 147–152, 154, 155, 157, 158 and the four prequels (invented or unnamed places).
- **Disagreements between sources:** one book is Tennessee in its blurb and Virginia in the wiki (both regions have
  sites); one blurb describes the Amazon basin where every other source has the Texas desert (we used Texas); the North
  Atlantic islands of one book are only a character's guess at the Azores (`conf: 'inferred'`).

**IP calls that stay open (Robert's call)**
1. **The northern Shenandoah valley.** It is the series hero's home ground, and its town name is a lint DENY term. The
   site is in (THE NORTH VALLEY SEAT, coordinates of the valley, no town name, no family plot). Drop it if the location
   alone reads as a reference.
2. **The crew as a set.** Each crew archetype is an allowed kind (one-eyed leader, seer, armorer, swamp kid, medic out of
   time, a man out of time, the leader's son, a young gunsmith), and each was given its own signature, flaw and origin.
   As a full set of eight they still mirror the books' party. Option: ship at most four in any one crew.
3. **Real conspiracy folklore** (a base under Archuleta Mesa, a bunker under the Denver airport, a vault in Mount
   Rushmore) is public rumor about real places, not the series' invention; kept.
4. **Renamed on review:** "Cloud City" (Leadville's real nickname, but also a famous film location) became THE TWO-MILE
   TOWN; a title close to one book's ruler's became THE ATOLL THRONE; a villain handle echoing a book's tagline became
   the Duster.

## 6. Dependencies

| Doc / system | What it needs from this atlas | What this atlas needs from it |
|---|---|---|
| `docs/DIVIDED_STATES.md` | sites and bases for every state ruler | the 50 rulers (`RULERS`, verbatim) and the landmarks it already promises |
| `docs/WORLD_PILLARS.md` Pillar 2 | places for each of the seven families | the families (`HOLDERS`) |
| `docs/LORE_BIBLE.md` §2, §4, §6, §11 | labs for the Three Human Trials; bases with the layer list | the collapse cause, the Carousel as infrastructure, the military base layers |
| `WEB_FAN_SERVICE_BIBLE.md` | the coined-term list for the landmine register (row 12) | the wall, the vocabulary (§3.3), HOUSE RULES, COLD DEPOTS, FLANK PAY, HOT GROUND |
| `WEB_STREAMING.md` | site and base positions for P4 (continent placements) | the scale law (S = 14), the import transform (PHX, K), the P1 box, the metro size |
| `WEB_MILITARY.md`, `web/src/data/bases.js` | 50 candidate base rows with origin and fence size | the row format, OUTPOST NINE's size (the F2 floor), the trespass rule |
| `THE_INFECTED.md`, `game/data/carousel.json` | nothing new | fort_benning as the first Choir zone; the eight real ring rows |
| `web/src/data/usmap.json` (`tools/import-usmap.mjs`) | nothing | towns (the F1 anchors), states_grid (F3), the grid bounds |
| `web/src/data/society.js` | holders that map to engine factions (remnant, dustwolves, drifters, infected) | the faction ids |
| `web/src/systems/*` | the situations' "missing" lists are build tickets | what each situation's "have" column cites |

## 7. Tuning Knobs

| Knob | Default | Safe range | Affects | Source |
|---|---|---|---|---|
| `FOOTPRINT.S` (area law) | 14 | 11.5–14 | base fence size; 11.5 is the straight-line scale | `WEB_STREAMING.md` F1 |
| `FOOTPRINT.minSide` | 64 m | 40–120 | the smallest base compound | OUTPOST NINE |
| `FOOTPRINT.maxSide` | 3,000 m | 1,500–5,000 | the biggest base compound | decision 5 (metros) |
| City blend reach `R` | 900 km | 400–1,500 | how far a city's local correction reaches | tool |
| Snap search | 40 cells | 10–80 | how far the state law may move a point | tool |
| Water rows in ocean cells | allowed | allowed / forbidden | islands and harbors stay offshore | tool |
| xz rounding | 10 m | 1–50 | diff noise when re-running | tool |
| Inferred anchors | 41 rows | add or remove freely | how many sites rest on our pick, not a source | atlas |
| New creature kinds | 6 proposals | Robert's yes | whether they become rows | atlas §3.3 |

## 8. Acceptance Criteria

Run from `web/` unless a path says otherwise. Each passes or fails.

1. **IP gate.** `node tools/ip-lint.mjs` prints `ip-lint: 0 deny, 0 review — clean` and exits 0.
2. **Derived data is current.** `node tools/atlas-project.mjs --check` prints `atlas xz and doc tables up to date` and exits 0.
3. **Counts.** `node --input-type=module -e "const A=await import('./src/data/atlas.js');console.log(A.ATLAS_SITES.length,A.ATLAS_CAST.length,Object.keys(A.ATLAS_SITUATIONS).length,A.ATLAS_BASES.length,new Set(A.ATLAS_BASES.map(b=>b.state)).size)"`
   prints `147 81 23 50 50`.
4. **Every reference resolves.** This prints `0`:
   `node --input-type=module -e "const A=await import('./src/data/atlas.js');let n=0;for(const s of A.ATLAS_SITES){if(!A.ATLAS_SITUATIONS[s.situation]||!A.HOLDERS[s.holder])n++}for(const c of A.ATLAS_CAST)if(!A.HOLDERS[c.holder])n++;for(const b of A.ATLAS_BASES)if(!A.HOLDERS[b.holder])n++;console.log(n)"`
5. **Footprint rule.** `node --input-type=module -e "const {footprint:f}=await import('./src/data/atlas.js');console.log(f(650).side_m,f(0.0206).built_m,f(8300).built_m)"` prints `1821 64 3000`.
6. **Projection check.** `node tools/atlas-project.mjs` prints a line containing `Orlando lands at usmap (-3603, 15756)`.
7. **Not wired.** `grep -rln "atlas.js" src --include=*.js` prints nothing (no game file imports the atlas).
8. **Study notes never ship.** `git ls-files .study | wc -l` prints `0`, and `git check-ignore .study/deathlands/README.md` prints the path.
9. **No coined place names or slang.** With `P="two-son|washington hole|shytown|slake city|baltimorgue|monster island|greenglades|snakefish|whitecoat|coldheart|predark"`:
   `grep -ciE "$P" src/data/atlas.js` prints `0`, and `sed '/^## 8/,$d' ../docs/design/WEB_ATLAS.md | grep -ciE "$P"`
   prints `0` (§8 itself quotes the pattern, so it is cut off first).
10. **Document shape.** `grep -c "^## " ../docs/design/WEB_ATLAS.md` prints `8`.
