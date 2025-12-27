import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFile, writeFile, appendFile, readdir, stat } from "fs/promises";
import { randomUUID } from "crypto";
import { cloneSessionV2 } from "../src/services/session-clone.js";
import { cloneSession } from "../src/services/session-clone.js";
import type { CloneRequestV2 } from "../src/schemas/clone-v2.js";
import type { CloneRequest } from "../src/schemas/clone.js";
import {
  createFixtureWith6Turns,
  createFixtureWithToolCalls,
  createMinimalFixture,
} from "./helpers/fixture-helpers.js";

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
  randomUUID: vi.fn(() => "test-uuid-new"),
}));

// Mock os.homedir
vi.mock("os", () => ({
  default: {
    homedir: () => "/mock/home",
  },
  homedir: () => "/mock/home",
}));

// Mock provider factory to return a mock provider
// The compress method takes (text, level, useLargeModel) parameters
vi.mock("../src/providers/index.js", () => ({
  getProvider: () => ({
    compress(
      text: string,
      _level: string,
      _useLargeModel: boolean
    ): Promise<string> {
      // Return exactly 35% of chars -> 35% of tokens (since tokens = ceil(chars/4))
      const targetChars = Math.floor(text.length * 0.35);
      return Promise.resolve(text.substring(0, targetChars));
    },
  }),
  resetProvider: () => {},
}));

describe("Clone V2 Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1733155845000);
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue(
      "2024-12-02T12:00:00.000Z"
    );

    // Default mock setup for findSessionFile
    vi.mocked(readdir).mockResolvedValue([
      {
        name: "-test-project",
        isDirectory: () => true,
        isFile: () => false,
      } as unknown as ReturnType<typeof readdir> extends Promise<infer T>
        ? T extends Array<infer U>
          ? U
          : never
        : never,
    ]);

    vi.mocked(stat).mockResolvedValue({
      isFile: () => true,
      isDirectory: () => false,
    } as unknown as Awaited<ReturnType<typeof stat>>);

    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(appendFile).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("TC-08: Token Statistics", () => {
    it("returns accurate token statistics", async () => {
      // Arrange
      const fixtureContent = createFixtureWith6Turns();
      vi.mocked(readFile).mockResolvedValue(fixtureContent);

      const request: CloneRequestV2 = {
        sessionId: "test-session-id",
        toolRemoval: 0,
        thinkingRemoval: 0,
        compressionBands: [{ start: 0, end: 50, level: "compress" }],
        includeUserMessages: true,  // Include both user and assistant messages
      };

      // Act
      const result = await cloneSessionV2(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.stats.compression).toBeDefined();

      // First 50% of 6 turns = turns 0, 1, 2 (positions 0%, 16.67%, 33.33%)
      // Turn 0: 100 + 200 = 300 tokens
      // Turn 1: 150 + 250 = 400 tokens
      // Turn 2: 100 + 200 = 300 tokens
      // Total in band: 1000 tokens (6 messages)
      expect(result.stats.compression?.originalTokens).toBe(1000);

      // Mock returns floor(chars*0.35) then ceil(chars/4) for tokens
      // Due to rounding of ceil on individual messages:
      // 100 tok (400c) -> 140c -> 35t, 200 tok (800c) -> 280c -> 70t
      // 150 tok (600c) -> 210c -> 53t, 250 tok (1000c) -> 350c -> 88t
      // 100 tok -> 35t, 200 tok -> 70t
      // Total: 35+70+53+88+35+70 = 351 tokens
      expect(result.stats.compression?.compressedTokens).toBe(351);

      // Tokens removed: 1000 - 351 = 649
      expect(result.stats.compression?.tokensRemoved).toBe(649);

      // Reduction percent: 649 / 1000 * 100 = 65% (rounded)
      expect(result.stats.compression?.reductionPercent).toBe(65);

      // 6 messages compressed (3 user + 3 assistant in turns 0, 1, 2)
      expect(result.stats.compression?.messagesCompressed).toBe(6);
    });
  });

  describe("TC-12: Combined with Tool Removal", () => {
    it("applies both compression and tool removal", async () => {
      // Arrange
      const fixtureWithTools = createFixtureWithToolCalls();
      vi.mocked(readFile).mockResolvedValue(fixtureWithTools);

      const request: CloneRequestV2 = {
        sessionId: "test-session-tool-calls",
        toolRemoval: "50",
        thinkingRemoval: "none",
        compressionBands: [{ start: 0, end: 100, level: "compress" }],
      };

      // Act
      const result = await cloneSessionV2(request);

      // Assert
      expect(result.success).toBe(true);

      // 50% tool removal on 4 turns = 2 turns affected (turns 0, 1)
      // Each affected turn has 1 tool_use block
      expect(result.stats.toolCallsRemoved).toBe(2);

      // Compression should still occur
      expect(result.stats.compression).toBeDefined();
      expect(result.stats.compression?.messagesCompressed).toBeGreaterThan(0);

      // Verify file was written
      expect(writeFile).toHaveBeenCalled();

      // Check output content
      const writtenContent = vi.mocked(writeFile).mock.calls[0]?.[1] as string;
      expect(writtenContent).toBeDefined();

      // Verify no tool_use blocks in output (after 50% removal)
      // Note: tool removal happens before compression
      const lines = writtenContent
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));

      // Count remaining tool_use blocks
      let toolUseCount = 0;
      for (const line of lines) {
        if (line.type === "assistant" && Array.isArray(line.message?.content)) {
          toolUseCount += line.message.content.filter(
            (b: { type: string }) => b.type === "tool_use"
          ).length;
        }
      }

      // With 50% removal, first 2 turns (50% of 4) have tool_use removed
      // Turns 2, 3 have no tool calls, so 0 tool_use should remain
      // Actually turns 0, 1 had tool calls which are removed
      // Result: 0 tool_use blocks remaining
      expect(toolUseCount).toBe(0);
    });
  });

  describe("V1 Endpoint Preservation", () => {
    it("v1 endpoint unchanged after v2 implementation", async () => {
      // Arrange
      const fixtureContent = createMinimalFixture();
      vi.mocked(readFile).mockResolvedValue(fixtureContent);

      const requestV1: CloneRequest = {
        sessionId: "minimal-test-session",
        toolRemoval: "none",
        thinkingRemoval: "none",
      };

      // Act - call v1 endpoint
      const result = await cloneSession(requestV1);

      // Assert
      expect(result.success).toBe(true);
      expect(result.stats.originalTurnCount).toBeGreaterThanOrEqual(0);
      expect(result.stats.outputTurnCount).toBeGreaterThanOrEqual(0);
      expect(result.stats.toolCallsRemoved).toBe(0);
      expect(result.stats.thinkingBlocksRemoved).toBe(0);

      // V1 response should NOT have compression field
      // TypeScript should ensure this at compile time (CloneResponse vs CloneResponseV2)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyResult = result as any;
      expect(anyResult.stats.compression).toBeUndefined();

      // Verify file was written
      expect(writeFile).toHaveBeenCalled();

      // Verify lineage was logged
      expect(appendFile).toHaveBeenCalled();
    });
  });

  describe("Lineage Log Format", () => {
    it("logs compression info to lineage file", async () => {
      // Arrange
      const fixtureContent = createFixtureWith6Turns();
      vi.mocked(readFile).mockResolvedValue(fixtureContent);

      const request: CloneRequestV2 = {
        sessionId: "test-session-id",
        toolRemoval: "none",
        thinkingRemoval: "none",
        compressionBands: [{ start: 0, end: 50, level: "compress" }],
      };

      // Act
      await cloneSessionV2(request);

      // Assert
      expect(appendFile).toHaveBeenCalled();
      const loggedContent = vi.mocked(appendFile).mock.calls[0]?.[1] as string;

      // Verify lineage format includes compression info
      expect(loggedContent).toContain("TARGET:");
      expect(loggedContent).toContain("SOURCE:");
      expect(loggedContent).toContain("OPTIONS:");
      expect(loggedContent).toContain("COMPRESSION:");
      expect(loggedContent).toContain("[0-50: compress]");
      expect(loggedContent).toContain("result:");
      expect(loggedContent).toContain("tokens:");
      expect(loggedContent).toContain("reduction");
    });

    it("logs multiple compression bands correctly", async () => {
      // Arrange
      const fixtureContent = createFixtureWith6Turns();
      vi.mocked(readFile).mockResolvedValue(fixtureContent);

      const request: CloneRequestV2 = {
        sessionId: "test-session-id",
        toolRemoval: "none",
        thinkingRemoval: "none",
        compressionBands: [
          { start: 0, end: 30, level: "heavy-compress" },
          { start: 30, end: 60, level: "compress" },
        ],
      };

      // Act
      await cloneSessionV2(request);

      // Assert
      expect(appendFile).toHaveBeenCalled();
      const loggedContent = vi.mocked(appendFile).mock.calls[0]?.[1] as string;

      expect(loggedContent).toContain("0-30: heavy-compress");
      expect(loggedContent).toContain("30-60: compress");
    });
  });

  describe("Edge Cases", () => {
    it("handles empty compression bands (no compression)", async () => {
      // Arrange
      const fixtureContent = createFixtureWith6Turns();
      vi.mocked(readFile).mockResolvedValue(fixtureContent);

      const request: CloneRequestV2 = {
        sessionId: "test-session-id",
        toolRemoval: "none",
        thinkingRemoval: "none",
        compressionBands: [],
      };

      // Act
      const result = await cloneSessionV2(request);

      // Assert
      expect(result.success).toBe(true);
      // With no compression bands, compression should not be applied
      expect(result.stats.compression).toBeUndefined();
    });

    it("handles undefined compression bands (v2 request without compression)", async () => {
      // Arrange
      const fixtureContent = createFixtureWith6Turns();
      vi.mocked(readFile).mockResolvedValue(fixtureContent);

      const request: CloneRequestV2 = {
        sessionId: "test-session-id",
        toolRemoval: "none",
        thinkingRemoval: "none",
        // compressionBands not specified
      };

      // Act
      const result = await cloneSessionV2(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.stats.compression).toBeUndefined();
    });

    it("outputs correct turn count after compression", async () => {
      // Arrange
      const fixtureContent = createFixtureWith6Turns();
      vi.mocked(readFile).mockResolvedValue(fixtureContent);

      const request: CloneRequestV2 = {
        sessionId: "test-session-id",
        toolRemoval: "none",
        thinkingRemoval: "none",
        compressionBands: [{ start: 0, end: 100, level: "compress" }],
      };

      // Act
      const result = await cloneSessionV2(request);

      // Assert
      expect(result.success).toBe(true);
      // Compression should not change turn count (just reduces content size)
      expect(result.stats.originalTurnCount).toBe(6);
      expect(result.stats.outputTurnCount).toBe(6);
    });
  });
});
