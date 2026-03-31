---
paths:
  - "game/scripts/autoloads/**"
---

# Autoload / Engine Code Rules

- ZERO allocations in hot paths (_process, _physics_process) — pre-allocate, pool, reuse
- Autoloads must NOT depend on scene-specific state
- Autoloads must NOT hold references to scene-specific nodes
- Engine/autoload code must NEVER depend on gameplay code (dependency flows: autoload <- gameplay)
- Every public function must have a comment explaining its purpose
- Use sparingly — only for truly global systems (audio, save, events, game state)
- Document every autoload's purpose

## Examples

**Correct** (zero-alloc hot path):

```gdscript
var _nearby_cache: Array[Node2D] = []

func _physics_process(delta: float) -> void:
    _nearby_cache.clear()  # Reuse, don't reallocate
    _query_nearby(position, radius, _nearby_cache)
```

**Incorrect** (allocating in hot path):

```gdscript
func _physics_process(delta: float) -> void:
    var nearby: Array[Node2D] = []  # VIOLATION: allocates every frame
    nearby = get_tree().get_nodes_in_group("enemies")  # VIOLATION: tree query every frame
```
