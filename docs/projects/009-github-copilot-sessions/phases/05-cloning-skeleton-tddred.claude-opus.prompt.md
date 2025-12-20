```prompt
# Phase 5: Cloning & Integration - Skeleton + TDD Red (Claude Opus 4.5)

## Objective

Create the cloning and integration skeleton: `CopilotCloneService` stubs, source resolver stubs, clone route stubs, and **TDD Red tests that assert REAL behavior and will ERROR** because stubs throw `NotImplementedError`.

TDD Red means tests assert real expected behavior. Tests ERROR (throw) because stubs throw `NotImplementedError`. When Phase 6 implements real logic, these same tests will PASS.

## Context

Phases 1-4 implemented:
- `CopilotSessionSource` for session discovery and loading
- Session Browser with working source toggle
- Unified token estimation
- `CopilotStructureService` for visualization
- Session detail page multi-source support

Now we add cloning and integration:
1. `CopilotCloneService` for cloning sessions in native Copilot format
2. Source resolver for auto-detecting session source from ID
3. Clone routes for Copilot sessions
4. Clone page updates for multi-source support

## Constraints

- All new service functions throw `NotImplementedError` - no real logic yet
- Clone output must be valid Copilot JSON format
- Use `estimateTokens()` from Phase 4 for stats calculation
- Tests assert REAL behavior - they will ERROR when stubs throw
- Follow existing patterns from `src/services/session-clone.ts`

## Reference Files

Read these files before writing code:
- `src/services/session-clone.ts` - Existing Claude clone service pattern
- `src/sources/copilot-source.ts` - Copilot session loading
- `src/sources/claude-source.ts` - Claude session finding (for source resolver)
- `src/lib/token-estimator.ts` - Token estimation
- `public/js/pages/clone.js` - Clone page frontend

## Deliverables

### 1. Copilot Clone Service (`src/services/copilot-clone.ts`)

Create service with stubs:

```typescript
import { NotImplementedError } from "../errors.js";
import type { CopilotSession, CopilotRequest } from "../sources/copilot-types.js";

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
   *
   * @param sessionId - Session UUID to clone
   * @param workspaceHash - Workspace folder hash
   * @param options - Clone options (compression, tool removal)
   */
  async clone(
    sessionId: string,
    workspaceHash: string,
    options: CopilotCloneOptions = {}
  ): Promise<CopilotCloneResult> {
    throw new NotImplementedError("CopilotCloneService.clone");
  }

  /**
   * Remove tool-related items from response arrays.
   */
  removeToolCalls(requests: CopilotRequest[]): CopilotRequest[] {
    throw new NotImplementedError("CopilotCloneService.removeToolCalls");
  }

  /**
   * Remove oldest turns to achieve target compression.
   * Keeps most recent turns.
   */
  compressByPercentage(requests: CopilotRequest[], percent: number): CopilotRequest[] {
    throw new NotImplementedError("CopilotCloneService.compressByPercentage");
  }

  /**
   * Generate a new UUID for the cloned session.
   */
  generateSessionId(): string {
    throw new NotImplementedError("CopilotCloneService.generateSessionId");
  }

  /**
   * Calculate compression statistics.
   */
  calculateStats(original: CopilotRequest[], cloned: CopilotRequest[]): CopilotCloneStats {
    throw new NotImplementedError("CopilotCloneService.calculateStats");
  }

  /**
   * Generate a descriptive title for the cloned session.
   * Format: "Clone: <first N chars of first user message> (<timestamp>)"
   *
   * @param firstUserMessage - The first user message text
   * @param maxLength - Maximum length for the message preview (default 50)
   * @returns Formatted clone title
   */
  generateCloneTitle(firstUserMessage: string, maxLength?: number): string {
    throw new NotImplementedError("CopilotCloneService.generateCloneTitle");
  }
}

// Export singleton
export const copilotCloneService = new CopilotCloneService();
```

### 2. Source Resolver (`src/lib/source-resolver.ts`)

Create resolver with stubs:

```typescript
import { NotImplementedError } from "../errors.js";

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
 * Resolve a session ID to its source and location.
 * Searches Claude first (more common), then Copilot.
 *
 * @param sessionId - UUID of the session
 * @returns Resolved session info or null if not found
 */
export async function resolveSession(sessionId: string): Promise<ResolvedSession | null> {
  throw new NotImplementedError("resolveSession");
}

/**
 * Validate UUID format.
 */
export function isValidUuid(str: string): boolean {
  throw new NotImplementedError("isValidUuid");
}
```

### 3. Add findSession to ClaudeSessionSource (`src/sources/claude-source.ts`)

Add stub method to existing class:

```typescript
/**
 * Find a session by ID across all projects.
 * @returns Project folder name if found, null otherwise
 */
async findSession(sessionId: string): Promise<string | null> {
  throw new NotImplementedError("ClaudeSessionSource.findSession");
}
```

### 4. Clone Route (`src/routes/copilot-clone.ts`)

Create route stubs:

```typescript
import { Router } from "express";
import validate from "express-zod-safe";
import { z } from "zod";
import { copilotCloneService } from "../services/copilot-clone.js";
import { NotImplementedError } from "../errors.js";

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
      if (error instanceof NotImplementedError) {
        return res.status(501).json({
          error: { message: "Copilot cloning not yet implemented", code: "NOT_IMPLEMENTED" }
        });
      }
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

### 5. Session Resolver Route (`src/routes/session-resolver.ts`)

Create route stubs:

```typescript
import { Router } from "express";
import validate from "express-zod-safe";
import { z } from "zod";
import { resolveSession } from "../lib/source-resolver.js";
import { NotImplementedError } from "../errors.js";

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
      if (error instanceof NotImplementedError) {
        return res.status(501).json({
          error: { message: "Session resolution not yet implemented", code: "NOT_IMPLEMENTED" }
        });
      }
      console.error("Session resolution failed:", error);
      res.status(500).json({
        error: { message: "Failed to resolve session", code: "RESOLUTION_ERROR" }
      });
    }
  }
);
```

### 6. Register Routes (`src/server.ts`)

Add imports and registrations:

```typescript
// Add imports
import { copilotCloneRouter } from "./routes/copilot-clone.js";
import { sessionResolverRouter } from "./routes/session-resolver.js";

// Register routes (add after other route registrations)
app.use("/", copilotCloneRouter);
app.use("/", sessionResolverRouter);
```

### 7. Clone Service Tests (`test/services/copilot-clone.test.ts`)

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { CopilotCloneService } from "../../src/services/copilot-clone.js";
import type { CopilotRequest } from "../../src/sources/copilot-types.js";

describe("CopilotCloneService", () => {
  let service: CopilotCloneService;
  const fixturesPath = path.join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = fixturesPath;
    service = new CopilotCloneService();
  });

  afterAll(() => {
    delete process.env.VSCODE_STORAGE_PATH;
  });

  describe("clone", () => {
    // AC-25: POST /api/copilot/clone accepts sessionId and compression options
    // AC-29: Clone returns session with updated requests[]
    it("clones session with all requests", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        {}
      );

      expect(result.session).toBeDefined();
      expect(result.session.requests.length).toBe(2);
      expect(result.stats.originalTurns).toBe(2);
      expect(result.stats.clonedTurns).toBe(2);
    });

    // AC-26: Clone output is valid Copilot JSON format
    it("generates new session ID", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        {}
      );

      expect(result.session.sessionId).not.toBe("11111111-1111-1111-1111-111111111111");
      expect(result.session.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    // Clone title generation for session identification in VS Code chat list
    it("generates descriptive customTitle with message preview and timestamp", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        {}
      );

      // Format: "Clone: <message preview> (<timestamp>)"
      expect(result.session.customTitle).toMatch(/^Clone: .+ \(.+\)$/);
      expect(result.session.customTitle).toContain("Clone:");
    });

    // AC-27: Same compression logic applies - compress by percentage
    // AC-28: Compression operates on requests[] array
    it("compresses by percentage", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        { compressPercent: 50 }
      );

      expect(result.session.requests.length).toBe(1);
      expect(result.stats.removedTurns).toBe(1);
    });

    // AC-28: Compression operates on requests[] array (removes oldest)
    it("removes oldest turns when compressing", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        { compressPercent: 50 }
      );

      // Should keep the second (newer) request
      expect(result.session.requests[0].message.text).toContain("error handling");
    });

    // AC-29: Clone returns stats including token counts
    it("calculates token stats", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        {}
      );

      expect(result.stats.originalTokens).toBeGreaterThan(0);
      expect(result.stats.clonedTokens).toBeGreaterThan(0);
    });

    // AC-29: Clone returns stats including compression ratio
    it("calculates compression ratio", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        { compressPercent: 50 }
      );

      expect(result.stats.compressionRatio).toBeGreaterThan(0);
    });

    // AC-27: Compression edge case - 0% means no compression
    it("handles 0% compression", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        { compressPercent: 0 }
      );

      expect(result.session.requests.length).toBe(2);
      expect(result.stats.compressionRatio).toBe(0);
    });

    // AC-27: Compression edge case - 100% removes all turns
    it("handles 100% compression", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        { compressPercent: 100 }
      );

      expect(result.session.requests.length).toBe(0);
    });

    // Error handling: non-existent session
    it("throws for non-existent session", async () => {
      await expect(
        service.clone("nonexistent", "abc123def456ghi789", {})
      ).rejects.toThrow();
    });

    // Title should always use ORIGINAL first message, even when compressed
    it("uses original first message for title even when compressed", async () => {
      // 11111111... fixture has first message "Help me refactor this code"
      // and second message "Add error handling for token expiration"
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        { compressPercent: 50 }  // Removes first turn, keeps second
      );

      // Title should still reference the ORIGINAL first message
      // even though it's been removed from the cloned session
      expect(result.session.customTitle).toContain("Help me refactor");
      // NOT the second message that becomes first after compression
      expect(result.session.customTitle).not.toContain("error handling");
    });
  });

  // AC-27: Same compression logic applies - remove tool calls
  describe("removeToolCalls", () => {
    it("removes tool invocation items from responses", () => {
      const requests: CopilotRequest[] = [
        {
          requestId: "1",
          message: { text: "test", parts: [] },
          response: [
            { kind: "markdownContent", value: "response" },
            { kind: "toolInvocationSerialized", toolId: "tool1" },
            { kind: "markdownContent", value: "more response" }
          ],
          isCanceled: false,
          timestamp: 0
        }
      ];

      const result = service.removeToolCalls(requests);

      expect(result[0].response.length).toBe(2);
      expect(result[0].response.every(r => r.kind !== "toolInvocationSerialized")).toBe(true);
    });

    it("preserves non-tool response items", () => {
      const requests: CopilotRequest[] = [
        {
          requestId: "1",
          message: { text: "test", parts: [] },
          response: [
            { kind: "markdownContent", value: "response text" }
          ],
          isCanceled: false,
          timestamp: 0
        }
      ];

      const result = service.removeToolCalls(requests);

      expect(result[0].response.length).toBe(1);
      expect(result[0].response[0].value).toBe("response text");
    });
  });

  // AC-27: Same compression logic applies - compress by percentage
  // AC-28: Compression operates on requests[] array, preserving Copilot structure
  describe("compressByPercentage", () => {
    it("removes correct number of oldest turns", () => {
      const requests: CopilotRequest[] = [
        { requestId: "1", message: { text: "first", parts: [] }, response: [], isCanceled: false, timestamp: 0 },
        { requestId: "2", message: { text: "second", parts: [] }, response: [], isCanceled: false, timestamp: 1 },
        { requestId: "3", message: { text: "third", parts: [] }, response: [], isCanceled: false, timestamp: 2 },
        { requestId: "4", message: { text: "fourth", parts: [] }, response: [], isCanceled: false, timestamp: 3 }
      ];

      const result = service.compressByPercentage(requests, 50);

      expect(result.length).toBe(2);
      expect(result[0].message.text).toBe("third");
      expect(result[1].message.text).toBe("fourth");
    });

    it("returns all requests for 0%", () => {
      const requests: CopilotRequest[] = [
        { requestId: "1", message: { text: "first", parts: [] }, response: [], isCanceled: false, timestamp: 0 },
        { requestId: "2", message: { text: "second", parts: [] }, response: [], isCanceled: false, timestamp: 1 }
      ];

      const result = service.compressByPercentage(requests, 0);

      expect(result.length).toBe(2);
    });

    it("returns empty array for 100%", () => {
      const requests: CopilotRequest[] = [
        { requestId: "1", message: { text: "first", parts: [] }, response: [], isCanceled: false, timestamp: 0 }
      ];

      const result = service.compressByPercentage(requests, 100);

      expect(result.length).toBe(0);
    });
  });

  // AC-26: Clone output is valid Copilot JSON format (requires new session ID)
  describe("generateSessionId", () => {
    it("generates valid UUID v4", () => {
      const id = service.generateSessionId();

      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it("generates unique IDs", () => {
      const id1 = service.generateSessionId();
      const id2 = service.generateSessionId();

      expect(id1).not.toBe(id2);
    });
  });

  // AC-29: Clone returns session with updated requests[] reflecting removals
  // Stats provide visibility into compression effectiveness
  describe("calculateStats", () => {
    it("calculates correct turn counts", () => {
      const original: CopilotRequest[] = [
        { requestId: "1", message: { text: "hello world", parts: [] }, response: [], isCanceled: false, timestamp: 0 },
        { requestId: "2", message: { text: "goodbye", parts: [] }, response: [], isCanceled: false, timestamp: 0 }
      ];
      const cloned: CopilotRequest[] = [
        { requestId: "2", message: { text: "goodbye", parts: [] }, response: [], isCanceled: false, timestamp: 0 }
      ];

      const stats = service.calculateStats(original, cloned);

      expect(stats.originalTurns).toBe(2);
      expect(stats.clonedTurns).toBe(1);
      expect(stats.removedTurns).toBe(1);
    });

    it("calculates token counts", () => {
      const original: CopilotRequest[] = [
        { requestId: "1", message: { text: "hello world foo bar", parts: [] }, response: [], isCanceled: false, timestamp: 0 }
      ];
      const cloned: CopilotRequest[] = [];

      const stats = service.calculateStats(original, cloned);

      expect(stats.originalTokens).toBeGreaterThan(0);
      expect(stats.clonedTokens).toBe(0);
      expect(stats.removedTokens).toBe(stats.originalTokens);
    });

    it("calculates compression ratio", () => {
      const original: CopilotRequest[] = [
        { requestId: "1", message: { text: "one two three four", parts: [] }, response: [], isCanceled: false, timestamp: 0 },
        { requestId: "2", message: { text: "five six seven eight", parts: [] }, response: [], isCanceled: false, timestamp: 0 }
      ];
      const cloned: CopilotRequest[] = [
        { requestId: "2", message: { text: "five six seven eight", parts: [] }, response: [], isCanceled: false, timestamp: 0 }
      ];

      const stats = service.calculateStats(original, cloned);

      expect(stats.compressionRatio).toBeGreaterThan(0);
      expect(stats.compressionRatio).toBeLessThanOrEqual(100);
    });
  });

  describe("generateCloneTitle", () => {
    it("generates title with message preview and timestamp", () => {
      const title = service.generateCloneTitle("Help me implement a new feature for user authentication");

      // Format: "Clone: <preview> (<timestamp>)"
      expect(title).toMatch(/^Clone: .+ \(.+\)$/);
      expect(title).toContain("Help me implement");
    });

    it("truncates long messages to maxLength", () => {
      const longMessage = "This is a very long message that should be truncated to fit within the maximum length specified";
      const title = service.generateCloneTitle(longMessage, 30);

      // Preview should be truncated
      expect(title.length).toBeLessThan(100); // Reasonable total length
      expect(title).toContain("...");
    });

    it("uses default maxLength of 50", () => {
      const longMessage = "A".repeat(100);
      const title = service.generateCloneTitle(longMessage);

      // Should truncate at ~50 chars for preview
      const previewMatch = title.match(/^Clone: (.+?) \(/);
      expect(previewMatch).toBeTruthy();
      expect(previewMatch![1].length).toBeLessThanOrEqual(53); // 50 + "..."
    });

    it("handles empty message", () => {
      const title = service.generateCloneTitle("");

      expect(title).toMatch(/^Clone: .+ \(.+\)$/);
      expect(title).toContain("(No message)");
    });

    it("handles whitespace-only message", () => {
      const title = service.generateCloneTitle("   ");

      expect(title).toContain("(No message)");
    });

    it("includes readable timestamp", () => {
      const title = service.generateCloneTitle("Test message");

      // Should contain month and time like "Dec 12 2:30pm"
      expect(title).toMatch(/\([A-Z][a-z]{2} \d{1,2} \d{1,2}:\d{2}(am|pm)\)$/i);
    });

    it("preserves Clone: prefix for nested clones", () => {
      // If cloning an already-cloned session
      const title = service.generateCloneTitle("Clone: Previous clone message (Dec 10 1:00pm)");

      // Should result in "Clone: Clone: Previous..."
      expect(title).toMatch(/^Clone: Clone:/);
    });
  });
});
```

### 8. Source Resolver Tests (`test/lib/source-resolver.test.ts`)

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { resolveSession, isValidUuid } from "../../src/lib/source-resolver.js";

describe("Source Resolver", () => {
  const copilotFixtures = path.join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");
  const claudeFixtures = path.join(process.cwd(), "test/fixtures/session-browser");

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = copilotFixtures;
    process.env.CLAUDE_DIR = claudeFixtures;
  });

  afterAll(() => {
    delete process.env.VSCODE_STORAGE_PATH;
    delete process.env.CLAUDE_DIR;
  });

  // AC-21/AC-23: Session ID validation for source resolution
  describe("isValidUuid", () => {
    it("returns true for valid UUID", () => {
      expect(isValidUuid("11111111-1111-1111-1111-111111111111")).toBe(true);
    });

    it("returns true for UUID with uppercase", () => {
      expect(isValidUuid("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")).toBe(true);
    });

    it("returns false for invalid format", () => {
      expect(isValidUuid("not-a-uuid")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isValidUuid("")).toBe(false);
    });

    it("returns false for UUID without dashes", () => {
      expect(isValidUuid("11111111111111111111111111111111")).toBe(false);
    });
  });

  describe("resolveSession", () => {
    // AC-21: System searches Claude first, then Copilot
    it("finds Claude-only session", async () => {
      // aaaaaaaa... only exists in Claude fixtures (test/fixtures/session-browser/projects/-Users-test-edgecases/)
      const result = await resolveSession("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

      expect(result).not.toBeNull();
      expect(result!.source).toBe("claude");
      expect(result!.location).toBe("-Users-test-edgecases");
    });

    // AC-21: System searches Claude first, then Copilot
    it("finds Copilot-only session", async () => {
      // 44444444... only exists in Copilot fixtures
      const result = await resolveSession("44444444-4444-4444-4444-444444444444");

      expect(result).not.toBeNull();
      expect(result!.source).toBe("copilot");
      expect(result!.location).toBe("abc123def456ghi789");
    });

    // AC-24: Display "Session not found" for non-existent IDs
    it("returns null for non-existent session", async () => {
      const result = await resolveSession("00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });

    // AC-24: Display "Session not found" for invalid input
    it("returns null for invalid UUID format", async () => {
      const result = await resolveSession("not-a-uuid");
      expect(result).toBeNull();
    });

    // AC-24: Display "Session not found" for empty input
    it("returns null for empty string", async () => {
      const result = await resolveSession("");
      expect(result).toBeNull();
    });

    // AC-21: Claude searched first (priority)
    it("searches Claude before Copilot when session exists in both", async () => {
      // 11111111... exists in BOTH Claude and Copilot fixtures
      // Claude should be returned first due to search priority
      const result = await resolveSession("11111111-1111-1111-1111-111111111111");

      expect(result).not.toBeNull();
      expect(result!.source).toBe("claude");
      expect(result!.location).toBe("-Users-test-projectalpha");
    });
  });
});
```

### 8.5 Claude Clone Summary Entry Tests (`test/services/claude-clone-summary.test.ts`)

Tests for the Claude clone service summary entry feature:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { cloneSession } from "../../src/services/session-clone.js";

describe("Claude Clone Summary Entry", () => {
  const claudeFixtures = path.join(process.cwd(), "test/fixtures/session-browser");

  beforeAll(() => {
    process.env.CLAUDE_DIR = claudeFixtures;
  });

  afterAll(() => {
    delete process.env.CLAUDE_DIR;
  });

  it("prepends summary entry to cloned session output", async () => {
    // This test will ERROR until Phase 6 implements the summary entry
    const result = await cloneSession({
      sessionId: "11111111-1111-1111-1111-111111111111",
      toolRemoval: "none",
      thinkingRemoval: "none"
    });

    // Parse the output JSONL
    const lines = result.session.split("\n").filter(l => l.trim());
    expect(lines.length).toBeGreaterThan(0);

    const firstEntry = JSON.parse(lines[0]);
    expect(firstEntry.type).toBe("summary");
    expect(firstEntry.summary).toMatch(/^Clone: .+ \(.+\)$/);
  });

  it("includes first user message in summary", async () => {
    const result = await cloneSession({
      sessionId: "11111111-1111-1111-1111-111111111111",
      toolRemoval: "none",
      thinkingRemoval: "none"
    });

    const lines = result.session.split("\n").filter(l => l.trim());
    const firstEntry = JSON.parse(lines[0]);

    // Summary should contain preview of first user message
    expect(firstEntry.summary).toContain("Clone:");
    // Should NOT be "(No message)" if session has user messages
    expect(firstEntry.summary).not.toContain("(No message)");
  });

  it("includes timestamp in summary", async () => {
    const result = await cloneSession({
      sessionId: "11111111-1111-1111-1111-111111111111",
      toolRemoval: "none",
      thinkingRemoval: "none"
    });

    const lines = result.session.split("\n").filter(l => l.trim());
    const firstEntry = JSON.parse(lines[0]);

    // Should have timestamp like "(Dec 12 2:30pm)"
    expect(firstEntry.summary).toMatch(/\([A-Z][a-z]{2} \d{1,2} \d{1,2}:\d{2}(am|pm)\)$/i);
  });

  it("sets leafUuid to first entry uuid", async () => {
    const result = await cloneSession({
      sessionId: "11111111-1111-1111-1111-111111111111",
      toolRemoval: "none",
      thinkingRemoval: "none"
    });

    const lines = result.session.split("\n").filter(l => l.trim());
    const summaryEntry = JSON.parse(lines[0]);
    const firstContentEntry = JSON.parse(lines[1]);

    expect(summaryEntry.leafUuid).toBe(firstContentEntry.uuid);
  });
});
```

**Note**: These tests will ERROR in Phase 5 because `cloneSession` doesn't yet prepend summary entries. Phase 6 Section 7 implements the feature.

### 9. Update Clone Page Template (`views/pages/clone.ejs`)

Add source indicator element:

```html
<!-- Add after session ID input field -->
<div id="source-resolve-indicator" class="hidden mt-2 text-sm">
  <!-- Populated by JavaScript -->
</div>
```

### 10. Update Clone Page JavaScript Skeleton (`public/js/pages/clone.js`)

Add skeleton for auto-detection (to be fully implemented in Phase 6):

```javascript
// Add state variables
let resolvedSource = null;
let resolvedLocation = null;

// Add skeleton function for session ID resolution
async function resolveSessionId(sessionId) {
  // Will be implemented in Phase 6
  console.log("Session resolution not yet implemented");
}

// Add skeleton for source indicator
function showSourceIndicator(source) {
  const indicator = document.getElementById("source-resolve-indicator");
  if (!indicator) return;
  // Will be implemented in Phase 6
}
```

## Verification

After completing this phase:

```bash
npm run typecheck  # Must pass - no type errors
npm test           # Clone and resolver tests ERROR (throw NotImplementedError)
```

Specifically:
- Existing tests still pass
- New copilot-clone tests ERROR because stubs throw NotImplementedError
- New source-resolver tests ERROR because stubs throw NotImplementedError
- Clone route returns 501 because service throws NotImplementedError
- Resolve route returns 501 because resolver throws NotImplementedError

## Done When

- TypeScript compiles without errors
- All existing tests still pass
- New files created:
  - `src/services/copilot-clone.ts`
  - `src/lib/source-resolver.ts`
  - `src/routes/copilot-clone.ts`
  - `src/routes/session-resolver.ts`
  - `test/services/copilot-clone.test.ts`
  - `test/lib/source-resolver.test.ts`
  - `test/services/claude-clone-summary.test.ts`
- `src/sources/claude-source.ts` updated with `findSession` stub
- Routes registered in `src/server.ts`
- Clone page template updated with source indicator element
- Clone page JS has skeleton functions
- **Behavior tests ERROR** (stubs throw NotImplementedError) - THIS IS CORRECT TDD RED

| Test Category | Expected Result |
|---------------|-----------------|
| Existing tests | PASS |
| CopilotCloneService.clone tests | ERROR (NotImplementedError) |
| CopilotCloneService.removeToolCalls tests | ERROR (NotImplementedError) |
| CopilotCloneService.compressByPercentage tests | ERROR (NotImplementedError) |
| CopilotCloneService.generateSessionId tests | ERROR (NotImplementedError) |
| CopilotCloneService.calculateStats tests | ERROR (NotImplementedError) |
| CopilotCloneService.generateCloneTitle tests | ERROR (NotImplementedError) |
| Claude Clone Summary Entry tests | ERROR (missing summary entry) |
| isValidUuid tests | ERROR (NotImplementedError) |
| resolveSession tests | ERROR (NotImplementedError) |
| POST /api/copilot/clone | Returns 501 |
| GET /api/resolve-session | Returns 501 |

Implement the complete phase. Deliver working code with proper TypeScript types, not a plan.
```
