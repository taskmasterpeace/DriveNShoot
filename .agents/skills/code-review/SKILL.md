---
name: code-review
description: "Performs an architectural and quality code review on CarWorld GDScript files. Checks coding standards, patterns, performance, and Godot best practices."
argument-hint: "[path-to-file-or-directory]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash
---

When this skill is invoked:

1. **Read the target file(s)** in full.

2. **Read AGENTS.md** for project coding standards.

3. **Identify the system category** (vehicle/entity, system, autoload, UI, component) and apply category-specific standards.

4. **Evaluate against CarWorld coding standards**:
   - [ ] Static typing on all variables, parameters, return types
   - [ ] No hardcoded gameplay values (must be in .tres or Const.gd)
   - [ ] Delta time used for all time-dependent calculations
   - [ ] Signals used for cross-system communication
   - [ ] Follows existing component pattern
   - [ ] No method exceeds ~40 lines

5. **Check Godot best practices**:
   - [ ] @onready for node references (not get_node in _process)
   - [ ] Composition over deep inheritance
   - [ ] Proper signal connection (in _ready, not _process)
   - [ ] Resources used instead of Dictionaries for data
   - [ ] CharacterBody2D for vehicles (NEVER RigidBody2D)

6. **Check performance**:
   - [ ] No allocations in _process/_physics_process
   - [ ] set_process(false) when idle
   - [ ] Object pooling for frequent spawns
   - [ ] No tree queries in hot paths

7. **Check game-specific concerns**:
   - [ ] Frame-rate independence
   - [ ] Proper queue_free() / memory cleanup
   - [ ] Collision layers used correctly
   - [ ] Works with chunk-based world generation

8. **Output the review**:

```
## Code Review: [File/System Name]

### Standards Compliance: [X/6 passing]
[List failures with line references]

### Godot Best Practices: [CLEAN / ISSUES FOUND]
[List specific concerns]

### Performance: [CLEAN / ISSUES FOUND]
[List hot-path concerns]

### Positive Observations
[What is done well]

### Required Changes
[Must-fix items]

### Suggestions
[Nice-to-have improvements]

### Verdict: [APPROVED / APPROVED WITH SUGGESTIONS / CHANGES REQUIRED]
```
