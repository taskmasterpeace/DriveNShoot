# WEB_DATA_TABLES — the game's rules as engine-neutral tables

Robert (Machine King) may move DSOA to Unreal Engine later. The rules therefore live in **tables any engine can read**, not in JS literals.
The three.js game and a future Unreal build read the same files.

## The format

```
web/src/data/tables/<family>/<Table>.csv           one table, header row, flat rows
web/src/data/tables/<family>/<Table>.schema.json   columns, types, units, allowed values, keys
web/src/data/tables/load.js                        reads both, checks every row, rebuilds the game's objects
```

- **CSV, header row, one key column named `Name`.** That is what Unreal's DataTable importer reads (row struct `FDsoa<Table>Row`, named in the schema).
  `Name` is letters, digits and `_` only (Unreal sanitizes anything else, which would silently break lookups). If the game's own key is not safe
  (`two-lane`), the safe form goes in `Name` and the original in a `GameKey` column (the schema says `keyAlias`).
- **Flat rows. Nested values are separate tables joined by key, never packed into a cell.** A vehicle's seats are `VehiclesSeats.csv`
  (`Name, Vehicle, Index, ...`); a list of faces is `ArmorTypesFaces.csv`. The schema's `parent` block says which table, which column and which
  game-object path the child rows go back to. A fixed 3-tuple (a seat's `at`) is three columns (`At_X_m, At_Y_m, At_Z_m`).
- **Units live in the schema** (`unit`: `m`, `mps`, `mps2`, `kg`, `t`, `L`, `s`, `rad`, `radps`, `gh` = game hours, `hp` = hit points, `scrip`, `per_s`,
  or `""` for a dimensionless number). A column with a unit is named for it (`Len_m`); `tables:check` fails if the two disagree.
- **Every row carries `Source`**: where the fact came from (a doc, a real place, a real dataset) or `design` (invented for the game).
- **Empty cell = the field is absent** (a column with `required: false`). `Infinity` is written `Infinity`.
- **Schema `path`** says where the column lands in the object the three.js code reads (`mounts.front.arc`); `null` = table-only metadata
  (`Source`, `Group`). An engine importing the CSV can ignore it.

## Using a table from JS

```js
import { rows, one } from './tables/vehicles/index.js';   // or load.js directly: tableObjects(family, table), tableOne(family, table)
export const ARMOR = rows('ArmorTypes');                   // the old export, now a thin wrapper
```

A bad row is a `TableError` with the file and line: `vehicles/Vehicles.csv:7: Len_m: "abc" is not a float`.

## The checks

```
npm run tables:check   # every CSV vs its schema (header, types, enums, min/max, refs, parents, units named, no purple, IP-lint, Source)
npm run tables:test    # the loader's error cases + the equality test (tables == the old JS, field by field)
```

The equality test compares against `tools/fixtures/tables/<family>.legacy.json`, a snapshot of the JS literals as they were *before* the tables
existed. Never regenerate it from the wrappers (that would compare the tables with themselves).

## Families

| Family | Folder | Status |
|---|---|---|
| Vehicles: bodies, seats, driving, towing, trailers, old garage parts, workshop | `tables/vehicles/` | migrated (this change): 41 tables, 367 rows |
| Region character | `tables/regions/` | new data (11 regions): nothing reads it yet, see WEB_REGION_CHARACTER.md |
| Items and loot | `tables/items/` | migrated: items.js inline rows, loot tables, gun wear/care/found, start kit |
| Infected and hordes | `tables/infected/` | tables + equality test done; data/hordes.js is a wrapper; data/infected.js wrapper STAGED (`tools/tables/wrap-infected.mjs`) until the feat/web-zed-* branches land |
| Building furnishing | | next (coordinate with the zombies/interiors session) |
| Weather, economy, encounters | | after the live sessions land |

## Not in the vehicle tables (stays JS, on purpose)

- `TRAILER_DECKS` (the hold floors): walkable decks belong to a decks family (`data/decks.js`); the `Deck` column names the key.
- `FREIGHT` (hauler crew formations, map of arrays of rows): encounter data; it moves with the encounters table.
- `MUD_PITS` (empty, filled by the world at boot), `police.js BREACH_TRUCK`, and any row another system adds with `??=` at runtime.
- The `validate*` functions: code, not data.

## Adding a row

Edit the CSV (a new vehicle = a new `Vehicles` row + its `VehiclesSeats` rows). `npm run tables:check` tells you what is wrong. Do not edit the JS wrappers.
`tools/tables/extract*.mjs` are the one-off migration tools; they are not run in the normal flow.
