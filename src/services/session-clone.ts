import { readFile, writeFile } from "fs/promises";
import { readdir, stat } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import { CloneRequest, CloneResponse } from "../schemas/clone.js";
import type { CloneRequestV2, CloneResponseV2 } from "../schemas/clone-v2.js";
import { SessionNotFoundError } from "../errors.js";
import type {
  SessionEntry,
  Turn,
  RemovalOptions,
  CompressionStats,
  CompressionTask,
} from "../types.js";
import { config, loadCompressionConfig } from "../config.js";
import { logLineage } from "./lineage-logger.js";
import { compressMessages } from "./compression.js";
import { writeCompressionDebugLog } from "./compression-debug-logger.js";

/**
 * Find session file by searching all project directories
 */
export async function findSessionFile(sessionId: string): Promise<string> {
  const projectsDir = config.projectsDir;
  
  try {
    // Read all project directories
    const projectDirs = await readdir(projectsDir, { withFileTypes: true });
    
    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;
      
      const projectPath = path.join(projectsDir, dir.name);
      const sessionFile = path.join(projectPath, `${sessionId}.jsonl`);
      
      try {
        await stat(sessionFile);
        return sessionFile;
      } catch {
        // File doesn't exist in this project, continue searching
        continue;
      }
    }
    
    throw new SessionNotFoundError(sessionId);
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      throw err;
    }
    // If projectsDir doesn't exist or other error, treat as not found
    throw new SessionNotFoundError(sessionId);
  }
}

/**
 * Parse JSONL content into SessionEntry array
 */
export function parseSession(content: string): SessionEntry[] {
  const lines = content.trim().split("\n").filter(Boolean);
  return lines.map(line => JSON.parse(line) as SessionEntry);
}

// === Clone Title Generation (for summary entry) ===

/**
 * Format a timestamp for display in clone title.
 * Format: "Dec 12 2:30pm"
 */
function formatTimestamp(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()];
  const day = date.getDate();
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  return `${month} ${day} ${hours}:${minutes}${ampm}`;
}

/**
 * Generate a descriptive title for cloned sessions.
 * Format: "Clone: <first N chars of message> (<timestamp>)"
 */
function generateCloneTitle(firstUserMessage: string, maxLength: number = 50): string {
  const trimmed = firstUserMessage.trim();
  const preview = trimmed.length === 0
    ? "(No message)"
    : trimmed.length <= maxLength
      ? trimmed
      : trimmed.slice(0, maxLength) + "...";

  const timestamp = formatTimestamp(new Date(Date.now()));
  return `Clone: ${preview} (${timestamp})`;
}

/**
 * Extract the first user message content from session entries.
 */
function extractFirstUserMessage(entries: SessionEntry[]): string {
  const firstUser = entries.find(e => e.type === "user" && e.message?.content);
  if (!firstUser || !firstUser.message) return "";

  const content = firstUser.message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textBlock = content.find((b: unknown) =>
      typeof b === "object" && b !== null && (b as { type?: string }).type === "text"
    );
    return (textBlock as { text?: string })?.text || "";
  }
  return "";
}

/**
 * Create a summary entry for the cloned session.
 */
function createSummaryEntry(entries: SessionEntry[], firstUserMessage: string): SessionEntry {
  // Find the first entry with a uuid to use as leafUuid
  const firstWithUuid = entries.find(e => e.uuid);
  const leafUuid = firstWithUuid?.uuid || randomUUID();

  return {
    type: "summary",
    summary: generateCloneTitle(firstUserMessage),
    leafUuid,
  } as SessionEntry;
}

/**
 * Truncate tool content to 3 lines or 250 characters, whichever comes first.
 * Adds '...' suffix when truncated.
 */
export function truncateToolContent(content: string): string {
  if (!content) return content;

  const maxLines = 3;
  const maxChars = 250;

  const lines = content.split('\n');
  let truncated = lines.slice(0, maxLines).join('\n');
  let wasTruncated = lines.length > maxLines;

  if (truncated.length > maxChars) {
    truncated = truncated.slice(0, maxChars);
    wasTruncated = true;
  }

  if (wasTruncated) {
    truncated = truncated.trimEnd() + '...';
  }

  return truncated;
}

/**
 * Determines if an entry represents the start of a new turn.
 * A new turn starts when a user sends text content (not a tool result).
 */
function isNewTurn(entry: SessionEntry): boolean {
  if (entry.type !== "user") return false;

  // Meta messages (system-injected) are not turns
  if (entry.isMeta === true) return false;

  const content = entry.message?.content;

  // String content = human input (new turn)
  if (typeof content === "string") return true;

  // Array content - check block types
  if (Array.isArray(content)) {
    const hasText = content.some((b) => b.type === "text");
    const hasToolResult = content.some((b) => b.type === "tool_result");

    // New turn = has text but NOT tool_result
    // (tool_result alone means tool response within current turn)
    return hasText && !hasToolResult;
  }

  return false;
}

/**
 * Identifies turn boundaries in a session.
 * A turn starts when a user entry has text content (not tool_result).
 * Tool result entries are continuations of the current turn, not new turns.
 */
export function identifyTurns(entries: SessionEntry[]): Turn[] {
  const turns: Turn[] = [];
  let currentTurnStart: number | null = null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (isNewTurn(entry)) {
      // Close previous turn if exists
      if (currentTurnStart !== null) {
        turns.push({ startIndex: currentTurnStart, endIndex: i - 1 });
      }
      // Start new turn
      currentTurnStart = i;
    }
  }

  // Close final turn
  if (currentTurnStart !== null) {
    turns.push({ startIndex: currentTurnStart, endIndex: entries.length - 1 });
  }

  return turns;
}

/**
 * Apply removals based on options
 */
export function applyRemovals(entries: SessionEntry[], options: RemovalOptions): {
  entries: SessionEntry[];
  toolCallsRemoved: number;
  toolCallsTruncated: number;
  thinkingBlocksRemoved: number;
} {
  const turns = identifyTurns(entries);
  const turnCount = turns.length;

  // Calculate removal boundaries (numeric 0-100)
  const toolBoundary = options.toolRemoval === 0 ? 0 :
    options.toolRemoval >= 100 ? turnCount :
    Math.floor(turnCount * options.toolRemoval / 100);

  const thinkingBoundary = options.thinkingRemoval === 0 ? 0 :
    options.thinkingRemoval >= 100 ? turnCount :
    Math.floor(turnCount * options.thinkingRemoval / 100);

  const toolMode = options.toolHandlingMode || "remove";
  
  let toolCallsRemoved = 0;
  let toolCallsTruncated = 0;
  let thinkingBlocksRemoved = 0;
  const entriesToDelete = new Set<number>();
  const modifiedEntries: SessionEntry[] = entries.map((entry) => ({ ...entry }));
  
  // First pass: Collect all tool_use IDs that need to be removed
  const toolUseIdsToRemove = new Set<string>();
  for (let turnIdx = 0; turnIdx < turns.length; turnIdx++) {
    const turn = turns[turnIdx];
    const isInToolRemovalZone = turnIdx < toolBoundary;
    
    if (isInToolRemovalZone) {
      for (let i = turn.startIndex; i <= turn.endIndex; i++) {
        const entry = modifiedEntries[i];
        if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
          const content = entry.message.content as any[];
          content.forEach((block: any) => {
            if (block.type === "tool_use") {
              toolUseIdsToRemove.add(block.id);
            }
          });
        }
      }
    }
  }
  
  // Process each turn
  for (let turnIdx = 0; turnIdx < turns.length; turnIdx++) {
    const turn = turns[turnIdx];
    const isInToolRemovalZone = turnIdx < toolBoundary;
    const isInThinkingRemovalZone = turnIdx < thinkingBoundary;
    
    // Process entries in this turn
    for (let i = turn.startIndex; i <= turn.endIndex; i++) {
      if (entriesToDelete.has(i)) continue; // Skip already deleted entries
      
      const entry = modifiedEntries[i];
      let content = entry.type === "assistant" || entry.type === "user" 
        ? (Array.isArray(entry.message?.content) ? [...(entry.message.content as any[])] : null)
        : null;
      
      if (!content) continue;
      
      let contentModified = false;
      
      // Handle tool_use blocks (for assistant messages in removal zone)
      if (isInToolRemovalZone && entry.type === "assistant") {
        if (toolMode === "remove") {
          const beforeLength = content.length;
          content = content.filter((block: any) => {
            if (block.type === "tool_use") {
              toolCallsRemoved++;
              return false;
            }
            return true;
          });
          if (content.length !== beforeLength) contentModified = true;
        } else if (toolMode === "truncate") {
          content = content.map((block: any) => {
            if (block.type === "tool_use" && block.input) {
              const inputStr = typeof block.input === "string"
                ? block.input
                : JSON.stringify(block.input, null, 2);
              const truncatedInput = truncateToolContent(inputStr);
              if (truncatedInput !== inputStr) {
                toolCallsTruncated++;
                contentModified = true;
                return { ...block, input: truncatedInput };
              }
            }
            return block;
          });
        }
      }

      // Handle tool_result blocks (for user messages)
      if (entry.type === "user") {
        if (toolMode === "remove") {
          const beforeLength = content.length;
          content = content.filter((block: any) => {
            if (block.type === "tool_result" && toolUseIdsToRemove.has(block.tool_use_id)) {
              return false;
            }
            return true;
          });
          if (content.length !== beforeLength) contentModified = true;
        } else if (toolMode === "truncate" && isInToolRemovalZone) {
          content = content.map((block: any) => {
            if (block.type === "tool_result" && typeof block.content === "string") {
              const truncatedContent = truncateToolContent(block.content);
              if (truncatedContent !== block.content) {
                toolCallsTruncated++;
                contentModified = true;
                return { ...block, content: truncatedContent };
              }
            }
            return block;
          });
        }
      }
      
      // Remove thinking blocks surgically (for assistant messages in removal zone)
      if (isInThinkingRemovalZone && entry.type === "assistant") {
        const beforeLength = content.length;
        content = content.filter((block: any) => {
          if (block.type === "thinking") {
            thinkingBlocksRemoved++;
            return false;
          }
          return true;
        });
        if (content.length !== beforeLength) contentModified = true;
      }
      
      // Update or delete entry based on final content
      if (content.length === 0) {
        entriesToDelete.add(i);
      } else if (contentModified) {
        modifiedEntries[i] = {
          ...entry,
          message: {
            ...entry.message!,
            content: content,
          },
        };
      }
    }
  }
  
  // Remove deleted entries
  const finalEntries = modifiedEntries.filter((_, index) => !entriesToDelete.has(index));
  
  return {
    entries: finalEntries,
    toolCallsRemoved,
    toolCallsTruncated,
    thinkingBlocksRemoved,
  };
}

/**
 * Repair parentUuid chain after deletions
 */
export function repairParentUuidChain(entries: SessionEntry[]): SessionEntry[] {
  const repaired = entries.map(entry => ({ ...entry }));
  
  for (let i = 0; i < repaired.length; i++) {
    const entry = repaired[i];
    
    // If this entry has a parentUuid, check if parent still exists
    if (entry.parentUuid !== null && entry.parentUuid !== undefined) {
      const parentExists = repaired.some(e => e.uuid === entry.parentUuid);
      
      if (!parentExists) {
        // Find the last entry before this one that has a uuid
        let lastValidUuid: string | null = null;
        for (let j = i - 1; j >= 0; j--) {
          if (repaired[j].uuid !== null && repaired[j].uuid !== undefined) {
            lastValidUuid = repaired[j].uuid!;
            break;
          }
        }
        
        repaired[i] = {
          ...entry,
          parentUuid: lastValidUuid,
        };
      }
    }
  }
  
  return repaired;
}

/**
 * Clone session with selective removal
 */
export async function cloneSession(request: CloneRequest): Promise<CloneResponse> {
  // Find source session file
  const sourcePath = await findSessionFile(request.sessionId);
  
  // Read source content
  const sourceContent = await readFile(sourcePath, "utf-8");
  
  // Parse session
  const entries = parseSession(sourceContent);
  
  // Identify turns
  const turns = identifyTurns(entries);
  const originalTurnCount = turns.length;
  
  // Apply removals - convert string enum to numeric for v1 API
  const toolRemovalPercent = request.toolRemoval === "none" ? 0 :
    parseInt(request.toolRemoval, 10);
  const thinkingRemovalPercent = request.thinkingRemoval === "none" ? 0 :
    parseInt(request.thinkingRemoval, 10);

  const removalOptions: RemovalOptions = {
    toolRemoval: toolRemovalPercent,
    toolHandlingMode: "remove",  // v1 always removes
    thinkingRemoval: thinkingRemovalPercent,
  };

  const { entries: modifiedEntries, toolCallsRemoved, thinkingBlocksRemoved } =
    applyRemovals(entries, removalOptions);
  
  // Repair parentUuid chain
  const repairedEntries = repairParentUuidChain(modifiedEntries);
  
  // Generate new UUID
  const newSessionId = randomUUID();
  
  // Update sessionId only in entries that originally had one
  // (summary, file-history-snapshot have sessionId=null and should stay that way)
  const finalEntries = repairedEntries.map(entry => ({
    ...entry,
    ...(entry.sessionId != null ? { sessionId: newSessionId } : {}),
  }));
  
  // Identify turns in output (may have changed)
  const outputTurns = identifyTurns(finalEntries);
  const outputTurnCount = outputTurns.length;

  // Extract first user message and create summary entry
  const firstUserMessage = extractFirstUserMessage(entries);
  const summaryEntry = createSummaryEntry(finalEntries, firstUserMessage);

  // Write output file (same directory as source)
  const sourceDir = path.dirname(sourcePath);
  const outputPath = path.join(sourceDir, `${newSessionId}.jsonl`);

  // Convert back to JSONL with summary entry prepended
  const outputContent = [
    JSON.stringify(summaryEntry),
    ...finalEntries.map(entry => JSON.stringify(entry))
  ].join("\n") + "\n";

  await writeFile(outputPath, outputContent, "utf-8");
  
  // Log lineage
  await logLineage({
    timestamp: new Date().toISOString(),
    targetId: newSessionId,
    targetPath: outputPath,
    sourceId: request.sessionId,
    sourcePath: sourcePath,
    toolRemoval: toolRemovalPercent,
    thinkingRemoval: thinkingRemovalPercent,
  });
  
  return {
    success: true,
    outputPath,
    stats: {
      originalTurnCount,
      outputTurnCount,
      toolCallsRemoved,
      thinkingBlocksRemoved,
    },
  };
}

/**
 * Clone session with selective removal and LLM-based compression (v2)
 */
export async function cloneSessionV2(
  request: CloneRequestV2
): Promise<CloneResponseV2> {
  // 1. Find and load source session
  const sourcePath = await findSessionFile(request.sessionId);
  const sourceContent = await readFile(sourcePath, "utf-8");

  // 2. Parse and identify turns
  let entries = parseSession(sourceContent);
  const turns = identifyTurns(entries);
  const originalTurnCount = turns.length;

  let compressionStats: CompressionStats | undefined;
  let compressionTasks: CompressionTask[] = [];
  let originalEntries: SessionEntry[] | undefined;
  let debugLogPath: string | undefined;

  // 3. Apply compression if specified (BEFORE tool removal for accurate stats)
  if (request.compressionBands && request.compressionBands.length > 0) {
    // Deep clone entries before compression if debug logging enabled
    if (request.debugLog) {
      originalEntries = JSON.parse(JSON.stringify(entries)) as SessionEntry[];
    }

    const compressionConfig = loadCompressionConfig();
    const compressionResult = await compressMessages(
      entries,
      turns,
      request.compressionBands,
      compressionConfig,
      request.includeUserMessages ?? false
    );
    entries = compressionResult.entries;
    compressionStats = compressionResult.stats;
    compressionTasks = compressionResult.tasks;
  }

  // 4. Apply tool/thinking removal
  const removalOptions: RemovalOptions = {
    toolRemoval: request.toolRemoval ?? 0,
    toolHandlingMode: request.toolHandlingMode ?? "remove",
    thinkingRemoval: request.thinkingRemoval ?? 0,
  };

  const {
    entries: modifiedEntries,
    toolCallsRemoved,
    toolCallsTruncated,
    thinkingBlocksRemoved,
  } = applyRemovals(entries, removalOptions);

  // 5. Repair UUID chain
  const repairedEntries = repairParentUuidChain(modifiedEntries);

  // 6. Generate new session ID and update entries
  const newSessionId = randomUUID();
  const finalEntries = repairedEntries.map((entry) => ({
    ...entry,
    ...(entry.sessionId != null ? { sessionId: newSessionId } : {}),
  }));

  // 7. Calculate output turn count
  const outputTurns = identifyTurns(finalEntries);
  const outputTurnCount = outputTurns.length;

  // 7.5 Extract first user message and create summary entry
  const firstUserMessageV2 = extractFirstUserMessage(entries);
  const summaryEntryV2 = createSummaryEntry(finalEntries, firstUserMessageV2);

  // 8. Write output file
  const sourceDir = path.dirname(sourcePath);
  const outputPath = path.join(sourceDir, `${newSessionId}.jsonl`);
  const outputContent = [
    JSON.stringify(summaryEntryV2),
    ...finalEntries.map((e) => JSON.stringify(e))
  ].join("\n") + "\n";
  await writeFile(outputPath, outputContent, "utf-8");

  // 9. Log lineage with compression info
  await logLineage({
    timestamp: new Date().toISOString(),
    targetId: newSessionId,
    targetPath: outputPath,
    sourceId: request.sessionId,
    sourcePath,
    toolRemoval: request.toolRemoval ?? 0,
    thinkingRemoval: request.thinkingRemoval ?? 0,
    compressionBands: request.compressionBands,
    compressionStats,
  });

  // 10. Write debug log if requested
  if (request.debugLog && originalEntries && compressionTasks.length > 0) {
    try {
      const debugLogDir = path.join(process.cwd(), "clone-debug-log");
      const debugLogFilename = `${newSessionId}-compression-debug.md`;
      await writeCompressionDebugLog(
        request.sessionId,
        newSessionId,
        sourcePath,
        outputPath,
        originalEntries,
        finalEntries,
        compressionTasks,
        debugLogDir
      );
      debugLogPath = `/clone-debug-log/${debugLogFilename}`;
    } catch (error) {
      // Don't fail clone if debug log fails
      console.error(`[debug] Failed to write compression debug log:`, error);
    }
  }

  // 11. Return response with all stats
  return {
    success: true,
    outputPath,
    debugLogPath,
    stats: {
      originalTurnCount,
      outputTurnCount,
      toolCallsRemoved,
      toolCallsTruncated: toolCallsTruncated > 0 ? toolCallsTruncated : undefined,
      thinkingBlocksRemoved,
      compression: compressionStats,
    },
  };
}
