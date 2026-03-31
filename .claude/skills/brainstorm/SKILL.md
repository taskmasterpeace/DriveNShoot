---
name: brainstorm
description: "Guided game feature/mechanic brainstorming for CarWorld. Collaborative ideation using game design theory, player psychology, and structured exploration."
argument-hint: "[feature-area or 'open']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, WebSearch
---

When this skill is invoked:

1. **Parse the argument** for a feature area hint (e.g., `weapons`, `enemies`, `towns`, `on-foot`, `progression`). If `open` or no argument, brainstorm freely.

2. **Read existing context**:
   - `CLAUDE.md` for current phase priorities
   - `PRD.md` for the game vision
   - `FEATURES.md` for what's already implemented
   - Any existing design docs in `design/gdd/`

3. **Run through ideation phases interactively** — ask questions at each phase. Be a creative facilitator, not a replacement for the user's vision.

### Phase 1: Context and Goals

- What specific problem or opportunity are we exploring?
- How does this connect to CarWorld's core loop (Drive -> Loot -> Extract -> Upgrade)?
- What should the player FEEL when interacting with this feature?
- Any reference games that handle this well?
- Scope constraints? (Quick add vs. major system)

### Phase 2: Concept Generation

Generate **3 distinct approaches** using these techniques:

**Verb-First:** Start with the core player verb and build outward
**Mashup:** Combine unexpected elements for a unique hook
**MDA Backward:** Start from desired emotion, work backward to mechanics

For each concept present:
- **Name** and **one-line pitch**
- **Core mechanic** description
- **How it connects** to existing CarWorld systems
- **Scope estimate** (small / medium / large)
- **Biggest risk**

### Phase 3: Deep Dive on Chosen Concept

For the user's choice:
- Detail the core loop integration
- Map system dependencies
- Identify tuning knobs
- List edge cases
- Define MVP vs. full version

### Phase 4: Document

Save the brainstorm results to `design/gdd/[feature-name]-concept.md` with:
- Overview
- Chosen concept details
- System dependencies
- Open questions
- Next steps (implementation plan)

Suggest: "Run `/sprint-plan new` to schedule implementation" or "Use the `game-designer` agent to create a full GDD."
