import { stat, readdir, readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import type { SessionSource } from "./types.js";
import type { ProjectInfo, SessionSummary } from "../types.js";
import type { CopilotSession, WorkspaceConfig } from "./copilot-types.js";
import { truncateMessage } from "./claude-source.js";

/**
 * Get the VS Code workspace storage path for the current platform.
 * Supports VSCODE_STORAGE_PATH env var override for testing.
 *
 * Platform defaults:
 * - macOS: ~/Library/Application Support/Code/User/workspaceStorage/
 * - Linux: ~/.config/Code/User/workspaceStorage/
 * - Windows: %APPDATA%/Code/User/workspaceStorage/
 */
export function getVSCodeStoragePath(): string {
  // Check for test override
  if (process.env.VSCODE_STORAGE_PATH) {
    return process.env.VSCODE_STORAGE_PATH;
  }

  const platform = process.platform;
  const home = homedir();

  switch (platform) {
    case "darwin":
      return join(home, "Library/Application Support/Code/User/workspaceStorage");
    case "linux":
      return join(home, ".config/Code/User/workspaceStorage");
    case "win32":
      return join(process.env.APPDATA || home, "Code/User/workspaceStorage");
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Extract the filesystem path from a VS Code folder URI.
 * @param folderUri URI like "file:///Users/dev/project"
 * @returns Filesystem path like "/Users/dev/project"
 */
export function extractPathFromUri(folderUri: string): string {
  // Remove "file://" prefix
  let path = folderUri.replace(/^file:\/\//, "");

  // Decode URL encoding (e.g., %20 -> space)
  path = decodeURIComponent(path);

  // On Windows, remove leading slash from /c:/... paths
  if (/^\/[a-zA-Z]:/.test(path)) {
    path = path.slice(1);
  }

  return path;
}

/**
 * Count non-canceled turns in a Copilot session.
 * A turn = one user prompt through all responses until the next user prompt.
 * For Copilot, each non-canceled request IS one turn.
 */
export function countTurns(session: CopilotSession): number {
  return session.requests.filter(r => !r.isCanceled).length;
}

/**
 * Extract first user message from session.
 * Returns "(No messages)" if no requests exist.
 * Truncates to 100 characters.
 */
export function extractFirstMessage(session: CopilotSession): string {
  if (session.requests.length === 0) {
    return "(No messages)";
  }
  return truncateMessage(session.requests[0].message.text, 100);
}

export class CopilotSessionSource implements SessionSource {
  readonly sourceType = "copilot" as const;

  async isAvailable(): Promise<boolean> {
    try {
      const storagePath = getVSCodeStoragePath();
      const stats = await stat(storagePath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  async listProjects(): Promise<ProjectInfo[]> {
    const storagePath = getVSCodeStoragePath();
    const entries = await readdir(storagePath, { withFileTypes: true });

    const projects: ProjectInfo[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const workspacePath = join(storagePath, entry.name);
      const workspaceJsonPath = join(workspacePath, "workspace.json");
      const chatSessionsPath = join(workspacePath, "chatSessions");

      try {
        // Must have both workspace.json and chatSessions folder
        await stat(workspaceJsonPath);
        const chatStats = await stat(chatSessionsPath);

        if (!chatStats.isDirectory()) continue;

        const configContent = await readFile(workspaceJsonPath, "utf-8");
        const config = JSON.parse(configContent) as WorkspaceConfig;
        const projectPath = extractPathFromUri(config.folder);

        projects.push({
          folder: entry.name,
          path: projectPath,
        });
      } catch {
        // Skip workspaces missing required files or with parse errors
        continue;
      }
    }

    // Sort by path
    return projects.sort((a, b) => a.path.localeCompare(b.path));
  }

  async listSessions(workspaceHash: string): Promise<SessionSummary[]> {
    // Validate workspaceHash doesn't contain path traversal sequences
    if (workspaceHash.includes("..") || workspaceHash.includes("/")) {
      throw new Error("Invalid workspace hash: path traversal not allowed");
    }

    const storagePath = getVSCodeStoragePath();
    const workspacePath = join(storagePath, workspaceHash);
    const chatSessionsPath = join(workspacePath, "chatSessions");
    const workspaceJsonPath = join(workspacePath, "workspace.json");

    // Get project path for metadata
    const configContent = await readFile(workspaceJsonPath, "utf-8");
    const config = JSON.parse(configContent) as WorkspaceConfig;
    const projectPath = extractPathFromUri(config.folder);

    const entries = await readdir(chatSessionsPath, { withFileTypes: true });
    const sessions: SessionSummary[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

      const sessionPath = join(chatSessionsPath, entry.name);

      try {
        const stats = await stat(sessionPath);
        const content = await readFile(sessionPath, "utf-8");
        const session = JSON.parse(content) as CopilotSession;

        sessions.push({
          sessionId: entry.name.replace(".json", ""),
          source: "copilot",
          projectPath,
          firstMessage: extractFirstMessage(session),
          createdAt: new Date(session.creationDate),
          lastModifiedAt: stats.mtime,  // Use file system mtime, NOT session.lastMessageDate
          sizeBytes: stats.size,
          turnCount: countTurns(session),
        });
      } catch (error) {
        // Log warning but continue processing other files
        console.warn(`Failed to parse Copilot session ${entry.name}:`, error);
        continue;
      }
    }

    // Sort by lastModifiedAt descending
    return sessions.sort((a, b) => b.lastModifiedAt.getTime() - a.lastModifiedAt.getTime());
  }

  /**
   * Find a session by ID across all workspaces.
   * @returns Workspace hash if found, null otherwise
   */
  async findSession(sessionId: string): Promise<string | null> {
    const storagePath = getVSCodeStoragePath();

    try {
      const workspaces = await readdir(storagePath, { withFileTypes: true });

      for (const workspace of workspaces) {
        if (!workspace.isDirectory()) continue;

        const sessionPath = join(
          storagePath,
          workspace.name,
          "chatSessions",
          `${sessionId}.json`
        );

        try {
          await stat(sessionPath);
          return workspace.name; // Found it
        } catch {
          // Not in this workspace, continue
        }
      }
    } catch {
      // Storage directory doesn't exist
    }

    return null;
  }

  /**
   * Load a specific session by ID and workspace.
   * @param sessionId Session UUID
   * @param workspaceHash Workspace folder hash
   */
  async loadSession(sessionId: string, workspaceHash: string): Promise<CopilotSession> {
    const storagePath = getVSCodeStoragePath();
    const sessionPath = join(
      storagePath,
      workspaceHash,
      "chatSessions",
      `${sessionId}.json`
    );

    const content = await readFile(sessionPath, "utf-8");
    return JSON.parse(content) as CopilotSession;
  }
}
