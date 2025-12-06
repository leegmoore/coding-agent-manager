# Phase 2: API Implementation + TDD Green

## Role

You are a Senior TypeScript/Node.js Engineer implementing the API logic for the Session Detail Core feature. Your task is to implement all service functions so that the TDD tests from Phase 1 pass with real logic (not NotImplementedError). You will also add additional tests for edge cases discovered during implementation.

---

## Application Overview

**coding-agent-manager** is a web application for managing Claude Code sessions. It provides:
- Session cloning with tool/thinking removal
- LLM-based message compression
- Session structure visualization

**Tech Stack:** Express.js, TypeScript, Vitest, Zod, D3.js (frontend)

**Existing Code to Reuse:**
- `findSessionFile()` in `src/services/session-clone.ts` - locates session JSONL
- `parseSession()` in `src/services/session-clone.ts` - parses JSONL to entries
- `identifyTurns()` in `src/services/session-clone.ts` - detects turn boundaries
- `estimateTokens()` in `src/services/compression.ts` - estimates token count

---

## Feature Overview

**Session Detail Core** provides a turn-by-turn visualization of cumulative context consumption. The API must:
1. Load a session by ID
2. Parse entries and identify turns
3. For each turn, calculate cumulative tokens by type (user, assistant, thinking, tool)
4. Extract turn content (user prompt, tool blocks, assistant response)
5. Return structured response

---

## Phase Scope

Implement all service logic:
1. `getSessionTurns()` - Main entry point, orchestrates the flow
2. `calculateCumulativeTokens()` - Sums tokens by type from turn 0 through N
3. `extractTurnContent()` - Extracts user prompt, tool blocks, assistant response
4. `classifyBlock()` - Classifies content blocks into types

All Phase 1 tests should pass with real implementation. Add tests for edge cases.

---

## Reference Documents

### Feature Specification
**File:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/docs/projects/006-session-detail-core/01-session-detail-core.feature.md`

Focus on:
- AC-24 through AC-28 (API requirements)
- TC-18: Cumulative token calculation
- TC-19: Turn content extraction

### Technical Design
**File:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/docs/projects/006-session-detail-core/02-session-detail-core.tech-design.md`

Focus on:
- Method inventory (Section 5) - function signatures and logic descriptions
- Sequence diagram (Section 4) - flow of operations

### Phase 1 Implementation
Review the files created in Phase 1:
- `src/services/session-turns.ts` - stubs to implement
- `test/session-turns.test.ts` - tests to make pass

---

## Step-by-Step Implementation

### Step 0: Required Imports

Add these imports at the top of `src/services/session-turns.ts`:

```typescript
import fs from "fs/promises";
import { findSessionFile, parseSession, identifyTurns } from "./session-clone.js";
import { estimateTokens } from "./compression.js";
import { SessionNotFoundError } from "../errors.js";
```

### Step 1: Implement `classifyBlock()`

**Logic:**
- If block.type is "thinking" → return "thinking"
- If block.type is "tool_use" or "tool_result" → return "tool"
- Otherwise → return "text"

```typescript
export function classifyBlock(block: ContentBlock): "text" | "thinking" | "tool" {
  // Implement based on logic above
  // Hint: simple if/else or switch on block.type
}
```

### Step 2: Implement `calculateCumulativeTokens()`

**Logic (pseudocode):**
```
Initialize result = { user: 0, assistant: 0, thinking: 0, tool: 0, total: 0 }

For each turn from 0 to upToTurnIndex:
  For each entry in turn (from turn.startIndex to turn.endIndex):
    Skip if: no message, isMeta, type is "summary" or "file-history-snapshot"

    If content is string:
      tokens = estimateTokens(content)
      Add to user or assistant based on entry.type

    If content is array:
      For each block:
        blockType = classifyBlock(block)
        blockText = block.text OR block.thinking OR JSON.stringify(block)
        tokens = estimateTokens(blockText)
        Add to appropriate bucket (thinking, tool, user, or assistant)

result.total = sum of all buckets
Return result
```

**Implementation Notes:**
- Use `estimateTokens()` from compression.ts
- Use `classifyBlock()` from Step 1
- For text extraction from blocks: check `block.text`, then `block.thinking`, fallback to JSON.stringify

### Step 3: Implement `extractTurnContent()`

**Logic (pseudocode):**
```
Initialize: userPrompt = "", toolBlocks = [], assistantResponse = ""

For each entry in turn (from turn.startIndex to turn.endIndex):
  Skip if: no message or isMeta

  If entry.type is "user":
    If content is string: userPrompt = content
    If content is array: extract text from blocks with type "text", join with newlines

  If entry.type is "assistant":
    If content is array:
      For each block:
        If block.type is "tool_use":
          Push { name: block.name, content: JSON.stringify(block.input) } to toolBlocks
        If block.type is "text":
          Append block.text to assistantResponse
        (Skip thinking blocks - not shown in detail card)
    If content is string: assistantResponse = content

Return { userPrompt, toolBlocks, assistantResponse }
```

**Implementation Notes:**
- User entries with tool_result blocks are continuations, not new prompts - extract only text blocks
- Tool blocks store the input as JSON string for display
- Thinking blocks are counted in tokens but not shown in detail card

### Step 4: Implement `getSessionTurns()`

**Logic (pseudocode):**
```
sessionPath = await findSessionFile(sessionId)
If not found: throw SessionNotFoundError(sessionId)

content = await fs.readFile(sessionPath, "utf-8")
entries = parseSession(content)
turns = identifyTurns(entries)

turnsData = []
For i from 0 to turns.length - 1:
  Push {
    turnIndex: i,
    cumulative: calculateCumulativeTokens(entries, turns, i),
    content: extractTurnContent(entries, turns[i])
  }

Return {
  sessionId,
  totalTurns: turns.length,
  turns: turnsData
}
```

**Implementation Notes:**
- Reuse `findSessionFile`, `parseSession`, `identifyTurns` from session-clone.ts
- Use `fs.readFile` with "utf-8" encoding
- Call your implemented functions from Steps 1-3

### Step 5: Update Router Error Handling

Ensure the router handles:
- `SessionNotFoundError` → 404
- `ZodError` → 400
- Other errors → 500

Remove the 501 NotImplementedError handling (no longer needed).

### Step 6: Add Edge Case Tests

Add tests for:
- Empty session (0 turns)
- Session with only user messages (no assistant)
- Session with heavy thinking blocks
- Session with many tool calls
- Large session (100+ turns)

### Step 7: Create Test Fixtures

Create fixture files in `test/fixtures/session-turns/`:
- `session-basic.jsonl` - Simple session for basic tests
- `session-heavy-thinking.jsonl` - Session with lots of thinking blocks
- `session-heavy-tools.jsonl` - Session with lots of tool calls

### Step 8: Verify

- Run `npm run typecheck` - should pass
- Run `npm test` - all tests should pass (Phase 1 tests now pass with real logic)
- Test with real session IDs manually

---

## Coding Standards

### TypeScript
- Use strict types, no `any`
- Handle null/undefined gracefully
- Use early returns for guard clauses

### Service Functions
- Pure functions where possible
- Single responsibility
- Reuse existing utilities (`estimateTokens`, `findSessionFile`, etc.)

### Error Handling
- Throw `SessionNotFoundError` for missing sessions
- Let Zod handle validation errors
- Log unexpected errors before rethrowing

### Testing
- Test happy path and edge cases
- Use fixtures for consistent test data
- Mock file system, not service functions

---

## Definition of Done

- [ ] `classifyBlock()` implemented and tested
- [ ] `calculateCumulativeTokens()` implemented and tested
- [ ] `extractTurnContent()` implemented and tested
- [ ] `getSessionTurns()` implemented and tested
- [ ] Router returns 404 for missing session (not 501)
- [ ] Router returns 200 with valid data for valid session
- [ ] All Phase 1 tests pass with real implementation
- [ ] Edge case tests added and passing
- [ ] Test fixtures created
- [ ] TypeScript compiles without errors
- [ ] All tests pass

---

## Output Format

Upon completion, provide a report in this format:

```markdown
# Phase 2 Completion Report: API Implementation + TDD Green

## Files Modified
- [ ] `src/services/session-turns.ts` (implemented all functions)
- [ ] `src/routes/session-turns.ts` (updated error handling)
- [ ] `test/session-turns.test.ts` (added edge case tests)

## Files Created
- [ ] `test/fixtures/session-turns/session-basic.jsonl`
- [ ] `test/fixtures/session-turns/session-heavy-thinking.jsonl`
- [ ] `test/fixtures/session-turns/session-heavy-tools.jsonl`

## Definition of Done Checklist
- [ ] classifyBlock() implemented
- [ ] calculateCumulativeTokens() implemented
- [ ] extractTurnContent() implemented
- [ ] getSessionTurns() implemented
- [ ] Router returns 404 for missing session
- [ ] Router returns 200 for valid session
- [ ] Phase 1 tests pass with real implementation
- [ ] Edge case tests added: X new tests
- [ ] Test fixtures created
- [ ] TypeScript compiles: `npm run typecheck` result
- [ ] All tests pass: X/Y tests

## Standards Adherence
- [ ] No `any` types used
- [ ] Pure functions where possible
- [ ] Existing utilities reused
- [ ] Error handling follows patterns

## Test Coverage Summary
| Function | Tests | Edge Cases |
|----------|-------|------------|
| classifyBlock | X | Y |
| calculateCumulativeTokens | X | Y |
| extractTurnContent | X | Y |
| getSessionTurns | X | Y |

## Implementation Notes
[Any notes about implementation decisions, challenges, or deviations]

## Feedback & Recommendations
[Observations about the app, phase spec, feature design, or general recommendations based on what was encountered during implementation]
```
