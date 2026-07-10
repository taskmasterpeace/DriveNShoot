# Game Deck Phase 1.1 Verification

Date: 2026-07-10
Branch: `codex/game-deck-build`
Scope: complete ten-cartridge handheld shelf plus passenger-seat play

## Verdict

Phase 1.1 is **proven**. All ten handheld games are installed behind the same
Game Deck lifecycle, input, save, score, network, device, and shell contracts.
No Phase 1.1 acceptance item is contradicted or missing.

This verdict does not claim the nine remaining console cartridges, cartridge
discovery and venue/tournament spectacle, or the two Phase 2 flagship shooters.
Those remain required by the committed 22-game goal.

## Requirement classification

| Phase 1.1 acceptance item | Classification | Direct evidence |
|---|---|---|
| Exactly ten handheld rows are installed and enabled | Proven | `handheld_catalog_sim`: all ten scenes instantiate and pass the shared contract, 74/74 |
| Every game starts deterministically, accepts semantic input, pauses, snapshots/restores, and emits one normalized result | Proven | Ten focused rule sims plus the catalog-wide lifecycle harness |
| WASTE HEAP supplies deterministic standard 2048 | Proven | `waste_heap_sim`: 14/14 |
| RADWORM supplies fixed-tick snake routing, growth, collision, and length scoring | Proven | `radworm_sim`: 13/13 |
| DEAD GROUND supplies deterministic first-click-safe mines, flood reveal, flags, win/loss, and low-time scoring | Proven | `dead_ground_sim`: 16/16 |
| PACK RAT supplies strict push-only Sokoban rules and three original maps | Proven | `pack_rat_sim`: 14/14 |
| BUNKER BREAKER supplies fixed-step portrait breakout, paddle angles, layers, lives, and score | Proven | `bunker_breaker_sim`: 15/15 |
| LAST MILE supplies a deterministic 16:9 pseudo-3D courier racer with traffic, checkpoints, collisions, and low-time scoring | Proven | `last_mile_sim`: 17/17 |
| IRON DOME supplies portrait missile defense with finite ammo, manual bursts, chain reactions, cities, and score | Proven | `iron_dome_sim`: 15/15 |
| FALL LINE supplies deterministic lander physics, fuel, drift, safe touchdown, crash thresholds, and rating | Proven | `fall_line_sim`: 16/16 |
| TILT//SALVAGE supplies deterministic portrait pinball, independent flippers, nudging/tilt, drains, lanes, and jackpots | Proven | `tilt_salvage_sim`: 16/16 |
| RELAY BLOOM supplies seeded relay rotations, reciprocal connectivity, source flooding, terminals, corrections, and combos | Proven | `relay_bloom_sim`: 15/15; catalog help regression matches the shipped rotation rules |
| Declared 1:1, 9:16, and 16:9 screen families are honored | Proven | Catalog/device assertions plus GPU captures of RADWORM, IRON DOME, and LAST MILE |
| HELP shows only each cartridge's real live keyboard/mouse/pad actions | Proven | `game_input_sim`: explicit puzzle, pointer, paddle, racer, lander, pinball, and shared-shooter profiles, 11/11 |
| Every cartridge has non-placeholder title, objective, lore, original primitive art, and strategy material | Proven | Catalog audit, ten focused renders, and the 11-page `book_game_deck_handheld` field guide (one usage page plus ten strategy pages) |
| Artwork and branding are original; third-party adaptation and license facts remain visible | Proven | No imported handheld art/audio; `game_license_sim`: 8/8; ABOUT and `THIRD_PARTY_NOTICES.md` name all ten LittleJS-derived adaptations and exclusions |
| Challenge runs preserve seed and ruleset | Proven | Cartridge snapshot/result contracts, score ledger challenge validation, and deterministic focused sims |
| A passenger can play while a real AI-driven vehicle and the world continue moving | Proven | `game_passenger_sim`: real `ProtoCar3D`/autopilot movement, cartridge progress, clock advance, and held-device following, 12/12 |
| Damage drops fullscreen safely; passenger exit/death stops the body-bound session; the driver is refused | Proven | `game_passenger_sim`; no invented ranked result is submitted |
| Phase 1.0 Game Deck, CROWN OF ASH, media, TV, save, network, input, data, and NPC driving remain intact | Proven | Sixteen inherited/shared regression scenes, 261/261 |

Contradicted Phase 1.1 items: **none**.

Missing Phase 1.1 items: **none**.

## Fresh command evidence

Every scene ran serially with Godot 4.5.1 using:

```powershell
& $godot --headless --path game ("res://proto3d/tests/" + $test + ".tscn")
```

Focused handheld rules:

- `waste_heap_sim` - 14 passed, 0 failed
- `radworm_sim` - 13 passed, 0 failed
- `dead_ground_sim` - 16 passed, 0 failed
- `pack_rat_sim` - 14 passed, 0 failed
- `bunker_breaker_sim` - 15 passed, 0 failed
- `last_mile_sim` - 17 passed, 0 failed
- `iron_dome_sim` - 15 passed, 0 failed
- `fall_line_sim` - 16 passed, 0 failed
- `tilt_salvage_sim` - 16 passed, 0 failed
- `relay_bloom_sim` - 15 passed, 0 failed

Focused rules subtotal: **151 passed, 0 failed**.

Shelf and passenger integration:

- `handheld_catalog_sim` - 74 passed, 0 failed
- `game_passenger_sim` - 12 passed, 0 failed

Phase 1.1 direct subtotal: **237 passed, 0 failed**.

Shared and inherited regression gates:

- `game_registry_sim` - 18 passed, 0 failed
- `game_input_sim` - 11 passed, 0 failed
- `game_ledger_sim` - 17 passed, 0 failed
- `game_shell_sim` - 21 passed, 0 failed
- `game_net_sim` - 18 passed, 0 failed
- `game_device_sim` - 13 passed, 0 failed
- `game_save_sim` - 7 passed, 0 failed
- `game_license_sim` - 8 passed, 0 failed
- `input_map_sim` - 15 passed, 0 failed
- `save_sim` - 21 passed, 0 failed
- `npc_drive_sim` - 11 passed, 0 failed
- `crown_of_ash_sim` - 26 passed, 0 failed
- `media_registry_sim` - 15 passed, 0 failed (its duplicate-id error line is intentional proof)
- `tv_sim` - 25 passed, 0 failed
- `net_sim` - 16 passed, 0 failed
- `data_sim` - 19 passed, 0 failed

Shared/regression subtotal: **261 passed, 0 failed**.

Combined fresh evidence: **28 scenes, 498 passed, 0 failed**.

Godot emitted non-failing resource-cleanup warnings after a small number of
scenes; every named scene returned exit code 0 and its own zero-failure result.

## Render inspection

A non-headless Godot 4.5.1 Compatibility render ran on the local NVIDIA RTX
4090. A temporary capture harness (removed after use) produced and visually
inspected four live frames:

- RADWORM in the 1:1 shell;
- IRON DOME in the 9:16 shell;
- LAST MILE in the 16:9 shell;
- the physical landscape handheld sampling the exact live LAST MILE texture.

All four showed original ink/amber/rust presentation, readable game status,
correct aspect preservation, and no stretch or crop. A viewer-scaling concern
on the portrait frame was checked against a full-resolution header crop and
runtime geometry. The bezel, title, all six tabs, power/close controls, screen,
and world-live status were inside the rendered frame. `game_shell_sim` now
retains that portrait in-frame geometry assertion.

## Deliberately deferred scope

- nine remaining 16:9 console cartridges (CROWN OF ASH is already complete);
- physical discovery/unlocks, local invitations, venues, schedules, brackets,
  wagers, and SPECTACLES mirroring;
- reconnect grace and full tournament policy;
- RUST RUNNERS, BLACK GRID, their shared shooter kernel, and final clean-room
  provenance audit.
