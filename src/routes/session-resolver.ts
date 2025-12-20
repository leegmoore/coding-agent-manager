import { Router } from "express";
import validate from "express-zod-safe";
import { z } from "zod";
import { resolveSession } from "../lib/source-resolver.js";

export const sessionResolverRouter = Router();

const ResolveQuerySchema = z.object({
  sessionId: z.string().min(1, "Session ID required")
});

// GET /api/resolve-session?sessionId=xxx
sessionResolverRouter.get(
  "/api/resolve-session",
  validate({ query: ResolveQuerySchema }),
  async (req, res) => {
    try {
      const { sessionId } = req.query as { sessionId: string };
      const resolved = await resolveSession(sessionId);

      if (!resolved) {
        return res.status(404).json({
          error: { message: "Session not found in any source", code: "NOT_FOUND" }
        });
      }

      res.json(resolved);
    } catch (error) {
      console.error("Session resolution failed:", error);
      res.status(500).json({
        error: { message: "Failed to resolve session", code: "RESOLUTION_ERROR" }
      });
    }
  }
);
