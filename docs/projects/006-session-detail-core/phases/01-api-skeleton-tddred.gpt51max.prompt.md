# Phase 1: API Skeleton + TDD Red (GPT 5.1 Max)

## Objective

Create the complete API skeleton for Session Detail Core: types, inline schemas, service stubs, router, and **TDD Red tests that assert REAL behavior and FAIL**.

**CRITICAL:** TDD Red means tests assert real expected behavior. Tests FAIL because stubs throw `NotImplementedError`. When Phase 2 implements real logic, these same tests will PASS.

## Constraints

- All service functions throw `NotImplementedError` - no real logic
- Schemas inline in router file (follow `src/routes/session-structure.ts` pattern)
- Types in `src/types.ts`
- Tests assert REAL behavior (return values, structures) - NOT `NotImplementedError`
- Use existing error classes from `src/errors.ts`

## Reference Files

Read these in parallel:
- `src/routes/session-structure.ts` - router pattern with inline schemas
- `src/services/session-clone.ts` - `findSessionFile`, `parseSession`, `identifyTurns`
- `src/services/compression.ts` - `estimateTokens`
- `src/types.ts` - existing type definitions
- `src/errors.ts` - existing error classes

## Deliverables

### 1. Types (`src/types.ts`)
```typescript
interface TokensByType { user, assistant, thinking, tool, total: number }
interface ToolBlock { name: string, content: string }
interface TurnContent { userPrompt: string, toolBlocks: ToolBlock[], assistantResponse: string }
interface TurnData { turnIndex: number, cumulative: TokensByType, content: TurnContent }
interface SessionTurnsResponse { sessionId: string, totalTurns: number, turns: TurnData[] }
```

### 2. Router (`src/routes/session-turns.ts`)
- Inline Zod schema with UUID regex validation
- `GET /session/:id/turns`
- Error handling: 400 (validation), 404 (SessionNotFoundError), 501 (NotImplementedError), 500 (other)

### 3. Service (`src/services/session-turns.ts`)
All functions throw `NotImplementedError`:
- `getSessionTurns(sessionId): Promise<SessionTurnsResponse>`
- `calculateCumulativeTokens(entries, turns, upToTurnIndex): TokensByType`
- `extractTurnContent(entries, turn): TurnContent`
- `classifyBlock(block): "text" | "thinking" | "tool"`

### 4. Server (`src/server.ts`)
- Register `sessionTurnsRouter` at `/api`

### 5. Test Fixture
Create `test/fixtures/session-turns/projects/demo/<valid-uuid>.jsonl` with 2-3 turns including user messages, assistant responses, thinking blocks, and tool calls.

### 6. Tests (`test/session-turns.test.ts`)

**Tests assert REAL behavior. They will FAIL because stubs throw NotImplementedError.**

```typescript
// classifyBlock - expects real return values
expect(classifyBlock({ type: "text", text: "hello" })).toBe("text");
expect(classifyBlock({ type: "thinking", thinking: "..." })).toBe("thinking");
expect(classifyBlock({ type: "tool_use", id: "1", name: "read" })).toBe("tool");
expect(classifyBlock({ type: "tool_result", tool_use_id: "1" })).toBe("tool");

// calculateCumulativeTokens - expects real token counts
expect(calculateCumulativeTokens([], [], 0)).toEqual({ user: 0, assistant: 0, thinking: 0, tool: 0, total: 0 });
expect(result.user).toBeGreaterThan(0);
expect(result.total).toBe(result.user + result.assistant + result.thinking + result.tool);
expect(turn1.total).toBeGreaterThan(turn0.total); // cumulative growth

// extractTurnContent - expects real content extraction
expect(result.userPrompt).toBe("hello world");
expect(result.assistantResponse).toBe("response text");
expect(result.assistantResponse).not.toContain("thinking"); // thinking excluded
expect(result.toolBlocks[0].name).toBe("read_file");

// getSessionTurns - expects real response structure
expect(result.sessionId).toBe(testSessionId);
expect(result.totalTurns).toBe(result.turns.length);
expect(result.turns[0].cumulative).toHaveProperty("total");

// Router - validation tests CAN pass
expect(res.status).toBe(400); // invalid UUID
```

## Verification

```bash
npm run typecheck  # Must pass
npm test           # Behavior tests FAIL, validation tests pass
```

## Done When

- TypeScript compiles
- All existing tests pass
- Router validation tests pass (400 for invalid UUID)
- **Behavior tests FAIL** (stubs throw NotImplementedError) - THIS IS CORRECT TDD RED

| Test Category | Expected Result |
|---------------|-----------------|
| Existing tests | PASS |
| classifyBlock tests | FAIL |
| calculateCumulativeTokens tests | FAIL |
| extractTurnContent tests | FAIL |
| getSessionTurns tests | FAIL |
| Router 400 validation | PASS |

Complete the entire phase. Deliver working code, not a plan.
