---
paths:
  - "game/tests/**"
  - "tests/**"
---

# Test Standards

- Test naming: `test_[system]_[scenario]_[expected_result]` pattern
- Every test must have a clear Arrange/Act/Assert structure
- Test data defined in the test or fixtures, never shared mutable state
- Performance tests must specify acceptable thresholds
- Every bug fix should have a regression test
- Mock external dependencies for fast, deterministic tests

## Examples

**Correct:**

```gdscript
func test_heat_system_take_damage_increases_heat() -> void:
    # Arrange
    var heat := HeatSystem.new()
    heat.current_heat = 0.0

    # Act
    heat.add_heat(25.0)

    # Assert
    assert_eq(heat.current_heat, 25.0)
```

**Incorrect:**

```gdscript
func test1() -> void:  # VIOLATION: no descriptive name
    var h := HeatSystem.new()
    h.add_heat(25.0)  # VIOLATION: no arrange, no clear assert
    assert_true(h.current_heat > 0)  # VIOLATION: imprecise assertion
```
