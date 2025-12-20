import { Router } from "express";
import validate from "express-zod-safe";
import { CopilotCloneRequestSchema } from "../schemas/copilot-clone.js";
import { copilotCloneService } from "../services/copilot-clone.js";
import { getSessionSource } from "../sources/index.js";
import type { CopilotSessionSource } from "../sources/copilot-source.js";

export const copilotCloneRouter = Router();

// POST /api/copilot/clone
copilotCloneRouter.post(
  "/api/copilot/clone",
  validate({ body: CopilotCloneRequestSchema }),
  async (req, res) => {
    try {
      const { sessionId, workspaceHash, options = {} } = req.body;

      const result = await copilotCloneService.clone(sessionId, workspaceHash, options);

      res.json({
        success: true,
        session: {
          sessionId: result.session.sessionId,
          customTitle: result.session.customTitle,
        },
        stats: result.stats,
        sessionPath: result.sessionPath,
        backupPath: result.backupPath,
        writtenToDisk: result.writtenToDisk,
        debugLogPath: result.debugLogPath,
      });
    } catch (error) {
      const err = error as Error;

      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return res.status(404).json({ error: { message: "Session not found", code: "NOT_FOUND" } });
      }

      if (err.message?.includes("close VS Code") || err.message?.includes("SQLITE_BUSY")) {
        return res.status(409).json({
          error: {
            message: "Cannot write to VS Code database - please close VS Code and try again",
            code: "VSCODE_LOCKED"
          }
        });
      }

      if (err.message?.includes("compression") || err.message?.includes("LLM")) {
        console.error("Copilot compression error:", error);
      }

      console.error("Copilot clone failed:", error);
      res.status(500).json({ error: { message: "Clone operation failed", code: "CLONE_ERROR" } });
    }
  }
);

// GET /api/copilot/workspaces - List available target workspaces
copilotCloneRouter.get("/api/copilot/workspaces", async (req, res) => {
  try {
    const source = getSessionSource("copilot") as CopilotSessionSource;
    const projects = await source.listProjects();
    res.json({ workspaces: projects });
  } catch (error) {
    console.error("Failed to list workspaces:", error);
    res.status(500).json({ error: { message: "Failed to list workspaces", code: "LIST_ERROR" } });
  }
});
