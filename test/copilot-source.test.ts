import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import {
  CopilotSessionSource,
  getVSCodeStoragePath,
  extractPathFromUri,
  countTurns,
  extractFirstMessage,
} from "../src/sources/copilot-source.js";
import type { CopilotSession } from "../src/sources/copilot-types.js";

describe("Copilot Session Source", () => {
  describe("Utility Functions", () => {
    describe("getVSCodeStoragePath", () => {
      it("returns platform-appropriate path", () => {
        const storagePath = getVSCodeStoragePath();
        expect(typeof storagePath).toBe("string");
        expect(storagePath.length).toBeGreaterThan(0);
      });

      it("returns VSCODE_STORAGE_PATH env var when set", () => {
        const originalPath = process.env.VSCODE_STORAGE_PATH;
        const customPath = "/custom/vscode/storage/path";
        process.env.VSCODE_STORAGE_PATH = customPath;

        try {
          const storagePath = getVSCodeStoragePath();
          expect(storagePath).toBe(customPath);
        } finally {
          // Restore original value
          if (originalPath !== undefined) {
            process.env.VSCODE_STORAGE_PATH = originalPath;
          } else {
            delete process.env.VSCODE_STORAGE_PATH;
          }
        }
      });
    });

    describe("extractPathFromUri", () => {
      it("extracts path from file URI", () => {
        expect(extractPathFromUri("file:///Users/dev/project")).toBe("/Users/dev/project");
      });

      it("handles URI with spaces (encoded)", () => {
        expect(extractPathFromUri("file:///Users/dev/my%20project")).toBe("/Users/dev/my project");
      });

      it("handles Windows-style paths", () => {
        expect(extractPathFromUri("file:///c:/Users/dev/project")).toBe("c:/Users/dev/project");
      });

      it("handles simple paths", () => {
        expect(extractPathFromUri("file:///tmp")).toBe("/tmp");
      });
    });

    describe("countTurns", () => {
      it("counts non-canceled requests", () => {
        const session: CopilotSession = {
          version: 3,
          sessionId: "test",
          creationDate: 0,
          lastMessageDate: 0,
          isImported: false,
          requests: [
            { requestId: "1", message: { text: "a", parts: [] }, response: [], isCanceled: false, timestamp: 0 },
            { requestId: "2", message: { text: "b", parts: [] }, response: [], isCanceled: true, timestamp: 0 },
            { requestId: "3", message: { text: "c", parts: [] }, response: [], isCanceled: false, timestamp: 0 },
          ],
        };
        expect(countTurns(session)).toBe(2);
      });

      it("returns 0 for empty requests", () => {
        const session: CopilotSession = {
          version: 3,
          sessionId: "test",
          creationDate: 0,
          lastMessageDate: 0,
          isImported: false,
          requests: [],
        };
        expect(countTurns(session)).toBe(0);
      });

      it("returns full count when none canceled", () => {
        const session: CopilotSession = {
          version: 3,
          sessionId: "test",
          creationDate: 0,
          lastMessageDate: 0,
          isImported: false,
          requests: [
            { requestId: "1", message: { text: "a", parts: [] }, response: [], isCanceled: false, timestamp: 0 },
            { requestId: "2", message: { text: "b", parts: [] }, response: [], isCanceled: false, timestamp: 0 },
          ],
        };
        expect(countTurns(session)).toBe(2);
      });
    });

    describe("extractFirstMessage", () => {
      it("extracts first message text", () => {
        const session: CopilotSession = {
          version: 3,
          sessionId: "test",
          creationDate: 0,
          lastMessageDate: 0,
          isImported: false,
          requests: [
            { requestId: "1", message: { text: "Help me refactor", parts: [] }, response: [], isCanceled: false, timestamp: 0 },
          ],
        };
        expect(extractFirstMessage(session)).toBe("Help me refactor");
      });

      it("returns placeholder for empty requests", () => {
        const session: CopilotSession = {
          version: 3,
          sessionId: "test",
          creationDate: 0,
          lastMessageDate: 0,
          isImported: false,
          requests: [],
        };
        expect(extractFirstMessage(session)).toBe("(No messages)");
      });

      it("truncates long messages to 100 chars", () => {
        const longMessage = "a".repeat(150);
        const session: CopilotSession = {
          version: 3,
          sessionId: "test",
          creationDate: 0,
          lastMessageDate: 0,
          isImported: false,
          requests: [
            { requestId: "1", message: { text: longMessage, parts: [] }, response: [], isCanceled: false, timestamp: 0 },
          ],
        };
        const result = extractFirstMessage(session);
        expect(result.length).toBeLessThanOrEqual(100);
        expect(result.endsWith("...")).toBe(true);
      });
    });
  });

  describe("CopilotSessionSource", () => {
    let source: CopilotSessionSource;
    const fixturesPath = path.join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");

    beforeAll(() => {
      process.env.VSCODE_STORAGE_PATH = fixturesPath;
      source = new CopilotSessionSource();
    });

    afterAll(() => {
      delete process.env.VSCODE_STORAGE_PATH;
    });

    describe("isAvailable", () => {
      it("returns true when storage directory exists", async () => {
        expect(await source.isAvailable()).toBe(true);
      });

      it("returns false when storage directory does not exist", async () => {
        const originalPath = process.env.VSCODE_STORAGE_PATH;
        process.env.VSCODE_STORAGE_PATH = "/nonexistent/path/that/does/not/exist";
        const localSource = new CopilotSessionSource();
        expect(await localSource.isAvailable()).toBe(false);
        process.env.VSCODE_STORAGE_PATH = originalPath;
      });
    });

    describe("listProjects", () => {
      it("returns list of workspaces with chat sessions", async () => {
        const projects = await source.listProjects();
        // Should include abc123..., xyz987..., emptysessions999 but NOT nosessions123 or invalidworkspace
        expect(projects.length).toBe(3);
      });

      it("includes folder (hash) and path properties", async () => {
        const projects = await source.listProjects();
        expect(projects[0]).toHaveProperty("folder");
        expect(projects[0]).toHaveProperty("path");
      });

      it("extracts path from workspace.json", async () => {
        const projects = await source.listProjects();
        const alpha = projects.find(p => p.folder === "abc123def456ghi789");
        expect(alpha?.path).toBe("/Users/test/projectalpha");
      });

      it("excludes workspaces without chatSessions folder", async () => {
        const projects = await source.listProjects();
        const noSessions = projects.find(p => p.folder === "nosessions123");
        expect(noSessions).toBeUndefined();
      });

      it("excludes workspaces without workspace.json", async () => {
        const projects = await source.listProjects();
        const invalid = projects.find(p => p.folder === "invalidworkspace");
        expect(invalid).toBeUndefined();
      });

      it("sorts projects alphabetically by path", async () => {
        const projects = await source.listProjects();
        const paths = projects.map(p => p.path);
        expect(paths).toEqual([...paths].sort());
      });
    });

    describe("listSessions", () => {
      it("returns sessions for valid workspace (skips malformed)", async () => {
        const sessions = await source.listSessions("abc123def456ghi789");
        // 4 files: 2 valid + 1 empty-requests + 1 malformed = 3 returned (malformed skipped)
        expect(sessions).toHaveLength(3);
      });

      it("includes required session properties", async () => {
        const sessions = await source.listSessions("abc123def456ghi789");
        const session = sessions[0];

        expect(session).toHaveProperty("sessionId");
        expect(session).toHaveProperty("source", "copilot");
        expect(session).toHaveProperty("projectPath");
        expect(session).toHaveProperty("firstMessage");
        expect(session).toHaveProperty("createdAt");
        expect(session).toHaveProperty("lastModifiedAt");
        expect(session).toHaveProperty("sizeBytes");
        expect(session).toHaveProperty("turnCount");
      });

      it("extracts first user message", async () => {
        const sessions = await source.listSessions("abc123def456ghi789");
        const session = sessions.find(s => s.sessionId === "11111111-1111-1111-1111-111111111111");
        expect(session?.firstMessage).toContain("refactor");
      });

      it("counts turns correctly (excludes canceled)", async () => {
        const sessions = await source.listSessions("xyz987uvw654rst321");
        const session = sessions.find(s => s.sessionId === "33333333-3333-3333-3333-333333333333");
        // 3 requests, 1 canceled = 2 turns
        expect(session?.turnCount).toBe(2);
      });

      it("handles empty requests array (TC-06)", async () => {
        const sessions = await source.listSessions("abc123def456ghi789");
        const emptySession = sessions.find(s => s.sessionId === "44444444-4444-4444-4444-444444444444");
        expect(emptySession).toBeDefined();
        expect(emptySession?.firstMessage).toBe("(No messages)");
        expect(emptySession?.turnCount).toBe(0);
      });

      it("skips malformed JSON files with warning (TC-07)", async () => {
        const sessions = await source.listSessions("abc123def456ghi789");
        // Malformed session 55555555 should not appear
        const malformedSession = sessions.find(s => s.sessionId === "55555555-5555-5555-5555-555555555555");
        expect(malformedSession).toBeUndefined();
        // Note: warning logged to console - not asserted in test
      });

      it("sorts sessions by lastModifiedAt descending", async () => {
        const sessions = await source.listSessions("abc123def456ghi789");
        if (sessions.length >= 2) {
          expect(sessions[0].lastModifiedAt.getTime())
            .toBeGreaterThanOrEqual(sessions[1].lastModifiedAt.getTime());
        }
      });

      it("throws for non-existent workspace", async () => {
        await expect(source.listSessions("nonexistent-hash"))
          .rejects.toThrow();
      });
    });

    describe("findSession", () => {
      it("returns workspace hash when session found", async () => {
        const hash = await source.findSession("11111111-1111-1111-1111-111111111111");
        expect(hash).toBe("abc123def456ghi789");
      });

      it("returns null when session not found", async () => {
        const hash = await source.findSession("00000000-0000-0000-0000-000000000000");
        expect(hash).toBeNull();
      });
    });

    describe("loadSession", () => {
      it("returns session data", async () => {
        const session = await source.loadSession(
          "11111111-1111-1111-1111-111111111111",
          "abc123def456ghi789"
        );
        expect(session.sessionId).toBe("11111111-1111-1111-1111-111111111111");
        expect(session.requests.length).toBe(2);
      });

      it("throws for non-existent session", async () => {
        await expect(source.loadSession("nonexistent", "abc123def456ghi789"))
          .rejects.toThrow();
      });
    });
  });
});
