```prompt
# Phase 2: Copilot Clone Fix - TDD Green (Claude Opus 4.5)

## Objective

Implement all Phase 1 stubs to make tests pass:
1. SQLite operations for reading/writing session index
2. Session file writing with backup and rollback
3. Tool call result extraction for accurate token counting
4. Frontend workspace selector and success messaging
5. Route updates with proper error handling

TDD Green means the tests written in Phase 1 (which asserted real behavior) now PASS because implementations return correct values.

## Context

Phase 1 created:
- `src/lib/sqlite-state.ts` - SQLite state database stubs
- `src/schemas/copilot-clone.ts` - Zod schemas for validation
- `src/services/copilot-clone.ts` - Updated with writeSession stub
- `src/services/copilot-structure.ts` - Tool result extraction stubs
- `src/routes/copilot-clone.ts` - Route with 409 handling (stub)
- Tests asserting real behavior (currently ERROR)

Your job is to implement the real logic so tests pass and cloning works end-to-end.

## Constraints

- Use `better-sqlite3` for SQLite operations (synchronous API)
- Always create backup before modifying `state.vscdb`
- Clean up session file if SQLite update fails (rollback)
- Return user-friendly error for SQLITE_BUSY
- Handle `SQLITE_CANTOPEN` gracefully (return empty index when DB doesn't exist)
- Test files MUST be updated to align with Phase 2 design (see Section 8)

## Reference Files

Read these files before implementing:
- `src/lib/sqlite-state.ts` - Your stubs to implement
- `src/services/copilot-clone.ts` - writeSession stub to implement
- `src/services/copilot-structure.ts` - Tool result stubs to implement
- `docs/projects/010-consolidate-refine/003-copilot-clone-implementation.md` - Full spec
- `docs/reference/github-copilot-session-storage-formats.md` - Copilot format spec
- `test/lib/sqlite-state.test.ts` - Tests that must pass
- `test/services/copilot-clone-write.test.ts` - Tests that must pass
- `test/services/copilot-structure-tools.test.ts` - Tests that must pass

## Deliverables

### 1. Implement SQLite State Library (`src/lib/sqlite-state.ts`)

Replace all `NotImplementedError` throws with real implementations:

```typescript
import Database from "better-sqlite3";
import { copyFile, unlink, readdir } from "fs/promises";
import { join, dirname } from "path";

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
    this.dbPath = join(workspacePath, "state.vscdb");
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
    const timestamp = Date.now();
    const backupPath = `${this.dbPath}.backup-${timestamp}`;

    await copyFile(this.dbPath, backupPath);
    await this.cleanupOldBackups();

    return backupPath;
  }

  /**
   * Keep only the 3 most recent backups.
   */
  private async cleanupOldBackups(): Promise<void> {
    const dir = dirname(this.dbPath);

    try {
      const files = await readdir(dir);
      const backups = files
        .filter(f => f.startsWith("state.vscdb.backup-"))
        .map(f => ({
          name: f,
          time: parseInt(f.split("backup-")[1] || "0", 10)
        }))
        .sort((a, b) => b.time - a.time);

      // Delete all but the 3 most recent
      for (const backup of backups.slice(3)) {
        await unlink(join(dir, backup.name)).catch(() => {
          // Ignore cleanup errors
        });
      }
    } catch {
      // Ignore if directory read fails
    }
  }

  /**
   * Read the current session index.
   * @returns The parsed session index or empty index if not found
   */
  readSessionIndex(): ChatSessionIndex {
    let db: ReturnType<typeof Database> | null = null;

    try {
      db = new Database(this.dbPath, { readonly: true });

      const row = db.prepare(
        "SELECT value FROM ItemTable WHERE key = 'chat.ChatSessionStore.index'"
      ).get() as { value: string } | undefined;

      if (!row) {
        return { version: 1, entries: {} };
      }

      return JSON.parse(row.value) as ChatSessionIndex;
    } catch (err: unknown) {
      const error = err as { code?: string };
      // Handle missing database file gracefully
      if (error.code === "SQLITE_CANTOPEN") {
        return { version: 1, entries: {} };
      }
      throw err;
    } finally {
      db?.close();
    }
  }

  /**
   * Check if a session ID already exists in the index.
   * @param sessionId - Session UUID to check
   * @returns true if session exists
   */
  sessionExists(sessionId: string): boolean {
    const index = this.readSessionIndex();
    return sessionId in index.entries;
  }

  /**
   * Add a new session to the index.
   * Throws if database is locked (SQLITE_BUSY).
   * @param entry - Session index entry to add
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

      // Write back - use INSERT OR REPLACE to handle missing key
      const stmt = db.prepare(
        "INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)"
      );
      stmt.run("chat.ChatSessionStore.index", JSON.stringify(index));
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === "SQLITE_BUSY" || err.message?.includes("database is locked")) {
        throw new Error("Cannot write to VS Code database - please close VS Code and try again");
      }
      throw error;
    } finally {
      db.close();
    }
  }
}
```

### 2. Implement Clone Service Write Method (`src/services/copilot-clone.ts`)

Update the service with full writeSession implementation. Replace the existing file:

```typescript
import { getSessionSource } from "../sources/index.js";
import type { CopilotSessionSource } from "../sources/copilot-source.js";
import type { CopilotSession, CopilotRequest } from "../sources/copilot-types.js";
import { estimateTokens } from "../lib/token-estimator.js";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { getVSCodeStoragePath } from "../sources/copilot-source.js";
import { VSCodeStateDb, ChatSessionIndexEntry } from "../lib/sqlite-state.js";

/**
 * Options for cloning a Copilot session.
 */
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
  sessionPath?: string;
  backupPath?: string;
  writtenToDisk: boolean;
}

export class CopilotCloneService {
  /**
   * Clone a Copilot session with optional compression.
   * Output is valid Copilot JSON format.
   *
   * @param sessionId - Session UUID to clone
   * @param workspaceHash - Workspace folder hash
   * @param options - Clone options (compression, tool removal, write to disk)
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

    // Write to disk if requested (default: true)
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
      // If SQLite fails (e.g., VS Code has it locked), clean up the session file
      await unlink(sessionPath).catch(() => {
        // Ignore cleanup errors
      });
      throw error; // Re-throw the original error
    }

    return { sessionPath, backupPath };
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
   * Includes user messages, assistant responses, AND tool call results.
   */
  private countTotalTokens(requests: CopilotRequest[]): number {
    return requests.reduce((total, req) => {
      // User message tokens
      const userTokens = estimateTokens(req.message.text);

      // Assistant response tokens (from response array)
      const assistantTokens = req.response.reduce((sum, item) => {
        if (typeof item === "object" && item !== null && "value" in item) {
          return sum + estimateTokens(String(item.value || ""));
        }
        return sum;
      }, 0);

      // Tool call result tokens (from result.metadata.toolCallResults)
      const toolResultTokens = this.countToolResultTokens(req);

      return total + userTokens + assistantTokens + toolResultTokens;
    }, 0);
  }

  /**
   * Count tokens from tool call results in request metadata.
   * This is where the bulk of token usage is in tool-heavy sessions.
   */
  private countToolResultTokens(request: CopilotRequest): number {
    const results = request.result?.metadata?.toolCallResults;
    if (!results) return 0;

    let tokens = 0;
    for (const result of Object.values(results)) {
      if (result.content && Array.isArray(result.content)) {
        for (const item of result.content) {
          if (typeof item.value === "string") {
            tokens += estimateTokens(item.value);
          } else if (typeof item.value === "object" && item.value !== null) {
            // Structured value - stringify and estimate
            tokens += estimateTokens(JSON.stringify(item.value));
          }
        }
      }
    }
    return tokens;
  }
}

// Export singleton
export const copilotCloneService = new CopilotCloneService();
```

### 3. Implement Structure Service Tool Extraction (`src/services/copilot-structure.ts`)

Update the service to include tool call results in token counting and visualization. Replace the existing file:

```typescript
import { getSessionSource } from "../sources/index.js";
import type { CopilotSessionSource } from "../sources/copilot-source.js";
import type { CopilotSession, CopilotRequest, CopilotResponseItem } from "../sources/copilot-types.js";
import { estimateTokens } from "../lib/token-estimator.js";

/**
 * Tool call information extracted from Copilot response.
 * Now includes result content from toolCallResults.
 */
export interface CopilotToolCall {
  toolId: string;
  toolName: string;
  invocationMessage: string;
  /** Tool result content (from result.metadata.toolCallResults) */
  resultContent?: string;
}

/**
 * Cumulative token counts by type.
 * Includes all four buckets for D3 visualization compatibility:
 * - user: User prompt tokens
 * - assistant: Assistant response tokens
 * - thinking: Always 0 for Copilot (Copilot doesn't expose thinking)
 * - tool: Tokens from tool invocations AND tool call results
 * - total: Sum of all token types
 */
export interface CopilotTokensByType {
  user: number;
  assistant: number;
  thinking: number;  // Always 0 for Copilot sessions
  tool: number;      // From toolInvocationSerialized + toolCallResults
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
   * Now correctly counts tool call results from metadata.
   */
  private extractTurnsWithCumulative(requests: CopilotRequest[]): CopilotTurnData[] {
    let cumulativeUser = 0;
    let cumulativeAssistant = 0;
    let cumulativeTool = 0;
    // cumulativeThinking is always 0 for Copilot

    return requests.map((request, index) => {
      const userPrompt = request.message.text;
      const assistantResponse = this.extractAssistantText(request.response);
      const toolCalls = this.extractToolCalls(request);

      const userTokens = estimateTokens(userPrompt);
      const assistantTokens = estimateTokens(assistantResponse);
      const toolTokens = this.calculateToolTokens(request);

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
   * Includes user, assistant, and tool tokens.
   */
  private calculateTotalTokens(requests: CopilotRequest[]): number {
    return requests.reduce((total, request) => {
      const userTokens = estimateTokens(request.message.text);
      const assistantTokens = estimateTokens(this.extractAssistantText(request.response));
      const toolTokens = this.calculateToolTokens(request);
      return total + userTokens + assistantTokens + toolTokens;
    }, 0);
  }

  /**
   * Calculate tokens from tool invocations AND tool call results.
   * Tool call results are stored in request.result.metadata.toolCallResults
   * and contain the actual tool outputs (file contents, terminal output, etc.)
   */
  private calculateToolTokens(request: CopilotRequest): number {
    let toolTokens = 0;

    // 1. Tokens from tool invocation messages in response array
    for (const item of request.response) {
      if (typeof item === "object" && item !== null && item.kind === "toolInvocationSerialized") {
        const invMsg = this.extractInvocationMessage(item);
        toolTokens += estimateTokens(invMsg);
      }
    }

    // 2. Tokens from tool call results in metadata (THE IMPORTANT PART!)
    const results = request.result?.metadata?.toolCallResults;
    if (results) {
      for (const result of Object.values(results)) {
        if (result.content && Array.isArray(result.content)) {
          for (const contentItem of result.content) {
            if (typeof contentItem.value === "string") {
              toolTokens += estimateTokens(contentItem.value);
            } else if (typeof contentItem.value === "object" && contentItem.value !== null) {
              toolTokens += estimateTokens(JSON.stringify(contentItem.value));
            }
          }
        }
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
        // Text response items have a 'value' string property
        // Skip tool-related items
        if ("value" in item && typeof item.value === "string") {
          if (!item.kind || item.kind === "markdownContent") {
            textParts.push(item.value);
          }
        }
      }
    }

    return textParts.join("\n\n");
  }

  /**
   * Extract tool call information from response items AND metadata.
   * Now includes tool result content from toolCallResults.
   *
   * IMPORTANT: The ID matching between response items and toolCallResults is indirect:
   * - Response items have `toolCallId` (e.g., "tool_call_001") and `toolId` (e.g., "run_in_terminal")
   * - toolCallResults are keyed by IDs from toolCallRounds (e.g., "toolu_001")
   * - toolCallRounds[].toolCalls[].id matches toolCallResults keys
   * - toolCallRounds[].toolCalls[].name matches the tool name
   *
   * Matching strategy: Use toolCallRounds to map tool names to result IDs,
   * then match by tool name from response items.
   */
  private extractToolCalls(request: CopilotRequest): CopilotToolCall[] {
    const toolCalls: CopilotToolCall[] = [];
    const toolResults = request.result?.metadata?.toolCallResults || {};
    const rounds = request.result?.metadata?.toolCallRounds || [];

    // Build a map of tool call result IDs to their content
    const resultsById: Record<string, string> = {};
    for (const [toolCallId, result] of Object.entries(toolResults)) {
      if (result.content && Array.isArray(result.content)) {
        const content = result.content
          .map(c => typeof c.value === "string" ? c.value : JSON.stringify(c.value))
          .join("\n");
        resultsById[toolCallId] = content;
      }
    }

    // Build a map from toolCallRounds: tool name -> result ID
    // This is the KEY insight: toolCallRounds connects tool names to result IDs
    const toolNameToResultId: Record<string, string> = {};
    for (const round of rounds) {
      for (const call of round.toolCalls) {
        // call.id is the key used in toolCallResults (e.g., "toolu_001")
        // call.name is the tool name (e.g., "run_in_terminal")
        toolNameToResultId[call.name] = call.id;
      }
    }

    // Extract from response array
    for (const item of request.response) {
      if (typeof item === "object" && item !== null && item.kind === "toolInvocationSerialized") {
        const toolId = (item as { toolId?: string }).toolId || "unknown";
        // Extract base tool name (without copilot_ prefix if present)
        const toolName = toolId.replace("copilot_", "");

        // Find result content via toolCallRounds mapping
        let resultContent: string | undefined;

        // Look up the result ID for this tool name, then get the content
        const resultId = toolNameToResultId[toolName] || toolNameToResultId[toolId];
        if (resultId && resultsById[resultId]) {
          resultContent = resultsById[resultId];
        }

        toolCalls.push({
          toolId,
          toolName,
          invocationMessage: this.extractInvocationMessage(item),
          resultContent,
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

### 4. Update Clone Route (`src/routes/copilot-clone.ts`)

Update route with proper error handling and workspaces endpoint:

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

### 5. Update Frontend (`public/js/pages/clone.js`)

Update the clone page to support workspace selection and proper success messaging. Find and update the relevant sections:

**Add workspace selector initialization** (after existing `initSessionIdInput`):

```javascript
/**
 * Load and display workspace selector for Copilot sessions.
 * Shows target workspace options for writing cloned session.
 */
async function showWorkspaceSelector() {
  const selectorDiv = document.getElementById("workspace-selector");
  if (!selectorDiv) return;

  try {
    const response = await fetch("/api/copilot/workspaces");
    const { workspaces } = await response.json();

    if (workspaces.length === 0) {
      selectorDiv.innerHTML = '<p class="text-red-600 text-sm">No workspaces found</p>';
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
    selectorDiv.innerHTML = `
      <p class="text-sm text-amber-600">
        Could not load workspaces. Session will be saved to source workspace.
      </p>
    `;
    selectorDiv.classList.remove("hidden");
  }
}
```

**Update `showSourceIndicator`** to trigger workspace selector when source is Copilot.

Find the existing `showSourceIndicator` function and REPLACE it entirely:

```javascript
/**
 * Show source indicator in the UI.
 * @param {string} source - "claude" or "copilot"
 */
function showSourceIndicator(source) {
  const indicator = document.getElementById("source-resolve-indicator");
  if (!indicator) return;

  indicator.classList.remove("hidden");
  if (source === "copilot") {
    indicator.innerHTML = '<span class="text-purple-600 font-medium">Found in GitHub Copilot</span>';
    // Show workspace selector for Copilot sessions
    showWorkspaceSelector();
  } else {
    indicator.innerHTML = '<span class="text-blue-600 font-medium">Found in Claude Code</span>';
    // Hide workspace selector for Claude sessions
    const selectorDiv = document.getElementById("workspace-selector");
    if (selectorDiv) selectorDiv.classList.add("hidden");
  }
}
```

**IMPORTANT:** The current Phase 1 code does NOT call `showWorkspaceSelector()`. You must add that call.

**Update Copilot clone submission** in the `handleSubmit` function to include target workspace and `writeToDisk: true`.

Find this block in `handleSubmit`:
```javascript
if (resolvedSource === "copilot") {
  endpoint = "/api/copilot/clone";
  body = {
    sessionId,
    workspaceHash: resolvedLocation,
    options: {
      removeToolCalls: options.toolRemoval !== "none",
      compressPercent: options.compressionBands?.[0]?.compressionLevel || 0
    }
  };
}
```

**REPLACE** it with this (adds `writeToDisk: true` and `targetWorkspaceHash`):

```javascript
if (resolvedSource === "copilot") {
  // Use Copilot clone endpoint
  endpoint = "/api/copilot/clone";

  // Get target workspace if selected
  const targetWorkspace = document.getElementById("target-workspace")?.value;

  body = {
    sessionId,
    workspaceHash: resolvedLocation,
    options: {
      removeToolCalls: options.toolRemoval !== "none",
      compressPercent: options.compressionBands?.[0]?.compressionLevel || 0,
      writeToDisk: true,  // CRITICAL: Must be true to write to VS Code storage
      targetWorkspaceHash: targetWorkspace || undefined
    }
  };
}
```

**IMPORTANT:** The current Phase 1 code is missing `writeToDisk: true`. Without it, sessions won't be written to disk.

**Update success handling** for Copilot sessions to show proper messages:

```javascript
if (resolvedSource === "copilot") {
  newSessionId = result.session?.sessionId || "copilot-session";

  if (result.writtenToDisk) {
    // Session was written successfully - show which workspace it was written to
    const targetInfo = result.sessionPath
      ? `\nWritten to: ${result.sessionPath}`
      : "";

    command = `Session cloned successfully!

The cloned session will appear in VS Code's Copilot Chat
when you open the target workspace.

Session ID: ${result.session.sessionId}${targetInfo}`;

    // Show restart hint
    showRestartHint();

    // Hide the download section since we wrote to disk
    const downloadSection = document.getElementById('copilot-download-section');
    if (downloadSection) downloadSection.remove();
  } else {
    // Fallback: JSON download only
    command = `Session cloned (download only)

The session could not be written to VS Code storage.
Download the JSON and import manually.`;

    showCopilotDownload(result.session, newSessionId);
  }

  // Format stats as array matching showSuccess expectations
  stats = [
    { label: 'Original Turns', value: result.stats?.originalTurns || 0 },
    { label: 'Cloned Turns', value: result.stats?.clonedTurns || 0 },
    { label: 'Compression', value: `${result.stats?.compressionRatio || 0}%` }
  ];
}
```

**Add 409 error handling** in the catch block:

```javascript
} catch (err) {
  hideLoading(containers.loading);

  let message;
  if (err instanceof ApiError) {
    message = err.message;
  } else if (err.message.includes('fetch')) {
    message = `Network error: ${err.message}. Please check your connection.`;
  } else {
    message = err.message || 'An unexpected error occurred';
  }

  showError(containers.error, message);
  containers.error.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
```

**Update the response handling to check for 409 BEFORE calling `response.json()`:**

Find this code pattern in `handleSubmit`:
```javascript
const response = await fetch(endpoint, { ... });
const result = await response.json();
if (!response.ok) { ... }
```

**REPLACE** with this (checks 409 FIRST):

```javascript
const response = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

// IMPORTANT: Check for 409 Conflict BEFORE parsing JSON
// This gives a better error message for VS Code lock issues
if (response.status === 409) {
  const errorData = await response.json();
  throw new ApiError(errorData.error?.message || "Cannot clone while VS Code is running. Please close VS Code and try again.");
}

const result = await response.json();

if (!response.ok) {
  throw new ApiError(result.error?.message || "Clone operation failed");
}
```

**CRITICAL:** The current code calls `response.json()` before checking status. This means 409 errors get a generic message instead of the VS Code lock message.

**Add restart hint function**:

```javascript
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
        or switch workspaces to see the cloned session in Copilot Chat.
      </p>
    </div>
  `;
  hintDiv.classList.remove("hidden");
}
```

### 6. Update Clone Template

Add the required HTML elements. In `views/pages/clone.ejs` (or wherever the clone form template is):

```html
<!-- Add after source-resolve-indicator, before clone options -->
<div id="workspace-selector" class="hidden mb-4">
  <!-- Populated by showWorkspaceSelector() -->
</div>

<!-- Add after the success result div -->
<div id="vscode-hint" class="hidden">
  <!-- Populated by showRestartHint() -->
</div>
```

### 7. Update Copilot Types (`src/sources/copilot-types.ts`)

Ensure the types include result metadata:

```typescript
/**
 * Workspace configuration from VS Code's workspace.json
 */
export interface WorkspaceConfig {
  /** Folder URI in format "file:///path/to/folder" */
  folder: string;
}

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
 * Tool call from a tool call round.
 */
export interface ToolCall {
  name: string;
  arguments: string;
  id: string;
}

/**
 * Metadata about tool calls in a request result.
 */
export interface ToolCallRound {
  response: string;
  toolCalls: ToolCall[];
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
  /** GitHub username of the requester */
  requesterUsername?: string;
  /** Username of the responder (typically "GitHub Copilot") */
  responderUsername?: string;
}

/**
 * Single request/response turn in Copilot session
 */
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

/**
 * Response item in Copilot response array
 */
export interface CopilotResponseItem {
  kind?: string;
  value?: string;
  [key: string]: unknown;
}
```

## Verification

After completing this phase:

```bash
# Type check
npm run typecheck  # Must pass

# Run all tests
npm test           # All tests PASS

# Run specific test suites
npm test -- sqlite-state
npm test -- copilot-clone-write
npm test -- copilot-structure-tools
npm test -- copilot-clone
```

Manual testing:
1. Start dev server: `npm run dev`
2. Navigate to Clone page
3. Paste a Copilot session ID
4. Verify "Found in GitHub Copilot" appears
5. Verify workspace selector appears with options
6. Select target workspace (or leave as "Same as source")
7. Set compression options if desired
8. **Close VS Code completely**
9. Click Clone
10. Verify success message shows session path
11. Open VS Code and navigate to target workspace
12. Verify cloned session appears in Copilot Chat sidebar
13. Test with VS Code running - should see 409 error with helpful message
14. Test session visualization - verify tool calls show proper token counts

## Done When

- TypeScript compiles without errors
- All tests pass (including new Phase 1 tests)
- No `NotImplementedError` remains in:
  - `src/lib/sqlite-state.ts`
  - `src/services/copilot-clone.ts`
  - `src/services/copilot-structure.ts`
- Clone writes session JSON to `chatSessions/` folder
- Clone updates `state.vscdb` index
- Clone creates backup before modifying database
- Clone returns 409 when VS Code has database locked
- **Rollback cleanup works:** If SQLite update fails, session JSON file is deleted
- Cloned sessions appear in VS Code Copilot Chat
- Workspace selector shows available workspaces
- Success message shows actual session path (tells user WHERE it was written)
- Tool call results included in token counting
- Session visualization shows accurate token counts for tool-heavy sessions

| Test Category | Expected Result |
|---------------|-----------------|
| All existing tests | PASS |
| VSCodeStateDb.backup | PASS |
| VSCodeStateDb.readSessionIndex | PASS |
| VSCodeStateDb.sessionExists | PASS |
| VSCodeStateDb.addSessionToIndex | PASS |
| CopilotCloneService.writeSession | PASS |
| CopilotCloneService rollback cleanup | PASS |
| CopilotStructureService tool extraction | PASS |
| POST /api/copilot/clone (writeToDisk) | PASS |
| GET /api/copilot/workspaces | PASS |
| Workspace selector UI | Working |
| Success messaging | Proper paths shown |
| 409 error handling | User-friendly message |

### 8. Update Test Files

Phase 1 created TDD-Red tests with direct stub method calls. Phase 2 inlines the logic into private methods, so these tests must be updated.

**Update `test/services/copilot-structure-tools.test.ts`:**

Remove the direct stub method tests and unskip the Phase 2 integration tests:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { CopilotStructureService } from "../../src/services/copilot-structure.js";

const FIXTURES = join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");
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

  // Phase 2: These tests now pass because tool result extraction is implemented
  describe("extractToolCallResults via getTurns", () => {
    it("extracts tool results from request metadata", async () => {
      const response = await service.getTurns(TEST_SESSION_ID, TEST_WORKSPACE);

      const turn = response.turns[0];
      expect(turn.content.toolCalls.length).toBeGreaterThan(0);
    });

    it("includes tool result content in tool calls", async () => {
      const response = await service.getTurns(TEST_SESSION_ID, TEST_WORKSPACE);

      const turn = response.turns[0];
      const terminalTool = turn.content.toolCalls.find(t => t.toolName === "run_in_terminal");

      expect(terminalTool).toBeDefined();
      expect(terminalTool?.resultContent).toContain("PASS");
    });
  });

  describe("calculateToolResultTokens via getStructure", () => {
    it("includes tokens from tool call results", async () => {
      const structure = await service.getStructure(TEST_SESSION_ID, TEST_WORKSPACE);

      // Session with tool results should have significant token count
      expect(structure.totalTokens).toBeGreaterThan(100);
    });

    it("accounts for tool results in cumulative totals", async () => {
      const response = await service.getTurns(TEST_SESSION_ID, TEST_WORKSPACE);

      const turn = response.turns[0];
      expect(turn.cumulative.tool).toBeGreaterThan(0);
    });
  });

  describe("getTurns with tool invocations", () => {
    it("includes tool call count matching response invocations", async () => {
      const response = await service.getTurns(TEST_SESSION_ID, TEST_WORKSPACE);

      const turn = response.turns[0];
      expect(turn.content.toolCalls.length).toBe(1);

      const turn2 = response.turns[1];
      expect(turn2.content.toolCalls.length).toBe(1);
    });
  });
});
```

**Update `test/routes/copilot-clone.test.ts`:**

Unskip the Phase 2 tests for `writeToDisk: true`:

```typescript
// Change this:
describe.skip("writeToDisk: true - Phase 2 Implementation", () => {

// To this:
describe("writeToDisk: true - Phase 2 Implementation", () => {
```

And remove or update the TDD-Red test that expects 500:

```typescript
// REMOVE this test block in Phase 2:
describe("writeToDisk: true - TDD-Red Phase 1", () => {
  it("returns 500 when writeToDisk: true (NotImplementedError)", async () => {
    // This was only for Phase 1 - remove in Phase 2
  });
});
```

**Summary of test file changes:**

| Test File | Action |
|-----------|--------|
| `test/services/copilot-structure-tools.test.ts` | Remove direct stub tests, unskip integration tests |
| `test/routes/copilot-clone.test.ts` | Unskip Phase 2 tests, remove TDD-Red 500 test |
| `test/lib/sqlite-state.test.ts` | No changes - tests will pass after implementation |
| `test/services/copilot-clone-write.test.ts` | No changes - tests will pass after implementation |

Implement the complete phase. Deliver working code, not a plan.
```
