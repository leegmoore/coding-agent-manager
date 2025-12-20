```prompt
# Phase 1: Session Source API + TDD Red (Claude Opus 4.5)

## Objective

Create the SessionSource abstraction layer and API skeleton for the Session Browser: interfaces, types, service stubs, router, EJS template placeholder, and **TDD Red tests that assert REAL behavior and will ERROR** because stubs throw `NotImplementedError`.

TDD Red means tests assert real expected behavior. Tests ERROR (throw) because stubs throw `NotImplementedError`. When Phase 2 implements real logic, these same tests will PASS.

## Context for Your Approach

You are implementing a session browser that lists Claude Code sessions by project folder. The abstraction layer (`SessionSource`) enables future support for GitHub Copilot and other session formats.

Key behaviors to understand before coding:
- Claude stores sessions in `~/.claude/projects/<encoded-path>/<uuid>.jsonl`
- Encoded paths replace `/` with `-`: `/Users/lee/code` → `-Users-lee-code`
- Decoding is lossy for paths containing dashes (e.g., `/Users/lee/my-app` → `-Users-lee-my-app`)
- Each JSONL file contains session entries (human, assistant, summary, etc.)

## Constraints

- All service functions throw `NotImplementedError` - no real logic yet
- Schemas inline in router file using `express-zod-safe` (follow existing `src/routes/session-structure.ts` pattern)
- Types in `src/types.ts`
- Tests assert REAL behavior (return values, structures) - they will ERROR when stubs throw
- Use existing error classes from `src/errors.ts` (verify `NotImplementedError` exists)
- Will reuse `parseSession`, `identifyTurns` from `src/services/session-clone.ts` in Phase 2

## Reference Files

Read these files to understand existing patterns before writing code:
- `src/routes/session-structure.ts` - router pattern with `express-zod-safe` validate middleware
- `src/services/session-clone.ts` - `findSessionFile`, `parseSession`, `identifyTurns`
- `src/types.ts` - existing type definitions
- `src/errors.ts` - existing error classes (confirm `NotImplementedError` exists)
- `src/server.ts` - current server setup and route registration
- `docs/projects/008-session-browser/02-session-browser.tech-design.md` - full technical design

## Deliverables

### 1. Types (`src/types.ts`)

Add these types to the existing file:

```typescript
export interface ProjectInfo {
  /** Encoded folder name (filesystem safe) */
  folder: string;
  /** Human-readable decoded path (best-effort, may be incorrect for paths with dashes) */
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

export interface ProjectsResponse {
  projects: ProjectInfo[];
}

export interface SessionsResponse {
  folder: string;
  path: string;
  sessions: SessionSummary[];
}
```

### 2. SessionSource Interface (`src/sources/types.ts`)

Create new `src/sources/` directory and interface file:

```typescript
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
}
```

### 3. Claude Source Stub + Utility Functions (`src/sources/claude-source.ts`)

All methods and functions throw `NotImplementedError`:

```typescript
import { NotImplementedError } from "../errors.js";
import type { SessionSource } from "./types.js";
import type { ProjectInfo, SessionSummary } from "../types.js";

/**
 * Decode Claude's folder encoding back to a path.
 * Replaces leading dash with /, then all remaining dashes with /.
 * NOTE: This is lossy for paths containing dashes in folder names.
 */
export function decodeFolderName(encoded: string): string {
  throw new NotImplementedError("decodeFolderName");
}

/**
 * Encode a path for Claude's folder naming scheme.
 * Replaces all / with -
 */
export function encodeFolderPath(path: string): string {
  throw new NotImplementedError("encodeFolderPath");
}

/**
 * Truncate a message to maxLength, adding ellipsis if truncated.
 * Also normalizes whitespace.
 */
export function truncateMessage(text: string, maxLength: number): string {
  throw new NotImplementedError("truncateMessage");
}

export class ClaudeSessionSource implements SessionSource {
  readonly sourceType = "claude" as const;

  async isAvailable(): Promise<boolean> {
    throw new NotImplementedError("ClaudeSessionSource.isAvailable");
  }

  async listProjects(): Promise<ProjectInfo[]> {
    throw new NotImplementedError("ClaudeSessionSource.listProjects");
  }

  async listSessions(folder: string): Promise<SessionSummary[]> {
    throw new NotImplementedError("ClaudeSessionSource.listSessions");
  }
}
```

### 4. Source Factory (`src/sources/index.ts`)

```typescript
import type { SessionSource } from "./types.js";
import { ClaudeSessionSource } from "./claude-source.js";

export function getSessionSource(type: "claude" | "copilot" = "claude"): SessionSource {
  if (type === "claude") {
    return new ClaudeSessionSource();
  }
  throw new Error(`Unsupported session source: ${type}`);
}

export type { SessionSource } from "./types.js";
export { ClaudeSessionSource, decodeFolderName, encodeFolderPath, truncateMessage } from "./claude-source.js";
```

### 5. Router (`src/routes/session-browser.ts`)

Create router following the `express-zod-safe` pattern from `session-structure.ts`:

```typescript
import { Router } from "express";
import validate from "express-zod-safe";
import { z } from "zod";
import { getSessionSource, decodeFolderName } from "../sources/index.js";

export const sessionBrowserRouter = Router();

// Schema for folder param validation
const FolderParamsSchema = z.object({
  folder: z.string().min(1, "Folder name is required")
});

// GET / - Render session browser page (home)
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
```

### 6. EJS Template Placeholder (`views/pages/session-browser.ejs`)

Create a minimal placeholder template so the router doesn't error:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Browser - Coding Agent Manager</title>
  <link href="/css/styles.css" rel="stylesheet">
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-6">Session Browser</h1>
    <p class="text-gray-600">UI implementation coming in Phase 3.</p>
    
    <!-- Placeholder for project selector -->
    <div id="project-select-container" class="mb-6">
      <label class="block text-sm font-medium text-gray-700 mb-2">Project</label>
      <select id="project-select" class="w-full max-w-xl px-4 py-2 border rounded-lg" disabled>
        <option value="">Loading projects...</option>
      </select>
    </div>
    
    <!-- Placeholder for sessions table -->
    <div id="session-table-container" class="hidden">
      <p>Sessions will appear here.</p>
    </div>
  </div>
</body>
</html>
```

### 7. Server Updates (`src/server.ts`)

Update server to:
1. Import `sessionBrowserRouter`
2. Register it to handle `/` and `/session-clone`
3. Remove the existing `app.get("/", ...)` that renders clone page

Changes to make:

```typescript
// Add import
import { sessionBrowserRouter } from "./routes/session-browser.js";

// Replace this:
app.get("/", (req, res) => {
  res.render("pages/clone");
});

// With registration of session browser router (handles / and /session-clone)
app.use("/", sessionBrowserRouter);
```

The session browser router handles:
- `GET /` → renders session-browser.ejs
- `GET /session-clone` → renders clone.ejs
- `GET /api/projects` → lists projects
- `GET /api/projects/:folder/sessions` → lists sessions

### 8. Test Fixtures

Create `test/fixtures/session-browser/projects/` with folders that decode correctly:

```
test/fixtures/session-browser/
└── projects/
    ├── -Users-test-projectalpha/
    │   ├── 11111111-1111-1111-1111-111111111111.jsonl
    │   └── 22222222-2222-2222-2222-222222222222.jsonl
    └── -Users-test-projectbeta/
        └── 33333333-3333-3333-3333-333333333333.jsonl
```

**Note:** Fixture folder names use `projectalpha` and `projectbeta` (no dashes) to avoid decode ambiguity. They decode to `/Users/test/projectalpha` and `/Users/test/projectbeta`.

Each JSONL should have minimal content:

**11111111-1111-1111-1111-111111111111.jsonl:**
```jsonl
{"type":"summary","summary":"Test session alpha-1"}
{"type":"human","message":{"content":"Help me refactor the authentication module"}}
{"type":"assistant","message":{"content":"I'll help you refactor the authentication module."}}
{"type":"human","message":{"content":"Add JWT support"}}
{"type":"assistant","message":{"content":"I'll add JWT support to the authentication."}}
```

**22222222-2222-2222-2222-222222222222.jsonl:**
```jsonl
{"type":"summary","summary":"Test session alpha-2"}
{"type":"human","message":{"content":"Create a new React component for the dashboard"}}
{"type":"assistant","message":{"content":"I'll create the dashboard component."}}
```

**33333333-3333-3333-3333-333333333333.jsonl:**
```jsonl
{"type":"summary","summary":"Test session beta-1"}
{"type":"human","message":{"content":"Debug the API endpoint"}}
{"type":"assistant","message":{"content":"Let me investigate the API endpoint."}}
{"type":"human","message":{"content":"Check the error handling"}}
{"type":"assistant","message":{"content":"I'll review the error handling."}}
{"type":"human","message":{"content":"Add logging"}}
{"type":"assistant","message":{"content":"Adding logging now."}}
```

### 9. Tests (`test/session-browser.test.ts`)

Tests assert REAL behavior. They will ERROR (throw `NotImplementedError`) until Phase 2 implements the logic.

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { 
  ClaudeSessionSource, 
  decodeFolderName, 
  encodeFolderPath, 
  truncateMessage 
} from "../src/sources/claude-source.js";

describe("Session Browser", () => {
  describe("Utility Functions", () => {
    describe("decodeFolderName", () => {
      it("decodes simple path", () => {
        expect(decodeFolderName("-Users-lee-code")).toBe("/Users/lee/code");
      });

      it("decodes nested path", () => {
        expect(decodeFolderName("-home-dev-projects-myapp")).toBe("/home/dev/projects/myapp");
      });

      it("handles single segment", () => {
        expect(decodeFolderName("-tmp")).toBe("/tmp");
      });
    });

    describe("encodeFolderPath", () => {
      it("encodes simple path", () => {
        expect(encodeFolderPath("/Users/lee/code")).toBe("-Users-lee-code");
      });

      it("encodes path with trailing slash", () => {
        expect(encodeFolderPath("/Users/lee/code/")).toBe("-Users-lee-code-");
      });
    });

    describe("truncateMessage", () => {
      it("returns short messages unchanged", () => {
        expect(truncateMessage("short message", 100)).toBe("short message");
      });

      it("truncates long messages with ellipsis", () => {
        const long = "a".repeat(150);
        expect(truncateMessage(long, 100)).toBe("a".repeat(97) + "...");
      });

      it("trims whitespace", () => {
        expect(truncateMessage("  spaces  ", 100)).toBe("spaces");
      });

      it("normalizes internal whitespace", () => {
        expect(truncateMessage("hello    world", 100)).toBe("hello world");
      });

      it("handles exact length", () => {
        const exact = "a".repeat(100);
        expect(truncateMessage(exact, 100)).toBe(exact);
      });
    });
  });

  describe("ClaudeSessionSource", () => {
    let source: ClaudeSessionSource;
    
    beforeAll(() => {
      process.env.CLAUDE_DIR = path.join(process.cwd(), "test/fixtures/session-browser");
      source = new ClaudeSessionSource();
    });

    afterAll(() => {
      delete process.env.CLAUDE_DIR;
    });

    describe("isAvailable", () => {
      it("returns true when projects directory exists", async () => {
        expect(await source.isAvailable()).toBe(true);
      });
    });

    describe("listProjects", () => {
      it("returns list of project folders", async () => {
        const projects = await source.listProjects();
        expect(projects).toHaveLength(2);
      });

      it("includes folder and path properties", async () => {
        const projects = await source.listProjects();
        expect(projects[0]).toHaveProperty("folder");
        expect(projects[0]).toHaveProperty("path");
      });

      it("decodes folder names to paths", async () => {
        const projects = await source.listProjects();
        const alpha = projects.find(p => p.folder === "-Users-test-projectalpha");
        expect(alpha?.path).toBe("/Users/test/projectalpha");
      });

      it("sorts projects alphabetically by path", async () => {
        const projects = await source.listProjects();
        const paths = projects.map(p => p.path);
        expect(paths).toEqual([...paths].sort());
      });
    });

    describe("listSessions", () => {
      it("returns sessions for valid project", async () => {
        const sessions = await source.listSessions("-Users-test-projectalpha");
        expect(sessions).toHaveLength(2);
      });

      it("includes required session properties", async () => {
        const sessions = await source.listSessions("-Users-test-projectalpha");
        const session = sessions[0];
        
        expect(session).toHaveProperty("sessionId");
        expect(session).toHaveProperty("source", "claude");
        expect(session).toHaveProperty("projectPath");
        expect(session).toHaveProperty("firstMessage");
        expect(session).toHaveProperty("createdAt");
        expect(session).toHaveProperty("lastModifiedAt");
        expect(session).toHaveProperty("sizeBytes");
        expect(session).toHaveProperty("turnCount");
      });

      it("extracts first user message", async () => {
        const sessions = await source.listSessions("-Users-test-projectalpha");
        const session = sessions.find(s => s.sessionId === "11111111-1111-1111-1111-111111111111");
        expect(session?.firstMessage).toContain("refactor");
      });

      it("counts turns correctly", async () => {
        const sessions = await source.listSessions("-Users-test-projectbeta");
        const session = sessions.find(s => s.sessionId === "33333333-3333-3333-3333-333333333333");
        expect(session?.turnCount).toBe(3); // 3 human messages = 3 turns
      });

      it("sorts sessions by lastModifiedAt descending", async () => {
        const sessions = await source.listSessions("-Users-test-projectalpha");
        if (sessions.length >= 2) {
          expect(sessions[0].lastModifiedAt.getTime())
            .toBeGreaterThanOrEqual(sessions[1].lastModifiedAt.getTime());
        }
      });

      it("throws ENOENT for non-existent folder", async () => {
        await expect(source.listSessions("-nonexistent-folder"))
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

Visit http://localhost:3000 - should show session browser placeholder page.
Visit http://localhost:3000/session-clone - should show clone page.

## Done When

- TypeScript compiles without errors
- All existing tests still pass
- New files created:
  - `src/sources/types.ts`
  - `src/sources/claude-source.ts`  
  - `src/sources/index.ts`
  - `src/routes/session-browser.ts`
  - `views/pages/session-browser.ejs`
- Test fixtures created with valid JSONL content
- Server starts and renders pages at `/` and `/session-clone`
- **Behavior tests ERROR** (stubs throw NotImplementedError) - THIS IS CORRECT TDD RED

| Test Category | Expected Result |
|---------------|-----------------|
| Existing tests | PASS |
| decodeFolderName tests | ERROR (NotImplementedError) |
| encodeFolderPath tests | ERROR (NotImplementedError) |
| truncateMessage tests | ERROR (NotImplementedError) |
| ClaudeSessionSource.isAvailable tests | ERROR (NotImplementedError) |
| ClaudeSessionSource.listProjects tests | ERROR (NotImplementedError) |
| ClaudeSessionSource.listSessions tests | ERROR (NotImplementedError) |

Implement the complete phase. Deliver working code with proper TypeScript types, not a plan.
```
