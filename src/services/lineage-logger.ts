import { appendFile } from "fs/promises";
import { config } from "../config.js";
import type { CompressionBand, CompressionStats } from "../types.js";

export interface LineageEntry {
  timestamp: string;
  targetId: string;
  targetPath: string;
  sourceId: string;
  sourcePath: string;
  toolRemoval: number;
  thinkingRemoval: number;
  // New v2 fields (optional for backward compatibility)
  compressionBands?: CompressionBand[];
  compressionStats?: CompressionStats;
}

/**
 * Append lineage entry to log file.
 * Supports both v1 (without compression) and v2 (with compression) entries.
 */
export async function logLineage(entry: LineageEntry): Promise<void> {
  const logPath = config.lineageLogPath;

  let logEntry = `[${entry.timestamp}]
  TARGET: ${entry.targetId}
    path: ${entry.targetPath}
  SOURCE: ${entry.sourceId}
    path: ${entry.sourcePath}
  OPTIONS: toolRemoval=${entry.toolRemoval}% thinkingRemoval=${entry.thinkingRemoval}%`;

  // Add compression info if present (v2)
  if (entry.compressionBands && entry.compressionBands.length > 0) {
    const bandsStr = entry.compressionBands
      .map((b) => `${b.start}-${b.end}: ${b.level}`)
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
