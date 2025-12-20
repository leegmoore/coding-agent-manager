```prompt
# Phase 1: Discovery & Browsing - Skeleton + TDD Red (Claude Opus 4.5)

## Objective

Create the `CopilotSessionSource` skeleton for GitHub Copilot Chat session discovery: types, service stubs, test fixtures, API route stubs, and **TDD Red tests that assert REAL behavior and will ERROR** because stubs throw `NotImplementedError`.

TDD Red means tests assert real expected behavior. Tests ERROR (throw) because stubs throw `NotImplementedError`. When Phase 2 implements real logic, these same tests will PASS.

## Context for Your Approach

You are implementing a session source adapter for GitHub Copilot Chat sessions stored by VS Code. This extends the `SessionSource` abstraction established in project 008.

Key behaviors to understand before coding:
- VS Code stores sessions in `~/Library/Application Support/Code/User/workspaceStorage/<hash>/chatSessions/<uuid>.json`
- Each workspace folder has a `workspace.json` file mapping the hash to a `file:///path` URI
- Copilot sessions are single JSON files (NOT JSONL like Claude)
- Sessions contain a `requests[]` array where each object is a conversation turn
- The `isCanceled` field on requests indicates abandoned turns
- A turn = one user prompt through all responses until the next user prompt

Reference: `docs/reference/github-copilot-session-storage-formats.md` for complete format details.

## Scope Note

This phase covers **discovery and browsing only** (AC-1 through AC-18, AC-39 through AC-42 from the feature spec). Session ID resolution (AC-21-24), cloning (AC-25-29), and visualization (AC-30-38) are implemented in Phases 3-6.

The `findSession()` and `loadSession()` methods are added to `CopilotSessionSource` as Copilot-specific methods (not on the base `SessionSource` interface) to support later phases.

## Constraints

- All service functions throw `NotImplementedError` - no real logic yet
- Reuse `truncateMessage` from `src/sources/claude-source.ts`
- New Copilot types go in `src/sources/copilot-types.ts`
- Tests assert REAL behavior (return values, structures) - they will ERROR when stubs throw
- Use existing error classes from `src/errors.ts`
- Follow existing patterns from `src/sources/claude-source.ts`

## Reference Files

Read these files to understand existing patterns before writing code:
- `src/sources/types.ts` - `SessionSource` interface to implement
- `src/sources/claude-source.ts` - Pattern for implementing a session source
- `src/sources/index.ts` - Source factory to extend
- `src/types.ts` - `ProjectInfo`, `SessionSummary` types
- `src/errors.ts` - `NotImplementedError` class
- `src/routes/session-browser.ts` - Existing routes to extend
- `docs/reference/github-copilot-session-storage-formats.md` - Copilot format specification

## Deliverables

### 1. Copilot Types (`src/sources/copilot-types.ts`)

Create new file with Copilot-specific types:

```typescript
/**
 * Workspace configuration from VS Code's workspace.json
 */
export interface WorkspaceConfig {
  /** Folder URI in format "file:///path/to/folder" */
  folder: string;
}

/**
 * Copilot chat session structure
 */
export interface CopilotSession {
  /** Schema version (currently 3) */
  version: number;
  /** Session UUID (matches filename) */
  sessionId: string;
  /** Creation timestamp in Unix ms */
  creationDate: number;
  /** Last message timestamp in Unix ms */
  lastMessageDate: number;
  /** User-assigned or auto-generated title */
  customTitle?: string;
  /** Whether session was imported */
  isImported: boolean;
  /** Array of conversation turns */
  requests: CopilotRequest[];
}

/**
 * Single request/response turn in Copilot session
 */
export interface CopilotRequest {
  /** Unique request identifier */
  requestId: string;
  /** User message content */
  message: {
    /** Full message text */
    text: string;
    /** Structured message parts */
    parts: unknown[];
  };
  /** Response items from Copilot */
  response: CopilotResponseItem[];
  /** Whether user canceled this request */
  isCanceled: boolean;
  /** Request timestamp in Unix ms */
  timestamp: number;
}

/**
 * Response item in Copilot response array
 */
export interface CopilotResponseItem {
  kind?: string;
  value?: string;
  [key: string]: unknown;
}
```

### 2. Copilot Source Stub (`src/sources/copilot-source.ts`)

All functions throw `NotImplementedError`:

```typescript
import { NotImplementedError } from "../errors.js";
import type { SessionSource } from "./types.js";
import type { ProjectInfo, SessionSummary } from "../types.js";
import type { CopilotSession, WorkspaceConfig } from "./copilot-types.js";

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
  throw new NotImplementedError("getVSCodeStoragePath");
}

/**
 * Extract the filesystem path from a VS Code folder URI.
 * @param folderUri URI like "file:///Users/dev/project"
 * @returns Filesystem path like "/Users/dev/project"
 */
export function extractPathFromUri(folderUri: string): string {
  throw new NotImplementedError("extractPathFromUri");
}

/**
 * Count non-canceled turns in a Copilot session.
 * A turn = one user prompt through all responses until the next user prompt.
 * For Copilot, each non-canceled request IS one turn.
 */
export function countTurns(session: CopilotSession): number {
  throw new NotImplementedError("countTurns");
}

/**
 * Extract first user message from session.
 * Returns "(No messages)" if no requests exist.
 * Truncates to 100 characters.
 */
export function extractFirstMessage(session: CopilotSession): string {
  throw new NotImplementedError("extractFirstMessage");
}

export class CopilotSessionSource implements SessionSource {
  readonly sourceType = "copilot" as const;

  async isAvailable(): Promise<boolean> {
    throw new NotImplementedError("CopilotSessionSource.isAvailable");
  }

  async listProjects(): Promise<ProjectInfo[]> {
    throw new NotImplementedError("CopilotSessionSource.listProjects");
  }

  async listSessions(workspaceHash: string): Promise<SessionSummary[]> {
    throw new NotImplementedError("CopilotSessionSource.listSessions");
  }

  /**
   * Find a session by ID across all workspaces.
   * @returns Workspace hash if found, null otherwise
   */
  async findSession(sessionId: string): Promise<string | null> {
    throw new NotImplementedError("CopilotSessionSource.findSession");
  }

  /**
   * Load a specific session by ID and workspace.
   * @param sessionId Session UUID
   * @param workspaceHash Workspace folder hash
   */
  async loadSession(sessionId: string, workspaceHash: string): Promise<CopilotSession> {
    throw new NotImplementedError("CopilotSessionSource.loadSession");
  }
}
```

### 3. Update Source Factory (`src/sources/index.ts`)

Add Copilot source support:

```typescript
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
```

### 4. Router Updates (`src/routes/session-browser.ts`)

Add Copilot API route stubs that return 501 until Phase 2:

```typescript
// Add after existing routes

// Schema for workspace hash validation
const HashParamsSchema = z.object({
  hash: z.string().min(1, "Workspace hash is required")
});

// GET /api/copilot/projects - List Copilot workspaces (stub)
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
    if (error instanceof NotImplementedError) {
      return res.status(501).json({
        error: { message: "Copilot source not yet implemented", code: "NOT_IMPLEMENTED" }
      });
    }
    console.error("Failed to list Copilot projects:", error);
    res.status(500).json({ error: { message: "Failed to list Copilot projects" } });
  }
});

// GET /api/copilot/projects/:hash/sessions - List sessions in workspace (stub)
sessionBrowserRouter.get(
  "/api/copilot/projects/:hash/sessions",
  validate({ params: HashParamsSchema }),
  async (req, res) => {
    try {
      const { hash } = req.params;
      const source = getSessionSource("copilot");
      const sessions = await source.listSessions(hash);

      const projectPath = sessions.length > 0 ? sessions[0].projectPath : "";

      res.json({
        folder: hash,
        path: projectPath,
        sessions
      });
    } catch (error) {
      if (error instanceof NotImplementedError) {
        return res.status(501).json({
          error: { message: "Copilot source not yet implemented", code: "NOT_IMPLEMENTED" }
        });
      }
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return res.status(404).json({
          error: { message: "Workspace not found", code: "NOT_FOUND" }
        });
      }
      console.error("Failed to list Copilot sessions:", error);
      res.status(500).json({ error: { message: "Failed to list Copilot sessions" } });
    }
  }
);
```

Add import at top of router file:
```typescript
import { NotImplementedError } from "../errors.js";
```

### 5. Template Updates (`views/pages/session-browser.ejs`)

Add source toggle UI skeleton (non-functional until Phase 2):

```html
<!-- Add after page title, before project selector -->
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
      disabled
      title="Coming soon"
    >
      GitHub Copilot
    </button>
  </div>
</div>
```

### 6. Test Fixtures

Create `test/fixtures/copilot-sessions/workspaceStorage/` with test data:

**Directory structure:**
```
test/fixtures/copilot-sessions/
└── workspaceStorage/
    ├── abc123def456ghi789/
    │   ├── workspace.json
    │   └── chatSessions/
    │       ├── 11111111-1111-1111-1111-111111111111.json
    │       ├── 22222222-2222-2222-2222-222222222222.json
    │       ├── 44444444-4444-4444-4444-444444444444.json  # Empty requests (TC-06)
    │       └── 55555555-5555-5555-5555-555555555555.json  # Malformed JSON (TC-07)
    ├── xyz987uvw654rst321/
    │   ├── workspace.json
    │   └── chatSessions/
    │       └── 33333333-3333-3333-3333-333333333333.json
    ├── nosessions123/
    │   └── workspace.json
    └── invalidworkspace/
        └── chatSessions/
            └── orphan-session.json  # No workspace.json - excluded
```

**abc123def456ghi789/workspace.json:**
```json
{
  "folder": "file:///Users/test/projectalpha"
}
```

**abc123def456ghi789/chatSessions/11111111-1111-1111-1111-111111111111.json:**
```json
{
  "version": 3,
  "sessionId": "11111111-1111-1111-1111-111111111111",
  "creationDate": 1733900000000,
  "lastMessageDate": 1733950000000,
  "customTitle": "Test Session Alpha-1",
  "isImported": false,
  "requests": [
    {
      "requestId": "request_1",
      "message": { "text": "Help me refactor the authentication module to use JWT tokens", "parts": [] },
      "response": [{ "kind": "markdownContent", "value": "I'll help you refactor." }],
      "isCanceled": false,
      "timestamp": 1733900000000
    },
    {
      "requestId": "request_2",
      "message": { "text": "Add error handling for token expiration", "parts": [] },
      "response": [{ "kind": "markdownContent", "value": "Adding error handling." }],
      "isCanceled": false,
      "timestamp": 1733910000000
    }
  ],
  "requesterUsername": "testuser",
  "responderUsername": "GitHub Copilot"
}
```

**abc123def456ghi789/chatSessions/22222222-2222-2222-2222-222222222222.json:**
```json
{
  "version": 3,
  "sessionId": "22222222-2222-2222-2222-222222222222",
  "creationDate": 1733800000000,
  "lastMessageDate": 1733850000000,
  "customTitle": "Test Session Alpha-2",
  "isImported": false,
  "requests": [
    {
      "requestId": "request_1",
      "message": { "text": "Create a new React component for the dashboard", "parts": [] },
      "response": [{ "kind": "markdownContent", "value": "Creating component." }],
      "isCanceled": false,
      "timestamp": 1733800000000
    }
  ],
  "requesterUsername": "testuser",
  "responderUsername": "GitHub Copilot"
}
```

**xyz987uvw654rst321/workspace.json:**
```json
{
  "folder": "file:///Users/test/projectbeta"
}
```

**xyz987uvw654rst321/chatSessions/33333333-3333-3333-3333-333333333333.json:**
```json
{
  "version": 3,
  "sessionId": "33333333-3333-3333-3333-333333333333",
  "creationDate": 1733700000000,
  "lastMessageDate": 1733750000000,
  "customTitle": "Test Session Beta",
  "isImported": false,
  "requests": [
    {
      "requestId": "request_1",
      "message": { "text": "Debug the API endpoint", "parts": [] },
      "response": [{ "kind": "markdownContent", "value": "Debugging." }],
      "isCanceled": false,
      "timestamp": 1733700000000
    },
    {
      "requestId": "request_2",
      "message": { "text": "Check the error handling", "parts": [] },
      "response": [],
      "isCanceled": true,
      "timestamp": 1733710000000
    },
    {
      "requestId": "request_3",
      "message": { "text": "Add logging for debugging", "parts": [] },
      "response": [{ "kind": "markdownContent", "value": "Adding logging." }],
      "isCanceled": false,
      "timestamp": 1733720000000
    }
  ],
  "requesterUsername": "testuser",
  "responderUsername": "GitHub Copilot"
}
```

**nosessions123/workspace.json:**
```json
{
  "folder": "file:///Users/test/emptyproject"
}
```

**abc123def456ghi789/chatSessions/44444444-4444-4444-4444-444444444444.json (empty requests - TC-06):**
```json
{
  "version": 3,
  "sessionId": "44444444-4444-4444-4444-444444444444",
  "creationDate": 1733600000000,
  "lastMessageDate": 1733600000000,
  "isImported": false,
  "requests": []
}
```

**abc123def456ghi789/chatSessions/55555555-5555-5555-5555-555555555555.json (malformed - TC-07):**
```
{ "version": 3, "sessionId": "55555555-5555-5555-5555-555555555555", "creationDate": 1733500000000, "lastMessageDate
```
Note: This file is intentionally truncated/malformed to test error handling. It should be skipped with a warning logged.

**invalidworkspace/chatSessions/orphan-session.json:**
```json
{
  "version": 3,
  "sessionId": "orphan-session",
  "creationDate": 1733400000000,
  "lastMessageDate": 1733400000000,
  "isImported": false,
  "requests": []
}
```

### 7. Tests (`test/copilot-source.test.ts`)

Tests assert REAL behavior. They will ERROR (throw `NotImplementedError`) until Phase 2 implements the logic.

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import {
  CopilotSessionSource,
  getVSCodeStoragePath,
  extractPathFromUri,
  countTurns,
  extractFirstMessage,
} from "../src/sources/copilot-source.js";
import type { CopilotSession } from "../src/sources/copilot-types.js";

describe("Copilot Session Source", () => {
  describe("Utility Functions", () => {
    describe("getVSCodeStoragePath", () => {
      it("returns platform-appropriate path", () => {
        const storagePath = getVSCodeStoragePath();
        expect(typeof storagePath).toBe("string");
        expect(storagePath.length).toBeGreaterThan(0);
      });
    });

    describe("extractPathFromUri", () => {
      it("extracts path from file URI", () => {
        expect(extractPathFromUri("file:///Users/dev/project")).toBe("/Users/dev/project");
      });

      it("handles URI with spaces (encoded)", () => {
        expect(extractPathFromUri("file:///Users/dev/my%20project")).toBe("/Users/dev/my project");
      });

      it("handles Windows-style paths", () => {
        expect(extractPathFromUri("file:///c:/Users/dev/project")).toBe("c:/Users/dev/project");
      });

      it("handles simple paths", () => {
        expect(extractPathFromUri("file:///tmp")).toBe("/tmp");
      });
    });

    describe("countTurns", () => {
      it("counts non-canceled requests", () => {
        const session: CopilotSession = {
          version: 3,
          sessionId: "test",
          creationDate: 0,
          lastMessageDate: 0,
          isImported: false,
          requests: [
            { requestId: "1", message: { text: "a", parts: [] }, response: [], isCanceled: false, timestamp: 0 },
            { requestId: "2", message: { text: "b", parts: [] }, response: [], isCanceled: true, timestamp: 0 },
            { requestId: "3", message: { text: "c", parts: [] }, response: [], isCanceled: false, timestamp: 0 },
          ],
        };
        expect(countTurns(session)).toBe(2);
      });

      it("returns 0 for empty requests", () => {
        const session: CopilotSession = {
          version: 3,
          sessionId: "test",
          creationDate: 0,
          lastMessageDate: 0,
          isImported: false,
          requests: [],
        };
        expect(countTurns(session)).toBe(0);
      });

      it("returns full count when none canceled", () => {
        const session: CopilotSession = {
          version: 3,
          sessionId: "test",
          creationDate: 0,
          lastMessageDate: 0,
          isImported: false,
          requests: [
            { requestId: "1", message: { text: "a", parts: [] }, response: [], isCanceled: false, timestamp: 0 },
            { requestId: "2", message: { text: "b", parts: [] }, response: [], isCanceled: false, timestamp: 0 },
          ],
        };
        expect(countTurns(session)).toBe(2);
      });
    });

    describe("extractFirstMessage", () => {
      it("extracts first message text", () => {
        const session: CopilotSession = {
          version: 3,
          sessionId: "test",
          creationDate: 0,
          lastMessageDate: 0,
          isImported: false,
          requests: [
            { requestId: "1", message: { text: "Help me refactor", parts: [] }, response: [], isCanceled: false, timestamp: 0 },
          ],
        };
        expect(extractFirstMessage(session)).toBe("Help me refactor");
      });

      it("returns placeholder for empty requests", () => {
        const session: CopilotSession = {
          version: 3,
          sessionId: "test",
          creationDate: 0,
          lastMessageDate: 0,
          isImported: false,
          requests: [],
        };
        expect(extractFirstMessage(session)).toBe("(No messages)");
      });

      it("truncates long messages to 100 chars", () => {
        const longMessage = "a".repeat(150);
        const session: CopilotSession = {
          version: 3,
          sessionId: "test",
          creationDate: 0,
          lastMessageDate: 0,
          isImported: false,
          requests: [
            { requestId: "1", message: { text: longMessage, parts: [] }, response: [], isCanceled: false, timestamp: 0 },
          ],
        };
        const result = extractFirstMessage(session);
        expect(result.length).toBeLessThanOrEqual(100);
        expect(result.endsWith("...")).toBe(true);
      });
    });
  });

  describe("CopilotSessionSource", () => {
    let source: CopilotSessionSource;
    const fixturesPath = path.join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");

    beforeAll(() => {
      process.env.VSCODE_STORAGE_PATH = fixturesPath;
      source = new CopilotSessionSource();
    });

    afterAll(() => {
      delete process.env.VSCODE_STORAGE_PATH;
    });

    describe("isAvailable", () => {
      it("returns true when storage directory exists", async () => {
        expect(await source.isAvailable()).toBe(true);
      });

      it("returns false when storage directory does not exist", async () => {
        const originalPath = process.env.VSCODE_STORAGE_PATH;
        process.env.VSCODE_STORAGE_PATH = "/nonexistent/path/that/does/not/exist";
        const localSource = new CopilotSessionSource();
        expect(await localSource.isAvailable()).toBe(false);
        process.env.VSCODE_STORAGE_PATH = originalPath;
      });
    });

    describe("listProjects", () => {
      it("returns list of workspaces with chat sessions", async () => {
        const projects = await source.listProjects();
        // Should include abc123... and xyz987..., but NOT nosessions123 or invalidworkspace
        expect(projects.length).toBe(2);
      });

      it("includes folder (hash) and path properties", async () => {
        const projects = await source.listProjects();
        expect(projects[0]).toHaveProperty("folder");
        expect(projects[0]).toHaveProperty("path");
      });

      it("extracts path from workspace.json", async () => {
        const projects = await source.listProjects();
        const alpha = projects.find(p => p.folder === "abc123def456ghi789");
        expect(alpha?.path).toBe("/Users/test/projectalpha");
      });

      it("excludes workspaces without chatSessions folder", async () => {
        const projects = await source.listProjects();
        const noSessions = projects.find(p => p.folder === "nosessions123");
        expect(noSessions).toBeUndefined();
      });

      it("excludes workspaces without workspace.json", async () => {
        const projects = await source.listProjects();
        const invalid = projects.find(p => p.folder === "invalidworkspace");
        expect(invalid).toBeUndefined();
      });

      it("sorts projects alphabetically by path", async () => {
        const projects = await source.listProjects();
        const paths = projects.map(p => p.path);
        expect(paths).toEqual([...paths].sort());
      });
    });

    describe("listSessions", () => {
      it("returns sessions for valid workspace (skips malformed)", async () => {
        const sessions = await source.listSessions("abc123def456ghi789");
        // 4 files: 2 valid + 1 empty-requests + 1 malformed = 3 returned (malformed skipped)
        expect(sessions).toHaveLength(3);
      });

      it("includes required session properties", async () => {
        const sessions = await source.listSessions("abc123def456ghi789");
        const session = sessions[0];

        expect(session).toHaveProperty("sessionId");
        expect(session).toHaveProperty("source", "copilot");
        expect(session).toHaveProperty("projectPath");
        expect(session).toHaveProperty("firstMessage");
        expect(session).toHaveProperty("createdAt");
        expect(session).toHaveProperty("lastModifiedAt");
        expect(session).toHaveProperty("sizeBytes");
        expect(session).toHaveProperty("turnCount");
      });

      it("extracts first user message", async () => {
        const sessions = await source.listSessions("abc123def456ghi789");
        const session = sessions.find(s => s.sessionId === "11111111-1111-1111-1111-111111111111");
        expect(session?.firstMessage).toContain("refactor");
      });

      it("counts turns correctly (excludes canceled)", async () => {
        const sessions = await source.listSessions("xyz987uvw654rst321");
        const session = sessions.find(s => s.sessionId === "33333333-3333-3333-3333-333333333333");
        // 3 requests, 1 canceled = 2 turns
        expect(session?.turnCount).toBe(2);
      });

      it("handles empty requests array (TC-06)", async () => {
        const sessions = await source.listSessions("abc123def456ghi789");
        const emptySession = sessions.find(s => s.sessionId === "44444444-4444-4444-4444-444444444444");
        expect(emptySession).toBeDefined();
        expect(emptySession?.firstMessage).toBe("(No messages)");
        expect(emptySession?.turnCount).toBe(0);
      });

      it("skips malformed JSON files with warning (TC-07)", async () => {
        const sessions = await source.listSessions("abc123def456ghi789");
        // Malformed session 55555555 should not appear
        const malformedSession = sessions.find(s => s.sessionId === "55555555-5555-5555-5555-555555555555");
        expect(malformedSession).toBeUndefined();
        // Note: warning logged to console - not asserted in test
      });

      it("sorts sessions by lastModifiedAt descending", async () => {
        const sessions = await source.listSessions("abc123def456ghi789");
        if (sessions.length >= 2) {
          expect(sessions[0].lastModifiedAt.getTime())
            .toBeGreaterThanOrEqual(sessions[1].lastModifiedAt.getTime());
        }
      });

      it("throws for non-existent workspace", async () => {
        await expect(source.listSessions("nonexistent-hash"))
          .rejects.toThrow();
      });
    });

    describe("findSession", () => {
      it("returns workspace hash when session found", async () => {
        const hash = await source.findSession("11111111-1111-1111-1111-111111111111");
        expect(hash).toBe("abc123def456ghi789");
      });

      it("returns null when session not found", async () => {
        const hash = await source.findSession("00000000-0000-0000-0000-000000000000");
        expect(hash).toBeNull();
      });
    });

    describe("loadSession", () => {
      it("returns session data", async () => {
        const session = await source.loadSession(
          "11111111-1111-1111-1111-111111111111",
          "abc123def456ghi789"
        );
        expect(session.sessionId).toBe("11111111-1111-1111-1111-111111111111");
        expect(session.requests.length).toBe(2);
      });

      it("throws for non-existent session", async () => {
        await expect(source.loadSession("nonexistent", "abc123def456ghi789"))
          .rejects.toThrow();
      });
    });
  });
});
```

## Verification

After completing this phase:

```bash
npm run typecheck  # Must pass - no type errors
npm test           # Behavior tests ERROR (throw NotImplementedError)
```

Specifically:
- Existing tests still pass
- New copilot-source tests ERROR because stubs throw NotImplementedError
- API routes return 501 because source throws NotImplementedError

## Done When

- TypeScript compiles without errors
- All existing tests still pass
- New files created:
  - `src/sources/copilot-types.ts`
  - `src/sources/copilot-source.ts`
  - `test/fixtures/copilot-sessions/workspaceStorage/` (with all fixture files)
  - `test/copilot-source.test.ts`
- `src/sources/index.ts` updated with Copilot exports
- `src/routes/session-browser.ts` updated with Copilot route stubs
- `views/pages/session-browser.ejs` updated with source toggle skeleton
- **Behavior tests ERROR** (stubs throw NotImplementedError) - THIS IS CORRECT TDD RED

| Test Category | Expected Result |
|---------------|-----------------|
| Existing tests | PASS |
| getVSCodeStoragePath tests | ERROR (NotImplementedError) |
| extractPathFromUri tests | ERROR (NotImplementedError) |
| countTurns tests | ERROR (NotImplementedError) |
| extractFirstMessage tests | ERROR (NotImplementedError) |
| CopilotSessionSource.isAvailable (exists) | ERROR (NotImplementedError) |
| CopilotSessionSource.isAvailable (not exists) | ERROR (NotImplementedError) |
| CopilotSessionSource.listProjects tests | ERROR (NotImplementedError) |
| CopilotSessionSource.listSessions tests | ERROR (NotImplementedError) |
| CopilotSessionSource.listSessions (empty requests TC-06) | ERROR (NotImplementedError) |
| CopilotSessionSource.listSessions (malformed TC-07) | ERROR (NotImplementedError) |
| CopilotSessionSource.findSession tests | ERROR (NotImplementedError) |
| CopilotSessionSource.loadSession tests | ERROR (NotImplementedError) |
| GET /api/copilot/projects | Returns 501 |
| GET /api/copilot/projects/:hash/sessions | Returns 501 |

Implement the complete phase. Deliver working code with proper TypeScript types, not a plan.
```
