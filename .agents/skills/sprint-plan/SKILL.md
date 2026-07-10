---
name: sprint-plan
description: "Generates a new sprint plan or updates an existing one for CarWorld development. Pulls context from design docs, features list, and PRD."
argument-hint: "[new|update|status]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit
---

When this skill is invoked:

1. **Read current state** from `FEATURES.md` and `PRD.md` for priorities.

2. **Read previous sprint** (if any) from `production/sprints/` for velocity and carryover.

3. **Scan design documents** in `design/gdd/` for features ready for implementation.

4. **Check AGENTS.md** for current phase priorities.

For `new`:

5. **Generate a sprint plan** following this format and save to `production/sprints/sprint-[N].md`:

```markdown
# Sprint [N] -- [Start Date] to [End Date]

## Sprint Goal
[One sentence describing what this sprint achieves toward current phase]

## Capacity
- Total days: [X]
- Buffer (20%): [Y days reserved for unplanned work]
- Available: [Z days]

## Tasks

### Must Have (Critical Path)
| ID | Task | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-----------|-------------|-------------------|

### Should Have
| ID | Task | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-----------|-------------|-------------------|

### Nice to Have
| ID | Task | Est. Days | Dependencies | Acceptance Criteria |
|----|------|-----------|-------------|-------------------|

## Carryover from Previous Sprint
| Task | Reason | New Estimate |
|------|--------|-------------|

## Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|

## Definition of Done
- [ ] All Must Have tasks completed
- [ ] All tasks pass acceptance criteria
- [ ] No S1 or S2 bugs in delivered features
- [ ] Design documents updated for any deviations
- [ ] FEATURES.md updated with completed features
- [ ] Tested in test_driving.tscn
```

For `status`:

5. **Generate a status report**:

```markdown
# Sprint [N] Status -- [Date]

## Progress: [X/Y tasks complete] ([Z%])

### Completed
| Task | Notes |
|------|-------|

### In Progress
| Task | % Done | Blockers |
|------|--------|----------|

### Not Started
| Task | At Risk? | Notes |
|------|----------|-------|

## Burndown Assessment
[On track / Behind / Ahead]
[If behind: What is being cut or deferred]
```
