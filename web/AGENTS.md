# DIVIDED STATES OF AMERICA — Agent Guide

A top-down open-world engine (GTA-1/2 camera, 3D rendering) set in a post-apocalyptic United States: the ruins of Phoenix, Arizona. It's built to be **driven, tested and extended by AI agents** from a shell, with no clicking and no reading engine internals.

- **Stack:** three.js 0.170 + Vite. Plain ES modules, no framework, no asset downloads (every texture, portrait, flag and sound is generated in code).
- **Features:** on foot plus driving, pistol/SMG/shotgun, an NPC dialogue system with portraits, a day/night cycle, 7 weather types, gore (blood spray, pools, trails, gibs), enterable buildings (the roof cuts away) with swinging doors (shove one open into someone and they go down), locked doors you kick in or shoot open, and windows that crack, shatter, get climbed through or boarded up, a wanted level, quests, the Whaler harpoon, traffic and raider AI.

---

## Three ways in

| You are... | Use | Setup |
|---|---|---|
| An MCP client (Claude Code, etc.) | **MCP tools** `dl_*`: 97 commands with JSON Schemas, plus `dl_launch`, `dl_call`, `dl_batch`. `dl_screenshot` returns an image you can see. | Already registered in `.mcp.json`. Call `dl_launch` first. |
| A shell-only agent | **CLI** `node tools/dl.mjs <cmd> k=v` or **HTTP** `POST /agent/cmd` | `npm run agent` (dev server + **headless Chrome**, no window, no human) |
| Code in the page / a scenario | `DL.call(cmd, args)` / `DL.bind().cmd(args)` | — |

## 60-second quickstart (for agents)

```bash
npm install
npm run agent &                  # dev server + headless browser; prints READY (or open http://localhost:3141/?agent=1 yourself)
node tools/dl.mjs status         # {"connected": true}
node tools/dl.mjs selftest       # 84/84 engine checks
node tools/dl.mjs state          # everything about the current moment
node tools/dl.mjs help           # every command, args, description
```

Every command is **JSON in, JSON out**. Commands never throw. A failure comes back as `{ "ok": false, "error": "...", "hint": "..." }`, and the hint tells you the right args.

```bash
node tools/dl.mjs teleport x=0 z=-70
node tools/dl.mjs spawn kind=raider count=5 x=0 z=-110 angry=true
node tools/dl.mjs give weapon=smg smg=128 && node tools/dl.mjs equip weapon=smg
node tools/dl.mjs fire id=hostile shots=20          # nearest enemy, re-acquired every shot
node tools/dl.mjs step seconds=3                    # advance sim; returns state + events
node tools/dl.mjs screenshot --out shot.jpg         # LOOK at the result
node tools/dl.mjs events type=kill
```

Several commands in one round trip (stops at the first failure):

```bash
node tools/dl.mjs batch '[{"cmd":"setTime","args":{"hour":23}},{"cmd":"setWeather","args":{"key":"STORM","instant":true}},{"cmd":"step","args":{"seconds":2}}]'
```

Raw HTTP, if you'd rather skip the CLI:

```bash
curl -s localhost:3141/agent/cmd -H 'content-type: application/json' -d '{"cmd":"state"}'
curl -s "localhost:3141/agent/cmd?cmd=teleport&x=0&z=0"
```

In the browser console, or inside scenario code: `await DL.call('state')`, or `DL.bind()` and then `await DL.teleport({x:0,z:0})`.

**Full command reference:** [docs/COMMANDS.md](docs/COMMANDS.md), generated from the code. Regenerate it with `node tools/gen-commands.mjs` after adding commands.

## High-level verbs (use these before hand-rolling loops)

| Verb | What it handles for you |
|---|---|
| `moveTo x z` / `moveTo id=<npc or vehicle>` | A* path on a 1 m nav grid (through doors, around buildings **and parked cars**), follows a moving target with `id`, stuck detection with sidestep + re-plan, `maxSeconds` (default 120, cap 600), stops early if you die or take more than 25 damage, and reports `remaining` metres if time runs out |
| `drive x z` | A* on a vehicle-sized grid, cornering, braking for pedestrians, unsticking by reversing, stops early (`interrupted`) if the vehicle catches fire |
| `ram id=hostile` | Chases a target's live position at full throttle, backs out for a run-up, returns kills |
| `engage` | On-foot combat: paths around cover until it has line of sight, fires, reloads, switches weapons, stops on low HP / no ammo / no enemies |
| `exitVehicle` | If the car is burning, sprints clear of the blast automatically |
| `fire id=...` | Refuses to shoot through walls (`blocked: true`) so you don't waste ammo |
| `path`, `objective`, `waypoint` | Inspect a route (0.7 ms for 400 m), read the quest tracker, set the GPS |
| `save` / `load` | Full game state as JSON (including blood/injuries): checkpoint before a risky experiment and roll back |
| `screenshot x z zoom` | Look at any spot at any camera height (8 = close-up, 90 = overview), even from a hidden tab |
| `bench` | Honest GPU-synced frame timing (avg/p95/max, draw calls, GPU name) |
| `chronicle`, `factions`, `rumors`, `witnesses` | The world's memory (docs/design/WEB_WORLD_MEMORY.md): what happened and who saw it, where you stand with every faction, word on its way, and a dry run of who would name you right here. `deed`, `standing`, `relation`, `registerFaction` to stage or extend it |
| `memory id=`, `director`, `fireEvent` | What a named person remembers about you (and whether they'll still deal); the event director (hunters, the dead drawn to a bloody night, STATIC 1660 AM news): what's running, what could fire and why not |
| `base`, `base action=alarm\|calm\|warn` | The Federal Remnant's OUTPOST NINE (docs/design/WEB_MILITARY.md): where it is, the alert (calm, warned, hostile) and why, the grace left after a warning, whether you are inside, seen and lit, your standing, every soldier (post or patrol, perched on a tower, hostile to you), the doors (the armory's locked steel door), the boxes (searched, what was in them), the parked vehicles, the searchlights. The actions stage the alert. `map` lists every base; `spawn kind=soldier` makes a Remnant soldier; `spawnVehicle type=patrol\|apc` the PATROL TRUCK and the ARMORED CARRIER |
| `doors`, `door id= action=`, `windows`, `window id= action=` | Every door and window near a spot (angle, locked, kicks left; glass hp, crack, boards). `door` opens, closes, locks, unlocks or kicks (the E key's boot: 2-3 for a locked one, each a loud noise); `window` breaks, boards, unboards, repairs, or climbs you through. Doors and windows are data rows from `world/city.js`; `scenario name=interior-lineup` shows every state in one building |

**Honest by default:** `talk` and `enterVehicle` require you to actually be there (within about 4 m), and the error tells you where the target is (`moveTo id=... first`). Pass `force=true` only in tests. Named characters dropped by raiders or traffic are downed and back on their feet after 45 s (you get a `downed` event with the countdown). If *you* kill one, they stay dead, except characters marked `essential: true` (the quest-giving sheriff and Doc Reyes), who always come back so the story can't dead-end. Killing them still earns wanted stars. Mark your own quest givers `essential` in content packs.

Blocking commands return early with an `interrupted` reason rather than failing silently. Every command has a wall-clock watchdog (`budget=<s>`, default 90 s; scenarios get 900 s) and yields to the event loop while it runs, so the page and bridge never hang.

## Proof it works (measured on this machine, RTX 4090, headless Chrome)

- **`selftest`: 84/84** (honest: only `true` passes): **zoom** (five levels; squads still arrive from out of sight at the widest, shadows reach the edge, under 150 draw calls), state, step, teleport, weather, day/night, gunfight + gore, weapons, dialogue, data-only NPC, Whaler drive, harpoon, exit, roof cutaway, positional audio, blood soak / head pop / footprints, **every building interior and NPC home walkable** (no room is ever locked off), **doors and windows on the player's own keys** (a closed door swings open for you and for a drifter; a door shoved open at a run knocks down whoever is behind it; a locked door holds you and the AI until 2-3 loud kicks; glass cracks, then shatters under fire and stops stopping rounds; held E boards a broken window and the boards block sight and a round; walking into a broken window climbs it, a dive goes straight through glass), `moveTo id=` reaches a vehicle/NPC promptly, vehicle part damage, seats, motorcycles, throwables, dive/crouch, terrain, water + diving, flooding cars and boats, the train, convoys, the HUD feedback layer (`hud`), ambient details (`ambient`, `honk`), photo mode (`photo`), the **NaN sentinel** (poisoned positions heal, the report names the phase), cars turn about the rear axle, save/load rebuilds the infected's pace, **world memory** (the chronicle ring + tally, witness ranges by day and night, a witnessed killing reaching the victim's people, a silenced witness, standing deciding who shoots on sight, the unwitnessed night kill, a lawful witness raising stars, society save/load, a remembered killing that closes a shop and starts a vendetta, a shooting Rosa hears about from the road, the director sending hunters and the radio reading the chronicle on air, the morning digest reading yesterday's dead and a witnessed jump back), survival (thirst wears in pips, slows stamina, a found bottle drunk with V fixes it), **rest and sleep** (hours awake tire you into sway and microsleeps that take the screen and the hands, a bed refills you while the night runs x40, one of the infected walking up wakes you), **bite fever** (a landed bite starts 36 game hours of taxes: stamina regen x0.75, hunger x1.3; antibiotics then a full night break it; untreated it passes and never kills), the **inventory** (a found bottle rides in the pack, V drinks from it, a tin needs a blade, packs swap; the dead are searchable with the same loot every time; what you carry weighs; a shopkeeper who watches you take from her shelf remembers it; lockpicks open a locked door silently, a crowbar loudly), **rounds and guns as things** (a reload takes rounds out of the pack and the weight drops by exactly theirs, what will not fit lands at your feet, an old save's numbers become rounds; a dead soldier leaves his rifle and spare rounds, slung it is in your hands loaded as it lay, it stows in a trunk unchanged, a worn gun jams and its trigger goes dead until R clears it, a kit cleans, broken will not fire until the gunsmith), **trade** (at Ike's shelf with Ike there taking is buying at neutral prices with no theft, he buys a wrench and refuses a photograph, hostile he will not deal, gone there is no counter), skills and carry weight, the garage (plate that stops rounds until breached, weight that slows, the hood gun, an oil slick), the faction sim (ten days off-screen, a night raid beaten off), the ATV, **jumps** (Wreck Row at 40 mph lands clean on its deck, pays and gets talked about; too slow meets the deck's face, too fast flies past it; a dune is a bump at a crawl and air at speed; kicker sides are solid; people stand on dirt), **the military base** (the chain-link stops you on foot and a car but not sight or a round, the way in is the gate; a sentry warns you once inside the wire and the post opens fire if you stay, a Remnant-friendly player is waved through, a shot inside brings it down at once; the armory is a locked steel door whose crates roll `military` loot, and no home or shop table claims a container inside the wire; the patrol truck and the armored carrier spawn and drive; the searchlights sweep and a sentry sees you further in a beam than in the dark), A* path, objective, burning vehicle, save/load, perf budget, **no runtime errors**.
- **`scenario name=stress`** (2026-10-22, with doors and windows): 160 characters, **68 draw calls**, 2.4 ms/frame, the same as the build before them in an A/B (fresh pages, the other tab silenced, 8 rounds each: average 2.40 vs 2.40, median 2.39 vs 2.36). On a busy machine the number drifts (2.0 to 4.4 over one afternoon): compare against the old build in the same hour, never against this line. With the military base (same machine, same hour, one instance, 4 fresh pages each way): **69.25 draw calls, 2.11 ms/frame** against 68.75 and 2.22 with the base's soldiers and vehicles taken out first (its meshes are out of view there; the one call it adds anywhere is the rifle model).
- **`bench` in a night acid storm with a full cast of characters, 19 vehicles and an active firefight:** 5.9 ms/frame at 1080p (~170 fps), **43 draw calls**, about 278k triangles, about 2.2 ms simulation. That's with the full character models; hidden variants are packed out and small parts skip the shadow pass.
- **Pathfinding:** a 535 m cross-map foot route takes 1.8 ms, and 400 m routes take under 1 ms.
- **`scenario name=bounty-run`: an agent plays the main quest end to end** using only public commands (no god mode, no teleport, no exec). It walks to the sheriff, takes the job, buys ammo from Ike, drives the Whaler to raider camps, rams and shoots six Dustwolves, swaps wrecked cars, returns, and gets paid $250. That's about 30–100 s of real time for 7–12 in-game minutes. **13 of 15 valid runs completed the whole quest (87%) across the two final batches.** Every run logs why each walk stopped; all stops were the intended interrupts (`under fire`, `player died`). There were 0 timeouts, 0 path failures and 0 runtime errors. Of the two failures, one was a dead end (the player ran over the sheriff), fixed since by `essential` quest givers, and the other was a lost firefight. The run log reads like a play-by-play.

## Look & feel

- **People:** instanced low-poly humans (rounded torso, hips, sphere head with a readable face, capsule limbs with hands and boots), 5 hat/hair styles (short, cap, cowboy, mohawk, wrap) and 3 gear styles (vest, backpack, spiked raider pads) picked per faction. They aim two-handed, sway when walking, lean when running. Around 19 draw calls cover all 160 people.
- **Vehicles:** beveled bodies, cylinder wheels with hubs, tinted glass, ram spikes and a harpoon turret on the Whaler, head and tail lights. Paint chars as the vehicle takes damage, it smokes at low HP, burns for 4 s, then explodes.
- **Gore:** directional blood spray, growing pools, exit splatter, drip trails from the wounded, clothes that soak through with damage, bloody footprints after walking through a pool, gibs on run-overs and explosions, head pops (explosion, point-blank shotgun, harpoon yank) with an arterial neck spray, and a dragged-body trail on the harpoon.
- **Interiors (`systems/interiors.js`):** every enterable building hangs real door leaves (a shop's double front door, single back and inner doors; wood or steel) that swing when walked or driven into, keep their angle, and stop sight and rounds while near closed. Shoved open fast, a leaf knocks whoever is behind it flat on their back for a moment (`doorBash`). Locked doors wear a rust-orange chain across the frame. Windows are notches down to a knee-high sill with clear glass on the car glass's crack shader: rounds crack it, then shatter it into a rim of shards and glitter on the floor; boards are crooked planks on the side they were nailed from. The infected claw at glass and boards and batter locked doors. One InstancedMesh each for leaves (plus chains), panes and boards (+3 draw calls); only doors near the player are simulated.
- **Military (`systems/bases.js`, rows in `data/bases.js`):** OUTPOST NINE is one merged mesh (walls, floors, towers, furniture, props), one roof batch (each building's roof hides when you walk in), one alpha-tested chain-link mesh, and two additive light batches (searchlight pools and beams, floodlight pools) hidden by day and culled when the base is out of view: 68-69 draw calls in the yard by day, 71-74 at night, and 1 extra (the rifle model) anywhere else. Razor wire coiled along the fence, towers with an open deck so you can see the sentry, a burned-out helicopter on the helipad, sandbags, jersey barriers, the old flag. The soldiers wear helmets, vests and faded olive and tan, and carry the SERVICE RIFLE; the PATROL TRUCK has a roof ring with a standing gunner, the ARMORED CARRIER eight wheels, a turret hatch and armoured vision slits.
- **Sound (synthesized, no files):** stereo-panned by screen position, distance falloff that also dulls the high end, per-weapon reports, near-miss whizzes, ricochets, footsteps by surface (sand/road/floor), a 5-gear engine, rain and wind beds, thunder, crashes, skids, horns. `perf.audio.played` counts what was played, so headless runs can verify sound.

## Robustness features for agents

- **The game never freezes on a bug:** the real-time loop and `step` catch per-frame exceptions, keep running, and record them in `perf.runtimeErrors` and as `error` events. `selftest` fails if any occurred.
- **Compile errors are visible:** a file that fails to parse shows up in `status.recentErrors` with file:line:col, even though the page can't load it.

- **One active tab:** if several game tabs are open, the newest one gets the commands and the rest stand by (`status` shows `tabs` and `activeTab`).
- **Page errors are reported:** syntax errors and crashes in the page are forwarded to the bridge and appear in `status.recentErrors` and in 503 replies, so a broken edit never shows up as just "no game tab".
- **Code edits keep your place:** a full-page reload in dev snapshots and restores the game state (position, inventory, quests, time, every entity).
- **`?scenario=<name>` in the URL** runs a scenario on load. `?agent=1` skips the title screen.

## Player QOL (also exposed to agents)

Doors and windows on **E** (when nobody to talk to and no car is in reach): kick a door (a locked one takes 2-3), smash glass, tap to climb through a broken window or hold to board it up (hold again on the boards' side to pull them off); sprint into a door to bash it open, dive into a window to go through it. Objective tracker with GPS distance, gold route on the minimap, full map (**M**) with click-to-waypoint, pause menu (**Esc/P**) with difficulty (story/normal/hard), volume, render scale, shadows, auto-reload, aim assist and perf overlay (all saved), quick save/load (**F5/F9**), hit and kill markers on the reticle, a highlight ring under whatever **E/F** will act on, out-of-combat health regen to 60%, vehicles that burn for 4 s before exploding, respawn on the clinic doorstep.

## The four ways to extend it, cheapest first

1. **Content pack (no code).** Drop a JSON file in `content/`. It loads at boot. See `content/example-pack.json`.
   ```json
   {
     "weapons":  { "nailgun": { "name": "NAIL REPEATER", "dmg": 11, "rate": 0.05, "mag": 60, "auto": true, "ammo": "smg", "sound": "smg" } },
     "vehicles": { "rat_rod": { "base": "buggy", "name": "RAT ROD", "maxSpeed": 48 } },
     "npcs":     [ { "x": 36, "z": -64, "def": { "id": "carmen", "name": "Carmen", "flag": "PR", "start": "hi", "nodes": { "hi": { "text": "...", "choices": [ { "t": "Buy ($90)", "cost": 90, "give": { "weapon": "nailgun" }, "next": "sold" } ] } } } } ],
     "spawns":   [ { "kind": "raider", "x": 300, "z": 300, "count": 4 } ],
     "vehicleSpawns": [ { "type": "rat_rod", "x": 44, "z": -60 } ],
     "startingKit": { "cash": 100 }
   }
   ```
   Declarative dialogue effects on a choice: `cost`, `give:{cash,ammo,weapon}`, `setQuest:{k:v}`, `ifQuest:{k:v}` (show only if), `weather:"STORM"`, `toast:"text"`, `next:"node"` / `end:true`. Check load errors with `node tools/dl.mjs exec code=game.contentReport`.
2. **Runtime registration.** `registerWeapon`, `registerVehicle` and `registerNpc` take the same schemas, live, no reload. Good for prototyping before you write the pack.
3. **Scenario.** `src/scenarios/<name>.js` exports `default async (DL, game) => summary`. Run it with `node tools/dl.mjs scenario name=<name>` (`name=list` lists them). Use these for repeatable setups, demos and regression checks. Included: `highway-heist` (the harpoon proof of concept), `night-raid`, `stress` (perf).
4. **Engine code.** Read the architecture map below first, and keep the invariants.

## Coordinates & conventions

- Units are metres. The ground is the XZ plane, +Y is up. **+x = east (screen right), +z = south (screen down).** The camera looks straight down with north at the top.
- Heading/facing is in radians: `0` faces +z (screen down) and `π` faces −z (screen up). Forward is `(sin h, cos h)`.
- For `drive`, `steer` +1 turns left on screen and −1 turns right. `throttle` −1 brakes, then reverses.
- Entity ids: characters `c<N>`, vehicles `v<N>`. The player is `c1` (or `player`). Named NPCs also answer to their npc id (`okonkwo`, `reyes`, `ike`, `kenji`, `mags`, `saoirse`, `tomas`, `vo`) or their full name. `id=hostile` resolves to the nearest enemy.
- World map: `node tools/dl.mjs map`. Roads run every 80 m on −320..320. Route 66 is `z=0` and crosses the whole map. Rust Haven (walled town) is `|x|,|z| < 88`, Phoenix ruins are out to ~250, and beyond that is the Glass Flats desert, where the 6 raider camps sit.
- Set-pieces beyond the grid: **mesas/buttes/ridges** ring the desert at 350–440 m (solid, routed around). The **river** runs north–south on the east edge (x≈410–428) into **the lake** (390, 398, 7 m deep) with a **dock** at (360, 382) and the **Route 66 bridge** at x=416. The **Iron Line** railway runs north–south at **x=−360**: Dust Bowl Station at z=110, a level crossing on Route 66 (z=0). A freight (`train`) cycles every couple of minutes; **Dustwolf convoys** (`convoy`) cross on Route 66 every ~3–5 minutes.
- Jumps (`stunts`, rows in `src/data/stunts.js`): **the Thrill Show** in the open strip east of the x=320 road, just south of Route 66 (x 330–400, z 13–76): **Wreck Row** (z=28, a steel kicker, five wrecks side by side, a landing deck 25 m on; ~40 mph at the lip lands clean), **the Table** (z=58) and **the Whoops** (z=70), bleachers, whitewashed-stone letters. **The Dunes** in the south-west Glass Flats (x −310..−250, z 250..310): wind-built mounds with slip faces to the east. `stunts run=wreckrow speed=18` drives a car at a jump and reports the landing.
- The military (`base`, rows in `src/data/bases.js`, docs/design/WEB_MILITARY.md): **OUTPOST NINE**, the Federal Remnant's fenced post in the north-west Glass Flats, fence x −324..−260, z −427..−367, the gate at x −304 on its south run, a gravel spur north from DEAD MAN RD (z −320). Twelve soldiers (the gate, two doors, the motor pool, four tower decks, three on patrol), a locked steel armory door, a PATROL TRUCK and an ARMORED CARRIER in the motor pool. Walk in and a sentry warns you once; stay six seconds or fire a shot and the post opens fire (a Remnant-friendly player is waved through).

## Time, determinism & hidden tabs

- The realtime loop runs on `requestAnimationFrame`, which **stops when the tab is hidden**. Agents should advance the sim with **`step seconds=N`**: fixed 60 Hz, it runs in any tab state and returns the new state plus the events that happened.
- `moveTo`, `fire`, `drive` and `harpoon` step the sim internally, so they're blocking actions that return outcomes.
- `screenshot` renders at a fixed 1280×720 regardless of window size. It captures the world only; the DOM HUD isn't in it. To see the HUD, use a real browser screenshot.
- Randomness: world layout and initial population are seeded (identical every boot). Combat spread and AI choices use `Math.random`.

## Architecture map

```
src/
  engine/nav.js        NavGrid: rasterised occupancy (centre-test, per agent radius) + A* with string-pulling
  ui/qol.js            objective/GPS, big map, pause menu + settings, quick save/load, hit markers, interact ring
  main.js              Game class: boot, population, player control, camera, rules (wanted, kills, respawn), loop
  engine/
    collision.js       StaticWorld: AABB spatial hash. resolveCircle(), raycast(), lineOfSight(). Zero-alloc.
                       Door leaves and windows are `op` entries in the same hash (handed to systems/interiors.js);
                       a wall with windows stays one box whose openings are `holes` only rays use.
                       Ray modes: SOLID (throws, harpoon), SIGHT (lineOfSight: through glass), BULLET (stopped by glass)
    input.js           keyboard/mouse state (pressed-this-frame semantics)
    rng.js             seeded RNG + lerp/smoothstep/angleLerp
  world/
    city.js            procedural map: roads, districts, buildings (enterable = wall segments + door gaps
                       + window notches + hideable roof instances), props, lamps, camps, minimap image. All instanced.
                       Emits the door and window ROWS (pos, axis, width, hinge, material, locked; window state)
                       from their own seeded stream, so the rest of the world never moves.
    textures.js        every texture, painted on canvas at boot
    terrain.js         mesas/buttes/ridges: one merged faceted heightfield mesh + row-merged collision
    water.js           river + lake depth field, shoreline, bridge/dock, dry|wade|swim states
    rail.js            the railway line, station and crossings (shared by world gen and the train)
  systems/
    sky.js             time of day, sun/moon light, fog, WEATHER table, rain/dust/ash particles, lightning
    fx.js              blood/sparks/smoke particles, decals (pools, splats, skids), tracers, flashes, pooled lights
    characters.js      Character data + CharacterRenderer: one articulated body (two-segment limbs, IK feet and
                       hands, a model per weapon), left+right limbs packed, variants packed per wearer
    combat.js          WEAPONS table, hitscan, damage, death
    ai.js              on-foot AI: faction hostility (toward the player: faction standing), scan,
                       fight/strafe/flee/wander, crowd separation, `hold` (stand still)
    society.js         world memory facade: day count, places, hourly standing decay, save/load
    chronicle.js       512-record ring of what happened + tally + legend + day digests
    factions.js        faction rows, standing/tiers toward the player, relations matrix (typed arrays)
    deeds.js           deeds, the witness pass, the rumor pool, witness-gated wanted stars
    memory.js          named people's memories of you: opinion, refusals, vendettas, barks, kin and friends
    director.js        event director: hunters, raids, dead_draw_dead, radio news; pacing, cooldowns, outcomes
    factionsim.js      the world without you: strength/stores, place yields and upkeep, daily skirmishes, camps changing hands
    vehicles.js        VEHICLES table (cars, bike, boats), arcade driving model, collisions, run-overs, traffic/raider/convoy AI, harpoon
    inventory.js       items in containers (data/items.js): what you carry (pockets + the worn pack), trunks, the dead, ground
                       piles, every crate and shelf in a building (shopkeepers own theirs: taking is a steal deed), rolled from
                       seeded loot tables on first open; uses, spoilage on the game clock, tools, lockpicks/crowbar on locks;
                       rounds are items (g.inv.ammo is a view onto the carried list: bindAmmo), guns carry condition, wear,
                       jams (shot/cleared), stow/sling/gainGun, the dead keep their guns (armBody), the gunsmith's quote
    trade.js           a trader's own shelves are the counter while they're there: worth x the standing tier, buy/sell/sellGun,
                       refusals, the trade deed, daily restock (docs/design/WEB_TRADE.md)
    bases.js           military bases (data/bases.js), built before the nav grids: a merged mesh, a roof batch, the chain-link,
                       two light batches; a see-through fence; door/window rows for interiors.js; boxes on the military table;
                       soldiers on posts, tower decks and patrols; the trespass rule (warn, grace, alarm, stand-down); save/load
    stunts.js          jumps: the ground's relief (kickers, berms, tables from data/stunts.js), ride-height springs, flight, landings
                       graded by closing speed (clean/rough/hard/crash), named jumps that pay and are told about, blob shadows
    vehicledamage.js   per-part dents, scraped paint, detached panels, tyres/engine/tank effects you feel at the wheel
    seats.js           front/back/bed seats, boarding, seat cycling, allies who take the wheel (chauffeur)
    carcombat.js       windows (crack/shatter), shooting from windows, people hanging on, zombies breaking in
    interiors.js       building doors (swing, bash + knockdown, locks, kicks, nav blocking), windows (glass,
                       climbing through, boards); collision/sight/bullet hooks for the StaticWorld; save/load
    zombies.js         the infected (shamblers, sprinters): herds, noise attraction, night spawner, car attacks
    throwables.js      frags, molotovs (fire spreads along fuel leaks), smoke, flashbangs, sticky bombs, arcs + cooking
    train.js           the Iron Line freight: schedule, station stop, crossing lights/barriers, roof riding, tanker
    convoy.js          Dustwolf war convoys: formation driving, break-to-engage, gun-truck gunner, loot hauler
    audio.js           synthesized WebAudio (guns, explosions, thunder, rain, engine)
  ui/
    hud.js / hud.css   the stamped-steel HUD (target: docs/design/hud-target-2026-10-22.jpg): clock/weather/wanted
                       plate, faction respect chips, licence-plate cash, GPS bezel minimap, street sign, health/stamina
                       plate + food/water gauges (shown only when g.needs exists) + cloth flag, weapon plate (cartridges,
                       dog tags, throwable) or the analog dash when driving, toasts, vignettes. Change-only DOM writes.
    hudart.js          every HUD texture (plates, paper, sign, bezel, gauge faces, flags, sprites) painted once at boot
    dialogue.js        dialogue panel: typewriter, numbered choices
    inventory.js       the PACK screen (I / Tab): what's on you beside the other side (trunk, box, body, ground); V quick-use
    portrait.js        procedural portraits + real flag drawings (FLAGS table)
  data/npcs.js         named NPCs + dialogue trees, ambient barks, name lists
  data/society.js      verbs, tiers, memory kinds and the built-in factions (Rust Haven, the Dustwolves, drifters, the infected)
  data/events.js       director event templates: numbers and radio lines
  data/items.js        every carryable thing (weight, litres, uses, spoilage, what using it does), loot tables, the start kit;
                       rounds and guns (AMMO_ITEM, GUN_ITEM), gun wear and jams (GUN_WEAR, GUN_CARE), what the dead carry (GUN_FOUND)
  data/trade.js        who trades in what (TRADERS), prices by standing tier (PRICE_TIER), reach/restock/deed pacing (TRADE)
  data/camera.js       the play camera's five zoom levels (heights on foot and driving, speed lift, follow rates); spawners and
                       clean-ups read g.viewR (the ground on screen) so "out of sight" holds at any zoom
  data/stunts.js       ramps, sites (the Thrill Show, the Dunes), props, named jumps, and the jump tuning (gravity, springs' limits, landing lines)
  data/bases.js        military bases as rows: fence, gate, towers, buildings (doors, windows, furniture), props, boxes, posts,
                       patrols, parked vehicles; the trespass and searchlight tuning (BASE_RULES), the sentries' lines
  data/interiors.js    door materials (wood|metal: kicks, lock hp, colours), door physics, window numbers, boot-time mix
  agent/
    api.js             THE agent API: COMMANDS table (single source of truth), selftest
    bridge.js          browser long-poll client for the HTTP bridge
    content.js         loads content/*.json packs through the API at boot
  scenarios/*.js       scripted setups (DL, game) => summary
vite.config.js         dev server + agent HTTP bridge (/agent/cmd, /agent/status)
tools/dl.mjs           CLI     tools/gen-commands.mjs  regenerates docs/COMMANDS.md
tools/agent.mjs        npm run agent: dev server + headless Chrome/Edge (DL_HEADED=1 to watch)
tools/mcp-server.mjs   zero-dependency MCP stdio server (registered in .mcp.json)
content/*.json         data-only content packs
```

Update order per frame (`Game.frame`): door leaves (swing, bash) → player → AI → bases (sentries, the trespass rule, searchlights) → society (rumors, decay) → vehicles (drive, collide, harpoon) → population → dialogue → fx → pickups → interior/roof → camera → sky → lights → character instancing → audio → HUD.

## Invariants (don't break these)

1. **Performance budget: under 150 draw calls** for the whole scene (currently ~50–80). Anything with more than a handful of copies goes in an `InstancedMesh` or gets merged (`mergeGeometries`). Never create a `Mesh` per bullet, particle, decal or character. Check with `node tools/dl.mjs perf` and `scenario name=stress`.
2. **No per-frame allocation in hot loops.** Reuse module-level `Vector3`/`Matrix4`/`Object3D` scratch objects, as the existing systems do.
3. **Fixed light count.** Dynamic lights come from the 4 pooled point lights in `fx.js`. Adding or removing lights at runtime recompiles every shader. Fake light with additive ground decals (`radialGlow`, `coneTexture`), the way lamps and headlights do.
4. **Every new command goes in `COMMANDS`** with `group`, `desc` and `args`. It must return plain JSON and use `need()` for errors with a useful message. Then regenerate `docs/COMMANDS.md`.
5. **Content as data.** New weapons, vehicles, NPCs and weather are rows in their tables or JSON packs, not new code paths.
6. **Art direction:** dusty post-apocalyptic palette (rust, sand, bone, gold). **Never purple** (hues ~270–320 are banned). Every person shown in UI (portraits, dialogue) shows their **country flag** as a real drawing (`ui/portrait.js` `FLAGS`), never emoji letters.
7. **Run `node tools/dl.mjs selftest` after engine changes.** It must stay green. Add a check there when you add a system.
8. **IP hygiene: borrow mechanics, never names.** The game is fan service for GTA2, Autoduel, Project Zomboid, We're Alive, 28 Days Later and the Deathlands novels, so their verbs, loops and genre shapes are fair game; their titles, coined slang, characters and catchphrases are not. `node tools/ip-lint.mjs` scans every player-facing string and must report **0 deny** before a commit. A deliberate exception goes in `tools/ip-allow.json` with a reason. Canon names come from `docs/DIVIDED_STATES.md` (scrip, holdouts, Carousel Stations, the 50 rulers).

## Verification loop for agents

```bash
node tools/ip-lint.mjs                          # no borrowed names in player-facing text
node tools/dl.mjs selftest                      # systems still work
node tools/dl.mjs scenario name=stress          # msPerFrame + drawCalls
node tools/dl.mjs scenario name=highway-heist   # set the scene
node tools/dl.mjs screenshot --out /tmp/a.jpg   # then actually look at the image
```
