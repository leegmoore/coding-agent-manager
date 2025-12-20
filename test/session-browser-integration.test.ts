import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { app } from "../src/server.js";

describe("Session Browser Integration", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(() => {
    process.env.CLAUDE_DIR = path.join(
      process.cwd(),
      "test/fixtures/session-browser"
    );
    server = app.listen(0);
    const address = server.address();
    if (address && typeof address !== "string") {
      baseUrl = `http://127.0.0.1:${address.port}`;
    } else {
      throw new Error("Failed to start test server");
    }
  });

  afterAll(async () => {
    delete process.env.CLAUDE_DIR;
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });

  describe("GET /", () => {
    it("renders session browser page", async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Session Browser");
      expect(text).toContain("project-select");
    });
  });

  describe("GET /session-clone", () => {
    it("renders clone page", async () => {
      const res = await fetch(`${baseUrl}/session-clone`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Session Cloner");
      expect(text).toContain("Back to Session Browser");
    });

    it("accepts sessionId query param", async () => {
      const res = await fetch(`${baseUrl}/session-clone?sessionId=test-123`);
      expect(res.status).toBe(200);
    });
  });

  describe("GET /session-detail", () => {
    it("renders session detail page", async () => {
      const res = await fetch(`${baseUrl}/session-detail`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Session Detail");
      expect(text).toContain("Back to Session Browser");
    });

    it("accepts id query param", async () => {
      const res = await fetch(`${baseUrl}/session-detail?id=test-123`);
      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/projects", () => {
    it("returns list of projects", async () => {
      const res = await fetch(`${baseUrl}/api/projects`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("projects");
      expect(Array.isArray(data.projects)).toBe(true);
    });

    it("projects have folder and path properties", async () => {
      const res = await fetch(`${baseUrl}/api/projects`);
      expect(res.status).toBe(200);
      const data = await res.json();

      if (data.projects.length > 0) {
        const project = data.projects[0];
        expect(project).toHaveProperty("folder");
        expect(project).toHaveProperty("path");
      }
    });
  });

  describe("GET /api/projects/:folder/sessions", () => {
    it("returns sessions for valid project", async () => {
      const projectsRes = await fetch(`${baseUrl}/api/projects`);
      const projectsData = await projectsRes.json();
      if (projectsData.projects.length === 0) {
        return; // Skip if no projects in fixtures
      }

      const folder = projectsData.projects[0].folder;
      const res = await fetch(
        `${baseUrl}/api/projects/${encodeURIComponent(folder)}/sessions`
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("sessions");
      expect(Array.isArray(data.sessions)).toBe(true);
    });

    it("sessions have required properties", async () => {
      const projectsRes = await fetch(`${baseUrl}/api/projects`);
      const projectsData = await projectsRes.json();
      if (projectsData.projects.length === 0) return;

      const folder = projectsData.projects[0].folder;
      const res = await fetch(
        `${baseUrl}/api/projects/${encodeURIComponent(folder)}/sessions`
      );
      const data = await res.json();

      if (data.sessions.length > 0) {
        const session = data.sessions[0];
        expect(session).toHaveProperty("sessionId");
        expect(session).toHaveProperty("source");
        expect(session).toHaveProperty("firstMessage");
        expect(session).toHaveProperty("createdAt");
        expect(session).toHaveProperty("lastModifiedAt");
        expect(session).toHaveProperty("sizeBytes");
        expect(session).toHaveProperty("turnCount");
      }
    });

    it("returns 404 for non-existent folder", async () => {
      const res = await fetch(
        `${baseUrl}/api/projects/nonexistent-folder/sessions`
      );
      expect(res.status).toBe(404);
    });

    it("sessions are sorted by lastModifiedAt descending", async () => {
      const projectsRes = await fetch(`${baseUrl}/api/projects`);
      const projectsData = await projectsRes.json();
      if (projectsData.projects.length === 0) return;

      const folder = projectsData.projects[0].folder;
      const res = await fetch(
        `${baseUrl}/api/projects/${encodeURIComponent(folder)}/sessions`
      );
      const data = await res.json();

      const sessions = data.sessions;
      for (let i = 1; i < sessions.length; i++) {
        const prev = new Date(sessions[i - 1].lastModifiedAt).getTime();
        const curr = new Date(sessions[i].lastModifiedAt).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });
  });

  describe("Navigation Flow", () => {
    it("complete flow: browse → select project → view sessions", async () => {
      // 1. Load browser page
      const browserRes = await fetch(`${baseUrl}/`);
      expect(browserRes.status).toBe(200);

      // 2. Get projects
      const projectsRes = await fetch(`${baseUrl}/api/projects`);
      expect(projectsRes.status).toBe(200);
      const projectsData = await projectsRes.json();

      if (projectsData.projects.length === 0) return;

      // 3. Get sessions for first project
      const folder = projectsData.projects[0].folder;
      const sessionsRes = await fetch(
        `${baseUrl}/api/projects/${encodeURIComponent(folder)}/sessions`
      );
      expect(sessionsRes.status).toBe(200);
    });

    it("clone page accepts sessionId from session browser", async () => {
      // 1. Get a session ID from a project
      const projectsRes = await fetch(`${baseUrl}/api/projects`);
      const projectsData = await projectsRes.json();
      if (projectsData.projects.length === 0) return;

      const folder = projectsData.projects[0].folder;
      const sessionsRes = await fetch(
        `${baseUrl}/api/projects/${encodeURIComponent(folder)}/sessions`
      );
      const sessionsData = await sessionsRes.json();

      if (sessionsData.sessions.length === 0) return;

      const sessionId = sessionsData.sessions[0].sessionId;

      // 2. Navigate to clone page with sessionId
      const cloneRes = await fetch(
        `${baseUrl}/session-clone?sessionId=${sessionId}`
      );
      expect(cloneRes.status).toBe(200);
      const cloneHtml = await cloneRes.text();
      expect(cloneHtml).toContain("Session Cloner");
    });

    it("session detail page accepts id from session browser", async () => {
      // 1. Get a session ID from a project
      const projectsRes = await fetch(`${baseUrl}/api/projects`);
      const projectsData = await projectsRes.json();
      if (projectsData.projects.length === 0) return;

      const folder = projectsData.projects[0].folder;
      const sessionsRes = await fetch(
        `${baseUrl}/api/projects/${encodeURIComponent(folder)}/sessions`
      );
      const sessionsData = await sessionsRes.json();

      if (sessionsData.sessions.length === 0) return;

      const sessionId = sessionsData.sessions[0].sessionId;

      // 2. Navigate to session detail page with id
      const detailRes = await fetch(
        `${baseUrl}/session-detail?id=${sessionId}`
      );
      expect(detailRes.status).toBe(200);
      const detailHtml = await detailRes.text();
      expect(detailHtml).toContain("Session Detail");
    });
  });
});
