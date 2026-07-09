# THE FLOOR IS LAW — ground integrity (the highway fall-through)

**Status:** SPEC (owner report 2026-07-08 evening: *"I just fell through the ground while on the highway"* — driving, DIVIDED STATES, Virginia session).
**Scope:** `world_stream.gd` · `world_builder.gd` · `car_3d.gd` · `proto3d.gd` · new `ground_integrity_sim`.
**Log note:** Godot keeps 5 rotated logs; three MOTION-STAGE launches at 20:59 rotated the fall session's log away before it could be read. That is itself a finding — **rule 6 below instruments the next fall so it self-reports.**

---

## 1. Overview

The car drives on the FLOOR, never on the road — asphalt is `box_visual` paint with **no collision** (`world_stream.gd:599-627`). Inside the authored core (±6,000 m) the floor is one 12,000×12,000×**1.0 m** box (`world_builder.gd:386-392`) — effectively unfallable. Beyond it, every chunk brings its own floor: a **0.5 m-thick box** or a relief `HeightMapShape3D`. Four verified weaknesses stack up out there, all on the interstate driving path, and there is **no safety net anywhere** (zero `y <` guards in the codebase) — so any one of them turns into "I fell through the world and kept falling." This spec closes the class: a void net that catches and *reports*, a floor-first build law, CCD + thicker floors against tunneling, seam-cliff removal, and real bridge decks.

### The defect ledger (verified receipts)

| # | Weakness | Receipt |
|---|---|---|
| G1 | **No void safety net.** Nothing catches a body below the world; a fall is unrecoverable and undiagnosed. | grep `position.y < -` across proto3d/player/car: zero hits |
| G2 | **Floor is built LAST in a chunk.** `_spawn_chunk` spawns authored placements and exit signs FIRST (`world_stream.gd:262-272`), ground after (`:277`). A runtime error in any placement row aborts the function → a half-built chunk **with no floor** sits in the world, and `loaded[key]=null` hides it from the unloader. One bad row on a highway chunk = a floorless chunk on the interstate. | `world_stream.gd:252-306` order |
| G3 | **Tunneling margin fails at top speed.** Chunk floors are 0.5 m thick (`world_stream.gd:291,298`); no vehicle sets `continuous_cd` (grep: zero hits). Top speeds: motorcycle 38 m/s, scavenger 34 (`vehicles.json`). Per physics tick (60 Hz) a 38 m/s body moves 0.63 m — **more than the floor is thick**. A landing off a relief crest adds ~12 m/s vertical. | consts + grep |
| G4 | **Relief↔flat seam cliffs beside highways.** The floor-type decision samples `relief_at` at the chunk CENTER only (`world_stream.gd:284`). Roads flatten relief within 90 m + 90 m fade (`world_builder.gd:44-45`), so chunks along a highway are flat-band — but their neighbors one chunk out are full relief (Virginia 0.3 → ridges to 7.2 m, `STATE_RELIEF`, `RELIEF_MAX_M=24`). At the seam: a vertical cliff wall, and cars launching off it land at speed on a 0.5 m floor (→ G3). | `world_stream.gd:284` + `world_builder.gd:42-52,59-98` |
| G5 | **Bridges have no deck.** A wet road stretch gets RAILS only (`world_stream.gd:628-633`); the "deck" you see is paint at y≈0.09 while the physical floor is the water box, top at **y=−0.23** (`:294`). Cars cross rivers sunk 30 cm through the visual deck — and the rails' gaps at chunk seams drop wheels onto the lakebed edge. | `world_stream.gd:592,628-633,294` |

*(Cleared suspects, for the record: the streamer correctly follows the CAR in DRIVE mode (`proto3d.gd:917`); the authored slab (±6,000) overlaps the chunk-floor regime (centers >5,800) with no ring gap; `_relief_floor`'s HeightMapShape is correctly scaled (`world_stream.gd:192`); adjacent chunk floors overlap by 2 m so there are no hairline seams; steady-state streaming keeps ~2 chunks of floor ahead at any legal speed.)*

## 2. Player Fantasy

The wasteland can kill you a hundred honest ways — the ground is never one of them. You crest a Virginia ridge at full throttle, land hard, blow a shock maybe — but the world HOLDS. Bridges are steel you can trust at speed. And if the impossible ever happens, the wasteland spits you back onto the shoulder with a grunt, not a black void and a lost run.

## 3. Detailed Rules

1. **THE VOID NET (G1).** Every physics tick, if the player (on foot) or the active car sits below `VOID_Y = −6.0` — deeper than any authored content — the body snaps to its **last-known-good ground position** (a ring buffer of the last 4 positions sampled 0.5 s apart while grounded), velocity zeroed, no damage, one toast ("⚠ the ground gave way — hauled back"). NPC cars/threats below `VOID_Y` are simply freed (they re-materialize from their systems).
2. **FLOOR-FIRST CHUNK LAW (G2).** `_spawn_chunk` builds the GROUND before any content: reorder to ground → roads → placements → exits → scatter. Additionally, each placement/exit spawn validates its inputs (scene exists, row fields present) and `push_warning`s + skips on failure instead of aborting the build — a bad row costs one prop, never the floor.
3. **TUNNELING MARGIN (G3).** (a) Every `ProtoCar3D` sets `continuous_cd = true` (VehicleBody3D inherits RigidBody3D's CCD). (b) Chunk floor boxes thicken 0.5 → **2.0 m**, extended DOWNWARD (top face unchanged — zero visual delta, 3× margin over the fastest vehicle). (c) The relief heightmap keeps its shape but gains rule 1 as its backstop (heightmaps have no thickness to extend).
4. **SEAM-CLIFF LAW (G4).** The floor-type decision samples `relief_at` at **five points** (center + four corners); ANY sample > 0.02 → relief floor. The height FIELD is already continuous and already fades to zero near roads, so a relief floor is correct everywhere — the flat box is only an optimization for fully-flat chunks. Five samples kill both the cliff wall and the launch lip beside every highway through a relief state.
5. **BRIDGES ARE REAL DECKS (G5).** A wet road stretch adds a `box_body` DECK per carriageway — same footprint as the paint slab, top at the paint's y — between the existing rails. Driving a bridge means driving the deck. Rails stay. (The paint stays visual; the deck is a second, invisible-thin collider — one body per stretch, cheap.)
6. **EVERY FALL SELF-REPORTS.** The void net logs one structured line before rescuing: position, chunk key, `loaded.has(key)`, whether that chunk node has a floor child, speed, and mode. Rotated logs can never eat the diagnosis again — the line also lands in the HUD toast history (dev mode F10 shows it).

## 4. Formulas

**Tunneling bound (G3):** max per-tick displacement `d = v / tick_hz`. Motorcycle: `38 / 60 = 0.63 m` > 0.5 m floor → tunnel possible TODAY head-on; with landing vertical speed `v_y = √(2·g·h)` (8 m relief drop → 12.5 m/s), the combined step vector reaches ~0.75 m. New floor thickness 2.0 m holds to `2.0·60 = 120 m/s` — 3.2× the fastest rig. Ranges: floor 1.5–3.0 m safe; CCD stays on regardless (hitches multiply steps, not step length).

**Cliff height at a G4 seam:** `h = n² · r · RELIEF_MAX_M` with `n∈[0,1]` noise, `r` the state knob. Virginia `r=0.3` → worst 7.2 m; Colorado `r=1.0` → worst 24 m. After rule 4 the seam renders from the same continuous field on both sides → `h_seam ≡ 0` by construction.

**Void net memory:** ring of 4 samples at 0.5 s → rescue point is 0.5–2.0 s behind the fall, always a position that was grounded (`is_on_floor()` / wheel contact) — never inside the hole that just ate you. `VOID_Y = −6`: authored basements/water beds bottom out above −1.5; relief valleys ≥ 0; −6 is unreachable except by falling through (safe range −4 to −20).

## 5. Edge Cases

- **Fall during a jump/dive over a real edge** (bridge rail gap, cliff): the net only fires below `VOID_Y = −6` — a legal 24 m relief drop still lands ON ground (y ≥ 0) and never triggers it.
- **Rescue into a since-unloaded chunk:** the rescue point is ≤ 2 s old; the ring (RING+1 hysteresis) cannot have unloaded it that fast at legal speeds. If the chunk IS somehow absent, the fresh-arrival path (`world_stream.gd:104-108`) fills the ring synchronously on the next tick — the documented, acceptable hitch.
- **Passenger riding an NPC car** (autopilot shotgun rides): the streamer follows the PLAYER node; the seat-anchor system moves the player with the car, so the ring tracks correctly — asserted in the sim, not assumed.
- **Net vs. death:** if hp hits 0 mid-fall (burning car), death wins; the corpse/rig is freed with the car and normal respawn law applies (`respawn_at_home`).
- **Multiplayer:** the void net is client-local for your own body/car (client-authoritative movement law); a remote ghost below `VOID_Y` is visually frozen at its last packet — the owner's own net rescues the truth and the next sync corrects the ghost.
- **A placement row that fails EVERY load** (missing scene file): rule 2 logs the same warning each time its chunk builds — loud by design, one prop missing, floor intact.
- **Trailer/towed bodies:** the trailer follows its tractor through the tractor's rescue (re-hitched at the rescue point); a solo trailer below void is freed.

## 6. Dependencies

- **`world_stream.gd`** — rules 2, 3b, 4, 5 (chunk build order, floor thickness, five-point sampling, bridge decks).
- **`world_builder.gd`** — `relief_at`/`ground_y` unchanged (the field is already continuous; rule 4 just samples it honestly). `TERRAIN_RELIEF.md` must gain a pointer here (its "wilderness-only" law now samples per-corner — bidirectional).
- **`car_3d.gd`** — `continuous_cd = true` (rule 3a); wheel raycasts unchanged.
- **`proto3d.gd`** — the void net tick + last-good ring + toast (rule 1, 6); `ROAD_TRAFFIC_OVERHAUL.md` gains the bridge-deck pointer (its §"bridge" currently means rails+paint).
- **Traffic/motorists** — ambient lane-followers are kinematic path-riders (no floor dependence); PROMOTED cars become real physics and inherit the same floors + net rule (freed below void).
- **Save/load** — no schema change; the net is runtime-only state.

## 7. Tuning Knobs

| Knob | Stock | Safe range | Affects |
|---|---|---|---|
| `VOID_Y` | −6.0 | −4 to −20 | How deep counts as "through the world"; too shallow risks eating legal stunt air near water beds |
| `GOOD_POS_INTERVAL` | 0.5 s | 0.25–1.0 | Rescue-point freshness vs. "rescued into the same hole" risk |
| `GOOD_POS_RING` | 4 | 2–8 | How far back the net can reach (interval × ring) |
| floor thickness | 2.0 m | 1.5–3.0 | Tunnel margin; below 1.0 re-opens G3 at top speed |
| relief samples/chunk | 5 | 5 or 9 | Seam-cliff coverage; 9 (3×3) only if a diagonal cliff ever survives 5 |
| bridge deck height | paint y (≈0.09) | ±0.02 | Wheel-drop onto deck vs. z-fight with paint |

Balance note: the net deliberately costs NOTHING (no damage, no scrap) — falling through the world is always OUR bug, never the player's mistake. Real cliffs and bridge-rail gaps still cost you the old-fashioned way.

## 8. Acceptance Criteria

New **`ground_integrity_sim`** (headless), plus one live check:

1. **Floor-under-every-highway sweep:** for each interstate row in `usmap.json`, sample K=200 points along the polyline beyond the slab; force-load each point's chunk; raycast down from y+50 → EVERY ray hits a collider whose top is within [−0.30, ground_y(x,z)+0.30]. Zero misses.
2. **Void net:** teleport the active car to (x, −10, z) at 30 m/s → within 2 physics ticks it sits at the last-good position, velocity zero, hp unchanged, toast fired once, the diagnostic line printed. Repeat on foot.
3. **Floor-first:** inject a corrupt placement row into a test chunk's build → the chunk still has a floor collider child; a `push_warning` fired; the sim's ray from above still lands on the floor.
4. **Tunneling:** drop a scavenger nose-first from 10 m at 34 m/s forward onto a fresh chunk floor, 50 deterministic repeats (seeded) → final chassis y > floor top − 0.1 every time.
5. **Seam-cliff:** build two adjacent chunks straddling a road-fade boundary in a relief state → the maximum floor-height step sampled every 0.5 m along the shared seam is < 0.15 m.
6. **Bridge deck:** at a wet highway crossing, raycast down at mid-carriageway → first hit is the DECK within 0.05 of the paint y (not the water box at −0.23).
7. **Playtest DO→EXPECT (PLAYTEST_GUIDE):** drive I-95 flat-out through Virginia hills for 4 in-game minutes → never below the world; cross any river bridge at speed → wheels stay on the deck; F10 dev mode shows zero void-net rescues in the session (the net exists but nothing triggers it).

---

## 9. Build order (each task sim-gated, commit per task)

| # | Task | Files |
|---|---|---|
| 1 | THE VOID NET + self-report line (G1, rule 6) — the catch-all lands FIRST so any remaining hole self-diagnoses | `proto3d.gd` |
| 2 | Floor-first chunk build + defensive placement spawns (G2) | `world_stream.gd` |
| 3 | CCD on + 2.0 m floors (G3) | `car_3d.gd`, `world_stream.gd` |
| 4 | Five-point relief sampling (G4) | `world_stream.gd` |
| 5 | Bridge decks (G5) | `world_stream.gd` |
| 6 | `ground_integrity_sim` (all 6 checks) + PLAYTEST_GUIDE block + doc pointers (TERRAIN_RELIEF, ROAD_TRAFFIC_OVERHAUL) | tests + docs |
