---
name: "source-command-git-status"
description: "Check git status and report uncommitted changes"
---

# source-command-git-status

Use this skill when the user asks to run the migrated source command `git-status`.

## Command Template

Run `git status` and report:
- Current branch
- Number of modified files
- Number of untracked files
- Whether there are uncommitted changes

If uncommitted changes exist, warn the user loudly.
