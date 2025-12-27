import { writeFile, mkdir } from "fs/promises";
import path from "path";
import type { SessionEntry, CompressionTask } from "../types.js";
import { estimateTokens, extractTextContent } from "./compression.js";

/**
 * Write a compression debug log file showing before/after for each compressed message.
 *
 * @param sourceSessionId - Original session ID
 * @param targetSessionId - New session ID after cloning
 * @param sourcePath - Path to source session file
 * @param targetPath - Path to target session file
 * @param sourceEntries - Entries before compression (deep cloned)
 * @param targetEntries - Entries after compression
 * @param tasks - All compression tasks (success/skipped/failed)
 * @param debugLogDir - Directory to write debug log
 */
export async function writeCompressionDebugLog(
  sourceSessionId: string,
  targetSessionId: string,
  sourcePath: string,
  targetPath: string,
  sourceEntries: SessionEntry[],
  targetEntries: SessionEntry[],
  tasks: CompressionTask[],
  debugLogDir: string
): Promise<void> {
  // Build markdown content
  let markdown = `# Compression Debug Log\n\n`;
  markdown += `## Cloning Session\n\n`;
  markdown += `**Source:** \`${sourceSessionId}\`\n`;
  markdown += `**Target:** \`${targetSessionId}\`\n\n`;
  markdown += `**Source File:** \`${sourcePath}\`\n`;
  markdown += `**Target File:** \`${targetPath}\`\n\n`;

  // Add session-level fields (from first user entry)
  const sourceUserEntry = sourceEntries.find((e) => e.type === "user");
  const targetUserEntry = targetEntries.find((e) => e.type === "user");

  if (sourceUserEntry) {
    markdown += `### Source Session Fields\n`;
    markdown += formatSessionFields(sourceUserEntry);
    markdown += `\n`;
  }

  if (targetUserEntry) {
    markdown += `### Target Session Fields\n`;
    markdown += formatSessionFields(targetUserEntry);
    markdown += `\n`;
  }

  markdown += `---\n\n`;

  // Add each compressed message
  let messageCount = 0;
  for (const task of tasks) {
    messageCount++;
    const sourceEntry = sourceEntries[task.messageIndex];
    const targetEntry = targetEntries[task.messageIndex];

    const entryTypeLabel =
      task.entryType === "user" ? "UserMessage" : "AssistantMessage";
    const uuid = sourceEntry?.uuid ?? "unknown";

    markdown += `## Message ${messageCount} - ${entryTypeLabel} \`${uuid}\`\n\n`;

    // Before compression
    markdown += `### Before Compression\n\n`;
    markdown += `**Content:**\n\`\`\`\n${escapeMarkdown(task.originalContent)}\n\`\`\`\n\n`;
    markdown += `**Message Fields:**\n`;
    markdown += formatMessageFields(sourceEntry?.message);
    markdown += `- estimatedTokens: \`${task.estimatedTokens}\`\n\n`;

    // After compression
    markdown += `### After Compression\n\n`;

    if (task.status === "success") {
      const targetPercent = task.level === "heavy-compress" ? "10%" : "35%";
      markdown += `**Status:** Compressed (${targetPercent} target)\n\n`;
      markdown += `**Content:**\n\`\`\`\n${escapeMarkdown(task.result ?? "")}\n\`\`\`\n\n`;
      markdown += `**Message Fields:**\n`;
      markdown += formatMessageFields(targetEntry?.message);

      const compressedTokens = estimateTokens(task.result ?? "");
      const reduction =
        task.estimatedTokens > 0
          ? Math.round(
              ((task.estimatedTokens - compressedTokens) / task.estimatedTokens) * 100
            )
          : 0;

      markdown += `\n**Compression Stats:**\n`;
      markdown += `- Original: ${task.estimatedTokens} tokens\n`;
      markdown += `- Compressed: ${compressedTokens} tokens\n`;
      markdown += `- Reduction: ${reduction}%\n`;
      if (task.durationMs !== undefined) {
        markdown += `- Duration: ${task.durationMs}ms\n`;
      }
      markdown += `\n`;
    } else if (task.status === "skipped") {
      markdown += `**Status:** Not Compressed - Below Threshold (${task.estimatedTokens} tokens)\n\n`;
      markdown += `**Content:**\n\`\`\`\n${escapeMarkdown(task.originalContent)}\n\`\`\`\n\n`;
    } else if (task.status === "failed") {
      markdown += `**Status:** Not Compressed - Failed After ${task.attempt} Attempts\n\n`;
      markdown += `**Error:** \`${task.error ?? "Unknown error"}\`\n`;
      if (task.durationMs !== undefined) {
        markdown += `**Duration:** ${task.durationMs}ms\n`;
      }
      markdown += `\n**Content:**\n\`\`\`\n${escapeMarkdown(task.originalContent)}\n\`\`\`\n\n`;
    }

    markdown += `---\n\n`;
  }

  // Build set of message indices that were in compression bands
  const bandMessageIndices = new Set(tasks.map((t) => t.messageIndex));

  // Find messages NOT in any compression band (user and assistant only)
  const nonBandMessages: Array<{
    index: number;
    entry: SessionEntry;
    tokens: number;
  }> = [];

  for (let i = 0; i < sourceEntries.length; i++) {
    const entry = sourceEntries[i];
    if (
      (entry.type === "user" || entry.type === "assistant") &&
      !bandMessageIndices.has(i)
    ) {
      const textContent = extractTextContent(entry);
      const tokens = estimateTokens(textContent);
      nonBandMessages.push({ index: i, entry, tokens });
    }
  }

  // Add non-band messages as simple list
  if (nonBandMessages.length > 0) {
    markdown += `## Messages Not in Compression Bands\n\n`;
    let listNum = 1;
    for (const { index, entry, tokens } of nonBandMessages) {
      const entryTypeLabel =
        entry.type === "user" ? "UserMessage" : "AssistantMessage";
      const uuid = entry.uuid ?? "unknown";
      markdown += `${listNum}. Message ${index} - ${entryTypeLabel} \`${uuid}\` (${tokens} tokens) - Band: none\n`;
      listNum++;
    }
    markdown += `\n---\n\n`;
  }

  // Summary
  const successful = tasks.filter((t) => t.status === "success").length;
  const skipped = tasks.filter((t) => t.status === "skipped").length;
  const failed = tasks.filter((t) => t.status === "failed").length;

  // Calculate timing stats
  const tasksWithDuration = tasks.filter((t) => t.durationMs !== undefined);
  const totalDurationMs = tasksWithDuration.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
  const avgDurationMs = tasksWithDuration.length > 0
    ? Math.round(totalDurationMs / tasksWithDuration.length)
    : 0;

  markdown += `## Summary\n\n`;
  markdown += `Total messages in bands: ${tasks.length}\n`;
  markdown += `- Compressed successfully: ${successful}\n`;
  markdown += `- Skipped (below threshold): ${skipped}\n`;
  markdown += `- Failed: ${failed}\n`;
  if (nonBandMessages.length > 0) {
    markdown += `\nMessages not in any band: ${nonBandMessages.length}\n`;
  }
  if (tasksWithDuration.length > 0) {
    markdown += `\n**Timing:**\n`;
    markdown += `- Total: ${(totalDurationMs / 1000).toFixed(2)}s\n`;
    markdown += `- Average per call: ${avgDurationMs}ms\n`;
  }

  // Write file
  await mkdir(debugLogDir, { recursive: true });
  const debugFilePath = path.join(
    debugLogDir,
    `${targetSessionId}-compression-debug.md`
  );
  await writeFile(debugFilePath, markdown, "utf-8");

  console.log(`[debug] Compression debug log written to: ${debugFilePath}`);
}

/**
 * Format session-level fields for display
 */
function formatSessionFields(entry: SessionEntry): string {
  let output = "";
  if (entry.sessionId) output += `- sessionId: \`${entry.sessionId}\`\n`;
  if (entry.cwd) output += `- cwd: \`${entry.cwd}\`\n`;
  if (entry.gitBranch) output += `- gitBranch: \`${entry.gitBranch}\`\n`;
  if (entry.version) output += `- version: \`${entry.version}\`\n`;
  return output;
}

/**
 * Format message-level fields for display
 */
function formatMessageFields(
  message: Record<string, unknown> | undefined
): string {
  if (!message) return "";

  let output = "";
  if (message.role) output += `- role: \`${message.role}\`\n`;
  if (message.model) output += `- model: \`${message.model}\`\n`;
  if (message.id) output += `- id: \`${message.id}\`\n`;
  if (message.stop_reason !== undefined)
    output += `- stop_reason: \`${message.stop_reason}\`\n`;
  if (message.stop_sequence) output += `- stop_sequence: \`${message.stop_sequence}\`\n`;

  if (message.usage && typeof message.usage === "object") {
    const usage = message.usage as Record<string, unknown>;
    output += `- usage:\n`;
    if (usage.input_tokens) output += `  - input_tokens: ${usage.input_tokens}\n`;
    if (usage.output_tokens) output += `  - output_tokens: ${usage.output_tokens}\n`;
    if (usage.cache_creation_input_tokens)
      output += `  - cache_creation_input_tokens: ${usage.cache_creation_input_tokens}\n`;
    if (usage.cache_read_input_tokens)
      output += `  - cache_read_input_tokens: ${usage.cache_read_input_tokens}\n`;
  }

  return output;
}

/**
 * Escape backticks in content to prevent breaking markdown code blocks
 */
function escapeMarkdown(text: string): string {
  // Replace triple backticks with escaped version
  return text.replace(/```/g, "\\`\\`\\`");
}
