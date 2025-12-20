import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { app } from "../src/server.js";

// AC-34: Session detail page renders Copilot sessions with same UI as Claude sessions
describe("Copilot Visualization Routes", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;
  const fixturesPath = path.join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = fixturesPath;
    server = app.listen(0);
    const address = server.address();
    if (address && typeof address !== "string") {
      baseUrl = `http://127.0.0.1:${address.port}`;
    } else {
      throw new Error("Failed to start test server");
    }
  });

  afterAll(async () => {
    delete process.env.VSCODE_STORAGE_PATH;
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });

  // AC-34: Session detail page renders Copilot sessions
  describe("GET /api/copilot/session/:sessionId/structure", () => {
    it("returns session structure", async () => {
      const response = await fetch(
        `${baseUrl}/api/copilot/session/11111111-1111-1111-1111-111111111111/structure?workspace=abc123def456ghi789`
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.sessionId).toBe("11111111-1111-1111-1111-111111111111");
      expect(data.source).toBe("copilot");
      expect(data.turnCount).toBe(2);
      expect(data.totalTokens).toBeGreaterThan(0);
    });

    it("returns 404 for non-existent session", async () => {
      const response = await fetch(
        `${baseUrl}/api/copilot/session/nonexistent/structure?workspace=abc123def456ghi789`
      );
      expect(response.status).toBe(404);
    });
  });

  // AC-35: Turn-based view shows user prompts and assistant responses
  // AC-36: Token bars display estimated tokens per turn
  // AC-37: Cumulative token tracking works across turns
  describe("GET /api/copilot/session/:sessionId/turns", () => {
    it("returns turns with cumulative tokens including all four buckets", async () => {
      const response = await fetch(
        `${baseUrl}/api/copilot/session/11111111-1111-1111-1111-111111111111/turns?workspace=abc123def456ghi789`
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.sessionId).toBe("11111111-1111-1111-1111-111111111111");
      expect(data.totalTurns).toBe(2);
      expect(data.turns).toHaveLength(2);

      // Verify all four token buckets for D3 visualization
      const turn = data.turns[0];
      expect(turn.cumulative).toHaveProperty("user");
      expect(turn.cumulative).toHaveProperty("assistant");
      expect(turn.cumulative).toHaveProperty("thinking");
      expect(turn.cumulative).toHaveProperty("tool");
      expect(turn.cumulative).toHaveProperty("total");
      expect(turn.cumulative.thinking).toBe(0); // Copilot doesn't have thinking
    });
  });

  // AC-38: Playback controls work identically to Claude
  describe("GET /api/copilot/session/:sessionId/turn/:turnIndex", () => {
    it("returns specific turn", async () => {
      const response = await fetch(
        `${baseUrl}/api/copilot/session/11111111-1111-1111-1111-111111111111/turn/0?workspace=abc123def456ghi789`
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.turnIndex).toBe(0);
      expect(data.content.userPrompt).toContain("refactor");
    });

    it("returns 404 for invalid turn index", async () => {
      const response = await fetch(
        `${baseUrl}/api/copilot/session/11111111-1111-1111-1111-111111111111/turn/999?workspace=abc123def456ghi789`
      );
      expect(response.status).toBe(404);
    });
  });
});
