# WEB_REGION_CHARACTER — what each region is like, as tables

Eleven region rows (the site catalogue's regions: FL SW CA GULF MW NE SE NW PLAINS AK HI) in `web/src/data/tables/regions/`. **Nothing reads them yet.**
Format and checks: `WEB_DATA_TABLES.md`. Regenerate the derived rows with `tools/tables/gen-regions.mjs` (it overwrites hand edits).

## The tables

| Table | What it says | Source |
|---|---|---|
| `Regions` | climate band, terrain, dialect tag, note, site-row count | climate: real (Koppen-Geiger); terrain: real (USGS provinces); dialect: **design** |
| `RegionStates` | states in the region and each canon ruler | `docs/DIVIDED_STATES.md`, `data/atlas.js RULERS` |
| `RegionBiomes` + `Biomes` + `BiomeFlora` | which biomes, and what grows in each (keys are `world/flora.js SPECIES`) | biomes derived from `data/sites`; flora **design** after the real ecoregion |
| `RegionFactions` | who holds ground (site `society.faction` counts) | derived from `data/sites` |
| `RegionScarcity` / `RegionSupplies` | what its sites want / make and loot | derived from `data/sites` `economy`, `loot` |
| `RegionHazards` / `RegionCreatures` / `RegionKinds` | hazards, creatures, kinds of place | derived from `data/sites` |
| `RegionVehicles` | typical vehicles: a `vehicles/Vehicles.csv` key and weight | **design** |

Honesty notes: dialect tags and typical vehicles are invented (no data existed). Faction ids are the site catalogue's (local holdout families have their own ids).
HI has no site rows, so its derived tables are empty. INTL (off the map) has no row. The SW region is 48 rows spanning hot desert and alpine: one climate band is a coarse summary; split it if a system needs better.

## Which systems should read it next (in this order)

1. **Flora and biome look** (`world/flora.js`, `world/chunkgen.js`, `data/regions.js` biomes): `BiomeFlora` replaces the hand-written species lists per biome; Florida's rows already agree.
2. **Traffic and motorists** (`systems/traffic.js`, `systems/motorist.js`): pick ambient vehicles by `RegionVehicles` weights, so the Gulf shows airboats and the Plains show semis.
3. **Voice and barks** (`data/barks.js`, `data/worldvoice.js`, `data/talk.js`): `DialectTag` selects a phrase set; needs the librarian pass for the prose.
4. **Trade and prices** (`data/trade.js`, `data/supply.js`): `RegionScarcity` / `RegionSupplies` nudge what a trader wants and sells (coordinate with the economy table before touching).
5. **Encounters, weather, fauna** (`data/events.js`, `data/fauna.js`, weather): `RegionHazards`, `RegionCreatures`, `ClimateBand`. Wait for the weather and encounter tables.
6. **Factions and rulers** (`data/society.js`, `data/rulers`): `RegionFactions` seeds standing and patrols by region.
