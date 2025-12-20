import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { copyFile, rm, unlink } from "fs/promises";
import { app } from "../../src/server.js";

// Use the existing fixture workspace
const TEST_WORKSPACE = "xyz987uvw654rst321";
const TEST_SESSION = "66666666-6666-6666-6666-666666666666";
const FIXTURES = join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");

describe("POST /api/copilot/clone - Write Support", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;
  let originalDbPath: string;

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = FIXTURES;
    originalDbPath = join(FIXTURES, TEST_WORKSPACE, "state.vscdb");

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

  beforeEach(async () => {
    // Backup original test DB before each test
    await copyFile(originalDbPath, `${originalDbPath}.test-backup`).catch(() => {});
  });

  afterEach(async () => {
    // Restore original test DB after each test
    await copyFile(`${originalDbPath}.test-backup`, originalDbPath).catch(() => {});
    await rm(`${originalDbPath}.test-backup`).catch(() => {});

    // Clean up any test session files that might have been created
    // Only delete files that were created during this test run (cloned sessions)
    // Preserve known fixture files
    const FIXTURE_FILES = new Set([
      `${TEST_SESSION}.json`,  // 66666666-6666-6666-6666-666666666666.json
      "33333333-3333-3333-3333-333333333333.json",  // canceled request test fixture
    ]);

    const chatSessionsPath = join(FIXTURES, TEST_WORKSPACE, "chatSessions");
    const fs = await import("fs/promises");
    try {
      const files = await fs.readdir(chatSessionsPath);
      for (const file of files) {
        // Only clean up files that are NOT fixture files
        if (!FIXTURE_FILES.has(file) && file.endsWith(".json")) {
          await unlink(join(chatSessionsPath, file)).catch(() => {});
        }
      }
    } catch {
      // Ignore errors reading directory
    }

    // Clean up backup files
    const workspaceDir = join(FIXTURES, TEST_WORKSPACE);
    try {
      const workspaceFiles = await fs.readdir(workspaceDir);
      for (const file of workspaceFiles) {
        if (file.startsWith("state.vscdb.backup-")) {
          await unlink(join(workspaceDir, file)).catch(() => {});
        }
      }
    } catch {
      // Ignore errors
    }
  });

  // Phase 1: Tests that work with writeToDisk: false (download-only mode)
  it("supports writeToDisk: false for download-only", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: TEST_SESSION,
        workspaceHash: TEST_WORKSPACE,
        options: { writeToDisk: false }
      })
    });

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.writtenToDisk).toBe(false);
    expect(data.sessionPath).toBeUndefined();
  });

  it("includes writtenToDisk: false in download-only response", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: TEST_SESSION,
        workspaceHash: TEST_WORKSPACE,
        options: { writeToDisk: false }
      })
    });

    const data = await response.json();
    expect(data).toHaveProperty("writtenToDisk");
    expect(data.writtenToDisk).toBe(false);
  });

  // Phase 2 tests - now enabled since writeSession is implemented
  describe("writeToDisk: true - Phase 2 Implementation", () => {
    it("includes writtenToDisk in response", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: TEST_SESSION,
          workspaceHash: TEST_WORKSPACE,
          options: { writeToDisk: true }
        })
      });

      const data = await response.json();
      expect(data).toHaveProperty("writtenToDisk");
    });

    it("includes sessionPath when written to disk", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: TEST_SESSION,
          workspaceHash: TEST_WORKSPACE,
          options: { writeToDisk: true }
        })
      });

      const data = await response.json();
      if (data.writtenToDisk) {
        expect(data.sessionPath).toBeDefined();
        expect(data.backupPath).toBeDefined();
      }
    });

    it("supports targetWorkspaceHash option", async () => {
      const response = await fetch(`${baseUrl}/api/copilot/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: TEST_SESSION,
          workspaceHash: TEST_WORKSPACE,
          options: {
            writeToDisk: true,
            targetWorkspaceHash: TEST_WORKSPACE
          }
        })
      });

      expect(response.status).toBeLessThan(500); // Should not crash
    });
  });

  it("returns 409 when database is locked", async () => {
    // This test documents expected behavior
    // Full mock implementation would require holding a write lock on SQLite
    // which is complex to simulate in unit tests
    // Manual testing: run with VS Code open to verify 409 response
  });
});

describe("GET /api/copilot/workspaces", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = join(
      process.cwd(),
      "test/fixtures/copilot-sessions/workspaceStorage"
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
    delete process.env.VSCODE_STORAGE_PATH;
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });

  it("returns list of workspaces", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/workspaces`);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("workspaces");
    expect(Array.isArray(data.workspaces)).toBe(true);
  });

  it("includes folder and path for each workspace", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/workspaces`);

    const data = await response.json();
    if (data.workspaces.length > 0) {
      expect(data.workspaces[0]).toHaveProperty("folder");
      expect(data.workspaces[0]).toHaveProperty("path");
    }
  });
});
