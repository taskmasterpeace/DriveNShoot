---
name: "source-command-retro"
description: "End-of-session retrospective - extracts learnings and updates my-dev-assistant skill"
---

# source-command-retro

Use this skill when the user asks to run the migrated source command `retro`.

## Command Template

# Session Retrospective

Review this session and update the team's knowledge base.

## Instructions

1. **Analyze the session**: Look at what was attempted, what worked, what failed.

2. **Check git diff** for what changed:
```bash
git diff HEAD~5 --stat
```

3. **Identify learnings**:
   - What clearly **worked** (patterns, commands, approaches)?
   - What clearly **failed** (bad plans, errors, wasted time)?
   - Any new patterns worth remembering?

4. **Update the skill file**: Edit `.Codex/commands/my-dev-assistant.md`:
   - Add new failures under `## Failures` with date and solution
   - Add new successes under `## Successes`
   - Keep entries concise: problem → solution format

5. **Commit the update**:
```bash
git add .Codex/commands/my-dev-assistant.md
git commit -m "docs: Update dev-assistant skill with session learnings"
git push
```

## Output Format
After updating, summarize:
- New failures added: X
- New successes added: X
- Key lesson: [one-liner]
