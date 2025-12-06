# Phase 5: Integration (TDD)

## Goal

Implement `cloneSessionV2()` orchestration and write end-to-end integration tests.

## Context

**Project:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/`

Phases 1-4 complete. All compression components implemented. Now integrate into the v2 clone flow.

## What Phase 5 Actually Implements

**Note:** `compressMessages()` was already implemented in Phase 3-4. Phase 5 focuses on:

1. `cloneSessionV2()` in `src/services/session-clone.ts`
2. `loadCompressionConfig()` in `src/config.ts`
3. Lineage logger updates in `src/services/lineage-logger.ts`
4. Integration tests in `test/clone-v2-integration.test.ts`

---

## Test File

Create `test/clone-v2-integration.test.ts`

## Test Setup

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cloneSessionV2 } from "../src/services/session-clone.js";
import type { CloneRequestV2 } from "../src/schemas/clone-v2.js";
import * as fs from "fs/promises";
import { randomUUID } from "crypto";

// Mock file system
vi.mock("fs/promises");

// Mock UUID
vi.mock("crypto", () => ({
  randomUUID: vi.fn(() => "test-uuid-new")
}));

// Mock OpenRouterClient
vi.mock("../src/services/openrouter-client.js", () => ({
  OpenRouterClient: vi.fn().mockImplementation(() => ({
    compress: vi.fn().mockImplementation((text: string) =>
      Promise.resolve(text.substring(0, Math.ceil(text.length * 0.35)))
    ),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});
```

---

## TDD Red: Write Tests

### TC-08: Token Statistics

**Given:**
- Fixture: 6 turns with known token counts
  - Turn 0: User 100 tokens, Assistant 200 tokens
  - Turn 1: User 150 tokens, Assistant 250 tokens
  - Turn 2: User 100 tokens, Assistant 200 tokens (total: 1000 tokens)
- Compression band [0, 50] at "compress" level
- Mock returns text at 35% of original

**When:**
```typescript
const request: CloneRequestV2 = {
  sessionId: "test-session-id",
  toolRemoval: "none",
  thinkingRemoval: "none",
  compressionBands: [{ start: 0, end: 50, level: "compress" }]
};
const result = await cloneSessionV2(request);
```

**Then:**
- `result.stats.compression.originalTokens`: 600 (turns 0-2 = 50% of 6 turns)
- `result.stats.compression.compressedTokens`: 210 (35% of 600)
- `result.stats.compression.tokensRemoved`: 390
- `result.stats.compression.reductionPercent`: 65

**Test structure:**
```typescript
it("TC-08: returns accurate token statistics", async () => {
  // Arrange
  const fixtureContent = createFixtureWith6Turns(); // Helper creates JSONL
  vi.mocked(fs.readFile).mockResolvedValue(fixtureContent);
  vi.mocked(fs.readdir).mockResolvedValue([{ name: "test-dir", isDirectory: () => true }]);
  vi.mocked(fs.stat).mockResolvedValue({} as any);
  vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  vi.mocked(fs.appendFile).mockResolvedValue(undefined);

  const request: CloneRequestV2 = {
    sessionId: "test-session-id",
    compressionBands: [{ start: 0, end: 50, level: "compress" }]
  };

  // Act
  const result = await cloneSessionV2(request);

  // Assert
  expect(result.success).toBe(true);
  expect(result.stats.compression).toBeDefined();
  expect(result.stats.compression?.originalTokens).toBe(600);
  expect(result.stats.compression?.compressedTokens).toBe(210);
  expect(result.stats.compression?.tokensRemoved).toBe(390);
  expect(result.stats.compression?.reductionPercent).toBe(65);
});
```

### TC-12: Combined with Tool Removal

**Given:**
- Fixture: 4 turns with tool calls in turns 0-1
- Tool removal: 50% (removes from turns 0-1)
- Compression: [0, 100] at "compress"

**When:**
```typescript
const request: CloneRequestV2 = {
  sessionId: "test-session-id",
  toolRemoval: "50",
  compressionBands: [{ start: 0, end: 100, level: "compress" }]
};
```

**Then:**
- Tool calls removed from turns 0-1
- All text messages compressed
- Both stats present in response

**Test structure:**
```typescript
it("TC-12: applies both compression and tool removal", async () => {
  // Arrange
  const fixtureWithTools = createFixtureWithToolCalls();
  vi.mocked(fs.readFile).mockResolvedValue(fixtureWithTools);
  vi.mocked(fs.readdir).mockResolvedValue([{ name: "test-dir", isDirectory: () => true }]);
  vi.mocked(fs.stat).mockResolvedValue({} as any);
  vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  vi.mocked(fs.appendFile).mockResolvedValue(undefined);

  const request: CloneRequestV2 = {
    sessionId: "test-session-id",
    toolRemoval: "50",
    compressionBands: [{ start: 0, end: 100, level: "compress" }]
  };

  // Act
  const result = await cloneSessionV2(request);

  // Assert
  expect(result.success).toBe(true);
  expect(result.stats.toolCallsRemoved).toBeGreaterThan(0);
  expect(result.stats.compression?.messagesCompressed).toBeGreaterThan(0);
});
```

### V1 Preservation Test

**Given:**
- V1 request (no compressionBands)

**When:**
```typescript
POST /api/clone with { sessionId, toolRemoval }
```

**Then:**
- Response has NO compression field
- Existing v1 behavior unchanged

**Test structure:**
```typescript
it("v1 endpoint unchanged after v2 implementation", async () => {
  // This test actually calls the v1 route to ensure it still works
  // Import from clone.ts to test v1 directly
});
```

### Lineage Log Format Test

**Given:**
- Clone with compression bands

**When:**
- cloneSessionV2() completes

**Then:**
- Lineage log appended with compression info

**Test structure:**
```typescript
it("logs compression info to lineage file", async () => {
  const fixtureContent = createFixtureWith6Turns();
  vi.mocked(fs.readFile).mockResolvedValue(fixtureContent);
  vi.mocked(fs.readdir).mockResolvedValue([{ name: "test-dir", isDirectory: () => true }]);
  vi.mocked(fs.stat).mockResolvedValue({} as any);
  vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  vi.mocked(fs.appendFile).mockResolvedValue(undefined);

  const request: CloneRequestV2 = {
    sessionId: "test-session-id",
    compressionBands: [{ start: 0, end: 50, level: "compress" }]
  };

  await cloneSessionV2(request);

  // Assert appendFile was called with lineage entry
  expect(fs.appendFile).toHaveBeenCalled();
  const loggedContent = vi.mocked(fs.appendFile).mock.calls[0][1] as string;
  expect(loggedContent).toContain("COMPRESSION:");
  expect(loggedContent).toContain("[0-50: compress]");
});
```

---

## TDD Green: Implement Functions

### 1. Add `loadCompressionConfig()` to `src/config.ts`

```typescript
import type { CompressionConfig } from "./types.js";

export function loadCompressionConfig(): CompressionConfig {
  return {
    concurrency: parseInt(process.env.COMPRESSION_CONCURRENCY || "10", 10),
    timeoutInitial: parseInt(process.env.COMPRESSION_TIMEOUT_INITIAL || "5000", 10),
    timeoutIncrement: parseInt(process.env.COMPRESSION_TIMEOUT_INCREMENT || "5000", 10),
    maxAttempts: parseInt(process.env.COMPRESSION_MAX_ATTEMPTS || "4", 10),
    minTokens: parseInt(process.env.COMPRESSION_MIN_TOKENS || "20", 10),
    thinkingThreshold: parseInt(process.env.COMPRESSION_THINKING_THRESHOLD || "1000", 10),
    targetHeavy: parseInt(process.env.COMPRESSION_TARGET_HEAVY || "10", 10),
    targetStandard: parseInt(process.env.COMPRESSION_TARGET_STANDARD || "35", 10),
  };
}
```

### 2. Update `LineageEntry` interface in `src/services/lineage-logger.ts`

```typescript
import type { CompressionBand, CompressionStats } from "../types.js";

export interface LineageEntry {
  timestamp: string;
  targetId: string;
  targetPath: string;
  sourceId: string;
  sourcePath: string;
  toolRemoval: string;
  thinkingRemoval: string;
  // New v2 fields
  compressionBands?: CompressionBand[];
  compressionStats?: CompressionStats;
}
```

### 3. Update `logLineage()` format in `src/services/lineage-logger.ts`

```typescript
export async function logLineage(entry: LineageEntry): Promise<void> {
  const logPath = config.lineageLogPath;

  let logEntry = `[${entry.timestamp}]
  TARGET: ${entry.targetId}
    path: ${entry.targetPath}
  SOURCE: ${entry.sourceId}
    path: ${entry.sourcePath}
  OPTIONS: toolRemoval=${entry.toolRemoval} thinkingRemoval=${entry.thinkingRemoval}`;

  // Add compression info if present
  if (entry.compressionBands && entry.compressionBands.length > 0) {
    const bandsStr = entry.compressionBands
      .map(b => `${b.start}-${b.end}: ${b.level}`)
      .join(", ");
    logEntry += `\n  COMPRESSION:`;
    logEntry += `\n    bands: [${bandsStr}]`;

    if (entry.compressionStats) {
      const s = entry.compressionStats;
      logEntry += `\n    result: ${s.messagesCompressed} compressed, ${s.messagesFailed} failed`;
      logEntry += `\n    tokens: ${s.originalTokens} -> ${s.compressedTokens} (${s.reductionPercent}% reduction)`;
    }
  }

  logEntry += "\n---\n";

  await appendFile(logPath, logEntry, "utf-8");
}
```

### 4. Implement `cloneSessionV2()` in `src/services/session-clone.ts`

**Algorithm:**
```
1. Find and load source session (reuse existing functions)
2. Parse and identify turns
3. If compressionBands specified:
   - Load compression config
   - Call compressMessages() (already implemented in Phase 3-4)
   - Update entries with compressed content
4. Apply tool/thinking removal (reuse existing)
5. Repair UUID chain
6. Generate new session ID, update entries
7. Write output file
8. Log lineage with compression info
9. Return response with all stats
```

**Implementation:**
```typescript
import { loadCompressionConfig } from "../config.js";
import { compressMessages } from "./compression.js";

export async function cloneSessionV2(request: CloneRequestV2): Promise<CloneResponseV2> {
  // 1. Load source session
  const sourcePath = await findSessionFile(request.sessionId);
  const sourceContent = await readFile(sourcePath, "utf-8");

  // 2. Parse and identify turns
  let entries = parseSession(sourceContent);
  const turns = identifyTurns(entries);
  const originalTurnCount = turns.length;

  let compressionStats: CompressionStats | undefined;

  // 3. Apply compression if specified
  if (request.compressionBands && request.compressionBands.length > 0) {
    const compressionConfig = loadCompressionConfig();
    const compressionResult = await compressMessages(
      entries,
      turns,
      request.compressionBands,
      compressionConfig
    );
    entries = compressionResult.entries;
    compressionStats = compressionResult.stats;
  }

  // 4. Apply tool/thinking removal (same as v1)
  const removalOptions: RemovalOptions = {
    toolRemoval: request.toolRemoval,
    thinkingRemoval: request.thinkingRemoval,
  };
  const { entries: modifiedEntries, toolCallsRemoved, thinkingBlocksRemoved } =
    applyRemovals(entries, removalOptions);

  // 5. Repair UUID chain
  const repairedEntries = repairParentUuidChain(modifiedEntries);

  // 6. Generate new session ID and update entries
  const newSessionId = randomUUID();
  const finalEntries = repairedEntries.map(entry => ({
    ...entry,
    ...(entry.sessionId != null ? { sessionId: newSessionId } : {}),
  }));

  const outputTurnCount = identifyTurns(finalEntries).length;

  // 7. Write output file
  const sourceDir = path.dirname(sourcePath);
  const outputPath = path.join(sourceDir, `${newSessionId}.jsonl`);
  const outputContent = finalEntries.map(e => JSON.stringify(e)).join("\n") + "\n";
  await writeFile(outputPath, outputContent, "utf-8");

  // 8. Log lineage with compression info
  await logLineage({
    timestamp: new Date().toISOString(),
    targetId: newSessionId,
    targetPath: outputPath,
    sourceId: request.sessionId,
    sourcePath,
    toolRemoval: request.toolRemoval,
    thinkingRemoval: request.thinkingRemoval,
    compressionBands: request.compressionBands,
    compressionStats
  });

  // 9. Return response
  return {
    success: true,
    outputPath,
    stats: {
      originalTurnCount,
      outputTurnCount,
      toolCallsRemoved,
      thinkingBlocksRemoved,
      compression: compressionStats
    }
  };
}
```

---

## Additional Implementations

### `loadCompressionConfig()` in `src/config.ts`

```typescript
import type { CompressionConfig } from "./types.js";

export function loadCompressionConfig(): CompressionConfig {
  return {
    concurrency: parseInt(process.env.COMPRESSION_CONCURRENCY || "10", 10),
    timeoutInitial: parseInt(process.env.COMPRESSION_TIMEOUT_INITIAL || "5000", 10),
    timeoutIncrement: parseInt(process.env.COMPRESSION_TIMEOUT_INCREMENT || "5000", 10),
    maxAttempts: parseInt(process.env.COMPRESSION_MAX_ATTEMPTS || "4", 10),
    minTokens: parseInt(process.env.COMPRESSION_MIN_TOKENS || "20", 10),
    thinkingThreshold: parseInt(process.env.COMPRESSION_THINKING_THRESHOLD || "1000", 10),
    targetHeavy: parseInt(process.env.COMPRESSION_TARGET_HEAVY || "10", 10),
    targetStandard: parseInt(process.env.COMPRESSION_TARGET_STANDARD || "35", 10),
  };
}
```

### Lineage Logger Updates

See implementation code in "TDD Green" section above for:
- Updated `LineageEntry` interface
- Updated `logLineage()` format

---

## Test Fixtures

### Create `test/helpers/fixture-helpers.ts`

```typescript
export function createFixtureWith6Turns(): string {
  // Returns JSONL with 6 turns, known token counts
  // Turn 0: 100+200=300 tokens
  // Turn 1: 150+250=400 tokens
  // Turn 2: 100+200=300 tokens
  // Turn 3: 100+200=300 tokens
  // Turn 4: 100+200=300 tokens
  // Turn 5: 100+200=300 tokens
  // Total: 1900 tokens, first 3 turns (0-2) = 1000 tokens (50%)
}

export function createFixtureWithToolCalls(): string {
  // Returns JSONL with 4 turns
  // Turns 0-1 have tool_use/tool_result blocks
  // All turns have text messages
}
```

---

## Verification

- [ ] TC-08 passes (token statistics accurate)
- [ ] TC-12 passes (combined operations)
- [ ] V1 preservation test passes
- [ ] Lineage log format test passes
- [ ] All 78 existing tests still pass
- [ ] TypeScript compiles
- [ ] `POST /api/v2/clone` with compression works (manual curl test)

## Notes

- `compressMessages()` already implemented in Phase 3-4 - don't reimplement
- Focus on orchestration in `cloneSessionV2()`
- Lineage logger is backward compatible (new fields optional)
- Use mock compression that returns 35% of input for predictable testing
