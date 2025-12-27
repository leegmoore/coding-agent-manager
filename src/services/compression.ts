import type {
  SessionEntry,
  Turn,
  CompressionBand,
  CompressionTask,
  TurnBandMapping,
  CompressionStats,
  CompressionConfig,
  ContentBlock,
} from "../types.js";
import { processBatches, type BatchConfig } from "./compression-batch.js";
import { getProvider } from "../providers/index.js";

/**
 * Estimate token count using chars/4 heuristic.
 * Returns ceil(text.length / 4), or 0 for empty string.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Extract text content from a session entry.
 * - If content is a string, returns it directly.
 * - If content is an array, extracts text from all text blocks and joins with newlines.
 * - Returns empty string if no text content found.
 */
export function extractTextContent(entry: SessionEntry): string {
  const content = entry.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const textBlocks = content.filter(
      (block): block is ContentBlock & { text: string } =>
        block.type === "text" && typeof block.text === "string"
    );
    return textBlocks.map((block) => block.text).join("\n");
  }

  return "";
}

/**
 * Apply compressed text content back to a session entry.
 * Returns a new entry (does not mutate the original).
 * - If content is a string, replaces it with compressed text.
 * - If content is an array, replaces all text blocks with a single new text block,
 *   preserving non-text blocks.
 */
export function applyCompressedContent(
  entry: SessionEntry,
  compressedText: string
): SessionEntry {
  const content = entry.message?.content;

  if (typeof content === "string") {
    return {
      ...entry,
      message: {
        ...entry.message,
        content: compressedText,
      },
    };
  }

  if (Array.isArray(content)) {
    // Find first text block position
    const firstTextIndex = content.findIndex((block) => block.type === "text");

    // Filter out all text blocks, keeping only non-text blocks
    const nonTextBlocks = content.filter((block) => block.type !== "text");

    // Create new text block
    const newTextBlock: ContentBlock = { type: "text", text: compressedText };

    // Insert new text block at the position of the first original text block (or at start)
    const insertIndex = firstTextIndex >= 0 ? Math.min(firstTextIndex, nonTextBlocks.length) : 0;
    const newContent = [
      ...nonTextBlocks.slice(0, insertIndex),
      newTextBlock,
      ...nonTextBlocks.slice(insertIndex),
    ];

    return {
      ...entry,
      message: {
        ...entry.message,
        content: newContent,
      },
    };
  }

  // No content to modify
  return entry;
}

/**
 * Map turns to compression bands based on turn position.
 * Turn position formula: (turnIndex / totalTurns) * 100
 * A turn matches a band if: band.start <= position < band.end
 */
export function mapTurnsToBands(
  turns: Turn[],
  bands: CompressionBand[]
): TurnBandMapping[] {
  if (turns.length === 0) {
    return [];
  }

  const totalTurns = turns.length;

  return turns.map((_, turnIndex) => {
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
 * Calculate initial timeout based on estimated tokens.
 * - Default: 20 seconds
 * - 1000+ tokens: 30 seconds
 * - 4000+ tokens: 90 seconds
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
 * Create compression tasks for messages in turns that have compression bands.
 * Messages below the minimum token threshold (default 30) get status "skipped".
 * Only creates tasks for user and assistant message types.
 */
export function createCompressionTasks(
  entries: SessionEntry[],
  turns: Turn[],
  mapping: TurnBandMapping[],
  minTokens: number = 30
): CompressionTask[] {
  const tasks: CompressionTask[] = [];

  for (const turnMapping of mapping) {
    // Skip turns without a compression band
    if (turnMapping.band === null) {
      continue;
    }

    const turn = turns[turnMapping.turnIndex];

    // Iterate through all entries in this turn's range
    for (let entryIndex = turn.startIndex; entryIndex <= turn.endIndex; entryIndex++) {
      const entry = entries[entryIndex];

      // Only process user and assistant message types
      if (entry.type !== "user" && entry.type !== "assistant") {
        continue;
      }

      // Extract text content and estimate tokens
      const textContent = extractTextContent(entry);
      const tokenCount = estimateTokens(textContent);

      // Create task - mark as skipped if below threshold, pending otherwise
      const isSkipped = tokenCount < minTokens;
      const task: CompressionTask = {
        messageIndex: entryIndex,
        entryType: entry.type as "user" | "assistant",
        originalContent: textContent,
        level: turnMapping.band.level,
        estimatedTokens: tokenCount,
        attempt: 0,
        timeoutMs: calculateInitialTimeout(tokenCount),
        status: isSkipped ? "skipped" : "pending",
      };

      tasks.push(task);
    }
  }

  return tasks;
}

/**
 * Apply compression results to entries.
 * Returns a new array of entries with successful compression results applied.
 * Failed tasks leave the original entry unchanged.
 */
export function applyCompressionResults(
  entries: SessionEntry[],
  results: CompressionTask[]
): SessionEntry[] {
  // Create a map of messageIndex -> compressed result for successful tasks
  const successfulResults = new Map<number, string>();

  for (const task of results) {
    if (task.status === "success" && task.result !== undefined) {
      successfulResults.set(task.messageIndex, task.result);
    }
  }

  // Apply results to entries
  return entries.map((entry, index) => {
    const compressedResult = successfulResults.get(index);
    if (compressedResult !== undefined) {
      return applyCompressedContent(entry, compressedResult);
    }
    return entry;
  });
}

/**
 * Calculate compression statistics from task results.
 */
export function calculateStats(
  originalTasks: CompressionTask[],
  completedTasks: CompressionTask[],
  totalEntries: number
): CompressionStats {
  const successful = completedTasks.filter((t) => t.status === "success");
  const failed = completedTasks.filter((t) => t.status === "failed");

  const originalTokens = originalTasks.reduce((sum, t) => sum + t.estimatedTokens, 0);
  const compressedTokens = successful.reduce(
    (sum, t) => sum + estimateTokens(t.result ?? ""),
    0
  );

  const tokensRemoved = originalTokens - compressedTokens;
  const reductionPercent =
    originalTokens > 0 ? Math.round((tokensRemoved / originalTokens) * 100) : 0;

  // Calculate timing stats from tasks that have durationMs
  const tasksWithDuration = completedTasks.filter((t) => t.durationMs !== undefined);
  const totalDurationMs = tasksWithDuration.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
  const avgDurationMs = tasksWithDuration.length > 0
    ? Math.round(totalDurationMs / tasksWithDuration.length)
    : 0;

  return {
    messagesCompressed: successful.length,
    messagesSkipped: totalEntries - originalTasks.length,
    messagesFailed: failed.length,
    originalTokens,
    compressedTokens,
    tokensRemoved,
    reductionPercent,
    totalDurationMs: tasksWithDuration.length > 0 ? totalDurationMs : undefined,
    avgDurationMs: tasksWithDuration.length > 0 ? avgDurationMs : undefined,
  };
}

/**
 * Main compression orchestration function.
 * Orchestrates turn mapping, task creation, batch processing, and result application.
 * Returns entries, stats, and all tasks (for debug logging).
 */
export async function compressMessages(
  entries: SessionEntry[],
  turns: Turn[],
  bands: CompressionBand[],
  config: CompressionConfig
): Promise<{ entries: SessionEntry[]; stats: CompressionStats; tasks: CompressionTask[] }> {
  // Handle empty bands case - return unchanged
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
        reductionPercent: 0,
      },
      tasks: [],
    };
  }

  // Map turns to bands
  const mapping = mapTurnsToBands(turns, bands);

  // Create tasks (includes both pending and skipped tasks)
  const allTasks = createCompressionTasks(entries, turns, mapping, config.minTokens);

  // Separate pending tasks for processing (skipped tasks stay as-is)
  const pendingTasks = allTasks.filter((t) => t.status === "pending");
  const skippedTasks = allTasks.filter((t) => t.status === "skipped");

  // Handle no pending tasks case
  if (pendingTasks.length === 0) {
    return {
      entries,
      stats: {
        messagesCompressed: 0,
        messagesSkipped: entries.length,
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
  const batchConfig: BatchConfig = {
    concurrency: config.concurrency,
    maxAttempts: config.maxAttempts,
  };

  const completedTasks = await processBatches(pendingTasks, provider, batchConfig);

  // Combine completed tasks with skipped tasks for full task list
  const allCompletedTasks = [...completedTasks, ...skippedTasks];

  // Apply results
  const compressedEntries = applyCompressionResults(entries, completedTasks);

  // Calculate statistics (using only the pending tasks that were processed)
  const stats = calculateStats(pendingTasks, completedTasks, entries.length);

  return { entries: compressedEntries, stats, tasks: allCompletedTasks };
}
