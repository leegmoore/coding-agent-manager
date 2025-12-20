import type { SessionSource } from "./types.js";
import { ClaudeSessionSource } from "./claude-source.js";
import { CopilotSessionSource } from "./copilot-source.js";

export function getSessionSource(type: "claude" | "copilot" = "claude"): SessionSource {
  if (type === "claude") {
    return new ClaudeSessionSource();
  }
  if (type === "copilot") {
    return new CopilotSessionSource();
  }
  throw new Error(`Unsupported session source: ${type}`);
}

export type { SessionSource } from "./types.js";
export { ClaudeSessionSource, decodeFolderName, encodeFolderPath, truncateMessage } from "./claude-source.js";
export { CopilotSessionSource, getVSCodeStoragePath, extractPathFromUri, countTurns, extractFirstMessage } from "./copilot-source.js";
export * from "./copilot-types.js";
