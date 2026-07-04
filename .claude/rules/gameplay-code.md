---
paths:
  - "game/entities/**"
  - "game/systems/**"
---

# Gameplay Code Rules

- ALL gameplay values MUST come from .tres resource files or Const.gd, NEVER hardcoded
- Use delta time for ALL time-dependent calculations (frame-rate independence)
- NO direct references to UI/HUD code — use signals for cross-system communication
- Every gameplay system must implement a clear interface
- State machines must have explicit transition tables with documented states
- 3D vehicles (proto3d/DRIVN engine) use VehicleBody3D — real physics, never faked kinematics
- Legacy 2D vehicles use CharacterBody2D with custom physics — NEVER RigidBody2D
- Headless tests drive mechanics with INPUTS, never teleports (see docs/ENGINE.md §0.3)
- Follow the existing component pattern in entities/components/
- Static typing on all variables, parameters, and return types

## Examples

**Correct** (data-driven):

```gdscript
var damage: float = weapon_data.base_damage
var speed: float = vehicle_data.max_speed * delta
```

**Incorrect** (hardcoded):

```gdscript
var damage: float = 25.0   # VIOLATION: hardcoded gameplay value
var speed: float = 5.0      # VIOLATION: not from resource, not using delta
```
