```prompt
# Phase 4: Visualization - TDD Green (Claude Opus 4.5)

## Objective

Implement the visualization components to make all Phase 3 tests pass: unified token estimation, `CopilotStructureService`, and session detail page multi-source support. Replace `NotImplementedError` stubs with real logic.

TDD Green means the tests written in Phase 3 (which asserted real behavior) now PASS because implementations return correct values.

## Context

Phase 3 created:
- `src/lib/token-estimator.ts` - Stubs throwing NotImplementedError
- `public/js/lib/token-estimator.js` - Frontend stubs
- `src/services/copilot-structure.ts` - Service stubs
- `src/routes/copilot-visualization.ts` - Route stubs returning 501
- Tests asserting real behavior (currently ERROR)

Your job is to implement the real logic so tests pass and visualization works.

## Constraints

- Token estimation formula: `Math.ceil(words * 0.75)`
- No external libraries for token counting
- Reuse `CopilotSessionSource.loadSession()` from Phase 2
- Do NOT modify test files - make the code pass existing tests
- Refactor existing Claude visualization to use new token estimator

## Token Algorithm Migration

**IMPORTANT**: This phase changes the token estimation algorithm from `chars/4` to `words * 0.75` per AC-30.

### What Changes

| File | Current Algorithm | New Algorithm |
|------|-------------------|---------------|
| `src/services/session-structure.ts` | `estimateTokens` from `compression.ts` (chars/4) | `estimateTokens` from `lib/token-estimator.ts` (words*0.75) |
| `src/services/session-turns.ts` | `estimateTokens` from `compression.ts` (chars/4) | `estimateTokens` from `lib/token-estimator.ts` (words*0.75) |

### What Does NOT Change

| File | Reason |
|------|--------|
| `src/services/compression.ts` | Keep chars/4 - used for compression decisions, not display. Changing would affect compression batch sizing. |

### Migration Steps

1. Update import in `src/services/session-structure.ts`:
   ```typescript
   // CHANGE FROM:
   import { estimateTokens } from "./compression.js";
   // CHANGE TO:
   import { estimateTokens } from "../lib/token-estimator.js";
   ```

2. Update import in `src/services/session-turns.ts`:
   ```typescript
   // CHANGE FROM:
   import { estimateTokens } from "./compression.js";
   // CHANGE TO:
   import { estimateTokens } from "../lib/token-estimator.js";
   ```

**Note**: This is an intentional behavior change per AC-30, AC-31, AC-32, AC-33. Token counts displayed in visualization will differ from previous values. The words*0.75 heuristic is more accurate for natural language content.

## Reference Files

Read these files before implementing:
- `src/lib/token-estimator.ts` - Your stubs to implement
- `src/services/copilot-structure.ts` - Your service stubs to implement
- `src/services/session-structure.ts` - Claude structure pattern to follow
- `src/services/session-turns.ts` - Claude turns pattern to follow
- `test/lib/token-estimator.test.ts` - Tests that must pass
- `test/services/copilot-structure.test.ts` - Tests that must pass

## Deliverables

### 1. Implement Token Estimator (`src/lib/token-estimator.ts`)

```typescript
/**
 * Estimate token count from text using word count * 0.75.
 * This provides consistent estimation across all sources.
 *
 * @param text - The text to estimate tokens for
 * @returns Estimated token count (rounded up)
 */
export function estimateTokens(text: string): number {
  if (!text || typeof text !== "string") return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 0.75);
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
  if (!content) return 0;

  if (typeof content === "string") {
    return estimateTokens(content);
  }

  if (!Array.isArray(content)) return 0;

  return content.reduce((sum, block) => {
    switch (block.type) {
      case "text":
        return sum + estimateTokens(block.text || "");
      case "tool_use":
        return sum + estimateTokens(JSON.stringify(block.input || {}));
      case "tool_result":
        return sum + estimateTokens(
          typeof block.content === "string" ? block.content : JSON.stringify(block.content || {})
        );
      case "thinking":
        return sum + estimateTokens(block.thinking || "");
      default:
        return sum;
    }
  }, 0);
}
```

### 2. Implement Frontend Token Estimator (`public/js/lib/token-estimator.js`)

```javascript
/**
 * Estimate token count from text using word count * 0.75.
 * @param {string} text - The text to estimate tokens for
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text || typeof text !== "string") return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 0.75);
}

/**
 * Estimate tokens for content that may be a string or block array.
 * @param {string|Array} content - String or array of content blocks
 * @returns {number} Estimated token count
 */
export function estimateContentTokens(content) {
  if (!content) return 0;

  if (typeof content === "string") {
    return estimateTokens(content);
  }

  if (!Array.isArray(content)) return 0;

  return content.reduce((sum, block) => {
    switch (block.type) {
      case "text":
        return sum + estimateTokens(block.text || "");
      case "tool_use":
        return sum + estimateTokens(JSON.stringify(block.input || {}));
      case "tool_result":
        return sum + estimateTokens(
          typeof block.content === "string" ? block.content : JSON.stringify(block.content || {})
        );
      case "thinking":
        return sum + estimateTokens(block.thinking || "");
      default:
        return sum;
    }
  }, 0);
}
```

### 3. Implement CopilotStructureService (`src/services/copilot-structure.ts`)

**IMPORTANT**: The interface must include all four token buckets (`user`, `assistant`, `thinking`, `tool`) for D3 visualization compatibility. Copilot sets `thinking` to 0 since it doesn't expose thinking content.

```typescript
import { getSessionSource } from "../sources/index.js";
import type { CopilotSessionSource } from "../sources/copilot-source.js";
import type { CopilotSession, CopilotRequest, CopilotResponseItem } from "../sources/copilot-types.js";
import { estimateTokens } from "../lib/token-estimator.js";

/**
 * Tool call information extracted from Copilot response.
 */
export interface CopilotToolCall {
  toolId: string;
  toolName: string;
  invocationMessage: string;
}

/**
 * Cumulative token counts by type.
 * All four buckets required for D3 visualization compatibility.
 */
export interface CopilotTokensByType {
  user: number;
  assistant: number;
  thinking: number;  // Always 0 for Copilot
  tool: number;      // From toolInvocationSerialized items
  total: number;
}

/**
 * Turn data with cumulative token statistics.
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
    const source = getSessionSource("copilot") as CopilotSessionSource;
    const session = await source.loadSession(sessionId, workspaceHash);

    const nonCanceledRequests = session.requests.filter(r => !r.isCanceled);
    const totalTokens = this.calculateTotalTokens(nonCanceledRequests);

    return {
      sessionId: session.sessionId,
      source: "copilot",
      title: session.customTitle || "Untitled Session",
      turnCount: nonCanceledRequests.length,
      totalTokens,
      createdAt: session.creationDate,
      lastModifiedAt: session.lastMessageDate,
    };
  }

  /**
   * Get all turns with cumulative token counts for visualization.
   */
  async getTurns(sessionId: string, workspaceHash: string): Promise<CopilotSessionTurnsResponse> {
    const source = getSessionSource("copilot") as CopilotSessionSource;
    const session = await source.loadSession(sessionId, workspaceHash);

    const nonCanceledRequests = session.requests.filter(r => !r.isCanceled);
    const turns = this.extractTurnsWithCumulative(nonCanceledRequests);

    return {
      sessionId: session.sessionId,
      source: "copilot",
      totalTurns: turns.length,
      turns,
    };
  }

  /**
   * Get a specific turn by index.
   */
  async getTurn(sessionId: string, workspaceHash: string, turnIndex: number): Promise<CopilotTurnData | null> {
    if (turnIndex < 0) return null;

    const response = await this.getTurns(sessionId, workspaceHash);

    if (turnIndex >= response.turns.length) return null;

    return response.turns[turnIndex];
  }

  /**
   * Extract turns with cumulative token counts.
   * Includes all four buckets for D3 visualization compatibility.
   */
  private extractTurnsWithCumulative(requests: CopilotRequest[]): CopilotTurnData[] {
    let cumulativeUser = 0;
    let cumulativeAssistant = 0;
    let cumulativeTool = 0;
    // cumulativeThinking is always 0 for Copilot

    return requests.map((request, index) => {
      const userPrompt = request.message.text;
      const assistantResponse = this.extractAssistantText(request.response);
      const toolCalls = this.extractToolCalls(request.response);

      const userTokens = estimateTokens(userPrompt);
      const assistantTokens = estimateTokens(assistantResponse);
      const toolTokens = this.calculateToolTokens(request.response);

      cumulativeUser += userTokens;
      cumulativeAssistant += assistantTokens;
      cumulativeTool += toolTokens;

      return {
        turnIndex: index,
        cumulative: {
          user: cumulativeUser,
          assistant: cumulativeAssistant,
          thinking: 0,  // Copilot doesn't expose thinking
          tool: cumulativeTool,
          total: cumulativeUser + cumulativeAssistant + cumulativeTool,
        },
        content: {
          userPrompt,
          assistantResponse,
          toolCalls,
        },
      };
    });
  }

  /**
   * Calculate total tokens for all requests.
   */
  private calculateTotalTokens(requests: CopilotRequest[]): number {
    return requests.reduce((total, request) => {
      const userTokens = estimateTokens(request.message.text);
      const assistantTokens = estimateTokens(this.extractAssistantText(request.response));
      const toolTokens = this.calculateToolTokens(request.response);
      return total + userTokens + assistantTokens + toolTokens;
    }, 0);
  }

  /**
   * Calculate tokens from tool invocation items.
   */
  private calculateToolTokens(response: CopilotResponseItem[]): number {
    let toolTokens = 0;

    for (const item of response) {
      if (typeof item === "object" && item !== null && item.kind === "toolInvocationSerialized") {
        // Estimate tokens from the tool invocation content
        const invMsg = this.extractInvocationMessage(item);
        toolTokens += estimateTokens(invMsg);
      }
    }

    return toolTokens;
  }

  /**
   * Extract assistant text from response items.
   */
  private extractAssistantText(response: CopilotResponseItem[]): string {
    const textParts: string[] = [];

    for (const item of response) {
      if (typeof item === "object" && item !== null) {
        // Text response items have a 'value' string property with kind 'markdownContent'
        if ("value" in item && typeof item.value === "string") {
          textParts.push(item.value);
        }
      }
    }

    return textParts.join("\n\n");
  }

  /**
   * Extract tool call information from response items.
   */
  private extractToolCalls(response: CopilotResponseItem[]): CopilotToolCall[] {
    const toolCalls: CopilotToolCall[] = [];

    for (const item of response) {
      if (typeof item === "object" && item !== null && item.kind === "toolInvocationSerialized") {
        const toolId = (item as { toolId?: string }).toolId || "unknown";
        toolCalls.push({
          toolId,
          toolName: toolId.replace("copilot_", ""),
          invocationMessage: this.extractInvocationMessage(item),
        });
      }
    }

    return toolCalls;
  }

  /**
   * Extract invocation message from tool item.
   */
  private extractInvocationMessage(item: CopilotResponseItem): string {
    const invMsg = (item as { invocationMessage?: unknown }).invocationMessage;
    if (typeof invMsg === "string") return invMsg;
    if (typeof invMsg === "object" && invMsg !== null && "value" in invMsg) {
      return String((invMsg as { value: unknown }).value);
    }
    return "Tool invocation";
  }
}

// Export singleton
export const copilotStructureService = new CopilotStructureService();
```

### 4. Update Routes (`src/routes/copilot-visualization.ts`)

Remove the NotImplementedError handling now that the service is implemented:

```typescript
import { Router } from "express";
import validate from "express-zod-safe";
import { z } from "zod";
import { copilotStructureService } from "../services/copilot-structure.js";

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

### 5. Update Session Detail Page (`public/js/pages/session-detail.js`)

This is a **complete integration** showing all changes needed. The key changes are:

1. Add source and workspace state variables
2. Parse URL parameters for source detection
3. Update `handleLoad()` to use source-aware API endpoints
4. Add source indicator rendering
5. Replace the existing `estimateTokensFromText()` function with import from token-estimator

**Add these changes to the existing file:**

```javascript
// ============================================================
// AT THE TOP OF THE FILE - Add import
// ============================================================
import { estimateTokens } from "../lib/token-estimator.js";

// ============================================================
// AFTER THE EXISTING STATE VARIABLES (around line 20-25)
// Add these new state variables:
// ============================================================
let currentSource = "claude";
let currentWorkspace = null;

// ============================================================
// REPLACE the existing init() function with this version:
// ============================================================
function init() {
  // Get DOM elements
  sessionInput = document.getElementById("sessionInput");
  loadButton = document.getElementById("loadButton");
  errorMessage = document.getElementById("errorMessage");
  loadingIndicator = document.getElementById("loadingIndicator");
  visualizationSection = document.getElementById("visualizationSection");
  leftButton = document.getElementById("leftButton");
  turnInput = document.getElementById("turnInput");
  rightButton = document.getElementById("rightButton");
  turnSlider = document.getElementById("turnSlider");
  turnLabel = document.getElementById("turnLabel");
  scaleInput = document.getElementById("scaleInput");
  scaleWarning = document.getElementById("scaleWarning");
  visualizationContainer = document.getElementById("visualizationContainer");
  tokenStats = document.getElementById("tokenStats");
  detailCard = document.getElementById("detailCard");
  turnRail = document.getElementById("turnRail");
  playButton = document.getElementById("playButton");
  resetButton = document.getElementById("resetButton");
  speedSelect = document.getElementById("speedSelect");
  cloneLink = document.getElementById("cloneLink");

  // Attach event listeners
  loadButton.addEventListener("click", handleLoad);
  leftButton.addEventListener("click", handleLeftClick);
  rightButton.addEventListener("click", handleRightClick);
  turnInput.addEventListener("change", handleTurnInputChange);
  turnSlider.addEventListener("input", handleSliderChange);
  scaleInput.addEventListener("change", handleScaleInputChange);
  playButton.addEventListener("click", handlePlayPause);
  resetButton.addEventListener("click", handleReset);
  speedSelect.addEventListener("change", handleSpeedChange);

  // Parse URL parameters for source-aware loading
  const urlParams = new URLSearchParams(window.location.search);
  const sessionIdFromUrl = urlParams.get("id") || urlParams.get("sessionId");
  currentSource = urlParams.get("source") || "claude";
  currentWorkspace = urlParams.get("workspace");

  // Render source indicator
  renderSourceIndicator();

  // Auto-load if session ID provided in URL
  if (sessionIdFromUrl) {
    sessionInput.value = sessionIdFromUrl;
    handleLoad();
  }
}

// ============================================================
// REPLACE the existing handleLoad() function with this version:
// ============================================================
async function handleLoad() {
  const sessionId = sessionInput.value.trim();
  if (!sessionId) {
    showError("Please enter a session ID");
    return;
  }

  hideError();
  setLoading(true);

  try {
    // Build source-appropriate API URL
    let turnsUrl;
    if (currentSource === "copilot") {
      if (!currentWorkspace) {
        throw new Error("Workspace required for Copilot sessions. Navigate from Session Browser.");
      }
      turnsUrl = `/api/copilot/session/${sessionId}/turns?workspace=${encodeURIComponent(currentWorkspace)}`;
    } else {
      turnsUrl = `/api/session/${sessionId}/turns`;
    }

    sessionData = await get(turnsUrl);
    setLoading(false);
    currentTurn = Math.max(0, sessionData.totalTurns - 1);

    // Setup navigation bounds (1-based display)
    const maxTurnDisplay = Math.max(1, sessionData.totalTurns);
    turnSlider.max = maxTurnDisplay;
    turnInput.max = maxTurnDisplay;

    // Show visualization section
    visualizationSection.classList.remove("hidden");

    // Update clone link with current session ID and source
    if (cloneLink) {
      if (currentSource === "copilot") {
        cloneLink.href = `/session-clone?sessionId=${encodeURIComponent(sessionId)}&source=copilot&workspace=${encodeURIComponent(currentWorkspace)}`;
      } else {
        cloneLink.href = `/session-clone?sessionId=${encodeURIComponent(sessionId)}`;
      }
      cloneLink.classList.remove("hidden");
    }

    // Render initial state
    syncNavigation();
    checkScaleWarning();
    renderVisualization();
    renderDetailCard();
    renderTurnRail();
  } catch (error) {
    setLoading(false);
    clearVisualization();
    showError(error?.message || "Failed to load session");
  }
}

// ============================================================
// ADD this new function (after handleLoad or with other render functions):
// ============================================================
/**
 * Render source indicator badge showing Claude Code or GitHub Copilot.
 */
function renderSourceIndicator() {
  const indicator = document.getElementById("source-indicator");
  if (!indicator) return;

  if (currentSource === "copilot") {
    indicator.textContent = "GitHub Copilot";
    indicator.className = "inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800";
  } else {
    indicator.textContent = "Claude Code";
    indicator.className = "inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800";
  }
}

// ============================================================
// REMOVE the existing estimateTokensFromText() function (around line 519-524)
// and UPDATE renderTurnRail() to use the imported estimateTokens instead:
// ============================================================
// In renderTurnRail(), change:
//   const tokens = estimateTokensFromText(segment.text);
// To:
//   const tokens = estimateTokens(segment.text);
```

### 6. Update Session Detail Template (`views/pages/session-detail.ejs`)

Add the source indicator element. Find this existing code around line 16:

```html
    <h1 class="text-2xl font-bold mb-6">Session Detail</h1>
```

**Replace it with:**

```html
    <div class="flex items-center gap-4 mb-6">
      <h1 class="text-2xl font-bold">Session Detail</h1>
      <span id="source-indicator" class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
        Claude Code
      </span>
    </div>
```

### 7. Update Session Browser to Pass Source in Details Link (`public/js/pages/session-browser.js`)

Find where session action links are generated (in `renderSessionTable` or similar). The Details link needs to include source and workspace parameters.

**Add this helper function if not present:**

```javascript
/**
 * Get the currently selected folder/workspace from the project dropdown.
 * @returns {string} The selected folder value
 */
function getCurrentFolder() {
  const projectSelect = document.getElementById("project-select");
  return projectSelect ? projectSelect.value : "";
}
```

**Update the Details link generation:**

In the session row rendering (typically in `renderSessionTable`), update the Details link:

```javascript
// CHANGE FROM (if present):
// <a href="/session-detail?id=${session.sessionId}" ...>Details</a>

// CHANGE TO:
function getDetailsUrl(session) {
  const sessionId = session.sessionId;
  if (currentSource === "copilot") {
    const folder = getCurrentFolder();
    return `/session-detail?sessionId=${encodeURIComponent(sessionId)}&source=copilot&workspace=${encodeURIComponent(folder)}`;
  } else {
    return `/session-detail?sessionId=${encodeURIComponent(sessionId)}&source=claude`;
  }
}

// Use in template:
// <a href="${getDetailsUrl(session)}" class="text-blue-600 hover:text-blue-900">Details</a>
```

### 8. Refactor Existing Claude Services to Use Token Estimator

#### Update `src/services/session-structure.ts`

```typescript
// CHANGE this import at the top of the file:
// FROM:
import { estimateTokens } from "./compression.js";

// TO:
import { estimateTokens } from "../lib/token-estimator.js";

// The rest of the file uses estimateTokens() the same way - no other changes needed.
```

#### Update `src/services/session-turns.ts`

```typescript
// CHANGE this import at the top of the file:
// FROM:
import { estimateTokens } from "./compression.js";

// TO:
import { estimateTokens } from "../lib/token-estimator.js";

// The rest of the file uses estimateTokens() the same way - no other changes needed.
```

### 9. Route Integration Tests (`test/copilot-visualization-routes.test.ts`)

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { app } from "../src/server.js";

// AC-34: Session detail page renders Copilot sessions with same UI as Claude sessions
describe("Copilot Visualization Routes", () => {
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

  // AC-34: Session detail page renders Copilot sessions
  describe("GET /api/copilot/session/:sessionId/structure", () => {
    it("returns session structure", async () => {
      const response = await fetch(
        `${baseUrl}/api/copilot/session/11111111-1111-1111-1111-111111111111/structure?workspace=abc123def456ghi789`
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.sessionId).toBe("11111111-1111-1111-1111-111111111111");
      expect(data.source).toBe("copilot");
      expect(data.turnCount).toBe(2);
      expect(data.totalTokens).toBeGreaterThan(0);
    });

    it("returns 404 for non-existent session", async () => {
      const response = await fetch(
        `${baseUrl}/api/copilot/session/nonexistent/structure?workspace=abc123def456ghi789`
      );
      expect(response.status).toBe(404);
    });
  });

  // AC-35: Turn-based view shows user prompts and assistant responses
  // AC-36: Token bars display estimated tokens per turn
  // AC-37: Cumulative token tracking works across turns
  describe("GET /api/copilot/session/:sessionId/turns", () => {
    it("returns turns with cumulative tokens including all four buckets", async () => {
      const response = await fetch(
        `${baseUrl}/api/copilot/session/11111111-1111-1111-1111-111111111111/turns?workspace=abc123def456ghi789`
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.sessionId).toBe("11111111-1111-1111-1111-111111111111");
      expect(data.totalTurns).toBe(2);
      expect(data.turns).toHaveLength(2);

      // Verify all four token buckets for D3 visualization
      const turn = data.turns[0];
      expect(turn.cumulative).toHaveProperty("user");
      expect(turn.cumulative).toHaveProperty("assistant");
      expect(turn.cumulative).toHaveProperty("thinking");
      expect(turn.cumulative).toHaveProperty("tool");
      expect(turn.cumulative).toHaveProperty("total");
      expect(turn.cumulative.thinking).toBe(0); // Copilot doesn't have thinking
    });
  });

  // AC-38: Playback controls work identically to Claude
  describe("GET /api/copilot/session/:sessionId/turn/:turnIndex", () => {
    it("returns specific turn", async () => {
      const response = await fetch(
        `${baseUrl}/api/copilot/session/11111111-1111-1111-1111-111111111111/turn/0?workspace=abc123def456ghi789`
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.turnIndex).toBe(0);
      expect(data.content.userPrompt).toContain("refactor");
    });

    it("returns 404 for invalid turn index", async () => {
      const response = await fetch(
        `${baseUrl}/api/copilot/session/11111111-1111-1111-1111-111111111111/turn/999?workspace=abc123def456ghi789`
      );
      expect(response.status).toBe(404);
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
npm test -- token-estimator
npm test -- copilot-structure
npm test -- copilot-visualization-routes
```

Manual testing:
1. Start dev server: `npm run dev`
2. Open Session Browser at http://localhost:3000
3. Toggle to Copilot, select a workspace and session
4. Click Details on a session
5. Verify session detail page shows:
   - Source indicator "GitHub Copilot" (purple badge)
   - Turn count and token counts
   - User prompts and assistant responses
   - D3 stacked area chart renders correctly (all four color bands)
   - Playback controls work (play, pause, prev, next)
6. Toggle back to Claude, click Details on a Claude session
7. Verify Claude session detail page shows:
   - Source indicator "Claude Code" (blue badge)
   - All visualization features work as before
   - Token counts may differ slightly due to algorithm change (this is expected)

## Done When

- TypeScript compiles without errors
- All existing tests pass
- All new tests pass
- No `NotImplementedError` remains in:
  - `src/lib/token-estimator.ts`
  - `src/services/copilot-structure.ts`
- Token estimation is consistent:
  - Both sources use `estimateTokens()` from `src/lib/token-estimator.ts`
  - Claude services (`session-structure.ts`, `session-turns.ts`) import from new location
  - `compression.ts` still uses chars/4 for compression decisions (unchanged)
- Copilot token buckets include all four: `user`, `assistant`, `thinking` (0), `tool`
- Visualization routes return data (not 501)
- Session detail page works for both Claude and Copilot sources
- Source indicator badge renders correctly for both sources

| Test Category | Expected Result |
|---------------|-----------------|
| All existing tests | PASS |
| estimateTokens tests | PASS |
| estimateContentTokens tests | PASS |
| CopilotStructureService.getStructure tests | PASS |
| CopilotStructureService.getTurns tests | PASS |
| CopilotStructureService.getTurn tests | PASS |
| GET /api/copilot/session/:id/structure | PASS (200 with data) |
| GET /api/copilot/session/:id/turns | PASS (200 with turns, all 4 token buckets) |
| GET /api/copilot/session/:id/turn/:index | PASS (200 with turn) |
| Session detail page (Claude) | Working with source indicator |
| Session detail page (Copilot) | Working with source indicator |

Implement the complete phase. Deliver working code, not a plan.
```
