# Claude AI Development Guide for CarWorld

**Last Updated:** 2026-07-04
**Project Status:** 🚨 PIVOTED TO 3D — DRIVN Engine (see `docs/ENGINE.md`)
**AI Setup:** ✅ Complete (Godot MCP + Context7 + PixelLab)

---

## 🚨 THE PIVOT (2026-07-04) — READ FIRST

The 2D sprite game hit its ceiling ("can't see, cars don't move right"). On 2026-07-04 we
built `game/proto3d/` — a **Godot 3D** vertical slice with real `VehicleBody3D` physics,
top-down zoom camera, binoculars, in/out of cars, and an enterable two-story safehouse.
The user played it and confirmed: **this is the direction.**

- **Mainline is now the 3D engine.** Master spec: `docs/ENGINE.md` (DRIVN Engine — 7 systems,
  milestones M1–M7 with acceptance tests). Work happens as /goal loops per milestone.
- **The 2D game is the systems donor**, not dead code: economy, contracts, heat,
  save/load, dialogue, netcode all port into 3D.
- **Vision:** Autoduel × GTA2-modern in the world of Deathlands. Compressed-country USA,
  vision-cone perception (Project Zomboid-informed), data-driven everything — vehicles
  from bicycles to 18-wheelers to tanks, dogs, doors, forts.
- **Iron rule learned:** headless tests must exercise the REAL path (the stairs bug shipped
  because the test teleported instead of walking). Every milestone ends with input-driven
  sim proof + a hands-on build for the user.
- Run the slice: `Godot --path game res://proto3d/proto3d.tscn` · physics proof:
  `res://proto3d/tests/drive_sim.tscn` · gameplay proof: `res://proto3d/tests/walkthrough_sim.tscn`
- **3D gotchas already paid for:** positive `engine_force` pushes +Z (forward drive needs
  negative); new `class_name` scripts need a `--headless --import` pass before headless tests;
  wheel damping = `k*2*sqrt(stiffness)` (k: 0.25 comp / 0.4 relax); Control nodes under
  CanvasLayer need `offset_*` after anchors preset, never raw `position`.

---

## 🎯 Project Overview

**CarWorld** is a top-down vehicular combat + survival game inspired by Autoduel (1985),
GTA2, and the Deathlands novels. Built in **Godot Engine 4.5+** using **GDScript** —
now in **3D** (low-poly, top-down camera).

**Genre:** Open-country survival — extraction roots, growing toward persistent multiplayer world
**Setting:** Post-apocalyptic America, 2030+
**Core Loop:** Town → Drive the interstates → Exit anywhere → Loot/Survive on foot → Extract or Die → Upgrade

---

## 🛠️ AI Development Environment

### MCP Servers Configured ✅

1. **Godot MCP** (`ee0pdt/Godot-MCP`)
   - Location: `C:\git\carworld\godot-mcp\`
   - Plugin: `C:\git\carworld\game\addons\godot_mcp\`
   - **Status:** Installed, plugin must be ENABLED in Godot Editor
   - **Capabilities:** Scene creation, script editing, project inspection

2. **Context7** (`@upstash/context7-mcp`)
   - **Status:** Active
   - **Purpose:** Persistent memory across sessions
   - **Use:** I will remember project decisions and patterns

3. **PixelLab** (API: `https://api.pixellab.ai/mcp`)
   - **Status:** Configured with API key
   - **Purpose:** AI-powered pixel art generation
   - **Use:** Generate sprites, tilesets, icons on demand

### Documentation Files
- `MCP_SERVERS_COMPLETE.md` - Full MCP setup guide
- `GODOT_MCP_SETUP.md` - Godot MCP specific docs
- `PRD.md` - Product requirements document
- `FEATURES.md` - Current feature list (Phase 6)
- `TECH_STACK.md` - Complete architecture overview
- `PLAYER_GUIDE.md` - Controls and gameplay loop

---

## 📁 Project Structure

```
C:\git\carworld\
├── game/                          # Main Godot project
│   ├── project.godot              # Godot config
│   ├── addons/                    # Plugins
│   │   ├── godot_mcp/            # ⏳ MUST BE ENABLED
│   │   ├── dialogue_manager/     # ✅ Active
│   │   └── tile_bit_tools/       # ✅ Active
│   ├── scenes/                    # Game scenes
│   │   ├── levels/test/test_driving.tscn  # ← MAIN SCENE (entry point)
│   │   ├── hud/                   # UI elements
│   │   └── menus/                 # Menu screens
│   ├── scripts/                   # GDScript code
│   │   ├── autoloads/            # Singleton managers
│   │   │   ├── Globals.gd        # Global vars
│   │   │   ├── GameState.gd      # Game state
│   │   │   ├── DataManager.gd    # Save/Load
│   │   │   └── SceneManager.gd   # Scene transitions
│   │   └── Const.gd              # Constants
│   ├── systems/                   # Core systems
│   │   ├── road_manager.gd       # Infinite road generation
│   │   ├── encounter_director.gd # Enemy spawning
│   │   └── time_system.gd        # Game time
│   └── entities/                  # Game objects
│       ├── vehicles/              # Player/enemy vehicles
│       └── components/            # Reusable components
├── godot-mcp/                     # MCP server (don't edit)
└── docs/                          # Documentation
```

---

## 🎮 Current Game State

### ✅ Implemented Features (Phase 6)

**Core Gameplay:**
- ✅ Extraction-based survival loop
- ✅ Infinite procedural road generation (chunk-based)
- ✅ Three vehicle types (Scavenger, Interceptor, Behemoth)
- ✅ Arcade-sim driving physics with drift
- ✅ Vehicle damage and destruction
- ✅ Heat system (attracts enemies)

**Systems:**
- ✅ Loot cache spawning and scavenging
- ✅ Breakdown mechanic with repairs
- ✅ Enemy AI (Rammer, Blocker behaviors)
- ✅ Garage/upgrade system
- ✅ Save/load persistence
- ✅ HUD with speed, heat, armor display
- ✅ Run summary screen

**Controls:**
- ✅ Keyboard + Gamepad support
- ✅ Analog trigger support
- ✅ Help overlay (F1)

### 🚧 Known Issues

1. **On-foot mode** - Not fully implemented (can exit vehicle but limited functionality)
2. **Weapons system** - Designed but not integrated
3. **Towns/buildings** - Limited implementation
4. **Multiplayer** - Planned but not started

---

## 📋 Next Development Priorities

**⚠️ SUPERSEDED by `docs/ENGINE.md` milestones M1–M7.** Current priority: **M1 Feel Core**
(stairs fix, interact-prompt UI, doors+locks, binoculars v2 mouse-aim, world-edge fix,
off-road ground detail, dive). The Phase 7 list below is the OLD 2D plan, kept for
reference while its systems get ported into 3D.

### Immediate Tasks (Phase 7 Start — LEGACY 2D)

1. **Weapon System Integration**
   - Add weapon mounting points to vehicles
   - Implement firing mechanics (machine gun, rockets, flamethrower)
   - Add recoil physics
   - Create weapon pickup/equip UI

2. **On-Foot Enhancement**
   - Full character controller when exiting vehicle
   - Building entry/exploration
   - NPC dialogue system (using dialogue_manager addon)
   - Foot combat basics

3. **Town System Expansion**
   - Create garage scene with vehicle customization UI
   - Add shop NPCs
   - Mission board for side quests
   - Safe zone boundaries

4. **Enemy Variety**
   - Add weapon-equipped enemy vehicles
   - Boss encounters (convoys, road captains)
   - Ambush scenarios

5. **Art Assets Needed** (Use PixelLab!)
   - Enemy vehicle sprites (raiders, military, gangs)
   - Weapon sprites (guns, missiles, flamethrower effects)
   - Building/town assets
   - Character sprites for on-foot mode
   - Pickup item icons

### Future Phases

**Phase 8:** Multiplayer foundation
**Phase 9:** Story missions and quest system
**Phase 10:** Polish, balance, and release prep

---

## 💡 Development Patterns & Conventions

### Code Style
- **Language:** GDScript 2.0 with static typing
- **Naming:** snake_case for variables/functions, PascalCase for classes
- **Signals:** Use for decoupled communication between systems
- **Comments:** Focus on "why" not "what"

### Architecture Patterns

**Singleton Autoloads:**
```gdscript
# Access global state
GameState.start_new_run()
DataManager.save_game()
```

**Component-Based Design:**
```gdscript
# Vehicles have reusable components
vehicle.add_child(WeaponSystem.new())
vehicle.add_child(SurvivalStats.new())
```

**Signal-Driven Events:**
```gdscript
# Entity emits signals, systems listen
signal vehicle_destroyed(vehicle_data)
signal loot_collected(loot_type, amount)
```

### File Organization
- **Data-driven design:** Use `.tres` resource files for vehicles, weapons, items
- **Scene composition:** Build complex objects from smaller scene components
- **Scripts follow scenes:** `player_vehicle.tscn` → `player_vehicle.gd`

---

## 🤖 How to Work with Claude (Me!)

### Session Start Checklist

When starting a new session:
1. **Check Godot is OPEN** - MCP only works with Godot running
2. **Verify plugin enabled** - Project → Settings → Plugins → Godot MCP
3. **Reference this file** - Ask me to "read CLAUDE.md" to catch up
4. **Use Context7** - I'll remember our previous conversations

### Effective Prompts

**Good Examples:**
```
"Add a machine gun weapon component to the player vehicle following
the existing component pattern in entities/components/"

"Generate pixel art sprites for 3 enemy vehicle types: raider buggy,
military jeep, and gang muscle car. Make them 64x64 top-down view."

"Implement the blocker AI behavior described in PRD.md using the
existing encounter_director.gd spawn system"
```

**Less Effective:**
```
"Make the game better"
"Add enemies"
"Fix the bug" (without context)
```

### Using MCP Capabilities

**Godot MCP Commands:**
- "Show me all scenes in the project"
- "Read the player vehicle script"
- "Create a new weapon scene with Area2D and RayCast2D"
- "List all autoload scripts"

**PixelLab Commands:**
- "Generate a 32x32 health pickup icon"
- "Create a tileset for desert roads"
- "Design a zombie enemy sprite for top-down view"

**Context7 Usage:**
- "Remember that we use arcade physics, not RigidBody2D"
- "What was our decision about the weapon mounting system?"
- "Recall the enemy spawn algorithm we designed"

---

## 🎯 Common Development Tasks

### Adding a New Vehicle Type

1. Create vehicle data resource: `res://data/vehicles/vehicle_name.tres`
2. Define stats (speed, armor, weapon slots, handling)
3. Add sprite (use PixelLab or manual)
4. Register in vehicle selection system
5. Test in test_driving scene
6. Update unlock conditions in Garage

### Creating a New Enemy Type

1. Design behavior (Rammer, Blocker, Shooter, etc.)
2. Generate sprite with PixelLab
3. Create scene extending CharacterBody2D
4. Implement AI script (reference existing enemy scripts)
5. Add to encounter_director spawn tables
6. Balance health/damage/speed

### Implementing a New Weapon

1. Create weapon data resource (damage, fire rate, ammo)
2. Generate weapon sprite/effects (PixelLab)
3. Create weapon component script
4. Add mounting point logic to vehicles
5. Implement firing mechanics (projectiles or raycasts)
6. Add recoil physics
7. Update UI for ammo display

### Building a New Scene Type

1. Plan node hierarchy
2. Use "Create scene..." command via Godot MCP
3. Add required components (collision, sprites, scripts)
4. Connect signals to game systems
5. Test in isolation before integrating
6. Update scene manager if needed for transitions

---

## ⚠️ Important Notes

### Do NOT:
- ❌ (3D/proto3d+) Fake vehicle physics — use `VehicleBody3D`; the bicycle-model era is over
- ❌ (3D) Write headless tests that teleport past the mechanic under test — inputs only
- ❌ (Legacy 2D only) Use RigidBody2D for vehicles (2D code uses CharacterBody2D with custom physics)
- ❌ Create synchronous blocking code (use signals and async)
- ❌ Hard-code values (use Constants or resource files)
- ❌ Ignore the existing component system (extend it instead)
- ❌ Commit the godot_mcp plugin to the repo

### DO:
- ✅ Follow existing patterns in scripts/autoloads/
- ✅ Use static typing: `var speed: float = 100.0`
- ✅ Emit signals for cross-system communication
- ✅ Test in test_driving.tscn before main game
- ✅ Update FEATURES.md when completing major features
- ✅ Use PixelLab for consistent art style

### Performance Considerations:
- Chunk-based world generation (load/unload based on player position)
- Object pooling for frequently spawned entities (bullets, particles)
- Limit collision checks (use collision layers effectively)
- Avoid expensive operations in `_process()` (use timers or `_physics_process()`)

---

## 🐛 Debugging Tips

### Common Issues:

**"Script compilation error"**
- Check static typing matches (GDScript 2.0)
- Verify signal connections
- Look for null reference errors

**"Scene won't load"**
- Check .tscn file dependencies
- Verify all referenced resources exist
- Look for circular dependencies

**"Physics behaving weird"**
- Check collision layers (defined in project.godot)
- Verify CharacterBody2D vs RigidBody2D usage
- Review physics timestep settings

**"MCP not responding"**
- Ensure Godot is OPEN with project loaded
- Check godot_mcp plugin is ENABLED
- Verify WebSocket server started (check Godot console)
- Restart both Godot and Claude Code

---

## 📚 Key Resources

### Documentation
- **Godot Docs:** https://docs.godotengine.org/en/stable/
- **GDScript Reference:** https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/
- **Our Tech Stack:** `TECH_STACK.md`

### Project Files to Reference
- `PRD.md` - Game design vision
- `FEATURES.md` - Current implementation status
- `TECH_STACK.md` - Architecture details
- `scripts/autoloads/Globals.gd` - Global constants and enums

### Example Code Locations
- Vehicle physics: `entities/vehicles/car_controller.gd`
- Enemy AI: `entities/enemies/enemy_vehicle.gd`
- World generation: `systems/road_manager.gd`
- Save system: `scripts/autoloads/DataManager.gd`

---

## 🎨 Art Style Guidelines

**Theme:** Post-apocalyptic, gritty, Mad Max inspired
**Palette:** Desaturated with rust browns, desert yellows, military greens
**Resolution:** 32x32 or 64x64 sprites, pixel art style
**Perspective:** Top-down, slight 3/4 view acceptable

**When generating with PixelLab:**
- Specify "top-down view" or "aerial view"
- Request "post-apocalyptic" or "Mad Max style"
- State exact dimensions (32x32, 64x64)
- Ask for transparent backgrounds for sprites
- Request color palette consistency

---

## 🚀 Quick Start for New Sessions

When you start helping with CarWorld:

1. **Say:** "I'm back to work on CarWorld. Let me read CLAUDE.md to catch up."
2. **Verify setup:** "Is Godot open with the project loaded?"
3. **Check MCP:** "List all scenes in the project" (tests Godot MCP)
4. **Review context:** "What was I working on last session?" (uses Context7)
5. **Get direction:** "What are the next priority tasks from CLAUDE.md?"

### Example Session Flow:

```
User: "Let's add the machine gun weapon system"

Claude:
1. [Reads weapon system requirements from PRD.md]
2. [Checks existing component pattern in entities/components/]
3. [Uses PixelLab to generate machine gun sprite]
4. [Uses Godot MCP to create weapon scene]
5. [Writes weapon component script following patterns]
6. [Integrates with vehicle mounting system]
7. [Adds firing mechanics and recoil]
8. [Updates HUD to show ammo]
9. [Tests in test_driving scene]
10. [Updates FEATURES.md with new feature]

Result: Fully functional machine gun system ready to use!
```

---

## 🎯 Success Metrics

**We're succeeding when:**
- Features work on first run (minimal debugging)
- New code follows existing patterns
- Art assets are consistent with game style
- Changes don't break existing systems
- Sessions are productive and build momentum

**Warning signs:**
- Repeating the same fixes (pattern not learned)
- Breaking working features
- Inconsistent art style
- Overcomplicated solutions

---

## 📝 Session Log Template

Consider using Context7 to remember:

```
"Remember for CarWorld:
- Today we implemented [feature name]
- Key decision: [important choice made]
- Location: [file paths modified]
- Next step: [what to do next]
- Note: [any gotchas or learnings]"
```

---

## 🏁 Ready to Build!

This is a living document. Update it as the project evolves!

**Current Priority:** Weapon system integration (Phase 7)
**Next Big Feature:** Full on-foot exploration
**Long-term Goal:** Multiplayer-ready extraction shooter

Let's make CarWorld amazing! 🚗💥🔥

---

**Remember:**
- Godot MCP requires Godot to be OPEN
- Use Context7 to build project memory
- Use PixelLab for consistent art
- Follow existing code patterns
- Have fun building! 🎮
