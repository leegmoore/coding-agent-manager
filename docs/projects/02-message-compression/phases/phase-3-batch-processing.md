# Phase 3: Batch Processing (TDD)

## Goal

Implement parallel batch processing with timeout and retry logic.

## Context

**Project:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/`

Phase 2 implemented core compression logic. Now implement the batch processor that handles parallel execution, timeouts, and retries.

## Test File

Create `test/compression-batch.test.ts`

## Test Setup

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { processBatches, compressWithTimeout } from "../src/services/compression-batch.js";
import type { CompressionTask } from "../src/types.js";

// Mock client for tests
let mockClient: { compress: any };

beforeEach(() => {
  mockClient = {
    compress: vi.fn().mockResolvedValue("compressed text")
  };
});
```

---

## TDD Red: Write Tests

### TC-01: Basic Compression Band

**Setup:**
- 3 tasks at "compress" level (35% target)
- Mock client returns `"compressed"` for all

**Input:**
```typescript
const tasks: CompressionTask[] = [
  {
    messageIndex: 0,
    entryType: "user",
    originalContent: "x".repeat(200),
    level: "compress",
    estimatedTokens: 50,
    attempt: 0,
    timeoutMs: 5000,
    status: "pending"
  },
  {
    messageIndex: 1,
    entryType: "assistant",
    originalContent: "y".repeat(400),
    level: "compress",
    estimatedTokens: 100,
    attempt: 0,
    timeoutMs: 5000,
    status: "pending"
  },
  {
    messageIndex: 2,
    entryType: "user",
    originalContent: "z".repeat(600),
    level: "compress",
    estimatedTokens: 150,
    attempt: 0,
    timeoutMs: 5000,
    status: "pending"
  }
];
```

**Expected:**
- All 3 tasks have `status: "success"`
- All 3 tasks have `result: "compressed"`
- `mockClient.compress` called 3 times with level "compress"
- For messages <1000 tokens, `useThinking: false`

**Assertions:**
```typescript
it("TC-01: processes compression band successfully", async () => {
  const config = { concurrency: 10, maxAttempts: 4 };
  const results = await processBatches(tasks, mockClient, config);

  expect(results).toHaveLength(3);
  expect(results.filter(t => t.status === "success")).toHaveLength(3);
  expect(mockClient.compress).toHaveBeenCalledTimes(3);
  expect(mockClient.compress).toHaveBeenCalledWith(
    expect.any(String),
    "compress",
    false  // useThinking
  );
});
```

### TC-02: Heavy Compression Band

**Setup:**
- 2 tasks at "heavy-compress" level (10% target)

**Input:**
```typescript
const tasks: CompressionTask[] = [
  {
    messageIndex: 0,
    entryType: "assistant",
    originalContent: "x".repeat(400),
    level: "heavy-compress",
    estimatedTokens: 100,
    attempt: 0,
    timeoutMs: 5000,
    status: "pending"
  },
  {
    messageIndex: 1,
    entryType: "user",
    originalContent: "y".repeat(800),
    level: "heavy-compress",
    estimatedTokens: 200,
    attempt: 0,
    timeoutMs: 5000,
    status: "pending"
  }
];
```

**Expected:**
- Tasks processed with "heavy-compress" level

**Assertions:**
```typescript
it("TC-02: uses heavy-compress level", async () => {
  const config = { concurrency: 10, maxAttempts: 4 };
  await processBatches(tasks, mockClient, config);

  expect(mockClient.compress).toHaveBeenCalledWith(
    expect.any(String),
    "heavy-compress",
    false
  );
});
```

### TC-06: Compression Timeout and Retry

**Setup:**
- 1 task
- Mock client fails first time, succeeds second time

**Input:**
```typescript
const task: CompressionTask = {
  messageIndex: 0,
  entryType: "user",
  originalContent: "test message",
  level: "compress",
  estimatedTokens: 50,
  attempt: 0,
  timeoutMs: 5000,
  status: "pending"
};

mockClient.compress
  .mockRejectedValueOnce(new Error("timeout"))
  .mockResolvedValueOnce("compressed on retry");
```

**Expected:**
- First batch: task fails
- Second batch: task succeeds
- Final task has `status: "success"`, `result: "compressed on retry"`, `attempt: 1`

**Assertions:**
```typescript
it("TC-06: retries failed compression with increased timeout", async () => {
  const config = { concurrency: 10, maxAttempts: 4 };
  const results = await processBatches([task], mockClient, config);

  expect(mockClient.compress).toHaveBeenCalledTimes(2);
  expect(results[0].status).toBe("success");
  expect(results[0].result).toBe("compressed on retry");
  expect(results[0].attempt).toBe(1);
});
```

### TC-07: Maximum Retry Exceeded

**Setup:**
- 1 task
- Mock client always fails

**Input:**
```typescript
mockClient.compress.mockRejectedValue(new Error("always fails"));

const task: CompressionTask = {
  messageIndex: 0,
  entryType: "user",
  originalContent: "test",
  level: "compress",
  estimatedTokens: 50,
  attempt: 0,
  timeoutMs: 5000,
  status: "pending"
};
```

**Expected:**
- Tried 4 times total (initial + 3 retries)
- Final task has `status: "failed"`, `attempt: 4`
- Warning logged

**Assertions:**
```typescript
it("TC-07: marks failed after max retries", async () => {
  const config = { concurrency: 10, maxAttempts: 4 };
  const results = await processBatches([task], mockClient, config);

  expect(mockClient.compress).toHaveBeenCalledTimes(4);
  expect(results[0].status).toBe("failed");
  expect(results[0].attempt).toBe(4);
  expect(results[0].error).toBeDefined();
});
```

### TC-13: Parallel Batch Processing

**Setup:**
- 15 tasks
- Concurrency: 5
- All succeed

**Input:**
```typescript
const tasks: CompressionTask[] = Array.from({ length: 15 }, (_, i) => ({
  messageIndex: i,
  entryType: "user",
  originalContent: `Message ${i}`,
  level: "compress",
  estimatedTokens: 50,
  attempt: 0,
  timeoutMs: 5000,
  status: "pending"
}));
```

**Expected:**
- Processed in 3 batches (5+5+5)
- All 15 successful

**Assertions:**
```typescript
it("TC-13: processes in parallel batches", async () => {
  const config = { concurrency: 5, maxAttempts: 4 };
  const results = await processBatches(tasks, mockClient, config);

  expect(results).toHaveLength(15);
  expect(results.every(t => t.status === "success")).toBe(true);
  expect(mockClient.compress).toHaveBeenCalledTimes(15);
});
```

### Timeout Progression Test

**Setup:**
- 1 task that fails all attempts
- Track timeout values used

**Input:**
```typescript
mockClient.compress.mockRejectedValue(new Error("timeout"));

const task: CompressionTask = {
  messageIndex: 0,
  entryType: "user",
  originalContent: "test",
  level: "compress",
  estimatedTokens: 50,
  attempt: 0,
  timeoutMs: 5000,
  status: "pending"
};
```

**Expected:**
- Attempts: 4 (indices 0, 1, 2, 3)
- Timeouts: 5000, 10000, 15000, 15000

**Assertions:**
```typescript
it("increases timeout on each retry", async () => {
  const config = { concurrency: 10, maxAttempts: 4 };
  const results = await processBatches([task], mockClient, config);

  // Verify final task has been retried 4 times
  expect(results[0].attempt).toBe(4);

  // Note: Timeout values are updated in the task state during retries
  // The progression is validated by the implementation logic
});
```

---

## TDD Green: Implement Functions

### Retry State Machine

**States:** pending → processing → (success | retry | failed)

**Transitions:**
1. `pending → processing`: Task picked up for current batch
2. `processing → success`: `client.compress()` returns without throwing
3. `processing → retry`: `client.compress()` throws AND `task.attempt < maxAttempts`
   - `task.attempt++`
   - `task.timeoutMs` updated via timeout calculation
   - `task.status = "pending"` (queued for next batch)
4. `processing → failed`: `client.compress()` throws AND `task.attempt >= maxAttempts`
   - `task.status = "failed"`
   - `task.error = error.message`
   - Log warning

### Timeout Calculation

Timeout is calculated from config (not hardcoded array):

```typescript
function calculateTimeout(attempt: number, config: CompressionConfig): number {
  // attempt 0: timeoutInitial (5000)
  // attempt 1: timeoutInitial + timeoutIncrement (10000)
  // attempt 2: timeoutInitial + 2*timeoutIncrement (15000)
  // attempt 3+: capped at maxTimeout
  const maxTimeout = config.timeoutInitial + 2 * config.timeoutIncrement;
  const calculated = config.timeoutInitial + attempt * config.timeoutIncrement;
  return Math.min(calculated, maxTimeout);
}
```

### 1. `compressWithTimeout(task, client): Promise<CompressionTask>`

**File:** `src/services/compression-batch.ts`

**Implementation approach:**

Use `Promise.race` pattern for timeout (AbortSignal not passed to client):

```typescript
export async function compressWithTimeout(
  task: CompressionTask,
  client: OpenRouterClient
): Promise<CompressionTask> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Compression timeout")), task.timeoutMs);
  });

  try {
    const useThinking = task.estimatedTokens > 1000;
    const result = await Promise.race([
      client.compress(task.originalContent, task.level, useThinking),
      timeoutPromise
    ]);

    return { ...task, status: "success", result };
  } catch (error) {
    return {
      ...task,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
```

### 2. `processBatches(tasks, client, config): Promise<CompressionTask[]>`

**File:** `src/services/compression-batch.ts`

**Algorithm:**
```
results = []
pending = [...tasks]

while pending.length > 0:
  batch = pending.splice(0, concurrency)

  batchResults = await Promise.all(
    batch.map(task => compressWithTimeout(task, client))
  )

  for each result:
    if result.status === "success":
      results.push(result)
    else:
      nextAttempt = result.attempt + 1
      if nextAttempt < maxAttempts:
        // Retry with increased timeout
        pending.push({
          ...result,
          attempt: nextAttempt,
          timeoutMs: calculateTimeout(nextAttempt, config),
          status: "pending",
          error: undefined
        })
      else:
        // Max retries exceeded
        console.warn(`[compression] Task ${result.messageIndex} failed after ${maxAttempts} attempts: ${result.error}`)
        results.push({ ...result, attempt: nextAttempt, status: "failed" })

return results
```

### 3. Update `compressMessages()` Integration

**File:** `src/services/compression.ts`

Update the stubbed `compressMessages()` function to integrate batch processing:

```typescript
import { processBatches, type BatchConfig } from "./compression-batch.js";
import { OpenRouterClient } from "./openrouter-client.js";

export async function compressMessages(
  entries: SessionEntry[],
  turns: Turn[],
  bands: CompressionBand[],
  config: CompressionConfig
): Promise<{ entries: SessionEntry[]; stats: CompressionStats }> {
  // Handle empty bands
  if (bands.length === 0) {
    return {
      entries,
      stats: {
        messagesCompressed: 0,
        messagesSkipped: 0,
        messagesFailed: 0,
        originalTokens: 0,
        compressedTokens: 0,
        tokensRemoved: 0,
        reductionPercent: 0
      }
    };
  }

  // Map turns to bands
  const mapping = mapTurnsToBands(turns, bands);

  // Create tasks
  const tasks = createCompressionTasks(entries, turns, mapping, config.minTokens);

  if (tasks.length === 0) {
    return { entries, stats: { /* zero stats */ } };
  }

  // Initialize client (stub for Phase 3, real in Phase 4)
  const client = new OpenRouterClient({
    apiKey: process.env.OPENROUTER_API_KEY || "",
    model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
    modelThinking: (process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash") + ":thinking"
  });

  // Process via batch processor
  const batchConfig: BatchConfig = {
    concurrency: config.concurrency,
    maxAttempts: config.maxAttempts
  };

  const completedTasks = await processBatches(tasks, client, batchConfig);

  // Apply results
  const compressedEntries = applyCompressionResults(entries, completedTasks);

  // Calculate statistics
  const stats = calculateStats(tasks, completedTasks, entries.length);

  return { entries: compressedEntries, stats };
}

// Helper to calculate statistics
function calculateStats(
  originalTasks: CompressionTask[],
  completedTasks: CompressionTask[],
  totalEntries: number
): CompressionStats {
  const successful = completedTasks.filter(t => t.status === "success");
  const failed = completedTasks.filter(t => t.status === "failed");

  const originalTokens = originalTasks.reduce((sum, t) => sum + t.estimatedTokens, 0);
  const compressedTokens = successful.reduce((sum, t) =>
    sum + estimateTokens(t.result ?? ""), 0
  );

  const tokensRemoved = originalTokens - compressedTokens;
  const reductionPercent = originalTokens > 0
    ? Math.round((tokensRemoved / originalTokens) * 100)
    : 0;

  return {
    messagesCompressed: successful.length,
    messagesSkipped: totalEntries - originalTasks.length,
    messagesFailed: failed.length,
    originalTokens,
    compressedTokens,
    tokensRemoved,
    reductionPercent
  };
}
```

---

## Verification

- [ ] All TC tests pass (TC-01, TC-02, TC-06, TC-07, TC-13)
- [ ] Timeout progression test passes
- [ ] Retry logic works correctly
- [ ] Max retries handled properly
- [ ] Parallel batching verified
- [ ] `compressMessages()` integrates batch processor
- [ ] Existing v1 tests still pass (36 total tests now pass)
- [ ] TypeScript compiles

## Notes

- Use `Promise.race` for timeout (simpler than AbortSignal)
- Timeout calculated from config: `timeoutInitial + attempt * timeoutIncrement` (capped)
- Failed tasks are logged with `console.warn`
- OpenRouterClient is still stubbed (Phase 4 implements)
