```prompt
# Phase 1: Copilot Clone Fix - TDD Red + Skeleton (Claude Opus 4.5)

## Objective

Create skeletons and TDD Red tests for making Copilot session cloning actually work:
1. Write cloned session JSON to VS Code storage (`chatSessions/`)
2. Update SQLite index in `state.vscdb` so VS Code discovers the session
3. Add workspace selector UI for choosing target workspace
4. Fix tool call visualization (currently missing `toolCallResults` data)

TDD Red means tests assert real expected behavior. Tests ERROR (throw) because stubs throw `NotImplementedError`. When Phase 2 implements real logic, these same tests will PASS.

## Context

### Current Problem

The Copilot clone feature currently only generates JSON in memory and offers download. Users must manually place files and hack the SQLite database. This makes the feature nearly unusable.

**Additional Issue Found:** A 12MB Copilot session with 42 turns shows only ~10k tokens and no tool calls in session-detail visualization. The issue is in `copilot-structure.ts`:
- Tool invocation metadata is extracted from `response[]` items with `kind: "toolInvocationSerialized"`
- But the actual tool **results** (file contents, terminal output) are in `request.result.metadata.toolCallResults`
- This data is being completely ignored, causing massive token undercounting

### Required Behavior

1. Clone writes session JSON to `<workspace>/chatSessions/<new-uuid>.json`
2. Clone updates `state.vscdb` to add session to `chat.ChatSessionStore.index`
3. Clone creates backup of `state.vscdb` before modification
4. Clone returns 409 if VS Code has database locked
5. UI shows workspace selector for target workspace
6. UI shows actual success message (not fake import instructions)
7. Tool call results are included in token counting and visualization

### SQLite Details

Database: `~/Library/Application Support/Code/User/workspaceStorage/<hash>/state.vscdb`

```sql
CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);

-- Read index
SELECT value FROM ItemTable WHERE key = 'chat.ChatSessionStore.index';

-- Update index (full JSON replacement)
UPDATE ItemTable SET value = '<updated-json>' WHERE key = 'chat.ChatSessionStore.index';
```

Index structure:
```json
{
  "version": 1,
  "entries": {
    "<session-uuid>": {
      "sessionId": "<session-uuid>",
      "title": "Session title",
      "lastMessageDate": 1765639846678,
      "isImported": false,
      "initialLocation": "panel",
      "isEmpty": false
    }
  }
}
```

## Constraints

- All new service/library functions throw `NotImplementedError` - no real logic yet
- Tests assert REAL behavior (return values, structures) - they will ERROR when stubs throw
- Use `better-sqlite3` for SQLite operations (synchronous API, well-maintained)
- Create backup before any database modification
- Follow existing patterns from project 009 phases

## Reference Files

Read these files before implementing:
- `src/services/copilot-clone.ts` - Existing clone service to extend
- `src/services/copilot-structure.ts` - Token counting/visualization to fix
- `src/routes/copilot-clone.ts` - Route to update
- `src/sources/copilot-source.ts` - getVSCodeStoragePath() helper
- `src/sources/copilot-types.ts` - Types to extend
- `public/js/pages/clone.js` - Frontend to update
- `docs/projects/010-consolidate-refine/003-copilot-clone-implementation.md` - Full spec

## Deliverables

### 1. Install Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "better-sqlite3": "^11.6.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11"
  }
}
```

Run: `npm install better-sqlite3 && npm install -D @types/better-sqlite3`

### 2. Zod Schemas (`src/schemas/copilot-clone.ts`)

Create new file with request/response validation:

```typescript
import { z } from "zod";

// NOTE: Use .min(1) for sessionId, NOT .uuid() - Copilot session IDs may have
// formatting variations and existing routes use .min(1) pattern
export const CopilotCloneRequestSchema = z.object({
  sessionId: z.string().min(1, "Session ID required"),
  workspaceHash: z.string().min(1, "Workspace hash required"),
  options: z.object({
    removeToolCalls: z.boolean().optional(),
    compressPercent: z.number().min(0).max(100).optional(),
    writeToDisk: z.boolean().default(true),
    targetWorkspaceHash: z.string().optional(),
  }).optional(),
});

export const CopilotCloneResponseSchema = z.object({
  success: z.boolean(),
  session: z.object({
    sessionId: z.string(),
    customTitle: z.string().optional(),
  }),
  stats: z.object({
    originalTurns: z.number(),
    clonedTurns: z.number(),
    removedTurns: z.number(),
    originalTokens: z.number(),
    clonedTokens: z.number(),
    removedTokens: z.number(),
    compressionRatio: z.number(),
  }),
  sessionPath: z.string().optional(),
  backupPath: z.string().optional(),
  writtenToDisk: z.boolean(),
});

export type CopilotCloneRequest = z.infer<typeof CopilotCloneRequestSchema>;
export type CopilotCloneResponse = z.infer<typeof CopilotCloneResponseSchema>;
```

### 3. SQLite State Library (`src/lib/sqlite-state.ts`)

Create new file with stubs:

```typescript
import { NotImplementedError } from "../errors.js";

/**
 * Entry in the VS Code chat session index.
 */
export interface ChatSessionIndexEntry {
  sessionId: string;
  title: string;
  lastMessageDate: number;
  isImported: boolean;
  initialLocation: "panel" | "editor";
  isEmpty: boolean;
}

/**
 * The full chat session index structure.
 */
export interface ChatSessionIndex {
  version: number;
  entries: Record<string, ChatSessionIndexEntry>;
}

/**
 * Manages VS Code's state.vscdb SQLite database.
 * Used to add cloned sessions to the session index.
 */
export class VSCodeStateDb {
  private dbPath: string;

  constructor(workspacePath: string) {
    this.dbPath = `${workspacePath}/state.vscdb`;
  }

  /**
   * Get the database file path.
   */
  getDbPath(): string {
    return this.dbPath;
  }

  /**
   * Create a timestamped backup of the database.
   * Cleans up old backups keeping only the 3 most recent.
   * @returns Path to the backup file
   */
  async backup(): Promise<string> {
    throw new NotImplementedError("VSCodeStateDb.backup");
  }

  /**
   * Read the current session index.
   * @returns The parsed session index or empty index if not found
   */
  readSessionIndex(): ChatSessionIndex {
    throw new NotImplementedError("VSCodeStateDb.readSessionIndex");
  }

  /**
   * Check if a session ID already exists in the index.
   * @param sessionId - Session UUID to check
   * @returns true if session exists
   */
  sessionExists(sessionId: string): boolean {
    throw new NotImplementedError("VSCodeStateDb.sessionExists");
  }

  /**
   * Add a new session to the index.
   * Throws if database is locked (SQLITE_BUSY).
   * @param entry - Session index entry to add
   */
  addSessionToIndex(entry: ChatSessionIndexEntry): void {
    throw new NotImplementedError("VSCodeStateDb.addSessionToIndex");
  }
}
```

### 4. Update Copilot Types (`src/sources/copilot-types.ts`)

**IMPORTANT:** This section ADDS types to the existing file. The `CopilotRequest` interface already exists - you must ADD the `result` field to it, NOT create a new shadowing interface.

Add these NEW interfaces after the existing `CopilotResponseItem` interface:

```typescript
// Add these NEW interfaces after CopilotResponseItem

/**
 * Tool call result content from Copilot response metadata.
 */
export interface ToolCallResultContent {
  $mid?: number;
  value: string | Record<string, unknown>;
}

/**
 * Tool call result from Copilot response metadata.
 */
export interface ToolCallResult {
  $mid?: number;
  content: ToolCallResultContent[];
}

/**
 * Metadata about tool calls in a request result.
 */
export interface ToolCallRound {
  response: string;
  toolCalls: Array<{
    name: string;
    arguments: string;
    id: string;
  }>;
  toolInputRetry: number;
  id: string;
}

/**
 * Request result metadata containing tool call information.
 */
export interface CopilotRequestResult {
  timings?: {
    firstProgress: number;
    totalElapsed: number;
  };
  metadata?: {
    codeBlocks?: Array<{
      code: string;
      language: string;
      markdownBeforeBlock: string;
    }>;
    toolCallRounds?: ToolCallRound[];
    toolCallResults?: Record<string, ToolCallResult>;
    cacheKey?: string;
    modelMessageId?: string;
    responseId?: string;
    sessionId?: string;
    agentId?: string;
  };
  details?: string;
}
```

Then MODIFY the EXISTING `CopilotRequest` interface to add two fields. Find the existing interface:

```typescript
// EXISTING - find this in the file
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
```

And UPDATE it to add `responseId` and `result` fields:

```typescript
// UPDATED - modify existing interface
export interface CopilotRequest {
  /** Unique request identifier */
  requestId: string;
  /** Response identifier */
  responseId?: string;
  /** User message content */
  message: {
    /** Full message text */
    text: string;
    /** Structured message parts */
    parts: unknown[];
  };
  /** Response items from Copilot */
  response: CopilotResponseItem[];
  /** Request result with metadata including tool call results */
  result?: CopilotRequestResult;
  /** Whether user canceled this request */
  isCanceled: boolean;
  /** Request timestamp in Unix ms */
  timestamp: number;
}
```

Do NOT create a second `CopilotRequest` interface - that would shadow the existing one and cause type errors.

### 5. Update Clone Service Interface (`src/services/copilot-clone.ts`)

Add new method stubs and update interfaces. Add after existing methods:

```typescript
import { NotImplementedError } from "../errors.js";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { getVSCodeStoragePath } from "../sources/copilot-source.js";
import { VSCodeStateDb, ChatSessionIndexEntry } from "../lib/sqlite-state.js";

// Add to CopilotCloneOptions interface:
export interface CopilotCloneOptions {
  /** Remove tool invocations from responses */
  removeToolCalls?: boolean;
  /** Percentage of oldest turns to remove (0-100) */
  compressPercent?: number;
  /** Write session to VS Code storage (default: true) */
  writeToDisk?: boolean;
  /** Target workspace hash (default: same as source) */
  targetWorkspaceHash?: string;
}

// Add to CopilotCloneResult interface:
export interface CopilotCloneResult {
  session: CopilotSession;
  stats: CopilotCloneStats;
  sessionPath?: string;
  backupPath?: string;
  writtenToDisk: boolean;
}

// Add new method to CopilotCloneService class:

/**
 * Write cloned session to VS Code storage.
 * This makes the session appear in VS Code's Copilot Chat.
 *
 * @param session - The cloned session to write
 * @param targetWorkspaceHash - Target workspace folder hash
 * @returns Paths to written session and backup files
 * @throws Error if VS Code has database locked (SQLITE_BUSY)
 */
async writeSession(
  session: CopilotSession,
  targetWorkspaceHash: string
): Promise<{ sessionPath: string; backupPath: string }> {
  throw new NotImplementedError("CopilotCloneService.writeSession");
}
```

Also update the `clone()` method signature to support new options (stub behavior - will implement in Phase 2).

### 6. Update Structure Service (`src/services/copilot-structure.ts`)

Add method stubs for tool result extraction. These will fix the token counting issue:

```typescript
import { NotImplementedError } from "../errors.js";
import type { CopilotRequest, ToolCallResult, ToolCallRound } from "../sources/copilot-types.js";

// Add to CopilotStructureService class:

/**
 * Extract tool call results from request metadata.
 * These are the actual tool outputs (file contents, terminal output, etc.)
 *
 * @param request - The Copilot request containing result metadata
 * @returns Array of tool call result data with their content
 */
extractToolCallResults(request: CopilotRequest): Array<{
  toolCallId: string;
  toolName: string;
  content: string;
}> {
  throw new NotImplementedError("CopilotStructureService.extractToolCallResults");
}

/**
 * Calculate tokens from tool call results in request metadata.
 * This accounts for the bulk of token usage in tool-heavy sessions.
 *
 * @param request - The Copilot request containing result metadata
 * @returns Token count from tool results
 */
calculateToolResultTokens(request: CopilotRequest): number {
  throw new NotImplementedError("CopilotStructureService.calculateToolResultTokens");
}
```

### 7. Update Route (`src/routes/copilot-clone.ts`)

Update route to support new options and return 409 for locked database:

```typescript
import { Router } from "express";
import validate from "express-zod-safe";
import { CopilotCloneRequestSchema } from "../schemas/copilot-clone.js";
import { copilotCloneService } from "../services/copilot-clone.js";
import { getSessionSource } from "../sources/index.js";
import type { CopilotSessionSource } from "../sources/copilot-source.js";

export const copilotCloneRouter = Router();

// POST /api/copilot/clone
copilotCloneRouter.post(
  "/api/copilot/clone",
  validate({ body: CopilotCloneRequestSchema }),
  async (req, res) => {
    try {
      const { sessionId, workspaceHash, options = {} } = req.body;

      const result = await copilotCloneService.clone(
        sessionId,
        workspaceHash,
        options
      );

      res.json({
        success: true,
        session: {
          sessionId: result.session.sessionId,
          customTitle: result.session.customTitle,
        },
        stats: result.stats,
        sessionPath: result.sessionPath,
        backupPath: result.backupPath,
        writtenToDisk: result.writtenToDisk,
      });
    } catch (error) {
      const err = error as Error;

      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return res.status(404).json({
          error: { message: "Session not found", code: "NOT_FOUND" }
        });
      }

      if (err.message?.includes("close VS Code") || err.message?.includes("SQLITE_BUSY")) {
        return res.status(409).json({
          error: {
            message: "Cannot write to VS Code database - please close VS Code and try again",
            code: "VSCODE_LOCKED"
          }
        });
      }

      console.error("Copilot clone failed:", error);
      res.status(500).json({
        error: { message: "Clone operation failed", code: "CLONE_ERROR" }
      });
    }
  }
);

// GET /api/copilot/workspaces - List available target workspaces
copilotCloneRouter.get("/api/copilot/workspaces", async (req, res) => {
  try {
    const source = getSessionSource("copilot") as CopilotSessionSource;
    const projects = await source.listProjects();
    res.json({ workspaces: projects });
  } catch (error) {
    console.error("Failed to list workspaces:", error);
    res.status(500).json({
      error: { message: "Failed to list workspaces", code: "LIST_ERROR" }
    });
  }
});
```

### 8. Frontend Stubs (`public/js/pages/clone.js`)

Add placeholder functions that will be implemented in Phase 2. Add after existing functions:

```javascript
// === Copilot Clone Write Support (Phase 1 Stubs) ===

/**
 * Load and display workspace selector for Copilot sessions.
 * Shows target workspace options for writing cloned session.
 */
async function showWorkspaceSelector() {
  const selectorDiv = document.getElementById("workspace-selector");
  if (!selectorDiv) return;

  // Stub: Show "Coming soon" until Phase 2
  selectorDiv.innerHTML = `
    <div class="text-sm text-gray-500 italic">
      Workspace selector loading...
    </div>
  `;
  selectorDiv.classList.remove("hidden");
}

/**
 * Show VS Code restart hint after successful clone.
 */
function showRestartHint() {
  const hintDiv = document.getElementById("vscode-hint");
  if (!hintDiv) return;

  hintDiv.innerHTML = `
    <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <p class="text-sm text-blue-800">
        <strong>Note:</strong> If VS Code is open, you may need to restart it
        or switch workspaces to see the cloned session.
      </p>
    </div>
  `;
  hintDiv.classList.remove("hidden");
}

/**
 * Handle 409 Conflict error (VS Code has database locked).
 * @param {object} containers - DOM containers for notifications
 */
function handleVSCodeLockedError(containers) {
  showError(containers.error,
    "Cannot clone while VS Code is running. Please close VS Code and try again."
  );
}
```

**IMPORTANT:** Add these HTML elements to `views/pages/clone.ejs`. These elements MUST exist for the JavaScript to populate them.

In `views/pages/clone.ejs`, find the `source-resolve-indicator` div and add workspace-selector AFTER it:

```html
<!-- Find this existing element -->
<div id="source-resolve-indicator" class="hidden mt-2 text-sm">
  <!-- Populated by JavaScript -->
</div>

<!-- ADD THIS immediately after source-resolve-indicator, before the grid with toolRemoval/thinkingRemoval -->
<div id="workspace-selector" class="hidden mt-4 mb-4">
  <!-- Populated by showWorkspaceSelector() -->
</div>
```

Then find the `success-result` div and add vscode-hint AFTER it (before `error-result`):

```html
<!-- Find the closing </div> of success-result section -->
</div>

<!-- ADD THIS after success-result, before error-result -->
<div id="vscode-hint" class="hidden">
  <!-- Populated by showRestartHint() -->
</div>

<!-- error-result section follows -->
<div id="error-result" class="hidden mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
```

### 9. Test Fixtures

**Use existing fixture with tool results:** The fixture at `test/fixtures/copilot-sessions/workspaceStorage/xyz987uvw654rst321/chatSessions/66666666-6666-6666-6666-666666666666.json` already contains `toolCallRounds` and `toolCallResults`. Use this instead of creating a new fixture.

Create SQLite test database fixture:

**Create test setup script** `test/setup/create-copilot-state-db.ts`:

```typescript
import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";

const fixturesPath = join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");

/**
 * Create a test state.vscdb SQLite database with sample session index.
 */
export function createTestStateDb(workspaceHash: string): void {
  const workspacePath = join(fixturesPath, workspaceHash);
  const dbPath = join(workspacePath, "state.vscdb");

  // Ensure directory exists
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
  }

  const db = new Database(dbPath);

  // Create table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ItemTable (
      key TEXT UNIQUE ON CONFLICT REPLACE,
      value BLOB
    )
  `);

  // Insert sample session index
  const index = {
    version: 1,
    entries: {
      "existing-session-111": {
        sessionId: "existing-session-111",
        title: "Existing Test Session",
        lastMessageDate: Date.now(),
        isImported: false,
        initialLocation: "panel",
        isEmpty: false
      }
    }
  };

  db.prepare(`
    INSERT INTO ItemTable (key, value) VALUES (?, ?)
  `).run("chat.ChatSessionStore.index", JSON.stringify(index));

  db.close();
}

// Create test databases for existing fixture workspaces
if (require.main === module) {
  createTestStateDb("xyz987uvw654rst321");
  console.log("Test state.vscdb files created");
}
```

**NOTE:** Do NOT create a new session fixture. The existing fixture at `xyz987uvw654rst321/chatSessions/66666666-6666-6666-6666-666666666666.json` has the required tool result structure:
- `toolCallRounds` with tool calls having `id` field (e.g., `"toolu_001"`)
- `toolCallResults` keyed by those same IDs (e.g., `"toolu_001": { content: [...] }`)

This fixture demonstrates the correct ID matching pattern.

### 10. Tests (`test/lib/sqlite-state.test.ts`)

TDD Red tests for SQLite state database operations:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { copyFile, rm, stat } from "fs/promises";
import { VSCodeStateDb, ChatSessionIndexEntry } from "../../src/lib/sqlite-state.js";

const FIXTURES = join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");
// Use xyz987uvw654rst321 which has the existing fixture with tool results
const TEST_WORKSPACE = "xyz987uvw654rst321";

describe("VSCodeStateDb", () => {
  let db: VSCodeStateDb;
  let originalDbPath: string;
  let testDbPath: string;

  beforeAll(() => {
    originalDbPath = join(FIXTURES, TEST_WORKSPACE, "state.vscdb");
    testDbPath = originalDbPath; // Will be restored in afterEach
  });

  beforeEach(async () => {
    // Backup original test DB before each test
    await copyFile(originalDbPath, `${originalDbPath}.test-backup`).catch(() => {});
    db = new VSCodeStateDb(join(FIXTURES, TEST_WORKSPACE));
  });

  afterEach(async () => {
    // Restore original test DB after each test
    await copyFile(`${originalDbPath}.test-backup`, originalDbPath).catch(() => {});
    await rm(`${originalDbPath}.test-backup`).catch(() => {});
  });

  describe("getDbPath", () => {
    it("returns correct database path", () => {
      const expected = join(FIXTURES, TEST_WORKSPACE, "state.vscdb");
      expect(db.getDbPath()).toBe(expected);
    });
  });

  describe("backup", () => {
    it("creates timestamped backup file", async () => {
      const backupPath = await db.backup();

      expect(backupPath).toContain("state.vscdb.backup-");
      await expect(stat(backupPath)).resolves.toBeDefined();
    });

    it("keeps only 3 most recent backups", async () => {
      // Create 4 backups
      await db.backup();
      await new Promise(r => setTimeout(r, 10)); // Small delay for unique timestamps
      await db.backup();
      await new Promise(r => setTimeout(r, 10));
      await db.backup();
      await new Promise(r => setTimeout(r, 10));
      await db.backup();

      // Check that only 3 remain
      const { readdir } = await import("fs/promises");
      const files = await readdir(join(FIXTURES, TEST_WORKSPACE));
      const backups = files.filter(f => f.startsWith("state.vscdb.backup-"));
      expect(backups.length).toBeLessThanOrEqual(3);
    });
  });

  describe("readSessionIndex", () => {
    it("returns index with version and entries", () => {
      const index = db.readSessionIndex();

      expect(index).toHaveProperty("version");
      expect(index).toHaveProperty("entries");
      expect(typeof index.version).toBe("number");
      expect(typeof index.entries).toBe("object");
    });

    it("returns empty entries if key not found", () => {
      // Use a workspace without the index key
      const emptyDb = new VSCodeStateDb(join(FIXTURES, "emptysessions999"));
      const index = emptyDb.readSessionIndex();

      expect(index.version).toBe(1);
      expect(Object.keys(index.entries)).toHaveLength(0);
    });
  });

  describe("sessionExists", () => {
    it("returns true for existing session", () => {
      // Session added by fixture setup
      expect(db.sessionExists("existing-session-111")).toBe(true);
    });

    it("returns false for non-existent session", () => {
      expect(db.sessionExists("nonexistent-uuid")).toBe(false);
    });
  });

  describe("addSessionToIndex", () => {
    const newEntry: ChatSessionIndexEntry = {
      sessionId: "new-cloned-session",
      title: "Test Clone",
      lastMessageDate: Date.now(),
      isImported: false,
      initialLocation: "panel",
      isEmpty: false
    };

    it("adds session to index", () => {
      db.addSessionToIndex(newEntry);

      const index = db.readSessionIndex();
      expect(index.entries["new-cloned-session"]).toBeDefined();
      expect(index.entries["new-cloned-session"].title).toBe("Test Clone");
    });

    it("preserves existing sessions when adding new one", () => {
      db.addSessionToIndex(newEntry);

      const index = db.readSessionIndex();
      // Original session should still exist
      expect(index.entries["existing-session-111"]).toBeDefined();
      // New session should also exist
      expect(index.entries["new-cloned-session"]).toBeDefined();
    });

    it("overwrites session with same ID", () => {
      const updatedEntry = { ...newEntry, title: "Updated Title" };
      db.addSessionToIndex(newEntry);
      db.addSessionToIndex(updatedEntry);

      const index = db.readSessionIndex();
      expect(index.entries["new-cloned-session"].title).toBe("Updated Title");
    });
  });
});
```

### 11. Tests (`test/services/copilot-clone-write.test.ts`)

TDD Red tests for session write operations:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { copyFile, rm, readFile, stat, unlink } from "fs/promises";
import { CopilotCloneService } from "../../src/services/copilot-clone.js";
import { VSCodeStateDb } from "../../src/lib/sqlite-state.js";
import type { CopilotSession } from "../../src/sources/copilot-types.js";

const FIXTURES = join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");
// Use xyz987uvw654rst321 which has the existing fixture with tool results
const TEST_WORKSPACE = "xyz987uvw654rst321";

describe("CopilotCloneService.writeSession", () => {
  let service: CopilotCloneService;
  let originalDbPath: string;

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = FIXTURES;
    originalDbPath = join(FIXTURES, TEST_WORKSPACE, "state.vscdb");
  });

  afterAll(() => {
    delete process.env.VSCODE_STORAGE_PATH;
  });

  beforeEach(async () => {
    service = new CopilotCloneService();
    // Backup original test DB
    await copyFile(originalDbPath, `${originalDbPath}.test-backup`).catch(() => {});
  });

  afterEach(async () => {
    // Restore original test DB
    await copyFile(`${originalDbPath}.test-backup`, originalDbPath).catch(() => {});
    await rm(`${originalDbPath}.test-backup`).catch(() => {});

    // Clean up any written test sessions
    const sessionPath = join(FIXTURES, TEST_WORKSPACE, "chatSessions", "test-clone-id.json");
    await unlink(sessionPath).catch(() => {});
  });

  function createTestSession(sessionId: string): CopilotSession {
    return {
      version: 3,
      sessionId,
      creationDate: Date.now(),
      lastMessageDate: Date.now(),
      customTitle: "Test Clone Session",
      isImported: false,
      requests: [
        {
          requestId: "req_1",
          message: { text: "Test message", parts: [] },
          response: [{ value: "Test response" }],
          isCanceled: false,
          timestamp: Date.now()
        }
      ]
    };
  }

  it("writes session JSON to chatSessions folder", async () => {
    const session = createTestSession("test-clone-id");

    const { sessionPath } = await service.writeSession(session, TEST_WORKSPACE);

    const content = await readFile(sessionPath, "utf-8");
    const written = JSON.parse(content);
    expect(written.sessionId).toBe("test-clone-id");
    expect(written.customTitle).toBe("Test Clone Session");
  });

  it("adds entry to state.vscdb index", async () => {
    const session = createTestSession("test-clone-id");

    await service.writeSession(session, TEST_WORKSPACE);

    const db = new VSCodeStateDb(join(FIXTURES, TEST_WORKSPACE));
    const index = db.readSessionIndex();
    expect(index.entries["test-clone-id"]).toBeDefined();
    expect(index.entries["test-clone-id"].title).toBe("Test Clone Session");
  });

  it("creates backup before modifying database", async () => {
    const session = createTestSession("test-clone-id");

    const { backupPath } = await service.writeSession(session, TEST_WORKSPACE);

    expect(backupPath).toContain("state.vscdb.backup-");
    await expect(stat(backupPath)).resolves.toBeDefined();
  });

  it("cleans up session file if index update fails", async () => {
    // AC: Verify rollback cleanup - session file deleted if SQLite update fails
    // This test verifies that if addSessionToIndex throws, the session JSON
    // file that was written is cleaned up (deleted) to prevent orphan files.
    //
    // In Phase 1 (TDD-Red): This will ERROR because writeSession throws NotImplementedError
    // In Phase 2 (TDD-Green): Implementation should:
    //   1. Write session JSON file
    //   2. Try to update SQLite index
    //   3. If SQLite fails, delete the session JSON file
    //   4. Re-throw the error
    //
    // To properly test this in Phase 2, mock VSCodeStateDb.addSessionToIndex to throw,
    // then verify the session file does NOT exist after the error.
    const session = createTestSession("test-clone-id");

    await expect(service.writeSession(session, TEST_WORKSPACE))
      .rejects.toThrow(); // NotImplementedError in Phase 1
  });

  it("returns sessionPath and backupPath on success", async () => {
    const session = createTestSession("test-clone-id");

    const result = await service.writeSession(session, TEST_WORKSPACE);

    expect(result).toHaveProperty("sessionPath");
    expect(result).toHaveProperty("backupPath");
    expect(result.sessionPath).toContain("test-clone-id.json");
  });
});
```

### 12. Tests (`test/services/copilot-structure-tools.test.ts`)

TDD Red tests for tool result extraction (fixing the visualization bug):

**NOTE:** Uses the existing fixture at `xyz987uvw654rst321/66666666-6666-6666-6666-666666666666.json` which has tool results.

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { CopilotStructureService } from "../../src/services/copilot-structure.js";

const FIXTURES = join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");
// Use the existing fixture which has toolCallRounds and toolCallResults
const TEST_SESSION_ID = "66666666-6666-6666-6666-666666666666";
const TEST_WORKSPACE = "xyz987uvw654rst321";

describe("CopilotStructureService - Tool Result Extraction", () => {
  let service: CopilotStructureService;

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = FIXTURES;
    service = new CopilotStructureService();
  });

  afterAll(() => {
    delete process.env.VSCODE_STORAGE_PATH;
  });

  describe("extractToolCallResults", () => {
    it("extracts tool results from request metadata", async () => {
      // Session 66666666 has tool call results in metadata
      const response = await service.getTurns(TEST_SESSION_ID, TEST_WORKSPACE);

      const turn = response.turns[0];
      expect(turn.content.toolCalls.length).toBeGreaterThan(0);
    });

    it("includes tool result content in tool calls", async () => {
      const response = await service.getTurns(TEST_SESSION_ID, TEST_WORKSPACE);

      const turn = response.turns[0];
      const terminalTool = turn.content.toolCalls.find(t => t.toolName === "run_in_terminal");

      // Should have result content from toolCallResults
      expect(terminalTool).toBeDefined();
      // Result content should include terminal output
      expect(terminalTool?.resultContent).toContain("PASS");
    });
  });

  describe("calculateToolResultTokens", () => {
    it("includes tokens from tool call results", async () => {
      const structure = await service.getStructure(TEST_SESSION_ID, TEST_WORKSPACE);

      // Session with tool results should have significant token count
      // Terminal output + file contents = substantial tokens
      expect(structure.totalTokens).toBeGreaterThan(100);
    });

    it("accounts for tool results in cumulative totals", async () => {
      const response = await service.getTurns(TEST_SESSION_ID, TEST_WORKSPACE);

      const turn = response.turns[0];
      // Tool tokens should include results, not just invocation messages
      expect(turn.cumulative.tool).toBeGreaterThan(0);
    });
  });

  describe("getTurns with tool results", () => {
    it("includes tool call count matching response invocations", async () => {
      const response = await service.getTurns(TEST_SESSION_ID, TEST_WORKSPACE);

      // First turn has 1 tool invocation (run_in_terminal)
      const turn = response.turns[0];
      expect(turn.content.toolCalls.length).toBe(1);

      // Second turn has 1 tool invocation (copilot_readFile)
      const turn2 = response.turns[1];
      expect(turn2.content.toolCalls.length).toBe(1);
    });
  });
});
```

### 13. Tests (`test/routes/copilot-clone.test.ts`)

TDD Red tests for route behavior:

**NOTE:** Uses the existing fixture at `xyz987uvw654rst321` with session `66666666-6666-6666-6666-666666666666`.

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { app } from "../../src/server.js";

// Use the existing fixture workspace
const TEST_WORKSPACE = "xyz987uvw654rst321";
const TEST_SESSION = "66666666-6666-6666-6666-666666666666";

describe("POST /api/copilot/clone - Write Support", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = join(
      process.cwd(),
      "test/fixtures/copilot-sessions/workspaceStorage"
    );

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

  it("includes writtenToDisk in response", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: TEST_SESSION,
        workspaceHash: TEST_WORKSPACE,
        options: { writeToDisk: true }
      })
    });

    const data = await response.json();
    expect(data).toHaveProperty("writtenToDisk");
  });

  it("includes sessionPath when written to disk", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: TEST_SESSION,
        workspaceHash: TEST_WORKSPACE,
        options: { writeToDisk: true }
      })
    });

    const data = await response.json();
    if (data.writtenToDisk) {
      expect(data.sessionPath).toBeDefined();
      expect(data.backupPath).toBeDefined();
    }
  });

  it("supports targetWorkspaceHash option", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: TEST_SESSION,
        workspaceHash: TEST_WORKSPACE,
        options: {
          writeToDisk: true,
          targetWorkspaceHash: TEST_WORKSPACE
        }
      })
    });

    expect(response.status).toBeLessThan(500); // Should not crash
  });

  it("returns 409 when database is locked", async () => {
    // This test documents expected behavior
    // Full mock implementation would require holding a write lock on SQLite
    // which is complex to simulate in unit tests
    // Manual testing: run with VS Code open to verify 409 response
  });

  it("supports writeToDisk: false for download-only", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: TEST_SESSION,
        workspaceHash: TEST_WORKSPACE,
        options: { writeToDisk: false }
      })
    });

    const data = await response.json();
    expect(data.writtenToDisk).toBe(false);
    expect(data.sessionPath).toBeUndefined();
  });
});

describe("GET /api/copilot/workspaces", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = join(
      process.cwd(),
      "test/fixtures/copilot-sessions/workspaceStorage"
    );

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

  it("returns list of workspaces", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/workspaces`);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("workspaces");
    expect(Array.isArray(data.workspaces)).toBe(true);
  });

  it("includes folder and path for each workspace", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/workspaces`);

    const data = await response.json();
    if (data.workspaces.length > 0) {
      expect(data.workspaces[0]).toHaveProperty("folder");
      expect(data.workspaces[0]).toHaveProperty("path");
    }
  });
});
```

## Verification

After completing this phase:

```bash
# Install new dependencies
npm install better-sqlite3 && npm install -D @types/better-sqlite3

# Create test SQLite fixtures
npx tsx test/setup/create-copilot-state-db.ts

# Type check
npm run typecheck  # Must pass - no type errors

# Run tests
npm test           # Behavior tests ERROR (throw NotImplementedError)
```

Specifically:
- All existing tests still pass
- New tests ERROR because stubs throw NotImplementedError
- TypeScript compiles without errors
- New files created and properly exported

## Done When

- TypeScript compiles without errors
- All existing tests still pass
- New files created:
  - `src/schemas/copilot-clone.ts`
  - `src/lib/sqlite-state.ts`
  - `test/setup/create-copilot-state-db.ts`
  - `test/lib/sqlite-state.test.ts`
  - `test/services/copilot-clone-write.test.ts`
  - `test/services/copilot-structure-tools.test.ts`
  - `test/routes/copilot-clone.test.ts` (updated)
- SQLite test database created at `test/fixtures/copilot-sessions/workspaceStorage/xyz987uvw654rst321/state.vscdb`
- Updated files:
  - `src/services/copilot-clone.ts` (new method stubs, updated interfaces)
  - `src/services/copilot-structure.ts` (new method stubs)
  - `src/routes/copilot-clone.ts` (updated with new schema, 409 handling)
  - `src/sources/copilot-types.ts` (added result metadata types)
  - `public/js/pages/clone.js` (placeholder functions)
- Dependencies added: `better-sqlite3`, `@types/better-sqlite3`
- **Behavior tests ERROR** (stubs throw NotImplementedError) - THIS IS CORRECT TDD RED

| Test Category | Expected Result |
|---------------|-----------------|
| Existing tests | PASS |
| VSCodeStateDb tests | ERROR (NotImplementedError) |
| CopilotCloneService.writeSession tests | ERROR (NotImplementedError) |
| CopilotStructureService tool extraction tests | ERROR (NotImplementedError) |
| Route tests (writeToDisk, workspaces) | ERROR or 501 |

Implement the complete phase. Deliver working code with proper TypeScript types, not a plan.
```
