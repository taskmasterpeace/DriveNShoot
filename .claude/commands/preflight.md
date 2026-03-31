---
name: preflight
description: "Pre-flight check - reviews known failures before starting a task to avoid repeating mistakes"
---

# Pre-flight Check

Before starting this task, review known failure patterns.

## Instructions

1. **Read the knowledge base**:
```bash
cat .claude/commands/my-dev-assistant.md
```

2. **Compare the planned task** against known failures:
   - Does this task match any failure pattern?
   - Are there similar past attempts that failed?

3. **If match found**:
   - WARN the user explicitly
   - Quote the relevant failure entry
   - Suggest the documented solution or alternative approach

4. **If no match**:
   - Confirm: "No known failure patterns match this task."
   - Proceed with the task

5. **Check for applicable successes**:
   - Are there proven patterns that apply here?
   - Suggest using them

## Output Format
```
PRE-FLIGHT CHECK
================
Task: [brief description]
Known failures checked: X
Matches found: [none / list]
Recommended approach: [suggestion]
================
Ready to proceed: YES/NO
```
