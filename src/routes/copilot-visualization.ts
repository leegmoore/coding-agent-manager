import { Router } from "express";
import validate from "express-zod-safe";
import { z } from "zod";
import { copilotStructureService } from "../services/copilot-structure.js";

export const copilotVisualizationRouter = Router();

const SessionParamsSchema = z.object({
  sessionId: z.string().min(1, "Session ID required")
});

const WorkspaceQuerySchema = z.object({
  workspace: z.string().min(1, "Workspace hash required")
});

const TurnParamsSchema = z.object({
  sessionId: z.string().min(1, "Session ID required"),
  turnIndex: z.string().regex(/^\d+$/, "Turn index must be a number")
});

// GET /api/copilot/session/:sessionId/structure
copilotVisualizationRouter.get(
  "/api/copilot/session/:sessionId/structure",
  validate({ params: SessionParamsSchema, query: WorkspaceQuerySchema }),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { workspace } = req.query as { workspace: string };
      const structure = await copilotStructureService.getStructure(sessionId, workspace);
      res.json(structure);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return res.status(404).json({ error: { message: "Session not found", code: "NOT_FOUND" } });
      }
      console.error("Failed to get Copilot session structure:", error);
      res.status(500).json({ error: { message: "Failed to load session structure" } });
    }
  }
);

// GET /api/copilot/session/:sessionId/turns
copilotVisualizationRouter.get(
  "/api/copilot/session/:sessionId/turns",
  validate({ params: SessionParamsSchema, query: WorkspaceQuerySchema }),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { workspace } = req.query as { workspace: string };
      const turns = await copilotStructureService.getTurns(sessionId, workspace);
      res.json(turns);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return res.status(404).json({ error: { message: "Session not found", code: "NOT_FOUND" } });
      }
      console.error("Failed to get Copilot session turns:", error);
      res.status(500).json({ error: { message: "Failed to load session turns" } });
    }
  }
);

// GET /api/copilot/session/:sessionId/turn/:turnIndex
copilotVisualizationRouter.get(
  "/api/copilot/session/:sessionId/turn/:turnIndex",
  validate({ params: TurnParamsSchema, query: WorkspaceQuerySchema }),
  async (req, res) => {
    try {
      const { sessionId, turnIndex } = req.params;
      const { workspace } = req.query as { workspace: string };
      const turn = await copilotStructureService.getTurn(sessionId, workspace, parseInt(turnIndex, 10));

      if (!turn) {
        return res.status(404).json({ error: { message: "Turn not found", code: "NOT_FOUND" } });
      }

      res.json(turn);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return res.status(404).json({ error: { message: "Session not found", code: "NOT_FOUND" } });
      }
      console.error("Failed to get Copilot turn:", error);
      res.status(500).json({ error: { message: "Failed to load turn" } });
    }
  }
);
