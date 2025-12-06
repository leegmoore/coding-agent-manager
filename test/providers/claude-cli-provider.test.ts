import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaudeCliProvider } from "../../src/providers/claude-cli-provider.js";
import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

interface MockStdin {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

function createMockProcess(): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdin = { write: vi.fn(), end: vi.fn() } as unknown as MockStdin &
    NodeJS.WritableStream;
  proc.stdout = new EventEmitter() as NodeJS.ReadableStream;
  proc.stderr = new EventEmitter() as NodeJS.ReadableStream;
  return proc;
}

/**
 * Claude CLI Provider Tests
 *
 * Tests the Claude CLI provider implementation:
 * - Model selection (haiku vs opus based on useLargeModel)
 * - Prompt construction (compression levels)
 * - stdin/stdout handling
 * - Error handling (ENOENT, exit codes, invalid JSON)
 */

describe("ClaudeCliProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("compress", () => {
    it("spawns claude with haiku when useLargeModel is false", async () => {
      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test text", "compress", false);

      mockProc.stdout.emit("data", Buffer.from('{"result": "{\\"text\\": \\"compressed text\\"}"}'));
      mockProc.emit("close", 0);

      await promise;

      expect(spawn).toHaveBeenCalledWith(
        "claude",
        ["-p", "--model", "haiku", "--output-format", "json"],
        expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] })
      );
    });

    it("spawns claude with opus when useLargeModel is true", async () => {
      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test text", "compress", true);

      mockProc.stdout.emit("data", Buffer.from('{"result": "{\\"text\\": \\"compressed text\\"}"}'));
      mockProc.emit("close", 0);

      await promise;

      expect(spawn).toHaveBeenCalledWith(
        "claude",
        ["-p", "--model", "opus", "--output-format", "json"],
        expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] })
      );
    });

    it("builds prompt with correct target percent for compress level", async () => {
      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test text", "compress", false);

      mockProc.stdout.emit("data", Buffer.from('{"result": "{\\"text\\": \\"ok\\"}"}'));
      mockProc.emit("close", 0);

      await promise;

      const writtenPrompt = (mockProc.stdin as unknown as MockStdin).write.mock
        .calls[0][0] as string;
      expect(writtenPrompt).toContain("35%");
    });

    it("builds prompt with correct target percent for heavy-compress level", async () => {
      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test text", "heavy-compress", false);

      mockProc.stdout.emit("data", Buffer.from('{"result": "{\\"text\\": \\"ok\\"}"}'));
      mockProc.emit("close", 0);

      await promise;

      const writtenPrompt = (mockProc.stdin as unknown as MockStdin).write.mock
        .calls[0][0] as string;
      expect(writtenPrompt).toContain("10%");
    });

    it("writes prompt to stdin and closes", async () => {
      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("my text", "compress", false);

      mockProc.stdout.emit("data", Buffer.from('{"result": "{\\"text\\": \\"ok\\"}"}'));
      mockProc.emit("close", 0);

      await promise;

      expect((mockProc.stdin as unknown as MockStdin).write).toHaveBeenCalled();
      expect((mockProc.stdin as unknown as MockStdin).end).toHaveBeenCalled();
    });

    it("returns parsed result from JSON output", async () => {
      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test", "compress", false);

      mockProc.stdout.emit("data", Buffer.from('{"result": "{\\"text\\": \\"compressed output\\"}"}'));
      mockProc.emit("close", 0);

      const result = await promise;
      expect(result).toBe("compressed output");
    });

    it("handles chunked stdout", async () => {
      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test", "compress", false);

      // Send in chunks
      mockProc.stdout.emit("data", Buffer.from('{"result": "{\\"text\\":'));
      mockProc.stdout.emit("data", Buffer.from(' \\"chunked\\"}"}'));
      mockProc.emit("close", 0);

      const result = await promise;
      expect(result).toBe("chunked");
    });

    it("throws descriptive error when claude not found", async () => {
      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test", "compress", false);

      const error = new Error("spawn ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      mockProc.emit("error", error);

      await expect(promise).rejects.toThrow("Claude CLI not found");
    });

    it("throws error on non-zero exit code", async () => {
      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test", "compress", false);

      mockProc.stderr.emit("data", Buffer.from("Authentication required"));
      mockProc.emit("close", 1);

      await expect(promise).rejects.toThrow("Claude CLI exited with code 1");
    });

    it("throws error on invalid JSON output", async () => {
      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test", "compress", false);

      mockProc.stdout.emit("data", Buffer.from("not valid json"));
      mockProc.emit("close", 0);

      await expect(promise).rejects.toThrow("Failed to parse Claude CLI output");
    });

    it("handles markdown code block in LLM response", async () => {
      const mockProc = createMockProcess();
      vi.mocked(spawn).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test", "compress", false);

      // CLI returns result with markdown-wrapped JSON
      mockProc.stdout.emit("data", Buffer.from('{"result": "```json\\n{\\"text\\": \\"markdown output\\"}\\n```"}'));
      mockProc.emit("close", 0);

      const result = await promise;
      expect(result).toBe("markdown output");
    });
  });
});
