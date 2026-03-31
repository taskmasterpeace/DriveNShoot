# Claude Code Skills Guide

**5 Intelligent Skills for Directors Palette V2**

These skills trigger automatically based on conversation context. Claude will invoke them when relevant without you having to remember slash commands.

---

## 🚀 Available Skills

### 1. `/auto-commit` - Smart Auto-Commit
**Triggers automatically when:**
- You finish implementing a feature
- You fix a bug
- You say "done", "finished", or "complete"
- Before switching to a new task

**What it does:**
- Detects all uncommitted changes
- Creates descriptive commit message
- Commits and pushes to remote
- Prevents work loss

**Manual usage:**
```bash
/auto-commit "feat: Add video generation UI"
```

---

### 2. `/feature-scaffold` - Feature Module Generator
**Triggers automatically when:**
- You say "create a new feature"
- You ask to "set up" a feature module
- Starting a new component system

**What it does:**
- Creates proper `src/features/[name]/` structure
- Generates components/, hooks/, services/, types/
- Includes Zod validation boilerplate
- Follows Directors Palette architecture

**Manual usage:**
```bash
/feature-scaffold
# Claude will ask for feature name and description
```

**Example output:**
```
src/features/video-editor/
├── components/index.tsx
├── hooks/index.ts
├── services/index.ts
├── types/index.ts
└── README.md
```

---

### 3. `/code-review` - Security & Quality Review
**Triggers automatically when:**
- Before running `/auto-commit`
- You ask "review my code"
- Before creating a PR
- You say "is this safe?"

**What it does:**
- Scans for security vulnerabilities (XSS, SQL injection, etc.)
- Checks for common bugs (null errors, race conditions)
- Reviews architecture (component size, service extraction)
- Identifies performance issues
- **Blocks commits** if critical issues found

**Manual usage:**
```bash
/code-review
```

**Example output:**
```
🔍 Reviewing 3 files...

🔴 CRITICAL: SQL Injection risk in api/users/route.ts:45
🟡 WARNING: Component >70 lines in VideoForm.tsx:120
💡 SUGGESTION: Add memoization to ProductList.tsx

❌ NOT SAFE TO COMMIT - Fix critical issues first
```

---

### 4. `/api-gen` - API Route Generator
**Triggers automatically when:**
- You say "create an API endpoint"
- You mention "API for [feature]"
- Building backend functionality

**What it does:**
- Scaffolds Next.js App Router API route
- Includes Supabase authentication
- Adds Zod input validation
- Implements error handling
- Generates TypeScript types
- Creates client-side hook

**Manual usage:**
```bash
/api-gen
# Claude will ask for endpoint details
```

**Example output:**
```
src/app/api/videos/generate/
├── route.ts (with auth, validation, error handling)
├── types.ts (Zod schemas)
└── README.md

src/features/video-gen/hooks/
└── useVideoGenerate.ts (client hook)
```

---

### 5. `/test-auto` - Intelligent Test Runner
**Triggers automatically when:**
- After editing source files
- Before committing changes
- You say "test this" or "run tests"
- After refactoring

**What it does:**
- Detects which files changed
- Maps changes to relevant tests
- Runs only affected tests (fast)
- Parses test results with clickable links
- **Blocks commits** if tests fail

**Manual usage:**
```bash
/test-auto
```

**Smart detection:**
```
Changed: src/features/video-gen/services/replicate.ts
→ Runs: tests/video-gen.spec.ts (targeted)

Changed: src/lib/supabase/client.ts
→ Runs: npm test (all tests, core change)
```

---

## 🔄 Skill Workflow Integration

**Typical flow:**
1. Implement feature
2. `/test-auto` runs automatically ✅
3. `/code-review` checks security ✅
4. `/auto-commit` commits & pushes ✅

**API development flow:**
1. `/api-gen` scaffolds endpoint
2. Implement business logic
3. `/test-auto` runs API tests
4. `/code-review` checks security
5. `/auto-commit` commits changes

**New feature flow:**
1. `/feature-scaffold` creates structure
2. Implement feature files
3. `/test-auto` validates changes
4. `/code-review` ensures quality
5. `/auto-commit` saves work

---

## 🎯 How Claude Decides When to Use Skills

Skills trigger based on **conversation context**:

| You say... | Claude invokes... |
|-----------|------------------|
| "I'm done with the login feature" | `/test-auto` → `/code-review` → `/auto-commit` |
| "Create a video upload API" | `/api-gen` |
| "I need a new auth module" | `/feature-scaffold` |
| "Is this code secure?" | `/code-review` |
| "Run the tests" | `/test-auto` |

**No need to memorize commands!** Claude will use them automatically when appropriate.

---

## 📝 Notes

- **Restart required**: After creating these skills, restart Claude Code to activate them
- **Settings**: Configure in `.claude/settings.json`
- **Managed vs Project**: These are **project skills** (in `.claude/commands/`)
- **Customization**: Edit the .md files to adjust behavior

---

## 🆘 Troubleshooting

**Skills not triggering?**
1. Restart Claude Code
2. Check `.claude/commands/` contains the .md files
3. Ensure frontmatter format is correct

**Want to disable a skill?**
- Rename `skill.md` to `skill.md.disabled`
- Or delete the file

**Want to customize?**
- Edit the .md file directly
- Adjust the "When to Trigger" section
- Modify the allowed-tools in frontmatter

---

Created: December 26, 2024
Skills: 5 intelligent automation tools for Directors Palette V2
