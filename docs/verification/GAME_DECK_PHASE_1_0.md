# Game Deck Phase 1.0 Verification

Date: 2026-07-10
Branch: `codex/game-deck-build`
Scope: shared Game Deck substrate plus WASTE HEAP and CROWN OF ASH proof cartridges

## Verdict

Phase 1.0 is **proven**. No Phase 1.0 acceptance item is contradicted or missing.
This verdict does not claim the remaining eighteen Phase 1 cartridges, passenger
play, venue spectacle, or the two Phase 2 flagship shooters; those remain the
next delivery slices under the committed 22-game goal.

## Requirement classification

| Phase 1.0 acceptance item | Classification | Direct evidence |
|---|---|---|
| Exactly 20 Phase 1 rows: 10 handheld and 10 console; two Phase 2 rows | Proven | `game_registry_sim`: 9/9 |
| Missing future cartridges do not prevent DRIVN from loading | Proven | Registry reports uninstalled rows without malformed catalog; shell isolates a missing RADWORM scene as cartridge error |
| One deck lifecycle and always-live viewport drive every physical/fullscreen consumer | Proven | `game_shell_sim`: 19/19; `game_device_sim`: 13/13 |
| Shell is keyboard/pad focusable, has raw close/pause behavior, and does not pause the world | Proven | `game_shell_sim`; GPU frame inspection at 1280x720 |
| Shell remains inside the visible frame | Proven | A GPU capture exposed the original centered-anchor clipping; `game_shell_sim` now asserts the complete bezel lies inside the viewport |
| Shared semantic input isolates keyboard and two pad devices and exposes live HELP labels | Proven | `game_input_sim`: 10/10; `input_map_sim`: 15/15 |
| Shared score ledger validates results, rejects duplicates, separates rulesets, caps history, and preserves challenges/house rows | Proven | `game_ledger_sim`: 17/17 |
| One-file save preserves Game Deck unlocks/settings/scores and gives old saves clean starters | Proven | `game_save_sim`: 7/7 plus existing `save_sim`: 21/21 |
| Safehouse console uses ordinary E interaction; pocket hardware is a reusable inventory item | Proven | Real input events through `game_device_sim`; item row in `items.json` |
| Console and handheld share the exact live texture; handheld honors 1:1, 9:16, and 16:9 device rows | Proven | `game_device_sim`: texture identity plus explicit square/portrait/landscape dimensions |
| Playing grants no damage immunity, does not freeze the clock, and never changes `Engine.time_scale` | Proven | `game_device_sim`: damage, clock, and time-scale checks |
| WASTE HEAP supplies deterministic standard 2048, pause/snapshot, one normalized result, score, and seeded challenge support | Proven | `waste_heap_sim`: 14/14; `game_ledger_sim`; `game_net_sim` |
| CROWN OF ASH supplies complete deterministic chess beneath an original battle-capture vignette | Proven | `crown_of_ash_sim`: legality, special moves, mate/stalemate/draws, snapshots, vignette order |
| CROWN OF ASH supports solo AI, two local armies, reliable online moves, and read-only spectators | Proven | `crown_of_ash_sim`: 26/26; `game_shell_sim`; `game_net_sim`: 18/18 |
| Current-session network seam validates membership, authority, ordering, and idempotency without per-game RPCs | Proven | `game_net_sim`; real two-process `tools/net_loopback.sh` |
| Every source has pinned/access-dated provenance, local notice, exclusions, and separate license path where licensed | Proven | `game_license_sim`: 8/8; `game_sources.json`; `THIRD_PARTY_NOTICES.md` |
| ABOUT visibly separates in-world lore from real source, license, adapted material, and exclusions | Proven | `game_shell_sim`; `game_shell.gd::_about_text` |
| Existing input, media, TV, save, network, and data behavior remains intact | Proven | Six serial regression scenes, 111/111 checks |

Contradicted Phase 1.0 items: **none**.
Missing Phase 1.0 items: **none**.

## Fresh command evidence

The audit ran every scene in a single serial PowerShell loop using:

```powershell
& $godot --headless --path game ("res://proto3d/tests/" + $test + ".tscn")
```

Phase 1.0 scenes and observed summaries:

- `game_registry_sim` — 9 passed, 0 failed
- `game_input_sim` — 10 passed, 0 failed
- `game_ledger_sim` — 17 passed, 0 failed
- `waste_heap_sim` — 14 passed, 0 failed
- `crown_of_ash_sim` — 26 passed, 0 failed
- `game_shell_sim` — 19 passed, 0 failed
- `game_net_sim` — 18 passed, 0 failed
- `game_device_sim` — 13 passed, 0 failed
- `game_save_sim` — 7 passed, 0 failed
- `game_license_sim` — 8 passed, 0 failed

Phase subtotal: **141 passed, 0 failed**.

Serial regression scenes:

- `input_map_sim` — 15 passed, 0 failed
- `media_registry_sim` — 15 passed, 0 failed (its duplicate-id error line is intentional proof)
- `tv_sim` — 25 passed, 0 failed
- `save_sim` — 21 passed, 0 failed
- `net_sim` — 16 passed, 0 failed
- `data_sim` — 19 passed, 0 failed

Regression subtotal: **111 passed, 0 failed**.
Combined: **252 passed, 0 failed**.

Real ENet proof:

```text
bash tools/net_loopback.sh
HOST: LISTENING on 24777
HOST: A CLIENT CONNECTED
CLIENT: CONNECTED to host — the wasteland is shared
NET LOOPBACK: ALL CHECKS PASSED
```

## Render inspection

A non-headless Godot 4.5.1 Compatibility render ran at 1280x720 on the local
NVIDIA renderer. It captured the physical console sampling the live WASTE HEAP
SubViewport and the fullscreen CROWN OF ASH shell. The first capture revealed
that the shell's center anchor was being used as its top-left corner, clipping
half the UI. The shell was changed to a margin-safe full-rect layout, a geometry
regression check was added, and the second capture showed the complete amber
bezel, tabs, board, controls copy, power button, and status line inside frame.

No visual deviation remained in the Phase 1.0 proof surfaces.

## Deliberately deferred scope

The following are not counted as Phase 1.0 completion and remain required by
the master design:

- nine more handheld and nine more console cartridges with focused rules sims;
- passenger-seat handheld lifecycle and damage/exit handling;
- discovery loot, local-radius invitations, venues, schedules, brackets, and
  SPECTACLES mirroring;
- controller/network reconnect grace and full tournament policy;
- RUST RUNNERS, BLACK GRID, the shared shooter kernel, original flagship art,
  and the final clean-room audit.
