import { describe, it, expect, vi } from "vitest";
import {
  mapCopilotTurnsToBands,
  extractCopilotTextContent,
  createCopilotCompressionTasks,
  applyCopilotCompressionResults,
  compressCopilotMessages,
  estimateCopilotTokens,
} from "../../src/services/copilot-compression.js";
import type { CopilotRequest } from "../../src/sources/copilot-types.js";
import type { CompressionBand, CompressionConfig } from "../../src/types.js";

// Mock the provider for compressCopilotMessages tests
vi.mock("../../src/providers/index.js", () => ({
  getProvider: () => ({
    compress: vi.fn().mockImplementation((text, level) => {
      // Return shortened version for testing
      return Promise.resolve(text.slice(0, Math.ceil(text.length * 0.35)));
    }),
  }),
}));

// Test fixtures
function createTestRequest(text: string, response: string): CopilotRequest {
  return {
    requestId: `req_${Math.random().toString(36).substr(2, 9)}`,
    message: { text, parts: [] },
    response: [{ kind: "markdownContent", value: response }],
    isCanceled: false,
    timestamp: Date.now(),
  };
}

describe("Copilot Compression Service", () => {
  describe("estimateCopilotTokens", () => {
    // AC: Token estimation matches Claude implementation
    it("estimates tokens as ceil(chars/4)", () => {
      expect(estimateCopilotTokens("")).toBe(0);
      expect(estimateCopilotTokens("test")).toBe(1); // 4 chars = 1 token
      expect(estimateCopilotTokens("hello")).toBe(2); // 5 chars = 2 tokens
      expect(estimateCopilotTokens("a".repeat(100))).toBe(25);
    });

    it("returns 0 for empty or null-ish input", () => {
      expect(estimateCopilotTokens("")).toBe(0);
    });
  });

  describe("mapCopilotTurnsToBands", () => {
    // AC: Compression bands are respected
    it("maps turns to bands based on position percentage", () => {
      const requests = [
        createTestRequest("msg1", "resp1"),
        createTestRequest("msg2", "resp2"),
        createTestRequest("msg3", "resp3"),
        createTestRequest("msg4", "resp4"),
      ];

      const bands: CompressionBand[] = [
        { start: 0, end: 50, level: "heavy-compress" },
        { start: 50, end: 75, level: "compress" },
      ];

      const mapping = mapCopilotTurnsToBands(requests, bands);

      // Turn 0: position 0% -> heavy-compress
      expect(mapping[0].band?.level).toBe("heavy-compress");
      // Turn 1: position 25% -> heavy-compress
      expect(mapping[1].band?.level).toBe("heavy-compress");
      // Turn 2: position 50% -> compress
      expect(mapping[2].band?.level).toBe("compress");
      // Turn 3: position 75% -> no band
      expect(mapping[3].band).toBeNull();
    });

    it("returns empty array for empty requests", () => {
      const mapping = mapCopilotTurnsToBands([], []);
      expect(mapping).toEqual([]);
    });

    it("returns null bands when no bands match", () => {
      const requests = [createTestRequest("msg", "resp")];
      const bands: CompressionBand[] = []; // No bands

      const mapping = mapCopilotTurnsToBands(requests, bands);
      expect(mapping[0].band).toBeNull();
    });
  });

  describe("extractCopilotTextContent", () => {
    // AC: User and assistant messages are extracted appropriately
    it("extracts user message text", () => {
      const request = createTestRequest("Hello, how are you?", "I'm fine!");

      const { userText } = extractCopilotTextContent(request);
      expect(userText).toBe("Hello, how are you?");
    });

    it("extracts assistant response from markdownContent items", () => {
      const request: CopilotRequest = {
        requestId: "test",
        message: { text: "Question", parts: [] },
        response: [
          { kind: "markdownContent", value: "First part." },
          { kind: "markdownContent", value: "Second part." },
        ],
        isCanceled: false,
        timestamp: Date.now(),
      };

      const { assistantText } = extractCopilotTextContent(request);
      expect(assistantText).toContain("First part.");
      expect(assistantText).toContain("Second part.");
    });

    it("excludes tool invocation items from assistant text", () => {
      const request: CopilotRequest = {
        requestId: "test",
        message: { text: "Question", parts: [] },
        response: [
          { kind: "markdownContent", value: "Here is the answer." },
          { kind: "toolInvocationSerialized", toolId: "run_in_terminal" },
          { kind: "markdownContent", value: "After tool." },
        ],
        isCanceled: false,
        timestamp: Date.now(),
      };

      const { assistantText } = extractCopilotTextContent(request);
      expect(assistantText).toContain("Here is the answer.");
      expect(assistantText).toContain("After tool.");
      expect(assistantText).not.toContain("toolInvocationSerialized");
    });
  });

  describe("createCopilotCompressionTasks", () => {
    // AC: Compression bands are respected (heavy vs regular)
    it("creates tasks for turns in compression bands", () => {
      const requests = [
        createTestRequest("This is a longer user message for testing.", "This is a response."),
        createTestRequest("Another message", "Another response"),
      ];

      const mapping = [
        { turnIndex: 0, band: { start: 0, end: 50, level: "heavy-compress" as const } },
        { turnIndex: 1, band: null },
      ];

      const tasks = createCopilotCompressionTasks(requests, mapping, 5);

      // Should create tasks for turn 0 only (user + assistant)
      expect(tasks.length).toBe(2);
      expect(tasks.every(t => t.level === "heavy-compress")).toBe(true);
    });

    it("skips messages below minTokens threshold", () => {
      const requests = [
        createTestRequest("Hi", "OK"), // Very short
      ];

      const mapping = [
        { turnIndex: 0, band: { start: 0, end: 100, level: "compress" as const } },
      ];

      const tasks = createCopilotCompressionTasks(requests, mapping, 30);

      // Both user and assistant are below threshold
      expect(tasks.every(t => t.status === "skipped")).toBe(true);
    });

    it("creates separate tasks for user and assistant", () => {
      const requests = [
        createTestRequest("User message here", "Assistant response here"),
      ];

      const mapping = [
        { turnIndex: 0, band: { start: 0, end: 100, level: "compress" as const } },
      ];

      const tasks = createCopilotCompressionTasks(requests, mapping, 1);

      const userTask = tasks.find(t => t.entryType === "user");
      const assistantTask = tasks.find(t => t.entryType === "assistant");

      expect(userTask).toBeDefined();
      expect(assistantTask).toBeDefined();
      expect(userTask?.originalContent).toBe("User message here");
    });
  });

  describe("applyCopilotCompressionResults", () => {
    it("applies compressed text to user messages", () => {
      const requests = [
        createTestRequest("Original user message", "Original response"),
      ];

      const tasks = [
        {
          messageIndex: 0,
          entryType: "user" as const,
          originalContent: "Original user message",
          level: "compress" as const,
          estimatedTokens: 10,
          attempt: 1,
          timeoutMs: 20000,
          status: "success" as const,
          result: "Compressed user",
        },
      ];

      const result = applyCopilotCompressionResults(requests, tasks);

      expect(result[0].message.text).toBe("Compressed user");
    });

    it("applies compressed text to assistant responses", () => {
      const requests = [
        createTestRequest("User", "Original assistant response"),
      ];

      const tasks = [
        {
          messageIndex: 1,
          entryType: "assistant" as const,
          originalContent: "Original assistant response",
          level: "compress" as const,
          estimatedTokens: 10,
          attempt: 1,
          timeoutMs: 20000,
          status: "success" as const,
          result: "Compressed assistant",
        },
      ];

      const result = applyCopilotCompressionResults(requests, tasks);

      // Assistant response should be updated
      const responseText = result[0].response
        .filter(r => r.kind === "markdownContent")
        .map(r => r.value)
        .join("");
      expect(responseText).toBe("Compressed assistant");
    });

    it("preserves tool invocation items in response", () => {
      const requests: CopilotRequest[] = [{
        requestId: "test",
        message: { text: "User", parts: [] },
        response: [
          { kind: "markdownContent", value: "Text before" },
          { kind: "toolInvocationSerialized", toolId: "test_tool", invocationMessage: "Running..." },
          { kind: "markdownContent", value: "Text after" },
        ],
        isCanceled: false,
        timestamp: Date.now(),
      }];

      const tasks = [
        {
          messageIndex: 1,
          entryType: "assistant" as const,
          originalContent: "Text before\n\nText after",
          level: "compress" as const,
          estimatedTokens: 10,
          attempt: 1,
          timeoutMs: 20000,
          status: "success" as const,
          result: "Compressed text",
        },
      ];

      const result = applyCopilotCompressionResults(requests, tasks);

      // Tool invocation should still be present
      const toolItem = result[0].response.find(r => r.kind === "toolInvocationSerialized");
      expect(toolItem).toBeDefined();
      expect(toolItem?.toolId).toBe("test_tool");
    });

    it("leaves failed tasks unchanged", () => {
      const requests = [
        createTestRequest("Original message", "Original response"),
      ];

      const tasks = [
        {
          messageIndex: 0,
          entryType: "user" as const,
          originalContent: "Original message",
          level: "compress" as const,
          estimatedTokens: 10,
          attempt: 3,
          timeoutMs: 60000,
          status: "failed" as const,
          error: "Timeout",
        },
      ];

      const result = applyCopilotCompressionResults(requests, tasks);

      expect(result[0].message.text).toBe("Original message");
    });
  });

  describe("compressCopilotMessages", () => {
    // AC: Copilot clone uses LLM provider to compress messages
    it("returns empty stats when no compression bands provided", async () => {
      const requests = [createTestRequest("Hello", "World")];
      const bands: CompressionBand[] = [];
      const config: CompressionConfig = {
        concurrency: 3,
        timeoutInitial: 20000,
        timeoutIncrement: 1.5,
        maxAttempts: 3,
        minTokens: 30,
        thinkingThreshold: 500,
        targetHeavy: 10,
        targetStandard: 35,
      };

      const result = await compressCopilotMessages(requests, bands, config);

      expect(result.stats.messagesCompressed).toBe(0);
      expect(result.requests).toEqual(requests);
    });

    // AC: Compression stats reflect actual token reduction
    it("returns stats with token reduction metrics", async () => {
      const requests = [
        createTestRequest(
          "This is a longer user message that should be compressed.",
          "This is a longer assistant response that should also be compressed."
        ),
      ];
      const bands: CompressionBand[] = [
        { start: 0, end: 100, level: "compress" },
      ];
      const config: CompressionConfig = {
        concurrency: 3,
        timeoutInitial: 20000,
        timeoutIncrement: 1.5,
        maxAttempts: 3,
        minTokens: 5,
        thinkingThreshold: 500,
        targetHeavy: 10,
        targetStandard: 35,
      };

      const result = await compressCopilotMessages(requests, bands, config);

      // Stats should be present with reduction metrics
      expect(result.stats).toHaveProperty("originalTokens");
      expect(result.stats).toHaveProperty("compressedTokens");
      expect(result.stats).toHaveProperty("reductionPercent");
    });

    // AC: Debug logging shows compression activity
    it("returns all tasks for debug logging", async () => {
      const requests = [
        createTestRequest("User message", "Assistant response"),
      ];
      const bands: CompressionBand[] = [
        { start: 0, end: 100, level: "compress" },
      ];
      const config: CompressionConfig = {
        concurrency: 3,
        timeoutInitial: 20000,
        timeoutIncrement: 1.5,
        maxAttempts: 3,
        minTokens: 1,
        thinkingThreshold: 500,
        targetHeavy: 10,
        targetStandard: 35,
      };

      const result = await compressCopilotMessages(requests, bands, config);

      // Tasks array should be populated for debug logging
      expect(result.tasks).toBeDefined();
      expect(Array.isArray(result.tasks)).toBe(true);
    });
  });
});
