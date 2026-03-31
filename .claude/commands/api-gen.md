---
description: Generate Next.js API route with auth, validation, and error handling
allowed-tools: Write, Read, Bash(mkdir:*)
---

# API Generator Skill

Scaffolds a new Next.js App Router API route with proper authentication, input validation, error handling, and type safety.

## When to Trigger

Use this skill when:
- User says "create an API endpoint"
- User asks to "add a new API route"
- User mentions "API for [feature]"
- Building features that need backend endpoints

## Required Input

Ask the user:
1. **Endpoint path** (e.g., "/api/videos/generate", "/api/auth/login")
2. **HTTP methods** (GET, POST, PUT, DELETE, PATCH)
3. **Description** (what does this endpoint do?)
4. **Auth required?** (yes/no)
5. **Request body schema** (if POST/PUT/PATCH)

## Steps

1. Create route directory:
   ```bash
   mkdir -p src/app/[route-path]
   ```

2. Generate `route.ts` with proper structure:

   ```typescript
   // src/app/[route-path]/route.ts
   import { NextRequest, NextResponse } from 'next/server';
   import { z } from 'zod';
   import { createClient } from '@/lib/supabase/server';

   // Input validation schema
   const RequestSchema = z.object({
     // TODO: Define request body schema
   });

   export async function [METHOD](request: NextRequest) {
     try {
       // 1. Authentication (if required)
       const supabase = await createClient();
       const { data: { user }, error: authError } = await supabase.auth.getUser();

       if (authError || !user) {
         return NextResponse.json(
           { error: 'Unauthorized' },
           { status: 401 }
         );
       }

       // 2. Parse and validate request body
       const body = await request.json();
       const validatedData = RequestSchema.parse(body);

       // 3. Business logic
       // TODO: Implement endpoint logic

       // 4. Return success response
       return NextResponse.json({
         success: true,
         data: {
           // TODO: Return data
         }
       });

     } catch (error) {
       // Handle validation errors
       if (error instanceof z.ZodError) {
         return NextResponse.json(
           {
             error: 'Invalid request',
             details: error.errors
           },
           { status: 400 }
         );
       }

       // Handle other errors
       console.error('[ROUTE_NAME] Error:', error);
       return NextResponse.json(
         { error: 'Internal server error' },
         { status: 500 }
       );
     }
   }
   ```

3. Generate type definitions:
   ```typescript
   // src/app/[route-path]/types.ts
   import { z } from 'zod';

   export const RequestSchema = z.object({
     // Schema fields
   });

   export type Request = z.infer<typeof RequestSchema>;

   export interface Response {
     success: boolean;
     data?: any;
     error?: string;
   }
   ```

4. Create README for the endpoint:
   ```markdown
   # [Endpoint Name]

   [Description]

   ## Endpoint
   `[METHOD] /api/[path]`

   ## Authentication
   [Required/Not required]

   ## Request Body
   ```json
   {
     // Example request
   }
   ```

   ## Response
   ```json
   {
     "success": true,
     "data": {}
   }
   ```

   ## Errors
   - 400: Invalid request
   - 401: Unauthorized
   - 500: Server error
   ```

5. Offer to generate client-side hook:
   ```typescript
   // src/features/[feature]/hooks/use[Endpoint].ts
   'use client';

   import { useState } from 'react';

   export function use[Endpoint]() {
     const [loading, setLoading] = useState(false);
     const [error, setError] = useState<string | null>(null);

     const call = async (data: Request) => {
       setLoading(true);
       setError(null);

       try {
         const response = await fetch('/api/[path]', {
           method: '[METHOD]',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(data)
         });

         const result = await response.json();

         if (!response.ok) {
           throw new Error(result.error || 'Request failed');
         }

         return result.data;
       } catch (err) {
         setError(err.message);
         throw err;
       } finally {
         setLoading(false);
       }
     };

     return { call, loading, error };
   }
   ```

6. Report summary:
   ```
   ✅ API endpoint created successfully!

   Created:
   - src/app/[route-path]/route.ts
   - src/app/[route-path]/types.ts
   - src/app/[route-path]/README.md
   - src/features/[feature]/hooks/use[Endpoint].ts

   Next steps:
   1. Implement business logic in route.ts
   2. Define request schema in types.ts
   3. Test with: curl -X [METHOD] http://localhost:3000/api/[path]
   ```

## Security Features

All generated APIs include:
- ✅ Input validation with Zod
- ✅ Authentication checks
- ✅ Type safety
- ✅ Error handling
- ✅ Proper HTTP status codes
- ✅ CORS handling (if needed)
- ✅ Rate limiting placeholder

## Example

```
User: Create an API to generate videos with Replicate
Claude: I'll create a video generation API endpoint.
[Creates /api/videos/generate with auth, validation, error handling]
```

## Testing

After generation, suggest:
```bash
# Test the endpoint
curl -X POST http://localhost:3000/api/[path] \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```
