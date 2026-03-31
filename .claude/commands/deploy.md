---
description: Full deployment workflow - build, push, monitor Vercel
allowed-tools: Bash(npm:*), Bash(git:*)
---

# Deployment Command

Automated deployment workflow with verification.

## Steps:

1. Pre-flight checks:
   ```bash
   # Check git status
   git status

   # Verify clean working tree
   if [[ -n $(git status -s) ]]; then
     echo "⚠️ Uncommitted changes found. Commit first."
     exit 1
   fi
   ```

2. Build verification:
   ```bash
   npm run build
   ```
   - Must pass before deploy
   - Report any TypeScript errors

3. Push to main:
   ```bash
   git push origin main
   ```

4. Monitor Vercel deployment:
   - Report: "Deployment triggered on Vercel"
   - Provide Vercel dashboard URL
   - Estimated completion time

5. Post-deploy verification:
   - Wait 30 seconds for deployment
   - Suggest: "Check https://directors-palette.app for changes"
   - Remind: "Monitor Vercel dashboard for build status"

## Usage:
```
/project:deploy
```

## When to Use:
- After feature completion
- After bug fixes
- Before showing work to stakeholders
- End of development session
