import path from "path";
import os from "os";
import type { CompressionConfig } from "./types.js";

export const config = {
  get claudeDir() {
    return process.env.CLAUDE_DIR || path.join(os.homedir(), ".claude");
  },
  port: parseInt(process.env.PORT || "7331", 10),
  get projectsDir() {
    return path.join(this.claudeDir, "projects");
  },
  get lineageLogPath() {
    return path.join(this.claudeDir, "clone-lineage.log");
  },
};

/**
 * Load compression configuration from environment variables.
 * Provides sensible defaults for all values.
 */
export function loadCompressionConfig(): CompressionConfig {
  return {
    concurrency: parseInt(process.env.COMPRESSION_CONCURRENCY || "10", 10),
    timeoutInitial: parseInt(
      process.env.COMPRESSION_TIMEOUT_INITIAL || "5000",
      10
    ),
    timeoutIncrement: parseInt(
      process.env.COMPRESSION_TIMEOUT_INCREMENT || "5000",
      10
    ),
    maxAttempts: parseInt(process.env.COMPRESSION_MAX_ATTEMPTS || "4", 10),
    minTokens: parseInt(process.env.COMPRESSION_MIN_TOKENS || "30", 10),
    thinkingThreshold: parseInt(
      process.env.COMPRESSION_THINKING_THRESHOLD || "1000",
      10
    ),
    targetHeavy: parseInt(process.env.COMPRESSION_TARGET_HEAVY || "10", 10),
    targetStandard: parseInt(
      process.env.COMPRESSION_TARGET_STANDARD || "35",
      10
    ),
  };
}


