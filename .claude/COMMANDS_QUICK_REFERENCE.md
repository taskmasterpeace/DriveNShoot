# Claude Code Commands - Quick Reference

**After restarting Claude Code, these commands will be available:**

---

## 🚀 Phase 1 Commands (Just Installed)

### `/build-check`
**What it does:** Runs TypeScript build and reports errors

**When to use:**
- Before committing changes
- After refactoring
- When you suspect TypeScript errors

**Example:**
```
/build-check
```

**What happens:**
1. Clears `.next` build artifacts
2. Runs `npm run build`
3. Reports TypeScript errors with file:line references
4. Suggests common fixes

---

### `/test`
**What it does:** Smart test runner - detects changed files and runs relevant tests

**When to use:**
- After editing components
- After fixing bugs
- Before commits
- During TDD workflow

**Example:**
```
/test
```

**What happens:**
1. Checks `git status` to see what you changed
2. Maps changes to test files:
   - `src/components/Button.tsx` → `tests/components/Button.test.ts`
   - `src/app/api/users/route.ts` → `tests/api/users.test.ts`
3. Runs relevant tests (unit or E2E)
4. Reports results with actionable next steps

---

### `/test-ui`
**What it does:** Launch Playwright UI mode for visual test debugging

**When to use:**
- Creating new E2E tests
- Debugging flaky tests
- Exploring page selectors
- Visual test development

**Example:**
```
/test-ui
```

**What happens:**
1. Launches Playwright's interactive UI
2. Shows your 22+ existing test files
3. Enables:
   - Click test to run in isolation
   - Pick Locator to find selectors
   - Watch mode (auto-reruns on changes)
   - Screenshot/video on failures

---

### `/deploy`
**What it does:** Full deployment workflow - build, push, monitor Vercel

**When to use:**
- After feature completion
- After bug fixes
- Before showing work to stakeholders
- End of development session

**Example:**
```
/deploy
```

**What happens:**
1. Checks git status (must be clean)
2. Runs `npm run build` (must pass)
3. Pushes to `origin main`
4. Reports Vercel deployment status
5. Provides deployment URL

---

## 📋 Existing Commands (Already Available)

### `/git-status`
Check git status and report uncommitted changes

### `/commit-all`
Quick commit and push all changes to remote

### `/session-end`
End of session safety check - commit and push all changes

---

## 🔄 How to Use After Restart

1. **Restart Claude Code CLI**
   ```bash
   # Exit current session
   exit

   # Start new session
   claude
   ```

2. **Commands will be available immediately**
   - Type `/` and press Tab to see all available commands
   - Or just type the full command: `/build-check`

3. **Test a command:**
   ```
   /build-check
   ```

---

## 💡 Pro Tips

**Before Commits:**
```
/build-check
/test
```

**During Development:**
```
/test-ui
# (opens interactive test UI)
```

**End of Day:**
```
/deploy
```

**Quick Check:**
```
/git-status
```

---

## 🐛 Troubleshooting

**Q: Commands not showing up?**
A: Restart Claude Code session

**Q: Command gives error?**
A: Check that you're in the project directory (`C:\git\directors-palette-v2`)

**Q: Want to see command details?**
A: Check `.claude/commands/[command-name].md`

---

## 📚 Full Documentation

For complete details on all phases and features:
- **Automation Guide:** `C:\Users\taskm\.claude\plans\AUTOMATION_GUIDE.md`
- **Full Plan:** `C:\Users\taskm\.claude\plans\tender-swinging-aho.md`

---

**Next Steps After Testing Commands:**
- Phase 2: Auto-formatting hooks (15 min)
- Phase 3: Test runner skill (45 min)
- Phases 4-10: Optional enhancements

**Last Updated:** 2025-12-26
