---
description: Scaffold new feature with proper src/features/ architecture
allowed-tools: Bash(mkdir:*), Write
---

# Feature Scaffolder Skill

Creates a new feature module with the proper architecture following the `src/features/` pattern. Ensures consistent structure and best practices.

## When to Trigger

Use this skill whenever:
- User asks to "create a new feature"
- User mentions implementing a new module/component system
- Starting work that needs components, hooks, services, and types
- User says "scaffold", "setup", or "initialize" for a feature

## Required Input

Ask the user for:
1. **Feature name** (kebab-case, e.g., "user-auth", "video-player")
2. **Description** (one sentence describing what the feature does)

## Steps

1. Validate feature name doesn't already exist:
   ```bash
   ls -la src/features/ | grep [feature-name]
   ```

2. Create feature directory structure:
   ```bash
   mkdir -p src/features/[feature-name]/{components,hooks,services,types}
   ```

3. Create `types/index.ts` with validation:
   ```typescript
   // src/features/[feature-name]/types/index.ts
   import { z } from 'zod';

   // TODO: Define your types here
   export const [FeatureName]Schema = z.object({
     // Add fields
   });

   export type [FeatureName] = z.infer<typeof [FeatureName]Schema>;
   ```

4. Create `services/index.ts`:
   ```typescript
   // src/features/[feature-name]/services/index.ts
   import type { [FeatureName] } from '../types';

   export class [FeatureName]Service {
     // TODO: Implement business logic
   }
   ```

5. Create `hooks/index.ts`:
   ```typescript
   // src/features/[feature-name]/hooks/index.ts
   'use client';

   import { useState } from 'react';

   export function use[FeatureName]() {
     // TODO: Implement React state management
     return {};
   }
   ```

6. Create `components/index.tsx`:
   ```typescript
   // src/features/[feature-name]/components/index.tsx
   'use client';

   import { use[FeatureName] } from '../hooks';

   export function [FeatureName]Component() {
     const state = use[FeatureName]();

     return (
       <div>
         {/* TODO: Implement UI */}
       </div>
     );
   }
   ```

7. Create feature README:
   ```markdown
   # [Feature Name]

   [Description]

   ## Structure

   - `components/` - React components
   - `hooks/` - Custom hooks for state management
   - `services/` - Business logic and data access
   - `types/` - TypeScript types with Zod validation

   ## Usage

   TODO: Add usage examples
   ```

8. Report summary:
   ```
   ✅ Feature '[feature-name]' scaffolded successfully!

   Created:
   - src/features/[feature-name]/components/index.tsx
   - src/features/[feature-name]/hooks/index.ts
   - src/features/[feature-name]/services/index.ts
   - src/features/[feature-name]/types/index.ts
   - src/features/[feature-name]/README.md

   Next steps:
   1. Define types in types/index.ts
   2. Implement business logic in services/index.ts
   3. Add state management in hooks/index.ts
   4. Build UI in components/index.tsx
   ```

## Architecture Guidelines

Follow the pattern from `src/features/context-pack`:
- **Types first**: Define data structures with validation
- **Services**: Pure business logic, no React
- **Hooks**: React state management only
- **Components**: UI-focused, <70 lines
- **Dependency injection**: Services injected via props/context

## Example

```
User: I need a new video editor feature
Claude: I'll scaffold the video-editor feature for you.
[Creates src/features/video-editor/ with all subdirectories]
```
