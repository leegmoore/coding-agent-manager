import { writeFile, mkdir } from "fs/promises";
import path from "path";
import type { CopilotRequest } from "../sources/copilot-types.js";
import type { CompressionTask } from "../types.js";
import { estimateCopilotTokens } from "./copilot-compression.js";

export async function writeCopilotCompressionDebugLog(
  sourceSessionId: string,
  targetSessionId: string,
  originalRequests: CopilotRequest[],
  compressedRequests: CopilotRequest[],
  tasks: CompressionTask[],
  debugLogDir: string
): Promise<string> {
  let markdown = `# Copilot Compression Debug Log\n\n`;
  markdown += `## Session Info\n\n`;
  markdown += `**Source Session:** \`${sourceSessionId}\`\n`;
  markdown += `**Target Session:** \`${targetSessionId}\`\n`;
  markdown += `**Total Turns:** ${originalRequests.length}\n`;
  markdown += `**Tasks Processed:** ${tasks.length}\n\n`;
  markdown += `---\n\n`;

  let taskCount = 0;
  for (const task of tasks) {
    taskCount++;
    const turnIndex = Math.floor(task.messageIndex / 2);
    const entryTypeLabel = task.entryType === "user" ? "User" : "Assistant";

    markdown += `## Task ${taskCount} - Turn ${turnIndex + 1} ${entryTypeLabel}\n\n`;
    markdown += `**Compression Level:** \`${task.level}\`\n\n`;

    markdown += `### Before Compression\n\n`;
    markdown += `**Content:**\n\`\`\`\n${escapeMarkdown(task.originalContent)}\n\`\`\`\n\n`;
    markdown += `- Original: ${task.estimatedTokens} tokens\n\n`;

    markdown += `### After Compression\n\n`;

    if (task.status === "success") {
      const targetPercent = task.level === "heavy-compress" ? "10%" : "35%";
      markdown += `**Status:** Compressed (${targetPercent} target)\n\n`;
      markdown += `**Content:**\n\`\`\`\n${escapeMarkdown(task.result ?? "")}\n\`\`\`\n\n`;

      const compressedTokens = estimateCopilotTokens(task.result ?? "");
      const reduction = task.estimatedTokens > 0
        ? Math.round(((task.estimatedTokens - compressedTokens) / task.estimatedTokens) * 100)
        : 0;

      markdown += `**Compression Stats:**\n`;
      markdown += `- Original: ${task.estimatedTokens} tokens\n`;
      markdown += `- Compressed: ${compressedTokens} tokens\n`;
      markdown += `- Reduction: ${reduction}%\n\n`;
    } else if (task.status === "skipped") {
      markdown += `**Status:** Not Compressed - Below Threshold (${task.estimatedTokens} tokens)\n\n`;
      markdown += `**Content:**\n\`\`\`\n${escapeMarkdown(task.originalContent)}\n\`\`\`\n\n`;
    } else if (task.status === "failed") {
      markdown += `**Status:** Not Compressed - Failed After ${task.attempt} Attempts\n\n`;
      markdown += `**Error:** \`${task.error ?? "Unknown error"}\`\n\n`;
      markdown += `**Content:**\n\`\`\`\n${escapeMarkdown(task.originalContent)}\n\`\`\`\n\n`;
    }

    markdown += `---\n\n`;
  }

  const successful = tasks.filter((t) => t.status === "success").length;
  const skipped = tasks.filter((t) => t.status === "skipped").length;
  const failed = tasks.filter((t) => t.status === "failed").length;

  const originalTokens = tasks.filter((t) => t.status === "success").reduce((sum, t) => sum + t.estimatedTokens, 0);
  const compressedTokens = tasks.filter((t) => t.status === "success").reduce((sum, t) => sum + estimateCopilotTokens(t.result ?? ""), 0);
  const tokensRemoved = originalTokens - compressedTokens;
  const reductionPercent = originalTokens > 0 ? Math.round((tokensRemoved / originalTokens) * 100) : 0;

  markdown += `## Summary\n\n`;
  markdown += `**Total tasks:** ${tasks.length}\n`;
  markdown += `- Compressed successfully: ${successful}\n`;
  markdown += `- Skipped (below threshold): ${skipped}\n`;
  markdown += `- Failed: ${failed}\n\n`;

  if (successful > 0) {
    markdown += `**Token Reduction:**\n`;
    markdown += `- Original: ${originalTokens} tokens\n`;
    markdown += `- Compressed: ${compressedTokens} tokens\n`;
    markdown += `- Removed: ${tokensRemoved} tokens (${reductionPercent}%)\n`;
  }

  await mkdir(debugLogDir, { recursive: true });
  const debugFilePath = path.join(debugLogDir, `${targetSessionId}-compression-debug.md`);
  await writeFile(debugFilePath, markdown, "utf-8");

  console.log(`[debug] Copilot compression debug log written to: ${debugFilePath}`);

  return debugFilePath;
}

function escapeMarkdown(text: string): string {
  return text.replace(/```/g, "\\`\\`\\`");
}
