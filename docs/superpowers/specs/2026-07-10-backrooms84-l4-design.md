# BACKROOMS '84 L4 Design

**Scope:** first playable ConsoleNet cartridge and its standalone Physics & Combat Lab cabinet.
**Parent contract:** `docs/design/PHYSICS_COMBAT_LAB.md` section 12. **Date:** 2026-07-10.

## Goal

Ship an original top-down maze duel that exists as a physical arcade cabinet in the lab and opens a
readable full-screen game panel. The player learns deterministic routes, sees only through a bounded
sight cone, hunts an enemy who is hidden behind walls, fires nonlethal projectiles, earns a local high
score, and can surface a lore-native ConsoleNet tournament invitation whose flow can be interrupted or
turn into a real lab ambush.

L4 proves the cartridge, cabinet, score/invitation contract, and trap seam. It does not place a Virginia
arcade in the campaign, spend campaign scrip, award campaign respect, or create an online leaderboard.

## Locked owner decisions

- The game is **BACKROOMS '84**, fictional bunker-training software turned bootleg ConsoleNet cartridge.
- Its silhouettes, maze, title treatment, rules, sounds, and presentation are original; no Atari names,
  maps, sprites, audio, or trade dress are copied.
- A player sees the opponent only when the opponent is in the current line-of-sight cone.
- Explored corridors remain as dim memory; unexplored cells remain black.
- Footsteps and shots reveal direction briefly, never an exact through-wall position.
- Maze seeds are deterministic so route knowledge is real skill.
- Solo AI and local two-player feed the same normalized command type.
- Matches are compact, nonlethal, repeatable, and save-isolated from `user://drivn.save`.
- Performance can produce a ConsoleNet tournament invitation with site, fee, purse, sponsor, seed,
  rules, and trap chance.

## Approaches considered

### 1. Full-screen overlay only

Fastest and most legible. It would feel like a developer menu, not an object in DRIVN, and would break
the rule that media and games exist at physical screens.

### 2. Play directly on a 3D cabinet screen

Most diegetic. The angled lab camera makes a small maze and fog-of-war unreadable, while viewport
textures, focus routing, and local two-player input add cost without improving the rules.

### 3. Physical cabinet plus dedicated overlay — selected

An emissive in-world cabinet provides location, prompt, attract copy, and state. Interacting opens a
crisp CRT-styled overlay driven by the same simulation. Closing the panel returns to the exact cabinet
position. This matches the existing TV/media pattern while keeping competitive information readable.

## Player flow

1. Walk to the **CONSOLENET / BACKROOMS '84** cabinet in the standalone lab.
2. Press `Q` or controller `X/□` within 4.5 m.
3. Choose **SOLO**, **LOCAL 2P**, or **SEED**. The default seed is reproduced on every reset.
4. Play first-to-five nonlethal tags. A tag freezes the board for 0.8 seconds, shows a card, then
   respawns both silhouettes in legal distant cells.
5. A completed match updates the dedicated BACKROOMS score file and may reveal an invitation card.
6. **DECLINE** returns to the cabinet. **ENTER EVENT** starts the invitation seed and rule card.
7. `Escape/B` abandons any cabinet or event match immediately. If the deterministic trap roll fires,
   the overlay closes first and then starts the existing two-in-cover nonlethal lab scenario.

The cabinet refuses to open while a Spectacle or authored scenario owns combat actors. The prompt says
to finish/reset the event or cycle `N` to FREE PLAY. It never silently clears another system's bodies.

## Controls and command parity

### Player 1

- Keyboard: `WASD` move, mouse aim, LMB fire, `R` reload, `Escape` leave.
- Pad: left stick move, right stick aim, RT fire, `X/□` reload, `B/○` leave.

### Player 2

- Keyboard: arrow keys move, `IJKL` aim, Right Ctrl fire, Right Shift reload.
- Second pad: the same stick/trigger/button layout as Player 1.

`ProtoArcadeCommand` contains only `move: Vector2`, `aim: Vector2`, `fire_pressed: bool`,
`reload_pressed: bool`, `leave_pressed: bool`, and `frame: int`. Keyboard, pad, local Player 2, replay,
and AI all produce this type. The simulation never reads `Input` directly.

## Data contract

Create `game/data/arcade_games.json`, version 1, with `backrooms_84`:

- identity/lore: `name`, `year`, `publisher`, `boot_copy`, `attract_copy`;
- match rules: `score_to_win: 5`, `tag_hold_s: 0.8`, `respawn_min_cells: 8`, `reload_s: 0.7`;
- weapon: `fire_mode: "single"`, `projectile_speed_cells_s: 14`, `projectile_life_s: 1.2`;
- visibility: `view_range_cells: 7`, `view_cone_deg: 100`, `memory_alpha: 0.28`;
- pings: `footstep_interval_cells: 2`, `footstep_ping_s: 0.45`, `shot_ping_s: 0.8`;
- AI: `decision_hz: 8`, `memory_s: 2.5`, `sound_investigate_s: 1.4`;
- three maze rows: id, width 19, height 13, deterministic seed, loop openings, two spawn cells;
- invitation: `score_threshold: 5`, site **Virginia ConsoleNet Hall**, fee 60, purse 300,
  `rules: "FIRST TO FIVE · NO LETHAL FEED"`, leaderboard seed, sponsor **THE SWITCHBOARD**,
  and trap chance 0.20.

Unknown additive fields are ignored. Missing or malformed required fields disable only the cabinet and
show `CARTRIDGE CHECK FAILED`; the rest of the lab continues to boot.

## Simulation architecture

### `ProtoArcadeCommand`

A small `RefCounted` value object used by human, AI, replay, and tests. It can duplicate itself without
sharing mutable input state.

### `ProtoBackrooms84`

A rendering-free fixed-step simulation. It owns:

- generated wall grid, floor cells, spawn cells, and deterministic RNG;
- two actor records with position, aim, reload, score, visible/explored cells, and sound memory;
- a bounded projectile pool of eight slots;
- match/card/respawn state and high-score result;
- `step(command_p1, command_p2, 1.0 / 60.0)` and a pure `facts(viewer_id)` snapshot.

Maze generation uses seeded recursive backtracking, then opens the row's bounded number of loop walls.
It retries at most four deterministic candidates if spawn path length is below eight cells, then loads
an authored fallback grid. Walls are authoritative for movement, projectiles, and visibility.

Visibility uses grid ray traversal from the actor cell to candidate cells inside the 100°/7-cell cone.
Visible cells replace the current set every step; explored cells are monotonic for the match. Enemy
facts omit exact position unless currently visible. A sound fact contains only a normalized direction,
kind, and remaining time.

### `ProtoBackroomsAI`

Produces `ProtoArcadeCommand` at the authored 8 Hz decision rate. It patrols deterministic junctions,
chases a currently visible target, investigates the latest sound direction, and searches the last seen
cell for 2.5 seconds. A bounded BFS pathfinder uses seeded neighbor ordering. It has no privileged read
of a hidden player position after sight memory expires.

### `ProtoArcadeScoreStore`

Reads/writes `user://backrooms84_scores.json`, never `user://drivn.save`. The file contains schema
version, best solo score differential, fastest first-to-five time, wins, and last unlocked invitation.
A malformed file is quarantined in memory and replaced on the next valid win. Writes use a temporary
file plus rename. Tests back up and restore this file.

### `ProtoArcadeTournament`

Consumes a completed match summary and the invitation row. It exposes `invitation_facts()`,
`accept(seed)`, `decline()`, `interrupt(reason)`, and `settle(summary)`. The trap roll is deterministic
from invitation seed plus match summary. It emits `trap_triggered(seed)` only after cabinet input has
been released; the lab consumes that signal by starting `cover_two` with the emitted seed.

## Presentation architecture

### Physical cabinet

`ProtoArcadeCabinet` builds a dark steel cabinet with amber trim, teal controls, an emissive attract
screen, a `Label3D` title, and a 4.5 m interaction marker. The cabinet surfaces `READY`, `IN MATCH`,
`INVITATION`, `CARTRIDGE CHECK FAILED`, or the local high score. It contains no simulation rules.

### Game panel

`ProtoBackroomsPanel` is a `CanvasLayer` above the lab HUD. A custom `Control` draws:

- black unexplored cells, dim olive explored memory, bone walls;
- teal Player 1, amber opponent/Player 2, bone projectiles;
- current sight cone, directional sound chevrons, reload bar, score, timer, seed, and round card;
- scanlines, subtle curvature frame, and amber/teal/bone typography—never purple.

The panel redraws from event/fixed-step facts; it does not create nodes per tile, projectile, or frame.
Opening it does not change `Engine.time_scale`. The lab suppresses body/fire/tool commands until the
panel releases ownership.

## Invitation and trap boundary

The invitation is a real result of the local game, not a campaign reward. It displays all authored
terms before acceptance. ENTER EVENT starts a deterministic tournament maze and keeps campaign scrip,
respect, crime, and saves untouched.

The trap is a seam proof, not a new enemy system. When triggered:

1. tournament state records `INTERRUPTED · SIGNAL HIJACK`;
2. the panel closes and returns lab input ownership;
3. the lab starts the existing `cover_two` scenario with the deterministic trap seed;
4. the player may fight, move away, reset, or cycle back to FREE PLAY.

Decline, manual abandon, and non-trap settlement never spawn combat actors.

## Error and reset behavior

- `Backspace/Start` inside the cartridge resets only the current maze match with the same seed.
- `Escape/B` leaves without changing score or invitation settlement.
- A disconnected/invalid second pad falls back to SOLO before the match starts, never mid-round.
- No legal distant spawn yields a visible `MAZE CHECK FAILED` card and uses the authored fallback.
- Projectile pool exhaustion rejects the shot; it never allocates a ninth projectile.
- Closing, trap interruption, reset, or lab exit clears commands and restores the exact prior input and
  time-scale state.
- Spectacle, scenario, and arcade ownership are mutually exclusive and fail visibly instead of clearing
  one another's actors.

## Testing and acceptance

### `arcade_maze_sim`

- same row/seed produces identical grid, loops, path length, spawns, and AI neighbor order;
- different seed changes the maze while remaining connected;
- walls block movement, projectile hits, and sight through the same grid law;
- explored memory persists, current visibility clears, hidden enemy facts omit position;
- footstep/shot facts reveal direction only and expire at authored times;
- human and AI commands traverse the same `step` path;
- projectile pool stays at eight, reload gates fire, first-to-five resets nonlethally;
- local score writes only the dedicated score file; campaign save timestamp is unchanged.

### `arcade_panel_sim`

- physical cabinet has prompt/title/status and enforces 4.5 m interaction;
- panel draws one maze without per-cell nodes and exposes live score/seed/reload/ping facts;
- keyboard/pad parity and local two-player command routing are exact;
- lab movement/fire/tool shortcuts are suppressed while open and restored on leave;
- opening/closing never changes time scale or leaves input latched.

### `tournament_trap_sim`

- threshold win creates one deterministic invitation with all authored terms;
- duplicate settlement cannot duplicate invitation, purse, or trap roll;
- decline and abandon release the cabinet without actors;
- accepted non-trap match settles visibly;
- forced deterministic trap closes the panel before starting `cover_two`;
- active Spectacle/scenario refuses cabinet ownership and remains intact;
- trap cleanup returns to FREE PLAY with no campaign save mutation.

### Hands-on acceptance

From `PHYSICS_LAB.bat`, the owner can walk to a visible cabinet, play a complete solo maze match with
fog-of-war and directional sound, replay the same seed to learn it, start local two-player with the
same rules, earn a visible ConsoleNet invitation, accept/decline/abandon it, and experience a
deterministic trap that cleanly hands control back to real nonlethal lab combat.

## Non-goals

- No copied arcade assets or emulated commercial ROM.
- No online networking or global leaderboard in L4.
- No campaign world placement, travel, scrip transfer, respect, title, radio, or TV reward yet.
- No lethal cabinet or tournament rules.
- No generic mini-game engine beyond the command, score, and invitation seams this cartridge proves.
