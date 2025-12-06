# Phase 1: API Skeleton + TDD Red (GPT 5.1 Max)

## Objective

Create the complete API skeleton for Session Detail Core: types, inline schemas, service stubs (throwing `NotImplementedError`), router, and TDD tests that pass by expecting those errors.

## Constraints

- All service functions throw `NotImplementedError` - no real logic
- Schemas inline in router file (follow `src/routes/session-structure.ts` pattern)
- Types in `src/types.ts`
- Tests in `test/session-turns.test.ts`
- Reuse existing: `findSessionFile`, `parseSession`, `identifyTurns` from `session-clone.ts`; `estimateTokens` from `compression.ts`
- Use existing error classes from `src/errors.ts`

## Reference Files

Read these in parallel before starting:
- `src/routes/session-structure.ts` - router pattern with inline schemas
- `src/services/session-clone.ts` - reusable functions and types
- `src/types.ts` - existing type definitions
- `src/errors.ts` - existing error classes
- `test/compression-core.test.ts` - test pattern

## Deliverables

1. **Types** (`src/types.ts` additions):
   - `TokensByType` - { user, assistant, thinking, tool, total: number }
   - `ToolBlock` - { name, content: string }
   - `TurnContent` - { userPrompt, toolBlocks, assistantResponse }
   - `TurnData` - { turnIndex, cumulative: TokensByType, content: TurnContent }
   - `SessionTurnsResponse` - { sessionId, totalTurns, turns: TurnData[] }

2. **Router** (`src/routes/session-turns.ts`):
   - Inline Zod schemas (UUID validation via regex)
   - `GET /session/:id/turns`
   - Import `validate` from `express-zod-safe`
   - Error handling: 400 (validation), 404 (SessionNotFoundError), 501 (NotImplementedError), 500 (other)

3. **Service** (`src/services/session-turns.ts`):
   - `getSessionTurns(sessionId): Promise<SessionTurnsResponse>` - throws NotImplementedError
   - `calculateCumulativeTokens(entries, turns, upToTurnIndex): TokensByType` - throws NotImplementedError
   - `extractTurnContent(entries, turn): TurnContent` - throws NotImplementedError
   - `classifyBlock(block): "text" | "thinking" | "tool"` - throws NotImplementedError

4. **Server** (`src/server.ts`):
   - Register `sessionTurnsRouter` at `/api`

5. **Fixtures**:
   - Create `test/fixtures/session-turns/` directory

6. **Tests** (`test/session-turns.test.ts`):
   - Schema: valid UUID passes, invalid fails
   - Router: invalid UUID → 400, valid UUID → 501
   - Service: all 4 functions throw NotImplementedError

## Verification

```bash
npm run typecheck  # Must pass
npm test           # All tests pass (existing + new)
curl localhost:3000/api/session/valid-uuid/turns  # Returns 501
curl localhost:3000/api/session/invalid/turns     # Returns 400
```

## Done When

- TypeScript compiles
- All existing tests pass
- New tests pass (expecting NotImplementedError)
- Endpoint returns 501 for valid UUID, 400 for invalid

Complete the entire phase. Deliver working code, not a plan.
