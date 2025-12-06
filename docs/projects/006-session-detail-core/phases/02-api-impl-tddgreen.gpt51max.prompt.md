# Phase 2: API Implementation + TDD Green (GPT 5.1 Max)

## Objective

Make all 25 failing Phase 1 tests pass by implementing real logic. The tests assert actual expected behavior - your implementation must satisfy those assertions.

## Current State

- **25 tests failing** in `test/session-turns.test.ts`
- Tests assert REAL behavior (return values, data structures)
- Tests fail because service functions throw `NotImplementedError`
- Your job: implement the functions so tests pass

## Critical: UUID Validation Issue

The router validates session ID as UUID format, but tests use `test-session-id`. You must fix this:

**Option A (Recommended):** Update test fixture path and test to use a valid UUID:
- Rename `test/fixtures/session-turns/projects/demo/test-session-id.jsonl` to use a UUID
- Update `validSessionId` in `test/session-turns.test.ts` to match

**Option B:** Relax the UUID validation in the router (less ideal for production)

## Test Fixture Setup

Tests configure:
```typescript
process.env.CLAUDE_DIR = path.join(process.cwd(), "test/fixtures/session-turns");
```

The `findSessionFile()` function looks for sessions in `$CLAUDE_DIR/projects/`. Fixture exists at:
`test/fixtures/session-turns/projects/demo/test-session-id.jsonl`

## Reference Files

Read these in parallel:
- `test/session-turns.test.ts` - **THE SPEC** - tests define expected behavior
- `test/fixtures/session-turns/projects/demo/*.jsonl` - test fixture data
- `src/services/session-clone.ts` - `findSessionFile`, `parseSession`, `identifyTurns`
- `src/services/compression.ts` - `estimateTokens`
- `src/services/session-turns.ts` - stubs to implement

## Implementation Logic

### classifyBlock(block)
```typescript
if (block.type === "thinking") return "thinking";
if (block.type === "tool_use" || block.type === "tool_result") return "tool";
return "text";
```

### calculateCumulativeTokens(entries, turns, upToTurnIndex)
- Iterate turns 0 through upToTurnIndex
- For each entry in turn range, classify blocks and sum tokens
- Bucket: user text → user, assistant text → assistant, thinking → thinking, tool → tool
- Total = sum of all buckets

### extractTurnContent(entries, turn)
- Find user entry in turn range → extract text as `userPrompt`
- Find assistant entry → extract text blocks (excluding thinking) as `assistantResponse`
- Collect tool_use blocks as `toolBlocks: { name, content: JSON.stringify(input) }`

### getSessionTurns(sessionId)
1. `findSessionFile(sessionId)` → path (throws SessionNotFoundError if missing)
2. Read file, `parseSession(content)` → entries
3. `identifyTurns(entries)` → turns
4. For each turn: `calculateCumulativeTokens()`, `extractTurnContent()`
5. Return `{ sessionId, totalTurns: turns.length, turns: [...] }`

## Constraints

- Reuse `findSessionFile`, `parseSession`, `identifyTurns`, `estimateTokens`
- No broad try/catch - let errors propagate
- Match test assertions exactly

## Verification

```bash
npm run typecheck
npm test  # All 25 session-turns tests pass
```

## Edge Case Fixtures

Create fixtures in `test/fixtures/session-turns/projects/demo/` with valid UUID names:

| Fixture | Purpose |
|---------|---------|
| `00000000-0000-0000-0000-000000000001.jsonl` | Empty session - summary only, no user/assistant entries |
| `00000000-0000-0000-0000-000000000002.jsonl` | Single turn - one user + one assistant |
| `00000000-0000-0000-0000-000000000003.jsonl` | Only-user - user message with no assistant response |
| `00000000-0000-0000-0000-000000000004.jsonl` | Heavy thinking - 10k+ char thinking blocks |
| `00000000-0000-0000-0000-000000000005.jsonl` | Heavy tools - 10+ tool_use/tool_result per turn |
| `00000000-0000-0000-0000-000000000006.jsonl` | Large session - 100+ turns for cumulative growth |
| `00000000-0000-0000-0000-000000000007.jsonl` | Mixed content - string and array content for user/assistant |
| `00000000-0000-0000-0000-000000000008.jsonl` | Tool-result user - user message with only tool_result blocks |
| `00000000-0000-0000-0000-000000000009.jsonl` | Meta entries - includes summary, file-history-snapshot, isMeta entries |

Add tests for each edge case:
- Empty session returns `{ totalTurns: 0, turns: [] }`
- Single turn: cumulative equals that turn's tokens exactly
- Only-user: handles turn with no assistant response gracefully
- Heavy thinking: correctly buckets to thinking (not assistant)
- Heavy tools: correctly buckets all tool_use/tool_result to tool
- Large session: cumulative tokens grow monotonically across 100+ turns
- Mixed content: handles both `content: "string"` and `content: [{type:"text",...}]`
- Tool-result user: tool_result in user message buckets to tool
- Meta entries: summary/file-history-snapshot/isMeta entries are skipped (not counted)

## Done When

- All 25 existing session-turns tests pass
- Edge case tests added and passing
- All pre-existing tests still pass
- `GET /api/session/{uuid}/turns` returns 200 with turn data
- `GET /api/session/{invalid}/turns` returns 400
- `GET /api/session/{unknown-uuid}/turns` returns 404

Complete the entire phase. Deliver working code, not a plan.
