import { getSessionSource } from "../sources/index.js";
import type { ClaudeSessionSource } from "../sources/claude-source.js";
import type { CopilotSessionSource } from "../sources/copilot-source.js";

/**
 * Result of resolving a session ID to its source.
 */
export interface ResolvedSession {
  sessionId: string;
  source: "claude" | "copilot";
  /** For Claude: encoded project path. For Copilot: workspace hash */
  location: string;
}

/**
 * Validate UUID format.
 */
export function isValidUuid(str: string): boolean {
  if (!str || typeof str !== "string") return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Resolve a session ID to its source and location.
 * Searches Claude first (more common), then Copilot.
 *
 * @param sessionId - UUID of the session
 * @returns Resolved session info or null if not found
 */
export async function resolveSession(sessionId: string): Promise<ResolvedSession | null> {
  // Validate UUID format
  if (!isValidUuid(sessionId)) {
    return null;
  }

  // Try Claude first (more common)
  try {
    const claudeSource = getSessionSource("claude") as ClaudeSessionSource;
    if (await claudeSource.isAvailable()) {
      const location = await claudeSource.findSession(sessionId);
      if (location) {
        return { sessionId, source: "claude", location };
      }
    }
  } catch (error) {
    console.warn("Error searching Claude source:", error);
  }

  // Try Copilot
  try {
    const copilotSource = getSessionSource("copilot") as CopilotSessionSource;
    if (await copilotSource.isAvailable()) {
      const location = await copilotSource.findSession(sessionId);
      if (location) {
        return { sessionId, source: "copilot", location };
      }
    }
  } catch (error) {
    console.warn("Error searching Copilot source:", error);
  }

  return null;
}
