# Phase 1: API Skeleton + TDD Red

## Role

You are a Senior TypeScript/Node.js Engineer implementing the API skeleton for the Session Detail Core feature. Your task is to create all module scaffolding, type definitions, Zod schemas, and TDD test cases. All service functions should throw `NotImplementedError`. Tests should pass by expecting `NotImplementedError` or validating schema/routing behavior.

---

## Application Overview

**coding-agent-manager** is a web application for managing Claude Code sessions. It provides:
- Session cloning with tool/thinking removal
- LLM-based message compression
- Session structure visualization

**Tech Stack:** Express.js, TypeScript, Vitest, Zod, D3.js (frontend)

**Key Patterns:**
- Routes in `src/routes/` (schemas inline, see `session-structure.ts` for pattern)
- Services in `src/services/`
- Types in `src/types.ts`
- Tests in `test/`
- Test fixtures in `test/fixtures/`

**Reusable Functions (DO USE THESE):**
- `findSessionFile(sessionId)` from `src/services/session-clone.ts` - locates session JSONL
- `parseSession(content)` from `src/services/session-clone.ts` - parses JSONL to entries
- `identifyTurns(entries)` from `src/services/session-clone.ts` - detects turn boundaries
- `estimateTokens(text)` from `src/services/compression.ts` - token count estimation

---

## Feature Overview

**Session Detail Core** provides a turn-by-turn visualization of cumulative context consumption. Users enter a session ID and see:
- Turn navigation controls (buttons, input, slider)
- Vertical band visualization showing cumulative tokens by type (User, Assistant, Thinking, Tool)
- A scale input (50k-2000k) with auto-expand warning
- A turn detail card showing the selected turn's content

This phase focuses on the API layer: the endpoint that returns turn-organized session data.

---

## Phase Scope

Create the complete API skeleton with:
1. All TypeScript types for the feature
2. Zod schemas for request validation and response structure
3. Express router with endpoint stub
4. Service module with function stubs that throw `NotImplementedError`
5. TDD test cases that pass for the correct reasons

**This phase does NOT implement logic.** All service functions throw `NotImplementedError`.

---

## Reference Documents

### Feature Specification
**File:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/docs/projects/006-session-detail-core/01-session-detail-core.feature.md`

Contains acceptance criteria (AC-1 through AC-28) and test conditions (TC-01 through TC-19). For this phase, focus on:
- AC-24 through AC-28 (API requirements)
- TC-18, TC-19 (API test conditions)

### Technical Design
**File:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/docs/projects/006-session-detail-core/02-session-detail-core.tech-design.md`

Contains:
- Module architecture (Section 3)
- Method inventory with type definitions (Section 5)
- Testing strategy (Section 7)
- Phase 1 deliverables (Section 8)

---

## Step-by-Step Implementation

### Step 1: Add Types to `src/types.ts`

Add the following types:

```typescript
interface TokensByType {
  user: number;
  assistant: number;
  thinking: number;
  tool: number;
  total: number;
}

interface ToolBlock {
  name: string;
  content: string;
}

interface TurnContent {
  userPrompt: string;
  toolBlocks: ToolBlock[];
  assistantResponse: string;
}

interface TurnData {
  turnIndex: number;
  cumulative: TokensByType;
  content: TurnContent;
}

interface SessionTurnsResponse {
  sessionId: string;
  totalTurns: number;
  turns: TurnData[];
}
```

### Step 2: Create Fixtures Directory

Create `test/fixtures/session-turns/` directory for test fixtures. Add a placeholder README or small test JSONL file. This directory will hold session fixtures for integration tests.

```
test/fixtures/session-turns/
└── README.md  # "Test fixtures for session-turns tests"
```

### Step 3: Create Service File `src/services/session-turns.ts`

Create stub functions that throw `NotImplementedError`:

```typescript
export async function getSessionTurns(sessionId: string): Promise<SessionTurnsResponse> {
  throw new NotImplementedError("getSessionTurns");
}

export function calculateCumulativeTokens(
  entries: SessionEntry[],
  turns: Turn[],
  upToTurnIndex: number
): TokensByType {
  throw new NotImplementedError("calculateCumulativeTokens");
}

export function extractTurnContent(
  entries: SessionEntry[],
  turn: Turn
): TurnContent {
  throw new NotImplementedError("extractTurnContent");
}

export function classifyBlock(block: ContentBlock): "text" | "thinking" | "tool" {
  throw new NotImplementedError("classifyBlock");
}
```

### Step 4: Create Router File `src/routes/session-turns.ts`

**Pattern:** Follow `session-structure.ts` - define Zod schemas inline at top of file.

Create Express router with inline schemas:

```typescript
import { Router } from "express";
import { z } from "zod";
import validate from "express-zod-safe";
import { getSessionTurns } from "../services/session-turns.js";
import { SessionNotFoundError, NotImplementedError } from "../errors.js";

// Schemas (inline per existing pattern)
const SessionIdParamsSchema = z.object({
  id: z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid session ID format"
  )
});

export const sessionTurnsRouter = Router();

sessionTurnsRouter.get("/session/:id/turns", async (req, res) => {
  // 1. Validate params
  // 2. Call getSessionTurns(id)
  // 3. Handle errors: ValidationError → 400, SessionNotFoundError → 404, NotImplementedError → 501, Other → 500
});
```

### Step 5: Register Router in `src/server.ts`

- Import `sessionTurnsRouter`
- Register at `/api`

### Step 6: Create Test File `test/session-turns.test.ts`

**Note:** Follow existing pattern in `test/compression-core.test.ts`. See tech design Section 7 for test conditions with expected inputs/outputs.

Write TDD tests that pass for correct reasons:

**Schema Tests:**
- Valid UUID passes validation
- Invalid UUID fails validation

**Router Tests:**
- Invalid UUID returns 400
- Valid UUID returns 501 (NotImplementedError)

**Service Tests:**
- `getSessionTurns()` throws NotImplementedError
- `calculateCumulativeTokens()` throws NotImplementedError
- `extractTurnContent()` throws NotImplementedError
- `classifyBlock()` throws NotImplementedError

**Example test for NotImplementedError:**
```typescript
it('should throw NotImplementedError', () => {
  expect(() => classifyBlock({} as ContentBlock)).toThrow(NotImplementedError);
});

it('should throw NotImplementedError', async () => {
  await expect(getSessionTurns('test-id')).rejects.toThrow(NotImplementedError);
});
```

### Step 7: Verify

- Run `npm run typecheck` - should pass
- Run `npm test` - all tests should pass
- Run `npm run dev` and test endpoint manually

---

## Coding Standards

### TypeScript
- Use strict types, no `any`
- Export types from `src/types.ts`
- Use `import type` for type-only imports

### Zod Schemas
- Define inline in router file (follow `session-structure.ts` pattern)
- Use `.regex()` for UUID validation
- No separate schema file needed

### Error Handling
- Use `NotImplementedError` from `src/errors.ts`
- Router catches errors and returns appropriate status codes

### Testing
- Use Vitest
- Group tests with `describe()`
- Use `it()` for test cases
- Mock file system for service tests

---

## Definition of Done

- [ ] Types added to `src/types.ts` (TokensByType, ToolBlock, TurnContent, TurnData, SessionTurnsResponse)
- [ ] Fixtures directory created: `test/fixtures/session-turns/`
- [ ] Service file created: `src/services/session-turns.ts` with 4 stub functions
- [ ] Router file created: `src/routes/session-turns.ts` (with inline schemas)
- [ ] Router registered in `src/server.ts`
- [ ] Test file created: `test/session-turns.test.ts`
- [ ] TypeScript compiles without errors
- [ ] All existing tests pass (170+ tests)
- [ ] All new tests pass (for correct reasons - expecting NotImplementedError)
- [ ] `GET /api/session/:id/turns` returns 501 for valid UUID
- [ ] `GET /api/session/:id/turns` returns 400 for invalid UUID

---

## Output Format

Upon completion, provide a report in this format:

```markdown
# Phase 1 Completion Report: API Skeleton + TDD Red

## Files Created
- [ ] `src/types.ts` (modified - added X types)
- [ ] `test/fixtures/session-turns/` (directory with README)
- [ ] `src/services/session-turns.ts`
- [ ] `src/routes/session-turns.ts` (with inline schemas)
- [ ] `src/server.ts` (modified - registered router)
- [ ] `test/session-turns.test.ts`

## Definition of Done Checklist
- [ ] Types added to src/types.ts
- [ ] Fixtures directory created
- [ ] Service file created with stub functions
- [ ] Router file created (inline schemas)
- [ ] Router registered
- [ ] Test file created
- [ ] TypeScript compiles: `npm run typecheck` result
- [ ] Existing tests pass: X/Y tests
- [ ] New tests pass: X tests added, all passing
- [ ] GET returns 501 for valid UUID: verified
- [ ] GET returns 400 for invalid UUID: verified

## Standards Adherence
- [ ] No `any` types used
- [ ] Zod schemas follow existing patterns
- [ ] Error handling uses NotImplementedError
- [ ] Tests use describe/it pattern

## Implementation Notes
[Any notes about implementation decisions, challenges, or deviations]

## Feedback & Recommendations
[Observations about the app, phase spec, feature design, or general recommendations based on what was encountered during implementation]
```
