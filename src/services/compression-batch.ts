import type { CompressionTask, CompressionConfig } from "../types.js";
import type { OpenRouterClient } from "./openrouter-client.js";

export interface BatchConfig {
  concurrency: number;
  maxAttempts: number;
}

/**
 * Calculate timeout for a given attempt number.
 * Formula: timeoutInitial + attempt * timeoutIncrement
 * Capped at maxTimeout = timeoutInitial + 2 * timeoutIncrement
 */
export function calculateTimeout(attempt: number, config: CompressionConfig): number {
  const maxTimeout = config.timeoutInitial + 2 * config.timeoutIncrement;
  const calculated = config.timeoutInitial + attempt * config.timeoutIncrement;
  return Math.min(calculated, maxTimeout);
}

/**
 * Compress a single task with timeout using Promise.race.
 * Returns the task with updated status and result/error.
 */
export async function compressWithTimeout(
  task: CompressionTask,
  client: OpenRouterClient | { compress: (text: string, level: string, useLargeModel: boolean) => Promise<string> }
): Promise<CompressionTask> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Compression timeout")), task.timeoutMs);
  });

  try {
    const useLargeModel = task.estimatedTokens > 1000;
    const result = await Promise.race([
      client.compress(task.originalContent, task.level, useLargeModel),
      timeoutPromise,
    ]);

    return { ...task, status: "success", result };
  } catch (error) {
    return {
      ...task,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Process compression tasks in parallel batches with retry logic.
 *
 * Algorithm:
 * 1. Process tasks in batches of `concurrency` size
 * 2. For failed tasks, retry up to `maxAttempts` times with increasing timeout
 * 3. Return all completed tasks (success or failed after max retries)
 *
 * Retry State Machine:
 * - pending -> processing (picked up for batch)
 * - processing -> success (compress returns without error)
 * - processing -> retry (compress throws AND attempt < maxAttempts)
 * - processing -> failed (compress throws AND attempt >= maxAttempts)
 */
export async function processBatches(
  tasks: CompressionTask[],
  client: OpenRouterClient | { compress: (text: string, level: string, useLargeModel: boolean) => Promise<string> },
  config: BatchConfig,
  compressionConfig: CompressionConfig
): Promise<CompressionTask[]> {
  // Handle empty task list
  if (tasks.length === 0) {
    return [];
  }

  const results: CompressionTask[] = [];
  const pending: CompressionTask[] = [...tasks];

  while (pending.length > 0) {
    // Take up to `concurrency` tasks for this batch
    const batch = pending.splice(0, config.concurrency);

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map((task) => compressWithTimeout(task, client))
    );

    // Handle each result
    for (const result of batchResults) {
      if (result.status === "success") {
        results.push(result);
      } else {
        // Failed - check if we should retry
        const nextAttempt = result.attempt + 1;

        if (nextAttempt < config.maxAttempts) {
          // Retry with increased timeout
          pending.push({
            ...result,
            attempt: nextAttempt,
            timeoutMs: calculateTimeout(nextAttempt, compressionConfig),
            status: "pending",
            error: undefined,
          });
        } else {
          // Max retries exceeded - mark as failed
          console.warn(
            `[compression] Task ${result.messageIndex} failed after ${config.maxAttempts} attempts: ${result.error}`
          );
          results.push({ ...result, attempt: nextAttempt, status: "failed" });
        }
      }
    }
  }

  // Sort results by messageIndex for consistent ordering
  results.sort((a, b) => a.messageIndex - b.messageIndex);

  return results;
}
