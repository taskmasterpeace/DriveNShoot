---
description: Smart commit - commits & pushes completed work automatically
allowed-tools: Bash(git:*)
---

# Auto-Commit Skill

Automatically commits and pushes completed work to prevent data loss. Use this after completing any feature, fix, or significant change.

## When to Trigger

This skill should be invoked automatically by Claude in these situations:
- After completing a feature implementation
- After fixing bugs
- After refactoring work
- Before switching to a new task
- After any significant code changes (10+ lines)
- When the user says "done", "finished", or similar completion phrases

## Steps

1. Check for uncommitted changes:
   ```bash
   git status --porcelain
   ```
   - If no changes, report "No changes to commit" and exit
   - If changes exist, continue

2. Show what will be committed:
   ```bash
   git status --short
   ```

3. Generate intelligent commit message:
   - Analyze changed files to determine commit type (feat/fix/refactor/docs/test)
   - Create descriptive message based on changes
   - Format: `type: description`

4. Commit all changes:
   ```bash
   git add -A
   git commit -m "$(cat <<'EOF'
   [generated commit message]

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
   EOF
   )"
   ```

5. Push to remote:
   ```bash
   git push origin main
   ```

6. Confirm success with summary of what was committed

## Safety Features

- Always shows changes before committing
- Uses standard git workflow
- Automatically pushes to prevent local-only commits
- Generates descriptive commit messages

## Example Usage

After implementing a feature:
```
User: I finished adding the video generation UI
Claude: Great! Let me commit and push those changes.
[Invokes /auto-commit skill]
```

## Integration

This skill works with:
- `/session-end` - Calls this before ending sessions
- `/deploy` - Can be called before deployment
- Feature completion detection - Triggers automatically
