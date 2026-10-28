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

A ring resident who dies with family gets a funeral 1–2 game days later at their quarter's yard.
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
- **Drag:** beside a body, hold E (0.4 s). A tap still goes through the body. While you drag, you walk at 1.6 m/s; E lets go, G buries, F burns.
- **Dig:** 18 s with a shovel, ×3 with bare hands, shortened by Athletics. It makes an 18 m noise every 2 s, and walking away stops it. The result is an open grave (`holes`). Digging inside a cemetery's bounds belongs to that cemetery.
- **Bury:** puts a body into an open grave within 3 m. With no open grave, G digs one first. Burying writes a **grave row** `{ id, cem, x, z, name, flag, faction, died, buried, cause, by, buriedBy, marker, box, owner, stage, body }`, moves the box's contents into `grave:<n>` (digging it up again is grave robbing), adds a `buried` chronicle row, and puts a cross or headstone from your pack on the grave.
- **Burn:** uses one fuel can and takes 12 s. The fire chars the body and leaves an ash decal and bones; what the person carried drops to a ground pile. It writes a `pyre:` row and a `burned` chronicle row.
- **Mark:** `rites action=mark grave= kind=stone|cross`. At a funeral, G pays the stonecutter $40.
- **Crew deaths** (`crew.bury`) also write a grave row.

**Cemeteries** (`CEMETERY_KINDS`):

| kind | used by | where | layout |
|---|---|---|---|
| town_cemetery | towns | edge (outside the built ground, off its streets) | headstone rows, fence posts, sexton's box |
| boot_hill | walled, strip, crossroads, refinery and exit towns; Rust Haven | edge | crosses and mounds, sexton's box |
| site_plot | sites | on site (inside the footprint, off buildings) | rows |
| mass_grave | battle sites (`BATTLE_WORDS` in shape/notes/landmarks, or kind `fort`) | on site | trenches of 20, a cross post every 4 m |
| crypt | bunkers (kind `military`, stamp `bunker`) | on site | a concrete vault: floor, walls, plaque rows |
| family_plot | homesteads | the parcel's corner | rows, fence, sexton's box |
| war_graves | military bases | edge | crosses |
| lot_yard | Phoenix-ring quarters | the quarter's empty lot nearest its middle | rows fitted to the lot |

A cemetery's position is provisional until its place is built. On `citygen.stamp`, `rites.onBuilt` places it against the built boxes, the town's road rows, water at its corners, the corridors and the island grid.

**Funerals** (`FUNERAL`):
- Scheduled when a `family` household member dies and at least one other member is alive.
- The time is a seeded 24–48 h after the death, at 10:00, and lasts 2 h.
- The killer's standing with the household's faction drops by 8 when the funeral is scheduled.
- Mourners leave home when the walk (at 1.4 m/s) will get them to the grave by the start time.
- The first mourner fetches the body and drags it there if it lies more than 3 m from the grave.
- Within 18 m of the grave during the funeral you count as attending: +3 standing, and gloom on you.
- At the end, the body goes into the grave with a cross (a stone if one was paid for), and the yard's mood darkens. If the family is off the map (no member promoted within 400 m of you), the record tier does the same thing on the same clock.

## 4. Formulas (with a worked example)

`graves = max(6, ceil(pop × years_settled × 0.02 × (1 + danger)))`

- **pop:** a town's archetype `pop` midpoint; a site row's `society.pop` midpoint (or `POP.site[kind]`); rural `POP.rural[arch]` (a farmstead is 6); a base 40.
- **years_settled:** a town by archetype age (colonial 100, victorian 95, 1920s 85, postwar 70, sprawl 55); a site by kind (holdout 80, fort 90, trade 60, camp 12, station 45, ruin 100, military 100, industrial 50, landmark 70, farm 75); rural 40; then a seeded ±15% jitter per place.
- **danger:** a town is `damage × 0.6 + (1 − defense) × 0.4`; a site is its kind (ruin 0.5 … farm 0.15) plus 0.15 per hazard; rural 0.3; a base 0.5. Capped at 1.

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
- **A cemetery that won't fit:** the candidate search falls back to its first candidate, so it may overlap a street. Rust Haven's 292 graves don't fit inside the island grid (roads every 80 m), which is why its row is set outside it.
- **Places off the map** (30 site rows abroad, in Alaska or Hawaii, the Keys): no world record, so no cemetery until the map grows to them. The `beyond` records (199) do have theirs.

## 6. Dependencies (both ways)

**Rites reads:** `survival.airAt`, `water.depthAt`, `inventory` (boxes, place, roll, add), `citygen.plan/live/recAt`, `streamer.W` (groundAt, project, ring, holdouts), `residents` (recs, walk), `society` (day, chronicle, factions, director.radio), `skillsSys`, `fx`, `noise`.

**Shared-file hooks** (each one line or a few):

| file | hook |
|---|---|
| `src/main.js` | import + `this.rites = new Rites(this)`; `rites.input(I)` after `crew.input`; `rites.update(simDt)` after `gadgets.update`; `rites.onDeath(c, attacker, cause)` at the end of `onKill`; `rites.fold(c)` in `removeChar` for the dead; one comment line in `updatePopulation` |
| `src/agent/api.js` | import; `...ritesCommands(api, need)`; `await ritesChecks(...)` before `qolChecks`; `rites:` in the save; `g.rites.load` in restore before the crew |
| `src/systems/citygen.js` | `g.rites?.onBuilt(t)` in `stamp`, `g.rites?.onReleased(t)` in `release` |
| `src/systems/inventory.js` | `MAX_BODIES` prunes only searched-and-empty body boxes (`b.rolled &&`) |
| `src/systems/crew.js` | `g.rites?.graveFromCrew(...)` in `bury` |
| `src/systems/trade.js` | `keep`: the opening stock once, then deliveries; `restock`: returns unless `TRADE.law === 'mint'`; new `delivered()` |
| `src/data/trade.js` | `TRADE.law: 'delivery'` |
| `src/systems/residents.js` | `promote` skips `g.rites.gone(m)`; `think` calls `g.rites.mourn(c, dt)` before the far-keep-still line |
| `src/systems/grapevine.js` | `eat` hands the body to `rites.eaten` (bones, box kept) instead of deleting the box |
| `src/systems/characters.js` | `paint` lerps the dead toward `_rot` by `ch.rot` |

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

## 8. Acceptance criteria (the selftest checks; `node tools/dl.mjs selftest only=rites:`)

1. **rows valid + formula example:** `validateRites` is clean and the Silver Strip's graves equal 191. *Proves the rows a forge edits are checked and the formula is the one written here.*
2. **four stages on the clock:** a killed drifter goes fresh → bloated → rotting → bones as the game clock runs 260 h (mild air), still where it fell, its box unchanged, and its character removed at bones. *Proves decay is on the game clock and that nothing moves or loots a body.*
3. **heat faster than cold:** the same 12 h at 35 °C ages a body 18 h; at 0 °C it ages 6 h. *Proves the climate multipliers.*
4. **far body survives 2 km:** a body is left, you go 2 km away in 400 m teleport legs (the streamer pages), stay 100 s (past the 90 s fold), and come back. The record is there with the same box contents and is drawn by the rites mesh. *Proves the far fold replaced the delete.* (Teleport legs, not a drive: the fold doesn't care how you left.)
5. **cemetery for every place:** every one of the 305 plan records has a cemetery whose count equals the formula, of the right kind (bunker → crypt, battle → mass grave, rural → family plot). Every planned or beyond site row has one, and the history has that many graves with names, causes and years in range. *Proves "burial stuff everywhere in each one of those places".*
6. **burial writes a grave row:** drag, dig with a shovel (a `digStart`), bury. The row has who, when, how, by whom and a cross marker; the body's things are in the grave box; there is a `buried` chronicle row; the body is gone from the street.
7. **funeral and walking mourners:** a ring family member is killed and the funeral is 1–2 days out. The clock runs to just before they set out. A mourner walks more than 10 m on foot paths, with no frame-to-frame jump over 1.5 m, in the states `to the funeral` / `fetching the body` / `carrying the body` / `mourning`.
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
