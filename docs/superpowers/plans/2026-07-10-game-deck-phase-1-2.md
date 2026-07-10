# Game Deck Phase 1.2 - Complete Console Shelf

> Execute locally with `superpowers:test-driven-development` and
> `superpowers:verification-before-completion`. Run Godot processes serially
> except for the deliberate two-process ENet loopback.

**Goal:** Ship all ten 16:9 console cartridges through the same Game Deck,
including the nine remaining games, solo AI, two-or-more local seats, live
same-session online input/snapshot convergence, original art, and the complete
in-world console strategy annual.

**Architecture:** Cartridges continue to own only deterministic rules and
presentation. The deck owns lifecycle, local device seats, remote input queues,
host snapshots, results, saves, the physical console texture, and the shell.
Real-time games consume the same semantic snapshots locally and online; turn
games may additionally emit idempotent reliable actions. One console drawing
helper owns palette/primitives, never rules.

**Runtime:** Godot 4.5.1, GDScript 2.0 static typing, JSON rows, ENet through the
existing `ProtoArcadeNet` bridge.

## Non-negotiable acceptance

- All ten console rows are installed, enabled, and render at 1280x720 / 16:9.
- CROWN OF ASH remains the complete battle-chess centerpiece.
- Every other console game has a focused deterministic rules sim and original
  ink/amber/rust art with no imported branding or unaudited asset.
- One human gets a deterministic AI match; two local device seats control
  distinct competitors; all declared maximum player counts remain representable.
- Remote real-time inputs enter the host through the generic deck seam, only
  the host emits authoritative snapshots/results, and clients converge without
  a cartridge-specific RPC.
- Every title uses only its exact displayed semantic profile, supports pause,
  snapshot/restore, one normalized result, HELP/ABOUT/SCORES, and the strategy
  annual.
- DRIVN world time never pauses or changes scale.

## Task 1: Console contract, exact controls, and live network input

**Files:**

- Create: `game/proto3d/tests/console_catalog_sim.gd`
- Create: `game/proto3d/tests/console_catalog_sim.tscn`
- Create: `game/proto3d/games/console/console_draw.gd`
- Modify: `game/proto3d/games/arcade_input_router.gd`
- Modify: `game/proto3d/games/game_deck.gd`
- Modify: `game/proto3d/tests/game_input_sim.gd`
- Modify: `game/proto3d/tests/game_net_sim.gd`
- Modify: `game/proto3d/games/crown_of_ash/crown_of_ash.gd`

- [x] Write the red catalog harness: exactly ten console rows; every scene is
  16:9, instantiates, starts solo, starts with two local seats, accepts online
  context, mutates from semantic input, pauses, snapshots/restores, finishes
  once, and never changes `Engine.time_scale`. Preserve nine missing failures.
- [x] Write red input assertions for `board_cursor`, `twin_stick`, `artillery`,
  `arena_grid`, `physics_sport`, `capture_racer`, `aerial_duel`, `fighter`, and
  `tactics_grid`; add only the verbs each game actually uses.
- [x] Write red network assertions showing a bridge `input_received` signal
  reaches the correct remote seat in a live deck, stale ticks are ignored, the
  host publishes snapshots/results, and a client cannot become snapshot authority.
- [x] Implement deck-level remote input queues and host snapshot cadence without
  adding game-specific branches. Keep CROWN's reliable move events intact.
- [x] Add the original console draw helper and a CROWN completion hook used by
  the catalog audit.
- [x] Run the red harness and retain exactly the nine missing console scenes.
- [x] Commit `test: define the console cartridge contract`.

## Task 2: DIAL TANKS

**Files:** `games/dial_tanks/*`, `tests/dial_tanks_sim.*`

- [x] Red sim: deterministic spawns, body/turret independence, shell collision,
  limited ricochets, mine placement/detonation, damage/death, round win, bot
  target movement, two distinct local seats, snapshot, and normalized result.
- [x] Implement one-to-four-player top-down arena rounds with original Carousel
  training-bay walls, tank silhouettes, shell trails, impact sparks, and HUD.
- [x] Commit `feat: add DIAL TANKS`.

## Task 3: RED SKY

**Files:** `games/red_sky/*`, `tests/red_sky_sim.*`

- [x] Red sim: turn ownership, angle/charge, deterministic wind, ballistic
  flight, terrain collision/deformation, blast falloff, damage, next turn, AI
  ranging shot, local seats, snapshot, and wins/damage result.
- [x] Implement one-to-four artillery crews on an original ruined weather-array
  skyline. Reliable action events remain optional because snapshots are authority.
- [x] Commit `feat: add RED SKY`.

## Task 4: BLACK ORBIT

**Files:** `games/black_orbit/*`, `tests/black_orbit_sim.*`

- [x] Red sim: turn/thrust inertia, wraparound bounds, independent aim/fire,
  asteroid split, collision damage, salvage spawn/collection/bank, bot claim
  behavior, local seats, snapshot, and wins/salvage result.
- [x] Implement one-to-four salvage skiffs, original dead-satellite debris, claim
  beacons, projectile trails, and compact match HUD.
- [x] Commit `feat: add BLACK ORBIT`.

## Task 5: GRIDBREACH

**Files:** `games/gridbreach/*`, `tests/gridbreach_sim.*`

- [ ] Red sim: grid movement, solid/destructible walls, charge capacity, fuse,
  orthogonal blast blocking, chain reaction, wall break, elimination, bot escape,
  local seats, snapshot, and wins/survival result.
- [ ] Implement one-to-four sabotage avatars in an original Continuity relay
  maze; do not import Godot demo maps or sprites.
- [ ] Commit `feat: add GRIDBREACH`.

## Task 6: RUSTBALL

**Files:** `games/rustball/*`, `tests/rustball_sim.*`

- [ ] Red sim: acceleration, dash/body impulse, deterministic ball physics,
  arena rebounds, goal detection/reset, credited goal/save, clock/score finish,
  bot offense/defense, local seats, snapshot, and goals/saves result.
- [ ] Implement one-to-four players in an original bumper-yard league pitch.
- [ ] Commit `feat: add RUSTBALL`.

## Task 7: FUEL RUN

**Files:** `games/fuel_run/*`, `tests/fuel_run_sim.*`

- [ ] Red sim: acceleration/steering/brake, arena collision, center-can pickup,
  carrier slowdown/drop, home-pump capture, rival steal, thirty-second clock,
  bot route choice, local seats, snapshot, and captures/lap-time result.
- [ ] Implement one-to-four top-down refinery buggies with original pump, spill,
  tire, and jerry-can art. Use `capture_racer`, not the handheld racer HELP list.
- [ ] Commit `feat: add FUEL RUN`.

## Task 8: SKYJOUST

**Files:** `games/skyjoust/*`, `tests/skyjoust_sim.*`

- [ ] Red sim: rocket thrust/fuel, lift/gravity, facing/air control, altitude
  advantage, lance hit rules, knockout/respawn, round win, bot climb/attack,
  two local seats, snapshot, and wins/knockouts result.
- [ ] Implement an original county-fair rocket-rig duel above broken grandstands.
- [ ] Commit `feat: add SKYJOUST`.

## Task 9: FIGHT NIGHT '99

**Files:** `games/fight_night_99/*`, `tests/fight_night_99_sim.*`

- [ ] Red sim: character/archetype selection, walk/crouch, high/low/heavy hit
  windows, standing/crouching guard, throw, recovery, special meter, KO, best-of
  rounds, deterministic AI, two local seats, snapshot, and wins/HP result.
- [ ] Implement original road legends and ring art; no upstream character art,
  names, animation frames, or prose.
- [ ] Commit `feat: add FIGHT NIGHT '99`.

## Task 10: ASHLAND COMMAND

**Files:** `games/ashland_command/*`, `tests/ashland_command_sim.*`

- [ ] Red sim: grid terrain costs/defense, action points, move/attack legality,
  deterministic damage, supply capture/income/repair, turn end, damaged-unit
  occupancy, command-unit defeat, AI turn, hot seat, reliable action replay,
  snapshot, and wins/turns result.
- [ ] Implement an original compact state-border scenario with primitive unit
  insignia. Exclude Tanks of Freedom CC-BY-SA audio and branding.
- [ ] Commit `feat: add ASHLAND COMMAND`.

## Task 11: Console shelf, guide, network, art, and completion audit

**Files:**

- Modify: `game/data/books.json`
- Modify: `game/data/games.json`
- Modify: `game/THIRD_PARTY_NOTICES.md`
- Create: `game/proto3d/tests/game_console_online_host.gd/.tscn`
- Create: `game/proto3d/tests/game_console_online_client.gd/.tscn`
- Create: `tools/game_console_loopback.sh`
- Create: `docs/verification/GAME_DECK_PHASE_1_2.md`

- [ ] Verify ten non-placeholder titles/objectives/lore entries, ten guide pages,
  exact control profiles, eligible notices/licenses, and original art only.
- [ ] Run all ten focused console sims, `console_catalog_sim`, shared Game Deck
  sims, all Phase 1.1 sims, and DRIVN regressions serially.
- [ ] Run a real two-process ENet console loopback proving remote real-time input,
  host snapshot convergence, one shared result, and no duplicate ledger write.
- [ ] GPU-render CROWN OF ASH plus one real-time, one physics, one turn-based,
  and the physical console frame; inspect all five.
- [ ] Record exact counts, contradictions, missing items, expected exclusion
  messages, and non-failing engine cleanup warnings.
- [ ] Commit `test: verify Game Deck phase 1.2` only with zero missing items.

## Verification command

```powershell
$godot = 'C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64_console.exe'
$tests = @(
  'crown_of_ash_sim','dial_tanks_sim','red_sky_sim','black_orbit_sim',
  'gridbreach_sim','rustball_sim','fuel_run_sim','skyjoust_sim',
  'fight_night_99_sim','ashland_command_sim','console_catalog_sim',
  'game_registry_sim','game_input_sim','game_ledger_sim','game_shell_sim',
  'game_net_sim','game_device_sim','game_save_sim','game_license_sim',
  'input_map_sim','save_sim','net_sim','data_sim'
)
foreach ($test in $tests) {
  & $godot --headless --path game ("res://proto3d/tests/" + $test + ".tscn")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
bash tools/game_console_loopback.sh
```
