# Phase 2: Core Logic (TDD)

## Goal

Implement turn-to-band mapping, task creation, and text extraction/application through TDD.

## Context

**Project:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/`

Phase 1 created the skeleton. Now implement core compression logic using test-driven development.

## Test File

Create `test/compression-core.test.ts`

## Test Setup

```typescript
import { describe, it, expect } from "vitest";
import {
  mapTurnsToBands,
  createCompressionTasks,
  estimateTokens,
  extractTextContent,
  applyCompressedContent,
  applyCompressionResults
} from "../src/services/compression.js";
import type { Turn, CompressionBand, SessionEntry, CompressionTask } from "../src/types.js";
```

---

## TDD Red: Write Tests

### TC-10: Empty Compression Bands

**Input:**
- Bands: `[]` (empty array)

**Expected:**
- Returns entries unchanged
- Stats show 0 messages compressed

**Test structure:**
```typescript
it("TC-10: returns unchanged when no compression bands", async () => {
  const entries = [/* fixture entries */];
  const turns = [{ startIndex: 0, endIndex: 1 }];
  const bands = [];

  const result = await compressMessages(entries, turns, bands, config);

  expect(result.entries).toEqual(entries);
  expect(result.stats.messagesCompressed).toBe(0);
});
```

### TC-03: Multiple Non-Contiguous Bands

**Input:**
- 10 turns (indices 0-9)
- Bands: `[{start: 0, end: 30, level: "heavy-compress"}, {start: 50, end: 80, level: "compress"}]`

**Expected mapping:**
- Turn 0 (0%): heavy-compress
- Turn 1 (10%): heavy-compress
- Turn 2 (20%): heavy-compress
- Turn 3 (30%): null (30 is not < 30)
- Turn 4 (40%): null
- Turn 5 (50%): compress
- Turn 6 (60%): compress
- Turn 7 (70%): compress
- Turn 8 (80%): null
- Turn 9 (90%): null

**Test structure:**
```typescript
it("TC-03: maps turns to multiple non-contiguous bands", () => {
  const turns: Turn[] = Array.from({ length: 10 }, (_, i) => ({
    startIndex: i * 2,
    endIndex: i * 2 + 1
  }));

  const bands: CompressionBand[] = [
    { start: 0, end: 30, level: "heavy-compress" },
    { start: 50, end: 80, level: "compress" }
  ];

  const mapping = mapTurnsToBands(turns, bands);

  expect(mapping[0].band?.level).toBe("heavy-compress");
  expect(mapping[2].band?.level).toBe("heavy-compress");
  expect(mapping[3].band).toBeNull();
  expect(mapping[5].band?.level).toBe("compress");
  expect(mapping[8].band).toBeNull();
});
```

### TC-04: Turn Cohesion

**Input:**
- 10 turns
- Band: `{start: 0, end: 45, level: "compress"}`

**Expected:**
- Turns 0-4 (positions 0%, 10%, 20%, 30%, 40%) in band
- Turn 5 (position 50%) NOT in band

**Test structure:**
```typescript
it("TC-04: keeps entire turn in same band", () => {
  const turns: Turn[] = Array.from({ length: 10 }, (_, i) => ({
    startIndex: i * 2,
    endIndex: i * 2 + 1
  }));

  const bands: CompressionBand[] = [{ start: 0, end: 45, level: "compress" }];

  const mapping = mapTurnsToBands(turns, bands);

  expect(mapping[4].band).not.toBeNull();
  expect(mapping[5].band).toBeNull();
});
```

### TC-05: Minimum Token Threshold

**Input:**
- Fixture: `session-mixed-lengths.jsonl` with messages varying from <20 to >1000 tokens
- All turns in compression band

**Expected:**
- Messages with <20 tokens NOT in tasks
- All tasks have `estimatedTokens >= 20`

**Test structure:**
```typescript
it("TC-05: skips messages below 20 token threshold", () => {
  const entries: SessionEntry[] = [
    { type: "user", uuid: "u1", parentUuid: null, message: { content: "Short" } },  // ~2 tokens
    { type: "assistant", uuid: "a1", parentUuid: "u1", message: { content: [{ type: "text", text: "x".repeat(100) }] } },  // ~25 tokens
  ];

  const turns: Turn[] = [{ startIndex: 0, endIndex: 1 }];
  const mapping: TurnBandMapping[] = [{ turnIndex: 0, band: { start: 0, end: 100, level: "compress" } }];

  const tasks = createCompressionTasks(entries, turns, mapping);

  // Should only have 1 task (assistant message)
  expect(tasks.length).toBe(1);
  expect(tasks[0].messageIndex).toBe(1);
  expect(tasks[0].estimatedTokens).toBeGreaterThanOrEqual(20);
});
```

### estimateTokens Tests

**Test cases:**
- Input: `""` → Output: `0`
- Input: `"a"` → Output: `1` (ceil(1/4) = 1)
- Input: `"abcd"` → Output: `1` (ceil(4/4) = 1)
- Input: `"abcde"` → Output: `2` (ceil(5/4) = 2)
- Input: 80 chars → Output: `20`
- Input: 4000 chars → Output: `1000`

**Test structure:**
```typescript
describe("estimateTokens", () => {
  it("calculates tokens as ceil(chars / 4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("a".repeat(80))).toBe(20);
    expect(estimateTokens("a".repeat(4000))).toBe(1000);
  });
});
```

### extractTextContent Tests

**Test Case 1: String content**
- Input: `entry.message.content = "Hello world"`
- Output: `"Hello world"`

**Test Case 2: Array with text blocks**
- Input: `entry.message.content = [{type: "text", text: "Line 1"}, {type: "image"}, {type: "text", text: "Line 2"}]`
- Output: `"Line 1\nLine 2"`

**Test Case 3: No text blocks**
- Input: `entry.message.content = [{type: "tool_result", tool_use_id: "123"}]`
- Output: `""`

**Test structure:**
```typescript
describe("extractTextContent", () => {
  it("extracts string content directly", () => {
    const entry = { type: "user", message: { content: "Hello world" } };
    expect(extractTextContent(entry)).toBe("Hello world");
  });

  it("extracts and joins text blocks", () => {
    const entry = {
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Line 1" },
          { type: "image", data: "..." },
          { type: "text", text: "Line 2" }
        ]
      }
    };
    expect(extractTextContent(entry)).toBe("Line 1\nLine 2");
  });

  it("returns empty for non-text content", () => {
    const entry = {
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "123" }] }
    };
    expect(extractTextContent(entry)).toBe("");
  });
});
```

### applyCompressedContent Tests

**Test Case 1: String content replacement**
- Input entry: `message.content = "Original text"`
- Compressed text: `"Compressed"`
- Output: `message.content = "Compressed"`

**Test Case 2: Array content replacement**
- Input entry: `message.content = [{type: "text", text: "Old"}, {type: "image"}]`
- Compressed text: `"New"`
- Output: `message.content = [{type: "text", text: "New"}, {type: "image"}]`

**Test structure:**
```typescript
describe("applyCompressedContent", () => {
  it("replaces string content", () => {
    const entry = { type: "user", message: { content: "Original" } };
    const result = applyCompressedContent(entry, "Compressed");
    expect(result.message.content).toBe("Compressed");
  });

  it("replaces text blocks in array content", () => {
    const entry = {
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Old" },
          { type: "image", data: "..." }
        ]
      }
    };
    const result = applyCompressedContent(entry, "New");
    expect(result.message.content).toHaveLength(2);
    expect(result.message.content[0]).toEqual({ type: "text", text: "New" });
    expect(result.message.content[1].type).toBe("image");
  });
});
```

---

## TDD Green: Implement Functions

### 1. `estimateTokens`

**Implementation:**
```typescript
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
```

### 2. `extractTextContent`

**Algorithm:**
- If `content` is string, return it
- If `content` is array, filter to `type === "text"` blocks, extract `text` field, join with `\n`
- Otherwise return `""`

### 3. `mapTurnsToBands`

**Algorithm:**
```
For each turn at index i:
  turnPosition = (i / totalTurns) * 100
  Find band where: band.start <= turnPosition < band.end
  If found, assign that band, else null
```

**Edge cases:**
- 0 turns → empty array
- 1 turn → position 0%, matches bands starting at 0
- Last turn of 10 (index 9) → position 90%, matches bands like [90, 100)

### 4. `createCompressionTasks`

**Algorithm:**
```
For each turn mapping with non-null band:
  For each entry in turn's index range:
    If entry.type is "user" or "assistant":
      Extract text content
      Estimate tokens
      If tokens >= minTokens:
        Create CompressionTask with:
          - messageIndex: entry's index in entries array
          - entryType: entry.type
          - originalContent: extracted text
          - level: from band
          - estimatedTokens: calculated
          - attempt: 0
          - timeoutMs: 5000
          - status: "pending"
```

### 5. `applyCompressedContent`

**Algorithm:**
```
If entry.message.content is string:
  Replace with compressedText

If entry.message.content is array:
  Find first text block position
  Remove all text blocks
  Insert new { type: "text", text: compressedText } at first text position
  Keep non-text blocks in place
```

### 6. `applyCompressionResults`

**Algorithm:**
```
Create map: messageIndex → compressed result (for successful tasks)
For each entry:
  If entry index in map:
    Apply compressed content
  Else:
    Keep original
```

### 7. `compressMessages` - Partial (empty bands)

Handle empty bands case by returning unchanged entries with zero stats.

---

## Verification

- [ ] All TC tests pass (TC-03, TC-04, TC-05, TC-10)
- [ ] `estimateTokens` tests pass
- [ ] `extractTextContent` tests pass
- [ ] `applyCompressedContent` tests pass
- [ ] Existing v1 tests still pass
- [ ] TypeScript compiles

## Notes

**Deferred to later phases:**
- TC-01, TC-02, TC-06, TC-07, TC-13 (batch processing - Phase 3)
- TC-09, TC-14, TC-15 (OpenRouter client - Phase 4)
- TC-08, TC-12 (integration - Phase 5)

**Turn position formula:** `(turnIndex / totalTurns) * 100`
- Inclusive start: `band.start <=`
- Exclusive end: `< band.end`
- Example: Turn 5 of 10 → 50% → NOT in [0, 50) band
