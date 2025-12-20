import { get, ApiError } from "./client.js";

/**
 * Fetch list of available projects from specified source
 * @param {"claude" | "copilot"} source - Session source type
 * @returns {Promise<{projects: Array<{folder: string, path: string}>}>}
 * @throws {ApiError} On HTTP error or parse failure
 */
export async function fetchProjects(source = "claude") {
  const endpoint = source === "copilot"
    ? "/api/copilot/projects"
    : "/api/projects";
  return get(endpoint);
}

/**
 * Fetch sessions for a specific project from specified source
 * @param {"claude" | "copilot"} source - Session source type
 * @param {string} folder - Folder identifier (encoded path for Claude, hash for Copilot)
 * @returns {Promise<{folder: string, path: string, sessions: Array}>}
 * @throws {ApiError} On HTTP error or parse failure
 */
export async function fetchSessions(source, folder) {
  const endpoint = source === "copilot"
    ? `/api/copilot/projects/${encodeURIComponent(folder)}/sessions`
    : `/api/projects/${encodeURIComponent(folder)}/sessions`;
  return get(endpoint);
}

export { ApiError };
