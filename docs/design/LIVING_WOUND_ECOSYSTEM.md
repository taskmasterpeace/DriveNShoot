# LIVING WOUND ECOSYSTEM — the land answers back

**Status:** GREENLIT design spec (owner directive 2026-07-08, voice): *"make a spec sheet with an
ecosystem… everything for game implementation and MAX FUN… where do rodents live and such… look at
the game and refine where needed… do it in PHASES 1/2/3 since the map isn't really populated yet."*
**Builds on / reuses (no reinvention):** `population.gd` (the 500 m cell ledger — dormant, wired here),
`world_stream.gd` (chunk streaming + spawn-on-approach), `usmap.gd` (biome/state/road lookups),
`bandits.gd` (the WATCH→STALK→STRIKE director + strength-in-threshold balance law), `howler.gd` (pack
roles: circler/charger/screamer, ripple, scream, vision-cone circling, `noises_in` hunting), `gator.gd`
(ambush→lunge→recover apex skeleton + `corpse_pending`), `corpse.gd` (the corpse group + decay), the
noise bus (`emit_noise`/`noises_in`), `world_state.gd` (`run_offline_catchup`, deterministic + bounded),
`metaworld.gd` (off-screen raid records), `respect.gd` (lazy float-bag ledger pattern), `radio.gd`
(bulletins), `dog.gd` (bond/record/grudge pattern), `weather.gd`/`daynight.gd` (`vision_mult`),
`audio.gd` (two-tier SFX: SoundForge mp3 overrides synth fallback — **a new sound id needs only a file,
never engine code**; `play_at` positional one-shots, `attach_loop`/`attach_flat_loop` beds, `play_count`
sim hook), `tools/soundforge/` (`generate.mjs` ElevenLabs SFX + `voices.mjs` TTS in the 4 LOCKED voices).
**Core law:** *If the land is healthy, predators stay wild. If the land is starving, the roads become meat.*
**One-line identity:** the world is a **pressure system** of ~10 invisible per-sector floats; when the
player enters a sector the game realizes visible creatures **from those numbers**, and everything the
player does to the land (hunt, burn, leave bodies, clear a den, bait a pack) writes back into the floats —
so the land changes, and the change comes back down the road at him. UO-style ecology feel, no
impossible per-animal sim.

> **This doc reconciles five design facets and two adversarial critique passes.** Section 0 records the
> hard architecture decisions that resolve the cross-facet contradictions (single ledger owner, one
> director, one `class_name` per file, one `corpse.heat` unit, budgeted per-sector spawns, an *enforced*
> warning contract). Everything after Section 0 assumes those decisions.

---

## 0. Architecture decisions (reconciled — read first)

These resolve the blockers the review surfaced. They are binding; the facet write-ups below conform to them.

| # | Decision | Why | Resolves |
|---|---|---|---|
| **0.1** | **One float owner: `ProtoPopulation` cell `row["eco"]`.** Every per-sector float, `warn_mask`, and `_last_h` live in one sub-dictionary on the existing 500 m population cell. There is **no** `world_state.sector_ecology` and **no** separate ledger node. All systems read `population.cell_at(pos)["eco"]`. | The cell already keys the 500 m grid (`usmap.cell_of`), already has `serialize()/restore()` (`population.gd:402-409`), and co-locates biome/faction/`current_pop`. | Three facets had picked three different in-memory homes → silent drift. |
| **0.2** | **One director: `ProtoEcology` (`ecosystem.gd`).** A single `bandits.gd`-style node owns the hourly float tick, the nest state machine + targeting + hunt dispatch, and bird/clue coordination. It ticks floats on the **existing game-hour boundary** (`proto3d.gd:4012-4017`, beside `hunger_tick`), **not** per-frame; live group sweeps (`corpse`, `noises_in`) are throttled to every N frames. Spawned **actors** (Knifeback, grazer, vulture marker) keep their own `_physics_process` like `gator`/`howler` — that is per-actor, not a third director. | Three separate per-frame bandit-copies tripled director cost and raced each other. | Perf + the triple-director scope blowup. |
| **0.3** | **One `class_name` per file (the manifest, §11).** `ecosystem.gd`→`ProtoEcology` (director + static row dicts), `creature.gd`→`ProtoCreature` (all grazers/rodents/scavengers), `knifeback.gd`→`ProtoKnifeback` (apex), `bird_sign.gd`→`ProtoBirdSign` (bird marker), `nest.gd`→`ProtoNest` (Phase-2 extraction of the 6-state machine). No duplicate class names. | GDScript treats a duplicate `class_name` as a project-wide parse error — the game won't boot. | `ProtoEcology`×2, `knifeback.gd`×2, grazer/vulture triplication. |
| **0.4** | **Wildlife counts ride `population.current_pop` as new GROUPS `grazer`/`rodent`.** The **float** (`grazer_pop` 0..1) is ecology state in `row["eco"]`; the **realized actor count** is budgeted through `materialize_budget`/`safe_to_spawn`/`current_pop` so the per-500 m-sector cap holds across the ~16 chunks in a sector. Apex + pack actors are bespoke but still `safe_to_spawn`-gated. | Hooking realization per-128 m-chunk with no cross-chunk budget spawned up to 16× the herd and filled a 49-chunk RING in one frame. | Herd multiplication + fresh-arrival frame hitch. |
| **0.5** | **`corpse.heat ∈ [0,1]` per body, one definition (§4 F-CORPSE).** Sector `corpse_heat = clamp(Σ body.heat / CORPSE_HEAT_NORM, 0, 1)`, `CORPSE_HEAT_NORM = 3.0` (3 fresh bodies saturate a sector). All consumers (nest hunger, bird flock, human-gate) cite this one unit. | Three facets defined three incompatible ranges ([0,1], [0,1.6], [0,~8.6]) → mis-tuned everything downstream. | corpse.heat unit collision. |
| **0.6** | **The WARNING CONTRACT is enforced in the nest gate.** `human_predation_open()` has a mandatory precondition `warn_count ≥ MIN_WARNINGS`; if unmet, the strike **defers** and the director force-spawns the top un-shown clue. `warn_mask` lives in `row["eco"]`. | One facet asserted the contract; the nest facet's gate never read it → the exact cheap no-warning ambushes the design forbids. | Unenforced "ignore five warnings, not ambush with none." |
| **0.7** | **Save: one added path, no `SAVE_VERSION` bump.** `data["population"] = population.serialize()` (the eco floats ride inside each cell for free); `apply_save` restores via `.get("population", {})`. On restore, set every cell's `eco["_last_h"] = _now_h()` so the first live `dt ≈ 0` (never a whole-game-age catch-up). `_last_h` is bookkeeping, not gospel. | The dormant ledger's own TODO (`population.gd:397-401`); avoids a load-time saturation bug. | `_last_h` serialize contradiction. |
| **0.8** | **Offline advance is a PURE function** `population.advance_offline_day(seed_base, day, digest)`, called **inside** `run_offline_catchup`'s day loop (`world_state.gd:144`), seeded `hash("ecology:%s:%d" % [sid, base_day+day+1])` (absolute game-day). It mutates floats + appends digest strings only — **never** routed through `events.roll_daily` (which spawns caravans/audio). | Determinism + the "never spawns/plays offline" fairness law; avoids the pre-existing `roll_daily` offline side-effect (flagged for a separate fix). | Offline seed inconsistency + caravan spam. |
| **0.9** | **One HUD warning owner.** `hud.set_threat` becomes a **priority/owner stack** (each writer registers `text+priority+ttl`; HUD renders the top, or two stacked lines). Precedence: **imminent apex strike > checkpoint (bandit) > drone-shadow > nest territory > NO-BIRDS**. `toast()` gets a small **queue**. | `set_threat` is one shared Label the bandit director rebuilds every tick — it silently blanks/overwrites every ecology tell; `toast()` overwrites with no queue. | The must-not-miss reads losing a race; toast clobber. |
| **0.10** | **Audio is presentation; the noise bus is simulation — one-way, forever.** `emit_noise` is the sim event predators react to; `audio.play_at` is what the player hears. A creature row may **pair** them (its `sfx` entry carries an optional `pair_noise:{r,kind}` so one row line produces both the sound and the signal), but playing audio NEVER creates a sim signal by itself, and predators NEVER read `AudioServer` state. Predator calls (howls, the Knifeback screech) are audio-only — the predator talking, not a signal. | Coupling them either lets sounds hunt the player (feedback loops) or forces every SFX through the ring buffer. `play_at`'s `max_distance 90` already mirrors `max_noise_m = 90` — what the sim can hear, the player can hear, by convention not by wiring. | A whole class of audio↔AI feedback bugs, pre-empted. |
| **0.11** | **THE BODY LAW — a kill stays a BODY, never a box.** (Owner, 2026-07-08: *"you see the body, and then it turns into a chest, like a box — that's gonna have to be adjusted."*) One corpse law for every death path: the dead actor's **own rig, posed dead** (the puppet's bent-limb death sprawl / `_quad.pose_dead` already exist) IS the corpse — it stays where it fell, is looted **in place** (`ProtoCorpse`'s container plumbing is kept; the E-prompt opens the body, nothing morphs), decays and fades as the body. `ProtoCorpse.create()` gains a `rig` argument (the killed actor's visual, reparented and death-posed) and its 2-box lump becomes the **fallback only** (no rig handed in). **Audit every death path** — companion "corpse chest," NPC kills, ecology creatures — until zero kills spawn a `ProtoChest`/box morph. | The whole read layer (birds, corpse_heat, gnawed-roadkill clues, scavengers) is built on corpses being *legible bodies*; a box-lump breaks the fiction the ecosystem sells, and `corpse.gd:1` already states the goal ("no more loot crates on a kill — loot the BODY") — the 2-box visual just never got the real rig. | The corpse→chest morph; the box-lump read. Asserted by `body_law_sim`: kill one of each actor type → the body you see is the body you loot, no chest node ever enters the tree. |

---

## 1. Overview

The land talks before it bites. Under the hood the whole USA is a grid of 500 m **sectors** (the existing
`ProtoPopulation` cells). Each sector carries ~10 invisible floats — how much plant mass, how many grazers,
how many rodents, how hot the corpses are, how hungry the local predators are, how strong their nest is, how
much noise the player has made, plus infection/water/faction modifiers. A tiny hourly tick moves those
numbers with **RNG-free equations** (the fairness keystone: a watched sector, an unwatched one, and one
caught-up offline all converge to the same numbers for the same elapsed hours). When the player drives into a
sector, `world_stream` **realizes** the numbers into visible creatures — herds, rats in the wrecks, vultures
over a kill, a pack on the dusk road, an apex nest under the overpass — all budget-gated so nothing pops into
view. RNG enters only at that realization and at discrete "does a starved nest migrate today?" beats.

The food chain has six rungs (§3.4): **plants → grazers → rodents/scavengers → birds (read layer) → pack
predators → apex nests**. Predators are **not omniscient** — they learn about food only through **signals**
(scent, blood, corpses, gunfire, engines, vultures, reused routes, nest memory). A nest reads its sector and
walks a **6-state machine** (FED / HUNGRY / STARVING / BREEDING / WOUNDED / EXPANDING); as it starves it
widens its patrols, then crosses the road, then comes for humans — but only after the sector has shown the
player **fair warning** (the contract in 0.6). The player can read all of this with **zero UI clutter**:
birds wheeling, a herd that won't settle, a dog that plants its feet, the radio muttering about a caravan
that never showed. And the player **changes** the system: over-hunt and you starve the packs onto your own
route; burn cover and the sector dies; leave bodies and predators investigate; clear a den and the rats
inherit the earth; bait a pack and that road is a hunting ground forever.

---

## 2. Player Fantasy

You crest the causeway into the swamp stretch you've been farming for Mossback hides. Something's off — the
herd that's always on the solar field is gone. One vulture rides the thermal high and lazy (*old kill,
nothing*). A mile on, three drop low and tighten (you glass them: **"Road Vultures — tight spiral: fresh
kill, predator may be near"**) over a half-eaten Mossback, ribs gnawed, blood dried on the guardrail. Your
dog stops panting and growls at the treeline, won't look away — a Bone Kite has been trailing your car since
the last town. Over the drainage tunnel where I-75 crosses the canal, **no birds at all.** The radio
crackles: *"…Peach Combine run's three days overdue past the Alley…"* That's your fifth warning. You should
have turned around, or killed your lights, or dragged that spare carcass off the road to pull the pack the
other way. At dusk the Knifeback comes off the median for your reused road — because you *taught* the swamp
this is where the meat drives through. You break its jaw and it drags back to the den wounded; a game-week
later it's back, scarred, and it remembers you.

---

## 3. Detailed Rules

### 3.1 The sector

An ecology **sector == one `ProtoPopulation` cell == one 500 m usmap macro cell.** Id/coord:
`ProtoUSMap.cell_of(x,z) = Vector2i(floor((x-offset.x)/500), floor((z-offset.y)/500))` (`usmap.gd:129-130`),
offset-anchored at `world_offset (-60000,-20500)` — **always subtract `usmap.offset`; never key off world
origin** or sectors misalign with biome/state. Key string `"cx,cz"` from `population.cell_key(pos)`. The grid
is 150×85 = 12 750 cells (75×42.5 km) but cells are **lazily minted** on first touch (`population.cell_at`),
so an unvisited cell costs nothing. Each cell already carries `zone_tag / biome / controlling_faction /
current_pop / protected`; the ecosystem adds one sub-dict `row["eco"]` (0.1). A 500 m sector ≈ 4×4 streaming
chunks; the player's stream RING (7×7 chunks ≈ 896 m) overlaps at most a **3×3 block of sectors** at once,
which bounds the HOT set (§3.3).

### 3.2 The ten floats (`row["eco"]`, all normalized 0..1)

| Field | 0 means | 1 means | Layer |
|---|---|---|---|
| `plant_mass` | scorched/barren | full biome canopy | L1 |
| `grazer_pop` | no herds | grazers at plant-supported max | L2 |
| `rodent_pop` | clean | infested (cars/basements swarm) | L3 |
| `corpse_heat` | no dead | fresh battlefield | feeds L4 |
| `predator_hunger` | fed (stays wild) | starving (roads become meat) | L5/L6 |
| `nest_strength` | no apex den | mature breeding nest | L6 |
| `human_noise` | silent | recent gunfire/engines/repeat routes | signal |
| `infection_pressure` | clean | Choir-saturated | P3 |
| `water_rot` | bone-dry | swamp/flood/wet basement | modifier |
| `faction_activity` | free county | occupied / war front | modifier |

Plus `_last_h` (float, last live-tick game-hour; reset to `_now_h()` on load per 0.7) and `warn_mask` (int
bitfield, §3.8). **Bootstrap seeds** (once, at cell mint) come from a `ecology.json` biome table: `plant_mass`
and `water_rot` from biome; everything alive starts low ("recovering, not returned"); `nest_strength` seeds 0
and only grows in apex-eligible biomes (§3.5); `faction_activity` is **derived, never seeded** (§4). Three of
the ten — `faction_activity`, `water_rot`, `infection_pressure` — are **modifiers read from systems that
already exist** (`world_state.controller_of` + `events.war_state` + `respect`; biome base + live `weather`;
corpse_heat + Carousel-anchor proximity), not independent simulations.

### 3.3 The tick — cadence, HOT/WARM/COLD, on/off-screen

**One tick per game-hour**, fired from the existing game-hour boundary (`proto3d.gd:4012-4017`, beside
`character.hunger_tick`). `tick_ecology(now_h)` walks `population.cells.keys()`, computes `dt = now_h -
eco._last_h` per cell, runs the §4 equations, sets `_last_h = now_h`.

| Tier | Which sectors | Signals | Cost |
|---|---|---|---|
| **HOT** | player's cell + 8 neighbors (≤ 9) | live `corpse.heat` sweep, live `noises_in`, live weather | ~10 float ops × ≤9 |
| **WARM** | every other known (bootstrapped) cell | live-signal inputs = 0 | ~10 float ops × dozens |
| **COLD** | never-visited cells (no row) | — | 0 |

Because the continuous math is **RNG-free**, HOT and WARM differ only in whether `deposits/noise_in/weather`
are live or 0 — a sector produces the same trajectory watched or not. The **only** RNG in the loop is a
once-per-game-day discrete beat (a starved nest's migrate/expand roll, Phase 2+), seeded
`hash("ecology:%s:%d" % [sid, day])` (0.8).

### 3.4 The food chain as data (L1–L6) + the tag system + where-X-lives

Everything is a JSON row folded additively over a code floor (the `horse.gd`/`bandit_regions.json` idiom): an
unknown id **adds** a creature with zero code; a known id **overrides** only the fields it lists; a missing
field keeps the floor. Colors round-trip `[r,g,b]↔Color`. F10 DEV MODE refolds. **No purple** — ink/bone/ash
tints only.

**L1 — Plants** (`plants.json`; tinted biome *scatter*, not actors — extend `world_stream _crops/_trees/
_scatter`). Fields: `food_value, cover 0..1, burnable, spread_rate, marks[water|rot|chemical], hides_nests,
color, harvest`. V1 rows: **Glassgrass** (cracked highways/solar farms), **Blackvine** (dead suburbs, cover
0.55), **Rot Bloom** (fungal, blooms on `corpse_heat`, marks rot/water), **Corn Ghosts** (feral farm crops),
**Red Kudzu** (spread 0.60 — crawls over roads, `hides_nests` — the den's cover).

**L2 — Grazers** (`creatures.json`; full `ProtoCreature` on `ProtoQuadruped`; you hunt them for meat/hide).
Fields: `quad_params, max_hp, base_speed, flee_speed, herd_size[min,max], panic_range, diet[plant ids],
predators[], food_value`. V1: **Mossback** (deer/elk, forest/mountains), **Fencehog** (pigs, farmland/forest),
**Pale Runner** (nervous plains herds, fast), **Canebelly** (heavy swamp grazer, FL/LA only, swimmer),
**Ash-Goat** (burned farmland — eligible in sectors the player has *burned*). **Herd behavior** = cheap boids:
cluster-spawn with a shared `herd_id`; per-frame centroid-cohesion minus short-range separation (~8 lines);
**panic = the predator reveal** — each grazer scans `combatant∪threat` (the `dog.gd:741` rear-arc scan), and a
non-grazer hostile within `panic_range` ripples a herd-wide `alarm` (the `howler.gd:337` patience-ripple
re-pointed at the `grazer` group), everyone flees away and emits one `"stampede"` noise. A player 60 m off
sees the herd streak away from a predator he never saw — **zero UI**.

**L3 — Rodents/scavengers** (`creatures.json`; cheap `ProtoCreature` swarms, scaled down). Fields add
`swarm_size, nest_anchor[], diet, disease 0..1, emerge_from_anchor`. **THE NEST-IN-OBJECT RULE (the owner's
"where do rodents live"):** a rodent never spawns in open field — it **emerges from an anchor object, and the
object IS the nest.** If the loading chunk has no matching anchor, the rodent does **not** spawn; its count
**banks** in the sector float until a chunk with an anchor loads. V1: **Wire Rat** (wrecked cars, substations,
junkyards, auto shops — everywhere there are wrecks), **Crate Mice** (warehouses, markets — town cores),
**Sump Rat** (sewer grates, gated `water_rot ≥ 0.25` + night — "sewers, after rain"), **Carrion Squirrel**
(follows corpses), **Needle Mole** (soft soil / basements, burrower). **The explosion:** kill the predators
and the sector-sim's rodent term climbs to its food ceiling (§4) → visible swarms + `disease` →
`infection_pressure`. Killing predators is punished, not rewarded.

**L4 — Birds** = living map markers, **not** combat actors (`ProtoBirdSign` markers spawned/updated by the
director). See §3.7 for the full language. V1: **Road Vulture** (universal carrion marker). P2+: **Ash Crow**
(storms/shootings), **Bone Kite** (follows predator packs — the "being hunted" tell, §3.10), **Tower Bird**
(radio towers + high infection), **Whitewing** (spawns only where `infection_pressure` is low — its *absence*
is the tainted-land tell).

**L5 — Pack predators** (wild, harass, retreat if outmatched). Base **Razor Dog** + region variants (§10).
Reuse `howler.gd`'s pack brain wholesale (roles, ripple, scream, vision-cone circling, `noises_in` hunting).
Phase 1: spawned **wild** via a `world_stream` biome roll (the gator/lurker pattern), no director. Phase 2:
a light per-sector pack director on the same accrual. **The HOWLER itself joins the chain here as the
`strict_nocturnal` night-pack tier (§3.13)** — the black, glow-eyed terror the day never sees; its kills
finally deposit `corpse_heat` (it joins the food economy), and it **competes** with the Knifeback for the
same prey (a howler pack inside a nest's territory splits the larder — both get hungrier, the roads get
worse; the rivalry is free pressure).

**L6 — Apex nests** (rare, memorable, territorial). **The Knifeback** — `ProtoKnifeback` on `ProtoQuadruped`,
built NEW copying `gator.gd` (do **not** extend `lurker`: it's a humanoid stealth puppet, wrong for an apex
animal). Low body (`scale.y ≈ 0.5`), long drag-jaw snout, bony back-ridge boxes on `_quad.body`, own
MotionForge rig key `"knifeback"`. Nests under overpasses / drainage tunnels / collapsed malls (§3.5). Full
nest behavior in §3.5.

**THE TAG SYSTEM** (the generation grammar — "one base creature + region modifiers"). Vocabulary is
authoritative in code (like `population.GROUPS`); `ecology.json` overlays tunable numbers per tag. Every tag
has a concrete effect:
- **Body:** `small/medium/large` (scale, hp, food_value, cap), `quadruped` (uses `ProtoQuadruped`), `bird`
  (uses `ProtoBirdSign`), `burrower` (spawns from soil/basement, digs), `climber` (leaps fences/ridges),
  `swimmer` (no drown in water), `infected` (joins infected group, senses by noise), `armored`
  (damage-reduction), `fast` (speed mult), `blind` (hunts by `noises_in` only), `nocturnal` (active in dark,
  dawn-flee).
- **Behavior:** `grazer, scavenger, pack_hunter, ambusher, nest_defender, migratory, cowardly, territorial,
  corpse_following, road_hunting, human_curious, human_fearing, human_eating, strict_nocturnal` (§3.13 —
  exists ONLY while `is_dark()`: spawn-gated to night, burned off at dawn, never seen by day, ever).
- **Region:** `urban forest swamp desert farmland mountain highway industrial radio_tower choir_zone
  military_zone` (each narrows eligibility by biome/zone_tag/anchor/faction/proximity).

Generation example: `["quadruped","large","grazer","cowardly","climber","mountain","forest"]` → a "Ridge Elk"
(a Mossback-class animal in the Rockies/Appalachia, same skeleton & AI, different skin/stats) — the owner's
"regional variant without a new monster," from tags alone.

**WHERE X LIVES — the master map** is Section 12 (grounded in the real `usmap.json` biome counts).

### 3.5 The apex nest: 6 states, signals, target scoring, human-predation gate, hunting party

A nest is a per-sector record (in `row["eco"]["nest"]`; the delta-ledger pattern of `respect.gd`). Fields
(every one from the brief): `archetype, state_name, pos, adults, juveniles, brood, hunger, food_stockpile,
territory_r, aggression, fear_of_humans, memory{threat→heat}, feeding_grounds[], corpse_sites[],
road_crossings[], last_hunt_h, last_attacked_h, expansion_pressure, nstate, sightings, cool_until_h`.

**The director** (`ProtoEcology._tick` for the player's sector) copies `bandits.gd:141-194` verbatim: guards
on `stream`, **skips `net_is_client()`** (host-authoritative), anchors to `active_car` else `player`, uses the
game-hour clock, accrues a WATCH ledger, and COMMITs a hunt past a threshold then cools down. **BALANCE LAW
(inherited, `bandits.gd:180`): region strength lives ONLY in the commit threshold (and party size), never
multiplied into the accrual** — or pacing scales with strength² (the paid-for Arizona-9s bug).

**The 6 states** (evaluated per tick + once per offline day; override states first, then hunger bands with
hysteresis):

| State | Entry (numeric) | Behavior | Targeting change |
|---|---|---|---|
| **FED** | `hunger < 0.30` | near territory, hunts animals only, juveniles hidden | humans **excluded** (gate shut) |
| **HUNGRY** | `0.33 ≤ hunger < 0.66` | patrol `territory_r×1.5`, follow scent, hit wounded animals, stalk roads at dusk/night, *test* camps | humans scored only if gate open **and** dark |
| **STARVING** | `hunger ≥ 0.66` | bold: cross roads, attack humans, raid livestock, follow vehicles, ambush gas/rest/wrecks | humans always scored; `danger_discount` halved; juveniles join party |
| **BREEDING** | `brood ≥ 0.80` OR (`hunger < 0.40` AND `food_stockpile ≥ 4`) | appetite ×1.4, `aggression += 0.2`, `territory_r += 15%`, juveniles appear, birds up | everything scored higher |
| **WOUNDED** | `now − last_attacked_h < 24h` AND `recent_dmg_frac ≥ 0.40` | defensive, ambush not roam, avoid gunfire, may relocate den, hunts the player who hurt it and left | adds a grudge: `memory["player"]` → player scored +W_MEM even when FED |
| **EXPANDING** | `expansion_pressure ≥ 1.0` AND `juveniles ≥ 2` | a young group splits, follows roads/rivers/rail, founds a den in a neighbor sector | fires migration (§ P3), halves juveniles |

**The signal model** (predators are NOT omniscient — they poll signals each tick; sight-signals scale range by
`daynight.vision_mult() * weather.vision_mult()` so dust/night blind them too, forcing a fallback to noise/scent):

| Signal | Emission (real code) | Decay |
|---|---|---|
| noise (engine/horn/radio/glass) | `noises_in(nest_pos)` ring buffer | 8 s TTL |
| **gunshot** | **NEW** `emit_noise(muzzle, 60, "gunfire")` in the non-melee fire branch (currently missing) | 8 s + seeds `corpse_sites` |
| **blood** | **NEW** `emit_noise(pos, 25, "blood")` on `take_damage` while bleeding | 8 s (P1); lingering scent P2 |
| corpse/carrion | sweep group `corpse`, read `corpse.heat` | with the body (90 s / 32 s looted) |
| fire | burning plants `emit_noise(pos, 40, "fire")` — **negative** weight (predators flee, grazers scatter) | 8 s |
| engine/vehicle crash | noise kind `"engine"` + a nearby wreck → +food, +danger | 8 s |
| vulture | L4 markers over `corpse_heat` → a long-range scent sample | with the corpse |
| route_memory | sample player/car pos; heat `road_crossings` near territory | ×0.85 / game-day |
| nest_memory | learned `feeding_grounds`/`corpse_sites` | ×0.85 / game-day; drop < 0.05 |
| night / faction_activity / wind (P3) | `daynight`/`world_state`/deterministic per-sector wind | per clock / per update |

**Target scoring** (brief: `food_value + scent + noise + weakness + memory − distance − danger`):

```
score(t) = FV[type] + 4·scent + 3·noise + 5·weakness + 3·memory − 4·norm_dist − danger·danger_discount
```
`danger_discount = base[nstate] · (1 − 0.3·aggression)`, `base = {FED:1.0, HUNGRY:0.7, STARVING:0.4}`. Per-target FV/danger tuned so a FED nest reproduces the brief's exact ranking:

| Target | FV | danger | net (FED) |
|---|---:|---:|---:|
| grazer | 10 | 1 | 9.1 |
| rodent_cluster | 8 | 1 | 7.1 |
| fresh_corpse | 7 | 1 | 6.1 |
| injured_pack | 6 | 1 | 5.1 |
| dog / livestock | 6 | 2 | 4.2 |
| lone_human | 12 | 10 (+5 armed, +6 vehicle) | 3.2 |
| small_camp | 16 | 15 | 2.8 |
| convoy | 14 | 14 | 1.7 |
| settlement | 22 | 22 | 2.6 |

**Human-predation gate** — a human is added to the scoring pool only if the warning contract is satisfied
**and** ≥1 trigger is true:
```
human_predation_open(nest, sector, player):
  return warn_count(sector) >= MIN_WARNINGS            # 0.6 — the CONTRACT, mandatory
     and ( nest.hunger >= 0.50 or sector.grazer_pop <= 0.15 or nest.brood >= 0.60
        or sector.human_noise >= 0.50 or camp_has_livestock(player) or sector.corpse_heat >= 0.50
        or player.bleeding or player_is_alone(player) or daynight.is_dark()
        or route_heat_at(nest, player.pos) >= 0.50 or recent_vehicle_crash(sector)
        or sector.faction_activity >= 0.50 or weather.vision_mult() <= 0.6 )
```
If the contract isn't met but the nest is otherwise ready, **defer** and force-spawn the top un-shown clue
(§3.8). Two-gate design: the gate opens the *possibility*; the *score* still has to beat the prey — "avoided
unless hungry/desperate/experienced/prey-looks-weak."

**Nest tick + hunting party** (pseudocode; nest tick copies `bandits.gd`, party copies `howler` roles +
`gator` strike):
```
_tick: food_eff = clamp(food_avail + 0.05·food_stockpile, 0, 1)   # ONE hunger law — F-HUNGER (§4)
       food_stockpile *= 0.92^dh                              # spoilage — a fed nest returns to hunger
       hunger += (h_rise·pop_load·(1−food_eff) − h_fall·food_eff + brood)·dh; clamp 0..1
       brood  += (0.01 if hunger<0.4 else 0)·dh
       expansion_pressure += 0.02·dh·((hunger>=0.5)+(juveniles>=cap))
       sightings += signal_pressure·dh                        # strength NOT in accrual (balance law)
       nstate = select_state(...); update_threat_chip(...)     # 0.9 priority stack
       if nstate != FED and now >= cool_until_h and sightings >= threshold_base/strength:
            sightings = 0; cool_until_h = now + 8; dispatch_party()

dispatch_party: tgt = best_target() ?? hottest_memory()       # SEARCH fallback, not omniscience
  spawn min(party_size_max, adults + (juveniles if STARVING)) ProtoKnifebacks at a SAFE den-exit
  (safe_to_spawn-gated; if none safe → DEFER, no pop-in). Roles: screamer/charger/circler.
per-Knifeback: STALK (ride vision-cone edge; re-target loudest noise; RETREAT if outmatched) →
  AMBUSH (freeze in kudzu/under overpass) → LUNGE (gator flat carry-through; bite via take_damage) →
  DRAG (carry corpse to den: food_stockpile += FV; hunger -= FEED_ON_KILL; if human: fear_of_humans
  -= 0.1, aggression += 0.05) → RETREAT (set last_attacked_h, remember attacker → WOUNDED grudge).
```

**Apex habitat** (`sector_qualifies`): **overpass** → a road `lanes ≥ 4` or `divided` in the sector
(`usmap.road_geometry`); **drainage tunnel** → `industrial`/`junkyard`/`warehouse` placement; **collapsed
mall** → urban ruined block. The den is placed at chunk-load (deterministic, before arrival, never popped
into view) as a low structure with a `ProtoKnifeback` **sentinel** (`CharacterBody3D`, group `threat`) so the
drone scout can mark it (the scout skips `StaticBody3D`, `drone.gd:172` — the live sentinel is the fix).

### 3.6 Numbers → creatures (the one realization rule, budgeted)

> **Realized count in a layer = `round(layer_float × zone_capacity)`, placed by the layer's habitat rule,
> routed through `population.current_pop` (0.4), every spawn `safe_to_spawn`-gated, the whole pass gated
> behind `LOAD_BUDGET` and a per-cell `eco_spawned` flag so a fresh 49-chunk RING doesn't realize in one
> frame.**

`zone_capacity` is an `ecology.json` row keyed by `zone_tag`: `K_graze=4, K_rod=6, K_pack=3` (defaults).
Pack count `= round(nest_strength·K_pack·(0.5+0.5·hunger))` gated `predator_hunger > 0.5`; apex = 1 nest gated
`nest_strength > 0.5`; birds derive from `corpse_heat` (§3.7). Grazers/rodents join `population.GROUPS` as new
groups and render through `world_stream._spawn_pop_actor`; pack/apex are bespoke placed actors (the gator
pattern) gated by the eco reads.

### 3.7 The bird info-layer + the bird language

Birds are a derived visual spawned from one number (`corpse_heat`), the way `bandits` derives a checkpoint
from `sightings`. `ProtoEcology` sweeps group `corpse` (throttled), buckets bodies into clusters by
`CLUSTER_R=40 m`, and materializes one `ProtoBirdSign` flock per hot cluster within render distance (off-screen
spawn). Flock **state is the message** (info without UI):

| State | Trigger (h = cluster heat 0..1) | Reads as |
|---|---|---|
| **ABSENT** (n=0) | predator within `FEAR_R=60`, or infection ≥ `INFECT_ABSENT=0.6`, or choir_zone | apex near / infected / Choir — the scariest silence |
| **CIRCLE_HIGH** (1–2, high) | `0 < h < 0.4` | small/old kill, maybe safe |
| **CIRCLE_LOW** (several, mid) | `0.4 ≤ h < 0.8` | fresh body, possible loot |
| **SPIRAL** (many, tight) | `h ≥ 0.8`, no predator suppression | fresh kill, predator may be near |
| **SCATTER** (burst, 4 s) | `gunfire`/`engine`/`predator` in `noises_in(flock)` | something just happened |
| **PERCH** (on structures, yaw-locked) | no corpse but a mover within sight | something is moving through |

Surfacing, all through existing channels: the **flock itself** (primary, diegetic); **binoculars**
(`hud_3d.gd:722 set_recon_tags` fills a slot with name + read when glassed); the **priority threat chip**
(0.9) only for the must-not-miss `"🪶 NO BIRDS — something's wrong here"`; a **contextual, save-flagged codex
toast** the first time the player sees each formation (§3.10 — *not* tied to the retiring first-run).

### 3.8 Visible clues + the WARNING CONTRACT

Every clue is a `ecology.json` clue row spawned by the `world_stream` chunk pass (where wrecks/gators roll
today), gated on the sector's floats crossing a threshold. Each clue, when the player comes within its
`perceive_r_m`, sets its `warn_bit` in the sector's `warn_mask`.

| Clue | Prop / behavior | Tied to | Bit |
|---|---|---|---|
| Nervous herds | grazer tail-tuck/bolt-prone (`morale()` readout) | `predator_hunger ≥ HUNGRY` | 0 |
| Missing birds | ABSENT flock over a corpse-heavy cell | suppression | 1 |
| Gnawed roadkill | half-eaten grazer (`gnawed`) on the shoulder | `rodent_pop ≥ 0.5` or recent pack feed | 2 |
| Dog refuses to advance | player's dog balks/growls/tucks (`dog.gd:_sense`) | `nest_strength ≥ T2` within `WARN_R` | 3 |
| Scratched cars | claw-gouge decal on wrecks | `nest_strength ≥ T1` or `predator_hunger ≥ HUNGRY` | 4 |
| Drag marks | ground line toward the den | `last_hunt` recent | 5 |
| Bones under bridges | bone-pile under overpass/drainage | `nest_strength ≥ T2` | 6 |
| Feathers / blood on barriers | small decals near a kill | `corpse_heat` spiked recently | 7 |
| Radio: missing caravans | `SIGNALS` row + `broadcast_queue` bulletin | a sector ate a convoy | 8 |

**THE CONTRACT (enforced per 0.6):** `warn_count = popcount(warn_mask)`. A human-predation strike is illegal
unless `warn_count ≥ MIN_WARNINGS = 3`; if the nest is otherwise ready, it **defers** and force-spawns the
highest-priority un-shown clue — danger always announces itself. Once `warn_count ≥ UNLEASH_WARNINGS = 5`
**and** the player is pressing (route reused ≥3×, or bleeding, or shot in-sector, or traveling at night), the
strike **unleashes** with no further deferral. `warn_count` decays 1 per `reseed_days = 7` absent, so a
veteran returning after a week is **re-warned**, not silently ambushed. **A prey-wiped, STARVING sector must
still surface ≥1 body-independent tell** (dog balk + robust NO-BIRDS) before any strike — asserted by a sim.

### 3.9 Player-action consequence loops

Five verbs change the land; each has an **immediate** felt payoff and a **long-term** delta written to the
floats (via the `respect.gd` add/relieve pattern, advanced offline by the pure day-loop):

- **KILL GRAZERS** — *now:* meat/hide + herd panics (bird SCATTER + nervous tell) + a **"the herd's gone quiet
  — something will come looking"** beat that stamps the cause at the moment (0.9 fun fix). *Long-term:*
  `grazer_pop −`, `predator_hunger += 0.06/kill`; when `grazer_pop < prey_floor` set `road_meat` — packs shift
  to your route. **The strike toast NAMES the cause** ("starved off the deer you took").
- **BURN PLANTS** — *now:* cover cleared, animals flee, fire SFX. *Long-term:* `plant_mass −= 0.25`; grazers
  migrate to a neighbor; `rodent_pop +=` (indoors); `predator_hunger +=`; `ash` expands (Ash-Goats become
  eligible). Clear cover today, starve the sector tomorrow.
- **LEAVE CORPSES** — *now:* birds/rodents gather (`corpse_heat` spike). *Long-term:* `corpse_heat_accum +=`;
  `expansion_pressure +=` (predators investigate); a pile → `infection_pressure +=` and a town cell drops
  `desired_pop.civilian` + queues "settlement uneasy."
- **DESTROY NESTS** — *now:* threat chip clears, materials, `respect.add_esteem(faction)` — **and a legible,
  immediate Wire-Rat swarm boom at the cleared den + "the rats own this stretch now" + a holdout complaint**
  (0.9 fun fix, so P1 doesn't teach the wrong lesson). *Long-term:* `nest_strength = 0` **but** `rodent_pop +=
  0.5`, `infection_pressure +=`, and after `reseed_days` a neighbor's EXPANDING claims the empty territory.
- **FEED / BAIT PREDATORS** — *now:* drop a bait carcass at P → `emit_noise(P, 70, "carrion")`; the nearest
  predator paths to P via `noises_in` (the `howler.gd:249` behavior) — lure a pack off a caravan/camp or into
  a trap. *Long-term:* the nest **remembers** — `feeding_grounds.append(P)`, `fear_of_humans −=` per feed, the
  cell flags `bait_zone`. Weaponize them now; that road is a hunting ground forever.

### 3.10 Legibility & causation (the fun layer — the owner's north star)

The pressure system only *lands* if the player can read it and feel that his actions caused it. These ride
existing systems and are **Phase-1 essentials**, not polish:
- **Priority HUD stack** (0.9) — `set_threat` becomes owner/priority; precedence apex-strike > checkpoint >
  drone-shadow > nest-territory > NO-BIRDS. `toast()` gets a queue so back-to-back beats don't clobber.
- **Cause stamped at the moment + named at the strike** (§3.9) — the over-hunt beat fires *when you hunt*; the
  ambush toast names the deer you took. Tuning: continuous hunger drift is slow (for far/offline sectors), but
  the player's **kills apply a discrete hunger impulse** (`+0.06`/grazer) so a few kills near the authored den
  tip it to STARVING and the first ambush lands within **~2–3 real minutes**, not 15+.
- **"The wild is pacing you" tell** — a **Bone Kite** starts trailing your car (+ distant screech + a persistent
  chip) as the human-gate terms rise, mirroring the bandit `🛸 SHADOWED` drone. Teaches the counterplay verbs
  (vary your route, kill your lights, go quiet, staunch your bleed) the first time each triggers. Turns an
  invisible punishment into a stealth-vs-predator minigame.
- **Contextual, save-flagged teaching** — the bird language, the route/noise mechanic, and the counterplay
  verbs each teach via a **once-ever codex toast the first time the player meets them**, independent of the
  one-shot `objectives.gd` first-run (which retires and never re-arms). Learnable at any point, by anyone,
  including existing saves.
- **The named nemesis, early** — the first time the apex wounds the player or kills a dog, it gets a **name +
  a visible scar**, persisted via the `dog.gd` record pattern (`to_record`/`from_record`, `fallen_dogs`),
  surfaced on the chip and in kill toasts thereafter; it drops a **nameable trophy (Knifeback jaw)** that
  mounts on the homebase build board. Do this in Phase 1/2, not Phase 3 — it's the cheapest, biggest emotional
  payoff and the machinery exists.
- **The stampede set-piece** — a grazer stampede across the interstate is a dynamic **driving hazard you
  physically dodge** *and* a free predator reveal — an authored-feeling moment from a shipped behavior.
- **Return briefing is the primary offline channel** — collapse offline ecology to **one punchy briefing
  line** (+ at most one radio bulletin), not several trickling out one-per-Y-scan.

### 3.11 Offline catch-up (fair, bounded, deterministic)

Rides the existing engine (`world_state.run_offline_catchup`, `MAX_OFFLINE_DAYS = 7`,
`OFFLINE_CATCHUP_THRESHOLD_HOURS = 12`). `population.advance_offline_day(seed_base, day, digest)` is a **pure**
function (0.8): runs the WARM equations once per known sector for one day (dt=24 gh, sub-stepped ×4 for
stability), seeded by absolute game-day, appends human-readable strings to `digest["changes"]` (surfaced in
the return briefing + one radio bulletin). Fairness (all inherited): bounded to 7 days; no eco tick under 12 h
absence; RNG-free continuous math + hashed discrete beats → same save + same gap → same floats; **spawns no
actors, plays no audio**; **protected sectors** (safehouse/homebase bubble) force `nest_strength = 0` and skip
`predator_hunger` accrual — **you are never hunted on your own doorstep**; the wall-clock absence does **not**
advance the daynight clock (offline does not touch `_last_h`), so the next live tick resumes with no
double-count.

### 3.12 The EAR LAYER — audio as information (the second read channel)

The bird layer is the eye's read of the pressure system; this is the **ear's**. Same law — information
without UI — and same substrate discipline: everything rides `audio.gd`'s two tiers (a SoundForge mp3 at
`assets/sfx/<id>.mp3` overrides a synth fallback; the dir scan means **a new creature voice is a file drop,
zero engine code**) and decision 0.10 (audio never drives simulation).

**Per-creature voice = data.** Every `creatures.json` row gains an `sfx` block; each entry is
`{id, db, pitch, cooldown_s, pair_noise?}`:

```json
"mossback": { "sfx": {
  "idle":  {"id":"mossback_call",  "db":-14, "cooldown_s":[18,40]},
  "alarm": {"id":"mossback_alarm", "db":-4,  "cooldown_s":[2,4], "pair_noise":{"r":35,"kind":"stampede"}},
  "hurt":  {"id":"hurt",           "db":-6,  "pitch":0.8},
  "death": {"id":"body_thud",      "db":-2} } }
```
Missing entries are silent (default-safe); ids resolve against `ProtoAudio.streams` (file or synth), so a
row can reference `growl`/`howl`/`hurt`/`body_thud` today and upgrade to a bespoke sample later by dropping
a file. `pair_noise` is the ONE place a sound and a sim signal are born together (0.10) — the Mossback's
alarm bleat and its `"stampede"` `emit_noise` come from the same row line.

**The audible read-language** (what the ear learns, mirror of the bird table):

| What you hear | Driven by | Meaning |
|---|---|---|
| **Wildlife bed** (frogs/insects/birdsong loop, per biome) | F-AMBIENT: volume from `grazer_pop`/`plant_mass`, suppressed by `predator_pressure`/`infection_pressure` | the land is alive — the healthy-sector baseline |
| **The bed goes QUIET** | suppression term high | the audio NO-BIRDS: apex near, infected, or Choir — the scariest silence, hearable before it's visible |
| **Distant howls/yips** at dusk (`howl` reused, jackal pitch 1.15) | nest/pack state: FED silent · HUNGRY ~120 s, far ring, −14 dB · STARVING ~60 s, tight ring, −6 dB (F-CALL) | the pack's mood, at a distance — closer + more frequent = hungrier |
| **The Knifeback SCREECH** (`knifeback_screech`) | party dispatch + LUNGE telegraph | the apex's audio identity — once heard, never misread; also the named-nemesis signature (§3.10) |
| **Low den breath** (`knifeback_breath` loop, `attach_loop` on the sentinel, max_distance 70) | within ~`territory_r·0.3` of the den | you are standing on the nest |
| **Stampede rumble** (`stampede`) | herd alarm ripple | the predator reveal, audible through cover — hooves tell you *which way* they fled from |
| **Rat scurry loop** (`rat_scurry`, `attach_loop` on the anchor) | Wire Rats resident in a wreck | the wreck is occupied before you open it; sector-wide scurry chorus = the rodent boom after a nest clear |
| **Wing-burst** (`vulture_wings`) | flock SCATTER | something just moved — the audio edge of the visual scatter |
| **Dog growl** (existing `growl`/`dog_whine`) | the balk (§3.8, warn bit 3) | your personal early-warning system, already voiced |
| **Bone crunch / heavy drag** (`bones_crunch`, `drag_heavy`) | party feeding / DRAG state | a kill is being eaten or hauled — follow it to the den (or away from it) |

**The wildlife bed** extends the existing ambience seam (`proto3d.gd:1427`'s `attach_flat_loop(want, -50)`):
add `amb_swamp` (frogs/insects) to the biome pick and a second `birdsong_day` layer whose volume is
**F-AMBIENT** — recomputed on sector change (crossfade ~2 s), suppressed exactly by the pressure that empties
the sky. The quiet-tell is credited to the **missing-birds warn bit (bit 1)** when the player lingers ≥10 s in
a suppressed sector whose biome baseline is lively — ear and eye feed the same contract, no new bit.

**Calls are fair-warning too:** the F-CALL escalation (farther-apart-and-quiet → closer-and-loud) is the
audible arm of the warning ladder; the Knifeback always screeches on dispatch **before** it is visible —
by the time you hear the close scream, you have already been warned in ≥3 other ways or the strike defers
(§3.8). Freebie fix riding this pass: the horse's mount sound is a `car_door` placeholder (`horse.gd:248`) —
it gets a real `horse_snort` from the same production list.

### 3.13 THE NIGHT SHIFT — the world changes hands at dusk

The clock is already built (`daynight.gd`: 24-min days, `hour`/`day`, `daylight()`, twilight ramps, moon =
night floor, `is_dark()` `:61`, `vision_mult()` 0.4–1.0 `:67`). The ecosystem formalizes it into **shift
windows** matching the existing twilight ramps: **DAY 6:00–18:00 · DUSK 18:00–20:00 · NIGHT 20:00–4:30 ·
DAWN 4:30–6:00.** Every creature row's `activity[]` resolves against these windows (F-SHIFT). The law:
**night is not darker day — it is a different ecosystem with a different cast, and the changeovers are
readable events.**

**The two-shift duty table** (what each layer does, per window):

| Layer | DAY | DUSK (the handoff) | NIGHT | DAWN (the debrief) |
|---|---|---|---|---|
| Grazers | graze in the open — the visible herds | **path to bed-down cover** (a readable migration: the herd leaving the solar field tells you the time) | bedded in cover, near-still — easy meat (F-NIGHT off-screen predation ×2) | rise, return to feed grounds |
| Rodents | hidden in anchors (except Carrion Squirrel) | emerge | **the rodent shift** — scurry chorus, Wire/Sump rats active, wrecks alive | back into the anchors |
| Birds | the EYE read-layer flies (§3.7) | **stream to roost** — where they roost is the safe-ish ground, a free tell | **absent — the bird language is OFFLINE at night; the read channel hands off to the EAR (§3.12: calls, bed, scurry) and to EYESHINE** | **the morning sweep**: vultures rise and find the night's kills — the dawn spiral over the interstate is the report of what happened while you slept |
| Pack (Razor Dog line) | lay up at dens/shade (jumpable — the day counterplay) | wake; first howls (F-CALL activates) | road-hunting at full aggression | den up |
| **HOWLERS (`strict_nocturnal`)** | **do not exist — never seen by day, ever** | — | **own the dark** (below) | FLEE + burn off the map (existing `howler.gd:217`) |
| Apex (Knifeback) | **den-bound ambusher** — AMBUSH only at the den; the day is when you can hunt IT | patrols wake | hunts (the human-gate's `is_dark()` term; STARVING road ambushes are night-weighted) | drags kills home |
| The human-gate | mostly shut | opening | naturally open (night is a gate term) — **but the warning contract still binds: ≥3 warnings, night or not** (eyeshine, howls, dog balk all count) | closing |

**THE STRICT-NOCTURNAL LAW — the owner's predator.** The black things with the glowing eyes are the
**howlers** (`howler.gd`: dark quad bodies, amber emissive eye spheres `:83`, headlight fear `:310`,
dawn-flee `:217`, `night_pack` group) — already built as night creatures, now formalized and folded into
the chain:
- **Spawn gate:** a `strict_nocturnal` row spawns ONLY while `is_dark()`; at dawn the existing FLEE fires
  and the pack despawns off-view **into its den (below)**. **A player who only travels by day never sees one
  above ground — only their leavings** (the clue props of §3.8, spawned by the sector's state: the drag line
  where a party hauled last night's kill toward the den, the half-eaten Mossback on the shoulder from the
  overnight F-NIGHT predation, the dog balking at a treeline at noon because the den mouth — and the pack
  sleeping in it — is 80 m past it). That above-ground mystery is load-bearing: it is the seam the future
  HUNTERS idea (§15.4) hangs on.
- **THE HOWLER DEN IS UNDERGROUND (owner ask + "can we go underground?" — yes, by the portal law).** The
  map cannot carve terrain (floors are law — GROUND_INTEGRITY), but the game already owns the pattern: the
  Carousel portal (`carousel_portal.gd` — an interactable that fires a jump) and the Carousel's own DUNGEON
  bases prove **separate authored interiors** work. A howler den =
  **(1) a DEN MOUTH** — a culvert / storm-drain / basement-stair prop placed at chunk load by the §15
  seeder (anchors: drainage/industrial/ruined_house — distinct from the Knifeback's overpass so the two
  apex habitats never collide), dressed by the clue system (bones, flies `corpse_flies`, a cold draft
  audio tell, the stink line NPCs mention) —
  **(2) walk/E into the mouth → transition into a DEN INTERIOR**: a small authored dark space (built far
  below the map or off-grid; the portal machinery moves you — no terrain carving). Inside, the clock is
  irrelevant: **it is always their night** (`is_dark()` is forced true in den space) — the pack is HOME by
  day, with brood, bone piles, and the range's stockpile as loot.
  **The day raid is the counterplay** (mirrors the Knifeback's day-den law): light is your weapon down
  there — the headlight-fear law generalizes to flashlight/flare cones pushing them back (the shipped
  `_in_headlights` check pointed at hand light), dark is theirs. Clearing the den ends the night range
  (the §15 seeder marks it reclaimed for `reseed_days`) and triggers the same rodent-boom backfire as any
  nest clear. Fully data: a den row = `{anchor_kinds, interior_id, pack_size, brood, loot_table}`.
  **Phase (amended per THE_AMERICAN_ROAD ruling 0.9 — no portal interiors before the tech is proven):**
  P1 howlers remain denless night terror. **P2 dens are SURFACE dens** — the dressed mouth prop plus
  wake-on-approach occupiers (the Carousel `_spawn_occupation` pattern proves dangerous dens work
  open-air); the raid happens at and around the mouth, light still the weapon. **The true underground
  portal interior is the P3 ambition** once portal-to-interior tech is proven elsewhere. Nothing in
  P1/P2 forecloses it.
- **EYESHINE is the night read:** the amber eye pairs render as emissive points visible to ~60 m regardless
  of `vision_mult` (emissive defeats darkness — information the dark can't hide). Two amber points at the
  treeline, fixed on you, is the iconic night warning — and it counts toward the warn mask (a perceived
  clue, same contract).
- **Light is counterplay, and a beacon:** headlight fear (existing) repels the pack cone-front — but
  headlights at night also feed `sightings`/visibility (the bandit law). Kill your lights to hide; keep
  them to hold the howlers off. That tension is the night drive.
- **They join the food economy:** howler kills now drop/deposit `corpse_heat` (off-screen: their predation
  feeds the F-CORPSE deposit term), they cull grazers/rodents at night, and they **compete with the
  Knifeback** — overlapping territory splits `food_avail`, both parties hungrier, the roads worse.
- **Blood moon (existing `events.gd` roll):** on a blood-moon night the howler realization cap lifts +1 and
  F-CALL cadence halves — the shipped event finally *means* something ecological.
- **Owner call (one flag):** the Knifeback defaults to **dusk+night hunter, day-bound den** — so it CAN be
  scouted and fought by day at its den, which is the fair counterplay window and keeps the two predators
  distinct (the howler is *never* seeable; the apex is *findable if you dare*). If you want the apex
  strictly nocturnal too, it's the same `strict_nocturnal` tag on its row — one data flag, no code.

**Night legibility (the contract does not sleep):** at dusk the read channel hands off eye→ear (birds
offline; F-CALL escalation, the wildlife bed, scurry chorus, eyeshine, and the dog's balk carry the night).
The changeover itself is information: herds bedding early / birds roosting low and tight = pressure is high
tonight. At dawn the world debriefs you — the morning vulture sweep and fresh gnawed roadkill are the
night's ledger, readable over coffee at the safehouse door.

---

## 4. Formulas

All per-game-hour (gh); a game-day = 24 gh = 24 real min. Coefficients ship as a code floor, overridable in
`ecology.json`. `dt` in gh. Derived helpers used throughout:
- `food_avail = clamp(0.5·grazer_pop + 0.3·rodent_pop + 0.4·corpse_heat, 0, 1)` — everything a predator eats.
- `predator_pressure = nest_strength · (0.3 + 0.7·predator_hunger)` — how hard the nest culls now.

| Formula | Expression | Vars / ranges | Example |
|---|---|---|---|
| **F-PLANT** | `plant_mass += dt·(r_plant·season_mult·plant_mass·(1−plant_mass)·moisture − c_graze·grazer_pop·plant_mass)` | `moisture=0.4+0.6·water_rot`; `r_plant=0.04` (0.01–0.10); `c_graze=0.03` (0.01–0.08); **`season_mult` from WEATHER_AND_SEASONS.md W-SEASON (SPRING 1.5 / SUMMER 1.0 / AUTUMN 0.7 / WINTER 0.4) — winter starves the chain from the bottom**; clamp 0..1 | P=0.55,G=0.15,WR=0.80,dt=1, SUMMER → +0.0062 → **0.556**; same cell in WINTER → +0.0006 (the lean season) |
| **F-GRAZER** | `migrate=(plant_mass<0.10)?m_graze·grazer_pop:0; grazer_pop += dt·(r_graze·grazer_pop·(plant_mass−grazer_pop) − c_pg·predator_pressure·grazer_pop − migrate)` | `r_graze=0.03`; `c_pg=0.05`; `m_graze=0.05`; clamp 0..1 | G=0.15,P=0.55,pp=0.396 → −0.0012 → **0.149** (falling) |
| **F-RODENT** | `food_r=clamp(0.3·plant_mass+0.8·corpse_heat+0.5·water_rot,0,1); rodent_pop += dt·(r_rod·(food_r−rodent_pop) − c_pr·predator_pressure·rodent_pop)` | `r_rod=0.06`; `c_pr=0.07`; clamp 0..1 — **the EXPLODE rule** | R=0.30,C=0.40,WR=0.80,pp=0.396 → +0.027 → **0.327** (climbs); nest cleared (pp=0) → +0.50/h |
| **F-CORPSE (sector)** | `corpse_heat += dt·(deposits − k_corpse·(1+0.5·water_rot)·corpse_heat − c_rc·rodent_pop·corpse_heat)` | `deposits`=on-screen `Σ body.heat / CORPSE_HEAT_NORM(3.0)`, off-screen `0.02·predator_pressure`; `k_corpse=0.08`; `c_rc=0.05` | C=0.40,R=0.30,WR=0.80 off-screen → −0.043 → **0.357** |
| **F-CORPSE (body)** | `heat = clamp(heat0 − _age/DECAY_SECONDS·(rain?1.5:1.0), 0, 1)`, `heat0 = clamp(0.4·size + 0.3·blood + 0.3·infection + exposed_bonus, 0, 1)` | `size∈{0.6,1.0,1.6}`→pre-clamped; `blood` from launch len; `exposed_bonus=0.2` outdoor; `DECAY_SECONDS=90` (32 looted) — **canonical, [0,1] (0.5)** | car-flung raider outdoor: heat0=0.81; at 45 s rain → **0.06** (vultures thinned 4→0) |
| **F-HUNGER** | `if nest_strength>0: food_eff=clamp(food_avail+0.05·food_stockpile,0,1); brood=(nest_strength>0.6)?0.01:0; predator_hunger += dt·(h_rise·pop_load·(1−food_eff) − h_fall·food_eff + brood)` | `h_rise=0.03`; `h_fall=0.05`; `pop_load=clamp((adults+0.5·juveniles)/3, 0.5, 3)`; clamp 0..1; **plus a discrete `+0.06`/grazer-kill impulse (§3.10)**. **Fixed point: `food_eff* = h_rise·pop_load/(h_rise·pop_load + h_fall)` — pop_load 1 → 0.375, THE number the §15 seeding budget is built on** | H=0.60, food_eff=0.325, pop_load=1 → +0.004/h (starving slowly: 0.325 < 0.375); food_eff 0.45 → −0.006/h (recovering); 6 kills → +0.36 instantly → STARVING near the den |
| **F-NEST** | `surplus=max(0,food_avail−0.5·predator_hunger); deficit=max(0,predator_hunger−0.7); nest_strength += dt·(n_grow·surplus − n_decay·deficit)` | `n_grow=0.006`; `n_decay=0.02`; clamp 0..1; forced 0 in non-apex biome / protected sector | N=0.55,food_avail=0.325 → +0.00015 → **0.550** |
| **F-NOISE** | `human_noise = clamp(human_noise·exp(−k_noise·dt) + noise_in, 0, 1)` | `k_noise=0.8` (forgets in ~3 gh); `noise_in`=normalized `noises_in` on-screen else 0 | 0.50 off-screen dt=1 → **0.225** |
| **F-SCORE** | `FV + 4·scent + 3·noise + 5·weakness + 3·memory − 4·norm_dist − danger·danger_discount` | `weakness=1−hp_ratio`; `noise=radius/90`; `norm_dist=clamp(dist/territory_r_eff,0,3)`; `danger_discount=base[nstate]·(1−0.3·aggression)` | HUNGRY nest: grazer@60m=**8.58**; lone armed bleeding player@120m night=**9.86** → hunts the human; same player FED=**5.9** → ignored |
| **F-COMMIT** | `sightings += signal_pressure·dt; COMMIT when sightings ≥ threshold_base/strength then cool_until_h=now+cooldown_h` | `threshold_base=10`; `strength∈1..5` (**only here + party size**); `cooldown_h=8` | FL strength-3 gunfight sig≈2.5 → threshold 3.33 → commit in ~1.3 gh; then 8 gh cooldown |
| **F-EXPAND** | `expansion_pressure += 0.02·dt·((hunger≥0.5)+(juveniles≥cap))`; EXPANDING at `≥1.0 & juveniles≥2` | reset to 0 on migration | crowded hungry nest → 1.0 in ~25 gh → splits, 2 juveniles→adults found a neighbor den |
| **F-STOCKPILE** | `food_stockpile = clamp(food_stockpile·0.92^dt + FV_on_kill, 0, 8)` | spoilage 0.92/gh so a fed nest returns to hunger | 4 human kills bank ~48→capped 8, decays to <2 in ~15 gh |
| **F-MEMORY** | `heat *= 0.85^days; drop < 0.05`; wounding sets `memory["player"]=1.0` | grudge lasts ~19 game-days | player guts the nest → hunted on sight ~19 days unless he stays away |
| **F-BIRDS** | `n = clampi(round(1 + h·6), 0, MAX_BIRDS=7)`, `h=clamp(Σ cluster body.heat / CORPSE_HEAT_NORM,0,1)`; formation by h-band (§3.7); `n=0` if suppressed | `CLUSTER_R=40`; `FEAR_R=60`; `INFECT_ABSENT=0.6` | h=0.5 → 4 birds (CIRCLE_LOW); predator within 60 m → n=0 → NO-BIRDS chip |
| **F-OFFLINE** | per day: run WARM F-PLANT..F-NEST at dt=24 (×4 substeps), seed `hash("ecology:%s:%d"%[sid,base_day+day+1])`; do NOT touch `_last_h` | `days=clampi(gap_days,0,7)`; threshold 12 h | 5-day absence, grazers wiped before logout → grazers rebound ~0.15, hunger climbs → STARVING on return |
| **F-SENSE** | `sense_range = base_range · daynight.vision_mult() · weather.vision_mult() · wind_mult` (sight only; noise/scent ignore mults) | base≈40 m; day 0.4–1.0; weather dust 0.18/rain 0.6/clear 1.0; wind 0.7–1.3 (P3) | dust night: 40·0.5·0.18 = **3.6 m** — the Knifeback can't see you; go silent to survive |
| **F-AMBIENT** | `wildlife = clamp(0.5·grazer_pop + 0.3·plant_mass + 0.2·(1−corpse_heat), 0, 1) · (1 − suppress)`; `suppress = max(predator_pressure, infection_pressure, choir_zone)`; `bed_db = lerp(BED_QUIET, BED_LIVE, wildlife)` | `BED_QUIET=−50`, `BED_LIVE=−22` (dB, the existing `_amb` floor is −50); `predator_pressure` reused from §4 helpers; recompute on sector change, ~2 s crossfade; `wildlife < QUIET_TELL=0.15` in a lively-baseline biome credits warn bit 1 after 10 s | healthy swamp G=0.6,P=0.75,C=0.1,pp=0.1 → wildlife≈0.66 → bed **−31.5 dB** (alive). Same cell, STARVING nest pp=0.72 → wildlife≈0.21 → **−44 dB**; clear the nest and the rats boom → scurry chorus replaces birdsong. The land is *audibly* dying |
| **F-CALL** | `call_period_s = base[nstate] · rand(0.8,1.2)`; `call_ring_m = lerp(90, 30, hunger)`; `call_db = lerp(−16, −4, hunger)`; played `audio.play_at(sfx.id, ring_point)` — **audio-only, no emit_noise (0.10)** | `base = {FED:∞, HUNGRY:120, STARVING:60}` s; ring_point = a random azimuth at `call_ring_m` from the player, clamped inside `territory_r_eff`; screech overrides: always on dispatch + LUNGE telegraph | HUNGRY nest, hunger 0.5: a howl every ~2 min from ~60 m at −10 dB — "something's out there." STARVING 0.85: every ~min from ~35 m at −5 dB — the ring is closing. The ESCALATION is the information |
| **F-SHIFT** | `active(row) = current window ∈ row.activity[]`; windows DAY 6–18 / DUSK 18–20 / NIGHT 20–4:30 / DAWN 4:30–6 (`daynight.hour`, matching the twilight ramps); changeover behaviors run over `CHANGEOVER_MIN` at the window edge (herds path to bed-down, birds to roost, packs wake); `strict_nocturnal`: spawn gate `is_dark()`, at dawn FLEE→despawn off-view (`howler.gd:217`) | `CHANGEOVER_MIN = 20` game-min (≈ 20 real s); inactive rows realize 0 regardless of floats (activity is a hard gate on §3.6, like `safe_to_spawn`); a bedded/roosted actor still EXISTS if already realized — it changes behavior, not existence | 18:10, Mossback herd (activity day/dusk): mid-changeover, pathing to the treeline bed-down — the herd leaving the solar field IS the clock. 23:00, Wire Rat (dusk/night): active, scurry chorus. 23:00 howler roll: `is_dark()` true → pack eligible; 5:40 → FLEE fires, gone before light |
| **F-NIGHT** | Off-screen night predation: `deposits_off = 0.02·predator_pressure·(is_night ? NIGHT_PRED_MULT : 1)` (bedded herds are easy meat — feeds F-CORPSE); grazer cull term `c_pg` ×1.3 at night when `predator_hunger > 0.5`. Eyeshine: emissive eye pairs readable to `EYESHINE_M` independent of `vision_mult`; perceiving one sets a warn bit (the contract counts it) | `NIGHT_PRED_MULT = 2.0` (1.5–3); `EYESHINE_M = 60` (30–90) — emissive defeats darkness by design: the dark hides the body, never the eyes; blood moon: howler realization cap +1, F-CALL base halved, for that night only (`events.gd` roll) | A STARVING sector overnight (pp=0.5): deposits 0.02·0.5·2 = +0.02/gh → dawn `corpse_heat` ≈ +0.17 → the morning vulture sweep has something to find, and the player reads last night's hunt in the morning sky |

---

## 5. Edge Cases

- **`ProtoPopulation` is never instantiated today (0 refs in `proto3d.gd`).** The whole sim has no host →
  **Phase 1 does the wiring pass the ledger's own TODO asks for** (`population.gd:397-401`): create it in
  `_ready`, assign `self.population`, pass to `stream.setup`. Non-optional, first task.
- **Per-chunk realization multiplying a herd 16×.** Route wildlife through `population.current_pop` +
  `materialize_budget` (0.4) so the per-sector cap holds across chunks; guard `_materialize_ecology` on a
  per-cell `eco_spawned` flag and gate it behind `LOAD_BUDGET` so a fresh 49-chunk RING doesn't realize in one
  frame.
- **First live tick after any load computes `dt = now_h − 0` = whole game-age.** Clamps prevent a crash but
  silently saturate every sector, erasing saved/offline state → **on restore set `eco["_last_h"] = _now_h()`
  for every cell** (0.7). Never persist `_last_h` as gospel.
- **Wire Rat owed to a chunk with no wreck/junkyard.** It does **not** spawn; the count banks in `rodent_pop`
  (`return_unspent`) until a chunk with an anchor loads — rodents never appear in an open wreckless field.
- **Player burns every plant (plant_mass→0).** Every grazer gate fails → 0 grazers; grazer_pop drains →
  predators starve/leave; no plants/herds/birds/silence. The burn creates the ash-zone anchor (Ash-Goats).
  No crash — gated rows return 0.
- **Player wipes every grazer for meat.** grazer_pop→~0 → hunger climbs while feed→0 → STARVING in ~2 game-days
  (or minutes, near the den, via the kill impulse) → `grazer_low` gate already open → the nest takes the road.
  Intended "killing prey makes YOU prey."
- **Player destroys the nest.** `nest_strength=0` → predator_pressure=0 → the rodent cull term vanishes →
  rodent_pop climbs to `food_r` (visible Wire-Rat boom in P1) + disease + a neighbor claims the slot after
  `reseed_days`. Clearing predators is a real choice with a real downside.
- **Indoor corpse (basement/warehouse).** `exposed_bonus=0`, birds ignore it for the L4 layer (they can't see
  it) → it feeds **rodents**, not birds; no false NO-BIRDS chip.
- **Dust storm / night thins birds over a genuinely fresh corpse.** Intended — the recon tag appends the
  reason ("grounded (dust)") and the NO-BIRDS chip is suppressed while `weather.vision_mult() < 0.3` (the
  storm, not an apex, is the cause).
- **Player shoots his own vultures.** They SCATTER and won't re-form for ~8 s; a real kill can go unmarked —
  the info layer is a resource you can waste. Birds have no `take_damage`; you can't farm them.
- **Strike-ready nest but no fresh corpse for bird clues.** The contract still holds via body-independent
  clues: drag marks (last_hunt), bones (nest_strength), missing-birds (old `corpse_heat`), the **dog balk**.
  A prey-wiped, STARVING sector must surface ≥1 warning before any strike (sim-asserted).
- **Nest is a `StaticBody3D` → the couch drone scout can't see it** (`drone.gd:172`). The den carries a live
  `ProtoKnifeback` **sentinel** (group `threat`) so the scout marks it; clues are the scout's other intel.
- **`take_damage` signature is inconsistent (howler/gator use `(amount)`; horse/player use `(amount,attacker)`).**
  All new ecology actors standardize on `take_damage(amount: float, attacker: Node = null)` (the superset), so
  bullets/melee/cars/other-animals all hurt them and the WOUNDED state can remember its attacker; existing
  single-arg callers still work.
- **Occupied Florida flips to broadcast_church; bandits field ZERO gangs there.** Nature is orthogonal to
  occupation — ecology strength keys off biome/prey, not faction. Faith patrols **add** to `human_noise`,
  raising predator interest. The ecosystem stays active in occupied states.
- **`run_offline_catchup` still calls `events.roll_daily` per day, which spawns caravans/audio.** A pre-existing
  bug the ecology tick must **not** inherit — `advance_offline_day` is pure. Flag `roll_daily`'s offline
  side-effect for a separate fix so the briefing isn't polluted.
- **Old save predates `data["population"]`.** `.get("population", {})` restores zero cells; each re-bootstraps
  lazily with biome seeds. No `SAVE_VERSION` bump.
- **Multiplayer client.** `ProtoEcology._tick` bails on `net_is_client()` (like `bandits.gd:144`); enemies are
  host-authoritative, clients ghost them; the warning gate reads the **union** of both players' perceived clues.
- **Ocean / map-edge cell.** `biome_at` returns `ocean`; `ecology.json` has no ocean seed → all floats 0, no
  growth. Inert by construction.

---

## 6. Dependencies (bidirectional)

- **Reads:** `population.gd` (cells, `cell_key`, `safe_to_spawn`, `materialize_budget`, `serialize/restore`,
  `GROUPS`, `current_pop`, `protected`), `usmap.gd` (`cell_of`, `biome_at`, `state_at`, `road_near`,
  `placements_in`, `road_geometry`), `world_stream.gd` (chunk spawn, `_spawn_pop_actor`, biome scatter,
  gator/horse/lurker rolls, `LOAD_BUDGET`), `corpse.gd` (group `corpse`, `_age`, DECAY consts), noise bus
  (`emit_noise`/`noises_in`), `weather.gd`/`daynight.gd` (`vision_mult`), `world_state.gd`
  (`run_offline_catchup`, `controller_of`, `broadcast_queue`), `events.gd` (`war_state`, the seed idiom),
  `respect.gd` (add/relieve/esteem), `radio.gd` (`SIGNALS`/`LORE`/`broadcast_queue`), `hud_3d.gd`
  (`set_threat` stack, `set_recon_tags`, `toast` queue), `dog.gd` (`_sense`/`morale`/record pattern),
  `drone.gd` (scout/`mark_hazard`), `carousel.gd` (Choir anchors, P3), `metaworld.gd` (`force_raid`, P3),
  `audio.gd` (`play_at`/`attach_loop`/`attach_flat_loop`, the dir-scan asset law, `play_count` sim hook),
  `tools/soundforge/` (`generate.mjs` SFX, `voices.mjs` locked-voice VO).
- **Written for (these systems must be updated to reference this doc):**
  - `population.gd` — **must** host `row["eco"]`, add GROUPS `grazer`/`rodent`, add `tick_ecology` /
    `advance_offline_day`, and carry eco in `serialize`.
  - `corpse.gd` — **must** add the canonical `heat` (0.5) and emit `"carrion"` on spawn.
  - `world_state.gd` — **must** call `population.advance_offline_day` in the day loop (pure), and surface eco
    digest lines in the return briefing.
  - `hud_3d.gd` — **must** convert `set_threat` to the priority stack (0.9) and add the `toast` queue.
  - `proto3d.gd` — **must** instantiate `ProtoPopulation` + `ProtoEcology`, add the gunfire `emit_noise`,
    route save/restore through `population.serialize()`, and extend the `_amb` ambience pick with
    `amb_swamp` + the F-AMBIENT `birdsong_day` layer.
  - `audio.gd` — **must** add the §13 loop ids to `LOOPED` (`amb_swamp`, `birdsong_day`, `rat_scurry`,
    `knifeback_breath`, `corpse_flies`); everything else is file drops via its dir scan.
  - `tools/soundforge/manifest.json` — **must** gain the §13 entries (ids must match the rows' `sfx.id`s).
  - `INFECTED_TRIALS` (greenfield) — **must** set `corpse.infection` and `choir_zone` for Tower Birds /
    Whitewings / NO-BIRDS suppression and `infection_pressure`.
  - `POPULATION_WAR` — shares the same 500 m cell + `GROUPS`; the ecology GROUPS additions and `row["eco"]`
    must not collide with its `controlling_faction`/`current_pop` fields (they don't — parallel keys).
  - `BANDIT_CONVOY_ECOSYSTEM` — shares `hud.set_threat` (now a stack), the noise bus, and convoys as apex prey
    (a raided convoy seeds `corpse_heat` + the "missing caravan" radio line).
  - `WEATHER_AND_SEASONS.md` — the sky is an ecology DRIVER: regional `water_rot` wetting (W-WET, per cell
    not per player), `season_mult` on F-PLANT/F-GRAZER (the lean-season arc — winter is the hungry season),
    the seasonal dark-window offset stretching the NIGHT SHIFT (winter = the howler season), and
    per-position `vision_mult` in F-SENSE. That doc's §6 lists this one.
  - `CAROUSEL_PORTAL` / interiors — the howler den (§3.13, P2) rides the portal-to-interior pattern; den
    interiors are authored spaces, never carved terrain (GROUND_INTEGRITY's floor law).

---

## 7. Tuning Knobs

| Knob | Default | Range | Governs |
|---|---:|---|---|
| `h_rise` / `h_fall` (hunger) | 0.03 / 0.05 /gh | 0.02–0.06 / 0.03–0.08 | how fast a sector starves / recovers |
| kill hunger impulse | 0.06 /grazer | 0.02–0.15 | how fast over-hunting starves the packs (legible causation) |
| `n_grow` / `n_decay` (nest) | 0.006 / 0.02 /gh | 0.002–0.02 / 0.01–0.05 | how permanent a nest is |
| `threshold_base` / `cooldown_h` | 10 / 8 gh | 6–24 / 2–12 | watching before a hunt / hunt spacing |
| region `strength` (per state) | see §10 | 0–5 | commit pace (threshold only) + party size + variants |
| `MIN_WARNINGS` / `UNLEASH_WARNINGS` | 3 / 5 | 2–5 / 4–8 | fair-warning contract |
| `reseed_days` | 7 | 3–14 | how permanent clearing a nest feels; warn-decay |
| `CORPSE_HEAT_NORM` | 3.0 | 1–6 | bodies to saturate a sector's `corpse_heat` |
| `CLUSTER_R` / `FEAR_R` / `MAX_BIRDS` | 40 / 60 m / 7 | 20–80 / 30–120 / 3–16 | bird merge / no-birds distance / flock cap |
| `K_graze` / `K_rod` / `K_pack` | 4 / 6 / 3 | per zone_tag | realized creatures per sector |
| `BAIT_R` | 70 m | 40–120 | how far a bait drop calls a predator |
| `MAX_OFFLINE_DAYS` / threshold | 7 / 12 h | inherited | offline catch-up bound |
| time-to-first-ambush (near den) | ~2–3 real min | 1–8 | P1 causal-loop legibility (owner-tunable) |
| `BED_LIVE` / `BED_QUIET` | −22 / −50 dB | −18..−30 / −44..−60 | wildlife-bed loud/silent extremes (the audio NO-BIRDS) |
| `QUIET_TELL` | 0.15 | 0.05–0.3 | wildlife level below which silence credits warn bit 1 |
| call cadence `{HUNGRY, STARVING}` | 120 / 60 s | 60–240 / 30–120 | how talkative a hungry nest is (fair-warning pacing) |
| call ring / dB sweep | 90→30 m / −16→−4 | ±30 m / ±6 dB | how fast the howls close in as hunger rises |
| voice cooldowns (`sfx.cooldown_s`) | per row | 2–60 s | idle-call chatter density per species |
| `CHANGEOVER_MIN` | 20 game-min | 10–40 | how long the dusk/dawn handoff takes (the readable migration) |
| `NIGHT_PRED_MULT` | 2.0 | 1.5–3 | off-screen night predation rate (how much the dark eats) |
| `EYESHINE_M` | 60 m | 30–90 | eyeshine read distance (the night warning range) |
| night howler density / HOT cap | 1 per 4–6 cells / 1 pack | §15 bands | how owned the night feels (terror, not wallpaper) |
| blood-moon lift | cap +1, call ×0.5 | 0–2 / 0.3–1 | how bad a blood-moon night gets |

---

## 8. Acceptance Criteria (each a headless sim, real-path, no teleports)

**Phase 1**
1. `ecosystem_sim` — `ProtoPopulation`+`ProtoEcology` live; the FL Alley sector bootstraps; driving I-75
   accrues `human_noise`; grazer kills push `predator_hunger` past STARVING; the nest COMMITs a Knifeback road
   hunt spawned **outside** `safe_to_spawn`; asserts the balance law (strength scales commit ~1/strength, **not**
   1/strength²).
2. `grazer_herd_sim` — Mossbacks spawn as a **cluster**; a hostile inside `panic_range` flips the whole
   `herd_id` to alarm, all flee away + emit one `"stampede"` readable by `noises_in`; every spawn clears the
   never-in-view gate; the per-sector cap holds across chunks.
3. `knifeback_sim` — ambush→lunge (flat carry-through, no teleport)→bite via `take_damage(amount, attacker)`→
   drag back; WOUNDED→retreat-to-den not roam; `corpse_pending` on death.
4. `corpse_bird_sim` — a kill drops a corpse with `heat≈0.8`; heat decays with `_age`; a Road Vulture marker
   appears then thins, and **scatters on `emit_noise("gunfire")`**; a dust storm drops the same corpse's heat
   ~49% and suppresses the NO-BIRDS chip.
5. `warn_gate_sim` — with `warn_count=2` a strike-ready nest **defers** and force-spawns a clue; at 3 the strike
   is legal; at 5 + player-pressed it unleashes; a prey-wiped STARVING sector still surfaces ≥1
   (dog-balk / NO-BIRDS) warning before any strike; `warn_count` decays over `reseed_days`.
6. `sector_offscreen_sim` — save in FL, backdate 4 days, load → floats advance **purely**, `digest["changes"]`
   reports it, deterministic (same seed→identical floats), bounded (7 days), **zero actors spawned offline**,
   `_last_h` reset so no double-count.
7. `ecology_save_sim` — save→load round-trips `row["eco"]` + cells through `data["population"]`; an old save
   lacking the key loads clean (no `SAVE_VERSION` bump).
8. `ecology_audio_sim` — every `sfx.id` referenced by any creature row resolves in `ProtoAudio.streams`
   after `_build_all()` (file or synth fallback — a bad id is a data bug, caught headless); a herd alarm
   increments `ProtoAudio.play_count` AND lands its `pair_noise` in `noises_in` (0.10's one pairing point);
   F-AMBIENT: a healthy staged sector computes `bed_db > −32`, the same sector with a STARVING nest
   `< −42`, and 10 s of lingering there credits warn bit 1; a dispatch plays `knifeback_screech`
   positionally **before** any Knifeback is within the player's vision cone (calls-are-fair-warning);
   `play_at` self-frees on its timer (headless-safe, no leaked players after the run).
9. `night_shift_sim` — drive the clock (T-wait/`dev_mult`): at DUSK the staged Mossback herd paths to
   bed-down and the vulture marker roosts; while `is_dark()` a `strict_nocturnal` pack becomes eligible and
   realizes (off-view); **at any DAY hour, zero `strict_nocturnal` actors exist in the tree**; at DAWN the
   FLEE fires and the pack is gone before `daylight() > 0.5`; an overnight STARVING sector deposits
   F-NIGHT corpse_heat and the morning sweep spawns a vulture marker over it; eyeshine nodes are emissive
   and their perception sets a warn bit; blood-moon night lifts the cap by exactly +1.
10. `seed_budget_sim` — run the §15 procedural seeder over a staged 10×10-sector region: densities land
    inside the §15 bands; **no apex nest seeds without a viable prey shed** (the insta-starve guard); no
    two nests within 3 cells; nothing seeds in a protected bubble; same `WORLD_SEED` → byte-identical
    placement (determinism); a region seeded at 2× density shows the documented failure mode (wall-to-wall
    STARVING) — asserting the guard is what prevents it.
11. `body_law_sim` (0.11) — kill one of each actor type (NPC, companion, howler, grazer, Knifeback): every
    kill leaves the actor's own rig posed dead where it fell, lootable in place via the corpse container;
    **no `ProtoChest` (or any box-morph node) ever enters the tree on a kill**; the rigless fallback lump
    appears only when `create()` receives no rig.

**Phase 2 adds:** `den_raid_sim` — a seeded howler den mouth materializes on its anchor; entering
transitions to the den interior where `is_dark()` is forced and the pack is HOME at noon; a light cone
pushes them back (the generalized headlight law); clearing the den marks the range reclaimed and fires the
rodent-boom backfire.

**Phase 2** — `rodent_boom_sim` (clear nest → rodent explosion → disease → settlement problem);
`pack_variant_sim` (one skeleton, three region_mods; unknown state → default; fold law holds);
`radio_ecology_sim` (starving nest → `broadcast_queue` bulletin + `SIGNALS` `reveal_at`/`set_map_course` +
`LORE`); `nest_bounty_sim` (holdout bounty → esteem + relieve); `multi_biome_sim` (creatures resolve across
swamp/forest/farmland/plains/desert by biome + zone_tag).

**Phase 3** — `nest_expand_sim` (EXPANDING splits along roads, deterministic, cap-bounded);
`faction_ecology_sim` (Federal bio-control obeys `controller_of`; occupied-FL patrols raise `human_noise`);
`infected_ecology_sim` (Whitewing clean-land vs NO-BIRDS over Choir zones); `settlement_raid_sim` (starving
nest raids a holdout via `force_raid`; walls mitigate; briefing reports it); `regional_coverage_sim` (all 8
variants resolve across their real states).

New `class_name` scripts need one `--headless --path game --import` pass before headless runs. Every sim gets a
WATCHDOG timer; every sim restores the previous `Engine.time_scale`.

---

## 9. Phase Plan (the owner's explicit 1/2/3)

The map is genuinely sparse today (46 exits / 13 towns / one gator biome), so **Phase 1 is a Florida-only
vertical slice** on the deepest-authored ground, not the whole system. It ships on the greenlit "Four Days
Later: Florida Under New Law" living-world slice so its offline layer is proven the day it lands, and it copies
two battle-tested skeletons wholesale (`bandits.gd`→`ecosystem.gd`; `gator.gd`→`knifeback.gd`) so there is
almost no novel AI.

### PHASE 1 — "Alligator Alley Awakens" (minimum viable, Florida only)

**Where:** the I-75 swamp corridor TAMPA `(-5000,16750)` → MIAMI `(-2000,20500)` — the real Alligator Alley,
the only swamp band (451 cells), FL's 5 towns incl. holdouts ROSEWOOD/THE DRY DOCK, and **the gator already
spawns here** (`world_stream.gd:409-424`).

**V1 creature set (the owner's exact five):** Mossback (grazer), Wire Rat (rodent), Road Vulture (bird
marker), Razor Dog / **Glass Jackal** (pack — wild via a `world_stream` roll, re-skinned `howler`), **one
authored Knifeback nest** under an I-75 overpass. Plants = cover + signal scatter only (Glassgrass, Red Kudzu
over the den).

**The loop:** drive the Alley → engine/gunfire noise accrues → hunt Mossbacks → grazer_pop drops (kill impulse
spikes hunger) → the Knifeback nest goes HUNGRY→STARVING → after ≥3 fair warnings it COMMITs a **road hunt** →
kills leave corpses → `corpse.heat` draws vultures → you clear the den for ROSEWOOD → **the rats inherit the
stretch** → leave 4 days → return to one briefing line: *"Predators near the Alley have grown bold."*

**Systems (the honest P1, including the legibility essentials §3.10 — because the north star is FUN, not
plumbing):**
- **Prereq:** instantiate the dormant `ProtoPopulation`; tick on the game-hour boundary; `data["population"]`
  in save/load; extend GROUPS `grazer`/`rodent`.
- `ecosystem.gd` (`ProtoEcology`) — the one director: 6 floats evolve (plant_mass, grazer_pop, rodent_pop,
  corpse_heat, predator_hunger, nest_strength), others read-only/near-zero; nest states **FED/HUNGRY/STARVING**
  only; target scoring + human-gate **with the enforced warning contract**.
- `corpse.gd` `heat` (0.5) + the one **gunfire `emit_noise`** fix (unblocks bird-scatter *and* predator-draw).
- `creature.gd` (Mossback + Wire Rat) with herd cohesion + panic-reveal + the nest-in-wreck rule; budgeted
  spawns (0.4/0.6).
- `knifeback.gd` + den + sentinel; `bird_sign.gd` (Road Vulture, full language minus Whitewing/Tower/PERCH).
- **Legibility essentials:** the `set_threat` **priority stack** + `toast` **queue** (0.9); the **cause-stamped
  over-hunt beat** + **cause-named strike toast**; near-den ambush tuned to ~2–3 min; a **Bone Kite "being
  paced" tell**; **contextual save-flagged teaching**; the **dog balk**.
- **Agency in P1:** the **bait/lure** verb (substrate exists) + a legible **destroy-nest backfire** (visible
  Wire-Rat boom + holdout gripe) so P1 does not teach the wrong lesson.
- **The ear layer, P1 cut (§3.12):** `sfx` blocks on the V1 rows (Mossback voice, rat scurry loop, vulture
  wing-burst; jackal reuses `howl` at pitch 1.15); the **Knifeback screech + den breath** (its audio
  identity ships with it, day one); the **stampede** rumble; the **wildlife bed** (`amb_swamp` +
  `birdsong_day` on F-AMBIENT — the quiet-tell live in the Alley); F-CALL escalation for the one nest.
  ~10 SoundForge generations (§13 P1 rows); everything falls back to synth until the files land.
- **The night shift, P1 cut (§3.13):** the `strict_nocturnal` law on the howler (spawn gate + dawn burn-off
  mostly exist — formalize + fold its kills into `corpse_heat`); eyeshine long-range read; the Knifeback's
  day-den / night-hunt split; the dusk/dawn changeover for the ONE herd + the vulture roost/morning sweep;
  F-NIGHT off-screen predation. Blood-moon lift (one `events.gd` read).
- **Seeding, P1 cut (§15):** the deterministic per-cell seed roll + the viability guard, run over the Alley
  corridor only — the one authored den stays authored; the seeder proves itself on packs/herds/anchors.
- Offline advance (pure) → one briefing line. Sims 1–10 (§8).

**Deliberately NOT in P1** (add only when the Alley "feels good" — the owner's rule): the full 6-state machine
(BREEDING/WOUNDED/EXPANDING), a pack **director**, non-Florida biomes, the rodent-explosion *sim depth*, nest
expansion/migration, infected/Choir, MapForge authoring.

### PHASE 2 — broaden the ecosystem (no new architecture)

Full 6-state machine (extract `nest.gd`); the **rodent-explosion consequence** (nest_strength↓ → rodent_pop↑ →
disease → holdout settlement problem); the **regional pack table** (§10) via `creatures.json` region_mods;
more biomes (Fencehog/Pale Runner/Ash-Goat/Canebelly + Blackvine/Corn Ghosts + Sump Rat/Crate Mice/Carrion
Squirrel/Needle Mole); off-screen sector sim for **all** visited sectors; **radio** missing-caravan chatter;
**nest-clear bounties** (holdout job → esteem + relieve); the **named nemesis** (name + scar + trophy, if not
already pulled to P1); Ash Crow + Bone Kite + PERCH; the remaining clues; the burn/leave/destroy action loops
at full depth; escalate the contract to `UNLEASH_WARNINGS=5` across the wider corridor; the scent stimulus
layer + `feeding_grounds`/`corpse_sites`/`road_crossings` **learning**. **Audio P2:** bespoke voices for the
new roster (hog squeal, goat bleat, Canebelly bellow, crow gather, a proper `jackal_howl`) + **regional
variant voice re-skins as rows** (Church Wolf = `wolf_howl`, Salt Dog hunts blind so its *voice* is the only
tell); feeding/drag foley (`bones_crunch`, `drag_heavy`); the horse `car_door` placeholder fixed
(`horse_snort`); **radio VO** for the missing-caravan chatter via `voices.mjs` (§13 — the 4 LOCKED voices,
never change a `voice_id`). **Night P2:** full bed-down/roost migrations for the wider roster; howler-vs-
Knifeback territory competition (split `food_avail`); the seeder (§15) goes region-wide with per-biome
density rows; **the HOWLER DENS land** (underground mouth→interior, the day-raid counterplay, §3.13).
**Weather/seasons P2** (WEATHER_AND_SEASONS.md): the field's regional `water_rot` wetting + the
`season_mult` lean-season arc + winter's longer howler nights go live as ecology drivers.

### PHASE 3 — the full pressure system

**Expansion/migration** (a starved nest splits and founds a den in a neighbor sector along roads/rivers/rail —
"the problem is spreading"); **faction interplay** (Federal Remnant bio-control gated by `controller_of` +
`military_zone`; occupied-FL patrol noise; predators vs infected); **infected/Choir** (once `INFECTED_TRIALS`
ships: Whitewing clean-land vs NO-BIRDS over Choir/Carousel anchors, `corpse.infection` live, Tower Birds);
**off-screen settlement raids** (starving/expanding nest hits a holdout/homebase via `metaworld.force_raid`;
walls mitigate; briefing reports it); wind-biased scent; full `infection_pressure`/`water_rot`/`faction_activity`
coupling; full regional coverage; a **MapForge NESTS/ECOLOGY layer** (click-place dens + tune per-sector seeds,
the EXIT-NODES idiom). **Audio P3:** Choir-zone total suppression (near a Carousel anchor the bed AND the
calls die — the deepest silence in the game is a place); infected corpse-flies drone keyed to
`corpse.infection`; wind-biased call audibility (downwind howls carry, matching F-SENSE's wind term);
regional ambience beds per new biome as pure `amb_*` file drops.

---

## 10. Regional Variant Table (one skeleton, region mods — no new monsters)

All pack variants are **one base** (`howler.gd`'s brain) selected by a `creatures.json` row keyed off
`usmap.state_at` + biome + `world_state.controller_of`. Unknown state → the default row (the `bandits.gd:65`
idiom). Each row differs only in skin/color, sound, stat multipliers (à la `dog.gd BREED_MODS`), and behavior
**tags**.

| Variant | State(s) (real on the map) | Biome / anchor | Mods |
|---|---|---|---|
| **Glass Jackal / Swamp Hound** | FLORIDA | swamp / highway | fast, heat-tolerant, `road_hunting`; Swamp Hound = `swimmer`+`ambusher` at water's edge |
| **Church Wolf** | GEORGIA | forest/farmland; church placements | `territorial` around churches/graveyards, `nocturnal`, howl-summon |
| **Gutter Hound** | ILLINOIS / Chicago | urban | alley/garage `ambusher`, `scavenger`, `human_curious` |
| **Road Coyote** | TEXAS | plains/desert/highway | `cowardly`, dusk `road_hunting`, stalk-test-retreat |
| **Ridge Howler** | Appalachia (WV/KY/TN) | mountains | `migratory`, cold-country, long-range howl |
| **Salt Dog** | NEVADA | desert / salt flats | `blind` (hunts by `noises_in`), `nocturnal`, thirst-driven |
| **Canal Hound** | LOUISIANA | swamp/water/canals | `swimmer`, canal `ambusher` |
| **Federal Remnant bio-control** | any `federal_remnant` state, `military_zone` | any | `armored`, faction-obedient (spawn gated on `controller_of`), hunts infected |

The **apex** `nests.json` carries per-state strength 0–5 (the bandit-style dial): FLORIDA 3, GEORGIA 2, AZ/NM/
TX/IL/CA 2 (seeds; Phase 2+ fills the rest). Region strength scales commit pace + party size only.

---

## 11. File-by-file Integration Map (the reconciled manifest)

**New scripts**

| File | `class_name` | Phase | Role |
|---|---|---|---|
| `game/proto3d/ecosystem.gd` | `ProtoEcology` | 1 | THE director + static row dicts + hourly float tick + nest state machine + targeting + hunt dispatch + bird/clue coordination + `advance_offline_day`; copies `bandits.gd` |
| `game/proto3d/creature.gd` | `ProtoCreature` | 1 | data-driven grazers/rodents/scavengers on `ProtoQuadruped`; herd cohesion + panic; `take_damage(amount, attacker=null)` |
| `game/proto3d/knifeback.gd` | `ProtoKnifeback` | 1 | apex actor; copies `gator.gd` + `howler` role brain |
| `game/proto3d/bird_sign.gd` | `ProtoBirdSign` | 1 | bird marker + flock states; spawned/updated by the director |
| `game/proto3d/nest.gd` | `ProtoNest` | 2 | extraction of the full 6-state machine from the P1 director |
| `game/proto3d/pack_predator.gd` | `ProtoPackPredator` | 2 | L5 pack director/actor (P1 packs = re-skinned `howler` via a row, no new class) |

**New data:** `game/data/ecology.json` (coefficients, biome seeds, water_rot bases, zone capacities,
apex_biomes, warning constants, clue rows, action-loop deltas, tuning) · `game/data/creatures.json` (all fauna:
grazers/rodents/packs/birds — tags + region_mods + spawn_biomes + habitat_anchors + **`sfx` voice blocks**,
§3.12) · `game/data/plants.json` (L1) · `game/data/nests.json` (apex archetypes + per-state strength + den
anchors + call cadence). *(Clue/bird sub-tables may split out later; P1 folds them into
`ecology.json`/`creatures.json`.)*

**New assets:** `game/assets/sfx/*.mp3` from the §13 production list (~10 in P1, ~12 more P2/P3) — pure file
drops; `ProtoAudio`'s dir scan picks up any id with no code change, and every id falls back to a synth until
its file lands.

**Changed files**

| File | Phase | Change |
|---|---|---|
| `game/proto3d/population.gd` | 1 | host `row["eco"]` (seeded from biome); extend `GROUPS` with `grazer`/`rodent`; add `tick_ecology(now_h)`, `advance_offline_day(seed,day,digest)`, eco spawn-plan helpers; fold `ecology.json` on a code floor; `serialize/restore` already carry eco |
| `game/proto3d/proto3d.gd` | 1 | instantiate `ProtoPopulation` + `ProtoEcology` (near `bandits`, ~`:335`); tick both on the game-hour hook (`:4012-4017`); `data["population"]` in save (`:3556`) + restore (`:3690`); pass `population` to `stream.setup`; add `emit_noise(muzzle,60,"gunfire")` in the non-melee fire branch (`~:2181-2188`); `set_threat` priority stack + `toast` queue |
| `game/proto3d/corpse.gd` | 1 | **THE BODY LAW (0.11):** `create()` gains a `rig` argument — the killed actor's own visual, reparented + death-posed, IS the corpse; the 2-box lump becomes fallback-only. Plus `+var heat` (canonical F-CORPSE), decay in `_physics_process`, `+infection/indoors/gnawed`, one-shot `"carrion"` noise on spawn |
| every death path (`companion.gd` MORTAL chest, `npc.gd`, ecology actors) | 1 | audited onto the one body law — zero kills spawn a `ProtoChest`/box morph (`body_law_sim`) |
| howler DEN (mouth props; SURFACE den P2, portal interior P3 — AMERICAN_ROAD 0.9) | 2→3 | den-mouth prop rows (culvert/drain/basement) placed by the §15 seeder; P2 = wake-on-approach occupiers at the mouth (carousel `_spawn_occupation` pattern); P3 = walk-in/E → authored always-dark interior once portal tech is proven; den row = `{anchor_kinds, interior_id, pack_size, brood, loot_table}` |
| `game/proto3d/world_stream.gd` | 1 | `_materialize_ecology(chunk,center)` after `_materialize_population` — **per-cell `eco_spawned` guard + `LOAD_BUDGET` gate + `safe_to_spawn`**; plant scatter (tinted, meta `plant`); grazer herds + Wire Rats via `_spawn_pop_actor` arms; Knifeback den + sentinel at chunk-load; `set_meta("wreck",true)` on the wreck box |
| `game/proto3d/world_state.gd` | 1 | call `population.advance_offline_day(...)` inside `run_offline_catchup`'s day loop (pure, seeded); surface digest lines in the return briefing |
| `game/proto3d/hud_3d.gd` | 1 | `set_threat` → owner/priority stack (0.9); `toast` queue; reuse `set_recon_tags` for bird naming |
| `game/proto3d/dog.gd` | 1 | `_sense` BALK toward nest territory (stop/growl/tuck via `morale`), sets the dog-refuse warn bit; (P2) the named-nemesis record path |
| `game/proto3d/objectives.gd` (+ a save codex flag) | 1 | contextual, save-flagged first-encounter teaching (independent of the retiring first-run) |
| `game/proto3d/weapon.gd` | 1 | (alt site for) the gunfire `emit_noise` so shooting draws predators |
| `game/proto3d/audio.gd` | 1 | add loop ids to `LOOPED` (`amb_swamp`, `birdsong_day`, `rat_scurry`, `knifeback_breath`) — nothing else; new SFX are file drops via the existing dir scan |
| `game/proto3d/proto3d.gd` (ambience seam) | 1 | at the `_amb` pick (`:1427`): `amb_swamp` for the swamp biome + the `birdsong_day` layer volumed by F-AMBIENT (recompute on sector change, ~2 s crossfade) |
| `tools/soundforge/manifest.json` | 1→2 | append the §13 entries; `node tools/soundforge/generate.mjs <id>` per sound; VO lines via `voices.mjs` (the 4 LOCKED voices — never change a `voice_id`) |
| `game/proto3d/horse.gd` | 2 | replace the `car_door` mount placeholder (`:248`) with `horse_snort` |
| `game/data/population_targets.json` | 2 | add grazer/rodent desired counts to `swamp`/`house_field`/`industrial` zone rows |
| `game/proto3d/howler.gd` | 1→2 | P1: re-skinnable as the pack base via a row; **`strict_nocturnal` formalized** (spawn gate `is_dark()`, dawn FLEE retained), kills deposit `corpse_heat` (joins the food economy), eyeshine emissive read to `EYESHINE_M`, blood-moon cap lift. P2: cross-scan the `grazer` group so packs hunt prey; territory competition with the nest |
| `game/proto3d/radio.gd` | 2 | `SIGNALS` row + `_deliver` case + `LORE` breadcrumb for missing-caravan chatter (`:13,22,98`, model the `howlers` case `:127`) |
| `game/proto3d/respect.gd` | 2 | no code change — nest-clear bounties call existing `add_esteem` |
| `game/proto3d/metaworld.gd` | 3 | nest→settlement off-screen raids via `force_raid` |
| `game/proto3d/carousel.gd` | 3 | Choir anchors (`carousel.json bases[].pos`) become nest sites |
| `tools/mapforge/server.mjs` | 3 | NESTS/ECOLOGY authoring layer (den placement + per-sector tuning) |

---

## 12. Where X Lives (master table — grounded in the real `usmap.json`)

Biome counts (real): forest 2443 / farmland 1292 / plains 1237 / mountains 1020 / desert 917 / scrub 790 /
urban 527 / **swamp 451 (southern FL, Alligator Alley)**; 166 authored placements densest in IL/CA/SC/FL; the
deepest-authored slice is the VA/NC/GA/FL I-95/I-75 corridor (Meridian ≈ `(110,-325)`).

| Creature | L | Biome(s) | Habitat anchor | Real map places |
|---|---|---|---|---|
| Glassgrass | 1 | desert/scrub/plains/farmland | road shoulders, solar farms | interior-west corridor (NM/AZ/TX/CA), I-40/I-10 shoulders |
| Blackvine | 1 | urban/forest | ruined_house/house_small, roadside | dead suburbs — IL, CA, SC, FL |
| Rot Bloom | 1 | swamp/forest/urban | water edges, ruined basements, **on corpses** | southern FL swamp; anywhere `corpse_heat` collects |
| Corn Ghosts | 1 | farmland | farmhouse_field, roadside | central farm band — MO, IL, KS |
| Red Kudzu | 1 | forest/swamp/farmland | road shoulders (covers roads), ruins | the Southeast — GA, SC, FL, NC; the I-75/I-95 corridor |
| Mossback | 2 | forest/mountains | off-road cover | Appalachia + northern forest, western Rockies |
| Fencehog | 2 | farmland/forest | farmhouse_field, broken fences | Southeast + midwest farms/forest edges |
| Pale Runner | 2 | plains/scrub | open ground near roads | the Great Plains band + western scrub |
| Canebelly | 2 | swamp | water edges | **southern FLORIDA only** + LA canals |
| Ash-Goat | 2 | scrub/desert/farmland | ruins, **burn/ash zones** | SW fringe; **any sector the player has burned** |
| Wire Rat | 3 | any (via wrecks) | **wrecked cars**, substations, junkyards, auto shops | everywhere there are wrecks — every road |
| Crate Mice | 3 | urban | **warehouses, markets** | town cores — IL/CA |
| Sump Rat | 3 | urban | **sewer grates** (after rain, night) | big cities during/after rain (P2 sewer micro-prop) |
| Carrion Squirrel | 3 | forest/urban/farmland/swamp | **follows corpses** | wherever bodies are — battle roads, kill sites |
| Needle Mole | 3 | farmland/plains/forest | **soft soil, basements** | farm/plains soil; under ruins |
| Road Vulture | 4 | any | over corpses/wrecks/roads | above every kill site — the universal death marker |
| Ash Crow | 4 | farmland/plains/scrub | roadside, open sky | farm/plains skies before storms / after shootings |
| Bone Kite | 4 | any | over predator territory | above nests + trailing a hunted player's car |
| Tower Bird | 4 | urban | **radio towers, tall ruins** | city radio towers, police stations |
| Whitewing | 4 | any | clean open land | only where `infection_pressure` low — **its absence marks danger** |
| Razor Dog / variants | 5 | per §10 | dusk roads, dens | see the regional table |
| **Howler** (`strict_nocturnal`) | 5-night | any, road-adjacent | night ranges above ground; **UNDERGROUND DEN by day** (culvert/drain/basement mouth → portal interior, §3.13 — P2) | wherever `is_dark()` — 1 range per 4–6 cells (§15); never seen above ground by day — find the den mouth and go down after them, if you dare |
| **The Knifeback** | 6 | swamp/urban/industrial/forest | **overpasses, drainage tunnels, collapsed malls** | P1: one den under an I-75 overpass in the FL swamp; P2+: FL/GA/AZ/NM/TX/IL/CA |

---

## 13. Audio Production List (SoundForge)

Each row is one `tools/soundforge/manifest.json` entry (`{id, duration_seconds, prompt_influence, prompt}` —
id **must** match the `sfx.id` the creature rows reference). Produce with
`node tools/soundforge/generate.mjs <id>` → the mp3 lands in `game/assets/sfx/` → re-import → `ProtoAudio`
picks it up by dir scan, **zero engine code**. Until a file lands, every id needs either a synth fallback or
silence-by-default — ship order never blocks on audio. Loops must ALSO be added to `ProtoAudio.LOOPED`.
`prompt_influence` ≈ 0.5 house-standard. House prompt style: dry, close, short tail, no reverb wash, gritty.

| id | P | dur s | loop | prompt |
|---|---|---:|---|---|
| `mossback_call` | 1 | 1.6 | | Mutated elk bugle: a low mournful deer call with a wet, wrong harmonic under it, distant forest, single call, dry, no birdsong |
| `mossback_alarm` | 1 | 1.0 | | Deer alarm snort-bark: one sharp panicked exhale-bark from a large ungulate, close, dry, cut tail |
| `stampede` | 1 | 3.0 | | Small herd of heavy hooved animals bolting across packed dirt and cracked asphalt: rumbling hoofbeats rising then receding, a few panicked bleats, no music |
| `rat_scurry` | 1 | 3.0 | ✔ | Rats moving inside a wrecked car: tiny claws on rusted sheet metal, intermittent scratches and squeaks, seamless loop, claustrophobic, close, dry |
| `vulture_wings` | 1 | 1.2 | | A flock of large vultures bursting into flight at once: heavy wing flaps, a rasping croak, feathers beating air, close, dry |
| `vulture_caw` | 1 | 1.0 | | Single vulture rasp-croak overhead, hoarse and ugly, mid-distance, open air, dry |
| `knifeback_screech` | 1 | 2.2 | | Large unknown predator screech: a metallic rising shriek that breaks into a guttural clicking snarl, part animal part scrap-metal scrape, terrifying, mid-distance, dry — THE apex identity, never reused for anything else |
| `knifeback_breath` | 1 | 4.0 | ✔ | Huge animal breathing slow in an concrete underpass: deep wet rhythmic breaths with a faint bone-rattle on the exhale, seamless loop, very close, claustrophobic |
| `amb_swamp` | 1 | 6.0 | ✔ | Southern swamp at dusk ambience bed: frogs, crickets, distant water plops, thick insect drone, seamless loop, no birds, no music |
| `birdsong_day` | 1 | 6.0 | ✔ | Healthy daytime wild birdsong bed: layered small songbirds, occasional woodpecker knock, seamless loop, open country, no wind rumble — the layer that DIES when the land does |
| `knifeback_lunge` | 2 | 0.9 | | Big predator launching: explosive claw-scrabble on concrete then a whipping air rush, fast, close, dry |
| `bones_crunch` | 2 | 1.4 | | Large animal feeding: wet crunching of bone and cartilage, tearing sinew, unhurried, close, dry, no growling |
| `drag_heavy` | 2 | 2.5 | | Heavy carcass dragged over dirt and gravel: rhythmic scraping slides with claw steps between, receding slightly, dry |
| `hog_squeal` | 2 | 1.2 | | Wild hog alarm squeal: one furious rising pig squeal, harsh, close, dry, cut tail |
| `goat_bleat` | 2 | 0.9 | | Scrappy goat bleat, single dry ragged call, close, a little hoarse, dry |
| `canebelly_bellow` | 2 | 2.0 | | Huge swamp herbivore bellow: a deep water-buffalo moan with a gurgling wet undertone, mid-distance over water, dry |
| `crow_gather` | 2 | 2.2 | | A murder of crows gathering and arguing: overlapping harsh caws, wing rustle, mid-distance, open farmland, dry |
| `jackal_howl` | 2 | 2.0 | | Thin desert jackal howl: a high wavering yip-howl answered faintly by two others, night, mid-distance, dry |
| `wolf_howl` | 2 | 2.5 | | Lone wolf howl, long and cold, rural night, distant church bell ghost-faint underneath, single howl, dry |
| `rat_squeak` | 2 | 0.6 | | One rat squeak-hiss, sharp and small, very close, dry |
| `horse_snort` | 2 | 1.0 | | Horse snort and soft stamp: one breathy nostril snort plus a single hoof shift on dirt, close, calm, dry |
| `corpse_flies` | 3 | 4.0 | ✔ | Dense blowfly swarm over carrion: thick circling insect buzz, seamless loop, close, nauseating, dry |

**Radio VO** (P2, `tools/soundforge/voices.mjs` — the 4 LOCKED voices; **never change a `voice_id`**):
`vo_radio_caravan_lost` — *"…Peach Combine run's three days overdue past the Alley — anybody seen 'em?…"* ·
`vo_radio_overpass` — *"…truckers are sayin' don't stop under the I-75 overpass after dark. They ain't sayin' why…"* ·
`vo_radio_rats` — *"…ever since somebody cleared out whatever lived under the Alley, Rosewood's crawlin' with rats. You break it, you bought it…"*
Delivered through the existing `radio.gd` `_deliver` path (§3.8's SIGNALS row); each line also exists as a
text bulletin first (the media-layer fallback law: text always works).

---

## 14. How To Add An Animal (the cookbook)

The whole point of the data spine: **a new animal is a ROW, never code.** The recipe, end to end:

1. **Pick the base** — grazer / rodent / bird / pack / apex. That decides the class that renders it
   (`ProtoCreature`, `ProtoBirdSign`, `ProtoPackPredator`, `ProtoKnifeback`-alike) — you never touch it.
2. **Write ONE row** in `creatures.json` (unknown id **adds**; the fold law). Field checklist:
   `id, name, emoji, layer, tags[]` (Body/Behavior/Region — §3.4; tags carry the stats & verbs),
   `biomes[], regions[], habitat_anchors[], activity[]`, `sector_float`,
   `spawn_density{base, drivers, cap, gate}` (the float→count curve),
   `quad_params{scale,color,tail,snout,ears}` (**no purple**), `max_hp, base_speed, flee_speed`,
   herd/swarm + `panic_range` (prey) or roles (pack), `diet[], predators[], food_value`,
   `noise{idle,alarm}`, **`sfx{idle,alarm,hurt,death}`** (§3.12 — reference existing ids like
   `growl`/`hurt`/`body_thud` to ship silent-of-bespoke today), `loot{}`.
3. **Voice it (optional, later is fine)** — add §13-style entries to `soundforge/manifest.json`, run
   `node tools/soundforge/generate.mjs <id>`, re-import. The dir scan does the rest. Loop → add to `LOOPED`.
4. **Gait it (optional)** — a MotionForge row in `motions.json` under the creature's rig key (the horse
   `"horse"` pattern); tune on the treadmill stage (`res://proto3d/tools/motion_stage.tscn`).
5. **F10 refold → it's alive.** Verify: `ecology_rows_sim` (row folds), `where_lives_sim` (spawns only in
   its biomes/anchors), `ecology_audio_sim` (every `sfx.id` resolves).

**When you DO need code:** only a genuinely new **Behavior-tag VERB** (say, `dam_builder` or `web_spinner`)
— implement the tag handler once in the owning class, and every future row reuses it. A new skin, stat
spread, region, voice, herd size, diet, or habitat is never code.

**Worked example — the Ridge Elk (Appalachia, ~20 min):**
`tags:["quadruped","large","grazer","cowardly","climber","mountain","forest"]`, `biomes:["mountains",
"forest"]`, `regions:["WEST VIRGINIA","KENTUCKY","TENNESSEE"]`, `spawn_density:{base:0,drivers:
{plant_mass:5},cap:3,gate:{plant_mass:{min:0.15}}}`, `quad_params:{scale:2.4,color:[0.32,0.30,0.24],
tail:0.35,snout:true,ears:true}`, `sfx:{idle:{id:"elk_bugle",db:-12,cooldown_s:[25,60]},alarm:
{id:"mossback_alarm",db:-4,pair_noise:{r:38,kind:"stampede"}}}` + one manifest entry
(*"Rocky-mountain elk bugle echoing off a ridge, single long call, cold air, distant, dry"*) + `generate.mjs
elk_bugle`. No code. It herds, panics, reveals predators, feeds nests, and dies into the vulture economy —
every system in this spec picks it up from the row alone.

---

## 15. Procedural Seeding Budget — how much of what, for the system to function

Nothing is hand-placed (the one authored P1 den excepted). Everything seeds from **deterministic per-cell
rolls** at cell bootstrap — `rng.seed = hash("ecoseed:%s:%d" % [cell_id, WORLD_SEED])` (the chunk-hash
idiom, `world_stream.gd:258`) rolled against per-biome density rows in `ecology.json` — so the same world
seed always grows the same wilds, saves are stable, and retuning distribution is editing rows, never code.
Candidacy resolves to reality only when a qualifying **anchor** exists at chunk load (a den needs an
overpass/industrial/ruin; no anchor → the candidacy silently lapses), so densities concentrate on
infrastructure automatically — which IS the fiction. A P3 MapForge layer can pin/override any of it.

### 15.1 The stability arithmetic (why these numbers)

The budget falls out of the spec's own fixed points — this is the "if this happens, that happens" made
placement math:
- **A nest is stable iff `food_eff ≥ 0.375` sustained** (F-HUNGER fixed point at pop_load 1). With
  `food_avail = 0.5·grazer + 0.3·rodent + 0.4·corpse`, that means roughly **grazer_pop ≈ 0.6, or 0.45 +
  healthy rodents** in the nest's sector.
- **Grazers equilibrate near `plant_mass − 1.67·predator_pressure`** (F-GRAZER fixed point) — a FED nest
  (pp ≈ 0.17) drags its own larder down ~0.28. So a nest's own cell can't feed it alone at typical
  plant_mass; it needs a **PREY SHED**: the 3×3 block around the den averaging `plant_mass ≥ 0.55` with
  **≥4 grazer-capable cells** (P2 migration rebalances grazers into the culled cell; P1's authored den
  sits on the swamp's densest band, which satisfies this by placement).
- **Therefore the seeder must enforce the VIABILITY GUARD:** roll a nest candidacy only where the shed
  test passes — *else skip*. This is the single most important rule in the section: dense-seeding nests
  onto land that can't feed them produces wall-to-wall STARVING sectors, which turns "the roads become
  meat" from a story into noise. An unstable nest is a design bug, not extra content.

### 15.2 The budget table (per 10×10-sector region ≈ 5×5 km; the FUNCTIONAL bands)

| What | Seed rate (eligible cells) | Realized on screen | Floor (below = feels empty) | Ceiling (above = collapse) |
|---|---|---|---|---|
| Plants | biome-given (`biome_seed` rows) — free | scatter per §3.4 | ≥40% of cells plant-capable | — (plants can't overshoot) |
| Grazer herds | grazer_pop seed 0.25–0.35 in plant-capable cells | 1 herd (3–6 heads) per **2–3** plant cells | 1 herd / 4 cells | 1 herd / cell (grazing outstrips F-PLANT regrowth) |
| Rodent anchors | ride the existing wreck/placement rolls — every wreck IS one | swarms per anchor, `K_rod` cap | ≥1 anchor per road-shoulder cell | — (anchor-bound, self-capping) |
| Day packs (Razor Dog line) | 1 den per **6–10** eligible cells | ≤2 packs realized in the HOT 3×3 | 1 / 12 cells | 1 / 4 cells (they strip the grazer floor the nest needs) |
| **Howlers (night)** | 1 night-range per **4–6** road-adjacent cells | **hard cap 1 pack realized per HOT set** (terror, not wallpaper); blood moon +1 | 1 / 8 cells | 1 / 3 cells (night becomes a shooting gallery, fear dies) |
| **Apex nests** | **1 per 15–25 eligible cells** (≈ one per 8–12 km of corridor), never within **3 cells** of another (territorial law), never in a protected bubble, **viability guard mandatory** | 1 den + parties per §3.5 | 1 per 30 cells (the apex never enters the player's story) | 1 per 10 cells (sheds overlap → chronic starvation everywhere) |
| Birds | **never seeded — always derived** (corpse_heat / nest / infection) | per F-BIRDS | — | — |

Read the table as: **the system functions anywhere between floor and ceiling; the seed-rate column is the
tuned center.** All seven rates ship as `ecology.json` `seed_density` rows keyed by biome (swamp/forest
rich, desert/plains sparse, urban rodent-heavy), so "how much of what" stays a data question forever.

### 15.3 What the seeder actually does

1. At cell bootstrap (`_new_cell`): hash-roll nest/pack-den **candidacy** vs the biome's `seed_density` row;
   store a flag, spawn nothing.
2. Nest candidacy → run the **viability guard** over the 3×3 shed (plant seeds are known from biomes — no
   simulation needed at seed time). Fail → drop the flag.
3. At chunk load: candidacy + qualifying anchor present → materialize the den/dens (off-view, before
   arrival, the gator pattern). No anchor in any of the cell's chunks → lapse.
4. Herds/rodents need no placement at all — they ARE the float seeds (§3.2) realized by §3.6.
5. Spacing, protected-bubble, and HOT-cap laws enforced at realization, asserted by `seed_budget_sim`.

### 15.4 Banked, NOT greenlit — HUNTERS (the humans who come looking)

The owner's forward idea, recorded so the seams stay open, deliberately undesigned: **hunters** — NPC
parties who track the night things *without knowing what they are*. Everything they need already exists in
this spec by design: they read the SAME clue rows the player does (§3.8 — drag marks, gnawed kills,
eyeshine reports), camp at dusk near suspected territory (the campfire is bait the spec already understands
— noise + light + livestock), feed the radio chatter seam ("fellas at the rest stop swear they saw eyes"),
and plug into the existing bounty/`respect` economy the nest-clear jobs use. The `strict_nocturnal` law is
what makes them possible: nobody who hunts by day has ever *seen* one, so the hunters are always wrong
about what it is — that dramatic irony is the content. **Do not build any of this until greenlit; this
paragraph exists so nothing in Phases 1–3 forecloses it.**

---

*End of spec. Phase 1 = "Alligator Alley Awakens." The land talks — to the eye (§3.7–3.8), the ear
(§3.12), and differently after dark (§3.13) — before it bites. A new animal is a row (§14); its voice is a
file; its numbers are §15's bands. Nothing broadens until the Alley feels good.*
