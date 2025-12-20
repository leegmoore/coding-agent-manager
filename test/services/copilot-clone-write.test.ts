import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { copyFile, rm, readFile, stat, unlink, readdir } from "fs/promises";
import { CopilotCloneService } from "../../src/services/copilot-clone.js";
import { VSCodeStateDb } from "../../src/lib/sqlite-state.js";
import type { CopilotSession } from "../../src/sources/copilot-types.js";

const FIXTURES = join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");
// Use xyz987uvw654rst321 which has the existing fixture with tool results
const TEST_WORKSPACE = "xyz987uvw654rst321";

describe("CopilotCloneService.writeSession", () => {
  let service: CopilotCloneService;
  let originalDbPath: string;

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = FIXTURES;
    originalDbPath = join(FIXTURES, TEST_WORKSPACE, "state.vscdb");
  });

  afterAll(() => {
    delete process.env.VSCODE_STORAGE_PATH;
  });

  beforeEach(async () => {
    service = new CopilotCloneService();
    // Backup original test DB
    await copyFile(originalDbPath, `${originalDbPath}.test-backup`).catch(() => {});
  });

  afterEach(async () => {
    // Restore original test DB
    await copyFile(`${originalDbPath}.test-backup`, originalDbPath).catch(() => {});
    await rm(`${originalDbPath}.test-backup`).catch(() => {});

    // Clean up any written test sessions
    const sessionPath = join(FIXTURES, TEST_WORKSPACE, "chatSessions", "test-clone-id.json");
    await unlink(sessionPath).catch(() => {});

    // Clean up backup files created during test
    const workspaceDir = join(FIXTURES, TEST_WORKSPACE);
    try {
      const files = await readdir(workspaceDir);
      for (const file of files) {
        if (file.startsWith("state.vscdb.backup-") && !file.endsWith(".test-backup")) {
          await unlink(join(workspaceDir, file)).catch(() => {});
        }
      }
    } catch {
      // Ignore errors
    }
  });

  function createTestSession(sessionId: string): CopilotSession {
    return {
      version: 3,
      sessionId,
      creationDate: Date.now(),
      lastMessageDate: Date.now(),
      customTitle: "Test Clone Session",
      isImported: false,
      requests: [
        {
          requestId: "req_1",
          message: { text: "Test message", parts: [] },
          response: [{ value: "Test response" }],
          isCanceled: false,
          timestamp: Date.now()
        }
      ]
    };
  }

  it("writes session JSON to chatSessions folder", async () => {
    const session = createTestSession("test-clone-id");

    const { sessionPath } = await service.writeSession(session, TEST_WORKSPACE);

    const content = await readFile(sessionPath, "utf-8");
    const written = JSON.parse(content);
    expect(written.sessionId).toBe("test-clone-id");
    expect(written.customTitle).toBe("Test Clone Session");
  });

  it("adds entry to state.vscdb index", async () => {
    const session = createTestSession("test-clone-id");

    await service.writeSession(session, TEST_WORKSPACE);

    const db = new VSCodeStateDb(join(FIXTURES, TEST_WORKSPACE));
    const index = db.readSessionIndex();
    expect(index.entries["test-clone-id"]).toBeDefined();
    expect(index.entries["test-clone-id"].title).toBe("Test Clone Session");
  });

  it("creates backup before modifying database", async () => {
    const session = createTestSession("test-clone-id");

    const { backupPath } = await service.writeSession(session, TEST_WORKSPACE);

    expect(backupPath).toContain("state.vscdb.backup-");
    await expect(stat(backupPath)).resolves.toBeDefined();
  });

  it("returns sessionPath and backupPath on success", async () => {
    const session = createTestSession("test-clone-id");

    const result = await service.writeSession(session, TEST_WORKSPACE);

    expect(result).toHaveProperty("sessionPath");
    expect(result).toHaveProperty("backupPath");
    expect(result.sessionPath).toContain("test-clone-id.json");
  });
});
