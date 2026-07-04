# CarWorld Features Documentation
**Date:** 2026-06-11
**Version:** Phase 7 (Combat & Open Wasteland)

> **Build update (2026-06-11 — autonomous combat/world pass):** Added a full weapon system
> (vehicle-mounted + on-foot shooting), a SHOOTER enemy type, an open wasteland with foot-only
> ruins ("terrain that requires walking"), and a minimap. Also repaired a large batch of latent
> bugs that were silently breaking the garage, vehicle selector, HUD, and the full game scene
> (`world.tscn`). See `docs/BUILD_NOTES.md` for the full log. New sections 11–13 below.

## 1. Core Gameplay Loop
The game follows an extraction-based survival loop:
*   **Town (Safe Zone):** Start here. access the Garage to upgrade your vehicle, view stats, and select your car.
*   **The Run (Action):** Drive as far as possible into the infinite "Deathlands".
*   **Extraction:** At any point (after a minimum distance), the player can initiate an extraction (Hold X) to bank their gathered Scrap and Miles.
*   **Failure:** If the vehicle is destroyed or the player is killed, the run ends immediately. A summary screen displays the results.

## 2. Driving & Physics
*   **Arcade-Sim Physics:** Top-down vehicle physics with drift mechanics, traction loss at high speeds, and distinct handling per vehicle type.
*   **Analog Control:** Full support for analog triggers (gas/brake) and steering sticks via Gamepad.
*   **Vehicle Types:**
    *   **Scavenger (Balanced):** The reliable starter vehicle.
    *   **Interceptor (Fast):** High speed and acceleration, but fragile. (Unlockable)
    *   **Behemoth (Tank):** Heavy armor and high damage, but slow. (Unlockable)

## 3. Survival Mechanics
*   **Breakdowns:** Vehicles have a chance to break down based on miles driven.
    *   *Visuals:* Smoke pours from the engine.
    *   *Effect:* Speed is drastically reduced.
    *   *Fix:* Player must exit the vehicle and perform a Repair action (Hold E). This may consume a **Repair Kit**.
*   **Hull Integrity:** Vehicles take damage from collisions and enemy attacks. At 0 HP, the vehicle explodes (Run Over).
*   **Heat System:**
    *   Heat rises as you drive, loot caches, or crash.
    *   Higher Heat attracts **Pursuers** (Enemy AI).
    *   Heat resets upon returning to Town.

## 4. World & Exploration
*   **Infinite Road:** The world generates endlessly as you drive North.
*   **Obstacles:** Roadblocks, chicanes, and wrecks spawn to challenge driving skills.
*   **Loot Caches:** Randomly spawned loot containers on the roadside.
    *   *Types:* Scrap piles, Fuel drums (Scrap bonus), Repair stashes.
    *   *Mechanic:* Stop the car, get out, and scavenge (Hold E).

## 5. Enemies (Pursuers)
*   **AI Behaviors:**
    *   **Rammer:** Aggressively drives into the player to deal collision damage.
    *   **Blocker:** Speeds up to overtake the player, then brake-checks to cause a crash.
*   **Spawning:** Enemies spawn behind or ahead based on current Heat levels.

## 6. Meta-Game (Economy & Progression)
*   **Currency (Scrap):** Earned by looting caches during runs.
*   **Garage Upgrades:** Spend Scrap at the Town Terminal.
    *   **Kit Capacity:** Carry more repair kits.
    *   **Reliability:** Reduce breakdown chance per mile.
    *   **Armor Plating:** Reduce damage taken from collisions.
*   **Persistence:** All progress (Scrap, Upgrades, Best Run) is saved automatically.
*   **Unlocks:** Gaining lifetime scrap unlocks new vehicle chassis (Interceptor, Behemoth).

## 7. User Interface (UI)
*   **HUD:** Real-time display of Speed, Heat, Armor, Fuel/Kits, and Action Progress.
*   **Tutorial Prompts:** Context-sensitive hints (e.g., "Hold E to Repair") spawn when needed.
*   **Run Summary:** Detailed report screen after every run (Miles, Scrap, Cause of Death).
*   **Help Overlay:** Press **F1** to see a full control mapping for Keyboard and Gamepad.

## 11. Combat & Weapons (NEW — 2026-06-11)
*   **Five weapons** (data-driven `.tres`, in `items/weapons/`):
    *   **Machine Gun** — fast, light, slight spread; default vehicle + on-foot sidearm.
    *   **Shotgun** — 7 spread pellets, heavy knockback, slow.
    *   **Rocket Launcher** — high single-target damage, slow (Behemoth's default).
    *   **Flamethrower** — rapid short-range pellets.
    *   **Mine Dropper** — drops stationary mines that let you drive away but trigger on enemies.
*   **Vehicle-mounted weapons:** vehicles mount their loadout forward and fire on the attack
    button (LMB / RB) at each weapon's own fire rate. Ammo shows on the HUD.
*   **On-foot shooting:** out of the vehicle, aim with the mouse and fire your sidearm.
*   **Team/friendly-fire system:** projectiles damage both vehicles and characters, never hit
    their own shooter or allies, and stop on walls/terrain. (Also the hook for future multiplayer.)
*   **Enemy SHOOTER type:** a pursuer that holds its distance, faces you, and fires back.

## 12. Open Wasteland & Foot-Only Ruins (NEW — 2026-06-11)
*   **Wide wasteland:** the road is now flanked by an open dirt expanse with scattered rocks,
    so the world reads as open terrain rather than a bare strip.
*   **Foot-only ruins:** barrier rings (on a new `rough_terrain` collision layer) that vehicles
    physically can't enter but your character walks straight through — the "terrain that requires
    walking." Richer loot inside rewards leaving the car. They appear more often deeper in.

## 13. Minimap (NEW — 2026-06-11)
*   A top-right radar centred on the player, showing hostiles (red) and loot (yellow), clamped
    to the rim when out of range.

---
### How to try the new combat (main scene)
Open `scenes/levels/test/test_driving.tscn` and run. Two enemies spawn and chase you — a rammer
and a shooter that fires back. Walk to a car (E to enter), then **hold LMB / RB to fire** while
driving. The minimap (top-right) shows the hostiles.

### To play the full town→run loop
Open `scenes/levels/world.tscn` (repaired this build). Spawn in town, enter the town's vehicle,
drive through the start gate to begin a run down the wasteland road, fight pursuers, loot ruins
on foot, and Hold X to extract.

## 14. Driving Feel (GTA2 arcade — 2026-06-11)
*   **Acceleration**: throttle applies engine force; velocity-squared drag gives a natural speed curve.
*   **Momentum / coasting**: release the gas and friction + drag bleed speed off with real weight.
*   **Brakes**: punchy deceleration against the direction of travel (uses each car's brake stat),
    distinct from reverse (which engages only once stopped).
*   **Skidding / drift**: traction drops at high speed and the handbrake (Space) cuts traction for
    dramatic power-slides; **fading skid marks** are laid down while you slide.
*   **Per-vehicle handling**: grippy Behemoth → balanced Scavenger → loose Interceptor/Bike. Vehicle
    HP now scales from armor (the Behemoth tanks; the Bike is a glass cannon).

## 15. Multiplayer (server-authoritative, foundation — 2026-06-11)
*   **Netcode complete & tested**: host/join over ENet (up to 32), player roster, spawn handshake,
    client→server input replication, and automatic ~20 Hz server→client state sync. Verified
    cross-process by `tools/net_test.sh`.
*   **Playable arena** (`scenes/mp/mp_arena.tscn`): launch two game instances, press **H** to host or
    **J** to join (127.0.0.1), and drive together — the server simulates, clients render.
*   Single-player is entirely unaffected. Remaining: a spawner in the main world + host/join menu.

### Automated test harness
*   `tools/smoke_test.sh` — 36 system/economy smoke checks + a 6-check full-run integration sim.
*   `tools/net_test.sh` — cross-process multiplayer connection/sync test.

## 16. PROTO-3D — the 3D dream slice (2026-07-04)
*   **True 3D vehicle physics** (`proto3d/car_3d.gd`): `VehicleBody3D` raycast suspension, tire slip,
    weight transfer — no more faked bicycle model. Measured by headless sim: 0-60 in 3.2 s, 76 mph
    top speed, 60-0 in 45.7 m, controllable handbrake slides, never flips.
*   **Top-down camera you can SEE with** (`proto3d/camera_rig.gd`): scroll-wheel zoom (close tilt →
    high overview), velocity look-ahead, and **binoculars** (hold B / right-mouse) — narrow-FOV cone
    that looks ~85 m downrange in your facing direction.
*   **In/out of the car**: E to exit anywhere, walk on foot (WASD, SHIFT to run), E to enter any car
    — there's a second car parked in town.
*   **A place to drive TO**: Interstate 9 with dashes/shoulders/wrecks, green EXIT 9 sign, off-ramp
    into the town of Meridian.
*   **Enterable two-story safehouse** (`proto3d/house.gd`): walk in the door → roof hides (GTA
    trick); second floor goes see-through while you're under it; stairs UP to a walkable second
    floor with loot.
*   **Proof harness**: `proto3d/tests/drive_sim.tscn` (physics metrics) and
    `proto3d/tests/walkthrough_sim.tscn` (14 gameplay checks — drive, brake, exit, walk, re-enter,
    roof/floor logic, upstairs solidity). All green, headless.
*   **Run it**: `Godot --path game res://proto3d/proto3d.tscn`

## 17. M1 Feel Core — the 3D engine's first milestone (2026-07-04)
*   **Stairs you can actually climb** — walk up to the safehouse's second floor (was a
    reversed collision ramp; now proven by an input-driven test that presses W and checks height).
*   **Interact prompt UI** — walk up to anything usable → an amber chip tells you ("E — Open
    door", "LOCKED — need the Meridian car key", "E — Search duffel bag").
*   **Doors + locks + a key loot loop** — the safehouse has a real swinging door; the sedan
    parked in Meridian is locked, and its key is in the stash upstairs. Drive → loot → unlock.
*   **Dive move** (SPACE on foot) — committed lunge + a vulnerable get-up delay.
*   **Binoculars v2** — stay top-down, mouse pushes the view up to 90 m downrange, lens
    vignette, your body turns to face where you're glassing.
*   **GTA2 speed-zoom** — the camera pulls out the faster you drive.
*   **No more falling off the map** — 12 km ground + "last safe spot" respawn.
*   **Off-road ground detail** — thousands of scrub/rock/dirt instances so off-road has anchors.
*   **Proof:** `res://proto3d/tests/m1_sim.tscn` — 21/21 input-driven checks (no teleport-cheats).
