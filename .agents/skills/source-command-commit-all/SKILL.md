---
name: "source-command-commit-all"
description: "Quick commit and push all changes to remote"
---

# source-command-commit-all

Use this skill when the user asks to run the migrated source command `commit-all`.

## Command Template

Execute these steps:

1. Run `git status` to see all changes
2. Stage all changes with `git add -A`
3. Create a commit with a descriptive message
4. Push to origin main
5. Verify the push succeeded
