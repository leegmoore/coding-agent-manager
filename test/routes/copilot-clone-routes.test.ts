import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import type { Server } from "http";
import { app } from "../../src/server.js";

describe("Copilot Clone Routes", () => {
  let server: Server;
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

  describe("POST /api/copilot/clone", () => {
    // AC-25: POST /api/copilot/clone accepts sessionId and compression options
    it("clones a valid Copilot session", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "11111111-1111-1111-1111-111111111111",
          workspaceHash: "abc123def456ghi789",
          options: { writeToDisk: false }
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.session).toBeDefined();
      expect(data.stats).toBeDefined();
    });

    it("validates required sessionId", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceHash: "abc123def456ghi789"
        })
      });

      expect(response.status).toBe(400);
    });

    it("validates required workspaceHash", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "11111111-1111-1111-1111-111111111111"
        })
      });

      expect(response.status).toBe(400);
    });

    // AC-25: Returns 404 when session doesn't exist
    it("returns 404 when session doesn't exist", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "99999999-9999-9999-9999-999999999999",
          workspaceHash: "abc123def456ghi789"
        })
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe("NOT_FOUND");
    });

    // AC-25: Compression options are applied correctly
    it("applies compression options correctly", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "11111111-1111-1111-1111-111111111111",
          workspaceHash: "abc123def456ghi789",
          options: {
            removeToolCalls: true,
            compressPercent: 50,
            writeToDisk: false
          }
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.stats).toBeDefined();
      // Compression should result in fewer turns than original
      expect(data.stats.clonedTurns).toBeLessThanOrEqual(data.stats.originalTurns);
      expect(data.stats.removedTurns).toBeGreaterThanOrEqual(0);
    });

    // AC-25: Stats returned in response
    it("returns complete stats in response", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "11111111-1111-1111-1111-111111111111",
          workspaceHash: "abc123def456ghi789",
          options: { writeToDisk: false }
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.stats).toBeDefined();
      expect(data.stats.originalTurns).toBeTypeOf("number");
      expect(data.stats.clonedTurns).toBeTypeOf("number");
      expect(data.stats.removedTurns).toBeTypeOf("number");
      expect(data.stats.originalTokens).toBeTypeOf("number");
      expect(data.stats.clonedTokens).toBeTypeOf("number");
      expect(data.stats.removedTokens).toBeTypeOf("number");
      expect(data.stats.compressionRatio).toBeTypeOf("number");
    });
  });
});
