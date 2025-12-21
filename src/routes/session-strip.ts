import { Router, Request, Response } from "express";
import { readFile, writeFile, copyFile, readdir, stat } from "fs/promises";
import path from "path";
import {
  findSessionFile,
  parseSession,
  applyRemovals,
} from "../services/session-clone.js";
import type { SessionEntry } from "../types.js";
import { config } from "../config.js";

const router = Router();

/**
 * Encode a project path the same way Claude Code does
 * Replace path separators with hyphens, remove leading/trailing hyphens
 */
function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/\//g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Find the most recently modified session in a project folder
 */
async function findMostRecentSession(projectPath: string): Promise<{ sessionId: string; filePath: string } | null> {
  const encodedPath = encodeProjectPath(projectPath);
  const projectDir = path.join(config.projectsDir, encodedPath);

  try {
    const files = await readdir(projectDir);
    const jsonlFiles = files.filter(f => f.endsWith(".jsonl") && !f.includes(".backup-"));

    if (jsonlFiles.length === 0) return null;

    // Find most recently modified
    let mostRecent: { file: string; mtime: number } | null = null;
    for (const file of jsonlFiles) {
      const filePath = path.join(projectDir, file);
      const stats = await stat(filePath);
      if (!mostRecent || stats.mtimeMs > mostRecent.mtime) {
        mostRecent = { file, mtime: stats.mtimeMs };
      }
    }

    if (!mostRecent) return null;

    const sessionId = mostRecent.file.replace(".jsonl", "");
    return { sessionId, filePath: path.join(projectDir, mostRecent.file) };
  } catch {
    return null;
  }
}

/**
 * POST /api/strip-current
 * Strip the most recent session for a given project path
 * Query params: project (required) - absolute path to project
 */
router.post("/strip-current", async (req: Request, res: Response) => {
  const projectPath = req.query.project as string;

  if (!projectPath) {
    res.status(400).json({ success: false, error: "Missing 'project' query parameter" });
    return;
  }

  const session = await findMostRecentSession(projectPath);
  if (!session) {
    res.status(404).json({ success: false, error: `No sessions found for project: ${projectPath}` });
    return;
  }

  try {
    // Create backup with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = session.filePath.replace(".jsonl", `.backup-${timestamp}.jsonl`);
    await copyFile(session.filePath, backupPath);

    // Read and parse session
    const content = await readFile(session.filePath, "utf-8");
    const entries = parseSession(content);

    // Apply 100% tool removal and 100% thinking removal
    const { toolCallsRemoved, thinkingBlocksRemoved } = applyRemovals(entries, {
      toolRemoval: "100",
      thinkingRemoval: "100",
    });

    // Write back in place
    const output = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await writeFile(session.filePath, output, "utf-8");

    res.json({
      success: true,
      sessionId: session.sessionId,
      project: projectPath,
      backupPath: path.basename(backupPath),
      toolCallsRemoved,
      thinkingBlocksRemoved,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/session/:id/strip
 * Backs up the session then removes all tool calls and thinking blocks in-place
 */
router.post("/:id/strip", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Find session file
    const sessionPath = await findSessionFile(id);

    // Create backup with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = sessionPath.replace(".jsonl", `.backup-${timestamp}.jsonl`);
    await copyFile(sessionPath, backupPath);

    // Read and parse session
    const content = await readFile(sessionPath, "utf-8");
    const entries = parseSession(content);

    // Apply 100% tool removal and 100% thinking removal
    const { toolCallsRemoved, thinkingBlocksRemoved } = applyRemovals(entries, {
      toolRemoval: "100",
      thinkingRemoval: "100",
    });

    // Write back in place
    const output = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await writeFile(sessionPath, output, "utf-8");

    res.json({
      success: true,
      sessionId: id,
      backupPath: path.basename(backupPath),
      toolCallsRemoved,
      thinkingBlocksRemoved,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/session/:id/backups
 * List all backups for a session
 */
router.get("/:id/backups", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const sessionPath = await findSessionFile(id);
    const dir = path.dirname(sessionPath);
    const { readdir, stat } = await import("fs/promises");

    const files = await readdir(dir);
    const backups = files
      .filter((f) => f.startsWith(id) && f.includes(".backup-"))
      .map(async (f) => {
        const fullPath = path.join(dir, f);
        const stats = await stat(fullPath);
        return {
          filename: f,
          createdAt: stats.mtime.toISOString(),
          sizeBytes: stats.size,
        };
      });

    res.json({ backups: await Promise.all(backups) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
