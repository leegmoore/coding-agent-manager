import { Router, Request, Response } from "express";
import { readFile, writeFile, copyFile, readdir, stat } from "fs/promises";
import path from "path";
import {
  findSessionFile,
  parseSession,
  applyRemovals,
} from "../services/session-clone.js";

const router = Router();

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
