---
description: Launch Playwright UI mode for visual test debugging
allowed-tools: Bash(npm:*)
---

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
