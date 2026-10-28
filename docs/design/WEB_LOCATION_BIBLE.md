# DSOA web engine — the Location Bible (every place the road goes, built small)

**Status:** ROWS LANDED (feat/web-sites) — 251 SITE rows in `web/src/data/sites/*.js`, merged by `web/tools/sites-merge.mjs`
from `docs/research/deathlands-locations/part-1..4` (schema locked 2026-10-27; §9 says what the research found).
**Owner:** Robert. **Writer:** the lead session (gap doc `WEB_DEATHLANDS_GAP.md` G7/G8).
**IP law:** `WEB_FAN_SERVICE_BIBLE.md` §3.1. The novels sent their crew to hundreds of REAL American places (towns, forts,
dams, ruins, bunkers, swamps). Real geography and real architecture are free. The books' coined names, slang, characters,
plots and invented place-names are not. Every row is: **the real place → its real layout and architecture → our
miniature, with our name.** The row may record which book-shape it answers (e.g. "a tyrant's walled town in an old
fort") in plain words, never a coined term.

## 1. Overview
A *site* is a hand-tuned recipe the procedural world stamps at small scale (a 150–600 m miniature of a real place).
Cities are generated from *city archetypes* (§3.2) × biome × density; sites are the hero set-pieces stamped into them or
into the wilds. Both are rows; the generator (`web/src/world/citygen/`) is the only code.

## 2. Player Fantasy
Every exit leads somewhere that looks like it could only be *that* place: an adobe pueblo on a mesa, a drowned river
town on stilts, a star fort on a bluff, a cooling tower in a field of rust, a mining town stacked up a canyon wall, a
casino strip lit by stolen power. You recognise the real America under the ruin.

## 3. Detailed Rules

### 3.1 SITE row (schema — `web/src/data/sites/<region>.js`)
```js
{
  id: 'harpers-ferry',                // kebab, unique
  name: 'THE CONFLUENCE ARMORY',      // OUR display name (ip-lint clean)
  real: { place: 'Harpers Ferry', state: 'WV', lat: 39.325, lon: -77.739, refs: ['https://...'] },
  shape: 'tyrant armory town at a river fork',   // the book-shape it answers, plain words
  biome: 'temperate_forest',          // §3.3 biome ids
  kind: 'holdout' | 'ruin' | 'station' | 'fort' | 'industrial' | 'camp' | 'landmark' | 'trade' | 'farm' | 'military',
  footprint: [420, 300],              // metres (miniature), x × z
  layout: 'river_fork_terraced',      // §3.4 layout ids (the generator's plan templates)
  terrain: { relief: 0.6, water: ['river','river'], cliffs: true },
  structures: [                       // the real buildings, miniaturised
    { kind: 'armory_hall', count: 1, storeys: [2,3], plan: [40,14], material: 'brick', roof: 'gable_slate', condition: 0.4 },
    { kind: 'rowhouse', count: [10,16], storeys: [2,3], plan: [6,12], material: 'stone', roof: 'gable', condition: 0.5 },
  ],
  landmarks: [ { kind: 'stone_church_spire', at: 'high_ground' }, { kind: 'rail_bridge_ruin', at: 'confluence' } ],
  walls: { type: 'stone_terrace' | 'car_husk' | 'container' | 'palisade' | 'earth_berm' | 'none', gates: 2, towers: 3 },
  density: 0.55,                      // 0..1 building fill of the footprint
  heightProfile: 'stepped_up_slope',  // flat | center_peak | stepped_up_slope | edge_tall | scattered
  society: { ruler: 'Keyholder', rulerTitle: 'the Armorer', faction: 'free_counties', pop: [80,140],
             houseRules: ['guns_checked_at_gate','no_fires_after_dark'] },
  economy: { makes: ['ammo','gun_repair'], wants: ['brass','lead','food'], scrip: 'confluence_paper' },
  hazards: ['flood_spring','hot_ground_low'], creatures: ['rooters'], loot: ['gun_parts','tools','pre_fracture_docs'],
  audio: { ambience: ['river_rapids','forge_hammer','church_bell_far'], faction: 'free_counties' },
  palette: ['#7a4b33','#a89c86','#3d4b3a'],   // never hue 270–320
  notes: 'why it is fun; what fight it stages; how the camera sees it'
}
```

### 3.2 CITY ARCHETYPE row (procedural cities — `web/src/data/citygen.js`)
`{ id, biome[], sizeKm: [min,max], blocks: 'grid'|'organic'|'radial'|'linear'|'canyon'|'island', blockM: [60,120],
zoning: { core, commercial, residential, industrial, rail, farm } (fractions), storeys: { core:[3,6], res:[1,2], … },
density: { core, edge } (0..1), age: 'colonial'|'victorian'|'1920s'|'postwar'|'sprawl', damage: 0..1, walls, sites[] }`
— the generator derives every building from these + a seeded rng, so two towns of one archetype still differ.

### 3.3 Biomes (ids)
`desert_sonoran, desert_mojave, high_plateau, great_plains, prairie_farm, temperate_forest, appalachian, deep_south_swamp,
gulf_coast, atlantic_coast, great_lakes_rust, northern_pine, alpine, pacific_rain, tundra_north, badlands, salt_flat,
river_delta, hot_ground` (each: ground palette, flora set, weather weights, ambience set, creature set).

### 3.4 Layout ids (plan templates the generator knows)
`grid_downtown, main_street_strip, courthouse_square, river_fork_terraced, mesa_pueblo, canyon_stack, star_fort,
bastion_fort, company_town, mill_town_river, port_wharf, stilt_village, interchange_ring, campus_quad, mall_island,
refinery_maze, rail_yard, dam_and_spillway, military_base_grid, missile_field, prison_compound, stadium_bowl,
amusement_park, cemetery_hill, mine_head, plantation_row, oasis_ring, tank_farm, airport_apron, cooling_tower_field`.

## 4. Formulas
- Miniature scale: `s = clamp(targetFootprint / realFootprint, 0.02, 0.4)`; real building plans scale by `sqrt(s)` (so
  buildings stay walkable — a 200 m real factory becomes ~60 m, never 4 m) while street spacing scales by `s`.
  Example: Harpers Ferry lower town ≈ 1.6 km → 420 m: s = 0.26; a 40 m armory hall → 40·√0.26 ≈ 20 m. Floors stay 3.2 m.
- Density → lots: `lots = floor(footprintArea · density / meanPlanArea)`.

## 5. Edge Cases
- A real place that is a single structure (a dam, a bunker): footprint is its approach + the structure; `kind: landmark`.
- Book-only invented places: skipped — only real geography gets a row (the shape may be reused on a real site).
- Two rows for one real place (different eras/uses): allowed with distinct ids; the atlas picks one per world seed.

## 6. Dependencies
`WEB_DEATHLANDS_GAP.md` G4/G7/G8 · `web/src/world/citygen/` (consumer) · `WEB_ATLAS.md` (regions, rulers) ·
`WEB_FAN_SERVICE_BIBLE.md` (names) · `docs/DIVIDED_STATES.md` (state rulers).

## 7. Tuning Knobs
`site.density` 0.2–0.9 · `footprint` 150–600 m · `s` 0.02–0.4 · archetype `damage` 0–1.

## 8. Acceptance Criteria
- ≥ 150 site rows across ≥ 40 states, every row with `real.refs` and ip-lint clean.
- ≥ 24 city archetypes covering every biome.
- The generator stamps any row without errors; a selftest builds 20 random sites headless and walkability-audits them.

## 9. What the research found (rows landed on feat/web-sites)
Four research passes over the whole series (books 1–35, 36–70 + the 1999 prequel, 71–105, 106–158 + the Trader prequel
audios) wrote 270 SITE rows (81 / 54 / 65 / 70). `web/tools/sites-merge.mjs` merged them into **251 rows** (19 same-place
duplicates folded, refs and book numbers merged) and wrote `web/src/data/sites/<region>.js` + `index.js`
(`SITES`, `SITE_REGIONS`, `BUNKER_REGIONS`, `LAYOUT_NEW`, `validateSites`). `validateSites(SITES)` → `[]`;
`node tools/ip-lint.mjs` → 0 deny, 0 review. Re-run the tool (not hand edits) when the research changes.

**Merge rules the tool applies:** same place = same normalised place+state, same id, < 0.2 km apart, or < 3 km apart AND
sharing a distinctive place word (so Times Square and Grand Central, 0.9 km apart, stay two sites); the richer row wins.
`source.book` is book NUMBERS only (titles stay out of game data — several are on the deny list). `source.anchor` is
`named` (the book names the real place) or `regional_pick` (the book names only a region or an invented town and we chose
the real stand-in). Storeys ≤ 6, footprints 150–600 m, palette hues 270–320 dropped (none were present); every biome and
layout was already a §3.3/§3.4 id. Respect and IP fixes are tables in the tool (`FIXES`, `RESPECT`), each with its reason.

### 9.1 Rows by region / state / kind
| Region | Rows | | Region | Rows |
|---|---|---|---|---|
| SW (AZ NM NV UT CO, TX west of 99°W) | 42 | | INTL (territories + abroad) | 23 |
| NE (New England → MD/DC) | 41 | | NW (WA OR ID MT WY) | 21 |
| MW (OH IN IL MI WI MN IA MO) | 39 | | GULF (TX east, LA MS AL) | 13 |
| PLAINS (ND SD NE KS OK) | 24 | | CA | 12 |
| SE (VA WV NC SC GA TN KY AR) | 23 | | AK 8 · FL 5 · HI 0 | |

**States (44 states + DC):** NY 14 · CO 12 · CA 12 · MI 11 · NM 10 · TX 8 (+1 TX/NM) · IA 8 · AK 8 · UT 7 · LA 7 · ME 7 ·
VA 7 · OR 7 (+1 OR/ID) · AZ 6 · WI 6 · WA 6 · SD 6 · FL 5 · MO 5 · DC 5 · NJ 5 · KS 5 · ND 5 · IL 4 · TN 4 · MT 4 · NE 4 · OK 4 ·
MD 3 · NH 3 · PA 3 · WV 3 · NV 2 · MS 2 · OH 2 · AR 2 · GA 2 · KY 2 · NC 2 · ID 2 · IN 1 (+1 IN/KY) · MN 1 · VT 1 · SC 1 · WY 1.
Missing: AL, CT, DE, HI, MA, RI. **Off-map (INTL):** Ontario 5, Mexico 6 (CDMX, Veracruz, Popocatépetl), PR 2, USVI 2,
Okinawa 2, Moscow 2, Antarctica 2, Marshall Islands 1, New Zealand 1.

**Kinds:** holdout 54 · military 42 · ruin 39 · landmark 32 · trade 30 · camp 13 · industrial 13 · fort 10 · station 9 · farm 9.

### 9.2 Regional-pick share
**137 rows (55%) book-named, 114 (45%) our regional pick.** By region (named / pick): SW 17/25 · NE 28/13 · MW 28/11 ·
PLAINS 10/14 · SE 11/12 · INTL 14/9 · NW 14/7 · GULF 4/9 · CA 5/7 · AK 5/3 · FL 1/4. Picks cluster where the books name a
region but invent the town (the desert Southwest, the Gulf swamps, the late-series road trip across the Plains). A merged
row is `named` if any of its sources was.

### 9.3 Military bunkers
43 rows carry a `bunker` block (levels 1–8). Real bunkers and bases among them: Titan silo 571-7 (AZ, 8 levels), Cheyenne
Mountain (CO), White Sands, Dugway, China Lake, Fort Ord, San Clemente Island, Camp Hale, Camp Dodge, Badger AAP, Fort McCoy,
NAS Brunswick, Portsmouth Naval Shipyard, Plattsburgh AFB, Raven Rock (Site R), Pine Bluff Arsenal, Kings Bay, Mount Weather,
Naval Station Norfolk, the Greenbrier, Malmstrom, Hells Canyon Dam, Forts Leavenworth / Riley / Sill, Minot, the Safeguard
pyramid at Nekoma, Offutt, Minuteman Delta-01, Clear SFS, Fort Wainwright, Bikini Atoll, the Diefenbunker, El Morro. The
rest are book-shape vaults under real landmarks (Wizard Island, Cadillac Mountain, Isle au Haut, Mount Rushmore, the Chicago
Loop, Salt Fork Lake, Shiloh, Ghost Ranch, Independence CO). Most `bunker.levels` are **plausible only**, as each row says.

`BUNKER_REGIONS` (22, from parts 2 and 4; none duplicated) are real bases or areas a book jumps through **without** its own
site row: JBER/Nike Site Summit (AK), Charlotte (no base), Puerto Rico karst, the Utah desert, the Sierra foothills east of
Fresno, the Idaho Falls hills, the Kentucky hills near Hazard, Mount Weather, Cheyenne Mountain, Raven Rock, the Greenbrier,
Camp Dodge, Malmstrom, Fort Wainwright/Clear, Portsmouth, Fort Sill, Fort Ord, Offutt, Minot/Nekoma, Badger AAP, Naval
Station Great Lakes, Amundsen-Scott (a civil station, not a base).

### 9.4 Proposed layout ids (for the city generator lane)
37 ids beyond §3.4 (`LAYOUT_NEW` in `sites/index.js`). Every row still carries a §3.4 `layout` as its fallback, so the
generator can ship before any of these. `canyon_rim` and `canyon_rim_village` were folded into `rim_edge_village`.

| id | rows | used by (fallback layout) | plan |
|---|---|---|---|
| `barrier_island_strip` | 2 | grand-isle, padre-island (stilt_village) | one road and bridge onto a thin sand island; camps on pilings along the spine |
| `causeway_island_chain` | 2 | key-largo-fl, seven-mile-bridge-fl (port_wharf) | keys tied by long low bridges over open water |
| `monumental_mall` | 2 | national-mall-dc, lincoln-memorial-dc (campus_quad) | long axial lawn, monumental halls, obelisk, reflecting pool |
| `battlefield_ridges` | 1 | bull-run-manassas (plantation_row) | rolling ridges and creek bottoms, one stone bridge |
| `bayou_linear_town` | 1 | houma-la (main_street_strip) | town strung along converging bayous, drawbridges at crossings |
| `bluff_castle` | 1 | ha-ha-tonka (cemetery_hill) | ruined stone mansion on a bluff over a spring lake, caves below |
| `boneyard_rows` | 1 | amarg-boneyard (airport_apron) | endless rows of parked aircraft, hangars at one edge |
| `buried_film_set_dunes` | 1 | guadalupe-dunes-film-set (oasis_ring) | plaster set pieces half-buried in shifting dunes |
| `butte_and_river_valley` | 1 | devils-tower (oasis_ring) | lone column butte over a forested river valley |
| `caldera_rim` | 1 | crater-lake-rim-or (dam_and_spillway) | ring road on a crater-lake cliff rim, one trail to the shore |
| `canyon_floor_camp` | 1 | phantom-ranch-az (canyon_stack) | stone camp on a canyon floor, suspension footbridges |
| `canyon_highway` | 1 | glenwood-canyon-co (canyon_stack) | highway and rail stacked on ledges in a slot canyon |
| `canyon_ranch` | 1 | abiquiu-nm (canyon_stack) | ranch compound in a red-cliff box canyon, one way in |
| `ceremonial_plaza` | 1 | el-tajin-mx (mesa_pueblo) | stepped pyramids and ball courts round open plazas |
| `cinder_cone_island` | 1 | wizard-island-or (mesa_pueblo) | steep cone in a lake, summit crater, landing cove |
| `dacha_village` | 1 | moscow-dacha-ru (main_street_strip) | wooden houses in birch woods round a church and rail halt |
| `estate_grounds` | 1 | white-house-dc (plantation_row) | one great house behind iron fences in formal lawns |
| `glacier_cirque` | 1 | grinnell-glacier-mt (canyon_stack) | cliff bowl round a shrinking glacier and meltwater lake |
| `gorge_bridge_span` | 1 | rio-grande-gorge-nm (dam_and_spillway) | one high bridge over a sheer gorge on flat mesa |
| `grand_resort_lawn` | 1 | greenbrier-bunker (campus_quad) | huge resort hotel on lawns with cottages, bunker under a wing |
| `hill_crown_residential` | 1 | queen-anne-wa (river_fork_terraced) | hilltop grid of frame houses, public stairs down every side |
| `hilltop_castle_terraces` | 1 | nakijin-castle-jp (bastion_fort) | nested curving stone terraces up to an inner court |
| `island_ranch_cove` | 1 | santa-cruz-island (main_street_strip) | ranch and outbuildings in an island cove valley, pier |
| `lake_lodge` | 1 | jordan-pond-me (campus_quad) | lodge and boathouse on a mountain lake, carriage roads |
| `lakefront_park_harbor` | 1 | chicago-lakefront-il (port_wharf) | formal lakefront park with a breakwater harbor |
| `monument_cliff_terrace` | 1 | mount-rushmore-sd (canyon_stack) | viewing terrace and avenue under a carved cliff |
| `mountain_pass_summit` | 1 | snoqualmie-pass-wa (main_street_strip) | pass summit: lodge strip, lake, dead rail tunnel portal |
| `park_market_meadow` | 1 | central-park-ny (campus_quad) | big park meadow inside a ring of towers |
| `prairie_ranch_spread` | 1 | flint-hills-ks (plantation_row) | stone ranch manor and barns over tallgrass hills |
| `rim_edge_village` | 1 | grand-canyon-village (main_street_strip) | hotel-and-depot village along a canyon lip |
| `river_bluff_city` | 1 | memphis-tn (river_fork_terraced) | downtown grid on a river bluff, cobbled landing below |
| `river_canyon_bridges` | 1 | chicago-river-il (port_wharf) | river walled by towers, lift bridges every block |
| `salt_raceway` | 1 | bonneville-flats (main_street_strip) | flat white salt pan, one marked course, no cover |
| `suburban_cul_de_sac` | 1 | phoenix-az (grid_downtown) | cul-de-sac subdivisions and dry canals on a desert basin |
| `summit_road_loop` | 1 | cadillac-mountain-me (canyon_stack) | bald granite summit, one switchback road ending in a loop |
| `swamp_causeway` | 1 | everglades-shark-valley (main_street_strip) | raised road and canals through sawgrass, lone tower |
| `volcano_flank` | 1 | popocatepetl-slopes (mine_head) | ash slopes and lava ridges, a lodge and a pass road |

### 9.5 Skipped places and caveats
- **97 invented places skipped** (31 / 25 / 18 / 23 by part): book-only towns, baronies and valleys with no real anchor
  (§5). Their shapes can be reused on real sites; each `part-N.json` lists them in `invented_skipped`.
- **Fandom wiki blocked** (HTTP 402 on direct fetch). Part 2 used its API plus archived plot pages; parts 3 and 4 relied on
  publisher/retailer **blurbs** and opening-chapter previews, so places deep inside a book can be missing.
- **Regional picks** (45%, §9.2) are design choices, not book facts; each says so in `source.notes` or `notes`.
- **Light-checked rows:** part 4 lists 33 rows confirmed by Wikipedia title/summary only (Detroit, NYC, DC, Baltimore,
  Chicago Loop/Navy Pier, Des Moines, Keokuk and others); their structure lists lean on general knowledge. Part 2 kept book
  oddities as written (Tonganoxie placed in Missouri, rails through Taos). Book 35 and several audio books name no
  verifiable place.
- Bunker levels are plausible only unless the row's `bunker.notes` says "real".

### 9.6 Sensitive-history rows (respect notes)
These rows carry a `respect` field that the generator, the writers and the /librarian pass must honour. Where the research
had pinned a book's villain shape on a real living people, the merge tool rewrote it (`FIXES`).

| Place (`id`) | Respect note | Data changed |
|---|---|---|
| Taos Pueblo (`taos-pueblo`) | Living community (UNESCO): never an enemy faction or raid target; kivas and the cemetery are off-limits geometry | pottery loot → trade goods |
| Acoma Sky City (`acoma-sky-city`) | Living Acoma Pueblo: never hostile or sacrificial | the book's "offers strangers to the spirits" shape removed |
| Pueblo Bonito (`chaco-canyon-nm`), Cliff Palace + Chapin Mesa (Mesa Verde) | Ancestral Pueblo sites sacred to living Pueblo and Diné peoples; squatters are outsiders | pottery, turquoise and museum loot removed; the Cliff Palace cult is no longer a Pueblo faction |
| El Tajín (`el-tajin-mx`) | Totonac heritage (UNESCO); the jungle tribe is invented, no sacrifice on screen | "gods must be fed" rule removed |
| Oak Alley Plantation (`oak-alley-la`) | Built on enslaved labour: never a glamorous estate; show the slave quarters and name the history | — |
| St. Helena Island (`st-helena-island-sc`) | Gullah Geechee community, shown capable and self-governing | — |
| Utqiagvik (`utqiagvik`) | Living Iñupiat city: traders and hunters, never villains | "wants outsiders for an offering" removed |
| Devils Tower / Bear Lodge, Mount Rushmore | Sacred to Plains nations; the Black Hills were taken in breach of treaty, and the world text says so | — |
| World Trade Center 2001 (`nyc-lower-manhattan-2001`) | Calm daytime backdrop only: no attack, collapse, fire or plane imagery | — |
| Willamette National Cemetery (`willamette-national-cemetery`) | Active veterans cemetery: no grave-robbing | grave-robbing crews, open graves and medal/dog-tag loot removed |
| Bikini Atoll (`bikini-atoll`) | Displaced Marshallese; the warlord is an outsider | — |
| Shiloh, Bull Run | Battlefields and graves: never dug or looted | — |
| Temple Square (`salt-lake-temple-square`) | Active temple: the interior is never a fight or loot space | — |
| Nakijin Castle (`nakijin-castle-jp`) | Ryukyu heritage: no samurai stereotypes | "honour or seppuku" rule removed |
| WV Penitentiary (`wv-penitentiary-moundsville`) | People died here: no torture or execution set-pieces | — |

IP fixes: the Virginia valley town's own name is on the deny list, so `front-royal-va` names the place by county and roads;
El Morro's "citadel" (a review term) became "castle".
