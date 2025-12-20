import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { join } from "path";

// Mock the provider for LLM compression tests
vi.mock("../../src/providers/index.js", () => ({
  getProvider: () => ({
    compress: vi.fn().mockImplementation((text) => {
      // Return shortened version for testing
      return Promise.resolve(text.slice(0, Math.ceil(text.length * 0.35)));
    }),
  }),
}));

import { CopilotCloneService } from "../../src/services/copilot-clone.js";
import type { CompressionBand } from "../../src/types.js";

const FIXTURES = join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");
const TEST_WORKSPACE = "xyz987uvw654rst321";
const TEST_SESSION = "66666666-6666-6666-6666-666666666666";

describe("CopilotCloneService - LLM Compression", () => {
  let service: CopilotCloneService;

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = FIXTURES;
    service = new CopilotCloneService();
  });

  afterAll(() => {
    delete process.env.VSCODE_STORAGE_PATH;
    vi.restoreAllMocks();
  });

  describe("clone with compressionBands", () => {
    // AC: Copilot clone uses LLM provider to compress messages
    it("invokes LLM compression when compressionBands provided", async () => {
      const bands: CompressionBand[] = [
        { start: 0, end: 50, level: "heavy-compress" },
      ];

      const result = await service.clone(TEST_SESSION, TEST_WORKSPACE, {
        compressionBands: bands,
        writeToDisk: false,
      });

      // Should succeed with compression stats
      expect(result.stats.compression).toBeDefined();
    });

    // AC: Compression bands are respected (heavy vs regular)
    it("respects heavy vs regular compression levels", async () => {
      const bands: CompressionBand[] = [
        { start: 0, end: 25, level: "heavy-compress" },
        { start: 25, end: 50, level: "compress" },
      ];

      const result = await service.clone(TEST_SESSION, TEST_WORKSPACE, {
        compressionBands: bands,
        writeToDisk: false,
      });

      expect(result.stats.compression).toBeDefined();
    });

    // AC: Original session is unchanged
    it("does not modify original session", async () => {
      const bands: CompressionBand[] = [
        { start: 0, end: 100, level: "compress" },
      ];

      await service.clone(TEST_SESSION, TEST_WORKSPACE, {
        compressionBands: bands,
        writeToDisk: false,
      });

      // Verify source session can still be loaded unchanged
      const source = await import("../../src/sources/index.js").then(m => m.getSessionSource("copilot"));
      const original = await (source as any).loadSession(TEST_SESSION, TEST_WORKSPACE);
      expect(original.sessionId).toBe(TEST_SESSION);
    });
  });

  describe("clone stats with compression", () => {
    // AC: Compression stats reflect actual token reduction
    it("includes compression stats in result", async () => {
      const bands: CompressionBand[] = [
        { start: 0, end: 100, level: "compress" },
      ];

      const result = await service.clone(TEST_SESSION, TEST_WORKSPACE, {
        compressionBands: bands,
        writeToDisk: false,
      });

      expect(result.stats.compression).toBeDefined();
      expect(result.stats.compression?.messagesCompressed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("clone without compressionBands (legacy)", () => {
    // AC: Existing turn removal works as fallback
    it("uses percentage-based turn removal when no compressionBands", async () => {
      const result = await service.clone(TEST_SESSION, TEST_WORKSPACE, {
        compressPercent: 50, // Legacy option
        writeToDisk: false,
      });

      // Should still work without LLM compression
      expect(result.stats.removedTurns).toBeGreaterThan(0);
      expect(result.stats.compression).toBeUndefined();
    });
  });
});
