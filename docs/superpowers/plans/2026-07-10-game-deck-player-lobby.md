# Game Deck Player Lobby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose SOLO, LOCAL GAME, ONLINE GAME, INVITE PLAYER, JOIN MATCH,
SPECTATE, and FILL EMPTY SEATS WITH BOTS as a complete player-facing Game Deck
lobby for all twelve console cartridges.

**Architecture:** Add one focused `ProtoGameLobby` Control to the existing
shell, extend `ProtoGameSessionBroker` as the ephemeral policy/state authority,
and extend the generic `ProtoArcadeNet` invite/accept seam for lobby handshakes.
Cartridges remain unaware of peers and consume only a fixed seed, ordered seats,
`bots_enabled`, and `actor_count` through the existing context.

**Tech Stack:** Godot 4.5.1, statically typed GDScript 2.0, ENet RPC through
`ProtoArcadeNet`, JSON catalog rows, headless simulation scenes, Compatibility
renderer for visual acceptance.

## Global Constraints

- `res://` is `game/`; never use `res://game/`.
- Fixed cartridge simulation remains 30 Hz and never changes `Engine.time_scale`.
- No per-cartridge RPC or raw hardware input outside `ProtoArcadeInputRouter`.
- Every action has visible text, controller/keyboard focus, and disabled reason.
- Player joins require ownership; spectating requires a powered terminal but no ownership.
- Invitations and lobbies are ephemeral and never enter the save file.
- Bot fill targets the catalog maximum: 2, 4, 8, or 16.
- No purple; use the Game Deck ink/bone/amber/rust/signal-teal palette.
- Every production behavior begins with a focused failing sim.
- Run Godot scenes serially because tests share `user://`.

---

### Task 1: Universal participant and bot-fill law

**Files:**

- Create: `game/proto3d/tests/game_bot_fill_sim.gd`
- Create: `game/proto3d/tests/game_bot_fill_sim.tscn`
- Modify: `game/proto3d/games/game_cartridge.gd`
- Modify: all twelve console cartridge scripts under `game/proto3d/games/`
- Test: twelve focused console sims plus `console_catalog_sim.gd`

**Interfaces:**

- Produces: `ProtoGameCartridge.target_participant_count(minimum, maximum, human_count) -> int`
- Produces: `ProtoGameCartridge.participant_total: int`
- Consumes: `context.actor_count`, `context.bots_enabled`, `game_row.players.max`

- [x] **Step 1: Write the failing all-cartridge bot-fill simulation**

Create a table of all twelve console IDs and their expected maxima. Launch each
with one human and `{ "bots_enabled": true, "actor_count": maximum }`, then
assert the base contract reports the maximum. Launch again with bot fill off
and an explicit minimum count, then assert only the rules-required count.

```gdscript
const EXPECTED := {
    "crown_of_ash": 2, "dial_tanks": 4, "red_sky": 4,
    "black_orbit": 4, "gridbreach": 4, "rustball": 4,
    "fuel_run": 4, "skyjoust": 2, "fight_night_99": 2,
    "ashland_command": 2, "rust_runners": 8, "black_grid": 16,
}

for game_id in EXPECTED:
    var cartridge := _launch(game_id, true, int(EXPECTED[game_id]))
    _check("%s fills every empty seat" % game_id,
        int(cartridge.participant_total) == int(EXPECTED[game_id]))
```

- [x] **Step 2: Run RED and verify the missing contract is the failure**

```powershell
& $godot --headless --path game res://proto3d/tests/game_bot_fill_sim.tscn
```

Expected: parse/runtime failure because `participant_total` and
`target_participant_count` do not exist.

- [x] **Step 3: Add the shared helper to the base cartridge**

```gdscript
var participant_total := 0

func target_participant_count(minimum: int, maximum: int,
        human_count: int = seats.size()) -> int:
    var requested := int(context.get("actor_count", -1))
    if requested >= 0:
        participant_total = clampi(requested, minimum, maximum)
    elif bool(context.get("bots_enabled", false)):
        participant_total = maximum
    else:
        participant_total = clampi(human_count, minimum, maximum)
    return participant_total
```

Reset `participant_total` in `start_match` before the cartridge-specific call.

- [x] **Step 4: Fold every console cartridge through the helper**

Replace local participant-count calculations with the shared helper. Examples:

```gdscript
# Four-player arena cartridge
var count := target_participant_count(2, 4, new_seats.size())

# RUST RUNNERS
var actor_count := target_participant_count(2, 8, new_seats.size())

# BLACK GRID
var actor_count := target_participant_count(2, 16, new_seats.size())

# Fixed two-side games still register the contract
target_participant_count(2, 2, new_seats.size())
```

Keep each cartridge's existing `index >= new_seats.size()` AI law. Do not add a
second bot implementation.

- [x] **Step 5: Run GREEN and the focused console regression block**

Run `game_bot_fill_sim`, `crown_of_ash_sim`, `dial_tanks_sim`, `red_sky_sim`,
`black_orbit_sim`, `gridbreach_sim`, `rustball_sim`, `fuel_run_sim`,
`skyjoust_sim`, `fight_night_99_sim`, `ashland_command_sim`,
`rust_runners_sim`, `black_grid_sim`, and `console_catalog_sim` serially.
Expected: every named scene exits 0; bot-fill sim reports 24 or more passes and
zero failures.

- [x] **Step 6: Commit the participant law**

```powershell
git add game/proto3d/games game/proto3d/tests/game_bot_fill_sim.*
git commit -m "feat: add universal Game Deck bot fill"
```

---

### Task 2: Ephemeral lobby policy and local invitations

**Files:**

- Create: `game/proto3d/tests/game_lobby_policy_sim.gd`
- Create: `game/proto3d/tests/game_lobby_policy_sim.tscn`
- Modify: `game/proto3d/games/game_session_broker.gd`
- Modify: `game/proto3d/games/game_console.gd`
- Modify: `game/proto3d/tests/game_local_mp_sim.gd`

**Interfaces:**

- Produces: broker signals `lobby_changed`, `launch_ready(request)`
- Produces: `configure_lobby`, `lobby_snapshot`, `eligible_peers`,
  `invite_peer`, `pending_invitations`, `join_invitation`, `start_match`,
  `leave_lobby`
- Consumes: console power, `deck.registry`, `deck.ledger`, `main.remote_players`

- [x] **Step 1: Write failing policy assertions for SOLO and LOCAL GAME**

Use the real main scene and real `CharacterBody3D` peer bodies. Assert:

```gdscript
_check("SOLO configures one human seat",
    broker.configure_lobby("dial_tanks", "solo", true)
    and broker.lobby_snapshot()["seats"].size() == 1)
_check("LOCAL GAME rejects a body outside four meters",
    broker.eligible_peers("local").is_empty())
_check("walking into range exposes the peer",
    broker.eligible_peers("local").any(func(row: Dictionary) -> bool:
        return int(row["peer_id"]) == 2))
_check("acceptance revalidates distance",
    not broker.join_invitation(String(offer["invitation_id"]), false))
```

Also prove unpowered console, unknown game, handheld game, locked cartridge,
duplicate invite, full match, leave, and `Engine.time_scale` invariants.

- [x] **Step 2: Run RED**

Expected: failure because the broker has no lobby state API.

- [x] **Step 3: Add typed lobby state and snapshots**

Add signals and state:

```gdscript
signal lobby_changed()
signal launch_ready(request: Dictionary)

var lobby: Dictionary = {}
var invitations: Dictionary = {}
var used_invitation_ids: Dictionary = {}
var status_text := ""
```

`configure_lobby` creates one host seat, records the catalog maximum, assigns a
stable seed, and sets defaults: SOLO bot fill on, LOCAL off, ONLINE on.
`lobby_snapshot` returns a deep copy containing game, mode, host, seats,
spectators, roster, pending invites, bot policy, capacity, and status.

- [x] **Step 4: Add candidate discovery and revalidation**

`eligible_peers("local")` reads `console.main.remote_players`, filters valid
bodies by declared radius, and returns stable peer/name/distance rows.
`invite_peer` creates `lobby:<session>:<counter>` IDs and never duplicates a
pending peer. Local acceptance checks the body and range again before adding a
seat.

Invalid operations set one exact status string and mutate nothing else.

- [x] **Step 5: Route existing console compatibility methods through lobby policy**

Retain `local_offer` and `start_local_offer` as compatibility wrappers so
existing callers and tests remain valid, but have them build/consume the same
validated lobby state. Add `game_console.attach_lobby` only if required; do not
duplicate policy in the console.

- [x] **Step 6: Run GREEN**

Run `game_lobby_policy_sim` and `game_local_mp_sim`. Expected: zero failures;
the original two-seat real-input proof remains green.

- [x] **Step 7: Commit local lobby policy**

```powershell
git add game/proto3d/games/game_session_broker.gd game/proto3d/games/game_console.gd game/proto3d/tests/game_lobby_policy_sim.* game/proto3d/tests/game_local_mp_sim.gd
git commit -m "feat: add Game Deck lobby policy"
```

---

### Task 3: Player-facing MATCH lobby and all seven actions

**Files:**

- Create: `game/proto3d/games/game_lobby.gd`
- Create: `game/proto3d/tests/game_lobby_sim.gd`
- Create: `game/proto3d/tests/game_lobby_sim.tscn`
- Modify: `game/proto3d/games/game_shell.gd`
- Modify: `game/proto3d/games/game_console.gd`
- Modify: `game/proto3d/proto3d.gd`
- Modify: `game/proto3d/tests/game_shell_sim.gd`
- Modify: `game/proto3d/tests/game_device_sim.gd`

**Interfaces:**

- Produces: `ProtoGameLobby.configure`, `refresh`, `select_mode`, `select_peer`,
  `set_bot_fill`, `press_action`, `snapshot_ui`
- Produces: shell `attach_terminal(console, broker)` and `open_lobby(game_id, context)`
- Consumes: Task 2 broker API and `launch_ready`

- [x] **Step 1: Write the failing real-Button UI simulation**

Instantiate the real deck, shell, console, broker, and lobby. Open DIAL TANKS
from the real console library and assert the shell enters MATCH, not PLAY.
Find buttons by exact text and emit `pressed`:

```gdscript
const REQUIRED := ["SOLO", "LOCAL GAME", "ONLINE GAME", "INVITE PLAYER",
    "JOIN MATCH", "SPECTATE", "FILL EMPTY SEATS WITH BOTS"]

for label in REQUIRED:
    var button := _find_button(lobby, label)
    _check("%s is visible and focusable" % label,
        button != null and button.visible
        and button.focus_mode == Control.FOCUS_ALL)
```

`_find_button` is a test helper that walks the real Control tree by visible
text; do not add a test-only lookup method to production.

Press every action and assert its intended mode, status, invite, join,
spectator, or bot-toggle state. Assert hover/focus styles exist and the lobby
fits within 1280x720 and the shell's 720x600 minimum.

- [x] **Step 2: Run RED**

Expected: `game_lobby.gd` is missing and console selection still auto-starts.

- [x] **Step 3: Build the isolated lobby Control**

Construct a responsive `VBoxContainer` with:

- cartridge/capacity header;
- SOLO / LOCAL GAME / ONLINE GAME mode pills;
- roster and pending-invite scroll columns;
- INVITE PLAYER / JOIN MATCH / SPECTATE action row;
- FILL EMPTY SEATS WITH BOTS toggle;
- START MATCH / LEAVE LOBBY footer; and
- status reason label.

Use existing shell constants by value in the lobby file: ink `11100d`, card
`242019`, amber `f2b735`, bone `e8dfcf`, rust `c94f3d`, signal teal `2f8f83`.

Implement the exact public API from the design. `snapshot_ui` returns labels,
enabled states, selected mode/peer, roster, invitations, bot fill, and status.

- [x] **Step 4: Integrate MATCH into the shell**

Add MATCH to `_tabs`, add the lobby to the view stack, and update `_sync_views`.
Console library selection calls `open_lobby`; handheld selection keeps
`open_game`. `attach_terminal` connects broker launch-ready once.

```gdscript
func _on_lobby_launch(request: Dictionary) -> void:
    open_game(String(request["game_id"]), request["context"])
```

Venue-owned `open_game` calls remain direct and unchanged.

- [x] **Step 5: Wire the real main scene**

After `ProtoGameConsole.create` has created its broker, call:

```gdscript
game_shell.attach_terminal(game_console, game_console.session_broker)
```

Power loss closes the lobby, clears ephemeral broker state, and leaves the
console's existing dark-screen behavior intact.

- [x] **Step 6: Run GREEN and shell/device regressions**

Run `game_lobby_sim`, `game_shell_sim`, and `game_device_sim`. Expected: all
seven labels pass, console selection opens MATCH, handheld/venue play remains
direct, and no frame/time-scale regression occurs.

- [x] **Step 7: Commit the visible lobby**

```powershell
git add game/proto3d/games/game_lobby.gd game/proto3d/games/game_shell.gd game/proto3d/games/game_console.gd game/proto3d/proto3d.gd game/proto3d/tests/game_lobby_sim.* game/proto3d/tests/game_shell_sim.gd game/proto3d/tests/game_device_sim.gd
git commit -m "feat: surface Game Deck match lobby"
```

---

### Task 4: Online invite, join, and spectator handshake

**Files:**

- Modify: `game/proto3d/games/game_net.gd`
- Modify: `game/proto3d/games/game_session_broker.gd`
- Modify: `game/proto3d/games/game_deck.gd`
- Modify: `game/proto3d/tests/game_net_sim.gd`
- Modify: `game/proto3d/tests/game_online_mp_sim.gd`
- Extend: `game/proto3d/tests/game_lobby_policy_sim.gd`

**Interfaces:**

- Produces: ArcadeNet `add_member(peer_id)`, `remove_member(peer_id)`
- Extends: `invite`/`accept_lobby` envelopes with `lobby_action`
- Produces: pre-session actions `offer`, `accept_player`,
  `accept_spectator`, `cancel`; session events `lobby_start`, `lobby_leave`
- Consumes: Task 2 lobby state and Task 3 shell launch callback

- [ ] **Step 1: Write failing protocol tests**

Extend `game_net_sim` with exact envelope assertions:

```gdscript
_check("duplicate offer is rejected",
    bridge.ingest_reliable(2, offer) and not bridge.ingest_reliable(2, offer))
_check("host can add one accepted member",
    bridge.add_member(3) and not bridge.add_member(3))
_check("spectator is a member but not a seat",
    broker.join_invitation(invitation_id, true)
    and broker.lobby_snapshot()["spectators"].has(2)
    and not _seat_has_peer(broker.lobby_snapshot()["seats"], 2))
```

Prove player ownership is required, spectator ownership is bypassed, power is
required for both, stale/expired/used/wrong-session/full/host-left failures are
non-mutating, and SPECTATE is rejected for local invitations.

- [ ] **Step 2: Run RED**

Expected: missing member mutation and lobby-action validation failures.

- [ ] **Step 3: Extend the generic transport safely**

Add member mutation with positive IDs and duplicate rejection. Track seen
invitation IDs separately from event/result IDs. Add
`lobby_response_received(peer_id, response)` and
`accept_lobby(peer_id, response)`. Validate `lobby_action` and required
game/session/host fields before emitting `invite_received` or the new response
signal. Keep legacy offers without `lobby_action` accepted as `offer`, and keep
the existing three-argument `accept` behavior, for backward compatibility.

- [ ] **Step 4: Implement host/client broker transitions**

Host `configure_lobby("online")` creates or adopts a session. Client offer
reception adds a pending invitation. `join_invitation` validates locally,
begins/adopts the same ArcadeNet session, and sends `accept_player` or
`accept_spectator`. Host acceptance adds membership and updates roster.

`start_match` builds:

```gdscript
var context := {
    "source": "session", "device": "console", "online": true,
    "session_id": lobby["session_id"], "local_peer_id": host_peer,
    "bots_enabled": bool(lobby["bot_fill"]),
    "actor_count": int(lobby["capacity"]) if bool(lobby["bot_fill"])
        else maxi(2, (lobby["seats"] as Array).size()),
    "auto_start": true, "seed": int(lobby["seed"]),
    "seats": (lobby["seats"] as Array).duplicate(true),
}
```

Host launches and sends one reliable `lobby_start` session event. Joined
clients open PLAY. Spectators open PLAY content in deck `SPECTATING` state with
no local seat. Invitations older than 30,000 monotonic milliseconds are stale.

- [ ] **Step 5: Suppress spectator input and result writes**

Assert and preserve these existing deck laws:

- `feed_event` acts only in PLAYING;
- `_process` advances only PLAYING;
- network snapshots apply in SPECTATING;
- spectators never call `send_input` or `send_snapshot`; and
- remote result display cannot create a duplicate ledger row; and
- a spectator context never submits the observed result to its personal ledger.

Add an explicit regression if any branch is indirect.

- [ ] **Step 6: Run GREEN**

Run `game_net_sim`, `game_online_mp_sim`, `game_lobby_policy_sim`, and
`game_shell_sim`. Expected: all protocol, ownership, spectator, and legacy
assertions pass with zero failures.

- [ ] **Step 7: Commit the online handshake**

```powershell
git add game/proto3d/games/game_net.gd game/proto3d/games/game_session_broker.gd game/proto3d/games/game_deck.gd game/proto3d/tests/game_net_sim.gd game/proto3d/tests/game_online_mp_sim.gd game/proto3d/tests/game_lobby_policy_sim.gd
git commit -m "feat: add Game Deck join and spectate handshake"
```

---

### Task 5: Real transport, GPU acceptance, and completion audit

**Files:**

- Create: `game/proto3d/tests/game_lobby_online_host.gd/.tscn`
- Create: `game/proto3d/tests/game_lobby_online_client.gd/.tscn`
- Create: `tools/game_lobby_loopback.sh`
- Create: `docs/verification/GAME_DECK_LOBBY.md`
- Modify: this implementation plan checklist
- Temporary only: `game/proto3d/tests/_game_lobby_visual_audit.gd/.tscn`

**Interfaces:**

- Consumes: completed lobby, broker, ArcadeNet, deck, and cartridge contracts
- Produces: real-process proof and final verification record

- [ ] **Step 1: Write a two-process player-join loopback**

Host opens ONLINE GAME for DIAL TANKS, invites peer 2, and waits. Client
receives the visible pending invitation and invokes JOIN MATCH through the
lobby action. Host starts with bot fill, client sends a physical key event,
host applies semantic input, and client converges to the authoritative
snapshot. Duplicate result delivery leaves one signal and one ledger row.

- [ ] **Step 2: Add the spectator pass to the same loopback**

Run a second session. Client invokes SPECTATE. Prove:

- host membership includes the client;
- player seats exclude the client;
- client deck state is SPECTATING;
- host snapshot changes the client's live cartridge;
- client sends zero input packets; and
- final result creates no duplicate local submission.

The shell script runs join and spectator modes sequentially and requires host
and client `ALL CHECKS PASSED` lines for both.

- [ ] **Step 3: Run the real loopback RED then GREEN**

Before implementation wiring, the script must fail at the missing visible
invite/join transition. After wiring:

```bash
bash tools/game_lobby_loopback.sh
```

Expected: `GAME LOBBY LOOPBACK: ALL CHECKS PASSED`.

- [ ] **Step 4: GPU-render five acceptance frames**

Create a bounded temporary harness and render 1793x1009 Compatibility frames
on the available GPU:

1. SOLO plus enabled bot fill and max participant copy;
2. LOCAL GAME with a nearby eligible body and INVITE PLAYER enabled;
3. ONLINE GAME with INVITED and JOINED roster rows;
4. pending JOIN MATCH and SPECTATE actions; and
5. live SPECTATING view with input actions visibly suppressed.

Inspect every image with `view_image`, fix any clipping/contrast/focus defect,
rerender, and delete the temporary harness with `apply_patch`.

- [ ] **Step 5: Run the full serial regression**

Run, independently and serially:

- `game_bot_fill_sim`, `game_lobby_policy_sim`, `game_lobby_sim`;
- all twelve focused console game sims;
- `console_catalog_sim`, `game_catalog_sim`;
- shell, device, local, online, network, passenger, save, spectacle, world,
  input, registry, acquisition, ledger, and license sims;
- media registry, TV, main network, main save, data, NPC driving, and input map;
- existing console and flagship loopbacks; and
- the new lobby loopback.

Record exact scene/assertion counts and every expected cleanup-only engine line.

- [ ] **Step 6: Write the verification record and audit every requirement**

`GAME_DECK_LOBBY.md` must contain one evidence row for each of the seven named
actions, ownership/power/proximity/session/full/stale validations, every bot
ceiling, player and spectator real-process proof, GPU frames, regression counts,
contradictions, and missing items. The completion gate is zero contradictions
and zero missing items.

- [ ] **Step 7: Final diff, parse, and temporary-file checks**

Run `git diff --check`, `bash -n tools/game_lobby_loopback.sh`, Godot
`--check-only` on every new script, confirm no `_game_lobby_visual_audit` file,
and confirm the worktree contains only intended changes.

- [ ] **Step 8: Commit final verification**

```powershell
git add docs/verification/GAME_DECK_LOBBY.md docs/superpowers/plans/2026-07-10-game-deck-player-lobby.md game/proto3d/tests/game_lobby_online_* tools/game_lobby_loopback.sh
git commit -m "test: verify complete Game Deck lobby"
```
