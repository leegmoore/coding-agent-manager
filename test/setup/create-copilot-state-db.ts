import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";

const fixturesPath = join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");

/**
 * Create a test state.vscdb SQLite database with sample session index.
 */
export function createTestStateDb(workspaceHash: string): void {
  const workspacePath = join(fixturesPath, workspaceHash);
  const dbPath = join(workspacePath, "state.vscdb");

  // Ensure directory exists
  if (!existsSync(workspacePath)) {
    mkdirSync(workspacePath, { recursive: true });
  }

  const db = new Database(dbPath);

  // Create table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ItemTable (
      key TEXT UNIQUE ON CONFLICT REPLACE,
      value BLOB
    )
  `);

  // Insert sample session index
  const index = {
    version: 1,
    entries: {
      "existing-session-111": {
        sessionId: "existing-session-111",
        title: "Existing Test Session",
        lastMessageDate: Date.now(),
        isImported: false,
        initialLocation: "panel",
        isEmpty: false
      }
    }
  };

  db.prepare(`
    INSERT INTO ItemTable (key, value) VALUES (?, ?)
  `).run("chat.ChatSessionStore.index", JSON.stringify(index));

  db.close();
}

// Create test databases for existing fixture workspaces
if (process.argv[1] && process.argv[1].includes("create-copilot-state-db")) {
  createTestStateDb("xyz987uvw654rst321");
  createTestStateDb("abc123def456ghi789");
  console.log("Test state.vscdb files created");
}
