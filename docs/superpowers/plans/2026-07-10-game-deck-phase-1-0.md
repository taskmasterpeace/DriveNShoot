# DRIVN Game Deck Phase 1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the one-wire Game Deck runtime and prove it with WASTE HEAP (handheld 2048) and CROWN OF ASH (16:9 battle chess), including shared input, score persistence, physical render targets, help/attribution, and a generic current-session network seam.

**Architecture:** `ProtoGameRegistry` validates data rows and instantiates only declared cartridge scenes. `ProtoGameDeck` owns the active cartridge, deterministic tick, seats, render viewport, results, and save-backed ledger; cartridges implement `ProtoGameCartridge` and cannot reach the main world directly. `ProtoGameShell`, `ProtoGameConsole`, and `ProtoGameHandheld` consume the same deck texture and lifecycle so later cartridges add no branches to the host game.

**Tech Stack:** Godot 4.5.1, typed GDScript 2.0, JSON content rows, `SubViewportTexture`, existing `ProtoInputMap`, existing ENet `ProtoNet`, serial headless sims.

## Global Constraints

- `res://` is `game/`; never use `res://game/`.
- Every game is a row plus a cartridge scene; no game-specific branch may be added to `ProtoMain`.
- Phase 1 catalog validation must see exactly 10 handheld and 10 console rows; Phase 2 must see exactly 2 flagship rows.
- Console baseline is 16:9 at 1280×720; handheld baselines are 640×640, 540×960, or 1280×720 according to the row.
- The world never pauses and `Engine.time_scale` remains unchanged while a cartridge is open.
- Input logic consumes semantic snapshots, never raw keys or buttons.
- Shell/menu states honor visible ✕, raw Esc, and raw pad B; active play sends pad B to the cartridge.
- UI chrome uses ink, bone, amber, warm red, and restrained teal; no purple, violet, or magenta.
- Scores are idempotent on `result_id` and records never compare across `ruleset` versions.
- Missing rows, scenes, art, or notices disable only the affected cartridge; DRIVN still boots.
- Infantry client code, maps, art, sounds, names, and prose are never imported.
- Run Godot sims serially because they share `user://`.
- Preserve all unrelated working-tree edits and screenshots; stage only files named by the active task.

---

## File Map

### Data

- `game/data/games.json` — all 22 catalog rows and cartridge metadata.
- `game/data/game_sources.json` — rights/provenance rows and local notice paths.
- `game/data/game_devices.json` — console and three handheld screen/device rows.
- `game/data/game_leaderboards.json` — explicitly fictional house-score rows.
- `game/data/input_bindings.json` — shared `ARCADE` semantic actions.
- `game/data/books.json` — proof-cartridge manual chapters.

### Runtime

- `game/proto3d/games/game_registry.gd` — row loading, validation, lookup, scene resolution.
- `game/proto3d/games/game_cartridge.gd` — lifecycle contract and result idempotency.
- `game/proto3d/games/arcade_input_router.gd` — hardware seat assignment and semantic snapshots.
- `game/proto3d/games/score_ledger.gd` — record validation, comparisons, challenges, save serialization.
- `game/proto3d/games/game_net.gd` — generic invitation/input/event/snapshot/result seam over a live `ProtoNet` session.
- `game/proto3d/games/game_deck.gd` — active cartridge/viewport/session owner.
- `game/proto3d/games/game_shell.gd` — heavy-bezel library/play/help/about/scores UI.
- `game/proto3d/games/game_console.gd` — physical 16:9 interactable and live texture consumer.
- `game/proto3d/games/game_handheld.gd` — physical handheld item/prop and live texture consumer.

### Proof cartridges

- `game/proto3d/games/waste_heap/waste_heap.gd` and `.tscn` — deterministic 2048 rules/presentation.
- `game/proto3d/games/crown_of_ash/crown_of_ash.gd` and `.tscn` — complete chess rules, deterministic AI, battle-capture event.

### Host integration

- `game/proto3d/proto3d.gd` — constructs one deck/shell, routes modal input, adds `game_deck` save block.
- `game/proto3d/net.gd` — exposes the generic arcade bridge node without cartridge-specific RPCs.

### Tests and notices

- `game/proto3d/tests/game_registry_sim.gd/.tscn`
- `game/proto3d/tests/game_input_sim.gd/.tscn`
- `game/proto3d/tests/game_ledger_sim.gd/.tscn`
- `game/proto3d/tests/waste_heap_sim.gd/.tscn`
- `game/proto3d/tests/crown_of_ash_sim.gd/.tscn`
- `game/proto3d/tests/game_shell_sim.gd/.tscn`
- `game/proto3d/tests/game_device_sim.gd/.tscn`
- `game/proto3d/tests/game_save_sim.gd/.tscn`
- `game/proto3d/tests/game_license_sim.gd/.tscn`
- `game/THIRD_PARTY_NOTICES.md`
- `game/third_party/licenses/*.txt`

---

### Task 1: Catalog and Provenance Registry

**Files:**
- Create: `game/data/games.json`
- Create: `game/data/game_sources.json`
- Create: `game/data/game_devices.json`
- Create: `game/data/game_leaderboards.json`
- Create: `game/proto3d/games/game_registry.gd`
- Create: `game/third_party/licenses/littlejs-arcade-mit.txt`
- Test: `game/proto3d/tests/game_registry_sim.gd`
- Test: `game/proto3d/tests/game_registry_sim.tscn`

**Interfaces:**
- Produces: `ProtoGameRegistry.load_catalog(games_path := GAMES_PATH, sources_path := SOURCES_PATH, devices_path := DEVICES_PATH) -> ProtoGameRegistry`
- Produces: `get_game(id: String) -> Dictionary`, `get_device(id: String) -> Dictionary`, `phase_rows(phase: int) -> Array`, `installed(id: String) -> bool`, `enabled(id: String) -> bool`
- Produces: public `rows`, `order`, `sources`, `devices`, and `load_warnings`.

- [ ] **Step 1: Write the failing registry sim**

```gdscript
extends Node
var failed := 0
func check(label: String, ok: bool) -> void:
    print("GAME_REG: %s - %s" % ["PASS" if ok else "FAIL", label])
    if not ok: failed += 1
func _ready() -> void:
    var reg := ProtoGameRegistry.load_catalog()
    var phase_one := reg.phase_rows(1)
    check("twenty phase-one rows", phase_one.size() == 20)
    check("ten handheld rows", phase_one.filter(func(r): return r["platform"] == "handheld").size() == 10)
    check("ten console rows", phase_one.filter(func(r): return r["platform"] == "console").size() == 10)
    check("two phase-two rows", reg.phase_rows(2).size() == 2)
    check("proof rows declared", reg.rows.has("waste_heap") and reg.rows.has("crown_of_ash"))
    check("missing future scenes are uninstalled, not malformed", not reg.installed("radworm"))
    check("catalog validates", reg.load_warnings.is_empty())
    get_tree().quit(0 if failed == 0 else 1)
```

- [ ] **Step 2: Run the sim and verify the missing registry fails**

Run: `C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe --headless --path game res://proto3d/tests/game_registry_sim.tscn`

Expected: non-zero exit with `Identifier "ProtoGameRegistry" not declared`.

- [ ] **Step 3: Add the complete 22-row catalog and four device rows**

Use the exact IDs and titles from `docs/superpowers/specs/2026-07-10-drivn-game-deck-design.md` sections 5 and 6. Every row must include `id`, `phase`, `platform`, `title`, `aspect`, `players`, `cartridge_scene`, `score`, `controls_profile`, `manual_book_id`, `source_ids`, `requires_power`, `power_draw`, `network_cost`, `unlock_type`, `ruleset`, `help`, `about_world`, and `local_radius_m` for consoles. Phase 1 rows whose scenes do not exist yet use the final intended scene path and `installed()` must return false without treating the missing scene as a malformed row. Add the verbatim LittleJS Arcade MIT license now because both proof cartridges declare that source; future source notices may remain absent until Task 8 and therefore keep only their own cartridges disabled.

- [ ] **Step 4: Implement strict registry validation**

```gdscript
class_name ProtoGameRegistry
extends RefCounted
const GAMES_PATH := "res://data/games.json"
const SOURCES_PATH := "res://data/game_sources.json"
const DEVICES_PATH := "res://data/game_devices.json"
const ALLOWED_ASPECTS := ["1:1", "9:16", "16:9"]
var rows: Dictionary = {}
var order: Array = []
var sources: Dictionary = {}
var devices: Dictionary = {}
var load_warnings: Array = []

static func load_catalog(games_path: String = GAMES_PATH, sources_path: String = SOURCES_PATH, devices_path: String = DEVICES_PATH) -> ProtoGameRegistry:
    var out := ProtoGameRegistry.new()
    out._load_sources(sources_path)
    out._load_devices(devices_path)
    out._load_games(games_path)
    return out

func installed(id: String) -> bool:
    var row := get_game(id)
    return not row.is_empty() and ResourceLoader.exists(String(row.get("cartridge_scene", "")))

func enabled(id: String) -> bool:
    var row := get_game(id)
    if not installed(id): return false
    for source_id in row.get("source_ids", []):
        var source: Dictionary = sources.get(String(source_id), {})
        if source.is_empty() or not FileAccess.file_exists(String(source.get("notice_path", ""))):
            return false
    return true
```

Validation rejects duplicate/empty ids, bad phase/platform/aspect/player ranges, missing score direction, unknown sources, missing manual/help/about fields, and an unsupported device. Missing cartridge scenes remain valid but uninstalled.

- [ ] **Step 5: Import and rerun the registry sim**

Run: `C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe --headless --path game --import`

Expected: exit 0 after class cache refresh.

Run: `C:/Users/taskm/Downloads/projects/Godot/Godot_v4.5.1-stable_win64_console.exe --headless --path game res://proto3d/tests/game_registry_sim.tscn`

Expected: all registry checks pass; all 22 rows validate, and missing future scenes report uninstalled without becoming registry errors.

- [ ] **Step 6: Commit the registry slice**

```powershell
git add -- game/data/games.json game/data/game_sources.json game/data/game_devices.json game/data/game_leaderboards.json game/third_party/licenses/littlejs-arcade-mit.txt game/proto3d/games/game_registry.gd game/proto3d/tests/game_registry_sim.gd game/proto3d/tests/game_registry_sim.tscn
git commit -m "feat: add the Game Deck catalog registry"
```

### Task 2: Cartridge Contract and WASTE HEAP Rules

**Files:**
- Create: `game/proto3d/games/game_cartridge.gd`
- Create: `game/proto3d/games/waste_heap/waste_heap.gd`
- Create: `game/proto3d/games/waste_heap/waste_heap.tscn`
- Test: `game/proto3d/tests/waste_heap_sim.gd`
- Test: `game/proto3d/tests/waste_heap_sim.tscn`

**Interfaces:**
- Produces: `ProtoGameCartridge.configure(game_row: Dictionary, context: Dictionary) -> void`
- Produces: `start_match(seed_value: int, seats: Array)`, `apply_inputs(tick: int, snapshots: Array)`, `snapshot()`, `restore_snapshot(state)`, `pause_match(paused)`, `stop_match(reason)`.
- Produces: signals `score_changed(score)`, `match_finished(result)`, and `request_feedback(kind, payload)`.
- WASTE HEAP adds `board: Array`, `move(direction: Vector2i) -> bool`, and `spawn_tile() -> void`.

- [ ] **Step 1: Write the failing deterministic WASTE HEAP sim**

The sim instantiates the real cartridge scene, starts seed `2048`, restores a board with two adjacent `2` tiles, sends semantic `move_left`, verifies one `4`, score `4`, exactly one spawned tile, no double merge for `[2,2,2,2]`, snapshot round-trip, pause rejection, and one result emission after no moves remain.

```gdscript
var game := (load("res://proto3d/games/waste_heap/waste_heap.tscn") as PackedScene).instantiate()
add_child(game)
game.configure(ProtoGameRegistry.load_catalog().get_game("waste_heap"), {"profile_id": "local"})
game.start_match(2048, [{"seat": 0, "profile_id": "local"}])
game.restore_snapshot({"board": [[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], "score": 0, "rng_state": 2048})
game.apply_inputs(1, [{"pressed": {"move_left": true}}])
check("pair merges", game.score == 4 and game.board[0].count(4) == 1)
```

- [ ] **Step 2: Run and observe the missing scene failure**

Expected: non-zero load failure for `waste_heap.tscn`.

- [ ] **Step 3: Implement the base lifecycle and result idempotency**

`finish_match(result)` must add game id, ruleset, seed, seats, tick, and a deterministic session-local `result_id`, emit once, and ignore subsequent calls. `pause_match()` blocks state mutation but does not change `Engine.time_scale`.

- [ ] **Step 4: Implement standard 4×4 2048 behavior and minimal ink/amber rendering**

Use a seeded `RandomNumberGenerator`; start with two tiles; compress, merge once per source tile, compress again, then spawn a 2 (90%) or 4 (10%). A completed result occurs only when the board has no empty cell and no orthogonally equal neighbor. Rendering may use `Control`, `GridContainer`, `PanelContainer`, and labels; it must fit 640×640 and contain no purple colors.

- [ ] **Step 5: Run the focused sim**

Expected: all deterministic merge, pause, snapshot, and finish checks pass.

- [ ] **Step 6: Commit**

```powershell
git add -- game/proto3d/games/game_cartridge.gd game/proto3d/games/waste_heap game/proto3d/tests/waste_heap_sim.gd game/proto3d/tests/waste_heap_sim.tscn
git commit -m "feat: add the WASTE HEAP proof cartridge"
```

### Task 3: Shared Arcade Input and Seat Router

**Files:**
- Modify: `game/data/input_bindings.json`
- Create: `game/proto3d/games/arcade_input_router.gd`
- Test: `game/proto3d/tests/game_input_sim.gd`
- Test: `game/proto3d/tests/game_input_sim.tscn`

**Interfaces:**
- Produces: `assign_keyboard(seat: int)`, `assign_device(seat: int, device: int)`, `unassign_seat(seat: int)`, `feed_event(event: InputEvent)`, `snapshot_for_seat(seat: int) -> Dictionary`, `help_labels(profile: String) -> Array`.
- Snapshot shape: `{seat, device, held, pressed, released, move: Vector2, aim: Vector2, cursor: Vector2}`.

- [ ] **Step 1: Add a failing input sim**

The sim verifies every `ARCADE` action exists, keyboard is seat 0, joypads 1 and 2 remain isolated, movement axes normalize, one-shot presses clear after a snapshot, active-play pad B appears as `stance`, and `help_labels("shooter")` resolves through current `ProtoInputMap.pretty()` values.

- [ ] **Step 2: Run and verify `arcade_primary` is absent**

Expected: the first ARCADE action check fails.

- [ ] **Step 3: Add semantic rows**

Add `arcade_move_up/down/left/right`, `arcade_aim_up/down/left/right`, `arcade_primary`, `arcade_secondary`, `arcade_mobility`, `arcade_stance`, `arcade_reload`, `arcade_interact`, `arcade_weapon_prev`, `arcade_weapon_next`, `arcade_pause`, `arcade_help`, and `arcade_scoreboard` under group `ARCADE`. Use the design defaults; do not alias cartridge logic to on-foot action names.

- [ ] **Step 4: Implement event-device-preserving snapshots**

`feed_event()` must use `event.device`; keyboard and mouse map to device `-1`, joypad events retain their device. Axis inputs update vector state with a 0.25 deadzone. A snapshot duplicates dictionaries and then clears only `pressed` and `released`.

- [ ] **Step 5: Run `input_map_sim` and `game_input_sim` serially**

Expected: both suites pass; existing bindings and rebind persistence remain intact.

- [ ] **Step 6: Commit**

```powershell
git add -- game/data/input_bindings.json game/proto3d/games/arcade_input_router.gd game/proto3d/tests/game_input_sim.gd game/proto3d/tests/game_input_sim.tscn
git commit -m "feat: add shared arcade controls and seats"
```

### Task 4: Score Ledger, Challenges, and Save Shape

**Files:**
- Create: `game/proto3d/games/score_ledger.gd`
- Test: `game/proto3d/tests/game_ledger_sim.gd`
- Test: `game/proto3d/tests/game_ledger_sim.tscn`

**Interfaces:**
- Produces: `submit(result: Dictionary) -> bool`, `personal_best(game_id, ruleset)`, `create_challenge(result, target_peer)`, `board(game_id, ruleset, scope)`, `serialize()`, `restore(data)`.

- [ ] **Step 1: Write the failing ledger sim**

Submit WASTE HEAP scores 100, duplicate 100 with the same `result_id`, then 80 and 120. Verify the duplicate is rejected, recent count is three, high-direction best is 120, a low-direction fixture chooses 80, ruleset 2 never compares with ruleset 1, challenges preserve seed, fictional house rows are labeled, and serialize/restore is lossless.

- [ ] **Step 2: Run and verify the missing class failure**

- [ ] **Step 3: Implement validation and capped persistence**

Reject unknown game ids, missing/duplicate result ids, non-numeric primary scores, unfinished outcomes, and ruleset mismatches. Cap recent results to 50 per game and challenges to 100 total. `board()` sorts by direction, then the row-declared secondary key, and marks `scope: "house"` NPC rows as fictional.

- [ ] **Step 4: Run the ledger sim**

Expected: all idempotency, direction, versioning, cap, and round-trip checks pass.

- [ ] **Step 5: Commit**

```powershell
git add -- game/proto3d/games/score_ledger.gd game/proto3d/tests/game_ledger_sim.gd game/proto3d/tests/game_ledger_sim.tscn
git commit -m "feat: add Game Deck scores and challenges"
```

### Task 5: Deck Lifecycle, Live Viewport, and Shell

**Files:**
- Create: `game/proto3d/games/game_deck.gd`
- Create: `game/proto3d/games/game_shell.gd`
- Test: `game/proto3d/tests/game_shell_sim.gd`
- Test: `game/proto3d/tests/game_shell_sim.tscn`

**Interfaces:**
- Produces: `ProtoGameDeck.create(main := null)`, `launch(game_id, context)`, `start(seed, seats)`, `stop(reason)`, `set_shell_open(open)`, `texture() -> Texture2D`, `serialize()`, `restore(data)`.
- Produces: `ProtoGameShell.create(deck)`, `open_library(platform := "")`, `open_game(game_id)`, `show_view(view_id)`, `close_to_device()`, `power_off()`.

- [ ] **Step 1: Write the failing shell lifecycle sim**

Launch WASTE HEAP through the registry, verify the cartridge is inside one `SubViewport` with `UPDATE_ALWAYS`, verify the physical texture reference and fullscreen `TextureRect` texture are identical, send a real key input through the router, open HELP and confirm live bindings plus lore/source sections, pause through Esc/Start, ensure raw pad B closes menu state but reaches active play, close fullscreen without stopping the cartridge, then power off and verify cleanup.

- [ ] **Step 2: Run and verify missing deck/shell classes fail**

- [ ] **Step 3: Implement the deck state machine**

Allowed states are `OFF`, `LIBRARY`, `READY`, `PLAYING`, `PAUSED`, `SPECTATING`, and `ERROR`. All transitions happen through deck methods. The deck owns a 30 Hz accumulator and calls `apply_inputs()` with one snapshot per assigned seat. `launch()` catches missing scene/load errors and enters `ERROR` with `CARTRIDGE CORRUPT` text.

- [ ] **Step 4: Implement the heavy-bezel shell**

Create the UI in GDScript using project fonts and the UI language colors. The top bar contains title/power/close; tabs are LIBRARY, PLAY, HELP, CONTROLS, ABOUT, SCORES. HELP resolves current bindings; ABOUT separates `IN THE WORLD` from `REAL SOURCE & LICENSE`; SCORES consumes the ledger. Menu pad focus must be explicit.

- [ ] **Step 5: Run the shell and WASTE HEAP sims serially**

Expected: both pass and `Engine.time_scale` is unchanged.

- [ ] **Step 6: Commit**

```powershell
git add -- game/proto3d/games/game_deck.gd game/proto3d/games/game_shell.gd game/proto3d/tests/game_shell_sim.gd game/proto3d/tests/game_shell_sim.tscn
git commit -m "feat: add the shared Game Deck shell"
```

### Task 6: CROWN OF ASH Battle-Chess Proof Cartridge

**Files:**
- Create: `game/proto3d/games/crown_of_ash/crown_of_ash.gd`
- Create: `game/proto3d/games/crown_of_ash/crown_of_ash.tscn`
- Modify: `game/proto3d/tests/game_registry_sim.gd`
- Test: `game/proto3d/tests/crown_of_ash_sim.gd`
- Test: `game/proto3d/tests/crown_of_ash_sim.tscn`

**Interfaces:**
- Produces: chess `legal_moves(from: Vector2i) -> Array`, `try_move(from, to, promotion := "queen") -> bool`, `position_key()`, `choose_ai_move(depth := 2) -> Dictionary`.
- Emits: `request_feedback("battle_capture", {attacker, defender, from, to})` after a legal capture, never before board state commits.

- [ ] **Step 1: Write the failing chess rules sim**

Cover initial 20 moves, blocked sliders, pawn double step, capture, en passant expiry, castling through-check rejection, promotion choice, king-in-check rejection, checkmate, stalemate, fifty-move counter, threefold position key, snapshot round-trip, and deterministic AI selection. Verify a capture emits one battle event and skipping the vignette cannot affect board state or clocks.

- [ ] **Step 2: Run and verify the missing scene failure**

- [ ] **Step 3: Implement complete deterministic chess rules**

Represent the board as 64 signed piece integers and track side, castling rights, en-passant square, halfmove clock, fullmove number, and repetition keys. Generate pseudo-legal moves per piece, simulate each, and retain only moves that do not leave the moving king attacked. Adjudicate checkmate/stalemate/fifty-move/threefold/insufficient material.

- [ ] **Step 4: Add deterministic material-plus-mobility AI**

Use seeded tie-breaking and depth-2 alpha-beta. Evaluation values are pawn 100, knight 320, bishop 330, rook 500, queen 900 plus legal-mobility delta. AI must never use wall-clock time or unseeded randomness.

- [ ] **Step 5: Add a 16:9 board and original battle vignette**

Use original faction silhouettes built from Godot primitives. The vignette lasts at most 1.2 seconds, may be skipped, and is presentation-only. No source chess art is imported.

- [ ] **Step 6: Run the focused chess and shell sims**

Update `game_registry_sim.gd` to assert `reg.enabled("waste_heap") and reg.enabled("crown_of_ash")`, then run the registry, chess, and shell sims. Expected: both proof cartridges are enabled, all chess rules pass, and the generic shell path passes.

- [ ] **Step 7: Commit**

```powershell
git add -- game/proto3d/games/crown_of_ash game/proto3d/tests/crown_of_ash_sim.gd game/proto3d/tests/crown_of_ash_sim.tscn game/proto3d/tests/game_registry_sim.gd
git commit -m "feat: add CROWN OF ASH battle chess"
```

### Task 7: Generic Current-Session Arcade Networking

**Files:**
- Create: `game/proto3d/games/game_net.gd`
- Modify: `game/proto3d/net.gd`
- Test: `game/proto3d/tests/game_net_sim.gd`
- Test: `game/proto3d/tests/game_net_sim.tscn`

**Interfaces:**
- Produces: signals `invite_received`, `peer_joined_game`, `input_received`, `event_received`, `snapshot_received`, `result_received`.
- Produces: `invite(peer_id, offer)`, `accept(peer_id, session_id)`, `send_input(tick, snapshot)`, `send_event(event)`, `send_snapshot(state)`, `send_result(result)`.

- [ ] **Step 1: Write the failing offline/authority sim**

Verify offline calls fail without mutation, invite/result payloads reject unknown game ids and duplicate event/result ids, only host snapshots a real-time session, and turn-based CROWN OF ASH moves use reliable events while WASTE HEAP challenges use reliable seed/result messages.

- [ ] **Step 2: Run and verify missing bridge failure**

- [ ] **Step 3: Implement the generic RPC envelope**

The bridge uses one reliable `arcade_event` RPC and one unreliable-ordered `arcade_input` RPC with `{session_id, game_id, tick/event_id, kind, payload}`. Validate sender membership and game id before emitting locally. Do not add an RPC per cartridge.

- [ ] **Step 4: Add the bridge to `ProtoNet.create()`**

Expose `var arcade: ProtoArcadeNet` and create/add it as a child so peers share a stable node path. `leave()` clears its session state. Do not alter player/vehicle replication behavior.

- [ ] **Step 5: Run existing `net_loopback.sh` and the new sim serially**

Expected: existing co-op loopback remains green and generic validation checks pass.

- [ ] **Step 6: Commit**

```powershell
git add -- game/proto3d/games/game_net.gd game/proto3d/net.gd game/proto3d/tests/game_net_sim.gd game/proto3d/tests/game_net_sim.tscn
git commit -m "feat: add generic Game Deck networking"
```

### Task 8: Physical Devices, Host Save, Manuals, and License Proof

**Files:**
- Create: `game/proto3d/games/game_console.gd`
- Create: `game/proto3d/games/game_handheld.gd`
- Modify: `game/proto3d/proto3d.gd`
- Modify: `game/data/books.json`
- Create: `game/THIRD_PARTY_NOTICES.md`
- Create: `game/third_party/licenses/godot-demo-projects-mit.txt`
- Create: `game/third_party/licenses/3-bit-games-mit.txt`
- Create: `game/third_party/licenses/bashball-mit.txt`
- Create: `game/third_party/licenses/cars-on-road-mit.txt`
- Create: `game/third_party/licenses/flying-turtles-mit.txt`
- Create: `game/third_party/licenses/wrathskeller-mit.txt`
- Create: `game/third_party/licenses/tanks-of-freedom-mit.txt`
- Create: `game/third_party/licenses/opensoldat-mit.txt`
- Create: `game/third_party/licenses/opensoldat-base-cc-by-4.0.txt`
- Create: `game/third_party/licenses/freeinfantry-reference-note.txt`
- Test: `game/proto3d/tests/game_device_sim.gd`
- Test: `game/proto3d/tests/game_device_sim.tscn`
- Test: `game/proto3d/tests/game_save_sim.gd`
- Test: `game/proto3d/tests/game_save_sim.tscn`
- Test: `game/proto3d/tests/game_license_sim.gd`
- Test: `game/proto3d/tests/game_license_sim.tscn`

**Interfaces:**
- Produces: `ProtoGameConsole.create(deck)`, `set_live(texture)`, `set_off()`, `interact(main)`.
- Produces: `ProtoGameHandheld.create(deck, device_id)`, `open(context)`, `close(reason)`, `set_live(texture)`.
- Host exposes: `game_deck`, `game_shell`, and `game_deck` save key.

- [ ] **Step 1: Write failing device, save, and license sims**

Device sim verifies the console and handheld consume the exact deck texture, opening locks player input without pausing time, active world damage still applies, and losing the device closes with no ranked result. Save sim verifies `game_deck` round-trips without changing unrelated save keys and old saves default safely. License sim verifies every source row has a local license/notice file and that excluded Twemoji, Tanks audio, and Infantry client/zone patterns are absent.

- [ ] **Step 2: Run and capture the three expected failures**

- [ ] **Step 3: Implement procedural physical devices**

Build meshes/materials from Godot primitives, including a 16:9 console screen and all declared handheld orientations. `set_live()` duplicates a material and assigns the viewport texture; `set_off()` restores amber idle. The device never owns cartridge logic.

- [ ] **Step 4: Integrate one deck into `ProtoMain` surgically**

Construct registry/ledger/deck/shell in `_build_environment()`, add the safehouse proof console beside the existing TV, route shell ownership before gameplay actions, include shell open state in `player.input_locked`, and add `"game_deck": game_deck.serialize()` / `game_deck.restore(data.get("game_deck", {}))`. Do not overwrite or stage unrelated current edits in `proto3d.gd`.

- [ ] **Step 5: Add proof manuals and notices**

Add WASTE HEAP and CROWN OF ASH pages to the designated books. ABOUT shows the exact source URL, license, modification statement, and link to the local notice. Add verbatim license texts for permissive sources and a factual non-license reference note for FreeInfantry; source rows distinguish `notice_path` from `license_path`. `game/THIRD_PARTY_NOTICES.md` names only material actually used in this slice, while future-source files are clearly labeled as pre-integration provenance records rather than shipped-use claims.

- [ ] **Step 6: Run new sims plus regression sims serially**

Run `game_device_sim`, `game_save_sim`, `game_license_sim`, `input_map_sim`, `media_registry_sim`, `tv_sim`, and `save_sim` one at a time.

Expected: every new proof passes and the existing TV/save/input behavior remains green.

- [ ] **Step 7: Commit only Game Deck changes**

Inspect `git diff -- proto3d.gd` and stage it only after confirming both prior user changes and the additive Game Deck hunk are preserved.

```powershell
git add -- game/proto3d/games/game_console.gd game/proto3d/games/game_handheld.gd game/proto3d/proto3d.gd game/data/books.json game/THIRD_PARTY_NOTICES.md game/third_party/licenses game/proto3d/tests/game_device_sim.gd game/proto3d/tests/game_device_sim.tscn game/proto3d/tests/game_save_sim.gd game/proto3d/tests/game_save_sim.tscn game/proto3d/tests/game_license_sim.gd game/proto3d/tests/game_license_sim.tscn
git commit -m "feat: wire the Game Deck into the world"
```

### Task 9: Phase 1.0 Completion Audit

**Files:**
- Modify: `docs/superpowers/plans/2026-07-10-game-deck-phase-1-0.md` (checkboxes only)
- Create: `docs/verification/GAME_DECK_PHASE_1_0.md`

**Interfaces:**
- Produces authoritative evidence mapping every Phase 1.0 requirement to source files and command output.

- [ ] **Step 1: Run `git diff --check` and inspect staged scope**

Expected: no whitespace errors and no unrelated file staged.

- [ ] **Step 2: Run all Phase 1.0 sims serially**

Run the registry, input, ledger, WASTE HEAP, CROWN OF ASH, shell, network, device, save, and license sims, followed by the listed regressions. Record command, exit code, and pass summary.

- [ ] **Step 3: Inspect the physical result in Godot**

Launch `res://proto3d/proto3d.tscn`, walk to the safehouse console, open WASTE HEAP, play a merge with keyboard and pad, inspect HELP/ABOUT/SCORES, return to the physical set, launch CROWN OF ASH, perform a capture, and power off. Record observed behavior and any deviations.

- [ ] **Step 4: Write the evidence report**

The report must explicitly classify every Phase 1.0 acceptance item as proven, contradicted, or missing. Do not call the slice complete with a missing or indirect proof.

- [ ] **Step 5: Commit verification evidence**

```powershell
git add -- docs/superpowers/plans/2026-07-10-game-deck-phase-1-0.md docs/verification/GAME_DECK_PHASE_1_0.md
git commit -m "test: verify Game Deck phase 1.0"
```

---

## Follow-on Plan Boundaries

After this plan is proven, write and execute separate plans for:

1. Phase 1.1 — the remaining nine handheld cartridges, passenger use, art, and handheld guide.
2. Phase 1.2 — the remaining nine console cartridges, AI/local/online modes, art, and console guide.
3. Phase 1.3 — acquisition, loot, house/session/challenge boards, venues, schedules, brackets, and SPECTACLES mirroring.
4. Phase 2 — the shared shooter kernel, RUST RUNNERS, BLACK GRID, clean-room audit, and flagship multiplayer proof.

These are sequencing boundaries only. They do not reduce the committed 22-game scope.
