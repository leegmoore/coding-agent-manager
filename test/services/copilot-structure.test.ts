import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { CopilotStructureService } from "../../src/services/copilot-structure.js";

describe("CopilotStructureService", () => {
  let service: CopilotStructureService;
  const fixturesPath = path.join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = fixturesPath;
    service = new CopilotStructureService();
  });

  afterAll(() => {
    delete process.env.VSCODE_STORAGE_PATH;
  });

  // AC-34: Session detail page renders Copilot sessions with same UI as Claude sessions
  describe("getStructure", () => {
    it("returns session structure metadata", async () => {
      const structure = await service.getStructure(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789"
      );

      expect(structure.sessionId).toBe("11111111-1111-1111-1111-111111111111");
      expect(structure.source).toBe("copilot");
      expect(structure.turnCount).toBe(2);
    });

    it("includes title from customTitle", async () => {
      const structure = await service.getStructure(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789"
      );

      expect(structure.title).toBe("Test Session Alpha-1");
    });

    // AC-30: All token displays use estimateTokens function
    it("calculates total tokens", async () => {
      const structure = await service.getStructure(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789"
      );

      expect(structure.totalTokens).toBeGreaterThan(0);
    });

    it("includes timestamps", async () => {
      const structure = await service.getStructure(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789"
      );

      expect(structure.createdAt).toBeGreaterThan(0);
      expect(structure.lastModifiedAt).toBeGreaterThan(0);
    });

    it("throws for non-existent session", async () => {
      await expect(
        service.getStructure("nonexistent", "abc123def456ghi789")
      ).rejects.toThrow();
    });
  });

  // AC-35: Turn-based view shows user prompts and assistant responses
  // AC-36: Token bars display estimated tokens per turn
  // AC-37: Cumulative token tracking works across turns
  describe("getTurns", () => {
    it("returns turns response with metadata", async () => {
      const response = await service.getTurns(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789"
      );

      expect(response.sessionId).toBe("11111111-1111-1111-1111-111111111111");
      expect(response.source).toBe("copilot");
      expect(response.totalTurns).toBe(2);
      expect(response.turns).toHaveLength(2);
    });

    // AC-36: Token bars display estimated tokens per turn
    // AC-37: Cumulative token tracking works across turns
    it("returns turns with cumulative token counts including all buckets", async () => {
      const response = await service.getTurns(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789"
      );

      const turn = response.turns[0];
      expect(turn).toHaveProperty("turnIndex", 0);
      expect(turn).toHaveProperty("cumulative");
      // All four buckets must be present for D3 visualization
      expect(turn.cumulative).toHaveProperty("user");
      expect(turn.cumulative).toHaveProperty("assistant");
      expect(turn.cumulative).toHaveProperty("thinking");
      expect(turn.cumulative).toHaveProperty("tool");
      expect(turn.cumulative).toHaveProperty("total");
      // Copilot doesn't have thinking, should be 0
      expect(turn.cumulative.thinking).toBe(0);
    });

    // AC-35: Turn-based view shows user prompts and assistant responses
    // Content format matches Claude's TurnContent for frontend compatibility
    it("returns turns with content", async () => {
      const response = await service.getTurns(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789"
      );

      const turn = response.turns[0];
      expect(turn.content).toHaveProperty("userPrompt");
      expect(turn.content).toHaveProperty("assistantResponse");
      // Uses toolBlocks/toolResults (matching Claude format) instead of toolCalls
      expect(turn.content).toHaveProperty("toolBlocks");
      expect(turn.content.userPrompt).toContain("refactor");
    });

    // AC-37: Cumulative token tracking works across turns
    it("calculates cumulative tokens across turns", async () => {
      const response = await service.getTurns(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789"
      );

      if (response.turns.length >= 2) {
        const turn1Total = response.turns[0].cumulative.total;
        const turn2Total = response.turns[1].cumulative.total;
        expect(turn2Total).toBeGreaterThanOrEqual(turn1Total);
      }
    });

    it("excludes canceled turns from count", async () => {
      const response = await service.getTurns(
        "33333333-3333-3333-3333-333333333333",
        "xyz987uvw654rst321"
      );

      // Session has 3 requests, 1 canceled = 2 turns
      expect(response.totalTurns).toBe(2);
      expect(response.turns).toHaveLength(2);
    });

    // AC-36: Token bars display estimated tokens per turn
    // Content uses toolBlocks format (matching Claude) for frontend compatibility
    it("extracts tool tokens from toolInvocationSerialized response items", async () => {
      // Fixture 66666666-6666-6666-6666-666666666666 has toolInvocationSerialized items
      const response = await service.getTurns(
        "66666666-6666-6666-6666-666666666666",
        "xyz987uvw654rst321"
      );

      expect(response.turns.length).toBeGreaterThan(0);

      // First turn has a tool invocation (run_in_terminal)
      const turn = response.turns[0];
      expect(turn.cumulative.tool).toBeGreaterThan(0);

      // Verify tool blocks are extracted (matching Claude's format)
      expect(turn.content.toolBlocks.length).toBeGreaterThan(0);
      expect(turn.content.toolBlocks[0].name).toBe("run_in_terminal");
    });
  });

  // AC-38: Playback controls (previous/next turn) work identically to Claude
  describe("getTurn", () => {
    it("returns specific turn by index", async () => {
      const turn = await service.getTurn(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        0
      );

      expect(turn).not.toBeNull();
      expect(turn!.turnIndex).toBe(0);
    });

    it("returns second turn", async () => {
      const turn = await service.getTurn(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        1
      );

      expect(turn).not.toBeNull();
      expect(turn!.turnIndex).toBe(1);
    });

    it("returns null for invalid index", async () => {
      const turn = await service.getTurn(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        999
      );

      expect(turn).toBeNull();
    });

    it("returns null for negative index", async () => {
      const turn = await service.getTurn(
        "11111111-1111-1111-1111-111111111111",
        "abc123def456ghi789",
        -1
      );

      expect(turn).toBeNull();
    });
  });
});
