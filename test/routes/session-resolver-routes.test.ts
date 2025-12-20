import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import type { Server } from "http";
import { app } from "../../src/server.js";

describe("Session Resolver Routes", () => {
  let server: Server;
  let baseUrl: string;
  const copilotFixtures = path.join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");
  const claudeFixtures = path.join(process.cwd(), "test/fixtures/session-browser");

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = copilotFixtures;
    process.env.CLAUDE_DIR = claudeFixtures;
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
    delete process.env.CLAUDE_DIR;
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });

  describe("GET /api/resolve-session", () => {
    // AC-21/AC-23: Session resolution API - resolves session to source
    it("resolves session found in Claude to source and location", async () => {
      const response = await fetch(`${baseUrl}/api/resolve-session?sessionId=11111111-1111-1111-1111-111111111111`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.sessionId).toBe("11111111-1111-1111-1111-111111111111");
      expect(data.source).toBe("claude");
      expect(data.location).toBeDefined();
    });

    it("validates required sessionId query param", async () => {
      const response = await fetch(`${baseUrl}/api/resolve-session`);

      expect(response.status).toBe(400);
    });

    it("validates empty sessionId", async () => {
      const response = await fetch(`${baseUrl}/api/resolve-session?sessionId=`);

      expect(response.status).toBe(400);
    });
  });
});
