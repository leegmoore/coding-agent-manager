```prompt
# Phase 4: Copilot LLM Compression - TDD Green (Claude Opus 4.5)

## Objective

Implement all Phase 3 stubs to make tests pass:
1. Copilot message text extraction
2. Turn-to-band mapping
3. Compression task creation
4. Batch processing via LLM provider
5. Result application to Copilot request format
6. Clone service integration

TDD Green means the tests written in Phase 3 (which asserted real behavior) now PASS because implementations return correct values.

## Context

Phase 3 created:
- `src/services/copilot-compression.ts` - Compression function stubs
- `src/schemas/copilot-clone.ts` - Updated with compressionBands schema
- `src/services/copilot-clone.ts` - Updated with compression option types
- Tests asserting real behavior (currently ERROR)

Your job is to implement the real logic so tests pass and LLM compression works end-to-end.

## Constraints

- Reuse existing `processBatches` from `src/services/compression-batch.ts`
- Reuse existing `getProvider` from `src/providers/index.ts`
- Preserve tool invocation items in response (only compress text content)
- Handle empty bands gracefully (return unchanged requests)
- Follow the Claude compression pattern for consistency

## Reference Files

Read these files before implementing:
- `src/services/compression.ts` - Claude compression (reference implementation)
- `src/services/compression-batch.ts` - Batch processing with retry
- `src/services/copilot-compression.ts` - Your stubs to implement
- `src/services/copilot-clone.ts` - Clone service to integrate with
- `src/providers/types.ts` - LlmProvider interface
- `src/providers/openrouter-provider.ts` - Example provider implementation
- `test/services/copilot-compression.test.ts` - Tests that must pass
- `test/services/copilot-clone-compression.test.ts` - Tests that must pass

## Deliverables

### 1. Implement Copilot Compression Service (`src/services/copilot-compression.ts`)

Replace all `NotImplementedError` throws with real implementations:

```typescript
import type {
  CompressionBand,
  CompressionTask,
  CompressionStats,
  CompressionConfig,
} from "../types.js";
import type { CopilotRequest, CopilotResponseItem } from "../sources/copilot-types.js";
import { processBatches } from "./compression-batch.js";
import { getProvider } from "../providers/index.js";

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
 * Estimate token count using chars/4 heuristic.
 * Matches Claude implementation for consistency.
 *
 * @param text - Text to estimate
 * @returns Estimated token count
 */
export function estimateCopilotTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
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
  if (requests.length === 0) {
    return [];
  }

  const totalTurns = requests.length;

  return requests.map((_, turnIndex) => {
    const position = (turnIndex / totalTurns) * 100;

    // Find matching band
    const matchingBand = bands.find(
      (band) => band.start <= position && position < band.end
    );

    return {
      turnIndex,
      band: matchingBand ?? null,
    };
  });
}

/**
 * Extract text content from a Copilot request for compression.
 * Returns user message text and concatenated assistant response text.
 * Excludes tool invocation items from assistant text.
 *
 * @param request - Copilot request to extract from
 * @returns Object with userText and assistantText
 */
export function extractCopilotTextContent(request: CopilotRequest): {
  userText: string;
  assistantText: string;
} {
  // User text is straightforward
  const userText = request.message.text;

  // Assistant text: concatenate markdownContent values, exclude tool items
  const textParts: string[] = [];
  for (const item of request.response) {
    if (typeof item === "object" && item !== null) {
      // Include markdownContent and plain text items
      if (
        (item.kind === "markdownContent" || !item.kind) &&
        typeof item.value === "string"
      ) {
        textParts.push(item.value);
      }
      // Skip toolInvocationSerialized, prepareToolInvocation, etc.
    }
  }

  return {
    userText,
    assistantText: textParts.join("\n\n"),
  };
}

/**
 * Calculate initial timeout based on estimated tokens.
 * Matches Claude implementation for consistency.
 */
function calculateInitialTimeout(estimatedTokens: number): number {
  if (estimatedTokens >= 4000) {
    return 90000;
  }
  if (estimatedTokens >= 1000) {
    return 30000;
  }
  return 20000;
}

/**
 * Create compression tasks for Copilot requests in compression bands.
 * Creates separate tasks for user and assistant content.
 * Messages below minTokens threshold get status "skipped".
 *
 * Task messageIndex encoding:
 * - User tasks: messageIndex = turnIndex * 2
 * - Assistant tasks: messageIndex = turnIndex * 2 + 1
 *
 * @param requests - All Copilot requests
 * @param mapping - Turn-to-band mappings
 * @param minTokens - Minimum tokens to compress (default 30)
 * @returns Array of compression tasks
 */
export function createCopilotCompressionTasks(
  requests: CopilotRequest[],
  mapping: CopilotTurnBandMapping[],
  minTokens: number = 30
): CompressionTask[] {
  const tasks: CompressionTask[] = [];

  for (const turnMapping of mapping) {
    // Skip turns without a compression band
    if (turnMapping.band === null) {
      continue;
    }

    const request = requests[turnMapping.turnIndex];
    const { userText, assistantText } = extractCopilotTextContent(request);

    // Create user task
    const userTokens = estimateCopilotTokens(userText);
    const isUserSkipped = userTokens < minTokens;
    tasks.push({
      messageIndex: turnMapping.turnIndex * 2, // User = even indices
      entryType: "user",
      originalContent: userText,
      level: turnMapping.band.level,
      estimatedTokens: userTokens,
      attempt: 0,
      timeoutMs: calculateInitialTimeout(userTokens),
      status: isUserSkipped ? "skipped" : "pending",
    });

    // Create assistant task
    const assistantTokens = estimateCopilotTokens(assistantText);
    const isAssistantSkipped = assistantTokens < minTokens;
    tasks.push({
      messageIndex: turnMapping.turnIndex * 2 + 1, // Assistant = odd indices
      entryType: "assistant",
      originalContent: assistantText,
      level: turnMapping.band.level,
      estimatedTokens: assistantTokens,
      attempt: 0,
      timeoutMs: calculateInitialTimeout(assistantTokens),
      status: isAssistantSkipped ? "skipped" : "pending",
    });
  }

  return tasks;
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
  // Build maps of successful results by turn index
  const userResults = new Map<number, string>();
  const assistantResults = new Map<number, string>();

  for (const task of tasks) {
    if (task.status !== "success" || task.result === undefined) {
      continue;
    }

    // Decode turn index from messageIndex
    const turnIndex = Math.floor(task.messageIndex / 2);

    if (task.entryType === "user") {
      userResults.set(turnIndex, task.result);
    } else {
      assistantResults.set(turnIndex, task.result);
    }
  }

  // Apply results to requests
  return requests.map((request, turnIndex) => {
    let updatedRequest = { ...request };

    // Apply user compression
    const compressedUser = userResults.get(turnIndex);
    if (compressedUser !== undefined) {
      updatedRequest = {
        ...updatedRequest,
        message: {
          ...updatedRequest.message,
          text: compressedUser,
        },
      };
    }

    // Apply assistant compression
    const compressedAssistant = assistantResults.get(turnIndex);
    if (compressedAssistant !== undefined) {
      // Preserve tool invocation items, replace text content
      const newResponse: CopilotResponseItem[] = [];
      let textReplaced = false;

      for (const item of request.response) {
        if (typeof item === "object" && item !== null) {
          // Keep tool-related items unchanged
          if (
            item.kind === "toolInvocationSerialized" ||
            item.kind === "prepareToolInvocation" ||
            item.kind === "mcpServersStarting"
          ) {
            newResponse.push(item);
          } else if (
            (item.kind === "markdownContent" || !item.kind) &&
            typeof item.value === "string"
          ) {
            // Replace first text item with compressed content
            if (!textReplaced) {
              newResponse.push({
                ...item,
                value: compressedAssistant,
              });
              textReplaced = true;
            }
            // Skip subsequent text items (they were concatenated and compressed together)
          } else {
            // Keep other item types
            newResponse.push(item);
          }
        } else {
          newResponse.push(item);
        }
      }

      // If no text was replaced, add the compressed content
      if (!textReplaced && compressedAssistant) {
        newResponse.unshift({
          kind: "markdownContent",
          value: compressedAssistant,
        });
      }

      updatedRequest = {
        ...updatedRequest,
        response: newResponse,
      };
    }

    return updatedRequest;
  });
}

/**
 * Calculate compression statistics from task results.
 */
function calculateCopilotStats(
  allTasks: CompressionTask[],
  completedTasks: CompressionTask[],
  totalRequests: number
): CompressionStats {
  const successful = completedTasks.filter((t) => t.status === "success");
  const failed = completedTasks.filter((t) => t.status === "failed");

  const originalTokens = allTasks
    .filter((t) => t.status !== "skipped")
    .reduce((sum, t) => sum + t.estimatedTokens, 0);

  const compressedTokens = successful.reduce(
    (sum, t) => sum + estimateCopilotTokens(t.result ?? ""),
    0
  );

  const tokensRemoved = originalTokens - compressedTokens;
  const reductionPercent =
    originalTokens > 0 ? Math.round((tokensRemoved / originalTokens) * 100) : 0;

  // Count skipped tasks
  const skippedCount = allTasks.filter((t) => t.status === "skipped").length;

  return {
    messagesCompressed: successful.length,
    messagesSkipped: skippedCount,
    messagesFailed: failed.length,
    originalTokens,
    compressedTokens,
    tokensRemoved,
    reductionPercent,
  };
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
  // Handle empty bands case - return unchanged
  if (bands.length === 0) {
    return {
      requests,
      stats: {
        messagesCompressed: 0,
        messagesSkipped: 0,
        messagesFailed: 0,
        originalTokens: 0,
        compressedTokens: 0,
        tokensRemoved: 0,
        reductionPercent: 0,
      },
      tasks: [],
    };
  }

  // Map turns to bands
  const mapping = mapCopilotTurnsToBands(requests, bands);

  // Create tasks (includes both pending and skipped tasks)
  const allTasks = createCopilotCompressionTasks(requests, mapping, config.minTokens);

  // Separate pending tasks for processing (skipped tasks stay as-is)
  const pendingTasks = allTasks.filter((t) => t.status === "pending");
  const skippedTasks = allTasks.filter((t) => t.status === "skipped");

  // Handle no pending tasks case
  if (pendingTasks.length === 0) {
    return {
      requests,
      stats: {
        messagesCompressed: 0,
        messagesSkipped: skippedTasks.length,
        messagesFailed: 0,
        originalTokens: 0,
        compressedTokens: 0,
        tokensRemoved: 0,
        reductionPercent: 0,
      },
      tasks: skippedTasks,
    };
  }

  // Get provider from factory
  const provider = getProvider();

  // Process via batch processor (only pending tasks)
  const batchConfig = {
    concurrency: config.concurrency,
    maxAttempts: config.maxAttempts,
  };

  console.log(`[copilot-compression] Processing ${pendingTasks.length} tasks with ${config.concurrency} concurrency`);

  const completedTasks = await processBatches(pendingTasks, provider, batchConfig);

  // Combine completed tasks with skipped tasks for full task list
  const allCompletedTasks = [...completedTasks, ...skippedTasks];

  // Apply results
  const compressedRequests = applyCopilotCompressionResults(requests, completedTasks);

  // Calculate statistics
  const stats = calculateCopilotStats(allTasks, completedTasks, requests.length);

  console.log(`[copilot-compression] Complete: ${stats.messagesCompressed} compressed, ${stats.reductionPercent}% reduction`);

  return {
    requests: compressedRequests,
    stats,
    tasks: allCompletedTasks,
  };
}
```

### 2. Update Copilot Clone Service (`src/services/copilot-clone.ts`)

Integrate compression into the clone method. Update the file to include compression support:

**Add imports at top:**

```typescript
import type { CompressionBand, CompressionStats } from "../types.js";
import { compressCopilotMessages } from "./copilot-compression.js";
import { loadCompressionConfig } from "../config.js";
```

**Update `CopilotCloneOptions` interface:**

```typescript
export interface CopilotCloneOptions {
  /** Remove tool invocations from responses */
  removeToolCalls?: boolean;
  /** Percentage of oldest turns to remove (0-100) - LEGACY, use compressionBands */
  compressPercent?: number;
  /** Write session to VS Code storage (default: true) */
  writeToDisk?: boolean;
  /** Target workspace hash (default: same as source) */
  targetWorkspaceHash?: string;
  /** LLM compression bands */
  compressionBands?: CompressionBand[];
  /** Enable debug logging for compression */
  debugLog?: boolean;
}
```

**Update `CopilotCloneStats` interface:**

```typescript
export interface CopilotCloneStats {
  originalTurns: number;
  clonedTurns: number;
  removedTurns: number;
  originalTokens: number;
  clonedTokens: number;
  removedTokens: number;
  compressionRatio: number;
  /** LLM compression stats */
  compression?: CompressionStats;
}
```

**Update `CopilotCloneResult` interface:**

```typescript
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

**Update `clone()` method** to support LLM compression:

```typescript
async clone(
  sessionId: string,
  workspaceHash: string,
  options: CopilotCloneOptions = {}
): Promise<CopilotCloneResult> {
  const source = getSessionSource("copilot") as CopilotSessionSource;
  const session = await source.loadSession(sessionId, workspaceHash);

  // Start with non-canceled requests
  let requests = session.requests.filter(r => !r.isCanceled);
  const originalRequests = [...requests];
  let compressionStats: CompressionStats | undefined;

  // Apply LLM compression if bands provided (new feature)
  if (options.compressionBands && options.compressionBands.length > 0) {
    const compressionConfig = loadCompressionConfig();
    const compressionResult = await compressCopilotMessages(
      requests,
      options.compressionBands,
      compressionConfig
    );
    requests = compressionResult.requests;
    compressionStats = compressionResult.stats;
  }

  // Remove tool calls if requested
  if (options.removeToolCalls) {
    requests = this.removeToolCalls(requests);
  }

  // Compress by percentage if requested (legacy turn removal)
  if (options.compressPercent !== undefined && options.compressPercent > 0) {
    requests = this.compressByPercentage(requests, options.compressPercent);
  }

  const clonedSession = this.buildClonedSession(session, requests);

  // Calculate stats, include compression stats
  const stats = this.calculateStats(originalRequests, requests);
  const finalStats: CopilotCloneStats = {
    ...stats,
    compression: compressionStats,
  };

  // Write to disk if requested (default: true)
  if (options.writeToDisk !== false) {
    const targetWorkspace = options.targetWorkspaceHash || workspaceHash;
    const { sessionPath, backupPath } = await this.writeSession(
      clonedSession,
      targetWorkspace
    );
    return {
      session: clonedSession,
      stats: finalStats,
      sessionPath,
      backupPath,
      writtenToDisk: true,
    };
  }

  return { session: clonedSession, stats: finalStats, writtenToDisk: false };
}
```

### 3. Update Clone Schema (`src/schemas/copilot-clone.ts`)

Ensure the schema includes compression bands:

```typescript
import { z } from "zod";

// Compression band schema
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

// Compression stats schema
const CompressionStatsSchema = z.object({
  messagesCompressed: z.number(),
  messagesSkipped: z.number(),
  messagesFailed: z.number(),
  originalTokens: z.number(),
  compressedTokens: z.number(),
  tokensRemoved: z.number(),
  reductionPercent: z.number(),
});

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
    compression: CompressionStatsSchema.optional(),
  }),
  sessionPath: z.string().optional(),
  backupPath: z.string().optional(),
  writtenToDisk: z.boolean(),
  debugLogPath: z.string().optional(),
});

export type CopilotCloneRequest = z.infer<typeof CopilotCloneRequestSchema>;
export type CopilotCloneResponse = z.infer<typeof CopilotCloneResponseSchema>;
```

### 4. Update Route (`src/routes/copilot-clone.ts`)

Ensure route passes compression options through:

```typescript
import { Router } from "express";
import validate from "express-zod-safe";
import { CopilotCloneRequestSchema } from "../schemas/copilot-clone.js";
import { copilotCloneService } from "../services/copilot-clone.js";
import { getSessionSource } from "../sources/index.js";
import type { CopilotSessionSource } from "../sources/copilot-source.js";

export const copilotCloneRouter = Router();

// POST /api/copilot/clone
copilotCloneRouter.post(
  "/api/copilot/clone",
  validate({ body: CopilotCloneRequestSchema }),
  async (req, res) => {
    try {
      const { sessionId, workspaceHash, options = {} } = req.body;

      const result = await copilotCloneService.clone(
        sessionId,
        workspaceHash,
        options // Pass all options including compressionBands
      );

      res.json({
        success: true,
        session: {
          sessionId: result.session.sessionId,
          customTitle: result.session.customTitle,
        },
        stats: result.stats,
        sessionPath: result.sessionPath,
        backupPath: result.backupPath,
        writtenToDisk: result.writtenToDisk,
        debugLogPath: result.debugLogPath,
      });
    } catch (error) {
      const err = error as Error;

      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return res.status(404).json({
          error: { message: "Session not found", code: "NOT_FOUND" }
        });
      }

      if (err.message?.includes("close VS Code") || err.message?.includes("SQLITE_BUSY")) {
        return res.status(409).json({
          error: {
            message: "Cannot write to VS Code database - please close VS Code and try again",
            code: "VSCODE_LOCKED"
          }
        });
      }

      // Log compression errors for debugging
      if (err.message?.includes("compression") || err.message?.includes("LLM")) {
        console.error("Copilot compression error:", error);
      }

      console.error("Copilot clone failed:", error);
      res.status(500).json({
        error: { message: "Clone operation failed", code: "CLONE_ERROR" }
      });
    }
  }
);

// GET /api/copilot/workspaces - List available target workspaces
copilotCloneRouter.get("/api/copilot/workspaces", async (req, res) => {
  try {
    const source = getSessionSource("copilot") as CopilotSessionSource;
    const projects = await source.listProjects();
    res.json({ workspaces: projects });
  } catch (error) {
    console.error("Failed to list workspaces:", error);
    res.status(500).json({
      error: { message: "Failed to list workspaces", code: "LIST_ERROR" }
    });
  }
});
```

### 5. Update Frontend (`public/js/pages/clone.js`)

Update the clone page to support compression bands for Copilot sessions. Find and update the Copilot clone submission:

**Update `handleSubmit` for Copilot with compression bands:**

Find this block:
```javascript
if (resolvedSource === "copilot") {
  endpoint = "/api/copilot/clone";
  // Get target workspace if selected
  const targetWorkspace = document.getElementById("target-workspace")?.value;
  body = {
    sessionId,
    workspaceHash: resolvedLocation,
    options: {
      removeToolCalls: options.toolRemoval !== "none",
      compressPercent: options.compressionBands?.[0]?.compressionLevel || 0,
      writeToDisk: true,
      targetWorkspaceHash: targetWorkspace || undefined
    }
  };
}
```

**REPLACE** with this (adds compressionBands support):

```javascript
if (resolvedSource === "copilot") {
  endpoint = "/api/copilot/clone";

  // Get target workspace if selected
  const targetWorkspace = document.getElementById("target-workspace")?.value;

  // Build options
  const cloneOptions = {
    removeToolCalls: options.toolRemoval !== "none",
    writeToDisk: true,
    targetWorkspaceHash: targetWorkspace || undefined,
  };

  // Add compression bands if configured
  // The UI sends bands in the same format as Claude clone
  if (options.compressionBands && options.compressionBands.length > 0) {
    cloneOptions.compressionBands = options.compressionBands.map(band => ({
      start: band.start,
      end: band.end,
      level: band.level,
    }));
  } else if (options.compressPercent) {
    // Legacy: convert single percentage to turn removal
    cloneOptions.compressPercent = options.compressPercent;
  }

  body = {
    sessionId,
    workspaceHash: resolvedLocation,
    options: cloneOptions,
  };
}
```

**Update success handling to show compression stats:**

Find the Copilot success handling section and update:

```javascript
if (resolvedSource === "copilot") {
  newSessionId = result.session?.sessionId || "copilot-session";

  if (result.writtenToDisk) {
    const targetInfo = result.sessionPath
      ? `\nWritten to: ${result.sessionPath}`
      : "";

    // Include compression info if present
    const compressionInfo = result.stats?.compression
      ? `\n\nLLM Compression: ${result.stats.compression.messagesCompressed} messages compressed (${result.stats.compression.reductionPercent}% reduction)`
      : "";

    command = `Session cloned successfully!

The cloned session will appear in VS Code's Copilot Chat
when you open the target workspace.

Session ID: ${result.session.sessionId}${targetInfo}${compressionInfo}`;

    showRestartHint();

    const downloadSection = document.getElementById('copilot-download-section');
    if (downloadSection) downloadSection.remove();
  } else {
    command = `Session cloned (download only)

The session could not be written to VS Code storage.
Download the JSON and import manually.`;

    showCopilotDownload(result.session, newSessionId);
  }

  // Format stats array with compression info
  stats = [
    { label: 'Original Turns', value: result.stats?.originalTurns || 0 },
    { label: 'Cloned Turns', value: result.stats?.clonedTurns || 0 },
    { label: 'Turn Compression', value: `${result.stats?.compressionRatio || 0}%` },
  ];

  // Add LLM compression stats if present
  if (result.stats?.compression) {
    stats.push({
      label: 'LLM Compression',
      value: `${result.stats.compression.reductionPercent}%`
    });
    stats.push({
      label: 'Messages Compressed',
      value: result.stats.compression.messagesCompressed
    });
  }
}
```

### 6. Update Test Files

Phase 3 created TDD-Red tests. Update them to properly test the implemented functionality:

**Update `test/services/copilot-compression.test.ts`:**

The tests should now pass. No changes needed to test assertions, but ensure the mock setup is correct:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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

// Mock the provider for compressCopilotMessages tests
vi.mock("../../src/providers/index.js", () => ({
  getProvider: () => ({
    compress: vi.fn().mockImplementation((text, level) => {
      // Return shortened version for testing
      const shortened = text.slice(0, Math.ceil(text.length * 0.35));
      return Promise.resolve(shortened);
    }),
  }),
}));

// ... rest of tests remain the same
```

**Update `test/services/copilot-clone-compression.test.ts`:**

Remove the NotImplementedError expectations, tests should now pass:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { join } from "path";
import { CopilotCloneService } from "../../src/services/copilot-clone.js";
import type { CompressionBand } from "../../src/types.js";

// Mock LLM provider
vi.mock("../../src/providers/index.js", () => ({
  getProvider: () => ({
    compress: vi.fn().mockImplementation((text) => {
      return Promise.resolve(text.slice(0, Math.ceil(text.length * 0.35)));
    }),
  }),
}));

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
    vi.restoreAllMocks();
  });

  describe("clone with compressionBands", () => {
    it("invokes LLM compression when compressionBands provided", async () => {
      const bands: CompressionBand[] = [
        { start: 0, end: 50, level: "heavy-compress" },
      ];

      const result = await service.clone(TEST_SESSION, TEST_WORKSPACE, {
        compressionBands: bands,
        writeToDisk: false,
      });

      // Should succeed with compression stats
      expect(result.stats.compression).toBeDefined();
    });

    it("respects heavy vs regular compression levels", async () => {
      const bands: CompressionBand[] = [
        { start: 0, end: 25, level: "heavy-compress" },
        { start: 25, end: 50, level: "compress" },
      ];

      const result = await service.clone(TEST_SESSION, TEST_WORKSPACE, {
        compressionBands: bands,
        writeToDisk: false,
      });

      expect(result.stats.compression).toBeDefined();
    });

    it("does not modify original session", async () => {
      const bands: CompressionBand[] = [
        { start: 0, end: 100, level: "compress" },
      ];

      await service.clone(TEST_SESSION, TEST_WORKSPACE, {
        compressionBands: bands,
        writeToDisk: false,
      });

      // Verify source session can still be loaded unchanged
      const source = await import("../../src/sources/index.js").then(m => m.getSessionSource("copilot"));
      const original = await (source as any).loadSession(TEST_SESSION, TEST_WORKSPACE);
      expect(original.sessionId).toBe(TEST_SESSION);
    });
  });

  describe("clone stats with compression", () => {
    it("includes compression stats in result", async () => {
      const bands: CompressionBand[] = [
        { start: 0, end: 100, level: "compress" },
      ];

      const result = await service.clone(TEST_SESSION, TEST_WORKSPACE, {
        compressionBands: bands,
        writeToDisk: false,
      });

      expect(result.stats.compression).toBeDefined();
      expect(result.stats.compression?.messagesCompressed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("clone without compressionBands (legacy)", () => {
    it("uses percentage-based turn removal when no compressionBands", async () => {
      const result = await service.clone(TEST_SESSION, TEST_WORKSPACE, {
        compressPercent: 50,
        writeToDisk: false,
      });

      expect(result.stats.removedTurns).toBeGreaterThan(0);
      expect(result.stats.compression).toBeUndefined();
    });
  });
});
```

## Verification

After completing this phase:

```bash
# Type check
npm run typecheck  # Must pass

# Run all tests
npm test           # All tests PASS

# Run specific test suites
npm test -- copilot-compression
npm test -- copilot-clone-compression
npm test -- copilot-clone
```

Manual testing:
1. Start dev server: `npm run dev`
2. Navigate to Clone page
3. Paste a Copilot session ID
4. Verify "Found in GitHub Copilot" appears
5. Configure compression bands (e.g., 0-50% heavy, 50-75% regular)
6. **Ensure LLM provider is configured** (OPENROUTER_API_KEY or LLM_PROVIDER=cc-cli)
7. **Close VS Code completely**
8. Click Clone
9. Verify success message shows compression stats
10. Verify LLM compression stats in response (messages compressed, reduction %)
11. Open VS Code and check the cloned session
12. Verify message content is compressed but readable

## Done When

- TypeScript compiles without errors
- All tests pass (including Phase 3 tests)
- No `NotImplementedError` remains in:
  - `src/services/copilot-compression.ts`
- Clone with compressionBands invokes LLM provider
- Compression stats include:
  - messagesCompressed
  - messagesSkipped
  - messagesFailed
  - originalTokens
  - compressedTokens
  - tokensRemoved
  - reductionPercent
- Tool invocation items preserved in compressed responses
- Heavy vs regular compression levels respected
- Frontend shows compression stats in success message
- Legacy compressPercent still works (turn removal fallback)

| Test Category | Expected Result |
|---------------|-----------------|
| All existing tests | PASS |
| estimateCopilotTokens | PASS |
| mapCopilotTurnsToBands | PASS |
| extractCopilotTextContent | PASS |
| createCopilotCompressionTasks | PASS |
| applyCopilotCompressionResults | PASS |
| compressCopilotMessages | PASS |
| Clone with compressionBands | PASS |
| Clone without compressionBands | PASS (legacy) |
| Route with compressionBands | 200 with compression stats |

Implement the complete phase. Deliver working code, not a plan.
```
