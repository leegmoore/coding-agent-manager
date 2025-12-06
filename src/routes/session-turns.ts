import { Router } from "express";
import validate from "express-zod-safe";
import { z } from "zod";
import { getSessionTurns } from "../services/session-turns.js";
import { SessionNotFoundError } from "../errors.js";

export const sessionTurnsRouter = Router();

/**
 * Schema for session ID path parameter validation.
 */
const SessionIdParamsSchema = z.object({
  id: z
    .string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      "Invalid session ID format"
    ),
});

/**
 * GET /api/session/:id/turns
 *
 * Return turn-by-turn token statistics for a session.
 */
sessionTurnsRouter.get(
  "/session/:id/turns",
  validate({ params: SessionIdParamsSchema }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const response = await getSessionTurns(id);
      res.json(response);
    } catch (err) {
      if (err instanceof SessionNotFoundError) {
        return res.status(404).json({
          error: { code: "NOT_FOUND", message: err.message },
        });
      }

      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: err.message },
        });
      }

      const message = err instanceof Error ? err.message : "Internal server error";
      console.error("[session-turns] Error:", err);
      res.status(500).json({
        error: { code: "SERVER_ERROR", message },
      });
    }
  }
);

