```prompt
# Phase 6: Cloning & Integration - TDD Green (Claude Opus 4.5)

## Objective

Implement the cloning and integration components to make all Phase 5 tests pass: `CopilotCloneService`, source resolver, clone page auto-detection, and end-to-end integration. Replace `NotImplementedError` stubs with real logic.

TDD Green means the tests written in Phase 5 (which asserted real behavior) now PASS because implementations return correct values.

## Context

Phase 5 created:
- `src/services/copilot-clone.ts` - Clone service stubs
- `src/lib/source-resolver.ts` - Resolver stubs
- `src/routes/copilot-clone.ts` - Route stubs returning 501
- `src/routes/session-resolver.ts` - Route stubs returning 501
- Tests asserting real behavior (currently ERROR)

Your job is to implement the real logic so tests pass and cloning works end-to-end.

## Constraints

- Clone output must be valid Copilot JSON format (usable in VS Code)
- Use `estimateTokens()` from token-estimator for stats
- Source resolver searches Claude first, then Copilot
- Do NOT modify test files - make the code pass existing tests

## Reference Files

Read these files before implementing:
- `src/services/copilot-clone.ts` - Your stubs to implement
- `src/lib/source-resolver.ts` - Your stubs to implement
- `src/services/session-clone.ts` - Claude clone pattern to follow
- `src/sources/copilot-source.ts` - Session loading
- `src/sources/claude-source.ts` - Add findSession implementation
- `test/services/copilot-clone.test.ts` - Tests that must pass
- `test/lib/source-resolver.test.ts` - Tests that must pass

## Deliverables

### 1. Implement CopilotCloneService (`src/services/copilot-clone.ts`)

```typescript
import { getSessionSource } from "../sources/index.js";
import type { CopilotSessionSource } from "../sources/copilot-source.js";
import type { CopilotSession, CopilotRequest, CopilotResponseItem } from "../sources/copilot-types.js";
import { estimateTokens } from "../lib/token-estimator.js";

/**
 * Options for cloning a Copilot session.
 */
export interface CopilotCloneOptions {
  /** Remove tool invocations from responses */
  removeToolCalls?: boolean;
  /** Percentage of oldest turns to remove (0-100) */
  compressPercent?: number;
}

/**
 * Statistics about the clone operation.
 */
export interface CopilotCloneStats {
  originalTurns: number;
  clonedTurns: number;
  removedTurns: number;
  originalTokens: number;
  clonedTokens: number;
  removedTokens: number;
  compressionRatio: number;
}

/**
 * Result of a clone operation.
 */
export interface CopilotCloneResult {
  session: CopilotSession;
  stats: CopilotCloneStats;
}

export class CopilotCloneService {
  /**
   * Clone a Copilot session with optional compression.
   * Output is valid Copilot JSON format.
   */
  async clone(
    sessionId: string,
    workspaceHash: string,
    options: CopilotCloneOptions = {}
  ): Promise<CopilotCloneResult> {
    const source = getSessionSource("copilot") as CopilotSessionSource;
    const session = await source.loadSession(sessionId, workspaceHash);

    // Start with non-canceled requests
    let requests = session.requests.filter(r => !r.isCanceled);
    const originalRequests = [...requests];

    // Remove tool calls if requested
    if (options.removeToolCalls) {
      requests = this.removeToolCalls(requests);
    }

    // Compress by percentage if requested
    if (options.compressPercent !== undefined && options.compressPercent > 0) {
      requests = this.compressByPercentage(requests, options.compressPercent);
    }

    const clonedSession = this.buildClonedSession(session, requests);
    const stats = this.calculateStats(originalRequests, requests);

    return { session: clonedSession, stats };
  }

  /**
   * Remove tool-related items from response arrays.
   */
  removeToolCalls(requests: CopilotRequest[]): CopilotRequest[] {
    return requests.map(req => ({
      ...req,
      response: req.response.filter(item => {
        if (typeof item === "object" && item !== null) {
          const kind = item.kind;
          // Remove tool invocations and related items
          if (
            kind === "toolInvocationSerialized" ||
            kind === "prepareToolInvocation" ||
            kind === "mcpServersStarting"
          ) {
            return false;
          }
        }
        return true;
      })
    }));
  }

  /**
   * Remove oldest turns to achieve target compression.
   * Keeps most recent turns.
   */
  compressByPercentage(requests: CopilotRequest[], percent: number): CopilotRequest[] {
    if (requests.length === 0 || percent <= 0) return requests;
    if (percent >= 100) return [];

    const removeCount = Math.floor(requests.length * (percent / 100));
    if (removeCount === 0) return requests;

    // Remove from beginning (oldest), keep end (most recent)
    return requests.slice(removeCount);
  }

  /**
   * Generate a new UUID v4 for the cloned session.
   */
  generateSessionId(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Generate a descriptive title for the cloned session.
   * Format: "Clone: <first N chars of first user message> (<timestamp>)"
   *
   * @param firstUserMessage - The first user message text
   * @param maxLength - Maximum length for the message preview (default 50)
   * @returns Formatted clone title
   */
  generateCloneTitle(firstUserMessage: string, maxLength: number = 50): string {
    const trimmed = firstUserMessage.trim();
    const preview = trimmed.length === 0
      ? "(No message)"
      : trimmed.length <= maxLength
        ? trimmed
        : trimmed.slice(0, maxLength) + "...";

    const timestamp = this.formatTimestamp(new Date());
    return `Clone: ${preview} (${timestamp})`;
  }

  /**
   * Format a date as a readable timestamp like "Dec 12 2:30pm"
   */
  private formatTimestamp(date: Date): string {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[date.getMonth()];
    const day = date.getDate();
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12 || 12;
    return `${month} ${day} ${hours}:${minutes}${ampm}`;
  }

  /**
   * Calculate compression statistics.
   */
  calculateStats(original: CopilotRequest[], cloned: CopilotRequest[]): CopilotCloneStats {
    const originalTokens = this.countTotalTokens(original);
    const clonedTokens = this.countTotalTokens(cloned);

    return {
      originalTurns: original.length,
      clonedTurns: cloned.length,
      removedTurns: original.length - cloned.length,
      originalTokens,
      clonedTokens,
      removedTokens: originalTokens - clonedTokens,
      compressionRatio: originalTokens > 0
        ? Math.round((1 - clonedTokens / originalTokens) * 100)
        : 0
    };
  }

  /**
   * Build the cloned session with updated metadata.
   */
  private buildClonedSession(original: CopilotSession, requests: CopilotRequest[]): CopilotSession {
    const now = Date.now();

    // IMPORTANT: Always use ORIGINAL first message for title generation
    // Even if that message was removed during compression, users need
    // to identify the clone by what the session was originally about
    const firstUserMessage = original.requests.length > 0
      ? original.requests[0].message.text
      : "";

    return {
      ...original,
      requests,
      sessionId: this.generateSessionId(),
      creationDate: now,
      lastMessageDate: now,
      customTitle: this.generateCloneTitle(firstUserMessage),
      isImported: false
    };
  }

  /**
   * Count total tokens in a set of requests.
   */
  private countTotalTokens(requests: CopilotRequest[]): number {
    return requests.reduce((total, req) => {
      // User message tokens
      const userTokens = estimateTokens(req.message.text);

      // Assistant response tokens
      const assistantTokens = req.response.reduce((sum, item) => {
        if (typeof item === "object" && item !== null && "value" in item) {
          return sum + estimateTokens(String(item.value || ""));
        }
        return sum;
      }, 0);

      return total + userTokens + assistantTokens;
    }, 0);
  }
}

// Export singleton
export const copilotCloneService = new CopilotCloneService();
```

### 2. Implement Source Resolver (`src/lib/source-resolver.ts`)

```typescript
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
```

### 3. Implement findSession in ClaudeSessionSource (`src/sources/claude-source.ts`)

Add this method to the existing class:

```typescript
/**
 * Find a session by ID across all projects.
 * @returns Project folder name if found, null otherwise
 */
async findSession(sessionId: string): Promise<string | null> {
  const projectsDir = getProjectsDir();

  try {
    const projects = await readdir(projectsDir, { withFileTypes: true });

    for (const project of projects) {
      if (!project.isDirectory()) continue;

      const sessionPath = join(projectsDir, project.name, `${sessionId}.jsonl`);
      try {
        await stat(sessionPath);
        return project.name; // Found it
      } catch {
        // Not in this project, continue
      }
    }
  } catch {
    // Projects directory doesn't exist
  }

  return null;
}
```

Make sure `stat` is imported at the top of the file:
```typescript
import { stat, readdir } from "fs/promises";
```

### 4. Update Clone Route (`src/routes/copilot-clone.ts`)

Remove NotImplementedError handling:

```typescript
import { Router } from "express";
import validate from "express-zod-safe";
import { z } from "zod";
import { copilotCloneService } from "../services/copilot-clone.js";

export const copilotCloneRouter = Router();

const CloneRequestSchema = z.object({
  sessionId: z.string().min(1, "Session ID required"),
  workspaceHash: z.string().min(1, "Workspace hash required"),
  options: z.object({
    removeToolCalls: z.boolean().optional(),
    compressPercent: z.number().min(0).max(100).optional()
  }).optional()
});

// POST /api/copilot/clone
copilotCloneRouter.post(
  "/api/copilot/clone",
  validate({ body: CloneRequestSchema }),
  async (req, res) => {
    try {
      const { sessionId, workspaceHash, options = {} } = req.body;

      const result = await copilotCloneService.clone(sessionId, workspaceHash, options);

      res.json({
        success: true,
        session: result.session,
        stats: result.stats
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return res.status(404).json({
          error: { message: "Session not found", code: "NOT_FOUND" }
        });
      }
      console.error("Copilot clone failed:", error);
      res.status(500).json({
        error: { message: "Clone operation failed", code: "CLONE_ERROR" }
      });
    }
  }
);
```

### 5. Update Session Resolver Route (`src/routes/session-resolver.ts`)

Remove NotImplementedError handling:

```typescript
import { Router } from "express";
import validate from "express-zod-safe";
import { z } from "zod";
import { resolveSession } from "../lib/source-resolver.js";

export const sessionResolverRouter = Router();

const ResolveQuerySchema = z.object({
  sessionId: z.string().min(1, "Session ID required")
});

// GET /api/resolve-session?sessionId=xxx
sessionResolverRouter.get(
  "/api/resolve-session",
  validate({ query: ResolveQuerySchema }),
  async (req, res) => {
    try {
      const { sessionId } = req.query as { sessionId: string };

      const resolved = await resolveSession(sessionId);

      if (!resolved) {
        return res.status(404).json({
          error: { message: "Session not found in any source", code: "NOT_FOUND" }
        });
      }

      res.json(resolved);
    } catch (error) {
      console.error("Session resolution failed:", error);
      res.status(500).json({
        error: { message: "Failed to resolve session", code: "RESOLUTION_ERROR" }
      });
    }
  }
);
```

### 6. Update Clone Page (`public/js/pages/clone.js`)

**What to do**: The existing file has a `handleSubmit` function. Replace it with `handleCloneSubmit` below, which adds multi-source support. Also add the new state variables, helper functions, and `initSessionIdInput()` call.

**Changes required**:
1. Add state variables at module scope (after existing variables)
2. Add all helper functions below
3. Replace existing `handleSubmit` with `handleCloneSubmit`
4. Add `initSessionIdInput()` call inside the existing `DOMContentLoaded` handler

```javascript
// Add state variables at module scope
let resolvedSource = null;
let resolvedLocation = null;

// Initialize session ID input with auto-detection
function initSessionIdInput() {
  const input = document.getElementById("session-id-input");
  if (!input) return;

  let debounceTimer;

  input.addEventListener("input", (e) => {
    const sessionId = e.target.value.trim();

    clearTimeout(debounceTimer);
    resolvedSource = null;
    resolvedLocation = null;
    hideSourceIndicator();

    // UUID length is 36 characters
    if (sessionId.length === 36) {
      debounceTimer = setTimeout(() => resolveSessionId(sessionId), 300);
    }
  });
}

async function resolveSessionId(sessionId) {
  showResolvingState();

  try {
    const response = await fetch(`/api/resolve-session?sessionId=${encodeURIComponent(sessionId)}`);

    if (response.ok) {
      const { source, location } = await response.json();
      resolvedSource = source;
      resolvedLocation = location;
      showSourceIndicator(source);
    } else if (response.status === 404) {
      showNotFoundState();
    } else {
      showErrorState();
    }
  } catch (error) {
    console.error("Resolution failed:", error);
    showErrorState();
  }
}

function showSourceIndicator(source) {
  const indicator = document.getElementById("source-resolve-indicator");
  if (!indicator) return;

  indicator.classList.remove("hidden");
  if (source === "copilot") {
    indicator.innerHTML = '<span class="text-purple-600 font-medium">Found in GitHub Copilot</span>';
  } else {
    indicator.innerHTML = '<span class="text-blue-600 font-medium">Found in Claude Code</span>';
  }
}

function hideSourceIndicator() {
  const indicator = document.getElementById("source-resolve-indicator");
  if (indicator) {
    indicator.classList.add("hidden");
    indicator.innerHTML = "";
  }
}

function showResolvingState() {
  const indicator = document.getElementById("source-resolve-indicator");
  if (indicator) {
    indicator.classList.remove("hidden");
    indicator.innerHTML = '<span class="text-gray-500">Searching...</span>';
  }
}

function showNotFoundState() {
  const indicator = document.getElementById("source-resolve-indicator");
  if (indicator) {
    indicator.classList.remove("hidden");
    indicator.innerHTML = '<span class="text-red-600">Session not found</span>';
  }
}

function showErrorState() {
  const indicator = document.getElementById("source-resolve-indicator");
  if (indicator) {
    indicator.classList.remove("hidden");
    indicator.innerHTML = '<span class="text-red-600">Error resolving session</span>';
  }
}

// Update clone submission to use resolved source
async function handleCloneSubmit(e) {
  e.preventDefault();

  const sessionId = document.getElementById("session-id-input")?.value.trim();
  if (!sessionId) {
    showError("Session ID is required");
    return;
  }

  // If source not yet resolved, try to resolve
  if (!resolvedSource) {
    await resolveSessionId(sessionId);
    if (!resolvedSource) {
      showError("Could not find session in any source");
      return;
    }
  }

  const options = getCloneOptions();

  try {
    showLoading();

    let endpoint, body;
    if (resolvedSource === "copilot") {
      endpoint = "/api/copilot/clone";
      body = { sessionId, workspaceHash: resolvedLocation, options };
    } else {
      endpoint = "/api/clone";
      body = { sessionId, options };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const result = await response.json();

    if (response.ok) {
      showCloneResult(result);
    } else {
      showError(result.error?.message || "Clone failed");
    }
  } catch (error) {
    showError("Clone request failed");
  } finally {
    hideLoading();
  }
}

// In the existing DOMContentLoaded handler, add initSessionIdInput() call:
document.addEventListener("DOMContentLoaded", () => {
  initSessionIdInput();  // Add this line
  // ... keep all existing initialization code
});

// Wire handleCloneSubmit to form submission (replaces existing handleSubmit wiring):
const form = document.getElementById("clone-form");
if (form) {
  form.addEventListener("submit", handleCloneSubmit);
}
```

### 7. Update Claude Clone Service for Summary Entry (`src/services/session-clone.ts`)

Add summary entry generation to Claude clones so they appear with descriptive titles in `claude --resume`.

**Where to add**: Add these helper functions after imports (around line 20) and before `findSessionFile`:

```typescript
// === Clone Title Generation (for summary entry) ===

/**
 * Generate a descriptive title for cloned sessions.
 * Format: "Clone: <first N chars of message> (<timestamp>)"
 * Used for both Copilot customTitle and Claude summary entry.
 */
function generateCloneTitle(firstUserMessage: string, maxLength: number = 50): string {
  const trimmed = firstUserMessage.trim();
  const preview = trimmed.length === 0
    ? "(No message)"
    : trimmed.length <= maxLength
      ? trimmed
      : trimmed.slice(0, maxLength) + "...";

  const timestamp = formatTimestamp(new Date());
  return `Clone: ${preview} (${timestamp})`;
}

function formatTimestamp(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()];
  const day = date.getDate();
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  return `${month} ${day} ${hours}:${minutes}${ampm}`;
}

/**
 * Extract first user message text from session entries.
 */
function extractFirstUserMessage(entries: SessionEntry[]): string {
  const firstUser = entries.find(e => e.type === "user");
  if (!firstUser?.message?.content) return "";

  const content = firstUser.message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textBlock = content.find((b: unknown) =>
      typeof b === "object" && b !== null && (b as { type?: string }).type === "text"
    );
    return (textBlock as { text?: string })?.text || "";
  }
  return "";
}

/**
 * Create a summary entry for the cloned session.
 * Note: randomUUID is already imported at the top of session-clone.ts
 */
function createSummaryEntry(entries: SessionEntry[], firstUserMessage: string): SessionEntry {
  return {
    type: "summary",
    summary: generateCloneTitle(firstUserMessage),
    leafUuid: entries.length > 0 && entries[0].uuid ? entries[0].uuid : randomUUID()
  } as SessionEntry;
}
```

**Integration with `cloneSession` (line ~286)**: Modify the return statement to prepend summary entry:

```typescript
// In cloneSession function, before returning:
const firstUserMessage = extractFirstUserMessage(processedEntries);
const summaryEntry = createSummaryEntry(processedEntries, firstUserMessage);

// Prepend summary to output JSONL
const outputLines = [
  JSON.stringify(summaryEntry),
  ...processedEntries.map(e => JSON.stringify(e))
].join("\n");

return {
  session: outputLines,  // Changed from processedEntries.map(...).join("\n")
  stats: { ... }
};
```

**Integration with `cloneSessionV2` (line ~361)**: Same pattern - prepend summary entry to output.

**Result**: Cloned Claude sessions will display as "Clone: Help me implement... (Dec 12 2:30pm)" in `claude --resume` picker instead of "(No summary)".

### 8. End-to-End Integration Tests (`test/e2e/copilot-integration.test.ts`)

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { app } from "../../src/server.js";

describe("Copilot End-to-End Integration", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;
  const copilotFixtures = path.join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");
  const claudeFixtures = path.join(process.cwd(), "test/fixtures/session-browser");

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = copilotFixtures;
    process.env.CLAUDE_DIR = claudeFixtures;

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
    delete process.env.CLAUDE_DIR;

    await new Promise<void>((resolve, reject) => {
      server?.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });

  describe("Complete User Flow", () => {
    it("lists Copilot projects", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/projects`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.projects.length).toBeGreaterThan(0);
    });

    it("lists sessions in project", async () => {
      const projectsResponse = await fetch(`${baseUrl}/api/copilot/projects`);
      const { projects } = await projectsResponse.json();

      const workspace = projects[0].folder;
      const sessionsResponse = await fetch(`${baseUrl}/api/copilot/projects/${workspace}/sessions`);
      expect(sessionsResponse.status).toBe(200);

      const data = await sessionsResponse.json();
      expect(data.sessions.length).toBeGreaterThan(0);
    });

    it("resolves session ID to Copilot source", async () => {
      const response = await fetch(
        `${baseUrl}/api/resolve-session?sessionId=11111111-1111-1111-1111-111111111111`
      );

      // May resolve to Claude or Copilot depending on fixtures
      if (response.status === 200) {
        const data = await response.json();
        expect(["claude", "copilot"]).toContain(data.source);
        expect(data.location).toBeTruthy();
      }
    });

    it("clones Copilot session", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "11111111-1111-1111-1111-111111111111",
          workspaceHash: "abc123def456ghi789",
          options: { compressPercent: 50 }
        })
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.session).toBeDefined();
      expect(data.stats.compressionRatio).toBeGreaterThan(0);
    });

    it("gets session structure for visualization", async () => {
      const response = await fetch(
        `${baseUrl}/api/copilot/session/11111111-1111-1111-1111-111111111111/structure?workspace=abc123def456ghi789`
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.turnCount).toBeGreaterThan(0);
      expect(data.totalTokens).toBeGreaterThan(0);
    });

    it("gets session turns for playback", async () => {
      const response = await fetch(
        `${baseUrl}/api/copilot/session/11111111-1111-1111-1111-111111111111/turns?workspace=abc123def456ghi789`
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.turns.length).toBeGreaterThan(0);
      expect(data.turns[0]).toHaveProperty("content");
      expect(data.turns[0]).toHaveProperty("cumulative");
    });
  });

  describe("Error Handling", () => {
    it("returns 404 for unknown session ID in resolver", async () => {
      const response = await fetch(
        `${baseUrl}/api/resolve-session?sessionId=00000000-0000-0000-0000-000000000000`
      );
      expect(response.status).toBe(404);
    });

    it("returns 404 for invalid workspace in sessions", async () => {
      const response = await fetch(
        `${baseUrl}/api/copilot/projects/invalid-workspace/sessions`
      );
      expect(response.status).toBe(404);
    });

    it("returns 404 for invalid session in clone", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "00000000-0000-0000-0000-000000000000",
          workspaceHash: "abc123def456ghi789"
        })
      });
      expect(response.status).toBe(404);
    });

    it("returns 404 for invalid session in structure", async () => {
      const response = await fetch(
        `${baseUrl}/api/copilot/session/nonexistent/structure?workspace=abc123def456ghi789`
      );
      expect(response.status).toBe(404);
    });
  });

  describe("Clone Output Validation", () => {
    it("produces valid Copilot JSON format", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "11111111-1111-1111-1111-111111111111",
          workspaceHash: "abc123def456ghi789"
        })
      });

      const data = await response.json();
      const session = data.session;

      // Validate required Copilot session fields
      expect(session).toHaveProperty("version");
      expect(session).toHaveProperty("sessionId");
      expect(session).toHaveProperty("creationDate");
      expect(session).toHaveProperty("lastMessageDate");
      expect(session).toHaveProperty("requests");
      expect(Array.isArray(session.requests)).toBe(true);
    });

    it("generates new session ID", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "11111111-1111-1111-1111-111111111111",
          workspaceHash: "abc123def456ghi789"
        })
      });

      const data = await response.json();

      expect(data.session.sessionId).not.toBe("11111111-1111-1111-1111-111111111111");
      expect(data.session.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it("removes tool calls when requested", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "11111111-1111-1111-1111-111111111111",
          workspaceHash: "abc123def456ghi789",
          options: { removeToolCalls: true }
        })
      });

      const data = await response.json();

      // Check no tool invocations remain
      for (const req of data.session.requests) {
        for (const item of req.response) {
          if (typeof item === "object" && item !== null && "kind" in item) {
            expect(item.kind).not.toBe("toolInvocationSerialized");
            expect(item.kind).not.toBe("prepareToolInvocation");
          }
        }
      }
    });
  });
});
```

### 9. Clone Route Integration Tests (`test/copilot-clone-routes.test.ts`)

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { app } from "../src/server.js";

describe("Copilot Clone API Routes", () => {
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

  describe("POST /api/copilot/clone", () => {
    it("clones session successfully", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "11111111-1111-1111-1111-111111111111",
          workspaceHash: "abc123def456ghi789"
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("applies compression", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "11111111-1111-1111-1111-111111111111",
          workspaceHash: "abc123def456ghi789",
          options: { compressPercent: 50 }
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.stats.removedTurns).toBeGreaterThan(0);
    });

    it("returns stats", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "11111111-1111-1111-1111-111111111111",
          workspaceHash: "abc123def456ghi789"
        })
      });

      const data = await response.json();
      expect(data.stats).toHaveProperty("originalTurns");
      expect(data.stats).toHaveProperty("clonedTurns");
      expect(data.stats).toHaveProperty("originalTokens");
      expect(data.stats).toHaveProperty("clonedTokens");
    });

    it("returns 404 for non-existent session", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "nonexistent-session",
          workspaceHash: "abc123def456ghi789"
        })
      });

      expect(response.status).toBe(404);
    });

    it("validates request body", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Missing required fields
        })
      });

      expect(response.status).toBe(400);
    });
  });
});
```

## Verification

After completing this phase:

```bash
npm run typecheck  # Must pass
npm test           # All tests PASS
```

Run specific tests:

```bash
npm test -- copilot-clone
npm test -- source-resolver
npm test -- copilot-integration
npm test -- copilot-clone-routes
```

Manual testing:
1. Start dev server: `npm run dev`
2. Navigate to Clone page
3. Paste a Copilot session ID
4. Verify "Found in GitHub Copilot" appears
5. Set compression options
6. Click Clone
7. Verify stats display and download works
8. Test with Claude session ID - should show "Found in Claude Code"
9. Test with invalid ID - should show "Session not found"

## Done When

- TypeScript compiles without errors
- All tests pass
- No `NotImplementedError` remains in:
  - `src/services/copilot-clone.ts`
  - `src/lib/source-resolver.ts`
  - `src/sources/claude-source.ts` (findSession method)
- Clone route returns data (not 501)
- Resolver route returns data (not 501)
- Clone page auto-detects source
- End-to-end flow works for both Claude and Copilot sessions

| Test Category | Expected Result |
|---------------|-----------------|
| All existing tests | PASS |
| CopilotCloneService.clone tests | PASS |
| CopilotCloneService.removeToolCalls tests | PASS |
| CopilotCloneService.compressByPercentage tests | PASS |
| CopilotCloneService.generateSessionId tests | PASS |
| CopilotCloneService.calculateStats tests | PASS |
| CopilotCloneService.generateCloneTitle tests | PASS |
| Claude Clone Summary Entry tests | PASS |
| isValidUuid tests | PASS |
| resolveSession tests | PASS |
| ClaudeSessionSource.findSession tests | PASS |
| POST /api/copilot/clone | PASS (200 with data) |
| GET /api/resolve-session | PASS (200 with data) |
| End-to-end integration tests | PASS |
| Clone page auto-detection | Working |

Implement the complete phase. Deliver working code, not a plan.
```
