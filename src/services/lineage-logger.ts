import { appendFile } from "fs/promises";
import { config } from "../config.js";

export interface LineageEntry {
  timestamp: string;
  targetId: string;
  targetPath: string;
  sourceId: string;
  sourcePath: string;
  toolRemoval: string;
  thinkingRemoval: string;
}

/**
 * Append lineage entry to log file
 */
export async function logLineage(entry: LineageEntry): Promise<void> {
  const logPath = config.lineageLogPath;
  
  const logEntry = `[${entry.timestamp}]
  TARGET: ${entry.targetId}
    path: ${entry.targetPath}
  SOURCE: ${entry.sourceId}
    path: ${entry.sourcePath}
  OPTIONS: toolRemoval=${entry.toolRemoval}% thinkingRemoval=${entry.thinkingRemoval}%
---
`;

  await appendFile(logPath, logEntry, "utf-8");
}
