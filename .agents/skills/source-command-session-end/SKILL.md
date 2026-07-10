---
name: "source-command-session-end"
description: "End of session safety check - commit and push all changes"
---

# source-command-session-end

Use this skill when the user asks to run the migrated source command `session-end`.

## Command Template

Run these steps before ending this Codex session:

1. Run `git status` to check for uncommitted changes
2. If any changes exist:
   - Stage them with `git add -A`
   - Create a descriptive commit message
   - Push to origin main
3. Report final status

NEVER end a session with uncommitted work!
