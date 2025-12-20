# Technical Implementation: Copilot Session Cloning

**Status:** Ready for Implementation
**Effort:** Medium (2-3 days)
**Date:** 2025-12-13

---

## 1. Executive Summary

This document specifies the implementation required to make Copilot session cloning fully functional. The key insight is that VS Code discovers sessions via a SQLite database index, not by scanning the filesystem. Our implementation must:

1. Write the cloned session JSON to `chatSessions/`
2. Update the `chat.ChatSessionStore.index` in `state.vscdb`
3. Provide workspace selection UI

**Validated:** SQLite read/write operations work on the VS Code database. No locking issues observed when VS Code is closed.

---

## 2. SQLite Operations

### 2.1 Database Location

```
~/Library/Application Support/Code/User/workspaceStorage/<hash>/state.vscdb
```

Platform paths defined in existing `getVSCodeStoragePath()` function in `src/sources/copilot-source.ts`.

### 2.2 Table Structure

```sql
CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);
```

Single table, key-value store. The `value` column stores JSON as text.

### 2.3 Read Current Index

```sql
SELECT value FROM ItemTable WHERE key = 'chat.ChatSessionStore.index';
```

Returns JSON:
```json
{
  "version": 1,
  "entries": {
    "<session-uuid>": {
      "sessionId": "<session-uuid>",
      "title": "Session title here",
      "lastMessageDate": 1765639846678,
      "isImported": false,
      "initialLocation": "panel",
      "isEmpty": false
    }
  }
}
```

### 2.4 Update Index with New Entry

```sql
UPDATE ItemTable
SET value = '<updated-json>'
WHERE key = 'chat.ChatSessionStore.index';
```

**Important:** The entire JSON value is replaced. Must:
1. Read current value
2. Parse as JSON
3. Add new entry to `entries` object
4. Serialize back to JSON
5. Update in database

### 2.5 Index Entry Schema

Required fields for a new session entry:

```typescript
interface ChatSessionIndexEntry {
  sessionId: string;           // UUID matching the JSON filename
  title: string;               // Display name in sidebar
  lastMessageDate: number;     // Unix timestamp (ms) - for sorting
  isImported: boolean;         // Set to false for clones
  initialLocation: "panel" | "editor";
  isEmpty: boolean;            // true if requests.length === 0
}
```

### 2.6 Locking Considerations

**Testing confirmed:** SQLite reads/writes work when VS Code is closed. When VS Code is running, the database may be locked.

**Implementation approach:**
1. Attempt write operation
2. If `SQLITE_BUSY` error, return user-friendly error asking to close VS Code
3. No need for complex retry logic - just fail fast with clear message

### 2.7 Backup Strategy

Before any write operation:
```typescript
// Create timestamped backup
const backupPath = `${dbPath}.backup-${Date.now()}`;
await copyFile(dbPath, backupPath);
```

Cleanup: Keep only last 3 backups per workspace.

---

## 3. File System Operations

### 3.1 Platform Paths

Already implemented in `src/sources/copilot-source.ts`:

```typescript
export function getVSCodeStoragePath(): string {
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

### 3.2 Files to Write

For a clone to workspace `<hash>`:

| File | Content | Notes |
|------|---------|-------|
| `<hash>/chatSessions/<new-uuid>.json` | Session JSON | Full session with new sessionId |
| `<hash>/state.vscdb` | SQLite UPDATE | Add entry to index |

### 3.3 Directory Structure

```
workspaceStorage/<hash>/
  chatSessions/
    <existing-session>.json
    <new-clone-uuid>.json     <-- NEW FILE
  chatEditingSessions/        <-- NOT NEEDED for clone
  state.vscdb                 <-- UPDATE index key
  workspace.json              <-- READ ONLY (for path info)
```

### 3.4 File Permissions

Use default permissions (0o644 for files). The `writeFile` function handles this.

### 3.5 Directory Creation

The `chatSessions/` directory should already exist if the workspace has any sessions. If it doesn't exist:

```typescript
await mkdir(chatSessionsPath, { recursive: true });
```

---

## 4. Code Changes Required

### 4.1 Files to Modify

| File | Changes |
|------|---------|
| `src/services/copilot-clone.ts` | Add `writeSession()` method, SQLite operations |
| `src/routes/copilot-clone.ts` | Add `writeToDisk` option, update response |
| `src/sources/copilot-source.ts` | Add `getStateDbPath()` helper |
| `public/js/pages/clone.js` | Add workspace selector, update success UX |
| `package.json` | Add `better-sqlite3` dependency |

### 4.2 New Files to Create

| File | Purpose |
|------|---------|
| `src/lib/sqlite-state.ts` | VS Code state.vscdb operations |
| `src/schemas/copilot-clone.ts` | Zod schemas for Copilot clone |

### 4.3 Dependencies

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

**Why better-sqlite3:**
- Synchronous API (simpler code)
- Well-maintained, popular
- Works with VS Code's SQLite format
- No native compilation issues on common platforms

---

## 5. Service Implementation

### 5.1 SQLite State Service

**File:** `src/lib/sqlite-state.ts`

```typescript
import Database from "better-sqlite3";
import { copyFile, unlink, readdir } from "fs/promises";
import { join, dirname } from "path";

export interface ChatSessionIndexEntry {
  sessionId: string;
  title: string;
  lastMessageDate: number;
  isImported: boolean;
  initialLocation: "panel" | "editor";
  isEmpty: boolean;
}

export interface ChatSessionIndex {
  version: number;
  entries: Record<string, ChatSessionIndexEntry>;
}

export class VSCodeStateDb {
  private dbPath: string;

  constructor(workspacePath: string) {
    this.dbPath = join(workspacePath, "state.vscdb");
  }

  /**
   * Create a backup of the database before modifications.
   * Returns backup path.
   */
  async backup(): Promise<string> {
    const backupPath = `${this.dbPath}.backup-${Date.now()}`;
    await copyFile(this.dbPath, backupPath);
    await this.cleanupOldBackups();
    return backupPath;
  }

  /**
   * Keep only the 3 most recent backups.
   */
  private async cleanupOldBackups(): Promise<void> {
    const dir = dirname(this.dbPath);
    const files = await readdir(dir);
    const backups = files
      .filter(f => f.startsWith("state.vscdb.backup-"))
      .map(f => ({ name: f, time: parseInt(f.split("-")[1]) }))
      .sort((a, b) => b.time - a.time);

    // Delete all but the 3 most recent
    for (const backup of backups.slice(3)) {
      await unlink(join(dir, backup.name)).catch(() => {});
    }
  }

  /**
   * Read the current session index.
   */
  readSessionIndex(): ChatSessionIndex {
    const db = new Database(this.dbPath, { readonly: true });
    try {
      const row = db.prepare(
        "SELECT value FROM ItemTable WHERE key = 'chat.ChatSessionStore.index'"
      ).get() as { value: string } | undefined;

      if (!row) {
        return { version: 1, entries: {} };
      }
      return JSON.parse(row.value) as ChatSessionIndex;
    } finally {
      db.close();
    }
  }

  /**
   * Add a new session to the index.
   * Throws if database is locked.
   */
  addSessionToIndex(entry: ChatSessionIndexEntry): void {
    const db = new Database(this.dbPath);
    try {
      // Read current index
      const row = db.prepare(
        "SELECT value FROM ItemTable WHERE key = 'chat.ChatSessionStore.index'"
      ).get() as { value: string } | undefined;

      const index: ChatSessionIndex = row
        ? JSON.parse(row.value)
        : { version: 1, entries: {} };

      // Add new entry
      index.entries[entry.sessionId] = entry;

      // Write back
      db.prepare(
        "UPDATE ItemTable SET value = ? WHERE key = 'chat.ChatSessionStore.index'"
      ).run(JSON.stringify(index));
    } finally {
      db.close();
    }
  }
}
```

### 5.2 Updated Copilot Clone Service

**File:** `src/services/copilot-clone.ts` (additions)

```typescript
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { getVSCodeStoragePath } from "../sources/copilot-source.js";
import { VSCodeStateDb, ChatSessionIndexEntry } from "../lib/sqlite-state.js";

// Add to CopilotCloneService class:

/**
 * Write cloned session to VS Code storage.
 * This makes the session appear in VS Code's Copilot Chat.
 */
async writeSession(
  session: CopilotSession,
  targetWorkspaceHash: string
): Promise<{ sessionPath: string; backupPath: string }> {
  const storagePath = getVSCodeStoragePath();
  const workspacePath = join(storagePath, targetWorkspaceHash);
  const chatSessionsPath = join(workspacePath, "chatSessions");
  const sessionPath = join(chatSessionsPath, `${session.sessionId}.json`);

  // Ensure chatSessions directory exists
  await mkdir(chatSessionsPath, { recursive: true });

  // Backup state.vscdb before modifications
  const stateDb = new VSCodeStateDb(workspacePath);
  const backupPath = await stateDb.backup();

  // Write session JSON
  const sessionJson = JSON.stringify(session, null, 2);
  await writeFile(sessionPath, sessionJson, "utf-8");

  // Update index in state.vscdb
  const indexEntry: ChatSessionIndexEntry = {
    sessionId: session.sessionId,
    title: session.customTitle || "Cloned Session",
    lastMessageDate: session.lastMessageDate,
    isImported: false,
    initialLocation: "panel",
    isEmpty: session.requests.length === 0,
  };

  try {
    stateDb.addSessionToIndex(indexEntry);
  } catch (error) {
    // If SQLite fails (e.g., VS Code has it locked), clean up
    await unlink(sessionPath).catch(() => {});

    if ((error as Error).message?.includes("SQLITE_BUSY")) {
      throw new Error(
        "Cannot write to VS Code database - please close VS Code and try again"
      );
    }
    throw error;
  }

  return { sessionPath, backupPath };
}

// Update clone() method signature:

async clone(
  sessionId: string,
  workspaceHash: string,
  options: CopilotCloneOptions = {}
): Promise<CopilotCloneResult> {
  // ... existing clone logic ...

  // NEW: Write to disk if requested
  if (options.writeToDisk !== false) {
    const targetWorkspace = options.targetWorkspaceHash || workspaceHash;
    const { sessionPath, backupPath } = await this.writeSession(
      clonedSession,
      targetWorkspace
    );
    return {
      session: clonedSession,
      stats,
      sessionPath,
      backupPath,
      writtenToDisk: true,
    };
  }

  return { session: clonedSession, stats, writtenToDisk: false };
}
```

### 5.3 Updated Options Interface

```typescript
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

export interface CopilotCloneResult {
  session: CopilotSession;
  stats: CopilotCloneStats;
  sessionPath?: string;
  backupPath?: string;
  writtenToDisk: boolean;
}
```

---

## 6. Route/API Changes

### 6.1 Updated Request Schema

**File:** `src/schemas/copilot-clone.ts` (new file)

```typescript
import { z } from "zod";

export const CopilotCloneRequestSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID format"),
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

### 6.2 Updated Route Handler

**File:** `src/routes/copilot-clone.ts`

```typescript
import { Router } from "express";
import validate from "express-zod-safe";
import { CopilotCloneRequestSchema } from "../schemas/copilot-clone.js";
import { copilotCloneService } from "../services/copilot-clone.js";

export const copilotCloneRouter = Router();

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

      if (err.message?.includes("ENOENT")) {
        return res.status(404).json({
          error: { message: "Session not found", code: "NOT_FOUND" }
        });
      }

      if (err.message?.includes("close VS Code")) {
        return res.status(409).json({
          error: {
            message: err.message,
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
```

### 6.3 New Endpoint: List Workspaces

Add a helper endpoint to get available target workspaces:

```typescript
// GET /api/copilot/workspaces
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

---

## 7. Frontend Changes

### 7.1 Clone Page Updates

**File:** `public/js/pages/clone.js`

Add workspace selector for Copilot sessions:

```javascript
// After source is resolved as "copilot", show workspace selector
async function showWorkspaceSelector() {
  const selectorDiv = document.getElementById("workspace-selector");
  if (!selectorDiv) return;

  try {
    const response = await fetch("/api/copilot/workspaces");
    const { workspaces } = await response.json();

    if (workspaces.length === 0) {
      selectorDiv.innerHTML = '<p class="text-red-600">No workspaces found</p>';
      return;
    }

    const options = workspaces.map(w =>
      `<option value="${w.folder}">${w.path}</option>`
    ).join("");

    selectorDiv.innerHTML = `
      <label class="block text-sm font-medium text-gray-700 mb-1">
        Target Workspace
      </label>
      <select id="target-workspace"
              class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500">
        <option value="">Same as source</option>
        ${options}
      </select>
      <p class="text-sm text-gray-500 mt-1">
        Choose where to save the cloned session
      </p>
    `;
    selectorDiv.classList.remove("hidden");
  } catch (error) {
    console.error("Failed to load workspaces:", error);
  }
}
```

### 7.2 Updated Success Message

Replace the fake import instructions with actual success feedback:

```javascript
if (resolvedSource === "copilot") {
  if (result.writtenToDisk) {
    // Session was written - it will appear in VS Code
    command = `Session cloned successfully!

The cloned session will appear in VS Code's Copilot Chat
when you open: ${result.sessionPath?.split("/").slice(-3).join("/")}

Session ID: ${result.session.sessionId}`;

    // Show restart hint if VS Code might be running
    showRestartHint();
  } else {
    // Fallback: JSON download only
    command = `Session cloned (download only - VS Code write failed)`;
    showCopilotDownload(result.session, newSessionId);
  }
}
```

### 7.3 VS Code Restart Hint

```javascript
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
```

### 7.4 Error Handling for Locked Database

```javascript
if (response.status === 409) {
  // VS Code has the database locked
  const error = await response.json();
  showError(containers.error,
    "Cannot clone while VS Code is running. Please close VS Code and try again."
  );
  return;
}
```

---

## 8. Testing Strategy

### 8.1 Test Fixtures

Create a mock VS Code workspace structure in `test/fixtures/`:

```
test/fixtures/copilot-sessions/workspaceStorage/
  test-workspace-hash/
    workspace.json
    state.vscdb           <-- Create with known test data
    chatSessions/
      existing-session.json
```

### 8.2 SQLite Test Fixture

Create `test/fixtures/copilot-sessions/workspaceStorage/test-workspace-hash/state.vscdb`:

```javascript
// test/setup/create-test-db.ts
import Database from "better-sqlite3";

const db = new Database("test/fixtures/.../state.vscdb");
db.exec(`
  CREATE TABLE IF NOT EXISTS ItemTable (
    key TEXT UNIQUE ON CONFLICT REPLACE,
    value BLOB
  )
`);
db.prepare(`
  INSERT INTO ItemTable (key, value) VALUES (?, ?)
`).run(
  "chat.ChatSessionStore.index",
  JSON.stringify({
    version: 1,
    entries: {
      "existing-session": {
        sessionId: "existing-session",
        title: "Test Session",
        lastMessageDate: Date.now(),
        isImported: false,
        initialLocation: "panel",
        isEmpty: false
      }
    }
  })
);
db.close();
```

### 8.3 Unit Tests

**File:** `test/services/copilot-clone.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CopilotCloneService } from "../../src/services/copilot-clone.js";
import { VSCodeStateDb } from "../../src/lib/sqlite-state.js";
import { copyFile, rm, readFile } from "fs/promises";
import { join } from "path";

const FIXTURES = "test/fixtures/copilot-sessions/workspaceStorage";
const WORKSPACE = "test-workspace-hash";

describe("CopilotCloneService.writeSession", () => {
  let service: CopilotCloneService;
  let originalDb: string;

  beforeEach(async () => {
    service = new CopilotCloneService();
    // Backup original test DB
    originalDb = join(FIXTURES, WORKSPACE, "state.vscdb");
    await copyFile(originalDb, `${originalDb}.test-backup`);
  });

  afterEach(async () => {
    // Restore original test DB
    await copyFile(`${originalDb}.test-backup`, originalDb);
    await rm(`${originalDb}.test-backup`);
  });

  it("writes session JSON to chatSessions folder", async () => {
    const session = createTestSession("new-clone-id");

    const { sessionPath } = await service.writeSession(session, WORKSPACE);

    const content = await readFile(sessionPath, "utf-8");
    const written = JSON.parse(content);
    expect(written.sessionId).toBe("new-clone-id");
  });

  it("adds entry to state.vscdb index", async () => {
    const session = createTestSession("new-clone-id");

    await service.writeSession(session, WORKSPACE);

    const db = new VSCodeStateDb(join(FIXTURES, WORKSPACE));
    const index = db.readSessionIndex();
    expect(index.entries["new-clone-id"]).toBeDefined();
    expect(index.entries["new-clone-id"].title).toBe(session.customTitle);
  });

  it("creates backup before modifying database", async () => {
    const session = createTestSession("new-clone-id");

    const { backupPath } = await service.writeSession(session, WORKSPACE);

    expect(backupPath).toContain("state.vscdb.backup-");
    // Backup should exist
    await expect(stat(backupPath)).resolves.toBeDefined();
  });
});
```

### 8.4 Integration Tests

```typescript
describe("POST /api/copilot/clone", () => {
  it("returns 409 when VS Code database is locked", async () => {
    // This would require actually locking the DB - may need to mock
  });

  it("writes session and updates index on success", async () => {
    const response = await request(app)
      .post("/api/copilot/clone")
      .send({
        sessionId: "existing-session",
        workspaceHash: WORKSPACE,
        options: { writeToDisk: true }
      });

    expect(response.status).toBe(200);
    expect(response.body.writtenToDisk).toBe(true);
    expect(response.body.sessionPath).toBeDefined();
  });
});
```

### 8.5 Manual Testing Checklist

```
[ ] Clone Copilot session with VS Code closed
[ ] Verify cloned session appears in VS Code after opening
[ ] Clone with VS Code open - verify friendly error message
[ ] Clone to different workspace
[ ] Verify backup file created
[ ] Verify old backups cleaned up (keep only 3)
[ ] Test on macOS
[ ] Test on Linux (if available)
[ ] Test on Windows (if available)
```

---

## 9. Implementation Sequence

### Phase 1: Core Infrastructure (Day 1)

1. Add `better-sqlite3` dependency
2. Create `src/lib/sqlite-state.ts`
3. Create `src/schemas/copilot-clone.ts`
4. Write unit tests for `VSCodeStateDb`

### Phase 2: Service Updates (Day 1-2)

1. Add `writeSession()` to `CopilotCloneService`
2. Update `clone()` method signature
3. Add error handling for locked database
4. Write unit tests for clone with write

### Phase 3: API Updates (Day 2)

1. Update route handler with new schema
2. Add `/api/copilot/workspaces` endpoint
3. Add 409 status handling
4. Write integration tests

### Phase 4: Frontend Updates (Day 2-3)

1. Add workspace selector UI
2. Update success messaging
3. Add VS Code restart hint
4. Remove fake import instructions
5. Handle 409 error gracefully

### Phase 5: Testing & Polish (Day 3)

1. Manual testing on all platforms
2. Fix any issues discovered
3. Update documentation
4. Create test fixtures for SQLite

---

## 10. Rollback Plan

If issues arise after deployment:

1. **Immediate:** Set `writeToDisk: false` as default in schema
2. **Short-term:** Revert to download-only mode via feature flag
3. **Database corruption:** Restore from auto-backup files

---

## 11. Success Criteria

1. Cloned sessions appear in VS Code's Copilot Chat sidebar
2. No data corruption of existing sessions
3. Clear error message when VS Code is running
4. Backup created before every write
5. Cross-platform support (macOS, Linux, Windows)
