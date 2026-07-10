---
name: "source-command-build-check"
description: "Run TypeScript build and report errors"
---

# source-command-build-check

Use this skill when the user asks to run the migrated source command `build-check`.

## Command Template

# Build Check Command

Run TypeScript build verification before commits.

## Steps:

1. Clear previous build artifacts:
   ```bash
   rm -rf .next
   ```

2. Run TypeScript build:
   ```bash
   npm run build
   ```

3. Parse build output:
   - If successful: Report "✅ Build passed - no TypeScript errors"
   - If errors: Extract file paths and error messages
   - Provide clickable links to error locations (file:line format)

4. Suggest fixes for common errors:
   - Missing type annotations
   - Null safety issues
   - Import errors

## Usage:
```
/project:build-check
```

## When to Use:
- Before committing changes
- After refactoring
- When TypeScript errors suspected
- Before creating PR
