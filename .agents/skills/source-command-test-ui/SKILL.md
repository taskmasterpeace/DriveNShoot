---
name: "source-command-test-ui"
description: "Launch Playwright UI mode for visual test debugging"
---

# source-command-test-ui

Use this skill when the user asks to run the migrated source command `test-ui`.

## Command Template

# Playwright UI Test Runner

Launch Playwright's interactive UI mode for visual test development.

## Steps:

1. Start Playwright UI:
   ```bash
   npm run test:ui
   ```

2. Report what's available:
   - 22+ existing test files
   - Multi-browser testing (Chrome, Firefox, Safari)
   - Mobile device emulation
   - Time travel debugging
   - Screenshot/video on failure

3. Provide tips:
   - "Click test to run in isolation"
   - "Use Pick Locator to find selectors"
   - "Watch mode auto-reruns on file changes"
   - "Screenshot/video captured on failures"

## Usage:
```
/project:test-ui
```

## When to Use:
- Creating new E2E tests
- Debugging flaky tests
- Exploring page selectors
- Visual test development
