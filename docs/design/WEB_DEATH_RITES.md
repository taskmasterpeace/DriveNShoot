# WEB_DEATH_RITES: bodies, cemeteries, burial and funerals

Lane DEATH-RITES (`feat/web-death-rites`), spec `WEB_DEPTH_PLAN.md` §6, laws §0.
Code: `web/src/systems/rites.js` (the system), `web/src/data/rites.js` (every number as rows, `validateRites`), `web/src/agent/rites-api.js` (the `rites` command and the selftest checks).

## 1. Overview

The dead stay dead and stay put.
A body is a record that ages on the game clock through four stages (fresh, bloated, rotting, bones).
Near you it is the dead character itself; out of view it folds into a record that one instanced mesh draws.
Nothing deletes it. Only three things move it: a burial, a fire, or someone dragging it.
Its box (`body:<id>`) keeps exactly what the person had on them. A buried body takes those things into its grave's box.

Every place the world plans has a cemetery: all 305 citygen plan records (towns, homesteads, and the 232 site rows placed in or beyond the streamed world), the island town (Rust Haven's boot hill), the Florida holdout, and one yard per Phoenix-ring quarter.
Each one is sized by one formula.
Its old graves are a seeded history: names, birth and death years, causes, and a battle year for a mass grave.

A ring resident who dies with family gets a funeral 1–2 game days after **their people learn of it**.
Under law 6 (NPCs only know what they were told), the death is news that nobody holds until a sourced fact reaches them.
The funeral is at their quarter's yard.
One of the family fetches the body and drags it there. The others walk there on foot paths (no teleport), stand at the grave, and go home.
Standing toward the killer drops. Attending, digging the grave and paying for a stone each raise it.
STATIC 1660 announces the funeral, and the chronicle records it.

## 2. Player fantasy

You come back to the gas station where you shot two raiders yesterday.
They are still there, swollen now, with flies over them, and the infected are drifting in on the smell.
Your rifle rounds are still in the one by the pump, because nobody took them.
You drag your friend off the road, dig with the shovel from the sexton's box at the edge of town (eighteen loud seconds; every infected in earshot hears it), and put the cross you carried on the grave.
Out in the ring, the family whose son you killed buries him tomorrow at ten. You can stand at the back. They will see you.

## 3. Detailed rules

**Body stages** (`DECAY.stages`, decay hours = game hours × climate):

| stage | starts | look | smell | flies | sickness/min of handling |
|---|---|---|---|---|---|
| fresh | 0 | the dead character; clothes tinted toward old blood | 0 | 0 | 0 |
| bloated | 24 | tint toward green-grey, the folded torso swells ×1.45 | 30 m | 6 | 12% / 60 |
| rotting | 72 | dark brown, swell ×1.15 | 42 m | 9 | 25% / 60 |
| bones | 240 | a bone pile: skull, ribs, long bones (the character is removed) | 0 | 0 | 0 |

- **Climate:** air ≥ 30 °C ×1.5, ≤ 5 °C ×0.5, otherwise ×1. The air comes from `survival.airAt` for each hour that passed, so a clock jump (a sleep, `rites action=wait`) ages a body by the weather of every hour it skipped. A body in water (depth > 0.15 m) also gets ×1.3.
- **Smell:** every 2 s, a bloated or rotting body within 220 m of you pulls any infected inside its smell radius that has no target of its own (`c.wx/wz`, the same pull a lure uses). Flies swarm the 12 nearest smelling bodies.
- **Sickness:** handling a bloated or rotting body (its box open, dragging it, digging for it) can give you the grave sickness (`SICKNESS.grave_sickness`, 14 h: stamina, thirst and hunger costs). The chance is checked once per second.
- **Far fold:** the old 90 s delete now *folds* the body. `main.removeChar` of a dead character hands it to `rites.fold`. The record keeps x, z, y, facing, clothes colours, stage and box. A ring resident's folded body is marked `m.gone`, so the household never promotes it again; rites draws it instead.
- **Cap:** at most 400 flesh records. Past that, the oldest records more than 70 m from you skip straight to bones, and each one emits `bodyDegraded`. Bones are never forgotten; only the nearest 140 are drawn.
- **The grapevine eats a body:** it becomes bones (`rites.eaten`), and its box stays. Before this lane, the box was deleted along with the loot.
- **Drag:** beside a body, hold E (0.4 s). A tap still goes through the body. While you drag, you walk at 1.6 m/s; E lets go, G buries, F burns. The hold is the body's only when nothing else claims E: no door or window in reach, no interiors hold ring, no downed crew member, and the nearest box is the body's own. Otherwise boarding a window next to a corpse started a drag, the arms read "hands busy", and the gun stopped aiming. A drag lets go if the body ends up more than 4 m from whoever holds it (a car, a fall, a teleport).
- **Dig:** 18 s with a shovel, ×3 with bare hands, shortened by Athletics. It makes an 18 m noise every 2 s, and walking away stops it. The result is an open grave (`holes`). Digging inside a cemetery's bounds belongs to that cemetery.
- **Bury:** puts a body into an open grave within 3 m. With no open grave, G digs one first. Burying writes a **grave row** `{ id, cem, x, z, name, flag, faction, died, buried, cause, by, buriedBy, marker, box, owner, stage, body }`, moves the box's contents into `grave:<n>` (digging it up again is grave robbing), adds a `buried` chronicle row, and puts a cross or headstone from your pack on the grave.
- **Burn:** uses one fuel can and takes 12 s. The fire chars the body and leaves an ash decal and bones; what the person carried drops to a ground pile. It writes a `pyre:` row and a `burned` chronicle row.
- **Mark:** `rites action=mark grave= kind=stone|cross`. At a funeral, G pays the stonecutter $40.
- **Crew deaths** (`crew.bury`) also write a grave row.

**Cemeteries** (`CEMETERY_KINDS`):

| kind | used by | where | layout |
|---|---|---|---|
| town_cemetery | towns | edge (outside the built ground, off its streets) | sections of family plots, a low stone wall with gate piers and an iron arch, two trees, sexton's box |
| boot_hill | walled, strip, crossroads, refinery and exit towns; Rust Haven | edge | crosses, cairns and mounds, a post-and-rail fence, a tree, sexton's box |
| site_plot | sites | on site (inside the footprint, off buildings) | rows, a rail fence |
| mass_grave | battle sites (`BATTLE_WORDS` in shape/notes/landmarks, or kind `fort`) | on site | trenches of 20, a cross post every 4 m, a wire fence |
| crypt | bunkers (kind `military`, stamp `bunker`) | on site | a concrete vault: floor, walls, plaque rows |
| family_plot | homesteads | the parcel's corner | rows, a picket fence, a tree, sexton's box |
| war_graves | military bases | edge | crosses in uniform plots (no family names), an iron railing |
| lot_yard | Phoenix-ring quarters | the quarter's empty lot nearest its middle | rows across the lot's full width with a 1 m margin, so it stays inside the lot (28 × 20 m in a 28.5 × 20 m lot), a wire fence |

A cemetery's position is provisional until its place is built.
**Placement score:** a candidate footprint (both orientations) is sampled at 7 × 7 points, and every point on a building (the live towns' 8 m box grid), a street (town road rows, the island's 80 m grid, within 24 m of a corridor), water or a ring lot counts against it. The lowest score wins (`clash` in the view; 0 is clear ground).
- Candidates for a town ring its edge.
- A site tries its own blocks, and falls back outside its walls when it is built solid (the Coquina Star's mass grave lies by the shore past its fort).
- Edge and plot cemeteries follow the land: every mound, marker and post stands on the ground under it, and the long flat pieces (mounds, path runs, wall runs) tilt with the slope (`tilt()`: pitch and roll from the ground at their ends) instead of stepping down it. A site's yard lies on its pad. On `citygen.stamp`, `rites.onBuilt` places it against the built boxes, the town's road rows, its own wall or fence line, water at its corners, the corridors and the island grid.
- Rock counts against a candidate too: the chunk generator's mesas, buttes and ridges near the place (`mesasOf`, pure), sampled with their lobed outline. On the island, its own scatter (cacti, dead trees, junk: `statics.boxes`) counts box by box, because the 7 × 7 samples step over a cactus.

**The keep-out** (the follow-up from the first renders, where a boulder sat on the graves):
- A placed cemetery goes into `rites.keep` (64 m cells), and `rites.solid(x, z, r)` answers the chunk generator's `blocked()`: inside the wall plus `CEM_LAYOUT.keep` = 4 m, no rock, scrub, cactus or tree is scattered.
- When a cemetery is placed, the chunks already laid out under it that have scatter on its ground (`scatterIn`) are evicted and laid out again (the settlement pad's rule in `citygen.stamp`), so the scatter comes back off it. `cem.relaid` counts them. A chunk with nothing there is left alone, and a ring lot yard never evicts: its neighbours' walls and planting crowd the keep-out ring, and evicting the ring's chunks as a car drives past was a cross stall (the streaming check caught it).
- The island is built once at boot (its RNG is pinned by the golden hash), so Rust Haven's yard is placed clear of the island's scatter rather than clearing it.

**The yard's layout** (`lay()`, pure from the seed and the count; rows in `CEM_LAYOUT`; kinds with `layout: 'rows'`):
- The count stays the formula's. Room for new graves past it: `spare` = clamp(⌈count × 0.25⌉, 6, 24).
- Graves go in **family plots** of 2–5 with a 0.7 m gap between plots. Each plot is one family: its graves carry one surname (`r.family`), and its **means** (poor 40% / middling 45% / rich 15%) pick its markers: a poor plot's are mostly wood crosses, cairns and bare mounds, a rich plot's stones and iron crosses, and 60% of rich plots get a low stone kerb.
- Plots run in rows across a **section** of at most `secW` × `secD` = 26 × 22 m. A big cemetery is split into sections, two columns either side of a **main path** from the gate, with **cross paths** between section rows. The rows are shared evenly over the sections, so none is left half empty. A small one is one section sized to it.
- Each section turns a little (±0.06 rad) and its rows bend with the land (0.7 m over 18 m); each grave lies with its row.
- Sections fill from the back, oldest first, so the spare slots (the next burials, the funerals' graves) are by the gate.
- **Markers:** stone (three sizes and shades, some leaning), wood cross, cairn (field stones heaped at the head), iron cross (half with a low railing round the grave), or a bare mound. The older the grave, the lower and paler its mound; past `sunk` = 40 years a third of the oldest have sunk to a hollow, and `fall` = 14% of old markers are down (a stone flat at the head, a cross in the grass).
- **The wall** (`CEMETERY_KINDS[].wall`): a low dry-stone wall, post and rail, picket, iron railing or wire, in short runs that follow the land. One **gate** in the middle of the side facing the place: two posts (a stone wall's are piers), an iron arch over a stone or iron one, one leaf swung in.
- **Trees** (`trees`, 0–3): at the corners just outside the wall, inside the keep-out ring. A desert yard's are low and sparse.

**What the living know** (law 6, `WEB_DEPTH_PLAN.md` §0):
- A family death is **news** (`R.news`).
- Every fact carries `{ source, who, at, killer }`, and its age is `now − at`.
- A family member learns of the death in one of four ways:
  - **saw it happen:** they are in the kill deed's witness list (`chronicle.w`). Only this source names the killer, and only if the deed is identified.
  - **saw the body:** a promoted member within 25 m with line of sight.
  - **found at home:** the body lies in their own house (±6 m) half an hour on, whether or not anyone is promoted.
  - **told by a witness:** a non-family witness of the killing carries word after `FUNERAL.toldAfter` = 2 game hours, naming the killer if the deed identified them.
- **Told by you:** `rites action=report id=`, standing within 4 m of one of them.
- No fact means no funeral (`summary.unreported` lists those deaths).
- The killer's standing drops (−8 with the household's faction) only on a fact whose `killer` is the player.
- STATIC 1660 announces only funerals that are planned.

**Funerals** (`FUNERAL`):
- Scheduled at the first fact about a `family` member's death, if at least one other member is alive.
- The time is a seeded 24–48 h after **learning**, at 10:00, and lasts 2 h.
- Mourners leave home when the walk (at 1.4 m/s) will get them to the grave by the start time. The carrier's lead time also counts walking to the body and dragging it back at 0.8× speed.
- The first mourner fetches the body and drags it there if it lies more than 3 m from the grave. A funeral waits up to `FUNERAL.wait` = 2 h past its end for a body that is being carried in.
- Within 18 m of the grave during the funeral you count as attending: +3 standing, and gloom on you.
- At the end, the body goes into the grave with a cross (a stone if one was paid for), and the yard's mood darkens. If the family is off the map (no member promoted within 400 m of you), the record tier does the same thing on the same clock.

## 4. Formulas (with a worked example)

`graves = max(6, ceil(pop × years_settled × 0.02 × (1 + danger)))`

- **pop:** a town's archetype `pop` midpoint; a site row's `society.pop` midpoint (or `POP.site[kind]`); rural `POP.rural[arch]` (a farmstead is 6); a base 40.
- **years_settled:** a town by archetype age (colonial 100, victorian 95, 1920s 85, postwar 70, sprawl 55); a site by kind (holdout 80, fort 90, trade 60, camp 12, station 45, ruin 100, military 100, industrial 50, landmark 70, farm 75); rural 40; then a seeded ±15% jitter per place.
- **danger:** a town is `damage × 0.6 + (1 − defense) × 0.4`; a site is its kind (ruin 0.5 … farm 0.15) plus 0.15 per hazard; rural 0.3; a base 0.5. Capped at 1.

**The yard's size** (`lay()`): with `n` = count + spare, spacing `sx` × `sz` m (`CEMETERY_KINDS[].sp`):
- area = n × sx × sz × 1.25 (the plot gaps and kerbs). If area ≤ secW × secD (572 m²), one section of width max(3·sx + gap, √area); else sections of secW, two columns when they fit, rows per section = ⌈total rows ÷ sections⌉.
- w = cols × secW + (cols − 1) × mainPath + 2 × margin; d = R × depth + (R − 1) × path + 2 × margin + path (the apron inside the gate), with R = ⌈sections ÷ cols⌉ and depth = rows × sz.
- Worked example, the COURTHOUSE-SQUARE COUNTY SEAT (206 graves, town_cemetery 2.2 × 3.0 m): spare = 24 (52 capped), n = 230, area = 1898 m² > 572, so sections of 26 m, two columns; 4 sections of 6 rows (depth 18 m); w = 2 × 26 + 3.2 + 3.6 = 58.8 m, d = 2 × 18 + 2.4 + 3.6 + 2.4 = 44.4 m. A 14-grave family plot: spare 6, n = 20, one section, 15.0 × 16.4 m.

**Worked example: THE SILVER STRIP** (site `tombstone-allen-st`, a holdout).
- pop [60, 110] → 85.
- years: holdout 80, before jitter.
- danger: holdout 0.25 + one hazard (dust storm) 0.15 = 0.4.
- graves = ceil(85 × 80 × 0.02 × 1.4) = ceil(190.4) = **191**.

Rust Haven (fixed row): ceil(120 × 90 × 0.02 × 1.35) = **292**, on a boot hill 47 × 45 m in the south-west Glass Flats.

**Layout size:** `cols = ceil(√(n × along/across))`, `rows = ceil(n/cols)`, with n = graves + 24 (room for new ones). Width = cols × across + 3; depth = rows × along + 3.

**Decay:** `decay += Σ_hours climate(hour) × (wet ? 1.3 : 1)`. The stage is the last one whose `at` ≤ decay.

## 5. Edge cases

- **Loading a save:** records come back folded, and an unsearched body's box is placed again with its seed (the inventory save holds only touched boxes), so the loot is the same. Dead characters recreated by `restore` relink by id.
- **Ring residents re-promoted:** a dead member who promotes as a character again relinks to its record (by member key) and keeps its tint. Once folded, it never promotes again (`m.gone`).
- **Bones while you watch:** the character is removed and the bone pile drawn, unless someone is dragging it.
- **Dragging bones:** refused ("bury them where they lie").
- **Two draggers:** one drag slot. A mourner who needs the body waits while you hold it.
- **Funeral for a body you already buried:** it is held at the grave. A paid stone goes onto your grave row.
- **Burned before the funeral:** the family still gathers. No burial happens, and the mood still darkens.
- **The infected's bodies:** have records (they rot and smell) but no box (they never had loot).
- **Named NPCs** (`c.npc`): out of scope. They are downed, not dead (`combat.kill` keeps them).
- **A cemetery on a mesa or a fence:** the mesa's outline and the place's own wall line count against the footprint, so it moves off them (the county seat's larger yard is kept off the 65 m mesa beside it; the trailer park's family plot moved off its chainlink).
- **A chunk under the player when a cemetery is placed:** it is evicted and laid out again like any LRU eviction (a `teleport` stall at worst); pinned chunks are left alone.
- **Graves past the slots:** a grave beyond the last slot isn't drawn (the spare room is 6–24 graves; the funeral spot clamps to the last slot).
- **A cemetery that won't fit:** the candidate search falls back to its first candidate, so it may overlap a street. Rust Haven's 292 graves don't fit inside the island grid (roads every 80 m), which is why its row is set outside it.
- **Places off the map** (30 site rows abroad, in Alaska or Hawaii, the Keys): no world record, so no cemetery until the map grows to them. The `beyond` records (199) do have theirs.

**Renders** (`docs/renders/web/death-rites/`, game camera):
- 01 a fresh body
- 02 bloated, still the character (tinted, flies)
- 03 bloated and folded (swollen, blood-soaked)
- 04 rotting
- 05 bones
- 06 a county seat's cemetery at the town's edge: four sections either side of a main path, family plots, the stone wall and gate, two trees outside the corners (06b: before, one rigid grid with a boulder on the graves)
- 07 the same at the gate from a low game camera: piers, iron arch, a leaf swung in, kerbed and railed plots, mixed markers (07b: before)
- 08 the Coquina Star's mass grave in trenches outside the fort
- 09 a funeral (two of the Balogun family kneel at the grave the body was dragged to; the smear runs back to the house)
- 10 the same ring lot yard
- 11 a boot hill: rows bending with the land, cairns, a post-and-rail fence
- 12 a trailer park's family plot: a picket fence, off the park's chainlink
- 13 Rust Haven's boot hill (292 graves, five sections), clear of the island's cacti
- 14 a burial ground on a site's pad (two sections, wire fence)
- 15 a rich family's kerbed plot, close

**Known look issues (follow-ups):**
- Markers stand upright on a slope (right for a headstone); a kerb's four sides each sit at their own ground height.
- The mass grave's trench layout is unchanged (only its wire fence is new).
- The funeral spot is chosen when the funeral is planned, so the grave row can land a few slots along.

## 6. Dependencies (both ways)

**Rites reads:** `survival.airAt`, `water.depthAt`, `inventory` (boxes, place, roll, add), `citygen.plan/live/recAt`, `streamer.W` (groundAt, project, ring, holdouts), `residents` (recs, walk), `society` (day, chronicle, factions, director.radio), `skillsSys`, `fx`, `noise`.

**Shared-file hooks** (each one line or a few):

| file | hook |
|---|---|
| `src/main.js` | import + `this.rites = new Rites(this)`; `rites.input(I)` after `crew.input`; `rites.update(simDt)` after `gadgets.update`; `rites.onDeath(c, attacker, cause)` at the end of `onKill`; `rites.fold(c)` in `removeChar` for the dead; one comment line in `updatePopulation` |
| `src/agent/api.js` | import; `...ritesCommands(api, need)`; `await ritesChecks(...)` last of the systems' checks; `rites:` in the save; `g.rites.load` in restore before the crew |
| `src/systems/citygen.js` | `g.rites?.onBuilt(t)` in `stamp`, `g.rites?.onReleased(t)` in `release` |
| `src/systems/inventory.js` | `MAX_BODIES` prunes only searched-and-empty body boxes (`b.rolled &&`) |
| `src/systems/crew.js` | `g.rites?.graveFromCrew(...)` in `bury` |
| `src/systems/trade.js` | `keep`: the opening stock once, then deliveries; `restock`: returns unless `TRADE.law === 'mint'`; new `delivered()` |
| `src/data/trade.js` | `TRADE.law: 'delivery'` |
| `src/systems/residents.js` | `promote` skips `g.rites.gone(m)` (bones, buried, burned: a folded body still comes back as the household's own character); `think` calls `g.rites.mourn(c, dt)` before the far-keep-still line |
| `src/systems/grapevine.js` | `eat` hands the body to `rites.eaten` (bones, box kept) instead of deleting the box |
| `src/systems/characters.js` | `paint` lerps the dead toward `_rot` by `ch.rot` |
| `src/world/chunkgen.js` | `blocked()`: `if (W.rites?.solid(x, z, r)) return true;` (one line, after the roadside's) |

**Rites reads (layout):** `world/chunkgen.js` `mesasOf`, `mesaNorm`, `MESA_REACH` (pure), `streamer.layouts/pinned/evict`, `statics.boxes` (the island's), `citygen.live[].T.wall`. **Chunkgen reads rites:** `W.rites.solid` (set in the Rites constructor, like `W.citygen`).

**PULLS (WEB_PULLS.md) carries rites' news:** `learn` ends with `g.pulls?.deathNews?.(R, fact)`, which puts what the household learned into the knowledge model (their town's talk, the grapevine, the funeral as word and on the town's set). Rites stays the one place that decides who knows a death and when.

**PULLS (WEB_PULLS.md) uses rites:** a pull's dead (a caller who bled out, a wreck's driver, a robber you shot) go on the rites' clock through `rites.onDeath` (dated to when they died off screen); pulls never makes that character again once `rites.bodies` holds it, and reads a folded body's spot from the record so it can still be found.

**Others read rites:** the observer events (`bodyStage`, `bodyDegraded`, `buried`, `bodyBurned`, `funeralScheduled/Started/Done`, `mournerArrived`, `graveSickness`, `delivered`), and the chronicle verbs `buried`, `burned`, `funeral`.

**Multiplayer (shard shape):**
- Body records, grave rows, holes, funerals and moods are world state and belong to the shard; `rites.save()` is that unit.
- A grave row's `owner` is the cemetery's place, or `player` for crew graves. A grave box is owned by nobody, so opening it is a theft or desecration deed (wave 2: that deed verb).
- Who buried someone is recorded in `buriedBy` (`player` should become the player id on the shard).
- Pre-seeded history is never saved: it is pure from the seed, so every client sees the same graves.

## 7. Tuning knobs (safe ranges)

| row | default | safe range | effect |
|---|---|---|---|
| `DECAY.stages[].at` | 24 / 72 / 240 | ×0.5–×2 | how fast the dead go |
| `DECAY.heat / coldMul / water` | 1.5 / 0.5 / 1.3 | 1.2–2 / 0.25–0.8 / 1.1–1.6 | climate pull |
| `DECAY.stages[].smell` | 30 / 42 | 15–60 m | how far the infected come |
| `BODY_FOLD.cap` | 400 | 200–800 | flesh records before the oldest skip to bones |
| `BODY_FOLD.drawMax` | 140 | 60–200 | folded bodies drawn (6 boxes each) |
| `FORMULA.rate` | 0.02 | 0.01–0.04 | graves per person-year |
| `FORMULA.min` | 6 | 3–12 | the smallest plot |
| `YEARS.*`, `DANGER.*`, `POP.*` | as above | ±50% | a place's history |
| `BURIAL.dig / handMul / noise` | 18 s / ×3 / 18 m | 8–40 s / 2–5 / 10–30 m | the cost of a burial |
| `BURIAL.stoneCost` | $40 | 20–100 | a stone at a funeral |
| `FUNERAL.delay` | 24–48 h | must stay within 24–48 (the validator) | when |
| `FUNERAL.standing` | −8 / +3 / +4 / +6 | ±15 | what the town thinks |
| `CEM_LAYOUT.secW / secD` | 26 / 22 m | 14–40 / 12–30 | the width cap of a section; smaller = more sections and paths |
| `CEM_LAYOUT.plot / plotGap` | 2–5 / 0.7 m | 1–8 / 0.3–1.5 | family plot size and the gap between them |
| `CEM_LAYOUT.bend / turn` | 0.7 m / 0.06 rad | 0–1.5 / 0–0.15 | how far rows wave and sections turn (0 = a rigid grid) |
| `CEM_LAYOUT.keep` | 4 m | 2–10 | scatter-free ring round the wall |
| `CEM_LAYOUT.spare` | 6 / 24 / 0.25 | min 3–12, max 12–48 | room for new graves |
| `CEM_LAYOUT.wealth.share` | 0.4 / 0.45 / 0.15 | sums to 1 (the validator) | poor / middling / rich plots |
| `CEM_LAYOUT.sunk / fall` | 40 yr / 0.14 | 20–80 / 0–0.3 | how worn the old graves look |
| `CEMETERY_KINDS[].wall / trees` | per kind | stone, rail, picket, iron, wire / 0–3 (the validator) | the look of the edge |

## 8. Acceptance criteria (the selftest checks; `node tools/dl.mjs selftest only=rites:`)

1. **rows valid + formula example:** `validateRites` is clean and the Silver Strip's graves equal 191. *Proves the rows a forge edits are checked and the formula is the one written here.*
2. **four stages on the clock:** a killed drifter goes fresh → bloated → rotting → bones as the game clock runs 260 h (mild air), still where it fell, its box unchanged, and its character removed at bones. *Proves decay is on the game clock and that nothing moves or loots a body.*
3. **heat faster than cold:** the same 12 h at 35 °C ages a body 18 h; at 0 °C it ages 6 h. *Proves the climate multipliers.*
4. **far body survives 2 km:** a body is left, you go 2 km away in 400 m teleport legs (the streamer pages), stay 100 s (past the 90 s fold), and come back. The record is there with the same box contents and is drawn by the rites mesh. *Proves the far fold replaced the delete.* (Teleport legs, not a drive: the fold doesn't care how you left.)
5. **cemetery for every place:** every one of the 305 plan records has a cemetery whose count equals the formula, of the right kind (bunker → crypt, battle → mass grave, rural → family plot). Every planned or beyond site row has one, and the history has that many graves with names, causes and years in range. *Proves "burial stuff everywhere in each one of those places".*
5b. **a yard laid out like one, the wild kept off:** at the county seat (206 graves): no chunk-scatter instance or static box (rock, scrub, cactus, tree) inside the wall plus the keep-out; `rites.solid` answers inside and not outside; at least 2 sections, none wider than `secW`, a main path from the front; plots of 1–5 (most 2+), each plot one family's surname, never two; stone, wood, cairn and iron all present; rich plots carry stone or iron at least 0.3 more often than poor ones; it is drawn with its stone wall and two trees; the count still equals the formula. *Proves the boulder fix and the broken-up layout.*
6. **burial writes a grave row:** drag, dig with a shovel (a `digStart`), bury. The row has who, when, how, by whom and a cross marker; the body's things are in the grave box; there is a `buried` chronicle row; the body is gone from the street.
7. **law 6 + funeral + walking mourners:**
   - A ring family member is staged 150 m from home with nobody watching and killed. After 3 game hours there is no funeral, and the death is in `unreported`.
   - You walk to one of the family and `report`. The funeral is planned 1–2 days out, with `learned.source === 'told by you'`.
   - The clock runs to just before they set out. A mourner walks more than 10 m on foot paths, with no frame-to-frame jump over 1.5 m, in the states `to the funeral` / `fetching the body` / `carrying the body` / `mourning`.
   - The world is saved before and loaded after, so a reused page's ring checks find the household whole.
8. **no container refills over 3 game days:** Ike's shelf with the pistol rounds sold out, his keeps, and a searched crate are all the same or emptier after 3 days of looks; a courier delivery is the one way 12 rounds come back.

**Loot law audit** (`rites action=law`, rows `LOOT_LAW`):

| path | before | now |
|---|---|---|
| trader `restock` | a new roll every game day | **gated**: only `TRADE.law === 'mint'` rolls; normally nothing |
| trader `keep` (Ike's rounds) | topped up every day | **gated**: the opening stock once, then only `rites.deliver(...)` goods |
| world containers | rolled once | unchanged (never refilled) |
| the dead's boxes | deleted (MAX_BODIES on "empty" unsearched boxes, the 90 s delete, the grapevine) | **gated**: kept; buried into a grave box; burned onto the ground |
| island pickups | placed once | unchanged |
| foraging regrowth, rain catchers, water/fuel at a source, RV tanks | — | **allowed** by the law |
| the mechanic's "refill the guns and droppers" | paid, rounds from nowhere | **TODO** (COURIER lane: from his own shelves) |
| dialogue `give:{ammo,weapon}` rewards | minted | **TODO** (rewards from the giver's own boxes) |

Nothing calls `rites.deliver()` yet except the check. A visible courier or caravan that carries goods from a producing site is wave-2 work (SITE-STORIES). Until it lands, traders run down. That is the law working, not a bug.
