# Game Deck Phase 1.3 World and Spectacle Implementation Plan

> Execute serially in `D:\git\carworld\.worktrees\game-deck-build` on
> `codex/game-deck-build`. Every behavior lands red-sim first and every commit
> leaves the relevant focused and inherited gates green.

**Goal:** Make the twenty completed Phase 1 games real DRIVN possessions and
places: find/install cartridges, launch them from owned libraries, compare
honest boards, invite nearby or remote peers, travel to scheduled tournaments,
watch the ordinary cartridge texture on venue screens, see brackets/wagers/
announcer copy, win prizes, and survive trap interruptions.

**Architecture:** Ownership remains in `ProtoScoreLedger`; physical item rows
install generic `game_cart_<game_id>` ids through one prefix path. The console,
handheld, and new shelf all query the same unlocked set. `ProtoGameVenue` loads
venue/event rows and starts the ordinary `ProtoGameDeck`; `ProtoGameSpectator`
only mirrors its existing texture. Tournament policy, brackets, prizes, traps,
and `ProtoBetting` stay outside cartridge rules. No game-specific branch enters
`ProtoMain`.

**Hard laws:** The world never pauses; starter games remain WASTE HEAP and
CROWN OF ASH; global boards say unavailable rather than inventing users;
fictional house entries stay labeled; power/network costs are surfaced but no
fake utility fee is charged; nearby local peers must be inside each row's real
radius; all venue art is original ink/bone/amber/rust with no purple.

---

## Task 1: Ownership and acquisition contract

**Files:**

- Create: `game/proto3d/tests/game_acquisition_sim.gd/.tscn`
- Modify: `game/proto3d/games/score_ledger.gd`
- Modify: `game/proto3d/games/game_shell.gd`
- Modify: `game/data/items.json`
- Modify: `game/proto3d/proto3d.gd`

- [x] Red sim: new ledger contains exactly the two starter games; locked rows
  remain visible but cannot launch from the library; an owned generic cartridge
  item installs once, is consumed by the normal USE path, survives save/restore,
  and becomes launchable without any game-id branch.
- [x] Add `is_unlocked`, `unlock`, and installed-count helpers with idempotency.
- [x] Add eighteen Phase 1 `game_cart_<game_id>` item rows with platform-aware
  names/descriptions; starter media is already installed and is not duplicated.
- [x] Gate ordinary library launch by ownership while allowing an explicit
  venue-owned tournament context.
- [x] Commit `feat: add physical Game Deck cartridge ownership`.

## Task 2: Real shelf, auto-start, power, and world caches

**Files:**

- Create: `game/proto3d/games/game_shelf.gd`
- Modify: `game/proto3d/games/game_shell.gd`
- Modify: `game/proto3d/games/game_console.gd`
- Modify: `game/proto3d/proto3d.gd`
- Modify: `game/data/loot_tables.json`
- Modify: `game/proto3d/tests/game_device_sim.gd`
- Modify: `game/proto3d/tests/game_shell_sim.gd`
- Extend: `game/proto3d/tests/game_acquisition_sim.gd`

- [x] Red sim: the safehouse owns an interactable cartridge shelf beside the
  TV; it reports installed/total, opens the same ownership-gated library, and
  cannot make locked games playable.
- [x] Make real library button activation launch **and start** through the same
  deck using an explicit auto-start context; direct test/dev launch remains
  controllable. Surface row power draw and network cost in the bezel.
- [x] Refuse an unpowered console without deducting a fictional fee; safehouse
  defaults powered until a future household grid supplies a real state.
- [x] Add deterministic firmware, electronics, drive-in, and military cache
  tables/physical chests so all non-prize Phase 1 media has a world path.
- [x] Commit `feat: wire Game Deck shelf power and world caches`.

## Task 3: Complete honest leaderboards

**Files:**

- Modify: `game/data/game_leaderboards.json`
- Modify: `game/proto3d/games/score_ledger.gd`
- Modify: `game/proto3d/games/game_shell.gd`
- Modify: `game/proto3d/tests/game_ledger_sim.gd`

- [x] Red sim: all twenty Phase 1 games have explicitly fictional house rows;
  personal, house, current-session, and challenge scopes remain separated;
  challenge comparison requires game/ruleset/seed; GLOBAL is visibly offline.
- [x] Render rank, scope, primary/secondary values, and fictional labels without
  mixing lore NPC records with real profiles.
- [x] Preserve caps, idempotency, and ruleset isolation.
- [x] Commit `feat: complete Game Deck leaderboards`.

## Task 4: Nearby and remote terminal policy

**Files:**

- Create: `game/proto3d/games/game_session_broker.gd`
- Create: `game/proto3d/tests/game_local_mp_sim.gd/.tscn`
- Create: `game/proto3d/tests/game_online_mp_sim.gd/.tscn`
- Modify: `game/proto3d/games/game_console.gd`
- Modify: `game/proto3d/games/game_shell.gd`
- Modify: `game/proto3d/tests/game_net_sim.gd`

- [x] Red local sim: a real remote character outside the row radius cannot be
  invited; after real CharacterBody motion into radius the invitation succeeds,
  creates two declared seats, and both inputs affect the ordinary cartridge.
- [x] Red online sim: two powered terminals in one DRIVN session may form a
  remote offer; wrong session, missing power, non-member, and locked ordinary
  library launches are refused.
- [x] Keep invites/events/snapshots/results on the one `ProtoArcadeNet` bridge;
  no per-game RPC and no public matchmaking fiction.
- [x] Commit `feat: add Game Deck terminal invitations`.

## Task 5: Data-driven tournament venues and spectator screens

**Files:**

- Create: `game/data/game_tournaments.json`
- Create: `game/proto3d/games/game_spectator.gd`
- Create: `game/proto3d/games/game_venue.gd`
- Create: `game/proto3d/tests/game_spectacle_sim.gd/.tscn`

- [x] Red sim: venue/event rows validate unique ids, installed console games,
  visible schedules, entry/prize/trap fields, original venue labels, and no
  purple color data.
- [x] Build three physical venue types (drive-in, roadhouse, game hall) from
  Godot primitives with a live 16:9 mirror, tote/bracket board, poster, status,
  and announcer line.
- [x] Schedule ten console event rows so every Phase 1 console game has a night;
  event lookup is deterministic by game day/hour.
- [x] Prove the spectator samples `deck.texture()` exactly and never owns game
  simulation or changes time scale.
- [x] Commit `feat: add Game Deck tournament venues`.

## Task 6: Brackets, entry, wagers, prizes, and traps

**Files:**

- Modify: `game/proto3d/games/game_venue.gd`
- Modify: `game/proto3d/games/score_ledger.gd`
- Modify: `game/proto3d/newsroom.gd`
- Extend: `game/proto3d/tests/game_spectacle_sim.gd`

- [ ] Red sim: entering live event pays its declared entry once and starts the
  ordinary cartridge/runtime; a completed player win advances the bracket,
  records one tournament result, pays scrip once, and grants any cartridge prize.
- [ ] Reuse `ProtoBetting` for optional visible wagers outside cartridge code;
  settlement is idempotent and pays physical scrip.
- [ ] Deterministic trap roll can interrupt the bezel without corrupting or
  fabricating a result; expose the branch as a signal/announcer/broadcast hook.
- [ ] Queue tournament ads and player-win radio/TV lines through `ProtoNewsroom`.
- [ ] Commit `feat: add Game Deck brackets wagers and traps`.

## Task 7: Main-world placement and navigation

**Files:**

- Modify: `game/proto3d/proto3d.gd`
- Modify: `game/proto3d/tests/game_device_sim.gd`
- Create: `game/proto3d/tests/game_world_sim.gd/.tscn`

- [ ] Red sim: the real main scene contains the shelf, four acquisition caches,
  and all declared venue instances at their row positions; each appears through
  the ordinary interactable contract and venue waypoints are reachable.
- [ ] Append venue waypoints before world-stream setup so tournament travel is
  surfaced through the existing N/atlas path.
- [ ] Make save/load preserve installs, results, challenges, and tournament
  records while reconstructing physical venue/shelf state from data.
- [ ] Commit `feat: place Game Deck culture in the DRIVN world`.

## Task 8: Combined twenty-game proof and spectacle render

**Files:**

- Create: `game/proto3d/tests/game_catalog_sim.gd/.tscn`
- Create: `docs/verification/GAME_DECK_PHASE_1_3.md`
- Modify: `game/proto3d/tests/game_license_sim.gd`

- [ ] Iterate all twenty Phase 1 games through ownership-aware launch, semantic
  input, pause, snapshot, forced completion, one ledger write, and clean stop.
- [ ] Run focused acquisition, board, local, online, venue, device, save,
  passenger, catalog, license, media, world, and network regressions serially.
- [ ] Re-run real console ENet loopback.
- [ ] GPU-render and inspect shelf/cache, drive-in match, roadhouse bracket,
  game-hall screen, and tournament trap interruption; remove capture harness.
- [ ] Record exact counts, contradictions, missing items, expected engine lines,
  and deferred Phase 2 scope. Zero Phase 1 missing items is the gate.
- [ ] Commit `test: verify Game Deck phase 1.3`.

## Phase 1.3 completion command

```powershell
$godot = 'C:\Users\taskm\Downloads\projects\Godot\Godot_v4.5.1-stable_win64_console.exe'
$tests = @(
  'game_acquisition_sim','game_ledger_sim','game_local_mp_sim',
  'game_online_mp_sim','game_spectacle_sim','game_world_sim','game_catalog_sim',
  'game_registry_sim','game_input_sim','game_shell_sim','game_net_sim',
  'game_device_sim','game_passenger_sim','game_save_sim','game_license_sim',
  'betting_sim','media_registry_sim','tv_sim','net_sim','save_sim','data_sim'
)
foreach ($test in $tests) {
  & $godot --headless --path game ("res://proto3d/tests/" + $test + ".tscn")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
bash tools/game_console_loopback.sh
```
