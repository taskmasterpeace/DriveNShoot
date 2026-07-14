# Game Deck Phase 1.2 Verification

Date: 2026-07-10
Branch: `codex/game-deck-build`
Scope: complete ten-cartridge console shelf and Phase 1 end-to-end audit

## Verdict

Phase 1.2 is **proven**. All ten console games are installed behind the same
Game Deck lifecycle, 16:9 device, semantic input router, score ledger, save
block, local-seat policy, and online bridge. Together with the previously
proven handheld shelf, Phase 1 now contains twenty playable in-world games.

No Phase 1.2 acceptance item is contradicted or missing. This verdict does not
claim the remaining physical discovery/venue/tournament spectacle work or the
two Phase 2 flagship shooters; those remain required by the active 22-game
goal.

## Requirement classification

| Phase 1.2 acceptance item | Classification | Direct evidence |
|---|---|---|
| Exactly ten console rows are installed and enabled | Proven | `console_catalog_sim`: all ten scenes instantiate and pass the shared contract, 96/96 |
| Titles, objectives, lore, HELP profiles, and strategy pages are complete | Proven | Exact-title/content assertions plus the 11-page `book_game_deck_console` annual |
| CROWN OF ASH supplies complete deterministic chess | Proven | `crown_of_ash_sim`: legal moves, special rules, draws, mate, AI, hot seat, online event, 26/26 |
| DIAL TANKS supplies ricochet tanks, mines, AI, and authoritative play | Proven | `dial_tanks_sim`: 17/17 |
| RED SKY supplies deterministic artillery, wind, terrain deformation, and AI | Proven | `red_sky_sim`: 19/19 |
| BLACK ORBIT supplies wraparound inertial asteroid combat and salvage | Proven | `black_orbit_sim`: 18/18 |
| GRIDBREACH supplies charge placement, blast lanes/chains, upgrades, and AI | Proven | `gridbreach_sim`: 18/18 |
| RUSTBALL supplies deterministic momentum sport, goals, saves, and boost | Proven | `rustball_sim`: 16/16 |
| FUEL RUN supplies combat capture racing, fuel drops, depots, and lap records | Proven | `fuel_run_sim`: 18/18 |
| SKYJOUST supplies deterministic aerial duels, stalls, lance hits, and AI | Proven | `skyjoust_sim`: 17/17 |
| FIGHT NIGHT '99 supplies guards, strike levels, throws, specials, rounds, and AI | Proven | `fight_night_99_sim`: 20/20 |
| ASHLAND COMMAND supplies AP tactics, terrain, supply, repair, AI, and hot seat | Proven | `ashland_command_sim`: 21/21 |
| Every title supports deterministic solo/AI, two local seats, pause, snapshot, and normalized result | Proven | Catalog-wide lifecycle harness for all ten titles |
| The console bridge works over real transport, not only an in-process seam | Proven | `tools/game_console_loopback.sh`: two Godot processes over ENet |
| Remote real-time input reaches the declared host seat | Proven | Client keyboard became semantic seat-1 input and moved the host-authoritative DIAL TANKS vehicle |
| Host snapshots converge and results are idempotent | Proven | Client matched tick/position; a deliberately duplicated result produced one signal and one ledger row |
| Attribution and exclusions match what ships | Proven | `game_license_sim`: 11/11; all eight Phase 1 source families are material-used notices, only two Phase 2 families remain future |
| Shipped visuals are original | Proven | No image asset exists below `proto3d/games`; cartridge visuals are code-drawn primitives; no upstream map, sprite, character, art, or audio was imported |
| The physical safehouse console samples the exact live Game Deck texture | Proven | `game_device_sim` plus inspected non-headless 3D capture |
| Phase 1 handheld/passenger behavior remains intact | Proven | Twelve Phase 1.1 scenes, 237/237 |
| Save, input, media, TV, data, NPC driving, and DRIVN networking remain intact | Proven | Fifteen shared/regression scenes, 246/246 |

Contradicted Phase 1.2 items: **none**.

Missing Phase 1.2 items: **none**.

## Fresh command evidence

Every scene ran serially with Godot 4.5.1 to avoid shared `user://` races:

```powershell
& $godot --headless --path game ("res://proto3d/tests/" + $test + ".tscn")
```

Console rules and shelf:

- `crown_of_ash_sim` - 26 passed, 0 failed
- `dial_tanks_sim` - 17 passed, 0 failed
- `red_sky_sim` - 19 passed, 0 failed
- `black_orbit_sim` - 18 passed, 0 failed
- `gridbreach_sim` - 18 passed, 0 failed
- `rustball_sim` - 16 passed, 0 failed
- `fuel_run_sim` - 18 passed, 0 failed
- `skyjoust_sim` - 17 passed, 0 failed
- `fight_night_99_sim` - 20 passed, 0 failed
- `ashland_command_sim` - 21 passed, 0 failed
- `console_catalog_sim` - 96 passed, 0 failed

Console subtotal: **11 scenes, 286 passed, 0 failed**.

Handheld and passenger regression subtotal: **12 scenes, 237 passed,
0 failed**. The individual counts remain the Phase 1.1 report's ten focused
games plus `handheld_catalog_sim` 74/74 and `game_passenger_sim` 12/12.

Shared and inherited regression gates:

- `game_registry_sim` - 18 passed, 0 failed
- `game_input_sim` - 13 passed, 0 failed
- `game_ledger_sim` - 17 passed, 0 failed
- `game_shell_sim` - 21 passed, 0 failed
- `game_net_sim` - 24 passed, 0 failed
- `game_device_sim` - 13 passed, 0 failed
- `game_save_sim` - 7 passed, 0 failed
- `game_license_sim` - 11 passed, 0 failed
- `input_map_sim` - 15 passed, 0 failed
- `save_sim` - 21 passed, 0 failed
- `npc_drive_sim` - 11 passed, 0 failed
- `media_registry_sim` - 15 passed, 0 failed
- `tv_sim` - 25 passed, 0 failed
- `net_sim` - 16 passed, 0 failed
- `data_sim` - 19 passed, 0 failed

Shared/regression subtotal: **15 scenes, 246 passed, 0 failed**.

Combined fresh scene evidence: **38 scenes, 769 passed, 0 failed**.

The additional two-process command:

```bash
bash tools/game_console_loopback.sh
```

reported `GAME CONSOLE LOOPBACK: ALL CHECKS PASSED` after proving remote
semantic input, host snapshot convergence, one shared result, and one client
ledger write despite deliberate duplicate transmission.

## Expected non-failing engine lines

Every named scene returned exit code 0. Godot reported cleanup-only resource
counts after `game_passenger_sim` (5), `game_device_sim` (4), `game_save_sim`
(3), and `npc_drive_sim` (2). `media_registry_sim` intentionally logs its
duplicate `good_film` row as an error because rejecting that row is the tested
behavior. No unexpected script error or engine error appeared.

## Render inspection

A non-headless Godot 4.5.1 Compatibility run rendered on the local NVIDIA RTX
4090. A temporary capture harness, removed after use, produced five inspected
1280x720 frames under
`user://game_deck_visual_audit/`:

- `01_crown_of_ash.png` - readable full chess board and strategy panel;
- `02_dial_tanks.png` - real-time tanks, barriers, shells, mines, and status;
- `03_rustball.png` - physics arena, teams, ball, goals, clock, and score;
- `04_ashland_command.png` - tactical grid, terrain, supply, units, AP, and turn;
- `05_physical_console.png` - live DIAL TANKS texture on the 3D safehouse set.

The first CROWN capture exposed a Windows color-font fallback that rendered the
filled pawn purple. Both armies now use tintable outline glyphs, its focused
26-check regression stayed green, and a fresh capture confirmed the intended
bone/rust palette. All five accepted frames are readable, uncropped, original,
and contain no purple.

## Deliberately deferred scope

- physical cartridge acquisition and unlock presentation;
- local invitations, venue placement, schedules, brackets, wagers,
  reconnect policy, and SPECTACLES public-screen mirroring;
- RUST RUNNERS and BLACK GRID, their shared shooter kernel, and their final
  clean-room provenance audit.
