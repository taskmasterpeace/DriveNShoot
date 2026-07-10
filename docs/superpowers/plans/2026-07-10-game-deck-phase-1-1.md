# Game Deck Phase 1.1 — Complete Handheld Shelf

> Execute with `superpowers:test-driven-development` and
> `superpowers:verification-before-completion`. Run Godot sims serially because
> they share `user://`.

**Goal:** Ship all ten handheld cartridges through the one Game Deck contract,
including the nine remaining rule-complete games, declared aspect ratios,
deterministic challenge seeds, original procedural art, passenger play, and the
complete in-world handheld strategy guide.

**Architecture:** Each cartridge extends `game_cartridge.gd`, owns only its
deterministic rules/presentation, consumes semantic snapshots, and emits one
normalized result. The deck continues to own lifecycle, devices, networking,
scores, saves, shell chrome, and world behavior. Reusable helpers are limited to
rendering/math utilities; distinct rules stay readable in each cartridge.

**Runtime:** Godot 4.5.1, GDScript 2.0 static typing, JSON data rows.

## Non-negotiable acceptance

- All ten handheld catalog rows are installed and enabled.
- Every game starts from a deterministic seed, accepts keyboard/mouse and pad,
  mutates rules through semantic input, pauses/resumes, snapshots/restores,
  finishes once, and submits a valid result under its row's score contract.
- WASTE HEAP, RADWORM, DEAD GROUND, PACK RAT, and RELAY BLOOM render 1:1;
  BUNKER BREAKER, IRON DOME, FALL LINE, and TILT SALVAGE render 9:16; LAST MILE
  renders 16:9.
- Original ink/amber/rust art and lore only; no third-party branding or
  unaudited assets.
- Challenge runs preserve seed and ruleset.
- A passenger can open, play, and close the physical handheld while an AI or
  network partner's real vehicle moves; exit/damage closes safely.
- The in-world guide has a strategy page for every handheld title and HELP
  always reflects live bindings.

## Task 1: Handheld catalog contract and reusable test harness

**Files:**

- Create: `game/proto3d/tests/handheld_catalog_sim.gd`
- Create: `game/proto3d/tests/handheld_catalog_sim.tscn`
- Create: `game/proto3d/games/handheld/handheld_draw.gd`
- Modify: `game/proto3d/games/game_registry.gd`

- [ ] Write a red catalog sim that iterates the ten handheld rows and requires
  each scene to instantiate, match its declared viewport, start, pause/resume,
  snapshot/restore, and stop without changing `Engine.time_scale`.
- [ ] Add a tiny original drawing helper for palette, labels, and primitive
  shapes; no rules or input logic lives in the helper.
- [ ] Add registry validation for cartridge scene root, manual id, and device
  screen dimensions without making a missing optional scene fatal.
- [ ] Run the red sim and retain its nine missing-scene failures.

## Task 2: RADWORM

**Files:** `games/radworm/radworm.gd`, `.tscn`, `tests/radworm_sim.gd`, `.tscn`

- [ ] Red sim: deterministic food, no instant reversal, growth, wall/self
  collision, survival ticks, snapshot, one length result.
- [ ] Implement a fixed-tick routing worm with a queued turn and original
  Continuity-terminal presentation.
- [ ] Prove keyboard and pad snapshots cause the same turn.
- [ ] Commit `feat: add RADWORM`.

## Task 3: DEAD GROUND

**Files:** `games/dead_ground/*`, `tests/dead_ground_sim.*`

- [ ] Red sim: first-click-safe deterministic mine layout, adjacent counts,
  zero flood, flag/unflag, win, mine loss, low-time result with errors.
- [ ] Implement cursor plus pointer-cell selection through semantic input.
- [ ] Draw original survey stakes, hazard marks, and volunteer-demining copy.
- [ ] Commit `feat: add DEAD GROUND`.

## Task 4: PACK RAT

**Files:** `games/pack_rat/*`, `tests/pack_rat_sim.*`

- [ ] Red sim: wall blocking, single-crate push, no pull/double push, goal
  completion, deterministic level order, moves/levels result, snapshot.
- [ ] Implement three compact authored evacuation-warehouse maps as data rows in
  the script; no external Sokoban art or maps.
- [ ] Commit `feat: add PACK RAT`.

## Task 5: BUNKER BREAKER

**Files:** `games/bunker_breaker/*`, `tests/bunker_breaker_sim.*`

- [ ] Red sim: deterministic ball integration, paddle-angle response, brick hit,
  layer clear, life loss, portrait bounds, score/layers result.
- [ ] Implement fixed-step breakout rules with primitive armor plates, sparks,
  and a bunker-depth meter.
- [ ] Commit `feat: add BUNKER BREAKER`.

## Task 6: LAST MILE

**Files:** `games/last_mile/*`, `tests/last_mile_sim.*`

- [ ] Red sim: throttle/brake/steer, lane bounds, deterministic traffic,
  collision time penalty, ordered checkpoints, finish, low course-time result.
- [ ] Implement a pseudo-3D 16:9 courier road using original polygons/lines;
  ghost/AI follows deterministic racing-line samples.
- [ ] Commit `feat: add LAST MILE`.

## Task 7: IRON DOME

**Files:** `games/iron_dome/*`, `tests/iron_dome_sim.*`

- [ ] Red sim: target cursor, interceptor launch, manual detonation, expanding
  blast, missile chain, city hit, ammo exhaustion, score/cities result.
- [ ] Implement portrait missile-defense rules and original settlement skyline.
- [ ] Commit `feat: add IRON DOME`.

## Task 8: FALL LINE

**Files:** `games/fall_line/*`, `tests/fall_line_sim.*`

- [ ] Red sim: gravity, rotation, thrust/fuel, lateral drift, safe-pad landing,
  crash thresholds, landing-rating/fuel result, snapshot.
- [ ] Implement deterministic fixed-step lander physics and original relay-craft
  silhouette in the portrait viewport.
- [ ] Commit `feat: add FALL LINE`.

## Task 9: TILT SALVAGE

**Files:** `games/tilt_salvage/*`, `tests/tilt_salvage_sim.*`

- [ ] Red sim: launch, gravity, wall/bumper collision, independent flippers,
  lane/jackpot scoring, drain, nudge/tilt lockout, one score result.
- [ ] Implement deterministic portrait pinball using primitive collision math;
  presentation is a junkyard sorting table, not copied pinball art.
- [ ] Commit `feat: add TILT SALVAGE`.

## Task 10: RELAY BLOOM

**Files:** `games/relay_bloom/*`, `tests/relay_bloom_sim.*`

- [ ] Red sim: seeded tile rotations, edge connectivity, all-terminal power,
  correction/combo accounting, completion, score/max-combo result.
- [ ] Implement cursor and pointer rotation with an original electrical-relay
  diagram presentation.
- [ ] Commit `feat: add RELAY BLOOM`.

## Task 11: Passenger handheld lifecycle

**Files:**

- Modify: `game/proto3d/proto3d.gd`
- Modify: `game/proto3d/games/game_handheld.gd`
- Create: `game/proto3d/tests/game_passenger_sim.gd`
- Create: `game/proto3d/tests/game_passenger_sim.tscn`

- [ ] Red sim enters a real passenger seat, opens the inventory handheld, drives
  the vehicle through its real AI/autopilot path, observes movement while the
  cartridge changes state, then proves damage and seat exit close safely.
- [ ] Add a handheld context guard: on foot and passenger allowed; active driver
  receives a clear refusal. Damage closes fullscreen to the held device; death
  or passenger exit stops with `body_unavailable` and no invented ranked result.
- [ ] Keep world clock, vehicle physics, and damage live while playing.
- [ ] Commit `feat: let passengers play the handheld`.

## Task 12: Shelf, guide, art, and completion audit

**Files:**

- Modify: `game/data/books.json`
- Modify: `game/data/games.json`
- Modify: `game/THIRD_PARTY_NOTICES.md`
- Create: `docs/verification/GAME_DECK_PHASE_1_1.md`

- [ ] Verify every game has non-placeholder title/help/lore, a correct source
  notice, original primitive art, and a complete guide page.
- [ ] Run all ten focused handheld sims, `handheld_catalog_sim`,
  `game_passenger_sim`, and the complete Phase 1.0 suite serially.
- [ ] GPU-render one square, portrait, and landscape cartridge plus the physical
  held device; inspect all four frames.
- [ ] Record direct evidence and explicitly list any contradiction/missing item.
- [ ] Commit `test: verify Game Deck phase 1.1` only with zero missing items.

## Verification command

```powershell
$godot = 'C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64_console.exe'
$tests = @(
  'waste_heap_sim','radworm_sim','dead_ground_sim','pack_rat_sim',
  'bunker_breaker_sim','last_mile_sim','iron_dome_sim','fall_line_sim',
  'tilt_salvage_sim','relay_bloom_sim','handheld_catalog_sim',
  'game_passenger_sim','game_registry_sim','game_input_sim','game_ledger_sim',
  'game_shell_sim','game_net_sim','game_device_sim','game_save_sim',
  'game_license_sim','input_map_sim','save_sim'
)
foreach ($test in $tests) {
  & $godot --headless --path game ("res://proto3d/tests/$test.tscn")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```
