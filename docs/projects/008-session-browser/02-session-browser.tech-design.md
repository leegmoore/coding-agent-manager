# Technical Design: Session Browser

## Context

This document provides the technical design for the Session Browser feature, which enables users to browse Claude Code sessions by project folder. The design emphasizes an abstraction layer to support future session sources (e.g., GitHub Copilot).

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Session Browser                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Browser                    Server                      File System          │
│  ───────                    ──────                      ───────────          │
│                                                                              │
│  1. Page Load                                                                │
│  ──────────────────────────────────────────────────────────────────────────▶│
│  GET /                                                                       │
│  ◀────────────────────────────────────────────────────────────────────────── │
│  HTML (session-browser.ejs)                                                  │
│                                                                              │
│  2. Load Projects                                                            │
│  ──────────────────────────────────────────────────────────────────────────▶│
│  GET /api/projects          ──────────────────────────────────────────────▶ │
│                             sessionSource.listProjects()                     │
│                             ◀────────────────────────────────────────────── │
│                             readdir(~/.claude/projects)                      │
│  ◀────────────────────────────────────────────────────────────────────────── │
│  JSON: [{folder, path}, ...]                                                 │
│                                                                              │
│  3. Select Project                                                           │
│  ──────────────────────────────────────────────────────────────────────────▶│
│  GET /api/projects/:folder/sessions                                          │
│                             ──────────────────────────────────────────────▶ │
│                             sessionSource.listSessions(folder)               │
│                             For each .jsonl:                                 │
│                               - stat() for size/dates                        │
│                               - parseFirstMessage()                          │
│                               - countTurns()                                 │
│                             ◀────────────────────────────────────────────── │
│  ◀────────────────────────────────────────────────────────────────────────── │
│  JSON: [{sessionId, firstMessage, createdAt, ...}, ...]                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Module Architecture

```
src/
├── routes/
│   └── session-browser.ts          # Express route handlers (inline Zod schemas)
├── sources/
│   ├── types.ts                    # SessionSource interface
│   ├── index.ts                    # Source factory
│   └── claude-source.ts            # Claude Code implementation + utilities
└── types.ts                        # Add SessionSummary, ProjectInfo types

public/js/
├── pages/
│   └── session-browser.js          # Page controller
└── api/
    └── session-browser-client.js   # API client

views/pages/
└── session-browser.ejs             # Page template
```

---

## Interface Definitions

### SessionSource Interface

```typescript
// src/sources/types.ts

export interface ProjectInfo {
  /** Encoded folder name (filesystem safe) */
  folder: string;
  /** Human-readable decoded path */
  path: string;
}

export interface SessionSummary {
  /** Session identifier (filename without extension) */
  sessionId: string;
  /** Source type for multi-source support */
  source: "claude" | "copilot";
  /** Human-readable project path */
  projectPath: string;
  /** First ~100 chars of first user message */
  firstMessage: string;
  /** File creation timestamp */
  createdAt: Date;
  /** File last modified timestamp */
  lastModifiedAt: Date;
  /** File size in bytes */
  sizeBytes: number;
  /** Number of conversation turns */
  turnCount: number;
}

export interface SessionSource {
  /** Unique identifier for this source type */
  readonly sourceType: "claude" | "copilot";
  
  /** Get list of available project folders */
  listProjects(): Promise<ProjectInfo[]>;
  
  /** Get sessions for a specific project folder */
  listSessions(folder: string): Promise<SessionSummary[]>;
  
  /** Check if this source is available (directory exists, etc.) */
  isAvailable(): Promise<boolean>;
}
```

### API Response Types

```typescript
// src/types.ts additions

export interface ProjectsResponse {
  projects: ProjectInfo[];
}

export interface SessionsResponse {
  folder: string;
  path: string;
  sessions: SessionSummary[];
}

export interface SessionBrowserError {
  error: string;
  code: "NOT_FOUND" | "INVALID_FOLDER" | "SOURCE_UNAVAILABLE";
}
```

---

## Claude Code Session Source

### Project Discovery

```typescript
// src/sources/claude-source.ts

import { homedir } from "os";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import type { SessionSource, ProjectInfo, SessionSummary } from "./types.js";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

export class ClaudeSessionSource implements SessionSource {
  readonly sourceType = "claude" as const;

  async isAvailable(): Promise<boolean> {
    try {
      await stat(CLAUDE_PROJECTS_DIR);
      return true;
    } catch {
      return false;
    }
  }

  async listProjects(): Promise<ProjectInfo[]> {
    const entries = await readdir(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
    
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => ({
        folder: entry.name,
        path: decodeFolderName(entry.name)
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async listSessions(folder: string): Promise<SessionSummary[]> {
    const projectPath = join(CLAUDE_PROJECTS_DIR, folder);
    const decodedPath = decodeFolderName(folder);
    
    const entries = await readdir(projectPath, { withFileTypes: true });
    const jsonlFiles = entries.filter(e => e.isFile() && e.name.endsWith(".jsonl"));
    
    const sessions = await Promise.all(
      jsonlFiles.map(file => this.parseSessionSummary(
        join(projectPath, file.name),
        file.name.replace(".jsonl", ""),
        decodedPath
      ))
    );
    
    return sessions.sort((a, b) => 
      b.lastModifiedAt.getTime() - a.lastModifiedAt.getTime()
    );
  }

  private async parseSessionSummary(
    filePath: string,
    sessionId: string,
    projectPath: string
  ): Promise<SessionSummary> {
    const stats = await stat(filePath);
    const { firstMessage, turnCount } = await this.extractMetadata(filePath);
    
    return {
      sessionId,
      source: "claude",
      projectPath,
      firstMessage,
      createdAt: stats.birthtime,
      lastModifiedAt: stats.mtime,
      sizeBytes: stats.size,
      turnCount
    };
  }

  private async extractMetadata(filePath: string): Promise<{
    firstMessage: string;
    turnCount: number;
  }> {
    // Use streaming to avoid loading entire file
    // Extract first user message and count turns efficiently
    // ...implementation details
  }
}

/**
 * Decode Claude's folder encoding back to a path.
 * Claude encodes paths by replacing / with -
 * Example: /Users/lee/code/my-app -> -Users-lee-code-my-app
 * 
 * NOTE: This is lossy - folders containing dashes are ambiguous.
 * Example: -Users-lee-my-app could be /Users/lee/my-app or /Users/lee/my/app
 * For display purposes, we do best-effort decode (replace all - with /).
 * For filesystem operations, use the original encoded folder name.
 */
export function decodeFolderName(encoded: string): string {
  // Replace leading dash with /, then all remaining dashes with /
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
  const cleaned = text.trim().replace(/\\s+/g, " ");
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength - 3) + "...";
}
```

### Efficient Metadata Extraction

For performance with large session files, we'll use streaming:

```typescript
import { createReadStream } from "fs";
import { createInterface } from "readline";

private async extractMetadata(filePath: string): Promise<{
  firstMessage: string;
  turnCount: number;
}> {
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity
  });

  let firstMessage = "(No user message)";
  let turnCount = 0;
  let foundFirstMessage = false;

  for await (const line of rl) {
    if (!line.trim()) continue;
    
    try {
      const entry = JSON.parse(line) as SessionEntry;
      
      // Count turns (human messages start new turns)
      if (entry.type === "human") {
        turnCount++;
        
        // Capture first user message
        if (!foundFirstMessage && entry.message?.content) {
          const content = typeof entry.message.content === "string"
            ? entry.message.content
            : entry.message.content[0]?.text || "";
          
          firstMessage = truncateMessage(content, 100);
          foundFirstMessage = true;
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  return { firstMessage, turnCount };
}

function truncateMessage(text: string, maxLength: number): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength - 3) + "...";
}
```

---

## Route Implementation

```typescript
// src/routes/session-browser.ts

import { Router } from "express";
import validate from "express-zod-safe";
import { z } from "zod";
import { getSessionSource } from "../sources/index.js";
import { decodeFolderName } from "../sources/claude-source.js";

export const sessionBrowserRouter = Router();

// Schema for folder param
const FolderParamsSchema = z.object({
  folder: z.string().min(1)
});

// GET / - Render browser page (home)
sessionBrowserRouter.get("/", (req, res) => {
  res.render("pages/session-browser");
});

// GET /session-clone - Render clone page (moved from /)
sessionBrowserRouter.get("/session-clone", (req, res) => {
  res.render("pages/clone");
});

// GET /api/projects - List all projects
sessionBrowserRouter.get("/api/projects", async (req, res) => {
  try {
    const source = getSessionSource("claude");
    
    if (!await source.isAvailable()) {
      return res.status(503).json({
        error: "Claude projects directory not found",
        code: "SOURCE_UNAVAILABLE"
      });
    }
    
    const projects = await source.listProjects();
    res.json({ projects });
  } catch (error) {
    console.error("Failed to list projects:", error);
    res.status(500).json({ error: "Failed to list projects" });
  }
});

// GET /api/projects/:folder/sessions - List sessions in project
sessionBrowserRouter.get(
  "/api/projects/:folder/sessions",
  validate({ params: FolderParamsSchema }),
  async (req, res) => {
    try {
      const { folder } = req.params;
      const source = getSessionSource("claude");
      const sessions = await source.listSessions(folder);
      
      // Sessions are already sorted by lastModifiedAt desc from the source
      res.json({ 
        folder, 
        path: decodeFolderName(folder),
        sessions 
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return res.status(404).json({
          error: "Project folder not found",
          code: "NOT_FOUND"
        });
      }
      
      console.error("Failed to list sessions:", error);
      res.status(500).json({ error: "Failed to list sessions" });
    }
  }
);

export default sessionBrowserRouter;
```

**Note:** Server-side sorting removed for MVP. Client-side sorting is implemented in the page controller. Server-side sorting can be added later if needed for performance with large session lists.

---

## Frontend Implementation

### API Client

```javascript
// public/js/api/session-browser-client.js

export async function fetchProjects() {
  const response = await fetch("/api/projects");
  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchSessions(folder, options = {}) {
  const params = new URLSearchParams();
  if (options.sort) params.set("sort", options.sort);
  if (options.order) params.set("order", options.order);
  
  const url = `/api/projects/${encodeURIComponent(folder)}/sessions${
    params.toString() ? `?${params}` : ""
  }`;
  
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to fetch sessions: ${response.statusText}`);
  }
  return response.json();
}
```

### Page Controller

```javascript
// public/js/pages/session-browser.js

import { fetchProjects, fetchSessions } from "../api/session-browser-client.js";
import { formatRelativeTime, formatFileSize } from "../lib/format.js";

export class SessionBrowserController {
  constructor() {
    this.projectSelect = document.getElementById("project-select");
    this.sessionTable = document.getElementById("session-table");
    this.sessionBody = document.getElementById("session-body");
    this.loadingIndicator = document.getElementById("loading");
    this.emptyMessage = document.getElementById("empty-message");
    
    this.currentSort = { field: "lastModifiedAt", order: "desc" };
    this.sessions = [];
    
    this.init();
  }

  async init() {
    await this.loadProjects();
    this.setupEventListeners();
  }

  async loadProjects() {
    try {
      const { projects } = await fetchProjects();
      this.renderProjectDropdown(projects);
    } catch (error) {
      this.showError("Failed to load projects: " + error.message);
    }
  }

  renderProjectDropdown(projects) {
    this.projectSelect.innerHTML = `
      <option value="">Select a project...</option>
      ${projects.map(p => `
        <option value="${p.folder}">${p.path}</option>
      `).join("")}
    `;
  }

  async loadSessions(folder) {
    this.showLoading(true);
    try {
      const { sessions } = await fetchSessions(folder, this.currentSort);
      this.sessions = sessions;
      this.renderSessionTable(sessions);
    } catch (error) {
      this.showError("Failed to load sessions: " + error.message);
    } finally {
      this.showLoading(false);
    }
  }

  renderSessionTable(sessions) {
    if (sessions.length === 0) {
      this.sessionTable.classList.add("hidden");
      this.emptyMessage.classList.remove("hidden");
      this.emptyMessage.textContent = "No sessions found in this project.";
      return;
    }

    this.sessionTable.classList.remove("hidden");
    this.emptyMessage.classList.add("hidden");
    
    this.sessionBody.innerHTML = sessions.map(s => `
      <tr class="hover:bg-gray-50 cursor-pointer" data-session-id="${s.sessionId}">
        <td class="px-4 py-3">
          <span class="session-id text-blue-600 hover:underline" 
                title="Click to copy">${s.sessionId.slice(0, 8)}...</span>
        </td>
        <td class="px-4 py-3 max-w-md truncate" title="${escapeHtml(s.firstMessage)}">
          ${escapeHtml(s.firstMessage)}
        </td>
        <td class="px-4 py-3 text-sm text-gray-600">
          ${formatRelativeTime(new Date(s.createdAt))}
        </td>
        <td class="px-4 py-3 text-sm text-gray-600">
          ${formatRelativeTime(new Date(s.lastModifiedAt))}
        </td>
        <td class="px-4 py-3 text-sm text-gray-600">
          ${formatFileSize(s.sizeBytes)}
        </td>
        <td class="px-4 py-3 text-sm text-gray-600">
          ${s.turnCount}
        </td>
        <td class="px-4 py-3">
          <button class="clone-btn px-2 py-1 text-sm bg-blue-100 hover:bg-blue-200 rounded mr-1"
                  title="Clone session">⚡</button>
          <button class="visualize-btn px-2 py-1 text-sm bg-purple-100 hover:bg-purple-200 rounded"
                  title="Visualize session">📊</button>
        </td>
      </tr>
    `).join("");
  }

  setupEventListeners() {
    // Project selection
    this.projectSelect.addEventListener("change", (e) => {
      if (e.target.value) {
        this.loadSessions(e.target.value);
      }
    });

    // Table sorting
    document.querySelectorAll("[data-sort]").forEach(header => {
      header.addEventListener("click", () => {
        const field = header.dataset.sort;
        if (this.currentSort.field === field) {
          this.currentSort.order = this.currentSort.order === "asc" ? "desc" : "asc";
        } else {
          this.currentSort.field = field;
          this.currentSort.order = "desc";
        }
        this.sortAndRender();
      });
    });

    // Table row actions (event delegation)
    this.sessionBody.addEventListener("click", (e) => {
      const row = e.target.closest("tr");
      if (!row) return;
      
      const sessionId = row.dataset.sessionId;
      
      if (e.target.classList.contains("session-id")) {
        this.copySessionId(sessionId);
      } else if (e.target.classList.contains("clone-btn")) {
        window.location.href = `/session-clone?sessionId=${sessionId}`;
      } else if (e.target.classList.contains("visualize-btn")) {
        window.location.href = `/session-detail?id=${sessionId}`;
      } else if (!e.target.closest("button")) {
        window.location.href = `/session-detail?id=${sessionId}`;
      }
    });
  }

  async copySessionId(sessionId) {
    await navigator.clipboard.writeText(sessionId);
    this.showToast("Session ID copied!");
  }

  sortAndRender() {
    const { field, order } = this.currentSort;
    const sorted = [...this.sessions].sort((a, b) => {
      let aVal = a[field];
      let bVal = b[field];
      
      if (field === "createdAt" || field === "lastModifiedAt") {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      if (aVal < bVal) return order === "asc" ? -1 : 1;
      if (aVal > bVal) return order === "asc" ? 1 : -1;
      return 0;
    });
    
    this.renderSessionTable(sorted);
    this.updateSortIndicators();
  }

  // ... helper methods (showLoading, showError, showToast, updateSortIndicators)
}
```

---

## Performance Considerations

### Lazy Metadata Loading

For projects with many sessions, consider a two-phase approach:

1. **Fast initial load**: Return sessions with only filesystem metadata (size, dates, filename)
2. **Lazy content load**: Extract firstMessage and turnCount on demand or progressively

```typescript
// Phase 1: Fast response
interface SessionSummaryFast {
  sessionId: string;
  createdAt: Date;
  lastModifiedAt: Date;
  sizeBytes: number;
  // firstMessage and turnCount loaded separately
}

// Phase 2: Enriched data (loaded progressively)
interface SessionMetadata {
  sessionId: string;
  firstMessage: string;
  turnCount: number;
}
```

### Caching

Consider caching session metadata with file mtime as cache key:

```typescript
const metadataCache = new Map<string, { mtime: number; metadata: SessionMetadata }>();

async function getCachedMetadata(filePath: string): Promise<SessionMetadata> {
  const stats = await stat(filePath);
  const cached = metadataCache.get(filePath);
  
  if (cached && cached.mtime === stats.mtimeMs) {
    return cached.metadata;
  }
  
  const metadata = await extractMetadata(filePath);
  metadataCache.set(filePath, { mtime: stats.mtimeMs, metadata });
  return metadata;
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// test/sources/claude-source.test.ts

describe("ClaudeSessionSource", () => {
  describe("listProjects", () => {
    it("returns decoded project paths sorted alphabetically");
    it("returns empty array when projects directory is empty");
    it("handles missing projects directory gracefully");
  });

  describe("listSessions", () => {
    it("returns sessions sorted by lastModifiedAt descending");
    it("extracts first user message correctly");
    it("counts turns accurately");
    it("handles sessions with no user messages");
    it("handles malformed JSONL entries");
  });

  describe("decodeFolderName", () => {
    it("decodes -Users-lee-code to /Users/lee/code");
    it("handles nested paths correctly");
  });
});
```

### Integration Tests

```typescript
// test/routes/session-browser.test.ts

describe("GET /api/projects", () => {
  it("returns list of projects with folder and path");
  it("returns 503 when Claude directory unavailable");
});

describe("GET /api/projects/:folder/sessions", () => {
  it("returns sessions for valid project folder");
  it("returns 404 for non-existent folder");
  it("applies sort parameter correctly");
  it("validates folder parameter");
});
```

### Test Fixtures

Create fixture sessions in `test/fixtures/session-browser/`:
- `simple-session.jsonl`: Basic session with clear first message
- `no-user-message.jsonl`: Session starting with summary
- `many-turns.jsonl`: Session with 50+ turns for turn counting
- `malformed.jsonl`: Session with some invalid JSON lines

---

## Related Documentation

- [Feature Specification](./01-session-browser.feature.md)
- [Claude Code Session Format](../../reference/claude-code-session-storage-formats.md)
- [Session Detail Core](../006-session-detail-core/)
