# WEB_FORGE: THE WORLD FORGE, the unified world editor

**Status:** built 2026-10-23 on `feat/web-forge` (the gateway, MAP, BRUSH, TERRAIN, BUILDING and OBSERVE mounted, TOWN /
SITE / LIFE / VOICE as planned cards). **Spec it answers:** [WEB_WORLD_EDITOR_PLAN.md](WEB_WORLD_EDITOR_PLAN.md) §3.1 (the
layer stack) and §3.2 (the tabs). **Engine:** the three.js web engine in `web/` ([web/AGENTS.md](../../web/AGENTS.md)).

Open it: start the dev server (`npm run dev`, or `npm run agent` for a headless game too) and go to
**`http://localhost:3141/forge.html`** (any harness port works: `http://localhost:<port>/forge.html`). It attaches to the
game tab the bridge drives; the chip in its bar picks another, and `?tab=<id>` pins one.

---

## 1. Overview

Robert, 2026-10-23: *"come up with a procedural strategy, build tools, a unified gateway for the tools (a World Editor),
then add more into it: structures, rivers, bridges, human-made stuff, then regional stuff like the animals. Go all out."*

THE WORLD FORGE is one web page, served by the game's own Vite server, where every layer of the world (WEB_WORLD_EDITOR_PLAN
§3.1: L0 earth to L6 story) has a tab. Every tab works the same way:

1. it **writes data rows**, never code, to files the engine imports;
2. it **validates** them with the engine's own code (WorldIndex's warnings, the brush field, the chunk generator itself);
3. it **previews** with the engine's real generators, never a mock;
4. it **pushes them live** into a running game through the agent bridge, so the change is in the world at once;
5. every action is also a **COMMANDS row**, so an agent does from the shell what a person does with the mouse.

| Tab | Edits | Built on | State |
|---|---|---|---|
| **MAP** | the national map: interstates, county and dirt roads, town streets, rails, rivers, towns and holdouts, exits, building slots; atlas sites and the 50 bases as layers | `web/src/data/usmap.json` (the rows the engine streams) | **editor** |
| **TERRAIN** | the real land: the baked asset, the I-10 profile, the real-terrain flag live, the knobs | `src/data/terrain/i10.bin`, `src/data/terrain.js`, the `terrain` command | **viewer + live flag** |
| **BRUSH** | painted density: forest, canopy, brush (undergrowth), ruin share, radiation zones | `web/src/data/brush.json` -> `src/world/brush.js` -> `src/world/chunkgen.js` | **editor** |
| TOWN | a city's zones, blocks, lots, landmarks | the ring generator rows (`data/ring.js`) | planned card |
| **BUILDING** | floor plans, storeys, stairs, authored buildings | `lab.html` (the Building Lab), mounted | **mounted** |
| SITE | atlas sites, the 50 bases, caves, bunkers, secret facilities | `data/atlas.js`, `data/bases.js` | planned card |
| LIFE | fauna by biome, the infected, factions, spawn rules | infected, faction, director rows | planned card |
| VOICE | dialogue lines, variations, casting, the audio queue | dialogue rows, the TTS pipeline | planned card |
| **OBSERVE** | the live game: map, wire, people, record and replay, controls | `observe.html` (the observer), mounted | **mounted** |

The planned cards say exactly what each tab will edit, what the game already holds there (counted from the rows), how to
drive it from the shell today, and link to its design docs, which open read-only inside the forge.

### 1.1 Files

| File | What it is |
|---|---|
| `web/forge.html` | the page (a fourth Vite entry beside index, lab and observe) |
| `web/src/forge/forge.js` | the shell: tabs, keys, palette commands, `window.FORGE` |
| `web/src/forge/core.js` | the spine: attached game tab, health dots, rows on disk, `patch` (write) / `push` (live) / undo / redo per tab, toasts, modal, drawer, palette |
| `web/src/forge/rows.js` | **the row law**: field-preserving ops with inverses, the files and their collections, the serialisers, the structural checks (shared by server, page and commands) |
| `web/src/forge/validate.js` | the map's checks: dead ends, orphans, water crossings |
| `web/src/forge/frame.js` | usmap <-> world for a row (a town's streets and slots go through the town's own frame, as the engine lays them) |
| `web/src/forge/live.js` | push-live in the game page: put rows into the module the engine holds, rebuild WorldIndex, repaint signs, lay out only the reached chunks |
| `web/src/forge/engine.js` | the engine in the forge page: WorldIndex over the forge's rows (its warnings), `layoutChunk` for previews |
| `web/src/forge/mapview.js` | the canvas map in usmap metres shared by MAP and BRUSH (base wash, state lines, row painters, labels, the game frame) |
| `web/src/forge/land.js` | the baked land decoded once and painted (TERRAIN; under MAP and BRUSH when zoomed in) |
| `web/src/forge/tab-*.js`, `help.js`, `forge.css` | the tabs, the HOW TO USE drawers, the look |
| `web/tools/forge-io.mjs` | the Vite plugin: `/forge/status`, `/forge/data`, `/forge/patch`, `/forge/restore`, `/forge/file`, `/forge/shard`, `/forge/log` |
| `web/tools/forge-shots.mjs` | screenshots of the forge from a private headless Chrome (the `observer-shots.mjs` pattern) |
| `web/src/world/brush.js`, `web/src/data/brush.json` | THE BRUSH: the strokes, the sampler, the chunk stage |
| `web/src/agent/forgetools.js`, `forgetools-selftest.js` | the COMMANDS rows and the selftest checks |

### 1.2 Hooks into code the forge does not own (exactly these)

| File | Hook |
|---|---|
| `web/vite.config.js` | `import { forgeIO }`; `plugins: [agentBridge(), forgeIO()]`; `forge.html` as a build input |
| `web/src/agent/api.js` | two imports, `...forgetoolsCommands(api, need)` in COMMANDS, `await forgeChecks(api, check, C)` in the battery |
| `web/src/world/chunkgen.js` | import `brushField, brushStage`; per-chunk `BR = brushField.chunk(cx, cz)`; the ground tint multiplied by `BR.tint` (one line); `if (BR) out.brush = yield* brushStage(...)` before the nav tiles; `if (BR) H.str(BR.hash)`; a flora species' per-chunk instance budget from `SPECIES[k].chunk ?? 400` |
| `web/src/world/worldindex.js` | import `brushField`; `ruined = rng.chance(brushField.ruinAt(cx, cz) ?? kit.ruin)` (one draw either way) |
| `web/src/world/flora.js` | three SPECIES rows: `pine`, `oak`, `cypress` (h, cap, chunk) |
| `web/tools/import-usmap.mjs` | emits the national `roads` (county and dirt); carries forge-authored rows (`meta.forge.edits`) over a re-import |
| `tools/blenderforge/gen_flora.py` | the three forest builders and their palette rows |

## 2. Player fantasy

*Robert at the forge, the game running headless beside it. He scrolls out to the whole country, a hillshaded survey map
with every interstate, holdout and military base on it, finds the stretch of I-10 east of Phoenix, scrolls in until the
500 m wash gives way to the real baked hills, picks FOREST and drags across a valley. He lets go and the preview shows the
chunk the game will build: 0 trees, then 552. The IN GAME panel shows the game's own camera over it: a closed wood of pine
and oak, dark ground under it, a deer path of road through the middle. He hits the switch on TERRAIN and the whole
corridor lifts onto the real land. He adds an exit on I-10 and the game builds its ramps, its bridge and its little town
the moment he clicks ADD.*

For the player, the forge is invisible: they get woods thick enough to lose a convoy in, hot zones with sick ground and
glowing seeps, ruins thinned or thickened by hand, exits and holdouts where a designer put them, all streamed like any
other chunk.

## 3. Detailed rules

### 3.1 The shell

- **Tabs** in the plan's order (MAP · TERRAIN · BRUSH · TOWN · BUILDING · SITE · LIFE · VOICE · OBSERVE), pill-styled; the
  planned ones carry a dot. `Alt 1-9` switches; `#map` etc. in the URL opens a tab.
- **The bar:** the game-tab chip (LED green polling, amber deep in a long command, rust none; click to pin a tab, AUTO
  follows the bridge), four **health dots** (GAME, SHARD on `:3280/health` via `/forge/shard`, HARNESS = a connected
  headless agent tab, FILES = the forge's files exist and round-trip byte for byte), **LIVE** (push every write), the
  **command palette** (`Ctrl K`: every command, plus towns, exits, sites, bases and interstates to fly to), **HOW TO USE**
  (`?` / F1: a drawer per tab).
- **The status strip:** each file's content hash and row count, this tab's undo and redo (with the last label), the map's
  check counts, the last push (file, chunks, ms, or why not).
- **Undo and redo are per tab** (`Ctrl Z`, `Ctrl Y` / `Ctrl Shift Z`): each write keeps the inverse ops the server returns;
  undo posts them, and its own inverse becomes the redo.
- **Forms are modal dialogs**; destructive actions confirm.

### 3.2 The row law (save, validate, push)

1. A write is a list of **row ops** (`src/forge/rows.js`): `set` (merge fields), `vertex` (move a line's vertex or a point
   row's `pos` / `dest`), `insert`, `delete` (a line keeps two vertices), `add`, `remove`, and `top` (merge keys into a
   file-level settings object: the brush's `knobs` and `palettes`).
2. The server (`/forge/patch`) applies them **to the file as it is on disk**, so two editors' changes to different rows
   never clobber each other. **Field-preserving:** an op touches only what it names; unknown fields, rows, collections and
   meta ride through untouched.
3. **Conflict guard, per row:** the client sends `expect: {"coll/id": rowHash}` for the rows it last saw; a row that changed
   on disk since is a 409 and the forge asks: reload theirs, or write mine (`force`).
4. **Checks before writing:** the structural law (`checkFile`: ids unique, lines have `pts`, points have `pos`, brush strokes
   valid). Engine checks run in the page after the write (MAP: `checkMap` + WorldIndex's warnings; BRUSH: the preview).
5. **Serialised as the file was:** `usmap.json` compact (the importer's own `JSON.stringify`), `brush.json` one row a line;
   the file's own line ends kept. An untouched file round-trips byte for byte (the FILES dot checks it).
6. **No hot reload:** the plugin marks the files it wrote and tells Vite's HMR to skip them, and invalidates their modules,
   so a playing tab (or a selftest) never reloads under you and the next page load reads the new rows.
7. **Push live** (`forgePush`, `src/forge/live.js`, run in the game page): read the file back from disk, put its rows into
   the module object the engine imported (every reader holds the same object), rebuild WorldIndex in its constructor's order
   (corridor, exits, towns, signs, buckets; the ring keeps its own), repaint the sign atlas if the signs changed, re-survey
   real terrain if it is on, then evict exactly the chunks the old and new geometry reach and stream the player's
   neighbourhood back in. A brush push evicts only the chunks an added, removed or changed stroke's capsule reaches (all of
   them if the knobs or palettes changed).
8. **usmap.json is editable now.** It is still generated by `tools/import-usmap.mjs` from `game/data`, but every row the
   forge writes is stamped in `meta.forge.edits` and a re-import carries those rows over (authored rows win; a removed row
   stays removed; a forge-only collection such as `rails` keeps its rows).

### 3.3 MAP

- **The view:** a canvas in usmap metres. The base is painted once from the usmap grids: biome colour blended between cell
  centres, a hillshade from the painted relief (light from the north-west), grain, the sea crisp; dashed state lines and
  faint state names; a surveyor's graticule. Zoomed into the corridor the **baked land** fades in under it. Wheel zooms about
  the cursor (0.004 to 6 px a usmap metre: the whole country to a town's street); drag pans.
- **Layers** (toggle chips): states, rivers, interstates (with shields), county and dirt roads, town streets, rails, towns
  (cities as amber dots, holdouts as rust hexes), exits (diamonds with their numbers, dashed to their destination), building
  slots (true footprints from the structure rows), **atlas sites** (by kind) and **the 50 bases** (by who holds them) from
  `data/atlas.js` (`ATLAS_XZ`), the brush's strokes, the checks, and **the game** (the P1 box the importer copies, the dust
  wall, the island, and where the player is, polled from the attached tab).
- **Tools:** SELECT/MOVE `V` (drag a handle: a vertex, a town, an exit and its destination), INSERT `I`, DELETE `X`
  (`Del` with a vertex or a row), ADD EXIT `E` (beside an interstate: snapped onto it, the community on the clicked side,
  the archetype from `exit_archetypes`), CITY `T` and HOLDOUT `H`, RAIL `R` and ROAD `D` (click points, double-click or
  `Enter`), MEASURE `M` (world km, game miles, minutes at 30 m/s).
- **The inspector** lists every field of the selected row; fields the forge does not know are shown in yellow-green and
  kept. EDIT FIELDS writes only the fields you change (values are JSON; a new field as `name=json`). OPEN IN GAME
  teleports the attached player there (inside the dust wall). Atlas sites and bases are read-only here (SITE edits them).
- **CHECKS** (`src/forge/validate.js`, plus WorldIndex): see §4.2. Click a finding to fly to it and select its row.

### 3.4 BRUSH

- **Rows:** `web/src/data/brush.json` `strokes`: `{ id, layer, op, v, r, soft, pts, note? }` in usmap metres (the map's own
  frame). A stroke is a capsule along `pts` of radius `r`; `op` add | sub | set; `v` 0..1; `soft` the share of `r` that
  fades. Strokes apply in file order.
- **Layers:** `forest` (stems), `canopy` (crown size and the tall share; with no paint it is `canopyDefault x forest`),
  `brush` (undergrowth), `ruin` (the corridor buildings' ruined share; unpainted = the kit's share), `rad` (radiation).
- **In a chunk** (`brushStage`, its own random stream `hash32(seed, cx, cz, 0xB2054)`, a fixed number of draws per grid cell):
  - **forest:** under the wood the desert gives way (cacti, saguaros, Joshua trees, prickly pear, ocotillo and tumbleweed in
    it are taken out with their collision; rocks and desert shrubs take moss); trees on a jittered grid (§4.1) from the
    state's palette: canopy species (pine, oak, cypress: the Blender factory's three new species) and understory (young
    trees, mesquite, palms in Florida); each with a trunk collider; dark undergrowth clumps between the trunks;
  - **brush:** olive clumps, creosote, the odd tumbleweed;
  - **rad:** trees in it die (deadtree), seeps that glow (the `glows` pool, sick yellow-green), clusters of leaking drums
    with collision, the ground yellowed and sick. `brushField.radAt(x, z)` answers for any system that wants it.
  - **ground:** leaf litter darkens a wood's floor; a hot zone yellows. The tint multiplies the chunk's own, both chunks
    on a seam agree (a stroke is indexed for every chunk its capsule reaches, edges included).
- **Pure:** a chunk no stroke reaches is built exactly as before (`BR` is null: no stage, no draws, the same hash). A painted
  chunk's hash includes the strokes that reach it, and a fresh build equals the resident one (the selftest checks both).
- **The page:** the heat is the engine's own `BrushField` sampled every 5 px (the chosen layer strong, the others faint),
  over the baked land; the brush cursor shows `r` and the soft edge; PROBE `C` (and every new stroke) lays the chunk out with
  the game's generator unpainted and painted, side by side with tree counts, and IN GAME takes the game's camera over it;
  KNOBS edits the brush's knobs as a `top` op; strokes list with delete; `[` `]` radius, `1-5` layers, `P` `E` `S` ops.

### 3.5 TERRAIN

The baked land (`src/data/terrain/i10.bin`) painted whole: biome colour, height, hillshade; our I-10 over it coloured by
the grade the engine's own survey (`RealTerrain`, run in the page over the forge's rows) gives it; built towns and exits.
The profile: the real I-10 against ours and our land under it, from the bake's own chart data
(`docs/renders/web/terrain/i10-profile.json`), with the pinned pads. The **REAL TERRAIN** switch sends `terrain on=` to the
attached game (every chunk laid out again; the island never moves); a click on the land shows the game's camera there. The
knobs table is `src/data/terrain.js` (bake knobs need `node tools/terrain-bake.mjs`, engine knobs a reload).

### 3.6 BUILDING and OBSERVE

Mounted, not rewritten: `lab.html` and `observe.html?tab=<the attached tab>` in a frame each, created the first time the tab
opens (the observer only feeds while watched). RELOAD, OWN WINDOW, and the doc open read-only.

### 3.7 Agent parity (COMMANDS rows, `src/agent/forgetools.js`)

| Forge action | Command |
|---|---|
| what the forge holds | `forge` |
| any write, undo, redo | `forgePatch file= ops=<json> expect= force= push=` (returns the inverse ops) |
| push live | `forgePush file=usmap\|brush\|all rows=` |
| move / insert / delete a vertex, add an exit, place a town or holdout, draw a rail or road, edit fields, delete a row | `mapEdit op= coll= id= i= x= z= \| dx= dz= \| ux= uy= row= set= unset=` |
| the checks | `mapCheck kind= limit=` |
| read the paint | `brush x= z=` / `brush list=true` |
| paint, erase, remove a stroke | `brushPaint layer= v= r= op= soft= x= z= \| pts= remove=` |
| TERRAIN's switch | `terrain on=` (existing) |
| BUILDING | `author row= x= z=` (existing) |
| OBSERVE | the observer's rows (existing) |
| screenshots of the forge | `node tools/forge-shots.mjs --step <name> "<js>" <ms>` (`window.FORGE` drives the page) |

## 4. Formulas

### 4.1 The brush

- Falloff of a stroke at distance `d` from its polyline: `f = 1` for `d <= r(1 - soft)`, `1 - smoothstep((d - r(1-soft)) /
  (r soft))` out to `r`, 0 beyond. `add: v = min(1, v + V f)`; `sub: v = max(0, v - V f)`; `set: v += (V - v) f`.
- World radius = `r x K` (`K` = 5.2): a 260 m brush is `r = 50` usmap metres.
- Trees: grid cell `100 / sqrt(forestPerHa)` m (9.4 m at 135/ha); a cell keeps its tree when `a < forest ^ forestGamma`
  (a, b, c, d drawn per cell whatever happens); tall when `c < 0.4 + 0.55 canopy`; dead when `b < rad x radDead`.
- Canopy tree scale `(crownMin + (crownMax - crownMin) frac(7.31 d)) x (0.85 + 0.25 canopy)`, its crown spread
  `spread[kind]` wider than it stands tall; understory `0.42 + 0.3 frac(5.17 d)`.
- Shade: canopy `0.6 + 0.24 h`, understory `0.72 + 0.2 h` (h = the flora hash at the spot) x `shade[kind]`.
- Ground: `tint x (1 + (tintForest - 1) x forest x tintForestK)`, then `x (1 + (tintRad - 1) x rad x tintRadK)`.
- Undergrowth `underShrubPerHa x forest`, brush `brushPerHa x brush`, seeps `radGlowPerHa x rad`, drum clusters
  `radDrumPerHa x rad` (per hectare; a chunk is 6.55 ha).
- At forest 1 with the shipped knobs a chunk holds about **520 canopy trees, 180 understory and 620 undergrowth clumps**
  (measured: 707 trees, 770 shrubs in a fully painted chunk).

### 4.2 The map's checks (`RULES` in `src/forge/validate.js`)

- **Dead end:** an interstate or county/dirt road end with no other road within `snap` (70 usmap m), no town within
  `townReach` (1,600), no exit or exit destination within `exitReach` (200), and not within two cells of the sea or the
  grid's edge.
- **Orphans:** a street `ST-<town>-…` with no such town; a placement no town claims by id prefix (or a ghost-site payload of
  a road, which the web engine does not place yet); an exit whose highway is missing, more than `exitOff` (400 world m, the
  engine's rule) off it, or without a `dest`; a town whose streets touch no highway, road or exit.
- **Crossings:** every road segment x river segment intersection, and every run of two or more `waterStep` (125 m) samples
  in `w` or `.` cells; bridged when the road row lists the river (or water) in `bridges`, or a `bridges` row names both.
- **Engine:** `WorldIndex.warnings` over the forge's rows (built in the page, in about 30 ms).

### 4.3 Push

- usmap: chunks = those overlapping the union of the old and new boxes of the changed rows (their own points ±120 m, an
  exit's or town's ±600 m, everything WorldIndex built from them); everything if the signs changed or I-10 changed.
- brush: chunks within `r + 0.72 C + 9` of a changed stroke's polyline (C = 256 m), the same test the index uses.

## 5. Edge cases

- **Two editors on one row:** the per-row guard (§3.2.3). Different rows: both writes land (ops apply to the disk's file).
- **I-10 moved inside the Phoenix ring:** the ring buckets I-10 at boot, so the push says `needsReload` and does nothing
  live; the file is saved; reload the game tab.
- **A street or slot's world position:** a town's own rows are turned square to the world round the town (worldindex
  `buildTowns`); `frame.js` does the same transform, so `mapEdit dx=40` moves a street vertex 40 world metres.
- **The importer:** a re-import keeps forge rows (`meta.forge.edits`); `--check` still compares only the sources' hash.
- **A production build** has no `/forge` routes (the plugin is dev-server only); the commands say so, and the forge's
  selftest checks skip.
- **Canopy under a top-down camera:** a 14 m pine is a wall 20 m under a 34 m camera, so canopy trees stand 0.6-1.05 of
  their model and spread wide instead of tall. A canopy that fades round the player (as roofs do inside a building) is the
  next engine step; it belongs to the camera and roof systems, not the brush.
- **Performance:** a fully painted hot set adds about 1.8 M triangles (one draw per species in view, 3 extra at most): 73
  draw calls against 70 on bare desert at the same time on the same machine. Painting is cheap in the generator (a
  chunk's stage yields every 64 trees).
- **CRLF checkouts:** the serialiser keeps the file's own line ends, so a Windows checkout still round-trips.
- **The forge is opened while a selftest runs:** the bridge sends forge commands to the same tab and they wait behind the
  battery; the forge's own command timeouts are short (3-20 s) and it shows the game as busy (amber).
- **Writes from the selftest:** every check puts the file back byte for byte (`/forge/restore`) and pushes it, and checks the
  chunk's hash is the original again.

## 6. Dependencies

- [WEB_WORLD_EDITOR_PLAN.md](WEB_WORLD_EDITOR_PLAN.md): the layer stack and the tab list this builds.
- [WEB_STREAMING.md](WEB_STREAMING.md): chunks as pure functions of the data, the streamer's evict / ensureHot, WorldIndex.
- [WEB_TERRAIN.md](WEB_TERRAIN.md): the baked land, the survey, the `terrain` flag.
- [WEB_BUILDING_LAB.md](WEB_BUILDING_LAB.md) and [WEB_OBSERVER.md](WEB_OBSERVER.md): the mounted tools.
- [WEB_ATLAS.md](WEB_ATLAS.md) (`data/atlas.js`, `ATLAS_XZ`): the sites and bases layers.
- [WEB_LOOK.md](WEB_LOOK.md) and the flora factory (`tools/blenderforge/gen_flora.py`, `web/src/world/flora.js`): the woods.
- `web/tools/import-usmap.mjs`: the usmap rows' source (Godot `game/data`), now carrying forge rows over.

## 7. Tuning knobs

| Knob | Where | Default | Changes |
|---|---|---|---|
| `forestPerHa` | brush.json knobs | 135 | stems per hectare at forest 1 (the grid cell) |
| `forestGamma` | 〃 | 1.15 | how fast stems thin as forest drops |
| `canopyDefault` | 〃 | 0.7 | canopy where none is painted (x forest) |
| `crownMin`, `crownMax` | 〃 | 0.62, 1.05 | canopy tree scale range (x the model's height) |
| `spread` | 〃 | oak 1.5, pine 1.12, cypress 1.3 | crown width over height per species |
| `shade` | 〃 | oak 0.8, pine 1, cypress 0.92 | how dark each species reads from above |
| `underShrubPerHa`, `brushPerHa` | 〃 | 110, 150 | undergrowth under a wood; the brush layer |
| `radGlowPerHa`, `radDrumPerHa`, `radDead` | 〃 | 1.6, 0.7, 0.85 | seeps, drum clusters, the share of trees dead in a hot zone |
| `tintForest`, `tintForestK`, `tintRad`, `tintRadK`, `moss` | 〃 | see file | ground and rock colour under paint |
| `palettes` | brush.json | per state | canopy and understory species, undergrowth colour |
| `SPECIES.<kind>.cap`, `.chunk` | `world/flora.js` | pine/oak 9000, 900; cypress 6000, 900 | world and per-chunk instance budgets |
| `RULES` | `forge/validate.js` | snap 70, townReach 1600, exitReach 200, exitOff 400, waterStep 125 | what the checks call a dead end, an orphan, a crossing |
| the shard port | `forge.html?shard=` | 3280 | the SHARD dot |

## 8. Acceptance criteria

- `/forge.html` opens on the game's dev server with every tab of the plan §3.2; MAP, BRUSH and TERRAIN edit or switch real
  rows and validate them with the engine's own code; BUILDING and OBSERVE mount the existing tools; TOWN, SITE, LIFE and
  VOICE say what they will edit and link their docs.
- `selftest` holds three forge checks, all green twice on fresh pages:
  1. **the forge boots** in a frame with all nine tabs, the MAP draws the rows, OBSERVE mounts the observer (`window.OBS`)
     and BUILDING the Lab (`window.LAB`);
  2. **MAP round trip:** a probe field set on a town street row (another tool's field), then `mapEdit` moves its last vertex
     40 world metres: the file has the vertex there, the probe field and every other field of the row, every other row of
     every collection and every top-level key byte-identical, the edit stamped for the importer; the game's live ribbon runs
     through the new point and the chunk there has a new hash, equal to a fresh sliced build; the file restored byte for
     byte gives the original hash back;
  3. **BRUSH stroke:** a forest stroke 7 km east of Phoenix takes a streamed chunk from its desert trees to at least 150
     more, with a new hash equal to a fresh sliced build, `brush x z` reading forest 1; a rad stroke lays seeps and drums
     and reads rad 1; the file restored gives the original hash back.
- Every forge action is a COMMANDS row (`forge`, `forgePatch`, `forgePush`, `mapEdit`, `mapCheck`, `brush`, `brushPaint`)
  and `docs/COMMANDS.md` is regenerated.
- Screenshots in `docs/renders/web/forge/`: MAP at the whole country and at a town, BRUSH before and after a stroke (and the
  game's camera on it), TERRAIN, BUILDING, OBSERVE, a planned card.
- `node tools/ip-lint.mjs` reports 0 deny.
