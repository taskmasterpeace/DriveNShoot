# DRIVN Game Deck — Playable In-World Games Design

**Status:** Owner-approved direction, expanded 2026-07-10
**Scope:** Phase 1 ships twenty games (ten handheld, ten multiplayer console). Phase 2 adds two flagship multiplayer shooters inspired by Soldat and Infantry Online.
**Host:** Godot 4.5+, GDScript 2.0, `res:// == game/`
**Branch:** `codex/specticles-games`

## 1. Overview

DRIVN gets a single data-driven in-world video-game platform rather than twenty-two one-off integrations. The player can sit at a recovered 16:9 home console, carry a handheld with a 1:1, 9:16, or 16:9 screen, play while riding as a passenger, invite nearby co-op characters to a local match, challenge connected peers at distant terminals, compare deterministic runs, and watch venue tournaments on physical screens. Every game launches through the same shell, reads the same rebindable actions, writes scores through the same ledger, exposes the same HELP / CONTROLS / ABOUT surfaces, renders into the same `SubViewport` pipeline, and persists through the same save block.

Phase 1 is the complete twenty-game catalog. Its internal delivery slices begin with the shared runtime and two proof cartridges, then land all ten handheld games, all ten console games, world placement, artwork, manuals, leaderboards, and multiplayer. Those slices are sequencing, not a reduction of Phase 1.

Phase 2 adds the “golden goose” pair:

- **RUST RUNNERS**, a close mechanical adaptation of Soldat: side-view momentum, jet-assisted movement, weapon pickups, grenades, fast lethality, bots, deathmatch, team deathmatch, and capture-the-flag.
- **BLACK GRID**, a clean-room mechanical adaptation of Infantry Online: isometric momentum, projectile and shrapnel physics, real-time fog of war, loadouts/classes, deployables, vehicles, zone rules, Skirmish, Frontlines, CTF, and Bug Hunt.

They use one shared shooter action map and network contract while presenting different camera, movement, fiction, maps, art, and tactical rhythm.

## 2. Player Fantasy

The safehouse is dark except for a scavenged console throwing amber light across the wall. The player slots a scratched cartridge marked **CROWN OF ASH**, and the television becomes a war board where faction pieces physically execute captures. A partner standing beside the set joins from another pad. A friend across the state signs in from a terminal at a roadhouse and takes the opposite army. Their names, match record, and scrip-free bragging rights survive the session.

Later, riding shotgun while another player drives I-95, the character raises a battered handheld and plays **DEAD GROUND** without pausing the road, weather, hunger clock, or danger outside the window. At a settlement, an old score terminal proves somebody named KESSLER cleared the same seed faster. At a drive-in tournament, the big screen mirrors **RUST RUNNERS** while spectators, announcer barks, brackets, and the existing SPECTACLES calendar turn a minigame into a place and an event.

The emotional targets are:

- **Belonging:** preserved games make settlements feel inhabited rather than utilitarian.
- **Mastery:** short, legible games produce scores worth improving and comparing.
- **Downtime with consequence:** the world clock continues; playing is a choice about safety and time.
- **Spectacle:** matches are visible on physical sets and venue screens, not trapped in an abstract menu.
- **Discovery:** cartridges, manuals, high-score rumors, and regional cabinets are world loot.

## 3. Design Laws

### 3.1 One wire, twenty-two cartridges

No cartridge may call `ProtoMain`, `ProtoNet`, the save file, the HUD, or physical device nodes directly. It implements the cartridge contract and communicates through the shell. A new game becomes a row plus a cartridge scene/script; integration code does not change.

Every game must receive, through the same runtime:

1. launch and shutdown;
2. pause/resume;
3. player-seat assignment;
4. normalized actions;
5. HELP, CONTROLS, ABOUT, and SCOREBOARD;
6. score/result submission;
7. local and network session context;
8. deterministic seed where applicable;
9. physical-screen render target;
10. save-backed settings and records.

`game_registry_sim` and `game_catalog_sim` enforce this. A special-case main-scene branch for an individual game is a failing design.

### 3.2 Diegetic first

The game exists on a physical device before it exists as a fullscreen overlay. A live `SubViewportTexture` drives both the 3D screen mesh and the enlarged heavy-bezel view, following the shipped television pipeline. Closing fullscreen may return to spectator/couch view when a match is still live; powering off ends the cartridge.

### 3.3 The world does not pause

Opening a game never changes `Engine.time_scale`. Weather, hunger, raids, traffic, and multiplayer continue at 1:1. The character is input-locked but remains a vulnerable world body. Death, forced vehicle exit, device destruction, or terminal power loss ends the local session safely and records a disconnect rather than a result.

Handheld play is allowed:

- on foot while stationary;
- in a safehouse or camp;
- as a passenger of a co-op player, crew motorist, or NPC motorist;
- in a parked vehicle.

It is refused while driving, swimming, dragging, piloting a drone, in a cinematic, or while another full-attention panel owns input.

### 3.4 Multiplayer has two in-world meanings

- **LOCAL:** participating network characters must be within the console row’s `local_radius_m` of the same physical terminal. Extra pads on one machine may join as unranked guest seats, but a ranked character result belongs only to an actual nearby DRIVN player profile.
- **ONLINE:** any peer already connected to the same DRIVN ENet session may accept from another powered terminal. This satisfies “logged on somewhere else” without inventing an external account service in Phase 1.

Public matchmaking and cross-session global leaderboards are represented by a provider interface, but no external service is required or simulated as complete in Phase 1.

### 3.5 Controls are shared, visible, and rebindable

All games use semantic actions, never raw keys in cartridge logic. Phase 1 adds an `ARCADE` group to `data/input_bindings.json`:

| Semantic action | Keyboard/mouse default | Pad default |
|---|---|---|
| move / navigate | WASD / arrows | left stick / D-pad |
| aim / cursor | mouse | right stick |
| primary | LMB / Enter | RT or A/✕ by game row |
| secondary | RMB / Space | LT or X/□ |
| mobility | Space | A/✕ |
| reload / undo | R | X/□ |
| interact / confirm | E / Enter | Y/△ or A/✕ |
| weapon previous | Q / wheel down | LB/L1 |
| weapon next | Backquote / wheel up | RB/R1 |
| pause | Esc | Start |
| help | F1 | Back/Select |

The input router preserves `InputEvent.device`, assigns one hardware device per seat, and converts raw events into semantic snapshots. Keyboard/mouse is seat zero. Each connected joypad is a separate eligible seat. Turn-based games may share seat zero; real-time local games require distinct devices after the first keyboard/mouse seat.

Every title screen and pause screen contains a HELP item. HELP shows the game’s current semantic actions resolved through `ProtoInputMap.pretty()`, so rebindings and Xbox/PlayStation notation cannot drift from reality.

### 3.6 No purple

Shell chrome follows `docs/design/UI_DESIGN_LANGUAGE.md`: ink, bone, amber, warm red for danger/close, and restrained teal only for uncanny AI-era effects. Individual cartridge playfields may use broader readable palettes, but no UI chrome, title treatment, hover state, team color, or generated artwork uses purple/violet/magenta.

## 4. Architecture

### 4.1 Components

| Component | Responsibility | Depends on |
|---|---|---|
| `ProtoGameRegistry` | Loads and validates game/device/source rows; resolves cartridge scenes | JSON and `PackedScene` only |
| `ProtoGameDeck` | Owns the active device, cartridge, seats, seed, session, result, and lifecycle | registry, shell, input, score, net bridge |
| `ProtoGameShell` | Heavy-bezel UI: LIBRARY / PLAY / HELP / CONTROLS / ABOUT / SCORES; three-way close | registry rows, deck callbacks |
| `ProtoGameCartridge` | Base contract implemented by every game | semantic inputs and session context only |
| `ProtoArcadeInputRouter` | Maps hardware devices to seats and produces normalized action snapshots | `ProtoInputMap`, raw events |
| `ProtoArcadeNet` | Adds generic arcade invitation, join, input, event, snapshot, and result RPCs to `ProtoNet` | existing ENet peer only |
| `ProtoScoreLedger` | Validates and records runs, personal bests, local boards, peer results, seeded challenges | save-backed records, game rows |
| `ProtoGameConsole` | 16:9 world interactable and screen mesh | deck render texture |
| `ProtoGameHandheld` | 1:1 / 9:16 / 16:9 item, hand prop, and screen mesh | deck render texture |
| `ProtoGameSpectator` | Mirrors a live match to TVs, drive-ins, tote boards, or venue screens | deck render texture, SPECTACLES |

### 4.2 Cartridge contract

Every cartridge exposes the same interface:

```gdscript
signal score_changed(score: Dictionary)
signal match_finished(result: Dictionary)
signal request_feedback(kind: String, payload: Dictionary)

func configure(game_row: Dictionary, context: Dictionary) -> void
func start_match(seed_value: int, seats: Array) -> void
func apply_inputs(tick: int, snapshots: Array) -> void
func apply_event(event: Dictionary) -> void
func snapshot() -> Dictionary
func restore_snapshot(state: Dictionary) -> void
func pause_match(paused: bool) -> void
func stop_match(reason: String) -> void
```

The base class owns match state, tick, seed, active seats, and result idempotency. A cartridge owns only its rules and presentation.

### 4.3 Data rows

`data/games.json` contains one row per game:

```json
{
  "id": "waste_heap",
  "phase": 1,
  "platform": "handheld",
  "title": "WASTE HEAP",
  "aspect": "1:1",
  "players": {"min": 1, "max": 1, "ai": false, "local": false, "online": "challenge"},
  "cartridge_scene": "res://proto3d/games/waste_heap/waste_heap.tscn",
  "score": {"primary": "score", "direction": "high", "secondary": "highest_part"},
  "controls_profile": "puzzle_grid",
  "manual_book_id": "book_game_deck_handheld",
  "source_ids": ["littlejs_arcade"],
  "requires_power": true,
  "power_draw": 1,
  "network_cost": 0,
  "unlock_type": "starter"
}
```

`data/game_sources.json` is the auditable rights ledger. Each row carries canonical URL, revision/tag, code license, asset license, included paths, excluded paths, copyright notice, required attribution, and local license-text path.

`data/game_devices.json` defines device shell, screen aspect, screen resolution, local radius, power draw, supported cartridge platforms, and physical model parameters.

`data/game_leaderboards.json` defines lore-authored NPC records and tournament boards. NPC values are clearly fictional seed rows; they never masquerade as global human scores.

### 4.4 Render and input flow

```text
world interactable or handheld USE
  -> ProtoGameDeck validates context and opens ProtoGameShell
  -> registry instantiates cartridge inside an always-live SubViewport
  -> SubViewportTexture feeds fullscreen bezel + physical screen + spectators
  -> input router assigns seats and emits one semantic snapshot per game tick
  -> cartridge updates deterministic state and emits scores/results
  -> ledger validates once, persists once, and refreshes every scoreboard surface
```

The shell is inserted into `ProtoMain._unhandled_input`’s explicit panel-priority chain. While open, it owns hardware after the return briefing, title menu, and controls capture, and before ordinary gameplay. From library, help, about, scores, and paused-menu states it closes by visible ✕, raw Esc, raw pad B, and the shared interact action when appropriate. During an active playfield, gameplay actions win: Esc/Start opens the pause shell, and pad B remains available to the cartridge for crouch/stance or another declared action. This prevents the project-wide close convention from stealing a game control.

## 5. Phase 1 Catalog — Twenty Games

### 5.1 Handheld catalog

| ID | In-world title | Permissive source | Aspect | Primary record | Lore treatment |
|---|---|---|---|---|---|
| `waste_heap` | WASTE HEAP | LittleJS 2048 | 1:1 | score, highest part | combine salvage into a working reactor core |
| `radworm` | RADWORM | LittleJS Snake | 1:1 | length, survival | Continuity routing worm consuming lost packets |
| `dead_ground` | DEAD GROUND | LittleJS Minesweeper | 1:1 | clear time, errors | mark buried ordnance before scavengers enter |
| `pack_rat` | PACK RAT | LittleJS Sokoban | 1:1 | levels, moves, time | load supply crates into evacuation bays |
| `bunker_breaker` | BUNKER BREAKER | LittleJS Brickout | 9:16 | score, layers | breach progressively armored shelters |
| `last_mile` | LAST MILE | LittleJS MicroRacer | 16:9 | lap/course time | pre-collapse highway-driver training cartridge |
| `iron_dome` | IRON DOME | LittleJS Missile Defense | 9:16 | score, cities saved | Black Week civil-defense simulator |
| `fall_line` | FALL LINE | LittleJS Moon Lander | 9:16 | landing rating, fuel | recover supply capsules in poisoned terrain |
| `tilt_salvage` | TILT//SALVAGE | LittleJS Pinball | 9:16 | score, jackpots | roadhouse machine rebuilt from dashboard parts |
| `relay_bloom` | RELAY BLOOM | LittleJS Match Three | 1:1 | score, max combo | align components to repair radio relays |

Every handheld title supports solo play and deterministic asynchronous challenges. A player may send a seed and target score to another connected peer; the recipient plays independently and the ledger compares results. This is how a single-player cartridge becomes social without pretending it is simultaneous multiplayer.

### 5.2 Multiplayer console catalog

All Phase 1 console titles are rendered at 16:9 and support solo versus AI where the source mode permits it, nearby-character local play, and same-session online play.

| ID | In-world title | Permissive source | Players | Core tournament fantasy |
|---|---|---|---|---|
| `crown_of_ash` | CROWN OF ASH | LittleJS Chess | 1–2 | battle-chess captures with animated faction executions |
| `dial_tanks` | DIAL TANKS | LittleJS Tank Combat | 1–4 | ricochet tank arenas and Carousel targeting trials |
| `red_sky` | RED SKY | 3-Bit Ready Aim Fire | 1–4 | turn-based artillery brackets |
| `black_orbit` | BLACK ORBIT | 3-Bit Blastroids | 1–4 | orbital-salvage claim battles |
| `gridbreach` | GRIDBREACH | Godot Multiplayer Bomber | 1–4 | timed sabotage-maze rounds |
| `rustball` | RUSTBALL | Bashball | 1–4 | wasteland physics-sport leagues |
| `fuel_run` | FUEL RUN | Cars on the Road | 1–4 | thirty-second jerry-can capture matches |
| `skyjoust` | SKYJOUST | Flying Turtles | 1–2 | rocket-rig aerial duels |
| `fight_night_99` | FIGHT NIGHT ’99 | Wrathskeller | 1–2 | character select, practice, brackets, fight nights |
| `ashland_command` | ASHLAND COMMAND | Tanks of Freedom | 1–2 | hot-seat tactical campaigns and ranked scenarios |

`CROWN OF ASH` is the showcase cartridge. Captures briefly cut to an authored combat vignette using miniature 2D/2.5D faction pieces; outcome is still pure chess and never random. Animation may be skipped, speeds up after repetition, and never delays online clocks unfairly.

## 6. Phase 2 — The Golden Goose Pair

### 6.1 Shared shooter controls

Both games use the exact same physical layout and semantic profile:

| Action | Keyboard/mouse | Pad |
|---|---|---|
| move | WASD | left stick |
| aim | mouse | right stick |
| fire | LMB | RT/R2 |
| alternate fire / grenade | RMB / G | LT/L2 |
| mobility | Space | A/✕ |
| crouch / stance | Ctrl | B/○ |
| reload | R | X/□ |
| interact / objective | E | Y/△ |
| previous / next weapon | Q / Backquote or wheel | LB/L1 / RB/R1 |
| scoreboard | Tab | D-pad up |
| pause/help | Esc / F1 | Start / Back |

`mobility` means jet-assisted jump in RUST RUNNERS and combat dive/boost in BLACK GRID. The button, timing vocabulary, prompts, and help position remain identical.

### 6.2 RUST RUNNERS — Soldat-like side-view arena

**Theme:** a Crimson Road bootleg tournament cartridge that glorifies speed, blood, and impossible infantry movement. Rusted refineries, bridge trusses, truck graveyards, and ruined stadium gantries replace Soldat’s names and maps.

**Near-replica fidelity target:** the moment-to-moment loop should be recognizable to an experienced Soldat player without copying protected names, branding, or map layouts.

Required mechanics:

- left/right acceleration, air control, crouch, prone, backflip/roll, jet fuel, fall damage;
- mouse/right-stick independent aim and full-angle fire;
- primary and secondary weapon slots, pickups, reloads, thrown grenades, weapon drop;
- fast projectile/hitscan weapons, recoil, spread, knockback, gore toggle, ragdoll-like deaths;
- spawn protection, respawn timer, health and vest pickups;
- Deathmatch, Team Deathmatch, Capture the Flag, and Pointmatch-style score mode;
- eight human/bot seats in a match, with smaller two-to-four-player local layouts;
- bots capable of traversal, pickups, target selection, objective play, and retreat;
- match browser inside the DRIVN shell limited to the current ENet session.

### 6.3 BLACK GRID — Infantry-like isometric field war

**Theme:** a Continuity-era command simulator preserved in military terminals. Its interface is cold green tactical glass; the simulation teaches citizens to defend infrastructure while quietly revealing how the AI learned to divide the country.

**Clean-room fidelity target:** reproduce documented and observed player-facing rules without copying the proprietary Infantry client, art, sound, zone files, names, or maps.

Required mechanics:

- isometric/top-down free movement with inertia, encumbrance, and class-dependent acceleration;
- independent mouse/right-stick aim, projectile travel, explosive shrapnel, ricochets, blast falloff;
- darkness/occlusion-aware real-time fog of war and radar contacts;
- loadout weight, ammo economy, armor/energy, weapon heat/reload, deployables;
- infantry classes plus light vehicles with distinct momentum and weapon mounts;
- Skirmish, Frontlines/KOTH, Capture the Flag, cooperative Bug Hunt, and a compact Fleet-inspired vehicle zone;
- team spawn networks, forward positions, objective capture, base defense, and round-end voting;
- sixteen network seats, bots filling empty seats, and map scales tuned for DRIVN sessions rather than hundreds of concurrent users;
- original zones built from data rows so new rule sets do not require engine changes.

The “nearly 1:1” promise applies to controls, responsiveness, tactical verbs, modes, physics relationships, and match rhythm. It does not authorize copying trademarks, proprietary client code, original maps, character silhouettes, sounds, or textual content.

## 7. Scores, Challenges, and Leaderboards

### 7.1 Normalized result shape

Every completed run emits:

```json
{
  "result_id": "uuid-like-session-id",
  "game_id": "radworm",
  "ruleset": "stock",
  "seed": 12345,
  "players": [{"profile_id": "local", "peer_id": 1, "name": "RIDER"}],
  "primary": 1840,
  "secondary": {"length": 42, "duration_ms": 91120},
  "outcome": "complete",
  "ranked": true,
  "source": "solo",
  "ended_at_game_day": 12,
  "ended_at_game_hour": 19.4
}
```

The game row declares whether higher or lower primary values win, allowed ranges, required secondary fields, and whether a disconnect can produce a ranked result. The ledger is idempotent on `result_id`.

### 7.2 Boards

- **PERSONAL:** local bests and recent runs from the save.
- **HOUSE:** lore NPC scores from data plus local player results.
- **SESSION:** current ENet peers, host-authoritative for multiplayer matches.
- **CHALLENGE:** same game, ruleset, and seed; compares asynchronous results.
- **GLOBAL:** provider slot shown as unavailable/offline until a real service exists.

Phase 1 never fabricates internet users. Fictional NPC entries are labeled as local house records.

### 7.3 Save block

The one-file save adds:

```text
game_deck = {
  unlocked: [game_id],
  personal_bests: {game_id: result},
  recent_results: [result, ... capped],
  challenges: [challenge, ... capped],
  settings: {game_id: dictionary},
  seen_help: [game_id],
  tournament_records: {game_id: dictionary}
}
```

Active real-time matches are not serialized across a full game quit. Turn-based online matches may snapshot only inside the live ENet session. Closing a cartridge records settings and completed results, never half a score as a personal best.

## 8. World Integration

### 8.1 Devices and acquisition

- The safehouse receives one 16:9 console beside the existing TV and one starter handheld in the supply chest.
- Console cartridges are item rows and may be found in houses, electronics stores, military sites, drive-ins, and venue prizes.
- Handheld titles are firmware cartridges/items; starter rows unlock a small set, with the remainder discoverable.
- A cartridge shelf near the TV opens the game library but does not bypass physical ownership.
- The handheld appears as a puppet hand prop while used; its physical screen uses the same live texture as the enlarged view.

### 8.2 Spectacles and tournaments

Game tournaments reuse `docs/design/SPECTACLES.md`:

- calendar rows schedule console nights at drive-ins, roadhouses, and dedicated game halls;
- the active match texture mirrors to the venue screen and tote board;
- bracket, entrants, score, spectators, announcer barks, and prizes are visible;
- entering a tournament uses the normal cartridge runtime, not a second tournament-specific game path;
- betting is deferred to the SPECTACLES betting engine and is not embedded in cartridge logic.

### 8.3 Power and internet

Rows include `requires_power`, `power_draw`, and `network_cost` from day one. Phase 1 surfaces those values and refuses a physically unpowered device if a host power system reports it off. Until DRIVN has a real household electricity economy, the safehouse device is powered and no fake fee is deducted.

Online games show connection state and a `network_cost` field, default zero. A later provider may charge scrip/data/time, but Phase 1 does not invent an economy that cannot yet be felt elsewhere.

## 9. Strategy Guides and About Screens

Every game has two documentation layers:

1. **Immediate HELP:** controls, objective, scoring, win/lose conditions, and one strategy hint. It is generated from the game row plus concise cartridge-specific copy.
2. **THE LIBRARY:** collectible in-world guides:
   - `book_game_deck_handheld` — ten chapters, one per handheld title;
   - `book_game_deck_console` — ten chapters, one per Phase 1 console title;
   - `book_rust_runners` — movement, weapons, modes, and tournament tactics;
   - `book_black_grid` — classes, momentum, fog, objectives, vehicles, and zone tactics.

ABOUT has two visually separated sections:

- **IN THE WORLD:** fictional studio, year, preservation story, regional reputation, and lore connection.
- **REAL SOURCE & LICENSE:** actual project, author/copyright, source URL, license, modification note, and full notice access.

Fiction never replaces or obscures real attribution.

## 10. Artwork and Audio

### 10.1 Cohesive original art

Phase 1 creates:

- one console shell and three handheld shell orientations;
- one title card, cartridge label, icon, and attract screen per game;
- original DRIVN sprites/tiles/effects sufficient for every game;
- venue posters and bracket graphics for console tournaments;
- no purple assets.

Procedural primitives and shaders handle grids, particles, lines, explosions, and fallback art. Image generation is used for original title cards, cartridge labels, posters, backgrounds, and sprite references after the design gate. Generated assets are edited to the project palette and verified in-engine.

### 10.2 Imported art rule

Imported art is allowed only when `game_sources.json` names the exact file/path and a permissive or attribution-only license. Unknown provenance means exclude and recreate.

Tanks of Freedom code and graphical assets are MIT, but its CC-BY-SA audio is excluded. OpenSoldat’s CC-BY 4.0 base content is legally usable with attribution, but RUST RUNNERS defaults to original art and audio to keep its theme distinct. Infantry client/zone art is never imported.

Audio routes through `ProtoAudio`; cartridges do not create unmanaged audio buses. Each game receives a small original SFX palette plus optional music rows, with master arcade volume controlled by the shell.

## 11. License and Provenance Contract

The Godot build includes `game/THIRD_PARTY_NOTICES.md` plus one verbatim local license text per imported source under `game/third_party/licenses/`, so ABOUT can open notices through `res://`. Each source row records what was used and what was excluded.

| Source | Code | Content | Decision |
|---|---|---|---|
| LittleJS Arcade | MIT | MIT except optional Twemoji CC-BY 4.0 | adapt selected rules; exclude Twemoji and use DRIVN fonts |
| Godot demo projects | MIT | MIT under repository terms | adapt multiplayer bomber/network patterns |
| 3-Bit Games | MIT | repository MIT | adapt Ready Aim Fire and Blastroids mechanics |
| Bashball | MIT | repository MIT | adapt physics-sport mechanics; verify every imported asset path |
| Cars on the Road | MIT | repository MIT | adapt fuel-capture rules; prefer original DRIVN art |
| Flying Turtles | MIT | repository MIT | adapt aerial-duel rules; prefer original DRIVN art |
| Wrathskeller | MIT | repository MIT | adapt fighter/tournament architecture; original characters/art |
| Tanks of Freedom | MIT | graphics MIT; audio CC-BY-SA 4.0 | code/eligible graphics only; exclude audio |
| OpenSoldat | MIT | base content CC-BY 4.0 | adapt mechanics/code with notices; original RUST RUNNERS presentation |
| FreeInfantry / Infantry Online | server repository lacks a clear permissive root license; known emulator distributed as GPLv3; original client/assets proprietary | proprietary/unclear | clean-room player-facing mechanic reference only; copy no code/assets/maps/text |

This is an engineering provenance policy, not a substitute for final shipping counsel. Any conflict or missing notice blocks that source from the build; it does not silently broaden permission.

## 12. Error Handling and Edge Cases

- Missing or malformed game row: omit it from the library and log a validation error; boot continues.
- Missing cartridge scene: show `CARTRIDGE CORRUPT` with source id; never crash the main game.
- Missing art: use a generated ink/amber primitive fallback and flag the source audit.
- Missing optional license file: cartridge is disabled by registry validation.
- Two panels request ownership: the existing explicit priority chain decides; no z-order guessing.
- Device destroyed or carried away mid-match: deck ends with `device_lost`; no ranked result.
- Player attacked: world damage still lands. Death closes the shell and records disconnect.
- Passenger exits moving vehicle: handheld session closes before seat transition.
- Host disconnects: real-time network match ends `host_lost`; no authority migration in Phase 1.
- Late joiner: may spectate a real-time match from the next snapshot but cannot enter a ranked round already underway.
- Packet loss: unreliable ordered inputs carry tick numbers; reliable events carry monotonic ids; stale/duplicate data is ignored.
- Local guest versus real peer: UI labels guests clearly; guest results do not attach to a DRIVN character profile.
- Controller unplug: pause local match, show reconnect/forfeit; network clock gets a bounded grace period.
- Save from older version: missing `game_deck` defaults to starter unlocks and empty records.
- Cartridge update changes scoring: increment `ruleset`; old records remain visible under their original ruleset and never compare across versions.
- Tied score: row-defined secondary metric breaks ties; exact ties share rank.
- Tiny viewport: shell clamps to viewport minus the UI-language safety margin.

## 13. Tuning Knobs

| Knob | Default | Safe range | Purpose |
|---|---:|---:|---|
| console local radius | 4 m | 2–8 m | how close characters must stand for local play |
| shell design resolution | 1280×720 | fixed | console and fullscreen baseline |
| handheld square resolution | 640×640 | fixed | 1:1 baseline |
| handheld portrait resolution | 540×960 | fixed | 9:16 baseline |
| input simulation tick | 30 Hz | 20–60 Hz | deterministic cartridge input cadence |
| real-time net input rate | 20 Hz | 15–30 Hz | bandwidth versus responsiveness |
| snapshot correction rate | 5 Hz | 2–10 Hz | drift correction for host-authoritative games |
| recent results cap | 50/game | 20–200 | save growth |
| challenge lifetime | 7 game days | 1–30 | relevance of asynchronous challenges |
| controller reconnect grace | 15 s | 5–30 s | local fairness |
| network reconnect grace | 10 s | 3–20 s | ranked match fairness |
| battle-chess vignette | 1.2 s | 0–2.5 s | spectacle versus pace |
| RUST RUNNERS seats | 8 | 2–12 | readable arena population |
| BLACK GRID seats | 16 | 4–24 | tactical population within ENet budget |

Game-specific physics and balance live in game/ruleset rows, never in the shell.

## 14. Delivery Phases

### Phase 1.0 — Shared substrate and two proof cartridges

- registry, rows, shell, console, handheld, input router, score ledger, save block, source ledger;
- `WASTE HEAP` proves handheld/aspect/score/challenge;
- `CROWN OF ASH` proves console/local/online/AI/spectator/battle vignette;
- sims prove the same contract before catalog multiplication.

### Phase 1.1 — Ten handheld games

- all ten cartridge implementations;
- all aspect ratios, deterministic challenge seeds, help, score rules;
- passenger use and physical handheld prop/screen;
- handheld guide and artwork.

### Phase 1.2 — Ten console games

- all ten cartridge implementations;
- AI, local seat assignment, current-session online modes;
- battle-chess centerpiece;
- console guide and artwork.

### Phase 1.3 — World and spectacle pass

- item/unlock rows, safehouse placement, loot acquisition, shelf;
- house/session/challenge leaderboards;
- venue mirroring, calendar tournaments, posters, bracket screens, announcer hooks;
- final Phase 1 licensing audit and twenty-game gameplay proof.

### Phase 2.0 — Shared flagship shooter kernel

- common shooter actions, weapons schema, projectile/blast model, teams, objectives, bots, session browser;
- RUST RUNNERS side-view locomotion and BLACK GRID isometric locomotion remain separate modules.

### Phase 2.1 — RUST RUNNERS

- full fidelity set from section 6.2;
- original maps/art/audio/lore;
- local, online, bots, tournament integration, manual.

### Phase 2.2 — BLACK GRID

- full fidelity set from section 6.3;
- clean-room implementation and original zones/art/audio/lore;
- local, online, bots, vehicles, tournament integration, manual.

## 15. Verification and Acceptance Criteria

### 15.1 Shared substrate sims

- `game_registry_sim`: exactly twenty Phase 1 rows (ten handheld, ten console) and two Phase 2 rows; unique ids; allowed aspects; valid source, help, controls, score, scene, and manual references.
- `game_shell_sim`: every installed row launches through the same deck; physical and fullscreen views share one live texture; visible ✕, raw Esc, raw pad B, and interact close paths work from shell/menu states; active-play pad B reaches the cartridge; focus is pad-legal.
- `game_input_sim`: keyboard/mouse and two distinct gamepads produce correct semantic seat snapshots; rebind changes HELP text; unplug grace works.
- `game_save_sim`: unlocks, settings, personal bests, challenges, tournament records, and versioned rulesets round-trip without clobbering other save keys.
- `game_license_sim`: every source has local notice text; every imported asset is declared; excluded Twemoji, Tanks audio, and Infantry client/zone assets are absent.

### 15.2 Game catalog proof

- `game_catalog_sim` iterates every Phase 1 cartridge: instantiate, start with deterministic seed, deliver real input events, observe rule-state change, pause/resume, force a valid completion, submit exactly one result, stop cleanly.
- Each of the twenty games also has a focused rules sim for its scoring and one distinctive mechanic.
- All ten handheld titles render correctly at their declared aspect and remain playable with keyboard/mouse and pad.
- All ten console titles render at 16:9, run solo/AI, assign at least two local seats, and accept a same-session online context.

### 15.3 World integration proof

- `game_device_sim`: walk to the real safehouse console and interact; use a real handheld item from the pack; both lock/unlock player input correctly and leave world time at 1.0.
- `game_passenger_sim`: enter a passenger seat by the real path, open a handheld, play while the vehicle moves, and close safely on exit/damage.
- `game_local_mp_sim`: a remote character outside radius cannot join local; after walking into radius the invite succeeds and both seats control the same match.
- `game_online_mp_sim` plus two-process loopback: peers at separate terminals in one ENet session join, exchange turn-based and real-time inputs, see the same result, and write it once.
- `game_spectacle_sim`: scheduled tournament starts the ordinary cartridge runtime and mirrors its texture/result to the venue screen and tote board.

### 15.4 Golden goose proof

- `game_shooter_controls_sim`: RUST RUNNERS and BLACK GRID resolve every shooter semantic action to the same displayed keyboard/mouse/pad binding.
- `rust_runners_sim`: proves jet fuel, stance transitions, independent aim/fire, pickup/reload/grenade, objective scoring, respawn, bot objective behavior, and network snapshot convergence.
- `black_grid_sim`: proves inertia/encumbrance, independent aim, projectile/shrapnel/ricochet, fog-of-war exclusion, loadout/class difference, deployable, vehicle, objective capture, bot defense, and network convergence.
- `game_cleanroom_sim`: source ledger declares no Infantry client/zone source; asset scan finds no original Infantry filenames, hashes, names, maps, sounds, or text.

### 15.5 Hands-on acceptance

1. A new player can find, launch, understand, play, pause, and exit any cartridge without leaving the game or consulting external documentation.
2. Controller-only and keyboard/mouse-only players can complete all twenty Phase 1 games.
3. A passenger can spend road time on a handheld while another character drives.
4. A nearby co-op character can join a console match because their character is physically at the terminal.
5. A distant same-session character can join online from another powered terminal.
6. Every game exposes real attribution and an in-world preservation story.
7. Every completed game produces a coherent score/result and at least a personal comparison; supported games produce house, session, or challenge boards.
8. CROWN OF ASH reads as battle chess, not a flat board widget.
9. RUST RUNNERS feels recognizably Soldat-like while looking and sounding like DRIVN.
10. BLACK GRID feels recognizably Infantry-like while using wholly original client code, maps, names, art, sound, and prose.
11. Missing optional media or a corrupt cartridge never prevents DRIVN from launching.
12. The full suite remains green, with sims run serially to avoid shared `user://` races.

## 16. Source References

- LittleJS Arcade: https://github.com/KilledByAPixel/LittleJSArcade
- Godot demo projects: https://github.com/godotengine/godot-demo-projects
- 3-Bit Games: https://github.com/AndyStubbs/3-bit-games
- Bashball: https://github.com/viraelin/bashball
- Cars on the Road: https://github.com/vanitskiy18/godot-cars-on-the-road
- Flying Turtles: https://github.com/KunkelAlexander/flying-turtles
- Wrathskeller: https://github.com/Apexal/wrathskeller
- Tanks of Freedom: https://github.com/w84death/Tanks-of-Freedom
- OpenSoldat code: https://github.com/Soldat/soldat
- OpenSoldat base content: https://github.com/opensoldat/base
- FreeInfantry player-facing reference: https://freeinfantry.com/
- FreeInfantry server repository: https://github.com/InfantryOnline/Infantry-Online-Server

---

This design contains no deferred design choices. Public cross-session services, household electricity economics, and SPECTACLES betting are explicit later integrations with stable seams; they are not required for Phase 1 or misrepresented as shipped.
