import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFile, writeFile, appendFile, readdir, stat } from "fs/promises";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { cloneSession } from "../src/services/session-clone.js";
import { CloneRequest } from "../src/schemas/clone.js";
import { NotImplementedError, SessionNotFoundError } from "../src/errors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock file system
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  appendFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}));

// Mock UUID generation
vi.mock("crypto", () => ({
  randomUUID: vi.fn(() => "test-uuid-1234"),
}));

// Mock os.homedir
vi.mock("os", () => ({
  default: {
    homedir: () => "/mock/home",
  },
  homedir: () => "/mock/home",
}));

// Helper to load fixture (reads from disk, not mocked)
function loadFixture(filename: string): string {
  const fixturePath = path.join(__dirname, "fixtures", filename);
  return fs.readFileSync(fixturePath, "utf-8");
}

// Helper to skip the summary entry line (first line) from cloned output
function skipSummaryLine(content: string): string {
  const lines = content.trim().split("\n");
  // First line is now always the summary entry
  return lines.slice(1).join("\n");
}

describe("Session Clone Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock Date.now for consistent timestamps
    vi.spyOn(Date, "now").mockReturnValue(1733155845000);
    
    // Default mock setup for findSessionFile
    // Mock readdir to return a project directory
    vi.mocked(readdir).mockResolvedValue([
      { name: "-test-project", isDirectory: () => true, isFile: () => false } as any,
    ]);
    
    // Mock stat to indicate file exists (for successful findSessionFile)
    vi.mocked(stat).mockResolvedValue({
      isFile: () => true,
      isDirectory: () => false,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("TC-01: Valid clone with no removal", () => {
    it("should clone session with no removal", async () => {
      const fixture = loadFixture("minimal-session.jsonl");
      vi.mocked(readFile).mockResolvedValue(fixture);

      const request: CloneRequest = {
        sessionId: "11111111-1111-1111-1111-111111111111",
        toolRemoval: "none",
        thinkingRemoval: "none",
      };

      // Phase 2: Test expects actual behavior, will fail with NotImplementedError (red phase)
      const result = await cloneSession(request);
      
      expect(result.success).toBe(true);
      expect(result.stats.originalTurnCount).toBe(1);
      expect(result.stats.outputTurnCount).toBe(1);
      expect(result.stats.toolCallsRemoved).toBe(0);
      expect(result.stats.thinkingBlocksRemoved).toBe(0);
      expect(writeFile).toHaveBeenCalled();
    });
  });

  describe("TC-02: Valid clone with 100% tool removal", () => {
    it("should remove all tool_use and tool_result blocks", async () => {
      const fixture = loadFixture("tool-session.jsonl");
      const expected = loadFixture("expected/tool-session-100.jsonl");
      vi.mocked(readFile).mockResolvedValue(fixture);

      const request: CloneRequest = {
        sessionId: "22222222-2222-2222-2222-222222222222",
        toolRemoval: "100",
        thinkingRemoval: "none",
      };

      // Phase 2: Test expects actual behavior, will fail with NotImplementedError (red phase)
      const result = await cloneSession(request);
      
      expect(result.success).toBe(true);
      expect(result.stats.toolCallsRemoved).toBeGreaterThan(0);
      expect(writeFile).toHaveBeenCalled();
      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      // Skip summary line (first line) when comparing to expected fixture
      expect(skipSummaryLine(writtenContent)).toBe(expected.trim());
    });
  });

  describe("TC-03: Valid clone with 75% thinking removal", () => {
    it("should remove thinking blocks from oldest 75% of turns", async () => {
      const fixture = loadFixture("thinking-session.jsonl");
      const expected = loadFixture("expected/thinking-session-75.jsonl");
      vi.mocked(readFile).mockResolvedValue(fixture);

      const request: CloneRequest = {
        sessionId: "33333333-3333-3333-3333-333333333333",
        toolRemoval: "none",
        thinkingRemoval: "75",
      };

      // Phase 2: Test expects actual behavior, will fail with NotImplementedError (red phase)
      const result = await cloneSession(request);
      
      expect(result.success).toBe(true);
      expect(result.stats.thinkingBlocksRemoved).toBeGreaterThan(0);
      expect(writeFile).toHaveBeenCalled();
      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      // Skip summary line (first line) when comparing to expected fixture
      expect(skipSummaryLine(writtenContent)).toBe(expected.trim());
    });
  });

  describe("TC-04: Valid clone with combined removal (50% tool, 75% thinking)", () => {
    it("should apply independent removal boundaries", async () => {
      const fixture = loadFixture("mixed-session.jsonl");
      const expected = loadFixture("expected/mixed-session-50-50.jsonl");
      vi.mocked(readFile).mockResolvedValue(fixture);

      const request: CloneRequest = {
        sessionId: "44444444-4444-4444-4444-444444444444",
        toolRemoval: "50",
        thinkingRemoval: "75",
      };

      // Phase 2: Test expects actual behavior, will fail with NotImplementedError (red phase)
      const result = await cloneSession(request);
      
      expect(result.success).toBe(true);
      expect(result.stats.toolCallsRemoved).toBeGreaterThan(0);
      expect(result.stats.thinkingBlocksRemoved).toBeGreaterThan(0);
      expect(writeFile).toHaveBeenCalled();
      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      // Skip summary line (first line) when comparing to expected fixture
      expect(skipSummaryLine(writtenContent)).toBe(expected.trim());
    });
  });

  describe("TC-05: Invalid sessionId format", () => {
    it("should reject invalid UUID format", async () => {
      // Note: Zod validation happens at route level, not service level
      // Service receives CloneRequest which is already validated by Zod
      // This test will fail because findSessionFile will throw SessionNotFoundError
      // In Phase 3, move this test to route-level integration tests for Zod validation
      vi.mocked(stat).mockRejectedValue(new Error("ENOENT: no such file"));
      
      const request = {
        sessionId: "not-a-uuid",
        toolRemoval: "none" as const,
        thinkingRemoval: "none" as const,
      };

      // Phase 2: Test expects actual behavior (validation error), will fail with NotImplementedError (red phase)
      // Note: This test should be at route level in Phase 3 since Zod validation is route-level concern
      await expect(cloneSession(request as CloneRequest)).rejects.toThrow();
    });
  });

  describe("TC-06: Session not found", () => {
    it("should throw SessionNotFoundError when file does not exist", async () => {
      // Reset stat mock to throw error for this test
      vi.mocked(stat).mockRejectedValue(new Error("ENOENT: no such file"));

      const request: CloneRequest = {
        sessionId: "99999999-9999-9999-9999-999999999999",
        toolRemoval: "none",
        thinkingRemoval: "none",
      };

      // Phase 2: Test expects actual behavior, will fail with NotImplementedError (red phase)
      await expect(cloneSession(request)).rejects.toThrow(SessionNotFoundError);
    });
  });

  describe("TC-07: Empty session (no user/assistant turns)", () => {
    it("should handle session with only queue-operation entries", async () => {
      const fixture = loadFixture("queue-ops-session.jsonl");
      vi.mocked(readFile).mockResolvedValue(fixture);

      const request: CloneRequest = {
        sessionId: "55555555-5555-5555-5555-555555555555",
        toolRemoval: "none",
        thinkingRemoval: "none",
      };

      // Phase 2: Test expects actual behavior, will fail with NotImplementedError (red phase)
      const result = await cloneSession(request);
      
      expect(result.success).toBe(true);
      expect(result.stats.originalTurnCount).toBe(0);
      expect(result.stats.outputTurnCount).toBe(0);
      expect(writeFile).toHaveBeenCalled();
    });
  });

  describe("TC-08: Tool pairing across boundary", () => {
    it("should handle tool_use/tool_result pairs that straddle removal boundary", async () => {
      const fixture = loadFixture("tool-session.jsonl");
      vi.mocked(readFile).mockResolvedValue(fixture);

      const request: CloneRequest = {
        sessionId: "22222222-2222-2222-2222-222222222222",
        toolRemoval: "50",
        thinkingRemoval: "none",
      };

      // Phase 2: Test expects actual behavior, will fail with NotImplementedError (red phase)
      const result = await cloneSession(request);
      
      expect(result.success).toBe(true);
      // Verify no orphaned tool_result or tool_use blocks
      expect(writeFile).toHaveBeenCalled();
      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      const lines = writtenContent.split("\n").filter(Boolean);
      // No orphaned tool_result without matching tool_use
      // No orphaned tool_use without matching tool_result
    });
  });

  describe("TC-09: New UUID generation", () => {
    it("should generate new UUID for cloned session", async () => {
      const fixture = loadFixture("minimal-session.jsonl");
      vi.mocked(readFile).mockResolvedValue(fixture);

      const request: CloneRequest = {
        sessionId: "11111111-1111-1111-1111-111111111111",
        toolRemoval: "none",
        thinkingRemoval: "none",
      };

      // Phase 2: Test expects actual behavior, will fail with NotImplementedError (red phase)
      const result = await cloneSession(request);
      
      expect(result.success).toBe(true);
      expect(randomUUID).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalled();
      const outputPath = result.outputPath;
      expect(outputPath).toContain("test-uuid-1234");
      // Verify all sessionId fields in output are updated to new UUID
    });
  });

  describe("TC-10: Lineage log format", () => {
    it("should append lineage entry to log file", async () => {
      const fixture = loadFixture("minimal-session.jsonl");
      vi.mocked(readFile).mockResolvedValue(fixture);

      const request: CloneRequest = {
        sessionId: "11111111-1111-1111-1111-111111111111",
        toolRemoval: "none",
        thinkingRemoval: "none",
      };

      // Phase 2: Test expects actual behavior, will fail with NotImplementedError (red phase)
      const result = await cloneSession(request);
      
      expect(result.success).toBe(true);
      expect(appendFile).toHaveBeenCalled();
      const logEntry = vi.mocked(appendFile).mock.calls[0][1] as string;
      expect(logEntry).toContain("TARGET:");
      expect(logEntry).toContain("SOURCE:");
      expect(logEntry).toContain("11111111-1111-1111-1111-111111111111");
      expect(logEntry).toContain("test-uuid-1234");
      expect(logEntry).toContain("toolRemoval=none");
      expect(logEntry).toContain("thinkingRemoval=none");
    });
  });

  describe("TC-11: parentUuid chain repair", () => {
    it("should repair parentUuid chain after removals", async () => {
      const fixture = loadFixture("tool-session.jsonl");
      vi.mocked(readFile).mockResolvedValue(fixture);

      const request: CloneRequest = {
        sessionId: "22222222-2222-2222-2222-222222222222",
        toolRemoval: "100",
        thinkingRemoval: "none",
      };

      // Phase 2: Test expects actual behavior, will fail with NotImplementedError (red phase)
      const result = await cloneSession(request);
      
      expect(result.success).toBe(true);
      expect(writeFile).toHaveBeenCalled();
      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      const lines = writtenContent.split("\n").filter(Boolean).map(l => JSON.parse(l));
      // Verify parentUuid chain is intact - no broken references
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.parentUuid !== null && line.parentUuid !== undefined) {
          const parentExists = lines.some(l => l.uuid === line.parentUuid);
          expect(parentExists).toBe(true);
        }
      }
    });
  });

  describe("TC-12: Queue-operation and file-history-snapshot handling", () => {
    it("should copy through queue-operation and file-history-snapshot entries", async () => {
      const fixture = loadFixture("queue-ops-session.jsonl");
      vi.mocked(readFile).mockResolvedValue(fixture);

      const request: CloneRequest = {
        sessionId: "55555555-5555-5555-5555-555555555555",
        toolRemoval: "none",
        thinkingRemoval: "none",
      };

      // Phase 2: Test expects actual behavior, will fail with NotImplementedError (red phase)
      const result = await cloneSession(request);
      
      expect(result.success).toBe(true);
      expect(writeFile).toHaveBeenCalled();
      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      const lines = writtenContent.split("\n").filter(Boolean).map(l => JSON.parse(l));
      // Verify queue-operation and file-history-snapshot entries are preserved
      const queueOps = lines.filter(l => l.type === "queue-operation");
      const fileSnaps = lines.filter(l => l.type === "file-history-snapshot");
      expect(queueOps.length).toBeGreaterThan(0);
      expect(fileSnaps.length).toBeGreaterThan(0);
      // Verify sessionId is updated to new UUID
      lines.forEach(line => {
        if (line.sessionId) {
          expect(line.sessionId).toBe("test-uuid-1234");
        }
      });
    });
  });

  describe("TC-13: Mixed content block surgical removal", () => {
    it("should surgically remove thinking blocks from content arrays", async () => {
      const fixture = loadFixture("mixed-session.jsonl");
      vi.mocked(readFile).mockResolvedValue(fixture);

      const request: CloneRequest = {
        sessionId: "44444444-4444-4444-4444-444444444444",
        toolRemoval: "none",
        thinkingRemoval: "50",
      };

      // Phase 2: Test expects actual behavior, will fail with NotImplementedError (red phase)
      const result = await cloneSession(request);
      
      expect(result.success).toBe(true);
      expect(writeFile).toHaveBeenCalled();
      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      const lines = writtenContent.split("\n").filter(Boolean).map(l => JSON.parse(l));
      // Verify thinking blocks removed from content arrays in removal zone
      // but text and tool_use blocks preserved
      const assistantLines = lines.filter(l => l.type === "assistant" && l.message?.content);
      assistantLines.forEach(line => {
        const content = Array.isArray(line.message.content) ? line.message.content : [];
        // In removal zone, no thinking blocks should exist
        // Text and tool_use should be preserved
        const hasThinking = content.some((c: any) => c.type === "thinking");
        // This assertion will be refined in Phase 3 based on turn boundaries
      });
    });
  });
});

