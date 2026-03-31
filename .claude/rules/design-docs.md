---
paths:
  - "design/**"
---

# Design Document Rules

- Every design document MUST contain 8 sections: Overview, Player Fantasy, Detailed Rules, Formulas, Edge Cases, Dependencies, Tuning Knobs, Acceptance Criteria
- Formulas must include variable definitions, expected ranges, and example calculations
- Edge cases must explicitly state what happens, not just "handle gracefully"
- Dependencies must be bidirectional — if system A depends on B, B's doc must mention A
- Tuning knobs must specify safe ranges and what gameplay aspect they affect
- Acceptance criteria must be testable — QA must be able to verify pass/fail
- No hand-waving: "should feel good" is not a valid specification
- Balance values must link to their source formula or rationale
