import { Router } from "express";
import validate from "express-zod-safe";
import { z } from "zod";
import { getSessionStructure } from "../services/session-structure.js";
import { SessionNotFoundError } from "../errors.js";

export const sessionStructureRouter = Router();

/**
 * Schema for session ID path parameter validation
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
 * GET /api/session/:id/structure
 *
 * Retrieve session structure for visualization.
 * Returns entries with type classification and token estimates.
 */
sessionStructureRouter.get(
  "/session/:id/structure",
  validate({ params: SessionIdParamsSchema }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const structure = await getSessionStructure(id);
      res.json(structure);
    } catch (err) {
      if (err instanceof SessionNotFoundError) {
        return res.status(404).json({
          error: { code: "NOT_FOUND", message: err.message },
        });
      }

      // Handle parse errors (malformed JSONL)
      if (err instanceof SyntaxError) {
        return res.status(500).json({
          error: { code: "PARSE_ERROR", message: "Failed to parse session file" },
        });
      }

      // Generic server error
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error("[session-structure] Error:", err);
      res.status(500).json({
        error: { code: "SERVER_ERROR", message },
      });
    }
  }
);
