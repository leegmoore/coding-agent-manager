import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import path from "path";
import { rm, readFile } from "fs/promises";
import { CopilotCloneService } from "../../src/services/copilot-clone.js";
import type { CopilotRequest } from "../../src/sources/copilot-types.js";

// Mock the compression module to avoid real LLM calls in debug log tests
vi.mock("../../src/services/copilot-compression.js", async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    compressCopilotMessages: vi.fn().mockImplementation(
      async (requests: CopilotRequest[]) => ({
        requests: requests.map(r => ({
          ...r,
          message: { ...r.message, text: "compressed: " + r.message.text.slice(0, 20) }
        })),
        stats: {
          messagesCompressed: requests.length * 2,
          messagesSkipped: 0,
          messagesFailed: 0,
          originalTokens: 100,
          compressedTokens: 35,
          tokensRemoved: 65,
          reductionPercent: 65,
        },
        tasks: requests.flatMap((r, i) => [
          {
            messageIndex: i * 2,
            entryType: "user" as const,
            originalContent: r.message.text,
            level: "compress" as const,
            estimatedTokens: 25,
            attempt: 1,
            timeoutMs: 20000,
            status: "success" as const,
            result: "compressed: " + r.message.text.slice(0, 20),
          },
          {
            messageIndex: i * 2 + 1,
            entryType: "assistant" as const,
            originalContent: r.response[0]?.value?.toString() || "",
            level: "compress" as const,
            estimatedTokens: 25,
            attempt: 1,
            timeoutMs: 20000,
            status: "success" as const,
            result: "compressed assistant response",
          },
        ]),
      })
    ),
  };
});

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
        { writeToDisk: false }
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
        { writeToDisk: false }
      );

      expect(result.session.sessionId).not.toBe("11111111-1111-1111-1111-111111111111");
      expect(result.session.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    // Clone title generation for session identification in VS Code chat list
    it("generates descriptive customTitle with message preview and timestamp", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        { writeToDisk: false }
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
        { compressPercent: 50, writeToDisk: false }
      );

      expect(result.session.requests.length).toBe(1);
      expect(result.stats.removedTurns).toBe(1);
    });

    // AC-28: Compression operates on requests[] array (removes oldest)
    it("removes oldest turns when compressing", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        { compressPercent: 50, writeToDisk: false }
      );

      // Should keep the second (newer) request
      expect(result.session.requests[0].message.text).toContain("error handling");
    });

    // AC-29: Clone returns stats including token counts
    it("calculates token stats", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        { writeToDisk: false }
      );

      expect(result.stats.originalTokens).toBeGreaterThan(0);
      expect(result.stats.clonedTokens).toBeGreaterThan(0);
    });

    // AC-29: Clone returns stats including compression ratio
    it("calculates compression ratio", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        { compressPercent: 50, writeToDisk: false }
      );

      expect(result.stats.compressionRatio).toBeGreaterThan(0);
    });

    // AC-27: Compression edge case - 0% means no compression
    it("handles 0% compression", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        { compressPercent: 0, writeToDisk: false }
      );

      expect(result.session.requests.length).toBe(2);
      expect(result.stats.compressionRatio).toBe(0);
    });

    // AC-27: Compression edge case - 100% removes all turns
    it("handles 100% compression", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        { compressPercent: 100, writeToDisk: false }
      );

      expect(result.session.requests.length).toBe(0);
    });

    // Error handling: non-existent session
    it("throws for non-existent session", async () => {
      await expect(
        service.clone("nonexistent", "abc123def456ghi789", { writeToDisk: false })
      ).rejects.toThrow();
    });

    // Title should always use ORIGINAL first message, even when compressed
    it("uses original first message for title even when compressed", async () => {
      // 11111111... fixture has first message "Help me refactor this code"
      // and second message "Add error handling for token expiration"
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        { compressPercent: 50, writeToDisk: false }  // Removes first turn, keeps second
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

  // AC: Debug logging for compression
  describe("debugLog option", () => {
    const debugLogDir = path.join(process.cwd(), "clone-debug-log");

    afterEach(async () => {
      // Clean up debug logs after each test
      await rm(debugLogDir, { recursive: true, force: true });
    });

    // AC: Debug log file is created when debugLog: true
    it("returns debugLogPath when debugLog is true with compression bands", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        {
          writeToDisk: false,
          debugLog: true,
          compressionBands: [{ start: 0, end: 100, level: "compress" }],
        }
      );

      expect(result.debugLogPath).toBeDefined();
      expect(result.debugLogPath).toContain("-compression-debug.md");
    });

    // AC: Debug log path is returned in result
    it("creates debug log file at returned path", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        {
          writeToDisk: false,
          debugLog: true,
          compressionBands: [{ start: 0, end: 100, level: "compress" }],
        }
      );

      // Read the actual file using the path
      const absolutePath = path.join(process.cwd(), result.debugLogPath!);
      const content = await readFile(absolutePath, "utf-8");
      expect(content).toContain("Copilot Compression Debug Log");
    });

    // AC: Log contains expected structure - session IDs
    it("debug log contains session IDs", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        {
          writeToDisk: false,
          debugLog: true,
          compressionBands: [{ start: 0, end: 100, level: "compress" }],
        }
      );

      const absolutePath = path.join(process.cwd(), result.debugLogPath!);
      const content = await readFile(absolutePath, "utf-8");
      expect(content).toContain("11111111-1111-1111-1111-111111111111");
      expect(content).toContain(result.session.sessionId);
    });

    // AC: Log contains compression level used
    it("debug log contains compression level", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        {
          writeToDisk: false,
          debugLog: true,
          compressionBands: [{ start: 0, end: 100, level: "compress" }],
        }
      );

      const absolutePath = path.join(process.cwd(), result.debugLogPath!);
      const content = await readFile(absolutePath, "utf-8");
      expect(content).toContain("compress");
    });

    // AC: No debug log when debugLog is false
    it("does not create debug log when debugLog is false", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        {
          writeToDisk: false,
          debugLog: false,
          compressionBands: [{ start: 0, end: 100, level: "compress" }],
        }
      );

      expect(result.debugLogPath).toBeUndefined();
    });

    // AC: No debug log when no compression bands
    it("does not create debug log when no compression bands", async () => {
      const result = await service.clone(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        {
          writeToDisk: false,
          debugLog: true,
          // No compressionBands
        }
      );

      expect(result.debugLogPath).toBeUndefined();
    });
  });
});
