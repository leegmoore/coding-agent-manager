# Context Utility MVP - Session Cloner

## Overview

Standalone Express server for cloning Claude Code sessions with selective removal of tool calls and thinking blocks from the oldest portion of the conversation history.

**Input:** Claude Code session GUID (manual paste)
**Source:** `~/.claude/projects/-<escaped-path>/<session-uuid>.jsonl`
**Output:** New session in same project directory with fresh UUID (immediately usable in Claude Code)

**Clone-time options:**
- Tool call removal: None, 50%, 75%, 100%
- Thinking removal: None, 50%, 75%, 100%
- Percentages apply to OLDEST history (e.g., 75% = strip from oldest 75%, preserve newest 25%)

**Key design decisions:**
- Cloned sessions get a new UUID but preserve original `cwd` (same project association)
- Output to standard Claude Code location so sessions are immediately usable/resumable
- Lineage tracked via append-only log file (session files stay pristine)
- Standalone project for easy portability across machines

---

## Tech Stack

| Component | Version | Rationale |
|-----------|---------|-----------|
| **Node.js** | 22.21.x LTS | Current LTS "Jod", maintained until April 2027 |
| **Express** | 5.2.x | Stable since Sep 2024, production-ready, Node 18+ required |
| **TypeScript** | 5.9.x | Latest stable |
| **Zod** | 3.x | Runtime validation (same pattern as cody-fastify) |
| **Tailwind CSS** | 3.4.x | Stable v3, well-documented |
| **EJS** | 3.x | Server-rendered pages |
| **Vitest** | 3.x | Fast, modern test runner with native TypeScript support |

**Project Location:** `coding-agent-manager/` at repo root (added to `.gitignore`)

---

## Configuration

**File:** `src/config.ts`

```typescript
import path from "path";
import os from "os";

export const config = {
  claudeDir: process.env.CLAUDE_DIR || path.join(os.homedir(), ".claude"),
  port: parseInt(process.env.PORT || "3000", 10),
  get projectsDir() {
    return path.join(this.claudeDir, "projects");
  },
  get lineageLogPath() {
    return path.join(this.claudeDir, "clone-lineage.log");
  },
};
```

Environment variable overrides:
- `CLAUDE_DIR` - Override Claude home directory (default: `~/.claude`)
- `PORT` - Server port (default: 3000)

---

## Session File Format

> **Updated 2025-12-02** based on analysis of 25 real sessions across 5 independent reports.

**Target format:** Project-specific JSONL files at `~/.claude/projects/-Users-<user>-<path>/<sessionId>.jsonl`

### Entry Types (6 total)

| Type | UUID Chain | Purpose | Clone Action |
|------|------------|---------|--------------|
| `user` | Yes | Human input OR tool results | Process |
| `assistant` | Yes | Claude responses (streaming chunks) | Process |
| `queue-operation` | No (uuid=null) | Message queue tracking | Copy, update sessionId |
| `file-history-snapshot` | No (uuid=null) | File state for undo | Copy, update messageId refs |
| `summary` | No (uuid=null) | Conversation summaries | Copy, update leafUuid refs |
| `system` | Yes (special) | Compaction boundaries | Copy, handle logicalParentUuid |

### Content Block Types

| Type | Location | Fields |
|------|----------|--------|
| `text` | user/assistant | `{type: "text", text: string}` |
| `tool_use` | assistant | `{type: "tool_use", id: string, name: string, input: object}` |
| `tool_result` | user | `{type: "tool_result", tool_use_id: string, content: string}` |
| `thinking` | assistant | `{type: "thinking", thinking: string, signature: string}` |

### Streaming Pattern

Multiple JSONL entries share the same `message.id` during streaming:

| Version | Streaming Behavior |
|---------|-------------------|
| v2.0.36-42 | All entries have same `stop_reason` (final value) |
| v2.0.50+ | Intermediate entries have `stop_reason: null`; final has non-null |

**Final message selection:** Entry with non-null `stop_reason`, or last entry for that `message.id`.

### Turn Definition (CORRECTED)

> **CRITICAL:** Turn detection is based on **user entry content type**, NOT `stop_reason`.

**A turn starts when:** A `user` entry has `message.content` as:
- A **string** (human text input), OR
- An **array containing `{type: "text"}`** blocks (but NOT only `tool_result` blocks)

**A turn does NOT start when:** A `user` entry has `message.content` as:
- An **array containing only `{type: "tool_result"}`** blocks (this is a tool response within the current turn)

**Turn detection algorithm:**
```typescript
function isNewTurn(entry: SessionEntry): boolean {
  if (entry.type !== "user") return false;

  // Meta messages (system-injected) are not turns
  if (entry.isMeta === true) return false;

  const content = entry.message?.content;

  // String content = human input (new turn)
  if (typeof content === "string") return true;

  // Array content - check block types
  if (Array.isArray(content)) {
    const hasText = content.some(b => b.type === "text");
    const hasToolResult = content.some(b => b.type === "tool_result");

    // New turn if has text but NOT tool_result
    // (tool_result alone means continuation, not new turn)
    return hasText && !hasToolResult;
  }

  return false;
}
```

**Why NOT use `stop_reason: "end_turn"`:**
- Many sessions (especially tool-heavy ones) never have `end_turn` - they end with `tool_use`
- `stop_reason` is for streaming deduplication, not turn boundaries
- Tool loops can span many messages without `end_turn` appearing

### UUID Chain Structure

```
line 1: summary         uuid=null  parentUuid=null
line 2: queue-operation uuid=null  parentUuid=null
line 3: user            uuid=aaa   parentUuid=null       ← TURN 1 START (text content)
line 4: assistant       uuid=bbb   parentUuid=aaa        stop_reason="tool_use"
line 5: user            uuid=ccc   parentUuid=bbb        [tool_result] ← NOT a new turn
line 6: assistant       uuid=ddd   parentUuid=ccc        stop_reason="tool_use"
line 7: user            uuid=eee   parentUuid=ddd        [tool_result] ← NOT a new turn
line 8: assistant       uuid=fff   parentUuid=eee        stop_reason=null (streaming)
line 9: assistant       uuid=ggg   parentUuid=fff        stop_reason="end_turn" (final)
line 10: user           uuid=hhh   parentUuid=ggg        ← TURN 2 START (text content)
...
```

### Tool Call Pairing

- `tool_use.id` in assistant message matches `tool_result.tool_use_id` in user message
- **Always 1:1 paired** - no orphans observed across 25 sessions analyzed
- When removing tool calls, must remove both the `tool_use` AND matching `tool_result`

---

## File Structure

```
coding-agent-manager/                   # Standalone Express project (in .gitignore)
├── package.json                        # Dependencies + scripts
├── tsconfig.json                       # TypeScript config
├── vitest.config.ts                    # Vitest config
├── tailwind.config.js                  # Tailwind config
├── .nvmrc                              # Node version (22)
├── src/
│   ├── server.ts                       # Express entry point
│   ├── routes/
│   │   └── clone.ts                    # POST /api/clone
│   ├── services/
│   │   ├── session-clone.ts            # Clone logic
│   │   └── lineage-logger.ts           # Append to lineage log
│   └── schemas/
│       └── clone.ts                    # Zod schemas
├── test/
│   ├── fixtures/                       # Test session files
│   │   └── sample-session.jsonl        # Mock session data
│   └── clone.test.ts                   # Functional tests via route handler
├── views/
│   ├── layouts/
│   │   └── main.ejs                    # Base layout
│   └── pages/
│       └── clone.ejs                   # Clone page (server-rendered)
└── public/
    ├── css/
    │   └── styles.css                  # Tailwind output
    └── js/
        └── clone.js                    # Client-side form handling
```

---

## Implementation Phases

### Phase 1: Skeleton/Scaffold

**Goal:** All files in place, Express running with health check, all methods stubbed with NotImplementedError.

#### 1.1 Initialize project
```bash
# Add to parent repo .gitignore first
echo "coding-agent-manager/" >> .gitignore

# Create project
mkdir coding-agent-manager && cd coding-agent-manager
npm init -y
npm install express@5.2 zod express-zod-safe ejs
npm install -D typescript@5.9 @types/node @types/express tsx
npm install -D tailwindcss@3.4 postcss autoprefixer
npm install -D vitest
npx tailwindcss init
echo "22" > .nvmrc
```

**Note:** Using [express-zod-safe](https://www.npmjs.com/package/express-zod-safe) for Zod/Express integration (lightweight, Zod 4 compatible).

#### 1.2 TypeScript config
**File:** `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

#### 1.3 Zod schemas (complete)
**File:** `src/schemas/clone.ts`

```typescript
import { z } from "zod";

// Request
export const CloneRequestSchema = z.object({
  sessionId: z.string().uuid(),
  toolRemoval: z.enum(["none", "50", "75", "100"]).default("none"),
  thinkingRemoval: z.enum(["none", "50", "75", "100"]).default("none"),
});

// Response
export const CloneResponseSchema = z.object({
  success: z.boolean(),
  outputPath: z.string(),
  stats: z.object({
    originalTurnCount: z.number(),
    outputTurnCount: z.number(),
    toolCallsRemoved: z.number(),
    thinkingBlocksRemoved: z.number(),
  }),
});

// Error response
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

// Types
export type CloneRequest = z.infer<typeof CloneRequestSchema>;
export type CloneResponse = z.infer<typeof CloneResponseSchema>;
```

#### 1.4 Custom errors
**File:** `src/errors.ts`

```typescript
export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} is not implemented`);
    this.name = "NotImplementedError";
  }
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}
```

#### 1.5 Service stubs
**File:** `src/services/session-clone.ts`

```typescript
import { CloneRequest, CloneResponse } from "../schemas/clone.js";
import { NotImplementedError } from "../errors.js";

export async function cloneSession(request: CloneRequest): Promise<CloneResponse> {
  throw new NotImplementedError("cloneSession");
}

export async function findSessionFile(sessionId: string): Promise<string> {
  throw new NotImplementedError("findSessionFile");
}

export function parseSession(content: string): SessionEntry[] {
  throw new NotImplementedError("parseSession");
}

export function identifyTurns(entries: SessionEntry[]): Turn[] {
  throw new NotImplementedError("identifyTurns");
}

export function applyRemovals(entries: SessionEntry[], options: RemovalOptions): SessionEntry[] {
  throw new NotImplementedError("applyRemovals");
}

export function repairParentUuidChain(entries: SessionEntry[]): SessionEntry[] {
  throw new NotImplementedError("repairParentUuidChain");
}
```

**File:** `src/services/lineage-logger.ts`

```typescript
import { NotImplementedError } from "../errors.js";

export interface LineageEntry {
  timestamp: string;
  targetId: string;
  targetPath: string;
  sourceId: string;
  sourcePath: string;
  toolRemoval: string;
  thinkingRemoval: string;
}

export async function logLineage(entry: LineageEntry): Promise<void> {
  throw new NotImplementedError("logLineage");
}
```

#### 1.6 Route handler (wired but calls stubbed service)
**File:** `src/routes/clone.ts`

```typescript
import { Router } from "express";
import { validateRequestBody } from "express-zod-safe";
import { CloneRequestSchema } from "../schemas/clone.js";
import { cloneSession } from "../services/session-clone.js";
import { SessionNotFoundError } from "../errors.js";

export const cloneRouter = Router();

cloneRouter.post(
  "/clone",
  validateRequestBody(CloneRequestSchema),
  async (req, res) => {
    try {
      const result = await cloneSession(req.body);
      res.json(result);
    } catch (err) {
      if (err instanceof SessionNotFoundError) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: err.message } });
      }
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: err.message } });
    }
  }
);
```

#### 1.7 Express server with health check
**File:** `src/server.ts`

```typescript
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { cloneRouter } from "./routes/clone.js";
import { config } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api", cloneRouter);

// Server-rendered pages (placeholder for Phase 4)
app.get("/", (req, res) => {
  res.send("UI not implemented yet - use POST /api/clone");
});

export { app };

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}`);
  });
}
```

#### 1.8 Phase 1 Completion Criteria
- [ ] `npm run dev` starts server without errors
- [ ] `GET /health` returns `{ status: "ok" }`
- [ ] `POST /api/clone` with valid body returns 500 with "not implemented"
- [ ] `POST /api/clone` with invalid body returns 400 with Zod errors
- [ ] All service functions exist and throw `NotImplementedError`

---

### Phase 2: TDD Red (Write All Tests)

**Goal:** Complete test suite written, all tests failing (red).

#### 2.1 Test fixtures
Create from real session data (sanitized):

```
test/fixtures/
├── minimal-session.jsonl           # 1 turn, text only
├── tool-session.jsonl              # 4 turns with tool_use/tool_result loops
├── thinking-session.jsonl          # 4 turns with thinking blocks
├── mixed-session.jsonl             # All block types combined
├── queue-ops-session.jsonl         # Includes queue-operation entries
└── expected/
    ├── tool-session-100.jsonl      # Expected: 100% tool removal
    ├── tool-session-75.jsonl       # Expected: 75% tool removal
    ├── thinking-session-75.jsonl   # Expected: 75% thinking removal
    └── mixed-session-50-50.jsonl   # Expected: 50% tool, 50% thinking
```

#### 2.2 Test file structure
**File:** `test/clone.test.ts`

Write all TC-01 through TC-13 tests. Each test:
- Arranges fixture data via mocked fs
- Calls service function directly
- Asserts expected output matches golden file

#### 2.3 Phase 2 Completion Criteria
- [ ] All 13 test cases written
- [ ] All tests run and fail (red) with `NotImplementedError`
- [ ] Golden file fixtures created for comparison tests

---

### Phase 3: TDD Green (Implementation)

**Goal:** Implement all service functions until tests pass.

#### 3.1 Clone Algorithm Implementation

**File:** `src/services/session-clone.ts`

Implement in order:
1. `findSessionFile()` - Glob search in `~/.claude/projects/*/`
2. `parseSession()` - JSONL line-by-line parsing
3. `identifyTurns()` - **Scan user entries for text content (NOT stop_reason)**
4. `applyRemovals()` - Mark and delete lines, surgical content removal
5. `repairParentUuidChain()` - Patch first-line-after-deleted-block
6. `cloneSession()` - Orchestrate all steps, write output

**Algorithm Details:**

**Identify Turns (CORRECTED):**
```typescript
// A turn starts when a USER entry has text content (not tool_result)
function isNewTurn(entry: SessionEntry): boolean {
  if (entry.type !== "user") return false;

  const content = entry.message?.content;

  // String content = human input (new turn)
  if (typeof content === "string") return true;

  // Array content - check block types
  if (Array.isArray(content)) {
    const hasText = content.some(b => b.type === "text");
    const hasToolResult = content.some(b => b.type === "tool_result");

    // New turn = has text but NOT tool_result
    return hasText && !hasToolResult;
  }

  return false;
}

// Count turns = count user entries that start new turns
function identifyTurns(entries: SessionEntry[]): Turn[] {
  const turns: Turn[] = [];
  let currentTurn: Turn | null = null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (isNewTurn(entry)) {
      // Close previous turn if exists
      if (currentTurn) {
        currentTurn.endIndex = i - 1;
        turns.push(currentTurn);
      }
      // Start new turn
      currentTurn = { startIndex: i, endIndex: -1 };
    }
  }

  // Close final turn
  if (currentTurn) {
    currentTurn.endIndex = entries.length - 1;
    turns.push(currentTurn);
  }

  return turns;
}
```

**Apply Removals:**
```typescript
// 1. Calculate boundary: floor(turnCount * percentage / 100)
// 2. For turns in removal zone:
//    - Tool: Delete tool_use entries + matching tool_result entries
//    - Thinking: Remove from content[] array (surgical)
// 3. Delete entries where content becomes empty after removal
```

**Repair Chain:**
```typescript
// For each contiguous block of deleted lines:
//   - firstAfter.parentUuid = lastBefore.uuid
```

#### 3.2 Lineage logger implementation
**File:** `src/services/lineage-logger.ts`

```typescript
// Append formatted entry to ~/.claude/clone-lineage.log
// Use atomic write: write to temp, rename
```

#### 3.3 Phase 3 Completion Criteria
- [ ] All 13 tests passing (green)
- [ ] Manual test: clone a real session, verify output loads in Claude Code

---

### Phase 3.1: Fix Turn Detection Bug

**Goal:** Fix the incorrect `identifyTurns()` implementation that was looking for `stop_reason: "end_turn"` instead of user text content.

**Background:**
The original implementation assumed turns end with `stop_reason: "end_turn"`. Analysis of 25 real sessions revealed:
- Many sessions (especially tool-heavy ones) have NO `end_turn` markers
- Turns should be identified by **user entries with text content**, not assistant stop reasons
- The current implementation returns 0 turns for valid sessions, causing no tool removal to occur

#### 3.1.1 Changes Required

**File 1:** `src/types.ts`

Add `isMeta` field to `SessionEntry` interface:
```typescript
export interface SessionEntry {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  isMeta?: boolean;  // ADD THIS - meta messages should not count as turns
  message?: {
    role?: string;
    content?: ContentBlock[] | string;
    stop_reason?: string;
  };
  [key: string]: unknown;
}
```

**File 2:** `src/services/session-clone.ts`

**Replace `identifyTurns()` function:**

FROM (incorrect):
```typescript
export function identifyTurns(entries: SessionEntry[]): Turn[] {
  // Looking for stop_reason === "end_turn" - WRONG
  ...
}
```

TO (correct):
```typescript
/**
 * Determines if an entry represents the start of a new turn.
 * A new turn starts when a user sends text content (not a tool result).
 */
function isNewTurn(entry: SessionEntry): boolean {
  if (entry.type !== "user") return false;

  // Meta messages (system-injected) are not turns
  if (entry.isMeta === true) return false;

  const content = entry.message?.content;

  // String content = human input (new turn)
  if (typeof content === "string") return true;

  // Array content - check block types
  if (Array.isArray(content)) {
    const hasText = content.some((b) => b.type === "text");
    const hasToolResult = content.some((b) => b.type === "tool_result");

    // New turn = has text but NOT tool_result
    // (tool_result alone means tool response within current turn)
    return hasText && !hasToolResult;
  }

  return false;
}

/**
 * Identifies turn boundaries in a session.
 * A turn starts when a user entry has text content (not tool_result).
 * Tool result entries are continuations of the current turn, not new turns.
 */
export function identifyTurns(entries: SessionEntry[]): Turn[] {
  const turns: Turn[] = [];
  let currentTurnStart: number | null = null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (isNewTurn(entry)) {
      // Close previous turn if exists
      if (currentTurnStart !== null) {
        turns.push({ startIndex: currentTurnStart, endIndex: i - 1 });
      }
      // Start new turn
      currentTurnStart = i;
    }
  }

  // Close final turn
  if (currentTurnStart !== null) {
    turns.push({ startIndex: currentTurnStart, endIndex: entries.length - 1 });
  }

  return turns;
}
```

#### 3.1.2 Test Updates

Update TC-07 if it relies on the old turn detection behavior:
- Ensure fixture has proper user text entries to detect turns
- Verify turn count matches expected based on user text entries

#### 3.1.3 Verification

After fix:
```bash
# Run tests
npm test

# Manual test with a real session
curl -X POST http://localhost:3001/api/clone \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<your-session-id>","toolRemoval":"100","thinkingRemoval":"none"}'
```

Expected result:
- `originalTurnCount` should be > 0 for sessions with user messages
- `toolCallsRemoved` should be > 0 when toolRemoval is "100"

#### 3.1.4 Phase 3.1 Completion Criteria
- [ ] `isMeta?: boolean` added to `SessionEntry` interface in `types.ts`
- [ ] `isNewTurn()` helper function added with `isMeta` check
- [ ] `identifyTurns()` rewritten to detect user text entries
- [ ] All existing tests still pass
- [ ] Manual test: real session clone reports correct turn count (> 0)
- [ ] Manual test: 100% tool removal actually removes tool calls (> 0)

---

### Phase 4: UI

**Goal:** Web interface for the clone endpoint.

#### 4.1 Server-rendered page
**File:** `views/pages/clone.ejs`

```html
<!DOCTYPE html>
<html>
<head>
  <title>Session Cloner</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 p-8">
  <div class="max-w-md mx-auto bg-white rounded-lg shadow p-6">
    <h1 class="text-2xl font-bold mb-4">Clone Session</h1>
    <form id="clone-form">
      <label class="block mb-2">Session GUID</label>
      <input type="text" name="sessionId" class="w-full border p-2 mb-4" required>

      <label class="block mb-2">Tool Removal</label>
      <select name="toolRemoval" class="w-full border p-2 mb-4">
        <option value="none">None</option>
        <option value="50">50%</option>
        <option value="75">75%</option>
        <option value="100">100%</option>
      </select>

      <label class="block mb-2">Thinking Removal</label>
      <select name="thinkingRemoval" class="w-full border p-2 mb-4">
        <option value="none">None</option>
        <option value="50">50%</option>
        <option value="75">75%</option>
        <option value="100">100%</option>
      </select>

      <button type="submit" class="w-full bg-blue-500 text-white p-2 rounded">
        Clone Session
      </button>
    </form>
    <div id="result" class="mt-4 hidden"></div>
  </div>
  <script src="/js/clone.js"></script>
</body>
</html>
```

#### 4.2 Client JavaScript
**File:** `public/js/clone.js`

- Form submission handler
- POST to `/api/clone`
- On success, display copy-pastable command block:
  ```
  claude --dangerously-skip-permissions --resume <new-session-id>
  ```
- On error, display error message

#### 4.3 Update server route
**File:** `src/server.ts`

```typescript
app.get("/", (req, res) => {
  res.render("pages/clone");
});
```

#### 4.4 Phase 4 Completion Criteria
- [ ] `GET /` renders clone form
- [ ] Form submission calls API and displays result
- [ ] Success shows copy-pastable `claude --resume` command
- [ ] Error displays meaningful message

---

## Output Location

**Cloned Session:**
- **Directory:** `~/.claude/projects/<same-encoded-path>/` (same as source)
- **Filename:** `<new-uuid>.jsonl`
- **Example:** `~/.claude/projects/-Users-leemoore-code-codex-port-02/a1b2c3d4-5678-90ab-cdef-1234567890ab.jsonl`

**Lineage Log:**
- **Location:** `~/.claude/clone-lineage.log`
- **Format:** Append-only, human-readable

```
[2025-12-02T15:30:45Z]
  TARGET: a1b2c3d4-5678-90ab-cdef-1234567890ab
    path: ~/.claude/projects/-Users-leemoore-code-codex-port-02/a1b2c3d4-5678-90ab-cdef-1234567890ab.jsonl
  SOURCE: 00a61603-c2ea-4d4c-aee8-4a292ab7b3f4
    path: ~/.claude/projects/-Users-leemoore-code-codex-port-02/00a61603-c2ea-4d4c-aee8-4a292ab7b3f4.jsonl
  OPTIONS: toolRemoval=75% thinkingRemoval=50%
---
```

---

## Files to Create

### Phase 1 (Skeleton)
| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts |
| `tsconfig.json` | TypeScript config |
| `.nvmrc` | Node version lock (22) |
| `src/server.ts` | Express entry point with health check |
| `src/config.ts` | Configuration with env overrides |
| `src/errors.ts` | Custom error classes |
| `src/schemas/clone.ts` | Zod request/response schemas |
| `src/services/session-clone.ts` | Clone logic (stubbed) |
| `src/services/lineage-logger.ts` | Lineage logging (stubbed) |
| `src/routes/clone.ts` | API route handler |
| `vitest.config.ts` | Vitest configuration |

### Phase 2 (TDD Red)
| File | Purpose |
|------|---------|
| `test/clone.test.ts` | All 13 test cases |
| `test/fixtures/*.jsonl` | Input session fixtures |
| `test/fixtures/expected/*.jsonl` | Expected output golden files |

### Phase 4 (UI)
| File | Purpose |
|------|---------|
| `views/pages/clone.ejs` | Server-rendered clone page |
| `public/js/clone.js` | Client-side form handling |

## npm Scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc && npm run build:css",
    "build:css": "tailwindcss -i ./src/styles.css -o ./public/css/styles.css",
    "start": "node dist/server.js",
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

---

## Testing Strategy

### Approach: Functional Tests via Route Handler Entry Point

Tests exercise the full code path through the route handler function, NOT isolated unit tests. The route handler (`cloneRouter.post("/clone", ...)`) is the entry point. We mock only:
- **File system reads** - Provide fixture data instead of reading `~/.claude/`
- **File system writes** - Capture output instead of writing to disk
- **UUID generation** - Return predictable UUIDs for assertions
- **os.homedir()** - Return predictable path for `~` expansion
- **Date.now()** - Return predictable timestamp for lineage log

Everything else (Zod validation, clone logic, lineage logging) runs as real code.

### Test File Structure

**File:** `test/clone.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cloneHandler } from "../src/routes/clone.js";

// Mock file system
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  appendFile: vi.fn(),
}));

// Mock UUID generation
vi.mock("crypto", () => ({
  randomUUID: () => "test-uuid-1234",
}));

// Mock os.homedir
vi.mock("os", () => ({
  homedir: () => "/mock/home",
}));

// Mock Date.now for consistent timestamps
vi.spyOn(Date, "now").mockReturnValue(1733155845000);
```

### Vitest Config

**File:** `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

---

## Functional Test Conditions

### TC-01: Valid clone with no removal
**Input:** Valid sessionId, toolRemoval=none, thinkingRemoval=none
**Expected:**
- Returns 200 with success=true
- Output contains all original turns
- Stats show 0 removals
- Lineage log appended

### TC-02: Valid clone with 100% tool removal
**Input:** Valid sessionId, toolRemoval=100, thinkingRemoval=none
**Expected:**
- All `tool_use` blocks removed from assistant messages
- All `tool_result` blocks removed from user messages
- Text content preserved
- Stats reflect correct removal count

### TC-03: Valid clone with 75% thinking removal
**Input:** Valid sessionId, toolRemoval=none, thinkingRemoval=75
**Expected:**
- Thinking blocks removed from oldest 75% of turns
- Thinking blocks preserved in newest 25%
- Boundary calculation correct (floor)

### TC-04: Valid clone with combined removal (50% tool, 75% thinking)
**Input:** Valid sessionId, toolRemoval=50, thinkingRemoval=75
**Expected:**
- Tool removal applies to oldest 50%
- Thinking removal applies to oldest 75%
- Independent boundaries (not cumulative)

### TC-05: Invalid sessionId format
**Input:** sessionId="not-a-uuid"
**Expected:**
- Returns 400
- Zod validation error in response

### TC-06: Session not found
**Input:** Valid UUID format but file doesn't exist
**Expected:**
- Returns 404
- Error message indicates session not found

### TC-07: Empty session (no user/assistant turns)
**Input:** Session with only queue-operation entries
**Expected:**
- Returns 200 with success=true
- Output is valid but minimal
- Stats show 0 turns

### TC-08: Tool pairing across boundary
**Input:** Session where tool_use/tool_result pair straddles removal boundary
**Expected:**
- Boundary rounds to keep pair together
- No orphaned tool_result blocks
- No orphaned tool_use blocks

### TC-09: New UUID generation
**Input:** Any valid clone request
**Expected:**
- Output file has new UUID filename
- All `sessionId` fields in entries updated to new UUID
- Original `cwd` preserved

### TC-10: Lineage log format
**Input:** Any valid clone request
**Expected:**
- Append to `~/.claude/clone-lineage.log`
- Contains timestamp, target UUID/path, source UUID/path, options
- Follows specified format

### TC-11: parentUuid chain repair
**Input:** Session with tool calls removed, creating gaps in UUID chain
**Expected:**
- Chain is repaired: first line after deleted block points to last line before it
- No broken parentUuid references

### TC-12: Queue-operation and file-history-snapshot handling
**Input:** Session containing queue-operation and file-history-snapshot entries
**Expected:**
- Entries are copied through (not deleted)
- sessionId field updated to new UUID

### TC-13: Mixed content block surgical removal
**Input:** Assistant message with [text, tool_use, thinking] - only thinking in removal zone
**Expected:**
- thinking block removed from content array
- text and tool_use preserved
- Line itself preserved (not deleted)

---

## Test Fixtures

Tests require real session data converted to fixtures with known expected outputs:

```
test/fixtures/
├── minimal-session.jsonl           # 1 turn, text only (boundary testing)
├── tool-session.jsonl              # 4 turns with tool_use/tool_result loops
├── tool-session-75-expected.jsonl  # Expected output for 75% tool removal
├── thinking-session.jsonl          # 4 turns with thinking blocks
├── mixed-session.jsonl             # All block types combined
└── queue-ops-session.jsonl         # Includes queue-operation entries
```

Each fixture pair enables golden-file testing: run clone, diff against expected output.

---

## Test Implementation Pattern

Each test follows this pattern:

```typescript
describe("POST /api/clone", () => {
  it("TC-01: clones session with no removal", async () => {
    // Arrange: Setup fixture data
    const mockSession = loadFixture("sample-session.jsonl");
    vi.mocked(readFile).mockResolvedValue(mockSession);

    // Act: Call handler directly (not via HTTP)
    const req = mockRequest({
      sessionId: "00a61603-c2ea-4d4c-aee8-4a292ab7b3f4",
      toolRemoval: "none",
      thinkingRemoval: "none"
    });
    const res = mockResponse();

    await cloneHandler(req, res);

    // Assert: Verify response and side effects
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      stats: expect.objectContaining({
        toolCallsRemoved: 0,
        thinkingBlocksRemoved: 0,
      }),
    }));
    expect(writeFile).toHaveBeenCalled();
    expect(appendFile).toHaveBeenCalled(); // lineage log
  });
});
```

---

## Future Enhancements (Post-MVP)

- Dropdown to browse/select sessions with summaries
- Banded summarization/compression
- Manual turn editing UI
- Preview before clone

---

## Appendix: Session Format Analysis (2025-12-02)

### Analysis Methodology

5 independent agents analyzed 5 sessions each (25 total sessions) to reverse-engineer the Claude Code session format. Reports are stored in:
- `session-format-analysis-01.md` through `session-format-analysis-05.md`

### Key Findings (Consensus Across All 5 Reports)

| Finding | Confidence |
|---------|------------|
| 6 Entry Types: user, assistant, queue-operation, file-history-snapshot, summary, system | 100% |
| Tool pairing is always 1:1 (tool_use.id ↔ tool_result.tool_use_id), no orphans | 100% |
| UUID chain: user/assistant entries form linked list via uuid/parentUuid | 100% |
| Streaming: multiple entries share message.id; final has non-null stop_reason | 100% |
| Content block types: text, tool_use, tool_result, thinking | 100% |
| stop_reason values: null (streaming), "end_turn", "tool_use", "stop_sequence" (rare) | 100% |

### Critical Discovery: Turn Detection

**Original (incorrect) assumption:**
> Turns end with `stop_reason: "end_turn"` on assistant messages.

**Actual behavior:**
> Turns start when a `user` entry has text content (not tool_result).

**Evidence:**
- Many sessions have NO `end_turn` markers (especially tool-heavy sessions)
- `stop_reason` is for streaming deduplication, not turn boundaries
- All 5 reports independently converged on the same turn detection algorithm

### Version-Dependent Streaming

| Claude Code Version | Streaming Behavior |
|---------------------|-------------------|
| v2.0.36-42 | All streaming entries have same stop_reason (final value) |
| v2.0.50+ | Intermediate entries have stop_reason: null |

### Models Observed

- `claude-sonnet-4-5-20250929`
- `claude-opus-4-5-20251101`
- `<synthetic>` (placeholder responses)
