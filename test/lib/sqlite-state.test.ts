import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { copyFile, rm, stat, readdir } from "fs/promises";
import { VSCodeStateDb, ChatSessionIndexEntry } from "../../src/lib/sqlite-state.js";

const FIXTURES = join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");
// Use xyz987uvw654rst321 which has the existing fixture with tool results
const TEST_WORKSPACE = "xyz987uvw654rst321";

describe("VSCodeStateDb", () => {
  let db: VSCodeStateDb;
  let originalDbPath: string;

  beforeAll(() => {
    originalDbPath = join(FIXTURES, TEST_WORKSPACE, "state.vscdb");
  });

  beforeEach(async () => {
    // Backup original test DB before each test
    await copyFile(originalDbPath, `${originalDbPath}.test-backup`).catch(() => {});
    db = new VSCodeStateDb(join(FIXTURES, TEST_WORKSPACE));
  });

  afterEach(async () => {
    // Restore original test DB after each test
    await copyFile(`${originalDbPath}.test-backup`, originalDbPath).catch(() => {});
    await rm(`${originalDbPath}.test-backup`).catch(() => {});
  });

  describe("getDbPath", () => {
    it("returns correct database path", () => {
      const expected = join(FIXTURES, TEST_WORKSPACE, "state.vscdb");
      expect(db.getDbPath()).toBe(expected);
    });
  });

  describe("backup", () => {
    it("creates timestamped backup file", async () => {
      const backupPath = await db.backup();

      expect(backupPath).toContain("state.vscdb.backup-");
      await expect(stat(backupPath)).resolves.toBeDefined();
    });

    it("keeps only 3 most recent backups", async () => {
      // Create 4 backups
      await db.backup();
      await new Promise(r => setTimeout(r, 10)); // Small delay for unique timestamps
      await db.backup();
      await new Promise(r => setTimeout(r, 10));
      await db.backup();
      await new Promise(r => setTimeout(r, 10));
      await db.backup();

      // Check that only 3 remain
      const files = await readdir(join(FIXTURES, TEST_WORKSPACE));
      const backups = files.filter(f => f.startsWith("state.vscdb.backup-"));
      expect(backups.length).toBeLessThanOrEqual(3);
    });
  });

  describe("readSessionIndex", () => {
    it("returns index with version and entries", () => {
      const index = db.readSessionIndex();

      expect(index).toHaveProperty("version");
      expect(index).toHaveProperty("entries");
      expect(typeof index.version).toBe("number");
      expect(typeof index.entries).toBe("object");
    });

    it("returns empty entries if key not found", () => {
      // Use a workspace without the index key
      const emptyDb = new VSCodeStateDb(join(FIXTURES, "emptysessions999"));
      const index = emptyDb.readSessionIndex();

      expect(index.version).toBe(1);
      expect(Object.keys(index.entries)).toHaveLength(0);
    });
  });

  describe("sessionExists", () => {
    it("returns true for existing session", () => {
      // Session added by fixture setup
      expect(db.sessionExists("existing-session-111")).toBe(true);
    });

    it("returns false for non-existent session", () => {
      expect(db.sessionExists("nonexistent-uuid")).toBe(false);
    });
  });

  describe("addSessionToIndex", () => {
    const newEntry: ChatSessionIndexEntry = {
      sessionId: "new-cloned-session",
      title: "Test Clone",
      lastMessageDate: Date.now(),
      isImported: false,
      initialLocation: "panel",
      isEmpty: false
    };

    it("adds session to index", () => {
      db.addSessionToIndex(newEntry);

      const index = db.readSessionIndex();
      expect(index.entries["new-cloned-session"]).toBeDefined();
      expect(index.entries["new-cloned-session"].title).toBe("Test Clone");
    });

    it("preserves existing sessions when adding new one", () => {
      db.addSessionToIndex(newEntry);

      const index = db.readSessionIndex();
      // Original session should still exist
      expect(index.entries["existing-session-111"]).toBeDefined();
      // New session should also exist
      expect(index.entries["new-cloned-session"]).toBeDefined();
    });

    it("overwrites session with same ID", () => {
      const updatedEntry = { ...newEntry, title: "Updated Title" };
      db.addSessionToIndex(newEntry);
      db.addSessionToIndex(updatedEntry);

      const index = db.readSessionIndex();
      expect(index.entries["new-cloned-session"].title).toBe("Updated Title");
    });
  });
});
