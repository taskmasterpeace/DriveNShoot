# Game Deck Phase 1.3 Verification

Date: 2026-07-10  
Branch: `codex/game-deck-build`  
Scope: complete Phase 1 ownership, world placement, invitations, boards, and
tournament spectacle for all twenty cartridges

## Verdict

Phase 1 is **complete and proven**. DRIVN now contains twenty playable games
behind one Game Deck lifecycle: ten handheld titles and ten console titles.
Exactly WASTE HEAP and CROWN OF ASH begin installed; the other eighteen are
physical cartridges found in world caches or won as a tournament prize.

Every owned title launches through the ordinary shelf/device shell, accepts
the same semantic keyboard/mouse/controller route, leaves the DRIVN world
running, snapshots/restores, records one normalized result, and stops without
mutating its registry row. Three physical venues run the ordinary console
cartridges on public screens with schedules, entry, brackets, wagers, prizes,
announcer copy, and deterministic world interruptions.

Contradicted Phase 1 requirements: **none**.  
Missing Phase 1 requirements: **none**.

This verdict deliberately does not claim Phase 2. RUST RUNNERS and BLACK GRID
and their shared shooter kernel remain the active two-game goal.

## Requirement evidence

| Requirement | Classification | Direct evidence |
|---|---|---|
| Twenty Phase 1 games are playable through one lifecycle | Proven | `game_catalog_sim`: all 20 owned rows, 143/143 |
| Ten handheld and ten console games retain their complete rules | Proven | 20 focused sims plus both platform catalogs, 654/654 total |
| Only WASTE HEAP and CROWN OF ASH are starters | Proven | `game_acquisition_sim`; clean ledger count is exactly two |
| Eighteen non-starters have physical acquisition paths | Proven | 18 generic `game_cart_<id>` rows and four deterministic world cache tables; FIGHT NIGHT '99 is the RUSTBALL prize |
| Install is generic, consumed once, idempotent, and save-backed | Proven | `game_acquisition_sim`, `game_save_sim`, `save_sim` |
| Locked media stays visible but cannot launch ordinarily | Proven | acquisition, shell, online-terminal, and combined catalog sims |
| Shelf, console, and handheld use the same ownership ledger/deck | Proven | shelf/device/shell/world sims and inspected physical shelf frame |
| Console power and per-row power/network facts are surfaced honestly | Proven | `game_device_sim`; unpowered console refuses without an invented utility charge |
| Personal, session, challenge, house, and unavailable-global boards remain distinct | Proven | `game_ledger_sim`: 22/22; all 20 house boards are explicitly fictional |
| Local invitations require real bodies inside the declared radius | Proven | `game_local_mp_sim`: real CharacterBody movement, 6/6 |
| Remote invitations require powered terminals and one live DRIVN session | Proven | `game_online_mp_sim`: 8/8 |
| The real network bridge carries semantic input, snapshots, and one result | Proven | `game_net_sim` plus two-process ENet loopback |
| Three venues and ten console event nights are data rows | Proven | `game_tournaments.json`, `game_spectacle_sim`, `game_world_sim` |
| Public venue screens mirror the exact Game Deck texture | Proven | spectator identity assertion and inspected GPU frames |
| Entry, wagering, settlement, prizes, and broadcasts are idempotent | Proven | `game_spectacle_sim`: 19/19 and existing `ProtoBetting` |
| A trap closes fullscreen without fabricating or stopping the match | Proven | deterministic trap assertion plus accepted drive-in interruption frame |
| Settled brackets retire for the venue's next event | Proven | red/green schedule-advance regression in `game_spectacle_sim`; unfinished matches are retained |
| Shelf, four caches, and all venues exist in the real main scene | Proven | `game_world_sim`: 8/8; venue waypoints are appended before stream setup |
| Cartridge and venue visuals are original | Proven | no imported art/audio under the game runtime; `game_license_sim`: 12/12 |
| Keyboard, mouse, and controller HELP remains cartridge-specific | Proven | `game_input_sim`: 13/13 and the two in-world strategy books |

## Fresh serial command evidence

Every scene ran independently with Godot 4.5.1 using the real project path:

```powershell
& $godot --headless --path game ("res://proto3d/tests/$test.tscn")
```

Focused game rules:

- Handheld: WASTE HEAP 14, RADWORM 13, DEAD GROUND 16, PACK RAT 14,
  BUNKER BREAKER 15, LAST MILE 17, IRON DOME 15, FALL LINE 16,
  TILT//SALVAGE 16, RELAY BLOOM 15.
- Console: CROWN OF ASH 26, DIAL TANKS 17, RED SKY 19, BLACK ORBIT 18,
  GRIDBREACH 18, RUSTBALL 16, FUEL RUN 18, SKYJOUST 17,
  FIGHT NIGHT '99 20, ASHLAND COMMAND 21.
- `handheld_catalog_sim` 74, `console_catalog_sim` 96, and the final
  ownership-aware `game_catalog_sim` 143.

Focused/catalog subtotal: **23 scenes, 654 passed, 0 failed**. A second fresh
confirmation of this entire block reported zero engine error lines.

World and Game Deck integration:

- acquisition 18, ledger 22, local multiplayer 6, online multiplayer 8;
- spectacle 19, world placement 8, registry 18, semantic input 13;
- shell 22, Game Deck network 24, device 13, passenger 12;
- Game Deck save 7, licensing/provenance 12, betting 12.

Integration subtotal: **15 scenes, 214 passed, 0 failed**.

Inherited DRIVN gates:

- media registry 15, TV 25, DRIVN network 16, main save 21, data 19,
  NPC driving 11, input map 15.

Inherited subtotal: **7 scenes, 122 passed, 0 failed**.

Combined fresh evidence: **45 scenes, 990 passed, 0 failed**.

The additional real-transport command:

```bash
bash tools/game_console_loopback.sh
```

reported `GAME CONSOLE LOOPBACK: ALL CHECKS PASSED`. Two Godot processes used
ENet: client keyboard input became semantic seat-1 input on the host, the
client converged on the host snapshot, and deliberate result duplication left
one result signal and one client ledger row.

## Expected non-failing engine lines

All named scenes returned exit code 0. Cleanup-only resource counts were
reported after `game_local_mp_sim` (3), `game_spectacle_sim` (1),
`game_world_sim` (3), `game_device_sim` (4), `game_passenger_sim` (5),
`game_save_sim` (3), `net_sim` (4), `save_sim` (4), and `npc_drive_sim` (2).
`media_registry_sim` intentionally logs the rejected duplicate `good_film` row
as an error; rejecting it is the assertion. No unexpected script or engine
error appeared.

## GPU render inspection

A non-headless Godot 4.5.1 Compatibility run rendered five 1793x1009 frames on
the local NVIDIA RTX 4090 under
`user://game_deck_phase_1_3_visual/`:

- `01_shelf_and_firmware_cache.png` — readable physical 2/20 shelf, cartridge
  silhouettes, and labeled firmware cache;
- `02_drive_in_match.png` — DIAL TANKS live on the STATIC SKY drive-in screen
  with its posted fee, prize, and event copy;
- `03_roadhouse_bracket.png` — FIGHT NIGHT '99 at THE BENT AXLE with a readable
  named bracket;
- `04_game_hall_screen.png` — CROWN OF ASH board at COUNTY CONTINUITY HALL;
- `05_tournament_trap_interruption.png` — match remains live while the tote and
  announcer surface a MURDERER HUNT world interruption.

Visual QA caught and fixed three real presentation defects before acceptance:
the shelf geometry/interact side contradicted the shared local-`-Z` furniture
front law, its label intersected the safehouse wall, and the half-second venue
refresh overwrote trap copy. The accepted rerender shows the corrected shelf,
cache, venue screens, and persistent interruption state. The temporary capture
harness was removed. All visible cartridge/venue art is original primitive and
text rendering in DRIVN's ink/bone/amber/rust palette; no purple or upstream
art/audio appears.

## Deferred Phase 2 scope

- a shared deterministic side-view shooter kernel;
- RUST RUNNERS, the fast acrobatic arena shooter;
- BLACK GRID, the persistent class/vehicle objective shooter;
- their complete clean-room provenance update, focused rule suites, catalog
  integration, network proof, physical/tournament placement, and GPU audit.
