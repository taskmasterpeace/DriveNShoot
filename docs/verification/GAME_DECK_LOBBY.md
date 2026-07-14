# Game Deck Lobby Verification

Verified: 2026-07-10
Branch: `codex/game-deck-build`
Godot: 4.5.1 stable, Compatibility renderer
Scope: console MATCH flow, player invitations, same-session online play,
spectating, and universal bot fill.

## Completion verdict

| Gate | Result |
|---|---:|
| Named player actions present | 7 / 7 |
| Console cartridges using participant contract | 12 / 12 |
| Real ENet player and spectator passes | 2 / 2 |
| GPU acceptance frames inspected | 5 / 5 |
| Serial Godot scenes | 38 / 38 |
| Serial assertions | 1,007 / 1,007 |
| Two-process loopback scripts | 4 / 4 |
| Contradictions | 0 |
| Missing requirements | 0 |

## Seven player actions

| Action | Player-visible behavior | Evidence |
|---|---|---|
| SOLO | Creates one host seat and starts with the catalog ceiling when bot fill is on. | `game_lobby_sim` and `game_lobby_policy_sim` |
| LOCAL GAME | Discovers a real remote `CharacterBody3D` only inside the cartridge radius; acceptance rechecks range. | `game_lobby_policy_sim`, `game_local_mp_sim` |
| ONLINE GAME | Uses only peers in the same live DRIVN session; offline selection reports `NO LIVE DRIVN SESSION`. | `game_lobby_sim`, `game_online_mp_sim` |
| INVITE PLAYER | Creates one 30-second, non-duplicating invitation and exposes it in MATCH. | `game_lobby_policy_sim`, `game_online_mp_sim` |
| JOIN MATCH | Consumes one invitation into one distinct seat; ownership is required. | `game_online_mp_sim`, player loopback |
| SPECTATE | Bypasses cartridge ownership, creates no seat, sends no input, and writes no observed result to the personal ledger. | `game_online_mp_sim`, spectator loopback |
| FILL EMPTY SEATS WITH BOTS | Toggles the shared `actor_count` contract for every console cartridge. | `game_bot_fill_sim`, `game_lobby_sim` |

All seven controls are exact-text real `Button` nodes, visible, explicitly
hover/focus styled, and `FOCUS_ALL`. Opening MATCH transfers controller focus
off the hidden library row. Empty candidate/invitation actions return visible
reasons instead of silently doing nothing.

## Policy and failure matrix

| Rule | Accepted case | Refused case and exact behavior |
|---|---|---|
| Power | Powered physical terminal | `CONSOLE HAS NO POWER`; power loss closes MATCH and clears ephemeral state |
| Ownership | Host/player owns ordinary cartridge | Player join reports `CARTRIDGE NOT OWNED`; spectator may still observe |
| Platform | Console cartridge | Handheld row reports `CONSOLE GAME REQUIRED` |
| Local proximity | Body inside declared 4 m / flagship 5 m radius | Far body omitted; moved-away invite reports `PLAYER LEFT TERMINAL RANGE` |
| Session | Same live DRIVN session | `NO LIVE DRIVN SESSION` or `WRONG DRIVN SESSION` |
| Host presence | Host remote body remains connected | `MATCH HOST LEFT`, invitation remains unconsumed |
| Capacity | Accepted/reserved seats below catalog maximum | `MATCH IS FULL`, roster unchanged |
| Freshness | Invitation age under 30,000 monotonic ms | `INVITATION EXPIRED`, roster unchanged |
| Idempotency | First valid offer/response/result | Duplicate offer/response/result and reused invite rejected |
| Local spectating | Not applicable | `NO LIVE MATCH TO SPECTATE` |
| Leave | Client emits `lobby_leave` | Host removes seat and ArcadeNet membership; no ghost roster row |

## Bot ceilings

The shared participant contract was proved in all console cartridges with bot
fill on and off. Explicit `context.actor_count` wins; otherwise enabled bot fill
uses the row maximum and disabled fill uses accepted humans/rules minimum.

| Cartridge | Maximum participants |
|---|---:|
| CROWN OF ASH | 2 |
| DIAL TANKS | 4 |
| RED SKY | 4 |
| BLACK ORBIT | 4 |
| GRIDBREACH | 4 |
| RUSTBALL | 4 |
| FUEL RUN | 4 |
| SKYJOUST | 2 |
| FIGHT NIGHT '99 | 2 |
| ASHLAND COMMAND | 2 |
| RUST RUNNERS | 8 |
| BLACK GRID | 16 |

## Real transport evidence

`tools/game_lobby_loopback.sh` runs two fresh ENet host/client process pairs:

- Player: visible `JOIN MATCH`, two seats, semantic keyboard input delivered to
  host seat 1, authoritative tick-3 snapshot convergence, and one ledger write
  after a deliberately duplicated result.
- Spectator: visible `SPECTATE`, one host seat plus one spectator, client deck
  state `SPECTATING`, zero client ticks/input, authoritative tick-3 snapshot
  convergence, one result signal, and zero spectator ledger writes.

The existing main network, console, and flagship loopbacks also remained green:

- `tools/net_loopback.sh`
- `tools/game_console_loopback.sh`
- `tools/game_flagship_loopback.sh` for RUST RUNNERS and BLACK GRID
- `tools/game_lobby_loopback.sh` for player and spectator modes

## GPU acceptance

Five 1793×1009 frames were rendered independently on an NVIDIA GeForce RTX
4090 with Godot Compatibility/OpenGL 3.3 and inspected at original resolution.

| Frame | State | Verdict |
|---|---|---|
| `01-solo-bot-fill.png` | SOLO, bot fill ON, four-seat copy | No clipping; focus and bot state visible |
| `02-local-nearby.png` | LOCAL GAME, nearby ROAD PARTNER | Candidate and selected mode readable |
| `03-online-joined.png` | ONLINE, joined seat plus pending invitation | Roster/pending columns remain distinct |
| `04-pending-join-spectate.png` | Incoming offer | JOIN MATCH and SPECTATE are visible together |
| `05-live-spectating.png` | Live DIAL TANKS spectator | `SPECTATING // INPUT LOCKED` is prominent |

Palette remained ink/card/amber/bone/rust/signal-teal. No purple was introduced.

## Serial regression record

| Batch | Coverage | Scenes | Assertions |
|---|---|---:|---:|
| 1 | Bot/lobby core, 12 focused console games, console + full catalogs | 17 | 653 |
| 2 | Shell, device, local/online/network, passenger, save, spectacle, world, input, registry, acquisition, ledger, license | 14 | 232 |
| 3 | Media registry, TV, main network/save/data/NPC drive/input map | 7 | 122 |
| Total | Serial, independent processes | 38 | 1,007 |

Eight successful main-scene processes emitted Godot shutdown-only cleanup
diagnostics after their `ALL CHECKS PASSED` line and exit code 0:

- `WARNING: ObjectDB instances leaked at exit`
- `ERROR: 3 resources still in use at exit`

No parse error, runtime assertion failure, network watchdog, or nonzero test exit
remained in the final run.

## Audit conclusion

There are zero known contradictions and zero missing items for the requested
seven-action Game Deck lobby. “Online” deliberately means another powered
terminal in the current DRIVN session; this work does not claim public internet
matchmaking, external accounts, or a global service.
