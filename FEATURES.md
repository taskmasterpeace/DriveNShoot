# CarWorld Features Documentation
**Date:** 2025-12-19
**Version:** Phase 6 Alpha (Transitioning to Phase 7)

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
