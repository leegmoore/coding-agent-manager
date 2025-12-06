# Phase 2: API Implementation + TDD Green (GPT 5.1 Max)

## Objective

Implement all service functions so Phase 1 TDD tests pass with real logic. The API should load session JSONL, organize by turns, calculate cumulative tokens by type, and extract turn content.

## Constraints

- Reuse existing functions - don't rewrite what exists
- Follow codebase conventions (check existing services first)
- No broad try/catch - propagate errors explicitly
- Batch file reads when possible

## Reference Files

Read these in parallel before implementing:
- `src/services/session-clone.ts` - `findSessionFile`, `parseSession`, `identifyTurns`, `Turn` type
- `src/services/compression.ts` - `estimateTokens`
- `src/services/session-turns.ts` - your stubs from Phase 1
- `test/session-turns.test.ts` - tests to make pass

## Implementation Logic

### getSessionTurns(sessionId)
1. `findSessionFile(sessionId)` → path
2. Read file, `parseSession(content)` → entries
3. `identifyTurns(entries)` → turns array
4. For each turn: calculate cumulative tokens, extract content
5. Return `{ sessionId, totalTurns, turns }`

### calculateCumulativeTokens(entries, turns, upToTurnIndex)
Sum tokens by type from turn 0 through upToTurnIndex:
- Iterate entries within turn boundaries
- Classify each block using `classifyBlock()`
- `estimateTokens(text)` for token count
- Bucket assignment: thinking→thinking, tool→tool, text+user→user, text+assistant→assistant

### extractTurnContent(entries, turn)
From entries in turn range, extract:
- `userPrompt`: text content from user entry
- `toolBlocks`: `{ name, content }` from tool_use blocks
- `assistantResponse`: text content from assistant (excluding thinking/tool)

### classifyBlock(block)
- `{ type: "thinking" }` → "thinking"
- `{ type: "tool_use" }` or `{ type: "tool_result" }` → "tool"
- `{ type: "text" }` → "text"

## Verification

```bash
npm run typecheck
npm test  # All tests pass with real logic
curl localhost:3000/api/session/{valid-session-id}/turns  # Returns turn data
```

## Done When

- All Phase 1 tests pass with real implementations
- API returns correct cumulative token counts
- Turn content extraction works for user prompts, tools, assistant responses
- Edge cases handled: empty sessions, single turn, tool-heavy sessions

Complete the entire phase. Deliver working code, not a plan.
