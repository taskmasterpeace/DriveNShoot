# Autonomous Task Definition

## Task: Implement Machine Gun Weapon System

**STATUS: IN_PROGRESS**

**MAX_ITERATIONS: 30**

---

## Objective

Implement a fully functional machine gun weapon that can be mounted on vehicles and fired by the player. This is the first weapon type and establishes the weapon system architecture.

## Success Criteria

When ALL of these are true, set STATUS: COMPLETE

- [ ] WeaponData resource created at `res://data/weapons/machine_gun.tres`
- [ ] WeaponSystem component script at `entities/components/weapon_system.gd`
- [ ] Machine gun can be mounted to player vehicle
- [ ] Firing mechanic works (press key to fire bullets)
- [ ] Bullets spawn as projectiles with collision
- [ ] Ammo system tracks rounds (100 rounds capacity)
- [ ] HUD shows ammo count
- [ ] Weapon has fire rate limiting (10 shots/second)
- [ ] Code compiles/runs without errors in Godot
- [ ] Changes committed to git

## Scope

### Files to Create
- `res://data/weapons/weapon_data.gd` - Base weapon resource class
- `res://data/weapons/machine_gun.tres` - Machine gun stats
- `entities/components/weapon_system.gd` - Weapon mounting and control
- `entities/projectiles/bullet.tscn` - Bullet scene
- `entities/projectiles/bullet.gd` - Bullet behavior

### Files to Modify
- `entities/vehicles/vehicle_entity.gd` - Add weapon mounting
- `scenes/hud/hud_overlay.gd` - Add ammo display
- `scenes/levels/test/test_driving.tscn` - Add weapon for testing

### Do NOT Touch
- Core vehicle physics in vehicle_entity.gd (only add weapon integration)
- Existing HUD layout (only add new ammo element)

## Implementation Notes

Follow existing patterns:
- Use component pattern from `entities/components/survival_stats.gd`
- Use resource pattern from `data/vehicles/vehicle_*.tres`
- Use projectile pattern from `entities/projectiles/projectile.gd` if exists
- Use signals for weapon events (fired, empty, reloaded)

Input Action (define in project.godot if not exists):
- `fire_primary` - Left mouse button or gamepad right trigger

Machine Gun Stats:
- Damage: 10 per bullet
- Fire rate: 10 rounds/second
- Ammo capacity: 100
- Bullet speed: 800 pixels/second
- Spread: 5 degrees random

## Progress Log

<!-- Claude updates this as work progresses -->

---

*Phase 7 Priority Task - CarWorld Weapon System*
