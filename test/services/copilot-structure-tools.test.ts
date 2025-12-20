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
  // Content format uses toolBlocks/toolResults (matching Claude) for frontend compatibility
  describe("extractToolCallResults via getTurns", () => {
    it("extracts tool blocks from request metadata", async () => {
      const response = await service.getTurns(TEST_SESSION_ID, TEST_WORKSPACE);

      const turn = response.turns[0];
      expect(turn.content.toolBlocks.length).toBeGreaterThan(0);
    });

    it("includes tool result content in toolResults array", async () => {
      const response = await service.getTurns(TEST_SESSION_ID, TEST_WORKSPACE);

      const turn = response.turns[0];
      const terminalToolResult = turn.content.toolResults?.find(t => t.name === "run_in_terminal");

      expect(terminalToolResult).toBeDefined();
      expect(terminalToolResult?.content).toContain("PASS");
    });
  });

  describe("calculateToolResultTokens via getStructure", () => {
    it("includes tokens from tool call results", async () => {
      const structure = await service.getStructure(TEST_SESSION_ID, TEST_WORKSPACE);

      // Session with tool results should have token count > 0
      // The fixture has 2 turns with tool invocations and results
      expect(structure.totalTokens).toBeGreaterThan(50);
    });

    it("accounts for tool results in cumulative totals", async () => {
      const response = await service.getTurns(TEST_SESSION_ID, TEST_WORKSPACE);

      const turn = response.turns[0];
      expect(turn.cumulative.tool).toBeGreaterThan(0);
    });
  });

  // Content format uses toolBlocks (matching Claude) for frontend compatibility
  describe("getTurns with tool invocations", () => {
    it("includes tool block count matching response invocations", async () => {
      const response = await service.getTurns(TEST_SESSION_ID, TEST_WORKSPACE);

      const turn = response.turns[0];
      expect(turn.content.toolBlocks.length).toBe(1);

      const turn2 = response.turns[1];
      expect(turn2.content.toolBlocks.length).toBe(1);
    });
  });
});
