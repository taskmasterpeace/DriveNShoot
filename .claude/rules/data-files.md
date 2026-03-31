---
paths:
  - "game/data/**"
---

# Data File Rules (.tres Resources)

- All .tres resource files must have a corresponding Resource script with class_name
- Resource scripts must implement _init() with sensible defaults for editor stability
- Use @export with type hints and @export_range for numeric values
- Group related exports with @export_group
- File naming: snake_case matching the resource type (vehicle_fast.tres, weapon_machinegun.tres)
- No orphaned data entries — every resource must be referenced by code or another resource
- Numeric values should have comments or @export hints explaining their purpose
- Use Resources instead of Dictionaries for structured data

## Examples

**Correct** (proper resource):

```gdscript
class_name VehicleData extends Resource

@export_group("Movement")
@export var max_speed: float = 300.0
@export_range(0.1, 2.0, 0.1) var acceleration: float = 1.0
@export var handling: float = 0.8

@export_group("Combat")
@export var armor: float = 100.0
@export var weapon_slots: int = 2

func _init() -> void:
    pass  # Defaults set via @export
```

**Incorrect:**

```gdscript
# No class_name, no typing, no grouping
var speed = 300
var armor = 100
```
