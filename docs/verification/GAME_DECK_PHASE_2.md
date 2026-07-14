# Game Deck Phase 2 Verification

Date: 2026-07-10

Branch: `codex/game-deck-build`

Scope: final 22-game Game Deck plus the RUST RUNNERS and BLACK GRID flagship
shooters

## Verdict

Phase 2 is **complete and proven**. DRIVN now has twenty-two playable in-world
video games behind one Game Deck lifecycle: ten handheld games, ten Phase 1
console games, RUST RUNNERS, and BLACK GRID. The two flagships share one exact
keyboard/mouse/controller semantic layout and one deterministic combat kernel,
but retain separate movement, map, mode, bot, vehicle, objective, and visual
identities.

RUST RUNNERS delivers the approved Soldat-like side-view relationship: fast
ground and air control, limited jets, crouch/prone/roll/backflip traversal,
full-angle aim, magazines, weapon pickups, grenades, recoil, knockback, gore
policy, respawn, four modes, eight combatants, local seats, bots, and online
play. BLACK GRID delivers the approved Infantry-like relationship: top-down
inertia, mass-sensitive class/loadout construction, fog and radar, energy,
armor, heat, deployables, repair, light vehicles, five modes, sixteen
combatants, objective bots, local seats, and online play.

“Nearly 1:1” applies to the approved control, response, tactical-verb, physics,
mode, and match-rhythm inventories. It does not mean copied trademarks,
proprietary code, maps, zone data, silhouettes, art, audio, names, branding, or
prose. The clean-room and notice gates below enforce that distinction.

Contradicted approved Phase 2 requirements: **none**.

Missing approved Phase 2 requirements: **none**.

Remote play uses DRIVN's existing same-session host/join ENet path. No external
account, matchmaking, or global leaderboard provider is invented; the shell
labels the global board unavailable when no provider is configured.

## Requirement evidence

| Requirement | Classification | Direct evidence |
|---|---|---|
| All twenty-two games launch through one lifecycle | Proven | `game_catalog_sim` 158/158; exact ten-handheld and ten-Phase-1-console catalogs remain 74/74 and 96/96 |
| Both flagships use the same displayed controls | Proven | `game_shooter_controls_sim` 10/10 and `game_input_sim` 14/14; both rows use ordered `shared_shooter` semantics |
| Keyboard, mouse, and controller all reach those semantics | Proven | real HELP labels plus physical D-key input in both two-process flagship ENet matches |
| One deterministic combat substrate serves both games | Proven | `game_shooter_kernel_sim` 16/16: cadence, ammo, reload, seeded spread, hitscan, projectiles, grenade, blast falloff, shrapnel, ricochet, recoil, armor, team policy, and deep restore |
| RUST RUNNERS has the full approved locomotion/combat inventory | Proven | `rust_runners_sim` 46/46 and inspected eight-actor shell frame |
| RUST RUNNERS has DM, TDM, CTF, Pointmatch, bots, local, and online play | Proven | focused mode/objective/bot/seat assertions plus real ENet authority convergence |
| RUST RUNNERS uses original arenas and presentation | Proven | three original row maps; clean-room scan; inspected shell and drive-in frames |
| BLACK GRID has the full class/loadout/combat/fog inventory | Proven | `black_grid_sim` 53/53 and inspected sixteen-actor tactical-glass frame |
| BLACK GRID has deployables, vehicles, five modes, bots, local, and online play | Proven | focused deployable/vehicle/mode/objective/bot/seat assertions plus real ENet authority convergence |
| BLACK GRID uses original zones and presentation | Proven | three original row zones; clean-room scan; inspected shell and game-hall frames |
| Results and snapshots use the ordinary Game Deck bridge | Proven | focused bridge assertions, `game_net_sim` 24/24, and separate live host/client processes for each flagship |
| Duplicate network results cannot duplicate records | Proven | each live client receives one signal and one ledger row after the host deliberately sends the same result twice |
| Both games are physical, save-backed finds | Proven | acquisition 20/20, save gates, 2/22 starter shelf, drive-in cache/prize path, and military cache path |
| Both games have recurring public tournaments | Proven | Monday drive-in RUST RUNNERS and Wednesday game-hall BLACK GRID rows; brackets, entry, prizes, wagers, announcements, and mirrored live screens |
| Scoring and leaderboard scopes remain honest | Proven | ledger 23/23; personal/session/challenge/fictional-house separation; unavailable global provider is surfaced |
| Both strategy books teach all live mechanics and provenance boundaries | Proven | focused manual assertions and clean-room manual disclosure assertion |
| No upstream runtime content is imported | Proven | `game_cleanroom_sim` 10/10 and `game_license_sim` 12/12 |
| Phase 1 behavior remains intact | Proven | all twenty focused Phase 1 suites and both exact platform catalogs passed serially without a changed count |
| Existing DRIVN media, save, network, data, driving, and input paths remain intact | Proven | seven inherited gates, 122/122 |

## Clean-room and attribution record

`game_cleanroom_sim` reported **10 passed, 0 failed**. It proved:

- the OpenSoldat row pins revision
  `967097b7623f6e8b24b3bc7ad10d97a9367a99f0`, records the MIT code license,
  and keeps base content as a separate CC-BY-4.0 exclusion;
- RUST RUNNERS carries the MIT notice at
  `res://third_party/licenses/opensoldat-mit.txt` and discloses the relationship
  in its in-game About surface and mercenary manual;
- the Soldat mark and OpenSoldat base maps, sprites, art, audio, branding,
  names, and prose are excluded;
- BLACK GRID imports no FreeInfantry or Infantry Online client/server code,
  maps, zone files, art, sound, names, text, branding, or proprietary data;
- the FreeInfantry/Infantry relationship is reference-only player-facing
  behavior, recorded at
  `res://third_party/licenses/freeinfantry-reference-note.txt`; it grants no
  license and requires no asset attribution because no protected material is
  imported;
- all runtime filenames, dependencies, maps, zones, weapon identifiers, and
  media fields remain original DRIVN material; and
- both manuals state the boundary inside the game.

The aggregate notice distinguishes material used from material excluded. The
OpenSoldat attribution must ship with the game. BLACK GRID's reference note is
kept as an honest provenance record, not as a claim that upstream material was
licensed or copied.

## Fresh serial command evidence

Every scene ran independently and serially with Godot 4.5.1 against the real
project path:

```powershell
& $godot --headless --path game ("res://proto3d/tests/$test.tscn")
```

Phase 1 focused rules and exact catalogs:

- Handheld: WASTE HEAP 14, RADWORM 13, DEAD GROUND 16, PACK RAT 14,
  BUNKER BREAKER 15, LAST MILE 17, IRON DOME 15, FALL LINE 16,
  TILT//SALVAGE 16, RELAY BLOOM 15.
- Console: CROWN OF ASH 26, DIAL TANKS 17, RED SKY 19, BLACK ORBIT 18,
  GRIDBREACH 18, RUSTBALL 16, FUEL RUN 18, SKYJOUST 17,
  FIGHT NIGHT '99 20, ASHLAND COMMAND 21.
- `handheld_catalog_sim` 74 and `console_catalog_sim` 96.

Phase 1 retained subtotal: **22 scenes, 511 passed, 0 failed**.

Phase 2 focused and combined catalog gates:

- RUST RUNNERS 46, BLACK GRID 53, shared shooter controls 10, shared shooter
  kernel 16, clean-room 10, and all-22 `game_catalog_sim` 158.

Phase 2 focused/catalog subtotal: **6 scenes, 293 passed, 0 failed**.

All focused/catalog evidence: **28 scenes, 804 passed, 0 failed**.

World and Game Deck integration:

- acquisition 20, ledger 23, local multiplayer 6, online multiplayer 8;
- spectacle 19, world placement 8, registry 19, semantic input 14;
- shell 22, Game Deck network 24, device 13, passenger 12;
- Game Deck save 7, licensing/provenance 12, betting 12.

Integration subtotal: **15 scenes, 219 passed, 0 failed**.

Inherited DRIVN gates:

- media registry 15, TV 25, DRIVN network 16, main save 21, data 19,
  NPC driving 11, input map 15.

Inherited subtotal: **7 scenes, 122 passed, 0 failed**.

Combined fresh scene evidence: **50 scenes, 1,145 passed, 0 failed**.

## Real ENet process evidence

The existing generic console command:

```bash
bash tools/game_console_loopback.sh
```

reported `GAME CONSOLE LOOPBACK: ALL CHECKS PASSED`.

The new flagship command:

```bash
bash tools/game_flagship_loopback.sh
```

started separate host and client Godot processes for RUST RUNNERS, then BLACK
GRID. In each match the client's physical D key produced semantic seat-1 move
input; the host moved the real remote actor and published its stock third-tick
deep combat snapshot; the client converged to that position; the host finished
the ordinary cartridge and deliberately resent the result; and both sides
confirmed one result signal and one ledger row. Both games ended with host and
client `ALL CHECKS PASSED` lines.

## Expected non-failing engine lines

All fifty named scenes returned exit code 0. Cleanup-only resource counts were
reported after `game_acquisition_sim` (3), `game_spectacle_sim` (1),
`game_world_sim` (3), `game_device_sim` (4), and `game_save_sim` (3). These
occur after each harness has printed its zero-failure verdict and match the
known main-scene teardown behavior. No unexpected script, parse, runtime, or
engine error appeared in the fresh suite.

## GPU render inspection

A non-headless Godot 4.5.1 Compatibility run rendered five 1793x1009 frames
on the local NVIDIA GeForce RTX 4090 under
`user://game_deck_phase_2_visual/`:

- `01_rust_runners_shell.png` — shared shell, eight combatants, four local
  seats, original refinery arena, CTF flags, kill feed, live ammo/health/vest/
  jet status, and readable eight-player scoreboard;
- `02_black_grid_shell.png` — shared shell, sixteen combatants, original
  tactical field, darkness/fog, radar, capture nodes, vehicles, deployables,
  tickets, vote state, and loadout/mass/armor/energy/heat status;
- `03_rust_runners_drive_in.png` — the Monday late bracket, named entrants,
  poster, announcer, and live eight-actor match on STATIC SKY's physical screen;
- `04_black_grid_game_hall.png` — Wednesday entry/prize/poster copy and a live
  sixteen-actor match on COUNTY CONTINUITY HALL's physical screen; and
- `05_shelf_drive_in_military_caches.png` — the physical `2 / 22` starter shelf
  beside the labeled drive-in and military acquisition caches.

Visual QA rejected and rerendered two intermediate frames: the 1793x1009
window initially inherited a 1920x1080 virtual canvas after a shell reopen,
cropping BLACK GRID's frame, and the first shelf camera sat behind a safehouse
wall. The accepted pass uses one matching viewport law and an unobstructed
inspection position. All five accepted frames were visually inspected. The
temporary capture harness was removed. No purple or upstream art/audio appears.

## Final disposition

The approved Game Deck Phase 2 scope is closed with twenty-two playable games,
two mechanically faithful but lawfully original flagship shooters, one shared
control/combat substrate, physical and tournament culture inside DRIVN, honest
notices and strategy books, local and real remote play, deterministic save and
result behavior, and zero failing assertions.
