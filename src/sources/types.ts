import type { ProjectInfo, SessionSummary } from "../types.js";

export interface SessionSource {
  /** Unique identifier for this source type */
  readonly sourceType: "claude" | "copilot";

  /** Get list of available project folders */
  listProjects(): Promise<ProjectInfo[]>;

  /** Get sessions for a specific project folder */
  listSessions(folder: string): Promise<SessionSummary[]>;

  /** Check if this source is available (directory exists, etc.) */
  isAvailable(): Promise<boolean>;

  /**
   * Find a session by ID across all projects/workspaces.
   * @param sessionId - UUID of the session to find
   * @returns Location identifier (project folder or workspace hash) if found, null otherwise
   */
  findSession(sessionId: string): Promise<string | null>;
}
