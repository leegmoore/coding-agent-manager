import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import {
  ClaudeSessionSource,
  decodeFolderName,
  encodeFolderPath,
  truncateMessage,
} from "../src/sources/claude-source.js";
import { app } from "../src/server.js";

describe("Session Browser", () => {
  describe("Utility Functions", () => {
    describe("decodeFolderName", () => {
      it("decodes simple path", () => {
        expect(decodeFolderName("-Users-lee-code")).toBe("/Users/lee/code");
      });

      it("decodes nested path", () => {
        expect(decodeFolderName("-home-dev-projects-myapp")).toBe(
          "/home/dev/projects/myapp"
        );
      });

      it("handles single segment", () => {
        expect(decodeFolderName("-tmp")).toBe("/tmp");
      });
    });

    describe("encodeFolderPath", () => {
      it("encodes simple path", () => {
        expect(encodeFolderPath("/Users/lee/code")).toBe("-Users-lee-code");
      });

      it("encodes path with trailing slash", () => {
        expect(encodeFolderPath("/Users/lee/code/")).toBe("-Users-lee-code-");
      });
    });

    describe("truncateMessage", () => {
      it("returns short messages unchanged", () => {
        expect(truncateMessage("short message", 100)).toBe("short message");
      });

      it("truncates long messages with ellipsis", () => {
        const long = "a".repeat(150);
        expect(truncateMessage(long, 100)).toBe("a".repeat(97) + "...");
      });

      it("trims whitespace", () => {
        expect(truncateMessage("  spaces  ", 100)).toBe("spaces");
      });

      it("normalizes internal whitespace", () => {
        expect(truncateMessage("hello    world", 100)).toBe("hello world");
      });

      it("handles exact length", () => {
        const exact = "a".repeat(100);
        expect(truncateMessage(exact, 100)).toBe(exact);
      });
    });
  });

  describe("ClaudeSessionSource", () => {
    let source: ClaudeSessionSource;

    beforeAll(() => {
      process.env.CLAUDE_DIR = path.join(
        process.cwd(),
        "test/fixtures/session-browser"
      );
      source = new ClaudeSessionSource();
    });

    afterAll(() => {
      delete process.env.CLAUDE_DIR;
    });

    describe("isAvailable", () => {
      it("returns true when projects directory exists", async () => {
        expect(await source.isAvailable()).toBe(true);
      });

      it("returns false when projects directory does not exist", async () => {
        const originalDir = process.env.CLAUDE_DIR;
        process.env.CLAUDE_DIR = "/nonexistent/path/that/does/not/exist";
        const isolatedSource = new ClaudeSessionSource();
        expect(await isolatedSource.isAvailable()).toBe(false);
        process.env.CLAUDE_DIR = originalDir;
      });
    });

    describe("listProjects", () => {
      it("returns list of project folders", async () => {
        const projects = await source.listProjects();
        // 4 projects: projectalpha, projectbeta, emptyproject, edgecases
        expect(projects).toHaveLength(4);
      });

      it("includes folder and path properties", async () => {
        const projects = await source.listProjects();
        expect(projects[0]).toHaveProperty("folder");
        expect(projects[0]).toHaveProperty("path");
      });

      it("decodes folder names to paths", async () => {
        const projects = await source.listProjects();
        const alpha = projects.find(
          (p) => p.folder === "-Users-test-projectalpha"
        );
        expect(alpha?.path).toBe("/Users/test/projectalpha");
      });

      it("sorts projects alphabetically by path", async () => {
        const projects = await source.listProjects();
        const paths = projects.map((p) => p.path);
        expect(paths).toEqual([...paths].sort());
      });
    });

    describe("listSessions", () => {
      it("returns sessions for valid project", async () => {
        const sessions = await source.listSessions("-Users-test-projectalpha");
        expect(sessions).toHaveLength(2);
      });

      it("includes required session properties", async () => {
        const sessions = await source.listSessions("-Users-test-projectalpha");
        const session = sessions[0];

        expect(session).toHaveProperty("sessionId");
        expect(session).toHaveProperty("source", "claude");
        expect(session).toHaveProperty("projectPath");
        expect(session).toHaveProperty("firstMessage");
        expect(session).toHaveProperty("createdAt");
        expect(session).toHaveProperty("lastModifiedAt");
        expect(session).toHaveProperty("sizeBytes");
        expect(session).toHaveProperty("turnCount");
      });

      it("extracts first user message", async () => {
        const sessions = await source.listSessions("-Users-test-projectalpha");
        const session = sessions.find(
          (s) => s.sessionId === "11111111-1111-1111-1111-111111111111"
        );
        expect(session?.firstMessage).toContain("refactor");
      });

      it("counts turns correctly", async () => {
        const sessions = await source.listSessions("-Users-test-projectbeta");
        const session = sessions.find(
          (s) => s.sessionId === "33333333-3333-3333-3333-333333333333"
        );
        expect(session?.turnCount).toBe(3); // 3 human messages = 3 turns
      });

      it("sorts sessions by lastModifiedAt descending", async () => {
        const sessions = await source.listSessions("-Users-test-projectalpha");
        if (sessions.length >= 2) {
          expect(sessions[0].lastModifiedAt.getTime()).toBeGreaterThanOrEqual(
            sessions[1].lastModifiedAt.getTime()
          );
        }
      });

      it("throws ENOENT for non-existent folder", async () => {
        await expect(
          source.listSessions("-nonexistent-folder")
        ).rejects.toThrow();
      });

      it("throws on path traversal attempt", async () => {
        await expect(
          source.listSessions("../-Users-test-projectalpha")
        ).rejects.toThrow(/Invalid folder name/);
      });
    });

    describe("Edge Cases", () => {
      it("returns empty array for empty project folder", async () => {
        const sessions = await source.listSessions("-Users-test-emptyproject");
        expect(sessions).toEqual([]);
      });

      it("handles session with no user messages", async () => {
        const sessions = await source.listSessions("-Users-test-edgecases");
        const noUserSession = sessions.find(
          (s) => s.sessionId === "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        );
        expect(noUserSession).toBeDefined();
        expect(noUserSession?.firstMessage).toBe("(No user message)");
        expect(noUserSession?.turnCount).toBe(0);
      });

      it("handles malformed JSONL lines gracefully", async () => {
        const sessions = await source.listSessions("-Users-test-edgecases");
        const malformedSession = sessions.find(
          (s) => s.sessionId === "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
        );
        expect(malformedSession).toBeDefined();
        // Should extract first valid user message
        expect(malformedSession?.firstMessage).toBe(
          "Valid message after malformed line"
        );
        // Should count 2 turns (2 valid user messages)
        expect(malformedSession?.turnCount).toBe(2);
      });

      it("truncates very long first message with ellipsis", async () => {
        const sessions = await source.listSessions("-Users-test-edgecases");
        const longSession = sessions.find(
          (s) => s.sessionId === "cccccccc-cccc-cccc-cccc-cccccccccccc"
        );
        expect(longSession).toBeDefined();
        expect(longSession?.firstMessage.length).toBe(100);
        expect(longSession?.firstMessage.endsWith("...")).toBe(true);
        expect(longSession?.firstMessage.startsWith("This is a very long")).toBe(
          true
        );
      });

      it("includes empty project in listProjects", async () => {
        const projects = await source.listProjects();
        const emptyProject = projects.find(
          (p) => p.folder === "-Users-test-emptyproject"
        );
        expect(emptyProject).toBeDefined();
        expect(emptyProject?.path).toBe("/Users/test/emptyproject");
      });
    });
  });

  describe("Router Integration", () => {
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

    describe("GET /api/projects", () => {
      it("returns project list with 200 status", async () => {
        const response = await fetch(`${baseUrl}/api/projects`);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty("projects");
        expect(Array.isArray(data.projects)).toBe(true);
      });

      it("returns projects with folder and path properties", async () => {
        const response = await fetch(`${baseUrl}/api/projects`);
        const data = await response.json();

        expect(data.projects.length).toBeGreaterThan(0);
        expect(data.projects[0]).toHaveProperty("folder");
        expect(data.projects[0]).toHaveProperty("path");
      });

      it("returns 503 when source unavailable", async () => {
        const originalDir = process.env.CLAUDE_DIR;
        process.env.CLAUDE_DIR = "/nonexistent/path";

        const response = await fetch(`${baseUrl}/api/projects`);
        expect(response.status).toBe(503);

        const data = await response.json();
        expect(data.error.code).toBe("SOURCE_UNAVAILABLE");

        process.env.CLAUDE_DIR = originalDir;
      });
    });

    describe("GET /api/projects/:folder/sessions", () => {
      it("returns sessions for valid project", async () => {
        const response = await fetch(
          `${baseUrl}/api/projects/-Users-test-projectalpha/sessions`
        );
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data).toHaveProperty("folder", "-Users-test-projectalpha");
        expect(data).toHaveProperty("path", "/Users/test/projectalpha");
        expect(data).toHaveProperty("sessions");
        expect(Array.isArray(data.sessions)).toBe(true);
      });

      it("returns 404 for non-existent project", async () => {
        const response = await fetch(
          `${baseUrl}/api/projects/-nonexistent-project/sessions`
        );
        expect(response.status).toBe(404);

        const data = await response.json();
        expect(data.error.code).toBe("NOT_FOUND");
      });

      it("returns 500 for path traversal attempt", async () => {
        const response = await fetch(
          `${baseUrl}/api/projects/..%2F-Users-test-projectalpha/sessions`
        );
        expect(response.status).toBe(500);
      });
    });

    describe("GET /api/copilot/projects", () => {
      it("returns 503 when VS Code storage path is invalid", async () => {
        // Set to nonexistent path to ensure 503 response
        const originalPath = process.env.VSCODE_STORAGE_PATH;
        process.env.VSCODE_STORAGE_PATH = "/nonexistent/path/that/definitely/does/not/exist";

        const response = await fetch(`${baseUrl}/api/copilot/projects`);
        expect(response.status).toBe(503);

        const data = await response.json();
        expect(data.error.code).toBe("SOURCE_UNAVAILABLE");

        if (originalPath) {
          process.env.VSCODE_STORAGE_PATH = originalPath;
        } else {
          delete process.env.VSCODE_STORAGE_PATH;
        }
      });
    });

    describe("GET /api/copilot/projects/:hash/sessions", () => {
      it("returns 404 for non-existent workspace", async () => {
        // Set to fixtures path so source is available
        const originalPath = process.env.VSCODE_STORAGE_PATH;
        process.env.VSCODE_STORAGE_PATH = path.join(
          process.cwd(),
          "test/fixtures/copilot-sessions/workspaceStorage"
        );

        const response = await fetch(
          `${baseUrl}/api/copilot/projects/nonexistent-hash/sessions`
        );
        expect(response.status).toBe(404);

        const data = await response.json();
        expect(data.error.code).toBe("NOT_FOUND");

        if (originalPath) {
          process.env.VSCODE_STORAGE_PATH = originalPath;
        } else {
          delete process.env.VSCODE_STORAGE_PATH;
        }
      });
    });
  });
});
