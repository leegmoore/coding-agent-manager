```prompt
# Phase 2: Session Source Implementation + TDD Green (Claude Opus 4.5)

## Objective

Make all failing Phase 1 tests pass by implementing real logic in the ClaudeSessionSource and utility functions. The tests assert actual expected behavior - your implementation must satisfy those assertions.

## Current State

- Tests in `test/session-browser.test.ts` assert REAL behavior
- Tests fail because service functions throw `NotImplementedError`
- Your job: implement the functions so tests pass
- Do NOT modify test assertions - they define the spec

## Context for Your Approach

Read the test file first to understand exactly what behaviors are expected. The tests ARE the specification. Implement code that makes those specific assertions pass.

Key implementation details:
- Claude projects directory: `~/.claude/projects/` (or `$CLAUDE_DIR/projects/` for tests)
- Folder encoding: `/Users/lee/code` → `-Users-lee-code` (leading slash becomes dash, all slashes become dashes)
- Session files: `<uuid>.jsonl` containing JSONL entries
- First message: Extract from first `human` entry's content, truncate to ~100 chars

## Reference Files

Read these to understand context and existing utilities:
- `test/session-browser.test.ts` - **THE SPEC** - tests define expected behavior
- `test/fixtures/session-browser/` - test fixture data
- `src/services/session-clone.ts` - `parseSession`, `identifyTurns` (reuse these!)
- `src/sources/claude-source.ts` - stubs to implement

## Implementation Guide

### decodeFolderName(encoded: string): string

```typescript
// -Users-lee-code → /Users/lee/code
// Replace leading dash with /, then all dashes with /
export function decodeFolderName(encoded: string): string {
  return encoded.replace(/^-/, "/").replace(/-/g, "/");
}
```

### encodeFolderPath(path: string): string

```typescript
// /Users/lee/code → -Users-lee-code
// Replace all slashes with dashes
export function encodeFolderPath(path: string): string {
  return path.replace(/\//g, "-");
}
```

### truncateMessage(text: string, maxLength: number): string

```typescript
export function truncateMessage(text: string, maxLength: number): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength - 3) + "...";
}
```

### ClaudeSessionSource.isAvailable()

**File imports:** Add all these imports at the top of `claude-source.ts`. The `stat` function is used by both `isAvailable()` and `parseSessionSummary()`.

```typescript
// Top of claude-source.ts
import { stat, readdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

const CLAUDE_PROJECTS_DIR = process.env.CLAUDE_DIR 
  ? join(process.env.CLAUDE_DIR, "projects")
  : join(homedir(), ".claude", "projects");

async isAvailable(): Promise<boolean> {
  try {
    const stats = await stat(CLAUDE_PROJECTS_DIR);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
```

### ClaudeSessionSource.listProjects()

**Note:** The router should call `isAvailable()` before `listProjects()` to handle missing directory gracefully. If called directly on missing dir, `readdir` throws ENOENT.

```typescript
import { readdir } from "fs/promises";

async listProjects(): Promise<ProjectInfo[]> {
  // Assumes isAvailable() was called first by router
  // If CLAUDE_PROJECTS_DIR doesn't exist, this throws ENOENT
  const entries = await readdir(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
  
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => ({
      folder: entry.name,
      path: decodeFolderName(entry.name)
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
```

### ClaudeSessionSource.listSessions(folder: string)

```typescript
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
  
  // Sort by lastModifiedAt descending (most recent first)
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
```

### extractMetadata - Efficient Streaming

Use readline for efficient extraction without loading entire file.

**Note:** This is a private method inside the `ClaudeSessionSource` class. Add these imports at the top of `claude-source.ts`:

```typescript
// Add to imports at top of claude-source.ts
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { identifyTurns } from "../services/session-clone.js";  // Only need identifyTurns, not parseSession
import type { SessionEntry } from "../types.js";

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
  const entries: SessionEntry[] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    
    try {
      const entry = JSON.parse(line) as SessionEntry;
      entries.push(entry);
      
      // Capture first user message (entry.type is "user" not "human" - see session-clone.ts)
      if (!foundFirstMessage && entry.type === "user") {
        const content = entry.message?.content;
        if (content) {
          const text = typeof content === "string"
            ? content
            : Array.isArray(content)
              ? content.find(b => b.type === "text")?.text || ""
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
  // identifyTurns returns Turn[] with startIndex/endIndex - we only need the count
  const turns = identifyTurns(entries);
  turnCount = turns.length;

  return { firstMessage, turnCount };
}
```

## Router Implementation

**Replace the stub route handlers** in `src/routes/session-browser.ts` with real implementations.

Phase 1 created placeholder handlers. Now replace them with these working versions:

```typescript
// Update imports at top of file
import { getSessionSource, decodeFolderName } from "../sources/index.js";

router.get("/api/projects", async (req, res) => {
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

router.get("/api/projects/:folder/sessions", async (req, res) => {
  try {
    const { folder } = req.params;
    const source = getSessionSource("claude");
    
    const sessions = await source.listSessions(folder);
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
});
```

## Test Environment Setup

Tests should set `CLAUDE_DIR` to point to fixtures.

**Path calculation:** The implementation uses `join(process.env.CLAUDE_DIR, "projects")` to form `CLAUDE_PROJECTS_DIR`. So:
- Test sets: `CLAUDE_DIR = test/fixtures/session-browser`
- Implementation reads from: `test/fixtures/session-browser/projects/`
- Fixture structure must have `projects/` subdirectory containing encoded folder names

```typescript
beforeAll(() => {
  // This points to fixture ROOT - implementation appends /projects
  process.env.CLAUDE_DIR = path.join(process.cwd(), "test/fixtures/session-browser");
});

afterAll(() => {
  delete process.env.CLAUDE_DIR;
});
```

## Verification

After completing this phase:

```bash
npm run typecheck  # Must pass
npm test           # All session-browser tests pass
```

Manually verify:
```bash
curl http://localhost:3000/api/projects
curl http://localhost:3000/api/projects/-Users-test-project-alpha/sessions
```

## Edge Cases to Handle

Add tests and handle these edge cases:

| Case | Expected Behavior |
|------|-------------------|
| Empty projects directory | `listProjects()` returns `[]` |
| Empty project folder | `listSessions()` returns `[]` |
| Session with no human entries | `firstMessage` = "(No user message)" |
| Malformed JSONL lines | Skip silently, don't crash |
| Non-existent folder | Throw error (router returns 404) |
| Very long first message | Truncated to 100 chars with "..." |

## Done When

- All Phase 1 tests pass (no more NotImplementedError)
- Edge case tests added and passing
- All pre-existing tests still pass
- `GET /api/projects` returns project list with folder and path
- `GET /api/projects/:folder/sessions` returns session list with metadata
- Sessions sorted by lastModifiedAt descending
- `curl` commands return expected JSON

| Test Category | Expected Result |
|---------------|-----------------|
| Existing tests | PASS |
| decodeFolderName tests | PASS |
| encodeFolderPath tests | PASS |
| truncateMessage tests | PASS |
| ClaudeSessionSource.isAvailable tests | PASS |
| ClaudeSessionSource.listProjects tests | PASS |
| ClaudeSessionSource.listSessions tests | PASS |
| Edge case tests | PASS |
| Router endpoints | PASS |

Implement the complete phase. Deliver working code, not a plan.
```
