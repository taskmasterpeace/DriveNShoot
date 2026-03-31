---
description: End of session safety check - commit and push all changes
allowed-tools: Bash(git status:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*)
---

Run these steps before ending this Claude Code session:

1. Run `git status` to check for uncommitted changes
2. If any changes exist:
   - Stage them with `git add -A`
   - Create a descriptive commit message
   - Push to origin main
3. Report final status

NEVER end a session with uncommitted work!
