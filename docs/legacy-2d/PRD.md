# CarWorld - Product Requirements Document
WE WILL USE GODOT
We need to ID what we want from each

https://github.com/POWERHACK69/2D-Topdown-Movement-and-Car
https://github.com/stesproject/godot-2d-topdown-template

https://github.com/moonbench/2d-vehicles-godot-3


Godot handles single-sprite vehicles perfectly for top-down views by rotating the sprite to match velocity direction, eliminating multi-frame needs for tanks or cars. Add modular guns (side/top/front/back) as child Node2Ds with offsets, firing via signals for machine guns, flamethrowers, or rockets—recoil applies torque/backward force scaled by weapon power. Chunk-based procedural maps use TileMap grids (e.g., 1024x1024px chunks) with FastNoiseLite for highways/buildings from Miami, loading/unloading via player proximity and logs tracking positions for multiplayer sync.[1][11]

## Vehicle Armoring System
Build a data-driven equip system: JSON configs define speed, accel, armor (hit zones: tires/engine), then attach components as child scenes (e.g., MachineGun extends Area2D with shoot_ray()). Destruction Derby-style damage spawns debris physics; tires deflate via velocity multipliers. Motorcycles allow passenger Node2D slots for bazooka gunners, with shared recoil physics.[8]

## Chunk & Multiplayer Architecture
Grid chunks connect seamlessly: server tracks player chunk IDs via RPCs, broadcasting loads (e.g., "player X entered chunk 5,3"). GPS minigame overlays chunk map; dev logs use Godot's console + custom signals. No instancing—persistent world via Resource preloaders. Multiplayer uses ENet with MultiplayerSynchronizer for positions/equips.[12]

## Combat & Prone Mechanics
Foot combat swaps to CharacterBody2D with 8-dir strafing, bullet spread via random velocity cones, kickback as velocity impulse (shotgun: -50px impulse; rocket: -200px directional). Prone state reduces height (scale Y=0.5), enables crawling under cars via RayCast checks, with timers/stats for prone/standup delays. Doors/buildings use Area2D triggers; AI pathfinds but needs prone to enter tight spaces.[2]

## Essential Setup Priorities
| Mechanic | Godot Nodes/Addons | Claude Prompts |
|----------|-------------------|---------------|
| Single-Sprite Vehicle | RigidBody2D + rotation | "GDScript top-down car with modular weapons" |
| Damage/Physics | CollisionShape2D per part | "Vehicle component damage with tire pop" |
| Chunks/Loading | TileMap + VisibilityNotifier | "Procedural chunk loader with player tracking" |
| Prone/Recoil | AnimationTree + Tween | "Player prone state with weapon kickback" |
| Multiplayer Sync | MultiplayerSpawner | "ENet chunk sync for vehicles/players" [13]



## Overview

**Project Name:** CarWorld
**Genre:** Top-down 2D Action RPG / Vehicular Combat
**Inspiration:** Autoduel (1985), Car Wars tabletop game
**Setting:** Post-apocalyptic/dystopian America, 2030+

CarWorld is a modern sprite-based vehicular combat RPG where players navigate a dangerous open world, engage in car combat, explore on foot, and build their reputation across a vast 2D landscape.

---

## Core Concept

A spiritual successor to Autoduel that combines:
- **Vehicular combat** on roads and in arenas
- **On-foot exploration** of towns, buildings, and dungeons
- **RPG progression** with skills, equipment, and reputation
- **Open world** with multiple cities, highways, and wilderness areas
- **Modular 2D tile/sprite system** allowing easy asset replacement

---

## Game Pillars

1. **Freedom** - Players choose their path: courier, arena fighter, vigilante, or outlaw
2. **Customization** - Deep vehicle building and character progression
3. **Danger** - The roads are hostile; every trip is a risk
4. **Exploration** - A large interconnected world with secrets to discover

---

## Core Gameplay Systems

### 1. Dual-Mode Gameplay

#### Vehicle Mode
- Top-down driving with physics-based movement
- Combat while driving (weapons, ramming, evasion)
- Fuel management and vehicle damage states
- Different terrain types affect speed/handling:
  - **Paved roads** - Optimal speed
  - **Dirt roads** - Reduced speed, dust clouds
  - **Off-road/grass** - Slow, risk of getting stuck
  - **Sand/desert** - Very slow, overheating risk
  - **Water/mud** - Impassable or vehicle damage

#### On-Foot Mode
- Exit vehicle at any time (E key or button)
- Explore buildings, houses, bunkers
- Talk to NPCs, shop, take missions
- Limited combat capability on foot
- Vulnerable without vehicle protection

### 2. Vehicle System (Inspired by Autoduel + Racing Destruction Set)

#### Vehicle Types
| Type | Top Speed | Accel | Weight | Armor | Weapons | Notes |
|------|-----------|-------|--------|-------|---------|-------|
| Street Bike | 200 | 10 | 400 | None | 0 | Fastest, fragile |
| Dirt Bike | 140 | 9 | 350 | None | 0 | Good off-road |
| Compact | 160 | 7 | 1800 | Light | 2 | Nimble |
| Sedan | 150 | 6 | 2400 | Medium | 3 | Balanced |
| Sports Car | 190 | 8 | 2200 | Light | 2 | Fast, low armor |
| Muscle Car | 170 | 7 | 3000 | Medium | 3 | Good ramming |
| Pickup | 130 | 5 | 3500 | Medium | 3 | Cargo space |
| Jeep/Buggy | 120 | 6 | 2800 | Medium | 2 | Best off-road |
| Van | 100 | 4 | 4500 | Heavy | 4 | Tanky |
| Semi Truck | 90 | 3 | 8000 | Very Heavy | 5 | Devastating ram |

#### Tire System (from RDS)
Tires affect traction on different surfaces. Higher = better grip.

| Tire Type | Pavement | Dirt | Grass | Sand | Ice | Durability | Cost |
|-----------|----------|------|-------|------|-----|------------|------|
| Street Slicks | 10 | 3 | 2 | 1 | 1 | Low | $ |
| All-Season | 7 | 6 | 5 | 4 | 3 | Medium | $$ |
| Off-Road | 5 | 9 | 8 | 7 | 2 | High | $$ |
| Mud Terrain | 4 | 10 | 9 | 8 | 2 | High | $$$ |
| Snow/Ice | 6 | 5 | 4 | 3 | 8 | Medium | $$ |
| Racing Slicks | 10 | 2 | 1 | 1 | 0 | Very Low | $$$ |
| Armored | 6 | 5 | 4 | 3 | 2 | Very High | $$$$ |

**Tire Damage:** Tires degrade with use. Damaged tires = reduced traction.

#### Engine Types
| Engine | Power | Weight | Fuel Use | Reliability | Cost |
|--------|-------|--------|----------|-------------|------|
| Stock | 100% | Base | Normal | High | - |
| Tuned | 120% | Base | +20% | Medium | $$ |
| Racing | 150% | -10% | +50% | Low | $$$ |
| Diesel | 90% | +20% | -30% | Very High | $$ |
| Electric | 110% | +10% | N/A | High | $$$$ |
| Nitro-Equipped | 100%/200% | +5% | +100% | Medium | $$$ |

#### Other Components
- **Armor:** Front, back, left, right, underbody (independent HP)
- **Weapons:** Machine guns, rockets, mines, oil slicks, smoke screens, flamethrowers
- **Accessories:** Turbo/nitro, targeting computer, fire suppression, ram plate, roll cage

#### Vehicle States
- Pristine → Damaged → Critical → Destroyed
- Individual component damage (tires, engine, weapons)
- Salvageable wrecks on highways

### 3. Character System

#### Attributes (50 points to distribute at start)
- **Driving** - Vehicle handling, speed optimization, crash survival
- **Marksmanship** - Weapon accuracy, reload speed, damage bonus
- **Mechanic** - Repair efficiency, salvage quality, crafting options
- **Charisma** - Better prices, more mission options, faction relations
- **Endurance** - Health, on-foot combat, hunger/fatigue resistance

#### Skills (Unlock with XP)
- Driving: Drifting, Bootlegger Turn, Ramming, Pursuit
- Combat: Dual Weapons, Called Shots, Burst Fire, Explosives
- Technical: Field Repair, Jury Rig, Salvage Expert, Custom Builds
- Social: Negotiation, Intimidation, Faction Reputation

### 4. World Structure

#### Regions (Expandable)
```
[Northeast Corridor]
├── New York City (Starting Area)
├── Boston
├── Syracuse
├── Atlantic City
├── Manchester
└── Philadelphia

[Southeast] (Future expansion)
[Midwest] (Future expansion)
[Southwest] (Future expansion)
[West Coast] (Future expansion)
```

#### Location Types
- **Cities** - Safe zones with shops, arenas, mission boards, garages
- **Towns** - Smaller settlements, fewer services, sometimes hostile
- **Outposts** - Gas stations, rest stops, black markets
- **Arenas** - Combat venues for sport and money
- **Highways** - Dangerous travel routes between locations
- **Wilderness** - Off-road areas with hidden locations, camps, ruins

#### Buildings (Enterable on foot)
- Shops (weapons, parts, general goods)
- Garages (repair, customization, storage)
- Bars (rumors, recruitment, missions)
- Hotels (save game, rest, storage)
- Arena offices (register for events)
- Corporate buildings (story missions)
- Abandoned structures (loot, danger)
- Player housing (upgradeable home base)

### 5. Mission System

#### Mission Types
- **Courier** - Deliver packages between cities (time pressure, ambushes)
- **Escort** - Protect NPC vehicles on dangerous routes
- **Bounty** - Hunt specific targets on highways
- **Arena** - Compete in structured combat events
- **Salvage** - Retrieve vehicles/parts from dangerous areas
- **Story** - Main narrative missions (Mr. Big criminal evidence, etc.)

#### Arena Events
- **Amateur Night** - Free entry, loaner vehicle, small prizes
- **Duel** - 1v1 combat
- **Team Battle** - 2v2 or 3v3
- **Demolition Derby** - Last car standing
- **Race** - Armed racing circuit
- **Gauntlet** - Survive waves of enemies

### 6. Economy

#### Currency
- **Credits** - Standard currency
- **Reputation** - Faction standing affects prices/access
- **Salvage** - Trade-in value for wrecks and parts

#### Income Sources
- Mission rewards
- Arena winnings
- Highway salvage
- Bounties
- Trading goods between cities

#### Expenses
- Vehicle repairs
- Fuel
- Ammunition
- Upgrades and new vehicles
- Cloning/insurance (respawn system)
- Housing and storage

---

## Technical Specifications

### Tech Stack (RECOMMENDED)

```
GAME ENGINE:     Godot


### Visual Style
- **Top-down 2D** with high-quality pixel art sprites
- **Resolution:** 1920x1080 native, pixel-perfect rendering
- **Tile size:** 64x64 pixels (detailed enough for modern displays)
- **Art style:** Detailed pixel art (you generate with AI tools)
- **Camera:** Smooth follow with zoom support

### Tile/Sprite System
```
Tile Size: 64x64 pixels
Sprite Sizes:
  - Vehicles: 128x64 to 256x128 (depending on type)
  - Characters: 64x64 (on foot)
  - Buildings: Multi-tile (defined in Tiled)
  - Effects: Various (particles + sprite animations)

Layers (in Tiled):
  1. Ground (grass, dirt, sand, water)
  2. Roads (asphalt, concrete, dirt roads)
  3. Road Details (lines, cracks, debris)
  4. Buildings/Structures (collision layer)
  5. Objects (trees, rocks, props)
  6. Object Tops (roofs, canopy - rendered above player)

Dynamic Layers :
  7. Vehicles
  8. Characters (players, NPCs)
  9. Projectiles
  10. Effects (smoke, fire, explosions)
  11. UI Overlay
```

### World Architecture
```
World Structure:
├── Overworld (large outdoor map)
│   ├── Cities (safe zones, shops)
│   ├── Highways (combat zones)
│   ├── Wilderness (exploration)
│   └── Points of Interest
│
├── Interiors (separate smaller maps)
│   ├── Buildings
│   ├── Garages
│   ├── Arenas
│   └── Dungeons/Bunkers
│
└── Instanced Areas
    ├── Arena Matches
    └── Story Missions
```

- **Chunk loading:** World divided into 1024x1024 pixel chunks
- **Active area:** 3x3 chunks loaded around player
- **Server authority:** Server validates all movement/combat

 

### Modular Asset System
- All sprites in standardized sprite sheets (TexturePacker compatible)
- Tiled maps in JSON format (easy to edit)
- Vehicle/weapon definitions in JSON:

```json
// vehicles.json
{
  "sedan": {
    "sprite": "vehicles/sedan",
    "frames": { "idle": [0,1], "damaged": [2,3], "destroyed": [4] },
    "physics": {
      "mass": 1200,
      "maxSpeed": 180,
      "acceleration": 120,
      "friction": 0.02,
      "turnRate": 3.5
    },
    "armor": { "front": 100, "rear": 60, "sides": 80 },
    "slots": ["front_weapon", "turret", "rear_drop"]
  }
}
```

- Weapon definitions:
```json
// weapons.json
{
  "machinegun": {
    "type": "projectile",
    "damage": 10,
    "fireRate": 100,
    "spread": 5,
    "ammoMax": 200,
    "projectile": {
      "speed": 800,
      "sprite": "projectiles/bullet",
      "sound": "sfx/machinegun"
    }
  }
}
```

---

## Minimum Viable Product (MVP)

### Phase 1: Foundation (Get Something Running)
- [ ] Project setup  
- [ ] Basic game scene with tilemap loading
- [ ] Player vehicle with Matter.js physics (accelerate, brake, turn)
- [ ] Camera following player
- [ ] Collision with world objects
- [ ] Basic placeholder sprites (can upgrade later)

### Phase 2: Core Mechanics
- [ ] Enter/exit vehicle (E key)
- [ ] On-foot player movement
- [ ] Vehicle weapon system (machine gun fires projectiles)
- [ ] Damage system (vehicles take damage, can be destroyed)
- [ ] Enemy AI vehicles (patrol, chase, attack)
- [ ] Death/respawn system

### Phase 3: Multiplayer
- [ ] Colyseus server setup
- [ ] Player synchronization (see other players)
- [ ] Server-authoritative movement
- [ ] Combat synchronization (damage, deaths)
- [ ] Room management (join/leave)

### Phase 4: World Building
- [ ] City safe zone with NPCs
- [ ] Basic shop UI (buy weapons, repair)
- [ ] Highway zone with spawning enemies
- [ ] Building interiors (door transitions)
- [ ] Minimap

### Phase 5: Game Loop
- [ ] Money/economy system
- [ ] Vehicle garage (buy/sell/customize)
- [ ] Mission board with courier missions
- [ ] Arena combat mode
- [ ] Save/load player progress

### Phase 6: Content & Polish
- [ ] Multiple vehicle types
- [ ] Full weapon variety
- [ ] Sound effects and music
- [ ] UI polish (HUD, menus)
- [ ] More map content

### Phase 7: Future Features
- [ ] Factions and reputation
- [ ] Story missions
- [ ] More regions
- [ ] Electron desktop build

---

## Controls

### Keyboard (Default)
```
Vehicle Mode:
  W/↑ - Accelerate
  S/↓ - Brake/Reverse
  A/← - Turn Left
  D/→ - Turn Right
  Space - Handbrake
  Left Click - Fire Primary
  Right Click - Fire Secondary
  1-4 - Select Weapon
  E - Exit Vehicle
  Tab - Map
  I - Inventory

On-Foot Mode:
  WASD - Move
  Left Click - Interact/Attack
  E - Enter Vehicle/Door
  Tab - Map
  I - Inventory
```

### Controller Support
- Full gamepad support
- Analog steering
- Trigger acceleration/brake

---

## UI/UX Requirements

### HUD Elements
- Speedometer
- Fuel gauge
- Vehicle damage indicator (all sides)
- Weapon ammo counters
- Minimap
- Health (when on foot)
- Current mission indicator

### Menus
- Main menu (New Game, Continue, Options)
- Pause menu
- Inventory/equipment
- Vehicle garage
- World map
- Mission log
- Character stats

---

## Audio Requirements

### Sound Effects
- Engine sounds (varied by vehicle type)
- Weapon fire (distinct per weapon)
- Explosions
- Tire screech
- Metal impacts
- Ambient city/wilderness sounds
- UI feedback sounds

### Music
- Menu theme
- City ambient
- Highway driving (multiple tracks)
- Combat intensity
- Arena theme
- Victory/defeat stingers

---

## Platform Targets

### Primary
- Windows PC

### Secondary (Future)
- Mac
- Linux
- Web (if performance allows)

### Future Consideration
- Nintendo Switch
- Steam Deck optimization
- Mobile (tablet-focused)

---

## Success Metrics

- Complete core gameplay loop playable
- 30+ minutes of engaging gameplay in MVP
- Stable 60 FPS on mid-range hardware
- Positive playtester feedback on driving feel
- Vehicle combat feels impactful and tactical

---

## Open Questions

1. Should permadeath be optional or always include clone/insurance system?
2. Real-time combat vs turn-based arena option?
3. Day/night cycle affecting gameplay?
4. Weather systems?
5. NPC companions/crew members?
6. Base building beyond player housing?

---

## References

- Autoduel (1985) - Core inspiration
- Car Wars (tabletop) - Vehicle construction rules
- GTA 1/2 - Top-down driving feel
- Death Road to Canada - Modern pixel art style
- Mad Max - Aesthetic and tone
- Interstate '76 - Story and atmosphere

---

## Appendix A: Sample Tile Types

```
TERRAIN:
  - asphalt_road
  - concrete_road
  - dirt_road
  - grass
  - sand
  - water
  - rubble
  - parking_lot

STRUCTURES:
  - building_wall
  - building_door
  - window
  - fence
  - barrier
  - guardrail

OBJECTS:
  - tree_small
  - tree_large
  - rock
  - wreck_car
  - fuel_pump
  - sign_stop
  - sign_city
  - crate
  - barrel
```

## Appendix B: Sample Vehicle Definition

```json
{
  "id": "sedan_standard",
  "name": "Road Runner Sedan",
  "class": "sedan",
  "base_stats": {
    "speed_max": 120,
    "acceleration": 8,
    "handling": 7,
    "armor_base": 50,
    "cargo_capacity": 100,
    "fuel_capacity": 40,
    "weapon_slots": 3
  },
  "hardpoints": [
    {"id": "front", "type": "forward", "size": "medium"},
    {"id": "turret", "type": "turret", "size": "small"},
    {"id": "rear", "type": "rear", "size": "small"}
  ],
  "sprite_sheet": "vehicles/sedan_standard.png",
  "price": 5000
}
```

---

---

## Technical Research Findings

### PS5 DualSense Controller Support

PS5 controllers in Godot analog stick controls speed


**Button Mapping (DualSense):**
```
gamepad.A     → X button (confirm)
gamepad.B     → Circle (back)
gamepad.X     → Square
gamepad.Y     → Triangle
gamepad.L1    → Left bumper
gamepad.L2    → Left trigger (analog 0-1)
gamepad.R1    → Right bumper
gamepad.R2    → Right trigger (analog 0-1)
gamepad.leftStick  → Left analog (steering)
gamepad.rightStick → Right analog (camera/aim)
```

**Recommended Plugin? Assets?

**Note:** DualSense-specific features (adaptive triggers, HD haptics) require native code and won't work in browser.

---

### Car Sprite Specifications

**Recommended Dimensions:**
```
Standard Car:  128 x 64 pixels  (2:1 aspect ratio)
Large Vehicle: 192 x 96 pixels  (2:1 aspect ratio)
Motorcycle:    64 x 32 pixels   (2:1 aspect ratio)

Hitbox: Slightly smaller than sprite (90% size)
        Use polygon for angled corners
```

**Tile Alignment:**
- If using 64x64 tiles, car is 2 tiles long × 1 tile wide
- Keep sprites power-of-2 for GPU efficiency

**Rotation Options:**
1. **Pre-rendered rotations:** 8, 16, or 32 direction sprites (simpler, pixel-perfect)
2. **Runtime rotation:** Single sprite rotated by engine (smoother, slight blur)

**Recommended:** Use runtime rotation with Matter.js - it looks good and is simpler.

**Sprite Sheet Format:**
```
car_sedan.png (256 x 64)
├── Frame 0: Normal state
├── Frame 1: Damaged state
├── Frame 2: Critical state
└── Frame 3: Destroyed/wreck
```

---

### Vehicle Physics (Drift/Slide Mechanics)

**Core Technique: Lateral Velocity Cancellation**

The key to realistic top-down car physics:
1. Calculate car's **lateral (sideways) velocity**
2. Apply impulse to **cancel** that sideways movement
3. **Limit** the cancellation impulse = drift!

```javascript
// Simplified drift physics concept
function updateTire(tire) {
    // Get sideways velocity
    let lateralVelocity = getLateralVelocity(tire);

    // Calculate impulse needed to stop sliding
    let impulse = lateralVelocity.scale(-tire.mass);

    // DRIFT: Limit the impulse - excess = sliding!
    let maxLateralImpulse = 2.5; // Lower = more drift
    if (impulse.length() > maxLateralImpulse) {
        impulse = impulse.normalize().scale(maxLateralImpulse);
    }

    // Apply the limited impulse
    tire.applyImpulse(impulse);
}
```

**Tuning Values:**
| Parameter | Value | Effect |
|-----------|-------|--------|
| `maxLateralImpulse` | 3.0 | Grippy, minimal slide |
| `maxLateralImpulse` | 2.5 | Normal handling |
| `maxLateralImpulse` | 2.0 | Wet road feel |
| `maxLateralImpulse` | 1.5 | Ice/heavy drift |
| `frictionAir` | 0.02-0.05 | Air resistance (speed decay) |
| `mass` | 10-20 | Heavier = more momentum |

**Surface Traction System:**
```javascript
const SURFACE_TRACTION = {
    asphalt: 1.0,    // Full grip
    concrete: 0.95,
    dirt: 0.7,       // Some slide
    grass: 0.5,      // Slippery
    sand: 0.4,
    ice: 0.1,        // Maximum drift
    oil_slick: 0.05  // Almost no control
};

// Multiply maxLateralImpulse by traction
effectiveGrip = maxLateralImpulse * currentSurfaceTraction;
```

**Matter.js Setup for Top-Down:**
```javascript
// Disable gravity (top-down view)
this.matter.world.setGravity(0, 0);

// Create car body
this.car = this.matter.add.image(400, 300, 'car');
this.car.setFrictionAir(0.03);  // Speed decay
this.car.setMass(15);
this.car.setFixedRotation(false);  // Allow rotation

// Apply thrust in facing direction
let angle = this.car.rotation;
let force = 0.005;
this.car.applyForce({
    x: Math.cos(angle) * force,
    y: Math.sin(angle) * force
});

// Turn by applying angular velocity
this.car.setAngularVelocity(turnInput * 0.05);
```

---

### Large World - Chunk Loading System

**Approach: Load chunks around player, unload distant ones**

```
World Grid (example):
┌───┬───┬───┬───┬───┐
│ A │ B │ C │ D │ E │
├───┼───┼───┼───┼───┤
│ F │ G │ H │ I │ J │  Player in chunk H
├───┼───┼───┼───┼───┤  Load: C,D,E,G,H,I,L,M,N (3x3)
│ K │ L │[H]│ N │ O │  Unload: everything else
├───┼───┼───┼───┼───┤
│ P │ Q │ R │ S │ T │
└───┴───┴───┴───┴───┘

Each chunk: 1024 x 1024 pixels (16x16 tiles at 64px)
```

**Implementation:**
```javascript
class ChunkManager {
    constructor(scene, chunkSize = 1024, loadRadius = 1) {
        this.scene = scene;
        this.chunkSize = chunkSize;
        this.loadRadius = loadRadius;
        this.loadedChunks = new Map();
    }

    update(playerX, playerY) {
        let currentChunkX = Math.floor(playerX / this.chunkSize);
        let currentChunkY = Math.floor(playerY / this.chunkSize);

        // Determine which chunks should be loaded
        let shouldBeLoaded = new Set();
        for (let dx = -this.loadRadius; dx <= this.loadRadius; dx++) {
            for (let dy = -this.loadRadius; dy <= this.loadRadius; dy++) {
                shouldBeLoaded.add(`${currentChunkX + dx},${currentChunkY + dy}`);
            }
        }

        // Unload chunks that are too far
        for (let [key, chunk] of this.loadedChunks) {
            if (!shouldBeLoaded.has(key)) {
                chunk.destroy();
                this.loadedChunks.delete(key);
            }
        }

        // Load new chunks
        for (let key of shouldBeLoaded) {
            if (!this.loadedChunks.has(key)) {
                this.loadChunk(key);
            }
        }
    }

    loadChunk(key) {
        let [x, y] = key.split(',').map(Number);
        // Load tilemap chunk from file: chunk_x_y.json
        let chunk = new Chunk(this.scene, x, y, this.chunkSize);
        this.loadedChunks.set(key, chunk);
    }
}
```

**Map Creation Workflow (Tiled):**
1. Create full world map in Tiled (can be huge)
2. Use [chunk splitter script](https://github.com/Jerenaux/chunks_tutorial) to split into pieces
3. Each chunk becomes: `chunk_0_0.json`, `chunk_0_1.json`, etc.
4. Game loads chunks dynamically

**Alternative: Tiled Infinite Maps**
- Tiled natively supports "infinite" maps
- Exports chunks automatically in single file
- Godot loads seamlessly

---

### Premade Resources to Use

**Templates & Starter Code:**


https://github.com/POWERHACK69/2D-Topdown-Movement-and-Car
https://github.com/stesproject/godot-2d-topdown-template

https://github.com/moonbench/2d-vehicles-godot-3

**Free Asset Packs:**
????
---

### Multiplayer Architecture (Host + Join)

**Setup for Local Network Play:**
Host runs BOTH server and client
Players only run client, connect to host's IP
```

**Connection Flow:**
1. Host starts   server (port xxxx)
2. Host starts   client, connects to `ws://localhost:2567`
3. Host shares IP address (e.g., `192.168.1.100`)
4. Friends connect to `ws://192.168.1.100:2567`
5. Colyseus syncs all player positions, states, actions

**What Gets Synced:**
- Player positions (x, y, rotation)
- Vehicle states (speed, health, equipped weapons)
- Projectiles (spawn, movement, hits)
- World events (explosions, pickups, NPC actions)

---

## Getting Started (Setup Guide)

### Prerequisites - Install These First

1. **Node.js** (v18 or later)
   - Download: https://nodejs.org/
   - This runs JavaScript outside the browser (for server + build tools)

2. **Visual Studio Code** (recommended editor)
   - Download: https://code.visualstudio.com/
   - Install extensions: ESLint, Prettier, TypeScript

3. need to id a map editor

4. **Git** (version control)
   - Download: https://git-scm.com/

### Project Initialization Commands

```bash
# Create project structure
mkdir carworld
cd carworld

 

### First Run

```bash
# Terminal 1 - Start the game client
cd client
npm run dev
# Opens at http://localhost:5173

# Terminal 2 - Start the multiplayer server
cd server
npm run dev
# Server runs at ws://localhost:2567
```

### Asset Requirements (What You Need to Create)

**Minimum sprites to get started:**
```
sprites/
├── vehicles/
│   ├── player_car.png      # 128x64, 8 directions or rotatable
│   └── enemy_car.png       # 128x64
├── characters/
│   ├── player.png          # 64x64, walk animation (4 frames x 4 directions)
│   └── npc.png             # 64x64
├── projectiles/
│   └── bullet.png          # 8x8 or 16x16
├── effects/
│   ├── explosion.png       # Spritesheet, 64x64 x 8 frames
│   └── smoke.png           # 32x32
└── ui/
    ├── hud_frame.png
    └── minimap_icons.png
```

**Minimum tileset for maps:**
```
tilesets/
├── terrain.png            # Ground tiles (grass, dirt, sand, water)
├── roads.png              # Road tiles (straight, curves, intersections)
├── buildings.png          # Building walls, roofs, doors
└── props.png              # Trees, rocks, fences, signs
```

### Map Creation Workflow (Tiled)

1. Open Tiled
2. Create new tileset from your terrain.png (64x64 tile size)
3. Create new map (start small: 32x32 tiles = 2048x2048 pixels)
4. Paint layers:
   - Layer 1: Ground
   - Layer 2: Roads
   - Layer 3: Buildings (mark collision in properties)
   - Layer 4: Props
5. Export as JSON
6. Place in `client/public/assets/tilemaps/`

### Development Workflow

1. **Make changes** to TypeScript files
2. **Vite auto-reloads** the browser
3. **Test locally** in browser
4. **Generate new art** with AI tools
5. **Drop PNGs** into assets folder
6. **Update sprite configs** in JSON
7. **Repeat**

### Hosting the Server (For Friends to Join)

**Local Network (same WiFi):**
```bash
# Find your local IP
ipconfig  # Windows

# Start server binding to all interfaces
cd server
npm run dev
# Friends connect to ws://YOUR_IP:2567
```

**Over Internet (port forwarding required):**
1. Forward port 2567 on your router
2. Share your public IP with friends
3. Or use a service like ngrok for easy tunneling

---

## Tools & Resources

### Recommended Software
| Tool | Purpose | Link |
|------|---------|------|
| Tiled | Map editor | mapeditor.org |
| Aseprite | Pixel art editor | aseprite.org |
| TexturePacker | Spritesheet packing | codeandweb.com/texturepacker |
| Audacity | Sound editing | audacityteam.org |
| BFXR | Retro sound effects | bfxr.net |

### AI Art Generation Tips
- **Prompt for top-down vehicles:** "top-down view, pixel art, [vehicle type], game sprite, 64x64, transparent background"
- **Prompt for tilesets:** "seamless tileable texture, pixel art, [terrain type], top-down game, 64x64"
- **Consistent style:** Keep same prompt prefix for all assets
- **Post-process:** May need cleanup in Aseprite to fix transparency and align to grid

 
 
