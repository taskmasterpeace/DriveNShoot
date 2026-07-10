---
name: "source-command-test-auto"
description: "Automatically run relevant tests when files change"
---

# source-command-test-auto

Use this skill when the user asks to run the migrated source command `test-auto`.

## Command Template

# Test Auto-Runner Skill

Intelligently detects which tests to run based on changed files and automatically runs them after code modifications.

## When to Trigger

Use this skill:
- After editing any source file
- Before committing changes
- When user says "test this" or "run tests"
- After refactoring
- When implementing new features
- Automatically after significant code changes (>5 files)

## Steps

1. Detect changed files:
   ```bash
   git diff --name-only
   git status --porcelain
   ```

2. Map changed files to test files:
   - `src/features/[name]/` → `tests/[name].spec.ts`
   - `src/app/api/[route]/` → `tests/api/[route].spec.ts`
   - `src/components/` → `tests/components/*.spec.ts`
   - `src/lib/` → `tests/lib/*.spec.ts`

3. Find matching test files:
   ```bash
   # Search for test files matching the changed feature
   find tests -name "*[feature-name]*.spec.ts"
   ```

4. Determine test scope:
   - **Single file changed**: Run only related tests
   - **Multiple files in one feature**: Run feature tests
   - **API routes changed**: Run API integration tests
   - **Multiple features changed**: Run all tests
   - **Core lib changed**: Run all tests

5. Run appropriate test command:

   **For Playwright tests:**
   ```bash
   # Single test file
   npx playwright test tests/[filename].spec.ts

   # Specific feature tests
   npx playwright test tests/ --grep "[feature-name]"

   # All tests
   npx playwright test
   ```

   **For unit tests (if Jest/Vitest):**
   ```bash
   npm test -- [test-file]
   ```

6. Parse test results:
   - Count: Passed / Failed / Skipped
   - Execution time
   - Failed test details with file:line references

7. Generate test report:
   ```markdown
   ## Test Results

   **Changed Files:** [count]
   - [list of changed files]

   **Tests Run:** [count]
   - [list of test files]

   **Results:**
   ✅ Passed: [count]
   ❌ Failed: [count]
   ⏭️  Skipped: [count]
   ⏱️  Time: [duration]

   ### Failed Tests (if any):
   ❌ [test-name] - tests/[file].spec.ts:45
      Expected: [expected]
      Received: [received]
      [Clickable file:line link]

   ### Summary:
   [Pass/Fail status]
   ```

8. If tests fail:
   - Show specific failures with context
   - Suggest fixes based on error messages
   - Offer to debug the failing test
   - **Block commit** if running before commit

9. If tests pass:
   - Report success
   - Show coverage delta (if available)
   - Allow commit to proceed

## Smart Detection Examples

### Example 1: Single feature change
```
Changed: src/features/video-gen/services/replicate.ts
Action: Run tests/video-gen.spec.ts
```

### Example 2: API route change
```
Changed: src/app/api/generate/route.ts
Action: Run tests/api/generate.spec.ts
```

### Example 3: Multiple features
```
Changed:
- src/features/video-gen/services/replicate.ts
- src/features/image-gen/services/nano-banana.ts
- src/app/api/generate/route.ts
Action: Run all tests (npm test)
```

### Example 4: Core library change
```
Changed: src/lib/supabase/client.ts
Action: Run all tests (affects everything)
```

## Integration with Other Skills

- `/code-review` → `/test-auto` → `/auto-commit`
- Before `/deploy`, run all tests
- Block commits if tests fail
- Show test status in commit messages

## Test Output Parsing

Handle common test frameworks:
- **Playwright**: Parse JSON reporter output
- **Jest**: Parse --json output
- **Vitest**: Parse --reporter=json

## Performance Optimization

- Cache test results for unchanged files
- Run tests in parallel when possible
- Skip slow integration tests for small changes
- Offer "quick tests" vs "full test suite"

## Example Usage

```
Codex: I've updated the video generation service. Let me run the tests.
[Detects change in src/features/video-gen/]
[Runs tests/video-gen.spec.ts]

✅ Tests Passed (12/12)
⏱️  Completed in 3.2s

All video generation tests passing!
```

## Error Example

```
❌ Tests Failed (2/12)

Failed Tests:
1. Video generation with invalid prompt
   tests/video-gen.spec.ts:45
   Expected: Error thrown
   Received: No error

2. Credit deduction after generation
   tests/video-gen.spec.ts:78
   Expected: credits = 50
   Received: credits = 100

🔍 Suggested fixes:
- Add validation for empty prompts in replicate.ts:23
- Check credit deduction logic in services/credits.ts:45

❌ Cannot commit - fix failing tests first
```

## Configuration

Support test config in `.Codex/settings.json`:
```json
{
  "test": {
    "auto": true,
    "frameworks": ["playwright"],
    "threshold": 80,
    "blockCommitOnFail": true
  }
}
```
