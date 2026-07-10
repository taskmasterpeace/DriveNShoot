# Game Deck Phase 2 Golden Goose Implementation Plan

> Execute serially in `D:\git\carworld\.worktrees\game-deck-build` on
> `codex/game-deck-build`. Each behavior starts as a failing focused sim; every
> feature commit leaves its focused and shared Game Deck gates green.

**Goal:** Ship RUST RUNNERS and BLACK GRID as the two flagship Game Deck
cartridges. They share one displayed keyboard/mouse/controller layout and one
deterministic combat substrate, while preserving distinct Soldat-like
side-view movement and Infantry-like top-down combined-arms tactics. Both must
be complete games with bots, local and same-session online play, original
DRIVN presentation, physical acquisition, tournament nights, strategy books,
and honest source notices.

**Fidelity law:** “Nearly 1:1” covers controls, responsiveness, tactical verbs,
physics relationships, modes, match rhythm, and the full mechanic inventories
in design section 6. It does not permit copied trademarks, proprietary code,
maps, zone data, silhouettes, art, audio, names, or prose. RUST RUNNERS may use
eligible MIT OpenSoldat implementation knowledge with its notice; OpenSoldat
base content remains excluded. BLACK GRID is a clean-room implementation from
player-facing behavior only.

**Architecture:** `ProtoShooterKernel` is a deterministic RefCounted combat
service: weapon rows, fire cadence, recoil/spread, hitscan/projectile travel,
grenades, ricochet, shrapnel, blast falloff, damage/armor, team filtering, and
state snapshot. It owns no locomotion, map, UI, or mode. Each cartridge owns
its coordinate law, traversal, actors, objectives, bots, modes, and original
drawing, then uses the ordinary `ProtoGameCartridge` lifecycle and existing
host-authoritative `ProtoArcadeNet` bridge. New weapons and zones are rows.

**Hard gates:** fixed 30 Hz; no global pause; no per-game RPC; both rows use
`shared_shooter`; exact HELP parity; host snapshots converge; result writes are
idempotent; all Phase 1 tests stay green; no purple; every shipped source and
asset is declared.

---

## Task 1: Shared controls and deterministic combat kernel

**Files:**

- Create: `game/data/game_shooter_weapons.json`
- Create: `game/proto3d/games/shooter/shooter_kernel.gd`
- Create: `game/proto3d/tests/game_shooter_controls_sim.gd/.tscn`
- Create: `game/proto3d/tests/game_shooter_kernel_sim.gd/.tscn`
- Modify: `game/proto3d/games/arcade_input_router.gd`
- Modify: `game/proto3d/tests/game_input_sim.gd`

- [x] Red controls sim: both Phase 2 rows resolve the identical ordered
  semantic list and the same live keyboard/mouse/pad labels for move, aim,
  primary, secondary, mobility, stance, reload, interact, weapon cycling,
  scoreboard, pause, and help.
- [x] Red kernel sim: seeded spread is repeatable; fire cadence/ammo/reload are
  enforced; hitscan, moving projectiles, grenades, ricochet, shrapnel, blast
  falloff, armor, recoil/knockback, and friendly-fire policy produce declared
  results; a deep snapshot/restore reproduces the next tick.
- [x] Add original RUST RUNNERS and BLACK GRID weapon rows with explicit
  provenance, balance, projectile, damage, and presentation fields.
- [x] Commit `feat: add shared flagship shooter kernel`.

## Task 2: RUST RUNNERS locomotion and combat fidelity

**Files:**

- Create: `game/data/rust_runners_maps.json`
- Create: `game/proto3d/games/rust_runners/rust_runners.gd/.tscn`
- Create: `game/proto3d/tests/rust_runners_sim.gd/.tscn`

- [x] Red sim: deterministic side-view acceleration, air control, gravity,
  platform collision, jump/limited jet fuel, recharge, crouch, prone,
  roll/backflip, stance hull changes, and velocity-scaled fall damage.
- [x] Prove independent full-angle aim, primary/secondary slots, weapon swap and
  drop/pickup, magazine reload, thrown grenade, hitscan/projectile weapons,
  spread/recoil/knockback, health/vest/grenade pickups, spawn protection,
  ragdoll-like primitive death pieces, gore toggle, and timed respawn.
- [x] Author at least three original data-driven arenas: refinery steel, broken
  bridge truss, and truck graveyard; import no upstream map or content.
- [x] Commit `feat: build Rust Runners movement and combat`.

## Task 3: RUST RUNNERS modes, bots, multiplayer, and presentation

**Files:**

- Modify: `game/proto3d/games/rust_runners/rust_runners.gd`
- Extend: `game/proto3d/tests/rust_runners_sim.gd`
- Modify: `game/data/game_leaderboards.json`
- Modify: `game/data/game_tournaments.json`
- Modify: `game/data/items.json`
- Modify: `game/data/loot_tables.json`

- [x] Red sim: Deathmatch, Team Deathmatch, Capture the Flag, and Pointmatch
  score distinctly; flags carry/drop/return/capture; point item possession
  changes the scoring cadence; score/time limits end one normalized match.
- [x] Fill to eight actors with deterministic bots that traverse platforms,
  seek weapons/health, select targets, retreat when wounded, and pursue the
  active objective.
- [x] Prove two-to-four local seats and an eight-seat online context use the
  ordinary semantic-input/snapshot/result bridge with convergence after restore.
- [x] Draw a readable original Crimson Road broadcast: arena, actors, jet
  exhaust, weapons, pickups, flags, kill feed, scoreboard, ammo/health/vest/jet,
  respawn, objective, and mode state.
- [x] Give the cartridge an acquisition row/cache path, honest house board, and
  a live tournament card on an existing venue screen.
- [x] Commit `feat: complete Rust Runners flagship cartridge`.

## Task 4: BLACK GRID movement, loadout, combat, and fog

**Files:**

- Create: `game/data/black_grid_zones.json`
- Create: `game/proto3d/games/black_grid/black_grid.gd/.tscn`
- Create: `game/proto3d/tests/black_grid_sim.gd/.tscn`

- [x] Red sim: top-down/isometric free movement retains inertia; class base
  mass plus loadout weight changes acceleration/top speed; combat boost/dive
  uses the same mobility semantic as jets; stance changes handling.
- [x] Prove independently aimed projectile travel, explosive blast falloff,
  multiple seeded shrapnel rays, ricochet, ammo/reload, heat, armor, energy,
  loadout limits, equipment cycling, and distinct infantry class profiles.
- [x] Prove real-time fog excludes occluded/dark enemies, radar contacts reveal
  coarse positions, and line-of-sight/radar state survives snapshot/restore.
- [x] Add original data-driven Continuity zones, walls, darkness, spawn nodes,
  capture nodes, and vehicle pads; no Infantry zone/map data is used.
- [x] Commit `feat: build Black Grid infantry combat`.

## Task 5: BLACK GRID deployables, vehicles, modes, and bots

**Files:**

- Modify: `game/proto3d/games/black_grid/black_grid.gd`
- Extend: `game/proto3d/tests/black_grid_sim.gd`

- [x] Red sim: sensor, barricade, turret, and repair node placement costs real
  carried resources/energy, affects visibility/combat/pathing, and can be
  destroyed; interaction enters/exits light vehicles with distinct mass,
  momentum, armor, seats, and weapon mounts.
- [x] Implement and prove Skirmish, Frontlines/KOTH, Capture the Flag,
  cooperative Bug Hunt, and compact Fleet mode with team spawn networks,
  forward captures, base defense, score/time end, and round-end mode voting.
- [x] Fill to sixteen actors with deterministic objective-aware bots that
  attack, defend, repair, use spawn networks, deploy equipment, and crew
  vehicles; Bug Hunt creatures use their own simple role behaviors.
- [x] Draw readable original tactical glass, isometric field, fog mask, radar,
  contacts, projectiles/shrapnel/blasts, deployables, vehicles, objectives,
  loadout/weight/energy/armor, team status, vote, and scoreboard.
- [x] Prove local layouts and same-session online snapshots converge through
  the ordinary Game Deck network bridge.
- [x] Commit `feat: complete Black Grid flagship cartridge`.

## Task 6: Phase 2 world, manuals, tournaments, and ownership

**Files:**

- Modify: `game/data/items.json`
- Modify: `game/data/loot_tables.json`
- Modify: `game/data/game_leaderboards.json`
- Modify: `game/data/game_tournaments.json`
- Modify: `game/data/books.json`
- Modify: `game/proto3d/proto3d.gd`
- Extend: world/acquisition/spectacle/catalog sims

- [ ] Both Phase 2 cartridges install through the same generic physical item
  path, appear on the shelf count (22 total), and launch only when owned outside
  an explicitly venue-owned event.
- [ ] RUST RUNNERS is a high-profile venue prize/cache find; BLACK GRID comes
  from a military terminal/cache; both get recurring tournament nights,
  brackets, wagers, house/session boards, spectator mirroring, and waypoints.
- [ ] Expand both already-authored in-world books until every live mechanic,
  mode, control, scoring rule, bot behavior, and clean-room/source boundary is
  taught accurately.
- [ ] Extend the combined catalog proof from 20 Phase 1 games to all 22 without
  weakening the Phase 1 exact-count contract.
- [ ] Commit `feat: integrate flagship shooters into the world`.

## Task 7: Final 22-game audit and clean-room gate

**Files:**

- Create: `game/proto3d/tests/game_cleanroom_sim.gd/.tscn`
- Create: `docs/verification/GAME_DECK_PHASE_2.md`
- Modify: `game/THIRD_PARTY_NOTICES.md`
- Modify: `game/proto3d/tests/game_license_sim.gd`
- Modify: `docs/superpowers/plans/2026-07-10-game-deck-phase-2.md`

- [ ] Clean-room sim finds no Infantry/Soldat trademarked source paths, maps,
  zone files, art, audio, names, text, or forbidden hashes; notices distinguish
  used MIT OpenSoldat code knowledge, excluded CC-BY base content, and
  reference-only FreeInfantry/Infantry behavior.
- [ ] Run both focused flagship suites, shared kernel/controls, 22-game catalog,
  ownership, local/online, venue/world, license, save, device/passenger, media,
  and DRIVN network regressions serially with exact counts.
- [ ] Add a real two-process ENet flagship loopback proving live shooter input,
  host snapshot convergence, and one idempotent result.
- [ ] GPU-render and inspect both games in shell, local split-seat readability,
  RUST RUNNERS at a drive-in tournament, BLACK GRID at a military/game-hall
  tournament, and both physical acquisition paths; remove the capture harness.
- [ ] Record exact evidence, expected engine lines, exclusions, contradictions,
  and missing items. Zero contradictions and zero missing items is the gate.
- [ ] Commit `test: verify complete 22-game Game Deck`.
