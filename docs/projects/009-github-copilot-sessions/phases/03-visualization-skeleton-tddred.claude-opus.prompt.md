```prompt
# Phase 3: Visualization - Skeleton + TDD Red (Claude Opus 4.5)

## Objective

Create the visualization skeleton for Copilot sessions: unified token estimation utility, `CopilotStructureService` stubs, visualization route stubs, and **TDD Red tests that assert REAL behavior and will ERROR** because stubs throw `NotImplementedError`.

TDD Red means tests assert real expected behavior. Tests ERROR (throw) because stubs throw `NotImplementedError`. When Phase 4 implements real logic, these same tests will PASS.

## Context

Phases 1-2 implemented:
- `CopilotSessionSource` for session discovery and loading
- Session Browser with working source toggle
- API routes for listing projects and sessions

Now we add visualization support:
1. Unified `estimateTokens()` function used everywhere (replaces all existing token counting)
2. `CopilotStructureService` for extracting turns from Copilot sessions
3. Visualization routes for session structure and turns
4. Session detail page multi-source support

## Constraints

- All new service functions throw `NotImplementedError` - no real logic yet
- Token estimator is a pure function: `words * 0.75` rounded up
- No external libraries for token counting
- Tests assert REAL behavior - they will ERROR when stubs throw
- Follow existing patterns from `src/services/session-structure.ts`
- Token buckets must include `thinking` and `tool` for D3 visualization compatibility

## Reference Files

Read these files before writing code:
- `src/services/session-structure.ts` - Existing Claude structure service pattern
- `src/services/session-turns.ts` - Existing Claude turns service pattern
- `src/sources/copilot-source.ts` - Copilot session loading
- `src/sources/copilot-types.ts` - Copilot type definitions
- `public/js/pages/session-detail.js` - Frontend visualization
- `views/pages/session-detail.ejs` - Detail page template

## Deliverables

### 1. Create `src/lib/` Directory

Create the `src/lib/` directory for shared utility modules:

```bash
mkdir -p src/lib
```

### 2. Token Estimator (`src/lib/token-estimator.ts`)

Create token estimator file with stubs:

```typescript
import { NotImplementedError } from "../errors.js";

/**
 * Estimate token count from text using word count * 0.75.
 * This provides consistent estimation across all sources.
 *
 * @param text - The text to estimate tokens for
 * @returns Estimated token count (rounded up)
 */
export function estimateTokens(text: string): number {
  throw new NotImplementedError("estimateTokens");
}

/**
 * Content block types for token estimation.
 */
export interface ContentBlock {
  type: string;
  text?: string;
  input?: unknown;
  content?: string | unknown;
  thinking?: string;
}

/**
 * Estimate tokens for content that may be a string or ContentBlock array.
 * Handles Claude's content format and extracts text from blocks.
 *
 * @param content - String or array of content blocks
 * @returns Estimated token count
 */
export function estimateContentTokens(content: string | ContentBlock[]): number {
  throw new NotImplementedError("estimateContentTokens");
}
```

### 3. Frontend Token Estimator (`public/js/lib/token-estimator.js`)

Create `public/js/lib/` directory and frontend version (also stubs for now, will be implemented in Phase 4):

```bash
mkdir -p public/js/lib
```

```javascript
/**
 * Estimate token count from text using word count * 0.75.
 * @param {string} text - The text to estimate tokens for
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  throw new Error("Not implemented: estimateTokens");
}

/**
 * Estimate tokens for content that may be a string or block array.
 * @param {string|Array} content - String or array of content blocks
 * @returns {number} Estimated token count
 */
export function estimateContentTokens(content) {
  throw new Error("Not implemented: estimateContentTokens");
}
```

**Note**: Frontend JS tests are not in project scope. The token estimator is tested on the backend, and frontend behavior is verified through manual testing and integration tests.

### 4. Copilot Structure Types (`src/services/copilot-structure.ts`)

Create service with stubs. **IMPORTANT**: The `CopilotTokensByType` interface must include `thinking` and `tool` buckets for compatibility with the existing D3 visualization in `session-detail.js`, which expects all four token types:

```typescript
import { NotImplementedError } from "../errors.js";
import type { CopilotSession, CopilotRequest } from "../sources/copilot-types.js";

/**
 * Tool call information extracted from Copilot response.
 */
export interface CopilotToolCall {
  toolId: string;
  toolName: string;
  invocationMessage: string;
}

/**
 * Single turn data for Copilot visualization.
 */
export interface CopilotTurn {
  turnIndex: number;
  userMessage: string;
  userTokens: number;
  assistantResponse: string;
  assistantTokens: number;
  totalTokens: number;
  toolCalls: CopilotToolCall[];
  timestamp: number;
  isCanceled: boolean;
}

/**
 * Cumulative token counts by type.
 * Includes all four buckets for D3 visualization compatibility:
 * - user: User prompt tokens
 * - assistant: Assistant response tokens
 * - thinking: Always 0 for Copilot (Copilot doesn't expose thinking)
 * - tool: Tokens from toolInvocationSerialized items
 * - total: Sum of all token types
 */
export interface CopilotTokensByType {
  user: number;
  assistant: number;
  thinking: number;  // Always 0 for Copilot sessions
  tool: number;      // From toolInvocationSerialized response items
  total: number;
}

/**
 * Turn data with cumulative token statistics (matches Claude's TurnData structure).
 */
export interface CopilotTurnData {
  turnIndex: number;
  cumulative: CopilotTokensByType;
  content: {
    userPrompt: string;
    assistantResponse: string;
    toolCalls: CopilotToolCall[];
  };
}

/**
 * Full session structure for visualization.
 */
export interface CopilotSessionStructure {
  sessionId: string;
  source: "copilot";
  title: string;
  turnCount: number;
  totalTokens: number;
  createdAt: number;
  lastModifiedAt: number;
}

/**
 * Response payload for session turns endpoint.
 */
export interface CopilotSessionTurnsResponse {
  sessionId: string;
  source: "copilot";
  totalTurns: number;
  turns: CopilotTurnData[];
}

export class CopilotStructureService {
  /**
   * Get session structure metadata for visualization header.
   */
  async getStructure(sessionId: string, workspaceHash: string): Promise<CopilotSessionStructure> {
    throw new NotImplementedError("CopilotStructureService.getStructure");
  }

  /**
   * Get all turns with cumulative token counts for visualization.
   */
  async getTurns(sessionId: string, workspaceHash: string): Promise<CopilotSessionTurnsResponse> {
    throw new NotImplementedError("CopilotStructureService.getTurns");
  }

  /**
   * Get a specific turn by index.
   */
  async getTurn(sessionId: string, workspaceHash: string, turnIndex: number): Promise<CopilotTurnData | null> {
    throw new NotImplementedError("CopilotStructureService.getTurn");
  }
}

// Export singleton
export const copilotStructureService = new CopilotStructureService();
```

### 5. Visualization Routes (`src/routes/copilot-visualization.ts`)

Create route stubs:

```typescript
import { Router } from "express";
import validate from "express-zod-safe";
import { z } from "zod";
import { copilotStructureService } from "../services/copilot-structure.js";
import { NotImplementedError } from "../errors.js";

export const copilotVisualizationRouter = Router();

const SessionParamsSchema = z.object({
  sessionId: z.string().min(1, "Session ID required")
});

const WorkspaceQuerySchema = z.object({
  workspace: z.string().min(1, "Workspace hash required")
});

const TurnParamsSchema = z.object({
  sessionId: z.string().min(1, "Session ID required"),
  turnIndex: z.string().regex(/^\d+$/, "Turn index must be a number")
});

// GET /api/copilot/session/:sessionId/structure
copilotVisualizationRouter.get(
  "/api/copilot/session/:sessionId/structure",
  validate({ params: SessionParamsSchema, query: WorkspaceQuerySchema }),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { workspace } = req.query as { workspace: string };

      const structure = await copilotStructureService.getStructure(sessionId, workspace);
      res.json(structure);
    } catch (error) {
      if (error instanceof NotImplementedError) {
        return res.status(501).json({
          error: { message: "Copilot visualization not yet implemented", code: "NOT_IMPLEMENTED" }
        });
      }
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return res.status(404).json({
          error: { message: "Session not found", code: "NOT_FOUND" }
        });
      }
      console.error("Failed to get Copilot session structure:", error);
      res.status(500).json({ error: { message: "Failed to load session structure" } });
    }
  }
);

// GET /api/copilot/session/:sessionId/turns
copilotVisualizationRouter.get(
  "/api/copilot/session/:sessionId/turns",
  validate({ params: SessionParamsSchema, query: WorkspaceQuerySchema }),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { workspace } = req.query as { workspace: string };

      const turns = await copilotStructureService.getTurns(sessionId, workspace);
      res.json(turns);
    } catch (error) {
      if (error instanceof NotImplementedError) {
        return res.status(501).json({
          error: { message: "Copilot visualization not yet implemented", code: "NOT_IMPLEMENTED" }
        });
      }
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return res.status(404).json({
          error: { message: "Session not found", code: "NOT_FOUND" }
        });
      }
      console.error("Failed to get Copilot session turns:", error);
      res.status(500).json({ error: { message: "Failed to load session turns" } });
    }
  }
);

// GET /api/copilot/session/:sessionId/turn/:turnIndex
copilotVisualizationRouter.get(
  "/api/copilot/session/:sessionId/turn/:turnIndex",
  validate({ params: TurnParamsSchema, query: WorkspaceQuerySchema }),
  async (req, res) => {
    try {
      const { sessionId, turnIndex } = req.params;
      const { workspace } = req.query as { workspace: string };

      const turn = await copilotStructureService.getTurn(
        sessionId,
        workspace,
        parseInt(turnIndex, 10)
      );

      if (!turn) {
        return res.status(404).json({
          error: { message: "Turn not found", code: "NOT_FOUND" }
        });
      }

      res.json(turn);
    } catch (error) {
      if (error instanceof NotImplementedError) {
        return res.status(501).json({
          error: { message: "Copilot visualization not yet implemented", code: "NOT_IMPLEMENTED" }
        });
      }
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return res.status(404).json({
          error: { message: "Session not found", code: "NOT_FOUND" }
        });
      }
      console.error("Failed to get Copilot turn:", error);
      res.status(500).json({ error: { message: "Failed to load turn" } });
    }
  }
);
```

### 6. Register Routes (`src/server.ts`)

Add import and registration:

```typescript
// Add import
import { copilotVisualizationRouter } from "./routes/copilot-visualization.js";

// Register route (add after other route registrations)
app.use("/", copilotVisualizationRouter);
```

### 7. Token Estimator Tests (`test/lib/token-estimator.test.ts`)

Create `test/lib/` directory and tests with AC traceability:

```bash
mkdir -p test/lib
```

```typescript
import { describe, it, expect } from "vitest";
import { estimateTokens, estimateContentTokens } from "../../src/lib/token-estimator.js";

describe("Token Estimator", () => {
  // AC-30: All token displays use estimateTokens(text) function: Math.ceil(wordCount * 0.75)
  describe("estimateTokens", () => {
    it("returns 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });

    it("returns 0 for whitespace only", () => {
      expect(estimateTokens("   ")).toBe(0);
    });

    it("returns 0 for null/undefined", () => {
      expect(estimateTokens(null as unknown as string)).toBe(0);
      expect(estimateTokens(undefined as unknown as string)).toBe(0);
    });

    // AC-30: wordCount * 0.75 rounded up
    it("counts single word", () => {
      // 1 word * 0.75 = 0.75, ceil = 1
      expect(estimateTokens("hello")).toBe(1);
    });

    // AC-30: wordCount * 0.75 rounded up
    it("calculates words * 0.75 rounded up", () => {
      // 4 words * 0.75 = 3.0, ceil = 3
      expect(estimateTokens("one two three four")).toBe(3);
    });

    // AC-30: wordCount * 0.75 rounded up
    it("rounds up fractional results", () => {
      // 2 words * 0.75 = 1.5, ceil = 2
      expect(estimateTokens("one two")).toBe(2);
    });

    it("handles multiple spaces", () => {
      // Still 3 words: 3 * 0.75 = 2.25, ceil = 3
      expect(estimateTokens("one   two   three")).toBe(3);
    });

    it("handles leading/trailing whitespace", () => {
      // 2 words * 0.75 = 1.5, ceil = 2
      expect(estimateTokens("  hello world  ")).toBe(2);
    });

    it("handles newlines", () => {
      // 4 words * 0.75 = 3.0, ceil = 3
      expect(estimateTokens("line one\nline two")).toBe(3);
    });

    it("handles tabs", () => {
      // 3 words * 0.75 = 2.25, ceil = 3
      expect(estimateTokens("one\ttwo\tthree")).toBe(3);
    });

    // AC-30: Consistent estimation for large content
    it("handles 100 words", () => {
      const text = Array(100).fill("word").join(" ");
      // 100 * 0.75 = 75.0, ceil = 75
      expect(estimateTokens(text)).toBe(75);
    });

    it("handles 1000 words", () => {
      const text = Array(1000).fill("word").join(" ");
      // 1000 * 0.75 = 750.0, ceil = 750
      expect(estimateTokens(text)).toBe(750);
    });

    it("handles mixed whitespace", () => {
      // 3 words * 0.75 = 2.25, ceil = 3
      expect(estimateTokens("one  \n  two  \t  three")).toBe(3);
    });
  });

  // AC-30, AC-31: Token estimation for structured content blocks
  describe("estimateContentTokens", () => {
    it("handles string content", () => {
      // 2 words * 0.75 = 1.5, ceil = 2
      expect(estimateContentTokens("hello world")).toBe(2);
    });

    it("handles empty string", () => {
      expect(estimateContentTokens("")).toBe(0);
    });

    it("handles text block", () => {
      const blocks = [{ type: "text", text: "hello world" }];
      // 2 words * 0.75 = 1.5, ceil = 2
      expect(estimateContentTokens(blocks)).toBe(2);
    });

    it("handles multiple text blocks", () => {
      const blocks = [
        { type: "text", text: "hello world" },
        { type: "text", text: "foo bar baz" }
      ];
      // Each block calculated separately with ceil:
      // Block 1: 2 words * 0.75 = 1.5, ceil = 2 tokens
      // Block 2: 3 words * 0.75 = 2.25, ceil = 3 tokens
      // Total: 2 + 3 = 5 tokens
      expect(estimateContentTokens(blocks)).toBe(5);
    });

    it("handles tool_use block", () => {
      const blocks = [{ type: "tool_use", input: { command: "ls -la" } }];
      expect(estimateContentTokens(blocks)).toBeGreaterThan(0);
    });

    it("handles tool_result block with string", () => {
      const blocks = [{ type: "tool_result", content: "file1 file2 file3" }];
      // 3 words * 0.75 = 2.25, ceil = 3
      expect(estimateContentTokens(blocks)).toBe(3);
    });

    it("handles thinking block", () => {
      const blocks = [{ type: "thinking", thinking: "Let me think about this problem" }];
      // 6 words * 0.75 = 4.5, ceil = 5
      expect(estimateContentTokens(blocks)).toBe(5);
    });

    it("handles empty array", () => {
      expect(estimateContentTokens([])).toBe(0);
    });

    it("handles unknown block types", () => {
      const blocks = [{ type: "unknown", data: "something" }];
      expect(estimateContentTokens(blocks)).toBe(0);
    });

    it("handles mixed block types", () => {
      const blocks = [
        { type: "text", text: "hello world" },
        { type: "thinking", thinking: "let me think" },
        { type: "unknown", data: "ignored" }
      ];
      // Each block calculated separately with ceil:
      // text: 2 words * 0.75 = 1.5, ceil = 2 tokens
      // thinking: 3 words * 0.75 = 2.25, ceil = 3 tokens
      // unknown: 0 tokens
      // Total: 2 + 3 + 0 = 5 tokens
      expect(estimateContentTokens(blocks)).toBe(5);
    });

    it("handles null/undefined", () => {
      expect(estimateContentTokens(null as unknown as string)).toBe(0);
      expect(estimateContentTokens(undefined as unknown as string)).toBe(0);
    });
  });
});
```

### 8. Copilot Structure Service Tests (`test/services/copilot-structure.test.ts`)

Create `test/services/` directory if needed and tests with AC traceability:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { CopilotStructureService } from "../../src/services/copilot-structure.js";

describe("CopilotStructureService", () => {
  let service: CopilotStructureService;
  const fixturesPath = path.join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = fixturesPath;
    service = new CopilotStructureService();
  });

  afterAll(() => {
    delete process.env.VSCODE_STORAGE_PATH;
  });

  // AC-34: Session detail page renders Copilot sessions with same UI as Claude sessions
  describe("getStructure", () => {
    it("returns session structure metadata", async () => {
      const structure = await service.getStructure(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789"
      );

      expect(structure.sessionId).toBe("11111111-1111-1111-1111-111111111111");
      expect(structure.source).toBe("copilot");
      expect(structure.turnCount).toBe(2);
    });

    it("includes title from customTitle", async () => {
      const structure = await service.getStructure(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789"
      );

      expect(structure.title).toBe("Test Session Alpha-1");
    });

    // AC-30: All token displays use estimateTokens function
    it("calculates total tokens", async () => {
      const structure = await service.getStructure(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789"
      );

      expect(structure.totalTokens).toBeGreaterThan(0);
    });

    it("includes timestamps", async () => {
      const structure = await service.getStructure(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789"
      );

      expect(structure.createdAt).toBeGreaterThan(0);
      expect(structure.lastModifiedAt).toBeGreaterThan(0);
    });

    it("throws for non-existent session", async () => {
      await expect(
        service.getStructure("nonexistent", "abc123def456ghi789")
      ).rejects.toThrow();
    });
  });

  // AC-35: Turn-based view shows user prompts and assistant responses
  // AC-36: Token bars display estimated tokens per turn
  // AC-37: Cumulative token tracking works across turns
  describe("getTurns", () => {
    it("returns turns response with metadata", async () => {
      const response = await service.getTurns(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789"
      );

      expect(response.sessionId).toBe("11111111-1111-1111-1111-111111111111");
      expect(response.source).toBe("copilot");
      expect(response.totalTurns).toBe(2);
      expect(response.turns).toHaveLength(2);
    });

    // AC-36: Token bars display estimated tokens per turn
    // AC-37: Cumulative token tracking works across turns
    it("returns turns with cumulative token counts including all buckets", async () => {
      const response = await service.getTurns(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789"
      );

      const turn = response.turns[0];
      expect(turn).toHaveProperty("turnIndex", 0);
      expect(turn).toHaveProperty("cumulative");
      // All four buckets must be present for D3 visualization
      expect(turn.cumulative).toHaveProperty("user");
      expect(turn.cumulative).toHaveProperty("assistant");
      expect(turn.cumulative).toHaveProperty("thinking");
      expect(turn.cumulative).toHaveProperty("tool");
      expect(turn.cumulative).toHaveProperty("total");
      // Copilot doesn't have thinking, should be 0
      expect(turn.cumulative.thinking).toBe(0);
    });

    // AC-35: Turn-based view shows user prompts and assistant responses
    it("returns turns with content", async () => {
      const response = await service.getTurns(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789"
      );

      const turn = response.turns[0];
      expect(turn.content).toHaveProperty("userPrompt");
      expect(turn.content).toHaveProperty("assistantResponse");
      expect(turn.content).toHaveProperty("toolCalls");
      expect(turn.content.userPrompt).toContain("refactor");
    });

    // AC-37: Cumulative token tracking works across turns
    it("calculates cumulative tokens across turns", async () => {
      const response = await service.getTurns(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789"
      );

      if (response.turns.length >= 2) {
        const turn1Total = response.turns[0].cumulative.total;
        const turn2Total = response.turns[1].cumulative.total;
        expect(turn2Total).toBeGreaterThanOrEqual(turn1Total);
      }
    });

    it("excludes canceled turns from count", async () => {
      const response = await service.getTurns(
        "33333333-3333-3333-3333-333333333333",
        "xyz987uvw654rst321"
      );

      // Session has 3 requests, 1 canceled = 2 turns
      expect(response.totalTurns).toBe(2);
      expect(response.turns).toHaveLength(2);
    });
  });

  // AC-38: Playback controls (previous/next turn) work identically to Claude
  describe("getTurn", () => {
    it("returns specific turn by index", async () => {
      const turn = await service.getTurn(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        0
      );

      expect(turn).not.toBeNull();
      expect(turn!.turnIndex).toBe(0);
    });

    it("returns second turn", async () => {
      const turn = await service.getTurn(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        1
      );

      expect(turn).not.toBeNull();
      expect(turn!.turnIndex).toBe(1);
    });

    it("returns null for invalid index", async () => {
      const turn = await service.getTurn(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        999
      );

      expect(turn).toBeNull();
    });

    it("returns null for negative index", async () => {
      const turn = await service.getTurn(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        -1
      );

      expect(turn).toBeNull();
    });
  });
});
```

### 9. Update Test Fixtures

Update the existing fixture to have richer response content for token estimation testing.

Update `test/fixtures/copilot-sessions/workspaceStorage/abc123def456ghi789/chatSessions/11111111-1111-1111-1111-111111111111.json`:

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
      "response": [
        { "kind": "markdownContent", "value": "I'll help you refactor the authentication module to use JWT tokens. Here's how we can approach this:" }
      ],
      "isCanceled": false,
      "timestamp": 1733900000000
    },
    {
      "requestId": "request_2",
      "message": { "text": "Add error handling for token expiration", "parts": [] },
      "response": [
        { "kind": "markdownContent", "value": "I'll add comprehensive error handling for token expiration scenarios." }
      ],
      "isCanceled": false,
      "timestamp": 1733910000000
    }
  ],
  "requesterUsername": "testuser",
  "responderUsername": "GitHub Copilot"
}
```

## Verification

After completing this phase:

```bash
mkdir -p src/lib test/lib public/js/lib  # Ensure directories exist
npm run typecheck  # Must pass - no type errors
npm test           # Token estimator and structure tests ERROR (throw NotImplementedError)
```

Specifically:
- Existing tests still pass
- New token-estimator tests ERROR because stubs throw NotImplementedError
- New copilot-structure tests ERROR because stubs throw NotImplementedError
- Visualization routes return 501 because service throws NotImplementedError

## Done When

- TypeScript compiles without errors
- All existing tests still pass
- New directories created:
  - `src/lib/`
  - `test/lib/`
  - `public/js/lib/`
- New files created:
  - `src/lib/token-estimator.ts`
  - `public/js/lib/token-estimator.js`
  - `src/services/copilot-structure.ts`
  - `src/routes/copilot-visualization.ts`
  - `test/lib/token-estimator.test.ts`
  - `test/services/copilot-structure.test.ts`
- Routes registered in `src/server.ts`
- Test fixtures updated with response content
- `CopilotTokensByType` includes all four buckets: `user`, `assistant`, `thinking`, `tool`
- **Behavior tests ERROR** (stubs throw NotImplementedError) - THIS IS CORRECT TDD RED

| Test Category | Expected Result |
|---------------|-----------------|
| Existing tests | PASS |
| estimateTokens tests | ERROR (NotImplementedError) |
| estimateContentTokens tests | ERROR (NotImplementedError) |
| CopilotStructureService.getStructure tests | ERROR (NotImplementedError) |
| CopilotStructureService.getTurns tests | ERROR (NotImplementedError) |
| CopilotStructureService.getTurn tests | ERROR (NotImplementedError) |
| GET /api/copilot/session/:id/structure | Returns 501 |
| GET /api/copilot/session/:id/turns | Returns 501 |
| GET /api/copilot/session/:id/turn/:index | Returns 501 |

Implement the complete phase. Deliver working code with proper TypeScript types, not a plan.
```
