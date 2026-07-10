# Game Deck Player Lobby Design

Date: 2026-07-10

Status: approved interaction direction; written contract awaiting final review

## Goal

Turn the Game Deck's tested-but-hidden session machinery into a complete
player-facing lobby for every console cartridge. The lobby must visibly expose
these exact actions:

- SOLO
- LOCAL GAME
- ONLINE GAME
- INVITE PLAYER
- JOIN MATCH
- SPECTATE
- FILL EMPTY SEATS WITH BOTS

The implementation must remain generic. A cartridge receives seats, a fixed
seed, bot policy, and ordinary Game Deck context; it never receives a custom
RPC, lobby screen, or peer-discovery branch.

## Chosen approach

Create a focused `ProtoGameLobby` component inside the existing Game Deck
shell. The shell continues to own the bezel, library, cartridge viewport,
HELP, CONTROLS, ABOUT, and SCORES. The lobby owns only match configuration and
roster presentation. `ProtoGameSessionBroker` remains the policy boundary for
power, ownership, proximity, membership, invitations, joining, and launch
contexts. `ProtoArcadeNet` remains the only transport seam.

Two alternatives were rejected:

1. Adding all lobby behavior directly to `game_shell.gd` would be quicker but
   would couple UI, terminal policy, transport, and cartridge launch inside an
   already large file.
2. Making each action a separate physical world terminal would be immersive
   but would make ordinary inviting, joining, and spectating slow and obscure.

## Player experience

### Entry

Interacting with a powered console still opens the owned console library.
Selecting a cartridge opens its MATCH lobby instead of auto-starting it. The
handheld flow is unchanged and continues to start its single-player cartridge
directly.

The MATCH lobby shows:

- cartridge title and maximum declared players;
- selected mode: SOLO, LOCAL GAME, or ONLINE GAME;
- human, bot, invited, joined, and spectator roster rows;
- terminal power and DRIVN network-session status;
- the bot-fill toggle;
- incoming invitation cards;
- a status/explanation line for disabled actions; and
- START MATCH and LEAVE LOBBY.

The seven required action labels are visible text, not icon-only controls.
Keyboard and controller focus order follows their visible order.

### SOLO

SOLO creates one local human seat and launches without network membership.
When FILL EMPTY SEATS WITH BOTS is enabled, the lobby fills the cartridge to
its declared maximum. When disabled, the cartridge receives only the local
seat and creates the minimum AI opposition required by its existing rules.

### LOCAL GAME

LOCAL GAME lists connected DRIVN player bodies that are physically within the
selected cartridge's terminal radius. Phase 1 console games use four meters;
RUST RUNNERS and BLACK GRID use five meters. A body outside that radius cannot
be invited or joined, even if its peer is connected.

INVITE PLAYER sends an invitation to the selected nearby peer. Proximity is
validated when the invitation is created and again when it is accepted. A
player who walks away before accepting receives an explicit stale-proximity
message. Each accepted player controls a distinct seat from their own input
device; seats never share hardware state.

### ONLINE GAME

ONLINE GAME requires an active DRIVN host/join session. It lists connected
session peers regardless of their world distance. INVITE PLAYER sends the
selected peer a reliable lobby invitation containing the game, ruleset,
session, host, seed, capacity, bot-fill policy, and invitation identifier.

Invitations expire 30 seconds after the host creates them. Joining as a player
requires:

- a powered receiving terminal;
- membership in the same live DRIVN session;
- an enabled and installed cartridge row;
- ownership of the selected cartridge;
- an unexpired invitation;
- a matching host session and ruleset; and
- an available human seat.

The match does not create a second network stack. Fast cartridge input uses
the existing ordered input channel; lobby messages, starts, snapshots, and
results use the existing reliable ArcadeNet seam.

### JOIN MATCH

JOIN MATCH consumes the selected valid invitation as a player. The client
registers the lobby session locally, acknowledges the host, and becomes a
declared seat. The host roster changes from INVITED to JOINED. The same
invitation cannot be consumed twice.

START MATCH is enabled for the host after at least one valid human seat exists
and all declared remote human seats have joined. Starting produces one seed,
one ordered seat array, and one generic context. The host launches locally and
broadcasts the same launch envelope to joined players and spectators.

### SPECTATE

SPECTATE consumes the selected online invitation without allocating a player
seat. Spectators must be live session members at a powered console, but they do
not need to own the cartridge. They receive the same launch envelope, reliable
events, authoritative snapshots, and final result presentation.

A spectator's Game Deck remains in `SPECTATING`. It never assigns an input
device, never transmits cartridge input, never publishes authority snapshots,
and never submits a second local result. Closing the shell leaves the lobby
session cleanly; it does not alter the host match.

SPECTATE is disabled for LOCAL GAME and for invitations whose match has ended,
session has changed, or host is no longer present.

### FILL EMPTY SEATS WITH BOTS

The toggle is host-owned and defaults on for SOLO, off for LOCAL GAME, and on
for ONLINE GAME. The host may change it until START MATCH.

When enabled, every unused player slot becomes an AI actor up to the catalog
maximum:

- two-player games: 2 total participants;
- four-player games: 4 total participants;
- RUST RUNNERS: 8 total participants; and
- BLACK GRID: 16 total participants.

When disabled, the cartridge creates only accepted human seats plus any
minimum opponent its existing rules require. The lobby passes
`bots_enabled`, `actor_count`, and the declared seats through the ordinary
context. A shared cartridge helper calculates target participant count so all
twelve console games obey the same law.

Bots never become network members, never occupy a peer identifier, and never
appear as human leaderboard identities.

## UI architecture

### `ProtoGameLobby`

Create `game/proto3d/games/game_lobby.gd` as a focused `Control` owned by the
shell. It receives references to the deck and terminal broker and exposes:

```gdscript
signal launch_requested(request: Dictionary)
signal leave_requested()

func configure(game_id: String, base_context: Dictionary) -> void
func refresh() -> void
func select_mode(mode: String) -> bool
func select_peer(peer_id: int) -> bool
func set_bot_fill(enabled: bool) -> void
func press_action(action_id: String) -> bool
func snapshot_ui() -> Dictionary
```

`press_action` accepts only the seven required action identifiers plus
`start_match` and `leave_lobby`. `snapshot_ui` is a read-only accessibility and
test surface containing visible labels, enabled state, selected mode, roster,
pending invitations, bot policy, and status copy.

The lobby does not inspect `ProtoNet`, world bodies, inventory, or cartridge
scripts. It asks the broker for state and commands.

### Shell integration

The shell adds a MATCH tab and a lobby container to its existing view stack.
Console library buttons call `open_lobby(game_id, context)`. Handheld library
buttons retain `open_game`. The shell exposes `attach_terminal(console,
broker)` because it is constructed immediately before the physical console.

When the broker emits a launch request, the shell calls the existing
`open_game` path. PLAY, HELP, CONTROLS, ABOUT, SCORES, pause, close-to-device,
and power-off behavior remain unchanged.

### `ProtoGameSessionBroker`

Extend the broker into the single lobby-policy authority. It owns ephemeral
state only:

```gdscript
signal lobby_changed()
signal launch_ready(request: Dictionary)

func configure_lobby(game_id: String, mode: String, bot_fill: bool) -> bool
func lobby_snapshot() -> Dictionary
func eligible_peers(mode: String) -> Array
func invite_peer(peer_id: int) -> bool
func pending_invitations() -> Array
func join_invitation(invitation_id: String, as_spectator: bool) -> bool
func start_match() -> bool
func leave_lobby(reason: String) -> void
```

It connects once to `ProtoArcadeNet.invite_received`,
`peer_joined_game`, `event_received`, and the parent `ProtoNet` peer-left
signal when available. It stores no permanent save data.

### ArcadeNet lobby protocol

Keep the existing invite, accept, and session-event RPCs. Extend pre-session
invite/accept envelopes with generic `lobby_action` values:

- `offer`: initial invitation;
- `accept_player`: join with a seat;
- `accept_spectator`: join without a seat; and
- `cancel`: invalidate the invitation or lobby.

After acceptance establishes common membership, authoritative `start` and
`leave` messages use the existing validated reliable session-event channel.

Every envelope includes a unique `invitation_id` or `event_id`. Duplicate and
stale identifiers are rejected. Add generic member mutation methods:

```gdscript
func add_member(peer_id: int) -> bool
func remove_member(peer_id: int) -> bool
func accept_lobby(peer_id: int, response: Dictionary) -> bool
```

No message contains cartridge-specific fields. The reliable start event
contains a generic context dictionary, fixed seed, ordered seats, spectator
peer list, game ID, ruleset, and bot policy.

## Participant-count law

Add a helper to `ProtoGameCartridge`:

```gdscript
func target_participant_count(minimum: int, maximum: int,
        human_count: int = seats.size()) -> int
```

It returns `maximum` when `context.bots_enabled` is true and otherwise clamps
the human count to the cartridge's required minimum and maximum. All twelve
console cartridges use this helper rather than independently interpreting bot
fill. RUST RUNNERS and BLACK GRID keep their existing AI logic but take their
actor count from the helper.

## State and authority

- Lobby state is ephemeral and is never written to the DRIVN save.
- The host chooses seed, seats, bot fill, and start time.
- Only the host advances authoritative online cartridge simulation.
- Clients send only their declared seat's semantic input.
- Spectators send no cartridge input.
- Host snapshots include bots, objectives, vehicles, fog, and mode state.
- Match results retain existing result-ID idempotency.
- Leaving DRIVN clears lobby and ArcadeNet membership.
- World time and simulation continue while any lobby or match screen is open.

## Validation and player-facing errors

Every disabled action has visible copy. Required cases are:

- `CONSOLE HAS NO POWER`
- `CARTRIDGE NOT OWNED`
- `NO DRIVN NETWORK SESSION`
- `NO PLAYER IN TERMINAL RANGE`
- `PLAYER LEFT TERMINAL RANGE`
- `PLAYER IS NOT IN THIS SESSION`
- `MATCH IS FULL`
- `INVITATION EXPIRED`
- `INVITATION ALREADY USED`
- `HOST LEFT THE SESSION`
- `RULESET DOES NOT MATCH`
- `MATCH ALREADY STARTED`
- `NO LIVE MATCH TO SPECTATE`

An invalid action returns `false`, changes only the status copy, and does not
charge currency, mutate ownership, start a cartridge, or alter time scale.

## Visual language

Use the existing ink, bone, amber, rust, and signal-teal Game Deck palette. No
purple. Mode buttons use pill-style active states; roster cards distinguish
HOST, LOCAL, INVITED, JOINED, BOT, and SPECTATOR with text as well as color.
Disabled buttons remain readable and show their reason below the roster.

The layout must remain usable at the existing 1280x720 console render target
and the shell's 720x600 minimum. Every clickable control receives keyboard and
controller focus, hover/pressed feedback, and a minimum readable font size of
16 pixels.

## Testing contract

### Focused lobby simulation

Create `game_lobby_sim.gd/.tscn` and drive real `Button.pressed` signals. It
must prove all seven exact labels exist and each produces the declared state
transition. It must also prove disabled explanations, focus order, bot toggle,
leave behavior, and that console selection opens MATCH instead of PLAY.

### Policy simulation

Extend local and online multiplayer sims to prove:

- proximity is checked at offer and acceptance;
- wrong-session, unpowered, non-member, locked, full, duplicate, expired, and
  departed-peer paths reject without state mutation;
- player acceptance consumes one seat;
- spectator acceptance consumes no seat and bypasses ownership only;
- bot fill targets 2, 4, 8, and 16 correctly across all twelve console rows;
- incoming invitations and host roster changes reach the visible lobby; and
- leaving clears pending invitations and memberships.

### Real transport simulation

Add a two-process lobby loopback. A host opens ONLINE GAME, invites a client,
the client uses JOIN MATCH, both launch the same game/seed/seats, semantic input
converges, and one result records. A second pass has the client choose SPECTATE;
the spectator receives the live snapshot, sends no input, and records no
duplicate result.

### Regression and GPU gates

Run all twelve console focused suites, both catalog suites, Game Deck shell,
device, local, online, network, passenger, save, spectacle, world, input,
license, and inherited DRIVN network/save gates serially.

Render and inspect at least these 1793x1009 Compatibility frames:

1. SOLO with bot fill enabled;
2. LOCAL GAME with a nearby eligible peer;
3. ONLINE GAME with invited and joined roster rows;
4. incoming JOIN MATCH and SPECTATE actions; and
5. a live spectator view with input controls suppressed.

The temporary capture harness is removed after acceptance.

## Completion gate

The feature is complete only when all seven labels are visible and usable from
the real console shell, every validation path is proven, bot fill works across
all twelve console games, player and spectator real-process handshakes pass,
GPU frames are accepted, the complete regression set is green, and the
worktree contains no temporary harness or unrelated changes.
