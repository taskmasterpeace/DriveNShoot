# Autonomous Task Definition

## Task: Add Weapon-Equipped Enemy Vehicles

**STATUS: IN_PROGRESS**

**MAX_ITERATIONS: 25**

---

## Objective

Create enemy vehicles that can shoot at the player. Enemies should pursue and fire their weapons while maintaining chase behavior.

## Success Criteria

When ALL of these are true, set STATUS: COMPLETE

- [ ] Enemy vehicle has WeaponSystem component attached
- [ ] Enemy AI detects player within range
- [ ] Enemy fires at player while pursuing
- [ ] Bullets from enemy can damage player vehicle
- [ ] Enemy has ammo limits (must reload or stop shooting)
- [ ] At least one enemy type spawns via encounter_director
- [ ] Player can destroy armed enemies
- [ ] Code compiles/runs without errors
- [ ] Changes committed to git

## Scope

### Files to Create
- `entities/enemies/shooter_vehicle.tscn` - Armed enemy scene
- `entities/enemies/shooter_ai.gd` - Shooting + pursuit AI

### Files to Modify
- `systems/encounter_director.gd` - Add shooter enemy spawns
- Existing enemy AI scripts for reference

### Do NOT Touch
- Core encounter_director spawn logic (only add new enemy type)
- Player vehicle damage system (should already work)

## Implementation Notes

Enemy Shooter Behavior:
1. Pursue player (use existing rammer/blocker pattern)
2. When in range (300px), start firing
3. Lead the target slightly (predict player movement)
4. Cease fire when reloading or out of range
5. Prioritize chasing over perfect aim

Use PixelLab to generate:
- Shooter enemy vehicle sprite (64x64, top-down, post-apocalyptic)

Enemy Weapon Stats:
- Damage: 5 per bullet
- Fire rate: 3 rounds/second
- Accuracy: 80% (add some miss chance)
- Range: 300 pixels

## Progress Log

---

*Phase 7 - Enemy Variety Task*
