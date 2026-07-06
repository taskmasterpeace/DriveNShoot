# Technical Stack & Architecture

## 1. Engine & Environment
*   **Engine:** Godot Engine 4.5+ (Compatibility Renderer - OpenGL 3).
*   **Language:** GDScript 2.0 (Static typing recommended).
*   **Target Platforms:** Windows (Tested), Linux/Web (Planned support).
*   **Version Control:** SVN/Git structure (Project root at `game/`).

## 2. Core Architecture
*   **Game State Management:** Singleton pattern (`GameState.gd`) managing global state (Scrap, Heat, Progression) across scene transitions (Town <-> World).
*   **Event Bus:** Signal-based architecture for decoupling systems.
    *   *Global Signals:* `GameState` emits `run_started`, `run_finished`, `heat_changed`.
    *   *Entity Signals:* `VehicleEntity` emits `breakdown`, `repaired`, `health_changed`.
*   **Scene Structure:**
    *   `World.tscn`: Main entry point container.
    *   `TownZone.tscn`: Static safe zone scene.
    *   `RoadManager.gd`: Handles infinite scrolling and procedural generation.

## 3. Systems
*   **Procedural Generation (RoadManager):**
    *   Uses **infinite scrolling** logic where `RoadSegment` scenes are instantiated ahead of the player and despawned behind.
    *   **Pattern Spawning:** Segments can inject obstacle patterns (Blockades, Chicanes) based on difficulty metrics.
*   **AI (PursuerAI):**
    *   **State Machine:** Finite State Machine (FSM) with states: `SEEK`, `RAM`, `BLOCK`, `RESET`.
    *   **Steering Behaviors:** Uses seek/arrival forces and vector math for driving logic (stay on road, target player).
*   **Persistence:**
    *   **ConfigFile:** Uses Godot's `ConfigFile` API to save/load JSON-like data to `user://save_profile.cfg`.
    *   **Safety:** Handles file I/O errors gracefully.

## 4. Vehicle Physics
*   **Custom Arcade Physics:** `VehicleEntity` extends `CharacterBody2D` (not `RigidBody2D`).
    *   **Velocity-Based:** Uses vector math to simulate acceleration, friction, drag, and steering.
    *   **Traction Model:** Simulates slip angle and drifting by varying traction based on speed and handbrake state.
    *   **Data Driven:** Stats (Acceleration, Grip, Armor) are defined in `DataVehicle` resources (`.tres` files), enabling easy content expansion.

## 5. Input System
*   **Input Map:** Project-wide Input Map with support for:
    *   **Keyboard:** WASD/Arrows.
    *   **Gamepad:** Full support including Analog Triggers (`ui_up`, `ui_down`) using `Input.get_action_strength`.
*   **Context Action:** "Interact" (E / Face Button) is context-sensitive, handled by `InteractionController` raycasting.

## 6. Project structure
```
game/
├── addons/             # External plugins (DialogManager, etc.)
├── entities/           # Game Objects
│   ├── player/         # Player character logic
│   ├── vehicles/       # Vehicle logic & AI
│   └── world/          # Static objects (Caches, Obstacles)
├── scenes/
│   ├── hud/            # User Interface
│   ├── levels/         # Main World & Town scenes
│   └── ui/             # Menus (Upgrade, Summary)
├── systems/            # Core Systems
│   ├── game_state.gd   # Global Manager
│   └── map/            # Road Generation
└── assets/             # Art & Audio
```
