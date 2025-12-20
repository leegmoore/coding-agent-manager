import { stat, readdir } from "fs/promises";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { homedir } from "os";
import { join } from "path";
import type { SessionSource } from "./types.js";
import type { ProjectInfo, SessionSummary, SessionEntry } from "../types.js";
import { identifyTurns } from "../services/session-clone.js";

/**
 * Get the Claude projects directory path.
 * Uses CLAUDE_DIR env var for testing, otherwise defaults to ~/.claude/projects
 */
function getProjectsDir(): string {
  return process.env.CLAUDE_DIR
    ? join(process.env.CLAUDE_DIR, "projects")
    : join(homedir(), ".claude", "projects");
}

/**
 * Decode Claude's folder encoding back to a path.
 * Replaces leading dash with /, then all remaining dashes with /.
 * NOTE: This is lossy for paths containing dashes in folder names.
 */
export function decodeFolderName(encoded: string): string {
  return encoded.replace(/^-/, "/").replace(/-/g, "/");
}

/**
 * Encode a path for Claude's folder naming scheme.
 * Replaces all / with -
 */
export function encodeFolderPath(path: string): string {
  return path.replace(/\//g, "-");
}

/**
 * Truncate a message to maxLength, adding ellipsis if truncated.
 * Also normalizes whitespace.
 */
export function truncateMessage(text: string, maxLength: number): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength - 3) + "...";
}

export class ClaudeSessionSource implements SessionSource {
  readonly sourceType = "claude" as const;

  async isAvailable(): Promise<boolean> {
    try {
      const stats = await stat(getProjectsDir());
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  async listProjects(): Promise<ProjectInfo[]> {
    const projectsDir = getProjectsDir();
    const entries = await readdir(projectsDir, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        folder: entry.name,
        path: decodeFolderName(entry.name),
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async findSession(sessionId: string): Promise<string | null> {
    const projectsDir = getProjectsDir();

    try {
      const projects = await readdir(projectsDir, { withFileTypes: true });

      for (const project of projects) {
        if (!project.isDirectory()) continue;

        const sessionPath = join(projectsDir, project.name, `${sessionId}.jsonl`);
        try {
          await stat(sessionPath);
          return project.name; // Found it - return project folder name
        } catch {
          // Not in this project, continue searching
        }
      }
    } catch {
      // Projects directory doesn't exist or not readable
    }

    return null;
  }

  async listSessions(folder: string): Promise<SessionSummary[]> {
    // Validate folder doesn't contain path traversal sequences
    if (folder.includes("..") || folder.includes("/")) {
      throw new Error("Invalid folder name: path traversal not allowed");
    }

    const projectPath = join(getProjectsDir(), folder);
    const decodedPath = decodeFolderName(folder);

    const entries = await readdir(projectPath, { withFileTypes: true });
    const jsonlFiles = entries.filter(
      (e) => e.isFile() && e.name.endsWith(".jsonl")
    );

    const sessions = await Promise.all(
      jsonlFiles.map((file) =>
        this.parseSessionSummary(
          join(projectPath, file.name),
          file.name.replace(".jsonl", ""),
          decodedPath
        )
      )
    );

    // Sort by lastModifiedAt descending (most recent first)
    return sessions.sort(
      (a, b) => b.lastModifiedAt.getTime() - a.lastModifiedAt.getTime()
    );
  }

  private async parseSessionSummary(
    filePath: string,
    sessionId: string,
    projectPath: string
  ): Promise<SessionSummary> {
    const stats = await stat(filePath);
    const { firstMessage, turnCount } = await this.extractMetadata(filePath);

    // birthtime isn't reliably available on all platforms (e.g., Linux ext4)
    // Fall back to mtime if birthtime is unavailable (0 or Unix epoch)
    const createdAt =
      stats.birthtime.getTime() > 0 ? stats.birthtime : stats.mtime;

    return {
      sessionId,
      source: "claude",
      projectPath,
      firstMessage,
      createdAt,
      lastModifiedAt: stats.mtime,
      sizeBytes: stats.size,
      turnCount,
    };
  }

  private async extractMetadata(
    filePath: string
  ): Promise<{ firstMessage: string; turnCount: number }> {
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    let firstMessage = "(No user message)";
    let foundFirstMessage = false;
    const entries: SessionEntry[] = [];

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line) as SessionEntry;
        entries.push(entry);

        // Capture first user message (entry.type is "user" not "human")
        if (!foundFirstMessage && entry.type === "user") {
          const content = entry.message?.content;
          if (content) {
            const text =
              typeof content === "string"
                ? content
                : Array.isArray(content)
                  ? (content.find((b) => b.type === "text") as { text?: string })
                      ?.text || ""
                  : "";

            if (text) {
              firstMessage = truncateMessage(text, 100);
              foundFirstMessage = true;
            }
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    // Use existing identifyTurns to count turns
    const turns = identifyTurns(entries);

    return { firstMessage, turnCount: turns.length };
  }
}
