# DRIVN Engine — Master Specification

**Codename:** DRIVN (working name — from the repo, DriveNShoot; rename anytime)
**Vision:** *Autoduel × GTA2-modern, in the world of Deathlands.* A top-down 3D open-country
survival engine: drive across a compressed America, pull off any exit, get out of the car,
kick in a door, go upstairs, loot, whistle for your dog, and get back on the interstate.
**Host engine:** Godot 4.5 (3D, `VehicleBody3D` physics, GL Compatibility renderer)
**Proven foundation:** `game/proto3d/` — real vehicle physics (0-60 3.2s, 76mph, sim-verified),
top-down zoom camera, in/out of cars, enterable two-story building. 14/14 gameplay checks green.
**Created:** 2026-07-04 · this document is the source of truth for engine scope

---

## 0. Engine Philosophy

1. **Engine before content.** We build systems that make content cheap, not content.
2. **Everything is data-driven.** Vehicles, animals, weapons, traits, buildings — `.tres`
   resources. Adding a new dog breed or a tank must never require touching engine code.
3. **Everything is proven headless.** Every milestone ships with sim tests like
   `drive_sim`/`walkthrough_sim` — and they must exercise the REAL path (the stairs bug
   escaped because the test teleported; never again. Tests walk, drive, and press the keys.)
4. **Multiplayer-shaped from day one.** Server-authoritative thinking in every system
   (we already have working ENet netcode in the 2D game to port). The vision cone is also
   the anti-cheat: the server only *sends* what your cone can see.
5. **The 2D game is the systems donor.** Economy, contracts, heat, save/load, dialogue,
   netcode — engine-agnostic GDScript that ports into 3D. Nothing from those 24k lines dies.

---

## 1. System Map (the seven pillars)

| # | System | One-liner |
|---|--------|-----------|
| 1 | **World Core** | Streamed infinite terrain + compressed-country geography + world map |
| 2 | **Vehicle Framework** | Chassis + modules: anything from a bicycle to an 18-wheeler to a tank |
| 3 | **Character Core** | Stats, traits, actions (dive/throw/interact), inventory + equipment |
| 4 | **Perception Engine** | Vision cone, lighting-aware clarity, room memory, binoculars v2 |
| 5 | **Structure System** | Doors, locks, multi-floor interiors, stairs — later: player-built forts |
| 6 | **AI & Life** | Animals (dogs/rodents/birds), taming, human AI, drivers, convoys |
| 7 | **Netcode** | Server-authority port of existing ENet foundation + cone-based culling |
| 8 | **Base, Automation & Agriculture** | Robotics/drones, construction/forts, farming, power grid — see `PROGRESSION.md` |

**Companion docs:** `STAGES.md` (master build order), `DESIGN_PILLARS.md` (retention north star),
`PROGRESSION.md` (skills/robotics/taming/farming — RPG spine, 700-pt cap),
`loops/LOOP2_LIVING_CAR.md` (next loop), `systems/COMBAT_AND_GEAR.md`, `systems/INTERFACE_AND_BODY.md`,
`systems/WORLD_NPCS.md`, `systems/TRAVEL_AND_NETCODE.md` (24× travel scale + PZ-style MP),
`systems/CONTENT_PIPELINE.md`.

---

## 2. World Core

### 2.1 The compressed country (the Autoduel answer)
Autoduel (1985) faked it: cities were nodes, highways were abstract line-segments between
them, and a **map screen** sold the illusion of the Northeast US. We do the modern version —
**continuous compressed geography**:

- **Scale:** roughly 1:200 — the continental US becomes a ~30 × 15 km playable landmass.
  A state is 1–3 km of real driving; crossing the country is a 20–40 minute road trip
  with fuel/breakdown/ambush pressure (that's the game).
- **States are real:** a state grid with borders and welcome signs ("WELCOME TO VIRGINIA —
  THE DEAD COMMONWEALTH"). The HUD location line (already working in proto3d) says state +
  road. Drive east long enough and you WILL hit the Atlantic.
- **Landmark anchoring:** each state gets 1–3 recognizable anchors (rusting Gateway Arch,
  drowned DC monuments, Vegas strip ruins). Landmarks are how players navigate without GPS.
- **Road hierarchy:** Interstates (fast, patrolled, ambush-prone) → state routes → local
  streets → dirt. Exits are real: every interstate exit leads to a generated-or-authored town.
- **Authored anchors + procedural filler:** towns/cities at fixed map locations are authored
  templates (seeded, so persistent); the terrain and minor settlements between them are
  procedural from the world seed. Same trick as the 2D road_manager, in 2 dimensions.

### 2.2 Streaming
- Chunked terrain (e.g. 256 m tiles) loaded in a ring around each player, unloaded behind
  (port of the 2D chunk logic). Persistent deltas (looted containers, opened doors, wrecks)
  saved per-chunk.
- **No more falling off the map** — the world streams under you; oceans are the only edge.

### 2.3 World Map UI
- Full-screen map (M key): country view → state view → local view. Shows your position,
  known landmarks, roads you've personally driven (fog-of-war cartography — the map is
  *earned*), contract targets, and later: other players' last-known positions.

## 3. Vehicle Framework

**Everything is a chassis + modules.** A vehicle resource declares:
- **Chassis:** mass, dimensions, hp/armor zones, seat count, cargo volume, mount points
- **Locomotion module:** `wheels` (cars/trucks — VehicleBody3D), `two_wheel` (bicycle,
  motorcycle — lean simulation on top of VehicleBody3D), `treads` (tanks — skid-steer),
  future: `hover`, `rail`, `boat`
- **Attachment modules:** turret mounts (yes — the Atari *Combat* test: two tanks, walled
  arena, ricochet shells, must be buildable as pure data), trailer hitch (18-wheelers: a
  towed second body with its own physics joint), weapon mounts (port the 2D weapon_system),
  ram plates, fuel tanks, storage
- **Roster targets:** bicycle, motorcycle, 3 cars (Scavenger/Interceptor/Behemoth port),
  pickup, 18-wheeler + detachable trailer, tank. All driveable with the SAME controller code.

## 4. Character Core

- **Stats/traits (PZ-informed):** perception, endurance, strength, mechanics, guts.
  Traits modify the perception cone (Eagle Eyed: wider+farther; Short Sighted: narrower),
  stamina, carry weight. Headgear trades protection against cone width (helmet = armored
  tunnel vision).
- **Actions:** context-sensitive **interact** with **on-screen prompt UI** — walk up to
  anything usable and a prompt chip appears ("E — Open door", "E — Enter Scavenger",
  "HOLD E — Search corpse"). Nothing interactable without the UI telling you so.
- **Combat moves:** strafe (exists), **dive** (commit move: i-frames-ish burst, then a
  get-up delay — risk/reward), throwables (grenade arc + cook timer), melee swing.
- **Inventory:** grid/weight hybrid, containers (backpack/trunk/house cabinets share one
  container system), equip slots (head/body/hands/holster), quick-slots 1-4. Full UI.
- **Survival hooks:** hunger/fatigue stubs wired but tunable to zero (arcade mode) —
  fatigue softens reaction, PZ-style, never a chore-simulator by default.

## 5. Perception Engine (the crown jewel)

- **Vision cone:** forward arc (default ~140°) + short 360° awareness radius. Entities
  outside it are **not rendered** (and in MP, not even replicated). Geometry = "could you
  see it"; lighting = "how well".
- **Lighting-aware clarity:** night/fog/interior darkness reduce effective range *inside*
  the cone. Flashlights/headlights carve visibility. Day feels god-tier, night feels scary.
- **Room memory:** explored static layout stays dimly visible ("remembered") for a short
  time; **dynamic entities are never remembered** — a room you swept 10 minutes ago can
  still kill you. Remembered zones render desaturated/darkened.
- **Binoculars v2 (user-designed):** hold to raise — the view STAYS top-down; your **mouse
  pushes the camera view downrange** in any direction up to binocular range; vignette +
  edge blur overlay sells the lens; your body turns to face where you're looking (in MP,
  others SEE you glassing a direction). Zoom wheel adjusts magnification. Release snaps back.
- **Extended senses:** sound events (gunshots, engines) ping direction outside the cone;
  a companion dog extends perception (below).

## 6. Structure System

- **Doors:** openable/closable, lockable (key, lockpick by skill, breach by force/shooting —
  loud = heat), car doors eventually too. Doors block the vision cone (peek by opening).
- **Interiors:** the proto3d safehouse pattern generalized — multi-floor, roof-hide,
  floor-transparency, working stairs (walk-tested), windows you can see/shoot through.
- **Building templates:** houses, gas stations, diners, police stations, garages — data-
  driven room layouts so towns can be assembled procedurally from authored pieces.
- **Forts (later phase):** player-placed walls/gates/watchtowers from scavenged materials —
  same pieces the world buildings use. Multiplayer clan forts are the endgame.

## 7. AI & Life

- **Animal framework** (data-driven species):
  - **Dogs — 3 breeds:** Shepherd (companion: follows, guards, extends your vision cone as
    a mobile sensor — his ears/nose ping threats outside your cone), Mastiff (feral pack
    hunter, attacks on sight), Coyote-cross (skittish scavenger, flees, steals dropped meat).
  - **Rodents — 3 types:** rats (swarm in interiors, gnaw stored food), rabbits (prey/food
    source), radroach-style mutant (aggressive in dark rooms only — perception synergy).
  - **Birds:** crows that flush loudly off wrecks/roofs when ANYTHING moves near them —
    a free, readable early-warning system for you *and against you*.
- **Human AI:** ports the 2D archetypes (RAMMER/BLOCKER/SHOOTER/SWARM/TRANSPORT) onto 3D
  vehicles + on-foot bandits; convoys with escorts; town guards; traders.
- **Director:** the 2D heat/encounter_director ports as the spawn brain — heat rises with
  noise and mayhem, the wasteland answers.

## 8. Netcode

- Port `network_manager.gd` (ENet, server-authoritative, input replication — already
  tested cross-process in 2D). Vehicles/characters already carry `team`/`peer_id` hooks.
- **Cone-culled replication:** server sends each client only what its cone perceives —
  binoculars and dogs become real tactical advantages; wallhacks become impossible.
- Not scheduled until the single-player engine loop is stable (M7).

## 9. Art Direction — EXPERIMENT FIRST (user decision)

Milestone A (parallel, cheap): build **the Art Range** — one street with a car, house,
and character rendered three ways, screenshot side-by-side:
1. **Flat-color low-poly** (today's look, refined: palette, AO, better sun)
2. **PixelLab-textured low-poly** — pixel-art textures skinned onto the 3D boxes (PS1-wasteland vibe)
3. **Free/generated 3D models** — Kenney CC0 packs (cars, city kits, characters — free,
   today) + local AI mesh generation (TripoSR / Hunyuan3D-2 run locally = $0; also the
   Mac Mini can serve) sized into the world.
User picks after seeing all three in motion. Engine code stays art-agnostic (mesh slots on
data resources) so the choice is swappable.

---

## 10. Milestones (each = one /goal loop, each ends drivable + sim-proven)

| M | Name | Ships | Acceptance (headless + hands-on) |
|---|------|-------|----------------------------------|
| **M1** | **Feel Core** | Stairs FIXED (ramp rotation bug) + walked-up-for-real test; world edge fixed (temp: 10× ground + respawn); interact prompt UI chips; doors v1 (open/close/locked+key); binoculars v2 (mouse-aimed, vignette, body-turn); off-road ground detail (scrub/rocks/dust); dive with get-up delay | Sim: input-driven stair climb passes; door open/locked/key cases; binocular aim math. Hands-on: "I can see, I can aim my looks, doors feel real" |
| **M2** | **World Core v1** | Chunk streaming (no map edge ever); state grid + welcome signs + HUD state line; road hierarchy w/ real exits; world map UI v1 (country→local, fog-of-war roads) | Sim: drive 10 km straight, chunks stream, memory flat; cross a state line, HUD updates. Hands-on: pull off a random exit into a town that wasn't there before |
| **M3** | **Vehicle Framework** | Chassis+module refactor; motorcycle + 18-wheeler w/ trailer + tank driveable; Atari *Combat* arena scene as the versatility proof; vehicle damage zones | Sim: each vehicle 0-60/brake/turn metrics in range; trailer tracks; tank skid-steers. Hands-on: Combat playable split-keyboard |
| **M4** | **Character Core** | Stats/traits resources (cone hooks live); inventory + container system + full UI; equip slots; throwables; melee v1 | Sim: inventory ops (move/stack/weight-cap); trait modifies cone numbers. Hands-on: loot a house into a backpack into a trunk |
| **M5** | **Perception Engine** | Vision cone rendering + entity culling; lighting-aware clarity; room memory (static-only); sound pings; flashlight/headlights | Sim: entity behind you not visible/replicated; memory forgets zombies-not-furniture. Hands-on: night in a dark house is terrifying |
| **M6** | **AI & Life** | Animal framework + all 7 species above; companion dog (follow/guard/scout-cone); human AI port on 3D vehicles; heat/director port | Sim: dog pings a threat outside player cone; crows flush; convoy spawns at heat 3. Hands-on: whistle, the dog comes |
| **M7** | **Netcode** | ENet port; cone-culled replication; 2-player co-op country drive | net_test 3D: cross-process drive + cone culling asserted |
| **M-A** | **Art Range** (anytime, parallel) | 3-way art comparison scene + screenshots | User picks a direction |

Ports from 2D riding along where natural: economy/scrap, contracts/mission board,
save/load (DataManager), dialogue (DialogueManager), garage/upgrades.

## 11. Known Bugs (from first hands-on playtest, 2026-07-04)

1. ~~Stairs unclimbable~~ — **FIXED M1** (ramp rotation sign; now walk-up sim-tested).
2. ~~World edge fall~~ — **FIXED M1** (12 km ground + last-safe respawn; true streaming = next loop).
3. ~~Binoculars useless~~ — **FIXED M1** (v2: mouse-aimed downrange, vignette, body-turn).
4. ~~Off-road blindness~~ — **FIXED M1** (MultiMesh scrub/rock/dirt scatter).

*M1 shipped 2026-07-04: 21/21 input-driven checks green (`proto3d/tests/m1_sim.tscn`).*

## 12. Genius-tier ideas (approved flavor, build when their pillar lands)

- **Dog = extension of the Perception Engine**, not a pet feature. Scouting IS gameplay.
- **Cone-culled multiplayer** = binoculars/watchtowers/scouts matter; cheating dies.
- **Fog-of-war cartography** — the world map only shows roads YOU'VE driven; map data
  becomes lootable/tradeable (buy a state map from a trader; loot one off a courier).
- **Crows as a system, not decoration** — universal early-warning that works for and
  against everyone, including in MP.
- **Trailer physics as gameplay** — an 18-wheeler trailer is mobile storage, a mobile
  barricade, and a jackknife weapon all in one body.
- **Atari Combat mode** — the tank test scene doubles as a shipped party minigame and
  the eternal regression test for the treads module.
