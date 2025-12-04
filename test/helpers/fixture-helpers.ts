/**
 * Fixture helpers for generating session data with known token counts.
 * Token count estimation: chars / 4 (ceil)
 *
 * These helpers create JSONL strings with predictable token counts
 * for testing compression statistics.
 */

import type { SessionEntry } from "../../src/types.js";

/**
 * Create text of approximately N tokens (tokens = ceil(chars/4))
 * To get exactly N tokens, we need (N * 4) - (0-3) chars
 * For simplicity, we use N * 4 chars which gives exactly N tokens
 */
export function createTextWithTokens(tokenCount: number, prefix = ""): string {
  // Each token ~4 chars. Create a pattern that's exactly tokenCount * 4 chars
  const targetChars = tokenCount * 4;
  const base = prefix || "x";

  // Repeat base pattern to fill, then trim to exact length
  let result = "";
  while (result.length < targetChars) {
    result += base.repeat(Math.min(100, targetChars - result.length));
  }

  return result.substring(0, targetChars);
}

/**
 * Create a user entry with specified token count in the text content.
 */
export function createUserEntry(
  uuid: string,
  parentUuid: string | null,
  sessionId: string,
  tokenCount: number,
  textPrefix = "user"
): SessionEntry {
  const text = createTextWithTokens(tokenCount, textPrefix);
  return {
    type: "user",
    uuid,
    parentUuid,
    sessionId,
    message: {
      role: "user",
      content: text,
    },
  };
}

/**
 * Create an assistant entry with specified token count in the text content.
 */
export function createAssistantEntry(
  uuid: string,
  parentUuid: string | null,
  sessionId: string,
  tokenCount: number,
  textPrefix = "assistant"
): SessionEntry {
  const text = createTextWithTokens(tokenCount, textPrefix);
  return {
    type: "assistant",
    uuid,
    parentUuid,
    sessionId,
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
    },
  };
}

/**
 * Create an assistant entry with tool_use block.
 */
export function createAssistantWithToolUse(
  uuid: string,
  parentUuid: string | null,
  sessionId: string,
  toolId: string,
  toolName: string,
  textTokenCount = 0
): SessionEntry {
  const content: Array<{ type: string; [key: string]: unknown }> = [];

  if (textTokenCount > 0) {
    content.push({
      type: "text",
      text: createTextWithTokens(textTokenCount, "tool-text"),
    });
  }

  content.push({
    type: "tool_use",
    id: toolId,
    name: toolName,
    input: { query: "test" },
  });

  return {
    type: "assistant",
    uuid,
    parentUuid,
    sessionId,
    message: {
      role: "assistant",
      content,
      stop_reason: "tool_use",
    },
  };
}

/**
 * Create a user entry with tool_result block.
 */
export function createUserWithToolResult(
  uuid: string,
  parentUuid: string | null,
  sessionId: string,
  toolUseId: string,
  resultContent = "result"
): SessionEntry {
  return {
    type: "user",
    uuid,
    parentUuid,
    sessionId,
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: resultContent,
        },
      ],
    },
  };
}

/**
 * Create a queue-operation entry.
 */
export function createQueueOperation(sessionId: string): SessionEntry {
  return {
    type: "queue-operation",
    uuid: null,
    parentUuid: null,
    sessionId,
    cwd: "/test/project",
  };
}

/**
 * Convert entries array to JSONL string.
 */
export function entriesToJsonl(entries: SessionEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

/**
 * Create a fixture with 6 turns with known token counts.
 * Used for TC-08: Token Statistics test.
 *
 * Token distribution:
 * - Turn 0: User 100 tokens, Assistant 200 tokens (300 total)
 * - Turn 1: User 150 tokens, Assistant 250 tokens (400 total)
 * - Turn 2: User 100 tokens, Assistant 200 tokens (300 total)
 * - Turn 3: User 100 tokens, Assistant 200 tokens (300 total)
 * - Turn 4: User 100 tokens, Assistant 200 tokens (300 total)
 * - Turn 5: User 100 tokens, Assistant 200 tokens (300 total)
 *
 * Total: 1900 tokens
 * First 50% (turns 0-2) = 1000 tokens
 *
 * With compression band [0, 50] at "compress":
 * - Turns 0, 1, 2 are in band (0%, 16.67%, 33.33% positions)
 * - 6 messages to compress (3 user + 3 assistant)
 * - 1000 original tokens in band
 * - At 35% compression mock: 350 tokens compressed result
 */
export function createFixtureWith6Turns(): string {
  const sessionId = "test-session-id";
  const entries: SessionEntry[] = [];

  // Queue operation first
  entries.push(createQueueOperation(sessionId));

  // Turn 0: User 100 tokens, Assistant 200 tokens
  entries.push(createUserEntry("u0", null, sessionId, 100, "turn0user"));
  entries.push(createAssistantEntry("a0", "u0", sessionId, 200, "turn0asst"));

  // Turn 1: User 150 tokens, Assistant 250 tokens
  entries.push(createUserEntry("u1", "a0", sessionId, 150, "turn1user"));
  entries.push(createAssistantEntry("a1", "u1", sessionId, 250, "turn1asst"));

  // Turn 2: User 100 tokens, Assistant 200 tokens
  entries.push(createUserEntry("u2", "a1", sessionId, 100, "turn2user"));
  entries.push(createAssistantEntry("a2", "u2", sessionId, 200, "turn2asst"));

  // Turn 3: User 100 tokens, Assistant 200 tokens
  entries.push(createUserEntry("u3", "a2", sessionId, 100, "turn3user"));
  entries.push(createAssistantEntry("a3", "u3", sessionId, 200, "turn3asst"));

  // Turn 4: User 100 tokens, Assistant 200 tokens
  entries.push(createUserEntry("u4", "a3", sessionId, 100, "turn4user"));
  entries.push(createAssistantEntry("a4", "u4", sessionId, 200, "turn4asst"));

  // Turn 5: User 100 tokens, Assistant 200 tokens
  entries.push(createUserEntry("u5", "a4", sessionId, 100, "turn5user"));
  entries.push(createAssistantEntry("a5", "u5", sessionId, 200, "turn5asst"));

  return entriesToJsonl(entries);
}

/**
 * Create a fixture with 4 turns, where turns 0-1 have tool calls.
 * Used for TC-12: Combined with Tool Removal test.
 *
 * Turn structure:
 * - Turn 0: User (50 tokens), Assistant with tool_use + text (100 tokens), User tool_result, Assistant text (100 tokens)
 * - Turn 1: User (50 tokens), Assistant with tool_use + text (100 tokens), User tool_result, Assistant text (100 tokens)
 * - Turn 2: User (50 tokens), Assistant text (100 tokens)
 * - Turn 3: User (50 tokens), Assistant text (100 tokens)
 *
 * With 50% tool removal: tool_use/tool_result removed from turns 0-1
 * With 100% compression: all text messages compressed
 */
export function createFixtureWithToolCalls(): string {
  const sessionId = "test-session-tool-calls";
  const entries: SessionEntry[] = [];

  // Queue operation
  entries.push(createQueueOperation(sessionId));

  // Turn 0: with tool call
  entries.push(createUserEntry("u0", null, sessionId, 50, "turn0user"));
  entries.push(
    createAssistantWithToolUse("a0-tool", "u0", sessionId, "tool-0", "search", 100)
  );
  entries.push(createUserWithToolResult("u0-result", "a0-tool", sessionId, "tool-0"));
  entries.push(createAssistantEntry("a0", "u0-result", sessionId, 100, "turn0asst"));

  // Turn 1: with tool call
  entries.push(createUserEntry("u1", "a0", sessionId, 50, "turn1user"));
  entries.push(
    createAssistantWithToolUse("a1-tool", "u1", sessionId, "tool-1", "search", 100)
  );
  entries.push(createUserWithToolResult("u1-result", "a1-tool", sessionId, "tool-1"));
  entries.push(createAssistantEntry("a1", "u1-result", sessionId, 100, "turn1asst"));

  // Turn 2: no tool call
  entries.push(createUserEntry("u2", "a1", sessionId, 50, "turn2user"));
  entries.push(createAssistantEntry("a2", "u2", sessionId, 100, "turn2asst"));

  // Turn 3: no tool call
  entries.push(createUserEntry("u3", "a2", sessionId, 50, "turn3user"));
  entries.push(createAssistantEntry("a3", "u3", sessionId, 100, "turn3asst"));

  return entriesToJsonl(entries);
}

/**
 * Create a minimal fixture for v1 preservation test.
 */
export function createMinimalFixture(): string {
  const sessionId = "minimal-test-session";
  const entries: SessionEntry[] = [];

  entries.push(createQueueOperation(sessionId));
  entries.push(createUserEntry("u0", null, sessionId, 50, "hello"));
  entries.push(createAssistantEntry("a0", "u0", sessionId, 100, "response"));

  return entriesToJsonl(entries);
}
