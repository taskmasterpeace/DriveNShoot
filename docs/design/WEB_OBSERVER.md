# WEB_OBSERVER — watch the game, drive it, replay it

**Status:** 2026-10-23. Built in `web/` on `feat/web-observer`. The observer page (`web/observe.html`), the session
recorder (`web/src/agent/recorder.js`), the observer feed in the agent bridge (`web/vite.config.js`,
`web/src/agent/bridge.js`), and 12 command rows (`web/src/agent/devtools.js`): `observe`, `person`, `mapBase`,
`mapTiles`, `heal`, `record`, `session`, `replay`, `look`, `snap`, `diff`, `watch`. Selftest checks in
`web/src/agent/devtools-selftest.js`.
**Owner of the call:** Robert ("dev tools that allow you to multiply your productivity and will allow me to control
things and observe players who play the game"). **Engine:** the three.js web engine (`web/`, see `web/AGENTS.md`).
**Sources:** `web/AGENTS.md` (the agent API and the bridge), `docs/design/WEB_WORLD_MEMORY.md` (deeds, witnesses, the
director, the chronicle), `docs/design/WEB_STREAMING.md` (chunks, the minimap tiles, stalls), `docs/design/WEB_ROLES.md`.

---

## 1. Overview

Two audiences, one game, one API.

| Who | Uses | Gets |
|---|---|---|
| **Robert, at a browser** | `http://localhost:<port>/observe.html` beside a game tab or the headless harness | a live map of everyone (faction colour, real flags), the event wire, a card for anyone he clicks (AI state, target, needs, memory of the player, inventory, a live camera), perf, factions, a census; buttons and modals that teleport, set time and weather, spawn, give, god mode, heal or kill, fire director events, pause and step; a replay of any recorded session with a scrubber and heatmaps |
| **An AI agent, in a shell or over MCP** | the same COMMANDS rows (`node tools/dl.mjs <cmd>`, `dl_<cmd>`) | the observer's data (`observe`, `person`), the recorder (`record`, `session`, `replay`), and three multipliers: `look`, `snap` + `diff`, `watch` |

| Part | File | Holds |
|---|---|---|
| **Page** | `web/observe.html`, `web/src/observer/{observer.js, map.js, observer.css}` | the map (2D canvas), the card, the wire, the dock (perf, factions, census, control log), the modals, replay |
| **Reads** | `web/src/agent/observe.js` | `feedSnapshot` (one frame: player card, every character and vehicle as a row, doors in view, perf, events since a cursor, selected cards), `personDetail`, `mapBase`, `mapTiles`, `aiState` |
| **Feed** | `web/vite.config.js` (`/agent/feed`), `web/src/agent/bridge.js` (`startFeed`) | the game tab pushes a frame every 200 ms while somebody watches, beside the command queue |
| **Recorder** | `web/src/agent/recorder.js`, hook in `web/src/main.js` | the ring of player samples + events; `parseSession`, `sessionAt`, `heatmap` (shared by the game and the page) |
| **Store** | `web/vite.config.js` (`/agent/session(s)`), `web/sessions/` (gitignored) | sessions as JSON files on disk |
| **Commands** | `web/src/agent/devtools.js` | the 12 rows above, spread into `COMMANDS` by `buildCommands` |
| **Checks** | `web/src/agent/devtools-selftest.js` | 12 selftest checks (§8) |
| **Tools** | `web/tools/dl.mjs` (`--tab`, `watch --follow`), `web/tools/mcp-server.mjs` (`DL_TAB`), `web/tools/observer-shots.mjs`, `web/src/scenarios/recorder-cost.js` | addressing one tab, streaming events, page screenshots, the frame-cost A/B |

## 2. Player fantasy

This is a developer's fantasy, not a player's. Robert has a friend playing in one window. On his second monitor the
observer shows Phoenix from above: the friend's gold chevron walking out of Rust Haven, Dustwolves in red with their
flags, the sheriff with her Nigerian flag and her name. A kill flashes on the map and lands on the wire, typed like a
telegram. He clicks the raider who did it: the card says FIGHTING, target YOU, 14 m, a shotgun with two shells in it,
the Dustwolves read the player as HOSTILE -60. He right-clicks the street ahead and drops three more. He turns the
clock to midnight and the weather to a storm. Two hours later he opens REPLAY, picks the session the friend's tab wrote
to disk, drags the scrubber to the death, and turns on DIED and FOUGHT: the heat sits on one corner of the ruins.

An agent's fantasy is shorter: one call says what is on screen; one call says what changed; one call waits for the
thing it is waiting for.

## 3. Detailed rules

### 3.1 Attaching (the feed)

- The observer never runs in the game tab and never takes commands from the bridge: the bridge drives one tab, and
  observe.html is not a game tab. It works beside a person's tab, beside the headless harness, and beside both.
- **Which game:** every game tab long-polls `/agent/next?tab=<id>&kind=agent|human`; `/agent/status` lists them
  (`tabList`). The observer watches the driven tab unless `?tab=<id>` (or the tab chip) picks one. Every command the
  page sends carries `tab`, and the bridge delivers a job with a `tab` only to that tab, standby or not.
- **The frame:** while an observer's GET `/agent/feed` is under 4 s old, the game tab POSTs a snapshot every 200 ms;
  otherwise it POSTs one empty "anyone there?" every 1.5 s. A frame holds the player card, every character as a row
  `[id, x, z, face, faction, flag, state, hp, named, name, vehicle, gy, hostile, npcId, targetId]`, every vehicle
  `[id, type, x, z, heading, hp%, dead, driver, speed, width, length, name, onFire]`, perf, the recorder's state, the
  laid-out chunk keys, the doors and windows inside the observers' view box (only under 900 x 900 m), the full card of
  each selected person (up to 4), the events since the last push (at most 200), and the faction table every 2 s.
- The feed runs on timers, not frames, and keeps running while a long command (`step`, `moveTo`, `selftest`) yields,
  so the map stays live while an agent works.
- The server keeps the last frame per tab and a ring of its last 600 events; a reload (new `boot` id) clears them.
- **Hidden tabs:** a browser stops a hidden tab's frames and throttles its timers to 1 Hz. Put the game and the
  observer in separate windows (or watch the headless harness, which never hides).

### 3.2 The page

- **Map:** world metres, +x right, +z down (the game's own camera). Ground: the island's minimap (`mapBase`), the
  streamed chunks' 128 px tiles (`mapTiles`, recoloured from the radar's green to the island's palette), I-10 outside
  the island, towns, exits, raider camps, the base fence, shop names close up. Wheel zooms at the cursor
  (0.012-24 px/m, Phoenix to a doorway), drag pans.
- **People:** a dot in the faction's row colour (`data/society.js`), a red rim when hostile to the player, a heading
  tick close up, a white ring and a name for named people, an X for the dead, `z` asleep, an amber ring downed. Named
  people always wear their flag (the real drawing, `ui/portrait.js drawFlag`); everyone does past 3.2 px/m or with ALL
  FLAGS on. People in a vehicle are drawn as the vehicle. Positions are interpolated between frames.
- **Vehicles:** oriented boxes at their real size (gold: yours; bone: driven; grey: parked; orange: burning; brown:
  wrecked), a driver dot, an hp bar when hurt.
- **Doors and windows** past 1.6 px/m: each leaf drawn from its hinge at its angle (rust when locked), each window as
  a tick coloured by glass state.
- **Events:** a ripple where it happened (the event's x,z, else the person it names, else the player): kills,
  deaths, hits, deeds, rumours, witnesses running (a dashed line to their hub), director events, trades, roles.
- **Selection:** click a person (double-click follows). The card: portrait on their flag, faction, AI state and the
  raw `ai.js` state, hp, target (a dashed red line on the map), grudge, weapon and rounds, bleeding, asleep, household
  and today's plan (ring residents), what they carry, and what a named person remembers of you (opinion, refusals,
  vendetta). With nobody selected the card is the player: health, stamina, water, food, rest, kit, pack, cash, roles.
  FOLLOW keeps the map on them; CAM renders `screenshot` at them every 1.2 s into the card.
- **Wire:** newest first, typewritten, filterable (ALL, COMBAT, WORD, DIRECTOR, TRADE, WORLD); chatter (`bark`,
  `toast`, `boarded`...) shows only under WORLD. Click a line to fly to it and select whoever it names.
- **Dock:** PERF (fps, frame ms with a 16.7 ms sparkline, draw calls against 150, triangles, stalls with the
  `cross`/`promote` gates, pump p95, chunks, heap, errors, feed age), FACTIONS (each standing as a needle on
  -100..100, the tier, a warning when they shoot on sight), CENSUS (alive/dead/fighting per faction), CONTROL LOG
  (every command the page ran, its result on hover, its time).

### 3.3 Control

Every control is one existing command; the page has no API of its own. PAUSE (`pause`), STEP 1s / 5s (`step`), TIME
(`setTime`, a slider, presets, x40), WEATHER (`setWeather`), SPAWN (`spawn`: kind, count, x/z or a right-clicked spot,
hp, name, weapon, a flag picker drawn with the real flags, angry, sprinter), GIVE (`give`), GOD (`god`), EVENT
(`fireEvent`, `director` pause/resume, `cancelEvent` on what is running), TELEPORT (`teleport` x/z or a town);
right-click the map: teleport here, spawn here, look here, three angry raiders here, GPS waypoint here, and on a person:
select, heal (`heal`), kill (`kill`, confirmed); on a vehicle: explode (confirmed), teleport beside. On the card: HEAL,
KILL (confirmed), GO TO, LOOK (`look`: the frame and who is in it), FACE (`aim`). REC SAVE (`record save=true`), NEW
(`record reset=true`, confirmed). Destructive actions ask first.

### 3.4 The recorder

- `g.recorder` (main.js builds it; `frame()` calls `recorder.tick()` once per simulated frame, after every system and
  before `input.endFrame()`). Paused frames are not simulated and not recorded. `step` frames are.
- A **sample** every `1 / REC.rate` game seconds (4 Hz): t, x, z (the vehicle's when driving), heading, hp, speed,
  flags (`veh dead fire sprint crouch inside auto swim hurt throw`), keys (`W A S D Shift Control Space E F R G V Q
  Tab MouseL MouseR`: held at the sample or tapped since the last), aim angle, floor height. Ten Float32Arrays of
  `REC.cap` (36,000 = 2.5 game hours, 1.4 MB).
- **fire** = the rounds in the gun in hand went down since the last sample; **throw** = the throwables went down;
  **hurt** = hp went down; **auto** = an agent is steering (`autopilot`, `driveOverride`, `aimOverride`).
- **Events:** at each sample, every `g.events` entry newer than the last one seen, kept compact (type, time, a
  whitelist of payload keys, a position: its own x,z, else the person it names, else the player's), plus the player's
  position, and `you` / `byYou` marks. A synthetic `playerDied` at the sample the player is first seen dead. Ring of
  `REC.evCap` (6,000).
- **Sessions** (`record save=true`, the autosave, the SAVE button): `{ v:1, kind:'dsoa-session', id, started, rate,
  cols: {t, x, z, h, hp, spd, flags, keys, aim, gy}, events, end }` written to `web/sessions/<id>.json`. A person's tab
  (`kind=human`) autosaves every `REC.autosaveS` (120 s) once it holds `REC.minAutosave` (60 s) of play, rewriting the
  same file; agent tabs do not unless `record autosave=<s>`.
- **Replay** reads a session; it never re-simulates (AI and spread use `Math.random`; positions are the truth, inputs
  and events say why). `replay at=<t>` interpolates; `goto=true` stands the live player there. The page scrubs, plays
  at 1-64x, and shows keys and flags lit at the moment.
- **Heatmaps:** WENT (game seconds per cell), FOUGHT (samples with fire/hurt/throw, plus fight events: kills by or of
  the player x2, hits, blasts), DIED (`playerDied`). ALL SESSIONS sums every saved session (up to 40) with the open one.

### 3.5 The agent multipliers (why these three)

The work in AGENTS.md is a loop of *set a scene, advance time, check what happened, look at it*. Each multiplier
removes a hand-written step from that loop:

1. **`look`** — a screenshot and what is in it, in one call. Before: `screenshot`, then `state`, `query type=char`,
   `query type=vehicle`, `doors`, `hud`, and guessing which dot is who. Now every person in frame comes back with name,
   faction, flag, AI state, hp, hostile, target, distance and their pixel position in the image, plus vehicles, doors,
   windows, containers, named places, the ground the frame covers and a one-paragraph caption. An agent that cannot
   look at images still knows what the picture shows; one that can knows which blob is the sheriff.
2. **`snap` + `diff`** — what changed between two moments. Before: dump `state`/`query` twice and diff JSON by hand
   (the checks in api.js each re-derive their own before/after). Now: who died, appeared, was removed, got hurt or
   healed, moved, changed AI state; vehicles; doors and windows; the player's hp, cash, wanted, pack, guns, position;
   standings; roles; quests; the events in between by type, with a one-line summary.
3. **`watch`** — wait for what you are waiting for. Before: `step` in a loop, `events since=`, filter, repeat (most
   scenarios and checks carry such a loop). Now: a filter (types, not-types, anyone involved, near x,z, text), stepped
   (deterministic) or on the wall clock, stop after N; a cursor to resume. `dl.mjs watch ... --follow` streams them.

## 4. Formulas

- **Sampling:** a sample when `g.time >= nextT`; then `nextT += 1/rate`, or `nextT = g.time + 1/rate` when more than
  four periods behind (a long pause), so a gap never becomes a burst of copies.
- **Interpolation** (`sessionAt`): binary search for the samples `a <= t < b`, `k = (t - t_a) / (t_b - t_a)`;
  positions, hp, speed linear; heading and aim by the shortest angle; flags and keys from the nearer sample.
  Worst error for a walk at speed v sampled at rate r is bounded by the turn inside one period; in a straight line it
  is ~0. The check holds it under 0.6 m at 24 off-grid moments.
- **Heat:** cell `(floor(x / c), floor(z / c))`; WENT adds `min(2, t_{i+1} - t_i)` (a teleport or a pause is not two
  hours in one spot); colour `t = sqrt(v / max)` from rust through amber to bone, alpha `0.25 + 0.6 t`.
- **Map:** `screen = (world - centre) * s + size / 2`; wheel zoom `s *= exp(-deltaY * 0.0015)` about the cursor.
  Between frames `p = p_prev + (p_now - p_prev) * min(1, (now - t_now) / (t_now - t_prev))`, no blend past a 25 m jump.
- **Frame cost:** idle frame = one property read, one Set size check, one compare; a sample frame = ~16 typed-array
  writes, a dozen Set lookups and an events scan. Cost per frame averaged = `idle + sample * rate / 60` (measured in §8).

## 5. Edge cases

- **No game tab / the tab hides / reloads:** the map shows NO SIGNAL with the reason (no tab, no frame yet, frames
  stopped N s ago). A reload changes `boot`: the page clears its wire and starts the cursor again.
- **Several tabs:** the chip shows which; a command with `tab` to a tab that is gone fails with `tabList`.
- **A long command in the watched tab:** the feed keeps going (it is not in the queue); commands from the page wait in
  the queue like any agent's.
- **Several observers:** the game tab serves the union of their view boxes and selections (4 cards at most).
- **The 500-event ring laps:** the recorder samples at 4 Hz, the ring holds ~500 events: it never laps between samples
  in play; the feed caps a push at 200. `diff` counts every event between snaps but lists only those still in the ring.
- **Teleports and respawns** break the replay path (no line drawn across more than 60 m between samples) and do not
  count as time spent anywhere for WENT.
- **The player in a vehicle:** samples take the vehicle's position and heading; the map draws the vehicle, not the
  person.
- **Save and load:** the recorder is not in the save: a load is a jump in the recording, like a teleport.
- **Production build:** the bridge, the feed and the session store exist only on the dev server; `record save`,
  `session id=` and `replay id=` say so. `record`, `session` (live), `replay` (live), `look`, `snap`, `diff`, `watch`
  work anywhere.
- **Editing the observer while a game runs:** `observer.js` accepts its own hot updates (it reloads only itself).
  Without that boundary Vite full-reloads every page on the dev server, the game tab included, which kills a running
  command (a selftest was lost that way while this was built). Editing the shared modules (`agent/recorder.js`,
  `ui/portrait.js`) still reloads the game, as any engine edit does (the game keeps its place through the reload).
- **The Z-word:** the infected's internal kind is never shown; the page labels it "infected" (ip-lint stays at 0).

## 6. Dependencies

- `g.events` / `g.emit` (main.js): the event stream the wire, the recorder and `watch` read.
- `systems/ai.js` (`hostile`), `systems/factions.js` (`view`, `row`, `reading`), `systems/memory.js` (`view`),
  `systems/residents.js` (`memberView`), `systems/inventory.js` (`boxes`, `boxView`, `view`), `systems/survival.js`
  (`view`), `systems/roles.js` (`view`), `systems/interiors.js` (doors, leaves, windows), `world/streamer.js`
  (`layouts[].mm`, `W`, `pumpStats`, stalls), `world/city.js` (the island's minimap canvas, `locationName`),
  `ui/portrait.js` (`FLAGS`, `drawFlag`, `drawPortrait`): read only. Nothing here writes to a system except through the
  existing commands, plus `heal` (hp, bleed, the downed timer).
- The agent bridge (`vite.config.js`): `/agent/feed`, `/agent/session(s)`, `tab` addressing, `tabList`.

## 7. Tuning knobs

| Knob | Where | Default | What it does |
|---|---|---|---|
| `REC.rate` | `recorder.js` (`record rate=`) | 4 Hz | samples per game second |
| `REC.cap` / `REC.evCap` | `recorder.js` | 36,000 / 6,000 | the ring's length (2.5 h at 4 Hz) |
| `REC.autosaveS` / `REC.minAutosave` | `recorder.js` (`record autosave=`) | 120 s / 60 s | a person's tab writes its session to disk |
| `REC.heatCell` | `recorder.js` (`replay cell=`) | 8 m | heatmap cell (the page uses 8 for WENT, 12 for the others) |
| feed interval | `vite.config.js` `mergedWant().interval` | 200 ms | how often a watched tab pushes |
| watcher timeout | `vite.config.js` | 4 s | an observer that stops polling stops the pushes |
| events per push / kept | `bridge.js` / `vite.config.js` | 200 / 600 | |
| door box limit | `observe.js` | 900 x 900 m | doors and windows only when zoomed in |
| flags for everyone | `map.js` | 3.2 px/m | below it only named people wear flags (ALL FLAGS forces it) |
| CAM rate | `observer.js` `camTick` | 1.2 s, 480 x 270 | the card's live camera |

## 8. Acceptance criteria

Selftest checks (`web/src/agent/devtools-selftest.js`), all in the full battery:

1. `observe` lists the player card, every character (faction, real flag code, AI state), every vehicle, perf, the
   doors in a box and a selected person's card.
2. `person` shows a named person's memory and portrait seed, the player's vitals and pack, and refuses a stranger id.
3. `mapBase` gives the island map and I-10; `mapTiles` gives a laid-out chunk's tile and names the missing ones.
4. While an observer watches, the game tab pushes frames to `/agent/feed` with its events (a probe event arrives).
5. `heal` restores hp and stops bleeding; the dead are refused.
6. A walk (an agent's `moveTo`, then held keys) records ~4 samples a game second, positions that follow the player,
   the `auto` flag, the A key held, the `arrived` event.
7. A session saved to disk and read back puts the player within 0.6 m of where they really were at 24 moments off the
   sample grid; `goto` stands the live player there; `session list` lists it.
8. Heatmaps: WENT covers the walk, FOUGHT marks the shooting and the kill, DIED marks exactly one death where the
   player fell.
9. The recorder's tick: a non-sample frame under 100 ns, a sample under 50 us.
10. `look` returns the screenshot and the people in it with pixel positions inside the image, faction and flag; and
    without the image.
11. `snap`/`diff` catch a killing, a spawn, a move and a cash change, with the events counted; a missing snap fails.
12. `watch` (stepped) returns the one kill that matches type and id two game seconds in, not the noise, and its cursor
    resumes cleanly.

Measured (2026-10-23, RTX 4090, headless Chrome, harness on :3200):

- **Selftest:** 147/147 on fresh pages (135 engine checks + the 12 above), run twice on the shipped code.
- **Frame cost** (`scenario name=recorder-cost`: one page, the recorder toggled in ABBA blocks of 3 s, 16 blocks,
  frames run by `streamer.runFrames` with a GPU-synced render): frame 8.52 ms on vs 8.33 ms off, difference
  +0.18 ms with a 95% interval of [-0.68, +1.04] ms (not distinguishable from zero; the scene itself drifts
  7.2 -> 9.6 ms over the run); the sim alone 3.17 vs 3.11 ms, +0.06 [-0.37, +0.49]. The tick by itself: 19.5 ns on a
  frame that does not sample, 0.78 us on one that does, 0.07 us per frame averaged at 4 Hz: 0.0004% of a 16.7 ms
  frame. No measurable frame cost.
- **Sessions:** an agent's bounty run (465 game s, 1,861 samples, 557 events, 2.8 km, 4 deaths, 7 kills) is a 157 KB
  file.
- **The feed while busy:** the map kept a frame under 250 ms old through a whole `scenario name=bounty-run` in the
  watched tab (`docs/renders/web/observer/06-live-during-scenario.png`).
