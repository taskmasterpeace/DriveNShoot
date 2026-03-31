---
description: Smart test runner - detects changed files and runs relevant tests
allowed-tools: Bash(git:*), Bash(npm:*)
---

# Smart Test Runner

Intelligently run tests based on changed files.

## Steps:

1. Detect changed files:
   ```bash
   git status --short
   ```

2. Map changes to test files:
   - src/components/Button.tsx → tests/components/Button.test.ts
   - src/app/api/users/route.ts → tests/api/users.test.ts
   - src/hooks/useAuth.ts → tests/hooks/useAuth.test.ts

3. Run relevant tests:
   ```bash
   # Unit tests
   npm run test:unit -- path/to/test.test.ts

   # E2E tests
   npm run test:e2e -- tests/feature.spec.ts
   ```

4. Parse test results:
   - ✅ All passing: Report success
   - ❌ Failures: Show failure details with file:line numbers
   - ⚠️ No tests found: Warn about missing coverage

5. Suggest next steps:
   - If failures: "Fix implementation in [file]"
   - If no tests: "Create test file at [path]"

## Usage:
```
/project:test
```

## When to Use:
- After editing components
- After fixing bugs
- Before commits
- During TDD workflow
