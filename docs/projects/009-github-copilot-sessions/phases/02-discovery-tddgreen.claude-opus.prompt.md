```prompt
# Phase 2: Discovery & Browsing - TDD Green (Claude Opus 4.5)

## Objective

Implement the `CopilotSessionSource` to make all Phase 1 tests pass. Replace `NotImplementedError` stubs with real logic that reads VS Code workspace storage and parses Copilot session files. Wire up the API routes and enable the source toggle UI.

TDD Green means the tests written in Phase 1 (which asserted real behavior) now PASS because implementations return correct values.

## Context

Phase 1 created:
- `src/sources/copilot-types.ts` - Type definitions
- `src/sources/copilot-source.ts` - Stubs throwing NotImplementedError
- `test/copilot-source.test.ts` - Tests asserting real behavior (currently ERROR)
- `test/fixtures/copilot-sessions/` - Test fixture files
- `src/routes/session-browser.ts` - Route stubs returning 501
- `views/pages/session-browser.ejs` - Source toggle skeleton (disabled)

Your job is to implement the real logic so tests pass and the UI works.

## Constraints

- Reuse `truncateMessage` from `src/sources/claude-source.ts` - do NOT duplicate
- Support environment variable `VSCODE_STORAGE_PATH` for testing (overrides platform detection)
- Handle malformed JSON gracefully (log warning, skip file)
- Do NOT modify test files - make the code pass existing tests
- Follow patterns from `src/sources/claude-source.ts`

## Reference Files

Read these files before implementing:
- `src/sources/copilot-source.ts` - Your stubs to implement
- `src/sources/claude-source.ts` - Pattern to follow for implementation
- `test/copilot-source.test.ts` - Tests that must pass
- `test/fixtures/copilot-sessions/` - Test data to validate against
- `docs/reference/github-copilot-session-storage-formats.md` - Format specification

## Deliverables

### 1. Implement Utility Functions (`src/sources/copilot-source.ts`)

#### getVSCodeStoragePath()

```typescript
import { homedir } from "os";
import { join } from "path";

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
```

#### extractPathFromUri()

```typescript
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
```

#### countTurns()

```typescript
export function countTurns(session: CopilotSession): number {
  return session.requests.filter(r => !r.isCanceled).length;
}
```

#### extractFirstMessage()

```typescript
import { truncateMessage } from "./claude-source.js";

export function extractFirstMessage(session: CopilotSession): string {
  if (session.requests.length === 0) {
    return "(No messages)";
  }
  return truncateMessage(session.requests[0].message.text, 100);
}
```

### 2. Implement CopilotSessionSource Methods

#### isAvailable()

```typescript
import { stat, readdir, readFile } from "fs/promises";

async isAvailable(): Promise<boolean> {
  try {
    const storagePath = getVSCodeStoragePath();
    const stats = await stat(storagePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
```

#### listProjects()

```typescript
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
```

#### listSessions()

**Important**: `lastModifiedAt` should use the file system mtime (from `stats.mtime`), NOT the JSON `lastMessageDate` field. This matches Claude source behavior and the `SessionSummary` type docstring which states: "Last modification timestamp (file system mtime)". The file mtime is more reliable as it reflects actual file changes including any edits, while `lastMessageDate` only tracks the last message timestamp within the session data.

```typescript
async listSessions(workspaceHash: string): Promise<SessionSummary[]> {
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
```

#### findSession()

```typescript
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
```

#### loadSession()

```typescript
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
```

### 3. Complete Imports

Ensure `src/sources/copilot-source.ts` has all required imports:

```typescript
import { stat, readdir, readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import type { SessionSource } from "./types.js";
import type { ProjectInfo, SessionSummary } from "../types.js";
import type { CopilotSession, WorkspaceConfig } from "./copilot-types.js";
import { truncateMessage } from "./claude-source.js";
```

### 4. Update Router (`src/routes/session-browser.ts`)

Remove the NotImplementedError handling now that the source is implemented. The routes should work as-is once the source is implemented, but verify error handling:

```typescript
// Remove the 501 NOT_IMPLEMENTED handling, keep the rest
sessionBrowserRouter.get("/api/copilot/projects", async (req, res) => {
  try {
    const source = getSessionSource("copilot");

    if (!await source.isAvailable()) {
      return res.status(503).json({
        error: { message: "VS Code workspace storage not found", code: "SOURCE_UNAVAILABLE" }
      });
    }

    const projects = await source.listProjects();
    res.json({ projects });
  } catch (error) {
    console.error("Failed to list Copilot projects:", error);
    res.status(500).json({ error: { message: "Failed to list Copilot projects" } });
  }
});
```

### 5. Update API Client (`public/js/api/session-browser-client.js`)

Add support for source parameter:

```javascript
import { get } from "./client.js";

/**
 * Fetch projects from specified source.
 * @param {"claude" | "copilot"} source - Session source type
 * @returns {Promise<{projects: Array}>}
 */
export async function fetchProjects(source = "claude") {
  const endpoint = source === "copilot"
    ? "/api/copilot/projects"
    : "/api/projects";
  return get(endpoint);
}

/**
 * Fetch sessions from specified source.
 * @param {"claude" | "copilot"} source - Session source type
 * @param {string} folder - Folder identifier (encoded path for Claude, hash for Copilot)
 * @returns {Promise<{folder: string, path: string, sessions: Array}>}
 */
export async function fetchSessions(source, folder) {
  const endpoint = source === "copilot"
    ? `/api/copilot/projects/${encodeURIComponent(folder)}/sessions`
    : `/api/projects/${encodeURIComponent(folder)}/sessions`;
  return get(endpoint);
}
```

### 6. Update Frontend (`public/js/pages/session-browser.js`)

Add source toggle functionality:

```javascript
// Add to module state
let currentSource = "claude";

// Initialize source toggle
function initSourceToggle() {
  const toggleContainer = document.getElementById("source-toggle");
  if (!toggleContainer) return;

  toggleContainer.addEventListener("click", async (e) => {
    const button = e.target.closest(".source-btn");
    if (!button || button.disabled) return;

    const newSource = button.dataset.source;
    if (newSource === currentSource) return;

    currentSource = newSource;
    updateSourceToggleUI();
    clearProjectDropdown();
    clearSessionTable();
    await loadProjects();
  });
}

function updateSourceToggleUI() {
  const buttons = document.querySelectorAll(".source-btn");
  buttons.forEach(btn => {
    if (btn.dataset.source === currentSource) {
      btn.classList.remove("bg-gray-200", "text-gray-700", "hover:bg-gray-300");
      btn.classList.add("bg-blue-600", "text-white");
    } else {
      btn.classList.remove("bg-blue-600", "text-white");
      btn.classList.add("bg-gray-200", "text-gray-700", "hover:bg-gray-300");
    }
  });
}

function clearProjectDropdown() {
  const select = document.getElementById("project-select");
  if (select) {
    select.innerHTML = '<option value="">Select a project...</option>';
  }
}

function clearSessionTable() {
  const tbody = document.getElementById("session-tbody");
  if (tbody) {
    tbody.innerHTML = "";
  }
}

// Update loadProjects to use current source
async function loadProjects() {
  try {
    showLoading();
    const { projects } = await fetchProjects(currentSource);
    renderProjectDropdown(projects);
  } catch (error) {
    showError(`Failed to load ${currentSource} projects: ${error.message}`);
  } finally {
    hideLoading();
  }
}

// Update loadSessions to use current source
async function loadSessions(folder) {
  try {
    showLoading();
    const { sessions } = await fetchSessions(currentSource, folder);
    sessions.forEach(s => s.source = currentSource);
    renderSessionTable(sessions);
  } catch (error) {
    showError(`Failed to load sessions: ${error.message}`);
  } finally {
    hideLoading();
  }
}

// Update init to include source toggle - add to DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  initSourceToggle();
  loadProjects(); // Initial load with default source (claude)

  // Wire up project selector change handler
  const projectSelect = document.getElementById("project-select");
  if (projectSelect) {
    projectSelect.addEventListener("change", (e) => {
      const folder = e.target.value;
      if (folder) {
        loadSessions(folder);
      } else {
        clearSessionTable();
      }
    });
  }
});
```

### 7. Update Template (`views/pages/session-browser.ejs`)

Enable the Copilot button and add source badges to session rows:

```html
<!-- Source toggle - enable Copilot button -->
<div class="mb-6">
  <label class="block text-sm font-medium text-gray-700 mb-2">Source</label>
  <div id="source-toggle" class="flex gap-2">
    <button
      type="button"
      data-source="claude"
      class="source-btn px-4 py-2 rounded-lg font-medium transition-colors bg-blue-600 text-white"
    >
      Claude Code
    </button>
    <button
      type="button"
      data-source="copilot"
      class="source-btn px-4 py-2 rounded-lg font-medium transition-colors bg-gray-200 text-gray-700 hover:bg-gray-300"
    >
      GitHub Copilot
    </button>
  </div>
</div>
```

Update session row rendering to include source badge in `public/js/pages/session-browser.js`:

```javascript
// Helper function for source badges
function getSourceBadge(source) {
  if (source === "copilot") {
    return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">Copilot</span>';
  }
  return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Claude</span>';
}

// Update renderSessionTable to include badge in each row
function renderSessionTable(sessions) {
  const tbody = document.getElementById("session-tbody");
  if (!tbody) return;

  if (sessions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-6 py-8 text-center text-gray-500">
          No sessions found in this project.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = sessions.map(session => `
    <tr class="hover:bg-gray-50">
      <td class="px-6 py-4 whitespace-nowrap">
        <div class="flex items-center gap-2">
          <span class="font-mono text-sm text-gray-900">${session.sessionId.slice(0, 8)}...</span>
          ${getSourceBadge(session.source)}
        </div>
      </td>
      <td class="px-6 py-4">
        <span class="text-sm text-gray-900 line-clamp-2">${escapeHtml(session.firstMessage)}</span>
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        ${formatRelativeTime(session.lastModifiedAt)}
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        ${session.turnCount} turns
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <a href="/clone?sessionId=${session.sessionId}&source=${session.source}"
           class="text-blue-600 hover:text-blue-900 mr-4">Clone</a>
        <a href="/session-detail?sessionId=${session.sessionId}&source=${session.source}"
           class="text-blue-600 hover:text-blue-900">Details</a>
      </td>
    </tr>
  `).join("");
}

// Helper to escape HTML entities
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Helper to format relative time
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
```

### 8. Router Integration Tests

Add integration tests for the routes (`test/copilot-routes.test.ts`):

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { app } from "../src/server.js";

describe("Copilot API Routes", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;
  const fixturesPath = path.join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = fixturesPath;
    server = app.listen(0);
    const address = server.address();
    if (address && typeof address !== "string") {
      baseUrl = `http://127.0.0.1:${address.port}`;
    } else {
      throw new Error("Failed to start test server");
    }
  });

  afterAll(async () => {
    delete process.env.VSCODE_STORAGE_PATH;
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });

  describe("GET /api/copilot/projects", () => {
    it("returns project list with 200 status", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/projects`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("projects");
      expect(Array.isArray(data.projects)).toBe(true);
      // abc123... and xyz987... have valid workspace.json + chatSessions
      expect(data.projects.length).toBe(2);
    });

    it("returns projects with folder and path properties", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/projects`);
      const data = await response.json();

      expect(data.projects[0]).toHaveProperty("folder");
      expect(data.projects[0]).toHaveProperty("path");
    });

    it("returns 503 when source unavailable", async () => {
      const originalPath = process.env.VSCODE_STORAGE_PATH;
      process.env.VSCODE_STORAGE_PATH = "/nonexistent/path";

      const response = await fetch(`${baseUrl}/api/copilot/projects`);
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.error.code).toBe("SOURCE_UNAVAILABLE");

      process.env.VSCODE_STORAGE_PATH = originalPath;
    });
  });

  describe("GET /api/copilot/projects/:hash/sessions", () => {
    it("returns sessions for valid workspace", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/projects/abc123def456ghi789/sessions`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("folder", "abc123def456ghi789");
      expect(data).toHaveProperty("path", "/Users/test/projectalpha");
      expect(data).toHaveProperty("sessions");
      // 4 files: 2 valid + 1 empty-requests + 1 malformed = 3 returned
      expect(data.sessions.length).toBe(3);
    });

    it("returns sessions with correct properties", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/projects/abc123def456ghi789/sessions`);
      const data = await response.json();
      const session = data.sessions[0];

      expect(session).toHaveProperty("sessionId");
      expect(session).toHaveProperty("source", "copilot");
      expect(session).toHaveProperty("firstMessage");
      expect(session).toHaveProperty("turnCount");
    });

    it("returns 404 for non-existent workspace", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/projects/nonexistent-hash/sessions`);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error.code).toBe("NOT_FOUND");
    });
  });
});
```

## Verification

After completing this phase:

```bash
npm run typecheck  # Must pass
npm test           # All tests PASS, including copilot-source tests
```

Run just the copilot tests:

```bash
npm test -- copilot-source
npm test -- copilot-routes
```

Manual testing:
1. Start dev server: `npm run dev`
2. Open http://localhost:3000
3. Click "GitHub Copilot" toggle
4. Verify project dropdown loads with workspaces
5. Select a workspace
6. Verify sessions display with correct metadata
7. Toggle back to Claude, verify it still works

## Done When

- TypeScript compiles without errors
- All existing tests pass
- All new copilot-source tests pass
- All new copilot-routes tests pass
- No `NotImplementedError` remains in copilot-source.ts
- Malformed session files are handled gracefully (logged, skipped)
- Source toggle works in UI
- Sessions display for both Claude and Copilot sources

| Test Category | Expected Result |
|---------------|-----------------|
| All existing tests | PASS |
| getVSCodeStoragePath tests | PASS |
| extractPathFromUri tests | PASS |
| countTurns tests | PASS |
| extractFirstMessage tests | PASS |
| CopilotSessionSource.isAvailable (exists) | PASS |
| CopilotSessionSource.isAvailable (not exists) | PASS |
| CopilotSessionSource.listProjects tests | PASS |
| CopilotSessionSource.listSessions tests | PASS |
| CopilotSessionSource.listSessions (empty requests TC-06) | PASS |
| CopilotSessionSource.listSessions (malformed TC-07) | PASS |
| CopilotSessionSource.findSession tests | PASS |
| CopilotSessionSource.loadSession tests | PASS |
| GET /api/copilot/projects | PASS (200 with 2 projects) |
| GET /api/copilot/projects/:hash/sessions | PASS (200 with 3 sessions) |
| Source toggle UI | Working |
| Source badges in session rows | Visible |

Implement the complete phase. Deliver working code, not a plan.
```
