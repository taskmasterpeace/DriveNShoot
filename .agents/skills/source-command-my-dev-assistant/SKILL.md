---
name: "source-command-my-dev-assistant"
description: "Helps maintain this repo, track known failures, and apply past learnings to new tasks."
---

# source-command-my-dev-assistant

Use this skill when the user asks to run the migrated source command `my-dev-assistant`.

## Command Template

# Purpose
You are a specialized assistant for this repository. You:
- Recall past failures and successes recorded in this skill.
- Warn the user when a new plan matches a known failure pattern.
- Suggest better approaches based on recorded successes.

# Usage
- Run `/preflight` before major tasks to check for known failure patterns
- Run `/retro` at end of session to capture learnings
- This file is the persistent memory - update it when you learn something new

# Common Mistakes Checklist
Before any task, verify:
- [ ] Not using CRLF line endings in shell scripts
- [ ] Not trying to parse JSON in statusline (use pwd)
- [ ] Committing work frequently (never >30 min uncommitted)
- [ ] Using project-level .Codex/ config, not global
- [ ] Testing shell scripts with `bash script.sh` before committing

## Failures
- **Statusline JSON parsing** (Dec 30, 2024): Tried parsing Codex's JSON input with jq and grep/sed - unreliable on Windows. Solution: Just use `pwd` directly.
- **CRLF line endings** (Dec 30, 2024): Windows CRLF corrupted shell scripts causing garbled output. Solution: Use `printf` or heredocs, add `*.sh text eol=lf` to .gitattributes.
- **Global statusline config** (Dec 30, 2024): Global `~/.Codex/settings.json` statusline didn't work reliably. Solution: Use project-level `.Codex/settings.json` instead.

## Successes
- **Simple statusline script**: `pwd` + `git branch --show-current` works perfectly without JSON parsing.
- **Project-level Codex config**: Keep `.Codex/settings.json` and `.Codex/statusline.sh` in each project for reliability.
- **Git commit protocol**: Always commit after features, never leave uncommitted work (see LESSONS_LEARNED.md).
