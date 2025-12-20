import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import type { Server } from "http";
import { app } from "../src/server.js";

describe("Copilot API Routes", () => {
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

  describe("GET /api/copilot/projects", () => {
    it("returns project list with 200 status", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/projects`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("projects");
      expect(Array.isArray(data.projects)).toBe(true);
      // abc123..., xyz987..., and emptysessions999 have valid workspace.json + chatSessions
      expect(data.projects.length).toBe(3);
    });

    it("returns projects with folder and path properties", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/projects`);
      const data = await response.json();

      expect(data.projects[0]).toHaveProperty("folder");
      expect(data.projects[0]).toHaveProperty("path");
    });

    it("returns 503 when source unavailable", async () => {
      const originalPath = process.env.VSCODE_STORAGE_PATH;
      process.env.VSCODE_STORAGE_PATH = "/nonexistent/path";

      const response = await fetch(`${baseUrl}/api/copilot/projects`);
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.error.code).toBe("SOURCE_UNAVAILABLE");

      process.env.VSCODE_STORAGE_PATH = originalPath;
    });
  });

  describe("GET /api/copilot/projects/:hash/sessions", () => {
    it("returns sessions for valid workspace", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/projects/abc123def456ghi789/sessions`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("folder", "abc123def456ghi789");
      expect(data).toHaveProperty("path", "/Users/test/projectalpha");
      expect(data).toHaveProperty("sessions");
      // 4 files: 2 valid + 1 empty-requests + 1 malformed = 3 returned
      expect(data.sessions.length).toBe(3);
    });

    it("returns sessions with correct properties", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/projects/abc123def456ghi789/sessions`);
      const data = await response.json();
      const session = data.sessions[0];

      expect(session).toHaveProperty("sessionId");
      expect(session).toHaveProperty("source", "copilot");
      expect(session).toHaveProperty("firstMessage");
      expect(session).toHaveProperty("turnCount");
    });

    it("returns 404 for non-existent workspace", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/projects/nonexistent-hash/sessions`);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error.code).toBe("NOT_FOUND");
    });

    it("returns 400 for path traversal attempt with double dots", async () => {
      // URL encode ".." to ensure it reaches the route handler
      const response = await fetch(`${baseUrl}/api/copilot/projects/${encodeURIComponent("../etc/passwd")}/sessions`);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.code).toBe("INVALID_INPUT");
      expect(data.error.message).toContain("path traversal");
    });

    it("returns 400 for path traversal attempt with slash", async () => {
      // URL encode "/" to ensure it reaches the route handler
      const response = await fetch(`${baseUrl}/api/copilot/projects/${encodeURIComponent("abc/def")}/sessions`);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.code).toBe("INVALID_INPUT");
      expect(data.error.message).toContain("path traversal");
    });

    it("returns empty sessions array for workspace with empty chatSessions folder", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/projects/emptysessions999/sessions`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.folder).toBe("emptysessions999");
      expect(data.sessions).toEqual([]);
    });
  });
});
