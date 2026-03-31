# Git Workflow Rules for Directors Palette

## CRITICAL: Commit Protocol

After the December 16, 2024 incident where 194 files were nearly lost, these rules are MANDATORY.

### Session Start
1. Run `git status` immediately
2. If changes exist, commit them BEFORE any new work
3. Report status to user

### During Development
1. Commit after every feature completion
2. Push after every commit
3. Never let work exceed 30 minutes uncommitted

### Session End
1. Run `git status`
2. Commit ALL changes
3. Push to remote
4. Verify deployment

## Commit Message Format

```
type(scope): description

Types:
- feat: New feature
- fix: Bug fix
- refactor: Code restructuring
- docs: Documentation
- test: Test additions
- perf: Performance improvement
- style: Formatting, no code change
- chore: Maintenance tasks
```

## Branch Naming

```
feat/feature-name
fix/issue-description
refactor/component-name
docs/section-name
```

## Before Committing

- [ ] Run `npm run build` to verify no TypeScript errors
- [ ] Ensure no sensitive files included (.env, keys)
- [ ] Write descriptive commit message
- [ ] Push to remote after commit

## Emergency Recovery

If uncommitted work is found:
```bash
git add -A
git commit -m "chore: Emergency commit of uncommitted work"
git push origin main
```
