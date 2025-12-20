import Database from "better-sqlite3";
import { copyFile, unlink, readdir } from "fs/promises";
import { join, dirname } from "path";

/**
 * Entry in the VS Code chat session index.
 */
export interface ChatSessionIndexEntry {
  sessionId: string;
  title: string;
  lastMessageDate: number;
  isImported: boolean;
  initialLocation: "panel" | "editor";
  isEmpty: boolean;
}

/**
 * The full chat session index structure.
 */
export interface ChatSessionIndex {
  version: number;
  entries: Record<string, ChatSessionIndexEntry>;
}

/**
 * Manages VS Code's state.vscdb SQLite database.
 * Used to add cloned sessions to the session index.
 */
export class VSCodeStateDb {
  private dbPath: string;

  constructor(workspacePath: string) {
    this.dbPath = join(workspacePath, "state.vscdb");
  }

  /**
   * Get the database file path.
   */
  getDbPath(): string {
    return this.dbPath;
  }

  /**
   * Create a timestamped backup of the database.
   * Cleans up old backups keeping only the 3 most recent.
   * @returns Path to the backup file
   */
  async backup(): Promise<string> {
    const timestamp = Date.now();
    const backupPath = `${this.dbPath}.backup-${timestamp}`;

    await copyFile(this.dbPath, backupPath);
    await this.cleanupOldBackups();

    return backupPath;
  }

  /**
   * Keep only the 3 most recent backups.
   */
  private async cleanupOldBackups(): Promise<void> {
    const dir = dirname(this.dbPath);

    try {
      const files = await readdir(dir);
      const backups = files
        .filter(f => f.startsWith("state.vscdb.backup-"))
        .map(f => ({
          name: f,
          time: parseInt(f.split("backup-")[1] || "0", 10)
        }))
        .sort((a, b) => b.time - a.time);

      // Delete all but the 3 most recent
      for (const backup of backups.slice(3)) {
        await unlink(join(dir, backup.name)).catch(() => {
          // Ignore cleanup errors
        });
      }
    } catch {
      // Ignore if directory read fails
    }
  }

  /**
   * Read the current session index.
   * @returns The parsed session index or empty index if not found
   */
  readSessionIndex(): ChatSessionIndex {
    let db: ReturnType<typeof Database> | null = null;

    try {
      db = new Database(this.dbPath, { readonly: true });

      const row = db.prepare(
        "SELECT value FROM ItemTable WHERE key = 'chat.ChatSessionStore.index'"
      ).get() as { value: string } | undefined;

      if (!row) {
        return { version: 1, entries: {} };
      }

      return JSON.parse(row.value) as ChatSessionIndex;
    } catch (err: unknown) {
      const error = err as { code?: string };
      // Handle missing database file gracefully
      if (error.code === "SQLITE_CANTOPEN") {
        return { version: 1, entries: {} };
      }
      throw err;
    } finally {
      db?.close();
    }
  }

  /**
   * Check if a session ID already exists in the index.
   * @param sessionId - Session UUID to check
   * @returns true if session exists
   */
  sessionExists(sessionId: string): boolean {
    const index = this.readSessionIndex();
    return sessionId in index.entries;
  }

  /**
   * Add a new session to the index.
   * Throws if database is locked (SQLITE_BUSY).
   * @param entry - Session index entry to add
   */
  addSessionToIndex(entry: ChatSessionIndexEntry): void {
    const db = new Database(this.dbPath);

    try {
      // Read current index
      const row = db.prepare(
        "SELECT value FROM ItemTable WHERE key = 'chat.ChatSessionStore.index'"
      ).get() as { value: string } | undefined;

      const index: ChatSessionIndex = row
        ? JSON.parse(row.value)
        : { version: 1, entries: {} };

      // Add new entry
      index.entries[entry.sessionId] = entry;

      // Write back - use INSERT OR REPLACE to handle missing key
      const stmt = db.prepare(
        "INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)"
      );
      stmt.run("chat.ChatSessionStore.index", JSON.stringify(index));
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === "SQLITE_BUSY" || err.message?.includes("database is locked")) {
        throw new Error("Cannot write to VS Code database - please close VS Code and try again");
      }
      throw error;
    } finally {
      db.close();
    }
  }
}
