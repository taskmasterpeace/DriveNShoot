---
description: Review code for bugs, security, and best practices
allowed-tools: Bash(git:*), Read, Grep
---

# Code Review Skill

Automatically reviews uncommitted code changes for bugs, security vulnerabilities, and architectural issues before committing.

## When to Trigger

Use this skill:
- Before running `/auto-commit` or `/commit-all`
- When user says "review my code" or "check for issues"
- After completing a feature (before committing)
- Before creating a PR
- When user asks "is this safe?"

## Steps

1. Get list of changed files:
   ```bash
   git diff --name-only
   git diff --cached --name-only
   ```

2. For each changed file:
   - Read the full file
   - Analyze the diff to see what changed:
     ```bash
     git diff [file]
     ```

3. Review for security issues:
   - ❌ SQL injection risks (string concatenation in queries)
   - ❌ XSS vulnerabilities (unescaped user input in HTML)
   - ❌ Command injection (shell commands with user input)
   - ❌ Hardcoded secrets (API keys, passwords)
   - ❌ Insecure authentication (weak JWT, no encryption)
   - ❌ Path traversal (file paths from user input)
   - ❌ CORS misconfigurations (allow all origins)
   - ❌ Missing input validation
   - ❌ Unsafe file uploads
   - ❌ Information disclosure (stack traces, debug info)

4. Review for common bugs:
   - ❌ Null/undefined errors
   - ❌ Off-by-one errors
   - ❌ Race conditions
   - ❌ Memory leaks (event listeners not cleaned up)
   - ❌ Infinite loops
   - ❌ Missing error handling
   - ❌ Incorrect TypeScript types
   - ❌ Async/await issues

5. Review for architectural issues:
   - ❌ Business logic in components (should be in services)
   - ❌ Large components (>70 lines)
   - ❌ Missing types/validation
   - ❌ Tight coupling
   - ❌ Code duplication
   - ❌ Missing error boundaries
   - ❌ Direct database access in components

6. Review for performance issues:
   - ❌ Missing React.memo/useMemo/useCallback
   - ❌ Large bundle sizes
   - ❌ N+1 query problems
   - ❌ Blocking operations in render
   - ❌ Unnecessary re-renders

7. Generate review report:
   ```markdown
   ## Code Review Results

   ### Files Changed: [count]
   - [list of files]

   ### Security Issues: [count]
   🔴 CRITICAL: [issues that must be fixed]
   🟡 WARNING: [issues to consider]

   ### Bugs: [count]
   🔴 CRITICAL: [must fix]
   🟡 WARNING: [should fix]

   ### Architecture: [count]
   💡 SUGGESTION: [improvements]

   ### Performance: [count]
   ⚡ OPTIMIZATION: [recommendations]

   ### Summary
   ✅ Safe to commit: [yes/no]
   📝 Recommendations: [summary]
   ```

8. If critical issues found:
   - **Block the commit**
   - Provide specific file:line references
   - Suggest fixes
   - Offer to fix automatically

9. If no critical issues:
   - Report "✅ Code review passed"
   - List minor suggestions
   - Allow commit to proceed

## Example Output

```
🔍 Reviewing 3 changed files...

Files:
- src/features/video-gen/services/replicate.ts
- src/app/api/generate/route.ts
- src/features/video-gen/components/VideoForm.tsx

🔴 CRITICAL SECURITY ISSUE:
src/app/api/generate/route.ts:45
❌ SQL Injection risk: User input concatenated directly into query
   Fix: Use parameterized queries or ORM

🟡 WARNING:
src/features/video-gen/components/VideoForm.tsx:120
❌ Component >70 lines: Extract form logic to custom hook

💡 SUGGESTION:
src/features/video-gen/services/replicate.ts:15
⚡ Missing error retry logic for API calls

❌ NOT SAFE TO COMMIT
Please fix critical security issue before committing.
```

## Integration

- Runs automatically before `/auto-commit`
- Can be called manually with `/code-review`
- Blocks commits if critical issues found
- Offers to fix issues automatically
