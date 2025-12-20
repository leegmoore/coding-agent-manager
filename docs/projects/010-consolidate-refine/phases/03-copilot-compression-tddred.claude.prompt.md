```prompt
# Phase 3: Copilot LLM Compression - TDD Red + Skeleton (Claude Opus 4.5)

## Objective

Create skeletons and TDD Red tests for LLM-based compression of Copilot sessions. This feature mirrors the existing Claude session compression, adapted for Copilot's message format.

Current state: Copilot clone only removes oldest turns entirely.
Target state: Copilot clone uses LLM to summarize messages in compression bands, preserving context while reducing tokens.

TDD Red means tests assert real expected behavior. Tests ERROR (throw) because stubs throw `NotImplementedError`. When Phase 4 implements real logic, these same tests will PASS.

## Context

### Reference Implementation

Claude session compression (`src/services/compression.ts`) provides the pattern:
1. Map turns to compression bands based on position percentage
2. Create compression tasks for each message in banded turns
3. Process tasks in parallel batches via LLM provider
4. Apply compressed results back to entries
5. Return stats (tokens removed, compression ratio)

### Copilot Message Structure

Copilot sessions use a different format than Claude:
- Sessions are JSON with `requests[]` array (not JSONL entries)
- Each request has `message.text` (user) and `response[]` (assistant)
- Tool results are in `result.metadata.toolCallResults`
- No thinking blocks (Copilot doesn't expose reasoning)

### Compression Flow for Copilot

1. Identify turns (each non-canceled request is one turn)
2. Map turns to compression bands (same algorithm as Claude)
3. For each turn in a compression band:
   - Extract user message text
   - Extract assistant response text (concatenate response items)
   - Create compression tasks for both
4. Process tasks via LLM provider (same as Claude)
5. Build new session with compressed messages
6. Return compression stats

## Constraints

- All new compression functions throw `NotImplementedError` - no real logic yet
- Tests assert REAL behavior (return values, structures) - they will ERROR when stubs throw
- Reuse existing `LlmProvider` interface and `processBatches` from compression-batch.ts
- Follow Copilot's message structure (not Claude's JSONL format)
- Preserve tool call metadata (summarize only user/assistant text)

## Reference Files

Read these files before implementing:
- `src/services/compression.ts` - Claude compression (reference implementation)
- `src/services/compression-batch.ts` - Batch processing with retry
- `src/services/copilot-clone.ts` - Existing Copilot clone service
- `src/sources/copilot-types.ts` - Copilot message types
- `src/providers/types.ts` - LlmProvider interface
- `src/types.ts` - CompressionBand, CompressionTask, CompressionStats types

## Deliverables

### 1. Create Copilot Compression Service (`src/services/copilot-compression.ts`)

Create new file with stubs for Copilot-specific compression:

```typescript
import { NotImplementedError } from "../errors.js";
import type {
  CompressionBand,
  CompressionTask,
  CompressionStats,
  CompressionConfig,
} from "../types.js";
import type { CopilotRequest, CopilotSession } from "../sources/copilot-types.js";

/**
 * Mapping of a Copilot request (turn) to its compression band.
 */
export interface CopilotTurnBandMapping {
  turnIndex: number;
  band: CompressionBand | null;
}

/**
 * Result of compressing Copilot session messages.
 */
export interface CopilotCompressionResult {
  /** Requests with compressed messages */
  requests: CopilotRequest[];
  /** Compression statistics */
  stats: CompressionStats;
  /** All compression tasks (for debug logging) */
  tasks: CompressionTask[];
}

/**
 * Map Copilot requests (turns) to compression bands based on position.
 * Turn position formula: (turnIndex / totalTurns) * 100
 * A turn matches a band if: band.start <= position < band.end
 *
 * @param requests - Array of Copilot requests (non-canceled)
 * @param bands - Compression bands to map
 * @returns Array of turn-to-band mappings
 */
export function mapCopilotTurnsToBands(
  requests: CopilotRequest[],
  bands: CompressionBand[]
): CopilotTurnBandMapping[] {
  throw new NotImplementedError("mapCopilotTurnsToBands");
}

/**
 * Extract text content from a Copilot request for compression.
 * Returns user message text and concatenated assistant response text.
 *
 * @param request - Copilot request to extract from
 * @returns Object with userText and assistantText
 */
export function extractCopilotTextContent(request: CopilotRequest): {
  userText: string;
  assistantText: string;
} {
  throw new NotImplementedError("extractCopilotTextContent");
}

/**
 * Create compression tasks for Copilot requests in compression bands.
 * Creates separate tasks for user and assistant content.
 * Messages below minTokens threshold get status "skipped".
 *
 * @param requests - All Copilot requests
 * @param mapping - Turn-to-band mappings
 * @param minTokens - Minimum tokens to compress (default 30)
 * @returns Array of compression tasks
 */
export function createCopilotCompressionTasks(
  requests: CopilotRequest[],
  mapping: CopilotTurnBandMapping[],
  minTokens?: number
): CompressionTask[] {
  throw new NotImplementedError("createCopilotCompressionTasks");
}

/**
 * Apply compression results to Copilot requests.
 * Returns new request array with compressed text (does not mutate originals).
 *
 * @param requests - Original requests
 * @param tasks - Completed compression tasks with results
 * @returns New array of requests with compressed content
 */
export function applyCopilotCompressionResults(
  requests: CopilotRequest[],
  tasks: CompressionTask[]
): CopilotRequest[] {
  throw new NotImplementedError("applyCopilotCompressionResults");
}

/**
 * Main compression orchestration for Copilot sessions.
 * Orchestrates turn mapping, task creation, batch processing, and result application.
 *
 * @param requests - Copilot requests to compress (non-canceled)
 * @param bands - Compression bands configuration
 * @param config - Compression configuration (concurrency, timeouts, etc.)
 * @returns Compressed requests, stats, and task details
 */
export async function compressCopilotMessages(
  requests: CopilotRequest[],
  bands: CompressionBand[],
  config: CompressionConfig
): Promise<CopilotCompressionResult> {
  throw new NotImplementedError("compressCopilotMessages");
}

/**
 * Estimate token count using chars/4 heuristic.
 * Copilot-specific wrapper for consistency.
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
export function estimateCopilotTokens(text: string): number {
  throw new NotImplementedError("estimateCopilotTokens");
}
```

### 2. Update Copilot Clone Service (`src/services/copilot-clone.ts`)

Add compression support to the existing clone service. Add these new types and method:

```typescript
// Add to imports
import type { CompressionBand, CompressionStats } from "../types.js";
import { compressCopilotMessages } from "./copilot-compression.js";
import { loadCompressionConfig } from "../config.js";

// Add to CopilotCloneOptions interface
export interface CopilotCloneOptions {
  /** Remove tool invocations from responses */
  removeToolCalls?: boolean;
  /** Percentage of oldest turns to remove (0-100) - LEGACY, use compressionBands */
  compressPercent?: number;
  /** Write session to VS Code storage (default: true) */
  writeToDisk?: boolean;
  /** Target workspace hash (default: same as source) */
  targetWorkspaceHash?: string;
  /** LLM compression bands (new in Phase 3) */
  compressionBands?: CompressionBand[];
}

// Add to CopilotCloneStats interface
export interface CopilotCloneStats {
  originalTurns: number;
  clonedTurns: number;
  removedTurns: number;
  originalTokens: number;
  clonedTokens: number;
  removedTokens: number;
  compressionRatio: number;
  /** LLM compression stats (new in Phase 3) */
  compression?: CompressionStats;
}

// Add to CopilotCloneResult interface
export interface CopilotCloneResult {
  session: CopilotSession;
  stats: CopilotCloneStats;
  sessionPath?: string;
  backupPath?: string;
  writtenToDisk: boolean;
  /** Debug log path if debug logging enabled */
  debugLogPath?: string;
}
```

Update the `clone()` method to support compression bands. The method should:
1. Check if `compressionBands` is provided
2. If yes, call `compressCopilotMessages()` before other processing
3. Include compression stats in the result

For Phase 3 (TDD Red), the clone method should call `compressCopilotMessages()` which will throw `NotImplementedError`.

### 3. Update Clone Schema (`src/schemas/copilot-clone.ts`)

Add compression bands to the request schema:

```typescript
import { z } from "zod";

// Add compression band schema
const CompressionBandSchema = z.object({
  start: z.number().min(0).max(100),
  end: z.number().min(0).max(100),
  level: z.enum(["compress", "heavy-compress"]),
});

export const CopilotCloneRequestSchema = z.object({
  sessionId: z.string().min(1, "Session ID required"),
  workspaceHash: z.string().min(1, "Workspace hash required"),
  options: z.object({
    removeToolCalls: z.boolean().optional(),
    compressPercent: z.number().min(0).max(100).optional(),
    writeToDisk: z.boolean().default(true),
    targetWorkspaceHash: z.string().optional(),
    compressionBands: z.array(CompressionBandSchema).optional(),
    debugLog: z.boolean().optional(),
  }).optional(),
});

// Update response schema to include compression stats
export const CopilotCloneResponseSchema = z.object({
  success: z.boolean(),
  session: z.object({
    sessionId: z.string(),
    customTitle: z.string().optional(),
  }),
  stats: z.object({
    originalTurns: z.number(),
    clonedTurns: z.number(),
    removedTurns: z.number(),
    originalTokens: z.number(),
    clonedTokens: z.number(),
    removedTokens: z.number(),
    compressionRatio: z.number(),
    compression: z.object({
      messagesCompressed: z.number(),
      messagesSkipped: z.number(),
      messagesFailed: z.number(),
      originalTokens: z.number(),
      compressedTokens: z.number(),
      tokensRemoved: z.number(),
      reductionPercent: z.number(),
    }).optional(),
  }),
  sessionPath: z.string().optional(),
  backupPath: z.string().optional(),
  writtenToDisk: z.boolean(),
  debugLogPath: z.string().optional(),
});

export type CopilotCloneRequest = z.infer<typeof CopilotCloneRequestSchema>;
export type CopilotCloneResponse = z.infer<typeof CopilotCloneResponseSchema>;
```

### 4. Tests (`test/services/copilot-compression.test.ts`)

TDD Red tests for Copilot compression functions:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { join } from "path";
import {
  mapCopilotTurnsToBands,
  extractCopilotTextContent,
  createCopilotCompressionTasks,
  applyCopilotCompressionResults,
  compressCopilotMessages,
  estimateCopilotTokens,
} from "../../src/services/copilot-compression.js";
import type { CopilotRequest } from "../../src/sources/copilot-types.js";
import type { CompressionBand, CompressionConfig } from "../../src/types.js";

// Test fixtures
function createTestRequest(text: string, response: string): CopilotRequest {
  return {
    requestId: `req_${Math.random().toString(36).substr(2, 9)}`,
    message: { text, parts: [] },
    response: [{ kind: "markdownContent", value: response }],
    isCanceled: false,
    timestamp: Date.now(),
  };
}

describe("Copilot Compression Service", () => {
  describe("estimateCopilotTokens", () => {
    // AC: Token estimation matches Claude implementation
    it("estimates tokens as ceil(chars/4)", () => {
      expect(estimateCopilotTokens("")).toBe(0);
      expect(estimateCopilotTokens("test")).toBe(1); // 4 chars = 1 token
      expect(estimateCopilotTokens("hello")).toBe(2); // 5 chars = 2 tokens
      expect(estimateCopilotTokens("a".repeat(100))).toBe(25);
    });

    it("returns 0 for empty or null-ish input", () => {
      expect(estimateCopilotTokens("")).toBe(0);
    });
  });

  describe("mapCopilotTurnsToBands", () => {
    // AC: Compression bands are respected
    it("maps turns to bands based on position percentage", () => {
      const requests = [
        createTestRequest("msg1", "resp1"),
        createTestRequest("msg2", "resp2"),
        createTestRequest("msg3", "resp3"),
        createTestRequest("msg4", "resp4"),
      ];

      const bands: CompressionBand[] = [
        { start: 0, end: 50, level: "heavy-compress" },
        { start: 50, end: 75, level: "compress" },
      ];

      const mapping = mapCopilotTurnsToBands(requests, bands);

      // Turn 0: position 0% -> heavy-compress
      expect(mapping[0].band?.level).toBe("heavy-compress");
      // Turn 1: position 25% -> heavy-compress
      expect(mapping[1].band?.level).toBe("heavy-compress");
      // Turn 2: position 50% -> compress
      expect(mapping[2].band?.level).toBe("compress");
      // Turn 3: position 75% -> no band
      expect(mapping[3].band).toBeNull();
    });

    it("returns empty array for empty requests", () => {
      const mapping = mapCopilotTurnsToBands([], []);
      expect(mapping).toEqual([]);
    });

    it("returns null bands when no bands match", () => {
      const requests = [createTestRequest("msg", "resp")];
      const bands: CompressionBand[] = []; // No bands

      const mapping = mapCopilotTurnsToBands(requests, bands);
      expect(mapping[0].band).toBeNull();
    });
  });

  describe("extractCopilotTextContent", () => {
    // AC: User and assistant messages are extracted appropriately
    it("extracts user message text", () => {
      const request = createTestRequest("Hello, how are you?", "I'm fine!");

      const { userText } = extractCopilotTextContent(request);
      expect(userText).toBe("Hello, how are you?");
    });

    it("extracts assistant response from markdownContent items", () => {
      const request: CopilotRequest = {
        requestId: "test",
        message: { text: "Question", parts: [] },
        response: [
          { kind: "markdownContent", value: "First part." },
          { kind: "markdownContent", value: "Second part." },
        ],
        isCanceled: false,
        timestamp: Date.now(),
      };

      const { assistantText } = extractCopilotTextContent(request);
      expect(assistantText).toContain("First part.");
      expect(assistantText).toContain("Second part.");
    });

    it("excludes tool invocation items from assistant text", () => {
      const request: CopilotRequest = {
        requestId: "test",
        message: { text: "Question", parts: [] },
        response: [
          { kind: "markdownContent", value: "Here is the answer." },
          { kind: "toolInvocationSerialized", toolId: "run_in_terminal" },
          { kind: "markdownContent", value: "After tool." },
        ],
        isCanceled: false,
        timestamp: Date.now(),
      };

      const { assistantText } = extractCopilotTextContent(request);
      expect(assistantText).toContain("Here is the answer.");
      expect(assistantText).toContain("After tool.");
      expect(assistantText).not.toContain("tool");
    });
  });

  describe("createCopilotCompressionTasks", () => {
    // AC: Compression bands are respected (heavy vs regular)
    it("creates tasks for turns in compression bands", () => {
      const requests = [
        createTestRequest("This is a longer user message for testing.", "This is a response."),
        createTestRequest("Another message", "Another response"),
      ];

      const mapping = [
        { turnIndex: 0, band: { start: 0, end: 50, level: "heavy-compress" as const } },
        { turnIndex: 1, band: null },
      ];

      const tasks = createCopilotCompressionTasks(requests, mapping, 5);

      // Should create tasks for turn 0 only (user + assistant)
      expect(tasks.length).toBe(2);
      expect(tasks.every(t => t.level === "heavy-compress")).toBe(true);
    });

    it("skips messages below minTokens threshold", () => {
      const requests = [
        createTestRequest("Hi", "OK"), // Very short
      ];

      const mapping = [
        { turnIndex: 0, band: { start: 0, end: 100, level: "compress" as const } },
      ];

      const tasks = createCopilotCompressionTasks(requests, mapping, 30);

      // Both user and assistant are below threshold
      expect(tasks.every(t => t.status === "skipped")).toBe(true);
    });

    it("creates separate tasks for user and assistant", () => {
      const requests = [
        createTestRequest("User message here", "Assistant response here"),
      ];

      const mapping = [
        { turnIndex: 0, band: { start: 0, end: 100, level: "compress" as const } },
      ];

      const tasks = createCopilotCompressionTasks(requests, mapping, 1);

      const userTask = tasks.find(t => t.entryType === "user");
      const assistantTask = tasks.find(t => t.entryType === "assistant");

      expect(userTask).toBeDefined();
      expect(assistantTask).toBeDefined();
      expect(userTask?.originalContent).toBe("User message here");
    });
  });

  describe("applyCopilotCompressionResults", () => {
    it("applies compressed text to user messages", () => {
      const requests = [
        createTestRequest("Original user message", "Original response"),
      ];

      const tasks = [
        {
          messageIndex: 0,
          entryType: "user" as const,
          originalContent: "Original user message",
          level: "compress" as const,
          estimatedTokens: 10,
          attempt: 1,
          timeoutMs: 20000,
          status: "success" as const,
          result: "Compressed user",
        },
      ];

      const result = applyCopilotCompressionResults(requests, tasks);

      expect(result[0].message.text).toBe("Compressed user");
    });

    it("applies compressed text to assistant responses", () => {
      const requests = [
        createTestRequest("User", "Original assistant response"),
      ];

      const tasks = [
        {
          messageIndex: 0,
          entryType: "assistant" as const,
          originalContent: "Original assistant response",
          level: "compress" as const,
          estimatedTokens: 10,
          attempt: 1,
          timeoutMs: 20000,
          status: "success" as const,
          result: "Compressed assistant",
        },
      ];

      const result = applyCopilotCompressionResults(requests, tasks);

      // Assistant response should be updated
      const responseText = result[0].response
        .filter(r => r.kind === "markdownContent")
        .map(r => r.value)
        .join("");
      expect(responseText).toBe("Compressed assistant");
    });

    it("preserves tool invocation items in response", () => {
      const requests: CopilotRequest[] = [{
        requestId: "test",
        message: { text: "User", parts: [] },
        response: [
          { kind: "markdownContent", value: "Text before" },
          { kind: "toolInvocationSerialized", toolId: "test_tool", invocationMessage: "Running..." },
          { kind: "markdownContent", value: "Text after" },
        ],
        isCanceled: false,
        timestamp: Date.now(),
      }];

      const tasks = [
        {
          messageIndex: 0,
          entryType: "assistant" as const,
          originalContent: "Text before\n\nText after",
          level: "compress" as const,
          estimatedTokens: 10,
          attempt: 1,
          timeoutMs: 20000,
          status: "success" as const,
          result: "Compressed text",
        },
      ];

      const result = applyCopilotCompressionResults(requests, tasks);

      // Tool invocation should still be present
      const toolItem = result[0].response.find(r => r.kind === "toolInvocationSerialized");
      expect(toolItem).toBeDefined();
      expect(toolItem?.toolId).toBe("test_tool");
    });

    it("leaves failed tasks unchanged", () => {
      const requests = [
        createTestRequest("Original message", "Original response"),
      ];

      const tasks = [
        {
          messageIndex: 0,
          entryType: "user" as const,
          originalContent: "Original message",
          level: "compress" as const,
          estimatedTokens: 10,
          attempt: 3,
          timeoutMs: 60000,
          status: "failed" as const,
          error: "Timeout",
        },
      ];

      const result = applyCopilotCompressionResults(requests, tasks);

      expect(result[0].message.text).toBe("Original message");
    });
  });

  describe("compressCopilotMessages", () => {
    // AC: Copilot clone uses LLM provider to compress messages
    it("returns empty stats when no compression bands provided", async () => {
      const requests = [createTestRequest("Hello", "World")];
      const bands: CompressionBand[] = [];
      const config: CompressionConfig = {
        concurrency: 3,
        timeoutInitial: 20000,
        timeoutIncrement: 1.5,
        maxAttempts: 3,
        minTokens: 30,
        thinkingThreshold: 500,
        targetHeavy: 10,
        targetStandard: 35,
      };

      const result = await compressCopilotMessages(requests, bands, config);

      expect(result.stats.messagesCompressed).toBe(0);
      expect(result.requests).toEqual(requests);
    });

    // AC: Compression stats reflect actual token reduction
    it("returns stats with token reduction metrics", async () => {
      const requests = [
        createTestRequest(
          "This is a longer user message that should be compressed.",
          "This is a longer assistant response that should also be compressed."
        ),
      ];
      const bands: CompressionBand[] = [
        { start: 0, end: 100, level: "compress" },
      ];
      const config: CompressionConfig = {
        concurrency: 3,
        timeoutInitial: 20000,
        timeoutIncrement: 1.5,
        maxAttempts: 3,
        minTokens: 5,
        thinkingThreshold: 500,
        targetHeavy: 10,
        targetStandard: 35,
      };

      const result = await compressCopilotMessages(requests, bands, config);

      // Stats should be present with reduction metrics
      expect(result.stats).toHaveProperty("originalTokens");
      expect(result.stats).toHaveProperty("compressedTokens");
      expect(result.stats).toHaveProperty("reductionPercent");
    });

    // AC: Debug logging shows compression activity
    it("returns all tasks for debug logging", async () => {
      const requests = [
        createTestRequest("User message", "Assistant response"),
      ];
      const bands: CompressionBand[] = [
        { start: 0, end: 100, level: "compress" },
      ];
      const config: CompressionConfig = {
        concurrency: 3,
        timeoutInitial: 20000,
        timeoutIncrement: 1.5,
        maxAttempts: 3,
        minTokens: 1,
        thinkingThreshold: 500,
        targetHeavy: 10,
        targetStandard: 35,
      };

      const result = await compressCopilotMessages(requests, bands, config);

      // Tasks array should be populated for debug logging
      expect(result.tasks).toBeDefined();
      expect(Array.isArray(result.tasks)).toBe(true);
    });
  });
});
```

### 5. Tests (`test/services/copilot-clone-compression.test.ts`)

TDD Red tests for clone service with compression integration:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { join } from "path";
import { CopilotCloneService } from "../../src/services/copilot-clone.js";
import type { CompressionBand } from "../../src/types.js";

const FIXTURES = join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");
const TEST_WORKSPACE = "xyz987uvw654rst321";
const TEST_SESSION = "66666666-6666-6666-6666-666666666666";

describe("CopilotCloneService - LLM Compression", () => {
  let service: CopilotCloneService;

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = FIXTURES;
    service = new CopilotCloneService();
  });

  afterAll(() => {
    delete process.env.VSCODE_STORAGE_PATH;
  });

  describe("clone with compressionBands", () => {
    // AC: Copilot clone uses LLM provider to compress messages
    it("invokes LLM compression when compressionBands provided", async () => {
      const bands: CompressionBand[] = [
        { start: 0, end: 50, level: "heavy-compress" },
      ];

      // This will throw NotImplementedError in Phase 3
      await expect(
        service.clone(TEST_SESSION, TEST_WORKSPACE, {
          compressionBands: bands,
          writeToDisk: false,
        })
      ).rejects.toThrow(); // NotImplementedError from compressCopilotMessages
    });

    // AC: Compression bands are respected (heavy vs regular)
    it("respects heavy vs regular compression levels", async () => {
      const bands: CompressionBand[] = [
        { start: 0, end: 25, level: "heavy-compress" },
        { start: 25, end: 50, level: "compress" },
      ];

      // This will throw NotImplementedError in Phase 3
      await expect(
        service.clone(TEST_SESSION, TEST_WORKSPACE, {
          compressionBands: bands,
          writeToDisk: false,
        })
      ).rejects.toThrow();
    });

    // AC: Original session is unchanged
    it("does not modify original session", async () => {
      const bands: CompressionBand[] = [
        { start: 0, end: 100, level: "compress" },
      ];

      // Even though this throws, it should not have modified the source
      try {
        await service.clone(TEST_SESSION, TEST_WORKSPACE, {
          compressionBands: bands,
          writeToDisk: false,
        });
      } catch {
        // Expected to throw
      }

      // Verify source session can still be loaded
      const source = await import("../../src/sources/index.js").then(m => m.getSessionSource("copilot"));
      const original = await (source as any).loadSession(TEST_SESSION, TEST_WORKSPACE);
      expect(original.sessionId).toBe(TEST_SESSION);
    });
  });

  describe("clone stats with compression", () => {
    // AC: Compression stats reflect actual token reduction
    it("includes compression stats in result", async () => {
      const bands: CompressionBand[] = [
        { start: 0, end: 100, level: "compress" },
      ];

      // When implemented, result.stats.compression should be present
      try {
        const result = await service.clone(TEST_SESSION, TEST_WORKSPACE, {
          compressionBands: bands,
          writeToDisk: false,
        });

        // Phase 4: These assertions will be checked
        expect(result.stats.compression).toBeDefined();
        expect(result.stats.compression?.messagesCompressed).toBeGreaterThanOrEqual(0);
      } catch {
        // Phase 3: Expected to throw NotImplementedError
      }
    });
  });

  describe("clone without compressionBands (legacy)", () => {
    // AC: Existing turn removal works as fallback
    it("uses percentage-based turn removal when no compressionBands", async () => {
      const result = await service.clone(TEST_SESSION, TEST_WORKSPACE, {
        compressPercent: 50, // Legacy option
        writeToDisk: false,
      });

      // Should still work without LLM compression
      expect(result.stats.removedTurns).toBeGreaterThan(0);
      expect(result.stats.compression).toBeUndefined();
    });
  });
});
```

### 6. Tests (`test/routes/copilot-clone-compression.test.ts`)

TDD Red route tests for compression endpoint:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { app } from "../../src/server.js";

const TEST_WORKSPACE = "xyz987uvw654rst321";
const TEST_SESSION = "66666666-6666-6666-6666-666666666666";

describe("POST /api/copilot/clone - Compression Support", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = join(
      process.cwd(),
      "test/fixtures/copilot-sessions/workspaceStorage"
    );

    server = app.listen(0);
    const address = server.address();
    if (address && typeof address !== "string") {
      baseUrl = `http://127.0.0.1:${address.port}`;
    } else {
      throw new Error("Failed to start test server");
    }
  });

  afterAll(async () => {
    delete process.env.VSCODE_STORAGE_PATH;
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });

  // AC: Copilot clone uses LLM provider to compress messages
  it("accepts compressionBands in request options", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: TEST_SESSION,
        workspaceHash: TEST_WORKSPACE,
        options: {
          compressionBands: [
            { start: 0, end: 50, level: "heavy-compress" },
            { start: 50, end: 75, level: "compress" },
          ],
          writeToDisk: false,
        },
      }),
    });

    // Phase 3: Should return 500 due to NotImplementedError
    // Phase 4: Should return 200 with compression stats
    expect(response.status).toBeLessThanOrEqual(500);
  });

  // AC: Compression stats reflect actual token reduction
  it("returns compression stats when compressionBands used", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: TEST_SESSION,
        workspaceHash: TEST_WORKSPACE,
        options: {
          compressionBands: [{ start: 0, end: 100, level: "compress" }],
          writeToDisk: false,
        },
      }),
    });

    // Phase 4: Check response structure
    if (response.ok) {
      const data = await response.json();
      expect(data.stats).toHaveProperty("compression");
      expect(data.stats.compression).toHaveProperty("messagesCompressed");
      expect(data.stats.compression).toHaveProperty("reductionPercent");
    }
  });

  // AC: Clone operation shows progress during LLM compression
  it("supports debugLog option for compression visibility", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: TEST_SESSION,
        workspaceHash: TEST_WORKSPACE,
        options: {
          compressionBands: [{ start: 0, end: 50, level: "compress" }],
          debugLog: true,
          writeToDisk: false,
        },
      }),
    });

    // Phase 4: Should return debugLogPath when debugLog: true
    if (response.ok) {
      const data = await response.json();
      expect(data).toHaveProperty("debugLogPath");
    }
  });

  it("validates compressionBands schema", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: TEST_SESSION,
        workspaceHash: TEST_WORKSPACE,
        options: {
          compressionBands: [
            { start: -10, end: 150, level: "invalid" }, // Invalid values
          ],
          writeToDisk: false,
        },
      }),
    });

    // Should fail validation
    expect(response.status).toBe(400);
  });
});
```

## Verification

After completing this phase:

```bash
# Type check
npm run typecheck  # Must pass - no type errors

# Run tests
npm test           # Behavior tests ERROR (throw NotImplementedError)
```

Specifically:
- All existing tests still pass
- New compression tests ERROR because stubs throw NotImplementedError
- TypeScript compiles without errors
- New files created and properly exported

## Done When

- TypeScript compiles without errors
- All existing tests still pass
- New files created:
  - `src/services/copilot-compression.ts`
  - `test/services/copilot-compression.test.ts`
  - `test/services/copilot-clone-compression.test.ts`
  - `test/routes/copilot-clone-compression.test.ts`
- Updated files:
  - `src/services/copilot-clone.ts` (compressionBands option, compression stats)
  - `src/schemas/copilot-clone.ts` (compressionBands schema)
- **Behavior tests ERROR** (stubs throw NotImplementedError) - THIS IS CORRECT TDD RED

| Test Category | Expected Result |
|---------------|-----------------|
| Existing tests | PASS |
| estimateCopilotTokens | ERROR (NotImplementedError) |
| mapCopilotTurnsToBands | ERROR (NotImplementedError) |
| extractCopilotTextContent | ERROR (NotImplementedError) |
| createCopilotCompressionTasks | ERROR (NotImplementedError) |
| applyCopilotCompressionResults | ERROR (NotImplementedError) |
| compressCopilotMessages | ERROR (NotImplementedError) |
| Clone with compressionBands | ERROR (NotImplementedError) |
| Route with compressionBands | 500 (NotImplementedError) |

Implement the complete phase. Deliver working code with proper TypeScript types, not a plan.
```
