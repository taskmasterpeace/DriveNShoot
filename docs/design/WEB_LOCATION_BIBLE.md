# DSOA web engine — the Location Bible (every place the road goes, built small)

**Status:** SCHEMA LOCKED 2026-10-27; research in progress (rows land in `web/src/data/sites/*.js` as they are written).
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
