import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, readFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { writeCopilotCompressionDebugLog } from "../../src/services/copilot-compression-debug-logger.js";
import type { CopilotRequest } from "../../src/sources/copilot-types.js";
import type { CompressionTask } from "../../src/types.js";

describe("Copilot Compression Debug Logger", () => {
  const testDebugDir = join(process.cwd(), "test-debug-logs");

  beforeEach(async () => {
    await mkdir(testDebugDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDebugDir, { recursive: true, force: true });
  });

  // Test fixtures
  function createTestRequest(
    requestId: string,
    userText: string,
    assistantText: string
  ): CopilotRequest {
    return {
      requestId,
      message: { text: userText, parts: [] },
      response: [{ kind: "markdownContent", value: assistantText }],
      isCanceled: false,
      timestamp: Date.now(),
    };
  }

  // AC: Debug log file is created when debugLog: true
  describe("writeCopilotCompressionDebugLog", () => {
    it("creates debug log file in specified directory", async () => {
      const sourceSessionId = "source-session-123";
      const targetSessionId = "target-session-456";
      const originalRequests = [
        createTestRequest("req1", "Hello, help me with this", "Sure, I can help"),
      ];
      const compressedRequests = [
        createTestRequest("req1", "Help with this", "I can help"),
      ];
      const tasks: CompressionTask[] = [
        {
          messageIndex: 0,
          entryType: "user",
          originalContent: "Hello, help me with this",
          level: "compress",
          estimatedTokens: 6,
          attempt: 1,
          timeoutMs: 20000,
          status: "success",
          result: "Help with this",
        },
        {
          messageIndex: 1,
          entryType: "assistant",
          originalContent: "Sure, I can help",
          level: "compress",
          estimatedTokens: 4,
          attempt: 1,
          timeoutMs: 20000,
          status: "success",
          result: "I can help",
        },
      ];

      const debugLogPath = await writeCopilotCompressionDebugLog(
        sourceSessionId,
        targetSessionId,
        originalRequests,
        compressedRequests,
        tasks,
        testDebugDir
      );

      // Should return path to created file
      expect(debugLogPath).toBeDefined();
      expect(debugLogPath).toContain(targetSessionId);
      expect(debugLogPath).toContain(".md");

      // File should exist
      const content = await readFile(debugLogPath, "utf-8");
      expect(content.length).toBeGreaterThan(0);
    });

    // AC: Log contains expected structure
    it("log contains session IDs", async () => {
      const sourceSessionId = "source-session-abc";
      const targetSessionId = "target-session-xyz";
      const originalRequests = [createTestRequest("req1", "User msg", "Assistant msg")];
      const compressedRequests = [createTestRequest("req1", "Compressed user", "Compressed assistant")];
      const tasks: CompressionTask[] = [];

      const debugLogPath = await writeCopilotCompressionDebugLog(
        sourceSessionId,
        targetSessionId,
        originalRequests,
        compressedRequests,
        tasks,
        testDebugDir
      );

      const content = await readFile(debugLogPath, "utf-8");
      expect(content).toContain(sourceSessionId);
      expect(content).toContain(targetSessionId);
    });

    // AC: Debug log shows original content
    it("log contains original message content", async () => {
      const originalRequests = [
        createTestRequest("req1", "Original user message here", "Original assistant response here"),
      ];
      const compressedRequests = [
        createTestRequest("req1", "Compressed user", "Compressed assistant"),
      ];
      const tasks: CompressionTask[] = [
        {
          messageIndex: 0,
          entryType: "user",
          originalContent: "Original user message here",
          level: "compress",
          estimatedTokens: 5,
          attempt: 1,
          timeoutMs: 20000,
          status: "success",
          result: "Compressed user",
        },
      ];

      const debugLogPath = await writeCopilotCompressionDebugLog(
        "source-1",
        "target-1",
        originalRequests,
        compressedRequests,
        tasks,
        testDebugDir
      );

      const content = await readFile(debugLogPath, "utf-8");
      expect(content).toContain("Original user message here");
    });

    // AC: Debug log shows compressed result
    it("log contains compressed result", async () => {
      const originalRequests = [
        createTestRequest("req1", "Original message", "Original response"),
      ];
      const compressedRequests = [
        createTestRequest("req1", "Compressed msg", "Compressed resp"),
      ];
      const tasks: CompressionTask[] = [
        {
          messageIndex: 0,
          entryType: "user",
          originalContent: "Original message",
          level: "compress",
          estimatedTokens: 4,
          attempt: 1,
          timeoutMs: 20000,
          status: "success",
          result: "Compressed msg",
        },
      ];

      const debugLogPath = await writeCopilotCompressionDebugLog(
        "source-2",
        "target-2",
        originalRequests,
        compressedRequests,
        tasks,
        testDebugDir
      );

      const content = await readFile(debugLogPath, "utf-8");
      expect(content).toContain("Compressed msg");
    });

    // AC: Debug log shows compression level used
    it("log contains compression level", async () => {
      const originalRequests = [createTestRequest("req1", "User msg", "Assistant msg")];
      const compressedRequests = [createTestRequest("req1", "Short", "Short")];
      const tasks: CompressionTask[] = [
        {
          messageIndex: 0,
          entryType: "user",
          originalContent: "User msg",
          level: "heavy-compress",
          estimatedTokens: 2,
          attempt: 1,
          timeoutMs: 20000,
          status: "success",
          result: "Short",
        },
      ];

      const debugLogPath = await writeCopilotCompressionDebugLog(
        "source-3",
        "target-3",
        originalRequests,
        compressedRequests,
        tasks,
        testDebugDir
      );

      const content = await readFile(debugLogPath, "utf-8");
      expect(content).toContain("heavy-compress");
    });

    // AC: Debug log shows token counts (before/after)
    it("log contains token counts", async () => {
      const originalRequests = [
        createTestRequest("req1", "A longer user message for token counting", "Response"),
      ];
      const compressedRequests = [createTestRequest("req1", "Short", "Resp")];
      const tasks: CompressionTask[] = [
        {
          messageIndex: 0,
          entryType: "user",
          originalContent: "A longer user message for token counting",
          level: "compress",
          estimatedTokens: 10,
          attempt: 1,
          timeoutMs: 20000,
          status: "success",
          result: "Short",
        },
      ];

      const debugLogPath = await writeCopilotCompressionDebugLog(
        "source-4",
        "target-4",
        originalRequests,
        compressedRequests,
        tasks,
        testDebugDir
      );

      const content = await readFile(debugLogPath, "utf-8");
      // Should contain token count info
      expect(content).toContain("Original:");
      expect(content).toContain("tokens");
      expect(content).toContain("Compressed:");
    });

    // AC: Debug log shows status (success/failed/skipped)
    it("log shows successful compression status", async () => {
      const tasks: CompressionTask[] = [
        {
          messageIndex: 0,
          entryType: "user",
          originalContent: "Message",
          level: "compress",
          estimatedTokens: 3,
          attempt: 1,
          timeoutMs: 20000,
          status: "success",
          result: "Msg",
        },
      ];

      const debugLogPath = await writeCopilotCompressionDebugLog(
        "source-5",
        "target-5",
        [createTestRequest("req1", "Message", "Response")],
        [createTestRequest("req1", "Msg", "Resp")],
        tasks,
        testDebugDir
      );

      const content = await readFile(debugLogPath, "utf-8");
      expect(content).toMatch(/Status:.*Compressed/i);
    });

    it("log shows skipped status for below-threshold messages", async () => {
      const tasks: CompressionTask[] = [
        {
          messageIndex: 0,
          entryType: "user",
          originalContent: "Hi",
          level: "compress",
          estimatedTokens: 1,
          attempt: 0,
          timeoutMs: 20000,
          status: "skipped",
        },
      ];

      const debugLogPath = await writeCopilotCompressionDebugLog(
        "source-6",
        "target-6",
        [createTestRequest("req1", "Hi", "Hello")],
        [createTestRequest("req1", "Hi", "Hello")],
        tasks,
        testDebugDir
      );

      const content = await readFile(debugLogPath, "utf-8");
      expect(content).toMatch(/Status:.*Skipped|Not Compressed.*Threshold/i);
    });

    it("log shows failed status with error", async () => {
      const tasks: CompressionTask[] = [
        {
          messageIndex: 0,
          entryType: "user",
          originalContent: "User message",
          level: "compress",
          estimatedTokens: 3,
          attempt: 3,
          timeoutMs: 60000,
          status: "failed",
          error: "LLM timeout after 3 attempts",
        },
      ];

      const debugLogPath = await writeCopilotCompressionDebugLog(
        "source-7",
        "target-7",
        [createTestRequest("req1", "User message", "Response")],
        [createTestRequest("req1", "User message", "Response")],
        tasks,
        testDebugDir
      );

      const content = await readFile(debugLogPath, "utf-8");
      expect(content).toMatch(/Status:.*Failed|Not Compressed.*Failed/i);
      expect(content).toContain("LLM timeout");
    });

    // AC: Log is human-readable (markdown format)
    it("generates markdown formatted log", async () => {
      const tasks: CompressionTask[] = [
        {
          messageIndex: 0,
          entryType: "user",
          originalContent: "Test message",
          level: "compress",
          estimatedTokens: 2,
          attempt: 1,
          timeoutMs: 20000,
          status: "success",
          result: "Test",
        },
      ];

      const debugLogPath = await writeCopilotCompressionDebugLog(
        "source-8",
        "target-8",
        [createTestRequest("req1", "Test message", "Response")],
        [createTestRequest("req1", "Test", "Response")],
        tasks,
        testDebugDir
      );

      const content = await readFile(debugLogPath, "utf-8");
      // Should have markdown headers
      expect(content).toContain("# ");
      expect(content).toContain("## ");
      // Should have code blocks
      expect(content).toContain("```");
    });

    // Summary statistics
    it("includes summary statistics", async () => {
      const tasks: CompressionTask[] = [
        {
          messageIndex: 0,
          entryType: "user",
          originalContent: "User message one",
          level: "compress",
          estimatedTokens: 4,
          attempt: 1,
          timeoutMs: 20000,
          status: "success",
          result: "User 1",
        },
        {
          messageIndex: 1,
          entryType: "assistant",
          originalContent: "Assistant response one",
          level: "compress",
          estimatedTokens: 4,
          attempt: 1,
          timeoutMs: 20000,
          status: "success",
          result: "Asst 1",
        },
        {
          messageIndex: 2,
          entryType: "user",
          originalContent: "Hi",
          level: "compress",
          estimatedTokens: 1,
          attempt: 0,
          timeoutMs: 20000,
          status: "skipped",
        },
      ];

      const debugLogPath = await writeCopilotCompressionDebugLog(
        "source-9",
        "target-9",
        [
          createTestRequest("req1", "User message one", "Assistant response one"),
          createTestRequest("req2", "Hi", "Hello"),
        ],
        [
          createTestRequest("req1", "User 1", "Asst 1"),
          createTestRequest("req2", "Hi", "Hello"),
        ],
        tasks,
        testDebugDir
      );

      const content = await readFile(debugLogPath, "utf-8");
      expect(content).toContain("Summary");
      expect(content).toMatch(/Compressed.*successfully/i);
      expect(content).toMatch(/Skipped/i);
    });

    // Handle multiple turns
    it("handles multiple turns with separate user/assistant tasks", async () => {
      const originalRequests = [
        createTestRequest("req1", "First user msg", "First assistant resp"),
        createTestRequest("req2", "Second user msg", "Second assistant resp"),
      ];
      const compressedRequests = [
        createTestRequest("req1", "First compressed", "First resp compressed"),
        createTestRequest("req2", "Second compressed", "Second resp compressed"),
      ];
      const tasks: CompressionTask[] = [
        {
          messageIndex: 0,
          entryType: "user",
          originalContent: "First user msg",
          level: "heavy-compress",
          estimatedTokens: 3,
          attempt: 1,
          timeoutMs: 20000,
          status: "success",
          result: "First compressed",
        },
        {
          messageIndex: 1,
          entryType: "assistant",
          originalContent: "First assistant resp",
          level: "heavy-compress",
          estimatedTokens: 4,
          attempt: 1,
          timeoutMs: 20000,
          status: "success",
          result: "First resp compressed",
        },
        {
          messageIndex: 2,
          entryType: "user",
          originalContent: "Second user msg",
          level: "compress",
          estimatedTokens: 3,
          attempt: 1,
          timeoutMs: 20000,
          status: "success",
          result: "Second compressed",
        },
        {
          messageIndex: 3,
          entryType: "assistant",
          originalContent: "Second assistant resp",
          level: "compress",
          estimatedTokens: 4,
          attempt: 1,
          timeoutMs: 20000,
          status: "success",
          result: "Second resp compressed",
        },
      ];

      const debugLogPath = await writeCopilotCompressionDebugLog(
        "source-10",
        "target-10",
        originalRequests,
        compressedRequests,
        tasks,
        testDebugDir
      );

      const content = await readFile(debugLogPath, "utf-8");
      // Should contain all messages
      expect(content).toContain("First user msg");
      expect(content).toContain("First assistant resp");
      expect(content).toContain("Second user msg");
      expect(content).toContain("Second assistant resp");
      // Should show both compression levels
      expect(content).toContain("heavy-compress");
      expect(content).toContain("compress");
    });
  });
});
